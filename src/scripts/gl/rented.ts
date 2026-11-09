import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { smooth } from './util';
import type { Chapter, SceneCtx } from './types';

/** Things people paid for, each tied to a server. When its fact scrolls past, it pours away. */
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

  const hub = new THREE.Group();
  hub.add(new THREE.Mesh(new RoundedBoxGeometry(2.4, 0.6, 2.4, 4, 0.28), matte));
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.04), glow);
  led.position.set(0, -0.05, 1.21);
  hub.add(led);
  hub.rotation.x = 0.45;

  const bulbPts = [
    [0, -1.5], [0.32, -1.5], [0.36, -1.38], [0.36, -0.82], [0.42, -0.72], [0.62, -0.36], [0.9, 0.15],
    [0.98, 0.6], [0.88, 1.0], [0.6, 1.28], [0.3, 1.4], [0, 1.43],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const bulb = new THREE.Group();
  bulb.add(new THREE.Mesh(new THREE.LatheGeometry(bulbPts, 48), matte));

  const panel = (draw: (c: CanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    draw(canvas.getContext('2d')!, w, h);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
  };

  // A library on a screen: tiles of things bought.
  const screen = new THREE.Group();
  screen.add(new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.1, 0.16), dark));
  const tiles = new THREE.Mesh(
    new THREE.PlaneGeometry(3.15, 1.85),
    panel((c, w, h) => {
      c.fillStyle = '#141311';
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 8; i++) {
        c.fillStyle = ['#e6dfd2', '#b9b1a4', '#d7cfc0', '#9d968a'][i % 4];
        c.fillRect(24 + (i % 4) * 122, 40 + Math.floor(i / 4) * 130, 104, 112);
      }
    }, 512, 300),
  );
  tiles.position.z = 0.085;
  screen.add(tiles);

  // A receipt that says "buy".
  const receipt = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 2.6),
    panel((c, w, h) => {
      c.fillStyle = '#f1ece2';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#1a1916';
      c.font = '700 64px monospace';
      c.fillText('BUY', 30, 120);
      c.fillRect(30, 160, w - 60, 6);
      for (let i = 0; i < 7; i++) c.fillRect(30, 210 + i * 40, (w - 60) * (0.4 + ((i * 37) % 50) / 100), 14);
      c.font = '700 48px monospace';
      c.fillText('14.99', 30, h - 50);
    }, 300, 488),
  );
  receipt.rotation.y = 0.35;

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

  const things = [hub, bulb, screen, receipt, house];
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
      ch.fall = last ? 0 : smooth(0.06, 0.42, -c);
      const grow = smooth(0.62, 0.28, c);
      things.forEach((t, k) => (t.visible = k === i));
      const t = things[i];
      t.scale.setScalar(0.6 + 0.4 * grow);
      t.rotation.y = (last ? -0.5 : 0) + f.time * (last ? 0.12 : 0.35);
      t.position.y = Math.sin(f.time * 0.8) * 0.06;

      cloud.visible = thread.visible = !last;
      cloud.position.set(0, 2.5, -0.5);
      cloud.rotation.y = f.time * 0.1;
      const top = new THREE.Vector3(0, 1.0, 0);
      const pos = thread.geometry.attributes.position as THREE.BufferAttribute;
      pos.setXYZ(0, top.x, top.y, top.z);
      pos.setXYZ(1, 0, 2.0, -0.4);
      pos.needsUpdate = true;
      thread.visible = !last && ch.fall < 0.02;

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
