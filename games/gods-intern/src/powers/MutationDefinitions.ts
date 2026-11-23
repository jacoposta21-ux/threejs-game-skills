import type { MutationKind, RockData, TreeData, VillagerData } from '../core/types';
import type { Simulation } from '../simulation/SimulationManager';

export type MutationTarget =
  | { kind: 'villager'; entity: VillagerData; x: number; z: number; d: number }
  | { kind: 'tree'; entity: TreeData; x: number; z: number; d: number }
  | { kind: 'rock'; entity: RockData; x: number; z: number; d: number };

export interface MutationDefinition {
  kind: MutationKind;
  targetKind: MutationTarget['kind'];
  label: string;
  pickRadius: number;
  /** Candidates near the cursor (any state); validity is decided separately. */
  candidates(sim: Simulation, x: number, z: number): MutationTarget[];
  /** null if this target can be mutated, otherwise the player-facing reason. */
  invalid(sim: Simulation, t: MutationTarget): string | null;
  apply(sim: Simulation, t: MutationTarget): void;
  history: (t: MutationTarget) => [string, string];
}

/**
 * Data-driven mutations. Adding a new one means adding an entry here — the
 * power, validation, persistence (state.mutations) and history are shared.
 * All mutations are harmless: they change appearance and behavior, never
 * remove an entity, and do not touch pathfinding obstacles.
 */
export const MUTATIONS: MutationDefinition[] = [
  {
    kind: 'giant-head',
    targetKind: 'villager',
    label: 'Giant Head',
    pickRadius: 1.9,
    candidates: (sim, x, z) =>
      sim.villagersNear(x, z, 1.9, []).map((v) => ({ kind: 'villager' as const, entity: v, x: v.position.x, z: v.position.z, d: Math.hypot(v.position.x - x, v.position.z - z) })),
    invalid: (_sim, t) => ((t.entity as VillagerData).mutation ? 'That head is already magnificent' : null),
    apply: (_sim, t) => {
      const v = t.entity as VillagerData;
      v.mutation = 'giant-head';
      v.faith = Math.min(1, v.faith + 0.2);
    },
    history: (t) => ['A Head Was Enlarged', `${(t.entity as VillagerData).name}'s head became enormous. They report thinking "roughly twice as much".`],
  },
  {
    kind: 'golden-tree',
    targetKind: 'tree',
    label: 'Golden Tree',
    pickRadius: 1.9,
    candidates: (sim, x, z) =>
      sim.treesNear(x, z, 1.9, []).filter((t) => !t.removed).map((t) => ({ kind: 'tree' as const, entity: t, x: t.x, z: t.z, d: Math.hypot(t.x - x, t.z - z) })),
    invalid: (_sim, t) => {
      const tree = t.entity as TreeData;
      if (tree.golden) return 'Already golden. Any more would be tacky';
      if (tree.charred) return 'Charred trees cannot be gilded';
      if (tree.growth < 0.6) return 'Let it grow up first';
      return null;
    },
    apply: (sim, t) => {
      const tree = t.entity as TreeData;
      tree.golden = true;
      tree.health = 1;
      if (tree.burning) {
        const f = sim.state.fires.find((fire) => fire.kind === 'tree' && fire.targetId === tree.id);
        if (f) f.intensity = 0;
      }
    },
    history: () => ['A Tree Turned to Gold', 'A perfectly normal tree became solid gold. It no longer burns, and nobody can chop it.'],
  },
  {
    kind: 'walking-rock',
    targetKind: 'rock',
    label: 'Walking Rock',
    pickRadius: 2.6,
    candidates: (sim, x, z) =>
      sim.state.rocks.map((r) => ({ kind: 'rock' as const, entity: r, x: r.x, z: r.z, d: Math.hypot(r.x - x, r.z - z) })).filter((c) => c.d <= 2.6 * (c.entity as RockData).scale),
    invalid: (_sim, t) => ((t.entity as RockData).walking ? 'This rock is already on a journey' : null),
    apply: (_sim, t) => {
      const r = t.entity as RockData;
      r.walking = true;
      r.targetX = r.x;
      r.targetZ = r.z;
    },
    history: () => ['A Rock Grew Legs', 'A boulder sprouted two tiny legs and wandered off. Villagers are confused, then delighted.'],
  },
];

/** Nearest valid target across all mutation kinds; reports the closest invalid reason otherwise. */
export function findMutationTarget(sim: Simulation, x: number, z: number): { def: MutationDefinition; target: MutationTarget } | { reason: string } {
  let best: { def: MutationDefinition; target: MutationTarget } | null = null;
  let reason: string | null = null;
  let reasonD = Infinity;
  for (const def of MUTATIONS) {
    for (const t of def.candidates(sim, x, z)) {
      const why = def.invalid(sim, t);
      if (why) {
        if (t.d < reasonD) {
          reasonD = t.d;
          reason = why;
        }
        continue;
      }
      if (!best || t.d < best.target.d) best = { def, target: t };
    }
  }
  if (best) return best;
  return { reason: reason ?? 'Nothing here wants to be mutated' };
}
