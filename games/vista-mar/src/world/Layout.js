// Pure layout data for the city of Vista Mar. Shared by the generator, the
// collision/terrain queries, the minimap and the mission/collectible placement.
// Convention: +x = east (ocean), -z = north.

export const LINES = [-400, -300, -200, -100, 0, 100, 200, 300, 400];
export const SIDEWALK = 4;
export const CURB_H = 0.18;
export const WATER_LEVEL = -0.45;
export const BEACH = { roadEdge: 408, promenadeEnd: 413, waterLimit: 476, oceanStart: 466 };
export const BOUNDS = { minX: -468, maxX: BEACH.waterLimit, minZ: -468, maxZ: 468 };

// Width of the road on each grid line (N-S roads use xWidths, E-W roads zWidths).
export const xWidths = LINES.map((x) => (x === 400 ? 16 : 14));
export const zWidths = LINES.map((z) => (z === 0 ? 26 : 14));
export const BOULEVARD_MEDIAN = 4;

export const ROAD_NAMES = {
  x: { '-400': 'Westgate Rd', '-300': 'Harbor St', '-200': 'Foundry Ave', '-100': 'Flagler Ave', 0: 'Central Ave', 100: 'Biscayne St', 200: 'Collins Ave', 300: 'Neon Mile', 400: 'Ocean Drive' },
  z: { '-400': 'North Loop', '-300': '42nd St', '-200': '31st St', '-100': '20th St', 0: 'Palm Boulevard', 100: '8th St', 200: 'Coral Way', 300: 'Sunset Rd', 400: 'South Loop' },
};

export const DISTRICTS = {
  downtown: { name: 'DOWNTOWN', sub: 'Financial District', color: '#5f6f86' },
  midtown: { name: 'MIDTOWN', sub: 'Shopping District', color: '#7d6d8c' },
  nightlife: { name: 'NEON MILE', sub: 'Entertainment District', color: '#9b4d8f' },
  beach: { name: 'OCEAN DRIVE', sub: 'Beach District', color: '#c99a6b' },
  residential: { name: 'PALM HEIGHTS', sub: 'Residential District', color: '#6f8f63' },
  apartments: { name: 'CORAL GABLES', sub: 'Residential District', color: '#86956a' },
  industrial: { name: 'PORT INDUSTRIAL', sub: 'Industrial District', color: '#7a7466' },
  park: { name: 'BAYFRONT PARK', sub: 'Public Park', color: '#4e8a4a' },
  sand: { name: 'VISTA MAR BEACH', sub: 'Atlantic Shore', color: '#d9c39a' },
};

// Special lots (by block index i = x column, j = z row).
export const SPECIAL = {
  '4,5': 'park',
  '1,6': 'park',
  '2,4': 'gas',
  '5,1': 'parking',
  '4,2': 'plaza',
};

export function blockDistrict(i, j) {
  const sp = SPECIAL[`${i},${j}`];
  if (sp === 'park') return 'park';
  if (i === 7) return 'beach';
  if (i === 6) return j >= 2 && j <= 5 ? 'nightlife' : 'midtown';
  if (i >= 3 && i <= 5 && j >= 2 && j <= 5) return 'downtown';
  if (i <= 2 && j <= 3) return 'industrial';
  if (i <= 2) return 'residential';
  if (j <= 1) return 'midtown';
  return 'apartments';
}

// Block rectangle including its sidewalk ring.
export function blockRect(i, j) {
  return {
    minX: LINES[i] + xWidths[i] / 2,
    maxX: LINES[i + 1] - xWidths[i + 1] / 2,
    minZ: LINES[j] + zWidths[j] / 2,
    maxZ: LINES[j + 1] - zWidths[j + 1] / 2,
  };
}

export function allBlocks() {
  const out = [];
  for (let i = 0; i < LINES.length - 1; i++) {
    for (let j = 0; j < LINES.length - 1; j++) {
      const r = blockRect(i, j);
      out.push({ i, j, ...r, district: blockDistrict(i, j), special: SPECIAL[`${i},${j}`] || null });
    }
  }
  return out;
}

function lineIndexFor(v) {
  // index of the grid cell containing v (between LINES[k] and LINES[k+1])
  for (let k = 0; k < LINES.length - 1; k++) if (v < LINES[k + 1]) return k;
  return LINES.length - 2;
}

// Classifies a ground point. Used by terrain height, footsteps and district banner.
export function classify(x, z) {
  if (x > BEACH.roadEdge) {
    if (x < BEACH.promenadeEnd) return { type: 'sidewalk', district: 'beach' };
    return { type: 'sand', district: 'sand' };
  }
  // Within the half-width of a N-S road?
  for (let k = 0; k < LINES.length; k++) {
    const hw = xWidths[k] / 2;
    if (Math.abs(x - LINES[k]) < hw && z > LINES[0] - zWidths[0] / 2 && z < LINES[8] + zWidths[8] / 2) {
      return { type: 'road', district: nearestDistrict(x, z) };
    }
  }
  for (let k = 0; k < LINES.length; k++) {
    const hw = zWidths[k] / 2;
    if (Math.abs(z - LINES[k]) < hw && x > LINES[0] - xWidths[0] / 2 && x < LINES[8] + xWidths[8] / 2) {
      if (LINES[k] === 0 && Math.abs(z) < BOULEVARD_MEDIAN / 2) return { type: 'median', district: nearestDistrict(x, z) };
      return { type: 'road', district: nearestDistrict(x, z) };
    }
  }
  if (x < LINES[0] || x > LINES[8] || z < LINES[0] || z > LINES[8]) return { type: 'grass', district: x < 0 ? 'residential' : 'midtown' };
  const i = lineIndexFor(x);
  const j = lineIndexFor(z);
  const r = blockRect(i, j);
  const inner = x > r.minX + SIDEWALK && x < r.maxX - SIDEWALK && z > r.minZ + SIDEWALK && z < r.maxZ - SIDEWALK;
  const d = blockDistrict(i, j);
  if (!inner) return { type: 'sidewalk', district: d };
  const sp = SPECIAL[`${i},${j}`];
  if (d === 'park' || d === 'residential') return { type: 'grass', district: d };
  if (sp === 'parking' || sp === 'gas') return { type: 'asphalt', district: d };
  return { type: 'paving', district: d };
}

function nearestDistrict(x, z) {
  const i = Math.max(0, Math.min(7, lineIndexFor(x)));
  const j = Math.max(0, Math.min(7, lineIndexFor(z)));
  return blockDistrict(i, j);
}

export function terrainHeight(x, z) {
  if (x > BEACH.promenadeEnd) return CURB_H - (x - BEACH.promenadeEnd) * 0.0125;
  const c = classify(x, z);
  if (c.type === 'road') return 0;
  return CURB_H;
}

export const PLAYER_START = { x: 28, z: -15.4, heading: Math.PI / 2 };
