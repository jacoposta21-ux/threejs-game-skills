import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import { Interactable, type Prompt } from './Interactable';
import { makeCollider, type Collider } from '../physics/CollisionWorld';
import type { PushTarget } from '../player/PlayerController';
import type { Surface } from '../core/types';

export interface PushableOptions {
  size: THREE.Vector3;
  /** Base position (center x/z, bottom y). */
  position: THREE.Vector3;
  climbable?: boolean;
  surface?: Surface;
  label?: string;
  /** Called after each release with the new base position. */
  onMoved?: (ctx: GameContext, pos: THREE.Vector3) => void;
  /** Only along one axis (x or z). */
  axis?: 'x' | 'z';
  bounds?: { min: THREE.Vector2; max: THREE.Vector2 };
  scrape?: number;
}

/** Large object the child can push and drag along a floor or counter. */
export class PushableObject extends Interactable implements PushTarget {
  collider!: Collider;
  readonly base = new THREE.Vector3();
  private ctx: GameContext | null = null;

  constructor(id: string, readonly visual: THREE.Object3D, readonly opts: PushableOptions) {
    super(id);
    this.root.add(visual);
    this.base.copy(opts.position);
    this.root.position.copy(this.base);
    const s = opts.size;
    this.addHitBox(s.x + 0.04, s.y + 0.02, s.z + 0.04, 0, 0, 0);
    this.range = 1.4;
  }

  attach(ctx: GameContext): void {
    this.ctx = ctx;
    const s = this.opts.size;
    this.collider = ctx.world.add(
      makeCollider(new THREE.Vector3(-s.x / 2, 0, -s.z / 2).add(this.base), new THREE.Vector3(s.x / 2, s.y, s.z / 2).add(this.base), {
        id: `push-${this.id}`,
        climbable: this.opts.climbable ?? true,
        surface: this.opts.surface ?? 'wood',
        owner: this,
      }),
    );
  }

  prompt(ctx: GameContext): Prompt | null {
    if (ctx.player.crawling && this.opts.size.y > 0.5) return { verb: 'Stand up to push', disabled: true };
    if (Math.abs(ctx.player.position.y - this.base.y) > 0.25) return null;
    return { verb: `Push / pull ${this.opts.label ?? ''}`.trim(), key: 'E' };
  }

  interact(ctx: GameContext): void {
    ctx.player.startPush(this);
    if (!ctx.flags.has('hint-push')) {
      ctx.flags.set('hint-push');
      ctx.ui.hint('W pushes, S pulls. E lets go.', 4);
    }
    ctx.audio.play('scrape', { pos: this.center(), volume: 0.5 });
  }

  center(): THREE.Vector3 {
    return this.base.clone().add(new THREE.Vector3(0, this.opts.size.y / 2, 0));
  }

  tryMove(dx: number, dz: number): boolean {
    if (!this.ctx) return false;
    if (this.opts.axis === 'x') dz = 0;
    if (this.opts.axis === 'z') dx = 0;
    if (Math.abs(dx) + Math.abs(dz) < 1e-6) return false;
    const s = this.opts.size;
    const nx = this.base.x + dx;
    const nz = this.base.z + dz;
    if (this.opts.bounds) {
      const b = this.opts.bounds;
      if (nx < b.min.x || nx > b.max.x || nz < b.min.y || nz > b.max.y) return false;
    }
    const min = new THREE.Vector3(nx - s.x / 2 + 0.01, this.base.y + 0.03, nz - s.z / 2 + 0.01);
    const max = new THREE.Vector3(nx + s.x / 2 - 0.01, this.base.y + s.y, nz + s.z / 2 - 0.01);
    if (this.ctx.world.boxOverlapsSolid(min, max, this)) return false;
    // Must stay supported at the same height (no pushing off ledges).
    const support = this.ctx.world.groundAt(nx, nz, Math.min(s.x, s.z) * 0.5, this.base.y + 0.02, 0.04, this);
    if (Math.abs(support.height - this.base.y) > 0.03) return false;
    this.base.x = nx;
    this.base.z = nz;
    this.root.position.copy(this.base);
    this.collider.min.set(nx - s.x / 2, this.base.y, nz - s.z / 2);
    this.collider.max.set(nx + s.x / 2, this.base.y + s.y, nz + s.z / 2);
    return true;
  }

  release(): void {
    if (!this.ctx) return;
    this.ctx.flags.set(`pos:${this.id}`, [this.base.x, this.base.z]);
    this.ctx.world.markChanged();
    this.opts.onMoved?.(this.ctx, this.base);
  }

  applyState(ctx: GameContext): void {
    const saved = ctx.flags.get<[number, number] | undefined>(`pos:${this.id}`);
    if (saved) {
      this.base.x = saved[0];
      this.base.z = saved[1];
      this.root.position.copy(this.base);
      const s = this.opts.size;
      this.collider.min.set(this.base.x - s.x / 2, this.base.y, this.base.z - s.z / 2);
      this.collider.max.set(this.base.x + s.x / 2, this.base.y + s.y, this.base.z + s.z / 2);
      ctx.world.markChanged();
    }
  }

  focus(out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(this.center());
  }
}
