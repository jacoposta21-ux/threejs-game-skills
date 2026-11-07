import { describe, it, expect } from 'vitest';
import { deliveryTip, pizzaTip, starsFor, upgradeCost, heatAt, timeBonus, maxSpeed, bumpScale, rackFriction, heatLossPerSecond } from '../src/game/rules.ts';
import { parseSave, loadSave, writeSave, defaultSave, SAVE_KEY } from '../src/game/save.ts';
import { MidgamePolicy } from '../src/services/ads.ts';

describe('tips & stars', () => {
  it('tip = 10 x heat/100 x time bonus', () => {
    expect(pizzaTip(100, 10)).toBeCloseTo(15);
    expect(pizzaTip(100, 60)).toBeCloseTo(12);
    expect(pizzaTip(50, 100)).toBeCloseTo(5);
    expect(timeBonus(40)).toBe(1.5);
    expect(timeBonus(80)).toBe(1.2);
    expect(timeBonus(81)).toBe(1);
  });
  it('perfect delivery adds +5', () => {
    expect(deliveryTip([100, 100], 30, false)).toBe(30);
    expect(deliveryTip([100, 100], 30, true)).toBe(35);
  });
  it('heat drops 0.4%/s, bag upgrade reduces it 15% per level', () => {
    expect(heatAt(100, 0)).toBeCloseTo(60);
    expect(heatLossPerSecond(2)).toBeCloseTo(0.4 * 0.7);
    expect(heatAt(1000, 0)).toBe(0);
  });
  it('stars thresholds', () => {
    expect(starsFor(0, 5, 5)).toBe(0);
    expect(starsFor(3, 6, 3)).toBe(1);
    expect(starsFor(4, 5, 1)).toBe(2);
    expect(starsFor(5, 5, 0)).toBe(3);
    expect(starsFor(5, 5, 1)).toBe(2);
  });
});

describe('upgrades', () => {
  it('costs follow base x growth^k', () => {
    expect(upgradeCost('motor', 0)).toBe(60);
    expect(upgradeCost('motor', 1)).toBe(132);
    expect(upgradeCost('suspension', 2)).toBe(Math.round(80 * 2.3 ** 2));
    expect(upgradeCost('rack', 3)).toBe(Math.round(100 * 2.5 ** 3));
    expect(upgradeCost('rack', 4)).toBe(Infinity);
    expect(upgradeCost('bag', 4)).toBe(Math.round(70 * 2.2 ** 4));
  });
  it('effects', () => {
    expect(maxSpeed(5)).toBeCloseTo(14 * 1.4);
    expect(bumpScale(5)).toBeCloseTo(0.4);
    expect(rackFriction(4)).toBeCloseTo(0.6 * 1.6);
  });
});

describe('save', () => {
  it('corrupted save restarts from zero without crashing', () => {
    expect(parseSave('{not json')).toEqual(defaultSave());
    expect(parseSave('[]')).toEqual(defaultSave());
    expect(parseSave('null')).toEqual(defaultSave());
    const partial = parseSave(JSON.stringify({ v: 1, coins: -50, stars: [9, 'x', 2], upgrades: { motor: 99 } }));
    expect(partial.coins).toBe(0);
    expect(partial.stars.slice(0, 3)).toEqual([3, 0, 2]);
    expect(partial.upgrades.motor).toBe(5);
    expect(partial.upgrades.rack).toBe(0);
  });
  it('throwing storage is tolerated', () => {
    const bad = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); } };
    expect(loadSave(bad)).toEqual(defaultSave());
    expect(writeSave(defaultSave(), bad)).toBe(false);
  });
  it('round trips', () => {
    const mem: Record<string, string> = {};
    const st = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; } };
    const s = defaultSave();
    s.coins = 123;
    s.stars[4] = 2;
    writeSave(s, st);
    expect(mem[SAVE_KEY]).toBeTruthy();
    expect(loadSave(st)).toEqual(s);
  });
});

describe('ads policy', () => {
  it('interstitial never before shift 3 and at most every 3 minutes', () => {
    let t = 0;
    const p = new MidgamePolicy(() => t);
    expect(p.canShow(3)).toBe(false);
    expect(p.canShow(4)).toBe(true);
    p.mark();
    t = 179_000;
    expect(p.canShow(5)).toBe(false);
    t = 181_000;
    expect(p.canShow(5)).toBe(true);
  });
});
