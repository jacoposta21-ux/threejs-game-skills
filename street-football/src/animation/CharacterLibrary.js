import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { authorFootballClips } from './FootballClips.js';
import { createKitMaterial, REGION } from './KitMaterial.js';
import { createHair } from './Hair.js';

// Bone names of the Quaternius Universal (UE-style) skeleton shared by the
// base characters, the hairstyles and the Universal Animation Library.
export const BONES = {
  root: 'root',
  hips: 'pelvis',
  spine1: 'spine_01',
  spine2: 'spine_02',
  spine3: 'spine_03',
  neck: 'neck_01',
  head: 'Head',
  shoulderL: 'clavicle_l',
  shoulderR: 'clavicle_r',
  upperArmL: 'upperarm_l',
  upperArmR: 'upperarm_r',
  forearmL: 'lowerarm_l',
  forearmR: 'lowerarm_r',
  handL: 'hand_l',
  handR: 'hand_r',
  thighL: 'thigh_l',
  thighR: 'thigh_r',
  shinL: 'calf_l',
  shinR: 'calf_r',
  footL: 'foot_l',
  footR: 'foot_r',
  toeL: 'ball_l',
  toeR: 'ball_r',
};

/** Quaternius rigged hairstyles available in hair.glb, by look name. */
const QUATERNIUS_HAIR = {
  buzz: 'Hair_Buzzed',
  parted: 'Hair_SimpleParted',
  long: 'Hair_Long',
  buns: 'Hair_Buns',
};

const LOCOMOTION = ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop'];

/** Skinned mesh rigidly bound to the head → float geometry in head-bone local space. */
function toHeadLocal(o) {
  const headIdx = o.skeleton.bones.findIndex((b) => b.name === BONES.head);
  const geo = new THREE.BufferGeometry();
  for (const a of ['position', 'normal', 'uv']) {
    const src = o.geometry.attributes[a];
    if (!src) continue;
    const out = new Float32Array(src.count * src.itemSize);
    for (let i = 0; i < src.count; i += 1) {
      for (let c = 0; c < src.itemSize; c += 1) out[i * src.itemSize + c] = src.getComponent(i, c);
    }
    geo.setAttribute(a, new THREE.BufferAttribute(out, src.itemSize));
  }
  if (o.geometry.index) geo.setIndex(o.geometry.index.clone());
  geo.applyMatrix4(o.bindMatrix);
  geo.applyMatrix4(o.skeleton.boneInverses[headIdx]);
  return geo;
}

function side(name) {
  return name.endsWith('_l') ? 'L' : 'R';
}

/**
 * Loads the CC0 Quaternius characters (male / female base bodies with painted
 * faces, eyes and normal maps), rigged hairstyles and the Universal Animation
 * Library clips; prepares kit regions for the shared kit shader and owns
 * every AnimationClip (imported + authored). Characters are cheap clones.
 */
export class CharacterLibrary {
  /** urls: { male, female, hair, anims } (hashed asset URLs from the bundler). */
  static async load(urls, onProgress) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const files = [urls.male, urls.female, urls.hair, urls.anims];
    const progress = new Array(files.length).fill(0);
    const [male, female, hair, anims] = await Promise.all(
      files.map((f, i) =>
        loader.loadAsync(f, (e) => {
          if (e.total) {
            progress[i] = e.loaded / e.total;
            onProgress?.(progress.reduce((a, b) => a + b, 0) / files.length);
          }
        }),
      ),
    );
    return new CharacterLibrary({ male, female, hair, anims });
  }

  constructor({ male, female, hair, anims }) {
    this.clips = new Map();
    for (const clip of anims.animations) this.clips.set(clip.name, clip);
    this.shareTextures([male.scene, female.scene, hair.scene]);
    this.bodies = { male: this.prepareBody(male.scene), female: this.prepareBody(female.scene) };
    // Measuring and authoring use the male template.
    Object.assign(this, this.bodies.male);
    this.prepareHair(hair.scene);
    this.stripRootMotion();
    this.measureLocomotion();
    for (const clip of authorFootballClips(this)) this.clips.set(clip.name, clip);
  }

  /**
   * The source files repeat textures (eye and hair maps in every file): keep one
   * texture per image name, and drop normal maps on eyes and hair — invisible at
   * gameplay distance but each one is another GPU texture.
   */
  shareTextures(scenes) {
    const byName = new Map();
    const key = (t) => (t.name || t.source?.data?.src || t.uuid).replace(/\.(png|jpe?g)$/i, '').replace(/_png$/, '');
    for (const scene of scenes) {
      scene.traverse((o) => {
        if (!o.material) return;
        const m = o.material;
        if (/hair|eye/i.test(m.name)) m.normalMap = null;
        for (const slot of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) {
          const t = m[slot];
          if (!t) continue;
          const k = `${slot}:${key(t)}`;
          if (byName.has(k)) m[slot] = byName.get(k);
          else byName.set(k, t);
        }
        m.needsUpdate = true;
      });
    }
  }

  prepareBody(scene) {
    scene.updateMatrixWorld(true);
    let body = null;
    const extras = [];
    scene.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      if (/superhero/i.test(o.material.name) || /superhero/i.test(o.name)) body = o;
      else extras.push(o);
    });
    const geometry = body.geometry;
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox.clone();
    const ctx = { template: scene, mesh: body, skeleton: body.skeleton, bounds, extras, baseMaterial: body.material };
    this.classifyRegions(ctx);
    // World-space height of the bind pose (armature scale included).
    const box = new THREE.Box3().setFromObject(scene, true);
    ctx.templateHeight = box.max.y - box.min.y;
    // Eyes and brows only follow the head: make them rigid head props (no extra
    // skeletons per character — each skeleton costs a bone texture and CPU skinning).
    ctx.headProps = extras.map((e) => ({
      geometry: toHeadLocal(e),
      material: e.material,
      isBrow: /hair|brow/i.test(e.material.name) || /brow/i.test(e.name),
    }));
    for (const e of extras) e.removeFromParent();
    ctx.extras = [];
    return ctx;
  }

  /** Bind-pose transform of a joint in a body's geometry space. */
  bindMatrix(name, ctx = this) {
    const i = ctx.skeleton.bones.findIndex((b) => b.name === name);
    if (i < 0) throw new Error(`Missing bone ${name}`);
    return ctx.skeleton.boneInverses[i].clone().invert();
  }

  bindPoint(name, ctx = this) {
    return new THREE.Vector3().setFromMatrixPosition(this.bindMatrix(name, ctx));
  }

  classifyRegions(ctx) {
    const geometry = ctx.mesh.geometry;
    const pos = geometry.attributes.position;
    const idx = geometry.attributes.skinIndex;
    const wgt = geometry.attributes.skinWeight;
    const bones = ctx.skeleton.bones.map((b) => b.name);
    const count = pos.count;
    const region = new Float32Array(count);
    const minY = ctx.bounds.min.y;
    const height = ctx.bounds.max.y - minY;
    const bp = (n) => this.bindPoint(n, ctx);
    const seg = (a, b) => [bp(a), bp(b)];
    const segT = (p, [a, b]) => {
      const ab = b.clone().sub(a);
      return p.clone().sub(a).dot(ab) / ab.lengthSq();
    };
    const arms = { L: seg(BONES.upperArmL, BONES.forearmL), R: seg(BONES.upperArmR, BONES.forearmR) };
    const thighs = { L: seg(BONES.thighL, BONES.shinL), R: seg(BONES.thighR, BONES.shinR) };
    const shins = { L: seg(BONES.shinL, BONES.footL), R: seg(BONES.shinR, BONES.footR) };
    const neckY = bp(BONES.neck).y;
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
      const s = side(name);
      const h = (p.y - minY) / height;
      let r = REGION.SKIN;
      if (name === BONES.head || name === BONES.neck) {
        r = p.y < neckY - 0.012 * height ? REGION.JERSEY : REGION.SKIN;
        if (name === BONES.head) {
          headMin.min(p);
          headMax.max(p);
        }
      } else if (name.startsWith('spine') || name.startsWith('clavicle')) {
        r = REGION.JERSEY;
      } else if (name === BONES.hips) {
        r = h > 0.565 ? REGION.JERSEY : REGION.SHORTS;
      } else if (name.startsWith('upperarm')) {
        r = segT(p, arms[s]) < 0.5 ? REGION.JERSEY : REGION.SKIN;
      } else if (name.startsWith('thigh')) {
        r = segT(p, thighs[s]) < 0.55 ? REGION.SHORTS : REGION.SKIN;
      } else if (name.startsWith('calf')) {
        r = segT(p, shins[s]) < 0.22 ? REGION.SKIN : REGION.SOCKS;
      } else if (name.startsWith('foot') || name.startsWith('ball')) {
        r = h < 0.014 ? REGION.SOLE : REGION.SHOES;
      }
      region[v] = r;
    }
    geometry.setAttribute('aRegion', new THREE.BufferAttribute(region, 1));
    ctx.head = { center: headMin.clone().add(headMax).multiplyScalar(0.5), size: headMax.clone().sub(headMin) };
    // Geometry units per metre: the bind pose is a ~1.8 m adult.
    ctx.kitFrame = {
      minY,
      height,
      neckY,
      hipY: bp(BONES.hips).y,
      centerX: (ctx.bounds.min.x + ctx.bounds.max.x) * 0.5,
      unitsPerMeter: height / 1.8,
    };
  }

  /** Rigid hair meshes: each hairstyle moved into the head bone's local space. */
  prepareHair(scene) {
    scene.updateMatrixWorld(true);
    this.hairGeometries = new Map();
    scene.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      const name = o.name.replace(/_\d+$/, '');
      const headIdx = o.skeleton.bones.findIndex((b) => b.name === BONES.head);
      void headIdx;
      this.hairGeometries.set(name, { geometry: toHeadLocal(o), material: o.material });
    });
  }

  /** In-place loops: remove horizontal drift of the root / pelvis so the game owns translation. */
  stripRootMotion() {
    for (const clip of this.clips.values()) {
      for (const track of clip.tracks) {
        if (!track.name.endsWith('.position')) continue;
        const bone = track.name.split('.')[0];
        if (bone !== BONES.root && bone !== BONES.hips) continue;
        const v = track.values;
        const n = v.length / 3;
        // `root` moves in the armature space (horizontal = X, Z). `pelvis` moves
        // inside root, which is rotated -90° about X: local X/Y are horizontal.
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
      const root = SkeletonUtils.clone(this.bodies.male.template);
      const bones = new Map();
      root.traverse((o) => {
        if (o.isBone) bones.set(o.name, o);
      });
      this._scratch = { root, bones, mixer: new THREE.AnimationMixer(root) };
    }
    return this._scratch;
  }

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
   * Natural ground speed of each locomotion clip from stance-foot velocity, and
   * the phase where the left foot is furthest forward (for synced blending).
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
    this.locomotion.Idle_Loop.natural = 0;
    this.locomotion.Walk_Loop.natural = Math.max(this.locomotion.Walk_Loop.natural, 0.9);
    this.locomotion.Jog_Fwd_Loop.natural = Math.max(this.locomotion.Jog_Fwd_Loop.natural, 2.4);
    this.locomotion.Sprint_Loop.natural = Math.max(this.locomotion.Sprint_Loop.natural, 4.5);
  }

  /**
   * Create a dressed character instance.
   * look: { team, skin, hair, hairColor, beard, number, headband, body: 'male'|'female', height }
   */
  createCharacter(look) {
    const body = this.bodies[look.body ?? 'male'] ?? this.bodies.male;
    const root = SkeletonUtils.clone(body.template);
    const bones = new Map();
    let mesh = null;
    const extras = [];
    root.traverse((o) => {
      if (o.isBone) bones.set(o.name, o);
      if (o.isSkinnedMesh) {
        if (o.geometry === body.mesh.geometry) mesh = o;
        else extras.push(o);
      }
    });
    mesh.material = createKitMaterial(this, look, body);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    const hairColor = new THREE.Color(look.hairColor ?? '#1b120c');
    const head = bones.get(BONES.head);
    for (const prop of body.headProps) {
      let mat = prop.material;
      if (prop.isBrow) {
        mat = mat.clone();
        mat.color.copy(hairColor).multiplyScalar(2.2);
      }
      const m = new THREE.Mesh(prop.geometry, mat);
      m.castShadow = false;
      head.add(m);
    }
    void extras;
    const group = new THREE.Group();
    group.name = 'hair';
    const styles = [QUATERNIUS_HAIR[look.hair], look.beard ? 'Hair_Beard' : null].filter(Boolean);
    for (const style of styles) {
      const h = this.hairGeometries.get(style);
      if (!h) continue;
      const mat = h.material.clone();
      mat.color.copy(hairColor).multiplyScalar(2.2);
      mat.side = THREE.DoubleSide;
      const m = new THREE.Mesh(h.geometry, mat);
      m.castShadow = true;
      group.add(m);
    }
    if (!QUATERNIUS_HAIR[look.hair] || look.headband) {
      // Procedural styles (afro, curly, twists) and headbands on the same head frame.
      const headIndex = body.skeleton.bones.findIndex((b) => b.name === BONES.head);
      const proc = createHair(QUATERNIUS_HAIR[look.hair] ? { ...look, hair: 'none' } : look, body.head, body.skeleton.boneInverses[headIndex]);
      if (proc) group.add(proc);
    }
    if (group.children.length) head.add(group);

    const holder = new THREE.Group();
    holder.add(root);
    root.scale.multiplyScalar((look.height ?? 1.78) / body.templateHeight);
    return { holder, root, mesh, bones, material: mesh.material, hair: group };
  }
}
