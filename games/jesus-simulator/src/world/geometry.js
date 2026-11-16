import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const tmpObj = new THREE.Object3D();
const tmpColor = new THREE.Color();

/** BoxGeometry whose UVs are in world metres / tile so textures keep a constant scale. */
export function worldBox(w, h, d, tile = 2) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // face order: +x, -x, +y, -y, +z, -z ; 4 verts each
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f += 1) {
    for (let v = 0; v < 4; v += 1) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / tile, (uv.getY(i) * dims[f][1]) / tile);
    }
  }
  return g;
}

export function roundedBox(w, h, d, r = 0.08, seg = 2) {
  return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2) * 0.999);
}

function normalise(geometry) {
  let g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv' && name !== 'color') g.deleteAttribute(name);
  }
  if (!g.attributes.uv) {
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

/**
 * Collects static geometry per material key with baked transforms + vertex
 * colours, then merges each bucket into one mesh. A whole village becomes a
 * handful of draw calls.
 */
export class StaticBatcher {
  constructor() {
    this.buckets = new Map();
    this.triangles = 0;
  }

  /**
   * @param {THREE.BufferGeometry} geometry source (not consumed)
   * @param {string} matKey material bucket
   * @param {THREE.ColorRepresentation} color vertex colour tint
   * @param {object} t transform {x,y,z, rx,ry,rz, sx,sy,sz} or a Matrix4
   */
  add(geometry, matKey, color, t = {}) {
    const g = normalise(geometry);
    if (t.isMatrix4) {
      g.applyMatrix4(t);
    } else {
      tmpObj.position.set(t.x || 0, t.y || 0, t.z || 0);
      tmpObj.rotation.set(t.rx || 0, t.ry || 0, t.rz || 0, t.order || 'YXZ');
      tmpObj.scale.set(t.sx ?? t.s ?? 1, t.sy ?? t.s ?? 1, t.sz ?? t.s ?? 1);
      tmpObj.updateMatrix();
      g.applyMatrix4(tmpObj.matrix);
    }
    const count = g.attributes.position.count;
    // color === null keeps pre-baked vertex colours (e.g. merged tree templates)
    if (color !== null || !g.attributes.color) {
      const colors = new Float32Array(count * 3);
      tmpColor.set(color ?? '#ffffff');
      for (let i = 0; i < count; i += 1) {
        colors[i * 3] = tmpColor.r;
        colors[i * 3 + 1] = tmpColor.g;
        colors[i * 3 + 2] = tmpColor.b;
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    }
    let bucket = this.buckets.get(matKey);
    if (!bucket) {
      bucket = [];
      this.buckets.set(matKey, bucket);
    }
    bucket.push(g);
    this.triangles += count / 3;
    return g;
  }

  build(materials, { castShadow = true, receiveShadow = true, name = 'static' } = {}) {
    const group = new THREE.Group();
    group.name = name;
    for (const [key, list] of this.buckets) {
      const material = materials[key];
      if (!material) throw new Error(`StaticBatcher: missing material "${key}"`);
      // merge in chunks to keep individual buffers reasonable and frustum culling useful
      const merged = mergeGeometries(list, false);
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, material);
      mesh.name = `${name}:${key}`;
      mesh.castShadow = castShadow && material.userData.castShadow !== false;
      mesh.receiveShadow = receiveShadow;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
      for (const g of list) g.dispose();
    }
    this.buckets.clear();
    return group;
  }
}

/** Merge parts into one geometry with vertex colours (for InstancedMesh templates). */
export function mergeColored(parts) {
  const b = new StaticBatcher();
  for (const p of parts) b.add(p.geometry, 'x', p.color, p.t || {});
  const list = b.buckets.get('x');
  const merged = mergeGeometries(list, false);
  for (const g of list) g.dispose();
  return merged;
}

/** Lathe-turned clay pot profile. */
export function potGeometry(height = 0.7, radius = 0.3, segments = 10) {
  const pts = [
    [0, 0], [radius * 0.55, 0], [radius * 0.9, height * 0.18], [radius, height * 0.45],
    [radius * 0.8, height * 0.72], [radius * 0.38, height * 0.86], [radius * 0.42, height], [radius * 0.32, height],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, segments);
}
