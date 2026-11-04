import * as THREE from 'three';
import type { AreaCtx } from '../World';
import { CorePickup, Door, ItemPickup, Postcard, Stove } from '../../gameplay/Objects';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Glitterbox Mall: food court, open-mic stage, jeweller, staff room. */
export function buildMall(ctx: AreaCtx): void {
  const { k, props, col, signs, g } = ctx;
  const w = k.world;
  const wall = '#ffd6e8';
  const trim = '#ff6fb5';

  // ---- shell
  props.wall(-62, -19, -23, -19, 6, wall, 0.6, trim);
  props.wall(-62, 19, -41.6, 19, 6, wall, 0.6, trim);
  props.wall(-38.4, 19, -23, 19, 6, wall, 0.6, trim);
  props.wall(-62, -19, -62, 19, 6, wall, 0.6, trim);
  props.wall(-23, -19, -23, -3.7, 6, wall, 0.6, trim);
  props.wall(-23, 3.7, -23, 19, 6, wall, 0.6, trim);
  signs.add('GLITTERBOX MALL', -22.6, 5.1, -7.2, 4.6, Math.PI / 2, { bg: '#ff6fb5', fg: '#ffffff', border: '#2a2238', sub: 'Shop till you hop' });
  signs.add('GLITTERBOX MALL', -22.6, 5.1, 7.2, 4.6, Math.PI / 2, { bg: '#ff6fb5', fg: '#ffffff', border: '#2a2238', sub: 'Now with 40% more glitter' });
  // Skylight frame (overhead, camera-transparent).
  for (let x = -58; x <= -27; x += 6.2) k.metal.add(new THREE.BoxGeometry(0.2, 0.25, 38), '#ffffff', { x, y: 6.4, z: 0 });
  k.metal.add(new THREE.BoxGeometry(39, 0.25, 0.25), '#ffffff', { x: -42.5, y: 6.4, z: 0 });

  // ---- central atrium fountain + fake escalators
  w.cyl(-33, 0, 9, 2.4, 2.6, 0.6, '#ffffff', 14);
  w.cyl(-33, 0, 9, 0.35, 0.45, 1.8, '#ffffff', 8);
  k.metal.sphere(-33, 2.2, 9, 0.5, '#f2c14e', 10, 8);
  const fw = new THREE.Mesh(new THREE.CylinderGeometry(2.25, 2.25, 0.06, 20), g.mats.water);
  fw.position.set(-33, 0.52, 9);
  g.scene.add(fw);
  col.box(-33, 0, 9, 4.8, 0.7, 4.8);
  for (const s of [-1, 1]) {
    w.push({ x: -28.5, z: -12 + s * 1.3 });
    w.add(new THREE.BoxGeometry(1.2, 0.3, 8), '#c0c4d0', { y: 2.2, rx: -0.5 });
    w.add(new THREE.BoxGeometry(0.15, 1.0, 8), '#2a2238', { x: 0.65, y: 2.8, rx: -0.5 });
    w.pop();
  }
  col.box(-28.5, 0, -12, 3, 4.4, 7);
  signs.add('UPPER LEVEL CLOSED: TOO SPARKLY', -28.5, 1.2, -8.3, 2.4, 0, { bg: '#2a2238', fg: '#ffe27a', shape: 'rect' });

  // ---- shopfronts (storytelling) along the walls
  const shop = (x: number, z: number, wd: number, face: number, color: string, name: string, sub: string) => {
    w.push({ x, z, ry: face });
    w.block(0, 0, 0, wd, 4.2, 0.4, color);
    k.glow.box(0, 1.6, 0.22, wd - 1.2, 2.2, 0.04, '#d8f0ff');
    w.block(0, 4.2, 0.1, wd + 0.2, 0.3, 0.7, '#ffffff');
    w.pop();
    const fx = x + Math.sin(face) * 0.24;
    const fz = z + Math.cos(face) * 0.24;
    signs.add(name, fx + Math.sin(face) * 0.02, 3.6, fz + Math.cos(face) * 0.02, Math.min(3.4, wd - 0.6), face, { bg: color, fg: '#ffffff', border: '#2a2238', sub });
  };
  shop(-57, 18.6, 7, Math.PI, '#4a8fe0', 'TOY TOWER', 'Now stocking: saucer plushies');
  shop(-28, 18.6, 8, Math.PI, '#f39a3d', 'SHOE-NAMI', 'Clown sizes available');
  shop(-61.6, 2, 7, Math.PI / 2, '#4fb06a', 'PLANT PALACE', 'Ferns with feelings');
  shop(-61.6, 10, 6, Math.PI / 2, '#7d4fc9', 'GUMBALL GALAXY', '1 coin = 1 universe');
  // Giant shoe sign (silhouette landmark).
  w.add(new THREE.SphereGeometry(1.1, 10, 8), '#e2473f', { x: -28, y: 5.6, z: 17.6, sx: 2, sy: 0.7 });
  // Gumball machine.
  w.cyl(-58.5, 0, 6, 0.5, 0.6, 1.0, '#e2473f', 10);
  w.sphere(-58.5, 1.7, 6, 0.75, '#ffffff', 12, 10);
  for (let i = 0; i < 10; i += 1) w.sphere(-58.5 + Math.cos(i) * 0.4, 1.5 + (i % 3) * 0.2, 6 + Math.sin(i) * 0.4, 0.17, ['#ff6fb5', '#ffe27a', '#4a8fe0', '#4fb06a'][i % 4], 6, 5);
  col.box(-58.5, 0, 6, 1.4, 2.4, 1.4);
  // Mannequins posing.
  for (const [x, z, c] of [[-26, -16, '#ff8fc0'], [-25, -16.2, '#9fd8ff']] as [number, number, string][]) {
    w.cyl(x, 0, z, 0.3, 0.3, 0.1, '#2a2238', 8);
    w.cyl(x, 0.1, z, 0.04, 0.04, 0.8, '#d0d0d8', 5);
    w.cyl(x, 0.9, z, 0.22, 0.3, 0.75, c, 8);
    w.sphere(x, 1.9, z, 0.2, '#f4f0e8', 8, 6);
    col.box(x, 0, z, 0.6, 2, 0.6);
  }
  for (const [x, z] of [[-30, 2.6], [-38, -2.6], [-46, 2.6]]) props.bench(x, z, 0, '#ff8fc0');
  for (const [x, z] of [[-24.5, 12], [-24.5, -6], [-60.5, -6], [-49, 17.8]]) props.planter(x, z, '#ff6fb5');

  // ---- open-mic stage (north)
  w.block(-42, 0, -15.8, 9, 0.4, 5.6, '#7d4fc9');
  w.block(-42, 0.4, -15.8, 8.6, 0.04, 5.2, '#2a2238');
  col.box(-42, 0, -15.8, 9, 0.4, 5.6);
  w.block(-42, 0, -18.4, 9, 5.2, 0.3, '#2a2238');
  for (let i = 0; i < 9; i += 1) k.glow.sphere(-46 + i, 4.8, -18.2, 0.16, i % 2 ? '#ffe27a' : '#ff6fb5', 6, 5);
  for (const s of [-1, 1]) {
    k.metal.cyl(-42 + s * 4.6, 0, -13.4, 0.08, 0.08, 4.6, '#2a2238', 6);
    k.metal.cone(-42 + s * 4.6, 4.4, -13.2, 0.35, 0.45, '#2a2238', 8, { rx: 2.4 });
    col.box(-42 + s * 4.6, 0, -13.4, 0.3, 4.6, 0.3);
  }
  signs.add('OPEN MIC TONIGHT', -42, 3.7, -18.22, 4.4, 0, { bg: '#2a2238', fg: '#ff6fb5', border: '#ffe27a', sub: 'starring VELVET VOX (if she finds her mic)' });
  // Audience circle painted on the floor.
  const ring = new THREE.Mesh(new THREE.RingGeometry(3.7, 4.1, 40), new THREE.MeshBasicMaterial({ color: '#ff6fb5', transparent: true, opacity: 0.75, toneMapped: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(-42, 0.03, -7);
  g.scene.add(ring);
  signs.add('AUDIENCE', -42, 0.05, -3.4, 1.6, 0, { bg: '#ff6fb5', fg: '#ffffff' });

  // ---- food court (south-west)
  ctx.add(new Stove('stove-mall', 'mall', V(-55, 0, 14.6), Math.PI, 'burger', 'grill', g));
  w.block(-50.5, 0, 14.6, 6, 1.0, 1.0, '#ffe27a');
  w.block(-50.5, 1.0, 14.6, 6.2, 0.08, 1.1, '#ffffff');
  col.box(-50.5, 0, 14.6, 6, 1.0, 1.0);
  w.block(-53, 2.4, 18.4, 8, 1.6, 0.2, '#2a2238');
  signs.add('BUN\'S BURGERS', -53, 3.6, 18.2, 3.4, Math.PI, { bg: '#ffe27a', fg: '#e2473f', border: '#2a2238' });
  signs.add('MEGA BURGER · 7 PATTIES', -53, 2.5, 18.25, 3.6, Math.PI, { bg: '#2a2238', fg: '#ffffff', shape: 'rect' });
  for (const [x, z, u] of [[-52, 7, '#e2473f'], [-56.5, 7, '#4a8fe0'], [-48, 10, '#4fb06a'], [-56.5, 11, '#ffe27a']] as [number, number, string][]) props.table(x, z, '#ffffff', u);

  // ---- staff corridor + room (south door guarded by Waldo)
  props.wall(-46, 19, -46, 27, 4.5, '#d8d0e0', 0.5, '#a8a0c0');
  props.wall(-34, 19, -34, 27, 4.5, '#d8d0e0', 0.5, '#a8a0c0');
  props.wall(-46, 27, -34, 27, 4.5, '#d8d0e0', 0.5, '#a8a0c0');
  w.block(-40, 0, 23, 11.6, 0.02, 7.6, '#a8a0c0');
  signs.add('STAFF ONLY', -40, 4.3, 18.65, 2.2, Math.PI, { bg: '#e2473f', fg: '#ffffff', border: '#2a2238' });
  for (const [x, z, s] of [[-44.6, 25.6, 1], [-44.6, 24.4, 0.8], [-35.4, 25.8, 1.1], [-35.4, 21, 0.9]]) props.crateDecor(x, z, s, '#c8955a');
  for (let i = 0; i < 4; i += 1) {
    w.block(-43 + i * 0.75, 0, 26.5, 0.7, 2.1, 0.5, '#4a8fe0');
  }
  col.box(-41.9, 0, 26.5, 3, 2.1, 0.5);
  ctx.add(new ItemPickup('mic-pickup', 'mall', V(-40, 1.0, 24.6), 'mic', g));
  w.block(-40, 0, 24.6, 1.2, 0.7, 0.8, '#7d4fc9');
  col.box(-40, 0, 24.6, 1.2, 0.7, 0.8);
  ctx.add(new Postcard('pc-mall-staff', 'mall', V(-44.6, 2.0, 25.6), 'Backstage Secrets', '"The staff room has a vending machine that only sells napkins. Bought six. — Glim"', g));
  ctx.bit(-37, 0.8, 22);
  ctx.bit(-36, 0.8, 25.5);

  // ---- Sparkle & Co. jeweller (north-west)
  props.wall(-62, -9, -52, -9, 4.5, '#3a3348', 0.5, '#f2c14e');
  props.wall(-52, -19, -52, -15.25, 4.5, '#3a3348', 0.5, '#f2c14e');
  props.wall(-52, -12.75, -52, -9, 4.5, '#3a3348', 0.5, '#f2c14e');
  w.block(-57, 0, -14, 9.6, 0.02, 9.6, '#2a2238');
  ctx.add(new Door('sparkle', 'mall', V(-52, 0, -14), 2.5, 3.0, 'z', { type: 'pick', hint: 'Locked tight. Somebody with nimble fingers could pick this.' }, 'slide', 'Sparkle & Co.', g, [-57, -14]));
  signs.add('SPARKLE & CO.', -51.7, 3.8, -14, 3.4, Math.PI / 2, { bg: '#2a2238', fg: '#f2c14e', border: '#f2c14e', sub: 'Fine jewels since forever' });
  k.glow.box(-51.72, 1.8, -17.1, 0.04, 1.8, 2.8, '#d8f0ff');
  k.glow.box(-51.72, 1.8, -10.9, 0.04, 1.8, 2.8, '#d8f0ff');
  signs.add('MYSTERY GEM — $1,000,000', -51.68, 1.1, -17.1, 2.6, Math.PI / 2, { bg: '#ffe27a', fg: '#2a2238', shape: 'rect' });
  // Pedestal + displays inside.
  w.cyl(-58, 0, -14, 0.7, 0.8, 1.0, '#f2c14e', 10);
  col.box(-58, 0, -14, 1.5, 1.0, 1.5);
  for (const z of [-17.5, -10.5]) {
    w.block(-57, 0, z, 3, 1.0, 0.8, '#7d4fc9');
    for (let i = 0; i < 4; i += 1) k.metal.sphere(-58.2 + i * 0.8, 1.15, z, 0.12, ['#ff6fb5', '#9fd8ff', '#ffe27a', '#4fb06a'][i], 6, 5);
    col.box(-57, 0, z, 3, 1.0, 0.8);
  }
  ctx.add(new CorePickup('mall', V(-58, 1.9, -14), g));
  ctx.bit(-60.5, 0.8, -17.5);

  // ---- NPCs
  const S = ctx.spawns;
  S.push({ id: 'bun', type: 'host', host: 'chef', area: 'mall', x: -52, z: 12.6, yaw: Math.PI, mode: 'wander', radius: 2.2, personality: 'cheerful' });
  S.push({ id: 'velvet', type: 'host', host: 'singer', area: 'mall', x: -42, z: -15.5, yaw: 0, mode: 'idle', personality: 'snooty', talk: 'velvet' });
  S.push({
    id: 'waldo',
    type: 'named',
    named: 'waldo',
    area: 'mall',
    x: -40,
    z: 17.7,
    yaw: Math.PI,
    mode: 'post',
    personality: 'guard',
    guard: {
      blocker: [-40, 18.8, 3.4, 0.9],
      weak: ['feed', 'scare'],
      dish: 'burger',
      movedFlag: 'waldoFed',
      moveTo: [-52, 8.2],
      afterMoveMode: 'eat',
      refuse: { block: 'Staff only. Also I\'m starving. Mostly the staff thing.', intimidate: 'I outrank you, officer. Mall security is a very serious rank.', distract: 'Can\'t laugh on an empty stomach.', lure: 'Can\'t sing-along on an empty stomach either.' },
    },
  });
  S.push({
    id: 'facet',
    type: 'named',
    named: 'facet',
    area: 'mall',
    x: -50.9,
    z: -14,
    yaw: Math.PI / 2,
    mode: 'post',
    personality: 'snooty',
    guard: {
      blocker: [-51.5, -14, 0.9, 2.8],
      weak: ['lure', 'distract'],
      permanent: [],
      releaseFlag: 'door:sparkle',
      strict: true,
      refuse: { block: 'Browsing is by appointment only.', intimidate: 'I have a permit for these prices, officer.', scare: 'A ghost? In MY shop? Be gone, I have insurance.' },
    },
  });
  S.push({ id: 'gus', type: 'named', named: 'gus', area: 'mall', x: -36.5, z: -12, yaw: -Math.PI / 2, mode: 'idle', personality: 'grumpy', talk: 'gus', busy: true });
  for (let i = 0; i < 3; i += 1) S.push({ id: `mall-fan${i}`, type: 'civilian', civ: 'fan', area: 'mall', x: -36 + i * 2, z: -4 + i, mode: 'wander', radius: 4, personality: 'fan', fan: true, pocket: i === 1 ? { postcard: 'pc-mall-fan', label: 'fan mail' } : undefined });
  S.push({ id: 'mall-s1', type: 'civilian', civ: 'shopper', area: 'mall', x: -30, z: 6, mode: 'wander', radius: 5, personality: 'cheerful', fan: true });
  S.push({ id: 'mall-s2', type: 'civilian', civ: 'shopper', area: 'mall', x: -46, z: -4, mode: 'wander', radius: 5, personality: 'snooty', fan: true });
  S.push({ id: 'mall-s3', type: 'civilian', civ: 'kid', area: 'mall', x: -34, z: 13, mode: 'wander', radius: 3, personality: 'kid', fan: true });
  S.push({ id: 'mall-s4', type: 'civilian', civ: 'elder', area: 'mall', x: -30, z: 2.7, yaw: Math.PI, mode: 'sit', personality: 'grumpy', pocket: { item: 'duck', label: 'a rubber duck', bits: 1 } });
  g.registerPostcard('pc-mall-fan', 'mall', 'Fan Mail', '"Dear Velvet, I have named my goldfish after your hair. Signed, a fan. P.S. it is a very big goldfish."');

  // ---- star bits
  for (const [x, y, z] of [[-33, 3.0, 9], [-42, 1.2, -16], [-46, 0.8, 0], [-26, 0.8, 0], [-58.5, 2.9, 6], [-56.5, 1.6, 7], [-50.5, 1.8, 14.6]]) ctx.bit(x, y, z);
}
