import type { DistrictId, DistrictParams } from './types.ts';

export const DISTRICT_ORDER: DistrictId[] = ['centro', 'porto', 'collina'];

export const DISTRICTS: Record<DistrictId, DistrictParams & { blockMinX?: number; blockMaxX?: number }> = {
  centro: {
    id: 'centro',
    cols: 64,
    rows: 64,
    margin: 3,
    blockMin: 8,
    blockMax: 14,
    roadWidths: [2, 2, 3],
    removeSegmentChance: 0.25,
    alleyChance: 0.45,
    plazaCount: 2,
    floorsMin: 2,
    floorsMax: 4,
    bumpsPerSegment: 0.08,
    ramps: 0,
    cobbleAmp: 0.0018,
    water: false,
    hill: false,
  },
  porto: {
    id: 'porto',
    cols: 84,
    rows: 66,
    margin: 3,
    blockMin: 9,
    blockMax: 12,
    blockMinX: 14,
    blockMaxX: 22,
    roadWidths: [3, 3, 4],
    removeSegmentChance: 0.08,
    alleyChance: 0.1,
    plazaCount: 1,
    floorsMin: 2,
    floorsMax: 3,
    bumpsPerSegment: 0.12,
    ramps: 3,
    cobbleAmp: 0.0006,
    water: true,
    hill: false,
  },
  collina: {
    id: 'collina',
    cols: 64,
    rows: 82,
    margin: 3,
    blockMin: 9,
    blockMax: 12,
    roadWidths: [2, 3],
    removeSegmentChance: 0,
    alleyChance: 0,
    plazaCount: 1,
    floorsMin: 2,
    floorsMax: 3,
    bumpsPerSegment: 0.05,
    ramps: 0,
    cobbleAmp: 0.0012,
    water: false,
    hill: true,
  },
};

export const DISTRICT_TURNS: Record<DistrictId, [number, number]> = {
  centro: [1, 10],
  porto: [11, 20],
  collina: [21, 30],
};

export const DISTRICT_UNLOCK_STARS: Record<DistrictId, number> = {
  centro: 0,
  porto: 18,
  collina: 40,
};

export function districtForTurn(turn: number): DistrictId {
  if (turn <= 10) return 'centro';
  if (turn <= 20) return 'porto';
  return 'collina';
}

/** Terrace height step per horizontal road in the hill district (m). */
export const HILL_STEP = 3.2;
export const SEA_ROWS = 11;
export const WATER_LEVEL = -0.55;
