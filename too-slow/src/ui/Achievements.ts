import type { ItemKind } from '../physics/RacerBody';
import { TRACKS } from '../world/tracks';
import { loadMedals, loadStats, loadTrophies, MEDAL_TIMES, tutorialDone } from './Progress';

/** What happened in one race, gathered by the Game for achievements. */
export interface RaceSummary {
  mode: string;
  track: string;
  place: number;
  field: number;
  difficulty: number;
  itemsOn: boolean;
  itemsUsed: number;
  spinouts: number;
  critterHits: number;
  bestTrick: number;
  tricks: number;
  perfects: number;
  topKmh: number;
  drafts: number;
  superTurbos: number;
  giantSquashes: number;
  ladybugLeader: boolean;
  bananaHits: number;
  rain: boolean;
  wind: boolean;
  nemesisBeaten: boolean;
  worstRankLate: number;
  ghostBeaten: boolean;
  daily: boolean;
}

const KEY = 'tooslow.achievements.v1';
const EXTRA_KEY = 'tooslow.achievementStats.v1';

interface Extra {
  tracks: string[];
  nemesisBeats: number;
  dailies: number;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, v: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* no storage */
  }
}

export interface Achievement {
  id: string;
  icon: string;
  name: string;
  how: string;
  /** Checked after each race (with that race's summary) and on the achievements screen (without). */
  test(r: RaceSummary | null, x: Extra): boolean;
}

const won = (r: RaceSummary | null) => !!r && (r.mode === 'race' || r.mode === 'gp' || r.mode === 'daily') && r.place === 1 && r.field > 1;
const golds = () => Object.values(loadMedals()).filter((m) => m === 3).length;

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'finish', icon: '🏁', name: 'Off the Line', how: 'Finish a race', test: (r) => !!r && r.mode !== 'tutorial' },
  { id: 'win', icon: '🥇', name: 'Slime Champion', how: 'Win a race', test: (r) => won(r) },
  { id: 'podium5', icon: '🏅', name: 'Podium Regular', how: 'Finish on the podium 5 times', test: () => loadStats().podiums >= 5 },
  { id: 'wins10', icon: '👑', name: 'Garden Royalty', how: 'Win 10 races', test: () => loadStats().wins >= 10 },
  { id: 'noitems', icon: '🧘', name: 'Pure Racer', how: 'Win with items on without using one', test: (r) => won(r) && !!r && r.itemsOn && r.itemsUsed === 0 },
  { id: 'clean', icon: '✨', name: 'Spotless Shell', how: 'Finish a race without spinning out', test: (r) => !!r && r.field > 1 && r.spinouts === 0 },
  { id: 'bugfree', icon: '🐜', name: 'Bug Dodger', how: 'Finish a race without touching an insect', test: (r) => !!r && r.mode !== 'tutorial' && r.critterHits === 0 },
  { id: 'triple', icon: '🌀', name: 'Triple Twirl', how: 'Land a triple spin', test: (r) => !!r && r.bestTrick >= 3 },
  { id: 'tricks6', icon: '🤸', name: 'Show-Off', how: 'Land 6 tricks in one race', test: (r) => !!r && r.tricks >= 6 },
  { id: 'perfect5', icon: '🎯', name: 'Feather Landing', how: '5 perfect landings in one race', test: (r) => !!r && r.perfects >= 5 },
  { id: 'speed200', icon: '💨', name: 'Snail Sonic', how: 'Reach 200 km/h', test: (r) => !!r && r.topKmh >= 200 },
  { id: 'draft5', icon: '🌬️', name: 'Tailgater', how: 'Slipstream 5 times in one race', test: (r) => !!r && r.drafts >= 5 },
  { id: 'turbo3', icon: '🔥', name: 'Drift King', how: '3 super mini-turbos in one race', test: (r) => !!r && r.superTurbos >= 3 },
  { id: 'squash', icon: '🦣', name: 'Squash!', how: 'Flatten a rival as the Giant Snail', test: (r) => !!r && r.giantSquashes > 0 },
  { id: 'ladybug', icon: '🐞', name: 'Leader Hunter', how: 'Hit the leader with a Ladybug', test: (r) => !!r && r.ladybugLeader },
  { id: 'banana3', icon: '🍌', name: 'Peel Artist', how: 'Spin out 3 rivals with bananas in one race', test: (r) => !!r && r.bananaHits >= 3 },
  { id: 'rainwin', icon: '🌧️', name: 'Singing in the Rain', how: 'Win a race in the rain', test: (r) => won(r) && !!r && r.rain },
  { id: 'windwin', icon: '🪁', name: 'Gone with the Wind', how: 'Win a race in the wind', test: (r) => won(r) && !!r && r.wind },
  { id: 'nemesis', icon: '😤', name: 'Nemesis Down', how: 'Finish ahead of your nemesis', test: (r) => !!r && r.nemesisBeaten },
  { id: 'nemesis5', icon: '⚔️', name: 'Arch-Rival', how: 'Beat your nemesis 5 times', test: (_r, x) => x.nemesisBeats >= 5 },
  { id: 'hard', icon: '💪', name: 'Hard Shell', how: 'Win a race on Hard', test: (r) => won(r) && !!r && r.difficulty === 2 },
  { id: 'comeback', icon: '🔁', name: 'Comeback Snail', how: 'Win after being last on lap 2 or later', test: (r) => won(r) && !!r && r.worstRankLate >= r.field },
  { id: 'tourist', icon: '🗺️', name: 'Garden Tourist', how: 'Finish a race on every track', test: (_r, x) => TRACKS.every((t) => x.tracks.includes(t.id)) },
  { id: 'gp', icon: '🏆', name: 'Cup Winner', how: 'Win a Grand Prix', test: () => Object.values(loadTrophies()).includes(1) },
  { id: 'gphard', icon: '💎', name: 'Diamond Cup', how: 'Win a Grand Prix on Hard', test: () => loadTrophies()['2'] === 1 },
  { id: 'gold', icon: '⏱️', name: 'Golden Clock', how: 'Earn a gold medal in Time Trial', test: () => golds() >= 1 },
  { id: 'goldall', icon: '🌟', name: 'Time Lord', how: 'Gold medal on every track', test: () => golds() >= Object.keys(MEDAL_TIMES).length },
  { id: 'ghost', icon: '👻', name: 'Ghostbuster', how: 'Beat your own ghost in Time Trial', test: (r) => !!r && r.ghostBeaten },
  { id: 'duo', icon: '👥', name: 'Couch Rivals', how: 'Play a 2-player race', test: (r) => !!r && r.mode === 'duo' },
  { id: 'tutorial', icon: '🎓', name: 'Graduate', how: 'Finish the tutorial', test: () => tutorialDone() },
  { id: 'daily', icon: '📅', name: 'Daily Dash', how: 'Complete a daily challenge', test: (_r, x) => x.dailies >= 1 },
  { id: 'daily7', icon: '🗓️', name: 'Regular', how: 'Complete 7 daily challenges', test: (_r, x) => x.dailies >= 7 },
  { id: 'marathon', icon: '🛣️', name: 'Marathon Mollusc', how: 'Roll 100 km in total', test: () => loadStats().distance >= 100000 },
];

export function loadAchieved(): Set<string> {
  return new Set(read<{ ids: string[] }>(KEY, { ids: [] }).ids);
}

export function loadExtra(): Extra {
  return read<Extra>(EXTRA_KEY, { tracks: [], nemesisBeats: 0, dailies: 0 });
}

export function bumpExtra(change: (x: Extra) => void): void {
  const x = loadExtra();
  change(x);
  write(EXTRA_KEY, x);
}

/** Check every achievement; returns the newly earned ones. */
export function checkAchievements(r: RaceSummary | null): Achievement[] {
  const have = loadAchieved();
  const x = loadExtra();
  const fresh: Achievement[] = [];
  for (const a of ACHIEVEMENTS) {
    if (have.has(a.id)) continue;
    let ok = false;
    try {
      ok = a.test(r, x);
    } catch {
      ok = false;
    }
    if (ok) {
      have.add(a.id);
      fresh.push(a);
    }
  }
  if (fresh.length) write(KEY, { ids: [...have] });
  return fresh;
}

// ------------------------------------------------------------ daily challenge

export interface DailyChallenge {
  date: string;
  track: string;
  modifier: 'rain' | 'wind' | 'bananas' | 'giants' | 'ladybugs' | 'hard';
  seed: number;
}

export const MODIFIER_TEXT: Record<DailyChallenge['modifier'], string> = {
  rain: 'Rainy Day — slick surfaces from the start',
  wind: 'Gale Warning — strong gusts in the air',
  bananas: 'Banana Republic — every box is a banana',
  giants: 'Land of Giants — every box is a Giant Snail',
  ladybugs: 'Ladybug Swarm — every box is a Ladybug',
  hard: 'Hard Shells — the rivals are on Hard',
};

export const MODIFIER_ITEM: Partial<Record<DailyChallenge['modifier'], ItemKind>> = { bananas: 'banana', giants: 'giant', ladybugs: 'ladybug' };

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Today's challenge: the same track, modifier and race seed for everyone on the same date. */
export function todaysChallenge(now = new Date()): DailyChallenge {
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const h = hash(`tooslow-${date}`);
  const mods: DailyChallenge['modifier'][] = ['rain', 'wind', 'bananas', 'giants', 'ladybugs', 'hard'];
  return { date, track: TRACKS[h % TRACKS.length].id, modifier: mods[(h >>> 8) % mods.length], seed: h };
}

const DAILY_KEY = 'tooslow.daily.v1';

/** Best placing per date. */
export function loadDaily(): Record<string, number> {
  return read<Record<string, number>>(DAILY_KEY, {});
}

export function saveDaily(date: string, place: number): boolean {
  const all = loadDaily();
  const first = !all[date];
  if (!all[date] || place < all[date]) all[date] = place;
  write(DAILY_KEY, all);
  return first;
}

/** Consecutive days with a completed challenge, ending today or yesterday. */
export function dailyStreak(now = new Date()): number {
  const all = loadDaily();
  let n = 0;
  const d = new Date(now);
  if (!all[todaysChallenge(d).date]) d.setDate(d.getDate() - 1);
  while (all[todaysChallenge(d).date] && all[todaysChallenge(d).date] <= 3) {
    n += 1;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
