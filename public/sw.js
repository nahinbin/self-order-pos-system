// No-op service worker to avoid 404 when browser requests /sw.js
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", () => self.clients.claim());
