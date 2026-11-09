import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { authorFootballClips } from './FootballClips.js';
import { createKitMaterial, REGION } from './KitMaterial.js';
import { createHair } from './Hair.js';

// Bone names after GLTFLoader sanitisation ("DEF-thigh.L" -> "DEF-thighL").
export const BONES = {
  root: 'root',
  hips: 'DEF-hips',
  spine1: 'DEF-spine001',
  spine2: 'DEF-spine002',
  spine3: 'DEF-spine003',
  neck: 'DEF-neck',
  head: 'DEF-head',
  shoulderL: 'DEF-shoulderL',
  shoulderR: 'DEF-shoulderR',
  upperArmL: 'DEF-upper_armL',
  upperArmR: 'DEF-upper_armR',
  forearmL: 'DEF-forearmL',
  forearmR: 'DEF-forearmR',
  handL: 'DEF-handL',
  handR: 'DEF-handR',
  thighL: 'DEF-thighL',
  thighR: 'DEF-thighR',
  shinL: 'DEF-shinL',
  shinR: 'DEF-shinR',
  footL: 'DEF-footL',
  footR: 'DEF-footR',
  toeL: 'DEF-toeL',
  toeR: 'DEF-toeR',
};

const LOCOMOTION = ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop'];

/**
 * Loads the shared CC0 character (Quaternius Universal Animation Library
 * mannequin), prepares a single-draw-call skinned mesh with kit regions, and
 * owns every AnimationClip (imported + authored). Characters are cheap clones.
 */
export class CharacterLibrary {
  static async load(url, onProgress) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(url, (e) => {
      if (e.total) onProgress?.(e.loaded / e.total);
    });
    return new CharacterLibrary(gltf);
  }

  constructor(gltf) {
    this.template = gltf.scene;
    this.template.updateMatrixWorld(true);
    this.clips = new Map();
    for (const clip of gltf.animations) this.clips.set(clip.name, clip);

    this.prepareMesh();
    this.stripRootMotion();
    this.measureLocomotion();
    for (const clip of authorFootballClips(this)) this.clips.set(clip.name, clip);
  }

  prepareMesh() {
    const skinned = [];
    this.template.traverse((o) => {
      if (o.isSkinnedMesh) skinned.push(o);
    });
    const primary = skinned[0];
    const geometries = skinned.map((m) => {
      const g = m.geometry.clone();
      for (const name of Object.keys(g.attributes)) {
        if (!['position', 'normal', 'skinIndex', 'skinWeight'].includes(name)) g.deleteAttribute(name);
      }
      return g;
    });
    const merged = geometries.length > 1 ? mergeGeometries(geometries, false) : geometries[0];
    for (const m of skinned.slice(1)) m.removeFromParent();
    primary.geometry = merged;
    primary.name = 'footballerBody';
    this.mesh = primary;
    this.skeleton = primary.skeleton;

    merged.computeBoundingBox();
    this.bounds = merged.boundingBox.clone();
    this.classifyRegions(merged);
  }

  /** Bind-pose transform of a joint in geometry space. */
  bindMatrix(name) {
    const i = this.skeleton.bones.findIndex((b) => b.name === name);
    if (i < 0) throw new Error(`Missing bone ${name}`);
    return this.skeleton.boneInverses[i].clone().invert();
  }

  bindPoint(name) {
    return new THREE.Vector3().setFromMatrixPosition(this.bindMatrix(name));
  }

  classifyRegions(geometry) {
    const pos = geometry.attributes.position;
    const idx = geometry.attributes.skinIndex;
    const wgt = geometry.attributes.skinWeight;
    const bones = this.skeleton.bones.map((b) => b.name);
    const count = pos.count;
    const region = new Float32Array(count);
    const minY = this.bounds.min.y;
    const height = this.bounds.max.y - minY;

    const seg = (a, b) => [this.bindPoint(a), this.bindPoint(b)];
    const segT = (p, [a, b]) => {
      const ab = b.clone().sub(a);
      return p.clone().sub(a).dot(ab) / ab.lengthSq();
    };
    const arms = { L: seg(BONES.upperArmL, BONES.forearmL), R: seg(BONES.upperArmR, BONES.forearmR) };
    const thighs = { L: seg(BONES.thighL, BONES.shinL), R: seg(BONES.thighR, BONES.shinR) };
    const shins = { L: seg(BONES.shinL, BONES.footL), R: seg(BONES.shinR, BONES.footR) };
    const neckY = this.bindPoint(BONES.neck).y;

    const headMin = new THREE.Vector3(Infinity, Infinity, Infinity);
    const headMax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    const p = new THREE.Vector3();
    for (let v = 0; v < count; v += 1) {
      p.fromBufferAttribute(pos, v);
      let best = 0;
      let bestW = -1;
      for (let k = 0; k < 4; k += 1) {
        const w = wgt.getComponent(v, k);
        if (w > bestW) {
          bestW = w;
          best = idx.getComponent(v, k);
        }
      }
      const name = bones[best] || '';
      const side = name.endsWith('L') ? 'L' : 'R';
      const h = (p.y - minY) / height;
      let r = REGION.SKIN;
      if (name.includes('head') || name.includes('neck')) {
        r = p.y < neckY - 0.012 * height ? REGION.JERSEY : REGION.SKIN;
        if (name.includes('head')) {
          headMin.min(p);
          headMax.max(p);
        }
      } else if (name.includes('spine') || name.includes('shoulder')) {
        r = REGION.JERSEY;
      } else if (name.includes('hips')) {
        r = h > 0.565 ? REGION.JERSEY : REGION.SHORTS;
      } else if (name.includes('upper_arm')) {
        r = segT(p, arms[side]) < 0.5 ? REGION.JERSEY : REGION.SKIN;
      } else if (name.includes('thigh')) {
        r = segT(p, thighs[side]) < 0.5 ? REGION.SHORTS : REGION.SKIN;
      } else if (name.includes('shin')) {
        r = segT(p, shins[side]) < 0.22 ? REGION.SKIN : REGION.SOCKS;
      } else if (name.includes('foot') || name.includes('toe')) {
        r = h < 0.018 ? REGION.SOLE : REGION.SHOES;
      }
      region[v] = r;
    }
    geometry.setAttribute('aRegion', new THREE.BufferAttribute(region, 1));
    this.head = {
      center: headMin.clone().add(headMax).multiplyScalar(0.5),
      size: headMax.clone().sub(headMin),
    };
    this.kitFrame = {
      minY,
      height,
      neckY,
      hipY: this.bindPoint(BONES.hips).y,
      depthCenter: (this.bounds.min.z + this.bounds.max.z) * 0.5,
    };
  }

  /** In-place loops: remove horizontal drift of the root / hips so the game owns translation. */
  stripRootMotion() {
    for (const clip of this.clips.values()) {
      for (const track of clip.tracks) {
        if (!track.name.endsWith('.position')) continue;
        const bone = track.name.split('.')[0];
        if (bone !== BONES.root && bone !== BONES.hips) continue;
        const v = track.values;
        const n = v.length / 3;
        // `root` moves in the un-rotated rig space (horizontal = X, Z). `hips`
        // moves inside root, which is rotated -90° about X: local X = world X,
        // local Y = world -Z, local Z = world up.
        const x0 = v[0];
        const y0 = v[1];
        const z0 = v[2];
        const x1 = v[(n - 1) * 3];
        const y1 = v[(n - 1) * 3 + 1];
        for (let i = 0; i < n; i += 1) {
          const t = n > 1 ? i / (n - 1) : 0;
          if (bone === BONES.root) {
            v[i * 3] = x0;
            v[i * 3 + 2] = z0;
          } else {
            v[i * 3] -= (x1 - x0) * t;
            v[i * 3 + 1] -= (y1 - y0) * t;
          }
        }
      }
    }
  }

  /** A posable scratch rig used for measuring and authoring clips. */
  scratchRig() {
    if (!this._scratch) {
      const root = SkeletonUtils.clone(this.template);
      const bones = new Map();
      root.traverse((o) => {
        if (o.isBone) bones.set(o.name, o);
      });
      this._scratch = { root, bones, mixer: new THREE.AnimationMixer(root) };
    }
    return this._scratch;
  }

  /** Pose the scratch rig at time t of a clip and refresh world matrices. */
  poseScratch(clipName, t) {
    const rig = this.scratchRig();
    rig.mixer.stopAllAction();
    const action = rig.mixer.clipAction(this.clips.get(clipName));
    action.reset().play();
    action.time = t;
    rig.mixer.update(0);
    rig.root.updateMatrixWorld(true);
    return rig;
  }

  /**
   * Natural ground speed of each locomotion clip, measured from stance-foot
   * velocity. Playback rate = game speed / natural speed keeps feet planted.
   * Also records the phase where the left foot is furthest forward so blended
   * clips stay foot-synchronised.
   */
  measureLocomotion() {
    this.locomotion = {};
    const samples = 64;
    const p = new THREE.Vector3();
    for (const name of LOCOMOTION) {
      const clip = this.clips.get(name);
      const frames = [];
      for (let i = 0; i <= samples; i += 1) {
        const t = (clip.duration * i) / samples;
        const rig = this.poseScratch(name, t);
        const lf = rig.bones.get(BONES.footL).getWorldPosition(p).clone();
        const rf = rig.bones.get(BONES.footR).getWorldPosition(p).clone();
        frames.push({ t, lf, rf });
      }
      let minY = Infinity;
      for (const f of frames) minY = Math.min(minY, f.lf.y, f.rf.y);
      const speeds = [];
      for (let i = 1; i < frames.length; i += 1) {
        const a = frames[i - 1];
        const b = frames[i];
        const dt = b.t - a.t;
        for (const k of ['lf', 'rf']) {
          if (a[k].y < minY + 0.035 && b[k].y < minY + 0.035) speeds.push((a[k].z - b[k].z) / dt);
        }
      }
      speeds.sort((a, b) => a - b);
      const natural = speeds.length ? Math.max(0, speeds[Math.floor(speeds.length / 2)]) : 0;
      let phase = 0;
      let bestZ = -Infinity;
      for (const f of frames) {
        if (f.lf.z > bestZ) {
          bestZ = f.lf.z;
          phase = f.t / clip.duration;
        }
      }
      this.locomotion[name] = { natural, duration: clip.duration, phase };
    }
    // Idle has no stride; guard against a measured near-zero walk.
    this.locomotion.Idle_Loop.natural = 0;
    this.locomotion.Walk_Loop.natural = Math.max(this.locomotion.Walk_Loop.natural, 0.9);
    this.locomotion.Jog_Fwd_Loop.natural = Math.max(this.locomotion.Jog_Fwd_Loop.natural, 2.4);
    this.locomotion.Sprint_Loop.natural = Math.max(this.locomotion.Sprint_Loop.natural, 4.5);
  }

  /**
   * Create a dressed character instance.
   * look: { team, skin, hair, hairColor, number, headband }
   */
  createCharacter(look) {
    const root = SkeletonUtils.clone(this.template);
    const bones = new Map();
    let mesh = null;
    root.traverse((o) => {
      if (o.isBone) bones.set(o.name, o);
      if (o.isSkinnedMesh) mesh = o;
    });
    mesh.material = createKitMaterial(this, look);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;

    const head = bones.get(BONES.head);
    const headIndex = this.skeleton.bones.findIndex((b) => b.name === BONES.head);
    const hair = createHair(look, this.head, this.skeleton.boneInverses[headIndex]);
    if (hair) head.add(hair);

    const holder = new THREE.Group();
    holder.add(root);
    // Scale the mannequin to the requested height (bind pose is ~1.76 m).
    const s = (look.height ?? 1.78) / 1.76;
    root.scale.setScalar(s);
    return { holder, root, mesh, bones, material: mesh.material, hair };
  }
}
