import * as THREE from 'three';
import { StaticBatcher, mergeColored, potGeometry } from './geometry.js';
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
  constructor(scene, physics, rng) {
    this.scene = scene;
    this.physics = physics;
    this.rng = rng;
    this.root = new THREE.Group();
    this.root.name = 'world';
    scene.add(this.root);
    this.props = [];
    this.propMeshes = {};
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
    this.root.add(createSignBoard(['JOSEPH & SON', 'CARPENTRY'], village.workshop.sign));

    yield 'Planting olive trees';
    this.buildScatter(village.houses);

    yield 'Stacking barrels and pottery';
    this.buildProps();
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

  buildProps() {
    const rng = this.rng;
    const templates = {
      barrel: {
        geometry: mergeColored([
          { geometry: new THREE.CylinderGeometry(0.36, 0.36, 0.96, 12), color: '#9c6b40' },
          { geometry: new THREE.CylinderGeometry(0.39, 0.39, 0.07, 12), color: '#4a3a2c', t: { y: 0.3 } },
          { geometry: new THREE.CylinderGeometry(0.39, 0.39, 0.07, 12), color: '#4a3a2c', t: { y: -0.3 } },
        ]),
        material: this.materials.wood,
        phys: { shape: 'cyl', r: 0.38, hh: 0.48, density: 0.6, restitution: 0.25 },
      },
      crate: {
        geometry: mergeColored([
          { geometry: new THREE.BoxGeometry(0.8, 0.8, 0.8), color: '#b5844f' },
          { geometry: new THREE.BoxGeometry(0.84, 0.1, 0.84), color: '#6b4a2e', t: { y: 0.35 } },
          { geometry: new THREE.BoxGeometry(0.84, 0.1, 0.84), color: '#6b4a2e', t: { y: -0.35 } },
        ]),
        material: this.materials.wood,
        phys: { shape: 'box', hx: 0.4, hy: 0.4, hz: 0.4, density: 0.5, restitution: 0.15 },
      },
      pot: {
        geometry: (() => {
          const g = mergeColored([{ geometry: potGeometry(0.7, 0.3, 10), color: '#c0703f', t: { y: -0.35 } }]);
          return g;
        })(),
        material: this.materials.clay,
        phys: { shape: 'cyl', r: 0.28, hh: 0.35, density: 0.9, restitution: 0.1 },
      },
    };

    const spots = [];
    const push = (type, x, z) => spots.push({ type, x, z });
    // market edges and aisle ends
    for (let i = 0; i < 6; i += 1) push(i % 2 ? 'crate' : 'barrel', -15 + i * 6, -16.8);
    for (let i = 0; i < 5; i += 1) push(i % 2 ? 'pot' : 'barrel', -17.5, -36 + i * 4.5);
    for (let i = 0; i < 4; i += 1) push('pot', 17.5, -34 + i * 4);
    push('crate', -9, -27.4); push('pot', 3.1, -26.6); push('barrel', 9.2, -27.8);
    // square
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2 + 0.55;
      push(i % 3 === 0 ? 'barrel' : 'pot', Math.cos(a) * 4.2, Math.sin(a) * 4.2);
    }
    // workshop yard
    push('crate', -23.5, 18.5); push('crate', -22.8, 19.6); push('barrel', -36.5, 10); push('barrel', -36.2, 11.2);
    // a few by houses
    for (let i = 0; i < 10 && i < this.houses.length; i += 1) {
      const h = this.houses[i * 3 % this.houses.length];
      const a = Math.atan2(-h.x, -h.z);
      push(rng.pick(['barrel', 'crate', 'pot']), h.x + Math.sin(a) * (h.r + 0.9) + 1.2, h.z + Math.cos(a) * (h.r + 0.9));
    }

    for (const type of Object.keys(templates)) {
      const list = spots.filter((s) => s.type === type);
      const t = templates[type];
      const mesh = new THREE.InstancedMesh(t.geometry, t.material, list.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = `props:${type}`;
      mesh.frustumCulled = false;
      this.root.add(mesh);
      this.propMeshes[type] = mesh;
      list.forEach((s, i) => {
        const halfH = t.phys.hy ?? t.phys.hh;
        const y = terrainHeight(s.x, s.z) + halfH + 0.05;
        const ry = rng() * Math.PI * 2;
        const { body } = this.physics.createDynamic({ ...t.phys, x: s.x, y, z: s.z, ry });
        const id = `prop.${type}.${String(i).padStart(2, '0')}`;
        this.props.push({ id, type, index: i, body, mesh, home: { x: s.x, y, z: s.z, ry }, disturbed: false });
      });
    }
    this.syncProps(true);
  }

  /** Copy awake prop bodies into instance matrices; returns ids newly disturbed. */
  syncProps(force = false) {
    const disturbed = [];
    const dirty = new Set();
    for (const p of this.props) {
      if (!force && p.body.isSleeping()) continue;
      const t = p.body.translation();
      if (t.y < -20 || Math.hypot(t.x, t.z) > PLAY_RADIUS + 20) {
        this.resetProp(p);
        continue;
      }
      const r = p.body.rotation();
      tmp.position.set(t.x, t.y, t.z);
      tmp.quaternion.set(r.x, r.y, r.z, r.w);
      tmp.scale.setScalar(1);
      tmp.updateMatrix();
      p.mesh.setMatrixAt(p.index, tmp.matrix);
      dirty.add(p.mesh);
      if (!force && !p.disturbed) {
        const v = p.body.linvel();
        if (v.x * v.x + v.y * v.y + v.z * v.z > 2.5) {
          p.disturbed = true;
          disturbed.push(p.id);
        }
      }
    }
    for (const m of dirty) m.instanceMatrix.needsUpdate = true;
    return disturbed;
  }

  resetProp(p) {
    const { x, y, z, ry } = p.home;
    p.body.setTranslation({ x, y, z }, true);
    p.body.setRotation({ x: 0, y: Math.sin(ry / 2), z: 0, w: Math.cos(ry / 2) }, true);
    p.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    p.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    p.body.sleep();
    p.disturbed = false;
  }

  resetAllProps() {
    for (const p of this.props) this.resetProp(p);
    this.syncProps(true);
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
