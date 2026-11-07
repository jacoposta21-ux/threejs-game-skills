/**
 * Deterministic district map generator. Same (district, seed) -> identical MapData.
 * Pure TypeScript (no three.js): used by the game, by tools/generate-levels.ts and by tests.
 */
import { DISTRICTS, HILL_STEP, SEA_ROWS } from './districts.ts';
import { Rng, hashSeed } from './rng.ts';
import {
  CELL,
  Cell,
  HEIGHT_RES,
  type Address,
  type Building,
  type Bump,
  type DistrictId,
  type LevelData,
  type LevelSpec,
  type MapData,
  type Plaza,
  type Rect,
  type RoadSegment,
  type TrafficPath,
  type DeliveryStop,
} from './types.ts';
import { PathGrid, bestTour } from './pathfinding.ts';

interface Line {
  s: number;
  w: number;
}

function layoutLines(total: number, margin: number, rng: Rng, widths: number[], bMin: number, bMax: number, endWidth?: number): Line[] {
  const lines: Line[] = [];
  let pos = margin;
  const end = total - margin;
  for (;;) {
    const w = rng.pick(widths);
    lines.push({ s: pos, w });
    pos += w;
    const rem = end - pos;
    if (rem <= 0) break;
    let b = rng.int(bMin, bMax);
    const wl = endWidth ?? rng.pick(widths);
    if (rem - b - wl < bMin + 2) {
      b = rem - wl;
      if (b < bMin - 2 && lines.length > 1) {
        // fold leftover into previous block by moving this road to the end
        lines.pop();
        pos -= w;
        const last = end - wl;
        lines.push({ s: last, w: wl });
        break;
      }
      pos += b;
      lines.push({ s: pos, w: wl });
      break;
    }
    pos += b;
  }
  return lines;
}

export function terraceHeight(z: number, hLines: Line[]): number {
  // hill rises toward z = 0 (north). Bottom road is height 0.
  const n = hLines.length;
  const centers = hLines.map((l) => (l.s + l.w / 2) * CELL);
  const hAt = (k: number) => (n - 1 - k) * HILL_STEP;
  if (z <= centers[0]) return hAt(0);
  if (z >= centers[n - 1]) return hAt(n - 1);
  for (let k = 0; k < n - 1; k++) {
    if (z >= centers[k] && z <= centers[k + 1]) {
      const lo = (hLines[k].s + hLines[k].w) * CELL;
      const hi = hLines[k + 1].s * CELL;
      if (z <= lo) return hAt(k);
      if (z >= hi) return hAt(k + 1);
      const t = (z - lo) / (hi - lo);
      const s = t * t * (3 - 2 * t);
      return hAt(k) + (hAt(k + 1) - hAt(k)) * s;
    }
  }
  return 0;
}

export function generateMap(district: DistrictId, seed: number): MapData {
  const P = DISTRICTS[district];
  const rng = new Rng(hashSeed(seed, 101));
  const { cols, rows, margin } = P;
  const cells = new Uint8Array(cols * rows).fill(Cell.BUILDING);
  const setRect = (r: Rect, t: number) => {
    for (let z = Math.max(0, r.z0); z < Math.min(rows, r.z1); z++)
      for (let x = Math.max(0, r.x0); x < Math.min(cols, r.x1); x++) cells[z * cols + x] = t;
  };
  const cityRows = P.water ? rows - SEA_ROWS : rows;
  const vLines = layoutLines(cols, margin, rng, P.roadWidths, P.blockMinX ?? P.blockMin, P.blockMaxX ?? P.blockMax);
  const hLines = layoutLines(cityRows, margin, rng, P.roadWidths, P.blockMin, P.blockMax, P.water ? 4 : undefined);
  if (P.water) {
    // the bottom line becomes the quay road, flush with the sea
    const last = hLines[hLines.length - 1];
    last.w = 4;
    last.s = cityRows - 4;
  }
  const NI = vLines.length;
  const NK = hLines.length;
  // segment existence
  const hSeg: boolean[][] = []; // [k][i] between vLines i,i+1 on hLine k
  const vSeg: boolean[][] = []; // [i][k] between hLines k,k+1 on vLine i
  for (let k = 0; k < NK; k++) hSeg.push(new Array(NI - 1).fill(true));
  for (let i = 0; i < NI; i++) vSeg.push(new Array(NK - 1).fill(true));
  const stairs: Rect[] = [];

  // block merge bookkeeping
  const merged: boolean[][] = [];
  for (let i = 0; i < NI - 1; i++) merged.push(new Array(NK - 1).fill(false));

  const connected = (): boolean => {
    const seen = new Uint8Array(NI * NK);
    const deg = (i: number, k: number) =>
      (i > 0 && hSeg[k][i - 1]) || (i < NI - 1 && hSeg[k][i]) || (k > 0 && vSeg[i][k - 1]) || (k < NK - 1 && vSeg[i][k]);
    let start = -1;
    let total = 0;
    for (let k = 0; k < NK; k++)
      for (let i = 0; i < NI; i++)
        if (deg(i, k)) {
          total++;
          if (start < 0) start = k * NI + i;
        }
    if (start < 0) return false;
    const stack = [start];
    seen[start] = 1;
    let count = 0;
    while (stack.length) {
      const c = stack.pop()!;
      count++;
      const i = c % NI;
      const k = (c / NI) | 0;
      const nb: number[] = [];
      if (i > 0 && hSeg[k][i - 1]) nb.push(c - 1);
      if (i < NI - 1 && hSeg[k][i]) nb.push(c + 1);
      if (k > 0 && vSeg[i][k - 1]) nb.push(c - NI);
      if (k < NK - 1 && vSeg[i][k]) nb.push(c + NI);
      for (const n of nb)
        if (!seen[n]) {
          seen[n] = 1;
          stack.push(n);
        }
    }
    return count === total;
  };

  if (P.hill) {
    // switchbacks: one vertical connector per terrace gap, alternating ends; others are stairs
    for (let k = 0; k < NK - 1; k++) {
      const keep = k % 2 === 0 ? NI - 1 : 0;
      const extra = rng.chance(0.35) ? rng.int(1, NI - 2) : -1;
      for (let i = 0; i < NI; i++) {
        if (i === keep || i === extra) continue;
        vSeg[i][k] = false;
        if (i > 0 && i < NI - 1 && rng.chance(0.7)) {
          stairs.push({ x0: vLines[i].s, x1: vLines[i].s + vLines[i].w, z0: hLines[k].s + hLines[k].w, z1: hLines[k + 1].s });
        }
      }
    }
  } else if (P.removeSegmentChance > 0) {
    for (let k = 1; k < NK - 1; k++)
      for (let i = 0; i < NI - 1; i++) {
        if (!rng.chance(P.removeSegmentChance)) continue;
        if (merged[i][k - 1] || merged[i][k]) continue;
        hSeg[k][i] = false;
        if (!connected()) hSeg[k][i] = true;
        else merged[i][k - 1] = merged[i][k] = true;
      }
    for (let i = 1; i < NI - 1; i++)
      for (let k = 0; k < NK - 1; k++) {
        if (!rng.chance(P.removeSegmentChance)) continue;
        if (merged[i - 1][k] || merged[i][k]) continue;
        vSeg[i][k] = false;
        if (!connected()) vSeg[i][k] = true;
        else merged[i - 1][k] = merged[i][k] = true;
      }
  }

  // carve roads
  const segments: RoadSegment[] = [];
  for (let k = 0; k < NK; k++)
    for (let i = 0; i < NI - 1; i++) {
      if (!hSeg[k][i]) continue;
      const r: RoadSegment = {
        x0: vLines[i].s,
        x1: vLines[i + 1].s + vLines[i + 1].w,
        z0: hLines[k].s,
        z1: hLines[k].s + hLines[k].w,
        axis: 'x',
        width: hLines[k].w,
        kind: P.water && k === NK - 1 ? 'quay' : 'road',
      };
      segments.push(r);
    }
  for (let i = 0; i < NI; i++)
    for (let k = 0; k < NK - 1; k++) {
      if (!vSeg[i][k]) continue;
      segments.push({
        x0: vLines[i].s,
        x1: vLines[i].s + vLines[i].w,
        z0: hLines[k].s,
        z1: hLines[k + 1].s + hLines[k + 1].w,
        axis: 'z',
        width: vLines[i].w,
        kind: 'road',
      });
    }
  for (const s of segments) setRect(s, s.kind === 'quay' ? Cell.QUAY : Cell.ROAD);
  for (const s of stairs) setRect(s, Cell.STAIRS);

  // lots (rectangles of building land)
  const lots: Rect[] = [];
  const usedBlock: boolean[][] = merged.map((r) => r.map(() => false));
  for (let i = 0; i < NI - 1; i++)
    for (let k = 0; k < NK - 1; k++) {
      if (usedBlock[i][k]) continue;
      const lot: Rect = { x0: vLines[i].s + vLines[i].w, x1: vLines[i + 1].s, z0: hLines[k].s + hLines[k].w, z1: hLines[k + 1].s };
      usedBlock[i][k] = true;
      if (i + 1 < NI - 1 && !vSeg[i + 1][k] && !usedBlock[i + 1][k] && !P.hill) {
        lot.x1 = vLines[i + 2].s;
        usedBlock[i + 1][k] = true;
      } else if (k + 1 < NK - 1 && !hSeg[k + 1][i] && !usedBlock[i][k + 1]) {
        lot.z1 = hLines[k + 2].s;
        usedBlock[i][k + 1] = true;
      }
      lots.push(lot);
    }
  // hill: stairs split lots — cut lots by stairs rects
  const finalLots: Rect[] = [];
  for (const lot of lots) {
    let parts: Rect[] = [lot];
    for (const st of stairs) {
      const next: Rect[] = [];
      for (const p of parts) {
        if (st.x1 <= p.x0 || st.x0 >= p.x1 || st.z1 <= p.z0 || st.z0 >= p.z1) {
          next.push(p);
          continue;
        }
        if (st.x0 > p.x0) next.push({ ...p, x1: st.x0 });
        if (st.x1 < p.x1) next.push({ ...p, x0: st.x1 });
      }
      parts = next;
    }
    finalLots.push(...parts);
  }

  // vicoli: split some large lots with a 2-cell alley
  const lots2: Rect[] = [];
  for (const lot of finalLots) {
    const w = lot.x1 - lot.x0;
    const d = lot.z1 - lot.z0;
    if (P.alleyChance > 0 && rng.chance(P.alleyChance) && Math.max(w, d) >= 12) {
      if (w >= d) {
        const ax = lot.x0 + Math.floor(w / 2) - 1 + rng.int(-1, 1);
        const seg: RoadSegment = { x0: ax, x1: ax + 2, z0: lot.z0, z1: lot.z1, axis: 'z', width: 2, kind: 'alley' };
        segments.push(seg);
        setRect(seg, Cell.ROAD);
        lots2.push({ ...lot, x1: ax }, { ...lot, x0: ax + 2 });
      } else {
        const az = lot.z0 + Math.floor(d / 2) - 1 + rng.int(-1, 1);
        const seg: RoadSegment = { x0: lot.x0, x1: lot.x1, z0: az, z1: az + 2, axis: 'x', width: 2, kind: 'alley' };
        segments.push(seg);
        setRect(seg, Cell.ROAD);
        lots2.push({ ...lot, z1: az }, { ...lot, z0: az + 2 });
      }
    } else lots2.push(lot);
  }

  // plazas: pick interior lots
  const plazas: Plaza[] = [];
  const interior = lots2
    .map((l, idx) => ({ l, idx }))
    .filter(({ l }) => l.x0 > margin + 2 && l.z0 > margin + 2 && l.x1 < cols - margin - 2 && l.z1 < cityRows - margin - 6 && l.x1 - l.x0 >= 8 && l.z1 - l.z0 >= 8 && l.x1 - l.x0 <= 16 && l.z1 - l.z0 <= 16);
  rng.shuffle(interior);
  const plazaIdx = new Set<number>();
  for (const { l, idx } of interior) {
    if (plazas.length >= P.plazaCount) break;
    // avoid adjacent plazas
    if (plazas.some((p) => Math.abs((p.x0 + p.x1) / 2 - (l.x0 + l.x1) / 2) + Math.abs((p.z0 + p.z1) / 2 - (l.z0 + l.z1) / 2) < 22)) continue;
    plazaIdx.add(idx);
    const fx = Math.floor((l.x0 + l.x1) / 2) - 1;
    const fz = Math.floor((l.z0 + l.z1) / 2) - 1;
    const fountain = P.hill ? null : { x0: fx, x1: fx + 2, z0: fz, z1: fz + 2 };
    plazas.push({ ...l, fountain });
    setRect(l, Cell.PLAZA);
    if (fountain) setRect(fountain, Cell.FOUNTAIN);
  }

  // sea + piers
  let waterLine = -1;
  if (P.water) {
    setRect({ x0: 0, x1: cols, z0: cityRows, z1: rows }, Cell.WATER);
    waterLine = cityRows * CELL;
    const piers = 3;
    for (let p = 0; p < piers; p++) {
      const px = Math.floor(((p + 0.5) / piers) * (cols - 12)) + 6 + rng.int(-3, 3);
      setRect({ x0: px, x1: px + 3, z0: cityRows, z1: cityRows + 7 }, Cell.QUAY);
    }
  }

  // buildings
  const buildings: Building[] = [];
  const addBuildingsInLot = (lot: Rect) => {
    const inner: Rect = { x0: lot.x0 + 1, x1: lot.x1 - 1, z0: lot.z0 + 1, z1: lot.z1 - 1 };
    // sidewalk ring
    for (let z = lot.z0; z < lot.z1; z++)
      for (let x = lot.x0; x < lot.x1; x++) {
        const inside = x >= inner.x0 && x < inner.x1 && z >= inner.z0 && z < inner.z1;
        if (!inside) cells[z * cols + x] = Cell.SIDEWALK;
      }
    const w = inner.x1 - inner.x0;
    const d = inner.z1 - inner.z0;
    if (w < 3 || d < 3) {
      setRect(inner, Cell.GARDEN);
      return;
    }
    const splitRows = d >= 9 ? 2 : 1;
    const rowCuts: number[] = [inner.z0];
    if (splitRows === 2) rowCuts.push(inner.z0 + Math.floor(d / 2) + rng.int(-1, 1));
    rowCuts.push(inner.z1);
    for (let r = 0; r < rowCuts.length - 1; r++) {
      const z0 = rowCuts[r];
      const z1 = rowCuts[r + 1];
      let x = inner.x0;
      while (x < inner.x1) {
        let bw = rng.int(3, 5);
        if (inner.x1 - (x + bw) < 3) bw = inner.x1 - x;
        const b: Rect = { x0: x, x1: x + bw, z0, z1 };
        x += bw;
        // exterior sides
        const sides: number[] = [];
        if (b.z0 === inner.z0) sides.push(0);
        if (b.x1 === inner.x1) sides.push(1);
        if (b.z1 === inner.z1) sides.push(2);
        if (b.x0 === inner.x0) sides.push(3);
        if (!sides.length) continue;
        // prefer long faces (sides 0/2) for doors
        const pref = sides.filter((s) => s === 0 || s === 2);
        const doorSide = pref.length ? rng.pick(pref) : rng.pick(sides);
        const cxm = ((b.x0 + b.x1) / 2) * CELL;
        const czm = ((b.z0 + b.z1) / 2) * CELL;
        let doorX = cxm;
        let doorZ = czm;
        if (doorSide === 0) doorZ = b.z0 * CELL;
        if (doorSide === 2) doorZ = b.z1 * CELL;
        if (doorSide === 1) doorX = b.x1 * CELL;
        if (doorSide === 3) doorX = b.x0 * CELL;
        if (doorSide === 0 || doorSide === 2) doorX = (Math.floor((b.x0 + b.x1) / 2) + ((b.x1 - b.x0) % 2 ? 0.5 : 0)) * CELL;
        else doorZ = (Math.floor((b.z0 + b.z1) / 2) + ((b.z1 - b.z0) % 2 ? 0.5 : 0)) * CELL;
        const floors = rng.int(P.floorsMin, P.floorsMax);
        buildings.push({
          x0: b.x0,
          x1: b.x1,
          z0: b.z0,
          z1: b.z1,
          floors,
          color: rng.int(0, 7),
          roof: P.id === 'porto' && rng.chance(0.4) ? 'flat' : rng.chance(0.55) ? 'gable' : 'hip',
          doorSide,
          doorX,
          doorZ,
          baseY: 0,
        });
      }
    }
  };
  lots2.forEach((l, idx) => {
    if (!plazaIdx.has(idx)) addBuildingsInLot(l);
  });

  // edge buildings framing the map (margin ring), facing inward
  const edgeStrip = (r: Rect, side: number) => {
    const alongX = side === 0 || side === 2;
    let p = alongX ? r.x0 : r.z0;
    const end = alongX ? r.x1 : r.z1;
    while (p < end) {
      let len = rng.int(4, 6);
      if (end - (p + len) < 3) len = end - p;
      const b = alongX ? { x0: p, x1: p + len, z0: r.z0, z1: r.z1 } : { x0: r.x0, x1: r.x1, z0: p, z1: p + len };
      p += len;
      buildings.push({
        ...b,
        floors: rng.int(Math.max(2, P.floorsMin), P.floorsMax + 1),
        color: rng.int(0, 7),
        roof: rng.chance(0.5) ? 'gable' : 'hip',
        doorSide: side,
        doorX: ((b.x0 + b.x1) / 2) * CELL,
        doorZ: ((b.z0 + b.z1) / 2) * CELL,
        baseY: 0,
        edge: true,
      });
    }
  };
  const m = margin;
  edgeStrip({ x0: 0, x1: cols, z0: 0, z1: m }, 2);
  if (!P.water) edgeStrip({ x0: 0, x1: cols, z0: rows - m, z1: rows }, 0);
  edgeStrip({ x0: 0, x1: m, z0: m, z1: P.water ? cityRows : rows - m }, 1);
  edgeStrip({ x0: cols - m, x1: cols, z0: m, z1: P.water ? cityRows : rows - m }, 3);
  // any building cell not covered by a building becomes a garden (terraces, cypresses)
  const covered = new Uint8Array(cols * rows);
  for (const b of buildings) for (let z = b.z0; z < b.z1; z++) for (let x = b.x0; x < b.x1; x++) covered[z * cols + x] = 1;
  for (let i = 0; i < cells.length; i++) if (cells[i] === Cell.BUILDING && !covered[i]) cells[i] = Cell.GARDEN;

  // bumps & ramps
  const bumps: Bump[] = [];
  const roadSegs = segments.filter((s) => s.kind === 'road');
  for (const s of roadSegs) {
    const len = s.axis === 'x' ? s.x1 - s.x0 : s.z1 - s.z0;
    if (len < 12 || !rng.chance(P.bumpsPerSegment * (len / 12))) continue;
    const t = rng.range(0.3, 0.7);
    bumps.push({
      x: s.axis === 'x' ? (s.x0 + len * t) * CELL : ((s.x0 + s.x1) / 2) * CELL,
      z: s.axis === 'z' ? (s.z0 + len * t) * CELL : ((s.z0 + s.z1) / 2) * CELL,
      axis: s.axis,
      kind: 'bump',
      dir: 1,
    });
  }
  if (P.ramps > 0) {
    const longs = roadSegs.filter((s) => s.axis === 'x' && s.x1 - s.x0 >= 16 && s.z0 > margin + 1);
    rng.shuffle(longs);
    for (let r = 0; r < Math.min(P.ramps, longs.length); r++) {
      const s = longs[r];
      bumps.push({ x: ((s.x0 + s.x1) / 2) * CELL, z: ((s.z0 + s.z1) / 2) * CELL, axis: 'x', kind: 'ramp', dir: rng.chance(0.5) ? 1 : -1 });
    }
  }

  // heights
  const hw = (cols * CELL) / HEIGHT_RES + 1;
  const hh = (rows * CELL) / HEIGHT_RES + 1;
  const heights = new Float32Array(hw * hh);
  const typeAt = (x: number, z: number) => {
    const cx = Math.min(cols - 1, Math.max(0, Math.floor(x / CELL)));
    const cz = Math.min(rows - 1, Math.max(0, Math.floor(z / CELL)));
    return cells[cz * cols + cx];
  };
  const localH = (t: number) => (t === Cell.SIDEWALK || t === Cell.GARDEN ? 0.1 : t === Cell.WATER ? -2.2 : t === Cell.BUILDING ? 0.1 : 0);
  for (let j = 0; j < hh; j++)
    for (let i = 0; i < hw; i++) {
      const x = i * HEIGHT_RES;
      const z = j * HEIGHT_RES;
      let h = 0;
      h += localH(typeAt(x - 0.25, z - 0.25));
      h += localH(typeAt(x + 0.25, z - 0.25));
      h += localH(typeAt(x - 0.25, z + 0.25));
      h += localH(typeAt(x + 0.25, z + 0.25));
      h *= 0.25;
      if (P.hill) {
        const st = typeAt(x, z) === Cell.STAIRS;
        const base = terraceHeight(z, hLines);
        h += st ? Math.round(base / 0.32) * 0.32 : base;
      }
      heights[j * hw + i] = h;
    }
  // bump profiles
  for (const b of bumps) {
    const seg = segments.find((s) => b.x >= s.x0 * CELL && b.x <= s.x1 * CELL && b.z >= s.z0 * CELL && b.z <= s.z1 * CELL);
    if (!seg) continue;
    for (let j = 0; j < hh; j++)
      for (let i = 0; i < hw; i++) {
        const x = i * HEIGHT_RES;
        const z = j * HEIGHT_RES;
        if (x < seg.x0 * CELL || x > seg.x1 * CELL || z < seg.z0 * CELL || z > seg.z1 * CELL) continue;
        const along = (b.axis === 'x' ? x - b.x : z - b.z) * b.dir;
        let add = 0;
        if (b.kind === 'bump') {
          if (Math.abs(along) < 1.01) add = 0.11 * (1 - Math.abs(along));
        } else {
          // ramp: rise over 5 m to 0.8 m, plateau 2 m, steep drop over 1 m
          if (along >= -5 && along < 0) add = 0.8 * ((along + 5) / 5);
          else if (along >= 0 && along <= 2) add = 0.8;
          else if (along > 2 && along <= 3) add = 0.8 * (1 - (along - 2));
        }
        heights[j * hw + i] += add;
      }
  }

  const sampleH = (x: number, z: number) => {
    const i = Math.min(hw - 1, Math.max(0, Math.round(x / HEIGHT_RES)));
    const j = Math.min(hh - 1, Math.max(0, Math.round(z / HEIGHT_RES)));
    return heights[j * hw + i];
  };
  for (const b of buildings) {
    let mn = Infinity;
    for (let z = b.z0; z <= b.z1; z++) for (let x = b.x0; x <= b.x1; x++) mn = Math.min(mn, sampleH(x * CELL, z * CELL));
    b.baseY = mn - 0.3;
  }

  // addresses
  const candidates: Address[] = [];
  buildings.forEach((b, bi) => {
    if (b.edge) return;
    const nx = b.doorSide === 1 ? 1 : b.doorSide === 3 ? -1 : 0;
    const nz = b.doorSide === 2 ? 1 : b.doorSide === 0 ? -1 : 0;
    const x = b.doorX + nx * 1.6;
    const z = b.doorZ + nz * 1.6;
    const t = typeAt(x, z);
    if (t !== Cell.SIDEWALK) return;
    // the cell beyond must be road-ish so the circle is reachable from the street
    const t2 = typeAt(x + nx * 2, z + nz * 2);
    if (t2 !== Cell.ROAD && t2 !== Cell.PLAZA && t2 !== Cell.QUAY && t2 !== Cell.SIDEWALK) return;
    candidates.push({ building: bi, x, z, doorX: b.doorX, doorZ: b.doorZ, nx, nz });
  });

  // pizzeria
  const target = P.water
    ? { x: (cols * CELL) / 2, z: (cityRows - 8) * CELL }
    : P.hill
      ? { x: (cols * CELL) / 2, z: (rows - margin - 4) * CELL }
      : { x: (cols * CELL) / 2, z: (rows * CELL) / 2 };
  let best = candidates[0];
  let bestD = Infinity;
  for (const c of candidates) {
    const t2 = typeAt(c.x + c.nx * 2, c.z + c.nz * 2);
    if (t2 !== Cell.ROAD) continue;
    const d = Math.hypot(c.x - target.x, c.z - target.z);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  buildings[best.building].special = 'pizzeria';
  buildings[best.building].floors = Math.max(2, buildings[best.building].floors);
  const pz = { x: best.x + best.nx * 3.2, z: best.z + best.nz * 3.2 };
  // heading along the road (perpendicular to door normal)
  const heading = best.nx !== 0 ? 0 : Math.PI / 2;
  const pizzeria = { building: best.building, x: pz.x, z: pz.z, heading };
  const finalCandidates = candidates.filter((c) => c.building !== best.building);

  // traffic graph
  const nodes: [number, number][] = [];
  const nodeId = new Map<number, number>();
  const nid = (i: number, k: number) => {
    const key = k * NI + i;
    let id = nodeId.get(key);
    if (id === undefined) {
      id = nodes.length;
      nodeId.set(key, id);
      nodes.push([(vLines[i].s + vLines[i].w / 2) * CELL, (hLines[k].s + hLines[k].w / 2) * CELL]);
    }
    return id;
  };
  const edges: [number, number][] = [];
  for (let k = 0; k < NK; k++) for (let i = 0; i < NI - 1; i++) if (hSeg[k][i]) edges.push([nid(i, k), nid(i + 1, k)]);
  for (let i = 0; i < NI; i++) for (let k = 0; k < NK - 1; k++) if (vSeg[i][k]) edges.push([nid(i, k), nid(i, k + 1)]);

  return {
    district,
    seed,
    cols,
    rows,
    cells,
    hw,
    hh,
    heights,
    segments,
    buildings,
    plazas,
    bumps,
    stairs,
    candidates: finalCandidates,
    pizzeria,
    nodes,
    edges,
    waterLine,
    cobbleAmp: P.cobbleAmp,
  };
}

/** Bilinear ground height (without cobble micro-noise). */
export function groundHeight(map: MapData, x: number, z: number): number {
  const fx = Math.min(map.hw - 1.001, Math.max(0, x / HEIGHT_RES));
  const fz = Math.min(map.hh - 1.001, Math.max(0, z / HEIGHT_RES));
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const tx = fx - i;
  const tz = fz - j;
  const h = map.heights;
  const w = map.hw;
  const a = h[j * w + i];
  const b = h[j * w + i + 1];
  const c = h[(j + 1) * w + i];
  const d = h[(j + 1) * w + i + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

/** Split N pizzas into K stops with 1..3 each. */
export function splitPizzas(rng: Rng, n: number, k: number): number[] {
  const counts = new Array(k).fill(1);
  let rem = n - k;
  let guard = 0;
  while (rem > 0 && guard++ < 1000) {
    const i = rng.int(0, k - 1);
    if (counts[i] < 3) {
      counts[i]++;
      rem--;
    }
  }
  return counts;
}

export interface TourInfo {
  length: number;
  order: number[];
  cells: number[]; // concatenated route cells
}

export function computeTour(map: MapData, grid: PathGrid, stops: { x: number; z: number }[]): TourInfo {
  const pts = [{ x: map.pizzeria.x, z: map.pizzeria.z }, ...stops];
  const idx = pts.map((p) => grid.nearestPassable(grid.cellOf(p.x, p.z)));
  const dist: number[][] = pts.map(() => pts.map(() => 0));
  for (let a = 0; a < pts.length; a++)
    for (let b = a + 1; b < pts.length; b++) {
      const d = grid.astar(idx[a], idx[b]);
      dist[a][b] = dist[b][a] = d;
    }
  const { length, order } = bestTour(dist);
  const cells: number[] = [];
  if (length < Infinity) {
    let prev = 0;
    const tmp: number[] = [];
    for (const o of order) {
      grid.astar(idx[prev], idx[o], tmp);
      if (cells.length) tmp.shift();
      cells.push(...tmp);
      prev = o;
    }
  }
  return { length, order, cells };
}

function buildTraffic(map: MapData, rng: Rng, count: number): TrafficPath[] {
  const paths: TrafficPath[] = [];
  const adj = new Map<number, Set<number>>();
  for (const [a, b] of map.edges) {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  }
  const has = (a: number, b: number) => adj.get(a)?.has(b) ?? false;
  // find rectangles: walk from node going +x then +z then -x then -z
  const byPos = new Map<string, number>();
  map.nodes.forEach((p, i) => byPos.set(`${p[0]},${p[1]}`, i));
  const xs = [...new Set(map.nodes.map((n) => n[0]))].sort((a, b) => a - b);
  const zs = [...new Set(map.nodes.map((n) => n[1]))].sort((a, b) => a - b);
  const node = (xi: number, zi: number) => byPos.get(`${xs[xi]},${zs[zi]}`);
  const lineOk = (a: [number, number], b: [number, number]) => {
    // all consecutive nodes between a and b (grid indices) connected
    const [ax, az] = a;
    const [bx, bz] = b;
    const steps = Math.abs(bx - ax) + Math.abs(bz - az);
    const sx = Math.sign(bx - ax);
    const sz = Math.sign(bz - az);
    for (let s = 0; s < steps; s++) {
      const n1 = node(ax + sx * s, az + sz * s);
      const n2 = node(ax + sx * (s + 1), az + sz * (s + 1));
      if (n1 === undefined || n2 === undefined || !has(n1, n2)) return false;
    }
    return true;
  };
  const rects: [number, number, number, number][] = [];
  for (let xi = 0; xi < xs.length; xi++)
    for (let zi = 0; zi < zs.length; zi++)
      for (let dx = 1; dx <= 3; dx++)
        for (let dz = 1; dz <= 3; dz++) {
          const x2 = xi + dx;
          const z2 = zi + dz;
          if (x2 >= xs.length || z2 >= zs.length) continue;
          if (
            lineOk([xi, zi], [x2, zi]) &&
            lineOk([x2, zi], [x2, z2]) &&
            lineOk([x2, z2], [xi, z2]) &&
            lineOk([xi, z2], [xi, zi])
          )
            rects.push([xi, zi, x2, z2]);
        }
  if (!rects.length) return paths;
  for (let c = 0; c < count; c++) {
    const [x0, z0, x1, z1] = rng.pick(rects);
    const cw = rng.chance(0.5);
    let corners: [number, number][] = [
      [xs[x0], zs[z0]],
      [xs[x1], zs[z0]],
      [xs[x1], zs[z1]],
      [xs[x0], zs[z1]],
    ];
    if (!cw) corners = corners.reverse();
    // full polyline including intermediate intersections (cars pause there)
    const poly: [number, number][] = [];
    for (let i = 0; i < 4; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % 4];
      const isX = a[1] === b[1];
      const list = (isX ? xs : zs).filter((v) => (isX ? v > Math.min(a[0], b[0]) && v < Math.max(a[0], b[0]) : v > Math.min(a[1], b[1]) && v < Math.max(a[1], b[1])));
      if ((isX ? b[0] : b[1]) < (isX ? a[0] : a[1])) list.reverse();
      poly.push(a);
      for (const v of list) poly.push(isX ? [v, a[1]] : [a[0], v]);
    }
    // lane offset to the right of travel
    const off = 1.1;
    const n = poly.length;
    const pts: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const p = poly[i];
      const prev = poly[(i - 1 + n) % n];
      const next = poly[(i + 1) % n];
      const d1 = norm(p[0] - prev[0], p[1] - prev[1]);
      const d2 = norm(next[0] - p[0], next[1] - p[1]);
      const r1 = [-d1[1], d1[0]];
      const r2 = [-d2[1], d2[0]];
      // corner: combine both offsets (exact for 90 degree turns, same for straight)
      const straight = Math.abs(d1[0] * d2[0] + d1[1] * d2[1]) > 0.99;
      if (straight) pts.push([p[0] + r1[0] * off, p[1] + r1[1] * off]);
      else pts.push([p[0] + (r1[0] + r2[0]) * off, p[1] + (r1[1] + r2[1]) * off]);
    }
    paths.push({ points: pts, vehicle: rng.chance(0.3) ? 'ape' : 'car' });
  }
  return paths;
}

function norm(x: number, z: number): [number, number] {
  const l = Math.hypot(x, z) || 1;
  return [x / l, z / l];
}

/** Build a full level (map + stops + traffic) from a spec. Deterministic. */
export function generateLevel(spec: LevelSpec, mapCache?: MapData): LevelData {
  const map = mapCache ?? generateMap(spec.district, spec.seed);
  const rng = new Rng(hashSeed(spec.seed, 202 + spec.turn));
  const grid = new PathGrid(map);
  const counts = splitPizzas(rng, spec.pizzas, spec.stops);
  let chosen: typeof map.candidates = [];
  let fallback: typeof map.candidates = [];
  let fallbackScore = Infinity;
  const pool = map.candidates.filter((c) => Math.hypot(c.x - map.pizzeria.x, c.z - map.pizzeria.z) > 22);
  for (let attempt = 0; attempt < 80 && pool.length >= spec.stops; attempt++) {
    const pick: typeof pool = [];
    const shuffled = rng.shuffle(pool.slice());
    for (const c of shuffled) {
      if (pick.length >= spec.stops) break;
      if (pick.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < 24)) continue;
      pick.push(c);
    }
    if (pick.length < spec.stops) continue;
    const tour = computeTour(map, grid, pick);
    if (tour.length >= spec.minTour && tour.length <= 880) {
      chosen = pick;
      break;
    }
    const score = tour.length < spec.minTour ? spec.minTour - tour.length : tour.length - 880;
    if (score < fallbackScore) {
      fallbackScore = score;
      fallback = pick;
    }
  }
  if (!chosen.length) chosen = fallback;
  const stops: DeliveryStop[] = chosen.map((a, i) => ({ address: a, count: counts[i] }));
  const traffic = buildTraffic(map, rng, spec.cars);
  return { spec, map, stops, traffic };
}
