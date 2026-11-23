import * as THREE from 'three';
import { CONFIG } from '../core/Config';
import type { EventBus } from '../core/EventBus';
import type { GameStateData } from '../core/types';
import type { TerrainData } from '../world/TerrainGen';
import { build, Part } from '../render/ModelKit';
import { ParticleSystem } from './ParticleSystem';

interface Bolt {
  meshes: THREE.Mesh[];
  life: number;
  max: number;
}

const FIRE_LIGHTS = 3;

/**
 * Event-driven and state-driven VFX: fire, smoke, embers, lightning, sparkles,
 * celebration confetti, rain splashes and flood puddles. Particles are pooled;
 * the only per-event allocation is the short-lived lightning bolt geometry.
 */
export class VisualEffects {
  readonly group = new THREE.Group();
  readonly glow = new ParticleSystem(2600, true, 0.05);
  readonly smoke = new ParticleSystem(1600, false, 0.2);
  readonly bits = new ParticleSystem(1400, false, 0.35);
  private readonly bolts: Bolt[] = [];
  private readonly boltCore = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  private readonly boltGlow = new THREE.MeshBasicMaterial({ color: 0x8fb8ff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
  private readonly flash = new THREE.PointLight(0xc8d8ff, 0, 60, 1.6);
  private readonly fireLights: THREE.PointLight[] = [];
  private readonly puddles: THREE.InstancedMesh;
  /** Authored flame tongues so fires read as fire even in a single frame. */
  private readonly flames: THREE.InstancedMesh;
  private readonly flameColor = new THREE.Color();
  private readonly dummy = new THREE.Object3D();
  private fireAccum = new Map<number, number>();
  private chimneyTimer = 0;
  private puddleTimer = 0;
  onShake: (amount: number) => void = () => {};
  onFlash: (amount: number) => void = () => {};
  density = 1;

  constructor(bus: EventBus, private readonly terrain: TerrainData, private readonly getState: () => GameStateData) {
    this.group.add(this.glow.points, this.smoke.points, this.bits.points, this.flash);
    for (let i = 0; i < FIRE_LIGHTS; i++) {
      const light = new THREE.PointLight(0xff8a3a, 0, 16, 1.5);
      this.fireLights.push(light);
      this.group.add(light);
    }
    this.puddles = new THREE.InstancedMesh(
      new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x5fb3e6, transparent: true, opacity: 0.62, roughness: 0.08, metalness: 0.1, depthWrite: false }),
      900,
    );
    this.puddles.count = 0;
    this.puddles.frustumCulled = false;
    this.puddles.renderOrder = 2;
    this.group.add(this.puddles);

    const flameGeo = build([
      Part.cone(0.55, 1.6, 6).jitter(0.08, 3).at(0, 0.8, 0).color(0xff7a1f),
      Part.cone(0.36, 1.25, 5).jitter(0.06, 4).at(0.05, 0.75, 0.04).color(0xffc23a),
      Part.cone(0.18, 0.8, 5).at(0, 0.55, 0.08).color(0xfff2a8),
    ]);
    this.flames = new THREE.InstancedMesh(
      flameGeo,
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.92, depthWrite: false }),
      CONFIG.fire.maxActive * 3,
    );
    this.flames.count = 0;
    this.flames.frustumCulled = false;
    this.flames.renderOrder = 13;
    this.group.add(this.flames);

    bus.on('LIGHTNING_STRUCK', (e) => this.lightning(e.x, e.y, e.z));
    bus.on('TREE_PLANTED', (e) => this.sparkle(e.x, terrain.heightAt(e.x, e.z), e.z, 0x9dff6b, 26));
    bus.on('TREE_REGROWN', (e) => this.sparkle(e.x, terrain.heightAt(e.x, e.z), e.z, 0xc6ff9a, 10));
    bus.on('FIRE_STARTED', (e) => {
      if (e.byPlayer) this.glow.burst({ x: e.x, y: terrain.heightAt(e.x, e.z) + 1, z: e.z, life: 0.7, size: 1.4, sizeEnd: 0.2, color: 0xffe27a, colorEnd: 0xff5a1f, gravity: -2 }, 40, 4);
    });
    bus.on('FIRE_EXTINGUISHED', (e) => {
      const y = terrain.heightAt(e.x, e.z) + 1.5;
      this.smoke.burst({ x: e.x, y, z: e.z, life: 2.2, size: 1.5, sizeEnd: 4, color: 0xe8eef2, colorEnd: 0xb8c2c8, alpha: 0.7, gravity: -1.2, drag: 1.5 }, 14, 1.5);
    });
    bus.on('BUILDING_DESTROYED', (e) => {
      const b = this.getState().buildings[e.buildingId];
      if (!b) return;
      const y = terrain.heightAt(b.x, b.z);
      this.smoke.burst({ x: b.x, y: y + 1, z: b.z, life: 3, size: 2.5, sizeEnd: 6, color: 0x3a3330, colorEnd: 0x77706a, alpha: 0.8, gravity: -1.5, drag: 1 }, 30, 3);
      this.glow.burst({ x: b.x, y: y + 1.5, z: b.z, life: 1.2, size: 0.5, color: 0xffb347, colorEnd: 0xff3d00, gravity: 4 }, 60, 7);
      this.onShake(0.6);
    });
    bus.on('RAIN_STARTED', (e) => {
      const y = Math.max(0, terrain.surfaceAt(e.x, e.z)) + 14;
      this.glow.burst({ x: e.x, y, z: e.z, spread: e.radius, life: 1, size: 0.8, sizeEnd: 0.2, color: 0xbfe6ff, colorEnd: 0x6fb6ff, gravity: 2 }, 50, 2);
    });
    bus.on('VILLAGERS_CELEBRATE', () => {
      /* Per-villager confetti is emitted in update() while they celebrate. */
    });
    bus.on('PRAYER_COMPLETED', (e) => {
      const y = terrain.heightAt(e.prayer.targetX, e.prayer.targetZ);
      this.glow.burst({ x: e.prayer.targetX, y: y + 3, z: e.prayer.targetZ, spread: 4, life: 1.6, size: 1.0, sizeEnd: 0.2, color: 0xffe9a8, colorEnd: 0xf2c14e, gravity: -1.5 }, 90, 6);
    });
    bus.on('VILLAGER_DIED', (e) => {
      const y = terrain.heightAt(e.x, e.z);
      this.glow.burst({ x: e.x, y: y + 0.8, z: e.z, life: 1.8, size: 0.5, sizeEnd: 0.1, color: 0xffffff, colorEnd: 0xcfe3ff, gravity: -2.5 }, 16, 1);
    });
  }

  setViewportHeight(px: number): void {
    this.glow.setViewportHeight(px);
    this.smoke.setViewportHeight(px);
    this.bits.setViewportHeight(px);
  }

  setDensity(d: number): void {
    this.density = d;
    this.glow.density = d;
    this.smoke.density = d;
    this.bits.density = d;
  }

  sparkle(x: number, y: number, z: number, color: number, count: number): void {
    this.glow.burst({ x, y: y + 0.4, z, spread: 0.6, life: 1.3, size: 0.7, sizeEnd: 0.1, color: 0xfff6c2, colorEnd: color, gravity: -2.2, drag: 1.2 }, count, 2.4);
  }

  lightning(x: number, y: number, z: number): void {
    const top = new THREE.Vector3(x + (Math.random() - 0.5) * 8, y + 46, z + (Math.random() - 0.5) * 8);
    const end = new THREE.Vector3(x, y, z);
    const meshes = [...this.boltMesh(top, end, 0.22, 14), ...this.branch(top, end)];
    for (const m of meshes) this.group.add(m);
    this.bolts.push({ meshes, life: 0.42, max: 0.42 });
    this.flash.position.set(x, y + 4, z);
    this.flash.intensity = 400;
    this.glow.burst({ x, y: y + 0.3, z, life: 0.6, size: 0.6, sizeEnd: 0.1, color: 0xffffff, colorEnd: 0x9cc4ff, gravity: 12 }, 70, 9);
    this.smoke.burst({ x, y: y + 0.5, z, life: 2, size: 1.8, sizeEnd: 4, color: 0x4b4a52, colorEnd: 0x8a8a94, alpha: 0.6, gravity: -1.2, drag: 1.5 }, 14, 2);
    this.bits.burst({ x, y: y + 0.2, z, life: 1, size: 0.35, color: 0x5b4a3a, colorEnd: 0x3a2f26, gravity: 14 }, 26, 7);
    this.onShake(1);
    this.onFlash(1);
  }

  private boltPoints(a: THREE.Vector3, b: THREE.Vector3, segments: number, jag: number): THREE.Vector3[] {
    const pts = [a.clone()];
    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      const p = a.clone().lerp(b, t);
      const j = jag * Math.sin(t * Math.PI);
      p.x += (Math.random() - 0.5) * j;
      p.z += (Math.random() - 0.5) * j;
      pts.push(p);
    }
    pts.push(b.clone());
    return pts;
  }

  private boltMesh(a: THREE.Vector3, b: THREE.Vector3, radius: number, segments: number): THREE.Mesh[] {
    const pts = this.boltPoints(a, b, segments, 6);
    const path = new THREE.CurvePath<THREE.Vector3>();
    for (let i = 0; i < pts.length - 1; i++) path.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
    const core = new THREE.Mesh(new THREE.TubeGeometry(path, segments * 2, radius, 4, false), this.boltCore);
    const glow = new THREE.Mesh(new THREE.TubeGeometry(path, segments * 2, radius * 4, 5, false), this.boltGlow);
    core.renderOrder = 30;
    glow.renderOrder = 29;
    this.lastBoltPoints = pts;
    return [core, glow];
  }

  private lastBoltPoints: THREE.Vector3[] = [];

  private branch(_top: THREE.Vector3, _end: THREE.Vector3): THREE.Mesh[] {
    const pts = this.lastBoltPoints;
    const out: THREE.Mesh[] = [];
    for (let k = 0; k < 3; k++) {
      const start = pts[2 + Math.floor(Math.random() * (pts.length - 5))];
      const dir = new THREE.Vector3((Math.random() - 0.5) * 2, -1.2, (Math.random() - 0.5) * 2).normalize();
      const end = start.clone().addScaledVector(dir, 6 + Math.random() * 8);
      const bp = this.boltPoints(start, end, 5, 2.5);
      const path = new THREE.CurvePath<THREE.Vector3>();
      for (let i = 0; i < bp.length - 1; i++) path.add(new THREE.LineCurve3(bp[i], bp[i + 1]));
      const m = new THREE.Mesh(new THREE.TubeGeometry(path, 10, 0.08, 3, false), this.boltCore);
      m.renderOrder = 30;
      out.push(m);
    }
    return out;
  }

  update(state: GameStateData, dt: number, elapsed: number, night: number, chimneyTops: THREE.Vector3[]): void {
    // Lightning bolts flicker and fade.
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const bolt = this.bolts[i];
      bolt.life -= dt;
      const k = Math.max(0, bolt.life / bolt.max);
      const flick = k > 0.5 ? (Math.sin(elapsed * 90) > -0.3 ? 1 : 0.3) : k * 2;
      for (const m of bolt.meshes) m.visible = flick > 0.05;
      this.boltCore.opacity = flick;
      this.boltGlow.opacity = flick * 0.45;
      if (bolt.life <= 0) {
        for (const m of bolt.meshes) {
          this.group.remove(m);
          m.geometry.dispose();
        }
        this.bolts.splice(i, 1);
      }
    }
    this.flash.intensity *= Math.exp(-dt * 9);

    // Fires.
    const fires = state.fires;
    const seen = new Set<number>();
    let flameCount = 0;
    for (const f of fires) {
      seen.add(f.id);
      const ground = this.terrain.heightAt(f.x, f.z);
      let baseY = ground + 0.3;
      let spread = 1.2;
      let height = 1;
      if (f.kind === 'tree') {
        const t = state.trees[f.targetId];
        const s = t ? t.scale * t.growth : 1;
        baseY = ground + (t?.kind === 'bush' ? 0.5 : 1.8) * s;
        spread = 1.6 * s;
        height = 1.4 * s;
      } else if (f.kind === 'building') {
        baseY = ground + 1.6;
        spread = 3;
        height = 1.8;
      }
      const tongues = f.kind === 'building' ? 3 : f.kind === 'tree' ? 2 : 1;
      for (let k = 0; k < tongues && flameCount < CONFIG.fire.maxActive * 3; k++) {
        const a = k * 2.1 + f.id;
        const off = k === 0 ? 0 : spread * 0.35;
        const flick = 0.8 + 0.2 * Math.sin(elapsed * 13 + f.id * 1.7 + k * 2.3);
        const sc = (0.55 + 0.75 * f.intensity) * height * flick * (k === 0 ? 1 : 0.75);
        this.dummy.position.set(f.x + Math.cos(a) * off, baseY - 0.5 * height, f.z + Math.sin(a) * off);
        this.dummy.rotation.set(Math.sin(elapsed * 7 + k) * 0.12, elapsed * 2 + a, Math.cos(elapsed * 6 + k) * 0.12);
        this.dummy.scale.set(sc * (f.kind === 'building' ? 1.6 : 1), sc * 1.3, sc * (f.kind === 'building' ? 1.6 : 1));
        this.dummy.updateMatrix();
        this.flames.setMatrixAt(flameCount, this.dummy.matrix);
        this.flames.setColorAt(flameCount, this.flameColor.setRGB(1, 0.85 + 0.15 * f.intensity, 0.8));
        flameCount++;
      }
      const rate = (18 + 48 * f.intensity) * this.density;
      let acc = (this.fireAccum.get(f.id) ?? 0) + rate * dt;
      while (acc >= 1) {
        acc -= 1;
        this.glow.emit({ x: f.x, y: baseY, z: f.z, spread, vy: 2.6 * height, life: 0.8, size: 2.3 * height, sizeEnd: 0.4, color: 0xffd25a, colorEnd: 0xff3d1f, alpha: 0.95, drag: 0.5 });
        if (Math.random() < 0.28) {
          this.smoke.emit({ x: f.x, y: baseY + height, z: f.z, spread: spread * 0.7, vy: 2.2, vx: 0.4, life: 3.2, size: 1.6, sizeEnd: 4.5, color: 0x4a423e, colorEnd: 0x9a948e, alpha: 0.42 * f.intensity + 0.1, drag: 0.4 });
        }
        if (Math.random() < 0.1) {
          this.glow.emit({ x: f.x, y: baseY + height * 0.8, z: f.z, spread, vy: 3.5, vx: (Math.random() - 0.5) * 2, vz: (Math.random() - 0.5) * 2, life: 1.6, size: 0.22, color: 0xffc070, colorEnd: 0xff5a1f, gravity: -0.5 });
        }
      }
      this.fireAccum.set(f.id, acc);
    }
    for (const id of this.fireAccum.keys()) if (!seen.has(id)) this.fireAccum.delete(id);
    this.flames.count = Math.min(flameCount, CONFIG.fire.maxActive * 3);
    this.flames.instanceMatrix.needsUpdate = true;
    if (this.flames.instanceColor) this.flames.instanceColor.needsUpdate = true;

    // Fire glow lights on the strongest fires.
    const sorted = [...fires].sort((a, b) => b.intensity - a.intensity);
    for (let i = 0; i < FIRE_LIGHTS; i++) {
      const light = this.fireLights[i];
      const f = sorted[i];
      if (!f) {
        light.intensity = 0;
        continue;
      }
      light.position.set(f.x, this.terrain.heightAt(f.x, f.z) + 2.5, f.z);
      light.intensity = (30 + 25 * night) * f.intensity * (0.8 + Math.sin(elapsed * 17 + i * 3) * 0.2);
    }

    // Smouldering stumps.
    if (Math.random() < dt * 6) {
      for (const t of state.trees) {
        if (t.charred && t.charredTime < 12 && Math.random() < 0.08) {
          this.smoke.emit({ x: t.x, y: this.terrain.heightAt(t.x, t.z) + 0.8, z: t.z, vy: 1.2, life: 2.5, size: 0.8, sizeEnd: 2.2, color: 0x6a625c, colorEnd: 0xa09a94, alpha: 0.35 });
        }
      }
    }

    // Chimney smoke, thicker in the morning and evening.
    this.chimneyTimer -= dt;
    if (this.chimneyTimer <= 0) {
      this.chimneyTimer = 0.35 / Math.max(0.3, this.density);
      for (const p of chimneyTops) {
        if (Math.random() < 0.55 + night * 0.2) {
          this.smoke.emit({ x: p.x, y: p.y, z: p.z, vy: 1.1, vx: 0.35, vz: 0.15, spread: 0.15, life: 4, size: 0.5, sizeEnd: 2.0, color: 0xf2f2f2, colorEnd: 0xcfd6dc, alpha: 0.5, drag: 0.2 });
        }
      }
    }

    // Celebration confetti and prayer motes from live villager states.
    for (const v of state.villagers) {
      if (!v.alive) continue;
      const st = v.currentTask.state;
      if (st === 'CELEBRATING' && Math.random() < dt * 5 * this.density) {
        const c = [0xff4d6d, 0xffd23f, 0x4fd1c5, 0x9b5de5, 0xffffff][Math.floor(Math.random() * 5)];
        this.bits.emit({ x: v.position.x, y: v.position.y + 2.2, z: v.position.z, spread: 0.6, vy: 3, vx: (Math.random() - 0.5) * 3, vz: (Math.random() - 0.5) * 3, life: 1.5, size: 0.28, color: c, gravity: 6, drag: 1.5 }, 2);
      } else if (st === 'PRAYING' && v.currentTask.arrived && Math.random() < dt * 2.2) {
        this.glow.emit({ x: v.position.x, y: v.position.y + 1.6, z: v.position.z, spread: 0.4, vy: 1.4, life: 1.6, size: 0.45, sizeEnd: 0.1, color: 0xfff1b8, colorEnd: 0xf2c14e, gravity: -0.3 });
      }
    }

    // Puddles from flood cells.
    this.puddleTimer -= dt;
    if (this.puddleTimer <= 0) {
      this.puddleTimer = 0.25;
      this.updatePuddles(state);
    }

    this.glow.update(dt);
    this.smoke.update(dt);
    this.bits.update(dt);
  }

  private updatePuddles(state: GameStateData): void {
    const n = CONFIG.cells.count;
    const size = CONFIG.cells.size;
    const half = CONFIG.world.size / 2;
    let count = 0;
    for (let i = 0; i < state.flood.length && count < 897; i++) {
      const f = state.flood[i];
      if (f < CONFIG.flood.puddleLevel) continue;
      const cx = i % n;
      const cz = Math.floor(i / n);
      for (let k = 0; k < 3; k++) {
        const hx = Math.sin((i * 3 + k) * 12.9898) * 43758.5453;
        const hz = Math.sin((i * 3 + k) * 78.233) * 12345.6789;
        const x = -half + (cx + 0.2 + (hx - Math.floor(hx)) * 0.6) * size;
        const z = -half + (cz + 0.2 + (hz - Math.floor(hz)) * 0.6) * size;
        if (!this.terrain.isLand(x, z)) continue;
        const r = size * (0.32 + Math.min(1, f) * 0.5);
        this.dummy.position.set(x, this.terrain.heightAt(x, z) + 0.06 + Math.min(1, f) * 0.12, z);
        this.dummy.rotation.set(0, k, 0);
        this.dummy.scale.set(r, 1, r * 0.8);
        this.dummy.updateMatrix();
        this.puddles.setMatrixAt(count++, this.dummy.matrix);
      }
    }
    this.puddles.count = count;
    this.puddles.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    this.glow.clear();
    this.smoke.clear();
    this.bits.clear();
    this.fireAccum.clear();
  }
}
