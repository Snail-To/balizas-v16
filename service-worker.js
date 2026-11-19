const CACHE_NAME = 'balizas-v16-v17';
const ASSETS = [
  './',
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
const appUrl = (path) => new URL(path, self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS.map((asset) => new Request(appUrl(asset), { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
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
  if (requestUrl.origin !== self.location.origin || requestUrl.pathname.includes('/api/')) {
    return;
  }

  if (event.request.mode === 'navigate') {
    requestUrl.search = '';
    const offlineUrl = requestUrl.href === appUrl('./index.html') ? appUrl('./') : requestUrl.href;
    event.respondWith(fetch(event.request, { cache: 'no-cache' }).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match(offlineUrl)) || Response.error();
    }));
    return;
  }

  if (ASSETS.some((asset) => appUrl(asset) === event.request.url)) {
    event.respondWith(fetch(event.request).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match(event.request)) || Response.error();
    }));
  }
});
