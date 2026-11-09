import * as THREE from 'three';
import { CAMERA, COURT } from '../config.js';

const _focus = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _dir = new THREE.Vector3();

function noise(t, seed) {
  const x = Math.sin(t * 12.9898 + seed * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

/**
 * Elevated diagonal broadcast camera from the near sideline (the classic
 * street-football framing). It follows a smoothed focus between the controlled
 * player and the ball, biased toward the attacked goal, zooms out with ball
 * speed, tracks shots, and orbits the scorer after goals. It never leaves the
 * open air above the near sidewalk, so it cannot clip into buildings.
 */
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.focus = new THREE.Vector3();
    this.position = new THREE.Vector3(0, CAMERA.height, -CAMERA.distance);
    this.zoom = 0;
    this.trauma = 0;
    this.time = 0;
    this.fovPunch = 0;
    this.mode = 'play';
    this.orbit = 0;
    this.shakeEnabled = true;
    this.attackSign = -1;
    this.yaw = 0;
    this.lookBias = 0;
  }

  /**
   * Horizontal viewing direction for play mode. Landscape: diagonal across the
   * near sideline. Portrait (phones): behind the attacker, looking up the pitch.
   */
  viewDir(out) {
    if (this.camera.aspect < 1) return out.set(this.attackSign, 0, 0.32).normalize();
    return out.set(this.attackSign * 0.36, 0, 1).normalize();
  }

  addTrauma(amount) {
    if (!this.shakeEnabled) return;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  punchFov(deg) {
    this.fovPunch = Math.min(10, this.fovPunch + deg);
  }

  setMode(mode, target) {
    this.mode = mode;
    this.modeTarget = target;
    this.orbit = 0;
  }

  computeFocus(out, player, ball, shotTracking) {
    const bp = ball.mesh.position;
    const pp = player.holder.position;
    const sep = Math.hypot(bp.x - pp.x, bp.z - pp.z);
    let w = CAMERA.ballWeight;
    if (shotTracking) w = 0.78;
    else if (sep > 9) w = 0.6;
    out.set(pp.x + (bp.x - pp.x) * w, 0, pp.z + (bp.z - pp.z) * w);
    const portrait = this.camera.aspect < 1;
    out.x += this.attackSign * CAMERA.attackBias * (shotTracking ? 0.4 : 1) * (portrait ? 1.6 : 1);
    out.x = THREE.MathUtils.clamp(out.x, -COURT.halfLength + 3.5, COURT.halfLength - 3.5);
    out.z = THREE.MathUtils.clamp(out.z, -COURT.halfWidth + 1.5, COURT.halfWidth - 2.5);
    return out;
  }

  snap(player, ball) {
    this.computeFocus(this.focus, player, ball, false);
    this.desiredPosition(_pos, this.focus);
    this.position.copy(_pos);
    this.apply(0);
  }

  desiredPosition(out, focus) {
    this.viewDir(_dir);
    const portrait = this.camera.aspect < 1;
    const dist = (CAMERA.distance + this.zoom) * (portrait ? 0.92 : 1);
    const height = (CAMERA.height + this.zoom * 0.45) * (portrait ? 1.12 : 1);
    out.copy(focus).addScaledVector(_dir, -dist);
    out.y = height;
    out.z = Math.max(CAMERA.minZ, out.z);
    out.x = THREE.MathUtils.clamp(out.x, -COURT.halfLength - 4, COURT.halfLength + 4);
    if (portrait) out.x = THREE.MathUtils.clamp(out.x, -COURT.halfLength + 1, COURT.halfLength + 4);
    return out;
  }

  update(dt, { player, ball, shotTracking }) {
    this.time += dt;
    if (this.mode === 'goal' && this.modeTarget) {
      // Low, close camera from the near side, swaying slowly around the scorer.
      this.orbit += dt;
      const t = this.modeTarget.holder.position;
      const a = Math.sin(this.orbit * 0.45) * 0.45 - this.attackSign * 0.25;
      _focus.set(t.x, 1.55, t.z);
      _pos.set(t.x + Math.sin(a) * 5.4, 2.3, t.z - Math.cos(a) * 5.4);
      _pos.z = Math.max(-COURT.halfWidth + 0.3, Math.min(COURT.halfWidth - 0.3, _pos.z));
      _pos.x = THREE.MathUtils.clamp(_pos.x, -COURT.halfLength + 0.3, COURT.halfLength - 0.3);
      const k = 1 - Math.exp(-dt * 2.5);
      this.focus.lerp(_focus, k);
      this.position.lerp(_pos, k);
    } else {
      const speed = ball.velocity.length();
      const targetZoom = Math.min(CAMERA.maxZoom, Math.max(0, speed - 6) * CAMERA.zoomPerSpeed);
      this.zoom += (targetZoom - this.zoom) * (1 - Math.exp(-dt * (targetZoom > this.zoom ? 3 : 1.2)));
      this.computeFocus(_focus, player, ball, shotTracking);
      const sharp = shotTracking ? CAMERA.followSharpness * 1.6 : CAMERA.followSharpness;
      this.focus.lerp(_focus, 1 - Math.exp(-dt * sharp));
      this.focus.y += (0 - this.focus.y) * (1 - Math.exp(-dt * 3));
      this.desiredPosition(_pos, this.focus);
      this.position.lerp(_pos, 1 - Math.exp(-dt * sharp * 0.8));
    }
    this.apply(dt);
  }

  apply(dt) {
    const cam = this.camera;
    cam.position.copy(this.position);
    _focus.copy(this.focus);
    if (this.mode !== 'goal') _focus.y = 0.6;
    cam.lookAt(_focus);
    this.viewDir(_dir);
    this.yaw = Math.atan2(_dir.x, _dir.z);

    // Trauma shake (trauma²), decays linearly.
    this.trauma = Math.max(0, this.trauma - 1.5 * dt);
    if (this.trauma > 0) {
      const s = this.trauma * this.trauma;
      const f = this.time * 30;
      cam.position.x += 0.4 * s * noise(f, 1);
      cam.position.y += 0.4 * s * noise(f, 2);
      cam.rotation.z += 0.05 * s * noise(f, 3);
    }
    // FOV punch.
    this.fovPunch *= Math.exp(-dt / 0.22);
    const portrait = cam.aspect < 1;
    const fov = (portrait ? CAMERA.fov * 1.25 : CAMERA.fov) + this.fovPunch;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }
}
