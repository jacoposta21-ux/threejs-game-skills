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
      uGlow: { value: 0.55 },
      uClouds: { value: 0.35 },
      uStars: { value: 0 },
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
      uniform float uGlow, uClouds, uStars;
      varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.55));
        col = mix(col, uGround, smoothstep(0.0, -0.15, h));
        float s = max(dot(normalize(vDir), uSun), 0.0);
        col += (vec3(1.0, 0.78, 0.45) * pow(s, 18.0) * 0.55 + vec3(1.0, 0.9, 0.7) * pow(s, 900.0) * 6.0) * (uGlow / 0.55);
        // Wispy high cloud bands.
        float c = sin(vDir.x * 9.0 + vDir.z * 4.0) * sin(vDir.z * 13.0 - vDir.x * 3.0);
        col = mix(col, mix(vec3(1.0, 0.93, 0.85), uHorizon, 0.5), smoothstep(0.55, 0.95, c) * smoothstep(0.05, 0.35, h) * uClouds);
        // Night: a sparse star field above the city glow.
        if (uStars > 0.0) {
          vec3 q = floor(vDir * 260.0);
          float r = fract(sin(dot(q, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          col += vec3(0.9, 0.92, 1.0) * step(0.9975, r) * smoothstep(0.15, 0.6, h) * uStars;
        }
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

  return { sun, hemi, rim, sky, skyMat, skyGeo, envRT, scene, renderer, quality };
}

/** Re-light the scene for a venue style (see world/Venues.js VENUE_STYLE). */
export function applyVenueLighting(env, style) {
  const u = env.skyMat.uniforms;
  u.uZenith.value.set(style.sky.zenith);
  u.uHorizon.value.set(style.sky.horizon);
  u.uGround.value.set(style.sky.ground);
  u.uGlow.value = style.sky.sunGlow;
  u.uClouds.value = style.sky.clouds;
  u.uStars.value = style.night ? 1 : 0;
  const dir = new THREE.Vector3(...style.sun.dir).normalize();
  u.uSun.value.copy(dir);
  env.sun.position.copy(dir).multiplyScalar(40);
  env.sun.color.set(style.sun.color);
  env.sun.intensity = style.sun.intensity;
  env.hemi.color.set(style.hemi.sky);
  env.hemi.groundColor.set(style.hemi.ground);
  env.hemi.intensity = style.hemi.intensity;
  env.rim.color.set(style.rim.color);
  env.rim.intensity = style.rim.intensity;
  env.scene.fog.color.set(style.fog.color);
  env.scene.fog.near = style.fog.near;
  env.scene.fog.far = style.fog.far;
  // Image-based ambient follows the new sky.
  const pmrem = new THREE.PMREMGenerator(env.renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(env.skyGeo, env.skyMat));
  const rt = pmrem.fromScene(envScene, 0.02);
  env.envRT.dispose();
  env.envRT = rt;
  env.scene.environment = rt.texture;
  env.scene.environmentIntensity = style.env;
  pmrem.dispose();
}
