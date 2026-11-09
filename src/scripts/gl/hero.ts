import * as THREE from 'three';
import { easeOut, lerp, markGeometries, smooth } from './util';
import type { Chapter, SceneCtx } from './types';

const DEG = Math.PI / 180;

/** The mark, in chrome, assembling from its two halves over a field of rings. */
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

  // Concentric rings, irregular like the ones in the Adrar, slowly breathing outward.
  const rings = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          vec2 p = (vUv - 0.5) * 2.0;
          float r = length(p * vec2(1.0, 1.1));
          float a = atan(p.y, p.x);
          float wob = 0.035 * sin(3.0 * a + 1.3) + 0.02 * sin(5.0 * a + 0.4) + 0.012 * sin(9.0 * a + uTime * 0.15);
          float band = abs(fract(r * (1.0 + wob) * 13.0 - uTime * 0.04) - 0.5);
          float line = smoothstep(0.14, 0.02, band);
          float mask = smoothstep(0.62, 0.12, r) * smoothstep(0.05, 0.12, r);
          gl_FragColor = vec4(vec3(0.62, 0.62, 0.66) * line * mask * 0.42, 1.0);
        }
      `,
      depthWrite: false,
    }),
  );
  rings.position.z = -7;
  scene.add(rings);

  const focus = new THREE.Vector3();
  let born = -1;
  const ch: Chapter = {
    scene,
    camera,
    glyph: 1,
    lens: 1,
    fall: 0,
    focus,
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
        lerp(-0.1 + Math.sin(f.time * 0.23) * 0.05, 0, through),
        lerp(Math.sin(f.time * 0.3) * 0.22 - 0.16 * side, 0, through),
        0,
      );
      const hfov = 2 * Math.atan(Math.tan(16 * DEG) * f.aspect);
      const dist = wide ? 14 : Math.max(13, 2.7 / Math.tan(hfov / 2));
      camera.aspect = f.aspect;
      camera.position.set(0, 0, lerp(dist, 0.5, through * through));
      camera.updateProjectionMatrix();
      rings.position.set(mark.position.x, mark.position.y, -7);
      (rings.material as THREE.ShaderMaterial).uniforms.uTime.value = f.time;
      // Rest the lens on solid metal (the upper bar), not on the empty window.
      mark.updateMatrixWorld();
      mark.localToWorld(focus.set(0.4, 1.0, 0.3));
    },
  };
  return ch;
}
