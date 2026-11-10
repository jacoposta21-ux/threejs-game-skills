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
  Kick_Volley: { contact: 0.18 },
  Kick_Bicycle: { contact: 0.3 },
  Keeper_Throw: { release: 0.42 },
  Tackle_Poke: { contact: 0.2 },
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

  // Knee slide: dropped onto both knees, back arched, arms thrown up (the slide itself moves the body).
  const knees = (lean, armUp) => ({
    [B.thighL]: [['pitch', 8], ['roll', 10]], [B.shinL]: [['pitch', 96]], [B.footL]: [['pitch', 40]],
    [B.thighR]: [['pitch', 8], ['roll', -10]], [B.shinR]: [['pitch', 96]], [B.footR]: [['pitch', 40]],
    [B.spine1]: [['pitch', -lean]], [B.spine3]: [['pitch', -lean * 0.6]], [B.neck]: [['pitch', -lean * 0.8]],
    [B.upperArmL]: [['roll', armUp], ['pitch', -20]], [B.upperArmR]: [['roll', -armUp], ['pitch', -20]],
    [B.forearmL]: [['roll', 20]], [B.forearmR]: [['roll', -20]],
  });
  clips.push(new THREE.AnimationClip('Celebrate_KneeSlide', 1.2, tracks(
    [
      { t: 0, pose: knees(14, 130) },
      { t: 0.6, pose: knees(22, 150) },
      { t: 1.2, pose: knees(14, 130) },
    ],
    { plant: 'both' },
  )));

  // Fist pump: planted feet, the right arm punches the air on the beat.
  const pump = (up) => ({
    [B.thighL]: [['pitch', -8]], [B.shinL]: [['pitch', 14]], [B.thighR]: [['pitch', -4]], [B.shinR]: [['pitch', 10]],
    [B.spine1]: [['pitch', -6 - up * 6], ['roll', 6]], [B.neck]: [['pitch', -10 - up * 8]],
    [B.upperArmR]: [['roll', -(60 + up * 95)], ['pitch', -15]], [B.forearmR]: [['roll', -(70 - up * 60)]],
    [B.upperArmL]: [['roll', 40], ['pitch', 20]], [B.forearmL]: [['roll', 60]],
  });
  clips.push(new THREE.AnimationClip('Celebrate_FistPump', 0.9, tracks(
    [
      { t: 0, pose: pump(0) },
      { t: 0.18, pose: pump(1) },
      { t: 0.45, pose: pump(0.2) },
      { t: 0.63, pose: pump(1) },
      { t: 0.9, pose: pump(0) },
    ],
    { plant: 'both' },
  )));

  // Knocked over by a slide: knees fold, arms fly out to break the fall (the controller tips the body back).
  clips.push(new THREE.AnimationClip('Fall_Back', 1.3, tracks(
    [
      { t: 0, pose: {} },
      {
        t: 0.18,
        pose: {
          [B.thighL]: [['pitch', -40]], [B.shinL]: [['pitch', 55]], [B.thighR]: [['pitch', -25]], [B.shinR]: [['pitch', 35]],
          [B.spine1]: [['pitch', 22]], [B.neck]: [['pitch', 25]],
          [B.upperArmL]: [['roll', 70], ['pitch', -55]], [B.upperArmR]: [['roll', -70], ['pitch', -55]],
        },
      },
      {
        t: 0.75,
        pose: {
          [B.thighL]: [['pitch', -55]], [B.shinL]: [['pitch', 70]], [B.thighR]: [['pitch', -35]], [B.shinR]: [['pitch', 30]],
          [B.spine1]: [['pitch', 16]], [B.neck]: [['pitch', 20]],
          [B.upperArmL]: [['roll', 55], ['pitch', 40]], [B.upperArmR]: [['roll', -55], ['pitch', 40]],
        },
      },
      { t: 1.3, pose: {} },
    ],
  )));

  // Wrong-footed: the weight goes the wrong way, legs cross, arms flail for balance.
  const stumble = [
    { t: 0, pose: {} },
    {
      t: 0.14,
      pose: {
        [B.thighL]: [['pitch', -18], ['roll', -22]], [B.shinL]: [['pitch', 30]],
        [B.thighR]: [['pitch', 10], ['roll', 18]], [B.shinR]: [['pitch', 22]],
        [B.spine1]: [['roll', -20], ['pitch', 10]], [B.neck]: [['roll', 12]],
        [B.upperArmL]: [['roll', 95], ['pitch', -30]], [B.upperArmR]: [['roll', -30], ['pitch', 40]],
      },
    },
    {
      t: 0.36,
      pose: {
        [B.thighL]: [['pitch', 6], ['roll', -8]], [B.shinL]: [['pitch', 40]],
        [B.thighR]: [['pitch', -30], ['roll', 14]], [B.shinR]: [['pitch', 45]],
        [B.spine1]: [['roll', -12], ['pitch', 16]],
        [B.upperArmL]: [['roll', 70], ['pitch', 30]], [B.upperArmR]: [['roll', -80], ['pitch', -20]],
      },
    },
    { t: 0.7, pose: {} },
  ];
  clips.push(new THREE.AnimationClip('Stumble_R', 0.7, tracks(stumble, { plant: 'both' })));
  clips.push(new THREE.AnimationClip('Stumble_L', 0.7, tracks(stumble.map((k) => ({ t: k.t, pose: mirrorPose(k.pose) })), { plant: 'both' })));

  // Cushioned reception of a hard ball: knees give, arms out, chest over it.
  clips.push(new THREE.AnimationClip('Receive', 0.45, tracks(
    [
      { t: 0, pose: {} },
      {
        t: 0.12,
        pose: {
          [B.thighL]: [['pitch', -16]], [B.shinL]: [['pitch', 30]], [B.thighR]: [['pitch', -22]], [B.shinR]: [['pitch', 34]],
          [B.spine1]: [['pitch', 14]], [B.neck]: [['pitch', 16]],
          [B.upperArmL]: [['roll', 45], ['pitch', 15]], [B.upperArmR]: [['roll', -45], ['pitch', 15]],
        },
      },
      { t: 0.45, pose: {} },
    ],
    { plant: 'both' },
  )));

  // Standing poke tackle: drop the hips, lunge the right leg across into the ball.
  clips.push(
    new THREE.AnimationClip('Tackle_Poke', 0.62, tracks(
      [
        { t: 0, pose: {} },
        {
          t: 0.1,
          pose: {
            [B.thighL]: [['pitch', -35]], [B.shinL]: [['pitch', 60]],
            [B.thighR]: [['pitch', 15]], [B.shinR]: [['pitch', 55]],
            [B.spine1]: [['pitch', 22]], [B.upperArmL]: [['roll', 45]], [B.upperArmR]: [['roll', -45]],
          },
        },
        {
          t: 0.2,
          pose: {
            [B.thighL]: [['pitch', -45]], [B.shinL]: [['pitch', 75]],
            [B.thighR]: [['pitch', -62], ['yaw', -18]], [B.shinR]: [['pitch', 8]], [B.footR]: [['pitch', -25], ['yaw', -25]],
            [B.spine1]: [['pitch', 16], ['roll', -6]], [B.upperArmL]: [['roll', 60], ['pitch', -20]], [B.upperArmR]: [['roll', -55], ['pitch', 25]],
          },
        },
        {
          t: 0.38,
          pose: {
            [B.thighL]: [['pitch', -42]], [B.shinL]: [['pitch', 70]],
            [B.thighR]: [['pitch', -50], ['yaw', -12]], [B.shinR]: [['pitch', 15]],
            [B.spine1]: [['pitch', 18]], [B.upperArmL]: [['roll', 50]], [B.upperArmR]: [['roll', -45]],
          },
        },
        { t: 0.62, pose: {} },
      ],
      { plant: 'L' },
    )),
  );

  // Volley: the hip opens and the right leg swings round at waist height.
  clips.push(
    new THREE.AnimationClip('Kick_Volley', 0.55, tracks(
      [
        { t: 0, pose: {} },
        {
          t: 0.09,
          pose: {
            [B.thighR]: [['pitch', 20], ['roll', -35]], [B.shinR]: [['pitch', 95]],
            [B.thighL]: [['pitch', -8]], [B.shinL]: [['pitch', 18]],
            [B.spine1]: [['roll', 14], ['yaw', -22]], [B.upperArmL]: [['roll', 70], ['pitch', -20]], [B.upperArmR]: [['roll', -45], ['pitch', 30]],
          },
        },
        {
          t: 0.18,
          pose: {
            [B.thighR]: [['pitch', -62], ['roll', -42]], [B.shinR]: [['pitch', 18]], [B.footR]: [['pitch', 30]],
            [B.thighL]: [['pitch', -6]], [B.shinL]: [['pitch', 14]],
            [B.spine1]: [['roll', 20], ['yaw', 12]], [B.upperArmL]: [['roll', 80], ['pitch', 10]], [B.upperArmR]: [['roll', -60], ['pitch', -25]],
          },
        },
        {
          t: 0.32,
          pose: {
            [B.thighR]: [['pitch', -85], ['roll', -10], ['yaw', 20]], [B.shinR]: [['pitch', 22]],
            [B.spine1]: [['roll', 10], ['yaw', 26]], [B.upperArmL]: [['roll', 60], ['pitch', 25]], [B.upperArmR]: [['roll', -50], ['pitch', -35]],
          },
        },
        { t: 0.55, pose: {} },
      ],
      { plant: 'L' },
    )),
  );

  // Bicycle kick: the left knee drives up, then the legs scissor and the right boot strikes overhead.
  // (The backward tip and the jump are applied to the whole body by the controller.)
  clips.push(
    new THREE.AnimationClip('Kick_Bicycle', 0.8, tracks(
      [
        { t: 0, pose: {} },
        {
          t: 0.14,
          pose: {
            [B.thighL]: [['pitch', -95]], [B.shinL]: [['pitch', 85]],
            [B.thighR]: [['pitch', 18]], [B.shinR]: [['pitch', 40]],
            [B.spine1]: [['pitch', -10]], [B.upperArmL]: [['roll', 75], ['pitch', 30]], [B.upperArmR]: [['roll', -75], ['pitch', 30]],
          },
        },
        {
          t: 0.3,
          pose: {
            [B.thighR]: [['pitch', -118]], [B.shinR]: [['pitch', 10]], [B.footR]: [['pitch', 30]],
            [B.thighL]: [['pitch', -20]], [B.shinL]: [['pitch', 70]],
            [B.spine1]: [['pitch', 8]], [B.upperArmL]: [['roll', 85], ['pitch', 50]], [B.upperArmR]: [['roll', -85], ['pitch', 50]],
          },
        },
        {
          t: 0.46,
          pose: {
            [B.thighR]: [['pitch', -70]], [B.shinR]: [['pitch', 40]],
            [B.thighL]: [['pitch', -50]], [B.shinL]: [['pitch', 60]],
            [B.upperArmL]: [['roll', 70], ['pitch', 40]], [B.upperArmR]: [['roll', -70], ['pitch', 40]],
          },
        },
        { t: 0.8, pose: {} },
      ],
      {},
    )),
  );

  // Slide tackle: down on the left hip, right leg extended along the ground into the ball.
  clips.push(
    new THREE.AnimationClip('Tackle_Slide', 0.95, tracks(
      [
        { t: 0, pose: {} },
        {
          t: 0.14,
          pose: {
            [B.thighL]: [['pitch', -70]], [B.shinL]: [['pitch', 120]],
            [B.thighR]: [['pitch', -70]], [B.shinR]: [['pitch', 30]],
            [B.spine1]: [['pitch', -18]], [B.upperArmL]: [['roll', 60], ['pitch', 30]], [B.upperArmR]: [['roll', -60], ['pitch', 30]],
          },
        },
        {
          t: 0.3,
          pose: {
            [B.thighL]: [['pitch', -95]], [B.shinL]: [['pitch', 140]],
            [B.thighR]: [['pitch', -92]], [B.shinR]: [['pitch', 4]], [B.footR]: [['pitch', -20]],
            [B.spine1]: [['pitch', -30], ['roll', 8]], [B.upperArmL]: [['roll', 70], ['pitch', 45]], [B.upperArmR]: [['roll', -55], ['pitch', 20]],
          },
        },
        {
          t: 0.62,
          pose: {
            [B.thighL]: [['pitch', -95]], [B.shinL]: [['pitch', 140]],
            [B.thighR]: [['pitch', -88]], [B.shinR]: [['pitch', 10]],
            [B.spine1]: [['pitch', -24]], [B.upperArmL]: [['roll', 60], ['pitch', 40]], [B.upperArmR]: [['roll', -50], ['pitch', 20]],
          },
        },
        { t: 0.95, pose: {} },
      ],
      { plant: 'L' },
    )),
  );

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

  clips.push(...authorTrickClips(tracks));
  return clips;
}

/**
 * Mirror a pose spec left↔right: swap L/R bones and negate yaw/roll.
 * Trick clips are authored once for the right side and mirrored for the left.
 */
function mirrorPose(pose) {
  const out = {};
  for (const [bone, rots] of Object.entries(pose)) {
    const name = bone.endsWith('_l') ? `${bone.slice(0, -2)}_r` : bone.endsWith('_r') ? `${bone.slice(0, -2)}_l` : bone;
    out[name] = rots.map(([axis, deg]) => [axis, axis === 'pitch' ? deg : -deg]);
  }
  return out;
}

/** Freestyle trick clips ("_R" exits to the player's right, "_L" mirrored). */
function authorTrickClips(tracks) {
  const B = BONES;
  const arms = (l, r, pl = 0, pr = 0) => ({ [B.upperArmL]: [['roll', l], ['pitch', pl]], [B.upperArmR]: [['roll', -r], ['pitch', pr]] });
  const defs = {
    // Step over the ball, strike it backward with the heel.
    Trick_Heel: {
      dur: 0.55,
      plant: 'L',
      keys: [
        [0, {}],
        [0.14, { [B.thighR]: [['pitch', -28]], [B.shinR]: [['pitch', 38]], [B.spine1]: [['pitch', 6]], ...arms(35, 30) }],
        [0.27, { [B.thighR]: [['pitch', 26]], [B.shinR]: [['pitch', 26]], [B.footR]: [['pitch', -12]], [B.spine1]: [['pitch', 14]], ...arms(45, 40, 0, -20) }],
        [0.4, { [B.thighR]: [['pitch', 12]], [B.shinR]: [['pitch', 40]], ...arms(35, 35) }],
        [0.55, {}],
      ],
    },
    // Rainbow: trap the ball between heel and toe, flick it up over the head.
    Trick_Rainbow: {
      dur: 0.75,
      plant: 'R',
      keys: [
        [0, {}],
        [0.16, { [B.thighL]: [['pitch', 18]], [B.shinL]: [['pitch', 95]], [B.footL]: [['pitch', 28]], [B.thighR]: [['pitch', -12]], [B.shinR]: [['pitch', 18]], ...arms(45, 45) }],
        [0.32, { [B.thighL]: [['pitch', 38]], [B.shinL]: [['pitch', 120]], [B.footL]: [['pitch', 40]], [B.spine1]: [['pitch', 10]], ...arms(70, 70, -10, -10) }],
        [0.5, { [B.thighL]: [['pitch', 10]], [B.shinL]: [['pitch', 45]], [B.spine1]: [['pitch', 4]], ...arms(55, 55) }],
        [0.75, {}],
      ],
    },
    // Sombrero: the toe gets under the ball and scoops it up over the defender.
    Trick_Sombrero: {
      dur: 0.6,
      plant: 'L',
      keys: [
        [0, {}],
        [0.12, { [B.thighR]: [['pitch', 6]], [B.shinR]: [['pitch', 60]], [B.footR]: [['pitch', -25]], [B.spine1]: [['pitch', 10]], ...arms(35, 35) }],
        [0.24, { [B.thighR]: [['pitch', -75]], [B.shinR]: [['pitch', 30]], [B.footR]: [['pitch', -35]], [B.spine1]: [['pitch', -12]], [B.neck]: [['pitch', -14]], ...arms(65, 65, 25, 25) }],
        [0.4, { [B.thighR]: [['pitch', -30]], [B.shinR]: [['pitch', 35]], [B.spine1]: [['pitch', -8]], [B.neck]: [['pitch', -18]], ...arms(50, 50) }],
        [0.6, {}],
      ],
    },
    // Full shooting backswing, then the leg checks over the ball and drags it across.
    Trick_FakeShot: {
      dur: 0.62,
      plant: 'L',
      keys: [
        [0, {}],
        [0.14, { [B.thighR]: [['pitch', 38]], [B.shinR]: [['pitch', 92]], [B.footR]: [['pitch', 25]], [B.spine1]: [['pitch', -6], ['yaw', -14]], ...arms(52, 30, -25, 30) }],
        [0.3, { [B.thighR]: [['pitch', -18], ['yaw', 20]], [B.shinR]: [['pitch', 38]], [B.footR]: [['yaw', 25]], [B.spine1]: [['pitch', 8], ['yaw', 6]], ...arms(55, 35) }],
        [0.44, { [B.thighR]: [['pitch', -8], ['roll', -14]], [B.shinR]: [['pitch', 24]], [B.spine1]: [['roll', 8]], ...arms(40, 35) }],
        [0.62, {}],
      ],
    },
  };
  const out = [];
  for (const [name, def] of Object.entries(defs)) {
    for (const side of ['R', 'L']) {
      const keys = def.keys.map(([t, pose]) => ({ t, pose: side === 'R' ? pose : mirrorPose(pose) }));
      const plant = def.plant === 'both' || !def.plant ? def.plant : side === 'R' ? def.plant : def.plant === 'L' ? 'R' : 'L';
      out.push(new THREE.AnimationClip(`${name}_${side}`, def.dur, tracks(keys, { plant })));
    }
  }
  return out;
}
