// Procedural obstacle generator with a built-in fairness solver.
//
// The tunnel is discretised into GEN.bins angular bins. For every generated
// row we know the set of angles the sphere can legally occupy when it reaches
// that row ("feasible"). A candidate row is accepted only if EVERY feasible
// angle of the previous row can reach at least one free angle of the new row
// within the angular distance the sphere can travel in the time between them.
// Therefore no matter which gap the player chose, there is always a way out:
// the generator never creates an impossible sequence.
//
// Moving obstacles are parameterised by distance-to-player (not wall-clock
// time), so their configuration at the moment they reach the sphere is known
// exactly at generation time, independent of frame rate or speed changes.

import { GEN, SPEED } from './Config.js';
import { difficultyAt, maxOmegaAt, speedAt, unlock } from './Difficulty.js';
import {
  BLOCK_COUNT,
  BLOCK_STEP,
  HALF_DEPTH,
  PLAYER_HALF_ANGLE,
  TWO_PI,
  angleDiff,
  buildArcs,
  rotationAt,
  wrapAngle,
} from './ObstacleModel.js';
import { PLAYER } from './Config.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const B = GEN.bins;
const BIN = TWO_PI / B;

/** Circular distance (in bins) from each bin to the nearest bin where mask[b] is set. */
export function distanceTo(mask, out) {
  const INF = B * 2;
  let last = -INF;
  for (let i = 0; i < B * 2; i += 1) {
    const b = i % B;
    if (mask[b]) last = i;
    if (i >= B) out[b] = i - last;
  }
  last = INF * 2;
  for (let i = B * 2 - 1; i >= 0; i -= 1) {
    const b = i % B;
    if (mask[b]) last = i;
    if (i < B) out[b] = Math.min(out[b], last - i);
  }
  return out;
}

const lerp = (a, b, t) => a + (b - a) * t;

export class ProceduralGenerator {
  constructor(seed = 1) {
    this.free = new Uint8Array(B);
    this.distFree = new Int32Array(B);
    this.distFeasible = new Int32Array(B);
    this.distBlocked = new Int32Array(B);
    this.blocked = new Uint8Array(B);
    this.reset(seed);
  }

  reset(seed) {
    this.seed = seed >>> 0;
    this.rng = mulberry32(this.seed || 1);
    this.feasible = new Uint8Array(B).fill(1);
    this.lastRowS = 0;
    this.pathBin = 0;
    this.queue = [];
    this.rowCount = 0;
    this.patternCount = 0;
    this.nextPowerUpT = 12 + this.range(0, 5);
    this.idCounter = 0;
    this.out = { obstacles: [], pickups: [] };
    this.log = null; // set to [] to record rows (tests)
  }

  range(a, b) {
    return a + (b - a) * this.rng();
  }

  int(a, b) {
    return Math.floor(this.range(a, b + 1));
  }

  sign() {
    return this.rng() < 0.5 ? -1 : 1;
  }

  /** Generate rows until the last row is `spawnAhead` units in front of the player. */
  update(elapsed, distance, baseSpeed) {
    let guard = 0;
    while (this.lastRowS < distance + GEN.spawnAhead && guard < 40) {
      const ref = this.lastRowS === 0 ? GEN.firstRowDistance : this.lastRowS;
      const tA = elapsed + Math.max(0, ref - distance) / Math.max(8, baseSpeed);
      this.generateRow(tA);
      guard += 1;
    }
  }

  // ---------------------------------------------------------------- patterns

  choosePattern(t) {
    const d = difficultyAt(t);
    this.patternCount += 1;
    // a recovery beat every few patterns keeps the pacing breathable
    if (this.patternCount % 7 === 0) {
      return [{ gap: 1.7, build: (c) => this.buildSpikes(c, { clusters: 1, maxCount: 3 }) }];
    }
    if (this.rowCount < 4) {
      const simple = this.rowCount % 2 === 0 ? 'spikes' : 'wall';
      return [{ gap: 1.25, build: (c) => (simple === 'spikes' ? this.buildSpikes(c, { clusters: 1 }) : this.buildWall(c, { moving: false })) }];
    }
    const options = [
      ['spikes', 1.0 - d * 0.35],
      ['wall', 0.75 - d * 0.3],
      ['gate', 0.95],
      ['wallMoving', unlock(t, 24) * 1.0],
      ['laser', unlock(t, 28) * 0.95],
      ['blades', unlock(t, 58) * 1.0],
      ['spiral', unlock(t, 45) * 0.5 + unlock(t, 100) * 0.4],
      ['gateLaser', unlock(t, 80) * 0.6],
      ['bladeGate', unlock(t, 95) * 0.55],
      ['zigzag', unlock(t, 70) * 0.55],
      ['gateTrain', unlock(t, 105) * 0.5],
      ['laserFan', unlock(t, 120) * 0.45],
    ];
    let total = 0;
    for (const [, w] of options) total += Math.max(0, w);
    let r = this.rng() * total;
    let id = 'spikes';
    for (const [name, w] of options) {
      r -= Math.max(0, w);
      if (r <= 0) {
        id = name;
        break;
      }
    }
    return this.patternRows(id, t);
  }

  patternRows(id, t) {
    const rows = [];
    switch (id) {
      case 'spikes':
        rows.push({ gap: 1, build: (c) => this.buildSpikes(c, {}) });
        break;
      case 'wall':
        rows.push({ gap: 1, build: (c) => this.buildWall(c, { moving: false }) });
        break;
      case 'wallMoving':
        rows.push({ gap: 1.05, build: (c) => this.buildWall(c, { moving: true }) });
        break;
      case 'gate':
        rows.push({ gap: 1.05, build: (c) => this.buildGate(c, {}) });
        break;
      case 'laser':
        rows.push({ gap: 0.95, build: (c) => this.buildLaser(c, {}) });
        break;
      case 'blades':
        rows.push({ gap: 1.05, build: (c) => this.buildBlades(c, {}) });
        break;
      case 'spiral': {
        const n = this.int(4, 6);
        const step = this.sign() * this.range(0.45, 0.75);
        const start = this.range(0, TWO_PI);
        for (let i = 0; i < n; i += 1) {
          rows.push({ gap: i === 0 ? 1 : 0.5, minGap: 7, build: (c) => this.buildSpikes(c, { clusters: 1, fixedAngle: start + step * i, minCount: 4, maxCount: 6 }) });
        }
        break;
      }
      case 'gateLaser':
        rows.push({ gap: 1, build: (c) => this.buildGate(c, {}) });
        rows.push({ gap: 0.6, minGap: 9, build: (c) => this.buildLaser(c, { beams: 1 }) });
        break;
      case 'bladeGate':
        rows.push({ gap: 1, build: (c) => this.buildBlades(c, {}) });
        rows.push({ gap: 0.7, minGap: 10, build: (c) => this.buildGate(c, { gaps: 2 }) });
        break;
      case 'zigzag': {
        const n = this.int(3, 4);
        const start = this.range(0, TWO_PI);
        for (let i = 0; i < n; i += 1) {
          rows.push({ gap: i === 0 ? 1 : 0.62, minGap: 9, build: (c) => this.buildWall(c, { moving: false, fixedAngle: start + (i % 2) * Math.PI, blocks: this.int(18, 22) }) });
        }
        break;
      }
      case 'gateTrain': {
        const dir = this.sign();
        for (let i = 0; i < 3; i += 1) {
          rows.push({ gap: i === 0 ? 1 : 0.55, minGap: 8, build: (c) => this.buildGate(c, { gaps: 1, spin: dir * (i % 2 ? -1 : 1) }) });
        }
        break;
      }
      case 'laserFan':
        rows.push({ gap: 1, build: (c) => this.buildLaser(c, { beams: 2, rotate: true }) });
        rows.push({ gap: 0.55, minGap: 8, build: (c) => this.buildLaser(c, { beams: 1, rotate: true }) });
        rows.push({ gap: 0.55, minGap: 8, build: (c) => this.buildLaser(c, { beams: 2, rotate: true }) });
        break;
      default:
        rows.push({ gap: 1, build: (c) => this.buildSpikes(c, {}) });
    }
    return rows;
  }

  // ---------------------------------------------------------------- builders

  newObstacle(type) {
    this.idCounter += 1;
    return { id: this.idCounter, type, s: 0, base: 0, motion: 'static', k: 0, amp: 0, arcs: [], hd: HALF_DEPTH[type] };
  }

  /** rad/s of visual rotation expressed as rad per world unit of approach. */
  rateToK(rate, speed) {
    return rate / Math.max(1, speed);
  }

  buildSpikes(c, opts) {
    const o = this.newObstacle('spikes');
    const easy = c.attempt > 5;
    const nClusters = opts.clusters ?? (c.d < 0.25 ? 1 : this.int(1, c.d > 0.6 ? 3 : 2));
    const minCount = opts.minCount ?? 2;
    const maxCount = Math.max(minCount, opts.maxCount ?? Math.round(3 + c.d * 6));
    o.clusters = [];
    const start = opts.fixedAngle ?? this.range(0, TWO_PI);
    for (let i = 0; i < nClusters; i += 1) {
      const count = easy ? minCount : this.int(minCount, maxCount);
      const a = start + (i * TWO_PI) / nClusters + (opts.fixedAngle !== undefined ? 0 : this.range(-0.4, 0.4));
      o.clusters.push({ a, count });
    }
    o.length = 0.9;
    return o;
  }

  buildWall(c, opts) {
    const o = this.newObstacle('wall');
    const easy = c.attempt > 5;
    const n = opts.blocks ?? (easy ? 7 : this.int(Math.round(8 + c.d * 4), Math.round(13 + c.d * 9)));
    const twin = !opts.fixedAngle && c.d > 0.45 && this.rng() < 0.4;
    o.blocks = [];
    for (let i = 0; i < n; i += 1) o.blocks.push(i);
    if (twin) for (let i = 0; i < Math.max(4, n - 6); i += 1) o.blocks.push(24 + i);
    // centre the arc on its own origin so base is the wall's centre angle
    o.blocks = o.blocks.map((b) => b - Math.floor((n - 1) / 2));
    o.base = opts.fixedAngle ?? this.range(0, TWO_PI);
    if (opts.moving) {
      o.motion = 'osc';
      o.amp = this.range(0.55, 0.9 + c.d * 0.6);
      o.k = this.rateToK(this.range(1.1, 1.6 + c.d * 0.8), c.speedA);
    }
    return o;
  }

  buildGate(c, opts) {
    const o = this.newObstacle('gate');
    const easy = c.attempt > 5;
    const gaps = opts.gaps ?? (c.d < 0.2 ? 1 : this.rng() < 0.45 ? 2 : 1);
    const width = gaps === 1 ? Math.round(lerp(16, 6, c.d)) + (easy ? 5 : 0) : Math.round(lerp(11, 5, c.d)) + (easy ? 4 : 0);
    const solid = new Uint8Array(BLOCK_COUNT).fill(1);
    const first = 0;
    for (let g = 0; g < gaps; g += 1) {
      const centre = first + Math.round((g * BLOCK_COUNT) / gaps + (g > 0 ? this.int(-4, 4) : 0));
      for (let i = 0; i < width; i += 1) solid[(centre - Math.floor(width / 2) + i + BLOCK_COUNT) % BLOCK_COUNT] = 0;
    }
    o.blocks = [];
    for (let i = 0; i < BLOCK_COUNT; i += 1) if (solid[i]) o.blocks.push(i);
    o.base = this.range(0, TWO_PI);
    const spinAllowed = c.t > 40 || opts.spin;
    if (spinAllowed && (opts.spin || this.rng() < 0.55)) {
      o.motion = 'rotate';
      const rate = this.range(0.35, 0.7 + c.d * 0.7) * (opts.spin ?? this.sign());
      o.k = this.rateToK(rate, c.speedA);
    }
    return o;
  }

  buildLaser(c, opts) {
    const o = this.newObstacle('laser');
    const beams = opts.beams ?? (c.d < 0.4 ? 1 : this.rng() < 0.5 ? 2 : 1);
    o.beams = [];
    for (let i = 0; i < beams; i += 1) o.beams.push((i * Math.PI) / beams + this.range(-0.15, 0.15));
    o.base = this.range(0, TWO_PI);
    if (opts.rotate || (c.t > 58 && this.rng() < 0.6)) {
      o.motion = 'rotate';
      o.k = this.rateToK(this.sign() * this.range(0.5, 0.9 + c.d * 0.6), c.speedA);
    }
    return o;
  }

  buildBlades(c, opts) {
    const o = this.newObstacle('blades');
    const n = opts.count ?? this.int(2, c.d > 0.7 ? 4 : 3);
    o.blades = [];
    for (let i = 0; i < n; i += 1) o.blades.push((i * TWO_PI) / n);
    o.base = this.range(0, TWO_PI);
    o.motion = 'rotate';
    const maxRate = maxOmegaAt(c.speedA) * 0.55;
    o.k = this.rateToK(this.sign() * Math.min(maxRate, this.range(0.9, 1.4 + c.d * 0.7)), c.speedA);
    return o;
  }

  // ---------------------------------------------------------------- solver

  computeFree(o) {
    const rot = rotationAt(o, 0);
    let motionMargin = 0;
    const window = o.hd + PLAYER.radius;
    if (o.motion === 'rotate') motionMargin = Math.abs(o.k) * window;
    else if (o.motion === 'osc') motionMargin = Math.abs(o.amp * o.k) * window;
    const margin = PLAYER_HALF_ANGLE * GEN.playerHalfMargin + motionMargin;
    let count = 0;
    for (let b = 0; b < B; b += 1) {
      const theta = b * BIN;
      let free = 1;
      for (let i = 0; i < o.arcs.length; i += 1) {
        const arc = o.arcs[i];
        if (Math.abs(angleDiff(theta, rot + arc.a)) <= arc.h + margin) {
          free = 0;
          break;
        }
      }
      this.free[b] = free;
      count += free;
    }
    return count;
  }

  isReachable(reachBins) {
    distanceTo(this.free, this.distFree);
    for (let b = 0; b < B; b += 1) {
      if (this.feasible[b] && this.distFree[b] > reachBins) return false;
    }
    return true;
  }

  reachBinsFor(ds, speed) {
    const dt = ds / speed;
    const reach = maxOmegaAt(speed) * Math.max(0, dt - GEN.reachLag) * GEN.reachSafety;
    return Math.floor(reach / BIN);
  }

  generateRow(tA) {
    if (this.queue.length === 0) this.queue = this.choosePattern(tA);
    const spec = this.queue.shift();
    const speedA = speedAt(tA);
    const d = difficultyAt(tA);
    const gapSeconds = lerp(GEN.rowGapSecondsStart, GEN.rowGapSecondsEnd, d) * spec.gap;
    let ds = Math.max(spec.minGap ?? 8, gapSeconds * speedA);
    const first = this.lastRowS === 0;
    let accepted = null;
    let reachBins = 0;

    for (let extend = 0; extend < 6 && !accepted; extend += 1) {
      reachBins = first ? B : this.reachBinsFor(ds, speedA);
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const ctx = { rng: this.rng, t: tA, d, speedA, attempt };
        const o = buildArcs(attempt < 10 ? spec.build(ctx) : this.buildSpikes(ctx, { clusters: 1, maxCount: 2 }));
        if (this.computeFree(o) < 3) continue;
        if (this.isReachable(reachBins)) {
          accepted = o;
          break;
        }
      }
      if (!accepted) ds *= 1.35; // give the player more time and try again
    }
    if (!accepted) {
      // Guaranteed fallback: enough distance to reach anywhere, tiny obstacle.
      const omega = maxOmegaAt(speedA) * GEN.reachSafety;
      ds = Math.max(ds, (Math.PI / omega + GEN.reachLag + 0.1) * speedA);
      reachBins = this.reachBinsFor(ds, speedA);
      accepted = buildArcs(this.buildSpikes({ rng: this.rng, t: tA, d, speedA, attempt: 99 }, { clusters: 1, maxCount: 2 }));
      this.computeFree(accepted);
      distanceTo(this.free, this.distFree);
    }

    const s = first ? GEN.firstRowDistance : this.lastRowS + ds;
    accepted.s = s;

    // new feasible set = (old feasible dilated by reach) ∩ free
    distanceTo(this.feasible, this.distFeasible);
    let feasibleCount = 0;
    for (let b = 0; b < B; b += 1) {
      const f = this.free[b] && this.distFeasible[b] <= reachBins ? 1 : 0;
      this.feasible[b] = f;
      feasibleCount += f;
    }

    this.placePickups(this.lastRowS, s, reachBins, tA);

    if (this.log) {
      this.log.push({
        s,
        ds: first ? s : ds,
        speed: speedA,
        t: tA,
        reachBins,
        feasibleCount,
        obstacle: accepted,
      });
    }

    this.lastRowS = s;
    this.rowCount += 1;
    this.out.obstacles.push(accepted);
  }

  /** Guides the player along a guaranteed-safe line with energy, sometimes a power-up. */
  placePickups(fromS, toS, reachBins, tA) {
    // choose a target bin inside the new feasible set reachable from the path bin
    for (let b = 0; b < B; b += 1) this.blocked[b] = this.feasible[b] ? 0 : 1;
    distanceTo(this.blocked, this.distBlocked);
    let best = -1;
    let bestScore = -Infinity;
    for (let b = 0; b < B; b += 1) {
      if (!this.feasible[b]) continue;
      let delta = Math.abs(b - this.pathBin);
      delta = Math.min(delta, B - delta);
      if (delta > reachBins) continue;
      const centred = Math.min(this.distBlocked[b], 6);
      const score = centred * 3 - delta * 0.25 + this.rng() * 2;
      if (score > bestScore) {
        bestScore = score;
        best = b;
      }
    }
    if (best < 0) {
      // path bin dropped out (should not happen); re-anchor on any feasible bin
      best = this.feasible.indexOf(1);
      this.pathBin = best;
      return;
    }
    const startAngle = this.pathBin * BIN;
    const diff = angleDiff(best * BIN, startAngle);
    const span = toS - fromS;
    const start = fromS === 0 ? toS - Math.min(40, span) : fromS;
    const usable = toS - start;

    let powerUpS = -1;
    if (tA >= this.nextPowerUpT && usable >= 12 && fromS > 0) {
      const r = this.rng();
      const type = r < 0.36 ? 'shield' : r < 0.7 ? 'boost' : 'magnet';
      powerUpS = start + usable * 0.5;
      const frac = (powerUpS - fromS) / span;
      this.out.pickups.push({ kind: 'powerup', type, s: powerUpS, angle: wrapAngle(startAngle + diff * Math.max(0, frac)) });
      this.nextPowerUpT = tA + this.range(GEN.powerUpEvery[0], GEN.powerUpEvery[1]);
    }

    if (this.rng() < GEN.orbChainChance && usable > 8) {
      const step = 3.1;
      for (let os = start + 3; os < toS - 3; os += step) {
        if (powerUpS > 0 && Math.abs(os - powerUpS) < 2.5) continue;
        const frac = fromS === 0 ? 1 : (os - fromS) / span;
        this.out.pickups.push({ kind: 'energy', s: os, angle: wrapAngle(startAngle + diff * frac) });
      }
    }
    this.pathBin = best;
  }
}

export { SPEED };
