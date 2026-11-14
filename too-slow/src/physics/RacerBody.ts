import * as THREE from 'three';
import { SURFACES, TRACK_EDGE, track, type Surface } from '../world/Track';

export type Mode = 'crawl' | 'roll' | 'slide';

/** One frame of control intent. The player and the AI both drive racers through this. */
export interface Intent {
  /** -1 (left) … +1 (right). */
  steer: number;
  /** -1 (brake / reverse) … +1 (crawl forward). Ignored while rolling. */
  throttle: number;
  /** Edge-triggered: toggle between shell and crawl. */
  toggleRoll: boolean;
  /** Held: slime slide. */
  slide: boolean;
  /** Edge-triggered: shell boost. */
  boost: boolean;
  /** Airborne trick spin, -1 (Q) … +1 (E). */
  spin: number;
  /** Edge-triggered: use the held item. */
  useItem: boolean;
}

/** Kart-style pickups from item boxes. */
export type ItemKind = 'mushroom' | 'banana' | 'acorn' | 'slime' | 'shield';

export function emptyIntent(): Intent {
  return { steer: 0, throttle: 0, toggleRoll: false, slide: false, boost: false, spin: 0, useItem: false };
}

export type RacerEventType =
  | 'land'
  | 'hardLand'
  | 'perfect'
  | 'sloppy'
  | 'trick'
  | 'bigAir'
  | 'jump'
  | 'hit'
  | 'boing'
  | 'bump'
  | 'boost'
  | 'splash'
  | 'enterShell'
  | 'exitShell'
  | 'slideStart'
  | 'respawn'
  | 'pad'
  | 'driftCharge'
  | 'miniturbo'
  | 'mushroom'
  | 'spinout'
  | 'shieldBlock';

export interface RacerEvent {
  type: RacerEventType;
  value: number;
}

/** Tuned constants. Units: world units, seconds. */
export const TUNE = {
  radius: 0.55,
  gravity: 28,
  airDrag: 0.0042,
  crawlMax: 3.1,
  crawlAccel: 9,
  crawlBrake: 11,
  crawlTurn: 2.5,
  rollTurnMax: 2.6,
  rollLatAccel: 17,
  rollScrub: 0.085,
  rollBrake: 8,
  slideLatAccel: 10,
  slideTurn: 2.1,
  slideFriction: 0.2,
  slideDrain: 0.21,
  slimeRegenCrawl: 0.16,
  slimeRegenRoll: 0.035,
  boostImpulse: 10,
  boostTime: 1.8,
  boostThrust: 3.5,
  boostChargeBase: 0.01,
  boostChargeSpeed: 0.0016,
  airSteer: 4,
  spinRate: 9.5,
  offTrackTime: 2.5,
  /** Boost pad: speed added, minimum speed out, and how long the drag break lasts. */
  padKick: 6,
  padMinSpeed: 20,
  padTime: 0.9,
  /** Drift mini-turbo: seconds of steered sliding for each spark level, and the kick it pays. */
  driftLevel1: 0.75,
  driftLevel2: 1.6,
  driftKick1: 4,
  driftKick2: 7.5,
  mushroomKick: 11,
  mushroomTime: 1.4,
};

const IDLE: Intent = emptyIntent();

const tmpN = new THREE.Vector3();
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const proj = { s: 0, d: 0 };

function moveToward(v: number, target: number, maxDelta: number): number {
  if (Math.abs(target - v) <= maxDelta) return target;
  return v + Math.sign(target - v) * maxDelta;
}

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class RacerBody {
  readonly pos = new THREE.Vector3();
  readonly prevPos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  readonly normal = new THREE.Vector3(0, 1, 0);
  /** Facing yaw; forward = (sin, 0, -cos). */
  heading = 0;
  prevHeading = 0;
  mode: Mode = 'crawl';
  grounded = true;
  /** Seconds since last ground contact. */
  airTime = 0;
  /** Seconds since leaving the ground for the current flight (0 while grounded). */
  flightTime = 0;
  slime = 1;
  boost = 0;
  boostTimer = 0;
  spinAngle = 0;
  spinVel = 0;
  steer = 0;
  s = 0;
  d = 0;
  hint = -1;
  surface: Surface = 'grass';
  speed = 0;
  /** Total shell rotation this race (radians), drives the boost meter and the shell spin visual. */
  rollAngle = 0;
  offTrack = 0;
  checkpointS = 0;
  finished = false;
  finishTime = 0;
  maxSpeed = 0;
  tricks = 0;
  trickScore = 0;
  slideLocked = false;
  frozen = true;
  /** Held item, and seconds left on the item-box roulette before it is decided. */
  item: ItemKind | null = null;
  itemRoulette = 0;
  /** Seconds left of the spin-out after a banana or acorn hit; inputs are ignored meanwhile. */
  spinOut = 0;
  private spinOutDur = 1;
  /** Visual yaw added during a spin-out (eases out to a whole number of turns). */
  spinOutAngle = 0;
  driftCharge = 0;
  /** 0 none, 1 blue sparks, 2 orange sparks. */
  driftLevel = 0;
  private padCooldown = 0;
  /** Seconds left of Super Slime (sliding drains nothing). */
  superSlime = 0;
  /** Seconds left of the acorn-shell shield. */
  shield = 0;
  readonly events: RacerEvent[] = [];

  constructor(readonly index: number) {}

  place(s: number, d: number): void {
    track.toWorld(s, d, this.pos);
    this.pos.y += TUNE.radius;
    this.prevPos.copy(this.pos);
    this.vel.set(0, 0, 0);
    this.heading = this.prevHeading = track.heading(s);
    this.hint = track.project(this.pos.x, this.pos.z, -1, proj);
    this.s = proj.s;
    this.d = proj.d;
    this.mode = 'crawl';
    this.grounded = true;
    this.airTime = 0;
    this.flightTime = 0;
    this.spinAngle = 0;
    this.spinVel = 0;
    this.steer = 0;
    this.speed = 0;
    this.offTrack = 0;
    this.boostTimer = 0;
    this.spinOut = 0;
    this.spinOutAngle = 0;
    this.driftCharge = 0;
    this.driftLevel = 0;
    this.padCooldown = 0;
    track.normal(this.s, this.d, this.normal);
  }

  reset(s: number, d: number): void {
    this.place(s, d);
    this.slime = 1;
    this.boost = 0;
    this.rollAngle = 0;
    this.checkpointS = s;
    this.finished = false;
    this.finishTime = 0;
    this.maxSpeed = 0;
    this.tricks = 0;
    this.trickScore = 0;
    this.slideLocked = false;
    this.frozen = true;
    this.item = null;
    this.itemRoulette = 0;
    this.superSlime = 0;
    this.shield = 0;
    this.events.length = 0;
  }

  respawn(): void {
    const lane = (this.index - 2.5) * 1.6;
    this.place(this.checkpointS, lane);
    this.emit('respawn', 0);
  }

  emit(type: RacerEventType, value: number): void {
    if (this.events.length < 16) this.events.push({ type, value });
  }

  get forwardX(): number {
    return Math.sin(this.heading);
  }

  get forwardZ(): number {
    return -Math.cos(this.heading);
  }

  step(dt: number, intent: Intent): void {
    this.prevPos.copy(this.pos);
    this.prevHeading = this.heading;
    if (this.frozen) return;

    this.padCooldown -= dt;
    if (this.superSlime > 0) this.superSlime -= dt;
    if (this.shield > 0) this.shield -= dt;
    if (this.spinOut > 0) {
      // Spinning out: hands off the controls while the shell skids and twirls.
      this.spinOut -= dt;
      const p = 1 - Math.max(0, this.spinOut) / this.spinOutDur;
      this.spinOutAngle = Math.PI * 4 * (1 - (1 - p) * (1 - p));
      if (this.spinOut <= 0) this.spinOutAngle = 0;
      intent = IDLE;
      if (this.airTime < 0.07) {
        const k = Math.exp(-1.4 * dt);
        this.vel.x *= k;
        this.vel.z *= k;
      }
    }

    const contact = this.airTime < 0.07;
    const steerTarget = Math.max(-1, Math.min(1, intent.steer));
    this.steer = moveToward(this.steer, steerTarget, dt * (steerTarget === 0 ? 9 : 7));

    this.updateMode(intent, contact);

    const vel = this.vel;
    vel.y -= TUNE.gravity * dt;
    const surf = SURFACES[this.surface];

    if (contact) {
      if (this.mode === 'crawl') this.crawlForces(dt, intent, surf.roll, surf.crawl);
      else if (this.mode === 'roll') this.rollForces(dt, surf.roll, surf.grip, intent.throttle < -0.1);
      else this.slideForces(dt, surf.roll, surf.grip);
      if (intent.boost && this.boost >= 1 && this.mode !== 'crawl') this.fireBoost();
    } else {
      this.airForces(dt, intent);
    }

    if (this.boostTimer > 0) {
      this.boostTimer -= dt;
      const sp = Math.hypot(vel.x, vel.z);
      if (sp > 1 && contact) {
        vel.x += (vel.x / sp) * TUNE.boostThrust * dt;
        vel.z += (vel.z / sp) * TUNE.boostThrust * dt;
      }
    }

    this.pos.addScaledVector(vel, dt);
    this.resolveGround(dt);

    this.speed = vel.length();
    if (this.speed > this.maxSpeed) this.maxSpeed = this.speed;

    // Out of bounds: a short grace period, then back to the last checkpoint.
    if (Math.abs(this.d) > TRACK_EDGE || this.pos.y < track.height(this.s, this.d) - 3) this.offTrack += dt;
    else this.offTrack = Math.max(0, this.offTrack - dt * 2);
    if (this.offTrack > TUNE.offTrackTime && !this.finished) this.respawn();
  }

  private updateMode(intent: Intent, contact: boolean): void {
    if (this.slime >= 0.15) this.slideLocked = false;
    const wantSlide = intent.slide && !this.slideLocked && this.slime > 0;
    if (this.mode === 'slide') {
      if (!wantSlide) {
        this.releaseDrift();
        const sp = this.vel.length();
        this.mode = sp > 5 ? 'roll' : 'crawl';
        if (this.mode === 'roll') this.emit('enterShell', 0);
      }
    } else if (wantSlide && contact) {
      this.mode = 'slide';
      this.emit('slideStart', 0);
    } else if (intent.toggleRoll) {
      if (this.mode === 'crawl') {
        this.mode = 'roll';
        this.emit('enterShell', 0);
      } else if (contact) {
        this.mode = 'crawl';
        this.emit('exitShell', 0);
      }
    }
  }

  private crawlForces(dt: number, intent: Intent, roll: number, crawlMul: number): void {
    const n = this.normal;
    const vel = this.vel;
    const sp = vel.length();
    // Above crawl pace the foot cannot bite into the turn as hard.
    this.heading += this.steer * TUNE.crawlTurn * dt * (sp > 6 ? 6 / sp : 1);
    const f = tmpA.set(this.forwardX, 0, this.forwardZ);
    f.addScaledVector(n, -f.dot(n)).normalize();
    let vf = vel.dot(f);
    const vn = vel.dot(n);
    const side = tmpB.copy(vel).addScaledVector(f, -vf).addScaledVector(n, -vn);
    const max = TUNE.crawlMax * crawlMul;
    const throttle = Math.max(-1, Math.min(1, intent.throttle));
    if (vf > max + 0.3) {
      // Came out of the shell at speed: the foot grips and scrubs it off progressively.
      const brake = TUNE.crawlBrake + roll * TUNE.gravity + (throttle < 0 ? 8 : 0);
      vf = Math.max(max, vf - brake * dt);
    } else {
      const target = throttle >= 0 ? throttle * max : throttle * 1.2;
      vf = moveToward(vf, target, TUNE.crawlAccel * dt);
    }
    side.multiplyScalar(Math.exp(-10 * dt));
    vel.copy(side).addScaledVector(f, vf).addScaledVector(n, vn);
    this.slime = Math.min(1, this.slime + TUNE.slimeRegenCrawl * dt);
  }

  private rollForces(dt: number, roll: number, grip: number, braking: boolean): void {
    const vel = this.vel;
    const n = this.normal;
    let sp = vel.length();
    if (sp < 0.05) {
      // A resting shell can still be aimed, but W never pushes it.
      this.heading += this.steer * 1.6 * dt;
      return;
    }
    const boosting = this.boostTimer > 0;
    // S drags the shell's lip along the ground: the only brake a rolling snail has.
    const resist = roll * TUNE.gravity + TUNE.airDrag * sp * sp * (boosting ? 0.45 : 1) + (braking ? TUNE.rollBrake : 0);
    // Steering is a lateral force: it rotates momentum, it never creates it.
    const lat = this.steer * Math.min(TUNE.rollTurnMax * sp, TUNE.rollLatAccel * grip);
    const right = tmpA.copy(vel).cross(n).normalize();
    vel.addScaledVector(right, lat * dt);
    const after = vel.length();
    const newSp = Math.max(0, sp - (resist + TUNE.rollScrub * Math.abs(lat)) * dt);
    vel.multiplyScalar(newSp / after);
    sp = newSp;
    if (sp > 1.2) this.heading += wrapAngle(Math.atan2(vel.x, -vel.z) - this.heading) * Math.min(1, dt * 14);
    this.rollAngle += (sp / TUNE.radius) * dt;
    if (sp > 6) this.boost = Math.min(1, this.boost + (TUNE.boostChargeBase + TUNE.boostChargeSpeed * sp) * dt);
    this.slime = Math.min(1, this.slime + TUNE.slimeRegenRoll * dt);
  }

  private slideForces(dt: number, roll: number, grip: number): void {
    const vel = this.vel;
    const n = this.normal;
    const sp = vel.length();
    if (this.superSlime > 0) this.slime = 1;
    else this.slime -= TUNE.slideDrain * dt;
    if (this.slime <= 0) {
      this.slime = 0;
      this.slideLocked = true;
    }
    if (sp < 0.05) return;
    const velYaw = Math.atan2(vel.x, -vel.z);
    // The body swings ahead of the momentum (drift), capped so it cannot spin out.
    this.heading += this.steer * TUNE.slideTurn * dt;
    let lead = wrapAngle(this.heading - velYaw);
    lead = Math.max(-0.65, Math.min(0.65, lead));
    if (this.steer === 0) lead = moveToward(lead, 0, dt * 1.5);
    this.heading = velYaw + lead;
    const lat = Math.max(-1, Math.min(1, lead * 2.4)) * Math.min(TUNE.rollTurnMax * sp, TUNE.slideLatAccel * Math.max(0.75, grip));
    const right = tmpA.copy(vel).cross(n).normalize();
    vel.addScaledVector(right, lat * dt);
    const after = vel.length();
    const resist = Math.max(0.004, roll * TUNE.slideFriction) * TUNE.gravity + TUNE.airDrag * 0.8 * sp * sp * (this.boostTimer > 0 ? 0.5 : 1);
    vel.multiplyScalar(Math.max(0, sp - resist * dt) / after);

    // Drift charge: hold a steered slide at speed and the sparks go blue, then orange.
    if (Math.abs(this.steer) > 0.45 && sp > 8) this.driftCharge += dt;
    else this.driftCharge = Math.max(0, this.driftCharge - dt * 0.8);
    const level = this.driftCharge >= TUNE.driftLevel2 ? 2 : this.driftCharge >= TUNE.driftLevel1 ? 1 : 0;
    if (level > this.driftLevel) this.emit('driftCharge', level);
    this.driftLevel = level;
  }

  /** Letting go of a charged drift pays out a mini-turbo. */
  private releaseDrift(): void {
    if (this.driftLevel > 0 && this.airTime < 0.2) {
      const two = this.driftLevel === 2;
      this.kick(two ? TUNE.driftKick2 : TUNE.driftKick1, two ? 1.0 : 0.6, 0);
      this.emit('miniturbo', this.driftLevel);
    }
    this.driftCharge = 0;
    this.driftLevel = 0;
  }

  /** Add speed along the direction of travel (or facing, from rest) and open a low-drag window. */
  kick(add: number, time: number, minSpeed: number): void {
    const vel = this.vel;
    const sp = vel.length();
    const target = Math.max(sp + add, minSpeed);
    if (sp > 3) vel.multiplyScalar(target / sp);
    else {
      const phi = track.heading(this.s);
      const fx = sp > 0.5 ? vel.x / sp : Math.sin(phi);
      const fz = sp > 0.5 ? vel.z / sp : -Math.cos(phi);
      vel.set(fx * target, vel.y, fz * target);
    }
    this.boostTimer = Math.max(this.boostTimer, time);
  }

  /** Fungo Turbo item. */
  useMushroom(): void {
    if (this.mode === 'crawl') {
      this.mode = 'roll';
      this.emit('enterShell', 0);
    }
    this.kick(TUNE.mushroomKick, TUNE.mushroomTime, 16);
    this.emit('mushroom', 0);
  }

  /** Banana or acorn hit. Returns false if a shield soaked it up. */
  hitBy(kind: 'banana' | 'acorn'): boolean {
    if (this.shield > 0) {
      this.shield = 0;
      this.emit('shieldBlock', 0);
      return false;
    }
    if (this.spinOut > 0 || this.finished) return false;
    const acorn = kind === 'acorn';
    this.spinOutDur = acorn ? 1.3 : 1.05;
    this.spinOut = this.spinOutDur;
    this.vel.x *= acorn ? 0.35 : 0.5;
    this.vel.z *= acorn ? 0.35 : 0.5;
    if (acorn) this.vel.y += 4;
    this.boostTimer = 0;
    this.driftCharge = 0;
    this.driftLevel = 0;
    if (this.mode === 'slide') this.mode = 'roll';
    this.emit('spinout', acorn ? 2 : 1);
    return true;
  }

  private airForces(dt: number, intent: Intent): void {
    const vel = this.vel;
    const sp = Math.hypot(vel.x, vel.z);
    if (sp > 0.5) {
      const rx = -vel.z / sp;
      const rz = vel.x / sp;
      vel.x += rx * this.steer * TUNE.airSteer * dt;
      vel.z += rz * this.steer * TUNE.airSteer * dt;
      const drag = TUNE.airDrag * 0.55 * sp * dt;
      vel.x -= vel.x * drag;
      vel.z -= vel.z * drag;
      if (this.mode !== 'crawl') this.heading += wrapAngle(Math.atan2(vel.x, -vel.z) - this.heading) * Math.min(1, dt * 8);
    }
    const spin = Math.max(-1, Math.min(1, intent.spin));
    this.spinVel = moveToward(this.spinVel, spin * TUNE.spinRate, dt * 60);
    this.spinAngle += this.spinVel * dt;
  }

  private fireBoost(): void {
    const vel = this.vel;
    const sp = vel.length();
    if (sp > 0.5) vel.multiplyScalar((sp + TUNE.boostImpulse) / sp);
    else vel.set(this.forwardX * TUNE.boostImpulse, 0, this.forwardZ * TUNE.boostImpulse);
    this.boost = 0;
    this.boostTimer = TUNE.boostTime;
    this.emit('boost', 0);
  }

  private resolveGround(dt: number): void {
    const R = TUNE.radius;
    const pos = this.pos;
    const vel = this.vel;
    this.hint = track.project(pos.x, pos.z, this.hint, proj);
    let ground = track.height(proj.s, proj.d);
    let pen = ground + R - pos.y;

    if (pen > 0.75) {
      // Ran into a ledge (e.g. the back of a kicker): treat it as a wall, never pop up it.
      const prevGround = track.height(this.s, this.d);
      if (ground - prevGround > 0.6) {
        pos.x = this.prevPos.x;
        pos.z = this.prevPos.z;
        vel.x *= -0.3;
        vel.z *= -0.3;
        this.hint = track.project(pos.x, pos.z, this.hint, proj);
        ground = track.height(proj.s, proj.d);
        pen = ground + R - pos.y;
        this.emit('hit', 4);
      }
    }
    this.s = proj.s;
    this.d = proj.d;
    const n = track.normal(this.s, this.d, tmpN);

    // Body-out modes hug small crests; a rolling shell is free to take off.
    const stick = this.mode === 'crawl' ? 0.3 : this.mode === 'slide' ? 0.1 : 0.03;
    const wasGrounded = this.grounded;
    if (pen > 0 || (wasGrounded && pen > -stick && vel.dot(n) < 2.5)) {
      pos.y = ground + R;
      const vn = vel.dot(n);
      const impact = -vn;
      if (vn < 0) {
        const bounce = impact > 7 ? 0.22 : 0;
        vel.addScaledVector(n, -vn * (1 + bounce));
      } else if (pen <= 0) {
        vel.addScaledVector(n, -vn);
      }
      if (!wasGrounded && this.flightTime > 0.32) this.onLand(impact);
      this.normal.copy(n);
      this.grounded = true;
      this.airTime = 0;
      this.flightTime = 0;
      const surface = track.surface(this.s, this.d);
      if (surface === 'water' && this.surface !== 'water' && vel.length() > 3) this.emit('splash', vel.length());
      this.surface = surface;
      if (this.padCooldown <= 0 && track.padAt(this.s, this.d)) {
        // Dash panel: works in any mode; a crawling snail gets tucked into its shell.
        this.padCooldown = 0.5;
        if (this.mode === 'crawl') {
          this.mode = 'roll';
          this.emit('enterShell', 0);
        }
        this.kick(TUNE.padKick, TUNE.padTime, TUNE.padMinSpeed);
        this.emit('pad', 0);
      }
      if (this.spinAngle !== 0 && this.flightTime === 0) {
        this.spinAngle = 0;
        this.spinVel = 0;
      }
    } else {
      if (wasGrounded && this.airTime === 0) this.grounded = false;
      this.airTime += dt;
      this.flightTime += dt;
      if (this.flightTime > 0.32 && this.flightTime - dt <= 0.32) this.emit('jump', vel.length());
      this.normal.lerp(UP, Math.min(1, dt * 4)).normalize();
    }
  }

  private onLand(impact: number): void {
    const vel = this.vel;
    const sp = vel.length();
    const air = this.flightTime;
    const spun = Math.abs(this.spinAngle);
    const turns = Math.round(spun / (Math.PI * 2));
    const off = Math.abs(spun - turns * Math.PI * 2);
    if (spun > 0.7 && off > 0.95) {
      // Came down mid-rotation.
      vel.multiplyScalar(0.76);
      this.emit('sloppy', impact);
    } else {
      if (turns >= 1) {
        this.tricks += 1;
        this.trickScore += turns * turns * 100;
        this.boost = Math.min(1, this.boost + 0.12 * turns);
        this.emit('trick', turns);
      }
      if (air > 1.5) {
        this.trickScore += Math.round(air * 50);
        this.emit('bigAir', air);
      }
      if (impact > 11 && impact > sp * 0.55) {
        vel.multiplyScalar(0.86);
        this.emit('hardLand', impact);
      } else if (air > 0.7 && impact < Math.max(5, sp * 0.3)) {
        this.boost = Math.min(1, this.boost + 0.06);
        this.emit('perfect', impact);
      } else {
        this.emit('land', impact);
      }
    }
    this.spinAngle = 0;
    this.spinVel = 0;
  }

  /** Collide with a static capsule (a == b for spheres). */
  collideCapsule(a: THREE.Vector3, b: THREE.Vector3, r: number, bounce: number): void {
    const p = this.pos;
    const ab = tmpA.copy(b).sub(a);
    const len2 = ab.lengthSq();
    let t = len2 > 1e-6 ? tmpB.copy(p).sub(a).dot(ab) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const c = tmpB.copy(a).addScaledVector(ab, t);
    const nrm = tmpA.copy(p).sub(c);
    const dist = nrm.length();
    const min = r + TUNE.radius;
    if (dist >= min || dist < 1e-5) return;
    nrm.multiplyScalar(1 / dist);
    p.addScaledVector(nrm, min - dist);
    const vn = this.vel.dot(nrm);
    if (vn < 0) {
      // Mushrooms are springy but capped, so a 150 km/h hit is a boing, not a cannon.
      const out = bounce > 1 ? Math.min(-vn * bounce, 13) : -vn * bounce;
      this.vel.addScaledVector(nrm, -vn + out);
      if (bounce > 1) this.vel.y += Math.min(6, -vn * 0.3);
      else this.vel.multiplyScalar(0.94);
      if (-vn > 1.5) this.emit(bounce > 1 ? 'boing' : 'hit', -vn);
    }
  }
}

const delta = new THREE.Vector3();

/** Fixed-step world: integrates every racer, then resolves obstacle and racer-racer contacts. */
export function stepWorld(racers: RacerBody[], intents: Intent[], dt: number): void {
  for (let i = 0; i < racers.length; i += 1) racers[i].step(dt, intents[i]);

  for (const r of racers) {
    if (r.frozen) continue;
    for (const o of track.obstaclesNear(r.s)) r.collideCapsule(o.a, o.b, o.r, o.bounce);
  }

  const min = TUNE.radius * 2 * 0.96;
  for (let i = 0; i < racers.length; i += 1) {
    for (let j = i + 1; j < racers.length; j += 1) {
      const a = racers[i];
      const b = racers[j];
      delta.copy(b.pos).sub(a.pos);
      const dist = delta.length();
      if (dist >= min || dist < 1e-5) continue;
      delta.multiplyScalar(1 / dist);
      const push = (min - dist) * 0.5;
      if (!a.frozen) a.pos.addScaledVector(delta, -push);
      if (!b.frozen) b.pos.addScaledVector(delta, push);
      const rel = b.vel.dot(delta) - a.vel.dot(delta);
      if (rel < 0 && !a.frozen && !b.frozen) {
        const j2 = -(1 + 0.55) * rel * 0.5;
        a.vel.addScaledVector(delta, -j2);
        b.vel.addScaledVector(delta, j2);
        if (-rel > 1.2) {
          a.events.push({ type: 'bump', value: -rel });
          b.events.push({ type: 'bump', value: -rel });
        }
      }
    }
  }
}
