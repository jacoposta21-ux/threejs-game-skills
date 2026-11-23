import * as THREE from 'three';
import type { BuildingData, VillageData } from '../core/types';
import { build, flatMaterial, hashUnit, Part } from '../render/ModelKit';
import type { TerrainData } from './TerrainGen';

interface Placement {
  kind: string;
  x: number; // village-relative
  z: number;
  rot: number;
  color?: number;
  improvement?: string;
}

/**
 * Hand-placed village dressing: benches, a gathering circle, carts, clotheslines,
 * lanterns, flower beds and a village sign. Improvements (gardens, market,
 * lanterns, shrine expansion) appear only once the village has earned them.
 * Static instanced batches; rebuilt only when the improvement set changes.
 */
export class VillageDecor {
  readonly group = new THREE.Group();
  private readonly meshes = new Map<string, THREE.InstancedMesh>();
  private readonly lanternGlass: THREE.MeshStandardMaterial;
  private key = '';
  private readonly sign: THREE.Mesh;

  constructor(
    private readonly terrain: TerrainData,
    private readonly village: VillageData,
    private readonly buildings: BuildingData[],
  ) {
    const std = flatMaterial();
    this.lanternGlass = new THREE.MeshStandardMaterial({ color: 0xfff1c4, emissive: 0xffb84a, emissiveIntensity: 0.2, flatShading: true });
    const geos: Record<string, [THREE.BufferGeometry, THREE.Material]> = {
      bench: [build([Part.box(1.5, 0.12, 0.42).at(0, 0.46, 0).color(0x9b7650), Part.box(1.5, 0.35, 0.08).at(0, 0.7, -0.18).color(0x8a6a44), Part.box(0.1, 0.46, 0.36).at(-0.62, 0.23, 0).color(0x6b4a2e), Part.box(0.1, 0.46, 0.36).at(0.62, 0.23, 0).color(0x6b4a2e)]), std],
      logseat: [build([Part.cyl(0.25, 0.27, 1.5, 7).rot(0, 0, Math.PI / 2).at(0, 0.25, 0).color(0x8a5a34), Part.cyl(0.22, 0.22, 0.02, 7).rot(0, 0, Math.PI / 2).at(0.76, 0.25, 0).color(0xe3c08a)]), std],
      cart: [build([
        Part.box(1.6, 0.5, 1.0).at(0, 0.75, 0).color(0x9b6a3e),
        Part.box(1.7, 0.1, 1.1).at(0, 0.5, 0).color(0x6b4a2e),
        Part.cyl(0.42, 0.42, 0.1, 10).rot(Math.PI / 2, 0, 0).at(0.2, 0.42, 0.58).color(0x5a3a24),
        Part.cyl(0.42, 0.42, 0.1, 10).rot(Math.PI / 2, 0, 0).at(0.2, 0.42, -0.58).color(0x5a3a24),
        Part.box(1.4, 0.06, 0.08).at(-1.4, 0.55, 0.3).color(0x6b4a2e),
        Part.box(1.4, 0.06, 0.08).at(-1.4, 0.55, -0.3).color(0x6b4a2e),
        Part.ico(0.22, 0).at(0.2, 1.1, 0.1).color(0xe67e22),
        Part.ico(0.2, 0).at(-0.3, 1.08, -0.2).color(0x5cb85c),
      ]), std],
      clothesline: [build([
        Part.box(0.1, 1.9, 0.1).at(0, 0.95, -2).color(0x6b4a2e),
        Part.box(0.1, 1.9, 0.1).at(0, 0.95, 2).color(0x6b4a2e),
        Part.box(0.02, 0.02, 4).at(0, 1.8, 0).color(0xe8e0d0),
        Part.box(0.04, 0.6, 0.5).at(0, 1.48, -1.2).color(0xd9534f),
        Part.box(0.04, 0.45, 0.6).at(0, 1.55, -0.2).color(0x4f86c6),
        Part.box(0.04, 0.7, 0.35).at(0, 1.43, 0.7).color(0xf0ad4e),
        Part.box(0.04, 0.35, 0.3).at(0, 1.6, 1.4).color(0xffffff),
      ]), std],
      lanternPost: [build([Part.cyl(0.05, 0.07, 2.0, 5).at(0, 1.0, 0).color(0x3a2a1c), Part.box(0.5, 0.05, 0.05).at(0.22, 1.95, 0).color(0x3a2a1c), Part.cone(0.2, 0.18, 4).rot(0, Math.PI / 4, 0).at(0.45, 1.98, 0).color(0x3a2a1c)]), std],
      lanternGlass: [build([Part.box(0.2, 0.26, 0.2).at(0.45, 1.75, 0)]), this.lanternGlass],
      flowerbed: [build([Part.box(1.4, 0.18, 0.6).at(0, 0.09, 0).color(0x8a5a34), ...[0, 1, 2, 3, 4, 5].map((i) => Part.ico(0.12, 0).at(-0.55 + i * 0.22, 0.26, (i % 2) * 0.15 - 0.07).color([0xff6b8b, 0xffd23f, 0xb388ff, 0xffffff, 0xff9f43, 0xff6b8b][i]))]), std],
      garden: [build([
        Part.box(2.6, 0.12, 1.8).at(0, 0.06, 0).color(0x7a5232),
        ...[0, 1, 2].map((r) => Part.box(2.2, 0.1, 0.25).at(0, 0.14, -0.55 + r * 0.55).color(0x5e3e24)),
        ...Array.from({ length: 9 }, (_, i) => Part.cone(0.14, 0.32, 5).at(-0.8 + (i % 3) * 0.8, 0.3, -0.55 + Math.floor(i / 3) * 0.55).color(0x5fae3e)),
        ...[-1.4, 1.4].flatMap((x) => [-1, 0, 1].map((z) => Part.box(0.07, 0.55, 0.07).at(x, 0.27, z * 0.9).color(0xe8dcc0))),
        Part.box(0.04, 0.06, 1.9).at(-1.4, 0.45, 0).color(0xe8dcc0),
        Part.box(0.04, 0.06, 1.9).at(1.4, 0.45, 0).color(0xe8dcc0),
      ]), std],
      market: [build([
        Part.box(2.6, 0.9, 1.1).at(0, 0.45, 0).color(0xb5553c),
        Part.box(2.7, 0.08, 1.2).at(0, 0.92, 0).color(0xe3c08a),
        ...[-1.2, 1.2].flatMap((x) => [-0.5, 0.5].map((z) => Part.box(0.08, 1.9, 0.08).at(x, 0.95, z).color(0x6b4a2e))),
        ...[0, 1, 2, 3, 4, 5].map((i) => Part.box(0.45, 0.06, 1.5).rot(0.25, 0, 0).at(-1.12 + i * 0.45, 2.0, 0.05).color(i % 2 ? 0xffffff : 0xe63946)),
        ...[0, 1, 2, 3].map((i) => Part.ico(0.15, 0).at(-0.8 + i * 0.5, 1.08, 0.1).color([0xe67e22, 0x5cb85c, 0xf2c14e, 0xd9534f][i])),
      ]), std],
      pillar: [build([Part.cyl(0.14, 0.17, 2.6, 7).at(0, 1.3, 0).color(0xfaf5ea), Part.box(0.42, 0.14, 0.42).at(0, 2.66, 0).color(0xf2c14e)]), std],
      signpost: [build([Part.box(0.14, 2.2, 0.14).at(-1.0, 1.1, 0).color(0x6b4a2e), Part.box(0.14, 2.2, 0.14).at(1.0, 1.1, 0).color(0x6b4a2e)]), std],
      fence: [build([...[-1.5, -0.5, 0.5, 1.5].map((x) => Part.box(0.09, 0.7, 0.09).at(x, 0.35, 0).color(0xd8c7a3)), Part.box(3.2, 0.07, 0.05).at(0, 0.5, 0).color(0xd8c7a3), Part.box(3.2, 0.07, 0.05).at(0, 0.25, 0).color(0xd8c7a3)]), std],
    };
    for (const [kind, [geo, mat]] of Object.entries(geos)) {
      const mesh = new THREE.InstancedMesh(geo, mat, 24);
      mesh.castShadow = kind !== 'lanternGlass';
      mesh.receiveShadow = true;
      mesh.count = 0;
      mesh.name = `decor-${kind}`;
      this.meshes.set(kind, mesh);
      this.group.add(mesh);
    }
    // Village sign with painted name.
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 160;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#e3c08a';
    ctx.fillRect(0, 0, 512, 160);
    ctx.strokeStyle = '#6b4a2e';
    ctx.lineWidth = 14;
    ctx.strokeRect(8, 8, 496, 144);
    ctx.fillStyle = '#3a2a1c';
    ctx.font = 'bold 72px "Fredoka", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(village.name.toUpperCase(), 256, 84);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.sign = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.75, 0.08), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
    this.sign.castShadow = true;
    this.group.add(this.sign);
  }

  private layout(improvements: string[]): Placement[] {
    const p: Placement[] = [];
    // Plaza benches and the gathering circle.
    for (const a of [0.7, 2.5, 4.4]) p.push({ kind: 'bench', x: Math.cos(a) * 4.6, z: Math.sin(a) * 4.6, rot: -a - Math.PI / 2 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      p.push({ kind: 'logseat', x: -5 + Math.cos(a) * 2.3, z: 4 + Math.sin(a) * 2.3, rot: -a });
    }
    p.push({ kind: 'cart', x: 8.6, z: 5.2, rot: 0.4 });
    p.push({ kind: 'clothesline', x: -15.5, z: 2, rot: 0 });
    p.push({ kind: 'clothesline', x: 10.8, z: -11.6, rot: 1.1 });
    p.push({ kind: 'flowerbed', x: 3.0, z: 1.8, rot: 0.6 });
    p.push({ kind: 'flowerbed', x: -2.6, z: 2.6, rot: -0.8 });
    p.push({ kind: 'fence', x: 14.2, z: 0.5, rot: Math.PI / 2 });
    p.push({ kind: 'signpost', x: -12.5, z: 17.5, rot: 0.75 });
    if (improvements.includes('market')) p.push({ kind: 'market', x: -1.5, z: 6.8, rot: Math.PI + 0.2, improvement: 'market' });
    if (improvements.includes('lanterns')) {
      for (const b of this.buildings) {
        if (b.type === 'well' || b.type === 'farm') continue;
        const dx = b.x - this.village.centerX;
        const dz = b.z - this.village.centerZ;
        const d = Math.hypot(dx, dz);
        const f = (d - b.footprint - 1.2) / d;
        p.push({ kind: 'lanternPost', x: dx * f - (dz / d) * 1.1, z: dz * f + (dx / d) * 1.1, rot: Math.atan2(dx, dz) });
      }
    }
    if (improvements.includes('gardens')) {
      for (const b of this.buildings) {
        if (b.type !== 'house') continue;
        const dx = b.x - this.village.centerX;
        const dz = b.z - this.village.centerZ;
        const d = Math.hypot(dx, dz) || 1;
        const side = hashUnit(b.id) > 0.5 ? 1 : -1;
        p.push({ kind: 'garden', x: dx + (dx / d) * 1.5 + (-dz / d) * 3.4 * side, z: dz + (dz / d) * 1.5 + (dx / d) * 3.4 * side, rot: Math.atan2(dx, dz) });
      }
    }
    if (improvements.includes('shrine-expansion')) {
      const shrine = this.buildings.find((b) => b.type === 'shrine');
      if (shrine) {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          p.push({ kind: 'pillar', x: shrine.x - this.village.centerX + Math.cos(a) * 3.6, z: shrine.z - this.village.centerZ + Math.sin(a) * 3.6, rot: a });
        }
      }
    }
    return p;
  }

  update(improvements: string[], night: number): void {
    this.lanternGlass.emissiveIntensity = 0.15 + night * 2.2;
    const key = improvements.join(',');
    if (key === this.key) return;
    this.key = key;
    const dummy = new THREE.Object3D();
    const counts = new Map<string, number>();
    for (const m of this.meshes.values()) {
      m.count = 0;
      m.visible = false;
    }
    for (const pl of this.layout(improvements)) {
      const kinds = pl.kind === 'lanternPost' ? ['lanternPost', 'lanternGlass'] : [pl.kind];
      const x = this.village.centerX + pl.x;
      const z = this.village.centerZ + pl.z;
      for (const kind of kinds) {
        const mesh = this.meshes.get(kind)!;
        const i = counts.get(kind) ?? 0;
        dummy.position.set(x, this.terrain.heightAt(x, z) - 0.02, z);
        dummy.rotation.set(0, pl.rot, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        counts.set(kind, i + 1);
        mesh.count = i + 1;
        mesh.visible = true;
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
    const sx = this.village.centerX - 12.5;
    const sz = this.village.centerZ + 17.5;
    this.sign.position.set(sx, this.terrain.heightAt(sx, sz) + 1.75, sz);
    this.sign.rotation.set(0, 0.75, 0);
  }
}
