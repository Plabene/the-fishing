// Build replaces the three literals with a versioned, exact static-asset list.
const CACHE = __CACHE__, BASE = __BASE__, FILES = __FILES__;
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES.map(p => BASE + p))).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('thefishing-offline-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET' || !url.pathname.startsWith(BASE)) return;
  const path = url.pathname.slice(BASE.length);
  // No user data, remote HTML, probes or authentication endpoints enter this cache.
  if (event.request.mode === 'navigate') {
    // Online navigation must see a newly deployed app, even when an older worker still controls the page.
    event.respondWith(fetch(event.request,{cache:'no-store'}).then(response=>{
      if(!response.ok) throw new Error('Navigation unavailable');return response;
    }).catch(()=>caches.open(CACHE).then(cache=>cache.match(BASE+'index.html')).then(saved=>saved || Response.error())));
  } else if(FILES.includes(path)) event.respondWith(caches.open(CACHE).then(cache=>cache.match(BASE+path)).then(saved=>saved || fetch(event.request)));
});
