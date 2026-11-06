import * as THREE from 'three';
import { createSeededRandom } from '../core/random';
import { RaceSim } from '../race/RaceSim';
import { getDef } from '../track/catalog';
import { newTrack, worldLanes, worldPorts, type WorldPort } from '../track/Track';
import { TrackChain } from '../track/TrackChain';
import { validateTrack } from '../track/TrackValidator';
import type { PieceData, TrackData } from '../track/types';

export type Difficulty = 'easy' | 'medium' | 'hard';

type Pool = [string, number][];

const POOLS: Record<Difficulty, Pool> = {
  easy: [
    ['straight', 4],
    ['straight_long', 2],
    ['straight_short', 1],
    ['curve_gentle_l', 3],
    ['curve_gentle_r', 3],
    ['curve_sharp_l', 2],
    ['curve_sharp_r', 2],
    ['s_curve', 2],
    ['wide_curve', 2],
    ['ramp_down', 2],
    ['half_pipe', 1],
    ['funnel_small', 1],
    ['booster', 2],
    ['spiral', 1],
    ['drop', 1],
    ['@diamond', 1],
  ],
  medium: [
    ['straight', 3],
    ['straight_short', 1],
    ['curve_gentle_l', 2],
    ['curve_gentle_r', 2],
    ['curve_sharp_l', 2],
    ['curve_sharp_r', 2],
    ['s_curve', 2],
    ['wide_curve', 2],
    ['ramp_down', 2],
    ['ramp_steep', 1],
    ['half_pipe', 1],
    ['funnel_small', 1],
    ['funnel_large', 1],
    ['booster', 2],
    ['spiral', 1],
    ['corkscrew', 1],
    ['drop', 1],
    ['loop', 1],
    ['tube', 1],
    ['jump', 1],
    ['gap_jump', 1],
    ['rotator', 1],
    ['gates', 1],
    ['@diamond', 2],
  ],
  hard: [
    ['straight', 2],
    ['curve_sharp_l', 2],
    ['curve_sharp_r', 2],
    ['s_curve', 2],
    ['wide_curve', 1],
    ['ramp_steep', 2],
    ['half_pipe', 1],
    ['funnel_large', 1],
    ['funnel_vortex', 1],
    ['booster', 2],
    ['corkscrew', 1],
    ['spiral', 1],
    ['drop', 1],
    ['loop', 2],
    ['tube', 1],
    ['jump', 1],
    ['gap_jump', 1],
    ['bounce', 1],
    ['cannon', 1],
    ['rotator', 1],
    ['swinger', 1],
    ['pendulum', 1],
    ['gates', 1],
    ['moving_platform', 1],
    ['@diamond', 2],
  ],
};

const DIAMOND_BRANCHES: [string[], string[]][] = [
  [['straight'], ['booster', 'booster']],
  [['straight'], ['gates']],
  [['straight'], ['rotator']],
  [['straight'], ['pendulum']],
  [['straight'], ['straight_short', 'booster']],
  [['straight'], ['swinger']],
];

const SETTINGS: Record<Difficulty, { height: number; min: number; max: number; marbles: number }> = {
  easy: { height: 20, min: 8, max: 12, marbles: 6 },
  medium: { height: 27, min: 12, max: 17, marbles: 8 },
  hard: { height: 34, min: 16, max: 23, marbles: 10 },
};

interface Occ {
  p: THREE.Vector3;
  id: number;
  e: number;
}

export interface GenerateResult {
  track: TrackData;
  attempts: number;
  finishers: number;
  simTime: number;
}

export class RandomTrackGenerator {
  constructor(private readonly areaHalf = 44) {}

  generate(seed: number, difficulty: Difficulty, verify = true): GenerateResult {
    let best: GenerateResult | null = null;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const s = seed + attempt * 7919;
      const track = this.build(s, difficulty);
      if (!track) continue;
      const v = validateTrack(track.pieces);
      if (!v.ok || v.issues.some((i) => i.code === 'overlap' || i.code === 'dead-end' || i.code === 'underground')) continue;
      if (!verify) return { track, attempts: attempt + 1, finishers: -1, simTime: 0 };
      // a real headless race proves it is playable
      const marbles = 4;
      const sim = new RaceSim(track.pieces, { seed: s, marbles, maxTime: 150, graceAfterWinner: 25 });
      sim.runHeadless(150);
      const fin = sim.states.filter((st) => st.finished).length;
      const falls = sim.states.reduce((a, st) => a + st.falls, 0);
      const t = sim.time;
      sim.dispose();
      const result = { track, attempts: attempt + 1, finishers: fin, simTime: t };
      if (fin >= marbles - 1 && falls <= 2) return result;
      if (!best || fin > best.finishers) best = result;
    }
    if (best) return best;
    // fall back to a guaranteed simple layout
    return { track: this.fallback(seed), attempts: 10, finishers: -1, simTime: 0 };
  }

  private build(seed: number, difficulty: Difficulty): TrackData | null {
    const rng = createSeededRandom(seed);
    const cfg = SETTINGS[difficulty];
    const track = newTrack(`${difficulty[0].toUpperCase()}${difficulty.slice(1)} #${(seed % 10000).toString().padStart(4, '0')}`);
    track.meta = { source: 'random', seed, difficulty, area: this.areaHalf };
    const chain = new TrackChain(track);
    const lim = this.areaHalf - 2;
    const corner = Math.floor(rng() * 4);
    const sx = corner % 2 === 0 ? -lim + 4 : lim - 4;
    const sz = corner < 2 ? -lim + 6 : lim - 6;
    const r = sx < 0 ? 0 : 2;
    chain.start(Math.round((sx - 2) / 4) * 4 + 2, cfg.height, Math.round(sz / 4) * 4, r);
    const occ: Occ[] = [];
    this.occupy(occ, track.pieces[0]);
    const target = cfg.min + Math.floor(rng() * (cfg.max - cfg.min + 1));
    const pool = POOLS[difficulty];
    let placed = 0;
    let guard = 0;
    while (placed < target && guard < 400) {
      guard += 1;
      const at = chain.cursor;
      if (!at) return null;
      const remainingHeight = at.pos.y - 2.5;
      const choice = this.pick(pool, rng);
      if (choice === '@diamond') {
        if (this.tryDiamond(chain, occ, rng, lim)) {
          placed += 4;
          continue;
        }
        continue;
      }
      const mirror = getDef(choice).mirrorable ? rng() < 0.5 : false;
      if (!this.tryPlace(chain, choice, mirror, occ, lim, remainingHeight)) {
        // dead end avoidance: try a few safe pieces before backtracking
        const safe = ['curve_sharp_l', 'curve_sharp_r', 'straight_short', 'spiral', 'drop'];
        let ok = false;
        for (const s of safe.sort(() => rng() - 0.5)) {
          if (this.tryPlace(chain, s, false, occ, lim, remainingHeight)) {
            ok = true;
            break;
          }
        }
        if (!ok) {
          const depth = 1 + Math.floor(rng() * 3);
          for (let k = 0; k < depth; k += 1) {
            if (track.pieces.length <= 1) return null;
            this.backtrack(chain, track, occ);
            placed = Math.max(0, placed - 1);
          }
          continue;
        }
      }
      placed += 1;
    }
    // finish line
    for (let k = 0; k < 6; k += 1) {
      if (this.tryPlace(chain, 'finish', false, occ, lim, 99)) return track;
      if (!this.backtrack(chain, track, occ)) return null;
    }
    return null;
  }

  private pick(pool: Pool, rng: () => number): string {
    const total = pool.reduce((a, [, w]) => a + w, 0);
    let x = rng() * total;
    for (const [id, w] of pool) {
      x -= w;
      if (x <= 0) return id;
    }
    return pool[0][0];
  }

  private lanePoints(pd: PieceData): { p: THREE.Vector3; e: number }[] {
    const ext = getDef(pd.t).extent ?? 1.1;
    const pts: { p: THREE.Vector3; e: number }[] = [];
    for (const l of worldLanes(pd)) {
      const n = l.points.length - 1;
      const step = Math.max(1, Math.floor(l.points.length / 20));
      for (let i = 0; i <= n; i += step) pts.push({ p: l.points[i], e: i / n > 0.18 && i / n < 0.82 ? ext : Math.min(ext, 1.1) });
      pts.push({ p: l.points[n], e: Math.min(ext, 1.1) });
    }
    return pts;
  }

  private fits(pd: PieceData, occ: Occ[], lim: number, joints: THREE.Vector3[]): boolean {
    for (const { p, e } of this.lanePoints(pd)) {
      if (Math.abs(p.x) > lim || Math.abs(p.z) > lim || p.y < 1.2) return false;
      for (const o of occ) {
        if (o.id === pd.id) continue;
        if (joints.some((j) => p.distanceTo(j) < 3.2 || o.p.distanceTo(j) < 3.2)) continue;
        const dxz = Math.hypot(o.p.x - p.x, o.p.z - p.z);
        const dy = o.p.y - p.y;
        if (dxz < e + o.e + 0.4 && dy > -2.2 - (o.e > 2 ? 1.6 : 0) && dy < 2.2 + (e > 2 ? 1.6 : 0)) return false;
      }
    }
    return true;
  }

  private occupy(occ: Occ[], pd: PieceData): void {
    for (const { p, e } of this.lanePoints(pd)) occ.push({ p, id: pd.id, e });
  }

  private tryPlace(chain: TrackChain, defId: string, mirror: boolean, occ: Occ[], lim: number, heightBudget: number, at?: WorldPort, inIndex?: number, extraJoints: THREE.Vector3[] = []): boolean {
    const cursor = at ?? chain.cursor;
    if (!cursor) return false;
    const pd = TrackChain.placementFor(defId, cursor, mirror, inIndex);
    pd.id = -999;
    const outs = worldPorts(pd).filter((p) => p.kind === 'out');
    const drop = outs.length ? cursor.pos.y - Math.min(...outs.map((o) => o.pos.y)) : 0;
    if (defId !== 'finish' && drop > heightBudget) return false;
    if (!this.fits(pd, occ, lim, [cursor.pos, ...extraJoints])) return false;
    const placed = chain.place(defId, { mirror, at: cursor, inIndex });
    this.occupy(occ, placed);
    return true;
  }

  private backtrack(chain: TrackChain, track: TrackData, occ: Occ[]): boolean {
    if (track.pieces.length <= 1) return false;
    const last = track.pieces.pop() as PieceData;
    chain.placed.pop();
    for (let i = occ.length - 1; i >= 0; i -= 1) if (occ[i].id === last.id) occ.splice(i, 1);
    // cursor returns to the entry of the removed piece: find the out port it connected to
    const ins = worldPorts(last).filter((p) => p.kind === 'in');
    const prev = track.pieces[track.pieces.length - 1];
    const prevOut = worldPorts(prev).filter((p) => p.kind === 'out');
    chain.cursor = prevOut.find((o) => ins.some((i) => i.pos.distanceTo(o.pos) < 0.05)) ?? prevOut[0] ?? null;
    return true;
  }

  private tryDiamond(chain: TrackChain, occ: Occ[], rng: () => number, lim: number): boolean {
    const at = chain.cursor;
    if (!at || at.pos.y < 6) return false;
    const track = chain.track;
    const snapshot = track.pieces.length;
    const occSnap = occ.length;
    const branches = DIAMOND_BRANCHES[Math.floor(rng() * DIAMOND_BRANCHES.length)];
    const swap = rng() < 0.5;
    const [ba, bb] = swap ? [branches[1], branches[0]] : branches;
    const fail = (): false => {
      track.pieces.length = snapshot;
      chain.placed.length = Math.min(chain.placed.length, snapshot);
      occ.length = occSnap;
      chain.cursor = at;
      return false;
    };
    if (!this.tryPlace(chain, 'splitter', false, occ, lim, 99)) return fail();
    const sp = track.pieces[track.pieces.length - 1];
    const [outA, outB] = worldPorts(sp).filter((p) => p.kind === 'out');
    chain.cursor = outA;
    for (const id of ba) if (!this.tryPlace(chain, id, false, occ, lim, 99, undefined, undefined, [outA.pos, outB.pos])) return fail();
    const endA = chain.cursor as WorldPort;
    chain.cursor = outB;
    for (const id of bb) if (!this.tryPlace(chain, id, false, occ, lim, 99, undefined, undefined, [outA.pos, outB.pos])) return fail();
    const endB = chain.cursor as WorldPort;
    // merge in-port 0 sits at local z=-4, which is splitter exit A's side
    if (!this.tryPlace(chain, 'merge', false, occ, lim, 99, endA, 0, [endB.pos])) return fail();
    const merge = track.pieces[track.pieces.length - 1];
    const mergeIns = worldPorts(merge).filter((p) => p.kind === 'in');
    if (!mergeIns.some((p) => p.pos.distanceTo(endB.pos) < 0.05)) return fail();
    chain.cursor = worldPorts(merge).find((p) => p.kind === 'out') ?? null;
    return true;
  }

  /** Always-valid simple layout. */
  fallback(seed: number): TrackData {
    const t = newTrack(`Classic #${seed % 1000}`);
    t.meta = { source: 'random', seed, area: this.areaHalf };
    const c = new TrackChain(t);
    c.start(-22, 16, -20, 0);
    for (const id of ['straight', 'curve_gentle_r', 'ramp_down', 'curve_sharp_r', 'booster', 'straight', 'curve_gentle_r', 'straight', 'finish']) c.place(id);
    return t;
  }
}
