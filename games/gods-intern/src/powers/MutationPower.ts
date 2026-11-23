import { CONFIG } from '../core/Config';
import type { MutationData } from '../core/types';
import { BasePower, type PowerContext } from './DivinePower';
import { findMutationTarget } from './MutationDefinitions';

export class MutationPower extends BasePower {
  id = 'mutation' as const;
  name = 'Mutation';
  description = 'Make something strange but harmless: a giant head, a golden tree, or a rock with legs.';
  energyCost = CONFIG.powers.mutation.cost;
  cooldown = CONFIG.powers.mutation.cooldown;
  radius = CONFIG.powers.mutation.radius;

  validate(ctx: PowerContext): string | null {
    if (!this.onIsland(ctx, 74)) return 'Nothing out here to mutate';
    const found = findMutationTarget(ctx.sim, ctx.x, ctx.z);
    return 'reason' in found ? found.reason : null;
  }

  activate(ctx: PowerContext): void {
    const { sim } = ctx;
    const found = findMutationTarget(sim, ctx.x, ctx.z);
    if ('reason' in found) return;
    const { def, target } = found;
    def.apply(sim, target);
    const targetId = target.kind === 'villager' ? target.entity.id : String(target.entity.id);
    const mutation: MutationData = { id: `mu${sim.nextId()}`, kind: def.kind, targetKind: def.targetKind, targetId, createdAt: sim.state.time };
    sim.state.mutations.push(mutation);
    sim.addChaos(4, 'Mutation');
    const [title, text] = def.history(target);
    sim.history.add(title, text, { kind: 'mutation', x: target.x, z: target.z });
    sim.notify(def.label.toUpperCase(), 'chaos', text, 2);
    sim.bus.emit('MUTATION_APPLIED', { mutation, x: target.x, z: target.z });
  }
}
