import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COURT } from '../config.js';
import {
  createBoardTexture,
  createBrickTexture,
  createMuralTexture,
  createPlasterTexture,
} from './ProceduralTextures.js';
import { normalizeForMerge, paint, place, worldBox } from './geometry.js';

const L = COURT.halfLength;
const W = COURT.halfWidth;

// Painted-render palette of a Rio/São Paulo hillside: saturated but sun-faded.
const WALL_COLORS = [
  '#f2c14e', '#f78154', '#4d9de0', '#e15554', '#7bc950', '#3bb273', '#e1bc29', '#f4a259',
  '#bc4b51', '#5b8e7d', '#8cb369', '#f4e285', '#ff9f80', '#9ad1d4', '#e9d8a6', '#ee9b00',
];
const SHUTTER_COLORS = ['#2a9d8f', '#e76f51', '#264653', '#f4a261', '#1d4fa3', '#c8102e', '#fefae0'];

/**
 * Everything outside the cage. Repeated pieces are merged per material or
 * instanced, so the whole neighbourhood costs roughly 20 draw calls.
 */
export function buildNeighborhood(scene, rng, quality, shared = {}) {
  const group = new THREE.Group();
  group.name = 'neighborhood';
  scene.add(group);

  const plasterTex = createPlasterTexture(rng);
  const brickTex = createBrickTexture(rng);
  // Shop signs reuse the court's sponsor atlas (one texture, not two).
  const signTex = shared.boardTexture ?? createBoardTexture(rng);
  const plaster = [];
  const bricks = [];
  const concrete = [];
  const signs = [];
  const windows = [];
  const shutters = [];
  const acUnits = [];
  const tanks = [];
  const rebar = [];
  const dark = [];

  // --- Sidewalks and streets ----------------------------------------------
  const curb = (x, z, w, d) => concrete.push(paint(place(worldBox(w, 0.16, d, 2), x, 0.08, z), '#b8b2a6'));
  curb(0, W + 2.2, 70, 3.2);
  curb(0, -W - 2.2, 70, 3.2);
  curb(L + 3.2, 0, 3.2, W * 2 + 7.6);
  curb(-L - 3.2, 0, 3.2, W * 2 + 7.6);

  /**
   * A stacked house. face: direction the facade faces (+1 = -Z toward court
   * when placed on the far side, etc). Built in local space facing +Z, then rotated.
   */
  const house = (x, z, ry, opts = {}) => {
    const floors = opts.floors ?? 2 + Math.floor(rng() * 3);
    const w = opts.width ?? 4 + rng() * 3.5;
    const d = opts.depth ?? 6 + rng() * 3;
    const fh = 2.9;
    const color = rng.pick(WALL_COLORS);
    const parts = [];
    const brickParts = [];
    const localWindows = [];
    const localShutters = [];
    const localAc = [];
    const localTanks = [];
    const localRebar = [];
    const localSigns = [];
    const localConcrete = [];
    let height = 0;
    for (let f = 0; f < floors; f += 1) {
      // Upper floors are often unfinished brick, slightly offset.
      const unfinished = f > 0 && rng() < 0.32;
      const off = f > 0 ? (rng() - 0.5) * 0.6 : 0;
      const fw = w + (f > 0 ? (rng() - 0.5) * 0.8 : 0);
      const geo = place(worldBox(fw, fh, d, 2.5), off, height + fh / 2, 0);
      if (unfinished) brickParts.push(geo);
      else parts.push(paint(geo, color));
      // Floor slab lip.
      localConcrete.push(paint(place(worldBox(fw + 0.3, 0.18, d + 0.3, 2), off, height + fh, 0), '#a9a296'));
      // Windows on the facade (+Z face).
      const nWin = Math.max(1, Math.floor(fw / 1.9));
      for (let i = 0; i < nWin; i += 1) {
        const wx = off - fw / 2 + (fw / nWin) * (i + 0.5);
        const isDoor = f === 0 && i === 0 && !opts.shop;
        const wy = height + (isDoor ? 1.05 : 1.55);
        const wh = isDoor ? 2.05 : 1.15;
        const ww = isDoor ? 0.95 : 0.95 + rng() * 0.3;
        localWindows.push({ x: wx, y: wy, z: d / 2 + 0.02, w: ww, h: wh });
        if (!isDoor && rng() < 0.55) {
          localShutters.push({ x: wx - ww / 2 - 0.22, y: wy, z: d / 2 + 0.06, h: wh, c: rng.pick(SHUTTER_COLORS) });
          localShutters.push({ x: wx + ww / 2 + 0.22, y: wy, z: d / 2 + 0.06, h: wh, c: rng.pick(SHUTTER_COLORS) });
        }
        if (!isDoor && rng() < 0.22) localAc.push({ x: wx, y: wy - wh / 2 - 0.32, z: d / 2 + 0.25 });
      }
      // Balcony with railing on some upper floors.
      if (f > 0 && rng() < 0.4) {
        parts.push(paint(place(worldBox(fw * 0.7, 0.14, 1.0, 2), off, height + 0.07, d / 2 + 0.5), '#bdb5a7'));
        parts.push(paint(place(worldBox(fw * 0.7, 0.9, 0.06, 2), off, height + 0.5, d / 2 + 0.98), rng.pick(['#e8e4da', '#2a9d8f', '#264653'])));
      }
      height += fh + 0.18;
    }
    // Ground floor shop: roll-up door, awning and sign.
    if (opts.shop) {
      localConcrete.push(paint(place(worldBox(w * 0.7, 2.3, 0.08, 1), 0, 1.15, d / 2 + 0.04), '#8a8f91'));
      parts.push(paint(place(worldBox(w * 0.85, 0.08, 1.3, 2), 0, 2.75, d / 2 + 0.6, 0, -0.25), rng.pick(['#c8102e', '#1f8a4c', '#1d4fa3', '#f6c915'])));
      localSigns.push({ x: 0, y: 3.15, z: d / 2 + 0.06, w: w * 0.85, h: 0.6 });
    }
    // Roof: parapet, water tank, rebar sticking up for the next floor.
    localConcrete.push(paint(place(worldBox(w + 0.1, 0.4, d + 0.1, 2), 0, height + 0.2, 0), '#9e978b'));
    if (rng() < 0.75) localTanks.push({ x: (rng() - 0.5) * (w - 1.5), y: height + 0.4, z: (rng() - 0.5) * (d - 2) });
    if (rng() < 0.5) {
      for (const cx of [-w / 2 + 0.2, w / 2 - 0.2]) for (const cz of [-d / 2 + 0.2, d / 2 - 0.2]) localRebar.push({ x: cx, y: height + 0.4, z: cz });
    }

    // Transform locals into world space.
    const m = new THREE.Matrix4().makeRotationY(ry).setPosition(x, 0, z);
    for (const g of parts) plaster.push(g.applyMatrix4(m));
    for (const g of brickParts) bricks.push(g.applyMatrix4(m));
    for (const g of localConcrete) concrete.push(g.applyMatrix4(m));
    const v = new THREE.Vector3();
    const toWorld = (o) => v.set(o.x, o.y, o.z).applyMatrix4(m).clone();
    for (const o of localWindows) windows.push({ p: toWorld(o), w: o.w, h: o.h, ry });
    for (const o of localShutters) shutters.push({ p: toWorld(o), h: o.h, ry, c: o.c });
    for (const o of localAc) acUnits.push({ p: toWorld(o), ry });
    for (const o of localTanks) tanks.push({ p: toWorld(o) });
    for (const o of localRebar) rebar.push({ p: toWorld(o) });
    for (const o of localSigns) {
      const sg = new THREE.PlaneGeometry(o.w, o.h);
      const row = Math.floor(rng() * 6);
      const uv = sg.attributes.uv;
      for (let k = 0; k < uv.count; k += 1) uv.setY(k, (row + uv.getY(k)) / 6);
      signs.push(place(sg, o.x, o.y, o.z).applyMatrix4(m));
    }
    return { height, width: w };
  };

  // Far side (+Z): a continuous street front of houses and shops facing the court.
  const streetFront = (zLine, ry, xFrom, xTo, shopChance) => {
    let x = xFrom;
    while (x < xTo) {
      const w = 4 + rng() * 3.2;
      house(x + w / 2, zLine, ry, { width: w, shop: rng() < shopChance });
      x += w + 0.05;
    }
  };
  streetFront(W + 13, Math.PI, -34, 34, 0.35);
  // A second, taller row stepping up behind.
  {
    let x = -36;
    while (x < 36) {
      const w = 4.5 + rng() * 3;
      house(x + w / 2, W + 22 + rng() * 2, Math.PI, { width: w, floors: 3 + Math.floor(rng() * 3) });
      x += w + 0.4;
    }
  }
  // Behind the camera side (-Z): one row, mostly unseen but visible on turns.
  streetFront(-W - 18, 0, -34, 34, 0.25);
  // Ends (±X): side streets.
  for (const s of [-1, 1]) {
    let z = -W - 6;
    while (z < W + 6) {
      const w = 4 + rng() * 3;
      house(s * (L + 13), z + w / 2, s > 0 ? -Math.PI / 2 : Math.PI / 2, { width: w, shop: rng() < 0.25 });
      z += w + 0.1;
    }
  }

  // --- Murals behind each goal and on the far street -----------------------
  const muralWords = ['CRAQUE', 'RUA 10', 'GOL!', 'VILA', 'FÉ'];
  const murals = [];
  const muralWall = (x, z, ry, w, h, word) => {
    const wall = place(worldBox(w, h, 0.4, 2.5), x, h / 2, z, ry);
    plaster.push(paint(wall, '#d9d2c5'));
    const tex = createMuralTexture(rng, word);
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(w - 0.2, h - 0.2),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }),
    );
    const n = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
    plane.position.set(x + n.x * 0.21, h / 2, z + n.z * 0.21);
    plane.rotation.y = ry;
    plane.receiveShadow = true;
    group.add(plane);
    murals.push(plane);
  };
  muralWall(L + 5.2, 0, -Math.PI / 2, 14, 4.2, muralWords[0]);
  muralWall(-L - 5.2, 0, Math.PI / 2, 14, 4.2, muralWords[1]);
  muralWall(-8, W + 6.4, Math.PI, 9, 2.6, muralWords[2]);
  muralWall(11, W + 6.4, Math.PI, 7, 2.6, muralWords[3]);

  // --- Power poles and sagging cables --------------------------------------
  const poleTops = [];
  for (let x = -30; x <= 30; x += 10) {
    const z = W + 3.6;
    dark.push(place(new THREE.CylinderGeometry(0.12, 0.17, 8, 8), x, 4, z));
    dark.push(place(new THREE.BoxGeometry(1.6, 0.1, 0.1), x, 7.6, z));
    poleTops.push(new THREE.Vector3(x, 7.55, z));
  }
  for (let i = 0; i < poleTops.length - 1; i += 1) {
    for (const off of [-0.6, 0, 0.6]) {
      const a = poleTops[i].clone().add(new THREE.Vector3(off, 0, 0));
      const b = poleTops[i + 1].clone().add(new THREE.Vector3(off, 0, 0));
      const mid = a.clone().lerp(b, 0.5);
      mid.y -= 0.9 + rng() * 0.3;
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      dark.push(new THREE.TubeGeometry(curve, 12, 0.018, 4, false));
    }
    // A cable dropping to a house (the classic tangle).
    const a = poleTops[i].clone();
    const b = new THREE.Vector3(a.x + 3, 5.5, W + 9.5);
    const mid = a.clone().lerp(b, 0.5);
    mid.y -= 0.6;
    dark.push(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 10, 0.015, 4, false));
  }
  // Laundry lines between far houses.
  const laundry = [];
  for (let i = 0; i < 7; i += 1) {
    const x0 = -26 + i * 8 + rng() * 3;
    const y = 4 + rng() * 3;
    const z = W + 9.6;
    const a = new THREE.Vector3(x0, y, z);
    const b = new THREE.Vector3(x0 + 3.5, y + (rng() - 0.5) * 0.4, z);
    const mid = a.clone().lerp(b, 0.5);
    mid.y -= 0.25;
    dark.push(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 8, 0.01, 3, false));
    for (let k = 0; k < 4; k += 1) {
      const t = 0.15 + k * 0.22;
      const p = new THREE.QuadraticBezierCurve3(a, mid, b).getPoint(t);
      const cloth = place(new THREE.PlaneGeometry(0.45, 0.6), p.x, p.y - 0.32, p.z - 0.02, Math.PI);
      laundry.push(paint(cloth, rng.pick(['#ffffff', '#f6c915', '#c8102e', '#1d4fa3', '#1f8a4c', '#e8338b'])));
    }
  }

  // --- Palms at the corners --------------------------------------------------
  const trunk = [];
  const fronds = [];
  for (const [px, pz] of [[-L - 4, W + 3.8], [L + 4.5, W + 4], [L + 4, -W - 3.5]]) {
    const pts = [];
    const lean = (rng() - 0.5) * 1.4;
    for (let i = 0; i <= 8; i += 1) pts.push(new THREE.Vector3(px + lean * (i / 8) ** 2, i * 1.05, pz + lean * 0.4 * (i / 8) ** 2));
    const curve = new THREE.CatmullRomCurve3(pts);
    trunk.push(new THREE.TubeGeometry(curve, 16, 0.17, 7, false));
    const top = pts[pts.length - 1];
    for (let f = 0; f < 9; f += 1) {
      const a = (f / 9) * Math.PI * 2 + rng() * 0.3;
      const leaf = new THREE.PlaneGeometry(0.7, 3.4, 1, 6);
      // Arch the frond downward.
      const pos = leaf.attributes.position;
      for (let k = 0; k < pos.count; k += 1) {
        const y = pos.getY(k) + 1.7;
        pos.setXYZ(k, pos.getX(k) * (1 - y / 4), y, -0.12 * y * y);
      }
      leaf.rotateX(-0.9);
      leaf.rotateY(a);
      leaf.translate(top.x, top.y, top.z);
      fronds.push(paint(leaf, rng.pick(['#3f7d20', '#4c8c2b', '#2f6b1a'])));
    }
  }

  // --- Hillside favela --------------------------------------------------------
  const hillCount = quality === 'low' ? 380 : 760;
  const hillGeo = new THREE.BoxGeometry(1, 1, 1);
  hillGeo.translate(0, 0.5, 0);
  const hillMat = new THREE.MeshStandardMaterial({ map: createHillWindowTexture(), roughness: 0.9 });
  const hill = new THREE.InstancedMesh(hillGeo, hillMat, hillCount);
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  for (let i = 0; i < hillCount; i += 1) {
    const x = (rng() - 0.5) * 180;
    const z = 45 + rng() * 75;
    const ground = Math.max(0, (z - 40) * 0.42 - Math.abs(x) * 0.05 + Math.sin(x * 0.05) * 6);
    const w = 3 + rng() * 4;
    const h = 3 + rng() * 6;
    const d = 3 + rng() * 4;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (rng() - 0.5) * 0.5);
    mtx.compose(new THREE.Vector3(x, ground - 1, z), q, new THREE.Vector3(w, h + 1, d));
    hill.setMatrixAt(i, mtx);
    col.set(rng() < 0.25 ? '#b5653f' : rng.pick(WALL_COLORS)).multiplyScalar(0.9);
    hill.setColorAt(i, col);
  }
  hill.instanceMatrix.needsUpdate = true;
  hill.instanceColor.needsUpdate = true;
  group.add(hill);
  // The hill itself.
  const hillGround = new THREE.Mesh(
    new THREE.PlaneGeometry(260, 140, 40, 20),
    new THREE.MeshStandardMaterial({ color: '#6f6a52', roughness: 1 }),
  );
  hillGround.rotation.x = -Math.PI / 2;
  {
    const pos = hillGround.geometry.attributes.position;
    for (let k = 0; k < pos.count; k += 1) {
      const x = pos.getX(k);
      const z = -pos.getY(k) + 82; // after rotation, plane Y maps to -Z
      const h = Math.max(0, (z - 40) * 0.42 - Math.abs(x) * 0.05 + Math.sin(x * 0.05) * 6) - 1.2;
      pos.setZ(k, h);
    }
    hillGround.geometry.computeVertexNormals();
  }
  hillGround.position.z = 82;
  group.add(hillGround);
  // Granite peaks on the horizon.
  const rock = new THREE.MeshStandardMaterial({ color: '#7d8a8f', roughness: 1, flatShading: true });
  for (const [x, z, s, h] of [[-120, 230, 70, 120], [40, 260, 90, 95], [150, 220, 60, 140], [-30, 300, 120, 70]]) {
    const g = new THREE.SphereGeometry(1, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    const peak = new THREE.Mesh(g, rock);
    peak.scale.set(s, h, s * 0.8);
    peak.position.set(x, -4, z);
    group.add(peak);
  }

  // --- Commit merged meshes ---------------------------------------------------
  const add = (geos, material, { shadow = true, receive = true, color = true } = {}) => {
    if (!geos.length) return null;
    const mesh = new THREE.Mesh(mergeGeometries(normalizeForMerge(geos, { color })), material);
    mesh.castShadow = shadow;
    mesh.receiveShadow = receive;
    group.add(mesh);
    return mesh;
  };
  add(plaster, new THREE.MeshStandardMaterial({ map: plasterTex, vertexColors: true, roughness: 0.92 }));
  add(bricks, new THREE.MeshStandardMaterial({ map: brickTex, roughness: 0.95 }), { color: false });
  add(concrete, new THREE.MeshStandardMaterial({ map: plasterTex, vertexColors: true, roughness: 0.95 }));
  add(signs, new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.6, emissive: '#ffffff', emissiveMap: signTex, emissiveIntensity: 0.12 }), { shadow: false, color: false });
  add(dark, new THREE.MeshStandardMaterial({ color: '#2a2724', roughness: 0.8 }), { color: false, receive: false });
  add(laundry, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 }), { shadow: false });
  add(trunk, new THREE.MeshStandardMaterial({ color: '#7a6248', roughness: 1 }), { color: false });
  add(fronds, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 }));

  // Instanced details.
  const inst = (geo, mat, list, setter, shadow = false) => {
    if (!list.length) return null;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    const mm = new THREE.Matrix4();
    list.forEach((o, i) => {
      setter(mm, o);
      im.setMatrixAt(i, mm);
      if (o.c) im.setColorAt(i, new THREE.Color(o.c));
    });
    im.castShadow = shadow;
    im.receiveShadow = true;
    group.add(im);
    return im;
  };
  const S = new THREE.Vector3();
  const P = new THREE.Vector3();
  const Q = new THREE.Quaternion();
  const UPV = new THREE.Vector3(0, 1, 0);
  const frameGeo = new THREE.BoxGeometry(1, 1, 0.12);
  inst(frameGeo, new THREE.MeshStandardMaterial({ color: '#e9e5dc', roughness: 0.6 }), windows, (mm, o) => {
    mm.compose(P.copy(o.p), Q.setFromAxisAngle(UPV, o.ry), S.set(o.w + 0.16, o.h + 0.16, 1));
  });
  const glassGeo = new THREE.PlaneGeometry(1, 1);
  const glassMat = new THREE.MeshStandardMaterial({ color: '#1d2a33', roughness: 0.15, metalness: 0.6, emissive: '#3a2c18', emissiveIntensity: 0.25 });
  const glassList = windows.map((o) => {
    const n = new THREE.Vector3(0, 0, 1).applyAxisAngle(UPV, o.ry);
    return { ...o, p: o.p.clone().addScaledVector(n, 0.065), c: rng() < 0.2 ? '#6b5636' : '#ffffff' };
  });
  inst(glassGeo, glassMat, glassList, (mm, o) => {
    mm.compose(P.copy(o.p), Q.setFromAxisAngle(UPV, o.ry), S.set(o.w, o.h, 1));
  });
  inst(new THREE.BoxGeometry(0.42, 1, 0.05), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.75 }), shutters, (mm, o) => {
    mm.compose(P.copy(o.p), Q.setFromAxisAngle(UPV, o.ry), S.set(1, o.h, 1));
  });
  inst(new THREE.BoxGeometry(0.8, 0.5, 0.45), new THREE.MeshStandardMaterial({ color: '#d9dbd6', roughness: 0.5, metalness: 0.2 }), acUnits, (mm, o) => {
    mm.compose(P.copy(o.p), Q.setFromAxisAngle(UPV, o.ry), S.set(1, 1, 1));
  }, true);
  const tankGeo = new THREE.CylinderGeometry(0.62, 0.55, 0.9, 16);
  tankGeo.translate(0, 0.45, 0);
  inst(tankGeo, new THREE.MeshStandardMaterial({ color: '#2f6fb3', roughness: 0.45 }), tanks, (mm, o) => {
    mm.compose(P.copy(o.p), Q.identity(), S.set(1, 1, 1));
  }, true);
  const rebarGeo = new THREE.CylinderGeometry(0.02, 0.02, 1.1, 4);
  rebarGeo.translate(0, 0.55, 0);
  inst(rebarGeo, new THREE.MeshStandardMaterial({ color: '#6b3e26', roughness: 0.9, metalness: 0.4 }), rebar, (mm, o) => {
    mm.compose(P.copy(o.p), Q.identity(), S.set(1, 1, 1));
  });

  return { group, murals };
}

function createHillWindowTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#3a3a3a';
  for (let y = 10; y < 60; y += 22) for (let x = 8; x < 60; x += 20) g.fillRect(x, y, 9, 10);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(0, 0, 64, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
