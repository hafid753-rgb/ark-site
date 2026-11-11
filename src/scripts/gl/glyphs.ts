import * as THREE from 'three';
import { regionCoverage, normalise } from './glyph-math';
import { FULLSCREEN_VERT, fullscreen } from './util';

// GPU glyph renderer. Pass 1 reads the rendered scene once per character cell,
// measures brightness in six regions and picks the letter whose shape matches
// best (after Alec Jacobson's ascii3d idea of matching glyph shapes, done on the GPU).
// Pass 2 draws that letter from an atlas onto the page's paper; pass 3 lays liquid glass over it.

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


const COMMON = /* glsl */ `
  const vec3 BLUE = vec3(0.022, 0.305, 1.0);   // #2997ff, linear
  const vec3 DEEP = vec3(0.0, 0.14, 0.68);     // #0068d6, linear
  const vec3 NAVY = vec3(0.004, 0.018, 0.041); // #0e2439, linear
  vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
  float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  float hash2(vec2 v) { return fract(sin(dot(v, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 v) {
    vec2 i = floor(v), f = fract(v);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float rr(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
`;

/**
 * Pass 2: the page's "paper" and everything drawn on it, before any glass.
 * By day the paper is a pale sky and the scene is drawn on it in blue ink letters; by night the
 * paper is black and the letters (or the real 3D image) give light. uNight blends the two.
 * Written to a mip-mapped target, so the glass pass can read it sharp or blurred.
 */
export function baseMaterial(set: GlyphSet) {
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
      uPx: { value: 1 },
      uFade: { value: 1 },
      uFall: { value: 0 },
      uTime: { value: 0 },
      uScrim: { value: new THREE.Vector2(1, 0) },
      uScroll: { value: 0 },
      uNight: { value: 0 },
      uSky: { value: 1 },
      uPointer: { value: new THREE.Vector3(-1e4, -1e4, 0) },
    },
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: /* glsl */ `
      uniform vec3 uPointer; // pointer in drawing-buffer px (y up), z = how present it is
      uniform float uSky; // 1 on the opening screen (vivid sky), easing to clean paper below
      uniform sampler2D tScene, tCells, tAtlas;
      uniform vec2 uCells, uRes, uGrid;
      uniform vec2 uScrim;    // text side: (1,0) left, (-1,0) right, (0,1) bottom
      uniform float uCount, uGlyphMix, uPx, uFade, uFall, uTime, uScroll, uNight;
      varying vec2 vUv;
      ${COMMON}

      // three.js's ACES filmic curve, applied here to the 3D image only (paper and ink are display colours).
      vec3 fit(vec3 v) { return (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.4329510) + 0.238081); }
      vec3 aces(vec3 c) {
        const mat3 A = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
        const mat3 B = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
        return clamp(B * fit(A * (c / 0.6)), 0.0, 1.0);
      }

      // The letter at pixel p: rgb = the scene's tint there, a = how much ink the letter puts down.
      // drift and spark say how blue it leans.
      vec4 glyphAt(vec2 p, out float drift, out float spark) {
        vec2 cellPx = uRes / uCells;
        vec2 cell = floor(p / cellPx);
        vec2 local = fract(p / cellPx);
        // Crumble: each column pours down at its own speed, letters scramble as they fall.
        float drop = uFall * uFall * (0.45 + hash(cell.x * 1.37)) * uCells.y * 1.25;
        vec2 src = vec2(cell.x, cell.y + floor(drop));
        vec4 cd = src.y < uCells.y && src.y >= 0.0 && src.x >= 0.0 && src.x < uCells.x ? texelFetch(tCells, ivec2(src), 0) : vec4(0.0);
        float idx = floor(cd.r * 255.0 + 0.5);
        float tick = floor(uTime * 12.0);
        if (uFall > 0.0 && idx > 0.5 && hash(src.x * 7.1 + src.y * 13.3 + tick) < uFall * 0.8)
          idx = 1.0 + floor(hash(src.y * 3.7 + src.x * 1.1 + tick) * (uCount - 1.0));
        // Decode: as a chapter arrives or leaves, its letters shuffle before they settle.
        float dec = 1.0 - uFade;
        if (dec > 0.02 && idx > 0.5 && hash(src.x * 3.3 + src.y * 7.7 + tick) < dec * 0.9)
          idx = 10.0 + floor(hash(src.y * 2.9 + src.x * 5.1 + tick) * (uCount - 10.0));
        // The pointer stirs the letters it passes over.
        vec2 pc = (cell + 0.5) * cellPx - uPointer.xy;
        float near = exp(-dot(pc, pc) / (120.0 * 120.0 * uPx * uPx)) * uPointer.z;
        if (idx > 0.5 && hash(cell.x * 9.7 + cell.y * 4.3 + tick) < near * 0.45)
          idx = 10.0 + floor(hash(cell.y * 6.1 + cell.x * 2.3 + tick) * (uCount - 10.0));
        // Alive: now and then a letter quietly becomes another letter of the word.
        float slow = floor(uTime * 0.5 + hash(cell.x * 3.1 + cell.y * 5.7) * 9.0);
        if (idx > 9.5 && hash(cell.x * 1.7 + cell.y * 9.1 + slow) < 0.04) idx = 10.0 + floor(hash(slow + cell.x * 0.37) * (uCount - 10.0));
        vec2 g = vec2(mod(idx, uGrid.x), floor(idx / uGrid.x));
        vec2 lc = clamp(local, 0.04, 0.96); // stay inside the letter's own atlas cell
        vec2 auv = vec2((g.x + lc.x) / uGrid.x, (uGrid.y - 1.0 - g.y + lc.y) / uGrid.y);
        drift = 0.5 + 0.5 * sin(cell.x * 0.045 - cell.y * 0.06 + uTime * 0.35);
        spark = step(0.94, hash(cell.x * 12.9898 + cell.y * 78.233));
        return vec4(cd.gba, texture2D(tAtlas, auv).r * (1.0 - uFall * 0.35));
      }

      // Pixel mosaics: a few small clusters of square tiles in blues (baby blue, cyan, Apple blue,
      // a deeper blue), drifting, twinkling and scrolling at half speed. rgb = tile colour, a = strength.
      vec4 mosaic(vec2 p, float side) {
        float size = 11.0 * uPx;
        vec2 q = p + vec2(0.0, uScroll * 0.5);
        vec2 tile = floor(q / size);
        vec2 in_ = fract(q / size);
        float body = step(0.09, in_.x) * step(0.09, in_.y) * step(in_.x, 0.91) * step(in_.y, 0.91);
        float n = noise(tile * 0.085 + vec2(uTime * 0.025, -uTime * 0.015));
        float density = smoothstep(0.8, 0.93, n);
        float h = hash2(tile);
        if (h > density * 0.6) return vec4(0.0);
        float pick = hash2(tile + 17.0);
        vec3 col = pick < 0.3 ? vec3(0.25, 0.62, 0.87)   // baby blue  #89cff0
                 : pick < 0.55 ? vec3(0.13, 0.64, 1.0)   // cyan       #64d2ff
                 : pick < 0.85 ? BLUE                    // Apple blue #2997ff
                 : vec3(0.0, 0.165, 0.77);               // deep blue  #0071e3
        float twinkle = 0.65 + 0.35 * sin(uTime * 1.2 + h * 40.0);
        return vec4(col, body * twinkle * smoothstep(0.4, 0.7, side));
      }

      void main() {
        vec2 p = vUv * uRes;
        float nf = smoothstep(0.34, 0.5, uNight); // ink flips to light a little before the paper is dark
        // 0 on the side where the words are, 1 on the scene's side.
        float side = uScrim.y > 0.5 ? vUv.y : (uScrim.x > 0.0 ? vUv.x : 1.0 - vUv.x);
        float open = uScrim.y > 0.5 ? smoothstep(0.0, 0.64, side) : smoothstep(0.0, 0.56, side);

        // Paper: by day a pale sky, deeper toward the top, with slow lighter drifts; by night, black.
        float up = smoothstep(0.2, 1.0, vUv.y);
        vec3 white = vec3(0.992, 0.992, 0.996);
        vec3 day = mix(white, vec3(0.3, 0.72, 1.0), up * up * uSky);
        day += (noise(vUv * vec2(2.4, 1.6) + vec2(uTime * 0.012, 0.0)) - 0.5) * 0.05 * up * uSky;
        vec3 paper = lin(mix(day, vec3(0.024, 0.075, 0.133), uNight)); // night is deep navy, not black

        float drift = 0.0, spark = 0.0;
        vec4 g = uGlyphMix > 0.0 ? glyphAt(p, drift, spark) : vec4(0.0);
        vec3 real = uGlyphMix < 1.0 ? texture2D(tScene, vUv).rgb : vec3(0.0);
        vec4 tiles = mosaic(p, side);

        // Night: letters and image give light on black.
        // Flash: a band of light sweeps across the letters now and then, and the pointer carries a glow.
        float sweepAt = fract(uTime * 0.085) * 1.9 - 0.45;
        float sweep = exp(-pow((vUv.x * 0.82 + vUv.y * 0.18 - sweepAt) / 0.045, 2.0));
        vec2 pd = p - uPointer.xy;
        float glow = exp(-dot(pd, pd) / (150.0 * 150.0 * uPx * uPx)) * uPointer.z;
        float flash = clamp(sweep * 0.8 + glow, 0.0, 1.0);

        // Night: letters give light. Neutral surfaces run a blue ramp (deep blue, Apple blue, cyan, white);
        // coloured things keep their colour. Each cell also glows faintly behind its letter.
        float tone = clamp(luma(g.rgb), 0.0, 1.0);
        float mx = max(g.r, max(g.g, g.b)), mn = min(g.r, min(g.g, g.b));
        float sat = mx > 0.0 ? (mx - mn) / mx : 0.0;
        vec3 ramp = mix(vec3(0.0, 0.2, 0.85), BLUE, smoothstep(0.0, 0.45, tone));
        ramp = mix(ramp, vec3(0.3, 0.8, 1.0), smoothstep(0.4, 0.8, tone));
        ramp = mix(ramp, vec3(1.0), smoothstep(0.8, 1.0, tone) * 0.8);
        vec3 hue = mix(ramp * (0.35 + tone), g.rgb, smoothstep(0.15, 0.5, sat));
        vec3 lit = hue * g.a * 1.5 + hue * tone * 0.07;
        lit = mix(lit, vec3(0.3, 0.8, 1.0) * luma(lit) * 2.6, 0.5 * spark);
        lit += vec3(0.35, 0.8, 1.0) * g.a * tone * flash * 1.4;
        vec3 c = mix(real, lit, uGlyphMix);
        vec2 v = vUv - 0.5;
        c *= (1.0 - dot(v, v) * 0.55) * uFade * (uScrim.y > 0.5 ? mix(0.1, 1.0, open) : mix(0.22, 1.0, open));
        float room = max(uGlyphMix, 1.0 - uFade); // mosaics stay off a real 3D image
        c += tiles.rgb * tiles.a * 0.28 * room * (1.0 - smoothstep(0.02, 0.12, luma(c)));
        vec3 nightCol = paper + aces(c);

        // Day: the same letters as ink on the sky.
        float ink = min(g.a * 1.5, 1.0) * clamp(luma(g.rgb) * 1.7, 0.0, 1.0) * uGlyphMix * uFade * mix(0.1, 1.0, open);
        // Ink runs from navy in the shadows to bright blue on lit surfaces; the flash turns it electric.
        vec3 inkCol = mix(NAVY, vec3(0.0, 0.2, 0.9), smoothstep(0.1, 0.9, tone) * 0.85 + 0.15 * drift);
        inkCol = mix(inkCol, vec3(0.0, 0.42, 1.0), spark * 0.9);
        inkCol = mix(inkCol, vec3(0.0, 0.5, 1.0), flash * 0.9);
        ink = min(ink * (1.0 + flash * 0.6), 1.0);
        vec3 dayCol = mix(paper, inkCol, ink * 0.92);
        dayCol = mix(dayCol, aces(real), (1.0 - uGlyphMix) * uFade * step(0.001, luma(real)));
        dayCol = mix(dayCol, mix(tiles.rgb, vec3(1.0), 0.25), tiles.a * 0.42 * room * (1.0 - ink));

        gl_FragColor = vec4(mix(dayCol, nightCol, nf), 1.0);
        #include <colorspace_fragment>
      }
    `,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
}

/**
 * Pass 3: glass over the base, then out to the screen: where two chapters meet, a band of fluted
 * glass crosses the screen. (Glass on headlines and controls is drawn by the page, so it moves
 * with the page while scrolling.)
 * The optics (bevel height field, two-surface refraction, dispersion, Fresnel, highlights, inner
 * rim, shadow) are adapted from LiquidGlass by @ybouane; the flutes follow FlutedGlass from the
 * shaders library by Shader Effects Inc. Both MIT: see THIRD_PARTY_NOTICES.md.
 */
export function glassMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      tBase: { value: null },
      uRes: { value: new THREE.Vector2(1, 1) },
      uPx: { value: 1 },
      uTime: { value: 0 },
      uNight: { value: 0 },
      uLight: { value: new THREE.Vector2(0, 0) },
      uSeam: { value: new THREE.Vector3(-1e4, 0, 1) },
    },
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: /* glsl */ `
      uniform sampler2D tBase;
      uniform vec2 uRes, uLight;
      uniform float uPx, uTime, uNight;
      uniform vec3 uSeam;                     // where two chapters meet: y px, strength, half height px
      varying vec2 vUv;
      ${COMMON}

      vec3 baseAt(vec2 p) { return texture2D(tBase, p / uRes).rgb; }
      vec3 spectral(vec2 p, vec2 ca) { return vec3(baseAt(p + ca).r, baseAt(p).g, baseAt(p - ca).b); }

      // Light on glass with surface normal N. The light leans toward the pointer.
      vec3 sheen(vec3 N) {
        vec3 V = vec3(0.0, 0.0, 1.0);
        vec3 L = normalize(vec3(-0.4 + uLight.x * 0.9, 0.7 + uLight.y * 0.6, 1.0));
        float fres = pow(1.0 - abs(N.z), 3.0);
        float spec = pow(max(dot(N, normalize(L + V)), 0.0), 80.0)
                   + pow(max(dot(N, normalize(normalize(vec3(-L.xy, 1.0)) + V)), 0.0), 50.0) * 0.3;
        return vec3(spec * 0.7 + fres * 0.35);
      }

      void main() {
        vec2 p = vUv * uRes;
        float nf = smoothstep(0.34, 0.5, uNight);

        // Where two chapters meet, the seam crosses the screen as a band of fluted glass.
        vec3 col;
        float d = (p.y - uSeam.x) / uSeam.z;
        if (uSeam.y > 0.001 && abs(d) < 1.0) {
          float k = uSeam.y * (1.0 - d * d) * (1.0 - d * d);
          float fw = 26.0 * uPx;
          float u = fract(p.x / fw) - 0.5;                 // across one flute
          float slope = sin(u * 3.14159);                  // a rounded bar
          vec2 q = vec2(p.x - slope * fw * 0.55 * k, p.y);
          col = spectral(q, vec2(slope * 2.0 * uPx * k, 0.0));
          col += pow(max(1.0 - abs(u - 0.18 - uLight.x * 0.12) * 3.2, 0.0), 6.0) * k * mix(0.12, 0.06, nf);
        } else {
          col = baseAt(p);
        }


        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
}

export { fullscreen };
