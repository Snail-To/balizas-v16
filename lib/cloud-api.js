const config = require('./cloud-config.json');

// Only a public anon key is used here. The Edge Function owns privileged reads.
async function readCloud(view, day) {
    const url = new URL(config.url);
    url.searchParams.set('view', view);
    if (day) url.searchParams.set('day', day);
    const response = await fetch(url, {
        headers: { apikey: config.anonKey, Authorization: `Bearer ${config.anonKey}` },
        signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new Error(`Cloud data HTTP ${response.status}`);
    return response.json();
}

function endpoint(view) {
    return async (request, response) => {
        if (request.method !== 'GET') {
            response.setHeader('Allow', 'GET');
            return response.status(405).json({ error: 'Method Not Allowed' });
        }
        const day = view === 'stats' && new URL(request.url || '/', 'http://localhost').searchParams.get('day');
        const date = day && new Date(day + 'T00:00:00Z');
        if (day && (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day)) {
            return response.status(400).json({ error: 'Invalid date' });
        }
        try {
            const data = await readCloud(view, day);
            response.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=60');
            if (view === 'map') {
                if (!Array.isArray(data.beacons) || !Number.isFinite(Date.parse(data.updatedAt))) throw new Error('Invalid map snapshot');
                response.setHeader('X-Beacons-Updated-At', data.updatedAt);
                const sourceTimestamp = Number.isFinite(Date.parse(data.publishedAt)) ? data.publishedAt : data.updatedAt;
                response.setHeader('X-Beacons-Published-At', sourceTimestamp);
                response.setHeader('X-Beacons-Stale', String(Date.now() - Date.parse(sourceTimestamp) > 180000));
                return response.status(200).json(data.beacons);
            }
            if (!Array.isArray(view === 'peaks' ? data.days : data.hours)) throw new Error('Invalid statistics');
            return response.status(200).json(data);
        } catch {
            response.setHeader('Cache-Control', 'no-store');
            return response.status(503).json({ error: 'Cloud data temporarily unavailable' });
        }
    };
}

module.exports = { endpoint };
