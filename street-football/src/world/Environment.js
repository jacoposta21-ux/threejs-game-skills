import * as THREE from 'three';
import { COURT } from '../config.js';

/** Warm late-afternoon sky dome, sun, fill and fog, plus a PMREM env map for reflections. */
export function buildEnvironment(scene, renderer, quality) {
  const sunDir = new THREE.Vector3(-0.5, 0.66, -0.56).normalize();

  const skyGeo = new THREE.SphereGeometry(400, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uSun: { value: sunDir },
      uZenith: { value: new THREE.Color('#3b78c4') },
      uHorizon: { value: new THREE.Color('#f7cf9b') },
      uGround: { value: new THREE.Color('#8b7a66') },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun, uZenith, uHorizon, uGround;
      varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.55));
        col = mix(col, uGround, smoothstep(0.0, -0.15, h));
        float s = max(dot(normalize(vDir), uSun), 0.0);
        col += vec3(1.0, 0.78, 0.45) * pow(s, 18.0) * 0.55 + vec3(1.0, 0.9, 0.7) * pow(s, 900.0) * 6.0;
        // Wispy high cloud bands.
        float c = sin(vDir.x * 9.0 + vDir.z * 4.0) * sin(vDir.z * 13.0 - vDir.x * 3.0);
        col = mix(col, vec3(1.0, 0.93, 0.85), smoothstep(0.55, 0.95, c) * smoothstep(0.05, 0.35, h) * 0.35);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.name = 'sky';
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);

  scene.fog = new THREE.Fog('#e9c9a0', 70, 340);

  const hemi = new THREE.HemisphereLight('#ffeedd', '#6b6052', 1.45);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight('#ffd7a0', 3.1);
  sun.position.copy(sunDir).multiplyScalar(40);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = quality.shadows;
  sun.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
  const ext = COURT.halfLength + 6;
  sun.shadow.camera.left = -ext;
  sun.shadow.camera.right = ext;
  sun.shadow.camera.top = ext;
  sun.shadow.camera.bottom = -ext;
  sun.shadow.camera.near = 5;
  sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.025;
  scene.add(sun, sun.target);

  // Cool bounce from the sky side to separate players from the background.
  const rim = new THREE.DirectionalLight('#9cc2ff', 0.55);
  rim.position.set(12, 10, 18);
  scene.add(rim);

  // Image-based ambient from the sky itself.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(skyGeo, skyMat));
  const envRT = pmrem.fromScene(envScene, 0.02);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.35;
  pmrem.dispose();

  return { sun, hemi, sky, envRT };
}
