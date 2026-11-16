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
    // riding: pull back and, once the mouse rests, swing in behind the mount
    const mount = this.mount;
    this.mountBlend = (this.mountBlend || 0) + ((mount ? 1 : 0) - (this.mountBlend || 0)) * damp(3, dt);
    if (Math.abs(intent.lookX) + Math.abs(intent.lookY) > 0.5) this.lookIdle = 0;
    else this.lookIdle = (this.lookIdle || 0) + dt;
    if (mount && Math.abs(mount.speed) > 1.2 && this.lookIdle > 0.9) {
      let dy = mount.yaw + Math.PI - this.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.yaw += dy * damp(1.6 + Math.min(2, Math.abs(mount.speed) * 0.12), dt);
      this.pitch += (0.26 - this.pitch) * damp(1.2, dt);
    }
    // conversation: over-the-shoulder shot of the NPC's face (blended over the orbit camera)
    const talk = this.dialogueTarget;
    this.talkBlend = (this.talkBlend || 0) + ((talk ? 1 : 0) - (this.talkBlend || 0)) * damp(4, dt);
    if (!talk) this.talkSide = null;
    if (talk) {
      // keep the orbit yaw behind the player so leaving the conversation feels continuous
      const behind = Math.atan2(target.x - talk.x, target.z - talk.z);
      let dy = behind - this.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.yaw += dy * damp(3, dt);
    }
    this.pitch = clamp(this.pitch, -0.5, 1.25);
    if (intent.zoom) this.targetDistance = clamp(this.targetDistance + intent.zoom * 0.7, 2.6, 11);

    this.aimBlend += ((intent.aim ? 1 : 0) - this.aimBlend) * damp(10, dt);
    const a = this.aimBlend;

    // focus point follows the player smoothly (a bit higher when far)
    const focusTarget = this.tmp.copy(target);
    focusTarget.y += lerp(1.55, 1.7, a) + (this.mountBlend || 0) * (mount ? mount.lift : 0.4);
    this.focus.lerp(focusTarget, damp(14, dt));

    const desired = lerp(this.targetDistance + (this.mountBlend || 0) * (mount ? mount.extra : 2), 2.4, a);
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
    let lx = ox;
    let ly = oy + 0.05;
    let lz = oz;
    const b = this.talkBlend || 0;
    if (talk && b > 0.001) {
      const dx = talk.x - target.x;
      const dz = talk.z - target.z;
      const L = Math.hypot(dx, dz) || 1;
      const fx = dx / L;
      const fz = dz / L;
      if (this.talkSide == null) {
        // pick the shoulder whose camera spot is clear of walls and stall cloth
        const clear = (side) => {
          const px = -fx * 2.3 + fz * side * 1.0;
          const pz = -fz * 2.3 - fx * side * 1.0;
          const len = Math.hypot(px, 0.3, pz);
          const hit = physics.castRay(target.x, target.y + 1.65, target.z, px / len, 0.3 / len, pz / len, len + 0.3, excludeCollider, physics.isCameraBlocker);
          return hit === null ? 99 : hit;
        };
        this.talkSide = clear(1) >= clear(-1) ? 1 : -1;
      }
      const side = this.talkSide;
      const tx = target.x - fx * 2.3 + fz * side * 1.0;
      const tz = target.z - fz * 2.3 - fx * side * 1.0;
      const ty = target.y + 1.95;
      cam.set(cam.x + (tx - cam.x) * b, cam.y + (ty - cam.y) * b, cam.z + (tz - cam.z) * b);
      // aim a little below the NPC's face so faces sit above the dialogue panel
      lx += (talk.x - lx) * b;
      ly += (talk.y + 1.15 - ly) * b;
      lz += (talk.z - lz) * b;
    }
    this.camera.lookAt(lx, ly, lz);

    const gallop = mount ? Math.min(1, Math.max(0, (Math.abs(mount.speed) - 7) / 8)) : 0;
    const fov = lerp(this.baseFov, 50, a) + (intent.sprinting ? 4 : 0) + gallop * 7;
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov = lerp(this.camera.fov, fov, damp(6, dt));
      this.camera.updateProjectionMatrix();
    }
  }
}
