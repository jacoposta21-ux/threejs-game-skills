import { describe, expect, it } from 'vitest';
import { report, simulate, TARGETS, TOLERANCE } from '../tools/simulate.ts';

describe('balancing simulator', () => {
  const res = simulate();

  it.each(TARGETS.map((t) => [t.level, t] as const))('reaches level %i within ±35%% of target', (_l, t) => {
    const r = res.reaches.find((x) => x.level === t.level);
    expect(r, `level ${t.level} never reached`).toBeDefined();
    const ratio = r![t.metric] / t.targetSec;
    expect(ratio).toBeGreaterThanOrEqual(1 - TOLERANCE);
    expect(ratio).toBeLessThanOrEqual(1 + TOLERANCE);
  });

  it('completes the album (level 12) and keeps numbers under 1e15', () => {
    expect(res.final.maxLevel).toBe(12);
    expect(res.final.unlocked.every(Boolean)).toBe(true);
    expect(res.maxCoins).toBeLessThan(1e15);
  });

  it('is robust to golden-guest randomness', () => {
    for (const seed of [1, 2, 3]) expect(report(simulate(undefined, { seed })).allOk).toBe(true);
  });
});
