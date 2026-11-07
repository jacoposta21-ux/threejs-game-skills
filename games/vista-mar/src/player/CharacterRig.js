import * as THREE from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

// Drives a Quaternius modular character with clips from Quaternius' Universal
// Animation Library (a different skeleton). A hidden "source" mannequin plays the
// clips through an AnimationMixer; every frame each mapped target bone copies the
// source bone's rotation *delta from its reference pose*, expressed in the
// character's root space. That cancels the differing bone-axis conventions of the
// two rigs, as long as both reference poses are a T-pose facing the same way.

const BONE_MAP = {
  'DEF-hips': 'Hips',
  'DEF-spine.001': 'Abdomen',
  'DEF-spine.002': 'Torso',
  'DEF-spine.003': 'Chest',
  'DEF-neck': 'Neck',
  'DEF-head': 'Head',
  'DEF-shoulder.L': 'Shoulder.L',
  'DEF-upper_arm.L': 'UpperArm.L',
  'DEF-forearm.L': 'LowerArm.L',
  'DEF-hand.L': 'Hand.L',
  'DEF-shoulder.R': 'Shoulder.R',
  'DEF-upper_arm.R': 'UpperArm.R',
  'DEF-forearm.R': 'LowerArm.R',
  'DEF-hand.R': 'Hand.R',
  'DEF-thigh.L': 'UpperLeg.L',
  'DEF-shin.L': 'LowerLeg.L',
  'DEF-foot.L': 'Foot.L',
  'DEF-thigh.R': 'UpperLeg.R',
  'DEF-shin.R': 'LowerLeg.R',
  'DEF-foot.R': 'Foot.R',
};

const norm = (n) => n.replace(/[.:]/g, '').toLowerCase();

function findBone(root, name) {
  const want = norm(name);
  let hit = null;
  root.traverse((o) => {
    if (!hit && o.isBone && norm(o.name) === want) hit = o;
  });
  return hit;
}

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _qp = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();

export class CharacterRig {
  /**
   * @param {object} animGltf  UAL gltf (mannequin + clips)
   * @param {object} charGltf  Quaternius modular character gltf
   * @param {number} height    target height in metres
   */
  constructor(animGltf, charGltf, height = 1.8) {
    this.root = new THREE.Group();
    this.root.name = 'CharacterRig';

    // ---------- target (visible) ----------
    this.model = skeletonClone(charGltf.scene);
    this.model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = false;
        o.frustumCulled = false; // skinned bounds don't follow the animation
        if (o.material) {
          o.material = o.material.clone();
          o.material.roughness = Math.max(0.55, o.material.roughness ?? 0.8);
          o.material.metalness = 0;
        }
      }
    });
    this.model.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(this.model);
    const h = bb.max.y - bb.min.y;
    // Quaternius exports are in centimetres under a scaled armature; Box3 on a
    // skinned mesh may read the unskinned geometry, so fall back to head height.
    let scale = h > 0.01 ? height / h : 1;
    this.model.scale.multiplyScalar(scale);
    this.model.updateMatrixWorld(true);
    const bb2 = new THREE.Box3().setFromObject(this.model);
    this.model.position.y -= bb2.min.y;
    this.root.add(this.model);

    // ---------- source (hidden driver) ----------
    this.source = skeletonClone(animGltf.scene);
    this.source.traverse((o) => {
      if (o.isMesh) o.visible = false;
    });
    this.sourceHolder = new THREE.Group(); // never added to the scene
    this.sourceHolder.add(this.source);
    this.mixer = new THREE.AnimationMixer(this.source);
    this.clips = {};
    for (const c of animGltf.animations) this.clips[c.name] = c;

    // ---------- bone pairs ----------
    this.pairs = [];
    for (const [s, t] of Object.entries(BONE_MAP)) {
      const sb = findBone(this.source, s);
      const tb = findBone(this.model, t);
      if (sb && tb) this.pairs.push({ s: sb, t: tb, name: t });
    }
    this.ok = this.pairs.length >= 16;
    this.targetBones = [];
    this.model.traverse((o) => o.isBone && this.targetBones.push(o));
    this.pairByTarget = new Map(this.pairs.map((p) => [p.t, p]));

    // Reference poses: source posed at the T-pose clip, target at bind pose.
    const tpose = this.clips['A_TPose'];
    if (tpose) {
      const a = this.mixer.clipAction(tpose);
      a.play();
      this.mixer.update(0);
      a.stop();
    }
    this.sourceHolder.updateMatrixWorld(true);
    this.model.updateMatrixWorld(true);
    const srcRootInv = new THREE.Quaternion();
    const tgtRootInv = this.model.getWorldQuaternion(new THREE.Quaternion()).invert();
    for (const p of this.pairs) {
      p.sRef = p.s.getWorldQuaternion(new THREE.Quaternion()).premultiply(srcRootInv);
      p.sRefInv = p.sRef.clone().invert();
      p.tRef = p.t.getWorldQuaternion(new THREE.Quaternion()).premultiply(tgtRootInv);
      p.tBindLocal = p.t.quaternion.clone();
    }
    // Facing alignment (yaw) between rigs using shoulder vectors.
    const sL = findBone(this.source, 'DEF-upper_arm.L'), sR = findBone(this.source, 'DEF-upper_arm.R');
    const tL = findBone(this.model, 'UpperArm.L'), tR = findBone(this.model, 'UpperArm.R');
    this.align = new THREE.Quaternion();
    if (sL && sR && tL && tR) {
      const sv = sR.getWorldPosition(new THREE.Vector3()).sub(sL.getWorldPosition(new THREE.Vector3()));
      const tv = tR.getWorldPosition(new THREE.Vector3()).sub(tL.getWorldPosition(new THREE.Vector3()));
      tv.applyQuaternion(tgtRootInv);
      sv.y = 0; tv.y = 0;
      if (sv.lengthSq() > 1e-8 && tv.lengthSq() > 1e-8) this.align.setFromUnitVectors(sv.normalize(), tv.normalize());
    }
    this.alignInv = this.align.clone().invert();

    // Hips translation scaling.
    const sh = findBone(this.source, 'DEF-hips');
    const th = findBone(this.model, 'Hips');
    this.hips = null;
    if (sh && th) {
      const sPos = sh.getWorldPosition(new THREE.Vector3());
      const tPos = th.getWorldPosition(new THREE.Vector3());
      const tRootPos = this.model.getWorldPosition(new THREE.Vector3());
      this.hips = {
        s: sh,
        t: th,
        sRef: sPos.clone(),
        tRefWorldLocal: this.root.worldToLocal(tPos.clone()),
        ratio: (tPos.y - tRootPos.y + 1e-6) / (sPos.y + 1e-6),
      };
    }

    this.actions = {};
    this.current = null;
    this.currentName = '';
  }

  action(name) {
    if (!this.clips[name]) return null;
    if (!this.actions[name]) this.actions[name] = this.mixer.clipAction(this.clips[name]);
    return this.actions[name];
  }

  /** Cross-fades to a clip. once=true plays a single time and holds. */
  play(name, { fade = 0.2, once = false, timeScale = 1 } = {}) {
    const a = this.action(name);
    if (!a) return;
    a.timeScale = timeScale;
    if (this.currentName === name) return;
    a.reset();
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    a.enabled = true;
    a.setEffectiveWeight(1);
    a.play();
    if (this.current) this.current.crossFadeTo(a, fade, false);
    this.current = a;
    this.currentName = name;
  }

  setTimeScale(ts) {
    if (this.current) this.current.timeScale = ts;
  }

  update(dt) {
    this.mixer.update(dt);
    if (!this.ok) return;
    this.sourceHolder.updateMatrixWorld(true);
    this.root.updateMatrixWorld(false);
    const rootWorldQ = this.model.getWorldQuaternion(_qp);
    const rootQ = rootWorldQ.clone();

    // Walk target bones in hierarchy order so parents are final before children.
    for (const bone of this.targetBones) {
      const p = this.pairByTarget.get(bone);
      if (p) {
        // delta in source root space
        p.s.getWorldQuaternion(_q); // source holder has identity transform
        _q.multiply(p.sRefInv); // delta = Ws * Wsref^-1
        // re-express in target root frame
        _q.premultiply(this.align).multiply(this.alignInv);
        // target root-space orientation then world
        _q2.copy(_q).multiply(p.tRef).premultiply(rootQ);
        // local = parentWorld^-1 * world
        bone.parent.getWorldQuaternion(_q).invert();
        bone.quaternion.copy(_q.multiply(_q2));
      }
      bone.updateMatrix();
      bone.matrixWorld.multiplyMatrices(bone.parent.matrixWorld, bone.matrix);
    }

    if (this.hips) {
      const { s, t, sRef, tRefWorldLocal, ratio } = this.hips;
      s.getWorldPosition(_v).sub(sRef).multiplyScalar(ratio).applyQuaternion(this.align);
      // keep horizontal root motion out (clips are in-place); allow bob + crouch
      _v.x *= 0.3; _v.z *= 0.3;
      const world = this.root.localToWorld(_v.add(tRefWorldLocal));
      _m.copy(t.parent.matrixWorld).invert();
      t.position.copy(world.applyMatrix4(_m));
      t.updateMatrix();
      t.updateMatrixWorld(true);
    } else {
      this.model.updateMatrixWorld(true);
    }
  }
}
