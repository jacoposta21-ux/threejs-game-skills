import * as THREE from 'three';
import { GeoBuilder } from './GeoBuilder.js';
import * as T from './textures.js';
import { createRng } from '../utils/random.js';
import { bakeStatic } from '../core/AssetLoader.js';
import { PropInstancer } from './PropInstancer.js';
import { addWind, carPaint } from './Effects.js';
import {
  LINES, xWidths, zWidths, SIDEWALK, CURB_H, BOULEVARD_MEDIAN, BEACH, WATER_LEVEL, BOUNDS,
  allBlocks, terrainHeight,
} from './Layout.js';

const CHUNK = 300;

// Builds the whole city: merged static geometry per (chunk, material), instanced
// props, collision volumes, minimap footprints and points of interest.
export class CityGenerator {
  constructor(scene, collision, assets, seed = 1987) {
    this.scene = scene;
    this.collision = collision;
    this.assets = assets;
    this.rng = createRng(seed);
    this.buckets = new Map();
    this.materials = {};
    this.nightMaterials = { windows: [], neon: [], lamps: [], shops: [] };
    this.wetMaterials = [];
    this.footprints = []; // {x0,z0,x1,z1,h,kind}
    this.props = {
      palms: [], trees: [], lamps: [], benches: [], bins: [], hydrants: [], umbrellas: [], loungers: [],
      containers: [], bushes: [], cars: [], signals: [], glows: [],
    };
    this.pois = [];
    this.group = new THREE.Group();
    this.group.name = 'City';
    scene.add(this.group);
    this.chunkMeshes = [];
    this.animated = []; // {update(dt, t)}
  }

  // ---------------------------------------------------------------- materials
  mat(key) {
    if (this.materials[key]) return this.materials[key];
    let m;
    const std = (o) => new THREE.MeshStandardMaterial(o);
    const rep = (t, x = 1, y = 1) => { t.repeat.set(x, y); return t; };
    switch (key) {
      case 'road14': m = std({ map: T.roadTexture(14, { lanesEachWay: 2 }), roughness: 0.82, normalMap: T.grainNormalTexture(), normalScale: new THREE.Vector2(0.18, 0.18) }); this.wetMaterials.push(m); break;
      case 'road16': m = std({ map: T.roadTexture(16, { lanesEachWay: 2 }), roughness: 0.82, normalMap: T.grainNormalTexture(), normalScale: new THREE.Vector2(0.18, 0.18) }); this.wetMaterials.push(m); break;
      case 'blvd': m = std({ map: T.roadTexture(11, { oneWay: true, lanes: 3 }), roughness: 0.82, normalMap: T.grainNormalTexture(), normalScale: new THREE.Vector2(0.18, 0.18) }); this.wetMaterials.push(m); break;
      case 'inter': m = std({ map: T.intersectionTexture(), roughness: 0.82, normalMap: T.grainNormalTexture(), normalScale: new THREE.Vector2(0.18, 0.18) }); this.wetMaterials.push(m); break;
      case 'sidewalk': m = std({ map: T.sidewalkTexture(), roughness: 0.85, normalMap: T.grainNormalTexture(), normalScale: new THREE.Vector2(0.5, 0.5) }); break;
      case 'curb': m = std({ color: 0xb8b2a8, roughness: 0.85 }); break;
      case 'grass': m = std({ map: T.grassTexture(), roughness: 1 }); break;
      case 'sand': m = std({ map: T.sandTexture(), roughness: 1 }); break;
      case 'plaza': m = std({ map: T.plazaTexture(), roughness: 0.8 }); break;
      case 'parking': m = std({ map: T.parkingTexture(), roughness: 0.9 }); break;
      case 'lot': m = std({ map: T.concreteTexture('#a39d92'), roughness: 0.9 }); break;
      case 'yard': m = std({ map: T.concreteTexture('#6f6b64', 43), color: 0xb8b2a8, roughness: 0.95 }); break;
      case 'roof': m = std({ map: T.roofTexture(), roughness: 0.95 }); break;
      case 'tileroof': m = std({ map: T.tileRoofTexture(), roughness: 0.8 }); break;
      case 'trim': m = std({ color: 0xece8e0, roughness: 0.7 }); break;
      case 'trimDark': m = std({ color: 0x3c3f44, roughness: 0.6, metalness: 0.3 }); break;
      case 'metal': m = std({ color: 0x8a8f94, roughness: 0.45, metalness: 0.7 }); break;
      case 'darkmetal': m = std({ color: 0x2c2f33, roughness: 0.5, metalness: 0.6 }); break;
      case 'corrugated': m = std({ map: T.corrugatedTexture('#8d9396'), roughness: 0.6, metalness: 0.4 }); break;
      case 'corrBlue': m = std({ map: T.corrugatedTexture('#5f7f95', 72), roughness: 0.6, metalness: 0.4 }); break;
      case 'corrRust': m = std({ map: T.corrugatedTexture('#9a6a4c', 73), roughness: 0.7, metalness: 0.3 }); break;
      case 'hedge': m = std({ color: 0x3f6b2f, roughness: 1 }); break;
      case 'pool': m = std({ color: 0x3fc3d8, roughness: 0.08, metalness: 0.1, emissive: 0x0c3d48, emissiveIntensity: 0.4 }); break;
      case 'pond': m = std({ color: 0x2f5a5c, roughness: 0.05, metalness: 0.2 }); break;
      case 'awningRed': m = std({ color: 0xb8322d, roughness: 0.8, side: THREE.DoubleSide }); break;
      case 'awningTeal': m = std({ color: 0x1f8a86, roughness: 0.8, side: THREE.DoubleSide }); break;
      case 'awningYellow': m = std({ color: 0xe0b23c, roughness: 0.8, side: THREE.DoubleSide }); break;
      case 'stripe': m = std({ color: 0xffffff, roughness: 0.8 }); break;
      case 'wood': m = std({ color: 0x9c7650, roughness: 0.9 }); break;
      case 'canopyLight': m = std({ color: 0xffffff, emissive: 0xfff2d8, emissiveIntensity: 0.2, roughness: 0.5 }); this.nightMaterials.lamps.push(m); break;
      case 'neon': {
        const atlas = T.neonAtlas();
        m = std({ color: 0x111111, emissive: 0xffffff, emissiveMap: atlas, emissiveIntensity: 1, roughness: 0.4, transparent: false });
        this.nightMaterials.neon.push(m);
        break;
      }
      case 'billboard': {
        m = std({ map: T.billboardAtlas(), emissive: 0xffffff, emissiveMap: T.billboardAtlas(), emissiveIntensity: 0, roughness: 0.6 });
        this.nightMaterials.shops.push(m);
        break;
      }
      case 'neonPink': case 'neonCyan': case 'neonPurple': case 'neonOrange': case 'neonGreen': {
        const col = { neonPink: 0xff3fa4, neonCyan: 0x3fe6ff, neonPurple: 0xa95cff, neonOrange: 0xff8a2a, neonGreen: 0x3dff9a }[key];
        m = std({ color: col, emissive: col, emissiveIntensity: 1, roughness: 0.3 });
        this.nightMaterials.neon.push(m);
        break;
      }
      case 'shop': {
        const s = T.shopfrontMaps();
        m = std({ map: s.map, emissiveMap: s.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0, roughnessMap: s.ormMap, metalnessMap: s.ormMap, roughness: 1, metalness: 1 });
        m.userData.tile = [s.tileW, s.tileH];
        this.nightMaterials.shops.push(m);
        break;
      }
      default: {
        if (key.startsWith('facade_')) {
          const style = key.slice(7);
          const f = T.facadeMaterialMaps(style);
          m = std({
            map: f.map, emissiveMap: f.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0,
            roughnessMap: f.ormMap, metalnessMap: f.ormMap, roughness: 1, metalness: 1, envMapIntensity: 1,
            normalMap: f.normalMap, normalScale: new THREE.Vector2(0.9, 0.9),
          });
          m.userData.tile = [f.tileW, f.tileH];
          this.nightMaterials.windows.push(m);
        } else {
          m = std({ color: 0xff00ff });
        }
      }
    }
    rep;
    this.materials[key] = m;
    return m;
  }

  tileOf(key) {
    return this.mat(key).userData.tile || [4, 4];
  }

  b(key, x, z) {
    const cx = Math.floor((x + 1000) / CHUNK), cz = Math.floor((z + 1000) / CHUNK);
    const k = `${cx},${cz}|${key}`;
    let g = this.buckets.get(k);
    if (!g) { g = new GeoBuilder(); g.matKey = key; g.chunk = [cx, cz]; this.buckets.set(k, g); }
    return g;
  }

  // ---------------------------------------------------------------- generate
  generate() {
    this.buildGroundAndBeach();
    this.buildRoads();
    for (const blk of allBlocks()) this.buildBlock(blk);
    this.buildStreetFurniture();
    this.buildBoundaries();
    this.flush();
    this.buildInstances();
    return this;
  }

  buildGroundAndBeach() {
    const E = LINES[8] + xWidths[8] / 2; // 408 east edge of Ocean Drive
    const W = LINES[0] - xWidths[0] / 2;
    const N = LINES[0] - zWidths[0] / 2;
    const S = LINES[8] + zWidths[8] / 2;
    // Raised margins around the city (grass) so terrainHeight matches geometry.
    const margins = [
      [-1600, -1600, E, N], // north
      [-1600, S, E, 1600], // south
      [-1600, N, W, S], // west
    ];
    for (const [x0, z0, x1, z1] of margins) {
      // split into chunk-sized pieces so they cull
      for (let x = x0; x < x1; x += CHUNK) for (let z = z0; z < z1; z += CHUNK) {
        const xa = x, xb = Math.min(x + CHUNK, x1), za = z, zb = Math.min(z + CHUNK, z1);
        this.b('grass', (xa + xb) / 2, (za + zb) / 2).top(xa, za, xb, zb, CURB_H, 6);
      }
      this.b('curb', (x0 + x1) / 2, (z0 + z1) / 2).box(x0, 0, z0, x1, CURB_H, z1, { tileW: 4, tileH: 4 });
    }
    // Ocean Drive promenade (east sidewalk) and beach sand slope.
    for (let z = -1600; z < 1600; z += CHUNK) {
      const za = z, zb = z + CHUNK;
      this.b('sidewalk', 410, z + 100).top(E, za, BEACH.promenadeEnd, zb, CURB_H, 3);
      this.b('curb', 410, z + 100).box(E, 0, za, BEACH.promenadeEnd, CURB_H, zb, { tileW: 4, tileH: 4 });
      // sand strips with a gentle slope into the sea
      const steps = [BEACH.promenadeEnd, 430, 450, 470, 500, 560, 700];
      const g = this.b('sand', 470, z + 100);
      for (let i = 0; i < steps.length - 1; i++) {
        const xa = steps[i], xb = steps[i + 1];
        const ya = terrainHeight(xa + 0.01, 0), yb = terrainHeight(xb, 0);
        g.quad([xa, ya, zb], [xb, yb, zb], [xb, yb, za], [xa, ya, za], [xa / 8, -zb / 8], [xb / 8, -zb / 8], [xb / 8, -za / 8], [xa / 8, -za / 8]);
      }
    }
    // low sea wall step from promenade to sand
    this.b('trim', 413, 0);
    // Lifeguard towers + beach umbrellas/loungers.
    const rng = this.rng;
    for (let z = -440; z <= 440; z += 110) {
      this.lifeguardTower(452, z + rng.range(-10, 10));
    }
    for (let i = 0; i < 90; i++) {
      const x = rng.range(425, 458), z = rng.range(-450, 450);
      if (this.collision.blockedCircle(x, z, 2)) continue;
      this.props.umbrellas.push({ x, z, y: terrainHeight(x, z), rot: rng.range(0, 6.28), color: rng.pick([0xe94b5f, 0x2bb3c0, 0xf2c14e, 0xffffff, 0x4f7cff, 0xff8a3d]) });
      if (rng.chance(0.8)) this.props.loungers.push({ x: x + 1.2, z: z + rng.range(-1, 1), y: terrainHeight(x + 1.2, z), rot: Math.PI / 2 + rng.range(-0.2, 0.2) });
      if (rng.chance(0.5)) this.props.loungers.push({ x: x - 1.2, z: z + rng.range(-1, 1), y: terrainHeight(x - 1.2, z), rot: Math.PI / 2 + rng.range(-0.2, 0.2) });
    }
    // Beach palms in clusters
    for (let i = 0; i < 70; i++) {
      const x = rng.range(416, 440), z = rng.range(-470, 470);
      if (this.collision.blockedCircle(x, z, 1.5)) continue;
      this.addPalm(x, z, terrainHeight(x, z), rng.range(0.9, 1.3));
    }
    this.pois.push({ type: 'beach', x: 440, z: -60 });
  }

  lifeguardTower(x, z) {
    const y = terrainHeight(x, z);
    const g = this.b('trim', x, z);
    const legs = [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]];
    for (const [dx, dz] of legs) this.b('wood', x, z).box(x + dx - 0.1, y - 0.5, z + dz - 0.1, x + dx + 0.1, y + 2.6, z + dz + 0.1);
    this.b('wood', x, z).box(x - 1.6, y + 2.6, z - 1.6, x + 1.6, y + 2.8, z + 1.6, { top: true });
    // cabin (pastel)
    this.b('awningTeal', x, z).box(x - 1.3, y + 2.8, z - 1.3, x + 1.3, y + 4.6, z + 1.3);
    this.b('awningRed', x, z).box(x - 1.6, y + 4.6, z - 1.6, x + 1.6, y + 4.85, z + 1.6, { top: true });
    this.b('wood', x, z).box(x - 2.8, y + 0.2, z - 0.6, x - 1.6, y + 0.35, z + 0.6, { top: true }); // ramp-ish step
    g;
    this.collision.addBox(x - 1.4, z - 1.4, x + 1.4, z + 1.4, y + 4.85, 'tower');
    this.footprints.push({ x0: x - 1.6, z0: z - 1.6, x1: x + 1.6, z1: z + 1.6, h: 5, kind: 'beach' });
  }

  buildRoads() {
    const zMin = LINES[0], zMax = LINES[8];
    // N-S roads
    for (let k = 0; k < LINES.length; k++) {
      const x = LINES[k], w = xWidths[k];
      const key = w === 16 ? 'road16' : 'road14';
      for (let j = 0; j < LINES.length - 1; j++) {
        const z0 = LINES[j] + zWidths[j] / 2, z1 = LINES[j + 1] - zWidths[j + 1] / 2;
        this.b(key, x, (z0 + z1) / 2).flat(x - w / 2, z0, x + w / 2, z1, 0.01, 0, -z1 / 12, 1, -z0 / 12);
      }
    }
    // E-W roads (boulevard at z = 0 has two carriageways and a planted median)
    for (let k = 0; k < LINES.length; k++) {
      const z = LINES[k], w = zWidths[k];
      for (let i = 0; i < LINES.length - 1; i++) {
        const x0 = LINES[i] + xWidths[i] / 2, x1 = LINES[i + 1] - xWidths[i + 1] / 2;
        const cx = (x0 + x1) / 2;
        if (z === 0) {
          const hm = BOULEVARD_MEDIAN / 2;
          this.b('blvd', cx, z).flat(x0, -w / 2, x1, -hm, 0.01, 0, x0 / 12, 1, x1 / 12, true);
          // southern carriageway mirrored so arrows/lanes read correctly
          this.b('blvd', cx, z).flat(x0, hm, x1, w / 2, 0.01, 1, x0 / 12, 0, x1 / 12, true);
          // median island
          this.b('curb', cx, z).box(x0 + 2, 0, -hm, x1 - 2, CURB_H, hm);
          this.b('grass', cx, z).top(x0 + 2, -hm, x1 - 2, hm, CURB_H + 0.01, 6);
          for (let x = x0 + 8; x < x1 - 6; x += 11) this.addPalm(x, 0, CURB_H, this.rng.range(1.05, 1.3));
          for (let x = x0 + 13.5; x < x1 - 6; x += 22) this.props.bushes.push({ x, z: 0, y: CURB_H, s: this.rng.range(0.8, 1.2), rot: this.rng.range(0, 6) });
        } else {
          this.b('road14', cx, z).flat(x0, z - w / 2, x1, z + w / 2, 0.01, 0, x0 / 12, 1, x1 / 12, true);
        }
      }
    }
    // Intersections
    for (let i = 0; i < LINES.length; i++) for (let j = 0; j < LINES.length; j++) {
      const x = LINES[i], z = LINES[j], wx = xWidths[i], wz = zWidths[j];
      this.b('inter', x, z).flat(x - wx / 2, z - wz / 2, x + wx / 2, z + wz / 2, 0.012, 0, 0, 1, 1);
      this.addTrafficSignals(x, z, wx, wz, i, j);
    }
    void zMin; void zMax;
  }

  addTrafficSignals(x, z, wx, wz, i, j) {
    // Signals on two diagonal corners, each controlling one axis.
    const corners = [
      { cx: x + wx / 2 + 0.8, cz: z + wz / 2 + 0.8, axis: 'ns', armDir: [-1, 0] },
      { cx: x - wx / 2 - 0.8, cz: z - wz / 2 - 0.8, axis: 'ns', armDir: [1, 0] },
      { cx: x - wx / 2 - 0.8, cz: z + wz / 2 + 0.8, axis: 'ew', armDir: [0, -1] },
      { cx: x + wx / 2 + 0.8, cz: z - wz / 2 - 0.8, axis: 'ew', armDir: [0, 1] },
    ];
    const phaseOffset = ((i * 3 + j * 5) % 4) * 4;
    for (const c of corners) {
      const armLen = (c.axis === 'ns' ? wx : wz) * 0.45;
      const g = this.b('darkmetal', c.cx, c.cz);
      g.box(c.cx - 0.12, CURB_H, c.cz - 0.12, c.cx + 0.12, 6.2, c.cz + 0.12);
      const ex = c.cx + c.armDir[0] * armLen, ez = c.cz + c.armDir[1] * armLen;
      g.box(Math.min(c.cx, ex) - 0.08, 5.9, Math.min(c.cz, ez) - 0.08, Math.max(c.cx, ex) + 0.08, 6.1, Math.max(c.cz, ez) + 0.08);
      // signal head hanging at arm end, faces traffic approaching along its axis
      const hx = c.cx + c.armDir[0] * armLen * 0.85, hz = c.cz + c.armDir[1] * armLen * 0.85;
      g.box(hx - 0.25, 4.6, hz - 0.25, hx + 0.25, 5.9, hz + 0.25, { top: true });
      // face direction: toward approaching traffic (perpendicular to arm)
      const face = c.axis === 'ns' ? [0, Math.sign(c.cz - z)] : [Math.sign(c.cx - x), 0];
      this.props.signals.push({ x: hx + face[0] * 0.27, z: hz + face[1] * 0.27, axis: c.axis, face, offset: phaseOffset });
      this.collision.addCircle(c.cx, c.cz, 0.2);
    }
  }

  // ---------------------------------------------------------------- blocks
  buildBlock(blk) {
    const { minX, maxX, minZ, maxZ, district, special } = blk;
    // block slab: sidewalk top + curb sides
    this.b('curb', (minX + maxX) / 2, (minZ + maxZ) / 2).box(minX, 0, minZ, maxX, CURB_H, maxZ, { tileW: 4, tileH: 4 });
    this.b('sidewalk', (minX + maxX) / 2, (minZ + maxZ) / 2).top(minX, minZ, maxX, maxZ, CURB_H, 3);
    const lot = { x0: minX + SIDEWALK, z0: minZ + SIDEWALK, x1: maxX - SIDEWALK, z1: maxZ - SIDEWALK };
    const lotKey = { park: 'grass', residential: 'grass', industrial: 'yard' }[district] || 'plaza';
    const lk = special === 'parking' || special === 'gas' ? 'parking' : lotKey;
    if (lk !== 'plaza' || district === 'downtown' || special === 'plaza') {
      this.b(lk, (lot.x0 + lot.x1) / 2, (lot.z0 + lot.z1) / 2).top(lot.x0, lot.z0, lot.x1, lot.z1, CURB_H + 0.015, lk === 'parking' ? 20 : lk === 'grass' ? 6 : 4);
    }
    if (special === 'park') return this.buildPark(lot, blk);
    if (special === 'gas') return this.buildGasStation(lot, blk);
    if (special === 'parking') return this.buildParking(lot, blk);
    if (special === 'plaza') return this.buildPlaza(lot, blk);
    switch (district) {
      case 'downtown': return this.buildDowntown(lot, blk);
      case 'midtown': return this.buildPerimeter(lot, blk, { floors: [3, 9], styles: ['office', 'brick', 'stuccoWhite', 'officeDark', 'decoWhite'], shop: true });
      case 'nightlife': return this.buildPerimeter(lot, blk, { floors: [2, 5], styles: ['decoPink', 'decoMint', 'decoLilac', 'decoWhite', 'stuccoYellow'], shop: true, neon: true });
      case 'beach': return this.buildBeachHotels(lot, blk);
      case 'residential': return this.buildHouses(lot, blk);
      case 'apartments': return this.buildApartments(lot, blk);
      case 'industrial': return this.buildIndustrial(lot, blk);
      default: return null;
    }
  }

  /** A building volume with optional shop ground floor, parapet, rooftop clutter. */
  building(x0, z0, x1, z1, height, style, o = {}) {
    const y0 = CURB_H;
    const fk = `facade_${style}`;
    const [tw, th] = this.tileOf(fk);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    let yb = y0;
    if (o.shop) {
      const [sw, sh] = this.tileOf('shop');
      this.b('shop', cx, cz).box(x0, y0, z0, x1, y0 + 4.5, z1, { tileW: sw, tileH: sh, vBase: y0, uOffset: this.rng.int(0, 3) * 0.25 });
      // cornice between shop and upper floors
      this.b('trim', cx, cz).box(x0 - 0.25, y0 + 4.5, z0 - 0.25, x1 + 0.25, y0 + 4.85, z1 + 0.25, { top: true });
      if (o.awnings) this.awnings(x0, z0, x1, z1, y0 + 3.6);
      yb = y0 + 4.85;
    }
    if (height > yb + 0.5) {
      this.b(fk, cx, cz).box(x0, yb, z0, x1, height, z1, { tileW: tw, tileH: th, vBase: o.shop ? y0 + 4.85 : y0, uOffset: this.rng.int(0, 7) / 8 });
    }
    this.b('roof', cx, cz).top(x0, z0, x1, z1, height, 4);
    // parapet
    if (o.parapet !== false) {
      const p = 0.35, ph = 0.9, t = this.b(o.parapetKey || 'trim', cx, cz);
      t.box(x0 - 0.1, height, z0 - 0.1, x1 + 0.1, height + ph, z0 + p, { top: true });
      t.box(x0 - 0.1, height, z1 - p, x1 + 0.1, height + ph, z1 + 0.1, { top: true });
      t.box(x0 - 0.1, height, z0 + p, x0 + p, height + ph, z1 - p, { top: true });
      t.box(x1 - p, height, z0 + p, x1 + 0.1, height + ph, z1 - p, { top: true });
    }
    if (o.rooftop !== false && x1 - x0 > 8 && z1 - z0 > 8) this.rooftopClutter(x0, z0, x1, z1, height);
    if (!o.noCollide) this.collision.addBox(x0, z0, x1, z1, height + 1, 'building');
    this.footprints.push({ x0, z0, x1, z1, h: height, kind: o.kind || 'building' });
  }

  rooftopClutter(x0, z0, x1, z1, h) {
    const rng = this.rng;
    const n = rng.int(1, 4);
    const g = this.b('metal', (x0 + x1) / 2, (z0 + z1) / 2);
    for (let i = 0; i < n; i++) {
      const w = rng.range(1.5, 4), d = rng.range(1.5, 3), hh = rng.range(1, 2.4);
      const x = rng.range(x0 + 2, x1 - 2 - w), z = rng.range(z0 + 2, z1 - 2 - d);
      g.box(x, h, z, x + w, h + hh, z + d, { top: true });
    }
    if (rng.chance(0.35)) {
      const x = rng.range(x0 + 3, x1 - 3), z = rng.range(z0 + 3, z1 - 3);
      this.b('darkmetal', x, z).cylinder(x, z, 1.4, h + 2.2, h + 5, 10);
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.b('darkmetal', x, z).box(x + dx - 0.08, h, z + dz - 0.08, x + dx + 0.08, h + 2.2, z + dz + 0.08);
    }
  }

  awnings(x0, z0, x1, z1, y) {
    const rng = this.rng;
    const keys = ['awningRed', 'awningTeal', 'awningYellow'];
    const sides = [
      ['nz', x0, z0, x1, z0], ['pz', x0, z1, x1, z1], ['nx', x0, z0, x0, z1], ['px', x1, z0, x1, z1],
    ];
    for (const [dir, ax, az, bx, bz] of sides) {
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.floor(len / 6);
      for (let i = 0; i < n; i++) {
        if (rng.chance(0.4)) continue;
        const t0 = (i + 0.15) / n, t1 = (i + 0.85) / n;
        const k = rng.pick(keys);
        const px0 = ax + (bx - ax) * t0, pz0 = az + (bz - az) * t0, px1 = ax + (bx - ax) * t1, pz1 = az + (bz - az) * t1;
        const out = 1.6;
        const g = this.b(k, px0, pz0);
        if (dir === 'nz') g.quad([px0, y, pz0], [px1, y, pz0], [px1, y - 0.8, pz0 - out], [px0, y - 0.8, pz0 - out]);
        else if (dir === 'pz') g.quad([px1, y, pz1], [px0, y, pz1], [px0, y - 0.8, pz1 + out], [px1, y - 0.8, pz1 + out]);
        else if (dir === 'nx') g.quad([px0, y, pz1], [px0, y, pz0], [px0 - out, y - 0.8, pz0], [px0 - out, y - 0.8, pz1]);
        else g.quad([px1, y, pz0], [px1, y, pz1], [px1 + out, y - 0.8, pz1], [px1 + out, y - 0.8, pz0]);
      }
    }
  }

  // Neon sign on a facade. dir: outward normal of the wall ('px','nx','pz','nz').
  neonSign(cx, cy, cz, w, h, dir, slot) {
    const { cols, rows } = T.neonAtlas().userData;
    const c = slot % cols, r = Math.floor(slot / cols);
    const u0 = c / cols, u1 = (c + 1) / cols;
    const v1 = 1 - r / rows, v0 = 1 - (r + 1) / rows;
    const off = { px: [0.2, 0], nx: [-0.2, 0], pz: [0, 0.2], nz: [0, -0.2] }[dir];
    this.b('darkmetal', cx, cz).box(
      cx + off[0] * 0.5 - (dir[1] === 'z' ? w / 2 + 0.1 : 0.08), cy - h / 2 - 0.1, cz + off[1] * 0.5 - (dir[1] === 'x' ? w / 2 + 0.1 : 0.08),
      cx + off[0] * 0.5 + (dir[1] === 'z' ? w / 2 + 0.1 : 0.08), cy + h / 2 + 0.1, cz + off[1] * 0.5 + (dir[1] === 'x' ? w / 2 + 0.1 : 0.08),
    );
    this.b('neon', cx, cz).wallQuad(cx + off[0], cy, cz + off[1], w, h, dir, [u0, v0, u1, v1]);
  }

  neonStrip(x0, z0, x1, z1, y, key) {
    const t = 0.12;
    const g = this.b(key, (x0 + x1) / 2, (z0 + z1) / 2);
    g.box(x0 - t, y, z0 - t, x1 + t, y + 0.18, z0 + t);
    g.box(x0 - t, y, z1 - t, x1 + t, y + 0.18, z1 + t);
    g.box(x0 - t, y, z0, x0 + t, y + 0.18, z1);
    g.box(x1 - t, y, z0, x1 + t, y + 0.18, z1);
  }

  buildDowntown(lot, blk) {
    const rng = this.rng;
    const W = lot.x1 - lot.x0, D = lot.z1 - lot.z0;
    const split = rng.int(0, 2); // 0: one big tower, 1: two towers, 2: four
    const parcels = [];
    if (split === 0) parcels.push(lot);
    else if (split === 1) {
      if (rng.chance(0.5)) { const m = lot.x0 + W * rng.range(0.42, 0.58); parcels.push({ ...lot, x1: m - 4 }, { ...lot, x0: m + 4 }); }
      else { const m = lot.z0 + D * rng.range(0.42, 0.58); parcels.push({ ...lot, z1: m - 4 }, { ...lot, z0: m + 4 }); }
    } else {
      const mx = lot.x0 + W / 2, mz = lot.z0 + D / 2;
      parcels.push({ x0: lot.x0, z0: lot.z0, x1: mx - 3, z1: mz - 3 }, { x0: mx + 3, z0: lot.z0, x1: lot.x1, z1: mz - 3 },
        { x0: lot.x0, z0: mz + 3, x1: mx - 3, z1: lot.z1 }, { x0: mx + 3, z0: mz + 3, x1: lot.x1, z1: lot.z1 });
    }
    const centreDist = Math.hypot((blk.minX + blk.maxX) / 2 - 50, (blk.minZ + blk.maxZ) / 2);
    const tallBias = 1 - Math.min(1, centreDist / 260);
    for (const p of parcels) {
      const style = rng.pick(['glassTeal', 'glassBlue', 'glassGold', 'office', 'officeDark', 'glassTeal']);
      const pw = p.x1 - p.x0, pd = p.z1 - p.z0;
      // podium
      const podH = CURB_H + 4.85 + 3.6 * rng.int(1, 3);
      this.building(p.x0, p.z0, p.x1, p.z1, podH, rng.pick(['office', 'decoWhite', 'officeDark']), { shop: true, rooftop: false, awnings: rng.chance(0.4) });
      // tower tiers
      let tx0 = p.x0 + rng.range(3, 6), tz0 = p.z0 + rng.range(3, 6), tx1 = p.x1 - rng.range(3, 6), tz1 = p.z1 - rng.range(3, 6);
      const floors = Math.round(rng.range(12, 26) + tallBias * rng.range(10, 30) * (parcels.length === 1 ? 1.4 : 1));
      let h = podH + floors * 3.6;
      const tiers = rng.int(1, 3);
      let base = podH;
      for (let t = 0; t < tiers; t++) {
        const top = t === tiers - 1 ? h : base + (h - base) * rng.range(0.45, 0.7);
        this.towerSection(tx0, tz0, tx1, tz1, base, top, style);
        base = top;
        const inset = Math.min((tx1 - tx0) * 0.12, (tz1 - tz0) * 0.12, rng.range(2, 5));
        tx0 += inset; tz0 += inset; tx1 -= inset; tz1 -= inset;
        if (tx1 - tx0 < 8 || tz1 - tz0 < 8) break;
      }
      // crown + antenna on tall ones
      if (h > 90) {
        const cx = (tx0 + tx1) / 2, cz = (tz0 + tz1) / 2;
        this.b('trim', cx, cz).box(cx - 2, base, cz - 2, cx + 2, base + 6, cz + 2, { top: true });
        this.b('darkmetal', cx, cz).box(cx - 0.25, base + 6, cz - 0.25, cx + 0.25, base + 6 + rng.range(10, 24), cz + 0.25);
        this.props.glows.push({ x: cx, y: base + 6 + 18, z: cz, beacon: true });
      }
      // a billboard on some podiums
      if (rng.chance(0.25)) this.billboard((p.x0 + p.x1) / 2, podH, p.z0 + 1, 'nz');
      void pw; void pd;
    }
  }

  towerSection(x0, z0, x1, z1, y0, y1, style) {
    const fk = `facade_${style}`;
    const [tw, th] = this.tileOf(fk);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    this.b(fk, cx, cz).box(x0, y0, z0, x1, y1, z1, { tileW: tw, tileH: th, vBase: y0, uOffset: this.rng.int(0, 7) / 8 });
    this.b('roof', cx, cz).top(x0, z0, x1, z1, y1, 4);
    // thin trim band at each setback
    this.b('trimDark', cx, cz).box(x0 - 0.15, y1 - 0.6, z0 - 0.15, x1 + 0.15, y1 + 0.4, z1 + 0.15, { top: true });
    this.rooftopClutter(x0, z0, x1, z1, y1 + 0.4);
    this.collision.addBox(x0, z0, x1, z1, y1, 'building');
    this.footprints.push({ x0, z0, x1, z1, h: y1, kind: 'tower' });
  }

  billboard(cx, y, cz, dir) {
    const slot = this.rng.int(0, 3);
    const u0 = (slot % 2) * 0.5, v0 = slot < 2 ? 0.5 : 0;
    const w = 12, h = 6;
    const g = this.b('darkmetal', cx, cz);
    g.box(cx - 0.2, y, cz - 0.2, cx + 0.2, y + 3, cz + 0.2);
    g.box(cx - w / 2 - 0.2, y + 3, cz - 0.3, cx + w / 2 + 0.2, y + 3 + h + 0.3, cz + 0.3);
    this.b('billboard', cx, cz).wallQuad(cx, y + 3 + h / 2 + 0.15, cz + (dir === 'nz' ? -0.32 : 0.32), w, h, dir, [u0, v0, u0 + 0.5, v0 + 0.5]);
  }

  /** Perimeter block: a ring of street-facing buildings around a service court. */
  buildPerimeter(lot, blk, o) {
    const rng = this.rng;
    const depth = rng.range(14, 20);
    const sides = [
      { axis: 'x', fixed: lot.z0, dir: 'nz', from: lot.x0, to: lot.x1 },
      { axis: 'x', fixed: lot.z1, dir: 'pz', from: lot.x0, to: lot.x1 },
      { axis: 'z', fixed: lot.x0, dir: 'nx', from: lot.z0 + depth, to: lot.z1 - depth },
      { axis: 'z', fixed: lot.x1, dir: 'px', from: lot.z0 + depth, to: lot.z1 - depth },
    ];
    for (const s of sides) {
      let t = s.from;
      while (t < s.to - 6) {
        const w = Math.min(s.to - t, rng.range(12, 24));
        if (s.to - (t + w) < 8) { /* absorb the remainder */ }
        const ww = s.to - (t + w) < 8 ? s.to - t : w;
        const floors = rng.int(o.floors[0], o.floors[1]);
        const style = rng.pick(o.styles);
        const fh = T.FACADE_STYLES[style].floorM;
        const h = CURB_H + 4.85 + floors * fh;
        let x0, z0, x1, z1;
        if (s.axis === 'x') { x0 = t; x1 = t + ww; z0 = s.dir === 'nz' ? lot.z0 : lot.z1 - depth; z1 = s.dir === 'nz' ? lot.z0 + depth : lot.z1; }
        else { z0 = t; z1 = t + ww; x0 = s.dir === 'nx' ? lot.x0 : lot.x1 - depth; x1 = s.dir === 'nx' ? lot.x0 + depth : lot.x1; }
        this.building(x0 + 0.2, z0 + 0.2, x1 - 0.2, z1 - 0.2, h, style, { shop: o.shop, awnings: rng.chance(0.6), kind: o.neon ? 'club' : 'building' });
        if (o.neon) {
          // sign above the shop band, facing the street
          const slot = rng.int(0, 30);
          const sc = s.axis === 'x' ? [(x0 + x1) / 2, s.dir === 'nz' ? z0 + 0.2 : z1 - 0.2] : [s.dir === 'nx' ? x0 + 0.2 : x1 - 0.2, (z0 + z1) / 2];
          const sw = Math.min(ww - 2, 9);
          this.neonSign(sc[0], CURB_H + 6.4, sc[1], sw, sw / 4, s.dir, slot);
          this.neonStrip(x0 + 0.2, z0 + 0.2, x1 - 0.2, z1 - 0.2, h + 0.9, rng.pick(['neonPink', 'neonCyan', 'neonPurple', 'neonOrange', 'neonGreen']));
          this.props.glows.push({ x: sc[0], y: CURB_H + 6.4, z: sc[1], color: 0xff5fd0, ground: true });
        }
        t += ww;
      }
    }
    // inner court: parking / service yard with a few parked cars
    const cx0 = lot.x0 + depth + 2, cx1 = lot.x1 - depth - 2, cz0 = lot.z0 + depth + 2, cz1 = lot.z1 - depth - 2;
    if (cx1 - cx0 > 10 && cz1 - cz0 > 10) {
      this.b('parking', (cx0 + cx1) / 2, (cz0 + cz1) / 2).top(cx0, cz0, cx1, cz1, CURB_H + 0.02, 20);
      for (let i = 0; i < 4; i++) if (rng.chance(0.6)) this.props.cars.push({ x: rng.range(cx0 + 3, cx1 - 3), z: rng.range(cz0 + 3, cz1 - 3), y: CURB_H, rot: rng.chance(0.5) ? 0 : Math.PI });
    }
    void blk;
  }

  buildBeachHotels(lot, blk) {
    const rng = this.rng;
    const W = lot.x1 - lot.x0;
    const n = rng.int(2, 3);
    const span = (lot.z1 - lot.z0) / n;
    for (let i = 0; i < n; i++) {
      const z0 = lot.z0 + i * span + 2, z1 = lot.z0 + (i + 1) * span - 2;
      const tall = rng.chance(0.3);
      const floors = tall ? rng.int(18, 30) : rng.int(6, 12);
      const style = tall ? rng.pick(['glassTeal', 'glassBlue']) : rng.pick(['decoPink', 'decoMint', 'decoWhite', 'decoLilac']);
      const x1 = lot.x1, x0 = x1 - Math.min(W * 0.55, rng.range(26, 38));
      const h = CURB_H + 4.85 + floors * T.FACADE_STYLES[style].floorM;
      this.building(x0, z0, x1, z1, h, style, { shop: true, awnings: true, kind: 'hotel' });
      // vertical deco fin with hotel name
      const slot = rng.pick([9, 10, 11, 24, 25, 26, 4, 20]);
      this.b('trim', x1, (z0 + z1) / 2).box(x1, h - 14, (z0 + z1) / 2 - 0.4, x1 + 1.4, h + 4, (z0 + z1) / 2 + 0.4, { top: true });
      this.neonSign(x1 + 0.1, h - 2.5, (z0 + z1) / 2 - 7, 12, 3, 'px', slot);
      this.neonSign(x1 + 0.1, CURB_H + 6.4, (z0 + z1) / 2 + 6, 8, 2, 'px', rng.int(0, 30));
      this.neonStrip(x0, z0, x1, z1, h + 0.9, rng.pick(['neonCyan', 'neonPink', 'neonPurple']));
      // balcony slabs on deco hotels
      if (!tall) {
        const fh = 3.3;
        for (let y = CURB_H + 4.85 + fh; y < h - 1; y += fh) this.b('trim', x1, (z0 + z1) / 2).box(x1, y - 0.15, z0 + 2, x1 + 1.2, y, z1 - 2, { top: true });
      }
      // pool deck behind
      const px0 = lot.x0 + 4, px1 = x0 - 4;
      if (px1 - px0 > 10) {
        this.b('plaza', (px0 + px1) / 2, (z0 + z1) / 2).top(px0, z0 + 2, px1, z1 - 2, CURB_H + 0.02, 4);
        this.b('pool', (px0 + px1) / 2, (z0 + z1) / 2).top(px0 + 3, z0 + 6, px1 - 3, z1 - 6, CURB_H + 0.04, 4);
        this.collision.addBox(px0 + 3, z0 + 6, px1 - 3, z1 - 6, CURB_H + 0.3, 'pool');
        this.footprints.push({ x0: px0 + 3, z0: z0 + 6, x1: px1 - 3, z1: z1 - 6, h: 0, kind: 'pool' });
        for (let k = 0; k < 3; k++) this.addPalm(rng.range(px0, px1), rng.chance(0.5) ? z0 + 3 : z1 - 3, CURB_H, rng.range(0.9, 1.2));
      }
    }
    void blk;
  }

  buildHouses(lot, blk) {
    const rng = this.rng;
    const n = 3;
    const pw = (lot.x1 - lot.x0) / n, pd = (lot.z1 - lot.z0) / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const px0 = lot.x0 + i * pw, pz0 = lot.z0 + j * pd, px1 = px0 + pw, pz1 = pz0 + pd;
      const cx = (px0 + px1) / 2, cz = (pz0 + pz1) / 2;
      if (i === 1 && j === 1) {
        // shared garden with pool and trees
        this.b('pool', cx, cz).top(cx - 6, cz - 3.5, cx + 6, cz + 3.5, CURB_H + 0.04, 4);
        this.b('plaza', cx, cz).top(cx - 8, cz - 5.5, cx + 8, cz + 5.5, CURB_H + 0.025, 4);
        this.collision.addBox(cx - 6, cz - 3.5, cx + 6, cz + 3.5, CURB_H + 0.3, 'pool');
        this.footprints.push({ x0: cx - 6, z0: cz - 3.5, x1: cx + 6, z1: cz + 3.5, h: 0, kind: 'pool' });
        for (let k = 0; k < 4; k++) this.props.trees.push({ x: cx + rng.range(-10, 10), z: cz + (k % 2 ? 9 : -9), y: CURB_H, s: rng.range(0.8, 1.2) });
        continue;
      }
      // which street does the house face? the nearest lot edge
      const faceX = i === 0 ? -1 : i === 2 ? 1 : 0;
      const faceZ = faceX === 0 ? (j === 0 ? -1 : 1) : 0;
      const hw = rng.range(5, 7), hd = rng.range(4.5, 6);
      const floors = rng.chance(0.4) ? 2 : 1;
      const h = CURB_H + floors * 3.2;
      const style = 'house';
      const x0 = cx - hw, x1 = cx + hw, z0 = cz - hd, z1 = cz + hd;
      const wallKey = rng.pick(['facade_house', 'facade_stuccoPeach', 'facade_stuccoWhite', 'facade_decoMint']);
      const [tw, th] = this.tileOf(wallKey);
      this.b(wallKey, cx, cz).box(x0, CURB_H, z0, x1, h, z1, { tileW: tw, tileH: th, vBase: CURB_H });
      this.b('trim', cx, cz).box(x0 - 0.3, h, z0 - 0.3, x1 + 0.3, h + 0.25, z1 + 0.3);
      this.gableRoof(x0 - 0.6, z0 - 0.6, x1 + 0.6, z1 + 0.6, h + 0.25, rng.range(1.8, 2.8), wallKey);
      this.collision.addBox(x0, z0, x1, z1, h + 3, 'house');
      this.footprints.push({ x0, z0, x1, z1, h, kind: 'house' });
      // garage + driveway to the facing street
      const gx = faceZ !== 0 ? x1 + 0.2 : cx - 3, gz = faceX !== 0 ? z1 + 0.2 : cz - 3;
      if (faceZ !== 0) {
        this.b('facade_stuccoWhite', gx, cz).box(x1, CURB_H, cz - 3, x1 + 5, CURB_H + 3, cz + 3, { tileW: 9.6, tileH: 9.3 });
        this.b('roof', gx, cz).top(x1, cz - 3, x1 + 5, cz + 3, CURB_H + 3, 4);
        this.collision.addBox(x1, cz - 3, x1 + 5, cz + 3, CURB_H + 3, 'garage');
        const dz0 = faceZ < 0 ? pz0 : cz + 3, dz1 = faceZ < 0 ? cz - 3 : pz1;
        this.b('lot', x1 + 2.5, (dz0 + dz1) / 2).top(x1 + 0.2, dz0, x1 + 4.8, dz1, CURB_H + 0.03, 4);
        if (rng.chance(0.65)) this.props.cars.push({ x: x1 + 2.5, z: (dz0 + dz1) / 2, y: CURB_H, rot: rng.chance(0.5) ? 0 : Math.PI });
      } else {
        this.b('facade_stuccoWhite', cx, z1).box(cx - 3, CURB_H, z1, cx + 3, CURB_H + 3, z1 + 5, { tileW: 9.6, tileH: 9.3 });
        this.b('roof', cx, z1).top(cx - 3, z1, cx + 3, z1 + 5, CURB_H + 3, 4);
        this.collision.addBox(cx - 3, z1, cx + 3, z1 + 5, CURB_H + 3, 'garage');
        const dx0 = faceX < 0 ? px0 : cx + 3, dx1 = faceX < 0 ? cx - 3 : px1;
        this.b('lot', (dx0 + dx1) / 2, z1 + 2.5).top(dx0, z1 + 0.2, dx1, z1 + 4.8, CURB_H + 0.03, 4);
        if (rng.chance(0.65)) this.props.cars.push({ x: (dx0 + dx1) / 2, z: z1 + 2.5, y: CURB_H, rot: Math.PI / 2 });
      }
      // hedges on parcel boundaries (leave gaps)
      const hg = this.b('hedge', cx, cz);
      if (i < n - 1) hg.box(px1 - 0.5, CURB_H, pz0 + 2, px1 + 0.5, CURB_H + 1.3, pz1 - 6, { top: true }), this.collision.addBox(px1 - 0.5, pz0 + 2, px1 + 0.5, pz1 - 6, CURB_H + 1.3, 'hedge');
      if (j < n - 1) hg.box(px0 + 2, CURB_H, pz1 - 0.5, px1 - 6, CURB_H + 1.3, pz1 + 0.5, { top: true }), this.collision.addBox(px0 + 2, pz1 - 0.5, px1 - 6, pz1 + 0.5, CURB_H + 1.3, 'hedge');
      // garden trees / palms
      this.addPalm(px0 + rng.range(2, 5), pz0 + rng.range(2, 5), CURB_H, rng.range(0.7, 1));
      if (rng.chance(0.6)) this.props.trees.push({ x: px1 - rng.range(3, 6), z: pz1 - rng.range(3, 6), y: CURB_H, s: rng.range(0.7, 1.1) });
      if (rng.chance(0.5)) this.props.bushes.push({ x: cx + rng.range(-hw, hw), z: cz + (faceZ || 1) * (hd + 1.5), y: CURB_H, s: rng.range(0.6, 1), rot: rng.range(0, 6) });
      void style;
    }
    void blk;
  }

  gableRoof(x0, z0, x1, z1, y, h, wallKey, roofKey = 'tileroof') {
    const roof = this.b(roofKey, (x0 + x1) / 2, (z0 + z1) / 2);
    const ends = this.b(wallKey, (x0 + x1) / 2, (z0 + z1) / 2);
    roof.gable(x0, z0, x1, z1, y, h, roof, ends, 3);
  }

  buildApartments(lot, blk) {
    const rng = this.rng;
    const cols = 2, rows = 2;
    const pw = (lot.x1 - lot.x0) / cols, pd = (lot.z1 - lot.z0) / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const px0 = lot.x0 + i * pw + 3, pz0 = lot.z0 + j * pd + 3, px1 = px0 + pw - 6, pz1 = pz0 + pd - 6;
      const style = rng.pick(['stuccoPeach', 'stuccoYellow', 'stuccoWhite', 'decoMint', 'brick']);
      const floors = rng.int(4, 8);
      const fh = T.FACADE_STYLES[style].floorM;
      const bw = rng.range(18, pw - 10), bd = rng.range(14, pd - 12);
      const cx = (px0 + px1) / 2 + rng.range(-2, 2), cz = (pz0 + pz1) / 2 + rng.range(-2, 2);
      const h = CURB_H + 4.85 + floors * fh;
      this.building(cx - bw / 2, cz - bd / 2, cx + bw / 2, cz + bd / 2, h, style, { shop: rng.chance(0.4), awnings: true, kind: 'apartment' });
      // parking + trees around
      for (let k = 0; k < 3; k++) if (rng.chance(0.6)) this.props.cars.push({ x: rng.chance(0.5) ? px0 + 2 : px1 - 2, z: rng.range(pz0 + 3, pz1 - 3), y: CURB_H, rot: Math.PI / 2 });
      this.props.trees.push({ x: px0 + 1, z: pz0 + 1, y: CURB_H, s: rng.range(0.8, 1.1) });
      this.addPalm(px1 - 1, pz1 - 1, CURB_H, rng.range(0.8, 1.1));
    }
    void blk;
  }

  buildIndustrial(lot, blk) {
    const rng = this.rng;
    const W = lot.x1 - lot.x0, D = lot.z1 - lot.z0;
    // one or two warehouses
    const big = rng.chance(0.5);
    const wh = [];
    if (big) wh.push({ x0: lot.x0 + 4, z0: lot.z0 + 4, x1: lot.x0 + W * 0.65, z1: lot.z1 - 4 });
    else wh.push({ x0: lot.x0 + 4, z0: lot.z0 + 4, x1: lot.x1 - 4, z1: lot.z0 + D * 0.42 }, { x0: lot.x0 + 4, z0: lot.z0 + D * 0.58, x1: lot.x0 + W * 0.55, z1: lot.z1 - 4 });
    for (const w of wh) {
      const h = CURB_H + rng.range(8, 13);
      const key = rng.pick(['corrugated', 'corrBlue', 'corrRust']);
      const cx = (w.x0 + w.x1) / 2, cz = (w.z0 + w.z1) / 2;
      this.b(key, cx, cz).box(w.x0, CURB_H, w.z0, w.x1, h, w.z1, { tileW: 6, tileH: 6 });
      this.gableRoof(w.x0 - 0.4, w.z0 - 0.4, w.x1 + 0.4, w.z1 + 0.4, h, 2.2, key, 'metal');
      this.collision.addBox(w.x0, w.z0, w.x1, w.z1, h + 2, 'warehouse');
      this.footprints.push({ x0: w.x0, z0: w.z0, x1: w.x1, z1: w.z1, h, kind: 'warehouse' });
      // loading doors (dark recessed panels) along the long side
      const longX = w.x1 - w.x0 > w.z1 - w.z0;
      const g = this.b('darkmetal', cx, cz);
      const len = longX ? w.x1 - w.x0 : w.z1 - w.z0;
      for (let t = 4; t < len - 4; t += 9) {
        if (longX) g.box(w.x0 + t, CURB_H, w.z1, w.x0 + t + 4.5, CURB_H + 5, w.z1 + 0.08);
        else g.box(w.x1, CURB_H, w.z0 + t, w.x1 + 0.08, CURB_H + 5, w.z0 + t + 4.5);
      }
    }
    // chimneys / tanks on some blocks
    if (rng.chance(0.5)) {
      const x = lot.x1 - 10, z = lot.z1 - 12;
      for (let k = 0; k < 2; k++) {
        this.b('trim', x - k * 7, z).cylinder(x - k * 7, z, 1.3, CURB_H, CURB_H + rng.range(25, 40), 12, { tileW: 4, tileH: 4 });
        this.collision.addCircle(x - k * 7, z, 1.4);
      }
      this.b('metal', x, z - 14).cylinder(x, z - 14, 4.5, CURB_H, CURB_H + 9, 18);
      this.collision.addCircle(x, z - 14, 4.6);
      this.footprints.push({ x0: x - 4.5, z0: z - 18.5, x1: x + 4.5, z1: z - 9.5, h: 9, kind: 'warehouse' });
    }
    // container stacks in the yard
    const yardX0 = big ? lot.x0 + W * 0.65 + 6 : lot.x0 + W * 0.55 + 6;
    for (let k = 0; k < 14; k++) {
      const x = rng.range(yardX0, lot.x1 - 6), z = rng.range(lot.z0 + D * (big ? 0.05 : 0.48), lot.z1 - 6);
      if (this.collision.blockedCircle(x, z, 4)) continue;
      const rot = rng.chance(0.5) ? 0 : Math.PI / 2;
      const levels = rng.int(1, 2);
      for (let l = 0; l < levels; l++) this.props.containers.push({ x, z, y: CURB_H + l * 2.6, rot, color: rng.pick([0xb8442f, 0x2f6fb8, 0x3c8f4a, 0xd9a43a, 0x8a8f94, 0x6d3a8a]) });
      const hx = rot ? 1.25 : 3.05, hz = rot ? 3.05 : 1.25;
      this.collision.addBox(x - hx, z - hz, x + hx, z + hz, CURB_H + levels * 2.6, 'container');
      this.footprints.push({ x0: x - hx, z0: z - hz, x1: x + hx, z1: z + hz, h: 2.6 * levels, kind: 'container' });
    }
    void blk;
  }

  buildPark(lot, blk) {
    const rng = this.rng;
    const cx = (lot.x0 + lot.x1) / 2, cz = (lot.z0 + lot.z1) / 2;
    // cross paths
    this.b('plaza', cx, cz).top(cx - 2.5, lot.z0, cx + 2.5, lot.z1, CURB_H + 0.03, 4);
    this.b('plaza', cx, cz).top(lot.x0, cz - 2.5, lot.x1, cz + 2.5, CURB_H + 0.03, 4);
    // fountain
    this.b('trim', cx, cz).cylinder(cx, cz, 6, CURB_H, CURB_H + 0.7, 24);
    this.b('pool', cx, cz).cylinder(cx, cz, 5.4, CURB_H, CURB_H + 0.72, 24, { tileW: 4 });
    this.b('trim', cx, cz).cylinder(cx, cz, 0.8, CURB_H, CURB_H + 2.8, 12);
    this.b('trim', cx, cz).cylinder(cx, cz, 2.2, CURB_H + 1.8, CURB_H + 2.0, 16);
    this.collision.addCircle(cx, cz, 6);
    this.footprints.push({ x0: cx - 6, z0: cz - 6, x1: cx + 6, z1: cz + 6, h: 0, kind: 'pool' });
    // pond in one quadrant
    const px = cx + 20, pz = cz + 18;
    this.b('pond', px, pz).top(px - 9, pz - 6, px + 9, pz + 6, CURB_H + 0.02, 4);
    this.collision.addBox(px - 9, pz - 6, px + 9, pz + 6, CURB_H + 0.2, 'pond');
    this.footprints.push({ x0: px - 9, z0: pz - 6, x1: px + 9, z1: pz + 6, h: 0, kind: 'pool' });
    // trees, palms, benches
    for (let k = 0; k < 40; k++) {
      const x = rng.range(lot.x0 + 3, lot.x1 - 3), z = rng.range(lot.z0 + 3, lot.z1 - 3);
      if (Math.abs(x - cx) < 5 || Math.abs(z - cz) < 5) continue;
      if (this.collision.blockedCircle(x, z, 3)) continue;
      if (rng.chance(0.65)) this.props.trees.push({ x, z, y: CURB_H, s: rng.range(0.8, 1.4) });
      else this.addPalm(x, z, CURB_H, rng.range(0.8, 1.2));
    }
    for (let t = -30; t <= 30; t += 12) {
      if (Math.abs(t) < 8) continue;
      this.props.benches.push({ x: cx + 4, z: cz + t, y: CURB_H, rot: -Math.PI / 2 });
      this.props.benches.push({ x: cx + t, z: cz - 4, y: CURB_H, rot: 0 });
    }
    this.pois.push({ type: 'park', x: cx - 15, z: cz - 15 });
    void blk;
  }

  buildPlaza(lot, blk) {
    const rng = this.rng;
    const cx = (lot.x0 + lot.x1) / 2, cz = (lot.z0 + lot.z1) / 2;
    // landmark tower on the north half; plaza with fountain and palms on the south
    this.building(lot.x0 + 6, lot.z0 + 2, lot.x1 - 6, cz - 12, CURB_H + 4.85 + 3.6 * 2, 'officeDark', { shop: true, rooftop: false });
    const tx0 = cx - 15, tx1 = cx + 15, tz0 = lot.z0 + 6, tz1 = cz - 16;
    let base = CURB_H + 4.85 + 7.2;
    const tiers = [[0, 95], [3, 150], [6, 205]];
    for (const [inset, top] of tiers) {
      this.towerSection(tx0 + inset, tz0 + inset * 0.6, tx1 - inset, tz1 - inset * 0.6, base, top, 'glassTeal');
      base = top;
    }
    this.b('trim', cx, (tz0 + tz1) / 2).box(cx - 2, base, (tz0 + tz1) / 2 - 2, cx + 2, base + 8, (tz0 + tz1) / 2 + 2, { top: true });
    this.b('darkmetal', cx, (tz0 + tz1) / 2).box(cx - 0.3, base + 8, (tz0 + tz1) / 2 - 0.3, cx + 0.3, base + 34, (tz0 + tz1) / 2 + 0.3);
    this.props.glows.push({ x: cx, y: base + 34, z: (tz0 + tz1) / 2, beacon: true });
    this.neonStrip(tx0 + 6, tz0 + 3.6, tx1 - 6, tz1 - 3.6, 204, 'neonCyan');
    // plaza
    this.b('trim', cx, cz + 18).cylinder(cx, cz + 18, 7, CURB_H, CURB_H + 0.6, 28);
    this.b('pool', cx, cz + 18).cylinder(cx, cz + 18, 6.4, CURB_H, CURB_H + 0.62, 28);
    this.collision.addCircle(cx, cz + 18, 7);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      this.addPalm(cx + Math.cos(a) * 16, cz + 18 + Math.sin(a) * 12, CURB_H, rng.range(1, 1.25));
    }
    for (let k = -2; k <= 2; k++) this.props.benches.push({ x: cx + k * 6, z: lot.z1 - 3, y: CURB_H, rot: Math.PI });
    this.pois.push({ type: 'plaza', x: cx, z: cz + 30 });
    void blk;
  }

  buildGasStation(lot, blk) {
    const cx = (lot.x0 + lot.x1) / 2, cz = (lot.z0 + lot.z1) / 2;
    // canopy
    const c = { x0: cx - 14, z0: cz - 9, x1: cx + 14, z1: cz + 9 };
    for (const [px, pz] of [[c.x0 + 2, c.z0 + 2], [c.x1 - 2, c.z0 + 2], [c.x0 + 2, c.z1 - 2], [c.x1 - 2, c.z1 - 2]]) {
      this.b('trim', px, pz).box(px - 0.35, CURB_H, pz - 0.35, px + 0.35, CURB_H + 5.2, pz + 0.35);
      this.collision.addCircle(px, pz, 0.4);
    }
    this.b('awningRed', cx, cz).box(c.x0, CURB_H + 5.2, c.z0, c.x1, CURB_H + 6.2, c.z1, { top: true });
    this.b('canopyLight', cx, cz).quad([c.x0, CURB_H + 5.19, c.z0], [c.x1, CURB_H + 5.19, c.z0], [c.x1, CURB_H + 5.19, c.z1], [c.x0, CURB_H + 5.19, c.z1]);
    this.b('stripe', cx, cz).box(c.x0 - 0.02, CURB_H + 5.55, c.z0 - 0.02, c.x1 + 0.02, CURB_H + 5.8, c.z1 + 0.02);
    // pumps
    for (const dz of [-4, 4]) for (const dx of [-7, 0, 7]) {
      const x = cx + dx, z = cz + dz;
      this.b('trim', x, z).box(x - 0.5, CURB_H, z - 0.3, x + 0.5, CURB_H + 1.9, z + 0.3, { top: true });
      this.b('awningRed', x, z).box(x - 0.52, CURB_H + 1.5, z - 0.32, x + 0.52, CURB_H + 1.9, z + 0.32);
      this.b('curb', x, z).box(x - 1.2, CURB_H, z - 0.6, x + 1.2, CURB_H + 0.25, z + 0.6, { top: true });
      this.collision.addBox(x - 0.6, z - 0.4, x + 0.6, z + 0.4, CURB_H + 1.9, 'pump');
    }
    this.footprints.push({ ...c, h: 6, kind: 'canopy' });
    // convenience store
    this.building(lot.x0 + 4, lot.z1 - 16, lot.x0 + 30, lot.z1 - 2, CURB_H + 4.6, 'decoWhite', { shop: true, rooftop: false, kind: 'shop' });
    this.neonSign(lot.x0 + 17, CURB_H + 5.6, lot.z1 - 16.1, 8, 2, 'nz', 31);
    // price sign pylon
    const sx = lot.x1 - 3, sz = lot.z0 + 3;
    this.b('darkmetal', sx, sz).box(sx - 0.3, CURB_H, sz - 0.3, sx + 0.3, CURB_H + 7, sz + 0.3);
    this.neonSign(sx, CURB_H + 7.5, sz, 4, 1.5, 'nz', 31);
    this.neonSign(sx, CURB_H + 7.5, sz, 4, 1.5, 'px', 23);
    this.collision.addCircle(sx, sz, 0.4);
    this.props.glows.push({ x: cx, y: CURB_H, z: cz, ground: true, color: 0xfff1d0, radius: 16 });
    this.pois.push({ type: 'gas', x: cx, z: cz });
    void blk;
  }

  buildParking(lot, blk) {
    const rng = this.rng;
    for (let z = lot.z0 + 4; z < lot.z1 - 4; z += 20) {
      for (let x = lot.x0 + 2.6; x < lot.x1 - 3; x += 2.6) {
        if (rng.chance(0.55)) this.props.cars.push({ x: x + 1.3, z: z + 2.6, y: CURB_H, rot: 0 });
        if (rng.chance(0.55)) this.props.cars.push({ x: x + 1.3, z: z + 17.4, y: CURB_H, rot: Math.PI });
      }
    }
    for (let x = lot.x0 + 10; x < lot.x1; x += 22) for (let z = lot.z0 + 10; z < lot.z1; z += 20) this.props.lamps.push({ x, z, y: CURB_H, rot: rng.range(0, 6), parking: true });
    this.pois.push({ type: 'parking', x: (lot.x0 + lot.x1) / 2, z: (lot.z0 + lot.z1) / 2 });
    void blk;
  }

  // ---------------------------------------------------------------- street furniture
  buildStreetFurniture() {
    const rng = this.rng;
    // Streetlights and palms along every road, on both sidewalks.
    for (let k = 0; k < LINES.length; k++) {
      const x = LINES[k], hw = xWidths[k] / 2;
      for (let j = 0; j < LINES.length - 1; j++) {
        const z0 = LINES[j] + zWidths[j] / 2 + 6, z1 = LINES[j + 1] - zWidths[j + 1] / 2 - 6;
        for (let z = z0; z <= z1; z += 32) {
          if (k > 0) this.props.lamps.push({ x: x - hw - 0.8, z, y: CURB_H, facing: [1, 0] });
          if (k < 8 || true) this.props.lamps.push({ x: x + hw + 0.8, z: z + 16 < z1 ? z + 16 : z, y: CURB_H, facing: [-1, 0] });
        }
        const palmy = k === 8 || k === 6 || k === 7 || k === 4;
        for (let z = z0 + 8; z < z1 - 2; z += palmy ? 12 : 24) {
          if (k > 0) this.addPalm(x - hw - 1.6, z, CURB_H, rng.range(0.95, 1.2));
          this.addPalm(x + hw + 1.6, z + 6, CURB_H, rng.range(0.95, 1.2));
        }
        for (let z = z0 + 3; z < z1; z += 40) {
          if (rng.chance(0.5)) this.props.benches.push({ x: x + hw + 2.6, z, y: CURB_H, rot: -Math.PI / 2 });
          if (rng.chance(0.6)) this.props.bins.push({ x: x - hw - 0.9, z: z + 5, y: CURB_H });
          if (rng.chance(0.4)) this.props.hydrants.push({ x: x + hw + 0.7, z: z + 11, y: CURB_H });
        }
        // parallel parked cars on some streets
        if (k !== 8 && k !== 0) {
          for (let z = z0 + 4; z < z1 - 4; z += 7) {
            if (rng.chance(0.18)) this.props.cars.push({ x: x - hw + 1.2, z, y: 0, rot: Math.PI, street: true });
            if (rng.chance(0.18)) this.props.cars.push({ x: x + hw - 1.2, z: z + 3, y: 0, rot: 0, street: true });
          }
        }
      }
    }
    for (let k = 0; k < LINES.length; k++) {
      const z = LINES[k], hw = zWidths[k] / 2;
      for (let i = 0; i < LINES.length - 1; i++) {
        const x0 = LINES[i] + xWidths[i] / 2 + 6, x1 = LINES[i + 1] - xWidths[i + 1] / 2 - 6;
        for (let x = x0; x <= x1; x += 32) {
          if (k > 0) this.props.lamps.push({ x, z: z - hw - 0.8, y: CURB_H, facing: [0, 1] });
          if (k < 8) this.props.lamps.push({ x: x + 16 < x1 ? x + 16 : x, z: z + hw + 0.8, y: CURB_H, facing: [0, -1] });
        }
        if (z !== 0) {
          for (let x = x0 + 8; x < x1 - 2; x += 24) {
            if (k > 0) this.addPalm(x, z - hw - 1.6, CURB_H, rng.range(0.95, 1.2));
            if (k < 8) this.addPalm(x + 6, z + hw + 1.6, CURB_H, rng.range(0.95, 1.2));
          }
          for (let x = x0 + 4; x < x1 - 4; x += 7) {
            if (rng.chance(0.15)) this.props.cars.push({ x, z: z - hw + 1.2, y: 0, rot: -Math.PI / 2, street: true });
            if (rng.chance(0.15)) this.props.cars.push({ x: x + 3, z: z + hw - 1.2, y: 0, rot: Math.PI / 2, street: true });
          }
        } else {
          for (let x = x0 + 4; x < x1 - 4; x += 12) {
            this.addPalm(x, -hw - 1.6, CURB_H, rng.range(1, 1.25));
            this.addPalm(x + 6, hw + 1.6, CURB_H, rng.range(1, 1.25));
          }
        }
        for (let x = x0 + 3; x < x1; x += 40) {
          if (k > 0 && rng.chance(0.5)) this.props.benches.push({ x, z: z - hw - 2.6, y: CURB_H, rot: 0 });
          if (k < 8 && rng.chance(0.6)) this.props.bins.push({ x: x + 5, z: z + hw + 0.9, y: CURB_H });
        }
      }
    }
    // bus stops on the main avenues (shelter faces the road)
    const busLines = [{ ori: 'x', k: 4 }, { ori: 'x', k: 6 }, { ori: 'z', k: 4 }, { ori: 'z', k: 2 }, { ori: 'z', k: 6 }];
    this.props.busStops = [];
    for (const bl of busLines) {
      const L = LINES[bl.k];
      const hw = (bl.ori === 'x' ? xWidths[bl.k] : zWidths[bl.k]) / 2;
      for (let s = -340; s <= 340; s += 170) {
        for (const side of [-1, 1]) {
          const along = s + side * 40 + 25;
          const off = L + side * (hw + 2.6);
          const x = bl.ori === 'x' ? off : along, z = bl.ori === 'x' ? along : off;
          if (this.collision.blockedCircle(x, z, 2.2)) continue;
          const rot = bl.ori === 'x' ? (side > 0 ? -Math.PI / 2 : Math.PI / 2) : (side > 0 ? Math.PI : 0);
          this.props.busStops.push({ x, z, y: CURB_H, rot });
          const ex = bl.ori === 'x' ? 0.9 : 2.2, ez = bl.ori === 'x' ? 2.2 : 0.9;
          this.collision.addBox(x - ex, z - ez, x + ex, z + ez, CURB_H + 2.6, 'busstop');
        }
      }
    }
    // Ocean Drive promenade lamps facing the beach side as well
    for (let z = -400; z <= 400; z += 24) this.props.lamps.push({ x: BEACH.promenadeEnd - 0.6, z: z + 12, y: CURB_H, facing: [-1, 0] });
  }

  buildBoundaries() {
    // invisible limits + a ring of trees and green hills to frame the edge
    this.collision.addBox(-2000, -2000, BOUNDS.minX, 2000, 999, 'bound');
    this.collision.addBox(-2000, -2000, 2000, BOUNDS.minZ, 999, 'bound');
    this.collision.addBox(-2000, BOUNDS.maxZ, 2000, 2000, 999, 'bound');
    this.collision.addBox(BOUNDS.maxX, -2000, 2000, 2000, 999, 'bound');
    const rng = this.rng;
    for (let i = 0; i < 260; i++) {
      const side = i % 3;
      let x, z;
      if (side === 0) { x = rng.range(-470, -412); z = rng.range(-470, 470); }
      else if (side === 1) { x = rng.range(-470, 405); z = rng.range(-470, -412); }
      else { x = rng.range(-470, 405); z = rng.range(412, 470); }
      if (rng.chance(0.6)) this.props.trees.push({ x, z, y: CURB_H, s: rng.range(1, 1.7) });
      else this.addPalm(x, z, CURB_H, rng.range(0.9, 1.3));
    }
    // distant hills
    const hillMat = new THREE.MeshStandardMaterial({ color: 0x4e6b3e, roughness: 1, flatShading: true });
    const hillGeo = new THREE.IcosahedronGeometry(1, 2);
    const pos = hillGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      pos.setXYZ(i, pos.getX(i) * (1 + Math.sin(i * 1.7) * 0.08), Math.max(-0.2, y), pos.getZ(i) * (1 + Math.cos(i * 2.3) * 0.08));
    }
    hillGeo.computeVertexNormals();
    const hills = new THREE.InstancedMesh(hillGeo, hillMat, 40);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 1.5 + Math.PI * 0.25 + rng.range(-0.04, 0.04); // west, north and south arcs
      const r = rng.range(760, 950);
      p.set(Math.cos(a + Math.PI / 2) * r - 150, 0, Math.sin(a + Math.PI / 2) * r);
      if (p.x > 250 || Math.hypot(p.x, p.z) < 700) { hills.setMatrixAt(i, m.makeScale(0, 0, 0)); continue; }
      s.set(rng.range(120, 220), rng.range(35, 85), rng.range(120, 220));
      q.setFromEuler(new THREE.Euler(0, rng.range(0, 6), 0));
      hills.setMatrixAt(i, m.compose(p, q, s));
    }
    hills.receiveShadow = false;
    this.group.add(hills);
  }

  addPalm(x, z, y, s = 1) {
    this.props.palms.push({ x, z, y, s, rot: this.rng.range(0, Math.PI * 2), v: this.rng.int(0, 2) });
    this.collision.addCircle(x, z, 0.35);
  }

  // ---------------------------------------------------------------- output
  flush() {
    for (const g of this.buckets.values()) {
      if (g.vertexCount === 0) continue;
      const mesh = new THREE.Mesh(g.build(), this.mat(g.matKey));
      const k = g.matKey;
      const noShadow = ['road14', 'road16', 'blvd', 'inter', 'sidewalk', 'grass', 'sand', 'plaza', 'parking', 'lot', 'yard', 'pool', 'pond', 'neon', 'canopyLight'].includes(k) || k.startsWith('neon');
      mesh.castShadow = !noShadow;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.userData.chunk = g.chunk;
      this.group.add(mesh);
      this.chunkMeshes.push(mesh);
    }
    this.buckets.clear();
  }

  buildInstances() {
    const A = this.assets || {};
    const dummy = new THREE.Object3D();
    const addInst = (baked, list, place, { castShadow = true, color = null } = {}) => {
      if (!baked || !list.length) return null;
      const im = new THREE.InstancedMesh(baked.geometry, baked.materials.length > 1 ? baked.materials : baked.materials[0], list.length);
      list.forEach((it, i) => {
        place(dummy, it);
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
        if (color) im.setColorAt(i, new THREE.Color(color(it)));
      });
      im.castShadow = castShadow;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      this.group.add(im);
      return im;
    };

    // ---- palms (CC0 Quaternius models near, cheap procedural palm far)
    this.instancer = new PropInstancer(this.group);
    const palmModels = [A.palm2, A.palm3].map((g) => bakeStatic(g, { size: 9.5 })).filter(Boolean);
    for (const m of palmModels) for (const mat of m.materials) { mat.roughness = 0.85; mat.metalness = 0; mat.side = THREE.DoubleSide; }
    const palmLow = proceduralPalm();
    const palmsByVar = [[], []];
    for (const p of this.props.palms) palmsByVar[palmModels.length ? p.v % palmModels.length : 0].push(p);
    const palmPlace = (d, it) => { d.position.set(it.x, it.y, it.z); d.rotation.set(0, it.rot, 0); d.scale.setScalar(it.s); };
    const palmDepth = addWind([...palmModels.flatMap((m) => m.materials), ...palmLow.materials], { height: 9.5, amp: 0.45, freq: 1.1 });
    palmsByVar.forEach((list, v) => {
      this.instancer.add({ near: palmModels[v] || palmLow, far: palmModels[v] ? palmLow : null, items: list, place: palmPlace, nearDist: 70, farDist: 900, depthMaterial: palmDepth });
    });

    // ---- broadleaf trees (procedural)
    const tree = proceduralTree();
    const treePlace = (d, it) => { d.position.set(it.x, it.y, it.z); d.rotation.set(0, it.x * 7.1, 0); d.scale.setScalar(it.s); };
    const treeColor = (it) => new THREE.Color().setHSL(0.27 + ((it.x * 13.7) % 0.06), 0.45, 0.28 + ((it.z * 7.3) % 0.08));
    this.instancer.add({ near: tree.trunk, items: this.props.trees, place: treePlace, nearDist: 200, farDist: 700 });
    const treeDepth = addWind(tree.crown.materials, { height: 6, amp: 0.22, freq: 1.4 });
    this.instancer.add({ near: tree.crown, far: tree.crownLow, items: this.props.trees, place: treePlace, color: treeColor, nearDist: 90, farDist: 900, depthMaterial: treeDepth });
    for (const t of this.props.trees) this.collision.addCircle(t.x, t.z, 0.4 * t.s);

    // ---- bushes
    const bush = bakeStatic(A.bush, { size: 1.6 }) || { geometry: new THREE.IcosahedronGeometry(1, 1).translate(0, 0.8, 0), materials: [new THREE.MeshStandardMaterial({ color: 0x3d6b2e })] };
    const bushDepth = addWind(bush.materials, { height: 1.6, amp: 0.06, freq: 1.8 });
    const bushMesh = addInst(bush, this.props.bushes, (d, it) => { d.position.set(it.x, it.y, it.z); d.rotation.set(0, it.rot, 0); d.scale.setScalar(it.s); });
    if (bushMesh) bushMesh.customDepthMaterial = bushDepth;

    // ---- streetlights
    const lampModel = bakeStatic(A.streetlight, { size: 7.5, centerXZ: false });
    let armAngle = 0;
    let headOffset = new THREE.Vector3(0, 7.2, 1.6);
    if (lampModel) {
      // find the lamp head ("Light"/"Glass" material group) to know which way the arm points
      const g = lampModel.geometry;
      const idx = lampModel.materials.findIndex((m) => /light|glass/i.test(m.name));
      if (idx >= 0) {
        const grp = g.groups.find((gr) => gr.materialIndex === idx);
        const pos = g.attributes.position;
        const c = new THREE.Vector3();
        for (let i = grp.start; i < grp.start + grp.count; i++) c.add(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
        c.divideScalar(grp.count);
        headOffset = c;
        armAngle = Math.atan2(c.x, c.z);
        const lm = lampModel.materials[idx];
        lm.emissive = new THREE.Color(0xffe2b0);
        lm.emissiveIntensity = 0;
        this.nightMaterials.lamps.push(lm);
      }
      for (const m of lampModel.materials) { m.metalness = Math.min(m.metalness ?? 0, 0.5); }
    }
    const lampProc = proceduralLamp(this.nightMaterials.lamps);
    if (!lampModel) { headOffset.set(0, 7.15, 1.7); armAngle = 0; }
    for (const L of this.props.lamps) {
      const f = L.facing || [Math.sin(L.rot || 0), Math.cos(L.rot || 0)];
      L.rotY = Math.atan2(f[0], f[1]) - armAngle;
      const hx = Math.sin(L.rotY) * Math.hypot(headOffset.x, headOffset.z), hz = Math.cos(L.rotY) * Math.hypot(headOffset.x, headOffset.z);
      // rotated head position (rotation about y of headOffset)
      const c = Math.cos(L.rotY), s = Math.sin(L.rotY);
      const rx = headOffset.x * c + headOffset.z * s, rz = -headOffset.x * s + headOffset.z * c;
      L.head = { x: L.x + rx, y: L.y + headOffset.y, z: L.z + rz };
      void hx; void hz;
      this.collision.addCircle(L.x, L.z, 0.2);
      this.props.glows.push({ x: L.head.x, y: 0.03 + (L.y === 0 ? 0 : CURB_H), z: L.head.z, ground: true, color: 0xffd9a0, radius: 9 });
    }
    this.instancer.add({
      near: lampModel || lampProc, far: lampModel ? lampProc : null, items: this.props.lamps, nearDist: 35, farDist: 700,
      place: (d, it) => { d.position.set(it.x, it.y, it.z); d.rotation.set(0, it.rotY, 0); d.scale.setScalar(1); },
      placeFar: (d, it) => { d.position.set(it.x, it.y, it.z); d.rotation.set(0, it.rotY + armAngle, 0); d.scale.setScalar(1); },
    });

    // ---- benches, bins, hydrants (procedural, shared geometry)
    const benchGeo = mergeBoxes([[-0.9, 0.42, -0.25, 0.9, 0.5, 0.25], [-0.9, 0.5, 0.2, 0.9, 0.95, 0.28], [-0.85, 0, -0.2, -0.75, 0.42, 0.2], [0.75, 0, -0.2, 0.85, 0.42, 0.2]]);
    addInst({ geometry: benchGeo, materials: [this.mat('wood')] }, this.props.benches, (d, it) => { d.position.set(it.x, it.y, it.z); d.rotation.set(0, it.rot, 0); d.scale.setScalar(1); });
    for (const b of this.props.benches) {
      const alongX = Math.abs(Math.cos(b.rot)) > 0.5; // bench length runs along local x
      const ex = alongX ? 0.9 : 0.3, ez = alongX ? 0.3 : 0.9;
      this.collision.addBox(b.x - ex, b.z - ez, b.x + ex, b.z + ez, b.y + 0.5, 'bench');
    }
    const binGeo = new THREE.CylinderGeometry(0.3, 0.26, 0.95, 10).translate(0, 0.475, 0);
    addInst({ geometry: binGeo, materials: [this.mat('darkmetal')] }, this.props.bins, (d, it) => { d.position.set(it.x, it.y, it.z); d.rotation.set(0, 0, 0); d.scale.setScalar(1); });
    for (const b of this.props.bins) this.collision.addCircle(b.x, b.z, 0.32);
    const hydGeo = mergeGeometriesSafe([new THREE.CylinderGeometry(0.15, 0.18, 0.7, 10).translate(0, 0.35, 0), new THREE.SphereGeometry(0.16, 10, 6).translate(0, 0.7, 0), new THREE.CylinderGeometry(0.07, 0.07, 0.45, 8).rotateZ(Math.PI / 2).translate(0, 0.45, 0)]);
    addInst({ geometry: hydGeo, materials: [new THREE.MeshStandardMaterial({ color: 0xc4302b, roughness: 0.5 })] }, this.props.hydrants, (d, it) => { d.position.set(it.x, it.y, it.z); d.rotation.set(0, 0, 0); d.scale.setScalar(1); });
    for (const h of this.props.hydrants) this.collision.addCircle(h.x, h.z, 0.2);

    // ---- beach umbrellas + loungers
    const umbGeo = mergeGeometriesSafe([new THREE.ConeGeometry(1.8, 0.7, 12, 1, true).translate(0, 2.45, 0)]);
    const poleGeo = new THREE.CylinderGeometry(0.04, 0.04, 2.5, 6).translate(0, 1.25, 0);
    addInst({ geometry: poleGeo, materials: [this.mat('trim')] }, this.props.umbrellas, (d, it) => { d.position.set(it.x, it.y, it.z); d.rotation.set(0, 0, 0.05); d.scale.setScalar(1); });
    addInst({ geometry: umbGeo, materials: [new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide })] }, this.props.umbrellas, (d, it) => { d.position.set(it.x, it.y, it.z); d.rotation.set(0, it.rot, 0.05); d.scale.setScalar(1); }, { color: (it) => it.color });
    for (const u of this.props.umbrellas) this.collision.addCircle(u.x, u.z, 0.15);
    const loungerGeo = mergeBoxes([[-0.35, 0.3, -0.95, 0.35, 0.38, 0.6], [-0.35, 0.35, 0.55, 0.35, 0.95, 0.68], [-0.32, 0, -0.9, -0.26, 0.3, 0.6], [0.26, 0, -0.9, 0.32, 0.3, 0.6]]);
    addInst({ geometry: loungerGeo, materials: [new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.7 })] }, this.props.loungers, (d, it) => { d.position.set(it.x, it.y, it.z); d.rotation.set(0, it.rot, 0); d.scale.setScalar(1); });

    // ---- bus stop shelters: frame + glass + illuminated ad panel
    if (this.props.busStops.length) {
      const frame = mergeBoxes([[-2.1, 2.4, -0.9, 2.1, 2.55, 0.9], [-2.05, 0, -0.75, -1.95, 2.4, -0.65], [1.95, 0, -0.75, 2.05, 2.4, -0.65], [-1.6, 0.45, -0.55, 1.6, 0.52, -0.1]]);
      const glass = mergeBoxes([[-1.95, 0.3, -0.76, 1.95, 2.35, -0.72]]);
      const ad = mergeBoxes([[2.0, 0.3, -0.7, 2.06, 2.3, 0.6]]);
      const place = (d, it) => { d.position.set(it.x, it.y, it.z); d.rotation.set(0, it.rot, 0); d.scale.setScalar(1); };
      addInst({ geometry: frame, materials: [this.mat('trimDark')] }, this.props.busStops, place);
      addInst({ geometry: glass, materials: [new THREE.MeshPhysicalMaterial({ color: 0x9fc6d6, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.1 })] }, this.props.busStops, place, { castShadow: false });
      addInst({ geometry: ad, materials: [this.mat('billboard')] }, this.props.busStops, place, { castShadow: false });
    }

    // ---- shipping containers
    const contGeo = new THREE.BoxGeometry(6.1, 2.6, 2.5).translate(0, 1.3, 0);
    const contMat = new THREE.MeshStandardMaterial({ map: T.containerTexture(), roughness: 0.6, metalness: 0.3 });
    addInst({ geometry: contGeo, materials: [contMat] }, this.props.containers, (d, it) => { d.position.set(it.x, it.y, it.z); d.rotation.set(0, it.rot, 0); d.scale.setScalar(1); }, { color: (it) => it.color });

    // ---- parked cars (CC0 Kenney car kit), scaled to real-world width
    const carKeys = ['sedan', 'suv', 'taxi', 'sports', 'van', 'hatch', 'sedan', 'suv'];
    const carModels = {};
    for (const k of new Set(carKeys)) {
      const baked = bakeStatic(A[k], { size: 1.95, axis: 'x' });
      if (baked) {
        baked.materials = baked.materials.map((m) => carPaint(m));
        carModels[k] = baked;
      }
    }
    const carLists = {};
    this.props.cars.forEach((c, i) => {
      if (this.collision.blockedCircle(c.x, c.z, 1.2, ['building', 'house', 'garage', 'pool', 'warehouse'])) return;
      const k = carKeys[i % carKeys.length];
      if (!carModels[k]) return;
      (carLists[k] = carLists[k] || []).push(c);
      const hl = carModels[k].size.z / 2, hw = carModels[k].size.x / 2;
      const along = Math.abs(Math.sin(c.rot)) > 0.5; // rotated 90 degrees: long axis on x
      const ex = along ? hl : hw, ez = along ? hw : hl;
      this.collision.addBox(c.x - ex, c.z - ez, c.x + ex, c.z + ez, c.y + 1.6, 'car');
      this.footprints.push({ x0: c.x - ex, z0: c.z - ez, x1: c.x + ex, z1: c.z + ez, h: 1.5, kind: 'car' });
    });
    for (const [k, list] of Object.entries(carLists)) {
      this.instancer.add({ near: carModels[k], far: carProxy(carModels[k]), items: list, nearDist: 60, farDist: 600, place: (d, it) => { d.position.set(it.x, it.y, it.z); d.rotation.set(0, it.rot, 0); d.scale.setScalar(1); } });
    }
    this.carModels = carModels;
  }
}

// ---------------------------------------------------------------- procedural fallbacks
function mergeBoxes(list) {
  const geos = list.map(([x0, y0, z0, x1, y1, z1]) => new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
  return mergeGeometriesSafe(geos);
}

function mergeGeometriesSafe(geos) {
  const nonIdx = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of nonIdx) for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  let count = 0;
  for (const g of nonIdx) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), uv = new Float32Array(count * 2);
  let o = 0;
  for (const g of nonIdx) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}

function proceduralTree() {
  const trunk = new THREE.CylinderGeometry(0.16, 0.26, 3.2, 7).translate(0, 1.6, 0);
  const blobs = [];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.IcosahedronGeometry(1.6 - i * 0.12, 1);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const n = 1 + Math.sin(k * 12.9898 + i) * 0.12;
      p.setXYZ(k, p.getX(k) * n, p.getY(k) * n * 0.85, p.getZ(k) * n);
    }
    g.translate(Math.cos(i * 2.1) * 1.1 * (i ? 1 : 0), 3.9 + (i ? 0.4 : 0.9), Math.sin(i * 2.1) * 1.1 * (i ? 1 : 0));
    g.computeVertexNormals();
    blobs.push(g);
  }
  const low = new THREE.IcosahedronGeometry(1.9, 0).scale(1, 0.85, 1).translate(0, 4.3, 0);
  const crownMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true });
  return {
    crownLow: { geometry: mergeGeometriesSafe([low]), materials: [crownMat] },
    trunk: { geometry: trunk, materials: [new THREE.MeshStandardMaterial({ color: 0x5b4532, roughness: 1 })] },
    crown: { geometry: mergeGeometriesSafe(blobs), materials: [crownMat] },
  };
}

function proceduralPalm() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.18, 0.3, 9, 8, 6).translate(0, 4.5, 0);
  const p = trunk.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) + (y / 9) ** 2 * 0.8); }
  trunk.computeVertexNormals();
  parts.push(trunk);
  const frond = [];
  for (let i = 0; i < 9; i++) {
    const g = new THREE.PlaneGeometry(0.9, 4, 1, 4).translate(0, 2, 0).rotateX(-Math.PI / 2 + 0.5).rotateY((i / 9) * Math.PI * 2).translate(0.8, 9, 0);
    const pp = g.attributes.position;
    for (let k = 0; k < pp.count; k++) { const r = Math.hypot(pp.getX(k) - 0.8, pp.getZ(k)); pp.setY(k, pp.getY(k) - r * r * 0.12); }
    g.computeVertexNormals();
    frond.push(g);
  }
  const trunkM = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 1 });
  const leafM = new THREE.MeshStandardMaterial({ color: 0x3f7a35, roughness: 0.9, side: THREE.DoubleSide });
  const t = mergeGeometriesSafe(parts), f = mergeGeometriesSafe(frond);
  const geo = mergeGeometriesSafe([t, f]);
  geo.addGroup(0, t.attributes.position.count, 0);
  geo.addGroup(t.attributes.position.count, f.attributes.position.count, 1);
  return { geometry: geo, materials: [trunkM, leafM] };
}

function proceduralLamp(lampList) {
  const pole = mergeGeometriesSafe([
    new THREE.CylinderGeometry(0.07, 0.12, 7.4, 8).translate(0, 3.7, 0),
    new THREE.CylinderGeometry(0.2, 0.22, 0.6, 8).translate(0, 0.3, 0),
    mergeBoxes([[-0.05, 7.22, 0, 0.05, 7.34, 1.75]]),
  ]);
  const head = new THREE.BoxGeometry(0.4, 0.15, 0.7).translate(0, 7.15, 1.7).toNonIndexed();
  const geo = mergeGeometriesSafe([pole, head]);
  geo.addGroup(0, pole.attributes.position.count, 0);
  geo.addGroup(pole.attributes.position.count, head.attributes.position.count, 1);
  const lm = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe2b0, emissiveIntensity: 0 });
  lampList.push(lm);
  return { geometry: geo, materials: [new THREE.MeshStandardMaterial({ color: 0x3a3d42, metalness: 0.6, roughness: 0.5 }), lm] };
}

// Far-distance stand-in for a parked car: body + cabin boxes in a neutral paint.
const proxyCache = new Map();
function carProxy(model) {
  if (proxyCache.has(model)) return proxyCache.get(model);
  const { x: w, y: h, z: l } = model.size;
  const geo = mergeBoxes([[-w / 2, 0.25, -l / 2, w / 2, h * 0.55, l / 2], [-w * 0.42, h * 0.55, -l * 0.25, w * 0.42, h * 0.92, l * 0.2]]);
  const out = { geometry: geo, materials: [new THREE.MeshStandardMaterial({ color: 0x8b95a1, roughness: 0.5, metalness: 0.3 })] };
  proxyCache.set(model, out);
  return out;
}
