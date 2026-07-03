const CACHE = 'gm-mobile-v3.11.0';
const CORE = [
  '/',
  '/styles.css',
  '/app.js',
  '/pedido',
  '/pedido/styles.css',
  '/pedido/app.js',
  '/assets/favicon.png',
  '/assets/gm-logo.png',
  '/assets/gm-logo-192.png',
  '/assets/gm-logo-512.png'
];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response && response.ok && ['style','script','image','font'].includes(request.destination)) {
        const cache = await caches.open(CACHE);
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    } catch {
      return (await caches.match(request)) || (request.mode === 'navigate' ? (await caches.match(url.pathname.startsWith('/pedido') ? '/pedido' : '/')) : (await caches.match('/assets/gm-logo-192.png')));
    }
  })());
});
