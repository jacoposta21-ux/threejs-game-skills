import * as THREE from 'three';
import { StaticBatcher } from './geometry.js';
import { PropSystem } from './PropSystem.js';
import { buildShore } from './Shore.js';
import { buildCheckpoint } from './RomanCheckpoint.js';
import {
  buildFarm, wheatFields, buildGoatHill, buildHamlet, buildIsle, buildOutpost, buildCircuit, buildOasis, buildCamp, buildDesertRocks, buildWedding,
} from './Regions.js';
import { WEDDING } from '../missions/missions.js';

const WATER_COLOR = new THREE.Color('#3f8fa6');
const WINE_COLOR = new THREE.Color('#6b0f2e');
const WINE_GLOW = new THREE.Color('#ff3070');
import { getMaterials, PALETTE } from './materials.js';
import { paintSplat, buildTerrain, buildLake } from './terrain.js';
import { createSky, createClouds } from './Sky.js';
import { buildNazareth } from './Nazareth.js';
import {
  oliveTreeGeometry, cypressGeometry, bushGeometry, rockGeometry, grassTuftGeometry, palmTreeGeometry, scatterInstanced,
} from './vegetation.js';
import { mergeColored } from './geometry.js';
import {
  terrainHeight, roadDistance, inPlayArea, LAKE, PLAZA, MARKET, WORLD_HALF, CHECKPOINT,
  FARM, HAMLET, OUTPOST, CIRCUIT, OASIS, CAMP, GOAT_HILL, ISLE, DESERT_Z,
} from './layout.js';

const SITE_PADS = [CHECKPOINT.pad, FARM.pad, HAMLET.pad, OUTPOST.pad, CIRCUIT.pad, OASIS.pad, CAMP.pad];
const nearCheckpoint = (x, z, pad = 0) => SITE_PADS.some((p) => x > p.x0 - pad && x < p.x1 + pad && z > p.z0 - pad && z < p.z1 + pad);
const nearSite = (x, z) => Math.hypot(x - GOAT_HILL.x - 8, z - GOAT_HILL.z - 7) < 5 || Math.hypot(x - GOAT_HILL.x, z - GOAT_HILL.z) < 3
  || Math.hypot(x - ISLE.x, z - ISLE.z) < ISLE.r + 3 || (x > -180 && x < -102 && z > -26 && z < 36 && !(x > -130 && z < 10)) || Math.hypot(x - 112, z - 150) < 9;

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
    // the wedding feast (Phase 6) shares the village batch: no extra draw calls
    const wedding = buildWedding(batcher, this.rng, null, WEDDING);
    this.weddingWater = wedding.water;
    this.footprints.push(...wedding.B.footprints);
    this.villageTriangles = batcher.triangles;
    this.root.add(batcher.build(materials, { name: 'nazareth' }));
    this.physics.addStaticColliders(village.colliders);
    this.physics.addStaticColliders(wedding.B.colliders);
    this.staticColliderCount = village.colliders.length;
    this.workshopSign = village.workshop.sign;
    // anchors for NPC routines (doors, stalls, benches, named spots)
    this.anchors = { doors: village.doors, stalls: village.stalls, benches: village.benches, spots: village.spots };
    this.root.add(createSignBoard(['JOSEPH & SON', 'CARPENTRY'], village.workshop.sign));

    yield 'Raising the Galilee shore';
    const shoreBatch = new StaticBatcher();
    const shore = buildShore(shoreBatch);
    this.root.add(shoreBatch.build(materials, { name: 'shore' }));
    this.physics.addStaticColliders(shore.colliders);
    this.boat = shore.boat;
    this.root.add(shore.boat);
    this.shore = shore;
    this.buildWaterTargets(village.spots);

    yield 'Pitching the Roman camp';
    const campBatch = new StaticBatcher();
    const camp = buildCheckpoint(campBatch, this.rng);
    this.root.add(campBatch.build(materials, { name: 'checkpoint' }));
    this.root.add(camp.extras);
    this.physics.addStaticColliders(camp.colliders);
    this.staticColliderCount += camp.colliders.length;
    this.footprints.push(...camp.footprints);
    this.checkpoint = camp;
    this.anchors.romanPosts = camp.posts;

    yield 'Opening the roads of Galilee';
    this.buildRegions();

    yield 'Planting olive trees';
    this.buildScatter(village.houses);

    yield 'Stacking barrels and pottery';
    this.propSystem = new PropSystem(this.root, this.physics, this.rng, materials, this.bus);
    this.propSystem.build(village.houses, village.stalls);
  }

  /** Phase 5 sites: each one is its own batch (culled as a unit) with colliders and spawn spots. */
  buildRegions() {
    const materials = this.materials;
    const rng = this.rng;
    this.regionMeshes = [];
    this.flames = [this.checkpoint.flame];
    this.flags = [];
    const extras = new THREE.Group();
    extras.name = 'region-extras';
    this.root.add(extras);
    // four regional batches (west, lake, north, south): few geometries, still culled per region
    const groups = new Map();
    const site = (group, fn) => {
      if (!groups.has(group)) groups.set(group, { batch: new StaticBatcher(), xs: [], zs: [] });
      const g = groups.get(group);
      const out = fn(g.batch);
      this.physics.addStaticColliders(out.B.colliders);
      this.staticColliderCount += out.B.colliders.length;
      this.footprints.push(...out.B.footprints);
      return out;
    };
    const farm = site('west', (b) => buildFarm(b, rng, extras));
    const goat = site('west', (b) => buildGoatHill(b, rng));
    const hamlet = site('lake', (b) => buildHamlet(b, rng, extras));
    site('lake', (b) => buildIsle(b, rng));
    const outpost = site('north', (b) => buildOutpost(b, rng, extras));
    site('north', (b) => buildCircuit(b, rng, extras));
    const oasis = site('south', (b) => buildOasis(b, rng));
    const camp = site('south', (b) => buildCamp(b, rng, extras));
    site('south', (b) => buildDesertRocks(b, rng));
    const centres = { west: [FARM.x - 6, FARM.z - 50], lake: [HAMLET.x + 10, (HAMLET.z + ISLE.z) / 2], north: [(OUTPOST.x + CIRCUIT.x) / 2, OUTPOST.z], south: [10, 165] };
    for (const [name, g] of groups) {
      const mesh = g.batch.build(materials, { name: `region-${name}` });
      mesh.userData.site = { x: centres[name][0], z: centres[name][1] };
      this.root.add(mesh);
      this.regionMeshes.push(mesh);
    }
    this.flames.push(hamlet.flame, camp.flame);
    this.flags.push(...outpost.flags);
    this.anchors.romanPosts = { ...this.anchors.romanPosts, ...outpost.posts };
    this.sites = { farm: farm.spots, goat: goat.spots, hamlet: hamlet.spots, outpost: outpost.spots, camp: camp.spots, oasis };

    // wheat: chunked instancing so off-screen fields are culled
    const wheat = wheatFields(rng);
    const wheatGeo = mergeColored(wheat.parts.map((geometry, i) => ({ geometry, color: i % 2 ? '#e7c766' : '#d6b153' })));
    for (const m of this.chunked(wheatGeo, materials.grass, wheat.placements, 120, { castShadow: false, tintJitter: 0.12 })) this.root.add(m);

    // the oasis pond is a miracle water target (water to wine)
    const w = oasis.water;
    const pond = new THREE.MeshStandardMaterial({ color: '#3f8fa6', roughness: 0.12, metalness: 0.05, emissive: '#000000', transparent: true, opacity: 0.9 });
    const pondMesh = new THREE.Mesh(new THREE.CircleGeometry(w.r, 28).rotateX(-Math.PI / 2), pond);
    pondMesh.position.set(w.x, w.y, w.z);
    pondMesh.receiveShadow = true;
    this.root.add(pondMesh);
    this.pondTarget = { id: 'water.oasis', name: 'Palm Oasis pond', mesh: pondMesh, x: w.x, y: w.y, z: w.z, radius: w.r - 1, wine: 0, target: 0, wineUntil: 0 };
    this.waterTargets.push(this.pondTarget);

    // the wedding's six stone jars (one water surface per jar, one shared target)
    const wj = this.weddingWater;
    const jarMat = new THREE.MeshStandardMaterial({ color: '#3f8fa6', roughness: 0.12, metalness: 0.05, emissive: '#000000' });
    const jars = new THREE.InstancedMesh(new THREE.CircleGeometry(0.27, 14).rotateX(-Math.PI / 2), jarMat, 6);
    const o = new THREE.Object3D();
    for (let i = 0; i < 6; i += 1) {
      const lx = -2.75 + i * 1.1;
      o.position.set(wj.x + Math.cos(wj.yaw) * lx, wj.y, wj.z - Math.sin(wj.yaw) * lx);
      o.updateMatrix();
      jars.setMatrixAt(i, o.matrix);
    }
    jars.name = 'wedding-jars';
    this.root.add(jars);
    this.waterTargets.push({ id: 'water.wedding', name: 'The six stone jars', mesh: jars, x: wj.x, y: wj.y, z: wj.z, radius: 2.4, wine: 0, target: 0, wineUntil: 0 });
  }

  /** Split placements into grid cells, one InstancedMesh per cell (frustum culling per cell). */
  chunked(geometry, material, placements, cell, opts) {
    const cells = new Map();
    for (const p of placements) {
      const key = `${Math.floor(p.x / cell)},${Math.floor(p.z / cell)}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(p);
    }
    return [...cells.values()].map((list) => scatterInstanced(geometry, material, list, this.rng, opts));
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
      if (nearCheckpoint(x, z, 2) || nearSite(x, z)) continue;
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
    const desert = (x, z) => z > DESERT_Z - 4;
    const addTrees = (templates, count, minR, maxR, trunkR, clearance) => {
      const pts = this.scatterPoints(count, minR, maxR, clearance, (x, z) => nearHouse(x, z, 2) || desert(x, z));
      const per = Math.ceil(pts.length / templates.length);
      templates.forEach((geo, i) => {
        const slice = pts.slice(i * per, (i + 1) * per).map((p) => ({ ...p, y: p.y - 0.08, s: rng.range(0.85, 1.25) }));
        if (!slice.length) return;
        this.root.add(scatterInstanced(geo, m.foliage, slice, rng));
        for (const p of slice) {
          if (inPlayArea(p.x, p.z)) colliders.push({ shape: 'cyl', r: trunkR * p.s, hh: 1.2, x: p.x, y: p.y + 1.2, z: p.z });
        }
      });
    };
    addTrees([0, 1, 2].map(() => oliveTreeGeometry(rng, 1, 0)), 230, 64, 235, 0.35, 3);
    addTrees([0, 1].map(() => cypressGeometry(rng)), 90, 58, 235, 0.4, 3);

    const bushes = this.scatterPoints(320, 30, 235, 2, (x, z) => nearHouse(x, z, 1) || Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.r + 2 || desert(x, z));
    const bt = [bushGeometry(rng), bushGeometry(rng)];
    this.root.add(scatterInstanced(bt[0], m.foliage, bushes.slice(0, 160).map((p) => ({ ...p, s: rng.range(0.7, 1.4) })), rng, { castShadow: false }));
    this.root.add(scatterInstanced(bt[1], m.foliage, bushes.slice(160).map((p) => ({ ...p, s: rng.range(0.7, 1.4) })), rng, { castShadow: false }));
    // desert: dry thorn shrubs and a few lonely palms
    const dry = this.scatterPoints(1400, 100, 300, 2, (x, z) => !desert(x, z) || z < DESERT_Z + 6).slice(0, 140);
    const dryGeo = mergeColored([0, 1, 2].map((i) => ({ geometry: new THREE.IcosahedronGeometry(0.45 - i * 0.08, 0), color: ['#a79a5e', '#9a8a52', '#b3a36a'][i], t: { x: (i - 1) * 0.35, y: 0.25, z: (i % 2) * 0.3, sy: 0.6 } })));
    this.root.add(scatterInstanced(dryGeo, m.foliage, dry.map((p) => ({ ...p, s: rng.range(0.8, 1.6) })), rng, { castShadow: false }));
    const palms = this.scatterPoints(1600, 100, 300, 4, (x, z) => !desert(x, z) || z < DESERT_Z + 10).slice(0, 14);
    const palmGeo = palmTreeGeometry(rng, 7);
    this.root.add(scatterInstanced(palmGeo, m.foliage, palms.map((p) => ({ ...p, y: p.y - 0.1, s: rng.range(0.85, 1.15) })), rng));
    for (const p of palms) if (inPlayArea(p.x, p.z)) colliders.push({ shape: 'cyl', r: 0.3, hh: 2, x: p.x, y: p.y + 2, z: p.z });

    const rocks = this.scatterPoints(240, 50, 240, 2.5);
    const rt = [rockGeometry(rng), rockGeometry(rng)];
    rt.forEach((geo, i) => {
      const slice = rocks.filter((_, k) => k % 2 === i).map((p) => ({ ...p, y: p.y - 0.25, s: rng.range(0.5, 2.2) }));
      this.root.add(scatterInstanced(geo, m.foliage, slice, rng));
      for (const p of slice) {
        if (p.s > 0.9 && inPlayArea(p.x, p.z)) colliders.push({ shape: 'cyl', r: p.s * 0.95, hh: p.s * 0.5, x: p.x, y: p.y + p.s * 0.3, z: p.z });
      }
    });

    // grass tufts (no shadows, density scaled by quality at runtime via mesh.count)
    const grass = this.scatterPoints(4200, 14, 150, 0.6, (x, z) => {
      if (nearHouse(x, z, 0.2)) return true;
      if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.r + 1) return true;
      if (desert(x, z)) return true;
      return x > MARKET.x0 - 1 && x < MARKET.x1 + 1 && z > MARKET.z0 - 1 && z < MARKET.z1 + 1;
    });
    // the green west: extra grass in the countryside
    grass.push(...this.scatterPoints(2600, 120, 300, 0.6, (x, z) => x > -110 || desert(x, z) || !inPlayArea(x, z)));
    const grassGeo = grassTuftGeometry();
    for (const gm of this.chunked(grassGeo, m.grass, grass.map((p) => ({ ...p, s: rng.range(0.7, 1.5) })), 140, { castShadow: false, tintJitter: 0.15 })) {
      gm.userData.fullCount = gm.count;
      this.grassMeshes.push(gm);
      this.root.add(gm);
    }

    this.physics.addStaticColliders(colliders);
    this.staticColliderCount += colliders.length;
  }

  /** Water surfaces that miracles can act on (independent materials). */
  buildWaterTargets(spots) {
    const mk = (geo, x, y, z, id, name, radius) => {
      const mat = new THREE.MeshStandardMaterial({ color: '#3f8fa6', roughness: 0.12, metalness: 0.05, emissive: '#000000' });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.receiveShadow = true;
      this.root.add(mesh);
      return { id, name, mesh, x, y, z, radius, wine: 0, target: 0, wineUntil: 0 };
    };
    const w = spots.wellWater;
    const t = spots.troughWater;
    this.waterTargets = [
      mk(new THREE.CircleGeometry(w.r, 20).rotateX(-Math.PI / 2), w.x, w.y, w.z, 'water.well', 'The Town Well', 1.6),
      mk(new THREE.BoxGeometry(t.w, 0.04, t.d), t.x, t.y, t.z, 'water.trough', 'Stone trough', 1.3),
    ];
    // walk-on-water surface: a thin fixed collider over the open lake strip, off until the miracle
    const R = this.physics.RAPIER;
    const body = this.physics.world.createRigidBody(R.RigidBodyDesc.fixed());
    // the whole lake (Phase 5): from the west shore to the edge of the map
    this.lakeCollider = this.physics.world.createCollider(R.ColliderDesc.cuboid(50, 0.1, 100).setTranslation(158, -0.08, LAKE.z).setFriction(0.9), body);
    this.lakeCollider.setEnabled(false);
  }

  setWaterWalkable(on) {
    this.lakeCollider.setEnabled(on);
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
    if (this.boat) {
      this.boat.position.y = Math.sin(elapsed * 1.1) * 0.06;
      this.boat.rotation.z = Math.sin(elapsed * 0.8) * 0.03;
    }
    // water <-> wine colour blend
    for (const w of this.waterTargets || []) {
      w.wine += (w.target - w.wine) * Math.min(1, dt * 1.6);
      w.mesh.material.color.copy(WATER_COLOR).lerp(WINE_COLOR, w.wine);
      w.mesh.material.emissive.copy(WINE_GLOW).multiplyScalar(w.wine * 0.25);
    }
    this.sky.mesh.position.copy(cameraPosition);
    this.sky.mesh.scale.setScalar(far * 0.92);
    this.clouds.position.x = ((elapsed * 1.2) % 160) - 80;
    // grass is tiny from afar: skip chunks whose bounds are well beyond the camera
    for (const g of this.grassMeshes) {
      const bs = g.boundingSphere;
      if (bs) g.visible = Math.hypot(cameraPosition.x - bs.center.x, cameraPosition.z - bs.center.z) - bs.radius < 110;
    }
    for (const m of this.regionMeshes || []) {
      const site = m.userData.site;
      m.visible = Math.hypot(cameraPosition.x - site.x, cameraPosition.z - site.z) < 330;
    }
    if (dt > 0) {
      (this.flames || []).forEach((f, i) => {
        const k = 1 + Math.sin(elapsed * 17 + i) * 0.12 + Math.sin(elapsed * 29 + 1 + i * 2) * 0.08;
        f.scale.set(1 + Math.sin(elapsed * 13 + i) * 0.08, k, 1 + Math.cos(elapsed * 11 + i) * 0.08);
      });
      for (const fl of this.flags || []) {
        if (Math.hypot(cameraPosition.x - fl.position.x, cameraPosition.z - fl.position.z) > 70) continue;
        const pos = fl.geometry.attributes.position;
        const base = fl.userData.base;
        for (let i = 0; i < pos.count; i += 1) {
          const x = base[i * 3];
          pos.setZ(i, Math.sin(elapsed * 3.4 + x * 3.5) * 0.14 * (x / 1.6));
        }
        pos.needsUpdate = true;
        fl.geometry.computeVertexNormals();
      }
    }
    if (this.checkpoint && dt > 0) {
      // banner ripple
      const b = this.checkpoint.banner;
      const pos = b.geometry.attributes.position;
      const base = b.userData.base;
      if (Math.hypot(cameraPosition.x - b.position.x, cameraPosition.z - b.position.z) < 70) {
        for (let i = 0; i < pos.count; i += 1) {
          const x = base[i * 3];
          const y = base[i * 3 + 1];
          const w = (0.95 - y) / 1.9;
          pos.setZ(i, Math.sin(elapsed * 3 + x * 4 + y) * 0.09 * w);
        }
        pos.needsUpdate = true;
        b.geometry.computeVertexNormals();
      }
    }
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
