import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import { HushModel } from './HushModel';
import type { NavGrid } from './NavGrid';
import type { SearchableSpot } from '../objects/HideSpot';
import type { Perch } from '../objects/Fixtures';

export type HushState =
  | 'inactive'
  | 'patrol'
  | 'investigate'
  | 'lookaround'
  | 'searchSpot'
  | 'chase'
  | 'lured'
  | 'guard'
  | 'scripted'
  | 'catch'
  | 'leave';

export interface HushTuning {
  patrolSpeed: number;
  investigateSpeed: number;
  chaseSpeed: number;
  sight: number;
  hearing: number;
}

export const DEFAULT_TUNING: HushTuning = {
  patrolSpeed: 0.9,
  investigateSpeed: 1.3,
  chaseSpeed: 1.85,
  sight: 7.5,
  hearing: 1,
};

const tmp = new THREE.Vector3();

/** THE HUSH: patrols, listens, investigates, searches hiding places, chases, can be lured by LUMO. */
export class HushAI {
  readonly model = new HushModel();
  state: HushState = 'inactive';
  tuning: HushTuning = { ...DEFAULT_TUNING };
  yaw = 0;
  patrol: THREE.Vector3[] = [];
  private patrolIndex = 0;
  private path: THREE.Vector3[] = [];
  private pathIndex = 0;
  private repath = 0;
  private stateTimer = 0;
  private target = new THREE.Vector3();
  suspicion = 0;
  seesPlayer = false;
  private unseenTime = 0;
  readonly lastKnown = new THREE.Vector3();
  private searchQueue: SearchableSpot[] = [];
  private currentSpot: SearchableSpot | null = null;
  guard: { pos: THREE.Vector3; yaw: number } | null = null;
  exitPoint: THREE.Vector3 | null = null;
  /** After investigating, leave the area instead of patrolling (chapter 1). */
  leaveAfterSearch = false;
  private lure: Perch | null = null;
  private lureCheck = 0;
  private stepTimer = 0;
  private whisperTimer = 6;
  private fade = 0;
  private fadeTarget = 0;
  private scripted: { points: THREE.Vector3[]; speed: number; done?: () => void } | null = null;
  private grace = 0;
  private stuckTimer = 0;
  private lastPos = new THREE.Vector3();
  speed = 0;
  /** Test harness only: perception disabled. */
  blind = false;
  onCatch: (() => void) | null = null;
  onStateChange: ((s: HushState, prev: HushState) => void) | null = null;
  spots: SearchableSpot[] = [];
  perches: Perch[] = [];

  constructor(scene: THREE.Scene, private nav: NavGrid) {
    scene.add(this.model.root);
    scene.add(this.model.smokeObject);
    this.model.setFade(0);
  }

  get position(): THREE.Vector3 {
    return this.model.root.position;
  }

  get active(): boolean {
    return this.state !== 'inactive';
  }

  get eye(): THREE.Vector3 {
    return tmp.set(this.position.x, 2.05, this.position.z);
  }

  setNav(nav: NavGrid): void {
    this.nav = nav;
  }

  dispose(): void {
    this.model.root.removeFromParent();
    this.model.smokeObject.removeFromParent();
  }

  spawn(pos: THREE.Vector3, yaw: number, state: HushState, ctx: GameContext, instant = false): void {
    this.position.copy(pos);
    this.position.y = 0;
    this.yaw = yaw;
    this.fadeTarget = 1;
    if (instant) {
      this.fade = 1;
      this.model.setFade(1);
    }
    this.suspicion = 0;
    this.grace = 2;
    this.setState(state);
    if (state === 'patrol') this.goToPatrolPoint();
    if (state === 'guard' && this.guard) this.walkTo(this.guard.pos);
    ctx.audio.startTrackedLoop('hush-drone', 'hush', this.model.head, 0.5);
  }

  despawn(ctx: GameContext, instant = false): void {
    this.setState('inactive');
    this.fadeTarget = 0;
    if (instant) {
      this.fade = 0;
      this.model.setFade(0);
    }
    ctx.audio.stopLoop('hush-drone', instant ? 0.1 : 1.5);
  }

  scriptTo(points: THREE.Vector3[], speed: number, done?: () => void): void {
    this.scripted = { points: points.map((p) => p.clone()), speed, done };
    this.path = this.scripted.points;
    this.pathIndex = 0;
    this.setState('scripted');
  }

  /** Force a chase (scripted chase starts). */
  startChase(ctx: GameContext): void {
    this.lastKnown.copy(ctx.player.position);
    this.suspicion = 1;
    this.setState('chase');
    this.repath = 0;
  }

  setState(s: HushState): void {
    if (s === this.state) return;
    const prev = this.state;
    this.state = s;
    this.stateTimer = 0;
    this.onStateChange?.(s, prev);
  }

  private walkTo(p: THREE.Vector3): boolean {
    this.target.copy(p);
    const path = this.nav.findPath(this.position, p);
    if (!path) {
      this.path = [];
      return false;
    }
    this.path = path;
    this.pathIndex = path.length > 1 ? 1 : 0;
    return true;
  }

  private goToPatrolPoint(): void {
    if (this.patrol.length === 0) {
      this.setState(this.guard ? 'guard' : 'lookaround');
      return;
    }
    this.walkTo(this.patrol[this.patrolIndex % this.patrol.length]);
  }

  /** Noise heard: investigate unless already hunting. */
  hear(ctx: GameContext, pos: THREE.Vector3, radius: number, kind: string): void {
    if (!this.active || this.state === 'scripted' || this.state === 'catch' || this.state === 'leave') return;
    const d = Math.hypot(pos.x - this.position.x, pos.z - this.position.z);
    if (d > radius * this.tuning.hearing) return;
    if (this.state === 'chase') {
      if (kind !== 'throw') this.lastKnown.copy(pos);
      return;
    }
    if (this.state === 'lured') return;
    this.investigate(ctx, pos, kind === 'throw' ? 3 : 2.5);
    if (Math.random() < 0.5) ctx.audio.play('hushWhisper', { pos: this.eye.clone(), volume: 0.8 });
  }

  investigate(ctx: GameContext, pos: THREE.Vector3, _lookTime = 2.5): void {
    this.lastKnown.copy(pos);
    this.walkTo(pos);
    this.searchQueue = [];
    this.setState('investigate');
    void ctx;
  }

  private queueSearches(around: THREE.Vector3, max: number): void {
    const near = this.spots
      .map((s) => ({ s, d: s.searchPos.distanceTo(around) }))
      .filter((e) => e.d < 4)
      .sort((a, b) => a.d - b.d)
      .slice(0, max)
      .map((e) => e.s);
    this.searchQueue = near;
  }

  /** Can THE HUSH see the player right now (used when hiding). */
  canSee(ctx: GameContext): boolean {
    if (this.blind || !this.active || this.fade < 0.5) return false;
    const p = ctx.player;
    if (p.mode === 'hidden') return false;
    const head = new THREE.Vector3(p.position.x, p.eyeY, p.position.z);
    const eye = this.eye.clone();
    const d = head.distanceTo(eye);
    let range = this.tuning.sight;
    if (p.crawling) range *= 0.55;
    if (ctx.lumo.isLit && ctx.lumo.position.distanceTo(head) < 1.2) range += 3.5;
    else if (!ctx.hazards.lit) range *= 0.7;
    if (this.state === 'chase') range += 3;
    if (d > range) return false;
    // concealment: crawling under furniture
    for (const s of this.spots) {
      if (!('min' in s)) continue;
      if (s.contains(ctx) && d > 1.1) return false;
    }
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const to = head.clone().sub(eye).setY(0).normalize();
    const angle = Math.acos(THREE.MathUtils.clamp(fwd.dot(to), -1, 1));
    if (angle > 1.15 && d > 1.6 && this.state !== 'chase') return false;
    return ctx.world.lineOfSight(eye, head);
  }

  update(dt: number, ctx: GameContext): void {
    this.fade += (this.fadeTarget - this.fade) * Math.min(1, dt * 1.6);
    this.model.setFade(this.fade);
    if (this.state === 'inactive') {
      this.speed = 0;
      this.model.update(dt, 0, ctx.particleScale);
      return;
    }
    this.stateTimer += dt;
    this.grace = Math.max(0, this.grace - dt);

    // Perception
    this.seesPlayer = this.state !== 'scripted' && this.state !== 'catch' && this.canSee(ctx);
    const playerPos = ctx.player.position;
    const d = Math.hypot(playerPos.x - this.position.x, playerPos.z - this.position.z);
    if (this.seesPlayer) {
      const near = 1 - Math.min(1, d / this.tuning.sight);
      this.suspicion = Math.min(1, this.suspicion + dt * (0.9 + near * 3.2));
      this.lastKnown.copy(playerPos);
      this.unseenTime = 0;
    } else {
      this.suspicion = Math.max(0, this.suspicion - dt * (this.state === 'chase' ? 0.05 : 0.25));
      this.unseenTime += dt;
    }

    if (this.seesPlayer && this.suspicion >= 1 && this.state !== 'chase' && this.state !== 'scripted' && this.state !== 'leave') {
      this.setState('chase');
      ctx.audio.play('hushWhisper', { pos: this.eye.clone(), volume: 1.2 });
      this.repath = 0;
    } else if (this.seesPlayer && this.suspicion > 0.4 && ['patrol', 'guard', 'lookaround'].includes(this.state)) {
      this.investigate(ctx, playerPos);
    }

    // Lure: a lit perch draws it in.
    this.lureCheck -= dt;
    if (this.lureCheck <= 0 && !this.blind && ['patrol', 'guard', 'lookaround', 'investigate'].includes(this.state)) {
      this.lureCheck = 0.5;
      for (const perch of this.perches) {
        if (!perch.occupied || ctx.lumo.anchor !== perch || !ctx.lumo.isLit) continue;
        const pd = perch.anchor.distanceTo(this.position);
        if (pd < perch.lureRange && (pd < 4.5 || ctx.world.lineOfSight(this.eye.clone(), perch.anchor))) {
          this.lure = perch;
          this.walkTo(new THREE.Vector3(perch.anchor.x, 0, perch.anchor.z));
          this.setState('lured');
          ctx.audio.play('hushWhisper', { pos: this.eye.clone(), volume: 0.7 });
          break;
        }
      }
    }

    let speed = 0;
    switch (this.state) {
      case 'patrol':
        speed = this.tuning.patrolSpeed;
        this.model.pose = 'walk';
        if (this.followPath(dt, speed)) {
          this.patrolIndex++;
          this.setState('lookaround');
        }
        break;
      case 'lookaround':
        this.model.pose = 'search';
        this.yaw += Math.sin(this.stateTimer * 1.4) * dt * 0.9;
        if (this.stateTimer > 2.6) {
          if (this.guard) {
            this.walkTo(this.guard.pos);
            this.setState('guard');
          } else if (this.leaveAfterSearch && this.exitPoint) {
            this.walkTo(this.exitPoint);
            this.setState('leave');
          } else {
            this.setState('patrol');
            this.goToPatrolPoint();
          }
        }
        break;
      case 'guard': {
        const g = this.guard;
        this.model.pose = 'idle';
        if (g && this.position.distanceTo(g.pos) > 0.35) {
          speed = this.tuning.patrolSpeed;
          this.model.pose = 'walk';
          if (this.path.length === 0 || this.pathIndex >= this.path.length) this.walkTo(g.pos);
          this.followPath(dt, speed);
        } else if (g) {
          this.turnTo(g.yaw + Math.sin(this.stateTimer * 0.6) * 0.9, dt, 1.2);
        }
        break;
      }
      case 'investigate':
        speed = this.tuning.investigateSpeed;
        this.model.pose = 'walk';
        if (this.followPath(dt, speed) || this.stateTimer > 14) {
          this.queueSearches(this.lastKnown, 2);
          this.nextSearch(ctx);
        }
        break;
      case 'searchSpot': {
        const spot = this.currentSpot!;
        if (this.stateTimer < 0.01) this.walkTo(spot.searchPos);
        const arrived = this.path.length === 0 || this.followPath(dt, this.tuning.investigateSpeed);
        if (!arrived) {
          speed = this.tuning.investigateSpeed;
          this.model.pose = 'walk';
          this.stateTimer = Math.min(this.stateTimer, 0.02);
          break;
        }
        this.model.pose = 'search';
        this.faceToward(spot.lookAt, dt, 3);
        if (this.stateTimer > 1.7) {
          if (spot.contains(ctx) && spot.compromised > 0 && this.grace <= 0) {
            this.doCatch(ctx);
            break;
          }
          if (spot.contains(ctx)) ctx.events.emit('hurt', { amount: 0.4 });
          ctx.audio.play('hushWhisper', { pos: this.eye.clone(), volume: 0.6 });
          this.nextSearch(ctx);
        }
        break;
      }
      case 'chase': {
        speed = this.tuning.chaseSpeed;
        this.model.pose = 'walk';
        this.repath -= dt;
        const hiddenSpot = this.spots.find((s) => s.contains(ctx));
        if (ctx.player.mode === 'hidden' || hiddenSpot) {
          const spot = hiddenSpot ?? null;
          if (spot && spot.compromised > 0) {
            this.currentSpot = spot;
            this.searchQueue = [];
            this.setState('searchSpot');
            break;
          }
        }
        if (this.repath <= 0) {
          this.repath = 0.35;
          const ok = this.walkTo(this.seesPlayer ? playerPos : this.lastKnown);
          if (!ok) this.stuckTimer += 0.35;
        }
        const arrived = this.followPath(dt, speed);
        if (this.seesPlayer && d < 0.85 && this.grace <= 0 && Math.abs(playerPos.y - this.position.y) < 1.2) {
          this.doCatch(ctx);
          break;
        }
        if ((!this.seesPlayer && this.unseenTime > 2.6) || (arrived && !this.seesPlayer) || this.stuckTimer > 3) {
          this.stuckTimer = 0;
          this.suspicion = 0.3;
          this.walkTo(this.lastKnown);
          this.setState('investigate');
          ctx.audio.play('hushWhisper', { pos: this.eye.clone(), volume: 0.8 });
        }
        break;
      }
      case 'lured': {
        const perch = this.lure;
        if (!perch || !perch.occupied || ctx.lumo.anchor !== perch) {
          this.lure = null;
          this.setState('lookaround');
          break;
        }
        const arrived = this.followPath(dt, this.tuning.investigateSpeed) || this.position.distanceTo(new THREE.Vector3(perch.anchor.x, 0, perch.anchor.z)) < 0.9;
        if (!arrived) {
          speed = this.tuning.investigateSpeed;
          this.model.pose = 'walk';
          this.stateTimer = 0;
        } else {
          this.model.pose = 'search';
          this.faceToward(perch.anchor, dt, 3);
          if (this.stateTimer > 1.4) {
            ctx.lumo.snuff(ctx);
            ctx.audio.play('hushWhisper', { pos: this.eye.clone(), volume: 1 });
            ctx.ui.subtitle('[Shhhhh…]', 2);
            this.lure = null;
            this.setState('lookaround');
          }
        }
        break;
      }
      case 'scripted': {
        const s = this.scripted;
        this.model.pose = 'walk';
        speed = s?.speed ?? 1;
        if (!s || this.followPath(dt, speed)) {
          this.scripted = null;
          speed = 0;
          this.setState('lookaround');
          s?.done?.();
        }
        break;
      }
      case 'leave':
        speed = this.tuning.investigateSpeed;
        this.model.pose = 'walk';
        if (this.followPath(dt, speed) || this.stateTimer > 15) this.despawn(ctx);
        break;
      case 'catch':
        this.model.pose = 'lunge';
        break;
    }

    // Unstick: if blocked by a newly closed door etc, re-path.
    if (speed > 0) {
      if (this.lastPos.distanceTo(this.position) < speed * dt * 0.2) {
        this.stuckTimer += dt;
        if (this.stuckTimer > 1.5 && this.state !== 'chase') {
          this.stuckTimer = 0;
          this.walkTo(this.target);
        }
      } else if (this.state !== 'chase') this.stuckTimer = 0;
    }
    this.lastPos.copy(this.position);
    this.speed = THREE.MathUtils.damp(this.speed, speed, 6, dt);
    this.model.root.rotation.y = this.yaw;
    this.model.update(dt, this.speed, ctx.particleScale);
    this.sounds(dt, ctx);
  }

  private nextSearch(ctx: GameContext): void {
    const next = this.searchQueue.shift();
    if (next) {
      this.currentSpot = next;
      this.setState('searchSpot');
      this.stateTimer = 0;
    } else {
      this.currentSpot = null;
      this.setState('lookaround');
    }
    void ctx;
  }

  private doCatch(ctx: GameContext): void {
    this.setState('catch');
    this.onCatch?.();
    void ctx;
  }

  /** Returns true when the end of the path is reached. */
  private followPath(dt: number, speed: number): boolean {
    if (this.pathIndex >= this.path.length) return true;
    const wp = this.path[this.pathIndex];
    const dx = wp.x - this.position.x;
    const dz = wp.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.12) {
      this.pathIndex++;
      return this.pathIndex >= this.path.length;
    }
    const desiredYaw = Math.atan2(dx, dz);
    this.turnTo(desiredYaw, dt, 4);
    // Slow down while turning sharply: deliberate, unnatural pacing.
    let diff = desiredYaw - this.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const k = Math.max(0.25, Math.cos(diff));
    const step = Math.min(dist, speed * k * dt);
    this.position.x += (dx / dist) * step;
    this.position.z += (dz / dist) * step;
    return false;
  }

  private turnTo(yaw: number, dt: number, rate: number): void {
    let diff = yaw - this.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.yaw += THREE.MathUtils.clamp(diff, -rate * dt, rate * dt);
  }

  faceToward(p: THREE.Vector3, dt: number, rate: number): void {
    this.turnTo(Math.atan2(p.x - this.position.x, p.z - this.position.z), dt, rate);
  }

  private sounds(dt: number, ctx: GameContext): void {
    if (this.speed > 0.1) {
      this.stepTimer -= dt * this.speed;
      if (this.stepTimer <= 0) {
        this.stepTimer = 0.78;
        ctx.audio.play('hushStep', { pos: this.position.clone(), volume: 0.7 + (this.state === 'chase' ? 0.4 : 0) });
      }
    }
    this.whisperTimer -= dt;
    if (this.whisperTimer <= 0) {
      this.whisperTimer = 7 + Math.random() * 9;
      ctx.audio.play('hushWhisper', { pos: this.eye.clone(), volume: 0.45 });
    }
  }
}
