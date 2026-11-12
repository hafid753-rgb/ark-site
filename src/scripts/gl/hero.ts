import * as THREE from 'three';
import { easeOut, lerp, markGeometries, smooth } from './util';
import type { Chapter, SceneCtx } from './types';

const DEG = Math.PI / 180;

/** The mark, in chrome, assembling from its two halves, with its outline rippling outward in glass. */
export function create(ctx: SceneCtx): Chapter {
  const scene = new THREE.Scene();
  scene.environment = ctx.env;
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100);

  const chrome = new THREE.MeshStandardMaterial({ color: 0xcfccc6, metalness: 1, roughness: 0.26, envMapIntensity: 0.72 });
  const [g1, g2] = markGeometries(0.55);
  const upper = new THREE.Mesh(g1, chrome);
  const lower = new THREE.Mesh(g2, chrome);
  const mark = new THREE.Group();
  mark.add(upper, lower);
  scene.add(mark);

  // Behind it, the mark's own outline again and again, rippling outward like water around it,
  // each ripple a ribbon of liquid glass. The outline is the union of the mark's two convex blocks;
  // "mitred" distance to each block keeps the steps and the chamfer crisp at every size.
  const ripples = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vPos; void main() { vPos = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec2 vPos;
        // The mark's two blocks, centred on the window (y up), clockwise.
        const vec2 A[5] = vec2[5](vec2(-1.0, 1.5), vec2(1.17, 1.5), vec2(2.0, 0.67), vec2(2.0, -0.5), vec2(-1.0, -0.5));
        const vec2 B[5] = vec2[5](vec2(-2.0, 0.5), vec2(1.0, 0.5), vec2(1.0, -1.5), vec2(-1.17, -1.5), vec2(-2.0, -0.67));
        // Mitred distance to a convex polygon, and the outward direction of the edge that decides it.
        float block(vec2 p, vec2 v[5], out vec2 n) {
          float d = -1e9;
          for (int i = 0; i < 5; i++) {
            vec2 e = normalize(v[(i + 1) % 5] - v[i]);
            vec2 m = vec2(-e.y, e.x);
            float s = dot(p - v[i], m);
            if (s > d) { d = s; n = m; }
          }
          return d;
        }
        // Across one glass ribbon: u from -1 to 1. Returns the light it throws back.
        float glassAt(float u, vec2 g) {
          float h = sqrt(max(1.0 - u * u, 0.0));
          vec3 N = normalize(vec3(g * (-u / max(h, 0.12)) * 0.8, 1.0));
          float fres = pow(1.0 - N.z, 2.2);
          float spec = pow(max(dot(N, normalize(vec3(-0.45, 0.65, 1.6))), 0.0), 70.0);
          float inside = 1.0 - smoothstep(0.85, 1.0, abs(u));
          return (0.05 + fres * 0.85 + spec * 1.6) * inside;
        }
        void main() {
          vec2 na, nb;
          float da = block(vPos, A, na), db = block(vPos, B, nb);
          float d = min(da, db);
          vec2 g = da < db ? na : nb;
          // A slow liquid wobble, then ripples flowing outward.
          d += 0.05 * sin(vPos.x * 1.3 + uTime * 0.6) * sin(vPos.y * 1.1 - uTime * 0.45);
          float t = d / 0.62 - uTime * 0.16;
          // Drawn in letters, so the ribbons are wider and brighter than glass for the eye would be.
          float u = (fract(t) - 0.5) / 0.26;
          // Dispersion: each colour sees the ribbon a little wider or narrower.
          vec3 col = vec3(glassAt(u * 1.07, g), glassAt(u, g), glassAt(u * 0.93, g));
          col *= vec3(0.86, 0.93, 1.0);
          // The outer ripples fade early, so the words beside them stay easy to read.
          float fade = smoothstep(0.15, 0.6, d) * (1.0 - smoothstep(3.2, 6.0, d));
          gl_FragColor = vec4(col * fade * 1.6, 1.0);
        }
      `,
      depthWrite: false,
    }),
  );
  ripples.position.z = -0.9;
  mark.add(ripples);

  let born = -1;
  const ch: Chapter = {
    scene,
    camera,
    glyph: 1,
    gain: 2.2, // the glass ripples are faint; letters need more light than eyes
    fall: 0,
    update(f) {
      if (born < 0) born = f.time;
      // The two halves slide in and lock around the window.
      const a = ctx.reduced ? 1 : easeOut((f.time - born) / 1.8);
      upper.position.set((1 - a) * 4.5, (1 - a) * 0.8, (1 - a) * 2);
      lower.position.set(-(1 - a) * 4.5, -(1 - a) * 0.8, -(1 - a) * 2);

      const wide = f.aspect > 1.05;
      const through = smooth(0.5, 1, f.p); // scrolling on flies through the window
      const side = ctx.rtl ? -1 : 1;
      mark.position.set(lerp(wide ? 2.9 * side : 0, 0, through), lerp(wide ? 0 : 1.9, 0, through), 0);
      mark.rotation.set(
        // The mark leans toward the pointer.
        lerp(-0.1 + Math.sin(f.time * 0.23) * 0.05 - f.pointer.y * 0.22, 0, through),
        lerp(Math.sin(f.time * 0.3) * 0.22 - 0.16 * side + f.pointer.x * 0.35, 0, through),
        0,
      );
      const hfov = 2 * Math.atan(Math.tan(16 * DEG) * f.aspect);
      const dist = wide ? 14 : Math.max(13, 2.7 / Math.tan(hfov / 2));
      camera.aspect = f.aspect;
      camera.position.set(0, 0, lerp(dist, 0.5, through * through));
      camera.updateProjectionMatrix();
      (ripples.material as THREE.ShaderMaterial).uniforms.uTime.value = f.time;
    },
  };
  return ch;
}
