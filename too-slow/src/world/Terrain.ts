import * as THREE from 'three';
import { KICKER, SMALL_JUMP, SURFACES, noise2, track, type Surface } from './Track';
import { createGroundDetail, createRippleTexture } from './Textures';

const COLS: number[] = [];
for (const d of [-120, -86, -60, -42, -31, -24, -21, -18.5, -16.5]) COLS.push(d);
for (let d = -15; d <= 15; d += 1) COLS.push(d);
for (const d of [16.5, 18.5, 21, 24, 31, 42, 60, 86, 120]) COLS.push(d);

const ROWS_PER_CHUNK = 72;

const colorCache = new Map<Surface, THREE.Color>();
function surfaceColor(surface: Surface): THREE.Color {
  let c = colorCache.get(surface);
  if (!c) {
    c = new THREE.Color(SURFACES[surface].color);
    colorCache.set(surface, c);
  }
  return c;
}

const VERGE = new THREE.Color(0x4c9a36);
const FAR_A = new THREE.Color(0x5fae3c);
const FAR_B = new THREE.Color(0x3f8a34);
const WET = new THREE.Color(0x5a4630);
const TAPS = [
  [0, 0],
  [0.55, 0],
  [-0.55, 0],
  [0, 0.55],
  [0, -0.55],
];
const tap = new THREE.Color();

export interface TerrainResult {
  group: THREE.Group;
  water: THREE.Mesh;
  update(time: number): void;
}

/** Builds the ribbon terrain straight from the track's height and surface functions. */
export function buildTerrain(): TerrainResult {
  const group = new THREE.Group();
  group.name = 'terrain';

  const rows: number[] = [];
  for (let s = -40; s <= track.length + 40; s += 1) rows.push(s);
  // Extra rows so the kicker lips are crisp cliffs instead of 1 m smears.
  for (const lip of [KICKER.s1, SMALL_JUMP.s1]) rows.push(lip - 0.02, lip + 0.02);
  rows.sort((a, b) => a - b);

  const detail = createGroundDetail();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.tDetail = { value: detail };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aMix;\nvarying vec2 vMix;\nvarying vec2 vDetailUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMix = aMix;\nvDetailUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tDetail;\nvarying vec2 vMix;\nvarying vec2 vDetailUv;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 det = texture2D(tDetail, vDetailUv).rgb;
        float grain = texture2D(tDetail, vDetailUv * 0.23).r;
        float plain = 1.0 - max(vMix.x, vMix.y);
        diffuseColor.rgb *= mix(0.9 + 0.2 * det.r, 0.74 + 0.5 * det.r, plain) * (0.84 + 0.32 * grain);
        // Tufty mottling on grass and dirt so open ground never reads as a flat fill.
        float tuft = texture2D(tDetail, vDetailUv * 2.7 + 0.11).b;
        float patchy = texture2D(tDetail, vDetailUv * 0.09 + 0.5).r;
        diffuseColor.rgb *= mix(1.0, (0.8 + 0.42 * tuft) * (0.86 + 0.3 * patchy), plain);
        diffuseColor.rgb *= mix(1.0, 0.42 + 0.86 * det.g, vMix.x);
        float hueMix = texture2D(tDetail, vDetailUv * 0.61 + 0.37).b;
        vec3 leafCol = mix(vec3(0.80, 0.30, 0.07), vec3(0.98, 0.74, 0.16), hueMix) * (0.5 + 0.75 * det.b);
        diffuseColor.rgb = mix(diffuseColor.rgb, leafCol, vMix.y * 0.82);`,
      );
  };

  const normal = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const col = new THREE.Color();
  const cols = COLS.length;

  for (let r0 = 0; r0 < rows.length - 1; r0 += ROWS_PER_CHUNK) {
    const r1 = Math.min(rows.length - 1, r0 + ROWS_PER_CHUNK);
    const count = (r1 - r0 + 1) * cols;
    const positions = new Float32Array(count * 3);
    const normals = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const uvs = new Float32Array(count * 2);
    const mix = new Float32Array(count * 2);
    let v = 0;
    for (let r = r0; r <= r1; r += 1) {
      const s = rows[r];
      const hw = track.halfWidth(s);
      for (let ci = 0; ci < cols; ci += 1) {
        const d = COLS[ci];
        track.toWorld(s, d, pos);
        track.normal(s, d, normal);
        positions.set([pos.x, pos.y, pos.z], v * 3);
        normals.set([normal.x, normal.y, normal.z], v * 3);
        uvs.set([d / 7, s / 7], v * 2);

        const ad = Math.abs(d);
        let stone = 0;
        let leaf = 0;
        if (ad > 24) {
          col.copy(FAR_A).lerp(FAR_B, noise2(s * 0.05, d * 0.05));
        } else {
          // Average a small neighbourhood so patch borders blend instead of stair-stepping.
          let r = 0;
          let g = 0;
          let b = 0;
          for (const [os, od] of TAPS) {
            const surface = track.surface(s + os, d + od);
            if (surface === 'rough') tap.copy(VERGE).lerp(FAR_A, noise2(s * 0.2, d * 0.2) * 0.6);
            else if (surface === 'water') tap.copy(WET);
            else {
              tap.copy(surfaceColor(surface));
              // Shoulders fade into the verge so the racing surface reads as a path.
              const edge = THREE.MathUtils.smoothstep(ad, hw + 1, hw + 3.5);
              tap.lerp(VERGE, edge * 0.7);
              if (surface === 'stone') stone += (1 - edge) / TAPS.length;
              if (surface === 'leaves') leaf += (1 - edge * 0.5) / TAPS.length;
            }
            r += tap.r;
            g += tap.g;
            b += tap.b;
          }
          col.setRGB(r / TAPS.length, g / TAPS.length, b / TAPS.length);
        }
        const shade = 0.9 + noise2(s * 0.31 + 4, d * 0.31) * 0.2;
        colors.set([col.r * shade, col.g * shade, col.b * shade], v * 3);
        mix.set([stone, leaf], v * 2);
        v += 1;
      }
    }
    const indices: number[] = [];
    for (let r = 0; r < r1 - r0; r += 1) {
      for (let ci = 0; ci < cols - 1; ci += 1) {
        const a = r * cols + ci;
        const b = a + 1;
        const c = a + cols;
        const e = c + 1;
        indices.push(a, b, c, b, e, c);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setAttribute('aMix', new THREE.BufferAttribute(mix, 2));
    geo.setIndex(indices);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, material);
    mesh.receiveShadow = true;
    mesh.name = 'terrainChunk';
    group.add(mesh);
  }

  // Water: a sheet at the un-dug ground level wherever a basin holds water.
  const wPos: number[] = [];
  const wUv: number[] = [];
  const wIdx: number[] = [];
  const corner = (s: number, d: number) => {
    track.toWorld(s, d, pos);
    wPos.push(pos.x, track.height(s, d, true) - 0.16, pos.z);
    wUv.push(d / 9, s / 9);
  };
  for (let s = 370; s < track.length; s += 2) {
    for (let d = -24; d < 24; d += 1.5) {
      const dug = track.height(s + 1, d + 0.75, true) - track.height(s + 1, d + 0.75);
      if (dug < 0.2 || track.surface(s + 1, d + 0.75) === 'mud') continue;
      const base = wPos.length / 3;
      corner(s, d);
      corner(s, d + 1.5);
      corner(s + 2, d);
      corner(s + 2, d + 1.5);
      wIdx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }
  const waterGeo = new THREE.BufferGeometry();
  waterGeo.setAttribute('position', new THREE.Float32BufferAttribute(wPos, 3));
  waterGeo.setAttribute('uv', new THREE.Float32BufferAttribute(wUv, 2));
  waterGeo.setIndex(wIdx);
  waterGeo.computeVertexNormals();
  const ripple = createRippleTexture();
  const water = new THREE.Mesh(
    waterGeo,
    new THREE.MeshStandardMaterial({ map: ripple, transparent: true, opacity: 0.82, roughness: 0.12, metalness: 0.1, depthWrite: false }),
  );
  water.name = 'water';
  water.renderOrder = 1;
  group.add(water);

  return {
    group,
    water,
    update(time: number) {
      ripple.offset.set(time * 0.02, -time * 0.05);
    },
  };
}
