import * as THREE from 'three';
import { Builder, buildHouse } from './Nazareth.js';
import { PALETTE } from './materials.js';
import { palmTreeGeometry, oliveTreeGeometry } from './vegetation.js';
import {
  FARM, GOAT_HILL, HAMLET, ISLE, OUTPOST, CIRCUIT, OASIS, CAMP, terrainHeight, padHeight, POND_LEVEL,
} from './layout.js';

/**
 * Phase 5 sites beyond Nazareth. Each site is built into its own StaticBatcher
 * (one mesh per material, so far-away sites are frustum/distance culled as a
 * unit). Builders return colliders, map footprints, vehicle spawn spots,
 * Roman posts and a few animated extras.
 */

const SAND = '#e2c792';
const ROOF_RED = '#b4553a';

// ---------------------------------------------------------------- small helpers
function basket(B, x, y, z, fill) {
  B.cyl('wood', '#b38b52', 0.34, 0.26, 0.32, x, y + 0.16, z, {}, 10);
  if (fill) B.put(new THREE.SphereGeometry(0.3, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), 'plain', fill, x, y + 0.26, z, { sy: 0.4 });
}

function crate(B, x, y, z, s = 0.8, ry = 0) {
  B.box('wood', PALETTE.woodMid, s, s, s, x, y + s / 2, z, { ry }, 1);
  B.box('wood', PALETTE.woodDark, s + 0.04, 0.08, s + 0.04, x, y + s - 0.04, z, { ry }, 1);
}

function sack(B, x, y, z, color = '#cdb58a') {
  B.put(new THREE.SphereGeometry(0.32, 8, 6), 'cloth', color, x, y + 0.3, z, { sy: 1.15 });
}

function amphora(B, x, y, z, s = 1) {
  const pts = [[0, 0], [0.08, 0], [0.2, 0.15], [0.3, 0.5], [0.26, 0.8], [0.12, 0.95], [0.1, 1.15], [0.15, 1.2], [0.12, 1.2]]
    .map(([px, py]) => new THREE.Vector2(px * s, py * s));
  B.put(new THREE.LatheGeometry(pts, 9), 'clay', B.rng.pick(PALETTE.clay), x, y, z);
}

/** A run of fence posts + two rails between points (world coords). */
function fence(B, pts, y0, { h = 1.1, step = 2, color = PALETTE.woodMid, collide = true } = {}) {
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / step));
    const ry = Math.atan2(bx - ax, bz - az);
    for (let k = 0; k <= n; k += 1) {
      const x = ax + ((bx - ax) * k) / n;
      const z = az + ((bz - az) * k) / n;
      const g = y0 ?? terrainHeight(x, z);
      B.cyl('wood', PALETTE.woodDark, 0.07, 0.08, h, x, g + h / 2, z, {}, 5);
    }
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    const g = y0 ?? terrainHeight(mx, mz);
    for (const ry2 of [0.45, 0.85]) B.box('wood', color, 0.07, 0.1, len, mx, g + h * ry2, mz, { ry }, 1);
    if (collide) B.colBox(0.12, h / 2 + 0.15, len / 2, mx, g + h / 2, mz, { ry });
  }
}

/** Low dry-stone wall segment. */
function stoneWall(B, ax, az, bx, bz, y0, h = 0.9, color = '#c9b48e') {
  const len = Math.hypot(bx - ax, bz - az);
  const ry = Math.atan2(bx - ax, bz - az);
  const mx = (ax + bx) / 2;
  const mz = (az + bz) / 2;
  const g = y0 ?? terrainHeight(mx, mz);
  B.box('stone', color, 0.7, h + 0.4, len, mx, g + (h - 0.4) / 2, mz, { ry });
  B.box('stone', '#b8a17a', 0.78, 0.12, len, mx, g + h, mz, { ry });
  B.colBox(0.38, h / 2 + 0.2, len / 2, mx, g + h / 2, mz, { ry });
}

/** Pitched-roof timber shed open on its front (+local z) side. */
function shed(B, x, z, ry, w, d, h, g) {
  B.at(x, 0, z, ry);
  for (const lx of [-w / 2 + 0.2, 0, w / 2 - 0.2]) {
    for (const lz of [-d / 2 + 0.2, d / 2 - 0.2]) B.box('wood', PALETTE.woodDark, 0.22, h, 0.22, lx, g + h / 2, lz, {}, 1);
  }
  // back + side walls (planks)
  B.box('wood', PALETTE.woodMid, w, h * 0.8, 0.12, 0, g + h * 0.4, -d / 2 + 0.1, {}, 1);
  B.box('wood', PALETTE.woodMid, 0.12, h * 0.8, d, -w / 2 + 0.1, g + h * 0.4, 0, {}, 1);
  B.box('wood', PALETTE.woodMid, 0.12, h * 0.8, d, w / 2 - 0.1, g + h * 0.4, 0, {}, 1);
  B.colBox(w / 2, h / 2, 0.12, 0, g + h / 2, -d / 2 + 0.1);
  B.colBox(0.12, h / 2, d / 2, -w / 2 + 0.1, g + h / 2, 0);
  B.colBox(0.12, h / 2, d / 2, w / 2 - 0.1, g + h / 2, 0);
  // roof: two slabs
  const pitch = 0.42;
  const slab = d / 2 / Math.cos(pitch) + 0.35;
  B.box('wood', '#8a5c34', w + 0.6, 0.12, slab, 0, g + h + Math.sin(pitch) * slab * 0.5, -d / 4 - 0.05, { rx: pitch }, 1);
  B.box('wood', '#8a5c34', w + 0.6, 0.12, slab, 0, g + h + Math.sin(pitch) * slab * 0.5, d / 4 + 0.05, { rx: -pitch }, 1);
  B.at(0, 0, 0, 0);
}

function haystack(B, x, z, s = 1) {
  const g = terrainHeight(x, z);
  B.put(new THREE.SphereGeometry(1.1 * s, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 'plain', '#e0bf6a', x, g - 0.05, z, { sy: 1.15 });
  B.put(new THREE.ConeGeometry(0.5 * s, 0.6 * s, 8), 'plain', '#d1ad55', x, g + 1.35 * s, z);
  B.colCyl(0.95 * s, 0.6 * s, x, g + 0.6 * s, z);
}

function campfire(B, extras, x, z, g) {
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    B.put(new THREE.IcosahedronGeometry(0.2, 0), 'stone', '#8f8270', x + Math.cos(a) * 0.65, g + 0.08, z + Math.sin(a) * 0.65);
  }
  B.cyl('wood', PALETTE.woodDark, 0.07, 0.07, 1.1, x, g + 0.14, z, { rz: Math.PI / 2, ry: 0.6 }, 5);
  B.cyl('wood', PALETTE.woodDark, 0.07, 0.07, 1.1, x, g + 0.18, z, { rz: Math.PI / 2, ry: -0.7 }, 5);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.9, 7), new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.85 }));
  flame.position.set(x, g + 0.55, z);
  flame.userData.flame = true;
  extras.add(flame);
  return flame;
}

function signBoard(lines, x, y, z, ry, { bg = '#b07a45', ink = '#3a2210', w = 1.6, h = 0.8 } = {}) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 128);
  g.strokeStyle = 'rgba(40,20,10,0.75)';
  g.lineWidth = 8;
  g.strokeRect(4, 4, 248, 120);
  g.fillStyle = ink;
  g.textAlign = 'center';
  g.font = 'bold 32px Palatino Linotype, Georgia, serif';
  g.fillText(lines[0], 128, lines[1] ? 54 : 76);
  if (lines[1]) {
    g.font = 'bold 22px Palatino Linotype, Georgia, serif';
    g.fillText(lines[1], 128, 94);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const edge = new THREE.MeshStandardMaterial({ color: '#5a3a1e' });
  const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), [edge, edge, edge, edge, face, face]);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.castShadow = true;
  return m;
}

/** Flag on a pole that ripples (World.update animates `userData.base`). */
function flagMesh(color, emblem) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.fillRect(0, 0, 128, 96);
  g.fillStyle = '#f2c14e';
  g.textAlign = 'center';
  g.font = 'bold 34px Palatino Linotype, Georgia, serif';
  g.fillText(emblem, 64, 60);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(1.6, 1.1, 8, 1);
  geo.translate(0.8, 0, 0);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.9 }));
  m.castShadow = true;
  m.userData.base = Float32Array.from(geo.attributes.position.array);
  m.userData.flag = true;
  return m;
}

function wheatTuftGeometry() {
  const parts = [];
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(new THREE.CylinderGeometry(0.015, 0.02, 0.95, 3).translate(Math.cos(a) * 0.09, 0.47, Math.sin(a) * 0.09));
    parts.push(new THREE.ConeGeometry(0.05, 0.22, 4).translate(Math.cos(a) * 0.09, 1.0, Math.sin(a) * 0.09));
  }
  return parts;
}

// ---------------------------------------------------------------- countryside
export function buildFarm(batcher, rng, extras) {
  const B = new Builder(batcher, rng);
  const g = padHeight(FARM.pad);
  const cx = FARM.x;
  const cz = FARM.z;
  // farmhouse (north-west of the yard) and a second small store house
  buildHouse(B, { x: cx - 9, z: cz + 9, ry: Math.PI, w: 8, d: 6.5, h: 3.6, tint: '#e9d9b5', doorX: 1.2 });
  buildHouse(B, { x: cx - 13.5, z: cz - 2, ry: Math.PI / 2, w: 4.6, d: 4.2, h: 2.8, tint: '#dcc79e' });
  // stable shed (east), open to the south
  shed(B, cx + 9, cz + 10, Math.PI, 9, 5, 2.6, g);
  // trough + hay inside the shed
  B.box('wood', PALETTE.woodDark, 3, 0.5, 0.6, cx + 9, g + 0.25, cz + 12, {}, 1);
  B.box('plain', '#e3c46e', 2.8, 0.1, 0.5, cx + 9, g + 0.48, cz + 12, {}, 1);
  // yard walls with a south gate and an east opening
  const x0 = cx - 18;
  const x1 = cx + 18;
  const z0 = cz - 15;
  const z1 = cz + 15;
  stoneWall(B, x0, z0, cx - 3.5, z0, g);
  stoneWall(B, cx + 3.5, z0, x1, z0, g);
  stoneWall(B, x1, z0, x1, cz - 2, g);
  stoneWall(B, x1, cz + 4, x1, z1, g);
  stoneWall(B, x1, z1, x0, z1, g);
  stoneWall(B, x0, z1, x0, z0, g);
  // gate posts + sign
  for (const s of [-1, 1]) B.box('stone', '#bfa983', 0.8, 1.8, 0.8, cx + s * 3.9, g + 0.9, z0, {});
  extras.add(signBoard(['BAR-TOLMAI FARM', 'animals to borrow'], cx, g + 1.9, z0 - 0.45, 0));
  // threshing floor (round stone pad) and the stone roller
  const tx = cx + 6;
  const tz = cz - 6;
  B.cyl('stone', '#d9c8a5', 4.2, 4.3, 0.18, tx, g + 0.06, tz, {}, 24);
  B.cyl('stone', '#bfae8b', 0.45, 0.45, 1.3, tx + 1.6, g + 0.62, tz, { rz: Math.PI / 2 }, 12);
  for (let i = 0; i < 5; i += 1) haystack(B, cx + 12 + (i % 3) * 2.4, cz - 11 + Math.floor(i / 3) * 2.6, rng.range(0.75, 1));
  // well
  B.cyl('stone', '#cdb995', 0.9, 1, 0.9, cx - 3, g + 0.45, cz + 1, {}, 14);
  B.box('wood', PALETTE.woodDark, 0.12, 1.6, 0.12, cx - 3.8, g + 1.2, cz + 1, {}, 1);
  B.box('wood', PALETTE.woodDark, 0.12, 1.6, 0.12, cx - 2.2, g + 1.2, cz + 1, {}, 1);
  B.box('wood', PALETTE.woodDark, 1.9, 0.12, 0.12, cx - 3, g + 2, cz + 1, {}, 1);
  B.colCyl(1, 0.5, cx - 3, g + 0.5, cz + 1);
  // goat pen (south-west corner)
  fence(B, [[x0 + 1.5, z0 + 1.5], [x0 + 10, z0 + 1.5], [x0 + 10, z0 + 8], [x0 + 1.5, z0 + 8]], g, { h: 1.05 });
  // produce
  for (let i = 0; i < 4; i += 1) amphora(B, cx - 4.8 + i * 0.7, g, cz + 5.2, 0.9);
  crate(B, cx + 2, g, cz + 6, 0.8, 0.3);
  sack(B, cx + 3.1, g, cz + 6.2);
  sack(B, cx + 2.6, g, cz + 7.1, '#bfa77a');
  basket(B, cx - 1, g, cz + 6.3, '#7a3b6e');
  // olive trees in the yard
  for (const [ox, oz] of [[cx - 14, cz - 9], [cx + 15, cz + 12]]) {
    B.put(oliveTreeGeometry(rng, 1.1), 'foliage', null, ox, g - 0.05, oz, { ry: rng() * 6 });
    B.colCyl(0.35, 1, ox, g + 1, oz);
  }
  // vineyard rows north of the yard (on the slope)
  for (let r = 0; r < 6; r += 1) {
    const z = cz + 22 + r * 3;
    for (let x = cx - 14; x <= cx + 14; x += 2.2) {
      const gy = terrainHeight(x, z);
      B.cyl('wood', PALETTE.woodDark, 0.05, 0.05, 1.5, x, gy + 0.75, z, {}, 4);
      B.put(new THREE.IcosahedronGeometry(0.55, 0), 'foliage', rng.pick(['#5f7f35', '#6a8a3a', '#55752f']), x + 1.1, gy + 0.95, z, { sx: 1.6, sy: 0.75 });
      if (rng() < 0.5) B.put(new THREE.IcosahedronGeometry(0.16, 0), 'plain', '#5b2a5a', x + 0.8, gy + 0.6, z + 0.25);
    }
    B.box('wood', PALETTE.woodMid, 0.04, 0.04, 28.6, cx, terrainHeight(cx, z) + 1.35, z, { ry: Math.PI / 2 }, 1);
  }
  const spots = {
    donkey: { x: cx + 6.5, z: cz + 7.5, yaw: Math.PI },
    cart: { x: cx + 11.5, z: cz + 6.4, yaw: Math.PI * 0.92 },
    horse: { x: cx - 2.5, z: cz - 9, yaw: 0.4 },
    pen: { x: x0 + 5.7, z: z0 + 4.7, r: 3.2 },
  };
  B.footprints.push({ x: cx, z: cz, w: 36, d: 30, ry: 0, kind: 'farmyard' });
  return { B, spots };
}

/** Wheat fields: instanced golden tufts (returned as placements). */
export function wheatFields(rng) {
  const fields = [
    { x0: -178, x1: -132, z0: -24, z1: -5 },
    { x0: -126, x1: -104, z0: 12, z1: 34 },
  ];
  const out = [];
  for (const f of fields) {
    for (let x = f.x0; x < f.x1; x += 1.05) {
      for (let z = f.z0; z < f.z1; z += 1.05) {
        const px = x + rng.range(-0.35, 0.35);
        const pz = z + rng.range(-0.35, 0.35);
        out.push({ x: px, z: pz, y: terrainHeight(px, pz) - 0.05, s: rng.range(0.8, 1.15) });
      }
    }
  }
  return { fields, placements: out, parts: wheatTuftGeometry() };
}

export function buildGoatHill(batcher, rng) {
  const B = new Builder(batcher, rng);
  const { x, z } = GOAT_HILL;
  const top = terrainHeight(x, z);
  // cairn on the summit
  for (let i = 0; i < 9; i += 1) {
    const r = 0.9 - i * 0.08;
    B.put(new THREE.IcosahedronGeometry(r * 0.55, 0), 'stone', rng.pick(['#bcae94', '#a99a80', '#cbbd9f']), x + rng.range(-0.15, 0.15), top + 0.25 + i * 0.32, z + rng.range(-0.15, 0.15));
  }
  B.colCyl(0.75, 1.4, x, top + 1.2, z);
  // herder's round hut with a thatched cone roof
  const hx = x + 8;
  const hz = z + 7;
  const hg = terrainHeight(hx, hz);
  B.cyl('stone', '#cdbb98', 2.1, 2.3, 2.3, hx, hg + 0.9, hz, {}, 14);
  B.put(new THREE.ConeGeometry(2.9, 2, 14), 'plain', '#b79a5a', hx, hg + 3.0, hz);
  B.box('wood', PALETTE.woodDark, 0.9, 1.6, 0.1, hx - 1.4, hg + 0.8, hz - 1.55, { ry: 0.7 }, 1);
  B.colCyl(2.2, 1.3, hx, hg + 1.1, hz);
  // big boulders goats like to stand on
  for (let i = 0; i < 7; i += 1) {
    const a = (i / 7) * Math.PI * 2 + 0.4;
    const r = rng.range(6, 15);
    const bx = x + Math.cos(a) * r;
    const bz = z + Math.sin(a) * r;
    const s = rng.range(0.9, 1.7);
    const by = terrainHeight(bx, bz);
    B.put(new THREE.IcosahedronGeometry(s, 0), 'stone', rng.pick(['#bba98a', '#a8977a']), bx, by + s * 0.25, bz, { sy: 0.7, ry: rng() * 6 });
    B.colCyl(s * 0.85, s * 0.45, bx, by + s * 0.3, bz);
  }
  B.footprints.push({ x: hx, z: hz, w: 4.4, d: 4.4, ry: 0, round: true, kind: 'house' });
  return { B, spots: { goats: { x, z, r: 16 } } };
}

// ---------------------------------------------------------------- Sea of Galilee
function boatHull(B, x, y, z, ry, { mast = true, upturned = false } = {}) {
  B.at(x, y, z, ry);
  const flip = upturned ? -1 : 1;
  const oy = upturned ? 0.4 : 0;
  B.box('wood', '#7a4f2a', 1.8, 0.6, 4.4, 0, oy + 0.15 * flip, 0, {}, 1);
  B.box('wood', '#7a4f2a', 1.3, 0.5, 1.2, 0, oy + 0.2 * flip, 2.55, { rx: 0.25 * flip }, 1);
  B.box('wood', '#7a4f2a', 1.3, 0.5, 1.0, 0, oy + 0.24 * flip, -2.45, { rx: -0.3 * flip }, 1);
  B.box('wood', '#c9a66b', 1.9, 0.1, 4.5, 0, oy + 0.46 * flip, 0, {}, 1);
  if (mast && !upturned) {
    B.cyl('wood', '#6a4426', 0.07, 0.09, 3.6, 0, 2.1, 0.5, {}, 6);
    B.box('cloth', '#efe4c8', 0.04, 2.2, 2.0, 0.05, 2.5, 0.5, {}, 1);
  }
  B.at(0, 0, 0, 0);
}

export function buildHamlet(batcher, rng, extras) {
  const B = new Builder(batcher, rng);
  const g = padHeight(HAMLET.pad);
  const { x, z, jettyX } = HAMLET;
  const huts = [
    { x: x - 11, z: z - 6, ry: 0.15, w: 5, d: 4.4 },
    { x: x - 2, z: z - 9, ry: -0.08, w: 5.4, d: 4.6 },
    { x: x + 8, z: z - 8, ry: 0.1, w: 4.6, d: 4.2 },
    { x: x + 14.5, z: z + 2, ry: -Math.PI / 2 + 0.1, w: 4.6, d: 4.2 },
  ];
  for (const h of huts) buildHouse(B, { ...h, h: 2.9, tint: rng.pick(['#e8dcc0', '#d9c7a2', '#efe3c8']), doorX: 0.6 });
  // jetty north->south into the lake
  const deckY = 1.05;
  const j0 = -97;
  const j1 = -76;
  for (let jz = j0; jz < j1; jz += 0.55) {
    B.box('wood', rng() < 0.5 ? '#9c6b40' : '#8a5c34', 2.4, 0.1, 0.5, jettyX, deckY, jz + 0.25, {}, 1);
  }
  for (let jz = j0 + 1; jz <= j1; jz += 3) {
    for (const s of [-1.1, 1.1]) {
      const ground = Math.min(terrainHeight(jettyX + s, jz), 0) - 1.5;
      const h = deckY - ground;
      B.cyl('wood', PALETTE.woodDark, 0.12, 0.14, h, jettyX + s, ground + h / 2, jz, {}, 6);
    }
  }
  B.colBox(1.2, 0.06, (j1 - j0) / 2, jettyX, deckY, (j0 + j1) / 2);
  // boats: two moored, one drawn up and upturned on the beach
  boatHull(B, jettyX + 2.9, 0, -83, 0.05);
  boatHull(B, jettyX - 3.1, 0, -86, -0.1);
  boatHull(B, x - 12, terrainHeight(x - 12, -97) + 0.1, -97, 1.3, { upturned: true });
  B.colBox(1, 0.3, 2.3, x - 12, terrainHeight(x - 12, -97) + 0.35, -97, { ry: 1.3 });
  // net racks with drying nets
  for (const [nx, nz, ry] of [[x - 8, z + 3, 0.2], [x - 3, z + 5.5, -0.15]]) {
    B.at(nx, 0, nz, ry);
    for (const lx of [-2, 2]) B.cyl('wood', PALETTE.woodDark, 0.07, 0.08, 2.2, lx, g + 1.1, 0, {}, 5);
    B.box('wood', PALETTE.woodDark, 4.3, 0.08, 0.08, 0, g + 2.1, 0, {}, 1);
    B.box('cloth', '#8d7a5a', 3.9, 1.6, 0.03, 0, g + 1.25, 0, { rx: 0.08 }, 1);
    B.colBox(2.1, 1, 0.15, 0, g + 1, 0);
    B.at(0, 0, 0, 0);
  }
  // fish baskets, amphorae, a smoking rack, campfire
  for (let i = 0; i < 6; i += 1) basket(B, x + 2 + (i % 3) * 0.8, g, z + 2 + Math.floor(i / 3) * 0.8, i % 2 ? '#9fb3b8' : '#c8d2d4');
  for (let i = 0; i < 3; i += 1) amphora(B, x + 6 + i * 0.7, g, z - 4.4, 0.85);
  crate(B, x + 9.5, g, z - 3.5, 0.9, 0.2);
  const flame = campfire(B, extras, x + 3, z + 7.5, g);
  B.footprints.push({ x: jettyX, z: (j0 + j1) / 2, w: 2.4, d: j1 - j0, ry: 0, kind: 'workshop' });
  return { B, flame, spots: { cart: { x: x + 5.5, z: z + 0.5, yaw: -Math.PI / 2 }, jettyEnd: { x: jettyX, z: j1 - 1 } } };
}

export function buildIsle(batcher, rng) {
  const B = new Builder(batcher, rng);
  const { x, z } = ISLE;
  const g = terrainHeight(x, z);
  B.put(palmTreeGeometry(rng, 7.5), 'foliage', null, x - 2, g - 0.1, z - 1.5);
  B.colCyl(0.3, 2, x - 2, g + 2, z - 1.5);
  B.put(oliveTreeGeometry(rng, 0.9), 'foliage', null, x + 3, terrainHeight(x + 3, z + 2) - 0.05, z + 2, { ry: 1.2 });
  B.colCyl(0.3, 1, x + 3, g + 1, z + 2);
  // the inscribed stone
  B.box('stone', '#d8c8a8', 1.3, 1.1, 0.4, x + 1.5, terrainHeight(x + 1.5, z + 1.5) + 0.45, z + 1.5, { ry: 0.6 });
  B.colBox(0.65, 0.55, 0.2, x + 1.5, g + 0.5, z + 1.5, { ry: 0.6 });
  for (let i = 0; i < 6; i += 1) {
    const a = rng() * Math.PI * 2;
    const r = rng.range(4, 8);
    const bx = x + Math.cos(a) * r;
    const bz = z + Math.sin(a) * r;
    B.put(new THREE.IcosahedronGeometry(rng.range(0.3, 0.6), 0), 'stone', '#b6a688', bx, Math.max(terrainHeight(bx, bz), -0.2) + 0.1, bz);
  }
  return { B };
}

// ---------------------------------------------------------------- Roman outpost
export function buildOutpost(batcher, rng, extras) {
  const B = new Builder(batcher, rng);
  const c = OUTPOST.compound;
  const g = padHeight(OUTPOST.pad);
  const H = 3.8;
  const T = 1.1;
  const wallColor = '#d9c9a6';
  const gateHalf = 2.8;
  const wall = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 0.2) return;
    const ry = Math.atan2(x1 - x0, z1 - z0);
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    B.box('stone', wallColor, T, H, len, mx, g + H / 2, mz, { ry });
    B.box('stone', '#c8b690', T + 0.2, 0.25, len, mx, g + H + 0.12, mz, { ry });
    // crenellations
    const n = Math.floor(len / 1.4);
    for (let i = 0; i < n; i += 2) {
      const t = (i + 0.5) / n;
      B.box('stone', wallColor, T * 0.9, 0.55, 0.7, x0 + (x1 - x0) * t, g + H + 0.5, z0 + (z1 - z0) * t, { ry });
    }
    B.colBox(T / 2 + 0.05, H / 2 + 0.6, len / 2, mx, g + H / 2 + 0.6, mz, { ry });
  };
  wall(c.x0, c.z0, c.x1, c.z0);
  wall(c.x1, c.z0, c.x1, c.z1);
  wall(c.x1, c.z1, c.x0, c.z1);
  wall(c.x0, c.z1, c.x0, OUTPOST.gateZ + gateHalf);
  wall(c.x0, OUTPOST.gateZ - gateHalf, c.x0, c.z0);
  // corner towers and gate towers
  const tower = (x, z, s = 2.6, h = 6.2) => {
    B.box('stone', '#d2c19c', s, h, s, x, g + h / 2, z);
    B.box('stone', '#bfae8a', s + 0.3, 0.3, s + 0.3, x, g + h, z);
    for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.box('stone', '#d2c19c', 0.6, 0.6, 0.6, x + ox * (s / 2 - 0.2), g + h + 0.45, z + oz * (s / 2 - 0.2));
    B.colBox(s / 2, h / 2 + 0.3, s / 2, x, g + h / 2, z);
  };
  tower(c.x0, c.z0);
  tower(c.x1, c.z0);
  tower(c.x1, c.z1);
  tower(c.x0, c.z1);
  tower(c.x0, OUTPOST.gateZ - gateHalf - 1.3, 2.6, 6.8);
  tower(c.x0, OUTPOST.gateZ + gateHalf + 1.3, 2.6, 6.8);
  // gate arch lintel + open timber doors
  B.box('stone', '#cbb993', 1.6, 1.2, gateHalf * 2 + 0.4, c.x0, g + H + 0.6, OUTPOST.gateZ, {});
  B.box('wood', PALETTE.woodDark, 2.4, 3.2, 0.25, c.x0 + 1.35, g + 1.6, OUTPOST.gateZ - gateHalf + 0.2, { ry: 0 }, 1);
  B.box('wood', PALETTE.woodDark, 2.4, 3.2, 0.25, c.x0 + 1.35, g + 1.6, OUTPOST.gateZ + gateHalf - 0.2, { ry: 0 }, 1);
  // lookout platform on the north-west corner tower (soldier stands on top)
  const towerTop = g + 6.2 + 0.15;

  // barracks along the north wall: long block with a red tiled roof
  const roofed = (x, z, w, d, h, color = '#e5d6b4') => {
    B.box('stone', color, w, h, d, x, g + h / 2, z);
    const pitch = 0.32;
    const slab = d / 2 / Math.cos(pitch) + 0.3;
    B.box('clay', ROOF_RED, w + 0.5, 0.18, slab, x, g + h + Math.sin(pitch) * slab * 0.5, z - d / 4 - 0.05, { rx: pitch }, 1);
    B.box('clay', ROOF_RED, w + 0.5, 0.18, slab, x, g + h + Math.sin(pitch) * slab * 0.5, z + d / 4 + 0.05, { rx: -pitch }, 1);
    B.colBox(w / 2, h / 2, d / 2, x, g + h / 2, z);
    B.footprints.push({ x, z, w, d, ry: 0, kind: 'roman-tower' });
  };
  roofed(43, -191, 30, 6, 3.2);
  for (let i = 0; i < 6; i += 1) B.box('wood', '#5a3a1e', 1, 1.9, 0.08, 31 + i * 5, g + 0.95, -187.95, {}, 1);
  // principia (HQ) on the east side with a column porch facing west
  roofed(56, -178, 8, 11, 3.6, '#ece0c4');
  for (let i = 0; i < 4; i += 1) B.cyl('stone', '#f2ead8', 0.28, 0.3, 3.4, 50.8, g + 1.7, -182.4 + i * 3, {}, 10);
  B.box('stone', '#e0d2b0', 1.4, 0.3, 11, 50.8, g + 3.55, -178, {});
  // eagle standard in front of the HQ
  B.cyl('wood', '#6a4426', 0.06, 0.08, 4.2, 47, g + 2.1, -178, {}, 6);
  B.put(new THREE.OctahedronGeometry(0.45, 0), 'plain', '#e6b64e', 47, g + 4.45, -178, { sx: 1.5, sy: 0.8 });
  B.box('plain', '#e6b64e', 1.6, 0.12, 0.1, 47, g + 4.2, -178, {});
  B.colCyl(0.15, 1.5, 47, g + 1.5, -178);
  // stable along the south wall (open to the north), stalls for the horses
  shed(B, 35, -163.6, 0, 18, 4.6, 2.8, g);
  for (let i = 0; i < 4; i += 1) B.box('wood', PALETTE.woodMid, 0.12, 1.2, 2.6, 28.2 + i * 4.5, g + 0.6, -163, {}, 1);
  B.box('wood', PALETTE.woodDark, 6, 0.5, 0.6, 35, g + 0.25, -161.9, {}, 1);
  // granary + amphora stacks + crates
  roofed(28, -192.2, 8, 5, 2.8, '#d8c7a0');
  for (let i = 0; i < 6; i += 1) amphora(B, 54 + (i % 3) * 0.75, g, -166 - Math.floor(i / 3) * 0.75, 0.95);
  for (let i = 0; i < 4; i += 1) crate(B, 57.5 + (i % 2) * 0.95, g, -168.5 - Math.floor(i / 2) * 1.0, 0.85, 0.1);
  // training yard: posts and straw dummies, a water trough
  for (let i = 0; i < 3; i += 1) {
    const dx = 33 + i * 4;
    B.cyl('wood', PALETTE.woodDark, 0.1, 0.12, 1.9, dx, g + 0.95, -182, {}, 6);
    B.put(new THREE.SphereGeometry(0.4, 8, 6), 'plain', '#d8bd72', dx, g + 1.55, -182, { sy: 1.3 });
    B.box('wood', PALETTE.woodDark, 1.4, 0.1, 0.1, dx, g + 1.45, -182, {}, 1);
    B.colCyl(0.25, 0.95, dx, g + 0.95, -182);
  }
  B.box('stone', '#c8b690', 3.2, 0.7, 1, 26.5, g + 0.35, -184.5, {});
  B.box('plain', '#3f8fa6', 2.9, 0.05, 0.7, 26.5, g + 0.68, -184.5, {});
  B.colBox(1.6, 0.35, 0.5, 26.5, g + 0.35, -184.5);
  // notice board outside the gate
  extras.add(signBoard(['CASTRA GALILAEA', 'LEG · X · FRETENSIS'], 16.2, g + 2.0, -183.4, -Math.PI / 2, { bg: '#8f2a22', ink: '#f3d27a', w: 1.9, h: 0.9 }));
  B.cyl('wood', PALETTE.woodDark, 0.07, 0.08, 2.4, 16.2, g + 1.2, -184.3, {}, 5);
  B.cyl('wood', PALETTE.woodDark, 0.07, 0.08, 2.4, 16.2, g + 1.2, -182.5, {}, 5);
  // red banners on the gate towers
  const flags = [];
  for (const fz of [OUTPOST.gateZ - gateHalf - 1.3, OUTPOST.gateZ + gateHalf + 1.3]) {
    B.cyl('wood', '#6a4426', 0.05, 0.06, 2.4, c.x0, g + 7.9, fz, {}, 5);
    const f = flagMesh('#a3241c', 'SPQR');
    f.position.set(c.x0, g + 8.4, fz);
    f.rotation.y = Math.PI / 2;
    extras.add(f);
    flags.push(f);
  }
  B.footprints.push({ x: (c.x0 + c.x1) / 2, z: (c.z0 + c.z1) / 2, w: c.x1 - c.x0, d: c.z1 - c.z0, ry: 0, kind: 'roman' });
  const gz = OUTPOST.gateZ;
  const posts = {
    outGateN: { x: c.x0 - 2.4, z: gz - 3.4, y: g, yaw: -Math.PI / 2 },
    outGateS: { x: c.x0 - 2.4, z: gz + 3.4, y: g, yaw: -Math.PI / 2 },
    outStable: { x: 37, z: -168.5, y: g, yaw: -2.1 },
    outTower: { x: c.x0 + 0.2, z: c.z0 + 0.2, y: towerTop, yaw: -Math.PI * 0.75, elevated: true },
    outGateInside: { x: c.x0 + 3.2, z: gz, y: g },
    outGateOutside: { x: c.x0 - 4, z: gz, y: g },
  };
  const spots = {
    chariot1: { x: 30, z: -171, yaw: -Math.PI / 2 },
    chariot2: { x: 30, z: -175.5, yaw: -Math.PI / 2 },
    horse1: { x: 32.5, z: -163.4, yaw: 0 },
    horse2: { x: 41.5, z: -163.4, yaw: 0 },
    yard: [{ x: 36, z: -177 }, { x: 44, z: -172 }, { x: 38, z: -185 }],
  };
  return { B, posts, spots, flags };
}

/** The chariot circuit: dirt oval, central spina with turning posts, a fence and a lap board. */
export function buildCircuit(batcher, rng, extras) {
  const B = new Builder(batcher, rng);
  const g = padHeight(CIRCUIT.pad);
  const { x, z, rx, rz, innerRx, innerRz } = CIRCUIT;
  // spina
  const len = (innerRx - 4) * 2;
  B.box('stone', '#d8c8a2', len, 1.1, 2.2, x, g + 0.55, z, {});
  B.box('stone', '#c4b28c', len + 0.3, 0.15, 2.4, x, g + 1.15, z, {});
  B.colBox(len / 2, 0.8, 1.1, x, g + 0.6, z);
  for (const s of [-1, 1]) {
    const mx = x + s * (len / 2 + 0.6);
    for (const oz of [-0.6, 0, 0.6]) B.put(new THREE.ConeGeometry(0.35, 2.6, 8), 'stone', '#e6b64e', mx, g + 1.3, z + oz);
    B.colCyl(1, 1.3, mx, g + 1.3, z);
  }
  // obelisk
  B.box('stone', '#e2d4b2', 0.9, 5.6, 0.9, x, g + 3.9, z, {});
  B.put(new THREE.ConeGeometry(0.64, 0.8, 4), 'stone', '#e6b64e', x, g + 7.1, z, { ry: Math.PI / 4 });
  // outer fence (oval), gap at the south entrance
  const pts = [];
  const N = 44;
  for (let i = 0; i <= N; i += 1) {
    const a = (i / N) * Math.PI * 2;
    pts.push([x + Math.cos(a) * (rx + 1.4), z + Math.sin(a) * (rz + 1.4)]);
  }
  // split around the entrance at angle pi/2 (south, +z) -> remove the 3 points around it
  const gapIdx = Math.round(N / 4);
  fence(B, pts.slice(0, gapIdx - 1), g, { h: 1.05, step: 2.4, color: '#d9d2c0' });
  fence(B, pts.slice(gapIdx + 1), g, { h: 1.05, step: 2.4, color: '#d9d2c0' });
  // stands on the north side
  for (let row = 0; row < 3; row += 1) {
    B.box('wood', PALETTE.woodMid, 22, 0.5 + row * 0.5, 1.2, x, g + (0.5 + row * 0.5) / 2, z - rz - 4 - row * 1.2, {}, 1);
  }
  B.colBox(11, 0.8, 1.8, x, g + 0.75, z - rz - 5.2);
  // start/finish posts (white line painted on the ground decal)
  for (const s of [rz + 0.6, innerRz + 0.6]) B.cyl('wood', '#f2efe6', 0.1, 0.1, 2.2, x, g + 1.1, z + s, {}, 6);
  B.box('cloth', '#f2efe6', 0.08, 0.5, rz - innerRz - 0.4, x, g + 2.05, z + (rz + innerRz) / 2 + 0.6, {}, 1);
  extras.add(signBoard(['THE LITTLE CIRCUS', 'one lap — any animal'], x, g + 1.6, z + rz + 2.4, 0, { w: 1.9, h: 0.9 }));
  B.cyl('wood', PALETTE.woodDark, 0.06, 0.07, 1.6, x - 0.8, g + 0.8, z + rz + 2.45, {}, 5);
  B.cyl('wood', PALETTE.woodDark, 0.06, 0.07, 1.6, x + 0.8, g + 0.8, z + rz + 2.45, {}, 5);
  B.footprints.push({ x, z, w: rx * 2, d: rz * 2, ry: 0, round: false, kind: 'circus' });
  return { B };
}

// ---------------------------------------------------------------- desert
export function buildOasis(batcher, rng) {
  const B = new Builder(batcher, rng);
  const { x, z, pondR } = OASIS;
  const ring = 11;
  for (let i = 0; i < 9; i += 1) {
    const a = (i / 9) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const r = ring + rng.range(-2, 2.5);
    const px = x + Math.cos(a) * r;
    const pz = z + Math.sin(a) * r;
    B.put(palmTreeGeometry(rng, rng.range(6, 9)), 'foliage', null, px, terrainHeight(px, pz) - 0.1, pz);
    B.colCyl(0.3, 2, px, terrainHeight(px, pz) + 2, pz);
  }
  // reeds around the water
  for (let i = 0; i < 26; i += 1) {
    const a = rng() * Math.PI * 2;
    const r = pondR + rng.range(-0.6, 1.2);
    const px = x + Math.cos(a) * r;
    const pz = z + Math.sin(a) * r;
    B.put(new THREE.ConeGeometry(0.12, rng.range(1, 1.7), 4), 'foliage', rng.pick(['#5e8a3c', '#6f9a44']), px, Math.max(terrainHeight(px, pz), POND_LEVEL()) + 0.6, pz);
  }
  // stones and a stone basin
  for (let i = 0; i < 7; i += 1) {
    const a = (i / 7) * Math.PI * 2;
    const px = x + Math.cos(a) * (pondR + 2.2);
    const pz = z + Math.sin(a) * (pondR + 2.2);
    B.put(new THREE.IcosahedronGeometry(rng.range(0.35, 0.7), 0), 'stone', '#cbb48a', px, terrainHeight(px, pz) + 0.15, pz);
  }
  const water = { x, y: POND_LEVEL(), z, r: pondR + 0.6 };
  B.footprints.push({ x, z, w: pondR * 2, d: pondR * 2, ry: 0, round: true, kind: 'water' });
  return { B, water };
}

function tent(B, x, z, ry, w, d, h, colors, g) {
  B.at(x, 0, z, ry);
  // striped triangular prism (a 3-sided cylinder lying along local z, apex up)
  const r = h / 1.5;
  const stripes = 5;
  for (let i = 0; i < stripes; i += 1) {
    const lz = -d / 2 + (d / stripes) * (i + 0.5);
    B.put(new THREE.CylinderGeometry(r, r, d / stripes + 0.01, 3, 1), 'cloth', colors[i % colors.length], 0, g + r / 2, lz, { rx: -Math.PI / 2, sx: (w / (r * 1.732)) });
  }
  // dark doorway on the front gable + guy ropes
  B.box('cloth', '#2a1a14', w * 0.3, h * 0.55, 0.04, 0, g + h * 0.27, d / 2 + 0.02, {}, 1);
  B.cyl('wood', PALETTE.woodDark, 0.06, 0.06, h + 0.3, 0, g + (h + 0.3) / 2, -d / 2 - 0.05, {}, 5);
  B.cyl('wood', PALETTE.woodDark, 0.06, 0.06, h + 0.3, 0, g + (h + 0.3) / 2, d / 2 + 0.05, {}, 5);
  B.colBox(w / 2 - 0.2, h / 2, d / 2, 0, g + h / 2, 0);
  B.at(0, 0, 0, 0);
  B.footprints.push({ x, z, w, d, ry, kind: 'tent' });
}

export function buildCamp(batcher, rng, extras) {
  const B = new Builder(batcher, rng);
  const g = padHeight(CAMP.pad);
  const { x, z } = CAMP;
  tent(B, x - 8, z - 5, 0.3, 5.5, 6, 3, ['#7a2f3a', '#e0b46a', '#3d5f8f'], g);
  tent(B, x + 7, z - 6, -0.4, 5, 5.5, 2.8, ['#2f6f6a', '#e8d6a8', '#a8472e'], g);
  tent(B, x - 1, z + 9, Math.PI + 0.2, 6, 7, 3.3, ['#5a3a7a', '#e0a12c', '#b8322e'], g);
  // carpets
  const rugs = ['#a8322a', '#2f5d8a', '#c4567a', '#d96d2b'];
  for (let i = 0; i < 4; i += 1) B.box('cloth', rugs[i], 2.2, 0.03, 1.4, x + 3 + (i % 2) * 2.6, g + 0.02, z + 0.5 + Math.floor(i / 2) * 1.8, { ry: rng.range(-0.2, 0.2) }, 1);
  // trade goods
  for (let i = 0; i < 4; i += 1) sack(B, x - 3.5 + i * 0.8, g, z + 3.6, rng.pick(['#cdb58a', '#bfa77a', '#a88a5a']));
  for (let i = 0; i < 3; i += 1) crate(B, x + 9 + (i % 2) * 0.9, g, z + 2 + i * 0.7, 0.8, 0.2 * i);
  for (let i = 0; i < 5; i += 1) amphora(B, x - 6 + (i % 3) * 0.7, g, z + 1 + Math.floor(i / 3) * 0.7, 0.9);
  // hitching rail
  B.box('wood', PALETTE.woodDark, 6, 0.12, 0.12, x + 2, g + 1.05, z - 11, {}, 1);
  for (const s of [-3, 3]) B.cyl('wood', PALETTE.woodDark, 0.08, 0.09, 1.1, x + 2 + s, g + 0.55, z - 11, {}, 5);
  B.colBox(3, 0.55, 0.1, x + 2, g + 0.55, z - 11);
  const flame = campfire(B, extras, x, z, g);
  // a pair of palms
  for (const [px, pz] of [[x - 13, z + 4], [x + 13, z + 7]]) {
    B.put(palmTreeGeometry(rng, 7), 'foliage', null, px, g - 0.1, pz);
    B.colCyl(0.3, 2, px, g + 2, pz);
  }
  return {
    B, flame,
    spots: { camel: { x: x + 4, z: z - 8.5, yaw: Math.PI }, resting: [{ x: x - 4, z: z - 9 }, { x: x + 9, z: z - 2 }, { x: x - 11, z: z + 2 }] },
  };
}

/** Sandstone arch and mesas for the desert skyline. */
export function buildDesertRocks(batcher, rng) {
  const B = new Builder(batcher, rng);
  const arch = (x, z, ry, s) => {
    const g = terrainHeight(x, z);
    B.at(x, 0, z, ry);
    for (const lx of [-3 * s, 3 * s]) {
      B.box('stone', '#d6a66e', 2.2 * s, 6 * s, 2.4 * s, lx, g + 3 * s - 0.5, 0, { ry: 0.1 });
      B.colBox(1.1 * s, 3 * s, 1.2 * s, lx, g + 3 * s - 0.5, 0);
    }
    B.box('stone', '#cf9c62', 8.8 * s, 1.8 * s, 2.6 * s, 0, g + 6.4 * s - 0.5, 0, { rz: 0.05 });
    B.colBox(4.4 * s, 0.9 * s, 1.3 * s, 0, g + 6.4 * s - 0.5, 0);
    B.at(0, 0, 0, 0);
  };
  arch(112, 150, 0.5, 1.2);
  const mesa = (x, z, w, h) => {
    const g = terrainHeight(x, z);
    B.put(new THREE.CylinderGeometry(w * 0.8, w, h, 9), 'stone', rng.pick(['#d3a26a', '#c8945c', '#dcb07a']), x, g + h / 2 - 0.5, z, { ry: rng() * 3 });
    B.colCyl(w * 0.9, h / 2, x, g + h / 2 - 0.5, z);
  };
  mesa(-120, 175, 9, 9);
  mesa(-160, 150, 6, 6);
  mesa(150, 185, 10, 11);
  mesa(-90, 196, 12, 7);
  return { B };
}
