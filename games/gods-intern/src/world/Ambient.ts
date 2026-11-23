import * as THREE from 'three';
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

  constructor(terrain: TerrainData, villageCenter: { x: number; z: number }) {
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
      const cx = nearVillage ? villageCenter.x : 0;
      const cz = nearVillage ? villageCenter.z : 0;
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
