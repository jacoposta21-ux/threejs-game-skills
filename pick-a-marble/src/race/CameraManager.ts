import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export type CamMode = 'cinematic' | 'leader' | 'selected' | 'overview' | 'finish' | 'free';

export interface CamContext {
  positions: THREE.Vector3[];
  velocities: THREE.Vector3[];
  active: boolean[];
  leader: number;
  selected: number;
  order: number[];
  leaderRemaining: number;
  finishPos: THREE.Vector3 | null;
  finishDir: THREE.Vector3 | null;
  bounds: THREE.Box3;
}

type Shot = 'chase' | 'side' | 'crane' | 'front' | 'pack';

export const CAM_LABEL: Record<CamMode, string> = {
  cinematic: 'Cinematic',
  leader: 'Leader',
  selected: 'Follow',
  overview: 'Overview',
  finish: 'Finish',
  free: 'Free',
};

export class CameraManager {
  readonly controls: OrbitControls;
  mode: CamMode = 'cinematic';
  private pos = new THREE.Vector3();
  private target = new THREE.Vector3();
  private fwd = new Map<number, THREE.Vector3>();
  private shot: Shot = 'chase';
  private shotTime = 0;
  private shotIndex = 0;
  private sideSign = 1;
  private blend = 2.2;
  private lastTarget = -1;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    dom: HTMLElement,
  ) {
    this.controls = new OrbitControls(camera, dom);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 220;
    this.controls.screenSpacePanning = false;
    this.controls.zoomToCursor = true;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  }

  /** Hand the camera to orbit controls (editor, menu, free cam). */
  useOrbit(enabled: boolean): void {
    this.controls.enabled = enabled;
  }

  setMode(mode: CamMode): void {
    this.mode = mode;
    this.controls.enabled = mode === 'free';
    if (mode === 'free') this.controls.target.copy(this.target);
    this.blend = 2.0;
  }

  /** Begin race camera from current view. */
  beginRace(): void {
    this.pos.copy(this.camera.position);
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    this.target.copy(this.camera.position).addScaledVector(dir, 10);
    this.shotTime = 0;
    this.shot = 'chase';
    this.fwd.clear();
  }

  private forward(i: number, ctx: CamContext, dt: number): THREE.Vector3 {
    let f = this.fwd.get(i);
    if (!f) {
      f = new THREE.Vector3(1, 0, 0);
      this.fwd.set(i, f);
    }
    const v = ctx.velocities[i];
    if (v && v.lengthSq() > 0.5) {
      const h = new THREE.Vector3(v.x, 0, v.z);
      if (h.lengthSq() > 0.05) {
        h.normalize();
        f.lerp(h, 1 - Math.exp(-dt * 2.2)).normalize();
      }
    }
    return f;
  }

  update(dt: number, ctx: CamContext | null): void {
    if (this.mode === 'free' || !ctx) {
      this.controls.update();
      return;
    }
    const desiredPos = new THREE.Vector3();
    const desiredTarget = new THREE.Vector3();
    let mode = this.mode;
    if (mode === 'cinematic' && ctx.leaderRemaining < 13 && ctx.finishPos) mode = 'finish';
    const followIndex = mode === 'selected' && ctx.selected >= 0 ? ctx.selected : ctx.leader;
    if (followIndex !== this.lastTarget) {
      this.lastTarget = followIndex;
      this.blend = 1.6;
    }
    const p = ctx.positions[followIndex] ?? new THREE.Vector3();
    const f = this.forward(followIndex, ctx, dt);
    const up = new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(f, up).normalize();

    if (mode === 'leader' || mode === 'selected') {
      desiredPos.copy(p).addScaledVector(f, -6.5).addScaledVector(up, 3.4);
      desiredTarget.copy(p).addScaledVector(f, 2).addScaledVector(up, 0.3);
    } else if (mode === 'overview') {
      const c = ctx.bounds.getCenter(new THREE.Vector3());
      const size = ctx.bounds.getSize(new THREE.Vector3());
      const r = Math.max(10, size.length() * 0.5);
      const dist = (r / Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5))) * 0.95;
      desiredPos.copy(c).add(new THREE.Vector3(0.75, 0.85, 1).normalize().multiplyScalar(dist));
      desiredTarget.copy(c);
    } else if (mode === 'finish' && ctx.finishPos && ctx.finishDir) {
      const fd = ctx.finishDir.clone().normalize();
      const fs = new THREE.Vector3().crossVectors(fd, up).normalize();
      desiredPos.copy(ctx.finishPos).addScaledVector(fd, 4.5).addScaledVector(fs, 4.2).addScaledVector(up, 2.6);
      const look = ctx.finishPos.clone().addScaledVector(fd, -3);
      // drift toward the approaching leader
      look.lerp(p, 0.35);
      desiredTarget.copy(look);
    } else {
      // cinematic director
      this.shotTime += dt;
      if (this.shotTime > (this.shot === 'crane' ? 4 : 5.5)) {
        this.shotTime = 0;
        const shots: Shot[] = ['chase', 'side', 'pack', 'front', 'crane', 'chase', 'side'];
        this.shotIndex = (this.shotIndex + 1) % shots.length;
        this.shot = shots[this.shotIndex];
        this.sideSign = this.shotIndex % 2 ? 1 : -1;
        this.blend = 1.2;
      }
      const pack = new THREE.Vector3();
      let n = 0;
      for (const idx of ctx.order.slice(0, 4)) {
        if (!ctx.active[idx]) continue;
        pack.add(ctx.positions[idx]);
        n += 1;
      }
      if (n) pack.divideScalar(n);
      else pack.copy(p);
      switch (this.shot) {
        case 'chase':
          desiredPos.copy(p).addScaledVector(f, -7).addScaledVector(up, 4);
          desiredTarget.copy(p).addScaledVector(f, 2.5);
          break;
        case 'side':
          desiredPos.copy(p).addScaledVector(side, 7 * this.sideSign).addScaledVector(up, 2.2).addScaledVector(f, 1.5);
          desiredTarget.copy(p).addScaledVector(f, 1);
          break;
        case 'front':
          desiredPos.copy(p).addScaledVector(f, 7.5).addScaledVector(up, 1.8).addScaledVector(side, 1.5);
          desiredTarget.copy(p);
          break;
        case 'crane':
          desiredPos.copy(pack).add(new THREE.Vector3(0, 15, 0)).addScaledVector(f, -6).addScaledVector(side, 4);
          desiredTarget.copy(pack);
          break;
        case 'pack':
          desiredPos.copy(pack).addScaledVector(f, -10).addScaledVector(up, 6).addScaledVector(side, -3 * this.sideSign);
          desiredTarget.copy(pack).addScaledVector(f, 2);
          break;
      }
    }
    if (desiredPos.y < 1.2) desiredPos.y = 1.2;
    // smooth blending: faster once settled into a shot
    this.blend = Math.min(5, this.blend + dt * 1.5);
    const kp = 1 - Math.exp(-dt * this.blend);
    const kt = 1 - Math.exp(-dt * (this.blend + 3));
    this.pos.lerp(desiredPos, kp);
    this.target.lerp(desiredTarget, kt);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.target);
  }

  /** Smoothly move the orbit camera to frame a box. */
  frame(box: THREE.Box3, immediate = false, dirHint = new THREE.Vector3(0.8, 0.9, 1)): void {
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const r = Math.max(8, size.length() * 0.5);
    // extra distance: the editor panels cover the screen edges
    const dist = (r / Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5))) * 1.25;
    const pos = c.clone().add(dirHint.clone().normalize().multiplyScalar(dist));
    if (immediate) {
      this.camera.position.copy(pos);
      this.controls.target.copy(c);
      this.controls.update();
    } else {
      this.tweenTo(pos, c);
    }
  }

  private tween: { from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; t: number } | null = null;

  tweenTo(pos: THREE.Vector3, target: THREE.Vector3): void {
    this.tween = { from: this.camera.position.clone(), to: pos, tFrom: this.controls.target.clone(), tTo: target, t: 0 };
  }

  updateTween(dt: number): void {
    if (!this.tween) return;
    this.tween.t = Math.min(1, this.tween.t + dt * 1.4);
    const k = this.tween.t * this.tween.t * (3 - 2 * this.tween.t);
    this.camera.position.lerpVectors(this.tween.from, this.tween.to, k);
    this.controls.target.lerpVectors(this.tween.tFrom, this.tween.tTo, k);
    if (this.tween.t >= 1) this.tween = null;
  }

  get target3(): THREE.Vector3 {
    return this.target;
  }
}
