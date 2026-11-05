import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import { Interactable, type Prompt } from './Interactable';

export interface PickupOptions {
  item: string;
  name: string;
  icon: string;
  examine?: string;
  /** Reachable only from stance height (checked against hand reach). */
  onPicked?: (ctx: GameContext) => void;
  verb?: string;
  /** Player feet must be at least this high (e.g. standing on a counter). */
  minPlayerY?: number;
}

/** Key puzzle item: goes into the inventory. */
export class Pickup extends Interactable {
  constructor(id: string, readonly visual: THREE.Object3D, readonly opts: PickupOptions) {
    super(id);
    this.root.add(visual);
    const box = new THREE.Box3().setFromObject(visual);
    if (box.isEmpty()) box.set(new THREE.Vector3(-0.08, 0, -0.08), new THREE.Vector3(0.08, 0.1, 0.08));
    const size = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    this.addHitBox(Math.max(0.16, size.x + 0.08), Math.max(0.14, size.y + 0.08), Math.max(0.16, size.z + 0.08), c.x, box.min.y - 0.04, c.z);
    this.range = 1.5;
  }

  prompt(ctx: GameContext): Prompt | null {
    if (this.opts.minPlayerY !== undefined && ctx.player.position.y < this.opts.minPlayerY) return { verb: 'It\u2019s at the back of the counter, out of reach', disabled: true };
    if (this.focus().y > ctx.player.reachY + 0.05) return { verb: 'Too high to reach', disabled: true };
    return { verb: `${this.opts.verb ?? 'Pick up'} ${this.opts.name}`, key: 'E' };
  }

  interact(ctx: GameContext): void {
    this.take(ctx);
    ctx.audio.play('pickup', { pos: this.focus() });
    ctx.ui.itemGained(this.opts.name, this.opts.icon);
    if (this.opts.examine) ctx.ui.toast(this.opts.examine, 4);
    ctx.events.emit('pickup', { id: this.opts.item, name: this.opts.name });
    this.opts.onPicked?.(ctx);
  }

  take(ctx: GameContext): void {
    ctx.inventory.add(this.opts.item);
    ctx.flags.set(`got:${this.id}`);
    this.root.visible = false;
    this.root.userData.taken = true;
    this.enabled = false;
    ctx.interactions.markDirty();
  }

  applyState(ctx: GameContext): void {
    if (ctx.flags.has(`got:${this.id}`)) {
      this.root.visible = false;
      this.root.userData.taken = true;
      this.enabled = false;
    }
  }
}
