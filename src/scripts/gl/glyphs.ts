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

// Strokes for edges and outlines: they let silhouettes read as shapes, while the word's letters fill surfaces.
const STROKES = ['-', '|', '/', '\\', '_', ':', '=', '#'];

/** Draws the letters of the page's word, plus a space, a dot and a few strokes, into an atlas. */
export function buildGlyphs(word: string, font: string, rtl: boolean): GlyphSet {
  const unique = [...new Set([...word.replace(/\s/g, '')])].slice(0, MAX_GLYPHS - 2 - STROKES.length);
  const chars = [' ', '·', ...STROKES, ...unique];
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
        if (hi < 0.05) best = 0; // a quieter background makes the shapes easier to read
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

export const MAX_PANELS = 8;

/**
 * Pass 2: the scene (letters and/or real), the chapter fade, and liquid glass on top:
 * headline text from a mask, and rounded panels where the page asks for them.
 * The glass optics (bevel height field, two-surface refraction, dispersion, Fresnel, highlights,
 * inner rim) are adapted from LiquidGlass by @ybouane, MIT License: see THIRD_PARTY_NOTICES.md.
 * Here they bend the live scene rather than a capture of the page.
 */
export function compositeMaterial(set: GlyphSet) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: null },
      tCells: { value: null },
      tAtlas: { value: set.texture },
      tText: { value: null },
      uCells: { value: new THREE.Vector2(1, 1) },
      uRes: { value: new THREE.Vector2(1, 1) },
      uGrid: { value: new THREE.Vector2(...set.grid) },
      uCount: { value: set.chars.length },
      uGlyphMix: { value: 0 },
      uPx: { value: 1 },
      uFade: { value: 1 },
      uFall: { value: 0 },
      uTime: { value: 0 },
      uText: { value: 0 },
      uTextTexel: { value: new THREE.Vector2(1, 1) },
      uPanels: { value: 0 },
      uPanel: { value: Array.from({ length: MAX_PANELS }, () => new THREE.Vector4()) },
      uPanelInfo: { value: Array.from({ length: MAX_PANELS }, () => new THREE.Vector4()) },
      uSeam: { value: new THREE.Vector3(-1e4, 0, 1) },
      uScrim: { value: new THREE.Vector2(1, 0) },
    },
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: /* glsl */ `
      uniform sampler2D tScene, tCells, tAtlas, tText;
      uniform vec2 uCells, uRes, uGrid, uTextTexel;
      uniform float uCount, uGlyphMix, uPx, uFade, uFall, uTime, uText;
      uniform int uPanels;
      uniform vec4 uPanel[${MAX_PANELS}];     // centre xy, half size zw (drawing-buffer px, y up)
      uniform vec4 uPanelInfo[${MAX_PANELS}]; // x radius px, y blue tint
      uniform vec3 uSeam;                     // where two chapters meet: y px, strength, half height px
      uniform vec2 uScrim;                    // text side: (1,0) left, (-1,0) right, (0,1) bottom
      varying vec2 vUv;
      const vec3 BLUE = vec3(0.022, 0.305, 1.0); // #2997ff, linear
      float hash(float n) { return fract(sin(n) * 43758.5453); }
      float rr(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }

      // The letter drawn at pixel p (with the crumble), leaning a little toward blue.
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
        vec3 c = cd.gba * texture2D(tAtlas, auv).r * 1.35 * (1.0 - uFall * 0.35);
        // Subtle blue: a slow drift across the field, and an occasional letter that is fully blue.
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        float drift = 0.5 + 0.5 * sin(cell.x * 0.045 - cell.y * 0.06 + uTime * 0.35);
        float spark = step(0.94, hash(cell.x * 12.9898 + cell.y * 78.233));
        return mix(c, BLUE * l * 3.0, 0.1 + 0.16 * drift + 0.55 * spark);
      }
      vec3 realAt(vec2 p) { return texture2D(tScene, p / uRes).rgb; }
      // The scene as the eye gets it: letters and/or real, vignette, chapter fade.
      vec3 baseAt(vec2 p) {
        vec3 c = uGlyphMix > 0.0 ? mix(realAt(p), glyphAt(p), uGlyphMix) : realAt(p);
        vec2 n = p / uRes, v = n - 0.5;
        // The scene dims on the text side so words stay readable; the glass on top is not dimmed.
        float t = uScrim.y > 0.5 ? n.y : (uScrim.x > 0.0 ? n.x : 1.0 - n.x);
        float scrim = uScrim.y > 0.5 ? mix(0.1, 1.0, smoothstep(0.0, 0.64, t)) : mix(0.22, 1.0, smoothstep(0.0, 0.56, t));
        return c * (1.0 - dot(v, v) * 0.55) * uFade * scrim;
      }
      vec3 spectral(vec2 p, vec2 ca) { return vec3(baseAt(p + ca).r, baseAt(p).g, baseAt(p - ca).b); }

      // Light on glass with surface normal N.
      vec3 sheen(vec3 N) {
        vec3 V = vec3(0.0, 0.0, 1.0);
        float fres = pow(1.0 - abs(N.z), 3.0);
        float spec = pow(max(dot(N, normalize(normalize(vec3(-0.4, 0.7, 1.0)) + V)), 0.0), 80.0)
                   + pow(max(dot(N, normalize(normalize(vec3(0.3, -0.5, 1.0)) + V)), 0.0), 50.0) * 0.3;
        return vec3(spec * 0.7 + fres * 0.35);
      }

      // Headline glass: height from a blurred copy of the text mask, so each letter is a rounded slab.
      vec4 textGlass(vec2 p) {
        if (uText < 0.5) return vec4(0.0);
        vec2 uv = p / uRes;
        vec2 m = textureLod(tText, uv, 0.0).rg; // explicit level: the mask has mipmaps for the bevel
        float cov = max(m.r, m.g);
        if (cov < 0.004) return vec4(0.0);
        vec2 e = uTextTexel * 1.5;
        float lod = 1.4;
        float hR = dot(textureLod(tText, uv + vec2(e.x, 0.0), lod).rg, vec2(1.0)), hL = dot(textureLod(tText, uv - vec2(e.x, 0.0), lod).rg, vec2(1.0));
        float hU = dot(textureLod(tText, uv + vec2(0.0, e.y), lod).rg, vec2(1.0)), hD = dot(textureLod(tText, uv - vec2(0.0, e.y), lod).rg, vec2(1.0));
        vec2 grad = vec2(hR - hL, hU - hD);
        vec3 N = normalize(vec3(-grad * 1.6, 1.0));
        // Refraction pulls the view inward from the rims; dispersion fringes them.
        vec2 at = p + grad * 9.0 * uPx;
        vec3 seen = spectral(at, N.xy * 2.5 * uPx);
        // A bit of white for clarity (blue for the figures), then the light on the glass.
        float blue = m.g / max(cov, 1e-3);
        vec3 tint = mix(vec3(1.0), BLUE * 1.6 + 0.15, blue);
        vec3 col = mix(seen, tint, mix(0.64, 0.7, blue)) + sheen(N);
        float rim = clamp(1.0 - textureLod(tText, uv, lod).r - textureLod(tText, uv, lod).g, 0.0, 1.0);
        col += rim * 0.18;
        return vec4(col, cov);
      }
      vec3 underPanels(vec2 p) {
        vec4 t = textGlass(p);
        return mix(baseAt(p), t.rgb, t.a);
      }

      void main() {
        vec2 p = vUv * uRes;

        // Where two chapters meet, the seam passes like a faint glass rod.
        vec2 q = p;
        float rod = 0.0;
        if (uSeam.y > 0.001) {
          float d = (p.y - uSeam.x) / uSeam.z;
          if (abs(d) < 1.0) {
            float h = sqrt(1.0 - d * d);
            rod = uSeam.y * h;
            q.y += (-d / max(h, 0.25)) * 16.0 * uPx * uSeam.y;
          }
        }
        vec3 col = rod > 0.0 ? spectral(q, vec2(0.0, 1.5 * uPx * uSeam.y)) + rod * 0.035 : baseAt(p);

        vec4 t = textGlass(p);
        col = mix(col, t.rgb, t.a);

        // Glass panels: the header, buttons and chips.
        for (int i = 0; i < ${MAX_PANELS}; i++) {
          if (i >= uPanels) break;
          vec4 P = uPanel[i];
          vec2 lp = p - P.xy;
          if (abs(lp.x) > P.z + 2.0 || abs(lp.y) > P.w + 2.0) continue;
          float r = min(uPanelInfo[i].x, min(P.z, P.w));
          float sdf = rr(lp, P.zw, r);
          if (sdf > 0.5 * uPx) continue;
          float inside = -sdf;
          float mask = 1.0 - smoothstep(-1.5 * uPx, 0.5 * uPx, sdf);
          float bev = min(min(P.z, P.w) * 0.45, 14.0 * uPx); // a rim, not a dome: the middle stays flat and clear
          float e2 = 1.5 * uPx;
          #define H(o) sqrt(clamp(-rr(lp + o, P.zw, r), 0.0, bev) * (2.0 * bev - clamp(-rr(lp + o, P.zw, r), 0.0, bev)))
          vec2 grad = vec2(H(vec2(e2, 0.0)) - H(vec2(-e2, 0.0)), H(vec2(0.0, e2)) - H(vec2(0.0, -e2))) / (2.0 * e2);
          vec3 N = normalize(vec3(-grad, 1.0));
          vec2 at = p + grad * (1.0 / 3.0) * 2.2 * 0.69 * 30.0 * uPx * 0.5;
          // Frosted a little: four nearby looks averaged with a sharp, fringed one, so busy letters calm down behind it.
          float fr = 5.0 * uPx;
          vec3 frost = (underPanels(at + vec2(fr, fr)) + underPanels(at + vec2(-fr, fr)) + underPanels(at + vec2(fr, -fr)) + underPanels(at - vec2(fr, fr))) * 0.25;
          vec3 seen = mix(underPanels(at), frost, 0.6);
          // Dispersion from the surface angle rather than three more looks: warm on one rim, cool on the other.
          seen += vec3(0.05, 0.0, -0.05) * dot(N.xy, normalize(vec2(1.0, 0.3))) * length(N.xy) * 4.0;
          float blue = uPanelInfo[i].y;
          vec3 glass = mix(seen * 0.7, mix(vec3(1.0), vec3(0.0, 0.17, 0.77), blue), mix(0.06, 0.85, blue)) + sheen(N) * 0.6;
          float stroke = smoothstep(-2.5 * uPx, -1.5 * uPx, sdf) * (1.0 - smoothstep(-1.0 * uPx, 0.0, sdf));
          glass += stroke * (0.25 + 0.2 * (0.5 + 0.5 * lp.y / P.w)) + smoothstep(6.0 * uPx, 0.0, inside) * 0.05;
          col = mix(col, glass, mask);
        }

        gl_FragColor = vec4(col, 1.0);
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
