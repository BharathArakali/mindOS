/* Service worker disabled during development — re-enable for production */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());
self.addEventListener('fetch', () => { /* pass through — no caching */ });