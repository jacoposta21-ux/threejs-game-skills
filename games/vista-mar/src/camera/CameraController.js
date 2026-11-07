import * as THREE from 'three';
import { terrainHeight } from '../world/Layout.js';
import { clamp, damp } from '../utils/random.js';

// Orbiting third-person camera with shoulder offset, wheel zoom, collision
// pull-in against buildings, smoothed follow and sprint FOV.
export class CameraController {
  constructor(game) {
    this.game = game;
    this.camera = game.camera;
    this.yaw = 0;
    this.pitch = 0.22;
    this.distance = 4.6;
    this.targetDistance = 4.6;
    this.currentDist = 4.6;
    this.focus = new THREE.Vector3();
    this.kickY = 0;
    this.fovBoost = 0;
    this.settings = game.settings;
    this._look = new THREE.Vector3();
  }

  reset(heading) {
    this.yaw = heading;
    this.pitch = 0.22;
    const p = this.game.player;
    this.focus.set(p.pos.x, p.pos.y + p.eyeHeight, p.pos.z);
    this.currentDist = this.targetDistance;
  }

  kick(a) {
    this.kickY = Math.max(this.kickY, a);
  }

  update(dt) {
    const input = this.game.input;
    const s = this.settings;
    const { dx, dy } = input.takeLook(dt);
    const sens = 0.0022 * s.sensitivity;
    this.yaw -= dx * sens;
    this.pitch += dy * sens * (s.invertY ? -1 : 1);
    this.pitch = clamp(this.pitch, -0.45, 1.25);
    const w = input.takeWheel();
    if (w) s.cameraDistance = clamp(s.cameraDistance + w * 0.5, 2.2, 9);
    this.targetDistance = s.cameraDistance;

    const p = this.game.player;
    const eye = p.eyeHeight;
    // follow: snappy horizontally, softer vertically (hides curb steps / landings)
    this.focus.x = damp(this.focus.x, p.pos.x, 22, dt);
    this.focus.z = damp(this.focus.z, p.pos.z, 22, dt);
    this.focus.y = damp(this.focus.y, p.pos.y + eye, 10, dt);

    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const rx = -fz, rz = fx;
    const shoulder = 0.45 * clamp(this.currentDist / 4.6, 0.4, 1);
    const pivot = this._look.set(this.focus.x + rx * shoulder, this.focus.y - this.kickY, this.focus.z + rz * shoulder);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const want = this.targetDistance + (p.speed > 6 ? 0.6 : 0);
    const ex = pivot.x - fx * cp * want, ey = pivot.y + sp * want, ez = pivot.z - fz * cp * want;
    const t = this.game.collision.raycast(pivot.x, pivot.y, pivot.z, ex, ey, ez);
    const allowed = Math.max(0.6, t * want - 0.35);
    // pull in fast, ease back out
    this.currentDist = allowed < this.currentDist ? damp(this.currentDist, allowed, 30, dt) : damp(this.currentDist, allowed, 4, dt);
    const d = this.currentDist;
    let cx = pivot.x - fx * cp * d, cy = pivot.y + sp * d, cz = pivot.z - fz * cp * d;
    const gy = terrainHeight(cx, cz) + 0.35;
    if (cy < gy) cy = gy;
    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(pivot.x + fx * 2, pivot.y + 0.05 - (this.pitch < 0 ? this.pitch * 0.8 : 0), pivot.z + fz * 2);

    this.kickY = damp(this.kickY, 0, 8, dt);
    this.fovBoost = damp(this.fovBoost, p.speed > 6 ? 7 : 0, 4, dt);
    const fov = s.fov + this.fovBoost;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
