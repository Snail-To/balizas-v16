const { XMLParser } = require('fast-xml-parser');

const DGT_FEED_URL = 'https://nap.dgt.es/datex2/v3/dgt/SituationPublication/datex2_v36.xml';
const REQUEST_TIMEOUT_MS = 12000;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

class ResponseTooLargeError extends Error {}

async function readResponseText(response) {
    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
        throw new ResponseTooLargeError();
    }

    if (!response.body) {
        return '';
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let byteCount = 0;
    let text = '';
    let isDone = false;

    while (!isDone) {
        const { done, value } = await reader.read();
        isDone = done;
        if (done) {
            break;
        }

        byteCount += value.byteLength;
        if (byteCount > MAX_RESPONSE_BYTES) {
            await reader.cancel();
            throw new ResponseTooLargeError();
        }

        text += decoder.decode(value, { stream: true });
    }

    return text + decoder.decode();
}

function findFirst(node, key) {
    if (!node || typeof node !== 'object') {
        return undefined;
    }

    if (Object.prototype.hasOwnProperty.call(node, key)) {
        return node[key];
    }

    for (const value of Object.values(node)) {
        const result = findFirst(value, key);
        if (result !== undefined) {
            return result;
        }
    }

    return undefined;
}

function parseBeacons(xml) {
    const parser = new XMLParser({
        ignoreAttributes: false,
        removeNSPrefix: true,
        attributeNamePrefix: '@_'
    });
    const document = parser.parse(xml);
    const situations = document.payload?.situation || [];
    const situationList = Array.isArray(situations) ? situations : [situations];

    return situationList.flatMap((situation, situationIndex) => {
        const records = situation.situationRecord || [];
        const recordList = Array.isArray(records) ? records : [records];

        return recordList.flatMap((record, recordIndex) => {
            if (
                findFirst(record, 'causeType') !== 'vehicleObstruction'
                || findFirst(record, 'validityStatus') !== 'active'
            ) {
                return [];
            }

            const lat = Number(findFirst(record, 'latitude'));
            const lon = Number(findFirst(record, 'longitude'));
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
                return [];
            }

            const location = [
                findFirst(record, 'roadName'),
                findFirst(record, 'municipality'),
                findFirst(record, 'province')
            ].filter(Boolean).join(', ');

            return [{
                id: record['@_id'] || situation['@_id'] || `beacon_${situationIndex}_${recordIndex}`,
                lat,
                lon,
                time: findFirst(record, 'overallStartTime') || 'N/A',
                type: findFirst(record, 'vehicleObstructionType') || 'Vehículo detenido',
                location: location || 'Ubicación desconocida'
            }];
        });
    });
}

module.exports = async function handler(request, response) {
    if (request.method !== 'GET') {
        response.setHeader('Allow', 'GET');
        return response.status(405).send('Method Not Allowed');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const upstream = await fetch(DGT_FEED_URL, {
            headers: {
                Accept: 'application/xml, text/xml, */*',
                'User-Agent': 'balizas-v16/1.0'
            },
            signal: controller.signal
        });

        if (!upstream.ok) {
            return response.status(502).send(`DGT feed returned HTTP ${upstream.status}`);
        }

        const xml = await readResponseText(upstream);
        const beacons = parseBeacons(xml);
        response.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
        return response.status(200).json(beacons);
    } catch (error) {
        if (error && error.name === 'AbortError') {
            return response.status(504).send('DGT feed request timed out');
        }
        if (error instanceof ResponseTooLargeError) {
            return response.status(502).send('DGT feed response is too large');
        }

        console.error('Unable to fetch DGT feed:', error);
        return response.status(502).send('Unable to fetch DGT feed');
    } finally {
        clearTimeout(timeoutId);
    }
};
