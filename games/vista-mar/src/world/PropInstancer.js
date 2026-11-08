import * as THREE from 'three';

// Instanced props split into spatial chunks with two levels of detail. Each
// chunk owns its own InstancedMesh per LOD so frustum culling works per chunk,
// the detailed model only draws near the camera, and nothing draws past fog.
const CHUNK = 160;

export class PropInstancer {
  constructor(parent) {
    this.parent = parent;
    this.sets = [];
  }

  /**
   * @param {object} o
   *  near: {geometry, materials}  detailed model
   *  far:  {geometry, materials}  cheap model (optional)
   *  items: [{x,y,z,...}]
   *  place(dummy, item)
   *  color(item) optional instance colour
   *  nearDist / farDist in metres
   */
  add({ near, far = null, items, place, placeFar = null, color = null, nearDist = 170, farDist = 900, castShadow = true, depthMaterial = null }) {
    if (!near || !items.length) return;
    const byChunk = new Map();
    for (const it of items) {
      const k = `${Math.floor(it.x / CHUNK)},${Math.floor(it.z / CHUNK)}`;
      if (!byChunk.has(k)) byChunk.set(k, []);
      byChunk.get(k).push(it);
    }
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    const set = { nearDist, farDist, chunks: [] };
    const make = (model, list, shadow, placeFn = place) => {
      const mat = model.materials.length > 1 ? model.materials : model.materials[0];
      const im = new THREE.InstancedMesh(model.geometry, mat, list.length);
      list.forEach((it, i) => {
        placeFn(dummy, it);
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
        if (color) im.setColorAt(i, col.set(color(it)));
      });
      im.castShadow = shadow;
      if (depthMaterial) im.customDepthMaterial = depthMaterial;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      im.matrixAutoUpdate = false;
      this.parent.add(im);
      return im;
    };
    for (const [k, list] of byChunk) {
      const [cx, cz] = k.split(',').map(Number);
      const c = { x: (cx + 0.5) * CHUNK, z: (cz + 0.5) * CHUNK, near: make(near, list, castShadow), far: far ? make(far, list, false, placeFar || place) : null };
      c.near.visible = false;
      if (c.far) c.far.visible = false;
      set.chunks.push(c);
    }
    this.sets.push(set);
  }

  update(camPos, fogFar) {
    for (const s of this.sets) {
      const farLimit = Math.min(s.farDist, fogFar + 60);
      for (const c of s.chunks) {
        // distance from the camera to the chunk's square (0 when inside it)
        const d = Math.hypot(Math.max(0, Math.abs(camPos.x - c.x) - CHUNK / 2), Math.max(0, Math.abs(camPos.z - c.z) - CHUNK / 2));
        const isNear = d < s.nearDist;
        c.near.visible = isNear || (!c.far && d < farLimit);
        if (c.far) c.far.visible = !isNear && d < farLimit;
      }
    }
  }
}
