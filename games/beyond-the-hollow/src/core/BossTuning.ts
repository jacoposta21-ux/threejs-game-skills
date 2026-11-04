/**
 * Boss difficulty. It changes ONLY the boss fights; the rest of the game plays the same.
 *  - speed:   how fast the boss acts (its whole clock: movement, cooldowns, telegraphs)
 *  - hp:      boss health multiplier
 *  - extraHp: extra hearts for Elias while the fight lasts
 *  - dmgCap:  the most a single boss attack can take away
 *  - heal:    a new phase restores Elias
 *  - skipAfter: defeats before "Skip this fight" is offered
 */
import { Save } from './Save';

export type BossDiff = 'story' | 'normal' | 'hard';
export const BOSS_DIFFS: BossDiff[] = ['story', 'normal', 'hard'];

const TABLE: Record<BossDiff, { speed: number; hp: number; extraHp: number; dmgCap: number; heal: boolean; skipAfter: number }> = {
  story: { speed: 0.72, hp: 0.65, extraHp: 3, dmgCap: 1, heal: true, skipAfter: 1 },
  normal: { speed: 1, hp: 1, extraHp: 0, dmgCap: 9, heal: true, skipAfter: 3 },
  hard: { speed: 1.2, hp: 1.3, extraHp: 0, dmgCap: 9, heal: false, skipAfter: 3 },
};

export function bossDiff(): BossDiff {
  const d = Save.data.settings.bossDiff;
  return d === 'story' || d === 'hard' ? d : 'normal';
}
export function bossTune() {
  return TABLE[bossDiff()];
}
