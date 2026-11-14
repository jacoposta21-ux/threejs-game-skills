import type { Mode } from '../physics/RacerBody';

export type Sfx =
  | 'click'
  | 'hover'
  | 'count'
  | 'go'
  | 'enterShell'
  | 'exitShell'
  | 'slideStart'
  | 'hit'
  | 'boing'
  | 'bump'
  | 'land'
  | 'hardLand'
  | 'jump'
  | 'boost'
  | 'boostReady'
  | 'overtake'
  | 'overtaken'
  | 'checkpoint'
  | 'finish'
  | 'trick'
  | 'perfect'
  | 'sloppy'
  | 'splash'
  | 'respawn'
  | 'squelch'
  | 'pause'
  | 'pad'
  | 'spark'
  | 'miniturbo'
  | 'itemBox'
  | 'itemGot'
  | 'roulette'
  | 'drop'
  | 'throw'
  | 'spinout'
  | 'shield'
  | 'shieldBreak'
  | 'slimeUp';

interface Loop {
  gain: GainNode;
  filter: BiquadFilterNode;
}

// C major pentatonic-ish material for the tune.
const NOTE = (semi: number) => 261.63 * Math.pow(2, semi / 12);
const CHORDS = [
  [0, 4, 7], // C
  [7, 11, 14], // G
  [9, 12, 16], // Am
  [5, 9, 12], // F
];
const MELODY = [16, -1, 14, 12, 14, -1, 16, 19, 21, -1, 19, 16, 14, 12, 14, -1, 16, -1, 19, 16, 14, -1, 12, 9, 12, -1, 14, 12, 9, 7, 9, -1];

/**
 * All audio is synthesised with Web Audio at runtime: no samples to download,
 * nothing to license. The context is only created after a user gesture.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private noise!: AudioBuffer;
  private roll!: Loop;
  private slide!: Loop;
  private wind!: Loop;
  private ambience!: Loop;
  private rollLfo!: OscillatorNode;
  private rollLfoGain!: GainNode;
  private musicVolume = 0.6;
  private sfxVolume = 0.8;
  private musicTimer = 0;
  private step = 0;
  private nextStepTime = 0;
  private tempo = 104;
  private musicOn = false;
  private birdTimer = 2;
  private muted = false;
  private lastPlayed = new Map<Sfx, number>();

  get ready(): boolean {
    return this.ctx !== null;
  }

  /** Call from a pointer/keyboard handler. Safe to call repeatedly. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.ratio.value = 8;
    this.master.connect(limiter).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.music = ctx.createGain();
    this.sfx.connect(this.master);
    this.music.connect(this.master);
    this.applyVolumes();

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i += 1) {
      // Slightly pink: mix white with a leaky integrator.
      const white = Math.random() * 2 - 1;
      last = last * 0.86 + white * 0.14;
      data[i] = white * 0.55 + last * 2.2;
    }

    this.roll = this.makeLoop('lowpass', 220, 0.8, this.sfx);
    this.slide = this.makeLoop('bandpass', 2400, 0.7, this.sfx);
    this.wind = this.makeLoop('bandpass', 700, 0.5, this.sfx);
    this.ambience = this.makeLoop('lowpass', 500, 0.3, this.music);
    this.ambience.gain.gain.value = 0.05;
    // Rumble wobble locked to shell rotation.
    this.rollLfo = ctx.createOscillator();
    this.rollLfoGain = ctx.createGain();
    this.rollLfoGain.gain.value = 0;
    this.rollLfo.connect(this.rollLfoGain).connect(this.roll.gain.gain);
    this.rollLfo.start();

    this.musicTimer = window.setInterval(() => this.schedule(), 90);
  }

  private makeLoop(type: BiquadFilterType, freq: number, q: number, dest: AudioNode): Loop {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(dest);
    src.start(0, Math.random() * 1.5);
    return { gain, filter };
  }

  setVolumes(music: number, sfx: number): void {
    this.musicVolume = music;
    this.sfxVolume = sfx;
    this.applyVolumes();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.05);
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    this.sfx.gain.value = this.sfxVolume;
    this.music.gain.value = this.musicVolume * 0.55;
  }

  /** Engine-style loops driven by the player's motion; call every frame. */
  updateMotion(mode: Mode, speed: number, grounded: boolean, active: boolean, dt: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const k = Math.min(1, speed / 40);
    const rolling = active && mode === 'roll' && grounded;
    const sliding = active && mode === 'slide' && grounded;
    this.roll.gain.gain.setTargetAtTime(rolling ? 0.1 + k * 0.42 : 0, t, 0.06);
    this.roll.filter.frequency.setTargetAtTime(140 + k * 900, t, 0.08);
    this.rollLfo.frequency.setTargetAtTime(Math.max(0.5, Math.min(22, speed / 3.4)), t, 0.08);
    this.rollLfoGain.gain.setTargetAtTime(rolling ? 0.06 + k * 0.1 : 0, t, 0.06);
    this.slide.gain.gain.setTargetAtTime(sliding ? 0.05 + k * 0.2 : 0, t, 0.05);
    this.slide.filter.frequency.setTargetAtTime(1500 + k * 2600, t, 0.08);
    this.wind.gain.gain.setTargetAtTime(active ? k * k * 0.5 + (grounded ? 0 : 0.12) : 0, t, 0.12);
    this.wind.filter.frequency.setTargetAtTime(420 + k * 1500, t, 0.12);

    // Birdsong in the hedges.
    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      this.birdTimer = 2.5 + Math.random() * 5;
      this.bird();
    }
  }

  silenceMotion(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const loop of [this.roll, this.slide, this.wind]) loop.gain.gain.setTargetAtTime(0, t, 0.05);
    this.rollLfoGain.gain.setTargetAtTime(0, t, 0.05);
  }

  setMusic(on: boolean, tempo: number): void {
    this.musicOn = on;
    this.tempo = tempo;
    if (on && this.ctx && this.nextStepTime < this.ctx.currentTime) this.nextStepTime = this.ctx.currentTime + 0.05;
  }

  // ------------------------------------------------------------ synth voices

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, to = freq, when = 0, dest: AudioNode = this.sfx, attack = 0.005): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private burst(dur: number, type: BiquadFilterType, freq: number, vol: number, to = freq, when = 0, q = 0.8): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (to !== freq) f.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
  }

  private bird(): void {
    if (!this.ctx || this.muted) return;
    const base = 2200 + Math.random() * 1800;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i += 1) {
      this.tone(base * (1 + i * 0.06), 0.09, 'sine', 0.035, base * 1.35, i * 0.13, this.music);
    }
  }

  play(name: Sfx, intensity = 1): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    // De-duplicate machine-gun triggers of the same effect.
    const now = this.ctx.currentTime;
    const prev = this.lastPlayed.get(name) ?? -1;
    if (now - prev < 0.05) return;
    this.lastPlayed.set(name, now);
    const v = Math.max(0.15, Math.min(1, intensity));
    switch (name) {
      case 'click':
        this.tone(620, 0.09, 'triangle', 0.28, 930);
        break;
      case 'hover':
        this.tone(540, 0.04, 'sine', 0.1);
        break;
      case 'pause':
        this.tone(500, 0.12, 'triangle', 0.22, 330);
        break;
      case 'count':
        this.tone(440, 0.22, 'triangle', 0.4);
        this.tone(880, 0.12, 'sine', 0.12);
        break;
      case 'go':
        for (const [i, f] of [523, 659, 784, 1047].entries()) this.tone(f, 0.6, 'triangle', 0.26, f, i * 0.03);
        this.burst(0.35, 'highpass', 3000, 0.12);
        break;
      case 'enterShell':
        this.tone(520, 0.14, 'sine', 0.3, 180);
        this.burst(0.08, 'lowpass', 900, 0.25);
        break;
      case 'exitShell':
        this.tone(240, 0.16, 'sine', 0.3, 560);
        this.tone(700, 0.06, 'triangle', 0.12, 700, 0.12);
        break;
      case 'slideStart':
        this.burst(0.35, 'bandpass', 900, 0.3, 3600, 0, 1.5);
        this.tone(300, 0.2, 'sine', 0.12, 500);
        break;
      case 'squelch':
        this.burst(0.07, 'bandpass', 520, 0.12 * v, 280, 0, 3);
        break;
      case 'hit':
        this.tone(170, 0.2, 'sine', 0.55 * v, 55);
        this.burst(0.12, 'lowpass', 1200, 0.4 * v, 300);
        break;
      case 'bump':
        this.tone(300, 0.12, 'triangle', 0.35 * v, 140);
        this.burst(0.06, 'bandpass', 1800, 0.2 * v);
        break;
      case 'boing':
        this.tone(190, 0.38, 'sine', 0.45, 520);
        this.tone(380, 0.3, 'triangle', 0.14, 760, 0.02);
        break;
      case 'land':
        this.burst(0.16, 'lowpass', 420, 0.5 * v, 120);
        this.tone(110, 0.14, 'sine', 0.4 * v, 60);
        break;
      case 'hardLand':
        this.burst(0.3, 'lowpass', 600, 0.7, 90);
        this.tone(90, 0.3, 'sine', 0.6, 40);
        break;
      case 'jump':
        this.burst(0.5, 'bandpass', 500, 0.22, 2600, 0, 1.2);
        break;
      case 'boost':
        this.tone(160, 0.7, 'sawtooth', 0.22, 880);
        this.tone(320, 0.7, 'square', 0.08, 1760);
        this.burst(0.8, 'bandpass', 700, 0.4, 5200, 0, 0.9);
        break;
      case 'boostReady':
        this.tone(784, 0.1, 'triangle', 0.2);
        this.tone(1175, 0.18, 'triangle', 0.2, 1175, 0.09);
        break;
      case 'overtake':
        this.tone(660, 0.09, 'triangle', 0.25);
        this.tone(990, 0.14, 'triangle', 0.25, 990, 0.08);
        break;
      case 'overtaken':
        this.tone(440, 0.1, 'triangle', 0.2);
        this.tone(311, 0.16, 'triangle', 0.2, 311, 0.09);
        break;
      case 'checkpoint':
        this.tone(880, 0.3, 'sine', 0.25);
        this.tone(1320, 0.4, 'sine', 0.2, 1320, 0.1);
        break;
      case 'trick':
        for (const [i, f] of [1175, 1568, 2093].entries()) this.tone(f, 0.22, 'sine', 0.16, f, i * 0.06);
        break;
      case 'perfect':
        for (const [i, f] of [784, 988, 1319, 1568].entries()) this.tone(f, 0.25, 'triangle', 0.16, f, i * 0.05);
        break;
      case 'sloppy':
        this.tone(140, 0.3, 'sawtooth', 0.2, 70);
        break;
      case 'splash':
        this.burst(0.45, 'bandpass', 1500, 0.45 * v, 500, 0, 0.6);
        this.burst(0.2, 'highpass', 4000, 0.15 * v);
        break;
      case 'respawn':
        this.tone(700, 0.35, 'sine', 0.25, 220);
        this.tone(220, 0.25, 'triangle', 0.2, 660, 0.3);
        break;
      case 'pad':
        this.tone(300, 0.35, 'sawtooth', 0.16, 1200);
        this.burst(0.35, 'bandpass', 1200, 0.3, 4800, 0, 1.1);
        break;
      case 'spark':
        this.tone(intensity > 1.5 ? 1400 : 1000, 0.12, 'square', 0.08, intensity > 1.5 ? 1800 : 1300);
        break;
      case 'miniturbo':
        this.tone(220, 0.4, 'sawtooth', 0.18, 700);
        this.burst(0.4, 'bandpass', 800, 0.3, 3600, 0, 1);
        break;
      case 'itemBox':
        for (const [i, f] of [880, 1109, 1319].entries()) this.tone(f, 0.12, 'triangle', 0.16, f, i * 0.04);
        break;
      case 'roulette':
        this.tone(1200 + Math.random() * 400, 0.04, 'square', 0.05);
        break;
      case 'itemGot':
        this.tone(988, 0.1, 'triangle', 0.2);
        this.tone(1480, 0.2, 'triangle', 0.2, 1480, 0.08);
        break;
      case 'drop':
        this.tone(420, 0.18, 'sine', 0.3, 160);
        this.burst(0.08, 'lowpass', 700, 0.2);
        break;
      case 'throw':
        this.burst(0.3, 'bandpass', 600, 0.3, 2400, 0, 1.4);
        this.tone(500, 0.2, 'triangle', 0.15, 900);
        break;
      case 'spinout':
        for (let k = 0; k < 4; k += 1) this.tone(700 - k * 90, 0.12, 'triangle', 0.2 * v, 400 - k * 60, k * 0.11);
        break;
      case 'shield':
        this.tone(520, 0.5, 'sine', 0.2, 1040);
        this.tone(780, 0.5, 'sine', 0.12, 1560, 0.05);
        break;
      case 'shieldBreak':
        this.burst(0.3, 'highpass', 2500, 0.35);
        this.tone(1200, 0.25, 'triangle', 0.2, 300);
        break;
      case 'slimeUp':
        this.burst(0.4, 'bandpass', 500, 0.3, 1800, 0, 3);
        this.tone(300, 0.4, 'sine', 0.2, 900);
        break;
      case 'finish':
        for (const [i, f] of [523, 659, 784, 1047, 1319, 1568].entries()) this.tone(f, 0.5, 'triangle', 0.24, f, i * 0.1);
        for (const f of [523, 659, 784, 1047]) this.tone(f, 1.4, 'sine', 0.14, f, 0.65);
        break;
    }
  }

  // ------------------------------------------------------------------ music

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicOn || ctx.state !== 'running') return;
    const stepDur = 60 / this.tempo / 2;
    if (this.nextStepTime < ctx.currentTime - 0.5) this.nextStepTime = ctx.currentTime + 0.05;
    while (this.nextStepTime < ctx.currentTime + 0.25) {
      this.playStep(this.step, this.nextStepTime - ctx.currentTime, stepDur);
      this.nextStepTime += stepDur;
      this.step = (this.step + 1) % 64;
    }
  }

  private playStep(step: number, when: number, dur: number): void {
    const bar = Math.floor(step / 8) % 4;
    const beat = step % 8;
    const chord = CHORDS[bar];
    // Bouncy bass on the root and fifth.
    if (beat === 0 || beat === 3 || beat === 6) {
      this.tone(NOTE(chord[beat === 3 ? 2 : 0] - 24), dur * 1.6, 'triangle', 0.3, undefined, when, this.music, 0.01);
    }
    // Ukulele-style off-beat strum.
    if (beat === 2 || beat === 5 || beat === 7) {
      chord.forEach((semi, i) => this.tone(NOTE(semi), dur * 0.9, 'triangle', 0.075, undefined, when + i * 0.012, this.music));
    }
    // Whistled melody, second half of the loop only so it breathes.
    const m = MELODY[step % 32];
    if (step >= 32 && m >= 0) this.tone(NOTE(m), dur * 1.5, 'sine', 0.11, undefined, when, this.music, 0.02);
    // Shaker.
    if (beat % 2 === 1) {
      const ctx = this.ctx!;
      const t = ctx.currentTime + when;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 6000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.05, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      src.connect(f).connect(g).connect(this.music);
      src.start(t, Math.random());
      src.stop(t + 0.07);
    }
  }

  dispose(): void {
    window.clearInterval(this.musicTimer);
    void this.ctx?.close();
    this.ctx = null;
  }
}
