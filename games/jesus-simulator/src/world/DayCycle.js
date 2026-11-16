import * as THREE from 'three';
import { smoothstep, lerp } from '../core/rng.js';

export const DAY_LENGTH = 600; // seconds for a full cycle
export const NIGHT_START = 0.86;

/** t in [0,1): 0 = 06:00, NIGHT_START = 20:00, then a compressed night back to 06:00. */
export function clockHours(t) {
  if (t < NIGHT_START) return 6 + (t / NIGHT_START) * 14;
  return (20 + ((t - NIGHT_START) / (1 - NIGHT_START)) * 10) % 24;
}

export function clockLabel(t) {
  const h = clockHours(t);
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 6) * 10;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

const C = (hex) => new THREE.Color(hex);
const DAY = { top: C('#5d9fe0'), horizon: C('#f3dcae'), fog: C('#ecd8ae'), hemiSky: C('#d8e8ff'), hemiGround: C('#b48a5a') };
const GOLD = { top: C('#6f8fc8'), horizon: C('#f6b77a'), fog: C('#e9b98a'), hemiSky: C('#f0d0b0'), hemiGround: C('#9a6a45') };
const NIGHT = { top: C('#0b1430'), horizon: C('#26304f'), fog: C('#1d2540'), hemiSky: C('#41507e'), hemiGround: C('#26201c') };
const SUN_HIGH = C('#fff0d2');
const SUN_LOW = C('#ffb070');
const MOON = C('#a9bcff');

/**
 * Drives sun/moon light, hemisphere, sky dome, fog and stars from the clock.
 */
export class DayCycle {
  constructor({ sun, hemi, sky, fog, clouds, scene }) {
    Object.assign(this, { sun, hemi, sky, fog, clouds });
    this.t = 0.2;
    this.dir = new THREE.Vector3();
    this.tmpC = new THREE.Color();
    this.stars = this.createStars();
    scene.add(this.stars);
  }

  createStars() {
    const n = 600;
    const pos = new Float32Array(n * 3);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i += 1) {
      const u = rnd() * Math.PI * 2;
      const v = 0.08 + rnd() * 0.9;
      pos[i * 3] = Math.cos(u) * Math.sqrt(1 - v * v);
      pos[i * 3 + 1] = v;
      pos[i * 3 + 2] = Math.sin(u) * Math.sqrt(1 - v * v);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: '#fff6e0', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    const p = new THREE.Points(g, m);
    p.frustumCulled = false;
    p.renderOrder = -0.5;
    return p;
  }

  /** Night weight 0..1 (dusk ramps in before NIGHT_START, dawn ramps out before 1). */
  nightWeight(t = this.t) {
    return smoothstep(NIGHT_START - 0.05, NIGHT_START + 0.015, t) * (1 - smoothstep(0.965, 0.998, t));
  }

  apply(t, cameraPos, far) {
    this.t = t;
    const w = this.nightWeight(t);
    // sun path east -> south -> west across the day portion
    const u = t < NIGHT_START ? t / NIGHT_START : t > 0.93 ? 0 : 1;
    const elev = THREE.MathUtils.degToRad(5 + Math.sin(u * Math.PI) * 60);
    const az = Math.PI * u;
    const sunDir = this.dir.set(Math.cos(az) * Math.cos(elev), Math.sin(elev), 0.45 * Math.cos(elev)).normalize();
    const low = 1 - smoothstep(0.12, 0.6, Math.sin(elev));
    const moonDir = new THREE.Vector3(0.35, 0.82, -0.45).normalize();
    const useMoon = w > 0.5;
    this.lightDir = useMoon ? moonDir : sunDir.clone();
    const sunI = lerp(3.1, 2.1, low);
    const moonI = 0.6;
    const dip = 1 - 0.85 * Math.sin(Math.PI * w);
    this.sun.intensity = lerp(sunI, moonI, w) * dip;
    this.tmpC.copy(SUN_HIGH).lerp(SUN_LOW, low);
    this.sun.color.copy(this.tmpC).lerp(MOON, w);

    const mix = (key, out) => out.copy(DAY[key]).lerp(GOLD[key], low * 0.85).lerp(NIGHT[key], w);
    mix('hemiSky', this.hemi.color);
    mix('hemiGround', this.hemi.groundColor);
    this.hemi.intensity = lerp(1.25, 0.75, w);
    mix('top', this.sky.uniforms.uTop.value);
    mix('horizon', this.sky.uniforms.uHorizon.value);
    this.sky.uniforms.uBottom.value.copy(this.sky.uniforms.uHorizon.value).multiplyScalar(0.95);
    this.sky.uniforms.uSun.value.copy(useMoon ? moonDir : sunDir);
    mix('fog', this.fog.color);
    if (this.clouds) {
      this.clouds.material.emissiveIntensity = lerp(0.55, 0.05, w);
      this.clouds.material.color.setScalar(lerp(1, 0.35, w));
    }
    this.stars.material.opacity = w;
    this.stars.position.copy(cameraPos);
    this.stars.scale.setScalar(far * 0.85);
    return { night: w, lightDir: this.lightDir };
  }
}
