import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import { LumoModel } from './Lumo';
import { lumoUniforms } from '../art/Materials';

export type LumoState = 'dormant' | 'follow' | 'travel' | 'perched' | 'docked' | 'cinematic';

export interface LumoAnchor {
  id: string;
  anchor: THREE.Vector3;
  kind: 'perch' | 'nest' | 'socket';
  onArrive?(ctx: GameContext): void;
  onLeave?(ctx: GameContext): void;
}

const DRAIN_GLOW = 0.6;
const DRAIN_PERCH = 0.4;
const CHARGE_RATE = 30;

/**
 * LUMO's behaviour: a companion with its own position, energy and intent,
 * not a camera flashlight. The light only exists where LUMO actually is.
 */
export class LumoController {
  readonly model = new LumoModel();
  readonly light = new THREE.PointLight('#ffb15a', 0, 5, 1.6);
  state: LumoState = 'dormant';
  glowing = true;
  energy = 25;
  found = false;
  anchor: LumoAnchor | null = null;
  /** Darkness so deep that LUMO's follow light is swallowed. */
  suppressed = false;
  private travelFrom = new THREE.Vector3();
  private travelTo = new THREE.Vector3();
  private travelT = 0;
  private travelDur = 1;
  private travelTarget: LumoAnchor | 'player' | null = null;
  private brightness = 0;
  private radius = 0;
  private time = 0;
  private lowWarned = false;
  private followVel = new THREE.Vector3();
  private chirpTimer = 4;
  private tremble = 0;
  /** Brightness multiplier driven by cinematics (finale). */
  boost = 0;

  constructor(private readonly scene: THREE.Scene) {
    this.light.castShadow = false;
    this.model.root.add(this.light);
    this.light.position.set(0, -0.01, 0.03);
    scene.add(this.model.root);
    this.model.root.visible = false;
  }

  get position(): THREE.Vector3 {
    return this.model.root.position;
  }

  /** Effective light radius for gameplay (reveals, hazards). */
  get lightRadius(): number {
    return this.radius;
  }

  get isLit(): boolean {
    return this.radius > 0.4;
  }

  get available(): boolean {
    return this.found && this.state !== 'dormant' && this.state !== 'cinematic';
  }

  litAt(point: THREE.Vector3, margin = 0): boolean {
    return this.isLit && this.position.distanceTo(point) < this.radius + margin;
  }

  /** Called by levels: LUMO lies asleep somewhere until found. */
  setDormantAt(pos: THREE.Vector3, parent?: THREE.Object3D): void {
    this.state = 'dormant';
    this.found = false;
    this.anchor = null;
    if (parent) {
      parent.add(this.model.root);
    } else {
      this.scene.add(this.model.root);
    }
    this.model.root.position.copy(pos);
    this.model.root.rotation.set(0, 0.6, 0.25);
    this.model.root.visible = true;
  }

  /** Restore at checkpoint: already found, following the player. */
  restore(found: boolean, energy: number, playerCamera: THREE.Camera): void {
    this.energy = energy;
    this.found = found;
    this.anchor = null;
    this.travelTarget = null;
    this.boost = 0;
    this.scene.add(this.model.root);
    this.model.root.rotation.set(0, 0, 0);
    if (found) {
      this.state = 'follow';
      this.glowing = energy > 0;
      this.model.root.visible = true;
      this.model.root.position.copy(this.followPoint(playerCamera));
    } else {
      this.state = 'dormant';
    }
  }

  wake(ctx: GameContext): void {
    this.found = true;
    const world = new THREE.Vector3();
    this.model.root.getWorldPosition(world);
    this.scene.add(this.model.root);
    this.model.root.position.copy(world);
    this.model.root.rotation.set(0, 0, 0);
    this.state = 'follow';
    this.glowing = true;
    ctx.audio.startTrackedLoop('lumo-wings', 'lumo', this.model.root, 0.05);
  }

  /** F key: recall if away, otherwise toggle the glow. */
  toggle(ctx: GameContext): void {
    if (!this.found) return;
    if (this.state === 'perched' || this.state === 'docked' || (this.state === 'travel' && this.travelTarget !== 'player')) {
      this.recall(ctx);
      return;
    }
    if (this.state !== 'follow') return;
    if (this.energy <= 0) {
      ctx.ui.hint('LUMO is exhausted. Find a Nest to wind it up.', 3);
      ctx.audio.play('lumoLow', { pos: this.position });
      return;
    }
    this.glowing = !this.glowing;
    ctx.audio.play('lumoChirp', { pos: this.position, volume: this.glowing ? 1 : 0.5 });
  }

  recall(ctx: GameContext): void {
    if (this.anchor) this.anchor.onLeave?.(ctx);
    this.anchor = null;
    this.startTravel(ctx, 'player');
    ctx.audio.play('lumoChirp', { pos: this.position });
  }

  sendTo(ctx: GameContext, target: LumoAnchor): void {
    if (this.anchor === target) return;
    if (this.anchor) this.anchor.onLeave?.(ctx);
    this.anchor = null;
    this.glowing = true;
    this.startTravel(ctx, target);
    ctx.audio.play('lumoChirp', { pos: this.position });
  }

  private startTravel(ctx: GameContext, target: LumoAnchor | 'player'): void {
    this.travelFrom.copy(this.position);
    this.travelTarget = target;
    this.travelTo.copy(target === 'player' ? this.followPoint(ctx.camera) : target.anchor);
    const dist = this.travelFrom.distanceTo(this.travelTo);
    this.travelDur = Math.max(0.35, dist / 3.6);
    this.travelT = 0;
    this.state = 'travel';
  }

  /** THE HUSH reached LUMO: light swallowed, LUMO flees home scared. */
  snuff(ctx: GameContext): void {
    this.energy = Math.max(0, this.energy - 25);
    this.tremble = 2.5;
    if (this.anchor) this.anchor.onLeave?.(ctx);
    this.anchor = null;
    this.glowing = false;
    this.startTravel(ctx, 'player');
    ctx.audio.play('lumoLow', { pos: this.position });
  }

  /** Set by cinematics. */
  hold(pos: THREE.Vector3): void {
    this.state = 'cinematic';
    this.travelFrom.copy(this.position);
    this.travelTo.copy(pos);
    this.travelT = 0;
    this.travelDur = Math.max(0.4, this.travelFrom.distanceTo(pos) / 2);
  }

  release(): void {
    if (this.state === 'cinematic') this.state = 'follow';
  }

  frighten(seconds: number): void {
    this.tremble = Math.max(this.tremble, seconds);
  }

  private followPoint(camera: THREE.Camera, out = new THREE.Vector3()): THREE.Vector3 {
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
    fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    camera.getWorldPosition(out);
    out.addScaledVector(fwd, 0.62).addScaledVector(right, 0.34);
    out.y -= 0.06;
    out.y += Math.sin(this.time * 1.7) * 0.03;
    out.x += Math.sin(this.time * 0.9) * 0.04;
    return out;
  }

  update(dt: number, ctx: GameContext): void {
    this.time += dt;
    this.tremble = Math.max(0, this.tremble - dt);
    let targetBrightness = 0;
    let targetRadius = 0;
    let flapHz = 14;
    let wingsOpen = 1;
    const root = this.model.root;

    switch (this.state) {
      case 'dormant':
        targetBrightness = 0.08 + Math.sin(this.time * 2) * 0.04;
        wingsOpen = 0;
        this.model.animate(this.time, targetBrightness, 0, 0, true);
        this.brightness = targetBrightness;
        this.light.intensity = 0.05;
        this.light.distance = 1;
        this.updateUniforms(0);
        return;
      case 'follow': {
        const target = this.followPoint(ctx.camera);
        // Critically damped spring: playful lag, never far.
        const toTarget = target.sub(root.position);
        this.followVel.addScaledVector(toTarget, 60 * dt);
        this.followVel.multiplyScalar(Math.exp(-11 * dt));
        root.position.addScaledVector(this.followVel, dt);
        if (root.position.distanceTo(ctx.camera.position) > 3) root.position.copy(this.followPoint(ctx.camera));
        this.faceAlong(this.followVel, ctx.camera, dt);
        const lit = this.glowing && this.energy > 0;
        targetBrightness = lit ? (this.suppressed ? 0.18 : 0.75) : 0.06;
        targetRadius = lit && !this.suppressed ? 2.2 : 0;
        if (lit) this.energy -= DRAIN_GLOW * dt;
        break;
      }
      case 'travel':
      case 'cinematic': {
        this.travelT = Math.min(1, this.travelT + dt / this.travelDur);
        if (this.travelTarget === 'player' && this.state === 'travel') this.travelTo.copy(this.followPoint(ctx.camera));
        const k = this.travelT;
        const e = k * k * (3 - 2 * k);
        const prev = root.position.clone();
        root.position.lerpVectors(this.travelFrom, this.travelTo, e);
        root.position.y += Math.sin(k * Math.PI) * 0.25;
        this.faceAlong(root.position.clone().sub(prev), ctx.camera, dt);
        flapHz = 20;
        targetBrightness = this.state === 'cinematic' ? 0.9 + this.boost : this.glowing ? 0.7 : 0.1;
        targetRadius = this.state === 'cinematic' ? 2.5 + this.boost * 3 : this.glowing ? 2 : 0;
        if (this.state === 'travel' && k >= 1) this.arrive(ctx);
        break;
      }
      case 'perched': {
        const a = this.anchor!;
        root.position.lerp(a.anchor, 1 - Math.exp(-10 * dt));
        root.rotation.y += dt * 0.2;
        flapHz = 3;
        wingsOpen = 0.35;
        const lit = this.energy > 0;
        targetBrightness = lit ? 1 : 0.05;
        targetRadius = lit ? 3.3 : 0;
        if (lit) this.energy -= DRAIN_PERCH * dt;
        if (!lit) this.recall(ctx);
        break;
      }
      case 'docked': {
        const a = this.anchor!;
        root.position.lerp(a.anchor, 1 - Math.exp(-10 * dt));
        flapHz = 2;
        wingsOpen = 0.2;
        const before = this.energy;
        this.energy = Math.min(100, this.energy + CHARGE_RATE * dt);
        targetBrightness = 0.35 + (this.energy / 100) * 0.55;
        targetRadius = 1.6;
        if (before < 100 && this.energy >= 100) {
          ctx.audio.play('lumoWake', { pos: this.position, volume: 0.6 });
          ctx.ui.hint('LUMO is fully wound. Press F to call it back.', 3);
        }
        // Walk away and LUMO follows on its own.
        if (this.energy >= 100 && ctx.player.position.distanceTo(a.anchor) > 2.6) this.recall(ctx);
        break;
      }
    }

    this.energy = Math.max(0, Math.min(100, this.energy));
    if (this.energy < 15 && this.energy > 0 && this.isLit) {
      // flicker as it runs down
      targetBrightness *= 0.65 + 0.35 * Math.abs(Math.sin(this.time * 9) * Math.sin(this.time * 3.3));
      if (!this.lowWarned) {
        this.lowWarned = true;
        ctx.audio.play('lumoLow', { pos: this.position });
        ctx.ui.hint('LUMO is running down…', 2.5);
      }
    }
    if (this.energy > 20) this.lowWarned = false;
    if (this.energy <= 0 && this.state === 'follow' && this.glowing) {
      this.glowing = false;
      ctx.audio.play('lumoLow', { pos: this.position });
      ctx.ui.hint('LUMO is exhausted. Find a Nest to wind it up.', 3.5);
    }
    if (this.tremble > 0) {
      root.position.x += (Math.random() - 0.5) * 0.004;
      root.position.y += (Math.random() - 0.5) * 0.004;
      targetBrightness *= 0.7;
    }
    targetBrightness += this.boost;
    this.brightness = THREE.MathUtils.damp(this.brightness, targetBrightness, 6, dt);
    this.radius = THREE.MathUtils.damp(this.radius, targetRadius, 5, dt);
    this.light.intensity = this.brightness * 2.6 * (1 + this.boost * 3);
    this.light.distance = 1.5 + this.radius * 1.8;
    this.model.animate(this.time, Math.min(1.4, this.brightness), flapHz, wingsOpen);
    this.updateUniforms(this.radius);

    // Idle chirps so LUMO feels alive.
    this.chirpTimer -= dt;
    if (this.chirpTimer <= 0 && this.state === 'follow') {
      this.chirpTimer = 9 + Math.random() * 10;
      if (this.isLit) ctx.audio.play('lumoChirp', { pos: this.position, volume: 0.45 });
    }
    ctx.audio.setLoopVolume('lumo-wings', this.state === 'follow' || this.state === 'travel' ? 0.05 : 0.012);
  }

  private faceAlong(vel: THREE.Vector3, camera: THREE.Camera, dt: number): void {
    const root = this.model.root;
    let yaw: number;
    if (vel.lengthSq() > 0.0004) {
      yaw = Math.atan2(-vel.x, -vel.z);
    } else {
      // Idle: look back at the child now and then.
      const toCam = camera.position.clone().sub(root.position);
      yaw = Math.atan2(-toCam.x, -toCam.z) + Math.sin(this.time * 0.5) * 0.8;
    }
    let d = yaw - root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    root.rotation.y += d * (1 - Math.exp(-6 * dt));
    root.rotation.z = THREE.MathUtils.damp(root.rotation.z, -d * 0.5, 6, dt);
  }

  private arrive(ctx: GameContext): void {
    const t = this.travelTarget;
    this.travelTarget = null;
    if (t === 'player' || t === null) {
      this.state = 'follow';
      this.glowing = this.energy > 0;
      return;
    }
    this.anchor = t;
    this.state = t.kind === 'nest' ? 'docked' : 'perched';
    ctx.audio.play(t.kind === 'nest' ? 'charge' : 'lumoPlace', { pos: t.anchor });
    t.onArrive?.(ctx);
  }

  private updateUniforms(radius: number): void {
    this.light.getWorldPosition(lumoUniforms.uLumoPos.value);
    lumoUniforms.uLumoRadius.value = radius * 1.05 + this.boost * 3;
  }

  dispose(): void {
    this.model.root.removeFromParent();
  }
}
