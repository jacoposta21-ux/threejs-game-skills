import * as THREE from 'three';
import { BONES } from './CharacterLibrary.js';

// Character space: +X = character's left, +Y = up, +Z = forward.
//   pitch (about X): +  swings a hanging limb backward / bends the torso forward.
//   yaw   (about Y): +  turns toward the character's left.
//   roll  (about Z): +  raises the LEFT arm outward / tilts the torso to the right.
const AX = { pitch: new THREE.Vector3(1, 0, 0), yaw: new THREE.Vector3(0, 1, 0), roll: new THREE.Vector3(0, 0, 1) };
const D = THREE.MathUtils.DEG2RAD;

/** Timed football events inside authored clips (seconds). */
export const CLIP_EVENTS = {
  Kick_Shot: { contact: 0.21 },
  Kick_Pass: { contact: 0.16 },
  Keeper_Throw: { release: 0.42 },
};

function makeAuthor(lib) {
  const rig = lib.poseScratch('Idle_Loop', 0);
  const base = new Map();
  for (const [name, bone] of rig.bones) {
    base.set(name, {
      local: bone.quaternion.clone(),
      world: bone.getWorldQuaternion(new THREE.Quaternion()),
      pos: bone.position.clone(),
    });
  }
  const footBase = {
    L: rig.bones.get(BONES.footL).getWorldPosition(new THREE.Vector3()).y,
    R: rig.bones.get(BONES.footR).getWorldPosition(new THREE.Vector3()).y,
  };

  const q = new THREE.Quaternion();
  const r = new THREE.Quaternion();
  const inv = new THREE.Quaternion();

  /** Pose spec -> Map(boneName -> local quaternion). */
  function solve(spec) {
    const out = new Map();
    for (const [name, rots] of Object.entries(spec)) {
      const b = base.get(name);
      if (!b) throw new Error(`Unknown bone in pose: ${name}`);
      r.identity();
      for (const [axis, deg] of rots) {
        q.setFromAxisAngle(AX[axis], deg * D);
        r.premultiply(q);
      }
      inv.copy(b.world).invert();
      // local' = local * (W^-1 * R * W)
      const delta = inv.clone().multiply(r).multiply(b.world);
      out.set(name, b.local.clone().multiply(delta));
    }
    return out;
  }

  /** Vertical hips correction (world metres) keeping the plant foot on its base height. */
  function groundFix(locals, plant) {
    if (!plant) return 0;
    for (const [name, bone] of rig.bones) bone.quaternion.copy(locals.get(name) ?? base.get(name).local);
    rig.bones.get(BONES.hips).position.copy(base.get(BONES.hips).pos);
    rig.root.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    const dl = rig.bones.get(BONES.footL).getWorldPosition(v).y - footBase.L;
    const dr = rig.bones.get(BONES.footR).getWorldPosition(v).y - footBase.R;
    if (plant === 'L') return dl;
    if (plant === 'R') return dr;
    return Math.min(dl, dr);
  }

  /**
   * keys: [{ t, pose }]. Bones absent from a key fall back to the idle pose.
   * Returns quaternion tracks for every posed bone plus a hips height track.
   */
  function tracks(keys, { plant = null, hipsOffset = null } = {}) {
    const names = new Set();
    for (const k of keys) for (const n of Object.keys(k.pose)) names.add(n);
    const times = keys.map((k) => k.t);
    const solved = keys.map((k) => solve(k.pose));
    const result = [];
    for (const name of names) {
      const values = [];
      for (const s of solved) {
        const v = s.get(name) ?? base.get(name).local;
        values.push(v.x, v.y, v.z, v.w);
      }
      result.push(new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, values));
    }
    if (plant || hipsOffset) {
      const hp = base.get(BONES.hips).pos;
      const values = [];
      solved.forEach((s, i) => {
        const drop = groundFix(s, plant);
        const extra = hipsOffset ? hipsOffset[i] : 0;
        // hips local Z is world up (armature root rotated -90° about X).
        values.push(hp.x, hp.y, hp.z - drop + extra);
      });
      result.push(new THREE.VectorKeyframeTrack(`${BONES.hips}.position`, times, values));
    }
    return result;
  }

  return { tracks, base };
}

/** Repeat a looping clip's keyframes n times. */
function repeatTracks(clip, n) {
  return clip.tracks.map((track) => {
    const times = [];
    const values = [];
    const stride = track.getValueSize();
    for (let k = 0; k < n; k += 1) {
      for (let i = 0; i < track.times.length; i += 1) {
        if (k > 0 && i === 0) continue;
        times.push(track.times[i] + k * clip.duration);
        for (let c = 0; c < stride; c += 1) values.push(track.values[i * stride + c]);
      }
    }
    const Ctor = track.constructor;
    return new Ctor(track.name, times, values);
  });
}

export function authorFootballClips(lib) {
  const { tracks } = makeAuthor(lib);
  const B = BONES;
  const clips = [];

  // Right-footed instep drive: backswing, contact, follow-through.
  clips.push(
    new THREE.AnimationClip('Kick_Shot', 0.62, tracks(
      [
        { t: 0, pose: { [B.thighR]: [['pitch', 8]], [B.shinR]: [['pitch', 20]] } },
        {
          t: 0.12,
          pose: {
            [B.thighR]: [['pitch', 38]], [B.shinR]: [['pitch', 92]], [B.footR]: [['pitch', 25]],
            [B.thighL]: [['pitch', -14]], [B.shinL]: [['pitch', 22]],
            [B.spine1]: [['pitch', -6], ['yaw', -14]], [B.spine3]: [['yaw', -8]],
            [B.upperArmL]: [['roll', 52], ['pitch', -25]], [B.upperArmR]: [['roll', -30], ['pitch', 30]],
          },
        },
        {
          t: 0.21,
          pose: {
            [B.thighR]: [['pitch', -38]], [B.shinR]: [['pitch', 14]], [B.footR]: [['pitch', 38]],
            [B.thighL]: [['pitch', -10]], [B.shinL]: [['pitch', 18]],
            [B.spine1]: [['pitch', 8], ['yaw', 10]], [B.spine3]: [['pitch', 4], ['yaw', 6]],
            [B.upperArmL]: [['roll', 62], ['pitch', 10]], [B.upperArmR]: [['roll', -40], ['pitch', -20]],
          },
        },
        {
          t: 0.36,
          pose: {
            [B.thighR]: [['pitch', -78]], [B.shinR]: [['pitch', 8]], [B.footR]: [['pitch', 28]],
            [B.thighL]: [['pitch', -6]], [B.shinL]: [['pitch', 12]],
            [B.spine1]: [['pitch', 12], ['yaw', 18]], [B.spine3]: [['pitch', 6], ['yaw', 8]],
            [B.upperArmL]: [['roll', 48], ['pitch', 25]], [B.upperArmR]: [['roll', -46], ['pitch', -38]],
          },
        },
        { t: 0.62, pose: { [B.thighR]: [['pitch', 0]], [B.shinR]: [['pitch', 6]] } },
      ],
      { plant: 'L' },
    )),
  );

  // Side-foot pass: hip opens outward, short controlled swing.
  clips.push(
    new THREE.AnimationClip('Kick_Pass', 0.48, tracks(
      [
        { t: 0, pose: { [B.thighR]: [['pitch', 4]] } },
        {
          t: 0.09,
          pose: {
            [B.thighR]: [['pitch', 24], ['yaw', -38]], [B.shinR]: [['pitch', 46]], [B.footR]: [['yaw', -20]],
            [B.thighL]: [['pitch', -8]], [B.shinL]: [['pitch', 16]],
            [B.spine1]: [['yaw', -10]], [B.upperArmL]: [['roll', 34]], [B.upperArmR]: [['roll', -22]],
          },
        },
        {
          t: 0.16,
          pose: {
            [B.thighR]: [['pitch', -22], ['yaw', -42]], [B.shinR]: [['pitch', 10]], [B.footR]: [['yaw', -24]],
            [B.thighL]: [['pitch', -8]], [B.shinL]: [['pitch', 16]],
            [B.spine1]: [['pitch', 6], ['yaw', 6]], [B.upperArmL]: [['roll', 40]], [B.upperArmR]: [['roll', -26]],
          },
        },
        {
          t: 0.28,
          pose: {
            [B.thighR]: [['pitch', -36], ['yaw', -30]], [B.shinR]: [['pitch', 10]],
            [B.thighL]: [['pitch', -6]], [B.shinL]: [['pitch', 12]],
            [B.spine1]: [['pitch', 6], ['yaw', 8]], [B.upperArmL]: [['roll', 30]], [B.upperArmR]: [['roll', -22]],
          },
        },
        { t: 0.48, pose: { [B.thighR]: [['pitch', 0]] } },
      ],
      { plant: 'L' },
    )),
  );

  // Goalkeeper set position: knees bent, chest forward, hands ready.
  const ready = (breath) => ({
    [B.thighL]: [['pitch', -30], ['roll', -6]], [B.thighR]: [['pitch', -30], ['roll', 6]],
    [B.shinL]: [['pitch', 52]], [B.shinR]: [['pitch', 52]],
    [B.footL]: [['pitch', -18]], [B.footR]: [['pitch', -18]],
    [B.spine1]: [['pitch', 18 + breath]], [B.spine2]: [['pitch', 6]], [B.neck]: [['pitch', -16]],
    [B.upperArmL]: [['pitch', -38], ['roll', 30 + breath]], [B.upperArmR]: [['pitch', -38], ['roll', -30 - breath]],
    [B.forearmL]: [['pitch', -40]], [B.forearmR]: [['pitch', -40]],
  });
  clips.push(
    new THREE.AnimationClip('Keeper_Ready', 1.6, tracks(
      [{ t: 0, pose: ready(0) }, { t: 0.8, pose: ready(3) }, { t: 1.6, pose: ready(0) }],
      { plant: 'both' },
    )),
  );

  // Goalkeeper dive body shape (the game rolls the whole character toward the dive side).
  const stretch = {
    [B.upperArmL]: [['roll', 165]], [B.upperArmR]: [['roll', -165]],
    [B.forearmL]: [['roll', 8]], [B.forearmR]: [['roll', -8]],
    [B.spine1]: [['pitch', -6]], [B.neck]: [['pitch', -10]],
    [B.thighL]: [['pitch', -10]], [B.thighR]: [['pitch', 14]],
    [B.shinL]: [['pitch', 30]], [B.shinR]: [['pitch', 18]],
  };
  clips.push(
    new THREE.AnimationClip('Keeper_Dive', 0.9, tracks([
      { t: 0, pose: ready(0) },
      { t: 0.16, pose: stretch },
      { t: 0.9, pose: stretch },
    ])),
  );

  // Underarm roll-out to distribute the ball.
  clips.push(
    new THREE.AnimationClip('Keeper_Throw', 0.85, tracks(
      [
        { t: 0, pose: ready(0) },
        {
          t: 0.25,
          pose: {
            [B.thighL]: [['pitch', -40]], [B.shinL]: [['pitch', 55]], [B.thighR]: [['pitch', 10]], [B.shinR]: [['pitch', 60]],
            [B.spine1]: [['pitch', 30]], [B.upperArmR]: [['pitch', 70]], [B.upperArmL]: [['pitch', -30], ['roll', 30]],
          },
        },
        {
          t: 0.42,
          pose: {
            [B.thighL]: [['pitch', -45]], [B.shinL]: [['pitch', 60]], [B.thighR]: [['pitch', 15]], [B.shinR]: [['pitch', 62]],
            [B.spine1]: [['pitch', 34]], [B.upperArmR]: [['pitch', -35]], [B.upperArmL]: [['pitch', 10], ['roll', 30]],
          },
        },
        {
          t: 0.6,
          pose: {
            [B.thighL]: [['pitch', -30]], [B.shinL]: [['pitch', 40]], [B.thighR]: [['pitch', 6]], [B.shinR]: [['pitch', 40]],
            [B.spine1]: [['pitch', 22]], [B.upperArmR]: [['pitch', -70]], [B.upperArmL]: [['roll', 25]],
          },
        },
        { t: 0.85, pose: {} },
      ],
      { plant: 'both' },
    )),
  );

  // "Aviãozinho" — the airplane celebration: jogging legs from the jog cycle,
  // arms spread as wings, torso banking side to side.
  const jog = lib.clips.get('Jog_Fwd_Loop');
  const loops = Math.max(2, Math.round(1.8 / jog.duration));
  const dur = jog.duration * loops;
  const upperBones = [B.spine1, B.spine2, B.spine3, B.neck, B.head, B.shoulderL, B.shoulderR, B.upperArmL, B.upperArmR, B.forearmL, B.forearmR, B.handL, B.handR];
  const legTracks = repeatTracks(jog, loops).filter((t) => !upperBones.some((b) => t.name.startsWith(`${b}.`)));
  const wing = (bank) => ({
    [B.upperArmL]: [['roll', 82 + bank * 0.4], ['pitch', 8]],
    [B.upperArmR]: [['roll', -82 + bank * 0.4], ['pitch', 8]],
    [B.forearmL]: [['roll', 4]], [B.forearmR]: [['roll', -4]],
    [B.spine1]: [['roll', bank * 0.6], ['pitch', 6]], [B.spine3]: [['roll', bank * 0.4]],
    [B.neck]: [['roll', -bank * 0.5], ['pitch', -12]],
  });
  const armTracks = tracks([
    { t: 0, pose: wing(-16) },
    { t: dur * 0.25, pose: wing(0) },
    { t: dur * 0.5, pose: wing(16) },
    { t: dur * 0.75, pose: wing(0) },
    { t: dur, pose: wing(-16) },
  ]);
  clips.push(new THREE.AnimationClip('Celebrate_Airplane', dur, [...legTracks, ...armTracks]));

  // Dejected: hands on head (keeper after conceding).
  const dejected = (s) => ({
    [B.upperArmL]: [['roll', 150], ['pitch', -20]], [B.upperArmR]: [['roll', -150], ['pitch', -20]],
    [B.forearmL]: [['pitch', -120 + s]], [B.forearmR]: [['pitch', -120 + s]],
    [B.spine1]: [['pitch', -4 + s * 0.2]], [B.neck]: [['pitch', 10 + s * 0.4]],
  });
  clips.push(
    new THREE.AnimationClip('Dejected', 2.4, tracks([
      { t: 0, pose: dejected(0) }, { t: 1.2, pose: dejected(8) }, { t: 2.4, pose: dejected(0) },
    ])),
  );

  return clips;
}
