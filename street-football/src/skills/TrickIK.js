import * as THREE from 'three';

/**
 * Foot-driven skill moves.
 *
 * A trick is described by where each foot goes, not by body poses:
 *   - a foot is either planted (locked to a spot on the ground in world space,
 *     so it never skates while the body moves over it) or travelling along a
 *     smooth arc to its next spot;
 *   - spots are given in the body's frame (s = toward the exit side,
 *     f = forward, y = height of the sole) or around the ball ('ball'), so
 *     the working foot really goes over, around or onto the ball;
 *   - the legs are solved with two-bone IK each rendered frame, the pelvis
 *     sways, drops to keep both feet in reach, and the trunk leans and twists.
 * The upper body keeps the locomotion clips underneath (arms, head).
 *
 * Key: [u, space, s, f, y, arc?]  space: 'body' | 'ball' | 'hold'
 */

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _t = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _knee = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const _iq = new THREE.Quaternion();
const _fq = new THREE.Quaternion();
const _fwd = new THREE.Vector3();
const _e = new THREE.Vector3();
const _hip = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

const smooth = (x) => {
  const k = THREE.MathUtils.clamp(x, 0, 1);
  return k * k * (3 - 2 * k);
};

/** Piecewise-smooth scalar track [[u, value], ...]; 0 before the first and after the last key. */
function track(keys, u) {
  if (!keys || !keys.length) return 0;
  let pu = 0;
  let pv = 0;
  for (const [ku, kv] of keys) {
    if (u < ku) return pv + (kv - pv) * smooth((u - pu) / (ku - pu));
    pu = ku;
    pv = kv;
  }
  return pv * (1 - smooth((u - pu) / Math.max(1e-3, 1 - pu)));
}

export class TrickIK {
  constructor(footballer) {
    this.fb = footballer;
    const bones = footballer.character.bones;
    this.pelvis = bones.get('pelvis');
    this.spine = bones.get('spine_01');
    this.legs = {};
    footballer.holder.updateMatrixWorld(true);
    for (const side of ['l', 'r']) {
      const thigh = bones.get(`thigh_${side}`);
      const calf = bones.get(`calf_${side}`);
      const foot = bones.get(`foot_${side}`);
      const hip = thigh.getWorldPosition(new THREE.Vector3());
      const knee = calf.getWorldPosition(new THREE.Vector3());
      const ankle = foot.getWorldPosition(new THREE.Vector3());
      this.legs[side] = {
        thigh, calf, foot,
        l1: hip.distanceTo(knee),
        l2: knee.distanceTo(ankle),
        ankleY: ankle.y - footballer.holder.position.y,
        // Foot orientation when standing, relative to the body's yaw.
        rest: footballer.holder.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(foot.getWorldQuaternion(new THREE.Quaternion())),
        start: new THREE.Vector3(),
        idx: 0,
      };
    }
    this.pelvisDelta = new THREE.Vector3();
    this.active = null;
  }

  /** Undo last frame's pelvis offset before the mixer runs (clips may not rewrite it). */
  restore() {
    if (this.pelvisDelta.lengthSq() > 0) {
      this.pelvis.position.sub(this.pelvisDelta);
      this.pelvisDelta.set(0, 0, 0);
    }
  }

  begin(anim) {
    this.active = anim;
    this.fb.holder.updateMatrixWorld(true);
    for (const side of ['l', 'r']) {
      const leg = this.legs[side];
      leg.foot.getWorldPosition(leg.start);
      leg.start.y = Math.max(0, leg.start.y - leg.ankleY);
      leg.idx = 0;
    }
  }

  /** World position of a key spot (sole on the ground reference). */
  resolve(key, origin, ball, out) {
    const o = key[1] === 'ball' ? ball : origin;
    return out.set(o.x, 0, o.z).addScaledVector(_e, key[2]).addScaledVector(_fwd, key[3]).setY(key[4] ?? 0);
  }

  footTarget(leg, keys, u, origin, ball, out) {
    while (leg.idx < keys.length && u >= keys[leg.idx][0]) {
      const k = keys[leg.idx];
      if (k[1] !== 'hold') this.resolve(k, origin, ball, leg.start);
      leg.idx += 1;
    }
    if (leg.idx >= keys.length) return out.copy(leg.start);
    const k = keys[leg.idx];
    if (k[1] === 'hold') return out.copy(leg.start);
    const u0 = leg.idx > 0 ? keys[leg.idx - 1][0] : 0;
    const t = smooth((u - u0) / Math.max(1e-3, k[0] - u0));
    this.resolve(k, origin, ball, _t);
    out.lerpVectors(leg.start, _t, t);
    // Steps between two spots on the ground lift the foot; keys can set their own arc.
    const arc = k[5] ?? (leg.start.y < 0.03 && _t.y < 0.03 ? 0.07 : 0);
    out.y += arc * Math.sin(Math.PI * t);
    return out;
  }

  /** Rotate `bone` so the world direction `from` becomes `to`. */
  aim(bone, from, to) {
    _q.setFromUnitVectors(from, to);
    bone.parent.getWorldQuaternion(_pq);
    _q.premultiply(_iq.copy(_pq).invert()).multiply(_pq);
    bone.quaternion.premultiply(_q);
    bone.updateWorldMatrix(false, true);
  }

  solveLeg(leg, target, w, yawQ) {
    leg.thigh.getWorldPosition(_a);
    leg.calf.getWorldPosition(_b);
    leg.foot.getWorldPosition(_c);
    // Blend from where the clip has the ankle to where the trick wants it.
    _t.copy(_c).lerp(target, w);
    _dir.copy(_t).sub(_a);
    const reach = leg.l1 + leg.l2 - 0.004;
    const d = THREE.MathUtils.clamp(_dir.length(), 0.08, reach);
    _dir.normalize();
    // Knee bends forward, a little toward where the foot is.
    _pole.copy(_fwd).multiplyScalar(1).addScaledVector(UP, 0.25);
    _pole.addScaledVector(_dir, -_pole.dot(_dir)).normalize();
    const cos0 = THREE.MathUtils.clamp((leg.l1 * leg.l1 + d * d - leg.l2 * leg.l2) / (2 * leg.l1 * d), -1, 1);
    _knee.copy(_a).addScaledVector(_dir, leg.l1 * cos0).addScaledVector(_pole, leg.l1 * Math.sqrt(1 - cos0 * cos0));
    this.aim(leg.thigh, _v1.copy(_b).sub(_a).normalize(), _v2.copy(_knee).sub(_a).normalize());
    leg.calf.getWorldPosition(_b);
    leg.foot.getWorldPosition(_c);
    _v2.copy(_a).addScaledVector(_dir, d).sub(_b).normalize();
    this.aim(leg.calf, _v1.copy(_c).sub(_b).normalize(), _v2);
    // Foot flat and pointing with the body (blended from the clip).
    _fq.copy(yawQ).multiply(leg.rest);
    leg.foot.parent.getWorldQuaternion(_pq);
    _fq.premultiply(_pq.invert());
    leg.foot.quaternion.slerp(_fq, w);
  }

  /** Apply the active trick to this frame's pose. heading: interpolated body yaw (with spin). */
  apply(heading, ballPos) {
    const anim = this.active;
    if (!anim) return;
    const ik = anim.def.ik;
    const u = anim.u;
    const fb = this.fb;
    const side = anim.side;
    _fwd.set(Math.sin(heading), 0, Math.cos(heading));
    // Exit side +1 is the player's right (negative yaw).
    _e.set(-_fwd.z, 0, _fwd.x).multiplyScalar(side);
    // Ease in from the run and back out to it.
    const w = Math.min(smooth(u / 0.1), 1 - smooth((u - 0.86) / 0.14));
    const origin = fb.holder.position;

    // Pelvis: sway toward the working side and sink into the move.
    const sway = track(ik.sway, u);
    const crouch = (ik.crouch ?? 0.05) * Math.sin(Math.PI * Math.min(1, u * 1.1)) + track(ik.dip, u);
    this.pelvisDelta.set(0, 0, 0);
    fb.holder.updateMatrixWorld(true);
    const outSide = side > 0 ? 'r' : 'l';
    const inSide = side > 0 ? 'l' : 'r';
    const targets = { [outSide]: new THREE.Vector3(), [inSide]: new THREE.Vector3() };
    this.footTarget(this.legs[outSide], ik.out, u, origin, ballPos, targets[outSide]);
    this.footTarget(this.legs[inSide], ik.in, u, origin, ballPos, targets[inSide]);
    for (const s of ['l', 'r']) targets[s].y += this.legs[s].ankleY + origin.y;

    _hip.copy(_e).multiplyScalar(sway * w).addScaledVector(UP, -crouch * w);
    // Drop further if a planted foot would be out of reach.
    let drop = 0;
    for (const s of ['l', 'r']) {
      const leg = this.legs[s];
      leg.thigh.getWorldPosition(_a).add(_hip);
      const horiz = Math.hypot(targets[s].x - _a.x, targets[s].z - _a.z);
      const max = (leg.l1 + leg.l2) * 0.985;
      if (horiz < max) {
        const need = _a.y - targets[s].y - Math.sqrt(max * max - horiz * horiz);
        if (need > drop) drop = need;
      } else drop = Math.max(drop, 0.25);
    }
    // Sink only so far: beyond that a planted foot drags along instead of forcing a split.
    const MAX_DROP = 0.13;
    _hip.y -= Math.min(MAX_DROP, drop) * w;
    if (drop > MAX_DROP) {
      for (const s of ['l', 'r']) {
        const leg = this.legs[s];
        leg.thigh.getWorldPosition(_a).add(_hip);
        const max = (leg.l1 + leg.l2) * 0.985;
        const dy = _a.y - targets[s].y;
        const reach = Math.sqrt(Math.max(0.01, max * max - dy * dy));
        const dx = targets[s].x - _a.x;
        const dz = targets[s].z - _a.z;
        const horiz = Math.hypot(dx, dz);
        if (horiz > reach) {
          const k = reach / horiz;
          targets[s].x = _a.x + dx * k;
          targets[s].z = _a.z + dz * k;
          // The plant spot itself moves, so the foot does not snap back later.
          leg.start.x = targets[s].x;
          leg.start.z = targets[s].z;
        }
      }
    }
    // World offset → the pelvis's parent space.
    this.pelvis.parent.getWorldQuaternion(_pq);
    this.pelvisDelta.copy(_hip).applyQuaternion(_iq.copy(_pq).invert());
    this.pelvisDelta.divide(this.pelvis.parent.getWorldScale(_v1));
    this.pelvis.position.add(this.pelvisDelta);
    this.pelvis.updateWorldMatrix(false, true);

    // Trunk: lean over the plant foot, shoulders turn against the hips.
    const lean = THREE.MathUtils.degToRad(track(ik.lean, u)) * w;
    const twist = THREE.MathUtils.degToRad(track(ik.twist, u)) * w;
    const pitch = THREE.MathUtils.degToRad(track(ik.pitch, u) + 6) * w;
    if (this.spine) {
      this.spine.parent.getWorldQuaternion(_pq);
      _iq.copy(_pq).invert();
      // Lean toward the exit side is a roll about the forward axis.
      _q.setFromAxisAngle(_fwd, lean * side).premultiply(_fq.setFromAxisAngle(UP, -twist * side));
      _q.multiply(_fq.setFromAxisAngle(_v1.set(_fwd.z, 0, -_fwd.x), pitch));
      _q.premultiply(_iq).multiply(_pq);
      this.spine.quaternion.premultiply(_q);
      this.spine.updateWorldMatrix(false, true);
    }

    const yawQ = _fq.clone().setFromAxisAngle(UP, heading);
    for (const s of ['l', 'r']) this.solveLeg(this.legs[s], targets[s], w, yawQ);
  }
}
