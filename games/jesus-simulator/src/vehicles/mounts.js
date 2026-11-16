import * as THREE from 'three';
import { mergeColored, roundedBox } from '../world/geometry.js';

/**
 * Procedural ride models. A quadruped is a body mesh (torso, saddle, tack)
 * plus pivots for the head/neck, the four legs and the tail, so a gait can
 * swing them. Carts and chariots add a car mesh and spinning wheels.
 * Every part shares one vertex-coloured material: a donkey is 7 draw calls.
 */

let sharedMat = null;
const mat = () => (sharedMat ||= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
const geoCache = new Map();

function mesh(geometry) {
  const m = new THREE.Mesh(geometry, mat());
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const box = (w, h, d, r = 0.06) => roundedBox(w, h, d, r, 1);

/** Per-species proportions and colours. */
export const SPECIES = {
  donkey: {
    coat: '#8f8a84', belly: '#d8d2c8', dark: '#4a443e', mane: '#3a342e', hoof: '#2e2822',
    torso: [0.56, 0.6, 1.18], torsoY: 1.0, leg: 0.72, legW: 0.15, neck: 0.55, neckTilt: 0.75, head: [0.3, 0.32, 0.58], ears: 0.36,
    saddle: '#a8322a', blanket: '#e0b46a', seatY: 1.42, tail: 0.5,
  },
  horse: {
    coat: '#8a5434', belly: '#9c6440', dark: '#3a2418', mane: '#2a1810', hoof: '#2a2420',
    torso: [0.66, 0.74, 1.62], torsoY: 1.38, leg: 1.02, legW: 0.17, neck: 0.85, neckTilt: 0.62, head: [0.3, 0.36, 0.7], ears: 0.18,
    saddle: '#6b3a1e', blanket: '#2f5d8a', seatY: 1.86, tail: 0.85,
  },
  legionHorse: {
    coat: '#3b2a22', belly: '#4a3428', dark: '#1e1612', mane: '#14100c', hoof: '#1e1a16',
    torso: [0.68, 0.76, 1.66], torsoY: 1.4, leg: 1.04, legW: 0.17, neck: 0.88, neckTilt: 0.6, head: [0.3, 0.36, 0.72], ears: 0.18,
    saddle: '#4a2f1a', blanket: '#a8322a', seatY: 1.9, tail: 0.9, plume: '#c0281e',
  },
  whiteHorse: {
    coat: '#ece6dc', belly: '#f4efe6', dark: '#9a948a', mane: '#d8d2c6', hoof: '#5a544c',
    torso: [0.66, 0.74, 1.62], torsoY: 1.38, leg: 1.02, legW: 0.17, neck: 0.85, neckTilt: 0.62, head: [0.3, 0.36, 0.7], ears: 0.18,
    saddle: null, blanket: null, seatY: 1.86, tail: 0.85, plume: '#c0281e',
  },
  camel: {
    coat: '#c79a62', belly: '#d8b07a', dark: '#8a6a40', mane: '#a87f4a', hoof: '#6a5034',
    torso: [0.74, 0.78, 1.6], torsoY: 1.85, leg: 1.48, legW: 0.15, neck: 1.0, neckTilt: 1.05, head: [0.3, 0.32, 0.62], ears: 0.1,
    saddle: '#7a2f3a', blanket: '#e0a12c', seatY: 2.72, tail: 0.6, hump: true,
  },
};

function legGeometry(sp) {
  const key = `leg:${sp.coat}:${sp.leg}`;
  if (geoCache.has(key)) return geoCache.get(key);
  const L = sp.leg;
  const w = sp.legW;
  const g = mergeColored([
    { geometry: box(w * 1.5, L * 0.5, w * 1.7, 0.05), color: sp.coat, t: { y: -L * 0.22 } },
    { geometry: box(w, L * 0.52, w * 1.05, 0.04), color: sp.coat, t: { y: -L * 0.66 } },
    { geometry: box(w * 1.2, 0.1, w * 1.35, 0.03), color: sp.hoof, t: { y: -L + 0.05, z: 0.02 } },
  ]);
  geoCache.set(key, g);
  return g;
}

function headGeometry(sp, kind) {
  const key = `head:${kind}`;
  if (geoCache.has(key)) return geoCache.get(key);
  const [hw, hh, hl] = sp.head;
  const N = sp.neck;
  const parts = [
    // neck rises from the pivot (at the withers) forward and up
    { geometry: box(sp.torso[0] * 0.55, N, sp.torso[0] * 0.62, 0.08), color: sp.coat, t: { y: N * 0.45, z: 0.05, rx: sp.neckTilt } },
  ];
  const hy = Math.cos(sp.neckTilt) * N * 0.95;
  const hz = Math.sin(sp.neckTilt) * N * 0.95 + 0.05;
  parts.push({ geometry: box(hw, hh, hl, 0.08), color: sp.coat, t: { y: hy, z: hz + hl * 0.3, rx: 0.35 } });
  parts.push({ geometry: box(hw * 0.92, hh * 0.7, hl * 0.32, 0.06), color: sp.belly, t: { y: hy - hh * 0.25, z: hz + hl * 0.72, rx: 0.35 } });
  // eyes
  for (const s of [-1, 1]) parts.push({ geometry: new THREE.BoxGeometry(0.03, 0.06, 0.06), color: '#14100c', t: { x: s * hw * 0.5, y: hy + hh * 0.12, z: hz + hl * 0.12 } });
  // ears
  for (const s of [-1, 1]) {
    parts.push({ geometry: box(0.07, sp.ears, 0.06, 0.02), color: kind === 'donkey' ? sp.dark : sp.coat, t: { x: s * hw * 0.35, y: hy + hh * 0.45 + sp.ears * 0.4, z: hz - 0.02, rz: -s * 0.25, rx: -0.2 } });
  }
  // mane along the neck
  if (kind !== 'camel') parts.push({ geometry: box(0.07, N * 0.95, 0.14, 0.03), color: sp.mane, t: { y: N * 0.5, z: -0.12, rx: sp.neckTilt } });
  // bridle
  parts.push({ geometry: box(hw * 1.06, 0.05, 0.06, 0.02), color: '#3a2418', t: { y: hy - hh * 0.05, z: hz + hl * 0.58, rx: 0.35 } });
  if (sp.plume) parts.push({ geometry: box(0.08, 0.32, 0.22, 0.04), color: sp.plume, t: { y: hy + hh * 0.75, z: hz - 0.05 } });
  const g = mergeColored(parts);
  geoCache.set(key, g);
  return g;
}

function bodyGeometry(sp, kind) {
  const key = `body:${kind}`;
  if (geoCache.has(key)) return geoCache.get(key);
  const [w, h, l] = sp.torso;
  const y = sp.torsoY;
  const parts = [
    { geometry: box(w, h, l, 0.18), color: sp.coat, t: { y } },
    { geometry: box(w * 0.86, h * 0.3, l * 0.8, 0.1), color: sp.belly, t: { y: y - h * 0.38 } },
    { geometry: box(w * 1.02, h * 0.9, l * 0.3, 0.16), color: sp.coat, t: { y: y + 0.02, z: l * 0.36 } },
    { geometry: box(w * 1.02, h * 0.92, l * 0.3, 0.16), color: sp.coat, t: { y: y + 0.03, z: -l * 0.38 } },
  ];
  if (sp.hump) parts.push({ geometry: new THREE.SphereGeometry(w * 0.55, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2), color: sp.coat, t: { y: y + h * 0.42, sz: 1.3, sy: 1.15 } });
  if (sp.blanket) parts.push({ geometry: box(w * 1.12, 0.05, l * 0.42, 0.02), color: sp.blanket, t: { y: y + h / 2 + (sp.hump ? w * 0.6 : 0) + 0.01, z: 0.02 } });
  if (sp.blanket) for (const s of [-1, 1]) parts.push({ geometry: box(0.04, h * 0.45, l * 0.4, 0.02), color: sp.blanket, t: { x: s * w * 0.56, y: y + h * 0.25, z: 0.02 } });
  if (sp.saddle) {
    const sy = y + h / 2 + (sp.hump ? w * 0.62 : 0) + 0.08;
    parts.push({ geometry: box(w * 0.7, 0.12, l * 0.3, 0.05), color: sp.saddle, t: { y: sy, z: 0.02 } });
    parts.push({ geometry: box(w * 0.5, 0.16, 0.08, 0.03), color: sp.saddle, t: { y: sy + 0.08, z: l * 0.15 } });
    // stirrups
    for (const s of [-1, 1]) parts.push({ geometry: box(0.04, 0.5, 0.04, 0.01), color: '#3a2418', t: { x: s * w * 0.58, y: y + 0.12, z: 0.05 } });
  }
  if (kind === 'donkey') parts.push({ geometry: box(0.06, 0.08, l * 0.6, 0.02), color: sp.dark, t: { y: y + h / 2 + 0.06, z: -0.1 } });
  const g = mergeColored(parts);
  geoCache.set(key, g);
  return g;
}

function tailGeometry(sp, kind) {
  const key = `tail:${kind}`;
  if (geoCache.has(key)) return geoCache.get(key);
  const g = mergeColored([
    { geometry: box(0.1, sp.tail, 0.1, 0.03), color: kind === 'camel' ? sp.coat : sp.mane, t: { y: -sp.tail * 0.5 } },
    { geometry: box(0.16, sp.tail * 0.35, 0.14, 0.05), color: sp.mane, t: { y: -sp.tail * 0.9 } },
  ]);
  geoCache.set(key, g);
  return g;
}

/** Builds a rideable animal. Local +z is forward; the group origin is on the ground under the torso centre. */
export function buildQuadruped(kind, speciesKey = kind) {
  const sp = SPECIES[speciesKey];
  const group = new THREE.Group();
  const root = new THREE.Group(); // pitches with the gait / slope
  group.add(root);
  const [w, h, l] = sp.torso;
  const y = sp.torsoY;
  root.add(mesh(bodyGeometry(sp, speciesKey)));
  const head = new THREE.Group();
  head.position.set(0, y + h * 0.3, l * 0.42);
  head.add(mesh(headGeometry(sp, speciesKey)));
  root.add(head);
  const tail = new THREE.Group();
  tail.position.set(0, y + h * 0.3, -l * 0.5);
  tail.rotation.x = -0.35;
  tail.add(mesh(tailGeometry(sp, speciesKey)));
  root.add(tail);
  const legs = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * w * 0.3, sp.leg, sz * l * 0.36);
    pivot.add(mesh(legGeometry(sp)));
    root.add(pivot);
    legs.push(pivot);
  }
  const neckBase = head.rotation.x;
  return { group, root, head, tail, legs, seatY: sp.seatY, species: sp, neckBase, length: l };
}

function wheelGeometry(r, spokes, rim = '#6a4426', hub = '#4a2f1a') {
  const key = `wheel:${r}:${spokes}:${rim}`;
  if (geoCache.has(key)) return geoCache.get(key);
  const parts = [{ geometry: new THREE.TorusGeometry(r, 0.06, 6, 18), color: rim, t: { ry: Math.PI / 2 } }];
  parts.push({ geometry: new THREE.CylinderGeometry(0.12, 0.12, 0.2, 10), color: hub, t: { rz: Math.PI / 2 } });
  for (let i = 0; i < spokes; i += 1) {
    parts.push({ geometry: new THREE.BoxGeometry(0.04, r * 2, 0.05), color: rim, t: { rx: (i / spokes) * Math.PI } });
  }
  const g = mergeColored(parts);
  geoCache.set(key, g);
  return g;
}

/** Donkey cart: the donkey in front (+z), a two-wheeled bed behind with a bench. */
export function buildCart() {
  const group = new THREE.Group();
  const donkey = buildQuadruped('donkey');
  donkey.group.position.z = 1.15;
  group.add(donkey.group);
  const car = new THREE.Group();
  group.add(car);
  const key = 'cart-bed';
  let g = geoCache.get(key);
  if (!g) {
    const wood = '#9c6b40';
    const dark = '#6a4426';
    const parts = [
      { geometry: box(1.5, 0.12, 1.9, 0.03), color: wood, t: { y: 0.82, z: -1.0 } },
      { geometry: box(0.08, 0.42, 1.9, 0.02), color: dark, t: { x: -0.74, y: 1.06, z: -1.0 } },
      { geometry: box(0.08, 0.42, 1.9, 0.02), color: dark, t: { x: 0.74, y: 1.06, z: -1.0 } },
      { geometry: box(1.5, 0.42, 0.08, 0.02), color: dark, t: { y: 1.06, z: -1.94 } },
      // bench at the front of the bed
      { geometry: box(1.3, 0.1, 0.42, 0.03), color: '#b07a45', t: { y: 1.28, z: -0.3 } },
      { geometry: box(0.1, 0.4, 0.36, 0.02), color: dark, t: { x: -0.55, y: 1.05, z: -0.3 } },
      { geometry: box(0.1, 0.4, 0.36, 0.02), color: dark, t: { x: 0.55, y: 1.05, z: -0.3 } },
      // shafts to the donkey
      { geometry: box(0.07, 0.07, 2.2, 0.02), color: dark, t: { x: -0.42, y: 0.95, z: 0.65, rx: -0.06 } },
      { geometry: box(0.07, 0.07, 2.2, 0.02), color: dark, t: { x: 0.42, y: 0.95, z: 0.65, rx: -0.06 } },
      // axle + some cargo
      { geometry: new THREE.CylinderGeometry(0.05, 0.05, 1.8, 6), color: dark, t: { y: 0.55, z: -1.0, rz: Math.PI / 2 } },
      { geometry: new THREE.SphereGeometry(0.28, 8, 6), color: '#cdb58a', t: { x: -0.4, y: 1.12, z: -1.45, sy: 1.1 } },
      { geometry: new THREE.SphereGeometry(0.26, 8, 6), color: '#bfa77a', t: { x: 0.35, y: 1.1, z: -1.6, sy: 1.1 } },
      { geometry: box(0.55, 0.45, 0.55, 0.03), color: wood, t: { x: 0.2, y: 1.1, z: -1.05, ry: 0.3 } },
    ];
    g = mergeColored(parts);
    geoCache.set(key, g);
  }
  car.add(mesh(g));
  const wheels = [-0.88, 0.88].map((x) => {
    const w = mesh(wheelGeometry(0.55, 6));
    w.position.set(x, 0.55, -1.0);
    car.add(w);
    return w;
  });
  return { group, car, wheels, animals: [donkey], wheelR: 0.55, seat: { x: 0, y: 1.33, z: -0.3 } };
}

/** Roman racing chariot pulled by two horses. */
export function buildChariot() {
  const group = new THREE.Group();
  const horses = [-0.62, 0.62].map((x, i) => {
    const h = buildQuadruped('horse', 'legionHorse');
    h.group.position.set(x, 0, 1.55);
    group.add(h.group);
    return h;
  });
  const car = new THREE.Group();
  group.add(car);
  let g = geoCache.get('chariot-car');
  if (!g) {
    const red = '#a8322a';
    const gold = '#d9a441';
    const parts = [
      { geometry: box(1.3, 0.1, 1.0, 0.03), color: '#6a4426', t: { y: 0.62, z: -0.75 } },
      // curved front guard (three panels)
      { geometry: box(1.2, 0.85, 0.08, 0.03), color: red, t: { y: 1.05, z: -0.24 } },
      { geometry: box(0.08, 0.7, 0.8, 0.03), color: red, t: { x: -0.62, y: 0.98, z: -0.62, ry: 0.1 } },
      { geometry: box(0.08, 0.7, 0.8, 0.03), color: red, t: { x: 0.62, y: 0.98, z: -0.62, ry: -0.1 } },
      { geometry: box(1.28, 0.08, 0.12, 0.02), color: gold, t: { y: 1.5, z: -0.24 } },
      { geometry: box(0.1, 0.08, 0.84, 0.02), color: gold, t: { x: -0.63, y: 1.35, z: -0.62 } },
      { geometry: box(0.1, 0.08, 0.84, 0.02), color: gold, t: { x: 0.63, y: 1.35, z: -0.62 } },
      { geometry: new THREE.CircleGeometry(0.22, 12), color: gold, t: { y: 1.05, z: -0.19 } },
      // pole + yoke
      { geometry: box(0.08, 0.08, 2.6, 0.02), color: '#4a2f1a', t: { y: 0.85, z: 0.85, rx: -0.12 } },
      { geometry: box(1.6, 0.08, 0.1, 0.02), color: '#4a2f1a', t: { y: 1.55, z: 1.95 } },
      { geometry: new THREE.CylinderGeometry(0.05, 0.05, 1.9, 6), color: '#3a2418', t: { y: 0.55, z: -0.75, rz: Math.PI / 2 } },
    ];
    g = mergeColored(parts);
    geoCache.set('chariot-car', g);
  }
  car.add(mesh(g));
  const wheels = [-0.85, 0.85].map((x) => {
    const w = mesh(wheelGeometry(0.55, 8, '#7a4a26', '#d9a441'));
    w.position.set(x, 0.55, -0.75);
    car.add(w);
    return w;
  });
  return { group, car, wheels, animals: horses, wheelR: 0.55, seat: { x: 0, y: 0.68, z: -0.72 }, standing: true };
}
