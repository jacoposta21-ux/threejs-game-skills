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
export const PLAY_RADIUS = 135;
export const VILLAGE_RADIUS = 60;

export const LAKE = { x: 178, z: -6, rx: 66, rz: 96 };

export const SPAWN = { x: -21.5, z: 10.5, yaw: 2.0 };

/** Future regions (anchors only, so later phases build into the same map). */
export const REGIONS = [
  { id: 'nazareth', name: 'Nazareth', x: 0, z: 0, open: true },
  { id: 'countryside', name: 'Countryside', x: -170, z: 10, open: false },
  { id: 'galilee', name: 'Sea of Galilee', x: LAKE.x, z: LAKE.z, open: false },
  { id: 'outpost', name: 'Roman Outpost', x: 10, z: -190, open: false },
  { id: 'desert', name: 'Desert', x: 20, z: 190, open: false },
];

export const ROADS = [
  { width: 6, points: [[0, 0], [30, 3], [70, -2], [110, -8], [150, -4]] },
  { width: 6, points: [[0, -20], [-3, -50], [-8, -80], [3, -115], [6, -160], [10, -200]] },
  { width: 6, points: [[0, 0], [4, 40], [-3, 80], [6, 125], [18, 180]] },
  { width: 6, points: [[0, 0], [-40, 5], [-80, -3], [-125, 2], [-180, 8]] },
  // village lanes
  { width: 3.4, points: [[-23, 12], [-16, 24], [0, 30], [22, 22], [30, 8], [26, -12], [14, -38]] },
  { width: 3.4, points: [[-23, 12], [-34, 2], [-36, -6], [-28, -32], [-12, -38]] },
  { width: 3, points: [[22, 22], [40, 34], [58, 44]] },
  { width: 3, points: [[-36, -6], [-56, -30], [-78, -60]] },
];

export const PLAZA = { x: 0, z: 0, r: 13 };
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
];

/** Shallow-water strip of the Sea of Galilee opened for this release (walk-on-water practice). */
export const LAKE_OPEN_MAX_X = 172;
export const WATER_LEVEL = 0;

export function lakeDistance(x, z) {
  return Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);
}

/** Is a point inside the explorable area (valley circle + the near part of the lake)? */
export function inPlayArea(x, z) {
  if (Math.hypot(x, z) <= PLAY_RADIUS) return true;
  return x > 90 && x < LAKE_OPEN_MAX_X && lakeDistance(x, z) < 1.04;
}

/** Water depth at a point (0 on dry land). */
export function waterDepth(x, z) {
  if (lakeDistance(x, z) > 1.15) return 0;
  return Math.max(0, WATER_LEVEL - terrainHeight(x, z));
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
];

export function terrainHeight(x, z) {
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
  const ld = Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);
  h = lerp(-4.5, h, smoothstep(0.72, 1.12, ld));
  const edge = Math.max(Math.abs(x), Math.abs(z));
  h += smoothstep(195, 250, edge) * 30;
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
