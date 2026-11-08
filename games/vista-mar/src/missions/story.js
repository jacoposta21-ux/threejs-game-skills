// Story missions 03-08: Victor Kane's grip on Vista Mar. Built on the
// MissionManager step contract; text comes from the i18n table.
import { S } from '../i18n/strings.js';
import { aiDrive } from './AIDrive.js';
import { DROP_PORT, GARAGE } from './missions.js';

const near = (a, b, r) => Math.hypot(a.x - b.x, a.z - b.z) < r;
const alive = (list) => list.filter((n) => n && n.active && n.state !== 'DOWN');

/** Nearest point around (x,z) where a body or car fits. */
function freeSpot(g, x, z, r = 0.7) {
  for (let k = 0; k < 60; k++) {
    const a = k * 2.4, d = k * 0.8;
    const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    if (!g.collision.blockedCircle(px, pz, r)) return { x: px, z: pz };
  }
  return { x, z };
}

function spawnGroup(ctx, kind, center, n, radius, opts) {
  const g = ctx.game, out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
    const p = freeSpot(g, center.x + Math.cos(a) * radius * (0.5 + Math.random() * 0.5), center.z + Math.sin(a) * radius * (0.5 + Math.random() * 0.5));
    const npc = g.npcs.spawnCombatant(kind, p.x, p.z, { mission: true, heading: Math.random() * 6.28, guard: { x: p.x, z: p.z }, ...opts });
    if (npc) out.push(npc);
  }
  (ctx.data.npcs = ctx.data.npcs || []).push(...out);
  return out;
}

function vehicle(ctx, type, x, z, h) {
  const g = ctx.game;
  const p = freeSpot(g, x, z, 2.2);
  const v = g.vehicles.spawnMissionVehicle(type, p.x, p.z, h);
  v.mission = true;
  (ctx.data.vehicles = ctx.data.vehicles || []).push(v);
  return v;
}

function cleanupCommon(ctx) {
  const g = ctx.game;
  for (const n of ctx.data.npcs || []) if (n.active && n.state !== 'DOWN') g.npcs.despawn(n);
  for (const v of ctx.data.vehicles || []) {
    v.aiDriven = false; v.mission = false;
    if (g.player.vehicle !== v && !ctx.data.keep?.includes(v)) g.vehicles.removeMission(v);
  }
}

const STARLITE = { x: 291, z: -150 };
const DANA = { x: 291, z: 40 };
const YARD = { x: -250, z: -250 };
const VILLA = { x: -250, z: 150 };
const BEACH_LZ = { x: 440, z: -180 };

export const STORY = [
  {
    id: 'm03', letter: 'R', requires: 'm02', title: S.m03.title, giver: S.m03.giver,
    start: { x: 291, z: -20 }, npc: { key: 'npc_m_casual2', heading: Math.PI / 2 }, reward: 2500,
    intro: S.m03.intro,
    steps: [
      { text: S.m03.go, update: (ctx) => (near(ctx.game.player.pos, STARLITE, 22) ? 'next' : undefined), target: () => ({ ...STARLITE, r: 10 }) },
      {
        text: (ctx) => S.m03.fight(alive(ctx.data.thugs).length),
        enter(ctx) { ctx.data.thugs = spawnGroup(ctx, 'thug', STARLITE, 3, 6, { weapon: 'fists', health: 80, alerted: true }); },
        update: (ctx) => (alive(ctx.data.thugs).length === 0 ? 'next' : undefined),
        target: (ctx) => { const t = alive(ctx.data.thugs)[0]; return t ? { x: t.pos.x, z: t.pos.z, r: 2 } : null; },
      },
    ],
    onPass(ctx) { ctx.game.hud.toast(...S.m03.pass); },
    cleanup: cleanupCommon,
  },
  {
    id: 'm04', letter: 'D', requires: 'm03', title: S.m04.title, giver: S.m04.giver,
    start: DANA, npc: { key: 'npc_w_formal', heading: -Math.PI / 2 }, reward: 4000,
    intro: S.m04.intro,
    steps: [
      {
        text: S.m04.car,
        enter(ctx) { ctx.data.car = vehicle(ctx, 'sedan', 296.5, 30, Math.PI); ctx.data.keep = [ctx.data.car]; },
        update: (ctx) => (ctx.game.player.vehicle === ctx.data.car ? 'next' : ctx.data.car.wrecked ? { fail: 'The car was wrecked.' } : undefined),
        target: (ctx) => ({ x: ctx.data.car.pos.x, z: ctx.data.car.pos.z, vehicle: ctx.data.car }),
      },
      {
        text: (ctx) => S.m04.tail(Math.round(ctx.data.dist || 0)),
        enter(ctx) {
          const v = vehicle(ctx, 'sedan', 303, -60, Math.PI);
          v.aiDriven = true;
          v.respray();
          ctx.data.courier = v; ctx.data.drive = {}; ctx.data.close = 0; ctx.data.far = 0;
        },
        update(ctx, dt) {
          const g = ctx.game, v = ctx.data.courier;
          if (v.wrecked) return 'next';
          const d = aiDrive(v, DROP_PORT, 13, dt, ctx.data.drive);
          const pd = Math.hypot(g.player.pos.x - v.pos.x, g.player.pos.z - v.pos.z);
          ctx.data.dist = pd;
          ctx.data.close = pd < 15 ? ctx.data.close + dt : Math.max(0, ctx.data.close - dt * 0.5);
          ctx.data.far = pd > 90 ? ctx.data.far + dt : 0;
          if (ctx.data.close > 3.5) return { fail: S.m04.tooClose };
          if (ctx.data.far > 6) return { fail: S.m04.lost };
          if (d < 8 && Math.abs(v.speed) < 1) return 'next';
          return undefined;
        },
        target: (ctx) => ({ x: ctx.data.courier.pos.x, z: ctx.data.courier.pos.z, vehicle: ctx.data.courier }),
      },
      {
        text: S.m04.grab,
        enter(ctx) {
          const g = ctx.game, v = ctx.data.courier;
          v.aiDriven = false;
          const door = v.doorPoint(1);
          const c = g.npcs.spawnCombatant('guard', door.x, door.z, { mission: true, weapon: 'fists', health: 60, alerted: true });
          ctx.data.npcs = (ctx.data.npcs || []).concat(c ? [c] : []);
          ctx.data.man = c;
        },
        update(ctx) {
          const m = ctx.data.man;
          if (!m || m.state === 'DOWN') { ctx.data.case = m ? { x: m.pos.x, z: m.pos.z } : { x: ctx.data.courier.pos.x, z: ctx.data.courier.pos.z }; return 'next'; }
          return undefined;
        },
        target: (ctx) => (ctx.data.man ? { x: ctx.data.man.pos.x, z: ctx.data.man.pos.z, r: 2 } : null),
      },
      {
        text: S.m04.pick,
        update: (ctx) => (!ctx.game.player.vehicle && near(ctx.game.player.pos, ctx.data.case, 1.6) ? 'next' : undefined),
        exit(ctx) { ctx.game.audio.pickup(); },
        target: (ctx) => ({ ...ctx.data.case, r: 1.5 }),
      },
      { text: S.m04.back, update: (ctx) => (near(ctx.game.player.pos, DANA, 4) ? 'next' : undefined), target: () => ({ ...DANA, r: 3 }) },
    ],
    onPass(ctx) { ctx.game.hud.toast(...S.m04.pass); },
    cleanup: cleanupCommon,
  },
  {
    id: 'm05', letter: 'D', requires: 'm04', title: S.m05.title, giver: S.m05.giver,
    start: { x: 291, z: 46 }, npc: { key: 'npc_w_formal', heading: -Math.PI / 2 }, reward: 6000,
    intro: S.m05.intro,
    onStart(ctx) { const c = ctx.game.combat; if (!c.inv.pistol) c.give('pistol', 36); else c.addAmmo('pistol', 24); c.select('pistol'); },
    steps: [
      { text: S.m05.go, update: (ctx) => (near(ctx.game.player.pos, YARD, 60) ? 'next' : undefined), target: () => ({ ...YARD, r: 12 }) },
      {
        text: (ctx) => S.m05.fight(alive(ctx.data.guards).length),
        enter(ctx) {
          ctx.data.guards = spawnGroup(ctx, 'guard', YARD, 5, 22, { weapon: 'pistol', health: 90, accuracy: 0.34, damage: 7, aggro: 30 });
          ctx.data.van = vehicle(ctx, 'delivery', YARD.x + 15, YARD.z + 30, 0);
          ctx.data.keep = [ctx.data.van];
        },
        update: (ctx) => (ctx.data.van.wrecked ? { fail: 'The shipment van was destroyed.' } : alive(ctx.data.guards).length === 0 ? 'next' : undefined),
        target: (ctx) => { const t = alive(ctx.data.guards)[0]; return t ? { x: t.pos.x, z: t.pos.z, r: 2 } : null; },
      },
      {
        text: S.m05.van,
        update: (ctx) => (ctx.data.van.wrecked ? { fail: 'The shipment van was destroyed.' } : ctx.game.player.vehicle === ctx.data.van ? 'next' : undefined),
        target: (ctx) => ({ x: ctx.data.van.pos.x, z: ctx.data.van.pos.z, vehicle: ctx.data.van }),
      },
      {
        text: (ctx) => S.m05.deliver(Math.round(ctx.data.van.health)),
        timer: 180,
        update(ctx) {
          const g = ctx.game, v = ctx.data.van;
          if (v.wrecked) return { fail: 'The shipment van was destroyed.' };
          if (g.player.vehicle === v && near(v.pos, GARAGE, 7) && Math.abs(v.speed) < 2) return 'next';
          return undefined;
        },
        target: () => ({ ...GARAGE, r: 7 }),
      },
    ],
    onPass(ctx) { ctx.game.hud.toast(...S.m05.pass); },
    cleanup: cleanupCommon,
  },
  {
    id: 'm06', letter: 'H', requires: 'm05', title: S.m06.title, giver: S.m06.giver,
    start: { x: 109.5, z: -50 }, npc: { key: 'cop', heading: 0 }, reward: 5000,
    intro: S.m06.intro,
    steps: [
      {
        text: (ctx) => S.m06.task(ctx.data.vans.filter((v) => !v.wrecked).length),
        timer: 420,
        timeoutText: S.m06.timeout,
        enter(ctx) {
          ctx.data.vans = [vehicle(ctx, 'delivery', -95, 250, 0), vehicle(ctx, 'delivery', 205, -250, Math.PI), vehicle(ctx, 'delivery', 396, 180, 0)];
          for (const v of ctx.data.vans) { v.health = 70; v.paintDark = true; for (const m of v.materials) m.color.setRGB(0.35, 0.35, 0.38); }
        },
        update: (ctx) => (ctx.data.vans.every((v) => v.wrecked) ? 'next' : undefined),
        target(ctx) {
          const p = ctx.game.player.pos;
          const left = ctx.data.vans.filter((v) => !v.wrecked).sort((a, b) => Math.hypot(a.pos.x - p.x, a.pos.z - p.z) - Math.hypot(b.pos.x - p.x, b.pos.z - p.z));
          return left[0] ? { x: left[0].pos.x, z: left[0].pos.z, vehicle: left[0] } : null;
        },
      },
    ],
    onPass(ctx) { ctx.game.hud.toast(...S.m06.pass); ctx.data.keep = ctx.data.vans; },
    cleanup(ctx) {
      // wrecks stay where they burned
      for (const v of ctx.data.vans || []) v.mission = false;
      ctx.data.keep = ctx.data.vans;
      cleanupCommon(ctx);
    },
  },
  {
    id: 'm07', letter: 'R', requires: 'm06', title: S.m07.title, giver: S.m07.giver,
    start: { x: 410.5, z: -64 }, npc: { key: 'npc_m_casual2', heading: -Math.PI / 2 }, reward: 8000,
    intro: S.m07.intro,
    steps: [
      { text: S.m07.go, update: (ctx) => (near(ctx.game.player.pos, { x: 100, z: -540 }, 70) ? 'next' : undefined), target: () => ({ x: 60, z: -470, r: 10 }) },
      {
        text: S.m07.steal,
        enter(ctx) {
          ctx.data.heli = vehicle(ctx, 'heli', 100, -550, Math.PI);
          ctx.data.keep = [ctx.data.heli];
          spawnGroup(ctx, 'guard', { x: 100, z: -538 }, 3, 8, { weapon: 'pistol', health: 80, accuracy: 0.3, aggro: 28 });
        },
        update: (ctx) => (ctx.data.heli.wrecked ? { fail: S.m07.lostHeli } : ctx.game.player.vehicle === ctx.data.heli ? 'next' : undefined),
        target: (ctx) => ({ x: ctx.data.heli.pos.x, z: ctx.data.heli.pos.z, vehicle: ctx.data.heli }),
      },
      {
        text: S.m07.land,
        update(ctx) {
          const h = ctx.data.heli, g = ctx.game;
          if (h.wrecked) return { fail: S.m07.lostHeli };
          if (g.player.vehicle === h && near(h.pos, BEACH_LZ, 15) && h.altitude < 0.6 && h.kmh < 10) return 'next';
          return undefined;
        },
        target: () => ({ ...BEACH_LZ, r: 12 }),
      },
    ],
    onPass(ctx) { ctx.game.hud.toast(...S.m07.pass); },
    cleanup: cleanupCommon,
  },
  {
    id: 'm08', letter: 'D', requires: 'm07', title: S.m08.title, giver: S.m08.giver,
    start: { x: 64, z: -15.6 }, npc: { key: 'npc_w_formal', heading: 0 }, reward: 25000,
    intro: S.m08.intro,
    steps: [
      { text: S.m08.go, update: (ctx) => (near(ctx.game.player.pos, VILLA, 55) ? 'next' : undefined), target: () => ({ ...VILLA, r: 12 }) },
      {
        text: (ctx) => S.m08.fight(alive(ctx.data.guards).length),
        enter(ctx) {
          ctx.data.guards = [
            ...spawnGroup(ctx, 'guard', VILLA, 4, 24, { weapon: 'pistol', health: 100, accuracy: 0.36, damage: 8, aggro: 32 }),
            ...spawnGroup(ctx, 'guard', VILLA, 2, 14, { weapon: 'smg', health: 110, accuracy: 0.3, damage: 5, aggro: 32 }),
          ];
          ctx.game.combat.armor = Math.max(ctx.game.combat.armor, 50);
        },
        update: (ctx) => (alive(ctx.data.guards).length === 0 ? 'next' : undefined),
        target: (ctx) => { const t = alive(ctx.data.guards)[0]; return t ? { x: t.pos.x, z: t.pos.z, r: 2 } : null; },
      },
      {
        text: S.m08.chase,
        enter(ctx) {
          const v = vehicle(ctx, 'suv', VILLA.x, VILLA.z - 44, Math.PI);
          v.aiDriven = true;
          for (const m of v.materials) m.color.setRGB(0.18, 0.18, 0.2);
          ctx.data.kane = v; ctx.data.drive = {};
          ctx.game.hud.toast('DANA', '"That black SUV, it is Kane! Do not let him reach the port!"');
        },
        update(ctx, dt) {
          const v = ctx.data.kane;
          if (v.wrecked || v.health < 8) return 'next';
          const d = aiDrive(v, DROP_PORT, 20, dt, ctx.data.drive);
          if (d < 10) return { fail: S.m08.escaped };
          return undefined;
        },
        target: (ctx) => ({ x: ctx.data.kane.pos.x, z: ctx.data.kane.pos.z, vehicle: ctx.data.kane }),
      },
      {
        text: S.m08.finish,
        enter(ctx) {
          const g = ctx.game, v = ctx.data.kane;
          v.aiDriven = false; v.vel.set(0, 0);
          const door = v.doorPoint(1);
          const k = g.npcs.spawnCombatant('boss', door.x, door.z, { mission: true, weapon: 'pistol', health: 220, accuracy: 0.45, damage: 9, alerted: true, range: 9 });
          ctx.data.boss = k;
          if (k) ctx.data.npcs.push(k);
        },
        update: (ctx) => (!ctx.data.boss || ctx.data.boss.state === 'DOWN' ? 'next' : undefined),
        target: (ctx) => (ctx.data.boss ? { x: ctx.data.boss.pos.x, z: ctx.data.boss.pos.z, r: 2 } : null),
      },
    ],
    onPass(ctx) {
      const g = ctx.game;
      g.hud.toast(...S.m08.pass);
      setTimeout(() => g.hud.banner(S.m08.ending[0], S.m08.ending[1], 'passed'), 4500);
    },
    cleanup: cleanupCommon,
  },
];
