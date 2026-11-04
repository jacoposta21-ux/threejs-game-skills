import * as THREE from 'three';
import { GeoBuilder } from '../world/GeoBuilder';
import type { Collider } from '../world/Collision';
import type { Game } from '../game/Game';
import type { AreaId, ItemId } from './types';
import { ITEM_INFO } from './types';
import type { HostKind } from '../characters/Archetypes';

const tmp = new THREE.Vector3();

export abstract class WorldObject {
  readonly group = new THREE.Group();
  range = 1.9;
  markerY = 1.6;
  /** Hidden from objective markers/prompts once finished. */
  done = false;
  constructor(
    readonly id: string,
    readonly area: AreaId,
    readonly pos: THREE.Vector3,
  ) {
    this.group.position.copy(pos);
  }
  promptE(_g: Game): string | null {
    return null;
  }
  promptF(_g: Game): string | null {
    return null;
  }
  useE(_g: Game): void {}
  useF(_g: Game): void {}
  update(_dt: number, _g: Game): void {}
  init(_g: Game): void {}
  /** Distance used for prompt selection (override for long objects). */
  distanceTo(p: THREE.Vector3): number {
    return Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
  }
}

function mesh(b: GeoBuilder, mat: THREE.Material, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(b.buildGeometry()!, mat);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------------------
export interface CrateStyle {
  w: number;
  h: number;
  d: number;
  color: string;
  kind: 'crate' | 'trunk' | 'safe' | 'anvil';
  name: string;
}

export class Crate extends WorldObject {
  readonly collider: Collider;
  state: 'rest' | 'carried' | 'flying' = 'rest';
  private flyT = 0;
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  readonly home = new THREE.Vector3();

  constructor(id: string, area: AreaId, pos: THREE.Vector3, readonly style: CrateStyle, g: Game) {
    super(id, area, pos);
    this.home.copy(pos);
    const b = new GeoBuilder();
    const { w, h, d, color } = style;
    if (style.kind === 'trunk') {
      b.block(0, 0, 0, w, h, d, color);
      b.block(0, h - 0.05, 0, w + 0.06, 0.1, d + 0.06, '#5a3a20');
      for (const sx of [-w * 0.3, w * 0.3]) b.block(sx, -0.01, 0, 0.12, h + 0.04, d + 0.04, '#5a3a20');
      b.block(0, h * 0.55, d / 2 + 0.02, 0.22, 0.24, 0.05, '#f2c14e');
      for (const s of [-1, 1]) for (const t of [-1, 1]) b.sphere((s * w) / 2, h * (t > 0 ? 0.92 : 0.08), (t * d) / 2, 0.06, '#f2c14e', 5, 4);
      // Travel stickers.
      b.block(-w * 0.15, h * 0.35, d / 2 + 0.015, 0.3, 0.22, 0.02, '#ff8fc0');
      b.block(w * 0.12, h * 0.7, d / 2 + 0.015, 0.26, 0.18, 0.02, '#9fd8ff');
    } else if (style.kind === 'safe') {
      b.block(0, 0, 0, w, h, d, color);
      b.cyl(0, h * 0.45, d / 2, 0.16, 0.16, 0.06, '#f2c14e', 10, { rx: Math.PI / 2 });
      b.block(0, h - 0.04, 0, w + 0.04, 0.08, d + 0.04, '#2a2238');
    } else {
      b.block(0, 0, 0, w, h, d, color);
      const edge = '#7d5130';
      for (const y of [0.04, h - 0.1]) b.block(0, y, 0, w + 0.04, 0.1, d + 0.04, edge);
      b.add(new THREE.BoxGeometry(0.1, Math.hypot(w, h) * 0.95, 0.04), edge, { y: h / 2, z: d / 2 + 0.01, rz: Math.atan2(w, h) });
      b.add(new THREE.BoxGeometry(0.1, Math.hypot(w, h) * 0.95, 0.04), edge, { y: h / 2, z: -d / 2 - 0.01, rz: -Math.atan2(w, h) });
      // "HEAVY" strap telegraph: red band says only a strong host can lift this.
      b.block(0, h * 0.45, 0, w + 0.05, 0.16, d + 0.05, '#e2473f');
      b.block(0, h * 0.45, d / 2 + 0.035, 0.28, 0.2, 0.02, '#ffe27a');
    }
    const m = mesh(b, g.mats.world);
    this.group.add(m);
    this.collider = g.col.addDynamic({ minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0, enabled: true, pass: 'none', tag: id });
    this.syncCollider();
    this.range = Math.max(w, d) / 2 + 1.1;
    this.markerY = h + 0.6;
  }

  init(g: Game): void {
    const s = g.progress.objects[this.id];
    if (s) {
      this.pos.set(s[0], s[1], s[2]);
      this.group.position.copy(this.pos);
      this.group.rotation.set(0, 0, 0);
      this.syncCollider();
    }
  }

  syncCollider(): void {
    const { w, h, d } = this.style;
    const c = this.collider;
    c.minX = this.pos.x - w / 2;
    c.maxX = this.pos.x + w / 2;
    c.minZ = this.pos.z - d / 2;
    c.maxZ = this.pos.z + d / 2;
    c.minY = this.pos.y;
    c.maxY = this.pos.y + h;
    c.enabled = this.state === 'rest';
  }

  promptF(g: Game): string | null {
    if (this.state !== 'rest' || g.carrying) return null;
    if (g.hostKind === 'strongman') {
      // Can't lift something with somebody standing on it.
      return `Lift ${this.style.name}`;
    }
    return null;
  }

  useF(g: Game): void {
    if (g.hostKind !== 'strongman') return;
    this.state = 'carried';
    this.syncCollider();
    g.carrying = this;
    g.audio.play('lift', { pos: this.pos });
    g.controlled.model.kick(-2.5);
    g.vfx.burst('puff', this.pos.x, this.pos.y + 0.1, this.pos.z, { count: 8, color: '#e8dcc0', speed: 2, up: 0.5 });
    g.progress.bump('lifts');
  }

  updateCarry(g: Game): void {
    const c = g.controlled;
    this.pos.set(c.pos.x, c.pos.y + c.model.height * 0.98, c.pos.z);
    this.group.position.copy(this.pos);
    this.group.rotation.y = c.yaw;
  }

  /** Try to set the object down in front of the host. */
  place(g: Game, throwIt: boolean): boolean {
    const c = g.controlled;
    const { w, h, d } = this.style;
    const reach = c.model.radius + Math.max(w, d) / 2 + (throwIt ? 1.8 : 0.35);
    const fx = Math.sin(c.yaw);
    const fz = Math.cos(c.yaw);
    for (const tryReach of [reach, reach * 0.75, c.model.radius + Math.max(w, d) / 2 + 0.15]) {
      const tx = c.pos.x + fx * tryReach;
      const tz = c.pos.z + fz * tryReach;
      // Never through walls, never back into a doorway that must stay clear.
      if (!g.col.lineOfSight(c.pos.x, c.pos.z, tx, tz, c.pos.y + 0.6) || !g.col.lineOfSight(c.pos.x, c.pos.z, tx, tz, c.pos.y + 1.6)) continue;
      if (g.noDropZones.some(([x0, x1, z0, z1]) => tx + w / 2 > x0 && tx - w / 2 < x1 && tz + d / 2 > z0 && tz - d / 2 < z1)) continue;
      const gy = g.col.groundHeight(tx, tz, Math.min(w, d) / 2, c.pos.y + 1.6, 0.01, { radius: 0.3, height: 1, small: false, phasing: false, ignore: this.collider });
      const r = Math.min(w, d) * 0.45;
      const blocked = g.col.overlapsSolid(tx, gy + 0.02, tz, { radius: r, height: h - 0.05, small: false, phasing: false, ignore: this.collider });
      if (blocked) continue;
      // Don't drop it on anyone's head.
      let onChar = false;
      for (const ch of g.characters) {
        if (ch === c || !ch.active) continue;
        if (Math.abs(ch.pos.x - tx) < w / 2 + ch.model.radius && Math.abs(ch.pos.z - tz) < d / 2 + ch.model.radius) onChar = true;
      }
      if (onChar) continue;
      this.from.copy(this.pos);
      this.to.set(tx, gy, tz);
      this.state = 'flying';
      this.flyT = 0;
      g.carrying = null;
      g.audio.play(throwIt ? 'throw' : 'lift', { pos: this.pos, pitch: 0.8 });
      if (throwIt) g.progress.bump('throws');
      return true;
    }
    return false;
  }

  resetHome(g: Game): void {
    this.pos.copy(this.home);
    this.group.position.copy(this.home);
    this.group.rotation.set(0, 0, 0);
    this.state = 'rest';
    this.syncCollider();
    delete g.progress.objects[this.id];
  }

  /** Called when the host is exited or ejected while carrying. */
  drop(g: Game): void {
    if (!this.place(g, false)) {
      // Fall straight down where we stand; nudge backwards.
      const c = g.controlled;
      this.from.copy(this.pos);
      this.to.set(c.pos.x - Math.sin(c.yaw) * 1.2, 0, c.pos.z - Math.cos(c.yaw) * 1.2);
      this.to.y = g.col.groundHeight(this.to.x, this.to.z, 0.4, 3, 0.01, { radius: 0.3, height: 1, small: false, phasing: false, ignore: this.collider });
      this.state = 'flying';
      this.flyT = 0;
      g.carrying = null;
    }
  }

  update(dt: number, g: Game): void {
    if (this.state !== 'flying') return;
    this.flyT += dt / 0.38;
    const t = Math.min(1, this.flyT);
    this.pos.lerpVectors(this.from, this.to, t);
    this.pos.y += Math.sin(t * Math.PI) * 0.9;
    this.group.position.copy(this.pos);
    if (t >= 1) {
      this.state = 'rest';
      this.pos.copy(this.to);
      this.group.position.copy(this.pos);
      this.syncCollider();
      g.audio.play('thud', { pos: this.pos });
      g.shake(0.25);
      g.vfx.burst('puff', this.pos.x, this.pos.y + 0.1, this.pos.z, { count: 14, color: ['#e8dcc0', '#d0c4a8'], speed: 3.5, up: 0.6, size: 0.5 });
      g.progress.objects[this.id] = [this.pos.x, this.pos.y, this.pos.z];
      g.progress.dirty = true;
      // Characters standing in the landing spot get bumped out.
      for (const ch of g.characters) {
        if (!ch.active) continue;
        if (g.col.overlapsSolid(ch.pos.x, ch.pos.y, ch.pos.z, ch.mover)) {
          ch.pos.x += (ch.pos.x - this.pos.x) * 0.6;
          ch.pos.z += (ch.pos.z - this.pos.z) * 0.6;
        }
      }
    }
  }

  isInside(minX: number, maxX: number, minZ: number, maxZ: number): boolean {
    return this.state === 'rest' && this.pos.x >= minX && this.pos.x <= maxX && this.pos.z >= minZ && this.pos.z <= maxZ;
  }
}

// ---------------------------------------------------------------------------
/** Painted pad on the ground: active while a heavy object sits on it. */
export class Plate extends WorldObject {
  private readonly glow: THREE.Mesh;
  active = false;
  constructor(id: string, area: AreaId, pos: THREE.Vector3, readonly w: number, readonly d: number, readonly flag: string, g: Game) {
    super(id, area, pos);
    const b = new GeoBuilder();
    const dash = 0.35;
    for (let x = -w / 2; x < w / 2; x += dash * 2) {
      b.box(x + dash / 2, 0.025, -d / 2, dash, 0.03, 0.08, '#ffe27a');
      b.box(x + dash / 2, 0.025, d / 2, dash, 0.03, 0.08, '#ffe27a');
    }
    for (let z = -d / 2; z < d / 2; z += dash * 2) {
      b.box(-w / 2, 0.025, z + dash / 2, 0.08, 0.03, dash, '#ffe27a');
      b.box(w / 2, 0.025, z + dash / 2, 0.08, 0.03, dash, '#ffe27a');
    }
    // Arrow glyph pointing down: "put it here".
    b.add(new THREE.ConeGeometry(0.25, 0.4, 3), '#ffe27a', { y: 0.03, rx: -Math.PI / 2, sz: 0.1 });
    const m = new THREE.Mesh(b.buildGeometry()!, g.mats.glow);
    this.group.add(m);
    const gm = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: '#ffe27a', transparent: true, opacity: 0.18, depthWrite: false }));
    gm.rotation.x = -Math.PI / 2;
    gm.position.y = 0.03;
    this.glow = gm;
    this.group.add(gm);
    this.markerY = 1.2;
    this.range = 0;
  }
  /** Optional exact spot a crate is nudged to when it lands on the pad (e.g. flush against a ledge). */
  snap: [number, number] | null = null;

  update(_dt: number, g: Game): void {
    let on = false;
    for (const c of g.crates) {
      if (c.style.kind !== 'crate' || !c.isInside(this.pos.x - this.w / 2, this.pos.x + this.w / 2, this.pos.z - this.d / 2, this.pos.z + this.d / 2)) continue;
      on = true;
      if (this.snap && (Math.abs(c.pos.x - this.snap[0]) > 0.01 || Math.abs(c.pos.z - this.snap[1]) > 0.01)) {
        c.pos.x = this.snap[0];
        c.pos.z = this.snap[1];
        c.group.position.copy(c.pos);
        c.group.rotation.set(0, 0, 0);
        c.syncCollider();
        g.progress.objects[c.id] = [c.pos.x, c.pos.y, c.pos.z];
        g.progress.dirty = true;
      }
    }
    if (on !== this.active) {
      this.active = on;
      if (on) {
        g.audio.play('plate', { pos: this.pos });
        g.vfx.burst('star', this.pos.x, 0.3, this.pos.z, { count: 10, color: '#ffe27a', speed: 2.5, up: 2 });
      }
      g.setFlag(this.flag, on);
    }
    const mat = this.glow.material as THREE.MeshBasicMaterial;
    mat.opacity = on ? 0.5 : 0.14 + Math.sin(g.time * 4) * 0.06;
    mat.color.set(on ? '#7fffb0' : '#ffe27a');
    this.done = on;
  }
}

// ---------------------------------------------------------------------------
export type Lock =
  | { type: 'flag'; test: (g: Game) => boolean; hint: string }
  | { type: 'item'; item: ItemId; consume?: boolean; hint: string }
  | { type: 'pick'; hint: string }
  | { type: 'decree'; hint: string }
  | { type: 'none' };

export type DoorStyle = 'gate' | 'slide' | 'rope' | 'vault' | 'shutter' | 'flap' | 'turnstile' | 'power' | 'decree';

export class Door extends WorldObject {
  readonly collider: Collider;
  open = false;
  private openT = 0;
  private readonly panel = new THREE.Group();
  private readonly lockMark = new THREE.Group();

  constructor(
    id: string,
    area: AreaId,
    pos: THREE.Vector3,
    readonly w: number,
    readonly h: number,
    /** 'x' = door spans along X (wall runs east-west). */
    readonly axis: 'x' | 'z',
    readonly lock: Lock,
    readonly style: DoorStyle,
    readonly label: string,
    g: Game,
    /** A point on the inside: hosts there may open it with E. */
    readonly inside?: [number, number],
  ) {
    super(id, area, pos);
    const t = style === 'vault' ? 0.6 : 0.5;
    const sx = axis === 'x' ? w : t;
    const sz = axis === 'x' ? t : w;
    this.collider = g.col.addDynamic({
      minX: pos.x - sx / 2,
      maxX: pos.x + sx / 2,
      minY: 0,
      maxY: h,
      minZ: pos.z - sz / 2,
      maxZ: pos.z + sz / 2,
      enabled: true,
      pass: 'none',
      tag: id,
      camera: false,
    });
    const b = new GeoBuilder();
    const ry = axis === 'x' ? 0 : Math.PI / 2;
    b.push({ ry });
    switch (style) {
      case 'gate':
        // Wrought-iron town gate with area color banner.
        for (let x = -w / 2 + 0.15; x <= w / 2 - 0.1; x += 0.35) b.block(x, 0, 0, 0.07, h, 0.07, '#2a2238');
        b.block(0, h * 0.15, 0, w, 0.12, 0.1, '#2a2238');
        b.block(0, h * 0.85, 0, w, 0.12, 0.1, '#2a2238');
        for (let x = -w / 2 + 0.15; x <= w / 2 - 0.1; x += 0.35) b.cone(x, h, 0, 0.07, 0.22, '#f2c14e', 4);
        break;
      case 'turnstile':
        for (let x = -w / 2 + 0.6; x < w / 2; x += 1.4) {
          b.block(x, 0, 0, 0.5, 1.0, 0.8, '#d0d0d8');
          b.block(x + 0.6, 0.85, 0, 0.8, 0.06, 0.06, '#e2473f');
          b.block(x, 1.0, 0, 0.5, 0.06, 0.8, '#2a2238');
        }
        b.block(0, 0, 0, w, 1.05, 0.08, '#e2473f');
        break;
      case 'rope':
        for (const s of [-1, 1]) {
          b.cyl((s * w) / 2, 0, 0, 0.1, 0.14, 1.0, '#f2c14e', 8);
          b.sphere((s * w) / 2, 1.05, 0, 0.1, '#f2c14e', 8, 6);
        }
        b.add(new THREE.TorusGeometry(w / 2, 0.05, 5, 12, Math.PI), '#c8243a', { y: 0.95, rz: Math.PI, sy: 0.35 });
        break;
      case 'vault':
      case 'decree':
        b.cyl(0, h / 2, 0, h * 0.48, h * 0.48, 0.5, style === 'decree' ? '#d8a830' : '#8a8fa8', 18, { rx: Math.PI / 2, y: 0 });
        b.cyl(0, h / 2, 0.26, h * 0.3, h * 0.3, 0.06, '#5a5f78', 14, { rx: Math.PI / 2, y: 0 });
        for (let i = 0; i < 6; i += 1) {
          const a = (i / 6) * Math.PI * 2;
          b.block(Math.cos(a) * h * 0.18, h / 2 + Math.sin(a) * h * 0.18 - 0.05, 0.32, 0.08, 0.1, 0.08, '#d0d0d8');
        }
        b.block(0, 0, 0, w, 0.2, 0.55, '#5a5f78');
        break;
      case 'flap':
        b.block(-w / 4, 0, 0, w / 2, h, 0.08, '#c8243a');
        b.block(w / 4, 0, 0, w / 2, h, 0.08, '#fbf7ee');
        break;
      case 'shutter':
        for (let y = 0; y < h; y += 0.25) b.block(0, y, 0, w, 0.22, 0.12, y % 0.5 < 0.2 ? '#c0c4d0' : '#a8acb8');
        break;
      case 'power':
        b.block(-w / 4, 0, 0, w / 2 - 0.04, h, 0.12, '#7a8aa8');
        b.block(w / 4, 0, 0, w / 2 - 0.04, h, 0.12, '#7a8aa8');
        b.block(-w / 4, h * 0.45, 0.07, w / 2 - 0.3, 0.15, 0.02, '#ffe27a');
        b.block(w / 4, h * 0.45, 0.07, w / 2 - 0.3, 0.15, 0.02, '#ffe27a');
        break;
      default:
        b.block(0, 0, 0, w, h, 0.12, '#b07a48');
        b.block(0, h - 0.15, 0, w + 0.1, 0.15, 0.16, '#7d5130');
        b.sphere(w * 0.35, h * 0.48, 0.1, 0.07, '#f2c14e', 6, 5);
        break;
    }
    b.pop();
    this.panel.add(mesh(b, style === 'vault' || style === 'decree' ? g.mats.metal : g.mats.world));
    this.group.add(this.panel);
    // Lock telegraph: padlock (pick), keycard slot (item), seal (decree).
    if (lock.type !== 'none' && lock.type !== 'flag') {
      const lb = new GeoBuilder();
      const color = lock.type === 'pick' ? '#f2c14e' : lock.type === 'decree' ? '#e2473f' : '#4a8fe0';
      lb.block(0, 0, 0, 0.32, 0.26, 0.12, color);
      if (lock.type === 'pick') lb.add(new THREE.TorusGeometry(0.11, 0.035, 4, 10, Math.PI), '#c0c4d0', { y: 0.26 });
      else lb.block(0, 0.08, 0.07, 0.18, 0.04, 0.02, '#1a1426');
      const lm = new THREE.Mesh(lb.buildGeometry()!, g.mats.glow);
      this.lockMark.add(lm);
      this.lockMark.position.set(0, Math.min(1.3, h * 0.55), 0);
      this.lockMark.rotation.y = ry;
      const off = 0.22;
      if (axis === 'x') this.lockMark.position.z = off;
      else this.lockMark.position.x = off;
      this.group.add(this.lockMark);
      const back = this.lockMark.clone();
      if (axis === 'x') back.position.z = -off;
      else back.position.x = -off;
      this.group.add(back);
    }
    this.range = w / 2 + 1.4;
    this.markerY = Math.min(h, 2.4) + 0.4;
  }

  get flagName(): string {
    return `door:${this.id}`;
  }

  init(g: Game): void {
    if (g.progress.flag(this.flagName)) this.setOpen(g, true, true);
  }

  distanceTo(p: THREE.Vector3): number {
    // Distance to the door segment, not its centre.
    if (this.axis === 'x') {
      const dx = Math.max(0, Math.abs(p.x - this.pos.x) - this.w / 2);
      return Math.hypot(dx, p.z - this.pos.z);
    }
    const dz = Math.max(0, Math.abs(p.z - this.pos.z) - this.w / 2);
    return Math.hypot(p.x - this.pos.x, dz);
  }

  private isInsideChar(g: Game): boolean {
    if (!this.inside) return false;
    const c = g.controlled.pos;
    if (this.axis === 'x') return (c.z - this.pos.z) * Math.sign(this.inside[1] - this.pos.z) > 0.45;
    return (c.x - this.pos.x) * Math.sign(this.inside[0] - this.pos.x) > 0.45;
  }

  promptE(g: Game): string | null {
    if (this.open) return null;
    if (this.isInsideChar(g)) return `Open ${this.label}`;
    const l = this.lock;
    if (l.type === 'item') {
      if (g.hasItem(l.item)) return `Use ${ITEM_INFO[l.item].name}`;
      return `${this.label}: locked`;
    }
    if (l.type === 'pick' || l.type === 'decree') return `${this.label}: locked`;
    if (l.type === 'flag') return null;
    return `Open ${this.label}`;
  }

  useE(g: Game): void {
    if (this.open) return;
    if (this.isInsideChar(g)) {
      this.unlock(g);
      return;
    }
    const l = this.lock;
    if (l.type === 'item' && g.hasItem(l.item)) {
      if (l.consume) g.takeItem(l.item);
      this.unlock(g);
      return;
    }
    if (l.type === 'none') {
      this.unlock(g);
      return;
    }
    g.audio.play('denied', { pos: this.pos });
    if (l.type !== 'flag') g.hint(l.hint);
  }

  promptF(g: Game): string | null {
    if (this.open) return null;
    if (this.lock.type === 'pick' && g.hostKind === 'thief') return `Pick lock`;
    if (this.lock.type === 'decree' && g.hostKind === 'mayor') return `Decree: OPEN!`;
    return null;
  }

  useF(g: Game): void {
    if (this.open) return;
    if (this.lock.type === 'pick' && g.hostKind === 'thief') {
      g.beginAction(1.5, 'Picking lock…', 'pick', () => {
        g.audio.play('unlock', { pos: this.pos });
        this.unlock(g);
      }, true);
    } else if (this.lock.type === 'decree' && g.hostKind === 'mayor') {
      g.proclaim();
      this.unlock(g);
    }
  }

  unlock(g: Game): void {
    if (this.open) return;
    this.setOpen(g, true, false);
    g.setFlag(this.flagName);
  }

  setOpen(g: Game, open: boolean, instant: boolean): void {
    this.open = open;
    this.collider.enabled = !open;
    this.done = open;
    if (instant) this.openT = open ? 1 : 0;
    else {
      g.audio.play(this.style === 'gate' || this.style === 'turnstile' ? 'gate' : 'door', { pos: this.pos });
      g.vfx.burst('star', this.pos.x, 1.2, this.pos.z, { count: 12, color: ['#ffe27a', '#ffffff'], speed: 3, up: 2 });
    }
  }

  update(dt: number, g: Game): void {
    if (!this.open && this.lock.type === 'flag' && this.lock.test(g)) this.unlock(g);
    const target = this.open ? 1 : 0;
    this.openT += (target - this.openT) * (1 - Math.exp(-5 * dt));
    const t = this.openT;
    switch (this.style) {
      case 'rope':
        this.panel.position.y = -t * 1.2;
        this.panel.visible = t < 0.98;
        break;
      case 'flap':
        this.panel.scale.set(1 - t * 0.85, 1, 1);
        if (this.axis === 'z') this.panel.scale.set(1, 1, 1 - t * 0.85);
        break;
      case 'vault':
      case 'decree':
        this.panel.rotation.y = t * 1.6;
        break;
      case 'power':
      case 'slide':
        this.panel.position.y = t * (this.h - 0.1);
        break;
      default:
        this.panel.position.y = -t * (this.h + 0.2);
        this.panel.visible = t < 0.98;
        break;
    }
    this.lockMark.visible = !this.open;
    for (const c of this.group.children) if (c !== this.panel && c !== this.lockMark) c.visible = !this.open;
  }
}

// ---------------------------------------------------------------------------
/** Spectral bars / glass cases: solid to everyone except a phasing ghost. */
export class Phaseable extends WorldObject {
  private readonly glow: THREE.Mesh;
  constructor(id: string, area: AreaId, pos: THREE.Vector3, readonly w: number, readonly h: number, readonly d: number, readonly kind: 'bars' | 'case', g: Game) {
    super(id, area, pos);
    g.col.addStatic({ minX: pos.x - w / 2, maxX: pos.x + w / 2, minY: 0, maxY: h, minZ: pos.z - d / 2, maxZ: pos.z + d / 2, enabled: true, pass: 'ghost' });
    if (kind === 'bars') {
      const b = new GeoBuilder();
      const along = w > d;
      const len = along ? w : d;
      for (let s = -len / 2 + 0.2; s <= len / 2 - 0.1; s += 0.3) b.block(along ? s : 0, 0, along ? 0 : s, 0.07, h, 0.07, '#5a6080');
      b.block(0, h - 0.12, 0, along ? len : 0.14, 0.12, along ? 0.14 : len, '#5a6080');
      b.block(0, 0, 0, along ? len : 0.16, 0.12, along ? 0.16 : len, '#5a6080');
      this.group.add(mesh(b, g.mats.metal));
      this.glow = new THREE.Mesh(new THREE.BoxGeometry(along ? len : 0.04, h, along ? 0.04 : len), g.mats.spectral);
      this.glow.position.y = h / 2;
    } else {
      const b = new GeoBuilder();
      b.block(0, 0, 0, w + 0.2, 0.9, d + 0.2, '#3a3348');
      b.block(0, 0.9, 0, w + 0.3, 0.08, d + 0.3, '#f2c14e');
      b.block(0, h - 0.06, 0, w + 0.1, 0.06, d + 0.1, '#f2c14e');
      this.group.add(mesh(b, g.mats.metal));
      this.glow = new THREE.Mesh(new THREE.BoxGeometry(w, h - 0.95, d), g.mats.glass);
      this.glow.position.y = 0.95 + (h - 0.95) / 2;
    }
    this.group.add(this.glow);
    this.range = 0;
  }
  update(_dt: number, g: Game): void {
    if (this.kind === 'bars') {
      const near = g.hostKind === 'ghost' && this.distanceTo(g.controlled.pos) < 4;
      const m = this.glow.material as THREE.MeshBasicMaterial;
      m.opacity = near ? 0.35 + Math.sin(g.time * 6) * 0.15 : 0.12 + Math.sin(g.time * 2) * 0.05;
    }
  }
  distanceTo(p: THREE.Vector3): number {
    const dx = Math.max(0, Math.abs(p.x - this.pos.x) - this.w / 2);
    const dz = Math.max(0, Math.abs(p.z - this.pos.z) - this.d / 2);
    return Math.hypot(dx, dz);
  }
}

// ---------------------------------------------------------------------------
/** A wall opening only Glim is small enough for. */
export class Vent extends WorldObject {
  constructor(id: string, area: AreaId, pos: THREE.Vector3, readonly axis: 'x' | 'z', g: Game) {
    super(id, area, pos);
    const w = 0.9;
    const h = 0.75;
    g.col.addStatic({
      minX: pos.x - (axis === 'x' ? w / 2 : 0.3),
      maxX: pos.x + (axis === 'x' ? w / 2 : 0.3),
      minY: 0,
      maxY: h,
      minZ: pos.z - (axis === 'x' ? 0.3 : w / 2),
      maxZ: pos.z + (axis === 'x' ? 0.3 : w / 2),
      enabled: true,
      pass: 'small',
    });
    const b = new GeoBuilder();
    b.push({ ry: axis === 'x' ? 0 : Math.PI / 2 });
    b.block(0, h, 0, w + 0.2, 0.1, 0.62, '#8a8fa8');
    for (const s of [-1, 1]) b.block((s * (w + 0.1)) / 2, 0, 0, 0.1, h + 0.1, 0.62, '#8a8fa8');
    for (let y = 0.15; y < h; y += 0.17) for (const z of [-0.28, 0.28]) b.block(0, y, z, w, 0.04, 0.04, '#5a5f78');
    b.pop();
    this.group.add(mesh(b, g.mats.metal));
    this.range = 0;
    this.markerY = 1.1;
  }
}

// ---------------------------------------------------------------------------
export interface MachineOpts {
  flag: string;
  label: string;
  look: 'generator' | 'panel' | 'stamp' | 'motor';
  needs?: { flag: string; msg: string };
  extraE?: { label: string; test: (g: Game) => boolean; run: (g: Game) => void };
  onPowered?: (g: Game) => void;
}

export class Machine extends WorldObject {
  private readonly light: THREE.Mesh;
  private readonly spinner = new THREE.Group();
  constructor(id: string, area: AreaId, pos: THREE.Vector3, ry: number, readonly opts: MachineOpts, g: Game) {
    super(id, area, pos);
    const b = new GeoBuilder();
    if (opts.look === 'generator') {
      b.block(0, 0, 0, 1.6, 1.3, 1.1, '#5a6a8a');
      b.block(0, 1.3, 0, 1.7, 0.1, 1.2, '#2a2238');
      for (let i = 0; i < 5; i += 1) b.block(-0.6 + i * 0.3, 0.3, 0.56, 0.12, 0.7, 0.04, '#3a4560');
      b.cyl(0.55, 1.4, -0.2, 0.08, 0.08, 0.7, '#8a8fa8', 6);
      b.block(-0.3, 0.9, 0.58, 0.5, 0.3, 0.04, '#ffe27a');
    } else if (opts.look === 'panel') {
      b.block(0, 0, 0, 1.3, 1.9, 0.5, '#4a5470');
      b.block(0, 1.2, 0.26, 1.0, 0.55, 0.03, '#1a2a3a');
      for (let i = 0; i < 6; i += 1) b.block(-0.4 + (i % 3) * 0.4, 0.6 + Math.floor(i / 3) * 0.25, 0.27, 0.16, 0.12, 0.03, ['#e2473f', '#ffe27a', '#4fb06a'][i % 3]);
    } else if (opts.look === 'stamp') {
      b.block(0, 0, 0, 1.2, 0.9, 0.9, '#7d4fc9');
      b.block(0, 0.9, -0.15, 0.9, 0.9, 0.5, '#5a3a9a');
      b.cyl(0, 1.0, 0.2, 0.08, 0.08, 0.5, '#d0d0d8', 6);
      b.block(0, 0.92, 0.25, 0.5, 0.06, 0.4, '#ffffff');
      b.block(0, 1.6, 0.12, 0.6, 0.18, 0.04, '#ffe27a');
    } else {
      b.block(0, 0, 0, 1.4, 1.0, 1.4, '#8a5a3c');
      b.cyl(0, 1.0, 0, 0.5, 0.5, 0.25, '#c87c3c', 10);
    }
    this.group.add(mesh(b, g.mats.world));
    const sb = new GeoBuilder();
    for (let i = 0; i < 6; i += 1) sb.box(Math.cos((i / 6) * Math.PI * 2) * 0.3, 0, Math.sin((i / 6) * Math.PI * 2) * 0.3, 0.12, 0.12, 0.12, '#f2c14e');
    sb.cyl(0, -0.06, 0, 0.18, 0.18, 0.12, '#c0c4d0', 8);
    const sm = mesh(sb, g.mats.metal);
    this.spinner.add(sm);
    this.spinner.position.set(opts.look === 'generator' ? -0.3 : 0, opts.look === 'generator' ? 1.55 : opts.look === 'motor' ? 1.3 : 2.05, 0);
    this.group.add(this.spinner);
    this.light = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff3355', toneMapped: false }));
    this.light.position.set(0.5, opts.look === 'panel' ? 1.95 : 1.5, 0.3);
    this.group.add(this.light);
    // Lightning plate telegraph: "the scientist can power this".
    const bolt = new THREE.Mesh(new THREE.CircleGeometry(0.2, 6), new THREE.MeshBasicMaterial({ color: '#7fd4ff', toneMapped: false }));
    bolt.position.set(-0.45, opts.look === 'panel' ? 1.75 : 1.0, opts.look === 'panel' ? 0.27 : 0.58);
    this.group.add(bolt);
    this.group.rotation.y = ry;
    this.markerY = 2.4;
  }
  get powered(): boolean {
    return this.done;
  }
  init(g: Game): void {
    this.done = g.progress.flag(this.opts.flag);
  }
  promptF(g: Game): string | null {
    if (g.hostKind !== 'scientist' || this.done) return null;
    if (this.opts.needs && !g.progress.flag(this.opts.needs.flag)) return `${this.opts.label}: no power`;
    return `Zap ${this.opts.label}`;
  }
  useF(g: Game): void {
    if (g.hostKind !== 'scientist' || this.done) return;
    if (this.opts.needs && !g.progress.flag(this.opts.needs.flag)) {
      g.hint(this.opts.needs.msg);
      g.audio.play('denied', { pos: this.pos });
      return;
    }
    g.beginAction(1.0, 'Zapping…', 'zap', () => {
      this.done = true;
      g.setFlag(this.opts.flag);
      g.audio.play('machineOn', { pos: this.pos });
      g.vfx.burst('bolt', this.pos.x, this.pos.y + 1.5, this.pos.z, { count: 10, color: ['#9fe8ff', '#ffffff', '#ffe27a'], speed: 4, up: 3 });
      g.shake(0.2);
      this.opts.onPowered?.(g);
    });
  }
  promptE(g: Game): string | null {
    const x = this.opts.extraE;
    if (x && x.test(g)) return x.label;
    return null;
  }
  useE(g: Game): void {
    const x = this.opts.extraE;
    if (x && x.test(g)) x.run(g);
  }
  update(dt: number, g: Game): void {
    const m = this.light.material as THREE.MeshBasicMaterial;
    m.color.set(this.done ? '#55ff99' : Math.sin(g.time * 5) > 0 ? '#ff3355' : '#661122');
    if (this.done) this.spinner.rotation.y += dt * 5;
  }
}

// ---------------------------------------------------------------------------
export class Stove extends WorldObject {
  private readonly steam = { t: 0 };
  constructor(id: string, area: AreaId, pos: THREE.Vector3, ry: number, readonly recipe: ItemId, readonly look: 'grill' | 'oven' | 'cart', g: Game) {
    super(id, area, pos);
    const b = new GeoBuilder();
    if (look === 'cart') {
      b.block(0, 0, 0, 1.4, 1.0, 0.9, '#ff8fc0');
      b.block(0, 1.0, 0, 1.5, 0.08, 1.0, '#ffffff');
      b.cyl(0, 1.08, 0, 0.42, 0.3, 0.4, '#d0d0d8', 12);
      for (const s of [-1, 1]) b.cyl(s * 0.55, 0, 0.45, 0.18, 0.18, 0.08, '#2a2238', 10, { rx: Math.PI / 2, y: 0.2 });
      b.cyl(-0.6, 1.0, -0.4, 0.03, 0.03, 1.4, '#ffffff', 5);
      b.cone(-0.6, 2.3, -0.4, 0.8, 0.4, '#ff6fb5', 8);
    } else {
      b.block(0, 0, 0, 1.6, 0.95, 0.9, '#d0d0d8');
      b.block(0, 0.95, 0, 1.7, 0.07, 1.0, '#2a2238');
      for (const s of [-1, 1]) b.cyl(s * 0.4, 1.02, 0, 0.25, 0.25, 0.03, '#e2473f', 10);
      b.block(0, 0.25, 0.46, 1.2, 0.5, 0.03, '#8a8fa8');
      b.cyl(0.4, 1.05, 0, 0.3, 0.26, 0.12, '#3a3348', 10);
      b.add(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 5), '#3a3348', { x: 0.85, y: 1.12, rz: Math.PI / 2 });
      b.block(0, 1.6, -0.45, 1.6, 1.2, 0.1, '#f4efe6');
      // Hanging utensils.
      for (let i = 0; i < 4; i += 1) b.block(-0.55 + i * 0.36, 1.75, -0.38, 0.06, 0.4, 0.03, '#8a8fa8');
    }
    this.group.add(mesh(b, g.mats.world));
    this.group.rotation.y = ry;
    g.col.box(pos.x, 0, pos.z, look === 'cart' ? 1.4 : 1.6, 1.0, look === 'cart' ? 0.9 : 0.9);
    this.range = 2.0;
    this.markerY = 1.9;
  }
  promptF(g: Game): string | null {
    if (g.hostKind !== 'chef') return null;
    if (g.hasItem(this.recipe)) return null;
    return `Cook ${ITEM_INFO[this.recipe].name}`;
  }
  useF(g: Game): void {
    if (g.hostKind !== 'chef' || g.hasItem(this.recipe)) return;
    g.audio.play('sizzle', { pos: this.pos });
    g.beginAction(2.2, `Cooking ${ITEM_INFO[this.recipe].name}…`, 'cook', () => {
      g.giveItem(this.recipe);
      g.audio.play('serve', { pos: this.pos });
      g.vfx.burst('heart', this.pos.x, 1.6, this.pos.z, { count: 6, color: '#ff6fb5', speed: 1.5, up: 2 });
      g.progress.bump('dishes');
    });
  }
  update(dt: number, g: Game): void {
    this.steam.t -= dt;
    if (this.steam.t <= 0 && g.near(this.pos, 18)) {
      this.steam.t = g.actionPose === 'cook' && g.near(this.pos, 3) ? 0.05 : 0.5;
      g.vfx.spawn('puff', this.pos.x + (g.rng() - 0.5) * 0.6, this.pos.y + 1.2, this.pos.z + (g.rng() - 0.5) * 0.4, 0, 0.8, 0, '#ffffff', 0.35, 1.4, -0.2, 0.3, 0.5);
    }
  }
}

// ---------------------------------------------------------------------------
export class Lever extends WorldObject {
  private readonly handle = new THREE.Group();
  constructor(id: string, area: AreaId, pos: THREE.Vector3, ry: number, readonly flag: string, readonly label: string, g: Game) {
    super(id, area, pos);
    const b = new GeoBuilder();
    b.block(0, 0, 0, 0.7, 1.0, 0.4, '#5a5f78');
    b.block(0, 1.0, 0, 0.8, 0.08, 0.5, '#2a2238');
    this.group.add(mesh(b, g.mats.metal));
    const hb = new GeoBuilder();
    hb.cyl(0, 0, 0, 0.04, 0.04, 0.7, '#d0d0d8', 6);
    hb.sphere(0, 0.72, 0, 0.1, '#e2473f', 8, 6);
    this.handle.add(mesh(hb, g.mats.world));
    this.handle.position.set(0, 1.0, 0);
    this.handle.rotation.x = -0.7;
    this.group.add(this.handle);
    this.group.rotation.y = ry;
    this.markerY = 2.0;
  }
  init(g: Game): void {
    this.done = g.progress.flag(this.flag);
    if (this.done) this.handle.rotation.x = 0.7;
  }
  promptE(): string | null {
    return this.done ? null : `Pull ${this.label}`;
  }
  useE(g: Game): void {
    if (this.done) return;
    this.done = true;
    g.setFlag(this.flag);
    g.audio.play('lever', { pos: this.pos });
    g.shake(0.15);
  }
  update(dt: number): void {
    const t = this.done ? 0.7 : -0.7;
    this.handle.rotation.x += (t - this.handle.rotation.x) * (1 - Math.exp(-8 * dt));
  }
}

// ---------------------------------------------------------------------------
export function itemMesh(item: ItemId, g: Game): THREE.Mesh {
  const b = new GeoBuilder();
  switch (item) {
    case 'mic':
      b.add(new THREE.CylinderGeometry(0.06, 0.04, 0.4, 8), '#2a2238', { y: -0.1 });
      b.sphere(0, 0.15, 0, 0.12, '#ffe27a', 10, 8);
      break;
    case 'fuse':
      b.add(new THREE.CylinderGeometry(0.12, 0.12, 0.4, 10), '#e2473f', { rz: 0.4 });
      b.add(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 4), '#f2c14e', { x: 0.12, y: 0.25, rz: -0.5 });
      break;
    case 'keycard':
      b.box(0, 0, 0, 0.45, 0.3, 0.03, '#4a8fe0');
      b.box(0, 0.08, 0.02, 0.4, 0.06, 0.01, '#ffe27a');
      break;
    case 'permit':
      b.box(0, 0, 0, 0.36, 0.48, 0.02, '#f4efe6');
      b.cyl(0.08, -0.1, 0.012, 0.07, 0.07, 0.01, '#e2473f', 10, { rx: Math.PI / 2 });
      break;
    default:
      b.box(0, 0, 0, 0.3, 0.3, 0.3, '#ff8fc0');
  }
  return mesh(b, g.mats.world);
}

export class ItemPickup extends WorldObject {
  private readonly m: THREE.Mesh;
  constructor(id: string, area: AreaId, pos: THREE.Vector3, readonly item: ItemId, g: Game, readonly onTake?: (g: Game) => void) {
    super(id, area, pos);
    this.m = itemMesh(item, g);
    this.group.add(this.m);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.45, 20), new THREE.MeshBasicMaterial({ color: '#ffe27a', transparent: true, opacity: 0.7, toneMapped: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -pos.y + 0.04;
    this.group.add(ring);
    this.markerY = 0.9;
  }
  init(g: Game): void {
    if (g.progress.flag(`got:${this.id}`)) {
      this.done = true;
      this.group.visible = false;
    }
  }
  promptE(): string | null {
    return this.done ? null : `Take ${ITEM_INFO[this.item].name}`;
  }
  useE(g: Game): void {
    if (this.done) return;
    this.done = true;
    this.group.visible = false;
    g.setFlag(`got:${this.id}`);
    g.giveItem(this.item);
    g.vfx.burst('star', this.pos.x, this.pos.y, this.pos.z, { count: 16, color: ['#ffe27a', '#ffffff'], speed: 3, up: 2 });
    this.onTake?.(g);
  }
  update(dt: number, g: Game): void {
    if (this.done) return;
    this.m.rotation.y += dt * 2;
    this.m.position.y = Math.sin(g.time * 3) * 0.08;
  }
}

// ---------------------------------------------------------------------------
export class CorePickup extends WorldObject {
  private readonly crystal: THREE.Mesh;
  private readonly beam: THREE.Mesh;
  constructor(area: AreaId, pos: THREE.Vector3, g: Game, readonly requires?: HostKind[]) {
    super(`core-${area}`, area, pos);
    const b = new GeoBuilder();
    b.add(new THREE.OctahedronGeometry(0.42, 0), '#ffe27a', { sy: 1.35 });
    b.add(new THREE.OctahedronGeometry(0.26, 0), '#ff8fc0', { sy: 1.2, ry: 0.4 });
    this.crystal = new THREE.Mesh(b.buildGeometry()!, g.mats.glow);
    this.group.add(this.crystal);
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.62, 24), new THREE.MeshBasicMaterial({ color: '#fff4b0', transparent: true, opacity: 0.8, toneMapped: false, side: THREE.DoubleSide }));
    this.crystal.add(halo);
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.6, 14, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: '#fff0a0', transparent: true, opacity: 0.18, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
    );
    this.beam.position.y = 7;
    this.group.add(this.beam);
    this.range = 1.6;
    this.markerY = 1.2;
  }
  get flagName(): string {
    return `core:${this.area}`;
  }
  init(g: Game): void {
    if (g.progress.flag(this.flagName)) {
      this.done = true;
      this.group.visible = false;
    }
  }
  promptE(g: Game): string | null {
    if (this.done) return null;
    if (this.requires && !this.requires.includes(g.hostKind)) return 'Star Core: out of reach';
    return 'Grab the Star Core!';
  }
  useE(g: Game): void {
    if (this.done) return;
    if (this.requires && !this.requires.includes(g.hostKind)) {
      g.hint('Something is in the way. Who could get past it?');
      return;
    }
    this.done = true;
    this.group.visible = false;
    g.collectCore(this);
  }
  update(dt: number, g: Game): void {
    if (this.done) return;
    this.crystal.rotation.y += dt * 1.6;
    this.crystal.position.y = Math.sin(g.time * 2) * 0.12;
    (this.beam.material as THREE.MeshBasicMaterial).opacity = 0.14 + Math.sin(g.time * 3) * 0.05;
    if (g.rng() < dt * 8 && g.near(this.pos, 30)) {
      g.vfx.spawn('spark', this.pos.x + (g.rng() - 0.5) * 0.8, this.pos.y + (g.rng() - 0.5) * 0.8, this.pos.z + (g.rng() - 0.5) * 0.8, 0, 0.6, 0, '#fff4b0', 0.25, 0.8);
    }
  }
}

// ---------------------------------------------------------------------------
export class Postcard extends WorldObject {
  private readonly m: THREE.Mesh;
  constructor(id: string, area: AreaId, pos: THREE.Vector3, readonly title: string, readonly text: string, g: Game) {
    super(id, area, pos);
    const b = new GeoBuilder();
    b.box(0, 0, 0, 0.5, 0.34, 0.03, '#fbf7ee');
    b.box(0.13, 0.06, 0.02, 0.14, 0.16, 0.01, '#ff6fb5');
    b.box(-0.1, -0.02, 0.02, 0.2, 0.03, 0.01, '#4a8fe0');
    b.box(-0.1, -0.08, 0.02, 0.2, 0.03, 0.01, '#4a8fe0');
    this.m = mesh(b, g.mats.glow, false);
    this.group.add(this.m);
    this.range = 0;
  }
  init(g: Game): void {
    if (g.progress.collected.has(this.id)) {
      this.done = true;
      this.group.visible = false;
    }
  }
  update(dt: number, g: Game): void {
    if (this.done) return;
    this.m.rotation.y += dt * 1.5;
    this.m.position.y = Math.sin(g.time * 2.5) * 0.1;
    const p = g.controlled.pos;
    if (Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < 0.9 && Math.abs(p.y + 0.5 - this.pos.y) < 1.4) {
      this.done = true;
      this.group.visible = false;
      g.collectPostcard(this);
    }
  }
}

// ---------------------------------------------------------------------------
export class Breakable extends WorldObject {
  readonly collider: Collider;
  constructor(id: string, area: AreaId, pos: THREE.Vector3, readonly w: number, readonly h: number, readonly axis: 'x' | 'z', g: Game) {
    super(id, area, pos);
    const sx = axis === 'x' ? w : 0.5;
    const sz = axis === 'x' ? 0.5 : w;
    this.collider = g.col.addDynamic({ minX: pos.x - sx / 2, maxX: pos.x + sx / 2, minY: 0, maxY: h, minZ: pos.z - sz / 2, maxZ: pos.z + sz / 2, enabled: true, pass: 'none', camera: true });
    const b = new GeoBuilder();
    b.push({ ry: axis === 'x' ? 0 : Math.PI / 2 });
    b.block(0, 0, 0, w, h, 0.5, '#c8a888');
    // Crack lines: the telegraph for "something strong could break this".
    const crack = '#4a3020';
    b.add(new THREE.BoxGeometry(0.06, 1.2, 0.04), crack, { y: h * 0.5, z: 0.26, rz: 0.5 });
    b.add(new THREE.BoxGeometry(0.06, 0.8, 0.04), crack, { x: 0.3, y: h * 0.62, z: 0.26, rz: -0.6 });
    b.add(new THREE.BoxGeometry(0.06, 0.7, 0.04), crack, { x: -0.3, y: h * 0.35, z: 0.26, rz: -0.3 });
    b.add(new THREE.BoxGeometry(0.06, 1.2, 0.04), crack, { y: h * 0.5, z: -0.26, rz: -0.5 });
    for (let i = 0; i < 5; i += 1) b.block(-w / 2 + 0.3 + i * (w / 5), h * 0.1 + (i % 2) * 0.6, 0.27, 0.35, 0.2, 0.02, '#b09070');
    b.pop();
    this.group.add(mesh(b, g.mats.world));
    this.range = w / 2 + 1.2;
    this.markerY = h + 0.3;
  }
  init(g: Game): void {
    if (g.progress.flag(`broken:${this.id}`)) this.breakNow(g, true);
  }
  promptF(g: Game): string | null {
    return !this.done && g.hostKind === 'strongman' && !g.carrying ? 'Smash cracked wall' : null;
  }
  useF(g: Game): void {
    if (this.done || g.hostKind !== 'strongman') return;
    g.beginAction(0.45, 'HNNNG…', 'flex', () => this.breakNow(g, false));
  }
  breakNow(g: Game, instant: boolean): void {
    this.done = true;
    this.collider.enabled = false;
    this.group.visible = false;
    if (instant) return;
    g.setFlag(`broken:${this.id}`);
    g.audio.play('smash', { pos: this.pos });
    g.shake(0.6);
    g.hitstop(0.08);
    g.vfx.burst('confetti', this.pos.x, 1.2, this.pos.z, { count: 30, color: ['#c8a888', '#b09070', '#8a6a4a'], speed: 6, up: 4, gravity: 12, size: 0.45, life: 1.2 });
    g.vfx.burst('puff', this.pos.x, 1, this.pos.z, { count: 16, color: '#e8dcc0', speed: 3, up: 1, size: 0.9, grow: 1 });
    g.progress.bump('smashes');
  }
  distanceTo(p: THREE.Vector3): number {
    if (this.axis === 'x') return Math.hypot(Math.max(0, Math.abs(p.x - this.pos.x) - this.w / 2), p.z - this.pos.z);
    return Math.hypot(p.x - this.pos.x, Math.max(0, Math.abs(p.z - this.pos.z) - this.w / 2));
  }
}

// ---------------------------------------------------------------------------
export interface CannonAim {
  label: string;
  target: [number, number, number];
  yaw: number;
}

export class Cannon extends WorldObject {
  private readonly barrel = new THREE.Group();
  aim = 0;
  private aimYaw = 0;
  private readonly fuseMesh: THREE.Mesh;
  constructor(id: string, area: AreaId, pos: THREE.Vector3, readonly aims: CannonAim[], readonly goodAim: number, g: Game) {
    super(id, area, pos);
    const b = new GeoBuilder();
    for (const s of [-1, 1]) {
      b.cyl(s * 0.75, 0.55, 0, 0.55, 0.55, 0.15, '#7d5130', 12, { rz: Math.PI / 2, y: 0 });
      b.cyl(s * 0.75, 0.55, 0, 0.12, 0.12, 0.2, '#f2c14e', 8, { rz: Math.PI / 2, y: 0 });
    }
    b.block(0, 0.3, 0, 1.3, 0.5, 1.6, '#c8243a');
    this.group.add(mesh(b, g.mats.world));
    const bb = new GeoBuilder();
    bb.cyl(0, 0, 0, 0.5, 0.6, 2.6, '#2d3a6b', 14, { rx: Math.PI / 2, y: 0, z: 0.6 });
    bb.cyl(0, 0, 1.9, 0.62, 0.62, 0.25, '#f2c14e', 14, { rx: Math.PI / 2, y: 0 });
    for (let i = 0; i < 5; i += 1) bb.sphere(Math.cos(i * 1.25) * 0.52, Math.sin(i * 1.25) * 0.52, 0.4 + i * 0.3, 0.08, '#ffe27a', 5, 4);
    bb.add(new THREE.TorusGeometry(0.5, 0.05, 5, 16), '#ffffff', { z: 1.0 });
    this.barrel.add(mesh(bb, g.mats.world));
    this.barrel.position.set(0, 1.0, 0);
    this.barrel.rotation.x = -0.65;
    this.group.add(this.barrel);
    this.fuseMesh = itemMesh('fuse', g);
    this.fuseMesh.position.set(0, 0.6, -0.7);
    this.fuseMesh.visible = false;
    this.barrel.add(this.fuseMesh);
    g.col.box(pos.x, 0, pos.z, 1.8, 1.0, 1.8);
    this.range = 2.4;
    this.markerY = 2.6;
  }
  init(g: Game): void {
    this.aim = g.progress.values[`aim:${this.id}`] ?? 0;
    this.aimYaw = this.aims[this.aim].yaw;
    this.fuseMesh.visible = g.progress.flag('cannonFuse');
  }
  get aimed(): boolean {
    return this.aim === this.goodAim;
  }
  promptE(g: Game): string | null {
    if (!g.progress.flag('cannonFuse')) return g.hasItem('fuse') ? 'Install Cannon Fuse' : 'Cannon: no fuse';
    if (g.carrying) return null;
    return `Climb in! (aimed at ${this.aims[this.aim].label})`;
  }
  useE(g: Game): void {
    if (!g.progress.flag('cannonFuse')) {
      if (g.hasItem('fuse')) {
        g.takeItem('fuse');
        g.setFlag('cannonFuse');
        this.fuseMesh.visible = true;
        g.audio.play('lever', { pos: this.pos });
      } else {
        g.audio.play('denied', { pos: this.pos });
        g.hint('No fuse, no BOOM. The ringmaster keeps spares in her trailer.');
      }
      return;
    }
    const a = this.aims[this.aim];
    const muzzle = new THREE.Vector3(this.pos.x + Math.sin(this.aimYaw) * 1.8, this.pos.y + 2.0, this.pos.z + Math.cos(this.aimYaw) * 1.8);
    g.launch(muzzle, new THREE.Vector3(a.target[0], a.target[1], a.target[2]), 1.25, this.aim === this.goodAim ? 'perfect' : 'miss');
    g.audio.play('cannon', { pos: this.pos });
    g.shake(0.7);
    g.vfx.burst('puff', muzzle.x, muzzle.y, muzzle.z, { count: 24, color: ['#ffffff', '#d0d0d8'], speed: 5, up: 1.5, size: 0.9, grow: 1.5 });
    g.vfx.burst('confetti', muzzle.x, muzzle.y, muzzle.z, { count: 30, color: ['#ff8fc0', '#ffe27a', '#4a8fe0', '#4fb06a'], speed: 6, up: 3, gravity: 6 });
  }
  promptF(g: Game): string | null {
    return g.hostKind === 'strongman' && !g.carrying ? `Turn cannon (→ ${this.aims[(this.aim + 1) % this.aims.length].label})` : null;
  }
  useF(g: Game): void {
    if (g.hostKind !== 'strongman') return;
    g.beginAction(0.6, 'Heave…', 'lift', () => {
      this.aim = (this.aim + 1) % this.aims.length;
      g.progress.values[`aim:${this.id}`] = this.aim;
      g.setFlag('cannonAimed', this.aimed);
      g.audio.play('thud', { pos: this.pos, pitch: 0.7 });
      g.shake(0.2);
    });
  }
  update(dt: number): void {
    const t = this.aims[this.aim].yaw;
    let d = t - this.aimYaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.aimYaw += d * (1 - Math.exp(-4 * dt));
    this.group.rotation.y = this.aimYaw;
  }
}

// ---------------------------------------------------------------------------
export class Lasers extends WorldObject {
  private readonly beams: THREE.Mesh[] = [];
  private readonly rects: [number, number, number, number][] = [];
  private humming = false;
  constructor(id: string, area: AreaId, segments: [number, number, number, number][], readonly offFlag: string, g: Game) {
    super(id, area, new THREE.Vector3(segments[0][0], 0, segments[0][1]));
    for (const [x0, z0, x1, z1] of segments) {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const ry = Math.atan2(x1 - x0, z1 - z0);
      for (const y of [0.35, 0.8, 1.25, 1.7]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, len), g.mats.laser);
        m.position.set((x0 + x1) / 2 - this.pos.x, y, (z0 + z1) / 2 - this.pos.z);
        m.rotation.y = ry;
        this.group.add(m);
        this.beams.push(m);
      }
      for (const [px, pz] of [[x0, z0], [x1, z1]]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 2, 8), g.mats.metal);
        post.position.set(px - this.pos.x, 1, pz - this.pos.z);
        this.group.add(post);
      }
      this.rects.push([Math.min(x0, x1) - 0.3, Math.max(x0, x1) + 0.3, Math.min(z0, z1) - 0.3, Math.max(z0, z1) + 0.3]);
    }
    this.range = 0;
  }
  update(_dt: number, g: Game): void {
    const on = !g.progress.flag(this.offFlag);
    for (const b of this.beams) b.visible = on;
    (g.mats.laser as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(g.time * 20) * 0.25;
    const p = g.controlled.pos;
    const near = on && g.near(this.pos, 10);
    if (near !== this.humming) {
      this.humming = near;
      if (near) g.audio.startLoop('laserHum', this.pos);
      else g.audio.stopLoop('laserHum');
    }
    if (!on || g.ejecting) return;
    for (const [x0, x1, z0, z1] of this.rects) {
      if (p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1 && p.y < 1.9) {
        g.audio.play('laser', { pos: p });
        g.audio.play('zap', { pos: p });
        g.vfx.burst('bolt', p.x, p.y + 0.8, p.z, { count: 14, color: ['#ff2a55', '#ffffff'], speed: 4, up: 2 });
        g.eject('ZZZAP! The laser grid bounced you out. Somebody must switch it off first.', 'laser');
        return;
      }
    }
  }
}

// ---------------------------------------------------------------------------
/** Funfair high striker: Brick rings the bell. */
export class HighStriker extends WorldObject {
  private readonly puck: THREE.Mesh;
  private ringT = 0;
  constructor(id: string, area: AreaId, pos: THREE.Vector3, g: Game) {
    super(id, area, pos);
    const b = new GeoBuilder();
    b.block(0, 0, 0, 1.2, 0.3, 1.2, '#c8243a');
    b.block(0, 0.3, -0.3, 0.3, 5.5, 0.2, '#fbf7ee');
    for (let i = 0; i < 6; i += 1) b.block(0, 0.6 + i * 0.85, -0.18, 0.34, 0.12, 0.05, ['#4fb06a', '#ffe27a', '#f39a3d', '#e2473f', '#ff6fb5', '#7d4fc9'][i]);
    b.sphere(0, 6.0, -0.3, 0.35, '#f2c14e', 10, 8);
    b.block(0, 0.3, 0.2, 0.6, 0.15, 0.4, '#2a2238');
    this.group.add(mesh(b, g.mats.world));
    this.puck = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.15), g.mats.glow);
    this.puck.position.set(0, 0.5, -0.12);
    this.group.add(this.puck);
    g.col.box(pos.x, 0, pos.z - 0.3, 0.6, 6, 0.6);
    this.markerY = 2.2;
  }
  promptF(g: Game): string | null {
    return g.hostKind === 'strongman' && !g.carrying ? 'Swing the mallet' : null;
  }
  useF(g: Game): void {
    g.beginAction(0.5, 'Wind up…', 'lift', () => {
      this.ringT = 1;
      g.audio.play('chime', { pos: this.pos });
      g.audio.play('cheer', { pos: this.pos });
      g.shake(0.3);
      g.vfx.burst('star', this.pos.x, 6.2, this.pos.z - 0.3, { count: 20, color: ['#ffe27a', '#ff8fc0'], speed: 4, up: 2 });
      if (!g.progress.flag('striker')) {
        g.setFlag('striker');
        g.awardBits(3, this.pos, 'High striker champion!');
      }
    });
  }
  update(dt: number): void {
    this.ringT = Math.max(0, this.ringT - dt * 0.8);
    const t = this.ringT;
    this.puck.position.y = 0.5 + Math.sin(Math.min(1, t * 1.2) * Math.PI * 0.5) * 5.2 * (t > 0 ? 1 : 0);
  }
}

// ---------------------------------------------------------------------------
/** Glim's crashed saucer — the finale objective. */
export class Saucer extends WorldObject {
  private readonly body = new THREE.Group();
  private readonly lights: THREE.Mesh[] = [];
  launching = 0;
  constructor(pos: THREE.Vector3, g: Game) {
    super('saucer', 'station', pos);
    const b = new GeoBuilder();
    b.add(new THREE.SphereGeometry(2.2, 18, 8), '#c8d4e8', { sy: 0.28 });
    b.add(new THREE.TorusGeometry(2.1, 0.18, 6, 24), '#7d4fc9', { rx: Math.PI / 2 });
    b.add(new THREE.CylinderGeometry(0.8, 1.2, 0.3, 14), '#8a8fa8', { y: -0.5 });
    for (let i = 0; i < 3; i += 1) {
      const a = (i / 3) * Math.PI * 2;
      b.add(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 5), '#5a5f78', { x: Math.cos(a) * 1.3, y: -0.7, z: Math.sin(a) * 1.3, rz: Math.cos(a) * 0.4, rx: -Math.sin(a) * 0.4 });
      b.sphere(Math.cos(a) * 1.55, -1.1, Math.sin(a) * 1.55, 0.18, '#5a5f78', 6, 4);
    }
    // Dent + patch: storytelling of the crash.
    b.box(1.2, 0.35, 0.9, 0.6, 0.06, 0.5, '#e8c070', 0.4);
    b.box(1.1, 0.42, 0.85, 0.08, 0.03, 0.5, '#5a5f78', 0.9);
    const bm = mesh(b, g.mats.metal);
    this.body.add(bm);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.0, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), g.mats.glass);
    dome.position.y = 0.45;
    this.body.add(dome);
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), new THREE.MeshBasicMaterial({ color: '#444455', toneMapped: false }));
      l.position.set(Math.cos(a) * 2.05, 0.02, Math.sin(a) * 2.05);
      this.body.add(l);
      this.lights.push(l);
    }
    this.body.rotation.set(0.25, 0, -0.18);
    this.body.position.y = 0.9;
    this.group.add(this.body);
    g.col.box(pos.x, 0, pos.z, 3.6, 1.6, 3.6);
    this.range = 3.6;
    this.markerY = 2.8;
  }
  init(g: Game): void {
    this.done = g.progress.flag('saucerFixed');
    if (this.done) this.body.rotation.set(0, 0, 0);
  }
  promptE(g: Game): string | null {
    if (this.done) return 'Saucer: ready for take-off';
    const c = g.progress.cores;
    return c >= 5 ? 'Install all 5 Star Cores!' : `Saucer: ${c}/5 Star Cores`;
  }
  useE(g: Game): void {
    if (this.done) {
      g.startEnding(true);
      return;
    }
    if (g.progress.cores < 5) {
      g.hint(`The saucer needs ${5 - g.progress.cores} more Star Core${5 - g.progress.cores === 1 ? '' : 's'}. Check the tracker!`);
      g.audio.play('denied');
      return;
    }
    this.done = true;
    g.setFlag('saucerFixed');
    g.startEnding(false);
  }
  update(dt: number, g: Game): void {
    const cores = g.progress.cores;
    for (let i = 0; i < this.lights.length; i += 1) {
      const lit = i < Math.round((cores / 5) * 8) || this.done;
      const m = this.lights[i].material as THREE.MeshBasicMaterial;
      m.color.set(lit ? (Math.sin(g.time * 6 + i) > 0 ? '#ffe27a' : '#ff8fc0') : '#444455');
    }
    if (!this.done && g.rng() < dt * 3 && g.near(this.pos, 25)) {
      g.vfx.spawn('puff', this.pos.x + 1.2, 1.4, this.pos.z + 0.8, 0.2, 0.8, 0, '#8a8a9a', 0.6, 2, -0.1, 0.4, 0.3);
    }
    if (this.done) {
      this.body.rotation.x *= Math.exp(-3 * dt);
      this.body.rotation.z *= Math.exp(-3 * dt);
      this.body.position.y = 0.9 + Math.sin(g.time * 2) * 0.1 + this.launching * this.launching * 40;
      this.body.rotation.y += dt * (1 + this.launching * 10);
    }
  }
}

export { tmp };
