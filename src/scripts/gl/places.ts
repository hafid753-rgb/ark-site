import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { approach } from './util';
import { buildHouse } from './house';
import type { Chapter, SceneCtx } from './types';

type Place = 'home' | 'building' | 'office' | 'store';

/** 06 Your setup: the place you choose, drawn in letters. Choosing another pours this one away. */
export function create(ctx: SceneCtx): Chapter {
  const scene = new THREE.Scene();
  scene.environment = ctx.env;
  scene.background = new THREE.Color(0x000000);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x222018, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(-4, 6, 6);
  scene.add(key);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);

  const wall = new THREE.MeshStandardMaterial({ color: 0xdcd7cd, roughness: 0.6, envMapIntensity: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1a18, roughness: 0.5 });
  const mid = new THREE.MeshStandardMaterial({ color: 0x8d877c, roughness: 0.7 });
  const blue = new THREE.MeshBasicMaterial({ color: 0x2997ff });
  const box = (g: THREE.Group, m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, r = 0) => {
    const mesh = new THREE.Mesh(r ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };

  // Home: the courtyard house from the night chapters.
  const home = new THREE.Group();
  const house = buildHouse().group;
  house.scale.setScalar(0.27);
  house.position.set(0, -1.1, 0.3);
  home.add(house);

  // Apartment building: four floors of windows and balconies, a door, tanks on the roof.
  const building = new THREE.Group();
  box(building, wall, 3.0, 4.6, 2.2, 0, 0.2, 0, 0.04);
  for (let f = 0; f < 4; f++) {
    for (let c = 0; c < 3; c++) {
      if (f === 0 && c === 1) continue;
      box(building, dark, 0.52, 0.6, 0.06, -0.95 + c * 0.95, -1.5 + f * 1.08, 1.11);
    }
    if (f > 0) box(building, mid, 2.7, 0.08, 0.5, 0, -1.92 + f * 1.08, 1.3);
  }
  box(building, dark, 0.6, 0.95, 0.06, 0, -1.62, 1.11);
  box(building, blue, 0.5, 0.06, 0.06, 0, -1.08, 1.12);
  box(building, wall, 3.1, 0.22, 2.3, 0, 2.6, 0);
  for (const x of [-0.8, 0.7]) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.55, 20), wall);
    tank.position.set(x, 3.0, -0.3);
    building.add(tank);
  }

  // Office: two long floors of ribbon windows, a canopy over the entrance, a sign and a mast.
  const office = new THREE.Group();
  box(office, wall, 4.6, 2.6, 2.4, 0, -0.5, 0, 0.04);
  for (const y of [-1.05, 0.15]) box(office, dark, 4.2, 0.62, 0.06, 0, y, 1.21);
  for (let i = 0; i < 6; i++) for (const y of [-1.05, 0.15]) box(office, wall, 0.07, 0.62, 0.08, -1.75 + i * 0.7, y, 1.23);
  box(office, mid, 1.5, 0.1, 0.9, -1.2, -1.0, 1.6);
  box(office, dark, 0.9, 0.75, 0.06, -1.2, -1.42, 1.22);
  box(office, blue, 1.1, 0.24, 0.06, 1.4, 0.62, 1.22);
  box(office, mid, 0.05, 1.4, 0.05, 1.7, 1.5, -0.6);
  box(office, wall, 1.3, 0.7, 1.0, -1.2, 1.1, -0.4, 0.04);

  // Store: a shop front with a striped awning, a wide window, a rolled shutter and a sign.
  const store = new THREE.Group();
  box(store, wall, 3.8, 2.3, 2.2, 0, -0.65, 0, 0.04);
  box(store, dark, 1.9, 1.15, 0.06, -0.7, -0.95, 1.11);
  box(store, dark, 0.75, 1.55, 0.06, 1.15, -1.02, 1.11);
  for (let i = 0; i < 5; i++) box(store, mid, 0.75, 0.05, 0.08, 1.15, -0.42 - i * 0.12, 1.13);
  for (let i = 0; i < 9; i++) {
    const stripe = box(store, i % 2 ? wall : mid, 0.4, 0.06, 1.0, -1.6 + i * 0.4, 0.05, 1.5);
    stripe.rotation.x = 0.35;
  }
  box(store, blue, 2.2, 0.36, 0.08, 0, 0.72, 1.12);
  box(store, wall, 3.9, 0.2, 2.3, 0, 0.6, 0);

  const places: Record<Place, THREE.Group> = { home, building, office, store };
  const holder = new THREE.Group();
  Object.values(places).forEach((g) => holder.add(g));
  scene.add(holder);

  const inputs = [...document.querySelectorAll<HTMLInputElement>('input[name="place"]')];
  const chosen = () => (inputs.find((i) => i.checked)?.value ?? 'home') as Place;
  let shown = chosen();
  let fall = 0;

  const ch: Chapter = {
    scene,
    camera,
    glyph: 1,
    gain: 1.25,
    fall: 0,
    update(f) {
      // A new choice: the old place pours away, then the new one stands in its place.
      const want = chosen();
      const leaving = want !== shown;
      fall = ctx.reduced ? 0 : approach(fall, leaving ? 1 : 0, f.dt, leaving ? 7 : 4);
      if (leaving && (fall > 0.92 || ctx.reduced)) shown = want;
      ch.fall = fall;
      (Object.keys(places) as Place[]).forEach((k) => (places[k].visible = k === shown));

      const wide = f.aspect > 1.05;
      const side = ctx.rtl ? -1 : 1;
      holder.position.set(wide ? 2.7 * side : 0, wide ? -0.2 : 2.4, 0);
      holder.rotation.set(0.16, -0.5 * side + Math.sin(f.time * 0.35) * 0.22, 0);
      holder.scale.setScalar((wide ? 0.86 : 0.7) * (shown === 'building' ? 0.9 : 1));
      camera.aspect = f.aspect;
      camera.position.set(0, 0.6, wide ? 13 : 18);
      camera.lookAt(0, 0.2, 0);
      camera.updateProjectionMatrix();
    },
  };
  return ch;
}
