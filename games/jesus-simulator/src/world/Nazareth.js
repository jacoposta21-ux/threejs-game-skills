import * as THREE from 'three';
import { worldBox, roundedBox, potGeometry } from './geometry.js';
import { PALETTE } from './materials.js';
import { oliveTreeGeometry, palmTreeGeometry, cypressGeometry } from './vegetation.js';
import { terrainHeight, roadDistance, PLAZA, MARKET, LANDMARKS } from './layout.js';

/**
 * Builds the Nazareth village into a StaticBatcher and returns collider
 * descriptors + footprints. Everything is deterministic from the seeded rng.
 *
 * Collider descriptor: { shape: 'box', hx, hy, hz, x, y, z, q } or
 *                      { shape: 'cyl', r, hh, x, y, z }
 */
const euler = new THREE.Euler();
const quat = new THREE.Quaternion();
const v3 = new THREE.Vector3();

class Builder {
  constructor(batcher, rng) {
    this.b = batcher;
    this.rng = rng;
    this.colliders = [];
    this.footprints = [];
    this.frame = { x: 0, y: 0, z: 0, ry: 0 };
  }

  /** Set a local frame (origin + yaw) for subsequent local-space placements. */
  at(x, y, z, ry = 0) {
    this.frame = { x, y, z, ry };
    return this;
  }

  world(lx, ly, lz) {
    const { x, y, z, ry } = this.frame;
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    return { x: x + lx * c + lz * s, y: y + ly, z: z - lx * s + lz * c };
  }

  /** Place geometry in local frame. */
  put(geometry, key, color, lx, ly, lz, rot = {}) {
    const p = this.world(lx, ly, lz);
    this.b.add(geometry, key, color, { ...p, rx: rot.rx || 0, ry: this.frame.ry + (rot.ry || 0), rz: rot.rz || 0, sx: rot.sx, sy: rot.sy, sz: rot.sz, s: rot.s });
    geometry.dispose();
  }

  box(key, color, w, h, d, lx, ly, lz, rot = {}, tile = 2) {
    this.put(worldBox(w, h, d, tile), key, color, lx, ly, lz, rot);
  }

  rbox(key, color, w, h, d, lx, ly, lz, rot = {}, r = 0.06) {
    this.put(roundedBox(w, h, d, r), key, color, lx, ly, lz, rot);
  }

  cyl(key, color, rTop, rBot, h, lx, ly, lz, rot = {}, seg = 8) {
    this.put(new THREE.CylinderGeometry(rTop, rBot, h, seg), key, color, lx, ly, lz, rot);
  }

  colBox(hx, hy, hz, lx, ly, lz, rot = {}) {
    const p = this.world(lx, ly, lz);
    euler.set(rot.rx || 0, this.frame.ry + (rot.ry || 0), rot.rz || 0, 'YXZ');
    quat.setFromEuler(euler);
    this.colliders.push({ shape: 'box', hx, hy, hz, ...p, q: { x: quat.x, y: quat.y, z: quat.z, w: quat.w } });
  }

  colCyl(r, hh, lx, ly, lz) {
    const p = this.world(lx, ly, lz);
    this.colliders.push({ shape: 'cyl', r, hh, ...p });
  }
}

const groundMinMax = (x, z, hw, hd, ry) => {
  let min = Infinity;
  let max = -Infinity;
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  for (const [lx, lz] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd], [0, 0]]) {
    const h = terrainHeight(x + lx * c + lz * s, z - lx * s + lz * c);
    min = Math.min(min, h);
    max = Math.max(max, h);
  }
  return { min, max };
};

// ---------------------------------------------------------------- props

function pot(B, lx, ly, lz, scale = 1, color) {
  const rng = B.rng;
  B.put(potGeometry(0.7 * scale, 0.3 * scale, 9), 'clay', color || rng.pick(PALETTE.clay), lx, ly, lz, { ry: rng() * 6 });
}

function amphora(B, lx, ly, lz, scale = 1) {
  const pts = [[0, 0], [0.08, 0], [0.2, 0.15], [0.3, 0.5], [0.26, 0.8], [0.12, 0.95], [0.1, 1.15], [0.15, 1.2], [0.12, 1.2]]
    .map(([x, y]) => new THREE.Vector2(x * scale, y * scale));
  B.put(new THREE.LatheGeometry(pts, 9), 'clay', B.rng.pick(PALETTE.clay), lx, ly, lz);
}

function crate(B, lx, ly, lz, s = 0.8, ry = 0) {
  B.box('wood', PALETTE.woodMid, s, s, s, lx, ly + s / 2, lz, { ry }, 1);
  B.box('wood', PALETTE.woodDark, s + 0.04, 0.08, s + 0.04, lx, ly + s - 0.04, lz, { ry }, 1);
  B.box('wood', PALETTE.woodDark, s + 0.04, 0.08, s + 0.04, lx, ly + 0.04, lz, { ry }, 1);
}

function sack(B, lx, ly, lz, color = '#cdb58a') {
  B.put(new THREE.SphereGeometry(0.32, 8, 6), 'cloth', color, lx, ly + 0.3, lz, { sy: 1.15 });
  B.cyl('cloth', color, 0.08, 0.14, 0.18, lx, ly + 0.68, lz, {}, 6);
}

function basket(B, lx, ly, lz, fill) {
  B.cyl('wood', '#b38b52', 0.34, 0.26, 0.32, lx, ly + 0.16, lz, {}, 10);
  if (fill) B.put(new THREE.SphereGeometry(0.3, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), 'plain', fill, lx, ly + 0.26, lz, { sy: 0.4 });
}

function bench(B, lx, ly, lz, ry = 0) {
  B.box('stone', '#d8c6a2', 2.2, 0.16, 0.55, lx, ly + 0.5, lz, { ry });
  B.box('stone', '#c8b28c', 0.3, 0.45, 0.45, lx - 0.8 * Math.cos(ry), ly + 0.22, lz + 0.8 * Math.sin(ry), { ry });
  B.box('stone', '#c8b28c', 0.3, 0.45, 0.45, lx + 0.8 * Math.cos(ry), ly + 0.22, lz - 0.8 * Math.sin(ry), { ry });
}

// ---------------------------------------------------------------- house

export function buildHouse(B, o) {
  const rng = B.rng;
  const { x, z, ry, w, d } = o;
  const { min, max } = groundMinMax(x, z, w / 2 + 0.6, d / 2 + 0.6, ry);
  const g = max; // walking level at the door
  const base = min - 0.35;
  const H = g - base + o.h;
  const tint = o.tint || rng.pick(PALETTE.limestone);
  B.at(x, 0, z, ry);

  B.box('stone', tint, w, H, d, 0, base + H / 2, 0);
  B.box('stone', PALETTE.plinth, w + 0.16, g - base + 0.45, d + 0.16, 0, base + (g - base + 0.45) / 2, 0);
  const top = base + H;
  B.box('plain', PALETTE.plaster, w + 0.12, 0.16, d + 0.12, 0, top + 0.08, 0);
  B.colBox(w / 2, H / 2 + 0.08, d / 2, 0, base + H / 2 + 0.08, 0);

  // parapet (gap on +x/back corner when stairs arrive)
  const pT = 0.22;
  const pH = 0.5;
  const pY = top + 0.16 + pH / 2;
  const parapet = (pw, pd, px, pz) => {
    B.box('stone', tint, pw, pH, pd, px, pY, pz);
    B.colBox(pw / 2, pH / 2, pd / 2, px, pY, pz);
  };
  parapet(w, pT, 0, d / 2 - pT / 2);
  parapet(w, pT, 0, -d / 2 + pT / 2);
  parapet(pT, d - pT * 2, -w / 2 + pT / 2, 0);
  if (o.stairs) {
    const gap = 1.5;
    const len = d - pT * 2 - gap;
    parapet(pT, len, w / 2 - pT / 2, (d / 2 - pT) - len / 2);
  } else {
    parapet(pT, d - pT * 2, w / 2 - pT / 2, 0);
  }

  // roof beams (vigas) poking out of the front and back
  const vigas = Math.max(2, Math.floor(w / 1.5));
  for (let i = 0; i < vigas; i += 1) {
    const vx = -w / 2 + ((i + 0.5) / vigas) * w;
    B.cyl('wood', PALETTE.woodDark, 0.09, 0.09, 0.55, vx, top - 0.3, d / 2 + 0.2, { rx: Math.PI / 2 }, 6);
    B.cyl('wood', PALETTE.woodDark, 0.09, 0.09, 0.55, vx, top - 0.3, -d / 2 - 0.2, { rx: Math.PI / 2 }, 6);
  }

  // door with lintel and recess
  const doorX = o.doorX ?? rng.range(-w / 2 + 1.2, w / 2 - 1.2) * 0.6;
  B.box('plain', PALETTE.dark, 1.3, 2.3, 0.1, doorX, g + 1.15, d / 2 + 0.01);
  B.box('wood', rng.pick([PALETTE.woodMid, PALETTE.woodDark, '#5f7f8a']), 1.05, 2.05, 0.12, doorX, g + 1.03, d / 2 + 0.03, {}, 1);
  B.box('stone', '#cbb48a', 1.7, 0.28, 0.32, doorX, g + 2.38, d / 2 + 0.06);
  B.box('stone', PALETTE.plinth, 1.4, 0.18, 0.5, doorX, g + 0.09, d / 2 + 0.25);

  // windows with painted shutters
  const shutter = rng.pick(PALETTE.shutters);
  const storeys = o.h > 5 ? 2 : 1;
  const winRow = (ly) => {
    const spots = w > 6 ? [-w / 2 + 1.1, w / 2 - 1.1] : [doorX > 0 ? -w / 2 + 1 : w / 2 - 1];
    for (const wx of spots) {
      if (Math.abs(wx - doorX) < 1.3 && ly < g + 3) continue;
      B.box('plain', PALETTE.dark, 0.62, 0.62, 0.08, wx, ly, d / 2 + 0.02);
      B.box('wood', shutter, 0.3, 0.66, 0.06, wx - 0.5, ly, d / 2 + 0.05, { ry: 0.25 }, 1);
      B.box('wood', shutter, 0.3, 0.66, 0.06, wx + 0.5, ly, d / 2 + 0.05, { ry: -0.25 }, 1);
      B.box('stone', '#cbb48a', 0.86, 0.1, 0.22, wx, ly - 0.38, d / 2 + 0.07);
    }
    // side window
    B.box('plain', PALETTE.dark, 0.08, 0.55, 0.55, -w / 2 - 0.02, ly, rng.range(-d / 4, d / 4));
  };
  winRow(g + 1.9);
  if (storeys === 2) winRow(g + 5);

  // door awning
  if (rng() < 0.55) {
    const fabric = rng.pick(PALETTE.fabrics);
    B.box('cloth', fabric, 1.9, 0.05, 1.25, doorX, g + 2.55, d / 2 + 0.6, { rx: 0.32 }, 1);
    B.cyl('wood', PALETTE.woodDark, 0.04, 0.04, 2.35, doorX - 0.9, g + 1.17, d / 2 + 1.15, {}, 5);
    B.cyl('wood', PALETTE.woodDark, 0.04, 0.04, 2.35, doorX + 0.9, g + 1.17, d / 2 + 1.15, {}, 5);
  }

  // doorstep clutter
  if (rng() < 0.7) pot(B, doorX + (rng() < 0.5 ? -1.1 : 1.1), g, d / 2 + 0.45, rng.range(0.8, 1.2));
  if (rng() < 0.35) amphora(B, -w / 2 + 0.5, g, d / 2 + 0.4, rng.range(0.8, 1.1));

  // stairs to the roof along +x side
  if (o.stairs) {
    const sx = w / 2 + 0.6;
    const rise = top + 0.16 - g;
    const landing = 1.3;
    const run = d - landing;
    const steps = Math.ceil(rise / 0.3);
    for (let i = 0; i < steps; i += 1) {
      const h = (rise * (i + 1)) / steps;
      const sd = run / steps;
      const sz = d / 2 - sd * (i + 0.5);
      B.box('stone', tint, 1.15, h + (g - base), sd + 0.01, sx, base + (h + g - base) / 2, sz);
    }
    B.box('stone', tint, 1.15, top + 0.16 - base, landing, sx, base + (top + 0.16 - base) / 2, -d / 2 + landing / 2);
    // smooth ramp collider over the steps + landing collider
    // ramp collider; extended below ground at the foot so it meets uneven terrain without a lip
    const ext = 1.4;
    const len = Math.hypot(run, rise) + ext;
    const ang = Math.atan2(rise, run);
    const hy = 0.15;
    const cy = g + rise / 2 - hy / Math.cos(ang) - (ext / 2) * Math.sin(ang);
    const cz = d / 2 - run / 2 + (ext / 2) * Math.cos(ang);
    B.colBox(0.58, hy, len / 2, sx, cy, cz, { rx: ang });
    B.colBox(0.58, (top + 0.16 - base) / 2, landing / 2, sx, base + (top + 0.16 - base) / 2, -d / 2 + landing / 2);
    // low safety walls around the top landing (outer side + back) so it's hard to step off by accident
    B.box('stone', tint, 0.18, 0.6, landing, sx + 0.66, top + 0.46, -d / 2 + landing / 2);
    B.box('stone', tint, 1.5, 0.6, 0.18, sx + 0.08, top + 0.46, -d / 2 - 0.09);
    B.colBox(0.09, 0.3, landing / 2, sx + 0.66, top + 0.46, -d / 2 + landing / 2);
    B.colBox(0.75, 0.3, 0.09, sx + 0.08, top + 0.46, -d / 2 - 0.09);
  }

  // roof life
  const roofY = top + 0.16;
  const roll = rng();
  if (roll < 0.35) {
    // laundry line
    const lz = rng.range(-d / 4, d / 4);
    B.cyl('wood', PALETTE.woodDark, 0.04, 0.04, 1.8, -w / 2 + 0.6, roofY + 0.9, lz, {}, 5);
    B.cyl('wood', PALETTE.woodDark, 0.04, 0.04, 1.8, w / 2 - 0.6, roofY + 0.9, lz, {}, 5);
    B.box('plain', '#5a4632', w - 1.2, 0.02, 0.02, 0, roofY + 1.7, lz);
    const n = Math.floor((w - 1.6) / 0.9);
    for (let i = 0; i < n; i += 1) {
      B.box('cloth', rng.pick(PALETTE.fabrics), 0.7, rng.range(0.6, 1.0), 0.02, -w / 2 + 1.1 + i * 0.9, roofY + 1.3, lz, {}, 1);
    }
  } else if (roll < 0.6) {
    // shade pergola
    const fabric = rng.pick(PALETTE.fabrics);
    const pw = Math.min(3, w - 1);
    const pd = Math.min(2.6, d - 1);
    for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      B.cyl('wood', PALETTE.woodDark, 0.05, 0.05, 2, (px * pw) / 2, roofY + 1, (pz * pd) / 2, {}, 5);
    }
    B.box('cloth', fabric, pw + 0.3, 0.04, pd + 0.3, 0, roofY + 2, 0, { rz: 0.05 }, 1);
    B.box('cloth', rng.pick(PALETTE.fabrics), 1.6, 0.03, 1, 0, roofY + 0.02, 0, {}, 1);
  } else if (roll < 0.85) {
    pot(B, -w / 2 + 0.7, roofY, -d / 2 + 0.7, 1.1);
    pot(B, -w / 2 + 1.4, roofY, -d / 2 + 0.6, 0.8);
    basket(B, w / 2 - 1.2, roofY, d / 2 - 1, '#7d3b5a');
    B.box('cloth', rng.pick(PALETTE.fabrics), 1.4, 0.03, 0.9, 0.4, roofY + 0.02, 0.2, {}, 1);
  }

  B.footprints.push({ x, z, w, d, ry, kind: o.kind || 'house' });
  return { top: roofY, g };
}

// ---------------------------------------------------------------- landmarks

function buildWell(B) {
  const { x, z } = LANDMARKS[0];
  const g = terrainHeight(x, z);
  B.at(x, 0, z, 0);
  const ring = [[1.0, 0], [1.4, 0], [1.4, 0.85], [1.3, 0.98], [1.05, 0.98], [1.0, 0.85], [1.0, 0]].map(([a, b]) => new THREE.Vector2(a, b));
  B.put(new THREE.LatheGeometry(ring, 18), 'stone', '#d9c8a4', 0, g, 0);
  B.put(new THREE.CircleGeometry(1.0, 18), 'water', '#ffffff', 0, g + 0.55, 0, { rx: -Math.PI / 2 });
  // stepped stone base
  B.put(new THREE.CylinderGeometry(2.1, 2.2, 0.18, 18), 'stone', '#cdb995', 0, g + 0.05, 0);
  for (const s of [-1, 1]) {
    B.box('wood', PALETTE.woodDark, 0.18, 2.4, 0.18, s * 1.25, g + 1.2, 0, {}, 1);
  }
  B.cyl('wood', PALETTE.woodMid, 0.09, 0.09, 2.8, 0, g + 2.3, 0, { rz: Math.PI / 2 }, 8);
  B.box('wood', '#8a5a30', 1.2, 0.08, 0.5, 0, g + 2.55, 0, { rz: 0.3 }, 1);
  B.box('wood', '#8a5a30', 1.2, 0.08, 0.5, 0, g + 2.55, 0, { rz: -0.3, ry: 0 }, 1);
  B.cyl('plain', '#d6c08c', 0.015, 0.015, 1.1, 0.2, g + 1.75, 0, {}, 4);
  B.cyl('wood', '#8f6235', 0.16, 0.13, 0.26, 0.2, g + 1.15, 0, {}, 8);
  B.colCyl(1.42, 0.6, 0, g + 0.5, 0);
  B.colBox(0.1, 1.2, 0.1, -1.25, g + 1.2, 0);
  B.colBox(0.1, 1.2, 0.1, 1.25, g + 1.2, 0);
  // jars, trough
  B.box('stone', '#cbb690', 2.2, 0.5, 0.6, 0, g + 0.25, -3.2);
  B.box('water', '#ffffff', 1.9, 0.04, 0.38, 0, g + 0.46, -3.2);
  B.colBox(1.1, 0.25, 0.3, 0, g + 0.25, -3.2);
  amphora(B, 2.4, g, 1.6, 1);
  amphora(B, 2.9, g, 1.1, 0.85);
  pot(B, 2.7, g, 2.1, 1.2);
  pot(B, -2.6, g, 1.9, 1);
}

function buildSquare(B) {
  const g = terrainHeight(0, 0);
  B.at(0, 0, 0, 0);
  const ring = 10.5;
  for (let i = 0; i < 4; i += 1) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const px = Math.cos(a) * ring;
    const pz = Math.sin(a) * ring;
    const geo = palmTreeGeometry(B.rng, B.rng.range(6.5, 8.5));
    B.put(geo, 'foliage', null, px, terrainHeight(px, pz) - 0.1, pz);
    B.colCyl(0.3, 2, px, terrainHeight(px, pz) + 2, pz);
    B.cyl('stone', '#cdb995', 0.9, 1, 0.4, px, terrainHeight(px, pz) + 0.2, pz, {}, 10);
  }
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    if (Math.abs(Math.sin(a)) < 0.25 || Math.abs(Math.cos(a)) < 0.25) continue;
    const r = 7.2;
    bench(B, Math.cos(a) * r, g, Math.sin(a) * r, -a + Math.PI / 2);
    B.colBox(1.1, 0.3, 0.3, Math.cos(a) * r, g + 0.3, Math.sin(a) * r, { ry: -a + Math.PI / 2 });
  }
  // flower planters
  for (const [px, pz] of [[-6, 6], [6, -6], [6, 6], [-6, -6]]) {
    pot(B, px, g, pz, 1.6, '#b6683c');
    B.put(new THREE.IcosahedronGeometry(0.45, 1), 'foliage', '#6f9442', px, g + 1.2, pz, { sy: 0.7 });
    B.put(new THREE.IcosahedronGeometry(0.12, 0), 'plain', '#d94d6a', px + 0.2, g + 1.45, pz, {});
    B.put(new THREE.IcosahedronGeometry(0.12, 0), 'plain', '#f2c14e', px - 0.25, g + 1.4, pz + 0.1, {});
    B.colCyl(0.45, 0.55, px, g + 0.55, pz);
  }
}

const GOODS = ['fruit', 'bread', 'fish', 'pottery', 'fabric', 'spice', 'fruit', 'bread', 'pottery', 'fabric'];

function stallGoods(B, kind, g) {
  const rng = B.rng;
  const top = g + 0.92;
  if (kind === 'fruit') {
    for (let i = 0; i < 4; i += 1) basket(B, -1.1 + i * 0.72, top, -0.05, rng.pick(['#e07b28', '#c8323a', '#7b3f8f', '#9ab53c']));
  } else if (kind === 'bread') {
    for (let i = 0; i < 9; i += 1) {
      B.rbox('plain', rng.pick(['#c98a46', '#b8763a', '#d79c56']), 0.42, 0.16, 0.24, -1.2 + (i % 5) * 0.55, top + 0.08 + Math.floor(i / 5) * 0.14, -0.2 + (i % 2) * 0.3, { ry: rng.range(-0.3, 0.3) }, 0.07);
    }
  } else if (kind === 'fish') {
    for (let i = 0; i < 7; i += 1) {
      B.put(new THREE.IcosahedronGeometry(0.2, 0), 'plain', rng.pick(['#9fb3bd', '#8aa1ad', '#b5c4c9']), -1.2 + i * 0.4, top + 0.07, rng.range(-0.25, 0.25), { sx: 2.1, sy: 0.45, ry: rng.range(-0.3, 0.3) });
    }
    B.box('plain', '#dfe9ea', 2.6, 0.05, 0.8, 0, top + 0.01, 0);
  } else if (kind === 'pottery') {
    for (let i = 0; i < 5; i += 1) pot(B, -1.1 + i * 0.55, top, rng.range(-0.15, 0.15), rng.range(0.55, 0.85));
  } else if (kind === 'fabric') {
    for (let i = 0; i < 6; i += 1) {
      B.cyl('cloth', rng.pick(PALETTE.fabrics), 0.14, 0.14, 1.0, -1.15 + i * 0.46, top + 0.15, 0, { rx: Math.PI / 2 }, 8);
    }
  } else {
    for (let i = 0; i < 6; i += 1) {
      const c = rng.pick(['#d4572a', '#e3b230', '#8a4f2a', '#b33a2a', '#6f7d2e', '#e8d9a0']);
      B.cyl('wood', '#a0754a', 0.2, 0.15, 0.12, -1.15 + i * 0.46, top + 0.06, 0, {}, 8);
      B.put(new THREE.ConeGeometry(0.17, 0.2, 8), 'plain', c, -1.15 + i * 0.46, top + 0.22, 0);
    }
  }
}

function buildMarket(B) {
  const rng = B.rng;
  const rows = [{ z: -21.5, face: 0 }, { z: -32.5, face: Math.PI }];
  let k = 0;
  for (const row of rows) {
    for (let i = 0; i < 5; i += 1) {
      const sx = -12 + i * 6 + rng.range(-0.4, 0.4);
      const g = terrainHeight(sx, row.z);
      // stall faces the aisle (z = -27); local +z points toward the aisle
      const ry = row.face === 0 ? Math.PI : 0;
      B.at(sx, 0, row.z, ry);
      const fabric = PALETTE.fabrics[(k * 3) % PALETTE.fabrics.length];
      for (const [px, pz] of [[-1.55, -0.95], [1.55, -0.95], [-1.55, 0.95], [1.55, 0.95]]) {
        const h = pz > 0 ? 2.2 : 2.7;
        B.box('wood', PALETTE.woodDark, 0.13, h, 0.13, px, g + h / 2, pz, {}, 1);
      }
      B.box('cloth', fabric, 3.5, 0.05, 2.5, 0, g + 2.5, 0, { rx: 0.22 }, 1);
      B.box('cloth', fabric, 3.5, 0.32, 0.03, 0, g + 2.12, 1.26, {}, 1);
      B.box('wood', PALETTE.woodMid, 3.0, 0.9, 1.0, 0, g + 0.45, 0.35, {}, 1);
      B.box('wood', PALETTE.woodLight, 3.15, 0.06, 1.12, 0, g + 0.92, 0.35, {}, 1);
      B.colBox(1.55, 0.48, 0.55, 0, g + 0.48, 0.35);
      B.colBox(1.6, 1.2, 0.15, 0, g + 1.2, -0.95);
      B.box('cloth', '#e8dcc0', 3.2, 2.1, 0.04, 0, g + 1.05, -1.0, {}, 1);
      B.at(sx, 0, row.z, ry);
      stallGoods(B, GOODS[k % GOODS.length], g);
      // crates/sacks behind and beside
      crate(B, -1.9, g, -0.6, 0.7, rng.range(-0.3, 0.3));
      if (rng() < 0.6) sack(B, 1.95, g, -0.4, rng.pick(['#cdb58a', '#b9a074', '#d8c39a']));
      if (rng() < 0.5) amphora(B, 2.0, g, 0.6, 0.8);
      B.colBox(0.4, 0.4, 0.4, -1.9, g + 0.4, -0.6);
      k += 1;
    }
  }
  // notice board at the square side entrance
  const g = terrainHeight(0, -15.6);
  B.at(0, 0, -15.6, 0);
  B.box('wood', PALETTE.woodDark, 0.14, 2.2, 0.14, -0.8, g + 1.1, 0, {}, 1);
  B.box('wood', PALETTE.woodDark, 0.14, 2.2, 0.14, 0.8, g + 1.1, 0, {}, 1);
  B.box('wood', PALETTE.woodLight, 1.9, 1.0, 0.08, 0, g + 1.6, 0.02, {}, 1);
  B.box('plain', '#efe4c8', 0.7, 0.5, 0.02, -0.4, g + 1.65, 0.08);
  B.box('plain', '#e9d7b0', 0.6, 0.6, 0.02, 0.45, g + 1.55, 0.08);
  B.colBox(1, 1.1, 0.12, 0, g + 1.1, 0);
}

function buildWorkshop(B) {
  const x = -30;
  const z = 15;
  const ry = 2.04; // open front faces the square
  const w = 9;
  const d = 6.5;
  const { min, max } = groundMinMax(x, z, w / 2 + 1, d / 2 + 1, ry);
  const g = max;
  const base = min - 0.3;
  const h = 3.4;
  const tint = '#e2cfa8';
  B.at(x, 0, z, ry);
  // floor slab, back + side walls, open front with posts
  B.box('wood', '#a77b4c', w, 0.12, d, 0, g + 0.06, 0, {}, 1);
  B.box('stone', PALETTE.plinth, w + 0.3, g - base + 0.1, d + 0.3, 0, base + (g - base + 0.1) / 2, 0);
  B.box('stone', tint, w, h, 0.45, 0, g + h / 2, -d / 2 + 0.22);
  B.box('stone', tint, 0.45, h, d, -w / 2 + 0.22, g + h / 2, 0);
  B.box('stone', tint, 0.45, h, d, w / 2 - 0.22, g + h / 2, 0);
  B.colBox(w / 2, h / 2, 0.23, 0, g + h / 2, -d / 2 + 0.22);
  B.colBox(0.23, h / 2, d / 2, -w / 2 + 0.22, g + h / 2, 0);
  B.colBox(0.23, h / 2, d / 2, w / 2 - 0.22, g + h / 2, 0);
  for (const px of [-w / 2 + 0.3, -1.5, 1.5, w / 2 - 0.3]) {
    B.box('wood', PALETTE.woodDark, 0.22, h + 0.3, 0.22, px, g + (h + 0.3) / 2, d / 2 + 0.6, {}, 1);
    B.colBox(0.11, (h + 0.3) / 2, 0.11, px, g + (h + 0.3) / 2, d / 2 + 0.6);
  }
  // timber lean-to roof
  B.box('wood', '#8d5f37', w + 1, 0.16, d + 1.6, 0, g + h + 0.35, 0.4, { rx: -0.1 }, 1);
  B.colBox((w + 1) / 2, 0.1, (d + 1.6) / 2, 0, g + h + 0.35, 0.4, { rx: -0.1 });
  for (let i = 0; i < 6; i += 1) {
    B.cyl('wood', PALETTE.woodDark, 0.08, 0.08, d + 2.2, -w / 2 + 0.3 + i * ((w - 0.6) / 5), g + h + 0.2, 0.4, { rx: Math.PI / 2 - 0.1 }, 6);
  }
  // workbench + tools
  B.box('wood', PALETTE.woodLight, 3.2, 0.16, 1.1, -1.4, g + 0.95, -1.4, {}, 1);
  for (const [px, pz] of [[-2.85, -1.85], [0.05, -1.85], [-2.85, -0.95], [0.05, -0.95]]) {
    B.box('wood', PALETTE.woodDark, 0.14, 0.9, 0.14, px, g + 0.45, pz, {}, 1);
  }
  B.colBox(1.6, 0.5, 0.55, -1.4, g + 0.5, -1.4);
  B.box('plain', '#8f9aa0', 0.7, 0.03, 0.18, -2.1, g + 1.05, -1.2, { ry: 0.3 });
  B.box('wood', PALETTE.woodDark, 0.25, 0.06, 0.08, -1.7, g + 1.06, -1.25, { ry: 0.3 });
  B.box('plain', '#8f9aa0', 0.2, 0.06, 0.1, -0.6, g + 1.06, -1.5);
  B.cyl('wood', PALETTE.woodDark, 0.04, 0.04, 0.35, -0.6, g + 1.06, -1.38, { rx: Math.PI / 2 }, 5);
  // wood shavings
  for (let i = 0; i < 12; i += 1) {
    B.put(new THREE.IcosahedronGeometry(0.08, 0), 'plain', '#e9c98f', B.rng.range(-3, 0), g + 0.14, B.rng.range(-2, -0.4), { sy: 0.4 });
  }
  // tool rack on the back wall
  B.box('wood', PALETTE.woodMid, 2.6, 0.12, 0.1, 2, g + 2.1, -d / 2 + 0.5, {}, 1);
  for (let i = 0; i < 4; i += 1) B.box('plain', i % 2 ? '#8f9aa0' : PALETTE.woodDark, 0.1, 0.6, 0.04, 1.1 + i * 0.6, g + 1.75, -d / 2 + 0.52);
  // half-built table, stacked planks, sawhorses, logs, wheel
  B.box('wood', PALETTE.woodLight, 1.6, 0.1, 0.9, 2.2, g + 0.8, 0.6, {}, 1);
  for (const [px, pz] of [[1.55, 0.25], [2.85, 0.25], [1.55, 0.95]]) B.box('wood', PALETTE.woodLight, 0.1, 0.75, 0.1, px, g + 0.4, pz, {}, 1);
  B.box('wood', PALETTE.woodLight, 0.1, 0.75, 0.1, 3.05, g + 0.08, 1.1, { rz: Math.PI / 2 }, 1);
  B.colBox(0.85, 0.45, 0.5, 2.2, g + 0.45, 0.6);
  for (let i = 0; i < 5; i += 1) {
    B.box('wood', B.rng.pick([PALETTE.woodLight, PALETTE.woodMid]), 2.4, 0.08, 0.3, w / 2 + 1.3, g + 0.05 + i * 0.09, -1 + (i % 2) * 0.05, { ry: Math.PI / 2 }, 1);
  }
  B.colBox(0.2, 0.25, 1.2, w / 2 + 1.3, g + 0.25, -1);
  for (let i = 0; i < 4; i += 1) {
    B.cyl('wood', '#7a5a3a', 0.22, 0.22, 2.2, w / 2 + 1.5 + (i % 2) * 0.45, g + 0.22 + Math.floor(i / 2) * 0.4, 2.2, { rx: Math.PI / 2 }, 8);
  }
  B.colBox(0.6, 0.4, 1.1, w / 2 + 1.7, g + 0.4, 2.2);
  B.put(new THREE.TorusGeometry(0.6, 0.07, 6, 14), 'wood', PALETTE.woodMid, -w / 2 - 0.4, g + 0.62, 1.2, { ry: Math.PI / 2, rz: 0.2 });
  // sign board on the front posts
  B.box('wood', PALETTE.woodDark, 0.12, 0.9, 0.12, -w / 2 - 0.8, g + 0.45, d / 2 + 0.9, {}, 1);
  B.footprints.push({ x, z, w, d, ry, kind: 'workshop' });
  const sign = B.world(-w / 2 - 0.8, 0, d / 2 + 0.9);
  return { x, z, ry, g, w, d, sign: { x: sign.x, z: sign.z, y: g + 0.9, ry } };
}

function buildSynagogue(B) {
  const x = 29;
  const z = 22;
  const ry = -2.21; // portico faces the square
  const w = 15;
  const d = 11;
  const { min, max } = groundMinMax(x, z, w / 2 + 2, d / 2 + 3, ry);
  const g = max + 0.6;
  const base = min - 0.3;
  const h = 6.2;
  B.at(x, 0, z, ry);
  B.box('stone', '#efe5cf', w, g - base + h, d, 0, base + (g - base + h) / 2, 0);
  B.colBox(w / 2, (g - base + h) / 2, d / 2, 0, base + (g - base + h) / 2, 0);
  B.box('stone', '#e2d3b2', w + 0.6, 0.5, d + 0.6, 0, g + h + 0.25, 0);
  B.box('stone', '#d8c7a2', w + 0.3, 0.6, d + 0.3, 0, g + 0.3, 0);
  // portico: platform, steps, columns, entablature
  const pd = 3.4;
  B.box('stone', '#e4d6b8', w, g - base, pd, 0, base + (g - base) / 2, d / 2 + pd / 2);
  B.colBox(w / 2, (g - base) / 2, pd / 2, 0, base + (g - base) / 2, d / 2 + pd / 2);
  const stepH = (g - (g - 0.6)) / 3;
  for (let i = 0; i < 3; i += 1) {
    const sh = g - 0.6 + stepH * i - base + stepH;
    B.box('stone', '#d9c8a6', w - 2, sh, 0.45, 0, base + sh / 2, d / 2 + pd + 0.22 + (2 - i) * 0.45);
    B.colBox((w - 2) / 2, sh / 2, 0.22, 0, base + sh / 2, d / 2 + pd + 0.22 + (2 - i) * 0.45);
  }
  for (let i = 0; i < 6; i += 1) {
    const cx = -w / 2 + 1 + i * ((w - 2) / 5);
    B.cyl('stone', '#f2ead8', 0.32, 0.36, h, cx, g + h / 2, d / 2 + pd - 0.5, {}, 12);
    B.box('stone', '#e2d3b2', 0.9, 0.25, 0.9, cx, g + 0.12, d / 2 + pd - 0.5);
    B.box('stone', '#e2d3b2', 0.85, 0.25, 0.85, cx, g + h - 0.12, d / 2 + pd - 0.5);
    B.colCyl(0.36, h / 2, cx, g + h / 2, d / 2 + pd - 0.5);
  }
  B.box('stone', '#e8dcc2', w + 0.2, 0.7, pd + 0.4, 0, g + h + 0.35, d / 2 + pd / 2 - 0.1);
  B.box('wood', PALETTE.woodDark, 2.2, 3.4, 0.15, 0, g + 1.7, d / 2 + 0.05, {}, 1);
  B.box('stone', '#d6c39d', 2.8, 0.4, 0.3, 0, g + 3.6, d / 2 + 0.1);
  for (const sx of [-4.5, 4.5]) {
    B.box('plain', PALETTE.dark, 0.9, 1.6, 0.08, sx, g + 2.6, d / 2 + 0.03);
    B.box('stone', '#d6c39d', 1.2, 0.2, 0.25, sx, g + 1.7, d / 2 + 0.1);
  }
  // cypress pair
  for (const sx of [-w / 2 - 1.8, w / 2 + 1.8]) {
    const p = B.world(sx, 0, d / 2 + 1);
    B.put(cypressGeometry(B.rng), 'foliage', null, sx, terrainHeight(p.x, p.z), d / 2 + 1);
    B.colCyl(0.4, 2, sx, terrainHeight(p.x, p.z) + 2, d / 2 + 1);
  }
  B.footprints.push({ x, z, w, d: d + pd, ry, kind: 'synagogue' });
}

function buildWatchtower(B) {
  const { x, z } = LANDMARKS[6];
  const g = terrainHeight(x, z);
  B.at(x, 0, z, 0.4);
  const rng = B.rng;
  B.put(new THREE.CylinderGeometry(3.1, 3.5, 9, 14), 'stone', '#d4c19c', 0, g + 4.2, 0);
  B.colCyl(3.4, 4.6, 0, g + 4.2, 0);
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2;
    const hh = rng.range(0.3, 1.4);
    if (i === 3 || i === 7) continue;
    B.box('stone', '#d9c8a4', 1.3, hh, 0.7, Math.cos(a) * 2.75, g + 8.7 + hh / 2, Math.sin(a) * 2.75, { ry: -a + Math.PI / 2 });
  }
  B.box('plain', PALETTE.dark, 1.3, 2.4, 0.3, 0, g + 1.2, 3.25);
  B.box('stone', '#cbb690', 1.9, 0.35, 0.5, 0, g + 2.55, 3.35);
  for (let i = 0; i < 14; i += 1) {
    const a = rng() * Math.PI * 2;
    const r = rng.range(3.8, 7);
    const px = Math.cos(a) * r;
    const pz = Math.sin(a) * r;
    const s = rng.range(0.35, 0.8);
    const p = B.world(px, 0, pz);
    B.rbox('stone', rng.pick(['#d2bf98', '#c4ae86', '#dbc9a5']), s * 1.4, s, s, px, terrainHeight(p.x, p.z) + s / 2 - 0.1, pz, { ry: rng() * 3, rz: rng.range(-0.2, 0.2) }, 0.1);
  }
  B.at(0, 0, 0, 0);
  const pg = terrainHeight(-76, -58.5);
  B.box('stone', '#cbb690', 1.2, 0.9, 0.3, -76, pg + 0.45, -58.5, { ry: 0.6 });
  B.colBox(0.6, 0.45, 0.15, -76, pg + 0.45, -58.5, { ry: 0.6 });
  B.footprints.push({ x, z, w: 7, d: 7, ry: 0, kind: 'tower', round: true });
}

function buildGrove(B) {
  const rng = B.rng;
  const cx = 64;
  const cz = 46;
  B.at(0, 0, 0, 0);
  for (let r = 0; r < 5; r += 1) {
    for (let c = 0; c < 6; c += 1) {
      const px = cx - 15 + c * 6 + rng.range(-0.8, 0.8);
      const pz = cz - 12 + r * 6 + rng.range(-0.8, 0.8);
      if (Math.hypot(px - 66, pz - 49) < 4.5) continue;
      const g = terrainHeight(px, pz);
      B.put(oliveTreeGeometry(rng, rng.range(0.95, 1.25)), 'foliage', null, px, g - 0.05, pz, { ry: rng() * 6 });
      B.colCyl(0.35, 1, px, g + 1, pz);
    }
  }
  // dry-stone boundary walls with a gap on the lane side
  const wall = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.ceil(len / 1.6);
    const ang = Math.atan2(x1 - x0, z1 - z0);
    for (let i = 0; i < n; i += 1) {
      const t = (i + 0.5) / n;
      const px = x0 + (x1 - x0) * t;
      const pz = z0 + (z1 - z0) * t;
      const g = terrainHeight(px, pz);
      const hh = rng.range(0.7, 0.95);
      B.rbox('stone', rng.pick(['#cdb995', '#c2ac86', '#d6c4a0']), 0.7, hh, 1.7, px, g + hh / 2 - 0.1, pz, { ry: ang + rng.range(-0.05, 0.05) }, 0.12);
    }
    const g = terrainHeight((x0 + x1) / 2, (z0 + z1) / 2);
    euler.set(0, ang, 0);
    quat.setFromEuler(euler);
    B.colliders.push({ shape: 'box', hx: 0.35, hy: 0.6, hz: len / 2, x: (x0 + x1) / 2, y: g + 0.4, z: (z0 + z1) / 2, q: { x: quat.x, y: quat.y, z: quat.z, w: quat.w } });
  };
  wall(cx - 19, cz - 16, cx + 19, cz - 16);
  wall(cx + 19, cz - 16, cx + 19, cz + 16);
  wall(cx + 19, cz + 16, cx - 19, cz + 16);
  wall(cx - 19, cz + 16, cx - 19, cz + 2);
  wall(cx - 19, cz - 7, cx - 19, cz - 16);
  // olive press
  const px = 66;
  const pz = 49;
  const g = terrainHeight(px, pz);
  B.put(new THREE.CylinderGeometry(1.7, 1.85, 0.8, 16), 'stone', '#cdbb98', px, g + 0.4, pz);
  B.put(new THREE.CylinderGeometry(1.35, 1.35, 0.06, 16), 'plain', '#5f6b2e', px, g + 0.81, pz);
  B.put(new THREE.CylinderGeometry(0.85, 0.85, 0.5, 14), 'stone', '#d8c8a6', px + 0.5, g + 1.62, pz, { rx: Math.PI / 2 });
  B.cyl('wood', PALETTE.woodDark, 0.14, 0.14, 0.9, px, g + 1.3, pz, {}, 6);
  B.cyl('wood', PALETTE.woodMid, 0.09, 0.09, 4, px, g + 1.62, pz, { rz: Math.PI / 2 }, 6);
  B.colCyl(1.85, 0.8, px, g + 0.8, pz);
  basket(B, px - 2.6, g, pz + 0.4, '#4d5a25');
  basket(B, px - 2.2, g, pz + 1.3, '#3f4a1f');
  amphora(B, px + 2.6, g, pz - 0.5, 1);
  amphora(B, px + 2.9, g, pz + 0.3, 0.9);
}

// ---------------------------------------------------------------- village

function reserved(x, z, r) {
  if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.r + r + 1.5) return true;
  if (x > MARKET.x0 - r - 2 && x < MARKET.x1 + r + 2 && z > MARKET.z0 - r - 1.5 && z < MARKET.z1 + r + 1.5) return true;
  if (roadDistance(x, z) < r + 0.6) return true;
  const zones = [
    [-30, 15, 9.5], [29, 22, 13], [-29, -47, 8], [64, 46, 22], [-80, -62, 12],
  ];
  for (const [zx, zz, zr] of zones) if (Math.hypot(x - zx, z - zz) < zr + r) return true;
  return false;
}

export function buildNazareth(batcher, rng) {
  const B = new Builder(batcher, rng);
  buildWell(B);
  buildSquare(B);
  buildMarket(B);
  const workshop = buildWorkshop(B);
  buildSynagogue(B);
  buildWatchtower(B);
  buildGrove(B);

  // lookout: the tallest house, with stairs to its roof
  buildHouse(B, { x: -29, z: -47, ry: 0.15, w: 7.5, d: 10, h: 7.2, stairs: true, tint: '#f1e6cc', kind: 'lookout', doorX: -1.5 });

  // organic village: rejection-sample houses on rings, doors facing the square
  const placed = [];
  let attempts = 0;
  while (placed.length < 54 && attempts < 4000) {
    attempts += 1;
    const ring = rng() < 0.55 ? rng.range(17, 40) : rng.range(40, 62);
    const a = rng() * Math.PI * 2;
    const x = Math.cos(a) * ring;
    const z = Math.sin(a) * ring;
    const w = rng.range(5, 8.5);
    const d = rng.range(4.8, 7.2);
    const r = Math.hypot(w, d) / 2;
    if (reserved(x, z, r)) continue;
    let ok = true;
    for (const p of placed) {
      if (Math.hypot(p.x - x, p.z - z) < p.r + r + rng.range(1.4, 2.6)) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    // door faces the nearest road; fall back to facing the square
    const toCenter = Math.atan2(-x, -z);
    const ry = toCenter + rng.range(-0.25, 0.25);
    const twoStory = rng() < 0.22;
    const h = twoStory ? rng.range(6, 6.8) : rng.range(3.1, 3.8);
    placed.push({ x, z, r });
    buildHouse(B, { x, z, ry, w, d, h, stairs: !twoStory && rng() < 0.45 });
  }

  // village greenery: palms and olives in gaps
  let trees = 0;
  attempts = 0;
  while (trees < 38 && attempts < 3000) {
    attempts += 1;
    const ring = rng.range(14, 66);
    const a = rng() * Math.PI * 2;
    const x = Math.cos(a) * ring;
    const z = Math.sin(a) * ring;
    if (reserved(x, z, 1.2)) continue;
    if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + 1.6)) continue;
    const g = terrainHeight(x, z);
    B.at(0, 0, 0, 0);
    if (rng() < 0.45) {
      B.put(palmTreeGeometry(rng, rng.range(6, 8.5)), 'foliage', null, x, g - 0.1, z);
      B.colCyl(0.3, 2, x, g + 2, z);
    } else {
      B.put(oliveTreeGeometry(rng, rng.range(0.9, 1.3)), 'foliage', null, x, g - 0.05, z, { ry: rng() * 6 });
      B.colCyl(0.35, 1, x, g + 1, z);
    }
    placed.push({ x, z, r: 1 });
    trees += 1;
  }

  return { colliders: B.colliders, footprints: B.footprints, workshop, houses: placed };
}
