#!/usr/bin/env node
// Offline fairness verification for the procedural generator.
// Simulates long runs for many seeds and independently re-checks, using the
// exact collision maths (no safety margins), that every row has a reachable
// safe angle from the previous row's reachable set. Exits non-zero on failure.

import { ProceduralGenerator } from '../src/ProceduralGenerator.js';
import { speedAt, maxOmegaAt } from '../src/Difficulty.js';
import { clearance, rotationAt, TWO_PI } from '../src/ObstacleModel.js';
import { GEN } from '../src/Config.js';

const seeds = Number(process.argv[2] ?? 60);
const runSeconds = Number(process.argv[3] ?? 420);
const B = 360;
const BIN = TWO_PI / B;
let failures = 0;
const typeCounts = {};
let minDt = Infinity;
let rows = 0;

for (let seed = 1; seed <= seeds; seed += 1) {
  const gen = new ProceduralGenerator(seed * 7919);
  gen.log = [];
  let t = 0;
  let distance = 0;
  const dt = 1 / 60;
  while (t < runSeconds) {
    const v = speedAt(t);
    distance += v * dt;
    t += dt;
    gen.update(t, distance, v);
  }
  let feasible = new Uint8Array(B).fill(1);
  let prevS = 0;
  for (const row of gen.log) {
    const o = row.obstacle;
    typeCounts[o.type] = (typeCounts[o.type] ?? 0) + 1;
    const free = new Uint8Array(B);
    const rot = rotationAt(o, 0);
    for (let b = 0; b < B; b += 1) free[b] = clearance(o, rot, b * BIN) > 0 ? 1 : 0;
    const dtRow = (row.s - prevS) / row.speed;
    if (prevS > 0) minDt = Math.min(minDt, dtRow);
    const reach = prevS === 0 ? B : Math.floor((maxOmegaAt(row.speed) * dtRow) / BIN);
    // dilate feasible
    const fd = new Int32Array(B);
    {
      // brute-force dilation on 360 bins (independent of the generator helper)
      for (let b = 0; b < B; b += 1) {
        let best = B;
        for (let c = 0; c < B; c += 1) {
          if (!feasible[c]) continue;
          let d = Math.abs(b - c);
          d = Math.min(d, B - d);
          if (d < best) best = d;
        }
        fd[b] = best;
      }
    }
    const next = new Uint8Array(B);
    let count = 0;
    for (let b = 0; b < B; b += 1) {
      next[b] = free[b] && fd[b] <= reach ? 1 : 0;
      count += next[b];
    }
    if (count === 0) {
      failures += 1;
      console.error(`IMPOSSIBLE: seed ${seed} row at s=${row.s.toFixed(1)} t=${row.t.toFixed(1)} type=${o.type}`);
      break;
    }
    feasible = next;
    prevS = row.s;
    rows += 1;
  }
}

console.log(`fairness-check: ${seeds} seeds x ${runSeconds}s, ${rows} rows verified, failures=${failures}`);
console.log(`min time between rows: ${minDt.toFixed(3)}s; obstacle mix: ${JSON.stringify(typeCounts)}`);
console.log(`(generator solver bins=${GEN.bins}, verifier bins=${B})`);
process.exit(failures ? 1 : 0);
