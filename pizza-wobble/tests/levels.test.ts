import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateMap, generateLevel } from '../src/levels/generator.ts';
import { validateLevel } from '../src/levels/validator.ts';
import { computeDifficulty } from '../src/levels/difficulty.ts';
import { checkProgression, turnParams, type LevelsFile } from '../src/levels/progression.ts';
import { Cell } from '../src/levels/types.ts';

const levels = JSON.parse(readFileSync('public/levels/levels.json', 'utf8')) as LevelsFile;

describe('generator', () => {
  it('is deterministic: same seed -> same map', () => {
    for (const d of ['centro', 'porto', 'collina'] as const) {
      const a = generateMap(d, 12345);
      const b = generateMap(d, 12345);
      expect(Buffer.from(a.cells).equals(Buffer.from(b.cells))).toBe(true);
      expect(Buffer.from(a.heights.buffer).equals(Buffer.from(b.heights.buffer))).toBe(true);
      expect(JSON.stringify(a.buildings)).toBe(JSON.stringify(b.buildings));
      expect(JSON.stringify(a.segments)).toBe(JSON.stringify(b.segments));
    }
  });
  it('different seeds give different maps', () => {
    const a = generateMap('centro', 1);
    const b = generateMap('centro', 2);
    expect(Buffer.from(a.cells).equals(Buffer.from(b.cells))).toBe(false);
  });
  it('levels are deterministic from seed + params', () => {
    const l = levels.levels[4];
    const a = generateLevel(l);
    const b = generateLevel(l);
    expect(JSON.stringify(a.stops)).toBe(JSON.stringify(b.stops));
    expect(JSON.stringify(a.traffic)).toBe(JSON.stringify(b.traffic));
  });
  it('district features: porto has water + ramps, collina has height + stairs', () => {
    const p = generateMap('porto', 99);
    expect(p.cells.includes(Cell.WATER)).toBe(true);
    expect(p.bumps.some((b) => b.kind === 'ramp')).toBe(true);
    const c = generateMap('collina', 99);
    expect(Math.max(...c.heights)).toBeGreaterThan(10);
    expect(c.stairs.length).toBeGreaterThan(0);
  });
});

describe('validator', () => {
  it('accepts all 30 exported turns', () => {
    expect(levels.levels.length).toBe(30);
    for (const spec of levels.levels) {
      const v = validateLevel(generateLevel(spec));
      expect(v.errors, `turn ${spec.turn}`).toEqual([]);
      expect(v.tour!.length).toBeGreaterThanOrEqual(250);
      expect(v.tour!.length).toBeLessThanOrEqual(900);
    }
  });
  it('rejects a delivery inside a building', () => {
    const level = generateLevel(levels.levels[0]);
    const b = level.map.buildings[level.stops[0].address.building];
    level.stops[0] = { ...level.stops[0], address: { ...level.stops[0].address, x: (b.x0 + b.x1), z: (b.z0 + b.z1) } };
    const v = validateLevel(level);
    expect(v.valid).toBe(false);
    expect(v.errors.join()).toMatch(/blocked cell|not drivable/);
  });
  it('rejects an unreachable address', () => {
    const level = generateLevel(levels.levels[0]);
    const a = level.stops[0].address;
    const { map } = level;
    // wall the address cell in with buildings
    const cx = Math.floor(a.x / 2);
    const cz = Math.floor(a.z / 2);
    for (let dz = -2; dz <= 2; dz++)
      for (let dx = -2; dx <= 2; dx++) if (Math.abs(dx) === 2 || Math.abs(dz) === 2) map.cells[(cz + dz) * map.cols + cx + dx] = Cell.BUILDING;
    const v = validateLevel(level);
    expect(v.valid).toBe(false);
  });
  it('rejects narrow roads and too-short tours', () => {
    const level = generateLevel(levels.levels[0]);
    level.map.segments[0] = { ...level.map.segments[0], width: 1 };
    expect(validateLevel(level).errors.join()).toMatch(/narrower/);
    const l2 = generateLevel(levels.levels[0]);
    l2.stops = l2.stops.slice(0, 1);
    l2.spec = { ...l2.spec, stops: 1, pizzas: l2.stops[0].count };
    const v2 = validateLevel(l2);
    expect(v2.valid).toBe(false);
  });
});

describe('difficulty', () => {
  it('json difficulty matches the formula', () => {
    const spec = levels.levels[10];
    const level = generateLevel(spec);
    const v = validateLevel(level);
    expect(computeDifficulty(level, v.tour!).score).toBeCloseTo(spec.difficulty, 1);
  });
  it('is increasing per the acceptance rules', () => {
    const errs = checkProgression(levels.levels.map((l) => l.difficulty), levels.levels.map((l) => l.district));
    expect(errs).toEqual([]);
    expect(levels.levels[29].difficulty).toBeGreaterThan(levels.levels[0].difficulty * 1.8);
  });
  it('turn params stay within ranges', () => {
    for (let t = 1; t <= 30; t++) {
      const p = turnParams(t);
      expect(p.pizzas).toBeGreaterThanOrEqual(3);
      expect(p.pizzas).toBeLessThanOrEqual(8);
      expect(p.stops).toBeGreaterThanOrEqual(2);
      expect(p.stops).toBeLessThanOrEqual(5);
      expect(p.pizzas).toBeLessThanOrEqual(p.stops * 3);
    }
  });
});
