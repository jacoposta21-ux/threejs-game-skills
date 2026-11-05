import * as THREE from 'three';
import type { GameContext } from '../core/Context';

/**
 * Aggregates danger into one 0..1 fear value. Effects are deliberately soft:
 * breathing, audio low-pass/drive, slow camera sway, peripheral darkness.
 */
export class FearSystem {
  value = 0;
  /** Extra fear from scripted moments, decays on its own. */
  spike = 0;
  /** Minimum fear set by a level (e.g. finale). */
  floor = 0;

  addSpike(amount: number): void {
    this.spike = Math.max(this.spike, amount);
  }

  update(dt: number, ctx: GameContext): number {
    this.spike = Math.max(0, this.spike - dt * 0.35);
    let target = ctx.enemies.fear(ctx);
    target = Math.max(target, ctx.hazards.grab * 0.9);
    if (ctx.hazards.inZone && !ctx.hazards.lit) target = Math.max(target, 0.35);
    // Being in the dark without LUMO's light is unsettling, never terrifying.
    if (!ctx.lumo.isLit && ctx.lumo.found) target = Math.max(target, 0.12);
    target = Math.max(target, this.spike, this.floor);
    const rate = target > this.value ? 2.2 : 0.6;
    this.value = THREE.MathUtils.damp(this.value, target, rate, dt);
    return this.value;
  }
}
