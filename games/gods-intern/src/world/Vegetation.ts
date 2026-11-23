import * as THREE from 'three';
import { CONFIG } from '../core/Config';
import type { TreeData, TreeKind } from '../core/types';
import { build, flatMaterial, hashUnit, Part } from '../render/ModelKit';
import { fbm, type TerrainData, WATER_NONE } from './TerrainGen';

type VisualKind = TreeKind | 'stump';

function oakGeometry(): THREE.BufferGeometry {
  return build([
    Part.cyl(0.16, 0.26, 1.5, 6).at(0, 0.75, 0).color(0x7a5232),
    Part.cyl(0.07, 0.1, 0.7, 5).rot(0, 0, 0.9).at(0.32, 1.25, 0).color(0x7a5232),
    Part.ico(1.15, 0).jitter(0.25, 2).at(0, 2.25, 0).color(0x5fae3e, 0.05),
    Part.ico(0.85, 0).jitter(0.2, 3).at(0.65, 1.95, 0.25).color(0x6cbd45, 0.05),
    Part.ico(0.8, 0).jitter(0.2, 4).at(-0.55, 2.0, -0.3).color(0x55a03a, 0.05),
    Part.ico(0.7, 0).jitter(0.2, 5).at(0.1, 2.95, -0.1).color(0x78c84d, 0.05),
  ]);
}

function pineGeometry(): THREE.BufferGeometry {
  return build([
    Part.cyl(0.12, 0.2, 1.0, 6).at(0, 0.5, 0).color(0x6b4428),
    Part.cone(1.15, 1.5, 7).at(0, 1.55, 0).color(0x2f7a4a, 0.04),
    Part.cone(0.92, 1.3, 7).rot(0, 0.4, 0).at(0, 2.35, 0).color(0x368a52, 0.04),
    Part.cone(0.66, 1.1, 7).rot(0, 0.8, 0).at(0, 3.05, 0).color(0x3f9a5a, 0.04),
    Part.cone(0.36, 0.7, 6).at(0, 3.65, 0).color(0x4aa864),
  ]);
}

function bushGeometry(): THREE.BufferGeometry {
  return build([
    Part.ico(0.62, 0).jitter(0.18, 7).scale(1, 0.75, 1).at(0, 0.45, 0).color(0x6db54a, 0.05),
    Part.ico(0.45, 0).jitter(0.15, 8).scale(1, 0.8, 1).at(0.45, 0.35, 0.2).color(0x62a843, 0.05),
    Part.ico(0.38, 0).jitter(0.12, 9).at(-0.35, 0.38, -0.2).color(0x7cc257, 0.05),
    Part.ico(0.09, 0).at(0.2, 0.8, 0.35).color(0xe8455a),
    Part.ico(0.08, 0).at(-0.3, 0.7, 0.3).color(0xe8455a),
    Part.ico(0.08, 0).at(0.55, 0.62, -0.1).color(0xe8455a),
  ]);
}

function stumpGeometry(): THREE.BufferGeometry {
  return build([
    Part.cyl(0.2, 0.28, 0.5, 6).at(0, 0.25, 0).color(0x2b2420),
    Part.cyl(0.05, 0.08, 0.9, 4).rot(0.5, 0, 0.3).at(0.1, 0.7, 0.1).color(0x231d1a),
    Part.cyl(0.04, 0.06, 0.6, 4).rot(-0.4, 0, -0.5).at(-0.12, 0.6, -0.05).color(0x231d1a),
    Part.ico(0.12, 0).at(0.18, 0.45, -0.1).color(0xd9542b),
  ]);
}

/** Inject a wind sway that bends vertices by their height above the instance origin. */
function addSway(material: THREE.MeshStandardMaterial, uTime: { value: number }, strength: number): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
#else
  vec3 ip = vec3(0.0);
#endif
  float sway = sin(uTime * 1.3 + ip.x * 0.31 + ip.z * 0.17) * 0.5 + sin(uTime * 2.1 + ip.z * 0.5) * 0.25;
  float k = max(0.0, transformed.y - 0.6) * ${strength.toFixed(3)};
  transformed.x += sway * k;
  transformed.z += sway * k * 0.45;`,
      );
  };
}

export class Vegetation {
  readonly group = new THREE.Group();
  readonly uTime = { value: 0 };
  private readonly meshes: Record<VisualKind, THREE.InstancedMesh>;
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();
  private readonly visualGrowth = new Map<number, number>();
  private readonly time = { t: 0 };

  constructor(terrain: TerrainData) {
    const cap = CONFIG.trees.maxTrees;
    const geos: Record<VisualKind, THREE.BufferGeometry> = {
      oak: oakGeometry(),
      pine: pineGeometry(),
      bush: bushGeometry(),
      stump: stumpGeometry(),
    };
    this.meshes = {} as Record<VisualKind, THREE.InstancedMesh>;
    for (const kind of Object.keys(geos) as VisualKind[]) {
      const mat = flatMaterial();
      if (kind !== 'stump') addSway(mat, this.uTime, kind === 'bush' ? 0.015 : 0.03);
      const mesh = new THREE.InstancedMesh(geos[kind], mat, cap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = kind !== 'bush';
      mesh.receiveShadow = true;
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.name = `trees-${kind}`;
      this.meshes[kind] = mesh;
      this.group.add(mesh);
    }
    this.addDecor(terrain);
  }

  /** Static scatter: flowers, grass tufts, rocks. Purely environmental dressing. */
  private addDecor(terrain: TerrainData): void {
    const flowerGeo = build([
      Part.cyl(0.015, 0.015, 0.3, 3).at(0, 0.15, 0).color(0x4a8a35),
      Part.ico(0.08, 0).at(0, 0.32, 0).color(0xffffff),
    ]);
    const grassGeo = build([
      Part.cone(0.06, 0.45, 3).rot(0, 0, 0.25).at(0.06, 0.2, 0).color(0x6fb046),
      Part.cone(0.06, 0.55, 3).rot(0.2, 0, -0.2).at(-0.05, 0.25, 0.03).color(0x7dbf4e),
      Part.cone(0.05, 0.4, 3).rot(-0.25, 0, 0).at(0, 0.18, -0.06).color(0x88c95a),
    ]);
    const rockGeo = build([Part.dodeca(0.7).jitter(0.25, 11).scale(1, 0.65, 1).color(0x9c948c, 0.04)]);
    const flowerColors = [0xff6b8b, 0xffd23f, 0xffffff, 0xb388ff, 0xff9f43];
    const flowers: Array<[number, number, number]> = [];
    const grass: Array<[number, number]> = [];
    const rocks: Array<[number, number, number]> = [];
    let seed = 1;
    const rand = () => hashUnit(seed++);
    for (let i = 0; i < 9000; i++) {
      const x = (rand() - 0.5) * 150;
      const z = (rand() - 0.5) * 150;
      if (terrain.waterAt(x, z) !== WATER_NONE) continue;
      const h = terrain.heightAt(x, z);
      const slope = terrain.slopeAt(x, z);
      const meadow = fbm(x * 0.045 + 11, z * 0.045 - 4, terrain.seed + 77, 3) < -0.06;
      if (h > 1.6 && h < 12 && slope < 0.7) {
        if (meadow && flowers.length < 700 && rand() < 0.35) flowers.push([x, z, Math.floor(rand() * flowerColors.length)]);
        else if (grass.length < 1300 && rand() < 0.4) grass.push([x, z]);
      }
      if (rocks.length < 160 && ((slope > 0.9 && h > 2) || (h > 13 && rand() < 0.3) || (h > 0.4 && h < 1.2 && rand() < 0.04))) {
        rocks.push([x, z, 0.4 + rand() * 1.4]);
      }
    }
    const fMesh = new THREE.InstancedMesh(flowerGeo, flatMaterial(), flowers.length);
    flowers.forEach(([x, z, c], i) => {
      this.dummy.position.set(x, terrain.heightAt(x, z), z);
      this.dummy.rotation.set(0, rand() * 6, 0);
      this.dummy.scale.setScalar(0.8 + rand() * 0.7);
      this.dummy.updateMatrix();
      fMesh.setMatrixAt(i, this.dummy.matrix);
      fMesh.setColorAt(i, this.color.set(flowerColors[c]));
    });
    const gMesh = new THREE.InstancedMesh(grassGeo, flatMaterial(), grass.length);
    addSway(gMesh.material as THREE.MeshStandardMaterial, this.uTime, 0.12);
    grass.forEach(([x, z], i) => {
      this.dummy.position.set(x, terrain.heightAt(x, z) - 0.03, z);
      this.dummy.rotation.set(0, rand() * 6, 0);
      this.dummy.scale.setScalar(0.8 + rand() * 0.8);
      this.dummy.updateMatrix();
      gMesh.setMatrixAt(i, this.dummy.matrix);
      gMesh.setColorAt(i, this.color.setHSL(0.27 + rand() * 0.05, 0.5, 0.42 + rand() * 0.12));
    });
    const rMesh = new THREE.InstancedMesh(rockGeo, flatMaterial(), rocks.length);
    rMesh.castShadow = true;
    rMesh.receiveShadow = true;
    rocks.forEach(([x, z, s], i) => {
      this.dummy.position.set(x, terrain.heightAt(x, z) - 0.1 * s, z);
      this.dummy.rotation.set(rand() * 0.4, rand() * 6, rand() * 0.4);
      this.dummy.scale.set(s, s * (0.7 + rand() * 0.6), s);
      this.dummy.updateMatrix();
      rMesh.setMatrixAt(i, this.dummy.matrix);
      rMesh.setColorAt(i, this.color.setHSL(0.08, 0.06 + rand() * 0.06, 0.5 + rand() * 0.15));
    });
    fMesh.name = 'flowers';
    gMesh.name = 'grass';
    rMesh.name = 'rocks';
    this.group.add(fMesh, gMesh, rMesh);
    this.decor = { grass: gMesh, flowers: fMesh };
  }

  decor!: { grass: THREE.InstancedMesh; flowers: THREE.InstancedMesh };

  setDetail(level: 'low' | 'medium' | 'high'): void {
    this.decor.grass.visible = level !== 'low';
    this.meshes.oak.castShadow = level !== 'low';
    this.meshes.pine.castShadow = level !== 'low';
  }

  /** Rebuild instance matrices from logical tree state. */
  sync(trees: TreeData[], terrain: TerrainData, dt: number, elapsed: number): void {
    this.uTime.value = elapsed;
    this.time.t = elapsed;
    const counts: Record<VisualKind, number> = { oak: 0, pine: 0, bush: 0, stump: 0 };
    for (const tree of trees) {
      if (tree.removed) continue;
      const kind: VisualKind = tree.charred ? 'stump' : tree.kind;
      const mesh = this.meshes[kind];
      const slot = counts[kind]++;
      // Ease visual growth toward the logical growth with a springy overshoot.
      let vg = this.visualGrowth.get(tree.id) ?? tree.growth;
      vg += (tree.growth - vg) * Math.min(1, dt * 10);
      this.visualGrowth.set(tree.id, vg);
      const pop = tree.byPlayer && tree.growth < 1 ? Math.sin(vg * Math.PI) * 0.12 : 0;
      const s = kind === 'stump' ? tree.scale : tree.scale * Math.max(0.02, vg + pop);
      this.dummy.position.set(tree.x, terrain.heightAt(tree.x, tree.z) - 0.05, tree.z);
      this.dummy.rotation.set(0, tree.rot, 0);
      if (tree.burning) {
        const shake = Math.sin(elapsed * 23 + tree.id) * 0.03;
        this.dummy.rotation.z = shake;
      }
      this.dummy.scale.set(s, s, s);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(slot, this.dummy.matrix);
      const v = hashUnit(tree.id) * 0.16 - 0.08;
      if (tree.burning) {
        const flick = 0.5 + 0.5 * Math.sin(elapsed * 14 + tree.id);
        this.color.setRGB(0.55 + flick * 0.2, 0.28, 0.12);
      } else if (kind === 'stump') {
        this.color.setRGB(1, 1, 1);
      } else {
        const sick = 1 - tree.health;
        this.color.setRGB(1 + v + sick * 0.25, 1 + v * 0.6 - sick * 0.05, 1 + v - sick * 0.4);
      }
      mesh.setColorAt(slot, this.color);
    }
    for (const kind of Object.keys(this.meshes) as VisualKind[]) {
      const mesh = this.meshes[kind];
      mesh.count = counts[kind];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}
