import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildGlyphs, cellMaterial, compositeMaterial, fullscreen } from './glyphs';
import { approach, clamp01, smooth } from './util';
import type { Chapter, SceneCtx } from './types';

type Factory = (ctx: SceneCtx) => Chapter;
const SCENES: Record<string, () => Promise<{ create: Factory }>> = {
  hero: () => import('./hero'),
  rented: () => import('./rented'),
  device: () => import('./device'),
  night: () => import('./night'),
  cinema: () => import('./cinema'),
};

/** The single WebGL stage behind the page. Returns a handle to stop it (text mode). */
export async function startStage() {
  const root = document.documentElement;
  const canvas = document.getElementById('stage') as HTMLCanvasElement;
  const lensEl = document.querySelector<HTMLElement>('.lens')!;
  const markers = [...document.querySelectorAll<HTMLElement>('.marker')];
  const feedCanvas = document.querySelector<HTMLCanvasElement>('[data-feed]');
  const rtl = root.dir === 'rtl';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const touch = matchMedia('(hover: none)').matches;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 1);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const font = getComputedStyle(root).getPropertyValue(rtl ? '--sans' : '--mono').trim();
  const word = root.dataset.glyphs ?? 'sovereignty';
  await document.fonts.load(`500 34px ${font}`, word).catch(() => {});
  const glyphs = buildGlyphs(word, font, rtl);

  const half = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
  const sceneRT = new THREE.WebGLRenderTarget(1, 1, { type: half ? THREE.HalfFloatType : THREE.UnsignedByteType, samples: 4 });
  const cellRT = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
  const cellMat = cellMaterial(glyphs);
  const compMat = compositeMaterial(glyphs);
  const cellQuad = fullscreen(cellMat);
  const compQuad = fullscreen(compMat);
  const quadCam = new THREE.OrthographicCamera();
  const lensPx = new THREE.Vector4(-9999, -9999, 1, 1);
  const ctx: SceneCtx = { renderer, env, glyphs, rtl, reduced, lens: lensPx };

  // Scenes load as you approach them, then stay.
  const made = new Map<string, Chapter>();
  const loading = new Set<string>();
  const get = (name: string) => {
    if (!made.has(name) && !loading.has(name) && SCENES[name]) {
      loading.add(name);
      SCENES[name]()
        .then((m) => made.set(name, m.create(ctx)))
        .catch((err) => console.warn(`scene ${name} failed`, err));
    }
    return made.get(name);
  };

  // Sizes. `scale` drops on slow devices and recovers on fast ones.
  const dpr = Math.min(devicePixelRatio || 1, touch ? 1.5 : 1.75);
  let scale = 1;
  let W = 1, H = 1, pr = 1;
  const sections = [...document.querySelectorAll<HTMLElement>('main > .chapter')];
  let spans: { el: HTMLElement; top: number; h: number }[] = [];
  const measure = () => {
    spans = sections.map((el) => {
      const r = el.getBoundingClientRect();
      return { el, top: r.top + scrollY, h: r.height };
    });
  };
  const resize = () => {
    W = innerWidth;
    H = innerHeight;
    pr = dpr * scale;
    renderer.setPixelRatio(pr);
    renderer.setSize(W, H, false);
    const bw = Math.max(1, Math.floor(W * pr)), bh = Math.max(1, Math.floor(H * pr));
    sceneRT.setSize(bw, bh);
    const cols = Math.floor(W / (rtl ? 11 : 9)), rows = Math.floor(H / (rtl ? 17 : 15));
    cellRT.setSize(cols, rows);
    cellMat.uniforms.uCells.value.set(cols, rows);
    compMat.uniforms.uCells.value.set(cols, rows);
    compMat.uniforms.uRes.value.set(bw, bh);
    compMat.uniforms.uPx.value = pr;
    measure();
  };
  resize();
  const ro = new ResizeObserver(() => measure());
  ro.observe(document.body);
  addEventListener('resize', resize);

  // The lens: follows the mouse; on touch screens it is dragged.
  const lens = { x: W * 0.7, y: H * 0.45, tx: W * 0.7, ty: H * 0.45, moved: false, drag: false };
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    lens.tx = e.clientX;
    lens.ty = e.clientY;
    lens.moved = true;
  };
  addEventListener('pointermove', onMove, { passive: true });
  lensEl.classList.toggle('touch', touch);
  const drag = (e: PointerEvent) => {
    if (!lens.drag) return;
    lens.tx = lens.x = e.clientX;
    lens.ty = lens.y = e.clientY;
    lens.moved = true;
  };
  lensEl.addEventListener('pointerdown', (e) => { lens.drag = true; lensEl.setPointerCapture(e.pointerId); drag(e); });
  lensEl.addEventListener('pointermove', drag);
  lensEl.addEventListener('pointerup', () => (lens.drag = false));
  lensEl.addEventListener('pointercancel', () => (lens.drag = false));

  // Hold the glass and it floods the screen: everything shows in 3D. Press again for the letters.
  // `grow` is a spring, so the glass swells, overshoots a little and settles like a drop of liquid.
  const glass = { real: false, grow: 0, vel: 0, hold: 0, holding: false, sx: 0, sy: 0, timer: 0, armed: false };
  let floodable = false; // only the opening scene floods to 3D; further down stays in letters
  const hints = [...document.querySelectorAll<HTMLElement>('[data-hint-real]')];
  const setReal = (real: boolean, buzz = true) => {
    glass.real = real;
    document.documentElement.dataset.view = real ? 'real' : 'letters';
    hints.forEach((h) => (h.textContent = real ? h.dataset.hintReal! : (touch && h.dataset.hintTouch) || h.dataset.hint!));
    if (buzz) navigator.vibrate?.(8);
  };
  const busy = (t: EventTarget | null) => (t as Element | null)?.closest?.('a, button, input, select, label, summary, .phone, .bar, .rail');
  addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !floodable || busy(e.target)) return;
    glass.sx = e.clientX;
    glass.sy = e.clientY;
    if (glass.real) { glass.armed = true; return; }
    if (touch && e.target !== lensEl) return; // on touch screens, only the glass itself is held
    glass.holding = true;
    clearTimeout(glass.timer);
    glass.timer = window.setTimeout(() => { glass.holding = false; setReal(true); }, 480);
  });
  addEventListener('pointermove', (e) => {
    if (Math.hypot(e.clientX - glass.sx, e.clientY - glass.sy) < 12) return;
    glass.armed = false;
    if (glass.holding) { glass.holding = false; clearTimeout(glass.timer); }
  }, { passive: true });
  const release = () => {
    clearTimeout(glass.timer);
    glass.holding = false;
    if (glass.armed && glass.real) setReal(false);
    glass.armed = false;
  };
  addEventListener('pointerup', release);
  addEventListener('pointercancel', () => { glass.armed = false; release(); });

  // Clicking a room in the 3D house toggles its light (the scene decides what was hit).
  let active: Chapter | undefined;
  const onClick = (e: MouseEvent) => {
    if (!active?.pick || (e.target as Element).closest('a, button, input, select, label, .card, .phone, .bar')) return;
    active.pick(new THREE.Vector2((e.clientX / W) * 2 - 1, -(e.clientY / H) * 2 + 1));
  };
  addEventListener('click', onClick);

  // The phone's camera card: the courtyard, drawn in the same letters.
  const feedCols = 48, feedRows = 12;
  const feedSceneRT = new THREE.WebGLRenderTarget(feedCols * 4, feedRows * 6);
  const feedCellRT = new THREE.WebGLRenderTarget(feedCols, feedRows, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
  const feedPixels = new Uint8Array(feedCols * feedRows * 4);
  const feedCtx = feedCanvas?.getContext('2d');
  let feedVisible = false;
  if (feedCanvas) new IntersectionObserver(([e]) => (feedVisible = e.isIntersecting)).observe(feedCanvas);
  let lastFeed = 0;
  const drawFeed = (ch: Chapter) => {
    if (!ch.feed || !feedCtx || !feedCanvas) return;
    renderer.setRenderTarget(feedSceneRT);
    renderer.render(ch.scene, ch.feed);
    cellMat.uniforms.tScene.value = feedSceneRT.texture;
    cellMat.uniforms.uCells.value.set(feedCols, feedRows);
    cellMat.uniforms.uGain.value = 3.2; // night camera: lift the exposure like a real one would
    renderer.setRenderTarget(feedCellRT);
    renderer.render(cellQuad, quadCam);
    renderer.readRenderTargetPixels(feedCellRT, 0, 0, feedCols, feedRows, feedPixels);
    cellMat.uniforms.uCells.value.copy(compMat.uniforms.uCells.value);
    cellMat.uniforms.uGain.value = ch.gain ?? 1;
    const cw = feedCanvas.width / feedCols, chh = feedCanvas.height / feedRows;
    feedCtx.globalCompositeOperation = 'source-over';
    feedCtx.globalAlpha = 1;
    feedCtx.fillStyle = '#080807';
    feedCtx.fillRect(0, 0, feedCanvas.width, feedCanvas.height);
    for (let y = 0; y < feedRows; y++) {
      for (let x = 0; x < feedCols; x++) {
        const i = ((feedRows - 1 - y) * feedCols + x) * 4;
        const idx = feedPixels[i];
        if (idx < 1) continue;
        const sx = (idx % glyphs.grid[0]) * glyphs.cellW, sy = Math.floor(idx / glyphs.grid[0]) * glyphs.cellH;
        feedCtx.globalAlpha = 0.35 + (Math.max(feedPixels[i + 1], feedPixels[i + 2], feedPixels[i + 3]) / 255) * 0.65;
        feedCtx.drawImage(glyphs.atlas, sx, sy, glyphs.cellW, glyphs.cellH, x * cw, y * chh, cw, chh);
      }
    }
    feedCtx.globalAlpha = 1;
    feedCtx.globalCompositeOperation = 'multiply';
    feedCtx.fillStyle = '#efe2cc';
    feedCtx.fillRect(0, 0, feedCanvas.width, feedCanvas.height);
    feedCtx.globalCompositeOperation = 'source-over';
  };

  const showMarkers = (ch: Chapter | undefined, alpha: number) => {
    markers.forEach((m, i) => {
      const a = ch?.anchors?.[i];
      if (!a || !ch || alpha <= 0) { m.style.opacity = '0'; return; }
      const v = a.clone().project(ch.camera);
      if (!Number.isFinite(v.x) || !Number.isFinite(v.y)) return;
      m.style.transform = `translate(${((v.x + 1) / 2) * W}px, ${((1 - v.y) / 2) * H}px)`;
      m.style.opacity = String(alpha);
    });
  };

  let raf = 0, last = performance.now(), time = 0, blank = false;
  let frames = 0, spent = 0, lastTune = performance.now();
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!reduced) time += dt;

    const center = scrollY + H / 2;
    const span = spans.find((s) => center >= s.top && center < s.top + s.h);
    const name = span?.el.dataset.scene;
    if (span) {
      const next = spans[spans.indexOf(span) + 1]?.el.dataset.scene;
      if (next) get(next);
    }
    const ch = name ? get(name) : undefined;
    active = ch;
    floodable = span?.el.id === 'top';
    // Leaving the opening scene puts the letters back at once (even before the next scene loads).
    if (!floodable && (glass.real || glass.grow !== 0)) { if (glass.real) setReal(false, false); glass.grow = glass.vel = 0; }
    if (!ch || !span) {
      lensEl.classList.remove('on');
      showMarkers(undefined, 0);
      if (!blank) { renderer.setRenderTarget(null); renderer.clear(); blank = true; }
      return;
    }
    blank = false;

    const p = clamp01((center - span.top) / span.h);
    const edge = 0.3 * H;
    const fadeIn = span.el.id === 'top' ? 1 : smooth(0, edge, center - span.top);
    const fade = Math.min(fadeIn, smooth(0, edge, span.top + span.h - center));
    ch.update({ time, dt, p, el: span.el, aspect: W / H, W, H, mode: span.el.dataset.night, real: Math.min(1, Math.max(0, glass.grow)) });
    // Projections below need this frame's camera matrices, not last render's.
    ch.camera.updateMatrixWorld();

    // Lens placement: the pointer once it has moved, otherwise the scene's subject.
    if (reduced) { glass.grow = glass.real ? 1 : 0; glass.vel = 0; }
    else {
      glass.vel += ((glass.real ? 1 : 0) - glass.grow) * 70 * dt - glass.vel * 12 * dt;
      glass.grow += glass.vel * dt;
    }
    glass.hold = approach(glass.hold, glass.holding ? 1 : 0, dt, glass.holding ? 2.4 : 10);
    const flooded = glass.real && glass.grow > 0.995;
    const lensOn = ch.lens !== 0 && (fade > 0.6 || glass.grow > 0.01);
    const lw = (touch ? 64 : 80) * (1 + glass.hold * 0.14), lh = lw / 2;
    if (!lens.moved && ch.focus) {
      const v = ch.focus.clone().project(ch.camera);
      const x = ((v.x + 1) / 2) * W, y = ((1 - v.y) / 2) * H;
      if (Number.isFinite(x) && Number.isFinite(y)) { lens.tx = x; lens.ty = y; }
    }
    if (!lens.drag) {
      lens.x = approach(lens.x, lens.tx, dt, 9);
      lens.y = approach(lens.y, lens.ty, dt, 9);
    }
    lensEl.classList.toggle('on', lensOn && !glass.real);
    lensEl.style.width = `${lw * 2}px`;
    lensEl.style.height = `${lh * 2}px`;
    lensEl.style.transform = `translate(${lens.x - lw}px, ${lens.y - lh}px)`;
    // The glass's size: the small lens, swelling to cover the screen as `grow` reaches 1.
    const g = glass.grow;
    const reach = 0.4 * Math.max(W, H);
    const fx = Math.max(lens.x, W - lens.x) + reach, fy = Math.max(lens.y, H - lens.y) + reach;
    const k = g >= 0 ? g : 0;
    const wob = Math.max(-0.12, Math.min(0.12, glass.vel * 0.05)) * (1 - Math.min(1, Math.abs(g)));
    const gw = (lw + (fx - lw) * k) * (g < 0 ? 1 + g * 2 : 1) * (1 + wob);
    const gh = (lh + (fy - lh) * k) * (g < 0 ? 1 + g * 2 : 1) * (1 - wob);
    const u = compMat.uniforms;
    u.uRadius.value = Math.min(gw, gh) * 0.6 * pr;
    u.uBevel.value = Math.min(30, lh * 0.8) * pr;
    u.uGrow.value = Math.min(1, k);
    // The x-ray (device chapter) needs the shell cut away under the small lens only.
    if (lensOn && ch.lens === 2 && g < 0.01) lensPx.set(lens.x * pr, (H - lens.y) * pr, gw * pr, gh * pr);
    else lensPx.set(-9999, -9999, 1, 1);
    showMarkers(ch, (ch.anchorAlpha ?? 0) * (fade > 0.6 ? 1 : 0));

    renderer.setRenderTarget(sceneRT);
    renderer.render(ch.scene, ch.camera);
    const glyphOn = (ch.glyph > 0 || ch.lens !== 0) && !flooded;
    if (glyphOn) {
      cellMat.uniforms.tScene.value = sceneRT.texture;
      cellMat.uniforms.uGain.value = ch.gain ?? 1;
      renderer.setRenderTarget(cellRT);
      renderer.render(cellQuad, quadCam);
    }
    u.tScene.value = sceneRT.texture;
    u.tCells.value = cellRT.texture;
    u.uGlyphMix.value = glyphOn ? ch.glyph : 0;
    // Once the glass grows it shows the real scene everywhere it reaches, whatever the chapter.
    u.uLensMode.value = !lensOn || flooded ? 0 : g > 0.01 ? 1 : ch.lens;
    u.uLens.value.set(lens.x * pr, (H - lens.y) * pr, gw * pr, gh * pr);
    u.uFade.value = fade;
    u.uFall.value = ch.fall;
    u.uTime.value = time;
    renderer.setRenderTarget(null);
    renderer.render(compQuad, quadCam);

    if (ch.feed && feedVisible && now - lastFeed > 150) {
      lastFeed = now;
      drawFeed(ch);
    }

    // Adaptive resolution: aim for a steady frame rate on every device.
    frames++;
    spent += dt;
    if (now - lastTune > 2000 && frames > 30) {
      const avg = spent / frames;
      if (avg > 1 / 40 && scale > 0.55) { scale = Math.max(0.55, scale - 0.15); resize(); }
      else if (avg < 1 / 57 && scale < 1) { scale = Math.min(1, scale + 0.1); resize(); }
      frames = 0;
      spent = 0;
      lastTune = now;
    }
  };
  get('hero');
  raf = requestAnimationFrame(frame);

  return {
    stop() {
      cancelAnimationFrame(raf);
      removeEventListener('pointermove', onMove);
      removeEventListener('click', onClick);
      removeEventListener('resize', resize);
      ro.disconnect();
      lensEl.classList.remove('on');
      showMarkers(undefined, 0);
      renderer.dispose();
    },
  };
}
