create or replace function public.v16_recent_peaks()
returns jsonb
language sql stable security invoker
set search_path = pg_catalog
as $$
    with today as (
        select (now() at time zone 'Europe/Madrid')::date as day
    ), days as (
        select today.day - offsets.n as day
        from today cross join generate_series(0, 29) as offsets(n)
    ), hours as (
        select d.day, h.*
        from days d cross join lateral public.v16_hourly_counts(d.day) h
    ), daily as (
        select day, sum(activations) as total, nullif(max(activations), 0) as peak
        from hours group by day
    ), active as (
        select distinct on (d.day) d.day, r.event_count, r.requested_at
        from days d
        join public.v16_collection_runs r
          on r.requested_at >= d.day::timestamp at time zone 'Europe/Madrid'
         and r.requested_at < (d.day + 1)::timestamp at time zone 'Europe/Madrid'
        where r.succeeded and r.event_count is not null
        order by d.day, r.event_count desc, r.requested_at
    )
    select jsonb_build_object('days', jsonb_agg(jsonb_build_object(
        'day', d.day,
        'total', case when d.total > 0 or a.day is not null then d.total end,
        'peak', coalesce(d.peak, case when a.day is not null then 0 end),
        'hours', coalesce((select jsonb_agg(jsonb_build_array(h.hour_start, h.hour_end) order by h.hour_start)
            from hours h where h.day = d.day and h.activations = d.peak), '[]'::jsonb),
        'activePeak', a.event_count,
        'activeAt', a.requested_at
    ) order by d.day desc))
    from daily d left join active a using (day);
$$;

revoke all on function public.v16_recent_peaks() from public, anon, authenticated;
grant execute on function public.v16_recent_peaks() to service_role;
