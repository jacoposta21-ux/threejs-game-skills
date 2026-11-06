import * as THREE from 'three';
import { getDef, PIECE_MAP } from './catalog';
import { getBuild, getPorts } from './PieceRegistry';
import type { PieceData, TrackData } from './types';

export interface WorldPort {
  pieceId: number;
  index: number;
  kind: 'in' | 'out';
  pos: THREE.Vector3;
  facing: THREE.Vector3;
}

const Y = new THREE.Vector3(0, 1, 0);

export function rotQuarter(v: THREE.Vector3, r: number): THREE.Vector3 {
  const q = ((r % 4) + 4) % 4;
  const { x, y, z } = v;
  switch (q) {
    case 0:
      return new THREE.Vector3(x, y, z);
    case 1:
      return new THREE.Vector3(z, y, -x);
    case 2:
      return new THREE.Vector3(-x, y, -z);
    default:
      return new THREE.Vector3(-z, y, x);
  }
}

export function pieceMatrix(pd: PieceData, out = new THREE.Matrix4()): THREE.Matrix4 {
  const q = new THREE.Quaternion().setFromAxisAngle(Y, (pd.r * Math.PI) / 2);
  return out.compose(new THREE.Vector3(...pd.p), q, new THREE.Vector3(1, 1, 1));
}

export function worldPorts(pd: PieceData): WorldPort[] {
  const def = getDef(pd.t);
  const origin = new THREE.Vector3(...pd.p);
  return getPorts(def, !!pd.m).map((p, index) => ({
    pieceId: pd.id,
    index,
    kind: p.kind,
    pos: rotQuarter(p.pos, pd.r).add(origin),
    facing: rotQuarter(p.facing, pd.r),
  }));
}

export function worldLanes(pd: PieceData): { points: THREE.Vector3[]; from: number; to: number }[] {
  const build = getBuild(pd.t, !!pd.m);
  const m = pieceMatrix(pd);
  return build.lanes.map((l) => ({ from: l.from, to: l.to, points: l.points.map((p) => p.clone().applyMatrix4(m)) }));
}

export function newTrack(name = 'Untitled Track'): TrackData {
  const now = Date.now();
  return { v: 1, id: `t${now.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`, name, created: now, updated: now, pieces: [], meta: { source: 'creative' } };
}

export function cloneTrack(t: TrackData): TrackData {
  return JSON.parse(JSON.stringify(t)) as TrackData;
}

export function nextPieceId(t: TrackData): number {
  return t.pieces.reduce((m, p) => Math.max(m, p.id), 0) + 1;
}

export function roundPos(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** Normalise and validate imported JSON. Throws on malformed data. */
export function sanitizeTrack(raw: unknown): TrackData {
  if (!raw || typeof raw !== 'object') throw new Error('Not a track file');
  const r = raw as Partial<TrackData>;
  if (!Array.isArray(r.pieces)) throw new Error('Track has no pieces');
  const pieces: PieceData[] = [];
  let id = 1;
  for (const p of r.pieces) {
    if (!p || typeof p.t !== 'string' || !PIECE_MAP.has(p.t)) continue;
    if (!Array.isArray(p.p) || p.p.length !== 3 || p.p.some((n) => typeof n !== 'number' || !Number.isFinite(n))) continue;
    const pd: PieceData = { id: typeof p.id === 'number' ? p.id : id, t: p.t, p: [p.p[0], p.p[1], p.p[2]], r: ((Math.round(p.r ?? 0) % 4) + 4) % 4 };
    if (p.m) pd.m = 1;
    if (typeof p.c === 'string' && /^#[0-9a-f]{6}$/i.test(p.c)) pd.c = p.c;
    if (typeof p.g === 'number') pd.g = p.g;
    pieces.push(pd);
    id = Math.max(id, pd.id) + 1;
  }
  // de-duplicate ids
  const seen = new Set<number>();
  let nid = pieces.reduce((m, p) => Math.max(m, p.id), 0) + 1;
  for (const p of pieces) {
    if (seen.has(p.id)) p.id = nid++;
    seen.add(p.id);
  }
  const now = Date.now();
  return {
    v: 1,
    id: typeof r.id === 'string' ? r.id : `t${now.toString(36)}`,
    name: typeof r.name === 'string' ? r.name.slice(0, 40) : 'Imported Track',
    created: typeof r.created === 'number' ? r.created : now,
    updated: now,
    env: typeof r.env === 'string' ? r.env : undefined,
    pieces,
    meta: r.meta && typeof r.meta === 'object' ? r.meta : { source: 'creative' },
    thumb: typeof r.thumb === 'string' && r.thumb.startsWith('data:image/') ? r.thumb : undefined,
  };
}

/** Bounding box of all track lanes (for cameras). */
export function trackBounds(t: TrackData): THREE.Box3 {
  const box = new THREE.Box3();
  for (const pd of t.pieces) {
    const def = getDef(pd.t);
    if (def.decor) {
      box.expandByPoint(new THREE.Vector3(...pd.p));
      continue;
    }
    for (const l of worldLanes(pd)) for (const p of l.points) box.expandByPoint(p);
  }
  if (box.isEmpty()) box.set(new THREE.Vector3(-8, 0, -8), new THREE.Vector3(8, 6, 8));
  return box;
}
