// Installed only when the visitor presses "Keep this site on this device".
// The file list below is filled in at build time (scripts/postbuild.mjs).
const CACHE = 'ark-offline';
const FILES = self.__PRECACHE__ || [];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const tell = async (msg) => (await self.clients.matchAll({ includeUncontrolled: true })).forEach((c) => c.postMessage(msg));
    let n = 0;
    for (const file of FILES) {
      try { await cache.add(file); } catch { /* one missing file must not block the rest */ }
      n++;
      if (n % 8 === 0 || n === FILES.length) await tell({ type: 'progress', n, total: FILES.length });
    }
    await tell({ type: 'done' });
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  ]));
});

// Serve from the device first, refresh in the background so the copy stays current.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
    return hit || (await net) || (await cache.match('/')) || Response.error();
  })());
});
