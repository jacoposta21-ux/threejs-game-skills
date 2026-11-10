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
 *   ik        foot-driven animation (see TrickIK.js): where each foot goes.
 *             `out` is the exit-side foot, `in` the other. Keys are
 *             [u, 'body' | 'ball' | 'hold', s, f, y, arc?] with s toward the
 *             exit side, f forward, y the height of the sole.
 *             attach: [{ foot, u0, u1, off(u) → [s, f] }] — while a foot is on
 *             the ball, the ball goes where that foot takes it.
 */
export const TRICKS = {
  stepover: {
    label: 'STEPOVER', points: 100, clip: 'Trick_Stepover', dur: 0.7, speed: 0.9, risk: 0.06, maxSpeed: 6, fool: 0.75, key: 0.3,
    impulse: { u: 0.88, angle: 35, speed: 3.4 },
    turn: [0.7, 1, 35],
    // The far foot swings over the front of the rolling ball to sell the other way and plants wide;
    // the near foot then takes it away with the outside of the boot.
    ik: {
      in: [[0.08, 'hold'], [0.2, 'ball', 0.08, -0.16, 0.16], [0.34, 'ball', -0.02, 0.22, 0.2], [0.46, 'ball', -0.3, 0.06, 0], [1, 'hold']],
      out: [[0.5, 'hold'], [0.72, 'ball', -0.17, -0.1, 0.03, 0.05], [0.88, 'ball', -0.1, 0.04, 0.04], [0.97, 'body', 0.14, 0.25, 0]],
      sway: [[0.3, -0.08], [0.46, -0.14], [0.75, 0.06]],
      lean: [[0.36, -14], [0.6, -8], [0.85, 10]],
      twist: [[0.36, -18], [0.8, 14]],
    },
  },
  feint: {
    label: 'BODY FEINT', points: 100, clip: 'Trick_Feint', dur: 0.5, speed: 2.3, risk: 0.08, maxSpeed: 6.5, fool: 0.7, key: 0.4,
    impulse: { u: 0.58, angle: 55, speed: 4.3 },
    turn: [0.5, 0.9, 55],
    // A big step and a dropped shoulder the wrong way, then pushed off that foot and away.
    ik: {
      in: [[0.05, 'hold'], [0.34, 'body', -0.46, 0.3, 0, 0.1], [0.8, 'hold'], [0.98, 'body', -0.12, 0.1, 0]],
      out: [[0.38, 'hold'], [0.58, 'ball', -0.17, -0.08, 0.03, 0.05], [0.74, 'ball', -0.06, 0.08, 0.05], [0.95, 'body', 0.16, 0.3, 0]],
      sway: [[0.34, -0.2], [0.62, 0.08]],
      lean: [[0.32, -20], [0.62, 14]],
      twist: [[0.3, -22], [0.7, 16]],
      dip: [[0.34, 0.06]],
    },
  },
  ballroll: {
    label: 'BALL ROLL', points: 150, clip: 'Trick_BallRoll', dur: 0.65, speed: 0, lateral: 1.4, risk: 0.07, maxSpeed: 2.5, fool: 0.55, key: 0.5,
    impulse: { u: 0.9, angle: 10, speed: 2.6 },
    // Sole of the far foot on top of the ball, rolled across the body.
    ik: {
      in: [[0.04, 'hold'], [0.18, 'ball', 0, -0.02, 0.2, 0.05], [0.6, 'body', 0.42, 0.36, 0.2], [0.78, 'body', 0.2, 0.05, 0]],
      out: [[0.2, 'hold'], [0.45, 'body', 0.5, 0, 0, 0.06], [0.8, 'hold'], [0.98, 'body', 0.12, 0, 0]],
      attach: [{ foot: 'in', u0: 0.18, u1: 0.6, off: () => [0, 0.03] }],
      sway: [[0.4, 0.06]],
      lean: [[0.4, -8]],
    },
  },
  cut: {
    label: 'QUICK CUT', points: 150, clip: 'Trick_Cut', dur: 0.38, speed: (u, v) => Math.max(2, v * 0.8), risk: 0.1, maxSpeed: 7.5, fool: 0.5, key: 0.3,
    impulse: { u: 0.32, angle: 75, speed: (v) => Math.max(3.6, v * 0.9 + 1) },
    turn: [0.2, 0.65, 75],
    // Hard plant, then the inside of the far foot chops the ball across.
    ik: {
      out: [[0.05, 'hold'], [0.3, 'body', 0.2, 0.35, 0, 0.08], [1, 'hold']],
      in: [[0.12, 'hold'], [0.32, 'ball', -0.17, -0.02, 0.04, 0.1], [0.5, 'ball', -0.02, 0.14, 0.06], [0.85, 'body', -0.14, 0.3, 0]],
      sway: [[0.3, 0.1]],
      lean: [[0.3, 22], [0.7, 10]],
      twist: [[0.3, 20]],
      dip: [[0.3, 0.07]],
    },
  },
  roulette: {
    label: 'ROULETTE', points: 250, clip: 'Trick_Roulette', dur: 0.8, speed: 0.4, lateral: 2.1, risk: 0.12, maxSpeed: 5, fool: 0.8, key: 0.5,
    spin: Math.PI * 2,
    impulse: { u: 0.92, angle: 45, speed: 3.6 },
    turn: [0.85, 1, 45],
    // Sole of the near foot stops and drags the ball, the body turns over it, the other sole takes it on.
    ik: {
      out: [[0.04, 'hold'], [0.14, 'ball', 0, -0.02, 0.2, 0.05], [0.36, 'body', 0.1, 0.05, 0.2], [0.46, 'body', 0.16, -0.05, 0], [0.9, 'hold']],
      in: [[0.38, 'hold'], [0.52, 'ball', 0, -0.02, 0.2, 0.1], [0.82, 'body', 0.05, 0.34, 0.2], [0.95, 'body', -0.12, 0.05, 0]],
      attach: [{ foot: 'out', u0: 0.14, u1: 0.36, off: () => [0, 0.03] }, { foot: 'in', u0: 0.52, u1: 0.82, off: () => [0, 0.03] }],
      lean: [[0.4, 8]],
      pitch: [[0.4, 6]],
    },
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
    impulse: { u: 0.35, angle: 0, speed: 4.4, vy: 0.05 },
    // A quick toe-poke through the gap.
    ik: {
      out: [[0.08, 'hold'], [0.32, 'ball', 0, -0.2, 0.05, 0.06], [0.48, 'ball', 0, -0.02, 0.08], [0.8, 'body', 0.12, 0.35, 0]],
      in: [[0.5, 'hold'], [0.95, 'body', -0.12, 0.2, 0]],
      pitch: [[0.35, 8]],
    },
    ghostVictim: 1.2,
    pending: 3.0,
  },
  // Second skill button (R).
  elastico: {
    label: 'ELASTICO', points: 300, clip: 'Trick_Elastico', dur: 0.6, speed: 1.1, risk: 0.13, maxSpeed: 6, fool: 0.95, key: 0.5,
    // Pushed out to the far side with the outside of the boot, snapped back across with the inside.
    impulse: { u: 0.64, angle: 60, speed: 4.6 },
    turn: [0.55, 0.95, 60],
    // One foot, two touches: the outside of the boot shoves the ball away, the foot wraps round it and the inside whips it back.
    ik: {
      in: [[0.05, 'hold'], [0.16, 'ball', 0.16, -0.04, 0.04, 0.06], [0.42, 'body', -0.2, 0.52, 0.04], [0.5, 'body', -0.46, 0.5, 0.05], [0.64, 'body', -0.22, 0.56, 0.04], [0.9, 'body', -0.12, 0.25, 0]],
      out: [[0.72, 'hold'], [0.97, 'body', 0.14, 0.3, 0]],
      attach: [{
        foot: 'in', u0: 0.16, u1: 0.64,
        off: (u) => {
          const k = Math.min(1, Math.max(0, (u - 0.42) / 0.08));
          const w = k * k * (3 - 2 * k);
          return [-0.16 + 0.32 * w, 0.04 + 0.1 * Math.sin(Math.PI * w)];
        },
      }],
      sway: [[0.45, -0.12], [0.7, 0.05]],
      lean: [[0.45, -12], [0.7, 10]],
      twist: [[0.45, -14], [0.7, 12]],
    },
  },
  sombrero: {
    label: 'SOMBRERO', points: 450, clip: 'Trick_Sombrero', dur: 0.6, speed: 2.4, risk: 0.18, maxSpeed: 6, fool: 1.0, key: 0.4,
    hold: [0, 0.38, () => ({ f: 0.4, e: 0 })],
    impulse: { u: 0.4, angle: 0, speed: (v) => v * 0.35 + 3.3, vy: 5.3 },
    ghostVictim: 1.1,
    pending: 2.4,
  },
  dragback: {
    label: 'DRAG BACK', points: 200, clip: 'Trick_DragBack', dur: 0.6, speed: 0.3, risk: 0.07, maxSpeed: 5, fool: 0.75, key: 0.45,
    // Sole on the ball, rolled back under the body, then away on the turn.
    impulse: { u: 0.62, angle: 140, speed: 3.8 },
    turn: [0.4, 0.95, 140],
    ik: {
      out: [[0.04, 'hold'], [0.14, 'ball', 0, -0.03, 0.2, 0.06], [0.5, 'body', 0.12, -0.12, 0.2], [0.62, 'body', 0.2, -0.05, 0], [1, 'hold']],
      in: [[0.62, 'hold'], [0.9, 'body', -0.12, 0.15, 0]],
      attach: [{ foot: 'out', u0: 0.14, u1: 0.52, off: () => [0, 0.03] }],
      pitch: [[0.3, 10]],
    },
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
export function chooseTrick({ hasInput, relForward, relSide, sprint, speed, charging, victimAhead, set = 1 }) {
  if (charging) return { kind: 'fakeshot', side: relSide >= 0 ? 1 : -1 };
  if (set === 2) {
    // R: elastico (standing / sideways, the side picks the exit), sombrero going forward, drag-back pulling away.
    if (hasInput && relForward > 0.6) return { kind: 'sombrero', side: 1 };
    if (hasInput && relForward < -0.6) return { kind: 'dragback', side: relSide >= 0 ? 1 : -1 };
    return { kind: 'elastico', side: hasInput ? (relSide >= 0 ? 1 : -1) : 0 };
  }
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
