import * as THREE from 'three';
import { worldBox } from './geometry.js';
import { terrainHeight } from './layout.js';

/**
 * The near shore of the Sea of Galilee: a wooden dock and a moored fishing
 * boat. Batched into the static world; colliders returned as descriptors.
 */
export function buildShore(batcher) {
  const colliders = [];
  const plank = '#9c6b40';
  const dark = '#5a3a1e';
  // dock: runs east from the beach into the water
  const dz = -15;
  const x0 = 104;
  const x1 = 126;
  const deckY = 0.62;
  const len = x1 - x0;
  for (let x = x0; x < x1; x += 0.55) {
    const g = new THREE.BoxGeometry(0.5, 0.1, 2.6);
    batcher.add(g, 'wood', Math.random() < 0.5 ? plank : '#8a5c34', { x: x + 0.25, y: deckY, z: dz });
    g.dispose();
  }
  for (let x = x0 + 1; x <= x1; x += 3) {
    for (const s of [-1.2, 1.2]) {
      const ground = Math.min(terrainHeight(x, dz + s), 0) - 1.5;
      const h = deckY - ground;
      const g = new THREE.CylinderGeometry(0.12, 0.14, h, 6);
      batcher.add(g, 'wood', dark, { x, y: ground + h / 2, z: dz + s });
      g.dispose();
    }
  }
  colliders.push({ shape: 'box', hx: len / 2, hy: 0.06, hz: 1.3, x: (x0 + x1) / 2, y: deckY, z: dz });
  // ramp from the sand up to the deck
  const rampG = worldBox(2.4, 0.12, 2.6, 1);
  const sandY = terrainHeight(x0 - 1.2, dz);
  const rampAng = Math.atan2(deckY - sandY, 2.4);
  batcher.add(rampG, 'wood', plank, { x: x0 - 1.1, y: (deckY + sandY) / 2, z: dz, rz: rampAng });
  rampG.dispose();
  colliders.push({ shape: 'box', hx: 1.3, hy: 0.06, hz: 1.3, x: x0 - 1.1, y: (deckY + sandY) / 2, z: dz, q: { x: 0, y: 0, z: Math.sin(rampAng / 2), w: Math.cos(rampAng / 2) } });

  // fishing boat out on the water (a walk-on-water destination)
  const bx = 147;
  const bz = -22;
  const boat = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: '#7a4f2a', roughness: 0.8 });
  const trimMat = new THREE.MeshStandardMaterial({ color: '#c9a66b', roughness: 0.8 });
  const sailMat = new THREE.MeshStandardMaterial({ color: '#efe4c8', roughness: 0.95, side: THREE.DoubleSide });
  const add = (geo, mat, x, y, z, r = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(r.x || 0, r.y || 0, r.z || 0);
    m.castShadow = true;
    m.receiveShadow = true;
    boat.add(m);
    return m;
  };
  add(new THREE.BoxGeometry(2.2, 0.7, 5.2), hullMat, 0, 0.15, 0);
  add(new THREE.BoxGeometry(1.6, 0.6, 1.4), hullMat, 0, 0.2, 3.0, { x: 0.25 });
  add(new THREE.BoxGeometry(1.6, 0.6, 1.2), hullMat, 0, 0.25, -2.9, { x: -0.3 });
  add(new THREE.BoxGeometry(2.3, 0.12, 5.3), trimMat, 0, 0.52, 0);
  add(new THREE.BoxGeometry(1.9, 0.08, 4.6), trimMat, 0, 0.45, 0);
  add(new THREE.CylinderGeometry(0.08, 0.1, 4.2, 6), hullMat, 0, 2.5, 0.6);
  add(new THREE.PlaneGeometry(2.6, 2.8), sailMat, 0.05, 2.9, 0.6, { y: Math.PI / 2 });
  add(new THREE.IcosahedronGeometry(0.45, 0), new THREE.MeshStandardMaterial({ color: '#d8c8a0', roughness: 1 }), 0.4, 0.62, -1.2);
  boat.position.set(bx, 0, bz);
  boat.rotation.y = 0.5;
  boat.name = 'fishing-boat';
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.5, 0));
  colliders.push({ shape: 'box', hx: 1.1, hy: 0.25, hz: 2.6, x: bx, y: 0.25, z: bz, q: { x: q.x, y: q.y, z: q.z, w: q.w } });
  return { colliders, boat, dock: { x: (x0 + x1) / 2, z: dz, deckY }, boatSpot: { x: bx, z: bz } };
}
