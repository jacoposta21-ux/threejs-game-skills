// Mission scripts. Each is data + small step functions on top of MissionManager.

const near = (a, b, r) => Math.hypot(a.x - b.x, a.z - b.z) < r;

export const DROP_PORT = { x: -195.5, z: -160 };
export const GARAGE = { x: -195.5, z: -40 }; // Spray & Go on Foundry Ave

export const MISSIONS = [
  {
    id: 'm01',
    letter: 'R',
    title: 'MISSION 01 — THE DELIVERY',
    giver: 'Rico Alvarez · Marisol Apartments',
    start: { x: 52, z: -15.6 },
    reward: 3000,
    steps: [
      {
        text: 'Get in the delivery van',
        say: ['RICO', '"Package for the docks. Van\'s right out front. Don\'t scratch it, the boss counts the dents."'],
        enter(ctx) {
          const g = ctx.game;
          const v = g.vehicles.spawnMissionVehicle('delivery', 74, -11.4, Math.PI / 2);
          v.mission = true;
          ctx.data.van = v;
        },
        update(ctx) {
          const v = ctx.data.van;
          if (!v || v.wrecked) return { fail: 'The van was destroyed.' };
          if (ctx.game.player.vehicle === v) return 'next';
          return undefined;
        },
        target: (ctx) => ctx.data.van && { x: ctx.data.van.pos.x, z: ctx.data.van.pos.z, vehicle: ctx.data.van },
      },
      {
        text: (ctx) => `Deliver the package to Port Industrial · cargo ${Math.round(ctx.data.van.health)}%`,
        say: ['RICO', '"Drop-off is the yard on Foundry Avenue, Port Industrial. Avoid traffic, keep it clean."'],
        timer: 150,
        timeoutText: 'Too slow. The buyer left.',
        enter(ctx) { ctx.data.leftTimer = 0; },
        update(ctx, dt) {
          const g = ctx.game, v = ctx.data.van;
          if (v.wrecked || v.health < 35) return { fail: 'The package was destroyed.' };
          if (g.player.vehicle !== v) {
            ctx.data.leftTimer += dt;
            if (ctx.data.leftTimer > 20 || Math.hypot(g.player.pos.x - v.pos.x, g.player.pos.z - v.pos.z) > 90) return { fail: 'You abandoned the van.' };
          } else ctx.data.leftTimer = 0;
          if (g.player.vehicle === v && near(v.pos, DROP_PORT, 7)) {
            if (g.police.level > 0) { ctx.data.copsWarn = true; return undefined; }
            if (Math.abs(v.speed) < 2) return 'next';
          }
          return undefined;
        },
        target: () => ({ ...DROP_PORT, r: 7 }),
      },
    ],
    bonus: (ctx) => Math.round((ctx.data.van ? ctx.data.van.health : 0) / 100 * 1000 / 50) * 50,
    onPass(ctx) {
      ctx.game.hud.toast('RICO', '"Clean work. Come see me on Ocean Drive, I have something faster for you."');
      ctx.data.van.mission = false;
    },
    cleanup(ctx) {
      const v = ctx.data.van;
      if (v && ctx.game.player.vehicle !== v && !v.wrecked) ctx.game.vehicles.removeMission(v);
      else if (v) v.mission = false;
    },
  },
  {
    id: 'm02',
    letter: 'R',
    requires: 'm01',
    title: 'MISSION 02 — JOYRIDE',
    giver: 'Rico Alvarez · Hotel Marisol, Ocean Drive',
    start: { x: 410.5, z: -70 },
    reward: 5000,
    steps: [
      {
        text: 'Steal the Vapor GT parked on Ocean Drive',
        say: ['RICO', '"Red GT outside the hotel. It has an alarm, so expect company."'],
        enter(ctx) {
          const v = ctx.game.vehicles.spawnMissionVehicle('sports', 394.5, -95, Math.PI);
          v.alarm = true;
          v.alarmStars = 2;
          v.mission = true;
          ctx.data.car = v;
        },
        update(ctx) {
          const v = ctx.data.car;
          if (v.wrecked) return { fail: 'The GT was wrecked.' };
          return ctx.game.player.vehicle === v ? 'next' : undefined;
        },
        target: (ctx) => ({ x: ctx.data.car.pos.x, z: ctx.data.car.pos.z, vehicle: ctx.data.car }),
      },
      {
        text: 'Lose the cops',
        say: ['RICO', '"Shake them off before you bring it to me. Back streets, stay out of sight."'],
        update(ctx) {
          const g = ctx.game;
          if (ctx.data.car.wrecked) return { fail: 'The GT was wrecked.' };
          return g.police.level === 0 ? 'next' : undefined;
        },
        target: () => null,
      },
      {
        text: (ctx) => `Bring the GT to the Spray & Go garage · condition ${Math.round(ctx.data.car.health)}%`,
        timer: 180,
        update(ctx) {
          const g = ctx.game, v = ctx.data.car;
          if (v.wrecked) return { fail: 'The GT was wrecked.' };
          if (g.player.vehicle === v && near(v.pos, GARAGE, 7) && Math.abs(v.speed) < 2 && g.police.level === 0) return 'next';
          return undefined;
        },
        target: () => ({ ...GARAGE, r: 7 }),
      },
    ],
    bonus: (ctx) => Math.round(ctx.data.car.health / 100 * 2000 / 50) * 50,
    onPass(ctx) { ctx.game.hud.toast('RICO', '"That is how it is done. More work soon."'); },
    cleanup(ctx) {
      const v = ctx.data.car;
      if (v) { v.alarm = false; v.mission = false; if (ctx.game.player.vehicle !== v && !v.wrecked) ctx.game.vehicles.removeMission(v); }
    },
  },
];
