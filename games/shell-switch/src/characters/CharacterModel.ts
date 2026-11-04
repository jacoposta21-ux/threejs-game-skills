import * as THREE from 'three';
import { GeoBuilder } from '../world/GeoBuilder';
import type { Materials } from '../world/Materials';

export type Gait = 'hop' | 'stomp' | 'march' | 'bounce' | 'waddle' | 'sneak' | 'glide' | 'float' | 'hurry' | 'strut' | 'normal' | 'kid';
export type Emotion = 'neutral' | 'happy' | 'suspicious' | 'alarmed' | 'scared' | 'angry' | 'sad' | 'dazed' | 'love' | 'sleepy' | 'smug';
export type Pose =
  | 'none'
  | 'lift'
  | 'carry'
  | 'whistle'
  | 'perform'
  | 'cook'
  | 'pick'
  | 'sing'
  | 'phase'
  | 'zap'
  | 'proclaim'
  | 'cheer'
  | 'clap'
  | 'scared'
  | 'dance'
  | 'sit'
  | 'eat'
  | 'sleep'
  | 'flex'
  | 'point'
  | 'wave'
  | 'swoon'
  | 'shocked';

export type HairType = 'none' | 'mohawk' | 'puff' | 'bun' | 'beehive' | 'frizz' | 'clownPuffs' | 'bob' | 'spiky' | 'side' | 'pigtails' | 'long';
export type HatType = 'none' | 'police' | 'toque' | 'beanie' | 'tophat' | 'bonnet' | 'flatcap' | 'bowler' | 'cap' | 'guardcap' | 'ringmaster' | 'beret' | 'sunhat';
export type NoseType = 'button' | 'ball' | 'long' | 'big' | 'none';
export type Facial = 'none' | 'mustache' | 'handlebar' | 'curly' | 'chops' | 'beard' | 'stubble';
export type Extra =
  | 'apron'
  | 'badge'
  | 'tie'
  | 'bowtie'
  | 'ruffle'
  | 'labcoat'
  | 'gown'
  | 'sack'
  | 'coilpack'
  | 'sash'
  | 'monocle'
  | 'glasses'
  | 'sunglasses'
  | 'goggles'
  | 'mask'
  | 'belt'
  | 'buttons'
  | 'skirt'
  | 'scarf'
  | 'chain'
  | 'vest'
  | 'tail'
  | 'antennae'
  | 'backpack'
  | 'epaulettes'
  | 'tutu'
  | 'whistle'
  | 'necklace';
export type Held =
  | 'none'
  | 'spatula'
  | 'mic'
  | 'lantern'
  | 'briefcase'
  | 'bag'
  | 'camera'
  | 'balloon'
  | 'flashlight'
  | 'newspaper'
  | 'broom'
  | 'clipboard'
  | 'baton'
  | 'cane'
  | 'icecream'
  | 'phone'
  | 'paint';

export interface CharacterSpec {
  /** Torso lathe: radius at bottom / middle / top, height, depth ratio. */
  torso: { bottom: number; mid: number; top: number; h: number; depth: number; color: string; color2?: string; pattern?: 'stripes' | 'dots' | 'none'; bands?: number };
  head: { r: number; skin: string; sx?: number; sy?: number; neck?: number };
  legs: { len: number; w: number; color: string; shoe: string; shoeSize: number; spread?: number } | null;
  arms: { len: number; w: number; sleeve: string; hand: string; handSize?: number; spread?: number };
  eyes: { size: number; spacing: number; y?: number; pupil?: string; iris?: string; single?: boolean; lashes?: boolean };
  brows?: { color: string; thick?: number };
  nose: { type: NoseType; color?: string; size?: number };
  mouthColor?: string;
  hair: { type: HairType; color: string };
  hat: { type: HatType; color: string; color2?: string };
  facial: { type: Facial; color: string };
  extras: Extra[];
  extraColor?: string;
  extraColor2?: string;
  held: Held;
  heldColor?: string;
  gait: Gait;
  ghost?: boolean;
}

const tmpV = new THREE.Vector3();

interface MouthSet {
  smile: THREE.BufferGeometry;
  grin: THREE.BufferGeometry;
  flat: THREE.BufferGeometry;
  frown: THREE.BufferGeometry;
  o: THREE.BufferGeometry;
  wavy: THREE.BufferGeometry;
}

let mouthCache: MouthSet | null = null;

function mouths(): MouthSet {
  if (mouthCache) return mouthCache;
  const mk = (geo: THREE.BufferGeometry, t = {}) => {
    const b = new GeoBuilder();
    b.add(geo, '#4a1a28', t);
    return b.buildGeometry()!;
  };
  mouthCache = {
    smile: mk(new THREE.TorusGeometry(0.5, 0.13, 5, 10, Math.PI), { rz: Math.PI }),
    grin: mk(new THREE.CircleGeometry(0.55, 10, Math.PI, Math.PI)),
    flat: mk(new THREE.CapsuleGeometry(0.1, 0.7, 2, 6), { rz: Math.PI / 2 }),
    frown: mk(new THREE.TorusGeometry(0.5, 0.13, 5, 10, Math.PI), { y: -0.3 }),
    o: mk(new THREE.TorusGeometry(0.28, 0.14, 6, 12)),
    wavy: mk(new THREE.TorusGeometry(0.35, 0.11, 5, 10, Math.PI * 2), { sy: 0.4 }),
  };
  return mouthCache;
}

function lathe(b: GeoBuilder, pts: [number, number][], color: string, depth: number, seg = 12, y = 0): void {
  const v = pts.map(([r, h]) => new THREE.Vector2(Math.max(0.001, r), h));
  b.add(new THREE.LatheGeometry(v, seg), color, { y, sz: depth });
}

/** Live references to the animated joints of a built character. */
export class CharacterModel {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly hips = new THREE.Group();
  readonly torso = new THREE.Group();
  readonly head = new THREE.Group();
  readonly armL = new THREE.Group();
  readonly armR = new THREE.Group();
  readonly legL = new THREE.Group();
  readonly legR = new THREE.Group();
  readonly handR = new THREE.Group();
  readonly handL = new THREE.Group();
  readonly eyes: THREE.Mesh[] = [];
  readonly brows: THREE.Mesh[] = [];
  mouth!: THREE.Mesh;
  readonly antenna = new THREE.Group();
  readonly heldProp = new THREE.Group();
  readonly shadow: THREE.Mesh;
  readonly meshes: THREE.Mesh[] = [];

  readonly height: number;
  readonly radius: number;
  readonly headY: number;
  readonly shoulderY: number;
  readonly legLen: number;
  readonly headR: number;

  emotion: Emotion = 'neutral';
  pose: Pose = 'none';
  /** Squash-and-stretch scalar (1 = rest). */
  squash = 1;
  private squashVel = 0;
  private phase = 0;
  private blinkTimer = 2;
  private blinkT = 0;
  private poseT = 0;
  private lastPose: Pose = 'none';
  private emotionApplied: Emotion | null = null;
  private readonly baseEyeScale: number;
  lookYaw = 0;
  lookPitch = 0;
  private curLookYaw = 0;
  private curLookPitch = 0;
  private readonly spec: CharacterSpec;
  private readonly mats: Materials;
  private jiggle = 0;

  constructor(spec: CharacterSpec, mats: Materials, seed = 0) {
    this.spec = spec;
    this.mats = mats;
    this.phase = seed * 1.7;
    this.blinkTimer = 1 + (seed % 3);
    const material = spec.ghost ? mats.ghost : mats.character;
    const L = spec.legs ? spec.legs.len : spec.ghost ? 0.25 : 0.12;
    this.legLen = L;
    const T = spec.torso;
    const H = spec.head;
    const neck = H.neck ?? 0.04;
    this.headR = H.r;
    const headCenter = T.h + neck + H.r * (H.sy ?? 1) * 0.92;
    this.headY = L + headCenter;
    this.shoulderY = L + T.h * 0.86;
    this.height = L + headCenter + H.r * (H.sy ?? 1) + hatHeight(spec.hat.type, H.r);
    this.radius = Math.max(0.22, Math.max(T.mid, T.top, T.bottom) * 0.95);

    this.root.add(this.body);
    this.body.add(this.hips);
    this.hips.position.y = L;
    this.hips.add(this.torso);

    // ---------- torso ----------
    const tb = new GeoBuilder();
    if (spec.ghost) {
      // Sheet ghost: one lathe from a wavy hem up to the shoulders.
      lathe(
        tb,
        [
          [T.bottom * 1.2, -L - 0.05],
          [T.bottom * 1.05, -L * 0.4],
          [T.mid, T.h * 0.4],
          [T.top, T.h * 0.85],
          [T.top * 0.5, T.h],
        ],
        T.color,
        T.depth,
        14,
      );
      for (let i = 0; i < 7; i += 1) {
        const a = (i / 7) * Math.PI * 2;
        tb.sphere(Math.sin(a) * T.bottom * 1.15, -L - 0.03, Math.cos(a) * T.bottom * 1.15 * T.depth, T.bottom * 0.28, T.color, 6, 5);
      }
    } else if (T.pattern === 'stripes') {
      const bands = T.bands ?? 6;
      for (let i = 0; i < bands; i += 1) {
        const y0 = (i / bands) * T.h;
        const y1 = ((i + 1) / bands) * T.h;
        const r0 = profileR(T, y0 / T.h);
        const r1 = profileR(T, y1 / T.h);
        lathe(tb, [[r0, y0], [r1, y1]], i % 2 === 0 ? T.color : (T.color2 ?? '#ffffff'), T.depth, 12);
      }
      lathe(tb, [[T.top, T.h - 0.001], [T.top * 0.55, T.h + 0.02], [0.001, T.h + 0.03]], i2c(bands, T), T.depth, 12);
      lathe(tb, [[0.001, -0.01], [T.bottom, 0.001]], T.color, T.depth, 12);
    } else {
      lathe(
        tb,
        [
          [0.001, -0.02],
          [T.bottom * 0.9, 0],
          [T.bottom, T.h * 0.12],
          [T.mid, T.h * 0.5],
          [T.top, T.h * 0.85],
          [T.top * 0.6, T.h * 0.98],
          [0.001, T.h + 0.02],
        ],
        T.color,
        T.depth,
        12,
      );
      if (T.pattern === 'dots') {
        const dc = T.color2 ?? '#ffffff';
        for (let i = 0; i < 9; i += 1) {
          const yy = T.h * (0.2 + (i % 3) * 0.28);
          const a = -0.9 + Math.floor(i / 3) * 0.9;
          const r = profileR(T, yy / T.h);
          tb.sphere(Math.sin(a) * r, yy, Math.cos(a) * r * T.depth, Math.min(0.07, r * 0.2), dc, 6, 4, { sz: 0.4 });
        }
      }
    }
    this.buildExtras(tb, spec, T, L);
    this.addMesh(this.torso, tb, material);

    // ---------- head ----------
    this.head.position.y = headCenter;
    this.hips.add(this.head);
    const hb = new GeoBuilder();
    hb.sphere(0, 0, 0, H.r, H.skin, 14, 11, { sx: H.sx ?? 1, sy: H.sy ?? 1, sz: 1 });
    if (!spec.eyes.single && !spec.ghost) {
      hb.sphere(-H.r * 0.98 * (H.sx ?? 1), 0, 0, H.r * 0.2, H.skin, 6, 5, { sx: 0.6 });
      hb.sphere(H.r * 0.98 * (H.sx ?? 1), 0, 0, H.r * 0.2, H.skin, 6, 5, { sx: 0.6 });
    }
    this.buildNose(hb, spec, H.r);
    this.buildHair(hb, spec, H.r, H.sx ?? 1, H.sy ?? 1);
    this.buildHat(hb, spec, H.r, H.sy ?? 1);
    this.buildFacial(hb, spec, H.r);
    this.buildFaceExtras(hb, spec, H.r);
    this.addMesh(this.head, hb, material);

    // Eyes: white + iris + pupil merged; rotating the mesh aims the pupil.
    const eyeSize = spec.eyes.size;
    const eyeY = (spec.eyes.y ?? 0.12) * H.r;
    const eyeZ = H.r * 0.82;
    const eyePositions = spec.eyes.single ? [0] : [-spec.eyes.spacing * H.r, spec.eyes.spacing * H.r];
    for (const ex of eyePositions) {
      const eb = new GeoBuilder();
      eb.sphere(0, 0, 0, eyeSize, '#fffdf6', 12, 10);
      eb.sphere(0, 0, eyeSize * 0.62, eyeSize * 0.56, spec.eyes.iris ?? spec.eyes.pupil ?? '#2a2238', 10, 8, { sz: 0.55 });
      eb.sphere(0, 0, eyeSize * 0.8, eyeSize * 0.32, spec.eyes.pupil ?? '#1a1426', 8, 6, { sz: 0.5 });
      eb.sphere(eyeSize * 0.22, eyeSize * 0.24, eyeSize * 0.92, eyeSize * 0.12, '#ffffff', 5, 4);
      if (spec.eyes.lashes) {
        eb.box(0, eyeSize * 0.95, eyeSize * 0.3, eyeSize * 1.4, eyeSize * 0.16, eyeSize * 0.3, '#1a1426');
      }
      const geo = eb.buildGeometry()!;
      const eye = new THREE.Mesh(geo, material);
      const zOff = spec.eyes.single ? H.r * 0.7 : eyeZ;
      eye.position.set(ex, eyeY, Math.sqrt(Math.max(0.0001, zOff * zOff - ex * ex * 0.2)));
      eye.castShadow = false;
      this.head.add(eye);
      this.eyes.push(eye);
      this.meshes.push(eye);
    }
    this.baseEyeScale = 1;

    // Brows.
    if (spec.brows) {
      for (const ex of eyePositions) {
        const bb = new GeoBuilder();
        const th = spec.brows.thick ?? 1;
        bb.add(new THREE.CapsuleGeometry(eyeSize * 0.22 * th, eyeSize * 1.2, 2, 6), spec.brows.color, { rz: Math.PI / 2 });
        const brow = new THREE.Mesh(bb.buildGeometry()!, material);
        brow.position.set(ex, eyeY + eyeSize * 1.35, eyeZ + eyeSize * 0.2);
        brow.userData.baseY = brow.position.y;
        brow.userData.side = Math.sign(ex) || 1;
        this.head.add(brow);
        this.brows.push(brow);
        this.meshes.push(brow);
      }
    }

    // Mouth (geometry swapped per emotion).
    const mset = mouths();
    this.mouth = new THREE.Mesh(mset.smile, material);
    const mScale = H.r * 0.28;
    this.mouth.scale.setScalar(mScale);
    this.mouth.position.set(0, -H.r * 0.38, H.r * 0.9);
    this.mouth.rotation.x = -0.25;
    this.head.add(this.mouth);
    this.meshes.push(this.mouth);

    // Possession antennae (hidden until Glim is inside).
    const ab = new GeoBuilder();
    for (const s of [-1, 1]) {
      ab.add(new THREE.CylinderGeometry(0.018, 0.022, 0.32, 5), '#5fe0b8', { x: s * 0.08, y: 0.16, rz: -s * 0.35 });
      ab.sphere(s * 0.135, 0.32, 0, 0.055, '#ff6fb5', 8, 6);
    }
    const antMesh = new THREE.Mesh(ab.buildGeometry()!, mats.character);
    this.antenna.add(antMesh);
    this.antenna.position.y = H.r * (H.sy ?? 1) * 0.8 + hatHeight(spec.hat.type, H.r) * 0.9;
    this.antenna.visible = false;
    this.head.add(this.antenna);

    // ---------- arms ----------
    const A = spec.arms;
    const shoulderX = Math.max(T.top, T.mid * 0.9) * 0.95 + A.w * 0.4 + (A.spread ?? 0);
    for (const side of [-1, 1]) {
      const g = side < 0 ? this.armL : this.armR;
      g.position.set(side * shoulderX, T.h * 0.86, 0);
      this.hips.add(g);
      const b = new GeoBuilder();
      b.sphere(0, 0, 0, A.w * 1.05, A.sleeve, 8, 6);
      b.add(new THREE.CapsuleGeometry(A.w, A.len - A.w, 3, 8), A.sleeve, { y: -A.len / 2 });
      b.sphere(0, -A.len, 0, A.w * 1.25 * (A.handSize ?? 1), A.hand, 8, 6);
      if (spec.extras.includes('labcoat') || spec.extras.includes('gown')) {
        b.add(new THREE.CylinderGeometry(A.w * 1.4, A.w * 1.1, A.len * 0.2, 7), spec.extras.includes('gown') ? A.sleeve : '#ffffff', { y: -A.len * 0.72 });
      }
      this.addMesh(g, b, material);
      const hand = side < 0 ? this.handL : this.handR;
      hand.position.set(0, -A.len, 0);
      g.add(hand);
    }

    // ---------- legs ----------
    if (spec.legs) {
      const Lg = spec.legs;
      const hipX = Math.max(T.bottom * 0.45, Lg.w * 1.1) + (Lg.spread ?? 0);
      for (const side of [-1, 1]) {
        const g = side < 0 ? this.legL : this.legR;
        g.position.set(side * hipX, 0.02, 0);
        this.hips.add(g);
        const b = new GeoBuilder();
        b.add(new THREE.CapsuleGeometry(Lg.w, Math.max(0.01, L - Lg.w * 2), 3, 8), Lg.color, { y: -L / 2 + Lg.w * 0.4 });
        const s = Lg.shoeSize;
        b.sphere(0, -L + 0.06 * s, 0.05 * s, 0.1 * s, Lg.shoe, 9, 6, { sx: 0.9, sy: 0.55, sz: 1.45 });
        this.addMesh(g, b, material);
      }
    }

    // Held prop.
    this.handR.add(this.heldProp);
    this.setHeld(spec.held, spec.heldColor);

    // Blob shadow (cheap contact grounding for every character).
    this.shadow = new THREE.Mesh(blobGeometry(), mats.shadowBlob);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.02;
    const s = this.radius * 2.6;
    this.shadow.scale.set(s, s, s);
    this.shadow.renderOrder = -1;
    this.root.add(this.shadow);
  }

  private addMesh(parent: THREE.Object3D, b: GeoBuilder, mat: THREE.Material): THREE.Mesh {
    const geo = b.buildGeometry()!;
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = false;
    parent.add(m);
    this.meshes.push(m);
    return m;
  }

  setHeld(held: Held, color?: string): void {
    for (const c of [...this.heldProp.children]) {
      this.heldProp.remove(c);
      (c as THREE.Mesh).geometry?.dispose();
    }
    if (held === 'none') return;
    const b = new GeoBuilder();
    const c = color ?? '#888888';
    switch (held) {
      case 'spatula':
        b.add(new THREE.CylinderGeometry(0.02, 0.025, 0.4, 5), '#7d5130', { y: -0.12, rx: Math.PI / 2, z: 0.15 });
        b.box(0, -0.12, 0.42, 0.16, 0.02, 0.2, '#d8dde6');
        break;
      case 'mic':
        b.add(new THREE.CylinderGeometry(0.03, 0.022, 0.24, 6), '#2a2238', { y: 0.05, z: 0.06 });
        b.sphere(0, 0.2, 0.06, 0.06, '#c9c9d6', 8, 6);
        break;
      case 'lantern':
        b.add(new THREE.TorusGeometry(0.06, 0.012, 4, 8, Math.PI), '#3a2c20', { y: -0.04 });
        b.cyl(0, -0.3, 0, 0.09, 0.09, 0.22, '#ffd27a', 6);
        b.cyl(0, -0.32, 0, 0.1, 0.1, 0.03, '#3a2c20', 6);
        b.cyl(0, -0.08, 0, 0.06, 0.1, 0.05, '#3a2c20', 6);
        break;
      case 'briefcase':
        b.box(0, -0.18, 0, 0.1, 0.24, 0.34, c);
        b.box(0, -0.04, 0, 0.03, 0.04, 0.12, '#2a2238');
        break;
      case 'bag':
        b.box(0, -0.22, 0, 0.12, 0.28, 0.26, c);
        b.add(new THREE.TorusGeometry(0.07, 0.012, 4, 8, Math.PI), '#ffffff', { y: -0.08, ry: Math.PI / 2 });
        break;
      case 'camera':
        b.box(0, -0.02, 0.1, 0.18, 0.12, 0.1, '#2a2238');
        b.cyl(0, -0.02, 0.18, 0.04, 0.04, 0.06, '#5a5770', 8, { rx: Math.PI / 2 });
        break;
      case 'balloon':
        b.add(new THREE.CylinderGeometry(0.004, 0.004, 0.9, 3), '#ffffff', { y: 0.45 });
        b.sphere(0, 1.0, 0, 0.2, c, 10, 8, { sy: 1.2 });
        break;
      case 'flashlight':
        b.add(new THREE.CylinderGeometry(0.035, 0.03, 0.26, 6), '#3a3f55', { z: 0.1, rx: Math.PI / 2 });
        b.cyl(0, 0, 0.24, 0.05, 0.035, 0.06, '#fff2a8', 6, { rx: Math.PI / 2 });
        break;
      case 'newspaper':
        b.box(0, -0.05, 0.12, 0.3, 0.38, 0.02, '#f2efe6', 0);
        break;
      case 'broom':
        b.add(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 5), '#b07a48', { y: -0.1 });
        b.cone(0, -0.8, 0, 0.12, 0.25, '#e0c070', 6, { rx: Math.PI });
        break;
      case 'clipboard':
        b.box(0, -0.12, 0.1, 0.22, 0.3, 0.02, '#b07a48');
        b.box(0, -0.1, 0.112, 0.18, 0.22, 0.01, '#ffffff');
        break;
      case 'baton':
        b.add(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 6), '#1e2440', { y: -0.15 });
        break;
      case 'cane':
        b.add(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 6), '#2a2238', { y: -0.4 });
        b.sphere(0, 0.05, 0, 0.05, '#f2c14e', 6, 5);
        break;
      case 'icecream':
        b.cone(0, -0.1, 0.05, 0.05, 0.16, '#e0b070', 6, { rx: Math.PI });
        b.sphere(0, 0.08, 0.05, 0.065, c, 8, 6);
        break;
      case 'phone':
        b.box(0, 0, 0.08, 0.07, 0.13, 0.015, '#2a2238');
        break;
      case 'paint':
        b.cyl(0, -0.1, 0.05, 0.05, 0.05, 0.18, c, 7);
        b.cyl(0, 0.08, 0.05, 0.02, 0.03, 0.04, '#ffffff', 5);
        break;
    }
    const geo = b.buildGeometry();
    if (!geo) return;
    const mesh = new THREE.Mesh(geo, this.mats.character);
    mesh.castShadow = true;
    this.heldProp.add(mesh);
  }

  // ---------------------------------------------------------------- builders
  private buildExtras(b: GeoBuilder, spec: CharacterSpec, T: CharacterSpec['torso'], L: number): void {
    const ec = spec.extraColor ?? '#ffffff';
    const ec2 = spec.extraColor2 ?? '#f2c14e';
    const front = (y: number) => profileR(T, y / T.h) * T.depth;
    for (const e of spec.extras) {
      switch (e) {
        case 'apron':
          b.box(0, T.h * 0.35, front(T.h * 0.35) + 0.01, profileR(T, 0.35) * 1.3, T.h * 0.8, 0.03, ec);
          b.box(0, T.h * 0.62, front(T.h * 0.62) + 0.02, profileR(T, 0.6) * 0.5, 0.05, 0.02, ec2);
          break;
        case 'badge':
          b.add(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 6), '#f2c14e', { x: profileR(T, 0.7) * 0.42, y: T.h * 0.7, z: front(T.h * 0.7) * 0.92, rx: Math.PI / 2 });
          break;
        case 'tie':
          b.add(new THREE.ConeGeometry(0.06, T.h * 0.55, 4), ec, { y: T.h * 0.55, z: front(T.h * 0.6) + 0.02, rx: Math.PI, sz: 0.3 });
          break;
        case 'bowtie':
          b.add(new THREE.ConeGeometry(0.06, 0.12, 4), ec, { x: -0.06, y: T.h * 0.95, z: front(T.h * 0.9) + 0.02, rz: -Math.PI / 2 });
          b.add(new THREE.ConeGeometry(0.06, 0.12, 4), ec, { x: 0.06, y: T.h * 0.95, z: front(T.h * 0.9) + 0.02, rz: Math.PI / 2 });
          break;
        case 'ruffle':
          for (let i = 0; i < 10; i += 1) {
            const a = (i / 10) * Math.PI * 2;
            const rr = T.top * 0.9;
            b.sphere(Math.sin(a) * rr, T.h * 0.98, Math.cos(a) * rr * T.depth, T.top * 0.32, i % 2 ? ec : ec2, 6, 4, { sy: 0.6 });
          }
          break;
        case 'labcoat':
          lathe(b, [[T.bottom * 1.08, -L * 0.75], [T.bottom * 1.08, 0], [T.mid * 1.05, T.h * 0.5], [T.top * 1.04, T.h * 0.9]], '#f6f6f2', T.depth * 1.04, 10);
          b.box(0, T.h * 0.4, front(T.h * 0.4) * 1.05 + 0.02, 0.04, T.h * 0.8, 0.02, '#d8dbe4');
          break;
        case 'gown':
          lathe(b, [[0.001, -L - 0.02], [T.bottom * 2.0, -L], [T.bottom * 1.6, -L * 0.5], [T.bottom * 1.05, 0.0], [T.mid, T.h * 0.5]], T.color, T.depth, 14);
          for (let i = 0; i < 12; i += 1) {
            const a = (i / 12) * Math.PI * 2;
            const t = (i % 3) / 3;
            const yy = -L * (0.2 + t * 0.6);
            const rr = T.bottom * (1.15 + t * 0.6);
            b.sphere(Math.sin(a) * rr, yy, Math.cos(a) * rr * T.depth, 0.025, ec2, 4, 3);
          }
          break;
        case 'skirt':
          lathe(b, [[T.bottom * 1.05, T.h * 0.15], [T.bottom * 1.7, -L * 0.4]], ec, T.depth, 10);
          break;
        case 'tutu':
          lathe(b, [[T.bottom * 1.0, T.h * 0.12], [T.bottom * 2.0, T.h * 0.02], [T.bottom * 1.9, -0.02]], ec, T.depth, 12);
          break;
        case 'sack':
          b.sphere(0, T.h * 0.6, -front(T.h * 0.6) - T.mid * 0.45, T.mid * 0.8, ec, 8, 6, { sy: 1.1 });
          b.add(new THREE.TorusGeometry(T.mid * 0.3, 0.025, 4, 8), '#7d5130', { y: T.h * 1.02, z: -front(T.h * 0.6) - T.mid * 0.4, rx: Math.PI / 2 });
          break;
        case 'coilpack':
          b.box(0, T.h * 0.55, -front(T.h * 0.55) - 0.1, T.mid * 0.9, T.h * 0.6, 0.2, '#6b6f82');
          b.cyl(0, T.h * 0.85, -front(T.h * 0.55) - 0.1, 0.04, 0.04, 0.5, '#b07a48', 6);
          for (let i = 0; i < 4; i += 1) b.add(new THREE.TorusGeometry(0.08 - i * 0.012, 0.018, 4, 10), '#c87c3c', { y: T.h * 0.95 + i * 0.1, z: -front(T.h * 0.55) - 0.1, rx: Math.PI / 2 });
          b.sphere(0, T.h * 1.42, -front(T.h * 0.55) - 0.1, 0.07, '#7fd4ff', 8, 6);
          break;
        case 'sash':
          b.add(new THREE.TorusGeometry(Math.max(T.mid, T.top) * 1.0, 0.05, 4, 16), ec, { y: T.h * 0.55, rz: 0.75, sz: T.depth * 1.02 });
          break;
        case 'chain':
          for (let i = 0; i < 9; i += 1) {
            const a = -1.1 + (i / 8) * 2.2;
            b.sphere(Math.sin(a) * T.top * 0.85, T.h * (0.82 - Math.cos(a * 1.2) * 0.18), Math.cos(a) * T.top * 0.85 * T.depth + 0.02, 0.035, '#f2c14e', 5, 4);
          }
          b.add(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 10), '#f2c14e', { y: T.h * 0.6, z: front(T.h * 0.6) + 0.03, rx: Math.PI / 2 });
          break;
        case 'necklace':
          for (let i = 0; i < 9; i += 1) {
            const a = -1.0 + (i / 8) * 2.0;
            b.sphere(Math.sin(a) * T.top * 0.8, T.h * (0.88 - Math.cos(a * 1.4) * 0.1), Math.cos(a) * T.top * 0.8 * T.depth + 0.015, 0.03, ec2, 5, 4);
          }
          break;
        case 'belt':
          lathe(b, [[profileR(T, 0.08) * 1.04, T.h * 0.04], [profileR(T, 0.16) * 1.04, T.h * 0.16]], ec, T.depth * 1.02, 12);
          b.box(0, T.h * 0.1, front(T.h * 0.1) * 1.04 + 0.01, 0.1, 0.08, 0.03, '#f2c14e');
          break;
        case 'buttons':
          for (let i = 0; i < 3; i += 1) {
            const yy = T.h * (0.3 + i * 0.2);
            b.sphere(0, yy, front(yy) + 0.005, 0.035, ec2, 5, 4, { sz: 0.5 });
          }
          break;
        case 'vest':
          lathe(b, [[T.bottom * 1.03, T.h * 0.1], [T.mid * 1.03, T.h * 0.5], [T.top * 1.02, T.h * 0.8]], ec, T.depth * 1.03, 10);
          break;
        case 'scarf':
          b.add(new THREE.TorusGeometry(T.top * 0.7, 0.07, 6, 12), ec, { y: T.h * 0.98, rx: Math.PI / 2 });
          b.box(T.top * 0.3, T.h * 0.7, front(T.h * 0.8) + 0.04, 0.12, T.h * 0.45, 0.05, ec);
          break;
        case 'tail':
          b.add(new THREE.ConeGeometry(0.08, 0.35, 6), spec.torso.color, { y: 0.1, z: -front(0.1) - 0.12, rx: -1.2 });
          break;
        case 'backpack':
          b.box(0, T.h * 0.55, -front(T.h * 0.55) - 0.08, T.mid * 1.0, T.h * 0.55, 0.16, ec);
          break;
        case 'epaulettes':
          for (const s of [-1, 1]) b.box(s * T.top * 0.85, T.h * 0.95, 0, 0.16, 0.04, 0.14, '#f2c14e');
          break;
        case 'whistle':
          b.add(new THREE.TorusGeometry(T.top * 0.55, 0.01, 3, 12), '#f2c14e', { y: T.h * 0.85, rx: 1.3 });
          b.cyl(0, T.h * 0.56, front(T.h * 0.6) + 0.03, 0.025, 0.025, 0.08, '#d8dde6', 6, { rx: Math.PI / 2 });
          break;
        default:
          break;
      }
    }
  }

  private buildFaceExtras(b: GeoBuilder, spec: CharacterSpec, r: number): void {
    const y = (spec.eyes.y ?? 0.12) * r;
    const sp = spec.eyes.spacing * r;
    const es = spec.eyes.size;
    for (const e of spec.extras) {
      switch (e) {
        case 'glasses':
          for (const s of [-1, 1]) b.add(new THREE.TorusGeometry(es * 1.25, 0.018, 4, 12), '#2a2238', { x: s * sp, y, z: r * 0.92 + es * 0.4 });
          b.box(0, y, r * 0.95 + es * 0.4, sp * 0.6, 0.02, 0.02, '#2a2238');
          break;
        case 'sunglasses':
          for (const s of [-1, 1]) b.sphere(s * sp, y, r * 0.9 + es * 0.6, es * 1.25, '#1a1426', 8, 6, { sz: 0.35 });
          b.box(0, y + es * 0.4, r * 0.95 + es * 0.5, sp * 2.6, 0.035, 0.03, '#1a1426');
          break;
        case 'monocle':
          b.add(new THREE.TorusGeometry(es * 1.35, 0.022, 4, 12), '#f2c14e', { x: sp, y, z: r * 0.92 + es * 0.5 });
          b.add(new THREE.CylinderGeometry(0.006, 0.006, r * 0.9, 3), '#f2c14e', { x: sp * 1.4, y: y - r * 0.5, z: r * 0.7, rz: 0.3 });
          break;
        case 'goggles':
          for (const s of [-1, 1]) b.add(new THREE.CylinderGeometry(es * 1.1, es * 1.1, 0.08, 10), '#7fd4ff', { x: s * sp, y: y + r * 0.62, z: r * 0.62, rx: Math.PI / 2 - 0.7 });
          b.add(new THREE.TorusGeometry(r * 1.0, 0.03, 4, 16), '#5a3a20', { y: y + r * 0.5, rx: Math.PI / 2 - 0.25 });
          break;
        case 'mask':
          b.add(new THREE.TorusGeometry(r * 0.94, es * 0.75, 4, 18, Math.PI * 0.9), '#1a1426', { y, rz: Math.PI * 0.05, sz: 0.95, rx: 0 });
          break;
        case 'antennae':
          for (const s of [-1, 1]) {
            b.add(new THREE.CylinderGeometry(0.02, 0.028, r * 0.9, 5), '#2fae8c', { x: s * r * 0.35, y: r * 1.25, rz: -s * 0.35 });
            b.sphere(s * r * 0.52, r * 1.68, 0, r * 0.14, '#ff6fb5', 8, 6);
          }
          break;
        default:
          break;
      }
    }
  }

  private buildNose(b: GeoBuilder, spec: CharacterSpec, r: number): void {
    const n = spec.nose;
    const c = n.color ?? spec.head.skin;
    const s = n.size ?? 1;
    switch (n.type) {
      case 'button':
        b.sphere(0, -r * 0.08, r * 0.97, r * 0.12 * s, c, 6, 5);
        break;
      case 'ball':
        b.sphere(0, -r * 0.05, r * 1.02, r * 0.24 * s, c, 10, 8);
        break;
      case 'long':
        b.add(new THREE.ConeGeometry(r * 0.12 * s, r * 0.7 * s, 6), c, { y: -r * 0.08, z: r * 1.15, rx: Math.PI / 2 + 0.25 });
        break;
      case 'big':
        b.sphere(0, -r * 0.1, r * 0.98, r * 0.2 * s, c, 8, 6, { sy: 1.2, sz: 0.9 });
        break;
      default:
        break;
    }
  }

  private buildHair(b: GeoBuilder, spec: CharacterSpec, r: number, sx: number, sy: number): void {
    const c = spec.hair.color;
    const top = r * sy;
    switch (spec.hair.type) {
      case 'mohawk':
        for (let i = 0; i < 5; i += 1) {
          b.add(new THREE.ConeGeometry(r * 0.16, r * 0.8, 4), c, { y: top * 0.95 + r * 0.25, z: r * (0.5 - i * 0.28), rx: -0.4 + i * 0.25 });
        }
        break;
      case 'puff':
        b.sphere(0, top * 0.55, -r * 0.1, r * 0.95, c, 10, 8, { sy: 0.7 });
        break;
      case 'bun':
        b.sphere(0, top * 0.4, -r * 0.15, r * 1.02, c, 10, 8, { sy: 0.75 });
        b.sphere(0, top * 0.95, -r * 0.45, r * 0.42, c, 8, 6);
        break;
      case 'beehive':
        b.sphere(0, top * 0.3, -r * 0.08, r * 1.06, c, 12, 9, { sy: 0.8 });
        b.sphere(0, top * 1.15, -r * 0.1, r * 0.85, c, 12, 9, { sy: 1.4 });
        b.sphere(r * 0.5, top * 0.2, r * 0.5, r * 0.35, c, 8, 6);
        break;
      case 'frizz':
        for (let i = 0; i < 9; i += 1) {
          const a = (i / 9) * Math.PI * 2;
          b.sphere(Math.sin(a) * r * 0.85 * sx, top * 0.45 + Math.cos(i * 2.3) * r * 0.15, Math.cos(a) * r * 0.7 - r * 0.25, r * 0.48, c, 7, 5);
        }
        break;
      case 'clownPuffs':
        for (const s of [-1, 1]) {
          b.sphere(s * r * 0.95 * sx, top * 0.25, -r * 0.1, r * 0.55, c, 9, 7);
          b.sphere(s * r * 0.7 * sx, top * 0.7, -r * 0.2, r * 0.45, spec.extraColor2 ?? c, 9, 7);
        }
        break;
      case 'bob':
        b.sphere(0, top * 0.25, -r * 0.12, r * 1.08, c, 12, 8, { sy: 0.85 });
        b.box(0, -r * 0.1, -r * 0.5, r * 1.9, r * 0.9, r * 0.9, c);
        break;
      case 'spiky':
        for (let i = 0; i < 7; i += 1) {
          const a = (i / 7) * Math.PI * 2;
          b.add(new THREE.ConeGeometry(r * 0.22, r * 0.6, 4), c, { x: Math.sin(a) * r * 0.45, y: top * 0.85, z: Math.cos(a) * r * 0.45 - r * 0.1, rx: Math.cos(a) * 0.6, rz: -Math.sin(a) * 0.6 });
        }
        break;
      case 'side':
        b.sphere(0, top * 0.45, -r * 0.1, r * 0.98, c, 10, 8, { sy: 0.6 });
        b.sphere(r * 0.45, top * 0.65, r * 0.35, r * 0.4, c, 8, 6, { sy: 0.6 });
        break;
      case 'pigtails':
        b.sphere(0, top * 0.4, -r * 0.1, r * 1.0, c, 10, 8, { sy: 0.7 });
        for (const s of [-1, 1]) b.sphere(s * r * 1.15, top * 0.2, -r * 0.2, r * 0.38, c, 8, 6);
        break;
      case 'long':
        b.sphere(0, top * 0.35, -r * 0.12, r * 1.06, c, 10, 8, { sy: 0.8 });
        b.box(0, -r * 0.5, -r * 0.55, r * 1.8, r * 1.6, r * 0.6, c);
        break;
      default:
        break;
    }
  }

  private buildHat(b: GeoBuilder, spec: CharacterSpec, r: number, sy: number): void {
    const c = spec.hat.color;
    const c2 = spec.hat.color2 ?? '#2a2238';
    const top = r * sy * 0.78;
    switch (spec.hat.type) {
      case 'police':
        b.cyl(0, top, 0, r * 0.95, r * 0.85, r * 0.9, c, 12);
        b.cyl(0, top + r * 0.85, 0, r * 1.05, r * 0.95, r * 0.12, c, 12);
        b.cyl(0, top, 0, r * 0.88, r * 0.88, r * 0.22, c2, 12);
        b.box(0, top + 0.02, r * 0.85, r * 1.2, 0.04, r * 0.6, '#1a1426', 0);
        b.add(new THREE.CylinderGeometry(r * 0.16, r * 0.16, 0.03, 6), '#f2c14e', { y: top + r * 0.5, z: r * 0.9, rx: Math.PI / 2 });
        break;
      case 'guardcap':
        b.cyl(0, top, 0, r * 0.95, r * 0.9, r * 0.35, c, 12);
        b.box(0, top + 0.02, r * 0.8, r * 1.1, 0.04, r * 0.55, '#1a1426');
        b.add(new THREE.CylinderGeometry(r * 0.12, r * 0.12, 0.03, 6), '#f2c14e', { y: top + r * 0.2, z: r * 0.92, rx: Math.PI / 2 });
        break;
      case 'toque':
        b.cyl(0, top - r * 0.1, 0, r * 0.85, r * 0.85, r * 0.45, '#ffffff', 12);
        for (let i = 0; i < 6; i += 1) {
          const a = (i / 6) * Math.PI * 2;
          b.sphere(Math.sin(a) * r * 0.55, top + r * 1.0, Math.cos(a) * r * 0.55, r * 0.55, '#ffffff', 8, 6);
        }
        b.sphere(0, top + r * 1.25, 0, r * 0.65, '#ffffff', 8, 6);
        break;
      case 'beanie':
        b.sphere(0, top * 0.6, 0, r * 1.02, c, 12, 8, { sy: 0.75 });
        b.cyl(0, top * 0.2, 0, r * 1.04, r * 1.04, r * 0.25, c2, 12);
        break;
      case 'tophat':
        b.cyl(0, top, 0, r * 1.35, r * 1.35, 0.04, c, 14);
        b.cyl(0, top, 0, r * 0.8, r * 0.75, r * 1.4, c, 12);
        b.cyl(0, top + 0.04, 0, r * 0.77, r * 0.77, r * 0.25, c2, 12);
        break;
      case 'ringmaster':
        b.cyl(0, top, 0, r * 1.3, r * 1.3, 0.04, c, 14);
        b.cyl(0, top, 0, r * 0.85, r * 0.72, r * 1.2, c, 12);
        b.cyl(0, top + r * 0.1, 0, r * 0.8, r * 0.8, r * 0.2, c2, 12);
        b.cyl(0, top + r * 0.6, 0, r * 0.78, r * 0.78, r * 0.12, c2, 12);
        break;
      case 'bonnet':
        b.sphere(0, top * 0.5, -r * 0.2, r * 1.15, c, 12, 8, { sy: 0.9 });
        b.add(new THREE.TorusGeometry(r * 1.0, r * 0.12, 5, 14, Math.PI), c2, { y: top * 0.1, z: r * 0.25, rx: 0.4 });
        break;
      case 'flatcap':
        b.sphere(0, top * 0.75, -r * 0.05, r * 1.0, c, 12, 6, { sy: 0.35 });
        b.box(0, top * 0.7, r * 0.75, r * 1.1, 0.05, r * 0.6, c);
        break;
      case 'bowler':
        b.sphere(0, top * 0.75, 0, r * 0.82, c, 12, 8, { sy: 0.8 });
        b.cyl(0, top * 0.7, 0, r * 1.2, r * 1.2, 0.04, c, 14);
        break;
      case 'cap':
        b.sphere(0, top * 0.62, 0, r * 1.0, c, 12, 8, { sy: 0.6 });
        b.box(0, top * 0.55, r * 0.85, r * 1.0, 0.05, r * 0.75, c2);
        break;
      case 'beret':
        b.sphere(r * 0.15, top * 0.85, 0, r * 1.0, c, 12, 6, { sy: 0.3 });
        break;
      case 'sunhat':
        b.cyl(0, top * 0.75, 0, r * 1.8, r * 1.8, 0.04, c, 16);
        b.sphere(0, top * 0.8, 0, r * 0.85, c, 12, 8, { sy: 0.6 });
        b.cyl(0, top * 0.78, 0, r * 0.86, r * 0.86, r * 0.15, c2, 12);
        break;
      default:
        break;
    }
  }

  private buildFacial(b: GeoBuilder, spec: CharacterSpec, r: number): void {
    const c = spec.facial.color;
    const y = -r * 0.25;
    const z = r * 0.92;
    switch (spec.facial.type) {
      case 'mustache':
        for (const s of [-1, 1]) b.sphere(s * r * 0.2, y, z, r * 0.2, c, 8, 6, { sx: 1.5, sy: 0.6 });
        break;
      case 'handlebar':
        for (const s of [-1, 1]) {
          b.sphere(s * r * 0.22, y, z, r * 0.18, c, 8, 6, { sx: 1.6, sy: 0.7 });
          b.add(new THREE.TorusGeometry(r * 0.16, r * 0.06, 4, 8, Math.PI * 1.2), c, { x: s * r * 0.55, y: y + r * 0.1, z: z - r * 0.1, rz: s > 0 ? -0.5 : Math.PI + 0.5 });
        }
        break;
      case 'curly':
        for (const s of [-1, 1]) {
          b.sphere(s * r * 0.2, y, z, r * 0.16, c, 8, 6, { sx: 1.4, sy: 0.7 });
          b.add(new THREE.TorusGeometry(r * 0.12, r * 0.05, 4, 8, Math.PI * 1.6), c, { x: s * r * 0.48, y: y + r * 0.06, z: z - r * 0.08 });
        }
        break;
      case 'chops':
        for (const s of [-1, 1]) b.sphere(s * r * 0.82, -r * 0.2, r * 0.3, r * 0.35, c, 8, 6, { sx: 0.5, sy: 1.1 });
        b.sphere(0, y, z, r * 0.2, c, 8, 6, { sx: 2.2, sy: 0.55 });
        break;
      case 'beard':
        b.sphere(0, -r * 0.55, r * 0.55, r * 0.6, c, 10, 7, { sy: 0.9, sz: 0.7 });
        break;
      case 'stubble':
        b.sphere(0, -r * 0.42, r * 0.4, r * 0.7, c, 10, 6, { sy: 0.6, sz: 0.85 });
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------- animation

  setPossessed(on: boolean): void {
    this.antenna.visible = on;
  }

  /** Punchy squash impulse (landing, possession, hits). Negative = squash. */
  kick(amount: number): void {
    this.squashVel += amount;
  }

  wobble(amount: number): void {
    this.jiggle = Math.max(this.jiggle, amount);
  }

  private applyEmotion(): void {
    if (this.emotionApplied === this.emotion) return;
    this.emotionApplied = this.emotion;
    const m = mouths();
    const e = this.emotion;
    const geo =
      e === 'happy' || e === 'love'
        ? m.grin
        : e === 'smug'
          ? m.smile
          : e === 'alarmed' || e === 'scared'
            ? m.o
            : e === 'sad' || e === 'angry'
              ? m.frown
              : e === 'dazed'
                ? m.wavy
                : e === 'suspicious' || e === 'sleepy'
                  ? m.flat
                  : m.smile;
    this.mouth.geometry = geo;
    const browRot: Record<Emotion, number> = {
      neutral: 0,
      happy: -0.1,
      suspicious: 0.32,
      alarmed: -0.35,
      scared: -0.45,
      angry: 0.5,
      sad: -0.4,
      dazed: 0.15,
      love: -0.2,
      sleepy: 0.1,
      smug: 0.2,
    };
    const browLift: Record<Emotion, number> = {
      neutral: 0,
      happy: 0.02,
      suspicious: -0.01,
      alarmed: 0.06,
      scared: 0.05,
      angry: -0.03,
      sad: 0.02,
      dazed: 0,
      love: 0.03,
      sleepy: -0.02,
      smug: 0,
    };
    for (const b of this.brows) {
      const side = b.userData.side as number;
      b.rotation.z = -side * browRot[e];
      b.position.y = (b.userData.baseY as number) + browLift[e] * this.headR * 4;
      // Suspicious: one brow cocked.
      if (e === 'suspicious' && side > 0) b.position.y += this.headR * 0.08;
    }
    const wide = e === 'alarmed' || e === 'scared' ? 1.25 : e === 'sleepy' ? 0.85 : e === 'love' ? 1.1 : 1;
    for (const eye of this.eyes) eye.userData.wide = wide;
  }

  update(dt: number, speed01: number, running: boolean, grounded: boolean, vy: number, time: number): void {
    const spec = this.spec;
    this.applyEmotion();
    if (this.pose !== this.lastPose) {
      this.lastPose = this.pose;
      this.poseT = 0;
    }
    this.poseT += dt;

    // Gait.
    const freqBase: Record<Gait, number> = {
      hop: 13,
      stomp: 6,
      march: 9,
      bounce: 8,
      waddle: 9,
      sneak: 7,
      glide: 6,
      float: 2,
      hurry: 13,
      strut: 7.5,
      normal: 8.5,
      kid: 12,
    };
    const g = spec.gait;
    const moving = speed01 > 0.05 && grounded;
    const freq = freqBase[g] * (running ? 1.35 : 1);
    if (moving || g === 'float') this.phase += dt * freq * (g === 'float' ? 1 : Math.max(0.5, speed01));
    const p = this.phase;
    const s = Math.sin(p);
    const amp = moving ? Math.min(1, speed01) : 0;

    let legSwing = 0.75 * amp;
    let armSwing = 0.6 * amp;
    let bob = Math.abs(s) * 0.06 * amp;
    let sway = 0;
    let lean = 0.06 * amp;
    let crouch = 0;
    if (g === 'stomp') {
      legSwing = 0.5 * amp;
      armSwing = 0.3 * amp;
      bob = Math.abs(s) * 0.09 * amp;
      sway = s * 0.12 * amp;
    } else if (g === 'march') {
      legSwing = 0.9 * amp;
      armSwing = 0.9 * amp;
      bob = Math.abs(s) * 0.05 * amp;
    } else if (g === 'bounce') {
      bob = Math.abs(s) * 0.22 * amp;
      legSwing = 0.9 * amp;
      armSwing = 1.0 * amp;
      sway = s * 0.15 * amp;
    } else if (g === 'waddle') {
      legSwing = 0.4 * amp;
      sway = s * 0.22 * amp;
      bob = Math.abs(s) * 0.04 * amp;
      armSwing = 0.2 * amp;
    } else if (g === 'sneak') {
      legSwing = 0.55 * amp;
      armSwing = 0.25 * amp;
      crouch = 0.12 + 0.05 * amp;
      lean = 0.35;
    } else if (g === 'glide') {
      legSwing = 0.35 * amp;
      armSwing = 0.2 * amp;
      bob = 0.02 * amp;
      sway = s * 0.05;
    } else if (g === 'float') {
      bob = 0.12 + Math.sin(time * 2.1) * 0.08;
      legSwing = 0;
      armSwing = 0.15 + 0.1 * amp;
      lean = 0.2 * amp;
      sway = Math.sin(time * 1.3) * 0.08;
    } else if (g === 'hurry') {
      lean = 0.22 * amp;
      legSwing = 0.8 * amp;
      armSwing = 0.5 * amp;
    } else if (g === 'strut') {
      lean = -0.1;
      sway = s * 0.08 * amp;
      legSwing = 0.6 * amp;
      armSwing = 0.35 * amp;
    } else if (g === 'hop') {
      bob = Math.abs(s) * 0.12 * amp;
      legSwing = 1.0 * amp;
      armSwing = 0.8 * amp;
    } else if (g === 'kid') {
      bob = Math.abs(s) * 0.08 * amp;
      armSwing = 0.8 * amp;
    }
    if (running) lean += 0.12;

    // Idle breathing.
    const breathe = Math.sin(time * 2.2 + this.phase * 0.1) * 0.015;

    // Airborne.
    let airArms = 0;
    if (!grounded && g !== 'float') {
      legSwing = 0;
      airArms = vy > 0 ? 1 : 0.6;
    }

    // Squash spring.
    this.squashVel += (1 - this.squash) * 180 * dt;
    this.squashVel *= Math.exp(-12 * dt);
    this.squash += this.squashVel * dt;
    const stretch = !grounded && g !== 'float' ? 1 + Math.min(0.15, Math.abs(vy) * 0.012) : 1;
    const sq = this.squash * stretch;
    this.body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));

    this.jiggle = Math.max(0, this.jiggle - dt * 1.5);
    const jig = Math.sin(time * 30) * this.jiggle * 0.2;

    this.hips.position.y = this.legLen * (1 - crouch) + bob + (g === 'float' ? bob : 0);
    this.hips.rotation.set(lean, 0, sway + jig);
    this.torso.rotation.set(0, 0, 0);
    this.torso.scale.set(1 + breathe, 1 - breathe * 0.5, 1 + breathe);

    // Default limb pose.
    let aLx = -s * armSwing - airArms * 2.2;
    let aRx = s * armSwing - airArms * 2.2;
    let aLz = -0.12 - airArms * 0.3;
    let aRz = 0.12 + airArms * 0.3;
    let lLx = s * legSwing;
    let lRx = -s * legSwing;
    let headTilt = 0;
    let headNod = 0;
    let headTurn = 0;
    let bodySpin = 0;
    const t = this.poseT;

    switch (this.pose) {
      case 'lift':
        aLx = aRx = -2.9 + Math.sin(t * 8) * 0.05;
        aLz = -0.4;
        aRz = 0.4;
        break;
      case 'carry':
        aLx = aRx = -3.0;
        aLz = -0.35;
        aRz = 0.35;
        headNod = 0.1;
        break;
      case 'whistle':
        aRx = -1.6;
        aRz = -0.2;
        aLx = -1.4 + Math.sin(t * 20) * 0.08;
        aLz = 0.5;
        headNod = -0.1;
        break;
      case 'point':
        aRx = -1.6;
        aRz = 0.1;
        break;
      case 'perform': {
        // Juggle: arms alternate rapidly, occasional spin.
        aLx = -1.3 + Math.sin(t * 9) * 0.5;
        aRx = -1.3 - Math.sin(t * 9) * 0.5;
        aLz = -0.35;
        aRz = 0.35;
        bodySpin = Math.floor(t / 2) % 2 === 1 ? Math.min(1, (t % 2) * 1.2) * Math.PI * 2 : 0;
        bob += Math.abs(Math.sin(t * 6)) * 0.1;
        this.hips.position.y += Math.abs(Math.sin(t * 6)) * 0.12;
        break;
      }
      case 'cook':
        aRx = -1.2 + Math.sin(t * 12) * 0.35;
        aRz = -0.3 + Math.cos(t * 12) * 0.2;
        aLx = -0.9;
        headNod = 0.25;
        break;
      case 'pick':
        aLx = aRx = -1.4 + Math.sin(t * 25) * 0.08;
        aLz = 0.4;
        aRz = -0.4;
        headNod = 0.35;
        crouch = 0.15;
        this.hips.position.y = this.legLen * 0.82;
        break;
      case 'sing':
        aRx = -2.0;
        aRz = -0.3;
        aLx = -1.6 + Math.sin(t * 2) * 0.3;
        aLz = -1.0 - Math.sin(t * 2) * 0.3;
        headTilt = Math.sin(t * 2.5) * 0.18;
        headNod = -0.15;
        this.hips.rotation.z += Math.sin(t * 2.5) * 0.06;
        break;
      case 'phase':
        aLx = aRx = -1.5;
        aLz = -0.9;
        aRz = 0.9;
        break;
      case 'zap':
        aLx = aRx = -2.6 + Math.sin(t * 30) * 0.12;
        aLz = -0.25;
        aRz = 0.25;
        this.wobble(0.3);
        break;
      case 'proclaim':
        aRx = -2.8;
        aRz = 0.3;
        aLx = -0.5;
        aLz = -0.6;
        headNod = -0.2;
        break;
      case 'cheer':
        aLx = aRx = -2.9;
        aLz = -0.5 - Math.sin(t * 12) * 0.2;
        aRz = 0.5 + Math.sin(t * 12) * 0.2;
        this.hips.position.y += Math.abs(Math.sin(t * 8)) * 0.15;
        break;
      case 'clap': {
        const cl = Math.abs(Math.sin(t * 10));
        aLx = aRx = -1.3;
        aLz = -0.2 + cl * 0.8;
        aRz = 0.2 - cl * 0.8;
        break;
      }
      case 'scared':
        aLx = aRx = -2.6;
        aLz = -0.7;
        aRz = 0.7;
        this.wobble(0.5);
        break;
      case 'shocked':
        aLx = aRx = -0.4;
        aLz = -1.1;
        aRz = 1.1;
        this.wobble(0.8);
        break;
      case 'dance':
        aLx = -2.0 + Math.sin(t * 7) * 0.8;
        aRx = -2.0 - Math.sin(t * 7) * 0.8;
        aLz = -0.6;
        aRz = 0.6;
        lLx = Math.sin(t * 7) * 0.4;
        lRx = -Math.sin(t * 7) * 0.4;
        this.hips.rotation.z += Math.sin(t * 7) * 0.15;
        this.hips.position.y += Math.abs(Math.sin(t * 7)) * 0.1;
        headTilt = Math.sin(t * 7) * 0.2;
        break;
      case 'sit':
        lLx = lRx = -1.5;
        this.hips.position.y = Math.max(0.25, this.legLen * 0.62);
        aLx = aRx = -0.4;
        break;
      case 'eat':
        lLx = lRx = -1.5;
        this.hips.position.y = Math.max(0.25, this.legLen * 0.62);
        aRx = -1.9 + Math.sin(t * 6) * 0.4;
        aRz = -0.5;
        aLx = -0.9;
        headNod = 0.15 + Math.sin(t * 6) * 0.08;
        break;
      case 'sleep':
        lLx = lRx = -1.5;
        this.hips.position.y = Math.max(0.25, this.legLen * 0.62);
        aLx = aRx = -0.3;
        headNod = 0.5;
        headTilt = 0.3;
        this.torso.scale.y = 1 + Math.sin(time * 1.5) * 0.04;
        break;
      case 'flex':
        aLx = aRx = -0.2;
        aLz = -1.6;
        aRz = 1.6;
        this.hips.position.y += Math.sin(t * 6) * 0.03;
        headNod = -0.15;
        break;
      case 'wave':
        aRx = -2.8;
        aRz = 0.4 + Math.sin(t * 10) * 0.35;
        break;
      case 'swoon':
        aLx = -2.0;
        aRx = -2.0;
        aLz = 0.6;
        aRz = -0.6;
        headTilt = 0.3;
        this.hips.rotation.z += Math.sin(t * 3) * 0.08;
        break;
      default:
        break;
    }

    this.armL.rotation.set(aLx, 0, aLz + jig);
    this.armR.rotation.set(aRx, 0, aRz - jig);
    this.legL.rotation.set(lLx, 0, 0);
    this.legR.rotation.set(lRx, 0, 0);
    this.body.rotation.y = bodySpin;

    // Head looks toward lookYaw/lookPitch (relative to body), smoothed.
    const k = 1 - Math.exp(-8 * dt);
    this.curLookYaw += (THREE.MathUtils.clamp(this.lookYaw, -1.1, 1.1) - this.curLookYaw) * k;
    this.curLookPitch += (THREE.MathUtils.clamp(this.lookPitch, -0.5, 0.5) - this.curLookPitch) * k;
    this.head.rotation.set(headNod - this.curLookPitch - lean * 0.6, this.curLookYaw + headTurn, headTilt);

    // Blink + eye aim.
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blinkT = 0.14;
      this.blinkTimer = 2 + ((Math.sin(time * 13.1 + this.phase) + 1) * 1.6);
    }
    this.blinkT = Math.max(0, this.blinkT - dt);
    const blink = this.blinkT > 0 ? 0.12 : 1;
    const sleepy = this.pose === 'sleep' ? 0.1 : this.emotion === 'sleepy' ? 0.55 : 1;
    for (const eye of this.eyes) {
      const wide = (eye.userData.wide as number | undefined) ?? 1;
      eye.scale.set(this.baseEyeScale * wide, this.baseEyeScale * wide * blink * sleepy, this.baseEyeScale * wide);
      eye.rotation.set(-this.curLookPitch * 0.4, this.curLookYaw * 0.35, 0);
      if (this.emotion === 'dazed') eye.rotation.z = time * 8;
    }
    if (this.emotion === 'dazed') this.head.rotation.z += Math.sin(time * 5) * 0.15;
  }

  /** World-space position of the top of the head (for bubbles and icons). */
  topWorld(out: THREE.Vector3): THREE.Vector3 {
    this.head.getWorldPosition(out);
    out.y += this.headR * 1.3 + hatHeight(this.spec.hat.type, this.headR);
    return out;
  }

  handWorld(out: THREE.Vector3): THREE.Vector3 {
    return this.handR.getWorldPosition(out);
  }

  setGhostOpacity(op: number): void {
    if (!this.spec.ghost) return;
    this.mats.ghost.opacity = op;
  }

  dispose(): void {
    for (const m of this.meshes) {
      if (m === this.mouth) continue;
      m.geometry.dispose();
    }
    for (const c of this.heldProp.children) (c as THREE.Mesh).geometry?.dispose();
  }

  get specRef(): CharacterSpec {
    return this.spec;
  }
}

function profileR(T: CharacterSpec['torso'], f: number): number {
  if (f < 0.5) return THREE.MathUtils.lerp(T.bottom, T.mid, f / 0.5);
  return THREE.MathUtils.lerp(T.mid, T.top, Math.min(1, (f - 0.5) / 0.35));
}

function i2c(bands: number, T: CharacterSpec['torso']): string {
  return (bands - 1) % 2 === 0 ? T.color : (T.color2 ?? '#ffffff');
}

export function hatHeight(type: HatType, r: number): number {
  switch (type) {
    case 'police':
      return r * 0.95;
    case 'toque':
      return r * 1.7;
    case 'tophat':
      return r * 1.2;
    case 'ringmaster':
      return r * 1.0;
    case 'guardcap':
      return r * 0.2;
    case 'bonnet':
      return r * 0.3;
    default:
      return 0;
  }
}

let blobGeo: THREE.PlaneGeometry | null = null;
function blobGeometry(): THREE.PlaneGeometry {
  if (!blobGeo) blobGeo = new THREE.PlaneGeometry(1, 1);
  return blobGeo;
}

export { tmpV };
