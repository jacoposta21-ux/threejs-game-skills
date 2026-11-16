import * as THREE from 'three';
import { clamp, damp, lerp } from '../core/rng.js';
import { terrainHeight } from '../world/layout.js';

/**
 * Orbit-style third-person camera: mouse yaw/pitch, wheel zoom, ray-cast
 * collision (snaps in fast, eases back out), shoulder aim view.
 */
export class ThirdPersonCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.pitch = 0.32;
    this.distance = 6;
    this.targetDistance = 6;
    this.currentDistance = 6;
    this.aimBlend = 0;
    this.focus = new THREE.Vector3();
    this.tmp = new THREE.Vector3();
    this.dir = new THREE.Vector3();
    this.baseFov = 62;
  }

  snap(target, yaw) {
    if (yaw !== undefined) this.yaw = yaw;
    this.focus.copy(target).add(this.tmp.set(0, 1.55, 0));
    this.currentDistance = this.targetDistance;
  }

  update(dt, intent, target, settings, physics, excludeCollider) {
    const sens = 0.0022 * settings.sensitivity;
    this.yaw -= intent.lookX * sens;
    this.pitch += intent.lookY * sens * (settings.invertY ? -1 : 1);
    this.pitch = clamp(this.pitch, -0.5, 1.25);
    if (intent.zoom) this.targetDistance = clamp(this.targetDistance + intent.zoom * 0.7, 2.6, 11);

    this.aimBlend += ((intent.aim ? 1 : 0) - this.aimBlend) * damp(10, dt);
    const a = this.aimBlend;

    // focus point follows the player smoothly (a bit higher when far)
    const focusTarget = this.tmp.copy(target);
    focusTarget.y += lerp(1.55, 1.7, a);
    this.focus.lerp(focusTarget, damp(14, dt));

    const desired = lerp(this.targetDistance, 2.4, a);
    const cp = Math.cos(this.pitch);
    this.dir.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    // shoulder offset (right of the view) while aiming
    const sx = Math.cos(this.yaw) * 0.75 * a;
    const sz = -Math.sin(this.yaw) * 0.75 * a;
    const ox = this.focus.x + sx;
    const oy = this.focus.y;
    const oz = this.focus.z + sz;

    let allowed = desired;
    const hit = physics.castRay(ox, oy, oz, this.dir.x, this.dir.y, this.dir.z, desired + 0.3, excludeCollider, physics.isCameraBlocker);
    if (hit !== null) allowed = Math.max(1.1, hit - 0.3);
    // obstruction: snap in quickly; recovery: ease out
    if (allowed < this.currentDistance) this.currentDistance = lerp(this.currentDistance, allowed, damp(30, dt));
    else this.currentDistance = lerp(this.currentDistance, allowed, damp(3.5, dt));

    const d = this.currentDistance;
    const cam = this.camera.position;
    cam.set(ox + this.dir.x * d, oy + this.dir.y * d, oz + this.dir.z * d);
    const floor = terrainHeight(cam.x, cam.z) + 0.45;
    if (cam.y < floor) cam.y = floor;
    this.camera.lookAt(ox, oy + 0.05, oz);

    const fov = lerp(this.baseFov, 50, a) + (intent.sprinting ? 4 : 0);
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov = lerp(this.camera.fov, fov, damp(6, dt));
      this.camera.updateProjectionMatrix();
    }
  }
}
