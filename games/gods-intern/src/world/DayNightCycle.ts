import * as THREE from 'three';

interface Key {
  t: number;
  sky: number;
  horizon: number;
  sun: number;
  sunI: number;
  hemiSky: number;
  hemiGround: number;
  hemiI: number;
}

// Time of day keyframes (0 = midnight). Nights stay bright enough to play.
const KEYS: Key[] = [
  { t: 0.0, sky: 0x1b2a5a, horizon: 0x3c4f8a, sun: 0x9fb4ff, sunI: 0.75, hemiSky: 0x6b7fc4, hemiGround: 0x2a2f4a, hemiI: 1.25 },
  { t: 0.22, sky: 0x2d3d78, horizon: 0x6a5d9c, sun: 0xb0b8ff, sunI: 0.7, hemiSky: 0x7c85c8, hemiGround: 0x3a3550, hemiI: 1.2 },
  { t: 0.27, sky: 0x6f8fd6, horizon: 0xffa87a, sun: 0xffb277, sunI: 1.6, hemiSky: 0xffd2b0, hemiGround: 0x5e5a4a, hemiI: 1.25 },
  { t: 0.36, sky: 0x6cb4f2, horizon: 0xcfe8ff, sun: 0xfff0d2, sunI: 2.6, hemiSky: 0xdff1ff, hemiGround: 0x6f7d4c, hemiI: 1.35 },
  { t: 0.5, sky: 0x5aaef0, horizon: 0xd8efff, sun: 0xfff6e2, sunI: 2.9, hemiSky: 0xe8f6ff, hemiGround: 0x74814e, hemiI: 1.4 },
  { t: 0.66, sky: 0x66acec, horizon: 0xf2e2c4, sun: 0xffe6b8, sunI: 2.6, hemiSky: 0xf2eedb, hemiGround: 0x7a7a4e, hemiI: 1.35 },
  { t: 0.76, sky: 0x6b78c9, horizon: 0xff9a6b, sun: 0xff9a5c, sunI: 1.8, hemiSky: 0xffc2a0, hemiGround: 0x5c4a44, hemiI: 1.25 },
  { t: 0.83, sky: 0x2f3c7c, horizon: 0x8a5a8c, sun: 0xc9a8ff, sunI: 0.85, hemiSky: 0x8a86c8, hemiGround: 0x35304a, hemiI: 1.2 },
  { t: 1.0, sky: 0x1b2a5a, horizon: 0x3c4f8a, sun: 0x9fb4ff, sunI: 0.75, hemiSky: 0x6b7fc4, hemiGround: 0x2a2f4a, hemiI: 1.25 },
];

const skyVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position.z = gl_Position.w;
}`;
const skyFragment = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uNight;
varying vec3 vDir;
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.2, 1.0);
  vec3 col = mix(uHorizon, uTop, smoothstep(-0.02, 0.55, h));
  float s = max(0.0, dot(d, normalize(uSunDir)));
  col += uSunColor * (pow(s, 900.0) * 3.0 + pow(s, 12.0) * 0.28) * (1.0 - uNight * 0.5);
  vec3 cell = floor(d * 140.0);
  float star = step(0.9965, hash(cell)) * smoothstep(0.05, 0.4, d.y) * uNight;
  col += vec3(star);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const cA = new THREE.Color();
const cB = new THREE.Color();

function lerpKey(t: number, field: keyof Omit<Key, 't' | 'sunI' | 'hemiI'>, out: THREE.Color): THREE.Color {
  for (let i = 0; i < KEYS.length - 1; i++) {
    const a = KEYS[i];
    const b = KEYS[i + 1];
    if (t >= a.t && t <= b.t) {
      const k = (t - a.t) / (b.t - a.t);
      return out.copy(cA.set(a[field])).lerp(cB.set(b[field]), k);
    }
  }
  return out.set(KEYS[0][field]);
}

function lerpNum(t: number, field: 'sunI' | 'hemiI'): number {
  for (let i = 0; i < KEYS.length - 1; i++) {
    const a = KEYS[i];
    const b = KEYS[i + 1];
    if (t >= a.t && t <= b.t) return a[field] + (b[field] - a[field]) * ((t - a.t) / (b.t - a.t));
  }
  return KEYS[0][field];
}

/** Sun/moon direction, sky dome, fog and ambient colors driven by time of day. */
export class DayNightCycle {
  readonly sun = new THREE.DirectionalLight(0xffffff, 2.5);
  readonly hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.3);
  readonly sky: THREE.Mesh;
  readonly sunDir = new THREE.Vector3();
  readonly sunColor = new THREE.Color();
  readonly horizon = new THREE.Color();
  readonly top = new THREE.Color();
  night = 0;
  private readonly skyMat: THREE.ShaderMaterial;

  constructor(private readonly scene: THREE.Scene) {
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 320;
    const s = 70;
    this.sun.shadow.camera.left = -s;
    this.sun.shadow.camera.right = s;
    this.sun.shadow.camera.top = s;
    this.sun.shadow.camera.bottom = -s;
    scene.add(this.sun, this.sun.target, this.hemi);
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: skyVertex,
      fragmentShader: skyFragment,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3() },
        uSunColor: { value: new THREE.Color() },
        uNight: { value: 0 },
      },
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);
    scene.fog = new THREE.Fog(0xcfe8ff, 170, 520);
  }

  /** @param t time of day 0..1, @param focus shadow-camera focus point */
  update(t: number, focus: THREE.Vector3, cameraPos: THREE.Vector3): void {
    // Sun travels east→west across the south; at night a softer moon takes over.
    const dayPhase = (t - 0.25) * Math.PI * 2; // 0 at sunrise
    const elevation = Math.sin(dayPhase);
    const isDay = elevation > -0.05;
    const az = dayPhase;
    const lightElev = isDay ? Math.max(0.18, elevation) : Math.max(0.35, -elevation * 0.9);
    const dirAz = isDay ? az : az + Math.PI;
    this.sunDir.set(Math.cos(dirAz) * Math.cos(Math.asin(Math.min(0.98, lightElev))), lightElev, 0.45).normalize();
    this.night = Math.max(0, Math.min(1, (-elevation + 0.12) / 0.3));

    lerpKey(t, 'sun', this.sunColor);
    lerpKey(t, 'horizon', this.horizon);
    lerpKey(t, 'sky', this.top);
    this.sun.color.copy(this.sunColor);
    this.sun.intensity = lerpNum(t, 'sunI');
    lerpKey(t, 'hemiSky', this.hemi.color);
    lerpKey(t, 'hemiGround', this.hemi.groundColor);
    this.hemi.intensity = lerpNum(t, 'hemiI');

    this.sun.position.copy(focus).addScaledVector(this.sunDir, 140);
    this.sun.target.position.copy(focus);
    this.sun.target.updateMatrixWorld();

    this.skyMat.uniforms.uTop.value.copy(this.top);
    this.skyMat.uniforms.uHorizon.value.copy(this.horizon);
    this.skyMat.uniforms.uSunDir.value.set(Math.cos(az), elevation, 0.45).normalize();
    this.skyMat.uniforms.uSunColor.value.copy(this.sunColor);
    this.skyMat.uniforms.uNight.value = this.night;
    this.sky.position.copy(cameraPos);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(this.horizon).lerp(this.top, 0.25);
  }

  setShadowQuality(mapSize: number): void {
    this.sun.castShadow = mapSize > 0;
    if (mapSize > 0) {
      this.sun.shadow.mapSize.set(mapSize, mapSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    }
  }
}
