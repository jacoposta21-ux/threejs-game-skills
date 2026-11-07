/**
 * Pure economy model: no Phaser, no DOM. Shared by the game and the simulator.
 * Functions mutate the GameState passed in and never allocate in tick().
 */
import { CONFIG, type EconomyConfig } from './config.ts';

export type UpgradeId = 'hotWater' | 'shovel' | 'longRest';
export const UPGRADE_IDS: readonly UpgradeId[] = ['hotWater', 'shovel', 'longRest'];

export interface GameState {
  v: 1;
  coins: number;
  /** cols*rows slots; 0 = empty, 1..maxLevel = pool level */
  grid: number[];
  poolsBought: number;
  upgrades: Record<UpgradeId, number>;
  spawnTimer: number;
  /** unlocked[L-1] = capybara L discovered */
  unlocked: boolean[];
  maxLevel: number;
  /** active play seconds */
  playTime: number;
  totalEarned: number;
  /** remaining seconds of the golden-guest multiplier */
  goldenTime: number;
  /** remaining seconds of the manual video boost */
  boostTime: number;
  /** seconds until the next golden guest appears */
  nextGuestIn: number;
  merges: number;
  /** epoch ms of the last save / tick, used for offline earnings */
  lastSeen: number;
  muted: boolean;
}

export type Rng = () => number;

export function createState(now = 0, cfg: EconomyConfig = CONFIG, rng: Rng = Math.random): GameState {
  const s: GameState = {
    v: 1,
    coins: 0,
    grid: new Array(cfg.cols * cfg.rows).fill(0),
    poolsBought: 0,
    upgrades: { hotWater: 0, shovel: 0, longRest: 0 },
    spawnTimer: 0,
    unlocked: new Array(cfg.maxLevel).fill(false),
    maxLevel: 0,
    playTime: 0,
    totalEarned: 0,
    goldenTime: 0,
    boostTime: 0,
    nextGuestIn: nextGuestDelay(cfg, rng),
    merges: 0,
    lastSeen: now,
    muted: false,
  };
  for (let i = 0; i < cfg.startPools && i < s.grid.length; i++) s.grid[i] = 1;
  if (cfg.startPools > 0) discover(s, 1);
  return s;
}

export function nextGuestDelay(cfg: EconomyConfig = CONFIG, rng: Rng = Math.random): number {
  const g = cfg.golden;
  return g.minIntervalSec + rng() * (g.maxIntervalSec - g.minIntervalSec);
}

// ---------------------------------------------------------------- production

export function poolProduction(level: number, cfg: EconomyConfig = CONFIG): number {
  if (level <= 0) return 0;
  return cfg.production.base * Math.pow(cfg.production.growth, level - 1);
}

/** Permanent multiplier from upgrades. */
export function globalMultiplier(s: GameState, cfg: EconomyConfig = CONFIG): number {
  return Math.pow(cfg.upgrades.hotWater.multPerLevel, s.upgrades.hotWater);
}

/** Temporary multiplier from golden guest / video boost. */
export function tempMultiplier(s: GameState, cfg: EconomyConfig = CONFIG): number {
  return (s.goldenTime > 0 ? cfg.golden.mult : 1) * (s.boostTime > 0 ? cfg.boost.mult : 1);
}

/** Production per second without temporary boosts. */
export function baseProduction(s: GameState, cfg: EconomyConfig = CONFIG): number {
  let sum = 0;
  for (let i = 0; i < s.grid.length; i++) sum += poolProduction(s.grid[i], cfg);
  return sum * globalMultiplier(s, cfg);
}

export function productionPerSec(s: GameState, cfg: EconomyConfig = CONFIG): number {
  return baseProduction(s, cfg) * tempMultiplier(s, cfg);
}

/** Production of one pool including all multipliers (for floating numbers). */
export function poolRate(s: GameState, level: number, cfg: EconomyConfig = CONFIG): number {
  return poolProduction(level, cfg) * globalMultiplier(s, cfg) * tempMultiplier(s, cfg);
}

// ---------------------------------------------------------------- album

/** Marks level as discovered. Returns true the first time. */
export function discover(s: GameState, level: number): boolean {
  if (level > s.maxLevel) s.maxLevel = level;
  if (level < 1 || level > s.unlocked.length || s.unlocked[level - 1]) return false;
  s.unlocked[level - 1] = true;
  return true;
}

export function unlockedCount(s: GameState): number {
  let n = 0;
  for (const u of s.unlocked) if (u) n++;
  return n;
}

// ---------------------------------------------------------------- digging

export function digLevel(s: GameState, cfg: EconomyConfig = CONFIG): number {
  return Math.min(cfg.maxLevel, 1 + s.upgrades.shovel);
}

export function digCost(s: GameState, cfg: EconomyConfig = CONFIG): number {
  return Math.ceil(cfg.dig.baseCost * Math.pow(cfg.dig.growth, s.poolsBought));
}

export function firstEmptySlot(grid: readonly number[]): number {
  for (let i = 0; i < grid.length; i++) if (grid[i] === 0) return i;
  return -1;
}

export function isGridFull(s: GameState): boolean {
  return firstEmptySlot(s.grid) < 0;
}

export function canDig(s: GameState, cfg: EconomyConfig = CONFIG): boolean {
  return !isGridFull(s) && s.coins >= digCost(s, cfg);
}

export interface PlaceResult {
  slot: number;
  level: number;
  isNew: boolean;
}

function placePool(s: GameState, out: PlaceResult, cfg: EconomyConfig): boolean {
  const slot = firstEmptySlot(s.grid);
  if (slot < 0) return false;
  const level = digLevel(s, cfg);
  s.grid[slot] = level;
  out.slot = slot;
  out.level = level;
  out.isNew = discover(s, level);
  return true;
}

/** Buys a pool. Returns null if not possible. */
export function dig(s: GameState, cfg: EconomyConfig = CONFIG): PlaceResult | null {
  if (!canDig(s, cfg)) return null;
  const cost = digCost(s, cfg);
  const out: PlaceResult = { slot: -1, level: 0, isNew: false };
  if (!placePool(s, out, cfg)) return null;
  s.coins -= cost;
  s.poolsBought++;
  return out;
}

// ---------------------------------------------------------------- merge / move

export type MoveKind = 'merge' | 'move' | 'swap' | 'none';
export interface MoveResult {
  kind: MoveKind;
  /** level now in the destination slot */
  level: number;
  isNew: boolean;
}

export function canMerge(a: number, b: number, cfg: EconomyConfig = CONFIG): boolean {
  return a > 0 && a === b && a < cfg.maxLevel;
}

/**
 * Drag pool `from` onto slot `to`:
 *  - same level (< max) → merge into `to` at level+1
 *  - empty → move
 *  - different level (or both max level) → swap
 */
export function moveOrMerge(s: GameState, from: number, to: number, cfg: EconomyConfig = CONFIG): MoveResult {
  const g = s.grid;
  const res: MoveResult = { kind: 'none', level: 0, isNew: false };
  if (from === to || from < 0 || to < 0 || from >= g.length || to >= g.length) return res;
  const a = g[from];
  const b = g[to];
  if (a === 0) return res;
  if (b === 0) {
    g[to] = a;
    g[from] = 0;
    res.kind = 'move';
    res.level = a;
    return res;
  }
  if (canMerge(a, b, cfg)) {
    g[to] = a + 1;
    g[from] = 0;
    s.merges++;
    res.kind = 'merge';
    res.level = a + 1;
    res.isNew = discover(s, a + 1);
    return res;
  }
  if (a === b) return res; // two max-level pools: nothing to do
  g[to] = a;
  g[from] = b;
  res.kind = 'swap';
  res.level = a;
  return res;
}

// ---------------------------------------------------------------- upgrades

export function upgradeCost(id: UpgradeId, level: number, cfg: EconomyConfig = CONFIG): number {
  const u = cfg.upgrades[id];
  return Math.ceil(u.baseCost * Math.pow(u.growth, level));
}

export function upgradeMaxed(s: GameState, id: UpgradeId, cfg: EconomyConfig = CONFIG): boolean {
  return s.upgrades[id] >= cfg.upgrades[id].max;
}

export function nextUpgradeCost(s: GameState, id: UpgradeId, cfg: EconomyConfig = CONFIG): number {
  return upgradeMaxed(s, id, cfg) ? Infinity : upgradeCost(id, s.upgrades[id], cfg);
}

export function canBuyUpgrade(s: GameState, id: UpgradeId, cfg: EconomyConfig = CONFIG): boolean {
  return !upgradeMaxed(s, id, cfg) && s.coins >= nextUpgradeCost(s, id, cfg);
}

export function buyUpgrade(s: GameState, id: UpgradeId, cfg: EconomyConfig = CONFIG): boolean {
  if (!canBuyUpgrade(s, id, cfg)) return false;
  s.coins -= nextUpgradeCost(s, id, cfg);
  s.upgrades[id]++;
  return true;
}

// ---------------------------------------------------------------- boosts

export function activateGolden(s: GameState, seconds: number): void {
  s.goldenTime = Math.max(s.goldenTime, seconds);
}

export function boostReady(s: GameState): boolean {
  return s.boostTime <= 0;
}

export function activateBoost(s: GameState, cfg: EconomyConfig = CONFIG): boolean {
  if (!boostReady(s)) return false;
  s.boostTime = cfg.boost.durationSec;
  return true;
}

// ---------------------------------------------------------------- tick

export interface TickEvents {
  /** slots where auto-spawn placed a pool this tick */
  spawned: number[];
  spawnedCount: number;
  newLevel: number; // level discovered by a spawn this tick (0 = none)
  guestAppeared: boolean;
  earned: number;
}

export function createTickEvents(cfg: EconomyConfig = CONFIG): TickEvents {
  return { spawned: new Array(cfg.cols * cfg.rows).fill(-1), spawnedCount: 0, newLevel: 0, guestAppeared: false, earned: 0 };
}

const scratchPlace: PlaceResult = { slot: -1, level: 0, isNew: false };

/** Integral over [0,dt] of the temporary multiplier. */
export function boostedSeconds(s: GameState, dt: number, cfg: EconomyConfig = CONFIG): number {
  const g = Math.min(dt, Math.max(0, s.goldenTime));
  const b = Math.min(dt, Math.max(0, s.boostTime));
  const mg = cfg.golden.mult - 1;
  const mb = cfg.boost.mult - 1;
  return dt + mg * g + mb * b + mg * mb * Math.min(g, b);
}

/**
 * Advances the simulation by dt real seconds (any size; never loops more
 * than once per grid slot). Writes events into `ev` (reused, no allocation).
 */
export function tick(s: GameState, dt: number, ev: TickEvents, cfg: EconomyConfig = CONFIG, rng: Rng = Math.random): TickEvents {
  ev.spawnedCount = 0;
  ev.newLevel = 0;
  ev.guestAppeared = false;
  ev.earned = 0;
  if (!(dt > 0) || !Number.isFinite(dt)) return ev;

  const earned = baseProduction(s, cfg) * boostedSeconds(s, dt, cfg);
  s.coins += earned;
  s.totalEarned += earned;
  ev.earned = earned;
  s.goldenTime = Math.max(0, s.goldenTime - dt);
  s.boostTime = Math.max(0, s.boostTime - dt);
  s.playTime += dt;

  s.spawnTimer += dt;
  while (s.spawnTimer >= cfg.autoSpawnSec) {
    if (!placePool(s, scratchPlace, cfg)) {
      s.spawnTimer = cfg.autoSpawnSec; // wait full until a slot frees up
      break;
    }
    s.spawnTimer -= cfg.autoSpawnSec;
    ev.spawned[ev.spawnedCount++] = scratchPlace.slot;
    if (scratchPlace.isNew) ev.newLevel = scratchPlace.level;
  }

  s.nextGuestIn -= dt;
  if (s.nextGuestIn <= 0) {
    ev.guestAppeared = true;
    s.nextGuestIn = nextGuestDelay(cfg, rng);
  }
  return ev;
}

/** 0..1 progress of the free auto-spawn. */
export function spawnProgress(s: GameState, cfg: EconomyConfig = CONFIG): number {
  return Math.min(1, s.spawnTimer / cfg.autoSpawnSec);
}

// ---------------------------------------------------------------- offline

export function offlineCapSec(s: GameState, cfg: EconomyConfig = CONFIG): number {
  return (cfg.offline.baseCapHours + s.upgrades.longRest * cfg.upgrades.longRest.hoursPerLevel) * 3600;
}

export interface OfflineResult {
  amount: number;
  /** seconds that actually counted (capped) */
  creditedSec: number;
  awaySec: number;
}

export function computeOffline(s: GameState, awaySec: number, cfg: EconomyConfig = CONFIG): OfflineResult {
  const away = Number.isFinite(awaySec) && awaySec > 0 ? awaySec : 0;
  const credited = Math.min(away, offlineCapSec(s, cfg));
  return { amount: cfg.offline.rate * baseProduction(s, cfg) * credited, creditedSec: credited, awaySec: away };
}

export function collectOffline(s: GameState, amount: number, doubled: boolean): number {
  const total = doubled ? amount * 2 : amount;
  s.coins += total;
  s.totalEarned += total;
  return total;
}
