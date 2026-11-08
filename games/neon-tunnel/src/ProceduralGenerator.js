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
    this.forceOrbRows = 0; // tutorial: guarantee energy trails on the first rows
    this.noPowerUps = false; // promo capture: plain runs without power-ups
    // Guaranteed-safe line through every row (the same line the coins follow),
    // as unwrapped angles by tunnel distance. Used by the promo pilot.
    this.pathLog = [];
    this.pathU = null;
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
      ['lane', unlock(t, 50) * 0.45],
      ['corkscrew', unlock(t, 75) * 0.45],
      ['doubleGate', unlock(t, 90) * 0.4],
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
    const rows = this.patternRows(id, t);
    for (const r of rows) r.pattern = id;
    return rows;
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
        const anchor = {};
        for (let i = 0; i < n; i += 1) {
          // spikes block the anchor side; the lane is opposite
          rows.push({ gap: i === 0 ? 1.2 : 0.5, minGap: 7, build: (c) => this.buildSpikes(c, { clusters: 1, fixedAngle: this.anchored(anchor, i, c, Math.PI + step * i), minCount: 4, maxCount: 6 }) });
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
        const anchor = {};
        for (let i = 0; i < n; i += 1) {
          rows.push({ gap: i === 0 ? 1 : 0.62, minGap: 9, build: (c) => this.buildWall(c, { moving: false, fixedAngle: this.anchored(anchor, i, c, Math.PI + (i % 2) * Math.PI), blocks: this.int(18, 22) }) });
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
      case 'lane': {
        // the tunnel "narrows": consecutive walls leave one drifting lane
        const n = this.int(4, 5);
        const drift = this.sign() * this.range(0.12, 0.3);
        const anchor = {};
        for (let i = 0; i < n; i += 1) {
          rows.push({ gap: i === 0 ? 1.3 : 0.4, minGap: 7, build: (c) => this.buildWall(c, { moving: false, fixedAngle: this.anchored(anchor, i, c, Math.PI + drift * i), blocks: this.int(34, 37) }) });
        }
        break;
      }
      case 'corkscrew': {
        // a spiral of single-gap gates: forces continuous rotation one way
        const n = this.int(6, 8);
        const step = this.sign() * this.range(0.5, 0.7);
        const anchor = {};
        for (let i = 0; i < n; i += 1) {
          rows.push({ gap: i === 0 ? 1.3 : 0.42, minGap: 7, build: (c) => this.buildGate(c, { gaps: 1, fixedAngle: this.anchored(anchor, i, c, step * i), width: 9 }) });
        }
        break;
      }
      case 'doubleGate': {
        const dir = this.sign();
        rows.push({ gap: 1, build: (c) => this.buildGate(c, { gaps: 2, spin: dir }) });
        rows.push({ gap: 0.3, minGap: 5, build: (c) => this.buildGate(c, { gaps: 2, spin: -dir }) });
        break;
      }
      default:
        rows.push({ gap: 1, build: (c) => this.buildSpikes(c, {}) });
    }
    return rows;
  }

  /** Circular mean of the currently feasible angles (where the player can be). */
  feasibleCenter() {
    let x = 0;
    let y = 0;
    for (let b = 0; b < B; b += 1) {
      if (!this.feasible[b]) continue;
      x += Math.cos(b * BIN);
      y += Math.sin(b * BIN);
    }
    return x === 0 && y === 0 ? this.pathBin * BIN : Math.atan2(y, x);
  }

  /**
   * Shared anchor for fixed-shape patterns. The first row anchors the pattern
   * on the reachable region (with growing jitter on retries); later rows are
   * laid out relative to it, so the whole pattern stays solvable.
   */
  anchored(anchor, i, c, offset) {
    if (i === 0) anchor.a = this.feasibleCenter() + this.range(-0.5, 0.5) * Math.min(1, c.attempt / 4);
    return anchor.a + offset;
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
    const width = (opts.width ?? (gaps === 1 ? Math.round(lerp(16, 6, c.d)) : Math.round(lerp(11, 5, c.d)))) + (easy ? (gaps === 1 ? 5 : 4) : 0);
    const solid = new Uint8Array(BLOCK_COUNT).fill(1);
    const first = 0;
    for (let g = 0; g < gaps; g += 1) {
      const centre = first + Math.round((g * BLOCK_COUNT) / gaps + (g > 0 ? this.int(-4, 4) : 0));
      for (let i = 0; i < width; i += 1) solid[(centre - Math.floor(width / 2) + i + BLOCK_COUNT) % BLOCK_COUNT] = 0;
    }
    o.blocks = [];
    for (let i = 0; i < BLOCK_COUNT; i += 1) if (solid[i]) o.blocks.push(i);
    o.base = opts.fixedAngle ?? this.range(0, TWO_PI);
    const spinAllowed = opts.fixedAngle === undefined && (c.t > 40 || opts.spin);
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
      // fixed-shape patterns get extra distance before we give up on them
      const attempts = extend >= 3 ? 12 : 10;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const ctx = { rng: this.rng, t: tA, d, speedA, attempt };
        const o = buildArcs(attempt < 10 ? spec.build(ctx) : this.buildSpikes(ctx, { clusters: 1, maxCount: 2 }));
        o.pattern = (attempt < 10 ? '' : 'fallback:') + (spec.pattern ?? 'intro');
        o.extended = extend;
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
    if (this.pathU === null) this.pathU = startAngle;
    this.pathLog.push({ s: fromS, a: this.pathU }, { s: toS, a: this.pathU + diff });
    this.pathU += diff;
    if (this.pathLog.length > 400) this.pathLog.splice(0, 100);

    if (!this.noPowerUps && tA >= this.nextPowerUpT && usable >= 12 && fromS > 0) {
      const r = this.rng();
      const type = r < 0.36 ? 'shield' : r < 0.7 ? 'boost' : 'magnet';
      powerUpS = start + usable * 0.5;
      const frac = (powerUpS - fromS) / span;
      this.out.pickups.push({ kind: 'powerup', type, s: powerUpS, angle: wrapAngle(startAngle + diff * Math.max(0, frac)) });
      this.nextPowerUpT = tA + this.range(GEN.powerUpEvery[0], GEN.powerUpEvery[1]);
    }

    const forced = this.forceOrbRows > 0;
    if (forced) this.forceOrbRows -= 1;
    if ((forced || this.rng() < GEN.orbChainChance) && usable > 8) {
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
