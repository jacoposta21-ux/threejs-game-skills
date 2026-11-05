import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Merge static, opaque level meshes that share a material into one draw call.
 * Interactable roots, animated groups and special materials are left alone.
 */
export function batchStatic(root: THREE.Object3D): { before: number; after: number } {
  root.updateMatrixWorld(true);
  const groups = new Map<string, { material: THREE.Material; cast: boolean; receive: boolean; meshes: THREE.Mesh[] }>();
  let before = 0;
  const visit = (o: THREE.Object3D) => {
    if (o.userData.noBatch) return;
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      before++;
      const m = mesh.material;
      const ok =
        !Array.isArray(m) &&
        !(mesh as unknown as THREE.InstancedMesh).isInstancedMesh &&
        !(m as THREE.ShaderMaterial).isShaderMaterial &&
        !m.transparent &&
        mesh.visible &&
        mesh.geometry.attributes.position &&
        mesh.geometry.attributes.normal &&
        mesh.geometry.attributes.uv;
      if (ok) {
        const key = `${m.uuid}|${mesh.castShadow}|${mesh.receiveShadow}`;
        let g = groups.get(key);
        if (!g) {
          g = { material: m, cast: mesh.castShadow, receive: mesh.receiveShadow, meshes: [] };
          groups.set(key, g);
        }
        g.meshes.push(mesh);
      }
    }
    for (const child of o.children) visit(child);
  };
  visit(root);
  let merged = 0;
  for (const g of groups.values()) {
    if (g.meshes.length < 2) continue;
    const geos: THREE.BufferGeometry[] = [];
    for (const mesh of g.meshes) {
      let geo = mesh.geometry.clone();
      for (const name of Object.keys(geo.attributes)) {
        if (name !== 'position' && name !== 'normal' && name !== 'uv') geo.deleteAttribute(name);
      }
      if (!geo.index) {
        const count = geo.attributes.position.count;
        const idx = new (count > 65535 ? Uint32Array : Uint16Array)(count);
        for (let i = 0; i < count; i++) idx[i] = i;
        geo.setIndex(new THREE.BufferAttribute(idx, 1));
      }
      geo.morphAttributes = {};
      geo.applyMatrix4(mesh.matrixWorld);
      geo = geo.index && geo.index.array instanceof Uint16Array ? geo : geo;
      geos.push(geo);
    }
    // Normalise index types (mergeGeometries needs consistent arrays).
    for (const geo of geos) {
      if (!(geo.index!.array instanceof Uint32Array)) geo.setIndex(new THREE.BufferAttribute(Uint32Array.from(geo.index!.array), 1));
    }
    const mergedGeo = mergeGeometries(geos, false);
    for (const geo of geos) geo.dispose();
    if (!mergedGeo) continue;
    mergedGeo.computeBoundingSphere();
    const out = new THREE.Mesh(mergedGeo, g.material);
    out.castShadow = g.cast;
    out.receiveShadow = g.receive;
    out.name = `batch:${g.material.name}`;
    root.add(out);
    for (const mesh of g.meshes) mesh.removeFromParent();
    merged += g.meshes.length;
  }
  return { before, after: before - merged + [...groups.values()].filter((g) => g.meshes.length >= 2).length };
}

/** Merge same-material mesh siblings in their parent's local space (safe for animated parents). */
export function batchSiblings(root: THREE.Object3D): void {
  const parents: THREE.Object3D[] = [];
  root.traverse((o) => parents.push(o));
  for (const parent of parents) {
    if (parent.userData.noBatchChildren) continue;
    const groups = new Map<string, THREE.Mesh[]>();
    for (const child of parent.children) {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || mesh.children.length || mesh.userData.noBatch || mesh.userData.interactable) continue;
      const m = mesh.material;
      if (Array.isArray(m) || (m as THREE.ShaderMaterial).isShaderMaterial || m.transparent || !mesh.visible) continue;
      if (!mesh.geometry.attributes.normal || !mesh.geometry.attributes.uv) continue;
      const key = `${m.uuid}|${mesh.castShadow}|${mesh.receiveShadow}|${mesh.renderOrder}`;
      const list = groups.get(key) ?? [];
      list.push(mesh);
      groups.set(key, list);
    }
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const geos = list.map((mesh) => {
        mesh.updateMatrix();
        const geo = mesh.geometry.clone();
        for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') geo.deleteAttribute(name);
        if (!geo.index) {
          const idx = new Uint32Array(geo.attributes.position.count);
          for (let i = 0; i < idx.length; i++) idx[i] = i;
          geo.setIndex(new THREE.BufferAttribute(idx, 1));
        } else if (!(geo.index.array instanceof Uint32Array)) {
          geo.setIndex(new THREE.BufferAttribute(Uint32Array.from(geo.index.array), 1));
        }
        geo.applyMatrix4(mesh.matrix);
        return geo;
      });
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!merged) continue;
      const out = new THREE.Mesh(merged, list[0].material);
      out.castShadow = list[0].castShadow;
      out.receiveShadow = list[0].receiveShadow;
      out.renderOrder = list[0].renderOrder;
      parent.add(out);
      for (const mesh of list) mesh.removeFromParent();
    }
  }
}
