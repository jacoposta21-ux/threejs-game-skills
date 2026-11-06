import * as THREE from 'three';
import { getDef } from './catalog';
import { getPorts } from './PieceRegistry';
import { rotQuarter, worldPorts, type WorldPort } from './Track';
import type { PieceData } from './types';

export interface Connection {
  out: WorldPort;
  in: WorldPort;
}

export interface ConnectionReport {
  connections: Connection[];
  /** Ports with no partner. */
  open: WorldPort[];
  /** Ports sitting on top of each other that cannot connect (in-in, out-out, wrong facing). */
  mismatched: [WorldPort, WorldPort][];
  /** Ports that are close but not aligned. */
  near: [WorldPort, WorldPort][];
  /** pieceId → downstream piece ids */
  next: Map<number, Set<number>>;
  prev: Map<number, Set<number>>;
}

const EPS = 0.08;

function key(v: THREE.Vector3): string {
  return `${Math.round(v.x * 2)},${Math.round(v.y * 2)},${Math.round(v.z * 2)}`;
}

export function analyzeConnections(pieces: PieceData[]): ConnectionReport {
  const all: WorldPort[] = [];
  for (const pd of pieces) all.push(...worldPorts(pd));
  const buckets = new Map<string, WorldPort[]>();
  for (const p of all) {
    const k = key(p.pos);
    const list = buckets.get(k);
    if (list) list.push(p);
    else buckets.set(k, [p]);
  }
  const used = new Set<WorldPort>();
  const connections: Connection[] = [];
  const mismatched: [WorldPort, WorldPort][] = [];
  const near: [WorldPort, WorldPort][] = [];
  const next = new Map<number, Set<number>>();
  const prev = new Map<number, Set<number>>();
  for (const pd of pieces) {
    next.set(pd.id, new Set());
    prev.set(pd.id, new Set());
  }
  const neighbours = (p: WorldPort): WorldPort[] => {
    const out: WorldPort[] = [];
    const bx = Math.round(p.pos.x * 2);
    const by = Math.round(p.pos.y * 2);
    const bz = Math.round(p.pos.z * 2);
    for (let dx = -1; dx <= 1; dx += 1)
      for (let dy = -1; dy <= 1; dy += 1)
        for (let dz = -1; dz <= 1; dz += 1) {
          const list = buckets.get(`${bx + dx},${by + dy},${bz + dz}`);
          if (list) out.push(...list);
        }
    return out;
  };
  for (const p of all) {
    if (p.kind !== 'out' || used.has(p)) continue;
    for (const q of neighbours(p)) {
      if (q === p || q.pieceId === p.pieceId || used.has(q)) continue;
      if (q.pos.distanceTo(p.pos) > EPS) continue;
      if (q.kind === 'in' && q.facing.dot(p.facing) < -0.99) {
        connections.push({ out: p, in: q });
        used.add(p);
        used.add(q);
        next.get(p.pieceId)?.add(q.pieceId);
        prev.get(q.pieceId)?.add(p.pieceId);
        break;
      }
    }
  }
  for (const p of all) {
    if (used.has(p)) continue;
    for (const q of neighbours(p)) {
      if (q === p || q.pieceId === p.pieceId || used.has(q)) continue;
      if (all.indexOf(q) < all.indexOf(p)) continue;
      const d = q.pos.distanceTo(p.pos);
      if (d <= EPS) mismatched.push([p, q]);
    }
  }
  const open = all.filter((p) => !used.has(p));
  // near misses: open ports within 1.6 units of each other
  for (let i = 0; i < open.length; i += 1)
    for (let j = i + 1; j < open.length; j += 1) {
      const a = open[i];
      const b = open[j];
      if (a.pieceId === b.pieceId) continue;
      const d = a.pos.distanceTo(b.pos);
      if (d > EPS && d < 1.6 && a.kind !== b.kind) near.push([a, b]);
    }
  return { connections, open, mismatched, near, next, prev };
}

export interface SnapCandidate {
  p: [number, number, number];
  r: number;
  anchor: WorldPort;
  /** Port index on the moving piece that connects. */
  portIndex: number;
}

/** All placements of `defId` that connect one of its ports to an open port in `others`. */
export function snapCandidates(defId: string, mirror: boolean, openPorts: WorldPort[], preferRot?: number): SnapCandidate[] {
  const def = getDef(defId);
  const ports = getPorts(def, mirror);
  const out: SnapCandidate[] = [];
  for (const anchor of openPorts) {
    ports.forEach((port, portIndex) => {
      if (port.kind === anchor.kind) return;
      for (let r = 0; r < 4; r += 1) {
        const f = rotQuarter(port.facing, r);
        if (f.dot(anchor.facing) > -0.99) continue;
        const origin = anchor.pos.clone().sub(rotQuarter(port.pos, r));
        out.push({ p: [origin.x, origin.y, origin.z], r, anchor, portIndex });
      }
    });
  }
  if (preferRot !== undefined) out.sort((a, b) => (a.r === preferRot ? 0 : 1) - (b.r === preferRot ? 0 : 1));
  return out;
}

/** Grid snap for free placement: ports land on cell-edge centres. */
export function gridSnapOrigin(x: number, z: number, r: number, cell = 4): [number, number] {
  // along-flow axis snaps to cell edges (≡ 2 mod 4 relative to centres), lateral to centres
  const along = r % 2 === 0 ? x : z;
  const lateral = r % 2 === 0 ? z : x;
  const a = Math.round((along - cell / 2) / cell) * cell + cell / 2;
  const l = Math.round(lateral / cell) * cell;
  return r % 2 === 0 ? [a, l] : [l, a];
}
