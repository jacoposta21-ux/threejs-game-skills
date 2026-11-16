/**
 * Procedural Web Audio: every sound is synthesised at runtime, so the game
 * ships with no external audio files. Gameplay emits events; this listens.
 */
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.settings = { musicVolume: 0.5, sfxVolume: 0.8 };
    this.ambienceLevel = { market: 0, wind: 0.5 };
    this.musicTimer = 0;
    this.birdTimer = 2;
    this.started = false;
    this.suspendedByGame = false;
  }

  /** Must be called from a user gesture. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const c = this.ctx;
      this.master = c.createGain();
      this.master.connect(c.destination);
      this.sfx = c.createGain();
      this.music = c.createGain();
      this.amb = c.createGain();
      this.sfx.connect(this.master);
      this.music.connect(this.master);
      this.amb.connect(this.sfx);
      this.noise = this.makeNoise(2);
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setVolumes(settings) {
    this.settings = { ...this.settings, ...settings };
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfx.gain.setTargetAtTime(this.settings.sfxVolume, t, 0.05);
    this.music.gain.setTargetAtTime(this.settings.musicVolume * 0.55, t, 0.05);
  }

  makeNoise(seconds) {
    const c = this.ctx;
    const buf = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
    const d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < d.length; i += 1) {
      const w = Math.random() * 2 - 1;
      b = 0.97 * b + 0.03 * w; // slightly brown
      d[i] = w * 0.5 + b * 2.5;
    }
    return buf;
  }

  startAmbience() {
    if (!this.ctx || this.started) return;
    this.started = true;
    const c = this.ctx;
    // wind bed
    const wind = c.createBufferSource();
    wind.buffer = this.noise;
    wind.loop = true;
    const wf = c.createBiquadFilter();
    wf.type = 'lowpass';
    wf.frequency.value = 420;
    this.windGain = c.createGain();
    this.windGain.gain.value = 0.05;
    wind.connect(wf).connect(this.windGain).connect(this.amb);
    wind.start();
    // market chatter: band-passed noise with a slow "voices" tremolo
    const chat = c.createBufferSource();
    chat.buffer = this.noise;
    chat.loop = true;
    chat.playbackRate.value = 1.6;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 1.4;
    const trem = c.createGain();
    const lfo = c.createOscillator();
    const lfoGain = c.createGain();
    lfo.frequency.value = 5.3;
    lfoGain.gain.value = 0.5;
    lfo.connect(lfoGain).connect(trem.gain);
    trem.gain.value = 0.6;
    this.marketGain = c.createGain();
    this.marketGain.gain.value = 0;
    chat.connect(bp).connect(trem).connect(this.marketGain).connect(this.amb);
    chat.start();
    lfo.start();
  }

  stopAll() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  env(gainNode, t, attack, peak, decay) {
    // exponential ramps reject 0: distant/silent sounds get a floor instead of throwing
    peak = Math.max(0.0002, Number.isFinite(peak) ? peak : 0.0002);
    gainNode.gain.setValueAtTime(0.0001, t);
    gainNode.gain.exponentialRampToValueAtTime(peak, t + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  noiseBurst({ freq = 800, q = 1, gain = 0.3, decay = 0.12, type = 'bandpass', rate = 1, out }) {
    if (!this.ctx || !(gain > 0.0005)) return;
    const c = this.ctx;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = rate;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    this.env(g, t, 0.005, gain, decay);
    src.connect(f).connect(g).connect(out || this.sfx);
    src.start(t, Math.random() * 1.5, attackSafe(decay));
  }

  tone({ freq, type = 'sine', gain = 0.2, attack = 0.01, decay = 0.4, when = 0, slideTo, out }) {
    if (!this.ctx || !(gain > 0.0005)) return;
    const c = this.ctx;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + attack + decay);
    const g = c.createGain();
    this.env(g, t, attack, gain, decay);
    o.connect(g).connect(out || this.sfx);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }

  footstep(surface = 'sand', sprint = false) {
    const stone = surface === 'stone';
    this.noiseBurst({
      freq: (stone ? 1500 : 700) * (0.85 + Math.random() * 0.3),
      q: stone ? 2.2 : 0.9,
      gain: (sprint ? 0.32 : 0.22) * (stone ? 0.8 : 1),
      decay: stone ? 0.06 : 0.1,
      rate: 0.8 + Math.random() * 0.4,
    });
  }

  jump() {
    this.noiseBurst({ freq: 500, q: 0.7, gain: 0.12, decay: 0.2, type: 'lowpass' });
    this.tone({ freq: 300, slideTo: 520, gain: 0.04, decay: 0.15, type: 'triangle' });
  }

  land(power = 1) {
    this.noiseBurst({ freq: 260, q: 0.8, gain: Math.min(0.5, 0.2 + power * 0.2), decay: 0.16, type: 'lowpass' });
  }

  thud(power = 1) {
    this.noiseBurst({ freq: 200 + Math.random() * 120, q: 1.2, gain: Math.min(0.45, 0.15 * power), decay: 0.18, type: 'lowpass' });
    this.tone({ freq: 140 + Math.random() * 40, slideTo: 80, gain: 0.08, decay: 0.12, type: 'triangle' });
  }

  uiHover() {
    this.tone({ freq: 880, gain: 0.03, decay: 0.08, type: 'triangle' });
  }

  uiClick() {
    this.tone({ freq: 660, gain: 0.08, decay: 0.15, type: 'triangle' });
    this.tone({ freq: 990, gain: 0.05, decay: 0.2, type: 'sine', when: 0.03 });
  }

  uiDenied() {
    this.tone({ freq: 220, gain: 0.08, decay: 0.18, type: 'triangle' });
    this.tone({ freq: 196, gain: 0.07, decay: 0.22, type: 'triangle', when: 0.08 });
  }

  discovery() {
    const base = 523.25;
    [0, 4, 7, 12, 16].forEach((st, i) => {
      this.tone({ freq: base * 2 ** (st / 12), gain: 0.09, decay: 1.2, attack: 0.01, type: 'sine', when: i * 0.09 });
      this.tone({ freq: base * 2 ** (st / 12) * 2, gain: 0.025, decay: 0.8, type: 'sine', when: i * 0.09 });
    });
  }

  chime() {
    this.tone({ freq: 784, gain: 0.07, decay: 0.6 });
    this.tone({ freq: 1175, gain: 0.05, decay: 0.8, when: 0.08 });
  }

  /** Gibberish "voice" for NPC speech: short formant-ish blips at the NPC's pitch. */
  babble(voice = 1, length = 12, gain = 1) {
    if (!this.ctx || gain < 0.03) return;
    const syllables = Math.max(2, Math.min(9, Math.round(length / 4)));
    const base = 170 * voice;
    for (let i = 0; i < syllables; i += 1) {
      const f = base * (0.85 + Math.random() * 0.5);
      const when = i * (0.075 + Math.random() * 0.03);
      this.tone({ freq: f, slideTo: f * (0.85 + Math.random() * 0.3), type: 'square', gain: 0.018 * gain, attack: 0.006, decay: 0.06, when });
      this.tone({ freq: f * 2.02, type: 'sine', gain: 0.02 * gain, attack: 0.006, decay: 0.05, when });
    }
  }

  crash(gain = 1) {
    this.noiseBurst({ freq: 2600, q: 0.8, gain: 0.35 * gain, decay: 0.18, type: 'highpass', rate: 1.4 });
    this.noiseBurst({ freq: 900, q: 1.5, gain: 0.25 * gain, decay: 0.12 });
    for (let i = 0; i < 4; i += 1) this.tone({ freq: 1800 + Math.random() * 1600, type: 'triangle', gain: 0.03 * gain, decay: 0.08, when: 0.03 + i * 0.05 });
  }

  cluck(gain = 1) {
    for (let i = 0; i < 3; i += 1) this.tone({ freq: 620 + Math.random() * 180, slideTo: 420, type: 'square', gain: 0.025 * gain, attack: 0.004, decay: 0.07, when: i * 0.09 });
  }

  baa(gain = 1) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(310, t);
    o.frequency.linearRampToValueAtTime(280, t + 0.6);
    const lfo = c.createOscillator();
    const lg = c.createGain();
    lfo.frequency.value = 22;
    lg.gain.value = 18;
    lfo.connect(lg).connect(o.frequency);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    f.Q.value = 2;
    const g = c.createGain();
    this.env(g, t, 0.05, 0.05 * gain, 0.55);
    o.connect(f).connect(g).connect(this.sfx);
    o.start(t);
    lfo.start(t);
    o.stop(t + 0.7);
    lfo.stop(t + 0.7);
  }

  /** A bleating voice: base pitch, wobble rate and depth, length. */
  voice({ freq, to, wobble = 20, depth = 16, length = 0.55, gain = 0.05, filter = 900, type = 'sawtooth' }) {
    if (!this.ctx || !(gain > 0.0005)) return;
    const c = this.ctx;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.linearRampToValueAtTime(to ?? freq * 0.9, t + length);
    const lfo = c.createOscillator();
    const lg = c.createGain();
    lfo.frequency.value = wobble;
    lg.gain.value = depth;
    lfo.connect(lg).connect(o.frequency);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = filter;
    f.Q.value = 1.6;
    const g = c.createGain();
    this.env(g, t, 0.05, gain, length);
    o.connect(f).connect(g).connect(this.sfx);
    o.start(t);
    lfo.start(t);
    o.stop(t + length + 0.15);
    lfo.stop(t + length + 0.15);
  }

  bleat(gain = 1) {
    this.voice({ freq: 420, to: 360, wobble: 28, depth: 30, length: 0.45, gain: 0.045 * gain, filter: 1200 });
  }

  /** Bray (donkey: hee-haw), whinny (horse), grumble (camel). */
  mountCall(kind, gain = 1) {
    if (!this.ctx) return;
    if (kind === 'donkey' || kind === 'cart') {
      this.voice({ freq: 520, to: 700, wobble: 9, depth: 40, length: 0.35, gain: 0.06 * gain, filter: 1100 });
      setTimeout(() => this.voice({ freq: 260, to: 200, wobble: 7, depth: 30, length: 0.45, gain: 0.06 * gain, filter: 700 }), 380);
    } else if (kind === 'horse' || kind === 'chariot') {
      this.voice({ freq: 880, to: 560, wobble: 18, depth: 70, length: 0.8, gain: 0.045 * gain, filter: 1600, type: 'square' });
      this.noiseBurst({ freq: 400, q: 0.8, gain: 0.08 * gain, decay: 0.3, rate: 0.6 });
    } else if (kind === 'camel') {
      this.voice({ freq: 110, to: 85, wobble: 13, depth: 22, length: 0.9, gain: 0.07 * gain, filter: 420 });
    }
  }

  /** Hoof clop (or a wheel rattle) per stride. */
  hoof(kind, gallop = false, wheels = false) {
    const base = kind === 'camel' ? 320 : kind === 'donkey' || kind === 'cart' ? 900 : 700;
    const n = gallop ? 3 : 2;
    for (let i = 0; i < n; i += 1) {
      setTimeout(() => this.noiseBurst({ freq: base * (0.85 + Math.random() * 0.3), q: 3, gain: (kind === 'camel' ? 0.12 : 0.2) * (gallop ? 1.15 : 1), decay: 0.05, rate: 0.7 + Math.random() * 0.3 }), i * (gallop ? 55 : 110));
    }
    if (wheels) this.noiseBurst({ freq: 180, q: 0.7, gain: 0.12, decay: 0.25, rate: 0.5, type: 'lowpass' });
  }

  flutter(gain = 1) {
    for (let i = 0; i < 6; i += 1) setTimeout(() => this.noiseBurst({ freq: 1800 + Math.random() * 600, q: 1.2, gain: 0.05 * gain, decay: 0.04, rate: 1.4 }), i * 45);
  }

  // ---------------------------------------------------------------- miracles
  push() {
    if (!this.ctx) return;
    this.noiseBurst({ freq: 900, q: 0.6, gain: 0.35, decay: 0.35, type: 'bandpass', rate: 0.7 });
    this.noiseBurst({ freq: 180, q: 0.8, gain: 0.45, decay: 0.3, type: 'lowpass' });
    this.tone({ freq: 110, slideTo: 55, type: 'sine', gain: 0.25, attack: 0.005, decay: 0.35 });
    this.tone({ freq: 880, slideTo: 1320, type: 'sine', gain: 0.04, attack: 0.02, decay: 0.4 });
  }

  multiply() {
    const base = 660 + Math.random() * 120;
    [0, 4, 7].forEach((st, i) => this.tone({ freq: base * 2 ** (st / 12), type: 'triangle', gain: 0.05, attack: 0.004, decay: 0.18, when: i * 0.04 }));
    this.noiseBurst({ freq: 3000, q: 2, gain: 0.06, decay: 0.05, type: 'bandpass' });
  }

  wine() {
    for (let i = 0; i < 5; i += 1) this.tone({ freq: 200 + Math.random() * 120, slideTo: 120, type: 'sine', gain: 0.07, attack: 0.01, decay: 0.12, when: i * 0.11 });
    [0, 4, 7, 11, 14].forEach((st, i) => this.tone({ freq: 392 * 2 ** (st / 12), type: 'sine', gain: 0.05, attack: 0.05, decay: 1.6, when: 0.4 + i * 0.07 }));
  }

  waterWalk() {
    [0, 7, 12, 16].forEach((st) => {
      this.tone({ freq: 220 * 2 ** (st / 12), type: 'sine', gain: 0.045, attack: 0.6, decay: 2.6 });
      this.tone({ freq: 220 * 2 ** (st / 12) * 1.003, type: 'triangle', gain: 0.02, attack: 0.8, decay: 2.4 });
    });
  }

  splash(gain = 0.5) {
    this.noiseBurst({ freq: 1400, q: 0.7, gain: 0.25 * gain, decay: 0.25, type: 'bandpass', rate: 1.2 });
    this.noiseBurst({ freq: 400, q: 0.9, gain: 0.2 * gain, decay: 0.2, type: 'lowpass' });
  }

  heal(healed) {
    const notes = healed ? [0, 4, 7, 12, 16, 19] : [0, 7];
    notes.forEach((st, i) => {
      this.tone({ freq: 523.25 * 2 ** (st / 12), type: 'sine', gain: 0.06, attack: 0.01, decay: 1.8, when: i * 0.08 });
      this.tone({ freq: 523.25 * 2 ** (st / 12) * 2.76, type: 'sine', gain: 0.012, attack: 0.01, decay: 0.9, when: i * 0.08 });
    });
  }

  levitate(on) {
    if (!this.ctx) return;
    const c = this.ctx;
    if (on && !this.liftOsc) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(180, c.currentTime);
      o.frequency.exponentialRampToValueAtTime(420, c.currentTime + 1.2);
      g.gain.setValueAtTime(0.0001, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.05, c.currentTime + 0.4);
      const lfo = c.createOscillator();
      const lg = c.createGain();
      lfo.frequency.value = 6;
      lg.gain.value = 8;
      lfo.connect(lg).connect(o.frequency);
      o.connect(g).connect(this.sfx);
      o.start();
      lfo.start();
      this.liftOsc = { o, g, lfo };
    } else if (!on && this.liftOsc) {
      const { o, g, lfo } = this.liftOsc;
      g.gain.setTargetAtTime(0.0001, c.currentTime, 0.12);
      o.stop(c.currentTime + 0.6);
      lfo.stop(c.currentTime + 0.6);
      this.liftOsc = null;
    }
  }

  cricket() {
    const f = 4200 + Math.random() * 600;
    for (let i = 0; i < 3; i += 1) this.tone({ freq: f, type: 'sine', gain: 0.012, attack: 0.003, decay: 0.03, when: i * 0.05, out: this.amb });
  }

  bird() {
    const f = 2200 + Math.random() * 1600;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i += 1) {
      this.tone({ freq: f, slideTo: f * (1.2 + Math.random() * 0.4), gain: 0.018, attack: 0.01, decay: 0.07, when: i * 0.11, out: this.amb });
    }
  }

  // ---------------------------------------------------------------- Romans
  /** Cornu call: two brassy notes when the garrison is alerted. */
  horn() {
    if (!this.ctx) return;
    for (const [f, when, dur] of [[196, 0, 0.45], [262, 0.42, 0.95]]) {
      this.tone({ freq: f, type: 'sawtooth', gain: 0.045, attack: 0.06, decay: dur, when });
      this.tone({ freq: f * 1.005, type: 'sawtooth', gain: 0.03, attack: 0.08, decay: dur, when });
      this.tone({ freq: f * 2, type: 'square', gain: 0.012, attack: 0.09, decay: dur * 0.8, when });
    }
  }

  /** Armour clatter (ragdolls landing, soldiers getting up). */
  clank(gain = 1) {
    if (!this.ctx || gain < 0.03) return;
    this.noiseBurst({ freq: 3400, q: 5, gain: 0.14 * gain, decay: 0.14, type: 'bandpass', rate: 1.4 });
    this.tone({ freq: 1250 * (0.9 + Math.random() * 0.25), type: 'square', gain: 0.018 * gain, decay: 0.09 });
    this.tone({ freq: 2310 * (0.9 + Math.random() * 0.2), type: 'triangle', gain: 0.02 * gain, decay: 0.2, when: 0.05 });
  }

  /** "Busted" sting. */
  arrest() {
    if (!this.ctx) return;
    [392, 330, 262, 196].forEach((f, i) => this.tone({ freq: f, type: 'triangle', gain: 0.07, attack: 0.01, decay: 0.32, when: i * 0.16 }));
    this.tone({ freq: 70, slideTo: 40, type: 'sine', gain: 0.22, attack: 0.005, decay: 0.5, when: 0.64 });
  }

  /** Relief chord when the Romans give up the search. */
  escaped() {
    if (!this.ctx) return;
    [294, 370, 440, 587].forEach((f, i) => this.pluck(f, i * 0.07, 0.06));
  }

  /** Pursuit drums: tempo and layers follow the star level (0 = silent). */
  setPursuit(level) {
    this.pursuit = level;
  }

  drums(dt) {
    if (!this.pursuit) { this.drumTimer = 0; return; }
    this.drumTimer = (this.drumTimer || 0) - dt;
    if (this.drumTimer > 0) return;
    const lvl = this.pursuit;
    const beat = 0.42 / (1 + lvl * 0.07);
    this.drumStep = ((this.drumStep || 0) + 1) % 8;
    const st = this.drumStep;
    const out = this.music;
    if (st % 2 === 0) this.tone({ freq: 92, slideTo: 48, type: 'sine', gain: 0.16 + lvl * 0.015, attack: 0.004, decay: 0.28, out });
    if (st === 3 || st === 7 || (lvl >= 3 && st === 5)) this.noiseBurst({ freq: 1800, q: 0.8, gain: 0.05 + lvl * 0.008, decay: 0.1, type: 'bandpass', out });
    if (lvl >= 2 && st % 4 === 1) this.tone({ freq: 140, slideTo: 90, type: 'triangle', gain: 0.06, attack: 0.004, decay: 0.16, out });
    if (lvl >= 4 && st === 0) this.tone({ freq: 196, type: 'sawtooth', gain: 0.018, attack: 0.05, decay: beat * 3, out });
    this.drumTimer = beat;
  }

  pluck(freq, when, gain = 0.07) {
    this.tone({ freq, type: 'triangle', gain, attack: 0.005, decay: 1.4, when, out: this.music });
    this.tone({ freq: freq * 2, type: 'sine', gain: gain * 0.3, attack: 0.005, decay: 0.6, when, out: this.music });
  }

  /** Per-frame: ambience mixing by location, gentle lyre phrases, birdsong. */
  update(dt, { marketProximity = 0, playing = false, night = 0 }) {
    if (!this.ctx || this.ctx.state !== 'running' || !this.started) return;
    const t = this.ctx.currentTime;
    this.marketGain.gain.setTargetAtTime(playing ? marketProximity * 0.06 * (1 - night) : 0, t, 0.4);
    this.windGain.gain.setTargetAtTime(playing ? 0.045 : 0.02, t, 0.6);
    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      if (night > 0.5) {
        this.cricket();
        this.birdTimer = 0.4 + Math.random() * 1.2;
      } else {
        this.bird();
        this.birdTimer = 2.5 + Math.random() * 6;
      }
    }
    this.drums(dt);
    this.musicTimer -= dt;
    if (this.pursuit) this.musicTimer = Math.max(this.musicTimer, 2);
    if (this.musicTimer <= 0 && this.settings.musicVolume > 0) {
      const root = 196 * (Math.random() < 0.5 ? 1 : 2 ** (5 / 12));
      const notes = 4 + Math.floor(Math.random() * 4);
      let when = 0;
      for (let i = 0; i < notes; i += 1) {
        const st = PENTA[Math.floor(Math.random() * PENTA.length)];
        this.pluck(root * 2 ** (st / 12), when, 0.05 + Math.random() * 0.03);
        when += Math.random() < 0.3 ? 0.6 : 0.3;
      }
      this.tone({ freq: root / 2, type: 'sine', gain: 0.035, attack: 0.8, decay: 3.5, out: this.music });
      this.musicTimer = when + 3 + Math.random() * 5;
    }
  }
}

function attackSafe(decay) {
  return decay + 0.05;
}
