// Procedural pixel art. Everything is drawn once at startup onto offscreen canvases.
// Muted autumn palette with pops of orange, plum and teal.
import { hash2 } from './rng.js';
import { VILLAGERS, PLAYER_LOOK } from './data/villagers.js';
import { MAP } from './data/map.js';
import { ITEMS } from './data/items.js';

export const PAL = {
  ink: '#2b2125', inkSoft: '#3d3034',
  grass: '#6f7a3e', grassD: '#5d6834', grassL: '#838d4a', grassXL: '#97a056',
  leafO: '#cf7a32', leafR: '#a9452f', leafY: '#d9a63e', leafG: '#6c7a36', leafB: '#8a5a2e',
  dirt: '#a27c53', dirtD: '#86643f', dirtL: '#b8916a',
  soil: '#6e4c34', soilD: '#583b28', soilWet: '#46301f', soilWetD: '#38251a',
  field: '#7c7442', fieldD: '#695f37',
  stone: '#9a958a', stoneD: '#7b766d', stoneL: '#b3aea2',
  water: '#4b6f89', waterD: '#3e5e76', waterL: '#7fa0b4',
  sand: '#c6ab7c', sandD: '#ad9466',
  wood: '#8a5a3a', woodD: '#6a4229', woodL: '#a8744a', woodXD: '#4e3020',
  trunk: '#5b3d29',
  cream: '#e3d4b0', creamD: '#c8b78f',
  white: '#f3eee3', black: '#1c1618',
  glass: '#5d7a8a', glassL: '#9fb8c2', lit: '#f6cf6a', litL: '#fff0b0',
  red: '#b5452f', orange: '#d9772f', yellow: '#e2b54a', purple: '#7e5a8e', teal: '#3f7272', green: '#5f7f3a',
  pumpkin: '#e07a24', pumpkinD: '#b45b17',
  turnip: '#efe6e6', turnipP: '#a8487a',
  garlic: '#efe7d2', garlicD: '#cbbf9f',
  gnomeHat: '#b8432f',
};

const ROOFS = { plum: '#6e4a63', teal: '#3f6b6b', brown: '#6b4a32', navy: '#3a4766', red: '#9c4a3a', orange: '#b5683a', farm: '#8c5136', store: '#5d7a4a', hall: '#5a5f6e' };
const WALLS = { cream: '#dccaa2', grey: '#a9a49a', brick: '#a65f48', plank: '#9a6f4a' };
const WALLPAPER = { farm: ['#b9965f', '#a5834f'], store: ['#c9b27c', '#b69d68'], hall: ['#8f8a7c', '#7e796c'], lilac: ['#a790b3', '#957ea2'], sage: ['#8ea07e', '#7c8e6c'], tweed: ['#9b8463', '#887253'], navy: ['#6d7a96', '#5c6884'], butter: ['#d8bf6e', '#c4aa5c'], rose: ['#c18f8a', '#ad7b76'] };

function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return [c, g];
}
function R(g, x, y, w, h, col) { g.fillStyle = col; g.fillRect(x, y, w, h); }
function P(g, x, y, col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
  const f = (v) => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  r = f(r); gg = f(gg); b = f(b);
  return '#' + ((1 << 24) | (r << 16) | (gg << 8) | b).toString(16).slice(1);
}

function speckle(g, w, h, cols, density, seed) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const r = hash2(x, y, seed);
    if (r < density) P(g, x, y, cols[Math.floor(hash2(y, x, seed + 1) * cols.length)]);
  }
}

function flip(src) {
  const [c, g] = mk(src.width, src.height);
  g.translate(src.width, 0); g.scale(-1, 1); g.drawImage(src, 0, 0);
  return c;
}

// ---------------------------------------------------------------- tiles
function grassTile(seed) {
  const [c, g] = mk(16, 16);
  R(g, 0, 0, 16, 16, PAL.grass);
  speckle(g, 16, 16, [PAL.grassD, PAL.grassL], 0.22, seed);
  // little grass tufts
  for (let i = 0; i < 3; i++) {
    const x = Math.floor(hash2(i, seed, 3) * 14) + 1, y = Math.floor(hash2(seed, i, 4) * 13) + 2;
    P(g, x, y, PAL.grassXL); P(g, x - 1, y + 1, PAL.grassL); P(g, x + 1, y + 1, PAL.grassL);
  }
  if (seed % 3 === 0) { // a fallen leaf
    const x = 3 + (seed * 5) % 10, y = 4 + (seed * 3) % 9;
    const col = [PAL.leafO, PAL.leafR, PAL.leafY][seed % 3];
    R(g, x, y, 2, 1, col); P(g, x + 1, y + 1, shade(col, -0.2));
  }
  return c;
}

function pathTile(seed) {
  const [c, g] = mk(16, 16);
  R(g, 0, 0, 16, 16, PAL.dirt);
  speckle(g, 16, 16, [PAL.dirtD, PAL.dirtL], 0.18, seed + 20);
  for (let i = 0; i < 2; i++) {
    const x = Math.floor(hash2(i, seed, 9) * 13) + 1, y = Math.floor(hash2(seed, i, 8) * 13) + 1;
    R(g, x, y, 2, 1, PAL.stoneL); P(g, x, y + 1, PAL.stoneD);
  }
  return c;
}

function stoneTile(seed) {
  const [c, g] = mk(16, 16);
  R(g, 0, 0, 16, 16, PAL.stoneD);
  const cobbles = [[0, 0, 7, 5], [8, 0, 8, 5], [0, 6, 4, 4], [5, 6, 6, 4], [12, 6, 4, 4], [0, 11, 8, 5], [9, 11, 7, 5]];
  cobbles.forEach(([x, y, w, h], i) => {
    const col = hash2(i, seed, 2) < 0.3 ? PAL.stoneL : PAL.stone;
    R(g, x + 0.5 | 0, y, w - 1, h - 1, col);
    R(g, x, y, w - 1, 1, shade(col, 0.15));
  });
  return c;
}

function waterTile(frame) {
  const [c, g] = mk(16, 16);
  R(g, 0, 0, 16, 16, PAL.water);
  speckle(g, 16, 16, [PAL.waterD], 0.12, 40);
  const off = frame * 4;
  for (const [x, y] of [[2, 3], [9, 7], [4, 12], [12, 13]]) {
    const xx = (x + off) % 16;
    R(g, xx, y, 3, 1, PAL.waterL); P(g, (xx + 3) % 16, y + 1, PAL.waterL);
  }
  return c;
}

function sandTile(seed) {
  const [c, g] = mk(16, 16);
  R(g, 0, 0, 16, 16, PAL.sand);
  speckle(g, 16, 16, [PAL.sandD, shade(PAL.sand, 0.15)], 0.2, seed + 60);
  return c;
}

function bridgeTile() {
  const [c, g] = mk(16, 16);
  R(g, 0, 0, 16, 16, PAL.wood);
  for (let x = 0; x < 16; x += 4) { R(g, x, 0, 1, 16, PAL.woodD); R(g, x + 1, 0, 1, 16, PAL.woodL); }
  P(g, 2, 3, PAL.woodXD); P(g, 6, 11, PAL.woodXD); P(g, 10, 6, PAL.woodXD); P(g, 14, 13, PAL.woodXD);
  return c;
}

function fieldTile(seed) {
  const [c, g] = mk(16, 16);
  R(g, 0, 0, 16, 16, PAL.field);
  speckle(g, 16, 16, [PAL.fieldD, PAL.grassD, PAL.dirtD], 0.25, seed + 80);
  return c;
}

function flowerTile(seed) {
  const c = grassTile(seed + 11);
  const g = c.getContext('2d');
  const cols = [PAL.purple, PAL.yellow, PAL.red, PAL.white, PAL.orange];
  for (let i = 0; i < 5; i++) {
    const x = 1 + Math.floor(hash2(i, seed, 13) * 13), y = 1 + Math.floor(hash2(seed, i, 14) * 13);
    const col = cols[Math.floor(hash2(i, i, seed) * cols.length)];
    P(g, x, y + 1, PAL.leafG); P(g, x, y, col); P(g, x + 1, y, shade(col, 0.2)); P(g, x - 1, y, shade(col, -0.15)); P(g, x, y - 1, shade(col, 0.1));
  }
  return c;
}

function soilTile(wet) {
  const [c, g] = mk(16, 16);
  const base = wet ? PAL.soilWet : PAL.soil, dark = wet ? PAL.soilWetD : PAL.soilD;
  R(g, 1, 1, 14, 14, base);
  for (let y = 3; y < 15; y += 4) R(g, 2, y, 12, 1, dark);
  R(g, 1, 1, 14, 1, shade(base, 0.12));
  // wet soil: darker, with a soft glossy sheen along the furrows (no dots: they read as seeds)
  if (wet) for (let y = 2; y < 15; y += 4) R(g, 3, y, 10, 1, '#5e4a3e');
  return c;
}

function floorTile(kind, seed) {
  const [c, g] = mk(16, 16);
  if (kind === 'stone') {
    R(g, 0, 0, 16, 16, '#857f73');
    R(g, 0, 0, 8, 8, '#8f897c'); R(g, 8, 8, 8, 8, '#8f897c');
    R(g, 0, 7, 16, 1, '#6f6a5f'); R(g, 7, 0, 1, 16, '#6f6a5f');
  } else {
    R(g, 0, 0, 16, 16, '#9a6a44');
    for (let y = 0; y < 16; y += 4) { R(g, 0, y + 3, 16, 1, '#7a5134'); R(g, 0, y, 16, 1, '#a9784f'); }
    const off = (seed % 2) * 8;
    R(g, off, 0, 1, 4, '#7a5134'); R(g, (off + 5) % 16, 4, 1, 4, '#7a5134'); R(g, (off + 11) % 16, 8, 1, 4, '#7a5134'); R(g, (off + 3) % 16, 12, 1, 4, '#7a5134');
  }
  return c;
}

function wallTiles(name) {
  const [a, b] = WALLPAPER[name] || WALLPAPER.farm;
  const [top, gt] = mk(16, 16);
  R(gt, 0, 0, 16, 16, a);
  R(gt, 0, 0, 16, 2, '#3b2c26'); R(gt, 0, 2, 16, 1, shade(a, 0.2));
  for (let x = 2; x < 16; x += 5) R(gt, x, 4, 1, 12, b);
  const [low, gl] = mk(16, 16);
  R(gl, 0, 0, 16, 16, a);
  for (let x = 2; x < 16; x += 5) R(gl, x, 0, 1, 10, b);
  R(gl, 0, 10, 16, 6, '#7a5134'); R(gl, 0, 10, 16, 1, '#a9784f'); R(gl, 0, 15, 16, 1, '#4e3020');
  const [edge, ge] = mk(16, 16);
  R(ge, 0, 0, 16, 16, '#2e2326');
  R(ge, 0, 0, 16, 1, '#3d3034');
  // a wall window used on some upper wall tiles
  const [win, gw] = mk(16, 16);
  gw.drawImage(top, 0, 0);
  R(gw, 3, 4, 10, 9, '#5a3c28'); R(gw, 4, 5, 8, 7, PAL.glass); R(gw, 4, 5, 8, 2, PAL.glassL); R(gw, 7, 5, 1, 7, '#5a3c28'); R(gw, 4, 8, 8, 1, '#5a3c28');
  const [winLit, gwl] = mk(16, 16);
  gwl.drawImage(top, 0, 0);
  R(gwl, 3, 4, 10, 9, '#5a3c28'); R(gwl, 4, 5, 8, 7, '#2a3550'); P(gwl, 9, 6, '#e8e8f0'); R(gwl, 7, 5, 1, 7, '#5a3c28'); R(gwl, 4, 8, 8, 1, '#5a3c28');
  return { top, low, edge, win, winNight: winLit };
}

function matTile() {
  const [c, g] = mk(16, 16);
  R(g, 0, 0, 16, 16, '#2e2326');
  R(g, 2, 2, 12, 12, '#8c3b33'); R(g, 3, 3, 10, 10, '#a8503e');
  for (let x = 4; x < 12; x += 2) R(g, x, 4, 1, 8, '#8c3b33');
  return c;
}

function fenceTiles() {
  const post = (g, x) => { R(g, x, 3, 3, 12, PAL.woodD); R(g, x, 3, 3, 1, PAL.woodL); R(g, x + 1, 4, 1, 10, PAL.wood); };
  const [h, gh] = mk(16, 16);
  R(gh, 0, 6, 16, 2, PAL.wood); R(gh, 0, 10, 16, 2, PAL.wood); R(gh, 0, 6, 16, 1, PAL.woodL); R(gh, 0, 10, 16, 1, PAL.woodL);
  post(gh, 6);
  const [v, gv] = mk(16, 16);
  R(gv, 6, 0, 3, 16, PAL.woodD); R(gv, 7, 0, 1, 16, PAL.wood); R(gv, 6, 0, 1, 16, PAL.woodL);
  return { h, v };
}

// ---------------------------------------------------------------- crops & debris
function cropSprites() {
  const out = {};
  const stem = (g, x, y, h) => R(g, x, y, 1, h, PAL.leafG);
  const leaf = (g, x, y, col = '#6f8f3a') => { R(g, x, y, 2, 1, col); P(g, x + 1, y - 1, shade(col, 0.2)); };
  const seedStage = () => { const [c, g] = mk(16, 16); P(g, 5, 9, '#3a2a1c'); P(g, 9, 7, '#3a2a1c'); P(g, 10, 11, '#3a2a1c'); return c; };
  const sprout = (col = '#7d9a40') => { const [c, g] = mk(16, 16); stem(g, 7, 8, 4); leaf(g, 5, 8, col); leaf(g, 8, 7, col); return c; };

  // turnip
  {
    const mid = (() => { const [c, g] = mk(16, 16); stem(g, 7, 5, 6); leaf(g, 4, 6); leaf(g, 9, 5); leaf(g, 5, 3, '#86a34a'); leaf(g, 8, 2, '#86a34a'); R(g, 6, 11, 4, 2, PAL.turnipP); return c; })();
    const ripe = (() => {
      const [c, g] = mk(16, 16);
      leaf(g, 4, 4); leaf(g, 9, 3); leaf(g, 6, 2, '#86a34a'); stem(g, 7, 3, 5);
      R(g, 4, 8, 8, 5, PAL.turnip); R(g, 4, 8, 8, 2, PAL.turnipP); R(g, 5, 13, 6, 1, PAL.turnip); P(g, 7, 14, '#c9b9b9');
      P(g, 5, 10, '#ffffff');
      return c;
    })();
    out.turnip = [seedStage(), sprout(), mid, ripe];
  }
  // garlic
  {
    const mid = (() => { const [c, g] = mk(16, 16); for (const x of [5, 7, 9]) stem(g, x, 3 + (x % 3), 9 - (x % 3)); R(g, 6, 11, 4, 2, PAL.garlicD); return c; })();
    const ripe = (() => {
      const [c, g] = mk(16, 16);
      for (const x of [5, 7, 9]) stem(g, x, 1 + (x % 3), 7);
      R(g, 4, 8, 8, 5, PAL.garlic); R(g, 5, 7, 6, 1, PAL.garlic); R(g, 7, 8, 1, 5, PAL.garlicD); R(g, 5, 13, 6, 1, PAL.garlicD);
      P(g, 5, 9, '#ffffff');
      return c;
    })();
    out.garlic = [seedStage(), sprout('#8fa45a'), mid, ripe];
  }
  // pumpkin
  {
    const vine = (() => { const [c, g] = mk(16, 16); R(g, 3, 10, 10, 1, PAL.leafG); leaf(g, 3, 9); leaf(g, 10, 9); leaf(g, 6, 8, '#86a34a'); return c; })();
    const flower = (() => { const c = vine.cloneNode(); const g = c.getContext('2d'); g.drawImage(vine, 0, 0); R(g, 7, 6, 2, 2, PAL.yellow); P(g, 7, 6, '#fff0a0'); return c; })();
    const small = (() => { const c = vine.cloneNode(); const g = c.getContext('2d'); g.drawImage(vine, 0, 0); R(g, 6, 9, 5, 4, PAL.pumpkinD); R(g, 6, 9, 5, 1, PAL.leafG); return c; })();
    const ripe = (() => {
      const [c, g] = mk(16, 16);
      R(g, 2, 13, 12, 1, PAL.leafG); leaf(g, 1, 12); leaf(g, 12, 12);
      R(g, 2, 6, 12, 8, PAL.pumpkin); R(g, 3, 5, 10, 10, PAL.pumpkin); R(g, 5, 5, 1, 10, PAL.pumpkinD); R(g, 10, 5, 1, 10, PAL.pumpkinD); R(g, 7, 6, 2, 8, PAL.pumpkinD);
      R(g, 7, 3, 2, 3, PAL.leafB); P(g, 4, 7, '#f7a44a'); P(g, 4, 8, '#f7a44a');
      return c;
    })();
    out.pumpkin = [seedStage(), vine, flower, small, ripe];
  }
  // cranberry (regrows): a low bush that fills with red berries
  {
    const bushy = (berries) => {
      const [c, g] = mk(16, 16);
      R(g, 3, 8, 10, 6, '#4f6a2e'); R(g, 4, 6, 8, 3, '#5f7f3a'); R(g, 5, 7, 3, 1, '#7d9a48'); R(g, 3, 14, 10, 1, '#3c4622');
      if (berries) for (const [x, y] of [[4, 9], [7, 8], [10, 10], [6, 11], [9, 7], [11, 12], [5, 12]]) { R(g, x, y, 2, 2, '#b8283a'); P(g, x, y, '#e8606a'); }
      return c;
    };
    out.cranberry = [seedStage(), sprout('#6f8f3a'), bushy(false), bushy(true)];
  }
  return out;
}

function debrisSprites() {
  const [w, gw] = mk(16, 16);
  for (let i = 0; i < 7; i++) {
    const x = 2 + i * 2 - (i % 2), h = 4 + ((i * 7) % 5);
    R(gw, x, 14 - h, 1, h, i % 2 ? '#7d8c3a' : '#5e6b2c'); P(gw, x + 1, 14 - h, '#97a54a');
  }
  const [t, gt] = mk(16, 16);
  R(gt, 2, 10, 11, 2, PAL.trunk); R(gt, 4, 7, 2, 3, PAL.trunk); R(gt, 9, 12, 4, 1, PAL.woodD); P(gt, 3, 10, PAL.woodL); R(gt, 8, 6, 6, 1, PAL.leafB);
  const [b, gb] = mk(16, 16);
  R(gb, 2, 6, 12, 8, '#4f5a2c'); R(gb, 3, 5, 10, 2, '#5e6b33');
  for (const [x, y] of [[3, 7], [7, 6], [11, 8], [5, 11], [9, 12]]) { P(gb, x, y, '#a9452f'); P(gb, x + 1, y - 1, '#d7c39a'); }
  return { weeds: w, twigs: t, bramble: b };
}

// ---------------------------------------------------------------- objects
function tree(variant) {
  const cols = [[PAL.leafO, '#a75a24', '#e6a052'], [PAL.leafR, '#7f3424', '#cf6a4a'], [PAL.leafY, '#a87c2a', '#ecc56a'], [PAL.leafG, '#4f5c28', '#8c9a4c']][variant];
  const [c, g] = mk(32, 44);
  // shadow + trunk
  R(g, 13, 30, 6, 14, PAL.trunk); R(g, 13, 30, 2, 14, shade(PAL.trunk, 0.15)); R(g, 11, 42, 10, 2, shade(PAL.trunk, -0.2));
  // canopy: stacked blobs
  const blob = (cx, cy, r, col) => {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) P(g, cx + x, cy + y, col);
  };
  blob(16, 18, 12, cols[1]);
  blob(15, 16, 11, cols[0]);
  blob(11, 13, 6, cols[2]); blob(10, 12, 3, shade(cols[2], 0.2));
  blob(21, 20, 5, shade(cols[0], -0.08));
  for (let i = 0; i < 18; i++) {
    const x = 6 + Math.floor(hash2(i, variant, 5) * 20), y = 6 + Math.floor(hash2(variant, i, 6) * 20);
    P(g, x, y, hash2(i, i, variant) < 0.5 ? cols[1] : cols[2]);
  }
  return c;
}

function bush() {
  const [c, g] = mk(16, 16);
  R(g, 2, 6, 12, 9, '#566a2e'); R(g, 3, 4, 10, 3, '#64773a'); R(g, 4, 5, 4, 2, '#7d8f48');
  P(g, 5, 9, PAL.leafR); P(g, 10, 7, PAL.leafR); P(g, 8, 11, PAL.leafR); R(g, 3, 15, 10, 1, '#3c4622');
  return c;
}
function rock() {
  const [c, g] = mk(16, 16);
  R(g, 3, 7, 11, 7, PAL.stoneD); R(g, 4, 5, 8, 4, PAL.stone); R(g, 5, 5, 4, 2, PAL.stoneL); R(g, 3, 14, 11, 1, '#5a564f');
  return c;
}

function bin() {
  const [c, g] = mk(16, 20);
  R(g, 1, 7, 14, 12, PAL.wood); R(g, 1, 7, 14, 1, PAL.woodL); R(g, 1, 18, 14, 1, PAL.woodXD);
  for (let x = 4; x < 16; x += 4) R(g, x, 8, 1, 10, PAL.woodD);
  R(g, 0, 4, 16, 4, '#7d4a2c'); R(g, 0, 4, 16, 1, '#a8693f'); R(g, 6, 6, 4, 1, PAL.yellow);
  return c;
}
function workbench() {
  const [c, g] = mk(32, 22);
  R(g, 1, 8, 30, 4, PAL.woodL); R(g, 1, 8, 30, 1, '#c18f60'); R(g, 1, 12, 30, 2, PAL.woodD);
  R(g, 3, 14, 3, 8, PAL.woodD); R(g, 26, 14, 3, 8, PAL.woodD); R(g, 3, 17, 26, 2, PAL.wood);
  // tools on top: garlic bulb, saw, jar
  R(g, 5, 5, 4, 3, PAL.garlic); R(g, 6, 4, 2, 1, PAL.garlic); R(g, 12, 6, 8, 2, '#b0b6ba'); R(g, 19, 5, 3, 3, PAL.wood);
  R(g, 24, 3, 4, 5, '#7fa0b4'); R(g, 24, 3, 4, 1, PAL.woodD);
  return c;
}
function well() {
  const [c, g] = mk(16, 28);
  R(g, 1, 16, 14, 11, PAL.stone); R(g, 1, 16, 14, 2, PAL.stoneL); R(g, 2, 20, 12, 1, PAL.stoneD); R(g, 2, 24, 12, 1, PAL.stoneD);
  R(g, 3, 17, 10, 1, '#2a3550');
  R(g, 2, 5, 2, 12, PAL.woodD); R(g, 12, 5, 2, 12, PAL.woodD);
  R(g, 0, 2, 16, 4, PAL.red); R(g, 0, 2, 16, 1, shade(PAL.red, 0.2)); R(g, 1, 6, 14, 1, shade(PAL.red, -0.3));
  R(g, 4, 9, 8, 1, PAL.trunk); R(g, 7, 10, 2, 4, '#8f8a80');
  return c;
}
function board() {
  const [c, g] = mk(16, 28);
  R(g, 2, 14, 2, 14, PAL.woodD); R(g, 12, 14, 2, 14, PAL.woodD);
  R(g, 0, 3, 16, 14, PAL.wood); R(g, 1, 4, 14, 12, '#c6a77a'); R(g, 0, 1, 16, 3, PAL.woodXD);
  R(g, 2, 5, 5, 6, PAL.white); R(g, 8, 6, 6, 4, '#f0d58a'); R(g, 4, 11, 7, 4, '#e6d8c4'); P(g, 4, 5, PAL.red); P(g, 10, 6, PAL.red); P(g, 7, 11, PAL.red);
  for (const [x, y] of [[3, 7], [3, 9], [9, 8], [5, 13]]) R(g, x, y, 3, 1, '#7a6a5a');
  return c;
}
function fountain(frame) {
  const [c, g] = mk(32, 36);
  R(g, 1, 18, 30, 16, PAL.stone); R(g, 1, 18, 30, 2, PAL.stoneL); R(g, 1, 33, 30, 1, PAL.stoneD);
  R(g, 4, 21, 24, 9, PAL.water); R(g, 4, 21, 24, 1, PAL.waterD);
  R(g, 13, 6, 6, 18, PAL.stone); R(g, 13, 6, 2, 18, PAL.stoneL); R(g, 10, 6, 12, 3, PAL.stoneD);
  const o = frame * 2;
  for (const [x, y] of [[9, 10 + o], [22, 11 + o], [11, 15 - o], [20, 14 - o]]) R(g, x, y, 1, 3, PAL.waterL);
  R(g, 15, 2, 2, 4, PAL.waterL); P(g, 14, 3, PAL.waterL); P(g, 17, 3, PAL.waterL);
  for (const [x, y] of [[7, 24], [16, 26], [23, 23]]) R(g, (x + frame * 3) % 22 + 5, y, 3, 1, PAL.waterL);
  return c;
}
function stall() {
  const [c, g] = mk(32, 30);
  R(g, 2, 8, 2, 20, PAL.woodD); R(g, 28, 8, 2, 20, PAL.woodD);
  for (let x = 0; x < 32; x += 8) { R(g, x, 2, 4, 8, PAL.red); R(g, x + 4, 2, 4, 8, PAL.cream); }
  R(g, 0, 9, 32, 1, shade(PAL.red, -0.3));
  R(g, 1, 18, 30, 10, PAL.wood); R(g, 1, 18, 30, 1, PAL.woodL);
  // pies!
  for (const x of [4, 13, 22]) { R(g, x, 14, 7, 4, '#d8a25a'); R(g, x + 1, 13, 5, 1, '#e8b86a'); P(g, x + 2, 15, '#a86a2a'); P(g, x + 4, 15, '#a86a2a'); }
  return c;
}
function bench() {
  const [c, g] = mk(32, 16);
  R(g, 1, 4, 30, 3, PAL.woodL); R(g, 1, 8, 30, 3, PAL.wood); R(g, 1, 4, 30, 1, '#c18f60');
  R(g, 3, 11, 2, 4, PAL.ink); R(g, 27, 11, 2, 4, PAL.ink);
  return c;
}
function lamp(lit) {
  const [c, g] = mk(16, 32);
  R(g, 7, 8, 2, 23, '#3a3438'); R(g, 5, 29, 6, 3, '#3a3438');
  R(g, 4, 2, 8, 7, '#3a3438'); R(g, 5, 3, 6, 5, lit ? PAL.lit : '#8a8478'); if (lit) R(g, 6, 4, 2, 2, PAL.litL);
  R(g, 3, 1, 10, 2, '#2a2428');
  return c;
}
function sign() {
  const [c, g] = mk(16, 20);
  R(g, 7, 8, 2, 12, PAL.woodD);
  R(g, 1, 3, 14, 7, PAL.wood); R(g, 1, 3, 14, 1, PAL.woodL);
  R(g, 3, 6, 6, 1, PAL.cream); R(g, 9, 5, 2, 3, PAL.cream); P(g, 11, 6, PAL.cream);
  return c;
}

// furniture -------------------------------------------------------
function furniture() {
  const f = {};
  {
    const [c, g] = mk(16, 34);
    R(g, 1, 6, 14, 27, PAL.woodD); R(g, 1, 4, 14, 4, PAL.wood); R(g, 1, 4, 14, 1, PAL.woodL);
    R(g, 2, 8, 12, 6, PAL.white); R(g, 3, 9, 10, 4, '#e8e2d6');
    R(g, 2, 14, 12, 17, '#7d5a8e'); R(g, 2, 14, 12, 2, '#9878a8'); for (let y = 18; y < 31; y += 4) R(g, 2, y, 12, 1, '#6a4a7a');
    f.bed = c;
  }
  {
    const [c, g] = mk(16, 34);
    R(g, 1, 8, 14, 25, PAL.woodD); R(g, 2, 9, 12, 5, PAL.white); R(g, 2, 14, 12, 17, '#6f8a5a'); R(g, 2, 14, 12, 2, '#86a06e');
    f.cot = c;
  }
  {
    const [c, g] = mk(16, 26);
    R(g, 1, 8, 14, 17, '#3d3a3e'); R(g, 1, 8, 14, 2, '#5a565c'); R(g, 3, 14, 10, 7, '#2a2628'); R(g, 4, 16, 8, 4, PAL.orange); R(g, 6, 17, 4, 2, PAL.yellow);
    R(g, 10, 0, 3, 9, '#3d3a3e'); R(g, 3, 5, 6, 3, '#6a6a70');
    f.stove = c;
  }
  {
    const [c, g] = mk(32, 20);
    R(g, 1, 4, 30, 8, PAL.woodL); R(g, 1, 4, 30, 1, '#c18f60'); R(g, 1, 12, 30, 2, PAL.woodD);
    R(g, 3, 14, 2, 6, PAL.woodD); R(g, 27, 14, 2, 6, PAL.woodD);
    R(g, 6, 2, 4, 3, PAL.white); R(g, 20, 1, 3, 4, '#7fa0b4'); R(g, 20, 0, 3, 1, PAL.purple);
    f.table = c;
  }
  {
    const [c, g] = mk(16, 16);
    R(g, 1, 4, 14, 11, PAL.wood); R(g, 1, 4, 14, 4, PAL.woodL); R(g, 1, 8, 14, 1, PAL.woodXD); R(g, 7, 7, 2, 3, PAL.yellow); R(g, 1, 15, 14, 1, PAL.woodXD);
    f.chest = c;
  }
  {
    const [c, g] = mk(16, 30);
    R(g, 1, 2, 14, 28, PAL.woodD); R(g, 2, 3, 12, 25, PAL.wood); R(g, 7, 3, 1, 25, PAL.woodXD); P(g, 6, 15, PAL.yellow); P(g, 9, 15, PAL.yellow);
    R(g, 1, 1, 14, 2, PAL.woodXD);
    f.wardrobe = c;
  }
  {
    const [c, g] = mk(16, 30);
    R(g, 1, 2, 14, 28, PAL.woodD);
    const bookCols = [PAL.red, PAL.teal, PAL.yellow, PAL.purple, PAL.green, PAL.cream];
    for (let row = 0; row < 3; row++) {
      const y = 4 + row * 8;
      R(g, 2, y + 6, 12, 1, PAL.woodXD);
      for (let x = 2; x < 14; x += 2) R(g, x, y + (x % 3 === 0 ? 1 : 0), 2, 6 - (x % 3 === 0 ? 1 : 0), bookCols[(x + row * 3) % bookCols.length]);
    }
    f.bookshelf = c;
  }
  {
    const [c, g] = mk(16, 22);
    R(g, 4, 14, 8, 7, '#a8503e'); R(g, 3, 13, 10, 2, '#c0644c');
    for (const [x, y] of [[8, 2], [4, 5], [11, 5], [6, 8], [10, 9], [3, 10], [8, 11]]) { R(g, x - 1, y, 3, 2, '#5f7f3a'); P(g, x, y - 1, '#7d9a48'); }
    R(g, 7, 4, 1, 10, '#4a6a2a');
    f.plant = c;
  }
  {
    const [c, g] = mk(48, 32);
    R(g, 2, 2, 44, 28, '#8c3b33'); R(g, 4, 4, 40, 24, '#a8503e'); R(g, 8, 8, 32, 16, '#c9a04a'); R(g, 10, 10, 28, 12, '#a8503e');
    f.rug = c;
  }
  {
    const [c, g] = mk(48, 28);
    R(g, 1, 1, 46, 26, PAL.woodD);
    const goods = [PAL.yellow, PAL.red, PAL.cream, PAL.teal, PAL.orange, PAL.purple, PAL.green];
    for (let row = 0; row < 2; row++) {
      R(g, 2, 12 + row * 12, 44, 1, PAL.woodXD);
      for (let x = 3; x < 45; x += 4) R(g, x, 6 + row * 12, 3, 6, goods[(x + row) % goods.length]);
    }
    f.shelf = c;
  }
  {
    const [c, g] = mk(64, 22);
    R(g, 0, 6, 64, 15, PAL.wood); R(g, 0, 4, 64, 4, PAL.woodL); R(g, 0, 4, 64, 1, '#c18f60'); R(g, 0, 20, 64, 2, PAL.woodXD);
    for (let x = 8; x < 64; x += 16) R(g, x, 9, 1, 11, PAL.woodD);
    R(g, 44, 0, 10, 5, '#5a565c'); R(g, 46, 1, 6, 2, PAL.yellow); R(g, 8, 1, 6, 4, PAL.pumpkin); R(g, 18, 2, 5, 3, PAL.turnip);
    f.counter = c;
  }
  {
    const [c, g] = mk(16, 20);
    R(g, 2, 4, 12, 15, PAL.wood); R(g, 2, 4, 12, 2, PAL.woodL); R(g, 2, 9, 12, 1, '#5a565c'); R(g, 2, 15, 12, 1, '#5a565c');
    f.barrel = c;
  }
  {
    const [c, g] = mk(16, 16);
    R(g, 1, 3, 14, 12, PAL.woodL); R(g, 1, 3, 14, 1, '#c18f60'); R(g, 1, 3, 1, 12, PAL.woodD); R(g, 14, 3, 1, 12, PAL.woodD); R(g, 2, 8, 12, 1, PAL.woodD);
    f.crate = c;
  }
  {
    const [c, g] = mk(32, 22);
    R(g, 1, 6, 30, 15, PAL.woodD); R(g, 1, 4, 30, 4, PAL.wood); R(g, 1, 4, 30, 1, PAL.woodL);
    R(g, 5, 0, 8, 5, PAL.white); R(g, 6, 1, 6, 1, '#9a9a9a'); R(g, 6, 3, 5, 1, '#9a9a9a'); R(g, 20, 1, 3, 4, PAL.ink); P(g, 21, 0, PAL.white);
    R(g, 12, 12, 8, 2, PAL.yellow);
    f.desk = c;
  }
  {
    const [c, g] = mk(32, 26);
    R(g, 8, 10, 16, 16, PAL.woodD); R(g, 10, 12, 12, 12, PAL.wood);
    R(g, 4, 4, 24, 7, PAL.woodL); R(g, 4, 4, 24, 1, '#c18f60'); R(g, 4, 10, 24, 1, PAL.woodXD);
    R(g, 13, 14, 6, 6, PAL.yellow); R(g, 15, 15, 2, 4, PAL.red); // seal of the village
    f.lectern = c;
  }
  return f;
}

// ---------------------------------------------------------------- buildings
function building(def) {
  const W = def.w * 16, H = def.h * 16, TOP = 12;
  const [c, g] = mk(W, H + TOP);
  const windows = [];
  const doorX = def.door * 16;
  const wallTop = H + TOP - 40; // walls are the lowest 40px
  const style = def.style;
  const roofCol = ROOFS[def.roof || style] || ROOFS.red;
  let wallCol = WALLS[def.walls || 'cream'];
  if (style === 'farmhouse') wallCol = WALLS.plank;
  if (style === 'store') wallCol = WALLS.cream;
  if (style === 'hall') wallCol = '#b6b0a2';

  // walls
  R(g, 2, wallTop, W - 4, 40, wallCol);
  if (style === 'farmhouse' || def.walls === 'plank') for (let y = wallTop + 3; y < H + TOP; y += 4) R(g, 2, y, W - 4, 1, shade(wallCol, -0.18));
  if (def.walls === 'brick') for (let y = wallTop + 2; y < H + TOP; y += 4) for (let x = 2 + (Math.floor(y / 4) % 2) * 4; x < W - 2; x += 8) { R(g, x, y, 1, 3, shade(wallCol, -0.2)); R(g, 2, y + 3, W - 4, 1, shade(wallCol, -0.12)); }
  if (style === 'hall') { for (let x = 6; x < W - 4; x += 24) { R(g, x, wallTop + 2, 4, 38, PAL.stoneL); R(g, x + 3, wallTop + 2, 1, 38, PAL.stoneD); } }
  R(g, 2, wallTop, W - 4, 2, shade(wallCol, -0.35));
  R(g, 2, H + TOP - 3, W - 4, 3, shade(wallCol, -0.3));

  // roof (sloped shingles, slight overhang)
  const roofH = wallTop + 2;
  for (let y = 0; y < roofH; y++) {
    const inset = Math.max(0, Math.round(6 - y * 0.5));
    const rowCol = Math.floor(y / 4) % 2 ? roofCol : shade(roofCol, 0.08);
    R(g, inset, y, W - inset * 2, 1, rowCol);
    if (y % 4 === 3) for (let x = inset + ((y >> 2) % 2) * 3; x < W - inset; x += 6) P(g, x, y, shade(roofCol, -0.25));
  }
  R(g, 0, roofH - 2, W, 2, shade(roofCol, -0.35));
  R(g, 6, 0, W - 12, 2, shade(roofCol, 0.25));
  if (style === 'farmhouse') { R(g, 30, 8, 12, 7, '#7a6a52'); R(g, 31, 9, 10, 1, '#958466'); } // patched roof
  if (style !== 'hall') { R(g, W - 22, 0, 8, 10, '#7a4a3a'); R(g, W - 23, 0, 10, 2, '#5a3428'); } // chimney

  // door
  const dw = style === 'hall' ? 14 : 10;
  const dx = doorX + (16 - dw) / 2;
  R(g, dx - 1, H + TOP - 19, dw + 2, 19, shade(wallCol, -0.45));
  R(g, dx, H + TOP - 18, dw, 18, style === 'store' ? '#5d7a4a' : style === 'hall' ? '#6a4229' : '#7a4a30');
  R(g, dx + 1, H + TOP - 17, dw - 2, 1, '#a8744a');
  P(g, dx + dw - 3, H + TOP - 9, PAL.yellow);
  if (style === 'hall') R(g, dx + dw / 2, H + TOP - 18, 1, 18, PAL.woodXD);

  // windows (not on the door column)
  const winY = wallTop + 10;
  for (let col = 0; col < def.w; col++) {
    if (col === def.door) continue;
    if (style === 'house' && col !== 1 && col !== def.w - 2) continue;
    if (style === 'farmhouse' && col !== 1 && col !== 5) continue;
    if ((style === 'store' || style === 'hall') && (col === 0 || col === def.w - 1)) continue;
    if (style === 'store' && col % 2 === 0 && col !== 2) continue;
    if (style === 'hall' && col % 2 === 1) continue;
    const x = col * 16 + 3;
    R(g, x - 1, winY - 1, 12, 13, shade(wallCol, -0.45));
    R(g, x, winY, 10, 11, PAL.glass); R(g, x, winY, 10, 3, PAL.glassL);
    R(g, x + 4, winY, 1, 11, shade(wallCol, -0.45)); R(g, x, winY + 5, 10, 1, shade(wallCol, -0.45));
    R(g, x - 2, winY + 11, 14, 2, shade(wallCol, -0.25)); // sill
    if (style === 'house' || style === 'farmhouse') { P(g, x - 1, winY + 10, PAL.leafR); P(g, x + 10, winY + 10, PAL.leafO); }
    windows.push([x, winY, 10, 11]);
  }

  if (style === 'store') {
    for (let x = 4; x < W - 4; x += 8) { R(g, x, wallTop - 4, 4, 7, PAL.red); R(g, x + 4, wallTop - 4, 4, 7, PAL.cream); }
    R(g, 4, wallTop + 3, W - 8, 1, shade(PAL.red, -0.3));
    // pictogram sign: a sack of coins
    R(g, W / 2 - 14, 14, 28, 13, PAL.woodD); R(g, W / 2 - 13, 15, 26, 11, PAL.cream);
    R(g, W / 2 - 4, 18, 8, 7, '#b08a5a'); R(g, W / 2 - 2, 16, 4, 2, '#b08a5a'); P(g, W / 2, 21, PAL.yellow);
    R(g, W / 2 - 11, 22, 4, 2, PAL.yellow); R(g, W / 2 + 7, 22, 4, 2, PAL.yellow);
  }
  if (style === 'hall') {
    // pediment with clock + flag
    R(g, W / 2 - 8, 6, 16, 16, PAL.stoneL); R(g, W / 2 - 6, 8, 12, 12, PAL.cream); R(g, W / 2 - 1, 10, 1, 5, PAL.ink); R(g, W / 2 - 1, 14, 4, 1, PAL.ink);
    R(g, W - 14, 0, 1, 12, PAL.ink); R(g, W - 13, 0, 8, 5, PAL.orange); R(g, W - 13, 2, 8, 1, PAL.yellow);
    R(g, doorX - 4, H + TOP - 3, 24, 3, PAL.stoneL);
  }
  if (style === 'farmhouse') { R(g, doorX - 4, H + TOP - 4, 24, 4, PAL.woodD); R(g, doorX - 4, H + TOP - 4, 24, 1, PAL.woodL); }
  return { canvas: c, windows, top: TOP };
}

// ---------------------------------------------------------------- characters
// 16x32 frames. dir: down|up|left (right = mirrored left). frame: 0 idle, 1..4 walk.
function drawChar(g, L, dir, frame) {
  const tall = L.height || 0;
  const feet = 31;
  const legTop = feet - 3;
  const torsoH = 6 + tall;
  const torsoTop = legTop - torsoH;
  const bob = frame === 2 || frame === 4 ? -1 : 0;
  const headTop = torsoTop - 10 + bob;
  const skin = L.skin, skinD = shade(L.skin, -0.18);
  const shirt = L.shirt, shirtD = shade(L.shirt, -0.25);
  const pants = L.pants, shoes = '#3a2a24';
  const hair = L.hair, hairD = shade(L.hair, -0.25);
  const side = dir === 'left';

  // legs + feet
  let lA = 0, lB = 0;
  if (frame === 1) { lA = 1; lB = -1; } else if (frame === 3) { lA = -1; lB = 1; }
  if (side) {
    const spread = frame === 1 || frame === 3;
    const xs = spread ? [5, 9] : [6, 8];
    xs.forEach((x, i) => { R(g, x, legTop + bob, 2, 3, pants); R(g, x - (i === 0 ? 1 : 0), feet, 3, 1, shoes); });
  } else {
    R(g, 5, legTop + bob, 2, 3 + lA, pants); R(g, 9, legTop + bob, 2, 3 + lB, pants);
    R(g, 5, feet + Math.min(0, lA), 2, 1, shoes); R(g, 9, feet + Math.min(0, lB), 2, 1, shoes);
  }

  // torso
  const tx = side ? 5 : 4, tw = side ? 6 : 8;
  R(g, tx, torsoTop + bob, tw, torsoH, shirt);
  R(g, tx, torsoTop + bob + torsoH - 1, tw, 1, shirtD);
  if (L.overalls) { R(g, tx, torsoTop + bob + 3, tw, torsoH - 3, L.overalls); if (!side) { R(g, 5, torsoTop + bob, 1, 3, L.overalls); R(g, 10, torsoTop + bob, 1, 3, L.overalls); } }
  if (L.waistcoat && dir !== 'up') { R(g, tx, torsoTop + bob, 2, torsoH, L.waistcoat); R(g, tx + tw - 2, torsoTop + bob, 2, torsoH, L.waistcoat); P(g, 7, torsoTop + bob + 3, PAL.yellow); }
  if (L.apron && dir === 'down') R(g, 5, torsoTop + bob + 2, 6, torsoH - 1, L.apron);
  if (L.apron && side) R(g, 4, torsoTop + bob + 2, 2, torsoH - 1, L.apron);

  // arms (swing)
  const swing = frame === 1 ? 1 : frame === 3 ? -1 : 0;
  if (side) {
    const ax = 7 + swing;
    R(g, ax, torsoTop + bob + 1, 2, torsoH - 2, shirtD); P(g, ax, torsoTop + bob + torsoH - 1, skin); P(g, ax + 1, torsoTop + bob + torsoH - 1, skin);
  } else {
    R(g, 3, torsoTop + bob + 1 + swing, 1, torsoH - 2, shirtD); P(g, 3, torsoTop + bob + torsoH - 1 + swing, skin);
    R(g, 12, torsoTop + bob + 1 - swing, 1, torsoH - 2, shirtD); P(g, 12, torsoTop + bob + torsoH - 1 - swing, skin);
  }

  // head
  const hx = side ? 4 : 3, hw = side ? 8 : 10;
  R(g, hx, headTop + 1, hw, 9, skin);
  R(g, hx + 1, headTop, hw - 2, 1, skin);
  R(g, hx + 1, headTop + 10, hw - 2, 1, skinD);
  if (dir === 'down') {
    R(g, 5, headTop + 5, 1, 2, PAL.ink); R(g, 10, headTop + 5, 1, 2, PAL.ink);
    P(g, 4, headTop + 7, '#e39a8a'); P(g, 11, headTop + 7, '#e39a8a');
    P(g, 7, headTop + 8, skinD); P(g, 8, headTop + 8, skinD);
    if (L.glasses) { R(g, 4, headTop + 4, 3, 1, '#d8d4c8'); R(g, 9, headTop + 4, 3, 1, '#d8d4c8'); P(g, 7, headTop + 5, '#d8d4c8'); P(g, 8, headTop + 5, '#d8d4c8'); }
  } else if (side) {
    R(g, 5, headTop + 5, 1, 2, PAL.ink); P(g, 3, headTop + 6, skin); P(g, 5, headTop + 7, '#e39a8a');
    if (L.glasses) { R(g, 4, headTop + 4, 3, 1, '#d8d4c8'); }
  }

  // hair
  const style = L.hairStyle;
  if (style !== 'bald') {
    if (dir === 'up') {
      R(g, hx, headTop, hw, 8, hair); R(g, hx + 1, headTop - 1, hw - 2, 1, hair);
      if (style === 'long' || style === 'curly') R(g, hx, headTop + 8, hw, 3, hairD);
    } else if (side) {
      R(g, hx + 1, headTop - 1, hw - 2, 3, hair); R(g, hx + 4, headTop + 2, 4, 4, hair); P(g, hx, headTop + 2, hair);
      if (style === 'long' || style === 'curly') R(g, hx + 5, headTop + 6, 3, 6, hairD);
    } else {
      R(g, hx, headTop, hw, 3, hair); R(g, hx + 1, headTop - 1, hw - 2, 1, hair);
      R(g, hx, headTop + 3, 1, 3, hair); R(g, hx + hw - 1, headTop + 3, 1, 3, hair);
      if (style === 'long' || style === 'curly') { R(g, hx - 1, headTop + 2, 1, 8, hairD); R(g, hx + hw, headTop + 2, 1, 8, hairD); }
    }
    if (style === 'bun') { R(g, 6, headTop - 4, 4, 3, hair); P(g, 7, headTop - 4, shade(hair, 0.2)); }
    if (style === 'messy') { P(g, hx + 2, headTop - 2, hair); P(g, hx + 5, headTop - 2, hair); P(g, hx + 7, headTop - 2, hairD); }
    if (style === 'curly') for (let x = hx; x < hx + hw; x += 2) P(g, x, headTop - 1, hairD);
    R(g, hx + 1, headTop, hw - 3, 1, shade(hair, 0.18));
  } else if (dir !== 'down' || true) {
    R(g, hx, headTop + 3, 1, 3, hair); R(g, hx + hw - 1, headTop + 3, 1, 3, hair);
  }
  if (L.beard && dir !== 'up') {
    if (side) { R(g, 4, headTop + 7, 5, 4, L.beard); P(g, 4, headTop + 6, L.beard); }
    else { R(g, 4, headTop + 7, 8, 4, L.beard); R(g, 5, headTop + 11, 6, 1, L.beard); P(g, 7, headTop + 8, shade(L.beard, -0.3)); P(g, 8, headTop + 8, shade(L.beard, -0.3)); }
  }

  // hats
  const ht = headTop;
  switch (L.hat) {
    case 'straw': R(g, 1, ht + 1, 14, 2, '#d9b45a'); R(g, 4, ht - 3, 8, 4, '#e5c46a'); R(g, 4, ht, 8, 1, PAL.red); P(g, 2, ht + 1, '#b8943f'); break;
    case 'baker': R(g, 4, ht - 5, 8, 6, PAL.white); R(g, 3, ht - 6, 10, 3, PAL.white); R(g, 4, ht, 8, 1, '#d8d2c4'); break;
    case 'tophat': R(g, 2, ht, 12, 1, '#2a2428'); R(g, 4, ht - 7, 8, 7, '#2a2428'); R(g, 4, ht - 2, 8, 1, '#8c3b33'); break;
    case 'captain': R(g, 3, ht - 2, 10, 3, '#2f3f63'); R(g, 3, ht - 3, 10, 1, PAL.white); R(g, side ? 1 : 4, ht + 1, side ? 5 : 8, 1, '#1c1c28'); P(g, 7, ht - 1, PAL.yellow); break;
    case 'beanie': { const hc = L.hatColor || PAL.red; R(g, 3, ht - 2, 10, 4, hc); R(g, 3, ht + 1, 10, 1, shade(hc, -0.25)); P(g, 7, ht - 3, shade(hc, 0.3)); break; }
    default: break;
  }
}

function charSheet(look) {
  const sheet = {};
  for (const dir of ['down', 'up', 'left']) {
    sheet[dir] = [];
    for (let f = 0; f < 5; f++) {
      const [c, g] = mk(16, 32);
      drawChar(g, look, dir, f);
      sheet[dir].push(c);
    }
  }
  sheet.right = sheet.left.map(flip);
  return sheet;
}

// 40x40 bust portrait for dialogue and the notebook.
function portrait(look, bg = '#3d3034') {
  const [c, g] = mk(40, 40);
  R(g, 0, 0, 40, 40, bg);
  R(g, 1, 1, 38, 38, shade(bg, 0.1));
  const skin = look.skin, skinD = shade(skin, -0.2), hair = look.hair, hairD = shade(hair, -0.25);
  // shoulders
  R(g, 6, 31, 28, 9, look.shirt); R(g, 6, 31, 28, 1, shade(look.shirt, 0.2));
  if (look.apron) R(g, 13, 33, 14, 7, look.apron);
  if (look.waistcoat) { R(g, 6, 31, 9, 9, look.waistcoat); R(g, 25, 31, 9, 9, look.waistcoat); }
  if (look.overalls) { R(g, 12, 34, 16, 6, look.overalls); R(g, 13, 31, 2, 4, look.overalls); R(g, 25, 31, 2, 4, look.overalls); }
  R(g, 17, 28, 6, 4, skinD);
  // head
  R(g, 11, 9, 18, 20, skin); R(g, 12, 8, 16, 1, skin); R(g, 12, 29, 16, 1, skinD); R(g, 10, 12, 1, 13, skin); R(g, 29, 12, 1, 13, skin);
  // face
  R(g, 14, 17, 3, 3, PAL.white); R(g, 23, 17, 3, 3, PAL.white); R(g, 15, 17, 2, 3, PAL.ink); R(g, 24, 17, 2, 3, PAL.ink); P(g, 15, 17, PAL.white); P(g, 24, 17, PAL.white);
  R(g, 13, 14, 4, 1, hairD); R(g, 23, 14, 4, 1, hairD);
  R(g, 12, 22, 2, 2, '#e39a8a'); R(g, 26, 22, 2, 2, '#e39a8a');
  R(g, 19, 20, 2, 3, skinD);
  R(g, 17, 25, 6, 1, '#8a4a3a'); P(g, 16, 24, '#8a4a3a'); P(g, 23, 24, '#8a4a3a');
  if (look.glasses) { for (const x of [13, 22]) { R(g, x, 16, 5, 1, '#d8d4c8'); R(g, x, 20, 5, 1, '#d8d4c8'); R(g, x, 16, 1, 5, '#d8d4c8'); R(g, x + 4, 16, 1, 5, '#d8d4c8'); } R(g, 18, 17, 4, 1, '#d8d4c8'); }
  if (look.beard) { R(g, 11, 23, 18, 7, look.beard); R(g, 13, 30, 14, 2, look.beard); R(g, 16, 25, 8, 1, shade(look.beard, -0.3)); }
  // hair
  const s = look.hairStyle;
  if (s !== 'bald') {
    R(g, 10, 6, 20, 6, hair); R(g, 12, 5, 16, 1, hair); R(g, 9, 9, 2, 8, hair); R(g, 29, 9, 2, 8, hair);
    R(g, 13, 6, 8, 1, shade(hair, 0.2));
    if (s === 'long' || s === 'curly') { R(g, 7, 12, 4, 18, hairD); R(g, 29, 12, 4, 18, hairD); }
    if (s === 'curly') for (let x = 9; x < 31; x += 3) R(g, x, 4, 2, 2, hairD);
    if (s === 'bun') { R(g, 15, 0, 10, 6, hair); R(g, 17, 1, 4, 1, shade(hair, 0.2)); }
    if (s === 'messy') { R(g, 12, 3, 2, 3, hair); R(g, 18, 2, 2, 4, hair); R(g, 25, 3, 2, 3, hairD); R(g, 11, 12, 6, 2, hair); }
  } else { R(g, 9, 13, 2, 6, hair); R(g, 29, 13, 2, 6, hair); R(g, 15, 9, 6, 1, shade(skin, 0.25)); }
  // hats
  switch (look.hat) {
    case 'straw': R(g, 3, 8, 34, 3, '#d9b45a'); R(g, 10, 1, 20, 8, '#e5c46a'); R(g, 10, 6, 20, 2, PAL.red); break;
    case 'baker': R(g, 11, 0, 18, 9, PAL.white); R(g, 9, 0, 22, 4, PAL.white); R(g, 11, 8, 18, 1, '#d8d2c4'); break;
    case 'tophat': R(g, 6, 7, 28, 2, '#2a2428'); R(g, 11, 0, 18, 8, '#2a2428'); R(g, 11, 5, 18, 2, '#8c3b33'); break;
    case 'captain': R(g, 9, 3, 22, 6, '#2f3f63'); R(g, 9, 2, 22, 2, PAL.white); R(g, 10, 9, 20, 2, '#1c1c28'); R(g, 18, 4, 4, 3, PAL.yellow); break;
    case 'beanie': { const hc = look.hatColor || PAL.red; R(g, 9, 3, 22, 8, hc); R(g, 9, 10, 22, 2, shade(hc, -0.25)); R(g, 18, 1, 4, 2, shade(hc, 0.3)); break; }
    default: break;
  }
  return c;
}

// A ceramic gnome with hints of the victim's colours.
function gnome(look) {
  const [c, g] = mk(16, 26);
  R(g, 2, 21, 12, 5, PAL.stoneD); R(g, 2, 21, 12, 1, PAL.stoneL);
  const body = shade(look.shirt, 0.1);
  R(g, 4, 13, 8, 8, body); R(g, 4, 13, 2, 8, shade(body, 0.3)); R(g, 3, 15, 1, 4, body); R(g, 12, 15, 1, 4, body);
  R(g, 4, 20, 8, 1, '#3a2a24');
  const beard = look.beard || look.hair || PAL.white;
  R(g, 4, 10, 8, 5, beard); R(g, 5, 15, 6, 1, beard); P(g, 5, 11, shade(beard, 0.3));
  R(g, 5, 7, 6, 4, look.skin); R(g, 6, 8, 1, 1, PAL.ink); R(g, 9, 8, 1, 1, PAL.ink); R(g, 7, 10, 2, 2, '#8a4a3a'); // surprised "o"
  P(g, 5, 9, '#e39a8a'); P(g, 10, 9, '#e39a8a');
  const hat = PAL.gnomeHat;
  R(g, 4, 5, 8, 2, hat); R(g, 5, 3, 6, 2, hat); R(g, 6, 1, 4, 2, hat); R(g, 7, 0, 2, 1, hat); R(g, 5, 4, 1, 1, shade(hat, 0.4)); P(g, 6, 2, '#ffffff');
  P(g, 11, 14, '#ffffff'); // glaze shine
  return c;
}

function sparkleFrames() {
  return [0, 1, 2, 3].map((f) => {
    const [c, g] = mk(11, 11);
    const s = [1, 3, 5, 3][f];
    const col = f % 2 ? PAL.litL : PAL.lit;
    R(g, 5, 5 - s, 1, s * 2 + 1, col); R(g, 5 - s, 5, s * 2 + 1, 1, col);
    if (f === 2) { P(g, 4, 4, PAL.white); P(g, 6, 6, PAL.white); P(g, 4, 6, PAL.white); P(g, 6, 4, PAL.white); }
    P(g, 5, 5, PAL.white);
    return c;
  });
}

function dent() {
  const [c, g] = mk(16, 16);
  R(g, 3, 9, 10, 5, 'rgba(40,28,24,0.35)'); R(g, 5, 4, 6, 5, 'rgba(40,28,24,0.25)'); R(g, 7, 2, 2, 2, 'rgba(40,28,24,0.2)');
  return c;
}

// ---------------------------------------------------------------- item icons
function itemIcon(id) {
  const [c, g] = mk(16, 16);
  const crops = cropCache;
  switch (id) {
    case 'hoe': R(g, 3, 12, 2, 2, PAL.woodD); for (let i = 0; i < 9; i++) R(g, 4 + i, 11 - i, 2, 2, PAL.wood); R(g, 10, 1, 5, 3, '#9aa0a4'); R(g, 13, 1, 2, 5, '#7a8084'); break;
    case 'watering_can': R(g, 3, 6, 8, 7, '#5f8aa0'); R(g, 3, 6, 8, 1, '#8fb4c6'); R(g, 11, 7, 3, 1, '#5f8aa0'); R(g, 13, 5, 2, 2, '#5f8aa0'); R(g, 1, 7, 2, 4, '#4a7088'); R(g, 5, 3, 4, 3, '#4a7088'); R(g, 6, 4, 2, 1, PAL.ink); break;
    case 'scythe': for (let i = 0; i < 11; i++) R(g, 3 + i, 14 - i, 2, 1, PAL.wood); R(g, 7, 2, 8, 2, '#c8ccd0'); R(g, 4, 3, 4, 2, '#c8ccd0'); R(g, 3, 5, 2, 1, '#c8ccd0'); R(g, 7, 2, 8, 1, '#ffffff'); break;
    case 'seed_turnip': case 'seed_garlic': case 'seed_pumpkin': case 'seed_cranberry': {
      const col = { seed_turnip: PAL.turnipP, seed_garlic: '#c8b98a', seed_pumpkin: PAL.pumpkin, seed_cranberry: '#b8283a' }[id];
      R(g, 3, 2, 10, 13, '#e3d4b0'); R(g, 3, 2, 10, 2, '#c8b78f'); R(g, 4, 6, 8, 7, col); R(g, 6, 8, 4, 3, shade(col, 0.35)); R(g, 3, 14, 10, 1, '#a89870');
      break;
    }
    case 'turnip': g.drawImage(crops.turnip[3], 0, -1); break;
    case 'garlic': g.drawImage(crops.garlic[3], 0, -1); break;
    case 'pumpkin': g.drawImage(crops.pumpkin[4], 0, 0); break;
    case 'cranberry': for (const [x, y] of [[4, 6], [8, 5], [6, 9], [10, 9], [7, 12], [3, 10]]) { R(g, x, y, 3, 3, '#b8283a'); P(g, x, y, '#e8606a'); } R(g, 8, 2, 1, 4, PAL.leafG); R(g, 9, 2, 3, 1, '#5f7f3a'); break;
    case 'tea_tin': R(g, 4, 4, 8, 10, PAL.teal); R(g, 4, 4, 8, 2, shade(PAL.teal, 0.3)); R(g, 5, 8, 6, 3, PAL.yellow); R(g, 4, 13, 8, 1, shade(PAL.teal, -0.3)); break;
    case 'aster_bouquet': R(g, 7, 8, 2, 7, PAL.leafG); R(g, 6, 11, 4, 2, PAL.cream); for (const [x, y] of [[4, 4], [8, 3], [11, 5], [6, 7], [10, 8]]) { R(g, x, y, 3, 3, PAL.purple); P(g, x + 1, y + 1, PAL.yellow); } break;
    case 'hard_cheese': R(g, 2, 7, 12, 7, '#e8c25a'); R(g, 2, 5, 9, 2, '#f2d27a'); R(g, 11, 5, 3, 2, '#e8c25a'); P(g, 5, 9, '#c89a3a'); P(g, 9, 11, '#c89a3a'); P(g, 11, 8, '#c89a3a'); break;
    case 'garlic_garland': for (let i = 0; i < 5; i++) { const x = 2 + i * 3, y = 4 + Math.abs(2 - i) * -1 + 4; R(g, x, y, 3, 3, PAL.garlic); P(g, x + 1, y - 1, PAL.leafG); } R(g, 2, 3, 12, 1, PAL.leafB); break;
    case 'pumpkin_ward': R(g, 3, 5, 10, 9, PAL.pumpkin); R(g, 7, 2, 2, 3, PAL.leafB); R(g, 5, 8, 2, 2, PAL.lit); R(g, 9, 8, 2, 2, PAL.lit); R(g, 6, 11, 4, 1, PAL.lit); R(g, 3, 5, 10, 1, '#f7a44a'); break;
    case 'fishing_rod': for (let i = 0; i < 12; i++) R(g, 2 + i, 13 - i, 1, 1, i < 4 ? PAL.woodD : PAL.wood); R(g, 13, 1, 1, 10, '#d8d4c8'); R(g, 12, 11, 3, 2, PAL.red); R(g, 3, 10, 3, 3, '#5a565c'); break;
    case 'mudminnow': case 'river_perch': case 'golden_carp': {
      // body [base, back, belly, fins]
      const c = { mudminnow: ['#8f7d58', '#5f4e33', '#c9b88e', '#6a5a3a'], river_perch: ['#86a64e', '#4a6a2a', '#e2e6a8', '#d0603a'], golden_carp: ['#e8b448', '#b8702a', '#fff0a8', '#e07a2a'] }[id];
      const body = [[5, 5, 9], [6, 3, 11], [7, 2, 12], [8, 1, 12], [9, 2, 12], [10, 3, 11], [11, 5, 9]];
      const tail = [[4, 14, 15], [5, 13, 15], [6, 13, 14], [7, 12, 13], [8, 12, 13], [9, 12, 13], [10, 13, 14], [11, 13, 15], [12, 14, 15]];
      const fin = [[3, 6, 8], [4, 5, 9]];
      const ol = shade(c[1], -0.45);
      for (const [y, x0, x1] of [...body, ...tail, ...fin]) R(g, x0 - 1, y, x1 - x0 + 3, 1, ol); // outline
      for (const [y, x0, x1] of [...body, ...tail, ...fin]) { R(g, x0, y - 1, x1 - x0 + 1, 1, ol); R(g, x0, y + 1, x1 - x0 + 1, 1, ol); }
      for (const [y, x0, x1] of fin) R(g, x0, y, x1 - x0 + 1, 1, c[3]);
      for (const [y, x0, x1] of tail) R(g, x0, y, x1 - x0 + 1, 1, c[3]);
      for (const [y, x0, x1] of body) R(g, x0, y, x1 - x0 + 1, 1, y <= 6 ? c[1] : y >= 10 ? c[2] : c[0]);
      R(g, 2, 9, 10, 1, shade(c[0], 0.15)); // belly sheen
      R(g, 5, 7, 1, 3, c[1]); // gill
      R(g, 6, 10, 2, 1, c[3]); P(g, 7, 11, c[3]); // pectoral fin
      P(g, 3, 7, '#fbf6e8'); P(g, 3, 8, PAL.ink); P(g, 4, 7, PAL.ink); P(g, 1, 9, ol); // eye + mouth
      if (id === 'river_perch') for (const x of [7, 9, 11]) R(g, x, 6, 1, 4, c[1]);
      if (id === 'mudminnow') for (const [x, y] of [[7, 7], [9, 8], [10, 6], [8, 9]]) P(g, x, y, c[1]);
      if (id === 'golden_carp') { for (const [x, y] of [[7, 7], [9, 7], [8, 8], [10, 8], [7, 9], [9, 9]]) P(g, x, y, c[2]); P(g, 1, 10, c[1]); P(g, 0, 11, c[1]); }
      break;
    }
    case 'silver_eel': {
      const ol = '#4a5560';
      const pts = [];
      for (let x = 1; x < 15; x++) pts.push([x, 7 + Math.round(Math.sin(x * 0.7) * 1.6)]);
      for (const [x, y] of pts) R(g, x, y - 2, 1, 5, ol);
      for (const [x, y] of pts) { const th = x > 11 ? 1 : 3; R(g, x, y - 1, 1, th, '#b8c4cc'); P(g, x, y - 1, '#7f8f99'); if (th > 1) P(g, x, y + 1, '#e4ecf0'); }
      for (const [x, y] of pts.slice(3, 13)) P(g, x, y - 2, '#8a9aa6'); // dorsal ridge
      const [hx, hy] = pts[0]; P(g, hx + 1, hy - 1, '#fbf6e8'); P(g, hx + 1, hy, PAL.ink);
      break;
    }
    case 'bait': // tin of worms
      R(g, 2, 7, 12, 7, '#5a6670'); R(g, 2, 7, 12, 1, '#8d9aa4'); R(g, 3, 13, 10, 1, '#3f4a52'); R(g, 4, 9, 8, 3, '#c9b35a'); R(g, 6, 10, 4, 1, '#8a5a3a');
      for (const [x, y] of [[3, 5], [5, 4], [7, 5], [9, 3], [11, 5], [12, 4]]) R(g, x, y, 2, 2, '#e48a9a');
      R(g, 4, 6, 8, 1, '#c86a7a'); P(g, 9, 2, '#e48a9a'); P(g, 5, 3, '#c86a7a');
      break;
    case 'tin_can':
      R(g, 4, 3, 8, 11, '#8d969c'); R(g, 4, 3, 8, 2, '#b8c0c4'); R(g, 5, 4, 6, 1, '#6a7278'); R(g, 4, 6, 8, 4, '#b0503a'); R(g, 5, 7, 3, 2, '#e8d8a8');
      R(g, 9, 9, 3, 3, '#6a7278'); P(g, 11, 8, '#a0663a'); P(g, 5, 12, '#a0663a'); P(g, 6, 13, '#7a4a2a'); R(g, 4, 13, 8, 1, '#5a6268');
      break;
    case 'old_boot':
      R(g, 4, 2, 6, 9, '#6a4a2e'); R(g, 4, 2, 6, 1, '#8a6a4a'); R(g, 4, 10, 10, 3, '#6a4a2e'); R(g, 3, 13, 12, 2, '#3a2a1a');
      R(g, 6, 4, 3, 1, '#c8b88a'); R(g, 6, 6, 3, 1, '#c8b88a'); R(g, 6, 8, 3, 1, '#c8b88a'); P(g, 12, 11, '#8a6a4a'); R(g, 13, 14, 2, 1, '#5f8aa0'); P(g, 2, 14, '#5f8aa0');
      break;
    case 'soggy_paper':
      R(g, 2, 4, 12, 9, '#c8c8be'); R(g, 2, 4, 12, 1, '#e4e4da'); R(g, 7, 4, 1, 9, '#a8a89e');
      for (const y of [6, 8, 10]) { R(g, 3, y, 3, 1, '#7a7a74'); R(g, 9, y, 4, 1, '#7a7a74'); }
      R(g, 3, 12, 2, 3, '#c8c8be'); R(g, 10, 12, 2, 2, '#c8c8be'); P(g, 4, 15, '#8fb4c6'); P(g, 11, 14, '#8fb4c6'); P(g, 12, 5, '#9fb0b8');
      break;
    case 'backpack': R(g, 3, 4, 10, 11, '#7a5a3a'); R(g, 4, 2, 8, 3, '#8a6a4a'); R(g, 5, 8, 6, 4, '#9a7a5a'); R(g, 7, 9, 2, 1, PAL.yellow); break;
    default: R(g, 4, 4, 8, 8, '#ff00ff');
  }
  return c;
}
let cropCache = null;

function uiIcon(kind, on = true) {
  const [c, g] = mk(12, 12);
  const col = '#f3eee3';
  switch (kind) {
    case 'sound':
      R(g, 1, 4, 3, 4, col); R(g, 4, 3, 1, 6, col); R(g, 5, 2, 1, 8, col);
      if (on) { R(g, 7, 4, 1, 4, col); R(g, 9, 2, 1, 8, col); } else { for (let i = 0; i < 4; i++) { P(g, 7 + i, 4 + i, col); P(g, 10 - i, 4 + i, col); } }
      break;
    case 'bag': R(g, 2, 3, 8, 8, col); R(g, 4, 1, 4, 2, col); R(g, 4, 5, 4, 2, '#3d3034'); break;
    case 'book': R(g, 1, 1, 10, 10, col); R(g, 2, 2, 8, 8, '#8c3b33'); R(g, 5, 2, 1, 8, col); R(g, 7, 4, 2, 1, col); break;
    case 'pause': R(g, 2, 2, 3, 8, col); R(g, 7, 2, 3, 8, col); break;
    default: break;
  }
  return c;
}


// ---------------------------------------------------------------- decorations & personal furniture
function decorSprites() {
  const d = {};
  const box = (w, h) => mk(w, h);
  { const [c, g] = box(16, 18); R(g, 1, 9, 14, 8, PAL.woodD); R(g, 1, 9, 14, 2, PAL.woodL); R(g, 2, 17, 12, 1, PAL.woodXD);
    for (const [x, y, col] of [[3, 5, PAL.orange], [7, 3, PAL.purple], [11, 5, PAL.yellow], [5, 7, PAL.red], [10, 7, PAL.purple]]) { R(g, x, y + 1, 1, 3, PAL.leafG); R(g, x - 1, y, 3, 2, col); P(g, x, y, shade(col, 0.3)); }
    d.planter = c; }
  { const [c, g] = box(16, 14); R(g, 1, 3, 14, 10, '#d9b45a'); R(g, 1, 3, 14, 2, '#ecc56a'); R(g, 1, 7, 14, 1, '#b8943f'); R(g, 1, 10, 14, 1, '#b8943f'); P(g, 4, 5, '#f2d887'); P(g, 11, 9, '#f2d887'); R(g, 1, 13, 14, 1, '#8a6a2a'); d.haybale = c; }
  { const [c, g] = box(32, 20);
    const pk = (x, y, s) => { R(g, x, y + 1, s, s - 2, PAL.pumpkin); R(g, x + 1, y, s - 2, s, PAL.pumpkin); R(g, x + (s >> 1), y, 1, s, PAL.pumpkinD); R(g, x + (s >> 1), y - 2, 2, 2, PAL.leafB); P(g, x + 1, y + 2, '#f7a44a'); };
    pk(2, 9, 10); pk(13, 10, 9); pk(22, 8, 9); pk(9, 2, 8); d.pumpkinpile = c; }
  { const [c, g] = box(16, 30); R(g, 7, 10, 2, 20, PAL.trunk); R(g, 1, 13, 14, 2, PAL.trunk);
    R(g, 4, 12, 8, 9, '#7a5a8e'); R(g, 4, 18, 8, 1, '#5a3a6e'); R(g, 0, 13, 4, 3, '#7a5a8e'); R(g, 12, 13, 4, 3, '#7a5a8e'); P(g, 0, 16, '#d9b45a'); P(g, 15, 16, '#d9b45a');
    R(g, 5, 5, 6, 7, '#d9b45a'); P(g, 6, 7, PAL.ink); P(g, 9, 7, PAL.ink); R(g, 7, 9, 2, 1, PAL.ink);
    R(g, 2, 4, 12, 2, '#c9a24a'); R(g, 5, 0, 6, 5, '#c9a24a'); R(g, 5, 3, 6, 1, PAL.red); d.scarecrow = c; }
  { const [c, g] = box(16, 10); for (let i = 0; i < 26; i++) { const x = 2 + Math.floor(hash2(i, 3, 9) * 12), y = 2 + Math.floor(hash2(3, i, 9) * 6); R(g, x, y, 2, 1, [PAL.leafO, PAL.leafR, PAL.leafY, PAL.leafB][i % 4]); } d.leafpile = c; }
  // interiors
  { const [c, g] = box(16, 14); R(g, 2, 6, 12, 7, '#a8844a'); for (let x = 3; x < 14; x += 2) R(g, x, 6, 1, 7, '#8a6a3a');
    for (const [x, col] of [[3, PAL.purple], [7, '#9a7ab8'], [10, PAL.teal]]) { R(g, x, 3, 4, 4, col); P(g, x + 1, 3, shade(col, 0.3)); } R(g, 12, 1, 1, 6, '#d8d4c8'); d.yarnbasket = c; }
  { const [c, g] = box(16, 20); R(g, 2, 2, 12, 12, '#7e5a8e'); R(g, 2, 2, 12, 2, '#9878a8'); R(g, 1, 9, 3, 7, '#6a4a7a'); R(g, 12, 9, 3, 7, '#6a4a7a'); R(g, 3, 11, 10, 5, '#8e6a9e'); R(g, 3, 16, 2, 4, PAL.woodXD); R(g, 11, 16, 2, 4, PAL.woodXD); d.armchair = c; }
  { const [c, g] = box(16, 16); R(g, 3, 10, 10, 5, PAL.woodD); R(g, 1, 8, 14, 3, '#7b766d'); R(g, 5, 3, 6, 5, '#b9a58a'); R(g, 6, 2, 4, 1, '#cbb89c'); R(g, 7, 4, 2, 2, '#8a7a62'); d.potterywheel = c; }
  { const [c, g] = box(16, 26); R(g, 1, 8, 14, 17, '#a65f48'); R(g, 3, 4, 10, 5, '#a65f48'); R(g, 5, 2, 6, 3, '#a65f48');
    for (let y = 10; y < 25; y += 3) R(g, 1, y, 14, 1, '#8a4a36'); R(g, 4, 14, 8, 8, '#2a1a1a'); R(g, 5, 17, 6, 5, PAL.orange); R(g, 6, 19, 4, 3, PAL.yellow); d.kiln = c; }
  { const [c, g] = box(16, 22); R(g, 4, 14, 8, 8, PAL.stoneL); R(g, 3, 13, 10, 2, PAL.stone); R(g, 5, 3, 6, 8, '#b9a58a'); R(g, 4, 10, 8, 3, '#b9a58a'); P(g, 6, 6, '#8a7a62'); P(g, 9, 6, '#8a7a62'); R(g, 7, 8, 2, 1, '#8a7a62'); d.bust = c; }
  { const [c, g] = box(16, 26); R(g, 1, 2, 14, 24, PAL.woodD); for (const y of [9, 17, 25]) R(g, 2, y, 12, 1, PAL.woodXD);
    const mini = (x, y, col) => { R(g, x + 1, y, 2, 2, PAL.gnomeHat); P(g, x + 1, y - 1, PAL.gnomeHat); R(g, x, y + 2, 4, 2, PAL.white); R(g, x, y + 4, 4, 2, col); };
    mini(2, 3, PAL.teal); mini(9, 3, PAL.purple); mini(5, 11, PAL.orange); mini(2, 19, PAL.green); mini(9, 19, PAL.yellow); d.gnomeshelf = c; }
  { const [c, g] = box(16, 22); R(g, 6, 16, 4, 5, PAL.woodD); R(g, 4, 20, 8, 2, PAL.woodXD); R(g, 3, 3, 10, 11, '#4b6f89'); R(g, 4, 2, 8, 13, '#4b6f89'); R(g, 5, 4, 3, 4, PAL.green); R(g, 9, 8, 3, 4, PAL.green); R(g, 2, 7, 1, 4, PAL.yellow); R(g, 13, 7, 1, 4, PAL.yellow); d.globe = c; }
  { const [c, g] = box(16, 22); R(g, 7, 12, 2, 10, PAL.woodD); for (let a = 0; a < 8; a++) { const dx = Math.round(Math.cos(a * Math.PI / 4) * 6), dy = Math.round(Math.sin(a * Math.PI / 4) * 6); R(g, 7 + dx, 7 + dy, 2, 2, PAL.woodL); }
    for (let a = 0; a < 16; a++) P(g, 8 + Math.round(Math.cos(a * Math.PI / 8) * 4), 8 + Math.round(Math.sin(a * Math.PI / 8) * 4), PAL.wood); R(g, 7, 7, 2, 2, PAL.yellow); d.helm = c; }
  { const [c, g] = box(16, 20); R(g, 7, 3, 2, 14, '#5a565c'); R(g, 5, 1, 6, 3, '#5a565c'); R(g, 6, 2, 4, 1, PAL.stoneD); R(g, 3, 6, 10, 2, '#5a565c'); R(g, 2, 13, 12, 2, '#5a565c'); R(g, 1, 11, 2, 3, '#5a565c'); R(g, 13, 11, 2, 3, '#5a565c'); R(g, 1, 19, 14, 1, PAL.woodXD); d.anchor = c; }
  { const [c, g] = box(16, 20); R(g, 2, 13, 12, 7, PAL.woodD); R(g, 1, 3, 14, 11, '#9fc1cc'); R(g, 2, 4, 12, 9, '#5f8aa0'); R(g, 2, 4, 12, 1, '#8fb4c6'); R(g, 4, 7, 3, 2, PAL.orange); P(g, 3, 8, PAL.orange); R(g, 9, 9, 3, 2, PAL.yellow); R(g, 11, 10, 1, 3, PAL.green); R(g, 4, 11, 1, 2, PAL.green); d.fishtank = c; }
  { const [c, g] = box(16, 24); R(g, 1, 6, 14, 18, '#8a4a36'); R(g, 1, 6, 14, 2, '#a65f48'); for (let y = 10; y < 24; y += 4) R(g, 1, y, 14, 1, '#6a3a2a');
    R(g, 4, 12, 8, 7, '#2a1a1a'); R(g, 5, 15, 6, 3, PAL.orange); R(g, 5, 13, 3, 2, '#d8a25a'); R(g, 9, 13, 2, 2, '#d8a25a'); R(g, 10, 0, 3, 6, '#5a565c'); d.oven = c; }
  { const [c, g] = box(16, 16); for (const [x, y] of [[1, 6], [8, 6], [4, 1]]) { R(g, x, y, 7, 9, '#e3d4b0'); R(g, x, y, 7, 1, '#c8b78f'); R(g, x + 2, y + 4, 3, 2, '#c8b78f'); } d.floursacks = c; }
  { const [c, g] = box(16, 24); R(g, 2, 2, 12, 22, '#6e6b64'); R(g, 2, 2, 12, 1, '#8f8a80'); for (const y of [4, 11, 18]) { R(g, 3, y, 10, 6, '#7b766d'); R(g, 6, y + 2, 4, 1, PAL.cream); } d.cabinet = c; }
  { const [c, g] = box(16, 14); R(g, 1, 10, 14, 4, PAL.woodD); for (const [x, h] of [[2, 6], [6, 9], [10, 4]]) { R(g, x, 10 - h, 4, h, PAL.white); for (let y = 10 - h; y < 10; y += 2) R(g, x, y, 4, 1, '#d8d2c4'); } d.papers = c; }
  { const [c, g] = box(16, 28); R(g, 4, 2, 1, 25, PAL.woodD); R(g, 2, 26, 6, 2, PAL.woodXD); R(g, 5, 3, 10, 7, PAL.orange); R(g, 5, 6, 10, 1, PAL.yellow); R(g, 9, 4, 2, 1, PAL.white); d.flagstand = c; }
  return d;
}

function catSprites(col, dark) {
  const frames = [0, 1, 2].map((f) => {
    const [c, g] = mk(14, 12);
    if (f === 0) { // sitting
      R(g, 4, 5, 6, 6, col); R(g, 3, 9, 8, 2, col); R(g, 8, 1, 5, 5, col); P(g, 8, 0, col); P(g, 12, 0, col); P(g, 9, 3, PAL.ink); P(g, 11, 3, PAL.ink); R(g, 1, 9, 3, 1, dark); P(g, 1, 8, dark);
    } else { // walking
      R(g, 2, 4, 9, 4, col); R(g, 9, 1, 5, 5, col); P(g, 9, 0, col); P(g, 13, 0, col); P(g, 11, 3, PAL.ink); R(g, 0, 3, 2, 1, dark); P(g, 0, 2, dark);
      const o = f === 1 ? 0 : 1;
      R(g, 3 + o, 8, 1, 3, dark); R(g, 6 - o, 8, 1, 3, dark); R(g, 8 + o, 8, 1, 3, dark); R(g, 10 - o, 8, 1, 3, dark);
    }
    R(g, 3, 5, 2, 1, dark);
    return c;
  });
  return { right: frames, left: frames.map(flip) };
}

// ---------------------------------------------------------------- registry
export const Art = {};

export function buildArt() {
  Art.tiles = {
    grass: [0, 1, 2, 3, 4, 5].map((i) => grassTile(i)),
    path: [0, 1, 2].map((i) => pathTile(i)),
    stone: [0, 1].map((i) => stoneTile(i)),
    water: [waterTile(0), waterTile(1)],
    sand: [0, 1].map((i) => sandTile(i)),
    bridge: bridgeTile(),
    field: [0, 1, 2].map((i) => fieldTile(i)),
    flowers: [0, 1, 2].map((i) => flowerTile(i)),
    floor: { wood: [floorTile('wood', 0), floorTile('wood', 1)], stone: [floorTile('stone', 0)] },
    walls: Object.fromEntries(Object.keys(WALLPAPER).map((k) => [k, wallTiles(k)])),
    mat: matTile(),
    fence: fenceTiles(),
    soil: { dry: soilTile(false), wet: soilTile(true) },
  };
  Art.crops = cropSprites();
  cropCache = Art.crops;
  Art.debris = debrisSprites();
  Art.objects = {
    tree: [0, 1, 2, 3].map(tree), bush: bush(), rock: rock(), bin: bin(), workbench: workbench(), well: well(), board: board(),
    fountain: [fountain(0), fountain(1)], stall: stall(), bench: bench(), lamp: lamp(false), lampLit: lamp(true), sign: sign(),
    ...furniture(),
    ...decorSprites(),
  };
  Art.cats = { ginger: catSprites('#d9893a', '#a8602a'), grey: catSprites('#8f8a96', '#5f5a66') };
  Art.buildings = {};
  for (const b of MAP.buildings) Art.buildings[b.id] = building(b);
  Art.chars = { player: charSheet(PLAYER_LOOK) };
  Art.portraits = { player: portrait(PLAYER_LOOK, '#4e6b3a').toDataURL() };
  Art.gnomes = {};
  for (const v of VILLAGERS) {
    Art.chars[v.id] = charSheet(v.look);
    Art.portraits[v.id] = portrait(v.look, v.candidate ? '#3d3034' : '#3a4a3a').toDataURL();
    Art.gnomes[v.id] = gnome(v.look);
  }
  Art.portraits.gnomePlayer = (() => { const [c, g] = mk(40, 40); R(g, 0, 0, 40, 40, '#3d3034'); g.drawImage(gnome(PLAYER_LOOK), 0, 0, 16, 26, 4, 0, 32, 40); return c.toDataURL(); })();
  Art.sparkle = sparkleFrames();
  Art.dent = dent();
  Art.icons = {};
  Art.iconUrls = {};
  for (const id of [...Object.keys(ITEMS), 'backpack']) {
    Art.icons[id] = itemIcon(id);
    Art.iconUrls[id] = Art.icons[id].toDataURL();
  }
  Art.ui = {
    soundOn: uiIcon('sound', true).toDataURL(), soundOff: uiIcon('sound', false).toDataURL(),
    coin: (() => { const [c, g] = mk(12, 12); R(g, 3, 1, 6, 10, '#b8862a'); R(g, 1, 3, 10, 6, '#b8862a'); R(g, 2, 2, 8, 8, '#b8862a');
      R(g, 3, 2, 6, 8, '#e2b54a'); R(g, 2, 3, 8, 6, '#e2b54a'); R(g, 5, 4, 2, 4, '#b8862a'); P(g, 3, 3, '#fff0b0'); P(g, 4, 2, '#fff0b0'); return c.toDataURL(); })(),
    bag: uiIcon('bag').toDataURL(), book: uiIcon('book').toDataURL(), pause: uiIcon('pause').toDataURL(),
  };
  return Art;
}
