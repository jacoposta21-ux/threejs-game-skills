import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Procedural insect models. Each factory returns vertex-coloured geometry with
 * +Z forward and +Y up, roughly to scale with a 1.1-unit snail.
 */

type Part = [THREE.BufferGeometry, number];

function colored(parts: Part[]): THREE.BufferGeometry {
  const geos = parts.map(([geo, color]) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    const c = new THREE.Color(color);
    const n = g.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  });
  return mergeGeometries(geos)!;
}

function sphere(r: number, sx: number, sy: number, sz: number, x: number, y: number, z: number, seg = 12): THREE.BufferGeometry {
  return new THREE.SphereGeometry(r, seg, Math.max(6, seg - 4)).scale(sx, sy, sz).translate(x, y, z);
}

/** A thin limb from a to b. */
function limb(a: THREE.Vector3, b: THREE.Vector3, r: number): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r * 0.7, r, len, 5);
  g.translate(0, len / 2, 0);
  const dir = b.clone().sub(a).normalize();
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  g.translate(a.x, a.y, a.z);
  return g;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function legs(parts: Part[], color: number, z0: number, spread: number, y: number, r: number, count = 3, gap = 0.18): void {
  for (let i = 0; i < count; i += 1) {
    const z = z0 + (i - 1) * gap;
    for (const s of [-1, 1]) {
      const knee = V(s * spread, y + 0.12, z + (i - 1) * 0.08);
      const foot = V(s * spread * 1.6, 0, z + (i - 1) * 0.16);
      parts.push([limb(V(s * 0.06, y, z), knee, r), color]);
      parts.push([limb(knee, foot, r * 0.8), color]);
    }
  }
}

export function antGeometry(): THREE.BufferGeometry {
  const body = 0x5a2216;
  const parts: Part[] = [
    [sphere(0.16, 1, 0.9, 1.1, 0, 0.3, 0.38), 0x6e2a1a],
    [sphere(0.1, 1, 0.9, 1.6, 0, 0.28, 0.12), body],
    [sphere(0.22, 1, 0.85, 1.35, 0, 0.32, -0.22), body],
  ];
  legs(parts, 0x3a160e, 0.12, 0.2, 0.26, 0.022, 3, 0.12);
  for (const s of [-1, 1]) {
    parts.push([limb(V(s * 0.05, 0.4, 0.46), V(s * 0.16, 0.6, 0.56), 0.016), 0x3a160e]);
    parts.push([limb(V(s * 0.16, 0.6, 0.56), V(s * 0.24, 0.55, 0.72), 0.014), 0x3a160e]);
    parts.push([sphere(0.045, 1, 1, 1, s * 0.1, 0.36, 0.48, 8), 0x111111]);
  }
  return colored(parts);
}

export function ladybugGeometry(): THREE.BufferGeometry {
  const dome = new THREE.SphereGeometry(0.42, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.8, 1.15).translate(0, 0.05, 0);
  const parts: Part[] = [
    [dome, 0xe12a24],
    [sphere(0.2, 1.1, 0.8, 0.8, 0, 0.12, 0.42), 0x161616],
    [new THREE.BoxGeometry(0.02, 0.02, 0.9).translate(0, 0.39, 0), 0x161616],
  ];
  const spots: [number, number][] = [
    [0.18, 0.22],
    [-0.18, 0.22],
    [0.24, -0.12],
    [-0.24, -0.12],
    [0.1, -0.32],
    [-0.1, -0.32],
  ];
  for (const [x, z] of spots) {
    const y = Math.sqrt(Math.max(0, 0.42 * 0.42 - x * x - (z / 1.15) * (z / 1.15))) * 0.8 + 0.05;
    parts.push([sphere(0.07, 1, 0.35, 1, x, y, z, 8), 0x161616]);
  }
  for (const s of [-1, 1]) parts.push([sphere(0.05, 1, 1, 1, s * 0.08, 0.2, 0.56, 8), 0xffffff]);
  return colored(parts);
}

export function beeGeometry(): THREE.BufferGeometry {
  const body = new THREE.CapsuleGeometry(0.22, 0.42, 4, 12).rotateX(Math.PI / 2);
  // Stripes by z.
  const g = body.index ? body.toNonIndexed() : body;
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    const z = pos.getZ(i);
    const c = Math.floor((z + 0.5) * 7) % 2 ? new THREE.Color(0x1d1a14) : new THREE.Color(0xffc21a);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.deleteAttribute('uv');
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const rest = colored([
    [sphere(0.15, 1, 1, 1, 0, 0.02, 0.4), 0x1d1a14],
    [new THREE.ConeGeometry(0.05, 0.16, 6).rotateX(-Math.PI / 2).translate(0, 0, -0.5), 0x1d1a14],
    [sphere(0.06, 1, 1, 1, 0.09, 0.06, 0.5, 8), 0x111111],
    [sphere(0.06, 1, 1, 1, -0.09, 0.06, 0.5, 8), 0x111111],
  ]);
  return mergeGeometries([g, rest])!;
}

/** Two translucent wings as one mesh, hinged on the x = 0 line. */
export function wingGeometry(length: number, width: number, pairs = 1): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let p = 0; p < pairs; p += 1) {
    for (const s of [-1, 1]) {
      const w = new THREE.CircleGeometry(1, 14).scale(length / 2, width / 2, 1);
      w.rotateX(-Math.PI / 2).translate((s * length) / 2, 0, -p * width * 0.9);
      parts.push(w);
    }
  }
  return mergeGeometries(parts)!;
}

export function dragonflyGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [
    [new THREE.CapsuleGeometry(0.07, 1.6, 3, 8).rotateX(Math.PI / 2).translate(0, 0, -0.55), 0x2fb5a4],
    [sphere(0.16, 1, 0.9, 1.2, 0, 0, 0.3), 0x2f8fd0],
    [sphere(0.14, 1, 1, 1, 0.1, 0.04, 0.48, 10), 0x1a3a6a],
    [sphere(0.14, 1, 1, 1, -0.1, 0.04, 0.48, 10), 0x1a3a6a],
  ];
  return colored(parts);
}

export function grasshopperGeometry(): THREE.BufferGeometry {
  const green = 0x6fbe44;
  const dark = 0x3f8a2c;
  const parts: Part[] = [
    [new THREE.CapsuleGeometry(0.2, 0.9, 4, 10).rotateX(Math.PI / 2).scale(1, 1.1, 1).translate(0, 0.42, -0.05), green],
    [sphere(0.22, 0.9, 1.1, 1, 0, 0.5, 0.55), green],
    [sphere(0.07, 1, 1, 1, 0.14, 0.6, 0.65, 8), 0x2a2a1a],
    [sphere(0.07, 1, 1, 1, -0.14, 0.6, 0.65, 8), 0x2a2a1a],
    [new THREE.BoxGeometry(0.34, 0.06, 0.9).translate(0, 0.62, -0.15), dark],
  ];
  for (const s of [-1, 1]) {
    // Big jumping legs.
    const hip = V(s * 0.16, 0.45, -0.05);
    const knee = V(s * 0.3, 0.85, -0.45);
    const foot = V(s * 0.32, 0, -0.7);
    parts.push([limb(hip, knee, 0.07), green]);
    parts.push([limb(knee, foot, 0.035), dark]);
    parts.push([limb(V(s * 0.1, 0.35, 0.3), V(s * 0.28, 0, 0.45), 0.025), dark]);
    parts.push([limb(V(s * 0.1, 0.35, 0.1), V(s * 0.3, 0, 0.12), 0.025), dark]);
    parts.push([limb(V(s * 0.08, 0.66, 0.72), V(s * 0.3, 1.05, 1.0), 0.015), dark]);
  }
  return colored(parts);
}

/** A woodlouse curled into a ball, banded plates. */
export function pillbugGeometry(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 24, 16);
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const a = new THREE.Color(0x6f7890);
  const b = new THREE.Color(0x4a5268);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    const ang = Math.atan2(pos.getY(i), pos.getZ(i));
    const band = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 11);
    const seam = Math.abs(Math.sin((ang + Math.PI) * 5.5)) < 0.18;
    c.copy(band % 2 ? a : b);
    if (seam) c.multiplyScalar(0.7);
    col.set([c.r, c.g, c.b], i * 3);
    // Plates bulge slightly.
    const k = 1 + 0.04 * Math.cos((ang + Math.PI) * 11);
    pos.setXYZ(i, pos.getX(i) * 0.92, pos.getY(i) * k, pos.getZ(i) * k);
  }
  g.deleteAttribute('uv');
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export function beetleGeometry(): THREE.BufferGeometry {
  const shell = 0x3a1f12;
  const parts: Part[] = [
    [new THREE.SphereGeometry(0.75, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.9, 0.7, 1.25).translate(0, 0.3, -0.2), shell],
    [new THREE.BoxGeometry(0.02, 0.02, 1.7).translate(0, 0.82, -0.2), 0x1a0e08],
    [sphere(0.42, 1.05, 0.8, 0.8, 0, 0.45, 0.62), 0x2a160c],
    [sphere(0.2, 1, 0.8, 1, 0, 0.35, 0.98), 0x2a160c],
  ];
  // The rhino horn.
  const horn = new THREE.CatmullRomCurve3([V(0, 0.4, 1.05), V(0, 0.6, 1.35), V(0, 1.05, 1.45), V(0, 1.3, 1.3)]);
  parts.push([new THREE.TubeGeometry(horn, 10, 0.07, 6), 0x1a0e08]);
  legs(parts, 0x1a0e08, 0.3, 0.45, 0.3, 0.05, 3, 0.35);
  return colored(parts);
}
