import * as THREE from 'three';
import { build, flatMaterial, hashUnit, Part } from '../render/ModelKit';
import type { TerrainData } from './TerrainGen';

/**
 * v0.3 wooden footbridges. The deck height comes from TerrainData.bridges, the
 * same data the pathfinder and villager walk height use, so what you see is
 * exactly where caravans cross.
 */
export function buildBridges(terrain: TerrainData): THREE.Group {
  const group = new THREE.Group();
  group.name = 'bridges';
  const parts: Part[] = [];
  for (const b of terrain.bridges) {
    const dx = b.x1 - b.x0;
    const dz = b.z1 - b.z0;
    const len = Math.hypot(dx, dz);
    const yaw = Math.atan2(dx, dz);
    const ux = dx / len;
    const uz = dz / len;
    // Local frame: planks run across the bridge (perpendicular to travel).
    const nx = -uz;
    const nz = ux;
    const planks = Math.floor(len / 0.42);
    for (let i = 0; i <= planks; i++) {
      const t = i / planks;
      const x = b.x0 + dx * t;
      const z = b.z0 + dz * t;
      const shade = [0x9b7650, 0x8f6c48, 0xa67f57, 0x86633f][Math.floor(hashUnit(i * 7 + 3) * 4)];
      parts.push(Part.box(b.halfWidth * 2.1, 0.12, 0.36).rot(0, yaw, (hashUnit(i) - 0.5) * 0.04).at(x, b.deck - 0.06, z).color(shade));
    }
    for (const side of [-1, 1]) {
      const ox = nx * b.halfWidth * 1.02 * side;
      const oz = nz * b.halfWidth * 1.02 * side;
      // Hand rail and the beam under the planks.
      parts.push(Part.box(0.1, 0.1, len).rot(0, yaw, 0).at(b.x0 + dx / 2 + ox, b.deck + 0.85, b.z0 + dz / 2 + oz).color(0x6b4a2e));
      parts.push(Part.box(0.18, 0.22, len + 0.4).rot(0, yaw, 0).at(b.x0 + dx / 2 + ox * 0.8, b.deck - 0.2, b.z0 + dz / 2 + oz * 0.8).color(0x5a3c24));
      const posts = Math.max(2, Math.round(len / 2.2));
      for (let i = 0; i <= posts; i++) {
        const t = i / posts;
        const x = b.x0 + dx * t + ox;
        const z = b.z0 + dz * t + oz;
        parts.push(Part.box(0.13, 1.0, 0.13).at(x, b.deck + 0.4, z).color(0x6b4a2e));
        // Pilings down into the riverbed.
        const ground = terrain.heightAt(x, z);
        const h = b.deck - ground + 0.4;
        if (h > 0.6 && i > 0 && i < posts) parts.push(Part.cyl(0.11, 0.13, h, 6).at(x, ground + h / 2 - 0.4, z).color(0x4a3220));
      }
    }
    // Rope lanterns at both ends.
    for (const t of [0, 1]) {
      const x = b.x0 + dx * t;
      const z = b.z0 + dz * t;
      parts.push(Part.ico(0.13, 0).at(x + nx * b.halfWidth, b.deck + 1.05, z + nz * b.halfWidth).color(0xf2c14e));
    }
  }
  if (!parts.length) return group;
  const mesh = new THREE.Mesh(build(parts), flatMaterial({ roughness: 0.85 }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'bridge-mesh';
  group.add(mesh);
  return group;
}
