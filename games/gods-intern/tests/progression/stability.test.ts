import { it, expect } from 'vitest';
import fs from 'node:fs';
import { CONFIG } from '../../src/core/Config';
import { MemoryStore, SaveManager, slotKey } from '../../src/persistence/SaveManager';
import { Simulation } from '../../src/simulation/SimulationManager';
import { runBot } from './bots';

/**
 * Long-session stability (ACCELERATED, headless): 75 simulated minutes of exploratory
 * Career play in 5-minute chunks. Between chunks: save → reload into a new Simulation
 * (integrity check), and every third chunk a Creative-mode session on its own slot is
 * played and switched back. Tracks entity counts, effects, history, heap and step cost.
 * Opt-in: STABILITY=1. Writes artifacts/progression/stability.json.
 */
it.runIf(process.env.STABILITY)('75-minute accelerated stability run', () => {
  process.env.BOT_DECISION ??= '8';
  const store = new MemoryStore();
  const saves = new SaveManager(store);
  let sim = new Simulation(11);
  sim.state.tutorial.done = true;
  sim.powers.unlock(['rain', 'lightning', 'nature', 'fire']);
  sim.missions.autoGenerate = true;
  const samples: Array<Record<string, number>> = [];
  const t0 = performance.now();
  for (let chunk = 1; chunk <= 15; chunk++) {
    const c0 = performance.now();
    runBot(chunk % 2 ? 'exploratory' : 'benevolent', 300, chunk, sim);
    const stepMs = (performance.now() - c0) / (300 * CONFIG.sim.hz);
    const s = sim.state;
    // Save → reload integrity.
    expect(saves.save(s, slotKey('career', true))).toBe(true);
    const res = saves.load(slotKey('career', true));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.villagers.length).toBe(s.villagers.length);
    expect(res.state.career.xp).toBe(s.career.xp);
    expect(res.state.career.rank).toBe(s.career.rank);
    expect(new Set(res.state.villagers.map((v) => v.id)).size).toBe(res.state.villagers.length);
    const json = JSON.stringify(res.state);
    sim = new Simulation(11, res.state);
    sim.missions.autoGenerate = true;
    // Creative switching on its own slot.
    if (chunk % 3 === 0) {
      const creative = new Simulation(11);
      creative.state.mode = 'creative';
      creative.state.tutorial.done = true;
      creative.applyMode();
      creative.unlimitedEnergy = true;
      runBot('exploratory', 120, chunk + 100, creative);
      expect(creative.state.career.xp).toBe(0);
      expect(saves.save(creative.state, slotKey('creative', true))).toBe(true);
      const back = saves.load(slotKey('career', true));
      expect(back.ok && back.state.mode).toBe('career');
    }
    const heap = process.memoryUsage().heapUsed / 1e6;
    samples.push({
      minute: chunk * 5,
      villagers: s.villagers.filter((v) => v.alive).length,
      trees: s.trees.length,
      fires: s.fires.length,
      effects: s.effects.length,
      history: s.history.length,
      memories: s.memories.length,
      religions: s.religions.length,
      caravans: s.civ.caravans.length,
      graves: s.graveyard.length,
      terrainEdits: s.terrainEdits.length,
      saveKB: Math.round(json.length / 1024),
      heapMB: Math.round(heap),
      stepMs: +stepMs.toFixed(3),
      rank: s.career.rank,
    });
  }
  const last = samples[samples.length - 1];
  // Bounded growth: no runaway collections.
  expect(last.effects).toBeLessThanOrEqual(8);
  expect(last.history).toBeLessThanOrEqual(400);
  expect(last.graves).toBeLessThanOrEqual(CONFIG.powers.resurrection.maxGraves);
  expect(last.terrainEdits).toBeLessThanOrEqual(80);
  expect(last.saveKB).toBeLessThan(1500);
  expect(last.villagers).toBeGreaterThan(0);
  fs.mkdirSync('artifacts/progression', { recursive: true });
  fs.writeFileSync('artifacts/progression/stability.json', JSON.stringify({ mode: 'accelerated headless (not real time)', simulatedMinutes: 75, wallSeconds: Math.round((performance.now() - t0) / 1000), samples }, null, 2));
}, 3_600_000);
