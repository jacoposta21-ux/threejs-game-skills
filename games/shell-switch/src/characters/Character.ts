import * as THREE from 'three';
import { CharacterModel, type CharacterSpec } from './CharacterModel';
import type { CharacterKind, HostDef, HostKind, MoveStats } from './Archetypes';
import type { CollisionWorld, MoverInfo } from '../world/Collision';
import type { Materials } from '../world/Materials';

const CIV_STATS: MoveStats = { speed: 2.0, run: 4.6, accel: 10, jump: 5.5, gravity: 1 };

export class Character {
  readonly model: CharacterModel;
  readonly vel = new THREE.Vector3();
  readonly mover: MoverInfo;
  yaw = 0;
  targetYaw = 0;
  grounded = true;
  running = false;
  stats: MoveStats;
  /** Desired planar velocity direction (unit or zero) & speed fraction. */
  readonly wish = new THREE.Vector2();
  wishRun = false;
  wantJump = false;
  possessed = false;
  /** Freeze voluntary movement (cutscenes, picking locks...). */
  locked = 0;
  homeArea: string;
  /** Speech bubble cooldown. */
  barkCooldown = 0;
  private stepAccum = 0;
  onStep: ((c: Character) => void) | null = null;
  onLand: ((c: Character, impact: number) => void) | null = null;
  private wasGrounded = true;
  hoverY = 0;
  visibleDist = 0;
  active = true;
  pushed = false;
  /** Ghost float height. */
  floatBase = 0;

  constructor(
    readonly id: string,
    readonly name: string,
    readonly kind: CharacterKind,
    spec: CharacterSpec,
    mats: Materials,
    readonly host: HostDef | null,
    seed: number,
    area: string,
  ) {
    this.model = new CharacterModel(spec, mats, seed);
    this.stats = host ? host.stats : CIV_STATS;
    this.mover = {
      radius: this.model.radius,
      height: Math.max(0.5, this.model.height * 0.92),
      small: !!this.stats.small,
      phasing: false,
      ignore: null,
    };
    this.homeArea = area;
  }

  get pos(): THREE.Vector3 {
    return this.model.root.position;
  }

  get hostKind(): HostKind | null {
    return this.host ? this.host.id : null;
  }

  place(x: number, y: number, z: number, yaw = 0): void {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.yaw = this.targetYaw = yaw;
    this.model.root.rotation.y = yaw;
  }

  faceToward(x: number, z: number): void {
    this.targetYaw = Math.atan2(x - this.pos.x, z - this.pos.z);
  }

  update(dt: number, world: CollisionWorld, time: number, simulate: boolean): void {
    const s = this.stats;
    if (simulate) {
      const canMove = this.locked <= 0;
      this.locked = Math.max(0, this.locked - dt);
      const run = this.wishRun && canMove;
      this.running = run && this.wish.lengthSq() > 0.01;
      const max = run ? s.run : s.speed;
      const tx = canMove ? this.wish.x * max : 0;
      const tz = canMove ? this.wish.y * max : 0;
      const accel = this.grounded || s.floats ? s.accel : s.accel * 0.45;
      const k = 1 - Math.exp(-accel * dt * 0.35);
      this.vel.x += (tx - this.vel.x) * k;
      this.vel.z += (tz - this.vel.z) * k;
      if (this.wish.lengthSq() > 0.01 && canMove) {
        this.targetYaw = Math.atan2(this.wish.x, this.wish.y);
      }
      if (this.wantJump && this.grounded && canMove && s.jump > 0) {
        this.vel.y = s.jump;
        this.grounded = false;
        this.model.kick(2.2);
      }
      this.wantJump = false;

      if (s.floats) {
        // Ghosts hover at a bobbing height above whatever is beneath them.
        const res = world.move(this.pos, this.vel, dt, this.mover, 0, 0.6);
        const target = res.groundY + 0.25;
        this.pos.y += (target - this.pos.y) * (1 - Math.exp(-6 * dt));
        this.vel.y = 0;
        this.grounded = true;
      } else {
        const res = world.move(this.pos, this.vel, dt, this.mover, s.gravity, this.stats.small ? 0.3 : 0.42);
        if (res.grounded && !this.wasGrounded) {
          const impact = Math.min(1, Math.abs(this.lastVy) / 14);
          this.model.kick(-3 - impact * 6);
          this.onLand?.(this, impact);
        }
        this.lastVy = this.vel.y;
        this.grounded = res.grounded;
      }
      this.wasGrounded = this.grounded;

      // Turn smoothly toward target yaw.
      let d = this.targetYaw - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * (1 - Math.exp(-12 * dt));
      this.model.root.rotation.y = this.yaw;

      // Footsteps.
      const planar = Math.hypot(this.vel.x, this.vel.z);
      if (this.grounded && planar > 0.4) {
        this.stepAccum += planar * dt;
        const stride = 0.55 + this.model.legLen * 0.9;
        if (this.stepAccum > stride) {
          this.stepAccum = 0;
          this.onStep?.(this);
        }
      }
    }
    const planar = Math.hypot(this.vel.x, this.vel.z);
    const sp = planar / Math.max(0.1, s.speed);
    this.model.update(dt, Math.min(1.4, sp), this.running, this.grounded, this.vel.y, time);
  }

  private lastVy = 0;

  dispose(): void {
    this.model.dispose();
  }
}
