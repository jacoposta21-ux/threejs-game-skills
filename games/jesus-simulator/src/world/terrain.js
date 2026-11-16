import * as THREE from 'three';
import { createRng, smoothstep, lerp } from '../core/rng.js';
import { WORLD_HALF, LAKE, ROADS, PLAZA, MARKET, DESERT_Z, FARM, OUTPOST, CIRCUIT, HAMLET, CAMP, OASIS, ISLE, terrainHeight } from './layout.js';
import { detailTexture } from './textures.js';

const SPLAT = 1024;
const toPx = (v) => ((v + WORLD_HALF) / (WORLD_HALF * 2)) * SPLAT;
const mToPx = (m) => (m / (WORLD_HALF * 2)) * SPLAT;

function mixColor(out, a, b, t) {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
}

/** Paints the ground colour map: sand village, dry-grass hills, beach, rocky edges, roads, plaza. */
export function paintSplat() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SPLAT;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(SPLAT, SPLAT);
  const rng = createRng(3);
  const sand = [214, 190, 140];
  const dust = [198, 172, 120];
  const grass = [150, 156, 86];
  const lush = [118, 138, 70];
  const rock = [160, 140, 112];
  const beach = [228, 208, 160];
  const wet = [120, 120, 96];
  const desertA = [232, 204, 150];
  const desertB = [220, 186, 128];
  const meadow = [128, 150, 74];
  const c = [0, 0, 0];
  const c2 = [0, 0, 0];
  for (let py = 0; py < SPLAT; py += 1) {
    const z = (py / SPLAT) * WORLD_HALF * 2 - WORLD_HALF;
    for (let px = 0; px < SPLAT; px += 1) {
      const x = (px / SPLAT) * WORLD_HALF * 2 - WORLD_HALF;
      const h = terrainHeight(x, z);
      const n = Math.sin(x * 0.21 + Math.sin(z * 0.13)) * 0.5 + Math.sin(z * 0.17 - x * 0.07) * 0.5;
      const d = Math.hypot(x, z);
      mixColor(c, grass, lush, smoothstep(-0.4, 0.8, n));
      mixColor(c2, sand, dust, smoothstep(-0.5, 0.6, n));
      mixColor(c, c2, c, smoothstep(48, 92, d));
      // greener countryside in the west, sand dunes in the south
      if (x < -95) mixColor(c, c, meadow, smoothstep(-95, -135, x) * 0.55 * (1 - smoothstep(DESERT_Z - 20, DESERT_Z, z)));
      const des = smoothstep(DESERT_Z - 18, DESERT_Z + 22, z);
      if (des > 0) {
        mixColor(c2, desertA, desertB, smoothstep(-0.6, 0.7, Math.sin(x * 0.08 + z * 0.03) + n * 0.4));
        mixColor(c, c, c2, des);
      }
      if (h > 9 && des < 0.5) mixColor(c, c, rock, smoothstep(9, 16, h) * 0.8);
      const ld = Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);
      if (ld < 1.25) mixColor(c, c, beach, 1 - smoothstep(1.0, 1.22, ld));
      if (h < 0.3) mixColor(c, c, wet, smoothstep(0.3, -1.5, h));
      const edge = Math.max(Math.abs(x), Math.abs(z));
      if (edge > 200) mixColor(c, c, rock, smoothstep(200, 235, edge));
      const j = (rng() - 0.5) * 10;
      const i = (py * SPLAT + px) * 4;
      img.data[i] = c[0] + j;
      img.data[i + 1] = c[1] + j;
      img.data[i + 2] = c[2] + j * 0.8;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // roads: soft dusty edges then compacted centre
  ctx.lineCap = ctx.lineJoin = 'round';
  for (const road of ROADS) {
    const path = () => {
      ctx.beginPath();
      road.points.forEach(([x, z], i) => (i ? ctx.lineTo(toPx(x), toPx(z)) : ctx.moveTo(toPx(x), toPx(z))));
    };
    path();
    ctx.strokeStyle = 'rgba(205,180,130,0.55)';
    ctx.lineWidth = mToPx(road.width + 3);
    ctx.stroke();
    path();
    ctx.strokeStyle = 'rgb(222,200,154)';
    ctx.lineWidth = mToPx(road.width);
    ctx.stroke();
    path();
    ctx.strokeStyle = 'rgba(170,140,96,0.35)';
    ctx.setLineDash([mToPx(0.6), mToPx(1.4)]);
    ctx.lineWidth = mToPx(road.width * 0.35);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  paintRegions(ctx);

  // town square paving: concentric flagstone rings
  const cx = toPx(PLAZA.x);
  const cz = toPx(PLAZA.z);
  ctx.fillStyle = 'rgb(226,212,182)';
  ctx.beginPath();
  ctx.arc(cx, cz, mToPx(PLAZA.r), 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(150,128,96,0.5)';
  ctx.lineWidth = 1;
  for (let r = 2; r < PLAZA.r; r += 1.6) {
    ctx.beginPath();
    ctx.arc(cx, cz, mToPx(r), 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 10) {
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * mToPx(2), cz + Math.sin(a) * mToPx(2));
    ctx.lineTo(cx + Math.cos(a) * mToPx(PLAZA.r), cz + Math.sin(a) * mToPx(PLAZA.r));
    ctx.stroke();
  }
  // market flagstones
  ctx.fillStyle = 'rgb(218,202,168)';
  const mx = toPx(MARKET.x0);
  const mz = toPx(MARKET.z0);
  const mw = toPx(MARKET.x1) - mx;
  const mh = toPx(MARKET.z1) - mz;
  ctx.fillRect(mx, mz, mw, mh);
  ctx.strokeStyle = 'rgba(150,128,96,0.45)';
  for (let x = MARKET.x0; x <= MARKET.x1; x += 2) {
    ctx.beginPath();
    ctx.moveTo(toPx(x), mz);
    ctx.lineTo(toPx(x), mz + mh);
    ctx.stroke();
  }
  for (let z = MARKET.z0; z <= MARKET.z1; z += 2) {
    ctx.beginPath();
    ctx.moveTo(mx, toPx(z));
    ctx.lineTo(mx + mw, toPx(z));
    ctx.stroke();
  }
  return canvas;
}

/** Phase 5 ground: farmyard, fields, the circus track, fort yard, hamlet beach, camp, oasis grass. */
function paintRegions(ctx) {
  const rect = (r, fill) => {
    ctx.fillStyle = fill;
    ctx.fillRect(toPx(r.x0), toPx(r.z0), mToPx(r.x1 - r.x0), mToPx(r.z1 - r.z0));
  };
  const ellipse = (x, z, rx, rz, fill) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(toPx(x), toPx(z), mToPx(rx), mToPx(rz), 0, 0, Math.PI * 2);
    ctx.fill();
  };
  // wheat fields (stubble under the tufts) and the farmyard
  rect({ x0: -178, x1: -132, z0: -24, z1: -5 }, 'rgb(196,170,98)');
  rect({ x0: -126, x1: -104, z0: 12, z1: 34 }, 'rgb(196,170,98)');
  rect({ x0: FARM.x - 18, x1: FARM.x + 18, z0: FARM.z - 15, z1: FARM.z + 15 }, 'rgba(204,180,132,0.9)');
  rect({ x0: FARM.x - 15, x1: FARM.x + 15, z0: FARM.z + 20, z1: FARM.z + 38 }, 'rgba(150,128,82,0.55)');
  // the fort yard
  const o = OUTPOST.compound;
  rect({ x0: o.x0, x1: o.x1, z0: o.z0, z1: o.z1 }, 'rgb(206,190,156)');
  // circus track: dirt oval with the spina island and a white start line
  ellipse(CIRCUIT.x, CIRCUIT.z, CIRCUIT.rx + 1.5, CIRCUIT.rz + 1.5, 'rgb(196,160,110)');
  ellipse(CIRCUIT.x, CIRCUIT.z, CIRCUIT.innerRx, CIRCUIT.innerRz, 'rgb(170,160,100)');
  ctx.fillStyle = 'rgb(246,242,230)';
  ctx.fillRect(toPx(CIRCUIT.x) - mToPx(0.3), toPx(CIRCUIT.z + CIRCUIT.innerRz), mToPx(0.6), mToPx(CIRCUIT.rz - CIRCUIT.innerRz + 1.5));
  // hamlet beach, camp sand, oasis grass, isle sand
  ellipse(HAMLET.x, HAMLET.z + 6, 22, 14, 'rgba(226,204,160,0.85)');
  ellipse(CAMP.x, CAMP.z, 17, 13, 'rgba(214,184,132,0.8)');
  ellipse(OASIS.x, OASIS.z, 15, 15, 'rgba(118,146,68,0.75)');
  ellipse(OASIS.x, OASIS.z, 9.5, 9.5, 'rgba(150,140,90,0.8)');
  ellipse(ISLE.x, ISLE.z, 10, 10, 'rgba(232,212,166,0.9)');
}

export function drawGroundDecal(canvas, fn) {
  fn(canvas.getContext('2d'), toPx, mToPx);
}

/**
 * Builds the visual terrain mesh and the vertex/index arrays used for the
 * physics trimesh (same triangles, so feet and collision agree).
 */
export function buildTerrain(splatCanvas, segments = 200) {
  const size = WORLD_HALF * 2;
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const map = new THREE.CanvasTexture(splatCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const detail = detailTexture();
  const material = new THREE.MeshStandardMaterial({ map, roughness: 0.95, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.detailMap = { value: detail };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D detailMap;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float dA = texture2D(detailMap, vMapUv * 140.0).r;
        float dB = texture2D(detailMap, vMapUv * 31.0).r;
        diffuseColor.rgb *= 0.72 + 0.56 * mix(dA, dB, 0.4);`,
      );
  };
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'terrain';
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;

  const vertices = new Float32Array(pos.array);
  const indices = new Uint32Array(geometry.index.array);
  return { mesh, vertices, indices };
}

/** Stylised lake surface with gentle animated swell and shoreline foam. */
export function buildLake() {
  const geometry = new THREE.CircleGeometry(1, 96, 0, Math.PI * 2);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({
    color: '#3fa0b8',
    roughness: 0.18,
    metalness: 0.05,
    transparent: true,
    opacity: 0.88,
  });
  const uniforms = { uTime: { value: 0 } };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vWorldP;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 wp = modelMatrix * vec4(transformed, 1.0);
        transformed.y += sin(wp.x * 0.25 + uTime * 1.3) * 0.08 + cos(wp.z * 0.21 + uTime) * 0.08;
        vWorldP = wp.xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vWorldP;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float ripple = sin(vWorldP.x * 0.9 + uTime * 1.7) * sin(vWorldP.z * 0.8 - uTime * 1.3);
        diffuseColor.rgb += vec3(0.05, 0.08, 0.08) * smoothstep(0.6, 1.0, ripple);`,
      );
  };
  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.set(LAKE.rx * 1.02, 1, LAKE.rz * 1.02);
  mesh.position.set(LAKE.x, 0, LAKE.z);
  mesh.name = 'lake';
  mesh.receiveShadow = true;
  return { mesh, uniforms };
}

export { lerp };
