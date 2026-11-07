/**
 * Builds the 3D district from MapData: terrain, procedural buildings (merged), instanced
 * facade details and props, district dressing, and the static Rapier colliders.
 */
import type RAPIER_NS from '@dimforge/rapier3d-compat';
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type Material,
} from 'three';
import { CELL, Cell, type MapData } from '../levels/types.ts';
import { groundHeight } from '../levels/generator.ts';
import { WATER_LEVEL } from '../levels/districts.ts';
import { GeoBuilder, shade } from '../render/geo.ts';
import { PAL, signTexture } from '../render/textures.ts';
import { materials } from '../render/materials.ts';
import * as M from './models.ts';
import { GROUPS } from '../physics/groups.ts';
import { Rng } from '../levels/rng.ts';

type R = typeof RAPIER_NS;

export const FLOOR_H = 3.1;

export interface CityInfo {
  group: Group;
  lamps: Vector3[];
  plazas: { x: number; z: number; r: number }[];
  puddles: { x: number; z: number; r: number }[];
  boats: { mesh: InstancedMesh; base: Matrix4[] } | null;
  parked: { x: number; z: number; heading: number }[];
  carHandles: number[];
  drawCallsEstimate: number;
}

const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3(1, 1, 1);
const UP = new Vector3(0, 1, 0);

class InstanceList {
  mats: Matrix4[] = [];
  colors: number[] = [];
  push(x: number, y: number, z: number, rotY: number, sx = 1, sy = 1, sz = 1, color?: number) {
    _q.setFromAxisAngle(UP, rotY);
    _p.set(x, y, z);
    _s.set(sx, sy, sz);
    this.mats.push(new Matrix4().compose(_p, _q, _s));
    if (color !== undefined) this.colors.push(color);
  }
  build(geo: BufferGeometry, mat: Material, cast = true, receive = true): InstancedMesh | null {
    if (!this.mats.length) return null;
    const im = new InstancedMesh(geo, mat, this.mats.length);
    this.mats.forEach((m, i) => im.setMatrixAt(i, m));
    if (this.colors.length === this.mats.length) {
      const c = new Color();
      this.colors.forEach((h, i) => im.setColorAt(i, c.setHex(h)));
    }
    im.castShadow = cast;
    im.receiveShadow = receive;
    im.computeBoundingSphere();
    return im;
  }
}

export function buildCity(map: MapData, rapier: R | null, world: RAPIER_NS.World | null, lowDetail: boolean): CityInfo {
  const mats = materials();
  const group = new Group();
  group.name = 'city';
  const rng = new Rng(map.seed ^ 0x5eed);
  const { cols, rows, cells } = map;
  const W = cols * CELL;
  const D = rows * CELL;
  const gh = (x: number, z: number) => groundHeight(map, x, z);
  const typeAt = (x: number, z: number) => {
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    if (cx < 0 || cz < 0 || cx >= cols || cz >= rows) return -1;
    return cells[cz * cols + cx];
  };
  let drawCalls = 0;
  const add = (o: Mesh | InstancedMesh | null) => {
    if (!o) return;
    group.add(o);
    drawCalls++;
  };

  // ---------- terrain ----------
  const district = map.district;
  const roadTile = district === 'porto' ? 2 : 0;
  const roadColor = district === 'porto' ? PAL.asphalt : district === 'collina' ? 0xc9b49a : PAL.cobble;
  const tileOf = (t: number): [number, number] => {
    switch (t) {
      case Cell.ROAD:
        return [roadTile, roadColor];
      case Cell.SIDEWALK:
        return [1, PAL.slab];
      case Cell.PLAZA:
        return [1, PAL.plaza];
      case Cell.QUAY:
        return [1, PAL.quay];
      case Cell.GARDEN:
        return [3, PAL.garden];
      case Cell.STAIRS:
        return [1, 0xd9cdb6];
      case Cell.WATER:
        return [1, 0x3f8c86];
      default:
        return [1, 0xcfc2ad];
    }
  };
  {
    const n = (map.hw - 1) * (map.hh - 1);
    const pos = new Float32Array(n * 18);
    const nor = new Float32Array(n * 18);
    const col = new Float32Array(n * 18);
    const uv = new Float32Array(n * 12);
    const c = new Color();
    const a = new Vector3();
    const b = new Vector3();
    const d = new Vector3();
    const e = new Vector3();
    let k = 0;
    const H = map.heights;
    for (let j = 0; j < map.hh - 1; j++)
      for (let i = 0; i < map.hw - 1; i++) {
        const t = typeAt(i + 0.5, j + 0.5);
        // alleys use cobbles in every district
        const [tile, color] = tileOf(t);
        const v = 0.94 + rng.next() * 0.1;
        c.setHex(color).multiplyScalar(v);
        const h00 = H[j * map.hw + i];
        const h10 = H[j * map.hw + i + 1];
        const h01 = H[(j + 1) * map.hw + i];
        const h11 = H[(j + 1) * map.hw + i + 1];
        a.set(i, h00, j);
        b.set(i + 1, h10, j);
        d.set(i + 1, h11, j + 1);
        e.set(i, h01, j + 1);
        const u0 = (tile % 2) * 0.5 + 0.012;
        const v0 = (tile < 2 ? 0.5 : 0) + 0.012;
        const us = 0.476;
        // two triangles a,e,d and a,d,b (CCW seen from above => normal +y)
        const tris = [a, e, d, a, d, b];
        const uvs = [
          [0, 0],
          [0, 1],
          [1, 1],
          [0, 0],
          [1, 1],
          [1, 0],
        ];
        const n1 = new Vector3().subVectors(e, a).cross(new Vector3().subVectors(d, a)).normalize();
        const n2 = new Vector3().subVectors(d, a).cross(new Vector3().subVectors(b, a)).normalize();
        for (let q = 0; q < 6; q++) {
          const p = tris[q];
          const nn = q < 3 ? n1 : n2;
          pos[k * 3] = p.x;
          pos[k * 3 + 1] = p.y;
          pos[k * 3 + 2] = p.z;
          nor[k * 3] = nn.x;
          nor[k * 3 + 1] = nn.y;
          nor[k * 3 + 2] = nn.z;
          col[k * 3] = c.r;
          col[k * 3 + 1] = c.g;
          col[k * 3 + 2] = c.b;
          uv[k * 2] = u0 + uvs[q][0] * us;
          uv[k * 2 + 1] = v0 + uvs[q][1] * us;
          k++;
        }
      }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('normal', new BufferAttribute(nor, 3));
    g.setAttribute('color', new BufferAttribute(col, 3));
    g.setAttribute('uv', new BufferAttribute(uv, 2));
    g.computeBoundingSphere();
    const terrain = new Mesh(g, mats.terrain);
    terrain.receiveShadow = true;
    terrain.name = 'terrain';
    add(terrain);
    if (world && rapier) {
      const body = world.createRigidBody(rapier.RigidBodyDesc.fixed());
      const idx = new Uint32Array(pos.length / 3);
      for (let q = 0; q < idx.length; q++) idx[q] = q;
      world.createCollider(rapier.ColliderDesc.trimesh(pos, idx).setCollisionGroups(GROUPS.ground).setFriction(0.8), body);
    }
  }

  // surroundings: wide ground skirt (or sea) + distant hills ring
  {
    const skirt = new GeoBuilder();
    const ext = 260;
    const baseCol = district === 'collina' ? 0x9cb064 : 0xb8a888;
    const y = district === 'collina' ? -0.2 : -0.06;
    // four big strips around the map
    skirt.box(W / 2, y - 0.5, -ext / 2, W + ext * 2, 1, ext, baseCol);
    if (district !== 'porto') skirt.box(W / 2, y - 0.5, D + ext / 2, W + ext * 2, 1, ext, baseCol);
    skirt.box(-ext / 2, y - 0.5, D / 2, ext, 1, D, baseCol);
    skirt.box(W + ext / 2, y - 0.5, D / 2, ext, 1, D, baseCol);
    // rolling hills on the horizon (behind the city)
    const hr = new Rng(map.seed + 9);
    const cx = W / 2;
    const cz = D / 2;
    for (let i = 0; i < 28; i++) {
      const ang = (i / 28) * Math.PI * 2 + hr.range(-0.08, 0.08);
      if (district === 'porto' && Math.cos(ang) > 0.35) continue; // keep the sea view open (south = +z)
      const dist = Math.max(W, D) * 0.5 + 70 + hr.range(0, 60);
      const x = cx + Math.sin(ang) * dist;
      const z = cz - Math.cos(ang) * dist;
      const r = hr.range(40, 75);
      skirt.sphere(x, -r * 0.55, z, r, r * hr.range(0.55, 0.85), r, hr.chance(0.5) ? 0x86a35a : 0x7b9a55, 10);
      // a cluster of distant houses on some hills
      if (hr.chance(0.4)) for (let h = 0; h < 5; h++) skirt.box(x + hr.range(-12, 12), r * 0.15 + hr.range(0, 4), z + hr.range(-12, 12) - Math.sign(z - cz) * r * 0.4, 5, 5, 5, PAL.facades[hr.int(0, 7)]);
    }
    const sm = new Mesh(skirt.build(), mats.world);
    sm.receiveShadow = false;
    add(sm);
  }

  // ---------- buildings ----------
  const walls = new GeoBuilder();
  const roofs = new GeoBuilder();
  const winOpen = new InstanceList();
  const winClosed = new InstanceList();
  const balconies = new InstanceList();
  const doors = new InstanceList();
  const roofTex = 1.5;
  const v3 = (x: number, y: number, z: number) => new Vector3(x, y, z);

  const addRoof = (x0: number, z0: number, x1: number, z1: number, y: number, kind: string, color: number) => {
    const o = 0.35;
    x0 -= o;
    z0 -= o;
    x1 += o;
    z1 += o;
    const w = x1 - x0;
    const d = z1 - z0;
    if (kind === 'flat') {
      walls.box((x0 + x1) / 2, y + 0.3, (z0 + z1) / 2, w - 0.6, 0.12, d - 0.6, 0xc9bba3);
      walls.box((x0 + x1) / 2, y + 0.45, z0 + 0.15, w, 0.5, 0.3, PAL.cream);
      walls.box((x0 + x1) / 2, y + 0.45, z1 - 0.15, w, 0.5, 0.3, PAL.cream);
      walls.box(x0 + 0.15, y + 0.45, (z0 + z1) / 2, 0.3, 0.5, d, PAL.cream);
      walls.box(x1 - 0.15, y + 0.45, (z0 + z1) / 2, 0.3, 0.5, d, PAL.cream);
      return;
    }
    const alongX = w >= d;
    const S = alongX ? d : w;
    const L = alongX ? w : d;
    const rh = Math.min(3, S * 0.3);
    const inset = kind === 'hip' ? S / 2 : 0;
    // local coords: a along L, b across S
    const P = (a: number, b: number, h: number) => (alongX ? v3(x0 + a, y + h, z0 + b) : v3(x0 + b, y + h, z0 + a));
    const r0 = P(inset, S / 2, rh);
    const r1 = P(L - inset, S / 2, rh);
    const c00 = P(0, 0, 0);
    const c10 = P(L, 0, 0);
    const c01 = P(0, S, 0);
    const c11 = P(L, S, 0);
    const slope = Math.hypot(S / 2, rh) / roofTex;
    const flip = !alongX;
    const quad = (a: Vector3, b: Vector3, c: Vector3, d2: Vector3) => {
      if (flip) roofs.quad(a, d2, c, b, color, slope, L / roofTex);
      else roofs.quad(a, b, c, d2, color, L / roofTex, slope);
    };
    // front slope (b=0 side) and back slope
    quad(c00, c10, r1, r0);
    quad(c11, c01, r0, r1);
    if (kind === 'hip') {
      if (flip) {
        roofs.tri(c01, r0, c00, color, [0, 0], [0.5 * slope, slope], [S / roofTex, 0]);
        roofs.tri(c10, r1, c11, color, [0, 0], [0.5 * slope, slope], [S / roofTex, 0]);
      } else {
        roofs.tri(c01, c00, r0, color, [0, 0], [S / roofTex, 0], [S / roofTex / 2, slope]);
        roofs.tri(c10, c11, r1, color, [0, 0], [S / roofTex, 0], [S / roofTex / 2, slope]);
      }
    } else {
      const wc = 0xe9dcc3;
      if (flip) {
        walls.tri(c00, r0, c01, wc);
        walls.tri(c11, r1, c10, wc);
      } else {
        walls.tri(c00, c01, r0, wc);
        walls.tri(c11, c10, r1, wc);
      }
    }
  };

  const buildingTop: number[] = [];
  map.buildings.forEach((b, bi) => {
    const x0 = b.x0 * CELL;
    const x1 = b.x1 * CELL;
    const z0 = b.z0 * CELL;
    const z1 = b.z1 * CELL;
    let gMax = -Infinity;
    for (let z = z0; z <= z1; z += 1) for (let x = x0; x <= x1; x += 1) gMax = Math.max(gMax, gh(x, z));
    const top = gMax + b.floors * FLOOR_H + 0.5;
    buildingTop[bi] = top;
    const base = b.baseY - 1.5;
    const color = b.special === 'pizzeria' ? 0xf0dfbd : district === 'collina' && b.color % 2 === 1 ? [0xf3ead8, 0xf0dfbd, 0xe9d3a8, 0xf6e9cf][b.color >> 1] : PAL.facades[b.color];
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    walls.box(cx, (base + top) / 2, cz, x1 - x0, top - base, z1 - z0, color);
    // plinth (zoccolo) and cornice
    walls.box(cx, gMax - 0.4 + 0.5, cz, x1 - x0 + 0.08, 1.0 + (gMax - b.baseY), z1 - z0 + 0.08, shade(color, 0.78));
    walls.box(cx, top - 0.12, cz, x1 - x0 + 0.36, 0.26, z1 - z0 + 0.36, PAL.cream);
    if (b.floors > 1) walls.box(cx, gMax + FLOOR_H + 0.15, cz, x1 - x0 + 0.12, 0.16, z1 - z0 + 0.12, PAL.cream);
    // corner quoins for some buildings
    if (rng.chance(0.4))
      for (const [qx, qz] of [
        [x0, z0],
        [x1, z0],
        [x0, z1],
        [x1, z1],
      ])
        walls.box(qx, (gMax + top) / 2, qz, 0.5, top - gMax, 0.5, shade(color, 1.08));
    addRoof(x0, z0, x1, z1, top, b.special === 'pizzeria' ? 'hip' : b.roof, rng.chance(0.3) ? PAL.roofDark : PAL.roof);
    if (b.roof !== 'flat' && rng.chance(0.45)) walls.box(cx + rng.range(-1, 1), top + 1.4, cz + rng.range(-1, 1), 0.6, 2, 0.6, shade(color, 0.9));

    // facades: windows per exterior face
    const faces: [number, number, number, number, number, number][] = [
      // side, ax, az, bx, bz (corners along the face), normal angle
      [0, x0, z0, x1, z0, Math.PI],
      [1, x1, z0, x1, z1, Math.PI / 2],
      [2, x0, z1, x1, z1, 0],
      [3, x0, z0, x0, z1, -Math.PI / 2],
    ];
    for (const [side, ax, az, bx, bz, rot] of faces) {
      const nx = side === 1 ? 1 : side === 3 ? -1 : 0;
      const nz = side === 2 ? 1 : side === 0 ? -1 : 0;
      const len = Math.hypot(bx - ax, bz - az);
      const bays = Math.max(1, Math.floor(len / 2.7));
      const step = len / bays;
      for (let k = 0; k < bays; k++) {
        const t = (k + 0.5) * step;
        const px = ax + ((bx - ax) / len) * t;
        const pz = az + ((bz - az) / len) * t;
        const out = typeAt(px + nx * 1.0, pz + nz * 1.0);
        if (out === Cell.BUILDING || out === -1) continue;
        const g0 = gh(px + nx * 0.6, pz + nz * 0.6);
        const isDoor = !b.edge && side === b.doorSide && Math.hypot(px - b.doorX, pz - b.doorZ) < step * 0.55;
        for (let f = 0; f < b.floors; f++) {
          const wy = g0 + f * FLOOR_H + 1.75;
          if (wy + 1 > top) break;
          if (f === 0 && isDoor) {
            doors.push(px + nx * 0.02, g0, pz + nz * 0.02, rot);
            continue;
          }
          const closed = rng.chance(f === 0 ? 0.55 : 0.3);
          (closed ? winClosed : winOpen).push(px + nx * 0.03, wy, pz + nz * 0.03, rot);
          if (f >= 1 && !closed && rng.chance(0.28) && !lowDetail) balconies.push(px + nx * 0.03, wy - 0.85, pz + nz * 0.03, rot);
        }
      }
    }
  });

  // pizzeria dressing: awning, sign, oven glow
  const piz = map.buildings[map.pizzeria.building];
  const glowGeo = new GeoBuilder();
  {
    const nx = piz.doorSide === 1 ? 1 : piz.doorSide === 3 ? -1 : 0;
    const nz = piz.doorSide === 2 ? 1 : piz.doorSide === 0 ? -1 : 0;
    const rot = Math.atan2(nx, nz);
    const g0 = gh(piz.doorX + nx, piz.doorZ + nz);
    const tx = -nz;
    const tz = nx;
    // striped awning
    for (let i = -4; i <= 4; i++) {
      const sx = piz.doorX + tx * i * 0.45 + nx * 0.8;
      const sz = piz.doorZ + tz * i * 0.45 + nz * 0.8;
      walls.box(sx, g0 + 3.0, sz, Math.abs(tx) * 0.45 + Math.abs(nx) * 1.6 + 0.001, 0.1, Math.abs(tz) * 0.45 + Math.abs(nz) * 1.6, i % 2 ? 0xffffff : 0xd7262c, 0, nz * 0.25, -nx * 0.25);
    }
    // oven window glow next to the door
    glowGeo.box(piz.doorX + tx * 2.2 + nx * 0.06, g0 + 1.4, piz.doorZ + tz * 2.2 + nz * 0.06, Math.abs(tx) * 1.3 + 0.06, 1.1, Math.abs(tz) * 1.3 + 0.06, 0xff8a3a);
    glowGeo.box(piz.doorX - tx * 2.2 + nx * 0.06, g0 + 1.4, piz.doorZ - tz * 2.2 + nz * 0.06, Math.abs(tx) * 1.3 + 0.06, 1.1, Math.abs(tz) * 1.3 + 0.06, 0xffb25a);
    const sign = new Mesh(new PlaneGeometry(5, 1.25), new MeshStandardMaterial({ map: signTexture('PIZZERIA WOBBLE'), roughness: 0.6, emissive: 0x222222 }));
    sign.position.set(piz.doorX + nx * 0.12, g0 + 3.9, piz.doorZ + nz * 0.12);
    sign.rotation.y = rot;
    add(sign);
    // outdoor tables
    const cafes = new InstanceList();
    cafes.push(piz.doorX + tx * 4 + nx * 1.4, g0, piz.doorZ + tz * 4 + nz * 1.4, 0);
    cafes.push(piz.doorX - tx * 4 + nx * 1.4, g0, piz.doorZ - tz * 4 + nz * 1.4, 0);
    add(cafes.build(M.cafeGeometry(), mats.world));
  }

  const wallMesh = new Mesh(walls.build(), mats.world);
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;
  add(wallMesh);
  const roofMesh = new Mesh(roofs.build(), mats.roof);
  roofMesh.castShadow = true;
  roofMesh.receiveShadow = true;
  add(roofMesh);
  add(winOpen.build(M.windowGeometry(false), mats.world, false, true));
  add(winClosed.build(M.windowGeometry(true), mats.world, false, true));
  add(balconies.build(M.balconyGeometry(), mats.world, true, true));
  add(doors.build(M.doorGeometry(), mats.world, false, true));

  // ---------- street props ----------
  const lampPost = new InstanceList();
  const lampBulb = new InstanceList();
  const lamps: Vector3[] = [];
  const parkedBody = new InstanceList();
  const parkedDet = new InstanceList();
  const parked: CityInfo['parked'] = [];
  const pastel = [0x9fd3c7, 0xf4b6c2, 0xf6e27f, 0xa7c7e7, 0xffffff, 0xe2232a, 0x8fc98f];
  const laundryRopes = new GeoBuilder();
  const cloth = new InstanceList();
  const clothColors = [0xffffff, 0xf4b6c2, 0x9fd3c7, 0xf6e27f, 0xa7c7e7, 0xe38f6c, 0xffffff];
  const lampTypes = new Set([Cell.SIDEWALK, Cell.QUAY]);
  for (const s of map.segments) {
    const alongX = s.axis === 'x';
    const len = (alongX ? s.x1 - s.x0 : s.z1 - s.z0) * CELL;
    const start = (alongX ? s.x0 : s.z0) * CELL;
    // lamps on both sidewalks, alternating
    if (s.kind !== 'alley') {
      for (let t = 6, side = 0; t < len - 4; t += 15, side ^= 1) {
        const a = start + t;
        const off = side ? (alongX ? s.z1 : s.x1) * CELL + 0.7 : (alongX ? s.z0 : s.x0) * CELL - 0.7;
        const x = alongX ? a : off;
        const z = alongX ? off : a;
        if (!lampTypes.has(typeAt(x, z) as never)) continue;
        const y = gh(x, z);
        const rot = alongX ? (side ? Math.PI : 0) : side ? -Math.PI / 2 : Math.PI / 2;
        lampPost.push(x, y, z, rot);
        lampBulb.push(x, y, z, rot);
        lamps.push(new Vector3(x + Math.sin(rot) * 0.6, y + 3.4, z + Math.cos(rot) * 0.6));
      }
      // parked scooters/apes along the curb
      for (let t = 9; t < len - 6; t += 11) {
        if (!rng.chance(0.3)) continue;
        const side = rng.chance(0.5) ? 1 : 0;
        const a = start + t + rng.range(-2, 2);
        const off = side ? (alongX ? s.z1 : s.x1) * CELL - 0.55 : (alongX ? s.z0 : s.x0) * CELL + 0.55;
        const x = alongX ? a : off;
        const z = alongX ? off : a;
        const heading = (alongX ? Math.PI / 2 : 0) + (rng.chance(0.5) ? Math.PI : 0) + rng.range(-0.25, 0.25);
        parkedBody.push(x, gh(x, z), z, heading, 1, 1, 1, rng.pick(pastel));
        parkedDet.push(x, gh(x, z), z, heading);
        parked.push({ x, z, heading });
      }
    }
    // laundry across narrow streets in the old town / hill
    if (district !== 'porto' && s.width <= 3 && !lowDetail) {
      for (let t = 5; t < len - 4; t += 7) {
        if (!rng.chance(0.45)) continue;
        const a = start + t;
        const lo = (alongX ? s.z0 : s.x0) * CELL - CELL;
        const hi = (alongX ? s.z1 : s.x1) * CELL + CELL;
        const p0x = alongX ? a : lo - 1;
        const p0z = alongX ? lo - 1 : a;
        const p1x = alongX ? a : hi + 1;
        const p1z = alongX ? hi + 1 : a;
        if (typeAt(p0x, p0z) !== Cell.BUILDING || typeAt(p1x, p1z) !== Cell.BUILDING) continue;
        const y = gh(alongX ? a : (lo + hi) / 2, alongX ? (lo + hi) / 2 : a) + FLOOR_H + 2.6 + rng.int(0, 1) * FLOOR_H;
        const span = hi - lo;
        const cx = alongX ? a : (lo + hi) / 2;
        const cz = alongX ? (lo + hi) / 2 : a;
        laundryRopes.box(cx, y, cz, alongX ? 0.025 : span, 0.025, alongX ? span : 0.025, 0xeeeeee);
        const nItems = Math.floor(span / 0.9);
        for (let i = 1; i < nItems; i++) {
          if (!rng.chance(0.7)) continue;
          const u = lo + (i / nItems) * span;
          const w = rng.range(0.45, 0.8);
          const h = rng.range(0.5, 0.9);
          cloth.push(alongX ? a : u, y - h / 2, alongX ? u : a, alongX ? Math.PI / 2 : 0, w, h, 1, rng.pick(clothColors));
        }
      }
    }
  }
  const lp = M.lampGeometries();
  add(lampPost.build(lp.post, mats.world, true, false));
  add(lampBulb.build(lp.bulb, mats.glow, false, false));
  const pv = M.vespaParkedGeometries();
  add(parkedBody.build(pv.body, mats.vehicle, true, false));
  add(parkedDet.build(pv.detail, mats.world, true, false));
  if (laundryRopes.vertexCount) {
    add(new Mesh(laundryRopes.build(), mats.world));
    const plane = new PlaneGeometry(1, 1, 1, 4);
    const pc = new Float32Array(plane.attributes.position.count * 3).fill(1);
    plane.setAttribute('color', new BufferAttribute(pc, 3));
    add(cloth.build(plane, mats.laundry, true, false));
  }

  // ---------- plazas ----------
  const plazas: CityInfo['plazas'] = [];
  const cafes = new InstanceList();
  const bulbs = new InstanceList();
  const wires = new GeoBuilder();
  const fountainGeo = new GeoBuilder();
  const fountainWater = new GeoBuilder();
  const tableColliders: [number, number][] = [];
  for (const p of map.plazas) {
    const x0 = p.x0 * CELL;
    const x1 = p.x1 * CELL;
    const z0 = p.z0 * CELL;
    const z1 = p.z1 * CELL;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const y = gh(cx, cz);
    plazas.push({ x: cx, z: cz, r: Math.min(x1 - x0, z1 - z0) / 2 });
    if (p.fountain) {
      const fx = (p.fountain.x0 + p.fountain.x1) * CELL * 0.5;
      const fz = (p.fountain.z0 + p.fountain.z1) * CELL * 0.5;
      fountainGeo.cyl(fx, y + 0.3, fz, 2.0, 0.6, PAL.stone, 20);
      fountainGeo.cyl(fx, y + 0.62, fz, 2.1, 0.08, 0xf3ead6, 20);
      fountainGeo.cyl(fx, y + 1.2, fz, 0.22, 1.6, PAL.stone, 10);
      fountainGeo.cyl(fx, y + 1.9, fz, 0.8, 0.2, PAL.stone, 14, 0, 0, 0, 0.6);
      fountainGeo.sphere(fx, y + 2.15, fz, 0.18, 0.25, 0.18, PAL.stone, 8);
      fountainWater.cyl(fx, y + 0.56, fz, 1.85, 0.02, 0xffffff, 20);
      fountainWater.cyl(fx, y + 1.55, fz, 0.78, 0.7, 0xffffff, 14, 0, 0, 0, 0.4);
      fountainWater.cyl(fx, y + 2.35, fz, 0.06, 0.4, 0xffffff, 6);
    } else {
      // belvedere: big olive tree + bench ring
      fountainGeo.cyl(cx, y + 0.25, cz, 2.2, 0.5, PAL.stone, 16);
      fountainGeo.merge(new GeoBuilder().add(M.oliveGeometry(), new Matrix4().makeTranslation(cx, y + 0.5, cz), 0xffffff), new Matrix4());
    }
    // cafe tables along two edges of the plaza
    for (let i = 0; i < 4; i++) {
      const tx = x0 + 2.5 + (i / 3) * (x1 - x0 - 5);
      for (const tz of [z0 + 2.2, z1 - 2.2]) {
        if (rng.chance(0.25)) continue;
        cafes.push(tx, gh(tx, tz), tz, rng.range(0, 3));
        tableColliders.push([tx, tz]);
      }
    }
    // string lights: zig-zag catenaries across the plaza
    const posts: Vector3[] = [];
    for (let i = 0; i <= 3; i++) {
      const t = i / 3;
      posts.push(new Vector3(x0 + 0.5 + t * (x1 - x0 - 1), y + 4.6, i % 2 ? z1 - 0.5 : z0 + 0.5));
    }
    for (let i = 0; i < posts.length - 1; i++) {
      const a = posts[i];
      const b = posts[i + 1];
      const n = 12;
      let prev = a.clone();
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        const pt = new Vector3().lerpVectors(a, b, t);
        pt.y -= Math.sin(t * Math.PI) * 1.3;
        const mid = new Vector3().addVectors(prev, pt).multiplyScalar(0.5);
        const l = prev.distanceTo(pt);
        const dir = new Vector3().subVectors(pt, prev).normalize();
        const m = new Matrix4().lookAt(prev, pt, UP);
        m.setPosition(mid);
        const seg = new GeoBuilder().box(0, 0, 0, 0.02, 0.02, l, 0x333333);
        wires.merge(seg, m);
        void dir;
        bulbs.push(pt.x, pt.y - 0.12, pt.z, 0, 1, 1, 1, rng.pick([0xffe6a0, 0xffb070, 0xfff4d0, 0xff8c8c]));
        prev = pt;
      }
    }
  }
  add(cafes.build(M.cafeGeometry(), mats.world));
  if (fountainGeo.vertexCount) {
    const fm = new Mesh(fountainGeo.build(), mats.world);
    fm.castShadow = fm.receiveShadow = true;
    add(fm);
  }
  if (fountainWater.vertexCount) add(new Mesh(fountainWater.build(), mats.fountainWater));
  if (wires.vertexCount) add(new Mesh(wires.build(), mats.world));
  const bulbGeo = new GeoBuilder().sphere(0, 0, 0, 0.09, 0.11, 0.09, 0xffffff, 6).build();
  add(bulbs.build(bulbGeo, mats.glow, false, false));
  add(glowGeo.vertexCount ? new Mesh(glowGeo.build(), mats.glow) : null);

  // ---------- gardens / hill vegetation ----------
  const cypress = new InstanceList();
  const olive = new InstanceList();
  const bush = new InstanceList();
  for (let cz = 0; cz < rows; cz++)
    for (let cx = 0; cx < cols; cx++) {
      if (cells[cz * cols + cx] !== Cell.GARDEN) continue;
      const x = cx * CELL + 1 + rng.range(-0.5, 0.5);
      const z = cz * CELL + 1 + rng.range(-0.5, 0.5);
      const y = gh(x, z);
      const r = rng.next();
      const edge = cx < 3 || cz < 3 || cx >= cols - 3 || cz >= rows - 3;
      if (edge && r < 0.7) continue;
      if (r < (district === 'collina' ? 0.3 : 0.15)) cypress.push(x, y, z, 0, 1, rng.range(0.8, 1.3), 1);
      else if (r < 0.45) olive.push(x, y, z, rng.range(0, 6), rng.range(0.7, 1.1), rng.range(0.7, 1.1), rng.range(0.7, 1.1));
      else if (r < 0.75) bush.push(x, y, z, rng.range(0, 6), rng.range(0.7, 1.3), 1, rng.range(0.7, 1.3));
    }
  // a few cypresses in the hill skyline
  if (district === 'collina')
    for (let i = 0; i < 40; i++) {
      const x = rng.range(-30, W + 30);
      const z = rng.range(-40, -6);
      cypress.push(x, gh(Math.max(0, Math.min(W, x)), 0) + rng.range(-1, 1), z, 0, 1.2, rng.range(1, 1.6), 1.2);
    }
  add(cypress.build(M.cypressGeometry(), mats.world));
  add(olive.build(M.oliveGeometry(), mats.world));
  add(bush.build(M.bushGeometry(), mats.world));

  // stairs: step blocks
  if (map.stairs.length) {
    const steps = new GeoBuilder();
    for (const st of map.stairs) {
      const x0 = st.x0 * CELL;
      const x1 = st.x1 * CELL;
      for (let z = st.z0 * CELL; z < st.z1 * CELL; z += 0.5) {
        const y = gh((x0 + x1) / 2, z + 0.25);
        steps.box((x0 + x1) / 2, y - 0.2, z + 0.25, x1 - x0, 0.4, 0.5, 0xdcd0b8);
      }
    }
    const sm = new Mesh(steps.build(), mats.world);
    sm.receiveShadow = true;
    add(sm);
  }

  // speed bumps & ramps (painted)
  if (map.bumps.length) {
    const bg = new GeoBuilder();
    for (const b of map.bumps) {
      const seg = map.segments.find((s) => b.x >= s.x0 * CELL && b.x <= s.x1 * CELL && b.z >= s.z0 * CELL && b.z <= s.z1 * CELL);
      if (!seg) continue;
      const w = seg.width * CELL;
      if (b.kind === 'bump') {
        for (let i = 0; i < 6; i++) {
          const t = -w / 2 + (i + 0.5) * (w / 6);
          const x = b.axis === 'x' ? b.x : b.x + t;
          const z = b.axis === 'x' ? b.z + t : b.z;
          bg.box(x, gh(x, z) + 0.01, z, b.axis === 'x' ? 0.5 : w / 6, 0.02, b.axis === 'x' ? w / 6 : 0.5, i % 2 ? 0xf2c330 : 0x2a2a2a);
        }
      } else {
        // ramp chevrons + side rails
        for (let a = -5; a < 3; a += 1) {
          const x = b.x + a * b.dir + 0.5 * b.dir;
          bg.box(x, gh(x, b.z) + 0.02, b.z, 0.35, 0.02, w * 0.8, a % 2 ? 0xf2c330 : 0xe8e2d6);
        }
        bg.box(b.x + 1 * b.dir, gh(b.x + b.dir, b.z) - 0.35, b.z - w / 2 + 0.1, 3, 0.8, 0.2, 0xd7262c);
        bg.box(b.x + 1 * b.dir, gh(b.x + b.dir, b.z) - 0.35, b.z + w / 2 - 0.1, 3, 0.8, 0.2, 0xd7262c);
      }
    }
    add(new Mesh(bg.build(), mats.world));
  }

  // road markings (harbour asphalt)
  if (district === 'porto') {
    const mk = new GeoBuilder();
    for (const s of map.segments) {
      if (s.kind === 'alley') continue;
      const alongX = s.axis === 'x';
      const len = (alongX ? s.x1 - s.x0 : s.z1 - s.z0) * CELL;
      const start = (alongX ? s.x0 : s.z0) * CELL;
      const c = alongX ? ((s.z0 + s.z1) * CELL) / 2 : ((s.x0 + s.x1) * CELL) / 2;
      for (let t = 4; t < len - 4; t += 4) {
        const x = alongX ? start + t : c;
        const z = alongX ? c : start + t;
        if (typeAt(x, z) !== Cell.ROAD && typeAt(x, z) !== Cell.QUAY) continue;
        mk.box(x, gh(x, z) + 0.012, z, alongX ? 1.8 : 0.14, 0.01, alongX ? 0.14 : 1.8, 0xf1ece0);
      }
    }
    if (mk.vertexCount) add(new Mesh(mk.build(), mats.world));
  }

  // puddles (not in the harbour)
  const puddles: CityInfo['puddles'] = [];
  {
    const pg = new GeoBuilder();
    const roadSegs = map.segments.filter((s) => s.kind === 'road');
    for (let i = 0; i < 6 && roadSegs.length; i++) {
      const s = rng.pick(roadSegs);
      const x = rng.range(s.x0 * CELL + 1, s.x1 * CELL - 1);
      const z = rng.range(s.z0 * CELL + 1, s.z1 * CELL - 1);
      const r = rng.range(0.9, 1.6);
      pg.cyl(x, gh(x, z) + 0.015, z, r, 0.01, 0xffffff, 14);
      puddles.push({ x, z, r });
    }
    const pm = new Mesh(pg.build(), mats.puddle);
    pm.receiveShadow = true;
    add(pm);
  }

  // ---------- harbour ----------
  let boats: CityInfo['boats'] = null;
  if (district === 'porto') {
    const sea = new Mesh(new PlaneGeometry(1400, 900, 1, 1), mats.water);
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(W / 2, WATER_LEVEL, map.waterLine + 450 - 2);
    sea.receiveShadow = true;
    add(sea);
    const edge = new GeoBuilder();
    const boll = new InstanceList();
    const crates = new InstanceList();
    // quay edge curbs where quay/road meets water
    for (let cz = 0; cz < rows - 1; cz++)
      for (let cx = 0; cx < cols; cx++) {
        const t = cells[cz * cols + cx];
        if (t === Cell.WATER) continue;
        const below = cells[(cz + 1) * cols + cx];
        if (below === Cell.WATER) {
          edge.box(cx * CELL + 1, -0.6, (cz + 1) * CELL - 0.15, CELL, 1.4, 0.3, 0xcab9a0);
          if (cx % 3 === 0) boll.push(cx * CELL + 1, 0, (cz + 1) * CELL - 0.6, 0);
        }
        if (cx < cols - 1 && cells[cz * cols + cx + 1] === Cell.WATER && cz * CELL >= map.waterLine) edge.box((cx + 1) * CELL - 0.15, -0.6, cz * CELL + 1, 0.3, 1.4, CELL, 0xcab9a0);
        if (cx > 0 && cells[cz * cols + cx - 1] === Cell.WATER && cz * CELL >= map.waterLine) edge.box(cx * CELL + 0.15, -0.6, cz * CELL + 1, 0.3, 1.4, CELL, 0xcab9a0);
      }
    // pier pilings, crates on quay
    for (let i = 0; i < 10; i++) {
      const x = rng.range(8, W - 8);
      const z = map.waterLine - rng.range(1.2, 2.2);
      if (typeAt(x, z) !== Cell.QUAY) continue;
      crates.push(x, 0, z, rng.range(-0.3, 0.3), 1, 1, 1);
      if (rng.chance(0.5)) crates.push(x + 0.85, 0, z, rng.range(-0.3, 0.3));
      if (rng.chance(0.4)) crates.push(x + 0.4, 0.8, z, rng.range(-0.3, 0.3));
    }
    add(new Mesh(edge.build(), mats.world));
    add(boll.build(M.bollardGeometry(), mats.world));
    add(crates.build(M.crateGeometry(), mats.world));
    // moored boats
    const boatList = new InstanceList();
    for (let i = 0; i < 9; i++) {
      const x = rng.range(6, W - 6);
      const z = map.waterLine + rng.range(4, 18);
      if (typeAt(x, z) !== Cell.WATER || typeAt(x + 2, z) !== Cell.WATER || typeAt(x - 2, z) !== Cell.WATER) continue;
      boatList.push(x, WATER_LEVEL - 0.3, z, rng.chance(0.5) ? 0 : Math.PI, 1, 1, 1, rng.pick([0xffffff, 0xf6e27f, 0xa7c7e7, 0xf4b6c2]));
    }
    const bm = boatList.build(M.boatGeometry(), mats.vehicle, true, false);
    if (bm) {
      bm.instanceMatrix.setUsage(DynamicDrawUsage);
      add(bm);
      boats = { mesh: bm, base: boatList.mats };
    }
    // lighthouse at the end of the middle pier
    const lh = new GeoBuilder();
    const lx = W / 2 + 40;
    const lz = map.waterLine + 34;
    lh.cyl(lx, -0.5, lz, 4, 2, 0xcab9a0, 12);
    for (let i = 0; i < 5; i++) lh.cyl(lx, 1 + i * 2, lz, 1.4 - i * 0.12, 2, i % 2 ? 0xd7262c : 0xffffff, 12, 0, 0, 0, (1.4 - (i + 1) * 0.12) / (1.4 - i * 0.12));
    lh.cyl(lx, 11.2, lz, 0.9, 0.4, PAL.iron, 10);
    lh.cone(lx, 12.9, lz, 1.0, 1.0, 0xd7262c, 10);
    add(new Mesh(lh.build(), mats.world));
    const lamp = new Mesh(new CylinderGeometry(0.6, 0.6, 1.0, 10), mats.lamp);
    lamp.position.set(lx, 11.9, lz);
    add(lamp);
  }

  // ---------- colliders ----------
  if (world && rapier) {
    const body = world.createRigidBody(rapier.RigidBodyDesc.fixed());
    const C = rapier.ColliderDesc;
    map.buildings.forEach((b, bi) => {
      const hx = ((b.x1 - b.x0) * CELL) / 2;
      const hz = ((b.z1 - b.z0) * CELL) / 2;
      const y0 = b.baseY - 2;
      const y1 = buildingTop[bi];
      world.createCollider(
        C.cuboid(hx, (y1 - y0) / 2, hz)
          .setTranslation(b.x0 * CELL + hx, (y0 + y1) / 2, b.z0 * CELL + hz)
          .setCollisionGroups(GROUPS.world)
          .setFriction(0.3),
        body,
      );
    });
    // blocked non-building cells (gardens, water, fountains): merged row runs
    const blocked = (t: number) => t === Cell.GARDEN || t === Cell.WATER || t === Cell.FOUNTAIN;
    for (let cz = 0; cz < rows; cz++) {
      let cx = 0;
      while (cx < cols) {
        const t = cells[cz * cols + cx];
        if (!blocked(t)) {
          cx++;
          continue;
        }
        let ex = cx;
        while (ex < cols && cells[cz * cols + ex] === t) ex++;
        const hx = ((ex - cx) * CELL) / 2;
        const x = cx * CELL + hx;
        const z = cz * CELL + 1;
        const y = gh(x, z);
        const h = t === Cell.WATER ? 3 : 1.4;
        world.createCollider(C.cuboid(hx, h / 2, 1).setTranslation(x, y + (t === Cell.WATER ? 0 : h / 2 - 0.2), z).setCollisionGroups(GROUPS.world), body);
        cx = ex;
      }
    }
    for (const [x, z] of tableColliders)
      world.createCollider(C.cylinder(0.6, 0.6).setTranslation(x, gh(x, z) + 0.6, z).setCollisionGroups(GROUPS.world), body);
    // map boundary walls
    const t = 2;
    for (const [x, z, hx, hz] of [
      [W / 2, -t, W / 2 + t, t],
      [W / 2, D + t, W / 2 + t, t],
      [-t, D / 2, t, D / 2 + t],
      [W + t, D / 2, t, D / 2 + t],
    ])
      world.createCollider(C.cuboid(hx, 20, hz).setTranslation(x, 10, z).setCollisionGroups(GROUPS.world), body);
  }

  return { group, lamps, plazas, puddles, boats, parked, carHandles: [], drawCallsEstimate: drawCalls };
}
