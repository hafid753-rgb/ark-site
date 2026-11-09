import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { smooth } from './util';
import type { Chapter, SceneCtx } from './types';

/** The timeline: one object per fact. What hangs on a server elsewhere pours away as it scrolls past. */
export function create(ctx: SceneCtx): Chapter {
  const scene = new THREE.Scene();
  scene.environment = ctx.env;
  scene.background = new THREE.Color(0x000000);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x222018, 0.8));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-3, 5, 6);
  scene.add(key);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);

  const matte = new THREE.MeshStandardMaterial({ color: 0xdcd7cd, roughness: 0.55, envMapIntensity: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.5 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xffd09a });

  const blue = new THREE.MeshBasicMaterial({ color: 0x2997ff });
  const panel = (draw: (c: CanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    draw(canvas.getContext('2d')!, w, h);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
  };
  const rounded = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
    c.beginPath();
    c.roundRect(x, y, w, h, r);
    c.fill();
  };

  // 2018: the one submarine cable, cut. Its fibres glow at the break.
  const cable = new THREE.Group();
  const path = new THREE.CatmullRomCurve3([[-2.2, -0.5, 0], [-1.1, 0.1, 0.3], [0, -0.1, 0], [1.1, 0.25, -0.2]].map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  cable.add(new THREE.Mesh(new THREE.TubeGeometry(path, 80, 0.26, 24), matte));
  for (let i = 0; i < 9; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.03, 8, 32), dark);
    const t = 0.06 + i * 0.1;
    ring.position.copy(path.getPointAt(t));
    ring.lookAt(path.getPointAt(Math.min(1, t + 0.01)));
    cable.add(ring);
  }
  const end = path.getPointAt(1), dir = path.getTangentAt(1);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2, rr = i ? 0.12 : 0;
    const fibre = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5 + (i % 3) * 0.18, 6), blue);
    fibre.position.copy(end).add(new THREE.Vector3(0, Math.cos(a) * rr, Math.sin(a) * rr)).addScaledVector(dir, 0.2);
    fibre.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().add(new THREE.Vector3(0, Math.cos(a), Math.sin(a)).multiplyScalar(0.25)).normalize());
    cable.add(fibre);
  }
  cable.rotation.set(0.35, 0, 0.1);

  // 2022: the national agenda, as a mast bringing broadband further out.
  const mast = new THREE.Group();
  const legs = 3, top = new THREE.Vector3(0, 1.5, 0);
  for (let i = 0; i < legs; i++) {
    const a = (i / legs) * Math.PI * 2;
    const foot = new THREE.Vector3(Math.cos(a) * 0.7, -1.5, Math.sin(a) * 0.7);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, foot.distanceTo(top), 6), matte);
    leg.position.copy(foot).lerp(top, 0.5);
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(foot).normalize());
    mast.add(leg);
    const dish = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.75, 0.1, 2, 0.03), matte);
    dish.position.set(Math.cos(a) * 0.16, 1.15, Math.sin(a) * 0.16);
    dish.rotation.y = -a;
    mast.add(dish);
  }
  for (let k = 1; k < 6; k++) {
    const y = -1.5 + k * 0.5, r = 0.7 * (1 - k / 6) + 0.02;
    const bar = new THREE.Mesh(new THREE.TorusGeometry(r, 0.02, 6, 3), matte);
    bar.rotation.x = Math.PI / 2;
    bar.position.y = y;
    mast.add(bar);
  }
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), blue);
  beacon.position.y = 1.65;
  mast.add(beacon);

  // 2026: public services, on a phone.
  const phone = new THREE.Group();
  phone.add(new THREE.Mesh(new RoundedBoxGeometry(1.35, 2.7, 0.14, 4, 0.16), dark));
  const ui = new THREE.Mesh(
    new THREE.PlaneGeometry(1.22, 2.55),
    panel((c, w, h) => {
      c.fillStyle = '#f1ece2';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#1a1916';
      rounded(c, 28, 48, 150, 18, 9);
      c.fillStyle = '#8a857c';
      rounded(c, 28, 80, 210, 12, 6);
      const tones = ['#2997ff', '#1a1916', '#6b6760', '#3a3833', '#9d968a', '#1a1916'];
      for (let i = 0; i < 12; i++) {
        c.fillStyle = tones[i % tones.length];
        rounded(c, 28 + (i % 3) * 88, 124 + Math.floor(i / 3) * 98, 70, 70, 18);
      }
      c.fillStyle = '#1a1916';
      rounded(c, 28, h - 92, w - 56, 56, 28);
    }, 300, 628),
  );
  ui.position.z = 0.075;
  phone.add(ui);
  phone.rotation.x = -0.12;

  // Today: a checkout built elsewhere, which has no place for Mauritania.
  const checkout = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 2.6),
    panel((c, w, h) => {
      c.fillStyle = '#f1ece2';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#1a1916';
      c.font = '700 40px sans-serif';
      c.fillText('Checkout', 30, 70);
      c.font = '24px sans-serif';
      c.fillStyle = '#6b6760';
      c.fillText('Country or region', 30, 130);
      c.strokeStyle = '#c0392b';
      c.lineWidth = 4;
      c.strokeRect(30, 145, w - 60, 64);
      c.fillStyle = '#1a1916';
      c.font = '28px sans-serif';
      c.fillText('Mauritania', 48, 188);
      c.fillStyle = '#c0392b';
      c.font = '600 24px sans-serif';
      c.fillText('Not supported', 30, 245);
      c.fillStyle = '#d8d1c4';
      for (let i = 0; i < 3; i++) c.fillRect(30, 290 + i * 52, w - 60, 34);
      c.fillStyle = '#bdb6aa';
      rounded(c, 30, h - 100, w - 60, 64, 32);
    }, 420, 496),
  );
  checkout.rotation.y = 0.3;

  // What remains: a house that keeps its things.
  const house = new THREE.Group();
  const walls = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.4, 2.2), matte);
  house.add(walls);
  const parapet = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.18, 2.3), matte);
  parapet.position.y = 0.79;
  house.add(parapet);
  for (const x of [-0.7, 0.1]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.05), glow);
    win.position.set(x, 0.15, 1.12);
    house.add(win);
  }
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.8, 0.05), dark);
  door.position.set(0.8, -0.3, 1.12);
  house.add(door);
  house.rotation.set(0.25, -0.5, 0);

  const things = [cable, mast, phone, checkout, house];
  // Only what depends on somewhere else pours away; what is built here stays.
  const pours = [true, false, false, true, false];
  const holder = new THREE.Group();
  things.forEach((t) => holder.add(t));
  scene.add(holder);

  // The cloud each thing depends on, and the thread to it.
  const cloud = new THREE.Group();
  const puff = new THREE.SphereGeometry(1, 20, 14);
  // Dim on purpose: the cloud reads as a ghost of letters, not a second object.
  const ghost = new THREE.MeshStandardMaterial({ color: 0x4a4946, roughness: 0.95, envMapIntensity: 0.3 });
  [[0, 0, 0, 0.75], [0.8, -0.15, 0.1, 0.55], [-0.8, -0.2, 0, 0.55], [0.35, 0.35, -0.2, 0.5], [-0.4, 0.3, 0.1, 0.45]].forEach(([x, y, z, s]) => {
    const m = new THREE.Mesh(puff, ghost);
    m.position.set(x, y, z);
    m.scale.setScalar(s);
    cloud.add(m);
  });
  const thread = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]), new THREE.LineBasicMaterial({ color: 0xbdb6aa }));
  holder.add(cloud, thread);

  let marks: HTMLElement[] = [];
  const ch: Chapter = {
    scene,
    camera,
    glyph: 1,
    lens: 0,
    fall: 0,
    update(f) {
      if (!marks.length) marks = [...f.el.querySelectorAll<HTMLElement>('.fact, .closing')];
      // Which fact is closest to the middle of the screen, and how far past it we are.
      let i = 0, c = Infinity;
      marks.forEach((el, k) => {
        const r = el.getBoundingClientRect();
        const off = (r.top + r.height / 2 - f.H / 2) / f.H;
        if (Math.abs(off) < Math.abs(c)) { c = off; i = k; }
      });
      if (c > 0.6) { i = 0; c = 0.6; } // still on the heading: show the first thing waiting

      const last = i === things.length - 1;
      const side0 = ctx.rtl ? 1 : -1;
      ch.fall = pours[i] ? smooth(0.06, 0.42, -c) : 0;
      const grow = smooth(0.62, 0.28, c);
      things.forEach((t, k) => (t.visible = k === i));
      const t = things[i];
      t.scale.setScalar(0.6 + 0.4 * grow);
      // Flat things sway so they never turn edge-on; solid things turn slowly.
      const flat = t === phone || t === checkout;
      t.rotation.y = flat ? 0.25 * side0 + Math.sin(f.time * 0.6) * 0.45 : (last ? -0.5 : 0) + f.time * (last ? 0.12 : 0.35);
      t.position.y = Math.sin(f.time * 0.8) * 0.06;

      cloud.visible = pours[i];
      cloud.position.set(0, 2.5, -0.5);
      cloud.rotation.y = f.time * 0.1;
      const top = new THREE.Vector3(0, 1.0, 0);
      const pos = thread.geometry.attributes.position as THREE.BufferAttribute;
      pos.setXYZ(0, top.x, top.y, top.z);
      pos.setXYZ(1, 0, 2.0, -0.4);
      pos.needsUpdate = true;
      thread.visible = pours[i] && ch.fall < 0.02;

      const wide = f.aspect > 1.05;
      const side = ctx.rtl ? -1 : 1;
      holder.position.set(wide ? 2.6 * side : 0, wide ? -0.3 : 1.6, 0);
      camera.aspect = f.aspect;
      camera.position.set(0, 0.6, wide ? 12 : 17);
      camera.lookAt(0, 0.3, 0);
      camera.updateProjectionMatrix();
    },
  };
  return ch;
}
