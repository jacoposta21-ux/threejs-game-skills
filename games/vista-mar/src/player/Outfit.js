import * as THREE from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

// Clothes for the player: the Quaternius characters are split into Head, Body,
// Legs and Feet skinned meshes on the same armature, so the player's own head
// is kept and only the clothing parts are swapped in from other outfits.

export const CLOTHES = {
  body: [
    { key: 'player', name: 'White tank top', price: 0 },
    { key: 'npc_m_casual', name: 'Purple shirt', price: 180 },
    { key: 'npc_m_casual2', name: 'Weekend tee', price: 120 },
    { key: 'npc_m_punk', name: 'Black band jacket', price: 450 },
    { key: 'npc_m_worker', name: 'Hi-vis work vest', price: 200 },
    { key: 'npc_m_suit', name: 'Suit jacket and tie', price: 900 },
  ],
  legs: [
    { key: 'player', name: 'Red board shorts', price: 0 },
    { key: 'npc_m_casual', name: 'Light jeans', price: 140 },
    { key: 'npc_m_casual2', name: 'Weekend jeans', price: 120 },
    { key: 'npc_m_punk', name: 'Ripped jeans', price: 220 },
    { key: 'npc_m_worker', name: 'Work trousers', price: 150 },
    { key: 'npc_m_suit', name: 'Suit trousers', price: 500 },
  ],
  feet: [
    { key: 'player', name: 'Flip-flops', price: 0 },
    { key: 'npc_m_casual', name: 'Purple sneakers', price: 110 },
    { key: 'npc_m_casual2', name: 'Canvas shoes', price: 90 },
    { key: 'npc_m_punk', name: 'Black boots', price: 260 },
    { key: 'npc_m_worker', name: 'Work boots', price: 160 },
    { key: 'npc_m_suit', name: 'Oxford shoes', price: 380 },
  ],
};

const SLOT_SUFFIX = { body: '_Body', legs: '_Legs', feet: '_Feet' };

function findPart(root, suffix) {
  // a part is a top-level node (a Group of skinned meshes, or one skinned mesh) named e.g. 'Suit_Body'
  let hit = null;
  root.traverse((o) => { if (!hit && (o.isSkinnedMesh || o.isGroup) && o.name.endsWith(suffix)) hit = o; });
  return hit;
}

/** Builds a gltf-like { scene } with the player's head and the chosen clothing parts. */
export function composeOutfit(assets, sel) {
  const base = skeletonClone(assets.player.scene);
  base.updateMatrixWorld(true);
  const bones = new Map();
  base.traverse((o) => { if (o.isBone) bones.set(o.name, o); });
  const fallback = bones.values().next().value;
  for (const slot of ['body', 'legs', 'feet']) {
    const key = sel[slot];
    if (!key || key === 'player' || !assets[key]) continue;
    const target = findPart(base, SLOT_SUFFIX[slot]);
    const src = findPart(assets[key].scene, SLOT_SUFFIX[slot]);
    if (!target || !src) continue;
    const holder = new THREE.Group();
    holder.name = src.name;
    holder.position.copy(src.position); holder.quaternion.copy(src.quaternion); holder.scale.copy(src.scale);
    const meshes = [];
    src.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
    for (const sm of meshes) {
      const m = new THREE.SkinnedMesh(sm.geometry, sm.material);
      m.name = sm.name;
      if (sm !== src) { m.position.copy(sm.position); m.quaternion.copy(sm.quaternion); m.scale.copy(sm.scale); }
      holder.add(m);
      const sk = new THREE.Skeleton(sm.skeleton.bones.map((b) => bones.get(b.name) || fallback), sm.skeleton.boneInverses);
      m.bind(sk, sm.bindMatrix);
    }
    const parent = target.parent;
    parent.add(holder);
    parent.remove(target);
  }
  return { scene: base, animations: [] };
}
