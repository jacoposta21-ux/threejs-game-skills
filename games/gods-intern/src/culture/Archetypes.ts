import type { RitualKind, SacredKind } from '../core/types';

/**
 * Belief archetypes. Every religion is born from one: the archetype ties a
 * witnessed event to readable names, doctrine, a daily ritual and a monument.
 * Names are deterministic combinations (organization × event-specific noun),
 * so they always read as real phrases connected to what actually happened.
 */
export interface Archetype {
  nouns: string[];
  doctrine: string[];
  ritual: { name: string; kind: RitualKind; timeOfDay: number; duration: number };
  symbols: string[];
  color: number;
  monument: string;
  sacredKind: SacredKind;
  /** Short reaction lines when witnesses see the founding event. */
  shouts: string[];
}

export const ORGS = [
  'The Church of',
  'The Order of',
  'The Fellowship of',
  'The Brotherhood of',
  'The Society of',
  'The Temple of',
  'The Cult of',
  'The Congregation of',
];

export const ARCHETYPES: Record<string, Archetype> = {
  rock: {
    nouns: ['the Slightly Warm Rock', 'the Sacred Pebble', 'His Rocky Majesty', 'the Pebble Throne'],
    doctrine: ['The rock hears everything.', 'Do not sit on the King.', 'Thunder is the rock clearing its throat.', 'Pebbles are royal children.'],
    ritual: { name: 'Royal Audience', kind: 'gathering', timeOfDay: 0.45, duration: 22 },
    symbols: ['crown', 'pebble'],
    color: 0x8a6cff,
    monument: 'crown-statue',
    sacredKind: 'rock',
    shouts: ['THE ROCK HAS CHOSEN US!', 'ALL HAIL THE ROCK!', 'IT WAS ALWAYS THE ROCK.'],
  },
  tree: {
    nouns: ['the Unburnable Tree', 'the Instant Oak', 'the Leafy Overlord', 'the Speedy Sapling'],
    doctrine: ['Trees are God’s handwriting.', 'Never prune on a Tuesday.', 'The tree survived, therefore the tree is in charge.'],
    ritual: { name: 'Leaf Counting', kind: 'gathering', timeOfDay: 0.4, duration: 20 },
    symbols: ['leaf', 'acorn'],
    color: 0x4fbf5a,
    monument: 'obelisk',
    sacredKind: 'tree',
    shouts: ['THE TREE LIVES!', 'IT GREW IN SECONDS!', 'WE SHOULD BUILD A TEMPLE.'],
  },
  burned: {
    nouns: ['the Burned Tree', 'the Smouldering Oak', 'the Crispy Branch'],
    doctrine: ['Smoke carries prayers upward.', 'Ash is just tired wood.', 'Fear the sky. Respect the toast.'],
    ritual: { name: 'Ember Vigil', kind: 'gathering', timeOfDay: 0.72, duration: 20 },
    symbols: ['ember', 'branch'],
    color: 0xff7a33,
    monument: 'obelisk',
    sacredKind: 'tree',
    shouts: ['THE TREE HAS SPOKEN!', 'WHAT WAS THAT?!', 'THE SKY IS ANGRY AT TREES.'],
  },
  flood: {
    nouns: ['the Wet Sock', 'Eternal Drizzle', 'the Damp Ankle', 'the Bottomless Puddle'],
    doctrine: ['Dry feet are a sin.', 'Every puddle is a small ocean with ambition.', 'Socks must be worn wet on holy days.'],
    ritual: { name: 'Puddle Stomp', kind: 'dance', timeOfDay: 0.55, duration: 20 },
    symbols: ['sock', 'droplet'],
    color: 0x3aa0ff,
    monument: 'sock-totem',
    sacredKind: 'ground',
    shouts: ['WHY IS EVERYTHING WET?', 'MY SOCKS HAVE BEEN BLESSED.', 'THE WATER IS A MESSAGE!'],
  },
  cloud: {
    nouns: ['the Suspicious Cloud', 'the Generous Cloud', 'the Sky Bucket'],
    doctrine: ['Clouds watch. Clouds judge.', 'Look up before you complain.', 'Never point at a cloud.'],
    ritual: { name: 'Sky Watching', kind: 'procession', timeOfDay: 0.6, duration: 24 },
    symbols: ['cloud', 'bucket'],
    color: 0x8fb3e8,
    monument: 'cloud-effigy',
    sacredKind: 'well',
    shouts: ['THE SKY HEARD US!', 'THE CLOUD LOVES US!', 'I THINK GOD IS NEW.'],
  },
  rebirth: {
    nouns: ['the Second Sprout', 'the Holy Ash', 'the Returning Fern'],
    doctrine: ['What burns, sprouts.', 'Plant where it hurt.', 'Every ending is a gardening opportunity.'],
    ritual: { name: 'Ash Planting', kind: 'planting', timeOfDay: 0.36, duration: 20 },
    symbols: ['sprout', 'ash'],
    color: 0x7bd66b,
    monument: 'memorial-garden',
    sacredKind: 'ground',
    shouts: ['THE ASHES ARE GROWING!', 'IT CAME BACK!', 'NOTHING EVER REALLY DIES. EXCEPT KEVIN.'],
  },
  fire: {
    nouns: ['the Friendly Flame', 'the Warm Glow', 'the Polite Bonfire'],
    doctrine: ['Fire is fine if someone puts it out.', 'Respect the flame, fear the drizzle.'],
    ritual: { name: 'Bonfire Night', kind: 'bonfire', timeOfDay: 0.74, duration: 22 },
    symbols: ['flame', 'marshmallow'],
    color: 0xff5a1f,
    monument: 'obelisk',
    sacredKind: 'ground',
    shouts: ['FIRE IS KIND OF NICE?', 'DO IT AGAIN! BUT SAFER!'],
  },
  gold: {
    nouns: ['the Golden Tree', 'the Very Expensive Tree', 'the Shiny Bark'],
    doctrine: ['Gold leaves cannot be eaten. We tried.', 'Polish the bark daily.', 'Wealth grows on trees now.'],
    ritual: { name: 'Bark Polishing', kind: 'procession', timeOfDay: 0.5, duration: 22 },
    symbols: ['coin', 'leaf'],
    color: 0xf2c14e,
    monument: 'golden-shrine',
    sacredKind: 'tree',
    shouts: ['THE TREE IS GOLD!', 'WE ARE RICH! (WE CANNOT SPEND IT.)', 'THIS SEEMS ILLEGAL.'],
  },
  potato: {
    nouns: ['the Sacred Potato', 'the Holy Carrot', 'the Unsinkable Turnip'],
    doctrine: ['The potato endures.', 'Do not eat the chosen one.', 'Roots before fruits.'],
    ritual: { name: 'Root Offering', kind: 'offering', timeOfDay: 0.42, duration: 20 },
    symbols: ['potato', 'basket'],
    color: 0xc8a25a,
    monument: 'giant-potato',
    sacredKind: 'crop',
    shouts: ['THE POTATO SURVIVED!', 'A VEGETABLE OF DESTINY!'],
  },
  walking: {
    nouns: ['the Wandering Stone', 'the Rock That Walks', 'the Pebble Pilgrim'],
    doctrine: ['Follow the rock. Slowly.', 'Where the rock goes, we go. Eventually.'],
    ritual: { name: 'Slow Procession', kind: 'procession', timeOfDay: 0.48, duration: 24 },
    symbols: ['legs', 'pebble'],
    color: 0xa08c7a,
    monument: 'crown-statue',
    sacredKind: 'rock',
    shouts: ['THE ROCK IS WALKING!', 'WHERE IS IT GOING?!', 'THIS SEEMS ILLEGAL.'],
  },
  head: {
    nouns: ['the Enormous Head', 'the Big Thinker', 'the Generous Forehead'],
    doctrine: ['Wisdom is measured in hat sizes.', 'Think bigger. Literally.'],
    ritual: { name: 'Hat Measuring', kind: 'gathering', timeOfDay: 0.5, duration: 20 },
    symbols: ['hat', 'brain'],
    color: 0xff6b8b,
    monument: 'obelisk',
    sacredKind: 'ground',
    shouts: ['IS YOUR HEAD BIGGER?', 'HIS HEAD IS A SIGN!', 'I WANT ONE.'],
  },
};

/** Which archetype a remembered event feeds. Events not listed never found religions. */
export const ARCHETYPE_OF: Record<string, string> = {
  'lightning-rock': 'rock',
  'lightning-tree': 'burned',
  'tree-survived': 'tree',
  'instant-tree': 'tree',
  flood: 'flood',
  'drought-ended': 'cloud',
  regrowth: 'rebirth',
  'fire-extinguished': 'fire',
  'mutation-golden-tree': 'gold',
  'mutation-walking-rock': 'walking',
  'mutation-giant-head': 'head',
  'crop-survived': 'potato',
};

/** Pairs of opposing claims used when believers argue in public. */
export const DISAGREEMENTS: Array<[string, string]> = [
  ['RAIN IS A BLESSING!', 'RAIN IS A PUNISHMENT!'],
  ['THE ROCK IS KING!', 'IT IS JUST A ROCK, GARY.'],
  ['THE TREE IS SACRED!', 'WHICH TREE? THERE ARE HUNDREDS.'],
  ['GOD IS WATCHING!', 'GOD IS ON VACATION.'],
  ['FIRE IS HOLY!', 'FIRE IS HOT. THAT IS ALL.'],
  ['WET SOCKS ARE TRADITION!', 'WET SOCKS ARE A RASH.'],
];

export const RELIGION_COLORS = [0x8a6cff, 0x3aa0ff, 0x4fbf5a, 0xff7a33, 0xf2c14e, 0xff6b8b, 0x1abc9c, 0xc8a25a];
