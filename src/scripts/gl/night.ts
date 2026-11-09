import * as THREE from 'three';
import { approach, NOISE } from './util';
import type { Chapter, SceneCtx } from './types';
import { state, bus, update, ROOMS, type Room } from '../home';
import { buildHouse } from './house';

/** The courtyard house at night: under clouds (03) or seen from above with its roof off (04). */
export function create(ctx: SceneCtx): Chapter {
  const touch = matchMedia('(hover: none)').matches;
  ctx.renderer.shadowMap.enabled = true;
  ctx.renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x04060b, 0.013);
  scene.add(new THREE.HemisphereLight(0x8fa0c4, 0x1e1710, 0.8));
  // Moonlight rakes in from the front-left so the plaster and parapets read; the moon itself
  // is drawn in the sky behind the house, where the eye expects it.
  const moonDir = new THREE.Vector3(-0.42, 0.5, -0.76).normalize();
  const moon = new THREE.DirectionalLight(0xc9d7f2, 2.4);
  moon.position.set(-22, 30, 18);
  moon.castShadow = true;
  moon.shadow.mapSize.set(touch ? 1024 : 2048, touch ? 1024 : 2048);
  Object.assign(moon.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 90 });
  moon.shadow.bias = -0.0004;
  moon.shadow.normalBias = 0.03;
  moon.shadow.radius = 3;
  scene.add(moon, moon.target);
  const rim = new THREE.DirectionalLight(0x7f95c4, 0.9); // the moon's glow catching the far edges
  rim.position.copy(moonDir).multiplyScalar(40);
  scene.add(rim);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 500);

  // Sand that rises into dunes away from the house.
  const groundGeo = new THREE.PlaneGeometry(320, 320, 160, 160);
  groundGeo.rotateX(-Math.PI / 2);
  const gp = groundGeo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(gp.count * 3);
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i), z = gp.getZ(i), r = Math.hypot(x, z);
    const dune = Math.max(0, Math.min(1, (r - 22) / 60));
    gp.setY(i, dune * (4.5 * Math.sin(x * 0.045 + Math.sin(z * 0.03) * 2) + 2.2 * Math.sin(z * 0.08 + x * 0.02) + 3) - 0.02);
    const v = 0.9 + 0.1 * Math.sin(x * 0.7 + z * 0.3) * Math.sin(z * 0.5);
    colors.set([0.34 * v, 0.28 * v, 0.21 * v], i * 3);
  }
  groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  groundGeo.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  ground.receiveShadow = true;
  scene.add(ground);

  const house = buildHouse();
  scene.add(house.group);
  const lights = {} as Record<Room, THREE.PointLight>;
  for (const r of ROOMS) {
    lights[r] = new THREE.PointLight(0xffb06a, 0, r === 'courtyard' ? 12 : 10, 1.3);
    lights[r].position.copy(house.lightSpots[r]);
    scene.add(lights[r]);
  }

  // Sky: stars, the moon, and clouds over them. uCloud 1 = overcast, 0 = clear.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(400, 48, 24),
    new THREE.ShaderMaterial({
      uniforms: { uCloud: { value: 1 }, uTime: { value: 0 }, uMoon: { value: moonDir } },
      vertexShader: /* glsl */ `varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uCloud, uTime;
        uniform vec3 uMoon;
        varying vec3 vDir;
        ${NOISE}
        void main() {
          vec3 d = normalize(vDir);
          float h = max(d.y, 0.0);
          vec3 col = mix(vec3(0.05, 0.06, 0.09), vec3(0.008, 0.01, 0.02), pow(h, 0.45));
          vec2 sp = vec2(atan(d.z, d.x), asin(clamp(d.y, -1.0, 1.0))) * 90.0;
          vec2 cell = floor(sp);
          float s = hash12(cell);
          float dist = length(fract(sp) - vec2(hash12(cell + 7.1), hash12(cell + 3.3)));
          float star = step(0.972, s) * smoothstep(0.11, 0.0, dist) * (0.55 + 0.45 * sin(uTime * 1.7 + s * 61.0));
          star += step(0.995, s) * smoothstep(0.2, 0.0, dist) * 1.8;
          vec3 bandN = normalize(vec3(0.3, 0.2, 0.93));
          float band = exp(-pow(dot(d, bandN), 2.0) * 10.0) * fbm(sp * 0.035) * 0.08;
          float m = dot(d, uMoon);
          vec3 moonCol = vec3(1.0, 0.97, 0.9) * smoothstep(0.9993, 0.9996, m) * 3.0 + vec3(0.35, 0.42, 0.6) * pow(max(m, 0.0), 180.0) * 0.6;
          vec3 night = col + vec3(0.9, 0.93, 1.0) * star * smoothstep(0.02, 0.15, d.y) + vec3(0.5, 0.55, 0.7) * band * h;
          // Clouds: drift overhead, fade before the horizon (no streaks), lit on the moon side.
          vec2 uv = d.xz / (d.y + 0.25) * 1.6 + vec2(uTime * 0.012, 0.0);
          float n = fbm(uv);
          float cover = smoothstep(0.42, 0.66, n + 0.16) * uCloud * smoothstep(0.03, 0.22, d.y);
          vec3 cloud = mix(vec3(0.07, 0.08, 0.1), vec3(0.24, 0.27, 0.34), n) + vec3(0.25, 0.3, 0.42) * pow(max(m, 0.0), 12.0) * 0.5;
          vec3 skyCol = night * (1.0 - 0.8 * uCloud) + moonCol * (1.0 - cover);
          gl_FragColor = vec4(mix(skyCol, cloud, cover), 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    }),
  );
  scene.add(sky);

  // Threads from the mast up into the cloud. A blue pulse travels them on each round trip.
  const threadMat = new THREE.ShaderMaterial({
    uniforms: { uPulse: { value: -1 }, uAlive: { value: 1 } },
    vertexShader: /* glsl */ `
      uniform float uAlive;
      attribute float aT;
      varying float vT;
      void main() {
        vT = aT;
        vec3 p = position;
        p.y -= (1.0 - uAlive) * aT * aT * 60.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uPulse, uAlive;
      varying float vT;
      void main() {
        float pulse = uPulse < 0.0 ? 0.0 : exp(-pow((vT - uPulse) * 9.0, 2.0));
        vec3 col = mix(vec3(0.42, 0.55, 0.75), vec3(0.16, 0.59, 1.0), pulse);
        gl_FragColor = vec4(col * (0.9 + 2.4 * pulse), (0.5 + pulse) * uAlive * (1.0 - vT * 0.5));
      }
    `,
    transparent: true,
    depthWrite: false,
  });
  const threads = new THREE.Group();
  const top = house.mastTop;
  [[-40, 90, -120], [-8, 105, -140], [30, 95, -125]].forEach(([x, y, z]) => {
    const pts: number[] = [], ts: number[] = [];
    for (let i = 0; i <= 48; i++) {
      const t = i / 48;
      pts.push(top.x + (x - top.x) * t, top.y + (y - top.y) * t - Math.sin(t * Math.PI) * 6, top.z + (z - top.z) * t);
      ts.push(t);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.setAttribute('aT', new THREE.Float32BufferAttribute(ts, 1));
    threads.add(new THREE.Line(g, threadMat));
  });
  scene.add(threads);

  let trip = { at: -1, dur: 1 };
  let now = 0;
  bus.addEventListener('cloud-trip', (e) => (trip = { at: now, dur: (e as CustomEvent<number>).detail / 1000 }));

  const feedCam = new THREE.PerspectiveCamera(64, 2.4, 0.1, 80);
  feedCam.position.copy(house.feedFrom);
  feedCam.lookAt(house.feedAt);

  const glow = Object.fromEntries(ROOMS.map((r) => [r, 0])) as Record<Room, number>;
  let cloud = 1, alive = 1, fanSpeed = 0, gate = 0;
  const target = new THREE.Vector3();
  const ray = new THREE.Raycaster();
  const [left, right] = house.gate;

  const ch: Chapter = {
    scene,
    camera,
    glyph: 0,
    fall: 0,
    feed: null,
    update(f) {
      now = f.time;
      const dt = f.dt;
      cloud = approach(cloud, state.cloud ? 1 : 0, dt, 1.1);
      alive = approach(alive, state.cloud ? 1 : 0, dt, 2.2);
      const sm = (sky.material as THREE.ShaderMaterial).uniforms;
      sm.uCloud.value = cloud;
      sm.uTime.value = f.time;
      threadMat.uniforms.uAlive.value = alive;
      const k = trip.at < 0 ? -1 : (f.time - trip.at) / trip.dur;
      threadMat.uniforms.uPulse.value = k < 0 || k > 1 ? -1 : k < 0.5 ? k * 2 : 2 - k * 2;

      for (const r of ROOMS) {
        glow[r] = approach(glow[r], state.lights[r] ? 1 : 0, dt, 7);
        lights[r].intensity = glow[r] * (r === 'courtyard' ? 26 : 34);
        house.windows[r].emissiveIntensity = glow[r] * 3.2;
      }
      fanSpeed = approach(fanSpeed, state.ac ? 11 : 0, dt, 1.5);
      house.fan.rotation.z += fanSpeed * dt;
      gate = approach(gate, state.gate ? 1.4 : 0, dt, 2.2);
      left.rotation.y = -gate;
      right.rotation.y = gate;

      const cutaway = f.mode === 'cutaway';
      house.roof.visible = !cutaway;
      threads.visible = !cutaway;
      ch.feed = cutaway ? feedCam : null;
      const wide = f.aspect > 1.05;
      const side = ctx.rtl ? -1 : 1;
      const sway = Math.sin(f.time * 0.07) * 1.4;
      if (cutaway) {
        camera.fov = 34;
        camera.position.set(sway - (wide ? 3.5 * side : 0), wide ? 30 : 42, wide ? 22 : 27);
        target.set(wide ? -3.5 * side : 0, 0, 0.4);
      } else {
        // High enough to see over the courtyard wall to the lit facade.
        camera.fov = 34;
        camera.position.set(-8 * side + sway, 13, wide ? 34 : 46);
        target.set(wide ? -8.2 * side : 0, wide ? 5.2 : 3.2, -1);
      }
      camera.aspect = f.aspect;
      camera.lookAt(target);
      camera.updateProjectionMatrix();
    },
    pick(ndc) {
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(house.floors)[0];
      const room = hit?.object.userData.room as Room | undefined;
      if (!room) return false;
      update((s) => (s.lights[room] = !s.lights[room]));
      return true;
    },
  };
  return ch;
}
