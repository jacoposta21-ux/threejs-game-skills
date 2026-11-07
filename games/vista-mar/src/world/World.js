import * as THREE from 'three';
import { WATER_LEVEL } from './Layout.js';
import { waterNormalTexture, radialGlowTexture } from './textures.js';
import { clamp, smoothstep, lerp } from '../utils/random.js';

// Sky, sun/moon, fog, ocean, environment reflections and everything driven by
// the time of day (window lights, neon, street lamps, glow pools, signals).

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w; // keep at far plane
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 topColor;
uniform vec3 horizonColor;
uniform vec3 groundColor;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform vec3 moonDir;
uniform float stars;
uniform float time;
uniform float cloudCover;
uniform vec3 cloudColor;
varying vec3 vDir;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(horizonColor, topColor, pow(clamp(h, 0.0, 1.0), 0.45));
  col = mix(col, groundColor, smoothstep(0.0, -0.08, h));
  float sd = max(dot(d, sunDir), 0.0);
  // sun halo + disc
  col += sunColor * (pow(sd, 8.0) * 0.35 + pow(sd, 64.0) * 0.6);
  col += sunColor * smoothstep(0.9993, 0.9997, sd) * 6.0 * step(-0.05, sunDir.y);
  // moon
  float md = max(dot(d, moonDir), 0.0);
  col += vec3(0.85, 0.9, 1.0) * smoothstep(0.9994, 0.9997, md) * 1.6 * step(0.0, moonDir.y);
  col += vec3(0.2, 0.25, 0.4) * pow(md, 30.0) * 0.4 * step(0.0, moonDir.y);
  // stars
  if (stars > 0.0 && h > 0.0) {
    vec2 sp = d.xz / (d.y + 0.25) * 220.0;
    vec2 cell = floor(sp);
    float r = hash(cell);
    float tw = 0.6 + 0.4 * sin(time * 3.0 + r * 50.0);
    float s = step(0.985, r) * smoothstep(0.35, 0.0, length(fract(sp) - 0.5)) * tw;
    col += vec3(s) * stars * smoothstep(0.0, 0.25, h);
  }
  // clouds on a virtual plane
  if (h > 0.0) {
    vec2 cp = d.xz / (h + 0.08) * 1.6 + vec2(time * 0.006, time * 0.002);
    float c = fbm(cp);
    float cov = smoothstep(1.0 - cloudCover, 1.0 - cloudCover + 0.35, c);
    vec3 cc = cloudColor + sunColor * pow(sd, 6.0) * 0.6;
    col = mix(col, cc, cov * smoothstep(0.0, 0.12, h) * 0.85);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// Palette keys by sun elevation (sin of angle): night, twilight, golden, day.
const PAL = {
  night: { top: [0.012, 0.018, 0.05], hor: [0.04, 0.05, 0.1], sun: [0.0, 0.0, 0.0], cloud: [0.05, 0.06, 0.09], hemiSky: [0.12, 0.16, 0.3], hemiGround: [0.04, 0.04, 0.06] },
  twilight: { top: [0.08, 0.1, 0.28], hor: [0.62, 0.33, 0.32], sun: [1.0, 0.35, 0.2], cloud: [0.42, 0.25, 0.32], hemiSky: [0.42, 0.36, 0.5], hemiGround: [0.2, 0.14, 0.12] },
  golden: { top: [0.2, 0.36, 0.66], hor: [1.0, 0.68, 0.45], sun: [1.0, 0.62, 0.32], cloud: [1.0, 0.8, 0.7], hemiSky: [0.62, 0.66, 0.8], hemiGround: [0.36, 0.28, 0.2] },
  day: { top: [0.18, 0.42, 0.82], hor: [0.66, 0.8, 0.92], sun: [1.0, 0.95, 0.86], cloud: [0.96, 0.97, 1.0], hemiSky: [0.66, 0.78, 1.0], hemiGround: [0.42, 0.38, 0.32] },
};

function mixPal(a, b, t, key) {
  return a[key].map((v, i) => lerp(v, b[key][i], t));
}

export class World {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.renderer = game.renderer;
    this.timeOfDay = 17.3; // hours
    this.daySpeed = 24 / (16 * 60); // game hours per real second (16 min day)
    this.elapsed = 0;
    this.night = 0;
    this.sunDir = new THREE.Vector3();

    // --- sky dome
    this.skyUniforms = {
      topColor: { value: new THREE.Color() }, horizonColor: { value: new THREE.Color() }, groundColor: { value: new THREE.Color(0x1d2a33) },
      sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunColor: { value: new THREE.Color() }, moonDir: { value: new THREE.Vector3() },
      stars: { value: 0 }, time: { value: 0 }, cloudCover: { value: 0.42 }, cloudColor: { value: new THREE.Color() },
    };
    const skyMat = new THREE.ShaderMaterial({ uniforms: this.skyUniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), skyMat);
    this.sky.scale.setScalar(4000);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
    // separate small copy for environment-map capture
    this.envScene = new THREE.Scene();
    const envSky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), skyMat);
    envSky.scale.setScalar(50);
    this.envScene.add(envSky);
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTimer = 0;
    this.envRT = null;

    // --- lights
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -95; sc.right = 95; sc.top = 95; sc.bottom = -95; sc.near = 1; sc.far = 700;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // --- fog
    this.scene.fog = new THREE.Fog(0xaaccee, 120, 900);

    // --- ocean
    const wn = waterNormalTexture();
    wn.repeat.set(220, 220);
    this.waterNormal = wn;
    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(8000, 8000, 1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x1b5a6e, roughness: 0.08, metalness: 0.15, normalMap: wn, normalScale: new THREE.Vector2(0.55, 0.55), envMapIntensity: 1.1 }),
    );
    this.water.position.set(4440, WATER_LEVEL, 0);
    this.water.receiveShadow = true;
    this.scene.add(this.water);
    // shoreline foam strip
    const foamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false, map: radialGlowTexture() });
    this.foam = new THREE.Mesh(new THREE.PlaneGeometry(6, 1000, 1, 1).rotateX(-Math.PI / 2), foamMat);
    this.foam.position.set(466, WATER_LEVEL + 0.03, 0);
    this.scene.add(this.foam);
  }

  /** Glow pools under lamps/neon, beacons on towers, traffic signal lamps. */
  attachCity(city) {
    this.city = city;
    const glowTex = radialGlowTexture();
    const ground = city.props.glows.filter((g) => g.ground);
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.glowMat = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, color: 0xffffff, fog: true });
    const im = new THREE.InstancedMesh(geo, this.glowMat, ground.length);
    const m = new THREE.Matrix4();
    ground.forEach((g, i) => {
      const r = g.radius || 8;
      m.makeScale(r * 2, 1, r * 2).setPosition(g.x, (g.y || 0) + 0.06, g.z);
      im.setMatrixAt(i, m);
      im.setColorAt(i, new THREE.Color(g.color || 0xffd9a0));
    });
    im.renderOrder = 2;
    im.frustumCulled = false;
    this.scene.add(im);
    this.groundGlows = im;

    // red aircraft beacons on towers
    const beacons = city.props.glows.filter((g) => g.beacon);
    this.beaconMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.2, 0.15), toneMapped: false });
    const bim = new THREE.InstancedMesh(new THREE.SphereGeometry(0.6, 8, 6), this.beaconMat, Math.max(1, beacons.length));
    beacons.forEach((g, i) => { m.makeTranslation(g.x, g.y, g.z); bim.setMatrixAt(i, m); });
    bim.count = beacons.length;
    this.scene.add(bim);

    // traffic signal lamps: 3 bulbs per head, colour set every phase change
    const sig = city.props.signals;
    const bulbGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    this.signalMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this.signalMesh = new THREE.InstancedMesh(bulbGeo, this.signalMat, sig.length * 3);
    sig.forEach((s, i) => {
      for (let k = 0; k < 3; k++) {
        m.makeTranslation(s.x, 5.6 - k * 0.38, s.z);
        this.signalMesh.setMatrixAt(i * 3 + k, m);
        this.signalMesh.setColorAt(i * 3 + k, new THREE.Color(0x111111));
      }
    });
    this.scene.add(this.signalMesh);
    this.signalState = -1;
    this.signalClock = 0;
  }

  /** Traffic light phase for an axis at an intersection: 'green' | 'yellow' | 'red'. */
  signalPhase(axis, offset = 0) {
    const cycle = 26; // 11 green, 2 yellow, then red while the other axis runs
    const t = (this.signalClock + offset) % cycle;
    const ns = t < 11 ? 'green' : t < 13 ? 'yellow' : 'red';
    const ew = t < 13 ? 'red' : t < 24 ? 'green' : 'yellow';
    return axis === 'ns' ? ns : ew;
  }

  setTime(h) {
    this.timeOfDay = ((h % 24) + 24) % 24;
    this.envTimer = 999;
  }

  update(dt, focus) {
    this.elapsed += dt;
    this.timeOfDay = (this.timeOfDay + dt * this.daySpeed) % 24;
    const t = this.timeOfDay;
    // sun path: rises east (+x, over the ocean) at 6:00, sets west at 18:00
    const ang = ((t - 6) / 12) * Math.PI;
    this.sunDir.set(Math.cos(ang), Math.sin(ang) * 0.92, 0.38).normalize();
    const e = this.sunDir.y;
    const moonDir = this.sunDir.clone().negate();
    moonDir.z = 0.3; moonDir.normalize();

    // palette blend
    let col;
    if (e < -0.12) col = PAL.night;
    const blend = (a, b, k) => ({
      top: mixPal(a, b, k, 'top'), hor: mixPal(a, b, k, 'hor'), sun: mixPal(a, b, k, 'sun'), cloud: mixPal(a, b, k, 'cloud'),
      hemiSky: mixPal(a, b, k, 'hemiSky'), hemiGround: mixPal(a, b, k, 'hemiGround'),
    });
    if (e < -0.12) col = blend(PAL.night, PAL.night, 0);
    else if (e < 0.02) col = blend(PAL.night, PAL.twilight, smoothstep(-0.12, 0.02, e));
    else if (e < 0.16) col = blend(PAL.twilight, PAL.golden, smoothstep(0.02, 0.16, e));
    else col = blend(PAL.golden, PAL.day, smoothstep(0.16, 0.5, e));

    const u = this.skyUniforms;
    u.topColor.value.setRGB(...col.top);
    u.horizonColor.value.setRGB(...col.hor);
    u.sunColor.value.setRGB(...col.sun);
    u.cloudColor.value.setRGB(...col.cloud);
    u.sunDir.value.copy(this.sunDir);
    u.moonDir.value.copy(moonDir);
    u.time.value = this.elapsed;
    this.night = 1 - smoothstep(-0.1, 0.08, e);
    u.stars.value = smoothstep(0.5, 1, this.night);
    u.groundColor.value.setRGB(col.hor[0] * 0.35, col.hor[1] * 0.4, col.hor[2] * 0.45);

    this.scene.fog.color.setRGB(...col.hor);
    const fogFar = lerp(1100, 650, this.night);
    this.scene.fog.near = 90;
    this.scene.fog.far = fogFar;

    // lights
    const dayK = smoothstep(-0.04, 0.3, e);
    this.hemi.color.setRGB(...col.hemiSky);
    this.hemi.groundColor.setRGB(...col.hemiGround);
    this.hemi.intensity = lerp(0.55, 1.1, dayK);
    const sunUp = e > -0.03;
    const lightDir = sunUp ? this.sunDir : moonDir;
    if (sunUp) {
      this.sun.color.setRGB(...col.sun);
      this.sun.intensity = 3.3 * smoothstep(-0.03, 0.12, e);
    } else {
      this.sun.color.setRGB(0.55, 0.65, 1.0);
      this.sun.intensity = 0.45 * smoothstep(0.0, 0.2, moonDir.y);
    }
    // shadow camera follows the focus point, snapped to texels to avoid shimmer
    const f = focus;
    const texel = 190 / this.sun.shadow.mapSize.x;
    const fx = Math.round(f.x / texel) * texel, fz = Math.round(f.z / texel) * texel;
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx + lightDir.x * 300, Math.max(30, lightDir.y * 300), fz + lightDir.z * 300);
    this.sun.target.updateMatrixWorld();

    // exposure eases up at night so the city reads
    this.renderer.toneMappingExposure = lerp(0.95, 1.25, this.night);

    // water
    this.waterNormal.offset.x = (this.elapsed * 0.004) % 1;
    this.waterNormal.offset.y = (this.elapsed * 0.0025) % 1;
    this.water.material.color.setRGB(lerp(0.1, 0.02, this.night), lerp(0.36, 0.06, this.night), lerp(0.44, 0.1, this.night));
    this.foam.material.opacity = 0.18 + Math.sin(this.elapsed * 0.8) * 0.08;
    this.foam.position.x = 466 + Math.sin(this.elapsed * 0.5) * 1.2;

    // city lights
    if (this.city) {
      const n = this.night;
      const nm = this.city.nightMaterials;
      for (const m of nm.windows) m.emissiveIntensity = lerp(0, 1.6, smoothstep(0.15, 0.9, n));
      for (const m of nm.shops) m.emissiveIntensity = lerp(0.05, 1.4, n);
      for (const m of nm.neon) m.emissiveIntensity = lerp(0.35, 3.2, n);
      for (const m of nm.lamps) m.emissiveIntensity = lerp(0, 4, smoothstep(0.3, 0.8, n));
      this.glowMat.opacity = smoothstep(0.3, 0.9, n) * 0.55;
      this.beaconMat.color.setRGB(4 * (0.5 + 0.5 * Math.sin(this.elapsed * 3)) * (0.2 + n), 0.15, 0.1);
      this.updateSignals(dt);
    }

    // environment reflections refresh every few seconds
    this.envTimer += dt;
    if (this.envTimer > 4) {
      this.envTimer = 0;
      const rt = this.pmrem.fromScene(this.envScene, 0.02, 0.1, 100);
      if (this.envRT) this.envRT.dispose();
      this.envRT = rt;
      this.scene.environment = rt.texture;
      this.scene.environmentIntensity = lerp(1, 0.35, this.night);
    }
    this.sky.position.copy(this.game.camera.position);
  }

  updateSignals(dt) {
    this.signalClock += dt;
    const sig = this.city.props.signals;
    const key = Math.floor(this.signalClock); // phases change on whole seconds
    if (key === this.signalState) return;
    this.signalState = key;
    const c = new THREE.Color();
    const off = new THREE.Color(0x151515);
    sig.forEach((s, i) => {
      const ph = this.signalPhase(s.axis, s.offset);
      c.setRGB(3, 0.15, 0.1); this.signalMesh.setColorAt(i * 3, ph === 'red' ? c : off);
      c.setRGB(3, 1.8, 0.1); this.signalMesh.setColorAt(i * 3 + 1, ph === 'yellow' ? c : off);
      c.setRGB(0.2, 3, 0.8); this.signalMesh.setColorAt(i * 3 + 2, ph === 'green' ? c : off);
    });
    this.signalMesh.instanceColor.needsUpdate = true;
  }

  get clockString() {
    const h = Math.floor(this.timeOfDay), m = Math.floor((this.timeOfDay - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}

export { clamp };
