import * as THREE from 'three';
import type { AreaCtx } from '../World';
import { PALETTE as P } from '../Materials';
import { Breakable, CorePickup, Crate, Door, Plate, Postcard, Saucer, Vent } from '../../gameplay/Objects';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Puffington Station: crash site, tutorial and finale. */
export function buildStation(ctx: AreaCtx): void {
  const { k, props, col, signs, g } = ctx;
  const w = k.world;
  const brick = '#d8775a';
  const trim = '#fbf0dc';

  // ---- outer walls
  props.wall(-24, 31, -3.7, 31, 5, brick, 0.6, trim);
  props.wall(3.7, 31, 24, 31, 5, brick, 0.6, trim);
  props.wall(-24, 31, -24, 62, 5, brick, 0.6, trim);
  props.wall(24, 31, 24, 49, 5, brick, 0.6, trim);
  props.wall(24, 53, 24, 62, 5, brick, 0.6, trim);
  props.fence(-24, 62, 24, 62, '#2a2238', 1.4);
  // Glass canopy over the platform (visual only, high up so the camera can see under it).
  for (let x = -20; x <= 20; x += 8) {
    k.metal.cyl(x, 0, 55.6, 0.12, 0.14, 6.2, '#2d3a6b', 8);
    col.box(x, 0, 55.6, 0.35, 6.2, 0.35);
    k.metal.add(new THREE.BoxGeometry(0.2, 0.2, 8), '#2d3a6b', { x, y: 6.3, z: 52 });
  }
  k.metal.add(new THREE.BoxGeometry(46, 0.15, 0.2), '#2d3a6b', { x: 0, y: 6.3, z: 48 });
  k.metal.add(new THREE.BoxGeometry(46, 0.15, 0.2), '#2d3a6b', { x: 0, y: 6.3, z: 56 });

  // ---- turnstiles to the street (S2 opens them)
  ctx.add(new Door('turnstile', 'station', V(0, 0, 31), 7.4, 2.6, 'x', { type: 'flag', test: (gg) => gg.progress.flag('passGranted'), hint: 'The turnstiles need a City Pass.' }, 'turnstile', 'Turnstiles', g));
  signs.add('TICKETS PLEASE', 0, 4.2, 31.35, 3.4, 0, { bg: '#2d3a6b', fg: '#ffffff', border: '#ffe27a', sub: 'City Pass required' });
  signs.add('PUFFINGTON STATION', 0, 4.4, 30.65, 4.4, Math.PI, { bg: '#e2473f', fg: '#ffffff', border: '#ffe27a', sub: 'Est. 1888' });

  // ---- platform / concourse divider with the exit gap (blocked by the trunk at start)
  props.wall(-24, 46, -1.05, 46, 2.2, '#c9c2d8', 0.5, trim);
  props.wall(1.05, 46, 24, 46, 2.2, '#c9c2d8', 0.5, trim);
  signs.add('EXIT → CONCOURSE', 0, 2.75, 46.3, 2.4, 0, { bg: '#4fb06a', fg: '#ffffff', shape: 'banner' });
  signs.add('PLATFORM 1', -12, 1.6, 46.28, 2.0, 0, { bg: '#2d3a6b', fg: '#ffffff' });
  signs.add('MIND THE GAP', 12, 1.6, 46.28, 2.0, 0, { bg: '#ffe27a', fg: '#2a2238' });
  signs.add('WANTED: DUCK THIEF', -6, 1.4, 45.72, 1.6, Math.PI, { bg: '#fbf7ee', fg: '#2a2238', shape: 'poster', sub: 'striped sweater, long nose' });
  signs.add('VISIT THE CIRCUS!', 7, 1.4, 45.72, 1.6, Math.PI, { bg: '#f39a3d', fg: '#ffffff', shape: 'poster', sub: 'Human cannonball nightly' });
  g.noDropZones.push([-1.6, 1.6, 44.6, 47.4]);
  const trunk = ctx.add(new Crate('trunk', 'station', V(0, 0, 46), { w: 2.1, h: 1.9, d: 1.0, color: '#7d4fc9', kind: 'trunk', name: 'steamer trunk' }, g));
  void trunk;

  // ---- tracks + parked train (storytelling + far wall)
  for (let x = -24; x < 24; x += 1.2) w.block(x, 0, 58.8, 0.5, 0.08, 3.4, '#7d5130');
  w.block(0, 0.08, 57.8, 48, 0.1, 0.15, '#a8acb8');
  w.block(0, 0.08, 59.8, 48, 0.1, 0.15, '#a8acb8');
  const carColors = ['#e2473f', '#ffe27a', '#4a8fe0'];
  for (let i = 0; i < 3; i += 1) {
    const cx = -16 + i * 12.2;
    w.block(cx, 0.5, 58.8, 11.6, 3.6, 3.4, carColors[i]);
    w.block(cx, 4.1, 58.8, 11.8, 0.4, 3.0, '#fbf7ee');
    w.block(cx, 0.3, 58.8, 11, 0.3, 3.2, '#2a2238');
    for (let j = 0; j < 4; j += 1) k.glow.box(cx - 4 + j * 2.7, 2.7, 57.08, 1.6, 1.1, 0.04, '#ffe7a8');
    for (const wx of [-4, -2.6, 2.6, 4]) w.cyl(cx + wx, 0.1, 57.05, 0.45, 0.45, 0.25, '#2a2238', 10, { rx: Math.PI / 2, y: 0.5 });
    col.box(cx, 0, 58.8, 11.6, 4.6, 3.4, 'none', true);
  }
  signs.add('FIZZWICK EXPRESS', -16, 3.4, 57.08, 4, Math.PI, { bg: '#fbf7ee', fg: '#e2473f' });
  // Buffer stop.
  w.block(21, 0, 58.8, 1.2, 1.2, 3.4, '#e2473f');
  col.box(21, 0, 58.8, 1.6, 1.4, 3.6);

  // ---- crash site: saucer, scorch trail, debris, bent bench
  ctx.add(new Saucer(V(-12, 0, 51.5), g));
  for (let i = 0; i < 7; i += 1) {
    const t = i / 6;
    k.world.add(new THREE.CircleGeometry(0.9 + t * 1.1, 7), '#4a3a4a', { x: -22 + t * 8, y: 0.025 + i * 0.001, z: 54.5 - t * 3, rx: -Math.PI / 2 });
  }
  for (const [x, z, s] of [[-19, 53.5, 0.35], [-16.5, 52, 0.25], [-8, 49, 0.3], [-9, 54, 0.2]]) {
    w.add(new THREE.TetrahedronGeometry(s, 0), '#8a8fa8', { x, y: s * 0.6, z, rx: x, ry: z });
  }
  w.push({ x: -17, z: 49.5, ry: 0.5, rz: 0.25 });
  w.block(0, 0.3, 0, 1.8, 0.1, 0.5, '#b07a48');
  w.block(0, 0, 0, 0.08, 0.4, 0.45, '#2a2238');
  w.pop();
  signs.add('DO NOT TOUCH (pending investigation)', -12, 0.75, 54.1, 2.2, 0, { bg: '#ffe27a', fg: '#2a2238', shape: 'rect' });
  for (const x of [-15, -13, -11, -9]) w.block(x, 0, 54, 0.08, 1.0, 0.08, '#e2473f');
  w.block(-12, 0.9, 54, 6.2, 0.06, 0.04, '#ffe27a');

  // ---- baggage corner: Brick's domain
  const cases = ['#e2473f', '#4a8fe0', '#ffe27a', '#4fb06a', '#ff8fc0', '#7d4fc9'];
  let ci = 0;
  for (const [x, z] of [[15, 54], [17, 54], [19, 54], [15.6, 52.6], [19.4, 52.4]]) {
    for (let s = 0; s < 2; s += 1) props.suitcase(x, s * 0.55, z, cases[ci++ % cases.length], ci * 0.3);
    col.box(x, 0, z, 1.0, 1.1, 0.8);
  }
  ctx.add(new Crate('crate-a', 'station', V(9, 0, 52), { w: 1.1, h: 1.1, d: 1.1, color: '#c8955a', kind: 'crate', name: 'heavy crate' }, g));
  ctx.add(new Crate('crate-b', 'station', V(6.5, 0, 54), { w: 1.1, h: 1.1, d: 1.1, color: '#c8955a', kind: 'crate', name: 'heavy crate' }, g));
  signs.add('BAGGAGE', 17, 2.2, 55.4, 1.8, Math.PI, { bg: '#2d3a6b', fg: '#ffe27a' });
  w.block(17, 0, 55.6, 2, 2.6, 0.1, '#2d3a6b');

  // ---- secret closet behind the cracked wall
  ctx.add(new Breakable('crack-station', 'station', V(24, 0, 51), 4, 5, 'z', g));
  props.wall(24, 48.6, 28.5, 48.6, 4, brick, 0.5);
  props.wall(28.5, 48.6, 28.5, 53.4, 4, brick, 0.5);
  props.wall(24, 53.4, 28.5, 53.4, 4, brick, 0.5);
  w.block(26.3, 0, 51, 4, 0.02, 4.4, '#8a6a4a');
  props.crateDecor(27.6, 49.5, 0.8);
  ctx.add(new Postcard('pc-station-wall', 'station', V(26.2, 1.0, 51), 'The Strongest Wall', '"Dear Mum, a porter punched through a wall today to find me. Fizzwick is lovely. — Glim"', g));
  ctx.bit(26, 0.8, 49.8);
  ctx.bit(26, 0.8, 52.2);

  // ---- concourse: ticket booth (vent secret), newsstand (core), clock, benches
  // Booth: hollow room, vent on the east side.
  props.wall(-15, 31.3, -15, 35.5, 3.2, '#e2473f', 0.4, trim);
  props.wall(-15, 35.5, -9, 35.5, 3.2, '#e2473f', 0.4, trim);
  props.wall(-9, 31.3, -9, 32.8, 3.2, '#e2473f', 0.4, trim);
  props.wall(-9, 33.9, -9, 35.5, 3.2, '#e2473f', 0.4, trim);
  // Wall above the vent.
  w.block(-9, 0.75, 33.35, 0.4, 2.45, 1.1, '#e2473f');
  col.box(-9, 0.75, 33.35, 0.4, 2.45, 1.1, 'none');
  ctx.add(new Vent('vent-booth', 'station', V(-9, 0, 33.35), 'z', g));
  w.block(-12, 3.2, 33.4, 6.4, 0.25, 4.6, '#fbf0dc');
  col.box(-12, 3.2, 33.4, 6.4, 0.25, 4.6);
  k.glow.box(-12, 1.9, 35.72, 3, 1, 0.04, '#bfe8ff');
  w.block(-12, 1.15, 35.85, 3.4, 0.12, 0.4, '#fbf0dc');
  signs.add('TICKETS', -12, 2.75, 35.73, 2.0, 0, { bg: '#ffe27a', fg: '#e2473f', border: '#e2473f' });
  signs.add('SPIKE WOZ ERE', -13.9, 0.8, 35.73, 1.4, 0, { bg: 'rgba(0,0,0,0)', fg: '#ff6fb5', shape: 'rect' });
  ctx.add(new Postcard('pc-station-booth', 'station', V(-12, 0.7, 32.6), 'Lucky Ticket', '"Found a ticket to everywhere under the counter. One-way, of course. — Glim"', g));
  w.block(-13.5, 0, 32.2, 1.8, 0.9, 0.7, '#7d5130');

  // Newsstand with the Star Core on the roof.
  const ns = { x: 13, z: 37.5 };
  w.block(ns.x, 0, ns.z, 4.4, 2.5, 3, '#4fb06a');
  w.block(ns.x, 2.5, ns.z, 4.8, 0.15, 3.4, '#fbf7ee');
  for (let i = 0; i < 6; i += 1) {
    const mx = ns.x - 1.8 + i * 0.72;
    w.block(mx, 0.6, ns.z + 1.52, 0.55, 0.75, 0.06, cases[i]);
    w.block(mx, 1.45, ns.z + 1.52, 0.55, 0.65, 0.06, cases[(i + 3) % 6]);
  }
  col.box(ns.x, 0, ns.z, 4.4, 2.5, 3, 'none', true);
  signs.add('SAUCER SIGHTED?!', ns.x, 2.95, ns.z + 1.72, 3.2, 0, { bg: '#fbf7ee', fg: '#e2473f', shape: 'rect', sub: 'Gazette Extra — Read All About It' });
  ctx.add(new CorePickup('station', V(ns.x, 3.2, ns.z), g));
  const stepPad = ctx.add(new Plate('plate-step', 'station', V(ns.x, 0, 39.75), 1.6, 1.3, 'stepPlaced', g));
  stepPad.snap = [ns.x, 39.58];

  // Station clock (stopped at the moment of the crash).
  k.metal.cyl(0, 3.4, 31.35, 0.9, 0.9, 0.2, '#2d3a6b', 18, { rx: Math.PI / 2, y: 0 });
  k.glow.cyl(0, 3.4, 31.48, 0.78, 0.78, 0.02, '#fbf7ee', 18, { rx: Math.PI / 2, y: 0 });
  w.add(new THREE.BoxGeometry(0.06, 0.6, 0.02), '#2a2238', { x: 0.15, y: 3.65, z: 31.52, rz: -0.5 });
  w.add(new THREE.BoxGeometry(0.06, 0.4, 0.02), '#2a2238', { x: -0.12, y: 3.3, z: 31.52, rz: 2.2 });

  // Departure board.
  w.block(-2, 3.4, 45.6, 6, 1.3, 0.3, '#2a2238');
  col.addStatic({ minX: -5, maxX: 1, minY: 3.4, maxY: 4.7, minZ: 45.4, maxZ: 45.8, enabled: true, pass: 'none', camera: true });
  signs.add('MALL 3:15  ·  CIRCUS 3:40', -2, 4.2, 45.43, 5.4, Math.PI, { bg: '#1a1426', fg: '#ffe27a', shape: 'rect' });
  signs.add('ALL TRAINS DELAYED: SAUCER', -2, 3.6, 45.43, 5.4, Math.PI, { bg: '#1a1426', fg: '#ff7b6b', shape: 'rect' });

  for (const [x, z, ry] of [[-6, 33.2, 0], [6, 33.2, 0], [-19, 38, Math.PI / 2], [19, 34, -Math.PI / 2], [-19, 43, Math.PI / 2]]) props.bench(x, z, ry);
  for (const x of [-20, 20]) for (const z of [36, 42]) props.pillar(x, z, 5, '#fbf0dc', 0.4);
  props.planter(-22.5, 32.5);
  props.planter(22.5, 32.5);
  props.bin(-3, 44.5, '#e2473f');
  props.bin(8, 32, '#e2473f');
  // Vending machine.
  w.block(-21.6, 0, 45, 1.2, 2.2, 0.8, '#4a8fe0');
  k.glow.box(-21.6, 1.4, 44.58, 0.9, 1.0, 0.04, '#bfe8ff');
  col.box(-21.6, 0, 45, 1.2, 2.2, 0.8);
  // Lost & found pile.
  w.block(20.5, 0, 44.2, 3, 0.8, 1.2, '#7d5130');
  w.cyl(19.6, 0.8, 44.2, 0.05, 0.05, 1.0, '#2a2238', 5, { rz: 0.6 });
  w.sphere(21.4, 1.15, 44, 0.38, '#c8955a', 8, 6);
  w.sphere(21.4, 1.6, 44, 0.24, '#c8955a', 8, 6);
  props.suitcase(20.3, 0.8, 44.3, '#ff8fc0', 0.4);
  signs.add('LOST & FOUND', 20.5, 1.7, 44.85, 1.6, 0, { bg: '#fbf7ee', fg: '#2a2238', shape: 'poster' });
  col.box(20.5, 0, 44.2, 3, 0.9, 1.2);

  // ---- NPCs
  const S = ctx.spawns;
  S.push({ id: 'brick', type: 'host', host: 'strongman', area: 'station', x: 3, z: 49, yaw: -Math.PI / 2, mode: 'wander', radius: 1.6, personality: 'cheerful' });
  S.push({ id: 'pina', type: 'host', host: 'police', area: 'station', x: -4, z: 40, yaw: 0, mode: 'wander', radius: 5, personality: 'guard' });
  S.push({
    id: 'spike',
    type: 'named',
    named: 'spike',
    area: 'station',
    x: -12,
    z: 36.7,
    yaw: 0,
    mode: 'post',
    personality: 'grumpy',
    guard: {
      blocker: [-12, 36.4, 0, 0],
      weak: ['intimidate', 'scare', 'lure'],
      info: 'Spike won\'t budge for just anyone. Try the law: Officer Pina\'s whistle',
      movedFlag: 'spikeGone',
      moveTo: [18.6, 34],
      afterMoveMode: 'sit',
      refuse: { distract: 'Clowns are for babies.', block: 'This window\'s mine, pal.' },
    },
    pocket: { label: 'a can of glitter paint', bits: 1 },
  });
  S.push({
    id: 'mabel',
    type: 'named',
    named: 'mabel',
    area: 'station',
    x: -19.6,
    z: 40.8,
    yaw: Math.PI / 2,
    mode: 'idle',
    personality: 'nervous',
    emotion: 'scared',
    talk: 'mabel',
    relocate: { flag: 'spikeGone', to: [-12, 36.4], mode: 'idle', yaw: 0, emotion: 'happy' },
    busy: true,
  });
  S.push({
    id: 'gertie',
    type: 'named',
    named: 'gertie',
    area: 'station',
    x: 13,
    z: 41.4,
    yaw: 0,
    mode: 'post',
    personality: 'guard',
    talk: 'gertie',
    guard: {
      blocker: [13, 39.75, 2.0, 1.6],
      weak: ['intimidate', 'scare'],
      info: 'Gertie only takes a break when a police officer tells her to',
      movedFlag: 'gertieBreak',
      moveTo: [-19, 38],
      afterMoveMode: 'sit',
      strict: true,
      refuse: { block: 'No climbing on the newsstand. Station rules.', distract: 'I\'ve seen funnier timetables.', lure: 'I only listen to the PA system.' },
    },
  });
  S.push({ id: 'st-c1', type: 'civilian', civ: 'commuter', area: 'station', x: 4, z: 38, mode: 'wander', radius: 6, personality: 'nervous' });
  S.push({ id: 'st-c2', type: 'civilian', civ: 'commuter', area: 'station', x: -6, z: 42, mode: 'wander', radius: 5, personality: 'grumpy', pocket: { item: 'wallet', label: 'a lost wallet' } });
  S.push({ id: 'st-c3', type: 'civilian', civ: 'tourist', area: 'station', x: 18, z: 54.5, yaw: Math.PI, mode: 'idle', personality: 'cheerful' });
  S.push({ id: 'st-c4', type: 'civilian', civ: 'elder', area: 'station', x: 6, z: 33.2, yaw: 0, mode: 'sleep', personality: 'sleepy' });
  S.push({ id: 'st-c5', type: 'civilian', civ: 'kid', area: 'station', x: -2, z: 36, mode: 'wander', radius: 4, personality: 'kid' });

  // ---- star bits
  for (const [x, y, z] of [[-6, 0.8, 48], [-2, 0.8, 51.5], [3, 0.8, 47.4], [-8, 0.8, 38], [0, 0.8, 35], [8, 0.8, 43], [20, 0.8, 33], [15, 1.9, 54]]) ctx.bit(x, y, z);
  void P;
}
