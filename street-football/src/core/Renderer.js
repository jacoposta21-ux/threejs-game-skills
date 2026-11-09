import * as THREE from 'three';

export function createRenderer(canvas, quality) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: quality.antialias,
    alpha: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  // Always enabled so the Low/High switch can toggle the sun's castShadow live without recompiling.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  return renderer;
}

export function resizeRenderer(renderer, camera, maxDpr) {
  const canvas = renderer.domElement;
  const width = Math.max(1, Math.floor(canvas.clientWidth));
  const height = Math.max(1, Math.floor(canvas.clientHeight));
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  const bw = Math.floor(width * dpr);
  const bh = Math.floor(height * dpr);
  if (canvas.width === bw && canvas.height === bh) return false;
  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  // Portrait phones need a wider vertical FOV to keep the court readable.
  camera.userData.portrait = height > width;
  camera.updateProjectionMatrix();
  return true;
}
