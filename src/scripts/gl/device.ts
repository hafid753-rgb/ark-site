import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { markGeometries, seeded, smooth } from './util';
import type { Chapter, SceneCtx } from './types';

/** Sand gathers into the machine that runs the house, then it opens up. */
export function create(ctx: SceneCtx): Chapter {
  const scene = new THREE.Scene();
  scene.environment = ctx.env;
  scene.background = new THREE.Color(0x000000);
  scene.add(new THREE.HemisphereLight(0x9aa4b5, 0x1d160e, 0.5));
  const key = new THREE.DirectionalLight(0xfff1e0, 1.8);
  key.position.set(-4, 7, 5);
  scene.add(key);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);

  const shellMat = new THREE.MeshStandardMaterial({ color: 0x3a3835, metalness: 0.7, roughness: 0.34, transparent: true });
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x2a2826, metalness: 0.6, roughness: 0.4, transparent: true });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xe9e5dd, metalness: 1, roughness: 0.18 });
  const pcb = new THREE.MeshStandardMaterial({ color: 0x15201a, roughness: 0.6 });
  const chip = new THREE.MeshStandardMaterial({ color: 0x1e1e1e, roughness: 0.35, metalness: 0.3 });
  const alu = new THREE.MeshStandardMaterial({ color: 0xc9c5bd, metalness: 0.9, roughness: 0.28 });
  const amber = new THREE.MeshBasicMaterial({ color: 0x2997ff }); // the status light, in the brand blue

  const device = new THREE.Group();
  const cover = new THREE.Group();
  const shell = new THREE.Mesh(new RoundedBoxGeometry(3.4, 0.62, 3.4, 5, 0.26), shellMat);
  cover.add(shell);
  const [m1, m2] = markGeometries(0.14);
  const logo = new THREE.Group();
  logo.add(new THREE.Mesh(m1, chrome), new THREE.Mesh(m2, chrome));
  logo.scale.setScalar(0.3);
  logo.rotation.x = -Math.PI / 2;
  logo.position.y = 0.33;
  cover.add(logo);
  cover.position.y = 0.2;
  const base = new THREE.Mesh(new RoundedBoxGeometry(3.4, 0.3, 3.4, 4, 0.12), baseMat);
  base.position.y = -0.27;
  const led = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.035, 0.02), amber);
  led.position.set(0, -0.27, 1.71);
  device.add(cover, base, led);

  // Inside: the board with its processor, the radios, the storage.
  const board = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.05, 3.0), pcb);
  board.add(plate);
  for (let i = 0; i < 9; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 1.1), alu);
    fin.position.set(0.25 + i * 0.12, 0.17, -0.1);
    board.add(fin);
  }
  [[-0.9, 0.6], [-0.2, 1.05], [-1.05, -0.2]].forEach(([x, z]) => {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.05, 0.45), chip);
    c.position.set(x, 0.05, z);
    board.add(c);
  });
  board.position.y = -0.1;
  const radio = new THREE.Group();
  radio.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.55), pcb));
  for (const x of [-0.3, 0.3]) {
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 8), alu);
    ant.position.set(x, 0.29, -0.2);
    radio.add(ant);
  }
  radio.position.set(-0.85, 0.02, -0.85);
  const storage = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.05, 0.36), chip);
  storage.position.set(-0.4, 0.0, 0.95);
  device.add(board, radio, storage);
  scene.add(device);

  // Sand: some grains stay as dunes, the rest become the machine.
  const touch = matchMedia('(hover: none)').matches;
  const N = touch ? 12000 : 30000;
  const rand = seeded(7);
  const start = new Float32Array(N * 3), target = new Float32Array(N * 3), seed = new Float32Array(N);
  const samplers = [new MeshSurfaceSampler(shell).build(), new MeshSurfaceSampler(base).build()];
  const p = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const x = (rand() - 0.5) * 26, z = (rand() - 0.5) * 12 - 1;
    const y = -1.9 + 0.55 * Math.sin(x * 0.35 + Math.sin(z * 0.4) * 1.2) + 0.2 * Math.sin(x * 0.9 + z * 0.5) + rand() * 0.06;
    start.set([x, y, z], i * 3);
    const stays = rand() < 0.38;
    seed[i] = stays ? -1 : rand();
    if (stays) target.set([x, y, z], i * 3);
    else {
      const which = rand() < 0.8 ? 0 : 1;
      samplers[which].sample(p);
      target.set([p.x, p.y + (which ? -0.27 : 0.2), p.z], i * 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(start, 3));
  geo.setAttribute('aTarget', new THREE.BufferAttribute(target, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const sandMat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uA: { value: 0 }, uSolid: { value: 0 }, uPr: { value: 1 } },
    vertexShader: /* glsl */ `
      uniform float uT, uA, uSolid, uPr;
      attribute vec3 aTarget;
      attribute float aSeed;
      varying float vMix, vAlpha;
      void main() {
        float stays = step(aSeed, -0.5);
        float k = stays > 0.5 ? 0.0 : clamp((uA - aSeed * 0.45) / 0.55, 0.0, 1.0);
        k = k * k * (3.0 - 2.0 * k);
        float s = abs(aSeed) * 40.0;
        vec3 drift = vec3(sin(uT * 0.3 + s), 0.0, cos(uT * 0.25 + s * 0.7)) * 0.12 * (1.0 - k);
        vec3 swirl = vec3(sin(s * 2.1 + uT), cos(s * 1.7 + uT * 1.3), sin(s * 1.3)) * sin(k * 3.14159) * 1.1;
        vec3 pos = mix(position + drift, aTarget, k) + swirl;
        vMix = k;
        vAlpha = stays > 0.5 ? 1.0 : 1.0 - uSolid * smoothstep(0.9, 1.0, k);
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uPr * (2.2 - 0.8 * k) * (10.0 / -mv.z);
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vMix, vAlpha;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        if (dot(c, c) > 0.25) discard;
        vec3 sand = vec3(0.79, 0.62, 0.40);
        vec3 silicon = vec3(0.86, 0.85, 0.82);
        gl_FragColor = vec4(mix(sand, silicon, vMix) * 0.9, vAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
  });
  const sand = new THREE.Points(geo, sandMat);
  sand.frustumCulled = false;
  device.add(sand);

  const anchors = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const ch: Chapter = {
    scene,
    camera,
    glyph: 1, // drawn in letters, like the chapters around it
    gain: 1.8, // dark metal: lift it so the machine still gets letters
    fall: 0,
    anchors,
    anchorAlpha: 0,
    update(f) {
      const assemble = smooth(0.04, 0.38, f.p);
      const solid = smooth(0.34, 0.44, f.p);
      const open = smooth(0.5, 0.72, f.p);
      sandMat.uniforms.uT.value = f.time;
      sandMat.uniforms.uA.value = assemble;
      sandMat.uniforms.uSolid.value = solid;
      sandMat.uniforms.uPr.value = ctx.renderer.getPixelRatio();
      shellMat.opacity = baseMat.opacity = solid;
      shellMat.transparent = baseMat.transparent = solid < 1;
      chrome.opacity = solid;
      chrome.transparent = solid < 1;
      led.visible = solid > 0.5;
      [board, radio, storage].forEach((o) => (o.visible = solid > 0.98));

      cover.position.y = 0.2 + open * 2.1;
      board.position.y = -0.1 + open * 0.75;
      radio.position.y = 0.02 + open * 1.45;
      storage.position.y = open * 1.1;

      const wide = f.aspect > 1.05;
      const side = ctx.rtl ? -1 : 1;
      device.position.set(wide ? 2.9 * side : 0, wide ? 0 : 1.6, 0);
      device.rotation.y = -0.55 * side + Math.sin(f.time * 0.2) * 0.12 * solid + open * 0.35 * side;
      camera.aspect = f.aspect;
      camera.position.set(0, 4.2, wide ? 13 : 19);
      camera.lookAt(0, wide ? 0.2 : 0.6, 0);
      camera.updateProjectionMatrix();

      device.updateMatrixWorld();
      board.localToWorld(anchors[0].set(0.75, 0.25, -0.1));
      radio.localToWorld(anchors[1].set(0, 0.2, 0));
      storage.localToWorld(anchors[2].set(0, 0.1, 0));
      cover.localToWorld(anchors[3].set(1.2, 0.35, 1.2));
      ch.anchorAlpha = smooth(0.6, 0.7, f.p);
    },
  };
  return ch;
}
