import * as THREE from 'three';

/**
 * Track geometry toolkit.
 *
 * Every rolling surface is a 2D cross-section ("profile") swept along a path.
 * Paths use the *floor-line* convention: the path point is the lowest point of
 * the channel, and the profile is expressed in (side, up) coordinates relative
 * to it. Every port uses the same standard profile with a horizontal tangent,
 * so neighbouring pieces meet with bit-identical cross-sections and the merged
 * physics trimesh can be welded seam-free.
 */

export type V2 = [number, number];

export const ARC_SEGS = 7;
export const STD_RHO = 1.0;
export const STD_ALPHA = THREE.MathUtils.degToRad(80);
export const TUBE_ALPHA = THREE.MathUtils.degToRad(172);
export const SHELL = 0.12;

export interface ChannelShape {
  rho: number;
  flat: number;
  alpha: number;
}

export const STD_SHAPE: ChannelShape = { rho: STD_RHO, flat: 0, alpha: STD_ALPHA };

/** Rounded U channel: left arc, flat floor (may be zero), right arc. Fixed point count. */
export function channelProfile(shape: ChannelShape): V2[] {
  const pts: V2[] = [];
  const { rho, flat, alpha } = shape;
  const half = flat / 2;
  for (let i = ARC_SEGS; i >= 0; i -= 1) {
    const th = (alpha * i) / ARC_SEGS;
    pts.push([-half - rho * Math.sin(th), rho - rho * Math.cos(th)]);
  }
  for (let i = 0; i <= ARC_SEGS; i += 1) {
    const th = (alpha * i) / ARC_SEGS;
    pts.push([half + rho * Math.sin(th), rho - rho * Math.cos(th)]);
  }
  return pts;
}

/**
 * Two lanes separated by a ridge. d = lane offset, ridge = apex height (0..).
 * At d=0 and ridge=0 this degenerates to the standard channel (plus duplicate points).
 * At d >= rho each lane is exactly a standard channel cross-section.
 */
export function laneProfile(d: number, ridge: number, rho = STD_RHO, alpha = STD_ALPHA): V2[] {
  const pts: V2[] = [];
  const beta = Math.min(alpha, d >= rho ? alpha : Math.asin(Math.min(1, d / rho)));
  // left lane outer arc (top -> bottom)
  for (let i = ARC_SEGS; i >= 0; i -= 1) {
    const th = (alpha * i) / ARC_SEGS;
    pts.push([-d - rho * Math.sin(th), rho - rho * Math.cos(th)]);
  }
  // left lane inner arc (bottom -> beta)
  for (let i = 0; i <= ARC_SEGS; i += 1) {
    const th = (beta * i) / ARC_SEGS;
    pts.push([-d + rho * Math.sin(th), rho - rho * Math.cos(th)]);
  }
  const innerTopY = rho - rho * Math.cos(beta);
  pts.push([0, Math.max(innerTopY, ridge)]);
  for (let i = ARC_SEGS; i >= 0; i -= 1) {
    const th = (beta * i) / ARC_SEGS;
    pts.push([d - rho * Math.sin(th), rho - rho * Math.cos(th)]);
  }
  for (let i = 0; i <= ARC_SEGS; i += 1) {
    const th = (alpha * i) / ARC_SEGS;
    pts.push([d + rho * Math.sin(th), rho - rho * Math.cos(th)]);
  }
  return pts;
}

export interface PathSample {
  p: THREE.Vector3;
  /** Unit tangent */
  t: THREE.Vector3;
  /** Unit side (profile +x) */
  s: THREE.Vector3;
  /** Unit up (profile +y) */
  u: THREE.Vector3;
  /** Normalised parameter 0..1 */
  f: number;
  /** Arc length from start */
  len: number;
}

const _tmp = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

export const smooth = (x: number): number => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};
export const smoother = (x: number): number => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * c * (c * (c * 6 - 15) + 10);
};
export const window01 = (x: number, a: number, b: number): number => smooth((x - a) / Math.max(1e-6, b - a));

/**
 * Shear framing: side stays horizontal, up stays world-up (optionally banked).
 * Valid when the path never gets close to vertical. Cross-sections are vertical
 * slices, which is what keeps sloped piece junctions exactly aligned.
 */
export function frameShear(points: THREE.Vector3[], bank?: (f: number) => number): PathSample[] {
  const out: PathSample[] = [];
  let len = 0;
  for (let i = 0; i < points.length; i += 1) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const t = new THREE.Vector3().subVectors(next, prev).normalize();
    const horiz = new THREE.Vector3(t.x, 0, t.z).normalize();
    const s = new THREE.Vector3().crossVectors(horiz, WORLD_UP).normalize();
    const u = WORLD_UP.clone();
    const f = i / (points.length - 1);
    const b = bank ? bank(f) : 0;
    if (b !== 0) {
      s.applyAxisAngle(horiz, b);
      u.applyAxisAngle(horiz, b);
    }
    if (i > 0) len += points[i].distanceTo(points[i - 1]);
    out.push({ p: points[i].clone(), t, s, u, f, len });
  }
  return out;
}

/** Rotation-minimising frames with the end twist distributed so the exit frame is upright. */
export function frameTransport(points: THREE.Vector3[], endUp = WORLD_UP): PathSample[] {
  const n = points.length;
  const tangents: THREE.Vector3[] = [];
  for (let i = 0; i < n; i += 1) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(n - 1, i + 1)];
    tangents.push(new THREE.Vector3().subVectors(next, prev).normalize());
  }
  const ups: THREE.Vector3[] = [];
  let up = WORLD_UP.clone();
  up.sub(_tmp.copy(tangents[0]).multiplyScalar(up.dot(tangents[0]))).normalize();
  ups.push(up.clone());
  for (let i = 1; i < n; i += 1) {
    // double reflection method
    const v1 = new THREE.Vector3().subVectors(points[i], points[i - 1]);
    const c1 = v1.dot(v1);
    if (c1 < 1e-12) {
      ups.push(up.clone());
      continue;
    }
    const rL = up.clone().sub(v1.clone().multiplyScalar((2 / c1) * v1.dot(up)));
    const tL = tangents[i - 1].clone().sub(v1.clone().multiplyScalar((2 / c1) * v1.dot(tangents[i - 1])));
    const v2 = new THREE.Vector3().subVectors(tangents[i], tL);
    const c2 = v2.dot(v2);
    up = c2 < 1e-12 ? rL : rL.sub(v2.multiplyScalar((2 / c2) * v2.dot(rL)));
    up.normalize();
    ups.push(up.clone());
  }
  // twist correction
  const tEnd = tangents[n - 1];
  const target = endUp.clone().sub(tEnd.clone().multiplyScalar(endUp.dot(tEnd))).normalize();
  const cur = ups[n - 1];
  let angle = Math.acos(THREE.MathUtils.clamp(cur.dot(target), -1, 1));
  if (_tmp.crossVectors(cur, target).dot(tEnd) < 0) angle = -angle;
  const out: PathSample[] = [];
  let len = 0;
  for (let i = 0; i < n; i += 1) {
    const f = i / (n - 1);
    const u = ups[i].clone().applyAxisAngle(tangents[i], angle * f).normalize();
    const s = new THREE.Vector3().crossVectors(tangents[i], u).normalize();
    if (i > 0) len += points[i].distanceTo(points[i - 1]);
    out.push({ p: points[i].clone(), t: tangents[i], s, u, f, len });
  }
  return out;
}

/** Turtle path builder: lines, yaw arcs and pitch arcs with exact frames. */
export class Turtle {
  pos = new THREE.Vector3();
  fwd = new THREE.Vector3(1, 0, 0);
  up = new THREE.Vector3(0, 1, 0);
  readonly pts: THREE.Vector3[] = [];
  readonly ups: THREE.Vector3[] = [];
  private step: number;

  constructor(step = 0.25) {
    this.step = step;
    this.push();
  }

  private push(): void {
    this.pts.push(this.pos.clone());
    this.ups.push(this.up.clone());
  }

  line(length: number): this {
    const n = Math.max(1, Math.ceil(length / this.step));
    for (let i = 0; i < n; i += 1) {
      this.pos.addScaledVector(this.fwd, length / n);
      this.push();
    }
    return this;
  }

  /** Turn around the up axis. Positive angle turns toward +side (right). */
  yaw(radius: number, angle: number): this {
    const n = Math.max(2, Math.ceil((Math.abs(angle) * radius) / this.step));
    const side = new THREE.Vector3().crossVectors(this.fwd, this.up).normalize();
    const dir = Math.sign(angle);
    const center = this.pos.clone().addScaledVector(side, radius * dir);
    const start = this.pos.clone().sub(center);
    const startFwd = this.fwd.clone();
    const axis = this.up.clone().multiplyScalar(-dir);
    for (let i = 1; i <= n; i += 1) {
      const a = (Math.abs(angle) * i) / n;
      this.pos.copy(center).add(start.clone().applyAxisAngle(axis, a));
      this.fwd.copy(startFwd).applyAxisAngle(axis, a);
      this.push();
    }
    return this;
  }

  /** Turn around the side axis. Positive angle pitches toward up. */
  pitch(radius: number, angle: number): this {
    const n = Math.max(2, Math.ceil((Math.abs(angle) * radius) / this.step));
    const side = new THREE.Vector3().crossVectors(this.fwd, this.up).normalize();
    const dir = Math.sign(angle);
    const center = this.pos.clone().addScaledVector(this.up, radius * dir);
    const start = this.pos.clone().sub(center);
    const startFwd = this.fwd.clone();
    const startUp = this.up.clone();
    const axis = side.clone().multiplyScalar(dir);
    for (let i = 1; i <= n; i += 1) {
      const a = (Math.abs(angle) * i) / n;
      this.pos.copy(center).add(start.clone().applyAxisAngle(axis, a));
      this.fwd.copy(startFwd).applyAxisAngle(axis, a);
      this.up.copy(startUp).applyAxisAngle(axis, a);
      this.push();
    }
    return this;
  }
}

/** Resample a dense polyline to n evenly spaced points. */
export function resample(points: THREE.Vector3[], n: number): THREE.Vector3[] {
  const cum = [0];
  for (let i = 1; i < points.length; i += 1) cum.push(cum[i - 1] + points[i].distanceTo(points[i - 1]));
  const total = cum[cum.length - 1];
  const out: THREE.Vector3[] = [];
  let j = 0;
  for (let i = 0; i < n; i += 1) {
    const d = (total * i) / (n - 1);
    while (j < cum.length - 2 && cum[j + 1] < d) j += 1;
    const seg = cum[j + 1] - cum[j];
    const a = seg > 1e-9 ? (d - cum[j]) / seg : 0;
    out.push(new THREE.Vector3().lerpVectors(points[j], points[j + 1], a));
  }
  out[0].copy(points[0]);
  out[n - 1].copy(points[points.length - 1]);
  return out;
}

export function polylineLength(points: THREE.Vector3[]): number {
  let l = 0;
  for (let i = 1; i < points.length; i += 1) l += points[i].distanceTo(points[i - 1]);
  return l;
}

/** Sample a parametric function into a polyline. */
export function sampleFn(fn: (f: number) => THREE.Vector3, n: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < n; i += 1) pts.push(fn(i / (n - 1)));
  return pts;
}

export interface SurfaceData {
  positions: number[];
  indices: number[];
}

/** Sweep a profile (open polyline) along framed samples → inner rolling surface. */
export function sweepSurface(frames: PathSample[], profileAt: (f: number) => V2[]): SurfaceData {
  const positions: number[] = [];
  const indices: number[] = [];
  let cols = 0;
  for (const fr of frames) {
    const prof = profileAt(fr.f);
    cols = prof.length;
    for (const [x, y] of prof) {
      positions.push(fr.p.x + fr.s.x * x + fr.u.x * y, fr.p.y + fr.s.y * x + fr.u.y * y, fr.p.z + fr.s.z * x + fr.u.z * y);
    }
  }
  for (let j = 0; j < frames.length - 1; j += 1) {
    for (let i = 0; i < cols - 1; i += 1) {
      const a = j * cols + i;
      const b = j * cols + i + 1;
      const c = (j + 1) * cols + i + 1;
      const d = (j + 1) * cols + i;
      indices.push(a, b, c, a, c, d);
    }
  }
  return { positions, indices };
}

/** Outward offset of a profile polyline (away from the channel interior). */
export function offsetProfile(prof: V2[], amount: number): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < prof.length; i += 1) {
    let nx = 0;
    let ny = 0;
    const add = (a: V2, b: V2): void => {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const l = Math.hypot(dx, dy);
      if (l < 1e-6) return;
      nx += dy / l;
      ny += -dx / l;
    };
    if (i > 0) add(prof[i - 1], prof[i]);
    if (i < prof.length - 1) add(prof[i], prof[i + 1]);
    if (nx === 0 && ny === 0) {
      // degenerate run: search neighbours
      for (let k = 1; k < prof.length && nx === 0 && ny === 0; k += 1) {
        if (i + k < prof.length) add(prof[i], prof[i + k]);
        if (nx === 0 && ny === 0 && i - k >= 0) add(prof[i - k], prof[i]);
      }
    }
    const l = Math.hypot(nx, ny) || 1;
    out.push([prof[i][0] + (nx / l) * amount, prof[i][1] + (ny / l) * amount]);
  }
  return out;
}

/** Build a solid-looking shell: inner surface (group 0), outer + rims + end rings (group 1). */
export function sweepShell(frames: PathSample[], profileAt: (f: number) => V2[], thickness = SHELL): THREE.BufferGeometry {
  const inner = sweepSurface(frames, profileAt);
  const outer = sweepSurface(frames, (f) => offsetProfile(profileAt(f), thickness));
  const cols = profileAt(0).length;
  const rows = frames.length;
  const positions = [...inner.positions];
  const indices = [...inner.indices];
  const innerCount = indices.length;
  const base = inner.positions.length / 3;
  positions.push(...outer.positions);
  for (let k = 0; k < outer.indices.length; k += 3) {
    indices.push(outer.indices[k] + base, outer.indices[k + 2] + base, outer.indices[k + 1] + base);
  }
  // rims along both profile edges
  const rim = (col: number, flip: boolean): void => {
    const start = positions.length / 3;
    for (let j = 0; j < rows; j += 1) {
      const a = (j * cols + col) * 3;
      positions.push(inner.positions[a], inner.positions[a + 1], inner.positions[a + 2]);
      positions.push(outer.positions[a], outer.positions[a + 1], outer.positions[a + 2]);
    }
    for (let j = 0; j < rows - 1; j += 1) {
      const a = start + j * 2;
      if (flip) indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      else indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  };
  rim(0, false);
  rim(cols - 1, true);
  // end rings
  const ring = (row: number, flip: boolean): void => {
    const start = positions.length / 3;
    for (let i = 0; i < cols; i += 1) {
      const a = (row * cols + i) * 3;
      positions.push(inner.positions[a], inner.positions[a + 1], inner.positions[a + 2]);
      positions.push(outer.positions[a], outer.positions[a + 1], outer.positions[a + 2]);
    }
    for (let i = 0; i < cols - 1; i += 1) {
      const a = start + i * 2;
      if (flip) indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      else indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  };
  ring(0, true);
  ring(rows - 1, false);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.addGroup(0, innerCount, 0);
  geo.addGroup(innerCount, indices.length - innerCount, 1);
  geo.computeVertexNormals();
  return geo;
}

/** Lathe surface (funnel): profile is [r, y] from inside (hole) to outside (rim). Normals face up/in. */
export function latheSurface(center: THREE.Vector3, prof: V2[], segments = 40): SurfaceData {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let j = 0; j <= segments; j += 1) {
    const a = (j / segments) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    for (const [r, y] of prof) positions.push(center.x + r * c, center.y + y, center.z + r * s);
  }
  const cols = prof.length;
  for (let j = 0; j < segments; j += 1) {
    for (let i = 0; i < cols - 1; i += 1) {
      const a = j * cols + i;
      const b = j * cols + i + 1;
      const c = (j + 1) * cols + i + 1;
      const d = (j + 1) * cols + i;
      indices.push(a, c, b, a, d, c);
    }
  }
  return { positions, indices };
}

export function surfaceToGeometry(surface: SurfaceData): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(surface.positions, 3));
  geo.setIndex(surface.indices);
  geo.computeVertexNormals();
  return geo;
}

/** Merge surfaces (positions/indices). */
export function mergeSurfaces(list: SurfaceData[]): SurfaceData {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const s of list) {
    const base = positions.length / 3;
    positions.push(...s.positions);
    for (const i of s.indices) indices.push(i + base);
  }
  return { positions, indices };
}

/** Mirror a surface across local z (and keep winding consistent). */
export function mirrorSurface(s: SurfaceData): SurfaceData {
  const positions = s.positions.slice();
  for (let i = 2; i < positions.length; i += 3) positions[i] = -positions[i];
  const indices: number[] = [];
  for (let i = 0; i < s.indices.length; i += 3) indices.push(s.indices[i], s.indices[i + 2], s.indices[i + 1]);
  return { positions, indices };
}

export function mirrorGeometryZ(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.clone();
  g.applyMatrix4(new THREE.Matrix4().makeScale(1, 1, -1));
  const index = g.getIndex();
  if (index) {
    const arr = index.array as Uint32Array | Uint16Array;
    for (let i = 0; i < arr.length; i += 3) {
      const t = arr[i + 1];
      arr[i + 1] = arr[i + 2];
      arr[i + 2] = t;
    }
    index.needsUpdate = true;
  } else {
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < arr.length; i += 9) {
      for (let k = 0; k < 3; k += 1) {
        const t = arr[i + 3 + k];
        arr[i + 3 + k] = arr[i + 6 + k];
        arr[i + 6 + k] = t;
      }
    }
    pos.needsUpdate = true;
  }
  g.computeVertexNormals();
  return g;
}

/** Profile cap polygon (for closed ends of bins). */
export function profileCap(frame: PathSample, prof: V2[], flip: boolean, thickness = SHELL): THREE.BufferGeometry {
  const top = Math.max(...prof.map((p) => p[1])) + 0.0;
  const positions: number[] = [];
  const pts = offsetProfile(prof, thickness * 0.5);
  const toWorld = (x: number, y: number): number[] => [
    frame.p.x + frame.s.x * x + frame.u.x * y,
    frame.p.y + frame.s.y * x + frame.u.y * y,
    frame.p.z + frame.s.z * x + frame.u.z * y,
  ];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = toWorld(pts[i][0], pts[i][1]);
    const b = toWorld(pts[i + 1][0], pts[i + 1][1]);
    const c = toWorld(pts[i + 1][0], top);
    const d = toWorld(pts[i][0], top);
    if (flip) positions.push(...a, ...c, ...b, ...a, ...d, ...c);
    else positions.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}
