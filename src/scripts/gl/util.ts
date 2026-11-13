import * as THREE from 'three';
import { UPPER, LOWER, WIDTH, HEIGHT, type Point } from '../../mark';

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Frame-rate independent approach toward a target. */
export const approach = (cur: number, target: number, dt: number, speed = 6) => cur + (target - cur) * (1 - Math.exp(-speed * dt));

/** One triangle that covers the screen, for full-screen passes. */
export function fullscreen(material: THREE.Material) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  return mesh;
}

export const FULLSCREEN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const shape = (pts: readonly Point[]) =>
  new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x - WIDTH / 2, HEIGHT / 2 - y)));

/** The two halves of the Ark mark as extruded solids, centred on the window. */
export function markGeometries(depth = 0.6) {
  const opts = { depth, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.05, bevelSegments: 4, curveSegments: 1 };
  return [UPPER, LOWER].map((pts) => {
    const g = new THREE.ExtrudeGeometry(shape(pts), opts);
    g.translate(0, 0, -depth / 2);
    return g;
  });
}

/** A small seeded random, so scenes look the same on every visit. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Shared GLSL noise for the sky and the sand. */
export const NOISE = /* glsl */ `
  float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
`;
