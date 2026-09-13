// The app has no server — all data lives in the browser's own IndexedDB (see src/db).
// This worker caches the static app shell so it keeps working with no network at all once
// it's been opened once. Two different strategies for two different kinds of file:
//
// - The navigation request (index.html) is always fetched from the network first, falling
//   back to the cache only when offline. It has no content hash in its filename, so a
//   cache-first strategy here would keep serving a stale shell forever after every future
//   deploy — this bit us in exactly that way once already.
// - Every other asset (JS/CSS/icons) IS content-hashed by the build, so a cached copy can
//   never go stale for the URL it's stored under — cache-first is safe and correct there.
const CACHE_NAME = 'alumor-pricing-shell-v2';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      try {
        const response = await fetch(event.request);
        if (response.ok) cache.put(event.request, response.clone());
        return response;
      } catch (err) {
        const fallback = await cache.match(event.request);
        if (fallback) return fallback;
        throw err;
      }
    })
  );
});
