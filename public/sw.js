const CACHE = 'biblio-shell-v10';
const ASSETS = ['/', '/style.css', '/auth.css', '/layout.css', '/editor.css', '/fixes.css', '/search.css', '/topbar.css', '/media.css', '/app.js', '/manifest.webmanifest', '/icon.svg'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const path = new URL(event.request.url).pathname;
  if (path.startsWith('/api/') || path.startsWith('/media/') || event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).then(response => { if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone())); return response; }).catch(() => caches.match(event.request)));
});
