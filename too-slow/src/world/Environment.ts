import * as THREE from 'three';
import { createSoftSprite } from './Textures';

export const SKY = {
  top: new THREE.Color(0x3d9bf2),
  horizon: new THREE.Color(0xd8f3ff),
  ground: new THREE.Color(0x9bd67a),
  fog: new THREE.Color(0xcfeefd),
};

export interface EnvironmentResult {
  group: THREE.Group;
  sun: THREE.DirectionalLight;
  /** Keep sky and shadow frustum centred on the action. */
  follow(target: THREE.Vector3, camera: THREE.Camera): void;
  setShadowQuality(level: number): void;
}

const SUN_DIR = new THREE.Vector3(-0.45, 0.78, 0.44).normalize();

export function buildEnvironment(scene: THREE.Scene, renderer: THREE.WebGLRenderer): EnvironmentResult {
  const group = new THREE.Group();
  group.name = 'environment';

  scene.fog = new THREE.Fog(SKY.fog, 140, 760);

  // Gradient sky dome with a warm glow around the sun.
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: SKY.top },
      uHorizon: { value: SKY.horizon },
      uGround: { value: SKY.ground },
      uSun: { value: SUN_DIR },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uGround; uniform vec3 uSun; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55));
        col = mix(col, uGround, smoothstep(0.0, -0.35, h));
        float sun = max(dot(d, uSun), 0.0);
        col += vec3(1.0, 0.86, 0.6) * (pow(sun, 420.0) * 1.6 + pow(sun, 9.0) * 0.22);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 16), skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  group.add(sky);

  // Fluffy clouds as soft sprites riding with the sky.
  const cloudTex = createSoftSprite('rgba(255,255,255,0.95)', 'rgba(255,255,255,0)');
  const clouds = new THREE.Group();
  const cloudMat = new THREE.SpriteMaterial({ map: cloudTex, fog: false, depthWrite: false, transparent: true, opacity: 0.9 });
  const seeds = [0.12, 0.5, 0.83, 0.27, 0.66, 0.95, 0.4, 0.05, 0.74];
  seeds.forEach((seed, i) => {
    const a = seed * Math.PI * 2;
    const el = 0.22 + ((i * 37) % 10) * 0.035;
    const cx = Math.cos(a) * Math.cos(el) * 780;
    const cy = Math.sin(el) * 780;
    const cz = Math.sin(a) * Math.cos(el) * 780;
    for (let k = 0; k < 5; k += 1) {
      const puff = new THREE.Sprite(cloudMat);
      const size = 120 + ((i + k) % 3) * 50;
      puff.position.set(cx + (k - 2) * 70, cy + ((k * 13) % 5) * 9 - (k % 2) * 16, cz + ((k * 29) % 7) * 12);
      puff.scale.set(size * 1.5, size * 0.8, 1);
      clouds.add(puff);
    }
  });
  clouds.renderOrder = -9;
  group.add(clouds);

  // Soft, bright cartoon lighting: sky fill + warm key + cool bounce.
  const hemi = new THREE.HemisphereLight(0xdff3ff, 0x7fb054, 1.05);
  group.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 260;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.06;
  group.add(sun, sun.target);
  const rim = new THREE.DirectionalLight(0xbfe4ff, 0.55);
  rim.position.set(0.5, 0.4, -0.8);
  group.add(rim);

  // Image-based light from the sky itself so the glossy shells pick up reflections.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 24, 16), skyMat));
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;
  scene.environmentIntensity = 0.32;
  pmrem.dispose();

  let extent = 46;
  const applyShadow = () => {
    const cam = sun.shadow.camera;
    cam.left = -extent;
    cam.right = extent;
    cam.top = extent;
    cam.bottom = -extent;
    cam.updateProjectionMatrix();
  };
  applyShadow();

  const snapped = new THREE.Vector3();
  return {
    group,
    sun,
    follow(target, camera) {
      sky.position.copy(camera.position);
      clouds.position.copy(camera.position);
      // Snap to texel-sized steps so shadows don't shimmer while the snail moves.
      const texel = (extent * 2) / sun.shadow.mapSize.x;
      snapped.set(Math.round(target.x / texel) * texel, Math.round(target.y / texel) * texel, Math.round(target.z / texel) * texel);
      sun.target.position.copy(snapped);
      sun.position.copy(snapped).addScaledVector(SUN_DIR, 120);
    },
    setShadowQuality(level) {
      sun.castShadow = level > 0;
      const size = level > 1 ? 2048 : 1024;
      extent = level > 1 ? 46 : 38;
      if (sun.shadow.mapSize.x !== size) {
        sun.shadow.mapSize.set(size, size);
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
      }
      applyShadow();
    },
  };
}
