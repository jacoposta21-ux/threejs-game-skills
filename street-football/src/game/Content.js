// Game content: teams (kits, players, stats), match modes, venues and unlocks.
// All teams and places are fictional street sides; no real clubs or brands.

/** Stats run 1–5; 3 is the baseline. */
const p = (name, number, spd, sht, skl) => ({ name, number, spd, sht, skl });

export const TEAM_LIST = [
  {
    id: 'can',
    name: 'CANARINHOS',
    short: 'CAN',
    from: 'Vila Esperança, Rio',
    venue: 'brazil',
    kits: [
      { id: 'home', label: 'HOME', jersey: '#f6c915', jersey2: '#1f8a4c', shorts: '#1d4fa3', socks: '#f4f1e8', sockStripe: '#1f8a4c', shoes: '#ff5a1f', pattern: 1 },
      { id: 'alt', label: 'NIGHT', jersey: '#101a3a', jersey2: '#f6c915', shorts: '#101a3a', socks: '#f6c915', sockStripe: '#101a3a', shoes: '#f6c915', pattern: 2, unlock: 'win' },
    ],
    players: [p('ZÉ', 10, 4, 3, 5), p('BIEL', 7, 4, 3, 3), p('NANDO', 5, 3, 4, 2)],
  },
  {
    id: 'vrb',
    name: 'VILA RUBRA',
    short: 'VRB',
    from: 'Morro Vermelho, São Paulo',
    venue: 'brazil',
    kits: [
      { id: 'home', label: 'HOME', jersey: '#c8102e', jersey2: '#111111', shorts: '#141414', socks: '#c8102e', sockStripe: '#111111', shoes: '#f4f1e8', pattern: 2 },
      { id: 'alt', label: 'WHITE', jersey: '#f4f1e8', jersey2: '#c8102e', shorts: '#c8102e', socks: '#f4f1e8', sockStripe: '#c8102e', shoes: '#141414', pattern: 1, unlock: 'style5k' },
    ],
    players: [p('RAFA', 9, 3, 5, 3), p('DUDU', 8, 3, 3, 4), p('GUGA', 4, 4, 3, 2)],
  },
  {
    id: 'bkb',
    name: 'BROOKLYN BRIDGERS',
    short: 'BKB',
    from: 'Rooftop 41, New York',
    venue: 'newyork',
    kits: [
      { id: 'home', label: 'HOME', jersey: '#ff6a13', jersey2: '#1a1a1a', shorts: '#1a1a1a', socks: '#ff6a13', sockStripe: '#1a1a1a', shoes: '#f4f1e8', pattern: 1 },
      { id: 'alt', label: 'STEEL', jersey: '#8e9aa6', jersey2: '#ff6a13', shorts: '#2e3a46', socks: '#2e3a46', sockStripe: '#ff6a13', shoes: '#ff6a13', pattern: 2, unlock: 'tricks20' },
    ],
    players: [p('MARCUS', 11, 5, 3, 3), p('DESI', 6, 3, 3, 4), p('OWEN', 3, 3, 4, 2)],
  },
  {
    id: 'sth',
    name: 'SOUTHWARK ARCHES',
    short: 'STH',
    from: 'Arch 17, London',
    venue: 'london',
    kits: [
      { id: 'home', label: 'HOME', jersey: '#5b2a86', jersey2: '#f4f1e8', shorts: '#f4f1e8', socks: '#5b2a86', sockStripe: '#f4f1e8', shoes: '#141414', pattern: 1 },
      { id: 'alt', label: 'FOG', jersey: '#c9cfd4', jersey2: '#5b2a86', shorts: '#5b2a86', socks: '#c9cfd4', sockStripe: '#5b2a86', shoes: '#5b2a86', pattern: 2, unlock: 'bicycle' },
    ],
    players: [p('KOFI', 14, 4, 4, 3), p('LIAM', 8, 3, 3, 4), p('TEDDY', 2, 3, 3, 3)],
  },
  {
    id: 'kit',
    name: 'SHIBUYA KITSUNE',
    short: 'KTS',
    from: 'Udagawa Court, Tokyo',
    venue: 'tokyo',
    kits: [
      { id: 'home', label: 'HOME', jersey: '#f4f1e8', jersey2: '#e8338b', shorts: '#141414', socks: '#e8338b', sockStripe: '#f4f1e8', shoes: '#e8338b', pattern: 1 },
      { id: 'alt', label: 'NEON', jersey: '#17e0d0', jersey2: '#141414', shorts: '#141414', socks: '#17e0d0', sockStripe: '#e8338b', shoes: '#17e0d0', pattern: 2, unlock: 'tournament' },
    ],
    players: [p('REN', 17, 4, 2, 5), p('HARU', 10, 4, 3, 4), p('SORA', 5, 3, 3, 3)],
  },
  {
    id: 'rvl',
    name: 'RAVAL GATS',
    short: 'RVL',
    from: 'Plaça del Raval, Barcelona',
    venue: 'barcelona',
    kits: [
      { id: 'home', label: 'HOME', jersey: '#0b4fa3', jersey2: '#c8102e', shorts: '#0b4fa3', socks: '#c8102e', sockStripe: '#0b4fa3', shoes: '#f6c915', pattern: 2 },
      { id: 'alt', label: 'SAND', jersey: '#e3c58a', jersey2: '#0b4fa3', shorts: '#f4f1e8', socks: '#e3c58a', sockStripe: '#0b4fa3', shoes: '#0b4fa3', pattern: 1, unlock: 'firstTo5' },
    ],
    players: [p('ÀLEX', 10, 3, 3, 5), p('PAU', 6, 3, 4, 3), p('JORDI', 4, 4, 3, 2)],
  },
];

export const teamById = (id) => TEAM_LIST.find((t) => t.id === id) ?? TEAM_LIST[0];

/** What each locked kit asks for. Checked against stored progress. */
export const UNLOCKS = {
  win: { label: 'Win a match', test: (pr) => pr.wins >= 1 },
  style5k: { label: 'Score 5,000 style in one match', test: (pr) => pr.bestStyle >= 5000 },
  tricks20: { label: 'Land 20 tricks in total', test: (pr) => pr.tricks >= 20 },
  bicycle: { label: 'Score with a bicycle kick', test: (pr) => pr.bicycleGoals >= 1 },
  tournament: { label: 'Win the tournament', test: (pr) => pr.tournaments >= 1 },
  firstTo5: { label: 'Win a First to 5 match', test: (pr) => pr.firstTo5Wins >= 1 },
};

/**
 * Match modes.
 *   duration   seconds (null: no clock)
 *   target     goals that end the match
 *   styleGoal  style points needed to win (Style Challenge)
 *   size       outfield players per side
 */
export const MODES = {
  quick: { id: 'quick', label: 'QUICK MATCH', desc: '3 v 3, three minutes, most goals wins.', duration: 180, size: 3 },
  firstTo5: { id: 'firstTo5', label: 'FIRST TO 5', desc: 'No clock. The first side to five goals takes it.', duration: null, target: 5, size: 3 },
  style: { id: 'style', label: 'STYLE CHALLENGE', desc: 'Two minutes to score 8,000 style points. Goals, tricks and combos all count.', duration: 120, styleGoal: 8000, size: 3 },
  oneVone: { id: 'oneVone', label: '1 V 1', desc: 'Just you, one defender and the keepers. Two minutes.', duration: 120, size: 1 },
  tournament: { id: 'tournament', label: 'TOURNAMENT', desc: 'Three knockout rounds across three cities, each opponent harder. Draws go to next goal wins.', duration: 150, size: 3, rounds: 3 },
};

export const VENUES = [
  { id: 'brazil', name: 'BRAZIL', place: 'Vila Esperança street court' },
  { id: 'newyork', name: 'NEW YORK', place: 'Rooftop court at dusk' },
  { id: 'london', name: 'LONDON', place: 'Railway arch cage' },
  { id: 'tokyo', name: 'TOKYO', place: 'Neon night court' },
  { id: 'barcelona', name: 'BARCELONA', place: 'Neighbourhood plaça' },
];

/** Tournament rounds: opponents and courts are drawn from the other teams; difficulty climbs. */
export const TOURNAMENT_ROUNDS = [
  { label: 'QUARTER-FINAL', difficulty: 'easy' },
  { label: 'SEMI-FINAL', difficulty: 'normal' },
  { label: 'FINAL', difficulty: 'hard' },
];

/** Persistent progress (wins, style records, unlocked kits). */
export class Progress {
  constructor(storage) {
    this.storage = storage;
    this.data = { wins: 0, bestStyle: 0, tricks: 0, bicycleGoals: 0, tournaments: 0, firstTo5Wins: 0, tutorialDone: false };
    try {
      Object.assign(this.data, JSON.parse(storage.get('progress') ?? '{}'));
    } catch {
      /* fresh progress */
    }
  }

  save() {
    this.storage.set('progress', JSON.stringify(this.data));
  }

  unlocked(kit) {
    return !kit.unlock || UNLOCKS[kit.unlock]?.test(this.data);
  }

  /** Apply a change, save, and return the labels of kits it newly unlocks. */
  update(fn) {
    const before = new Set(this.allKits().filter((k) => this.unlocked(k.kit)).map((k) => k.key));
    fn(this.data);
    this.save();
    return this.allKits()
      .filter((k) => this.unlocked(k.kit) && !before.has(k.key))
      .map((k) => `${k.team.name} ${k.kit.label}`);
  }

  allKits() {
    return TEAM_LIST.flatMap((team) => team.kits.map((kit) => ({ team, kit, key: `${team.id}:${kit.id}` })));
  }
}
