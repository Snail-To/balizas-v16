-- Runs as the cron job owner (postgres), never as an anonymous API caller.
create table baliza_private.collector_state (
    singleton boolean primary key default true check (singleton),
    failures integer not null default 0,
    next_attempt_at timestamptz not null default now()
);
alter table baliza_private.collector_state enable row level security;
revoke all on baliza_private.collector_state from public, anon, authenticated;
insert into baliza_private.collector_state(singleton) values (true);

create function baliza_private.collect_v16()
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, extensions
as $$
declare
    response extensions.http_response;
    document xml;
    published timestamptz;
    run_id bigint;
    observed integer;
    failure_count integer;
    error_state text;
    retry_seconds integer;
    retry_header text;
begin
    if not pg_try_advisory_xact_lock(17950256) then
        return jsonb_build_object('skipped', 'already_running');
    end if;
    if (select next_attempt_at > clock_timestamp() from baliza_private.collector_state) then
        return jsonb_build_object('skipped', 'waiting');
    end if;

    insert into public.v16_collection_runs default values returning id into run_id;
    begin
        perform set_config('http.curlopt_timeout_ms', '12000', true);
        perform set_config('http.curlopt_connecttimeout_ms', '5000', true);
        perform set_config('http.curlopt_useragent', 'balizas-v16-history/1.0', true);
        response := extensions.http_get('https://nap.dgt.es/datex2/v3/dgt/SituationPublication/datex2_v37.xml');
        if response.status <> 200 then
            -- Respect Retry-After, including HTTP-date values, when supplied.
            select value into retry_header from unnest(response.headers) where lower(field) = 'retry-after' limit 1;
            if retry_header is not null then
                begin
                    if retry_header ~ '^[0-9]+$' then
                        retry_seconds := least(retry_header::numeric, 86400)::integer;
                    else
                        retry_seconds := greatest(0, extract(epoch from (retry_header::timestamptz - clock_timestamp())))::integer;
                    end if;
                exception when others then retry_seconds := null;
                end;
            end if;
            raise exception 'upstream_http_%', response.status;
        end if;
        if octet_length(response.content) > 8388608 then
            raise exception 'upstream_too_large';
        end if;
        if response.content ~* '<!DOCTYPE' then
            raise exception 'doctype_not_allowed';
        end if;
        document := xmlparse(document response.content);
        published := nullif((xpath('string(/*[local-name()="payload"]/*[local-name()="publicationTime"])', document))[1]::text, '')::timestamptz;
        if published is null or published < clock_timestamp() - interval '10 minutes'
            or published > clock_timestamp() + interval '5 minutes' then
            raise exception 'invalid_or_stale_publication';
        end if;

        insert into public.v16_events as existing
            (source, event_id, creation_reference, started_at, first_seen_at, last_seen_at)
        select source, event_id, reference, nullif(start_time, '')::timestamptz, now(), now()
        from xmltable(
            '/*[local-name()="payload"]/*[local-name()="situation"]/*[local-name()="situationRecord"]'
            passing document columns
                source text path '*[local-name()="source"]/*[local-name()="sourceIdentification"]',
                event_id text path '@id',
                reference text path '*[local-name()="situationRecordCreationReference"]',
                start_time text path '*[local-name()="validity"]/*[local-name()="validityTimeSpecification"]/*[local-name()="overallStartTime"]',
                validity text path '*[local-name()="validity"]/*[local-name()="validityStatus"]'
        ) records
        where source = 'DGT3.0' and starts_with(reference, 'V16_')
            and event_id is not null and validity = 'active'
        on conflict (source, event_id) do update
            set started_at = coalesce(excluded.started_at, existing.started_at),
                creation_reference = excluded.creation_reference,
                last_seen_at = excluded.last_seen_at;
        get diagnostics observed = row_count;
        insert into public.v16_live_snapshot(singleton, beacons, collected_at, published_at)
        select true, coalesce(jsonb_agg(jsonb_build_object(
            'id', event_id, 'lat', lat, 'lon', lon, 'time', start_time,
            'type', obstruction, 'location', coalesce(road, 'Ubicación desconocida')
        )), '[]'::jsonb), clock_timestamp(), published
        from xmltable(
            '/*[local-name()="payload"]/*[local-name()="situation"]/*[local-name()="situationRecord"]'
            passing document columns
                source text path '*[local-name()="source"]/*[local-name()="sourceIdentification"]',
                event_id text path '@id',
                reference text path '*[local-name()="situationRecordCreationReference"]',
                validity text path '*[local-name()="validity"]/*[local-name()="validityStatus"]',
                start_time text path '*[local-name()="validity"]/*[local-name()="validityTimeSpecification"]/*[local-name()="overallStartTime"]',
                lat double precision path '(.//*[local-name()="latitude"])[1]',
                lon double precision path '(.//*[local-name()="longitude"])[1]',
                road text path '(.//*[local-name()="roadName"])[1]',
                obstruction text path '(.//*[local-name()="vehicleObstructionType"])[1]'
        ) positions
        where source = 'DGT3.0' and starts_with(reference, 'V16_') and validity = 'active'
            and event_id is not null and lat between -90 and 90 and lon between -180 and 180
        on conflict(singleton) do update set beacons=excluded.beacons,
            collected_at=excluded.collected_at, published_at=excluded.published_at;
        update public.v16_collection_runs set succeeded = true, finished_at = clock_timestamp(),
            feed_published_at = published, event_count = observed where id = run_id;
        update baliza_private.collector_state set failures = 0,
            next_attempt_at = date_trunc('minute', now()) + interval '1 minute';
    exception when others then
        get stacked diagnostics error_state = returned_sqlstate;
        update public.v16_collection_runs set finished_at = clock_timestamp(),
            error_code = left(error_state || ':' || sqlerrm, 200) where id = run_id;
        update baliza_private.collector_state set failures = least(failures + 1, 10)
            returning failures into failure_count;
        update baliza_private.collector_state set next_attempt_at = clock_timestamp()
            + make_interval(secs => greatest(coalesce(retry_seconds, 0), least(3600, (60 * power(2, failure_count))::integer)));
    end;

    -- Keep metadata logs bounded; event history is not deleted.
    delete from public.v16_collection_runs where requested_at < now() - interval '14 days';
    delete from cron.job_run_details where jobid in (select jobid from cron.job where jobname='balizas-v16-collect-every-minute') and start_time < now() - interval '14 days';
    return (select jsonb_build_object('success', succeeded, 'observed', event_count, 'error', error_code)
        from public.v16_collection_runs where id = run_id);
end;
$$;
revoke all on function baliza_private.collect_v16() from public, anon, authenticated, service_role;

