// sw.js — development-safe version
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(clients.claim()));

// Don't cache anything for now (just fetch live)
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
