import * as THREE from 'three';
import type { BuildingData, VillageCulture, VillageData } from '../core/types';
import { build, flatMaterial, Part } from '../render/ModelKit';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { TerrainData } from '../world/TerrainGen';

const ROOF_COLORS = [0xd2553f, 0x3f78b5, 0xe0a13a, 0x6a9e4a];
const STONE = 0x9e968c;
const TIMBER = 0x6b4a2e;
const PLASTER = 0xf3e3c3;

const STYLE_ROOFS: Record<VillageCulture, number[]> = {
  agricultural: ROOF_COLORS,
  mountain: [0x5d6670, 0x6b4a2e, 0x4a5560, 0x7a5a3a],
  riverside: [0x2a9d8f, 0x3f78b5, 0x48b5d4, 0x1d6f8c],
};
const STYLE_WALLS: Record<VillageCulture, number> = { agricultural: PLASTER, mountain: 0xa9773f, riverside: 0xe6f0ee };

function houseGeometry(variant: number, style: VillageCulture = 'agricultural'): THREE.BufferGeometry {
  const roof = STYLE_ROOFS[style][variant % 4];
  const wall = STYLE_WALLS[style];
  const extra: Part[] =
    style === 'mountain'
      ? [
          // Log-cabin courses and a heavy stone base.
          Part.box(3.8, 0.9, 3.4).at(0, 0.3, 0).color(0x8a8178, 0.05),
          ...[0.9, 1.4, 1.9].map((y) => Part.box(3.3, 0.1, 2.9).at(0, y, 0).color(0x6b4a2e)),
          Part.box(0.6, 1.0, 0.6).at(-1.2, 3.2, -0.6).color(0x7d736e),
        ]
      : style === 'riverside'
        ? [
            // Stilts, a little porch and a hanging umbrella of optimism.
            ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => Part.cyl(0.08, 0.09, 0.6, 5).at(sx * 1.7, 0.1, sz * 1.5).color(0x6b4a2e))),
            Part.box(3.6, 0.1, 1.0).at(0, 0.45, 2.0).color(0xb08a60),
            Part.box(0.06, 0.6, 0.06).at(1.6, 0.75, 2.4).color(0x6b4a2e),
            Part.cone(0.5, 0.3, 8).at(1.6, 1.15, 2.4).color(0xf2c14e),
          ]
        : [];
  const parts = [
    ...extra,
    Part.box(3.6, 0.45, 3.2).at(0, 0.2, 0).color(STONE, 0.04),
    Part.box(3.2, 2.0, 2.8).at(0, 1.42, 0).color(wall, 0.02),
    Part.box(3.36, 0.16, 2.96).at(0, 2.45, 0).color(TIMBER),
    Part.box(3.36, 0.14, 2.96).at(0, 0.5, 0).color(TIMBER),
    Part.prism(3.2, 1.25, 2.8).at(0, 2.42, 0).color(wall, 0.02),
    Part.prism(3.9, 1.6, 3.5).at(0, 2.5, 0).color(roof, 0.04),
    Part.box(0.14, 0.14, 3.6).at(0, 4.1, 0).color(0x5a3a24),
    Part.box(0.5, 1.4, 0.5).at(0.95, 3.4, -0.55).color(0x8a7f76),
    Part.box(0.62, 0.14, 0.62).at(0.95, 4.12, -0.55).color(0x6e655e),
    Part.box(0.8, 1.3, 0.1).at(0, 1.07, 1.42).color(0x8a5a34),
    Part.box(1.0, 0.12, 0.14).at(0, 1.78, 1.43).color(TIMBER),
    Part.box(0.72, 0.14, 0.24).at(-0.95, 1.12, 1.5).color(0x5f8f3a),
    Part.box(0.72, 0.14, 0.24).at(0.95, 1.12, 1.5).color(0x5f8f3a),
    Part.ico(0.08, 0).at(-1.1, 1.24, 1.55).color(0xff6b8b),
    Part.ico(0.08, 0).at(-0.8, 1.24, 1.55).color(0xffd23f),
    Part.ico(0.08, 0).at(0.9, 1.24, 1.55).color(0xffffff),
    Part.ico(0.08, 0).at(1.15, 1.24, 1.55).color(0xff6b8b),
    // Corner posts
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => Part.box(0.18, 2.0, 0.18).at(sx * 1.6, 1.42, sz * 1.4).color(TIMBER))),
    // Flag pole
    Part.cyl(0.04, 0.05, 2.0, 5).at(0, 4.95, 1.65).color(0x5a3a24),
    // Steps
    Part.box(1.0, 0.18, 0.4).at(0, 0.1, 1.75).color(0x8a8178),
  ];
  return build(parts);
}

function windowGeometry(): THREE.BufferGeometry {
  return build([
    Part.box(0.55, 0.55, 0.06).at(-0.95, 1.62, 1.42),
    Part.box(0.55, 0.55, 0.06).at(0.95, 1.62, 1.42),
    Part.box(0.06, 0.55, 0.55).at(1.62, 1.62, 0),
    Part.box(0.06, 0.55, 0.55).at(-1.62, 1.62, 0),
    Part.box(0.4, 0.4, 0.06).at(0, 3.0, 1.42),
  ]);
}

function wellGeometry(): THREE.BufferGeometry {
  return build([
    Part.cyl(1.25, 1.35, 0.25, 12).at(0, 0.12, 0).color(0xa59d92),
    Part.cyl(1.0, 1.05, 0.95, 10, true).at(0, 0.6, 0).color(0x9a9187, 0.06),
    Part.torus(1.0, 0.13, 5, 12).rot(Math.PI / 2, 0, 0).at(0, 1.08, 0).color(0xb3aba0),
    Part.cyl(0.82, 0.82, 0.05, 10).at(0, 0.18, 0).color(0x24303a),
    Part.box(0.16, 2.1, 0.16).at(-1.0, 1.6, 0).color(TIMBER),
    Part.box(0.16, 2.1, 0.16).at(1.0, 1.6, 0).color(TIMBER),
    Part.cyl(0.07, 0.07, 2.2, 6).rot(0, 0, Math.PI / 2).at(0, 2.2, 0).color(0x8a6a44),
    Part.prism(1.7, 0.75, 2.6).rot(0, Math.PI / 2, 0).at(0, 2.55, 0).color(0xc65a3e, 0.04),
    Part.cyl(0.18, 0.15, 0.3, 7).at(0.15, 1.55, 0).color(0x8a5a34),
    Part.cyl(0.012, 0.012, 0.6, 3).at(0.15, 1.95, 0).color(0x3a2a1c),
  ]);
}

function farmGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [Part.box(11, 0.16, 8).at(0, 0.02, 0).color(0x8b5e3c, 0.03)];
  for (let i = 0; i < 6; i++) parts.push(Part.box(10.4, 0.14, 0.5).at(0, 0.14, -3 + i * 1.2).color(0x6e4a2e));
  // Fence posts and rails
  for (let x = -5.6; x <= 5.61; x += 1.4) {
    parts.push(Part.box(0.14, 0.8, 0.14).at(x, 0.4, -4.2).color(0x9b7650));
    parts.push(Part.box(0.14, 0.8, 0.14).at(x, 0.4, 4.2).color(0x9b7650));
  }
  for (let z = -4.2; z <= 4.21; z += 1.4) {
    parts.push(Part.box(0.14, 0.8, 0.14).at(-5.6, 0.4, z).color(0x9b7650));
    if (Math.abs(z) > 1) parts.push(Part.box(0.14, 0.8, 0.14).at(5.6, 0.4, z).color(0x9b7650));
  }
  parts.push(Part.box(11.3, 0.08, 0.06).at(0, 0.6, -4.2).color(0xb08a60));
  parts.push(Part.box(11.3, 0.08, 0.06).at(0, 0.6, 4.2).color(0xb08a60));
  parts.push(Part.box(0.06, 0.08, 8.4).at(-5.6, 0.6, 0).color(0xb08a60));
  // Scarecrow
  parts.push(Part.cyl(0.05, 0.05, 2.0, 4).at(4.2, 1.0, -2.6).color(0x8a6a44));
  parts.push(Part.cyl(0.04, 0.04, 1.3, 4).rot(0, 0, Math.PI / 2).at(4.2, 1.45, -2.6).color(0x8a6a44));
  parts.push(Part.box(0.5, 0.6, 0.25).at(4.2, 1.3, -2.6).color(0x4f86c6));
  parts.push(Part.ico(0.22, 0).at(4.2, 1.85, -2.6).color(0xe8d28a));
  parts.push(Part.cone(0.4, 0.35, 7).at(4.2, 2.1, -2.6).color(0xc9a24a));
  // Haystack
  parts.push(Part.sphere(0.9, 8, 5, Math.PI / 2).scale(1, 1.1, 1).at(-6.6, 0, 3.4).color(0xe6c35c, 0.04));
  parts.push(Part.sphere(0.7, 8, 5, Math.PI / 2).at(-6.5, 0, 2.1).color(0xdcb44f, 0.04));
  return build(parts);
}

function cropGeometry(): THREE.BufferGeometry {
  return build([
    Part.cone(0.22, 0.7, 5).at(0, 0.35, 0).color(0xffffff),
    Part.cone(0.16, 0.5, 5).rot(0.4, 0, 0.2).at(0.12, 0.3, 0.05).color(0xffffff),
    Part.ico(0.1, 0).at(0, 0.75, 0).color(0xfff1a8),
  ]);
}

function storageGeometry(): THREE.BufferGeometry {
  return build([
    Part.box(4.8, 0.35, 4.0).at(0, 0.17, 0).color(STONE),
    Part.box(4.4, 2.6, 3.6).at(0, 1.6, 0).color(0xb5553c, 0.03),
    Part.gambrel(4.4, 1.9, 3.6).at(0, 2.9, 0).color(0xb5553c, 0.03),
    Part.gambrel(5.0, 2.15, 4.0).at(0, 2.88, 0).scale(1, 1, 1).color(0x5b3a2c, 0.04),
    Part.box(1.9, 2.0, 0.08).at(0, 1.35, 1.82).color(0x7a3b2a),
    Part.box(2.1, 0.14, 0.12).at(0, 2.4, 1.86).color(0xf5ecd7),
    Part.box(0.12, 2.1, 0.12).at(-1.0, 1.35, 1.86).color(0xf5ecd7),
    Part.box(0.12, 2.1, 0.12).at(1.0, 1.35, 1.86).color(0xf5ecd7),
    Part.box(0.1, 2.5, 0.1).rot(0, 0, 0.75).at(-0.48, 1.35, 1.87).color(0xf5ecd7),
    Part.box(0.1, 2.5, 0.1).rot(0, 0, -0.75).at(0.48, 1.35, 1.87).color(0xf5ecd7),
    Part.box(0.8, 0.8, 0.8).at(1.9, 0.75, 2.4).color(0xc49a62),
    Part.box(0.6, 0.6, 0.6).rot(0, 0.5, 0).at(2.1, 1.45, 2.3).color(0xb88d55),
    Part.cyl(0.35, 0.32, 0.8, 8).at(-2.0, 0.75, 2.4).color(0x8a5a34),
    Part.cyl(0.36, 0.36, 0.06, 8).at(-2.0, 0.95, 2.4).color(0x55402c),
  ]);
}

function shrineGeometry(): THREE.BufferGeometry {
  const parts = [
    Part.cyl(2.4, 2.6, 0.45, 8).at(0, 0.22, 0).color(0xe3dccd),
    Part.cyl(1.95, 2.1, 0.4, 8).at(0, 0.64, 0).color(0xece6da),
    Part.cyl(1.9, 1.9, 0.22, 8).at(0, 3.0, 0).color(0xf4eee2),
    Part.sphere(1.55, 8, 4, Math.PI / 2).at(0, 3.1, 0).color(0xf2c14e, 0.03),
    Part.cone(0.18, 0.7, 6).at(0, 4.85, 0).color(0xf6d36b),
    Part.box(0.9, 0.75, 0.7).at(0, 1.2, 0).color(0xd8cfbe),
    Part.box(1.0, 0.1, 0.8).at(0, 1.6, 0).color(0xf2c14e),
    Part.box(1.4, 0.2, 0.8).at(0, 0.1, 2.6).color(0xd6cfc2),
  ];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    parts.push(Part.cyl(0.15, 0.17, 2.2, 7).at(Math.cos(a) * 1.5, 1.95, Math.sin(a) * 1.5).color(0xfaf5ea));
  }
  return build(parts);
}

function quarryGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [
    Part.cyl(2.6, 2.2, 0.3, 9).at(0, -0.05, 0).color(0x7d736e),
    ...Array.from({ length: 8 }, (_, i) => Part.box(0.8, 0.6, 0.7).rot(0, i * 0.8, 0).at(Math.cos(i * 0.8) * 2.4, 0.3, Math.sin(i * 0.8) * 2.4).color(i % 2 ? 0xb8b0a6 : 0x9e968c)),
    // Wooden crane.
    Part.box(0.16, 3.2, 0.16).rot(0, 0, 0.18).at(-1.2, 1.6, -1.2).color(0x6b4a2e),
    Part.box(0.16, 3.2, 0.16).rot(0, 0, -0.18).at(-0.2, 1.6, -1.2).color(0x6b4a2e),
    Part.box(2.6, 0.14, 0.14).at(0.4, 3.1, -1.2).color(0x6b4a2e),
    Part.box(0.03, 1.2, 0.03).at(1.4, 2.45, -1.2).color(0xd8c7a3),
    Part.box(0.6, 0.45, 0.5).at(1.4, 1.65, -1.2).color(0xc9c2b8),
    // Cut blocks and a pickaxe.
    Part.box(0.7, 0.5, 0.5).at(1.6, 0.25, 1.3).color(0xc9c2b8),
    Part.box(0.7, 0.5, 0.5).at(1.6, 0.75, 1.3).color(0xbfb7ad),
    Part.box(0.7, 0.5, 0.5).at(0.8, 0.25, 1.6).color(0xd0c9c0),
    Part.box(0.05, 0.9, 0.05).rot(0, 0, 0.9).at(-1.6, 0.4, 1.4).color(0x8a6a44),
    Part.box(0.6, 0.06, 0.08).rot(0, 0, 0.9).at(-1.25, 0.7, 1.4).color(0x9aa4b8),
  ];
  return build(parts);
}

function fisheryGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [
    Part.box(3.4, 0.2, 2.6).at(0, 0.1, 0).color(0xb08a60),
    ...[-1.4, 1.4].map((x) => Part.box(0.1, 1.6, 0.1).at(x, 0.9, -0.8).color(0x6b4a2e)),
    Part.box(3.0, 0.06, 0.06).at(0, 1.6, -0.8).color(0x6b4a2e),
    ...Array.from({ length: 6 }, (_, i) => Part.ico(0.12, 0).scale(0.6, 2.2, 0.35).at(-1.1 + i * 0.44, 1.2, -0.8).color(0xb8c8d4)),
    Part.box(2.8, 0.04, 1.2).rot(0.35, 0, 0).at(0, 0.9, 0.5).color(0x3a4a5e),
    Part.cyl(0.32, 0.3, 0.6, 8).at(1.3, 0.5, 0.9).color(0x8a5a34),
    Part.cyl(0.3, 0.28, 0.5, 8).at(0.6, 0.45, 1.0).color(0x9b6a3e),
    // A small boat, drying upside down.
    Part.sphere(0.6, 8, 4, Math.PI / 2).scale(2.2, 0.6, 0.9).rot(Math.PI, 0, 0).at(-0.6, 0.55, 0.9).color(0x2a9d8f),
  ];
  return build(parts);
}

function elevatedShrine(): THREE.BufferGeometry {
  const parts: Part[] = [
    Part.cyl(3.0, 3.4, 1.3, 8).at(0, 0.65, 0).color(0x8a8178, 0.05),
    Part.box(1.6, 0.35, 1.2).at(0, 0.18, 3.2).color(0x8a8178),
    Part.box(1.6, 0.35, 0.9).at(0, 0.53, 2.6).color(0x8a8178),
    Part.box(1.6, 0.35, 0.8).at(0, 0.88, 2.1).color(0x8a8178),
  ];
  const base = build(parts);
  const top = shrineGeometry().clone();
  top.translate(0, 1.3, 0);
  const merged = mergeGeometries([base, top]);
  return merged ?? base;
}

function rubbleGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [Part.cyl(2.2, 2.6, 0.3, 9).at(0, 0.12, 0).color(0x3b3430)];
  const pos: Array<[number, number, number]> = [[0.6, 0.3, 0.4], [-0.8, 0.3, -0.2], [0.1, 0.5, -0.7], [-0.3, 0.3, 1.0], [1.2, 0.25, -0.6]];
  pos.forEach(([x, y, z], i) => parts.push(Part.dodeca(0.45 + (i % 2) * 0.2).jitter(0.15, i).at(x, y, z).color(i % 2 ? 0x6b625a : 0x4a423c)));
  parts.push(Part.box(0.18, 0.18, 2.6).rot(0.3, 0.6, 0.2).at(0, 0.6, 0).color(0x1e1916));
  parts.push(Part.box(0.16, 0.16, 2.0).rot(-0.2, -0.9, 0.3).at(0.4, 0.5, 0.3).color(0x231c18));
  parts.push(Part.box(0.16, 1.2, 0.16).rot(0.2, 0, 0.25).at(-1.1, 0.6, 0.8).color(0x231c18));
  return build(parts);
}

interface BuildingView {
  data: BuildingData;
  group: THREE.Group;
  main: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  rubble: THREE.Mesh;
  extras: {
    windows?: THREE.Mesh;
    flag?: THREE.Mesh;
    water?: THREE.Mesh;
    crops?: THREE.InstancedMesh;
    logs?: THREE.InstancedMesh;
    sacks?: THREE.InstancedMesh;
    halo?: THREE.Mesh;
    orb?: THREE.Mesh;
  };
  lastHealth: number;
  lastDestroyed: boolean;
}

/** Builds and updates every village building from logical state. */
export class BuildingRenderer {
  readonly group = new THREE.Group();
  readonly pickables: THREE.Object3D[] = [];
  private readonly views: BuildingView[] = [];
  private readonly windowMat = new THREE.MeshStandardMaterial({ color: 0x3a4a5e, emissive: 0xffc46b, emissiveIntensity: 0, roughness: 0.4, flatShading: true });
  private readonly haloMat = new THREE.MeshBasicMaterial({ color: 0xffd66b, transparent: true, opacity: 0.85 });
  private readonly orbMat = new THREE.MeshStandardMaterial({ color: 0xfff1b8, emissive: 0xffc94a, emissiveIntensity: 1.2, flatShading: true });
  private readonly waterMat = new THREE.MeshStandardMaterial({ color: 0x3ab7e0, emissive: 0x0b3a50, roughness: 0.2, flatShading: true });
  private readonly flagMat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, flatShading: true, roughness: 0.8 });
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();
  private readonly geo = {
    house: [0, 1, 2, 3].map((v) => houseGeometry(v)),
    houseStyled: {
      mountain: [0, 1, 2, 3].map((v) => houseGeometry(v, 'mountain')),
      riverside: [0, 1, 2, 3].map((v) => houseGeometry(v, 'riverside')),
    } as Record<string, THREE.BufferGeometry[]>,
    quarry: quarryGeometry(),
    fishery: fisheryGeometry(),
    shrineHigh: elevatedShrine(),
    windows: windowGeometry(),
    well: wellGeometry(),
    farm: farmGeometry(),
    crop: cropGeometry(),
    storage: storageGeometry(),
    shrine: shrineGeometry(),
    rubble: rubbleGeometry(),
    log: build([Part.cyl(0.16, 0.16, 1.4, 6).rot(0, 0, Math.PI / 2).color(0x9b6a3e), Part.cyl(0.13, 0.13, 1.42, 6).rot(0, 0, Math.PI / 2).color(0xe3c08a)]),
    sack: build([Part.ico(0.32, 0).scale(1, 1.2, 1).color(0xd9c08a), Part.cyl(0.08, 0.12, 0.12, 5).at(0, 0.38, 0).color(0xb59a62)]),
    flag: (() => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, -0.45, 0, 0.75, -0.22, 0], 3));
      g.computeVertexNormals();
      return g;
    })(),
    water: new THREE.CircleGeometry(0.8, 12).rotateX(-Math.PI / 2),
    halo: new THREE.TorusGeometry(0.75, 0.07, 6, 24),
    orb: new THREE.IcosahedronGeometry(0.28, 1),
  };

  constructor(buildings: BuildingData[], private readonly terrain: TerrainData) {
    for (const b of buildings) this.create(b);
  }

  private create(b: BuildingData): void {
    const group = new THREE.Group();
    group.position.set(b.x, this.baseHeight(b), b.z);
    group.rotation.y = b.rotation;
    const material = flatMaterial();
    let geometry: THREE.BufferGeometry;
    const extras: BuildingView['extras'] = {};
    switch (b.type) {
      case 'house':
        geometry = b.style && b.style !== 'agricultural' ? this.geo.houseStyled[b.style][b.variant % 4] : this.geo.house[b.variant % 4];
        extras.windows = new THREE.Mesh(this.geo.windows, this.windowMat);
        extras.flag = new THREE.Mesh(this.geo.flag, this.flagMat.clone());
        (extras.flag.material as THREE.MeshStandardMaterial).color.set([0xf2c14e, 0xe8455a, 0x4fd1c5, 0xffffff][b.variant % 4]);
        extras.flag.position.set(0.02, 5.9, 1.65);
        break;
      case 'well':
        geometry = this.geo.well;
        extras.water = new THREE.Mesh(this.geo.water, this.waterMat);
        break;
      case 'farm': {
        geometry = this.geo.farm;
        const crops = new THREE.InstancedMesh(this.geo.crop, flatMaterial(), 72);
        crops.castShadow = true;
        extras.crops = crops;
        break;
      }
      case 'storage': {
        geometry = this.geo.storage;
        extras.logs = new THREE.InstancedMesh(this.geo.log, flatMaterial(), 16);
        extras.sacks = new THREE.InstancedMesh(this.geo.sack, flatMaterial(), 14);
        extras.logs.castShadow = true;
        break;
      }
      case 'shrine': {
        // Rockbottom keeps its shrine up on a stone platform.
        const lift = b.style === 'mountain' ? 1.3 : 0;
        geometry = lift ? this.geo.shrineHigh : this.geo.shrine;
        extras.halo = new THREE.Mesh(this.geo.halo, this.haloMat);
        extras.halo.position.set(0, 6.0 + lift, 0);
        extras.orb = new THREE.Mesh(this.geo.orb, this.orbMat);
        extras.orb.position.set(0, 2.05 + lift, 0);
        break;
      }
      case 'quarry':
        geometry = this.geo.quarry;
        break;
      case 'fishery':
        geometry = this.geo.fishery;
        break;
    }
    const main = new THREE.Mesh(geometry, material);
    main.castShadow = true;
    main.receiveShadow = true;
    main.userData.buildingId = b.id;
    main.name = `building-${b.type}-${b.id}`;
    group.add(main);
    for (const extra of Object.values(extras)) if (extra) group.add(extra);
    const rubble = new THREE.Mesh(this.geo.rubble, flatMaterial());
    rubble.visible = false;
    rubble.castShadow = true;
    rubble.userData.buildingId = b.id;
    if (b.type === 'farm') rubble.scale.set(1.8, 0.6, 1.4);
    group.add(rubble);
    this.pickables.push(main, rubble);
    this.group.add(group);
    this.views.push({ data: b, group, main, material, rubble, extras, lastHealth: -1, lastDestroyed: !b.destroyed });
  }

  private baseHeight(b: BuildingData): number {
    if (b.type === 'farm') return this.terrain.heightAt(b.x, b.z) + 0.02;
    // Sit on the lowest corner so foundations never float.
    const r = b.footprint * 0.7;
    return Math.min(
      this.terrain.heightAt(b.x - r, b.z - r),
      this.terrain.heightAt(b.x + r, b.z - r),
      this.terrain.heightAt(b.x - r, b.z + r),
      this.terrain.heightAt(b.x + r, b.z + r),
    ) - 0.05;
  }

  /** World positions of chimney tops for smoke emission. */
  chimneys(out: THREE.Vector3[]): THREE.Vector3[] {
    out.length = 0;
    for (const v of this.views) {
      if (v.data.type !== 'house' || v.data.destroyed) continue;
      const p = new THREE.Vector3(0.95, 4.3, -0.55);
      v.group.localToWorld(p);
      out.push(p);
    }
    return out;
  }

  /** Re-bind to a (possibly reloaded) building array. */
  rebind(buildings: BuildingData[]): void {
    this.views.forEach((v, i) => {
      if (buildings[i]) v.data = buildings[i];
      v.lastHealth = -1;
      v.lastDestroyed = !v.data.destroyed;
    });
  }

  update(villages: VillageData[], night: number, prayersActive: number, elapsed: number, dt: number): void {
    this.windowMat.emissiveIntensity = night * 1.8;
    this.windowMat.color.setRGB(0.23 + night * 0.4, 0.29 + night * 0.3, 0.37);
    for (const view of this.views) {
      const b = view.data;
      const village = villages.find((v) => v.id === b.villageId);
      if (b.destroyed !== view.lastDestroyed) {
        view.lastDestroyed = b.destroyed;
        view.main.visible = !b.destroyed;
        view.rubble.visible = b.destroyed;
        for (const extra of Object.values(view.extras)) if (extra) extra.visible = !b.destroyed;
      }
      if (Math.abs(b.health - view.lastHealth) > 0.5) {
        view.lastHealth = b.health;
        const damage = 1 - b.health / 100;
        view.material.color.setRGB(1 - damage * 0.55, 1 - damage * 0.6, 1 - damage * 0.62);
      }
      if (b.destroyed) continue;
      const ex = view.extras;
      if (ex.flag) ex.flag.rotation.y = Math.sin(elapsed * 2.4 + b.id) * 0.5;
      if (ex.water && village) {
        const level = 0.22 + (village.water / 100) * 0.82;
        ex.water.position.y += (level - ex.water.position.y) * Math.min(1, dt * 3);
        ex.water.visible = village.water > 1;
      }
      if (ex.halo) {
        ex.halo.rotation.x = Math.PI / 2 + Math.sin(elapsed * 0.8) * 0.15;
        ex.halo.rotation.z = elapsed * 0.6;
        ex.halo.position.y = 5.9 + Math.sin(elapsed * 1.6) * 0.15;
        const pulse = prayersActive > 0 ? 0.65 + 0.35 * Math.sin(elapsed * 5) : 0.55;
        this.haloMat.opacity = pulse;
        this.orbMat.emissiveIntensity = prayersActive > 0 ? 1.6 + Math.sin(elapsed * 6) * 0.6 : 0.9 + night;
      }
      if (ex.crops) this.updateCrops(ex.crops, b);
      if (ex.logs && village) this.updateStock(ex.logs, Math.min(16, Math.floor(village.wood / 7)), 'logs');
      if (ex.sacks && village) this.updateStock(ex.sacks, Math.min(14, Math.floor(village.food / 11)), 'sacks');
    }
  }

  private updateCrops(mesh: THREE.InstancedMesh, b: BuildingData): void {
    let i = 0;
    const h = 0.15 + b.cropGrowth * 1.0;
    const ripe = this.color;
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 12; col++) {
        this.dummy.position.set(-4.7 + col * 0.85, 0.15, -3 + row * 1.2);
        this.dummy.rotation.set(0, (row * 12 + col) * 1.7, 0);
        this.dummy.scale.set(0.8 + b.cropGrowth * 0.4, h, 0.8 + b.cropGrowth * 0.4);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(i, this.dummy.matrix);
        const drown = 1 - b.cropHealth;
        ripe.setRGB(0.35 + b.cropGrowth * 0.55, 0.7 + b.cropGrowth * 0.1, 0.25 - b.cropGrowth * 0.1);
        ripe.lerp(this.tmp.setRGB(0.45, 0.38, 0.28), drown);
        mesh.setColorAt(i, ripe);
        i++;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  private readonly tmp = new THREE.Color();

  private updateStock(mesh: THREE.InstancedMesh, count: number, kind: 'logs' | 'sacks'): void {
    if (mesh.count === count && mesh.userData.init) return;
    mesh.userData.init = true;
    for (let i = 0; i < count; i++) {
      if (kind === 'logs') {
        const layer = Math.floor(i / 4);
        const k = i % 4;
        this.dummy.position.set(-2.95, 0.2 + layer * 0.3, -1.1 + k * 0.34 + (layer % 2) * 0.17);
        this.dummy.rotation.set(0, 0, 0);
      } else {
        const layer = Math.floor(i / 5);
        const k = i % 5;
        this.dummy.position.set(-1.6 + k * 0.62 + layer * 0.3, 0.38 + layer * 0.55, 2.9 + (k % 2) * 0.15);
        this.dummy.rotation.set(0, k * 0.7, 0);
      }
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(i, this.dummy.matrix);
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
  }
}
