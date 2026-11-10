import * as THREE from 'three';
import { seeded } from './util';
import type { Chapter, SceneCtx } from './types';

type Kind = 'film' | 'album' | 'book';
// A home library: titles a household here might own. The covers are generated; no artwork is copied.
const SHELF: [string, Kind][] = [
  ['Timbuktu', 'film'], ['Abbey Road', 'album'], ['Le Petit Prince', 'book'], ['Interstellar', 'film'],
  ['Discovery', 'album'], ['Dune', 'book'], ['ألف ليلة وليلة', 'book'], ['Spirited Away', 'film'],
  ['Kind of Blue', 'album'], ['Nineteen Eighty-Four', 'book'], ['Casablanca', 'film'], ['أم كلثوم', 'album'],
  ['The Hobbit', 'book'], ['Lawrence of Arabia', 'film'], ['Talking Timbuktu', 'album'], ['موسم الهجرة إلى الشمال', 'book'],
  ['Heremakono', 'film'], ['Random Access Memories', 'album'], ['Les Misérables', 'book'], ['Seven Samurai', 'film'],
  ['Thriller', 'album'], ['The Odyssey', 'book'], ['Bamako', 'film'], ['The Dark Side of the Moon', 'album'],
];
const PALETTES = [
  ['#0f0e0d', '#e3a55a'], ['#e9e2d4', '#1f2a44'], ['#1f2a44', '#e9e2d4'], ['#b4472f', '#f2e6d0'],
  ['#2b2b2b', '#d8d3c8'], ['#d8b07a', '#151412'], ['#26332c', '#e7dcc6'], ['#efe9de', '#b4472f'],
];
const COLS = 8, ROWS = 3, CW = 256, CH = 384;

/** A library that flows like a dune: films, albums and books kept at home. */
export function create(ctx: SceneCtx): Chapter {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);

  const canvas = document.createElement('canvas');
  canvas.width = COLS * CW;
  canvas.height = ROWS * CH;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const kinds = JSON.parse(document.getElementById('cinema')?.dataset.kinds ?? '{}') as Record<Kind, string>;
  const root = getComputedStyle(document.documentElement);
  const sans = root.getPropertyValue('--sans').trim();
  const mono = root.getPropertyValue('--mono').trim();
  const arabic = "'IBM Plex Sans Arabic', sans-serif";
  Promise.all([document.fonts.load(`500 30px ${sans}`), document.fonts.load(`500 30px ${arabic}`, 'ليل'), document.fonts.load(`400 16px ${mono}`)])
    .catch(() => {})
    .then(() => {
      drawCovers(canvas.getContext('2d')!, kinds, sans, mono, arabic);
      tex.needsUpdate = true;
    });

  const N = SHELF.length;
  const geo = new THREE.PlaneGeometry(1, 1.5);
  const cover = new Float32Array(N), fade = new Float32Array(N);
  for (let i = 0; i < N; i++) cover[i] = i;
  geo.setAttribute('aCover', new THREE.InstancedBufferAttribute(cover, 1));
  const fadeAttr = new THREE.InstancedBufferAttribute(fade, 1);
  geo.setAttribute('aFade', fadeAttr);
  const mat = new THREE.ShaderMaterial({
    uniforms: { tCovers: { value: tex } },
    vertexShader: /* glsl */ `
      attribute float aCover, aFade;
      varying vec2 vUv;
      varying float vFade;
      void main() {
        float col = mod(aCover, ${COLS}.0), row = floor(aCover / ${COLS}.0);
        vUv = vec2((col + uv.x) / ${COLS}.0, (${ROWS}.0 - 1.0 - row + uv.y) / ${ROWS}.0);
        vFade = aFade;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tCovers;
      varying vec2 vUv;
      varying float vFade;
      void main() {
        vec4 c = texture2D(tCovers, vUv);
        gl_FragColor = vec4(c.rgb * vFade, 1.0);
        #include <colorspace_fragment>
      }
    `,
    side: THREE.DoubleSide,
  });
  const shelf = new THREE.InstancedMesh(geo, mat, N);
  shelf.frustumCulled = false;
  scene.add(shelf);

  // The ribbon's path: a dune crest seen from the side.
  const path = new THREE.CatmullRomCurve3(
    Array.from({ length: 9 }, (_, i) => {
      const x = -17 + i * 4.25;
      return new THREE.Vector3(x, Math.sin(i * 0.9) * 0.9 + Math.sin(i * 0.37) * 0.5, -1.5 + Math.cos(i * 0.7) * 2.2);
    }),
  );
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1.25, 1.25, 1.25);
  const pos = new THREE.Vector3(), tan = new THREE.Vector3();

  const ch: Chapter = {
    scene,
    camera,
    glyph: 0,
    fall: 0,
    update(f) {
      const offset = f.p * 0.85 + (ctx.reduced ? 0 : f.time * 0.006);
      for (let i = 0; i < N; i++) {
        const u = (((i / N + offset) % 1) + 1) % 1;
        path.getPointAt(u, pos);
        path.getTangentAt(u, tan);
        e.set(Math.sin(u * 20 + i) * 0.04, -Math.atan2(tan.z, tan.x) * 0.55, Math.atan2(tan.y, tan.x) * 0.5);
        m.compose(pos, q.setFromEuler(e), s);
        shelf.setMatrixAt(i, m);
        fade[i] = Math.min(1, u * 8, (1 - u) * 8);
      }
      shelf.instanceMatrix.needsUpdate = true;
      fadeAttr.needsUpdate = true;

      const wide = f.aspect > 1.05;
      const side = ctx.rtl ? -1 : 1;
      shelf.position.set(wide ? 3 * side : 0, wide ? 0 : 2.2, 0);
      camera.aspect = f.aspect;
      camera.position.set(0, 1.2, wide ? 15 : 24);
      camera.lookAt(0, wide ? 0 : 0.6, 0);
      camera.updateProjectionMatrix();
    },
  };
  return ch;
}

function drawCovers(c: CanvasRenderingContext2D, kinds: Record<Kind, string>, sans: string, mono: string, arabic: string) {
  SHELF.forEach(([title, kind], i) => {
    const x0 = (i % COLS) * CW, y0 = Math.floor(i / COLS) * CH;
    const rand = seeded(i * 97 + 13);
    const [bg, ink] = PALETTES[Math.floor(rand() * PALETTES.length)];
    c.save();
    c.beginPath();
    c.rect(x0, y0, CW, CH);
    c.clip();
    c.fillStyle = bg;
    c.fillRect(x0, y0, CW, CH);
    c.strokeStyle = c.fillStyle = ink;
    const style = i % 6;
    const cx = x0 + CW / 2, cy = y0 + CH * 0.42;
    if (style === 0) {
      // rings
      c.lineWidth = 2;
      for (let r = 12; r < 150; r += 14) { c.beginPath(); c.ellipse(cx, cy, r * 1.06, r, 0, 0, Math.PI * 2); c.stroke(); }
    } else if (style === 1) {
      // bands
      let y = y0 + 40;
      while (y < y0 + CH * 0.72) { const h = 4 + rand() * 22; c.fillRect(x0 + 24, y, CW - 48, h); y += h + 6 + rand() * 14; }
    } else if (style === 2) {
      // painted chevrons, in the spirit of hand-painted walls
      c.lineWidth = 5;
      for (let k = 0; k < 7; k++) {
        c.beginPath();
        for (let j = 0; j <= 8; j++) c.lineTo(x0 + 20 + j * 27, y0 + 60 + k * 30 + (j % 2 ? 14 : 0));
        c.stroke();
      }
    } else if (style === 3) {
      // a sun on a horizon
      c.beginPath(); c.arc(cx, cy, 58, 0, Math.PI * 2); c.fill();
      c.fillRect(x0, cy + 70, CW, 3);
    } else if (style === 4) {
      // dots on a grid
      for (let gy = 0; gy < 8; gy++) for (let gx = 0; gx < 6; gx++) {
        c.beginPath(); c.arc(x0 + 38 + gx * 36, y0 + 40 + gy * 30, 2 + rand() * 7, 0, Math.PI * 2); c.fill();
      }
    } else {
      // a window, the mark's opening
      c.lineWidth = 6;
      c.strokeRect(cx - 70, cy - 35, 140, 70);
      c.strokeRect(cx - 40, cy - 70, 140, 70);
    }
    const isArabic = /[؀-ۿ]/.test(title);
    // Long titles shrink to fit the cover.
    let size = 26;
    do { c.font = `500 ${size}px ${isArabic ? arabic : sans}`; } while (c.measureText(title).width > CW - 40 && --size > 12);
    c.direction = isArabic ? 'rtl' : 'ltr';
    c.textAlign = isArabic ? 'right' : 'left';
    c.fillText(title, isArabic ? x0 + CW - 20 : x0 + 20, y0 + CH - 30);
    c.font = `400 14px ${mono}`;
    c.direction = 'ltr';
    c.textAlign = 'left';
    c.globalAlpha = 0.75;
    c.fillText((kinds[kind] ?? kind).toUpperCase(), x0 + 20, y0 + 28);
    c.globalAlpha = 1;
    c.restore();
  });
}
