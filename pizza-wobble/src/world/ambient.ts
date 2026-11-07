/** Living-world details: pigeons that take off when you pass, circling gulls, bobbing boats. */
import { DynamicDrawUsage, Euler, Group, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import { materials } from '../render/materials.ts';
import { birdGeometry } from './models.ts';
import type { CityInfo } from './city.ts';
import { Rng } from '../levels/rng.ts';

interface Bird {
  hx: number;
  hz: number;
  hy: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  state: 0 | 1 | 2; // 0 ground, 1 flying away, 2 returning
  t: number;
  peck: number;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _p = new Vector3();
const _s = new Vector3(1, 1, 1);
const _r = new Matrix4();

export class Ambient {
  group = new Group();
  private pigeons: Bird[] = [];
  private pigeonMesh: InstancedMesh | null = null;
  private gullMesh: InstancedMesh | null = null;
  private gulls: { cx: number; cz: number; r: number; h: number; w: number; ph: number }[] = [];
  private boats: CityInfo['boats'];
  onFlutter: () => void = () => {};
  onGull: () => void = () => {};
  private gullTimer = 4;

  constructor(city: CityInfo, ground: (x: number, z: number) => number, seed: number, district: string, mapW: number, waterLine: number) {
    const rng = new Rng(seed ^ 0xb1d);
    const mats = materials();
    for (const p of city.plazas) {
      const n = 10;
      for (let i = 0; i < n; i++) {
        const a = rng.range(0, Math.PI * 2);
        const r = rng.range(2.6, p.r - 1);
        const x = p.x + Math.cos(a) * r;
        const z = p.z + Math.sin(a) * r;
        const y = ground(x, z) + 0.12;
        this.pigeons.push({ hx: x, hz: z, hy: y, x, y, z, vx: 0, vy: 0, vz: 0, yaw: rng.range(0, 6.28), state: 0, t: 0, peck: rng.range(0, 6) });
      }
    }
    if (this.pigeons.length) {
      this.pigeonMesh = new InstancedMesh(birdGeometry(0x9aa1ab), mats.world, this.pigeons.length);
      this.pigeonMesh.instanceMatrix.setUsage(DynamicDrawUsage);
      this.pigeonMesh.castShadow = true;
      this.pigeonMesh.frustumCulled = false;
      this.group.add(this.pigeonMesh);
    }
    if (district === 'porto') {
      for (let i = 0; i < 9; i++)
        this.gulls.push({ cx: rng.range(20, mapW - 20), cz: waterLine + rng.range(-25, 25), r: rng.range(8, 20), h: rng.range(9, 18), w: rng.range(0.25, 0.5) * (rng.chance(0.5) ? 1 : -1), ph: rng.range(0, 6) });
      this.gullMesh = new InstancedMesh(birdGeometry(0xf7f7f2), mats.world, this.gulls.length);
      this.gullMesh.instanceMatrix.setUsage(DynamicDrawUsage);
      this.gullMesh.frustumCulled = false;
      this.group.add(this.gullMesh);
    }
    this.boats = city.boats;
  }

  update(dt: number, time: number, px: number, pz: number, pspeed: number) {
    if (this.pigeonMesh) {
      let startled = false;
      this.pigeons.forEach((b, i) => {
        const d = Math.hypot(px - b.x, pz - b.z);
        if (b.state === 0 && d < 6 + pspeed * 0.4) {
          b.state = 1;
          b.t = 0;
          const ax = (b.x - px) / (d || 1);
          const az = (b.z - pz) / (d || 1);
          b.vx = ax * 4 + (Math.random() - 0.5) * 3;
          b.vz = az * 4 + (Math.random() - 0.5) * 3;
          b.vy = 4 + Math.random() * 2;
          startled = true;
        }
        if (b.state === 1) {
          b.t += dt;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.z += b.vz * dt;
          b.vy *= 0.99;
          b.yaw = Math.atan2(b.vx, b.vz);
          if (b.t > 4 && Math.hypot(px - b.hx, pz - b.hz) > 14) b.state = 2;
        } else if (b.state === 2) {
          const dx = b.hx - b.x;
          const dy = b.hy - b.y;
          const dz = b.hz - b.z;
          const l = Math.hypot(dx, dy, dz);
          if (l < 0.2) {
            b.state = 0;
            b.x = b.hx;
            b.y = b.hy;
            b.z = b.hz;
          } else {
            const sp = Math.min(6, l * 2);
            b.x += (dx / l) * sp * dt;
            b.y += (dy / l) * sp * dt;
            b.z += (dz / l) * sp * dt;
            b.yaw = Math.atan2(dx, dz);
          }
        } else {
          b.peck += dt;
        }
        const flap = b.state === 0 ? 0 : Math.sin(time * 30 + i) * 0.5;
        const peck = b.state === 0 ? Math.max(0, Math.sin(b.peck * 3)) * 0.4 : 0;
        _e.set(peck, b.yaw, flap, 'YXZ');
        _q.setFromEuler(_e);
        _p.set(b.x, b.y + (b.state === 0 ? 0 : 0.05), b.z);
        _m.compose(_p, _q, _s);
        this.pigeonMesh!.setMatrixAt(i, _m);
      });
      this.pigeonMesh.instanceMatrix.needsUpdate = true;
      if (startled) this.onFlutter();
    }
    if (this.gullMesh) {
      this.gulls.forEach((g, i) => {
        const a = time * g.w + g.ph;
        const x = g.cx + Math.cos(a) * g.r;
        const z = g.cz + Math.sin(a) * g.r;
        const yaw = Math.atan2(-Math.sin(a) * Math.sign(g.w), Math.cos(a) * Math.sign(g.w));
        _e.set(0, yaw, Math.sign(g.w) * 0.35 + Math.sin(time * 6 + i) * 0.15, 'YXZ');
        _q.setFromEuler(_e);
        _p.set(x, g.h + Math.sin(time * 0.7 + i) * 1.2, z);
        _s.set(2.2, 2.2, 2.2);
        _m.compose(_p, _q, _s);
        this.gullMesh!.setMatrixAt(i, _m);
      });
      _s.set(1, 1, 1);
      this.gullMesh.instanceMatrix.needsUpdate = true;
      this.gullTimer -= dt;
      if (this.gullTimer < 0) {
        this.gullTimer = 5 + Math.random() * 6;
        this.onGull();
      }
    }
    if (this.boats) {
      const { mesh, base } = this.boats;
      for (let i = 0; i < base.length; i++) {
        _m.copy(base[i]);
        _e.set(Math.sin(time * 0.9 + i) * 0.04, 0, Math.sin(time * 1.1 + i * 2) * 0.06);
        _q.setFromEuler(_e);
        _m.multiply(_r.makeRotationFromQuaternion(_q));
        _m.elements[13] += Math.sin(time * 1.3 + i) * 0.12;
        mesh.setMatrixAt(i, _m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
