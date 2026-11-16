import { LANDMARKS, INTERACTABLES, CHAPTER_ONE, CHAPTER_TWO } from '../world/layout.js';

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
    this.explorationComplete = this.chapterCount(1) >= CHAPTER_ONE.length;
    this.galileeComplete = this.chapterCount(2) >= CHAPTER_TWO.length;
  }

  /** Discovered landmarks of a chapter (1 = Nazareth, 2 = Galilee). */
  chapterCount(chapter) {
    const list = chapter === 2 ? CHAPTER_TWO : CHAPTER_ONE;
    return list.reduce((n, l) => n + (this.discovered.has(l.id) ? 1 : 0), 0);
  }

  /** Check landmark triggers for an actor; emits landmark:discover. */
  checkDiscovery(actorId, pos) {
    for (const l of this.landmarks) {
      if (this.discovered.has(l.id)) continue;
      if (Math.hypot(pos.x - l.x, pos.z - l.z) > l.r) continue;
      if (l.minY !== undefined && pos.y < l.minY) continue;
      this.discovered.add(l.id);
      const chapter = l.chapter || 1;
      const total = chapter === 2 ? CHAPTER_TWO.length : CHAPTER_ONE.length;
      this.bus.emit('landmark:discover', { entityId: actorId, landmarkId: l.id, name: l.name, blurb: l.blurb, count: this.chapterCount(chapter), total, chapter, region: l.region || 'nazareth' });
      if (!this.explorationComplete && this.chapterCount(1) >= CHAPTER_ONE.length) {
        this.explorationComplete = true;
        this.bus.emit('mission:complete', { entityId: actorId, missionId: 'mission.discover-nazareth' });
      }
      if (!this.galileeComplete && this.chapterCount(2) >= CHAPTER_TWO.length) {
        this.galileeComplete = true;
        this.bus.emit('mission:complete', { entityId: actorId, missionId: 'mission.explore-galilee' });
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

  /** Nearest undiscovered landmark, optionally limited to one chapter. */
  nextLandmark(pos, chapter = null) {
    let best = null;
    let bestD = Infinity;
    for (const l of this.landmarks) {
      if (chapter && (l.chapter || 1) !== chapter) continue;
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
