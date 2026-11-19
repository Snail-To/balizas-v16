const CACHE_NAME = 'balizas-v16-v12';
const ASSETS = [
  './',
  './index.html',
  './stats.html',
  './assets/css/stats.css',
  './assets/js/stats.js',
  './manifest.json',
  './assets/css/styles.css',
  './assets/js/app.js',
  './assets/js/map.js',
  './assets/js/dgt-api.js',
  './assets/js/i18n.js',
  './assets/images/baliza-intermitente-32px.png',
  './assets/images/baliza_v16_simple_icon.png',
  './assets/images/person.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith('balizas-v16-') && key !== CACHE_NAME).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match(event.request, { ignoreSearch: true })) || Response.error();
    }));
    return;
  }

  if (ASSETS.some(asset => new URL(asset, self.registration.scope).href === event.request.url)) {
    event.respondWith(caches.open(CACHE_NAME).then(async (cache) =>
      (await cache.match(event.request)) || fetch(event.request)
    ));
  }
});
