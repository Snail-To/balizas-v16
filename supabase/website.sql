-- Latest map positions only; overwritten on each successful collection.
create table public.v16_live_snapshot (
    singleton boolean primary key default true check(singleton),
    beacons jsonb not null,
    collected_at timestamptz not null,
    published_at timestamptz not null
);
alter table public.v16_live_snapshot enable row level security;
revoke all on public.v16_live_snapshot from public, anon, authenticated;
grant select on public.v16_live_snapshot to service_role;

-- Aggregate in SQL so PostgREST's default row limit cannot truncate a full day.
create function public.v16_daily_stats(p_day date)
returns jsonb language sql stable security invoker
set search_path = pg_catalog, public
as $$
    with hours as (
        select h.*, (select count(*) from public.v16_collection_runs r
            where r.succeeded and r.requested_at >= h.hour_start and r.requested_at < h.hour_end) as samples
        from public.v16_hourly_counts(p_day) h
    )
    select jsonb_build_object(
        'day', p_day, 'timeZone', 'Europe/Madrid', 'partial', true,
        'total', (select coalesce(sum(activations), 0) from hours),
        'hours', (select jsonb_agg(to_jsonb(h) order by hour_start) from hours h),
        'latest', (select jsonb_build_object('requested_at', requested_at, 'succeeded', succeeded)
            from public.v16_collection_runs order by requested_at desc limit 1),
        'collectionStartedAt', (select min(first_seen_at) from public.v16_events)
    );
$$;
revoke all on function public.v16_daily_stats(date) from public, anon, authenticated;
grant execute on function public.v16_daily_stats(date) to service_role;
