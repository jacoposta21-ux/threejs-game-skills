import type { Rng } from '../core/Rng';
import { hash2 } from '../core/Rng';
import type { Trait, VillagerData } from '../core/types';

export const TRAITS: Trait[] = [
  'curious', 'skeptical', 'superstitious', 'brave', 'cowardly',
  'lazy', 'ambitious', 'devout', 'rebellious', 'dramatic',
];

/** Traits that cannot coexist on one villager. */
const OPPOSITES: Array<[Trait, Trait]> = [
  ['skeptical', 'superstitious'],
  ['skeptical', 'devout'],
  ['brave', 'cowardly'],
  ['lazy', 'ambitious'],
];

function compatible(a: Trait, b: Trait): boolean {
  return a !== b && !OPPOSITES.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

export function rollTraits(rng: Rng): Trait[] {
  const first = rng.pick(TRAITS);
  let second = rng.pick(TRAITS);
  for (let i = 0; i < 12 && !compatible(first, second); i++) second = rng.pick(TRAITS);
  return compatible(first, second) ? [first, second] : [first];
}

/** Deterministic traits for villagers from v0.1 saves (no RNG state to consume). */
export function traitsFromId(id: string): Trait[] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const first = TRAITS[Math.floor(hash2(h, 7, 11) * TRAITS.length)];
  let second = TRAITS[Math.floor(hash2(h, 13, 17) * TRAITS.length)];
  for (let k = 0; k < 10 && !compatible(first, second); k++) second = TRAITS[Math.floor(hash2(h, 19 + k, 23) * TRAITS.length)];
  return compatible(first, second) ? [first, second] : [first];
}

export function has(v: VillagerData, t: Trait): boolean {
  return v.traits.includes(t);
}

/**
 * Multiplier for joining a new belief. Skeptics resist; the superstitious and
 * devout convert easily; rebels are contrarian; the dramatic love a good story.
 */
export function conversionWeight(v: VillagerData): number {
  let w = 1;
  if (has(v, 'skeptical')) w *= 0.25;
  if (has(v, 'superstitious')) w *= 2;
  if (has(v, 'devout')) w *= 1.6;
  if (has(v, 'rebellious')) w *= 0.6;
  if (has(v, 'dramatic')) w *= 1.3;
  if (has(v, 'curious')) w *= 1.15;
  return w;
}

/** Flee distance scale: cowards run early, the brave stand and watch. */
export function fleeScale(v: VillagerData): number {
  if (has(v, 'cowardly')) return 1.55;
  if (has(v, 'brave')) return 0.6;
  return 1;
}

export function fearScale(v: VillagerData): number {
  let s = 1;
  if (has(v, 'brave')) s *= 0.6;
  if (has(v, 'cowardly')) s *= 1.4;
  if (has(v, 'dramatic')) s *= 1.25;
  return s;
}

/** Leaders are chosen among the superstitious, devout and dramatic. */
export function leaderScore(v: VillagerData): number {
  return v.faith + (has(v, 'superstitious') ? 0.5 : 0) + (has(v, 'devout') ? 0.4 : 0) + (has(v, 'dramatic') ? 0.2 : 0) - (has(v, 'skeptical') ? 1 : 0);
}

export const TRAIT_LABEL: Record<Trait, string> = {
  curious: 'Curious',
  skeptical: 'Skeptical',
  superstitious: 'Superstitious',
  brave: 'Brave',
  cowardly: 'Cowardly',
  lazy: 'Lazy',
  ambitious: 'Ambitious',
  devout: 'Devout',
  rebellious: 'Rebellious',
  dramatic: 'Dramatic',
};
