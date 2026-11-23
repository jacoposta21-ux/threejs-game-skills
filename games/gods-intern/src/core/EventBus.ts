import type { PowerId } from './Config';
import type { Caravan, RelationCategory, BuildingType, DivineMemory, FireKind, HistoryEntry, MutationData, PrayerData, Religion, RitualDefinition, SacredObject } from './types';

export type NotifyKind = 'good' | 'bad' | 'info' | 'chaos' | 'culture';

/** Every gameplay event and its typed payload. */
export interface GameEvents {
  POWER_USED: { power: PowerId; x: number; z: number };
  POWER_REJECTED: { power: PowerId; reason: string };
  RAIN_STARTED: { cloudId: number; x: number; z: number; radius: number };
  RAIN_STOPPED: { cloudId: number; x: number; z: number };
  LIGHTNING_STRUCK: {
    x: number;
    z: number;
    y: number;
    treesIgnited: number;
    buildingsHit: number;
    villagersKilled: number;
    witnesses: number;
    villageId: string | null;
    distanceToVillage: number;
    rockIds: number[];
    survivorTreeIds: number[];
  };
  FIRE_STARTED: { fireId: number; x: number; z: number; kind: FireKind; byPlayer: boolean };
  FIRE_SPREAD: { fromId: number; fireId: number; x: number; z: number; kind: FireKind };
  FIRE_EXTINGUISHED: { fireId: number; x: number; z: number; byRain: boolean; kind: FireKind; targetId: number; byPlayer: boolean };
  TREE_PLANTED: { treeId: number; x: number; z: number; byPlayer: boolean };
  TREE_BURNED: { treeId: number; x: number; z: number };
  TREE_REGROWN: { treeId: number; x: number; z: number };
  VILLAGER_DIED: { villagerId: string; name: string; cause: string; x: number; z: number; byPlayer: boolean };
  VILLAGER_BORN: { villagerId: string; name: string; villageId: string };
  BUILDING_DAMAGED: { buildingId: number; type: BuildingType; health: number };
  BUILDING_DESTROYED: { buildingId: number; type: BuildingType; villageId: string };
  BUILDING_REPAIRED: { buildingId: number; type: BuildingType };
  RESOURCE_DEPLETED: { villageId: string; resource: 'food' | 'water' | 'wood' };
  VILLAGE_STARVING: { villageId: string };
  FLOOD_STARTED: { villageId: string; level: number; x: number; z: number };
  FLOOD_RECEDED: { villageId: string };
  FLOOD_RISK: { villageId: string; moisture: number };
  CROPS_DAMAGED: { buildingId: number; cropHealth: number };
  HARVEST: { villageId: string; amount: number };
  PRAYER_CREATED: { prayer: PrayerData };
  PRAYER_COMPLETED: { prayer: PrayerData };
  PRAYER_FAILED: { prayer: PrayerData };
  FAITH_CHANGED: { villageId: string; faith: number; delta: number };
  APPROVAL_CHANGED: { value: number; delta: number; reason: string };
  CHAOS_CHANGED: { value: number; delta: number; reason: string };
  VILLAGERS_CELEBRATE: { villageId: string; x: number; z: number; reason: string };
  MIRACLE_WITNESSED: { villageId: string; kind: string; witnesses: number; x: number; z: number };
  CONSEQUENCE_TRIGGERED: { id: string; title: string };
  NOTIFY: { text: string; kind: NotifyKind; sub?: string; priority?: number };
  GOD_MESSAGE: { text: string; priority: number };
  SPEECH: { villagerId: string; text: string; duration: number; priority?: number };
  // ---- v0.2 culture ----
  MEMORY_CREATED: { memory: DivineMemory };
  RELIGION_FOUNDED: { religion: Religion };
  RELIGION_FADED: { religion: Religion; reason: string };
  CONVERSION: { villagerId: string; religionId: string };
  SACRED_CREATED: { sacred: SacredObject };
  SACRED_STAGE: { sacred: SacredObject; stage: number };
  SACRED_DAMAGED: { sacred: SacredObject; reason: string };
  RITUAL_STARTED: { religionId: string; ritual: RitualDefinition; x: number; z: number; attendees: number };
  RITUAL_COMPLETED: { religionId: string; ritual: RitualDefinition; attendees: number };
  MUTATION_APPLIED: { mutation: MutationData; x: number; z: number };
  HISTORY_ADDED: { entry: HistoryEntry };
  SURREAL_EVENT: { id: string; title: string; x: number; z: number };
  // ---- v0.3 civilization ----
  TRADE_STARTED: { caravan: Caravan };
  TRADE_COMPLETED: { caravan: Caravan };
  TRADE_FAILED: { caravan: Caravan; reason: string };
  VILLAGER_MIGRATED: { villagerId: string; name: string; fromId: string; toId: string; reason: string };
  MIGRATION_STARTED: { villagerId: string; fromId: string; toId: string; reason: string };
  RELIGION_SPREAD: { religionId: string; villageId: string; via: string };
  RELATIONSHIP_CHANGED: { a: string; b: string; score: number; from: RelationCategory; to: RelationCategory; cause: string };
  DIVINE_FAVOR_CHANGED: { villageId: string; amount: number; kind: string; total: number };
  FAVORITISM: { favoredId: string; jealousId: string; kind: 'jealousy' | 'resentment'; gap: number };
  MONUMENT_COMPLETED: { sacredId: string; label: string; x: number; z: number };
  CHALLENGE_UNLOCKED: { id: string };
  CHALLENGE_COMPLETED: { id: string; title: string; rewardText: string };
  CAMERA_VISIT: { villageId: string };
  PILGRIMAGE_COMPLETED: { villagerId: string; sacredId: string; fromId: string };
  TUTORIAL_STEP: { step: number };
  POWERS_UNLOCKED: { powers: PowerId[] };
}

export type GameEventName = keyof GameEvents;
type Handler<K extends GameEventName> = (payload: GameEvents[K]) => void;

export class EventBus {
  private handlers = new Map<GameEventName, Set<Handler<GameEventName>>>();

  on<K extends GameEventName>(name: K, handler: Handler<K>): () => void {
    let set = this.handlers.get(name);
    if (!set) {
      set = new Set();
      this.handlers.set(name, set);
    }
    set.add(handler as Handler<GameEventName>);
    return () => this.off(name, handler);
  }

  off<K extends GameEventName>(name: K, handler: Handler<K>): void {
    this.handlers.get(name)?.delete(handler as Handler<GameEventName>);
  }

  emit<K extends GameEventName>(name: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(name);
    if (!set) return;
    for (const handler of [...set]) (handler as Handler<K>)(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}
