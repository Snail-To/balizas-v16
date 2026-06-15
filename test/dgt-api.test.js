const test = require('node:test');
const assert = require('node:assert/strict');

function loadDgtApi() {
    const modulePath = require.resolve('../assets/js/dgt-api');
    delete require.cache[modulePath];
    global.window = {};
    return require(modulePath);
}

test('shares one network request between concurrent beacon loads', async () => {
    const originalFetch = global.fetch;
    const DgtApi = loadDgtApi();
    let fetchCount = 0;
    let resolveFetch;

    global.fetch = () => {
        fetchCount++;
        return new Promise((resolve) => {
            resolveFetch = resolve;
        });
    };

    try {
        const firstLoad = DgtApi.getBeacons();
        const secondLoad = DgtApi.getBeacons();

        assert.equal(fetchCount, 1);

        resolveFetch(new Response('[]', {
            status: 200,
            headers: { 'content-type': 'application/json' }
        }));

        assert.deepEqual(await firstLoad, []);
        assert.deepEqual(await secondLoad, []);
    } finally {
        global.fetch = originalFetch;
        delete global.window;
    }
});
