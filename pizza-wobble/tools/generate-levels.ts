/**
 * Generates the 30 turns: tries seeds per turn, validates each map, discards invalid ones,
 * picks the candidate nearest the target difficulty curve, and exports seed + params to
 * public/levels/levels.json. Run: npm run levels
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateLevel, generateMap } from '../src/levels/generator.ts';
import { validateLevel } from '../src/levels/validator.ts';
import { computeDifficulty } from '../src/levels/difficulty.ts';
import { hashSeed } from '../src/levels/rng.ts';
import { TOTAL_TURNS, turnParams, targetDifficulty, checkProgression, type LevelsFile } from '../src/levels/progression.ts';

const out: LevelsFile = { version: 1, levels: [] };
let rejected = 0;
let prev = 0;
const t0 = Date.now();
for (let turn = 1; turn <= TOTAL_TURNS; turn++) {
  const params = turnParams(turn);
  const target = targetDifficulty(turn);
  let best: LevelsFile['levels'][number] | null = null;
  let bestErr = Infinity;
  let validCount = 0;
  for (let attempt = 0; attempt < 120 && validCount < 10; attempt++) {
    const seed = hashSeed(turn * 7919 + attempt, 1337);
    const map = generateMap(params.district, seed);
    const level = generateLevel({ ...params, seed }, map);
    const v = validateLevel(level);
    if (!v.valid || !v.tour) {
      rejected++;
      continue;
    }
    const d = computeDifficulty(level, v.tour);
    if (prev && d.score < 0.9 * prev) continue;
    validCount++;
    const err = Math.abs(d.score - target);
    if (err < bestErr) {
      bestErr = err;
      best = { ...params, seed, difficulty: d.score, pathLength: Math.round(d.pathLength), sharpTurns: d.sharpTurns, bumps: d.bumps };
    }
  }
  if (!best) throw new Error(`no valid level for turn ${turn}`);
  prev = best.difficulty;
  out.levels.push(best);
}

const errs = checkProgression(out.levels.map((l) => l.difficulty), out.levels.map((l) => l.district));
mkdirSync('public/levels', { recursive: true });
writeFileSync('public/levels/levels.json', JSON.stringify(out, null, 1));

const pad = (s: string | number, n: number) => String(s).padStart(n);
console.log('turn | district | seed       | N | K | cars | path m | turns | bumps | difficulty');
console.log('-----|----------|------------|---|---|------|--------|-------|-------|-----------');
for (const l of out.levels)
  console.log(
    `${pad(l.turn, 4)} | ${l.district.padEnd(8)} | ${pad(l.seed, 10)} | ${l.pizzas} | ${l.stops} | ${pad(l.cars, 4)} | ${pad(l.pathLength, 6)} | ${pad(l.sharpTurns, 5)} | ${pad(l.bumps, 5)} | ${pad(l.difficulty.toFixed(2), 9)}`,
  );
console.log(`\n${out.levels.length}/30 valid turns exported (${rejected} invalid candidates discarded) in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
if (errs.length) {
  console.error('Progression check FAILED:\n' + errs.join('\n'));
  process.exit(1);
}
console.log('Progression check OK: each turn >= 90% of previous, district boundaries within 20%.');
