import * as THREE from 'three';
import { damp } from '../utils/random.js';

// Dynamic weather: clear, overcast and tropical showers that roll in and out.
// The sky, fog, sun and road sheen read `overcast` / `rain` / `wet` from here
// (see World.update). Rain is one LineSegments draw call animated entirely in
// the vertex shader, wrapped around the camera, so it costs no CPU per drop.

const RAIN_VERT = /* glsl */ `
uniform float uTime;
uniform vec3 uCam;
attribute float aEnd;
attribute float aSpeed;
varying float vAlpha;
void main() {
  vec3 box = vec3(46.0, 30.0, 46.0);
  vec3 p = position * box;
  p.y -= uTime * aSpeed;
  p.x += uTime * 3.0;
  vec3 local = mod(p - uCam, box) - box * 0.5;
  vec3 w = uCam + local;
  float len = 0.7 + aSpeed * 0.045;
  w.y += aEnd * len;
  w.x += aEnd * len * 0.14;
  vec4 mv = viewMatrix * vec4(w, 1.0);
  vAlpha = (1.0 - aEnd * 0.7) * smoothstep(23.0, 12.0, length(local.xz)) * smoothstep(0.6, 3.0, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const RAIN_FRAG = /* glsl */ `
uniform float uOpacity;
uniform vec3 uColor;
varying float vAlpha;
void main() {
  gl_FragColor = vec4(uColor, vAlpha * uOpacity);
}`;

const MAX_DROPS = 2600;

export class Weather {
  constructor(game) {
    this.game = game;
    this.overcast = 0; // 0 clear .. 1 fully grey
    this.rain = 0; // 0 dry .. 1 downpour
    this.wet = 0; // road wetness, lags behind the rain and dries slowly
    this.flash = 0; // lightning
    this.target = 'clear';
    this.timer = 150 + Math.random() * 120; // first change
    this.thunder = 20;

    const pos = new Float32Array(MAX_DROPS * 6), end = new Float32Array(MAX_DROPS * 2), speed = new Float32Array(MAX_DROPS * 2);
    for (let i = 0; i < MAX_DROPS; i++) {
      const x = Math.random(), y = Math.random(), z = Math.random(), s = 15 + Math.random() * 9;
      pos.set([x, y, z, x, y, z], i * 6);
      end.set([0, 1], i * 2);
      speed.set([s, s], i * 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
    this.uniforms = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uOpacity: { value: 0 }, uColor: { value: new THREE.Color(0.86, 0.9, 0.97) } };
    this.mesh = new THREE.LineSegments(geo, new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG, transparent: true, depthWrite: false, fog: false }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;
    game.scene.add(this.mesh);
  }

  /** 'clear' | 'cloudy' | 'rain'; instant = skip the transition (settings, tests). */
  set(kind, instant = false) {
    this.target = kind;
    this.timer = 200 + Math.random() * 260;
    if (instant) {
      this.overcast = kind === 'clear' ? 0 : kind === 'cloudy' ? 0.7 : 1;
      this.rain = kind === 'rain' ? 1 : 0;
      this.wet = this.rain;
    }
  }

  update(dt) {
    const g = this.game, mode = g.settings.weather || 'dynamic';
    if (mode === 'dynamic') {
      this.timer -= dt;
      if (this.timer <= 0) {
        const r = Math.random();
        // showers pass; clear skies are the norm on the coast
        const next = this.target === 'rain' ? (r < 0.6 ? 'cloudy' : 'clear') : this.target === 'cloudy' ? (r < 0.45 ? 'rain' : 'clear') : (r < 0.6 ? 'cloudy' : r < 0.75 ? 'rain' : 'clear');
        this.set(next);
        if (next === 'rain') this.timer = 110 + Math.random() * 120;
      }
    } else if (this.target !== mode) this.set(mode);

    const oc = this.target === 'clear' ? 0 : this.target === 'cloudy' ? 0.7 : 1;
    this.overcast = damp(this.overcast, oc, 0.06, dt);
    if (Math.abs(this.overcast - oc) < 0.004) this.overcast = oc;
    const wantRain = this.target === 'rain' && this.overcast > 0.8 ? 1 : 0;
    this.rain += Math.sign(wantRain - this.rain) * Math.min(Math.abs(wantRain - this.rain), dt / 14);
    this.wet += this.rain > this.wet ? Math.min(this.rain - this.wet, dt / 12) : -Math.min(this.wet, dt / 75);

    // lightning + thunder in heavy rain
    this.flash = Math.max(0, this.flash - dt * 5);
    if (this.rain > 0.7) {
      this.thunder -= dt;
      if (this.thunder <= 0) {
        this.thunder = 14 + Math.random() * 26;
        this.flash = 1;
        const delay = 400 + Math.random() * 1800;
        setTimeout(() => g.state === 'playing' && g.audio.thunder(1 - delay / 3200), delay);
      }
    }

    const inside = !!g.interior;
    const m = this.mesh;
    m.visible = this.rain > 0.02 && !inside;
    if (m.visible) {
      const q = g.settings.quality === 'low' ? 0.5 : 1;
      m.geometry.setDrawRange(0, Math.floor(MAX_DROPS * q * (0.25 + 0.75 * this.rain)) * 2);
      this.uniforms.uTime.value = g.world.elapsed;
      this.uniforms.uCam.value.copy(g.camera.position);
      const night = g.world.night;
      this.uniforms.uOpacity.value = this.rain * (0.62 - night * 0.3);
    }
  }
}
