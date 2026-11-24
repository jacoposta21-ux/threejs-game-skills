/**
 * Development-only test hooks and scene staging. This module is imported
 * dynamically inside an `import.meta.env.DEV` branch, so production builds do
 * not contain it at all (verified by scripts/check-prod-bundle.mjs).
 */
import * as THREE from 'three';
import { BASIC_POWERS, CONFIG, type PowerId } from '../core/Config';
import { Rng } from '../core/Rng';
import { createInitialState } from '../world/WorldGen';

// The Game's internals are reached through a loose type: these helpers poke at
// private members on purpose (test staging), and must never ship.
import type { Simulation } from '../simulation/SimulationManager';
import { WORLD_SEED } from '../core/Game';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type G = { sim: Simulation; [key: string]: any };

export function installTestHooks(g: G): void {
  const village = () => g.sim.state.villages[0];
  const warm = (seconds: number) => {
    for (let i = 0; i < seconds * CONFIG.sim.hz; i++) g.sim.step(1 / CONFIG.sim.hz);
  };
  const fresh = (tod = 0.42) => {
    g.applyState(createInitialState(WORLD_SEED, g.sim.terrain));
    const s = g.sim.state;
    s.tutorial.done = true;
    g.tutorial.dispose();
    g.sim.powers.unlock(BASIC_POWERS);
    g.sim.missions.autoGenerate = true;
    s.time = CONFIG.time.dayLength * tod;
    g.selected = null;
    g.menus.close(false);
    g.setPaused(false);
  };
  const v = () => village();
  window.__THREE_GAME_TEST_HOOKS__ = {
    seed: (value: number) => {
      g.sim.rng = new Rng(value);
    },
    setState: (name: string) => {
      switch (name) {
        case 'active-play':
          fresh();
          warm(25);
          g.cam.snap(v().centerX + 4, v().centerZ - 2, 58, 0.55, 0.86);
          break;
        case 'overview':
          fresh(0.38);
          warm(10);
          g.cam.snap(0, 0, 150, 0.6, 1.0);
          break;
        case 'tutorial':
          g.applyState(createInitialState(WORLD_SEED, g.sim.terrain));
          g.sim.state.tutorial.step = 1;
          g.tutorial.start();
          warm(4);
          g.cam.snap(v().centerX + 3, v().centerZ - 3, 46, 0.5, 0.82);
          break;
        case 'rain': {
          fresh();
          warm(15);
          const well = g.sim.building(v().wellId)!;
          g.sim.powers.activate('rain', well.x, well.z);
          warm(2);
          g.cam.snap(v().centerX + 2, v().centerZ, 52, 0.5, 0.7);
          break;
        }
        case 'forest-fire': {
          fresh();
          warm(10);
          const t = g.sim.state.trees.filter((tr) => !tr.charred && tr.kind !== 'bush' && Math.hypot(tr.x - v().centerX, tr.z - v().centerZ) > 20 && Math.hypot(tr.x - v().centerX, tr.z - v().centerZ) < 34);
          for (const tr of t.slice(0, 4)) g.sim.fire.ignite(g.sim, 'tree', tr.id, true);
          warm(8);
          g.cam.snap(t[0]?.x ?? v().centerX, t[0]?.z ?? v().centerZ, 55, 0.7, 0.8);
          break;
        }
        case 'flood': {
          fresh();
          const well = g.sim.building(v().wellId)!;
          g.sim.powers.activate('rain', well.x, well.z);
          warm(9);
          g.sim.state.cooldowns.rain = 0;
          g.sim.powers.activate('rain', well.x, well.z);
          warm(9);
          g.cam.snap(v().centerX + 2, v().centerZ + 2, 48, 0.5, 0.85);
          break;
        }
        case 'night':
          fresh(0.9);
          warm(8);
          g.cam.snap(v().centerX + 4, v().centerZ - 2, 55, 0.55, 0.8);
          break;
        case 'menu':
          fresh();
          warm(5);
          g.openMenu();
          break;
        case 'inspector': {
          fresh();
          warm(10);
          const well = g.sim.building(v().wellId)!;
          g.inspector.show(g.sim, v().id, well.id);
          g.cam.snap(v().centerX + 4, v().centerZ - 2, 58, 0.55, 0.86);
          break;
        }
        case 'religion':
        case 'book': {
          fresh();
          warm(4);
          stageRockKing(g, false);
          if (name === 'book') g.book.show('history');
          break;
        }
        case 'monuments': {
          fresh();
          warm(4);
          stageRockKing(g, true);
          const farm = g.sim.building(v().farmIds[0])!;
          g.sim.state.culture.lastMajorEvent = -9999;
          g.sim.bus.emit('FIRE_EXTINGUISHED', { fireId: 0, x: farm.x + 4, z: farm.z, byRain: true, kind: 'ground', targetId: -1, byPlayer: false });
          for (const sc of g.sim.state.sacred) {
            g.sim.sacredSys.addSacredness(sc, 12);
            sc.shrineProgress = 1;
            g.sim.sacredSys.addSacredness(sc, 0.1);
            sc.monumentProgress = 1;
            sc.decorations = 8;
          }
          g.sim.state.culture.festivalUntil = g.sim.state.time + 60;
          g.sim.state.culture.improvements = ['gardens', 'lanterns', 'market', 'shrine-expansion'];
          warm(3);
          g.cam.snap(v().centerX + 6, v().centerZ + 1, 62, 0.55, 0.9);
          break;
        }
        case 'mutations': {
          fresh();
          warm(6);
          g.sim.unlimitedEnergy = true;
          g.sim.powers.unlock(['mutation']);
          const rock = g.sim.state.rocks[0];
          const near = g.sim.state.villagers.filter((p) => p.alive).slice(0, 2);
          near.forEach((p, i) => {
            p.position.x = rock.x - 3 + i * 2;
            p.position.z = rock.z + 3;
            g.sim.ai.setIdle(p, 20);
          });
          g.sim.rebuildIndexes();
          for (const p of near) {
            g.sim.state.cooldowns.mutation = 0;
            g.sim.powers.activate('mutation', p.position.x, p.position.z);
          }
          const tree = g.sim.state.trees.find((t) => !t.charred && t.growth >= 1 && Math.hypot(t.x - rock.x, t.z - rock.z) < 14 && Math.hypot(t.x - rock.x, t.z - rock.z) > 5)!;
          g.sim.state.cooldowns.mutation = 0;
          g.sim.powers.activate('mutation', tree.x, tree.z);
          g.sim.state.cooldowns.mutation = 0;
          g.sim.powers.activate('mutation', rock.x, rock.z);
          g.sim.unlimitedEnergy = g.settings.unlimitedEnergy;
          warm(6);
          g.cam.snap(rock.x, rock.z, 34, 0.5, 0.78);
          break;
        }
        case 'culture-events': {
          fresh(0.55);
          warm(3);
          g.sim.state.culture.prosperityTime = 200;
          warm(4);
          for (let k = 0; k < 3; k++) g.sim.remember('rain-damage');
          g.sim.state.culture.lastMajorEvent = -9999;
          warm(4);
          g.sim.state.culture.festivalUntil = g.sim.state.time + 60;
          warm(8);
          g.cam.snap(v().centerX - 4, v().centerZ, 60, 0.4, 0.9);
          break;
        }
        // ---- v0.3 civilization states ----
        case 'civilization': {
          fresh(0.4);
          warm(20);
          g.sim.civ.planTrade();
          g.sim.civ.planTrade();
          warm(14);
          g.cam.snap(-2, 8, 128, 0.4, 0.95);
          break;
        }
        case 'trade': {
          fresh(0.4);
          warm(6);
          const d = g.sim.village('v2')!;
          const p = g.sim.village('v1')!;
          d.water = 95;
          p.water = 18;
          g.sim.civ.startCaravan(d, p, { resource: 'water', amount: 12 }, { resource: 'wood', amount: 6 }, 'trade');
          // Walk until a merchant is on the bridge (bounded).
          for (let k = 0; k < 40; k++) {
            warm(1);
            const m = g.sim.state.civ.caravans[0]?.merchantIds.map((id) => g.sim.villager(id)).find(Boolean);
            if (m && g.sim.terrain.bridgeAt(m.position.x, m.position.z)) break;
          }
          g.cam.snap(11, 14, 34, 0.9, 0.78);
          break;
        }
        case 'rockbottom':
        case 'drizzleville': {
          fresh(0.42);
          warm(20);
          const vv = g.sim.village(name === 'rockbottom' ? 'v3' : 'v2')!;
          g.cam.snap(vv.centerX + 3, vv.centerZ - 2, 50, name === 'rockbottom' ? 2.2 : -0.6, 0.86);
          break;
        }
        case 'villages': {
          fresh(0.42);
          warm(30);
          g.villagesUi.show();
          g.cam.snap(-2, 8, 128, 0.4, 0.95);
          break;
        }
        case 'challenges': {
          fresh(0.42);
          warm(5);
          const well = g.sim.building(v().wellId)!;
          v().water = 30;
          g.sim.powers.activate('rain', well.x, well.z);
          g.sim.civ.cameraAt(v().centerX, v().centerZ, 2);
          warm(3);
          g.sim.challenges.pin('amateur-botanist');
          g.sim.challenges.pin('divine-tourist');
          g.challengesUi.show();
          g.cam.snap(v().centerX + 4, v().centerZ - 2, 58, 0.55, 0.86);
          break;
        }
        // ---- v0.4 states (development builds only) ----
        case 'sunrise-island':
          fresh(0.27);
          warm(6);
          g.cam.snap(-2, 6, 140, 0.9, 0.95);
          break;
        case 'puddleton-day':
          fresh(0.45);
          warm(20);
          g.cam.snap(v().centerX + 2, v().centerZ - 4, 54, 0.4, 0.78);
          break;
        case 'drizzleville-rain': {
          fresh(0.5);
          warm(10);
          const d = g.sim.village('v2')!;
          const well = g.sim.building(d.wellId)!;
          g.sim.powers.activate('rain', well.x, well.z);
          warm(3);
          g.cam.snap(d.centerX, d.centerZ - 2, 52, -0.4, 0.72);
          break;
        }
        case 'rockbottom-sunset': {
          fresh(0.79);
          warm(10);
          const r = g.sim.village('v3')!;
          g.cam.snap(r.centerX + 2, r.centerZ, 56, 2.4, 0.62);
          break;
        }
        case 'tornado':
        case 'freeze':
        case 'gravity':
        case 'terraform':
        case 'timewarp':
        case 'possession':
        case 'meteor':
        case 'resurrection': {
          fresh(0.45);
          g.sim.state.mode = 'creative';
          g.sim.applyMode();
          g.sim.unlimitedEnergy = true;
          warm(8);
          stagePower(g, name as PowerId);
          g.applyModeOptions();
          break;
        }
        case 'promotion': {
          fresh(0.45);
          warm(4);
          g.sim.career.award('test:promotion', 105, 'Test promotion');
          warm(1);
          g.cam.snap(v().centerX + 4, v().centerZ - 2, 58, 0.55, 0.86);
          break;
        }
        case 'power-menu':
          fresh(0.45);
          warm(4);
          g.toolbar.toggleMenu();
          g.cam.snap(v().centerX + 4, v().centerZ - 2, 58, 0.55, 0.86);
          break;
        case 'career-panel':
          fresh(0.45);
          warm(4);
          g.careerUi.show();
          g.cam.snap(v().centerX + 4, v().centerZ - 2, 58, 0.55, 0.86);
          break;
        default:
          throw new Error(`Unknown test state: ${name}`);
      }
      g.render(0, performance.now() / 1000);
      return { state: name };
    },
    setPausedForScreenshot: (paused: boolean) => {
      g.pausedForScreenshot = paused;
    },
    setReducedMotion: (enabled: boolean) => {
      g.reducedMotion = enabled;
    },
    hideDebugUi: () => {},
    // Extra hooks for the browser playtest.
    selectPower: (id: PowerId | null) => g.select(id),
    worldToScreen: (x: number, z: number) => {
      const p = new THREE.Vector3(x, g.sim.terrain.surfaceAt(x, z), z).project(g.camera);
      const rect = g.canvas.getBoundingClientRect();
      return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
    },
    skipTutorial: () => g.tutorial.finish(true),
    simulate: (seconds: number) => warm(seconds),
    /** Test-only: grant Chaos so Mutation can be exercised deterministically. */
    grantChaos: (amount: number) => g.sim.addChaos(amount, 'Test grant'),
    openBook: () => g.book.show('history'),
    // ---- v0.4 (development builds only; the production bundle has none of this) ----
    /** Advanced technical tests only: grant career XP through the real award path. */
    /** Read-only: would this power be accepted at this point right now? (finds valid targets for tests) */
    canCast: (id: PowerId, x: number, z: number) => g.sim.powers.check(id, x, z).ok,
    grantXp: (amount: number) => g.sim.career.award(`test:${g.sim.state.time.toFixed(2)}`, amount, 'Development test grant'),
    setMode: (mode: 'career' | 'creative') => g.switchMode(mode),
    possess: (id: string) => {
      const pv = g.sim.villager(id);
      if (pv) g.sim.possession.start(pv);
    },
    // ---- v0.3 ----
    /** Ask the real trade planner for its best deal now (still subject to all trade rules). */
    planTrade: () => g.sim.civ.planTrade()?.id ?? null,
    /** Ask the real migration planner (force skips only the global cooldown/probability roll). */
    planMigration: () => g.sim.civ.considerMigration(true)?.id ?? null,
    focusVillage: (id: string) => {
      const vv = g.sim.village(id);
      if (vv) g.cam.focus(vv.centerX + 2, vv.centerZ - 2, 52, 0.6, 0.55, 0.86);
    },
    worldPoint: (x: number, z: number) => {
      const p = new THREE.Vector3(x, g.sim.terrain.walkHeightAt(x, z) + 1, z).project(g.camera);
      const rect = g.canvas.getBoundingClientRect();
      return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height, visible: p.z < 1 };
    },
  };
  // Read-only state accessor for the browser playtest (positions of buildings/trees).
  (window as unknown as { __GI_STATE__?: () => unknown }).__GI_STATE__ = () => g.sim.state;
}

/** v0.4 screenshot scenes: each new power in action near a village (creative mode, dev only). */
function stagePower(g: G, id: PowerId): void {
  const sim = g.sim;
  const warm = (sec: number) => {
    for (let i = 0; i < sec * CONFIG.sim.hz; i++) sim.step(1 / CONFIG.sim.hz);
  };
  const p = sim.village('v1')!;
  const d = sim.village('v2')!;
  const r = sim.village('v3')!;
  const act = (pid: PowerId, x: number, z: number) => {
    sim.state.cooldowns[pid] = 0;
    return sim.powers.activate(pid, x, z);
  };
  // Find a valid spot by spiralling out from a preferred point.
  const near = (pid: PowerId, x: number, z: number) => {
    for (let k = 0; k < 60; k++) {
      const a = k * 2.4;
      const rr = k * 0.8;
      const px = x + Math.cos(a) * rr;
      const pz = z + Math.sin(a) * rr;
      if (sim.powers.check(pid, px, pz).ok) return { x: px, z: pz };
    }
    return { x, z };
  };
  if (id === 'tornado') {
    const at = near('tornado', p.centerX + 14, p.centerZ - 6);
    act('tornado', at.x, at.z);
    warm(3);
    const e = sim.state.effects.find((x) => x.kind === 'tornado');
    g.cam.snap(e?.x ?? at.x, e?.z ?? at.z, 40, 0.5, 0.62);
  } else if (id === 'freeze') {
    const farm = sim.building(p.farmIds[0])!;
    for (const t of sim.treesNear(farm.x + 8, farm.z, 8, []).slice(0, 2)) sim.fire.ignite(sim, 'tree', t.id, true);
    warm(2);
    act('freeze', farm.x + 4, farm.z);
    warm(3);
    g.cam.snap(farm.x + 4, farm.z, 40, 0.6, 0.78);
  } else if (id === 'gravity') {
    act('gravity', d.centerX, d.centerZ);
    warm(4);
    g.cam.snap(d.centerX, d.centerZ, 34, -0.5, 0.5);
  } else if (id === 'terraform') {
    const at = near('terraform', r.centerX + 20, r.centerZ + 12);
    for (let k = 0; k < 3; k++) act('terraform', at.x, at.z);
    sim.powers.terraform.mode = 'lower';
    const at2 = near('terraform', at.x - 10, at.z + 6);
    for (let k = 0; k < 2; k++) act('terraform', at2.x, at2.z);
    sim.powers.terraform.mode = 'raise';
    warm(1);
    g.select('terraform');
    g.cam.snap(at.x - 4, at.z + 2, 38, 2.2, 0.6);
  } else if (id === 'timewarp') {
    act('timewarp', d.centerX, d.centerZ + 2);
    warm(3);
    g.cam.snap(d.centerX, d.centerZ, 44, -0.4, 0.7);
  } else if (id === 'possession') {
    const pv = sim.state.villagers.find((x) => x.alive && x.villageId === 'v1' && x.age > 16)!;
    act('possession', pv.position.x, pv.position.z);
    sim.possession.steer(0.6, 0.8);
    warm(3);
    sim.possession.steer(0, 0);
    g.cam.snap(pv.position.x, pv.position.z, 13, pv.heading + Math.PI, 0.42);
  } else if (id === 'meteor') {
    const at = near('meteor', r.centerX + 16, r.centerZ - 12);
    act('meteor', at.x, at.z);
    warm(1.6);
    g.pausedForScreenshot = true; // freeze mid-fall
    g.cam.snap(at.x, at.z, 70, 2.3, 0.7);
  } else if (id === 'resurrection') {
    const victim = sim.state.villagers.find((x) => x.alive && x.villageId === 'v1' && x.age > 16)!;
    sim.ai.kill(sim, victim, 'a falling turnip', false);
    warm(2);
    const grave = sim.state.graveyard[0];
    act('resurrection', grave.x, grave.z);
    warm(0.3);
    g.pausedForScreenshot = true;
    g.cam.snap(grave.x, grave.z, 26, 0.6, 0.6);
  }
}

/** Deterministic Rock King scene: villagers on the plaza, lightning on the plaza rock, a ritual. */
function stageRockKing(g: G, complete: boolean): void {
  const sim = g.sim;
  const rock = sim.state.rocks[0];
  const crowd = sim.state.villagers.filter((p) => p.alive).slice(0, 12);
  crowd.forEach((p, i) => {
    const a = (i / crowd.length) * Math.PI * 2;
    p.position.x = rock.x + Math.cos(a) * 6;
    p.position.z = rock.z + Math.sin(a) * 6;
    sim.ai.setIdle(p, 4);
  });
  sim.rebuildIndexes();
  sim.unlimitedEnergy = true;
  sim.powers.activate('lightning', rock.x + 0.3, rock.z + 0.3);
  sim.unlimitedEnergy = g.settings.unlimitedEnergy;
  for (const f of [...sim.state.fires]) f.intensity = 0;
  const r = sim.religion.byArchetype('rock');
  const sacred = sim.sacredSys.find('rock', rock.id);
  if (sacred) {
    sim.sacredSys.addSacredness(sacred, 4);
    sacred.decorations = 6;
    sacred.shrineProgress = complete ? 1 : 0.5;
  }
  if (r) {
    sim.religion.startRitual(r, r.rituals[0]);
    for (let i = 0; i < 6 * CONFIG.sim.hz; i++) sim.step(1 / CONFIG.sim.hz);
  }
  g.cam.snap(rock.x - 2, rock.z + 1, 30, 0.35, 0.75);
}

