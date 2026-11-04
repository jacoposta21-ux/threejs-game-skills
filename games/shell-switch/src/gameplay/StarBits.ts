import * as THREE from 'three';
import type { AreaId } from './types';
import type { Materials } from '../world/Materials';

export interface BitDef {
  id: string;
  area: AreaId;
  x: number;
  y: number;
  z: number;
}

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const s = new THREE.Vector3();
const p = new THREE.Vector3();

/** All Star Bits in one InstancedMesh. */
export class StarBits {
  readonly mesh: THREE.InstancedMesh;
  readonly collected: boolean[];
  private readonly pulse: number[];

  constructor(readonly defs: BitDef[], mats: Materials) {
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      const r = i % 2 ? 0.11 : 0.26;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 });
    geo.center();
    const mat = new THREE.MeshStandardMaterial({ color: '#ffd64a', emissive: '#ffb020', emissiveIntensity: 0.55, roughness: 0.3, metalness: 0.2 });
    void mats;
    this.mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, defs.length));
    this.mesh.castShadow = false;
    this.mesh.frustumCulled = false;
    this.collected = defs.map(() => false);
    this.pulse = defs.map(() => 0);
  }

  update(dt: number, time: number): void {
    for (let i = 0; i < this.defs.length; i += 1) {
      const d = this.defs[i];
      let sc = 1;
      if (this.collected[i]) {
        this.pulse[i] = Math.max(0, this.pulse[i] - dt * 3);
        sc = this.pulse[i] * 1.8;
      }
      e.set(0, time * 2.2 + i, 0);
      q.setFromEuler(e);
      p.set(d.x, d.y + Math.sin(time * 3 + i) * 0.1 + (this.collected[i] ? (1 - this.pulse[i]) * 1.4 : 0), d.z);
      s.setScalar(sc);
      m4.compose(p, q, s);
      this.mesh.setMatrixAt(i, m4);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Returns index collected this frame near pos, or -1. */
  check(px: number, py: number, pz: number, r: number): number {
    for (let i = 0; i < this.defs.length; i += 1) {
      if (this.collected[i]) continue;
      const d = this.defs[i];
      if (Math.abs(d.y - (py + 0.5)) > 1.3) continue;
      if ((d.x - px) ** 2 + (d.z - pz) ** 2 < r * r) {
        this.collected[i] = true;
        this.pulse[i] = 1;
        return i;
      }
    }
    return -1;
  }

  markCollected(ids: Set<string>): void {
    this.defs.forEach((d, i) => {
      this.collected[i] = ids.has(d.id);
      this.pulse[i] = 0;
    });
  }

  countIn(area: AreaId | null): [number, number] {
    let got = 0;
    let total = 0;
    this.defs.forEach((d, i) => {
      if (area && d.area !== area) return;
      total += 1;
      if (this.collected[i]) got += 1;
    });
    return [got, total];
  }
}
