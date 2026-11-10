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

/**
 * Same API as LodBatch, but rendered with plain InstancedMeshes grouped by
 * spatial chunk (one per geometry per chunk). Instancing is natively supported
 * everywhere, whereas BatchedMesh multi-draw can be emulated as one draw per
 * instance on some drivers (e.g. ANGLE/D3D11 on integrated GPUs).
 */
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class ChunkedLod {
  /**
   * `split`: inside a chunk that is close enough for detail, each item still picks its own
   * LOD: full model within nearDist * split of the camera, the far model beyond. A whole
   * 200 m chunk of detailed palms costs several hundred thousand triangles (twice with
   * shadows) for trees that are a few pixels tall.
   */
  constructor(parent, material, geometries, _max, { castShadow = true, depthMaterial = null, chunk = 200, split = 2.2 } = {}) {
    this.parent = parent;
    this.material = material;
    this.geos = geometries;
    this.castShadow = castShadow;
    this.depthMaterial = depthMaterial;
    this.size = chunk;
    this.split = split;
    this.items = [];
    this.chunks = [];
    this.cam = { x: 0, z: 0 };
  }

  add(matrix, near, far, { nearDist = 60, farDist = 900, farMatrix = null } = {}) {
    const e = matrix.elements;
    const it = { x: e[12], z: e[14], m: matrix.clone(), fm: farMatrix ? farMatrix.clone() : null, near, far, nearDist, farDist, hi: null, hidden: false };
    this.items.push(it);
    return it;
  }

  finalize() {
    const groups = new Map();
    for (const it of this.items) {
      const cx = Math.floor(it.x / this.size), cz = Math.floor(it.z / this.size);
      const k = `${cx},${cz},${it.nearDist},${it.farDist}`;
      if (!groups.has(k)) groups.set(k, { x: (cx + 0.5) * this.size, z: (cz + 0.5) * this.size, nearDist: it.nearDist, farDist: it.farDist, items: [] });
      groups.get(k).items.push(it);
    }
    for (const g of groups.values()) {
      const build = (key, matKey, shadow) => {
        const byGeo = new Map();
        for (const it of g.items) {
          const gi = it[key];
          if (gi < 0) continue;
          if (!byGeo.has(gi)) byGeo.set(gi, []);
          byGeo.get(gi).push(it);
        }
        const meshes = [];
        for (const [gi, list] of byGeo) {
          const im = new THREE.InstancedMesh(this.geos[gi], this.material, list.length);
          list.forEach((it, i) => im.setMatrixAt(i, matKey === 'fm' ? (it.fm || it.m) : it.m));
          im.castShadow = shadow;
          im.receiveShadow = true;
          if (this.depthMaterial) im.customDepthMaterial = this.depthMaterial;
          im.computeBoundingSphere(); // over every item: stays valid however the instances are packed later
          im.matrixAutoUpdate = false;
          im.visible = false;
          this.parent.add(im);
          meshes.push({ im, list });
        }
        return meshes;
      };
      const c = { ...g, near: build('near', 'm', this.castShadow), far: build('far', 'fm', false), state: '', dirty: true };
      for (const it of c.items) it.chunk = c;
      this.chunks.push(c);
    }
    this.items = [];
  }

  /** Removes one instance (e.g. a parked car the player just stole). */
  hide(it) {
    it.hidden = true;
    if (it.chunk) { it.chunk.dirty = true; this.pack(it.chunk); }
  }

  /** Sorts a chunk's items into its near / far meshes for the current camera. */
  pack(c) {
    const cam = this.cam;
    let changed = c.dirty;
    for (const it of c.items) {
      let hi = false;
      if (c.state === 'near') hi = it.far < 0 || Math.hypot(cam.x - it.x, cam.z - it.z) < c.nearDist * this.split * (it.hi ? 1.08 : 1);
      if (hi !== it.hi) { it.hi = hi; changed = true; }
    }
    if (!changed) return;
    c.dirty = false;
    const fill = (set, wantHi, matKey) => {
      for (const m of set) {
        let k = 0;
        for (const it of m.list) if (it.hi === wantHi && !it.hidden) m.im.setMatrixAt(k++, matKey === 'fm' ? (it.fm || it.m) : it.m);
        m.im.count = k;
        m.im.instanceMatrix.needsUpdate = true;
        m.im.visible = k > 0 && c.state !== 'none';
      }
    };
    fill(c.near, true, 'm');
    fill(c.far, false, 'fm');
    // far models standing in for near ones keep casting shadows, so no shadow disappears
    for (const m of c.far) m.im.castShadow = this.castShadow && c.state === 'near';
  }

  update(cam, farScale = 1) {
    const h = this.size / 2;
    this.cam.x = cam.x; this.cam.z = cam.z;
    for (const c of this.chunks) {
      const d = Math.hypot(Math.max(0, Math.abs(cam.x - c.x) - h), Math.max(0, Math.abs(cam.z - c.z) - h));
      const want = d < c.nearDist ? 'near' : d < c.farDist * farScale ? 'far' : 'none';
      if (want !== c.state) {
        c.state = want;
        c.dirty = true;
        if (want === 'none') { for (const m of c.near) m.im.visible = false; for (const m of c.far) m.im.visible = false; continue; }
      }
      if (want === 'near' || c.dirty) this.pack(c);
    }
  }
}
