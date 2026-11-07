import { districtForTurn } from './districts.ts';
import type { LevelSpec } from './types.ts';

export const TOTAL_TURNS = 30;

/** Turn parameters before seed selection: pizzas N (3..8), stops K (2..5), traffic cars. */
export function turnParams(turn: number): Omit<LevelSpec, 'seed'> {
  const t = (turn - 1) / (TOTAL_TURNS - 1);
  const district = districtForTurn(turn);
  const pizzas = 3 + Math.round(5 * t);
  const stops = Math.min(pizzas, 2 + Math.round(3 * t));
  const local = ((turn - 1) % 10) / 9;
  const cars =
    district === 'centro' ? 2 + Math.round(3 * local) : district === 'porto' ? 5 + Math.round(5 * local) : 4 + Math.round(4 * local);
  const minTour = 260 + Math.round(360 * t);
  return { turn, district, pizzas, stops, cars, minTour };
}

/** Target difficulty curve the level tool aims for. */
export function targetDifficulty(turn: number): number {
  return 12 + (24 * (turn - 1)) / (TOTAL_TURNS - 1);
}

export interface LevelsFile {
  version: 1;
  levels: Required<Pick<LevelSpec, 'turn' | 'district' | 'seed' | 'pizzas' | 'stops' | 'cars' | 'minTour' | 'difficulty' | 'pathLength' | 'sharpTurns' | 'bumps'>>[];
}

export function checkProgression(diffs: number[], districts: string[]): string[] {
  const errs: string[] = [];
  for (let i = 1; i < diffs.length; i++) {
    if (diffs[i] < 0.9 * diffs[i - 1]) errs.push(`turn ${i + 1} difficulty ${diffs[i]} < 90% of turn ${i} (${diffs[i - 1]})`);
    if (districts[i] !== districts[i - 1] && diffs[i - 1] > 1.2 * diffs[i])
      errs.push(`last turn of ${districts[i - 1]} (${diffs[i - 1]}) exceeds first of ${districts[i]} (${diffs[i]}) by more than 20%`);
  }
  return errs;
}
