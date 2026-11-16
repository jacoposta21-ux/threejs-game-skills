/**
 * The people of Nazareth. Appearance, voice, home and daily routine per NPC.
 *
 * Routine step: { go, act, dur:[min,max], carry, carryAfter, say }
 *   go:   'spot:<name>' | 'stall:<k>' (merchant stand) | 'stallFront:<k>' (shopper)
 *         'bench:<i>' | 'door' (own home) | 'door:any' | 'point:x,z' | 'wander:x,z,r'
 *   act:  animation while there (idle, sell, hammer, sweep, draw-water, pray, sit, talk, look)
 *   carry / carryAfter: item shown on the way / after the step (jar, basket, plank...)
 * Blocks: day (06:00–18:30), evening (until 20:00); at night everyone goes home.
 */
const SKIN = ['#e0b48a', '#c99a6e', '#b07d52', '#d6a77a', '#9a6844', '#e8c29c'];
const HAIR = ['#2b1d14', '#4a2f1d', '#6a4126', '#1f1712', '#3a2618'];
const TUNIC = ['#e8dcc0', '#c9b48f', '#a7845a', '#8f9a6a', '#6f87a0', '#b56a4a', '#d9c7a2', '#7d6a8f', '#9c8a6a'];
const SCARF = ['#3d6fb0', '#b8322e', '#e0a12c', '#7d8f2f', '#c4567a', '#e8dcc0', '#4b3f8f', '#2c7f7a'];
const WRAP = ['#e8dcc0', '#d9c7a2', '#c9b48f', '#efe6d2'];

export const NAMED = [
  {
    id: 'npc.mary', name: 'Mary', role: 'Your mother', voice: 1.25, dialogue: 'mary', home: 'workshop',
    look: { variant: 'woman', skin: '#d6a77a', hair: '#3a2618', tunic: '#e8dcc0', tunicShade: '#d9cbaa', headwear: { type: 'scarf', color: '#3d6fb0' }, mantle: '#3d6fb0', carry: ['jar', 'broom'] },
    routine: {
      day: [
        { go: 'spot:workshopYard', act: 'sweep', dur: [14, 20], carry: 'broom' },
        { go: 'spot:well2', act: 'draw-water', dur: [6, 8], carryAfter: 'jar', say: 'well' },
        { go: 'spot:workshopYard', act: 'idle', dur: [6, 10], carry: 'jar' },
        { go: 'stallFront:1', act: 'talk', dur: [8, 12], say: 'shop' },
        { go: 'bench:1', act: 'sit', dur: [10, 16] },
      ],
      evening: [{ go: 'spot:workshopYard', act: 'idle', dur: [10, 20] }],
    },
  },
  {
    id: 'npc.joseph', name: 'Joseph', role: 'Carpenter', voice: 0.8, dialogue: 'joseph', home: 'workshop',
    look: { variant: 'elder', skin: '#c99a6e', hair: '#6b6058', hairStyle: 'short', beard: '#7a7068', tunic: '#a7845a', tunicShade: '#8f6f4a', belt: '#5a3a1e', carry: ['plank'] },
    routine: {
      day: [
        { go: 'spot:workbench', act: 'hammer', dur: [18, 28], say: 'work' },
        { go: 'spot:workshopYard', act: 'idle', dur: [4, 6], carry: 'plank' },
        { go: 'spot:workbench', act: 'hammer', dur: [18, 28] },
        { go: 'spot:trough', act: 'look', dur: [5, 8] },
      ],
      evening: [{ go: 'bench:0', act: 'sit', dur: [20, 30] }],
    },
  },
  { id: 'npc.levi', name: 'Levi', role: 'Fruit seller', voice: 1.05, dialogue: 'levi', stall: 0, look: { variant: 'adult', skin: SKIN[2], hair: HAIR[0], beard: HAIR[0], tunic: '#8f9a6a', headwear: { type: 'wrap', color: WRAP[0], band: '#3a2a20' } } },
  { id: 'npc.eli', name: 'Eli', role: 'Baker', voice: 0.95, dialogue: 'eli', stall: 1, look: { variant: 'adult', skin: SKIN[0], hair: HAIR[1], hairStyle: 'bald', beard: HAIR[1], tunic: '#efe6d2', tunicShade: '#d9cbaa', belt: '#b8762c', scale: 1.06 } },
  { id: 'npc.tobias', name: 'Tobias', role: 'Fishmonger', voice: 0.9, dialogue: 'tobias', stall: 2, look: { variant: 'adult', skin: SKIN[4], hair: HAIR[3], beard: HAIR[3], tunic: '#6f87a0', headwear: { type: 'wrap', color: '#d9c7a2' } } },
  { id: 'npc.rachel', name: 'Rachel', role: 'Potter', voice: 1.2, dialogue: 'rachel', stall: 3, look: { variant: 'woman', skin: SKIN[1], hair: HAIR[2], hairStyle: 'bun', tunic: '#b56a4a', headwear: { type: 'scarf', color: '#e0a12c' } } },
  { id: 'npc.dina', name: 'Dina', role: 'Cloth merchant', voice: 1.3, dialogue: 'merchant', stall: 4, look: { variant: 'woman', skin: SKIN[3], hair: HAIR[0], tunic: '#7d6a8f', headwear: { type: 'scarf', color: '#c4567a' }, mantle: '#e0a12c' } },
  { id: 'npc.naomi', name: 'Naomi', role: 'Spice seller', voice: 1.15, dialogue: 'merchant', stall: 5, look: { variant: 'elder', skin: SKIN[2], hair: '#d8d4cc', tunic: '#b8322e', headwear: { type: 'scarf', color: '#2c7f7a' } } },
  {
    id: 'npc.simon', name: 'Simon', role: 'Fisherman', voice: 0.85, dialogue: 'simon', home: 'east',
    look: { variant: 'adult', skin: SKIN[4], hair: HAIR[1], hairStyle: 'long', beard: HAIR[1], tunic: '#9c8a6a', tunicShade: '#7f6e52', headwear: { type: 'wrap', color: '#efe6d2', band: '#5a3a1e' }, carry: ['net', 'basket'], basketFill: '#9fb3bd' },
    routine: {
      day: [
        { go: 'point:108,-8', act: 'look', dur: [14, 20], carry: 'net', say: 'lake' },
        { go: 'stallFront:2', act: 'talk', dur: [8, 10], carry: 'basket', say: 'fish' },
        { go: 'spot:trough', act: 'idle', dur: [4, 6] },
      ],
      evening: [{ go: 'bench:3', act: 'sit', dur: [20, 30] }],
    },
  },
  {
    id: 'npc.hannah', name: 'Old Hannah', role: 'Knows everything', voice: 1.1, dialogue: 'hannah',
    look: { variant: 'elder', skin: SKIN[0], hair: '#e2ded6', tunic: '#4b3f8f', tunicShade: '#3d3474', headwear: { type: 'scarf', color: '#2b2b3a' }, carry: ['jar'] },
    routine: {
      day: [
        { go: 'bench:2', act: 'sit', dur: [24, 36], say: 'gossip' },
        { go: 'spot:well', act: 'draw-water', dur: [6, 8], carryAfter: 'jar' },
        { go: 'bench:2', act: 'sit', dur: [24, 36] },
      ],
      evening: [{ go: 'bench:2', act: 'sit', dur: [30, 40] }],
    },
  },
  {
    id: 'npc.ezra', name: 'Rabbi Ezra', role: 'Teacher', voice: 0.75, dialogue: 'ezra',
    look: { variant: 'elder', skin: SKIN[1], hair: '#d8d4cc', beard: '#e8e4dc', tunic: '#efe6d2', tunicShade: '#d9cbaa', mantle: '#2f5d8a', headwear: { type: 'wrap', color: '#efe6d2' }, carry: ['scroll'] },
    routine: {
      day: [
        { go: 'spot:portico', act: 'pray', dur: [20, 30], carry: 'scroll' },
        { go: 'spot:synagogueSteps', act: 'talk', dur: [10, 14], say: 'wisdom' },
        { go: 'bench:4', act: 'sit', dur: [16, 22] },
      ],
      evening: [{ go: 'spot:portico', act: 'pray', dur: [30, 40] }],
    },
  },
  {
    id: 'npc.amos', name: 'Amos', role: 'Shepherd', voice: 0.9, dialogue: 'amos', home: 'west', flock: true,
    look: { variant: 'adult', skin: SKIN[2], hair: HAIR[3], beard: HAIR[3], tunic: '#c9b48f', tunicShade: '#a99470', mantle: '#7d5a3a', headwear: { type: 'wrap', color: '#a7845a', band: '#3a2a20' }, carry: ['staff'] },
    routine: {
      day: [
        { go: 'point:-58,-6', act: 'look', dur: [12, 18], carry: 'staff', say: 'sheep' },
        { go: 'point:-82,10', act: 'idle', dur: [14, 20], carry: 'staff' },
        { go: 'point:-70,22', act: 'look', dur: [12, 18], carry: 'staff' },
      ],
      evening: [{ go: 'point:-56,-4', act: 'idle', dur: [20, 30], carry: 'staff' }],
    },
  },
  {
    id: 'npc.benjamin', name: 'Benjamin', role: 'Bad knee since forever', voice: 0.78, dialogue: 'benjamin', injured: 'chronic',
    look: { variant: 'elder', skin: SKIN[3], hair: '#cfc9bf', beard: '#dcd6cc', tunic: '#9c8a6a', tunicShade: '#7f6e52', headwear: { type: 'wrap', color: '#d9c7a2' }, carry: ['staff'] },
    routine: {
      day: [
        { go: 'spot:synagogueSteps', act: 'idle', dur: [20, 30], carry: 'staff' },
        { go: 'bench:6', act: 'sit', dur: [24, 34] },
      ],
      evening: [{ go: 'bench:6', act: 'sit', dur: [30, 40] }],
    },
  },
  { id: 'npc.sami', name: 'Sami', role: 'Village kid', voice: 1.7, dialogue: 'child', kid: 'tag', look: { variant: 'child', skin: SKIN[2], hair: HAIR[0], tunic: '#e0a12c', tunicShade: '#c98a1b', scale: 0.66 } },
  { id: 'npc.leah', name: 'Leah', role: 'Village kid', voice: 1.85, dialogue: 'child', kid: 'tag', look: { variant: 'child', skin: SKIN[3], hair: HAIR[2], hairStyle: 'long', tunic: '#c4567a', tunicShade: '#a8466a', scale: 0.62 } },
  {
    id: 'npc.yusuf', name: 'Yusuf', role: 'Traveller from Capernaum', voice: 0.95, dialogue: 'yusuf', traveller: true,
    look: { variant: 'adult', skin: SKIN[4], hair: HAIR[0], beard: HAIR[0], tunic: '#6f87a0', tunicShade: '#5a6f86', mantle: '#b8322e', headwear: { type: 'wrap', color: '#e8dcc0', band: '#2b1d14' }, carry: ['staff'] },
    routine: {
      day: [
        { go: 'point:-122,2', act: 'idle', dur: [2, 3], carry: 'staff', teleportIfHidden: true },
        { go: 'spot:trough', act: 'draw-water', dur: [6, 8], carry: 'staff', say: 'travel' },
        { go: 'bench:5', act: 'sit', dur: [14, 20] },
        { go: 'point:128,-7', act: 'idle', dur: [2, 3], carry: 'staff' },
      ],
      evening: [{ go: 'bench:5', act: 'sit', dur: [30, 40] }],
    },
  },
];

const MALE_NAMES = ['Judah', 'Caleb', 'Micah', 'Asher', 'Gideon', 'Reuben'];
const FEMALE_NAMES = ['Ruth', 'Martha', 'Abigail', 'Zillah', 'Tamar', 'Leah the Elder'];

/** Generic villagers and spare merchants, generated deterministically. */
export function generateVillagers(rng) {
  const list = [];
  const make = (i, female) => {
    const name = female ? FEMALE_NAMES[i % FEMALE_NAMES.length] : MALE_NAMES[i % MALE_NAMES.length];
    const look = female
      ? { variant: 'woman', skin: rng.pick(SKIN), hair: rng.pick(HAIR), hairStyle: rng.pick(['short', 'long', 'bun']), tunic: rng.pick(TUNIC), headwear: { type: 'scarf', color: rng.pick(SCARF) }, carry: ['jar', 'basket'], basketFill: rng.pick(['#e07b28', '#c8323a', '#9ab53c', '#b8763a']) }
      : { variant: rng() < 0.25 ? 'elder' : 'adult', skin: rng.pick(SKIN), hair: rng.pick(HAIR), hairStyle: rng.pick(['short', 'short', 'bald']), beard: rng() < 0.75 ? rng.pick(HAIR) : null, tunic: rng.pick(TUNIC), headwear: rng() < 0.6 ? { type: 'wrap', color: rng.pick(WRAP), band: rng() < 0.5 ? '#3a2a20' : null } : null, mantle: rng() < 0.35 ? rng.pick(SCARF) : null, carry: ['jar', 'basket'], basketFill: rng.pick(['#e07b28', '#c8323a', '#b8763a']) };
    if (look.variant === 'elder' && look.hairStyle !== 'bald') look.hair = '#b8b2a8';
    return { look, name };
  };
  for (let i = 0; i < 10; i += 1) {
    const female = i % 2 === 0;
    const { look, name } = make(i, female);
    list.push({
      id: `npc.villager.${i}`, name, role: 'Villager', voice: female ? 1.15 + rng() * 0.2 : 0.85 + rng() * 0.2,
      dialogue: 'villager', look, generic: true,
    });
  }
  // spare merchants at stalls 7 and 8
  for (const [k, female] of [[7, false], [8, true]]) {
    const { look } = make(k, female);
    list.push({ id: `npc.merchant.${k}`, name: female ? 'Shoshana' : 'Ezekiel', role: female ? 'Potter' : 'Baker', voice: female ? 1.2 : 0.9, dialogue: 'merchant', stall: k, look });
  }
  return list;
}

/** Day routine for a generic villager: errands around the village. */
export function villagerRoutine(rng) {
  const steps = [];
  const pool = [
    () => ({ go: rng() < 0.5 ? 'spot:well' : 'spot:well2', act: 'draw-water', dur: [5, 8], carryAfter: 'jar', say: 'well' }),
    () => ({ go: 'door', act: 'idle', dur: [6, 12] }),
    () => ({ go: `stallFront:${rng.int(0, 8)}`, act: 'talk', dur: [6, 12], carryAfter: 'basket', say: 'shop' }),
    () => ({ go: `bench:${rng.int(0, 5)}`, act: 'sit', dur: [10, 20] }),
    () => ({ go: 'door:any', act: 'talk', dur: [6, 10] }),
    () => ({ go: 'wander:0,0,11', act: 'look', dur: [4, 8] }),
  ];
  for (let i = 0; i < 6; i += 1) steps.push(pool[rng.int(0, pool.length - 1)]());
  return { day: steps, evening: [{ go: 'door', act: 'idle', dur: [10, 20] }] };
}

export function merchantRoutine(k) {
  return {
    day: [{ go: `stall:${k}`, act: 'sell', dur: [40, 70], say: 'sell' }, { go: `stall:${k}`, act: 'sell', dur: [40, 70] }],
    evening: [{ go: 'door', act: 'idle', dur: [20, 30] }],
  };
}
