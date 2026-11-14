import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createSeededRandom } from '../utils/random';
import { CHECKPOINTS, FINISH_S, START_S, noise2, track, type Landmark } from './Track';
import { createBannerTexture, createBarkTexture, createCheckerTexture, createChevronTexture, createWoodTexture } from './Textures';

/**
 * The Backyard prop kit. Everything is procedural: authored geometry factories,
 * shared materials and instanced meshes chunked along the course so frustum
 * culling and fog keep the draw cost flat.
 */

export interface BackyardResult {
  group: THREE.Group;
  update(time: number, dt: number): void;
}

const CHUNK = 140;
const dummy = new THREE.Object3D();
const v = new THREE.Vector3();
const n = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function paint(geo: THREE.BufferGeometry, color: number | THREE.Color, shadeTop = 0): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  geo.computeBoundingBox();
  const box = geo.boundingBox!;
  for (let i = 0; i < pos.count; i += 1) {
    const h = (pos.getY(i) - box.min.y) / Math.max(1e-4, box.max.y - box.min.y);
    const k = 1 + (h - 0.5) * shadeTop;
    colors.set([c.r * k, c.g * k, c.b * k], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const clean = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p;
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(name)) g.deleteAttribute(name);
    return g;
  });
  return mergeGeometries(clean, false)!;
}

interface Placement {
  s: number;
  d: number;
  scale: number;
  yaw: number;
  color: THREE.Color;
  sx?: number;
  sy?: number;
  tilt?: number;
  lift?: number;
}

/** Instanced meshes split into course-length chunks. */
function instanced(
  group: THREE.Group,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  items: Placement[],
  opts: { cast?: boolean; receive?: boolean; align?: boolean } = {},
): void {
  const byChunk = new Map<number, Placement[]>();
  for (const it of items) {
    const key = Math.floor(it.s / CHUNK);
    let list = byChunk.get(key);
    if (!list) byChunk.set(key, (list = []));
    list.push(it);
  }
  for (const list of byChunk.values()) {
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, i) => {
      track.toWorld(it.s, it.d, v);
      dummy.position.copy(v);
      dummy.position.y += it.lift ?? 0;
      dummy.rotation.set(0, 0, 0);
      if (opts.align) {
        track.normal(it.s, it.d, n);
        dummy.quaternion.setFromUnitVectors(UP, n);
        dummy.rotateY(it.yaw);
      } else {
        dummy.rotation.set(it.tilt ?? 0, it.yaw, 0, 'YXZ');
      }
      dummy.scale.set(it.scale * (it.sx ?? 1), it.scale * (it.sy ?? 1), it.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, it.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = opts.cast ?? false;
    mesh.receiveShadow = opts.receive ?? false;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
}

// ------------------------------------------------------------- geometry kit

function bladeGeometry(): THREE.BufferGeometry {
  const segs = 3;
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const base = new THREE.Color(0x2f7a2c);
  const tip = new THREE.Color(0xb6e36a);
  const c = new THREE.Color();
  for (let i = 0; i <= segs; i += 1) {
    const t = i / segs;
    const w = 0.2 * (1 - t * t * 0.96);
    const bend = t * t * 0.42;
    pos.push(-w, t, bend, w, t, bend);
    c.copy(base).lerp(tip, t);
    col.push(c.r, c.g, c.b, c.r, c.g, c.b);
    uv.push(0, t, 1, t);
    if (i < segs) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  // Up-facing normals: blades take soft sky light instead of flickering two-sided shading.
  const nrm = new Float32Array(pos.length);
  for (let i = 0; i < nrm.length; i += 3) nrm.set([0, 0.92, 0.38], i);
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setIndex(idx);
  return geo;
}

function pebbleGeometry(): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(1, 2);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i += 1) {
    v.fromBufferAttribute(pos, i);
    const k = 0.82 + noise2(v.x * 1.7 + v.z, v.y * 1.7 - v.z) * 0.36;
    v.multiplyScalar(k);
    v.y *= 0.78;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return paint(geo, 0xffffff, 0.35);
}

function mushroomCapGeometry(): THREE.BufferGeometry {
  const profile: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i += 1) {
    const a = (i / 12) * Math.PI * 0.5;
    profile.push(new THREE.Vector2(Math.sin(a) * 1.3, 1.75 + Math.cos(a) * 0.85));
  }
  profile.push(new THREE.Vector2(1.22, 1.62), new THREE.Vector2(0.4, 1.7));
  return paint(new THREE.LatheGeometry(profile, 22), 0xffffff, 0.25);
}

function mushroomStemGeometry(): THREE.BufferGeometry {
  const stem = new THREE.LatheGeometry(
    [new THREE.Vector2(0.01, 0), new THREE.Vector2(0.62, 0), new THREE.Vector2(0.5, 0.5), new THREE.Vector2(0.42, 1.2), new THREE.Vector2(0.46, 1.72), new THREE.Vector2(0.01, 1.74)],
    16,
  );
  const parts = [paint(stem, 0xfff3dc, 0.2)];
  // Skirt ring and the classic white spots.
  parts.push(paint(new THREE.TorusGeometry(0.5, 0.09, 6, 16).rotateX(Math.PI / 2).translate(0, 1.25, 0), 0xffe9c4));
  const rng = createSeededRandom(31);
  for (let i = 0; i < 9; i += 1) {
    const a = rng() * Math.PI * 2;
    const e = 0.15 + rng() * 1.2;
    const r = Math.sin(e) * 1.3;
    const y = 1.75 + Math.cos(e) * 0.85;
    const spot = new THREE.SphereGeometry(0.13 + rng() * 0.12, 6, 4);
    spot.scale(1, 0.35, 1);
    spot.rotateZ(-e).rotateY(-a + Math.PI / 2);
    spot.translate(Math.cos(a) * r, y, Math.sin(a) * r);
    parts.push(paint(spot, 0xfffdf4));
  }
  return merge(parts);
}

function daisyHeadGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    const petal = new THREE.SphereGeometry(1, 6, 3);
    petal.scale(0.2, 0.035, 0.085);
    petal.translate(0.3, 0, 0);
    petal.rotateZ(0.18).rotateY(a);
    parts.push(paint(petal, 0xffffff));
  }
  const center = new THREE.SphereGeometry(0.15, 12, 8);
  center.scale(1, 0.55, 1);
  parts.push(paint(center, 0xffc928, 0.3));
  return merge(parts).translate(0, 1, 0);
}

function cupHeadGeometry(): THREE.BufferGeometry {
  const cup = new THREE.LatheGeometry(
    [new THREE.Vector2(0.02, 0), new THREE.Vector2(0.16, 0.04), new THREE.Vector2(0.27, 0.22), new THREE.Vector2(0.25, 0.42), new THREE.Vector2(0.3, 0.5)],
    10,
  );
  const parts = [paint(cup, 0xffffff, 0.3), paint(new THREE.SphereGeometry(0.08, 8, 6).translate(0, 0.18, 0), 0xffe07a)];
  return merge(parts).translate(0, 0.96, 0);
}

function stemGeometry(): THREE.BufferGeometry {
  const stem = new THREE.CylinderGeometry(0.022, 0.034, 1, 6).translate(0, 0.5, 0);
  const leaf = new THREE.SphereGeometry(1, 8, 5);
  leaf.scale(0.17, 0.02, 0.07);
  leaf.rotateZ(0.6).translate(0.13, 0.35, 0);
  return merge([paint(stem, 0x4d9a3a, 0.3), paint(leaf, 0x5cab40)]);
}

function leafGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-1, 0);
  shape.bezierCurveTo(-0.6, 0.55, 0.3, 0.6, 1, 0.06);
  shape.lineTo(1.25, 0);
  shape.lineTo(1, -0.06);
  shape.bezierCurveTo(0.3, -0.6, -0.6, -0.55, -1, 0);
  const geo = new THREE.ShapeGeometry(shape, 6);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, 0.1 * (1 - x * x) + Math.abs(z) * 0.22);
  }
  geo.computeVertexNormals();
  return paint(geo, 0xffffff);
}

function plankGeometry(): THREE.BufferGeometry {
  return new THREE.BoxGeometry(1, 1, 1);
}

function picketGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, 0);
  shape.lineTo(0.5, 0);
  shape.lineTo(0.5, 0.86);
  shape.lineTo(0, 1);
  shape.lineTo(-0.5, 0.86);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1 });
}

// ------------------------------------------------------------------ builder

export function buildBackyard(quality: number): BackyardResult {
  const group = new THREE.Group();
  group.name = 'backyard';
  const rng = createSeededRandom(2024);
  const wood = createWoodTexture();
  const bark = createBarkTexture();

  const mats = {
    veg: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }),
    prop: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
    stone: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
    cap: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35 }),
    wood: new THREE.MeshStandardMaterial({ map: wood, roughness: 0.75, color: 0xffffff }),
    woodDark: new THREE.MeshStandardMaterial({ map: wood, roughness: 0.8, color: 0xb98d5e }),
    bark: new THREE.MeshStandardMaterial({ map: bark, roughness: 1 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xb9c4cc, roughness: 0.32, metalness: 0.85 }),
    teal: new THREE.MeshStandardMaterial({ color: 0x2fb5a4, roughness: 0.4, metalness: 0.35 }),
    red: new THREE.MeshStandardMaterial({ color: 0xe5483a, roughness: 0.45 }),
    terracotta: new THREE.MeshStandardMaterial({ color: 0xc8643c, roughness: 0.9 }),
    hose: new THREE.MeshStandardMaterial({ color: 0x38a84f, roughness: 0.45 }),
    rope: new THREE.MeshStandardMaterial({ color: 0xd9c59a, roughness: 1 }),
  };

  // Wind sway for grass blades (instance-space vertex offset, phase from world position).
  const windUniform = { value: 0 };
  const grassMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  grassMat.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = windUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWind;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 0.21 + instanceMatrix[3].z * 0.17;
          float sway = sin(uWind * 1.7 + ph) * 0.16 + sin(uWind * 3.1 + ph * 1.7) * 0.05;
          transformed.z += sway * uv.y * uv.y;
          transformed.x += sway * 0.5 * uv.y * uv.y;
        #endif`,
      );
  };

  const blocked = (s: number, d: number): boolean => {
    // Keep vegetation out of streams, leaf shortcuts and bridge approaches.
    for (const lf of track.leafBridges) if (s > lf.s0 - 42 && s < lf.s1 + 34 && d * lf.side > 0) return true;
    for (const br of track.bridges) if (s > br.s0 - 12 && s < br.s1 + 12) return true;
    return false;
  };

  const miniDaisies: Placement[] = [];
  // --- giant grass along both verges
  const blades: Placement[] = [];
  const grassStep = quality > 1 ? 0.62 : quality > 0 ? 0.95 : 2.4;
  const greens = track.def.theme.grassTints;
  const marks = (...kinds: Landmark['kind'][]) => track.def.landmarks.filter((l) => kinds.includes(l.kind));
  for (let s = -30; s < track.length + 30; s += grassStep) {
    const hw = track.halfWidth(s);
    for (const side of [-1, 1]) {
      for (let k = 0; k < 4; k += 1) {
        const e = 3.6 + Math.pow(rng(), 1.6) * 24;
        const d = side * (hw + e);
        if (blocked(s, d)) continue;
        blades.push({
          s: s + rng() * grassStep,
          d,
          scale: 2.2 + rng() * 3.4 + Math.min(4, e * 0.18),
          sx: 1.1 + rng() * 0.9,
          yaw: rng() * Math.PI * 2,
          tilt: (rng() - 0.5) * 0.35,
          color: new THREE.Color(greens[Math.floor(rng() * greens.length)]).multiplyScalar(0.85 + rng() * 0.3),
        });
      }
    }
  }
  // Short tufts and clover-sized daisies sprinkled on the grass racing surface (visual only).
  const tufts: Placement[] = [];
  const minis: Placement[] = [];
  const tuftCount = quality > 0 ? 5200 : 1800;
  for (let i = 0; i < tuftCount; i += 1) {
    const s = rng() * track.length;
    const d = (rng() * 2 - 1) * (track.halfWidth(s) + 4);
    if (track.surface(s, d) !== 'grass') continue;
    const item = { s, d, scale: 0.28 + rng() * 0.5, sx: 1.4, yaw: rng() * 6.28, tilt: (rng() - 0.5) * 0.5, color: new THREE.Color(greens[Math.floor(rng() * greens.length)]).multiplyScalar(0.9 + rng() * 0.25) };
    tufts.push(item);
    if (rng() < 0.16) minis.push({ s: s + 0.3, d: d + 0.2, scale: 0.5 + rng() * 0.4, yaw: rng() * 6.28, color: new THREE.Color(0xffffff) });
  }
  instanced(group, bladeGeometry(), grassMat, [...blades, ...tufts]);
  miniDaisies.push(...minis);

  // --- flowers, mushrooms, pebbles, leaves scattered through the verge
  const stems: Placement[] = [];
  const daisies: Placement[] = [];
  const cups: Placement[] = [];
  const caps: Placement[] = [];
  const mStems: Placement[] = [];
  const pebbles: Placement[] = [];
  const leaves: Placement[] = [];
  const white = new THREE.Color(0xffffff);
  const petalColors = [0xffffff, 0xfff0a8, 0xffc4dc, 0xd9c4ff, 0xffffff];
  const cupColors = [0xff5a4a, 0xffa23a, 0xff6fa8, 0xa56cf0, 0xffd23a];
  const capColors = [0xe5382e, 0xf0762a, 0xd84a7c, 0xb9783c];
  const stoneColors = [0xb6b9be, 0x9a9da4, 0xc9c1b4, 0x8c9096];
  const leafColors = [0xe8862a, 0xd1541f, 0xf2b530, 0xb8431e, 0xe0a030, 0x9c6a2a];

  for (let s = -20; s < track.length + 20; s += 5) {
    const hw = track.halfWidth(s);
    for (const side of [-1, 1]) {
      const d = side * (hw + 5 + rng() * 15);
      const ss = s + rng() * 5;
      if (blocked(ss, d)) continue;
      const roll = rng();
      if (roll < 0.3) {
        const scale = 4 + rng() * 5;
        const item = { s: ss, d, scale, yaw: rng() * 6.28, tilt: (rng() - 0.5) * 0.2, color: white };
        stems.push(item);
        if (rng() < 0.6) daisies.push({ ...item, color: new THREE.Color(petalColors[Math.floor(rng() * petalColors.length)]) });
        else cups.push({ ...item, color: new THREE.Color(cupColors[Math.floor(rng() * cupColors.length)]) });
      } else if (roll < 0.42) {
        const scale = 0.8 + rng() * 1.6;
        const item = { s: ss, d: side * (hw + 4.5 + rng() * 6), scale, yaw: rng() * 6.28, tilt: (rng() - 0.5) * 0.12, color: white };
        mStems.push(item);
        caps.push({ ...item, color: new THREE.Color(capColors[Math.floor(rng() * capColors.length)]) });
      } else if (roll < 0.62) {
        pebbles.push({
          s: ss,
          d: side * (hw + 3 + rng() * 9),
          scale: 0.5 + rng() * 1.6,
          sx: 0.8 + rng() * 0.5,
          yaw: rng() * 6.28,
          color: new THREE.Color(stoneColors[Math.floor(rng() * stoneColors.length)]),
          lift: -0.1,
        });
      }
    }
  }
  // Gameplay obstacles use the same kit so every hazard is recognisable.
  for (const o of track.obstacles) {
    if (o.kind === 'mushroom') {
      const item = { s: o.s, d: o.d, scale: o.r * 0.82, yaw: rng() * 6.28, color: white };
      mStems.push(item);
      caps.push({ ...item, color: new THREE.Color(0xe5382e) });
    } else if (o.kind === 'pebble') {
      pebbles.push({ s: o.s, d: o.d, scale: o.r * 1.12, yaw: rng() * 6.28, color: new THREE.Color(0xaeb2b8), lift: o.r * 0.35 });
    }
  }
  // Loose leaves wherever the ground is leaf-covered (and a little beyond the edges).
  {
    for (let i = 0; i < 2600 && leaves.length < 520; i += 1) {
      const s = rng() * track.length;
      const hw = track.halfWidth(s);
      const d = (rng() * 2 - 1) * (hw + 7);
      if (track.surface(s, Math.max(-hw, Math.min(hw, d))) !== 'leaves' || track.surface(s, d) === 'water') continue;
      leaves.push({
        s,
        d,
        scale: 0.7 + rng() * 1.5,
        yaw: rng() * 6.28,
        color: new THREE.Color(leafColors[Math.floor(rng() * leafColors.length)]),
        lift: 0.04,
      });
    }
  }
  instanced(group, stemGeometry(), mats.prop, stems);
  instanced(group, daisyHeadGeometry(), mats.prop, daisies);
  instanced(group, daisyHeadGeometry().translate(0, -0.9, 0), mats.prop, miniDaisies, { align: true });
  instanced(group, cupHeadGeometry(), mats.veg, cups);
  instanced(group, mushroomStemGeometry(), mats.prop, mStems, { cast: true });
  instanced(group, mushroomCapGeometry(), mats.cap, caps, { cast: true });
  instanced(group, pebbleGeometry(), mats.stone, pebbles, { cast: true, receive: true });
  instanced(group, leafGeometry(), mats.veg, leaves, { align: true });

  // --- broad-leaf plants (hosta-like) as oversized mid-ground foliage
  const frond = leafGeometry();
  const fronds: Placement[] = [];
  for (let s = 40; s < track.length; s += 46 + rng() * 30) {
    const side = rng() < 0.5 ? -1 : 1;
    const d = side * (track.halfWidth(s) + 13 + rng() * 9);
    if (blocked(s, d)) continue;
    const scale = 5 + rng() * 4;
    const hue = new THREE.Color().setHSL(0.27 + rng() * 0.08, 0.6, 0.36 + rng() * 0.1);
    for (let k = 0; k < 7; k += 1) {
      fronds.push({ s, d, scale, sx: 1, yaw: (k / 7) * 6.28 + rng() * 0.4, tilt: -0.75 - rng() * 0.4, color: hue, lift: scale * 0.5 });
    }
  }
  instanced(group, frond, mats.veg, fronds);

  // --- roots (collision capsules get matching bark tubes)
  const rootGeos: THREE.BufferGeometry[] = [];
  const addRoot = (points: THREE.Vector3[], r: number) => {
    const curve = new THREE.CatmullRomCurve3(points);
    const tube = new THREE.TubeGeometry(curve, Math.max(10, points.length * 5), r, 9, false);
    const pos = tube.getAttribute('position');
    const uv = tube.getAttribute('uv');
    for (let i = 0; i < pos.count; i += 1) {
      // Knobbly, uneven girth.
      const k = 1 + (noise2(uv.getX(i) * 9, uv.getY(i) * 5) - 0.5) * 0.22;
      v.fromBufferAttribute(pos, i);
      curve.getPoint(uv.getX(i), n);
      v.sub(n).multiplyScalar(k).add(n);
      pos.setXYZ(i, v.x, v.y, v.z);
      uv.setXY(i, uv.getX(i) * points.length * 1.5, uv.getY(i) * 2);
    }
    tube.computeVertexNormals();
    rootGeos.push(tube);
  };
  const divider: THREE.Vector3[] = [];
  for (const root of track.roots) {
    if (root.r > 1) {
      if (divider.length === 0) {
        divider.push(track.toWorld(root.s - 5, root.d0 - 1, new THREE.Vector3()).add(new THREE.Vector3(0, -1.6, 0)));
      }
      divider.push(track.toWorld(root.s, root.d0, new THREE.Vector3()).add(new THREE.Vector3(0, root.r * 0.35, 0)));
      continue;
    }
    const pts: THREE.Vector3[] = [];
    const span = root.d1 - root.d0;
    const dir = Math.sign(span);
    for (const t of [-0.22, 0, 0.25, 0.5, 0.75, 1, 1.12]) {
      const s = root.s + root.skew * t;
      const d = root.d0 + span * t;
      const p = track.toWorld(s, d, new THREE.Vector3());
      p.y += t < 0 ? -1.4 : t > 1 ? -root.r * 1.3 : root.r * (0.35 + Math.sin(t * 9 + root.s) * 0.12);
      if (t < 0) p.addScaledVector(v.set(Math.cos(track.heading(s)), 0, Math.sin(track.heading(s))), -dir * 1.5);
      pts.push(p);
    }
    addRoot(pts, root.r);
  }
  if (divider.length) {
    const last = track.roots.filter((r) => r.r > 1).pop()!;
    divider.push(track.toWorld(last.s + last.skew, last.d1, new THREE.Vector3()).add(new THREE.Vector3(0, last.r * 0.3, 0)));
    divider.push(track.toWorld(last.s + last.skew + 6, last.d1 - 0.5, new THREE.Vector3()).add(new THREE.Vector3(0, -1.6, 0)));
    addRoot(divider, 1.15);
  }
  if (rootGeos.length) {
    const rootMesh = new THREE.Mesh(mergeGeometries(rootGeos)!, mats.bark);
    rootMesh.castShadow = true;
    rootMesh.receiveShadow = true;
    rootMesh.name = 'roots';
    group.add(rootMesh);
  }

  // Stump at the end of the divider and the trunks the roots belong to.
  for (const o of track.obstacles) {
    if (o.kind !== 'stump') continue;
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(o.r * 0.9, o.r * 1.25, 3.4, 14), mats.bark);
    stump.position.copy(o.a).setY(o.a.y + 0.8);
    stump.castShadow = true;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(o.r * 0.86, o.r * 0.86, 0.08, 14), mats.wood);
    top.position.y = 1.72;
    stump.add(top);
    group.add(stump);
  }
  const trunkProfile = [
    new THREE.Vector2(30, 0),
    new THREE.Vector2(22, 6),
    new THREE.Vector2(17, 18),
    new THREE.Vector2(15, 50),
    new THREE.Vector2(14.5, 220),
  ];
  for (const { s, d } of marks('trunk')) {
    const trunk = new THREE.Mesh(new THREE.LatheGeometry(trunkProfile, 20), mats.bark);
    track.toWorld(s, d, trunk.position);
    trunk.position.y -= 6;
    trunk.castShadow = true;
    group.add(trunk);
  }

  // --- leaf shortcut: big overlapping leaves laid over the stream
  const leafSheet = (s0: number, len: number, d: number, halfW: number, color: number, lift: number) => {
    const us = 14;
    const vs = 6;
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const c = new THREE.Color();
    const base = new THREE.Color(color);
    const rib = base.clone().multiplyScalar(0.62);
    for (let i = 0; i <= us; i += 1) {
      const u = i / us;
      const w = halfW * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.04 + 0.02)), 0.55);
      for (let j = 0; j <= vs; j += 1) {
        const t = (j / vs) * 2 - 1;
        track.toWorld(s0 + u * len, d + t * w, v);
        pos.push(v.x, v.y + lift + Math.abs(t) * 0.18, v.z);
        const vein = Math.abs(t) < 0.12 ? 1 : Math.abs(Math.sin(u * 22 + Math.abs(t) * 5)) > 0.93 ? 0.6 : 0;
        c.copy(base).lerp(rib, vein).multiplyScalar(0.9 + noise2(u * 6 + s0, t * 3) * 0.25);
        col.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < us; i += 1) {
      for (let j = 0; j < vs; j += 1) {
        const a = i * (vs + 1) + j;
        idx.push(a, a + 1, a + vs + 1, a + 1, a + vs + 2, a + vs + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mats.veg);
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  const sheetColors = track.def.theme.fireflies ? [0x58b86a, 0x7acc6a, 0x46a868, 0x8ad67a, 0x5cc07a] : [0xf0a52c, 0xe2702a, 0xf4c63a, 0xd95a28, 0xeb962e];
  for (const lf of track.leafBridges) {
    const sheetLen = (lf.s1 - lf.s0 + 16) / 5;
    for (let i = 0; i < 5; i += 1) {
      leafSheet(lf.s0 - 8 + i * sheetLen - 2, sheetLen + 5, lf.d + (i % 2 ? 0.25 : -0.25), lf.half + 0.9, sheetColors[i], 0.05 + (i % 2) * 0.05);
    }
  }

  // --- wooden ramps: plank decks over the kickers
  const planks: Placement[] = [];
  const woodTints = [0xffffff, 0xf2dcc0, 0xe6c8a0, 0xfff0d8];
  for (const jump of track.jumps) {
    for (let s = jump.s0 + 0.6; s < jump.s1; s += 1.25) {
      planks.push({
        s,
        d: 0,
        scale: 1,
        yaw: 0,
        color: new THREE.Color(woodTints[Math.floor(rng() * woodTints.length)]),
        lift: 0.02,
      });
    }
  }
  {
    const mesh = new THREE.InstancedMesh(plankGeometry(), mats.wood, planks.length);
    planks.forEach((p, i) => {
      const hw = track.halfWidth(p.s) + 1.5;
      track.toWorld(p.s, 0, v);
      track.normal(p.s - 0.3, 0, n);
      dummy.position.copy(v);
      dummy.quaternion.setFromUnitVectors(UP, n);
      dummy.rotateY(-track.heading(p.s));
      dummy.scale.set(hw * 2, 0.16, 1.12);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, p.color);
    });
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // --- bridges: deck planks, posts and rope rails
  for (const BRIDGE of track.bridges) {
    const deck: THREE.Matrix4[] = [];
    for (let s = BRIDGE.s0 - 2; s <= BRIDGE.s1 + 2; s += 1.05) {
      track.toWorld(s, 0, v);
      track.normal(s, 0, n);
      dummy.position.copy(v);
      dummy.position.y += 0.02;
      dummy.quaternion.setFromUnitVectors(UP, n);
      dummy.rotateY(-track.heading(s) + (rng() - 0.5) * 0.03);
      dummy.scale.set(9.4, 0.22, 0.94);
      dummy.updateMatrix();
      deck.push(dummy.matrix.clone());
    }
    const mesh = new THREE.InstancedMesh(plankGeometry(), mats.wood, deck.length);
    deck.forEach((m, i) => {
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, new THREE.Color(woodTints[i % woodTints.length]));
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    for (const side of [-1, 1]) {
      const pts: THREE.Vector3[] = [];
      for (let s = BRIDGE.s0 - 1; s <= BRIDGE.s1 + 1; s += 4.75) {
        const p = track.toWorld(s, side * 4.2, new THREE.Vector3());
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 3.2, 8), mats.woodDark);
        post.position.copy(p).setY(p.y + 0.4);
        post.castShadow = true;
        group.add(post);
        pts.push(p.clone().setY(p.y + 1.15 + (pts.length % 2 ? -0.18 : 0)));
      }
      const rope = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.16, 6), mats.rope);
      rope.castShadow = true;
      group.add(rope);
    }
    // Support logs dipping into the stream.
    for (const s of [BRIDGE.s0 + 6, (BRIDGE.s0 + BRIDGE.s1) / 2, BRIDGE.s1 - 6]) {
      for (const side of [-1, 1]) {
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 4, 8), mats.bark);
        track.toWorld(s, side * 3.6, log.position);
        log.position.y -= 1.9;
        group.add(log);
      }
    }
  }

  // --- start and finish arches (giant pencils) + checker strips
  const pencil = (height: number, color: number): THREE.Group => {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.45 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, height, 6), bodyMat);
    body.position.y = height / 2;
    const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.9, 12), mats.metal);
    ferrule.position.y = height + 0.4;
    const eraser = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.74, 1.0, 12), new THREE.MeshStandardMaterial({ color: 0xff8fa6, roughness: 0.8 }));
    eraser.position.y = height + 1.3;
    for (const m of [body, ferrule, eraser]) {
      m.castShadow = true;
      g.add(m);
    }
    return g;
  };
  const arch = (s: number, half: number, text: string, bg: string, fg: string, checker: boolean, color: number) => {
    const left = track.toWorld(s, -half, new THREE.Vector3());
    const right = track.toWorld(s, half, new THREE.Vector3());
    const top = Math.max(left.y, right.y) + 9.5;
    for (const p of [left, right]) {
      const pen = pencil(top - p.y + 1.2, color);
      pen.position.copy(p).setY(p.y - 1.2);
      group.add(pen);
    }
    const width = left.distanceTo(right);
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(width - 0.6, 3.4, 16, 1),
      new THREE.MeshStandardMaterial({ map: createBannerTexture(text, bg, fg, checker), side: THREE.DoubleSide, roughness: 0.8 }),
    );
    const bp = banner.geometry.getAttribute('position');
    for (let i = 0; i < bp.count; i += 1) {
      const x = bp.getX(i) / (width * 0.5);
      bp.setY(i, bp.getY(i) - (1 - x * x) * 0.55);
      bp.setZ(i, Math.sin(x * 7) * 0.12);
    }
    banner.geometry.computeVertexNormals();
    banner.position.set((left.x + right.x) / 2, top - 2.2, (left.z + right.z) / 2);
    banner.rotation.y = -track.heading(s) + Math.PI;
    banner.castShadow = true;
    group.add(banner);
    // Bunting between the posts.
    const flagColors = [0xff5a4a, 0xffd23a, 0x4fb8ff, 0x7ad65a, 0xff8fd0];
    for (let i = 0; i < 13; i += 1) {
      const t = (i + 0.5) / 13;
      const flag = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.95, 3), new THREE.MeshStandardMaterial({ color: flagColors[i % 5], roughness: 0.8, side: THREE.DoubleSide }));
      flag.position.lerpVectors(left, right, t);
      flag.position.y = top + 0.4 - Math.sin(t * Math.PI) * 0.7;
      flag.rotation.set(Math.PI, -track.heading(s), 0);
      flag.scale.z = 0.2;
      group.add(flag);
    }
    // Checker strip painted across the course.
    const strip: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const cells = 24;
    for (let i = 0; i <= cells; i += 1) {
      const d = -half + (i / cells) * half * 2;
      for (const o of [-1.1, 1.1]) {
        track.toWorld(s + o, d, v);
        strip.push(v.x, v.y + 0.06, v.z);
        uv.push((i / cells) * 6, o > 0 ? 0.5 : 0);
      }
      if (i < cells) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(strip, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const line = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: createCheckerTexture(), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }));
    line.receiveShadow = true;
    group.add(line);
  };
  arch(START_S, track.halfWidth(START_S) + 0.9, 'START', '#3fa34d', '#ffffff', false, 0x4fb8ff);
  arch(FINISH_S, track.halfWidth(FINISH_S) + 0.9, 'FINISH', '#ffd23a', '#1f2430', true, 0xffc21a);

  // --- checkpoint flags (toothpick pennants)
  const cpColors = [0x4fb8ff, 0xff8fd0, 0x7ad65a, 0xffa23a];
  CHECKPOINTS.forEach((s, i) => {
    for (const side of [-1, 1]) {
      const p = track.toWorld(s, side * (track.halfWidth(s) + 1.2), new THREE.Vector3());
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 5.5, 6), mats.woodDark);
      pole.position.copy(p).setY(p.y + 2.4);
      pole.castShadow = true;
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(1.9, 0.5);
      shape.lineTo(0, 1);
      const flag = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ color: cpColors[i % 4], side: THREE.DoubleSide, roughness: 0.8 }));
      flag.position.y = 1.6;
      flag.rotation.y = -track.heading(s) - Math.PI / 2;
      pole.add(flag);
      group.add(pole);
    }
  });

  // --- fence behind the start and down the left side of the starting hill
  const picket = picketGeometry();
  const pickets: THREE.Matrix4[] = [];
  const fencePost = (s: number, d: number, yaw: number, h: number) => {
    track.toWorld(s, d, v);
    dummy.position.set(v.x, v.y - 8, v.z);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(8.6, h, 8);
    dummy.updateMatrix();
    pickets.push(dummy.matrix.clone());
  };
  for (let d = -130; d <= 130; d += 9.4) fencePost(-34, d, -track.heading(0) + Math.PI, 62 + Math.sin(d) * 2);
  const fenceDef = track.def.fence;
  if (fenceDef) {
    for (let s = -30; s < fenceDef.s1; s += 9.4) fencePost(s, fenceDef.side * (98 + Math.sin(s * 0.01) * 10), -track.heading(s) - (fenceDef.side * Math.PI) / 2, 66 + Math.sin(s) * 2);
  }
  const fence = new THREE.InstancedMesh(picket, new THREE.MeshStandardMaterial({ map: wood, color: 0xfff4e2, roughness: 0.8 }), pickets.length);
  pickets.forEach((m, i) => fence.setMatrixAt(i, m));
  fence.castShadow = false;
  group.add(fence);

  // --- garden tools & yard clutter as landmarks
  // Watering can.
  for (const lm of marks('can')) {
    const can = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.LatheGeometry([new THREE.Vector2(0.01, 0), new THREE.Vector2(13, 0), new THREE.Vector2(14, 2), new THREE.Vector2(13.4, 24), new THREE.Vector2(14.2, 25), new THREE.Vector2(12.4, 25.2)], 28),
      mats.teal,
    );
    const spoutCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(12, 6, 0), new THREE.Vector3(22, 14, 0), new THREE.Vector3(31, 28, 0), new THREE.Vector3(36, 33, 0)]);
    const spout = new THREE.Mesh(new THREE.TubeGeometry(spoutCurve, 20, 2.3, 10), mats.teal);
    const rose = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 2.6, 4, 16), mats.metal);
    rose.position.set(37.4, 34.6, 0);
    rose.rotation.z = -0.85;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(10, 1.3, 8, 20, Math.PI * 1.1), mats.teal);
    handle.position.set(-12, 15, 0);
    handle.rotation.z = Math.PI * 0.45;
    const band = new THREE.Mesh(new THREE.TorusGeometry(13.9, 0.6, 6, 28), mats.metal);
    band.rotation.x = Math.PI / 2;
    band.position.y = 17;
    can.add(body, spout, rose, handle, band);
    track.toWorld(lm.s, lm.d, can.position);
    can.position.y -= 2;
    can.rotation.y = 2.2;
    can.traverse((o) => (o.castShadow = true));
    group.add(can);
  }
  // Trowel stabbed into the hill.
  for (const lm of marks('trowel')) {
    const trowel = new THREE.Group();
    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(0, -20);
    bladeShape.quadraticCurveTo(9, -8, 7.5, 6);
    bladeShape.lineTo(2.5, 12);
    bladeShape.lineTo(-2.5, 12);
    bladeShape.lineTo(-7.5, 6);
    bladeShape.quadraticCurveTo(-9, -8, 0, -20);
    const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(bladeShape, { depth: 0.8, bevelEnabled: true, bevelSize: 0.3, bevelThickness: 0.3, bevelSegments: 2, curveSegments: 14 }), mats.metal);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 9, 10), mats.metal);
    neck.position.set(0, 16, 0.4);
    const grip = new THREE.Mesh(new THREE.CapsuleGeometry(2.6, 15, 6, 14), mats.red);
    grip.position.set(0, 30, 0.4);
    const cap = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.5, 6, 16), mats.metal);
    cap.rotation.x = Math.PI / 2;
    cap.position.set(0, 21.5, 0.4);
    trowel.add(blade, neck, grip, cap);
    track.toWorld(lm.s, lm.d, trowel.position);
    trowel.position.y += 9;
    trowel.rotation.set(0.25, 0.9, 0.3);
    trowel.traverse((o) => (o.castShadow = true));
    group.add(trowel);
  }
  // Garden hose snaking down beside the course.
  for (const lm of marks('hose')) {
    const hoseEnd = lm.s1 ?? lm.s + 300;
    const pts: THREE.Vector3[] = [];
    for (let s = lm.s; s <= hoseEnd; s += 14) {
      const d = lm.d + Math.sin(s * 0.045) * 6;
      pts.push(track.toWorld(s, d, new THREE.Vector3()).add(new THREE.Vector3(0, 1.5, 0)));
    }
    const hose = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 2.1, 10), mats.hose);
    hose.castShadow = true;
    group.add(hose);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.6, 9, 12), mats.metal);
    nozzle.position.copy(pts[pts.length - 1]);
    nozzle.rotation.set(Math.PI / 2, 0, track.heading(hoseEnd));
    group.add(nozzle);
  }
  // Rake lying beside the course.
  for (const lm of marks('rake')) {
    const rake = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 130, 10), mats.woodDark);
    handle.rotation.x = Math.PI / 2;
    const head = new THREE.Mesh(new THREE.BoxGeometry(34, 1.6, 2.4), mats.metal);
    head.position.z = -65;
    rake.add(handle, head);
    for (let i = -7; i <= 7; i += 1) {
      const tine = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.25, 7, 6), mats.metal);
      tine.position.set(i * 2.25, 3, -65);
      rake.add(tine);
    }
    track.toWorld(lm.s, lm.d, rake.position);
    rake.position.y += 1.6;
    rake.rotation.y = -track.heading(lm.s) + 0.12;
    rake.traverse((o) => (o.castShadow = true));
    group.add(rake);
  }
  // Terracotta pots by the banked curves.
  const potGeo = new THREE.LatheGeometry(
    [new THREE.Vector2(0.01, 0), new THREE.Vector2(9, 0), new THREE.Vector2(12.5, 17), new THREE.Vector2(13.6, 17.4), new THREE.Vector2(13.6, 20.5), new THREE.Vector2(12, 20.5), new THREE.Vector2(11.4, 18)],
    24,
  );
  const potLeaf = paint(frond.clone(), new THREE.Color().setHSL(0.3, 0.6, 0.38), 0.3);
  for (const lm of marks('pot', 'potTipped')) {
    const { s, d } = lm;
    const tip = lm.kind === 'potTipped';
    const pot = new THREE.Mesh(potGeo, mats.terracotta);
    track.toWorld(s, d, pot.position);
    pot.position.y -= 2;
    if (tip) {
      pot.rotation.z = 1.35;
      pot.position.y += 12;
    } else {
      const soil = new THREE.Mesh(new THREE.CircleGeometry(11.6, 20).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 1 }));
      soil.position.y = 18.4;
      pot.add(soil);
      for (let k = 0; k < 9; k += 1) {
        const leaf = new THREE.Mesh(potLeaf, mats.veg);
        leaf.scale.setScalar(9 + (k % 3) * 2);
        leaf.position.y = 22 + (k % 3) * 2;
        leaf.rotation.set(0, (k / 9) * 6.28, 0.7 + (k % 3) * 0.25);
        pot.add(leaf);
      }
    }
    pot.castShadow = true;
    group.add(pot);
  }

  // --- boost pads: glowing chevron strips laid on the ground
  const chevrons = createChevronTexture();
  const padMat = new THREE.MeshBasicMaterial({ map: chevrons, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, toneMapped: false });
  {
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (const pad of track.pads) {
      const base = pos.length / 3;
      const rowsN = 8;
      for (let i = 0; i <= rowsN; i += 1) {
        const s = pad.s0 + ((pad.s1 - pad.s0) * i) / rowsN;
        for (let j = 0; j <= 4; j += 1) {
          const d = pad.d - pad.half + (pad.half * 2 * j) / 4;
          track.toWorld(s, d, v);
          pos.push(v.x, v.y + 0.07, v.z);
          uv.push(j / 4, (s - pad.s0) / 4);
        }
        if (i < rowsN) {
          for (let j = 0; j < 4; j += 1) {
            const a0 = base + i * 5 + j;
            idx.push(a0, a0 + 1, a0 + 5, a0 + 1, a0 + 6, a0 + 5);
          }
        }
      }
    }
    if (idx.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      const mesh = new THREE.Mesh(geo, padMat);
      mesh.renderOrder = 2;
      mesh.name = 'boostPads';
      group.add(mesh);
    }
  }

  // --- butterflies: a little life in the air
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.bezierCurveTo(0.2, 0.9, 1.1, 1.0, 1.0, 0.2);
  wingShape.bezierCurveTo(1.0, -0.5, 0.3, -0.6, 0, 0);
  const wingGeo = new THREE.ShapeGeometry(wingShape, 5).rotateX(-Math.PI / 2);
  const flyers: { root: THREE.Group; l: THREE.Mesh; r: THREE.Mesh; anchor: THREE.Vector3; phase: number; radius: number }[] = [];
  const wingColors = [0xffd23a, 0xff8fd0, 0x6fd0ff, 0xffa23a, 0xffffff];
  const fireflies = !!track.def.theme.fireflies;
  const flyerCount = fireflies ? 46 : 16;
  for (let i = 0; i < flyerCount; i += 1) {
    const s = 30 + (i / flyerCount) * (track.length - 60) + rng() * 40;
    const anchor = track.toWorld(s, (rng() * 2 - 1) * 16, new THREE.Vector3());
    anchor.y += 4 + rng() * 5;
    const mat = fireflies
      ? new THREE.MeshBasicMaterial({ color: 0xfff27a, side: THREE.DoubleSide })
      : new THREE.MeshStandardMaterial({ color: wingColors[i % wingColors.length], side: THREE.DoubleSide, roughness: 0.7 });
    const root = new THREE.Group();
    const l = new THREE.Mesh(wingGeo, mat);
    const r = new THREE.Mesh(wingGeo, mat);
    r.scale.x = -1;
    root.add(l, r);
    root.scale.setScalar(fireflies ? 0.22 + rng() * 0.12 : 0.9 + rng() * 0.6);
    group.add(root);
    flyers.push({ root, l, r, anchor, phase: rng() * 10, radius: 3 + rng() * 5 });
  }

  return {
    group,
    update(time: number) {
      windUniform.value = time;
      chevrons.offset.y = -time * 1.6;
      for (const f of flyers) {
        const t = time * 0.6 + f.phase;
        f.root.position.set(f.anchor.x + Math.cos(t) * f.radius, f.anchor.y + Math.sin(t * 2.3) * 1.2, f.anchor.z + Math.sin(t * 0.8) * f.radius);
        f.root.rotation.y = -t + Math.PI / 2;
        const flap = Math.sin(time * 16 + f.phase) * 0.9;
        f.l.rotation.z = flap;
        f.r.rotation.z = -flap;
      }
    },
  };
}
