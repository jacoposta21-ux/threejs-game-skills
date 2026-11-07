import { CELL, Cell, type LevelData } from './types.ts';
import { PathGrid } from './pathfinding.ts';
import { computeTour, type TourInfo } from './generator.ts';

export const MIN_ROAD_WIDTH_M = 4;
export const MIN_TOUR_M = 250;
export const MAX_TOUR_M = 900;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  tour: TourInfo | null;
}

export function validateLevel(level: LevelData): ValidationResult {
  const errors: string[] = [];
  const { map, stops, spec } = level;
  const grid = new PathGrid(map);

  if (stops.length !== spec.stops) errors.push(`expected ${spec.stops} stops, got ${stops.length}`);
  const total = stops.reduce((s, x) => s + x.count, 0);
  if (total !== spec.pizzas) errors.push(`pizza split ${total} != ${spec.pizzas}`);
  if (stops.some((s) => s.count < 1 || s.count > 3)) errors.push('stop with count outside 1..3');

  // road widths: declared and on the grid
  for (const s of map.segments) {
    if (s.width * CELL < MIN_ROAD_WIDTH_M) errors.push(`segment narrower than ${MIN_ROAD_WIDTH_M} m`);
  }
  const { cols, rows, cells } = map;
  const drv = (x: number, z: number) => x >= 0 && z >= 0 && x < cols && z < rows && grid.pass[z * cols + x] === 1;
  let narrow = 0;
  for (let z = 0; z < rows; z++)
    for (let x = 0; x < cols; x++) {
      if (cells[z * cols + x] !== Cell.ROAD) continue;
      // some 2x2 drivable window (4 m x 4 m) must contain this cell
      let ok = false;
      for (let oz = -1; oz <= 0 && !ok; oz++)
        for (let ox = -1; ox <= 0 && !ok; ox++)
          ok = drv(x + ox, z + oz) && drv(x + ox + 1, z + oz) && drv(x + ox, z + oz + 1) && drv(x + ox + 1, z + oz + 1);
      if (!ok) narrow++;
    }
  if (narrow > 0) errors.push(`${narrow} road cells in corridors narrower than ${MIN_ROAD_WIDTH_M} m`);

  // deliveries outside buildings and reachable
  const start = grid.nearestPassable(grid.cellOf(map.pizzeria.x, map.pizzeria.z));
  for (const s of stops) {
    const a = s.address;
    const c = grid.cellOf(a.x, a.z);
    const t = cells[c];
    if (t === Cell.BUILDING || t === Cell.WATER || t === Cell.FOUNTAIN || t === Cell.GARDEN) errors.push(`delivery inside blocked cell (${t})`);
    if (!grid.pass[c]) errors.push('delivery cell not drivable');
    const d = grid.astar(start, c);
    if (!(d < Infinity)) errors.push(`address at ${a.x.toFixed(0)},${a.z.toFixed(0)} unreachable`);
  }

  let tour: TourInfo | null = null;
  if (!errors.length) {
    tour = computeTour(map, grid, stops.map((s) => s.address));
    if (!(tour.length >= MIN_TOUR_M && tour.length <= MAX_TOUR_M)) errors.push(`tour length ${tour.length.toFixed(0)} m outside ${MIN_TOUR_M}-${MAX_TOUR_M}`);
  }
  return { valid: errors.length === 0, errors, tour };
}
