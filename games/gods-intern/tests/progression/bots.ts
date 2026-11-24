/**
 * Deterministic headless progression bots (v0.5). They play Career Mode through the
 * same PowerManager.activate() the UI uses: normal energy, normal cooldowns, no XP
 * grants. A "decision" every few simulated seconds approximates human pace (looking,
 * aiming, reading). These are *pacing models*, not humans: real players idle more,
 * read text, and sometimes miss. Reported times are simulated seconds of active play.
 */
import { CONFIG, type PowerId } from '../../src/core/Config';
import type { VillageData } from '../../src/core/types';
import { Simulation } from '../../src/simulation/SimulationManager';

export type Strategy = 'benevolent' | 'chaotic' | 'exploratory' | 'spammer';

export interface BotReport {
  strategy: Strategy;
  seconds: number;
  unlocks: Record<string, number>;
  promotions: Array<{ rank: number; t: number }>;
  rankAt: Record<string, number>;
  xp: number;
  xpBySource: Record<string, number>;
  casts: Record<string, number>;
  energySpent: number;
  idleDecisions: number;
  decisions: number;
  challenges: number;
  firstChallenge: number | null;
  firstCultural: number | null;
  repeatedTargetShare: number;
  /** Career XP every simulated minute. */
  timeline: number[];
}

const DT = 1 / CONFIG.sim.hz;

export function newCareer(seed: number): Simulation {
  const sim = new Simulation(seed);
  // Equivalent of finishing the v0.5 onboarding (the four starter powers, training reward).
  sim.state.tutorial.done = true;
  sim.state.tutorial.step = 99;
  sim.powers.unlock(['rain', 'lightning', 'nature', 'fire']);
  sim.missions.autoGenerate = true;
  return sim;
}

/** Simple seeded PRNG for bot choices (independent of the simulation's own Rng). */
function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function runBot(strategy: Strategy, seconds: number, seed = 7, sim = newCareer(seed)): BotReport {
  const rnd = lcg(seed * 31 + strategy.length);
  const s = sim.state;
  const report: BotReport = {
    strategy, seconds, unlocks: {}, promotions: [], rankAt: {}, xp: 0, xpBySource: {}, casts: {}, energySpent: 0,
    idleDecisions: 0, decisions: 0, challenges: 0, firstChallenge: null, firstCultural: null, repeatedTargetShare: 0, timeline: [],
  };
  const t0 = s.time;
  const now = () => Math.round(s.time - t0);
  for (const id of s.unlockedPowers) report.unlocks[id] = 0;
  sim.bus.on('POWERS_UNLOCKED', (e) => e.powers.forEach((p) => (report.unlocks[p] ??= now())));
  sim.bus.on('PROMOTED', (e) => report.promotions.push({ rank: e.rank, t: now() }));
  sim.bus.on('XP_GAINED', (e) => {
    const k = e.reason.split(':')[0].replace(/^(First|Discovered|Discovered:) .*/, '$1');
    report.xpBySource[k] = (report.xpBySource[k] ?? 0) + e.amount;
  });
  sim.bus.on('CHALLENGE_COMPLETED', () => {
    report.challenges++;
    report.firstChallenge ??= now();
  });
  const cultural = () => (report.firstCultural ??= now());
  sim.bus.on('SURREAL_EVENT', cultural);
  sim.bus.on('RELIGION_FOUNDED', cultural);
  const targets = new Map<string, number>();
  let focus: VillageData = s.villages[0];

  const cast = (id: PowerId, x: number, z: number, spread = 5): boolean => {
    if (!s.unlockedPowers.includes(id) || s.cooldowns[id] > 0) return false;
    for (let k = 0; k < 24; k++) {
      const a = k * 2.4;
      const r = (k / 24) * spread;
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      if (!sim.powers.check(id, px, pz).ok) continue;
      const before = s.energy;
      if (!sim.powers.activate(id, px, pz).ok) return false;
      report.energySpent += Math.max(0, before - s.energy);
      report.casts[id] = (report.casts[id] ?? 0) + 1;
      const key = `${id}:${Math.round(px / 8)}:${Math.round(pz / 8)}`;
      targets.set(key, (targets.get(key) ?? 0) + 1);
      return true;
    }
    return false;
  };
  const near = (v: VillageData, r: number) => {
    const a = rnd() * Math.PI * 2;
    const d = r * (0.4 + rnd() * 0.6);
    return { x: v.centerX + Math.cos(a) * d, z: v.centerZ + Math.sin(a) * d };
  };
  const well = (v: VillageData) => s.buildings[v.wellId] ?? { x: v.centerX, z: v.centerZ };
  const farm = (v: VillageData) => s.buildings.find((b) => b.villageId === v.id && b.type === 'farm' && !b.destroyed);
  const villageFires = () => s.fires.filter((f) => f.intensity > 0 && sim.nearestVillage(f.x, f.z).distance < 26);
  const answerPrayer = (): boolean => {
    const p = s.prayers.filter((q) => q.status === 'active').sort((a, b) => b.priority - a.priority)[0];
    if (!p) return false;
    const v = sim.village(p.villageId) ?? focus;
    focus = v;
    switch (p.type) {
      case 'THIRST': case 'EQUAL_TREATMENT': case 'PURIFY': return cast('rain', well(v).x, well(v).z);
      case 'HUNGER': { const f = farm(v); return f ? cast('rain', f.x, f.z) || cast('nature', f.x + 4, f.z + 4, 8) : false; }
      case 'FIRE': { const f = villageFires()[0]; return f ? cast('rain', f.x, f.z, 3) : false; }
      case 'GREEN': { const q = near(v, v.radius + 6); return cast('nature', q.x, q.z, 8); }
      case 'ROCK_KING': { const r = s.rocks.find((k) => sim.nearestVillage(k.x, k.z).village?.id === v.id) ?? s.rocks[0]; return r ? cast('lightning', r.x, r.z, 1) : false; }
      case 'STILL_EMPLOYED': return cast('rain', v.centerX, v.centerZ);
      default: return false;
    }
  };
  const benevolent = (): boolean => {
    if (answerPrayer()) return true;
    const f = villageFires()[0];
    if (f && (cast('rain', f.x, f.z, 3) || cast('freeze', f.x, f.z, 3))) return true;
    const thirsty = s.villages.find((v) => v.water < 45);
    if (thirsty && cast('rain', well(thirsty).x, well(thirsty).z)) return true;
    const hungry = s.villages.find((v) => v.food < 45);
    const hf = hungry && farm(hungry);
    if (hf && cast('rain', hf.x, hf.z)) return true;
    const roll = rnd();
    if (roll < 0.12 && s.unlockedPowers.includes('timewarp')) return cast('timewarp', focus.centerX, focus.centerZ, 6);
    if (roll < 0.2 && s.unlockedPowers.includes('gravity')) { const q = near(focus, focus.radius); return cast('gravity', q.x, q.z, 6); }
    if (roll < 0.26 && s.unlockedPowers.includes('terraform')) { const q = near(focus, focus.radius + 14); return cast('terraform', q.x, q.z, 8); }
    if (roll < 0.3 && s.unlockedPowers.includes('tornado')) { const q = near(focus, focus.radius + 22); return cast('tornado', q.x, q.z, 10); }
    if (roll < 0.34 && s.unlockedPowers.includes('mutation')) { const t = s.trees.find((k) => !k.removed && k.byPlayer); return t ? cast('mutation', t.x, t.z, 1) : false; }
    if (roll < 0.37 && s.unlockedPowers.includes('resurrection') && s.graveyard.length) return cast('resurrection', s.graveyard[0].x, s.graveyard[0].z, 2);
    if (roll < 0.40 && s.rocks.length) { const r = s.rocks[Math.floor(rnd() * s.rocks.length)]; return cast('lightning', r.x, r.z, 1); }
    if (s.trees.filter((t) => t.byPlayer && !t.removed).length < 60) { const q = near(focus, focus.radius + 8); return cast('nature', q.x, q.z, 6); }
    return false;
  };
  const chaotic = (): boolean => {
    const roll = rnd();
    const v = focus;
    if (roll < 0.15 && cast('meteor', ...xy(near(v, v.radius + 18)), 10)) return true;
    if (roll < 0.3 && cast('tornado', ...xy(near(v, v.radius + 6)), 10)) return true;
    if (roll < 0.4) { const t = s.trees.find((k) => !k.removed && sim.nearestVillage(k.x, k.z).village?.id === v.id); if (t && cast('mutation', t.x, t.z, 1)) return true; }
    if (roll < 0.5 && cast('gravity', v.centerX, v.centerZ, 6)) return true;
    if (roll < 0.62) { const r = s.rocks[Math.floor(rnd() * s.rocks.length)]; if (r && cast('lightning', r.x, r.z, 1)) return true; }
    if (roll < 0.8) { const t = s.trees.find((k) => !k.removed && !k.burning && sim.nearestVillage(k.x, k.z).distance < v.radius + 10); if (t && cast('fire', t.x, t.z, 1)) return true; }
    if (roll < 0.88 && cast('freeze', v.centerX, v.centerZ, 6)) return true;
    if (roll < 0.94 && cast('terraform', ...xy(near(v, v.radius + 12)), 8)) return true;
    // Even a chaotic intern cleans up sometimes (rain on a fire, answer a prayer).
    return answerPrayer() || cast('lightning', ...xy(near(v, v.radius)), 6);
  };
  const exploratory = (): boolean => {
    if (rnd() < 0.45 && answerPrayer()) return true;
    const pool = s.unlockedPowers.filter((p) => p !== 'possession') as PowerId[];
    const id = pool[Math.floor(rnd() * pool.length)];
    const q = near(focus, focus.radius + 10);
    if (id === 'lightning' && rnd() < 0.5) { const r = s.rocks[Math.floor(rnd() * s.rocks.length)]; if (r) return cast('lightning', r.x, r.z, 1); }
    if (id === 'resurrection' && s.graveyard.length) return cast('resurrection', s.graveyard[0].x, s.graveyard[0].z, 2);
    return cast(id, q.x, q.z, 10);
  };
  const spammer = (): boolean => {
    // Destructive repetition at one spot: the thing the economy must not reward.
    const r = s.rocks[0];
    return cast('lightning', r.x, r.z, 1) || cast('fire', focus.centerX + 10, focus.centerZ + 10, 8);
  };
  const decide = { benevolent, chaotic, exploratory, spammer }[strategy];

  const steps = Math.round(seconds / DT);
  const decisionEvery = Math.round(Number(process.env.BOT_DECISION ?? 6) / DT);
  const marks = [300, 600, 1200, 1800, 3600, 7200, 10800, 14400, 18000];
  for (let i = 1; i <= steps; i++) {
    sim.step(DT);
    sim.civ.cameraAt(focus.centerX, focus.centerZ, DT);
    if (i % decisionEvery === 0 && !s.possession) {
      report.decisions++;
      if (!decide()) report.idleDecisions++;
      // A player looks around: change village every ~minute (exploratory more often).
      if (rnd() < (strategy === 'exploratory' ? 0.12 : 0.06)) focus = s.villages[Math.floor(rnd() * s.villages.length)];
    }
    const t = i * DT;
    if (i % Math.round(60 / DT) === 0) report.timeline.push(Math.round(s.career.xp));
    for (const m of marks) if (Math.abs(t - m) < DT / 2) report.rankAt[`${m / 60}min`] = s.career.rank;
  }
  report.xp = s.career.xp;
  const total = [...targets.values()].reduce((a, b) => a + b, 0);
  report.repeatedTargetShare = total ? Math.max(...targets.values()) / total : 0;
  return report;
}

function xy(p: { x: number; z: number }): [number, number] {
  return [p.x, p.z];
}
