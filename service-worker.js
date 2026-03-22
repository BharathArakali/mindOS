/* ============================================================
   service-worker.js — Cache-first PWA
   Version bump this string to force cache refresh on deploy.
   ============================================================ */
const CACHE = 'mindos-v1';

const ASSETS = [
  './',
  './index.html',
  './base.css',
  './animations.css',
  './layout.css',
  './components.css',
  './main.js',
  './auth.js',
  './timer.js',
  './distraction.js',
  './notes.js',
  './reminders.js',
  './dashboard.js',
  './theme.js',
  './storage.js',
  './utils.js',
  './bus.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

/* Install — pre-cache all static assets */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

/* Activate — delete old caches */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* Fetch — cache-first, network fallback */
self.addEventListener('fetch', e => {
  /* Only handle same-origin GET requests */
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        /* Cache fresh responses for future offline use */
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});