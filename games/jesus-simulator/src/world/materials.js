import * as THREE from 'three';
import { limestoneTexture, woodTexture, clothTexture } from './textures.js';

let cache = null;

/** Shared world materials. Static geometry is batched per key below. */
export function getMaterials() {
  if (cache) return cache;
  const stone = new THREE.MeshStandardMaterial({ map: limestoneTexture(), vertexColors: true, roughness: 0.92 });
  const wood = new THREE.MeshStandardMaterial({ map: woodTexture(), vertexColors: true, roughness: 0.82 });
  const cloth = new THREE.MeshStandardMaterial({ map: clothTexture(), vertexColors: true, roughness: 0.95, side: THREE.DoubleSide });
  const plain = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const clay = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
  const foliage = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
  const grass = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
  grass.userData.castShadow = false;
  const water = new THREE.MeshStandardMaterial({ color: '#2f7891', roughness: 0.1, metalness: 0.1 });
  water.userData.castShadow = false;
  cache = { stone, wood, cloth, plain, clay, foliage, grass, water };
  return cache;
}

export const PALETTE = {
  limestone: ['#efe2c4', '#e6d5b0', '#f3e9d2', '#dcc79e', '#e9dcc0', '#d9c4a0'],
  plaster: '#d8c49c',
  plinth: '#b8a07a',
  woodDark: '#7a5233',
  woodMid: '#9c6b40',
  woodLight: '#c08c58',
  shutters: ['#3f7d95', '#4f8f6a', '#2f5d8a', '#8f4a3a', '#6b8c3f', '#2c7f7a'],
  fabrics: ['#b8322e', '#e0a12c', '#2f7f8f', '#4b3f8f', '#7d8f2f', '#c4567a', '#d96d2b', '#3d6fb0'],
  clay: ['#c0703f', '#b5643a', '#cf8550', '#a85a34'],
  dark: '#3a2a20',
};
