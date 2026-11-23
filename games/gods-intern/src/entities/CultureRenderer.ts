import * as THREE from 'three';
import type { GameStateData, SacredObject } from '../core/types';
import { officeSite } from '../culture/CultureSystem';
import { build, flatMaterial, hashUnit, Part } from '../render/ModelKit';
import type { TerrainData } from '../world/TerrainGen';

/** Instanced batch: begin() → add() many → end(). One draw call per batch. */
class Batch {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly c = new THREE.Color();

  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, cap: number, shadows = true, name = '') {
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = shadows;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.name = name;
  }
  begin(): void {
    this.n = 0;
  }
  add(x: number, y: number, z: number, ry = 0, sx = 1, sy = sx, sz = sx, color?: number, rx = 0, rz = 0): void {
    if (this.n >= this.mesh.instanceMatrix.count) return;
    this.e.set(rx, ry, rz);
    this.q.setFromEuler(this.e);
    this.p.set(x, y, z);
    this.s.set(sx, sy, sz);
    this.m.compose(this.p, this.q, this.s);
    this.mesh.setMatrixAt(this.n, this.m);
    this.mesh.setColorAt(this.n, this.c.set(color ?? 0xffffff));
    this.n++;
  }
  end(): void {
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0; // empty batches cost no draw call
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

function signTexture(text: string, bg: string, fg: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 192;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 192);
  ctx.strokeStyle = fg;
  ctx.lineWidth = 12;
  ctx.strokeRect(10, 10, 492, 172);
  ctx.fillStyle = fg;
  ctx.font = 'bold 76px "Fredoka", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 100);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const DECOR_KINDS = ['flag', 'candle', 'flowers', 'stones', 'ribbon', 'altar', 'sign', 'statue'] as const;

/**
 * Everything the culture layer adds to the world, rebuilt from logical state
 * every frame into a fixed set of instanced batches (≈30 draws total, bounded
 * by the sacred-object and decoration caps).
 */
export class CultureRenderer {
  readonly group = new THREE.Group();
  readonly pickables: THREE.Object3D[] = [];
  private readonly b: Record<string, Batch> = {};
  private readonly flameMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
  private readonly glowMat = new THREE.MeshBasicMaterial({ color: 0xffd66b, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
  private readonly outOfOffice: THREE.Mesh;
  private readonly officeSign: THREE.Mesh;

  constructor(private readonly terrain: TerrainData) {
    const std = flatMaterial();
    const gold = flatMaterial({ metalness: 0.55, roughness: 0.32, emissive: 0x6b4a00, emissiveIntensity: 0.35 });
    const add = (name: string, geo: THREE.BufferGeometry, cap: number, mat: THREE.Material = std, shadows = true) => {
      this.b[name] = new Batch(geo, mat, cap, shadows, `culture-${name}`);
      this.group.add(this.b[name].mesh);
    };
    // Rocks and royalty.
    add('rock', build([Part.dodeca(0.9).jitter(0.3, 5).scale(1.15, 0.75, 1).color(0xa39b92, 0.05), Part.dodeca(0.45).jitter(0.15, 6).at(0.55, 0.15, 0.3).color(0x8f877f)]), 20);
    add('leg', build([Part.box(0.18, 0.55, 0.2).at(0, -0.27, 0).color(0x8f877f), Part.box(0.26, 0.1, 0.36).at(0, -0.55, 0.06).color(0x6e665f)]), 40);
    add('eye', build([Part.ico(0.12, 0).color(0xffffff), Part.ico(0.06, 0).at(0, 0, 0.09).color(0x1d2747)]), 40, std, false);
    add('crown', build([
      Part.cyl(0.55, 0.5, 0.32, 10, true).at(0, 0.16, 0).color(0xf2c14e),
      ...[0, 1, 2, 3, 4].map((i) => Part.cone(0.12, 0.38, 4).at(Math.cos((i / 5) * Math.PI * 2) * 0.48, 0.48, Math.sin((i / 5) * Math.PI * 2) * 0.48).color(0xf6d36b)),
      ...[0, 1, 2, 3, 4].map((i) => Part.ico(0.06, 0).at(Math.cos((i / 5) * Math.PI * 2 + 0.6) * 0.52, 0.16, Math.sin((i / 5) * Math.PI * 2 + 0.6) * 0.52).color(0xe63946)),
    ]), 4, gold);
    add('plume', build([Part.cone(0.09, 0.8, 5).rot(0.3, 0, 0).at(0, 0.4, -0.1).color(0xe63946), Part.cone(0.07, 0.6, 5).rot(0.5, 0, 0.2).at(0.05, 0.3, -0.15).color(0xffffff)]), 4);
    add('banner', build([Part.cyl(0.05, 0.06, 3.2, 5).at(0, 1.6, 0).color(0x6b4a2e), Part.box(0.9, 0.62, 0.04).at(0.47, 2.75, 0).color(0xffffff), Part.cone(0.09, 0.2, 5).at(0, 3.3, 0).color(0xf2c14e)]), 12);
    // Decorations.
    add('flag', build([Part.cyl(0.03, 0.035, 1.3, 4).at(0, 0.65, 0).color(0x6b4a2e), Part.box(0.5, 0.32, 0.03).at(0.26, 1.12, 0).color(0xffffff)]), 60);
    add('candle', build([Part.cyl(0.08, 0.09, 0.32, 6).at(0, 0.16, 0).color(0xfff6e0), Part.cyl(0.11, 0.11, 0.05, 6).at(0, 0.02, 0).color(0x9b8e7a)]), 60);
    add('candleFlame', build([Part.cone(0.05, 0.16, 5).at(0, 0.42, 0).color(0xffc23a)]), 60, this.flameMat, false);
    add('flowers', build([0, 1, 2, 3, 4].map((i) => Part.ico(0.1, 0).at(Math.cos(i * 1.3) * 0.25, 0.22 + (i % 2) * 0.05, Math.sin(i * 1.3) * 0.25).color([0xff6b8b, 0xffd23f, 0xffffff, 0xb388ff, 0xff9f43][i]))
      .concat([Part.cone(0.32, 0.25, 6).at(0, 0.12, 0).color(0x5fae3e)])), 60);
    add('stones', build([0, 1, 2, 3, 4, 5].map((i) => Part.dodeca(0.16).at(Math.cos(i * 1.05) * 0.5, 0.08, Math.sin(i * 1.05) * 0.5).color(0xb8b0a6))), 60);
    add('ribbon', build([Part.cyl(0.05, 0.06, 1.5, 5).at(0, 0.75, 0).color(0x8a6a44), Part.box(0.14, 0.5, 0.02).rot(0, 0, 0.2).at(0.1, 1.15, 0).color(0xffffff), Part.box(0.12, 0.42, 0.02).rot(0, 0, -0.25).at(-0.08, 1.1, 0.03).color(0xffffff)]), 60);
    add('altar', build([Part.box(0.7, 0.45, 0.45).at(0, 0.22, 0).color(0xd8cfbe), Part.box(0.8, 0.07, 0.55).at(0, 0.48, 0).color(0xf2c14e), Part.ico(0.1, 0).at(0, 0.6, 0).color(0xff6b8b)]), 60);
    add('sign', build([Part.box(0.08, 1.1, 0.08).at(0, 0.55, 0).color(0x6b4a2e), Part.box(0.75, 0.42, 0.06).at(0, 1.0, 0.03).color(0xe3c08a), Part.box(0.55, 0.06, 0.07).at(0, 1.05, 0.04).color(0x3a2a1c)]), 60);
    add('statue', build([Part.box(0.42, 0.25, 0.42).at(0, 0.12, 0).color(0x9a9187), Part.cyl(0.13, 0.17, 0.5, 6).at(0, 0.5, 0).color(0xc49a62), Part.ico(0.15, 0).at(0, 0.86, 0).color(0xc49a62), Part.box(0.5, 0.06, 0.1).at(0, 0.62, 0).color(0xc49a62)]), 60);
    add('aura', new THREE.RingGeometry(2.2, 2.7, 28).rotateX(-Math.PI / 2), 12, this.glowMat, false);
    // Shrines, construction and monuments.
    add('shrine', build([
      Part.box(2.2, 0.25, 1.8).at(0, 0.12, 0).color(0xbfae94),
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => Part.cyl(0.08, 0.1, 1.5, 6).at(sx * 0.85, 1.0, sz * 0.65).color(0x8a5a34))),
      Part.prism(2.5, 0.9, 2.1).at(0, 1.75, 0).color(0xc65a3e, 0.05),
      Part.box(0.6, 0.5, 0.5).at(0, 0.5, 0).color(0xf2c14e),
      Part.ico(0.14, 0).at(0, 2.75, 0).color(0xf2c14e),
    ]), 10);
    add('scaffold', build([
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => Part.box(0.1, 2.4, 0.1).at(sx * 1.1, 1.2, sz * 1.0).color(0xb08a60))),
      Part.box(2.4, 0.08, 0.08).at(0, 1.2, 1.0).color(0xb08a60),
      Part.box(2.4, 0.08, 0.08).at(0, 1.2, -1.0).color(0xb08a60),
      Part.box(0.08, 0.08, 2.1).rot(0, 0, 0.6).at(1.1, 1.2, 0).color(0xb08a60),
    ]), 14);
    add('logs', build([0, 1, 2, 3, 4].map((i) => Part.cyl(0.14, 0.14, 1.3, 6).rot(0, 0, Math.PI / 2).at(0, 0.14 + Math.floor(i / 3) * 0.26, (i % 3) * 0.3 - 0.3 + Math.floor(i / 3) * 0.15).color(0x9b6a3e))), 14);
    add('m-crown-statue', build([
      Part.box(2.2, 1.0, 2.2).at(0, 0.5, 0).color(0x9e968c),
      Part.cyl(1.15, 1.0, 0.8, 10, true).at(0, 1.4, 0).color(0xc9c2b8),
      ...[0, 1, 2, 3, 4, 5].map((i) => Part.cone(0.26, 0.85, 4).at(Math.cos((i / 6) * Math.PI * 2) * 1.05, 2.2, Math.sin((i / 6) * Math.PI * 2) * 1.05).color(0xd8d1c7)),
      ...[0, 1, 2].map((i) => Part.ico(0.18, 0).at(Math.cos(i * 2.1) * 1.12, 1.4, Math.sin(i * 2.1) * 1.12).color(0x8a6cff)),
    ]), 4);
    add('m-obelisk', build([Part.box(1.8, 0.5, 1.8).at(0, 0.25, 0).color(0x9e968c), Part.cyl(0.35, 0.6, 4.2, 4).rot(0, Math.PI / 4, 0).at(0, 2.6, 0).color(0xd8d1c7), Part.cone(0.38, 0.8, 4).rot(0, Math.PI / 4, 0).at(0, 5.1, 0).color(0xffffff)]), 6);
    add('m-golden-shrine', build([Part.box(1.8, 0.5, 1.8).at(0, 0.25, 0).color(0xd8cfbe), Part.cyl(0.35, 0.6, 4.2, 4).rot(0, Math.PI / 4, 0).at(0, 2.6, 0).color(0xf2c14e), Part.cone(0.38, 0.8, 4).rot(0, Math.PI / 4, 0).at(0, 5.1, 0).color(0xfff1b8)]), 3, gold);
    add('m-giant-potato', build([
      Part.box(2.4, 0.5, 2.0).at(0, 0.25, 0).color(0x8a7f76),
      Part.ico(1.3, 1).jitter(0.25, 9).scale(0.9, 1.35, 0.85).at(0, 2.2, 0).color(0xc8a25a, 0.04),
      ...[[0.4, 2.6, 0.7], [-0.3, 1.8, 0.75], [0.6, 1.6, 0.6], [-0.5, 2.9, 0.55]].map(([x, y, z]) => Part.ico(0.1, 0).at(x, y, z).color(0x6b4a2e)),
      Part.cone(0.4, 0.5, 6).at(0, 3.85, 0).color(0x5fae3e),
    ]), 3);
    add('m-cloud-effigy', build([
      Part.box(0.2, 2.2, 0.2).at(-0.9, 1.1, 0).color(0x6b4a2e),
      Part.box(0.2, 2.2, 0.2).at(0.9, 1.1, 0).color(0x6b4a2e),
      Part.sphere(0.85, 8, 5).scale(1, 0.75, 0.55).at(0, 2.6, 0).color(0xc49a62),
      Part.sphere(0.65, 8, 5).scale(1, 0.75, 0.55).at(-0.8, 2.4, 0).color(0xb88d55),
      Part.sphere(0.7, 8, 5).scale(1, 0.75, 0.55).at(0.85, 2.45, 0).color(0xb88d55),
      Part.ico(0.09, 0).at(-0.25, 2.65, 0.45).color(0x1d2747),
      Part.ico(0.09, 0).at(0.25, 2.65, 0.45).color(0x1d2747),
      Part.box(0.36, 0.05, 0.05).rot(0, 0, 0.35).at(0, 2.35, 0.46).color(0x1d2747),
    ]), 3);
    add('m-sock-totem', build([
      Part.cyl(0.12, 0.14, 3.6, 6).at(0, 1.8, 0).color(0x6b4a2e),
      ...[0, 1, 2, 3].map((i) => Part.box(0.55, 0.7, 0.32).at(0, 0.8 + i * 0.75, 0.2).color([0x3aa0ff, 0xff6b8b, 0xf2c14e, 0x4fbf5a][i])),
      ...[0, 1, 2, 3].map((i) => Part.box(0.45, 0.25, 0.5).at(0, 0.55 + i * 0.75, 0.45).color([0x3aa0ff, 0xff6b8b, 0xf2c14e, 0x4fbf5a][i])),
    ]), 3);
    add('m-memorial-garden', build([
      ...Array.from({ length: 12 }, (_, i) => Part.ico(0.16, 0).at(Math.cos((i / 12) * Math.PI * 2) * 1.8, 0.2, Math.sin((i / 12) * Math.PI * 2) * 1.8).color([0xff6b8b, 0xffd23f, 0xffffff, 0xb388ff][i % 4])),
      ...Array.from({ length: 12 }, (_, i) => Part.box(0.06, 0.4, 0.06).at(Math.cos((i / 12) * Math.PI * 2 + 0.26) * 2.3, 0.2, Math.sin((i / 12) * Math.PI * 2 + 0.26) * 2.3).color(0xb08a60)),
      Part.cyl(0.08, 0.12, 1.0, 5).at(0, 0.5, 0).color(0x7a5232),
      Part.ico(0.55, 0).at(0, 1.3, 0).color(0x7bd66b),
      Part.cyl(1.4, 1.5, 0.08, 12).at(0, 0.04, 0).color(0x3b3430),
    ]), 3);
    add('m-out-of-office', build([Part.box(0.2, 3.0, 0.2).at(-1.7, 1.5, 0).color(0x6b4a2e), Part.box(0.2, 3.0, 0.2).at(1.7, 1.5, 0).color(0x6b4a2e)]), 2);
    // Village events.
    add('firepit', build([...Array.from({ length: 9 }, (_, i) => Part.dodeca(0.28).at(Math.cos((i / 9) * Math.PI * 2) * 1.1, 0.14, Math.sin((i / 9) * Math.PI * 2) * 1.1).color(0x8a8178)), Part.cyl(0.13, 0.13, 1.4, 6).rot(0, 0, Math.PI / 2).at(0, 0.2, 0).color(0x5a3a24), Part.cyl(0.13, 0.13, 1.4, 6).rot(0, Math.PI / 2, Math.PI / 2).at(0, 0.3, 0).color(0x5a3a24)]), 2);
    add('bigFlame', build([Part.cone(0.6, 1.8, 6).jitter(0.1, 3).at(0, 0.9, 0).color(0xff7a1f), Part.cone(0.38, 1.3, 5).at(0.1, 0.7, 0.05).color(0xffc23a), Part.cone(0.2, 0.8, 5).at(0, 0.5, 0.1).color(0xfff2a8)]), 2, this.flameMat, false);
    add('blanket', build([Part.box(2.0, 0.04, 1.5).at(0, 0.03, 0).color(0xffffff), ...[0, 1, 2, 3].map((i) => Part.box(0.5, 0.05, 1.5).at(-0.75 + i * 0.5, 0.04, 0).color(i % 2 ? 0xe63946 : 0xffffff))]), 6, std, false);
    add('basket', build([Part.cyl(0.3, 0.24, 0.3, 8).at(0, 0.15, 0).color(0xc49a62), Part.torus(0.25, 0.03, 4, 10).at(0, 0.38, 0).color(0x9b6a3e), Part.ico(0.1, 0).at(0.08, 0.33, 0).color(0xe63946)]), 6);
    add('pole', build([Part.cyl(0.06, 0.07, 3.4, 5).at(0, 1.7, 0).color(0x8a6a44), Part.ico(0.1, 0).at(0, 3.45, 0).color(0xf2c14e)]), 12);
    add('pennant', build([Part.cone(0.22, 0.45, 3).rot(Math.PI, 0, 0).at(0, -0.22, 0).color(0xffffff)]), 120, std, false);
    add('bench', build([Part.box(1.3, 0.1, 0.35).at(0, 0.45, 0).color(0x9b7650), Part.box(0.1, 0.45, 0.3).at(-0.55, 0.22, 0).color(0x6b4a2e), Part.box(0.1, 0.45, 0.3).at(0.55, 0.22, 0).color(0x6b4a2e)]), 12);
    add('office', build([
      Part.box(3.0, 0.3, 2.6).at(0, 0.15, 0).color(0x9e968c),
      Part.box(2.6, 2.0, 2.2).at(0, 1.3, 0).color(0xe8e0d0),
      Part.prism(3.0, 1.0, 2.6).at(0, 2.3, 0).color(0x3f78b5),
      Part.box(0.7, 1.2, 0.06).at(-0.6, 0.9, 1.11).color(0x6b4a2e),
      Part.box(0.6, 0.5, 0.06).at(0.6, 1.4, 1.11).color(0x7fc4ff),
      Part.cyl(0.05, 0.05, 1.0, 4).at(1.4, 2.8, 0.9).color(0x6b4a2e),
      Part.box(0.5, 0.3, 0.04).at(1.65, 3.15, 0.9).color(0xf2c14e),
    ]), 1);
    add('ash', new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2), 200, new THREE.MeshStandardMaterial({ color: 0x2b2420, transparent: true, opacity: 0.55, roughness: 1, depthWrite: false }), false);

    const signMat = new THREE.MeshStandardMaterial({ map: signTexture('OUT OF OFFICE', '#fffaf0', '#c0392b'), roughness: 0.8 });
    this.outOfOffice = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.35, 0.12), signMat);
    this.outOfOffice.castShadow = true;
    this.outOfOffice.visible = false;
    this.group.add(this.outOfOffice);
    const officeMat = new THREE.MeshStandardMaterial({ map: signTexture('MIRACLES', '#1d2747', '#f2c14e'), roughness: 0.8 });
    this.officeSign = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.6, 0.06), officeMat);
    this.officeSign.visible = false;
    this.group.add(this.officeSign);
    this.pickables.push(this.b.rock.mesh, this.b.shrine.mesh);
  }

  private h(x: number, z: number): number {
    return this.terrain.heightAt(x, z);
  }

  /** World position of the shrine/monument slots beside a sacred object. */
  slot(s: SacredObject, which: 'shrine' | 'monument'): { x: number; z: number } {
    if (s.kind === 'ground' || s.kind === 'crop') return which === 'shrine' ? { x: s.x + 2.6, z: s.z - 2.2 } : { x: s.x, z: s.z };
    const a = which === 'shrine' ? Math.PI * 0.25 : -Math.PI * 0.35;
    const r = which === 'shrine' ? 3.6 : 4.6;
    return { x: s.x + Math.cos(a) * r, z: s.z + Math.sin(a) * r };
  }

  update(state: GameStateData, elapsed: number, night: number, reducedMotion: boolean): void {
    const t = reducedMotion ? 0 : elapsed;
    const c = state.culture;
    const flipped = c.upsideDownUntil > state.time;
    for (const batch of Object.values(this.b)) batch.begin();
    const B = this.b;

    // Rocks: boulders, legs and eyes on walkers, crowns and banners on kings.
    for (const r of state.rocks) {
      const y = this.h(r.x, r.z);
      const bob = r.walking ? Math.abs(Math.sin(t * 6 + r.id)) * 0.12 : 0;
      const lift = r.walking ? 0.6 * r.scale : 0;
      B.rock.add(r.x, y + 0.25 * r.scale + lift + bob, r.z, r.walking ? r.heading : r.rot, r.scale, r.scale, r.scale);
      if (r.walking) {
        const sw = Math.sin(t * 6 + r.id) * 0.5;
        const cs = Math.cos(r.heading);
        const sn = Math.sin(r.heading);
        for (const side of [-1, 1]) {
          const ox = cs * 0.35 * side * r.scale;
          const oz = -sn * 0.35 * side * r.scale;
          B.leg.add(r.x + ox, y + 0.62 * r.scale + bob, r.z + oz, r.heading, r.scale, r.scale, r.scale, undefined, sw * side);
          B.eye.add(r.x + ox * 0.7 + sn * 0.75 * r.scale, y + 0.95 * r.scale + bob, r.z + oz * 0.7 + cs * 0.75 * r.scale, r.heading, r.scale);
        }
      }
      if (r.crowned) {
        const top = y + 0.25 * r.scale + lift + bob + 0.62 * r.scale;
        const s = 1 + r.hatTier * 0.18;
        B.crown.add(r.x, top, r.z, t * 0.3, s, flipped ? -s : s, s);
        if (r.hatTier >= 1) B.plume.add(r.x, top + 0.45 * s, r.z, t * 0.3, s);
        B.banner.add(r.x + 2.0, this.h(r.x + 2, r.z + 1.2), r.z + 1.2, 0.5, 1, flipped ? -1 : 1, 1, 0x8a6cff, flipped ? Math.PI : 0);
      }
    }

    // Sacred objects: aura, decorations, shrine, monument.
    let outOfOffice = false;
    for (const s of state.sacred) {
      const religion = s.religionId ? state.religions.find((r) => r.id === s.religionId) : undefined;
      const color = religion?.color ?? 0xf2c14e;
      const gy = this.h(s.x, s.z);
      if (s.stage >= 2) {
        B.aura.add(s.x, gy + 0.08, s.z, 0, 1 + Math.sin(t * 1.5 + s.createdAt) * 0.04, 1, 1 + Math.sin(t * 1.5 + s.createdAt) * 0.04, color);
      }
      for (let i = 0; i < s.decorations; i++) {
        const kind = DECOR_KINDS[i % DECOR_KINDS.length];
        const a = i * 0.83 + hashUnit(s.createdAt + i) * 0.4;
        const r = 2.0 + (i % 2) * 0.5;
        const x = s.x + Math.cos(a) * r;
        const z = s.z + Math.sin(a) * r;
        const y = this.h(x, z);
        const face = Math.atan2(s.x - x, s.z - z);
        const sy = flipped ? -1 : 1;
        const yy = flipped ? y + (kind === 'flag' || kind === 'ribbon' || kind === 'sign' ? 1.4 : 0.6) : y;
        const tint = kind === 'flag' || kind === 'ribbon' ? color : undefined;
        B[kind].add(x, yy, z, face, 1, sy, 1, tint, flipped ? 0 : 0);
        if (kind === 'candle') B.candleFlame.add(x, yy, z, 0, 1, sy * (0.8 + Math.sin(t * 12 + i) * 0.2), 1);
      }
      if (s.stage >= 4) {
        const p = this.slot(s, 'shrine');
        const y = this.h(p.x, p.z);
        const face = Math.atan2(s.x - p.x, s.z - p.z);
        if (s.shrineProgress >= 1) B.shrine.add(p.x, y, p.z, face, 1, 1, 1);
        else {
          B.scaffold.add(p.x, y, p.z, face);
          B.logs.add(p.x + 1.8, y, p.z, face + 0.5);
          if (s.shrineProgress > 0) B.shrine.add(p.x, y, p.z, face, 1, Math.max(0.05, s.shrineProgress), 1);
        }
      }
      if (s.stage >= 5) {
        const p = this.slot(s, 'monument');
        const y = this.h(p.x, p.z);
        const face = Math.atan2(s.x - p.x, s.z - p.z) + (s.kind === 'ground' ? 0 : 0);
        const key = `m-${s.monument}`;
        const prog = s.monumentProgress;
        if (s.monument === 'out-of-office') outOfOffice = prog > 0.05;
        if (prog < 1) {
          B.scaffold.add(p.x, y, p.z, face, 1.2, 1.3, 1.2);
          B.logs.add(p.x - 2.2, y, p.z + 1, face);
        }
        if (prog > 0.02 && B[key]) {
          const sy = Math.max(0.05, prog) * (flipped ? -1 : 1);
          const tint = s.monument === 'obelisk' ? color : undefined;
          B[key].add(p.x, flipped ? y + 5 * Math.max(0.05, prog) : y, p.z, face, 1, sy, 1, tint);
        }
        if (s.monument === 'out-of-office') {
          const sign = this.outOfOffice;
          sign.position.set(p.x, y + 2.3 * Math.max(0.05, prog), p.z);
          sign.rotation.set(flipped ? Math.PI : 0, face, 0);
          sign.scale.set(1, Math.max(0.05, prog), 1);
        }
      }
    }
    this.outOfOffice.visible = outOfOffice;

    // Fire Appreciation Society: the pit always, flames at night or during its ritual.
    if (c.firePit) {
      const y = this.h(c.firePit.x, c.firePit.z);
      B.firepit.add(c.firePit.x, y, c.firePit.z);
      const fireRitual = state.religions.some((r) => r.active && r.archetype === 'fire' && r.rituals.some((ri) => ri.activeUntil > state.time));
      if (night > 0.3 || fireRitual) {
        const f = 0.85 + Math.sin(t * 13) * 0.12;
        B.bigFlame.add(c.firePit.x, y + 0.15, c.firePit.z, t * 2, f, f * 1.1, f);
      }
    }

    // The Eternal Picnic.
    if (c.picnicSpot && c.picnicUntil > state.time) {
      const p = c.picnicSpot;
      for (let i = 0; i < 4; i++) {
        const a = i * 1.57 + 0.4;
        const x = p.x + Math.cos(a) * 2.4;
        const z = p.z + Math.sin(a) * 2.4;
        B.blanket.add(x, this.h(x, z), z, a);
        B.basket.add(x + 0.4, this.h(x, z) + 0.05, z + 0.3, a);
      }
    }

    // Festival bunting around the plaza.
    const v0 = state.villages[0];
    if (c.festivalUntil > state.time && v0) {
      const n = 6;
      const R = 9;
      const tops: THREE.Vector3[] = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const x = v0.centerX + Math.cos(a) * R;
        const z = v0.centerZ + Math.sin(a) * R;
        const y = this.h(x, z);
        B.pole.add(x, y, z);
        tops.push(new THREE.Vector3(x, y + 3.3, z));
      }
      const colors = [0x3aa0ff, 0xff6b8b, 0xf2c14e, 0x4fbf5a, 0xffffff];
      for (let i = 0; i < n; i++) {
        const a = tops[i];
        const b = tops[(i + 1) % n];
        for (let k = 1; k < 8; k++) {
          const f = k / 8;
          const sag = Math.sin(f * Math.PI) * 0.8;
          const x = a.x + (b.x - a.x) * f;
          const z = a.z + (b.z - a.z) * f;
          const y = a.y + (b.y - a.y) * f - sag;
          B.pennant.add(x, y, z, Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2, 1, flipped ? -1 : 1, 1, colors[(i * 8 + k) % colors.length], Math.sin(t * 3 + k) * 0.2);
        }
      }
    }

    // The Cloud Trial: a ring of benches around the wooden defendant.
    if (c.trial) {
      B['m-cloud-effigy'].add(c.trial.x, this.h(c.trial.x, c.trial.z), c.trial.z, 0.4);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const x = c.trial.x + Math.cos(a) * 6.3;
        const z = c.trial.z + Math.sin(a) * 6.3;
        B.bench.add(x, this.h(x, z), z, -a + Math.PI / 2);
      }
    }

    // The Department of Miracles.
    if (c.officeBuilt) {
      const site = officeSite({ state } as never);
      const y = this.h(site.x, site.z);
      if (c.officeProgress < 1) {
        B.scaffold.add(site.x, y, site.z, 0, 1.3, 1.2, 1.3);
        B.logs.add(site.x + 2.4, y, site.z, 0.3);
      }
      if (c.officeProgress > 0.02) B.office.add(site.x, y, site.z, 0, 1, Math.max(0.05, c.officeProgress), 1);
      this.officeSign.visible = c.officeProgress >= 1;
      this.officeSign.position.set(site.x, y + 1.1, site.z + 1.4);
    } else this.officeSign.visible = false;

    // Ash beneath charred trees: the burned forest stays visibly scarred.
    for (const tree of state.trees) {
      if (!tree.charred) continue;
      const s = 1.3 + hashUnit(tree.id) * 0.8;
      B.ash.add(tree.x, this.h(tree.x, tree.z) + 0.05, tree.z, tree.rot, s, 1, s);
    }

    for (const batch of Object.values(this.b)) batch.end();
  }
}
