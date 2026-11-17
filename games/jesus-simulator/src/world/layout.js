import { lerp, smoothstep } from '../core/rng.js';

/**
 * Authoritative world layout data. Gameplay, rendering, minimap and save
 * validation all read from here, so positions stay consistent.
 *
 * World axis convention: +X east, -Z north, Y up. The terrain spans 500 x 500 m;
 * this release opens the Nazareth valley (PLAY_RADIUS) and shows the rest of
 * Galilee as scenery.
 */
export const WORLD_HALF = 250;
/** Phase 1-4 valley radius (still the "Nazareth Valley" region and the NPC home range). */
export const PLAY_RADIUS = 135;
/** Phase 5: the whole of Galilee is open, a square of +-PLAY_HALF metres. */
export const PLAY_HALF = 204;
export const VILLAGE_RADIUS = 60;

export const LAKE = { x: 178, z: -6, rx: 66, rz: 96 };

export const SPAWN = { x: -21.5, z: 10.5, yaw: 2.0 };

/** The regions of Galilee (map labels, region names, chapter II). */
export const REGIONS = [
  { id: 'nazareth', name: 'Nazareth', x: 0, z: 0, open: true },
  { id: 'countryside', name: 'Countryside', x: -150, z: -10, open: true },
  { id: 'galilee', name: 'Sea of Galilee', x: LAKE.x, z: LAKE.z, open: true },
  { id: 'outpost', name: 'Roman Outpost', x: 60, z: -182, open: true },
  { id: 'desert', name: 'Desert', x: 10, z: 176, open: true },
];

/** Phase 5 sites. Each pad flattens the terrain (y from the ground at its centre unless given). */
export const FARM = { x: -148, z: 31, pad: { x0: -168, x1: -128, z0: 14, z1: 48, blend: 8 } };
export const GOAT_HILL = { x: -160, z: -72, r: 34, height: 9 };
export const HAMLET = { x: 160, z: -121, jettyX: 166, pad: { x0: 144, x1: 180, z0: -134, z1: -101, blend: 8, y: 1.3 } };
export const ISLE = { x: 190, z: 12, r: 12, top: 1.7 };
export const OUTPOST = {
  x: 41, z: -178,
  pad: { x0: 12, x1: 70, z0: -201, z1: -155, blend: 8 },
  compound: { x0: 20, x1: 62, z0: -196, z1: -160 },
  gateZ: -178,
};
export const CIRCUIT = {
  x: 104, z: -172, rx: 27, rz: 14, innerRx: 17, innerRz: 5.5,
  pad: { x0: 72, x1: 136, z0: -192, z1: -150, blend: 8 },
};
export const OASIS = { x: 66, z: 164, pondR: 7.5, pad: { x0: 50, x1: 82, z0: 150, z1: 178, blend: 8 } };
export const CAMP = { x: -42, z: 168, pad: { x0: -60, x1: -24, z0: 154, z1: 182, blend: 7 } };
export const DESERT_Z = 118;


export const ROADS = [
  { width: 6, points: [[0, 0], [30, 3], [70, -2], [110, -8], [150, -4]] },
  { width: 6, points: [[0, -20], [-3, -50], [-8, -80], [3, -115], [6, -160], [9, -200]] },
  { width: 6, points: [[0, 0], [4, 40], [-3, 80], [6, 125], [12, 150], [18, 196]] },
  { width: 6, points: [[0, 0], [-40, 5], [-80, -3], [-125, 2], [-180, 8], [-200, 6]] },
  // Phase 5 country roads
  { width: 4.4, points: [[6, -150], [50, -141], [100, -136], [146, -124]] },
  { width: 3.4, points: [[-125, 2], [-142, -28], [-154, -55]] },
  { width: 3.6, points: [[-148, 8], [-148, 15]] },
  { width: 3.6, points: [[8, 138], [-18, 156], [-30, 166]] },
  { width: 3.6, points: [[12, 150], [36, 158], [54, 162]] },
  { width: 4, points: [[9, -178], [20, -178]] },
  { width: 4, points: [[62, -170], [77, -172]] },
  // village lanes
  { width: 3.4, points: [[-23, 12], [-16, 24], [0, 30], [22, 22], [30, 8], [26, -12], [14, -38]] },
  { width: 3.4, points: [[-23, 12], [-34, 2], [-36, -6], [-28, -32], [-12, -38]] },
  { width: 3, points: [[22, 22], [40, 34], [58, 44]] },
  { width: 3, points: [[-36, -6], [-56, -30], [-78, -60]] },
];

export const PLAZA = { x: 0, z: 0, r: 13 };

/**
 * Roman checkpoint on the north road (Phase 4). The compound east of the road
 * is a restricted military area; the road barrier is where Jesus is released
 * after an arrest. `pad` flattens the terrain under the camp.
 */
export const CHECKPOINT = {
  x: 16, z: -108,
  pad: { x0: -5, x1: 31, z0: -122, z1: -94, y: -0.6, blend: 7 },
  compound: { x0: 6, x1: 28, z0: -119, z1: -97 },
  gateZ: -108,
  release: { x: -1.5, z: -95, yaw: Math.PI },
};

/** Zones the player has been granted entry to (Phase 6: the centurion's seal opens the fort). */
export const zoneAccess = { outpost: false };

/** Inside the palisade or the fort walls (restricted military area)? */
export function inRestrictedZone(x, z) {
  for (const c of zoneAccess.outpost ? [CHECKPOINT.compound] : [CHECKPOINT.compound, OUTPOST.compound]) {
    if (x > c.x0 + 0.3 && x < c.x1 - 0.3 && z > c.z0 + 0.3 && z < c.z1 - 0.3) return true;
  }
  return false;
}

/** Which restricted compound (if any) a point is in. */
export function restrictedZoneAt(x, z) {
  const c = CHECKPOINT.compound;
  if (x > c.x0 + 0.3 && x < c.x1 - 0.3 && z > c.z0 + 0.3 && z < c.z1 - 0.3) return 'checkpoint';
  const o = OUTPOST.compound;
  if (zoneAccess.outpost) return null;
  if (x > o.x0 + 0.3 && x < o.x1 - 0.3 && z > o.z0 + 0.3 && z < o.z1 - 0.3) return 'outpost';
  return null;
}
export const MARKET = { x0: -16, x1: 16, z0: -38, z1: -16 };

export const LANDMARKS = [
  { id: 'landmark.town-well', name: 'The Town Well', x: 0, z: 0, r: 5.5,
    blurb: 'The heart of Nazareth. Everyone comes here for water — and gossip.' },
  { id: 'landmark.market', name: 'Nazareth Market', x: 0, z: -27, r: 9,
    blurb: 'Bread, figs, fish and pottery. Business has been slow lately.' },
  { id: 'landmark.workshop', name: 'Joseph & Son Carpentry', x: -30, z: 15, r: 7,
    blurb: 'The family workshop. It still smells of cedar shavings.' },
  { id: 'landmark.synagogue', name: 'The Synagogue', x: 29, z: 22, r: 9,
    blurb: 'A quiet hall of pale stone where the village gathers.' },
  { id: 'landmark.lookout', name: 'Rooftop Lookout', x: -29, z: -47, r: 4.5, minY: 6,
    blurb: 'The tallest roof in town. You can see all the way to the lake.' },
  { id: 'landmark.olive-grove', name: 'Olive Grove & Press', x: 64, z: 46, r: 14,
    blurb: 'Old twisted trees and a stone press, heavy with this year\'s harvest.' },
  { id: 'landmark.watchtower', name: 'Old Watchtower', x: -80, z: -62, r: 10,
    blurb: 'A crumbling tower on the ridge. Rome built a bigger one up north.' },
  { id: 'landmark.galilee-shore', name: 'Shore of Galilee', x: 113, z: -8, r: 10,
    blurb: 'The lake stretches out, calm and wide. The water almost looks walkable.' },
  // ---- Chapter II: Galilee (Phase 5)
  { id: 'landmark.farmstead', name: 'Bar-Tolmai Farmstead', x: FARM.x, z: FARM.z, r: 16, chapter: 2, region: 'countryside',
    blurb: 'Wheat, vines, goats and one very patient donkey. The farmer lends his animals to anyone polite.' },
  { id: 'landmark.goat-hill', name: 'Goat Hill', x: GOAT_HILL.x, z: GOAT_HILL.z, r: 9, chapter: 2, region: 'countryside',
    blurb: 'The goats got here first. They are not sharing the view.' },
  { id: 'landmark.hamlet', name: "Fishers' Hamlet", x: HAMLET.x, z: HAMLET.z, r: 14, chapter: 2, region: 'galilee',
    blurb: 'Nets drying in the sun and a jetty that smells gloriously of fish.' },
  { id: 'landmark.isle', name: 'The Lonely Isle', x: ISLE.x, z: ISLE.z, r: 8, chapter: 2, region: 'galilee',
    blurb: 'A speck of land in the middle of the lake. No boat comes here. Then again, you do not need one.' },
  { id: 'landmark.outpost', name: 'Castra Galilaea', x: OUTPOST.x, z: OUTPOST.z, r: 27, chapter: 2, region: 'outpost',
    blurb: 'A Roman fort with stone walls, a stable and two very shiny chariots. Do not touch the chariots.' },
  { id: 'landmark.circus', name: 'The Little Circus', x: CIRCUIT.x, z: CIRCUIT.z, r: 24, chapter: 2, region: 'outpost',
    blurb: 'A dusty chariot track the legion built to stay entertained. Ride a lap — any animal counts.' },
  { id: 'landmark.oasis', name: 'Palm Oasis', x: OASIS.x, z: OASIS.z, r: 13, chapter: 2, region: 'desert',
    blurb: 'Cool water under the palms. Travellers swear it tastes like a blessing.' },
  { id: 'landmark.caravan', name: 'Caravan Camp', x: CAMP.x, z: CAMP.z, r: 15, chapter: 2, region: 'desert',
    blurb: 'Traders from the east rest their camels here. The camels have opinions about you.' },
];

export const CHAPTER_ONE = LANDMARKS.filter((l) => !l.chapter);
export const CHAPTER_TWO = LANDMARKS.filter((l) => l.chapter === 2);

export const WATER_LEVEL = 0;

export function lakeDistance(x, z) {
  return Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);
}

/** Is a point inside the explorable area (all of Galilee since Phase 5)? */
export function inPlayArea(x, z) {
  return Math.abs(x) <= PLAY_HALF && Math.abs(z) <= PLAY_HALF;
}

/** Outward normal of the play-area edge nearest to a point. */
export function boundaryNormal(x, z) {
  return Math.abs(x) > Math.abs(z) ? { x: Math.sign(x), z: 0 } : { x: 0, z: Math.sign(z) };
}

export const POND_LEVEL = () => padHeight(OASIS.pad) - 0.3;

/** Water depth at a point (0 on dry land). Covers the lake and the oasis pond. */
export function waterDepth(x, z) {
  if (Math.hypot(x - OASIS.x, z - OASIS.z) < OASIS.pondR + 0.5) return Math.max(0, POND_LEVEL() - terrainHeight(x, z));
  if (lakeDistance(x, z) > 1.15) return 0;
  return Math.max(0, WATER_LEVEL - terrainHeight(x, z));
}

/** Which named region a point is in (for labels and chapter II). */
export function regionAt(x, z) {
  if (lakeDistance(x, z) < 1.0 || (Math.hypot(x - HAMLET.x, z - HAMLET.z) < 30)) return 'galilee';
  if (z > DESERT_Z) return 'desert';
  if (z < -142 && x > -20) return 'outpost';
  if (x < -100) return 'countryside';
  return 'nazareth';
}

/** Interactable signs / objects that answer the E key in this release. */
export const INTERACTABLES = [
  { id: 'sign.workshop', x: -24.5, z: 13.2, r: 2.6, label: 'Read sign',
    text: '"JOSEPH & SON — CARPENTRY. Tables, doors, yokes. No job too humble."' },
  { id: 'well.bucket', x: 1.6, z: 0.2, r: 2.6, label: 'Look into the well',
    text: 'Cool, clear water. Strangely, you feel it could become something more one day.' },
  { id: 'sign.market', x: 0, z: -15.4, r: 2.6, label: 'Read notice',
    text: '"MARKET DAY EVERY DAY. Fresh fish from Galilee. Bread baked this morning."' },
  { id: 'press.grove', x: 66, z: 49, r: 3.2, label: 'Inspect olive press',
    text: 'A heavy stone wheel crushes the olives. The oil smells green and peppery.' },
  { id: 'tower.plaque', x: -76, z: -58.5, r: 3, label: 'Read carving',
    text: 'Someone carved: "THE ROMANS ARE WATCHING." Below it, smaller: "so are the goats."' },
  { id: 'farm.sign', x: -148, z: 13.4, r: 2.8, label: 'Read sign',
    text: '"BAR-TOLMAI FARM. Donkey and cart free to borrow. Please bring them back. Please."' },
  { id: 'goat.cairn', x: -160, z: -72, r: 2.8, label: 'Inspect cairn',
    text: 'A pile of stones, a goat on top of it, and a scratched note: "THIS IS THE GOATS\' HILL NOW."' },
  { id: 'hamlet.nets', x: 152, z: -118, r: 2.8, label: 'Inspect nets',
    text: 'Torn nets, mended a hundred times. "Cast on the right side," someone has written on a float. Odd advice.' },
  { id: 'isle.note', x: 191.5, z: 13.5, r: 2.6, label: 'Read the stone',
    text: '"IF YOU ARE READING THIS, YOU WALKED. — The Management."' },
  { id: 'outpost.notice', x: 17.5, z: -182.6, r: 2.8, label: 'Read notice',
    text: '"CASTRA GALILAEA. Chariots are property of the Legion. Thieves will be chased. Slowly, but chased."' },
  { id: 'circus.board', x: 104, z: -156.4, r: 3, label: 'Read lap board',
    text: '"CIRCUS RULES: ride once around the spina, anticlockwise, through the white line. Any animal. No sorcery."' },
  { id: 'oasis.palm', x: 60, z: 158, r: 2.8, label: 'Read carving',
    text: 'Carved in a palm trunk: "A. + M. — and one camel."' },
  { id: 'camp.rug', x: -38, z: 166, r: 2.8, label: 'Inspect carpets',
    text: 'Fine woven carpets from far away. A label says "NOT FLYING. STOP ASKING."' },
];

const padCache = new WeakMap();
/** Flat ground level of a pad (fixed or the raw ground at its centre). */
export function padHeight(pad) {
  if (pad.y !== undefined) return pad.y;
  let y = padCache.get(pad);
  if (y === undefined) {
    y = rawHeight((pad.x0 + pad.x1) / 2, (pad.z0 + pad.z1) / 2);
    if (pad.minY !== undefined) y = Math.max(y, pad.minY);
    padCache.set(pad, y);
  }
  return y;
}

const PADS = [CHECKPOINT.pad, FARM.pad, HAMLET.pad, OUTPOST.pad, CIRCUIT.pad, OASIS.pad, CAMP.pad];

function applyPad(h, x, z, pad) {
  const out = Math.max(pad.x0 - x, x - pad.x1, pad.z0 - z, z - pad.z1, 0);
  if (out >= pad.blend) return h;
  return lerp(padHeight(pad), h, smoothstep(0, pad.blend, out));
}

export function terrainHeight(x, z) {
  let h = rawHeight(x, z);
  for (const pad of PADS) h = applyPad(h, x, z, pad);
  // oasis pond
  const od = Math.hypot(x - OASIS.x, z - OASIS.z);
  if (od < OASIS.pondR + 2) h -= (1 - smoothstep(OASIS.pondR - 3, OASIS.pondR + 1.5, od)) * 1.1;
  return h;
}

function rawHeight(x, z) {
  const hills =
    5.5 * Math.sin(x * 0.017 + 1.3) * Math.cos(z * 0.014 - 0.7) +
    2.6 * Math.sin(x * 0.043 + z * 0.031 + 0.4) +
    1.1 * Math.sin(x * 0.11 - z * 0.09) +
    0.45 * Math.sin(x * 0.23 + z * 0.19);
  let h = 4.5 + hills;
  const d = Math.hypot(x, z);
  const village = 1.2 + 0.22 * Math.sin(x * 0.06) * Math.cos(z * 0.05);
  h = lerp(village, h, smoothstep(62, 105, d));
  // watchtower ridge
  const wt = Math.hypot(x + 80, z + 62);
  h += (1 - smoothstep(6, 34, wt)) * 4.5;
  // goat hill
  const gh = Math.hypot(x - GOAT_HILL.x, z - GOAT_HILL.z);
  h += (1 - smoothstep(6, GOAT_HILL.r, gh)) * GOAT_HILL.height;
  // desert: low rolling dunes replace the hills in the south
  const desert = smoothstep(DESERT_Z - 10, DESERT_Z + 30, z);
  if (desert > 0) {
    const dunes = 2.2 + 1.6 * Math.sin(x * 0.045 + z * 0.012) * Math.cos(z * 0.06 - x * 0.01) + 0.7 * Math.sin(x * 0.12 + z * 0.05);
    h = lerp(h, dunes, desert * 0.85);
  }
  const ld = Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);
  h = lerp(-4.5, h, smoothstep(0.72, 1.12, ld));
  // the lonely isle
  const id = Math.hypot(x - ISLE.x, z - ISLE.z);
  if (id < ISLE.r + 6) h = Math.max(h, lerp(ISLE.top + 0.25 * Math.sin(x * 0.7) * Math.cos(z * 0.6), -4.5, smoothstep(ISLE.r * 0.45, ISLE.r + 4, id)));
  const edge = Math.max(Math.abs(x), Math.abs(z));
  h += smoothstep(205, 250, edge) * 30;
  return h;
}

export function distToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz || 1;
  let t = ((px - ax) * dx + (pz - az) * dz) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

/** Distance from a point to the nearest road edge (negative = on the road). */
export function roadDistance(x, z) {
  let best = Infinity;
  for (const road of ROADS) {
    for (let i = 0; i < road.points.length - 1; i += 1) {
      const [ax, az] = road.points[i];
      const [bx, bz] = road.points[i + 1];
      best = Math.min(best, distToSegment(x, z, ax, az, bx, bz) - road.width / 2);
    }
  }
  return best;
}
