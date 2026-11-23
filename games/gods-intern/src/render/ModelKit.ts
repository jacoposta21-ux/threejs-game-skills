import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Low-poly model kit. Parts are colored with vertex colors and merged so each
 * authored model (house, tree, well…) is one geometry and one draw call.
 */
export class Part {
  constructor(public geometry: THREE.BufferGeometry) {}

  static box(w: number, h: number, d: number): Part {
    return new Part(new THREE.BoxGeometry(w, h, d));
  }
  static cyl(rt: number, rb: number, h: number, seg = 8, open = false): Part {
    return new Part(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));
  }
  static cone(r: number, h: number, seg = 8): Part {
    return new Part(new THREE.ConeGeometry(r, h, seg));
  }
  static ico(r: number, detail = 0): Part {
    return new Part(new THREE.IcosahedronGeometry(r, detail));
  }
  static dodeca(r: number): Part {
    return new Part(new THREE.DodecahedronGeometry(r, 0));
  }
  static sphere(r: number, w = 8, h = 6, thetaLen = Math.PI): Part {
    return new Part(new THREE.SphereGeometry(r, w, h, 0, Math.PI * 2, 0, thetaLen));
  }
  static torus(r: number, tube: number, rs = 6, ts = 16): Part {
    return new Part(new THREE.TorusGeometry(r, tube, rs, ts));
  }
  /** Triangular prism: gable roof. Width along X, ridge along Z. */
  static prism(w: number, h: number, d: number): Part {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0);
    shape.lineTo(w / 2, 0);
    shape.lineTo(0, h);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
    g.translate(0, 0, -d / 2);
    return new Part(g);
  }
  /** Gambrel (barn) roof profile extruded along Z. */
  static gambrel(w: number, h: number, d: number): Part {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0);
    shape.lineTo(w / 2, 0);
    shape.lineTo(w * 0.36, h * 0.62);
    shape.lineTo(0, h);
    shape.lineTo(-w * 0.36, h * 0.62);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
    g.translate(0, 0, -d / 2);
    return new Part(g);
  }

  at(x: number, y: number, z: number): this {
    this.geometry.translate(x, y, z);
    return this;
  }
  rot(x: number, y: number, z: number): this {
    if (x) this.geometry.rotateX(x);
    if (y) this.geometry.rotateY(y);
    if (z) this.geometry.rotateZ(z);
    return this;
  }
  scale(x: number, y: number, z: number): this {
    this.geometry.scale(x, y, z);
    return this;
  }
  /** Random vertex jitter for organic silhouettes (deterministic by seed). */
  jitter(amount: number, seed = 1): this {
    const pos = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    // Jitter by position hash so shared (welded) vertices move together.
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed) * 43758.5453;
      const r = h - Math.floor(h);
      const h2 = Math.sin(x * 93.989 + y * 67.345 + z * 12.345 + seed * 3) * 24634.6345;
      const r2 = h2 - Math.floor(h2);
      pos.setXYZ(i, x + (r - 0.5) * amount, y + (r2 - 0.5) * amount, z + (r - r2) * amount * 0.7);
    }
    return this;
  }
  color(hex: number, variance = 0): Part {
    const g = this.geometry.index ? this.geometry.toNonIndexed() : this.geometry;
    if (g !== this.geometry) this.geometry.dispose();
    this.geometry = g;
    const count = g.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    const base = new THREE.Color(hex);
    const c = new THREE.Color();
    for (let i = 0; i < count; i += 3) {
      const v = variance ? (Math.sin(i * 17.31) * 0.5) * variance : 0;
      c.copy(base).offsetHSL(0, 0, v);
      for (let k = 0; k < 3 && i + k < count; k++) {
        colors[(i + k) * 3] = c.r;
        colors[(i + k) * 3 + 1] = c.g;
        colors[(i + k) * 3 + 2] = c.b;
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (g.getAttribute('uv')) g.deleteAttribute('uv');
    return this;
  }
}

/** Merge colored parts into a single flat-shaded geometry. */
export function build(parts: Part[]): THREE.BufferGeometry {
  const geos = parts.map((p) => {
    let g = p.geometry;
    if (g.index) g = g.toNonIndexed();
    if (!g.getAttribute('color')) {
      const n = g.getAttribute('position').count;
      const col = new Float32Array(n * 3).fill(1);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    if (g.getAttribute('uv')) g.deleteAttribute('uv');
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'color' && name !== 'normal') g.deleteAttribute(name);
    }
    return g;
  });
  const merged = mergeGeometries(geos, false);
  if (!merged) throw new Error('Failed to merge model parts');
  merged.computeVertexNormals();
  for (const g of geos) g.dispose();
  return merged;
}

export function flatMaterial(opts: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.88,
    metalness: 0,
    ...opts,
  });
}

/** Seeded per-object hash 0..1 for deterministic visual variation. */
export function hashUnit(n: number): number {
  const h = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return h - Math.floor(h);
}
