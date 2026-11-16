import * as THREE from 'three';
import { Builder } from './Nazareth.js';
import { PALETTE } from './materials.js';
import { CHECKPOINT, terrainHeight } from './layout.js';

/**
 * The Roman checkpoint on the north road: a palisade compound (restricted),
 * a lookout tower, tents, a campfire, the legion standard and a road barrier
 * with a guard booth. Static geometry goes into the shared batcher; the
 * banner, sign and campfire flame are separate meshes so they can animate.
 */
export function buildCheckpoint(batcher, rng) {
  const B = new Builder(batcher, rng);
  const c = CHECKPOINT.compound;
  const g = CHECKPOINT.pad.y;
  const extras = new THREE.Group();
  extras.name = 'roman-checkpoint';
  B.at(0, 0, 0, 0);

  // ---- palisade: sharpened stakes with a binding rail, gate on the west wall
  const stake = (x, z) => {
    const h = 2.7 + rng.range(-0.15, 0.2);
    B.cyl('wood', rng.pick([PALETTE.woodMid, PALETTE.woodDark, '#8a5c34']), 0.15, 0.17, h, x, g + h / 2 - 0.1, z, {}, 6);
    B.put(new THREE.ConeGeometry(0.15, 0.4, 6), 'wood', '#6a4426', x, g + h + 0.08, z);
  };
  const wall = (x0, z0, x1, z1, skip) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.round(len / 0.33);
    for (let i = 0; i <= n; i += 1) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;
      if (skip && skip(x, z)) continue;
      stake(x, z);
    }
  };
  const gateHalf = 2.1;
  const inGate = (x, z) => Math.abs(z - CHECKPOINT.gateZ) < gateHalf;
  wall(c.x0, c.z0, c.x1, c.z0);
  wall(c.x1, c.z0, c.x1, c.z1);
  wall(c.x1, c.z1, c.x0, c.z1);
  wall(c.x0, c.z1, c.x0, c.z0, inGate);
  // binding rails
  const rail = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ry = Math.atan2(x1 - x0, z1 - z0);
    B.box('wood', PALETTE.woodDark, 0.12, 0.14, len, (x0 + x1) / 2, g + 1.9, (z0 + z1) / 2, { ry }, 1);
  };
  rail(c.x0, c.z0, c.x1, c.z0);
  rail(c.x1, c.z0, c.x1, c.z1);
  rail(c.x1, c.z1, c.x0, c.z1);
  rail(c.x0, c.z1, c.x0, CHECKPOINT.gateZ + gateHalf);
  rail(c.x0, CHECKPOINT.gateZ - gateHalf, c.x0, c.z0);
  // wall colliders (thick enough that a sprint can't tunnel)
  const colWall = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ry = Math.atan2(x1 - x0, z1 - z0);
    B.colBox(0.3, 1.7, len / 2, (x0 + x1) / 2, g + 1.5, (z0 + z1) / 2, { ry });
  };
  colWall(c.x0, c.z0, c.x1, c.z0);
  colWall(c.x1, c.z0, c.x1, c.z1);
  colWall(c.x1, c.z1, c.x0, c.z1);
  colWall(c.x0, c.z1, c.x0, CHECKPOINT.gateZ + gateHalf);
  colWall(c.x0, CHECKPOINT.gateZ - gateHalf, c.x0, c.z0);

  // ---- gate: two heavy posts and a lintel with the SPQR board
  for (const s of [-1, 1]) {
    const z = CHECKPOINT.gateZ + s * (gateHalf + 0.15);
    B.box('wood', PALETTE.woodDark, 0.5, 4.2, 0.5, c.x0, g + 2.05, z, {}, 1);
    B.colBox(0.25, 2.1, 0.25, c.x0, g + 2.05, z);
    B.put(new THREE.ConeGeometry(0.38, 0.5, 4), 'wood', '#5a3a1e', c.x0, g + 4.4, z, { ry: Math.PI / 4 });
  }
  B.box('wood', PALETTE.woodMid, 0.4, 0.4, gateHalf * 2 + 1.4, c.x0, g + 3.75, CHECKPOINT.gateZ, {}, 1);
  extras.add(signBoard('SPQR', 'CASTRA · KEEP OUT', c.x0 - 0.28, g + 3.75, CHECKPOINT.gateZ, -Math.PI / 2, 2.4, 0.9));

  // ---- lookout tower (north-east corner, inside)
  const tx = c.x1 - 3.2;
  const tz = c.z0 + 3.2;
  const deck = g + 5.4;
  for (const [ox, oz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) {
    B.cyl('wood', PALETTE.woodDark, 0.16, 0.2, 7.6, tx + ox, g + 3.7, tz + oz, {}, 6);
    B.colCyl(0.2, 3.8, tx + ox, g + 3.8, tz + oz);
  }
  for (const y of [1.6, 3.6]) {
    B.box('wood', PALETTE.woodMid, 2.7, 0.12, 0.12, tx, g + y, tz - 1.3, { rz: 0.6 }, 1);
    B.box('wood', PALETTE.woodMid, 2.7, 0.12, 0.12, tx, g + y, tz + 1.3, { rz: -0.6 }, 1);
  }
  B.box('wood', PALETTE.woodLight, 3.2, 0.2, 3.2, tx, deck, tz, {}, 1);
  B.colBox(1.6, 0.1, 1.6, tx, deck, tz);
  for (const s of [-1, 1]) {
    B.box('wood', PALETTE.woodMid, 3.2, 0.1, 0.1, tx, deck + 1.0, tz + s * 1.55, {}, 1);
    B.box('wood', PALETTE.woodMid, 0.1, 0.1, 3.2, tx + s * 1.55, deck + 1.0, tz, {}, 1);
  }
  B.put(new THREE.ConeGeometry(2.6, 1.5, 4), 'wood', '#8f3a2a', tx, g + 8.1, tz, { ry: Math.PI / 4 });
  // ladder (visual only)
  for (const s of [-0.3, 0.3]) B.box('wood', PALETTE.woodDark, 0.08, 5.6, 0.08, tx - 1.7, g + 2.8, tz + s, {}, 1);
  for (let y = 0.4; y < 5.4; y += 0.45) B.box('wood', PALETTE.woodMid, 0.06, 0.06, 0.6, tx - 1.7, g + y, tz, {}, 1);

  // ---- tents (contubernia) along the north wall
  const tent = (x, z, w, d, h, color, ry = 0) => {
    B.at(x, g, z, ry);
    const slope = Math.atan2(h, w / 2);
    const side = Math.hypot(w / 2, h);
    for (const s of [-1, 1]) B.box('cloth', color, side, 0.05, d, (s * w) / 4, h / 2, 0, { rz: -s * slope }, 1.5);
    const end = new THREE.BufferGeometry();
    const tri = new Float32Array([-w / 2, 0, 0, w / 2, 0, 0, 0, h, 0]);
    end.setAttribute('position', new THREE.BufferAttribute(tri, 3));
    end.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0.5, 1]), 2));
    end.computeVertexNormals();
    B.put(end.clone(), 'cloth', color, 0, 0, -d / 2);
    B.put(end, 'cloth', color, 0, 0, d / 2, { ry: Math.PI });
    B.cyl('wood', PALETTE.woodDark, 0.05, 0.05, h + 0.25, 0, (h + 0.25) / 2, d / 2 + 0.05, {}, 5);
    B.colBox(w / 2 - 0.15, h / 2, d / 2, 0, h / 2, 0);
    B.at(0, 0, 0, 0);
  };
  tent(10.5, -115.2, 2.8, 3.4, 2.1, '#a8825a', Math.PI / 2);
  tent(14.5, -115.2, 2.8, 3.4, 2.1, '#9c7650', Math.PI / 2);
  tent(18.5, -115.2, 2.8, 3.4, 2.1, '#a8825a', Math.PI / 2);
  // command tent (red, by the east wall)
  tent(24.2, -102.4, 4.2, 4.6, 2.9, '#a33a2c', 0);
  B.at(24.2, g, -102.4, 0);
  B.box('cloth', '#e8d9b0', 4.3, 0.3, 0.06, 0, 2.55, 2.32, {}, 1);
  B.at(0, 0, 0, 0);

  // ---- campfire, logs to sit on
  const fx = 14.2;
  const fz = -106.5;
  for (let i = 0; i < 9; i += 1) {
    const a = (i / 9) * Math.PI * 2;
    B.rbox('stone', rng.pick(['#9b9184', '#a69c8e', '#8c8276']), 0.32, 0.22, 0.26, fx + Math.cos(a) * 0.7, g + 0.1, fz + Math.sin(a) * 0.7, { ry: -a }, 0.06);
  }
  for (let i = 0; i < 4; i += 1) B.cyl('wood', '#4a2f1a', 0.07, 0.07, 1, fx, g + 0.15, fz, { rz: Math.PI / 2 - 0.25, ry: (i * Math.PI) / 4 }, 5);
  B.cyl('wood', PALETTE.woodMid, 0.22, 0.22, 2, fx, g + 0.22, fz + 2.2, { rz: Math.PI / 2 }, 7);
  B.cyl('wood', PALETTE.woodMid, 0.22, 0.22, 2, fx + 2.2, g + 0.22, fz, { rx: Math.PI / 2 }, 7);
  const flame = new THREE.Group();
  const flameMat = new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.9, fog: true });
  const coreMat = new THREE.MeshBasicMaterial({ color: '#fff0a0', transparent: true, opacity: 0.95 });
  const f1 = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.9, 7), flameMat);
  f1.position.y = 0.45;
  const f2 = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.55, 6), coreMat);
  f2.position.y = 0.3;
  flame.add(f1, f2);
  flame.position.set(fx, g + 0.12, fz);
  flame.name = 'campfire-flame';
  extras.add(flame);

  // ---- legion standard by the gate
  const sx = c.x0 + 3.2;
  const sz = CHECKPOINT.gateZ - 3.6;
  B.cyl('wood', PALETTE.woodDark, 0.07, 0.08, 4.6, sx, g + 2.3, sz, {}, 6);
  B.cyl('wood', PALETTE.woodDark, 0.05, 0.05, 1.7, sx, g + 4.15, sz, { rx: Math.PI / 2, ry: Math.PI / 2 }, 5);
  B.put(new THREE.SphereGeometry(0.16, 8, 6), 'plain', '#d9a441', sx, g + 4.7, sz);
  B.colCyl(0.12, 2.3, sx, g + 2.3, sz);
  const banner = bannerMesh();
  banner.position.set(sx, g + 3.45, sz);
  banner.rotation.y = Math.PI / 2;
  extras.add(banner);

  // ---- weapon rack, shields, crates, training dummy
  const rx = 19.5;
  const rz = -111.5;
  B.box('wood', PALETTE.woodDark, 2.4, 0.1, 0.1, rx, g + 1.3, rz, {}, 1);
  B.box('wood', PALETTE.woodDark, 2.4, 0.1, 0.1, rx, g + 0.3, rz, {}, 1);
  for (const s of [-1.1, 1.1]) B.box('wood', PALETTE.woodDark, 0.1, 1.5, 0.1, rx + s, g + 0.75, rz, {}, 1);
  for (let i = 0; i < 5; i += 1) {
    B.cyl('wood', '#8a6a40', 0.025, 0.025, 2.1, rx - 0.8 + i * 0.4, g + 1.05, rz - 0.05, { rx: 0.08 }, 4);
    B.put(new THREE.ConeGeometry(0.04, 0.3, 4), 'plain', '#a9adb0', rx - 0.8 + i * 0.4, g + 2.2, rz + 0.04);
  }
  B.colBox(1.2, 0.75, 0.15, rx, g + 0.75, rz);
  for (let i = 0; i < 3; i += 1) {
    B.rbox('plain', '#a8322a', 0.7, 1.0, 0.07, rx - 0.7 + i * 0.7, g + 0.5, rz + 0.55, { rx: -0.25 }, 0.03);
    B.put(new THREE.SphereGeometry(0.09, 8, 6), 'plain', '#d9a441', rx - 0.7 + i * 0.7, g + 0.52, rz + 0.62);
  }
  for (const [x, z, s] of [[8.2, -117.4, 0.8], [9.1, -117.6, 0.7], [8.4, -116.6, 0.6], [26.4, -98.6, 0.8], [26.4, -99.6, 0.7]]) {
    B.box('wood', PALETTE.woodMid, s, s, s, x, g + s / 2, z, { ry: rng.range(-0.3, 0.3) }, 1);
    B.colBox(s / 2, s / 2, s / 2, x, g + s / 2, z);
  }
  // straw training dummy
  const dx = 21;
  const dz = -107.5;
  B.cyl('wood', PALETTE.woodDark, 0.07, 0.07, 1.9, dx, g + 0.95, dz, {}, 5);
  B.cyl('wood', PALETTE.woodDark, 0.05, 0.05, 1.2, dx, g + 1.45, dz, { rz: Math.PI / 2 }, 5);
  B.put(new THREE.SphereGeometry(0.3, 8, 6), 'cloth', '#d9c27a', dx, g + 1.15, dz, { sy: 1.4 });
  B.put(new THREE.SphereGeometry(0.2, 8, 6), 'cloth', '#d9c27a', dx, g + 1.95, dz);
  B.colCyl(0.25, 0.95, dx, g + 0.95, dz);

  // ---- road barrier and guard booth
  const roadZ = -100;
  const lx = -5.4;
  const bx = 1.9;
  for (const x of [lx, bx]) {
    const gy = terrainHeight(x, roadZ);
    B.box('wood', PALETTE.woodDark, 0.32, 1.3, 0.32, x, gy + 0.65, roadZ, {}, 1);
    B.colBox(0.16, 0.65, 0.16, x, gy + 0.65, roadZ);
  }
  // raised boom with red/white bands (open: travellers may pass)
  const by = terrainHeight(lx, roadZ) + 1.25;
  const boomAng = 1.05;
  for (let i = 0; i < 8; i += 1) {
    const t = (i + 0.5) / 8;
    const len = 6.4;
    B.box('plain', i % 2 ? '#f1e8d6' : '#b8322e', len / 8, 0.13, 0.13, lx + Math.cos(boomAng) * len * t, by + Math.sin(boomAng) * len * t, roadZ, { rz: boomAng }, 1);
  }
  // booth
  const hx = -8.4;
  const hz = -99;
  const hy = terrainHeight(hx, hz);
  B.box('wood', PALETTE.woodMid, 2, 2.4, 2, hx, hy + 1.2, hz, {}, 1);
  B.box('plain', PALETTE.dark, 1.1, 0.8, 0.06, hx, hy + 1.5, hz + 1.01, {}, 1);
  B.box('wood', '#8f3a2a', 2.5, 0.16, 2.5, hx, hy + 2.5, hz, {}, 1);
  B.colBox(1, 1.25, 1, hx, hy + 1.2, hz);
  extras.add(signBoard('HALT!', 'ROMAN CHECKPOINT', -8.6, terrainHeight(-8.6, -91) + 1.6, -91, 0.3, 1.6, 0.8, true));
  B.box('wood', PALETTE.woodDark, 0.12, 1.6, 0.12, -8.6, terrainHeight(-8.6, -91) + 0.8, -91.06, {}, 1);

  B.footprints.push({ x: CHECKPOINT.x, z: CHECKPOINT.z, w: c.x1 - c.x0, d: c.z1 - c.z0, ry: 0, kind: 'roman' });
  B.footprints.push({ x: tx, z: tz, w: 3.2, d: 3.2, ry: 0, kind: 'roman-tower' });

  const posts = {
    roadGuard: { x: -4.6, y: terrainHeight(-4.6, -98.4), z: -98.4, yaw: 0.15 },
    gateGuard: { x: c.x0 - 1.4, y: g, z: CHECKPOINT.gateZ + gateHalf + 0.9, yaw: -Math.PI / 2 + 0.3 },
    tower: { x: tx, y: deck + 0.1, z: tz, yaw: -Math.PI / 2 - 0.6, elevated: true },
    centurion: { x: 21.4, y: g, z: -102.6, yaw: -Math.PI / 2 },
    campfire: { x: fx, y: g, z: fz },
    gateInside: { x: c.x0 + 2, y: g, z: CHECKPOINT.gateZ },
    gateOutside: { x: c.x0 - 2.2, y: g, z: CHECKPOINT.gateZ },
  };
  return { colliders: B.colliders, footprints: B.footprints, extras, flame, banner, posts };
}

function signBoard(title, sub, x, y, z, ry, w, h, both = false) {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 112;
  const g = cv.getContext('2d');
  g.fillStyle = '#8f2a22';
  g.fillRect(0, 0, 256, 112);
  g.strokeStyle = '#d9a441';
  g.lineWidth = 7;
  g.strokeRect(5, 5, 246, 102);
  g.fillStyle = '#f3d27a';
  g.textAlign = 'center';
  g.font = 'bold 46px Palatino Linotype, Georgia, serif';
  g.fillText(title, 128, 58);
  g.font = 'bold 19px Palatino Linotype, Georgia, serif';
  g.fillText(sub, 128, 90);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
  const edge = new THREE.MeshStandardMaterial({ color: '#5a3a1e' });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), [edge, edge, edge, edge, face, both ? face : edge]);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.castShadow = true;
  return m;
}

function bannerMesh() {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 192;
  const g = cv.getContext('2d');
  g.fillStyle = '#a3241c';
  g.fillRect(0, 0, 128, 192);
  g.fillStyle = '#e0b04a';
  g.fillRect(0, 0, 128, 10);
  g.fillRect(0, 176, 128, 16);
  for (let i = 0; i < 6; i += 1) g.fillRect(6 + i * 21, 176, 10, 16);
  g.textAlign = 'center';
  g.font = 'bold 40px Palatino Linotype, Georgia, serif';
  g.fillText('SPQR', 64, 80);
  g.font = 'bold 20px Palatino Linotype, Georgia, serif';
  g.fillText('LEG · X', 64, 120);
  g.beginPath();
  g.arc(64, 150, 12, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(1.3, 1.9, 6, 1);
  const mat = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.9 });
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.name = 'legion-banner';
  m.userData.base = Float32Array.from(geo.attributes.position.array);
  return m;
}
