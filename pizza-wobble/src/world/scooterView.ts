/** Visuals for the scooter, rack, physical boxes, lost-box flights and delivered-box throws. */
import {
  BoxGeometry,
  CircleGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  DynamicDrawUsage,
  type Material,
} from 'three';
import { materials } from '../render/materials.ts';
import { rackGeometry, scooterGeometries } from './models.ts';
import type { PhysicsSim } from '../physics/sim.ts';
import { BOX } from '../game/rules.ts';
import { PAL } from '../render/textures.ts';

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3(1, 1, 1);

interface Flight {
  group: Group;
  lid: Group;
  pizza: Mesh;
  t: number;
  dur: number;
  vel: Vector3;
  spin: Vector3;
  active: boolean;
  kind: 'lost' | 'throw';
  from: Vector3;
  to: Vector3;
  onLand?: () => void;
}

export class ScooterView {
  readonly root = new Group();
  readonly body = new Group();
  readonly rack = new Group();
  private wheelF: Mesh;
  private wheelB: Mesh;
  private rackMesh: Mesh;
  private boxes: InstancedMesh;
  private flights: Flight[] = [];
  private headlight: Mesh;

  constructor() {
    const mats = materials();
    const g = scooterGeometries();
    const bodyMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.08 });
    const bm = new Mesh(g.body, bodyMat);
    bm.castShadow = true;
    this.body.add(bm);
    this.wheelF = new Mesh(g.wheel, mats.world);
    this.wheelF.position.set(0, 0.2, 0.62);
    this.wheelB = new Mesh(g.wheel, mats.world);
    this.wheelB.position.set(0, 0.2, -0.62);
    this.wheelF.castShadow = this.wheelB.castShadow = true;
    this.body.add(this.wheelF, this.wheelB);
    this.headlight = new Mesh(new CircleGeometry(0.07, 12), mats.glow);
    this.headlight.position.set(0, 1.12, 0.745);
    this.body.add(this.headlight);
    this.rackMesh = new Mesh(rackGeometry(0), mats.world);
    this.rackMesh.castShadow = true;
    this.rack.add(this.rackMesh);
    const boxGeo = new BoxGeometry(BOX.w, BOX.h, BOX.d);
    const side = mats.boxSide;
    const boxMats: Material[] = [side, side, mats.boxLid, side, side, side];
    this.boxes = new InstancedMesh(boxGeo, boxMats, 12);
    this.boxes.instanceMatrix.setUsage(DynamicDrawUsage);
    this.boxes.castShadow = true;
    this.boxes.frustumCulled = false;
    this.root.add(this.body, this.rack, this.boxes);
    for (let i = 0; i < 6; i++) this.flights.push(this.makeFlight());
  }

  setRackLevel(level: number) {
    this.rackMesh.geometry.dispose();
    this.rackMesh.geometry = rackGeometry(level);
  }

  private makeFlight(): Flight {
    const mats = materials();
    const group = new Group();
    const base = new Mesh(new BoxGeometry(BOX.w, BOX.h * 0.6, BOX.d), mats.boxSide);
    base.castShadow = true;
    group.add(base);
    const lid = new Group();
    lid.position.set(0, BOX.h * 0.3, -BOX.d / 2);
    const lidMesh = new Mesh(new BoxGeometry(BOX.w, 0.01, BOX.d), [mats.boxSide, mats.boxSide, mats.boxLid, mats.boxSide, mats.boxSide, mats.boxSide]);
    lidMesh.position.set(0, 0, BOX.d / 2);
    lid.add(lidMesh);
    group.add(lid);
    const pizza = new Mesh(new CircleGeometry(0.16, 20), mats.pizza);
    pizza.rotation.x = -Math.PI / 2;
    pizza.position.y = BOX.h * 0.32;
    group.add(pizza);
    group.visible = false;
    this.root.add(group);
    return { group, lid, pizza, t: 0, dur: 1, vel: new Vector3(), spin: new Vector3(), active: false, kind: 'lost', from: new Vector3(), to: new Vector3() };
  }

  private freeFlight(): Flight {
    let f = this.flights.find((x) => !x.active);
    if (!f) {
      f = this.flights[0];
    }
    return f;
  }

  /** A lost box flies off, opens, and the pizza pirouettes out. */
  launchLost(pos: Vector3, rot: Quaternion, vel: Vector3) {
    const f = this.freeFlight();
    f.active = true;
    f.kind = 'lost';
    f.t = 0;
    f.dur = 1.8;
    f.group.visible = true;
    f.group.position.copy(pos);
    f.group.quaternion.copy(rot);
    f.vel.copy(vel).multiplyScalar(0.6);
    f.vel.y = Math.max(f.vel.y, 0) + 3.2;
    f.spin.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 6);
    f.pizza.position.set(0, BOX.h * 0.32, 0);
    f.pizza.rotation.set(-Math.PI / 2, 0, 0);
    f.lid.rotation.x = 0;
    f.group.scale.setScalar(1);
  }

  /** A delivered box is tossed in an arc to the customer. */
  launchThrow(from: Vector3, to: Vector3, onLand: () => void) {
    const f = this.freeFlight();
    f.active = true;
    f.kind = 'throw';
    f.t = 0;
    f.dur = 0.65;
    f.from.copy(from);
    f.to.copy(to);
    f.onLand = onLand;
    f.group.visible = true;
    f.lid.rotation.x = 0;
    f.pizza.position.set(0, BOX.h * 0.32, 0);
    f.pizza.rotation.set(-Math.PI / 2, 0, 0);
    f.group.scale.setScalar(1);
  }

  updateFlights(dt: number) {
    for (const f of this.flights) {
      if (!f.active) continue;
      f.t += dt;
      const k = f.t / f.dur;
      if (f.kind === 'lost') {
        f.vel.y -= 9.8 * dt;
        f.group.position.addScaledVector(f.vel, dt);
        _q.setFromAxisAngle(_p.copy(f.spin).normalize(), f.spin.length() * dt);
        f.group.quaternion.multiply(_q);
        f.lid.rotation.x = -Math.min(1.9, f.t * 5);
        // pizza pops out and spins
        f.pizza.position.y = BOX.h * 0.32 + Math.min(0.6, f.t * 1.6) - Math.max(0, f.t - 0.5) ** 2 * 1.2;
        f.pizza.rotation.z += dt * 14;
        f.pizza.rotation.x = -Math.PI / 2 + Math.sin(f.t * 9) * 0.5;
        if (k > 0.75) f.group.scale.setScalar(Math.max(0.01, (1 - k) * 4));
      } else {
        const e = Math.min(1, k);
        f.group.position.lerpVectors(f.from, f.to, e);
        f.group.position.y += Math.sin(e * Math.PI) * 1.4;
        f.group.rotation.set(0, e * Math.PI * 2, Math.sin(e * Math.PI) * 0.4);
      }
      if (k >= 1) {
        f.active = false;
        f.group.visible = false;
        if (f.kind === 'throw') f.onLand?.();
      }
    }
  }

  update(sim: PhysicsSim, jitter: number) {
    const sc = sim.scooter;
    this.body.position.copy(sc.bodyPos);
    this.body.position.y += jitter;
    this.body.quaternion.copy(sc.bodyRot);
    this.wheelF.rotation.x = sc.wheelSpin;
    this.wheelB.rotation.x = sc.wheelSpin;
    this.wheelF.rotation.y = sc.steerSmoothed * 0.35;
    const t = sim.scooter.rack.translation();
    const r = sim.scooter.rack.rotation();
    this.rack.position.set(t.x, t.y + jitter, t.z);
    this.rack.quaternion.set(r.x, r.y, r.z, r.w);
    let n = 0;
    for (const b of sim.pile.boxes) {
      if (!b.alive) continue;
      const bt = b.body.translation();
      const br = b.body.rotation();
      _p.set(bt.x, bt.y + jitter, bt.z);
      _q.set(br.x, br.y, br.z, br.w);
      _m.compose(_p, _q, _s);
      this.boxes.setMatrixAt(n++, _m);
      if (n >= 12) break;
    }
    this.boxes.count = n;
    this.boxes.instanceMatrix.needsUpdate = true;
  }
}

export const SCOOTER_COLOR = PAL.scooter;
