import type { ChallengeState } from '../core/types';
import type { GameEvents as EventMap } from '../core/EventBus';
import type { Simulation } from '../simulation/SimulationManager';
import { relationKey } from '../world/Settlements';

export type ChallengeCategory = 'Miracle' | 'Civilization' | 'Cultural' | 'Chaos' | 'Diplomacy';
export type ChallengeDifficulty = 'easy' | 'medium' | 'hard';

export interface ChallengeObjective {
  id: string;
  label: string;
  target: number;
  /**
   * counter  — incremented by event handlers (persisted in state.counters[id]);
   * state    — read from the live world each check;
   * duration — seconds a condition has held continuously (state.held). Interruptions RESET it to 0.
   */
  kind: 'counter' | 'state' | 'duration';
  value?: (sim: Simulation, st: ChallengeState) => number;
  /** duration objectives: is the condition satisfied right now? */
  holds?: (sim: Simulation) => boolean;
}

export interface ChallengeReward {
  energy?: number;
  approval?: number;
  chaos?: number;
  title?: string;
  cosmetic?: string;
  history?: { title: string; text: string };
}

type Handlers = { [K in keyof EventMap]?: (sim: Simulation, e: EventMap[K], st: ChallengeState) => void };

export interface ChallengeDefinition {
  id: string;
  title: string;
  description: string;
  category: ChallengeCategory;
  difficulty: ChallengeDifficulty;
  objectives: ChallengeObjective[];
  reward: ChallengeReward;
  /** Extra unlock rule on top of the difficulty gate. */
  unlock?: (sim: Simulation) => boolean;
  on?: Handlers;
}

const bump = (st: ChallengeState, id: string, by = 1) => {
  st.counters[id] = (st.counters[id] ?? 0) + by;
};

const nearVillage = (sim: Simulation, x: number, z: number, extra: number) => {
  const { village, distance } = sim.nearestVillage(x, z);
  return village && distance < village.radius + extra ? village : null;
};

const hasRelation = (sim: Simulation, test: (cat: string) => boolean) => Object.values(sim.state.civ.relations).some((r) => test(r.category));

export const COSMETIC_LABEL: Record<string, string> = {
  'golden-lightning': 'Golden Lightning',
  'rainbow-rain': 'Rainbow Rain',
  'intern-statue': 'Statue of the Intern',
  'gold-nameplate': 'Gold Desk Nameplate',
};

/** The twenty divine challenges. Every objective reads real simulation state or real events. */
export const CHALLENGES: ChallengeDefinition[] = [
  // ---------------- Miracle ----------------
  {
    id: 'let-there-be-rain',
    title: 'Let There Be Rain',
    description: 'Start a rain over a village that actually needs water or food.',
    category: 'Miracle',
    difficulty: 'easy',
    objectives: [{ id: 'rain', label: 'Rain on a thirsty or hungry village', target: 1, kind: 'counter' }],
    reward: { energy: 20, approval: 3, title: 'Certified Rain Technician' },
    on: {
      RAIN_STARTED: (sim, e, st) => {
        const v = nearVillage(sim, e.x, e.z, e.radius + 6);
        if (v && (v.water < 60 || v.food < 50)) bump(st, 'rain');
      },
    },
  },
  {
    id: 'amateur-botanist',
    title: 'Amateur Botanist',
    description: 'Plant ten trees with the Nature power.',
    category: 'Miracle',
    difficulty: 'easy',
    objectives: [{ id: 'trees', label: 'Trees planted', target: 10, kind: 'counter' }],
    reward: { energy: 25, approval: 2, history: { title: 'The Intern Took Up Gardening', text: 'Ten trees, planted by divine hand. Three are facing the wrong way.' } },
    on: { TREE_PLANTED: (_sim, e, st) => e.byPlayer && bump(st, 'trees') },
  },
  {
    id: 'firefighter',
    title: 'Firefighter of the Year',
    description: 'Put out five fires with rain.',
    category: 'Miracle',
    difficulty: 'medium',
    objectives: [{ id: 'fires', label: 'Fires extinguished by rain', target: 5, kind: 'counter' }],
    reward: { energy: 30, approval: 5, title: 'Firefighter of the Year' },
    on: { FIRE_EXTINGUISHED: (_sim, e, st) => e.byRain && bump(st, 'fires') },
  },
  {
    id: 'rock-has-spoken',
    title: 'The Rock Has Spoken',
    description: 'Strike a rock with lightning near Rockbottom. They will understand.',
    category: 'Miracle',
    difficulty: 'medium',
    objectives: [{ id: 'rock', label: 'Rocks struck near Rockbottom', target: 1, kind: 'counter' }],
    reward: { chaos: 5, approval: 3, title: 'Supreme Rock Consultant' },
    on: {
      LIGHTNING_STRUCK: (sim, e, st) => {
        if (!e.rockIds.length) return;
        const v = nearVillage(sim, e.x, e.z, 22);
        if (v?.id === 'v3') bump(st, 'rock');
      },
    },
  },
  {
    id: 'golden-age',
    title: 'Golden Age',
    description: 'Have three golden trees standing at the same time.',
    category: 'Miracle',
    difficulty: 'hard',
    objectives: [{ id: 'gold', label: 'Golden trees standing', target: 3, kind: 'state', value: (sim) => sim.state.trees.filter((t) => t.golden && !t.removed && !t.charred).length }],
    reward: { chaos: 6, approval: 4, cosmetic: 'golden-lightning' },
  },
  // ---------------- Civilization ----------------
  {
    id: 'traveling-merchant',
    title: 'The Traveling Merchant',
    description: 'Let the villages complete five trades (caravans that return home).',
    category: 'Civilization',
    difficulty: 'medium',
    objectives: [{ id: 'trades', label: 'Trades completed', target: 5, kind: 'counter' }],
    reward: { energy: 30, approval: 4, title: 'Head of Divine Logistics' },
    on: { TRADE_COMPLETED: (_sim, e, st) => e.caravan.kind === 'trade' && bump(st, 'trades') },
  },
  {
    id: 'new-neighbors',
    title: 'New Neighbors',
    description: 'A villager moves to another village and arrives safely.',
    category: 'Civilization',
    difficulty: 'easy',
    objectives: [{ id: 'moves', label: 'Migrations completed', target: 1, kind: 'counter' }],
    reward: { energy: 15, approval: 2, history: { title: 'Welcome Wagon', text: 'A newcomer was welcomed with bread and suspicion.' } },
    on: { VILLAGER_MIGRATED: (_sim, _e, st) => bump(st, 'moves') },
  },
  {
    id: 'golden-kingdom',
    title: 'The Golden Kingdom',
    description: 'All three villages above 78% prosperity and 60% happiness for a full minute.',
    category: 'Civilization',
    difficulty: 'hard',
    objectives: [
      {
        id: 'held',
        label: 'Seconds of shared prosperity',
        target: 60,
        kind: 'duration',
        holds: (sim) => sim.state.villages.length >= 3 && sim.state.villages.every((v) => v.population > 0 && v.prosperity >= 0.78 && v.happiness >= 0.6),
      },
    ],
    reward: { approval: 10, energy: 40, cosmetic: 'gold-nameplate', title: 'Assistant to the Regional God' },
  },
  {
    id: 'divine-bureaucracy',
    title: 'The Divine Bureaucracy',
    description: 'Open the Department of Miracles, then answer three prayers through it.',
    category: 'Civilization',
    difficulty: 'medium',
    objectives: [
      { id: 'office', label: 'Department of Miracles open', target: 1, kind: 'state', value: (sim) => (sim.state.culture.officeBuilt && sim.state.culture.officeProgress >= 1 ? 1 : 0) },
      { id: 'forms', label: 'Prayers answered after opening', target: 3, kind: 'counter' },
    ],
    reward: { energy: 25, approval: 5, title: 'Divine Human Resources Manager' },
    on: {
      PRAYER_COMPLETED: (sim, _e, st) => {
        if (sim.state.culture.officeBuilt && sim.state.culture.officeProgress >= 1) bump(st, 'forms');
      },
    },
  },
  // ---------------- Cultural ----------------
  {
    id: 'first-believers',
    title: 'The First Believers',
    description: 'Some religion reaches five followers.',
    category: 'Cultural',
    difficulty: 'easy',
    objectives: [{ id: 'followers', label: 'Followers of the largest faith', target: 5, kind: 'state', value: (sim) => Math.max(0, ...sim.state.religions.filter((r) => r.active).map((r) => r.followers.length)) }],
    reward: { chaos: 3, approval: 2, history: { title: 'A Congregation Formed', text: 'Five people now agree on something. Historians are stunned.' } },
  },
  {
    id: 'cultural-exchange',
    title: 'Cultural Exchange',
    description: 'A religion spreads to a village where nobody followed it.',
    category: 'Cultural',
    difficulty: 'medium',
    objectives: [{ id: 'spread', label: 'Religions carried across villages', target: 1, kind: 'counter' }],
    reward: { approval: 4, chaos: 4, energy: 15 },
    on: { RELIGION_SPREAD: (_sim, _e, st) => bump(st, 'spread') },
  },
  {
    id: 'great-pilgrimage',
    title: 'The Great Pilgrimage',
    description: 'Five pilgrims travel from other villages to pray at a sacred site.',
    category: 'Cultural',
    difficulty: 'hard',
    objectives: [{ id: 'pilgrims', label: 'Pilgrimages completed', target: 5, kind: 'counter' }],
    reward: { approval: 6, energy: 30, cosmetic: 'rainbow-rain' },
    on: { PILGRIMAGE_COMPLETED: (_sim, _e, st) => bump(st, 'pilgrims') },
  },
  {
    id: 'three-gods',
    title: 'Three Gods, One Island',
    description: 'Three religions active at the same time.',
    category: 'Cultural',
    difficulty: 'hard',
    objectives: [{ id: 'faiths', label: 'Active religions', target: 3, kind: 'state', value: (sim) => sim.state.religions.filter((r) => r.active).length }],
    reward: { chaos: 8, approval: 2, title: 'Polytheism Compliance Officer' },
  },
  // ---------------- Chaos ----------------
  {
    id: 'monumental-mistake',
    title: 'The Monumental Mistake',
    description: 'Villagers finish building a monument to something you did.',
    category: 'Chaos',
    difficulty: 'medium',
    objectives: [{ id: 'monuments', label: 'Monuments completed', target: 1, kind: 'counter' }],
    reward: { chaos: 5, energy: 20, cosmetic: 'intern-statue', history: { title: 'A Statue of the Intern', text: 'In gratitude (or confusion), a statue of the intern now stands in Puddleton.' } },
    on: { MONUMENT_COMPLETED: (_sim, _e, st) => bump(st, 'monuments') },
  },
  {
    id: 'diplomatic-disaster',
    title: 'Diplomatic Disaster',
    description: 'Drive two villages into open hostility. No weapons involved, just pettiness.',
    category: 'Chaos',
    difficulty: 'medium',
    objectives: [{ id: 'hostile', label: 'Hostile relationships', target: 1, kind: 'state', value: (sim) => Object.values(sim.state.civ.relations).filter((r) => r.category === 'hostile').length }],
    reward: { chaos: 10, title: 'Ambassador of Oops' },
  },
  {
    id: 'worst-intern',
    title: 'The Worst Intern Ever',
    description: 'Reach 80 Chaos while every village still has at least 5 people and 35% prosperity.',
    category: 'Chaos',
    difficulty: 'hard',
    objectives: [
      { id: 'chaos', label: 'Chaos reputation', target: 80, kind: 'state', value: (sim) => sim.state.chaos },
      { id: 'alive', label: 'Villages still functioning', target: 3, kind: 'state', value: (sim) => sim.state.villages.filter((v) => v.population >= 5 && v.prosperity >= 0.35).length },
    ],
    reward: { chaos: 5, approval: -5, title: 'Employee of the Apocalypse' },
  },
  // ---------------- Diplomacy ----------------
  {
    id: 'divine-tourist',
    title: 'Divine Tourist',
    description: 'Fly the camera over all three villages.',
    category: 'Diplomacy',
    difficulty: 'easy',
    objectives: [{ id: 'visited', label: 'Villages visited', target: 3, kind: 'state', value: (sim) => sim.state.civ.visited.length }],
    reward: { energy: 15, approval: 2, title: 'Divine Tourist' },
  },
  {
    id: 'international-relations',
    title: 'International Relations',
    description: 'Get any two villages to Friendly (or better).',
    category: 'Diplomacy',
    difficulty: 'medium',
    objectives: [{ id: 'friends', label: 'Friendly relationships', target: 1, kind: 'state', value: (sim) => (hasRelation(sim, (c) => c === 'friendly' || c === 'allied') ? 1 : 0) }],
    reward: { energy: 20, approval: 5, history: { title: 'International Relations Established', text: 'Two villages agreed to stop being weird at each other. Mostly.' } },
  },
  {
    id: 'equal-opportunity',
    title: 'Equal Opportunity God',
    description: 'For two straight minutes, every village has received help recently and none is favored by more than 20.',
    category: 'Diplomacy',
    difficulty: 'hard',
    objectives: [
      {
        id: 'fair',
        label: 'Seconds of fair treatment',
        target: 120,
        kind: 'duration',
        holds: (sim) => {
          const pos = sim.state.villages.map((v) => sim.civ.favorSum(v.id, 1));
          return pos.length >= 3 && Math.min(...pos) >= 10 && Math.max(...pos) - Math.min(...pos) <= 20;
        },
      },
    ],
    reward: { approval: 10, energy: 30, title: 'Fairest Intern in the Realm' },
  },
  {
    id: 'peace-treaty',
    title: 'The Peace Treaty',
    description: 'Turn a pair of villages that were Rivals into Friends.',
    category: 'Diplomacy',
    difficulty: 'hard',
    objectives: [{ id: 'peace', label: 'Former rivals now friendly', target: 1, kind: 'counter' }],
    reward: { approval: 12, energy: 40, history: { title: 'The Peace Treaty', text: 'Former rivals signed a treaty on a large flat rock. The rock is now a tourist attraction.' } },
    on: {
      RELATIONSHIP_CHANGED: (sim, e, st) => {
        const rec = sim.state.civ.relations[relationKey(e.a, e.b)];
        if (rec?.everRival && (e.to === 'friendly' || e.to === 'allied')) bump(st, 'peace');
      },
    },
  },
];

export const CHALLENGE_BY_ID = new Map(CHALLENGES.map((c) => [c.id, c]));
