import * as THREE from 'three';

// BatchedMesh wrapper: many different geometries, one material, ONE draw call.
// Each item picks a near/far geometry by distance (per-instance LOD) and is
// hidden beyond `farDist`. Used for vegetation, streetlights and parked cars.

/** Brings a geometry to the common layout a batch needs: non-indexed, position/normal/uv/color. */
export function normalizeGeometry(src, { color = null, uv = null } = {}) {
  const g = src.index ? src.toNonIndexed() : src.clone();
  const n = g.attributes.position.count;
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv || uv) {
    const a = new Float32Array(n * 2);
    if (uv) for (let i = 0; i < n; i++) { a[i * 2] = uv[0]; a[i * 2 + 1] = uv[1]; }
    else if (g.attributes.uv) a.set(g.attributes.uv.array.subarray(0, n * 2));
    g.setAttribute('uv', new THREE.BufferAttribute(a, 2));
  }
  if (!g.attributes.color) {
    const c = new THREE.Color(color ?? 0xffffff), a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  }
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  g.clearGroups();
  // keep only the first 2 uv components / 3 color components as float
  for (const k of ['position', 'normal', 'uv', 'color']) {
    const a = g.attributes[k];
    if (!(a.array instanceof Float32Array) || a.normalized) {
      const f = new Float32Array(a.count * a.itemSize);
      for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) f[i * a.itemSize + c] = a.getComponent(i, c);
      g.setAttribute(k, new THREE.BufferAttribute(f, a.itemSize));
    }
  }
  return g;
}

export class LodBatch {
  /**
   * @param {THREE.Object3D} parent
   * @param {THREE.Material} material
   * @param {Array<THREE.BufferGeometry>} geometries normalized geometries
   * @param {number} maxInstances
   */
  constructor(parent, material, geometries, maxInstances, { castShadow = true, depthMaterial = null } = {}) {
    let verts = 0;
    for (const g of geometries) verts += g.attributes.position.count;
    this.mesh = new THREE.BatchedMesh(maxInstances, verts, 0, material);
    this.mesh.sortObjects = false; // opaque: depth sorting costs CPU for nothing
    this.mesh.perObjectFrustumCulled = true;
    this.mesh.castShadow = castShadow;
    this.mesh.receiveShadow = true;
    if (depthMaterial) this.mesh.customDepthMaterial = depthMaterial;
    this.geoIds = geometries.map((g) => this.mesh.addGeometry(g));
    this.items = [];
    parent.add(this.mesh);
    this.m = new THREE.Matrix4();
  }

  /** near/far are indices into the geometry list; far may be -1 (hide beyond nearDist). */
  add(matrix, near, far, { nearDist = 60, farDist = 900, color = null } = {}) {
    const id = this.mesh.addInstance(this.geoIds[near]);
    this.mesh.setMatrixAt(id, matrix);
    if (color) this.mesh.setColorAt(id, color);
    const e = matrix.elements;
    const it = { id, x: e[12], z: e[14], near: this.geoIds[near], far: far >= 0 ? this.geoIds[far] : -1, nearDist, farDist, state: 'near' };
    this.items.push(it);
    return it;
  }

  /** Re-picks LOD per item; call every few frames. */
  update(cam, farScale = 1) {
    const mesh = this.mesh;
    for (const it of this.items) {
      const d = Math.hypot(cam.x - it.x, cam.z - it.z);
      const want = d > it.farDist * farScale ? 'hidden' : d > it.nearDist ? (it.far >= 0 ? 'far' : 'hidden') : 'near';
      if (want === it.state) continue;
      it.state = want;
      if (want === 'hidden') { mesh.setVisibleAt(it.id, false); continue; }
      mesh.setVisibleAt(it.id, true);
      mesh.setGeometryIdAt(it.id, want === 'near' ? it.near : it.far);
      if (this.onSwap) this.onSwap(it, want);
    }
  }
}

/** Tiny 2-texel emissive map: u < 0.5 dark, u > 0.5 lit. Lets one material light only some vertices. */
export function emissiveSwitchTexture() {
  const data = new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(data, 2, 1, THREE.RGBAFormat);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}
