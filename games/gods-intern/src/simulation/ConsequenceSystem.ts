import type { GameEventName } from '../core/EventBus';
import type { ConsequenceRule, ConsequenceTrigger } from './ConsequenceTypes';
import type { Simulation } from './SimulationManager';
import { CONSEQUENCES } from './ConsequenceDefinitions';

export class ConsequenceSystem {
  private tickTimer = 0;
  readonly fired: string[] = [];

  constructor(
    private readonly sim: Simulation,
    private readonly rules: ConsequenceRule[] = CONSEQUENCES,
  ) {
    const triggers = new Set(rules.map((r) => r.trigger).filter((t): t is GameEventName => t !== 'TICK'));
    for (const trigger of triggers) {
      sim.bus.on(trigger, (payload) => this.evaluate(trigger, payload));
    }
  }

  update(dt: number): void {
    this.tickTimer -= dt;
    if (this.tickTimer > 0) return;
    this.tickTimer = 1;
    this.evaluate('TICK', null);
  }

  private evaluate(trigger: ConsequenceTrigger, payload: unknown): void {
    const sim = this.sim;
    const cooldowns = sim.state.consequenceCooldowns;
    for (const r of this.rules) {
      if (r.trigger !== trigger) continue;
      if ((cooldowns[r.id] ?? -Infinity) > sim.state.time) continue;
      if (!r.condition(sim, payload as never)) continue;
      if (r.probability !== undefined && sim.rng.next() > r.probability) continue;
      cooldowns[r.id] = sim.state.time + r.cooldown;
      r.effects?.(sim, payload as never);
      if (r.notify) sim.notify(r.notify.text, r.notify.kind, r.notify.sub);
      if (r.god) sim.godMessage(r.god.text, r.god.priority ?? 1);
      this.fired.push(r.id);
      if (this.fired.length > 50) this.fired.shift();
      sim.bus.emit('CONSEQUENCE_TRIGGERED', { id: r.id, title: r.title });
    }
  }
}
