begin;

-- One row per published activation event, not per polling request or device.
create table if not exists public.v16_events (
    source text not null,
    event_id text not null,
    creation_reference text not null,
    started_at timestamptz,
    first_seen_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now(),
    primary key (source, event_id),
    constraint v16_reference_check check (creation_reference like 'V16\_%' escape '\'),
    constraint v16_seen_order_check check (last_seen_at >= first_seen_at)
);

create index if not exists v16_events_started_at_idx
    on public.v16_events (started_at);

-- Successful AND failed attempts are needed to distinguish missing coverage
-- from a successfully observed interval with no new events.
create table if not exists public.v16_collection_runs (
    id bigint generated always as identity primary key,
    requested_at timestamptz not null default now(),
    finished_at timestamptz,
    succeeded boolean not null default false,
    feed_published_at timestamptz,
    event_count integer check (event_count >= 0),
    error_code text,
    constraint v16_run_order_check check (finished_at >= requested_at)
);

create index if not exists v16_collection_runs_requested_at_idx
    on public.v16_collection_runs (requested_at);

-- Writes and raw history are server-only. The browser will use our aggregate API.
alter table public.v16_events enable row level security;
alter table public.v16_collection_runs enable row level security;
revoke all on table public.v16_events from public, anon, authenticated;
revoke all on table public.v16_collection_runs from public, anon, authenticated;
revoke all on sequence public.v16_collection_runs_id_seq from public, anon, authenticated;
grant select, insert, update on table public.v16_events to service_role;
grant select, insert, update, delete on table public.v16_collection_runs to service_role;
grant usage, select on sequence public.v16_collection_runs_id_seq to service_role;

-- Uses real hour boundaries: on DST transitions Madrid has 23 or 25 hours.
-- Counts are observations, not a guarantee of complete collection coverage.
create or replace function public.v16_hourly_counts(p_day date)
returns table (
    hour_start timestamptz,
    hour_end timestamptz,
    activations bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
    with bounds as (
        select
            p_day::timestamp at time zone 'Europe/Madrid' as day_start,
            (p_day + 1)::timestamp at time zone 'Europe/Madrid' as day_end
    ), hours as (
        select h as bucket_start, h + interval '1 hour' as bucket_end
        from bounds,
            lateral generate_series(day_start, day_end - interval '1 hour', interval '1 hour') h
    )
    select h.bucket_start, h.bucket_end, count(e.event_id)
    from hours h
    left join public.v16_events e
        on e.started_at >= h.bucket_start and e.started_at < h.bucket_end
    group by h.bucket_start, h.bucket_end
    order by h.bucket_start;
$$;

revoke all on function public.v16_hourly_counts(date) from public, anon, authenticated;
grant execute on function public.v16_hourly_counts(date) to service_role;

commit;
