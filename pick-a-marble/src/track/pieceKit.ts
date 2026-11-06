import * as THREE from 'three';
import type { MatTag } from '../scene/Materials';
import {
  channelProfile,
  frameShear,
  frameTransport,
  resample,
  polylineLength,
  sweepShell,
  sweepSurface,
  type ChannelShape,
  type PathSample,
  type SurfaceData,
  type V2,
  STD_SHAPE,
  STD_ALPHA,
  TUBE_ALPHA,
  smooth,
} from './geometry';
import type { LaneDef, PortDef } from './types';

export const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

export const inPort = (x: number, y: number, z: number, fx = -1, fz = 0): PortDef => ({ pos: V(x, y, z), facing: V(fx, 0, fz), kind: 'in' });
export const outPort = (x: number, y: number, z: number, fx = 1, fz = 0): PortDef => ({ pos: V(x, y, z), facing: V(fx, 0, fz), kind: 'out' });

export function tagMesh(geo: THREE.BufferGeometry, tags: MatTag[], color?: string): THREE.Mesh {
  const m = new THREE.Mesh(geo);
  m.userData.mats = tags;
  if (color) m.userData.color = color;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function box(w: number, h: number, d: number, tags: MatTag[], pos: THREE.Vector3, color?: string): THREE.Mesh {
  const m = tagMesh(new THREE.BoxGeometry(w, h, d), tags, color);
  m.position.copy(pos);
  return m;
}

export function cyl(r: number, h: number, tags: MatTag[], pos: THREE.Vector3, color?: string, seg = 16): THREE.Mesh {
  const m = tagMesh(new THREE.CylinderGeometry(r, r, h, seg), tags, color);
  m.position.copy(pos);
  return m;
}

export function sphere(r: number, tags: MatTag[], pos: THREE.Vector3, color?: string): THREE.Mesh {
  const m = tagMesh(new THREE.SphereGeometry(r, 20, 14), tags, color);
  m.position.copy(pos);
  return m;
}

/** Evenly sampled points for a straight run with smooth height change. */
export function straightPoints(len: number, dy: number, step = 0.25, z: (f: number) => number = () => 0, extraY: (f: number) => number = () => 0): THREE.Vector3[] {
  const n = Math.max(3, Math.ceil(len / step) + 1);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < n; i += 1) {
    const f = i / (n - 1);
    pts.push(V(len * f, dy * smooth(f) + extraY(f), z(f)));
  }
  return pts;
}

/** Apply smooth height change to a flat polyline by arc length. */
export function applyDrop(points: THREE.Vector3[], dy: number, step = 0.22): THREE.Vector3[] {
  const n = Math.max(3, Math.ceil(polylineLength(points) / step) + 1);
  const pts = resample(points, n);
  for (let i = 0; i < n; i += 1) pts[i].y += dy * smooth(i / (n - 1));
  return pts;
}

export function framesFromUps(points: THREE.Vector3[], ups: THREE.Vector3[]): PathSample[] {
  const out: PathSample[] = [];
  let len = 0;
  for (let i = 0; i < points.length; i += 1) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const t = new THREE.Vector3().subVectors(next, prev).normalize();
    const s = new THREE.Vector3().crossVectors(t, ups[i]).normalize();
    const u = new THREE.Vector3().crossVectors(s, t).normalize();
    if (i > 0) len += points[i].distanceTo(points[i - 1]);
    out.push({ p: points[i].clone(), t, s, u, f: i / (points.length - 1), len });
  }
  return out;
}

export interface ChannelResult {
  mesh: THREE.Mesh;
  surface: SurfaceData;
  frames: PathSample[];
}

export function channel(frames: PathSample[], shapeAt: (f: number) => ChannelShape = () => STD_SHAPE, tags: MatTag[] = ['floor', 'body']): ChannelResult {
  const profileAt = (f: number): V2[] => channelProfile(shapeAt(f));
  const geo = sweepShell(frames, profileAt);
  return { mesh: tagMesh(geo, tags), surface: sweepSurface(frames, profileAt), frames };
}

export function profiled(frames: PathSample[], profileAt: (f: number) => V2[], tags: MatTag[] = ['floor', 'body']): ChannelResult {
  const geo = sweepShell(frames, profileAt);
  return { mesh: tagMesh(geo, tags), surface: sweepSurface(frames, profileAt), frames };
}

/** Tube morph: open at both ends, closed between a..b. */
export function tubeShape(a: number, b: number, rho = 1): (f: number) => ChannelShape {
  return (f) => {
    const k = Math.min(smooth(f / a), smooth((1 - f) / (1 - b)));
    return { rho: 1 + (rho - 1) * k, flat: 0, alpha: STD_ALPHA + (TUBE_ALPHA - STD_ALPHA) * k };
  };
}

/** Wide trough morph: standard at ends, `flat` wide in the middle window. */
export function wideShape(flat: number, a = 0.2, b = 0.8, rho = 1, alpha = STD_ALPHA): (f: number) => ChannelShape {
  return (f) => {
    const k = Math.min(smooth(f / a), smooth((1 - f) / (1 - b)));
    return { rho: 1 + (rho - 1) * k, flat: flat * k, alpha: STD_ALPHA + (alpha - STD_ALPHA) * k };
  };
}

export function laneFrom(frames: PathSample[], from: number, to: number, offset?: (f: number) => number): LaneDef {
  const pts = frames.map((fr) => {
    const p = fr.p.clone();
    if (offset) p.addScaledVector(fr.s, offset(fr.f));
    return p;
  });
  return { points: pts, from, to };
}

export function lanePts(points: THREE.Vector3[], from: number, to: number): LaneDef {
  return { points, from, to };
}

export const shear = frameShear;
export const transport = frameTransport;

/** Decorative glass-tube rings along frames. */
export function tubeRings(frames: PathSample[], every: number, rho: number, a: number, b: number): THREE.Object3D {
  const g = new THREE.Group();
  const geo = new THREE.TorusGeometry(rho + 0.13, 0.07, 6, 24);
  let next = 0;
  for (const fr of frames) {
    if (fr.f < a || fr.f > b) continue;
    if (fr.len < next) continue;
    next = fr.len + every;
    const m = tagMesh(geo, ['accent']);
    const center = fr.p.clone().addScaledVector(fr.u, rho);
    m.position.copy(center);
    const look = new THREE.Matrix4().makeBasis(fr.s, fr.u, fr.t);
    m.quaternion.setFromRotationMatrix(look);
    g.add(m);
  }
  return g;
}

/** Strip overlay hugging the channel floor (checker line, chevrons). */
export function floorDecal(frames: PathSample[], f0: number, f1: number, halfWidth: number, tags: MatTag[], uvRepeat: [number, number], lift = 0.015, color?: string): THREE.Mesh {
  const sel = frames.filter((fr) => fr.f >= f0 && fr.f <= f1);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const cols = 6;
  sel.forEach((fr, j) => {
    for (let i = 0; i <= cols; i += 1) {
      const x = -halfWidth + (2 * halfWidth * i) / cols;
      const y = 1 - Math.sqrt(Math.max(0, 1 - x * x)) + lift;
      positions.push(fr.p.x + fr.s.x * x + fr.u.x * y, fr.p.y + fr.s.y * x + fr.u.y * y, fr.p.z + fr.s.z * x + fr.u.z * y);
      uvs.push(((fr.f - f0) / (f1 - f0)) * uvRepeat[0], (i / cols) * uvRepeat[1]);
    }
  });
  for (let j = 0; j < sel.length - 1; j += 1)
    for (let i = 0; i < cols; i += 1) {
      const a = j * (cols + 1) + i;
      indices.push(a, a + 1, a + cols + 2, a, a + cols + 2, a + cols + 1);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const m = tagMesh(geo, tags, color);
  m.castShadow = false;
  return m;
}

/** Arch with banner across the track at local x. */
export function arch(x: number, y: number, halfSpan: number, bannerTag: MatTag, lights = false): THREE.Group {
  const g = new THREE.Group();
  const h = 3.2;
  for (const side of [-1, 1]) {
    g.add(cyl(0.14, h, ['white'], V(x, y + h / 2 - 0.3, side * halfSpan)));
    g.add(sphere(0.2, ['accent'], V(x, y + h - 0.2, side * halfSpan)));
  }
  g.add(box(0.12, 0.9, halfSpan * 2, [bannerTag], V(x, y + h - 0.65, 0)));
  if (lights) {
    const colors = ['#ff3b3b', '#ffbe0b', '#2bff88'];
    colors.forEach((c, i) => {
      const bulb = sphere(0.2, ['bulb'], V(x - 0.1, y + h + 0.15, (i - 1) * 0.7), c);
      bulb.name = `bulb${i}`;
      g.add(bulb);
    });
    g.add(box(0.2, 0.5, 2.3, ['dark'], V(x + 0.05, y + h + 0.15, 0)));
  }
  return g;
}

export function group(...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  for (const c of children) g.add(c);
  return g;
}

/** Floor height of a standard straight with smooth drop. */
export const floorY = (x: number, len: number, dy: number): number => dy * smooth(x / len);
