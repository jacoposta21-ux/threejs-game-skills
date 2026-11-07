/** Procedural low-poly models built from primitives (stylised "toy diorama" look). */
import { Group, Mesh, MeshStandardMaterial, Object3D, type BufferGeometry } from 'three';
import { GeoBuilder, shade } from '../render/geo.ts';
import { PAL } from '../render/textures.ts';

export const SKIN = [0xf1c7a1, 0xd9a07a, 0xa8714f, 0x7a4e35, 0xf3d2b5];

/** Scooter body (faces +z). Returns separate geometries for parts that animate. */
export function scooterGeometries() {
  const b = new GeoBuilder();
  const red = PAL.scooter;
  const cream = 0xf6ecd8;
  const dark = 0x2b2b2e;
  const chrome = 0xd6d9de;
  // rear cowl (rounded), floorboard, leg shield, front fender
  b.sphere(0, 0.52, -0.38, 0.34, 0.26, 0.5, red, 14);
  b.box(0, 0.36, -0.38, 0.5, 0.18, 0.8, red);
  b.box(0, 0.3, 0.12, 0.42, 0.08, 0.62, cream);
  b.box(0, 0.62, 0.46, 0.5, 0.62, 0.1, red, 0, -0.18);
  b.sphere(0, 0.35, 0.62, 0.17, 0.12, 0.3, red, 10);
  b.cyl(0, 0.9, 0.53, 0.05, 0.55, chrome, 6, -0.25);
  // handlebar + headlight + mirrors
  b.box(0, 1.14, 0.56, 0.7, 0.06, 0.08, chrome);
  b.box(0, 1.12, 0.6, 0.26, 0.14, 0.14, red);
  b.sphere(0, 1.12, 0.69, 0.085, 0.085, 0.05, 0xfff3c4, 10);
  b.cyl(-0.3, 1.26, 0.56, 0.012, 0.22, chrome, 4);
  b.cyl(0.3, 1.26, 0.56, 0.012, 0.22, chrome, 4);
  b.sphere(-0.3, 1.38, 0.56, 0.05, 0.035, 0.015, chrome, 6);
  b.sphere(0.3, 1.38, 0.56, 0.05, 0.035, 0.015, chrome, 6);
  b.box(-0.37, 1.14, 0.56, 0.1, 0.07, 0.07, dark);
  b.box(0.37, 1.14, 0.56, 0.1, 0.07, 0.07, dark);
  // seat
  b.box(0, 0.8, -0.28, 0.36, 0.1, 0.66, 0x3a2a22);
  b.box(0, 0.75, -0.28, 0.4, 0.04, 0.7, cream);
  // tail light + side stripe
  b.box(0, 0.58, -0.86, 0.16, 0.08, 0.04, 0xff4040);
  b.box(0.335, 0.5, -0.38, 0.02, 0.05, 0.6, cream);
  b.box(-0.335, 0.5, -0.38, 0.02, 0.05, 0.6, cream);
  // rack struts (static part)
  b.box(0.16, 0.7, -0.62, 0.025, 0.2, 0.025, chrome);
  b.box(-0.16, 0.7, -0.62, 0.025, 0.2, 0.025, chrome);
  // rider: legs, torso (white tee + red apron), arms, helmet
  const jeans = 0x3c5a88;
  b.box(0.13, 0.62, 0.0, 0.14, 0.14, 0.5, jeans, 0, 0.15);
  b.box(-0.13, 0.62, 0.0, 0.14, 0.14, 0.5, jeans, 0, 0.15);
  b.box(0.13, 0.44, 0.24, 0.12, 0.3, 0.12, jeans);
  b.box(-0.13, 0.44, 0.24, 0.12, 0.3, 0.12, jeans);
  b.box(0.13, 0.33, 0.3, 0.12, 0.08, 0.2, 0x2b2b2b);
  b.box(-0.13, 0.33, 0.3, 0.12, 0.08, 0.2, 0x2b2b2b);
  const shirt = 0x4f8f6a;
  b.box(0, 1.1, -0.2, 0.38, 0.5, 0.24, shirt, 0, 0.12);
  b.box(0, 1.33, -0.22, 0.42, 0.08, 0.26, 0x3f7757, 0, 0.12);
  b.box(0, 0.98, -0.07, 0.3, 0.3, 0.04, 0xf3e6c8, 0, 0.1);
  b.box(0.22, 1.18, 0.12, 0.09, 0.09, 0.5, shirt, 0, 0.45);
  b.box(-0.22, 1.18, 0.12, 0.09, 0.09, 0.5, shirt, 0, 0.45);
  b.sphere(0.25, 1.12, 0.47, 0.05, 0.05, 0.05, SKIN[0], 6);
  b.sphere(-0.25, 1.12, 0.47, 0.05, 0.05, 0.05, SKIN[0], 6);
  b.sphere(0, 1.44, -0.16, 0.07, 0.06, 0.07, SKIN[0], 6);
  b.sphere(0, 1.56, -0.16, 0.165, 0.155, 0.175, 0xf2c761, 12);
  b.box(0, 1.62, -0.16, 0.07, 0.13, 0.35, 0xd7262c);
  b.box(0, 1.53, 0.0, 0.22, 0.07, 0.04, 0x30343a);

  const w = new GeoBuilder();
  w.cyl(0, 0, 0, 0.2, 0.12, dark, 14, 0, 0, Math.PI / 2);
  w.cyl(0, 0, 0, 0.11, 0.13, cream, 10, 0, 0, Math.PI / 2);
  w.box(0, 0, 0, 0.14, 0.03, 0.2, 0xb8b8b8);
  return { body: b.build(), wheel: w.build() };
}

/** Rack frame visual in the rack frame (top surface at y=0). */
export function rackGeometry(level: number): BufferGeometry {
  const b = new GeoBuilder();
  const chrome = 0xcfd3d8;
  b.box(0, -0.008, 0, 0.44, 0.016, 0.44, 0x3b3f44);
  const lip = 0.012 + 0.03 * level;
  const h = lip + 0.01;
  for (const [x, z, sx, sz] of [
    [0.215, 0, 0.02, 0.44],
    [-0.215, 0, 0.02, 0.44],
    [0, 0.215, 0.44, 0.02],
    [0, -0.215, 0.44, 0.02],
  ])
    b.box(x, h / 2 - 0.008, z, sx, h, sz, chrome);
  if (level >= 2) {
    for (const x of [-0.215, 0.215]) for (const z of [-0.215, 0.215]) b.box(x, h / 2, z, 0.03, h + 0.02, 0.03, 0xd7262c);
  }
  return b.build();
}

/** Pizza box: one geometry, material index 0 = lid (top), 1 = cardboard. */
export function boxGeometries() {
  return { w: 0.36, h: 0.05, d: 0.36 };
}

/** Small hatchback; body (tinted per instance) and fixed-colour details. Faces +z. */
export function carGeometries() {
  const body = new GeoBuilder();
  body.box(0, 0.52, 0, 1.52, 0.5, 2.9, 0xffffff);
  body.sphere(0, 0.58, 1.18, 0.76, 0.32, 0.5, 0xffffff, 12);
  body.sphere(0, 0.6, -1.2, 0.76, 0.34, 0.42, 0xffffff, 12);
  body.box(0, 0.98, -0.2, 1.3, 0.5, 1.5, 0xffffff);
  body.sphere(0, 1.22, -0.2, 0.66, 0.12, 0.76, 0xffffff, 10);
  const det = new GeoBuilder();
  const glass = 0x3b5368;
  det.box(0, 1.02, 0.56, 1.2, 0.36, 0.06, glass, 0, -0.35);
  det.box(0, 1.02, -0.96, 1.2, 0.34, 0.06, glass, 0, 0.3);
  det.box(0.656, 1.02, -0.2, 0.02, 0.32, 1.3, glass);
  det.box(-0.656, 1.02, -0.2, 0.02, 0.32, 1.3, glass);
  det.box(0.66, 1.02, -0.2, 0.03, 0.34, 0.06, 0xf0f0f0);
  det.box(-0.66, 1.02, -0.2, 0.03, 0.34, 0.06, 0xf0f0f0);
  for (const x of [-0.68, 0.68]) for (const z of [-0.95, 1.0]) {
    det.cyl(x, 0.3, z, 0.3, 0.22, 0x222222, 12, 0, 0, Math.PI / 2);
    det.cyl(x * 1.02, 0.3, z, 0.15, 0.23, 0xd8d8d8, 8, 0, 0, Math.PI / 2);
  }
  det.sphere(0.5, 0.68, 1.6, 0.13, 0.13, 0.05, 0xfff6cf, 8);
  det.sphere(-0.5, 0.68, 1.6, 0.13, 0.13, 0.05, 0xfff6cf, 8);
  det.box(0, 0.4, 1.6, 1.3, 0.1, 0.1, 0xd0d0d0);
  det.box(0, 0.4, -1.58, 1.3, 0.1, 0.1, 0xd0d0d0);
  det.box(0.55, 0.66, -1.6, 0.22, 0.12, 0.05, 0xd8302e);
  det.box(-0.55, 0.66, -1.6, 0.22, 0.12, 0.05, 0xd8302e);
  return { body: body.build(), detail: det.build() };
}

/** Three-wheeler delivery truck. */
export function apeGeometries() {
  const body = new GeoBuilder();
  body.sphere(0, 0.95, 0.75, 0.62, 0.62, 0.55, 0xffffff, 12);
  body.box(0, 0.7, 0.75, 1.22, 0.6, 0.9, 0xffffff);
  body.box(0, 0.62, -0.6, 1.3, 0.12, 1.6, 0xffffff);
  body.box(0.64, 0.82, -0.6, 0.04, 0.32, 1.6, 0xffffff);
  body.box(-0.64, 0.82, -0.6, 0.04, 0.32, 1.6, 0xffffff);
  body.box(0, 0.82, -1.39, 1.3, 0.32, 0.04, 0xffffff);
  const det = new GeoBuilder();
  det.box(0, 1.15, 1.08, 1.0, 0.42, 0.2, 0x334657);
  det.box(0, 1.55, 0.7, 1.15, 0.06, 0.9, 0xf5f0e6);
  det.cyl(0, 0.26, 1.15, 0.26, 0.18, 0x222222, 10, 0, 0, Math.PI / 2);
  for (const x of [-0.6, 0.6]) det.cyl(x, 0.26, -0.75, 0.26, 0.18, 0x222222, 10, 0, 0, Math.PI / 2);
  det.sphere(0, 0.85, 1.32, 0.12, 0.12, 0.05, 0xfff6cf, 8);
  // crates of lemons / tomatoes
  det.box(-0.3, 0.86, -0.3, 0.5, 0.36, 0.5, 0xb88a55);
  det.box(0.3, 0.86, -0.9, 0.5, 0.36, 0.5, 0xb88a55);
  for (let i = 0; i < 4; i++) det.sphere(-0.42 + (i % 2) * 0.22, 1.08, -0.42 + Math.floor(i / 2) * 0.22, 0.11, 0.11, 0.11, 0xf4d23c, 6);
  for (let i = 0; i < 4; i++) det.sphere(0.18 + (i % 2) * 0.22, 1.08, -1.02 + Math.floor(i / 2) * 0.22, 0.11, 0.11, 0.11, 0xe0402a, 6);
  return { body: body.build(), detail: det.build() };
}

/** Parked vespa (static, tinted body + details). */
export function vespaParkedGeometries() {
  const body = new GeoBuilder();
  body.sphere(0, 0.52, -0.38, 0.34, 0.26, 0.5, 0xffffff, 10);
  body.box(0, 0.36, -0.38, 0.5, 0.18, 0.8, 0xffffff);
  body.box(0, 0.62, 0.46, 0.5, 0.62, 0.1, 0xffffff, 0, -0.18);
  body.sphere(0, 0.35, 0.62, 0.17, 0.12, 0.3, 0xffffff, 8);
  const det = new GeoBuilder();
  det.box(0, 0.3, 0.12, 0.42, 0.08, 0.62, 0xf6ecd8);
  det.box(0, 0.8, -0.28, 0.36, 0.1, 0.66, 0x3a2a22);
  det.box(0, 1.14, 0.56, 0.7, 0.06, 0.08, 0xd6d9de);
  det.cyl(0, 0.9, 0.53, 0.05, 0.55, 0xd6d9de, 6, -0.25);
  det.sphere(0, 1.12, 0.65, 0.08, 0.08, 0.05, 0xfff3c4, 8);
  det.cyl(0, 0.2, 0.62, 0.2, 0.12, 0x2b2b2e, 10, 0, 0, Math.PI / 2);
  det.cyl(0, 0.2, -0.62, 0.2, 0.12, 0x2b2b2e, 10, 0, 0, Math.PI / 2);
  return { body: body.build(), detail: det.build() };
}

/** Window unit (facade plane z=0, outward +z): open shutters. */
export function windowGeometry(closed: boolean): BufferGeometry {
  const b = new GeoBuilder();
  const W = 0.95;
  const H = 1.45;
  if (!closed) {
    b.box(0, 0, 0.0, W, H, 0.06, PAL.glass);
    b.box(0, 0, 0.035, 0.05, H, 0.03, PAL.cream);
    b.box(-0.73, 0, 0.06, 0.48, H, 0.05, PAL.shutter, 0.35);
    b.box(0.73, 0, 0.06, 0.48, H, 0.05, PAL.shutter, -0.35);
  } else {
    b.box(-0.245, 0, 0.04, 0.48, H, 0.06, PAL.shutter);
    b.box(0.245, 0, 0.04, 0.48, H, 0.06, PAL.shutterDark);
  }
  b.box(0, H / 2 + 0.08, 0.05, W + 0.3, 0.14, 0.1, PAL.cream);
  b.box(0, -H / 2 - 0.05, 0.08, W + 0.3, 0.08, 0.18, PAL.cream);
  return b.build();
}

/** Balcony with railing and geranium pots. */
export function balconyGeometry(): BufferGeometry {
  const b = new GeoBuilder();
  b.box(0, 0, 0.35, 1.7, 0.12, 0.7, PAL.stone);
  b.box(0, 0.5, 0.68, 1.7, 0.05, 0.05, PAL.iron);
  b.box(0.83, 0.5, 0.35, 0.05, 0.05, 0.7, PAL.iron);
  b.box(-0.83, 0.5, 0.35, 0.05, 0.05, 0.7, PAL.iron);
  for (let i = 0; i < 7; i++) b.box(-0.75 + i * 0.25, 0.27, 0.68, 0.025, 0.45, 0.025, PAL.iron);
  b.box(0.83, 0.27, 0.35, 0.025, 0.45, 0.025, PAL.iron);
  b.box(-0.83, 0.27, 0.35, 0.025, 0.45, 0.025, PAL.iron);
  for (const x of [-0.55, 0.5]) {
    b.box(x, 0.17, 0.5, 0.32, 0.2, 0.2, 0xc4683f);
    b.sphere(x, 0.33, 0.5, 0.2, 0.13, 0.13, 0x4f8a3e, 7);
    b.sphere(x - 0.08, 0.42, 0.52, 0.06, 0.06, 0.06, 0xe23b4a, 5);
    b.sphere(x + 0.09, 0.4, 0.46, 0.06, 0.06, 0.06, 0xef5a7a, 5);
  }
  return b.build();
}

/** Arched front door with stone frame. */
export function doorGeometry(): BufferGeometry {
  const b = new GeoBuilder();
  b.box(0, 1.1, 0.02, 1.25, 2.2, 0.05, PAL.door);
  b.cyl(0, 2.2, 0.02, 0.625, 0.05, PAL.door, 12, Math.PI / 2, 0, 0);
  b.box(0, 1.1, 0.06, 0.04, 2.2, 0.03, shade(PAL.door, 0.7));
  b.box(-0.73, 1.2, 0.07, 0.22, 2.4, 0.14, PAL.stone);
  b.box(0.73, 1.2, 0.07, 0.22, 2.4, 0.14, PAL.stone);
  b.cyl(0, 2.25, 0.07, 0.84, 0.14, PAL.stone, 12, Math.PI / 2, 0, 0);
  b.box(0, 0.05, 0.25, 1.6, 0.1, 0.5, PAL.stone);
  return b.build();
}

export function lampGeometries() {
  const p = new GeoBuilder();
  p.cyl(0, 0.2, 0, 0.12, 0.4, PAL.iron, 8);
  p.cyl(0, 1.9, 0, 0.05, 3.4, PAL.iron, 6);
  p.box(0, 3.55, 0.3, 0.06, 0.06, 0.6, PAL.iron);
  p.cone(0, 3.62, 0.6, 0.2, 0.18, PAL.iron, 6);
  const bulb = new GeoBuilder();
  bulb.sphere(0, 3.42, 0.6, 0.13, 0.15, 0.13, 0xffe2a0, 8);
  return { post: p.build(), bulb: bulb.build() };
}

export function cypressGeometry(): BufferGeometry {
  const b = new GeoBuilder();
  b.cyl(0, 0.4, 0, 0.12, 0.8, 0x6b4a33, 5);
  b.sphere(0, 2.6, 0, 0.75, 2.3, 0.75, 0x3c6b3a, 8);
  b.sphere(0.1, 4.3, 0.05, 0.45, 1.0, 0.45, 0x467a42, 7);
  return b.build();
}
export function oliveGeometry(): BufferGeometry {
  const b = new GeoBuilder();
  b.cyl(0, 0.8, 0, 0.18, 1.6, 0x7a6249, 6, 0, 0, 0.15);
  b.sphere(0.3, 2.0, 0, 1.1, 0.75, 1.0, 0x8aa36a, 8);
  b.sphere(-0.6, 1.8, 0.4, 0.8, 0.6, 0.8, 0x7c9860, 7);
  b.sphere(0, 2.4, -0.5, 0.75, 0.5, 0.7, 0x95ad74, 7);
  return b.build();
}
export function bushGeometry(): BufferGeometry {
  const b = new GeoBuilder();
  b.sphere(0, 0.45, 0, 0.8, 0.55, 0.8, 0x5e8f45, 8);
  b.sphere(0.4, 0.6, 0.2, 0.15, 0.15, 0.15, 0xf0a0c0, 5);
  b.sphere(-0.3, 0.7, -0.2, 0.15, 0.15, 0.15, 0xffffff, 5);
  return b.build();
}

export function cafeGeometry(): BufferGeometry {
  const b = new GeoBuilder();
  b.cyl(0, 0.72, 0, 0.42, 0.04, 0xf7f3ea, 12);
  b.cyl(0, 0.36, 0, 0.04, 0.72, PAL.iron, 5);
  for (const a of [0, Math.PI]) {
    const x = Math.sin(a) * 0.7;
    const z = Math.cos(a) * 0.7;
    b.box(x, 0.45, z, 0.4, 0.05, 0.4, 0x2f6b4f);
    b.box(x, 0.7, z + Math.sign(z) * 0.18, 0.4, 0.45, 0.04, 0x2f6b4f);
    b.box(x, 0.22, z, 0.06, 0.44, 0.06, 0x2f6b4f);
  }
  b.cyl(0, 1.5, 0, 0.03, 2.2, 0xe8e1d0, 5);
  b.cone(0, 2.45, 0, 1.4, 0.5, 0xf4ead4, 8);
  b.cone(0, 2.52, 0, 0.75, 0.32, 0xd23a32, 8);
  b.cyl(0, 2.21, 0, 1.4, 0.06, 0xd23a32, 8);
  return b.build();
}

export function birdGeometry(color: number): BufferGeometry {
  const b = new GeoBuilder();
  b.sphere(0, 0, 0, 0.1, 0.09, 0.16, color, 6);
  b.sphere(0, 0.07, 0.13, 0.06, 0.06, 0.06, color, 6);
  b.cone(0, 0.07, 0.2, 0.02, 0.06, 0xe8a23a, 4, Math.PI / 2);
  b.box(0.15, 0.03, 0, 0.24, 0.015, 0.12, shade(color, 0.85));
  b.box(-0.15, 0.03, 0, 0.24, 0.015, 0.12, shade(color, 0.85));
  return b.build();
}

export function boatGeometry(): BufferGeometry {
  const b = new GeoBuilder();
  b.box(0, 0.35, 0, 1.8, 0.7, 5, 0xffffff);
  b.cone(0, 0.35, 2.9, 0.92, 1.0, 0xffffff, 4, Math.PI / 2, Math.PI / 4);
  b.box(0, 0.55, 0, 1.84, 0.12, 5.02, 0x2d6fb5);
  b.box(0, 1.1, -0.6, 1.2, 0.8, 1.6, 0xf6f0e2);
  b.box(0, 1.1, -0.6, 1.22, 0.3, 1.0, 0x334657);
  b.cyl(0, 2.2, 0.6, 0.05, 2.6, 0xdddddd, 5);
  return b.build();
}

export function bollardGeometry(): BufferGeometry {
  const b = new GeoBuilder();
  b.cyl(0, 0.3, 0, 0.18, 0.6, 0x34383c, 8);
  b.sphere(0, 0.62, 0, 0.2, 0.1, 0.2, 0x34383c, 8);
  return b.build();
}
export function crateGeometry(): BufferGeometry {
  const b = new GeoBuilder();
  b.box(0, 0.4, 0, 0.8, 0.8, 0.8, 0xb98a58);
  b.box(0, 0.4, 0.41, 0.82, 0.1, 0.02, 0x8e6640);
  b.box(0, 0.4, -0.41, 0.82, 0.1, 0.02, 0x8e6640);
  return b.build();
}

/** Stylised faceless customer. Returns group with named parts for animation. */
export function makeCustomer(seed: number, mat: MeshStandardMaterial): Group & { parts: Record<string, Object3D> } {
  const r = (n: number) => {
    const x = Math.sin(seed * 9301 + n * 49297) * 233280;
    return x - Math.floor(x);
  };
  const shirts = [0x3f7cc0, 0xe38f6c, 0x6f9a72, 0xf2c761, 0x9a5fb0, 0xd7262c, 0x47b3b0];
  const g = new Group() as Group & { parts: Record<string, Object3D> };
  const skin = SKIN[Math.floor(r(1) * SKIN.length)];
  const shirt = shirts[Math.floor(r(2) * shirts.length)];
  const legs = new GeoBuilder();
  legs.box(0.1, 0.4, 0, 0.14, 0.8, 0.16, 0x3a4250);
  legs.box(-0.1, 0.4, 0, 0.14, 0.8, 0.16, 0x3a4250);
  legs.box(0, 1.12, 0, 0.42, 0.66, 0.26, shirt);
  legs.sphere(0, 1.55, 0, 0.07, 0.08, 0.07, skin, 6);
  const head = new GeoBuilder();
  head.sphere(0, 0, 0, 0.17, 0.2, 0.17, skin, 10);
  const hat = Math.floor(r(3) * 4);
  if (hat === 0) {
    head.cyl(0, 0.13, 0, 0.18, 0.08, 0x2f3b55, 10);
    head.box(0, 0.1, 0.14, 0.2, 0.03, 0.14, 0x2f3b55);
  } else if (hat === 1) {
    head.cyl(0, 0.13, 0, 0.3, 0.03, 0xe8cf8c, 12);
    head.cyl(0, 0.2, 0, 0.16, 0.12, 0xe8cf8c, 10);
    head.cyl(0, 0.17, 0, 0.165, 0.035, 0xd7262c, 10);
  } else if (hat === 2) {
    head.sphere(0, 0.14, 0, 0.19, 0.08, 0.19, 0xb3422f, 10);
  } else {
    head.sphere(0, 0.08, -0.03, 0.18, 0.15, 0.18, 0x4a3426, 10);
  }
  const arm = new GeoBuilder();
  arm.box(0, -0.25, 0, 0.11, 0.55, 0.11, shirt);
  arm.sphere(0, -0.55, 0, 0.06, 0.06, 0.06, skin, 6);
  const body = new Mesh(legs.build(), mat);
  const headM = new Mesh(head.build(), mat);
  headM.position.y = 1.72;
  const armGeo = arm.build();
  const armL = new Mesh(armGeo, mat);
  armL.position.set(0.27, 1.4, 0);
  const armR = new Mesh(armGeo, mat);
  armR.position.set(-0.27, 1.4, 0);
  for (const m of [body, headM, armL, armR]) {
    m.castShadow = true;
    g.add(m);
  }
  g.parts = { body, head: headM, armL, armR };
  return g;
}
