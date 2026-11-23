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
      // ---- v0.3 riverside (Drizzleville) ----
      walkway: [build([
        ...Array.from({ length: 9 }, (_, i) => Part.box(1.3, 0.08, 0.4).at(0, 0.32, -1.8 + i * 0.45).color(i % 2 ? 0x9b7650 : 0x8a6a44)),
        ...[-1.9, 0, 1.9].flatMap((z) => [-0.55, 0.55].map((x) => Part.box(0.1, 0.34, 0.1).at(x, 0.14, z).color(0x5a3c24))),
      ]), std],
      nets: [build([
        Part.box(0.1, 1.7, 0.1).at(-1.1, 0.85, 0).color(0x6b4a2e),
        Part.box(0.1, 1.7, 0.1).at(1.1, 0.85, 0).color(0x6b4a2e),
        Part.box(2.4, 0.07, 0.07).at(0, 1.65, 0).color(0x6b4a2e),
        Part.box(2.0, 1.1, 0.03).at(0, 1.05, 0).color(0x7fa7a0),
        ...[-0.6, 0, 0.6].map((x) => Part.ico(0.07, 0).at(x, 0.55, 0.03).color(0xf2c14e)),
        Part.box(0.35, 0.1, 0.18).at(0.3, 0.9, 0.04).color(0xc0d0d8),
      ]), std],
      umbrella: [build([
        Part.cyl(0.04, 0.04, 2.1, 5).at(0, 1.05, 0).color(0xe8e0d0),
        ...Array.from({ length: 8 }, (_, i) => Part.cone(0.55, 0.35, 3).rot(0, (i / 8) * Math.PI * 2, 0).at(Math.cos((i / 8) * Math.PI * 2) * 0.55, 2.05, Math.sin((i / 8) * Math.PI * 2) * 0.55).color(i % 2 ? 0x2bb3b1 : 0xffffff)),
        Part.cone(1.2, 0.45, 8).at(0, 2.2, 0).color(0x2bb3b1),
        Part.box(0.9, 0.08, 0.5).at(0.6, 0.45, 0.4).color(0x8a6a44),
      ]), std],
      boat: [build([
        Part.box(0.9, 0.35, 2.6).at(0, 0.3, 0).color(0x4f86c6),
        Part.box(0.7, 0.08, 2.4).at(0, 0.5, 0).color(0x9b7650),
        Part.cone(0.46, 0.7, 4).rot(Math.PI / 2, Math.PI / 4, 0).at(0, 0.3, 1.6).color(0x4f86c6),
        Part.box(0.06, 0.06, 1.8).rot(0.3, 0.2, 0).at(0.6, 0.35, -0.2).color(0x8a6a44),
      ]), std],
      barrels: [build([
        Part.cyl(0.32, 0.32, 0.7, 8).at(0, 0.35, 0).color(0x8a5a34),
        Part.cyl(0.33, 0.33, 0.06, 8).at(0, 0.55, 0).color(0x4a4a4a),
        Part.cyl(0.32, 0.32, 0.7, 8).at(0.7, 0.35, 0.1).color(0x8a5a34),
        Part.cyl(0.33, 0.33, 0.06, 8).at(0.7, 0.55, 0.1).color(0x4a4a4a),
        Part.cyl(0.3, 0.3, 0.6, 8).rot(Math.PI / 2, 0, 0.3).at(0.3, 0.3, -0.6).color(0x7a5232),
      ]), std],
      // ---- v0.3 mountain (Rockbottom) ----
      minecart: [build([
        Part.box(2.6, 0.06, 0.1).at(0, 0.05, 0.45).color(0x6e7a86),
        Part.box(2.6, 0.06, 0.1).at(0, 0.05, -0.45).color(0x6e7a86),
        ...[-1.1, -0.4, 0.3, 1.0].map((x) => Part.box(0.16, 0.05, 1.2).at(x, 0.02, 0).color(0x5a3c24)),
        Part.box(1.2, 0.6, 0.85).at(0, 0.55, 0).color(0x6b5a4a),
        Part.box(1.25, 0.08, 0.9).at(0, 0.88, 0).color(0x3f3a36),
        ...[-0.45, 0.45].flatMap((x) => [-0.45, 0.45].map((z) => Part.cyl(0.16, 0.16, 0.08, 8).rot(Math.PI / 2, 0, 0).at(x, 0.2, z).color(0x2f2b28))),
        Part.dodeca(0.26).at(-0.2, 0.98, 0.1).color(0x9aa0a6),
        Part.dodeca(0.22).at(0.25, 0.95, -0.15).color(0x8a9096),
      ]), std],
      stonepile: [build([
        Part.dodeca(0.55).scale(1.2, 0.6, 1).at(0, 0.3, 0).color(0x9aa0a6),
        Part.dodeca(0.4).at(0.7, 0.3, 0.3).color(0x8a9096),
        Part.dodeca(0.35).at(-0.6, 0.25, 0.4).color(0xa8adb2),
        Part.dodeca(0.3).at(0.1, 0.75, 0.1).color(0xb0b5ba),
        Part.box(0.7, 0.5, 0.6).at(-0.3, 0.25, -0.6).color(0xc2c6ca),
      ]), std],
      cairn: [build([
        Part.dodeca(0.5).scale(1.2, 0.5, 1.1).at(0, 0.25, 0).color(0x8a9096),
        Part.dodeca(0.4).scale(1.1, 0.5, 1).at(0.05, 0.65, 0).color(0x9aa0a6),
        Part.dodeca(0.3).scale(1, 0.55, 1).at(-0.03, 0.98, 0.02).color(0xa8adb2),
        Part.dodeca(0.2).at(0, 1.25, 0).color(0xb8bdc2),
      ]), std],
      brazier: [build([
        Part.cyl(0.08, 0.12, 1.2, 6).at(0, 0.6, 0).color(0x3a3430),
        Part.cyl(0.38, 0.22, 0.3, 8).at(0, 1.3, 0).color(0x4a4440),
        Part.cone(0.28, 0.5, 6).at(0, 1.65, 0).color(0xff8a2a),
        Part.cone(0.16, 0.36, 5).at(0.06, 1.75, 0.02).color(0xffd23f),
      ]), std],
      statue: [build([
        Part.box(1.6, 0.9, 1.6).at(0, 0.45, 0).color(0xe8e0d0),
        Part.box(1.8, 0.12, 1.8).at(0, 0.94, 0).color(0xd8cdb8),
        Part.box(0.5, 1.0, 0.36).at(0, 1.6, 0).color(0xf2c14e),
        Part.ico(0.32, 1).at(0, 2.42, 0).color(0xf2c14e),
        Part.torus(0.28, 0.05, 5, 14).rot(Math.PI / 2, 0, 0).at(0, 2.92, 0).color(0xfff1b8),
        Part.box(0.16, 0.7, 0.16).rot(0, 0, -0.9).at(0.42, 1.92, 0).color(0xf2c14e),
        Part.box(0.36, 0.46, 0.05).rot(0, 0, -0.2).at(0.7, 2.25, 0.08).color(0xfaf5ea),
        Part.box(0.16, 0.9, 0.16).at(-0.33, 1.5, 0).color(0xf2c14e),
      ]), std],
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

  /** Culture-specific street furniture: Rockbottom mines rock, Drizzleville lives on the water. */
  private cultureLayout(): Placement[] {
    const culture = this.village.identity?.culture ?? 'agricultural';
    const p: Placement[] = [];
    if (culture === 'riverside') {
      p.push({ kind: 'walkway', x: -3.8, z: -2.6, rot: 0.3 });
      p.push({ kind: 'walkway', x: 6.6, z: 7.4, rot: -0.5 });
      p.push({ kind: 'walkway', x: -12.8, z: -1.5, rot: 1.4 });
      p.push({ kind: 'nets', x: -12.2, z: -8.6, rot: 0.6 });
      p.push({ kind: 'nets', x: -13.4, z: 1.6, rot: 1.5 });
      p.push({ kind: 'umbrella', x: 3.2, z: -4.2, rot: 0 });
      p.push({ kind: 'umbrella', x: -3.4, z: 4.8, rot: 1 });
      p.push({ kind: 'boat', x: -14.5, z: -4.5, rot: 0.2 });
      p.push({ kind: 'boat', x: 15.5, z: -1.5, rot: 2.4 });
      p.push({ kind: 'barrels', x: 10.6, z: -6.4, rot: 0.4 });
      p.push({ kind: 'bench', x: 4.4, z: 1.8, rot: -1.2 });
      p.push({ kind: 'flowerbed', x: -2.0, z: -3.6, rot: 0.2 });
      p.push({ kind: 'signpost', x: -14, z: 7, rot: -1.4 });
    } else if (culture === 'mountain') {
      p.push({ kind: 'minecart', x: -4.6, z: -9.6, rot: 0.9 });
      p.push({ kind: 'minecart', x: -13.2, z: -1.6, rot: 1.6 });
      p.push({ kind: 'stonepile', x: 3.2, z: -4.2, rot: 0.5 });
      p.push({ kind: 'stonepile', x: -6.4, z: -1.2, rot: 2.1 });
      p.push({ kind: 'stonepile', x: 11.8, z: 5.0, rot: 1.1 });
      p.push({ kind: 'cairn', x: 2.4, z: 6.4, rot: 0 });
      p.push({ kind: 'cairn', x: -3.6, z: 4.6, rot: 1 });
      p.push({ kind: 'cairn', x: 3.4, z: -12.8, rot: 2 });
      p.push({ kind: 'brazier', x: 2.6, z: -6.2, rot: 0 });
      p.push({ kind: 'brazier', x: -2.6, z: -6.2, rot: 0 });
      p.push({ kind: 'logseat', x: -1.4, z: 3.2, rot: 0.3 });
      p.push({ kind: 'logseat', x: 1.8, z: 2.6, rot: -0.9 });
      p.push({ kind: 'cart', x: 12.2, z: -1.4, rot: 2.2 });
      p.push({ kind: 'signpost', x: 14, z: 3, rot: 1.6 });
    }
    return p;
  }

  private signSpot(): { x: number; z: number; rot: number } {
    const culture = this.village.identity?.culture ?? 'agricultural';
    if (culture === 'riverside') return { x: -14, z: 7, rot: -1.4 };
    if (culture === 'mountain') return { x: 14, z: 3, rot: 1.6 };
    return { x: -12.5, z: 17.5, rot: 0.75 };
  }

  /** Lanterns line every village's paths once the island has discovered them. */
  private lanterns(p: Placement[]): void {
    for (const b of this.buildings) {
      if (b.villageId !== this.village.id || b.type === 'well' || b.type === 'farm' || b.type === 'quarry' || b.type === 'fishery') continue;
      const dx = b.x - this.village.centerX;
      const dz = b.z - this.village.centerZ;
      const d = Math.hypot(dx, dz) || 1;
      const f = (d - b.footprint - 1.2) / d;
      p.push({ kind: 'lanternPost', x: dx * f - (dz / d) * 1.1, z: dz * f + (dx / d) * 1.1, rot: Math.atan2(dx, dz) });
    }
  }

  private layout(improvements: string[]): Placement[] {
    if ((this.village.identity?.culture ?? 'agricultural') !== 'agricultural') {
      const p = this.cultureLayout();
      if (improvements.includes('lanterns')) this.lanterns(p);
      return p;
    }
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
    if (improvements.includes('intern-statue')) p.push({ kind: 'statue', x: 6.2, z: -3.4, rot: -0.6, improvement: 'intern-statue' });
    if (improvements.includes('market')) p.push({ kind: 'market', x: -1.5, z: 6.8, rot: Math.PI + 0.2, improvement: 'market' });
    if (improvements.includes('lanterns')) this.lanterns(p);
    if (improvements.includes('gardens')) {
      for (const b of this.buildings) {
        if (b.type !== 'house' || b.villageId !== this.village.id) continue;
        const dx = b.x - this.village.centerX;
        const dz = b.z - this.village.centerZ;
        const d = Math.hypot(dx, dz) || 1;
        const side = hashUnit(b.id) > 0.5 ? 1 : -1;
        p.push({ kind: 'garden', x: dx + (dx / d) * 1.5 + (-dz / d) * 3.4 * side, z: dz + (dz / d) * 1.5 + (dx / d) * 3.4 * side, rot: Math.atan2(dx, dz) });
      }
    }
    if (improvements.includes('shrine-expansion')) {
      const shrine = this.buildings.find((b) => b.type === 'shrine' && b.villageId === this.village.id);
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
    const spot = this.signSpot();
    const sx = this.village.centerX + spot.x;
    const sz = this.village.centerZ + spot.z;
    this.sign.position.set(sx, this.terrain.heightAt(sx, sz) + 1.75, sz);
    this.sign.rotation.set(0, spot.rot, 0);
  }
}
