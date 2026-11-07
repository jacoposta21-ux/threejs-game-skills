/** Delivery circles, light beams, waiting customers and their reactions; the 3D guide arrow. */
import { ConeGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, RingGeometry, Shape, ExtrudeGeometry, Vector3 } from 'three';
import type { DeliveryStop } from '../levels/types.ts';
import { materials } from '../render/materials.ts';
import { makeCustomer } from './models.ts';

interface Marker {
  stop: DeliveryStop;
  group: Group;
  ring: Mesh;
  beam: Mesh;
  customer: ReturnType<typeof makeCustomer>;
  state: 'hidden' | 'waiting' | 'happy' | 'sad' | 'gone';
  t: number;
  done: boolean;
  door: Vector3;
  spot: Vector3;
}

export class Deliveries {
  readonly group = new Group();
  markers: Marker[] = [];
  private custMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });

  set(stops: DeliveryStop[], ground: (x: number, z: number) => number) {
    this.clear();
    const mats = materials();
    stops.forEach((stop, i) => {
      const a = stop.address;
      const g = new Group();
      const y = ground(a.x, a.z);
      g.position.set(a.x, y, a.z);
      const ring = new Mesh(new RingGeometry(1.55, 1.9, 40), mats.ring.clone());
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.06;
      const inner = new Mesh(new RingGeometry(0.0, 1.55, 40), mats.ring.clone());
      (inner.material as typeof mats.ring).opacity = 0.18;
      inner.rotation.x = -Math.PI / 2;
      inner.position.y = 0.05;
      const beam = new Mesh(new CylinderGeometry(1.7, 1.7, 14, 24, 1, true), mats.beam);
      beam.position.y = 7;
      g.add(ring, inner, beam);
      this.group.add(g);
      const customer = makeCustomer(i * 17 + Math.floor(a.x * 3 + a.z), this.custMat);
      const door = new Vector3(a.doorX + a.nx * 0.3, ground(a.doorX + a.nx * 0.6, a.doorZ + a.nz * 0.6), a.doorZ + a.nz * 0.3);
      const spot = new Vector3(a.doorX + a.nx * 1.3, ground(a.doorX + a.nx * 1.3, a.doorZ + a.nz * 1.3), a.doorZ + a.nz * 1.3);
      customer.position.copy(door);
      customer.rotation.y = Math.atan2(a.nx, a.nz);
      customer.visible = false;
      this.group.add(customer);
      this.markers.push({ stop, group: g, ring, beam, customer, state: 'hidden', t: 0, done: false, door, spot });
    });
  }

  clear() {
    for (const m of this.markers) {
      m.group.removeFromParent();
      m.customer.removeFromParent();
    }
    this.markers = [];
  }

  /** Customer hand position for the throw target. */
  catchPoint(i: number, out: Vector3) {
    return out.copy(this.markers[i].customer.position).setY(this.markers[i].customer.position.y + 1.3);
  }

  complete(i: number, happy: boolean) {
    const m = this.markers[i];
    m.done = true;
    m.state = happy ? 'happy' : 'sad';
    m.t = 0;
    m.group.visible = false;
  }

  update(dt: number, time: number, px: number, pz: number, highlight: number) {
    this.markers.forEach((m, i) => {
      const pulse = 1 + Math.sin(time * 4 + i) * 0.06;
      if (!m.done) {
        m.ring.scale.setScalar(pulse);
        (m.ring.material as MeshStandardMaterial).opacity = i === highlight ? 1 : 0.75;
        m.beam.scale.set(1, i === highlight ? 1.15 : 0.8, 1);
        m.beam.rotation.y += dt * 0.5;
      }
      const c = m.customer;
      const P = c.parts;
      const d = Math.hypot(px - m.stop.address.x, pz - m.stop.address.z);
      m.t += dt;
      if (m.state === 'hidden' && !m.done && d < 38) {
        m.state = 'waiting';
        m.t = 0;
        c.visible = true;
      }
      if (m.state === 'waiting') {
        const k = Math.min(1, m.t / 1.2);
        c.position.lerpVectors(m.door, m.spot, k);
        c.position.y += Math.abs(Math.sin(m.t * 8)) * 0.05 * (k < 1 ? 1 : 0);
        P.armL.rotation.z = k >= 1 ? 2.6 + Math.sin(time * 7) * 0.4 : 0.1;
        P.armR.rotation.z = -0.1;
        P.head.rotation.x = 0;
      } else if (m.state === 'happy') {
        const j = Math.max(0, Math.sin(m.t * 9)) * 0.35 * (m.t < 2 ? 1 : 0);
        c.position.y = m.spot.y + j;
        P.armL.rotation.z = 2.7 + Math.sin(time * 12) * 0.2;
        P.armR.rotation.z = -2.7 - Math.sin(time * 12) * 0.2;
        if (m.t > 2.6) this.walkIn(m, m.t - 2.6);
      } else if (m.state === 'sad') {
        P.head.rotation.x = 0.5;
        P.armL.rotation.z = 0.15 + Math.sin(m.t * 10) * 0.25 * (m.t < 1.5 ? 1 : 0);
        P.armR.rotation.z = -0.15;
        if (m.t > 2.6) this.walkIn(m, m.t - 2.6);
      }
    });
  }

  private walkIn(m: Marker, t: number) {
    const k = Math.min(1, t / 1.0);
    m.customer.position.lerpVectors(m.spot, m.door, k);
    m.customer.rotation.y = Math.atan2(-m.stop.address.nx, -m.stop.address.nz);
    if (k >= 1) {
      m.customer.visible = false;
      m.state = 'gone';
    }
  }
}

/** Chunky 3D arrow floating above the scooter. */
export function makeArrow(): Mesh {
  const s = new Shape();
  s.moveTo(0, 0.75);
  s.lineTo(0.55, 0.1);
  s.lineTo(0.22, 0.1);
  s.lineTo(0.22, -0.6);
  s.lineTo(-0.22, -0.6);
  s.lineTo(-0.22, 0.1);
  s.lineTo(-0.55, 0.1);
  s.closePath();
  const g = new ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2 });
  g.translate(0, 0, -0.07);
  g.rotateX(-Math.PI / 2);
  const m = new Mesh(g, new MeshStandardMaterial({ color: 0xffc83a, emissive: 0xff9a1a, emissiveIntensity: 0.55, roughness: 0.4 }));
  m.castShadow = false;
  return m;
}

export function makeConeMarker(): Mesh {
  return new Mesh(new ConeGeometry(0.3, 0.6, 8), materials().glow);
}
