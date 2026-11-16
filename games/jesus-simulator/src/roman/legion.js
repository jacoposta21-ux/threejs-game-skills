/**
 * The garrison: who stands where, who patrols which route, and how each
 * legionary looks. Positions are world metres (x east, z south).
 */
const ARMOR = { color: '#a7afb4', shade: '#8d969b', trim: '#c99a4a', leather: '#5a3a22' };
const SHIELD = { color: '#a8322a', boss: '#d9a441', trim: '#e6b64e' };
const SKINS = ['#d9a77c', '#c98f63', '#e3b48c', '#b47a52', '#d29b70', '#be8660'];
const HAIR = ['#2a1a10', '#3b2414', '#4a2c18', '#1e140c', '#5a3a22'];

export function soldierLook(i, extra = {}) {
  return {
    variant: 'adult',
    skin: SKINS[i % SKINS.length],
    hair: HAIR[i % HAIR.length],
    hairStyle: 'bald',
    beard: i % 4 === 1 ? HAIR[(i + 2) % HAIR.length] : null,
    tunic: '#a8322a',
    tunicShade: '#8f2a22',
    sleeve: '#a8322a',
    belt: '#4a2f1a',
    legs: SKINS[i % SKINS.length],
    headwear: { type: 'galea', color: '#a7afb4', trim: '#c99a4a', crest: '#c0281e' },
    armor: ARMOR,
    shield: SHIELD,
    spear: true,
    scale: 1.04,
    ...extra,
  };
}

/** Patrol routes (looped). Every point becomes a navigation anchor. */
export const ROUTES = {
  north: { loop: false, points: [[-2.5, -91], [-6.6, -72], [-4.2, -52], [-1.2, -29], [0, -14.5], [-9, 3], [7.5, 6]] },
  east: { loop: true, points: [[8, -9], [22, 22], [30, 8], [26, -12], [14, -38], [6, -27]] },
  west: { loop: true, points: [[-8, 7], [-23, 12], [-34, 2], [-36, -6], [-28, -32], [-12, -38], [-6, -27]] },
};

export const GARRISON = [
  { id: 'roman.brutus', name: 'Legionary Brutus', role: 'Patrol', route: 'north', voice: 0.72 },
  { id: 'roman.sextus', name: 'Legionary Sextus', role: 'Patrol', follow: 'roman.brutus', voice: 0.8 },
  { id: 'roman.flavius', name: 'Legionary Flavius', role: 'Patrol', route: 'east', voice: 0.76 },
  { id: 'roman.quintus', name: 'Legionary Quintus', role: 'Patrol', route: 'west', voice: 0.7 },
  { id: 'roman.decimus', name: 'Legionary Decimus', role: 'Road guard', post: 'roadGuard', voice: 0.74 },
  { id: 'roman.tiberius', name: 'Legionary Tiberius', role: 'Gate guard', post: 'gateGuard', voice: 0.78 },
  { id: 'roman.lucius', name: 'Legionary Lucius', role: 'Lookout', post: 'tower', lookout: true, voice: 0.82 },
  {
    id: 'roman.gaius', name: 'Centurion Gaius Grumpus', role: 'Centurion', post: 'centurion', centurion: true, voice: 0.62, dialogue: 'centurion',
    look: { headwear: { type: 'galea', color: '#c9ced1', trim: '#d9a441', crest: '#d8b04a', transverse: true }, armor: { ...ARMOR, color: '#c2c8cb', shade: '#aab1b5', medals: true }, cape: '#8f1f18', shield: null, scale: 1.08, beard: '#3b2414' },
  },
  // Castra Galilaea (Phase 5): the fort on the north road
  { id: 'roman.cassius', name: 'Legionary Cassius', role: 'Fort gate guard', post: 'outGateN', voice: 0.75 },
  { id: 'roman.drusus', name: 'Legionary Drusus', role: 'Fort gate guard', post: 'outGateS', voice: 0.71 },
  { id: 'roman.felix', name: 'Legionary Felix', role: 'Stable guard', post: 'outStable', voice: 0.79 },
  { id: 'roman.varro', name: 'Legionary Varro', role: 'Fort lookout', post: 'outTower', lookout: true, voice: 0.8 },
];

/** Reinforcements held in reserve at the checkpoint (3+ stars). */
export const RESERVE = ['Marcus', 'Titus', 'Aulus', 'Servius', 'Appius', 'Gnaeus'].map((n, i) => ({
  id: `roman.reserve.${i + 1}`, name: `Legionary ${n}`, role: 'Reinforcement', reserve: true, voice: 0.7 + (i % 3) * 0.05,
}));

/** How many soldiers join the hunt at each star level (reserve soldiers on top of the garrison). */
export const RESERVE_BY_STARS = [0, 0, 0, 2, 4, 6];

export const SIGHT = {
  range: 24,
  lookoutRange: 46,
  nightFactor: 0.62,
  fov: (115 * Math.PI) / 180,
  peripheral: 3.5,
};

export const SPEED = {
  patrol: 1.55,
  investigate: 2.6,
  run: (stars) => 4.3 + stars * 0.34,
};
