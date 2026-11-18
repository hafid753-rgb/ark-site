// After `astro build`: write the offline file list into dist/sw.js, and refuse
// to ship if a name the owner asked to keep off the site appears anywhere.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    out.push(...(entry.isDirectory() ? await walk(p) : [p]));
  }
  return out;
}

const files = await walk(dist);
const urls = files
  .map((f) => '/' + relative(dist, f).split(sep).join('/'))
  .filter((u) => u !== '/sw.js' && !u.endsWith('.woff') && u !== '/_headers' && !u.startsWith('/edition/'))
  .map((u) => u.replace(/index\.html$/, ''));

const swPath = join(dist, 'sw.js');
const sw = await readFile(swPath, 'utf8');
await writeFile(swPath, `self.__PRECACHE__ = ${JSON.stringify(urls)};\n${sw}`);
console.log(`postbuild: ${urls.length} files listed for offline use`);

// The owner asked that these never appear on the site.
const banned = /jellyfin|home ?assistant|homeassistant/i;
const offenders = [];
for (const f of files) {
  if (!/\.(html|js|css|json|txt|svg)$/.test(f)) continue;
  if (banned.test(await readFile(f, 'utf8'))) offenders.push(relative(dist, f));
}
if (offenders.length) {
  console.error('postbuild: banned names found in', offenders);
  process.exit(1);
}
