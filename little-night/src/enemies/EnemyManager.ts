import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import { HushAI } from './HushAI';
import { NavGrid } from './NavGrid';
import { HideVolume } from '../objects/HideSpot';

/** Owns THE HUSH and its navigation grid for the current level. */
export class EnemyManager {
  hush: HushAI | null = null;
  nav: NavGrid | null = null;
  private rebuildTimer = 0;
  private wasConcealed = new Set<string>();
  private ctxRef: GameContext | null = null;

  constructor(private readonly scene: THREE.Scene) {}

  setup(nav: NavGrid, ctx: GameContext): HushAI {
    this.nav = nav;
    this.ctxRef = ctx;
    nav.rebuildIfNeeded(ctx.world);
    if (!this.hush) this.hush = new HushAI(this.scene, nav);
    else this.hush.setNav(nav);
    this.hush.spots = [];
    this.hush.perches = [];
    this.hush.patrol = [];
    this.hush.guard = null;
    this.hush.exitPoint = null;
    this.hush.leaveAfterSearch = false;
    this.hush.onStateChange = null;
    this.hush.despawn(ctx, true);
    this.wasConcealed.clear();
    return this.hush;
  }

  clear(ctx: GameContext): void {
    this.hush?.despawn(ctx, true);
    this.nav = null;
  }

  canSeePlayerNow(): boolean {
    return Boolean(this.hush && this.ctxRef && this.hush.active && this.hush.canSee(this.ctxRef));
  }

  hear(ctx: GameContext, pos: THREE.Vector3, radius: number, kind: string): void {
    this.hush?.hear(ctx, pos, radius, kind);
  }

  update(dt: number, ctx: GameContext): void {
    if (!this.hush || !this.nav) return;
    this.rebuildTimer -= dt;
    if (this.rebuildTimer <= 0) {
      this.rebuildTimer = 0.5;
      this.nav.rebuildIfNeeded(ctx.world);
    }
    // Crawling under furniture while watched gives the spot away.
    for (const spot of this.hush.spots) {
      if (!(spot instanceof HideVolume)) continue;
      const inside = spot.contains(ctx);
      if (inside && !this.wasConcealed.has(spot.id) && this.hush.seesPlayer) spot.compromised = 6;
      if (inside) this.wasConcealed.add(spot.id);
      else this.wasConcealed.delete(spot.id);
      spot.compromised = Math.max(0, spot.compromised - dt);
    }
    this.hush.update(dt, ctx);
  }

  /** 0..1 fear contribution from THE HUSH. */
  fear(ctx: GameContext): number {
    const h = this.hush;
    if (!h || !h.active) return 0;
    const d = h.position.distanceTo(ctx.player.position);
    let f = Math.max(0, 1 - d / 9) * 0.75;
    if (h.seesPlayer) f += 0.2;
    if (h.state === 'chase') f = Math.max(f, 0.85);
    if (h.state === 'searchSpot' && d < 2.5) f = Math.max(f, 0.8);
    return Math.min(1, f);
  }
}
