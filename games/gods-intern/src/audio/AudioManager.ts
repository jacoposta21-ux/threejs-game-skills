/**
 * Procedural Web Audio: every sound is synthesized at runtime, so no external
 * or licensed assets are needed. The context is created on the first user
 * gesture. Loops (ambience, rain, fire) are gain-controlled from game state.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private ui!: GainNode;
  private ambientBus!: GainNode;
  private musicBus!: GainNode;
  private wavesGain!: GainNode;
  private musicVolume = 0.35;
  private ambientVolume = 0.7;
  private uiVolume = 0.7;
  private musicTimer = 1;
  private musicStep = 0;
  private night = 0;
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
    this.ui = ctx.createGain();
    this.ui.connect(this.master);
    this.ambientBus = ctx.createGain();
    this.ambientBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.applyVolumes();

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    // Ambience: soft wind (band-passed noise with slow LFO).
    this.ambienceGain = ctx.createGain();
    this.ambienceGain.gain.value = 0.05;
    this.ambienceGain.connect(this.ambientBus);
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
    this.rainGain.connect(this.ambientBus);
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
    this.fireGain.connect(this.ambientBus);
    const roar = this.loopNoise();
    const roarLp = ctx.createBiquadFilter();
    roarLp.type = 'lowpass';
    roarLp.frequency.value = 380;
    roar.connect(roarLp).connect(this.fireGain);

    // v0.4 ocean waves: low-passed noise swelling slowly.
    this.wavesGain = ctx.createGain();
    this.wavesGain.gain.value = 0.05;
    this.wavesGain.connect(this.ambientBus);
    const surf = this.loopNoise();
    const surfLp = ctx.createBiquadFilter();
    surfLp.type = 'lowpass';
    surfLp.frequency.value = 520;
    const swell = ctx.createOscillator();
    swell.frequency.value = 0.11;
    const swellGain = ctx.createGain();
    swellGain.gain.value = 0.035;
    swell.connect(swellGain).connect(this.wavesGain.gain);
    swell.start();
    surf.connect(surfLp).connect(this.wavesGain);
  }

  private loopNoise(): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.loopStart = Math.random();
    src.start(0, Math.random() * 1.5);
    return src;
  }

  setVolumes(master: number, sfx: number, music = this.musicVolume, ambient = this.ambientVolume, ui = this.uiVolume): void {
    this.masterVolume = master;
    this.sfxVolume = sfx;
    this.musicVolume = music;
    this.ambientVolume = ambient;
    this.uiVolume = ui;
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
    this.ui.gain.value = this.uiVolume;
    this.ambientBus.gain.value = this.ambientVolume;
    this.musicBus.gain.value = this.musicVolume;
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

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, slideTo?: number, dest?: AudioNode): void {
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
    osc.connect(g).connect(dest ?? this.sfx);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private noiseBurst(dur: number, gain: number, filter: BiquadFilterType, freq: number, delay = 0, q = 1, sweepTo?: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
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
    this.toneUi(880, 0.06, 'triangle', 0.08);
    this.toneUi(1320, 0.05, 'sine', 0.04, 0.02);
  }

  hover(): void {
    if (!this.throttle('hover', 0.06)) return;
    this.toneUi(1200, 0.035, 'sine', 0.025);
  }

  reject(): void {
    if (!this.throttle('reject', 0.15)) return;
    this.toneUi(220, 0.12, 'square', 0.04, 0, 160);
    this.toneUi(180, 0.14, 'square', 0.03, 0.08, 120);
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
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.toneUi(f, 0.45, 'triangle', 0.09, i * 0.09));
    this.toneUi(1567.98, 0.8, 'sine', 0.05, 0.4);
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

  /** Religion founded: a small heavenly choir. */
  choir(): void {
    if (!this.throttle('choir', 2)) return;
    [261.63, 329.63, 392, 523.25].forEach((f, i) => {
      this.tone(f, 1.6, 'sine', 0.05, i * 0.05);
      this.tone(f * 1.005, 1.6, 'triangle', 0.025, i * 0.05 + 0.02);
    });
  }

  chime(): void {
    if (!this.throttle('chime', 0.6)) return;
    this.tone(1318.5, 0.5, 'sine', 0.05);
    this.tone(1975.5, 0.7, 'sine', 0.03, 0.08);
  }

  mutation(): void {
    if (!this.throttle('mutation', 0.4)) return;
    this.tone(220, 0.6, 'sawtooth', 0.04, 0, 880);
    this.tone(330, 0.5, 'square', 0.025, 0.1, 110);
    this.noiseBurst(0.4, 0.08, 'bandpass', 3000, 0.05, 4);
  }

  godMessage(): void {
    if (!this.throttle('god', 0.8)) return;
    this.tone(196, 0.7, 'sawtooth', 0.04);
    this.tone(293.66, 0.7, 'sawtooth', 0.03, 0.05);
    this.tone(146.83, 1.0, 'sine', 0.08);
  }

  notify(kind: 'good' | 'bad' | 'info' | 'chaos' | 'culture'): void {
    if (!this.throttle(`n-${kind}`, 0.4)) return;
    if (kind === 'good') {
      this.toneUi(784, 0.18, 'triangle', 0.06);
      this.toneUi(1046, 0.25, 'triangle', 0.05, 0.08);
    } else if (kind === 'bad') {
      this.toneUi(311, 0.25, 'square', 0.035);
      this.toneUi(277, 0.3, 'square', 0.03, 0.12);
    } else if (kind === 'culture') {
      [587.33, 739.99, 880].forEach((f, i) => this.toneUi(f, 0.3, 'sine', 0.05, i * 0.09));
    } else if (kind === 'chaos') {
      this.toneUi(600, 0.3, 'sawtooth', 0.03, 0, 1200);
    } else {
      this.toneUi(660, 0.12, 'sine', 0.05);
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
    this.night = night;
    this.music(dt);

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

  // ---------------- v0.4 ----------------

  /** Gentle generative music: a pentatonic music-box over a slow pad, sparser at night. */
  private music(dt: number): void {
    if (!this.ctx || this.musicVolume <= 0.001) return;
    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    const scale = [0, 2, 4, 7, 9, 12, 14, 16];
    const root = this.night > 0.5 ? 220 : 261.63;
    const phrase = [0, 2, 4, 2, 5, 4, 3, 1, 0, 4, 6, 5, 3, 2, 1, 0];
    const deg = scale[phrase[this.musicStep % phrase.length]];
    const f = root * Math.pow(2, deg / 12);
    this.tone(f, 1.4, 'sine', 0.05, 0, undefined, this.musicBus);
    this.tone(f * 2, 0.6, 'triangle', 0.012, 0.02, undefined, this.musicBus);
    if (this.musicStep % 8 === 0) {
      this.tone(root / 2, 5.5, 'sine', 0.035, 0, undefined, this.musicBus);
      this.tone((root / 2) * 1.5, 5.5, 'sine', 0.02, 0, undefined, this.musicBus);
    }
    this.musicStep++;
    this.musicTimer = (this.night > 0.5 ? 1.1 : 0.75) * (this.musicStep % 4 === 3 ? 2 : 1);
  }

  /** Same as tone() but routed to the interface volume bus. */
  private toneUi(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, slideTo?: number): void {
    this.tone(freq, dur, type, gain, delay, slideTo, this.ui);
  }

  uiClick(): void {
    if (!this.throttle('uiclick', 0.04)) return;
    this.tone(880, 0.05, 'sine', 0.05, 0, 1100, this.ui);
  }

  tornado(): void {
    if (!this.throttle('tornado', 1)) return;
    this.noiseBurst(3.5, 0.32, 'bandpass', 220, 0, 2, 1400);
    this.noiseBurst(3, 0.2, 'bandpass', 900, 0.4, 3, 300);
  }

  freeze(): void {
    if (!this.throttle('freeze', 0.5)) return;
    [2093, 2637, 3136, 3951, 4699].forEach((f, i) => this.tone(f, 0.6, 'sine', 0.04, i * 0.05));
    this.noiseBurst(0.5, 0.1, 'highpass', 5000, 0.05, 1);
  }

  gravity(): void {
    if (!this.throttle('gravity', 0.5)) return;
    this.tone(180, 1.4, 'sine', 0.14, 0, 520);
    this.tone(270, 1.2, 'triangle', 0.05, 0.15, 90);
    this.tone(440, 0.9, 'sine', 0.04, 0.4, 880);
  }

  terraform(raise: boolean): void {
    if (!this.throttle('terraform', 0.2)) return;
    this.noiseBurst(0.7, 0.35, 'lowpass', raise ? 160 : 260, 0, 1, raise ? 380 : 90);
    this.tone(raise ? 70 : 110, 0.6, 'sawtooth', 0.06, 0, raise ? 110 : 60);
  }

  timewarp(fast: boolean): void {
    if (!this.throttle('timewarp', 0.5)) return;
    for (let i = 0; i < 6; i++) this.tone(fast ? 500 + i * 120 : 900 - i * 110, 0.18, 'triangle', 0.04, i * (fast ? 0.05 : 0.12));
  }

  possession(start: boolean): void {
    this.tone(start ? 220 : 660, 0.8, 'sine', 0.1, 0, start ? 660 : 220);
    this.tone(start ? 330 : 990, 0.8, 'sine', 0.05, 0.05, start ? 990 : 330);
  }

  meteorIncoming(): void {
    this.tone(1800, 2.8, 'sine', 0.06, 0, 120);
    this.noiseBurst(2.9, 0.18, 'bandpass', 3000, 0, 1.5, 200);
  }

  meteorImpact(): void {
    this.tone(55, 1.6, 'sine', 0.5, 0, 28);
    this.noiseBurst(2.2, 0.7, 'lowpass', 800, 0, 0.8, 60);
    this.noiseBurst(0.3, 0.4, 'highpass', 2000, 0, 1);
  }

  resurrection(): void {
    [261.63, 329.63, 392, 523.25, 659.25].forEach((f, i) => this.tone(f, 2.2, 'sine', 0.06, i * 0.09));
  }

  promotion(): void {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.11, i * 0.11, undefined, this.ui));
    [523.25, 659.25, 783.99].forEach((f) => this.tone(f, 1.6, 'sine', 0.05, 0.5, undefined, this.ui));
  }

  discovery(): void {
    [783.99, 987.77, 1174.66, 1567.98].forEach((f, i) => this.tone(f, 0.3, 'sine', 0.07, i * 0.07, undefined, this.ui));
  }

  memo(): void {
    this.tone(660, 0.12, 'square', 0.03, 0, undefined, this.ui);
    this.tone(990, 0.18, 'square', 0.03, 0.12, undefined, this.ui);
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
  }
}
