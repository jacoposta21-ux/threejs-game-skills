import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COURT } from '../config.js';
import {
  createAsphaltTexture,
  createBoardTexture,
  createChainLinkTexture,
  createCourtTextures,
  createNetTexture,
} from './ProceduralTextures.js';
import { normalizeForMerge, paint, place, worldBox } from './geometry.js';

const L = COURT.halfLength;
const W = COURT.halfWidth;
const GW = COURT.goalHalfWidth;
const GH = COURT.goalHeight;
const GD = COURT.goalDepth;
const BOARD_T = 0.14;
const BOARD_X = L + 0.25; // end boards sit just behind the goal line
const BOARD_Z = W + 0.3;

/**
 * The playing area: surface, kickboards, chain-link cage, goals, lights.
 * Builds both the visuals (merged by material to keep draw calls low) and the
 * Rapier colliders. Returns handles the game needs (near fence material).
 */
export function buildCourt(scene, physics, rng) {
  const group = new THREE.Group();
  group.name = 'court';
  scene.add(group);

  // --- Surfaces -----------------------------------------------------------
  const court = createCourtTextures(rng);
  const courtMat = new THREE.MeshStandardMaterial({
    map: court.map,
    roughnessMap: court.roughnessMap,
    roughness: 1,
    metalness: 0,
  });
  const slab = new THREE.Mesh(new THREE.PlaneGeometry(court.size[0], court.size[1]), courtMat);
  slab.rotation.x = -Math.PI / 2;
  slab.receiveShadow = true;
  slab.name = 'courtSurface';
  group.add(slab);

  const asphalt = createAsphaltTexture(rng);
  asphalt.repeat.set(40, 40);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 160),
    new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.95, color: '#a59f97' }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.015;
  ground.receiveShadow = true;
  group.add(ground);

  physics.addStaticBox(0, -0.5, 0, 80, 0.5, 80, { restitution: 0.62, friction: 0.7, tag: { type: 'ground' } });
  // Cage ceiling so lofted balls always come back.
  physics.addStaticBox(0, COURT.cageHeight + 0.5, 0, L + 3, 0.5, W + 3, { restitution: 0.3, tag: { type: 'fence' } });

  // --- Kickboards with sponsor banners -------------------------------------
  const boardTex = createBoardTexture(rng);
  const rows = boardTex.userData.rows;
  const frames = [];
  const banners = [];
  const addBoard = (x0, z0, x1, z1, inward) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const ry = alongX ? 0 : Math.PI / 2;
    frames.push(paint(place(worldBox(len, COURT.boardHeight, BOARD_T), cx, COURT.boardHeight / 2, cz, ry), '#1c3b2a'));
    // Collider (boards are solid and bouncy).
    physics.addStaticBox(cx, COURT.boardHeight / 2, cz, alongX ? len / 2 : BOARD_T / 2, COURT.boardHeight / 2, alongX ? BOARD_T / 2 : len / 2, {
      restitution: 0.64,
      friction: 0.4,
      tag: { type: 'board' },
    });
    // Banner panels on the inner face, ~4 m each.
    const n = Math.max(1, Math.round(len / 4));
    for (let i = 0; i < n; i += 1) {
      const seg = len / n;
      const p = new THREE.PlaneGeometry(seg - 0.06, COURT.boardHeight * 0.84);
      const row = Math.floor(rng() * rows);
      const uv = p.attributes.uv;
      for (let k = 0; k < uv.count; k += 1) uv.setY(k, (row + uv.getY(k)) / rows);
      const t = -len / 2 + seg * (i + 0.5);
      const off = BOARD_T / 2 + 0.006;
      if (alongX) {
        // inward = +1 faces +Z
        place(p, cx + t, COURT.boardHeight / 2, cz + off * inward, inward > 0 ? 0 : Math.PI);
      } else {
        place(p, cx, COURT.boardHeight / 2, cz + t, inward > 0 ? Math.PI / 2 : -Math.PI / 2);
      }
      banners.push(p);
    }
  };
  addBoard(-BOARD_X, -BOARD_Z, BOARD_X, -BOARD_Z, 1);
  addBoard(-BOARD_X, BOARD_Z, BOARD_X, BOARD_Z, -1);
  for (const s of [-1, 1]) {
    addBoard(s * BOARD_X, -BOARD_Z, s * BOARD_X, -GW - 0.12, -s);
    addBoard(s * BOARD_X, GW + 0.12, s * BOARD_X, BOARD_Z, -s);
  }
  const frameMesh = new THREE.Mesh(
    mergeGeometries(normalizeForMerge(frames)),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1 }),
  );
  frameMesh.castShadow = true;
  frameMesh.receiveShadow = true;
  group.add(frameMesh);
  const bannerMesh = new THREE.Mesh(
    mergeGeometries(normalizeForMerge(banners, { color: false })),
    new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.62, metalness: 0.05 }),
  );
  bannerMesh.receiveShadow = true;
  group.add(bannerMesh);

  // --- Chain-link cage ----------------------------------------------------
  const linkTex = createChainLinkTexture();
  const fenceTop = COURT.fenceHeight;
  const fenceH = fenceTop - COURT.boardHeight;
  const fenceY = COURT.boardHeight + fenceH / 2;
  const mesh = (len, x, z, ry) => {
    const p = new THREE.PlaneGeometry(len, fenceH);
    const uv = p.attributes.uv;
    for (let k = 0; k < uv.count; k += 1) uv.setXY(k, (uv.getX(k) * len) / 0.32, (uv.getY(k) * fenceH) / 0.32);
    return place(p, x, fenceY, z, ry);
  };
  const farFence = [];
  const nearFence = [];
  farFence.push(mesh(BOARD_X * 2, 0, BOARD_Z, 0));
  nearFence.push(mesh(BOARD_X * 2, 0, -BOARD_Z, 0));
  // End fences: two side panels plus a panel above the recessed goal mouth.
  const sideLen = BOARD_Z - (GW + 0.12);
  const meshAt = (len, h, x, y, z, ry) => {
    const p = new THREE.PlaneGeometry(len, h);
    const uv = p.attributes.uv;
    for (let k = 0; k < uv.count; k += 1) uv.setXY(k, (uv.getX(k) * len) / 0.32, (uv.getY(k) * h) / 0.32);
    return place(p, x, y, z, ry);
  };
  const overGoalH = fenceTop - (GH + 0.1);
  for (const s of [-1, 1]) {
    for (const sz of [-1, 1]) farFence.push(meshAt(sideLen, fenceH, s * BOARD_X, fenceY, sz * (GW + 0.12 + sideLen / 2), Math.PI / 2));
    farFence.push(meshAt((GW + 0.12) * 2, overGoalH, s * BOARD_X, GH + 0.1 + overGoalH / 2, 0, Math.PI / 2));
  }
  const linkMat = new THREE.MeshStandardMaterial({
    map: linkTex,
    transparent: true,
    side: THREE.DoubleSide,
    roughness: 0.4,
    metalness: 0.7,
    depthWrite: false,
    alphaTest: 0.02,
  });
  const farMesh = new THREE.Mesh(mergeGeometries(normalizeForMerge(farFence, { color: false })), linkMat);
  farMesh.renderOrder = 1;
  group.add(farMesh);
  const nearMat = linkMat.clone();
  nearMat.opacity = 0.32;
  const nearMesh = new THREE.Mesh(mergeGeometries(normalizeForMerge(nearFence, { color: false })), nearMat);
  nearMesh.renderOrder = 1;
  group.add(nearMesh);

  // Fence colliders: from board top to the cage ceiling.
  const cageH = COURT.cageHeight - COURT.boardHeight;
  const cageY = COURT.boardHeight + cageH / 2;
  const fence = { restitution: 0.32, friction: 0.5, tag: { type: 'fence' } };
  for (const s of [-1, 1]) {
    physics.addStaticBox(0, cageY, s * BOARD_Z, BOARD_X, cageH / 2, 0.05, fence);
    // End fences: beside the goal from board height, above the goal from the crossbar.
    for (const sz of [-1, 1]) {
      physics.addStaticBox(s * BOARD_X, cageY, sz * (GW + 0.12 + sideLen / 2), 0.05, cageH / 2, sideLen / 2, fence);
    }
    const overH = COURT.cageHeight - (GH + 0.1);
    physics.addStaticBox(s * BOARD_X, GH + 0.1 + overH / 2, 0, 0.05, overH / 2, GW + 0.12, fence);
  }

  // Posts and rails (galvanised steel).
  const steel = new THREE.MeshStandardMaterial({ color: '#9aa1a3', roughness: 0.35, metalness: 0.8 });
  const postGeo = new THREE.CylinderGeometry(0.045, 0.05, fenceTop, 8);
  const postPositions = [];
  for (let x = -BOARD_X; x <= BOARD_X + 0.01; x += (BOARD_X * 2) / 10) {
    postPositions.push([x, BOARD_Z], [x, -BOARD_Z]);
  }
  for (let z = -BOARD_Z + (BOARD_Z * 2) / 6; z < BOARD_Z - 0.01; z += (BOARD_Z * 2) / 6) {
    postPositions.push([BOARD_X, z], [-BOARD_X, z]);
  }
  // Steel on the camera side fades with the near chain-link so it never hides play.
  const nearSteel = steel.clone();
  nearSteel.transparent = true;
  nearSteel.opacity = 0.22;
  nearSteel.depthWrite = false;
  const farPosts = postPositions.filter(([, z]) => z > -BOARD_Z + 0.01);
  const nearPosts = postPositions.filter(([, z]) => z <= -BOARD_Z + 0.01);
  const m = new THREE.Matrix4();
  for (const [list, mat] of [[farPosts, steel], [nearPosts, nearSteel]]) {
    const posts = new THREE.InstancedMesh(postGeo, mat, list.length);
    list.forEach(([x, z], i) => {
      m.makeTranslation(x, fenceTop / 2, z);
      posts.setMatrixAt(i, m);
    });
    posts.castShadow = mat === steel;
    group.add(posts);
  }
  const rails = [];
  const nearRails = [];
  for (const y of [fenceTop, COURT.boardHeight + 0.05]) {
    rails.push(place(new THREE.CylinderGeometry(0.035, 0.035, BOARD_X * 2, 8), 0, y, BOARD_Z, 0, 0, Math.PI / 2));
    nearRails.push(place(new THREE.CylinderGeometry(0.035, 0.035, BOARD_X * 2, 8), 0, y, -BOARD_Z, 0, 0, Math.PI / 2));
    for (const s of [-1, 1]) {
      rails.push(place(new THREE.CylinderGeometry(0.035, 0.035, BOARD_Z * 2, 8), s * BOARD_X, y, 0, 0, Math.PI / 2));
    }
  }
  const railMesh = new THREE.Mesh(mergeGeometries(normalizeForMerge(rails, { color: false })), steel);
  railMesh.castShadow = true;
  group.add(railMesh);
  const nearRailMesh = new THREE.Mesh(mergeGeometries(normalizeForMerge(nearRails, { color: false })), nearSteel);
  nearRailMesh.renderOrder = 1;
  group.add(nearRailMesh);

  // --- Goals ----------------------------------------------------------------
  const goalFrames = [];
  const nets = [];
  const netTex = createNetTexture();
  const R = 0.055;
  for (const s of [-1, 1]) {
    const gx = s * L;
    const bx = s * (L + GD);
    for (const z of [-GW, GW]) {
      goalFrames.push(place(new THREE.CylinderGeometry(R, R, GH, 12), gx, GH / 2, z));
      goalFrames.push(place(new THREE.CylinderGeometry(R * 0.7, R * 0.7, GH, 8), bx, GH / 2, z));
      goalFrames.push(place(new THREE.CylinderGeometry(R * 0.7, R * 0.7, GD, 8), (gx + bx) / 2, GH, z, 0, 0, Math.PI / 2));
      goalFrames.push(place(new THREE.CylinderGeometry(R * 0.6, R * 0.6, GD, 8), (gx + bx) / 2, 0.03, z, 0, 0, Math.PI / 2));
      physics.addStaticCylinder(gx, GH / 2, z, GH / 2, R, { restitution: 0.6, tag: { type: 'post' } });
    }
    goalFrames.push(place(new THREE.CylinderGeometry(R, R, GW * 2 + R * 2, 12), gx, GH, 0, 0, Math.PI / 2));
    goalFrames.push(place(new THREE.CylinderGeometry(R * 0.7, R * 0.7, GW * 2, 8), bx, GH, 0, 0, Math.PI / 2));
    physics.addStaticCylinder(gx, GH, 0, GW, R, { restitution: 0.6, axis: 'z', tag: { type: 'post' } });

    // Nets (visual) — back, sides, roof.
    const netPlane = (w, h, x, y, z, ry, rx = 0) => {
      const p = new THREE.PlaneGeometry(w, h);
      const uv = p.attributes.uv;
      for (let k = 0; k < uv.count; k += 1) uv.setXY(k, (uv.getX(k) * w) / 0.12, (uv.getY(k) * h) / 0.12);
      return place(p, x, y, z, ry, rx);
    };
    nets.push(netPlane(GW * 2, GH, bx, GH / 2, 0, Math.PI / 2));
    nets.push(netPlane(GD, GH, (gx + bx) / 2, GH / 2, -GW, 0));
    nets.push(netPlane(GD, GH, (gx + bx) / 2, GH / 2, GW, 0));
    nets.push(netPlane(GD, GW * 2, (gx + bx) / 2, GH, 0, Math.PI / 2, -Math.PI / 2));

    const net = { restitution: 0.04, friction: 1, soft: true, tag: { type: 'net', side: s } };
    physics.addStaticBox(bx + s * 0.06, GH / 2, 0, 0.06, GH / 2, GW, net);
    physics.addStaticBox((gx + bx) / 2, GH / 2, -GW - 0.05, GD / 2, GH / 2, 0.05, net);
    physics.addStaticBox((gx + bx) / 2, GH / 2, GW + 0.05, GD / 2, GH / 2, 0.05, net);
    physics.addStaticBox((gx + bx) / 2, GH + 0.06, 0, GD / 2, 0.06, GW, net);
  }
  const goalMat = new THREE.MeshStandardMaterial({ color: '#f2f0ea', roughness: 0.38, metalness: 0.3 });
  const goalMesh = new THREE.Mesh(mergeGeometries(normalizeForMerge(goalFrames, { color: false })), goalMat);
  goalMesh.castShadow = true;
  goalMesh.name = 'goals';
  group.add(goalMesh);
  const netMat = new THREE.MeshStandardMaterial({
    map: netTex,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    roughness: 0.9,
    alphaTest: 0.05,
  });
  const netMesh = new THREE.Mesh(mergeGeometries(normalizeForMerge(nets, { color: false })), netMat);
  netMesh.renderOrder = 1;
  group.add(netMesh);

  // --- Corner floodlights ---------------------------------------------------
  const lightParts = [];
  const lampHeads = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * (BOARD_X + 0.8);
      const z = sz * (BOARD_Z + 0.8);
      lightParts.push(place(new THREE.CylinderGeometry(0.09, 0.14, 9, 10), x, 4.5, z));
      lightParts.push(place(new THREE.BoxGeometry(1.4, 0.08, 0.08), x - sx * 0.4, 8.9, z - sz * 0.4, Math.atan2(sz, sx)));
      lampHeads.push(place(new THREE.BoxGeometry(0.7, 0.3, 0.45), x - sx * 0.8, 8.75, z - sz * 0.8, Math.atan2(sz, sx), -0.3));
    }
  }
  const poleMesh = new THREE.Mesh(
    mergeGeometries(normalizeForMerge(lightParts, { color: false })),
    new THREE.MeshStandardMaterial({ color: '#5d6466', roughness: 0.5, metalness: 0.6 }),
  );
  poleMesh.castShadow = true;
  group.add(poleMesh);
  const headMesh = new THREE.Mesh(
    mergeGeometries(normalizeForMerge(lampHeads, { color: false })),
    new THREE.MeshStandardMaterial({ color: '#30353a', emissive: '#ffe7b0', emissiveIntensity: 0.35, roughness: 0.4 }),
  );
  group.add(headMesh);

  return { group, nearFenceMaterial: nearMat, nearSteelMaterial: nearSteel };
}
