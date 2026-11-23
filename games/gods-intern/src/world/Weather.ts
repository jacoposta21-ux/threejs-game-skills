import * as THREE from 'three';
import type { CloudData } from '../core/types';
import type { ParticleSystem } from '../effects/ParticleSystem';
import { build, flatMaterial, hashUnit, Part } from '../render/ModelKit';
import type { TerrainData } from './TerrainGen';

const MAX_RAIN_CLOUDS = 6;
const DROPS_PER_CLOUD = 260;

function cloudGeometry(seed: number, dark: boolean): THREE.BufferGeometry {
  const parts: Part[] = [];
  const top = dark ? 0xc9ced8 : 0xffffff;
  const bottom = dark ? 0x7d8596 : 0xe6eef7;
  const blobs = 7;
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * Math.PI * 2 + hashUnit(seed + i) * 0.6;
    const r = 2.2 + hashUnit(seed * 3 + i) * 2.4;
    const s = 2.0 + hashUnit(seed * 7 + i) * 1.6;
    parts.push(Part.ico(s, 1).jitter(0.35, seed + i).scale(1, 0.72, 1).at(Math.cos(a) * r, hashUnit(seed + i * 5) * 0.8, Math.sin(a) * r).color(i % 2 ? top : bottom, 0.03));
  }
  parts.push(Part.ico(3.2, 1).jitter(0.4, seed).scale(1.2, 0.8, 1.2).at(0, 1.0, 0).color(top, 0.02));
  parts.push(Part.ico(2.8, 1).scale(1.4, 0.35, 1.4).at(0, -0.9, 0).color(bottom, 0.02));
  return build(parts);
}

/** Rain clouds (one per active rain power) and drifting decorative sky clouds. */
export class Weather {
  readonly group = new THREE.Group();
  private readonly rainClouds: THREE.Mesh[] = [];
  private readonly rainMat: THREE.MeshStandardMaterial;
  private readonly drops: THREE.InstancedMesh;
  private readonly dropState: Float32Array; // per drop: x, y, z, speed
  private readonly skyClouds: Array<{ mesh: THREE.Mesh; speed: number; z: number; y: number }> = [];
  private readonly dummy = new THREE.Object3D();
  private splashBudget = 0;
  density = 1;

  constructor() {
    this.rainMat = flatMaterial({ transparent: true, opacity: 0.94, roughness: 1 });
    const darkGeo = cloudGeometry(3, true);
    for (let i = 0; i < MAX_RAIN_CLOUDS; i++) {
      const mesh = new THREE.Mesh(darkGeo, this.rainMat);
      mesh.visible = false;
      mesh.castShadow = false;
      this.rainClouds.push(mesh);
      this.group.add(mesh);
    }
    const dropGeo = new THREE.BoxGeometry(0.05, 0.7, 0.05);
    const dropMat = new THREE.MeshBasicMaterial({ color: 0xb9e2ff, transparent: true, opacity: 0.65, depthWrite: false });
    this.drops = new THREE.InstancedMesh(dropGeo, dropMat, MAX_RAIN_CLOUDS * DROPS_PER_CLOUD);
    this.drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.drops.frustumCulled = false;
    this.drops.count = 0;
    this.dropState = new Float32Array(MAX_RAIN_CLOUDS * DROPS_PER_CLOUD * 4);
    this.group.add(this.drops);

    const skyMat = flatMaterial({ transparent: true, opacity: 0.92, roughness: 1, emissive: 0x33404f, emissiveIntensity: 0.25 });
    for (let i = 0; i < 9; i++) {
      const mesh = new THREE.Mesh(cloudGeometry(20 + i * 7, false), skyMat);
      const s = 1.4 + hashUnit(i * 13) * 1.4;
      mesh.scale.set(s, s * 0.8, s);
      const z = -110 + i * 26 + hashUnit(i) * 10;
      const y = 48 + hashUnit(i * 5) * 16;
      mesh.position.set(-160 + hashUnit(i * 3) * 320, y, z);
      this.skyClouds.push({ mesh, speed: 1.2 + hashUnit(i * 11) * 1.5, z, y });
      this.group.add(mesh);
    }
  }

  update(clouds: CloudData[], terrain: TerrainData, dt: number, elapsed: number, splashes: ParticleSystem, night: number): void {
    // Rain clouds follow logical clouds.
    let dropCount = 0;
    this.splashBudget = Math.min(60, this.splashBudget + dt * 90 * this.density);
    for (let i = 0; i < MAX_RAIN_CLOUDS; i++) {
      const mesh = this.rainClouds[i];
      const c = clouds[i];
      if (!c) {
        mesh.visible = false;
        continue;
      }
      const age = c.duration - c.timeLeft;
      const appear = Math.min(1, age / 0.8);
      const vanish = Math.min(1, c.timeLeft / 1.0);
      const life = Math.min(appear, vanish);
      const ease = 1 - Math.pow(1 - life, 3);
      const ground = Math.max(terrain.surfaceAt(c.x, c.z), 0);
      const cloudY = ground + 16.5;
      mesh.visible = true;
      mesh.position.set(c.x + Math.sin(elapsed * 0.6 + i) * 0.4, cloudY + Math.sin(elapsed * 1.1 + i) * 0.25, c.z);
      const s = (c.radius / 9.5) * (0.4 + 0.6 * ease);
      mesh.scale.set(s, s * 0.75, s);
      mesh.rotation.y = elapsed * 0.05 + i;
      this.rainMat.opacity = 0.82;

      // Drops
      const n = Math.floor(DROPS_PER_CLOUD * Math.min(1, life * 1.4) * this.density);
      for (let d = 0; d < n; d++) {
        const idx = (i * DROPS_PER_CLOUD + d) * 4;
        let x = this.dropState[idx];
        let y = this.dropState[idx + 1];
        let z = this.dropState[idx + 2];
        let speed = this.dropState[idx + 3];
        const outOfDisc = Math.hypot(x - c.x, z - c.z) > c.radius;
        if (speed === 0 || outOfDisc) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * c.radius * 0.9;
          x = c.x + Math.cos(a) * r;
          z = c.z + Math.sin(a) * r;
          y = cloudY - Math.random() * 14;
          speed = 20 + Math.random() * 8;
        }
        y -= speed * dt;
        const g = terrain.surfaceAt(x, z);
        if (y < g) {
          if (this.splashBudget > 1 && Math.random() < 0.35) {
            this.splashBudget--;
            splashes.emit({ x, y: g + 0.05, z, vy: 2.2, spread: 0.3, life: 0.35, size: 0.35, sizeEnd: 0.15, color: 0xe6f6ff, alpha: 0.9, gravity: 9 }, 2);
          }
          const a = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * c.radius * 0.9;
          x = c.x + Math.cos(a) * r;
          z = c.z + Math.sin(a) * r;
          y = cloudY - 1 - Math.random() * 2;
        }
        this.dropState[idx] = x;
        this.dropState[idx + 1] = y;
        this.dropState[idx + 2] = z;
        this.dropState[idx + 3] = speed;
        this.dummy.position.set(x, y, z);
        this.dummy.rotation.set(0.08, 0, 0.05);
        this.dummy.scale.set(1, 1, 1);
        this.dummy.updateMatrix();
        this.drops.setMatrixAt(dropCount++, this.dummy.matrix);
      }
    }
    // Reset state for idle cloud slots so the next cloud starts clean.
    for (let i = clouds.length; i < MAX_RAIN_CLOUDS; i++) {
      const base = i * DROPS_PER_CLOUD * 4;
      if (this.dropState[base + 3] !== 0) this.dropState.fill(0, base, base + DROPS_PER_CLOUD * 4);
    }
    this.drops.count = dropCount;
    this.drops.instanceMatrix.needsUpdate = true;

    for (const sc of this.skyClouds) {
      sc.mesh.position.x += sc.speed * dt;
      if (sc.mesh.position.x > 170) sc.mesh.position.x = -170;
      (sc.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.25 + night * 0.3;
    }
  }
}
