import type { PowerId } from '../core/Config';
import type { Simulation } from '../simulation/SimulationManager';

export interface PowerContext {
  sim: Simulation;
  x: number;
  z: number;
}

export interface DivinePower {
  id: PowerId;
  name: string;
  description: string;
  energyCost: number;
  cooldown: number;
  radius: number;
  /** Returns null when the target is valid, otherwise a short player-facing reason. */
  validate(context: PowerContext): string | null;
  canActivate(context: PowerContext): boolean;
  activate(context: PowerContext): void;
  update?(dt: number): void;
}

export abstract class BasePower implements DivinePower {
  abstract id: PowerId;
  abstract name: string;
  abstract description: string;
  abstract energyCost: number;
  abstract cooldown: number;
  abstract radius: number;
  abstract validate(context: PowerContext): string | null;
  abstract activate(context: PowerContext): void;

  canActivate(context: PowerContext): boolean {
    return this.validate(context) === null;
  }

  protected onIsland(ctx: PowerContext, maxRadius = 76): boolean {
    return Math.hypot(ctx.x, ctx.z) < maxRadius;
  }
}
