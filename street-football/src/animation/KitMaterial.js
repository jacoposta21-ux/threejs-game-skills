import * as THREE from 'three';
import { BONES } from './CharacterLibrary.js';

export const REGION = { SKIN: 0, JERSEY: 1, SHORTS: 2, SOCKS: 3, SHOES: 4, SOLE: 5 };

// One shared atlas for every shirt number (1–25, 5×5 cells). Channels are
// masks — R = number fill, G = outline — so the kit shader tints them per team.
let numberAtlas = null;
function getNumberAtlas() {
  if (numberAtlas) return numberAtlas;
  const cell = 128;
  const c = document.createElement('canvas');
  c.width = cell * 5;
  c.height = cell * 5;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  g.font = '900 104px "Arial Black", Impact, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  for (let n = 1; n <= 25; n += 1) {
    const i = n - 1;
    const x = (i % 5) * cell + cell / 2;
    const y = Math.floor(i / 5) * cell + cell / 2 + 6;
    g.lineWidth = 12;
    g.strokeStyle = 'rgb(0,255,0)';
    g.strokeText(String(n), x, y);
    g.fillStyle = 'rgb(255,0,0)';
    g.fillText(String(n), x, y);
  }
  numberAtlas = new THREE.CanvasTexture(c);
  numberAtlas.colorSpace = THREE.NoColorSpace;
  return numberAtlas;
}

/**
 * MeshStandardMaterial with a kit shader: colours come from per-vertex region
 * IDs and the bind-pose position, so every player shares one mesh and one
 * draw call while wearing different team kits, numbers and skin tones.
 */
export function createKitMaterial(lib, look) {
  const team = look.team;
  const frame = lib.kitFrame;
  const h = (y) => (y - frame.minY) / frame.height;
  const upperL = lib.bindPoint(BONES.upperArmL);
  const foreL = lib.bindPoint(BONES.forearmL);
  const knee = lib.bindPoint(BONES.shinL);
  const ankle = lib.bindPoint(BONES.footL);
  const spine = lib.bindPoint(BONES.spine2);

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0 });
  const uniforms = {
    uSkin: { value: new THREE.Color(look.skin) },
    uJersey: { value: new THREE.Color(team.jersey) },
    uJersey2: { value: new THREE.Color(team.jersey2) },
    uShorts: { value: new THREE.Color(team.shorts) },
    uSocks: { value: new THREE.Color(team.socks) },
    uSockStripe: { value: new THREE.Color(team.sockStripe) },
    uShoes: { value: new THREE.Color(look.shoes ?? team.shoes) },
    uPattern: { value: team.pattern },
    // minY, height, neck h, hip h
    uFrame: { value: new THREE.Vector4(frame.minY, frame.height, h(frame.neckY), h(frame.hipY)) },
    // sleeve end |x|, shoulder |x|, knee h, ankle h
    uLimbs: {
      value: new THREE.Vector4(
        Math.abs((upperL.x + foreL.x) * 0.5),
        Math.abs(upperL.x),
        h(knee.y),
        h(ankle.y),
      ),
    },
    uSpineZ: { value: spine.z },
    uHeadC: { value: lib.head.center.clone() },
    uHeadS: { value: lib.head.size.clone() },
    uNumber: { value: getNumberAtlas() },
    uNumberCell: {
      value: new THREE.Vector2(((look.number ?? 10) - 1) % 5, Math.floor(((look.number ?? 10) - 1) / 5)),
    },
    uNumberOutline: { value: new THREE.Color(team.pattern === 2 ? '#f4f1e8' : '#0b2a14') },
    uHighlight: { value: 0 },
  };
  mat.userData.uniforms = uniforms;

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float aRegion;\nvarying float vRegion;\nvarying vec3 vBind;',
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRegion = aRegion;\nvBind = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying float vRegion;
varying vec3 vBind;
uniform vec3 uSkin, uJersey, uJersey2, uShorts, uSocks, uSockStripe, uShoes;
uniform float uPattern, uSpineZ, uHighlight;
uniform vec4 uFrame, uLimbs;
uniform vec3 uHeadC, uHeadS;
uniform sampler2D uNumber;
uniform vec2 uNumberCell;
uniform vec3 uNumberOutline;
float kitHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float kitRough = 0.75;
`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  float region = floor(vRegion + 0.5);
  float hh = (vBind.y - uFrame.x) / uFrame.y;
  float ax = abs(vBind.x);
  vec3 col = uSkin;
  kitRough = 0.58;
  if (region < 0.5) {
    // Skin + simple face on the head front.
    vec3 hp = (vBind - uHeadC) / uHeadS;
    if (hp.z > 0.18 && hp.y > -0.45) {
      float eyes = smoothstep(1.0, 0.6, length(vec2((abs(hp.x) - 0.17) / 0.07, (hp.y - 0.04) / 0.045)));
      float brows = smoothstep(1.0, 0.7, length(vec2((abs(hp.x) - 0.17) / 0.11, (hp.y - 0.13) / 0.022)));
      float mouth = smoothstep(1.0, 0.6, length(vec2(hp.x / 0.09, (hp.y + 0.22) / 0.018)));
      col = mix(col, vec3(0.06, 0.04, 0.03), max(eyes, brows * 0.85));
      col = mix(col, col * vec3(0.55, 0.3, 0.28), mouth);
    }
  } else if (region < 1.5) {
    col = uJersey;
    kitRough = 0.82;
    bool torso = ax < uLimbs.y * 1.02;
    if (uPattern > 1.5 && torso) {
      float stripe = step(0.5, fract(vBind.x * 7.5 + 0.25));
      col = mix(uJersey, uJersey2, stripe);
    }
    // Collar and sleeve cuffs.
    if (hh > uFrame.z - 0.022) col = uJersey2;
    if (!torso && ax > uLimbs.x - 0.035) col = uJersey2;
    // Back number.
    if (torso && vBind.z < uSpineZ - 0.01 && hh > 0.6 && hh < 0.765 && ax < 0.1) {
      vec2 nuv = clamp(vec2(0.5 - vBind.x / 0.2, (hh - 0.6) / 0.165), 0.02, 0.98);
      vec2 auv = vec2((uNumberCell.x + nuv.x) / 5.0, 1.0 - (uNumberCell.y + 1.0) / 5.0 + nuv.y / 5.0);
      vec4 n = texture2D(uNumber, auv);
      col = mix(col, uNumberOutline, n.g);
      col = mix(col, uJersey2, n.r);
    }
    // Small crest on the front-left chest.
    vec2 crest = vec2(vBind.x - 0.075, hh - 0.735);
    if (torso && vBind.z > uSpineZ + 0.02 && length(crest) < 0.022) col = mix(uJersey2, vec3(1.0), step(length(crest), 0.012));
  } else if (region < 2.5) {
    col = uShorts;
    kitRough = 0.78;
    // Side stripe.
    if (abs(ax - 0.13) < 0.012) col = uJersey2;
  } else if (region < 3.5) {
    col = uSocks;
    kitRough = 0.9;
    float t = (uLimbs.z - hh) / max(uLimbs.z - uLimbs.w, 0.001);
    if (t > 0.27 && t < 0.37) col = uSockStripe;
  } else if (region < 4.5) {
    col = uShoes;
    kitRough = 0.42;
  } else {
    col = vec3(0.93, 0.92, 0.88);
    kitRough = 0.6;
  }
  float grain = kitHash(floor(vBind * 180.0)) * 0.06 - 0.03;
  diffuseColor.rgb = col * (1.0 + grain) + uHighlight * vec3(0.18, 0.16, 0.05);
}
`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = kitRough;');
  };
  mat.customProgramCacheKey = () => 'footballer-kit-v2';
  return mat;
}
