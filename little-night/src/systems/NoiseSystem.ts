import * as THREE from 'three';
import type { Emitter } from '../core/Events';
import type { GameEvents } from '../core/Context';

export interface NoiseEvent {
  pos: THREE.Vector3;
  radius: number;
  kind: string;
  age: number;
}

/**
 * Player-generated noise. Walking ~4.5 m, crawling ~1.2 m, doors ~6 m,
 * clutter ~8 m, thrown objects ~11 m. THE HUSH listens to these events.
 */
export class NoiseSystem {
  readonly recent: NoiseEvent[] = [];
  /** Last noise the player made (for the HUD's subtle noise ring). */
  lastPlayerNoise = 0;

  constructor(private readonly events: Emitter<GameEvents>) {}

  emit(pos: THREE.Vector3, radius: number, kind: string): void {
    const e = { pos: pos.clone(), radius, kind, age: 0 };
    this.recent.push(e);
    if (this.recent.length > 24) this.recent.shift();
    if (kind !== 'throw') this.lastPlayerNoise = Math.max(this.lastPlayerNoise, Math.min(1, radius / 8));
    this.events.emit('noise', { pos: e.pos, radius, kind });
  }

  update(dt: number): void {
    for (const e of this.recent) e.age += dt;
    while (this.recent.length && this.recent[0].age > 3) this.recent.shift();
    this.lastPlayerNoise = Math.max(0, this.lastPlayerNoise - dt * 1.5);
  }

  clear(): void {
    this.recent.length = 0;
  }
}
