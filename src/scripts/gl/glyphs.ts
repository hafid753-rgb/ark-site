import * as THREE from 'three';
import { regionCoverage, normalise } from './glyph-math';
import { FULLSCREEN_VERT, fullscreen } from './util';

// GPU glyph renderer. Pass 1 reads the rendered scene once per character cell,
// measures brightness in six regions and picks the letter whose shape matches
// best (after Alec Jacobson's ascii3d idea of matching glyph shapes, done on the GPU).
// Pass 2 draws that letter from an atlas, tinted with the scene's own colour.

export const MAX_GLYPHS = 48;
const ATLAS_COLS = 8;

export interface GlyphSet {
  chars: string[];
  atlas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
  vectors: number[][];
  grid: [number, number];
  cellW: number;
  cellH: number;
}

/** Draws the letters of the page's word (plus a space and a dot) into an atlas. */
export function buildGlyphs(word: string, font: string, rtl: boolean): GlyphSet {
  const unique = [...new Set([...word.replace(/\s/g, '')])].slice(0, MAX_GLYPHS - 2);
  const chars = [' ', '·', ...unique];
  const cellW = rtl ? 36 : 30;
  const cellH = 48;
  const rows = Math.ceil(chars.length / ATLAS_COLS);
  const atlas = document.createElement('canvas');
  atlas.width = ATLAS_COLS * cellW;
  atlas.height = rows * cellH;
  const ctx = atlas.getContext('2d', { willReadFrequently: true })!;
  // White on black, so the red channel is the anti-aliased ink coverage.
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, atlas.width, atlas.height);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `500 ${rtl ? 30 : 34}px ${font}`;
  chars.forEach((c, i) => ctx.fillText(c, (i % ATLAS_COLS) * cellW + cellW / 2, Math.floor(i / ATLAS_COLS) * cellH + cellH * 0.54));

  const vectors = normalise(
    chars.map((_, i) => {
      const x = (i % ATLAS_COLS) * cellW;
      const y = Math.floor(i / ATLAS_COLS) * cellH;
      return regionCoverage(ctx.getImageData(x, y, cellW, cellH).data, cellW, cellH, 4, 0);
    }),
  );

  const texture = new THREE.CanvasTexture(atlas);
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return { chars, atlas, texture, vectors, grid: [ATLAS_COLS, rows], cellW, cellH };
}

/** Pass 1: one texel per character cell. r = glyph index, gba = tint. */
export function cellMaterial(set: GlyphSet) {
  const flat: THREE.Vector3[] = [];
  set.vectors.forEach((v) => flat.push(new THREE.Vector3(v[0], v[1], v[2]), new THREE.Vector3(v[3], v[4], v[5])));
  while (flat.length < MAX_GLYPHS * 2) flat.push(new THREE.Vector3(9, 9, 9));
  return new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: null },
      uCells: { value: new THREE.Vector2(1, 1) },
      uGlyph: { value: flat },
      uCount: { value: set.chars.length },
      uGain: { value: 1 },
    },
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: /* glsl */ `
      uniform sampler2D tScene;
      uniform vec2 uCells;
      uniform vec3 uGlyph[${MAX_GLYPHS * 2}];
      uniform int uCount;
      uniform float uGain;
      varying vec2 vUv;
      float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
      void main() {
        vec2 size = 1.0 / uCells;
        vec2 base = floor(vUv * uCells) * size;
        float r[6];
        vec3 col = vec3(0.0);
        float hi = 0.0;
        for (int j = 0; j < 3; j++) {
          for (int i = 0; i < 2; i++) {
            vec2 c = base + size * vec2((float(i) + 0.5) / 2.0, 1.0 - (float(j) + 0.5) / 3.0);
            vec2 o = size * vec2(0.125, 0.083);
            vec3 s = (texture2D(tScene, c - o).rgb + texture2D(tScene, c + o).rgb
                    + texture2D(tScene, c + vec2(o.x, -o.y)).rgb + texture2D(tScene, c + vec2(-o.x, o.y)).rgb) * 0.25;
            col += s;
            // Slightly under 1 so bright surfaces use more of the alphabet, not just its densest letter.
            float l = clamp(lum(s) * uGain * 0.82, 0.0, 1.0);
            r[j * 2 + i] = l;
            hi = max(hi, l);
          }
        }
        col /= 6.0;
        // Sharpen: push each region toward the cell's own brightest region.
        for (int k = 0; k < 6; k++) r[k] = hi > 0.0 ? pow(r[k] / hi, 1.7) * hi : 0.0;
        int best = 0;
        float bestD = 1e9;
        for (int g = 0; g < ${MAX_GLYPHS}; g++) {
          if (g >= uCount) break;
          vec3 a = uGlyph[g * 2];
          vec3 b = uGlyph[g * 2 + 1];
          vec3 da = vec3(r[0], r[1], r[2]) - a;
          vec3 db = vec3(r[3], r[4], r[5]) - b;
          float d = dot(da, da) + dot(db, db);
          if (d < bestD) { bestD = d; best = g; }
        }
        if (hi < 0.025) best = 0;
        float peak = max(max(col.r, max(col.g, col.b)), 1e-4);
        vec3 tint = col / peak * clamp(hi * 1.5 + 0.2, 0.0, 1.0);
        // Exact in 8 bits: the reader rounds back to the integer index.
        gl_FragColor = vec4(float(best) / 255.0, tint);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
}

/** Pass 2: real image, glyph image, the lens window and the chapter fade. */
export function compositeMaterial(set: GlyphSet) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: null },
      tCells: { value: null },
      tAtlas: { value: set.texture },
      uCells: { value: new THREE.Vector2(1, 1) },
      uRes: { value: new THREE.Vector2(1, 1) },
      uGrid: { value: new THREE.Vector2(...set.grid) },
      uCount: { value: set.chars.length },
      uGlyphMix: { value: 0 },
      uLensMode: { value: 0 },
      uLens: { value: new THREE.Vector4(-999, -999, 1, 1) },
      uRadius: { value: 12 },
      uFade: { value: 1 },
      uFall: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: /* glsl */ `
      uniform sampler2D tScene, tCells, tAtlas;
      uniform vec2 uCells, uRes, uGrid;
      uniform float uCount, uGlyphMix, uLensMode, uRadius, uFade, uFall, uTime;
      uniform vec4 uLens;
      varying vec2 vUv;
      float hash(float n) { return fract(sin(n) * 43758.5453); }
      float sdBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
      void main() {
        vec2 p = vUv * uRes;
        vec2 cellPx = uRes / uCells;
        vec2 cell = floor(p / cellPx);
        vec2 local = fract(p / cellPx);

        // Crumble: each column pours down at its own speed, letters scramble as they fall.
        float drop = uFall * uFall * (0.45 + hash(cell.x * 1.37)) * uCells.y * 1.25;
        vec2 src = vec2(cell.x, cell.y + floor(drop));
        vec4 cd = src.y < uCells.y ? texelFetch(tCells, ivec2(src), 0) : vec4(0.0);
        float idx = floor(cd.r * 255.0 + 0.5);
        float tick = floor(uTime * 12.0);
        if (uFall > 0.0 && idx > 0.5 && hash(src.x * 7.1 + src.y * 13.3 + tick) < uFall * 0.8)
          idx = 1.0 + floor(hash(src.y * 3.7 + src.x * 1.1 + tick) * (uCount - 1.0));

        vec2 g = vec2(mod(idx, uGrid.x), floor(idx / uGrid.x));
        vec2 lc = clamp(local, 0.04, 0.96); // stay inside the letter's own atlas cell
        vec2 auv = vec2((g.x + lc.x) / uGrid.x, (uGrid.y - 1.0 - g.y + lc.y) / uGrid.y);
        float ink = texture2D(tAtlas, auv).r;
        vec3 glyph = cd.gba * ink * 1.35 * (1.0 - uFall * 0.35);

        vec3 real = texture2D(tScene, vUv).rgb;
        float inLens = 1.0 - smoothstep(-1.0, 1.0, sdBox(p - uLens.xy, uLens.zw, uRadius));
        float m = uGlyphMix;
        if (uLensMode > 0.5 && uLensMode < 1.5) m *= 1.0 - inLens;
        else if (uLensMode > 1.5) m = max(m, inLens);

        vec3 col = mix(real, glyph, m);
        vec2 v = vUv - 0.5;
        col *= 1.0 - dot(v, v) * 0.55;
        gl_FragColor = vec4(col * uFade, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    depthTest: false,
    depthWrite: false,
    toneMapped: true,
  });
}

export { fullscreen };
