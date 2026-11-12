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
  // The house faces us with the sun behind it: a soft light from the front keeps it from going black.
  const fill = new THREE.DirectionalLight(0xdfe9ff, 2.4);
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
    pos.setY(i, heightAt(x, z) * smooth(8, -18, z) - 1.6);
  }
  sand.computeVertexNormals();
  // Darker than the house, so the house stands out in letters.
  const dunes = new THREE.Mesh(sand, new THREE.MeshStandardMaterial({ color: 0x7d6a4c, roughness: 1 }));
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
      sun.position.set(sx, lerp(-3.4, wide ? 3.4 : 6.2, rise), -22);
      rays.position.copy(sun.position).setZ(-22.5);
      rays.rotation.z = f.time * 0.04;
      rayMat.opacity = 0.05 + 0.2 * rise;
      sunLight.position.set(sx, lerp(0.6, 9, rise), -18);
      sunLight.intensity = lerp(0.8, 2.8, rise);

      const hx = wide ? 5.2 * side : 0, hz = 0.5;
      house.position.set(hx, heightAt(hx, hz) * smooth(8, -18, hz) - 1.6 + 0.05, hz);
      house.rotation.y = -0.5 * side;

      camera.aspect = f.aspect;
      camera.position.set(f.pointer.x * 0.6, 1.4 + rise * 0.5, wide ? 15 : 20);
      camera.lookAt(0, wide ? 1.4 : 2.6, -8);
      camera.updateProjectionMatrix();
    },
  };
  return ch;
}
