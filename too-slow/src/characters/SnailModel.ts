import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { RacerProfile } from '../ai/SnailAI';
import { TUNE, type Mode } from '../physics/RacerBody';

const R = TUNE.radius;

/** Everything the model needs to pose itself for one rendered frame. */
export interface SnailPose {
  mode: Mode;
  speed: number;
  /** Forward speed along the facing direction. */
  forwardSpeed: number;
  steer: number;
  grounded: boolean;
  verticalSpeed: number;
  rollAngle: number;
  spinAngle: number;
  boosting: boolean;
  /** Seconds since the last heavy contact, for the dizzy face. */
  sinceHit: number;
  /** Extra yaw while spinning out on a banana. */
  spinOut: number;
  shield: boolean;
}

export type ShellPattern = 'stripes' | 'spots' | 'swirl' | 'solid';
export type HatKind = 'none' | 'crown' | 'cap' | 'flower' | 'propeller' | 'party';

/** Everything the garage can change. */
export interface SnailLook {
  shell: number;
  shellDark: number;
  skin: number;
  pattern: ShellPattern;
  hat: HatKind;
}

export function lookOf(p: RacerProfile): SnailLook {
  return { shell: p.shell, shellDark: p.shellDark, skin: p.skin, pattern: p.pattern ?? 'stripes', hat: p.hat ?? 'none' };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Soft slug body: a tube swept along a spine that rises into the neck and head, with a flat foot. */
function buildBody(skin: THREE.Color): THREE.BufferGeometry {
  // [z, y, radiusX, radiusY]
  const spine: number[][] = [
    [-1.12, 0.05, 0.02, 0.02],
    [-0.92, 0.08, 0.12, 0.07],
    [-0.6, 0.13, 0.22, 0.12],
    [-0.2, 0.19, 0.3, 0.18],
    [0.2, 0.22, 0.32, 0.21],
    [0.5, 0.27, 0.29, 0.23],
    [0.7, 0.4, 0.24, 0.24],
    [0.8, 0.58, 0.215, 0.215],
    [0.84, 0.76, 0.225, 0.225],
    [0.86, 0.9, 0.2, 0.2],
    [0.87, 0.99, 0.12, 0.12],
    [0.875, 1.03, 0.01, 0.01],
  ];
  const curveC = new THREE.CatmullRomCurve3(spine.map((p) => new THREE.Vector3(0, p[1], p[0])));
  const curveR = new THREE.CatmullRomCurve3(spine.map((p) => new THREE.Vector3(p[2], p[3], 0)));
  const rings = 40;
  const segs = 18;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const c = new THREE.Vector3();
  const t = new THREE.Vector3();
  const rad = new THREE.Vector3();
  const belly = skin.clone().lerp(new THREE.Color(0xfff6dc), 0.42);
  const back = skin.clone().multiplyScalar(0.86);
  const col = new THREE.Color();
  for (let i = 0; i <= rings; i += 1) {
    const u = i / rings;
    curveC.getPoint(u, c);
    curveC.getTangent(u, t);
    curveR.getPoint(u, rad);
    // In-plane normal (perpendicular to the spine within the YZ plane).
    const ny = t.z;
    const nz = -t.y;
    for (let j = 0; j <= segs; j += 1) {
      const a = (j / segs) * Math.PI * 2;
      const cx = Math.cos(a);
      const sy = Math.sin(a);
      // Foot skirt: wider and flatter underneath.
      const under = sy < 0 ? 1 : 0;
      const flare = 1 + under * 0.28 * (1 - u * 0.9);
      let x = cx * rad.x * flare;
      let y = c.y + sy * rad.y * ny * (under ? 0.7 : 1);
      const z = c.z + sy * rad.y * nz;
      if (y < 0.012) {
        y = 0.012;
        x *= 1.04;
      }
      positions.push(x, y, z);
      // Lighter belly and foot rim, a slightly darker back, soft freckles.
      const h = THREE.MathUtils.clamp(sy * 0.5 + 0.5, 0, 1);
      col.copy(belly).lerp(skin, THREE.MathUtils.smoothstep(h, 0.04, 0.3)).lerp(back, THREE.MathUtils.smoothstep(h, 0.75, 1) * 0.6);
      const freckle = Math.sin(u * 38 + a * 5) * Math.sin(a * 7 + u * 11);
      if (freckle > 0.82 && h > 0.5 && u < 0.6) col.multiplyScalar(0.9);
      colors.push(col.r, col.g, col.b);
    }
  }
  for (let i = 0; i < rings; i += 1) {
    for (let j = 0; j < segs; j += 1) {
      const a = i * (segs + 1) + j;
      const b = a + segs + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.scale(0.84, 0.84, 0.84);
  geo.computeVertexNormals();
  return geo;
}

/** Spiral shell: a tube swept along a logarithmic spiral in the YZ plane, so it rolls like a wheel about X. */
function buildShell(light: THREE.Color, dark: THREE.Color, pattern: ShellPattern): THREE.BufferGeometry {
  const turns = 2.75;
  const thetaMax = turns * Math.PI * 2;
  const growth = Math.log(2.15) / (Math.PI * 2);
  const rEnd = 0.335;
  const r0 = rEnd / Math.exp(growth * thetaMax);
  const along = 150;
  const around = 14;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const cream = new THREE.Color(0xfff1cf);
  const col = new THREE.Color();
  for (let i = 0; i <= along; i += 1) {
    const u = i / along;
    const th = u * thetaMax;
    const r = r0 * Math.exp(growth * th);
    const rho = r * 0.64;
    // Inner whorls are widened so the whole shell reads as a plump ball.
    const wide = 1.75 * Math.pow(rEnd / r, 0.42);
    const cy = Math.sin(th) * r;
    const cz = Math.cos(th) * r;
    const ey = Math.sin(th);
    const ez = Math.cos(th);
    for (let j = 0; j <= around; j += 1) {
      const a = (j / around) * Math.PI * 2;
      const out = Math.cos(a);
      const side = Math.sin(a);
      positions.push(side * rho * wide, cy + ey * out * rho, cz + ez * out * rho);
      // Pattern, then a cream ridge on the crest and darker seams.
      let k: number;
      if (pattern === 'stripes') k = THREE.MathUtils.smoothstep(0.5 + 0.5 * Math.sin(th * 5.5 + Math.abs(side) * 1.4), 0.25, 0.6);
      else if (pattern === 'swirl') k = THREE.MathUtils.smoothstep(0.5 + 0.5 * Math.sin(a * 2 + th * 3), 0.35, 0.6);
      else if (pattern === 'spots') {
        const spot = Math.sin(th * 7.3 + 0.7) * Math.sin(a * 3 + th * 1.9);
        k = 1 - THREE.MathUtils.smoothstep(spot, 0.45, 0.62);
      } else k = 1 - 0.35 * THREE.MathUtils.smoothstep(Math.abs(Math.sin(th * 5.5)), 0.96, 1);
      col.copy(dark).lerp(light, k);
      col.lerp(cream, THREE.MathUtils.smoothstep(out, 0.55, 1) * 0.32 * (0.4 + u * 0.6));
      col.multiplyScalar(lerp(0.72, 1, THREE.MathUtils.smoothstep(out, -0.9, -0.1)));
      colors.push(col.r, col.g, col.b);
    }
  }
  for (let i = 0; i < along; i += 1) {
    for (let j = 0; j < around; j += 1) {
      const a = i * (around + 1) + j;
      const b = a + around + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

const shared = {
  eyeWhite: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25 }),
  pupil: new THREE.MeshStandardMaterial({ color: 0x1b1320, roughness: 0.2 }),
  shine: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  mouth: new THREE.MeshStandardMaterial({ color: 0x5a2a2a, roughness: 0.6 }),
  cheek: new THREE.MeshStandardMaterial({ color: 0xff8f8f, roughness: 0.8, transparent: true, opacity: 0.75 }),
  eyeGeo: new THREE.SphereGeometry(0.15, 20, 14),
  pupilGeo: new THREE.SphereGeometry(0.1535, 18, 8, 0, Math.PI * 2, 0, 0.6).rotateX(Math.PI / 2),
  shineGeo: new THREE.SphereGeometry(0.03, 8, 6),
  lidGeo: new THREE.SphereGeometry(0.159, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.42),
  stalkGeo: new THREE.CylinderGeometry(0.036, 0.052, 0.25, 10, 1).translate(0, 0.125, 0),
  feelerGeo: new THREE.CylinderGeometry(0.02, 0.034, 0.14, 8, 1).translate(0, 0.07, 0),
  feelerTip: new THREE.SphereGeometry(0.03, 8, 6),
  cheekGeo: new THREE.SphereGeometry(0.055, 10, 8),
  smileGeo: new THREE.TorusGeometry(0.075, 0.014, 6, 16, Math.PI),
  ohGeo: new THREE.TorusGeometry(0.04, 0.016, 6, 16),
};

interface Eye {
  base: THREE.Group;
  mid: THREE.Group;
  ball: THREE.Group;
  lid: THREE.Mesh;
  pupil: THREE.Mesh;
  side: number;
}

export class SnailModel {
  /** Placed at the ground contact point; +Z faces forward, +Y is the ground normal. */
  readonly root = new THREE.Group();
  private readonly tilt = new THREE.Group();
  private readonly bodyGroup = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly shellPivot = new THREE.Group();
  private readonly shellSpin = new THREE.Group();
  private readonly eyes: Eye[] = [];
  private readonly smile: THREE.Mesh;
  private readonly oh: THREE.Mesh;
  private readonly skinMat: THREE.MeshStandardMaterial;
  private readonly shellMat: THREE.MeshPhysicalMaterial;
  private readonly skinFlat: THREE.MeshStandardMaterial;
  private readonly lipMat: THREE.MeshStandardMaterial;
  private readonly plugMat: THREE.MeshStandardMaterial;
  private readonly bodyMesh: THREE.Mesh;
  private readonly shellMesh: THREE.Mesh;
  private readonly bubble: THREE.Mesh;
  private hat: THREE.Group | null = null;
  private propeller: THREE.Object3D | null = null;
  private retract = 0;
  private crawlPhase = 0;
  private squash = 0;
  private squashVel = 0;
  private blink = 0;
  private nextBlink = 2;
  private lean = 0;
  private stalkLagX = 0;
  private stalkLagZ = 0;
  private lastSpeed = 0;
  private time = 0;
  private stretch = 0;

  constructor(profile: RacerProfile, seedPhase: number) {
    const skin = new THREE.Color(profile.skin);
    this.time = seedPhase * 3.7;
    this.nextBlink = 1 + seedPhase * 2;
    this.skinMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0 });
    const skinFlat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.42 });
    this.skinFlat = skinFlat;
    this.shellMat = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      roughness: 0.32,
      clearcoat: 0.7,
      clearcoatRoughness: 0.25,
      emissive: new THREE.Color(profile.shell),
      emissiveIntensity: 0,
    });

    const body = new THREE.Mesh(buildBody(skin), this.skinMat);
    this.bodyMesh = body;
    body.castShadow = true;
    body.name = 'snailBody';
    this.bodyGroup.add(body);

    // Head parts ride on a pivot at the neck so the whole face can nod and look.
    this.head.position.set(0, 0.675, 0.725);
    this.head.scale.setScalar(0.9);
    this.bodyGroup.add(this.head);
    for (const side of [-1, 1]) {
      const base = new THREE.Group();
      base.position.set(side * 0.1, 0.14, 0.0);
      const lower = new THREE.Mesh(shared.stalkGeo, skinFlat);
      lower.castShadow = true;
      base.add(lower);
      const mid = new THREE.Group();
      mid.position.y = 0.24;
      base.add(mid);
      const upper = new THREE.Mesh(shared.stalkGeo, skinFlat);
      upper.scale.set(0.82, 0.9, 0.82);
      mid.add(upper);
      const ball = new THREE.Group();
      ball.position.y = 0.3;
      mid.add(ball);
      const white = new THREE.Mesh(shared.eyeGeo, shared.eyeWhite);
      white.castShadow = true;
      ball.add(white);
      const pupil = new THREE.Mesh(shared.pupilGeo, shared.pupil);
      ball.add(pupil);
      const shine = new THREE.Mesh(shared.shineGeo, shared.shine);
      shine.position.set(0.04, 0.05, 0.142);
      ball.add(shine);
      const lid = new THREE.Mesh(shared.lidGeo, skinFlat);
      lid.rotation.x = -1.25;
      ball.add(lid);
      this.head.add(base);
      this.eyes.push({ base, mid, ball, lid, pupil, side });

      const feeler = new THREE.Mesh(shared.feelerGeo, skinFlat);
      feeler.position.set(side * 0.085, -0.13, 0.17);
      feeler.rotation.set(1.25, 0, -side * 0.35);
      const tip = new THREE.Mesh(shared.feelerTip, skinFlat);
      tip.position.y = 0.14;
      feeler.add(tip);
      this.head.add(feeler);

      const cheek = new THREE.Mesh(shared.cheekGeo, shared.cheek);
      cheek.position.set(side * 0.15, -0.03, 0.15);
      cheek.scale.set(1, 0.7, 0.4);
      this.head.add(cheek);
    }
    this.smile = new THREE.Mesh(shared.smileGeo, shared.mouth);
    this.smile.position.set(0, -0.02, 0.215);
    this.smile.rotation.set(-0.25, 0, Math.PI);
    this.head.add(this.smile);
    this.oh = new THREE.Mesh(shared.ohGeo, shared.mouth);
    this.oh.position.set(0, -0.06, 0.215);
    this.oh.rotation.x = -0.2;
    this.oh.visible = false;
    this.head.add(this.oh);

    const shell = new THREE.Mesh(buildShell(new THREE.Color(profile.shell), new THREE.Color(profile.shellDark), profile.pattern ?? 'stripes'), this.shellMat);
    this.shellMesh = shell;
    shell.castShadow = true;
    shell.name = 'snailShell';
    this.shellSpin.add(shell);
    // Mouth of the shell: a soft lip and a dark interior where the body tucks in.
    this.lipMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(profile.shellDark).lerp(new THREE.Color(0xfff1cf), 0.25), roughness: 0.4 });
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.026, 8, 20), this.lipMat);
    lip.position.set(0, -0.335, 0.0);
    lip.scale.set(1.7, 1, 1);
    this.shellSpin.add(lip);
    this.plugMat = new THREE.MeshStandardMaterial({ color: skin.clone().multiplyScalar(0.55), roughness: 0.7 });
    const plug = new THREE.Mesh(new THREE.CircleGeometry(0.2, 18), this.plugMat);
    plug.position.set(0, -0.335, 0.01);
    plug.scale.set(1.7, 1, 1);
    this.shellSpin.add(plug);
    this.shellPivot.add(this.shellSpin);

    // Shell Shield bubble.
    this.bubble = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 16),
      new THREE.MeshPhysicalMaterial({ color: 0x9fe0ff, transparent: true, opacity: 0.28, roughness: 0.05, clearcoat: 1, emissive: 0x3aa8ff, emissiveIntensity: 0.25, depthWrite: false }),
    );
    this.bubble.visible = false;
    this.bubble.renderOrder = 3;

    this.tilt.add(this.bodyGroup, this.shellPivot);
    this.root.add(this.tilt, this.bubble);
    this.root.name = `snail-${profile.name}`;
    this.setHat(profile.hat ?? 'none', new THREE.Color(profile.shell));
  }

  /** Repaint and re-hat the snail (garage). */
  setLook(look: SnailLook): void {
    const skin = new THREE.Color(look.skin);
    const old = [this.bodyMesh.geometry, this.shellMesh.geometry];
    this.bodyMesh.geometry = buildBody(skin);
    this.shellMesh.geometry = buildShell(new THREE.Color(look.shell), new THREE.Color(look.shellDark), look.pattern);
    for (const g of old) g.dispose();
    this.skinFlat.color.copy(skin);
    this.plugMat.color.copy(skin).multiplyScalar(0.55);
    this.lipMat.color.set(look.shellDark).lerp(new THREE.Color(0xfff1cf), 0.25);
    this.shellMat.emissive.set(look.shell);
    this.setHat(look.hat, new THREE.Color(look.shell));
  }

  private setHat(kind: HatKind, accent: THREE.Color): void {
    if (this.hat) {
      this.head.remove(this.hat);
      this.hat.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          (m.material as THREE.Material).dispose();
        }
      });
    }
    this.hat = buildHat(kind, accent);
    this.propeller = this.hat?.getObjectByName('propeller') ?? null;
    if (this.hat) this.head.add(this.hat);
  }

  /** Kick the squash-and-stretch spring (landings, bumps). */
  impact(strength: number): void {
    this.squashVel -= Math.min(1.4, strength) * 5;
  }

  update(dt: number, pose: SnailPose): void {
    this.time += dt;
    const t = this.time;
    const rolling = pose.mode === 'roll';
    const sliding = pose.mode === 'slide';
    const airborne = !pose.grounded;

    // --- retract in / out of the shell
    this.retract = THREE.MathUtils.clamp(this.retract + (rolling ? 1 : -1) * dt * 5.5, 0, 1);
    const r = this.retract * this.retract * (3 - 2 * this.retract);
    const out = 1 - r;
    this.bodyGroup.visible = out > 0.03;
    // The body shrinks toward the shell mouth as it tucks in.
    this.bodyGroup.scale.set(lerp(0.2, 1, out), lerp(0.25, 1, out), lerp(0.08, 1, out));
    this.bodyGroup.position.set(0, lerp(0.2, 0, out), lerp(-0.12, 0, out));

    // --- squash & stretch spring
    // Sub-stepped so the spring stays stable when a frame takes a long time.
    for (let left = Math.min(dt, 0.3); left > 1e-5; left -= 1 / 120) {
      const h = Math.min(left, 1 / 120);
      this.squashVel += (-this.squash * 190 - this.squashVel * 13) * h;
      this.squash += this.squashVel * h;
    }
    if (!Number.isFinite(this.squash)) {
      this.squash = 0;
      this.squashVel = 0;
    }
    const sq = THREE.MathUtils.clamp(this.squash, -0.45, 0.4);
    this.root.scale.set(1 - sq * 0.55, 1 + sq, 1 - sq * 0.55);

    // --- crawl: peristaltic stretch & contract
    const crawlAmt = out * (sliding ? 0 : 1) * Math.min(1, Math.abs(pose.forwardSpeed) / 1.5);
    this.crawlPhase += pose.forwardSpeed * dt * 3.2;
    const wave = Math.sin(this.crawlPhase);
    const breath = Math.sin(t * 2.1) * 0.018 * out;
    this.stretch = lerp(this.stretch, sliding ? 0.14 : airborne && !rolling ? 0.08 : 0, Math.min(1, dt * 8));
    const bodyZ = 1 + wave * 0.075 * crawlAmt + this.stretch;
    const bodyY = 1 - wave * 0.05 * crawlAmt + breath - this.stretch * 0.5;
    this.bodyGroup.scale.z *= bodyZ;
    this.bodyGroup.scale.y *= bodyY;

    // --- lean into turns (slide leans hard, crawl barely)
    const leanTarget = -pose.steer * (sliding ? 0.42 : rolling ? 0.3 : 0.06) * Math.min(1, pose.speed / 6 + 0.2);
    this.lean = lerp(this.lean, leanTarget, Math.min(1, dt * 7));
    this.tilt.rotation.z = this.lean;
    this.tilt.rotation.y = pose.spinAngle + pose.spinOut;
    if (this.propeller) this.propeller.rotation.y += dt * (6 + pose.speed * 1.5);
    this.bubble.visible = pose.shield;
    if (pose.shield) {
      this.bubble.position.y = lerp(0.62, R, r);
      this.bubble.scale.setScalar(lerp(1.05, 0.85, r) * (1 + Math.sin(t * 6) * 0.03));
    }
    this.tilt.position.y = rolling ? 0 : 0;

    // --- shell: sits on the back when crawling, becomes the wheel when rolling
    this.shellPivot.position.set(0, lerp(0.63, R, r), lerp(-0.1, 0, r));
    const wobble = Math.sin(this.crawlPhase + 0.6) * 0.035 * crawlAmt + breath * 0.8;
    this.shellPivot.rotation.x = lerp(-0.28 + wobble, 0, r);
    this.shellPivot.scale.setScalar(lerp(1.14, 1.12, r));
    this.shellSpin.rotation.x = r > 0.05 ? pose.rollAngle : 0;
    this.shellMat.emissiveIntensity = lerp(this.shellMat.emissiveIntensity, pose.boosting ? 0.55 : 0, Math.min(1, dt * 6));

    // --- head, eye stalks and face
    const accel = (pose.speed - this.lastSpeed) / Math.max(dt, 1e-3);
    this.lastSpeed = pose.speed;
    const lagZTarget = THREE.MathUtils.clamp(-accel * 0.03 - pose.speed * 0.022 + (airborne ? pose.verticalSpeed * 0.04 : 0), -0.9, 0.7);
    const lagXTarget = THREE.MathUtils.clamp(pose.steer * 0.35 * Math.min(1, pose.speed / 4), -0.5, 0.5);
    this.stalkLagZ = lerp(this.stalkLagZ, lagZTarget, Math.min(1, dt * 6));
    this.stalkLagX = lerp(this.stalkLagX, lagXTarget, Math.min(1, dt * 5));

    this.head.rotation.x = Math.sin(this.crawlPhase - 0.8) * 0.08 * crawlAmt + Math.sin(t * 1.3) * 0.03 + (sliding ? 0.25 : 0);
    this.head.rotation.y = Math.sin(t * 0.7) * 0.12 * (1 - Math.min(1, pose.speed / 3)) - this.stalkLagX * 0.4;

    this.blink -= dt;
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.blink = 0.14;
      this.nextBlink = 1.6 + ((t * 7.3) % 3);
    }
    const dizzy = pose.sinceHit < 0.9;
    const surprised = airborne && !rolling;
    const focus = THREE.MathUtils.clamp((pose.speed - 8) / 14, 0, 1);
    const lidOpen = this.blink > 0 ? 0.05 : dizzy ? 0.45 : surprised ? 1.25 : lerp(1, 0.62, focus);
    for (const eye of this.eyes) {
      const sway = Math.sin(t * 1.7 + eye.side) * 0.06;
      eye.base.rotation.set(0.12 + this.stalkLagZ * 0.55 + sway * 0.5, 0, -eye.side * 0.3 - this.stalkLagX * 0.5 + sway * eye.side * 0.4);
      eye.mid.rotation.set(-0.1 + this.stalkLagZ * 0.75, 0, -eye.side * 0.12 - this.stalkLagX * 0.6);
      // Lid: a hemisphere rolled back over the top of the eye; closing rotates it forward.
      eye.lid.rotation.x = lerp(1.3, -1.75, Math.min(1.25, lidOpen));
      eye.lid.rotation.z = eye.side * focus * 0.35;
      const look = dizzy ? Math.sin(t * 18 + eye.side * 1.5) * 0.05 : Math.sin(t * 0.9 + 1) * 0.02;
      eye.pupil.rotation.set(dizzy ? Math.cos(t * 18 + eye.side * 1.5) * 0.4 : -0.05, look * 7 - this.stalkLagX * 0.3 - eye.side * 0.08, 0);
      eye.ball.scale.setScalar(surprised ? 1.14 : 1);
    }
    this.smile.visible = !surprised && !dizzy;
    this.oh.visible = surprised || dizzy;
    this.smile.scale.setScalar(lerp(1, 1.25, focus));
  }

  dispose(): void {
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && (mesh.name === 'snailBody' || mesh.name === 'snailShell')) mesh.geometry.dispose();
    });
    this.setHat('none', new THREE.Color());
    this.skinMat.dispose();
    this.shellMat.dispose();
  }
}

type Part = { geo: THREE.BufferGeometry; color: number | THREE.Color };

/** Little hats, sized for the head (sits between the eye stalks, tipped back a touch). One draw call each. */
function buildHat(kind: HatKind, accent: THREE.Color): THREE.Group | null {
  if (kind === 'none') return null;
  const g = new THREE.Group();
  g.position.set(0, 0.19, -0.04);
  g.rotation.x = -0.18;
  // Chunky enough to read between the eye stalks at chase-camera distance.
  g.scale.setScalar(1.5);
  const parts: Part[] = [];
  const add = (geo: THREE.BufferGeometry, color: number | THREE.Color, x = 0, y = 0, z = 0) => {
    geo.translate(x, y, z);
    parts.push({ geo, color });
    return geo;
  };
  let shiny = false;
  if (kind === 'crown') {
    shiny = true;
    add(new THREE.CylinderGeometry(0.105, 0.095, 0.07, 14, 1, false), 0xffc928, 0, 0.035, 0);
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2;
      add(new THREE.ConeGeometry(0.026, 0.07, 6), 0xffc928, Math.sin(a) * 0.1, 0.1, Math.cos(a) * 0.1);
      add(new THREE.SphereGeometry(0.016, 8, 6), i % 2 ? 0x3fa0ff : 0xff3a5a, Math.sin(a) * 0.104, 0.035, Math.cos(a) * 0.104);
    }
  } else if (kind === 'cap') {
    add(new THREE.SphereGeometry(0.115, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), accent);
    add(new THREE.CylinderGeometry(0.1, 0.1, 0.014, 18).scale(1, 1, 0.9), accent, 0, 0.004, 0.085);
    add(new THREE.SphereGeometry(0.02, 8, 6), 0xffffff, 0, 0.115, 0);
  } else if (kind === 'flower') {
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2;
      const petal = new THREE.SphereGeometry(1, 10, 6).scale(0.055, 0.018, 0.032).rotateY(-a);
      add(petal, 0xff8fc8, Math.cos(a) * 0.06, 0.04, Math.sin(a) * 0.06);
    }
    add(new THREE.SphereGeometry(0.035, 10, 8), 0xffd23a, 0, 0.05, 0);
    add(new THREE.CylinderGeometry(0.008, 0.01, 0.05, 6), 0x4d9a3a, 0, 0.02, 0);
  } else if (kind === 'propeller') {
    add(new THREE.SphereGeometry(0.1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.8, 1), 0x3fa0ff);
    add(new THREE.CylinderGeometry(0.008, 0.008, 0.09, 6), 0xffd23a, 0, 0.1, 0);
    const blades: Part[] = [];
    for (const [s, col] of [
      [1, 0xff4a3a],
      [-1, 0x7ad65a],
    ] as const) {
      blades.push({ geo: new THREE.BoxGeometry(0.11, 0.006, 0.035).rotateX(s * 0.35).translate(s * 0.06, 0, 0), color: col });
    }
    const prop = new THREE.Mesh(mergeColored(blades), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45 }));
    prop.name = 'propeller';
    prop.position.y = 0.145;
    g.add(prop);
  } else if (kind === 'party') {
    const cone = new THREE.ConeGeometry(0.075, 0.2, 16, 6).translate(0, 0.1, 0);
    parts.push({ geo: cone, color: accent });
    add(new THREE.SphereGeometry(0.03, 10, 8), 0xffd23a, 0, 0.205, 0);
    const merged = mergeColored(parts);
    const col = merged.getAttribute('color');
    const mp = merged.getAttribute('position');
    const cream = new THREE.Color(0xfff1cf);
    // Stripes: alternate bands of the cone by height (the pompom sits above them).
    for (let i = 0; i < mp.count; i += 1) {
      if (mp.getY(i) < 0.19 && Math.floor(mp.getY(i) * 30) % 2) col.setXYZ(i, cream.r, cream.g, cream.b);
    }
    const m = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, flatShading: true }));
    g.add(m);
    return g;
  }
  const mesh = new THREE.Mesh(mergeColored(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: shiny ? 0.25 : 0.45, metalness: shiny ? 0.55 : 0 }));
  g.add(mesh);
  return g;
}

function mergeColored(parts: Part[]): THREE.BufferGeometry {
  const geos = parts.map(({ geo, color }) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g.getAttribute('uv')) g.deleteAttribute('uv');
    const c = new THREE.Color(color);
    const n = g.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  });
  return mergeGeometries(geos)!;
}
