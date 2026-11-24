import { CONFIG, type PowerId } from '../core/Config';
import type { Simulation } from '../simulation/SimulationManager';

/**
 * Lightweight power mastery (v0.5). Each unlocked power has a few goals detected from
 * events the simulation already emits. Goals are optional extra XP (no prerequisites),
 * each awarded once through the career ledger (`mastery:<id>`), so no new save state.
 * Benevolent and chaotic goals are mixed so both play styles progress.
 */
export interface MasteryGoal {
  id: string;
  power: PowerId;
  label: string;
}

export const MASTERY: MasteryGoal[] = [
  { id: 'rain-water', power: 'rain', label: 'Refill a thirsty village' },
  { id: 'rain-crops', power: 'rain', label: 'Water a field during a food shortage' },
  { id: 'rain-fire', power: 'rain', label: 'Put out a fire with rain' },
  { id: 'lightning-rock', power: 'lightning', label: 'Strike a rock in front of witnesses' },
  { id: 'lightning-sacred', power: 'lightning', label: 'Start a sacred tradition' },
  { id: 'lightning-culture', power: 'lightning', label: 'Cause a cultural reaction' },
  { id: 'nature-grove', power: 'nature', label: 'Grow a grove of 8 trees' },
  { id: 'nature-regrow', power: 'nature', label: 'Replant where something burned' },
  { id: 'nature-three', power: 'nature', label: 'Plant trees in all three villages' },
  { id: 'fire-consequence', power: 'fire', label: 'Discover what fire leads to' },
  { id: 'fire-recovery', power: 'fire', label: 'Let a village recover from a fire' },
  { id: 'mutation-two', power: 'mutation', label: 'Cause two different mutations' },
  { id: 'tornado-dodge', power: 'tornado', label: 'Run a tornado without destroying a building' },
  { id: 'tornado-damage', power: 'tornado', label: 'Rearrange a village with wind' },
  { id: 'freeze-fire', power: 'freeze', label: 'Freeze out a fire' },
  { id: 'freeze-combo', power: 'freeze', label: 'Discover what frost does with something else' },
  { id: 'gravity-lift', power: 'gravity', label: 'Lift five villagers at once' },
  { id: 'terraform-both', power: 'terraform', label: 'Raise and lower the land' },
  { id: 'timewarp-build', power: 'timewarp', label: 'Speed up a construction' },
  { id: 'possession-visit', power: 'possession', label: 'Visit another village as a villager' },
  { id: 'meteor-recover', power: 'meteor', label: 'Cool a crater with rain' },
  { id: 'resurrection-one', power: 'resurrection', label: 'Bring someone back' },
];

export class MasteryTracker {
  private readonly treeVillages = new Set<string>();
  private readonly mutationKinds = new Set<string>();
  private readonly burned: Array<{ x: number; z: number; t: number }> = [];
  private terraform = { up: false, down: false };
  private tornadoDestroyed = false;
  private readonly near: import('../core/types').VillagerData[] = [];

  constructor(private readonly sim: Simulation) {
    const bus = sim.bus;
    bus.on('PRAYER_COMPLETED', ({ prayer }) => {
      if (prayer.type === 'THIRST') this.done('rain-water');
      if (prayer.type === 'HUNGER') this.done('rain-crops');
      if (prayer.type === 'FIRE') this.done('fire-recovery');
    });
    bus.on('FIRE_EXTINGUISHED', (e) => {
      if (e.byRain) this.done('rain-fire');
      if (e.byFreeze) this.done('freeze-fire');
    });
    bus.on('FIRE_STARTED', (e) => {
      this.burned.push({ x: e.x, z: e.z, t: sim.state.time });
      if (this.burned.length > 40) this.burned.shift();
    });
    bus.on('LIGHTNING_STRUCK', (e) => {
      if (e.rockIds.length && sim.villagersNear(e.x, e.z, 14, this.near).length >= 3) this.done('lightning-rock');
    });
    bus.on('SACRED_CREATED', () => this.done('lightning-sacred'));
    bus.on('SURREAL_EVENT', () => this.done('lightning-culture'));
    bus.on('CONSEQUENCE_TRIGGERED', () => this.done('fire-consequence'));
    bus.on('TREE_PLANTED', (e) => {
      if (!e.byPlayer) return;
      const alive = sim.state.trees.filter((t) => t.byPlayer && !t.removed && Math.hypot(t.x - e.x, t.z - e.z) < 18).length;
      if (alive >= 8) this.done('nature-grove');
      const v = sim.nearestVillage(e.x, e.z);
      if (v.village && v.distance < v.village.radius + 12) this.treeVillages.add(v.village.id);
      if (this.treeVillages.size >= 3) this.done('nature-three');
      if (this.burned.some((b) => Math.hypot(b.x - e.x, b.z - e.z) < 6)) this.done('nature-regrow');
    });
    bus.on('MUTATION_APPLIED', (e) => {
      this.mutationKinds.add(e.mutation.kind);
      if (this.mutationKinds.size >= 2) this.done('mutation-two');
    });
    bus.on('EFFECT_STARTED', (e) => {
      if (e.kind === 'tornado') this.tornadoDestroyed = false;
    });
    bus.on('TORNADO_DAMAGE', (e) => {
      if (e.buildings > 0) {
        this.tornadoDestroyed = true;
        this.done('tornado-damage');
      }
    });
    bus.on('EFFECT_ENDED', (e) => {
      if (e.kind === 'tornado' && !this.tornadoDestroyed) this.done('tornado-dodge');
    });
    bus.on('COMBO_DISCOVERED', (e) => {
      if (e.id === 'steam-thaw' || e.id === 'permafrost' || e.id === 'frozen-garden') this.done('freeze-combo');
      if (e.id === 'cooling-shower') this.done('meteor-recover');
    });
    bus.on('VILLAGER_LEVITATED', () => {
      const lifted = sim.state.villagers.filter((v) => v.alive && (v.lift ?? 0) > 0.2).length;
      if (lifted >= 5) this.done('gravity-lift');
    });
    bus.on('TERRAIN_CHANGED', (e) => {
      if (e.delta > 0) this.terraform.up = true;
      if (e.delta < 0) this.terraform.down = true;
      if (this.terraform.up && this.terraform.down) this.done('terraform-both');
    });
    bus.on('CONSTRUCTION_IN_WARP', () => this.done('timewarp-build'));
    bus.on('POSSESSED_VISIT', () => this.done('possession-visit'));
    bus.on('VILLAGER_RESURRECTED', () => this.done('resurrection-one'));
  }

  isDone(id: string): boolean {
    return !!this.sim.state.career.awarded[`mastery:${id}`];
  }

  /** Goals for one power with completion, for the All Powers panel. */
  goals(power: PowerId): Array<MasteryGoal & { done: boolean }> {
    return MASTERY.filter((g) => g.power === power).map((g) => ({ ...g, done: this.isDone(g.id) }));
  }

  private done(id: string): void {
    const goal = MASTERY.find((g) => g.id === id);
    const s = this.sim.state;
    if (!goal || s.mode !== 'career' || !s.unlockedPowers.includes(goal.power) || this.isDone(id)) return;
    this.sim.career.award(`mastery:${id}`, CONFIG.career.xp.mastery, `Mastery: ${goal.label}`, { once: true });
  }
}
