import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import { Interactable, type Prompt } from './Interactable';
import type { LumoAnchor } from '../companion/LumoController';
import { mat, cyl, sphere, torus, rbox, lathe, plane, basicMat } from '../art/Materials';
import { glyph, softDot, DIAL_GLYPHS, type GlyphKind } from '../art/Textures';

const brass = () => mat('brass', { color: '#c79a4a', metalness: 0.85, roughness: 0.32 });

/**
 * Grandpa's brass perch: a little reflector dish that amplifies LUMO.
 * Placing LUMO here lights a wide area (deep darkness included).
 */
export class Perch extends Interactable implements LumoAnchor {
  readonly kind = 'perch' as const;
  readonly anchor: THREE.Vector3;
  private dish: THREE.Mesh;
  private glow: THREE.Sprite;
  occupied = false;
  onArriveCb: ((ctx: GameContext) => void) | null = null;
  /** Hush is drawn to a lit perch within this range. */
  lureRange = 9;

  constructor(id: string, pos: THREE.Vector3, facingYaw: number, wall = true) {
    super(id);
    this.root.position.copy(pos);
    this.root.rotation.y = facingYaw;
    const b = brass();
    if (wall) {
      const plate = cyl(0.04, 0.04, 0.012, b, 16);
      plate.rotation.x = Math.PI / 2;
      plate.position.set(0, 0, -0.005);
      this.root.add(plate);
      const arm = cyl(0.006, 0.006, 0.12, b, 8);
      arm.rotation.x = Math.PI / 2;
      arm.position.set(0, -0.02, 0.06);
      this.root.add(arm);
    } else {
      const stand = cyl(0.008, 0.012, 0.16, b, 8, 0, -0.18, 0);
      this.root.add(stand);
      const foot = cyl(0.05, 0.06, 0.015, b, 16, 0, -0.19, 0);
      this.root.add(foot);
    }
    this.dish = lathe('perch-dish', [[0.0, 0.0], [0.05, 0.012], [0.07, 0.035], [0.072, 0.04]], mat('perch-dish', { color: '#e9c27a', metalness: 1, roughness: 0.15, side: THREE.DoubleSide }), 20);
    this.dish.position.set(0, -0.04, wall ? 0.12 : 0);
    this.root.add(this.dish);
    const ring = torus(0.072, 0.004, b);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 0.0, wall ? 0.12 : 0);
    this.root.add(ring);
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: '#ffcf7a', transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.glow.scale.setScalar(0.22);
    this.glow.position.set(0, 0.0, wall ? 0.12 : 0);
    this.root.add(this.glow);
    this.anchor = new THREE.Vector3();
    this.addHitBox(0.3, 0.3, 0.3, 0, -0.15, wall ? 0.1 : 0);
    this.range = 3.6;
  }

  attach(): void {
    this.root.updateMatrixWorld(true);
    this.anchor.copy(this.glow.getWorldPosition(new THREE.Vector3())).add(new THREE.Vector3(0, 0.03, 0));
  }

  prompt(ctx: GameContext): Prompt | null {
    if (!ctx.lumo.found) return { verb: 'A small brass perch', disabled: true };
    if (ctx.lumo.anchor === this) return { verb: 'Call LUMO back', key: 'E' };
    if (ctx.lumo.energy <= 0) return { verb: 'LUMO is too tired', disabled: true };
    return { verb: 'Place LUMO', key: 'E' };
  }

  interact(ctx: GameContext): void {
    if (ctx.lumo.anchor === this) ctx.lumo.recall(ctx);
    else ctx.lumo.sendTo(ctx, this);
  }

  onArrive(ctx: GameContext): void {
    this.occupied = true;
    ctx.flags.set(`perch:${this.id}`, true);
    this.onArriveCb?.(ctx);
  }

  onLeave(): void {
    this.occupied = false;
  }

  update(dt: number, ctx: GameContext): void {
    const m = this.glow.material as THREE.SpriteMaterial;
    const target = this.occupied ? 0.75 : ctx.lumo.found ? 0.12 + Math.sin(ctx.time * 2 + this.anchor.x) * 0.05 : 0.04;
    m.opacity += (target - m.opacity) * Math.min(1, dt * 5);
    this.glow.scale.setScalar(this.occupied ? 0.45 : 0.22);
  }
}

/** Wind-up Nest: LUMO's charging cradle. */
export class Nest extends Interactable implements LumoAnchor {
  readonly kind = 'nest' as const;
  readonly anchor = new THREE.Vector3();
  private crank: THREE.Group;
  private glow: THREE.Sprite;
  private spin = 0;

  constructor(id: string, pos: THREE.Vector3, yaw = 0) {
    super(id);
    this.root.position.copy(pos);
    this.root.rotation.y = yaw;
    const b = brass();
    const wood = mat('nest-wood', { color: '#5a3b22', roughness: 0.6 });
    this.root.add(cyl(0.11, 0.13, 0.05, wood, 20, 0, 0, 0));
    this.root.add(cyl(0.02, 0.03, 0.12, b, 10, 0, 0.05, 0));
    // Wire basket cup.
    const cup = lathe('nest-cup', [[0.0, 0], [0.05, 0.005], [0.085, 0.035], [0.095, 0.065]], mat('nest-cup', { color: '#b9894a', metalness: 0.8, roughness: 0.4, side: THREE.DoubleSide, wireframe: false }), 14);
    cup.position.y = 0.17;
    this.root.add(cup);
    for (let i = 0; i < 3; i++) {
      const ring = torus(0.06 + i * 0.013, 0.003, b);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.18 + i * 0.016;
      this.root.add(ring);
    }
    // Crank on the side.
    this.crank = new THREE.Group();
    this.crank.position.set(0.12, 0.03, 0);
    const axle = cyl(0.008, 0.008, 0.05, b, 8);
    axle.rotation.z = Math.PI / 2;
    this.crank.add(axle);
    const arm = rbox(0.01, 0.07, 0.012, b, 0.003, 0.025, 0, 0);
    this.crank.add(arm);
    const knob = sphere(0.014, mat('nest-knob', { color: '#7a2f22', roughness: 0.5 }), 10);
    knob.position.set(0.035, 0.065, 0);
    this.crank.add(knob);
    this.root.add(this.crank);
    // Engraved firefly mark.
    const mark = plane(0.08, 0.08, basicMat('nest-mark', { map: glyph('firefly'), color: '#e8b04a', transparent: true, opacity: 0.8, depthWrite: false }));
    mark.position.set(0, 0.03, 0.131);
    this.root.add(mark);
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: '#ffd38a', transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.glow.position.y = 0.22;
    this.glow.scale.setScalar(0.35);
    this.root.add(this.glow);
    this.addHitBox(0.32, 0.32, 0.32, 0, 0, 0);
    this.range = 1.8;
  }

  attach(): void {
    this.root.updateMatrixWorld(true);
    this.anchor.set(0, 0.22, 0).applyMatrix4(this.root.matrixWorld);
  }

  prompt(ctx: GameContext): Prompt | null {
    if (!ctx.lumo.found) return { verb: 'A little brass Nest', disabled: true };
    if (ctx.lumo.anchor === this) return { verb: 'Call LUMO back', key: 'E' };
    if (ctx.lumo.energy >= 99) return { verb: 'LUMO is fully wound', disabled: true };
    return { verb: 'Wind the Nest for LUMO', key: 'E' };
  }

  interact(ctx: GameContext): void {
    if (ctx.lumo.anchor === this) {
      ctx.lumo.recall(ctx);
      return;
    }
    ctx.lumo.sendTo(ctx, this);
    ctx.noise.emit(this.anchor, 2.5, 'crank');
    this.spin = 2.2;
  }

  update(dt: number, ctx: GameContext): void {
    if (this.spin > 0 || ctx.lumo.anchor === this) {
      this.spin = Math.max(0, this.spin - dt);
      this.crank.rotation.x += dt * 8;
    }
    const m = this.glow.material as THREE.SpriteMaterial;
    m.opacity = 0.18 + Math.sin(ctx.time * 1.5) * 0.08;
  }
}

/** Something to read or look at: drawings, notes, photos. */
export class Examinable extends Interactable {
  constructor(id: string, readonly title: string, readonly body: string, readonly art = '', w = 0.3, h = 0.3, d = 0.1, verb = 'Examine') {
    super(id);
    this.addHitBox(w, h, d, 0, -h / 2, 0);
    this.verbText = verb;
    this.range = 1.8;
  }
  verbText: string;
  onRead: ((ctx: GameContext) => void) | null = null;

  prompt(): Prompt | null {
    return { verb: this.verbText, key: 'E' };
  }

  interact(ctx: GameContext): void {
    ctx.audio.play('note', { pos: this.focus() });
    ctx.ui.examine(this.title, this.body, this.art);
    ctx.flags.set(`read:${this.id}`);
    this.onRead?.(ctx);
  }
}

/** Slot in a mechanism that accepts an inventory item. */
export class Socket extends Interactable {
  installed = false;
  onInstall: ((ctx: GameContext) => void) | null = null;
  constructor(id: string, readonly item: string, readonly itemName: string, readonly emptyText: string, readonly part: THREE.Object3D) {
    super(id);
    this.root.add(part);
    part.visible = false;
    this.addHitBox(0.2, 0.2, 0.2, 0, -0.1, 0);
    this.range = 1.6;
  }

  prompt(ctx: GameContext): Prompt | null {
    if (this.installed) return null;
    if (this.focus().y > ctx.player.reachY + 0.1) return { verb: 'Too high to reach', disabled: true };
    if (!ctx.inventory.has(this.item)) return { verb: this.emptyText, disabled: true };
    return { verb: `Fit the ${this.itemName}`, key: 'E' };
  }

  interact(ctx: GameContext): void {
    this.install(ctx, false);
  }

  install(ctx: GameContext, silent: boolean): void {
    this.installed = true;
    this.part.visible = true;
    this.enabled = false;
    ctx.inventory.remove(this.item);
    ctx.flags.set(`socket:${this.id}`);
    if (!silent) ctx.audio.play('mechanism', { pos: this.focus() });
    ctx.interactions.markDirty();
    this.onInstall?.(ctx);
  }

  applyState(ctx: GameContext): void {
    if (ctx.flags.has(`socket:${this.id}`)) {
      this.installed = true;
      this.part.visible = true;
      this.enabled = false;
    }
  }
}

/** Rotating symbol dial on the music box cage. */
export class Dial extends Interactable {
  value = 0;
  private face: THREE.Mesh;
  private faceMat: THREE.MeshBasicMaterial;
  private spinner = new THREE.Group();
  private targetRot = 0;
  onChange: ((ctx: GameContext) => void) | null = null;
  locked = false;

  constructor(id: string, start = 0) {
    super(id);
    this.value = start;
    const b = brass();
    this.root.add(this.spinner);
    const disc = cyl(0.09, 0.09, 0.03, mat('dial-disc', { color: '#3b2a3f', roughness: 0.45, metalness: 0.3 }), 24);
    disc.rotation.x = Math.PI / 2;
    disc.position.set(0, 0, -0.015);
    this.spinner.add(disc);
    const rim = torus(0.09, 0.008, b);
    this.spinner.add(rim);
    for (let i = 0; i < DIAL_GLYPHS.length; i++) {
      const a = (i / DIAL_GLYPHS.length) * Math.PI * 2;
      const tick = rbox(0.008, 0.02, 0.006, b, 0.002, Math.sin(a) * 0.075, Math.cos(a) * 0.075 - 0.01, 0.002);
      this.spinner.add(tick);
    }
    this.faceMat = new THREE.MeshBasicMaterial({ map: glyph(DIAL_GLYPHS[this.value]), color: '#ffd98a', transparent: true, depthWrite: false });
    this.face = plane(0.11, 0.11, this.faceMat);
    this.face.position.z = 0.017;
    this.root.add(this.face);
    const pointer = rbox(0.016, 0.03, 0.01, b, 0.003, 0, 0.1, 0.005);
    this.root.add(pointer);
    this.addHitBox(0.22, 0.22, 0.12, 0, -0.11, 0);
    this.range = 1.5;
  }

  get glyph(): GlyphKind {
    return DIAL_GLYPHS[this.value];
  }

  prompt(ctx: GameContext): Prompt | null {
    if (this.locked) return null;
    if (this.focus().y > ctx.player.reachY + 0.1) return { verb: 'Too high to reach', disabled: true };
    return { verb: 'Turn the dial', key: 'E' };
  }

  interact(ctx: GameContext): void {
    this.set(ctx, (this.value + 1) % DIAL_GLYPHS.length);
    ctx.audio.play('dial', { pos: this.focus() });
    ctx.noise.emit(this.focus(), 1.5, 'dial');
    this.onChange?.(ctx);
  }

  set(ctx: GameContext, value: number): void {
    this.value = value;
    this.faceMat.map = glyph(DIAL_GLYPHS[value]);
    this.faceMat.needsUpdate = true;
    this.targetRot -= (Math.PI * 2) / DIAL_GLYPHS.length;
    ctx.flags.set(`dial:${this.id}`, value);
  }

  applyState(ctx: GameContext): void {
    const v = ctx.flags.get<number | undefined>(`dial:${this.id}`);
    if (typeof v === 'number') {
      this.value = v;
      this.faceMat.map = glyph(DIAL_GLYPHS[v]);
      this.faceMat.needsUpdate = true;
    }
  }

  update(dt: number): void {
    this.spinner.rotation.z += (this.targetRot - this.spinner.rotation.z) * Math.min(1, dt * 10);
  }
}

/** Simple lever/button style interaction with a custom callback. */
export class Trigger extends Interactable {
  constructor(id: string, public verb: string, private readonly action: (ctx: GameContext) => void, w = 0.3, h = 0.3, d = 0.3, public condition: ((ctx: GameContext) => Prompt | null) | null = null) {
    super(id);
    this.addHitBox(w, h, d, 0, -h / 2, 0);
  }

  prompt(ctx: GameContext): Prompt | null {
    if (this.condition) return this.condition(ctx);
    return { verb: this.verb, key: 'E' };
  }

  interact(ctx: GameContext): void {
    this.action(ctx);
  }
}
