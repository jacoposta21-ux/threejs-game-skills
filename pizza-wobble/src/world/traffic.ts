/** Traffic on fixed closed loops: simple stops at intersections and behind obstacles. */
import type RAPIER_NS from '@dimforge/rapier3d-compat';
import { Color, DynamicDrawUsage, Euler, Group, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import type { TrafficPath } from '../levels/types.ts';
import { GROUPS } from '../physics/groups.ts';
import { materials } from '../render/materials.ts';
import { apeGeometries, carGeometries } from './models.ts';
import { Rng } from '../levels/rng.ts';

type R = typeof RAPIER_NS;

interface Car {
  path: TrafficPath;
  lens: number[];
  total: number;
  s: number;
  seg: number;
  speed: number;
  cruise: number;
  pause: number;
  heading: number;
  x: number;
  z: number;
  y: number;
  body: RAPIER_NS.RigidBody;
  collider: RAPIER_NS.Collider;
  idx: number;
  ape: boolean;
  blocked: number;
  honked: boolean;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _p = new Vector3();
const _s = new Vector3(1, 1, 1);

export class Traffic {
  cars: Car[] = [];
  group = new Group();
  private carBody: InstancedMesh;
  private carDet: InstancedMesh;
  private apeBody: InstancedMesh;
  private apeDet: InstancedMesh;
  handles = new Set<number>();
  onHonk: () => void = () => {};

  constructor(rapier: R, world: RAPIER_NS.World, paths: TrafficPath[], ground: (x: number, z: number) => number, seed: number) {
    const mats = materials();
    const cg = carGeometries();
    const ag = apeGeometries();
    const nCar = Math.max(1, paths.filter((p) => p.vehicle === 'car').length);
    const nApe = Math.max(1, paths.filter((p) => p.vehicle === 'ape').length);
    this.carBody = new InstancedMesh(cg.body, mats.vehicle, nCar);
    this.carDet = new InstancedMesh(cg.detail, mats.world, nCar);
    this.apeBody = new InstancedMesh(ag.body, mats.vehicle, nApe);
    this.apeDet = new InstancedMesh(ag.detail, mats.world, nApe);
    for (const im of [this.carBody, this.carDet, this.apeBody, this.apeDet]) {
      im.instanceMatrix.setUsage(DynamicDrawUsage);
      im.castShadow = true;
      im.frustumCulled = false;
      im.count = 0;
      this.group.add(im);
    }
    const rng = new Rng(seed ^ 0xca75);
    const colors = [0xe9e4d8, 0x9fd3c7, 0xf4b6c2, 0x6fa8dc, 0xf6e27f, 0xe38f6c, 0xb8d98a, 0xffffff];
    const apeColors = [0x7fb8d8, 0xf2c94c, 0x9fd3c7];
    const c = new Color();
    let ci = 0;
    let ai = 0;
    for (const path of paths) {
      const pts = path.points;
      const lens: number[] = [];
      let total = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        lens.push(l);
        total += l;
      }
      const ape = path.vehicle === 'ape';
      const body = world.createRigidBody(rapier.RigidBodyDesc.kinematicPositionBased());
      const collider = world.createCollider(
        rapier.ColliderDesc.cuboid(ape ? 0.7 : 0.78, 0.7, ape ? 1.5 : 1.6).setTranslation(0, 0.75, 0).setCollisionGroups(GROUPS.car),
        body,
      );
      this.handles.add(collider.handle);
      const car: Car = {
        path,
        lens,
        total,
        s: rng.range(0, total),
        seg: 0,
        speed: 0,
        cruise: ape ? rng.range(5, 6.5) : rng.range(6.5, 8.5),
        pause: 0,
        heading: 0,
        x: 0,
        z: 0,
        y: 0,
        body,
        collider,
        idx: ape ? ai++ : ci++,
        ape,
        blocked: 0,
        honked: false,
      };
      if (ape) this.apeBody.setColorAt(car.idx, c.setHex(rng.pick(apeColors)));
      else this.carBody.setColorAt(car.idx, c.setHex(rng.pick(colors)));
      this.locate(car, ground, true);
      body.setTranslation({ x: car.x, y: car.y, z: car.z }, true);
      this.cars.push(car);
    }
    this.carBody.count = this.carDet.count = ci;
    this.apeBody.count = this.apeDet.count = ai;
  }

  private locate(car: Car, ground: (x: number, z: number) => number, snap: boolean) {
    let s = car.s;
    let i = 0;
    while (s > car.lens[i]) {
      s -= car.lens[i];
      i = (i + 1) % car.lens.length;
    }
    car.seg = i;
    const pts = car.path.points;
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const t = car.lens[i] > 0 ? s / car.lens[i] : 0;
    car.x = a[0] + (b[0] - a[0]) * t;
    car.z = a[1] + (b[1] - a[1]) * t;
    car.y = ground(car.x, car.z);
    const target = Math.atan2(b[0] - a[0], b[1] - a[1]);
    if (snap) car.heading = target;
    else {
      let d = target - car.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      car.heading += d * 0.12;
    }
    return car.lens[i] - s; // distance to next vertex
  }

  step(dt: number, px: number, pz: number, ground: (x: number, z: number) => number) {
    for (const car of this.cars) {
      const fx = Math.sin(car.heading);
      const fz = Math.cos(car.heading);
      // obstacle ahead: player or another car
      let block = false;
      const dxp = px - car.x;
      const dzp = pz - car.z;
      const ahead = dxp * fx + dzp * fz;
      const lateral = Math.abs(dxp * fz - dzp * fx);
      if (ahead > 0 && ahead < 7.5 && lateral < 2.0) block = true;
      if (!block)
        for (const o of this.cars) {
          if (o === car) continue;
          const dx = o.x - car.x;
          const dz = o.z - car.z;
          const a = dx * fx + dz * fz;
          if (a > 0 && a < 5.5 && Math.abs(dx * fz - dz * fx) < 1.6) {
            block = true;
            break;
          }
        }
      let target = car.cruise;
      if (car.pause > 0) {
        car.pause -= dt;
        target = 0;
      }
      if (block) {
        target = 0;
        car.blocked += dt;
        if (car.blocked > 1.6 && !car.honked && ahead < 7.5) {
          car.honked = true;
          this.onHonk();
        }
      } else {
        car.blocked = 0;
        car.honked = false;
      }
      const toVertex = this.locate(car, ground, false);
      if (toVertex < 4) target = Math.min(target, 3 + toVertex);
      const acc = target > car.speed ? 3 : 7;
      car.speed += Math.sign(target - car.speed) * Math.min(Math.abs(target - car.speed), acc * dt);
      const prevSeg = car.seg;
      car.s = (car.s + car.speed * dt) % car.total;
      this.locate(car, ground, false);
      if (car.seg !== prevSeg && car.pause <= 0) car.pause = 0.5; // brief stop at each intersection
      _e.set(0, car.heading, 0);
      _q.setFromEuler(_e);
      car.body.setNextKinematicTranslation({ x: car.x, y: car.y, z: car.z });
      car.body.setNextKinematicRotation(_q);
    }
  }

  render(time: number) {
    for (const car of this.cars) {
      const bounce = Math.sin(time * 9 + car.idx) * 0.012 * Math.min(1, car.speed / 3);
      _e.set(0, car.heading, 0);
      _q.setFromEuler(_e);
      _p.set(car.x, car.y + bounce, car.z);
      _m.compose(_p, _q, _s);
      if (car.ape) {
        this.apeBody.setMatrixAt(car.idx, _m);
        this.apeDet.setMatrixAt(car.idx, _m);
      } else {
        this.carBody.setMatrixAt(car.idx, _m);
        this.carDet.setMatrixAt(car.idx, _m);
      }
    }
    this.carBody.instanceMatrix.needsUpdate = this.carDet.instanceMatrix.needsUpdate = true;
    this.apeBody.instanceMatrix.needsUpdate = this.apeDet.instanceMatrix.needsUpdate = true;
  }

  dispose(world: RAPIER_NS.World) {
    for (const c of this.cars) world.removeRigidBody(c.body);
    this.cars = [];
    this.group.removeFromParent();
  }
}
