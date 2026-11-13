import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildGlyphs, cellMaterial, baseMaterial, transitionMaterial, fullscreen } from './glyphs';
import { approach, clamp01, lerp, smooth } from './util';
import type { Chapter, SceneCtx } from './types';

type Factory = (ctx: SceneCtx) => Chapter;
const SCENES: Record<string, () => Promise<{ create: Factory }>> = {
  hero: () => import('./hero'),
  rented: () => import('./rented'),
  device: () => import('./device'),
  night: () => import('./night'),
  cinema: () => import('./cinema'),
  places: () => import('./places'),
  network: () => import('./network'),
  dawn: () => import('./dawn'),
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
  // Scenes without a background leave alpha 0: real 3D then blends onto the page's paper by coverage.
  renderer.setClearColor(0x000000, 0);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const font = getComputedStyle(root).getPropertyValue(rtl ? '--sans' : '--mono').trim();
  const word = root.dataset.glyphs ?? 'sovereignty';
  await document.fonts.load(`500 34px ${font}`, word).catch(() => {});
  const glyphs = buildGlyphs(word, font, rtl);

  const half = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
  // Real 3D keeps its light above 1 (half float) and gets mip levels, which the base pass reads as bloom.
  const sceneRT = new THREE.WebGLRenderTarget(1, 1, {
    type: half ? THREE.HalfFloatType : THREE.UnsignedByteType, samples: 4, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter,
  });
  const cellRT = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
  const cellMat = cellMaterial(glyphs);
  // The base (paper, letters, image) goes to a mip-mapped target; the glass pass reads it sharp or blurred.
  // Scenes drawn in letters are only ever read a few times per character cell, so they render small.
  const loRT = new THREE.WebGLRenderTarget(1, 1, { type: half ? THREE.HalfFloatType : THREE.UnsignedByteType });
  const baseRT = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
  baseRT.texture.colorSpace = THREE.SRGBColorSpace; // display colours in 8 bits, without banding in the darks
  const baseMat = baseMaterial(glyphs);
  const glassMat = transitionMaterial();
  const cellQuad = fullscreen(cellMat);
  const baseQuad = fullscreen(baseMat);
  const glassQuad = fullscreen(glassMat);
  glassMat.uniforms.tBase.value = baseRT.texture;
  const quadCam = new THREE.OrthographicCamera();
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
  // Glass on buttons, the header and headlines is drawn by the page (CSS), so it moves with the page.
  // The stage keeps only the transition between chapters (a pixelate, after gl-transitions).

  const resize = () => {
    W = innerWidth;
    H = innerHeight;
    pr = dpr * scale;
    renderer.setPixelRatio(pr);
    renderer.setSize(W, H, false);
    const bw = Math.max(1, Math.floor(W * pr)), bh = Math.max(1, Math.floor(H * pr));
    // The real 3D image is soft by nature (night, fog, shadows): it renders at a capped size and is
    // smoothed by multisampling, which costs far less than full retina resolution.
    const sr = Math.min(pr, touch ? 1 : 1.25);
    sceneRT.setSize(Math.max(1, Math.floor(W * sr)), Math.max(1, Math.floor(H * sr)));
    const cols = Math.floor(W / (rtl ? 7 : 6)), rows = Math.floor(H / (rtl ? 12 : 11));
    cellRT.setSize(cols, rows);
    loRT.setSize(cols * 4, rows * 6); // one texel per tap of the cell pass
    cellMat.uniforms.uCells.value.set(cols, rows);
    baseMat.uniforms.uCells.value.set(cols, rows);
    baseRT.setSize(bw, bh);
    for (const m of [baseMat, glassMat]) {
      m.uniforms.uRes.value.set(bw, bh);
      m.uniforms.uPx.value = pr;
    }
    baseMat.uniforms.uScrim.value.set(rtl ? -1 : 1, W < 900 ? 1 : 0); // matches the page's 899px breakpoint
    measure();
  };
  resize();
  const ro = new ResizeObserver(() => measure());
  ro.observe(document.body);
  addEventListener('resize', resize);

  // The light on the glass leans toward the pointer.
  const light = { x: 0, y: 0, tx: 0, ty: 0 };
  const pointer = { x: -1e4, y: -1e4, on: 0, at: 0 }; // stirs and lights the letters; fades when it rests
  const onPointer = (e: PointerEvent) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.at = performance.now();
    light.tx = (e.clientX / W) * 2 - 1;
    light.ty = 1 - (e.clientY / H) * 2;
  };
  addEventListener('pointermove', onPointer, { passive: true });

  // Day and night. The story sets it by chapter (data-sky="night"); the theme button pins it to night.
  const canMix = CSS.supports('color', 'color-mix(in srgb, red, blue)');
  const skyOf = (i: number) => (spans[i]?.el.dataset.sky === 'night' ? 1 : 0);
  let night = root.dataset.theme === 'dark' || !canMix ? 1 : 0, shownNight = -1;

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
    cellMat.uniforms.uCells.value.copy(baseMat.uniforms.uCells.value);
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

  const showMarkers = (ch: Chapter | undefined, alpha: number, el?: HTMLElement) => {
    let k = 0;
    markers.forEach((m) => {
      const i = el?.contains(m) ? k++ : -1; // anchor i drives the i-th marker of the chapter's own section
      const a = i >= 0 ? ch?.anchors?.[i] : undefined;
      if (!a || !ch || alpha <= 0) { m.style.opacity = '0'; return; }
      const v = a.clone().project(ch.camera);
      if (!Number.isFinite(v.x) || !Number.isFinite(v.y)) return;
      m.style.transform = `translate(${((v.x + 1) / 2) * W}px, ${((1 - v.y) / 2) * H}px)`;
      m.style.opacity = String(alpha);
    });
  };

  let raf = 0, last = performance.now(), time = 0;
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

    // Where we are in the chapter, and how close to its seams.
    const edge = 0.3 * H;
    let p = 0, fade = 0, seamY = -1e4, seamK = 0, story = 0;
    if (span) {
      const i = spans.indexOf(span);
      p = clamp01((center - span.top) / span.h);
      const fadeIn = i === 0 ? 1 : smooth(0, edge, center - span.top);
      const fadeOut = i === spans.length - 1 ? 1 : smooth(0, edge, span.top + span.h - center);
      fade = Math.min(fadeIn, fadeOut);
      seamY = fadeIn < fadeOut ? span.top - scrollY : span.top + span.h - scrollY;
      seamK = 1 - fade;
      // Night arrives through the seam: halfway at the boundary, complete once the chapter has settled.
      const own = skyOf(i);
      story = fadeIn < fadeOut ? lerp((skyOf(i - 1) + own) / 2, own, fadeIn) : lerp((own + skyOf(i + 1)) / 2, own, fadeOut);
    }
    const pinned = root.dataset.theme === 'dark' || !canMix;
    night = pinned ? approach(night, 1, dt, 5) : Math.abs(night - story) > 0.2 ? approach(night, story, dt, 5) : story;
    if (Math.abs(night - shownNight) > 0.004) { shownNight = night; root.style.setProperty('--night', night.toFixed(3)); }
    light.x = approach(light.x, light.tx, dt, 4);
    light.y = approach(light.y, light.ty, dt, 4);

    const ub = baseMat.uniforms, ug = glassMat.uniforms;
    ub.uTime.value = time;
    ub.uNight.value = night;
    ub.uScroll.value = scrollY * pr;
    ub.uSky.value = 1 - 0.85 * smooth(0.25 * H, 1.1 * H, scrollY);
    // Near a chapter seam the picture pixelates into blocks, then resolves into the next chapter.
    ug.uProgress.value = seamK;

    let glyphOn = false;
    if (ch && span) {
      ch.update({ time, dt, p, el: span.el, aspect: W / H, W, H, mode: span.el.dataset.night, pointer: light });
      // Projections below need this frame's camera matrices, not last render's.
      ch.camera.updateMatrixWorld();
      showMarkers(ch, (ch.anchorAlpha ?? 0) * (fade > 0.6 ? 1 : 0), span.el);
      glyphOn = ch.glyph > 0;
      const target = ch.glyph >= 1 ? loRT : sceneRT; // full size only when the real image is shown
      renderer.setRenderTarget(target);
      renderer.render(ch.scene, ch.camera);
      ub.tScene.value = target.texture;
      if (glyphOn) {
        cellMat.uniforms.tScene.value = target.texture;
        cellMat.uniforms.uGain.value = ch.gain ?? 1;
        renderer.setRenderTarget(cellRT);
        renderer.render(cellQuad, quadCam);
      }
    } else {
      showMarkers(undefined, 0);
    }
    ub.tCells.value = cellRT.texture;
    ub.uGlyphMix.value = glyphOn && ch ? ch.glyph : 0;
    ub.uFade.value = ch && span ? fade : 0; // no scene here: only paper and mosaics under the glass
    ub.uFall.value = ch?.fall ?? 0;
    ub.uPointer.value.set(pointer.x * pr, (H - pointer.y) * pr, pointer.on);
    pointer.on = approach(pointer.on, performance.now() - pointer.at < 1600 ? 1 : 0, dt, 5);
    if (seamK > 0.004) {
      // A seam is near: the base goes through the pixelate transition.
      renderer.setRenderTarget(baseRT);
      renderer.render(baseQuad, quadCam);
      renderer.setRenderTarget(null);
      renderer.render(glassQuad, quadCam);
    } else {
      // Most of the time there is no glass on the canvas: one pass, straight to the screen.
      renderer.setRenderTarget(null);
      renderer.render(baseQuad, quadCam);
    }
    if (!ch) return;

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
      removeEventListener('pointermove', onPointer);
      root.style.removeProperty('--night');
      removeEventListener('resize', resize);
      ro.disconnect();
      showMarkers(undefined, 0);
      baseRT.dispose();
      loRT.dispose();
      renderer.dispose();
    },
  };
}
