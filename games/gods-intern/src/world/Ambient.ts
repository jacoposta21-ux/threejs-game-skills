import * as THREE from 'three';
import { WATER_NONE } from './TerrainGen';
import { hashUnit } from '../render/ModelKit';
import type { TerrainData } from './TerrainGen';

const BIRDS = 12;
const FIREFLIES = 140;

/** Ambient life: bird flocks circling the island by day and fireflies at night. */
export class Ambient {
  readonly group = new THREE.Group();
  private readonly birds: THREE.InstancedMesh;
  private readonly flies: THREE.Points;
  private readonly flyBase: Float32Array;
  private readonly flyPos: Float32Array;
  private readonly dummy = new THREE.Object3D();

  private readonly pollen: THREE.Points;
  private readonly pollenBase: Float32Array;
  private readonly pollenPos: Float32Array;
  private readonly mist: THREE.InstancedMesh;
  private readonly mistBase: Array<[number, number, number]> = [];

  constructor(terrain: TerrainData, villageCenter: { x: number; z: number } | Array<{ x: number; z: number }>) {
    const centers = Array.isArray(villageCenter) ? villageCenter : [villageCenter];
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0.25, -0.9, 0.15, -0.15, 0, 0, -0.2, 0, 0, 0.25, 0, 0, -0.2, 0.9, 0.15, -0.15], 3),
    );
    g.computeVertexNormals();
    this.birds = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0x2b3145, side: THREE.DoubleSide }), BIRDS);
    this.birds.frustumCulled = false;
    this.group.add(this.birds);

    this.flyBase = new Float32Array(FIREFLIES * 3);
    this.flyPos = new Float32Array(FIREFLIES * 3);
    for (let i = 0; i < FIREFLIES; i++) {
      const nearVillage = i < FIREFLIES * 0.45;
      const a = hashUnit(i * 3) * Math.PI * 2;
      const r = nearVillage ? 6 + hashUnit(i * 7) * 22 : 10 + hashUnit(i * 7) * 50;
      const home = centers[i % centers.length];
      const cx = nearVillage ? home.x : 0;
      const cz = nearVillage ? home.z : 0;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      this.flyBase[i * 3] = x;
      this.flyBase[i * 3 + 1] = Math.max(0.4, terrain.heightAt(x, z)) + 0.6 + hashUnit(i * 11) * 1.8;
      this.flyBase[i * 3 + 2] = z;
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(this.flyPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.flies = new THREE.Points(
      fg,
      new THREE.PointsMaterial({ color: 0xe9ff8a, size: 0.45, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.flies.frustumCulled = false;
    this.group.add(this.flies);

    // v0.4: drifting pollen by day over the meadows around each village.
    const P = 260;
    this.pollenBase = new Float32Array(P * 3);
    this.pollenPos = new Float32Array(P * 3);
    for (let i = 0; i < P; i++) {
      const c = centers[i % centers.length];
      const a = hashUnit(i * 13 + 5) * Math.PI * 2;
      const r = 4 + hashUnit(i * 17 + 3) * 30;
      const x = c.x + Math.cos(a) * r;
      const z = c.z + Math.sin(a) * r;
      this.pollenBase[i * 3] = x;
      this.pollenBase[i * 3 + 1] = Math.max(0.4, terrain.heightAt(x, z)) + 0.8 + hashUnit(i * 23) * 3;
      this.pollenBase[i * 3 + 2] = z;
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(this.pollenPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.pollen = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xfff6c8, size: 0.18, transparent: true, opacity: 0.8, depthWrite: false }));
    this.pollen.frustumCulled = false;
    this.group.add(this.pollen);

    // v0.4: low mist banks over the lake and river, visible at dawn, dusk and night.
    const spots: Array<[number, number]> = [];
    for (let i = 0; i < 900 && spots.length < 40; i++) {
      const x = (hashUnit(i * 31 + 7) - 0.5) * 130;
      const z = (hashUnit(i * 37 + 11) - 0.5) * 130;
      if (terrain.waterAt(x, z) !== WATER_NONE && terrain.heightAt(x, z) > -3 && Math.hypot(x, z) < 60) spots.push([x, z]);
    }
    const mg = new THREE.PlaneGeometry(9, 9);
    mg.rotateX(-Math.PI / 2);
    const mc = document.createElement('canvas');
    mc.width = mc.height = 64;
    const ctx = mc.getContext('2d')!;
    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(mc);
    this.mist = new THREE.InstancedMesh(mg, new THREE.MeshBasicMaterial({ map: tex, color: 0xe8f0ff, transparent: true, opacity: 0, depthWrite: false }), Math.max(1, spots.length));
    this.mist.count = spots.length;
    spots.forEach(([x, z], i) => this.mistBase.push([x, 1.1 + hashUnit(i) * 0.6, z]));
    this.mist.frustumCulled = false;
    this.group.add(this.mist);
  }

  update(elapsed: number, night: number, reducedMotion: boolean): void {
    const t = reducedMotion ? 0 : elapsed;
    for (let i = 0; i < BIRDS; i++) {
      const flock = i < BIRDS / 2 ? 0 : 1;
      const k = i % (BIRDS / 2);
      const speed = flock ? 0.09 : -0.07;
      const a = t * speed + flock * 2.4 + k * 0.05;
      const r = flock ? 46 : 32;
      const cx = flock ? 10 : -20;
      const cz = flock ? -5 : 10;
      const off = [0, 1, -1, 2, -2, 3][k];
      const x = cx + Math.cos(a) * (r + off * 1.2) - Math.abs(off) * Math.cos(a + Math.PI / 2) * 1.4;
      const z = cz + Math.sin(a) * (r + off * 1.2) - Math.abs(off) * Math.sin(a + Math.PI / 2) * 1.4;
      this.dummy.position.set(x, 30 + flock * 6 + Math.sin(t * 0.7 + i) * 1.5, z);
      this.dummy.rotation.set(0, -a + (speed > 0 ? 0 : Math.PI), 0);
      const flap = 0.35 + Math.abs(Math.sin(t * 8 + i * 1.7)) * 0.9;
      this.dummy.scale.set(1.3, flap * 1.3, 1.3);
      this.dummy.updateMatrix();
      this.birds.setMatrixAt(i, this.dummy.matrix);
    }
    this.birds.instanceMatrix.needsUpdate = true;
    this.birds.visible = night < 0.7;

    // Pollen drifts with the wind by day.
    const pm = this.pollen.material as THREE.PointsMaterial;
    pm.opacity = Math.max(0, 0.75 - night * 1.2);
    this.pollen.visible = pm.opacity > 0.02;
    if (this.pollen.visible) {
      for (let i = 0; i < this.pollenBase.length / 3; i++) {
        const p = i * 3;
        this.pollenPos[p] = this.pollenBase[p] + Math.sin(t * 0.25 + i) * 2.5 + ((t * 0.4 + i * 0.37) % 6) - 3;
        this.pollenPos[p + 1] = this.pollenBase[p + 1] + Math.sin(t * 0.9 + i * 1.7) * 0.6;
        this.pollenPos[p + 2] = this.pollenBase[p + 2] + Math.cos(t * 0.2 + i * 0.6) * 2.5;
      }
      this.pollen.geometry.getAttribute('position').needsUpdate = true;
    }
    // Mist: strongest at night and around sunrise.
    const mm = this.mist.material as THREE.MeshBasicMaterial;
    mm.opacity = 0.08 + night * 0.22;
    this.mistBase.forEach(([x, y, z], i) => {
      this.dummy.position.set(x + Math.sin(t * 0.05 + i) * 2, y, z + Math.cos(t * 0.04 + i) * 2);
      this.dummy.rotation.set(0, i, 0);
      this.dummy.scale.setScalar(1 + 0.15 * Math.sin(t * 0.2 + i));
      this.dummy.updateMatrix();
      this.mist.setMatrixAt(i, this.dummy.matrix);
    });
    this.mist.instanceMatrix.needsUpdate = true;

    const mat = this.flies.material as THREE.PointsMaterial;
    mat.opacity = Math.max(0, night - 0.2) * 1.1;
    this.flies.visible = mat.opacity > 0.01;
    if (this.flies.visible) {
      for (let i = 0; i < FIREFLIES; i++) {
        const p = i * 3;
        this.flyPos[p] = this.flyBase[p] + Math.sin(t * 0.6 + i) * 1.2;
        this.flyPos[p + 1] = this.flyBase[p + 1] + Math.sin(t * 1.3 + i * 2.1) * 0.5;
        this.flyPos[p + 2] = this.flyBase[p + 2] + Math.cos(t * 0.5 + i * 0.7) * 1.2;
      }
      this.flies.geometry.getAttribute('position').needsUpdate = true;
    }
  }
}
