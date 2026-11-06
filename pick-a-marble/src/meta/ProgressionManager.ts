import { PIECES, getDef } from '../track/catalog';
import type { TrackData } from '../track/types';
import { SKINS, getSkin } from '../marbles/MarbleSkins';
import { ENVIRONMENTS, getEnv } from '../scene/Environments';
import { readJSON, STORAGE_KEYS, writeJSON } from './SaveManager';

export interface ProgressData {
  xp: number;
  coins: number;
  pieces: string[];
  skins: string[];
  envs: string[];
  challenges: Record<string, { done: boolean; best?: number }>;
  discovered: string[];
  tested: string[];
  stats: { races: number; wins: number; picksWon: number; built: number; falls: number };
}

export interface RaceRewardInput {
  track: TrackData;
  marbles: number;
  finished: number;
  pickedPlace: number | null;
  duration: number;
  usedPieces: string[];
  valid: boolean;
  source: string;
}

export interface Reward {
  xp: number;
  coins: number;
  lines: string[];
  levelUps: number[];
  unlocked: string[];
}

const DEFAULT: ProgressData = {
  xp: 0,
  coins: 100,
  pieces: [],
  skins: [],
  envs: ['sky'],
  challenges: {},
  discovered: [],
  tested: [],
  stats: { races: 0, wins: 0, picksWon: 0, built: 0, falls: 0 },
};

/** XP needed to go from level L to L+1. */
export const xpForNext = (level: number): number => 120 + (level - 1) * 90;

export function levelFromXp(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  let rest = xp;
  while (rest >= xpForNext(level)) {
    rest -= xpForNext(level);
    level += 1;
  }
  return { level, into: rest, need: xpForNext(level) };
}

export function trackSignature(t: TrackData): string {
  const s = t.pieces
    .map((p) => `${p.t}@${p.p.map((n) => Math.round(n * 4)).join(',')}r${p.r}${p.m ? 'm' : ''}`)
    .sort()
    .join('|');
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export class ProgressionManager {
  data: ProgressData;
  private listeners: (() => void)[] = [];

  constructor() {
    const stored = readJSON<Partial<ProgressData>>(STORAGE_KEYS.progress, {});
    this.data = {
      ...DEFAULT,
      ...stored,
      stats: { ...DEFAULT.stats, ...(stored.stats ?? {}) },
      challenges: { ...(stored.challenges ?? {}) },
      envs: stored.envs?.length ? stored.envs : ['sky'],
    };
  }

  onChange(fn: () => void): void {
    this.listeners.push(fn);
  }

  save(): void {
    writeJSON(STORAGE_KEYS.progress, this.data);
    for (const l of this.listeners) l();
  }

  get level(): number {
    return levelFromXp(this.data.xp).level;
  }

  pieceUnlocked(id: string): boolean {
    const def = getDef(id);
    if (!def.unlock) return true;
    return this.level >= def.unlock.level || this.data.pieces.includes(id);
  }

  skinOwned(id: string): boolean {
    const s = getSkin(id);
    if (s.price === 0 && !s.challenge && !s.level) return true;
    return this.data.skins.includes(id);
  }

  skinBuyable(id: string): boolean {
    const s = getSkin(id);
    return !this.skinOwned(id) && !s.challenge && (s.level ?? 1) <= this.level;
  }

  envUnlocked(id: string): boolean {
    const e = getEnv(id);
    return this.level >= e.level || this.data.envs.includes(id);
  }

  ownedSkins(): string[] {
    return SKINS.filter((s) => this.skinOwned(s.id)).map((s) => s.id);
  }

  buy(kind: 'piece' | 'skin' | 'env', id: string): boolean {
    let price = 0;
    if (kind === 'piece') {
      const d = getDef(id);
      if (!d.unlock || this.pieceUnlocked(id)) return false;
      price = d.unlock.coins;
    } else if (kind === 'skin') {
      if (!this.skinBuyable(id)) return false;
      price = getSkin(id).price;
    } else {
      if (this.envUnlocked(id)) return false;
      price = getEnv(id).price;
    }
    if (this.data.coins < price) return false;
    this.data.coins -= price;
    if (kind === 'piece') this.data.pieces.push(id);
    if (kind === 'skin') this.data.skins.push(id);
    if (kind === 'env') this.data.envs.push(id);
    this.save();
    return true;
  }

  grant(xp: number, coins: number): { levelUps: number[]; unlocked: string[] } {
    const before = this.level;
    this.data.xp += xp;
    this.data.coins += coins;
    const after = this.level;
    const levelUps: number[] = [];
    const unlocked: string[] = [];
    for (let l = before + 1; l <= after; l += 1) {
      levelUps.push(l);
      for (const p of PIECES) if (p.unlock && p.unlock.level === l && !this.data.pieces.includes(p.id)) unlocked.push(`Track piece: ${p.name}`);
      for (const e of ENVIRONMENTS) if (e.level === l && !this.data.envs.includes(e.id)) unlocked.push(`Environment: ${e.name}`);
      for (const s of SKINS) if (s.level === l && !s.challenge) unlocked.push(`Marble skin for sale: ${s.name}`);
    }
    return { levelUps, unlocked };
  }

  rewardRace(r: RaceRewardInput): Reward {
    const lines: string[] = [];
    let xp = 15 + r.finished * 3 + Math.min(30, Math.floor(r.duration / 4));
    let coins = 8 + Math.floor(r.finished / 2);
    lines.push(`Race complete +${xp} XP`);
    if (r.pickedPlace === 1) {
      const bonus = 10 * Math.ceil(r.marbles / 2);
      coins += bonus;
      xp += 20;
      lines.push(`Your pick WON! +${bonus} coins`);
      this.data.stats.picksWon += 1;
    } else if (r.pickedPlace !== null && r.pickedPlace <= 3) {
      coins += 8;
      lines.push(`Your pick made the podium +8 coins`);
    }
    if (r.valid && r.source !== 'builtin') {
      const sig = trackSignature(r.track);
      if (!this.data.tested.includes(sig) && r.track.pieces.length >= 6) {
        this.data.tested.push(sig);
        if (this.data.tested.length > 400) this.data.tested.splice(0, 100);
        xp += 35;
        coins += 20;
        lines.push('New track configuration tested! +35 XP +20 coins');
      }
    }
    for (const id of r.usedPieces) {
      if (!this.data.discovered.includes(id) && !getDef(id).decor) {
        this.data.discovered.push(id);
        coins += 5;
        lines.push(`Discovered ${getDef(id).name} +5 coins`);
      }
    }
    this.data.stats.races += 1;
    if (r.pickedPlace === 1) this.data.stats.wins += 1;
    const g = this.grant(xp, coins);
    this.save();
    return { xp, coins, lines, ...g };
  }

  completeChallenge(id: string, reward: { xp: number; coins: number; skin?: string; piece?: string }): Reward {
    const first = !this.data.challenges[id]?.done;
    this.data.challenges[id] = { done: true };
    const lines: string[] = [];
    let xp = 0;
    let coins = 0;
    if (first) {
      xp = reward.xp;
      coins = reward.coins;
      lines.push(`Challenge complete! +${xp} XP +${coins} coins`);
      if (reward.skin && !this.data.skins.includes(reward.skin)) {
        this.data.skins.push(reward.skin);
        lines.push(`New marble: ${getSkin(reward.skin).name}`);
      }
      if (reward.piece && !this.data.pieces.includes(reward.piece)) {
        this.data.pieces.push(reward.piece);
        lines.push(`Unlocked piece: ${getDef(reward.piece).name}`);
      }
    } else lines.push('Challenge complete again (rewards already claimed)');
    const g = this.grant(xp, coins);
    this.save();
    return { xp, coins, lines, ...g };
  }

  reset(): void {
    this.data = JSON.parse(JSON.stringify(DEFAULT)) as ProgressData;
    this.save();
  }
}
