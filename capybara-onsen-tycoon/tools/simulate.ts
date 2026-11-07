/**
 * Balancing simulator: a greedy bot plays the pure economy model.
 *
 *   npm run simulate            → prints the table, writes tools/out/simulation.csv
 *
 * Schedule: 30 min active, then repeat [8 h offline, 15 min active].
 * Bot: merges whenever possible, digs when the pool pays back fast enough,
 * buys the upgrade with the best payback, taps 50% of golden guests,
 * never watches videos.
 */
import { CONFIG, type EconomyConfig } from '../src/economy/config.ts';
import {
  type GameState,
  type UpgradeId,
  UPGRADE_IDS,
  activateGolden,
  baseProduction,
  buyUpgrade,
  canMerge,
  collectOffline,
  computeOffline,
  createState,
  createTickEvents,
  dig,
  digCost,
  digLevel,
  firstEmptySlot,
  globalMultiplier,
  moveOrMerge,
  nextUpgradeCost,
  offlineCapSec,
  poolProduction,
  tick,
} from '../src/economy/model.ts';

export interface SimOptions {
  firstSessionSec: number;
  sessionSec: number;
  pauseSec: number;
  goldenTapChance: number;
  /** stop after this much wall-clock time */
  maxWallSec: number;
  seed: number;
  /** pool / upgrade payback limits for the bot (seconds) */
  digPayback: number;
  upgradePayback: number;
  saveForUpgradeSec: number;
}

export const DEFAULT_SIM: SimOptions = {
  firstSessionSec: 30 * 60,
  sessionSec: 15 * 60,
  pauseSec: 8 * 3600,
  goldenTapChance: 0.5,
  maxWallSec: 30 * 86400,
  seed: 12345,
  digPayback: 600,
  upgradePayback: 900,
  saveForUpgradeSec: 90,
};

export interface LevelReach {
  level: number;
  /** cumulated active play seconds */
  activeSec: number;
  /** active + offline seconds that actually produced (capped by the offline limit) */
  creditedSec: number;
  /** real elapsed time, pauses included */
  wallSec: number;
}

export interface SimResult {
  reaches: LevelReach[];
  final: GameState;
  maxCoins: number;
  sessions: number;
  log: { activeSec: number; wallSec: number; coins: number; prod: number; maxLevel: number; upgrades: string; poolsBought: number }[];
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Merge every possible pair, lowest levels first. */
export function mergeAll(s: GameState, cfg: EconomyConfig): number {
  let merges = 0;
  for (;;) {
    let bestA = -1;
    let bestB = -1;
    let bestLevel = Infinity;
    for (let i = 0; i < s.grid.length; i++) {
      const a = s.grid[i];
      if (a === 0 || a >= bestLevel) continue;
      for (let j = i + 1; j < s.grid.length; j++) {
        if (canMerge(a, s.grid[j], cfg)) {
          bestA = j;
          bestB = i;
          bestLevel = a;
          break;
        }
      }
    }
    if (bestA < 0) return merges;
    moveOrMerge(s, bestA, bestB, cfg);
    merges++;
  }
}

/** Estimated extra coins/s an upgrade gives (bot heuristic). */
function upgradeGain(s: GameState, id: UpgradeId, cfg: EconomyConfig, opt: SimOptions): number {
  const base = Math.max(baseProduction(s, cfg), 1e-9);
  switch (id) {
    case 'hotWater':
      return base * (cfg.upgrades.hotWater.multPerLevel - 1);
    case 'shovel':
      // every future pool is worth twice as much: roughly doubles growth
      return base;
    case 'longRest': {
      if (offlineCapSec(s, cfg) >= opt.pauseSec) return 0;
      // one more offline hour per active session
      return (cfg.offline.rate * base * 3600 * cfg.upgrades.longRest.hoursPerLevel) / opt.sessionSec;
    }
  }
}

function bestUpgrade(s: GameState, cfg: EconomyConfig, opt: SimOptions): { id: UpgradeId; cost: number; payback: number } | null {
  let best: { id: UpgradeId; cost: number; payback: number } | null = null;
  for (const id of UPGRADE_IDS) {
    const cost = nextUpgradeCost(s, id, cfg);
    if (!Number.isFinite(cost)) continue;
    const gain = upgradeGain(s, id, cfg, opt);
    if (gain <= 0) continue;
    const payback = cost / gain;
    if (!best || payback < best.payback) best = { id, cost, payback };
  }
  return best;
}

function botSpend(s: GameState, cfg: EconomyConfig, opt: SimOptions): void {
  for (let guard = 0; guard < 500; guard++) {
    mergeAll(s, cfg);
    const up = bestUpgrade(s, cfg, opt);
    if (up && up.payback <= opt.upgradePayback) {
      if (s.coins >= up.cost) {
        buyUpgrade(s, up.id, cfg);
        continue;
      }
      const prod = Math.max(baseProduction(s, cfg), 1e-9);
      if ((up.cost - s.coins) / prod <= opt.saveForUpgradeSec) return; // save up
    }
    if (firstEmptySlot(s.grid) >= 0) {
      const cost = digCost(s, cfg);
      const gain = poolProduction(digLevel(s, cfg), cfg) * globalMultiplier(s, cfg);
      if (s.coins >= cost && cost / gain <= opt.digPayback) {
        dig(s, cfg);
        continue;
      }
    }
    return;
  }
}

export function simulate(cfg: EconomyConfig = CONFIG, options: Partial<SimOptions> = {}): SimResult {
  const opt = { ...DEFAULT_SIM, ...options };
  const rng = mulberry32(opt.seed);
  const s = createState(0, cfg, rng);
  const ev = createTickEvents(cfg);
  const reaches: LevelReach[] = [];
  const log: SimResult['log'] = [];
  let active = 0;
  let credited = 0;
  let wall = 0;
  let maxCoins = 0;
  let sessions = 0;
  let reported = 0;

  const record = () => {
    while (reported < s.maxLevel) {
      reported++;
      reaches.push({ level: reported, activeSec: active, creditedSec: credited, wallSec: wall });
    }
  };

  const snapshot = () =>
    log.push({
      activeSec: active,
      wallSec: wall,
      coins: s.coins,
      prod: baseProduction(s, cfg),
      maxLevel: s.maxLevel,
      upgrades: `${s.upgrades.hotWater}/${s.upgrades.shovel}/${s.upgrades.longRest}`,
      poolsBought: s.poolsBought,
    });

  while (wall < opt.maxWallSec && s.maxLevel < cfg.maxLevel) {
    const len = sessions === 0 ? opt.firstSessionSec : opt.sessionSec;
    sessions++;
    botSpend(s, cfg, opt);
    record();
    for (let t = 0; t < len && s.maxLevel < cfg.maxLevel; t++) {
      tick(s, 1, ev, cfg, rng);
      active += 1;
      credited += 1;
      wall += 1;
      if (ev.guestAppeared && rng() < opt.goldenTapChance) activateGolden(s, cfg.golden.tapDurationSec);
      botSpend(s, cfg, opt);
      if (s.coins > maxCoins) maxCoins = s.coins;
      record();
      if (active % 60 === 0) snapshot();
    }
    if (s.maxLevel >= cfg.maxLevel) break;
    // offline pause (boosts expire, no spawns while away)
    s.goldenTime = 0;
    s.boostTime = 0;
    const off = computeOffline(s, opt.pauseSec, cfg);
    collectOffline(s, off.amount, false);
    if (s.coins > maxCoins) maxCoins = s.coins;
    credited += off.creditedSec;
    wall += opt.pauseSec;
  }
  snapshot();
  return { reaches, final: s, maxCoins, sessions, log };
}

/** Target curve (spec §5). metric: which clock the target is measured on. */
export const TARGETS: { level: number; targetSec: number; metric: 'activeSec' | 'creditedSec' }[] = [
  { level: 4, targetSec: 2 * 60, metric: 'activeSec' },
  { level: 6, targetSec: 10 * 60, metric: 'activeSec' },
  { level: 8, targetSec: 35 * 60, metric: 'activeSec' },
  { level: 10, targetSec: 3 * 3600, metric: 'creditedSec' },
  { level: 12, targetSec: 3 * 86400, metric: 'creditedSec' },
];
export const TOLERANCE = 0.35;

function fmtTime(sec: number): string {
  if (sec < 3600) return `${(sec / 60).toFixed(1)} min`;
  if (sec < 86400 * 2) return `${(sec / 3600).toFixed(2)} h`;
  return `${(sec / 86400).toFixed(2)} d`;
}

export function report(res: SimResult): { text: string; csv: string; allOk: boolean } {
  const lines: string[] = [];
  const csv: string[] = ['level,active_sec,credited_sec,wall_sec,target_sec,target_metric,ratio,ok'];
  let allOk = true;
  lines.push('Level | Active time | Active+offline credited | Wall clock | Target            | Ratio | OK');
  lines.push('------|-------------|-------------------------|------------|-------------------|-------|---');
  for (let L = 2; L <= CONFIG.maxLevel; L++) {
    const r = res.reaches.find((x) => x.level === L);
    const t = TARGETS.find((x) => x.level === L);
    let target = '';
    let ratio = '';
    let ok = '';
    if (t) {
      const v = r ? r[t.metric] : Infinity;
      const q = v / t.targetSec;
      const pass = q >= 1 - TOLERANCE && q <= 1 + TOLERANCE;
      if (!pass) allOk = false;
      target = `${fmtTime(t.targetSec)} (${t.metric === 'activeSec' ? 'active' : 'credited'})`;
      ratio = Number.isFinite(q) ? q.toFixed(2) : '—';
      ok = pass ? 'yes' : 'NO';
    }
    lines.push(
      `${String(L).padStart(5)} | ${(r ? fmtTime(r.activeSec) : '—').padStart(11)} | ${(r ? fmtTime(r.creditedSec) : '—').padStart(23)} | ${(r ? fmtTime(r.wallSec) : '—').padStart(10)} | ${target.padEnd(17)} | ${ratio.padStart(5)} | ${ok}`,
    );
    csv.push([L, r?.activeSec ?? '', r?.creditedSec ?? '', r?.wallSec ?? '', t?.targetSec ?? '', t?.metric ?? '', ratio, ok].join(','));
  }
  const f = res.final;
  lines.push('');
  lines.push(
    `Sessions: ${res.sessions} · pools bought: ${f.poolsBought} · upgrades hotWater/shovel/longRest: ${f.upgrades.hotWater}/${f.upgrades.shovel}/${f.upgrades.longRest} · max coins held: ${res.maxCoins.toExponential(2)} · merges: ${f.merges}`,
  );
  lines.push(allOk ? 'RESULT: curve within ±35% of every target ✔' : 'RESULT: curve OUT of target ✘');
  return { text: lines.join('\n'), csv: csv.join('\n') + '\n', allOk };
}

// CLI entry point
const isMain = typeof process !== 'undefined' && process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop() ?? '#');
if (isMain) {
  const fs = await import('node:fs');
  const res = simulate();
  const { text, csv, allOk } = report(res);
  process.stdout.write(text + '\n');
  fs.mkdirSync('tools/out', { recursive: true });
  fs.writeFileSync('tools/out/simulation.csv', csv);
  const logCsv = ['active_sec,wall_sec,coins,prod_per_sec,max_level,upgrades_hw_sh_lr,pools_bought']
    .concat(res.log.map((r) => [r.activeSec, r.wallSec, r.coins.toExponential(3), r.prod.toExponential(3), r.maxLevel, r.upgrades, r.poolsBought].join(',')))
    .join('\n');
  fs.writeFileSync('tools/out/simulation_timeline.csv', logCsv + '\n');
  process.stdout.write('CSV written to tools/out/simulation.csv and tools/out/simulation_timeline.csv\n');
  if (!allOk) process.exitCode = 1;
}
