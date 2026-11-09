import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { easeOut, lerp, markGeometries, smooth } from './util';
import type { Chapter, SceneCtx } from './types';

const DEG = Math.PI / 180;

/** The mark, in chrome, assembling from its two halves, with glass copies of itself radiating behind. */
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

  // Behind it, the mark again and again in liquid glass, radiating outward in rings:
  // born small at the centre, growing as they travel, gone at the edge.
  const glassMark = mergeGeometries(markGeometries(0.32));
  glassMark.computeVertexNormals();
  // Glass lit by what it reflects: bright Fresnel edges, a clear coat and a thin-film shimmer,
  // the body mostly see-through. Reads as glass in 3D and outlines each mark in letters,
  // without the cost of a transmission pass.
  const liquid = new THREE.MeshPhysicalMaterial({
    color: 0x0c1424, // almost no body colour: glass on black is mostly what it reflects
    metalness: 0,
    roughness: 0.05,
    ior: 1.6,
    specularIntensity: 1,
    iridescence: 0.45,
    iridescenceIOR: 1.4,
    iridescenceThicknessMinimum: 120,
    iridescenceThicknessMaximum: 280,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    envMapIntensity: 7,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const RINGS = 6, PER = 9, INNER = 2.2, STEP = 1.7;
  const field = new THREE.InstancedMesh(glassMark, liquid, RINGS * PER);
  field.frustumCulled = false;
  scene.add(field);
  const dummy = new THREE.Object3D();
  const radiate = (t: number) => {
    for (let k = 0; k < RINGS; k++) {
      const life = (k + t * 0.09) % RINGS / RINGS; // 0 at the centre, 1 at the edge
      const r = INNER + life * RINGS * STEP;
      const size = r * 0.072 * smooth(0, 0.12, life) * (1 - smooth(0.78, 1, life));
      for (let j = 0; j < PER; j++) {
        const a = ((j + (k % 2) * 0.5) / PER) * Math.PI * 2 + t * 0.03;
        dummy.position.set(Math.cos(a) * r, Math.sin(a) * r * 0.92, -3.5 - life * 2.5);
        // Each one points outward, and tilts a little so the glass catches the light.
        dummy.rotation.set(Math.sin(t * 0.5 + j + k) * 0.35, Math.cos(t * 0.4 + j * 1.7) * 0.35, a - Math.PI / 2, 'ZXY');
        dummy.scale.setScalar(Math.max(size, 1e-4));
        dummy.updateMatrix();
        field.setMatrixAt(k * PER + j, dummy.matrix);
      }
    }
    field.instanceMatrix.needsUpdate = true;
  };

  const focus = new THREE.Vector3();
  let born = -1;
  const ch: Chapter = {
    scene,
    camera,
    glyph: 1,
    gain: 2.6, // the glass field is faint; letters need more light than eyes
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
      field.position.set(mark.position.x, mark.position.y, 0);
      radiate(f.time);
      // Rest the lens on solid metal (the upper bar), not on the empty window.
      mark.updateMatrixWorld();
      mark.localToWorld(focus.set(0.4, 1.0, 0.3));
    },
  };
  return ch;
}
