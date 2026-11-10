import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COURT } from '../config.js';
import { createBoardTexture, createBrickTexture, createMuralTexture } from './ProceduralTextures.js';
import { normalizeForMerge, paint, place, worldBox } from './geometry.js';

const L = COURT.halfLength;
const W = COURT.halfWidth;

/**
 * Per-venue look: sky, sun / floodlight key, fill, fog, court surface and
 * which ambience loops play. Brazil is the original street court; the others
 * swap the backdrop around the same cage (the playing area never changes).
 */
export const VENUE_STYLE = {
  brazil: {
    sky: { zenith: '#3b78c4', horizon: '#f7cf9b', ground: '#8b7a66', sunGlow: 0.55, clouds: 0.35 },
    sun: { dir: [-0.5, 0.66, -0.56], color: '#ffd7a0', intensity: 3.1 },
    hemi: { sky: '#ffeedd', ground: '#6b6052', intensity: 1.45 },
    rim: { color: '#9cc2ff', intensity: 0.55 },
    fog: { color: '#e9c9a0', near: 70, far: 340 },
    env: 0.35,
    lamps: 0.35,
    ground: '#a59f97',
    court: {},
    loops: ['crowdBed', 'batucada', 'traffic'],
  },
  newyork: {
    ads: [
      { text: 'JOE’S SLICE 24/7', bg: '#c8102e', fg: '#fff6d0' },
      { text: 'ROOFTOP 41', bg: '#141414', fg: '#ff6a13' },
      { text: 'BODEGA ON 5TH', bg: '#f6c915', fg: '#141414' },
      { text: 'KNICKS & KNACKS', bg: '#1d4fa3', fg: '#ffffff' },
      { text: 'HUDSON LAUNDRY', bg: '#2e8b57', fg: '#ffffff' },
      { text: 'BKLYN BAGELS', bg: '#ff6a13', fg: '#141414' },
    ],
    sky: { zenith: '#25335f', horizon: '#ff9a62', ground: '#3a3036', sunGlow: 0.9, clouds: 0.25 },
    sun: { dir: [0.7, 0.36, -0.62], color: '#ffbf8a', intensity: 3.1 },
    hemi: { sky: '#d9c7e6', ground: '#5a4a4a', intensity: 1.5 },
    rim: { color: '#7d9cff', intensity: 0.7 },
    fog: { color: '#c98f7a', near: 90, far: 420 },
    env: 0.4,
    lamps: 1.2,
    ground: '#6d665f',
    windows: 0.85,
    court: {
      concrete: ['#a8a29a', '#837d75'],
      paint: { color: '#6aa3d8', alpha: 0.7 },
      emblem: 'ring',
      emblemColors: ['#ff6a13', '#f4f1e8', '#f4f1e8'],
      emblemText: 'ROOF\n41',
      stains: 0.4,
    },
    loops: ['crowdBed', 'traffic'],
  },
  london: {
    ads: [
      { text: 'THE ARCHES CAFF', bg: '#5b2a86', fg: '#f6c915' },
      { text: 'PIE & MASH', bg: '#2e8b57', fg: '#ffffff' },
      { text: 'SOUTHWARK MOTORS', bg: '#141414', fg: '#f4f1e8' },
      { text: 'ARCH 17 GYM', bg: '#c8102e', fg: '#ffffff' },
      { text: 'BOROUGH BREWS', bg: '#f6c915', fg: '#141414' },
      { text: 'NIGHT BUS N343', bg: '#1d4fa3', fg: '#ffffff' },
    ],
    sky: { zenith: '#0d1220', horizon: '#4a3b35', ground: '#151414', sunGlow: 0.0, clouds: 0.5 },
    sun: { dir: [-0.25, 0.92, -0.3], color: '#fff1d8', intensity: 2.3 },
    hemi: { sky: '#8a8fa8', ground: '#2a2420', intensity: 0.75 },
    rim: { color: '#ffb35a', intensity: 0.9 },
    fog: { color: '#2a2622', near: 40, far: 170 },
    env: 0.25,
    lamps: 3.2,
    ground: '#4d4a47',
    windows: 1.2,
    night: true,
    court: {
      concrete: ['#7b7873', '#595650'],
      emblem: 'diamond',
      emblemColors: ['#5b2a86', '#f4f1e8', '#f4f1e8'],
      emblemText: 'ARCH\n17',
      emblemAlpha: 0.5,
      stains: 1.3,
    },
    loops: ['crowdBed', 'traffic'],
  },
  tokyo: {
    ads: [
      { text: 'KITSUNE RAMEN', bg: '#e8338b', fg: '#ffffff' },
      { text: 'ARCADE 2000', bg: '#17e0d0', fg: '#141414' },
      { text: 'UDAGAWA KARAOKE', bg: '#141414', fg: '#ffe14a' },
      { text: 'MATCHA BAR', bg: '#2e8b57', fg: '#ffffff' },
      { text: 'NEON SNEAKERS', bg: '#b04bff', fg: '#ffffff' },
      { text: 'KONBINI 24H', bg: '#f4f1e8', fg: '#c8102e' },
    ],
    sky: { zenith: '#070a1c', horizon: '#3b1b5c', ground: '#0e0c16', sunGlow: 0.0, clouds: 0.0 },
    sun: { dir: [0.2, 0.9, 0.35], color: '#e7ecff', intensity: 2.6 },
    hemi: { sky: '#7c6cff', ground: '#301a3a', intensity: 0.85 },
    rim: { color: '#ff3fa4', intensity: 1.1 },
    fog: { color: '#1b1230', near: 50, far: 220 },
    env: 0.3,
    lamps: 3.5,
    ground: '#3a3843',
    windows: 1.4,
    night: true,
    court: {
      concrete: ['#5d6170', '#3f4250'],
      paint: { color: '#3c4a74', alpha: 0.7 },
      emblem: 'ring',
      emblemColors: ['#e8338b', '#17e0d0', '#f4f1e8'],
      emblemText: 'UDAGAWA',
      emblemAlpha: 0.6,
      stains: 0.6,
    },
    loops: ['crowdBed', 'traffic'],
  },
  barcelona: {
    ads: [
      { text: 'FORN DEL RAVAL', bg: '#e3a21a', fg: '#141414' },
      { text: 'BAR LA PLAÇA', bg: '#0b4fa3', fg: '#f6c915' },
      { text: 'TAPES I VERMUT', bg: '#c8102e', fg: '#ffffff' },
      { text: 'GELATS MARINA', bg: '#f4f1e8', fg: '#0b4fa3' },
      { text: 'BICIS 24H', bg: '#2e8b57', fg: '#ffffff' },
      { text: 'FARMÀCIA', bg: '#141414', fg: '#4bff8a' },
    ],
    sky: { zenith: '#2f7fd6', horizon: '#cfe6f7', ground: '#a08b6a', sunGlow: 0.45, clouds: 0.15 },
    sun: { dir: [0.35, 0.86, -0.38], color: '#fff2da', intensity: 3.3 },
    hemi: { sky: '#e7f1ff', ground: '#8c6d4f', intensity: 1.5 },
    rim: { color: '#bcd8ff', intensity: 0.4 },
    fog: { color: '#d8e4ee', near: 80, far: 360 },
    env: 0.4,
    lamps: 0.3,
    ground: '#b49c7c',
    court: {
      concrete: ['#c9a487', '#a8826a'],
      paint: { color: '#c7643f', alpha: 0.75 },
      emblem: 'mosaic',
      emblemColors: ['#0b4fa3', '#e3a21a', '#2e8b57', '#c8102e', '#f4f1e8'],
      stains: 0.8,
    },
    loops: ['crowdBed', 'traffic'],
  },
};

/** A facade texture tile: wall, glazing and (for night venues) an emissive map of lit windows. */
function facadeTexture(rng, o) {
  const S = 512;
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    return [c, c.getContext('2d')];
  };
  const [c, g] = mk();
  const [ec, eg] = mk();
  eg.fillStyle = '#000';
  eg.fillRect(0, 0, S, S);
  g.fillStyle = o.wall;
  g.fillRect(0, 0, S, S);
  // Weathering streaks and patches.
  for (let i = 0; i < 60; i += 1) {
    g.fillStyle = `rgba(${rng() < 0.5 ? '0,0,0' : '255,255,255'},${0.03 + rng() * 0.05})`;
    const w = 10 + rng() * 120;
    g.fillRect(rng() * S, rng() * S, w, 4 + rng() * 60);
  }
  if (o.brick) {
    g.globalAlpha = 0.5;
    for (let y = 0; y < S; y += 8) {
      g.fillStyle = 'rgba(40,20,14,0.35)';
      g.fillRect(0, y, S, 1.5);
      for (let x = (y / 8) % 2 ? 0 : 12; x < S; x += 24) g.fillRect(x, y, 1.5, 8);
    }
    g.globalAlpha = 1;
  }
  const cw = S / o.cols;
  const rh = S / o.rows;
  for (let r = 0; r < o.rows; r += 1) {
    if (o.band) {
      // Continuous ribbon windows (Tokyo offices).
      const y = r * rh + rh * 0.28;
      const h = rh * 0.44;
      g.fillStyle = o.glass;
      g.fillRect(0, y, S, h);
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(0, y, S, h * 0.25);
      for (let k = 0; k < o.cols; k += 1) {
        g.fillStyle = 'rgba(20,20,26,0.8)';
        g.fillRect(k * cw, y, 4, h);
        if (rng() < o.lit) {
          eg.fillStyle = rng.pick(o.litColors);
          eg.globalAlpha = 0.5 + rng() * 0.5;
          eg.fillRect(k * cw + 4, y, cw - 4, h);
        }
      }
      continue;
    }
    for (let k = 0; k < o.cols; k += 1) {
      const ww = cw * (o.winW ?? 0.5);
      const wh = rh * (o.winH ?? 0.55);
      const x = k * cw + (cw - ww) / 2;
      const y = r * rh + (rh - wh) * 0.45;
      if (o.shutters) {
        g.fillStyle = o.shutters;
        g.fillRect(x - ww * 0.42, y, ww * 0.38, wh);
        g.fillRect(x + ww * 1.04, y, ww * 0.38, wh);
      }
      g.fillStyle = o.frame ?? '#d9d4c8';
      g.fillRect(x - 3, y - 3, ww + 6, wh + 6);
      g.fillStyle = o.glass;
      if (o.arched) {
        g.beginPath();
        g.moveTo(x, y + wh);
        g.lineTo(x, y + ww / 2);
        g.arc(x + ww / 2, y + ww / 2, ww / 2, Math.PI, 0);
        g.lineTo(x + ww, y + wh);
        g.closePath();
        g.fill();
      } else g.fillRect(x, y, ww, wh);
      // Mullion and a sky reflection.
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(x, y, ww, wh * 0.3);
      g.fillStyle = o.frame ?? '#d9d4c8';
      g.fillRect(x + ww / 2 - 1.5, y, 3, wh);
      if (o.balcony) {
        g.fillStyle = 'rgba(20,20,20,0.85)';
        g.fillRect(x - 8, y + wh * 0.62, ww + 16, 3);
        for (let b = x - 8; b < x + ww + 8; b += 7) g.fillRect(b, y + wh * 0.62, 1.5, wh * 0.38);
      }
      if (rng() < o.lit) {
        eg.fillStyle = rng.pick(o.litColors);
        eg.globalAlpha = 0.45 + rng() * 0.55;
        eg.fillRect(x, y, ww, wh);
        // Blinds on some lit windows.
        if (rng() < 0.3) {
          eg.globalAlpha = 1;
          eg.fillStyle = '#000';
          eg.fillRect(x, y, ww, wh * (0.3 + rng() * 0.5));
        }
      }
    }
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 4;
  const emissiveMap = new THREE.CanvasTexture(ec);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  emissiveMap.wrapS = emissiveMap.wrapT = THREE.RepeatWrapping;
  return { map, emissiveMap };
}

/** Text / glyph sign texture (neon or painted). */
function signTexture(text, { bg = '#000', fg = '#fff', glow = null, w = 512, h = 128, font = '900 84px "Arial Black", Impact, sans-serif', vertical = false } = {}) {
  const c = document.createElement('canvas');
  c.width = vertical ? h : w;
  c.height = vertical ? w : h;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = font;
  if (glow) {
    g.shadowColor = glow;
    g.shadowBlur = 24;
  }
  if (vertical) {
    const chars = [...text];
    const step = c.height / (chars.length + 0.5);
    chars.forEach((ch, i) => g.fillText(ch, c.width / 2, step * (i + 0.75)));
  } else g.fillText(text, c.width / 2, c.height / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Merged-by-material builder: collect geometries per material, then one mesh each. */
function collector(group) {
  const bins = new Map();
  return {
    add(mat, geo) {
      if (!bins.has(mat)) bins.set(mat, []);
      bins.get(mat).push(geo);
    },
    flush({ shadows = false } = {}) {
      for (const [mat, geos] of bins) {
        const mesh = new THREE.Mesh(mergeGeometries(normalizeForMerge(geos, { color: !!mat.vertexColors })), mat);
        mesh.receiveShadow = shadows;
        group.add(mesh);
      }
      bins.clear();
    },
  };
}

/** A ring of buildings around the court, each a stack of facade boxes. */
function cityRing(rng, add, mat, { inner, depth = 8, minH, maxH, palette, setback = 0.35, gaps = 0, tile, base = 0, skip = [] }) {
  const all = [
    { axis: 'x', from: -L - inner, to: L + inner, line: W + inner, ry: Math.PI },
    { axis: 'x', from: -L - inner, to: L + inner, line: -W - inner - 4, ry: 0 },
    { axis: 'z', from: -W - inner, to: W + inner, line: L + inner, ry: -Math.PI / 2 },
    { axis: 'z', from: -W - inner, to: W + inner, line: -L - inner, ry: Math.PI / 2 },
  ];
  const sides = all.filter((_, i) => !skip.includes(['far', 'near', 'east', 'west'][i]));
  for (const s of sides) {
    let t = s.from - 6;
    while (t < s.to + 6) {
      const w = 7 + rng() * 9;
      if (rng() < gaps) {
        t += w * 0.6;
        continue;
      }
      const h = minH + rng() * (maxH - minH);
      const color = rng.pick(palette);
      const d = depth + rng() * 4;
      const cx = s.axis === 'x' ? t + w / 2 : s.line + Math.sign(s.line) * d / 2;
      const cz = s.axis === 'x' ? s.line + Math.sign(s.line) * d / 2 : t + w / 2;
      const bw = s.axis === 'x' ? w : d;
      const bd = s.axis === 'x' ? d : w;
      add(mat, paint(place(worldBox(bw, h, bd, tile), cx, base + h / 2, cz), color));
      // Setback tower on some tall blocks.
      if (h > maxH * 0.6 && rng() < setback) {
        const h2 = h * (0.25 + rng() * 0.35);
        add(mat, paint(place(worldBox(bw * 0.65, h2, bd * 0.65, tile), cx, base + h + h2 / 2, cz), color));
      }
      t += w + 0.3;
    }
  }
}

// ---------------------------------------------------------------- New York

function buildNewYork(rng, shared) {
  const group = new THREE.Group();
  group.name = 'venue-newyork';
  const c = collector(group);
  const fac = facadeTexture(rng, { wall: '#9a7b67', glass: '#2a3446', frame: '#c9bfae', cols: 4, rows: 4, lit: 0.35, litColors: ['#ffd9a0', '#ffe8c4', '#fff2d6'], brick: true });
  const glass = facadeTexture(rng, { wall: '#3c4652', glass: '#6c84a3', frame: '#28303a', cols: 6, rows: 6, winW: 0.8, winH: 0.75, lit: 0.25, litColors: ['#fff0d0', '#cfe4ff'] });
  const towerMat = new THREE.MeshStandardMaterial({ map: fac.map, emissiveMap: fac.emissiveMap, emissive: '#ffffff', emissiveIntensity: 0, vertexColors: true, roughness: 0.85 });
  const glassMat = new THREE.MeshStandardMaterial({ map: glass.map, emissiveMap: glass.emissiveMap, emissive: '#ffffff', emissiveIntensity: 0, vertexColors: true, roughness: 0.35, metalness: 0.4 });
  // The court sits on a roof 40 m up: neighbouring roofs below the parapet, towers rising beyond.
  cityRing(rng, c.add, towerMat, { inner: 14, base: -40, minH: 26, maxH: 38, palette: ['#c9b6a6', '#b4a090', '#d8c6b2'], tile: 12 });
  cityRing(rng, c.add, towerMat, { inner: 30, base: -40, minH: 36, maxH: 80, palette: ['#d0b8a2', '#a8917e', '#c4a993', '#e0d2c0'], tile: 12, gaps: 0.15 });
  cityRing(rng, c.add, glassMat, { inner: 56, base: -40, minH: 80, maxH: 170, palette: ['#ffffff', '#d9e2ee', '#bfc9d6'], tile: 12, gaps: 0.25, setback: 0.6 });
  // The roof itself: a slab under the court ending at the parapet, with the drop below.
  const roof = new THREE.MeshStandardMaterial({ color: '#57524d', roughness: 0.95 });
  c.add(roof, place(new THREE.BoxGeometry((L + 7) * 2, 40, (W + 6.5) * 2), 0, -20.02, 0));
  // Parapet around this roof.
  const parapet = new THREE.MeshStandardMaterial({ map: createBrickTexture(rng), vertexColors: true, roughness: 0.9 });
  for (const s of [-1, 1]) {
    c.add(parapet, paint(place(worldBox((L + 7) * 2, 1.1, 0.4, 2), 0, 0.55, s * (W + 6.5)), '#9b6b55'));
    c.add(parapet, paint(place(worldBox(0.4, 1.1, (W + 6.5) * 2, 2), s * (L + 7), 0.55, 0), '#9b6b55'));
  }
  // Water towers on neighbouring roofs.
  const wood = new THREE.MeshStandardMaterial({ color: '#6b4a32', roughness: 0.9 });
  const steel = new THREE.MeshStandardMaterial({ color: '#2b2b2e', roughness: 0.6, metalness: 0.5 });
  const towers = [[-L - 2, W + 4.5], [L + 3, W + 4.2], [-L - 4.5, -W - 3], [L + 4.8, 3]];
  for (const [x, z] of towers) {
    const y = 4;
    c.add(wood, place(new THREE.CylinderGeometry(1.6, 1.6, 3.2, 14), x, y + 1.6, z));
    c.add(wood, place(new THREE.ConeGeometry(1.8, 1.4, 14), x, y + 3.9, z));
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) c.add(steel, place(new THREE.CylinderGeometry(0.07, 0.07, y, 6), x + lx, y / 2, z + lz));
  }
  // A billboard frame facing the court.
  const board = new THREE.Mesh(new THREE.PlaneGeometry(14, 4.5), new THREE.MeshStandardMaterial({ map: createMuralTexture(rng, 'ROOFTOP'), roughness: 0.7, emissive: '#ffffff', emissiveIntensity: 0.15 }));
  board.position.set(4, 9, W + 6.2);
  board.rotation.y = Math.PI;
  group.add(board);
  for (const x of [-2, 10]) c.add(steel, place(new THREE.BoxGeometry(0.25, 7, 0.25), x, 3.5, W + 6.4));
  // String lights over the rooftop deck.
  const bulbs = [];
  for (const z of [-W - 3, W + 3]) for (let x = -L - 4; x <= L + 4; x += 1.4) bulbs.push(new THREE.Vector3(x, 3.4 - Math.sin(((x + L + 4) / (2 * L + 8)) * Math.PI) * 0.8, z));
  const bulbMat = new THREE.MeshBasicMaterial({ color: '#ffd38a' });
  const bulbMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 6, 4), bulbMat, bulbs.length);
  bulbs.forEach((b, i) => bulbMesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(b.x, b.y, b.z)));
  group.add(bulbMesh);
  c.flush();
  return { group, windowMats: [towerMat, glassMat] };
}

// ---------------------------------------------------------------- London

function buildLondon(rng) {
  const group = new THREE.Group();
  group.name = 'venue-london';
  const c = collector(group);
  const brickTex = createBrickTexture(rng);
  const brick = new THREE.MeshStandardMaterial({ map: brickTex, vertexColors: true, roughness: 0.92 });
  const fac = facadeTexture(rng, { wall: '#7a4a3a', glass: '#1b1f28', frame: '#d8d0c0', cols: 3, rows: 3, lit: 0.4, litColors: ['#ffcf8a', '#ffe1b0'], brick: true, arched: true });
  const warehouse = new THREE.MeshStandardMaterial({ map: fac.map, emissiveMap: fac.emissiveMap, emissive: '#ffffff', emissiveIntensity: 0, vertexColors: true, roughness: 0.9 });
  // Railway viaduct along the far side: piers and a deck, arches glowing.
  const vz = W + 7;
  const deckY = 8;
  const archW = 6;
  const archGlow = new THREE.MeshStandardMaterial({ color: '#130d0a', emissive: '#ff9f43', emissiveIntensity: 0.6, roughness: 1 });
  for (let x = -L - 18; x <= L + 18; x += archW + 1.2) {
    c.add(brick, paint(place(worldBox(1.2, deckY, 4, 2), x, deckY / 2, vz + 2), '#8a5644'));
    // Arch spandrel: a half-ring above the opening.
    const ring = new THREE.CylinderGeometry(archW / 2 + 0.6, archW / 2 + 0.6, 4, 16, 1, true, -Math.PI / 2, Math.PI);
    ring.rotateX(Math.PI / 2);
    c.add(brick, paint(place(ring, x + (archW + 1.2) / 2, deckY - archW / 2 - 0.6, vz + 2), '#7d4b3b'));
    // Inside each arch: a lit workshop / dark void.
    const lit = rng() < 0.55;
    const back = new THREE.PlaneGeometry(archW, deckY - 1.2);
    c.add(lit ? archGlow : warehouse, place(back, x + (archW + 1.2) / 2, (deckY - 1.2) / 2, vz + 3.9, Math.PI));
  }
  c.add(brick, paint(place(worldBox((L + 22) * 2, 1.6, 4.4, 2), 0, deckY + 0.8, vz + 2), '#6e4334'));
  // A commuter train parked on the viaduct, windows lit.
  const train = facadeTexture(rng, { wall: '#d8d8d2', glass: '#20232a', frame: '#e5e5e0', cols: 6, rows: 1, winW: 0.7, winH: 0.45, lit: 0.9, litColors: ['#fff6dc'] });
  const trainMat = new THREE.MeshStandardMaterial({ map: train.map, emissiveMap: train.emissiveMap, emissive: '#ffffff', emissiveIntensity: 1, roughness: 0.5 });
  for (let k = 0; k < 3; k += 1) {
    const car = worldBox(19, 3.2, 2.8, 19);
    c.add(trainMat, place(car, -20 + k * 19.6, deckY + 3.2, vz + 2));
  }
  // Warehouses on the other three sides.
  cityRing(rng, c.add, warehouse, { inner: 11, minH: 9, maxH: 18, palette: ['#ffffff', '#e4d6cc', '#cdb8a8'], tile: 9, skip: ['far'] });
  cityRing(rng, c.add, warehouse, { inner: 26, minH: 16, maxH: 30, palette: ['#d8c8bc', '#bfa898'], tile: 9, gaps: 0.2 });
  // Sodium street lamps along the pavements.
  const lampPost = new THREE.MeshStandardMaterial({ color: '#1d2324', roughness: 0.5, metalness: 0.6 });
  const lampHead = new THREE.MeshStandardMaterial({ color: '#2a1d10', emissive: '#ffad4a', emissiveIntensity: 4 });
  for (let x = -L; x <= L; x += 10) {
    for (const z of [-W - 4.6, W + 4.4]) {
      c.add(lampPost, place(new THREE.CylinderGeometry(0.08, 0.11, 5, 8), x, 2.5, z));
      c.add(lampHead, place(new THREE.BoxGeometry(0.5, 0.25, 0.3), x, 5.1, z - Math.sign(z) * 0.3));
    }
  }
  // Graffiti on the near pier faces (reuses the mural generator).
  for (const [x, word] of [[-9, 'ARCH 17'], [8, 'NO BALL GAMES?']]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 3), new THREE.MeshStandardMaterial({ map: createMuralTexture(rng, word), roughness: 0.9 }));
    m.position.set(x, 1.6, vz - 0.05);
    m.rotation.y = Math.PI;
    group.add(m);
  }
  c.flush();
  return { group, windowMats: [warehouse] };
}

// ---------------------------------------------------------------- Tokyo

const NEON = ['#ff3fa4', '#17e0d0', '#b04bff', '#ffe14a', '#ff6a2a', '#4bff8a'];
const NEON_WORDS = ['RAMEN', 'KARAOKE', '24H', 'GAME', 'CAFE', 'BAR', 'SUSHI', 'HOTEL', 'ARCADE', 'NOODLE'];

function buildTokyo(rng) {
  const group = new THREE.Group();
  group.name = 'venue-tokyo';
  const c = collector(group);
  const fac = facadeTexture(rng, { wall: '#3a3d48', glass: '#161a26', cols: 5, rows: 4, band: true, lit: 0.55, litColors: ['#e6f0ff', '#fff4d6', '#ffd0f0'] });
  const fac2 = facadeTexture(rng, { wall: '#4b4652', glass: '#15151e', frame: '#2a2a33', cols: 4, rows: 5, lit: 0.5, litColors: ['#fff1d0', '#d0f4ff'] });
  const officeMat = new THREE.MeshStandardMaterial({ map: fac.map, emissiveMap: fac.emissiveMap, emissive: '#ffffff', emissiveIntensity: 0, vertexColors: true, roughness: 0.6 });
  const flatMat = new THREE.MeshStandardMaterial({ map: fac2.map, emissiveMap: fac2.emissiveMap, emissive: '#ffffff', emissiveIntensity: 0, vertexColors: true, roughness: 0.8 });
  cityRing(rng, c.add, flatMat, { inner: 10, minH: 10, maxH: 22, palette: ['#ffffff', '#d6d0dc', '#c4cad8'], tile: 10 });
  cityRing(rng, c.add, officeMat, { inner: 26, minH: 28, maxH: 70, palette: ['#ffffff', '#cfd4e2'], tile: 10, gaps: 0.2 });
  // Vertical neon signs stacked on the facades facing the court, and horizontal shop signs at street level.
  const signs = [];
  const addSign = (x, y, z, ry, w, h, text, vertical) => {
    const col = rng.pick(NEON);
    const tex = signTexture(text, { bg: '#0a0710', fg: '#ffffff', glow: col, vertical, w: 512, h: 128 });
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: col, emissiveIntensity: 2.4, roughness: 0.4 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    group.add(m);
    signs.push(m);
  };
  for (let x = -L - 4; x <= L + 4; x += 4.5 + rng() * 3) {
    addSign(x, 6 + rng() * 5, W + 9.6, Math.PI, 1.3, 5.2, rng.pick(NEON_WORDS), true);
    addSign(x + 1.5, 3.2, W + 9.6, Math.PI, 3.6, 0.9, rng.pick(NEON_WORDS), false);
  }
  for (const s of [-1, 1]) for (let z = -W; z <= W; z += 5 + rng() * 3) addSign(s * (L + 9.6), 5 + rng() * 6, z, s > 0 ? -Math.PI / 2 : Math.PI / 2, 1.2, 4.6, rng.pick(NEON_WORDS), true);
  // Vending machines along the pavement: glowing fronts.
  const vend = new THREE.MeshStandardMaterial({ color: '#dfe7ee', emissive: '#e8f4ff', emissiveIntensity: 1.6, roughness: 0.3 });
  const vendBody = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.5 });
  for (let x = -L + 2; x <= L - 2; x += 6 + rng() * 4) {
    const z = W + 3.4;
    c.add(vendBody, paint(place(new THREE.BoxGeometry(1, 1.8, 0.8), x, 0.9, z), rng() < 0.5 ? '#c8102e' : '#1d4fa3'));
    c.add(vend, place(new THREE.PlaneGeometry(0.8, 1.2), x, 1.05, z - 0.41, Math.PI));
  }
  // Overhead cables criss-crossing the street.
  const cable = new THREE.MeshBasicMaterial({ color: '#0c0c10' });
  for (let i = 0; i < 10; i += 1) {
    const a = new THREE.Vector3(-L - 8 + rng() * (2 * L + 16), 9 + rng() * 3, W + 8);
    const b = new THREE.Vector3(a.x + (rng() - 0.5) * 10, 8 + rng() * 3, W + 2.5);
    const mid = a.clone().lerp(b, 0.5);
    mid.y -= 1;
    c.add(cable, new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 10, 0.02, 3, false));
  }
  c.flush();
  return { group, windowMats: [officeMat, flatMat] };
}

// ---------------------------------------------------------------- Barcelona

function buildBarcelona(rng) {
  const group = new THREE.Group();
  group.name = 'venue-barcelona';
  const c = collector(group);
  const fac = facadeTexture(rng, { wall: '#d9b48a', glass: '#2b2f36', frame: '#efe6d6', shutters: '#2e6b4f', cols: 3, rows: 4, winW: 0.36, winH: 0.72, lit: 0, litColors: ['#fff'], balcony: true });
  const fac2 = facadeTexture(rng, { wall: '#e7d3b0', glass: '#2b2f36', frame: '#f6efe2', shutters: '#3a5f8a', cols: 3, rows: 4, winW: 0.36, winH: 0.72, lit: 0, litColors: ['#fff'], balcony: true });
  const ochre = new THREE.MeshStandardMaterial({ map: fac.map, vertexColors: true, roughness: 0.9 });
  const cream = new THREE.MeshStandardMaterial({ map: fac2.map, vertexColors: true, roughness: 0.9 });
  // Plaça: apartment blocks on all sides, 5–7 storeys, coloured stucco.
  cityRing(rng, c.add, ochre, { inner: 10, minH: 16, maxH: 23, palette: ['#ffffff', '#f2d6c0', '#f7e4c8', '#e9c9a8'], tile: 10, setback: 0 });
  cityRing(rng, c.add, cream, { inner: 24, minH: 20, maxH: 30, palette: ['#ffffff', '#efe3cf', '#e2d6c4'], tile: 10, setback: 0.2 });
  // Balcony slabs along the court-facing facades.
  const slab = new THREE.MeshStandardMaterial({ color: '#cbbfae', roughness: 0.8 });
  for (let y = 4.2; y < 16; y += 3.33) {
    for (let x = -L - 6; x <= L + 6; x += 3.33) c.add(slab, place(new THREE.BoxGeometry(1.6, 0.12, 0.7), x, y, W + 9.6));
  }
  // Laundry lines with colourful clothes between balconies.
  const cloth = [];
  for (let i = 0; i < 70; i += 1) cloth.push({ x: -L - 4 + rng() * (2 * L + 8), y: 5 + Math.floor(rng() * 3) * 3.33 - 0.5, c: rng.pick(['#c8102e', '#f6c915', '#1d4fa3', '#ffffff', '#2e8b57', '#e8338b']) });
  const clothMat = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, side: THREE.DoubleSide, roughness: 1 });
  for (const o of cloth) c.add(clothMat, paint(place(new THREE.PlaneGeometry(0.5, 0.7), o.x, o.y, W + 9.2, Math.PI), o.c));
  // Palm trees and orange trees around the plaça.
  const trunk = new THREE.MeshStandardMaterial({ color: '#7a6146', roughness: 1 });
  const frond = new THREE.MeshStandardMaterial({ color: '#3d7a3a', side: THREE.DoubleSide, roughness: 0.8 });
  const canopy = new THREE.MeshStandardMaterial({ color: '#2f6b33', roughness: 0.9 });
  const fruit = new THREE.MeshStandardMaterial({ color: '#f39a1d', roughness: 0.6 });
  const palm = (x, z) => {
    const h = 7 + rng() * 3;
    c.add(trunk, place(new THREE.CylinderGeometry(0.18, 0.28, h, 7), x, h / 2, z));
    for (let k = 0; k < 9; k += 1) {
      const f = new THREE.PlaneGeometry(0.7, 3.2);
      f.translate(0, 1.6, 0);
      f.rotateX(-1.0 - rng() * 0.3);
      f.rotateY((k / 9) * Math.PI * 2);
      c.add(frond, place(f, x, h, z));
    }
  };
  const orange = (x, z) => {
    c.add(trunk, place(new THREE.CylinderGeometry(0.1, 0.14, 1.8, 6), x, 0.9, z));
    c.add(canopy, place(new THREE.IcosahedronGeometry(1.3, 1), x, 2.6, z));
    for (let k = 0; k < 6; k += 1) c.add(fruit, place(new THREE.SphereGeometry(0.09, 6, 4), x + (rng() - 0.5) * 2, 2.3 + rng() * 0.9, z + (rng() - 0.5) * 2));
  };
  for (const x of [-L - 3, L + 3]) for (const z of [-W - 3.5, W + 3.5]) palm(x, z);
  for (let x = -L + 3; x <= L - 3; x += 7) orange(x, -W - 4.2);
  // Benches covered in broken-tile mosaic.
  const mosaic = new THREE.MeshStandardMaterial({ color: '#f4f1e8', vertexColors: true, roughness: 0.4 });
  for (let x = -L + 6; x <= L - 6; x += 9) c.add(mosaic, paint(place(worldBox(3, 0.5, 0.7, 1), x, 0.25, W + 3.6), rng.pick(['#3b8fd6', '#e3a21a', '#2e8b57'])));
  c.flush({ shadows: true });
  return { group, windowMats: [] };
}

const BUILDERS = { newyork: buildNewYork, london: buildLondon, tokyo: buildTokyo, barcelona: buildBarcelona };

/** Build (once) and return the backdrop for a non-Brazil venue. */
export function buildVenueBackdrop(id, rng, shared = {}) {
  const fn = BUILDERS[id];
  return fn ? fn(rng, shared) : null;
}
