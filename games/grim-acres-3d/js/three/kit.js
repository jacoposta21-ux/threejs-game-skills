// Tiny low-poly modelling kit: primitives with per-vertex colours, merged into one geometry
// per model so every prop is a single draw call. Units: 1 = one tile; +Y is up; models face +Z
// (towards the camera / "down" on the old 2D map).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();

function prep(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  if (g.attributes.uv1) g.deleteAttribute('uv1');
  return g;
}

function paint(geo, color, jitter = 0, seed = 0) {
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  _c.set(color);
  for (let i = 0; i < n; i += 3) {
    // per-triangle brightness jitter gives flat-shaded surfaces a hand-made feel
    const k = jitter ? 1 + (Math.sin((i + seed) * 12.9898) * 43758.5453 % 1) * jitter : 1;
    for (let v = 0; v < 3 && i + v < n; v++) {
      arr[(i + v) * 3] = _c.r * k; arr[(i + v) * 3 + 1] = _c.g * k; arr[(i + v) * 3 + 2] = _c.b * k;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

// Triangular prism (gable roof): width along X, depth along Z, apex on top centre.
export function prismGeometry(w, h, d) {
  const x = w / 2, z = d / 2;
  const v = [
    // front gable (+z)
    -x, 0, z, x, 0, z, 0, h, z,
    // back gable (-z)
    x, 0, -z, -x, 0, -z, 0, h, -z,
    // left slope
    -x, 0, -z, -x, 0, z, 0, h, z, -x, 0, -z, 0, h, z, 0, h, -z,
    // right slope
    x, 0, z, x, 0, -z, 0, h, -z, x, 0, z, 0, h, -z, 0, h, z,
    // bottom
    -x, 0, -z, x, 0, -z, x, 0, z, -x, 0, -z, x, 0, z, -x, 0, z,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

// Roof along X: two slabs leaning on a ridge, with overhang.
export class Kit {
  constructor() { this.parts = { base: [], glow: [] }; }

  add(geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], opts = {}) {
    const g = paint(prep(geo), color, opts.jitter ?? 0.06, opts.seed ?? pos[0] * 7 + pos[2] * 13);
    _e.set(rot[0], rot[1], rot[2], opts.order || 'XYZ');
    _q.setFromEuler(_e);
    _m.compose(_p.set(pos[0], pos[1], pos[2]), _q, _s.set(scale[0], scale[1], scale[2]));
    g.applyMatrix4(_m);
    this.parts[opts.glow ? 'glow' : 'base'].push(g);
    return this;
  }

  // Box by size, positioned by its bottom-centre (y = bottom), which is how props are authored.
  box(w, h, d, x, y, z, color, opts = {}) {
    return this.add(new THREE.BoxGeometry(w, h, d), color, [x, y + h / 2, z], opts.rot || [0, 0, 0], [1, 1, 1], opts);
  }
  cyl(rt, rb, h, x, y, z, color, opts = {}) {
    return this.add(new THREE.CylinderGeometry(rt, rb, h, opts.seg || 8), color, [x, y + h / 2, z], opts.rot || [0, 0, 0], [1, 1, 1], opts);
  }
  cone(r, h, x, y, z, color, opts = {}) {
    return this.add(new THREE.ConeGeometry(r, h, opts.seg || 8), color, [x, y + h / 2, z], opts.rot || [0, 0, 0], [1, 1, 1], opts);
  }
  ball(r, x, y, z, color, opts = {}) {
    const geo = opts.detail === undefined ? new THREE.IcosahedronGeometry(r, 1) : new THREE.IcosahedronGeometry(r, opts.detail);
    return this.add(geo, color, [x, y, z], opts.rot || [0, 0, 0], opts.scale || [1, 1, 1], opts);
  }
  sphere(r, x, y, z, color, opts = {}) {
    return this.add(new THREE.SphereGeometry(r, opts.seg || 10, opts.rings || 7), color, [x, y, z], opts.rot || [0, 0, 0], opts.scale || [1, 1, 1], opts);
  }
  prism(w, h, d, x, y, z, color, opts = {}) {
    return this.add(prismGeometry(w, h, d), color, [x, y, z], opts.rot || [0, 0, 0], [1, 1, 1], opts);
  }
  torus(r, t, x, y, z, color, opts = {}) {
    return this.add(new THREE.TorusGeometry(r, t, 6, opts.seg || 14), color, [x, y, z], opts.rot || [0, 0, 0], [1, 1, 1], opts);
  }

  // Merge everything into { base, glow } geometries (either may be null).
  build() {
    const out = {};
    for (const k of ['base', 'glow']) out[k] = this.parts[k].length ? mergeGeometries(this.parts[k], false) : null;
    for (const k of ['base', 'glow']) for (const g of this.parts[k]) g.dispose();
    this.parts = { base: [], glow: [] };
    return out;
  }
}

// Extrude a pixel-art canvas into voxels (fallback for anything without a hand-made model).
export function voxelize(canvas, { px = 1 / 16, depth = 3 } = {}) {
  const w = canvas.width, h = canvas.height;
  const data = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3] > 128;
  const pos = [], col = [], nor = [];
  const c = new THREE.Color();
  const dz = depth * px;
  const quad = (a, b, cc, d, n, color) => {
    for (const v of [a, b, cc, a, cc, d]) { pos.push(...v); nor.push(...n); col.push(color.r, color.g, color.b); }
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!solid(x, y)) continue;
    const i = (y * w + x) * 4;
    c.setRGB(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255, THREE.SRGBColorSpace);
    const x0 = (x - w / 2) * px, x1 = x0 + px, y1 = (h - y) * px, y0 = y1 - px;
    const z0 = -dz / 2, z1 = dz / 2;
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], c);
    quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], c);
    if (!solid(x - 1, y)) quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], c);
    if (!solid(x + 1, y)) quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], c);
    if (!solid(x, y - 1)) quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], c);
    if (!solid(x, y + 1)) quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
