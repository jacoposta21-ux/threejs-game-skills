import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import { Interactable, type Prompt } from './Interactable';
import { mat, rbox, sphere } from '../art/Materials';
import { woodGrain } from '../art/Textures';

export interface DrawerOptions {
  width: number;
  height: number;
  depth: number;
  /** Local slide direction (unit, in parent space). */
  slide: THREE.Vector3;
  color?: string;
  handleHeight: number;
  locked?: { flag: string; message: string };
  onOpen?: (ctx: GameContext) => void;
  contents?: Interactable[];
  /** Glow inside (LUMO's hiding place). */
  glow?: boolean;
}

/** A drawer that slides out; items inside become reachable only when open. */
export class Drawer extends Interactable {
  readonly box = new THREE.Group();
  open = 0;
  private target = 0;
  readonly basePos = new THREE.Vector3();

  constructor(id: string, readonly opts: DrawerOptions) {
    super(id);
    const wood = mat(`drawer-${opts.color ?? '#a87a52'}`, { map: woodGrain(opts.color ?? '#a87a52'), roughness: 0.7 });
    const inner = mat('drawerInner', { color: '#4a3424', roughness: 0.9 });
    const { width: w, height: h, depth: d } = opts;
    // Front panel + tray (open box) built along -slide so it pulls out of the carcass.
    const front = rbox(w, h, 0.03, wood, 0.008, 0, 0, 0);
    this.box.add(front);
    const tray = new THREE.Group();
    tray.add(rbox(w - 0.04, 0.012, d - 0.04, inner, 0.002, 0, 0.02, -d / 2));
    tray.add(rbox(0.012, h - 0.05, d - 0.04, inner, 0.002, -w / 2 + 0.03, 0.02, -d / 2));
    tray.add(rbox(0.012, h - 0.05, d - 0.04, inner, 0.002, w / 2 - 0.03, 0.02, -d / 2));
    tray.add(rbox(w - 0.04, h - 0.05, 0.012, inner, 0.002, 0, 0.02, -d + 0.03));
    this.box.add(tray);
    const brass = mat('brass', { color: '#c79a4a', metalness: 0.85, roughness: 0.32 });
    const pull = sphere(0.02, brass, 12);
    pull.position.set(0, h / 2, 0.03);
    this.box.add(pull);
    if (opts.glow) {
      const light = new THREE.PointLight('#ffb35a', 0.25, 0.9, 2);
      light.position.set(0, h * 0.4, -d * 0.4);
      this.box.add(light);
      this.box.userData.glowLight = light;
    }
    this.root.add(this.box);
    this.addHitBox(w, h, 0.08, 0, 0, 0.02, this.box);
    this.range = 1.5;
  }

  prompt(ctx: GameContext): Prompt | null {
    if (this.target === 1) return null;
    if (this.opts.locked && !ctx.flags.has(this.opts.locked.flag)) return { verb: this.opts.locked.message, disabled: true };
    const y = this.focus().y;
    if (ctx.player.reachY < y - 0.05) return { verb: 'Too high to reach', disabled: true };
    return { verb: 'Open', key: 'E' };
  }

  interact(ctx: GameContext): void {
    this.target = 1;
    ctx.flags.set(`drawer:${this.id}`, true);
    ctx.audio.play('drawer', { pos: this.focus() });
    ctx.noise.emit(this.focus(), 3, 'drawer');
    this.opts.onOpen?.(ctx);
  }

  applyState(ctx: GameContext): void {
    if (ctx.flags.get(`drawer:${this.id}`)) {
      this.target = 1;
      this.open = 1;
      this.apply();
    }
    this.syncContents();
  }

  update(dt: number): void {
    if (this.open !== this.target) {
      this.open = Math.min(1, this.open + dt * 2.2);
      this.apply();
      this.syncContents();
    }
    const light = this.box.userData.glowLight as THREE.PointLight | undefined;
    if (light) light.intensity = 0.18 + Math.sin(performance.now() * 0.003) * 0.06;
  }

  private apply(): void {
    const e = 1 - Math.pow(1 - this.open, 3);
    this.box.position.copy(this.opts.slide).multiplyScalar(e * this.opts.depth * 0.7);
  }

  private syncContents(): void {
    for (const item of this.opts.contents ?? []) {
      if (item.root.userData.taken) continue;
      item.enabled = this.open > 0.8;
    }
  }

  focus(out = new THREE.Vector3()): THREE.Vector3 {
    return this.box.getWorldPosition(out).add(new THREE.Vector3(0, this.opts.handleHeight, 0));
  }
}
