// Gnomer profiles, one per candidate. Text lives in strings: killer.<id>.motive / .tell / .confession
// and clue.<clueId>.title / .text. The tell is the theme every true clue shares.
//
// rule: how the Gnomer picks a victim each attack night:
//   max_friendship  - whoever the player is closest to
//   last_talked     - whoever the player spoke to most recently
//   max_stat        - highest value of stats[stat]
//   nearest_home    - whoever lives closest to the Gnomer
// interval: [min, max] nights between attacks.
// clues: true evidence, only used when this candidate IS the Gnomer.
//   scene    - sparkles at an attack site (spawned in order, one per attack)
//   snoop    - hidden in furniture in the Gnomer's house
//   dialogue - told by `witness` once hearts >= minHearts and attacks >= afterAttack
//   nearmiss - appears when a charm blocks an attack (and as a late fallback)
//   sighting - what you see if you catch the Gnomer on the prowl at night
// herrings: misleading evidence, only used when this candidate is innocent.
// alibi: a dialogue clue that clears this candidate, only when innocent.

export const KILLERS = {
  odessa: {
    rule: { type: 'max_friendship' },
    interval: [3, 4],
    clues: [
      { id: 'od_scene1', kind: 'scene' },
      { id: 'od_scene2', kind: 'scene' },
      { id: 'od_scene3', kind: 'scene' },
      { id: 'od_snoop1', kind: 'snoop' },
      { id: 'od_snoop2', kind: 'snoop' },
      { id: 'od_talk1', kind: 'dialogue', witness: 'tib', minHearts: 1, afterAttack: 1 },
      { id: 'od_talk2', kind: 'dialogue', witness: 'marigold', minHearts: 1, afterAttack: 2 },
      { id: 'od_near', kind: 'nearmiss' },
      { id: 'od_seen', kind: 'sighting' },
    ],
    herrings: [{ id: 'od_herring1', kind: 'scene' }, { id: 'od_herring2', kind: 'snoop' }],
    alibi: { id: 'od_alibi', witness: 'barnaby', minHearts: 0, afterAttack: 2 },
  },
  barnaby: {
    rule: { type: 'max_stat', stat: 'wealth' },
    interval: [3, 4],
    clues: [
      { id: 'ba_scene1', kind: 'scene' },
      { id: 'ba_scene2', kind: 'scene' },
      { id: 'ba_scene3', kind: 'scene' },
      { id: 'ba_snoop1', kind: 'snoop' },
      { id: 'ba_snoop2', kind: 'snoop' },
      { id: 'ba_talk1', kind: 'dialogue', witness: 'hollis', minHearts: 1, afterAttack: 1 },
      { id: 'ba_talk2', kind: 'dialogue', witness: 'odessa', minHearts: 1, afterAttack: 2 },
      { id: 'ba_near', kind: 'nearmiss' },
      { id: 'ba_seen', kind: 'sighting' },
    ],
    herrings: [{ id: 'ba_herring1', kind: 'scene' }, { id: 'ba_herring2', kind: 'snoop' }],
    alibi: { id: 'ba_alibi', witness: 'wren', minHearts: 0, afterAttack: 2 },
  },
  fennel: {
    rule: { type: 'max_stat', stat: 'height' },
    interval: [3, 4],
    clues: [
      { id: 'fe_scene1', kind: 'scene' },
      { id: 'fe_scene2', kind: 'scene' },
      { id: 'fe_scene3', kind: 'scene' },
      { id: 'fe_snoop1', kind: 'snoop' },
      { id: 'fe_snoop2', kind: 'snoop' },
      { id: 'fe_talk1', kind: 'dialogue', witness: 'wren', minHearts: 1, afterAttack: 1 },
      { id: 'fe_talk2', kind: 'dialogue', witness: 'tib', minHearts: 1, afterAttack: 2 },
      { id: 'fe_near', kind: 'nearmiss' },
      { id: 'fe_seen', kind: 'sighting' },
    ],
    herrings: [{ id: 'fe_herring1', kind: 'scene' }, { id: 'fe_herring2', kind: 'snoop' }],
    alibi: { id: 'fe_alibi', witness: 'odessa', minHearts: 0, afterAttack: 2 },
  },
  wren: {
    rule: { type: 'last_talked' },
    interval: [3, 4],
    clues: [
      { id: 'wr_scene1', kind: 'scene' },
      { id: 'wr_scene2', kind: 'scene' },
      { id: 'wr_scene3', kind: 'scene' },
      { id: 'wr_snoop1', kind: 'snoop' },
      { id: 'wr_snoop2', kind: 'snoop' },
      { id: 'wr_talk1', kind: 'dialogue', witness: 'hollis', minHearts: 1, afterAttack: 1 },
      { id: 'wr_talk2', kind: 'dialogue', witness: 'marigold', minHearts: 1, afterAttack: 2 },
      { id: 'wr_near', kind: 'nearmiss' },
      { id: 'wr_seen', kind: 'sighting' },
    ],
    herrings: [{ id: 'wr_herring1', kind: 'scene' }, { id: 'wr_herring2', kind: 'snoop' }],
    alibi: { id: 'wr_alibi', witness: 'tib', minHearts: 0, afterAttack: 2 },
  },
  hollis: {
    rule: { type: 'nearest_home' },
    interval: [3, 4],
    clues: [
      { id: 'ho_scene1', kind: 'scene' },
      { id: 'ho_scene2', kind: 'scene' },
      { id: 'ho_scene3', kind: 'scene' },
      { id: 'ho_snoop1', kind: 'snoop' },
      { id: 'ho_snoop2', kind: 'snoop' },
      { id: 'ho_talk1', kind: 'dialogue', witness: 'fennel', minHearts: 1, afterAttack: 1 },
      { id: 'ho_talk2', kind: 'dialogue', witness: 'barnaby', minHearts: 1, afterAttack: 2 },
      { id: 'ho_near', kind: 'nearmiss' },
      { id: 'ho_seen', kind: 'sighting' },
    ],
    herrings: [{ id: 'ho_herring1', kind: 'scene' }, { id: 'ho_herring2', kind: 'snoop' }],
    alibi: { id: 'ho_alibi', witness: 'fennel', minHearts: 0, afterAttack: 2 },
  },
};

// Mystery tuning.
export const MYSTERY = {
  firstAttack: [2, 3],   // night of the first attack (so a gnome appears by the morning of day 3-4)
  maxVictims: 4,          // the village is lost at this many gnomed villagers
  seasonDays: 28,
  herringChance: 0.6,     // chance an attack scene also gets a red herring
  patternAfter: 2,        // attacks before villagers start noticing the victim pattern
  patternWitnesses: ['tib', 'marigold', 'odessa', 'hollis', 'barnaby', 'fennel', 'wren'],
};

// Difficulty presets (chosen on the title screen, saved with the game).
export const DIFFICULTY = {
  easy:   { intervalAdd: 1, maxVictims: 5, herringChance: 0.3, heartsAdd: -1, omen: true, hints: true, firstAttack: [3, 3] },
  normal: { intervalAdd: 0, maxVictims: 4, herringChance: 0.6, heartsAdd: 0, omen: true, hints: true, firstAttack: [2, 3] },
  hard:   { intervalAdd: 0, maxVictims: 4, herringChance: 0.9, heartsAdd: 1, omen: false, hints: false, firstAttack: [2, 2] },
};
