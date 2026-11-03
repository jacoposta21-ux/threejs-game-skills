// Procedural low-poly models for Mildew Hollow. Same muted autumn palette as the old pixel art.
// Every builder returns a Kit result ({ base, glow } geometries) authored around the footprint's
// bottom-centre, 1 unit = 1 tile, facing +Z (south, towards the camera).
import * as THREE from 'three';
import { Kit, voxelize } from './kit.js';
import { PAL, shade, Art } from '../art.js';

export const ROOFS = { plum: '#6e4a63', teal: '#3f6b6b', brown: '#6b4a32', navy: '#3a4766', red: '#9c4a3a', orange: '#b5683a', farm: '#8c5136', store: '#5d7a4a', hall: '#5a5f6e' };
export const WALLS = { cream: '#dccaa2', grey: '#a9a49a', brick: '#a65f48', plank: '#9a6f4a' };

// ------------------------------------------------------------------ shared materials
export const MAT = {
  base: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0, flatShading: true }),
  // windows, lanterns, embers: glass by day, warm glow by night (renderer drives emissiveIntensity)
  glow: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0, emissive: new THREE.Color('#ffc35a'), emissiveIntensity: 0 }),
  // a gnomed villager's house stays dark
  glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0 }),
  // always-on embers (stoves, kilns, ovens)
  ember: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, emissive: new THREE.Color('#ff8a2a'), emissiveIntensity: 0.9 }),
  hood: new THREE.MeshStandardMaterial({ color: '#17101e', roughness: 0.95, flatShading: true }),
  eyes: new THREE.MeshBasicMaterial({ color: '#ffe27a' }),
  shadow: new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.28, depthWrite: false }),
};
// buildings standing between the camera and the player fade to this
MAT.fade = MAT.base.clone(); MAT.fade.transparent = true; MAT.fade.opacity = 0.28; MAT.fade.depthWrite = false;
MAT.glowFade = MAT.glow.clone(); MAT.glowFade.transparent = true; MAT.glowFade.opacity = 0.28; MAT.glowFade.depthWrite = false;

export function meshOf(res, { glowMat = MAT.glow, cast = true, receive = true } = {}) {
  const g = new THREE.Group();
  if (res.base) { const m = new THREE.Mesh(res.base, MAT.base); m.castShadow = cast; m.receiveShadow = receive; g.add(m); }
  if (res.glow) { const m = new THREE.Mesh(res.glow, glowMat); m.castShadow = false; m.receiveShadow = false; m.userData.glow = true; g.add(m); }
  return g;
}

const cache = new Map();
function cached(key, fn) { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); }

// ------------------------------------------------------------------ buildings
export function buildingModel(def) {
  const k = new Kit();
  const W = def.w, D = def.h, style = def.style;
  const big = style === 'store' || style === 'hall';
  const Hw = big ? 2.3 : 1.9;
  const roofCol = ROOFS[def.roof || style] || ROOFS.red;
  let wallCol = WALLS[def.walls || 'cream'];
  if (style === 'farmhouse') wallCol = WALLS.plank;
  if (style === 'store') wallCol = WALLS.cream;
  if (style === 'hall') wallCol = '#b6b0a2';
  const ww = W - 0.3, wd = D - 0.9;          // wall box (front face sits 0.35 inside the door row)
  const fz = D / 2 - 0.35, bz = fz - wd;     // front / back face z
  const cz = (fz + bz) / 2;
  const trim = shade(wallCol, -0.35);

  // foundation + walls
  k.box(ww + 0.12, 0.18, wd + 0.12, 0, 0, cz, style === 'hall' ? PAL.stoneL : '#6f675c');
  k.box(ww, Hw, wd, 0, 0.12, cz, wallCol, { jitter: 0.03 });
  k.box(ww + 0.04, 0.1, wd + 0.04, 0, Hw + 0.02, cz, trim);
  if (style === 'farmhouse' || def.walls === 'plank') for (let y = 0.4; y < Hw; y += 0.28) k.box(ww + 0.02, 0.03, wd + 0.02, 0, y, cz, shade(wallCol, -0.18));
  if (def.walls === 'brick') for (let y = 0.35; y < Hw; y += 0.22) k.box(ww + 0.02, 0.025, wd + 0.02, 0, y, cz, shade(wallCol, -0.16));
  // corner posts
  for (const sx of [-1, 1]) for (const sz of [fz, bz]) k.box(0.14, Hw + 0.05, 0.14, sx * (ww / 2), 0.1, sz, style === 'hall' ? PAL.stoneL : shade(wallCol, -0.3));

  // gable roof, ridge along X
  const RH = big ? 1.5 : 1.35;
  const hd = wd / 2 + 0.4;
  k.prism(wd, RH - 0.06, ww, 0, Hw + 0.1, cz, wallCol, { rot: [0, Math.PI / 2, 0] }); // gable walls
  const a = Math.atan2(RH, hd), L = Math.hypot(hd, RH) + 0.12;
  for (const s of [1, -1]) {
    k.box(W + 0.3, 0.12, L, 0, 0, 0, roofCol, { rot: [s * a, 0, 0] });
    // reposition the slab we just added: centre of the slope
    const g = k.parts.base.pop();
    g.translate(0, Hw + 0.1 + RH / 2 - 0.06, cz + s * hd / 2);
    k.parts.base.push(g);
    // shingle courses
    for (let i = 1; i < 4; i++) {
      const t = i / 4;
      k.box(W + 0.32, 0.03, 0.06, 0, 0, 0, shade(roofCol, -0.22), { rot: [s * a, 0, 0] });
      const sg = k.parts.base.pop();
      sg.translate(0, Hw + 0.1 + RH * (1 - t) + 0.02, cz + s * hd * t);
      k.parts.base.push(sg);
    }
  }
  k.box(W + 0.36, 0.12, 0.2, 0, Hw + 0.1 + RH - 0.06, cz, shade(roofCol, 0.2)); // ridge cap
  if (style === 'farmhouse') { k.box(0.8, 0.05, 0.5, 0.6, 0, 0, '#7a6a52', { rot: [a, 0, 0] }); const g = k.parts.base.pop(); g.translate(0.6, Hw + 0.1 + RH * 0.45, cz + hd * 0.55); k.parts.base.push(g); }
  if (style !== 'hall') { // chimney
    k.box(0.42, RH + 0.6, 0.42, W / 2 - 1.1, Hw + 0.2, cz - 0.4, '#7a4a3a');
    k.box(0.5, 0.1, 0.5, W / 2 - 1.1, Hw + RH + 0.8, cz - 0.4, '#5a3428');
  }

  // door
  const dx = -W / 2 + def.door + 0.5;
  const dw = style === 'hall' ? 0.95 : 0.66;
  const doorCol = style === 'store' ? '#5d7a4a' : style === 'hall' ? '#6a4229' : '#7a4a30';
  k.box(dw + 0.16, 1.32, 0.08, dx, 0.12, fz + 0.02, trim);
  k.box(dw, 1.22, 0.08, dx, 0.12, fz + 0.05, doorCol);
  k.box(dw - 0.1, 0.04, 0.02, dx, 1.0, fz + 0.1, '#a8744a');
  if (style === 'hall') k.box(0.03, 1.22, 0.02, dx, 0.12, fz + 0.1, PAL.woodXD);
  k.ball(0.04, dx + dw / 2 - 0.12, 0.72, fz + 0.11, PAL.yellow, { detail: 0 });
  k.box(dw + 0.5, 0.08, 0.5, dx, 0, fz + 0.3, style === 'hall' ? PAL.stoneL : PAL.stoneD); // step

  // front windows (same column rules as the 2D facades)
  const winY = Hw * 0.5;
  const cols = [];
  for (let col = 0; col < W; col++) {
    if (col === def.door) continue;
    if (style === 'house' && col !== 1 && col !== W - 2) continue;
    if (style === 'farmhouse' && col !== 1 && col !== 5) continue;
    if (big && (col === 0 || col === W - 1)) continue;
    if (style === 'store' && col % 2 === 0 && col !== 2) continue;
    if (style === 'hall' && col % 2 === 1) continue;
    cols.push(col);
  }
  const win = (x, z, rotY = 0) => {
    const o = { rot: [0, rotY, 0] };
    const off = (v) => (rotY ? [z, x + v] : [x, z + v]);
    const at = (dv) => { const [px, pz] = rotY ? [x + dv, z] : [x, z + dv]; return [px, pz]; };
    let [px, pz] = at(0.03);
    k.box(0.7, 0.72, 0.06, px, winY - 0.36, pz, trim, o);
    [px, pz] = at(0.06);
    k.box(0.56, 0.58, 0.04, px, winY - 0.29, pz, PAL.glassL, { ...o, glow: true });
    [px, pz] = at(0.09);
    k.box(0.04, 0.58, 0.02, px, winY - 0.29, pz, trim, o);
    k.box(0.56, 0.04, 0.02, px, winY - 0.02, pz, trim, o);
    [px, pz] = at(0.1);
    k.box(0.82, 0.06, 0.12, px, winY - 0.42, pz, shade(wallCol, -0.25), o);
    if (style === 'house' || style === 'farmhouse') { // flower box
      [px, pz] = at(0.16);
      k.box(0.64, 0.12, 0.12, px, winY - 0.52, pz, PAL.woodD, o);
      for (let i = -1; i <= 1; i++) k.ball(0.07, rotY ? px + 0.02 : px + i * 0.2, winY - 0.36, rotY ? pz + i * 0.2 : pz + 0.02, [PAL.leafR, PAL.leafO, PAL.yellow][i + 1], { detail: 0 });
    }
    void off;
  };
  for (const col of cols) win(-W / 2 + col + 0.5, fz);
  // side windows so the buildings read from any angle
  for (const s of [-1, 1]) {
    const x = s * (ww / 2);
    const k2 = s > 0 ? 0.03 : -0.03;
    k.box(0.06, 0.62, 0.6, x + k2, winY - 0.31, cz, trim);
    k.box(0.04, 0.5, 0.48, x + k2 * 2, winY - 0.25, cz, PAL.glassL, { glow: true });
  }

  if (style === 'store') { // striped awning + coin-sack sign
    const n = Math.round(ww / 0.5);
    for (let i = 0; i < n; i++) {
      const x = -ww / 2 + (i + 0.5) * (ww / n);
      k.box(ww / n + 0.01, 0.06, 0.7, 0, 0, 0, i % 2 ? PAL.cream : PAL.red, { rot: [0.45, 0, 0] });
      const g = k.parts.base.pop(); g.translate(x, Hw - 0.35, fz + 0.32); k.parts.base.push(g);
      k.cone(0.06, 0.12, x, Hw - 0.68, fz + 0.64, i % 2 ? PAL.cream : PAL.red, { rot: [Math.PI, 0, 0], seg: 4 });
    }
    k.box(1.4, 0.62, 0.08, 0, Hw + 0.3, fz + 0.08, PAL.woodD);
    k.box(1.28, 0.5, 0.06, 0, Hw + 0.36, fz + 0.12, PAL.cream);
    k.ball(0.16, 0, Hw + 0.6, fz + 0.16, '#b08a5a', { detail: 0, scale: [1, 0.9, 0.5] });
    for (const x of [-0.42, 0.42]) k.cyl(0.08, 0.08, 0.04, x, Hw + 0.5, fz + 0.16, PAL.yellow, { rot: [Math.PI / 2, 0, 0] });
    for (const x of [-ww / 2 + 0.6, ww / 2 - 0.6]) { k.box(0.5, 0.42, 0.5, x, 0.12, fz + 0.45, PAL.woodD); k.ball(0.14, x - 0.1, 0.62, fz + 0.45, PAL.pumpkin); k.ball(0.12, x + 0.12, 0.6, fz + 0.4, PAL.turnip); }
  }
  if (style === 'hall') { // columns, pediment with clock, flag on the ridge
    for (let x = -ww / 2 + 0.7; x < ww / 2 - 0.4; x += 1.6) {
      if (Math.abs(x - dx) < 0.7) continue;
      k.cyl(0.13, 0.15, Hw - 0.1, x, 0.18, fz + 0.2, PAL.stoneL, { seg: 10 });
      k.box(0.36, 0.1, 0.36, x, Hw - 0.0, fz + 0.2, PAL.stone);
    }
    k.box(ww + 0.3, 0.14, 0.6, 0, Hw + 0.02, fz + 0.12, PAL.stoneL);
    k.prism(2.6, 0.9, 0.3, dx, Hw + 0.12, fz + 0.2, PAL.stoneL);
    k.cyl(0.32, 0.32, 0.06, dx, Hw + 0.48, fz + 0.36, PAL.cream, { rot: [Math.PI / 2, 0, 0], seg: 16 });
    k.box(0.03, 0.2, 0.02, dx, Hw + 0.48, fz + 0.4, PAL.ink); k.box(0.16, 0.03, 0.02, dx + 0.07, Hw + 0.48, fz + 0.4, PAL.ink);
    k.box(ww + 0.6, 0.12, 1.0, 0, 0, fz + 0.45, PAL.stoneL);
    k.cyl(0.03, 0.03, 1.4, W / 2 - 1.2, Hw + RH, cz, PAL.ink);
    k.box(0.7, 0.4, 0.03, W / 2 - 0.84, Hw + RH + 0.95, cz, PAL.orange);
    k.box(0.7, 0.07, 0.035, W / 2 - 0.84, Hw + RH + 1.1, cz, PAL.yellow);
  }
  if (style === 'farmhouse') { // porch
    k.box(3.0, 0.14, 0.9, dx, 0, fz + 0.45, PAL.woodD);
    for (let x = -1.3; x <= 1.3; x += 0.35) k.box(0.3, 0.02, 0.9, dx + x, 0.14, fz + 0.45, PAL.wood);
    for (const s of [-1.4, 1.4]) k.box(0.1, Hw - 0.2, 0.1, dx + s, 0.14, fz + 0.82, PAL.woodD);
    k.box(3.1, 0.1, 1.0, dx, Hw - 0.12, fz + 0.45, ROOFS.farm);
  }
  return k.build();
}

// ------------------------------------------------------------------ nature
const TREE_COLS = [[PAL.leafO, '#a75a24', '#e6a052'], [PAL.leafR, '#7f3424', '#cf6a4a'], [PAL.leafY, '#a87c2a', '#ecc56a'], [PAL.leafG, '#4f5c28', '#8c9a4c']];
export function treeModel(v) {
  return cached(`tree${v}`, () => {
    const k = new Kit();
    const [main, dark, light] = TREE_COLS[v];
    k.cyl(0.1, 0.17, 1.25, 0, 0, 0, PAL.trunk, { seg: 6 });
    k.cyl(0.05, 0.06, 0.5, 0.18, 0.75, 0, PAL.trunk, { seg: 5, rot: [0, 0, -0.8] });
    k.ball(0.68, 0, 1.55, 0, dark, { detail: 0 });
    k.ball(0.62, 0.22, 1.8, 0.12, main, { detail: 0 });
    k.ball(0.48, -0.32, 1.7, 0.2, main, { detail: 0 });
    k.ball(0.38, 0.05, 2.25, 0.05, light, { detail: 0 });
    k.ball(0.3, 0.36, 1.45, 0.38, light, { detail: 0 });
    return k.build();
  });
}
export function bushModel() {
  return cached('bush', () => {
    const k = new Kit();
    k.ball(0.36, 0, 0.3, 0, '#5d6834', { detail: 0, scale: [1.2, 0.85, 1] });
    k.ball(0.26, 0.24, 0.42, 0.1, PAL.leafG, { detail: 0 });
    k.ball(0.22, -0.22, 0.36, 0.12, '#838d4a', { detail: 0 });
    k.ball(0.06, 0.1, 0.62, 0.22, PAL.leafR, { detail: 0 });
    k.ball(0.06, -0.18, 0.5, 0.3, PAL.leafR, { detail: 0 });
    return k.build();
  });
}
export function rockModel() {
  return cached('rock', () => {
    const k = new Kit();
    k.add(new THREE.DodecahedronGeometry(0.36, 0), PAL.stoneD, [0, 0.2, 0], [0.3, 0.5, 0], [1.2, 0.7, 1]);
    k.add(new THREE.DodecahedronGeometry(0.2, 0), PAL.stone, [0.3, 0.12, 0.15], [0.2, 0.1, 0.5], [1, 0.7, 1]);
    k.ball(0.1, -0.1, 0.42, 0.05, '#6c7a36', { detail: 0, scale: [1.6, 0.4, 1.2] }); // moss
    return k.build();
  });
}

// ------------------------------------------------------------------ crops & field
const SEED = '#3a2a1c';
function sproutKit(k, col = '#7d9a40', s = 1) {
  k.cyl(0.015, 0.02, 0.16 * s, 0, 0.04, 0, PAL.leafG, { seg: 4 });
  k.box(0.14 * s, 0.02, 0.07 * s, -0.07 * s, 0.17 * s, 0, col, { rot: [0, 0, 0.5] });
  k.box(0.14 * s, 0.02, 0.07 * s, 0.07 * s, 0.19 * s, 0, col, { rot: [0, 0, -0.5] });
}
function leaves(k, n, len, y, col, tilt = 0.7, seed = 0) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + seed;
    k.box(0.08, 0.025, len, 0, 0, 0, i % 2 ? col : shade(col, 0.15), { rot: [tilt, a, 0], order: 'YXZ' });
    const g = k.parts.base.pop();
    g.translate(Math.sin(a) * len * 0.4, y + len * 0.3, Math.cos(a) * len * 0.4);
    k.parts.base.push(g);
  }
}
export function cropModel(crop, stage) {
  return cached(`crop:${crop}:${stage}`, () => {
    const k = new Kit();
    const seeds = () => { for (const [x, z] of [[-0.15, 0.05], [0.1, -0.1], [0.15, 0.15]]) k.box(0.06, 0.04, 0.06, x, 0.04, z, SEED); };
    if (stage === 0) seeds();
    else if (crop === 'turnip') {
      if (stage === 1) sproutKit(k);
      else if (stage === 2) { leaves(k, 4, 0.32, 0.06, '#6f8f3a', 0.6); k.ball(0.09, 0, 0.08, 0, PAL.turnipP, { detail: 0 }); }
      else {
        k.sphere(0.2, 0, 0.16, 0, PAL.turnip, { scale: [1, 0.9, 1] });
        k.sphere(0.17, 0, 0.27, 0, PAL.turnipP, { scale: [1.12, 0.55, 1.12] });
        leaves(k, 5, 0.4, 0.3, '#6f8f3a', 0.45);
      }
    } else if (crop === 'garlic') {
      if (stage === 1) sproutKit(k, '#8fa45a');
      else {
        const ripe = stage === 3;
        for (let i = 0; i < 3; i++) k.cyl(0.015, 0.025, ripe ? 0.5 : 0.42, (i - 1) * 0.06, 0.08, (i % 2) * 0.04, '#7d9a40', { seg: 4, rot: [0, 0, (i - 1) * 0.25] });
        if (ripe) { k.sphere(0.17, 0, 0.13, 0, PAL.garlic, { scale: [1, 0.95, 1] }); k.cone(0.08, 0.14, 0, 0.24, 0, PAL.garlic, { seg: 8 }); k.box(0.02, 0.24, 0.02, 0, 0.04, 0.16, PAL.garlicD); }
        else k.sphere(0.1, 0, 0.07, 0, PAL.garlicD);
      }
    } else if (crop === 'pumpkin') {
      const vine = () => { k.box(0.8, 0.04, 0.05, 0, 0.02, 0.05, PAL.leafG, { rot: [0, 0.2, 0] }); leaves(k, 3, 0.26, 0.04, '#6f8f3a', 1.2, 0.4); };
      if (stage >= 1) vine();
      if (stage === 2) { k.cone(0.07, 0.1, 0, 0.12, 0, PAL.yellow, { rot: [Math.PI, 0, 0], seg: 5 }); }
      if (stage === 3) k.sphere(0.14, 0.05, 0.12, 0.05, PAL.pumpkinD, { scale: [1.1, 0.8, 1.1] });
      if (stage === 4) {
        k.sphere(0.33, 0, 0.26, 0, PAL.pumpkin, { seg: 12, scale: [1.12, 0.78, 1.05] });
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI; k.sphere(0.335, 0, 0.26, 0, PAL.pumpkinD, { seg: 12, scale: [0.12, 0.78, 1.06], rot: [0, a, 0] }); }
        k.cyl(0.04, 0.05, 0.16, 0, 0.5, 0, PAL.leafB, { seg: 5, rot: [0, 0, 0.3] });
      }
    } else if (crop === 'cranberry') {
      if (stage === 1) sproutKit(k, '#6f8f3a');
      else {
        k.ball(0.3, 0, 0.22, 0, '#4f6a2e', { detail: 0, scale: [1.1, 0.8, 1] });
        k.ball(0.2, 0.12, 0.38, 0.05, '#5f7f3a', { detail: 0 });
        if (stage === 3) for (let i = 0; i < 9; i++) { const a = i * 2.4; k.ball(0.055, Math.sin(a) * 0.27, 0.2 + (i % 3) * 0.1, Math.cos(a) * 0.25, '#b8283a', { detail: 0 }); }
      }
    }
    return k.build();
  });
}
export function debrisModel(kind) {
  return cached(`debris:${kind}`, () => {
    const k = new Kit();
    if (kind === 'weeds') for (let i = 0; i < 7; i++) { const a = i * 2.2; k.cone(0.04, 0.22 + (i % 3) * 0.08, Math.sin(a) * 0.22, 0, Math.cos(a) * 0.2, i % 2 ? '#7d8c3a' : '#5e6b2c', { seg: 4, rot: [Math.sin(a) * 0.3, 0, Math.cos(a) * 0.3] }); }
    else if (kind === 'twigs') {
      k.cyl(0.035, 0.04, 0.7, 0, 0.04, 0, PAL.trunk, { seg: 5, rot: [0, 0.4, Math.PI / 2] });
      k.cyl(0.03, 0.035, 0.5, 0.05, 0.08, 0.1, PAL.woodD, { seg: 5, rot: [Math.PI / 2, 0, 0.6] });
      k.cyl(0.02, 0.03, 0.3, -0.15, 0.1, -0.05, PAL.woodL, { seg: 5, rot: [0.3, 0, 1.2] });
      k.box(0.12, 0.02, 0.08, 0.2, 0.06, 0.1, PAL.leafB);
    } else {
      k.ball(0.3, 0, 0.22, 0, '#4f5a2c', { detail: 0, scale: [1.2, 0.8, 1] });
      k.ball(0.2, 0.15, 0.36, -0.05, '#5e6b33', { detail: 0 });
      for (let i = 0; i < 6; i++) { const a = i * 1.7; k.ball(0.04, Math.sin(a) * 0.3, 0.25 + (i % 2) * 0.1, Math.cos(a) * 0.26, i % 2 ? '#a9452f' : '#d7c39a', { detail: 0 }); }
    }
    return k.build();
  });
}

// ------------------------------------------------------------------ props (outdoor + furniture)
function bookRow(k, x0, x1, y, z, h, seed) {
  const cols = [PAL.red, PAL.teal, PAL.yellow, PAL.purple, PAL.green, PAL.cream, PAL.orange];
  let x = x0, i = seed;
  while (x < x1 - 0.06) {
    const w = 0.06 + ((i * 7) % 3) * 0.02;
    k.box(w - 0.01, h - ((i * 5) % 3) * 0.04, 0.22, x + w / 2, y, z, cols[i % cols.length]);
    x += w; i++;
  }
}

const PROPS = {
  bin(k) { k.box(0.86, 0.6, 0.76, 0, 0, 0, PAL.woodD); for (const y of [0.15, 0.4]) k.box(0.88, 0.05, 0.78, 0, y, 0, PAL.woodL); k.box(0.92, 0.1, 0.82, 0, 0.6, -0.02, PAL.wood, { rot: [-0.12, 0, 0] }); k.box(0.3, 0.06, 0.04, 0, 0.42, 0.4, PAL.yellow); },
  workbench(k) { k.box(1.8, 0.1, 0.7, 0, 0.62, 0, PAL.woodL); for (const x of [-0.8, 0.8]) for (const z of [-0.28, 0.28]) k.box(0.1, 0.62, 0.1, x, 0, z, PAL.woodD); k.box(1.7, 0.06, 0.6, 0, 0.2, 0, PAL.woodD); k.box(0.5, 0.04, 0.16, -0.4, 0.72, 0.05, '#9aa0a8'); k.box(0.12, 0.08, 0.1, -0.12, 0.72, 0.05, PAL.wood); k.box(0.3, 0.2, 0.2, 0.5, 0.72, -0.1, '#7a6a52'); k.cyl(0.04, 0.04, 0.24, 0.2, 0.72, 0.15, PAL.red, { rot: [0, 0, Math.PI / 2] }); },
  well(k) { k.cyl(0.46, 0.5, 0.55, 0, 0, 0, PAL.stone, { seg: 10 }); k.cyl(0.36, 0.36, 0.56, 0, 0.02, 0, '#2d3a44', { seg: 10 }); k.torus(0.44, 0.06, 0, 0.56, 0, PAL.stoneL, { rot: [Math.PI / 2, 0, 0] }); for (const x of [-0.44, 0.44]) k.box(0.08, 1.2, 0.08, x, 0.5, 0, PAL.woodD); k.prism(1.2, 0.4, 0.8, 0, 1.62, 0, PAL.red); k.cyl(0.04, 0.04, 0.9, 0, 1.36, 0, PAL.wood, { rot: [0, 0, Math.PI / 2] }); k.cyl(0.1, 0.08, 0.16, 0.1, 0.9, 0, '#7a6a52'); },
  board(k) { for (const x of [-0.36, 0.36]) k.box(0.08, 1.45, 0.08, x, 0, 0, PAL.woodD); k.box(0.86, 0.66, 0.06, 0, 0.7, 0, PAL.wood); k.box(0.94, 0.08, 0.14, 0, 1.38, 0, PAL.woodXD); for (const [x, y, c] of [[-0.2, 1.05, PAL.cream], [0.15, 1.1, PAL.white], [0.12, 0.82, PAL.cream], [-0.18, 0.8, '#e6c9a0']]) k.box(0.26, 0.22, 0.02, x, y, 0.04, c); k.ball(0.025, -0.2, 1.24, 0.06, PAL.red, { detail: 0 }); },
  fountain(k) { k.cyl(0.95, 1.0, 0.42, 0, 0, 0, PAL.stoneL, { seg: 16 }); k.cyl(0.82, 0.82, 0.04, 0, 0.36, 0, PAL.water, { seg: 16 }); k.cyl(0.14, 0.18, 1.0, 0, 0.3, 0, PAL.stone, { seg: 8 }); k.cyl(0.42, 0.24, 0.16, 0, 1.18, 0, PAL.stoneL, { seg: 12 }); k.cyl(0.34, 0.34, 0.03, 0, 1.32, 0, PAL.waterL, { seg: 12 }); k.ball(0.1, 0, 1.45, 0, PAL.stoneL, { detail: 0 }); },
  stall(k) { k.box(1.8, 0.75, 0.7, 0, 0, 0.1, PAL.wood); k.box(1.86, 0.08, 0.76, 0, 0.75, 0.1, PAL.woodL); for (const x of [-0.85, 0.85]) for (const z of [-0.25, 0.42]) k.box(0.07, 1.75, 0.07, x, 0, z, PAL.woodD); for (let i = 0; i < 6; i++) k.box(0.33, 0.06, 1.0, -0.82 + i * 0.33, 1.72, 0.05, i % 2 ? PAL.cream : PAL.orange, { rot: [0.25, 0, 0] }); k.ball(0.14, -0.5, 0.95, 0.15, PAL.pumpkin); k.ball(0.12, -0.2, 0.92, 0.2, PAL.pumpkin); k.box(0.36, 0.12, 0.26, 0.35, 0.83, 0.15, PAL.woodD); for (let i = 0; i < 4; i++) k.ball(0.06, 0.24 + i * 0.07, 0.98, 0.15, i % 2 ? '#c9a24a' : '#e3d4b0', { detail: 0 }); },
  bench(k) { k.box(1.7, 0.08, 0.42, 0, 0.36, 0.05, PAL.woodL); k.box(1.7, 0.3, 0.06, 0, 0.5, -0.17, PAL.wood, { rot: [-0.15, 0, 0] }); for (const x of [-0.72, 0.72]) { k.box(0.08, 0.36, 0.4, x, 0, 0.05, '#3a3438'); k.box(0.08, 0.5, 0.06, x, 0.36, -0.17, '#3a3438'); } },
  lamp(k) { k.cyl(0.12, 0.16, 0.18, 0, 0, 0, '#2e2a2c', { seg: 8 }); k.cyl(0.05, 0.05, 1.9, 0, 0.1, 0, '#2e2a2c', { seg: 6 }); k.box(0.3, 0.05, 0.3, 0, 1.95, 0, '#2e2a2c'); k.box(0.24, 0.32, 0.24, 0, 2.0, 0, PAL.lit, { glow: true }); k.cone(0.24, 0.2, 0, 2.32, 0, '#2e2a2c', { seg: 4, rot: [0, Math.PI / 4, 0] }); k.box(0.26, 0.04, 0.26, 0, 2.3, 0, '#2e2a2c'); },
  sign(k) { k.box(0.08, 1.2, 0.08, 0, 0, 0, PAL.woodD); k.box(0.8, 0.3, 0.06, 0.1, 0.8, 0.02, PAL.woodL); k.cone(0.17, 0.2, 0.58, 0.8, 0.02, PAL.woodL, { rot: [0, 0, -Math.PI / 2], seg: 4 }); k.box(0.5, 0.04, 0.02, 0.05, 0.98, 0.06, PAL.woodXD); k.box(0.4, 0.04, 0.02, 0.05, 0.9, 0.06, PAL.woodXD); },
  planter(k) { k.box(0.8, 0.36, 0.6, 0, 0, 0, PAL.woodD); k.box(0.84, 0.05, 0.64, 0, 0.36, 0, PAL.woodL); k.box(0.72, 0.04, 0.52, 0, 0.36, 0, PAL.soil); [[PAL.orange, -0.25, 0], [PAL.purple, 0, -0.1], [PAL.yellow, 0.25, 0.05], [PAL.red, -0.1, 0.15], [PAL.purple, 0.15, 0.15]].forEach(([c, x, z]) => { k.cyl(0.015, 0.015, 0.2, x, 0.38, z, PAL.leafG, { seg: 4 }); k.ball(0.08, x, 0.6, z, c, { detail: 0 }); }); },
  pumpkinpile(k) { k.box(1.7, 0.08, 0.6, 0, 0, 0, '#d9b45a'); [[-0.55, 0.26, 0.05, 0.28], [0, 0.24, 0.1, 0.25], [0.5, 0.26, 0, 0.26], [-0.25, 0.6, 0.0, 0.2], [0.25, 0.56, 0.05, 0.18]].forEach(([x, y, z, r]) => { k.sphere(r, x, y, z, PAL.pumpkin, { seg: 10, scale: [1.1, 0.8, 1] }); k.cyl(0.03, 0.04, 0.1, x, y + r * 0.7, z, PAL.leafB, { seg: 5 }); }); },
  haybale(k) { k.box(0.84, 0.56, 0.62, 0, 0, 0, '#d9b45a', { jitter: 0.12 }); for (const x of [-0.24, 0.24]) k.box(0.05, 0.58, 0.64, x, -0.01, 0, '#8a6a2a'); k.box(0.86, 0.04, 0.64, 0, 0.54, 0, '#ecc56a'); },
  scarecrow(k) { k.box(0.08, 1.7, 0.08, 0, 0, 0, PAL.trunk); k.box(1.1, 0.07, 0.07, 0, 1.15, 0, PAL.trunk); k.box(0.46, 0.55, 0.28, 0, 0.75, 0, '#7a5a8e'); k.box(0.6, 0.18, 0.2, 0, 1.08, 0, '#7a5a8e'); for (const x of [-0.55, 0.55]) k.cone(0.05, 0.14, x, 1.04, 0, '#d9b45a', { rot: [0, 0, x > 0 ? -1.5 : 1.5], seg: 4 }); k.box(0.36, 0.36, 0.32, 0, 1.3, 0, '#d9b45a'); k.box(0.05, 0.05, 0.02, -0.08, 1.48, 0.17, PAL.ink); k.box(0.05, 0.05, 0.02, 0.08, 1.48, 0.17, PAL.ink); k.box(0.16, 0.03, 0.02, 0, 1.38, 0.17, PAL.ink); k.cyl(0.4, 0.4, 0.04, 0, 1.64, 0, '#c9a24a', { seg: 10 }); k.cyl(0.18, 0.22, 0.24, 0, 1.66, 0, '#c9a24a', { seg: 8 }); k.cyl(0.225, 0.225, 0.05, 0, 1.68, 0, PAL.red, { seg: 8 }); },
  barrel(k) { k.cyl(0.3, 0.3, 0.75, 0, 0, 0, PAL.wood, { seg: 10 }); k.sphere(0.33, 0, 0.37, 0, PAL.wood, { seg: 10, scale: [1, 1.1, 1] }); for (const y of [0.12, 0.6]) k.cyl(0.335, 0.335, 0.05, 0, y, 0, '#4a4448', { seg: 10 }); k.cyl(0.27, 0.27, 0.02, 0, 0.75, 0, PAL.woodL, { seg: 10 }); },
  crate(k) { k.box(0.72, 0.6, 0.72, 0, 0, 0, PAL.woodL); for (const y of [0.04, 0.5]) k.box(0.74, 0.08, 0.74, 0, y, 0, PAL.woodD); k.box(0.08, 0.6, 0.74, 0, 0, 0, PAL.woodD, { rot: [0, 0, 0.7] }); },
  leafpile(k) { for (let i = 0; i < 26; i++) { const a = i * 2.39, r = 0.38 * Math.sqrt((i + 1) / 26); k.box(0.12, 0.025, 0.08, Math.cos(a) * r, 0.01 + (26 - i) * 0.004, Math.sin(a) * r * 0.8, [PAL.leafO, PAL.leafR, PAL.leafY, PAL.leafB][i % 4], { rot: [0, a, 0] }); } },
  // ---- furniture
  bed(k) { k.box(0.86, 0.3, 1.8, 0, 0, 0, PAL.woodD); k.box(0.9, 0.7, 0.1, 0, 0, -0.88, PAL.wood); k.box(0.78, 0.14, 1.66, 0, 0.3, 0.02, PAL.white); k.box(0.6, 0.12, 0.34, 0, 0.44, -0.6, '#e8e2d6'); k.box(0.82, 0.12, 1.1, 0, 0.38, 0.32, '#7d5a8e'); for (let z = 0; z < 4; z++) k.box(0.84, 0.02, 0.05, 0, 0.5, -0.1 + z * 0.28, '#6a4a7a'); },
  cot(k) { k.box(0.8, 0.26, 1.8, 0, 0, 0, PAL.woodD); k.box(0.72, 0.12, 1.66, 0, 0.26, 0, PAL.white); k.box(0.52, 0.1, 0.3, 0, 0.38, -0.6, '#e8e2d6'); k.box(0.76, 0.1, 1.0, 0, 0.32, 0.36, '#6f8a5a'); },
  stove(k) { k.box(0.84, 0.8, 0.7, 0, 0, 0, '#3d3a3e'); k.box(0.86, 0.06, 0.72, 0, 0.8, 0, '#5a565c'); k.box(0.5, 0.32, 0.04, 0, 0.18, 0.35, '#2a2628'); k.box(0.4, 0.22, 0.02, 0, 0.23, 0.37, PAL.orange, { glow: true }); k.cyl(0.08, 0.08, 1.5, 0.25, 0.85, -0.22, '#3d3a3e', { seg: 6 }); k.cyl(0.14, 0.12, 0.12, -0.2, 0.86, 0.05, '#6a6a70', { seg: 8 }); },
  table(k) { k.box(1.7, 0.08, 0.8, 0, 0.62, 0, PAL.woodL); for (const x of [-0.75, 0.75]) for (const z of [-0.32, 0.32]) k.box(0.08, 0.62, 0.08, x, 0, z, PAL.woodD); k.box(0.9, 0.01, 0.82, 0, 0.7, 0, '#c9b27c'); k.cyl(0.08, 0.06, 0.14, -0.3, 0.71, 0, PAL.white, { seg: 8 }); k.cyl(0.18, 0.18, 0.03, 0.35, 0.71, 0.05, '#e3d4b0', { seg: 10 }); k.ball(0.08, 0.35, 0.78, 0.05, PAL.pumpkin, { detail: 0 }); },
  chest(k) { k.box(0.8, 0.46, 0.56, 0, 0, 0, PAL.wood); k.cyl(0.28, 0.28, 0.8, 0, 0.46, 0, PAL.woodL, { rot: [0, 0, Math.PI / 2], seg: 8 }); const g = k.parts.base.pop(); g.scale(1, 0.55, 1); g.translate(0, 0.2, 0); k.parts.base.push(g); for (const x of [-0.3, 0.3]) k.box(0.06, 0.62, 0.58, x, 0, 0, '#4a4448'); k.box(0.12, 0.14, 0.04, 0, 0.36, 0.29, PAL.yellow); },
  wardrobe(k) { k.box(0.86, 1.8, 0.56, 0, 0, -0.1, PAL.woodD); k.box(0.92, 0.08, 0.6, 0, 1.8, -0.1, PAL.wood); for (const x of [-0.21, 0.21]) k.box(0.4, 1.6, 0.02, x, 0.1, 0.19, PAL.wood); for (const x of [-0.05, 0.05]) k.box(0.03, 0.12, 0.03, x, 0.9, 0.21, PAL.yellow); },
  bookshelf(k) { k.box(0.9, 1.8, 0.4, 0, 0, -0.2, PAL.woodD); k.box(0.8, 1.66, 0.04, 0, 0.07, -0.02, PAL.woodXD); for (let i = 0; i < 4; i++) { k.box(0.84, 0.04, 0.34, 0, 0.06 + i * 0.44, -0.18, PAL.wood); bookRow(k, -0.4, 0.4, 0.1 + i * 0.44, -0.16, 0.34, i * 3); } },
  plant(k) { k.cyl(0.2, 0.15, 0.32, 0, 0, 0, '#a65f48', { seg: 8 }); k.cyl(0.21, 0.21, 0.04, 0, 0.3, 0, '#8a4a36', { seg: 8 }); for (let i = 0; i < 7; i++) { const a = i * 0.9; k.box(0.1, 0.02, 0.36, Math.sin(a) * 0.12, 0.48 + (i % 3) * 0.12, Math.cos(a) * 0.12, i % 2 ? PAL.green : '#7d9a48', { rot: [0.8, a, 0], order: 'YXZ' }); } },
  rug(k) { k.box(2.7, 0.02, 1.7, 0, 0, 0, '#8c3b33'); k.box(2.4, 0.024, 1.4, 0, 0, 0, '#a8503e'); k.box(1.6, 0.028, 0.7, 0, 0, 0, PAL.yellow); k.box(1.4, 0.032, 0.5, 0, 0, 0, '#8c3b33'); },
  shelf(k) { k.box(2.7, 1.5, 0.4, 0, 0, -0.25, PAL.woodD); for (let i = 0; i < 3; i++) { k.box(2.66, 0.05, 0.38, 0, 0.1 + i * 0.48, -0.24, PAL.wood); for (let j = 0; j < 7; j++) { const x = -1.1 + j * 0.37; const c = [PAL.pumpkin, PAL.cream, PAL.teal, PAL.red, '#c9a24a', PAL.turnip, PAL.purple][(i * 3 + j) % 7]; if ((i + j) % 2) k.cyl(0.1, 0.1, 0.26, x, 0.15 + i * 0.48, -0.2, c, { seg: 8 }); else k.box(0.22, 0.3, 0.2, x, 0.15 + i * 0.48, -0.2, c); } } },
  counter(k) { k.box(3.8, 0.9, 0.7, 0, 0, 0, PAL.wood); k.box(3.9, 0.08, 0.8, 0, 0.9, 0, PAL.woodL); for (let x = -1.6; x <= 1.6; x += 0.8) k.box(0.05, 0.8, 0.02, x, 0.05, 0.36, PAL.woodD); k.box(0.42, 0.28, 0.32, 1.2, 0.98, 0, '#5a565c'); k.box(0.36, 0.1, 0.06, 1.2, 1.2, 0.12, PAL.yellow); k.box(0.5, 0.2, 0.36, -1.1, 0.98, 0, '#b08a5a'); k.ball(0.1, -0.4, 1.06, 0, PAL.turnip, { detail: 0 }); },
  yarnbasket(k) { k.cyl(0.32, 0.26, 0.32, 0, 0, 0, '#a8844a', { seg: 10 }); [[PAL.purple, -0.12, 0], ['#9a7ab8', 0.12, 0.05], [PAL.teal, 0, -0.1]].forEach(([c, x, z]) => k.ball(0.13, x, 0.36, z, c)); k.cyl(0.01, 0.01, 0.5, 0.15, 0.4, 0, '#d8d4c8', { rot: [0, 0, -0.4], seg: 4 }); },
  armchair(k) { k.box(0.8, 0.4, 0.76, 0, 0.1, 0, '#7e5a8e'); k.box(0.8, 0.7, 0.18, 0, 0.3, -0.3, '#9878a8'); for (const x of [-0.36, 0.36]) k.box(0.14, 0.32, 0.76, x, 0.4, 0, '#6a4a7a'); k.box(0.56, 0.1, 0.56, 0, 0.5, 0.06, '#8e6a9e'); for (const x of [-0.32, 0.32]) for (const z of [-0.3, 0.3]) k.box(0.06, 0.1, 0.06, x, 0, z, PAL.woodXD); },
  potterywheel(k) { k.box(0.7, 0.4, 0.6, 0, 0, 0, PAL.woodD); k.cyl(0.32, 0.34, 0.08, 0, 0.4, 0, '#7b766d', { seg: 12 }); k.cyl(0.14, 0.18, 0.3, 0, 0.48, 0, '#b9a58a', { seg: 10 }); k.cyl(0.12, 0.14, 0.06, 0, 0.78, 0, '#cbb89c', { seg: 10 }); },
  kiln(k) { k.box(0.84, 1.0, 0.76, 0, 0, -0.05, '#a65f48', { jitter: 0.1 }); k.sphere(0.42, 0, 1.0, -0.05, '#a65f48', { scale: [1, 0.6, 0.9] }); for (let y = 0.2; y < 1; y += 0.2) k.box(0.86, 0.02, 0.78, 0, y, -0.05, '#8a4a36'); k.box(0.46, 0.46, 0.04, 0, 0.2, 0.34, '#2a1a1a'); k.box(0.36, 0.3, 0.02, 0, 0.24, 0.36, PAL.orange, { glow: true }); k.cyl(0.08, 0.08, 0.5, 0, 1.2, -0.1, '#7a4a3a', { seg: 6 }); },
  bust(k) { k.box(0.44, 0.7, 0.44, 0, 0, 0, PAL.stoneL); k.box(0.52, 0.06, 0.52, 0, 0.7, 0, PAL.stone); k.box(0.44, 0.2, 0.26, 0, 0.76, 0, '#b9a58a'); k.sphere(0.17, 0, 1.1, 0, '#b9a58a', { scale: [0.9, 1.1, 1] }); k.box(0.05, 0.04, 0.02, -0.06, 1.12, 0.16, '#8a7a62'); k.box(0.05, 0.04, 0.02, 0.06, 1.12, 0.16, '#8a7a62'); },
  gnomeshelf(k) { k.box(0.86, 1.7, 0.4, 0, 0, -0.22, PAL.woodD); for (let i = 0; i < 3; i++) { k.box(0.82, 0.04, 0.36, 0, 0.05 + i * 0.56, -0.2, PAL.woodXD); [-0.22, 0.2].forEach((x, j) => { const c = [PAL.teal, PAL.purple, PAL.orange, PAL.green, PAL.yellow, PAL.red][(i * 2 + j) % 6]; k.cone(0.09, 0.24, x, 0.09 + i * 0.56, -0.15, c, { seg: 6 }); k.ball(0.06, x, 0.3 + i * 0.56, -0.12, PAL.white, { detail: 0 }); k.cone(0.06, 0.16, x, 0.33 + i * 0.56, -0.15, PAL.gnomeHat, { seg: 6 }); }); } },
  globe(k) { k.cyl(0.2, 0.26, 0.08, 0, 0, 0, PAL.woodXD, { seg: 10 }); k.cyl(0.04, 0.05, 0.5, 0, 0.08, 0, PAL.woodD, { seg: 6 }); k.sphere(0.3, 0, 0.88, 0, '#4b6f89', { seg: 12 }); for (const [x, y, z] of [[0.15, 0.95, 0.22], [-0.12, 0.78, 0.25], [0.2, 0.75, -0.1]]) k.ball(0.1, x, y, z, PAL.green, { detail: 0, scale: [1, 0.6, 0.5] }); k.torus(0.34, 0.02, 0, 0.88, 0, PAL.yellow, { rot: [0, 0, 0.4] }); },
  helm(k) { k.box(0.1, 0.8, 0.1, 0, 0, -0.1, PAL.woodD); k.torus(0.32, 0.04, 0, 0.9, 0, PAL.wood, { rot: [0, 0, 0] }); for (let i = 0; i < 4; i++) k.box(0.84, 0.05, 0.05, 0, 0.9, 0.02, PAL.woodL, { rot: [0, 0, (i * Math.PI) / 4] }); const g = k.parts.base; for (let i = 0; i < 4; i++) g[g.length - 1 - i].translate(0, 0.9 - 0.9 - 0.025, 0); k.cyl(0.07, 0.07, 0.06, 0, 0.9, 0.03, PAL.yellow, { rot: [Math.PI / 2, 0, 0], seg: 8 }); },
  anchor(k) { k.box(0.9, 0.06, 0.4, 0, 0, 0, PAL.woodXD); k.box(0.1, 0.9, 0.1, 0, 0.06, 0, '#5a565c'); k.torus(0.1, 0.03, 0, 1.06, 0, '#5a565c'); k.box(0.5, 0.07, 0.07, 0, 0.75, 0, '#5a565c'); k.torus(0.32, 0.05, 0, 0.42, 0, '#5a565c', { rot: [0, 0, Math.PI], seg: 10 }); },
  fishtank(k) { k.box(0.84, 0.5, 0.6, 0, 0, 0, PAL.woodD); k.box(0.84, 0.56, 0.6, 0, 0.5, 0, '#9fc1cc', { glow: true }); k.box(0.76, 0.42, 0.52, 0, 0.52, 0, '#5f8aa0'); k.box(0.12, 0.08, 0.03, -0.15, 0.78, 0.27, PAL.orange); k.box(0.1, 0.06, 0.03, 0.18, 0.66, 0.27, PAL.yellow); k.cyl(0.015, 0.015, 0.3, 0.28, 0.52, 0, PAL.green, { seg: 4 }); },
  oven(k) { k.box(0.86, 1.1, 0.76, 0, 0, -0.05, '#8a4a36', { jitter: 0.1 }); for (let y = 0.25; y < 1.1; y += 0.25) k.box(0.88, 0.02, 0.78, 0, y, -0.05, '#6a3a2a'); k.sphere(0.24, 0, 0.36, 0.32, '#2a1a1a', { scale: [1, 1, 0.15] }); k.sphere(0.2, 0, 0.34, 0.34, PAL.orange, { scale: [1, 0.7, 0.12], glow: true }); k.box(0.12, 0.6, 0.12, 0.25, 1.1, -0.2, '#5a565c'); k.ball(0.08, -0.15, 1.14, 0.1, '#d8a25a', { detail: 0, scale: [1.4, 0.7, 1] }); },
  floursacks(k) { [[-0.2, 0, 0.05], [0.2, 0, 0], [0, 0.42, 0]].forEach(([x, y, z]) => { k.ball(0.25, x, y + 0.24, z, '#e3d4b0', { scale: [0.9, 1.0, 0.8] }); k.box(0.12, 0.08, 0.12, x, y + 0.48, z, '#c8b78f'); }); },
  cabinet(k) { k.box(0.84, 1.6, 0.5, 0, 0, -0.15, '#6e6b64'); for (let i = 0; i < 3; i++) { k.box(0.74, 0.44, 0.03, 0, 0.12 + i * 0.5, 0.1, '#7b766d'); k.box(0.24, 0.04, 0.03, 0, 0.42 + i * 0.5, 0.12, PAL.cream); } },
  papers(k) { k.box(0.84, 0.4, 0.6, 0, 0, 0, PAL.woodD); [[-0.24, 0.3], [0.04, 0.5], [0.28, 0.18]].forEach(([x, h]) => { k.box(0.24, h, 0.32, x, 0.4, 0, PAL.white, { jitter: 0.12 }); for (let y = 0.4; y < 0.4 + h; y += 0.06) k.box(0.25, 0.008, 0.33, x, y, 0, '#d8d2c4'); }); },
  flagstand(k) { k.cyl(0.16, 0.2, 0.08, 0, 0, 0, PAL.woodXD, { seg: 8 }); k.cyl(0.025, 0.025, 1.7, -0.2, 0.06, 0, PAL.woodD, { seg: 6 }); k.box(0.62, 0.42, 0.02, 0.12, 1.2, 0, PAL.orange); k.box(0.62, 0.06, 0.025, 0.12, 1.38, 0, PAL.yellow); k.ball(0.04, -0.2, 1.8, 0, PAL.yellow, { detail: 0 }); },
  desk(k) { k.box(1.7, 0.08, 0.7, 0, 0.68, 0, PAL.wood); k.box(0.5, 0.68, 0.64, -0.55, 0, 0, PAL.woodD); k.box(0.08, 0.68, 0.6, 0.78, 0, 0, PAL.woodD); for (let i = 0; i < 3; i++) k.box(0.4, 0.16, 0.02, -0.55, 0.08 + i * 0.2, 0.33, PAL.woodL); k.box(0.3, 0.02, 0.22, 0.2, 0.76, 0, PAL.white); k.cyl(0.05, 0.05, 0.12, 0.55, 0.76, -0.1, PAL.ink, { seg: 6 }); k.cyl(0.01, 0.01, 0.18, 0.55, 0.85, -0.1, PAL.white, { rot: [0, 0, 0.3], seg: 4 }); },
  lectern(k) { k.box(1.6, 0.14, 0.6, 0, 0, 0, PAL.woodXD); k.box(0.5, 1.0, 0.4, 0, 0.14, 0, PAL.woodD); k.box(0.8, 0.06, 0.56, 0, 1.12, 0, PAL.wood, { rot: [0.35, 0, 0] }); k.box(0.5, 0.03, 0.36, 0, 1.16, 0.02, PAL.white, { rot: [0.35, 0, 0] }); k.box(0.3, 0.3, 0.02, 0, 0.5, 0.21, PAL.yellow); k.cyl(0.03, 0.04, 0.16, 0.55, 0.14, 0, PAL.yellow, { seg: 6 }); k.cone(0.05, 0.12, 0.55, 0.3, 0, PAL.yellow, { seg: 6 }); },
};

export function propModel(kind) {
  return cached(`prop:${kind}`, () => {
    const fn = PROPS[kind];
    if (fn) { const k = new Kit(); fn(k); return k.build(); }
    // anything without a hand-made model: extrude its pixel sprite into voxels
    const spr = Art.objects[kind];
    return spr ? { base: voxelize(spr, { depth: 5 }), glow: null } : { base: null, glow: null };
  });
}

// Gnome statue in the victim's clothes. victimLook = villager look (or the player's).
export function gnomeModel(look) {
  const k = new Kit();
  k.cyl(0.32, 0.36, 0.12, 0, 0, 0, PAL.stone, { seg: 10 });
  k.cyl(0.18, 0.28, 0.42, 0, 0.12, 0, look.shirt, { seg: 10 });
  k.cyl(0.24, 0.26, 0.06, 0, 0.34, 0, look.pants || PAL.ink, { seg: 10 });
  k.box(0.08, 0.08, 0.08, -0.12, 0.12, 0.2, '#3a2a24'); k.box(0.08, 0.08, 0.08, 0.12, 0.12, 0.2, '#3a2a24');
  k.sphere(0.17, 0, 0.66, 0.02, look.skin, { seg: 10 });
  k.cone(0.15, 0.32, 0, 0.36, 0.08, PAL.white, { seg: 8, rot: [Math.PI, 0, 0] });
  const g = k.parts.base.pop(); g.translate(0, 0.0, 0.05); k.parts.base.push(g);
  k.ball(0.06, 0, 0.66, 0.18, '#e59a8a', { detail: 0 });
  k.cone(0.2, 0.55, 0, 0.74, 0, PAL.gnomeHat, { seg: 10, rot: [-0.15, 0, 0] });
  k.box(0.04, 0.03, 0.02, -0.07, 0.72, 0.17, PAL.ink); k.box(0.04, 0.03, 0.02, 0.07, 0.72, 0.17, PAL.ink);
  for (const s of [-1, 1]) k.cyl(0.05, 0.05, 0.22, s * 0.22, 0.28, 0.05, look.shirt, { seg: 6, rot: [0.4, 0, s * 0.5] });
  return k.build();
}

// ------------------------------------------------------------------ characters
// A small chibi rig with pivots for walk-cycle animation.
function part(res) { const m = new THREE.Mesh(res.base, MAT.base); m.castShadow = true; m.receiveShadow = false; return m; }

export function characterRig(L) {
  const tall = (L.height || 0) * 0.05;
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const shoes = '#3a2a24';

  const legGeo = (() => { const k = new Kit(); k.box(0.13, 0.3, 0.14, 0, -0.32, 0, L.pants); k.box(0.14, 0.08, 0.2, 0, -0.34, 0.03, shoes); return k.build(); })();
  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(-0.08, 0.34, 0); legR.position.set(0.08, 0.34, 0);
  legL.add(part(legGeo)); legR.add(part(legGeo));
  body.add(legL, legR);

  const torsoH = 0.34 + tall;
  const torso = (() => {
    const k = new Kit();
    k.box(0.36, torsoH, 0.24, 0, 0.3, 0, L.shirt);
    k.box(0.37, 0.07, 0.25, 0, 0.3, 0, L.pants); // belt line
    if (L.apron) k.box(0.3, torsoH * 0.6 + 0.12, 0.02, 0, 0.24, 0.125, L.apron);
    if (L.overalls) { k.box(0.24, torsoH * 0.55, 0.02, 0, 0.32, 0.125, L.overalls); for (const s of [-0.09, 0.09]) k.box(0.05, torsoH * 0.5, 0.02, s, 0.3 + torsoH * 0.5, 0.125, L.overalls); k.box(0.38, 0.12, 0.26, 0, 0.26, 0, L.overalls); }
    if (L.waistcoat) for (const s of [-1, 1]) k.box(0.12, torsoH - 0.02, 0.02, s * 0.11, 0.32, 0.125, L.waistcoat);
    return k.build();
  })();
  body.add(part(torso));

  const shoulderY = 0.3 + torsoH - 0.04;
  const armGeo = (() => { const k = new Kit(); k.box(0.1, 0.3, 0.12, 0, -0.3, 0, L.shirt); k.box(0.09, 0.08, 0.1, 0, -0.36, 0, L.skin); return k.build(); })();
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(-0.235, shoulderY, 0); armR.position.set(0.235, shoulderY, 0);
  armL.add(part(armGeo)); armR.add(part(armGeo));
  body.add(armL, armR);

  const head = new THREE.Group();
  head.position.y = 0.3 + torsoH;
  const hk = new Kit();
  const hs = 0.42, hy = 0.02;
  hk.box(hs, hs, hs * 0.92, 0, hy, 0, L.skin, { jitter: 0.02 });
  hk.box(0.06, 0.08, 0.02, -0.09, hy + 0.17, hs * 0.46 + 0.005, PAL.ink); // eyes
  hk.box(0.06, 0.08, 0.02, 0.09, hy + 0.17, hs * 0.46 + 0.005, PAL.ink);
  hk.box(0.06, 0.04, 0.02, -0.15, hy + 0.1, hs * 0.46 + 0.004, shade(L.skin, -0.12)); // cheeks
  hk.box(0.06, 0.04, 0.02, 0.15, hy + 0.1, hs * 0.46 + 0.004, shade(L.skin, -0.12));
  const hair = L.hair, top = hy + hs;
  const style = L.hairStyle;
  if (style !== 'bald') {
    hk.box(hs + 0.04, 0.1, hs * 0.92 + 0.04, 0, top - 0.06, 0, hair);
    hk.box(hs + 0.04, hs * 0.75, 0.08, 0, top - hs * 0.75, -hs * 0.46, hair); // back
    for (const s of [-1, 1]) hk.box(0.05, hs * 0.5, hs * 0.7, s * (hs / 2 + 0.01), top - hs * 0.5, -0.05, hair);
    hk.box(hs + 0.02, 0.07, 0.06, 0, top - 0.12, hs * 0.44, hair); // fringe
  } else for (const s of [-1, 1]) hk.box(0.05, 0.14, 0.24, s * (hs / 2 + 0.01), hy + 0.18, -0.06, hair);
  if (style === 'bun') hk.sphere(0.12, 0, top + 0.06, -0.08, hair);
  if (style === 'messy') for (let i = 0; i < 5; i++) hk.cone(0.06, 0.12, -0.16 + i * 0.08, top - 0.02, (i % 2) * 0.08 - 0.04, hair, { seg: 4, rot: [0, 0, (i - 2) * 0.3] });
  if (style === 'curly') for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; hk.ball(0.08, Math.cos(a) * 0.2, top - 0.04 - (i % 2) * 0.1, Math.sin(a) * 0.18 - 0.03, hair, { detail: 0 }); }
  if (L.beard) { hk.box(hs * 0.8, 0.14, 0.08, 0, hy - 0.02, hs * 0.46, L.beard); hk.box(0.12, 0.03, 0.02, 0, hy + 0.1, hs * 0.5 + 0.01, L.beard); }
  if (L.glasses) { for (const s of [-1, 1]) hk.torus(0.05, 0.012, s * 0.09, hy + 0.17, hs * 0.47 + 0.01, PAL.ink, { seg: 10 }); hk.box(0.06, 0.015, 0.01, 0, hy + 0.18, hs * 0.48, PAL.ink); }
  const hat = L.hat;
  if (hat === 'straw') { hk.cyl(0.38, 0.38, 0.04, 0, top, 0, '#c9a24a', { seg: 14 }); hk.cyl(0.2, 0.23, 0.16, 0, top + 0.03, 0, '#c9a24a', { seg: 12 }); hk.cyl(0.235, 0.235, 0.05, 0, top + 0.04, 0, PAL.red, { seg: 12 }); }
  if (hat === 'baker') { hk.cyl(0.22, 0.22, 0.12, 0, top - 0.02, 0, PAL.white, { seg: 10 }); hk.sphere(0.25, 0, top + 0.2, 0, PAL.white, { scale: [1, 0.6, 1] }); }
  if (hat === 'tophat') { hk.cyl(0.3, 0.3, 0.03, 0, top, 0, '#2a2628', { seg: 12 }); hk.cyl(0.18, 0.19, 0.36, 0, top + 0.02, 0, '#2a2628', { seg: 12 }); hk.cyl(0.195, 0.195, 0.05, 0, top + 0.05, 0, '#8c3b33', { seg: 12 }); }
  if (hat === 'beanie') { hk.sphere(0.25, 0, top - 0.02, 0, L.hatColor || PAL.red, { scale: [1, 0.7, 1] }); hk.cyl(0.255, 0.255, 0.07, 0, top - 0.08, 0, shade(L.hatColor || PAL.red, -0.2), { seg: 10 }); hk.ball(0.06, 0, top + 0.17, 0, PAL.cream, { detail: 0 }); }
  if (hat === 'captain') { hk.cyl(0.25, 0.24, 0.12, 0, top - 0.02, 0, '#2a3048', { seg: 12 }); hk.box(0.3, 0.03, 0.14, 0, top - 0.02, 0.24, '#1c1618'); hk.box(0.06, 0.05, 0.02, 0, top + 0.03, 0.245, PAL.yellow); hk.cyl(0.255, 0.255, 0.03, 0, top + 0.02, 0, PAL.white, { seg: 12 }); }
  head.add(part(hk.build()));
  body.add(head);

  // night-prowler disguise: a dark cloak and hood with glinting eyes
  const hood = new THREE.Group();
  const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.1 + tall, 7), MAT.hood); cloak.position.y = 0.55 + tall / 2; cloak.castShadow = true;
  const hoodHead = new THREE.Mesh(new THREE.IcosahedronGeometry(0.26, 1), MAT.hood); hoodHead.position.set(0, 1.0 + tall, 0); hoodHead.scale.set(1, 1.1, 1); hoodHead.castShadow = true;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 6), MAT.hood); tip.position.set(0, 1.25 + tall, -0.1); tip.rotation.x = -0.6;
  const eyeGeo = new THREE.BoxGeometry(0.05, 0.035, 0.02);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(eyeGeo, MAT.eyes); e.position.set(s * 0.07, 1.02 + tall, 0.25); hood.add(e); }
  hood.add(cloak, hoodHead, tip);
  hood.visible = false;
  root.add(hood);

  // soft contact shadow (helps at night when the sun shadow is gone)
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.28, 16), MAT.shadow);
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.012; blob.renderOrder = 1;
  root.add(blob);

  return { root, body, legL, legR, armL, armR, head, hood, heading: 0, hooded: false };
}

export function catRig(col, dark) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const k = new Kit();
  k.box(0.2, 0.18, 0.42, 0, 0.16, 0, col);
  k.box(0.22, 0.04, 0.12, 0, 0.3, -0.05, dark);
  body.add(part(k.build()));
  const head = new THREE.Group(); head.position.set(0, 0.34, 0.22);
  const hk = new Kit();
  hk.box(0.22, 0.18, 0.18, 0, -0.06, 0, col);
  for (const s of [-1, 1]) hk.cone(0.05, 0.1, s * 0.07, 0.1, 0, col, { seg: 4 });
  for (const s of [-1, 1]) hk.box(0.035, 0.04, 0.01, s * 0.05, 0.02, 0.095, PAL.ink);
  hk.box(0.04, 0.03, 0.01, 0, -0.03, 0.095, '#e59a8a');
  head.add(part(hk.build()));
  body.add(head);
  const tail = new THREE.Group(); tail.position.set(0, 0.28, -0.2);
  const tk = new Kit(); tk.box(0.05, 0.05, 0.28, 0, -0.025, -0.14, dark); tail.add(part(tk.build()));
  tail.rotation.x = -0.6;
  body.add(tail);
  const legs = [];
  const lk = new Kit(); lk.box(0.06, 0.16, 0.06, 0, -0.16, 0, dark);
  const lg = lk.build();
  for (const [x, z] of [[-0.07, 0.15], [0.07, 0.15], [-0.07, -0.15], [0.07, -0.15]]) { const l = new THREE.Group(); l.position.set(x, 0.16, z); l.add(part(lg)); body.add(l); legs.push(l); }
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.2, 12), MAT.shadow); blob.rotation.x = -Math.PI / 2; blob.position.y = 0.012; root.add(blob);
  root.scale.setScalar(1.15);
  return { root, body, head, tail, legs, heading: 0 };
}
