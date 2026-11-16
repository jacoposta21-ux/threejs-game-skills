import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { roundedBox, potGeometry } from '../world/geometry.js';
import { clamp, damp } from '../core/rng.js';

/**
 * Lightweight blocky NPC characters. Each body part (hips, torso, head, two
 * arms, two legs) is ONE merged mesh using a single shared vertex-coloured
 * material whose map is a face atlas; non-face vertices sample a white texel.
 * ~7 draw calls per character, expressions swap by rewriting 6 face UVs.
 */

const CELL = 64;
const ATLAS = 512;
const COLS = ATLAS / CELL;
const WHITE_CELL = COLS * COLS - 1;
export const FACE_VARIANTS = ['adult', 'woman', 'elder', 'child'];
export const EXPRESSIONS = ['neutral', 'smile', 'surprised', 'angry', 'talk', 'sleepy'];

const cellUV = (index) => {
  const cx = index % COLS;
  const cy = Math.floor(index / COLS);
  return { u0: (cx * CELL) / ATLAS, u1: ((cx + 1) * CELL) / ATLAS, v0: 1 - ((cy + 1) * CELL) / ATLAS, v1: 1 - (cy * CELL) / ATLAS };
};
const WHITE = (() => {
  const c = cellUV(WHITE_CELL);
  return { u: (c.u0 + c.u1) / 2, v: (c.v0 + c.v1) / 2 };
})();
export const faceCell = (variant, expr) => FACE_VARIANTS.indexOf(variant) * EXPRESSIONS.length + Math.max(0, EXPRESSIONS.indexOf(expr));

function drawFace(g, ox, oy, variant, expr) {
  const s = CELL / 128;
  g.save();
  g.translate(ox, oy);
  g.scale(s, s);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  const child = variant === 'child';
  const elder = variant === 'elder';
  const eyeY = child ? 62 : 58;
  const eyeR = child ? 11 : 8.5;
  const brow = elder ? '#9a8f86' : '#4a2c18';
  // cheeks
  g.fillStyle = 'rgba(214,110,95,0.35)';
  g.beginPath(); g.ellipse(28, 80, 11, 7, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(100, 80, 11, 7, 0, 0, Math.PI * 2); g.fill();
  // brows
  g.strokeStyle = brow;
  g.lineWidth = elder ? 7 : 5;
  g.lineCap = 'round';
  const browLift = expr === 'surprised' ? -8 : 0;
  const angry = expr === 'angry';
  g.beginPath(); g.moveTo(26, 40 + browLift + (angry ? -4 : 0)); g.lineTo(50, 40 + browLift + (angry ? 6 : -3)); g.stroke();
  g.beginPath(); g.moveTo(78, 40 + browLift + (angry ? 6 : -3)); g.lineTo(102, 40 + browLift + (angry ? -4 : 0)); g.stroke();
  // eyes
  for (const x of [38, 90]) {
    if (expr === 'sleepy' || (expr === 'smile' && !child)) {
      g.strokeStyle = '#2a1a10';
      g.lineWidth = 5;
      g.beginPath(); g.arc(x, eyeY + 4, 8, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
      continue;
    }
    const r = expr === 'surprised' ? eyeR * 1.25 : eyeR;
    g.fillStyle = '#2a1a10';
    g.beginPath(); g.ellipse(x, eyeY, r * 0.85, r, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(x + 3, eyeY - 4, r * 0.32, 0, Math.PI * 2); g.fill();
    if (variant === 'woman') {
      g.strokeStyle = '#2a1a10';
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(x + (x < 64 ? -9 : 9), eyeY - 6); g.lineTo(x + (x < 64 ? -14 : 14), eyeY - 11); g.stroke();
    }
  }
  if (elder) {
    g.strokeStyle = 'rgba(120,80,60,0.45)';
    g.lineWidth = 2.5;
    for (const x of [22, 106]) { g.beginPath(); g.moveTo(x, 54); g.lineTo(x + (x < 64 ? -6 : 6), 60); g.stroke(); }
    g.beginPath(); g.moveTo(44, 28); g.lineTo(84, 28); g.stroke();
  }
  // nose
  g.fillStyle = 'rgba(150,90,60,0.35)';
  g.beginPath(); g.ellipse(64, 80, 6, 4, 0, 0, Math.PI * 2); g.fill();
  // mouth
  g.strokeStyle = '#7a2e22';
  g.fillStyle = '#6a2018';
  g.lineWidth = 4.5;
  const my = 100;
  if (expr === 'smile') {
    g.beginPath(); g.moveTo(46, my - 4); g.quadraticCurveTo(64, my + 14, 82, my - 4); g.closePath(); g.fill();
  } else if (expr === 'surprised') {
    g.beginPath(); g.ellipse(64, my + 2, 8, 10, 0, 0, Math.PI * 2); g.fill();
  } else if (expr === 'angry') {
    g.beginPath(); g.moveTo(48, my + 6); g.quadraticCurveTo(64, my - 6, 80, my + 6); g.stroke();
  } else if (expr === 'talk') {
    g.beginPath(); g.moveTo(50, my - 2); g.lineTo(78, my - 2); g.quadraticCurveTo(64, my + 14, 50, my - 2); g.fill();
  } else if (expr === 'sleepy') {
    g.beginPath(); g.moveTo(54, my); g.lineTo(74, my); g.stroke();
  } else {
    g.beginPath(); g.moveTo(50, my); g.quadraticCurveTo(64, my + 7, 78, my); g.stroke();
  }
  g.restore();
}

let shared = null;
export function characterMaterial() {
  if (shared) return shared;
  const c = document.createElement('canvas');
  c.width = c.height = ATLAS;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, ATLAS, ATLAS);
  FACE_VARIANTS.forEach((variant) => {
    EXPRESSIONS.forEach((expr) => {
      const i = faceCell(variant, expr);
      drawFace(g, (i % COLS) * CELL, Math.floor(i / COLS) * CELL, variant, expr);
    });
  });
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.magFilter = THREE.LinearFilter;
  shared = new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.85 });
  return shared;
}

const tmpObj = new THREE.Object3D();
const tmpColor = new THREE.Color();

/** Merge {geo, color, t, face} parts into one geometry; face part comes first (verts 0..5). */
function mergeParts(parts) {
  const list = [];
  for (const p of parts) {
    let g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    p.geo.dispose();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    const t = p.t || {};
    tmpObj.position.set(t.x || 0, t.y || 0, t.z || 0);
    tmpObj.rotation.set(t.rx || 0, t.ry || 0, t.rz || 0);
    tmpObj.scale.set(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1);
    tmpObj.updateMatrix();
    g.applyMatrix4(tmpObj.matrix);
    const n = g.attributes.position.count;
    const colors = new Float32Array(n * 3);
    tmpColor.set(p.color);
    for (let i = 0; i < n; i += 1) colors.set([tmpColor.r, tmpColor.g, tmpColor.b], i * 3);
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const uv = new Float32Array(n * 2);
    if (p.face === undefined) for (let i = 0; i < n; i += 1) uv.set([WHITE.u, WHITE.v], i * 2);
    else {
      const src = g.attributes.uv;
      for (let i = 0; i < n; i += 1) uv.set([src.getX(i), src.getY(i)], i * 2);
    }
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    list.push(g);
  }
  const merged = mergeGeometries(list, false);
  for (const g of list) g.dispose();
  return merged;
}

function setFaceUV(geometry, cell, baseUV) {
  const { u0, u1, v0, v1 } = cellUV(cell);
  const uv = geometry.attributes.uv;
  for (let i = 0; i < 6; i += 1) uv.setXY(i, u0 + baseUV[i * 2] * (u1 - u0), v0 + baseUV[i * 2 + 1] * (v1 - v0));
  uv.needsUpdate = true;
}

function mesh(geo, material) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const box = (w, h, d, r = 0.05) => roundedBox(w, h, d, r, 1);

/**
 * @param {object} c appearance config:
 *  variant, skin, hair, hairStyle ('short'|'long'|'bald'|'bun'), beard (color|null),
 *  headwear {type:'scarf'|'wrap'|'cap', color, band}, tunic, tunicShade, mantle, belt,
 *  scale, carry: array of carry item types to prebuild
 */
export function buildCharacter(c) {
  const material = characterMaterial();
  const group = new THREE.Group();
  const root = new THREE.Group(); // rotated as a whole for falls
  group.add(root);
  const body = new THREE.Group();
  root.add(body);
  const child = c.variant === 'child';
  const shade = c.tunicShade || c.tunic;

  // hips + skirt
  const skirtGeo = new THREE.CylinderGeometry(0.38, 0.47, child ? 0.5 : 0.62, 8, 1);
  skirtGeo.scale(1, 1, 0.72);
  const hips = mesh(mergeParts([
    { geo: skirtGeo, color: c.tunic, t: { y: child ? 0.73 : 0.67 } },
    ...(c.hem ? [{ geo: (() => { const h = new THREE.CylinderGeometry(0.475, 0.48, 0.06, 8, 1, true); h.scale(1, 1, 0.72); return h; })(), color: c.hem, t: { y: child ? 0.49 : 0.37 } }] : []),
  ]), material);
  body.add(hips);

  const legs = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.15, 0.92, 0);
    pivot.add(mesh(mergeParts([
      { geo: box(0.23, 0.6, 0.25), color: shade, t: { y: -0.3 } },
      { geo: box(0.19, 0.36, 0.21), color: c.legs || c.skin, t: { y: -0.7 } },
      { geo: box(0.23, 0.07, 0.34, 0.03), color: '#6f4424', t: { y: -0.89, z: 0.04 } },
    ]), material));
    body.add(pivot);
    return pivot;
  });

  const torso = new THREE.Group();
  torso.position.y = 0.96;
  body.add(torso);
  const torsoParts = [
    { geo: box(0.74, 0.72, 0.42, 0.11), color: c.tunic, t: { y: 0.36 } },
    { geo: box(0.78, 0.11, 0.46, 0.04), color: c.belt || '#6b4a2e', t: { y: 0.05 } },
    { geo: new THREE.CylinderGeometry(0.11, 0.13, 0.12, 8), color: c.skin, t: { y: 0.77 } },
  ];
  if (c.mantle) {
    torsoParts.push({ geo: new THREE.BoxGeometry(0.3, 0.95, 0.45), color: c.mantle, t: { y: 0.36, x: 0.08, rz: -0.6 } });
    torsoParts.push({ geo: box(0.3, 0.3, 0.46, 0.06), color: c.mantle, t: { x: 0.26, y: 0.64 } });
  }
  torso.add(mesh(mergeParts(torsoParts), material));

  const arms = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.46, 0.65, 0);
    pivot.add(mesh(mergeParts([
      { geo: box(0.21, 0.5, 0.24, 0.07), color: c.sleeve || c.tunic, t: { x: side * 0.04, y: -0.22 } },
      { geo: box(0.17, 0.2, 0.19, 0.06), color: c.skin, t: { x: side * 0.05, y: -0.57 } },
    ]), material));
    torso.add(pivot);
    return pivot;
  });

  // head (face first so its 6 verts are 0..5)
  const head = new THREE.Group();
  head.position.y = 0.83;
  torso.add(head);
  const variant = c.variant || 'adult';
  const face = new THREE.PlaneGeometry(0.44, 0.44);
  const headParts = [
    { geo: face, color: c.skin, t: { y: 0.3, z: 0.257 }, face: true },
    { geo: box(0.52, 0.54, 0.5, 0.11), color: c.skin, t: { y: 0.28 } },
  ];
  const hs = c.hairStyle || 'short';
  if (hs !== 'bald') {
    headParts.push({ geo: box(0.57, 0.15, 0.55, 0.07), color: c.hair, t: { y: 0.56 } });
    headParts.push({ geo: box(0.56, 0.4, 0.14, 0.05), color: c.hair, t: { y: 0.36, z: -0.22 } });
    for (const s of [-1, 1]) headParts.push({ geo: box(0.08, 0.3, 0.42, 0.03), color: c.hair, t: { x: s * 0.27, y: 0.4, z: -0.04 } });
  } else {
    headParts.push({ geo: box(0.54, 0.16, 0.46, 0.05), color: c.hair, t: { y: 0.3, z: -0.06 } });
  }
  if (hs === 'long') headParts.push({ geo: box(0.56, 0.62, 0.12, 0.05), color: c.hair, t: { y: 0.12, z: -0.25 } });
  if (hs === 'bun') headParts.push({ geo: new THREE.SphereGeometry(0.13, 8, 6), color: c.hair, t: { y: 0.55, z: -0.27 } });
  if (c.beard) {
    headParts.push({ geo: box(0.48, 0.2, 0.15, 0.06), color: c.beard, t: { y: 0.07, z: 0.21 } });
    headParts.push({ geo: box(0.28, 0.13, 0.13, 0.05), color: c.beard, t: { y: -0.05, z: 0.19 } });
    for (const s of [-1, 1]) headParts.push({ geo: box(0.09, 0.28, 0.28, 0.04), color: c.beard, t: { x: s * 0.23, y: 0.13, z: 0.1 } });
  }
  const hw = c.headwear;
  if (hw?.type === 'wrap' || hw?.type === 'scarf') {
    // head cloth draped over crown and shoulders, optional band (agal)
    headParts.push({ geo: box(0.6, 0.2, 0.58, 0.08), color: hw.color, t: { y: 0.6 } });
    headParts.push({ geo: box(0.6, hw.type === 'scarf' ? 0.72 : 0.6, 0.16, 0.05), color: hw.color, t: { y: 0.27, z: -0.25 } });
    for (const s of [-1, 1]) headParts.push({ geo: box(0.1, hw.type === 'scarf' ? 0.66 : 0.5, 0.48, 0.04), color: hw.color, t: { x: s * 0.29, y: hw.type === 'scarf' ? 0.25 : 0.32, z: -0.03 } });
    if (hw.band) headParts.push({ geo: box(0.62, 0.06, 0.6, 0.03), color: hw.band, t: { y: 0.6 } });
  } else if (hw?.type === 'cap') {
    headParts.push({ geo: new THREE.CylinderGeometry(0.26, 0.3, 0.16, 10), color: hw.color, t: { y: 0.62 } });
  }
  const headGeo = mergeParts(headParts);
  const faceBaseUV = [];
  {
    // PlaneGeometry (non-indexed) uv order after toNonIndexed
    const p = new THREE.PlaneGeometry(1, 1).toNonIndexed();
    for (let i = 0; i < 6; i += 1) faceBaseUV.push(p.attributes.uv.getX(i), p.attributes.uv.getY(i));
    p.dispose();
  }
  setFaceUV(headGeo, faceCell(variant, 'neutral'), faceBaseUV);
  const headMesh = mesh(headGeo, material);
  head.add(headMesh);

  // carried items (built once, toggled)
  const carry = {};
  for (const type of c.carry || []) {
    let geo;
    let parent = arms[1];
    let pos = [0.05, -0.62, 0.15];
    if (type === 'jar') {
      geo = mergeParts([{ geo: potGeometry(0.55, 0.24, 9), color: '#c0703f' }]);
      parent = head;
      pos = [0, 0.66, 0];
    } else if (type === 'basket') {
      geo = mergeParts([
        { geo: new THREE.CylinderGeometry(0.28, 0.22, 0.26, 10), color: '#b38b52' },
        { geo: new THREE.SphereGeometry(0.24, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), color: c.basketFill || '#b8763a', t: { y: 0.08, sy: 0.5 } },
      ]);
      parent = arms[0];
      pos = [-0.05, -0.62, 0.22];
    } else if (type === 'staff') {
      geo = mergeParts([
        { geo: new THREE.CylinderGeometry(0.035, 0.035, 1.9, 6), color: '#7a5233', t: { y: 0.2 } },
        { geo: new THREE.TorusGeometry(0.12, 0.035, 5, 10, Math.PI), color: '#7a5233', t: { y: 1.15, x: 0.12 } },
      ]);
      pos = [0.05, -0.62, 0.08];
    } else if (type === 'net') {
      geo = mergeParts([{ geo: new THREE.IcosahedronGeometry(0.3, 0), color: '#d8c8a0', t: { sy: 0.7 } }]);
      pos = [0.05, -0.7, -0.05];
    } else if (type === 'scroll') {
      geo = mergeParts([{ geo: new THREE.CylinderGeometry(0.06, 0.06, 0.42, 8), color: '#efe2c0', t: { rz: Math.PI / 2 } }]);
      pos = [0.05, -0.66, 0.16];
    } else if (type === 'broom') {
      geo = mergeParts([
        { geo: new THREE.CylinderGeometry(0.03, 0.03, 1.4, 5), color: '#8a6a40' },
        { geo: new THREE.ConeGeometry(0.16, 0.4, 6), color: '#c9a65a', t: { y: -0.85, rx: Math.PI } },
      ]);
      pos = [0.05, -0.62, 0.1];
    } else if (type === 'plank') {
      geo = mergeParts([{ geo: new THREE.BoxGeometry(0.12, 0.05, 1.8), color: '#c08c58' }]);
      pos = [0.05, -0.62, 0.2];
    } else continue;
    const m = mesh(geo, material);
    m.position.set(...pos);
    m.visible = false;
    parent.add(m);
    carry[type] = m;
  }

  const scale = c.scale || 1;
  group.scale.setScalar(scale);
  if (child) head.scale.setScalar(1.22);

  const meshes = [];
  group.traverse((o) => o.isMesh && meshes.push(o));

  return {
    group, root, body, torso, head, arms, legs, carry, meshes,
    setExpression(expr) {
      if (this.expr === expr) return;
      this.expr = expr;
      setFaceUV(headGeo, faceCell(variant, expr), faceBaseUV);
    },
    setShadows(on) {
      for (const m of meshes) m.castShadow = on;
    },
    dispose() {
      for (const m of meshes) m.geometry.dispose();
    },
  };
}

/**
 * Procedural pose blender shared by every NPC.
 * state: { speed, grounded, action, actionTime, lookYaw, lookPitch }
 */
export class CharacterAnimator {
  constructor(rig, seed = 0) {
    this.rig = rig;
    this.phase = seed * 3.7;
    this.time = seed * 11.3;
    this.move = 0;
    this.fall = 0;
  }

  update(dt, s) {
    const r = this.rig;
    this.time += dt;
    const k = damp(10, dt);
    const speedN = clamp(s.speed / 4, 0, 1);
    this.move += ((s.speed > 0.15 ? 1 : 0) - this.move) * k;
    this.phase += dt * (3 + s.speed * 2.2);
    const sw = Math.sin(this.phase);
    const amp = (0.4 + speedN * 0.5) * this.move;
    const t = this.time;
    const a = s.action || 'none';
    const at = s.actionTime || 0;

    let legL = sw * 0.7 * amp;
    let legR = -sw * 0.7 * amp;
    let armL = -sw * 0.6 * amp;
    let armR = sw * 0.6 * amp;
    let armLz = -0.07;
    let armRz = 0.07;
    let torsoX = speedN * 0.15 * this.move;
    let torsoY = sw * 0.06 * amp;
    let headX = 0;
    let bodyY = Math.abs(Math.cos(this.phase)) * 0.06 * amp + (1 - this.move) * Math.sin(t * 2) * 0.006;
    let fallTarget = 0;

    switch (a) {
      case 'talk':
        armL = -0.35 + Math.sin(t * 3.1) * 0.25;
        armR = -0.5 + Math.sin(t * 2.3 + 1) * 0.35;
        armRz = 0.25 + Math.sin(t * 1.7) * 0.15;
        headX = Math.sin(t * 4) * 0.06;
        break;
      case 'wave':
        armR = -2.6;
        armRz = 0.35 + Math.sin(t * 10) * 0.35;
        break;
      case 'hammer':
        armR = -1.2 - Math.max(0, Math.sin(t * 7)) * 1.2;
        armL = -0.7;
        torsoX = 0.25;
        headX = 0.25;
        break;
      case 'sell':
        armL = -0.7 + Math.sin(t * 0.9) * 0.1;
        armR = -0.7 + (Math.sin(t * 0.6) > 0.7 ? -0.9 : 0);
        armRz = 0.15;
        torsoX = 0.08;
        break;
      case 'carry-head':
        armL = -2.9; armR = -2.9; armLz = -0.25; armRz = 0.25;
        break;
      case 'carry':
        armL = -0.9; armLz = 0.25;
        break;
      case 'sweep':
        armL = -0.8 + Math.sin(t * 4) * 0.4;
        armR = -0.8 + Math.sin(t * 4) * 0.4;
        armLz = Math.sin(t * 4) * 0.3;
        armRz = Math.sin(t * 4) * 0.3;
        torsoX = 0.3;
        torsoY = Math.sin(t * 4) * 0.2;
        break;
      case 'draw-water':
        armL = -1.6 + Math.sin(t * 5) * 0.5;
        armR = -1.6 - Math.sin(t * 5) * 0.5;
        torsoX = 0.15;
        break;
      case 'pray':
        armL = -1.1; armR = -1.1; armLz = 0.35; armRz = -0.35;
        headX = 0.2 + Math.sin(t * 1.2) * 0.08;
        break;
      case 'sit':
        legL = -1.45; legR = -1.45;
        bodyY = -0.42;
        armL = -0.4; armR = -0.4;
        break;
      case 'cheer':
        armL = -2.8; armR = -2.8; armLz = -0.4 + Math.sin(t * 9) * 0.2; armRz = 0.4 - Math.sin(t * 9) * 0.2;
        bodyY = Math.abs(Math.sin(t * 7)) * 0.18;
        break;
      case 'startle':
        armL = -2.2; armR = -2.2; armLz = -0.6; armRz = 0.6;
        bodyY = at < 0.35 ? Math.sin((at / 0.35) * Math.PI) * 0.3 : 0;
        torsoX = -0.15;
        break;
      case 'angry':
        armL = -0.3; armR = -1.8 + Math.sin(t * 9) * 0.3; armRz = 0.3;
        torsoX = 0.1;
        break;
      case 'shrug':
        armL = -0.4; armR = -0.4; armLz = -0.7; armRz = 0.7;
        bodyY += 0.04;
        break;
      case 'look':
        headX = -0.15;
        armR = -0.2;
        break;
      case 'stumble':
        fallTarget = at < 1.7 ? 1 : 0;
        armL = -2.4; armR = -2.4; armLz = -0.8; armRz = 0.8;
        legL = 0.3; legR = -0.2;
        break;
      default:
        break;
    }
    if (s.carryHead && a !== 'sit') { armL = -2.9; armR = -2.9; armLz = -0.25; armRz = 0.25; }
    else if (s.carrySide && (a === 'none')) { armL = -0.9; armLz = 0.25; }

    const kk = damp(12, dt);
    r.legs[0].rotation.x += (legL - r.legs[0].rotation.x) * kk;
    r.legs[1].rotation.x += (legR - r.legs[1].rotation.x) * kk;
    r.arms[0].rotation.x += (armL - r.arms[0].rotation.x) * kk;
    r.arms[1].rotation.x += (armR - r.arms[1].rotation.x) * kk;
    r.arms[0].rotation.z += (armLz - r.arms[0].rotation.z) * kk;
    r.arms[1].rotation.z += (armRz - r.arms[1].rotation.z) * kk;
    r.torso.rotation.x += (torsoX - r.torso.rotation.x) * kk;
    r.torso.rotation.y = torsoY;
    r.body.position.y += (bodyY - r.body.position.y) * damp(16, dt);
    // head look (yaw relative to body), limited
    const ly = clamp(s.lookYaw || 0, -1.1, 1.1);
    r.head.rotation.y += (ly - r.head.rotation.y) * damp(6, dt);
    r.head.rotation.x += (headX + (s.lookPitch || 0) - r.head.rotation.x) * kk;
    // comedic fall: whole figure tips over backwards from the feet
    this.fall += (fallTarget - this.fall) * damp(fallTarget ? 9 : 4, dt);
    r.root.rotation.x = -this.fall * 1.45;
    r.root.position.y = this.fall * 0.1;
  }
}
