import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildGlyphs, cellMaterial, compositeMaterial, fullscreen, MAX_PANELS } from './glyphs';
import { clamp01, smooth } from './util';
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
  const empty = new THREE.Scene();
  empty.background = new THREE.Color(0x000000);
  const ctx: SceneCtx = { renderer, env, glyphs, rtl, reduced };

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
  // ---------- Liquid glass ----------
  // Panels: elements marked data-glass become glass at their place on screen; the page keeps their
  // content and hit area. Blue ones: data-glass="blue", a chosen place, a switch that is on.
  const panels = [...document.querySelectorAll<HTMLElement>('[data-glass]')];
  const radii = new Map<HTMLElement, number>();
  const blueOf = (el: HTMLElement) =>
    el.dataset.glass === 'blue' || el.matches('.place:has(input:checked)') || (el.matches('.switch') && el.getAttribute('aria-pressed') === 'true') ? 1 : 0;
  const placePanels = () => {
    const u = compMat.uniforms;
    let n = 0;
    for (const el of panels) {
      if (n >= MAX_PANELS) break;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.bottom < 0 || r.top > H || r.right < 0 || r.left > W) continue;
      if (!radii.has(el)) radii.set(el, parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0);
      u.uPanel.value[n].set((r.left + r.width / 2) * pr, (H - r.top - r.height / 2) * pr, (r.width / 2) * pr, (r.height / 2) * pr);
      u.uPanelInfo.value[n].set(Math.min(radii.get(el)!, r.height / 2) * pr, blueOf(el), 0, 0);
      n++;
    }
    u.uPanels.value = n;
  };

  // Headlines: drawn into a mask (red = white glass, green = blue glass for the timeline figures)
  // whenever something moves, then turned into glass by the composite. Each word keeps its own
  // scroll-driven opacity and blur, so the focus pull still plays, in glass.
  const textEls = [...document.querySelectorAll<HTMLElement>('main :is(h1, h2, .closing-line) .w, main .year')];
  const mask = document.createElement('canvas');
  const mctx = mask.getContext('2d')!;
  const canFilter = 'filter' in mctx;
  const textTex = new THREE.CanvasTexture(mask);
  textTex.generateMipmaps = true;
  textTex.minFilter = THREE.LinearMipmapLinearFilter;
  let ms = 1, lastSig = '';
  function sizeText() {
    ms = W * H > 900000 ? 1 : Math.min(pr, 2); // big screens: CSS pixels are enough for headline sizes
    mask.width = Math.max(1, Math.round(W * ms));
    mask.height = Math.max(1, Math.round(H * ms));
    compMat.uniforms.uTextTexel.value.set(1 / mask.width, 1 / mask.height);
    lastSig = '';
    radii.clear();
  }
  const range = document.createRange();
  const drawText = () => {
    const items: { el: HTMLElement; r: DOMRect; st: CSSStyleDeclaration }[] = [];
    let sig = `${W}x${H}`;
    for (const el of textEls) {
      let r: DOMRect;
      if (el.classList.contains('w')) r = el.getBoundingClientRect();
      else { range.selectNodeContents(el); r = range.getBoundingClientRect(); }
      if (r.width < 1 || r.bottom < -40 || r.top > H + 40) continue;
      const st = getComputedStyle(el);
      const o = parseFloat(st.opacity);
      if (o < 0.02) continue;
      items.push({ el, r, st });
      sig += `|${r.left.toFixed(1)},${r.top.toFixed(1)},${o.toFixed(2)},${st.filter}`;
    }
    if (sig === lastSig) return;
    lastSig = sig;
    mctx.setTransform(ms, 0, 0, ms, 0, 0);
    mctx.filter = 'none';
    mctx.globalAlpha = 1;
    mctx.fillStyle = '#000'; // coverage lives in the colour channels, so the mask is drawn on black
    mctx.fillRect(0, 0, W, H);
    for (const { el, r, st } of items) {
      const holder = el.classList.contains('w') ? (el.parentElement as HTMLElement) : el;
      const hs = el.classList.contains('w') ? getComputedStyle(holder) : st;
      mctx.font = `${hs.fontWeight} ${hs.fontSize} ${hs.fontFamily}`;
      if ('letterSpacing' in mctx) (mctx as unknown as { letterSpacing: string }).letterSpacing = hs.letterSpacing === 'normal' ? '0px' : hs.letterSpacing;
      if (canFilter) mctx.filter = st.filter && st.filter !== 'none' ? st.filter : 'none';
      mctx.globalAlpha = parseFloat(st.opacity);
      mctx.fillStyle = el.classList.contains('year') ? '#00ff00' : '#ff0000';
      const m = mctx.measureText(el.textContent!);
      const asc = m.fontBoundingBoxAscent ?? parseFloat(hs.fontSize) * 0.8;
      const desc = m.fontBoundingBoxDescent ?? parseFloat(hs.fontSize) * 0.2;
      const y = r.top + (r.height - asc - desc) / 2 + asc;
      const rtlText = /[؀-ۿ]/.test(el.textContent!);
      mctx.direction = rtlText ? 'rtl' : 'ltr';
      mctx.textAlign = rtlText ? 'right' : 'left';
      mctx.textBaseline = 'alphabetic';
      mctx.fillText(el.textContent!, rtlText ? r.right : r.left, y);
    }
    textTex.needsUpdate = true;
  };
  compMat.uniforms.tText.value = textTex;
  compMat.uniforms.uText.value = 1;
  let glassOn = false;

  const resize = () => {
    W = innerWidth;
    H = innerHeight;
    pr = dpr * scale;
    renderer.setPixelRatio(pr);
    renderer.setSize(W, H, false);
    const bw = Math.max(1, Math.floor(W * pr)), bh = Math.max(1, Math.floor(H * pr));
    sceneRT.setSize(bw, bh);
    const cols = Math.floor(W / (rtl ? 10 : 8)), rows = Math.floor(H / (rtl ? 16 : 14));
    cellRT.setSize(cols, rows);
    cellMat.uniforms.uCells.value.set(cols, rows);
    compMat.uniforms.uCells.value.set(cols, rows);
    compMat.uniforms.uRes.value.set(bw, bh);
    compMat.uniforms.uPx.value = pr;
    compMat.uniforms.uScrim.value.set(rtl ? -1 : 1, W < 900 ? 1 : 0); // matches the page's 899px breakpoint
    sizeText();
    measure();
  };
  resize();
  const ro = new ResizeObserver(() => measure());
  ro.observe(document.body);
  addEventListener('resize', resize);

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
    const u = compMat.uniforms;
    placePanels();
    drawText();
    u.uTime.value = time;
    if (!glassOn) { glassOn = true; root.dataset.glassOn = ''; }
    if (frames % 30 === 0) radii.clear(); // pick up shapes that change with state (the header turns into a pill)

    if (!ch || !span) {
      // No scene here, but the glass (header, headlines, buttons) still needs drawing.
      showMarkers(undefined, 0);
      // A real (empty) render, not a clear: a multisampled target only updates its texture on render.
      if (!blank) { renderer.setRenderTarget(sceneRT); renderer.render(empty, quadCam); blank = true; }
      u.tScene.value = sceneRT.texture;
      u.uGlyphMix.value = 0;
      u.uFade.value = 1;
      u.uFall.value = 0;
      u.uSeam.value.set(-1e4, 0, 1);
      renderer.setRenderTarget(null);
      renderer.render(compQuad, quadCam);
      return;
    }
    blank = false;

    const p = clamp01((center - span.top) / span.h);
    const edge = 0.3 * H;
    const fadeIn = span.el.id === 'top' ? 1 : smooth(0, edge, center - span.top);
    const fadeOut = smooth(0, edge, span.top + span.h - center);
    const fade = Math.min(fadeIn, fadeOut);
    ch.update({ time, dt, p, el: span.el, aspect: W / H, W, H, mode: span.el.dataset.night });
    // Projections below need this frame's camera matrices, not last render's.
    ch.camera.updateMatrixWorld();
    showMarkers(ch, (ch.anchorAlpha ?? 0) * (fade > 0.6 ? 1 : 0));

    // The seam to the neighbouring chapter, as a faint glass rod while it crosses the screen.
    const seamY = fadeIn < fadeOut ? span.top - scrollY : span.top + span.h - scrollY;
    u.uSeam.value.set((H - seamY) * pr, fade < 1 ? (1 - fade) * 0.9 : 0, 0.14 * H * pr);

    renderer.setRenderTarget(sceneRT);
    renderer.render(ch.scene, ch.camera);
    const glyphOn = ch.glyph > 0;
    if (glyphOn) {
      cellMat.uniforms.tScene.value = sceneRT.texture;
      cellMat.uniforms.uGain.value = ch.gain ?? 1;
      renderer.setRenderTarget(cellRT);
      renderer.render(cellQuad, quadCam);
    }
    u.tScene.value = sceneRT.texture;
    u.tCells.value = cellRT.texture;
    u.uGlyphMix.value = glyphOn ? ch.glyph : 0;
    u.uFade.value = fade;
    u.uFall.value = ch.fall;
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
      removeEventListener('click', onClick);
      removeEventListener('resize', resize);
      ro.disconnect();
      showMarkers(undefined, 0);
      delete root.dataset.glassOn;
      textTex.dispose();
      renderer.dispose();
    },
  };
}
