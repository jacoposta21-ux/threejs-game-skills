import * as THREE from 'three';
import type { AreaCtx } from '../World';
import { CorePickup, Door, Machine, Postcard, Stove } from '../../gameplay/Objects';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const MEZZ = 2.6;

/** Fizzwick City Hall: plaza, red tape, a hungry bodyguard and the decree vault. */
export function buildCityHall(ctx: AreaCtx): void {
  const { k, props, col, signs, g } = ctx;
  const w = k.world;
  const stone = '#f0e2c6';
  const trim = '#d8a830';

  // ---- plaza boundary (hedges + low railings)
  const hedge = (x0: number, z0: number, x1: number, z1: number) => {
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const wd = Math.abs(x1 - x0) || 1.2;
    const dd = Math.abs(z1 - z0) || 1.2;
    w.block(cx, 0, cz, wd, 1.6, dd, '#5aa652');
    w.block(cx, 1.6, cz, wd - 0.2, 0.3, dd - 0.2, '#7cc56b');
    col.box(cx, 0, cz, wd, 2.2, dd);
  };
  hedge(-26, -32.2, -4.3, -32.2);
  hedge(4.3, -32.2, 26, -32.2);
  hedge(-26.2, -88, -26.2, -32);
  hedge(26.2, -88, 26.2, -32);
  hedge(-26, -88.2, 26, -88.2);

  // ---- plaza: founder statue, flowerbeds, press podium
  w.block(0, 0, -45, 3.2, 1.4, 3.2, '#d9cdb8');
  w.block(0, 1.4, -45, 2.6, 0.3, 2.6, '#c8b8a0');
  w.cyl(0, 1.7, -45, 0.5, 0.6, 1.4, '#c8a860', 10);
  w.sphere(0, 3.5, -45, 0.5, '#c8a860', 10, 8);
  w.cyl(0, 3.9, -45, 0.36, 0.34, 0.7, '#b89850', 10);
  w.add(new THREE.CylinderGeometry(0.06, 0.06, 1.0, 5), '#b89850', { x: 0.55, y: 3.0, z: -45, rz: -2.4 });
  col.box(0, 0, -45, 3.2, 4.6, 3.2);
  signs.add('OUR FOUNDER (PROBABLY A BUMBLETON)', 0, 0.9, -43.38, 2.8, 0, { bg: '#2a2238', fg: '#f2c14e', shape: 'rect' });
  for (const [x, z] of [[-12, -40], [12, -40], [-12, -50], [12, -50]]) props.flowers(x, z, 4, 1.6, x + z);
  for (const [x, z] of [[-7, -36], [7, -36], [-19, -45], [19, -45]]) props.lamp(x, z, 3.8, '#2a2238');
  for (const [x, z, r] of [[-7, -45, Math.PI / 2], [7, -45, -Math.PI / 2]]) props.bench(x, z, r, '#7d5130');
  // Press podium.
  w.block(0, 0, -53.6, 1.4, 1.2, 0.9, '#2d3a6b');
  k.metal.cyl(0.3, 1.2, -53.4, 0.03, 0.03, 0.5, '#2a2238', 5);
  col.box(0, 0, -53.6, 1.4, 1.2, 0.9);
  signs.add('PRESS CONFERENCE (DELAYED)', 0, 0.75, -53.13, 1.6, 0, { bg: '#fbf7ee', fg: '#2d3a6b', shape: 'rect' });
  for (const x of [-16, 16]) props.tree(x, -56, 1.2, x > 0 ? 1 : 0);

  // ---- building shell
  const H = 7.5;
  props.wall(-18, -58, -2.2, -58, H, stone, 0.6, trim);
  props.wall(2.2, -58, 18, -58, H, stone, 0.6, trim);
  props.wall(-18, -84, 18, -84, H, stone, 0.6, trim);
  props.wall(-18, -84, -18, -58, H, stone, 0.6, trim);
  props.wall(18, -84, 18, -58, H, stone, 0.6, trim);
  for (let x = -14; x <= 14; x += 4) if (Math.abs(x) > 2) props.pillar(x, -56.8, 6.8, '#fbf7ee', 0.42);
  w.block(0, 6.8, -56.8, 33, 0.6, 1.6, '#fbf7ee');
  w.add(new THREE.ConeGeometry(17, 3.2, 3), '#fbf7ee', { x: 0, y: 9.0, z: -57, rx: Math.PI / 2, sz: 0.12 });
  w.add(new THREE.ConeGeometry(15, 2.6, 3), '#d8a830', { x: 0, y: 8.8, z: -56.9, rx: Math.PI / 2, sz: 0.12 });
  k.metal.sphere(0, 9.4, -70, 3.2, '#d8a830', 14, 8, { sy: 0.8 });
  k.metal.cyl(0, 11.8, -70, 0.08, 0.08, 1.6, '#2a2238', 5);
  signs.add('FIZZWICK CITY HALL', 0, 7.1, -55.95, 5, 0, { bg: '#2d3a6b', fg: '#f2c14e', border: '#f2c14e', sub: 'Bureaucracy since 1802' });
  for (let i = 0; i < 3; i += 1) w.block(0, 0, -57.5 + i * 0.01, 4.6 - i * 0.6, 0.06 + i * 0.02, 1.4, '#c8243a');
  // Clock on the facade (ticking in the ambience).
  k.metal.cyl(0, 5.0, -55.98, 1.0, 1.0, 0.15, '#2d3a6b', 18, { rx: Math.PI / 2, y: 0 });
  k.glow.cyl(0, 5.0, -55.88, 0.85, 0.85, 0.02, '#fbf7ee', 18, { rx: Math.PI / 2, y: 0 });

  // ---- ground floor interior
  w.block(0, 0, -71, 35.4, 0.03, 25.4, '#e8d8c0');
  for (let z = -80; z <= -60; z += 4) w.block(0, 0.03, z, 3, 0.02, 2, '#c8243a');
  // Reception (Doris).
  w.block(6, 0, -64.6, 3.4, 1.15, 0.6, '#7d5130');
  w.block(6, 1.15, -64.6, 3.6, 0.08, 0.8, '#d8a830');
  col.box(6, 0, -64.6, 3.4, 1.2, 0.6);
  signs.add('RECEPTION', 6, 0.75, -64.28, 1.6, 0, { bg: '#2d3a6b', fg: '#ffffff', shape: 'rect' });
  signs.add('ALL VISITORS NEED FORM 27-B', 6, 3.0, -64.9, 3, 0, { bg: '#fbf7ee', fg: '#c8243a', shape: 'poster' });
  // Stamp machine.
  ctx.add(
    new Machine('stamp', 'cityhall', V(-6, 0, -63), 0, {
      flag: 'stampFixed',
      label: 'stamp machine',
      look: 'stamp',
      extraE: {
        label: 'Print Form 27-B',
        test: (gg) => gg.progress.flag('stampFixed') && !gg.hasItem('permit') && !gg.progress.flag('permitOk'),
        run: (gg) => {
          gg.giveItem('permit');
          gg.audio.play('chime');
        },
      },
    }, g),
  );
  col.box(-6, 0, -63, 1.2, 1.8, 0.9);
  signs.add('OUT OF ORDER', -6, 2.1, -62.5, 1.4, 0, { bg: '#e2473f', fg: '#ffffff', shape: 'rect' });
  // Café (south-west).
  props.wall(-18, -63, -14.2, -63, 3, '#d8c8a8', 0.4, trim);
  ctx.add(new Stove('stove-cityhall', 'cityhall', V(-15.2, 0, -59.6), Math.PI, 'souffle', 'oven', g));
  props.table(-11, -61, '#ffffff', '#d8a830');
  signs.add('CIVIC CAFÉ', -15.2, 3.4, -58.4, 2.0, Math.PI, { bg: '#d8a830', fg: '#2a2238' });
  // Vault room (west, under the mezzanine).
  props.wall(-18, -71.5, -11, -71.5, MEZZ, '#a8a0b8', 0.5);
  props.wall(-18, -63.5, -11, -63.5, MEZZ, '#a8a0b8', 0.5);
  props.wall(-11, -71.5, -11, -69, MEZZ, '#a8a0b8', 0.5);
  props.wall(-11, -65.3, -11, -63.5, MEZZ, '#a8a0b8', 0.5);
  ctx.add(new Door('vault', 'cityhall', V(-11, 0, -67.15), 3.7, 2.4, 'z', { type: 'decree', hint: 'BY MAYORAL DECREE ONLY. There is no keyhole. Just a very official seal.' }, 'decree', 'City Vault', g));
  signs.add('CITY VAULT · BY DECREE ONLY', -10.7, 2.05, -67.15, 2.6, Math.PI / 2, { bg: '#c8243a', fg: '#ffe27a', shape: 'rect' });
  ctx.add(new CorePickup('cityhall', V(-15.5, 1.3, -67.5), g));
  for (let i = 0; i < 5; i += 1) w.block(-17.2, i * 0.32, -70.4 + i * 0.1, 0.9, 0.3, 0.6, '#f2c14e');
  col.box(-17.2, 0, -70.2, 1, 1.6, 0.8);
  ctx.bit(-14, 0.8, -70);
  ctx.bit(-16.5, 0.8, -64.6);

  // ---- stairs (east) blocked by a velvet rope until the permit is filed
  const steps = 8;
  for (let i = 0; i < steps; i += 1) {
    const z0 = -62.6 - i * 1.18;
    const top = ((i + 1) * MEZZ) / steps;
    w.block(14, 0, z0 - 0.59, 4, top, 1.18, i % 2 ? '#c8243a' : '#b8203a');
    col.box(14, 0, z0 - 0.59, 4, top, 1.18);
  }
  ctx.add(new Door('rope', 'cityhall', V(14, 0, -61.9), 4, 2.6, 'x', { type: 'flag', test: (gg) => gg.progress.flag('permitOk'), hint: 'Permit holders only. Receptionist Doris checks the paperwork.' }, 'rope', 'Velvet Rope', g));
  signs.add('UPSTAIRS: PERMIT HOLDERS ONLY', 14, 1.6, -61.6, 2.4, 0, { bg: '#2a2238', fg: '#f2c14e', shape: 'rect' });
  // Stair side rails.
  w.block(11.9, 0, -67.3, 0.2, 3.4, 9.4, '#d8a830');
  col.box(11.9, 0, -67.3, 0.2, 3.6, 9.4);

  // ---- mezzanine
  w.block(0, MEZZ - 0.25, -78, 35.4, 0.25, 12, '#d8c8a8');
  col.addStatic({ minX: -18, maxX: 18, minY: MEZZ - 0.25, maxY: MEZZ, minZ: -84, maxZ: -72, enabled: true, pass: 'none' });
  for (let x = -17; x <= 11; x += 1.4) w.block(x, MEZZ, -72.1, 0.1, 1.0, 0.1, '#d8a830');
  w.block(-3, MEZZ + 1.0, -72.1, 28, 0.12, 0.16, '#d8a830');
  col.addStatic({ minX: -18, maxX: 11.8, minY: MEZZ, maxY: MEZZ + 1.4, minZ: -72.3, maxZ: -71.9, enabled: true, pass: 'none' });
  for (const x of [-12, -4, 4]) props.pillar(x, -72.6, MEZZ - 0.25, '#fbf7ee', 0.3);
  // Mayor's office walls (on the mezzanine).
  const office = (x0: number, z0: number, x1: number, z1: number) => {
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const wd = Math.abs(x1 - x0) || 0.4;
    const dd = Math.abs(z1 - z0) || 0.4;
    w.block(cx, MEZZ, cz, wd, 3.2, dd, '#2d3a6b');
    w.block(cx, MEZZ + 3.2, cz, wd + 0.1, 0.15, dd + 0.1, trim);
    col.addStatic({ minX: cx - wd / 2, maxX: cx + wd / 2, minY: MEZZ, maxY: MEZZ + 3.4, minZ: cz - dd / 2, maxZ: cz + dd / 2, enabled: true, pass: 'none', camera: true });
  };
  office(-6, -75, -1.3, -75);
  office(1.3, -75, 6, -75);
  office(-6, -84, -6, -75);
  office(6, -84, 6, -75);
  signs.add("MAYOR'S OFFICE", 0, MEZZ + 2.75, -74.75, 2.4, 0, { bg: '#d8a830', fg: '#2a2238', border: '#2a2238' });
  w.block(0, MEZZ, -81.5, 3.2, 0.95, 1.2, '#7d5130');
  col.addStatic({ minX: -1.6, maxX: 1.6, minY: MEZZ, maxY: MEZZ + 1, minZ: -82.1, maxZ: -80.9, enabled: true, pass: 'none' });
  k.glow.box(0, MEZZ + 2.2, -83.6, 2.4, 1.6, 0.05, '#ffe7a8');
  ctx.add(new Postcard('pc-cityhall-office', 'cityhall', V(4.2, MEZZ + 0.9, -82.6), 'Mayor\'s Memo', '"Note to self: find the scissors BEFORE the ribbon ceremony. Note to self 2: what is a scissors." — M.B.', g));
  ctx.bit(-4, MEZZ + 0.8, -82);
  ctx.bit(-14, MEZZ + 0.8, -78);
  ctx.bit(14, MEZZ + 0.8, -80);
  // Mezzanine bookshelf + banners.
  w.block(-14, MEZZ, -83.4, 6, 2.6, 0.6, '#7d5130');
  for (const x of [-12, 12]) {
    w.block(x, 3.8, -83.6, 2.4, 3.2, 0.06, '#c8243a');
    w.block(x, 3.8, -83.55, 0.6, 0.6, 0.04, '#f2c14e');
  }

  // ---- NPCs
  const S = ctx.spawns;
  S.push({ id: 'mayor', type: 'host', host: 'mayor', area: 'cityhall', x: 0, y: MEZZ, z: -79, yaw: 0, mode: 'wander', radius: 2, personality: 'snooty' });
  S.push({ id: 'doris', type: 'named', named: 'doris', area: 'cityhall', x: 6, z: -65.5, yaw: 0, mode: 'idle', personality: 'snooty', talk: 'doris', busy: true });
  S.push({
    id: 'tank',
    type: 'named',
    named: 'tank',
    area: 'cityhall',
    x: 0,
    y: MEZZ,
    z: -73.9,
    yaw: 0,
    mode: 'post',
    personality: 'guard',
    guard: {
      blocker: [0, -74.7, 2.8, 0.9],
      weak: ['feed', 'scare'],
      dish: 'souffle',
      movedFlag: 'tankFed',
      moveTo: [-8, -78],
      afterMoveMode: 'eat',
      strict: true,
      refuse: { block: 'The Mayor is in a meeting. With himself. Do not disturb.', intimidate: 'I outrank the whole police force, officer.', distract: 'Tank does not laugh.', lure: 'Tank does not hum along.' },
    },
  });
  for (let i = 0; i < 4; i += 1) {
    S.push({ id: `press${i}`, type: 'civilian', civ: i === 3 ? 'commuter' : 'tourist', area: 'cityhall', x: -2.5 + i * 1.6, z: -51.2 + (i % 2) * 0.6, yaw: Math.PI, mode: 'idle', personality: i % 2 ? 'nervous' : 'cheerful', pocket: i === 1 ? { postcard: 'pc-cityhall-press', label: 'a press badge' } : undefined });
  }
  g.registerPostcard('pc-cityhall-press', 'cityhall', 'Front Page', '"HEADLINE DRAFT: MAYOR DECLARES HOLIDAY, FORGETS WHY. Sub-headline: Town Cheers Anyway."');
  S.push({ id: 'ch-c1', type: 'civilian', civ: 'elder', area: 'cityhall', x: -7.4, z: -45, yaw: Math.PI / 2, mode: 'sit', personality: 'grumpy' });
  S.push({ id: 'ch-c2', type: 'civilian', civ: 'kid', area: 'cityhall', x: 8, z: -40, mode: 'wander', radius: 4, personality: 'kid' });
  S.push({ id: 'ch-c3', type: 'civilian', civ: 'commuter', area: 'cityhall', x: -4, z: -66, mode: 'wander', radius: 3, personality: 'nervous' });

  // ---- star bits
  for (const [x, y, z] of [[0, 0.8, -36], [-12, 0.8, -45], [12, 0.8, -45], [0, 0.8, -66], [14, 2.0, -66]]) ctx.bit(x, y, z);
}
