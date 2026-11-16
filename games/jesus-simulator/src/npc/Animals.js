import * as THREE from 'three';
import { mergeColored } from '../world/geometry.js';
import { roundedBox } from '../world/geometry.js';
import { terrainHeight } from '../world/layout.js';
import { damp, wrapAngle, clamp } from '../core/rng.js';

const material = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });

function sheepGeometry(dark) {
  return mergeColored([
    { geometry: roundedBox(0.75, 0.55, 1.0, 0.18, 2), color: dark ? '#8a8078' : '#f3eee4', t: { y: 0.62 } },
    { geometry: roundedBox(0.32, 0.34, 0.4, 0.08, 1), color: '#3a302a', t: { y: 0.78, z: 0.62 } },
    { geometry: new THREE.BoxGeometry(0.12, 0.06, 0.16), color: '#3a302a', t: { x: 0.2, y: 0.88, z: 0.55, rz: -0.4 } },
    { geometry: new THREE.BoxGeometry(0.12, 0.06, 0.16), color: '#3a302a', t: { x: -0.2, y: 0.88, z: 0.55, rz: 0.4 } },
    { geometry: roundedBox(0.36, 0.2, 0.32, 0.08, 1), color: dark ? '#8a8078' : '#f3eee4', t: { y: 0.95, z: 0.52 } },
    ...[[-0.22, -0.32], [0.22, -0.32], [-0.22, 0.32], [0.22, 0.32]].map(([x, z]) => ({ geometry: new THREE.BoxGeometry(0.12, 0.42, 0.12), color: '#3a302a', t: { x, y: 0.21, z } })),
  ]);
}

function chickenGeometry(brown) {
  const body = brown ? '#b8763a' : '#f4efe6';
  return mergeColored([
    { geometry: roundedBox(0.3, 0.28, 0.4, 0.1, 1), color: body, t: { y: 0.32 } },
    { geometry: roundedBox(0.18, 0.22, 0.18, 0.06, 1), color: body, t: { y: 0.55, z: 0.17 } },
    { geometry: new THREE.BoxGeometry(0.06, 0.1, 0.12), color: '#d4352a', t: { y: 0.69, z: 0.17 } },
    { geometry: new THREE.ConeGeometry(0.04, 0.1, 4), color: '#f0b030', t: { y: 0.55, z: 0.3, rx: Math.PI / 2 } },
    { geometry: new THREE.BoxGeometry(0.2, 0.18, 0.08), color: body, t: { y: 0.4, z: -0.22, rx: -0.5 } },
    { geometry: new THREE.BoxGeometry(0.04, 0.18, 0.04), color: '#e0a030', t: { x: -0.07, y: 0.09 } },
    { geometry: new THREE.BoxGeometry(0.04, 0.18, 0.04), color: '#e0a030', t: { x: 0.07, y: 0.09 } },
  ]);
}

/**
 * Herd animals and poultry. Cheap kinematic agents (no physics bodies): they
 * steer around the player and each other and snap to the terrain.
 */
export class Animals {
  constructor(scene, rng, bus) {
    this.scene = scene;
    this.rng = rng;
    this.bus = bus;
    this.list = [];
    this.mat = material();
  }

  build(doors) {
    const rng = this.rng;
    const sheepGeo = [sheepGeometry(false), sheepGeometry(true)];
    for (let i = 0; i < 6; i += 1) this.add('sheep', sheepGeo[i === 3 ? 1 : 0], -62 + rng.range(-4, 4), -2 + rng.range(-4, 4), { slot: i });
    // the stray: up on the watchtower ridge
    this.stray = this.add('sheep', sheepGeo[0], -73, -53, { stray: true, id: 'animal.sheep.stray' });
    const chickGeo = [chickenGeometry(false), chickenGeometry(true)];
    const homes = doors.filter((d) => Math.hypot(d.x, d.z) < 45);
    for (let i = 0; i < 9; i += 1) {
      const d = i < 3 ? { x: -26 + i, z: 19 } : homes[(i * 5) % homes.length];
      this.add('chicken', chickGeo[i % 2], d.x + rng.range(-1.5, 1.5), d.z + rng.range(-1.5, 1.5), { home: { x: d.x, z: d.z } });
    }
  }

  add(kind, geometry, x, z, extra = {}) {
    const mesh = new THREE.Mesh(geometry, this.mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(x, terrainHeight(x, z), z);
    this.scene.add(mesh);
    const a = {
      id: extra.id || `animal.${kind}.${this.list.length}`, kind, mesh, x, z, yaw: this.rng() * 6.28, vx: 0, vz: 0,
      target: null, timer: this.rng() * 3, state: 'idle', phase: this.rng() * 10, flee: 0, ...extra,
    };
    a.mesh.rotation.y = a.yaw;
    this.list.push(a);
    return a;
  }

  /**
   * @param {object} ctx { player:{x,z,speed}, shepherd:{x,z,yaw}|null, flags, dt }
   */
  update(dt, ctx) {
    const rng = this.rng;
    const p = ctx.player;
    for (const a of this.list) {
      a.timer -= dt;
      let tx = a.x;
      let tz = a.z;
      let speed = 0;
      const dP = Math.hypot(a.x - p.x, a.z - p.z);

      if (a.kind === 'chicken') {
        const scare = p.speed > 5 ? 5.5 : 3.2;
        if (dP < scare) {
          if (a.flee <= 0) this.bus.emit('animal:flee', { entityId: a.id, kind: a.kind, x: a.x, z: a.z });
          a.flee = 1.2;
        }
        if (a.flee > 0) {
          a.flee -= dt;
          const nx = (a.x - p.x) / (dP || 1);
          const nz = (a.z - p.z) / (dP || 1);
          tx = a.x + nx * 3;
          tz = a.z + nz * 3;
          speed = 4.2;
        } else {
          if (a.timer <= 0 || !a.target) {
            a.target = { x: a.home.x + rng.range(-3.5, 3.5), z: a.home.z + rng.range(-3.5, 3.5) };
            a.timer = rng.range(2, 6);
            a.state = rng() < 0.5 ? 'peck' : 'walk';
          }
          if (a.state === 'walk') { tx = a.target.x; tz = a.target.z; speed = 0.9; }
        }
      } else if (a.stray && !a.joined) {
        if (!a.following && dP < 4.5 && ctx.flags['sheep.asked']) {
          a.following = true;
          this.bus.emit('sheep:following', { entityId: a.id });
        }
        if (a.following) {
          if (dP > 2.4) { tx = p.x; tz = p.z; speed = clamp((dP - 2) * 1.6, 0, p.speed > 5 ? 7 : 4.6); }
          if (ctx.shepherd && Math.hypot(a.x - ctx.shepherd.x, a.z - ctx.shepherd.z) < 11) {
            a.joined = true;
            a.slot = 6;
            this.bus.emit('sheep:returned', { entityId: a.id });
          }
        } else {
          if (a.timer <= 0) { a.target = { x: -73 + rng.range(-5, 5), z: -53 + rng.range(-5, 5) }; a.timer = rng.range(4, 9); }
          if (a.target && Math.hypot(a.target.x - a.x, a.target.z - a.z) > 0.5) { tx = a.target.x; tz = a.target.z; speed = 0.8; }
        }
      } else if (ctx.shepherd) {
        // flock: loose ring behind the shepherd, grazing when settled
        const s = ctx.shepherd;
        const ang = s.yaw + Math.PI + ((a.slot ?? 0) - 3) * 0.5;
        const ring = 2.6 + ((a.slot ?? 0) % 3) * 1.1;
        const gx = s.x + Math.sin(ang) * ring;
        const gz = s.z + Math.cos(ang) * ring;
        const dG = Math.hypot(gx - a.x, gz - a.z);
        if (dG > 1.2) { tx = gx; tz = gz; speed = clamp(dG * 0.8, 0.6, 3.2); }
        if (dP < 2.2) { tx = a.x + (a.x - p.x); tz = a.z + (a.z - p.z); speed = 2.5; }
      }

      // separation between animals
      let sx = 0;
      let sz = 0;
      for (const o of this.list) {
        if (o === a || o.kind !== a.kind) continue;
        const dx = a.x - o.x;
        const dz = a.z - o.z;
        const d2 = dx * dx + dz * dz;
        const min = a.kind === 'sheep' ? 1.3 : 0.5;
        if (d2 > 0.0001 && d2 < min * min) { const d = Math.sqrt(d2); sx += (dx / d) * (min - d); sz += (dz / d) * (min - d); }
      }
      let dx = tx - a.x;
      let dz = tz - a.z;
      const dl = Math.hypot(dx, dz);
      let wantVx = 0;
      let wantVz = 0;
      if (speed > 0 && dl > 0.05) { wantVx = (dx / dl) * speed; wantVz = (dz / dl) * speed; }
      wantVx += sx * 3;
      wantVz += sz * 3;
      a.vx += (wantVx - a.vx) * damp(6, dt);
      a.vz += (wantVz - a.vz) * damp(6, dt);
      a.x += a.vx * dt;
      a.z += a.vz * dt;
      const sp = Math.hypot(a.vx, a.vz);
      if (sp > 0.15) a.yaw += wrapAngle(Math.atan2(a.vx, a.vz) - a.yaw) * damp(8, dt);
      a.phase += dt * (2 + sp * 5);
      const hop = sp > 0.15 ? Math.abs(Math.sin(a.phase)) * (a.kind === 'chicken' ? 0.08 : 0.06) : 0;
      a.mesh.position.set(a.x, terrainHeight(a.x, a.z) + hop, a.z);
      a.mesh.rotation.y = a.yaw;
      // grazing / pecking nod
      const graze = sp < 0.2 && (a.kind === 'sheep' || a.state === 'peck') ? Math.max(0, Math.sin(a.phase * 0.7)) * 0.25 : 0;
      a.mesh.rotation.x = graze + (a.flee > 0 ? -0.15 : 0);
    }
  }

  setShadows(cameraPos) {
    for (const a of this.list) {
      const d = Math.hypot(a.x - cameraPos.x, a.z - cameraPos.z);
      a.mesh.visible = d < 110;
      a.mesh.castShadow = d < 30;
    }
  }

  reset() {
    for (const a of this.list) {
      if (a.stray) { a.x = -73; a.z = -53; a.following = false; a.joined = false; delete a.slot; }
    }
  }
}
