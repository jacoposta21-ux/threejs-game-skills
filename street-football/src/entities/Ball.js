import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { BALL } from '../config.js';
import { GROUP, groups } from '../physics/PhysicsWorld.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

/** Equirectangular street-ball texture: 12 pentagons + 20 hexagons with stitched seams and wear. */
function createBallTexture(rng) {
  const W = 512;
  const H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  const phi = (1 + Math.sqrt(5)) / 2;
  const norm = (v) => {
    const l = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  // Icosahedron vertices -> pentagon centres; dodecahedron vertices -> hexagon centres.
  const pent = [];
  for (const a of [-1, 1]) for (const b of [-phi, phi]) {
    pent.push(norm([0, a, b]), norm([a, b, 0]), norm([b, 0, a]));
  }
  const hex = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) hex.push(norm([a, b, c]));
  for (const a of [-1, 1]) for (const b of [-1, 1]) {
    hex.push(norm([0, a / phi, b * phi]), norm([a / phi, b * phi, 0]), norm([b * phi, 0, a / phi]));
  }
  const centres = [...pent.map((p) => [p, 0]), ...hex.map((p) => [p, 1])];
  for (let y = 0; y < H; y += 1) {
    const lat = Math.PI * (y / H);
    for (let x = 0; x < W; x += 1) {
      const lon = 2 * Math.PI * (x / W);
      const d = [Math.sin(lat) * Math.cos(lon), Math.cos(lat), Math.sin(lat) * Math.sin(lon)];
      let best = -2;
      let second = -2;
      let kind = 0;
      for (const [c, k] of centres) {
        const dot = d[0] * c[0] + d[1] * c[1] + d[2] * c[2];
        if (dot > best) {
          second = best;
          best = dot;
          kind = k;
        } else if (dot > second) second = dot;
      }
      const seam = best - second;
      const i = (y * W + x) * 4;
      // Pentagons: deep green; hexagons: off-white leather. Seams darken.
      let r = kind === 0 ? 24 : 236;
      let g = kind === 0 ? 92 : 232;
      let b = kind === 0 ? 58 : 218;
      if (kind === 1 && best > 0.985) {
        // Small yellow star accent in hexagon centres.
        r = 246; g = 201; b = 21;
      }
      const seamDark = seam < 0.012 ? 0.35 : seam < 0.022 ? 0.75 : 1;
      const wear = 0.9 + rng() * 0.1;
      img.data[i] = r * seamDark * wear;
      img.data[i + 1] = g * seamDark * wear;
      img.data[i + 2] = b * seamDark * wear;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // Asphalt scuffs.
  for (let i = 0; i < 70; i += 1) {
    ctx.fillStyle = `rgba(60,55,50,${0.05 + rng() * 0.12})`;
    ctx.beginPath();
    ctx.ellipse(rng() * W, rng() * H, 2 + rng() * 9, 1 + rng() * 3, rng() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export class Ball {
  constructor(physics, scene, rng) {
    this.physics = physics;
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, BALL.radius + 0.01, 0)
      .setCcdEnabled(true)
      .setLinearDamping(0)
      .setAngularDamping(0.3);
    this.body = physics.world.createRigidBody(desc);
    this.collider = physics.world.createCollider(
      RAPIER.ColliderDesc.ball(BALL.radius)
        .setMass(BALL.mass)
        .setRestitution(BALL.restitution)
        .setFriction(BALL.friction)
        .setCollisionGroups(groups(GROUP.BALL, GROUP.WORLD | GROUP.PLAYER))
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      this.body,
    );
    physics.tag(this.collider, { type: 'ball' });

    const geo = new THREE.SphereGeometry(BALL.radius, 40, 24);
    const mat = new THREE.MeshStandardMaterial({ map: createBallTexture(rng), roughness: 0.48, metalness: 0 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.mesh.name = 'ball';
    scene.add(this.mesh);

    // Soft contact blob keeps the ball grounded visually when the sun shadow is far.
    const blobTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d');
      const grd = g.createRadialGradient(32, 32, 2, 32, 32, 32);
      grd.addColorStop(0, 'rgba(0,0,0,0.55)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();
    this.blob = new THREE.Mesh(
      new THREE.PlaneGeometry(0.42, 0.42),
      new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }),
    );
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.renderOrder = 2;
    scene.add(this.blob);

    this.prev = new THREE.Vector3(0, BALL.radius, 0);
    this.curr = new THREE.Vector3(0, BALL.radius, 0);
    this.prevQ = new THREE.Quaternion();
    this.currQ = new THREE.Quaternion();
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.grounded = true;
    this.heldBy = null;
    this.lastTouch = null;
    this.lastKickTime = -10;
    this.time = 0;
    this.inGoal = false;
    this.readState();
  }

  readState() {
    const t = this.body.translation();
    const v = this.body.linvel();
    this.position.set(t.x, t.y, t.z);
    this.velocity.set(v.x, v.y, v.z);
  }

  /** Called before every fixed physics step. */
  preStep(dt) {
    this.time += dt;
    this.prev.copy(this.curr);
    this.prevQ.copy(this.currQ);
    if (this.heldBy) {
      const p = this.heldBy.holdPoint();
      this.body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
      this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      return;
    }
    this.readState();
    const v = this.velocity;
    const height = this.position.y - BALL.radius;
    this.grounded = height < 0.03 && Math.abs(v.y) < 1.2;
    const horiz = Math.hypot(v.x, v.z);
    if (this.grounded) {
      // Rolling resistance on worn concrete: constant + linear term.
      if (horiz > 1e-4) {
        const decel = (BALL.rollingDecel + BALL.rollingDrag * horiz) * dt;
        const k = Math.max(0, horiz - decel) / horiz;
        v.x *= k;
        v.z *= k;
        // Keep spin consistent with rolling so Rapier friction does not fight us.
        const w = this.body.angvel();
        const tx = v.z / BALL.radius;
        const tz = -v.x / BALL.radius;
        const blend = 1 - Math.exp(-dt * 12);
        this.body.setAngvel({ x: w.x + (tx - w.x) * blend, y: w.y * (1 - blend * 0.3), z: w.z + (tz - w.z) * blend }, true);
      }
      this.body.setLinvel({ x: v.x, y: v.y, z: v.z }, true);
    } else {
      // Quadratic air drag + Magnus lift from spin.
      const speed = v.length();
      const w = this.body.angvel();
      _w.set(w.x, w.y, w.z);
      _v.copy(_w).cross(v).multiplyScalar(BALL.magnus);
      const drag = BALL.airDrag * speed;
      v.x += (-drag * v.x + _v.x) * dt;
      v.y += (-drag * v.y + _v.y) * dt;
      v.z += (-drag * v.z + _v.z) * dt;
      this.body.setLinvel({ x: v.x, y: v.y, z: v.z }, true);
    }
    if (v.length() > BALL.maxSpeed) {
      v.setLength(BALL.maxSpeed);
      this.body.setLinvel({ x: v.x, y: v.y, z: v.z }, true);
    }
  }

  postStep() {
    this.readState();
    this.curr.copy(this.position);
    const r = this.body.rotation();
    this.currQ.set(r.x, r.y, r.z, r.w);
  }

  /** Apply a kick: sets velocity and spin directly (a touch is an impulse over a very short contact). */
  kick(velocity, spin, by, time) {
    this.heldBy = null;
    this.body.setGravityScale(1, true);
    this.body.setLinvel({ x: velocity.x, y: velocity.y, z: velocity.z }, true);
    if (spin) this.body.setAngvel({ x: spin.x, y: spin.y, z: spin.z }, true);
    this.lastTouch = by;
    this.lastKickTime = time;
    this.velocity.copy(velocity);
  }

  hold(holder) {
    this.heldBy = holder;
    this.lastTouch = holder;
    this.body.setGravityScale(0, true);
  }

  release() {
    this.heldBy = null;
    this.body.setGravityScale(1, true);
  }

  placeAt(x, y, z) {
    this.heldBy = null;
    this.body.setGravityScale(1, true);
    this.body.setTranslation({ x, y, z }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.readState();
    this.prev.copy(this.position);
    this.curr.copy(this.position);
    this.lastTouch = null;
    this.inGoal = false;
  }

  syncVisual(alpha) {
    this.mesh.position.lerpVectors(this.prev, this.curr, alpha);
    this.mesh.quaternion.slerpQuaternions(this.prevQ, this.currQ, alpha);
    const h = Math.max(0, this.mesh.position.y - BALL.radius);
    this.blob.position.set(this.mesh.position.x, 0.012, this.mesh.position.z);
    const s = 1 + h * 0.6;
    this.blob.scale.set(s, s, s);
    this.blob.material.opacity = Math.max(0, 1 - h * 0.45);
  }

  dispose(scene) {
    scene.remove(this.mesh, this.blob);
    this.mesh.geometry.dispose();
    this.mesh.material.map.dispose();
    this.mesh.material.dispose();
    this.blob.geometry.dispose();
    this.blob.material.map.dispose();
    this.blob.material.dispose();
  }
}
