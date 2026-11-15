/**
 * Local progression: time-trial medals and ghosts, Grand Prix trophies, tutorial, career stats,
 * cosmetic unlocks and the per-track Hall of Fame. Everything lives in localStorage and every
 * access survives storage being unavailable.
 */

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable: keep playing */
  }
}

// ------------------------------------------------------------ medals

/** 0 none, 1 bronze, 2 silver, 3 gold. */
export type Medal = 0 | 1 | 2 | 3;
export const MEDAL_NAMES = ['', 'Bronze', 'Silver', 'Gold'];

/** Time-trial targets in seconds: [gold, silver, bronze]. Gold is a clean, fast run. */
export const MEDAL_TIMES: Record<string, [number, number, number]> = {
  backyard: [116, 130, 150],
  veggie: [116, 128, 148],
  pond: [112, 125, 145],
  sandbox: [152, 168, 190],
  frost: [126, 140, 160],
  glow: [124, 138, 158],
};

export function medalFor(track: string, time: number): Medal {
  const t = MEDAL_TIMES[track];
  if (!t) return 0;
  return time <= t[0] ? 3 : time <= t[1] ? 2 : time <= t[2] ? 1 : 0;
}

const MEDALS_KEY = 'tooslow.medals.v1';

export function loadMedals(): Record<string, Medal> {
  return read<Record<string, Medal>>(MEDALS_KEY, {});
}

/** Keeps the best medal; returns true if it improved. */
export function saveMedal(track: string, medal: Medal): boolean {
  const all = loadMedals();
  if ((all[track] ?? 0) >= medal) return false;
  all[track] = medal;
  write(MEDALS_KEY, all);
  return true;
}

// ------------------------------------------------------------ ghosts

/** Samples every GHOST_DT seconds: x, y, z, heading, mode (0 crawl, 1 roll, 2 slide). */
export const GHOST_DT = 0.1;

export interface Ghost {
  track: string;
  time: number;
  name: string;
  shell: number;
  samples: number[];
}

const ghostKey = (track: string) => `tooslow.ghost.${track}.v1`;

export function loadGhost(track: string): Ghost | null {
  const g = read<Ghost | null>(ghostKey(track), null);
  return g && Array.isArray(g.samples) && g.samples.length >= 10 ? g : null;
}

export function saveGhost(g: Ghost): void {
  // Two decimals is plenty and keeps a three-lap run around 40 kB.
  write(ghostKey(g.track), { ...g, samples: g.samples.map((v) => Math.round(v * 100) / 100) });
}

// ------------------------------------------------------------ grand prix

const TROPHY_KEY = 'tooslow.trophies.v1';

/** Best cup finish (1 = gold trophy) per difficulty "0" | "1" | "2". */
export function loadTrophies(): Record<string, number> {
  return read<Record<string, number>>(TROPHY_KEY, {});
}

export function saveTrophy(difficulty: number, place: number): boolean {
  const all = loadTrophies();
  const k = String(difficulty);
  if (all[k] && all[k] <= place) return false;
  all[k] = place;
  write(TROPHY_KEY, all);
  return true;
}

export const GP_POINTS = [10, 8, 6, 4, 2, 1];

// ------------------------------------------------------------ tutorial + stats

const TUTORIAL_KEY = 'tooslow.tutorial.v1';

export function tutorialDone(): boolean {
  return read<{ done: boolean }>(TUTORIAL_KEY, { done: false }).done;
}

export function setTutorialDone(): void {
  write(TUTORIAL_KEY, { done: true });
}

export interface Stats {
  races: number;
  wins: number;
  podiums: number;
  tricks: number;
  distance: number;
  cups: number;
  bananaHits: number;
}

const STATS_KEY = 'tooslow.stats.v1';

export function loadStats(): Stats {
  return { races: 0, wins: 0, podiums: 0, tricks: 0, distance: 0, cups: 0, bananaHits: 0, ...read<Partial<Stats>>(STATS_KEY, {}) };
}

export function addStats(delta: Partial<Stats>): Stats {
  const s = loadStats();
  for (const [k, v] of Object.entries(delta)) (s as unknown as Record<string, number>)[k] += v as number;
  write(STATS_KEY, s);
  return s;
}

// ------------------------------------------------------------ hall of fame

export interface FameEntry {
  name: string;
  time: number;
  date: string;
  mode: string;
}

const fameKey = (track: string) => `tooslow.fame.${track}.v1`;

export function loadFame(track: string): FameEntry[] {
  return read<FameEntry[]>(fameKey(track), []);
}

/** Adds a finish to the local top five; returns its rank (1-based) or 0 if it did not make it. */
export function addFame(track: string, entry: FameEntry): number {
  const list = loadFame(track);
  list.push(entry);
  list.sort((a, b) => a.time - b.time);
  const rank = list.indexOf(entry) + 1;
  write(fameKey(track), list.slice(0, 5));
  return rank <= 5 ? rank : 0;
}
