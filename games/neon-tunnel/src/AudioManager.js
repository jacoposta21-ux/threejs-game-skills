// Fully synthesised audio (Web Audio API): a procedural synthwave soundtrack
// whose layers, tempo and filter open up with speed, plus every gameplay SFX.
// The AudioContext is only created/resumed after a user gesture to respect
// browser autoplay rules.

const PROGRESSION = [
  // A minor: Am - F - C - G (root midi, chord intervals)
  { root: 45, chord: [0, 3, 7, 12] },
  { root: 41, chord: [0, 4, 7, 12] },
  { root: 48, chord: [0, 4, 7, 12] },
  { root: 43, chord: [0, 4, 7, 12] },
];
const PENTA = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioManager {
  constructor(settings) {
    this.ctx = null;
    this.settings = settings;
    this.mode = 'menu';
    this.intensity = 0;
    this.step = 0;
    this.bar = 0;
    this.nextTime = 0;
    this.timer = null;
    this.beatPulse = 0;
    this.lastBeatTime = 0;
  }

  /** Must be called from a user gesture handler. Safe to call repeatedly. */
  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.build();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    if (!this.timer) this.startScheduler();
  }

  build() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 4;
    this.master.connect(this.comp).connect(ctx.destination);

    this.musicBus = ctx.createGain();
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 18000;
    this.musicBus.connect(this.musicFilter).connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);

    // tempo-synced echo for arps / leads
    this.delay = ctx.createDelay(1.5);
    this.delayFb = ctx.createGain();
    this.delayFb.gain.value = 0.32;
    this.delayWet = ctx.createGain();
    this.delayWet.gain.value = 0.35;
    this.delay.connect(this.delayFb).connect(this.delay);
    this.delay.connect(this.delayWet).connect(this.musicBus);

    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;

    // continuous movement hum
    this.hum = ctx.createOscillator();
    this.hum.type = 'sawtooth';
    this.hum.frequency.value = 70;
    this.humFilter = ctx.createBiquadFilter();
    this.humFilter.type = 'lowpass';
    this.humFilter.frequency.value = 400;
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    this.hum.connect(this.humFilter).connect(this.humGain).connect(this.sfxBus);
    this.hum.start();

    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : s.master, t, 0.03);
    this.musicBus.gain.setTargetAtTime(s.music * 0.55, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(s.sfx, t, 0.05);
  }

  setMode(mode) {
    this.mode = mode;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const cutoff = mode === 'paused' ? 600 : mode === 'over' ? 350 : 18000;
    this.musicFilter.frequency.setTargetAtTime(cutoff, t, mode === 'game' ? 0.05 : 0.25);
    if (mode !== 'game') this.humGain.gain.setTargetAtTime(0, t, 0.05);
  }

  setIntensity(v) {
    this.intensity = Math.max(0, Math.min(1, v));
  }

  setMovement(amount, speedNorm) {
    if (!this.ctx || this.mode !== 'game') return;
    const t = this.ctx.currentTime;
    this.humGain.gain.setTargetAtTime(0.012 + amount * 0.05, t, 0.04);
    this.hum.frequency.setTargetAtTime(60 + speedNorm * 50 + amount * 30, t, 0.06);
    this.humFilter.frequency.setTargetAtTime(250 + amount * 900 + speedNorm * 300, t, 0.05);
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  // ------------------------------------------------------------ sequencer

  startScheduler() {
    this.nextTime = this.ctx.currentTime + 0.08;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  get bpm() {
    if (this.mode === 'menu') return 100;
    return 112 + this.intensity * 22;
  }

  schedule() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ahead = this.ctx.currentTime + 0.12;
    while (this.nextTime < ahead) {
      this.playStep(this.step, this.nextTime);
      const sixteenth = 60 / this.bpm / 4;
      this.nextTime += sixteenth;
      this.step = (this.step + 1) % 16;
      if (this.step === 0) this.bar = (this.bar + 1) % (PROGRESSION.length * 2);
    }
  }

  playStep(step, t) {
    const mode = this.mode;
    if (mode === 'over') {
      if (step === 0 && this.bar % 2 === 0) this.pad(t, PROGRESSION[(this.bar >> 1) % 4], 0.5);
      return;
    }
    const chord = PROGRESSION[(this.bar >> 1) % PROGRESSION.length];
    const I = mode === 'menu' ? 0 : this.intensity;
    const game = mode === 'game' || mode === 'paused';
    this.delay.delayTime.setValueAtTime((60 / this.bpm) * 0.75, t);

    if (step === 0 && this.bar % 2 === 0) this.pad(t, chord, game ? 0.6 : 0.9);
    if (game && step % 4 === 0) {
      this.kick(t, 0.9);
      if (step === 0 || step === 8) this.lastBeatTime = t;
    }
    if (game && step % 4 === 2) this.bass(t, chord.root - 12, 0.4 + I * 0.25, 300 + I * 1900);
    if (game && I > 0.45 && step % 4 === 3) this.bass(t, chord.root, 0.25, 500 + I * 1500);
    if (game && step % 2 === 1) this.hat(t, 0.12 + I * 0.08);
    if (game && I > 0.3 && step % 2 === 0) this.hat(t, 0.05);
    if (game && I > 0.25 && (step === 4 || step === 12)) this.clap(t, 0.35);
    const arpOn = mode === 'menu' ? step % 2 === 0 : I > 0.12 || step % 4 === 0;
    if (arpOn) {
      const note = chord.root + 24 + chord.chord[(step + (this.bar % 2) * 2) % chord.chord.length];
      this.arp(t, note, mode === 'menu' ? 0.06 : 0.05 + I * 0.04);
    }
    if (game && I > 0.65 && step % 8 === 6) this.arp(t, chord.root + 36 + chord.chord[2], 0.05);
  }

  envGain(t, peak, attack, decay) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  kick(t, v) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = this.envGain(t, v, 0.003, 0.32);
    o.connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + 0.4);
  }

  bass(t, midi, v, cutoff) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = mtof(midi);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 6;
    f.frequency.setValueAtTime(cutoff * 1.6, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(80, cutoff * 0.4), t + 0.18);
    const g = this.envGain(t, v, 0.005, 0.2);
    o.connect(f).connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + 0.3);
  }

  noiseSource(t, dur) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.start(t, Math.random() * 0.5, dur);
    return src;
  }

  hat(t, v) {
    const src = this.noiseSource(t, 0.06);
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7500;
    const g = this.envGain(t, v, 0.002, 0.045);
    src.connect(f).connect(g).connect(this.musicBus);
  }

  clap(t, v) {
    const src = this.noiseSource(t, 0.2);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1600;
    f.Q.value = 0.8;
    const g = this.envGain(t, v, 0.003, 0.16);
    src.connect(f).connect(g).connect(this.musicBus);
  }

  arp(t, midi, v) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = mtof(midi);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2400 + this.intensity * 2600;
    const g = this.envGain(t, v, 0.004, 0.14);
    o.connect(f).connect(g);
    g.connect(this.musicBus);
    g.connect(this.delay);
    o.start(t);
    o.stop(t + 0.2);
  }

  pad(t, chord, v) {
    const ctx = this.ctx;
    const dur = (60 / this.bpm) * 8;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(500, t);
    f.frequency.linearRampToValueAtTime(1400 + this.intensity * 1200, t + dur * 0.5);
    f.frequency.linearRampToValueAtTime(600, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.09 * v, t + 0.6);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    f.connect(g).connect(this.musicBus);
    for (const iv of chord.chord.slice(0, 3)) {
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(chord.root + 12 + iv);
        o.detune.value = det;
        o.connect(f);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
    }
  }

  /** 0..1 pulse that peaks on every half-bar kick, for visuals. */
  beat() {
    if (!this.ctx || this.mode !== 'game') return 0;
    const dt = this.ctx.currentTime - this.lastBeatTime;
    if (dt < 0) return 0;
    return Math.exp(-dt * 6);
  }

  // ------------------------------------------------------------ sfx

  tone(type, f0, f1, dur, v, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.envGain(t, v, 0.005, dur);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noiseSweep(f0, f1, dur, v, type = 'bandpass', q = 1.2, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const src = this.noiseSource(t, dur + 0.05);
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.envGain(t, v, 0.01, dur);
    src.connect(f).connect(g).connect(this.sfxBus);
  }

  collect(chain) {
    const n = PENTA[Math.min(PENTA.length - 1, chain % PENTA.length)];
    const f = mtof(81 + n);
    this.tone('triangle', f, f * 1.01, 0.12, 0.16);
    this.tone('sine', f * 2, f * 2, 0.08, 0.06, 0.02);
  }

  nearMiss() {
    this.noiseSweep(600, 5000, 0.22, 0.35, 'bandpass', 1.5);
    this.tone('sine', 1760, 2640, 0.1, 0.08, 0.04);
  }

  powerUp(type) {
    const base = type === 'boost' ? 62 : type === 'shield' ? 67 : 64;
    [0, 4, 7, 12].forEach((iv, i) => this.tone('square', mtof(base + iv), mtof(base + iv), 0.1, 0.07, i * 0.055));
    this.noiseSweep(1000, 9000, 0.35, 0.12, 'highpass', 0.7);
    if (type === 'boost') this.noiseSweep(200, 3000, 0.9, 0.3, 'bandpass', 2);
  }

  powerDown() {
    this.tone('triangle', 900, 300, 0.25, 0.08);
  }

  shieldBreak() {
    this.noiseSweep(4000, 300, 0.4, 0.4, 'bandpass', 0.8);
    this.tone('sawtooth', 600, 120, 0.35, 0.12);
  }

  smash() {
    this.noiseSweep(3000, 400, 0.2, 0.3, 'bandpass', 1);
    this.tone('square', 220, 90, 0.15, 0.08);
  }

  explosion() {
    this.noiseSweep(5000, 60, 1.4, 0.8, 'lowpass', 0.5);
    this.tone('sine', 140, 28, 1.0, 0.7);
    this.tone('sawtooth', 300, 40, 0.6, 0.12);
  }

  themeChange() {
    this.noiseSweep(200, 8000, 1.2, 0.22, 'bandpass', 3);
    this.tone('sine', mtof(57), mtof(69), 1.0, 0.08);
  }

  tierUp() {
    [0, 7, 12].forEach((iv, i) => this.tone('sawtooth', mtof(69 + iv), mtof(69 + iv), 0.16, 0.05, i * 0.08));
  }

  countdown(final) {
    this.tone('square', final ? 1320 : 880, final ? 1320 : 880, final ? 0.25 : 0.1, 0.08);
  }

  uiHover() {
    this.tone('sine', 1500, 1500, 0.03, 0.025);
  }

  uiClick() {
    this.tone('square', 900, 1400, 0.06, 0.05);
  }

  uiDenied() {
    this.tone('square', 220, 160, 0.15, 0.06);
  }
}
