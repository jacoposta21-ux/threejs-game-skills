import * as THREE from 'three';
import { mergeColored, potGeometry } from './geometry.js';
import { terrainHeight, PLAY_RADIUS } from './layout.js';

const tmp = new THREE.Object3D();
const tint2 = new THREE.Color();

function breadGeometry() {
  return mergeColored([
    { geometry: new THREE.CapsuleGeometry(0.1, 0.22, 4, 8).rotateZ(Math.PI / 2), color: '#c98a46', t: { sy: 0.75, sz: 1.1 } },
    { geometry: new THREE.BoxGeometry(0.04, 0.02, 0.16), color: '#8a5a2a', t: { x: -0.08, y: 0.07 } },
    { geometry: new THREE.BoxGeometry(0.04, 0.02, 0.16), color: '#8a5a2a', t: { x: 0.06, y: 0.07 } },
  ]);
}

function fishGeometry() {
  return mergeColored([
    { geometry: new THREE.IcosahedronGeometry(0.11, 1), color: '#a9bcc6', t: { sx: 2.2, sy: 0.5 } },
    { geometry: new THREE.ConeGeometry(0.1, 0.18, 4).rotateZ(-Math.PI / 2), color: '#8aa1ad', t: { x: -0.3, sy: 0.4 } },
    { geometry: new THREE.SphereGeometry(0.025, 6, 4), color: '#1a1a1a', t: { x: 0.18, y: 0.02, z: 0.04 } },
  ]);
}
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * Simulated market props with strict limits: barrels, crates, breakable clay
 * pots, rollable fruit piles and a fixed pool of pot shards. Bodies sleep until
 * disturbed; disturbed props are quietly restocked once the player is far away.
 */
export class PropSystem {
  constructor(root, physics, rng, materials, bus) {
    this.root = root;
    this.physics = physics;
    this.rng = rng;
    this.materials = materials;
    this.bus = bus;
    this.props = [];
    this.meshes = {};
    this.shards = [];
    this.playerPos = new THREE.Vector3();
    this.limits = { shards: 48, copies: 80, copyLife: 60 };
    this.copies = [];
    this.copySerial = 0;
  }

  build(houses, stalls) {
    const rng = this.rng;
    const m = this.materials;
    const templates = {
      barrel: {
        geometry: mergeColored([
          { geometry: new THREE.CylinderGeometry(0.36, 0.36, 0.96, 12), color: '#9c6b40' },
          { geometry: new THREE.CylinderGeometry(0.39, 0.39, 0.07, 12), color: '#4a3a2c', t: { y: 0.3 } },
          { geometry: new THREE.CylinderGeometry(0.39, 0.39, 0.07, 12), color: '#4a3a2c', t: { y: -0.3 } },
        ]),
        material: m.wood,
        phys: { shape: 'cyl', r: 0.38, hh: 0.48, density: 0.6, restitution: 0.25 },
      },
      crate: {
        geometry: mergeColored([
          { geometry: new THREE.BoxGeometry(0.8, 0.8, 0.8), color: '#b5844f' },
          { geometry: new THREE.BoxGeometry(0.84, 0.1, 0.84), color: '#6b4a2e', t: { y: 0.35 } },
          { geometry: new THREE.BoxGeometry(0.84, 0.1, 0.84), color: '#6b4a2e', t: { y: -0.35 } },
        ]),
        material: m.wood,
        phys: { shape: 'box', hx: 0.4, hy: 0.4, hz: 0.4, density: 0.5, restitution: 0.15 },
      },
      pot: {
        geometry: mergeColored([{ geometry: potGeometry(0.7, 0.3, 10), color: '#c0703f', t: { y: -0.35 } }]),
        material: m.clay,
        phys: { shape: 'cyl', r: 0.28, hh: 0.35, density: 0.9, restitution: 0.1 },
        breakable: true,
      },
      bread: {
        geometry: breadGeometry(),
        material: m.plain,
        phys: { shape: 'box', hx: 0.2, hy: 0.08, hz: 0.12, density: 0.35, restitution: 0.3, friction: 0.7 },
        small: true,
      },
      fish: {
        geometry: fishGeometry(),
        material: m.plain,
        phys: { shape: 'box', hx: 0.24, hy: 0.05, hz: 0.08, density: 0.6, restitution: 0.45, friction: 0.4 },
        small: true,
      },
      fruit: {
        geometry: mergeColored([{ geometry: new THREE.IcosahedronGeometry(0.12, 1), color: '#ffffff' }]),
        material: m.plain,
        phys: { shape: 'ball', r: 0.12, density: 0.7, restitution: 0.35, friction: 0.5 },
        small: true,
      },
    };

    const spots = [];
    const push = (type, x, z, extra = {}) => spots.push({ type, x, z, ...extra });
    for (let i = 0; i < 6; i += 1) push(i % 2 ? 'crate' : 'barrel', -15 + i * 6, -16.8);
    for (let i = 0; i < 5; i += 1) push(i % 2 ? 'pot' : 'barrel', -17.5, -36 + i * 4.5);
    for (let i = 0; i < 4; i += 1) push('pot', 17.5, -34 + i * 4, { owner: 'npc.rachel' });
    push('crate', -9, -27.4); push('pot', 3.1, -26.6, { owner: 'npc.rachel' }); push('barrel', 9.2, -27.8);
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2 + 0.55;
      push(i % 3 === 0 ? 'barrel' : 'pot', Math.cos(a) * 4.2, Math.sin(a) * 4.2);
    }
    push('crate', -23.5, 18.5); push('crate', -22.8, 19.6); push('barrel', -36.5, 10); push('barrel', -36.2, 11.2);
    // pottery stall: a stack of jars in front of Rachel's stall
    const pottery = stalls.find((s) => s.goods === 'pottery');
    if (pottery) {
      const f = pottery.front;
      for (let i = 0; i < 4; i += 1) push('pot', f.x + Math.cos(f.yaw + Math.PI / 2) * (i - 1.5) * 0.7, f.z - Math.sin(f.yaw + Math.PI / 2) * (i - 1.5) * 0.7 - 0.4 * Math.cos(f.yaw), { owner: 'npc.rachel' });
    }
    for (let i = 0; i < 10 && i < houses.length; i += 1) {
      const h = houses[(i * 3) % houses.length];
      const a = Math.atan2(-h.x, -h.z);
      push(rng.pick(['barrel', 'crate', 'pot']), h.x + Math.sin(a) * (h.r + 0.9) + 1.2, h.z + Math.cos(a) * (h.r + 0.9));
    }
    // bread on the bakery counters, fish on the fishmonger's counter (Multiplication targets)
    const counter = (st, lx) => {
      const sx = st.front.x - st.stand.x;
      const sz = st.front.z - st.stand.z;
      const L = Math.hypot(sx, sz) || 1;
      const zx = sx / L;
      const zz = sz / L;
      return { x: st.stand.x + zz * lx + zx * 0.85, z: st.stand.z - zx * lx + zz * 0.85, y: st.stand.y + 0.95 };
    };
    for (const st of stalls) {
      if (st.goods !== 'bread' && st.goods !== 'fish') continue;
      for (const lx of [-0.85, 0, 0.85]) {
        const c = counter(st, lx);
        push(st.goods, c.x, c.z, { y: c.y, owner: st.goods === 'bread' ? 'npc.eli' : 'npc.tobias' });
      }
    }
    // fruit heaps beside the fruit stalls (pyramids of sleeping balls)
    const fruitColors = ['#e07b28', '#c8323a', '#e8a33a', '#9ab53c', '#7b2f6a'];
    for (const s of stalls.filter((st) => st.goods === 'fruit')) {
      // beside the stall (between stalls), out of the shoppers' path
      const cx = s.fruitSpot.x;
      const cz = s.fruitSpot.z;
      const color = rng.pick(fruitColors);
      const layers = [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0], [0, 0]];
      layers.forEach(([dx, dz]) => push('fruit', cx + dx * 0.24, cz + dz * 0.24, { color, layer: 0, owner: 'npc.levi' }));
      [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]].forEach(([dx, dz]) => push('fruit', cx + dx * 0.24, cz + dz * 0.24, { color, layer: 1, owner: 'npc.levi' }));
      push('fruit', cx, cz, { color, layer: 2, owner: 'npc.levi' });
    }

    const tint = new THREE.Color();
    for (const type of Object.keys(templates)) {
      const list = spots.filter((s) => s.type === type);
      const t = templates[type];
      const mesh = new THREE.InstancedMesh(t.geometry, t.material, Math.max(1, list.length));
      mesh.count = list.length;
      mesh.castShadow = !t.small;
      mesh.receiveShadow = true;
      mesh.name = `props:${type}`;
      mesh.frustumCulled = false;
      this.root.add(mesh);
      this.meshes[type] = mesh;
      list.forEach((s, i) => {
        const halfH = t.phys.hy ?? t.phys.hh ?? t.phys.r;
        const y = (s.y ?? terrainHeight(s.x, s.z)) + halfH + 0.03 + (s.layer || 0) * 0.2;
        const ry = rng() * Math.PI * 2;
        const { body } = this.physics.createDynamic({ ...t.phys, x: s.x, y, z: s.z, ry });
        if (t.small) body.setLinearDamping(0.6);
        mesh.setColorAt(i, tint.set(s.color || '#ffffff'));
        this.props.push({
          id: `prop.${type}.${String(i).padStart(2, '0')}`, type, index: i, body, mesh, owner: s.owner || null,
          breakable: !!t.breakable, broken: false, prevSpeed: 0, home: { x: s.x, y, z: s.z, ry },
          disturbed: false, disturbedAt: 0, respawnAt: 0,
        });
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    // multiplied bread & fish: fixed pools, oldest recycled first
    this.copyMeshes = {};
    for (const kind of ['bread', 'fish']) {
      const t = templates[kind];
      const mesh = new THREE.InstancedMesh(t.geometry, t.material, this.limits.copies);
      mesh.name = `props:copies:${kind}`;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      this.root.add(mesh);
      this.copyMeshes[kind] = { mesh, free: [], phys: t.phys };
      for (let i = 0; i < this.limits.copies; i += 1) {
        mesh.setMatrixAt(i, HIDDEN);
        const { body } = this.physics.createDynamic({ ...t.phys, x: 0, y: -80 - i, z: 0 });
        body.setEnabled(false);
        body.setLinearDamping(0.25);
        this.copyMeshes[kind].free.push({ index: i, body });
      }
      mesh.instanceMatrix.needsUpdate = true;
    }

    // shard pool for broken pottery
    const shardGeo = mergeColored([{ geometry: new THREE.BoxGeometry(0.2, 0.05, 0.16), color: '#b5643a' }]);
    this.shardMesh = new THREE.InstancedMesh(shardGeo, m.clay, this.limits.shards);
    this.shardMesh.name = 'props:shards';
    this.shardMesh.frustumCulled = false;
    this.shardMesh.castShadow = false;
    this.root.add(this.shardMesh);
    for (let i = 0; i < this.limits.shards; i += 1) {
      const { body } = this.physics.createDynamic({ shape: 'box', hx: 0.1, hy: 0.025, hz: 0.08, x: 0, y: -50 - i, z: 0, density: 1.2, restitution: 0.2 });
      body.setEnabled(false);
      this.shards.push({ body, active: false, life: 0, index: i });
      this.shardMesh.setMatrixAt(i, HIDDEN);
    }
    this.shardCursor = 0;
    this.sync(0, true);
  }

  /** Per fixed step: copy transforms, detect impacts/breaks, run restock. */
  sync(time, force = false) {
    const disturbed = [];
    const dirty = new Set();
    for (const p of this.props) {
      if (p.broken) {
        if (time >= p.respawnAt && this.playerPos.distanceTo(p.home) > 18) this.restore(p);
        continue;
      }
      const sleeping = p.body.isSleeping();
      if (!force && sleeping) {
        p.prevSpeed = 0;
        if (p.disturbed && time - p.disturbedAt > 75 && this.playerPos.distanceTo(p.home) > 26) {
          this.resetProp(p);
          dirty.add(p.mesh);
        }
        continue;
      }
      const t = p.body.translation();
      if (t.y < -20 || Math.hypot(t.x, t.z) > PLAY_RADIUS + 60) {
        this.resetProp(p);
        dirty.add(p.mesh);
        continue;
      }
      const v = p.body.linvel();
      const speed = Math.hypot(v.x, v.y, v.z);
      if (!force && p.breakable && p.prevSpeed > 4.2 && p.prevSpeed - speed > 3.2) {
        this.breakPot(p, t, p.prevSpeed, time);
        dirty.add(p.mesh);
        continue;
      }
      p.prevSpeed = speed;
      // emulate rolling resistance: nearly-still props doze off (contacts wake them)
      if (speed < 0.15) {
        p.slowT = (p.slowT || 0) + 1 / 60;
        if (p.slowT > 1) { p.body.sleep(); p.slowT = 0; }
      } else p.slowT = 0;
      const r = p.body.rotation();
      tmp.position.set(t.x, t.y, t.z);
      tmp.quaternion.set(r.x, r.y, r.z, r.w);
      tmp.scale.setScalar(1);
      tmp.updateMatrix();
      p.mesh.setMatrixAt(p.index, tmp.matrix);
      dirty.add(p.mesh);
      if (!force && speed > 1.6) {
        if (!p.disturbed) disturbed.push(p);
        p.disturbed = true;
        p.disturbedAt = time;
      }
    }
    for (const m of dirty) m.instanceMatrix.needsUpdate = true;
    this.updateShards(1 / 60);
    this.updateCopies(time);
    for (const p of disturbed) this.bus.emit('prop:disturbed', { entityId: p.id, type: p.type, owner: p.owner, x: p.body.translation().x, z: p.body.translation().z });
    return disturbed.length;
  }

  /** Spawn a multiplied copy near (x,y,z); recycles the oldest copy at the cap. */
  spawnCopy(kind, x, y, z, time) {
    const pool = this.copyMeshes[kind];
    if (!pool) return null;
    let slot = pool.free.pop();
    if (!slot || this.copies.length >= this.limits.copies) {
      const oldest = this.copies.find((c) => c.kind === kind) || this.copies[0];
      if (!oldest) return null;
      this.bus.emit('copy:recycled', { entityId: oldest.id, x: oldest.body.translation().x, y: oldest.body.translation().y, z: oldest.body.translation().z });
      this.removeCopy(oldest);
      slot = this.copyMeshes[kind].free.pop();
      if (!slot) return null;
    }
    const a = this.rng() * Math.PI * 2;
    slot.body.setEnabled(true);
    slot.body.setBodyType(this.physics.RAPIER.RigidBodyType.Dynamic, true);
    slot.body.setTranslation({ x: x + Math.cos(a) * 0.15, y: y + 0.35, z: z + Math.sin(a) * 0.15 }, true);
    slot.body.setRotation({ x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) }, true);
    const sp = 1.2 + this.rng() * 2.2;
    slot.body.setLinvel({ x: Math.cos(a) * sp, y: 2.5 + this.rng() * 2.5, z: Math.sin(a) * sp }, true);
    slot.body.setAngvel({ x: (this.rng() - 0.5) * 12, y: (this.rng() - 0.5) * 12, z: (this.rng() - 0.5) * 12 }, true);
    const copy = { id: `copy.${kind}.${(this.copySerial += 1)}`, kind, type: kind, body: slot.body, slot, mesh: pool.mesh, index: slot.index, born: time, copy: true };
    this.copies.push(copy);
    return copy;
  }

  removeCopy(copy) {
    const i = this.copies.indexOf(copy);
    if (i >= 0) this.copies.splice(i, 1);
    copy.body.setEnabled(false);
    copy.mesh.setMatrixAt(copy.index, HIDDEN);
    copy.mesh.instanceMatrix.needsUpdate = true;
    this.copyMeshes[copy.kind].free.push(copy.slot);
  }

  updateCopies(time) {
    const dirty = new Set();
    for (let i = this.copies.length - 1; i >= 0; i -= 1) {
      const c = this.copies[i];
      const age = time - c.born;
      const t = c.body.translation();
      if (age > this.limits.copyLife || t.y < -20) { this.removeCopy(c); continue; }
      if (c.body.isSleeping() && age < this.limits.copyLife - 1.5 && !c.dirtyOnce) continue;
      c.dirtyOnce = false;
      const r = c.body.rotation();
      tmp.position.set(t.x, t.y, t.z);
      tmp.quaternion.set(r.x, r.y, r.z, r.w);
      tmp.scale.setScalar(Math.min(1, (this.limits.copyLife - age) / 1.5));
      tmp.updateMatrix();
      c.mesh.setMatrixAt(c.index, tmp.matrix);
      dirty.add(c.mesh);
      const v = c.body.linvel();
      if (Math.hypot(v.x, v.y, v.z) < 0.15) { c.slowT = (c.slowT || 0) + 1 / 60; if (c.slowT > 1) { c.body.sleep(); c.slowT = 0; } }
    }
    for (const m of dirty) m.instanceMatrix.needsUpdate = true;
  }

  /** Everything a miracle can aim at: props and copies with live positions. */
  targetables() {
    const out = [];
    for (const p of this.props) {
      if (p.broken || p.levitating === false) continue;
      const t = p.body.translation();
      out.push({ kind: 'prop', type: p.type, ref: p, id: p.id, x: t.x, y: t.y, z: t.z });
    }
    for (const c of this.copies) {
      const t = c.body.translation();
      out.push({ kind: 'copy', type: c.kind, ref: c, id: c.id, x: t.x, y: t.y, z: t.z });
    }
    return out;
  }

  setTint(p, color) {
    p.mesh.setColorAt(p.index, tint2.set(color));
    p.mesh.instanceColor.needsUpdate = true;
  }

  /** Levitation: switch a body between kinematic (held) and dynamic. */
  setHeld(ref, held) {
    const R = this.physics.RAPIER;
    ref.body.setBodyType(held ? R.RigidBodyType.KinematicPositionBased : R.RigidBodyType.Dynamic, true);
    if (!held) {
      ref.body.setLinvel({ x: 0, y: -0.5, z: 0 }, true);
      ref.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      ref.prevSpeed = 0;
    }
    ref.disturbed = true;
    ref.dirtyOnce = true;
  }

  breakPot(p, t, impact, time) {
    p.broken = true;
    p.respawnAt = time + 45;
    p.body.setEnabled(false);
    p.mesh.setMatrixAt(p.index, HIDDEN);
    const n = 6;
    for (let i = 0; i < n; i += 1) {
      const s = this.shards[this.shardCursor];
      this.shardCursor = (this.shardCursor + 1) % this.shards.length;
      s.active = true;
      s.life = 7 + this.rng() * 2;
      s.body.setEnabled(true);
      s.body.setTranslation({ x: t.x + (this.rng() - 0.5) * 0.3, y: t.y + 0.1 + this.rng() * 0.3, z: t.z + (this.rng() - 0.5) * 0.3 }, true);
      const a = this.rng() * Math.PI * 2;
      const sp = 1.5 + this.rng() * 2.5;
      s.body.setLinvel({ x: Math.cos(a) * sp, y: 2 + this.rng() * 2.5, z: Math.sin(a) * sp }, true);
      s.body.setAngvel({ x: this.rng() * 10, y: this.rng() * 10, z: this.rng() * 10 }, true);
    }
    this.bus.emit('prop:broken', { entityId: p.id, type: p.type, owner: p.owner, x: t.x, y: t.y, z: t.z, impact });
  }

  updateShards(dt) {
    let any = false;
    for (const s of this.shards) {
      if (!s.active) continue;
      any = true;
      s.life -= dt;
      if (s.life <= 0) {
        s.active = false;
        s.body.setEnabled(false);
        this.shardMesh.setMatrixAt(s.index, HIDDEN);
        continue;
      }
      const t = s.body.translation();
      const r = s.body.rotation();
      tmp.position.set(t.x, t.y, t.z);
      tmp.quaternion.set(r.x, r.y, r.z, r.w);
      tmp.scale.setScalar(Math.min(1, s.life / 1.2));
      tmp.updateMatrix();
      this.shardMesh.setMatrixAt(s.index, tmp.matrix);
    }
    if (any) this.shardMesh.instanceMatrix.needsUpdate = true;
  }

  restore(p) {
    p.broken = false;
    p.body.setEnabled(true);
    this.resetProp(p);
  }

  resetProp(p) {
    const { x, y, z, ry } = p.home;
    p.body.setTranslation({ x, y, z }, true);
    p.body.setRotation({ x: 0, y: Math.sin(ry / 2), z: 0, w: Math.cos(ry / 2) }, true);
    p.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    p.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    p.body.sleep();
    p.disturbed = false;
    p.prevSpeed = 0;
    tmp.position.set(x, y, z);
    tmp.quaternion.set(0, Math.sin(ry / 2), 0, Math.cos(ry / 2));
    tmp.scale.setScalar(1);
    tmp.updateMatrix();
    p.mesh.setMatrixAt(p.index, tmp.matrix);
    p.mesh.instanceMatrix.needsUpdate = true;
  }

  resetAll() {
    for (const p of this.props) {
      if (p.broken) {
        p.broken = false;
        p.body.setEnabled(true);
      }
      this.resetProp(p);
    }
    for (const s of this.shards) {
      s.active = false;
      s.body.setEnabled(false);
      this.shardMesh.setMatrixAt(s.index, HIDDEN);
    }
    this.shardMesh.instanceMatrix.needsUpdate = true;
    for (const c of [...this.copies]) this.removeCopy(c);
    for (const p of this.props) if (p.wine) { p.wine = false; this.setTint(p, '#ffffff'); }
  }

  stats() {
    let awake = 0;
    let broken = 0;
    for (const p of this.props) {
      if (p.broken) broken += 1;
      else if (!p.body.isSleeping()) awake += 1;
    }
    return { total: this.props.length, awake, broken, shards: this.shards.filter((s) => s.active).length, copies: this.copies.length };
  }
}
