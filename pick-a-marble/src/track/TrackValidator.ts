import * as THREE from 'three';
import { getDef } from './catalog';
import { analyzeConnections, type ConnectionReport } from './TrackConnectionSystem';
import { worldLanes, worldPorts } from './Track';
import type { PieceData } from './types';

export type IssueLevel = 'error' | 'warn' | 'info';

export interface Issue {
  level: IssueLevel;
  code: string;
  msg: string;
  pieces: number[];
  at?: THREE.Vector3;
}

export interface ValidationResult {
  ok: boolean;
  issues: Issue[];
  report: ConnectionReport;
  reachable: Set<number>;
  pathPieces: number;
}

export function validateTrack(pieces: PieceData[]): ValidationResult {
  const issues: Issue[] = [];
  const track = pieces.filter((p) => !getDef(p.t).decor);
  const report = analyzeConnections(track);
  const starts = track.filter((p) => p.t === 'start');
  const finishes = track.filter((p) => p.t === 'finish');
  if (starts.length === 0) issues.push({ level: 'error', code: 'no-start', msg: 'Add a Starting Gate so the marbles have somewhere to begin.', pieces: [] });
  if (starts.length > 1) issues.push({ level: 'warn', code: 'multi-start', msg: 'More than one Starting Gate — only the first one is used.', pieces: starts.slice(1).map((p) => p.id) });
  if (finishes.length === 0) issues.push({ level: 'error', code: 'no-finish', msg: 'Add a Finish Line so the race can end.', pieces: [] });

  const reachable = new Set<number>();
  if (starts[0]) {
    const queue = [starts[0].id];
    reachable.add(starts[0].id);
    while (queue.length) {
      const id = queue.shift() as number;
      for (const n of report.next.get(id) ?? []) {
        if (!reachable.has(n)) {
          reachable.add(n);
          queue.push(n);
        }
      }
    }
  }
  const finishReached = finishes.some((f) => reachable.has(f.id));
  if (starts[0] && finishes.length && !finishReached)
    issues.push({ level: 'error', code: 'unreachable-finish', msg: "The finish line can't be reached from the start. Connect the pieces in between.", pieces: finishes.map((p) => p.id) });

  const disconnected = track.filter((p) => !reachable.has(p.id) && p.t !== 'start');
  if (starts[0] && disconnected.length)
    issues.push({
      level: 'warn',
      code: 'disconnected',
      msg: `${disconnected.length} piece${disconnected.length > 1 ? 's are' : ' is'} not connected to the start.`,
      pieces: disconnected.map((p) => p.id),
    });

  // dead ends: open out ports on reachable pieces
  const deadEnds = report.open.filter((p) => p.kind === 'out' && reachable.has(p.pieceId));
  if (deadEnds.length)
    issues.push({
      level: 'warn',
      code: 'dead-end',
      msg: `${deadEnds.length} dead end${deadEnds.length > 1 ? 's' : ''} — marbles will fly off the open end${deadEnds.length > 1 ? 's' : ''}.`,
      pieces: [...new Set(deadEnds.map((p) => p.pieceId))],
      at: deadEnds[0].pos.clone(),
    });

  for (const [a, b] of report.mismatched)
    issues.push({
      level: 'error',
      code: 'mismatch',
      msg: a.kind === b.kind ? `Impossible connection: two ${a.kind === 'in' ? 'entrances' : 'exits'} are joined together.` : 'Impossible connection: pieces meet facing the wrong way.',
      pieces: [a.pieceId, b.pieceId],
      at: a.pos.clone(),
    });
  for (const [a, b] of report.near)
    issues.push({ level: 'warn', code: 'misaligned', msg: 'Two pieces almost touch but are misaligned.', pieces: [a.pieceId, b.pieceId], at: a.pos.clone() });

  // height checks along reachable path
  const start = starts[0];
  if (start) {
    const startY = worldPorts(start)[0].pos.y;
    const above = track.filter((p) => reachable.has(p.id) && p.t !== 'start' && worldPorts(p).some((wp) => wp.pos.y > startY + 0.01));
    if (above.length)
      issues.push({
        level: 'warn',
        code: 'too-high',
        msg: 'Part of the track climbs above the start — marbles may not have the energy to get there.',
        pieces: above.map((p) => p.id),
      });
  }

  // intersections between non-adjacent pieces (lane proximity)
  const cell = 3.2;
  const hash = new Map<string, { id: number; p: THREE.Vector3; e: number }[]>();
  const lanesById = new Map<number, THREE.Vector3[]>();
  const extentById = new Map<number, number>();
  for (const pd of track) {
    const pts: THREE.Vector3[] = [];
    for (const l of worldLanes(pd)) {
      const step = Math.max(1, Math.floor(l.points.length / 24));
      for (let i = 2; i < l.points.length - 2; i += step) pts.push(l.points[i]);
    }
    lanesById.set(pd.id, pts);
    const e = getDef(pd.t).extent ?? 1.1;
    extentById.set(pd.id, e);
    for (const p of pts) {
      const k = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)},${Math.floor(p.z / cell)}`;
      const list = hash.get(k);
      if (list) list.push({ id: pd.id, p, e });
      else hash.set(k, [{ id: pd.id, p, e }]);
    }
  }
  const clashes = new Set<string>();
  const joints = new Map<string, THREE.Vector3[]>();
  for (const c of report.connections) {
    for (const k of [`${c.out.pieceId}:${c.in.pieceId}`, `${c.in.pieceId}:${c.out.pieceId}`]) {
      const list = joints.get(k) ?? [];
      list.push(c.out.pos);
      joints.set(k, list);
    }
  }
  const nearJoint = (a: number, b: number, p: THREE.Vector3, q: THREE.Vector3): boolean => {
    const list = joints.get(`${a}:${b}`);
    if (!list) return false;
    return list.some((j) => j.distanceTo(p) < 3.2 || j.distanceTo(q) < 3.2);
  };
  for (const [id, pts] of lanesById) {
    const ea = extentById.get(id) ?? 1.1;
    for (const p of pts) {
      const bx = Math.floor(p.x / cell);
      const by = Math.floor(p.y / cell);
      const bz = Math.floor(p.z / cell);
      for (let dx = -1; dx <= 1; dx += 1)
        for (let dy = -1; dy <= 1; dy += 1)
          for (let dz = -1; dz <= 1; dz += 1) {
            for (const o of hash.get(`${bx + dx},${by + dy},${bz + dz}`) ?? []) {
              if (o.id <= id || nearJoint(id, o.id, p, o.p)) continue;
              const dxz = Math.hypot(o.p.x - p.x, o.p.z - p.z);
              const dyy = o.p.y - p.y;
              // the taller of the two channels decides vertical clearance
              if (dxz < ea + o.e - 0.15 && dyy > -1.0 - (o.e > 2 ? 1.6 : 0) && dyy < 1.0 + (ea > 2 ? 1.6 : 0)) clashes.add(`${id}:${o.id}`);
            }
          }
    }
  }
  if (clashes.size) {
    const ids = new Set<number>();
    for (const c of clashes) for (const s of c.split(':')) ids.add(Number(s));
    issues.push({ level: 'warn', code: 'overlap', msg: 'Some pieces pass through each other.', pieces: [...ids] });
  }

  const low = track.filter((pd) => worldLanes(pd).some((l) => l.points.some((p) => p.y < 0.4)));
  if (low.length) issues.push({ level: 'warn', code: 'underground', msg: 'Some track dips into the build platform. Raise it up.', pieces: low.map((p) => p.id) });

  const pathPieces = track.filter((p) => reachable.has(p.id)).length;
  if (!issues.length && pathPieces > 0) issues.push({ level: 'info', code: 'ok', msg: `Track looks great! ${pathPieces} connected pieces.`, pieces: [] });
  return { ok: !issues.some((i) => i.level === 'error'), issues, report, reachable, pathPieces };
}
