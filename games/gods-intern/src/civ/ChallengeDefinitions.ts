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
  /** Optional per-tick bookkeeping (e.g. resolving time-stamped pending conditions). */
  tick?: (sim: Simulation, st: ChallengeState) => void;
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
  'employee-plaque': 'Employee of the Month Plaque',
  'cosmic-aura': 'Cosmic Aura',
  'golden-badge': 'Golden Career Badge',
  'god-monument': 'Monument of the Intern',
};

/** The twenty divine challenges. Every objective reads real simulation state or real events. */
export const CHALLENGES: ChallengeDefinition[] = [
  // ======================= EASY =======================
  {
    id: 'let-there-be-rain',
    title: 'Let There Be Rain',
    description: "Restore a village's water supply through divine intervention: rain on a village whose water is below 35 and get it back to 60.",
    category: 'Miracle',
    difficulty: 'easy',
    objectives: [{ id: 'restored', label: 'Water supplies restored by rain', target: 1, kind: 'counter' }],
    reward: { energy: 20, approval: 3, title: 'Certified Rain Technician' },
    on: {
      RAIN_STARTED: (sim, e, st) => {
        const v = nearVillage(sim, e.x, e.z, e.radius + 6);
        // Remember which village was thirsty when the rain started (time-stamped, persisted).
        if (v && v.water < 35) st.counters[`pending:${v.id}`] = sim.state.time;
      },
    },
    tick: (sim, st) => {
      for (const key of Object.keys(st.counters)) {
        if (!key.startsWith('pending:')) continue;
        const v = sim.village(key.slice(8));
        const since = sim.state.time - st.counters[key];
        if (v && v.water >= 60) {
          delete st.counters[key];
          bump(st, 'restored');
        } else if (!v || since > 150) delete st.counters[key];
      }
    },
  },
  {
    id: 'amateur-botanist',
    title: 'Amateur Botanist',
    description: 'Grow ten trees using Nature (planted by you and fully grown).',
    category: 'Miracle',
    difficulty: 'easy',
    objectives: [{ id: 'grown', label: 'Your trees fully grown', target: 10, kind: 'state', value: (sim) => sim.state.trees.filter((t) => t.byPlayer && !t.removed && !t.charred && t.growth >= 0.99).length }],
    reward: { energy: 25, approval: 2, history: { title: 'The Intern Took Up Gardening', text: 'Ten trees, grown by divine hand. Three are facing the wrong way.' } },
  },
  {
    id: 'firefighter',
    title: 'Firefighter of the Year',
    description: 'Put out, with rain, a fire that you started.',
    category: 'Miracle',
    difficulty: 'easy',
    objectives: [{ id: 'own', label: 'Your own fires extinguished by rain', target: 1, kind: 'counter' }],
    reward: { energy: 20, approval: 3, title: 'Firefighter of the Year' },
    on: { FIRE_EXTINGUISHED: (_sim, e, st) => e.byRain && e.byPlayer && bump(st, 'own') },
  },
  {
    id: 'first-believers',
    title: 'The First Believers',
    description: 'Witness the formation of a religion.',
    category: 'Cultural',
    difficulty: 'easy',
    objectives: [{ id: 'founded', label: 'Religions founded', target: 1, kind: 'state', value: (sim) => sim.state.religions.length }],
    reward: { chaos: 3, approval: 2, history: { title: 'A Congregation Formed', text: 'Several people now agree on something. Historians are stunned.' } },
  },
  {
    id: 'divine-tourist',
    title: 'Divine Tourist',
    description: 'Visit all three villages with the camera.',
    category: 'Diplomacy',
    difficulty: 'easy',
    objectives: [{ id: 'visited', label: 'Villages visited', target: 3, kind: 'state', value: (sim) => sim.state.civ.visited.length }],
    reward: { energy: 15, approval: 2, title: 'Divine Tourist' },
  },
  // ======================= MEDIUM =======================
  {
    id: 'rock-has-spoken',
    title: 'The Rock Has Spoken',
    description: 'Cause villagers to crown a rock.',
    category: 'Chaos',
    difficulty: 'medium',
    objectives: [{ id: 'crowned', label: 'Rocks crowned', target: 1, kind: 'state', value: (sim) => sim.state.rocks.filter((r) => r.crowned).length }],
    reward: { energy: 20, chaos: 5, title: 'Supreme Rock Consultant' },
  },
  {
    id: 'golden-age',
    title: 'Golden Age',
    description: 'Create three golden trees with Mutation.',
    category: 'Miracle',
    difficulty: 'medium',
    objectives: [{ id: 'gold', label: 'Golden trees created', target: 3, kind: 'counter' }],
    reward: { chaos: 6, approval: 2, cosmetic: 'golden-lightning' },
    on: { MUTATION_APPLIED: (_sim, e, st) => e.mutation.kind === 'golden-tree' && bump(st, 'gold') },
  },
  {
    id: 'international-relations',
    title: 'International Relations',
    description: 'Improve the relationship between two villages to Friendly.',
    category: 'Diplomacy',
    difficulty: 'medium',
    objectives: [{ id: 'friends', label: 'Friendly relationships', target: 1, kind: 'state', value: (sim) => (hasRelation(sim, (c) => c === 'friendly' || c === 'allied') ? 1 : 0) }],
    reward: { energy: 20, approval: 5, history: { title: 'International Relations Established', text: 'Two villages agreed to stop being weird at each other. Mostly.' } },
  },
  {
    id: 'traveling-merchant',
    title: 'The Traveling Merchant',
    description: 'Complete five successful trade expeditions (caravans that deliver and come home).',
    category: 'Civilization',
    difficulty: 'medium',
    objectives: [{ id: 'trades', label: 'Successful trade expeditions', target: 5, kind: 'counter' }],
    reward: { energy: 30, approval: 4, title: 'Head of Divine Logistics' },
    on: { TRADE_COMPLETED: (_sim, e, st) => e.caravan.kind === 'trade' && e.caravan.outcome === 'success' && bump(st, 'trades') },
  },
  {
    id: 'cultural-exchange',
    title: 'Cultural Exchange',
    description: 'Spread one religion to a second village.',
    category: 'Cultural',
    difficulty: 'medium',
    objectives: [{ id: 'spread', label: 'Religions carried to another village', target: 1, kind: 'counter' }],
    reward: { approval: 4, chaos: 4, energy: 15 },
    on: { RELIGION_SPREAD: (_sim, _e, st) => bump(st, 'spread') },
  },
  {
    id: 'new-neighbors',
    title: 'New Neighbors',
    description: 'A villager successfully moves from one village to another.',
    category: 'Civilization',
    difficulty: 'medium',
    objectives: [{ id: 'moves', label: 'Migrations completed', target: 1, kind: 'counter' }],
    reward: { energy: 15, approval: 3, history: { title: 'Welcome Wagon', text: 'A newcomer was welcomed with bread and suspicion.' } },
    on: { VILLAGER_MIGRATED: (_sim, _e, st) => bump(st, 'moves') },
  },
  {
    id: 'equal-opportunity',
    title: 'Equal Opportunity God',
    description: 'Keep positive divine favor balanced for two minutes: every village has received at least 10 favor in the last five minutes, and no village leads by more than 20.',
    category: 'Diplomacy',
    difficulty: 'medium',
    objectives: [
      {
        id: 'fair',
        label: 'Seconds of fair treatment (resets if broken)',
        target: 120,
        kind: 'duration',
        holds: (sim) => {
          const pos = sim.state.villages.map((v) => sim.civ.favorSum(v.id, 1));
          return pos.length >= 3 && Math.min(...pos) >= 10 && Math.max(...pos) - Math.min(...pos) <= 20;
        },
      },
    ],
    reward: { approval: 8, energy: 30, title: 'Divine Human Resources Manager' },
  },
  {
    id: 'great-pilgrimage',
    title: 'The Great Pilgrimage',
    description: 'Followers from two different villages visit the same sacred place.',
    category: 'Cultural',
    difficulty: 'medium',
    objectives: [{ id: 'villages', label: 'Villages that visited one sacred place', target: 2, kind: 'state', value: (_sim, st) => Math.max(0, ...Object.keys(st.counters).filter((k) => k.startsWith('n:')).map((k) => st.counters[k])) }],
    reward: { approval: 6, energy: 25, cosmetic: 'rainbow-rain' },
    on: {
      // Every visit to a sacred place by a believer (locals and pilgrims) is recorded per village.
      SACRED_VISITED: (_sim, e, st) => {
        const key = `v:${e.sacredId}:${e.villageId}`;
        if (st.counters[key]) return;
        st.counters[key] = 1;
        bump(st, `n:${e.sacredId}`);
      },
    },
  },
  {
    id: 'monumental-mistake',
    title: 'The Monumental Mistake',
    description: 'Villagers complete construction of a major sacred monument.',
    category: 'Cultural',
    difficulty: 'medium',
    objectives: [{ id: 'monuments', label: 'Monuments completed', target: 1, kind: 'counter' }],
    reward: { chaos: 5, energy: 20, cosmetic: 'intern-statue', history: { title: 'A Statue of the Intern', text: 'In gratitude (or confusion), a statue of the intern now stands in Puddleton.' } },
    on: { MONUMENT_COMPLETED: (_sim, _e, st) => bump(st, 'monuments') },
  },
  // ======================= HARD =======================
  {
    id: 'three-gods',
    title: 'Three Gods, One Island',
    description: 'Maintain three distinct religions at the same time.',
    category: 'Cultural',
    difficulty: 'hard',
    objectives: [{ id: 'faiths', label: 'Active religions', target: 3, kind: 'state', value: (sim) => sim.state.religions.filter((r) => r.active).length }],
    reward: { chaos: 8, approval: 2, title: 'Polytheism Compliance Officer' },
  },
  {
    id: 'diplomatic-disaster',
    title: 'Diplomatic Disaster',
    description: 'Two villages become Rivals because of religious tension or divine favoritism.',
    category: 'Chaos',
    difficulty: 'hard',
    objectives: [{ id: 'rivals', label: 'Rivalries caused by faith or favoritism', target: 1, kind: 'counter' }],
    reward: { chaos: 10, title: 'Ambassador of Oops' },
    on: {
      RELATIONSHIP_CHANGED: (sim, e, st) => {
        if (e.to !== 'rival' && e.to !== 'hostile') return;
        const rec = sim.state.civ.relations[relationKey(e.a, e.b)];
        const causes = rec?.negCauses ?? {};
        const tension = (causes.theology ?? 0) + (causes.favoritism ?? 0) + (causes.envy ?? 0);
        // Most of the damage since the last category change must come from faith or favoritism.
        const total = Object.values(causes).reduce((a, b) => a + b, 0);
        if (tension > 0 && tension >= total * 0.3) bump(st, 'rivals');
      },
    },
  },
  {
    id: 'peace-treaty',
    title: 'The Peace Treaty',
    description: 'Restore a Rival relationship to Friendly.',
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
  {
    id: 'golden-kingdom',
    title: 'The Golden Kingdom',
    description: 'All three villages above 78% prosperity and 60% happiness at once, for a full minute.',
    category: 'Civilization',
    difficulty: 'hard',
    objectives: [
      {
        id: 'held',
        label: 'Seconds of shared prosperity (resets if broken)',
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
    description: 'Trigger the Department of Miracles, then answer three prayers afterwards.',
    category: 'Civilization',
    difficulty: 'hard',
    objectives: [
      { id: 'office', label: 'Department of Miracles triggered', target: 1, kind: 'state', value: (sim) => (sim.state.culture.officeBuilt ? 1 : 0) },
      { id: 'forms', label: 'Prayers answered afterwards', target: 3, kind: 'counter' },
    ],
    reward: { energy: 30, approval: 6, title: 'Senior Form Stamper' },
    on: {
      PRAYER_COMPLETED: (sim, _e, st) => {
        if (sim.state.culture.officeBuilt) bump(st, 'forms');
      },
    },
  },
  {
    id: 'worst-intern',
    title: 'The Worst Intern Ever',
    description: 'Reach 80 Chaos while every village keeps at least 5 people and 35% prosperity.',
    category: 'Chaos',
    difficulty: 'hard',
    objectives: [
      { id: 'chaos', label: 'Chaos reputation', target: 80, kind: 'state', value: (sim) => sim.state.chaos },
      { id: 'alive', label: 'Villages still functioning', target: 3, kind: 'state', value: (sim) => sim.state.villages.filter((v) => v.population >= 5 && v.prosperity >= 0.35).length },
    ],
    reward: { chaos: 5, approval: -5, title: 'Employee of the Apocalypse' },
  },
  // ======================= v0.4 (new powers and career) =======================
  {
    id: 'wind-management',
    title: 'Wind Management',
    description: 'Hit a village with a Tornado, then let it recover: no destroyed buildings and everything repaired.',
    category: 'Miracle',
    difficulty: 'medium',
    unlock: (sim) => sim.state.unlockedPowers.includes('tornado'),
    objectives: [{ id: 'recovered', label: 'Villages recovered after a tornado', target: 1, kind: 'counter' }],
    reward: { energy: 30, approval: 6, title: 'Certified Wind Manager' },
    on: {
      TORNADO_DAMAGE: (sim, e, st) => {
        const v = nearVillage(sim, e.x, e.z, 10);
        if (v && e.buildings > 0) st.counters[`hit:${v.id}`] = sim.state.time;
      },
    },
    tick: (sim, st) => {
      for (const key of Object.keys(st.counters)) {
        if (!key.startsWith('hit:')) continue;
        const id = key.slice(4);
        if (sim.state.time - st.counters[key] < 10) continue; // the storm must have passed
        if (sim.state.effects.some((e) => e.kind === 'tornado')) continue;
        const owned = sim.state.buildings.filter((b) => b.villageId === id);
        if (owned.every((b) => !b.destroyed && b.health >= 95)) {
          delete st.counters[key];
          bump(st, 'recovered');
        } else if (sim.state.time - st.counters[key] > 900) delete st.counters[key];
      }
    },
  },
  {
    id: 'cold-reception',
    title: 'Cold Reception',
    description: 'Put out a fire with Freeze.',
    category: 'Miracle',
    difficulty: 'medium',
    unlock: (sim) => sim.state.unlockedPowers.includes('freeze'),
    objectives: [{ id: 'frozen', label: 'Fires put out by frost', target: 1, kind: 'counter' }],
    reward: { energy: 25, approval: 3, title: 'Chief Refrigeration Officer' },
    on: { FIRE_EXTINGUISHED: (_sim, e, st) => e.byFreeze && bump(st, 'frozen') },
  },
  {
    id: 'unqualified-astronaut',
    title: 'Unqualified Astronaut',
    description: 'Levitate five different villagers with Gravity.',
    category: 'Chaos',
    difficulty: 'medium',
    unlock: (sim) => sim.state.unlockedPowers.includes('gravity'),
    objectives: [{ id: 'floaters', label: 'Villagers levitated', target: 5, kind: 'counter' }],
    reward: { chaos: 5, energy: 25, title: 'Head of Space Program (Unaccredited)' },
    on: {
      VILLAGER_LEVITATED: (_sim, e, st) => {
        if (st.counters[`v:${e.villagerId}`]) return;
        st.counters[`v:${e.villagerId}`] = 1;
        bump(st, 'floaters');
      },
    },
  },
  {
    id: 'department-geography',
    title: 'Department of Geography',
    description: 'Successfully reshape the land with Terraform three times.',
    category: 'Civilization',
    difficulty: 'medium',
    unlock: (sim) => sim.state.unlockedPowers.includes('terraform'),
    objectives: [{ id: 'edits', label: 'Terrain changes', target: 3, kind: 'counter' }],
    reward: { energy: 25, approval: 3, title: 'Regional Cartographer' },
    on: { POWER_USED: (_sim, e, st) => e.power === 'terraform' && bump(st, 'edits') },
  },
  {
    id: 'time-suggestion',
    title: 'Time Is a Suggestion',
    description: 'Let villagers finish construction work inside a fast Time Warp.',
    category: 'Civilization',
    difficulty: 'medium',
    unlock: (sim) => sim.state.unlockedPowers.includes('timewarp'),
    objectives: [{ id: 'built', label: 'Construction finished in fast time', target: 1, kind: 'counter' }],
    reward: { energy: 30, approval: 4, title: 'Temporal Project Manager' },
    on: { CONSTRUCTION_IN_WARP: (_sim, _e, st) => bump(st, 'built') },
  },
  {
    id: 'employee-of-the-month',
    title: 'Employee of the Month',
    description: 'Reach Career Rank 5: Regional Deity.',
    category: 'Civilization',
    difficulty: 'medium',
    objectives: [{ id: 'rank', label: 'Career rank', target: 5, kind: 'state', value: (sim) => sim.state.career.rank }],
    reward: { energy: 30, approval: 5, cosmetic: 'employee-plaque' },
  },
  {
    id: 'undercover-management',
    title: 'Undercover Management',
    description: 'Possess a villager and walk them into another village.',
    category: 'Diplomacy',
    difficulty: 'medium',
    unlock: (sim) => sim.state.unlockedPowers.includes('possession'),
    objectives: [{ id: 'visit', label: 'Foreign villages visited while possessing', target: 1, kind: 'counter' }],
    reward: { energy: 30, approval: 4, title: 'Undercover Boss' },
    on: {
      POSSESSED_VISIT: (sim, e, st) => {
        if (sim.villager(e.villagerId)?.villageId !== e.villageId) bump(st, 'visit');
      },
    },
  },
  {
    id: 'big-rock-problem',
    title: 'The Big Rock Problem',
    description: 'A meteor becomes culture: its fragment turns sacred or a faith forms around it.',
    category: 'Cultural',
    difficulty: 'medium',
    unlock: (sim) => sim.state.unlockedPowers.includes('meteor'),
    objectives: [{ id: 'cult', label: 'Meteor-born cultural events', target: 1, kind: 'counter' }],
    reward: { chaos: 8, approval: 3, title: 'Director of Astronomical Incidents' },
    on: {
      RELIGION_FOUNDED: (_sim, e, st) => e.religion.archetype === 'meteor' && bump(st, 'cult'),
      SACRED_CREATED: (sim, e, st) => {
        if (e.sacred.kind === 'rock' && sim.state.rocks[e.sacred.targetId]?.meteorite) bump(st, 'cult');
      },
    },
  },
  {
    id: 'clerical-error',
    title: 'Death Was a Clerical Error',
    description: 'Resurrect a villager.',
    category: 'Cultural',
    difficulty: 'medium',
    unlock: (sim) => sim.state.unlockedPowers.includes('resurrection'),
    objectives: [{ id: 'revived', label: 'Villagers resurrected', target: 1, kind: 'counter' }],
    reward: { approval: 8, energy: 30, title: 'Head of Paperwork Corrections' },
    on: { VILLAGER_RESURRECTED: (_sim, _e, st) => bump(st, 'revived') },
  },
  {
    id: 'gods-worst-nightmare',
    title: "God's Worst Nightmare",
    description: 'Reach Career Rank 10 while all three villages still have at least 5 people.',
    category: 'Chaos',
    difficulty: 'hard',
    objectives: [
      { id: 'rank', label: 'Career rank', target: 10, kind: 'state', value: (sim) => sim.state.career.rank },
      { id: 'alive', label: 'Villages still active', target: 3, kind: 'state', value: (sim) => sim.state.villages.filter((v) => v.population >= 5).length },
    ],
    reward: { chaos: 10, approval: 10, title: 'Permanent Replacement' },
  },
];

export const CHALLENGE_BY_ID = new Map(CHALLENGES.map((c) => [c.id, c]));
