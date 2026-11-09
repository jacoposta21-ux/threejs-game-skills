// Step 2 of the character pipeline (after tools/prepare-characters.py):
//   bodies → src/assets/characters/body_male.glb, body_female.glb
//   hair   → src/assets/characters/hair.glb   (all rigged hairstyles, one file)
//   clips  → src/assets/characters/anims.glb  (UAL1 Standard, UE skeleton, no mesh)
// They are imported with ?url, so the build emits content-hashed, cacheable files.
// Usage: node tools/prepare-characters.mjs <jpg_dir> <UAL1_Standard.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, mergeDocuments, prune, quantize, resample, unpartition, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const [jpgDir, ualPath] = process.argv.slice(2);
if (!jpgDir || !ualPath) {
  console.error('usage: node tools/prepare-characters.mjs <jpg_dir> <UAL1_Standard.glb>');
  process.exit(1);
}
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const OUT = 'src/assets/characters';

const sweepOrphans = (doc) => {
  const root = doc.getRoot();
  for (const a of root.listAccessors()) if (a.listParents().every((p) => p === root)) a.dispose();
};
const compress = [
  weld(),
  dedup(),
  prune(),
  quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeWeight: 8 }),
  prune(),
  (d) => void sweepOrphans(d),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
];

// Bodies.
for (const [name, file] of [['body_male', 'Superhero_Male_FullBody.gltf'], ['body_female', 'Superhero_Female_FullBody.gltf']]) {
  const doc = await io.read(`${jpgDir}/${file}`);
  for (const anim of doc.getRoot().listAnimations()) anim.dispose();
  await doc.transform(...compress);
  await io.write(`${OUT}/${name}.glb`, doc);
  console.log('wrote', name);
}

// Hairstyles: one document holding every rigged hair mesh, named by style.
const HAIR = ['Hair_Buzzed', 'Hair_SimpleParted', 'Hair_Long', 'Hair_Buns', 'Hair_Beard', 'Eyebrows_Regular', 'Eyebrows_Female'];
const hairDoc = await io.read(`${jpgDir}/${HAIR[0]}.gltf`);
hairDoc.getRoot().listMeshes()[0].setName(HAIR[0]);
for (const n of HAIR.slice(1)) {
  const d = await io.read(`${jpgDir}/${n}.gltf`);
  d.getRoot().listMeshes()[0].setName(n);
  mergeDocuments(hairDoc, d);
}
await hairDoc.transform(unpartition(), ...compress);
await io.write(`${OUT}/hair.glb`, hairDoc);
console.log('wrote hair');

// Animations: only clips used at runtime, static channels dropped, no mesh.
const KEEP = new Set(['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Dance_Loop', 'Jump_Loop', 'Idle_Talking_Loop', 'Hit_Chest']);
const anim = await io.read(ualPath);
const root = anim.getRoot();
for (const a of root.listAnimations()) {
  if (KEEP.has(a.getName())) continue;
  for (const c of a.listChannels()) c.dispose();
  for (const s of a.listSamplers()) s.dispose();
  a.dispose();
}
for (const a of root.listAnimations()) {
  for (const channel of a.listChannels()) {
    const path = channel.getTargetPath();
    const node = channel.getTargetNode()?.getName() ?? '';
    const sampler = channel.getSampler();
    let drop = path === 'scale';
    // Bone lengths come from the body, so only root/pelvis keep translation.
    if (path === 'translation' && node !== 'root' && node !== 'pelvis') drop = true;
    if (drop) {
      channel.dispose();
      sampler.dispose();
    }
  }
}
for (const m of root.listMeshes()) m.dispose();
for (const n of root.listNodes()) if (n.getMesh()) n.setMesh(null);
await anim.transform(resample({ tolerance: 5e-4 }), dedup(), prune(), (d) => void sweepOrphans(d), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(`${OUT}/anims.glb`, anim);
console.log('wrote anims:', root.listAnimations().map((a) => a.getName()).join(', '));
