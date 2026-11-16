import * as THREE from 'three';
import { mergeColored } from './geometry.js';

const ico = (r, detail = 0) => new THREE.IcosahedronGeometry(r, detail);

export function oliveTreeGeometry(rng, scale = 1, detail = 1) {
  const parts = [];
  const trunkColor = '#7b6a57';
  const lean = rng.range(-0.25, 0.25);
  parts.push({ geometry: new THREE.CylinderGeometry(0.16, 0.32, 1.7, 6), color: trunkColor, t: { y: 0.8, rz: lean } });
  parts.push({ geometry: new THREE.CylinderGeometry(0.1, 0.18, 1.3, 5), color: '#6f5e4c', t: { x: 0.35 + lean, y: 1.9, rz: -0.6 } });
  parts.push({ geometry: new THREE.CylinderGeometry(0.1, 0.17, 1.2, 5), color: '#6f5e4c', t: { x: -0.3 + lean, y: 1.85, rz: 0.55, ry: 0.8 } });
  const greens = ['#8c9b5e', '#7f9055', '#9aa86c', '#87975a', '#a3ad78'];
  const n = 6 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2 + rng() * 0.6;
    const rad = i === 0 ? 0 : rng.range(0.7, 1.3);
    const r = rng.range(0.75, 1.1);
    parts.push({
      geometry: ico(r, detail),
      color: rng.pick(greens),
      t: { x: Math.cos(a) * rad + lean, y: rng.range(2.3, 3.1), z: Math.sin(a) * rad, sy: 0.72 },
    });
  }
  const g = mergeColored(parts);
  g.scale(scale, scale, scale);
  return g;
}

export function palmTreeGeometry(rng, height = 7) {
  const parts = [];
  const segs = 8;
  const bend = rng.range(0.4, 0.9);
  const dir = rng() * Math.PI * 2;
  let topX = 0;
  let topZ = 0;
  for (let i = 0; i < segs; i += 1) {
    const t = i / segs;
    const off = bend * t * t;
    const x = Math.cos(dir) * off;
    const z = Math.sin(dir) * off;
    const h = height / segs;
    parts.push({
      geometry: new THREE.CylinderGeometry(0.2 - t * 0.06, 0.26 - t * 0.06, h * 1.05, 7),
      color: i % 2 ? '#8a6d4a' : '#9c7c55',
      t: { x, y: h * (i + 0.5), z, rx: Math.sin(dir) * bend * 0.25 * t, rz: -Math.cos(dir) * bend * 0.25 * t },
    });
    topX = x;
    topZ = z;
  }
  const fronds = 9;
  const greens = ['#5c8f38', '#6d9e3f', '#4f7f31', '#76a845'];
  for (let i = 0; i < fronds; i += 1) {
    const a = (i / fronds) * Math.PI * 2 + rng() * 0.3;
    const color = rng.pick(greens);
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    // inner rising part, then drooping tip
    parts.push({
      geometry: new THREE.BoxGeometry(1.6, 0.05, 0.55),
      color,
      t: { x: topX + ca * 0.75, y: height + 0.2, z: topZ + sa * 0.75, ry: -a, rz: 0.25, order: 'YZX' },
    });
    parts.push({
      geometry: new THREE.BoxGeometry(1.6, 0.05, 0.42),
      color,
      t: { x: topX + ca * 2.15, y: height - 0.2, z: topZ + sa * 2.15, ry: -a, rz: -0.55, order: 'YZX' },
    });
  }
  for (let i = 0; i < 5; i += 1) {
    parts.push({ geometry: ico(0.13), color: '#b8742c', t: { x: topX + rng.range(-0.25, 0.25), y: height - 0.25, z: topZ + rng.range(-0.25, 0.25) } });
  }
  return mergeColored(parts);
}

export function cypressGeometry(rng) {
  const h = rng.range(5, 7.5);
  return mergeColored([
    { geometry: new THREE.CylinderGeometry(0.12, 0.18, 0.8, 5), color: '#5d4a38', t: { y: 0.4 } },
    { geometry: new THREE.ConeGeometry(0.95, h, 7), color: '#46653a', t: { y: 0.6 + h / 2 } },
    { geometry: new THREE.ConeGeometry(0.75, h * 0.6, 7), color: '#3c5a33', t: { y: 0.6 + h * 0.62, ry: 0.4 } },
  ]);
}

export function bushGeometry(rng, detail = 0) {
  const parts = [];
  const greens = ['#7e8f4e', '#8f9c5a', '#6e8146'];
  for (let i = 0; i < 3; i += 1) {
    parts.push({ geometry: ico(rng.range(0.4, 0.65), detail), color: rng.pick(greens), t: { x: rng.range(-0.4, 0.4), y: 0.35, z: rng.range(-0.4, 0.4), sy: 0.75 } });
  }
  return mergeColored(parts);
}

export function rockGeometry(rng) {
  const g = mergeColored([
    { geometry: ico(1, 0), color: '#c2b08f', t: { y: 0.3, sx: rng.range(0.8, 1.4), sy: rng.range(0.5, 0.8), sz: rng.range(0.8, 1.2), ry: rng() * 3 } },
    { geometry: ico(0.55, 0), color: '#b09d7c', t: { x: 0.8, y: 0.15, z: 0.2, ry: rng() * 3 } },
  ]);
  return g;
}

export function grassTuftGeometry() {
  const parts = [];
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2;
    parts.push({
      geometry: new THREE.ConeGeometry(0.07, 0.55, 3, 1, true),
      color: i % 2 ? '#a9a660' : '#9a9d55',
      t: { x: Math.cos(a) * 0.08, y: 0.25, z: Math.sin(a) * 0.08, rx: Math.sin(a) * 0.35, rz: -Math.cos(a) * 0.35 },
    });
  }
  return mergeColored(parts);
}

const tmp = new THREE.Object3D();
const tint = new THREE.Color();

/** InstancedMesh from a template geometry with per-instance transform and tint jitter. */
export function scatterInstanced(geometry, material, placements, rng, { castShadow = true, tintJitter = 0.08 } = {}) {
  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  placements.forEach((p, i) => {
    tmp.position.set(p.x, p.y, p.z);
    tmp.rotation.set(0, p.ry ?? rng() * Math.PI * 2, 0);
    tmp.scale.setScalar(p.s ?? 1);
    tmp.updateMatrix();
    mesh.setMatrixAt(i, tmp.matrix);
    const j = 1 + (rng() - 0.5) * tintJitter * 2;
    tint.setRGB(j, j, j * (1 + (rng() - 0.5) * 0.05));
    mesh.setColorAt(i, tint);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  return mesh;
}
