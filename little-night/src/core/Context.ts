import type * as THREE from 'three';
import type { CollisionWorld } from '../physics/CollisionWorld';
import type { AudioManager } from '../audio/AudioManager';
import type { PlayerController } from '../player/PlayerController';
import type { Hands } from '../player/Hands';
import type { LumoController } from '../companion/LumoController';
import type { InteractionSystem } from '../player/InteractionSystem';
import type { NoiseSystem } from '../systems/NoiseSystem';
import type { InventorySystem } from '../systems/InventorySystem';
import type { DarkHazardSystem } from '../systems/DarkHazardSystem';
import type { CinematicSystem } from '../systems/CinematicSystem';
import type { EnemyManager } from '../enemies/EnemyManager';
import type { Emitter } from './Events';
import type { ChapterId } from './types';

export interface GameEvents extends Record<string, unknown> {
  noise: { pos: THREE.Vector3; radius: number; kind: string };
  pickup: { id: string; name: string };
  objective: { text: string };
  caught: { by: string };
  checkpoint: { id: string };
  chapterComplete: { chapter: ChapterId };
  lightning: { strength: number };
  fade: { amount: number };
  hurt: { amount: number };
}

export interface UIBridge {
  toast(text: string, seconds?: number): void;
  objective(text: string): void;
  subtitle(text: string, seconds?: number): void;
  hint(text: string, seconds?: number): void;
  examine(title: string, body: string, art?: string): void;
  chapterCard(numeral: string, title: string): void;
  itemGained(name: string, icon: string): void;
}

export class Flags {
  private data: Record<string, unknown> = {};
  get<T = unknown>(key: string, fallback?: T): T {
    return (key in this.data ? this.data[key] : fallback) as T;
  }
  has(key: string): boolean {
    return Boolean(this.data[key]);
  }
  set(key: string, value: unknown = true): void {
    this.data[key] = value;
  }
  snapshot(): Record<string, unknown> {
    return JSON.parse(JSON.stringify(this.data));
  }
  load(data: Record<string, unknown>): void {
    this.data = JSON.parse(JSON.stringify(data ?? {}));
  }
}

export interface GameContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  world: CollisionWorld;
  audio: AudioManager;
  events: Emitter<GameEvents>;
  flags: Flags;
  inventory: InventorySystem;
  noise: NoiseSystem;
  player: PlayerController;
  hands: Hands;
  lumo: LumoController;
  interactions: InteractionSystem;
  hazards: DarkHazardSystem;
  cinematics: CinematicSystem;
  enemies: EnemyManager;
  ui: UIBridge;
  /** Save a checkpoint (levels call this at milestones). */
  checkpoint(id: string): void;
  /** Finish the current chapter. */
  completeChapter(): void;
  rng: () => number;
  time: number;
  particleScale: number;
  reducedMotion: boolean;
}
