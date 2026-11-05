import * as THREE from 'three';
import type { AreaCtx } from '../World';
import { GeoBuilder } from '../GeoBuilder';
import { Cannon, CorePickup, Door, HighStriker, ItemPickup, Postcard, Stove, WorldObject } from '../../gameplay/Objects';
import type { Game } from '../../game/Game';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Slowly turning ferris wheel: a landmark that reads from across town. */
class Ferris extends WorldObject {
  private readonly wheel = new THREE.Group();
  constructor(pos: THREE.Vector3, g: Game) {
    super('ferris', 'circus', pos);
    const b = new GeoBuilder();
    for (const s of [-1, 1]) {
      b.add(new THREE.CylinderGeometry(0.2, 0.25, 10, 6), '#fbf7ee', { x: s * 3, y: 4.6, z: -0.8, rz: s * 0.32 });
      b.add(new THREE.CylinderGeometry(0.2, 0.25, 10, 6), '#fbf7ee', { x: s * 3, y: 4.6, z: 0.8, rz: s * 0.32 });
    }
    b.block(0, 0, 0, 8, 0.4, 3, '#c8243a');
    const base = new THREE.Mesh(b.buildGeometry()!, g.mats.world);
    base.castShadow = true;
    this.group.add(base);
    const wb = new GeoBuilder();
    wb.add(new THREE.TorusGeometry(6.5, 0.18, 6, 32), '#ffe27a');
    wb.add(new THREE.TorusGeometry(4.0, 0.12, 6, 28), '#ff6fb5');
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2;
      wb.add(new THREE.BoxGeometry(0.12, 6.5, 0.12), '#fbf7ee', { x: Math.cos(a) * 3.25, y: Math.sin(a) * 3.25, rz: a + Math.PI / 2 });
    }
    wb.cyl(0, -0.4, 0, 0.6, 0.6, 0.8, '#c8243a', 10, { rx: Math.PI / 2, y: 0 });
    const wheel = new THREE.Mesh(wb.buildGeometry()!, g.mats.world);
    this.wheel.add(wheel);
    const cb = new GeoBuilder();
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      cb.block(Math.cos(a) * 6.5, Math.sin(a) * 6.5 - 1.1, 0, 1.2, 0.9, 1.2, ['#4a8fe0', '#4fb06a', '#f39a3d', '#7d4fc9'][i % 4]);
    }
    const cars = new THREE.Mesh(cb.buildGeometry()!, g.mats.world);
    this.wheel.add(cars);
    this.wheel.position.y = 9.4;
    this.group.add(this.wheel);
    g.col.box(pos.x, 0, pos.z, 8, 3, 3);
    this.range = 0;
  }
  update(dt: number): void {
    this.wheel.rotation.z += dt * 0.15;
  }
}

export function buildCircus(ctx: AreaCtx): void {
  const { k, props, col, signs, g } = ctx;
  const w = k.world;
  // ---- perimeter fence + entrance arch
  const post = (x0: number, z0: number, x1: number, z1: number) => props.fence(x0, z0, x1, z1, '#fbf7ee', 1.3);
  post(23, -24, 23, -3.7);
  post(23, 3.7, 23, 24);
  post(23, -24, 68, -24);
  post(23, 24, 68, 24);
  post(68, -24, 68, 24);
  for (const s of [-1, 1]) {
    w.cyl(23.4, 0, s * 4.3, 0.35, 0.35, 5, s > 0 ? '#e2473f' : '#ffe27a', 10);
    w.sphere(23.4, 5.2, s * 4.3, 0.45, '#ff6fb5', 8, 6);
    col.box(23.4, 0, s * 4.3, 0.8, 5, 0.8);
  }
  w.add(new THREE.TorusGeometry(4.3, 0.25, 6, 20, Math.PI), '#e2473f', { x: 23.4, y: 5, ry: Math.PI / 2 });
  signs.add('BIG TOP BONANZA', 23.8, 6.6, 0, 5, Math.PI / 2, { bg: '#e2473f', fg: '#ffe27a', border: '#2a2238', sub: 'Step right up!' });

  // ---- Big Top tent
  const cx = 48;
  const cz = 0;
  const R = 12;
  const segs = 28;
  for (let i = 0; i < segs; i += 1) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const x = cx + Math.cos(am) * R;
    const z = cz + Math.sin(am) * R;
    const entrance = Math.abs(Math.atan2(Math.sin(am - Math.PI), Math.cos(am - Math.PI))) < 0.17;
    if (entrance) continue;
    const len = 2 * R * Math.sin(Math.PI / segs) + 0.05;
    w.add(new THREE.BoxGeometry(len, 5.2, 0.3), i % 2 ? '#e2473f' : '#fbf7ee', { x, y: 2.6, z, ry: -am + Math.PI / 2 });
  }
  // Colliders: small boxes around the circumference (AABB approximation of the ring).
  for (let i = 0; i < 70; i += 1) {
    const a = (i / 70) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a - Math.PI), Math.cos(a - Math.PI))) < 0.19) continue;
    col.box(cx + Math.cos(a) * R, 0, cz + Math.sin(a) * R, 1.2, 5.2, 1.2, 'none', true);
  }
  // Roof (double sided, no shadow so the ring stays bright).
  const roofGeo = new GeoBuilder();
  for (let i = 0; i < 16; i += 1) {
    roofGeo.add(new THREE.ConeGeometry(R + 0.8, 7, 16, 1, true, (i / 16) * Math.PI * 2, Math.PI / 8), i % 2 ? '#e2473f' : '#fbf7ee');
  }
  const roofMat = g.mats.worldSmooth.clone();
  roofMat.side = THREE.DoubleSide;
  const roof = new THREE.Mesh(roofGeo.buildGeometry()!, roofMat);
  roof.position.set(cx, 5.2 + 3.5, cz);
  roof.castShadow = false;
  g.scene.add(roof);
  k.metal.cyl(cx, 12, cz, 0.08, 0.08, 2.5, '#2a2238', 5);
  k.world.add(new THREE.ConeGeometry(0.5, 1.2, 3), '#ffe27a', { x: cx + 0.5, y: 13.9, z: cz, rz: -Math.PI / 2, sz: 0.2 });
  ctx.add(new Door('bigtop-flap', 'circus', V(cx - R + 0.2, 0, cz), 4.2, 5, 'z', { type: 'flag', test: (gg) => gg.progress.flag('bigTopOpen'), hint: 'The Big Top is closed until the crowd warms up.' }, 'flap', 'Big Top', g));
  signs.add('THE GREAT CANNONBALL SHOW', cx - R - 0.3, 5.9, cz, 4.6, -Math.PI / 2, { bg: '#2a2238', fg: '#ffe27a', border: '#ffe27a', sub: 'Doors open when the crowd cheers' });

  // Inside: ring, bleachers, cannon, trapeze, hay, net.
  for (let i = 0; i < 24; i += 1) {
    const a = (i / 24) * Math.PI * 2;
    w.add(new THREE.BoxGeometry(1.4, 0.5, 0.5), i % 2 ? '#e2473f' : '#ffe27a', { x: cx + Math.cos(a) * 5.4, y: 0.25, z: cz + Math.sin(a) * 5.4, ry: -a + Math.PI / 2 });
  }
  for (let i = 0; i < 10; i += 1) {
    const a = -0.9 + i * 0.2 + Math.PI * 0.5;
    for (let r = 0; r < 3; r += 1) w.add(new THREE.BoxGeometry(1.9, 0.5 + r * 0.5, 0.9), r % 2 ? '#4a8fe0' : '#7d4fc9', { x: cx + Math.cos(a) * (9.4 + r * 0.9), y: 0.25 + r * 0.25, z: cz + Math.sin(a) * (9.4 + r * 0.9), ry: -a + Math.PI / 2 });
  }
  const pole = { x: 52, z: -3 };
  k.metal.cyl(pole.x, 0, pole.z, 0.14, 0.18, 6.3, '#fbf7ee', 8);
  col.box(pole.x, 0, pole.z, 0.4, 6.25, 0.4);
  w.block(pole.x, 6.25, pole.z, 2.8, 0.25, 2.8, '#7d4fc9');
  col.addStatic({ minX: pole.x - 1.4, maxX: pole.x + 1.4, minY: 6.25, maxY: 6.5, minZ: pole.z - 1.4, maxZ: pole.z + 1.4, enabled: true, pass: 'none' });
  for (const s of [-1, 1]) k.metal.cyl(pole.x + s * 1.3, 6.5, pole.z + 1.3, 0.04, 0.04, 1, '#ffe27a', 5);
  // Trapeze bar swinging high above.
  w.add(new THREE.BoxGeometry(1.6, 0.08, 0.08), '#ffe27a', { x: cx, y: 8.6, z: cz - 3 });
  // Broken ladder + sign (storytelling).
  for (let i = 0; i < 4; i += 1) w.block(pole.x - 1.6, i * 0.5, pole.z + 1, 0.8, 0.06, 0.06, '#b07a48');
  w.add(new THREE.BoxGeometry(0.06, 2.4, 0.06), '#b07a48', { x: pole.x - 2.0, y: 0.6, z: pole.z + 1.2, rz: 1.2 });
  signs.add('LADDER OUT FOR REPAIRS', pole.x - 1.2, 1.6, pole.z + 1.6, 1.8, Math.PI * 0.85, { bg: '#ffe27a', fg: '#2a2238', shape: 'rect' });
  ctx.add(new CorePickup('circus', V(pole.x, 7.2, pole.z), g));
  // Hay pile + safety net.
  w.add(new THREE.SphereGeometry(1.6, 10, 6), '#e8c860', { x: 53, y: 0.3, z: 7, sy: 0.5 });
  col.box(53, 0, 7, 2.6, 0.8, 2.6);
  for (let i = 0; i < 4; i += 1) k.metal.cyl(48 + (i % 2) * 4, 0, -7.5 + Math.floor(i / 2) * 2.5 - 1, 0.06, 0.06, 1.2, '#2a2238', 5);
  w.block(50, 1.1, -7.25, 4.2, 0.05, 2.6, '#fbf7ee');
  const aims = [
    { label: 'the hay pile', target: [53, 1.0, 7] as [number, number, number], yaw: Math.atan2(53 - 42, 7 - 3) },
    { label: 'the safety net', target: [50, 1.2, -7] as [number, number, number], yaw: Math.atan2(50 - 42, -7 - 3) },
    { label: 'the trapeze platform', target: [pole.x, 6.55, pole.z] as [number, number, number], yaw: Math.atan2(pole.x - 42, pole.z - 3) },
  ];
  ctx.add(new Cannon('cannon', 'circus', V(42, 0, 3), aims, 2, g));
  signs.add('HUMAN CANNONBALL', 42, 2.8, 5.8, 2.2, Math.PI, { bg: '#e2473f', fg: '#ffffff', shape: 'banner' });

  // ---- queue outside the Big Top + ticket booth (bouncy-jump secret on its roof)
  w.block(27, 0, 8, 2, 2.1, 2, '#ffe27a');
  w.block(27, 2.1, 8, 2.4, 0.15, 2.4, '#e2473f');
  k.glow.box(28.02, 1.2, 8, 0.04, 0.8, 1.2, '#d8f0ff');
  col.box(27, 0, 8, 2, 2.1, 2);
  signs.add('TICKETS', 28.05, 1.75, 8, 1.4, Math.PI / 2, { bg: '#e2473f', fg: '#ffffff' });
  ctx.add(new Postcard('pc-circus-roof', 'circus', V(27, 2.75, 8), 'Top of the Tops', '"Only the bounciest shoes reach this roof. Noodle says hi. — Glim"', g));
  // Queue rope.
  for (let i = 0; i < 4; i += 1) {
    k.metal.cyl(30.5, 0, -3 + i * 2, 0.06, 0.08, 1, '#f2c14e', 6);
    col.box(30.5, 0, -3 + i * 2, 0.2, 1, 0.2);
  }
  w.block(30.5, 0.85, 0, 0.06, 0.06, 6, '#c8243a');

  // ---- trailer (backstage) with keycard door
  const tr = { x0: 26.5, x1: 33.5, z0: 14, z1: 19 };
  props.wall(tr.x0, tr.z0, 29.2, tr.z0, 3.2, '#4a8fe0', 0.4, '#fbf7ee');
  props.wall(30.8, tr.z0, tr.x1, tr.z0, 3.2, '#4a8fe0', 0.4, '#fbf7ee');
  props.wall(tr.x0, tr.z1, tr.x1, tr.z1, 3.2, '#4a8fe0', 0.4, '#fbf7ee');
  props.wall(tr.x0, tr.z0, tr.x0, tr.z1, 3.2, '#4a8fe0', 0.4, '#fbf7ee');
  props.wall(tr.x1, tr.z0, tr.x1, tr.z1, 3.2, '#4a8fe0', 0.4, '#fbf7ee');
  w.block(30, 3.2, 16.5, 7.4, 0.25, 5.4, '#fbf7ee');
  col.box(30, 3.2, 16.5, 7.4, 0.25, 5.4);
  for (const x of [27.5, 32.5]) w.cyl(x, 0, 19.2, 0.4, 0.4, 0.3, '#2a2238', 10, { rx: Math.PI / 2, y: 0.4 });
  w.block(30, 2.0, 13.75, 1.0, 0.6, 0.05, '#ffe27a');
  signs.add('RINGMASTER · KEEP OUT', 30, 2.7, 13.76, 2.4, Math.PI, { bg: '#2a2238', fg: '#ffe27a', shape: 'rect' });
  ctx.add(new Door('trailer', 'circus', V(30, 0, 14), 1.6, 2.6, 'x', { type: 'item', item: 'keycard', consume: true, hint: 'A keycard slot. Moose the bouncer wears the card on his belt.' }, 'slide', 'Trailer', g, [30, 16.5]));
  ctx.add(new ItemPickup('fuse-pickup', 'circus', V(32, 1.0, 17.8), 'fuse', g));
  w.block(32, 0, 17.8, 1.2, 0.7, 0.8, '#7d5130');
  col.box(32, 0, 17.8, 1.2, 0.7, 0.8);
  ctx.add(new Postcard('pc-circus-diary', 'circus', V(27.6, 0.9, 17.8), "Ringmaster's Diary", '"Day 312: the cannon fired the ladder into orbit. Must buy a new ladder. Maybe two. — R."', g));
  ctx.bit(28, 0.8, 15.5);

  // ---- fairground props
  ctx.add(new Ferris(V(60, 0, -15), g));
  ctx.add(new HighStriker('striker', 'circus', V(40, 0, -15), g));
  signs.add('TEST YOUR STRENGTH', 40, 6.9, -15.2, 2.6, 0, { bg: '#e2473f', fg: '#ffffff', shape: 'banner' });
  ctx.add(new Stove('stove-candy', 'circus', V(58, 0, 15), Math.PI, 'candy', 'cart', g));
  signs.add('COTTON CANDY', 58, 2.9, 15.2, 2.0, Math.PI, { bg: '#ff6fb5', fg: '#ffffff' });
  // Game booths.
  for (const [x, z, c] of [[38, 18, '#4fb06a'], [44, 18, '#f39a3d'], [50, 18, '#4a8fe0']] as [number, number, string][]) {
    w.block(x, 0, z, 4, 1.1, 2, c);
    w.block(x, 1.1, z + 0.7, 4, 1.6, 0.2, '#fbf7ee');
    for (let i = 0; i < 5; i += 1) w.add(new THREE.ConeGeometry(0.5, 0.8, 4), i % 2 ? '#fbf7ee' : c, { x: x - 1.6 + i * 0.8, y: 3.1, z: z, rx: Math.PI });
    for (const s of [-1, 1]) w.cyl(x + s * 1.9, 0, z - 0.9, 0.06, 0.06, 3.2, '#fbf7ee', 5);
    col.box(x, 0, z, 4, 1.4, 2);
  }
  signs.add('RING TOSS', 38, 2.0, 18.82, 2, Math.PI, { bg: '#fbf7ee', fg: '#4fb06a', shape: 'rect' });
  signs.add('DUCK POND', 44, 2.0, 18.82, 2, Math.PI, { bg: '#fbf7ee', fg: '#f39a3d', shape: 'rect' });
  signs.add('BALLOON POP', 50, 2.0, 18.82, 2, Math.PI, { bg: '#fbf7ee', fg: '#4a8fe0', shape: 'rect' });
  // Balloon bunches.
  for (const [x, z] of [[34, -8], [62, 4], [36, 10]]) {
    for (let i = 0; i < 5; i += 1) {
      w.add(new THREE.CylinderGeometry(0.01, 0.01, 2, 3), '#ffffff', { x: x + Math.cos(i) * 0.2, y: 1, z: z + Math.sin(i) * 0.2 });
      k.smooth.sphere(x + Math.cos(i * 1.3) * 0.45, 2.3 + (i % 2) * 0.35, z + Math.sin(i * 1.3) * 0.45, 0.3, ['#ff6fb5', '#ffe27a', '#4a8fe0', '#4fb06a', '#e2473f'][i], 8, 6, { sy: 1.2 });
    }
  }
  // Juggling stand (Noodle's spot) + popcorn.
  w.block(31, 0, -13, 3, 0.5, 3, '#7d4fc9');
  col.box(31, 0, -13, 3, 0.5, 3);
  w.block(36, 0, -20, 1.6, 1.4, 1.2, '#e2473f');
  for (let i = 0; i < 8; i += 1) w.sphere(36 + Math.cos(i) * 0.4, 1.55 + (i % 2) * 0.12, -20 + Math.sin(i) * 0.3, 0.15, '#fff6d0', 5, 4);
  col.box(36, 0, -20, 1.6, 1.6, 1.2);
  props.tree(65, -21, 1.2, 0);
  props.tree(65, 21, 1.1, 1);
  props.tree(26, -21, 1.0, 2);
  for (const [x, z, r] of [[27, -6, Math.PI / 2], [36, -6, Math.PI / 2]]) props.bench(x, z, r, '#e2473f');

  // ---- NPCs
  const S = ctx.spawns;
  S.push({ id: 'noodle', type: 'host', host: 'clown', area: 'circus', x: 31, z: -10.5, yaw: Math.PI / 2, mode: 'wander', radius: 2.5, personality: 'cheerful' });
  S.push({ id: 'slink', type: 'host', host: 'thief', area: 'circus', x: 42, z: 13.5, yaw: 0, mode: 'wander', radius: 4, personality: 'nervous' });
  S.push({ id: 'rosalind', type: 'named', named: 'rosalind', area: 'circus', x: 34.6, z: 4.2, yaw: Math.PI / 2, mode: 'idle', personality: 'cheerful', talk: 'rosalind', busy: true });
  S.push({ id: 'tilly', type: 'named', named: 'tilly', area: 'circus', x: 29, z: 9.5, yaw: Math.PI / 2, mode: 'idle', personality: 'cheerful', talk: 'tilly', busy: true });
  S.push({
    id: 'moose',
    type: 'named',
    named: 'moose',
    area: 'circus',
    x: 30,
    z: 12.8,
    yaw: Math.PI,
    mode: 'post',
    personality: 'guard',
    pocket: { item: 'keycard', label: 'the backstage keycard' },
    guard: {
      blocker: [30, 13.45, 2.4, 0.8],
      weak: ['distract', 'scare'],
      permanent: ['scare'],
      info: 'Moose can\'t resist a good show. Noodle the clown, perhaps?',
      movedFlag: 'mooseSearching',
      moveTo: [40, 9],
      afterMoveMode: 'wander',
      strict: true,
      refuse: { block: 'Backstage is closed, little buddy.', intimidate: 'Moose don\'t scare easy, officer.', lure: 'Moose only likes polka.' },
    },
  });
  const queue: [number, number][] = [[32, -2.6], [32, -0.9], [32, 0.9], [32, 2.6]];
  queue.forEach(([x, z], i) => S.push({ id: `queue${i}`, type: 'civilian', civ: i % 2 ? 'kid' : 'tourist', area: 'circus', x, z, yaw: Math.PI / 2, mode: 'idle', personality: i % 2 ? 'kid' : 'grumpy', emotion: 'sad' }));
  S.push({
    id: 'candykid',
    type: 'civilian',
    civ: 'kid',
    area: 'circus',
    x: 55,
    z: 12.5,
    yaw: Math.PI,
    mode: 'idle',
    personality: 'kid',
    emotion: 'sad',
    guard: { blocker: [0, 0, 0, 0], info: 'This kid dreams of cotton candy (Chef Bun, at the pink cart)', weak: ['feed'], dish: 'candy', movedFlag: 'candyKid', moveTo: [55, 12.5], afterMoveMode: 'eat' },
  });
  S.push({ id: 'circ-t1', type: 'civilian', civ: 'tourist', area: 'circus', x: 46, z: -16, mode: 'wander', radius: 6, personality: 'cheerful' });
  S.push({ id: 'circ-t2', type: 'civilian', civ: 'kid', area: 'circus', x: 40, z: 6, mode: 'wander', radius: 5, personality: 'kid' });
  S.push({ id: 'circ-t3', type: 'civilian', civ: 'artsy', area: 'circus', x: 58, z: 6, mode: 'wander', radius: 5, personality: 'snooty', pocket: { label: 'a juggling pin', bits: 1 } });

  // ---- star bits
  for (const [x, y, z] of [[27, 0.8, 0], [40, 0.8, -8], [56, 0.8, -12], [62, 0.8, 0], [48, 1.2, 0], [44, 0.8, 10], [53, 2.2, 7], [31, 1.3, -13], [58, 0.8, 20]]) ctx.bit(x, y, z);
}
