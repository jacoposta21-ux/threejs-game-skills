import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import { Interactable, type Prompt } from './Interactable';
import { makeCollider, type Collider } from '../physics/CollisionWorld';
import { mat, rbox, cyl, sphere } from '../art/Materials';
import { woodGrain } from '../art/Textures';

export interface DoorOptions {
  width: number;
  height: number;
  thickness?: number;
  /** Hinge position at floor level. */
  hinge: THREE.Vector3;
  /** Yaw of the closed panel; the panel extends along local +X from the hinge. */
  closedYaw: number;
  openAngle: number;
  handleHeight?: number;
  color?: string;
  locked?: { item?: string; flag?: string; message: string };
  noisy?: boolean;
  /** Panel style. */
  style?: 'panel' | 'plain' | 'cabinet';
  oneWay?: boolean;
  /** Toddler cannot reach a regular handle; requires standing on something. */
  needsReach?: boolean;
  label?: string;
  onOpen?: (ctx: GameContext) => void;
}

export class Door extends Interactable {
  readonly pivot = new THREE.Group();
  collider: Collider | null = null;
  open = 0;
  private target = 0;
  private moving = false;
  locked: DoorOptions['locked'];

  constructor(id: string, readonly opts: DoorOptions) {
    super(id);
    this.locked = opts.locked;
    const t = opts.thickness ?? 0.045;
    this.root.position.copy(opts.hinge);
    this.root.add(this.pivot);
    this.pivot.rotation.y = opts.closedYaw;
    const wood = mat(`door-${opts.color ?? '#7b5a3f'}`, { map: woodGrain(opts.color ?? '#7b5a3f'), roughness: 0.7 });
    const panel = rbox(opts.width, opts.height, t, wood, 0.01, opts.width / 2, 0, 0);
    this.pivot.add(panel);
    if ((opts.style ?? 'panel') === 'panel') {
      const inset = mat(`doorInset-${opts.color ?? '#7b5a3f'}`, { map: woodGrain(opts.color ?? '#7b5a3f'), color: '#d8cfc4', roughness: 0.75 });
      for (const [y, h] of [[0.15, opts.height * 0.38], [opts.height * 0.58, opts.height * 0.34]] as const) {
        for (const side of [-1, 1]) {
          const p = rbox(opts.width * 0.66, h, 0.015, inset, 0.008, opts.width / 2, y, (side * t) / 2);
          this.pivot.add(p);
        }
      }
    } else if (opts.style === 'cabinet') {
      const inset = mat('cabinetInset', { color: '#2e3a39', roughness: 0.6 });
      for (const side of [-1, 1]) this.pivot.add(rbox(opts.width * 0.78, opts.height * 0.8, 0.01, inset, 0.004, opts.width / 2, opts.height * 0.1, (side * t) / 2));
    }
    // Handle: brass knob on both sides, high above the child.
    const hh = opts.handleHeight ?? 1.0;
    const brass = mat('brass', { color: '#c79a4a', metalness: 0.85, roughness: 0.32 });
    for (const side of [-1, 1]) {
      const stem = cyl(0.012, 0.012, 0.05, brass, 10);
      stem.rotation.x = Math.PI / 2;
      stem.position.set(opts.width - 0.08, hh, side * (t / 2 + 0.025));
      this.pivot.add(stem);
      const knob = sphere(opts.style === 'cabinet' ? 0.018 : 0.032, brass, 14);
      knob.position.set(opts.width - 0.08, hh, side * (t / 2 + 0.055));
      this.pivot.add(knob);
    }
    this.addHitBox(opts.width, opts.height, t + 0.12, opts.width / 2, 0, 0, this.pivot);
    this.range = 1.75;
  }

  attach(ctx: GameContext): void {
    this.collider = ctx.world.add(makeCollider(new THREE.Vector3(), new THREE.Vector3(), { id: `door-${this.id}`, walkable: false, occluder: true }));
    this.updateCollider(ctx);
  }

  get isOpen(): boolean {
    return this.target > 0.5;
  }

  prompt(ctx: GameContext): Prompt | null {
    if (this.moving) return null;
    if (this.isOpen) return this.opts.oneWay ? null : { verb: 'Close', key: 'E' };
    if (this.locked) {
      const { item, flag, message } = this.locked;
      const unlocked = (item && ctx.inventory.has(item)) || (flag && ctx.flags.has(flag));
      if (!unlocked) return { verb: message, disabled: true };
    }
    if ((this.opts.needsReach ?? true) && ctx.player.reachY < (this.opts.handleHeight ?? 1.0) - 0.05) {
      return { verb: 'The handle is too high', disabled: true };
    }
    return { verb: this.locked?.item ? 'Unlock' : (this.opts.label ?? 'Open'), key: 'E' };
  }

  interact(ctx: GameContext): void {
    if (!this.isOpen && this.locked?.item) {
      ctx.audio.play('unlock', { pos: this.focus() });
      this.locked = undefined;
      ctx.flags.set(`unlocked:${this.id}`);
    }
    this.setOpen(ctx, !this.isOpen, false);
  }

  setOpen(ctx: GameContext, open: boolean, instant: boolean): void {
    this.target = open ? 1 : 0;
    ctx.flags.set(`door:${this.id}`, open);
    if (instant) {
      this.open = this.target;
      this.apply();
      this.updateCollider(ctx);
      return;
    }
    this.moving = true;
    const pos = this.focus();
    if (this.opts.noisy ?? true) {
      ctx.audio.play('doorCreak', { pos });
      ctx.noise.emit(pos, 6, 'door');
    } else {
      ctx.audio.play('creak', { pos, volume: 0.5 });
      ctx.noise.emit(pos, 2.5, 'door');
    }
    if (open) this.opts.onOpen?.(ctx);
  }

  applyState(ctx: GameContext): void {
    if (ctx.flags.has(`unlocked:${this.id}`)) this.locked = undefined;
    if (ctx.flags.get(`door:${this.id}`)) this.setOpen(ctx, true, true);
  }

  focus(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(this.opts.width - 0.08, this.opts.handleHeight ?? 1, 0).applyMatrix4(this.pivot.matrixWorld);
  }

  update(dt: number, ctx: GameContext): void {
    if (!this.moving) return;
    const speed = 1.4;
    this.open += Math.sign(this.target - this.open) * dt * speed;
    if ((this.target === 1 && this.open >= 1) || (this.target === 0 && this.open <= 0)) {
      this.open = this.target;
      this.moving = false;
      if (this.target === 0) ctx.audio.play('doorThud', { pos: this.focus(), volume: 0.5 });
    }
    this.apply();
    this.updateCollider(ctx);
  }

  private apply(): void {
    const e = this.open * this.open * (3 - 2 * this.open);
    this.pivot.rotation.y = this.opts.closedYaw + this.opts.openAngle * e;
    this.root.updateMatrixWorld(true);
  }

  private updateCollider(ctx: GameContext): void {
    if (!this.collider) return;
    this.root.updateMatrixWorld(true);
    const t = (this.opts.thickness ?? 0.045) / 2 + 0.01;
    const box = new THREE.Box3();
    for (const [x, z] of [[0, -t], [0, t], [this.opts.width, -t], [this.opts.width, t]]) {
      box.expandByPoint(new THREE.Vector3(x, 0, z).applyMatrix4(this.pivot.matrixWorld));
    }
    this.collider.min.set(box.min.x, this.opts.hinge.y, box.min.z);
    this.collider.max.set(box.max.x, this.opts.hinge.y + this.opts.height, box.max.z);
    // While swinging the diagonal AABB would block the doorway; only collide when settled-ish.
    this.collider.enabled = !this.moving || this.open < 0.15 || this.open > 0.85;
    ctx.world.markChanged();
  }
}
