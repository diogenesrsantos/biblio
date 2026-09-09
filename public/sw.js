const CACHE = 'biblio-shell-v29';
const ASSETS = ['/', '/style.css?v=theme-home-v1', '/app.js?v=theme-home-v1', '/manifest.webmanifest', '/icon.svg', '/brand/reverendo-albert-banner.png', '/brand/reverendo-albert-boas-vindas.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const path = new URL(event.request.url).pathname;
  if (path.startsWith('/api/') || path.startsWith('/media/') || event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).then(response => { if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone())); return response; }).catch(() => caches.match(event.request)));
});
