import { CONFIG } from '../core/Config';
import { BasePower, type PowerContext } from './DivinePower';

export class RainPower extends BasePower {
  id = 'rain' as const;
  name = 'Rain';
  description = 'Summon a rain cloud. Waters crops, fills wells and puts out fires. Too much floods.';
  energyCost = CONFIG.powers.rain.cost;
  cooldown = CONFIG.powers.rain.cooldown;
  radius = CONFIG.powers.rain.radius;

  validate(ctx: PowerContext): string | null {
    if (!this.onIsland(ctx, 74)) return 'Clouds refuse to leave the island';
    return null;
  }

  activate(ctx: PowerContext): void {
    const { sim } = ctx;
    const cloud = {
      id: sim.nextId(),
      x: ctx.x,
      z: ctx.z,
      radius: this.radius,
      timeLeft: CONFIG.powers.rain.duration,
      duration: CONFIG.powers.rain.duration,
    };
    sim.state.clouds.push(cloud);
    sim.state.stats.rainsCast++;
    sim.bus.emit('RAIN_STARTED', { cloudId: cloud.id, x: cloud.x, z: cloud.z, radius: cloud.radius });
  }
}
