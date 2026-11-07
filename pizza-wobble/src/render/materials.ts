/** Shared materials: one coherent matte-stucco language across the whole game. */
import {
  Color,
  DoubleSide,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import { boxLidTexture, boxSideTexture, groundAtlas, pizzaTexture, roofTexture, softDot, beamTexture } from './textures.ts';

export const timeUniform = { value: 0 };

export interface Materials {
  world: MeshStandardMaterial;
  terrain: MeshStandardMaterial;
  roof: MeshStandardMaterial;
  glow: MeshBasicMaterial;
  lamp: MeshBasicMaterial;
  puddle: MeshStandardMaterial;
  laundry: MeshStandardMaterial;
  water: MeshStandardMaterial;
  fountainWater: MeshStandardMaterial;
  boxLid: MeshStandardMaterial;
  boxSide: MeshStandardMaterial;
  pizza: MeshStandardMaterial;
  beam: MeshBasicMaterial;
  ring: MeshBasicMaterial;
  dot: Texture;
  vehicle: MeshStandardMaterial;
}

let mats: Materials | null = null;

export function materials(): Materials {
  if (mats) return mats;
  const world = new MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
  const terrain = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, map: groundAtlas() });
  const roof = new MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0, map: roofTexture() });
  const glow = new MeshBasicMaterial({ vertexColors: true, color: new Color(2.4, 2.0, 1.5), toneMapped: false });
  const lamp = new MeshBasicMaterial({ color: new Color(2.6, 2.3, 1.7), toneMapped: false });
  const puddle = new MeshStandardMaterial({ color: 0x6f8fa8, roughness: 0.04, metalness: 0.6, transparent: true, opacity: 0.75 });

  const laundry = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: DoubleSide });
  laundry.onBeforeCompile = (s: WebGLProgramParametersWithUniforms) => {
    s.uniforms.uTime = timeUniform;
    s.vertexShader = 'uniform float uTime;\n' + s.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       float hang = 1.0 - uv.y;
       #ifdef USE_INSTANCING
         float ph = instanceMatrix[3][0] * 0.7 + instanceMatrix[3][2] * 0.3;
       #else
         float ph = 0.0;
       #endif
       transformed.z += sin(uTime * 2.3 + ph) * 0.18 * hang + sin(uTime * 5.1 + ph * 2.0) * 0.04 * hang;
       transformed.x += sin(uTime * 1.7 + ph) * 0.05 * hang;`,
    );
  };

  const water = new MeshStandardMaterial({ color: 0x1fb0b3, roughness: 0.18, metalness: 0.1, transparent: true, opacity: 0.92 });
  water.onBeforeCompile = (s) => {
    s.uniforms.uTime = timeUniform;
    s.vertexShader = 'varying vec3 vWPos;\n' + s.vertexShader.replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>
       vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
    );
    s.fragmentShader = 'uniform float uTime;\nvarying vec3 vWPos;\n' + s.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
       float w1 = sin(vWPos.x * 0.35 + uTime * 0.9) * sin(vWPos.z * 0.42 - uTime * 0.7);
       float w2 = sin(vWPos.x * 1.3 - uTime * 1.6 + vWPos.z * 0.8);
       float foam = smoothstep(0.82, 0.98, w1 * 0.6 + w2 * 0.4);
       diffuseColor.rgb = mix(diffuseColor.rgb * (0.92 + 0.1 * w1), vec3(0.85, 0.97, 0.95), foam * 0.55);`,
    );
  };
  const fountainWater = new MeshStandardMaterial({ color: 0x8fe0f0, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.7 });
  fountainWater.onBeforeCompile = (s) => {
    s.uniforms.uTime = timeUniform;
    s.fragmentShader = 'uniform float uTime;\n' + s.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
       float st = sin(vUv.y * 40.0 - uTime * 9.0) * 0.5 + 0.5;
       diffuseColor.rgb += vec3(0.25) * st;`,
    );
  };
  fountainWater.defines = { USE_UV: '' };

  const lid = boxLidTexture();
  const boxLid = new MeshStandardMaterial({ map: lid, roughness: 0.85 });
  const boxSide = new MeshStandardMaterial({ map: boxSideTexture(), roughness: 0.9 });
  const pizza = new MeshStandardMaterial({ map: pizzaTexture(), roughness: 0.7, side: DoubleSide });
  const beam = new MeshBasicMaterial({ map: beamTexture(), transparent: true, depthWrite: false, color: 0xffd36b, side: DoubleSide, toneMapped: false });
  const ring = new MeshBasicMaterial({ color: new Color(2.2, 1.6, 0.5), transparent: true, opacity: 0.95, toneMapped: false, depthWrite: false });
  const vehicle = new MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.05 });
  mats = { world, terrain, roof, glow, lamp, puddle, laundry, water, fountainWater, boxLid, boxSide, pizza, beam, ring, dot: softDot(), vehicle };
  return mats;
}
