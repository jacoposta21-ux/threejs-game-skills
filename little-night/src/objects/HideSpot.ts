import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import { Interactable, type Prompt } from './Interactable';
import type { HideTarget } from '../player/PlayerController';

export interface SearchableSpot {
  id: string;
  /** Where THE HUSH stands to search. */
  searchPos: THREE.Vector3;
  /** Point it leans toward. */
  lookAt: THREE.Vector3;
  contains(ctx: GameContext): boolean;
  compromised: number;
}

/** Enterable hiding place (wardrobe, cupboard, laundry basket, trunk). */
export class HideSpot extends Interactable implements HideTarget, SearchableSpot {
  compromised = 0;
  onEnter: ((ctx: GameContext) => void) | null = null;
  constructor(
    id: string,
    readonly viewPos: THREE.Vector3,
    readonly viewYaw: number,
    readonly exitPos: THREE.Vector3,
    readonly exitYaw: number,
    readonly searchPos: THREE.Vector3,
    readonly lookAt: THREE.Vector3,
    readonly verb = 'Hide',
  ) {
    super(id);
    this.range = 1.5;
  }

  prompt(ctx: GameContext): Prompt | null {
    if (ctx.interactions.held) return { verb: 'Hands are full', disabled: true };
    return { verb: this.verb, key: 'E' };
  }

  interact(ctx: GameContext): void {
    ctx.player.enterHide(this);
    ctx.audio.play('creak', { pos: this.viewPos, volume: 0.6 });
    ctx.noise.emit(this.viewPos, 2.2, 'hide');
    // If THE HUSH watched you go in, it will know.
    if (ctx.enemies.canSeePlayerNow()) this.compromised = 6;
    this.onEnter?.(ctx);
  }

  contains(ctx: GameContext): boolean {
    return ctx.player.hideSpot === this;
  }

  update(dt: number): void {
    this.compromised = Math.max(0, this.compromised - dt);
  }
}

/** Passive concealment: crawl under a bed/table to hide. */
export class HideVolume implements SearchableSpot {
  compromised = 0;
  constructor(
    readonly id: string,
    readonly min: THREE.Vector3,
    readonly max: THREE.Vector3,
    readonly searchPos: THREE.Vector3,
    readonly lookAt: THREE.Vector3,
  ) {}

  containsPoint(p: THREE.Vector3): boolean {
    return p.x > this.min.x && p.x < this.max.x && p.z > this.min.z && p.z < this.max.z && p.y < this.max.y;
  }

  contains(ctx: GameContext): boolean {
    return ctx.player.crawling && this.containsPoint(ctx.player.position);
  }
}
