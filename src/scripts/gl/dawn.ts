import * as THREE from 'three';
import { lerp, smooth } from './util';
import { buildHouse } from './house';
import type { Chapter, SceneCtx } from './types';

/** The closing scene: the sun rises behind the dunes and the house, with rays turning slowly. */
export function create(ctx: SceneCtx): Chapter {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a2f20, 0.5));
  const sunLight = new THREE.DirectionalLight(0xfff0d8, 2.6);
  scene.add(sunLight);
  // A low light raking in from the side shapes the dunes into lit faces and shaded troughs, and gives
  // the house a bright wall and a shaded wall. Only a little light comes from the front.
  const rake = new THREE.DirectionalLight(0xffe6c4, 3.2);
  scene.add(rake);
  const fill = new THREE.DirectionalLight(0xdfe9ff, 0.7);
  fill.position.set(2, 5, 14);
  scene.add(fill);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 200);

  // Dunes: a wide sheet of sand, pushed into long ridges.
  const sand = new THREE.PlaneGeometry(90, 50, 150, 80);
  sand.rotateX(-Math.PI / 2);
  const pos = sand.attributes.position as THREE.BufferAttribute;
  const heightAt = (x: number, z: number) =>
    Math.sin(x * 0.16 + z * 0.22) * 1.1 + Math.sin(x * 0.07 - z * 0.11 + 1.7) * 1.6 + Math.sin(x * 0.45 + z * 0.3) * 0.18;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    // Flatter near the camera, taller toward the horizon.
    // Wind ripples on the near sand: thin ridges the raking light picks out as lines of letters.
    const ripple = Math.sin(x * 1.6 + Math.sin(z * 0.5) * 1.2 + z * 0.35) * 0.09 * smooth(-14, 6, z);
    pos.setY(i, heightAt(x, z) * smooth(8, -18, z) + ripple - 1.6);
  }
  sand.computeVertexNormals();
  // Darker than the house, so the house stands out in letters.
  const dunes = new THREE.Mesh(sand, new THREE.MeshStandardMaterial({ color: 0x6a5a40, roughness: 1 }));
  scene.add(dunes);

  const sun = new THREE.Mesh(new THREE.SphereGeometry(2.6, 40, 24), new THREE.MeshBasicMaterial({ color: 0xfff4dc }));
  const rays = new THREE.Group();
  const rayMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
  for (let i = 0; i < 14; i++) {
    const ray = new THREE.Mesh(new THREE.PlaneGeometry(i % 2 ? 0.16 : 0.34, 30), rayMat);
    ray.geometry.translate(0, 15, 0);
    ray.rotation.z = (i / 14) * Math.PI * 2;
    rays.add(ray);
  }
  scene.add(rays, sun);

  const house = buildHouse().group;
  // Drawn in letters, glass and dark trim would leave holes: one plain lime-wash finish makes the
  // whole house a solid shape that the low light shades wall by wall.
  const lime = new THREE.MeshStandardMaterial({ color: 0xf4ecdc, roughness: 0.9, emissive: 0x6e665a }); // dawn glow, so walls in shade still read
  house.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.material = lime; });
  house.scale.setScalar(0.3);
  scene.add(house);

  const ch: Chapter = {
    scene,
    camera,
    glyph: 1,
    gain: 1.15,
    fall: 0,
    update(f) {
      const wide = f.aspect > 1.05;
      const side = ctx.rtl ? -1 : 1;
      const rise = ctx.reduced ? 1 : smooth(0.05, 0.75, f.p);
      const sx = wide ? 5.2 * side : 0;
      sun.position.set(sx, lerp(-3.4, wide ? 3.4 : 5.4, rise), -22);
      rays.position.copy(sun.position).setZ(-22.5);
      rays.rotation.z = f.time * 0.04;
      rayMat.opacity = 0.05 + 0.2 * rise;
      sunLight.position.set(sx, lerp(0.6, 9, rise), -18);
      sunLight.intensity = lerp(0.8, 2.8, rise);

      rake.position.set(-16 * side, lerp(1.2, 3.2, rise), -4);
      rake.intensity = lerp(1.2, 3.2, rise);

      // The house stands back on the rise beside the sun, whole in the frame; on phones it sits on the
      // horizon above the words.
      const hx = wide ? 2.4 * side : 2.2 * side, hz = wide ? -7 : -9;
      house.scale.setScalar(wide ? 0.36 : 0.5);
      house.position.set(hx, heightAt(hx, hz) * smooth(8, -18, hz) - 1.6 + 0.05, hz);
      house.rotation.y = -0.5 * side;

      camera.aspect = f.aspect;
      camera.position.set(f.pointer.x * 0.6, 1.4 + rise * 0.5, wide ? 15 : 20);
      // Phones: aim lower, so the horizon (and the house on it) rises into the top half, above the words.
      camera.lookAt(0, wide ? 1.4 : -2.2, -8);
      camera.updateProjectionMatrix();
    },
  };
  return ch;
}
