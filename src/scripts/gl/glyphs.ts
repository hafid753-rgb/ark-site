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

/**
 * Pass 2: real image, glyph image, the liquid-glass lens and the chapter fade.
 * The glass optics (rounded-rect bevel, two-surface refraction, dispersion, Fresnel, highlights,
 * rim) are adapted from LiquidGlass by @ybouane, MIT License: see THIRD_PARTY_NOTICES.md.
 * Here they run inside the glyph composite, refracting the live scene rather than a page capture.
 */
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
      uBevel: { value: 30 },
      uPx: { value: 1 },
      uGrow: { value: 0 },
      uFade: { value: 1 },
      uFall: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: /* glsl */ `
      uniform sampler2D tScene, tCells, tAtlas;
      uniform vec2 uCells, uRes, uGrid;
      uniform float uCount, uGlyphMix, uLensMode, uRadius, uBevel, uPx, uGrow, uFade, uFall, uTime;
      uniform vec4 uLens;
      varying vec2 vUv;
      float hash(float n) { return fract(sin(n) * 43758.5453); }
      float rr(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
      float bevel(float d) { d = clamp(d, 0.0, uBevel); return sqrt(d * (2.0 * uBevel - d)); }

      // The letter drawn at pixel p (with the crumble applied).
      vec3 glyphAt(vec2 p) {
        vec2 cellPx = uRes / uCells;
        vec2 cell = floor(p / cellPx);
        vec2 local = fract(p / cellPx);
        float drop = uFall * uFall * (0.45 + hash(cell.x * 1.37)) * uCells.y * 1.25;
        vec2 src = vec2(cell.x, cell.y + floor(drop));
        vec4 cd = src.y < uCells.y && src.y >= 0.0 && src.x >= 0.0 && src.x < uCells.x ? texelFetch(tCells, ivec2(src), 0) : vec4(0.0);
        float idx = floor(cd.r * 255.0 + 0.5);
        float tick = floor(uTime * 12.0);
        if (uFall > 0.0 && idx > 0.5 && hash(src.x * 7.1 + src.y * 13.3 + tick) < uFall * 0.8)
          idx = 1.0 + floor(hash(src.y * 3.7 + src.x * 1.1 + tick) * (uCount - 1.0));
        vec2 g = vec2(mod(idx, uGrid.x), floor(idx / uGrid.x));
        vec2 lc = clamp(local, 0.04, 0.96); // stay inside the letter's own atlas cell
        vec2 auv = vec2((g.x + lc.x) / uGrid.x, (uGrid.y - 1.0 - g.y + lc.y) / uGrid.y);
        return cd.gba * texture2D(tAtlas, auv).r * 1.35 * (1.0 - uFall * 0.35);
      }
      vec3 realAt(vec2 p) { return texture2D(tScene, p / uRes).rgb; }

      void main() {
        vec2 p = vUv * uRes;
        vec3 outside = mix(realAt(p), glyphAt(p), uGlyphMix);
        vec3 col = outside;

        if (uLensMode > 0.5) {
          vec2 q = p - uLens.xy, half_ = uLens.zw;
          float r = min(uRadius, min(half_.x, half_.y));
          float sdf = rr(q, half_, r);
          if (sdf < 0.5 * uPx) {
            float inside = -sdf;
            float mask = 1.0 - smoothstep(-1.5 * uPx, 0.5 * uPx, sdf);
            float edge = smoothstep(min(min(half_.x, half_.y), 400.0 * uPx) * 0.35, 0.0, inside);
            // Surface normal from the bevel's height field.
            float e = 2.0 * uPx;
            float hR = bevel(-rr(q + vec2(e, 0.0), half_, r)), hL = bevel(-rr(q - vec2(e, 0.0), half_, r));
            float hU = bevel(-rr(q + vec2(0.0, e), half_, r)), hD = bevel(-rr(q - vec2(0.0, e), half_, r));
            vec2 grad = vec2(hR - hL, hU - hD) / (2.0 * e);
            vec3 N = normalize(vec3(-grad, 1.0));
            float depth = smoothstep(0.0, uBevel, inside);
            // Biconvex refraction, plus a gentle magnifier that fades as the glass grows.
            float thick = bevel(inside) / uBevel;
            vec2 refr = grad * (1.0 / 3.0) * (2.0 + thick * 0.5) * 0.69 * 30.0 * uPx;
            refr -= q / max(half_, vec2(1.0)) * 0.69 * 6.0 * uPx * depth * (1.0 - uGrow);
            vec2 b = p + refr;
            vec2 ca = N.xy * 0.12 * 36.0 * (edge * 0.7 + 0.3) * uPx;
            vec3 seen = uLensMode > 1.5
              ? glyphAt(b)
              : vec3(realAt(b + ca).r, realAt(b).g, realAt(b - ca).b);
            // Light on the glass: Fresnel, highlights from the top left, a thin inner rim.
            float fres = pow(1.0 - abs(N.z), 4.0);
            vec3 V = vec3(0.0, 0.0, 1.0);
            float spec = pow(max(dot(N, normalize(normalize(vec3(-0.4, 0.7, 1.0)) + V)), 0.0), 90.0)
                       + pow(max(dot(N, normalize(normalize(vec3(0.3, -0.5, 1.0)) + V)), 0.0), 50.0) * 0.3
                       + pow(max(dot(N, normalize(normalize(vec3(0.0, 0.9, 0.4)) + V)), 0.0), 120.0) * 0.6;
            float stroke = smoothstep(-2.5 * uPx, -1.5 * uPx, sdf) * (1.0 - smoothstep(-1.0 * uPx, 0.0, sdf));
            stroke *= 0.4 + 0.6 * (0.5 + 0.5 * q.y / half_.y);
            float rim = edge * 0.06 + smoothstep(5.0 * uPx, 0.0, inside) * 0.05;
            vec3 glass = seen + vec3(spec * 0.55 + rim + stroke * 0.3 + (N.y * 0.5 + 0.5) * fres * 0.08);
            glass = mix(glass, vec3(1.0), fres * 0.2);
            col = mix(outside, glass, mask);
          } else {
            // A soft shadow under the glass.
            float d = max(sdf - 1.0, 0.0) / (12.0 * uPx);
            col *= 1.0 - (exp(-d * d) * 0.65 + exp(-d * 2.5) * 0.35) * 0.35;
          }
        }

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
