import * as THREE from 'three';
import type { TerrainData } from '../world/TerrainGen';

/**
 * Orbital "miniature world" camera.
 *  Right drag: orbit · Middle drag / WASD / arrows: pan · Wheel: zoom · Q/E: rotate
 * Smooth damping on every axis, pitch and distance limits, target clamped to
 * the island, and a terrain-clearance check so the lens never clips hills.
 */
export class CameraController {
  readonly target = new THREE.Vector3(0, 3, 10);
  private goalTarget = new THREE.Vector3(0, 3, 10);
  yaw = 0.6;
  pitch = 0.85;
  distance = 95;
  private goalYaw = 0.6;
  private goalPitch = 0.85;
  private goalDistance = 95;
  sensitivity = 1;
  private readonly keys = new Set<string>();
  private drag: { button: number; x: number; y: number } | null = null;
  private shake = 0;
  reducedShake = false;
  private readonly shakeOffset = new THREE.Vector3();
  private flight: { from: THREE.Vector3; to: THREE.Vector3; fromD: number; toD: number; t: number; dur: number; yawFrom: number; yawTo: number; pitchTo: number; pitchFrom: number } | null = null;
  enabled = true;
  /** v0.4: WASD/QE camera keys (off while possessing a villager). */
  keysEnabled = true;
  /** v0.4: slow automatic orbit around the island. */
  cinematic = false;
  private readonly touches = new Map<number, { x: number; y: number; sx: number; sy: number }>();
  private pinch: { dist: number; angle: number; mx: number; my: number } | null = null;
  private gestureMoved = false;
  /** True while (or just after) a touch drag/pinch, so the game ignores the tap. */
  get touchGesture(): boolean {
    return this.gestureMoved;
  }
  minDistance = 18;
  readonly maxDistance = 150;
  private readonly disposers: Array<() => void> = [];

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    dom: HTMLElement,
    private readonly terrain: TerrainData,
  ) {
    const touchMid = () => {
      const pts = [...this.touches.values()];
      const a = pts[0];
      const b = pts[1];
      return { dist: Math.hypot(a.x - b.x, a.y - b.y), angle: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    };
    const onDown = (e: PointerEvent) => {
      if (!this.enabled) return;
      if (e.pointerType === 'touch') {
        if (this.touches.size === 0) this.gestureMoved = false;
        this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
        this.flight = null;
        this.cinematic = false;
        if (this.touches.size === 2) {
          this.pinch = touchMid();
          this.gestureMoved = true;
        }
        return;
      }
      if (e.button === 2 || e.button === 1) {
        this.drag = { button: e.button, x: e.clientX, y: e.clientY };
        dom.setPointerCapture(e.pointerId);
        this.flight = null;
        e.preventDefault();
      }
    };
    const onMove = (e: PointerEvent) => {
      const tp = this.touches.get(e.pointerId);
      if (tp) {
        const dx = e.clientX - tp.x;
        const dy = e.clientY - tp.y;
        tp.x = e.clientX;
        tp.y = e.clientY;
        if (this.touches.size === 1) {
          if (!this.gestureMoved && Math.hypot(tp.x - tp.sx, tp.y - tp.sy) > 12) this.gestureMoved = true;
          if (this.gestureMoved) this.panBy(-dx, -dy, 0.0024 * this.goalDistance * this.sensitivity);
        } else if (this.touches.size === 2 && this.pinch) {
          const now = touchMid();
          this.goalDistance = THREE.MathUtils.clamp(this.goalDistance * (this.pinch.dist / Math.max(20, now.dist)), this.minDistance, this.maxDistance);
          this.goalYaw -= (now.angle - this.pinch.angle) * this.sensitivity;
          this.panBy(-(now.mx - this.pinch.mx), -(now.my - this.pinch.my), 0.0024 * this.goalDistance);
          this.pinch = now;
        }
        return;
      }
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
      if (this.drag.button === 2) {
        this.goalYaw -= dx * 0.006 * this.sensitivity;
        this.goalPitch = THREE.MathUtils.clamp(this.goalPitch + dy * 0.004 * this.sensitivity, 0.42, 1.38);
      } else {
        this.panBy(-dx, -dy, 0.0024 * this.goalDistance);
      }
    };
    const onUp = (e: PointerEvent) => {
      if (this.touches.has(e.pointerId)) {
        this.touches.delete(e.pointerId);
        this.pinch = this.touches.size === 2 ? touchMid() : null;
        // Keep gestureMoved set until the next touch starts so the release isn't read as a tap.
        return;
      }
      if (this.drag && (e.button === this.drag.button || e.buttons === 0)) {
        this.drag = null;
        if (dom.hasPointerCapture(e.pointerId)) dom.releasePointerCapture(e.pointerId);
      }
    };
    const onWheel = (e: WheelEvent) => {
      if (!this.enabled) return;
      e.preventDefault();
      this.flight = null;
      const factor = Math.exp(Math.sign(e.deltaY) * Math.min(1, Math.abs(e.deltaY) / 100) * 0.14 * this.sensitivity);
      this.goalDistance = THREE.MathUtils.clamp(this.goalDistance * factor, this.minDistance, this.maxDistance);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      this.keys.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
    const onBlur = () => {
      this.keys.clear();
      this.drag = null;
    };
    const onContext = (e: Event) => e.preventDefault();
    dom.addEventListener('pointerdown', onDown);
    dom.addEventListener('pointermove', onMove);
    dom.addEventListener('pointerup', onUp);
    dom.addEventListener('pointercancel', onUp);
    dom.addEventListener('wheel', onWheel, { passive: false });
    dom.addEventListener('contextmenu', onContext);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    this.disposers.push(
      () => dom.removeEventListener('pointerdown', onDown),
      () => dom.removeEventListener('pointermove', onMove),
      () => dom.removeEventListener('pointerup', onUp),
      () => dom.removeEventListener('pointercancel', onUp),
      () => dom.removeEventListener('wheel', onWheel),
      () => dom.removeEventListener('contextmenu', onContext),
      () => window.removeEventListener('keydown', onKeyDown),
      () => window.removeEventListener('keyup', onKeyUp),
      () => window.removeEventListener('blur', onBlur),
    );
  }

  get dragging(): boolean {
    return this.drag !== null;
  }

  private panBy(dx: number, dy: number, scale: number): void {
    const cos = Math.cos(this.goalYaw);
    const sin = Math.sin(this.goalYaw);
    // Screen right = (cos, -sin) in xz; screen up (forward) = (-sin, -cos)
    this.goalTarget.x += (dx * cos + dy * sin) * scale;
    this.goalTarget.z += (-dx * sin + dy * cos) * scale;
    this.clampTarget();
    this.flight = null;
  }

  private clampTarget(): void {
    const r = Math.hypot(this.goalTarget.x, this.goalTarget.z);
    const max = 72;
    if (r > max) {
      this.goalTarget.x *= max / r;
      this.goalTarget.z *= max / r;
    }
  }

  /** v0.4 possession: a close third-person view that follows behind a walking villager. */
  track(x: number, y: number, z: number, heading: number, dt: number): void {
    this.flight = null;
    this.goalTarget.set(x, y + 1.2, z);
    this.target.lerp(this.goalTarget, Math.min(1, dt * 8));
    const behind = heading + Math.PI;
    let diff = behind - this.goalYaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.goalYaw += diff * Math.min(1, dt * 2.5);
    this.goalDistance = 13;
    this.goalPitch = 0.42;
  }

  /** Copy of the current view, to restore after possession or cinematic mode. */
  snapshot(): { x: number; z: number; d: number; yaw: number; pitch: number } {
    return { x: this.goalTarget.x, z: this.goalTarget.z, d: this.goalDistance, yaw: this.goalYaw, pitch: this.goalPitch };
  }

  /** Smoothly fly to a point of interest. */
  focus(x: number, z: number, distance = 48, duration = 1.4, yaw?: number, pitch?: number): void {
    const to = new THREE.Vector3(x, Math.max(0, this.terrain.heightAt(x, z)), z);
    this.flight = {
      from: this.goalTarget.clone(),
      to,
      fromD: this.goalDistance,
      toD: distance,
      t: 0,
      dur: duration,
      yawFrom: this.goalYaw,
      yawTo: yaw ?? this.goalYaw,
      pitchFrom: this.goalPitch,
      pitchTo: pitch ?? this.goalPitch,
    };
  }

  snap(x: number, z: number, distance: number, yaw: number, pitch: number): void {
    this.goalTarget.set(x, Math.max(0, this.terrain.heightAt(x, z)), z);
    this.target.copy(this.goalTarget);
    this.goalDistance = this.distance = distance;
    this.goalYaw = this.yaw = yaw;
    this.goalPitch = this.pitch = pitch;
    this.flight = null;
    this.apply(0);
  }

  addShake(amount: number): void {
    this.shake = Math.min(1.2, this.shake + amount * (this.reducedShake ? 0.15 : 1));
  }

  update(dt: number): void {
    if (this.enabled) {
      let px = 0;
      let pz = 0;
      if (!this.keysEnabled) this.keys.clear();
      if (this.cinematic) {
        this.goalYaw += dt * 0.07;
        this.goalTarget.lerp(new THREE.Vector3(Math.sin(this.goalYaw * 0.7) * 14, 2, 8 + Math.cos(this.goalYaw * 0.5) * 10), Math.min(1, dt * 0.3));
        this.goalDistance += (105 - this.goalDistance) * Math.min(1, dt * 0.3);
        this.goalPitch += (0.62 - this.goalPitch) * Math.min(1, dt * 0.3);
      }
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) pz -= 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) pz += 1;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) px -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) px += 1;
      if (px || pz) this.panBy(px * 900 * dt, pz * 900 * dt, 0.0011 * this.goalDistance * this.sensitivity);
      if (this.keys.has('KeyQ')) this.goalYaw += dt * 1.6 * this.sensitivity;
      if (this.keys.has('KeyE')) this.goalYaw -= dt * 1.6 * this.sensitivity;
    }
    if (this.flight) {
      const f = this.flight;
      f.t = Math.min(1, f.t + dt / f.dur);
      const e = f.t < 0.5 ? 4 * f.t * f.t * f.t : 1 - Math.pow(-2 * f.t + 2, 3) / 2;
      this.goalTarget.lerpVectors(f.from, f.to, e);
      this.goalDistance = f.fromD + (f.toD - f.fromD) * e;
      this.goalYaw = f.yawFrom + (f.yawTo - f.yawFrom) * e;
      this.goalPitch = f.pitchFrom + (f.pitchTo - f.pitchFrom) * e;
      if (f.t >= 1) this.flight = null;
    }
    this.apply(dt);
  }

  private apply(dt: number): void {
    const k = dt === 0 ? 1 : 1 - Math.exp(-dt * 9);
    this.target.lerp(this.goalTarget, k);
    this.target.y += (Math.max(0, this.terrain.heightAt(this.target.x, this.target.z)) - this.target.y) * k;
    this.yaw += (this.goalYaw - this.yaw) * k;
    this.pitch += (this.goalPitch - this.pitch) * k;
    this.distance += (this.goalDistance - this.distance) * k;

    const cp = Math.cos(this.pitch);
    const pos = this.camera.position;
    pos.set(
      this.target.x + Math.sin(this.yaw) * cp * this.distance,
      this.target.y + Math.sin(this.pitch) * this.distance,
      this.target.z + Math.cos(this.yaw) * cp * this.distance,
    );
    // Terrain clearance.
    const ground = Math.max(0, this.terrain.heightAt(pos.x, pos.z));
    if (pos.y < ground + 4) pos.y = ground + 4;

    if (this.shake > 0.001) {
      const s = this.shake * 0.6;
      this.shakeOffset.set((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
      pos.add(this.shakeOffset);
      this.shake *= Math.exp(-dt * 7);
    }
    this.camera.lookAt(this.target);
  }

  dispose(): void {
    for (const d of this.disposers) d();
  }
}
