import * as THREE from 'three';

export const QUALITY_PRESETS = {
  low: { dpr: 1, shadows: false, shadowMap: 1024, far: 260, grass: 0.35 },
  medium: { dpr: 1.5, shadows: true, shadowMap: 2048, far: 380, grass: 0.7 },
  high: { dpr: 2, shadows: true, shadowMap: 2048, far: 520, grass: 1 },
};

export function createRenderer(canvas) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (error) {
    throw new Error('WebGL is not available in this browser. Please enable hardware acceleration or try another browser.');
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  return renderer;
}

export function resizeRenderer(renderer, camera, maxDpr) {
  const canvas = renderer.domElement;
  const width = canvas.clientWidth || window.innerWidth;
  const height = canvas.clientHeight || window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  const w = Math.floor(width * dpr);
  const h = Math.floor(height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  }
}
