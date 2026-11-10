self.__PRECACHE__ = ["/_astro/Page.astro_astro_type_script_index_0_lang.2dH1sBT4.js","/_astro/RoundedBoxGeometry.DoW72_zk.js","/_astro/cinema.IYM6rXAo.js","/_astro/device.BbYtApvK.js","/_astro/hero.BzOyYiIr.js","/_astro/ibm-plex-mono-cyrillic-400-normal.BSMlKf0J.woff2","/_astro/ibm-plex-mono-cyrillic-500-normal.Bq9vWWag.woff2","/_astro/ibm-plex-mono-cyrillic-ext-400-normal.xuaO2J-f.woff2","/_astro/ibm-plex-mono-cyrillic-ext-500-normal.BqneJy0T.woff2","/_astro/ibm-plex-mono-latin-400-normal.DMJ8VG8y.woff2","/_astro/ibm-plex-mono-latin-500-normal.DSY6xOcd.woff2","/_astro/ibm-plex-mono-latin-ext-400-normal.BmRBH3aV.woff2","/_astro/ibm-plex-mono-latin-ext-500-normal.CAhNIIs5.woff2","/_astro/ibm-plex-mono-vietnamese-400-normal.BulugwFq.woff2","/_astro/ibm-plex-mono-vietnamese-500-normal.DZ4AoWbu.woff2","/_astro/ibm-plex-sans-arabic-arabic-400-normal.CyU-ddYS.woff2","/_astro/ibm-plex-sans-arabic-arabic-500-normal.C4MQITzh.woff2","/_astro/ibm-plex-sans-arabic-arabic-700-normal.DrtBj6UE.woff2","/_astro/ibm-plex-sans-arabic-cyrillic-ext-400-normal.KAuemXZb.woff2","/_astro/ibm-plex-sans-arabic-cyrillic-ext-500-normal.OtpNIXEE.woff2","/_astro/ibm-plex-sans-arabic-cyrillic-ext-700-normal.DkasDNaI.woff2","/_astro/ibm-plex-sans-arabic-latin-400-normal.Bo5KPYvw.woff2","/_astro/ibm-plex-sans-arabic-latin-500-normal.Cd6jVIg7.woff2","/_astro/ibm-plex-sans-arabic-latin-700-normal.BzSf6GNr.woff2","/_astro/ibm-plex-sans-arabic-latin-ext-400-normal.BpLfq-63.woff2","/_astro/ibm-plex-sans-arabic-latin-ext-500-normal.Ck_W4G78.woff2","/_astro/ibm-plex-sans-arabic-latin-ext-700-normal.BSbyEp0V.woff2","/_astro/ibm-plex-sans-cyrillic-400-normal.DZqxrq2p.woff2","/_astro/ibm-plex-sans-cyrillic-500-normal.CocWQlwt.woff2","/_astro/ibm-plex-sans-cyrillic-700-normal.D_uavGvn.woff2","/_astro/ibm-plex-sans-cyrillic-ext-400-normal.g30qAdWV.woff2","/_astro/ibm-plex-sans-cyrillic-ext-500-normal.Cs5J6C77.woff2","/_astro/ibm-plex-sans-cyrillic-ext-700-normal.BmRLXWpJ.woff2","/_astro/ibm-plex-sans-greek-400-normal._efipK4i.woff2","/_astro/ibm-plex-sans-greek-500-normal.JMMifIXV.woff2","/_astro/ibm-plex-sans-greek-700-normal.wyJ6jzdA.woff2","/_astro/ibm-plex-sans-latin-400-normal.CDDApCn2.woff2","/_astro/ibm-plex-sans-latin-500-normal.6ng42L7E.woff2","/_astro/ibm-plex-sans-latin-700-normal.Bxkt5Cjx.woff2","/_astro/ibm-plex-sans-latin-ext-400-normal.C5H60-Va.woff2","/_astro/ibm-plex-sans-latin-ext-500-normal.DakdToA3.woff2","/_astro/ibm-plex-sans-latin-ext-700-normal.aMgXseD4.woff2","/_astro/ibm-plex-sans-vietnamese-400-normal.DG4YqDda.woff2","/_astro/ibm-plex-sans-vietnamese-500-normal.e4dixQRQ.woff2","/_astro/ibm-plex-sans-vietnamese-700-normal.CkEo6LDy.woff2","/_astro/night.O7LZ3VbL.js","/_astro/rented.LuqqxWw0.js","/_astro/stage.BWePN1LF.js","/_astro/three.core.Bn5IdJvN.js","/apple-touch-icon.png","/ar/","/favicon.svg","/fr/","/","/media/abbey_road.webp","/media/discovery_(daft_punk_album).webp","/media/dune_(novel).webp","/media/interstellar_(film).webp","/media/nineteen_eighty-four.webp","/media/random_access_memories.webp","/media/spirited_away.webp","/media/the_dark_side_of_the_moon.webp","/media/the_grand_budapest_hotel.webp","/media/the_hobbit.webp","/media/the_little_prince.webp","/media/timbuktu_(2014_film).webp","/robots.txt"];
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
