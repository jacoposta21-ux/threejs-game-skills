import * as THREE from 'three';

// Accumulates static geometry into flat arrays. The city generator writes walls,
// roofs, roads and trim into one builder per (chunk, material) so the whole city
// is drawn with a few dozen merged meshes that still frustum-cull per chunk.
export class GeoBuilder {
  constructor() {
    this.p = [];
    this.n = [];
    this.uv = [];
  }

  get vertexCount() {
    return this.p.length / 3;
  }

  tri(a, b, c, ua, ub, uc) {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let nx = ab[1] * ac[2] - ab[2] * ac[1];
    let ny = ab[2] * ac[0] - ab[0] * ac[2];
    let nz = ab[0] * ac[1] - ab[1] * ac[0];
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    this.p.push(...a, ...b, ...c);
    this.n.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    this.uv.push(...ua, ...ub, ...uc);
    if (this.c) { const c = this.cur; this.c.push(c.r, c.g, c.b, c.r, c.g, c.b, c.r, c.g, c.b); }
    if (this.tl) { const t = this.curTile; this.tl.push(t[0], t[1], t[0], t[1], t[0], t[1]); }
  }

  /** a,b,c,d counter-clockwise when seen from the front. */
  quad(a, b, c, d, ua = [0, 0], ub = [1, 0], uc = [1, 1], ud = [0, 1]) {
    this.tri(a, b, c, ua, ub, uc);
    this.tri(a, c, d, ua, uc, ud);
  }

  /**
   * Axis-aligned box. Side UVs are in world units divided by tileW/tileH so that
   * window grids keep their real size on every building. vBase anchors floors.
   */
  box(x0, y0, z0, x1, y1, z1, o = {}) {
    const tw = o.tileW || 4, th = o.tileH || 4;
    const vb = o.vBase !== undefined ? o.vBase : y0;
    const v0 = (y0 - vb) / th, v1 = (y1 - vb) / th;
    const sides = o.sides !== false;
    if (sides) {
      const ux = (x1 - x0) / tw, uz = (z1 - z0) / tw;
      const uo = o.uOffset || 0;
      // +X
      this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [uo, v0], [uo + uz, v0], [uo + uz, v1], [uo, v1]);
      // -X
      this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [uo, v0], [uo + uz, v0], [uo + uz, v1], [uo, v1]);
      // +Z
      this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [uo, v0], [uo + ux, v0], [uo + ux, v1], [uo, v1]);
      // -Z
      this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [uo, v0], [uo + ux, v0], [uo + ux, v1], [uo, v1]);
    }
    if (o.top) this.top(x0, z0, x1, z1, y1, o.topTile || tw);
    if (o.bottom) {
      this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
    }
  }

  top(x0, z0, x1, z1, y, tile = 4) {
    this.quad(
      [x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0],
      [x0 / tile, -z1 / tile], [x1 / tile, -z1 / tile], [x1 / tile, -z0 / tile], [x0 / tile, -z0 / tile],
    );
  }

  /** Flat quad with explicit UV rectangle (used for roads and signs). */
  flat(x0, z0, x1, z1, y, u0, v0, u1, v1, rotateUV = false) {
    if (!rotateUV) {
      this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
    } else {
      // u runs along z, v along x
      this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [u1, v0], [u1, v1], [u0, v1], [u0, v0]);
    }
  }

  /** Vertical quad facing one of the axis directions (dir: 'px','nx','pz','nz'). */
  wallQuad(cx, cy, cz, w, h, dir, uv = [0, 0, 1, 1]) {
    const hw = w / 2, hh = h / 2;
    const [u0, v0, u1, v1] = uv;
    let a, b, c, d;
    if (dir === 'pz') { a = [cx - hw, cy - hh, cz]; b = [cx + hw, cy - hh, cz]; c = [cx + hw, cy + hh, cz]; d = [cx - hw, cy + hh, cz]; }
    else if (dir === 'nz') { a = [cx + hw, cy - hh, cz]; b = [cx - hw, cy - hh, cz]; c = [cx - hw, cy + hh, cz]; d = [cx + hw, cy + hh, cz]; }
    else if (dir === 'px') { a = [cx, cy - hh, cz + hw]; b = [cx, cy - hh, cz - hw]; c = [cx, cy + hh, cz - hw]; d = [cx, cy + hh, cz + hw]; }
    else { a = [cx, cy - hh, cz - hw]; b = [cx, cy - hh, cz + hw]; c = [cx, cy + hh, cz + hw]; d = [cx, cy + hh, cz - hw]; }
    this.quad(a, b, c, d, [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
  }

  cylinder(cx, cz, r, y0, y1, seg = 12, o = {}) {
    const tw = o.tileW || 4, th = o.tileH || 4;
    const circ = 2 * Math.PI * r;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const p0 = [cx + Math.cos(a0) * r, cz + Math.sin(a0) * r];
      const p1 = [cx + Math.cos(a1) * r, cz + Math.sin(a1) * r];
      const u0 = ((i / seg) * circ) / tw, u1 = (((i + 1) / seg) * circ) / tw;
      this.quad([p1[0], y0, p1[1]], [p0[0], y0, p0[1]], [p0[0], y1, p0[1]], [p1[0], y1, p1[1]], [u1, y0 / th], [u0, y0 / th], [u0, y1 / th], [u1, y1 / th]);
      if (o.top !== false) this.tri([cx, y1, cz], [p1[0], y1, p1[1]], [p0[0], y1, p0[1]], [0.5, 0.5], [0.5 + Math.cos(a1) * 0.5, 0.5 + Math.sin(a1) * 0.5], [0.5 + Math.cos(a0) * 0.5, 0.5 + Math.sin(a0) * 0.5]);
    }
  }

  /** Gable roof over a rectangle; ridge runs along the longer axis. */
  gable(x0, z0, x1, z1, y, h, roof, ends, tile = 3, roofTile = null, endsTile = null) {
    const alongX = x1 - x0 >= z1 - z0;
    // roof and gable ends may share one merged bucket: restore each part's atlas tile
    const setR = () => { if (roofTile) roof.curTile = roofTile; };
    const setE = () => { if (endsTile) ends.curTile = endsTile; };
    if (alongX) {
      const zm = (z0 + z1) / 2;
      const s = Math.hypot(h, (z1 - z0) / 2) / tile;
      setR(); roof.quad([x0, y, z1], [x1, y, z1], [x1, y + h, zm], [x0, y + h, zm], [x0 / tile, 0], [x1 / tile, 0], [x1 / tile, s], [x0 / tile, s]);
      setR(); roof.quad([x1, y, z0], [x0, y, z0], [x0, y + h, zm], [x1, y + h, zm], [x1 / tile, 0], [x0 / tile, 0], [x0 / tile, s], [x1 / tile, s]);
      const w = (z1 - z0) / tile;
      setE(); ends.tri([x1, y, z1], [x1, y, z0], [x1, y + h, zm], [0, 0], [w, 0], [w / 2, h / tile]);
      setE(); ends.tri([x0, y, z0], [x0, y, z1], [x0, y + h, zm], [0, 0], [w, 0], [w / 2, h / tile]);
    } else {
      const xm = (x0 + x1) / 2;
      const s = Math.hypot(h, (x1 - x0) / 2) / tile;
      setR(); roof.quad([x1, y, z1], [x1, y, z0], [xm, y + h, z0], [xm, y + h, z1], [z1 / tile, 0], [z0 / tile, 0], [z0 / tile, s], [z1 / tile, s]);
      setR(); roof.quad([x0, y, z0], [x0, y, z1], [xm, y + h, z1], [xm, y + h, z0], [z0 / tile, 0], [z1 / tile, 0], [z1 / tile, s], [z0 / tile, s]);
      const w = (x1 - x0) / tile;
      setE(); ends.tri([x0, y, z1], [x1, y, z1], [xm, y + h, z1], [0, 0], [w, 0], [w / 2, h / tile]);
      setE(); ends.tri([x1, y, z0], [x0, y, z0], [xm, y + h, z0], [0, 0], [w, 0], [w / 2, h / tile]);
    }
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.c) g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    if (this.tl) g.setAttribute('atlasTile', new THREE.Float32BufferAttribute(this.tl, 2));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
