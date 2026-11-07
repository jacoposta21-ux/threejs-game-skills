import { describe, expect, it } from 'vitest';
import { CONFIG, type EconomyConfig } from '../src/economy/config.ts';
import {
  activateBoost,
  activateGolden,
  baseProduction,
  boostReady,
  buyUpgrade,
  canDig,
  collectOffline,
  computeOffline,
  createState,
  createTickEvents,
  dig,
  digCost,
  digLevel,
  globalMultiplier,
  moveOrMerge,
  nextUpgradeCost,
  offlineCapSec,
  poolProduction,
  productionPerSec,
  tick,
  upgradeCost,
} from '../src/economy/model.ts';
import { formatDuration, formatNumber, suffixFor } from '../src/economy/format.ts';
import { deserialize, serialize } from '../src/economy/save.ts';

const cfg: EconomyConfig = CONFIG;
const empty = () => {
  const s = createState(0);
  s.grid.fill(0);
  return s;
};

describe('production', () => {
  it('follows base × growth^(L-1)', () => {
    expect(poolProduction(1)).toBe(cfg.production.base);
    expect(poolProduction(3)).toBeCloseTo(cfg.production.base * cfg.production.growth ** 2);
    expect(poolProduction(0)).toBe(0);
  });
  it('merging always beats keeping two pools', () => {
    for (let L = 1; L < cfg.maxLevel; L++) expect(poolProduction(L + 1)).toBeGreaterThan(2 * poolProduction(L));
  });
  it('sums the grid and applies the hot-water multiplier', () => {
    const s = empty();
    s.grid[0] = 1;
    s.grid[1] = 2;
    expect(baseProduction(s)).toBeCloseTo(1 + 2.3);
    s.upgrades.hotWater = 2;
    expect(globalMultiplier(s)).toBeCloseTo(2.25);
    expect(baseProduction(s)).toBeCloseTo(3.3 * 2.25);
  });
  it('stacks golden ×3 and boost ×2 multiplicatively', () => {
    const s = empty();
    s.grid[0] = 1;
    activateGolden(s, 30);
    expect(productionPerSec(s)).toBeCloseTo(3);
    expect(activateBoost(s)).toBe(true);
    expect(productionPerSec(s)).toBeCloseTo(6);
    expect(boostReady(s)).toBe(false);
    expect(activateBoost(s)).toBe(false); // not rechargeable until it expires
  });
});

describe('new game', () => {
  it('starts with the configured level-1 pools and capybara #1 discovered', () => {
    const s = createState(0);
    expect(s.grid.filter((x) => x === 1).length).toBe(cfg.startPools);
    expect(s.unlocked[0]).toBe(cfg.startPools > 0);
  });
});

describe('dig', () => {
  it('costs ceil(base × growth^n)', () => {
    const s = empty();
    expect(digCost(s)).toBe(Math.ceil(cfg.dig.baseCost));
    s.poolsBought = 10;
    expect(digCost(s)).toBe(Math.ceil(cfg.dig.baseCost * cfg.dig.growth ** 10));
  });
  it('places a pool of digLevel in the first empty slot (row by row)', () => {
    const s = empty();
    s.grid[0] = 3;
    s.coins = 1e12;
    const r = dig(s)!;
    expect(r.slot).toBe(1);
    expect(s.grid[1]).toBe(1);
    expect(s.poolsBought).toBe(1);
    s.upgrades.shovel = 2;
    expect(digLevel(s)).toBe(3);
    expect(dig(s)!.level).toBe(3);
  });
  it('refuses when broke or full', () => {
    const s = empty();
    expect(canDig(s)).toBe(false);
    expect(dig(s)).toBeNull();
    s.coins = 1e12;
    s.grid.fill(1);
    expect(dig(s)).toBeNull();
    expect(s.coins).toBe(1e12);
  });
});

describe('merge / move / swap', () => {
  it('merges two equal pools into the destination at L+1', () => {
    const s = empty();
    s.grid[0] = 2;
    s.grid[5] = 2;
    const r = moveOrMerge(s, 0, 5);
    expect(r.kind).toBe('merge');
    expect(r.level).toBe(3);
    expect(r.isNew).toBe(true);
    expect(s.grid[0]).toBe(0);
    expect(s.grid[5]).toBe(3);
    expect(s.unlocked[2]).toBe(true);
    expect(s.maxLevel).toBe(3);
  });
  it('moves onto an empty slot', () => {
    const s = empty();
    s.grid[0] = 4;
    expect(moveOrMerge(s, 0, 7).kind).toBe('move');
    expect(s.grid[7]).toBe(4);
    expect(s.grid[0]).toBe(0);
  });
  it('swaps different levels', () => {
    const s = empty();
    s.grid[0] = 1;
    s.grid[1] = 2;
    expect(moveOrMerge(s, 0, 1).kind).toBe('swap');
    expect(s.grid[0]).toBe(2);
    expect(s.grid[1]).toBe(1);
  });
  it('caps at level 12', () => {
    const s = empty();
    s.grid[0] = 12;
    s.grid[1] = 12;
    expect(moveOrMerge(s, 0, 1).kind).toBe('none');
    expect(s.grid[0]).toBe(12);
    expect(s.grid[1]).toBe(12);
    s.grid[2] = 11;
    s.grid[3] = 11;
    expect(moveOrMerge(s, 2, 3).level).toBe(12);
  });
  it('ignores invalid moves', () => {
    const s = empty();
    s.grid[0] = 1;
    expect(moveOrMerge(s, 0, 0).kind).toBe('none');
    expect(moveOrMerge(s, 3, 0).kind).toBe('none');
    expect(moveOrMerge(s, 0, 99).kind).toBe('none');
  });
});

describe('upgrades', () => {
  it('cost base × growth^k and stop at max', () => {
    const s = empty();
    s.coins = 1e300;
    for (const id of ['hotWater', 'shovel', 'longRest'] as const) {
      const u = cfg.upgrades[id];
      expect(upgradeCost(id, 0)).toBe(Math.ceil(u.baseCost));
      expect(upgradeCost(id, 3)).toBe(Math.ceil(u.baseCost * u.growth ** 3));
      for (let k = 0; k < u.max; k++) expect(buyUpgrade(s, id)).toBe(true);
      expect(buyUpgrade(s, id)).toBe(false);
      expect(nextUpgradeCost(s, id)).toBe(Infinity);
    }
    expect(digLevel(s)).toBe(1 + cfg.upgrades.shovel.max);
    expect(offlineCapSec(s)).toBe((cfg.offline.baseCapHours + cfg.upgrades.longRest.max) * 3600);
  });
  it('deducts coins', () => {
    const s = empty();
    const c = upgradeCost('hotWater', 0);
    s.coins = c + 5;
    expect(buyUpgrade(s, 'hotWater')).toBe(true);
    expect(s.coins).toBe(5);
    expect(buyUpgrade(s, 'hotWater')).toBe(false);
  });
});

describe('tick', () => {
  it('earns production × dt and auto-spawns every interval', () => {
    const s = empty();
    s.grid[0] = 2;
    const ev = createTickEvents();
    tick(s, 1, ev);
    expect(s.coins).toBeCloseTo(2.3);
    tick(s, cfg.autoSpawnSec, ev);
    expect(ev.spawnedCount).toBe(1);
    expect(s.grid[1]).toBe(1);
  });
  it('handles a huge dt without looping forever and stops spawning when full', () => {
    const s = empty();
    const ev = createTickEvents();
    tick(s, 1e9, ev);
    expect(ev.spawnedCount).toBe(s.grid.length);
    expect(s.grid.every((x) => x === 1)).toBe(true);
    expect(s.spawnTimer).toBe(cfg.autoSpawnSec);
  });
  it('ignores bad dt', () => {
    const s = empty();
    s.grid[0] = 1;
    const ev = createTickEvents();
    tick(s, NaN, ev);
    tick(s, -5, ev);
    tick(s, Infinity, ev);
    expect(s.coins).toBe(0);
  });
  it('integrates boosts that expire mid-tick', () => {
    const s = empty();
    s.grid[0] = 1;
    activateGolden(s, 5);
    const ev = createTickEvents();
    tick(s, 10, ev);
    expect(s.coins).toBeCloseTo(5 * 3 + 5 * 1);
    expect(s.goldenTime).toBe(0);
  });
  it('schedules golden guests between min and max interval', () => {
    const s = empty();
    const ev = createTickEvents();
    let seen = 0;
    for (let t = 0; t < 3600; t++) {
      tick(s, 1, ev);
      if (ev.guestAppeared) seen++;
      expect(s.nextGuestIn).toBeLessThanOrEqual(cfg.golden.maxIntervalSec);
    }
    expect(seen).toBeGreaterThanOrEqual(Math.floor(3600 / cfg.golden.maxIntervalSec));
    expect(seen).toBeLessThanOrEqual(Math.ceil(3600 / cfg.golden.minIntervalSec));
  });
});

describe('offline', () => {
  it('pays rate × base production × away, capped', () => {
    const s = empty();
    s.grid[0] = 1;
    activateGolden(s, 999); // temporary boosts do not count offline
    const r = computeOffline(s, 600);
    expect(r.amount).toBeCloseTo(cfg.offline.rate * 600);
    const cap = offlineCapSec(s);
    const big = computeOffline(s, cap * 10);
    expect(big.creditedSec).toBe(cap);
    expect(big.amount).toBeCloseTo(cfg.offline.rate * cap);
    s.upgrades.longRest = 2;
    expect(offlineCapSec(s)).toBe(cap + 2 * 3600);
  });
  it('handles junk away time and doubles on video', () => {
    const s = empty();
    s.grid[0] = 1;
    expect(computeOffline(s, -100).amount).toBe(0);
    expect(computeOffline(s, NaN).amount).toBe(0);
    expect(collectOffline(s, 10, true)).toBe(20);
    expect(s.coins).toBe(20);
  });
});

describe('format', () => {
  it('uses K/M/B/T then aa, ab…', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(2.34)).toBe('2.3');
    expect(formatNumber(999)).toBe('999');
    expect(formatNumber(1234)).toBe('1.2K');
    expect(formatNumber(1000)).toBe('1K');
    expect(formatNumber(12_345)).toBe('12.3K');
    expect(formatNumber(123_456)).toBe('123K');
    expect(formatNumber(3.4e6)).toBe('3.4M');
    expect(formatNumber(5.6e9)).toBe('5.6B');
    expect(formatNumber(7.8e12)).toBe('7.8T');
    expect(formatNumber(1e15)).toBe('1aa');
    expect(formatNumber(2.5e18)).toBe('2.5ab');
    expect(suffixFor(5 + 26)).toBe('ba');
    expect(formatNumber(999_999)).toBe('999K');
    expect(formatNumber(-1500)).toBe('-1.5K');
    expect(formatNumber(Infinity)).toBe('∞');
  });
  it('formats durations', () => {
    expect(formatDuration(5)).toBe('5s');
    expect(formatDuration(75)).toBe('1m 15s');
    expect(formatDuration(7260)).toBe('2h 1m');
  });
});

describe('save', () => {
  it('round-trips', () => {
    const s = createState(1000);
    s.coins = 1234.5;
    s.grid[3] = 7;
    s.upgrades.shovel = 2;
    s.muted = true;
    moveOrMerge(s, 0, 1);
    const { state, restored } = deserialize(serialize(s), 2000);
    expect(restored).toBe(true);
    expect(state.coins).toBe(1234.5);
    expect(state.grid).toEqual(s.grid);
    expect(state.upgrades.shovel).toBe(2);
    expect(state.muted).toBe(true);
    expect(state.unlocked[6]).toBe(true); // board content is always in the album
    expect(state.maxLevel).toBe(7);
  });
  it.each([
    ['null', null],
    ['empty', ''],
    ['bad json', '{nope'],
    ['array', '[1,2]'],
    ['number', '42'],
    ['wrong version', JSON.stringify({ v: 99, grid: [] })],
    ['wrong grid', JSON.stringify({ v: 1, grid: [1, 2] })],
  ])('starts fresh on corrupt save (%s)', (_name, raw) => {
    const { state, restored } = deserialize(raw as string | null, 5);
    expect(restored).toBe(false);
    expect(state.coins).toBe(0);
    expect(state.grid.length).toBe(cfg.cols * cfg.rows);
  });
  it('sanitizes bad fields', () => {
    const raw = JSON.stringify({
      v: 1,
      grid: new Array(20).fill(0).map((_, i) => (i === 0 ? 99 : i === 1 ? -3 : i === 2 ? 'x' : i === 3 ? 2 : 0)),
      coins: 'lots',
      upgrades: { hotWater: 1e9, shovel: -1 },
      lastSeen: 1e20,
      goldenTime: 1e9,
    });
    const { state } = deserialize(raw, 1000);
    expect(state.grid.slice(0, 4)).toEqual([0, 0, 0, 2]);
    expect(state.coins).toBe(0);
    expect(state.upgrades.hotWater).toBe(cfg.upgrades.hotWater.max);
    expect(state.upgrades.shovel).toBe(0);
    expect(state.lastSeen).toBe(1000);
    expect(state.goldenTime).toBe(cfg.golden.videoDurationSec);
  });
});
