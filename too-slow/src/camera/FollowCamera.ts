import * as THREE from 'three';
import type { RacerBody } from '../physics/RacerBody';
import { track } from '../world/Track';

const proj = { s: 0, d: 0 };
const desired = new THREE.Vector3();
const look = new THREE.Vector3();
const tmp = new THREE.Vector3();

function wrap(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function damp(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/**
 * Third-person chase camera. Stays close and high while crawling; drops back,
 * lowers and widens as speed builds; leads into bends using the track ahead;
 * never dips below the terrain; adds trauma-based shake on big hits.
 */
export class FollowCamera {
  private yaw = 0;
  private dist = 5;
  private height = 2.4;
  private fov = 58;
  private focusY = 0;
  private hint = -1;
  private lookHint = -1;
  private lookY = 0;
  private cut = false;
  private trauma = 0;
  private time = 0;
  shakeEnabled = true;
  /** 0 … 1, how fast the snail is relative to "flat out". */
  speedFactor = 0;

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  addShake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  snap(target: THREE.Vector3, heading: number): void {
    this.yaw = heading;
    this.dist = 5;
    this.height = 2.35;
    this.fov = 58;
    this.focusY = target.y;
    this.hint = -1;
    this.lookHint = -1;
    this.lookY = target.y + 0.6;
    this.cut = true;
    this.trauma = 0;
    this.place(target, 0);
    this.camera.position.copy(desired);
    this.camera.lookAt(look);
  }

  private place(target: THREE.Vector3, lead: number): void {
    const fx = Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    desired.set(target.x - fx * this.dist, this.focusY + this.height, target.z - fz * this.dist);
    look.set(target.x + fx * lead, this.focusY + 0.6, target.z + fz * lead);
  }

  update(dt: number, target: THREE.Vector3, racer: RacerBody, boosting: boolean): void {
    this.time += dt;
    const speed = racer.speed;
    const k = THREE.MathUtils.clamp((speed - 3) / 34, 0, 1);
    this.speedFactor = k;
    const moving = speed > 2 && racer.mode !== 'crawl';

    // Direction of travel, pulled toward where the track goes next so bends are visible early.
    const travelYaw = moving ? Math.atan2(racer.vel.x, -racer.vel.z) : racer.heading;
    const aheadYaw = track.heading(racer.s + 10 + speed * 0.55);
    const anticipate = Math.abs(racer.d) < track.halfWidth(racer.s) + 6 ? 0.22 + k * 0.2 : 0;
    const yawTarget = travelYaw + wrap(aheadYaw - travelYaw) * anticipate;
    this.yaw += wrap(yawTarget - this.yaw) * (1 - Math.exp(-(moving ? 4.2 : 2.6) * dt));

    this.dist = damp(this.dist, 4.6 + k * 3.6 + (boosting ? 0.8 : 0), 3, dt);
    this.height = damp(this.height, 2.35 - k * 0.65, 3, dt);
    this.fov = damp(this.fov, 58 + k * 20 + (boosting ? 7 : 0), boosting ? 6 : 3, dt);
    // Vertical follow is softer in the air so jumps read as height, not as a glued camera.
    this.focusY = damp(this.focusY, target.y, racer.grounded ? 12 : 5, dt);
    // Let the snail rise away from the camera a little on take-off, but never lose it below the frame on the way down.
    if (this.focusY < target.y - 3) this.focusY = target.y - 3;
    if (this.focusY > target.y + 1.1) this.focusY = target.y + 1.1;

    // A short lead keeps the snail well above the bottom-centre HUD cluster.
    this.place(target, 1.6 + k * 5);
    // Aim at the ground ahead rather than a level point, so on descents the view tips down the hill
    // (you see what is coming) and the snail rides higher on screen.
    this.lookHint = track.project(look.x, look.z, this.lookHint, proj);
    const aheadY = track.height(proj.s, proj.d) + 0.6;
    // In flight the view tips further down: the landing zone is in sight and the snail sits mid-screen.
    const drop = racer.flightTime > 0.15 ? 5.5 : 2.5;
    this.lookY = damp(this.lookY, Math.min(look.y, Math.max(look.y - drop, aheadY)), 6, dt);
    look.y = this.lookY;

    // Terrain avoidance: keep clearance above whatever ground is under the camera.
    this.hint = track.project(desired.x, desired.z, this.hint, proj);
    const ground = track.height(proj.s, proj.d) + 0.9;
    if (desired.y < ground) desired.y = ground;

    const cam = this.camera;
    cam.position.x = damp(cam.position.x, desired.x, 14, dt);
    cam.position.z = damp(cam.position.z, desired.z, 14, dt);
    cam.position.y = damp(cam.position.y, desired.y, 10, dt);
    if (cam.position.y < ground) cam.position.y = ground;
    cam.lookAt(look);

    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - dt * 1.9);
      if (this.shakeEnabled) {
        const a = this.trauma * this.trauma;
        const t = this.time * 38;
        tmp.set(Math.sin(t * 1.1) * 0.16, Math.sin(t * 1.7 + 1) * 0.16, 0).multiplyScalar(a);
        cam.position.add(tmp.applyQuaternion(cam.quaternion));
        cam.rotateZ(Math.sin(t * 1.3 + 2) * 0.022 * a);
      }
    }

    if (Math.abs(cam.fov - this.fov) > 0.02) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
  }

  /** Slow orbit used on the menu, the grid and after the finish. */
  orbit(dt: number, target: THREE.Vector3, radius: number, height: number, speed: number, phase = 0, swing = 0): void {
    this.time += dt;
    // With `swing` the camera sways back and forth around `phase` instead of circling.
    const a = swing > 0 ? phase + Math.sin(this.time * speed) * swing : this.time * speed + phase;
    desired.set(target.x + Math.sin(a) * radius, target.y + height, target.z + Math.cos(a) * radius);
    this.hint = track.project(desired.x, desired.z, this.hint, proj);
    desired.y = Math.max(desired.y, track.height(proj.s, proj.d) + 0.8);
    const cam = this.camera;
    // First orbit frame after a snap cuts straight to the shot instead of flying through the scene.
    if (this.cut) cam.position.copy(desired);
    else cam.position.lerp(desired, 1 - Math.exp(-3 * dt));
    this.cut = false;
    look.copy(target).setY(target.y + 0.55);
    cam.lookAt(look);
    this.yaw = Math.atan2(target.x - cam.position.x, -(target.z - cam.position.z));
    this.focusY = target.y;
    if (Math.abs(cam.fov - 50) > 0.05) {
      cam.fov = damp(cam.fov, 50, 3, dt);
      cam.updateProjectionMatrix();
    }
    this.fov = cam.fov;
  }
}
