import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// Loads the CC0 model set. Every entry is optional: a failed load is recorded
// and the game falls back to procedural geometry for that slot.
const BASE = (import.meta.env && import.meta.env.BASE_URL) || './';

export const MANIFEST = {
  anim: 'assets/anim/AnimationLibrary.glb',
  player: 'assets/characters/M_Beach.glb',
  palm1: 'assets/props/PalmTree_1.glb',
  palm2: 'assets/props/PalmTree_2.glb',
  palm3: 'assets/props/PalmTree_3.glb',
  bush: 'assets/props/Bush_1.glb',
  streetlight: 'assets/props/Streetlight_Single.glb',
  sedan: 'assets/vehicles/sedan.glb',
  sports: 'assets/vehicles/sedan-sports.glb',
  suv: 'assets/vehicles/suv.glb',
  taxi: 'assets/vehicles/taxi.glb',
  van: 'assets/vehicles/van.glb',
  police: 'assets/vehicles/police.glb',
  delivery: 'assets/vehicles/delivery.glb',
  npc_m_casual: 'assets/characters/M_Casual.glb',
  npc_m_casual2: 'assets/characters/M_Casual2.glb',
  npc_m_suit: 'assets/characters/M_Suit.glb',
  npc_m_worker: 'assets/characters/M_Worker.glb',
  npc_m_punk: 'assets/characters/M_Punk.glb',
  npc_w_casual: 'assets/characters/W_Casual.glb',
  npc_w_formal: 'assets/characters/W_Formal.glb',
  npc_w_suit: 'assets/characters/W_Suit.glb',
  npc_w_punk: 'assets/characters/W_Punk.glb',
  hatch: 'assets/vehicles/hatchback-sports.glb',
};

export async function loadAssets(onProgress) {
  const manager = new THREE.LoadingManager();
  // Single-file build: models are embedded as data URIs keyed by path.
  const embedded = typeof window !== 'undefined' ? window.__VM_ASSETS__ : null;
  if (embedded) {
    const byName = {};
    for (const [k, v] of Object.entries(embedded)) byName[k.split('/').pop()] = v;
    manager.setURLModifier((url) => (url.startsWith('data:') ? url : byName[url.split('/').pop()] || url));
  }
  const loader = new GLTFLoader(manager);
  loader.setMeshoptDecoder(MeshoptDecoder);
  const out = {};
  const keys = Object.keys(MANIFEST);
  let done = 0;
  await Promise.all(
    keys.map(async (k) => {
      try {
        out[k] = await loader.loadAsync(BASE + MANIFEST[k]);
      } catch (e) {
        console.warn('[assets] failed', k, e && e.message);
        out[k] = null;
      }
      done++;
      onProgress && onProgress(done / keys.length, k);
    }),
  );
  return out;
}

// Bakes a static GLTF scene into one geometry (with material groups) so it can be
// drawn as an InstancedMesh. Scales it so that the chosen axis measures `size`.
export function bakeStatic(gltf, { size = 1, axis = 'y', groundAlign = true, centerXZ = true } = {}) {
  if (!gltf) return null;
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const byMat = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const g = toFloatGeometry(o.geometry).applyMatrix4(o.matrixWorld);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    const ng = g.index ? g.toNonIndexed() : g;
    if (g.groups.length > 1 && mats.length > 1) {
      // split multi-material meshes by group
      const src = g.index ? g : null;
      for (const grp of g.groups) {
        const part = extractGroup(src || g, grp);
        pushMat(byMat, mats[grp.materialIndex], part);
      }
    } else {
      pushMat(byMat, mats[0], ng);
    }
  });
  const geos = [];
  const materials = [];
  for (const [mat, list] of byMat) {
    geos.push(mergeGeometries(list, false));
    materials.push(mat);
  }
  const merged = mergeGeometries(geos, true);
  merged.computeBoundingBox();
  const bb = merged.boundingBox;
  const dim = bb.max[axis] - bb.min[axis];
  const s = dim > 0 ? size / dim : 1;
  const cx = centerXZ ? (bb.min.x + bb.max.x) / 2 : 0;
  const cz = centerXZ ? (bb.min.z + bb.max.z) / 2 : 0;
  merged.translate(-cx, groundAlign ? -bb.min.y : 0, -cz);
  merged.scale(s, s, s);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  for (const m of materials) {
    if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
  }
  return { geometry: merged, materials, size: merged.boundingBox.getSize(new THREE.Vector3()) };
}

function pushMat(map, mat, geo) {
  if (!map.has(mat)) map.set(mat, []);
  map.get(mat).push(geo.index ? geo.toNonIndexed() : geo);
}

function extractGroup(geo, grp) {
  const src = geo.index ? geo.toNonIndexed() : geo;
  // after toNonIndexed the group ranges index vertices directly
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(src.attributes)) {
    const a = src.attributes[name];
    const arr = a.array.slice(grp.start * a.itemSize, (grp.start + grp.count) * a.itemSize);
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
  }
  return out;
}

/**
 * Copy of a geometry with position/normal/uv as plain Float32 attributes.
 * Meshopt/KHR_mesh_quantization models store normalised integers; transforming
 * those in place would wrap around, so dequantise first (getX honours `normalized`).
 */
export function toFloatGeometry(src) {
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const a = src.attributes[name];
    if (!a) continue;
    const n = a.count, size = a.itemSize;
    const arr = new Float32Array(n * size);
    for (let i = 0; i < n; i++) {
      arr[i * size] = a.getX(i);
      if (size > 1) arr[i * size + 1] = a.getY(i);
      if (size > 2) arr[i * size + 2] = a.getZ(i);
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  if (src.index) out.setIndex(src.index.clone());
  for (const g of src.groups) out.addGroup(g.start, g.count, g.materialIndex);
  return out;
}
