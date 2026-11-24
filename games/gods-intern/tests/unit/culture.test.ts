import { describe, expect, it } from 'vitest';
import { SAVE_VERSION } from '../../src/world/WorldGen';
import { CONFIG } from '../../src/core/Config';
import type { GameStateData, VillagerData } from '../../src/core/types';
import { conversionWeight } from '../../src/culture/Personality';
import { MAJOR_GAP } from '../../src/culture/SurrealEvents';
import { MemoryStore, SaveManager } from '../../src/persistence/SaveManager';
import { Simulation } from '../../src/simulation/SimulationManager';
import { NotificationQueue } from '../../src/ui/NotificationQueue';
import { createInitialState } from '../../src/world/WorldGen';
import { TerrainData } from '../../src/world/TerrainGen';

const DT = 1 / CONFIG.sim.hz;
const SEED = 42;

function run(sim: Simulation, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) sim.step(DT);
}

/** A ready-to-play sim: tutorial done, all powers, unlimited energy, daytime. */
function sandbox(): Simulation {
  const sim = new Simulation(SEED);
  sim.state.tutorial.done = true;
  sim.powers.unlock(['rain', 'lightning', 'nature', 'fire', 'mutation']);
  sim.unlimitedEnergy = true;
  sim.state.time = CONFIG.time.dayLength * 0.4;
  return sim;
}

const village = (sim: Simulation) => sim.state.villages[0];

/** Put `n` awake villagers in a ring around a point so they witness what happens there. */
function crowd(sim: Simulation, x: number, z: number, n: number, radius = 7): VillagerData[] {
  const vs = sim.state.villagers.filter((v) => v.alive).slice(0, n);
  vs.forEach((v, i) => {
    const a = (i / n) * Math.PI * 2;
    v.position.x = x + Math.cos(a) * radius;
    v.position.z = z + Math.sin(a) * radius;
    sim.ai.setIdle(v, 5);
  });
  // Everyone else goes far away so they don't witness.
  for (const v of sim.state.villagers.filter((p) => !vs.includes(p))) {
    v.position.x = x + 60;
    v.position.z = z + 60;
  }
  sim.rebuildIndexes();
  return vs;
}

const plazaRock = (sim: Simulation) => sim.state.rocks[0];

describe('divine memory', () => {
  it('records witnessed events with witness ids and links them to villagers', () => {
    const sim = sandbox();
    const v = village(sim);
    const witnesses = crowd(sim, v.centerX, v.centerZ, 5);
    const m = sim.memory.record('flood', v.centerX, v.centerZ, { impact: 0.7, radius: 24 });
    expect(m).not.toBeNull();
    expect(m!.witnessIds.sort()).toEqual(witnesses.map((w) => w.id).sort());
    expect(m!.interpretation).toBeTruthy();
    for (const w of witnesses) expect(w.memoryIds).toContain(m!.id);
    expect(sim.state.memories).toContain(m);
  });

  it('only counts villagers that are in range, alive and awake', () => {
    const sim = sandbox();
    const v = village(sim);
    const [a, b, c] = crowd(sim, v.centerX, v.centerZ, 3, 5);
    b.currentTask.state = 'RESTING';
    b.currentTask.arrived = true; // asleep indoors
    c.alive = false;
    const far = sim.state.villagers.find((p) => p.alive && p !== a && p !== b && p !== c)!;
    sim.rebuildIndexes();
    const seen = sim.memory.witnesses(v.centerX, v.centerZ, 10).map((w) => w.id);
    expect(seen).toContain(a.id);
    expect(seen).not.toContain(b.id);
    expect(seen).not.toContain(c.id);
    expect(seen).not.toContain(far.id);
  });

  it('decays ordinary memories, keeps permanent ones, and survives save/load', () => {
    const sim = sandbox();
    const v = village(sim);
    crowd(sim, v.centerX, v.centerZ, 12);
    const big = sim.memory.record('smiting', v.centerX, v.centerZ, { impact: 0.95, radius: 30 })!;
    const small = sim.memory.record('instant-tree', v.centerX, v.centerZ, { impact: 0.4, radius: 24 })!;
    expect(big.permanent).toBe(true);
    expect(small.permanent).toBe(false);
    const saves = new SaveManager(new MemoryStore());
    saves.save(sim.state);
    const loaded = saves.load();
    expect(loaded.ok && loaded.state.memories.map((m) => m.id)).toEqual(sim.state.memories.map((m) => m.id));
    run(sim, 420);
    expect(sim.state.memories.find((m) => m.id === big.id)).toBeTruthy();
    expect(sim.state.memories.find((m) => m.id === small.id)).toBeUndefined();
    expect(sim.state.memories.length).toBeLessThanOrEqual(CONFIG.culture.maxMemories);
  });

  it('keeps the memory list bounded', () => {
    const sim = sandbox();
    const v = village(sim);
    crowd(sim, v.centerX, v.centerZ, 4);
    for (let i = 0; i < CONFIG.culture.maxMemories + 40; i++) sim.memory.record('drought-ended', v.centerX, v.centerZ, { impact: 0.6, radius: 20 });
    expect(sim.state.memories.length).toBeLessThanOrEqual(CONFIG.culture.maxMemories);
  });
});

describe('religion generator', () => {
  it('needs enough belief pressure and witnesses before a religion forms', () => {
    const sim = sandbox();
    const v = village(sim);
    crowd(sim, v.centerX, v.centerZ, 6);
    // Two witnesses only: never enough, regardless of pressure.
    sim.memory.record('flood', v.centerX + 30, v.centerZ + 30, { impact: 0.7, radius: 3 });
    expect(sim.religion.active.length).toBe(0);
    sim.memory.record('flood', v.centerX, v.centerZ, { impact: 0.3, radius: 24 });
    const pressure = sim.state.culture.pressure.flood;
    expect(pressure).toBeGreaterThan(0);
    expect(pressure).toBeLessThan(CONFIG.culture.religionThreshold);
    expect(sim.religion.active.length).toBe(0);
    for (let i = 0; i < 4 && !sim.religion.active.length; i++) sim.memory.record('flood', v.centerX, v.centerZ, { impact: 0.7, radius: 24 });
    const r = sim.religion.active[0];
    expect(r).toBeTruthy();
    expect(r.archetype).toBe('flood');
    expect(r.name).toMatch(/^(The )[A-Z]/);
    expect(r.followers.length).toBeGreaterThanOrEqual(2);
    expect(r.doctrine.length).toBe(3);
    expect(r.rituals.length).toBe(1);
    expect(sim.state.sacred.some((s) => s.religionId === r.id)).toBe(true);
    expect(sim.state.history.some((h) => h.kind === 'religion')).toBe(true);
    expect(sim.state.memories.find((m) => m.id === r.originEventId)?.permanent).toBe(true);
  });

  it('deduplicates by archetype, keeps names unique and caps active religions', () => {
    const sim = sandbox();
    const v = village(sim);
    crowd(sim, v.centerX, v.centerZ, 10);
    const a = sim.religion.found('flood', { x: v.centerX, z: v.centerZ, recruitFromVillage: true })!;
    const again = sim.religion.found('flood', { x: v.centerX + 5, z: v.centerZ, recruitFromVillage: true });
    expect(again).toBe(a);
    for (const arch of ['rock', 'cloud', 'gold', 'potato', 'fire']) sim.religion.found(arch, { x: v.centerX, z: v.centerZ, recruitFromVillage: true });
    expect(sim.religion.active.length).toBeLessThanOrEqual(CONFIG.culture.maxReligions);
    const names = sim.state.religions.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
    expect(sim.state.religions.some((r) => !r.active)).toBe(true); // weakest retired
    for (const p of sim.state.villagers) {
      if (p.religionId) expect(sim.state.religions.find((r) => r.id === p.religionId)?.active).toBe(true);
    }
  });

  it('forms three distinct religions through three different triggers', () => {
    const sim = sandbox();
    const v = village(sim);
    // 1) Lightning on the plaza rock in front of witnesses → The Rock King.
    const rock = plazaRock(sim);
    crowd(sim, rock.x, rock.z, 8, 8);
    sim.powers.activate('lightning', rock.x, rock.z);
    expect(sim.religion.byArchetype('rock')).toBeTruthy();
    // 2) A burning tree saved by rain in front of witnesses → The Holy Tree.
    sim.state.culture.lastMajorEvent = -9999;
    const tree = sim.state.trees.find((t) => !t.charred && t.growth >= 1 && Math.hypot(t.x - v.centerX, t.z - v.centerZ) < 30 && Math.hypot(t.x - rock.x, t.z - rock.z) > 10)!;
    crowd(sim, tree.x, tree.z, 6, 6);
    sim.state.culture.lastReligionAt = -9999;
    sim.fire.ignite(sim, 'tree', tree.id, true);
    run(sim, 0.5);
    sim.state.cooldowns.rain = 0;
    sim.powers.activate('rain', tree.x, tree.z);
    run(sim, 8);
    expect(sim.religion.byArchetype('tree')).toBeTruthy();
    // 3) Mutation: a golden tree → The Golden Tree faith.
    const other = sim.state.trees.find((t) => !t.charred && !t.golden && t.growth >= 1 && t.id !== tree.id && Math.hypot(t.x - v.centerX, t.z - v.centerZ) < 40)!;
    crowd(sim, other.x, other.z, 6, 6);
    sim.state.cooldowns.mutation = 0;
    const res = sim.powers.activate('mutation', other.x, other.z);
    expect(res.ok, res.reason).toBe(true);
    expect(sim.religion.byArchetype('gold')).toBeTruthy();
    expect(new Set(sim.religion.active.map((r) => r.archetype)).size).toBeGreaterThanOrEqual(3);
  });

  it('schedules each ritual once per day at its time and applies its effect', () => {
    const sim = sandbox();
    const v = village(sim);
    crowd(sim, v.centerX, v.centerZ, 8);
    const r = sim.religion.found('rebirth', { x: v.centerX + 6, z: v.centerZ, recruitFromVillage: true })!;
    const ritual = r.rituals[0];
    const day = sim.day;
    // Not before its hour.
    sim.state.time = (day - 1) * CONFIG.time.dayLength + CONFIG.time.dayLength * (ritual.timeOfDay - 0.05);
    ritual.lastPerformedDay = day - 1;
    run(sim, 2);
    expect(ritual.activeUntil).toBe(0);
    // At its hour it starts, followers attend.
    sim.state.time = (day - 1) * CONFIG.time.dayLength + CONFIG.time.dayLength * (ritual.timeOfDay + 0.005);
    run(sim, 1.5);
    expect(ritual.activeUntil).toBeGreaterThan(0);
    expect(sim.state.villagers.some((p) => p.currentTask.activity === 'ritual')).toBe(true);
    const trees0 = sim.state.trees.length;
    const sacred = sim.religion.sacredOf(r)!;
    const s0 = sacred.sacredness;
    run(sim, ritual.duration + 2);
    expect(ritual.activeUntil).toBe(0);
    expect(ritual.lastPerformedDay).toBe(sim.day);
    expect(sacred.sacredness).toBeGreaterThan(s0);
    expect(sim.state.trees.length).toBeGreaterThanOrEqual(trees0); // planting ritual plants or regrows
    // Same day: no second ritual.
    run(sim, 10);
    expect(ritual.activeUntil).toBe(0);
  });
});

describe('sacred objects', () => {
  it('progress from gathering to decorations, shrine and monument through villager work', () => {
    const sim = sandbox();
    const v = village(sim);
    const rock = sim.state.rocks[1];
    const s = sim.sacredSys.create({ kind: 'rock', targetId: rock.id, x: rock.x, z: rock.z, label: 'Test Rock', sacredness: 0.5, monument: 'crown-statue' })!;
    expect(s.stage).toBe(1);
    sim.sacredSys.addSacredness(s, 0.6);
    expect(s.stage).toBe(2);
    sim.sacredSys.addSacredness(s, 2);
    expect(s.stage).toBe(3);
    expect(sim.sacredSys.find('rock', rock.id)).toBe(s);
    // Villagers place decorations over time, spending wood.
    for (let i = 0; i < 120 && s.decorations < 2; i++) {
      v.wood = 100;
      run(sim, 2);
    }
    expect(s.decorations).toBeGreaterThanOrEqual(2);
    // Shrine then monument.
    sim.sacredSys.addSacredness(s, 10);
    expect(s.stage).toBe(4);
    for (let i = 0; i < 300 && s.monumentProgress < 1; i++) {
      v.wood = 100;
      run(sim, 2);
    }
    expect(s.shrineProgress).toBe(1);
    expect(s.stage).toBe(5);
    expect(s.monumentProgress).toBe(1);
    expect(sim.state.history.some((h) => h.title.startsWith('The Monument to'))).toBe(true);
  });

  it('caps the number of sacred objects and reacts when one is destroyed', () => {
    const sim = sandbox();
    const v = village(sim);
    crowd(sim, v.centerX, v.centerZ, 8);
    const r = sim.religion.found('tree', { x: v.centerX, z: v.centerZ, recruitFromVillage: true })!;
    const tree = sim.state.trees.find((t) => !t.charred && t.growth >= 1)!;
    const s = sim.sacredSys.create({ kind: 'tree', targetId: tree.id, x: tree.x, z: tree.z, label: 'The Twig', sacredness: 2, religionId: r.id, monument: 'obelisk' })!;
    let damaged = false;
    sim.bus.on('SACRED_DAMAGED', () => (damaged = true));
    const infl = r.influence;
    sim.bus.emit('TREE_BURNED', { treeId: tree.id, x: tree.x, z: tree.z });
    expect(damaged).toBe(true);
    expect(r.influence).toBeLessThan(infl + 1e-9);
    for (let i = 0; i < 20; i++) sim.sacredSys.create({ kind: 'ground', targetId: -100 - i, x: i, z: i, label: `G${i}`, sacredness: 1, monument: 'obelisk' });
    expect(sim.state.sacred.length).toBe(CONFIG.culture.maxSacred);
    expect(s).toBeTruthy();
  });
});

describe('surreal events', () => {
  it('A — the Rock King needs witnesses and crowns the rock', () => {
    const lonely = sandbox();
    const r0 = plazaRock(lonely);
    crowd(lonely, r0.x + 70, r0.z + 70, 20); // nobody near
    lonely.powers.activate('lightning', r0.x, r0.z);
    expect(r0.crowned).toBe(false);

    const sim = sandbox();
    const rock = plazaRock(sim);
    crowd(sim, rock.x, rock.z, 8, 8);
    sim.powers.activate('lightning', rock.x, rock.z);
    expect(rock.crowned).toBe(true);
    expect(sim.state.culture.rockKingId).toBe(rock.id);
    expect(sim.sacredSys.find('rock', rock.id)?.religionId).toBe(sim.religion.byArchetype('rock')!.id);
    expect(sim.state.history.some((h) => h.title === 'A Rock Was Crowned King')).toBe(true);
  });

  it('B — repeated flooding founds the Wet Sock Festival with a puddle shrine', () => {
    const sim = sandbox();
    const v = village(sim);
    sim.remember('flood-start');
    sim.bus.emit('FLOOD_STARTED', { villageId: v.id, level: 0.4, x: v.centerX, z: v.centerZ });
    expect(sim.state.culture.festivals.some((f) => f.kind === 'wet-sock')).toBe(true);
    expect(sim.state.culture.festivalUntil).toBeGreaterThan(sim.state.time);
    expect(sim.state.sacred.some((s) => s.monument === 'sock-totem')).toBe(true);
  });

  it('C — a tree saved from fire becomes the Holy Tree', () => {
    const sim = sandbox();
    const v = village(sim);
    const tree = sim.state.trees.find((t) => !t.charred && t.growth >= 1 && Math.hypot(t.x - v.centerX, t.z - v.centerZ) < 25)!;
    crowd(sim, tree.x, tree.z, 5, 6);
    sim.bus.emit('FIRE_EXTINGUISHED', { fireId: 1, x: tree.x, z: tree.z, byRain: true, kind: 'tree', targetId: tree.id, byPlayer: true });
    expect(sim.sacredSys.find('tree', tree.id)?.label).toBe('The Holy Tree');
  });

  it('D — regrowth from ash founds a rebirth belief that replants', () => {
    const sim = sandbox();
    const v = village(sim);
    crowd(sim, v.centerX, v.centerZ, 6);
    sim.bus.emit('TREE_REGROWN', { treeId: 0, x: v.centerX + 8, z: v.centerZ + 8 });
    const r = sim.religion.byArchetype('rebirth');
    expect(r?.rituals[0].kind).toBe('planting');
  });

  it('E — the Forbidden Well changes where believers drink, and rain purifies it', () => {
    const sim = sandbox();
    const v = village(sim);
    const well = sim.building(v.wellId)!;
    crowd(sim, well.x, well.z, 6, 6);
    sim.powers.activate('lightning', well.x + 6, well.z + 6);
    const curse = sim.state.culture.cursedWell!;
    expect(curse.believers.length).toBeGreaterThan(0);
    run(sim, 1); // the purification prayer is created and a messenger sets off
    const believer = curse.believers.map((id) => sim.villager(id)!).find((p) => p.currentTask.activity !== 'pray-shrine')!;
    believer.thirst = 0.9;
    believer.currentTask.state = 'IDLE';
    believer.currentTask.timer = 0;
    believer.decisionTimer = 0;
    sim.step(DT);
    expect(believer.currentTask.activity).toBe('drink-river');
    expect(sim.state.prayers.some((p) => p.type === 'PURIFY' && p.status === 'active')).toBe(true);
    sim.state.cooldowns.rain = 0;
    sim.powers.activate('rain', well.x, well.z);
    expect(sim.state.culture.cursedWell).toBeNull();
  });

  it('F — prolonged prosperity starts the Eternal Picnic and picnickers stop working', () => {
    const sim = sandbox();
    sim.state.culture.prosperityTime = 150;
    run(sim, 1.5);
    const c = sim.state.culture;
    expect(c.picnicUntil).toBeGreaterThan(sim.state.time);
    expect(c.picnickers.length).toBeGreaterThan(0);
    run(sim, 20);
    const picnicking = sim.state.villagers.filter((p) => p.currentTask.activity === 'picnic').length;
    expect(picnicking).toBeGreaterThan(0);
  });

  it('G — a burst of weird miracles declares Upside-Down Day and slows the farm', () => {
    const sim = sandbox();
    for (let i = 0; i < 5; i++) sim.remember('weird');
    sim.bus.emit('POWER_USED', { power: 'lightning', x: 0, z: 0 });
    expect(sim.state.culture.upsideDownUntil).toBeGreaterThan(sim.state.time);
    const farm = sim.building(village(sim).farmIds[0])!;
    const g0 = farm.cropGrowth;
    run(sim, 5);
    const slow = farm.cropGrowth - g0;
    sim.state.culture.upsideDownUntil = 0;
    const g1 = farm.cropGrowth;
    run(sim, 5);
    expect(slow).toBeLessThan(farm.cropGrowth - g1);
  });

  it('H — repeated rain damage puts a cloud on trial and a verdict follows', () => {
    const sim = sandbox();
    for (let i = 0; i < 3; i++) sim.remember('rain-damage');
    run(sim, 1.5);
    expect(sim.state.culture.trial).not.toBeNull();
    expect(sim.state.sacred.some((s) => s.monument === 'cloud-effigy')).toBe(true);
    run(sim, 45);
    expect(sim.state.culture.trial).toBeNull();
    expect(sim.state.history.some((h) => h.title.startsWith('The Cloud Was'))).toBe(true);
  });

  it('I — a crop surviving a fire becomes the Sacred Potato and lowers output', () => {
    const sim = sandbox();
    const farm = sim.building(village(sim).farmIds[0])!;
    sim.bus.emit('FIRE_EXTINGUISHED', { fireId: 1, x: farm.x + 4, z: farm.z, byRain: true, kind: 'ground', targetId: -1, byPlayer: true });
    expect(sim.state.culture.potatoCult).toBe(true);
    expect(sim.religion.byArchetype('potato')).toBeTruthy();
    expect(sim.sacredSys.find('crop', farm.id)?.monument).toBe('giant-potato');
  });

  it('J — enough answered prayers create the Department of Miracles and bureaucratic prayers', () => {
    const sim = sandbox();
    sim.state.stats.prayersAnswered = 4;
    const p = { id: 'x', title: 't', description: 'd', objective: 'o', villageId: 'v1', type: 'THIRST', priority: 1, status: 'completed' as const, createdAt: 0, reward: 10, progress: 1, targetX: 0, targetZ: 0, data: {} };
    sim.bus.emit('PRAYER_COMPLETED', { prayer: p });
    expect(sim.state.culture.officeBuilt).toBe(true);
    sim.state.culture.officeProgress = 1;
    village(sim).water = 5;
    run(sim, 1);
    const thirst = sim.state.prayers.find((x) => x.type === 'THIRST')!;
    expect(thirst.title).toMatch(/^Form \d+-B: /);
  });

  it('K — witnessed fires put out by rain found the Fire Appreciation Society and raise fire risk', () => {
    const sim = sandbox();
    for (let i = 0; i < 3; i++) sim.remember('fire-out-witnessed');
    sim.bus.emit('FIRE_EXTINGUISHED', { fireId: 1, x: 0, z: 0, byRain: true, kind: 'ground', targetId: -1, byPlayer: false });
    expect(sim.state.culture.firePit).not.toBeNull();
    expect(sim.state.culture.fireRisk).toBeGreaterThan(0);
    expect(sim.religion.byArchetype('fire')?.rituals[0].kind).toBe('bonfire');
  });

  it('L — three ignored prayers cause the Great Silence; answering one ends it', () => {
    const sim = sandbox();
    const fail = { id: 'x', title: 't', description: 'd', objective: 'o', villageId: 'v1', type: 'THIRST', priority: 1, status: 'failed' as const, createdAt: 0, reward: 10, progress: 0, targetX: 0, targetZ: 0, data: {} };
    for (let i = 0; i < 3; i++) sim.bus.emit('PRAYER_FAILED', { prayer: fail });
    expect(sim.state.culture.silence).toBe(true);
    expect(sim.state.sacred.some((s) => s.monument === 'out-of-office')).toBe(true);
    run(sim, 1);
    expect(sim.state.prayers.some((p) => p.type === 'STILL_EMPLOYED')).toBe(true);
    sim.bus.emit('PRAYER_COMPLETED', { prayer: { ...fail, status: 'completed' } });
    expect(sim.state.culture.silence).toBe(false);
  });

  it('respects cooldowns and the gap between major events', () => {
    const sim = sandbox();
    const v = village(sim);
    const well = sim.building(v.wellId)!;
    crowd(sim, well.x, well.z, 6, 6);
    sim.powers.activate('lightning', well.x + 6, well.z + 6);
    expect(sim.state.culture.cursedWell).not.toBeNull();
    const firedAt = sim.state.culture.lastMajorEvent;
    // Right after a major event, another major event is held back.
    const tree = sim.state.trees.find((t) => !t.charred && t.growth >= 1 && Math.hypot(t.x - v.centerX, t.z - v.centerZ) < 25)!;
    crowd(sim, tree.x, tree.z, 5, 6);
    sim.bus.emit('FIRE_EXTINGUISHED', { fireId: 2, x: tree.x, z: tree.z, byRain: true, kind: 'tree', targetId: tree.id, byPlayer: true });
    expect(sim.sacredSys.find('tree', tree.id)).toBeUndefined();
    expect(sim.state.culture.lastMajorEvent).toBe(firedAt);
    expect(sim.state.consequenceCooldowns['forbidden-well-lightning']).toBeGreaterThan(sim.state.time);
    // After the gap, it fires.
    run(sim, MAJOR_GAP + 1);
    sim.bus.emit('FIRE_EXTINGUISHED', { fireId: 3, x: tree.x, z: tree.z, byRain: true, kind: 'tree', targetId: tree.id, byPlayer: true });
    expect(sim.sacredSys.find('tree', tree.id)).toBeTruthy();
  });
});

describe('mutation power', () => {
  it('validates targets and never charges for invalid ones', () => {
    const sim = sandbox();
    sim.unlimitedEnergy = false;
    sim.state.energy = 100;
    expect(sim.powers.activate('mutation', 0, 79).ok).toBe(false); // sea
    // Bare meadow: no villager, tree or rock within reach.
    let spot: { x: number; z: number } | null = null;
    for (let x = -60; x < 60 && !spot; x += 3) {
      for (let z = -60; z < 60 && !spot; z += 3) {
        if (sim.terrain.isLand(x, z) && !sim.powers.check('mutation', x, z).ok && sim.powers.check('mutation', x, z).reason !== 'Recharging…') spot = { x, z };
      }
    }
    expect(spot).not.toBeNull();
    expect(sim.powers.activate('mutation', spot!.x, spot!.z).ok).toBe(false);
    expect(sim.state.energy).toBe(100);
    const locked = new Simulation(SEED);
    locked.state.tutorial.done = true;
    expect(locked.powers.check('mutation', 0, 0).reason).toMatch(/Chaos/);
  });

  it('applies giant head, golden tree and walking rock, and rejects repeats', () => {
    const sim = sandbox();
    const villager = sim.state.villagers[3];
    sim.ai.setIdle(villager, 30);
    const r1 = sim.powers.activate('mutation', villager.position.x, villager.position.z);
    expect(r1.ok, r1.reason).toBe(true);
    expect(villager.mutation).toBe('giant-head');
    sim.state.cooldowns.mutation = 0;
    const tree = sim.state.trees.find((t) => !t.charred && t.growth >= 1 && Math.hypot(t.x - villager.position.x, t.z - villager.position.z) > 6)!;
    expect(sim.powers.activate('mutation', tree.x, tree.z).ok).toBe(true);
    expect(tree.golden).toBe(true);
    expect(sim.fire.ignite(sim, 'tree', tree.id, true)).toBeNull(); // gold does not burn
    sim.state.cooldowns.mutation = 0;
    const rock = sim.state.rocks[2];
    expect(sim.powers.activate('mutation', rock.x, rock.z).ok).toBe(true);
    expect(rock.walking).toBe(true);
    sim.state.cooldowns.mutation = 0;
    expect(sim.powers.check('mutation', rock.x, rock.z).ok).toBe(false);
    expect(sim.state.mutations.map((m) => m.kind).sort()).toEqual(['giant-head', 'golden-tree', 'walking-rock']);
    const x0 = rock.x;
    const z0 = rock.z;
    run(sim, 30);
    expect(Math.hypot(rock.x - x0, rock.z - z0)).toBeGreaterThan(1);
    expect(sim.terrain.isLand(rock.x, rock.z)).toBe(true);
  });

  it('mutations persist through save and load', () => {
    const sim = sandbox();
    const tree = sim.state.trees.find((t) => !t.charred && t.growth >= 1)!;
    sim.powers.activate('mutation', tree.x, tree.z);
    sim.state.cooldowns.mutation = 0;
    const rock = sim.state.rocks[3];
    sim.powers.activate('mutation', rock.x, rock.z);
    const saves = new SaveManager(new MemoryStore());
    saves.save(sim.state);
    const loaded = saves.load();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const restored = new Simulation(SEED, loaded.state);
    expect(restored.state.trees[tree.id].golden).toBe(true);
    expect(restored.state.rocks[rock.id].walking).toBe(true);
    expect(restored.state.mutations.length).toBe(2);
    run(restored, 5);
    expect(restored.state.rocks[rock.id].walking).toBe(true);
  });
});

describe('personalities', () => {
  it('skeptics resist conversion, the superstitious embrace it', () => {
    const sim = sandbox();
    const v = { ...sim.state.villagers[0] };
    v.traits = ['skeptical'];
    const skeptic = conversionWeight(v);
    v.traits = ['superstitious'];
    expect(conversionWeight(v)).toBeGreaterThan(skeptic * 4);
  });

  it('cowards flee a fire the brave stay near', () => {
    const sim = sandbox();
    const v = village(sim);
    const tree = sim.state.trees.find((t) => !t.charred && t.growth >= 1 && Math.hypot(t.x - v.centerX, t.z - v.centerZ) > 30)!;
    const [coward, brave] = crowd(sim, tree.x, tree.z, 2, 11);
    coward.traits = ['cowardly'];
    brave.traits = ['brave'];
    coward.memoryIds = [];
    brave.memoryIds = [];
    sim.fire.ignite(sim, 'tree', tree.id, true);
    run(sim, 0.5);
    for (const p of [coward, brave]) p.decisionTimer = 0;
    sim.step(DT);
    expect(coward.currentTask.state).toBe('FLEEING');
    expect(brave.currentTask.state).not.toBe('FLEEING');
  });

  it('every villager has 1–2 compatible traits', () => {
    const sim = sandbox();
    for (const v of sim.state.villagers) {
      expect(v.traits.length).toBeGreaterThanOrEqual(1);
      expect(v.traits.length).toBeLessThanOrEqual(2);
      expect(v.traits.includes('brave') && v.traits.includes('cowardly')).toBe(false);
    }
  });
});

describe('history and notifications', () => {
  it('bounds the history book and collapses same-day duplicates', () => {
    const sim = sandbox();
    for (let i = 0; i < 120; i++) sim.history.add(`Event ${i}`, 'x');
    expect(sim.state.history.length).toBe(CONFIG.culture.maxHistory);
    expect(sim.history.add('Event 119', 'again')).toBeNull();
  });

  it('shows at most two notifications, groups duplicates and prioritizes', () => {
    const q = new NotificationQueue(2, 6);
    expect(q.push('A', 'info', 1, 0)).toBe('shown');
    expect(q.push('B', 'info', 1, 0)).toBe('shown');
    expect(q.push('C', 'info', 1, 0)).toBe('queued');
    expect(q.push('C', 'info', 1, 0.1)).toBe('grouped');
    expect(q.waiting[0].count).toBe(2);
    expect(q.push('URGENT', 'bad', 3, 0.2)).toBe('shown');
    expect(q.visible.length).toBe(2);
    expect(q.visible.some((n) => n.text === 'URGENT')).toBe(true);
    for (let i = 0; i < 20; i++) q.push(`spam ${i}`, 'info', 0, 0.3);
    expect(q.waiting.length).toBeLessThanOrEqual(6);
    q.tick(20);
    expect(q.visible.length).toBeLessThanOrEqual(2);
    q.tick(60);
    q.tick(120);
    expect(q.waiting.filter((n) => n.priority <= 1).length).toBe(0); // stale low-priority items expire
  });
});

describe('save compatibility', () => {
  it('loads a version 0.1 save and fills every new field', () => {
    const terrain = new TerrainData(SEED);
    const v2 = createInitialState(SEED, terrain);
    // Rebuild what a v0.1 save looked like: no culture layer at all.
    const v1 = JSON.parse(JSON.stringify(v2)) as Record<string, unknown> & GameStateData;
    v1.version = 1;
    for (const key of ['rocks', 'memories', 'religions', 'sacred', 'mutations', 'history', 'culture']) delete v1[key];
    delete (v1.cooldowns as Record<string, number>).mutation;
    for (const v of v1.villagers as unknown as Array<Record<string, unknown>>) {
      for (const key of ['traits', 'religionId', 'memoryIds', 'mutation', 'title']) delete v[key];
    }
    const store = new MemoryStore();
    store.setItem('gods-intern.save', JSON.stringify({ version: 1, savedAt: 0, state: v1 }));
    const loaded = new SaveManager(store).load();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const sim = new Simulation(SEED, loaded.state);
    const s = sim.state;
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.rocks.length).toBeGreaterThan(5);
    expect(s.culture.festivals).toEqual([]);
    expect(s.cooldowns.mutation).toBe(0);
    for (const v of s.villagers) {
      expect(v.traits.length).toBeGreaterThan(0);
      expect(v.religionId).toBeNull();
      expect(v.memoryIds).toEqual([]);
    }
    run(sim, 30);
    expect(Number.isFinite(s.villages[0].water)).toBe(true);
  });
});

describe('long-run culture soak', () => {
  it('stays bounded and stable over 20 minutes with weekly chaos', () => {
    const sim = sandbox();
    const v = village(sim);
    for (let minute = 0; minute < 20; minute++) {
      // A little meddling every minute, varied by the minute.
      const tree = sim.state.trees.find((t) => !t.charred && t.growth >= 1 && t.id % 20 === minute % 20);
      if (minute % 3 === 0) sim.powers.activate('rain', v.centerX, v.centerZ);
      if (minute % 4 === 1 && tree) sim.powers.activate('lightning', tree.x, tree.z);
      if (minute % 5 === 2) sim.powers.activate('nature', v.centerX - 6 + minute * 0.3, v.centerZ + 6);
      if (minute % 6 === 3 && tree) sim.powers.activate('mutation', tree.x, tree.z);
      for (const k of Object.keys(sim.state.cooldowns) as Array<keyof typeof sim.state.cooldowns>) sim.state.cooldowns[k] = 0;
      run(sim, 60);
    }
    const s = sim.state;
    expect(s.memories.length).toBeLessThanOrEqual(CONFIG.culture.maxMemories);
    expect(s.history.length).toBeLessThanOrEqual(CONFIG.culture.maxHistory);
    expect(s.religions.filter((r) => r.active).length).toBeLessThanOrEqual(CONFIG.culture.maxReligions);
    expect(s.sacred.length).toBeLessThanOrEqual(CONFIG.culture.maxSacred);
    expect(v.population).toBeGreaterThan(8);
    for (const p of s.villagers) expect(Number.isFinite(p.position.x)).toBe(true);
  });
});
