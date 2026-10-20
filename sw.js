// Service worker: lets the calendar open without a connection.
//
// App files are network-first with a short timeout, so an online launch always gets the latest deploy
// while a slow or missing connection falls back to the cached copy. Google Fonts are cache-first.
// The sync API (/api/) is never cached; app.js handles being offline for that itself.

const CACHE = 'cal-shell-v1';
const FONT_CACHE = 'cal-fonts-v1';
const SHELL = [
  '/',
  '/styles.css',
  '/app.js',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-32.png',
];
const NETWORK_TIMEOUT = 3000;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== FONT_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/api/')) return;
    e.respondWith(networkFirst(req));
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(cacheFirst(req));
  }
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const network = fetch(req).then((res) => {
    if (res.ok && !res.redirected) cache.put(req, res.clone());
    return res;
  });
  network.catch(() => {}); // handled below; avoid an unhandled rejection if the timeout wins
  try {
    const res = await Promise.race([network, new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT))]);
    if (res) return res;
  } catch { /* offline */ }
  const cached = (await cache.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' && (await cache.match('/')));
  return cached || network; // nothing cached: keep waiting on the network after all
}

async function cacheFirst(req) {
  const cache = await caches.open(FONT_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}
