// Packs Quaternius' Universal Animation Library (CC0) into the runtime GLB.
// Keeps only the clips the game uses, resamples keyframes, and writes
// public/assets/characters/footballer.glb.
//
// Usage: node tools/prepare-assets.mjs <path-to>/AnimationLibrary_Godot_Standard.gltf
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, resample, weld, quantize, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

// Clips used at runtime. Add names here (e.g. 'Hit_Chest', 'Roll') when a
// later phase needs them; everything else is stripped to keep the download small.
const KEEP = new Set([
  'Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop',
  'Dance_Loop', 'Jump_Loop', 'Idle_Talking_Loop',
  // Phase 2: reaction when tackled.
  'Hit_Chest',
]);

const input = process.argv[2];
if (!input) {
  console.error('usage: node tools/prepare-assets.mjs <AnimationLibrary_Godot_Standard.gltf>');
  process.exit(1);
}
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input);
const root = doc.getRoot();
for (const anim of root.listAnimations()) {
  if (KEEP.has(anim.getName())) continue;
  // Samplers hold their accessors alive; dispose them explicitly.
  for (const c of anim.listChannels()) c.dispose();
  for (const smp of anim.listSamplers()) smp.dispose();
  anim.dispose();
}
// Drop tracks that never change the pose: scale everywhere, and translation on
// every bone except root/hips when it is constant through the clip. This removes
// two thirds of the channels (and their glTF JSON).
let removed = 0;
for (const anim of root.listAnimations()) {
  for (const channel of anim.listChannels()) {
    const path = channel.getTargetPath();
    const node = channel.getTargetNode()?.getName() ?? '';
    const sampler = channel.getSampler();
    let drop = path === 'scale';
    if (path === 'translation' && node !== 'root' && node !== 'DEF-hips') {
      const out = sampler.getOutput().getArray();
      drop = true;
      for (let i = 3; i < out.length; i += 1) {
        if (Math.abs(out[i] - out[i % 3]) > 1e-4) {
          drop = false;
          break;
        }
      }
    }
    if (drop) {
      channel.dispose();
      sampler.dispose();
      removed += 1;
    }
  }
}
console.log(`removed ${removed} static channels`);
const sweepOrphans = () => {
  let n = 0;
  for (const a of root.listAccessors()) {
    if (a.listParents().every((p) => p === root)) {
      a.dispose();
      n += 1;
    }
  }
  return n;
};
console.log(`disposed ${sweepOrphans()} orphan accessors`);

// The second UV set is unused by the runtime shader.
for (const mesh of root.listMeshes()) {
  for (const prim of mesh.listPrimitives()) prim.setAttribute('TEXCOORD_1', null);
}
await doc.transform(
  weld(),
  resample({ tolerance: 5e-4 }),
  dedup(),
  prune(),
  // KHR_mesh_quantization is read natively by three.js GLTFLoader.
  quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeWeight: 8 }),
  // Quantize leaves the original float accessors orphaned; drop them.
  prune(),
  // Quantize can orphan the original float accessors.
  (d) => void sweepOrphans(d),
  // EXT_meshopt_compression: decoded in the browser by three's MeshoptDecoder.
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
const kept = root.listAnimations().map((a) => a.getName());
const out = 'public/assets/characters/footballer.glb';
await io.write(out, doc);
console.log(`wrote ${out} with clips: ${kept.join(', ')}`);
