import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/core/Config';
import { runBot } from '../progression/bots';

/**
 * v0.5 pacing (deterministic bots, simulated active play at one decision per 10 s;
 * see tests/progression/bots.ts). The long 5-hour runs are opt-in (PROGRESSION=1).
 */
describe('v0.5 progression pacing', () => {
  process.env.BOT_DECISION ??= '10';
  const ben = runBot('benevolent', 1500, 7);
  const cha = runBot('chaotic', 1500, 7);
  const spam = runBot('spammer', 1500, 7);
  console.log(JSON.stringify({ ben: ben.unlocks, cha: cha.unlocks, spam: spam.unlocks, xp: [ben.xp, cha.xp, spam.xp] }));

  it('starts with four powers and unlocks Mutation and Tornado in the first quarter hour', () => {
    for (const r of [ben, cha]) {
      expect(r.unlocks.rain).toBe(0);
      expect(r.unlocks.mutation).toBeGreaterThan(200);
      expect(r.unlocks.mutation).toBeLessThan(720);
      expect(r.unlocks.tornado).toBeGreaterThan(360);
      expect(r.unlocks.tornado).toBeLessThan(1020); // benevolent ≈ 11 min, chaotic ≈ 16 min (bots, seed 7)
    }
  });

  it('does not unlock late-game powers in the first 25 minutes', () => {
    for (const r of [ben, cha, spam]) {
      for (const id of ['terraform', 'timewarp', 'possession', 'meteor', 'resurrection']) expect(r.unlocks[id]).toBeUndefined();
      expect(r.promotions.length).toBeLessThanOrEqual(3);
    }
  });

  it('never skips ranks: each promotion is one rank and a single award cannot cross two thresholds', () => {
    const t = CONFIG.career.thresholds;
    for (let i = 1; i < t.length; i++) expect(t[i] - t[i - 1]).toBeGreaterThan(CONFIG.career.xp.challenge.hard);
    for (const r of [ben, cha]) r.promotions.forEach((p, i) => expect(p.rank).toBe(i + 2));
  });

  it('destructive repetition at one spot is the slowest path', () => {
    expect(spam.xp).toBeLessThan(ben.xp * 0.75);
    expect(spam.xp).toBeLessThan(cha.xp * 0.75);
    expect(spam.repeatedTargetShare).toBeGreaterThan(0.3);
  });

  it('both benevolent and chaotic play progress', () => {
    expect(ben.promotions.length).toBeGreaterThanOrEqual(1);
    expect(cha.promotions.length).toBeGreaterThanOrEqual(1);
  });
});

describe('v0.5 save migration', () => {
  it('never demotes a v4 career and keeps unlocked powers; no promotion events on load', async () => {
    const { Simulation } = await import('../../src/simulation/SimulationManager');
    const { MemoryStore, SaveManager } = await import('../../src/persistence/SaveManager');
    const old = new Simulation(42);
    old.state.tutorial.done = true;
    // A v0.4 player at rank 4 with 563 XP (the v0.4 normal-play end state).
    old.state.version = 4;
    old.state.career.rank = 4;
    old.state.career.xp = 563;
    old.state.career.promotions = [{ rank: 2, t: 1 }, { rank: 3, t: 2 }, { rank: 4, t: 3 }];
    old.state.unlockedPowers = ['rain', 'lightning', 'nature', 'fire', 'tornado', 'freeze', 'gravity', 'mutation'];
    delete (old.state.tutorial as { tipsSeen?: string[] }).tipsSeen;
    const store = new MemoryStore();
    store.setItem('gods-intern.save', JSON.stringify({ version: 4, savedAt: 0, state: old.state }));
    const res = new SaveManager(store).load('gods-intern.save');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.version).toBe(5);
    expect(res.state.career.rank).toBe(4);
    expect(res.state.career.xp).toBe(CONFIG.career.thresholds[3]);
    expect(res.state.unlockedPowers).toEqual(expect.arrayContaining(['tornado', 'freeze', 'gravity', 'mutation']));
    expect(res.state.tutorial.tipsSeen).toEqual([]);
    const sim = new Simulation(42, res.state);
    const promoted: number[] = [];
    sim.bus.on('PROMOTED', (e) => promoted.push(e.rank));
    for (let i = 0; i < 40; i++) sim.step(0.05);
    expect(promoted).toEqual([]);
    expect(sim.state.career.rank).toBe(4);
    expect(sim.state.career.promotions.length).toBe(3);
  });
});
