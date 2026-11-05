import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import type { ChapterId, Surface } from '../core/types';
import type { Interactable } from '../objects/Interactable';
import { Builder, animateDust, inZone, stormUniforms, type Zone } from './LevelKit';
import type { MelodySource } from '../audio/AudioManager';
import { lumoUniforms } from '../art/Materials';
import { batchStatic, batchSiblings } from './StaticBatcher';

export interface Checkpoint {
  pos: THREE.Vector3;
  yaw: number;
  crawl?: boolean;
}

export interface Palette {
  fog: string;
  fogDensity: number;
  hemiSky: string;
  hemiGround: string;
  hemi: number;
  ambient: string;
  ambientIntensity: number;
  exposure: number;
  lift: [number, number, number];
  gain: [number, number, number];
  moonColor: string;
  moonIntensity: number;
  moonPos: THREE.Vector3;
  moonTarget: THREE.Vector3;
  shadowExtent: number;
  rain: number;
  wind: number;
  pad: 'bedroom' | 'kitchen' | 'attic';
  background: string;
}

interface NoiseTrap {
  min: THREE.Vector3;
  max: THREE.Vector3;
  kind: 'creak' | 'clutter' | 'tray';
  cooldown: number;
  radius: number;
}

export abstract class Level {
  abstract readonly id: ChapterId;
  abstract readonly palette: Palette;
  readonly root = new THREE.Group();
  zones: Zone[] = [];
  checkpoints: Record<string, Checkpoint> = {};
  protected items: Interactable[] = [];
  protected traps: NoiseTrap[] = [];
  protected dust: THREE.Points[] = [];
  protected shafts: THREE.Mesh[] = [];
  moon!: THREE.DirectionalLight;
  protected hemi!: THREE.HemisphereLight;
  protected ambient!: THREE.AmbientLight;
  protected lightningTimer = 8;
  protected flash = 0;
  private flashSeq: number[] = [];
  melody: MelodySource | null = null;
  protected b!: Builder;
  protected ctx!: GameContext;
  time = 0;
  batchStats = { before: 0, after: 0 };
  private timers: { t: number; fn: () => void }[] = [];

  /** Run fn after `seconds` of game time (pauses with the game). */
  protected after(seconds: number, fn: () => void): void {
    this.timers.push({ t: seconds, fn });
  }

  /** Build geometry, colliders and interactables. */
  protected abstract construct(ctx: GameContext): void;
  /** Called after saved flags were applied; set up encounter state for the checkpoint. */
  abstract begin(ctx: GameContext, checkpoint: string): void;
  protected tick(_dt: number, _ctx: GameContext): void {}

  build(ctx: GameContext, configureShadow: (l: THREE.DirectionalLight) => void): void {
    this.ctx = ctx;
    this.b = new Builder(this.root, ctx.world);
    ctx.scene.add(this.root);
    this.setupLighting(ctx, configureShadow);
    this.construct(ctx);
    for (const item of this.items) item.root.userData.noBatch = true;
    this.root.updateMatrixWorld(true);
    this.batchStats = batchStatic(this.root);
    batchSiblings(this.root);
    for (const item of this.items) {
      (item as unknown as { attach?: (c: GameContext) => void }).attach?.(ctx);
    }
  }

  applyState(ctx: GameContext): void {
    for (const item of this.items) {
      (item as unknown as { applyState?: (c: GameContext) => void }).applyState?.(ctx);
    }
  }

  register<T extends Interactable>(item: T, parent: THREE.Object3D = this.root): T {
    parent.add(item.root);
    this.items.push(item);
    this.ctx.interactions.register(item);
    return item;
  }

  item<T extends Interactable>(id: string): T {
    const found = this.items.find((i) => i.id === id);
    if (!found) throw new Error(`Missing interactable ${id}`);
    return found as T;
  }

  protected zone(id: string, min: THREE.Vector3, max: THREE.Vector3, onEnter: () => void, once = true, enabled?: () => boolean): Zone {
    const z: Zone = { id, min, max, onEnter, once, enabled };
    this.zones.push(z);
    return z;
  }

  protected trap(kind: NoiseTrap['kind'], min: THREE.Vector3, max: THREE.Vector3, radius: number): void {
    this.traps.push({ kind, min, max, radius, cooldown: 0 });
  }

  private setupLighting(ctx: GameContext, configureShadow: (l: THREE.DirectionalLight) => void): void {
    const p = this.palette;
    ctx.scene.fog = new THREE.FogExp2(p.fog, p.fogDensity);
    ctx.scene.background = new THREE.Color(p.background);
    this.hemi = new THREE.HemisphereLight(p.hemiSky, p.hemiGround, p.hemi);
    this.root.add(this.hemi);
    this.ambient = new THREE.AmbientLight(p.ambient, p.ambientIntensity);
    this.root.add(this.ambient);
    this.moon = new THREE.DirectionalLight(p.moonColor, p.moonIntensity);
    this.moon.position.copy(p.moonPos);
    this.moon.target.position.copy(p.moonTarget);
    const s = p.shadowExtent;
    this.moon.shadow.camera.left = -s;
    this.moon.shadow.camera.right = s;
    this.moon.shadow.camera.top = s;
    this.moon.shadow.camera.bottom = -s;
    this.moon.shadow.camera.near = 0.5;
    this.moon.shadow.camera.far = 40;
    configureShadow(this.moon);
    this.root.add(this.moon, this.moon.target);
    this.moon.userData.base = p.moonIntensity;
  }

  /** Step on traps: creaky boards and clutter. */
  onStep(ctx: GameContext, pos: THREE.Vector3, _surface: Surface, crawling: boolean): void {
    for (const t of this.traps) {
      if (t.cooldown > 0) continue;
      if (pos.x < t.min.x || pos.x > t.max.x || pos.z < t.min.z || pos.z > t.max.z || pos.y > t.max.y + 0.05 || pos.y < t.min.y - 0.05) continue;
      // Crawling over creaky boards spreads the weight: quieter.
      const mult = crawling ? (t.kind === 'creak' ? 0.35 : 0.6) : 1;
      t.cooldown = t.kind === 'creak' ? 1.2 : 2.5;
      if (t.kind === 'creak') ctx.audio.play('creak', { pos, volume: crawling ? 0.4 : 1 });
      else ctx.audio.play('clatter', { pos, volume: crawling ? 0.6 : 1 });
      ctx.noise.emit(pos, t.radius * mult, t.kind);
    }
  }

  update(dt: number, ctx: GameContext): void {
    this.time += dt;
    stormUniforms.uTime.value = this.time;
    lumoUniforms.uTime.value = this.time;
    for (const t of this.traps) t.cooldown = Math.max(0, t.cooldown - dt);
    for (const timer of [...this.timers]) {
      timer.t -= dt;
      if (timer.t <= 0) {
        this.timers.splice(this.timers.indexOf(timer), 1);
        timer.fn();
      }
    }
    const p = ctx.player.position;
    for (const z of this.zones) {
      if (z.once && z.fired) continue;
      if (z.enabled && !z.enabled()) continue;
      if (inZone(z, p)) {
        if (!z.fired || !z.once) {
          z.fired = true;
          z.onEnter();
        }
      } else if (!z.once) {
        z.fired = false;
      }
    }
    for (const d of this.dust) animateDust(d, this.time, dt);
    this.updateLightning(dt, ctx);
    this.tick(dt, ctx);
  }

  /** Trigger a lightning strike now. */
  strike(ctx: GameContext, near = true): void {
    this.flashSeq = near ? [0.08, 0.06, 0.12, 0.05, 0.25] : [0.1, 0.4];
    this.flash = 0;
    ctx.audio.thunder(near);
  }

  private updateLightning(dt: number, ctx: GameContext): void {
    this.lightningTimer -= dt;
    if (this.lightningTimer <= 0) {
      this.lightningTimer = 13 + ctx.rng() * 20;
      this.strike(ctx, ctx.rng() > 0.55);
    }
    let strength = 0;
    if (this.flashSeq.length) {
      this.flash += dt;
      if (this.flash > this.flashSeq[0]) {
        this.flash = 0;
        this.flashSeq.shift();
      }
      strength = this.flashSeq.length % 2 === 1 ? 1 : 0.15;
      if (!this.flashSeq.length) strength = 0;
    }
    const base = this.moon.userData.base as number;
    this.moon.intensity = base * (1 + strength * 5);
    this.hemi.intensity = this.palette.hemi * (1 + strength * 4);
    stormUniforms.uFlash.value = strength;
    for (const s of this.shafts) {
      (s.material as THREE.ShaderMaterial).uniforms.uOpacity.value = (s.userData.baseOpacity as number) * (1 + strength * 3);
    }
    ctx.events.emit('lightning', { strength });
  }

  dispose(ctx: GameContext): void {
    ctx.audio.releaseMelody(this.melody);
    this.melody = null;
    this.root.removeFromParent();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      // Shared cached geometries live in the geometry cache and are reused across levels.
      if (m.isMesh && m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
      const l = o as THREE.Light;
      if (l.isLight && (l as THREE.DirectionalLight).shadow?.map) (l as THREE.DirectionalLight).shadow.map?.dispose();
    });
    for (const item of this.items) item.root.removeFromParent();
    this.items = [];
  }
}
