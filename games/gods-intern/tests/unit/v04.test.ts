import { describe, expect, it } from 'vitest';
import { CONFIG, POWER_ORDER, type PowerId } from '../../src/core/Config';
import type { GameStateData } from '../../src/core/types';
import { RANK_TITLES, rankForXp } from '../../src/career/CareerSystem';
import { COMBOS } from '../../src/powers/ComboSystem';
import { CHALLENGES } from '../../src/civ/ChallengeDefinitions';
import { MemoryStore, SaveManager, slotKey } from '../../src/persistence/SaveManager';
import { Simulation } from '../../src/simulation/SimulationManager';
import { SAVE_VERSION } from '../../src/world/WorldGen';

const DT = 1 / CONFIG.sim.hz;
const SEED = 42;
const run = (sim: Simulation, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) sim.step(DT);
};

/** Career Mode, training finished, daytime. */
function career(): Simulation {
  const sim = new Simulation(SEED);
  sim.state.tutorial.done = true;
  sim.powers.unlock(['rain', 'lightning', 'nature', 'fire']);
  sim.state.time = CONFIG.time.dayLength * 0.4;
  sim.missions.autoGenerate = false;
  return sim;
}

/** Creative Mode (every power), unlimited energy, daytime. */
function creative(): Simulation {
  const sim = career();
  sim.state.mode = 'creative';
  sim.applyMode();
  sim.unlimitedEnergy = true;
  return sim;
}

function act(sim: Simulation, id: PowerId, x: number, z: number) {
  sim.state.cooldowns[id] = 0;
  return sim.powers.activate(id, x, z);
}

/** First valid target spiralling out from a preferred point. */
function spot(sim: Simulation, id: PowerId, x: number, z: number): { x: number; z: number } {
  for (let k = 0; k < 120; k++) {
    const a = k * 2.4;
    const r = k * 0.7;
    const px = x + Math.cos(a) * r;
    const pz = z + Math.sin(a) * r;
    sim.state.cooldowns[id] = 0;
    if (sim.powers.check(id, px, pz).ok) return { x: px, z: pz };
  }
  throw new Error(`no valid ${id} target near ${x},${z}`);
}

function reload(sim: Simulation): Simulation {
  const store = new MemoryStore();
  const mgr = new SaveManager(store);
  expect(mgr.save(sim.state)).toBe(true);
  const res = mgr.load();
  if (!res.ok) throw new Error('load failed');
  return new Simulation(SEED, res.state);
}

const v1 = (sim: Simulation) => sim.village('v1')!;

// ---------------------------------------------------------------------------

describe('v0.4 Heavenly Career', () => {
  it('awards XP for meaningful events, deduplicated and rate limited', () => {
    const sim = career();
    run(sim, 0.2); // training bonus
    const base = sim.state.career.xp;
    expect(base).toBe(25);
    // Same key twice: once only.
    expect(sim.career.award('prayer:test', 25, 'x', { once: true })).toBe(25);
    expect(sim.career.award('prayer:test', 25, 'x', { once: true })).toBe(0);
    // Window: at most 5 rescues per minute, then it opens again.
    let got = 0;
    for (let i = 0; i < 9; i++) got += sim.career.award('rescue', 4, 'x', { window: 60, max: 5 });
    expect(got).toBe(20);
    sim.state.time += 61;
    expect(sim.career.award('rescue', 4, 'x', { window: 60, max: 5 })).toBe(4);
    // First use of a power is worth XP once, repeated clicks are not.
    const before = sim.state.career.xp;
    const p = v1(sim);
    act(sim, 'nature', p.centerX + 20, p.centerZ);
    const afterFirst = sim.state.career.xp;
    for (let i = 0; i < 5; i++) {
      const at = spot(sim, 'nature', p.centerX + 22 + i * 2, p.centerZ + 6);
      act(sim, 'nature', at.x, at.z);
    }
    // (Other real XP can arrive at the same time, e.g. a consequence chain; the first-use award itself is once.)
    expect(afterFirst - before).toBeGreaterThanOrEqual(10);
    expect(sim.state.career.awarded['first-use:nature'].n).toBe(1);
    // Real events: an answered prayer awards once per prayer id.
    sim.bus.emit('PRAYER_COMPLETED', { prayer: { id: 'pr-1', type: 'THIRST', villageId: 'v1', data: {}, reward: 0 } as never });
    sim.bus.emit('PRAYER_COMPLETED', { prayer: { id: 'pr-1', type: 'THIRST', villageId: 'v1', data: {}, reward: 0 } as never });
    const x0 = sim.state.career.xp;
    sim.bus.emit('PRAYER_COMPLETED', { prayer: { id: 'pr-2', type: 'THIRST', villageId: 'v1', data: {}, reward: 0 } as never });
    sim.bus.emit('PRAYER_COMPLETED', { prayer: { id: 'pr-2', type: 'THIRST', villageId: 'v1', data: {}, reward: 0 } as never });
    expect(sim.state.career.xp - x0).toBe(25 + 10);
  });

  it('maps XP to the ten rank thresholds and promotes through each rank once', () => {
    const t = CONFIG.career.thresholds;
    expect(t).toEqual([0, 100, 250, 450, 750, 1150, 1700, 2400, 3300, 4500]);
    expect(rankForXp(0)).toBe(1);
    expect(rankForXp(99)).toBe(1);
    expect(rankForXp(100)).toBe(2);
    expect(rankForXp(4499)).toBe(9);
    expect(rankForXp(4500)).toBe(10);
    expect(rankForXp(99999)).toBe(10);
    expect(RANK_TITLES[9]).toBe('God of Questionable Decisions');
    const sim = career();
    run(sim, 0.2);
    const promoted: number[] = [];
    sim.bus.on('PROMOTED', (e) => promoted.push(e.rank));
    sim.career.award('big', 800, 'test'); // 825 XP → rank 5, ranks 2..5 each announced once
    expect(sim.state.career.rank).toBe(5);
    expect(promoted).toEqual([2, 3, 4, 5]);
    expect(sim.state.history.filter((h) => h.kind === 'career').length).toBe(4);
  });

  it('unlocks powers by rank in Career Mode and explains locks', () => {
    const sim = career();
    run(sim, 0.2);
    expect(sim.state.unlockedPowers).not.toContain('tornado');
    expect(sim.powers.lockReason('tornado')).toMatch(/rank 2/);
    expect(act(sim, 'tornado', 0, 0).ok).toBe(false);
    sim.career.award('t1', 80, 'test'); // 105 XP → rank 2
    expect(sim.state.unlockedPowers).toContain('tornado');
    expect(sim.state.unlockedPowers).not.toContain('freeze');
    sim.career.award('t2', 400, 'test'); // rank 4: freeze, gravity and mutation
    for (const id of ['freeze', 'gravity', 'mutation'] as PowerId[]) expect(sim.state.unlockedPowers).toContain(id);
    expect(sim.state.unlockedPowers).not.toContain('terraform');
    // Creative Mode has everything.
    expect(creative().state.unlockedPowers.sort()).toEqual([...POWER_ORDER].sort());
  });

  it('rank 10 grants Divine Overtime, cosmetics and a final review; overtime is bounded', () => {
    const sim = career();
    run(sim, 0.2);
    const msgs: string[] = [];
    sim.bus.on('HEAVEN_MESSAGE', (e) => msgs.push(e.text));
    sim.career.award('top', 5000, 'test');
    expect(sim.state.career.rank).toBe(10);
    expect(sim.state.civ.cosmetics).toEqual(expect.arrayContaining(['cosmic-aura', 'golden-badge', 'god-monument']));
    expect(msgs.some((m) => m.includes('EXTENDING MY VACATION INDEFINITELY'))).toBe(true);
    for (const id of POWER_ORDER) expect(sim.state.unlockedPowers).toContain(id);
    expect(sim.career.startOvertime()).toBe(true);
    expect(sim.career.startOvertime()).toBe(false); // not while active
    expect(sim.powers.cooldownFor('rain')).toBeCloseTo(CONFIG.powers.rain.cooldown * 0.25, 5);
    sim.state.energy = 0;
    run(sim, 1);
    // (challenge rewards may add more energy on top; regeneration alone is ×4)
    expect(sim.state.energy).toBeGreaterThanOrEqual(CONFIG.energy.regen * CONFIG.career.overtime.regenMult * 0.95);
    run(sim, CONFIG.career.overtime.duration);
    expect(sim.career.overtimeActive()).toBe(false);
    expect(sim.powers.cooldownFor('rain')).toBe(CONFIG.powers.rain.cooldown);
    expect(sim.career.overtimeAvailable()).toBe(false); // recharging
    // The sandbox continues: nothing ends at rank 10.
    run(sim, 5);
    expect(sim.state.villages.every((v) => v.population > 0)).toBe(true);
  });

  it('keeps Creative Mode separate from career progress', () => {
    const sim = creative();
    run(sim, 0.5);
    expect(sim.state.career.xp).toBe(0);
    expect(sim.career.award('anything', 500, 'x')).toBe(0);
    act(sim, 'rain', 0, 10);
    run(sim, 2);
    expect(sim.state.career.xp).toBe(0);
    expect(sim.state.career.rank).toBe(1);
    // Challenges do not run in Creative Mode.
    expect(Object.values(sim.state.civ.challenges).every((c) => c.status === 'locked')).toBe(true);
    // Separate save slots; Career keeps the original keys.
    expect(slotKey('career', false)).toBe('gods-intern.save');
    expect(slotKey('career', true)).toBe('gods-intern.autosave');
    expect(slotKey('creative', false)).not.toBe(slotKey('career', false));
    expect(slotKey('creative', true)).not.toBe(slotKey('career', true));
  });
});

describe('v0.4 powers', () => {
  it('rejects invalid targets without spending energy', () => {
    const sim = creative();
    sim.unlimitedEnergy = false;
    sim.state.energy = 100;
    const r = sim.village('v3')!;
    const cases: Array<[PowerId, number, number]> = [
      ['tornado', 200, 0], // off the island
      ['terraform', r.centerX, r.centerZ], // plaza buildings protected
      ['possession', 70, -70], // nobody there
      ['resurrection', 0, 0], // no grave
      ['meteor', 500, 500],
    ];
    for (const [id, x, z] of cases) {
      const res = act(sim, id, x, z);
      expect(res.ok).toBe(false);
      expect(res.reason).toBeTruthy();
    }
    expect(sim.state.energy).toBe(100);
  });

  it('Tornado wanders, scares villagers, damages within reach, scatters rocks onto land, and ends', () => {
    const sim = creative();
    const p = v1(sim);
    const at = spot(sim, 'tornado', p.centerX + 12, p.centerZ);
    let damage = 0;
    sim.bus.on('TORNADO_DAMAGE', (e) => (damage += e.buildings + e.trees));
    const health0 = sim.state.buildings.map((b) => b.health);
    expect(act(sim, 'tornado', at.x, at.z).ok).toBe(true);
    expect(act(sim, 'tornado', at.x, at.z).ok).toBe(false); // one at a time
    const e = sim.state.effects.find((x) => x.kind === 'tornado')!;
    const start = { x: e.x, z: e.z };
    run(sim, 3);
    expect(Math.hypot(e.x - start.x, e.z - start.z)).toBeGreaterThan(4);
    expect(sim.state.villagers.some((v) => v.currentTask.state === 'FLEEING')).toBe(true);
    run(sim, CONFIG.powers.tornado.duration);
    expect(sim.state.effects.some((x) => x.kind === 'tornado')).toBe(false);
    // Bounded: buildings far from the track are untouched; every rock is still on land.
    const far = sim.state.buildings.filter((b) => Math.hypot(b.x - at.x, b.z - at.z) > 70);
    for (const b of far) expect(b.health).toBe(health0[b.id]);
    for (const rock of sim.state.rocks) expect(sim.terrain.isLand(rock.x, rock.z)).toBe(true);
    expect(damage).toBeGreaterThan(0);
    // Navigation still works across the island.
    const d = sim.village('v2')!;
    expect(sim.pathfinding.findPath(p.centerX, p.centerZ, d.centerX, d.centerZ, 12000)).not.toBeNull();
  });

  it('Freeze puts out fire (byFreeze), pauses crops and thaws on its own', () => {
    const sim = creative();
    const p = v1(sim);
    const farm = sim.building(p.farmIds[0])!;
    const tree = sim.treesNear(farm.x, farm.z, 20, []).find((t) => !t.charred && t.growth >= 1)!;
    sim.fire.ignite(sim, 'tree', tree.id, true);
    let byFreeze = false;
    sim.bus.on('FIRE_EXTINGUISHED', (e) => (byFreeze ||= !!e.byFreeze));
    run(sim, 1);
    act(sim, 'freeze', (farm.x + tree.x) / 2, (farm.z + tree.z) / 2);
    const e = sim.state.effects.find((x) => x.kind === 'freeze')!;
    e.radius = Math.max(e.radius, Math.hypot(farm.x - tree.x, farm.z - tree.z) / 2 + 4);
    run(sim, 3);
    expect(byFreeze).toBe(true);
    expect(sim.state.fires.length).toBe(0);
    const g0 = farm.cropGrowth;
    run(sim, 4);
    expect(farm.cropGrowth).toBe(g0); // paused under frost
    expect(sim.effects.freezeAt(farm.x, farm.z)).toBeGreaterThan(0);
    run(sim, CONFIG.powers.freeze.duration);
    expect(sim.effects.freezeAt(farm.x, farm.z)).toBe(0); // thawed
    run(sim, 10);
    expect(farm.cropGrowth).toBeGreaterThan(g0);
  });

  it('Gravity levitates villagers once each and always sets them back down', () => {
    const sim = creative();
    const d = sim.village('v2')!;
    const floated = new Set<string>();
    sim.bus.on('VILLAGER_LEVITATED', (e) => {
      expect(floated.has(e.villagerId)).toBe(false);
      floated.add(e.villagerId);
    });
    act(sim, 'gravity', d.centerX, d.centerZ);
    run(sim, 4);
    expect(floated.size).toBeGreaterThan(0);
    expect(Math.max(...sim.state.villagers.map((v) => v.lift ?? 0))).toBeGreaterThan(0.8);
    run(sim, CONFIG.powers.gravity.duration + 4);
    expect(sim.state.villagers.every((v) => !v.lift)).toBe(true);
    for (const v of sim.state.villagers) expect(Number.isFinite(v.position.y)).toBe(true);
  });

  it('Terraform raises and lowers land within limits, protects buildings, keeps navigation and persists', () => {
    const sim = creative();
    const r = sim.village('v3')!;
    const at = spot(sim, 'terraform', r.centerX + 20, r.centerZ + 12);
    const h0 = sim.terrain.heightAt(at.x, at.z);
    expect(act(sim, 'terraform', at.x, at.z).ok).toBe(true);
    // Bilinear sampling between vertices: within a few percent of the full step.
    expect(sim.terrain.heightAt(at.x, at.z) - h0).toBeGreaterThan(CONFIG.powers.terraform.step * 0.85);
    // Ground entities follow the terrain.
    for (const v of sim.state.villagers) {
      if (Math.hypot(v.position.x - at.x, v.position.z - at.z) < 3) expect(v.position.y).toBeCloseTo(sim.terrain.walkHeightAt(v.position.x, v.position.z), 3);
    }
    // Limit: total change per spot is bounded.
    let ok = 0;
    for (let i = 0; i < 10; i++) if (act(sim, 'terraform', at.x, at.z).ok) ok++;
    expect(ok).toBeLessThan(10);
    expect(sim.terrain.heightAt(at.x, at.z) - h0).toBeLessThanOrEqual(CONFIG.powers.terraform.maxDelta + 1e-6);
    // Buildings are protected.
    const b = sim.building(r.houseIds[0])!;
    expect(act(sim, 'terraform', b.x, b.z).ok).toBe(false);
    // Navigation: villages remain connected; walkability was refreshed locally.
    const p = v1(sim);
    expect(sim.pathfinding.findPath(r.centerX, r.centerZ, p.centerX, p.centerZ, 12000)).not.toBeNull();
    // Persistence: the same terrain after save/load.
    const hNow = sim.terrain.heightAt(at.x, at.z);
    const loaded = reload(sim);
    expect(loaded.state.terrainEdits.length).toBe(sim.state.terrainEdits.length);
    expect(loaded.terrain.heightAt(at.x, at.z)).toBeCloseTo(hNow, 5);
  });

  it('Time Warp scales local time only (growth, walking), never the global step', () => {
    const sim = creative();
    const p = v1(sim);
    const at = spot(sim, 'timewarp', p.centerX + 18, p.centerZ - 10);
    act(sim, 'timewarp', at.x, at.z);
    expect(sim.effects.timeFactor(at.x, at.z)).toBeCloseTo(CONFIG.powers.timewarp.fast, 5);
    expect(sim.effects.timeFactor(at.x + 40, at.z)).toBe(1);
    const plantNear = (x: number, z: number, maxR: number) => {
      for (let k = 0; k < 80; k++) {
        const a = k * 2.4;
        const rr = (k / 80) * maxR;
        const t = sim.plantTree(x + Math.cos(a) * rr, z + Math.sin(a) * rr, false);
        if (t) return t;
      }
      throw new Error('no tree spot');
    };
    const inside = plantNear(at.x, at.z, 4);
    const outside = plantNear(at.x + 34, at.z, 8);
    expect(sim.effects.timeFactor(outside.x, outside.z)).toBe(1);
    const t0 = sim.state.time;
    run(sim, 1);
    expect(sim.state.time - t0).toBeCloseTo(1, 5); // global clock unchanged
    const gIn = inside.growth - 0.05;
    const gOut = outside.growth - 0.05;
    expect(gIn / gOut).toBeCloseTo(CONFIG.powers.timewarp.fast, 1);
    sim.powers.timewarp.mode = 'slow';
    run(sim, CONFIG.powers.timewarp.duration);
    const at2 = spot(sim, 'timewarp', at.x, at.z);
    act(sim, 'timewarp', at2.x, at2.z);
    expect(sim.effects.timeFactor(at2.x, at2.z)).toBeCloseTo(CONFIG.powers.timewarp.slow, 5);
  });

  it('Possession suspends the AI, steers within walkable ground, visits villages and restores autonomy', () => {
    const sim = creative();
    const v = sim.state.villagers.find((x) => x.villageId === 'v1' && x.age > 16 && x.alive)!;
    expect(act(sim, 'possession', v.position.x, v.position.z).ok).toBe(true);
    expect(sim.state.possession?.villagerId).toBe(v.id);
    expect(act(sim, 'rain', 0, 0).ok).toBe(false); // busy being a villager
    const x0 = v.position.x;
    const z0 = v.position.z;
    // Walk toward the open plaza.
    const p1 = v1(sim);
    sim.possession.steer(p1.centerX + 2 - x0, p1.centerZ - 3 - z0);
    run(sim, 2);
    expect(Math.hypot(v.position.x - x0, v.position.z - z0)).toBeGreaterThan(2);
    expect(v.currentTask.activity).toBe('possessed');
    for (let i = 0; i < 40; i++) {
      run(sim, 0.25);
      expect(sim.pathfinding.isWalkable(v.position.x, v.position.z)).toBe(true);
    }
    sim.possession.end();
    expect(sim.state.possession).toBeNull();
    run(sim, 6);
    expect(v.currentTask.activity).not.toBe('possessed');
    // Automatic end after the duration; saving mid-possession resumes it.
    act(sim, 'possession', v.position.x, v.position.z);
    const loaded = reload(sim);
    expect(loaded.state.possession?.villagerId).toBe(v.id);
    run(loaded, CONFIG.powers.possession.duration + 1);
    expect(loaded.state.possession).toBeNull();
  });

  it('Meteor warns, then impacts once with bounded damage, a crater and a sacred fragment', () => {
    const sim = creative();
    const r = sim.village('v3')!;
    const at = spot(sim, 'meteor', r.centerX + 16, r.centerZ - 12);
    const health0 = sim.state.buildings.map((b) => b.health);
    const rocks0 = sim.state.rocks.length;
    let impacts = 0;
    sim.bus.on('METEOR_IMPACT', () => impacts++);
    act(sim, 'meteor', at.x, at.z);
    run(sim, CONFIG.powers.meteor.warning - 0.5);
    expect(impacts).toBe(0); // warning first
    // Saving during the warning: it still lands after loading.
    const loaded = reload(sim);
    let loadedImpacts = 0;
    loaded.bus.on('METEOR_IMPACT', () => loadedImpacts++);
    run(loaded, 2);
    expect(loadedImpacts).toBe(1);
    run(sim, 10);
    expect(impacts).toBe(1);
    expect(sim.state.rocks.length).toBe(rocks0 + 1);
    expect(sim.state.rocks[rocks0].meteorite).toBe(true);
    expect(sim.state.craters.length).toBe(1);
    const R = CONFIG.powers.meteor.radius;
    for (const b of sim.state.buildings) {
      if (Math.hypot(b.x - at.x, b.z - at.z) - b.footprint > R + 25) expect(b.health).toBe(health0[b.id]);
    }
    expect(sim.state.villages.every((v) => v.population > 0)).toBe(true); // never wipes the island
  });

  it('Resurrection restores the same individual once, from a bounded graveyard, within the population cap', () => {
    const sim = creative();
    const v = sim.state.villagers.find((x) => x.villageId === 'v2' && x.alive && x.age > 16)!;
    v.traits = ['dramatic', 'devout'];
    v.memoryIds = ['m-keep'];
    const snapshot = { id: v.id, name: v.name, village: v.villageId, traits: [...v.traits] };
    sim.ai.kill(sim, v, 'a rogue cabbage', false);
    run(sim, 40); // the body is pruned from the world
    expect(sim.villager(v.id)).toBeUndefined();
    const g = sim.state.graveyard.find((x) => x.villager.id === v.id)!;
    expect(g).toBeTruthy();
    const count = sim.state.villagers.length;
    expect(act(sim, 'resurrection', g.x, g.z).ok).toBe(true);
    const back = sim.villager(snapshot.id)!;
    expect(back.alive).toBe(true);
    expect(back.name).toBe(snapshot.name);
    expect(back.villageId).toBe(snapshot.village);
    expect(back.traits).toEqual(snapshot.traits);
    for (const m of g.villager.memoryIds) expect(back.memoryIds).toContain(m); // everything they remembered at death
    expect(back.memoryIds).toContain('m-keep');
    expect(back.resurrected).toBe(true);
    expect(sim.state.villagers.length).toBe(count + 1);
    expect(sim.state.villagers.filter((x) => x.id === snapshot.id).length).toBe(1);
    expect(sim.state.graveyard.some((x) => x.villager.id === v.id)).toBe(false);
    expect(sim.pathfinding.isWalkable(back.position.x, back.position.z)).toBe(true);
    // Graves expire and are bounded.
    for (let i = 0; i < 15; i++) {
      const w = sim.state.villagers.find((x) => x.alive && x.villageId === 'v1' && x.id !== back.id)!;
      sim.ai.kill(sim, w, 'test', false);
    }
    expect(sim.state.graveyard.length).toBeLessThanOrEqual(CONFIG.powers.resurrection.maxGraves);
    sim.state.time += CONFIG.powers.resurrection.graveTtl + 1;
    expect(sim.resurrect.graveNear(sim.state.graveyard[0]?.x ?? 0, sim.state.graveyard[0]?.z ?? 0, 4)).toBeNull();
    // Population cap.
    const cap = CONFIG.civ.populationCap;
    (CONFIG.civ as { populationCap: number }).populationCap = 5;
    const w2 = sim.state.villagers.find((x) => x.alive)!;
    sim.ai.kill(sim, w2, 'test', false);
    const g2 = sim.state.graveyard[sim.state.graveyard.length - 1];
    expect(act(sim, 'resurrection', g2.x, g2.z).reason).toBe('The island is full');
    (CONFIG.civ as { populationCap: number }).populationCap = cap;
  });
});

describe('v0.4 combinations, challenges and messages', () => {
  it('offers at least 12 discoverable combinations, each awarded once', () => {
    expect(COMBOS.length).toBeGreaterThanOrEqual(12);
    const sim = career();
    run(sim, 0.2);
    const xp0 = sim.state.career.xp;
    expect(sim.combos.trigger('rain-fire', 0, 0)).toBe(true);
    expect(sim.combos.trigger('rain-fire', 0, 0)).toBe(false);
    expect(sim.state.career.xp - xp0).toBe(COMBOS.find((c) => c.id === 'rain-fire')!.xp);
    expect(sim.state.history.some((h) => h.kind === 'discovery')).toBe(true);
  });

  it('detects real interactions: Freeze + Fire, Freeze + Rain, Gravity + Lightning, Rain + Nature, Fire + Nature', () => {
    const sim = creative();
    const p = v1(sim);
    const found = () => sim.state.discoveries.map((d) => d.id);
    // Fire into frost → steam and a faster thaw.
    const frostAt = spot(sim, 'freeze', p.centerX + 18, p.centerZ - 8);
    act(sim, 'freeze', frostAt.x, frostAt.z);
    const frost = sim.state.effects.find((e) => e.kind === 'freeze')!;
    const until = frost.until;
    act(sim, 'fire', frostAt.x + 1, frostAt.z);
    expect(found()).toContain('steam-thaw');
    expect(frost.until).toBeLessThan(until);
    // Rain into frost → wider frost.
    const r0 = frost.radius;
    act(sim, 'rain', frostAt.x, frostAt.z);
    expect(found()).toContain('permafrost');
    expect(frost.radius).toBeGreaterThan(r0);
    // Lightning inside a gravity field.
    const g = spot(sim, 'gravity', p.centerX - 15, p.centerZ - 14);
    act(sim, 'gravity', g.x, g.z);
    act(sim, 'lightning', g.x + 1, g.z + 1);
    expect(found()).toContain('ball-lightning');
    // Nature under a rain cloud grows faster.
    const n = spot(sim, 'nature', p.centerX + 24, p.centerZ + 10);
    act(sim, 'rain', n.x, n.z);
    act(sim, 'nature', n.x, n.z);
    expect(found()).toContain('monsoon-garden');
    // Nature on a burned stump.
    const tree = sim.state.trees.find((t) => {
      if (t.removed || t.growth < 1 || t.golden || Math.hypot(t.x - p.centerX, t.z - p.centerZ) < 25) return false;
      t.charred = true;
      sim.state.cooldowns.nature = 0;
      const ok = sim.powers.check('nature', t.x, t.z).ok;
      t.charred = false;
      return ok;
    })!;
    tree.charred = true;
    tree.burning = false;
    expect(act(sim, 'nature', tree.x, tree.z).ok).toBe(true);
    expect(found()).toContain('phoenix-forest');
  });

  it('adds ten v0.4 challenges with working objectives (Cold Reception, Clerical Error, Astronaut, Geography)', () => {
    expect(CHALLENGES.length).toBe(30);
    const sim = career();
    run(sim, 0.2);
    sim.career.award('fast-track', 4500, 'test'); // all powers through the real promotion path
    // Pretend three challenges are done so the hard tier gates are open (unlock rule, not completion).
    run(sim, 1);
    sim.unlimitedEnergy = true;
    const p = v1(sim);
    // Cold Reception.
    const tree = sim.treesNear(p.centerX + 20, p.centerZ, 15, []).find((t) => !t.charred && t.growth >= 1)!;
    sim.fire.ignite(sim, 'tree', tree.id, true);
    run(sim, 1);
    act(sim, 'freeze', tree.x, tree.z);
    run(sim, 4);
    // Unqualified Astronaut.
    const d = sim.village('v2')!;
    act(sim, 'gravity', d.centerX, d.centerZ);
    run(sim, 4);
    // Department of Geography.
    const r = sim.village('v3')!;
    for (let i = 0; i < 3; i++) {
      const at = spot(sim, 'terraform', r.centerX + 20 + i * 9, r.centerZ + 12);
      act(sim, 'terraform', at.x, at.z);
    }
    // Death Was a Clerical Error.
    const v = sim.state.villagers.find((x) => x.alive && x.villageId === 'v3')!;
    sim.ai.kill(sim, v, 'test', false);
    const g = sim.state.graveyard[sim.state.graveyard.length - 1];
    act(sim, 'resurrection', g.x, g.z);
    run(sim, 2);
    const st = (id: string) => sim.challenges.state(id).status;
    expect(st('cold-reception')).toBe('completed');
    expect(st('department-geography')).toBe('completed');
    expect(st('clerical-error')).toBe('completed');
    expect(sim.challenges.state('unqualified-astronaut').counters.floaters ?? 0).toBeGreaterThan(0);
    expect(st('employee-of-the-month')).toBe('completed'); // rank ≥ 5
  });

  it('sends contextual heavenly mail with dedupe, spacing and a bounded archive', () => {
    const sim = career();
    run(sim, 0.2);
    const h = sim.heaven;
    sim.state.time += 100;
    expect(h.send('a', 'X', 'one')).toBe(true);
    expect(h.send('a', 'X', 'one again')).toBe(false); // dedupe
    expect(h.send('b', 'X', 'too soon')).toBe(false); // spacing
    sim.state.time += 50;
    expect(h.send('b', 'X', 'two')).toBe(true);
    for (let i = 0; i < 40; i++) {
      sim.state.time += 50;
      h.send(`m${i}`, 'X', `msg ${i}`);
    }
    expect(sim.state.heaven.archive.length).toBe(30);
    // State-driven template: plant trees → the Department of Creation wants them back.
    const s2 = career();
    run(s2, 0.2);
    s2.state.stats.treesPlanted = 30;
    s2.state.time += 100;
    run(s2, 11);
    expect(s2.state.heaven.archive.some((m) => m.text.includes('WOULD LIKE ITS 30 TREES BACK'))).toBe(true);
  });

  it('runs cultural events in the village where they start (Drizzleville gets its own Forbidden Well)', () => {
    const sim = creative();
    const d = sim.village('v2')!;
    const well = sim.building(d.wellId)!;
    sim.state.culture.lastMajorEvent = -9999;
    // Beside the well, away from the plaza rock (which would crown a Rock King instead).
    act(sim, 'lightning', well.x - 4, well.z + 2);
    run(sim, 0.5);
    const cw = sim.state.culture.cursedWell;
    expect(cw?.villageId).toBe('v2');
    for (const id of cw!.believers) expect(sim.villager(id)?.villageId).toBe('v2');
    expect(sim.state.history.some((x) => x.title.includes('Drizzleville'))).toBe(true);
  });
});

describe('v0.4 saves and stability', () => {
  it('migrates a v0.3 save to v4 without resetting anything', () => {
    const sim = career();
    run(sim, 30);
    const s = JSON.parse(JSON.stringify(sim.state)) as GameStateData & Record<string, unknown>;
    for (const k of ['mode', 'career', 'effects', 'terrainEdits', 'graveyard', 'discoveries', 'possession', 'heaven', 'craters']) delete s[k];
    for (const id of ['tornado', 'freeze', 'gravity', 'terraform', 'timewarp', 'possession', 'meteor', 'resurrection']) delete (s.cooldowns as Record<string, number>)[id];
    s.version = 3;
    const store = new MemoryStore();
    store.setItem('gods-intern.save', JSON.stringify({ version: 3, savedAt: 0, state: s }));
    const res = new SaveManager(store).load();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const loaded = new Simulation(SEED, res.state);
    const l = loaded.state;
    expect(l.version).toBe(SAVE_VERSION);
    expect(l.mode).toBe('career');
    expect(l.career.rank).toBe(1);
    expect(l.villagers.length).toBe(sim.state.villagers.length);
    expect(l.villages.map((v) => v.food)).toEqual(sim.state.villages.map((v) => v.food));
    expect(l.history.length).toBe(sim.state.history.length);
    for (const id of POWER_ORDER) expect(typeof l.cooldowns[id]).toBe('number');
    run(loaded, 20);
    expect(l.villages.every((v) => Number.isFinite(v.water))).toBe(true);
  });

  it('saves active effects safely and restores them for their remaining time', () => {
    const sim = creative();
    const p = v1(sim);
    const t = spot(sim, 'tornado', p.centerX + 12, p.centerZ);
    act(sim, 'tornado', t.x, t.z);
    const f = spot(sim, 'freeze', p.centerX - 15, p.centerZ - 10);
    act(sim, 'freeze', f.x, f.z);
    run(sim, 2);
    const loaded = reload(sim);
    expect(loaded.state.effects.map((e) => e.kind).sort()).toEqual(['freeze', 'tornado']);
    run(loaded, 40);
    expect(loaded.state.effects.length).toBe(0);
    expect(new Set(loaded.state.villagers.map((v) => v.id)).size).toBe(loaded.state.villagers.length);
  });

  it('stays bounded over 20 simulated minutes of using every power', () => {
    const sim = creative();
    const order: PowerId[] = ['tornado', 'freeze', 'gravity', 'terraform', 'timewarp', 'rain', 'lightning', 'meteor', 'nature', 'fire', 'mutation'];
    for (let minute = 0; minute < 20; minute++) {
      const v = sim.state.villages[minute % 3];
      const id = order[minute % order.length];
      try {
        const at = spot(sim, id, v.centerX + 14, v.centerZ - 10);
        act(sim, id, at.x, at.z);
      } catch {
        /* no valid target this minute */
      }
      run(sim, 60);
      const s = sim.state;
      expect(s.effects.length).toBeLessThanOrEqual(CONFIG.career.maxEffects);
      expect(s.graveyard.length).toBeLessThanOrEqual(CONFIG.powers.resurrection.maxGraves);
      expect(s.terrainEdits.length).toBeLessThanOrEqual(80);
      expect(s.heaven.archive.length).toBeLessThanOrEqual(30);
      expect(s.villagers.filter((x) => x.alive).length).toBeLessThanOrEqual(CONFIG.civ.populationCap + 12);
      expect(new Set(s.villagers.map((x) => x.id)).size).toBe(s.villagers.length);
      for (const x of s.villagers) {
        expect(Number.isFinite(x.position.x) && Number.isFinite(x.position.y) && Number.isFinite(x.position.z)).toBe(true);
      }
      for (const vv of s.villages) for (const r of ['food', 'water', 'wood', 'stone'] as const) expect(Number.isFinite(vv[r])).toBe(true);
    }
  }, 120000);
});
