import * as THREE from 'three';
import { getDef } from '../track/catalog';
import { analyzeConnections } from '../track/TrackConnectionSystem';
import { worldLanes } from '../track/Track';
import type { PieceData } from '../track/types';

export interface GraphLane {
  idx: number;
  pieceId: number;
  defId: string;
  points: THREE.Vector3[];
  /** cumulative distance from lane start */
  cum: number[];
  length: number;
  from: number;
  to: number;
  /** distance to finish from lane END */
  tail: number;
  next: number[];
}

export interface LaneLocation {
  lane: number;
  sample: number;
  remaining: number;
  dist: number;
}

/**
 * Ordered lane graph for race progress. Each marble is mapped to its nearest
 * lane sample; "remaining" = distance to the finish line along the track,
 * which ranks marbles correctly across branches.
 */
export class RaceGraph {
  readonly lanes: GraphLane[] = [];
  startLane = -1;
  finishPieceId = -1;
  totalLength = 0;

  constructor(pieces: PieceData[]) {
    const track = pieces.filter((p) => !getDef(p.t).decor);
    const report = analyzeConnections(track);
    // map out port → connected in port
    const link = new Map<string, { pieceId: number; index: number }>();
    for (const c of report.connections) link.set(`${c.out.pieceId}:${c.out.index}`, { pieceId: c.in.pieceId, index: c.in.index });
    for (const pd of track) {
      for (const l of worldLanes(pd)) {
        const cum = [0];
        for (let i = 1; i < l.points.length; i += 1) cum.push(cum[i - 1] + l.points[i].distanceTo(l.points[i - 1]));
        this.lanes.push({ idx: this.lanes.length, pieceId: pd.id, defId: pd.t, points: l.points, cum, length: cum[cum.length - 1], from: l.from, to: l.to, tail: Infinity, next: [] });
        if (pd.t === 'start' && this.startLane < 0) this.startLane = this.lanes.length - 1;
        if (pd.t === 'finish' && l.to === -1) this.finishPieceId = pd.id;
      }
    }
    // successor lanes
    for (const lane of this.lanes) {
      if (lane.to < 0) continue;
      const dest = link.get(`${lane.pieceId}:${lane.to}`);
      if (!dest) continue;
      lane.next = this.lanes.filter((o) => o.pieceId === dest.pieceId && o.from === dest.index).map((o) => o.idx);
    }
    // distance to finish (Bellman-Ford style relaxation)
    for (const lane of this.lanes) if (lane.defId === 'finish' && lane.to === -1) lane.tail = 0;
    for (let iter = 0; iter < this.lanes.length + 2; iter += 1) {
      let changed = false;
      for (const lane of this.lanes) {
        if (lane.to < 0) continue;
        let best = Infinity;
        for (const n of lane.next) best = Math.min(best, this.lanes[n].tail + this.lanes[n].length);
        if (best < lane.tail - 1e-6) {
          lane.tail = best;
          changed = true;
        }
      }
      if (!changed) break;
    }
    if (this.startLane >= 0) this.totalLength = this.lanes[this.startLane].tail + this.lanes[this.startLane].length;
  }

  remainingAt(lane: number, sample: number): number {
    const l = this.lanes[lane];
    return l.tail + (l.length - l.cum[sample]);
  }

  /** Locate a world position. `hint` is the previous lane to favour continuity. */
  locate(p: THREE.Vector3, hint = -1): LaneLocation | null {
    let best: LaneLocation | null = null;
    const consider = (li: number, bias: number): void => {
      const lane = this.lanes[li];
      const pts = lane.points;
      for (let i = 0; i < pts.length; i += 1) {
        const q = pts[i];
        const dx = q.x - p.x;
        const dy = (q.y - p.y) * 1.4;
        const dz = q.z - p.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + bias;
        if (!best || d < best.dist) best = { lane: li, sample: i, remaining: 0, dist: d };
      }
    };
    if (hint >= 0 && this.lanes[hint]) {
      consider(hint, 0);
      for (const n of this.lanes[hint].next) consider(n, 0);
    }
    const near = best as LaneLocation | null;
    if (!near || near.dist > 2.2) {
      for (const lane of this.lanes) consider(lane.idx, hint >= 0 ? 0.6 : 0);
    }
    const found = best as LaneLocation | null;
    if (!found) return null;
    found.remaining = this.remainingAt(found.lane, found.sample);
    return found;
  }

  /** Point and tangent a given distance back along the lane (for recovery). */
  pointBefore(lane: number, sample: number, back: number): { pos: THREE.Vector3; dir: THREE.Vector3 } {
    const l = this.lanes[lane];
    const target = Math.max(0, l.cum[sample] - back);
    let i = sample;
    while (i > 0 && l.cum[i] > target) i -= 1;
    const a = l.points[Math.max(0, i)];
    const b = l.points[Math.min(l.points.length - 1, i + 1)];
    const dir = new THREE.Vector3().subVectors(b, a);
    if (dir.lengthSq() < 1e-8) dir.set(1, 0, 0);
    return { pos: a.clone(), dir: dir.normalize() };
  }

  /** Point some distance further along the track, following the shortest route. */
  pointAhead(lane: number, sample: number, ahead: number): { lane: number; sample: number; pos: THREE.Vector3; dir: THREE.Vector3 } {
    let li = lane;
    let target = this.lanes[li].cum[sample] + ahead;
    for (let guard = 0; guard < 50; guard += 1) {
      const l = this.lanes[li];
      if (target <= l.length || !l.next.length) {
        const t = Math.min(target, l.length);
        let i = 0;
        while (i < l.points.length - 1 && l.cum[i + 1] < t) i += 1;
        const a = l.points[i];
        const b = l.points[Math.min(l.points.length - 1, i + 1)];
        const dir = new THREE.Vector3().subVectors(b, a);
        if (dir.lengthSq() < 1e-8) dir.set(1, 0, 0);
        return { lane: li, sample: i, pos: a.clone(), dir: dir.normalize() };
      }
      target -= l.length;
      li = l.next.reduce((bestN, n) => (this.lanes[n].tail + this.lanes[n].length < this.lanes[bestN].tail + this.lanes[bestN].length ? n : bestN), l.next[0]);
    }
    const l = this.lanes[li];
    return { lane: li, sample: 0, pos: l.points[0].clone(), dir: new THREE.Vector3(1, 0, 0) };
  }
}
