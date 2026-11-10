import * as THREE from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

/**
 * Collapses a Quaternius character (several skinned meshes, one flat-colour
 * material per part) into ONE skinned mesh with vertex colours, so each
 * pedestrian costs a single draw call. Skin indices are remapped by bone name.
 */
export function mergeCharacter(scene, recolor = null, { roughness = 0.75, name = 'NPCBody' } = {}) {
  const proto = skeletonClone(scene);
  proto.updateMatrixWorld(true);
  const skinned = [];
  proto.traverse((o) => { if (o.isSkinnedMesh) skinned.push(o); });
  if (skinned.length < 2) return proto;
  const main = skinned[0];
  const bones = main.skeleton.bones;
  const boneIndex = new Map(bones.map((b, i) => [b.name, i]));
  const pos = [], nor = [], col = [], si = [], sw = [];
  const c = new THREE.Color();
  const v3 = new THREE.Vector3();
  const mainBindInv = main.bindMatrix.clone().invert();
  for (const m of skinned) {
    // bring this part into the main mesh's bind space (parts may carry their own
    // dequantisation transform in bindMatrix / inverse-bind matrices)
    const refName = m.skeleton.bones[0].name;
    const mi = boneIndex.get(refName) ?? 0;
    const T = new THREE.Matrix4()
      .copy(mainBindInv)
      .multiply(main.skeleton.boneInverses[mi].clone().invert())
      .multiply(m.skeleton.boneInverses[0])
      .multiply(m.bindMatrix);
    const Nm = new THREE.Matrix3().getNormalMatrix(T);
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const groups = g.groups.length ? g.groups : [{ start: 0, count: g.attributes.position.count, materialIndex: 0 }];
    const remap = m.skeleton.bones.map((b) => boneIndex.get(b.name) ?? 0);
    const P = g.attributes.position, Nn = g.attributes.normal, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight;
    for (const gr of groups) {
      const mat = mats[gr.materialIndex] || mats[0];
      if (recolor && recolor[mat.name] !== undefined) { const rc = recolor[mat.name]; if (Array.isArray(rc)) c.setRGB(rc[0], rc[1], rc[2]); else c.set(rc); }
      else c.copy(mat.color || new THREE.Color(1, 1, 1));
      for (let v = gr.start; v < gr.start + gr.count; v++) {
        v3.set(P.getX(v), P.getY(v), P.getZ(v)).applyMatrix4(T);
        pos.push(v3.x, v3.y, v3.z);
        v3.set(Nn.getX(v), Nn.getY(v), Nn.getZ(v)).applyMatrix3(Nm).normalize();
        nor.push(v3.x, v3.y, v3.z);
        col.push(c.r, c.g, c.b);
        si.push(remap[SI.getX(v)], remap[SI.getY(v)], remap[SI.getZ(v)], remap[SI.getW(v)]);
        sw.push(SW.getX(v), SW.getY(v), SW.getZ(v), SW.getW(v));
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness: 0 });
  const merged = new THREE.SkinnedMesh(geo, mat);
  merged.name = name;
  main.parent.add(merged);
  merged.position.copy(main.position); merged.quaternion.copy(main.quaternion); merged.scale.copy(main.scale);
  merged.bind(main.skeleton, main.bindMatrix);
  for (const m of skinned) m.parent.remove(m);
  return proto;
}
