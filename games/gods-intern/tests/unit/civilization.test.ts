import { describe, expect, it } from 'vitest';
import { SAVE_VERSION } from '../../src/world/WorldGen';
import { CONFIG } from '../../src/core/Config';
import type { GameStateData, ResourceKind, VillagerData } from '../../src/core/types';
import { RESOURCES } from '../../src/civ/CivilizationSystem';
import { CHALLENGE_BY_ID } from '../../src/civ/ChallengeDefinitions';
import { categoryOf, changeRelation, relation } from '../../src/civ/Relations';
import { MemoryStore, SaveManager } from '../../src/persistence/SaveManager';
import { Simulation } from '../../src/simulation/SimulationManager';

const DT = 1 / CONFIG.sim.hz;
const SEED = 42;

function run(sim: Simulation, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) sim.step(DT);
}

/** Step until the predicate holds (checked every simulated second). Returns whether it did. */
function runUntil(sim: Simulation, pred: () => boolean, maxSeconds: number): boolean {
  for (let t = 0; t < maxSeconds; t++) {
    if (pred()) return true;
    run(sim, 1);
  }
  return pred();
}

/** Tutorial finished, daytime, all powers, unlimited energy. Civilization automation is live. */
function ready(): Simulation {
  const sim = new Simulation(SEED);
  sim.state.tutorial.done = true;
  sim.powers.unlock(['rain', 'lightning', 'nature', 'fire', 'mutation']);
  sim.unlimitedEnergy = true;
  sim.state.time = CONFIG.time.dayLength * 0.4;
  return sim;
}

/** Daytime world where the civilization planners stay idle (tutorial not done) so tests control trips. */
function quiet(): Simulation {
  const sim = new Simulation(SEED);
  sim.state.time = CONFIG.time.dayLength * 0.4;
  sim.missions.autoGenerate = false;
  return sim;
}

/**
 * Freeze production and consumption so resource totals can only change through trade:
 * no needs, no farms/wells/births, and every villager is an idler (no mining, fishing or chopping).
 */
function freezeEconomy(sim: Simulation): void {
  (sim.needs as unknown as { update: () => void }).update = () => {};
  (sim.villagesSys as unknown as { update: () => void }).update = () => {};
  for (const v of sim.state.villagers) {
    v.hunger = 0;
    v.thirst = 0;
    v.job = 'idler';
  }
}

function totals(sim: Simulation): Record<ResourceKind, number> {
  const out = { food: 0, water: 0, wood: 0, stone: 0 } as Record<ResourceKind, number>;
  for (const v of sim.state.villages) for (const r of RESOURCES) out[r] += v[r];
  // Goods on the road still exist.
  for (const c of sim.state.civ.caravans) {
    out[c.cargo.resource] += c.cargo.amount;
    if (c.payment && c.phase === 'returning') out[c.payment.resource] += c.payment.amount;
  }
  return out;
}

const vil = (sim: Simulation, id: string) => sim.village(id)!;

function save(sim: Simulation): Simulation {
  const store = new MemoryStore();
  const mgr = new SaveManager(store);
  expect(mgr.save(sim.state)).toBe(true);
  const res = mgr.load();
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error('load failed');
  return new Simulation(SEED, res.state);
}

function uniqueIds(sim: Simulation): boolean {
  const ids = sim.state.villagers.map((v) => v.id);
  return new Set(ids).size === ids.length;
}

// ---------------------------------------------------------------------------

describe('v0.3 villages and economies', () => {
  it('1. initializes three distinct villages with 50 villagers and pairwise relations', () => {
    const sim = new Simulation(SEED);
    const s = sim.state;
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.villages.map((v) => v.name)).toEqual(['Puddleton', 'Drizzleville', 'Rockbottom']);
    const pop = (id: string) => s.villagers.filter((v) => v.alive && v.villageId === id).length;
    expect([pop('v1'), pop('v2'), pop('v3')]).toEqual([20, 16, 14]);
    expect(s.villagers.length).toBe(50);
    expect(uniqueIds(sim)).toBe(true);
    const [p, d, r] = s.villages;
    expect([p.identity.culture, d.identity.culture, r.identity.culture]).toEqual(['agricultural', 'riverside', 'mountain']);
    // Distinct identities shape the economy.
    expect(d.identity.wellRefill).toBeGreaterThan(p.identity.wellRefill);
    expect(d.identity.floodSensitivity).toBeGreaterThan(r.identity.floodSensitivity);
    expect(r.identity.farmYield).toBeLessThan(p.identity.farmYield);
    expect(r.identity.monumentDevotion).toBeGreaterThan(1);
    expect(r.identity.religiousTolerance).toBeLessThan(d.identity.religiousTolerance);
    expect(r.quarryIds.length).toBe(1);
    expect(d.fisheryIds.length).toBe(1);
    expect(r.stone).toBeGreaterThan(0);
    // Every building belongs to a village and is styled by its culture.
    for (const b of s.buildings) expect(b.style).toBe(sim.village(b.villageId)!.identity.culture);
    // Each village has its own well, storage and shrine.
    expect(new Set(s.villages.map((v) => v.wellId)).size).toBe(3);
    expect(Object.keys(s.civ.relations).sort()).toEqual(['v1|v2', 'v1|v3', 'v2|v3']);
    // All three villages are reachable over land (the river is crossed by the bridge).
    expect(sim.pathfinding.findPath(p.centerX, p.centerZ, d.centerX, d.centerZ, 12000)).not.toBeNull();
    expect(sim.pathfinding.findPath(p.centerX, p.centerZ, r.centerX, r.centerZ, 12000)).not.toBeNull();
  });

  it('2. keeps resources independent: wells, mining and stores never leak between villages', () => {
    const sim = quiet();
    const [p, d, r] = sim.state.villages;
    expect(p).not.toBe(d);
    // Soak only Drizzleville's well cell; only Drizzleville's water rises faster.
    for (const v of sim.state.villages) v.water = 20;
    const well = sim.building(d.wellId)!;
    sim.state.moisture[sim.cellIndex(well.x, well.z)] = 1;
    sim.villagesSys.update(sim, 5);
    expect(d.water - 20).toBeGreaterThan(p.water - 20 + 0.5);
    expect(p.water).toBeCloseTo(r.water * (p.identity.wellRefill / r.identity.wellRefill) - 20 * (p.identity.wellRefill / r.identity.wellRefill) + 20, 3);
    // A Rockbottom miner finishing work adds stone to Rockbottom only.
    const miner = sim.state.villagers.find((v) => v.villageId === 'v3' && v.job === 'miner')!;
    const stoneBefore = sim.state.villages.map((v) => v.stone);
    const quarry = sim.building(r.quarryIds[0])!;
    miner.position.x = quarry.x + quarry.footprint + 0.6;
    miner.position.z = quarry.z;
    sim.ai.assign(sim, miner, 'WORKING', 'mine', miner.position.x, miner.position.z, quarry.id, 0.01);
    run(sim, 0.2);
    expect(r.stone).toBeGreaterThan(stoneBefore[2]);
    expect(p.stone).toBe(stoneBefore[0]);
    expect(d.stone).toBe(stoneBefore[1]);
  });
});

describe('v0.3 relationships', () => {
  it('3. calculates bounded changes and structural targets from faith and trade', () => {
    const sim = quiet();
    const rec = relation(sim.state, 'v1', 'v2')!;
    const start = rec.score;
    // A single cause never moves the score more than relationStep.
    const applied = changeRelation(sim, 'v1', 'v2', 50, 'test');
    expect(applied).toBeCloseTo(CONFIG.civ.relationStep, 6);
    expect(rec.score).toBeCloseTo(start + CONFIG.civ.relationStep, 6);
    for (let i = 0; i < 60; i++) changeRelation(sim, 'v1', 'v2', 50, 'test');
    expect(rec.score).toBe(100);
    for (let i = 0; i < 60; i++) changeRelation(sim, 'v1', 'v2', -50, 'spite');
    expect(rec.score).toBe(-100);
    expect(rec.negCauses.spite).toBeGreaterThan(0);
    // Shared faith pulls villages together; different faiths push them apart.
    const [p, d] = sim.state.villages;
    p.identity.dominantReligionId = 'rA';
    d.identity.dominantReligionId = 'rA';
    const shared = sim.civ.relationTarget(p, d);
    d.identity.dominantReligionId = 'rB';
    const split = sim.civ.relationTarget(p, d);
    expect(shared - split).toBeCloseTo(43, 5);
    // Recent trade raises the target.
    sim.remember('trade:v1|v2');
    sim.remember('trade:v1|v2');
    expect(sim.civ.relationTarget(p, d)).toBeCloseTo(split + 16, 5);
  });

  it('4. maps scores to categories at the documented thresholds and emits only on transitions', () => {
    expect(categoryOf(60)).toBe('allied');
    expect(categoryOf(59.9)).toBe('friendly');
    expect(categoryOf(20)).toBe('friendly');
    expect(categoryOf(19.9)).toBe('neutral');
    expect(categoryOf(-19.9)).toBe('neutral');
    expect(categoryOf(-20)).toBe('rival');
    expect(categoryOf(-59.9)).toBe('rival');
    expect(categoryOf(-60)).toBe('hostile');
    const sim = quiet();
    const events: string[] = [];
    sim.bus.on('RELATIONSHIP_CHANGED', (e) => events.push(`${e.from}>${e.to}`));
    const rec = relation(sim.state, 'v2', 'v3')!; // starts at -14 (neutral)
    changeRelation(sim, 'v2', 'v3', -3, 'x'); // -17: still neutral
    expect(events).toEqual([]);
    changeRelation(sim, 'v2', 'v3', -3, 'x'); // -20: rival
    expect(events).toEqual(['neutral>rival']);
    expect(rec.everRival).toBe(true);
    for (let i = 0; i < 7; i++) changeRelation(sim, 'v2', 'v3', -6, 'x');
    expect(rec.category).toBe('hostile');
    expect(events).toEqual(['neutral>rival', 'rival>hostile']);
  });
});

describe('v0.3 trade', () => {
  it('5. finds surplus→need deals, suspends trade with hostile villages and sends aid only to friends', () => {
    const sim = quiet();
    const [p, d, r] = sim.state.villages;
    for (const v of [p, d, r]) Object.assign(v, { food: 60, water: 50, wood: 40, stone: 20 });
    p.water = 10;
    p.wood = 100; // Puddleton can pay in wood
    d.water = 95;
    const deal = sim.civ.bestTrade()!;
    expect(deal).not.toBeNull();
    expect(deal.dest.id).toBe('v1');
    expect(deal.cargo.resource).toBe('water');
    expect(deal.cargo.amount).toBeLessThanOrEqual(CONFIG.civ.maxCargo);
    expect(deal.cargo.amount).toBeLessThanOrEqual(d.water - CONFIG.civ.comfort.water * 1.3 + 1);
    // Hostile: no trade at all between that pair.
    const rec = relation(sim.state, 'v1', 'v2')!;
    rec.score = -80;
    rec.category = 'hostile';
    const hostileDeal = sim.civ.bestTrade();
    expect(!hostileDeal || !((hostileDeal.origin.id === 'v2' && hostileDeal.dest.id === 'v1') || (hostileDeal.origin.id === 'v1' && hostileDeal.dest.id === 'v2'))).toBe(true);
    // Nothing to sell → nothing planned.
    for (const v of [p, d, r]) {
      v.food = 60;
      v.water = 50;
      v.wood = 40;
      v.stone = 20;
    }
    expect(sim.civ.bestTrade()).toBeNull();
    // An emergency with no way to pay: friends send aid, neutrals do not.
    rec.score = 0;
    rec.category = 'neutral';
    p.water = 5;
    d.water = 95;
    for (const res of ['food', 'wood', 'stone'] as const) p[res] = 0;
    expect(sim.civ.bestTrade()).toBeNull();
    rec.score = 30;
    rec.category = 'friendly';
    const aid = sim.civ.bestTrade()!;
    expect(aid.kind).toBe('aid');
    expect(aid.payment).toBeNull();
  });

  it('6. conserves resources across a full physical trade expedition', () => {
    const sim = quiet();
    freezeEconomy(sim);
    const d = vil(sim, 'v2');
    const p = vil(sim, 'v1');
    d.water = 95;
    p.water = 18;
    p.wood = 60;
    const before = totals(sim);
    const caravan = sim.civ.startCaravan(d, p, { resource: 'water', amount: 12 }, { resource: 'wood', amount: 6 }, 'trade')!;
    expect(caravan).not.toBeNull();
    expect(d.water).toBe(83); // the cargo left with the merchants
    const merchant = sim.villager(caravan.merchantIds[0])!;
    let completed = false;
    let maxDistFromHome = 0;
    let crossedBridge = false;
    sim.bus.on('TRADE_COMPLETED', () => (completed = true));
    for (let t = 0; t < 240 && !completed; t++) {
      run(sim, 1);
      const now = totals(sim);
      for (const r of RESOURCES) expect(now[r]).toBeCloseTo(before[r], 6);
      maxDistFromHome = Math.max(maxDistFromHome, Math.hypot(merchant.position.x - d.centerX, merchant.position.z - d.centerZ));
      if (sim.terrain.bridgeAt(merchant.position.x, merchant.position.z)) crossedBridge = true;
    }
    expect(completed).toBe(true);
    expect(caravan.outcome).toBe('success');
    expect(maxDistFromHome).toBeGreaterThan(35); // physically walked to Puddleton
    expect(crossedBridge).toBe(true);
    expect(p.water).toBe(30);
    expect(p.wood).toBe(54);
    expect(d.wood).toBe(31);
    expect(sim.state.civ.caravans.length).toBe(0);
    expect(merchant.travel ?? null).toBeNull();
    expect(sim.state.stats.tradesCompleted).toBe(1);
  });

  it('7. refunds goods when a caravan is interrupted and survives save/load mid-trip', () => {
    // a) merchants lost on the way out: cargo returns to the origin.
    let sim = quiet();
    freezeEconomy(sim);
    let d = vil(sim, 'v2');
    let p = vil(sim, 'v1');
    d.water = 95;
    let before = totals(sim);
    let c = sim.civ.startCaravan(d, p, { resource: 'water', amount: 12 }, { resource: 'wood', amount: 6 }, 'trade')!;
    let failed = '';
    sim.bus.on('TRADE_FAILED', (e) => (failed = e.reason));
    run(sim, 5);
    for (const id of [...c.merchantIds]) sim.ai.kill(sim, sim.villager(id)!, 'test', false);
    run(sim, 0.2);
    expect(failed).not.toBe('');
    expect(d.water).toBe(95);
    for (const r of RESOURCES) expect(totals(sim)[r]).toBeCloseTo(before[r], 6);
    expect(sim.state.stats.tradesFailed).toBe(1);

    // b) merchants lost on the way back: the collected payment still reaches the origin.
    sim = quiet();
    freezeEconomy(sim);
    d = vil(sim, 'v2');
    p = vil(sim, 'v1');
    d.water = 95;
    p.wood = 60;
    const pWater0 = p.water;
    before = totals(sim);
    c = sim.civ.startCaravan(d, p, { resource: 'water', amount: 12 }, { resource: 'wood', amount: 6 }, 'trade')!;
    expect(runUntil(sim, () => c.phase === 'returning', 120)).toBe(true);
    run(sim, 3);
    for (const id of [...c.merchantIds]) sim.ai.kill(sim, sim.villager(id)!, 'test', false);
    run(sim, 0.2);
    expect(sim.state.civ.caravans.length).toBe(0);
    expect(d.wood).toBe(31);
    expect(p.water).toBe(pWater0 + 12);
    expect(p.wood).toBe(54);
    for (const r of RESOURCES) expect(totals(sim)[r]).toBeCloseTo(before[r], 6);

    // c) saved while the caravan is on the road: no duplicated cargo or villagers after loading.
    sim = quiet();
    freezeEconomy(sim);
    d = vil(sim, 'v2');
    p = vil(sim, 'v1');
    d.water = 95;
    p.wood = 60;
    before = totals(sim);
    sim.civ.startCaravan(d, p, { resource: 'water', amount: 12 }, { resource: 'wood', amount: 6 }, 'trade');
    run(sim, 12);
    const count = sim.state.villagers.length;
    const loaded = save(sim);
    freezeEconomy(loaded);
    expect(loaded.state.civ.caravans.length).toBe(1);
    expect(loaded.state.villagers.length).toBe(count);
    expect(uniqueIds(loaded)).toBe(true);
    let done = false;
    loaded.bus.on('TRADE_COMPLETED', () => (done = true));
    expect(runUntil(loaded, () => done, 240)).toBe(true);
    for (const r of RESOURCES) expect(totals(loaded)[r]).toBeCloseTo(before[r], 6);
  });
});

describe('v0.3 migration', () => {
  it('8. only lets unhappy villagers leave for welcoming villages with room, respecting cooldown and minimum size', () => {
    const sim = ready();
    const p = vil(sim, 'v1');
    const d = vil(sim, 'v2');
    const v = sim.state.villagers.find((x) => x.villageId === 'v1' && x.age >= 18)!;
    v.happiness = 0.95;
    v.fear = 0;
    const calm = sim.civ.pushScore(v, p).score;
    v.happiness = 0.4;
    v.fear = 0.9;
    const miserable = sim.civ.pushScore(v, p);
    expect(miserable.score).toBeGreaterThan(calm + 0.5);
    expect(miserable.reason).toBe('fear of the sky');
    expect(sim.civ.pullScore(v, p, d)).toBeGreaterThan(0);
    // Hostile neighbours are never a destination.
    const rec = relation(sim.state, 'v1', 'v2')!;
    rec.score = -80;
    rec.category = 'hostile';
    expect(sim.civ.pullScore(v, p, d)).toBe(0);
    rec.score = 10;
    rec.category = 'neutral';
    // No room: a full village pulls nobody.
    d.population = d.houseIds.length * CONFIG.village.houseCapacity;
    expect(sim.civ.pullScore(v, p, d)).toBe(0);
    d.population = 16;
    // Cooldown: right after a migration nothing else is considered.
    sim.state.civ.lastMigrationAt = sim.state.time;
    expect(sim.civ.considerMigration()).toBeNull();
    // Tiny villages never lose people.
    for (const x of sim.state.villagers) if (x.villageId === 'v1') x.happiness = 0.05;
    p.population = 5;
    sim.state.civ.lastMigrationAt = -9999;
    const mover = sim.civ.considerMigration(true);
    expect(mover?.villageId ?? 'none').not.toBe('v1');
  });

  it('9 & 10. completes a physical migration and preserves the villager identity', () => {
    const sim = quiet();
    const v = sim.state.villagers.find((x) => x.villageId === 'v1' && x.age >= 18 && x.currentTask.state !== 'RESTING')!;
    // Give them a past worth preserving.
    v.religionId = null;
    v.mutation = 'giant-head';
    v.memoryIds = ['m-test'];
    const snapshot = JSON.parse(JSON.stringify({ id: v.id, name: v.name, traits: v.traits, memoryIds: v.memoryIds, mutation: v.mutation, age: Math.floor(v.age) }));
    const count = sim.state.villagers.length;
    const to = vil(sim, 'v3');
    let migrated = 0;
    sim.bus.on('VILLAGER_MIGRATED', () => migrated++);
    expect(sim.civ.startMigration(v, to, 'test')).toBe(v);
    expect(v.travel?.kind).toBe('migrate');
    expect(v.villageId).toBe('v1'); // still a Puddleton citizen while walking
    let farthest = 0;
    expect(
      runUntil(sim, () => {
        farthest = Math.max(farthest, Math.hypot(v.position.x - -12, v.position.z - 22));
        return migrated > 0;
      }, 120),
    ).toBe(true);
    expect(farthest).toBeGreaterThan(25);
    expect(v.villageId).toBe('v3');
    expect(sim.building(v.homeId)!.villageId).toBe('v3');
    expect(v.travel ?? null).toBeNull();
    expect(Math.hypot(v.position.x - to.centerX, v.position.z - to.centerZ)).toBeLessThan(to.radius + 4);
    expect(sim.state.stats.migrations).toBe(1);
    expect(migrated).toBe(1);
    // Identity preserved: the same entity, not a copy.
    expect(sim.villager(snapshot.id)).toBe(v);
    expect(v.name).toBe(snapshot.name);
    expect(v.traits).toEqual(snapshot.traits);
    expect(v.memoryIds).toEqual(snapshot.memoryIds);
    expect(v.mutation).toBe(snapshot.mutation);
    expect(Math.floor(v.age)).toBe(snapshot.age);
    expect(sim.state.villagers.length).toBe(count);
    expect(uniqueIds(sim)).toBe(true);
    run(sim, 1);
    expect(vil(sim, 'v3').population).toBe(15);
    expect(vil(sim, 'v1').population).toBe(19);
  });
});

describe('v0.3 religion across villages', () => {
  function puddletonFaith(sim: Simulation) {
    const p = vil(sim, 'v1');
    const r = sim.religion.found('rock', { x: p.centerX + 4.5, z: p.centerZ + 4, recruitFromVillage: true })!;
    // Keep the founding congregation inside Puddleton.
    for (const v of sim.state.villagers) {
      if (v.religionId === r.id && v.villageId !== 'v1') v.religionId = null;
    }
    r.followers = r.followers.filter((id) => sim.villager(id)?.villageId === 'v1');
    return r;
  }

  it('11. spreads a religion to a second village through a travelling believer', () => {
    const sim = quiet();
    const r = puddletonFaith(sim);
    expect(r.villageId).toBe('v1');
    expect(r.followers.length).toBeGreaterThanOrEqual(2);
    const d = vil(sim, 'v2');
    const preacher = sim.villager(r.followers[0])!;
    preacher.position.x = d.centerX + 1;
    preacher.position.z = d.centerZ + 1;
    sim.rebuildIndexes();
    const spreads: string[] = [];
    sim.bus.on('RELIGION_SPREAD', (e) => spreads.push(`${e.villageId}:${e.via}`));
    for (let i = 0; i < 60 && !spreads.length; i++) sim.civ.preach(preacher, d, 'merchant');
    expect(spreads).toEqual(['v2:merchant']);
    expect(sim.state.villagers.some((v) => v.villageId === 'v2' && v.religionId === r.id)).toBe(true);
    expect(sim.state.stats.religionSpreads).toBe(1);
    // A second convert in the same village is not a new spread.
    for (let i = 0; i < 60; i++) sim.civ.preach(preacher, d, 'merchant');
    expect(spreads.length).toBe(1);
    // Diplomacy and tolerance scale foreign conversion.
    const target = sim.state.villagers.find((v) => v.villageId === 'v3')!;
    target.religionId = null;
    const rec = relation(sim.state, 'v1', 'v3')!;
    rec.category = 'allied';
    const allied = sim.civ.conversionFactor(target, r);
    rec.category = 'hostile';
    const hostile = sim.civ.conversionFactor(target, r);
    expect(allied).toBeGreaterThan(hostile * 4);
  });

  it('12. turns theological arguments between villages into a rivalry that sours relations', () => {
    const sim = ready();
    const p = vil(sim, 'v1');
    const d = vil(sim, 'v2');
    const a = sim.state.villagers.find((v) => v.villageId === 'v1')!;
    const b = sim.state.villagers.find((v) => v.villageId === 'v2')!;
    const c = sim.state.villagers.find((v) => v.villageId === 'v1' && v.id !== a.id)!;
    a.religionId = 'rA';
    b.religionId = 'rB';
    c.religionId = 'rB';
    const rec = relation(sim.state, 'v1', 'v2')!;
    const start = rec.score;
    sim.civ.onArgument(a, c); // same village: no diplomatic effect
    expect(rec.score).toBe(start);
    sim.civ.onArgument(a, b);
    expect(rec.score).toBeCloseTo(start - 2, 6);
    expect(sim.state.civ.rivalries['v1|v2']).toBe(1);
    expect(rec.negCauses.theology).toBeCloseTo(2, 6);
    // With different dominant faiths, diplomacy keeps drifting them apart.
    for (const v of sim.state.villagers) {
      if (v.villageId === 'v1') v.religionId = 'rA';
      if (v.villageId === 'v2') v.religionId = 'rB';
    }
    const before = rec.score;
    for (let i = 0; i < 20; i++) sim.civ.diplomacy();
    expect(p.identity.dominantReligionId).toBe('rA');
    expect(d.identity.dominantReligionId).toBe('rB');
    expect(rec.score).toBeLessThan(before - 5);
  });
});

describe('v0.3 divine favor', () => {
  it('13. tracks positive and negative interventions separately over a rolling window', () => {
    const sim = ready();
    sim.missions.autoGenerate = false;
    const p = vil(sim, 'v1');
    const r = vil(sim, 'v3');
    const events: string[] = [];
    sim.bus.on('DIVINE_FAVOR_CHANGED', (e) => events.push(`${e.villageId}:${e.kind}:${e.amount}`));
    p.water = 30;
    const well = sim.building(p.wellId)!;
    expect(sim.powers.activate('rain', well.x, well.z).ok).toBe(true);
    expect(events).toContain('v1:rain:6');
    // Lightning next to Rockbottom is a negative intervention there.
    const shrine = sim.building(r.shrineId)!;
    expect(sim.powers.activate('lightning', shrine.x + 6, shrine.z + 6).ok).toBe(true);
    expect(events.some((e) => e.startsWith('v3:') && Number(e.split(':')[2]) < 0)).toBe(true);
    expect(sim.civ.favorSum('v1', 1)).toBeGreaterThanOrEqual(6);
    expect(sim.civ.favorSum('v3', -1)).toBeLessThan(0);
    expect(sim.civ.favorSum('v3', 1)).toBe(0);
    // Old interventions leave the window, the running balance stays.
    const balance = p.identity.divineFavor;
    sim.state.time += CONFIG.civ.favorWindow + 1;
    expect(sim.civ.favorSum('v1', 1)).toBe(0);
    expect(p.identity.divineFavor).toBe(balance);
    for (let i = 0; i < 30; i++) sim.civ.favor('v1', 10, 'test');
    expect(p.identity.divineFavor).toBe(100);
    expect(sim.state.civ.favorEvents.length).toBeLessThanOrEqual(240);
  });

  it('14. detects favoritism and reacts: complaint, equal-treatment prayer, jealousy and cooldown', () => {
    const sim = ready();
    sim.missions.autoGenerate = false;
    run(sim, 1); // village aggregates (population) are computed by the simulation
    sim.state.civ.lastFavoritismAt = -9999;
    sim.state.civ.favorEvents = [];
    const reactions: Array<{ favored: string; jealous: string; kind: string }> = [];
    const notes: string[] = [];
    sim.bus.on('FAVORITISM', (e) => reactions.push({ favored: e.favoredId, jealous: e.jealousId, kind: e.kind }));
    sim.bus.on('NOTIFY', (e) => notes.push(e.text));
    sim.civ.favoritism();
    expect(reactions).toEqual([]); // nothing yet
    for (let i = 0; i < 5; i++) sim.civ.favor('v1', 10, 'prayer-answered');
    const relBefore = { d: relation(sim.state, 'v1', 'v2')!.score, r: relation(sim.state, 'v1', 'v3')!.score };
    sim.civ.favoritism();
    expect(reactions.length).toBe(1);
    const { favored, jealous } = reactions[0];
    expect(favored).toBe('v1');
    expect(['v2', 'v3']).toContain(jealous);
    expect(notes).toContain(jealous === 'v2' ? 'DRIZZLEVILLE HAS FILED A FORMAL COMPLAINT AGAINST HEAVEN.' : 'ROCKBOTTOM BELIEVES GOD HAS A FAVORITE CHILD.');
    const prayer = sim.state.prayers.find((p) => p.type === 'EQUAL_TREATMENT')!;
    expect(prayer.villageId).toBe(jealous);
    const relAfter = jealous === 'v2' ? relation(sim.state, 'v1', 'v2')!.score : relation(sim.state, 'v1', 'v3')!.score;
    expect(relAfter).toBeLessThan(jealous === 'v2' ? relBefore.d : relBefore.r);
    // Cooldown: no immediate second complaint.
    sim.civ.favoritism();
    expect(reactions.length).toBe(1);
    // Helping the jealous village answers its prayer.
    sim.civ.favor(jealous, 16, 'rain');
    run(sim, 1);
    expect(prayer.status).toBe('completed');
  });
});

describe('v0.3 divine challenges', () => {
  it('15. unlocks easy at once, medium after the tutorial and hard after three completions', () => {
    const sim = new Simulation(SEED);
    sim.state.time = CONFIG.time.dayLength * 0.4;
    run(sim, 1);
    const status = (id: string) => sim.challenges.state(id).status;
    expect(status('divine-tourist')).toBe('available');
    expect(status('traveling-merchant')).toBe('locked');
    expect(status('three-gods')).toBe('locked');
    sim.state.tutorial.done = true;
    run(sim, 1);
    expect(status('traveling-merchant')).toBe('available');
    expect(status('three-gods')).toBe('locked');
    // Complete three real challenges: tour the island, found a religion, restore a thirsty well with rain.
    for (const v of sim.state.villages) sim.civ.cameraAt(v.centerX, v.centerZ, 2);
    sim.religion.found('rock', { x: sim.state.villages[0].centerX + 4.5, z: sim.state.villages[0].centerZ + 4, recruitFromVillage: true });
    sim.unlimitedEnergy = true;
    sim.powers.unlock(['rain']);
    const p = vil(sim, 'v1');
    p.water = 20;
    const well = sim.building(p.wellId)!;
    sim.powers.activate('rain', well.x, well.z);
    expect(runUntil(sim, () => status('let-there-be-rain') === 'completed', 150)).toBe(true);
    expect(sim.challenges.completedCount()).toBeGreaterThanOrEqual(3);
    run(sim, 1);
    expect(status('three-gods')).not.toBe('locked');
  });

  it('16. tracks progress from real events only while unlocked', () => {
    const sim = new Simulation(SEED);
    sim.state.time = CONFIG.time.dayLength * 0.4;
    run(sim, 1);
    // Locked medium challenge ignores events.
    const fake = { id: 'cx', kind: 'trade', originId: 'v1', destId: 'v2', merchantIds: [], cargo: { resource: 'food', amount: 0 }, payment: null, phase: 'returning', startedAt: 0, outcome: 'success' } as const;
    sim.bus.emit('TRADE_COMPLETED', { caravan: { ...fake, cargo: { ...fake.cargo }, merchantIds: [] } });
    expect(sim.challenges.state('traveling-merchant').counters.trades ?? 0).toBe(0);
    // Unlocked: progress is read from the world (trees the player grew).
    sim.state.tutorial.done = true;
    sim.unlimitedEnergy = true;
    sim.powers.unlock(['nature']);
    run(sim, 1);
    const def = CHALLENGE_BY_ID.get('amateur-botanist')!;
    expect(sim.challenges.progress(def)[0].value).toBe(0);
    const p = vil(sim, 'v1');
    let planted = false;
    for (let k = 0; k < 24 && !planted; k++) {
      const a = (k / 24) * Math.PI * 2;
      planted = sim.powers.activate('nature', p.centerX + Math.cos(a) * 24, p.centerZ + Math.sin(a) * 24).ok;
    }
    expect(planted).toBe(true);
    run(sim, 20);
    const grown = sim.challenges.progress(def)[0].value;
    expect(grown).toBeGreaterThan(0);
    expect(grown).toBe(sim.state.trees.filter((t) => t.byPlayer && !t.removed && !t.charred && t.growth >= 0.99).length);
    expect(sim.challenges.state('amateur-botanist').status).toBe('active');
  });

  it('17, 18 & 19. completes once, applies every reward once and never duplicates it', () => {
    const sim = new Simulation(SEED);
    sim.state.time = CONFIG.time.dayLength * 0.4;
    sim.state.energy = 10;
    run(sim, 1);
    const approval = sim.state.approval;
    const completions: string[] = [];
    sim.bus.on('CHALLENGE_COMPLETED', (e) => completions.push(e.id));
    for (const v of sim.state.villages) {
      sim.civ.cameraAt(v.centerX, v.centerZ, 0.8);
      run(sim, 0.6);
      sim.civ.cameraAt(v.centerX, v.centerZ, 0.8);
    }
    expect(sim.state.civ.visited.sort()).toEqual(['v1', 'v2', 'v3']);
    run(sim, 1);
    const st = sim.challenges.state('divine-tourist');
    expect(st.status).toBe('completed');
    expect(st.rewardApplied).toBe(true);
    expect(completions).toEqual(['divine-tourist']);
    // Rewards: energy, approval and a title.
    expect(sim.state.energy).toBeGreaterThan(10 + 14); // +15, minus nothing spent
    expect(sim.state.approval).toBeCloseTo(approval + 2, 0);
    expect(sim.state.civ.titles).toContain('Divine Tourist');
    expect(sim.state.civ.selectedTitle).toBe('Divine Tourist');
    expect(sim.state.history.some((h) => h.title === 'Challenge: Divine Tourist')).toBe(true);
    // No duplicates: re-applying, re-visiting, more updates.
    const energy = sim.state.energy;
    const approval2 = sim.state.approval;
    sim.challenges.applyReward(CHALLENGE_BY_ID.get('divine-tourist')!, st);
    sim.bus.emit('CAMERA_VISIT', { villageId: 'v1' });
    run(sim, 3);
    expect(completions).toEqual(['divine-tourist']);
    expect(sim.state.energy).toBeCloseTo(Math.min(CONFIG.energy.max, energy + CONFIG.energy.regen * 3), 3);
    expect(sim.state.approval).toBe(approval2);
    expect(sim.state.civ.titles.filter((t) => t === 'Divine Tourist').length).toBe(1);
    // Completed challenges cannot be pinned.
    expect(sim.challenges.pin('divine-tourist')).toBe(false);
  });

  it('20. counts duration objectives only while the condition holds and resets on interruption', () => {
    const sim = ready();
    sim.missions.autoGenerate = false;
    run(sim, 1);
    const st = sim.challenges.state('equal-opportunity');
    expect(st.status).toBe('available');
    for (const v of sim.state.villages) sim.civ.favor(v.id, 12, 'test');
    run(sim, 30);
    expect(st.held).toBeGreaterThan(29);
    // Break the balance: one village is favored by more than 20 → the timer resets.
    sim.civ.favor('v1', 30, 'test');
    run(sim, 0.1);
    expect(st.held).toBeLessThan(0.2);
    for (const id of ['v2', 'v3']) sim.civ.favor(id, 30, 'test');
    run(sim, 60);
    expect(st.status).not.toBe('completed');
    expect(runUntil(sim, () => st.status === 'completed', 70)).toBe(true);
    expect(sim.state.civ.titles).toContain('Divine Human Resources Manager');
  });

  it('21. persists progress, completion, rewards, titles and pins through save/load', () => {
    const sim = ready();
    sim.missions.autoGenerate = false;
    run(sim, 1);
    for (const v of sim.state.villages) sim.civ.cameraAt(v.centerX, v.centerZ, 2);
    run(sim, 1);
    for (const v of sim.state.villages) sim.civ.favor(v.id, 12, 'test');
    run(sim, 40);
    sim.state.civ.pinned = []; // v0.4 pins three starter goals after training; start clean here
    sim.challenges.pin('equal-opportunity');
    sim.challenges.pin('traveling-merchant');
    const held = sim.challenges.state('equal-opportunity').held;
    expect(held).toBeGreaterThan(35);
    const energy = sim.state.energy;
    const loaded = save(sim);
    loaded.unlimitedEnergy = false;
    expect(loaded.challenges.state('divine-tourist').status).toBe('completed');
    expect(loaded.challenges.state('divine-tourist').rewardApplied).toBe(true);
    expect(loaded.challenges.state('equal-opportunity').held).toBeCloseTo(held, 5);
    expect(loaded.state.civ.titles).toEqual(sim.state.civ.titles);
    expect(loaded.state.civ.pinned).toEqual(['equal-opportunity', 'traveling-merchant']);
    expect(loaded.state.civ.visited.sort()).toEqual(['v1', 'v2', 'v3']);
    // Duration keeps counting from where it was (the favor events were saved too).
    run(loaded, 1);
    expect(loaded.challenges.state('equal-opportunity').held).toBeGreaterThan(held);
    // Loading does not re-grant rewards.
    expect(loaded.state.energy).toBeLessThanOrEqual(energy + CONFIG.energy.regen * 1.1 + 0.001);
  });
});

describe('v0.3 save migration', () => {
  /** Rebuild what an older save looked like: Puddleton only, no civilization layer. */
  function legacyState(version: 1 | 2): { state: GameStateData; puddletonIds: string[]; religionId?: string } {
    const sim = quiet();
    let religionId: string | undefined;
    if (version === 2) {
      const p = vil(sim, 'v1');
      const r = sim.religion.found('rock', { x: p.centerX + 4.5, z: p.centerZ + 4, recruitFromVillage: true })!;
      religionId = r.id;
      sim.history.add('The Rock Moment', 'Something happened to a rock.', { kind: 'religion' });
    }
    const s = JSON.parse(JSON.stringify(sim.state)) as GameStateData & Record<string, unknown>;
    const puddletonBuildings = s.buildings.filter((b) => b.villageId === 'v1').length;
    s.buildings = s.buildings.slice(0, puddletonBuildings);
    s.villagers = s.villagers.filter((v) => v.villageId === 'v1');
    s.villages = s.villages.filter((v) => v.id === 'v1');
    const ids = new Set(s.villagers.map((v) => v.id));
    for (const r of s.religions) r.followers = r.followers.filter((id) => ids.has(id));
    for (const v of s.villagers as unknown as Array<Record<string, unknown>>) delete v.travel;
    for (const v of s.villages as unknown as Array<Record<string, unknown>>) for (const k of ['stone', 'identity', 'quarryIds', 'fisheryIds']) delete v[k];
    for (const b of s.buildings as unknown as Array<Record<string, unknown>>) delete b.style;
    for (const k of ['tradesCompleted', 'tradesFailed', 'migrations', 'religionSpreads', 'prayersAfterOffice']) delete (s.stats as unknown as Record<string, unknown>)[k];
    s.history = s.history.filter((h) => h.kind !== 'founding');
    delete (s as Record<string, unknown>).civ;
    s.version = version;
    s.time = 600;
    if (version === 1) {
      for (const key of ['rocks', 'memories', 'religions', 'sacred', 'mutations', 'history', 'culture']) delete s[key];
      delete (s.cooldowns as Record<string, number>).mutation;
      for (const v of s.villagers as unknown as Array<Record<string, unknown>>) for (const key of ['traits', 'religionId', 'memoryIds', 'mutation', 'title']) delete v[key];
    }
    return { state: s, puddletonIds: [...ids], religionId };
  }

  function loadLegacy(state: GameStateData, version: number): Simulation {
    const store = new MemoryStore();
    store.setItem('gods-intern.save', JSON.stringify({ version, savedAt: 0, state }));
    const res = new SaveManager(store).load();
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('load failed');
    return new Simulation(SEED, res.state);
  }

  function checkUpgraded(sim: Simulation, puddletonIds: string[]): void {
    const s = sim.state;
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.villages.map((v) => v.id)).toEqual(['v1', 'v2', 'v3']);
    // Puddleton and its people are untouched.
    for (const id of puddletonIds) expect(sim.villager(id)?.villageId).toBe('v1');
    expect(s.villagers.filter((v) => v.villageId === 'v1').length).toBe(puddletonIds.length);
    expect(s.villagers.filter((v) => v.villageId === 'v2').length).toBe(16);
    expect(s.villagers.filter((v) => v.villageId === 'v3').length).toBe(14);
    expect(uniqueIds(sim)).toBe(true);
    s.buildings.forEach((b, i) => expect(b.id).toBe(i));
    expect(s.villages[0].identity.culture).toBe('agricultural');
    expect(Object.keys(s.civ.relations).length).toBe(3);
    expect(Object.keys(s.civ.challenges).length).toBe(30); // 20 from v0.3 + 10 from v0.4
    expect(s.history.some((h) => h.title === 'New Neighbors Arrived')).toBe(true);
    run(sim, 60);
    for (const v of s.villages) for (const r of RESOURCES) expect(Number.isFinite(v[r])).toBe(true);
    // Loading the upgraded save again is stable (idempotent migration: no extra villages or villagers).
    const again = save(sim);
    expect(again.state.villages.length).toBe(3);
    expect(again.state.villagers.length).toBe(s.villagers.length);
  }

  it('22. upgrades a v0.2 save, keeping Puddleton, its faith and its history', () => {
    const { state, puddletonIds, religionId } = legacyState(2);
    const sim = loadLegacy(state, 2);
    checkUpgraded(sim, puddletonIds);
    const r = sim.state.religions.find((x) => x.id === religionId)!;
    expect(r).toBeTruthy();
    expect(r.followers.every((id) => puddletonIds.includes(id))).toBe(true);
    expect(sim.state.history.some((h) => h.title === 'The Rock Moment')).toBe(true);
    expect(sim.state.sacred.some((x) => x.religionId === religionId)).toBe(true);
  });

  it('23. upgrades a v0.1 save through every migration step', () => {
    const { state, puddletonIds } = legacyState(1);
    const sim = loadLegacy(state, 1);
    checkUpgraded(sim, puddletonIds);
    for (const v of sim.state.villagers) expect(v.traits.length).toBeGreaterThan(0);
    expect(sim.state.rocks.length).toBeGreaterThan(5);
  });
});

describe('v0.3 long-run stability', () => {
  it('24. stays bounded and consistent over 30 simulated minutes of three-village play', () => {
    const sim = ready();
    const powers = ['rain', 'nature', 'lightning', 'rain', 'nature', 'fire'] as const;
    let trades = 0;
    sim.bus.on('TRADE_COMPLETED', () => trades++);
    for (let minute = 0; minute < 30; minute++) {
      // A light-handed god: one intervention per minute, rotating villages.
      const v = sim.state.villages[minute % 3];
      const power = powers[minute % powers.length];
      const off = power === 'lightning' || power === 'fire' ? 20 : power === 'nature' ? 16 : 0;
      sim.state.cooldowns[power] = 0;
      sim.powers.activate(power, v.centerX + off, v.centerZ - off * 0.5);
      run(sim, 60);
      const s = sim.state;
      const alive = s.villagers.filter((x) => x.alive).length;
      expect(alive).toBeLessThanOrEqual(CONFIG.civ.populationCap + 3 * 4);
      expect(s.civ.caravans.length).toBeLessThanOrEqual(CONFIG.civ.maxCaravans);
      expect(s.religions.filter((r) => r.active).length).toBeLessThanOrEqual(CONFIG.culture.maxReligions);
      expect(s.history.length).toBeLessThanOrEqual(CONFIG.culture.maxHistory);
      expect(s.civ.favorEvents.length).toBeLessThanOrEqual(240);
      expect(uniqueIds(sim)).toBe(true);
      for (const rec of Object.values(s.civ.relations)) {
        expect(rec.score).toBeGreaterThanOrEqual(-100);
        expect(rec.score).toBeLessThanOrEqual(100);
        expect(rec.category).toBe(categoryOf(rec.score));
      }
      for (const village of s.villages) {
        for (const r of RESOURCES) {
          expect(Number.isFinite(village[r])).toBe(true);
          expect(village[r]).toBeGreaterThanOrEqual(0);
        }
        expect(Number.isFinite(village.identity.divineFavor)).toBe(true);
      }
      for (const x of s.villagers) {
        expect(Number.isFinite(x.position.x) && Number.isFinite(x.position.z)).toBe(true);
        if (x.travel) expect(sim.village(x.travel.destId)).toBeTruthy();
      }
    }
    expect(trades).toBeGreaterThan(0);
    expect(sim.state.villages.every((v) => v.population > 0)).toBe(true);
  }, 120000);
});

void ({} as VillagerData);
