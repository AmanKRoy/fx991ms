// Offline service worker: network-first, cached copies of all app files for offline use. Relative URLs so the app works
// from any sub-path. Bump VERSION when files change.
const VERSION = 'fx991ms-v8';
const FILES = [
  './', 'index.html', 'style.css', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-192.png', 'icons/maskable-512.png',
  'src/tokens.js',
  'src/ui/main.js', 'src/ui/controller.js', 'src/ui/keys.js', 'src/ui/lcd.js', 'src/ui/textbook.js',
  'src/engine/index.js', 'src/engine/errors.js', 'src/engine/evaluator.js', 'src/engine/format.js', 'src/engine/parser.js',
  'src/lib/basen.js', 'src/lib/complex.js', 'src/lib/constants.js', 'src/lib/conversions.js', 'src/lib/eqn.js',
  'src/lib/matrix.js', 'src/lib/stats.js', 'src/lib/vector.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // add individually so one missing file does not abort the install
    await Promise.all(FILES.map((f) => cache.add(new Request(f, { cache: 'reload' })).catch((err) => console.warn('sw: skip', f, err))));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  // Network-first so updates show on the next load; cache fallback keeps it working offline.
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const res = await fetch(req, { cache: 'no-cache' });
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
      return Response.error();
    }
  })());
});
