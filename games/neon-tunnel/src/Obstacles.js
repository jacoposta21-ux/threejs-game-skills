import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GEN, TUNNEL } from './Config.js';
import { BLOCK_COUNT, BLOCK_STEP, rotationAt } from './ObstacleModel.js';

// Obstacle rendering. Every obstacle family is drawn with a handful of shared
// InstancedMeshes (one draw call per part type, regardless of how many
// obstacles are alive). Logical obstacle data comes from the generator; the
// instance matrices are rebuilt each frame from tunnel distance and rotation.

const R = TUNNEL.radius;

function hdr(r, g, b) {
  return new THREE.Color(r, g, b);
}

function sectorShape(rIn, rOut, halfAngle, segments = 3) {
  const shape = new THREE.Shape();
  for (let i = 0; i <= segments; i += 1) {
    const a = -halfAngle + (2 * halfAngle * i) / segments;
    const x = Math.sin(a) * rOut;
    const y = -Math.cos(a) * rOut;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  for (let i = segments; i >= 0; i -= 1) {
    const a = -halfAngle + (2 * halfAngle * i) / segments;
    shape.lineTo(Math.sin(a) * rIn, -Math.cos(a) * rIn);
  }
  return shape;
}

function sectorGeometry(rIn, rOut, halfAngle, depth, zOffset = 0) {
  const geo = new THREE.ExtrudeGeometry(sectorShape(rIn, rOut, halfAngle), { depth, bevelEnabled: false, curveSegments: 1 });
  geo.translate(0, 0, -depth / 2 + zOffset);
  return geo;
}

/** Vertex colours as a function of position, multiplied with HDR material colour. */
function paint(geo, fn) {
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    v.fromBufferAttribute(pos, i);
    fn(v, c);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

class Layer {
  constructor(parent, geometry, material, max) {
    this.mesh = new THREE.InstancedMesh(geometry, material, max);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.max = max;
    this.n = 0;
    parent.add(this.mesh);
  }

  begin() {
    this.n = 0;
  }

  push(matrix, color) {
    if (this.n >= this.max) return;
    this.mesh.setMatrixAt(this.n, matrix);
    if (color) this.mesh.setColorAt(this.n, color);
    this.n += 1;
  }

  end() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

export class Obstacles {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.active = [];
    this.dummy = new THREE.Object3D();
    this.white = new THREE.Color(1, 1, 1);
    this.edgeColor = new THREE.Color(2.2, 2.0, 1.4);

    // ---- TYPE 1: neon spikes (triangular pyramids, dark base -> white-hot tip)
    const spikeGeo = paint(new THREE.ConeGeometry(0.5, 1, 3, 1).translate(0, 0.5, 0), (v, c) => {
      const t = v.y;
      c.setRGB(0.12 + t * 0.9, 0.05 + t * t * 0.55, 0.12 + t * 0.85);
    });
    this.spikeMat = new THREE.MeshBasicMaterial({ color: hdr(3.2, 0.15, 2.9), vertexColors: true });
    this.spikes = new Layer(this.group, spikeGeo, this.spikeMat, 700);
    const plateGeo = sectorGeometry(R - 0.06, R - 0.01, 0.09, 1.1);
    this.spikePlateMat = new THREE.MeshBasicMaterial({ color: hdr(1.4, 0.0, 1.2) });
    this.spikePlates = new Layer(this.group, plateGeo, this.spikePlateMat, 700);

    // ---- TYPE 2: laser barriers (core + additive glow + wall emitters)
    const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
    this.laserCoreMat = new THREE.MeshBasicMaterial({ color: hdr(5, 1.4, 1.6) });
    this.laserGlowMat = new THREE.MeshBasicMaterial({ color: hdr(2.2, 0.08, 0.25), transparent: true, opacity: 0.38, blending: THREE.AdditiveBlending, depthWrite: false });
    this.laserCore = new Layer(this.group, beamGeo, this.laserCoreMat, 60);
    this.laserGlow = new Layer(this.group, beamGeo, this.laserGlowMat, 60);
    const emitterGeo = paint(new THREE.BoxGeometry(0.7, 0.5, 0.8), (v, c) => {
      const t = v.y > 0 ? 1 : 0.25;
      c.setRGB(t, t * 0.6, t * 0.6);
    });
    this.emitterMat = new THREE.MeshBasicMaterial({ color: hdr(1.8, 0.25, 0.3), vertexColors: true });
    this.emitters = new Layer(this.group, emitterGeo, this.emitterMat, 120);

    // ---- TYPE 3: rotating energy blades
    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(-0.14, 0.7);
    bladeShape.lineTo(0.14, 0.7);
    bladeShape.quadraticCurveTo(0.42, 3.2, 0.5, R - 0.06);
    bladeShape.lineTo(-0.32, R - 0.06);
    bladeShape.quadraticCurveTo(-0.3, 3.0, -0.14, 0.7);
    const bladeGeo = paint(new THREE.ExtrudeGeometry(bladeShape, { depth: 0.2, bevelEnabled: false, curveSegments: 6 }).translate(0, 0, -0.1), (v, c) => {
      const t = Math.min(1, v.y / R);
      const edge = Math.abs(v.x) > 0.3 ? 1 : 0.6;
      c.setRGB(1, 0.35 + 0.25 * (1 - t), 0.05 + 0.2 * (1 - t)).multiplyScalar(edge * (0.55 + 0.45 * t));
    });
    this.bladeMat = new THREE.MeshBasicMaterial({ color: hdr(3.4, 1.6, 0.3), vertexColors: true });
    this.blades = new Layer(this.group, bladeGeo, this.bladeMat, 60);
    this.hubMat = new THREE.MeshBasicMaterial({ color: hdr(4, 2.4, 0.9) });
    this.hubs = new Layer(this.group, new THREE.IcosahedronGeometry(0.72, 1), this.hubMat, 30);
    this.hubRingMat = new THREE.MeshBasicMaterial({ color: hdr(3, 0.9, 0.05) });
    this.hubRings = new Layer(this.group, new THREE.TorusGeometry(1.05, 0.07, 6, 32), this.hubRingMat, 30);

    // ---- TYPE 4: moving metallic walls (lit metal blocks + emissive rim)
    const half = BLOCK_STEP / 2 + 0.002;
    const wallGeo = sectorGeometry(4.05, R + 0.02, half, 1.4);
    this.wallMat = new THREE.MeshStandardMaterial({ color: 0x4a5670, metalness: 0.7, roughness: 0.38, emissive: 0x020308 });
    this.walls = new Layer(this.group, wallGeo, this.wallMat, 520);
    const rimGeo = mergeGeometries([
      sectorGeometry(4.0, 4.14, half, 0.08, 0.68),
      sectorGeometry(4.0, 4.14, half, 0.08, -0.68),
    ]);
    this.wallRimMat = new THREE.MeshBasicMaterial({ color: hdr(0.35, 1.5, 2.0) });
    this.wallRims = new Layer(this.group, rimGeo, this.wallRimMat, 520);
    const capGeo = new THREE.BoxGeometry(0.1, 1.95, 1.46).translate(0, -(4.05 + R) / 2, 0);
    this.wallCapMat = new THREE.MeshBasicMaterial({ color: hdr(0.3, 1.6, 2.2) });
    this.wallCaps = new Layer(this.group, capGeo, this.wallCapMat, 120);

    // ---- TYPE 5: energy gates (ring of glowing blocks with safe gaps)
    const gateGeo = paint(sectorGeometry(4.55, R - 0.01, half, 0.48), (v, c) => {
      const r = Math.hypot(v.x, v.y);
      const t = 1 - Math.min(1, (r - 4.55) / 1.4);
      const front = v.z > 0.2 ? 1 : 0.7;
      c.setRGB(0.25 + 0.75 * t * t, 0.3 + 0.7 * t * t, 0.55 + 0.45 * t).multiplyScalar(front);
    });
    this.gateMat = new THREE.MeshBasicMaterial({ color: hdr(0.2, 0.75, 2.8), vertexColors: true });
    this.gates = new Layer(this.group, gateGeo, this.gateMat, 1300);
    this.gates.mesh.setColorAt(0, this.white); // allocate instanceColor
  }

  add(o) {
    if (o.type === 'gate' || o.type === 'wall') {
      const solid = new Uint8Array(BLOCK_COUNT);
      for (const b of o.blocks) solid[((b % BLOCK_COUNT) + BLOCK_COUNT) % BLOCK_COUNT] = 1;
      o.edge = o.blocks.map((b) => {
        const i = ((b % BLOCK_COUNT) + BLOCK_COUNT) % BLOCK_COUNT;
        return !solid[(i + 1) % BLOCK_COUNT] || !solid[(i - 1 + BLOCK_COUNT) % BLOCK_COUNT];
      });
    }
    o.passed = false;
    o.minClear = Infinity;
    o.smashed = false;
    this.active.push(o);
  }

  clear() {
    this.active.length = 0;
  }

  /** Removes obstacles behind the player. Call once per frame before rendering. */
  prune(distance) {
    const list = this.active;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (list[i].s < distance - GEN.despawnBehind) {
        list[i] = list[list.length - 1];
        list.pop();
      }
    }
  }

  place(angle, z, radius, scaleY = 1) {
    const d = this.dummy;
    d.position.set(Math.sin(angle) * radius, -Math.cos(angle) * radius, z);
    d.rotation.set(0, 0, angle);
    d.scale.set(1, scaleY, 1);
    d.updateMatrix();
    return d.matrix;
  }

  update(dt, distance, time) {
    const layers = [this.spikes, this.spikePlates, this.laserCore, this.laserGlow, this.emitters, this.blades, this.hubs, this.hubRings, this.walls, this.wallRims, this.wallCaps, this.gates];
    for (const l of layers) l.begin();
    const d = this.dummy;
    const flicker = 0.85 + 0.15 * Math.sin(time * 60) * Math.sin(time * 23);
    this.laserCoreMat.color.setRGB(5 * flicker, 1.4 * flicker, 1.6 * flicker);
    this.gateMat.color.setRGB(0.2, 0.75 + 0.15 * Math.sin(time * 5), 2.8);

    for (const o of this.active) {
      if (o.smashed) continue;
      const dz = o.s - distance;
      const z = -dz;
      const rot = rotationAt(o, dz);
      switch (o.type) {
        case 'spikes':
          for (const cl of o.clusters) {
            const start = cl.a - ((cl.count - 1) * 0.2) / 2;
            for (let i = 0; i < cl.count; i += 1) {
              const a = rot + start + i * 0.2;
              const wobble = 1.25 + 0.06 * Math.sin(time * 6 + i + o.id);
              this.spikes.push(this.place(a, z, R - 0.02, wobble));
              this.spikePlates.push(this.place(a, z, 0, 1));
            }
          }
          break;
        case 'laser':
          for (const beam of o.beams) {
            const a = rot + beam;
            d.position.set(0, 0, z);
            d.rotation.set(0, 0, a);
            d.scale.set(0.07, R * 2 - 0.4, 0.07);
            d.updateMatrix();
            this.laserCore.push(d.matrix);
            d.scale.set(0.26, R * 2 - 0.4, 0.26);
            d.updateMatrix();
            this.laserGlow.push(d.matrix);
            this.emitters.push(this.place(a, z, R - 0.2));
            this.emitters.push(this.place(a + Math.PI, z, R - 0.2));
          }
          break;
        case 'blades':
          for (const blade of o.blades) {
            d.position.set(0, 0, z);
            d.rotation.set(0, 0, rot + blade + Math.PI);
            d.scale.set(1, 1, 1);
            d.updateMatrix();
            this.blades.push(d.matrix);
          }
          d.position.set(0, 0, z);
          d.rotation.set(time * 2, time * 3, rot);
          d.scale.setScalar(1);
          d.updateMatrix();
          this.hubs.push(d.matrix);
          d.rotation.set(0, 0, rot);
          d.updateMatrix();
          this.hubRings.push(d.matrix);
          break;
        case 'wall':
          for (let i = 0; i < o.blocks.length; i += 1) {
            const a = rot + o.blocks[i] * BLOCK_STEP;
            const m = this.place(a, z, 0);
            this.walls.push(m);
            this.wallRims.push(m);
            if (o.edge[i]) {
              const b = o.blocks[i];
              const solidNext = o.blocks.includes(b + 1) || o.blocks.includes(b + 1 - BLOCK_COUNT);
              const side = solidNext ? -1 : 1;
              this.wallCaps.push(this.place(a + (side * BLOCK_STEP) / 2, z, 0));
            }
          }
          break;
        case 'gate':
          for (let i = 0; i < o.blocks.length; i += 1) {
            const a = rot + o.blocks[i] * BLOCK_STEP;
            this.gates.push(this.place(a, z, 0), o.edge[i] ? this.edgeColor : this.white);
          }
          break;
        default:
          break;
      }
    }
    for (const l of layers) l.end();
  }
}
