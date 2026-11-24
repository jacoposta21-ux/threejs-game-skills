import * as THREE from 'three';
import type { GameStateData, PowerEffect } from '../core/types';
import { build, flatMaterial, Part } from '../render/ModelKit';
import type { TerrainData } from '../world/TerrainGen';
import type { VisualEffects } from './VisualEffects';

/** A disc mesh that hugs the terrain (resampled when created). */
function groundDisc(terrain: TerrainData, x: number, z: number, r: number, lift = 0.18): THREE.BufferGeometry {
  const rings = 7;
  const segs = 36;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  pos.push(x, terrain.heightAt(x, z) + lift, z);
  uv.push(0.5, 0.5);
  for (let ri = 1; ri <= rings; ri++) {
    const rr = (ri / rings) * r;
    for (let si = 0; si < segs; si++) {
      const a = (si / segs) * Math.PI * 2;
      const px = x + Math.cos(a) * rr;
      const pz = z + Math.sin(a) * rr;
      pos.push(px, Math.max(terrain.heightAt(px, pz), 0.05) + lift, pz);
      uv.push(0.5 + (Math.cos(a) * ri) / rings / 2, 0.5 + (Math.sin(a) * ri) / rings / 2);
    }
  }
  for (let si = 0; si < segs; si++) idx.push(0, 1 + ((si + 1) % segs), 1 + si);
  for (let ri = 1; ri < rings; ri++) {
    const a0 = 1 + (ri - 1) * segs;
    const b0 = 1 + ri * segs;
    for (let si = 0; si < segs; si++) {
      const s1 = (si + 1) % segs;
      idx.push(a0 + si, a0 + s1, b0 + si, a0 + s1, b0 + s1, b0 + si);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Radial gradient texture shared by decals (soft edge, bright rim). */
function decalTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.35)');
  g.addColorStop(0.78, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.92, 'rgba(255,255,255,0.95)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  // Clock / rune ticks around the rim.
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(64 + Math.cos(a) * 50, 64 + Math.sin(a) * 50);
    ctx.lineTo(64 + Math.cos(a) * (i % 6 === 0 ? 40 : 46), 64 + Math.sin(a) * (i % 6 === 0 ? 40 : 46));
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Visual {
  root: THREE.Group;
  disc?: THREE.Mesh;
  spin?: THREE.Object3D[];
  kind: string;
}

/**
 * Visuals for v0.4 power effects (driven entirely by `state.effects`, so they
 * survive save/load): tornado funnel, frost field with crystals, gravity bubble,
 * time-warp clock ring, meteor warning/fall/impact, graves, the possession aura
 * and craters. Particles go through the shared pooled systems.
 */
export class PowerEffectsRenderer {
  readonly group = new THREE.Group();
  private readonly visuals = new Map<number, Visual>();
  private readonly tex = decalTexture();
  private readonly funnelGeo: THREE.BufferGeometry;
  private readonly crystalGeo: THREE.BufferGeometry;
  private readonly graveMesh: THREE.InstancedMesh;
  private readonly graveGlow: THREE.InstancedMesh;
  private readonly aura: THREE.Mesh;
  private readonly meteorMat = flatMaterial({ emissive: 0xff6a1f, emissiveIntensity: 1.2 });
  private readonly meteorGeo = build([Part.dodeca(1.5).jitter(0.3, 7).color(0x5a4038)]);
  private readonly dummy = new THREE.Object3D();
  private emitTimer = 0;
  resurrectionSelected = false;

  constructor(private readonly terrain: TerrainData, private readonly vfx: VisualEffects) {
    this.group.name = 'power-effects';
    // Tornado: stacked, offset rings of dusty cloud that widen with height.
    const parts: Part[] = [];
    for (let i = 0; i < 12; i++) {
      const y = i * 1.05;
      const r = 0.35 + i * i * 0.04 + i * 0.18;
      parts.push(Part.torus(r, 0.18 + i * 0.05, 4, 12).rot(Math.PI / 2, 0, i * 0.4).at(Math.sin(i * 1.3) * 0.5, y + 0.3, Math.cos(i * 1.1) * 0.5).color([0xcfc6b8, 0xb5ab9c, 0xe2dbcf][i % 3]));
    }
    this.funnelGeo = build(parts);
    this.crystalGeo = build([Part.cone(0.22, 1.1, 4).at(0, 0.5, 0).color(0xd8f3ff), Part.cone(0.14, 0.7, 4).rot(0.4, 0, 0.3).at(0.2, 0.3, 0.1).color(0xbfe8ff)]);
    const graveGeo = build([Part.box(0.7, 0.9, 0.18).at(0, 0.45, 0).color(0xbfb8ae), Part.cyl(0.35, 0.35, 0.18, 10, false).rot(Math.PI / 2, 0, 0).at(0, 0.9, 0).color(0xbfb8ae), Part.box(0.9, 0.08, 1.2).at(0, 0.04, 0.5).color(0x7a5a3a)]);
    this.graveMesh = new THREE.InstancedMesh(graveGeo, flatMaterial(), 12);
    this.graveMesh.count = 0;
    this.graveMesh.castShadow = true;
    this.graveGlow = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.7, 0.9, 6, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff1b8, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), 12);
    this.graveGlow.count = 0;
    this.aura = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.05, 32), new THREE.MeshBasicMaterial({ color: 0x5fd3b0, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    this.aura.rotation.x = -Math.PI / 2;
    this.aura.visible = false;
    this.group.add(this.graveMesh, this.graveGlow, this.aura);
  }

  private decal(e: PowerEffect, color: number, opacity: number): THREE.Mesh {
    const mat = new THREE.MeshBasicMaterial({ map: this.tex, color, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const m = new THREE.Mesh(groundDisc(this.terrain, e.x, e.z, e.radius), mat);
    m.renderOrder = 3;
    return m;
  }

  private create(e: PowerEffect): Visual {
    const root = new THREE.Group();
    const v: Visual = { root, kind: e.kind };
    if (e.kind === 'tornado') {
      const funnel = new THREE.Mesh(this.funnelGeo, flatMaterial({ transparent: true, opacity: 0.62, depthWrite: false }));
      funnel.castShadow = true;
      root.add(funnel);
      v.spin = [funnel];
    } else if (e.kind === 'freeze') {
      v.disc = this.decal(e, 0xcfefff, 0.75);
      root.add(v.disc);
      const crystals = new THREE.InstancedMesh(this.crystalGeo, flatMaterial({ transparent: true, opacity: 0.92, emissive: 0x6fb8e8, emissiveIntensity: 0.25 }), 28);
      for (let i = 0; i < 28; i++) {
        const a = i * 2.39996;
        const r = Math.sqrt((i + 0.5) / 28) * e.radius * 0.95;
        const x = e.x + Math.cos(a) * r;
        const z = e.z + Math.sin(a) * r;
        this.dummy.position.set(x, this.terrain.heightAt(x, z), z);
        this.dummy.rotation.set(0, a, 0);
        this.dummy.scale.setScalar(1.0 + ((i * 7) % 5) * 0.3);
        this.dummy.updateMatrix();
        crystals.setMatrixAt(i, this.dummy.matrix);
      }
      root.add(crystals);
    } else if (e.kind === 'gravity') {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(e.radius, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xb9a6ff, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
      dome.position.set(e.x, this.terrain.heightAt(e.x, e.z) - 0.5, e.z);
      root.add(dome);
      v.disc = this.decal(e, 0xb9a6ff, 0.6);
      root.add(v.disc);
    } else if (e.kind === 'timewarp') {
      v.disc = this.decal(e, (e.factor ?? 1) > 1 ? 0xffd27a : 0x8fb8ff, 0.7);
      root.add(v.disc);
    } else if (e.kind === 'meteor') {
      v.disc = this.decal(e, 0xff5c3a, 0.5);
      root.add(v.disc);
      const rock = new THREE.Mesh(this.meteorGeo, this.meteorMat);
      rock.name = 'meteor-rock';
      root.add(rock);
      v.spin = [rock];
    }
    this.group.add(root);
    return v;
  }

  update(s: GameStateData, dt: number, elapsed: number, reducedMotion: boolean, possessedPos: THREE.Vector3 | null): void {
    const seen = new Set<number>();
    this.emitTimer -= dt;
    const emit = this.emitTimer <= 0;
    if (emit) this.emitTimer = 0.08;
    for (const e of s.effects) {
      seen.add(e.id);
      let v = this.visuals.get(e.id);
      if (!v) {
        v = this.create(e);
        this.visuals.set(e.id, v);
      }
      const left = e.until - s.time;
      const fade = Math.min(1, Math.max(0, left / 2), Math.max(0, (s.time - e.startedAt) * 2));
      const gy = this.terrain.heightAt(e.x, e.z);
      if (e.kind === 'tornado') {
        const f = v.spin![0];
        f.position.set(e.x, gy, e.z);
        if (!reducedMotion) f.rotation.y = elapsed * 5;
        f.scale.setScalar(0.4 + fade * 0.6);
        // Wobble: the funnel leans and sways as it travels.
        f.rotation.x = reducedMotion ? 0 : Math.sin(elapsed * 1.7) * 0.08;
        f.rotation.z = reducedMotion ? 0 : Math.cos(elapsed * 1.3) * 0.08;
        if (emit) {
          this.vfx.smoke.emit({ x: e.x, y: gy + 0.4, z: e.z, spread: 2.2, vy: 2.5, vx: (Math.random() - 0.5) * 3, vz: (Math.random() - 0.5) * 3, life: 1.4, size: 1.4, sizeEnd: 3.2, color: 0xa89c8a, colorEnd: 0xd8d0c4, alpha: 0.4 });
          const a = Math.random() * Math.PI * 2;
          this.vfx.bits.emit({ x: e.x + Math.cos(a) * 2, y: gy + 1 + Math.random() * 6, z: e.z + Math.sin(a) * 2, vx: -Math.sin(a) * 6, vz: Math.cos(a) * 6, vy: 2.5, life: 1.2, size: 0.3, color: Math.random() < 0.6 ? 0x6fae3e : 0x8a6a44, gravity: 1, drag: 0.5 });
        }
      } else if (e.kind === 'freeze' && v.disc) {
        (v.disc.material as THREE.MeshBasicMaterial).opacity = 0.75 * fade;
        if (emit && Math.random() < 0.6) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * e.radius;
          this.vfx.glow.emit({ x: e.x + Math.cos(a) * r, y: gy + 3 + Math.random() * 2, z: e.z + Math.sin(a) * r, vy: -0.8, life: 2.4, size: 0.35, sizeEnd: 0.15, color: 0xffffff, colorEnd: 0xbfe8ff, alpha: 0.9 });
          if (left < 6) this.vfx.smoke.emit({ x: e.x + Math.cos(a) * r, y: gy + 0.3, z: e.z + Math.sin(a) * r, vy: 0.6, life: 2, size: 0.8, sizeEnd: 2, color: 0xe8f6ff, alpha: 0.35 }); // thaw mist
        }
      } else if (e.kind === 'gravity' && v.disc) {
        (v.disc.material as THREE.MeshBasicMaterial).opacity = 0.6 * fade;
        if (emit) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * e.radius;
          this.vfx.glow.emit({ x: e.x + Math.cos(a) * r, y: gy + 0.3, z: e.z + Math.sin(a) * r, vy: 1.2, life: 3, size: 0.3, sizeEnd: 0.1, color: 0xd9ccff, colorEnd: 0x9d86f0, gravity: -0.2 });
          this.vfx.bits.emit({ x: e.x + Math.cos(a) * r, y: gy + 0.2, z: e.z + Math.sin(a) * r, vy: 0.8, life: 2.8, size: 0.22, color: 0x6fae3e, gravity: -0.15 });
        }
      } else if (e.kind === 'timewarp' && v.disc) {
        (v.disc.material as THREE.MeshBasicMaterial).opacity = 0.7 * fade;
        if (!reducedMotion) v.disc.rotation.y = 0;
        if (!reducedMotion) {
          const spin = elapsed * ((e.factor ?? 1) > 1 ? 1.6 : -0.4);
          const tex = (v.disc.material as THREE.MeshBasicMaterial).map!;
          tex.center.set(0.5, 0.5);
          tex.rotation = spin;
        }
        if (emit) {
          const a = Math.random() * Math.PI * 2;
          this.vfx.glow.emit({ x: e.x + Math.cos(a) * e.radius, y: gy + 0.4, z: e.z + Math.sin(a) * e.radius, vy: 0.9, life: 1.6, size: 0.3, color: (e.factor ?? 1) > 1 ? 0xffe08a : 0xb6d4ff });
        }
      } else if (e.kind === 'meteor') {
        const rock = v.spin![0];
        const impact = e.impactAt ?? e.startedAt;
        if (!e.done) {
          const k = Math.max(0, (impact - s.time) / 3);
          rock.visible = true;
          rock.position.set(e.x + k * 40, gy + 1 + k * 70, e.z - k * 25);
          rock.rotation.set(elapsed * 2, elapsed * 3, 0);
          if (v.disc) (v.disc.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.35 * Math.abs(Math.sin(elapsed * 8));
          if (emit) this.vfx.glow.emit({ x: rock.position.x, y: rock.position.y, z: rock.position.z, spread: 0.8, life: 0.8, size: 2.2, sizeEnd: 0.4, color: 0xffd27a, colorEnd: 0xff4a1a, alpha: 0.9 });
        } else {
          rock.visible = false;
          if (v.disc) v.disc.visible = false;
          if (emit && left > 2) this.vfx.smoke.emit({ x: e.x, y: gy + 0.6, z: e.z, spread: e.radius * 0.5, vy: 1.4, life: 3, size: 2.2, sizeEnd: 5, color: 0x6a625c, colorEnd: 0xb8b0a8, alpha: 0.35 });
        }
      }
    }
    for (const [id, v] of this.visuals) {
      if (seen.has(id)) continue;
      this.group.remove(v.root);
      v.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry && m.geometry !== this.funnelGeo && m.geometry !== this.crystalGeo && m.geometry !== this.meteorGeo) m.geometry.dispose();
        const mat = m.material as THREE.Material | undefined;
        if (mat && mat !== this.meteorMat) mat.dispose();
      });
      this.visuals.delete(id);
    }
    // Graves of the recently departed (only shown with something to resurrect).
    this.graveMesh.count = Math.min(12, s.graveyard.length);
    this.graveGlow.count = this.resurrectionSelected ? this.graveMesh.count : 0;
    s.graveyard.slice(0, 12).forEach((g, i) => {
      this.dummy.position.set(g.x, this.terrain.heightAt(g.x, g.z), g.z);
      this.dummy.rotation.set(0, (i * 1.3) % 6.28, 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.graveMesh.setMatrixAt(i, this.dummy.matrix);
      this.dummy.position.y += 3;
      this.dummy.updateMatrix();
      this.graveGlow.setMatrixAt(i, this.dummy.matrix);
    });
    this.graveMesh.instanceMatrix.needsUpdate = true;
    this.graveGlow.instanceMatrix.needsUpdate = true;
    // Possession aura.
    this.aura.visible = !!possessedPos;
    if (possessedPos) {
      this.aura.position.set(possessedPos.x, possessedPos.y + 0.08, possessedPos.z);
      const sc = 1 + 0.12 * Math.sin(elapsed * 4);
      this.aura.scale.set(sc, sc, sc);
    }
  }

  /** One-shot effects triggered by events. */
  meteorImpact(x: number, z: number): void {
    const y = this.terrain.heightAt(x, z);
    this.vfx.ring(x, y + 0.3, z, 0xffb27a, 22, 1.2);
    this.vfx.ring(x, y + 0.3, z, 0xffffff, 12, 0.7);
    this.vfx.glow.burst({ x, y: y + 1, z, spread: 2, life: 1.6, size: 2.5, sizeEnd: 0.3, color: 0xffe08a, colorEnd: 0xff4a1a, gravity: 3, drag: 0.8 }, 90, 14);
    this.vfx.bits.burst({ x, y: y + 1, z, spread: 1.5, life: 2.2, size: 0.45, color: 0x5a4038, gravity: 9, drag: 0.4 }, 70, 12);
    this.vfx.smoke.burst({ x, y: y + 1, z, spread: 3, life: 4.5, size: 3, sizeEnd: 8, color: 0x5e5650, colorEnd: 0xb0a89e, alpha: 0.5, drag: 1 }, 40, 5);
  }

  resurrection(x: number, z: number): void {
    const y = this.terrain.heightAt(x, z);
    this.vfx.ring(x, y + 0.2, z, 0xfff1b8, 8, 1.4);
    this.vfx.glow.burst({ x, y: y + 0.5, z, spread: 0.6, life: 2.4, size: 0.8, sizeEnd: 0.1, color: 0xffffff, colorEnd: 0xf2c14e, gravity: -3, drag: 0.6 }, 60, 3);
  }

  terraform(x: number, z: number, radius: number, raise: boolean): void {
    const y = this.terrain.heightAt(x, z);
    this.vfx.ring(x, y + 0.2, z, raise ? 0xa8c86a : 0x8a6a44, radius * 2, 0.8);
    this.vfx.smoke.burst({ x, y: y + 0.3, z, spread: radius * 0.6, life: 1.8, size: 1.2, sizeEnd: 2.8, color: 0x9a8670, colorEnd: 0xc8b8a0, alpha: 0.45, drag: 1.2 }, 18, 2);
  }
}
