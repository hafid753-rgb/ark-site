import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Room } from '../home';
import { seeded } from './util';

// A Sahel courtyard house, modelled in code: thick plaster walls, a roof
// terrace with stepped parapets, an outside stair, a palm in a tiled court.
// Static parts are merged per material so the whole house is a few draw calls.

const pattern = (w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, repeat: [number, number]) => {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d')!);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(...repeat);
  tex.anisotropy = 8;
  return tex;
};

export interface House {
  group: THREE.Group;
  roof: THREE.Group;
  floors: THREE.Mesh[];
  windows: Record<Room, THREE.MeshStandardMaterial>;
  lightSpots: Record<Room, THREE.Vector3>;
  gate: [THREE.Object3D, THREE.Object3D];
  fan: THREE.Object3D;
  mastTop: THREE.Vector3;
  feedFrom: THREE.Vector3;
  feedAt: THREE.Vector3;
}

export function buildHouse(): House {
  const M = {
    plaster: new THREE.MeshStandardMaterial({ color: 0xe3caa1, roughness: 0.93 }),
    plinth: new THREE.MeshStandardMaterial({ color: 0xb09a79, roughness: 0.95 }),
    roofTop: new THREE.MeshStandardMaterial({ color: 0xd4bc93, roughness: 0.96 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x5b3a24, roughness: 0.72 }),
    frame: new THREE.MeshStandardMaterial({ color: 0x3a281b, roughness: 0.7 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x2c2c2e, roughness: 0.42, metalness: 0.65 }),
    light: new THREE.MeshStandardMaterial({ color: 0xe8e8e6, roughness: 0.5, metalness: 0.2 }),
    solar: new THREE.MeshStandardMaterial({ color: 0x0f1d33, roughness: 0.22, metalness: 0.35 }),
    terracotta: new THREE.MeshStandardMaterial({ color: 0xa4573a, roughness: 0.9 }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x4a6a3b, roughness: 0.85, side: THREE.DoubleSide }),
    trunk: new THREE.MeshStandardMaterial({ color: 0x6d5644, roughness: 0.95 }),
    fabric: new THREE.MeshStandardMaterial({ color: 0x7e5240, roughness: 0.95 }),
    cushion: new THREE.MeshStandardMaterial({ color: 0x2f3c66, roughness: 0.95 }),
    linen: new THREE.MeshStandardMaterial({ color: 0xe6dccb, roughness: 0.95 }),
    counter: new THREE.MeshStandardMaterial({ color: 0xcfc6b6, roughness: 0.6 }),
    screen: new THREE.MeshStandardMaterial({ color: 0x050608, roughness: 0.2, emissive: 0x1a3d66, emissiveIntensity: 0.35 }),
    sail: new THREE.MeshStandardMaterial({ color: 0xe9dfcc, roughness: 0.9, side: THREE.DoubleSide }),
    tile: new THREE.MeshStandardMaterial({
      roughness: 0.85,
      map: pattern(256, 256, (c) => {
        c.fillStyle = '#d6c6a8';
        c.fillRect(0, 0, 256, 256);
        c.strokeStyle = '#a5583a';
        c.lineWidth = 6;
        c.beginPath();
        c.moveTo(128, 0); c.lineTo(256, 128); c.lineTo(128, 256); c.lineTo(0, 128); c.closePath();
        c.stroke();
        c.fillStyle = '#2b3a67';
        for (const [x, y] of [[128, 128], [0, 0], [256, 0], [0, 256], [256, 256]]) { c.beginPath(); c.arc(x, y, 14, 0, Math.PI * 2); c.fill(); }
        c.strokeStyle = 'rgba(60,40,25,0.35)';
        c.lineWidth = 3;
        c.strokeRect(0, 0, 256, 256);
      }, [9, 5]),
    }),
    rug: new THREE.MeshStandardMaterial({
      roughness: 1,
      map: pattern(256, 128, (c) => {
        const bands = ['#8e2f22', '#e2d3b4', '#26315a', '#b8853f', '#e2d3b4', '#8e2f22'];
        bands.forEach((col, i) => { c.fillStyle = col; c.fillRect(0, (i * 128) / bands.length, 256, 128 / bands.length); });
        c.strokeStyle = '#1b1b1b';
        c.lineWidth = 3;
        c.beginPath();
        for (let x = 0; x <= 256; x += 16) c.lineTo(x, x % 32 ? 56 : 72);
        c.stroke();
      }, [1, 1]),
    }),
  };

  type Layer = Map<THREE.Material, THREE.BufferGeometry[]>;
  const base: Layer = new Map(), roofLayer: Layer = new Map();
  const put = (layer: Layer, mat: THREE.Material, geo: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) => {
    // YXZ: tilt first, then turn about the vertical, which is how fronds and panels are placed.
    geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, "YXZ")), new THREE.Vector3(1, 1, 1)));
    if (!layer.has(mat)) layer.set(mat, []);
    layer.get(mat)!.push(geo);
  };
  /** A slab with softly rounded edges: the bevel catches the moonlight like real plaster. */
  const slab = (layer: Layer, mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, r = 0.03) =>
    put(layer, mat, new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2) * 0.999), x, y, z);
  const block = (layer: Layer, mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) =>
    put(layer, mat, new THREE.BoxGeometry(w, h, d), x, y, z, ry);

  const H = 3.2, T = 0.36, FRONT = -1.8, BACK = -6, X0 = -7.5, X1 = 7.5;
  const D = FRONT - BACK; // depth of the back block, 4.2
  const rooms: Record<Exclude<Room, 'courtyard'>, [number, number]> = { living: [X0, -1], bedroom: [-1, 3.5], kitchen: [3.5, X1] };

  // Walls of the back block. The courtyard facade gets openings for doors and windows.
  slab(base, M.plaster, X1 - X0, H, T, 0, H / 2, BACK);
  slab(base, M.plaster, T, H, D, X0, H / 2, (BACK + FRONT) / 2);
  slab(base, M.plaster, T, H, D, X1, H / 2, (BACK + FRONT) / 2);
  for (const x of [-1, 3.5]) slab(base, M.plaster, T * 0.8, H, D, x, H / 2, (BACK + FRONT) / 2);
  // Facade, built around openings: [x0, x1, sill, head] per opening.
  const openings: [number, number, number, number, Room | 'door'][] = [
    [-6.4, -5.0, 0.9, 2.4, 'living'], [-4.6, -3.2, 0.9, 2.4, 'living'], [-2.6, -1.6, 0, 2.25, 'door'],
    [-0.4, 0.8, 0.9, 2.4, 'bedroom'], [1.6, 2.6, 0, 2.25, 'door'],
    [4.2, 5.4, 1.1, 2.3, 'kitchen'], [6.0, 7.0, 0, 2.25, 'door'],
  ];
  let cursor = X0;
  for (const [a, b, sill, head] of openings) {
    if (a > cursor) slab(base, M.plaster, a - cursor, H, T, (a + cursor) / 2, H / 2, FRONT, 0.02);
    if (sill > 0) slab(base, M.plaster, b - a, sill, T, (a + b) / 2, sill / 2, FRONT, 0.02);
    slab(base, M.plaster, b - a, H - head, T, (a + b) / 2, head + (H - head) / 2, FRONT, 0.02);
    cursor = b;
  }
  slab(base, M.plaster, X1 - cursor, H, T, (X1 + cursor) / 2, H / 2, FRONT, 0.02);
  slab(base, M.plinth, X1 - X0 + 0.1, 0.35, T + 0.08, 0, 0.175, FRONT);

  // Window glass (lights per room), frames, sills, shutters; doors with frames.
  const glass = {} as Record<Room, THREE.BufferGeometry[]>;
  const windows = {} as Record<Room, THREE.MeshStandardMaterial>;
  for (const r of ['living', 'bedroom', 'kitchen', 'courtyard'] as Room[]) {
    glass[r] = [];
    windows[r] = new THREE.MeshStandardMaterial({ color: 0x0b0d12, emissive: 0xffb267, emissiveIntensity: 0, roughness: 0.25, metalness: 0.1 });
  }
  for (const [a, b, sill, head, kind] of openings) {
    const w = b - a, cx = (a + b) / 2, h = head - sill;
    if (kind === 'door') {
      block(base, M.wood, w - 0.12, h - 0.06, 0.08, cx, sill + h / 2, FRONT + 0.02);
      block(base, M.frame, w, 0.1, T + 0.04, cx, head - 0.05, FRONT);
      for (const s of [-1, 1]) block(base, M.frame, 0.08, h, T + 0.04, cx + s * (w / 2 - 0.04), sill + h / 2, FRONT);
      block(base, M.steel, 0.04, 0.04, 0.14, cx + w * 0.32, 1.05, FRONT + 0.1);
      // A lamp over each door, lit with the courtyard.
      const lamp = new THREE.BoxGeometry(0.3, 0.12, 0.14);
      lamp.translate(cx, head + 0.32, FRONT + 0.25);
      glass.courtyard.push(lamp);
    } else {
      const g = new THREE.BoxGeometry(w - 0.14, h - 0.14, 0.04);
      g.translate(cx, sill + h / 2, FRONT - 0.06);
      glass[kind].push(g);
      for (const s of [-1, 1]) block(base, M.frame, 0.07, h, 0.16, cx + s * (w / 2 - 0.035), sill + h / 2, FRONT + 0.05);
      block(base, M.frame, w, 0.07, 0.16, cx, head - 0.035, FRONT + 0.05);
      block(base, M.frame, 0.05, h - 0.14, 0.06, cx, sill + h / 2, FRONT - 0.02);
      slab(base, M.plinth, w + 0.24, 0.08, 0.34, cx, sill - 0.02, FRONT + 0.2, 0.02);
      // Open wooden shutters, folded back against the wall.
      for (const s of [-1, 1]) block(base, M.wood, w / 2, h, 0.05, cx + s * (w * 0.75 + 0.02), sill + h / 2, FRONT + 0.22);
    }
  }

  // Floors, one per room, so a tap can find the room.
  const floors: THREE.Mesh[] = [];
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x8c7a62, roughness: 0.9 });
  for (const [name, [a, b]] of Object.entries(rooms) as [Room, [number, number]][]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(b - a - T, 0.06, D - T), floorMat);
    f.position.set((a + b) / 2, 0.03, (BACK + FRONT) / 2);
    f.userData.room = name;
    f.receiveShadow = true;
    floors.push(f);
  }
  const court = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0 - T, 0.05, 7.6), M.tile);
  court.position.set(0, 0.025, 2.1);
  court.userData.room = 'courtyard';
  court.receiveShadow = true;
  floors.push(court);

  // Roof slab, parapet with stepped crenellations, as in the old Adrar towns.
  const roofY = H;
  slab(roofLayer, M.roofTop, X1 - X0 + 0.3, 0.24, D + 0.3, 0, roofY + 0.12, (BACK + FRONT) / 2, 0.04);
  const parapetH = 0.7;
  const edge = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(z1 - z0, x1 - x0);
    put(roofLayer, M.plaster, new RoundedBoxGeometry(len + 0.3, parapetH, 0.3, 2, 0.03), (x0 + x1) / 2, roofY + 0.24 + parapetH / 2, (z0 + z1) / 2, -ang);
    const n = Math.floor(len / 0.62);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      put(roofLayer, M.plaster, new RoundedBoxGeometry(0.26, 0.26, 0.3, 2, 0.02), x0 + (x1 - x0) * t, roofY + 0.24 + parapetH + 0.13, z0 + (z1 - z0) * t, -ang);
    }
  };
  edge(X0, BACK, X1, BACK);
  edge(X0, FRONT, X1, FRONT);
  edge(X0, BACK, X0, FRONT);
  edge(X1, BACK, X1, FRONT);

  // On the roof: the stair house, a water tank, solar panels, the air conditioner, the mast.
  slab(roofLayer, M.plaster, 2.6, 2.3, 2.4, X0 + 1.5, roofY + 0.24 + 1.15, BACK + 1.4, 0.04);
  slab(roofLayer, M.roofTop, 2.8, 0.16, 2.6, X0 + 1.5, roofY + 0.24 + 2.38, BACK + 1.4, 0.03);
  block(roofLayer, M.wood, 0.9, 1.9, 0.06, X0 + 1.5, roofY + 0.24 + 0.95, BACK + 2.62);
  put(roofLayer, M.light, new THREE.CylinderGeometry(0.62, 0.62, 1.3, 28), 5.6, roofY + 1.55, BACK + 1.1);
  for (const [dx, dz] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) block(roofLayer, M.steel, 0.06, 0.7, 0.06, 5.6 + dx, roofY + 0.6, BACK + 1.1 + dz);
  for (let i = 0; i < 3; i++) {
    put(roofLayer, M.solar, new THREE.BoxGeometry(1.0, 0.05, 1.7), -0.2 + i * 1.15, roofY + 0.85, BACK + 2.2, 0, -0.5);
    block(roofLayer, M.steel, 0.05, 0.55, 0.05, -0.2 + i * 1.15, roofY + 0.5, BACK + 2.9);
  }
  const ac = new THREE.Group();
  const acBody = new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.72, 0.62, 2, 0.04), M.light);
  acBody.castShadow = true;
  ac.add(acBody);
  const fan = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.07, 0.02), M.steel);
    blade.rotation.z = (i * Math.PI * 2) / 3;
    fan.add(blade);
  }
  fan.position.z = 0.33;
  ac.add(fan);
  const grille = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.015, 6, 24), M.steel);
  grille.position.z = 0.32;
  ac.add(grille);
  ac.position.set(4.4, roofY + 0.62, FRONT - 0.9);
  ac.rotation.y = 0;
  const mastTop = new THREE.Vector3(-3.2, roofY + 3.4, BACK + 0.9);
  put(roofLayer, M.steel, new THREE.CylinderGeometry(0.035, 0.05, 3.2, 8), mastTop.x, roofY + 1.8, mastTop.z);
  put(roofLayer, M.light, new THREE.SphereGeometry(0.42, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mastTop.x + 0.6, roofY + 1.0, mastTop.z + 0.2, 0, -1.9);

  // Courtyard walls, the gate and the pedestrian door.
  const CW = 2.7, Z1 = 6;
  slab(base, M.plaster, 1.2 - X0, CW, T, (X0 + 1.2) / 2, CW / 2, Z1);
  slab(base, M.plaster, X1 - 4.4, CW, T, (4.4 + X1) / 2, CW / 2, Z1);
  for (const x of [X0, X1]) slab(base, M.plaster, T, CW, Z1 - FRONT, x, CW / 2, (Z1 + FRONT) / 2);
  for (const x of [1.2, 4.4]) slab(base, M.plinth, 0.5, CW + 0.4, 0.5, x, (CW + 0.4) / 2, Z1, 0.04);
  for (const [x0, x1] of [[X0, 1.2], [4.4, X1]] as [number, number][]) {
    const n = Math.floor((x1 - x0) / 0.62);
    for (let i = 0; i <= n; i++) slab(base, M.plaster, 0.24, 0.24, T, x0 + ((x1 - x0) * i) / n, CW + 0.12, Z1, 0.02);
  }
  block(base, M.wood, 0.95, 2.1, 0.08, -4.7, 1.05, Z1 + 0.2);
  block(base, M.frame, 1.1, 0.1, T + 0.06, -4.7, 2.15, Z1);
  const leaf = (sign: number) => {
    const pivot = new THREE.Group();
    const parts: THREE.BufferGeometry[] = [];
    const w = 1.58, h = 2.3;
    for (let i = 0; i <= 9; i++) { const g = new THREE.BoxGeometry(0.05, h, 0.05); g.translate(sign * (0.06 + (i * (w - 0.1)) / 9), h / 2 + 0.05, 0); parts.push(g); }
    for (const y of [0.15, h - 0.05, h * 0.55]) { const g = new THREE.BoxGeometry(w, 0.08, 0.07); g.translate((sign * w) / 2, y, 0); parts.push(g); }
    const m = new THREE.Mesh(mergeGeometries(parts), M.steel);
    m.castShadow = true;
    pivot.add(m);
    return pivot;
  };
  const left = leaf(1), right = leaf(-1);
  left.position.set(1.42, 0, Z1);
  right.position.set(4.18, 0, Z1);

  // Outside stair up to the terrace, along the left wall.
  for (let i = 0; i < 16; i++) {
    const y = (i + 1) * (roofY / 16);
    slab(base, M.plaster, 1.1, 0.2, 0.32, X0 + 0.82, y - 0.1, 3.0 - i * 0.3, 0.02);
    slab(base, M.plinth, 1.1, y - 0.2 > 0 ? y - 0.2 : 0.01, 0.32, X0 + 0.82, (y - 0.2) / 2, 3.0 - i * 0.3, 0.01);
  }
  slab(base, M.plaster, 0.16, 0.9, 5.0, X0 + 1.4, 2.05, 0.75, 0.03);

  // The court: a date palm, planters, a shade sail over floor seating.
  const rand = seeded(11);
  for (let i = 0; i < 7; i++) put(base, M.trunk, new THREE.CylinderGeometry(0.17 - i * 0.012, 0.19 - i * 0.012, 0.66, 10), -3.4 + i * 0.03, 0.33 + i * 0.64, 2.9);
  const crown = new THREE.Vector3(-3.2, 4.6, 2.9);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + rand() * 0.3;
    const g = new THREE.PlaneGeometry(2.4, 0.42, 6, 1).translate(1.2, 0, 0);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v);
      pos.setY(v, pos.getY(v) * (1 - x / 2.6));
      pos.setZ(v, -0.18 * x * x);
    }
    g.computeVertexNormals();
    put(base, M.leaf, g, crown.x, crown.y, crown.z, a, -Math.PI / 2 + 0.35 + rand() * 0.3, 0);
  }
  for (const [x, z] of [[6.4, 5.2], [-6.6, 5.2], [3.2, -1.15]]) {
    put(base, M.terracotta, new THREE.CylinderGeometry(0.32, 0.22, 0.55, 16), x, 0.28, z);
    for (let k = 0; k < 5; k++) put(base, M.leaf, new THREE.IcosahedronGeometry(0.28 + rand() * 0.12, 0), x + (rand() - 0.5) * 0.4, 0.75 + rand() * 0.35, z + (rand() - 0.5) * 0.4);
  }
  for (const [x, z] of [[1.0, 1.4], [5.6, 1.4], [1.0, 4.6], [5.6, 4.6]]) block(base, M.steel, 0.06, 2.6, 0.06, x, 1.3, z);
  const sail = new THREE.PlaneGeometry(4.8, 3.4, 8, 6);
  const sp = sail.attributes.position as THREE.BufferAttribute;
  for (let v = 0; v < sp.count; v++) sp.setZ(v, -0.25 * Math.sin(((sp.getX(v) + 2.4) / 4.8) * Math.PI) * Math.sin(((sp.getY(v) + 1.7) / 3.4) * Math.PI));
  sail.computeVertexNormals();
  put(base, M.sail, sail, 3.3, 2.62, 3.0, 0, -Math.PI / 2);
  slab(base, M.fabric, 3.4, 0.22, 0.8, 3.3, 0.14, 4.55, 0.06);
  slab(base, M.fabric, 0.8, 0.22, 2.4, 1.55, 0.14, 3.0, 0.06);
  for (let i = 0; i < 4; i++) slab(base, M.cushion, 0.62, 0.42, 0.18, 1.95 + i * 0.85, 0.42, 4.85, 0.06);
  slab(base, M.rug, 2.6, 0.02, 1.8, 3.4, 0.06, 3.1, 0.01);

  // Inside: low seating along the living-room walls, a bed, a kitchen.
  const fy = 0.06;
  slab(base, M.fabric, 5.4, 0.3, 0.8, -4.3, fy + 0.15, BACK + 0.62, 0.06);
  slab(base, M.fabric, 0.8, 0.3, 2.6, X0 + 0.62, fy + 0.15, -3.8, 0.06);
  for (let i = 0; i < 6; i++) slab(base, M.cushion, 0.7, 0.5, 0.2, -6.4 + i * 0.85, fy + 0.5, BACK + 0.32, 0.07);
  slab(base, M.rug, 3.6, 0.02, 2.2, -4.0, fy + 0.01, -3.9, 0.01);
  slab(base, M.wood, 1.2, 0.32, 0.7, -4.0, fy + 0.16, -3.9, 0.04);
  block(base, M.screen, 1.6, 0.92, 0.05, -4.0, 1.7, FRONT - T / 2 - 0.04);
  slab(base, M.wood, 2.0, 0.45, 2.2, 1.25, fy + 0.22, -4.6, 0.05);
  slab(base, M.linen, 1.9, 0.18, 2.0, 1.25, fy + 0.54, -4.55, 0.06);
  slab(base, M.wood, 2.1, 0.9, 0.12, 1.25, fy + 0.6, BACK + 0.24, 0.03);
  slab(base, M.wood, 1.6, 2.2, 0.6, 3.0, fy + 1.1, -2.5, 0.03);
  slab(base, M.counter, 3.4, 0.9, 0.62, 5.5, fy + 0.45, BACK + 0.5, 0.03);
  slab(base, M.counter, 0.62, 0.9, 2.2, X1 - 0.5, fy + 0.45, -4.0, 0.03);
  slab(base, M.light, 0.75, 1.9, 0.7, 4.1, fy + 0.95, BACK + 0.55, 0.05);
  slab(base, M.wood, 1.1, 0.06, 0.8, 5.3, 0.78, -3.4, 0.02);

  // Merge each layer's geometry per material: few draw calls, real shadows.
  const group = new THREE.Group();
  const roof = new THREE.Group();
  const emit = (layer: Layer, into: THREE.Group) => {
    for (const [mat, geos] of layer) {
      const mesh = new THREE.Mesh(mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g))), mat);
      mesh.castShadow = mesh.receiveShadow = true;
      into.add(mesh);
    }
  };
  emit(base, group);
  emit(roofLayer, roof);
  roof.add(ac);
  for (const r of Object.keys(glass) as Room[]) {
    if (!glass[r].length) continue;
    group.add(new THREE.Mesh(mergeGeometries(glass[r]), windows[r]));
  }
  group.add(roof, left, right, ...floors);

  const lightSpots: Record<Room, THREE.Vector3> = {
    living: new THREE.Vector3(-4.2, 2.5, -3.4),
    bedroom: new THREE.Vector3(1.2, 2.5, -3.6),
    kitchen: new THREE.Vector3(5.5, 2.5, -3.6),
    courtyard: new THREE.Vector3(1.2, 2.6, 2.6),
  };
  return {
    group, roof, floors, windows, lightSpots,
    gate: [left, right],
    fan,
    mastTop,
    feedFrom: new THREE.Vector3(6.6, 2.5, -1.2),
    feedAt: new THREE.Vector3(2.6, 0.9, 5.4),
  };
}
