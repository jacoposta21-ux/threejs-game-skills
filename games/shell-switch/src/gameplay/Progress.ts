import type { HostKind } from '../characters/Archetypes';
import type { AreaId, ItemId } from './types';

const SAVE_KEY = 'shell-switch-save-v1';
const SETTINGS_KEY = 'shell-switch-settings-v1';

interface SaveData {
  version: 1;
  flags: string[];
  items: ItemId[];
  collected: string[];
  discovered: HostKind[];
  extras?: string[];
  achievements: string[];
  missions: string[];
  objects: Record<string, number[]>;
  hosts: Record<string, number[]>;
  stats: Record<string, number>;
  values: Record<string, number>;
  playTime: number;
  lastArea: AreaId;
  tracked: string | null;
  player: number[] | null;
}

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode / sandboxed iframe) */
  }
}

/** Single source of truth for persistent game state. */
export class Progress {
  flags = new Set<string>();
  items = new Set<ItemId>();
  collected = new Set<string>();
  discovered = new Set<HostKind>(['alien']);
  /** Townsfolk possessed after the finale (NPC ids). */
  extras = new Set<string>();
  achievements = new Set<string>();
  missions = new Set<string>();
  objects: Record<string, number[]> = {};
  hosts: Record<string, number[]> = {};
  stats: Record<string, number> = {};
  values: Record<string, number> = {};
  playTime = 0;
  lastArea: AreaId = 'station';
  tracked: string | null = null;
  player: number[] | null = null;
  dirty = false;

  get cores(): number {
    let n = 0;
    for (const f of this.flags) if (f.startsWith('core:')) n += 1;
    return n;
  }

  flag(name: string): boolean {
    return this.flags.has(name);
  }

  set(name: string, on = true): boolean {
    const had = this.flags.has(name);
    if (on) this.flags.add(name);
    else this.flags.delete(name);
    if (had !== on) this.dirty = true;
    return had !== on;
  }

  bump(stat: string, by = 1): number {
    this.stats[stat] = (this.stats[stat] ?? 0) + by;
    this.dirty = true;
    return this.stats[stat];
  }

  stat(name: string): number {
    return this.stats[name] ?? 0;
  }

  save(): void {
    const data: SaveData = {
      version: 1,
      flags: [...this.flags],
      items: [...this.items],
      collected: [...this.collected],
      discovered: [...this.discovered],
      extras: [...this.extras],
      achievements: [...this.achievements],
      missions: [...this.missions],
      objects: this.objects,
      hosts: this.hosts,
      stats: this.stats,
      values: this.values,
      playTime: Math.round(this.playTime),
      lastArea: this.lastArea,
      tracked: this.tracked,
      player: this.player,
    };
    safeSet(SAVE_KEY, JSON.stringify(data));
    this.dirty = false;
  }

  static hasSave(): boolean {
    return !!safeGet(SAVE_KEY);
  }

  static load(): Progress | null {
    const raw = safeGet(SAVE_KEY);
    if (!raw) return null;
    try {
      const d = JSON.parse(raw) as SaveData;
      if (d.version !== 1) return null;
      const p = new Progress();
      p.flags = new Set(d.flags);
      p.items = new Set(d.items);
      p.collected = new Set(d.collected);
      p.discovered = new Set(d.discovered);
      p.discovered.add('alien');
      p.extras = new Set(d.extras ?? []);
      p.achievements = new Set(d.achievements);
      p.missions = new Set(d.missions);
      p.objects = d.objects ?? {};
      p.hosts = d.hosts ?? {};
      p.stats = d.stats ?? {};
      p.values = d.values ?? {};
      p.playTime = d.playTime ?? 0;
      p.lastArea = d.lastArea ?? 'station';
      p.tracked = d.tracked ?? null;
      p.player = d.player ?? null;
      return p;
    } catch {
      return null;
    }
  }

  static clear(): void {
    try {
      window.localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
  }
}

export interface Settings {
  music: number;
  sfx: number;
  sensitivity: number;
  invertY: boolean;
  quality: 'high' | 'low';
  reducedMotion: boolean;
  showHints: boolean;
}

export function loadSettings(): Settings {
  const def: Settings = { music: 0.7, sfx: 0.85, sensitivity: 1, invertY: false, quality: 'high', reducedMotion: false, showHints: true };
  const raw = safeGet(SETTINGS_KEY);
  if (!raw) return def;
  try {
    return { ...def, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return def;
  }
}

export function saveSettings(s: Settings): void {
  safeSet(SETTINGS_KEY, JSON.stringify(s));
}
