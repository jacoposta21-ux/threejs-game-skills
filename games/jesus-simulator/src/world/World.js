import * as THREE from 'three';
import { StaticBatcher } from './geometry.js';
import { PropSystem } from './PropSystem.js';
import { getMaterials, PALETTE } from './materials.js';
import { paintSplat, buildTerrain, buildLake } from './terrain.js';
import { createSky, createClouds } from './Sky.js';
import { buildNazareth } from './Nazareth.js';
import {
  oliveTreeGeometry, cypressGeometry, bushGeometry, rockGeometry, grassTuftGeometry, scatterInstanced,
} from './vegetation.js';
import {
  terrainHeight, roadDistance, LAKE, PLAZA, MARKET, PLAY_RADIUS, WORLD_HALF,
} from './layout.js';

const tmp = new THREE.Object3D();

/**
 * WorldState-facing scene: owns static environment meshes, the instanced
 * countryside and the pool of simulated props. Gameplay never reaches into
 * meshes directly; it reads `footprints`, `props` and layout data.
 */
export class World {
  constructor(scene, physics, rng, bus) {
    this.bus = bus;
    this.scene = scene;
    this.physics = physics;
    this.rng = rng;
    this.root = new THREE.Group();
    this.root.name = 'world';
    scene.add(this.root);
    this.footprints = [];
    this.uniforms = {};
    this.grassMeshes = [];
  }

  /** Build in steps so the loading screen can report progress. */
  *buildSteps() {
    const materials = getMaterials();
    this.materials = materials;

    yield 'Painting the hills of Galilee';
    this.splat = paintSplat();
    const terrain = buildTerrain(this.splat);
    this.root.add(terrain.mesh);
    this.physics.addTrimesh(terrain.vertices, terrain.indices);

    const lake = buildLake();
    this.root.add(lake.mesh);
    this.uniforms.lake = lake.uniforms;

    yield 'Raising the sky';
    this.sun = new THREE.Vector3(-0.55, 0.72, 0.42).normalize();
    this.sky = createSky(this.sun);
    this.scene.add(this.sky.mesh);
    this.clouds = createClouds();
    this.scene.add(this.clouds);

    yield 'Building Nazareth';
    const batcher = new StaticBatcher();
    const village = buildNazareth(batcher, this.rng);
    this.footprints = village.footprints;
    this.houses = village.houses;
    this.villageTriangles = batcher.triangles;
    this.root.add(batcher.build(materials, { name: 'nazareth' }));
    this.physics.addStaticColliders(village.colliders);
    this.staticColliderCount = village.colliders.length;
    this.workshopSign = village.workshop.sign;
    // anchors for NPC routines (doors, stalls, benches, named spots)
    this.anchors = { doors: village.doors, stalls: village.stalls, benches: village.benches, spots: village.spots };
    this.root.add(createSignBoard(['JOSEPH & SON', 'CARPENTRY'], village.workshop.sign));

    yield 'Planting olive trees';
    this.buildScatter(village.houses);

    yield 'Stacking barrels and pottery';
    this.propSystem = new PropSystem(this.root, this.physics, this.rng, materials, this.bus);
    this.propSystem.build(village.houses, village.stalls);
  }

  scatterPoints(count, minR, maxR, clearance, extraReject) {
    const pts = [];
    let attempts = 0;
    while (pts.length < count && attempts < count * 30) {
      attempts += 1;
      const x = this.rng.range(-WORLD_HALF + 12, WORLD_HALF - 12);
      const z = this.rng.range(-WORLD_HALF + 12, WORLD_HALF - 12);
      const d = Math.hypot(x, z);
      if (d < minR || d > maxR) continue;
      const ld = Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);
      if (ld < 1.12) continue;
      if (roadDistance(x, z) < clearance) continue;
      if (Math.hypot(x - 64, z - 46) < 22 || Math.hypot(x + 80, z + 62) < 11) continue;
      if (extraReject && extraReject(x, z)) continue;
      pts.push({ x, z, y: terrainHeight(x, z) });
    }
    return pts;
  }

  buildScatter(houses) {
    const rng = this.rng;
    const m = this.materials;
    const colliders = [];
    const nearHouse = (x, z, pad) => houses.some((h) => Math.hypot(h.x - x, h.z - z) < h.r + pad);
    const addTrees = (templates, count, minR, maxR, trunkR, clearance) => {
      const pts = this.scatterPoints(count, minR, maxR, clearance, (x, z) => nearHouse(x, z, 2));
      const per = Math.ceil(pts.length / templates.length);
      templates.forEach((geo, i) => {
        const slice = pts.slice(i * per, (i + 1) * per).map((p) => ({ ...p, y: p.y - 0.08, s: rng.range(0.85, 1.25) }));
        if (!slice.length) return;
        this.root.add(scatterInstanced(geo, m.foliage, slice, rng));
        for (const p of slice) {
          if (Math.hypot(p.x, p.z) < PLAY_RADIUS + 8) colliders.push({ shape: 'cyl', r: trunkR * p.s, hh: 1.2, x: p.x, y: p.y + 1.2, z: p.z });
        }
      });
    };
    addTrees([0, 1, 2].map(() => oliveTreeGeometry(rng, 1, 0)), 230, 64, 235, 0.35, 3);
    addTrees([0, 1].map(() => cypressGeometry(rng)), 90, 58, 235, 0.4, 3);

    const bushes = this.scatterPoints(320, 30, 235, 2, (x, z) => nearHouse(x, z, 1) || Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.r + 2);
    const bt = [bushGeometry(rng), bushGeometry(rng)];
    this.root.add(scatterInstanced(bt[0], m.foliage, bushes.slice(0, 160).map((p) => ({ ...p, s: rng.range(0.7, 1.4) })), rng, { castShadow: false }));
    this.root.add(scatterInstanced(bt[1], m.foliage, bushes.slice(160).map((p) => ({ ...p, s: rng.range(0.7, 1.4) })), rng, { castShadow: false }));

    const rocks = this.scatterPoints(240, 50, 240, 2.5);
    const rt = [rockGeometry(rng), rockGeometry(rng)];
    rt.forEach((geo, i) => {
      const slice = rocks.filter((_, k) => k % 2 === i).map((p) => ({ ...p, y: p.y - 0.25, s: rng.range(0.5, 2.2) }));
      this.root.add(scatterInstanced(geo, m.foliage, slice, rng));
      for (const p of slice) {
        if (p.s > 0.9 && Math.hypot(p.x, p.z) < PLAY_RADIUS + 8) colliders.push({ shape: 'cyl', r: p.s * 0.95, hh: p.s * 0.5, x: p.x, y: p.y + p.s * 0.3, z: p.z });
      }
    });

    // grass tufts (no shadows, density scaled by quality at runtime via mesh.count)
    const grass = this.scatterPoints(4200, 14, 150, 0.6, (x, z) => {
      if (nearHouse(x, z, 0.2)) return true;
      if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.r + 1) return true;
      return x > MARKET.x0 - 1 && x < MARKET.x1 + 1 && z > MARKET.z0 - 1 && z < MARKET.z1 + 1;
    });
    const gm = scatterInstanced(grassTuftGeometry(), m.grass, grass.map((p) => ({ ...p, s: rng.range(0.7, 1.5) })), rng, { castShadow: false, tintJitter: 0.15 });
    gm.userData.fullCount = gm.count;
    this.grassMeshes.push(gm);
    this.root.add(gm);

    this.physics.addStaticColliders(colliders);
    this.staticColliderCount += colliders.length;
  }

  get props() {
    return this.propSystem.props;
  }

  syncProps(time = 0, force = false) {
    return this.propSystem.sync(time, force);
  }

  resetAllProps() {
    this.propSystem.resetAll();
  }

  setGrassDensity(fraction) {
    for (const g of this.grassMeshes) g.count = Math.floor(g.userData.fullCount * fraction);
  }

  update(dt, elapsed, cameraPosition, far) {
    if (this.uniforms.lake) this.uniforms.lake.uTime.value = elapsed;
    this.sky.mesh.position.copy(cameraPosition);
    this.sky.mesh.scale.setScalar(far * 0.92);
    this.clouds.position.x = ((elapsed * 1.2) % 160) - 80;
  }
}

function createSignBoard(lines, at) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#b07a45';
  g.fillRect(0, 0, 256, 128);
  g.strokeStyle = '#5a3a1e';
  g.lineWidth = 8;
  g.strokeRect(4, 4, 248, 120);
  g.fillStyle = '#3a2210';
  g.textAlign = 'center';
  g.font = 'bold 34px Palatino Linotype, Georgia, serif';
  g.fillText(lines[0], 128, 56);
  g.font = 'bold 26px Palatino Linotype, Georgia, serif';
  g.fillText(lines[1], 128, 96);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.75, 0.08), [
    ...Array(4).fill(new THREE.MeshStandardMaterial({ color: '#7a5233' })),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }),
  ]);
  board.position.set(at.x, at.y + 0.75, at.z);
  board.rotation.y = at.ry;
  board.castShadow = true;
  board.name = 'workshop-sign';
  return board;
}

export { PALETTE };
