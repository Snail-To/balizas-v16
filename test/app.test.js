const test = require('node:test');
const assert = require('node:assert/strict');

test('locate button does not trigger a beacon data refresh', () => {
    const modulePath = require.resolve('../assets/js/app');
    delete require.cache[modulePath];

    let clickHandler;
    let refreshCount = 0;
    const locateButton = {
        style: {},
        addEventListener(event, handler) {
            if (event === 'click') {
                clickHandler = handler;
            }
        },
        setAttribute() {}
    };

    global.window = {
        addEventListener() {},
        App: undefined
    };
    global.document = {
        getElementById(id) {
            return id === 'locate-button' ? locateButton : null;
        }
    };
    global.navigator = {};
    global.I18n = { get: () => 'Mi ubicación' };

    require(modulePath);
    const App = global.window.App;
    App.loadAndRenderBeacons = () => {
        refreshCount++;
    };
    App.setupLocateButton();
    clickHandler();

    assert.equal(refreshCount, 0);

    delete global.window;
    delete global.document;
    delete global.navigator;
    delete global.I18n;
});
