/**
 * Geometry accumulator: appends transformed primitives with per-vertex colours into one
 * non-indexed BufferGeometry. Used for buildings, vehicles, props — merged = few draw calls.
 */
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Matrix3,
  Matrix4,
  Quaternion,
  SphereGeometry,
  Vector3,
  type ColorRepresentation,
} from 'three';

const _m = new Matrix4();
const _n = new Matrix3();
const _v = new Vector3();
const _c = new Color();
const _q = new Quaternion();
const _e = new Euler();
const _s = new Vector3();
const _p = new Vector3();

const cache = new Map<string, BufferGeometry>();
function prim(key: string, make: () => BufferGeometry): BufferGeometry {
  let g = cache.get(key);
  if (!g) {
    g = make();
    if (g.index) g = g.toNonIndexed();
    cache.set(key, g);
  }
  return g;
}

export class GeoBuilder {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  uv: number[] = [];

  /** Append geometry `g` transformed by `m` with a flat colour. */
  add(g: BufferGeometry, m: Matrix4, color: ColorRepresentation, uvScale = 1) {
    _c.set(color);
    _n.getNormalMatrix(m);
    const p = g.attributes.position as BufferAttribute;
    const n = g.attributes.normal as BufferAttribute;
    const u = g.attributes.uv as BufferAttribute | undefined;
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i).applyMatrix4(m);
      this.pos.push(_v.x, _v.y, _v.z);
      _v.fromBufferAttribute(n, i).applyMatrix3(_n).normalize();
      this.nor.push(_v.x, _v.y, _v.z);
      this.col.push(_c.r, _c.g, _c.b);
      if (u) this.uv.push(u.getX(i) * uvScale, u.getY(i) * uvScale);
      else this.uv.push(0, 0);
    }
    return this;
  }

  private mat(x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0) {
    _e.set(rx, ry, rz, 'YXZ');
    _q.setFromEuler(_e);
    _p.set(x, y, z);
    _s.set(sx, sy, sz);
    return _m.compose(_p, _q, _s);
  }

  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: ColorRepresentation, ry = 0, rx = 0, rz = 0) {
    return this.add(prim('box', () => new BoxGeometry(1, 1, 1)), this.mat(x, y, z, sx, sy, sz, rx, ry, rz), color);
  }
  cyl(x: number, y: number, z: number, r: number, h: number, color: ColorRepresentation, seg = 10, rx = 0, ry = 0, rz = 0, rTop = 1) {
    return this.add(prim(`cyl${seg}_${rTop}`, () => new CylinderGeometry(rTop, 1, 1, seg)), this.mat(x, y, z, r, h, r, rx, ry, rz), color);
  }
  cone(x: number, y: number, z: number, r: number, h: number, color: ColorRepresentation, seg = 8, rx = 0, ry = 0, rz = 0) {
    return this.add(prim(`cone${seg}`, () => new ConeGeometry(1, 1, seg)), this.mat(x, y, z, r, h, r, rx, ry, rz), color);
  }
  sphere(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: ColorRepresentation, seg = 8) {
    return this.add(prim(`sph${seg}`, () => new SphereGeometry(1, seg, Math.max(4, Math.floor(seg * 0.7)))), this.mat(x, y, z, sx, sy, sz), color);
  }
  /** Append another builder's content transformed by m. */
  merge(other: GeoBuilder, m: Matrix4) {
    _n.getNormalMatrix(m);
    for (let i = 0; i < other.pos.length; i += 3) {
      _v.set(other.pos[i], other.pos[i + 1], other.pos[i + 2]).applyMatrix4(m);
      this.pos.push(_v.x, _v.y, _v.z);
      _v.set(other.nor[i], other.nor[i + 1], other.nor[i + 2]).applyMatrix3(_n).normalize();
      this.nor.push(_v.x, _v.y, _v.z);
    }
    this.col.push(...other.col);
    this.uv.push(...other.uv);
    return this;
  }

  /** Flat-shaded triangle with explicit UVs. */
  tri(a: Vector3, b: Vector3, c: Vector3, color: ColorRepresentation, ua = [0, 0], ub = [1, 0], uc = [0, 1]) {
    _c.set(color);
    const n = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a)).normalize();
    for (const [p, u] of [
      [a, ua],
      [b, ub],
      [c, uc],
    ] as [Vector3, number[]][]) {
      this.pos.push(p.x, p.y, p.z);
      this.nor.push(n.x, n.y, n.z);
      this.col.push(_c.r, _c.g, _c.b);
      this.uv.push(u[0], u[1]);
    }
    return this;
  }
  quad(a: Vector3, b: Vector3, c: Vector3, d: Vector3, color: ColorRepresentation, uw = 1, uh = 1) {
    this.tri(a, b, c, color, [0, 0], [uw, 0], [uw, uh]);
    this.tri(a, c, d, color, [0, 0], [uw, uh], [0, uh]);
    return this;
  }

  get vertexCount() {
    return this.pos.length / 3;
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

export function shade(hex: number, f: number): number {
  _c.setHex(hex);
  _c.r = Math.min(1, _c.r * f);
  _c.g = Math.min(1, _c.g * f);
  _c.b = Math.min(1, _c.b * f);
  return _c.getHex();
}
