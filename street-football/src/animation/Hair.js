import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const materials = new Map();
function hairMaterial(color) {
  if (!materials.has(color)) {
    materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0 }));
  }
  return materials.get(color);
}

function bumpy(geo, amount, seed) {
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 1) {
    v.fromBufferAttribute(pos, i);
    const n =
      Math.sin(v.x * 23 + seed) * Math.sin(v.y * 19 + seed * 1.7) * Math.sin(v.z * 21 + seed * 0.3);
    v.multiplyScalar(1 + n * amount);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a hairstyle in the mannequin's bind-pose geometry space, then moves it
 * into the head bone's local space so it follows the head rigidly.
 * styles: buzz | afro | curly | twists | bald ; optional headband.
 */
export function createHair(look, head, headBoneInverse) {
  const C = head.center;
  const S = head.size;
  const parts = [];
  const style = look.hair ?? 'buzz';

  if (style === 'buzz') {
    const g = new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.56);
    g.scale(S.x * 0.535, S.y * 0.56, S.z * 0.56);
    g.rotateX(-0.32);
    g.translate(C.x, C.y + S.y * 0.07, C.z - S.z * 0.04);
    parts.push(g);
  } else if (style === 'afro') {
    const g = bumpy(new THREE.SphereGeometry(1, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.62), 0.07, 3);
    g.scale(S.x * 0.78, S.y * 0.6, S.z * 0.8);
    g.rotateX(-0.35);
    g.translate(C.x, C.y + S.y * 0.18, C.z - S.z * 0.1);
    parts.push(g);
  } else if (style === 'curly') {
    const base = new THREE.SphereGeometry(1, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55);
    base.scale(S.x * 0.54, S.y * 0.55, S.z * 0.57);
    base.rotateX(-0.3);
    base.translate(C.x, C.y + S.y * 0.08, C.z - S.z * 0.04);
    parts.push(base);
    for (let i = 0; i < 26; i += 1) {
      const a = (i / 26) * Math.PI * 2 * 3.1;
      const r = 0.25 + (i % 5) * 0.06;
      const b = new THREE.IcosahedronGeometry(S.x * 0.12, 1);
      b.translate(C.x + Math.cos(a) * S.x * r, C.y + S.y * (0.42 - r * 0.25), C.z + Math.sin(a) * S.z * r - S.z * 0.05);
      parts.push(b);
    }
  } else if (style === 'twists') {
    const base = new THREE.SphereGeometry(1, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.52);
    base.scale(S.x * 0.53, S.y * 0.54, S.z * 0.56);
    base.rotateX(-0.3);
    base.translate(C.x, C.y + S.y * 0.08, C.z - S.z * 0.04);
    parts.push(base);
    for (let i = 0; i < 18; i += 1) {
      const a = (i / 18) * Math.PI * 2;
      const tw = new THREE.CylinderGeometry(S.x * 0.045, S.x * 0.03, S.y * 0.32, 6);
      tw.rotateX(0.5);
      tw.rotateY(a);
      tw.translate(C.x + Math.sin(a) * S.x * 0.38, C.y + S.y * 0.36, C.z + Math.cos(a) * S.z * 0.38 - S.z * 0.06);
      parts.push(tw);
    }
  }

  const group = new THREE.Group();
  group.name = 'hair';
  if (parts.length) {
    // Strip uv so all parts merge cleanly.
    for (const p of parts) p.deleteAttribute('uv');
    const merged = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)), false);
    merged.applyMatrix4(headBoneInverse);
    merged.computeVertexNormals();
    const mesh = new THREE.Mesh(merged, hairMaterial(look.hairColor ?? '#1b120c'));
    mesh.castShadow = true;
    group.add(mesh);
  }
  if (look.headband) {
    const band = new THREE.TorusGeometry(1, 0.075, 8, 32);
    band.rotateX(Math.PI / 2);
    band.scale(S.x * 0.53, S.y * 0.9, S.z * 0.56);
    band.rotateX(-0.22);
    band.translate(C.x, C.y + S.y * 0.18, C.z - S.z * 0.02);
    band.applyMatrix4(headBoneInverse);
    const mesh = new THREE.Mesh(band, hairMaterial(look.headband));
    group.add(mesh);
  }
  return group.children.length ? group : null;
}
