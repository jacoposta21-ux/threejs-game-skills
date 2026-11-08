// Meta-progression: missions (3 active, rotating), permanent achievements,
// lifetime stats and the daily challenge. Pure data + logic on top of the
// SaveManager; the UI only renders what this module reports.

import { THEME_DISTANCE } from './Config.js';

// Mission templates. `run` missions are judged within a single run;
// `total` missions accumulate across runs.
const MISSIONS = {
  nearMissRun: { scope: 'run', stat: 'nearMisses', targets: [5, 10, 18, 30], text: (n) => `Make ${n} near misses in one run` },
  energyRun: { scope: 'run', stat: 'energy', targets: [30, 60, 100, 160], text: (n) => `Collect ${n} energy in one run` },
  distanceRun: { scope: 'run', stat: 'distance', targets: [800, 1500, 2500, 4000], text: (n) => `Travel ${n.toLocaleString('en-US')} m in one run` },
  zoneRun: { scope: 'run', stat: 'zone', targets: [2, 3, 4, 5], text: (n) => `Reach zone ${n}` },
  multRun: { scope: 'run', stat: 'maxMultiplier', targets: [3, 5, 7, 8], text: (n) => `Reach a ×${n} multiplier` },
  surviveRun: { scope: 'run', stat: 'time', targets: [30, 60, 100, 150], text: (n) => `Survive ${n} seconds` },
  powerupsTotal: { scope: 'total', stat: 'powerups', targets: [3, 6, 10, 15], text: (n) => `Collect ${n} power-ups` },
  smashTotal: { scope: 'total', stat: 'smashes', targets: [3, 8, 15, 25], text: (n) => `Smash ${n} obstacles while boosting` },
  runsTotal: { scope: 'total', stat: 'runs', targets: [3, 5, 8, 12], text: (n) => `Play ${n} runs` },
};
const REWARDS = [40, 80, 140, 220];

export const ACHIEVEMENTS = [
  { id: 'first_run', name: 'IGNITION', text: 'Finish your first run' },
  { id: 'dist_1k', name: 'LIGHT SPEED', text: 'Travel 1,000 m in one run' },
  { id: 'dist_5k', name: 'HYPERDRIVE', text: 'Travel 5,000 m in one run' },
  { id: 'zone_2', name: 'TOXIC TOURIST', text: 'Reach Toxic Green (zone 2)' },
  { id: 'zone_3', name: 'SUN DIVER', text: 'Reach Solar Core (zone 3)' },
  { id: 'zone_4', name: 'VOID WALKER', text: 'Reach Violet Void (zone 4)' },
  { id: 'zone_5', name: 'QUANTUM LEAP', text: 'Reach Quantum White (zone 5)', unlocks: 'pulsar' },
  { id: 'near_25', name: 'RAZOR EDGE', text: '25 near misses in one run', unlocks: 'prism' },
  { id: 'mult_8', name: 'MAXED OUT', text: 'Reach the ×8 multiplier' },
  { id: 'shield_save', name: 'SAVED BY THE SHIELD', text: 'Survive a hit with a shield' },
  { id: 'smash_10', name: 'WRECKING BALL', text: 'Smash 10 obstacles while boosting' },
  { id: 'energy_1000', name: 'POWER PLANT', text: 'Collect 1,000 energy in total' },
  { id: 'runs_25', name: 'DEDICATED', text: 'Play 25 runs' },
  { id: 'daily', name: 'DAILY DRIVER', text: 'Finish a daily run' },
  { id: 'missions_15', name: 'MISSION CONTROL', text: 'Complete 15 missions', unlocks: 'aurum' },
];

export function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Deterministic 32-bit seed from a date key, identical for every player. */
export function dailySeed(key = todayKey()) {
  let h = 2166136261;
  const str = `neon-tunnel-daily-${key}`;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function newRunStats() {
  return { distance: 0, energy: 0, nearMisses: 0, maxMultiplier: 1, powerups: 0, smashes: 0, time: 0, zone: 1, shieldSaves: 0, score: 0 };
}

export class Progression {
  constructor(save) {
    this.save = save;
    this.ensure();
  }

  get data() {
    return this.save.data;
  }

  ensure() {
    const d = this.data;
    d.stats = {
      runs: 0, totalDistance: 0, totalEnergy: 0, nearMisses: 0, powerups: 0, smashes: 0,
      totalTime: 0, bestZone: 1, missionsDone: 0, bestMultiplier: 1, ...(d.stats || {}),
    };
    d.achievements = Array.isArray(d.achievements) ? d.achievements : [];
    d.missions = Array.isArray(d.missions) ? d.missions.filter((m) => MISSIONS[m.type]) : [];
    d.missionLevel = d.missionLevel || {};
    d.daily = d.daily || { key: '', best: 0, runs: 0 };
    while (d.missions.length < 3) d.missions.push(this.rollMission(d.missions));
  }

  rollMission(existing) {
    const used = new Set(existing.map((m) => m.type));
    const types = Object.keys(MISSIONS).filter((t) => !used.has(t));
    const type = types[Math.floor(Math.random() * types.length)];
    const level = Math.min(3, this.data.missionLevel?.[type] ?? 0);
    const def = MISSIONS[type];
    return { type, level, target: def.targets[level], reward: REWARDS[level], base: def.scope === 'total' ? this.statFor(def.stat) : 0 };
  }

  statFor(stat) {
    const s = this.data.stats;
    return { powerups: s.powerups, smashes: s.smashes, runs: s.runs }[stat] ?? 0;
  }

  missionText(m) {
    return MISSIONS[m.type].text(m.target);
  }

  /** Progress 0..target for a mission given the current run (live or final). */
  missionProgress(m, run) {
    const def = MISSIONS[m.type];
    if (def.scope === 'run') return Math.min(m.target, run ? run[def.stat] : 0);
    const runPart = run ? run[def.stat] ?? 0 : 0;
    const extra = def.stat === 'runs' && run ? 1 : 0;
    return Math.min(m.target, this.statFor(def.stat) - m.base + (def.stat === 'runs' ? extra : runPart));
  }

  /** Missions completed live during a run (for toasts); marks them so they toast once. */
  checkLive(run) {
    const done = [];
    for (const m of this.data.missions) {
      if (m.liveDone) continue;
      if (MISSIONS[m.type].stat === 'runs') continue;
      if (this.missionProgress(m, run) >= m.target) {
        m.liveDone = true;
        done.push(m);
      }
    }
    return done;
  }

  /**
   * Commits a finished run: stats, missions (rewards + replacements),
   * achievements and daily best. Returns a summary for the Game Over screen.
   */
  commitRun(run, { daily }) {
    const d = this.data;
    const s = d.stats;
    const summary = { missions: [], rewards: 0, achievements: [], unlockedSkins: [] };

    // missions are judged before lifetime totals change (base snapshots)
    const finished = [];
    for (const m of d.missions) {
      const progress = this.missionProgress(m, run);
      const complete = progress >= m.target;
      summary.missions.push({ text: this.missionText(m), progress, target: m.target, reward: m.reward, complete });
      if (complete) finished.push(m);
    }

    s.runs += 1;
    s.totalDistance += run.distance;
    s.totalEnergy += run.energy;
    s.nearMisses += run.nearMisses;
    s.powerups += run.powerups;
    s.smashes += run.smashes;
    s.totalTime += run.time;
    s.bestZone = Math.max(s.bestZone, run.zone);
    s.bestMultiplier = Math.max(s.bestMultiplier, run.maxMultiplier);

    for (const m of finished) {
      summary.rewards += m.reward;
      s.missionsDone += 1;
      d.missionLevel[m.type] = Math.min(3, (d.missionLevel[m.type] ?? 0) + 1);
    }
    d.energyBank += summary.rewards;
    d.missions = d.missions.filter((m) => !finished.includes(m));
    for (const m of d.missions) m.liveDone = false;
    while (d.missions.length < 3) d.missions.push(this.rollMission(d.missions));

    if (daily) {
      const key = todayKey();
      if (d.daily.key !== key) d.daily = { key, best: 0, runs: 0 };
      d.daily.runs += 1;
      summary.dailyBest = run.score > d.daily.best;
      d.daily.best = Math.max(d.daily.best, run.score);
    }

    const check = (id, cond) => {
      if (cond && !d.achievements.includes(id)) {
        d.achievements.push(id);
        const a = ACHIEVEMENTS.find((x) => x.id === id);
        summary.achievements.push(a);
        if (a.unlocks && !d.unlockedSkins.includes(a.unlocks)) {
          d.unlockedSkins.push(a.unlocks);
          summary.unlockedSkins.push(a.unlocks);
        }
      }
    };
    check('first_run', true);
    check('dist_1k', run.distance >= 1000);
    check('dist_5k', run.distance >= 5000);
    for (let z = 2; z <= 5; z += 1) check(`zone_${z}`, run.zone >= z);
    check('near_25', run.nearMisses >= 25);
    check('mult_8', run.maxMultiplier >= 8);
    check('shield_save', run.shieldSaves > 0);
    check('smash_10', s.smashes >= 10);
    check('energy_1000', s.totalEnergy >= 1000);
    check('runs_25', s.runs >= 25);
    check('daily', !!daily);
    check('missions_15', s.missionsDone >= 15);

    this.save.save();
    return summary;
  }

  dailyBestToday() {
    const d = this.data.daily;
    return d.key === todayKey() ? d.best : 0;
  }

  zoneFor(distance) {
    return Math.floor(distance / THEME_DISTANCE) + 1;
  }
}
