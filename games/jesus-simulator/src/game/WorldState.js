import { LANDMARKS, INTERACTABLES } from '../world/layout.js';

/**
 * Shared world facts keyed by stable entity IDs: landmark discovery,
 * interactables. Kept separate from rendering so it can be synchronised later.
 */
export class WorldState {
  constructor(bus) {
    this.bus = bus;
    this.discovered = new Set();
    this.landmarks = LANDMARKS;
    this.interactables = INTERACTABLES;
    this.explorationComplete = false;
  }

  reset(discovered = []) {
    this.discovered = new Set(discovered);
    this.explorationComplete = this.discovered.size >= this.landmarks.length;
  }

  /** Check landmark triggers for an actor; emits landmark:discover. */
  checkDiscovery(actorId, pos) {
    for (const l of this.landmarks) {
      if (this.discovered.has(l.id)) continue;
      if (Math.hypot(pos.x - l.x, pos.z - l.z) > l.r) continue;
      if (l.minY !== undefined && pos.y < l.minY) continue;
      this.discovered.add(l.id);
      this.bus.emit('landmark:discover', { entityId: actorId, landmarkId: l.id, name: l.name, blurb: l.blurb, count: this.discovered.size, total: this.landmarks.length });
      if (!this.explorationComplete && this.discovered.size >= this.landmarks.length) {
        this.explorationComplete = true;
        this.bus.emit('mission:complete', { entityId: actorId, missionId: 'mission.discover-nazareth' });
      }
    }
  }

  nearestInteractable(pos) {
    let best = null;
    let bestD = Infinity;
    for (const it of this.interactables) {
      const d = Math.hypot(pos.x - it.x, pos.z - it.z);
      if (d < it.r && d < bestD) {
        best = it;
        bestD = d;
      }
    }
    return best;
  }

  nextLandmark(pos) {
    let best = null;
    let bestD = Infinity;
    for (const l of this.landmarks) {
      if (this.discovered.has(l.id)) continue;
      const d = Math.hypot(pos.x - l.x, pos.z - l.z);
      if (d < bestD) {
        best = l;
        bestD = d;
      }
    }
    return best ? { landmark: best, distance: bestD } : null;
  }
}
