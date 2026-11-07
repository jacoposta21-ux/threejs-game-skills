import { describe, expect, it } from 'vitest';
import { MidgamePolicy } from '../src/services/adPolicy.ts';

describe('midgame policy', () => {
  it('never in the first 5 minutes, only after an unlock, max once per 3 minutes', () => {
    const p = new MidgamePolicy(180, 300);
    expect(p.canShow(100, true)).toBe(false);
    expect(p.canShow(299, true)).toBe(false);
    expect(p.canShow(301, false)).toBe(false);
    expect(p.canShow(301, true)).toBe(true);
    p.markShown(301);
    expect(p.canShow(400, true)).toBe(false);
    expect(p.canShow(481, true)).toBe(true);
  });
});
