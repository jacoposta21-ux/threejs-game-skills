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
 * Kit shader on the textured Quaternius body. Skin regions keep the painted
 * base-colour texture (face, hands, muscle detail) tinted to the player's skin
 * tone; kit regions (jersey, shorts, socks, boots) are drawn procedurally in
 * metric bind-pose coordinates, with the body's muscle normal map softened
 * under the fabric. One mesh and one draw call per player for every team.
 */
export function createKitMaterial(lib, look, body = lib) {
  const team = look.team;
  const frame = body.kitFrame;
  const h = (y) => (y - frame.minY) / frame.height;
  const bp = (n) => lib.bindPoint(n, body);
  const upperL = bp(BONES.upperArmL);
  const foreL = bp(BONES.forearmL);
  const knee = bp(BONES.shinL);
  const ankle = bp(BONES.footL);
  const spine = bp(BONES.spine2);
  const base = body.baseMaterial;

  const mat = new THREE.MeshStandardMaterial({
    map: base.map ?? null,
    normalMap: base.normalMap ?? null,
    roughnessMap: base.roughnessMap ?? null,
    metalnessMap: null,
    roughness: 1,
    metalness: 0,
  });
  if (base.normalMap) mat.normalScale.set(0.9, 0.9);
  const u = frame.unitsPerMeter;
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
    // sleeve end |x| (m), shoulder |x| (m), knee h, ankle h
    uLimbs: {
      value: new THREE.Vector4(
        Math.abs((upperL.x + foreL.x) * 0.5 - frame.centerX) / u,
        Math.abs(upperL.x - frame.centerX) / u,
        h(knee.y),
        h(ankle.y),
      ),
    },
    // centre x, spine z, units per metre
    uOrigin: { value: new THREE.Vector3(frame.centerX, spine.z, u) },
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
uniform vec3 uSkin, uJersey, uJersey2, uShorts, uSocks, uSockStripe, uShoes, uOrigin;
uniform float uPattern, uHighlight;
uniform vec4 uFrame, uLimbs;
uniform sampler2D uNumber;
uniform vec2 uNumberCell;
uniform vec3 uNumberOutline;
float kitHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float kitRough = 0.75;
float kitCloth = 0.0;
// Average skin colour of the painted texture (linear), used to re-tint skin tones.
const vec3 kitTexSkin = vec3(0.40, 0.19, 0.088);
`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  float region = floor(vRegion + 0.5);
  float hh = (vBind.y - uFrame.x) / uFrame.y;
  // Metric bind-pose coordinates: x across the body, z front/back from the spine.
  float mx = (vBind.x - uOrigin.x) / uOrigin.z;
  float mz = (vBind.z - uOrigin.y) / uOrigin.z;
  float ax = abs(mx);
  vec3 col = diffuseColor.rgb;
  if (region < 0.5) {
    // Painted skin and face, re-tinted to this player's skin tone.
    col = clamp(diffuseColor.rgb * (uSkin / kitTexSkin), 0.0, 1.0);
  } else {
    kitCloth = 1.0;
    if (region < 1.5) {
      col = uJersey;
      kitRough = 0.82;
      bool torso = ax < uLimbs.y * 1.05;
      if (uPattern > 1.5 && torso) col = mix(uJersey, uJersey2, step(0.5, fract(mx * 8.0 + 0.25)));
      // Thin collar band right at the neckline.
      if (hh > uFrame.z - 0.012 && ax < 0.11) col = uJersey2;
      if (!torso && ax > uLimbs.x - 0.035) col = uJersey2;
      if (torso && mz < -0.01 && hh > 0.6 && hh < 0.765 && ax < 0.095) {
        vec2 nuv = clamp(vec2(0.5 - mx / 0.19, (hh - 0.6) / 0.165), 0.02, 0.98);
        vec2 auv = vec2((uNumberCell.x + nuv.x) / 5.0, 1.0 - (uNumberCell.y + 1.0) / 5.0 + nuv.y / 5.0);
        vec4 n = texture2D(uNumber, auv);
        col = mix(col, uNumberOutline, n.g);
        col = mix(col, uJersey2, n.r);
      }
      vec2 crest = vec2(mx - 0.07, hh - 0.735);
      if (torso && mz > 0.02 && length(crest) < 0.021) col = mix(uJersey2, vec3(1.0), step(length(crest), 0.011));
    } else if (region < 2.5) {
      col = uShorts;
      kitRough = 0.78;
      if (abs(ax - 0.12) < 0.011) col = uJersey2;
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
    // Fabric: weave grain plus the painted texture's shading kept as soft folds.
    float grain = kitHash(floor(vBind * 220.0)) * 0.05 - 0.025;
    float folds = clamp(dot(diffuseColor.rgb, vec3(0.33)) / dot(kitTexSkin, vec3(0.33)), 0.75, 1.15);
    col *= (1.0 + grain) * mix(1.0, folds, 0.5);
  }
  diffuseColor.rgb = col + uHighlight * vec3(0.18, 0.16, 0.05);
}
`,
      )
      .replace('#include <color_fragment>', '#include <color_fragment>')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nif (kitCloth > 0.5) roughnessFactor = kitRough;')
      .replace(
        '#include <normal_fragment_maps>',
        '#include <normal_fragment_maps>\n// Muscles show through skin, not through the shirt.\nnormal = normalize(mix(normal, nonPerturbedNormal, kitCloth * 0.75));',
      );
  };
  mat.customProgramCacheKey = () => 'footballer-kit-v3';
  return mat;
}
