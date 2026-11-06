import { getDef } from './catalog';
import { getPorts } from './PieceRegistry';
import { nextPieceId, rotQuarter, worldPorts, type WorldPort } from './Track';
import type { PieceData, TrackData } from './types';

/**
 * Programmatic track construction: append pieces at an open out-port with the
 * correct rotation. Used by the built-in tracks, challenges and the random
 * generator.
 */
export class TrackChain {
  cursor: WorldPort | null = null;
  readonly placed: PieceData[] = [];

  constructor(readonly track: TrackData) {}

  start(x: number, y: number, z: number, r = 0): PieceData {
    const pd: PieceData = { id: nextPieceId(this.track), t: 'start', p: [x, y, z], r };
    this.track.pieces.push(pd);
    this.placed.push(pd);
    this.cursor = worldPorts(pd).find((p) => p.kind === 'out') ?? null;
    return pd;
  }

  /** Place `defId` so that its in-port `inIndex` connects to `at` (default: cursor). */
  place(defId: string, opts: { mirror?: boolean; color?: string; at?: WorldPort; inIndex?: number; outIndex?: number } = {}): PieceData {
    const at = opts.at ?? this.cursor;
    if (!at) throw new Error('TrackChain has no open port');
    const pd = TrackChain.placementFor(defId, at, !!opts.mirror, opts.inIndex);
    pd.id = nextPieceId(this.track);
    if (opts.color) pd.c = opts.color;
    this.track.pieces.push(pd);
    this.placed.push(pd);
    const outs = worldPorts(pd).filter((p) => p.kind === 'out');
    this.cursor = outs[opts.outIndex ?? 0] ?? null;
    return pd;
  }

  static placementFor(defId: string, at: WorldPort, mirror: boolean, inIndex?: number): PieceData {
    const def = getDef(defId);
    const ports = getPorts(def, mirror);
    const idx = inIndex ?? ports.findIndex((p) => p.kind === 'in');
    const port = ports[idx];
    for (let r = 0; r < 4; r += 1) {
      const f = rotQuarter(port.facing, r);
      if (f.dot(at.facing) < -0.99) {
        const o = at.pos.clone().sub(rotQuarter(port.pos, r));
        const pd: PieceData = { id: 0, t: defId, p: [round(o.x), round(o.y), round(o.z)], r };
        if (mirror) pd.m = 1;
        return pd;
      }
    }
    throw new Error(`Cannot orient ${defId}`);
  }

  outs(pd: PieceData): WorldPort[] {
    return worldPorts(pd).filter((p) => p.kind === 'out');
  }

  ins(pd: PieceData): WorldPort[] {
    return worldPorts(pd).filter((p) => p.kind === 'in');
  }
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
