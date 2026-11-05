import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import { Interactable, type Prompt } from './Interactable';

/** Small toy or utensil: carry it in hand and throw it to make a noise elsewhere. */
export class Throwable extends Interactable {
  private velocity = new THREE.Vector3();
  private flying = false;
  private spin = new THREE.Vector3();
  private home = new THREE.Vector3();
  holding = false;
  onLand: ((ctx: GameContext, pos: THREE.Vector3) => void) | null = null;

  constructor(id: string, readonly visual: THREE.Object3D, readonly label: string, readonly sound: 'clatter' | 'thunk') {
    super(id);
    this.root.add(visual);
    this.addHitBox(0.22, 0.16, 0.22, 0, -0.03, 0);
    this.range = 1.4;
  }

  prompt(ctx: GameContext): Prompt | null {
    if (this.flying || this.holding) return null;
    if (ctx.interactions.held) return { verb: 'Hands are full', disabled: true };
    if (this.root.position.y > ctx.player.reachY + 0.05) return { verb: 'Too high to reach', disabled: true };
    return { verb: `Pick up ${this.label}`, key: 'E' };
  }

  interact(ctx: GameContext): void {
    this.home.copy(this.root.position);
    this.holding = true;
    this.enabled = false;
    ctx.interactions.held = this;
    ctx.audio.play('pickup', { volume: 0.5 });
    // Carry in the right hand.
    this.root.removeFromParent();
    ctx.hands.holdSocket.add(this.root);
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    this.root.scale.setScalar(0.55);
    ctx.ui.hint('E / click: throw it somewhere to make a noise', 4);
  }

  launch(ctx: GameContext, origin: THREE.Vector3, dir: THREE.Vector3): void {
    this.holding = false;
    this.root.removeFromParent();
    ctx.scene.add(this.root);
    this.root.scale.setScalar(1);
    this.root.position.copy(origin);
    this.velocity.copy(dir).multiplyScalar(6.2);
    this.velocity.y += 2.0;
    this.spin.set(8 + ctx.rng() * 6, ctx.rng() * 4, 5);
    this.flying = true;
  }

  /** Drop back in place (checkpoint reset). */
  resetTo(ctx: GameContext, parent: THREE.Object3D, pos: THREE.Vector3): void {
    this.holding = false;
    this.flying = false;
    this.root.removeFromParent();
    parent.add(this.root);
    this.root.scale.setScalar(1);
    this.root.position.copy(pos);
    this.enabled = true;
    ctx.interactions.markDirty();
  }

  update(dt: number, ctx: GameContext): void {
    if (!this.flying) return;
    const prev = this.root.position.clone();
    this.velocity.y -= 12 * dt;
    const next = prev.clone().addScaledVector(this.velocity, dt);
    const hit = ctx.world.raycast(prev, next, (c) => c.solid);
    this.root.rotation.x += this.spin.x * dt;
    this.root.rotation.y += this.spin.y * dt;
    if (hit !== Infinity) {
      const dir = next.clone().sub(prev).normalize();
      const pos = prev.clone().addScaledVector(dir, Math.max(0, hit - 0.06));
      // Settle down to the surface below.
      const ground = ctx.world.groundAt(pos.x, pos.z, 0.05, pos.y + 0.05, 0.1);
      pos.y = Math.max(0.03, ground.height + 0.03);
      if (ground.height < -1) pos.y = 0.03;
      this.land(ctx, pos);
      return;
    }
    if (next.y < 0.03) {
      next.y = 0.03;
      this.land(ctx, next);
      return;
    }
    this.root.position.copy(next);
  }

  private land(ctx: GameContext, pos: THREE.Vector3): void {
    this.flying = false;
    this.root.position.copy(pos);
    this.root.rotation.set(0, this.root.rotation.y, Math.PI / 2 * Math.round(this.root.rotation.z / (Math.PI / 2)));
    ctx.audio.play(this.sound, { pos });
    ctx.noise.emit(pos, 11, 'throw');
    this.enabled = true;
    ctx.interactions.markDirty();
    this.onLand?.(ctx, pos);
  }
}
