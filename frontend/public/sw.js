// Dark-Army Store service worker — enables install + offline browsing.
// v3: never touch /_next/ — see the fetch handler for why.
const CACHE = 'da-store-v3';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Never cache API or uploads — always live.
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/uploads')) return;

  // Never cache the staff application. The admin and the till are working
  // tools that must always match the deployed build — caching them can leave
  // an operator running an old till or an old ledger without knowing it.
  if (url.pathname.startsWith('/admin') || url.pathname.startsWith('/pos')) return;

  // NEVER touch Next's build output. In development these chunk paths are
  // stable rather than content-hashed, so caching them serves the browser
  // week-old JavaScript no matter how often the server recompiles — which
  // breaks hydration silently and cannot self-heal, because the code that
  // would unregister this worker is itself in the stale bundle.
  // In production Next already sends immutable cache headers, so the HTTP
  // cache covers this properly and the worker adds nothing here.
  if (url.pathname.startsWith('/_next/')) return;

  const isStaticAsset = /\.(?:png|jpe?g|svg|webp|ico|woff2?)$/.test(url.pathname);

  if (isStaticAsset) {
    // Cache-first for immutable static assets
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      })
    );
  } else {
    // Network-first for pages; fall back to cache when offline
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(request, res.clone()));
          return res;
        })
        .catch(() => caches.match(request))
    );
  }
});
