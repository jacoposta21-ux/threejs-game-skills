import * as THREE from 'three';

// Every sound is synthesised here at startup (original audio, no licensing
// questions, zero download). Sample rate is fixed for deterministic buffers.
const SR = 32000;

function biquad(type, freq, q) {
  // RBJ cookbook coefficients.
  const w = (2 * Math.PI * freq) / SR;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  let b0;
  let b1;
  let b2;
  if (type === 'lp') {
    b0 = (1 - cos) / 2;
    b1 = 1 - cos;
    b2 = b0;
  } else if (type === 'hp') {
    b0 = (1 + cos) / 2;
    b1 = -(1 + cos);
    b2 = b0;
  } else {
    b0 = alpha;
    b1 = 0;
    b2 = -alpha;
  }
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  return (x) => {
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    return y;
  };
}

function make(seconds, fn) {
  const n = Math.floor(seconds * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) out[i] = fn(i / SR, i);
  // Normalise to -1 dBFS.
  let peak = 0;
  for (let i = 0; i < n; i += 1) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) for (let i = 0; i < n; i += 1) out[i] *= 0.89 / peak;
  return out;
}

function noiseGen(rng) {
  return () => rng() * 2 - 1;
}

/** Damped sinusoid bank: metallic/woody resonances. */
function modes(t, list) {
  let s = 0;
  for (const [f, a, d] of list) s += Math.sin(2 * Math.PI * f * t) * a * Math.exp(-t * d);
  return s;
}

function synthLibrary(rng) {
  const N = noiseGen(rng);
  const lib = {};
  // Leather on boot: low thump + slap.
  const kick = (weight) => {
    const lp = biquad('bp', 1700, 1.2);
    return make(0.32, (t) => {
      const f = 130 * Math.exp(-t * 28) + 48;
      const thump = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 26) * weight;
      const slap = lp(N()) * Math.exp(-t * 90) * 1.4;
      return thump + slap;
    });
  };
  lib.kickHard = kick(1.3);
  lib.kickSoft = kick(0.7);
  {
    const bp = biquad('bp', 1200, 1.4);
    lib.touch = make(0.12, (t) => bp(N()) * Math.exp(-t * 70) + Math.sin(2 * Math.PI * 95 * t) * Math.exp(-t * 45) * 0.4);
  }
  {
    const lp = biquad('lp', 900, 0.8);
    lib.bounce = make(0.2, (t) => Math.sin(2 * Math.PI * (90 + 60 * Math.exp(-t * 40)) * t) * Math.exp(-t * 30) + lp(N()) * Math.exp(-t * 60) * 0.5);
  }
  {
    const bp1 = biquad('bp', 2600, 2.5);
    const bp2 = biquad('bp', 4200, 3);
    lib.fence = make(0.9, (t) => {
      const rattle = 0.5 + 0.5 * Math.sin(2 * Math.PI * 31 * t + Math.sin(t * 90));
      const n = N();
      return (bp1(n) + bp2(n) * 0.6) * Math.exp(-t * 5.5) * rattle + modes(t, [[880, 0.3, 9], [1373, 0.25, 7], [2211, 0.2, 11]]);
    });
  }
  {
    const lp = biquad('lp', 600, 0.9);
    lib.board = make(0.4, (t) => modes(t, [[150, 1, 22], [232, 0.6, 26], [410, 0.3, 30]]) + lp(N()) * Math.exp(-t * 40) * 0.6);
  }
  lib.post = make(1.6, (t) => modes(t, [[523, 0.8, 2.6], [1417, 0.5, 3.4], [2389, 0.35, 4.1], [3520, 0.2, 6]]) + N() * Math.exp(-t * 120) * 0.6);
  {
    const bp = biquad('bp', 2400, 0.7);
    lib.net = make(0.55, (t) => bp(N()) * Math.sin(Math.PI * Math.min(1, t / 0.55)) * Math.exp(-t * 3));
  }
  {
    const lp = biquad('lp', 1600, 0.7);
    lib.step = make(0.07, (t) => lp(N()) * Math.exp(-t * 80));
  }
  // Pea whistle: two tones with a rolling trill.
  const whistle = (len) =>
    make(len, (t) => {
      const trill = 1 + 0.035 * Math.sign(Math.sin(2 * Math.PI * 38 * t));
      const env = Math.min(1, t / 0.02) * Math.min(1, (len - t) / 0.06);
      return (Math.sin(2 * Math.PI * 2850 * trill * t) + 0.6 * Math.sin(2 * Math.PI * 3150 * trill * t)) * env;
    });
  lib.whistle = whistle(0.45);
  lib.whistleLong = whistle(1.3);
  // Crowd murmur loop: band-limited noise with slowly wandering formants.
  const crowd = (len, intensity) => {
    const bands = [biquad('bp', 380, 0.9), biquad('bp', 760, 1.1), biquad('bp', 1500, 1.4)];
    const phases = [rng() * 6, rng() * 6, rng() * 6];
    const buf = make(len, (t) => {
      const n = N();
      let s = 0;
      bands.forEach((b, i) => {
        const swell = 0.6 + 0.4 * Math.sin(2 * Math.PI * (0.13 + i * 0.07) * t + phases[i]);
        s += b(n) * swell;
      });
      const shout = Math.max(0, Math.sin(2 * Math.PI * 0.9 * t + Math.sin(t * 3))) ** 8;
      return s * (0.7 + intensity * shout);
    });
    // Seamless loop: crossfade the last 0.5 s into the start.
    const xf = Math.floor(0.5 * SR);
    for (let i = 0; i < xf; i += 1) {
      const a = i / xf;
      buf[i] = buf[i] * a + buf[buf.length - xf + i] * (1 - a);
    }
    return buf.subarray(0, buf.length - xf);
  };
  lib.crowdBed = crowd(8.5, 0.6);
  {
    const bands = [biquad('bp', 500, 0.7), biquad('bp', 1100, 0.9), biquad('bp', 2300, 1.2)];
    lib.cheer = make(4.2, (t) => {
      const env = Math.min(1, t / 0.35) * Math.exp(-Math.max(0, t - 1.4) * 0.9);
      const n = N();
      return (bands[0](n) + bands[1](n) * 0.9 + bands[2](n) * 0.6) * env * (0.85 + 0.15 * Math.sin(t * 17));
    });
  }
  {
    const bp = biquad('bp', 420, 2.2);
    const bp2 = biquad('bp', 850, 2.5);
    lib.ooh = make(1.5, (t) => {
      const env = Math.sin(Math.PI * Math.min(1, t / 1.5)) ** 0.7;
      const n = N();
      return (bp(n) + bp2(n) * 0.5) * env;
    });
  }
  // Distant traffic: low rumble, a passing moped and a far-off horn.
  {
    const lp = biquad('lp', 260, 0.7);
    const len = 12;
    const buf = make(len, (t) => {
      let s = lp(N()) * 1.2;
      const mt = t - 4;
      if (mt > 0 && mt < 4) {
        const dop = 1 + 0.06 * Math.cos((mt / 4) * Math.PI);
        const env = Math.sin((mt / 4) * Math.PI) ** 2;
        const saw = (((105 * dop * mt) % 1) * 2 - 1) * 0.25 + Math.sin(2 * Math.PI * 210 * dop * mt) * 0.1;
        s += saw * env * 0.5;
      }
      const ht = t - 9.2;
      if (ht > 0 && ht < 0.5) s += (Math.sin(2 * Math.PI * 392 * ht) + Math.sin(2 * Math.PI * 494 * ht)) * 0.08 * Math.min(1, ht / 0.03) * Math.min(1, (0.5 - ht) / 0.05);
      return s;
    });
    const xf = Math.floor(0.6 * SR);
    for (let i = 0; i < xf; i += 1) {
      const a = i / xf;
      buf[i] = buf[i] * a + buf[buf.length - xf + i] * (1 - a);
    }
    lib.traffic = buf.subarray(0, buf.length - xf);
  }
  lib.click = make(0.06, (t) => Math.sin(2 * Math.PI * 1250 * t) * Math.exp(-t * 70));
  lib.confirm = make(0.22, (t) => Math.sin(2 * Math.PI * (t < 0.08 ? 880 : 1320) * t) * Math.exp(-((t % 0.08) * 25)) * 0.8);
  lib.beep = make(0.16, (t) => Math.sin(2 * Math.PI * 880 * t) * Math.min(1, (0.16 - t) / 0.04));
  lib.beepGo = make(0.4, (t) => (Math.sin(2 * Math.PI * 1320 * t) + 0.4 * Math.sin(2 * Math.PI * 1980 * t)) * Math.min(1, (0.4 - t) / 0.1));
  lib.charge = make(0.9, (t) => Math.sin(2 * Math.PI * (300 + 500 * t) * t) * 0.3 * Math.min(1, t / 0.05));
  return lib;
}

const SETTINGS_KEY = 'street-football-audio';

/**
 * Web Audio manager: groups (sfx, crowd, ambience, ui) under a master gain,
 * gesture unlock, mute/volume persisted, pause with the game, stereo pan
 * from the camera's point of view, pitch variance on repeats.
 */
export class AudioSystem {
  constructor(rng, storage) {
    this.rng = rng;
    this.storage = storage;
    this.ctx = null;
    this.buffers = new Map();
    this.loops = new Map();
    this.lastPlayed = new Map();
    const saved = storage.get(SETTINGS_KEY);
    this.settings = { master: 0.8, sfx: 1, ambience: 0.7, muted: false, ...(saved ? JSON.parse(saved) : {}) };
    this.externalMute = false;
    this.camera = null;
    this.duck = 1;
  }

  /** Must be called from a user gesture (browser autoplay policy). */
  async unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !this.paused) await this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.groups = {};
    for (const g of ['sfx', 'crowd', 'ambience', 'ui']) {
      this.groups[g] = ctx.createGain();
      this.groups[g].connect(this.master);
    }
    const raw = synthLibrary(this.rng);
    for (const [name, data] of Object.entries(raw)) {
      const buf = ctx.createBuffer(1, data.length, SR);
      buf.copyToChannel(data, 0);
      this.buffers.set(name, buf);
    }
    this.applyVolumes();
    this.startLoop('crowdBed', 'crowd', 0.32);
    this.startLoop('traffic', 'ambience', 0.4);
    if (ctx.state === 'suspended') await ctx.resume();
  }

  setCamera(camera) {
    this.camera = camera;
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings;
    const muted = s.muted || this.externalMute;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(muted ? 0 : s.master, t, 0.03);
    this.groups.sfx.gain.setTargetAtTime(s.sfx, t, 0.03);
    this.groups.ui.gain.setTargetAtTime(s.sfx * 0.8, t, 0.03);
    this.groups.crowd.gain.setTargetAtTime(s.ambience * this.duck, t, 0.1);
    this.groups.ambience.gain.setTargetAtTime(s.ambience * this.duck, t, 0.1);
  }

  saveSettings() {
    this.storage.set(SETTINGS_KEY, JSON.stringify(this.settings));
  }

  setVolume(key, value) {
    this.settings[key] = value;
    this.applyVolumes();
    this.saveSettings();
  }

  setMuted(muted) {
    this.settings.muted = muted;
    this.applyVolumes();
    this.saveSettings();
  }

  /** Platform mute (e.g. CrazyGames settings or an ad break) — not persisted. */
  setExternalMute(muted) {
    this.externalMute = muted;
    this.applyVolumes();
  }

  pause() {
    this.paused = true;
    if (this.ctx?.state === 'running') this.ctx.suspend();
  }

  resume() {
    this.paused = false;
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  startLoop(name, group, gain) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.buffers.get(name);
    src.loop = true;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.groups[group]);
    src.start(0, this.rng() * src.buffer.duration);
    this.loops.set(name, { src, gain: g, base: gain });
  }

  setLoopIntensity(name, level) {
    const loop = this.loops.get(name);
    if (!loop || !this.ctx) return;
    loop.gain.gain.setTargetAtTime(loop.base * level, this.ctx.currentTime, 0.4);
  }

  /** Stereo pan from a world position relative to the camera. */
  panFor(pos) {
    if (!pos || !this.camera) return 0;
    const cam = this.camera;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const rel = new THREE.Vector3().subVectors(pos, cam.position);
    return THREE.MathUtils.clamp(rel.dot(right) / 14, -0.85, 0.85);
  }

  play(name, { group = 'sfx', volume = 1, rate = 1, variance = 0.06, at = null, cooldown = 0.03 } = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const buf = this.buffers.get(name);
    if (!buf) return;
    const now = this.ctx.currentTime;
    if (now - (this.lastPlayed.get(name) ?? -1) < cooldown) return;
    this.lastPlayed.set(name, now);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate * (1 + (this.rng() - 0.5) * 2 * variance);
    const g = this.ctx.createGain();
    g.gain.value = volume;
    let node = src.connect(g);
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = this.panFor(at);
      node = node.connect(p);
    }
    node.connect(this.groups[group]);
    src.start();
  }

  dispose() {
    for (const l of this.loops.values()) l.src.stop();
    this.loops.clear();
    this.ctx?.close();
    this.ctx = null;
  }
}
