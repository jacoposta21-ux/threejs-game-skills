import * as THREE from 'three';
import type { Intents } from '../core/InputManager';
import type { CollisionWorld, Collider } from '../physics/CollisionWorld';
import type { Surface } from '../core/types';

export const PLAYER = {
  radius: 0.17,
  standHeight: 0.86,
  crawlHeight: 0.44,
  eyeStand: 0.78,
  eyeCrawl: 0.34,
  stepUp: 0.17,
  walkSpeed: 2.1,
  crawlSpeed: 1.0,
  pushSpeed: 0.8,
  gravity: 13,
  hopVelocity: 2.3,
  climbMin: 0.22,
  climbMax: 0.82,
};

export type PlayerMode = 'normal' | 'climbing' | 'pushing' | 'hidden' | 'locked';

export interface PushTarget {
  id: string;
  collider: Collider;
  /** Move the object by (dx, dz); return false if blocked. */
  tryMove(dx: number, dz: number): boolean;
  center(): THREE.Vector3;
  release(): void;
}

export interface HideTarget {
  id: string;
  viewPos: THREE.Vector3;
  viewYaw: number;
  exitPos: THREE.Vector3;
  exitYaw: number;
}

export interface PlayerHooks {
  onStep(pos: THREE.Vector3, surface: Surface, crawling: boolean): void;
  onLand(pos: THREE.Vector3, fall: number, surface: Surface): void;
  onClimb(pos: THREE.Vector3): void;
  onHint(text: string): void;
  onPushStep(pos: THREE.Vector3): void;
}

const up = new THREE.Vector3(0, 1, 0);

export class PlayerController {
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  crawling = false;
  grounded = true;
  mode: PlayerMode = 'normal';
  surface: Surface = 'wood';
  hideSpot: HideTarget | null = null;
  pushTarget: PushTarget | null = null;
  private pushAxis = new THREE.Vector3();
  private eyeHeight = PLAYER.eyeStand;
  private stepDistance = 0;
  private bobPhase = 0;
  private landDip = 0;
  private fallStart = 0;
  private climb: { from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; endCrawl: boolean } | null = null;
  private hintCooldown = 0;
  /** External camera look override for cinematics/catches. */
  lookOverride: { target: THREE.Vector3; weight: number } | null = null;
  fear = 0;
  reducedMotion = false;
  moveScale = 1;
  readonly cameraOffset = new THREE.Vector3();
  private time = 0;
  private hideLook = { yaw: 0, pitch: 0 };

  constructor(
    private readonly world: CollisionWorld,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly hooks: PlayerHooks,
  ) {}

  get height(): number {
    return this.crawling ? PLAYER.crawlHeight : PLAYER.standHeight;
  }

  get eyeY(): number {
    return this.position.y + this.eyeHeight;
  }

  /** Reach height of the child's hands from the current stance. */
  get reachY(): number {
    return this.position.y + (this.crawling ? 0.55 : 1.02);
  }

  get speed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  forward(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  teleport(pos: THREE.Vector3, yaw: number, crawling = false): void {
    this.position.copy(pos);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.crawling = crawling;
    this.eyeHeight = crawling ? PLAYER.eyeCrawl : PLAYER.eyeStand;
    this.mode = 'normal';
    this.hideSpot = null;
    this.pushTarget = null;
    this.climb = null;
    this.lookOverride = null;
    this.landDip = 0;
    const g = this.world.groundAt(pos.x, pos.z, PLAYER.radius, pos.y + 0.3, PLAYER.stepUp);
    if (g.height > -5) this.position.y = g.height;
    this.syncCamera(0);
  }

  update(dt: number, intents: Intents): void {
    this.time += dt;
    this.hintCooldown = Math.max(0, this.hintCooldown - dt);

    if (this.mode === 'hidden') {
      this.updateHidden(dt, intents);
      this.syncCamera(dt);
      return;
    }
    if (this.mode !== 'locked') this.applyLook(intents);

    if (this.mode === 'climbing') {
      this.updateClimb(dt);
      this.syncCamera(dt);
      return;
    }
    if (this.mode === 'locked') {
      this.velocity.x *= 0.8;
      this.velocity.z *= 0.8;
      this.integrateVertical(dt);
      this.syncCamera(dt);
      return;
    }

    if (intents.pressed.has('crawl') && this.mode === 'normal') this.toggleCrawl();
    if (intents.pressed.has('jump') && this.mode === 'normal') this.tryJumpOrClimb();

    // Desired planar velocity from camera-relative input.
    const fwd = this.forward();
    const right = new THREE.Vector3().crossVectors(fwd, up);
    const wish = new THREE.Vector3()
      .addScaledVector(fwd, intents.moveY)
      .addScaledVector(right, intents.moveX);

    if (this.mode === 'pushing' && this.pushTarget) {
      this.updatePush(dt, wish);
    } else {
      const speed = (this.crawling ? PLAYER.crawlSpeed : PLAYER.walkSpeed) * this.moveScale;
      const target = wish.multiplyScalar(speed);
      const accel = this.grounded ? 14 : 4;
      this.velocity.x = THREE.MathUtils.damp(this.velocity.x, target.x, accel, dt);
      this.velocity.z = THREE.MathUtils.damp(this.velocity.z, target.z, accel, dt);
      const before = this.position.clone();
      this.position.x += this.velocity.x * dt;
      this.position.z += this.velocity.z * dt;
      this.world.resolveCylinder(this.position, PLAYER.radius, this.height, PLAYER.stepUp);
      // Kill velocity into walls so we don't stick.
      if (dt > 0) {
        this.velocity.x = (this.position.x - before.x) / dt;
        this.velocity.z = (this.position.z - before.z) / dt;
      }
    }

    this.integrateVertical(dt);
    this.updateSteps(dt);
    this.syncCamera(dt);
  }

  private applyLook(intents: Intents): void {
    this.yaw -= intents.lookX;
    this.pitch -= intents.lookY;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.35, 1.3);
  }

  private integrateVertical(dt: number): void {
    const ground = this.world.groundAt(this.position.x, this.position.z, PLAYER.radius, this.position.y, PLAYER.stepUp);
    const groundY = Math.max(ground.height, -5);
    if (this.position.y > groundY + 0.001 || this.velocity.y > 0) {
      if (this.grounded) this.fallStart = this.position.y;
      this.grounded = false;
      this.velocity.y -= PLAYER.gravity * dt;
      this.position.y += this.velocity.y * dt;
      // ceiling
      const ceiling = this.world.ceilingAt(this.position.x, this.position.z, PLAYER.radius, this.position.y);
      if (this.position.y + this.height > ceiling && this.velocity.y > 0) {
        this.velocity.y = 0;
      }
      if (this.position.y <= groundY) {
        const fall = this.fallStart - groundY;
        this.position.y = groundY;
        this.velocity.y = 0;
        this.grounded = true;
        this.surface = ground.surface;
        if (fall > 0.25) {
          this.landDip = Math.min(0.12, fall * 0.12);
          this.hooks.onLand(this.position, fall, ground.surface);
        }
      }
    } else {
      // Step up smoothly onto small ledges.
      this.position.y = THREE.MathUtils.damp(this.position.y, groundY, 30, dt);
      if (Math.abs(this.position.y - groundY) < 0.002) this.position.y = groundY;
      this.grounded = true;
      this.velocity.y = 0;
      this.surface = ground.surface;
    }
  }

  private updateSteps(dt: number): void {
    const speed = this.speed;
    if (!this.grounded || speed < 0.15) {
      this.bobPhase = THREE.MathUtils.damp(this.bobPhase, Math.round(this.bobPhase / Math.PI) * Math.PI, 6, dt);
      return;
    }
    const stride = this.crawling ? 0.42 : 0.38;
    this.stepDistance += speed * dt;
    this.bobPhase += (speed * dt * Math.PI) / stride;
    if (this.stepDistance >= stride) {
      this.stepDistance = 0;
      if (this.mode === 'pushing') this.hooks.onPushStep(this.position);
      else this.hooks.onStep(this.position, this.surface, this.crawling);
    }
  }

  toggleCrawl(force?: boolean): void {
    const want = force ?? !this.crawling;
    if (want === this.crawling) return;
    if (!want) {
      const ceiling = this.world.ceilingAt(this.position.x, this.position.z, PLAYER.radius, this.position.y);
      if (ceiling < this.position.y + PLAYER.standHeight) {
        this.hint('Not enough room to stand');
        return;
      }
    }
    this.crawling = want;
  }

  private hint(text: string): void {
    if (this.hintCooldown > 0) return;
    this.hintCooldown = 2.5;
    this.hooks.onHint(text);
  }

  /** Space: climb a ledge in front if possible, else a small hop. */
  tryJumpOrClimb(): boolean {
    if (!this.grounded) return false;
    const target = this.findClimb();
    if (target) {
      this.startClimb(target.to, target.endCrawl);
      return true;
    }
    if (!this.crawling) {
      this.velocity.y = PLAYER.hopVelocity;
      this.grounded = false;
      this.fallStart = this.position.y;
    }
    return false;
  }

  findClimb(): { to: THREE.Vector3; endCrawl: boolean } | null {
    const fwd = this.forward();
    let best: { to: THREE.Vector3; endCrawl: boolean; top: number } | null = null;
    for (const probe of [0.3, 0.45, 0.6]) {
      const px = this.position.x + fwd.x * probe;
      const pz = this.position.z + fwd.z * probe;
      for (const c of this.world.colliders) {
        if (!c.enabled || !c.climbable) continue;
        const rise = c.max.y - this.position.y;
        if (rise < PLAYER.climbMin || rise > PLAYER.climbMax) continue;
        if (px < c.min.x - 0.02 || px > c.max.x + 0.02 || pz < c.min.z - 0.02 || pz > c.max.z + 0.02) continue;
        // Landing spot: a little inside the top face.
        const to = new THREE.Vector3(px + fwd.x * 0.22, c.max.y, pz + fwd.z * 0.22);
        to.x = THREE.MathUtils.clamp(to.x, c.min.x + 0.12, c.max.x - 0.12);
        to.z = THREE.MathUtils.clamp(to.z, c.min.z + 0.12, c.max.z - 0.12);
        if (c.max.x - c.min.x < 0.24) to.x = (c.min.x + c.max.x) / 2;
        if (c.max.z - c.min.z < 0.24) to.z = (c.min.z + c.max.z) / 2;
        const ground = this.world.groundAt(to.x, to.z, PLAYER.radius * 0.6, c.max.y + 0.01, 0.05);
        const topY = Math.max(c.max.y, ground.height);
        const canCrawl = this.world.isSpaceFree(to.x, to.z, PLAYER.radius * 0.8, topY, PLAYER.crawlHeight, undefined);
        if (!canCrawl) continue;
        const canStand = this.world.isSpaceFree(to.x, to.z, PLAYER.radius * 0.8, topY, PLAYER.standHeight, undefined);
        if (!best || topY < best.top) best = { to: new THREE.Vector3(to.x, topY, to.z), endCrawl: !canStand || this.crawling, top: topY };
      }
      if (best) break;
    }
    return best ? { to: best.to, endCrawl: best.endCrawl } : null;
  }

  private startClimb(to: THREE.Vector3, endCrawl: boolean): void {
    const rise = to.y - this.position.y;
    this.climb = { from: this.position.clone(), to, t: 0, dur: 0.45 + rise * 0.55, endCrawl };
    this.mode = 'climbing';
    this.velocity.set(0, 0, 0);
    this.hooks.onClimb(to);
  }

  get climbProgress(): number {
    return this.climb ? this.climb.t / this.climb.dur : -1;
  }

  private updateClimb(dt: number): void {
    const c = this.climb!;
    c.t += dt;
    const k = Math.min(1, c.t / c.dur);
    const rise = THREE.MathUtils.smoothstep(k, 0, 0.6);
    const along = THREE.MathUtils.smoothstep(k, 0.35, 1);
    this.position.x = THREE.MathUtils.lerp(c.from.x, c.to.x, along);
    this.position.z = THREE.MathUtils.lerp(c.from.z, c.to.z, along);
    // Rise slightly above the top then settle, like hauling yourself up.
    this.position.y = THREE.MathUtils.lerp(c.from.y, c.to.y, rise) + Math.sin(k * Math.PI) * 0.06;
    if (c.endCrawl) this.crawling = true;
    if (k >= 1) {
      this.position.copy(c.to);
      this.mode = 'normal';
      this.climb = null;
      this.grounded = true;
    }
  }

  /* ------------------------------ pushing ------------------------------ */

  startPush(target: PushTarget): void {
    const c = target.center();
    const d = new THREE.Vector3(c.x - this.position.x, 0, c.z - this.position.z);
    // Snap the push axis to the dominant direction.
    if (Math.abs(d.x) > Math.abs(d.z)) this.pushAxis.set(Math.sign(d.x), 0, 0);
    else this.pushAxis.set(0, 0, Math.sign(d.z));
    this.pushTarget = target;
    this.mode = 'pushing';
  }

  stopPush(): void {
    if (this.pushTarget) this.pushTarget.release();
    this.pushTarget = null;
    if (this.mode === 'pushing') this.mode = 'normal';
  }

  private updatePush(dt: number, wish: THREE.Vector3): void {
    const target = this.pushTarget!;
    const amount = wish.dot(this.pushAxis);
    const speed = PLAYER.pushSpeed * this.moveScale;
    const v = Math.abs(amount) < 0.2 ? 0 : amount * speed;
    this.velocity.x = THREE.MathUtils.damp(this.velocity.x, this.pushAxis.x * v, 10, dt);
    this.velocity.z = THREE.MathUtils.damp(this.velocity.z, this.pushAxis.z * v, 10, dt);
    const dx = this.velocity.x * dt;
    const dz = this.velocity.z * dt;
    if (Math.abs(dx) + Math.abs(dz) > 1e-5) {
      // Dragging backwards: make sure the player has room first.
      const nx = this.position.x + dx;
      const nz = this.position.z + dz;
      const playerFree = this.world.isSpaceFree(nx, nz, PLAYER.radius, this.position.y + PLAYER.stepUp, this.height - PLAYER.stepUp, target);
      if (playerFree && target.tryMove(dx, dz)) {
        this.position.x = nx;
        this.position.z = nz;
      } else {
        this.velocity.x = 0;
        this.velocity.z = 0;
        if (Math.abs(amount) > 0.5) this.hint(playerFree ? 'It won’t go any further' : 'No room behind you');
      }
    }
    const c = target.center();
    if (Math.hypot(c.x - this.position.x, c.z - this.position.z) > 1.4 || Math.abs(c.y - this.position.y) > 1.2) this.stopPush();
  }

  /* ------------------------------- hiding ------------------------------ */

  enterHide(spot: HideTarget): void {
    this.stopPush();
    this.hideSpot = spot;
    this.mode = 'hidden';
    this.velocity.set(0, 0, 0);
    this.hideLook.yaw = 0;
    this.hideLook.pitch = 0;
  }

  exitHide(): void {
    const spot = this.hideSpot;
    if (!spot) return;
    this.hideSpot = null;
    this.mode = 'normal';
    this.position.copy(spot.exitPos);
    this.yaw = spot.exitYaw;
    this.pitch = 0;
    this.crawling = false;
    const ceiling = this.world.ceilingAt(this.position.x, this.position.z, PLAYER.radius, this.position.y);
    if (ceiling < this.position.y + PLAYER.standHeight) this.crawling = true;
  }

  private updateHidden(_dt: number, intents: Intents): void {
    this.hideLook.yaw = THREE.MathUtils.clamp(this.hideLook.yaw - intents.lookX, -0.7, 0.7);
    this.hideLook.pitch = THREE.MathUtils.clamp(this.hideLook.pitch - intents.lookY, -0.4, 0.35);
  }

  /* ------------------------------- camera ------------------------------ */

  syncCamera(dt: number): void {
    const cam = this.camera;
    if (this.mode === 'hidden' && this.hideSpot) {
      cam.position.copy(this.hideSpot.viewPos);
      const breathe = this.reducedMotion ? 0 : Math.sin(this.time * 1.6) * 0.004;
      cam.position.y += breathe;
      cam.rotation.set(this.hideLook.pitch, this.hideSpot.viewYaw + this.hideLook.yaw, 0, 'YXZ');
      return;
    }
    const targetEye = this.crawling ? PLAYER.eyeCrawl : PLAYER.eyeStand;
    this.eyeHeight = dt > 0 ? THREE.MathUtils.damp(this.eyeHeight, targetEye, 9, dt) : targetEye;
    this.landDip = dt > 0 ? THREE.MathUtils.damp(this.landDip, 0, 7, dt) : 0;

    const motion = this.reducedMotion ? 0 : 1;
    const speedK = Math.min(1, this.speed / PLAYER.walkSpeed);
    const bobY = Math.abs(Math.sin(this.bobPhase)) * (this.crawling ? 0.016 : 0.011) * speedK * motion;
    const bobX = Math.cos(this.bobPhase) * (this.crawling ? 0.012 : 0.006) * speedK * motion;
    const roll = Math.cos(this.bobPhase) * (this.crawling ? 0.02 : 0.006) * speedK * motion;

    // Fear: slow, low-amplitude instability (never fast jitter).
    const f = this.fear * motion;
    const t = this.time;
    const shakeX = (Math.sin(t * 1.7) * 0.6 + Math.sin(t * 3.1 + 1.3) * 0.4) * 0.006 * f;
    const shakeY = (Math.sin(t * 2.3 + 0.4) * 0.6 + Math.sin(t * 4.1) * 0.4) * 0.005 * f;
    const idle = Math.sin(t * 0.9) * 0.003 * motion;

    const fwd = this.forward();
    const right = new THREE.Vector3().crossVectors(fwd, up);
    cam.position.set(this.position.x, this.position.y + this.eyeHeight - this.landDip + bobY + idle, this.position.z);
    cam.position.addScaledVector(right, bobX);

    let yaw = this.yaw + shakeX;
    let pitch = this.pitch + shakeY;
    if (this.mode === 'climbing') pitch = THREE.MathUtils.lerp(pitch, -0.35, Math.sin(Math.max(0, this.climbProgress) * Math.PI) * 0.6);
    if (this.lookOverride) {
      const dir = new THREE.Vector3().subVectors(this.lookOverride.target, cam.position);
      const ty = Math.atan2(-dir.x, -dir.z);
      const tp = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
      const w = this.lookOverride.weight;
      let dy = ty - yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      yaw += dy * w;
      pitch += (tp - pitch) * w;
      if (w >= 0.999) {
        this.yaw = yaw;
        this.pitch = pitch;
      }
    }
    cam.rotation.set(pitch, yaw, roll + shakeX * 0.6, 'YXZ');
  }
}
