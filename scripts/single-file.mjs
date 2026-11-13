// Builds each language as one self-contained page: every script, font and cover inside the file.
// Used to preview the site where only inline code is allowed (for example a claude.ai artifact).
// Run after `npm run build`:  node scripts/single-file.mjs  →  dist-single/{en,fr,ar}.html
// Optional: node scripts/single-file.mjs '{"en":"https://…","fr":"https://…","ar":"https://…"}'
// points the language links at where each page is published.
import { rolldown } from 'rolldown';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

const out = 'dist-single';
const published = process.argv[2] ? JSON.parse(process.argv[2]) : null;
const paths = { en: '/', fr: '/fr/', ar: '/ar/' };
mkdirSync(out, { recursive: true });

// 1. All scripts, dynamic imports included, as one classic script.
const bundle = await rolldown({ input: 'src/scripts/main.ts', platform: 'browser', logLevel: 'warn' });
const { output } = await bundle.generate({ format: 'iife', codeSplitting: false, minify: true });
const js = output[0].code.replace(/<\/script/gi, '<\\/script');

// 2. Covers as data URIs, handed to the cinema scene through a global.
const media = Object.fromEntries(
  readdirSync('public/media').map((f) => [f.replace(/\.webp$/, ''), `data:image/webp;base64,${readFileSync(`public/media/${f}`).toString('base64')}`]),
);

const dataUri = (path) => `data:font/woff2;base64,${readFileSync(`dist${path}`).toString('base64')}`;
for (const [lang, file] of [['en', 'dist/index.html'], ['fr', 'dist/fr/index.html'], ['ar', 'dist/ar/index.html']]) {
  let html = readFileSync(file, 'utf8');
  const rootTag = html.match(/<html([^>]*)>/)[1];
  const attrs = Object.fromEntries([...rootTag.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
  // Fonts: only the subsets the site uses (Latin, Arabic), inline.
  html = html.replace(/@font-face\{[^}]*\}/g, (face) => {
    if (/cyrillic|greek|vietnamese/.test(face)) return '';
    return face.replace(/url\((\/_astro\/[^)]+\.woff2)\)/g, (_, p) => `url(${dataUri(p)})`).replace(/,url\([^)]+\.woff\)\s*format\("woff"\)/g, '');
  });
  html = html
    .replace(/<script type="module" src="[^"]*"><\/script>/, '')
    .replace(/<link rel="(icon|apple-touch-icon|canonical|alternate)"[^>]*>/g, '')
    // A downloaded copy of the edition makes no sense where the page is a preview.
    .replace(/<a class="link" href="\/edition\/[^"]*"[^>]*>[^<]*<\/a>/g, '')
    .replace(/<meta (charset|name="viewport")[^>]*>/g, '')
    .replace(/<!DOCTYPE html>|<\/?html[^>]*>|<\/?head>|<\/?body>/gi, '');
  if (published) {
    for (const [l, p] of Object.entries(paths)) {
      html = html.replaceAll(`href="${p}"`, `href="${published[l]}" target="_top"`);
    }
  }
  const setRoot = Object.entries(attrs).map(([k, v]) => `r.setAttribute(${JSON.stringify(k)},${JSON.stringify(v)});`).join('');
  html =
    `<script>(function(r){${setRoot}})(document.documentElement);window.__arkMedia=${JSON.stringify(media)};</script>` +
    // The host's frame sets a small system font on body; the site's type lives on :root.
    `<style>body{font:inherit;color:inherit;background:var(--bg)}</style>` +
    html +
    `<script>${js}</script>`;
  writeFileSync(`${out}/${lang}.html`, html);
  console.log(`${out}/${lang}.html`, (html.length / 1024).toFixed(0), 'KB');
}
