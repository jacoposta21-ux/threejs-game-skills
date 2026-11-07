import { PLAYER, SPEED, TIERS } from './Config.js';

// Pure functions describing the difficulty curve. Shared by the game, the
// generator and the offline fairness checker so they can never disagree.

export function speedAt(t) {
  const s = SPEED.start + SPEED.ramp * (1 - Math.exp(-t / SPEED.rampTime)) + SPEED.lateGain * Math.max(0, t - 120);
  return Math.min(SPEED.max, s);
}

/** Smooth 0..1 difficulty: ~0.3 at 30s, ~0.5 at 60s, ~0.75 at 120s. */
export function difficultyAt(t) {
  return 1 - Math.exp(-t / 85);
}

export function maxOmegaAt(speed) {
  return PLAYER.maxOmegaBase + PLAYER.maxOmegaGain * Math.max(0, speed - SPEED.start);
}

export function tierAt(t) {
  let index = 0;
  for (let i = 0; i < TIERS.length; i += 1) if (t >= TIERS[i].from) index = i;
  return index;
}

/** Soft unlock: 0 before `from`, ramps to 1 over `span` seconds. */
export function unlock(t, from, span = 12) {
  return Math.max(0, Math.min(1, (t - from) / span));
}
