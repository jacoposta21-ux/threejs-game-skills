/**
 * Every economy constant lives here. The game, the tests and the balancing
 * simulator (tools/simulate.ts) all read from this object.
 * Balancing changes go ONLY in this file (see PROGRESS.md for the history).
 */
export interface UpgradeConfig {
  baseCost: number;
  growth: number;
  max: number;
}

export interface EconomyConfig {
  cols: number;
  rows: number;
  maxLevel: number;
  /** produzione(L) = base × growth^(L−1) coins/s */
  production: { base: number; growth: number };
  /** cost = ceil(baseCost × growth^n), n = pools bought this game */
  dig: { baseCost: number; growth: number };
  autoSpawnSec: number;
  /** level-1 pools on the board when a new game starts (instant first merge) */
  startPools: number;
  upgrades: {
    /** global production ×multPerLevel per level */
    hotWater: UpgradeConfig & { multPerLevel: number };
    /** digLevel +1 per level */
    shovel: UpgradeConfig;
    /** offline cap +hoursPerLevel per level */
    longRest: UpgradeConfig & { hoursPerLevel: number };
  };
  offline: { rate: number; baseCapHours: number; minAwaySec: number };
  golden: {
    minIntervalSec: number;
    maxIntervalSec: number;
    crossSec: number;
    mult: number;
    tapDurationSec: number;
    videoDurationSec: number;
  };
  boost: { mult: number; durationSec: number };
}

export const CONFIG: EconomyConfig = {
  cols: 5,
  rows: 4,
  maxLevel: 12,
  production: { base: 1, growth: 2.3 }, // spec
  // spec: 5 × 1.07^n — tuned (see PROGRESS.md "Balancing"): purchases were ~50× too cheap
  dig: { baseCost: 500, growth: 1.18 },
  // spec: 10 s — the free pool alone would hit L6 in ~5 min (target 10 min)
  autoSpawnSec: 22,
  startPools: 2,
  upgrades: {
    // spec: 100 × 4^k
    hotWater: { baseCost: 2500, growth: 5.5, max: 20, multPerLevel: 1.5 },
    // spec: 500 × 12^k — the shovel is the biggest lever on the curve
    shovel: { baseCost: 30000, growth: 60, max: 5 },
    // spec: 1000 × 6^k
    longRest: { baseCost: 10_000_000, growth: 1.5, max: 6, hoursPerLevel: 1 },
  },
  // spec: base cap 2 h — with an 8 h first pause L10 could never land near "3 h incl. offline"
  offline: { rate: 0.5, baseCapHours: 1, minAwaySec: 60 },
  golden: {
    minIntervalSec: 90,
    maxIntervalSec: 150,
    crossSec: 8,
    mult: 3,
    tapDurationSec: 30,
    videoDurationSec: 180,
  },
  boost: { mult: 2, durationSec: 300 },
};

/** Ad pacing (not economy, but kept with the other tunables). */
export const AD_POLICY = {
  midgameCooldownSec: 180,
  midgameGraceSec: 300,
};
