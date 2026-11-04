import * as THREE from 'three';
import { KitBuilder } from './GeoBuilder';
import { Props } from './Props';
import { SignAtlas } from './Signs';
import type { CollisionWorld } from './Collision';
import type { Materials } from './Materials';
import { PALETTE as P } from './Materials';
import type { Game } from '../game/Game';
import type { AreaId, NpcSpawn } from '../gameplay/types';
import type { WorldObject } from '../gameplay/Objects';
import { Door } from '../gameplay/Objects';

export interface AreaCtx {
  g: Game;
  area: AreaId;
  k: KitBuilder;
  props: Props;
  col: CollisionWorld;
  signs: SignAtlas;
  mats: Materials;
  spawns: NpcSpawn[];
  bits: { id: string; area: AreaId; x: number; y: number; z: number }[];
  add<T extends WorldObject>(o: T): T;
  bit(x: number, y: number, z: number): void;
  rng: () => number;
}

export const WORLD = { minX: -82, maxX: 84, minZ: -96, maxZ: 76 };

function inRect(x: number, z: number, x0: number, x1: number, z0: number, z1: number): boolean {
  return x >= x0 && x <= x1 && z >= z0 && z <= z1;
}

const tmpC = new THREE.Color();

/** Ground paint: one faceted mesh with per-tile colours for all districts. */
export function groundColor(x: number, z: number): string {
  const cx = Math.floor(x / 2);
  const cz = Math.floor(z / 2);
  const chk = (cx + cz) & 1;
  const n = Math.sin(cx * 12.9898 + cz * 78.233) * 43758.5453;
  const noise = n - Math.floor(n);
  // Streets.
  const street =
    inRect(x, z, -4, 4, 14, 31) ||
    inRect(x, z, -4, 4, -32, -14) ||
    inRect(x, z, -24, -14, -4, 4) ||
    inRect(x, z, 14, 24, -4, 4) ||
    inRect(x, z, -28, -4, -30.9, -24.9);
  if (street) {
    const vert = inRect(x, z, -4, 4, 14, 31) || inRect(x, z, -4, 4, -32, -14);
    const across = vert ? Math.abs(x) : inRect(x, z, -28, -4, -30.9, -24.9) ? Math.abs(z + 27.9) : Math.abs(z);
    if (across > 2.8) return chk ? '#d9cdb8' : '#cfc2aa';
    if (across < 0.35 && ((vert ? cz : cx) & 1)) return '#ffe27a';
    return noise > 0.5 ? P.asphalt : '#5f5c76';
  }
  // Fountain Square: concentric paving.
  if (inRect(x, z, -14, 14, -14, 14)) {
    const r = Math.hypot(x, z);
    const ring = Math.floor(r / 2);
    if (r < 9) return ring % 2 ? '#f0e2c6' : '#e2cfaa';
    return chk ? '#d8c8a8' : '#cdbb98';
  }
  // Station: platform tiles + concourse checker.
  if (inRect(x, z, -24, 24, 30, 64)) {
    if (z > 56.5) return (cx & 1) ? '#6a5a4a' : '#5a4a3c';
    if (z > 55.6) return '#ffe27a';
    if (z > 46) return chk ? '#c9c2d8' : '#bab2cc';
    return chk ? '#f2e6d0' : '#e5d5ba';
  }
  // Mall: glossy pink/white checker with a central runner.
  if (inRect(x, z, -64, -22, -20, 20)) {
    if (Math.abs(z) < 2.2 && x > -46) return '#ff8fc0';
    return chk ? '#fbf3f6' : '#f3dce8';
  }
  // Circus: sawdust ring, grass and striped paths.
  if (inRect(x, z, 22, 68, -24, 24)) {
    const r = Math.hypot(x - 48, z);
    if (r < 5.5) return r > 4.9 ? '#e2473f' : (Math.floor(Math.atan2(z, x - 48) * 4) & 1) ? '#f2d8a0' : '#ead09a';
    if (r < 12) return chk ? '#d8b878' : '#d0b070';
    if (Math.abs(z) < 2.2 || inRect(x, z, 24, 40, 10, 16)) return chk ? '#e8d4a8' : '#dcc89c';
    return noise > 0.6 ? '#8fd17a' : chk ? '#7cc56b' : '#74bd63';
  }
  // Museum: marble checker.
  if (inRect(x, z, -64, -20, -60, -20)) {
    return chk ? '#f4f0e8' : '#3a3348';
  }
  // City Hall plaza: stone with red carpet up the middle.
  if (inRect(x, z, -26, 26, -90, -31)) {
    if (Math.abs(x) < 1.6 && z < -40) return '#c8243a';
    if (z < -58) return chk ? '#e8d8c0' : '#dccab0';
    return chk ? '#e4dccb' : '#d8cfbc';
  }
  // Countryside grass.
  return noise > 0.75 ? '#8fd17a' : chk ? '#7cc56b' : '#76bf65';
}

export function buildGround(mats: Materials): THREE.Mesh {
  const step = 2;
  const pos: number[] = [];
  const col: number[] = [];
  for (let x = WORLD.minX; x < WORLD.maxX; x += step) {
    for (let z = WORLD.minZ; z < WORLD.maxZ; z += step) {
      tmpC.set(groundColor(x + 1, z + 1));
      const quad = [
        [x, z],
        [x, z + step],
        [x + step, z],
        [x + step, z],
        [x, z + step],
        [x + step, z + step],
      ];
      for (const [qx, qz] of quad) {
        pos.push(qx, 0, qz);
        col.push(tmpC.r, tmpC.g, tmpC.b);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mats.world);
  m.receiveShadow = true;
  m.name = 'ground';
  m.matrixAutoUpdate = false;
  return m;
}

export function buildSky(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(400, 24, 12);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color('#5fb4f0') },
      mid: { value: new THREE.Color('#bfe6ff') },
      bot: { value: new THREE.Color('#ffd9b8') },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP;
      void main(){ float h = vP.y; vec3 c = h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.6, h)) : mix(bot, mid, smoothstep(-0.05, 0.12, h));
      gl_FragColor = vec4(c, 1.0); }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.name = 'sky';
  m.renderOrder = -10;
  return m;
}

/** Puffy low-poly clouds, one merged mesh. */
export function buildClouds(k: KitBuilder, rng: () => number): void {
  for (let i = 0; i < 18; i += 1) {
    const a = (i / 18) * Math.PI * 2 + rng() * 0.3;
    const r = 150 + rng() * 80;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const y = 50 + rng() * 30;
    for (let j = 0; j < 4; j += 1) {
      k.smooth.add(new THREE.IcosahedronGeometry(6 + rng() * 5, 1), '#ffffff', { x: x + (j - 1.5) * 7, y: y + rng() * 3, z: z + rng() * 4, sy: 0.6 });
    }
  }
}

/** Fountain Square, the streets between districts, area gates and the skyline. */
export function buildHub(ctx: AreaCtx): void {
  const { k, props, col, signs, g } = ctx;
  const w = k.world;
  // ---- fountain
  w.cyl(0, 0, 0, 3.6, 3.8, 0.7, '#d9cdb8', 16);
  w.cyl(0, 0.7, 0, 3.7, 3.7, 0.15, '#f4e6c8', 16);
  w.cyl(0, 0, 0, 0.5, 0.7, 2.6, '#d9cdb8', 10);
  w.cyl(0, 2.2, 0, 1.6, 0.9, 0.35, '#f4e6c8', 14);
  // Statue of the founder on the fountain (Mayor Bumbleton's great-great-grandfather, naturally).
  w.cyl(0, 2.55, 0, 0.45, 0.5, 0.6, '#c8a860', 10);
  w.sphere(0, 3.7, 0, 0.42, '#c8a860', 10, 8);
  w.cyl(0, 4.05, 0, 0.32, 0.3, 0.6, '#b89850', 10);
  w.cyl(0, 4.05, 0, 0.55, 0.55, 0.04, '#b89850', 12);
  w.add(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 5), '#b89850', { x: 0.45, y: 3.5, z: 0.1, rz: -0.9 });
  const water = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.08, 24), g.mats.water);
  water.position.set(0, 0.6, 0);
  g.scene.add(water);
  col.box(0, 0, 0, 7, 0.85, 7);
  col.box(0, 0, 0, 1.6, 4.6, 1.6);
  signs.add('FOUNTAIN SQUARE', 0, 1.0, 3.82, 2.4, 0, { bg: '#2d3a6b', fg: '#ffe27a', border: '#f2c14e' });
  // ---- benches, lamps, trees, flowers ringing the square
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const r = 7.5;
    props.bench(Math.sin(a) * r, Math.cos(a) * r, a + Math.PI, '#b07a48');
    props.lamp(Math.sin(a + 0.4) * 10.5, Math.cos(a + 0.4) * 10.5);
  }
  for (const [x, z] of [[-11.5, -11.5], [11.5, -11.5], [-11.5, 11.5], [11.5, 11.5]]) {
    props.tree(x, z, 1.15, Math.abs(x + z) % 3);
    props.flowers(x * 0.75, z * 0.75 + (z > 0 ? 1.4 : -1.4), 2.4, 1.0, x + z);
  }
  // Notice board: storytelling.
  w.block(-6, 0, -12.6, 2.6, 2.2, 0.2, '#7d5130');
  signs.add('UFO OVER STATION?', -6, 1.6, -12.48, 2.4, 0, { bg: '#fbf7ee', fg: '#e2473f', shape: 'poster', sub: 'Fizzwick Gazette' });
  signs.add('LOST: ONE HAT', -6, 0.95, -12.48, 1.6, 0, { bg: '#ffe27a', fg: '#2a2238', shape: 'poster', sub: '(very tall, answers to Officer)' });
  col.box(-6, 0, -12.6, 2.6, 2.2, 0.4);
  // Ice-cream cart (flavour).
  w.block(8, 0, -12.2, 1.6, 1.0, 0.9, '#9ff0cf');
  w.cyl(8, 1.0, -12.2, 0.04, 0.04, 1.4, '#ffffff', 5);
  w.cone(8, 2.3, -12.2, 1.1, 0.5, '#ff8fc0', 8);
  col.box(8, 0, -12.2, 1.6, 1.1, 0.9);

  // ---- district blocks around streets (facades shape the routes)
  const B = (x0: number, x1: number, z0: number, z1: number, h: number, color: string, face: 'n' | 's' | 'e' | 'w', awning?: string) =>
    props.building((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, h, color, { face, awning, roof: P.brickDark });
  // South street flanks.
  B(-16, -4.5, 14.5, 22, 7, '#f39a3d', 'e', '#e2473f');
  B(-16, -4.5, 22.5, 30, 9, '#9fd8ff', 'e');
  B(4.5, 16, 14.5, 22, 8, '#b79cf0', 'w', '#7d4fc9');
  B(4.5, 16, 22.5, 30, 6.5, '#ffe27a', 'w', '#4fb06a');
  // East street flanks.
  B(14.5, 22, 4.5, 14, 7, '#ff7b6b', 's', '#ffffff');
  B(14.5, 22, -14, -4.5, 8, '#9ff0cf', 'n');
  // West street flanks.
  B(-22, -14.5, 4.5, 14, 7.5, '#4a8fe0', 's', '#ffe27a');
  B(-22, -14.5, -14, -4.5, 6.5, '#ff8fc0', 'n');
  // North street flanks.
  B(-16, -4.5, -24, -14.5, 8, '#3bb3a8', 'e', '#f39a3d');
  B(4.5, 16, -31, -14.5, 9, '#c8553d', 'w');
  // Plaza diagonal fillers.
  for (const [x, z] of [[19, 19], [-19, 19], [19, -19], [-19, -19.5]]) {
    props.building(x, z, 9, 9, 10 + (x > 0 ? 2 : 0), x * z > 0 ? '#e5d5ba' : '#d0e8f0', { windows: true });
  }
  // Branch street to the museum (north side wall).
  props.wall(-28, -31.2, -4.5, -31.2, 3.2, '#c8b8a0', 0.6, '#f4e6c8');
  props.wall(-28, -24.6, -16.5, -24.6, 3.2, '#c8b8a0', 0.6, '#f4e6c8');
  for (const x of [-14, -9]) props.lamp(x, -25.3);

  // Street furniture.
  for (const z of [17, 22, 27]) {
    props.lamp(-3.6, z);
    props.lamp(3.6, z);
  }
  for (const z of [-18, -23, -28]) {
    props.lamp(-3.6, z);
    props.lamp(3.6, z);
  }
  props.hydrant(3.5, 19.5);
  props.bin(-3.5, 24.5);
  props.bin(3.5, -20.5, '#4a8fe0');
  props.hydrant(18, 3.4);
  props.hydrant(-18, -3.4);
  for (const x of [17, 21]) {
    props.lamp(x, -3.6);
    props.lamp(-x, 3.6);
  }

  // Street signs pointing to districts.
  const arrow = (text: string, x: number, z: number, ry: number, color: string) => {
    w.cyl(x, 0, z, 0.06, 0.06, 2.6, '#2a2238', 5);
    signs.add(text, x, 2.3, z, 1.8, ry, { bg: color, fg: '#ffffff', shape: 'banner' });
  };
  arrow('STATION', 1.8, 12.8, 0, '#e2473f');
  arrow('MALL', -12.8, 1.8, -Math.PI / 2, '#ff6fb5');
  arrow('CIRCUS', 12.8, -1.8, Math.PI / 2, '#f39a3d');
  arrow('CITY HALL', -1.8, -12.8, Math.PI, '#d8a830');
  arrow('MUSEUM', -4.2, -26.2, -Math.PI / 2, '#3bb3a8');

  // ---- area gates
  const gate = (id: string, area: AreaId, x: number, z: number, w2: number, axis: 'x' | 'z', test: (g: Game) => boolean, label: string, need: string, color: string, ry: number) => {
    ctx.add(new Door(id, area, new THREE.Vector3(x, 0, z), w2, 2.6, axis, { type: 'flag', test, hint: need }, 'gate', label, g));
    // Gate posts + arch sign.
    const ox = axis === 'x' ? w2 / 2 + 0.3 : 0;
    const oz = axis === 'z' ? w2 / 2 + 0.3 : 0;
    for (const s of [-1, 1]) {
      k.world.block(x + s * ox, 0, z + s * oz, 0.6, 3.6, 0.6, '#2a2238');
      k.world.cone(x + s * ox, 3.6, z + s * oz, 0.45, 0.6, color, 4);
      col.box(x + s * ox, 0, z + s * oz, 0.6, 3.6, 0.6);
    }
    signs.add(label, x, 3.3, z, Math.min(w2, 4.4), ry, { bg: color, fg: '#ffffff', border: '#2a2238', sub: need });
    signs.add(label, x, 3.3, z, Math.min(w2, 4.4), ry + Math.PI, { bg: color, fg: '#ffffff', border: '#2a2238', sub: need });
  };
  gate('gate-mall', 'mall', -22.6, 0, 7.4, 'z', (gg) => gg.progress.flag('passGranted'), 'GLITTERBOX MALL', 'City Pass holders only', '#ff6fb5', -Math.PI / 2);
  gate('gate-circus', 'circus', 22.6, 0, 7.4, 'z', (gg) => gg.progress.flag('passGranted'), 'BIG TOP BONANZA', 'City Pass holders only', '#f39a3d', Math.PI / 2);
  gate('gate-museum', 'museum', -20.6, -27.9, 6.0, 'z', (gg) => gg.progress.cores >= 3, 'MUSEUM', 'Opens at 3 Star Cores', '#3bb3a8', -Math.PI / 2);
  gate('gate-cityhall', 'cityhall', 0, -31.8, 7.4, 'x', (gg) => gg.progress.cores >= 4, 'CITY HALL', 'Opens at 4 Star Cores', '#d8a830', Math.PI);

  // ---- hub star bits
  ctx.bit(0, 1.4, 5.5);
  ctx.bit(5.5, 0.9, 0);
  ctx.bit(-5.5, 0.9, 0);
  ctx.bit(0, 0.9, -5.5);
  ctx.bit(0, 5.4, 0);
  ctx.bit(8, 2.9, -12.2);
}

/** Distant layers so the town never ends in a void: hills, trees, skyline. */
export function buildBackdrop(k: KitBuilder, rng: () => number): void {
  const w = k.world;
  // Hills ring.
  for (let i = 0; i < 26; i += 1) {
    const a = (i / 26) * Math.PI * 2;
    const r = 140 + rng() * 30;
    w.add(new THREE.IcosahedronGeometry(28 + rng() * 22, 1), rng() < 0.5 ? '#6fb85e' : '#5aa652', { x: Math.cos(a) * r, y: -10, z: Math.sin(a) * r, sy: 0.55 });
  }
  // Skyline ring with lit windows.
  const cols = ['#e5d5ba', '#d0e8f0', '#f3dce8', '#c8d4e8', '#ffe2c0', '#d8e8c8'];
  for (let i = 0; i < 44; i += 1) {
    const a = (i / 44) * Math.PI * 2 + rng() * 0.05;
    const r = 102 + rng() * 14;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = 10 + rng() * 22;
    const s = 8 + rng() * 6;
    w.add(new THREE.BoxGeometry(s, h, s), cols[i % cols.length], { x, y: h / 2, z, ry: -a });
    w.add(new THREE.BoxGeometry(s * 0.5, 2, s * 0.5), '#a99c86', { x, y: h + 1, z, ry: -a });
    for (let j = 0; j < 4; j += 1) {
      const wy = 3 + j * (h / 4.5);
      k.glow.add(new THREE.BoxGeometry(s * 0.7, 0.8, 0.1), (i + j) % 4 === 0 ? '#ffe7a8' : '#9cc4e0', { x: x - Math.cos(a) * (s / 2 + 0.06), y: wy, z: z - Math.sin(a) * (s / 2 + 0.06), ry: -a + Math.PI / 2 });
    }
  }
  // Tree belt between the town and the skyline.
  for (let i = 0; i < 70; i += 1) {
    const a = (i / 70) * Math.PI * 2;
    const r = 88 + rng() * 8;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const s = 1.4 + rng() * 1.2;
    w.cyl(x, 0, z, 0.25 * s, 0.35 * s, 1.6 * s, '#7d5130', 5);
    w.add(new THREE.IcosahedronGeometry(1.6 * s, 0), rng() < 0.5 ? '#5aa652' : '#4f9a5a', { x, y: 2.8 * s, z });
  }
}
