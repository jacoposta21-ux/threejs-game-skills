import * as THREE from 'three';
import type { AreaCtx } from '../World';
import { CorePickup, Door, Lasers, Lever, Machine, Phaseable, Postcard, Vent } from '../../gameplay/Objects';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Museum of Peculiar History: power, a haunted archive, and a laser heist. */
export function buildMuseum(ctx: AreaCtx): void {
  const { k, props, col, signs, g } = ctx;
  const w = k.world;
  const stone = '#e8dcc8';
  const trim = '#3bb3a8';
  const H = 5.5;
  // ---- outer shell
  props.wall(-62, -20, -28, -20, H, stone, 0.6, trim);
  props.wall(-62, -58, -28, -58, H, stone, 0.6, trim);
  props.wall(-62, -58, -62, -20, H, stone, 0.6, trim);
  props.wall(-28, -58, -28, -30.4, H, stone, 0.6, trim);
  props.wall(-28, -25.4, -28, -20, H, stone, 0.6, trim);
  // Classical portico on the entrance side.
  for (const z of [-31.4, -24.4]) props.pillar(-27.2, z, 5, '#fbf7ee', 0.4);
  w.add(new THREE.ConeGeometry(4.8, 1.6, 3), '#fbf7ee', { x: -27.4, y: 6.2, z: -27.9, rx: Math.PI / 2, ry: Math.PI / 2, sz: 0.25 });
  signs.add('MUSEUM OF PECULIAR HISTORY', -26.9, 5.0, -27.9, 4.6, Math.PI / 2, { bg: '#3bb3a8', fg: '#ffffff', border: '#2a2238', sub: 'Please do not haunt the exhibits' });

  // ---- interior walls
  // Lobby / hall divider with the power door.
  props.wall(-42, -36, -37, -36, H, stone, 0.5, trim);
  props.wall(-33, -36, -28, -36, H, stone, 0.5, trim);
  ctx.add(new Door('powerdoor', 'museum', V(-35, 0, -36), 4, 3.6, 'x', { type: 'flag', test: (gg) => gg.progress.flag('power'), hint: 'Automatic doors. No power, no doors.' }, 'power', 'East Wing', g));
  signs.add('HALL OF ARMOUR', -35, 4.3, -35.7, 2.6, 0, { bg: '#2a2238', fg: '#ffe27a' });
  // Column wall x = -42.
  props.wall(-42, -58, -42, -55, H, stone, 0.5, trim);
  ctx.add(new Phaseable('bars-archive', 'museum', V(-42, 0, -52.5), 0.3, 4.2, 5, 'bars', g));
  w.block(-42, 4.2, -52.5, 0.5, H - 4.2, 5, stone);
  props.wall(-42, -50, -42, -46, H, stone, 0.5, trim);
  ctx.add(new Door('vault-corridor', 'museum', V(-42, 0, -44), 4, 3.6, 'z', { type: 'flag', test: (gg) => gg.progress.flag('archiveLever'), hint: 'A vault door. The lever must be somewhere in the sealed archive.' }, 'vault', 'Vault Corridor', g));
  w.block(-42, 3.6, -44, 0.5, H - 3.6, 4, stone);
  props.wall(-42, -42, -42, -34, H, stone, 0.5, trim);
  ctx.add(new Door('secoffice', 'museum', V(-42, 0, -32.8), 2.4, 2.8, 'z', { type: 'pick', hint: 'SECURITY. Locked. A professional could pick it... or maybe something tiny could get in another way.' }, 'slide', 'Security Office', g, [-47, -33]));
  w.block(-42, 2.8, -32.8, 0.5, H - 2.8, 2.4, stone);
  signs.add('SECURITY', -41.7, 3.4, -32.8, 1.6, Math.PI / 2, { bg: '#e2473f', fg: '#ffffff' });
  props.wall(-42, -31.6, -42, -26, H, stone, 0.5, trim);
  props.wall(-42, -23, -42, -20, H, stone, 0.5, trim);
  signs.add('UTILITY', -41.7, 3.2, -24.5, 1.4, Math.PI / 2, { bg: '#ffe27a', fg: '#2a2238' });
  // Column B dividers.
  props.wall(-52, -48, -47.45, -48, H, stone, 0.5, trim);
  props.wall(-46.55, -48, -42, -48, H, stone, 0.5, trim);
  // Glim-sized escape hatch so nobody gets stranded in the sealed archive.
  ctx.add(new Vent('vent-archive', 'museum', V(-47, 0, -48), 'x', g));
  w.block(-47, 0.75, -48, 0.9, H - 0.75, 0.5, stone);
  col.box(-47, 0.75, -48, 0.9, H - 0.75, 0.5);
  props.wall(-52, -40, -42, -40, H, stone, 0.5, trim);
  props.wall(-52, -30, -42, -30, H, stone, 0.5, trim);
  // Wall x = -52.
  props.wall(-52, -58, -52, -46, H, stone, 0.5, trim);
  props.wall(-52, -42, -52, -35.45, H, stone, 0.5, trim);
  ctx.add(new Vent('vent-security', 'museum', V(-52, 0, -35), 'z', g));
  w.block(-52, 0.75, -35, 0.5, H - 0.75, 0.9, stone);
  col.box(-52, 0.75, -35, 0.5, H - 0.75, 0.9);
  props.wall(-52, -34.55, -52, -27, H, stone, 0.5, trim);
  props.wall(-52, -23, -52, -20, H, stone, 0.5, trim);
  props.wall(-62, -40, -52, -40, H, stone, 0.5, trim);

  // ---- lobby
  w.block(-31.5, 0, -32, 3.2, 1.1, 1.2, '#3bb3a8');
  w.block(-31.5, 1.1, -32, 3.4, 0.1, 1.4, '#fbf7ee');
  col.box(-31.5, 0, -32, 3.2, 1.2, 1.2);
  signs.add('INFORMATION', -31.5, 0.8, -31.38, 1.8, 0, { bg: '#fbf7ee', fg: '#3bb3a8' });
  for (const [x, z] of [[-30, -22], [-40, -22], [-40, -34]]) props.planter(x, z, '#3bb3a8');
  signs.add('NEW! THE FIZZWICK METEORITE', -35, 3.6, -20.35, 3.8, Math.PI, { bg: '#2a2238', fg: '#ffe27a', border: '#3bb3a8', sub: 'Fell from the sky last Tuesday (allegedly)' });
  signs.add('CLOSED: POWER OUTAGE', -35, 2.2, -35.7, 2.2, 0, { bg: '#e2473f', fg: '#ffffff', shape: 'rect' });
  props.bench(-35, -29, 0, '#7d5130');
  // Pedestal exhibits.
  const exhibit = (x: number, z: number, label: string, color: string) => {
    w.cyl(x, 0, z, 0.5, 0.6, 1.1, '#fbf7ee', 10);
    w.add(new THREE.DodecahedronGeometry(0.35, 0), color, { x, y: 1.5, z });
    col.box(x, 0, z, 1.1, 1.2, 1.1);
    signs.add(label, x, 0.6, z + 0.62, 1.0, 0, { bg: '#2a2238', fg: '#ffffff', shape: 'rect' });
  };
  exhibit(-38, -26, 'A Very Old Potato', '#c8955a');
  exhibit(-32, -26, 'Cursed Teaspoon', '#d0d0d8');

  // ---- utility room
  ctx.add(new Machine('generator', 'museum', V(-47, 0, -26.4), 0, { flag: 'power', label: 'generator', look: 'generator' }, g));
  col.box(-47, 0, -26.4, 1.6, 1.4, 1.1);
  for (let i = 0; i < 3; i += 1) k.metal.add(new THREE.CylinderGeometry(0.08, 0.08, 9, 6), '#8a8fa8', { x: -50 + i * 0.3, y: 4.2, z: -25, rz: Math.PI / 2, ry: Math.PI / 2 });
  props.crateDecor(-50.6, -21.4, 0.9, '#8a8fa8');

  // ---- security office (Otto sleeps; laser panel)
  ctx.add(new Machine('laserpanel', 'museum', V(-51.2, 0, -37.4), Math.PI / 2, { flag: 'lasersOff', label: 'laser panel', look: 'panel', needs: { flag: 'power', msg: 'The panel is dead. Restore the museum power first.' } }, g));
  col.box(-51.2, 0, -37.4, 0.6, 1.9, 1.4);
  w.block(-46.5, 0, -38.5, 2.4, 0.8, 1.0, '#7d5130');
  col.box(-46.5, 0, -38.5, 2.4, 0.8, 1.0);
  for (let i = 0; i < 3; i += 1) k.glow.box(-45.6 - i * 0.8, 1.2, -39.4, 0.7, 0.5, 0.04, i === 1 ? '#ff6f80' : '#9ff0cf');
  signs.add('CAMERAS: ALL QUIET', -46.4, 1.75, -39.38, 2.2, 0, { bg: '#1a1426', fg: '#9ff0cf', shape: 'rect' });

  // ---- hall of armour
  for (let i = 0; i < 4; i += 1) {
    for (const x of [-40.5, -29.5]) {
      const z = -54 + i * 4.4;
      w.cyl(x, 0, z, 0.5, 0.5, 0.25, '#5a5f78', 8);
      k.metal.cyl(x, 0.25, z, 0.12, 0.14, 0.8, '#c0c4d0', 6);
      k.metal.cyl(x, 1.05, z, 0.32, 0.26, 0.7, '#c0c4d0', 8);
      k.metal.sphere(x, 2.0, z, 0.24, '#c0c4d0', 8, 6);
      w.cone(x, 2.2, z, 0.05, 0.4, '#e2473f', 4);
      col.box(x, 0, z, 1, 2.2, 1);
    }
  }
  for (const [z, c] of [[-56, '#7d4fc9'], [-50, '#3bb3a8'], [-44, '#e2473f']] as [number, string][]) {
    w.block(-28.35, 1.8, z, 0.1, 1.8, 1.4, '#f2c14e');
    w.block(-28.42, 1.8, z, 0.06, 1.5, 1.1, c);
  }
  signs.add('PORTRAIT OF LADY MOPEWELL (1803)', -28.4, 0.9, -50, 2.2, -Math.PI / 2, { bg: '#2a2238', fg: '#ffe27a', shape: 'rect' });

  // ---- archive (ghost only)
  for (let i = 0; i < 3; i += 1) {
    w.block(-50.8, 0, -56.8 + i * 2.6, 1.0, 3.2, 1.8, '#7d5130');
    for (let r = 0; r < 4; r += 1) w.block(-50.3, 0.4 + r * 0.75, -56.8 + i * 2.6, 0.06, 0.55, 1.6, ['#e2473f', '#4a8fe0', '#ffe27a', '#4fb06a'][(i + r) % 4]);
    col.box(-50.8, 0, -56.8 + i * 2.6, 1.0, 3.2, 1.8);
  }
  ctx.add(new Lever('lever-archive', 'museum', V(-46.5, 0, -57), 0, 'archiveLever', 'vault lever', g));
  ctx.add(new Postcard('pc-museum-archive', 'museum', V(-44, 0.9, -49.2), 'Ghostly Gossip', '"Lady Mopewell says the armour in the east wing gossips at night. Mostly about helmets. — Glim"', g));

  // ---- meteor room
  ctx.add(new Phaseable('case-meteor', 'museum', V(-58, 0, -50), 1.6, 2.5, 1.6, 'case', g));
  ctx.add(new CorePickup('museum', V(-58, 1.65, -50), g, ['ghost']));
  ctx.add(
    new Lasers(
      'lasers',
      'museum',
      [
        [-60.4, -47.6, -55.6, -47.6],
        [-60.4, -52.4, -55.6, -52.4],
        [-60.4, -47.6, -60.4, -52.4],
        [-55.6, -47.6, -55.6, -52.4],
      ],
      'lasersOff',
      g,
    ),
  );
  signs.add('THE FIZZWICK METEORITE', -58, 2.9, -47.1, 2.6, 0, { bg: '#2a2238', fg: '#ffe27a', border: '#ff2a55', sub: 'Do not touch. Do not breathe on.' });
  w.block(-61.6, 1.5, -44, 0.2, 2.2, 3, '#1a1426');
  for (let i = 0; i < 18; i += 1) k.glow.sphere(-61.45, 0.7 + (i % 6) * 0.38, -45.4 + Math.floor(i / 6) * 1.2, 0.05, '#fff4b0', 4, 3);

  // ---- dinosaur gallery (landmark skeleton)
  const bone = '#f4ecd8';
  const dx = -57;
  const dz = -30;
  for (let i = 0; i < 9; i += 1) {
    const t = i / 8;
    w.sphere(dx - 3 + t * 6, 2.6 + Math.sin(t * Math.PI) * 0.8, dz, 0.28 - t * 0.08, bone, 6, 5);
    w.add(new THREE.TorusGeometry(0.55 - t * 0.2, 0.06, 4, 10, Math.PI), bone, { x: dx - 3 + t * 6, y: 2.4 + Math.sin(t * Math.PI) * 0.8, z: dz, ry: Math.PI / 2, rz: Math.PI });
  }
  w.add(new THREE.ConeGeometry(0.5, 1.4, 6), bone, { x: dx + 3.8, y: 3.3, z: dz, rz: -1.2 });
  w.sphere(dx + 4.5, 3.6, dz, 0.45, bone, 8, 6, { sx: 1.4 });
  for (const lx of [-2, 1.5]) for (const s of [-1, 1]) w.add(new THREE.CylinderGeometry(0.08, 0.1, 2.4, 5), bone, { x: dx + lx, y: 1.2, z: dz + s * 0.5, rz: 0.15 });
  w.add(new THREE.CylinderGeometry(0.04, 0.12, 3.5, 5), bone, { x: dx - 4.8, y: 2.0, z: dz, rz: 1.1 });
  w.block(dx, 0, dz, 10, 0.3, 3, '#5a5f78');
  col.box(dx, 0, dz, 10, 2.6, 3);
  signs.add('DINOSAURUS PROBABLY', dx, 0.65, dz + 1.52, 2.2, 0, { bg: '#2a2238', fg: '#ffffff', shape: 'rect' });

  // ---- NPCs
  const S = ctx.spawns;
  S.push({ id: 'volta', type: 'host', host: 'scientist', area: 'museum', x: -35, z: -24.5, yaw: 0, mode: 'wander', radius: 3, personality: 'cheerful' });
  S.push({ id: 'mopewell', type: 'host', host: 'ghost', area: 'museum', x: -35, z: -47, yaw: 0, mode: 'wander', radius: 4, personality: 'sleepy' });
  S.push({ id: 'orla', type: 'named', named: 'orla', area: 'museum', x: -31.5, z: -33.3, yaw: 0, mode: 'idle', personality: 'snooty', talk: 'orla', busy: true });
  S.push({ id: 'otto', type: 'named', named: 'otto', area: 'museum', x: -46.5, z: -37.2, yaw: Math.PI, mode: 'sleep', personality: 'sleepy', talk: 'otto', busy: true, pocket: { postcard: 'pc-museum-otto', label: 'his notebook' } });
  g.registerPostcard('pc-museum-otto', 'museum', 'Night Shift Notes', '"Night 1: heard humming. Night 2: humming again. Night 3: the armour asked me for the time. Requesting day shift."');
  S.push({ id: 'mus-v1', type: 'civilian', civ: 'tourist', area: 'museum', x: -36, z: -30, mode: 'wander', radius: 4, personality: 'cheerful' });
  S.push({ id: 'mus-v2', type: 'civilian', civ: 'artsy', area: 'museum', x: -56, z: -25, mode: 'wander', radius: 3, personality: 'snooty' });
  S.push({ id: 'mus-v3', type: 'civilian', civ: 'kid', area: 'museum', x: -54, z: -34, mode: 'wander', radius: 2.5, personality: 'kid' });
  S.push({ id: 'mus-v4', type: 'civilian', civ: 'elder', area: 'museum', x: -35, z: -50, mode: 'wander', radius: 3, personality: 'nervous' });

  // ---- star bits
  for (const [x, y, z] of [[-35, 0.8, -22], [-30, 0.8, -28], [-47, 0.8, -22], [-60, 0.8, -26], [-48, 0.8, -33], [-35, 0.8, -40], [-35, 0.8, -56], [-47, 0.8, -44], [-46, 0.8, -52], [-58, 0.8, -56]]) ctx.bit(x, y, z);
}
