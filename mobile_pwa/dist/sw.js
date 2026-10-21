// Build replaces the three literals with a versioned, exact static-asset list.
const CACHE = "thefishing-offline-6a0351b602448f24", BASE = "/", FILES = ["index.html","manifest.webmanifest","icons/apple-touch-icon.png","icons/icon-192.png","icons/icon-512.png","icons/icon.svg","assets/index-CY8o9zYN.css","assets/index-CjYQd4YV.js"];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES.map(p => BASE + p))).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('thefishing-offline-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET' || !url.pathname.startsWith(BASE)) return;
  const path = url.pathname.slice(BASE.length);
  // No user data, remote HTML, probes or authentication endpoints enter this cache.
  if (FILES.includes(path) || event.request.mode === 'navigate') event.respondWith(
    caches.open(CACHE).then(cache => cache.match(BASE + (event.request.mode === 'navigate' ? 'index.html' : path))).then(saved => saved || fetch(event.request))
  );
});
