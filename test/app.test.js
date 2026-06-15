const test = require('node:test');
const assert = require('node:assert/strict');

function loadApp({ geolocation } = {}) {
    const modulePath = require.resolve('../assets/js/app');
    delete require.cache[modulePath];

    let clickHandler;
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
        matchMedia: () => ({ matches: false }),
        navigator: {}
    };
    global.document = {
        addEventListener() {},
        getElementById(id) {
            return id === 'locate-button' ? locateButton : null;
        }
    };
    global.navigator = geolocation ? { geolocation } : {};
    global.I18n = {
        get: (key) => key,
        init() {},
        getCurrentLanguage: () => 'es'
    };
    global.MapManager = {
        init() {},
        setUserLocation() {},
        focusUserLocation() {}
    };

    require(modulePath);

    return {
        App: global.window.App,
        locateButton,
        click: () => clickHandler()
    };
}

function cleanupGlobals() {
    delete global.window;
    delete global.document;
    delete global.navigator;
    delete global.I18n;
    delete global.MapManager;
}

test('does not request location automatically during app initialization', async () => {
    const { App } = loadApp();
    let locationRequestCount = 0;

    App.initUserLocation = () => {
        locationRequestCount++;
    };
    App.setupSettingsPanel = () => {};
    App.setupLanguageSelector = () => {};
    App.setupLocateButton = () => {};
    App.setupNoticeBox = () => {};
    App.setupPwaInstall = () => {};
    App.loadAndRenderBeacons = async () => {};
    App.startAutoRefresh = () => {};

    try {
        await App.init();
        assert.equal(locationRequestCount, 0);
    } finally {
        cleanupGlobals();
    }
});

test('locate button focuses the map on the current position', () => {
    let successCallback;
    const { App, locateButton, click } = loadApp({
        geolocation: {
            getCurrentPosition(success) {
                successCallback = success;
            }
        }
    });
    const locations = [];
    let focusCount = 0;

    global.MapManager.setUserLocation = (lon, lat) => locations.push([lon, lat]);
    global.MapManager.focusUserLocation = () => {
        focusCount++;
    };

    try {
        App.setupLocateButton();
        click();
        successCallback({ coords: { latitude: 40.4168, longitude: -3.7038 } });

        assert.deepEqual(locations, [[-3.7038, 40.4168]]);
        assert.equal(focusCount, 1);
        assert.equal(locateButton.style.pointerEvents, 'auto');
    } finally {
        cleanupGlobals();
    }
});

test('shows a visible error when location permission is denied', () => {
    let errorCallback;
    const { App, click } = loadApp({
        geolocation: {
            getCurrentPosition(_success, error) {
                errorCallback = error;
            }
        }
    });
    const statuses = [];
    App.updateStatus = (messageKey, className) => statuses.push([messageKey, className]);

    try {
        App.setupLocateButton();
        click();
        errorCallback({ code: 1 });

        assert.deepEqual(statuses, [['locationPermissionDenied', 'error']]);
    } finally {
        cleanupGlobals();
    }
});
