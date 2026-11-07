/** Shared level/map data types. Pure data: no three.js, usable from Node tools and tests. */

export const CELL = 2; // metres per grid cell
export const HEIGHT_RES = 1; // metres per height sample

export const Cell = {
  ROAD: 1,
  SIDEWALK: 2,
  BUILDING: 3,
  PLAZA: 4,
  WATER: 5,
  FOUNTAIN: 6,
  STAIRS: 7,
  QUAY: 8,
  GARDEN: 9,
} as const;
export type CellType = (typeof Cell)[keyof typeof Cell];

export type DistrictId = 'centro' | 'porto' | 'collina';

export interface DistrictParams {
  id: DistrictId;
  cols: number;
  rows: number;
  margin: number;
  blockMin: number;
  blockMax: number;
  roadWidths: number[];
  /** chance to remove an interior road segment (merges blocks) */
  removeSegmentChance: number;
  /** chance a large block is split by a 2-cell vicolo */
  alleyChance: number;
  plazaCount: number;
  floorsMin: number;
  floorsMax: number;
  bumpsPerSegment: number;
  ramps: number;
  /** cobble micro-bump amplitude (m) */
  cobbleAmp: number;
  water: boolean;
  hill: boolean;
}

export interface Rect {
  x0: number;
  z0: number;
  x1: number; // exclusive
  z1: number; // exclusive
}

export interface RoadSegment extends Rect {
  axis: 'x' | 'z'; // direction of travel along the segment
  width: number; // cells
  kind: 'road' | 'alley' | 'quay';
}

export interface Building {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  floors: number;
  color: number; // palette index
  roof: 'gable' | 'hip' | 'flat';
  /** door side: 0=-z,1=+x,2=+z,3=-x */
  doorSide: number;
  /** door position along the side, metres (world) */
  doorX: number;
  doorZ: number;
  baseY: number;
  special?: 'pizzeria';
  edge?: boolean;
}

export interface Address {
  building: number;
  /** delivery circle centre, world metres */
  x: number;
  z: number;
  /** door position (customer spawn) */
  doorX: number;
  doorZ: number;
  /** outward normal of the door */
  nx: number;
  nz: number;
}

export interface Plaza extends Rect {
  fountain: Rect | null;
}

export interface Bump {
  x: number;
  z: number;
  axis: 'x' | 'z'; // travel axis crossing the bump
  kind: 'bump' | 'ramp';
  dir: 1 | -1; // ramp rising direction along axis
}

export interface TrafficPath {
  points: [number, number][]; // world metres, closed loop
  vehicle: 'car' | 'ape';
}

export interface MapData {
  district: DistrictId;
  seed: number;
  cols: number;
  rows: number;
  cells: Uint8Array; // cols*rows
  /** height samples at HEIGHT_RES, (cols*CELL/HEIGHT_RES+1) x (rows*CELL/HEIGHT_RES+1) */
  hw: number;
  hh: number;
  heights: Float32Array;
  segments: RoadSegment[];
  buildings: Building[];
  plazas: Plaza[];
  bumps: Bump[];
  stairs: Rect[];
  candidates: Address[];
  pizzeria: { building: number; x: number; z: number; heading: number };
  /** road graph for traffic */
  nodes: [number, number][];
  edges: [number, number][];
  waterLine: number; // world z where sea starts (porto), else -1
  cobbleAmp: number;
}

export interface DeliveryStop {
  address: Address;
  count: number;
}

export interface LevelSpec {
  turn: number;
  district: DistrictId;
  seed: number;
  pizzas: number;
  stops: number;
  cars: number;
  /** minimum optimal tour length (m) the generator aims for */
  minTour: number;
  difficulty?: number;
  pathLength?: number;
  sharpTurns?: number;
  bumps?: number;
}

export interface LevelData {
  spec: LevelSpec;
  map: MapData;
  stops: DeliveryStop[];
  traffic: TrafficPath[];
}

export function cellIndex(map: { cols: number }, cx: number, cz: number): number {
  return cz * map.cols + cx;
}
