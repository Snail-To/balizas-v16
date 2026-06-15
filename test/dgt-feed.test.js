const test = require('node:test');
const assert = require('node:assert/strict');

const handler = require('../api/dgt-feed');

const VALID_XML = `<?xml version="1.0"?>
    <d2:payload xmlns:d2="urn:d2" xmlns:sit="urn:sit" xmlns:com="urn:com" xmlns:loc="urn:loc">
        <sit:situation>
            <sit:situationRecord id="v16-1">
                <sit:validity>
                    <com:validityStatus>active</com:validityStatus>
                    <com:validityTimeSpecification>
                        <com:overallStartTime>2026-06-15T12:00:00+02:00</com:overallStartTime>
                    </com:validityTimeSpecification>
                </sit:validity>
                <sit:cause>
                    <sit:causeType>vehicleObstruction</sit:causeType>
                    <sit:detailedCauseType>
                        <sit:vehicleObstructionType>vehicleStuck</sit:vehicleObstructionType>
                    </sit:detailedCauseType>
                </sit:cause>
                <sit:locationReference>
                    <loc:coordinatesForDisplay>
                        <loc:latitude>40.4168</loc:latitude>
                        <loc:longitude>-3.7038</loc:longitude>
                    </loc:coordinatesForDisplay>
                    <loc:roadInformation>
                        <loc:roadName>A-1</loc:roadName>
                    </loc:roadInformation>
                </sit:locationReference>
            </sit:situationRecord>
            <sit:situationRecord id="ignored">
                <sit:validity><com:validityStatus>active</com:validityStatus></sit:validity>
                <sit:cause><sit:causeType>accident</sit:causeType></sit:cause>
            </sit:situationRecord>
        </sit:situation>
    </d2:payload>`;

function createResponseRecorder() {
    return {
        statusCode: null,
        headers: {},
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        setHeader(name, value) {
            this.headers[name.toLowerCase()] = value;
        },
        send(body) {
            this.body = body;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        }
    };
}

test('returns only active vehicle obstructions as compact JSON', async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => new Response(VALID_XML, {
        status: 200,
        headers: { 'content-type': 'text/xml' }
    });

    const response = createResponseRecorder();

    try {
        await handler({ method: 'GET' }, response);
    } finally {
        global.fetch = originalFetch;
    }

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['cache-control'], 's-maxage=30, stale-while-revalidate=120');
    assert.deepEqual(response.body, [{
        id: 'v16-1',
        lat: 40.4168,
        lon: -3.7038,
        time: '2026-06-15T12:00:00+02:00',
        type: 'vehicleStuck',
        location: 'A-1'
    }]);
});

test('aborts a DGT request that exceeds the server timeout', async () => {
    const originalFetch = global.fetch;
    const originalSetTimeout = global.setTimeout;
    const originalConsoleError = console.error;
    global.setTimeout = (callback) => {
        queueMicrotask(callback);
        return 1;
    };
    global.fetch = (_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
        });
    });
    console.error = () => {};

    const response = createResponseRecorder();

    try {
        await handler({ method: 'GET' }, response);
    } finally {
        global.fetch = originalFetch;
        global.setTimeout = originalSetTimeout;
        console.error = originalConsoleError;
    }

    assert.equal(response.statusCode, 504);
    assert.equal(response.body, 'DGT feed request timed out');
});

test('rejects a DGT response larger than the configured limit', async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => new Response(VALID_XML, {
        status: 200,
        headers: { 'content-length': String(20 * 1024 * 1024) }
    });

    const response = createResponseRecorder();

    try {
        await handler({ method: 'GET' }, response);
    } finally {
        global.fetch = originalFetch;
    }

    assert.equal(response.statusCode, 502);
    assert.equal(response.body, 'DGT feed response is too large');
});
