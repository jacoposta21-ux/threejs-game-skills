import * as THREE from 'three';

/**
 * Freestyle trick definitions. Local frame at trick start: f = forward,
 * e = exit side (player's right for side +1, left for −1).
 *
 *   dur       seconds
 *   speed     forward speed during the trick (m/s), or fn(u, entrySpeed)
 *   lateral   sideways travel speed along e (m/s)
 *   hold      [uFrom, uTo, (u) => ({ f, e })]: the ball is driven to this local point
 *   impulse   { u, dir: fn(ctx) → { angleToE (deg), speed, vy } }: the ball is played
 *   turn      [uFrom, uTo, degrees toward e]: heading change
 *   spin      full-body visual spin (radians, toward e) over [0.1, 0.9]
 *   key       u where the success / fail roll is resolved
 *   pending   points only once the player regains the ball within `window` s
 *   risk      base fail chance; maxSpeed above which risk climbs
 *   fool      seconds the beaten defender is wrong-footed
 */
export const TRICKS = {
  stepover: {
    label: 'STEPOVER', points: 100, clip: 'Trick_Stepover', dur: 0.7, speed: 1.5, risk: 0.06, maxSpeed: 6, fool: 0.75, key: 0.3,
    hold: [0, 0.95, () => ({ f: 0.5, e: 0 })],
    impulse: { u: 0.95, angle: 35, speed: 3.4 },
    turn: [0.7, 1, 35],
  },
  feint: {
    label: 'BODY FEINT', points: 100, clip: 'Trick_Feint', dur: 0.5, speed: 2.3, risk: 0.08, maxSpeed: 6.5, fool: 0.7, key: 0.4,
    hold: [0, 0.55, (u) => ({ f: 0.45, e: -0.18 * Math.sin(u * Math.PI * 1.8) })],
    impulse: { u: 0.56, angle: 55, speed: 4.3 },
    turn: [0.5, 0.9, 55],
  },
  ballroll: {
    label: 'BALL ROLL', points: 150, clip: 'Trick_BallRoll', dur: 0.6, speed: 0, lateral: 1.4, risk: 0.07, maxSpeed: 2.5, fool: 0.55, key: 0.5,
    hold: [0, 0.9, (u) => ({ f: 0.36, e: -0.1 + 0.6 * u })],
    impulse: { u: 0.92, angle: 10, speed: 2.6 },
  },
  cut: {
    label: 'QUICK CUT', points: 150, clip: 'Trick_Cut', dur: 0.38, speed: (u, v) => Math.max(2, v * 0.8), risk: 0.1, maxSpeed: 7.5, fool: 0.5, key: 0.3,
    hold: [0, 0.25, () => ({ f: 0.5, e: 0 })],
    impulse: { u: 0.3, angle: 75, speed: (v) => Math.max(3.6, v * 0.9 + 1) },
    turn: [0.2, 0.65, 75],
  },
  roulette: {
    label: 'ROULETTE', points: 250, clip: 'Trick_Roulette', dur: 0.8, speed: 0.4, lateral: 2.1, risk: 0.12, maxSpeed: 5, fool: 0.8, key: 0.5,
    spin: Math.PI * 2,
    hold: [0, 0.9, () => ({ f: 0.3, e: 0.28 })],
    impulse: { u: 0.92, angle: 45, speed: 3.6 },
    turn: [0.85, 1, 45],
  },
  heel: {
    label: 'HEEL FLICK', points: 300, clip: 'Trick_Heel', dur: 0.62, speed: 0.6, risk: 0.13, maxSpeed: 5.5, fool: 0.75, key: 0.43,
    hold: [0, 0.42, () => ({ f: 0.42, e: 0 })],
    impulse: { u: 0.44, angle: 180, speed: 4.2, vy: 0.8 },
    turn: [0.5, 1, 180],
  },
  rainbow: {
    label: 'RAINBOW FLICK', points: 400, clip: 'Trick_Rainbow', dur: 0.75, speed: 3, risk: 0.2, maxSpeed: 7.5, fool: 1.0, key: 0.43,
    hold: [0, 0.42, () => ({ f: 0.22, e: 0 })],
    impulse: { u: 0.43, angle: 0, speed: (v) => v * 0.5 + 3.3, vy: 5.6 },
    ghostVictim: 1.1,
    pending: 2.4,
  },
  nutmeg: {
    label: 'NUTMEG', points: 500, clip: 'Trick_Nutmeg', dur: 0.4, speed: 2.6, risk: 0.16, maxSpeed: 7, fool: 1.3, key: 0.35,
    hold: [0, 0.33, () => ({ f: 0.45, e: 0 })],
    impulse: { u: 0.35, angle: 0, speed: 4.4, vy: 0.05 },
    ghostVictim: 1.2,
    pending: 3.0,
  },
  fakeshot: {
    label: 'FAKE SHOT', points: 200, clip: 'Trick_FakeShot', dur: 0.62, speed: 0.6, risk: 0.07, maxSpeed: 6, fool: 0.9, key: 0.46,
    hold: [0, 0.46, () => ({ f: 0.45, e: 0 })],
    impulse: { u: 0.48, angle: 80, speed: 3.1 },
    turn: [0.5, 0.95, 70],
  },
};

/** Opponent-skill penalty to trick success, by the opponents' AI level. */
export const DEFENDER_READ = { easy: 0, normal: 0.05, hard: 0.12 };

/**
 * Pick the trick from the human's input relative to facing.
 * relForward/relSide: input components in the player's frame (side +1 = right).
 */
export function chooseTrick({ hasInput, relForward, relSide, sprint, speed, charging, victimAhead }) {
  if (charging) return { kind: 'fakeshot', side: relSide >= 0 ? 1 : -1 };
  if (!hasInput) return { kind: 'stepover', side: 0 };
  const side = relSide >= 0 ? 1 : -1;
  if (relForward > 0.6) {
    if (sprint) return { kind: 'rainbow', side: 1 };
    // A nutmeg needs legs to play it through; alone it is a stepover-and-go.
    if (victimAhead) return { kind: 'nutmeg', side: 1 };
    return { kind: 'stepover', side: relSide >= 0 ? 1 : -1 };
  }
  if (relForward < -0.6) return { kind: sprint ? 'heel' : 'roulette', side };
  if (speed < 1.5) return { kind: 'ballroll', side };
  return { kind: sprint ? 'cut' : 'feint', side };
}

/** Rotate a ground vector by `deg` toward the exit side. */
export function rotateToward(f, side, deg, out = new THREE.Vector3()) {
  // Exit side +1 is the player's right: turning right is a negative yaw.
  const a = THREE.MathUtils.degToRad(deg) * -side;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return out.set(f.x * c + f.z * s, 0, -f.x * s + f.z * c);
}
