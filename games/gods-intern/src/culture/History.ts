import { CONFIG } from '../core/Config';
import type { HistoryEntry } from '../core/types';
import type { Simulation } from '../simulation/SimulationManager';

export interface HistoryOptions {
  kind?: string;
  x?: number;
  z?: number;
  villageId?: string;
}

/**
 * The Book of Questionable Miracles. Bounded: the oldest entries roll off once
 * CONFIG.culture.maxHistory is reached. Duplicate titles on the same day are
 * collapsed so repeated events don't flood the book.
 */
export class HistoryBook {
  constructor(private readonly sim: Simulation) {}

  add(title: string, text: string, opts: HistoryOptions = {}): HistoryEntry | null {
    const s = this.sim.state;
    const day = this.sim.day;
    if (s.history.some((h) => h.title === title && h.day === day)) return null;
    const entry: HistoryEntry = {
      id: `h${this.sim.nextId()}`,
      day,
      time: s.time,
      title,
      text,
      villageId: opts.villageId ?? s.villages[0]?.id ?? 'v1',
      kind: opts.kind ?? 'event',
      x: opts.x,
      z: opts.z,
    };
    s.history.push(entry);
    while (s.history.length > CONFIG.culture.maxHistory) s.history.shift();
    this.sim.bus.emit('HISTORY_ADDED', { entry });
    return entry;
  }
}
