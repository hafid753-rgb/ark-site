import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { smooth } from './util';
import type { Chapter, SceneCtx } from './types';

/** 03 Connected: the home's devices around the machine, with light running along each link. */
export function create(ctx: SceneCtx): Chapter {
  const scene = new THREE.Scene();
  scene.environment = ctx.env;
  scene.background = new THREE.Color(0x000000);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x222018, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-4, 6, 7);
  scene.add(key);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);

  const matte = new THREE.MeshStandardMaterial({ color: 0xdcd7cd, roughness: 0.55, envMapIntensity: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.5 });
  const wire = new THREE.MeshStandardMaterial({ color: 0x8d877c, roughness: 0.8 });
  const blue = new THREE.MeshBasicMaterial({ color: 0x2997ff });
  const light = new THREE.MeshBasicMaterial({ color: 0x9fd8ff });
  const part = (g: THREE.Group, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };

  // The machine at the centre.
  const hub = new THREE.Group();
  part(hub, new RoundedBoxGeometry(1.7, 0.6, 1.7, 4, 0.2), matte);
  const ring = part(hub, new THREE.TorusGeometry(0.62, 0.05, 10, 48), blue, 0, 0.31, 0);
  ring.rotation.x = Math.PI / 2;

  // What a home has: each a small plain object.
  const makers: (() => THREE.Group)[] = [
    () => { const g = new THREE.Group(); part(g, new THREE.SphereGeometry(0.42, 24, 16), matte, 0, 0.15, 0); part(g, new THREE.CylinderGeometry(0.2, 0.2, 0.3, 16), dark, 0, -0.35, 0); return g; }, // bulb
    () => { const g = new THREE.Group(); part(g, new RoundedBoxGeometry(0.9, 0.55, 0.5, 2, 0.08), matte); const l = part(g, new THREE.CylinderGeometry(0.2, 0.24, 0.3, 20), dark, 0, 0, 0.36); l.rotation.x = Math.PI / 2; return g; }, // camera
    () => { const g = new THREE.Group(); part(g, new RoundedBoxGeometry(0.75, 0.6, 0.3, 2, 0.08), matte, 0, -0.15, 0); part(g, new THREE.TorusGeometry(0.24, 0.07, 10, 24, Math.PI), dark, 0, 0.15, 0); return g; }, // lock
    () => { const g = new THREE.Group(); part(g, new THREE.CylinderGeometry(0.36, 0.38, 0.85, 28), matte); const r = part(g, new THREE.TorusGeometry(0.32, 0.03, 8, 28), blue, 0, 0.43, 0); r.rotation.x = Math.PI / 2; return g; }, // speaker
    () => { const g = new THREE.Group(); part(g, new RoundedBoxGeometry(1.3, 0.78, 0.07, 2, 0.03), dark); part(g, new THREE.PlaneGeometry(1.18, 0.66), matte, 0, 0, 0.04); part(g, new THREE.BoxGeometry(0.5, 0.05, 0.3), dark, 0, -0.5, 0); return g; }, // screen
    () => { const g = new THREE.Group(); part(g, new RoundedBoxGeometry(0.5, 0.95, 0.07, 3, 0.07), dark); part(g, new THREE.PlaneGeometry(0.42, 0.84), matte, 0, 0, 0.04); return g; }, // phone
    () => { const g = new THREE.Group(); part(g, new RoundedBoxGeometry(1.3, 0.45, 0.4, 2, 0.08), matte); for (let i = 0; i < 4; i++) part(g, new THREE.BoxGeometry(1.1, 0.03, 0.02), dark, 0, -0.12 + i * 0.07, 0.21); return g; }, // air conditioner
    () => { const g = new THREE.Group(); for (let i = 0; i < 6; i++) part(g, new THREE.BoxGeometry(0.06, 0.9, 0.06), dark, -0.5 + i * 0.2, 0, 0); for (const y of [-0.38, 0.38]) part(g, new THREE.BoxGeometry(1.12, 0.07, 0.07), dark, 0, y, 0); return g; }, // gate
  ];
  const system = new THREE.Group();
  system.add(hub);
  const up = new THREE.Vector3(0, 1, 0);
  const nodes = makers.map((make, i) => {
    const a = (i / makers.length) * Math.PI * 2;
    const r = i % 2 ? 3.3 : 2.5;
    const at = new THREE.Vector3(Math.cos(a) * r, (i % 2 ? 0.9 : -0.6) + Math.sin(a * 2) * 0.4, Math.sin(a) * r);
    const obj = make();
    system.add(obj);
    // The link, and two lights that run along it: one to the machine, one back.
    const link = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 6), wire);
    link.quaternion.setFromUnitVectors(up, at.clone().normalize());
    system.add(link);
    const pulses = [0, 1].map(() => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), light);
      system.add(m);
      return m;
    });
    return { at, obj, link, pulses, phase: i * 0.37 };
  });
  scene.add(system);

  const ch: Chapter = {
    scene,
    camera,
    glyph: 1,
    gain: 1.3,
    fall: 0,
    update(f) {
      // The devices leave the machine and take their places as the chapter arrives.
      const out = ctx.reduced ? 1 : smooth(0.02, 0.4, f.p);
      nodes.forEach(({ at, obj, link, pulses, phase }) => {
        obj.position.copy(at).multiplyScalar(out);
        obj.scale.setScalar(0.3 + 0.7 * out);
        obj.rotation.y = f.time * 0.4 + phase * 4;
        const len = Math.max(at.length() * out, 0.001);
        link.scale.set(1, len, 1);
        link.position.copy(at).multiplyScalar(out * 0.5);
        pulses.forEach((m, k) => {
          const t = (f.time * 0.45 + phase + k * 0.5) % 1;
          m.position.copy(at).multiplyScalar(out * (k ? t : 1 - t));
          m.scale.setScalar((0.6 + 0.4 * Math.sin(t * Math.PI)) * out);
        });
      });
      ring.scale.setScalar(1 + 0.06 * Math.sin(f.time * 3));

      const wide = f.aspect > 1.05;
      const side = ctx.rtl ? -1 : 1;
      system.position.set(wide ? 2.5 * side : 0, wide ? 0 : 2.3, 0);
      system.rotation.set(0.42 - f.pointer.y * 0.15, f.time * 0.14 + f.pointer.x * 0.3, 0);
      system.scale.setScalar(wide ? 1.0 : 0.85);
      camera.aspect = f.aspect;
      camera.position.set(0, 0.6, wide ? 13 : 18);
      camera.lookAt(0, 0.2, 0);
      camera.updateProjectionMatrix();
    },
  };
  return ch;
}
