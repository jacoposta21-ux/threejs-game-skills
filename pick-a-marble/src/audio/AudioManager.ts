/**
 * Procedural Web Audio: generative music, rolling loop and synthesized SFX.
 * No external assets, so the game stays a small single-bundle build.
 */
export type MusicMood = 'menu' | 'editor' | 'race' | 'none';

const NOTE = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);

interface Voice {
  t: number;
}

export class AudioManager {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private rollGain!: GainNode;
  private rollFilter!: BiquadFilterNode;
  private windGain!: GainNode;
  private noiseBuf!: AudioBuffer;
  private mood: MusicMood = 'none';
  private nextBeat = 0;
  private beat = 0;
  private timer = 0;
  private volumes = { master: 0.8, music: 0.55, sfx: 0.85, muted: false };
  private lastClack = 0;
  private clackCount = 0;
  private paused = false;
  private duckUntil = 0;

  /** Offset added to "now" so SFX can be scheduled at timeline positions (offline render). */
  timeOffset = 0;

  /** Must be called from a user gesture. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !this.paused) void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.setup(new Ctor());
  }

  /** Render music + timed SFX into a buffer (used to score trailers). */
  static async renderOffline(seconds: number, mood: MusicMood, cues: { t: number; fn: (a: AudioManager) => void }[]): Promise<AudioBuffer> {
    const ctx = new OfflineAudioContext(2, Math.ceil(44100 * seconds), 44100);
    const a = new AudioManager();
    a.setup(ctx as unknown as AudioContext, false);
    a.mood = mood;
    a.nextBeat = 0.05;
    a.beat = 0;
    const spb = 60 / (mood === 'race' ? 124 : mood === 'editor' ? 98 : 88) / 2;
    while (a.nextBeat < seconds) {
      a.playStep(a.beat, a.nextBeat, spb);
      a.nextBeat += spb;
      a.beat += 1;
    }
    for (const c of cues) {
      a.timeOffset = c.t;
      c.fn(a);
    }
    a.timeOffset = 0;
    // fade out the last second
    a.master.gain.setValueAtTime(0.9, seconds - 1.2);
    a.master.gain.linearRampToValueAtTime(0.0001, seconds);
    return ctx.startRendering();
  }

  private setup(ctx: AudioContext, live = true): void {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(comp);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(comp);
    // noise buffer
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i += 1) {
      const w = Math.random() * 2 - 1;
      b = 0.97 * b + 0.03 * w;
      d[i] = w * 0.5 + b * 2;
    }
    // rolling loop
    const roll = ctx.createBufferSource();
    roll.buffer = this.noiseBuf;
    roll.loop = true;
    this.rollFilter = ctx.createBiquadFilter();
    this.rollFilter.type = 'bandpass';
    this.rollFilter.frequency.value = 300;
    this.rollFilter.Q.value = 1.2;
    this.rollGain = ctx.createGain();
    this.rollGain.gain.value = 0;
    roll.connect(this.rollFilter).connect(this.rollGain).connect(this.sfxBus);
    roll.start();
    // wind ambience
    const wind = ctx.createBufferSource();
    wind.buffer = this.noiseBuf;
    wind.loop = true;
    wind.playbackRate.value = 0.35;
    const wf = ctx.createBiquadFilter();
    wf.type = 'lowpass';
    wf.frequency.value = 500;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.035;
    wind.connect(wf).connect(this.windGain).connect(this.musicBus);
    wind.start();
    if (live) {
      this.applyVolumes();
      this.timer = window.setInterval(() => this.schedule(), 60);
    } else {
      this.master.gain.value = 0.9;
      this.musicBus.gain.value = 0.32;
      this.sfxBus.gain.value = 0.9;
    }
  }

  setVolumes(master: number, music: number, sfx: number, muted: boolean): void {
    this.volumes = { master, music, sfx, muted };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.muted ? 0 : this.volumes.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.volumes.music * 0.5, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
  }

  /** Pause everything (ads, tab hidden, pause menu with mute). */
  setPaused(paused: boolean): void {
    this.paused = paused;
    if (!this.ctx) return;
    if (paused) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  setMood(mood: MusicMood): void {
    if (mood === this.mood) return;
    this.mood = mood;
    this.beat = 0;
    if (this.ctx) this.nextBeat = this.ctx.currentTime + 0.1;
  }

  /* ------------------------------------------------------------ music */

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || this.paused || this.mood === 'none') return;
    const bpm = this.mood === 'race' ? 124 : this.mood === 'editor' ? 98 : 88;
    const spb = 60 / bpm / 2; // eighth notes
    while (this.nextBeat < ctx.currentTime + 0.25) {
      this.playStep(this.beat, this.nextBeat, spb);
      this.nextBeat += spb;
      this.beat += 1;
    }
  }

  private playStep(step: number, t: number, spb: number): void {
    const prog =
      this.mood === 'menu'
        ? [
            [53, 57, 60, 64],
            [52, 55, 59, 62],
            [50, 53, 57, 60],
            [48, 52, 55, 59],
          ]
        : [
            [48, 52, 55, 60],
            [43, 47, 50, 55],
            [45, 48, 52, 57],
            [41, 45, 48, 53],
          ];
    const bar = Math.floor(step / 8) % prog.length;
    const chord = prog[bar];
    const inBar = step % 8;
    const duck = t < this.duckUntil ? 0.35 : 1;
    if (inBar === 0) {
      for (const n of chord) this.pad(NOTE(n), t, spb * 8, 0.035 * duck);
      this.bass(NOTE(chord[0] - 12), t, spb * 3, 0.16 * duck);
    }
    if (this.mood !== 'menu' && inBar === 4) this.bass(NOTE(chord[0] - 12 + 7), t, spb * 2, 0.12 * duck);
    const arp = [0, 1, 2, 3, 2, 1, 2, 3];
    const n = chord[arp[inBar]] + 12;
    if (this.mood === 'race' || inBar % 2 === 0 || this.mood === 'editor') this.pluck(NOTE(n), t, 0.06 * duck);
    if (this.mood === 'race') {
      if (inBar % 4 === 0) this.kick(t, 0.5 * duck);
      if (inBar % 2 === 1) this.hat(t, 0.05 * duck);
      if (inBar === 4) this.snare(t, 0.12 * duck);
    } else if (this.mood === 'editor' && inBar % 4 === 2) this.hat(t, 0.025 * duck);
  }

  private osc(type: OscillatorType, freq: number, t: number, dur: number, gain: number, bus: AudioNode, attack = 0.005, detune = 0): void {
    const ctx = this.ctx as AudioContext;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private pad(f: number, t: number, dur: number, gain: number): void {
    const ctx = this.ctx as AudioContext;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1100;
    filter.connect(this.musicBus);
    for (const det of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.05);
      o.connect(g).connect(filter);
      o.start(t);
      o.stop(t + dur * 1.1);
    }
  }

  private pluck(f: number, t: number, gain: number): void {
    this.osc('triangle', f, t, 0.35, gain, this.musicBus, 0.004);
    this.osc('sine', f * 2, t, 0.18, gain * 0.4, this.musicBus, 0.003);
  }

  private bass(f: number, t: number, dur: number, gain: number): void {
    this.osc('sine', f, t, dur, gain, this.musicBus, 0.01);
    this.osc('triangle', f, t, dur * 0.6, gain * 0.3, this.musicBus, 0.01);
  }

  private kick(t: number, gain: number): void {
    const ctx = this.ctx as AudioContext;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + 0.3);
  }

  private noise(t: number, dur: number, gain: number, type: BiquadFilterType, freq: number, bus: AudioNode, q = 1, rate = 1): void {
    const ctx = this.ctx as AudioContext;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.playbackRate.value = rate;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(bus);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
  }

  private hat(t: number, gain: number): void {
    this.noise(t, 0.05, gain, 'highpass', 7000, this.musicBus);
  }

  private snare(t: number, gain: number): void {
    this.noise(t, 0.16, gain, 'bandpass', 1800, this.musicBus, 0.8);
    this.osc('triangle', 190, t, 0.1, gain * 0.6, this.musicBus);
  }

  /* -------------------------------------------------------------- sfx */

  private get now(): number {
    return (this.ctx ? this.ctx.currentTime : 0) + this.timeOffset;
  }

  private ok(): boolean {
    return !!this.ctx && !this.paused;
  }

  click(): void {
    if (!this.ok()) return;
    this.osc('sine', 880, this.now, 0.06, 0.12, this.sfxBus, 0.002);
  }

  hover(): void {
    if (!this.ok()) return;
    this.osc('sine', 1320, this.now, 0.03, 0.03, this.sfxBus, 0.002);
  }

  place(): void {
    if (!this.ok()) return;
    const t = this.now;
    this.osc('sine', 220, t, 0.12, 0.25, this.sfxBus, 0.003);
    this.osc('triangle', 440, t, 0.08, 0.1, this.sfxBus, 0.002);
    this.noise(t, 0.05, 0.1, 'lowpass', 1200, this.sfxBus);
  }

  snap(): void {
    if (!this.ok()) return;
    const t = this.now;
    this.osc('square', 1200, t, 0.04, 0.04, this.sfxBus, 0.001);
    this.osc('sine', 1800, t + 0.03, 0.05, 0.05, this.sfxBus, 0.001);
  }

  remove(): void {
    if (!this.ok()) return;
    const ctx = this.ctx as AudioContext;
    const t = this.now;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(500, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.15);
    g.gain.setValueAtTime(0.2, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + 0.2);
  }

  error(): void {
    if (!this.ok()) return;
    this.osc('square', 180, this.now, 0.18, 0.06, this.sfxBus);
    this.osc('square', 150, this.now + 0.1, 0.2, 0.06, this.sfxBus);
  }

  countdown(final: boolean): void {
    if (!this.ok()) return;
    const t = this.now;
    if (final) {
      this.osc('square', 1046, t, 0.45, 0.12, this.sfxBus);
      this.osc('sine', 523, t, 0.5, 0.2, this.sfxBus);
      this.noise(t, 0.3, 0.1, 'highpass', 3000, this.sfxBus);
    } else {
      this.osc('square', 523, t, 0.22, 0.1, this.sfxBus);
    }
  }

  gate(): void {
    if (!this.ok()) return;
    const t = this.now;
    this.noise(t, 0.4, 0.15, 'bandpass', 600, this.sfxBus, 2, 0.6);
    this.osc('sawtooth', 90, t, 0.3, 0.05, this.sfxBus);
  }

  /** Marble-to-marble or marble-to-track impact. strength 0..1 */
  clack(strength: number, glassy: boolean): void {
    if (!this.ok()) return;
    const t = this.now;
    if (t - this.lastClack < 0.012 && t >= this.lastClack) return;
    if (Math.floor(t * 10) !== Math.floor(this.lastClack * 10)) this.clackCount = 0;
    if (this.clackCount > 6) return;
    this.clackCount += 1;
    this.lastClack = t;
    const s = Math.min(1, strength);
    const f = glassy ? 2400 + Math.random() * 1600 : 900 + Math.random() * 500;
    this.osc('sine', f, t, glassy ? 0.09 : 0.05, 0.05 + s * 0.25, this.sfxBus, 0.001);
    this.osc('sine', f * 1.51, t, 0.04, 0.03 + s * 0.08, this.sfxBus, 0.001);
    if (!glassy) this.noise(t, 0.03, 0.03 + s * 0.08, 'bandpass', 1500, this.sfxBus, 1.5);
  }

  /** Continuous rolling bed. intensity 0..1, speed 0..1 */
  rolling(intensity: number, speed: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.rollGain.gain.setTargetAtTime(Math.min(0.5, intensity * 0.45), t, 0.08);
    this.rollFilter.frequency.setTargetAtTime(180 + speed * 900, t, 0.1);
  }

  boost(): void {
    if (!this.ok()) return;
    const ctx = this.ctx as AudioContext;
    const t = this.now;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 3;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(3500, t + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    s.connect(f).connect(g).connect(this.sfxBus);
    s.start(t);
    s.stop(t + 0.45);
    this.osc('sawtooth', 220, t, 0.3, 0.03, this.sfxBus);
  }

  jump(): void {
    if (!this.ok()) return;
    const ctx = this.ctx as AudioContext;
    const t = this.now;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(300, t);
    o.frequency.exponentialRampToValueAtTime(900, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + 0.3);
  }

  bounce(): void {
    if (!this.ok()) return;
    const ctx = this.ctx as AudioContext;
    const t = this.now;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(520, t + 0.12);
    o.frequency.exponentialRampToValueAtTime(260, t + 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + 0.4);
  }

  cannon(): void {
    if (!this.ok()) return;
    const t = this.now;
    this.noise(t, 0.6, 0.5, 'lowpass', 500, this.sfxBus, 0.7, 0.5);
    this.kickSfx(t);
  }

  private kickSfx(t: number): void {
    const ctx = this.ctx as AudioContext;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(35, t + 0.3);
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + 0.5);
  }

  fall(): void {
    if (!this.ok()) return;
    const ctx = this.ctx as AudioContext;
    const t = this.now;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(900, t);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + 0.6);
  }

  finish(place: number): void {
    if (!this.ok()) return;
    const t = this.now;
    const base = place === 1 ? 72 : place <= 3 ? 67 : 64;
    this.osc('triangle', NOTE(base), t, 0.3, 0.16, this.sfxBus);
    this.osc('triangle', NOTE(base + 7), t + 0.08, 0.35, 0.14, this.sfxBus);
    if (place === 1) this.osc('sine', NOTE(base + 12), t + 0.16, 0.5, 0.14, this.sfxBus);
  }

  victory(): void {
    if (!this.ok()) return;
    this.duckUntil = this.now + 2.5;
    const t = this.now + 0.05;
    const seq = [60, 64, 67, 72, 67, 72, 76, 79];
    seq.forEach((n, i) => {
      this.osc('square', NOTE(n), t + i * 0.11, 0.2, 0.06, this.sfxBus);
      this.osc('triangle', NOTE(n), t + i * 0.11, 0.35, 0.12, this.sfxBus);
    });
    [60, 64, 67, 72].forEach((n) => this.osc('sawtooth', NOTE(n), t + 0.9, 1.2, 0.04, this.sfxBus, 0.02));
    for (let i = 0; i < 5; i += 1) this.noise(t + 0.9 + i * 0.18, 0.25, 0.06, 'highpass', 4000, this.sfxBus);
  }

  coin(): void {
    if (!this.ok()) return;
    const t = this.now;
    this.osc('square', 1318, t, 0.08, 0.06, this.sfxBus);
    this.osc('square', 1760, t + 0.07, 0.18, 0.06, this.sfxBus);
  }

  levelUp(): void {
    if (!this.ok()) return;
    const t = this.now;
    [67, 71, 74, 79, 83].forEach((n, i) => this.osc('triangle', NOTE(n), t + i * 0.08, 0.3, 0.14, this.sfxBus));
  }

  dispose(): void {
    window.clearInterval(this.timer);
    void this.ctx?.close();
  }

  _voices: Voice[] = [];
}
