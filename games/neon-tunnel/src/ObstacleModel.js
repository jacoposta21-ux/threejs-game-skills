// Renderer-independent obstacle maths: shapes are described as angular arcs in
// the band the sphere travels through, so collision and the fairness solver use
// exactly the same geometry as the visuals are built from.

import { PLAYER } from './Config.js';

export const TWO_PI = Math.PI * 2;
export const BLOCK_COUNT = 48; // wall / gate blocks per full circle
export const BLOCK_STEP = TWO_PI / BLOCK_COUNT;

export const PLAYER_HALF_ANGLE = Math.asin(PLAYER.radius / PLAYER.orbitRadius);

export function wrapAngle(a) {
  a %= TWO_PI;
  return a < 0 ? a + TWO_PI : a;
}

export function angleDiff(a, b) {
  let d = (a - b) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  else if (d < -Math.PI) d += TWO_PI;
  return d;
}

/** Collision half-depths along the tunnel axis per obstacle type. */
export const HALF_DEPTH = {
  spikes: 0.32,
  laser: 0.08,
  blades: 0.12,
  wall: 0.7,
  gate: 0.24,
};

/** Rotation of an obstacle when it is `dz` world units ahead of the player. */
export function rotationAt(o, dz) {
  if (o.motion === 'rotate') return o.base + o.k * dz;
  if (o.motion === 'osc') return o.base + o.amp * Math.sin(o.k * dz);
  return o.base;
}

/** Converts a sorted list of block indices into merged arcs (block-centred angles). */
export function blocksToArcs(blocks) {
  const solid = new Uint8Array(BLOCK_COUNT);
  for (const b of blocks) solid[((b % BLOCK_COUNT) + BLOCK_COUNT) % BLOCK_COUNT] = 1;
  const arcs = [];
  let s0 = solid.indexOf(0);
  if (s0 < 0) return [{ a: 0, h: Math.PI }];
  let runStart = -1;
  for (let i = 1; i <= BLOCK_COUNT; i += 1) {
    const idx = (s0 + i) % BLOCK_COUNT;
    if (solid[idx]) {
      if (runStart < 0) runStart = i;
    } else if (runStart >= 0) {
      const n = i - runStart;
      arcs.push({ a: (s0 + runStart + (n - 1) / 2) * BLOCK_STEP, h: (n * BLOCK_STEP) / 2 });
      runStart = -1;
    }
  }
  return arcs;
}

// Shape constants used both by visuals (Obstacles.js) and arcs below.
export const SHAPE = {
  spikeSpacing: 0.2, // rad between spikes in a cluster
  spikeHalfAtBand: 0.36, // world units: half width of a spike at the sphere band
  laserCoreRadius: 0.07,
  bladeHalfAtBand: 0.4,
};

/** Builds collision arcs for an obstacle definition (mutates and returns it). */
export function buildArcs(o) {
  const r = PLAYER.orbitRadius;
  switch (o.type) {
    case 'spikes': {
      o.arcs = [];
      for (const cluster of o.clusters) {
        const half = ((cluster.count - 1) * SHAPE.spikeSpacing) / 2 + SHAPE.spikeHalfAtBand / r;
        o.arcs.push({ a: cluster.a, h: half });
      }
      break;
    }
    case 'laser':
      o.arcs = [];
      for (const beam of o.beams) {
        const h = SHAPE.laserCoreRadius / r + 0.012;
        o.arcs.push({ a: beam, h }, { a: beam + Math.PI, h });
      }
      break;
    case 'blades':
      o.arcs = o.blades.map((a) => ({ a, h: SHAPE.bladeHalfAtBand / r }));
      break;
    case 'wall':
    case 'gate':
      o.arcs = blocksToArcs(o.blocks);
      break;
    default:
      o.arcs = [];
  }
  return o;
}

/**
 * Smallest clearance (in radians, positive = free) between the player centre
 * angle and any solid arc of the obstacle at rotation `rot`.
 */
export function clearance(o, rot, playerAngle) {
  let best = Infinity;
  for (let i = 0; i < o.arcs.length; i += 1) {
    const arc = o.arcs[i];
    const d = Math.abs(angleDiff(playerAngle, rot + arc.a)) - arc.h - PLAYER_HALF_ANGLE;
    if (d < best) best = d;
  }
  return best;
}
