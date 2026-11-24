import { CONFIG, POWER_UNLOCK_RANK, type PowerId } from '../core/Config';
import { RANK_TITLES } from '../career/CareerSystem';
import { FreezePower, GravityPower, MeteorPower, PossessionPower, ResurrectionPower, TerraformPower, TimeWarpPower, TornadoPower } from './V4Powers';
import type { Simulation } from '../simulation/SimulationManager';
import type { DivinePower } from './DivinePower';
import { FirePower } from './FirePower';
import { LightningPower } from './LightningPower';
import { MutationPower } from './MutationPower';
import { NaturePower } from './NaturePower';
import { RainPower } from './RainPower';

export interface PowerResult {
  ok: boolean;
  reason?: string;
}

/**
 * Selection-independent activation pipeline: lock → cooldown → energy →
 * target validation → spend → activate. Energy is only spent after every
 * check passes, so rejected actions never cost anything.
 */
export class PowerManager {
  readonly powers: Record<PowerId, DivinePower>;

  constructor(private readonly sim: Simulation) {
    this.powers = {
      rain: new RainPower(),
      lightning: new LightningPower(),
      nature: new NaturePower(),
      fire: new FirePower(),
      mutation: new MutationPower(),
      tornado: new TornadoPower(),
      freeze: new FreezePower(),
      gravity: new GravityPower(),
      terraform: new TerraformPower(),
      timewarp: new TimeWarpPower(),
      possession: new PossessionPower(),
      meteor: new MeteorPower(),
      resurrection: new ResurrectionPower(),
    };
  }

  get meteor(): MeteorPower {
    return this.powers.meteor as MeteorPower;
  }

  get terraform(): TerraformPower {
    return this.powers.terraform as TerraformPower;
  }

  get timewarp(): TimeWarpPower {
    return this.powers.timewarp as TimeWarpPower;
  }

  /** Why a power is locked (player-facing), or null when unlocked. */
  lockReason(id: PowerId): string | null {
    const s = this.sim.state;
    if (s.unlockedPowers.includes(id)) return null;
    if (id === 'mutation') return `Unlocks at ${CONFIG.powers.mutation.unlockChaos} Chaos (or rank 4)`;
    const rank = POWER_UNLOCK_RANK[id];
    if (rank && s.tutorial.done) return `Unlocks at rank ${rank}: ${RANK_TITLES[rank - 1]}`;
    return 'Finish the tutorial to unlock';
  }

  /** Effective cooldown after Divine Overtime / Creative settings. */
  cooldownFor(id: PowerId): number {
    let c = this.powers[id].cooldown;
    if (this.sim.career.overtimeActive()) c *= CONFIG.career.overtime.cooldownMult;
    if (this.sim.state.mode === 'creative' && this.sim.reducedCooldowns) c *= 0.25;
    return c;
  }

  check(id: PowerId, x: number, z: number): PowerResult {
    const s = this.sim.state;
    const power = this.powers[id];
    const locked = this.lockReason(id);
    if (locked) return { ok: false, reason: locked };
    if (s.possession && id !== 'possession') return { ok: false, reason: 'You are busy being a villager' };
    if (s.cooldowns[id] > 0) return { ok: false, reason: 'Recharging…' };
    if (!this.sim.unlimitedEnergy && s.energy < power.energyCost) return { ok: false, reason: 'Not enough divine energy' };
    const reason = power.validate({ sim: this.sim, x, z });
    if (reason) return { ok: false, reason };
    return { ok: true };
  }

  activate(id: PowerId, x: number, z: number): PowerResult {
    const result = this.check(id, x, z);
    if (!result.ok) {
      this.sim.bus.emit('POWER_REJECTED', { power: id, reason: result.reason ?? 'Invalid' });
      return result;
    }
    const power = this.powers[id];
    const s = this.sim.state;
    if (!this.sim.unlimitedEnergy) s.energy = Math.max(0, s.energy - power.energyCost);
    s.cooldowns[id] = this.cooldownFor(id);
    power.activate({ sim: this.sim, x, z });
    this.sim.bus.emit('POWER_USED', { power: id, x, z });
    return result;
  }

  unlock(ids: PowerId[]): void {
    const s = this.sim.state;
    const added = ids.filter((id) => !s.unlockedPowers.includes(id));
    if (!added.length) return;
    s.unlockedPowers.push(...added);
    this.sim.bus.emit('POWERS_UNLOCKED', { powers: added });
  }

  get maxEnergy(): number {
    return CONFIG.energy.max;
  }
}
