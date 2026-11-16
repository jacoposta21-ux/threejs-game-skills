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
    gainNode.gain.setValueAtTime(0.0001, t);
    gainNode.gain.exponentialRampToValueAtTime(peak, t + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  noiseBurst({ freq = 800, q = 1, gain = 0.3, decay = 0.12, type = 'bandpass', rate = 1, out }) {
    if (!this.ctx) return;
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
    if (!this.ctx) return;
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

  bird() {
    const f = 2200 + Math.random() * 1600;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i += 1) {
      this.tone({ freq: f, slideTo: f * (1.2 + Math.random() * 0.4), gain: 0.018, attack: 0.01, decay: 0.07, when: i * 0.11, out: this.amb });
    }
  }

  pluck(freq, when, gain = 0.07) {
    this.tone({ freq, type: 'triangle', gain, attack: 0.005, decay: 1.4, when, out: this.music });
    this.tone({ freq: freq * 2, type: 'sine', gain: gain * 0.3, attack: 0.005, decay: 0.6, when, out: this.music });
  }

  /** Per-frame: ambience mixing by location, gentle lyre phrases, birdsong. */
  update(dt, { marketProximity = 0, playing = false }) {
    if (!this.ctx || this.ctx.state !== 'running' || !this.started) return;
    const t = this.ctx.currentTime;
    this.marketGain.gain.setTargetAtTime(playing ? marketProximity * 0.06 : 0, t, 0.4);
    this.windGain.gain.setTargetAtTime(playing ? 0.045 : 0.02, t, 0.6);
    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      this.bird();
      this.birdTimer = 2.5 + Math.random() * 6;
    }
    this.musicTimer -= dt;
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
