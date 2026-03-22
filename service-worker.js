/* ============================================================
   service-worker.js — Cache-first PWA
   Bump CACHE version on every deploy to force fresh files.
   ============================================================ */
const CACHE = 'mindos-v4';

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
  './habits.js',
  './focusmusic.js',
  './onboarding.js',
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

/* Activate — wipe ALL old caches immediately */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => {
          console.log('[SW] Deleting old cache:', k);
          return caches.delete(k);
        })
      ))
      .then(() => self.clients.claim())
  );
});

/* Fetch — network-first for JS/CSS, cache-first for images */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  const isAsset = /\.(js|css|html)$/.test(url.pathname) || url.pathname.endsWith('/');

  if (isAsset) {
    /* Network-first for JS/CSS/HTML — always get fresh code */
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res && res.status === 200 && res.type === 'basic') {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  } else {
    /* Cache-first for images/fonts */
    e.respondWith(
      caches.match(e.request).then(cached => cached ||
        fetch(e.request).then(res => {
          if (res && res.status === 200 && res.type === 'basic') {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        })
      )
    );
  }
});