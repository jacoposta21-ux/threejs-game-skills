// Procedural Web Audio: city ambience, ocean surf, distant traffic swooshes,
// night crickets, footsteps per surface, jump/land, pickups and UI clicks.
// No audio files: nothing can fail to load. Starts on the first user gesture.
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.started = false;
  }

  start() {
    if (this.started) { this.ctx && this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      return;
    }
    this.started = true;
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.volume;
    const comp = c.createDynamicsCompressor();
    this.master.connect(comp).connect(c.destination);
    this.noise = this.makeNoise(2, 'white');
    this.brown = this.makeNoise(4, 'brown');

    // city bed: brown noise, low-passed
    this.city = this.loop(this.brown, 'lowpass', 380, 0.0);
    // ocean: band of noise with slow swells
    this.ocean = this.loop(this.brown, 'lowpass', 900, 0.0);
    this.oceanLfo = 0;
    // night crickets bus
    this.crickets = c.createGain();
    this.crickets.gain.value = 0;
    this.crickets.connect(this.master);
    this.cricketTimer = 0;
    this.swooshTimer = 2;
  }

  makeNoise(seconds, type) {
    const c = this.ctx;
    const buf = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (type === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return buf;
  }

  loop(buffer, ftype, freq, gain) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = ftype;
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(this.master);
    src.start();
    return { src, f, g };
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  burst({ freq = 1000, q = 1, type = 'bandpass', dur = 0.08, gain = 0.3, attack = 0.002, pitchDrop = 0 }) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    if (pitchDrop) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * pitchDrop), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  tone(freq, dur, { type = 'sine', gain = 0.2, when = 0, slide = 0 } = {}) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  footstep(surface, intensity = 0.5) {
    const k = 0.12 + intensity * 0.16;
    switch (surface) {
      case 'sand': this.burst({ freq: 420, q: 0.7, type: 'lowpass', dur: 0.14, gain: k * 0.9, attack: 0.01 }); break;
      case 'grass': this.burst({ freq: 900, q: 0.8, dur: 0.09, gain: k * 0.7 }); break;
      case 'road': case 'asphalt': this.burst({ freq: 1500, q: 1.4, dur: 0.06, gain: k }); break;
      default: this.burst({ freq: 2000, q: 1.8, dur: 0.05, gain: k }); this.burst({ freq: 180, q: 1, type: 'lowpass', dur: 0.05, gain: k * 0.8 });
    }
  }

  jump() { this.burst({ freq: 700, q: 0.8, dur: 0.12, gain: 0.12 }); }
  land(force) { this.burst({ freq: 220, type: 'lowpass', dur: 0.18, gain: 0.2 + force * 0.4, pitchDrop: 0.5 }); }
  click() { this.tone(880, 0.06, { type: 'triangle', gain: 0.08 }); }
  pickup() {
    [659, 784, 988, 1319].forEach((f, i) => this.tone(f, 0.25, { type: 'triangle', gain: 0.12, when: i * 0.07 }));
    this.tone(1976, 0.5, { type: 'sine', gain: 0.05, when: 0.28 });
  }
  reward() {
    [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => this.tone(f, 0.4, { type: 'triangle', gain: 0.1, when: i * 0.09 }));
  }

  /** Per-frame mix: env = { oceanProximity 0..1, cityDensity 0..1, night 0..1, park 0..1 } */
  update(dt, env) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    this.oceanLfo += dt;
    const swell = 0.55 + 0.45 * Math.sin(this.oceanLfo * 0.6) * Math.sin(this.oceanLfo * 0.23 + 1);
    this.ocean.g.gain.setTargetAtTime(env.oceanProximity * 0.55 * swell, t, 0.2);
    this.ocean.f.frequency.setTargetAtTime(500 + swell * 900, t, 0.3);
    this.city.g.gain.setTargetAtTime((0.12 + env.cityDensity * 0.25) * (1 - env.oceanProximity * 0.5), t, 0.5);
    // distant traffic swooshes
    this.swooshTimer -= dt;
    if (this.swooshTimer < 0) {
      this.swooshTimer = 1.5 + Math.random() * 4 * (1.2 - env.cityDensity);
      this.burst({ freq: 300 + Math.random() * 500, q: 0.6, type: 'bandpass', dur: 1.4, gain: 0.03 + env.cityDensity * 0.05, attack: 0.6 });
    }
    // crickets at night in green areas
    const cr = env.night * Math.max(env.park, 0.25);
    this.crickets.gain.setTargetAtTime(cr * 0.5, t, 0.5);
    this.cricketTimer -= dt;
    if (cr > 0.05 && this.cricketTimer < 0) {
      this.cricketTimer = 0.3 + Math.random() * 0.6;
      const f = 4200 + Math.random() * 600;
      for (let i = 0; i < 3; i++) {
        const o = this.ctx.createOscillator();
        o.frequency.value = f;
        const g = this.ctx.createGain();
        const s = t + i * 0.06;
        g.gain.setValueAtTime(0, s);
        g.gain.linearRampToValueAtTime(0.04, s + 0.01);
        g.gain.linearRampToValueAtTime(0, s + 0.04);
        o.connect(g).connect(this.crickets);
        o.start(s); o.stop(s + 0.05);
      }
    }
  }

  // ---------------------------------------------------------------- vehicles
  door() { this.burst({ freq: 250, type: 'lowpass', dur: 0.12, gain: 0.35, pitchDrop: 0.6 }); this.burst({ freq: 2500, q: 3, dur: 0.04, gain: 0.08 }); }
  horn() { this.tone(392, 0.45, { type: 'square', gain: 0.06 }); this.tone(494, 0.45, { type: 'square', gain: 0.05 }); }
  crash(k) {
    this.burst({ freq: 140, type: 'lowpass', dur: 0.35 + k * 0.3, gain: 0.3 + k * 0.5, pitchDrop: 0.4 });
    this.burst({ freq: 2600, q: 0.7, dur: 0.2 + k * 0.3, gain: 0.08 + k * 0.25 });
    if (k > 0.5) for (let i = 0; i < 5; i++) this.tone(2000 + Math.random() * 3000, 0.15, { type: 'triangle', gain: 0.03, when: 0.05 + Math.random() * 0.3 });
  }

  engineStart(spec) {
    if (!this.ctx) return;
    this.engineStop();
    const c = this.ctx;
    const o1 = c.createOscillator(); o1.type = 'sawtooth';
    const o2 = c.createOscillator(); o2.type = 'square';
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600; f.Q.value = 2;
    const g = c.createGain(); g.gain.value = 0;
    o1.connect(f); o2.connect(f); f.connect(g).connect(this.master);
    o1.start(); o2.start();
    // tyre skid: looping noise through a band-pass
    const sk = this.loop(this.noise, 'bandpass', 1200, 0);
    sk.f.Q.value = 1.6;
    this.eng = { o1, o2, f, g, sk, spec, rpm: 900 };
    this.burst({ freq: 300, type: 'lowpass', dur: 0.5, gain: 0.25 });
  }

  engineStop() {
    if (!this.eng) return;
    const { o1, o2, g, sk } = this.eng;
    const t = this.ctx.currentTime;
    g.gain.setTargetAtTime(0, t, 0.08);
    sk.g.gain.setTargetAtTime(0, t, 0.05);
    o1.stop(t + 0.4); o2.stop(t + 0.4); sk.src.stop(t + 0.4);
    this.eng = null;
    this.setSiren(false);
  }

  /** Engine pitch from a simple gearbox model; skid from lateral slip. */
  engine(v, throttle, dt) {
    if (!this.eng || !this.ctx) return;
    const e = this.eng, t = this.ctx.currentTime;
    const sp = Math.abs(v.speed), max = v.spec.maxSpeed, gears = v.spec.gears;
    const gearSpan = max / gears;
    const gear = Math.min(gears - 1, Math.floor(sp / gearSpan));
    const inGear = (sp - gear * gearSpan) / gearSpan;
    const target = v.wrecked ? 0 : 900 + inGear * 4200 + (throttle > 0 ? 400 : 0) + gear * 120;
    e.rpm += (target - e.rpm) * Math.min(1, dt * 6);
    v.gear = sp < 0.5 ? 'N' : v.speed < 0 ? 'R' : String(gear + 1);
    v.rpm = e.rpm;
    const base = v.spec.mass > 3000 ? 0.6 : v.spec.siren || v.spec.maxSpeed > 55 ? 1.1 : 0.85;
    const f0 = (e.rpm / 60) * base;
    e.o1.frequency.setTargetAtTime(f0, t, 0.03);
    e.o2.frequency.setTargetAtTime(f0 * 0.5, t, 0.03);
    e.f.frequency.setTargetAtTime(300 + e.rpm * 0.35 + (throttle > 0 ? 500 : 0), t, 0.05);
    e.g.gain.setTargetAtTime(v.wrecked ? 0 : 0.05 + Math.abs(throttle) * 0.05 + inGear * 0.02, t, 0.05);
    const skid = Math.max(0, Math.min(1, (v.slip - 2.5) / 6)) * (sp > 3 ? 1 : 0);
    e.sk.g.gain.setTargetAtTime(skid * 0.18, t, 0.05);
  }

  setSiren(on) {
    if (!this.ctx) return;
    if (on && !this.siren) {
      const c = this.ctx;
      const o = c.createOscillator(); o.type = 'sawtooth';
      const lfo = c.createOscillator(); lfo.frequency.value = 0.45;
      const lg = c.createGain(); lg.gain.value = 330;
      lfo.connect(lg).connect(o.frequency);
      o.frequency.value = 930;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 1.2;
      const g = c.createGain(); g.gain.value = 0.05;
      o.connect(f).connect(g).connect(this.master);
      o.start(); lfo.start();
      this.siren = { o, lfo };
    } else if (!on && this.siren) {
      this.siren.o.stop(); this.siren.lfo.stop();
      this.siren = null;
    }
  }

  suspend() { this.ctx && this.ctx.suspend(); }
  resume() { this.ctx && this.ctx.resume(); }
}
