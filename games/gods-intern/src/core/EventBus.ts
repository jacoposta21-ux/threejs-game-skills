import type { PowerId } from './Config';
import type { BuildingType, FireKind, PrayerData } from './types';

export type NotifyKind = 'good' | 'bad' | 'info' | 'chaos';

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
  };
  FIRE_STARTED: { fireId: number; x: number; z: number; kind: FireKind; byPlayer: boolean };
  FIRE_SPREAD: { fromId: number; fireId: number; x: number; z: number; kind: FireKind };
  FIRE_EXTINGUISHED: { fireId: number; x: number; z: number; byRain: boolean };
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
  NOTIFY: { text: string; kind: NotifyKind; sub?: string };
  GOD_MESSAGE: { text: string; priority: number };
  SPEECH: { villagerId: string; text: string; duration: number };
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
