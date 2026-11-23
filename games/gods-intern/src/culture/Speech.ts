import { CONFIG } from '../core/Config';
import type { VillagerData } from '../core/types';
import type { Simulation } from '../simulation/SimulationManager';
import { has } from './Personality';
import { hash2 } from '../core/Rng';

/**
 * Rate-limited villager speech. Keeps chatter brief and sparse: a global
 * interval between lines, a per-villager cooldown, and priority to bypass the
 * global limit for important moments. Dramatic villagers talk more.
 */
export class SpeechDirector {
  private last = -99;
  private readonly perVillager = new Map<string, number>();

  say(v: VillagerData | undefined, text: string, priority = 1, duration = 3.2): boolean {
    if (!v || !v.alive) return false;
    const now = this.sim.state.time;
    const cool = CONFIG.culture.speechVillagerCooldown * (has(v, 'dramatic') ? 0.5 : 1);
    if (now - (this.perVillager.get(v.id) ?? -99) < cool) return false;
    if (priority < 2 && now - this.last < CONFIG.culture.speechInterval) return false;
    this.last = now;
    this.perVillager.set(v.id, now);
    this.sim.bus.emit('SPEECH', { villagerId: v.id, text, duration, priority });
    return true;
  }

  /** Let up to `count` witnesses react, dramatic ones first. */
  react(witnesses: VillagerData[], lines: string[], count = 2, priority = 1): void {
    if (!witnesses.length || !lines.length) return;
    const ordered = [...witnesses].sort((a, b) => Number(has(b, 'dramatic')) - Number(has(a, 'dramatic')));
    let said = 0;
    for (const v of ordered) {
      if (said >= count) break;
      // Cosmetic choice: hashed, never consumes the gameplay RNG (keeps saves deterministic).
      const line = lines[Math.floor(hash2(Math.floor(this.sim.state.time * 10), v.id.length + said, lines.length) * lines.length)];
      if (this.say(v, line, priority)) said++;
    }
  }

  constructor(private readonly sim: Simulation) {}
}
