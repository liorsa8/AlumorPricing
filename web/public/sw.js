// The app has no server — all data lives in the browser's own IndexedDB (see src/db).
// This worker caches the static app shell (HTML/JS/CSS/icons) as it's fetched, so once it's
// been opened once, it keeps working with no network at all. "Cache-as-you-go": the first
// successful fetch of a file is cached; every later request is served from that cache first.
const CACHE_NAME = 'alumor-pricing-shell-v1';

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
