// End-to-end checks against the built site (run `npm run build` first).
// Uses the system Playwright: node tests/e2e/run.mjs
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const { chromium } = createRequire(import.meta.url)('playwright');
const PORT = 4329;
const BASE = `http://127.0.0.1:${PORT}`;
const server = spawn('npx', ['astro', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--ignore-lock'], { detached: true, stdio: 'ignore' });
let failures = 0;
// Software GL in a headless browser draws only a few frames a second; smooth scrolling then takes so
// long that elements never count as "stable". Tests check behaviour, so scrolling jumps instead.
const instant = (page) => page.addInitScript(() => addEventListener('DOMContentLoaded', () => {
  const st = document.createElement('style');
  st.textContent = 'html { scroll-behavior: auto !important }';
  document.head.append(st);
}));
const check = (ok, label) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) failures++; };

try {
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(BASE)).ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });

  for (const [path, lang, dir] of [['/', 'en', 'ltr'], ['/fr/', 'fr', 'ltr'], ['/ar/', 'ar', 'rtl']]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await instant(page);
    const errors = [], foreign = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('request', (r) => { const u = new URL(r.url()); if (u.protocol.startsWith('http') && u.host !== `127.0.0.1:${PORT}`) foreign.push(r.url()); });
    await page.goto(BASE + path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    for (const id of ['#rented', '#yours', '#offline', '#control', '#cinema', '#setup', '#start']) {
      await page.evaluate((id) => document.querySelector(id).scrollIntoView(), id);
      await page.waitForTimeout(500);
    }
    check(await page.evaluate(() => document.documentElement.lang) === lang && await page.evaluate(() => document.documentElement.dir) === dir, `${path} lang=${lang} dir=${dir}`);
    check(await page.evaluate(() => document.documentElement.dataset.mode) === 'full', `${path} starts in full mode with WebGL`);
    check(errors.length === 0, `${path} no console errors ${errors.join(' | ')}`);
    check(foreign.length === 0, `${path} no requests to other companies ${foreign.join(' ')}`);
    await page.close();
  }

  // Liquid glass: no lens any more; headlines are painted by the stage as glass, the page keeps the words.
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await instant(page);
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => 'glassOn' in document.documentElement.dataset, null, { timeout: 20000 });
    check(!(await page.$('.lens')), 'the ascii-to-3D lens is gone');
    check(await page.evaluate(() => getComputedStyle(document.querySelector('h1 .w')).color === 'rgba(0, 0, 0, 0)'), 'the headline is painted as glass by the stage');
    check((await page.textContent('h1')).length > 0 && (await page.getAttribute('h1', 'aria-label')).length > 0, 'the headline words stay in the page for reading aloud');
    // Build your own setup: choosing a place shows what Ark does there.
    await page.locator('#setup').scrollIntoViewIfNeeded();
    check(await page.isVisible('[data-place="home"]') && !(await page.isVisible('[data-place="office"]')), 'the setup starts on Home');
    await page.click('label.place:has(input[value="office"])');
    check(await page.isVisible('[data-place="office"]') && !(await page.isVisible('[data-place="home"]')), 'choosing Office shows the office setup');
    await page.close();
  }

  // Interactions on the English page.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await instant(page);
  page.setDefaultTimeout(120000); // clicks wait for steady frames, which software GL draws about once a second
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.locator('#offline').scrollIntoViewIfNeeded();
  await page.click('[data-lights]');
  await page.waitForFunction(() => /simulated/.test(document.querySelector('[data-status]').textContent), null, { timeout: 20000 });
  check(true, 'cloud round trip is labelled simulated');
  await page.click('button[data-cut]');
  await page.click('[data-lights]');
  await page.waitForFunction(() => document.querySelector('[data-status]').dataset.tone === 'local', null, { timeout: 15000 }); // software GL paints the night house slowly
  check(/measured/.test(await page.textContent('[data-status]')), 'offline answer is measured on the device');

  await page.locator('#control').scrollIntoViewIfNeeded();
  await page.click('[data-gate]');
  check(await page.isVisible('[data-sheet]'), 'opening the gate asks first');
  await page.click('[data-sheet-ok]');
  check((await page.textContent('[data-gate-state]')).trim() === 'Open', 'gate opens after confirming');

  await page.click('[data-mode-toggle]');
  check(await page.evaluate(() => document.documentElement.dataset.mode === 'text' && getComputedStyle(document.getElementById('stage')).display === 'none'), 'text mode hides the 3D stage');
  await page.click('[data-mode-toggle]');

  // Offline copy, only when asked.
  check(!(await page.evaluate(() => navigator.serviceWorker.getRegistration())), 'nothing is installed before the visitor asks');
  await page.locator('footer').scrollIntoViewIfNeeded();
  await page.click('[data-offline]');
  await page.waitForFunction(() => document.querySelector('[data-offline]').dataset.saved === 'true', null, { timeout: 30000 });
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  check(await page.isVisible('h1'), 'the saved copy opens with the network off');
  await ctx.setOffline(false);
  await ctx.close();

  // Without JavaScript the story still reads.
  const nojs = await browser.newContext({ javaScriptEnabled: false });
  const p2 = await nojs.newPage();
  await p2.goto(BASE + '/', { waitUntil: 'networkidle' });
  check(await p2.isVisible('pre.art') && await p2.isVisible('h1') && !(await p2.isVisible('#stage')), 'without JavaScript: text layout, no stage');
  const edition = await (await fetch(BASE + '/edition/en/')).text();
  check(!/<script|<link[^>]+stylesheet|src=/i.test(edition), 'one-file edition has no scripts or external files');
  await nojs.close();
  await browser.close();
} finally {
  process.kill(-server.pid); // the whole group: npx and the server it started
}
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
