import * as THREE from 'three';
import type { CollisionWorld } from '../world/Collision';

/** Third-person orbit camera with collision pull-in, framing, and trauma shake. */
export class CameraRig {
  yaw = Math.PI;
  pitch = 0.42;
  distance = 6.5;
  targetDistance = 6.5;
  private readonly focus = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private trauma = 0;
  private time = 0;
  reducedShake = false;
  private currentDist = 6.5;
  /** Extra framing height (taller hosts). */
  heightOffset = 1.2;
  private fovKick = 0;

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  addTrauma(a: number): void {
    this.trauma = Math.min(1, this.trauma + a);
  }

  punchFov(a: number): void {
    this.fovKick = Math.max(this.fovKick, a);
  }

  look(dx: number, dy: number): void {
    this.yaw -= dx;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy, -0.05, 1.15);
  }

  zoom(steps: number): void {
    this.targetDistance = THREE.MathUtils.clamp(this.targetDistance + steps * 0.8, 3.2, 11);
  }

  snap(target: THREE.Vector3): void {
    this.focus.copy(target);
    this.focus.y += this.heightOffset;
    this.currentDist = this.distance;
    this.apply(this.currentDist);
  }

  /** Planar forward vector for camera-relative movement. */
  forward(out: THREE.Vector2): THREE.Vector2 {
    return out.set(-Math.sin(this.yaw), -Math.cos(this.yaw));
  }

  update(dt: number, target: THREE.Vector3, world: CollisionWorld): void {
    this.time += dt;
    this.distance += (this.targetDistance - this.distance) * (1 - Math.exp(-6 * dt));
    this.tmp.copy(target);
    this.tmp.y += this.heightOffset;
    const k = 1 - Math.exp(-10 * dt);
    this.focus.lerp(this.tmp, k);

    // Collision: shorten the boom when walls are between the host and camera.
    this.computeDesired(this.distance);
    const t = world.raycastCamera(this.focus, this.desired);
    const want = Math.max(1.6, this.distance * t - 0.2);
    if (want < this.currentDist) this.currentDist = want;
    else this.currentDist += (want - this.currentDist) * (1 - Math.exp(-3 * dt));
    this.apply(this.currentDist);

    // Shake.
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    if (this.trauma > 0 && !this.reducedShake) {
      const s = this.trauma * this.trauma;
      const f = this.time * 30;
      this.camera.position.x += Math.sin(f * 1.3) * 0.25 * s;
      this.camera.position.y += Math.sin(f * 1.7 + 1) * 0.2 * s;
      this.camera.rotation.z += Math.sin(f * 1.1 + 2) * 0.04 * s;
    }
    this.fovKick = Math.max(0, this.fovKick - dt * 8);
    const baseFov = this.camera.aspect < 0.8 ? 62 : 50;
    const fov = baseFov + this.fovKick * 6;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  private computeDesired(dist: number): void {
    const cp = Math.cos(this.pitch);
    this.desired.set(
      this.focus.x + Math.sin(this.yaw) * cp * dist,
      this.focus.y + Math.sin(this.pitch) * dist,
      this.focus.z + Math.cos(this.yaw) * cp * dist,
    );
  }

  private apply(dist: number): void {
    this.computeDesired(dist);
    this.camera.position.copy(this.desired);
    if (this.camera.position.y < 0.4) this.camera.position.y = 0.4;
    this.camera.lookAt(this.focus);
  }
}
