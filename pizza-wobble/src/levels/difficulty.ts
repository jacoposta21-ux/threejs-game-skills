import { CELL, Cell, type LevelData } from './types.ts';
import type { TourInfo } from './generator.ts';

export interface DifficultyBreakdown {
  pathLength: number;
  sharpTurns: number;
  bumps: number;
  traffic: number;
  pizzas: number;
  stops: number;
  score: number;
}

/** Single difficulty formula used by the level tool and tests. */
export function difficultyScore(d: Omit<DifficultyBreakdown, 'score'>): number {
  return 0.012 * d.pathLength + 0.45 * d.sharpTurns + 0.3 * d.bumps + 0.4 * d.traffic + 0.9 * d.pizzas + 1.2 * d.stops;
}

export function countSharpTurns(cols: number, route: number[]): number {
  // downsample the route every 3 cells (6 m) and count heading changes > 60 degrees
  const pts: [number, number][] = [];
  for (let i = 0; i < route.length; i += 3) pts.push([route[i] % cols, Math.floor(route[i] / cols)]);
  if (route.length) pts.push([route[route.length - 1] % cols, Math.floor(route[route.length - 1] / cols)]);
  let turns = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const ax = pts[i][0] - pts[i - 1][0];
    const az = pts[i][1] - pts[i - 1][1];
    const bx = pts[i + 1][0] - pts[i][0];
    const bz = pts[i + 1][1] - pts[i][1];
    const la = Math.hypot(ax, az);
    const lb = Math.hypot(bx, bz);
    if (la < 1e-6 || lb < 1e-6) continue;
    const cos = (ax * bx + az * bz) / (la * lb);
    if (cos < 0.5) turns++;
  }
  return turns;
}

export function computeDifficulty(level: LevelData, tour: TourInfo): DifficultyBreakdown {
  const { map } = level;
  const sharpTurns = countSharpTurns(map.cols, tour.cells);
  // bumps & ramps within 4 m of the route, plus cobble roughness, plus stairs nearby
  let bumps = 0;
  for (const b of map.bumps) {
    let near = false;
    for (let i = 0; i < tour.cells.length && !near; i += 2) {
      const c = tour.cells[i];
      const x = (c % map.cols) * CELL + 1;
      const z = Math.floor(c / map.cols) * CELL + 1;
      if (Math.hypot(x - b.x, z - b.z) < 4) near = true;
    }
    if (near) bumps += b.kind === 'ramp' ? 2 : 1;
  }
  bumps += (tour.length * map.cobbleAmp * 7.8) / 3; // cobble roughness per metre
  let stairsNear = 0;
  for (let i = 0; i < tour.cells.length; i += 2) {
    const c = tour.cells[i];
    const cx = c % map.cols;
    const cz = Math.floor(c / map.cols);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = cx + dx;
      const z = cz + dz;
      if (x >= 0 && z >= 0 && x < map.cols && z < map.rows && map.cells[z * map.cols + x] === Cell.STAIRS) stairsNear++;
    }
  }
  bumps += stairsNear / 6;
  const base = {
    pathLength: tour.length,
    sharpTurns,
    bumps: Math.round(bumps * 10) / 10,
    traffic: level.traffic.length,
    pizzas: level.spec.pizzas,
    stops: level.spec.stops,
  };
  return { ...base, score: Math.round(difficultyScore(base) * 100) / 100 };
}
