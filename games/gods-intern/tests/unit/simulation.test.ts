import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/core/Config';
import { MemoryStore, SaveManager } from '../../src/persistence/SaveManager';
import { Simulation } from '../../src/simulation/SimulationManager';

const DT = 1 / CONFIG.sim.hz;
const SEED = 42;

function run(sim: Simulation, seconds: number): void {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) sim.step(DT);
}

function unlockAll(sim: Simulation): void {
  sim.powers.unlock(['rain', 'lightning', 'nature', 'fire']);
}

function village(sim: Simulation) {
  return sim.state.villages[0];
}

function well(sim: Simulation) {
  return sim.building(village(sim).wellId)!;
}

/** A healthy, fully grown tree well away from the village. */
function forestTree(sim: Simulation) {
  const v = village(sim);
  return sim.state.trees.find(
    (t) => t.growth >= 1 && !t.charred && t.kind !== 'bush' && Math.hypot(t.x - v.centerX, t.z - v.centerZ) > 45,
  )!;
}

describe('world generation', () => {
  it('is deterministic for a seed', () => {
    const a = new Simulation(SEED);
    const b = new Simulation(SEED);
    expect(a.state.trees.length).toBe(b.state.trees.length);
    expect(a.terrain.heightAt(10, 10)).toBe(b.terrain.heightAt(10, 10));
    expect(JSON.stringify(a.state.villagers[3])).toBe(JSON.stringify(b.state.villagers[3]));
  });

  it('creates a varied island with one populated village', () => {
    const sim = new Simulation(SEED);
    expect(sim.state.villagers.length).toBeGreaterThanOrEqual(20);
    expect(sim.state.trees.length).toBeGreaterThan(250);
    const types = sim.state.buildings.map((b) => b.type);
    expect(types.filter((t) => t === 'house').length).toBeGreaterThanOrEqual(6);
    for (const t of ['well', 'farm', 'storage', 'shrine']) expect(types).toContain(t);
    let maxH = -Infinity;
    let land = 0;
    for (let i = 0; i < sim.terrain.heights.length; i++) {
      maxH = Math.max(maxH, sim.terrain.heights[i]);
      if (sim.terrain.water[i] === 0) land++;
    }
    expect(maxH).toBeGreaterThan(14);
    expect(land / sim.terrain.heights.length).toBeGreaterThan(0.3);
    expect(sim.terrain.isLand(well(sim).x, well(sim).z)).toBe(true);
  });
});

describe('powers and energy', () => {
  it('consumes energy and applies cooldown on a valid cast', () => {
    const sim = new Simulation(SEED);
    const w = well(sim);
    const res = sim.powers.activate('rain', w.x, w.z);
    expect(res.ok).toBe(true);
    expect(sim.state.energy).toBe(CONFIG.energy.max - CONFIG.powers.rain.cost);
    expect(sim.state.cooldowns.rain).toBeGreaterThan(0);
    const again = sim.powers.activate('rain', w.x, w.z);
    expect(again.ok).toBe(false);
    expect(sim.state.energy).toBe(CONFIG.energy.max - CONFIG.powers.rain.cost);
  });

  it('never spends energy on rejected actions', () => {
    const sim = new Simulation(SEED);
    unlockAll(sim);
    const before = sim.state.energy;
    expect(sim.powers.activate('fire', 0, 79).ok).toBe(false); // open sea
    expect(sim.powers.activate('nature', well(sim).x, well(sim).z).ok).toBe(false); // inside a building
    expect(sim.powers.activate('lightning', 79, 79).ok).toBe(false);
    expect(sim.state.energy).toBe(before);
  });

  it('rejects locked powers and insufficient energy', () => {
    const sim = new Simulation(SEED);
    const t = forestTree(sim);
    expect(sim.powers.activate('fire', t.x, t.z).reason).toMatch(/unlock/i);
    unlockAll(sim);
    sim.state.energy = 5;
    const res = sim.powers.activate('fire', t.x, t.z);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/energy/i);
    expect(sim.state.energy).toBe(5);
  });

  it('regenerates energy over time up to the cap', () => {
    const sim = new Simulation(SEED);
    sim.state.energy = 10;
    run(sim, 2);
    expect(sim.state.energy).toBeCloseTo(10 + CONFIG.energy.regen * 2, 0);
    run(sim, 30);
    expect(sim.state.energy).toBe(CONFIG.energy.max);
  });

  it('nature creates a persistent tree that grows to full size', () => {
    const sim = new Simulation(SEED);
    unlockAll(sim);
    const v = village(sim);
    const x = v.centerX - 5;
    const z = v.centerZ + 4;
    const count = sim.state.trees.length;
    const res = sim.powers.activate('nature', x, z);
    expect(res.ok, res.reason).toBe(true);
    expect(sim.state.trees.length).toBe(count + 1);
    run(sim, 2.5);
    const tree = sim.state.trees[count];
    expect(tree.growth).toBe(1);
    expect(tree.byPlayer).toBe(true);
  });

  it('lightning ignites the struck tree and frightens witnesses', () => {
    const sim = new Simulation(SEED);
    unlockAll(sim);
    const v = village(sim);
    const tree = sim.state.trees.find((t) => t.growth >= 1 && !t.charred && Math.hypot(t.x - v.centerX, t.z - v.centerZ) < 22 && Math.hypot(t.x - v.centerX, t.z - v.centerZ) > 8)!;
    const fearBefore = sim.state.villagers.reduce((a, p) => a + p.fear, 0);
    const res = sim.powers.activate('lightning', tree.x, tree.z);
    expect(res.ok).toBe(true);
    expect(tree.burning).toBe(true);
    expect(sim.state.fires.length).toBeGreaterThan(0);
    const fearAfter = sim.state.villagers.reduce((a, p) => a + p.fear, 0);
    expect(fearAfter).toBeGreaterThan(fearBefore);
  });
});

describe('rain, moisture and flooding', () => {
  it('rain accumulates moisture and refills the well', () => {
    const sim = new Simulation(SEED);
    const w = well(sim);
    const idx = sim.cellIndex(w.x, w.z);
    const m0 = sim.state.moisture[idx];
    const water0 = village(sim).water;
    sim.powers.activate('rain', w.x, w.z);
    run(sim, 4);
    expect(sim.state.moisture[idx]).toBeGreaterThan(m0 + 0.25);
    expect(village(sim).water).toBeGreaterThan(water0 + 15);
  });

  it('a second rain on saturated soil floods the village, which later recedes', () => {
    const sim = new Simulation(SEED);
    const w = well(sim);
    const events: string[] = [];
    sim.bus.on('FLOOD_STARTED', () => events.push('flood'));
    sim.bus.on('FLOOD_RECEDED', () => events.push('receded'));
    sim.powers.activate('rain', w.x, w.z);
    run(sim, 9);
    expect(village(sim).floodActive).toBe(false);
    sim.powers.activate('rain', w.x, w.z);
    run(sim, 9);
    expect(events).toContain('flood');
    expect(village(sim).flood).toBeGreaterThan(CONFIG.flood.eventLevel);
    run(sim, 80);
    expect(events).toContain('receded');
  });
});

describe('fire', () => {
  it('rain extinguishes a burning tree', () => {
    const sim = new Simulation(SEED);
    const tree = forestTree(sim);
    sim.fire.ignite(sim, 'tree', tree.id, true);
    run(sim, 1);
    let byRain = false;
    sim.bus.on('FIRE_EXTINGUISHED', (e) => {
      if (e.byRain) byRain = true;
    });
    sim.powers.activate('rain', tree.x, tree.z);
    run(sim, 8);
    expect(sim.fire.activeFiresNear(sim, tree.x, tree.z, CONFIG.powers.rain.radius)).toBe(0);
    expect(byRain).toBe(true);
    expect(tree.charred).toBe(false);
  });

  it('spreads through forest but never exceeds the active fire cap', () => {
    const sim = new Simulation(SEED);
    const trees = sim.state.trees.filter((t) => t.kind !== 'bush').slice(0, 25);
    for (const t of trees) sim.fire.ignite(sim, 'tree', t.id, true);
    let peak = 0;
    let spreads = 0;
    sim.bus.on('FIRE_SPREAD', () => spreads++);
    for (let i = 0; i < 60 * CONFIG.sim.hz; i++) {
      sim.step(DT);
      peak = Math.max(peak, sim.state.fires.length);
      expect(sim.state.fires.length).toBeLessThanOrEqual(CONFIG.fire.maxActive);
    }
    expect(spreads).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(CONFIG.fire.maxActive);
    expect(sim.state.trees.some((t) => t.charred)).toBe(true);
  });

  it('makes nearby villagers flee', () => {
    const sim = new Simulation(SEED);
    const v = village(sim);
    const house = sim.building(v.houseIds[0])!;
    sim.fire.ignite(sim, 'building', house.id, true);
    // Put a villager right next to it.
    const p = sim.state.villagers[0];
    p.position.x = house.x + 3;
    p.position.z = house.z;
    run(sim, 3);
    expect(sim.state.villagers.some((x) => x.currentTask.state === 'FLEEING')).toBe(true);
  });
});

describe('villagers and village economy', () => {
  it('villagers move to real destinations and consume resources', () => {
    const sim = new Simulation(SEED);
    const start = new Map(sim.state.villagers.map((p) => [p.id, { x: p.position.x, z: p.position.z }]));
    const v = village(sim);
    v.water = 80;
    const water0 = v.water;
    const food0 = v.food;
    run(sim, 120);
    const moved = sim.state.villagers.filter((p) => {
      const s0 = start.get(p.id);
      return s0 && Math.hypot(p.position.x - s0.x, p.position.z - s0.z) > 2;
    }).length;
    expect(moved).toBeGreaterThanOrEqual(15);
    expect(v.water).toBeLessThan(water0 + 30); // drinking happened against refill
    const ate = food0 - v.food;
    expect(Number.isFinite(ate)).toBe(true);
    const states = new Set(sim.state.villagers.map((p) => p.currentTask.state));
    expect(states.size).toBeGreaterThan(1);
  });

  it('survives 15 minutes unattended without NaN or total collapse', () => {
    const sim = new Simulation(SEED);
    for (let i = 0; i < 900 * CONFIG.sim.hz; i++) sim.step(DT);
    const v = village(sim);
    for (const key of ['food', 'water', 'wood', 'happiness', 'faith', 'fear'] as const) {
      expect(Number.isFinite(v[key])).toBe(true);
    }
    for (const p of sim.state.villagers) {
      expect(Number.isFinite(p.position.x) && Number.isFinite(p.position.z)).toBe(true);
    }
    expect(v.population).toBeGreaterThanOrEqual(12);
    expect(sim.state.prayers.length).toBeLessThanOrEqual(12);
  });
});

describe('prayers and missions', () => {
  it('generates a thirst prayer from a real shortage and completes it with rain', () => {
    const sim = new Simulation(SEED);
    const v = village(sim);
    v.water = 10;
    run(sim, 1);
    const prayer = sim.state.prayers.find((p) => p.type === 'THIRST');
    expect(prayer).toBeTruthy();
    sim.state.energy = 50;
    sim.powers.activate('rain', well(sim).x, well(sim).z);
    run(sim, 9);
    sim.powers.activate('rain', well(sim).x + 1, well(sim).z);
    run(sim, 9);
    expect(prayer!.status).toBe('completed');
    expect(sim.state.stats.prayersAnswered).toBe(1);
  });

  it('prevents duplicate prayers per type and village', () => {
    const sim = new Simulation(SEED);
    const v = village(sim);
    const a = sim.missions.create('THIRST', v);
    const b = sim.missions.create('THIRST', v);
    expect(a).not.toBeNull();
    expect(b).toBeNull();
    expect(sim.state.prayers.filter((p) => p.type === 'THIRST' && p.status === 'active').length).toBe(1);
  });

  it('caps active prayers', () => {
    const sim = new Simulation(SEED);
    const v = village(sim);
    for (const type of ['THIRST', 'HUNGER', 'PANIC', 'GREEN', 'FLOOD']) sim.missions.create(type, v);
    expect(sim.missions.active.length).toBe(CONFIG.prayers.maxActive);
  });

  it('completes the GREEN prayer by planting five trees', () => {
    const sim = new Simulation(SEED);
    unlockAll(sim);
    sim.unlimitedEnergy = true;
    const v = village(sim);
    const prayer = sim.missions.create('GREEN', v, true)!;
    let planted = 0;
    for (let i = 0; i < 40 && planted < 5; i++) {
      const a = (i / 40) * Math.PI * 2;
      const r = 17 + (i % 3) * 2;
      if (sim.powers.activate('nature', v.centerX + Math.cos(a) * r, v.centerZ + Math.sin(a) * r).ok) planted++;
      run(sim, 0.4);
    }
    run(sim, 1);
    expect(planted).toBe(5);
    expect(prayer.status).toBe('completed');
  });

  it('completes FIRE, PANIC and FLOOD prayers through simulation state', () => {
    const sim = new Simulation(SEED);
    const v = village(sim);
    sim.unlimitedEnergy = true;
    // FIRE: ignite two trees near the village, then rain on them.
    const near = sim.state.trees.filter((t) => !t.charred && Math.hypot(t.x - v.centerX, t.z - v.centerZ) < v.radius + 10 && Math.hypot(t.x - v.centerX, t.z - v.centerZ) > 18).slice(0, 2);
    for (const t of near) sim.fire.ignite(sim, 'tree', t.id, true);
    run(sim, 1);
    const fire = sim.state.prayers.find((p) => p.type === 'FIRE')!;
    expect(fire).toBeTruthy();
    for (const t of near) {
      sim.state.cooldowns.rain = 0;
      sim.powers.activate('rain', t.x, t.z);
    }
    run(sim, 10);
    // Stray spread may need another pass.
    for (const f of [...sim.state.fires]) {
      sim.state.cooldowns.rain = 0;
      sim.powers.activate('rain', f.x, f.z);
    }
    run(sim, 10);
    expect(fire.status).toBe('completed');

    // PANIC: fear decays naturally / via nature.
    for (const p of sim.state.villagers) p.fear = 0.7;
    run(sim, 1);
    const panic = sim.state.prayers.find((p) => p.type === 'PANIC' && p.status === 'active')!;
    expect(panic).toBeTruthy();
    run(sim, 100);
    expect(panic.status).toBe('completed');

    // FLOOD: saturate and wait for it to recede.
    const flood = sim.missions.create('FLOOD', v, true)!;
    for (let i = 0; i < sim.state.flood.length; i++) sim.state.flood[i] = 0;
    run(sim, 2);
    expect(flood.status).toBe('completed');
  });
});

describe('save system', () => {
  it('round-trips the full world state', () => {
    const sim = new Simulation(SEED);
    unlockAll(sim);
    sim.unlimitedEnergy = true;
    const t = forestTree(sim);
    sim.powers.activate('fire', t.x, t.z);
    sim.powers.activate('rain', well(sim).x, well(sim).z);
    run(sim, 5);
    const store = new MemoryStore();
    const saves = new SaveManager(store);
    expect(saves.save(sim.state)).toBe(true);
    const loaded = saves.load();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(JSON.stringify(loaded.state)).toBe(JSON.stringify(sim.state));
    const restored = new Simulation(loaded.state.seed, loaded.state);
    run(restored, 5);
    run(sim, 5);
    expect(restored.state.time).toBeCloseTo(sim.state.time, 5);
    expect(restored.state.villagers.length).toBe(sim.state.villagers.length);
    expect(restored.state.fires.length).toBe(sim.state.fires.length);
  });

  it('rejects corrupted, outdated and malformed saves without throwing', () => {
    const store = new MemoryStore();
    const saves = new SaveManager(store);
    expect(saves.load().ok).toBe(false);
    store.setItem('gods-intern.save', '{not json');
    expect(saves.load()).toEqual({ ok: false, reason: 'corrupt' });
    store.setItem('gods-intern.save', JSON.stringify({ version: 999, state: {} }));
    expect(saves.load()).toEqual({ ok: false, reason: 'outdated' });
    store.setItem('gods-intern.save', JSON.stringify({ version: 1, state: { version: 1, seed: 'x' } }));
    expect(saves.load()).toEqual({ ok: false, reason: 'invalid' });
  });
});
