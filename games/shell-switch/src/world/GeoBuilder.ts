import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const tmpColor = new THREE.Color();
const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();
const tmpPos = new THREE.Vector3();
const tmpScale = new THREE.Vector3();

/** Normalize any primitive into position/normal/color + index so it can be merged. */
export function prepGeometry(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation): THREE.BufferGeometry {
  let g = geo;
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.index) {
    const count = g.attributes.position.count;
    const idx = new Array<number>(count);
    for (let i = 0; i < count; i += 1) idx[i] = i;
    g.setIndex(idx);
  }
  tmpColor.set(color);
  const count = g.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

export interface Xform {
  x?: number;
  y?: number;
  z?: number;
  rx?: number;
  ry?: number;
  rz?: number;
  sx?: number;
  sy?: number;
  sz?: number;
}

export function xformMatrix(t: Xform): THREE.Matrix4 {
  tmpPos.set(t.x ?? 0, t.y ?? 0, t.z ?? 0);
  tmpEuler.set(t.rx ?? 0, t.ry ?? 0, t.rz ?? 0, 'YXZ');
  tmpQuat.setFromEuler(tmpEuler);
  tmpScale.set(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1);
  return tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
}

/**
 * Accumulates vertex-colored primitives and merges them into one mesh per
 * material. A whole district renders in a handful of draw calls.
 */
export class GeoBuilder {
  private readonly parts: THREE.BufferGeometry[] = [];
  /** Optional parent transform applied to everything added (for prefab helpers). */
  private readonly stack: THREE.Matrix4[] = [];

  get size(): number {
    return this.parts.length;
  }

  push(t: Xform): void {
    const m = xformMatrix(t).clone();
    const top = this.stack[this.stack.length - 1];
    this.stack.push(top ? top.clone().multiply(m) : m);
  }

  pop(): void {
    this.stack.pop();
  }

  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, t: Xform = {}): void {
    const g = prepGeometry(geo, color);
    const m = xformMatrix(t);
    const top = this.stack[this.stack.length - 1];
    if (top) g.applyMatrix4(top.clone().multiply(m));
    else g.applyMatrix4(m);
    this.parts.push(g);
  }

  /** Axis-aligned box positioned by its center. */
  box(x: number, y: number, z: number, w: number, h: number, d: number, color: THREE.ColorRepresentation, ry = 0): void {
    this.add(new THREE.BoxGeometry(w, h, d), color, { x, y, z, ry });
  }

  /** Box resting on y (bottom at y). */
  block(x: number, y: number, z: number, w: number, h: number, d: number, color: THREE.ColorRepresentation, ry = 0): void {
    this.box(x, y + h / 2, z, w, h, d, color, ry);
  }

  cyl(x: number, y: number, z: number, rTop: number, rBot: number, h: number, color: THREE.ColorRepresentation, seg = 10, t: Xform = {}): void {
    this.add(new THREE.CylinderGeometry(rTop, rBot, h, seg), color, { x, y: y + h / 2, z, ...t });
  }

  sphere(x: number, y: number, z: number, r: number, color: THREE.ColorRepresentation, wSeg = 10, hSeg = 8, t: Xform = {}): void {
    this.add(new THREE.SphereGeometry(r, wSeg, hSeg), color, { x, y, z, ...t });
  }

  cone(x: number, y: number, z: number, r: number, h: number, color: THREE.ColorRepresentation, seg = 8, t: Xform = {}): void {
    this.add(new THREE.ConeGeometry(r, h, seg), color, { x, y: y + h / 2, z, ...t });
  }

  build(material: THREE.Material, name = 'merged'): THREE.Mesh | null {
    if (this.parts.length === 0) return null;
    const merged = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts.length = 0;
    if (!merged) return null;
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = name;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    return mesh;
  }

  /** Build without freezing the matrix (for animated sub-parts). */
  buildGeometry(): THREE.BufferGeometry | null {
    if (this.parts.length === 0) return null;
    const merged = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts.length = 0;
    if (merged) {
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
    }
    return merged;
  }
}

/** A set of builders, one per material role, for a region of the world. */
export class KitBuilder {
  readonly world = new GeoBuilder();
  readonly smooth = new GeoBuilder();
  readonly metal = new GeoBuilder();
  readonly glow = new GeoBuilder();

  buildInto(parent: THREE.Object3D, mats: { world: THREE.Material; worldSmooth: THREE.Material; metal: THREE.Material; glow: THREE.Material }, name: string, shadows = true): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    const pairs: [GeoBuilder, THREE.Material, string, boolean][] = [
      [this.world, mats.world, 'world', shadows],
      [this.smooth, mats.worldSmooth, 'smooth', shadows],
      [this.metal, mats.metal, 'metal', shadows],
      [this.glow, mats.glow, 'glow', false],
    ];
    for (const [b, m, suffix, sh] of pairs) {
      const mesh = b.build(m, `${name}-${suffix}`);
      if (!mesh) continue;
      mesh.castShadow = sh;
      mesh.receiveShadow = suffix !== 'glow';
      parent.add(mesh);
      out.push(mesh);
    }
    return out;
  }
}
