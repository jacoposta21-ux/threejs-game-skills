/**
 * Procedural Web Audio: every sound is synthesized at runtime, so no external
 * or licensed assets are needed. The context is created on the first user
 * gesture. Loops (ambience, rain, fire) are gain-controlled from game state.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private ambienceGain!: GainNode;
  private rainGain!: GainNode;
  private fireGain!: GainNode;
  private noise!: AudioBuffer;
  private masterVolume = 0.8;
  private sfxVolume = 0.8;
  private birdTimer = 2;
  private crackleTimer = 0;
  private fireLevel = 0;
  private muted = false;
  private lastPlay = new Map<string, number>();

  get ready(): boolean {
    return this.ctx !== null;
  }

  /** Call from a user gesture. Safe to call repeatedly. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
    } catch {
      this.ctx = null;
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.applyVolumes();

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    // Ambience: soft wind (band-passed noise with slow LFO).
    this.ambienceGain = ctx.createGain();
    this.ambienceGain.gain.value = 0.05;
    this.ambienceGain.connect(this.master);
    const wind = this.loopNoise();
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 420;
    windFilter.Q.value = 0.6;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain).connect(windFilter.frequency);
    lfo.start();
    wind.connect(windFilter).connect(this.ambienceGain);

    // Rain loop.
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    this.rainGain.connect(this.master);
    const rain = this.loopNoise();
    const rainHp = ctx.createBiquadFilter();
    rainHp.type = 'highpass';
    rainHp.frequency.value = 900;
    const rainLp = ctx.createBiquadFilter();
    rainLp.type = 'lowpass';
    rainLp.frequency.value = 6500;
    rain.connect(rainHp).connect(rainLp).connect(this.rainGain);

    // Fire roar loop.
    this.fireGain = ctx.createGain();
    this.fireGain.gain.value = 0;
    this.fireGain.connect(this.master);
    const roar = this.loopNoise();
    const roarLp = ctx.createBiquadFilter();
    roarLp.type = 'lowpass';
    roarLp.frequency.value = 380;
    roar.connect(roarLp).connect(this.fireGain);
  }

  private loopNoise(): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.loopStart = Math.random();
    src.start(0, Math.random() * 1.5);
    return src;
  }

  setVolumes(master: number, sfx: number): void {
    this.masterVolume = master;
    this.sfxVolume = sfx;
    this.applyVolumes();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    this.master.gain.value = this.muted ? 0 : this.masterVolume;
    this.sfx.gain.value = this.sfxVolume;
  }

  suspend(paused: boolean): void {
    if (!this.ctx) return;
    if (paused) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  private throttle(key: string, seconds: number): boolean {
    if (!this.ctx) return false;
    const now = this.ctx.currentTime;
    if (now - (this.lastPlay.get(key) ?? -99) < seconds) return false;
    this.lastPlay.set(key, now);
    return true;
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, slideTo?: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.sfx);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private noiseBurst(dur: number, gain: number, filter: BiquadFilterType, freq: number, delay = 0, q = 1): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  click(): void {
    if (!this.throttle('click', 0.04)) return;
    this.tone(880, 0.06, 'triangle', 0.08);
    this.tone(1320, 0.05, 'sine', 0.04, 0.02);
  }

  hover(): void {
    if (!this.throttle('hover', 0.06)) return;
    this.tone(1200, 0.035, 'sine', 0.025);
  }

  reject(): void {
    if (!this.throttle('reject', 0.15)) return;
    this.tone(220, 0.12, 'square', 0.04, 0, 160);
    this.tone(180, 0.14, 'square', 0.03, 0.08, 120);
  }

  thunder(): void {
    if (!this.ctx) return;
    this.noiseBurst(0.25, 0.9, 'highpass', 1800);
    this.noiseBurst(2.6, 0.75, 'lowpass', 240, 0.08, 0.8);
    this.noiseBurst(1.8, 0.4, 'lowpass', 120, 0.35, 0.7);
    this.tone(55, 1.6, 'sine', 0.3, 0.05, 32);
  }

  rainStart(): void {
    if (!this.throttle('rainStart', 0.5)) return;
    this.noiseBurst(1.4, 0.18, 'bandpass', 2400, 0, 0.5);
    [523, 659, 784].forEach((f, i) => this.tone(f, 0.35, 'sine', 0.05, i * 0.07));
  }

  sprout(): void {
    if (!this.throttle('sprout', 0.08)) return;
    this.tone(440, 0.25, 'sine', 0.07, 0, 880);
    this.tone(660, 0.3, 'triangle', 0.04, 0.08, 1320);
    this.noiseBurst(0.2, 0.05, 'highpass', 5000, 0.02);
  }

  ignite(): void {
    if (!this.throttle('ignite', 0.12)) return;
    this.noiseBurst(0.7, 0.35, 'bandpass', 700, 0, 0.7);
    this.tone(90, 0.5, 'sawtooth', 0.05, 0, 60);
  }

  extinguish(): void {
    if (!this.throttle('hiss', 0.4)) return;
    this.noiseBurst(1.2, 0.18, 'highpass', 3500);
  }

  missionComplete(): void {
    if (!this.ctx) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.45, 'triangle', 0.09, i * 0.09));
    this.tone(1567.98, 0.8, 'sine', 0.05, 0.4);
  }

  prayer(): void {
    if (!this.throttle('prayer', 1)) return;
    this.tone(392, 0.6, 'sine', 0.07);
    this.tone(587.33, 0.7, 'sine', 0.05, 0.12);
    this.tone(783.99, 0.9, 'sine', 0.04, 0.24);
  }

  fail(): void {
    if (!this.throttle('fail', 1)) return;
    this.tone(330, 0.4, 'triangle', 0.08, 0, 250);
    this.tone(247, 0.6, 'triangle', 0.08, 0.25, 180);
  }

  celebrate(): void {
    if (!this.throttle('celebrate', 1.5)) return;
    for (let i = 0; i < 6; i++) this.tone(900 + Math.random() * 900, 0.12, 'square', 0.02, i * 0.07);
  }

  godMessage(): void {
    if (!this.throttle('god', 0.8)) return;
    this.tone(196, 0.7, 'sawtooth', 0.04);
    this.tone(293.66, 0.7, 'sawtooth', 0.03, 0.05);
    this.tone(146.83, 1.0, 'sine', 0.08);
  }

  notify(kind: 'good' | 'bad' | 'info' | 'chaos'): void {
    if (!this.throttle(`n-${kind}`, 0.4)) return;
    if (kind === 'good') {
      this.tone(784, 0.18, 'triangle', 0.06);
      this.tone(1046, 0.25, 'triangle', 0.05, 0.08);
    } else if (kind === 'bad') {
      this.tone(311, 0.25, 'square', 0.035);
      this.tone(277, 0.3, 'square', 0.03, 0.12);
    } else if (kind === 'chaos') {
      this.tone(600, 0.3, 'sawtooth', 0.03, 0, 1200);
    } else {
      this.tone(660, 0.12, 'sine', 0.05);
    }
  }

  /** Per-frame loop levels derived from game state. */
  update(dt: number, rainClouds: number, fires: number, night: number, paused: boolean): void {
    if (!this.ctx || paused) return;
    const t = this.ctx.currentTime;
    this.rainGain.gain.setTargetAtTime(Math.min(0.32, rainClouds * 0.16), t, 0.4);
    this.fireLevel = Math.min(1, fires / 12);
    this.fireGain.gain.setTargetAtTime(this.fireLevel * 0.35, t, 0.5);
    this.ambienceGain.gain.setTargetAtTime(0.04 + night * 0.02, t, 1);

    // Fire crackles.
    if (fires > 0) {
      this.crackleTimer -= dt;
      if (this.crackleTimer <= 0) {
        this.crackleTimer = 0.04 + Math.random() * (0.25 / (0.3 + this.fireLevel));
        this.noiseBurst(0.03 + Math.random() * 0.04, 0.12 + this.fireLevel * 0.2, 'bandpass', 1500 + Math.random() * 2500, 0, 3);
      }
    }
    // Birdsong by day, crickets at night.
    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      this.birdTimer = 2.5 + Math.random() * 5;
      if (night < 0.4) {
        const base = 2200 + Math.random() * 1500;
        const notes = 2 + Math.floor(Math.random() * 4);
        for (let i = 0; i < notes; i++) this.tone(base * (1 + Math.random() * 0.3), 0.09, 'sine', 0.018, i * 0.11, base * 1.4);
      } else {
        for (let i = 0; i < 5; i++) this.tone(4400, 0.03, 'square', 0.006, i * 0.05);
      }
    }
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
  }
}
