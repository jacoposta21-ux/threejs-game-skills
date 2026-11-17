import { MIRACLES } from './miracles.js';

/**
 * Faith and Chaos (Phase 6). Faith is earned by miracles, good deeds,
 * missions and followers, and is *spent* on Blessings (miracle upgrades) and
 * Roman fines. Chaos rises with broken pots, knocked-over people and scares;
 * it fades slowly, faster with good deeds, and has consequences per tier.
 */
export const FAITH_TITLES = [
  { at: 0, title: 'Joseph\'s son' },
  { at: 15, title: 'Wandering teacher' },
  { at: 40, title: 'Miracle worker' },
  { at: 80, title: 'Prophet of Galilee' },
  { at: 140, title: 'The talk of the whole province' },
];

export const CHAOS_TIERS = [
  { at: 0, id: 'calm', label: 'Calm', note: 'People are glad to see you.' },
  { at: 12, id: 'restless', label: 'Restless', note: 'Villagers are wary: fewer greetings, more side-eye.' },
  { at: 30, id: 'notorious', label: 'Notorious', note: 'People back away, and the legion watches you 20% more closely.' },
];

export function faithTitle(faith) {
  let t = FAITH_TITLES[0];
  for (const f of FAITH_TITLES) if (faith >= f.at) t = f;
  return t.title;
}

/** Lifetime Faith decides the title (spending Faith on Blessings never demotes you). */
export function chaosTier(chaos) {
  let t = CHAOS_TIERS[0];
  for (const c of CHAOS_TIERS) if (chaos >= c.at) t = c;
  return t;
}

/** Blessings: two upgrades per miracle, paid in Faith. */
export const BLESSING_COSTS = [15, 30];
export const BLESSINGS = {
  'miracle.divine-push': ['Wider wave (+25% reach)', 'Mighty wave (+50% reach)'],
  'miracle.multiplication': ['Three loaves per cast', 'Four loaves per cast'],
  'miracle.water-to-wine': ['Wine lasts twice as long', 'Wine lasts three times as long'],
  'miracle.walk-on-water': ['+50% time on the water', '+100% time on the water'],
  'miracle.healing-touch': ['Faster recovery (−20% cooldown)', 'Healing spreads to everyone hurt nearby'],
  'miracle.holy-levitation': ['Lift from further away (+4 m)', 'Lift from much further (+8 m)'],
};
// every Blessing also shortens the cooldown by 20% per level
export const BLESSING_IDS = MIRACLES.map((m) => m.id);

export const MAX_FOLLOWERS = 12;
