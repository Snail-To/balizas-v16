const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'GET') return new Response('{}', { status: 405, headers: cors });
  const base = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const url = new URL(req.url);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
  const day = url.searchParams.get('day') || today;
  const parsed = new Date(day + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) {
    return new Response(JSON.stringify({ error: 'Invalid date' }), { status: 400, headers: cors });
  }
  try {
    if (url.searchParams.get('view') === 'map') {
      const response = await fetch(`${base}/rest/v1/v16_live_snapshot?select=beacons,collected_at,published_at&singleton=eq.true`, { headers, signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('map_query_failed');
      const rows = await response.json();
      if (!rows[0]) throw new Error('no_snapshot');
      return new Response(JSON.stringify({ beacons: rows[0].beacons, updatedAt: rows[0].collected_at, publishedAt: rows[0].published_at }), { headers: cors });
    }
    const response = await fetch(`${base}/rest/v1/rpc/v16_daily_stats`, {
      method: 'POST', headers, body: JSON.stringify({ p_day: day }), signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('stats_query_failed');
    return new Response(JSON.stringify(await response.json()), { headers: cors });
  } catch {
    return new Response(JSON.stringify({ error: 'Cloud data temporarily unavailable' }), { status: 503, headers: cors });
  }
});
