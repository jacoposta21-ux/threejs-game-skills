import * as THREE from 'three';
import { mergeColored } from './geometry.js';
import { createRng } from '../core/rng.js';

/** Gradient sky dome with a soft sun glow; follows the camera. */
export function createSky(sunDir) {
  const uniforms = {
    uTop: { value: new THREE.Color('#5d9fe0') },
    uHorizon: { value: new THREE.Color('#f3dcae') },
    uBottom: { value: new THREE.Color('#e9d2a6') },
    uSun: { value: sunDir.clone().normalize() },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom; uniform vec3 uSun; varying vec3 vDir;
      void main(){
        float h = vDir.y;
        vec3 col = mix(uHorizon, uTop, pow(smoothstep(0.0, 0.75, h), 0.7));
        col = mix(col, uBottom, smoothstep(0.0, -0.2, h));
        float s = max(dot(normalize(vDir), uSun), 0.0);
        col += vec3(1.0, 0.85, 0.55) * pow(s, 8.0) * 0.35 + vec3(1.0, 0.95, 0.8) * pow(s, 400.0) * 2.0;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), material);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  mesh.name = 'sky';
  return { mesh, uniforms };
}

/** Chunky stylised clouds (merged boxes) drifting slowly. */
export function createClouds() {
  const rng = createRng(909);
  const parts = [];
  for (let c = 0; c < 22; c += 1) {
    const a = rng() * Math.PI * 2;
    const r = rng.range(120, 330);
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    const cy = rng.range(85, 130);
    const n = 3 + Math.floor(rng() * 4);
    for (let i = 0; i < n; i += 1) {
      const w = rng.range(14, 30);
      parts.push({
        geometry: new THREE.BoxGeometry(w, rng.range(5, 9), rng.range(10, 18)),
        color: i === 0 ? '#ffffff' : '#f6f1ea',
        t: { x: cx + rng.range(-18, 18), y: cy + rng.range(-2, 4), z: cz + rng.range(-8, 8) },
      });
    }
  }
  const geometry = mergeColored(parts);
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1, emissive: '#fff4e0', emissiveIntensity: 0.55, fog: false, transparent: true, opacity: 0.92,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'clouds';
  mesh.frustumCulled = false;
  return mesh;
}
