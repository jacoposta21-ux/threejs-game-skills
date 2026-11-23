import { CONFIG, type PowerId } from '../core/Config';
import type { Simulation } from '../simulation/SimulationManager';
import type { DivinePower } from './DivinePower';
import { FirePower } from './FirePower';
import { LightningPower } from './LightningPower';
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
    };
  }

  check(id: PowerId, x: number, z: number): PowerResult {
    const s = this.sim.state;
    const power = this.powers[id];
    if (!s.unlockedPowers.includes(id)) return { ok: false, reason: 'Finish the tutorial to unlock' };
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
    s.cooldowns[id] = power.cooldown;
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
