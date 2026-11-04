import * as THREE from 'three';

/**
 * Shared material roles. Nearly everything in the world is vertex-colored and
 * merged, so these few materials carry the whole art direction.
 */
function addRim(material: THREE.MeshStandardMaterial, strength: number, color: string): void {
  const rimColor = new THREE.Color(color);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = { value: rimColor };
    shader.uniforms.uRimStrength = { value: strength };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform vec3 uRimColor;\nuniform float uRimStrength;',
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float rimF = 1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0);
        totalEmissiveRadiance += uRimColor * pow(rimF, 3.0) * uRimStrength;`,
      );
  };
  material.customProgramCacheKey = () => `rim-${strength}-${color}`;
}

export class Materials {
  /** Characters: smooth, soft, with a warm rim light so silhouettes pop. */
  readonly character = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.0 });
  /** World kit: faceted low-poly. */
  readonly world = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.0, flatShading: true });
  /** Smooth world surfaces (domes, tents, fountains). */
  readonly worldSmooth = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.0 });
  /** Shiny accents (brass, chrome, gems). */
  readonly metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.65 });
  /** Signs, bulbs, neon, windows at dusk: unlit vertex colors. */
  readonly glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  readonly glass = new THREE.MeshStandardMaterial({
    color: '#bfe8ff',
    roughness: 0.08,
    metalness: 0.1,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  });
  readonly water = new THREE.MeshStandardMaterial({
    color: '#4fc6e0',
    roughness: 0.15,
    metalness: 0.05,
    transparent: true,
    opacity: 0.82,
  });
  readonly ghost = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.4,
    transparent: true,
    opacity: 0.72,
    emissive: new THREE.Color('#5d9cff'),
    emissiveIntensity: 0.35,
    depthWrite: false,
  });
  readonly spectral = new THREE.MeshBasicMaterial({
    color: '#7fd4ff',
    transparent: true,
    opacity: 0.55,
    toneMapped: false,
    depthWrite: false,
  });
  readonly laser = new THREE.MeshBasicMaterial({
    color: '#ff2a55',
    transparent: true,
    opacity: 0.85,
    toneMapped: false,
    depthWrite: false,
  });
  readonly shadowBlob = new THREE.MeshBasicMaterial({
    color: '#1b1430',
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });

  constructor() {
    addRim(this.character, 0.45, '#ffe2b8');
    addRim(this.ghost, 0.9, '#9fdcff');
    this.shadowBlob.map = makeBlobTexture();
  }
}

function makeBlobTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}

export const PALETTE = {
  skinLight: '#ffd9b8',
  skinTan: '#e8b48a',
  skinMid: '#c98d62',
  skinDeep: '#8a5a3c',
  skinOlive: '#d8b27a',
  alien: '#5fe0b8',
  alienDark: '#2fae8c',
  alienGlow: '#ff6fb5',
  ink: '#2a2238',
  white: '#fbf7ee',
  cream: '#f4e6c8',
  brick: '#c8553d',
  brickDark: '#9b3b2b',
  stone: '#d9cdb8',
  stoneDark: '#a99c86',
  asphalt: '#5a5770',
  asphaltLight: '#6e6a86',
  grass: '#7cc56b',
  grassDark: '#5aa652',
  wood: '#b07a48',
  woodDark: '#7d5130',
  gold: '#f2c14e',
  teal: '#3bb3a8',
  sky: '#9fd8ff',
  coral: '#ff7b6b',
  lilac: '#b79cf0',
  mint: '#9ff0cf',
  butter: '#ffe27a',
  navy: '#2d3a6b',
  red: '#e2473f',
  orange: '#f39a3d',
  pink: '#ff8fc0',
  purple: '#7d4fc9',
  blue: '#4a8fe0',
  green: '#4fb06a',
};
