import * as THREE from 'three';
import { mergeColored } from '../world/geometry.js';
import { lakeDistance, terrainHeight, PLAZA, LAKE, OASIS, FARM } from '../world/layout.js';
import { clamp } from '../core/rng.js';

/**
 * Ambient wildlife drawn with two InstancedMeshes (one draw call each):
 * - birds: flocks circling over the village, the lake, the farm and the desert,
 *   plus pigeons on the town square that burst into the air when you get close;
 * - fish: silver fish that leap out of the Sea of Galilee near the player.
 * Wings flap in the vertex shader (per-instance flap amount).
 */
const FLOCKS = [
  { x: PLAZA.x + 6, z: PLAZA.z - 10, r: 22, h: 24, speed: 0.22, n: 7, color: '#efe8dc' },
  { x: LAKE.x - 20, z: LAKE.z - 10, r: 40, h: 16, speed: 0.15, n: 9, color: '#f4f4f0' },
  { x: FARM.x, z: FARM.z, r: 26, h: 20, speed: 0.2, n: 6, color: '#3a3430' },
  { x: OASIS.x - 20, z: OASIS.z - 6, r: 34, h: 38, speed: 0.1, n: 3, color: '#5a4030', kite: true },
];
const PIGEONS = 8;
const FISH = 6;
const tmp = new THREE.Object3D();

function birdGeometry() {
  return mergeColored([
    { geometry: new THREE.BoxGeometry(0.14, 0.12, 0.42), color: '#ffffff', t: {} },
    { geometry: new THREE.BoxGeometry(0.1, 0.1, 0.14), color: '#ffffff', t: { y: 0.06, z: 0.24 } },
    { geometry: new THREE.ConeGeometry(0.03, 0.08, 4), color: '#e0a030', t: { y: 0.05, z: 0.34, rx: Math.PI / 2 } },
    { geometry: new THREE.BoxGeometry(0.62, 0.02, 0.2), color: '#ffffff', t: { x: 0.37, y: 0.03, z: 0.02 } },
    { geometry: new THREE.BoxGeometry(0.62, 0.02, 0.2), color: '#ffffff', t: { x: -0.37, y: 0.03, z: 0.02 } },
    { geometry: new THREE.BoxGeometry(0.16, 0.02, 0.16), color: '#ffffff', t: { y: 0.02, z: -0.26 } },
  ]);
}

function fishGeometry() {
  return mergeColored([
    { geometry: new THREE.SphereGeometry(0.16, 8, 6), color: '#b8c6cc', t: { sz: 2.4, sy: 0.9, sx: 0.6 } },
    { geometry: new THREE.BoxGeometry(0.02, 0.22, 0.16), color: '#8fa2aa', t: { z: -0.42 } },
    { geometry: new THREE.BoxGeometry(0.02, 0.08, 0.16), color: '#8fa2aa', t: { y: 0.14, z: 0.02 } },
  ]);
}

export class Wildlife {
  constructor(scene, rng, bus) {
    this.scene = scene;
    this.rng = rng;
    this.bus = bus;
    this.time = 0;
    this.uniforms = { uTime: { value: 0 } };
    this.camera = new THREE.Vector3();
  }

  build() {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
    const u = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = u.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aFlap;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float wing = step(0.09, abs(transformed.x));
          float flap = sin(uTime * (10.0 + aFlap * 6.0) + float(gl_InstanceID) * 1.7);
          transformed.y += wing * flap * abs(transformed.x) * 0.9 * min(aFlap, 1.0);`,
        );
    };
    this.birds = [];
    for (const f of FLOCKS) {
      for (let i = 0; i < f.n; i += 1) {
        this.birds.push({ flock: f, off: (i / f.n) * Math.PI * 2 * (f.kite ? 1 : 0.35) + this.rng() * 0.3, hOff: this.rng.range(-2, 2), rOff: this.rng.range(-3, 3), color: f.color, s: f.kite ? 2.2 : 1 });
      }
    }
    // town-square pigeons: on the ground until startled
    for (let i = 0; i < PIGEONS; i += 1) {
      const a = this.rng() * Math.PI * 2;
      const r = this.rng.range(4, 10);
      const x = PLAZA.x + Math.cos(a) * r;
      const z = PLAZA.z + Math.sin(a) * r;
      this.birds.push({ pigeon: true, home: { x, z }, x, y: terrainHeight(x, z), z, yaw: this.rng() * 6, state: 'ground', t: this.rng() * 3, color: i % 3 ? '#9aa0a8' : '#c8ccd2', s: 0.85 });
    }
    const geo = birdGeometry();
    this.flap = new Float32Array(this.birds.length);
    geo.setAttribute('aFlap', new THREE.InstancedBufferAttribute(this.flap, 1));
    this.birdMesh = new THREE.InstancedMesh(geo, mat, this.birds.length);
    this.birdMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.birdMesh.frustumCulled = false;
    this.birdMesh.castShadow = false;
    this.birdMesh.name = 'birds';
    const c = new THREE.Color();
    this.birds.forEach((b, i) => this.birdMesh.setColorAt(i, c.set(b.color)));
    this.scene.add(this.birdMesh);

    const fishMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.4 });
    this.fishMesh = new THREE.InstancedMesh(fishGeometry(), fishMat, FISH);
    this.fishMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.fishMesh.frustumCulled = false;
    this.fishMesh.name = 'fish';
    this.scene.add(this.fishMesh);
    this.fish = Array.from({ length: FISH }, () => ({ t: -1, x: 0, z: 0, dx: 0, dz: 0, dur: 1, h: 1 }));
    this.fishTimer = 1;
    this.jumps = 0;
  }

  setCamera(pos) {
    this.camera.copy(pos);
  }

  update(dt, player) {
    this.time += dt;
    this.uniforms.uTime.value = this.time;
    const t = this.time;
    // ---- birds
    this.birds.forEach((b, i) => {
      if (b.pigeon) {
        const d = Math.hypot(b.x - player.x, b.z - player.z);
        if (b.state === 'ground') {
          b.t -= dt;
          if (b.t <= 0) { b.t = this.rng.range(0.6, 2.5); b.yaw += this.rng.range(-1.2, 1.2); b.hop = 0.25; }
          b.hop = Math.max(0, (b.hop || 0) - dt);
          if (b.hop > 0) { b.x += Math.sin(b.yaw) * dt * 0.8; b.z += Math.cos(b.yaw) * dt * 0.8; }
          b.y = terrainHeight(b.x, b.z) + 0.06 + (b.hop > 0 ? Math.sin(b.hop * 12) * 0.04 : 0);
          this.flap[i] = 0;
          if (d < (player.speed > 5 ? 7 : 4.5)) {
            b.state = 'fly';
            b.t = this.rng.range(9, 15);
            b.ang = Math.atan2(b.z - PLAZA.z, b.x - PLAZA.x);
            b.vy = 5;
            if (i === this.birds.length - PIGEONS || this.rng() < 0.3) this.bus.emit('animal:flee', { entityId: `animal.pigeon.${i}`, kind: 'bird', x: b.x, z: b.z });
          }
        } else {
          b.t -= dt;
          b.ang += dt * 0.6;
          const tx = PLAZA.x + Math.cos(b.ang) * 9;
          const tz = PLAZA.z + Math.sin(b.ang) * 9;
          const landing = b.t <= 0 && d > 8;
          const ty = landing ? terrainHeight(b.home.x, b.home.z) + 0.06 : 9 + Math.sin(b.ang * 2 + i) * 1.5;
          const gx = landing ? b.home.x : tx;
          const gz = landing ? b.home.z : tz;
          const k = Math.min(1, dt * 2.2);
          const px = b.x;
          const pz = b.z;
          b.x += (gx - b.x) * k;
          b.z += (gz - b.z) * k;
          b.y += (ty - b.y) * Math.min(1, dt * 1.6);
          if (Math.hypot(b.x - px, b.z - pz) > 0.001) b.yaw = Math.atan2(b.x - px, b.z - pz);
          this.flap[i] = 1.4;
          if (landing && Math.abs(b.y - ty) < 0.2 && Math.hypot(b.x - gx, b.z - gz) < 0.3) b.state = 'ground';
        }
        tmp.position.set(b.x, b.y, b.z);
        tmp.rotation.set(0, b.yaw, 0);
      } else {
        const f = b.flock;
        const a = t * f.speed + b.off;
        const r = f.r + b.rOff;
        const x = f.x + Math.cos(a) * r;
        const z = f.z + Math.sin(a) * r;
        const y = terrainHeight(f.x, f.z) + f.h + b.hOff + Math.sin(t * 0.8 + b.off * 3) * 1.2;
        // heading: tangent of the circle
        tmp.position.set(x, y, z);
        tmp.rotation.set(0, Math.atan2(-Math.sin(a), Math.cos(a)), Math.sin(t + b.off) * 0.25);
        // kites glide, others flap in bursts
        this.flap[i] = f.kite ? 0.15 : Math.sin(t * 0.7 + b.off * 5) > -0.2 ? 1 : 0.1;
      }
      tmp.scale.setScalar(b.s);
      tmp.updateMatrix();
      this.birdMesh.setMatrixAt(i, tmp.matrix);
    });
    this.birdMesh.instanceMatrix.needsUpdate = true;
    this.birdMesh.geometry.attributes.aFlap.needsUpdate = true;

    // ---- leaping fish near the player when the lake is close
    const nearLake = lakeDistance(player.x, player.z) < 1.7;
    this.fishTimer -= dt;
    if (nearLake && this.fishTimer <= 0) {
      this.fishTimer = this.rng.range(0.8, 2.4);
      const slot = this.fish.find((f) => f.t < 0);
      if (slot) {
        for (let tries = 0; tries < 8; tries += 1) {
          const a = this.rng() * Math.PI * 2;
          const r = this.rng.range(8, 45);
          const x = player.x + Math.cos(a) * r;
          const z = player.z + Math.sin(a) * r;
          if (lakeDistance(x, z) > 0.85 || terrainHeight(x, z) > -1.2) continue;
          const dir = this.rng() * Math.PI * 2;
          Object.assign(slot, { t: 0, x, z, dx: Math.sin(dir), dz: Math.cos(dir), dur: this.rng.range(0.8, 1.2), h: this.rng.range(0.8, 1.6), len: this.rng.range(1.4, 2.6), yaw: dir });
          this.jumps += 1;
          this.bus.emit('fish:jump', { x, z });
          break;
        }
      }
    }
    this.fish.forEach((f, i) => {
      if (f.t < 0) {
        tmp.position.set(0, -50, 0);
        tmp.scale.setScalar(0.001);
      } else {
        f.t += dt;
        const u = f.t / f.dur;
        if (u >= 1) {
          f.t = -1;
          this.bus.emit('fish:jump', { x: f.x + f.dx * f.len, z: f.z + f.dz * f.len, splash: true });
          tmp.position.set(0, -50, 0);
          tmp.scale.setScalar(0.001);
        } else {
          const y = Math.sin(u * Math.PI) * f.h - 0.1;
          tmp.position.set(f.x + f.dx * f.len * u, y, f.z + f.dz * f.len * u);
          tmp.rotation.set(-Math.cos(u * Math.PI) * 0.9, f.yaw, 0, 'YXZ');
          tmp.scale.setScalar(1.3);
        }
      }
      tmp.updateMatrix();
      this.fishMesh.setMatrixAt(i, tmp.matrix);
      tmp.rotation.set(0, 0, 0, 'XYZ');
    });
    this.fishMesh.instanceMatrix.needsUpdate = true;
    this.birdMesh.visible = true;
    this.fishMesh.visible = nearLake;
  }

  stats() {
    return {
      birds: this.birds.length,
      pigeonsFlying: this.birds.filter((b) => b.pigeon && b.state === 'fly').length,
      fishJumps: this.jumps,
    };
  }
}

export { clamp };
