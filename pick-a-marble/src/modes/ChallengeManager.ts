import { getDef, PIECES } from '../track/catalog';
import { newTrack } from '../track/Track';
import { TrackChain } from '../track/TrackChain';
import type { ValidationResult } from '../track/TrackValidator';
import type { TrackData } from '../track/types';
import type { RaceResult } from '../race/RaceManager';

export interface ObjectiveCtx {
  track: TrackData;
  validation: ValidationResult;
  result: RaceResult | null;
  marbles: number;
}

export interface Objective {
  label: string;
  /** true / false, or null when it can only be judged after a race. */
  check: (ctx: ObjectiveCtx) => boolean | null;
}

export interface ChallengeDef {
  id: string;
  title: string;
  desc: string;
  stars: number;
  marbles: number;
  maxPieces?: number;
  allowed?: (defId: string) => boolean;
  setup: () => { track: TrackData; locked: number[] };
  objectives: Objective[];
  reward: { xp: number; coins: number; skin?: string; piece?: string };
}

const cats = (...c: string[]) => (id: string) => c.includes(getDef(id).category);
const countTag = (t: TrackData, tag: string): number => t.pieces.filter((p) => getDef(p.t).tags?.includes(tag)).length;
const buildCount = (t: TrackData): number => t.pieces.filter((p) => p.t !== 'start' && p.t !== 'finish' && !getDef(p.t).decor).length;

/** Lay out a solution, then keep only start + finish as the locked frame. */
function framed(name: string, start: [number, number, number, number], solution: string[]): () => { track: TrackData; locked: number[] } {
  return () => {
    const t = newTrack(name);
    t.meta = { source: 'challenge', area: 32 };
    const c = new TrackChain(t);
    c.start(...start);
    for (const s of solution) c.place(s);
    c.place('finish');
    t.pieces = t.pieces.filter((p) => p.t === 'start' || p.t === 'finish');
    t.pieces.forEach((p, i) => (p.id = i + 1));
    return { track: t, locked: t.pieces.map((p) => p.id) };
  };
}

function startOnly(name: string, start: [number, number, number, number]): () => { track: TrackData; locked: number[] } {
  return () => {
    const t = newTrack(name);
    t.meta = { source: 'challenge', area: 32 };
    const c = new TrackChain(t);
    c.start(...start);
    return { track: t, locked: [1] };
  };
}

const validObj: Objective = { label: 'Track is connected from start to finish', check: (c) => c.validation.ok && c.validation.reachable.size > 0 };
const allFinish: Objective = { label: 'Every marble crosses the finish line', check: (c) => (c.result ? c.result.finished === c.marbles : null) };

export const CHALLENGES: ChallengeDef[] = [
  {
    id: 'c1',
    title: 'First Roll',
    desc: 'The start and finish are already placed. Connect them with track pieces.',
    stars: 1,
    marbles: 4,
    allowed: cats('basic', 'vertical', 'decor'),
    setup: framed('First Roll', [-14, 10, -6, 0], ['straight', 'straight', 'curve_gentle_r']),
    objectives: [validObj, allFinish],
    reward: { xp: 80, coins: 60 },
  },
  {
    id: 'c2',
    title: 'Five Piece Wonder',
    desc: 'Reach the finish line using at most 5 track pieces.',
    stars: 1,
    marbles: 4,
    maxPieces: 5,
    allowed: cats('basic', 'vertical', 'special', 'decor'),
    setup: framed('Five Piece Wonder', [-18, 14, -14, 0], ['ramp_down', 'curve_gentle_r', 'curve_sharp_r', 'straight', 'curve_sharp_l']),
    objectives: [validObj, { label: 'Use 5 pieces or fewer', check: (c) => buildCount(c.track) <= 5 }, { label: 'At least one marble finishes', check: (c) => (c.result ? c.result.finished >= 1 : null) }],
    reward: { xp: 100, coins: 80 },
  },
  {
    id: 'c3',
    title: 'Curve Appeal',
    desc: 'Build a winding track with at least 4 curves. Place your own finish line.',
    stars: 2,
    marbles: 6,
    allowed: cats('basic', 'vertical', 'gates', 'decor'),
    setup: startOnly('Curve Appeal', [-20, 16, -18, 0]),
    objectives: [validObj, { label: 'Use at least 4 curve pieces', check: (c) => countTag(c.track, 'curve') >= 4 }, allFinish],
    reward: { xp: 120, coins: 90 },
  },
  {
    id: 'c4',
    title: 'Clean Run',
    desc: 'Include a jump, but no marble may fall off the track.',
    stars: 2,
    marbles: 6,
    setup: startOnly('Clean Run', [-20, 18, -18, 0]),
    objectives: [validObj, { label: 'Include at least 1 jump piece', check: (c) => countTag(c.track, 'jump') >= 1 }, { label: 'No marble falls off', check: (c) => (c.result ? c.result.totalFalls === 0 : null) }, allFinish],
    reward: { xp: 140, coins: 100 },
  },
  {
    id: 'c5',
    title: 'Loop-de-Loop',
    desc: 'Make a marble pass through 2 loops in a single race.',
    stars: 2,
    marbles: 6,
    setup: startOnly('Loop-de-Loop', [-20, 26, -18, 0]),
    objectives: [validObj, { label: 'A marble completes 2 loops', check: (c) => (c.result ? c.result.maxLoops >= 2 : null) }],
    reward: { xp: 160, coins: 110, skin: 'checkers' },
  },
  {
    id: 'c6',
    title: 'Frequent Flyer',
    desc: 'Build a track where a marble takes at least 3 jumps.',
    stars: 3,
    marbles: 6,
    setup: startOnly('Frequent Flyer', [-22, 26, -18, 0]),
    objectives: [validObj, { label: 'Include 3 jump pieces', check: (c) => countTag(c.track, 'jump') >= 3 }, { label: 'A marble lands 3 jumps', check: (c) => (c.result ? c.result.maxJumps >= 3 : null) }],
    reward: { xp: 180, coins: 130 },
  },
  {
    id: 'c7',
    title: 'Fork in the Road',
    desc: 'Create multiple routes: split the track and get finishers down both paths.',
    stars: 3,
    marbles: 8,
    setup: startOnly('Fork in the Road', [-22, 20, -2, 0]),
    objectives: [validObj, { label: 'Use a Splitter', check: (c) => countTag(c.track, 'splitter') >= 1 }, { label: 'Finishers use both routes', check: (c) => (c.result ? c.result.splitRoutesUsed >= 2 : null) }],
    reward: { xp: 200, coins: 150 },
  },
  {
    id: 'c8',
    title: 'Speed Demon',
    desc: 'The winner must cross the line in under 7 seconds.',
    stars: 3,
    marbles: 6,
    setup: startOnly('Speed Demon', [-22, 28, -18, 0]),
    objectives: [validObj, { label: 'Winning time under 7.0 s', check: (c) => (c.result ? c.result.finished > 0 && (c.result.rows[0].time ?? 99) < 7 : null) }],
    reward: { xp: 220, coins: 160, skin: 'gold' },
  },
  {
    id: 'c9',
    title: 'Slow Burn',
    desc: 'Build a long journey: the winner takes at least 40 seconds and every marble finishes.',
    stars: 3,
    marbles: 6,
    setup: startOnly('Slow Burn', [-24, 30, -24, 0]),
    objectives: [validObj, { label: 'Winning time at least 40 s', check: (c) => (c.result ? (c.result.rows[0].time ?? 0) >= 40 : null) }, allFinish],
    reward: { xp: 240, coins: 170 },
  },
  {
    id: 'c10',
    title: 'Funnel Vision',
    desc: 'Send the marbles through 2 funnels; at least 6 of 8 must finish.',
    stars: 4,
    marbles: 8,
    setup: startOnly('Funnel Vision', [-24, 30, -22, 0]),
    objectives: [validObj, { label: 'A marble passes 2 funnels', check: (c) => (c.result ? c.result.funnelsTraversed >= 2 : null) }, { label: '6 or more marbles finish', check: (c) => (c.result ? c.result.finished >= 6 : null) }],
    reward: { xp: 260, coins: 190, skin: 'lava' },
  },
  {
    id: 'c11',
    title: 'Obstacle Course',
    desc: 'Place at least 3 moving obstacles; 6 of 8 marbles must survive to the finish.',
    stars: 4,
    marbles: 8,
    setup: startOnly('Obstacle Course', [-22, 24, -20, 0]),
    objectives: [validObj, { label: 'Use 3 moving obstacles', check: (c) => countTag(c.track, 'obstacle') >= 3 }, { label: '6 or more marbles finish', check: (c) => (c.result ? c.result.finished >= 6 : null) }],
    reward: { xp: 280, coins: 210 },
  },
  {
    id: 'c12',
    title: 'Chaos Engineer',
    desc: 'The grand finale: 12 marbles, 25+ pieces, and every marble must finish.',
    stars: 5,
    marbles: 12,
    setup: startOnly('Chaos Engineer', [-26, 34, -26, 0]),
    objectives: [validObj, { label: 'Use 25 or more pieces', check: (c) => buildCount(c.track) >= 25 }, allFinish],
    reward: { xp: 400, coins: 300, skin: 'earth' },
  },
];

export function challengeUnlocked(index: number, done: (id: string) => boolean): boolean {
  return index === 0 || done(CHALLENGES[index - 1].id);
}

export function evaluate(ch: ChallengeDef, ctx: ObjectiveCtx): { states: (boolean | null)[]; passed: boolean } {
  const states = ch.objectives.map((o) => o.check(ctx));
  return { states, passed: states.every((s) => s === true) };
}

void PIECES;
