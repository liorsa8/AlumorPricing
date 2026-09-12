// Minimal service worker: exists only to satisfy PWA installability requirements
// (Chrome on Android checks for a registered service worker with a fetch handler
// before offering a real "Install app" prompt instead of a plain bookmark shortcut).
// It deliberately does NOT cache anything — this app deals in live business data
// (quotes, catalog, settings), so every request just passes straight through to
// the network rather than risking a stale cached response.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
