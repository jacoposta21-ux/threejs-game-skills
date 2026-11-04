/**
 * Fully synthesized audio: atmospheric generative music + event SFX through a shared reverb.
 * No audio files are downloaded, which keeps the initial load tiny.
 */
type Theme = 'menu' | 'station' | 'forest' | 'caverns' | 'ocean' | 'heart' | 'boss' | 'ending' | 'ice' | 'foundry' | 'ruins' | 'boss2' | 'keepers' | 'abyss' | 'boss3' | 'seed' | 'boss4' | 'finale';

interface ThemeDef {
  root: number; // midi
  scale: number[];
  pad: number[]; // chord intervals
  cutoff: number;
  noteEvery: [number, number];
  wind: number;
  pulse?: boolean;
  bellType: OscillatorType;
}

const THEMES: Record<Theme, ThemeDef> = {
  menu: { root: 45, scale: [0, 3, 7, 10, 12, 15, 19], pad: [0, 7, 15], cutoff: 900, noteEvery: [1.6, 3.2], wind: 0.05, bellType: 'sine' },
  station: { root: 41, scale: [0, 1, 5, 7, 8, 12, 13], pad: [0, 7, 13], cutoff: 650, noteEvery: [2.4, 4.5], wind: 0.07, bellType: 'triangle' },
  forest: { root: 50, scale: [0, 2, 4, 7, 9, 12, 14, 16], pad: [0, 4, 7, 14], cutoff: 1300, noteEvery: [0.9, 2.0], wind: 0.04, bellType: 'sine' },
  caverns: { root: 38, scale: [0, 2, 3, 7, 8, 12], pad: [0, 7, 15], cutoff: 520, noteEvery: [3, 6], wind: 0.09, bellType: 'sine' },
  ocean: { root: 43, scale: [0, 2, 5, 7, 9, 12, 14], pad: [0, 5, 9, 14], cutoff: 800, noteEvery: [1.4, 3], wind: 0.08, bellType: 'sine' },
  heart: { root: 40, scale: [0, 1, 4, 5, 7, 8, 11, 12], pad: [0, 1, 7], cutoff: 600, noteEvery: [2, 4], wind: 0.06, bellType: 'triangle' },
  boss: { root: 40, scale: [0, 1, 3, 7, 8, 12], pad: [0, 7, 12], cutoff: 1100, noteEvery: [0.5, 1.0], wind: 0.03, pulse: true, bellType: 'sawtooth' },
  ice: { root: 52, scale: [0, 2, 3, 7, 10, 12, 14, 19], pad: [0, 7, 14], cutoff: 1500, noteEvery: [1.2, 2.6], wind: 0.09, bellType: 'sine' },
  foundry: { root: 36, scale: [0, 1, 3, 5, 6, 10, 12], pad: [0, 6, 12], cutoff: 700, noteEvery: [1.8, 3.4], wind: 0.06, pulse: true, bellType: 'triangle' },
  ruins: { root: 47, scale: [0, 2, 4, 7, 9, 12, 14], pad: [0, 7, 16], cutoff: 1100, noteEvery: [1.1, 2.4], wind: 0.05, bellType: 'triangle' },
  boss2: { root: 38, scale: [0, 1, 5, 6, 7, 12], pad: [0, 6, 13], cutoff: 1400, noteEvery: [0.4, 0.8], wind: 0.03, pulse: true, bellType: 'square' },
  keepers: { root: 45, scale: [0, 2, 4, 5, 7, 9, 11, 12, 16], pad: [0, 4, 7, 11], cutoff: 1200, noteEvery: [1.0, 2.2], wind: 0.05, bellType: 'triangle' },
  abyss: { root: 35, scale: [0, 1, 3, 6, 7, 10, 12], pad: [0, 6, 13], cutoff: 480, noteEvery: [2.5, 5], wind: 0.1, bellType: 'sine' },
  boss3: { root: 37, scale: [0, 1, 3, 6, 7, 8, 12], pad: [0, 1, 6], cutoff: 900, noteEvery: [0.45, 0.9], wind: 0.06, pulse: true, bellType: 'sine' },
  seed: { root: 50, scale: [0, 2, 4, 7, 9, 11, 12, 14, 16, 19], pad: [0, 4, 7, 11, 14], cutoff: 1400, noteEvery: [0.9, 1.9], wind: 0.04, bellType: 'sine' },
  boss4: { root: 38, scale: [0, 2, 3, 7, 8, 10, 12, 14], pad: [0, 7, 15], cutoff: 1300, noteEvery: [0.35, 0.7], wind: 0.04, pulse: true, bellType: 'triangle' },
  finale: { root: 52, scale: [0, 4, 7, 11, 12, 14, 16, 19, 21, 24], pad: [0, 4, 7, 11, 14], cutoff: 2200, noteEvery: [0.5, 1.1], wind: 0.01, bellType: 'sine' },
  ending: { root: 48, scale: [0, 2, 4, 7, 9, 11, 12, 16, 19], pad: [0, 4, 7, 11], cutoff: 1600, noteEvery: [0.8, 1.6], wind: 0.02, bellType: 'sine' },
};

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  music!: GainNode;
  sfx!: GainNode;
  reverb!: ConvolverNode;
  reverbSend!: GainNode;
  noise!: AudioBuffer;
  musicVol = 0.7;
  sfxVol = 0.85;
  muted = false;
  private theme: Theme | null = null;
  private themeNodes: AudioNode[] = [];
  private themeGain: GainNode | null = null;
  private nextNote = 0;
  private nextPulse = 0;
  private pulseStep = 0;
  private timer: number | null = null;
  private chargeNode: { osc: OscillatorNode; gain: GainNode } | null = null;
  private lastPlayed: Record<string, number> = {};
  private pendingTheme: Theme | null = null;

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(comp).connect(ctx.destination);
    this.music = ctx.createGain();
    this.music.gain.value = this.musicVol * 0.55;
    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.sfxVol;
    this.music.connect(this.master);
    this.sfx.connect(this.master);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(3.2, 2.4);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.55;
    this.reverbSend.connect(this.reverb).connect(this.master);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.timer = window.setInterval(() => this.tick(), 90);
    if (this.pendingTheme) {
      const t = this.pendingTheme;
      this.pendingTheme = null;
      this.playTheme(t);
    }
  }

  private impulse(seconds: number, decay: number) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  setVolumes(music: number, sfx: number) {
    this.musicVol = music;
    this.sfxVol = sfx;
    if (!this.ctx) return;
    this.music.gain.setTargetAtTime(music * 0.55, this.ctx.currentTime, 0.1);
    this.sfx.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.1);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.05);
  }

  /** Called when the tab is hidden or an ad plays. */
  suspend(s: boolean) {
    if (!this.ctx) return;
    if (s) this.ctx.suspend();
    else this.ctx.resume();
  }

  // ------------------------------------------------------------------ music
  playTheme(theme: Theme) {
    if (!this.ctx) {
      this.pendingTheme = theme;
      return;
    }
    if (this.theme === theme) return;
    this.theme = theme;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    // fade out previous
    if (this.themeGain) {
      const g = this.themeGain;
      const nodes = this.themeNodes;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(0, now + 2.5);
      setTimeout(() => nodes.forEach((n) => { try { (n as any).stop?.(); n.disconnect(); } catch { /* */ } }), 2800);
    }
    const def = THEMES[theme];
    const tg = ctx.createGain();
    tg.gain.value = 0;
    tg.gain.linearRampToValueAtTime(1, now + 3);
    tg.connect(this.music);
    const send = ctx.createGain();
    send.gain.value = 0.6;
    tg.connect(send).connect(this.reverbSend);
    this.themeGain = tg;
    this.themeNodes = [];
    // pad: detuned saws -> lowpass with slow LFO
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = def.cutoff;
    lp.Q.value = 3;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoG = ctx.createGain();
    lfoG.gain.value = def.cutoff * 0.45;
    lfo.connect(lfoG).connect(lp.frequency);
    lfo.start();
    const padG = ctx.createGain();
    padG.gain.value = 0.05;
    lp.connect(padG).connect(tg);
    this.themeNodes.push(lfo, lp, padG, tg, send);
    for (const iv of def.pad) {
      for (const det of [-7, 6]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(def.root + iv);
        o.detune.value = det;
        o.connect(lp);
        o.start();
        this.themeNodes.push(o);
      }
    }
    // sub drone
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = mtof(def.root - 12);
    const subG = ctx.createGain();
    subG.gain.value = 0.08;
    sub.connect(subG).connect(tg);
    sub.start();
    this.themeNodes.push(sub, subG);
    // wind bed: filtered noise
    const wn = ctx.createBufferSource();
    wn.buffer = this.noise;
    wn.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 420;
    bp.Q.value = 0.7;
    const wl = ctx.createOscillator();
    wl.frequency.value = 0.09;
    const wlg = ctx.createGain();
    wlg.gain.value = 260;
    wl.connect(wlg).connect(bp.frequency);
    wl.start();
    const wg = ctx.createGain();
    wg.gain.value = def.wind;
    wn.connect(bp).connect(wg).connect(tg);
    wn.start();
    this.themeNodes.push(wn, bp, wl, wlg, wg);
    this.nextNote = now + 1.5;
    this.nextPulse = now + 0.5;
  }

  stopMusic() {
    if (!this.ctx || !this.themeGain) return;
    const now = this.ctx.currentTime;
    this.themeGain.gain.cancelScheduledValues(now);
    this.themeGain.gain.setValueAtTime(this.themeGain.gain.value, now);
    this.themeGain.gain.linearRampToValueAtTime(0, now + 1.5);
    this.theme = null;
  }

  private tick() {
    if (!this.ctx || !this.theme || this.ctx.state !== 'running') return;
    const def = THEMES[this.theme];
    const now = this.ctx.currentTime;
    while (this.nextNote < now + 0.25) {
      const deg = def.scale[Math.floor(Math.random() * def.scale.length)];
      const oct = Math.random() < 0.3 ? 24 : 12;
      this.bell(mtof(def.root + deg + oct), this.nextNote, def.bellType, this.theme === 'boss' ? 0.035 : 0.06);
      if (Math.random() < 0.25) this.bell(mtof(def.root + deg + oct + 7), this.nextNote + 0.18, def.bellType, 0.03);
      this.nextNote += def.noteEvery[0] + Math.random() * (def.noteEvery[1] - def.noteEvery[0]);
    }
    if (def.pulse) {
      while (this.nextPulse < now + 0.25) {
        const step = this.pulseStep++ % 8;
        if (step === 0 || step === 3 || step === 6) this.kick(this.nextPulse);
        if (step % 2 === 1) this.tickNoise(this.nextPulse, 0.03);
        this.bass(mtof(def.root - 12 + (step >= 4 ? 1 : 0)), this.nextPulse);
        this.nextPulse += 0.21;
      }
    }
  }

  private bell(freq: number, t: number, type: OscillatorType, vol: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2400;
    o.connect(f).connect(g);
    g.connect(this.themeGain!);
    o.start(t);
    o.stop(t + 3);
  }

  private kick(t: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.32, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(this.themeGain!);
    o.start(t);
    o.stop(t + 0.32);
  }

  private bass(freq: number, t: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(600, t);
    f.frequency.exponentialRampToValueAtTime(120, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.09, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(f).connect(g).connect(this.themeGain!);
    o.start(t);
    o.stop(t + 0.22);
  }

  private tickNoise(t: number, vol: number) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 6000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    s.connect(f).connect(g).connect(this.themeGain!);
    s.start(t, Math.random());
    s.stop(t + 0.06);
  }

  // ------------------------------------------------------------------ sfx helpers
  private out(reverb = 0.25, pan = 0) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    let tail: AudioNode = g;
    if (pan !== 0 && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p);
      tail = p;
    }
    tail.connect(this.sfx);
    if (reverb > 0) {
      const r = ctx.createGain();
      r.gain.value = reverb;
      tail.connect(r).connect(this.reverbSend);
    }
    return g;
  }

  private tone(o: { type?: OscillatorType; f0: number; f1?: number; dur: number; vol: number; attack?: number; reverb?: number; pan?: number; delay?: number; filter?: number }) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (o.delay || 0);
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t + o.dur);
    const g = this.out(o.reverb ?? 0.25, o.pan);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol, t + (o.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    let src: AudioNode = osc;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.filter;
      osc.connect(f);
      src = f;
    }
    src.connect(g);
    osc.start(t);
    osc.stop(t + o.dur + 0.05);
  }

  private burst(o: { dur: number; vol: number; type?: BiquadFilterType; f0: number; f1?: number; q?: number; reverb?: number; pan?: number; delay?: number; attack?: number }) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (o.delay || 0);
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = o.type || 'bandpass';
    f.frequency.setValueAtTime(o.f0, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
    f.Q.value = o.q ?? 1;
    const g = this.out(o.reverb ?? 0.2, o.pan);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol, t + (o.attack || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    s.connect(f).connect(g);
    s.start(t, Math.random() * 1.5);
    s.stop(t + o.dur + 0.05);
  }

  play(name: string, pan = 0) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = performance.now();
    const minGap: Record<string, number> = { step: 60, hit: 30, spark: 120, enemyHit: 40, bubble: 80 };
    if (now - (this.lastPlayed[name] || 0) < (minGap[name] ?? 25)) return;
    this.lastPlayed[name] = now;
    const r = Math.random();
    switch (name) {
      case 'step':
        this.burst({ dur: 0.07, vol: 0.06, f0: 900 + r * 500, q: 1.2, reverb: 0.1, pan });
        break;
      case 'jump':
        this.tone({ type: 'triangle', f0: 260, f1: 520, dur: 0.14, vol: 0.09 });
        this.burst({ dur: 0.1, vol: 0.05, f0: 1500, f1: 3000, q: 0.8 });
        break;
      case 'djump':
        this.tone({ type: 'sine', f0: 600, f1: 1300, dur: 0.2, vol: 0.09, reverb: 0.5 });
        this.tone({ type: 'sine', f0: 900, f1: 1800, dur: 0.16, vol: 0.05, delay: 0.04, reverb: 0.5 });
        break;
      case 'land':
        this.burst({ dur: 0.12, vol: 0.12, type: 'lowpass', f0: 700, q: 0.7, reverb: 0.15 });
        this.tone({ f0: 90, f1: 50, dur: 0.1, vol: 0.12 });
        break;
      case 'shoot':
        this.tone({ type: 'square', f0: 1200, f1: 300, dur: 0.12, vol: 0.06, filter: 3000, reverb: 0.3 });
        this.tone({ type: 'sine', f0: 700, f1: 180, dur: 0.16, vol: 0.1, reverb: 0.3 });
        break;
      case 'chargeShot':
        this.tone({ type: 'sawtooth', f0: 500, f1: 60, dur: 0.45, vol: 0.12, filter: 2200, reverb: 0.6 });
        this.burst({ dur: 0.4, vol: 0.14, type: 'lowpass', f0: 3000, f1: 200, reverb: 0.5 });
        break;
      case 'chargeReady':
        this.tone({ type: 'sine', f0: 1400, dur: 0.18, vol: 0.06, reverb: 0.5 });
        this.tone({ type: 'sine', f0: 2100, dur: 0.18, vol: 0.04, delay: 0.05, reverb: 0.5 });
        break;
      case 'hit':
        this.burst({ dur: 0.08, vol: 0.08, f0: 2500, q: 2, pan });
        break;
      case 'enemyHit':
        this.tone({ type: 'square', f0: 220, f1: 90, dur: 0.1, vol: 0.07, filter: 1500, pan });
        this.burst({ dur: 0.09, vol: 0.1, f0: 1200, q: 1.5, pan });
        break;
      case 'enemyDie':
        this.tone({ type: 'sawtooth', f0: 300, f1: 40, dur: 0.5, vol: 0.1, filter: 1200, reverb: 0.5, pan });
        this.burst({ dur: 0.5, vol: 0.12, type: 'lowpass', f0: 2000, f1: 150, reverb: 0.5, pan });
        break;
      case 'hurt':
        this.tone({ type: 'square', f0: 400, f1: 110, dur: 0.25, vol: 0.09, filter: 1600 });
        this.burst({ dur: 0.2, vol: 0.12, f0: 800, q: 0.6 });
        break;
      case 'death':
        this.tone({ type: 'sine', f0: 440, f1: 55, dur: 1.6, vol: 0.14, reverb: 0.8 });
        this.tone({ type: 'triangle', f0: 330, f1: 41, dur: 1.8, vol: 0.08, reverb: 0.8, delay: 0.1 });
        break;
      case 'pip':
        this.tone({ type: 'sine', f0: 2200 + r * 600, f1: 3200, dur: 0.07, vol: 0.05, reverb: 0.4, pan });
        this.tone({ type: 'sine', f0: 2900 + r * 300, f1: 2400, dur: 0.06, vol: 0.04, delay: 0.08, reverb: 0.4, pan });
        break;
      case 'pipCommand':
        [0, 0.07, 0.14].forEach((d, i) => this.tone({ type: 'sine', f0: 1800 + i * 500, dur: 0.08, vol: 0.05, delay: d, reverb: 0.5 }));
        break;
      case 'mechanism':
        this.tone({ type: 'sine', f0: 220, dur: 1.4, vol: 0.12, attack: 0.3, reverb: 0.8 });
        this.tone({ type: 'sine', f0: 330, dur: 1.4, vol: 0.08, attack: 0.4, reverb: 0.8, delay: 0.15 });
        this.tone({ type: 'sine', f0: 495, dur: 1.6, vol: 0.06, attack: 0.5, reverb: 0.8, delay: 0.3 });
        break;
      case 'door':
        this.burst({ dur: 1.1, vol: 0.14, type: 'lowpass', f0: 400, f1: 120, q: 2, reverb: 0.5 });
        this.tone({ type: 'sawtooth', f0: 55, f1: 45, dur: 1.0, vol: 0.06, filter: 300 });
        break;
      case 'plate':
        this.tone({ type: 'square', f0: 180, f1: 120, dur: 0.08, vol: 0.06, filter: 900 });
        this.burst({ dur: 0.06, vol: 0.08, f0: 1800, q: 3 });
        break;
      case 'checkpoint':
        [0, 4, 7, 12].forEach((s, i) => this.tone({ type: 'sine', f0: mtof(64 + s), dur: 1.2, vol: 0.06, delay: i * 0.09, reverb: 0.8 }));
        break;
      case 'pickup':
        this.tone({ type: 'sine', f0: 880, f1: 1760, dur: 0.25, vol: 0.07, reverb: 0.6 });
        break;
      case 'lore':
        [0, 3, 7].forEach((s, i) => this.tone({ type: 'triangle', f0: mtof(69 + s), dur: 0.9, vol: 0.05, delay: i * 0.12, reverb: 0.8 }));
        break;
      case 'splash':
        this.burst({ dur: 0.45, vol: 0.16, type: 'lowpass', f0: 2500, f1: 300, reverb: 0.4 });
        break;
      case 'bubble':
        this.tone({ type: 'sine', f0: 500 + r * 500, f1: 1400, dur: 0.06, vol: 0.03, pan });
        break;
      case 'bounce':
        this.tone({ type: 'sine', f0: 160, f1: 620, dur: 0.3, vol: 0.14, reverb: 0.4 });
        this.tone({ type: 'triangle', f0: 320, f1: 900, dur: 0.22, vol: 0.05, reverb: 0.4 });
        break;
      case 'spark':
        this.burst({ dur: 0.25, vol: 0.07, type: 'highpass', f0: 3000, q: 0.5, pan });
        this.tone({ type: 'sawtooth', f0: 120, dur: 0.22, vol: 0.04, filter: 2000, pan });
        break;
      case 'spore':
        this.burst({ dur: 0.9, vol: 0.06, type: 'bandpass', f0: 1800, f1: 600, q: 0.6, reverb: 0.4, pan, attack: 0.15 });
        break;
      case 'rock':
        this.burst({ dur: 0.5, vol: 0.18, type: 'lowpass', f0: 900, f1: 80, reverb: 0.5, pan });
        this.tone({ f0: 70, f1: 35, dur: 0.4, vol: 0.15, pan });
        break;
      case 'crack':
        this.burst({ dur: 0.15, vol: 0.12, f0: 2200, q: 2, reverb: 0.4, pan });
        break;
      case 'burrow':
        this.burst({ dur: 0.7, vol: 0.14, type: 'lowpass', f0: 300, f1: 90, q: 1, reverb: 0.3, pan, attack: 0.08 });
        break;
      case 'crawler':
        [0, 0.05, 0.1].forEach((d) => this.burst({ dur: 0.03, vol: 0.06, f0: 3500, q: 6, delay: d, pan }));
        break;
      case 'stalker':
        this.burst({ dur: 1.4, vol: 0.06, type: 'bandpass', f0: 600, f1: 1400, q: 8, reverb: 0.9, pan, attack: 0.4 });
        this.tone({ type: 'sine', f0: 110, f1: 98, dur: 1.4, vol: 0.05, attack: 0.5, reverb: 0.9, pan });
        break;
      case 'roar':
        this.tone({ type: 'sawtooth', f0: 90, f1: 55, dur: 1.4, vol: 0.18, filter: 700, reverb: 0.7, attack: 0.1 });
        this.burst({ dur: 1.3, vol: 0.16, type: 'bandpass', f0: 500, f1: 200, q: 1.2, reverb: 0.7, attack: 0.1 });
        break;
      case 'slam':
        this.tone({ f0: 80, f1: 28, dur: 0.7, vol: 0.3, reverb: 0.6 });
        this.burst({ dur: 0.8, vol: 0.22, type: 'lowpass', f0: 1200, f1: 60, reverb: 0.6 });
        break;
      case 'warn':
        // short rising two-note alarm: an attack is coming
        this.tone({ type: 'triangle', f0: 520, f1: 780, dur: 0.12, vol: 0.09, reverb: 0.3, pan });
        this.tone({ type: 'triangle', f0: 780, f1: 1040, dur: 0.12, vol: 0.08, delay: 0.13, reverb: 0.3, pan });
        break;
      case 'core':
        this.tone({ type: 'sine', f0: 1600, f1: 400, dur: 0.3, vol: 0.12, reverb: 0.6 });
        break;
      case 'ui':
        this.tone({ type: 'sine', f0: 900, dur: 0.07, vol: 0.05, reverb: 0.3 });
        break;
      case 'uiSelect':
        this.tone({ type: 'sine', f0: 660, f1: 1320, dur: 0.18, vol: 0.07, reverb: 0.5 });
        break;
      case 'reveal':
        [0, 5, 9, 14].forEach((s, i) => this.tone({ type: 'sine', f0: mtof(72 + s), dur: 0.7, vol: 0.035, delay: i * 0.06, reverb: 0.8 }));
        break;
      case 'heartbeat':
        this.tone({ f0: 60, f1: 40, dur: 0.18, vol: 0.2 });
        this.tone({ f0: 55, f1: 38, dur: 0.18, vol: 0.14, delay: 0.24 });
        break;
      case 'splashOut':
        this.burst({ dur: 0.25, vol: 0.08, type: 'lowpass', f0: 1800, f1: 400 });
        break;
      case 'crumble':
        this.burst({ dur: 0.6, vol: 0.12, type: 'lowpass', f0: 1500, f1: 100, reverb: 0.4, pan });
        break;
      case 'wake':
        this.tone({ type: 'sine', f0: 300, f1: 900, dur: 0.6, vol: 0.06, reverb: 0.8 });
        break;
    }
  }

  startCharge() {
    if (!this.ctx || this.chargeNode) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(440, ctx.currentTime + 0.7);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    const gain = this.out(0.3);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.035, ctx.currentTime + 0.3);
    osc.connect(f).connect(gain);
    osc.start();
    this.chargeNode = { osc, gain };
  }

  stopCharge() {
    if (!this.ctx || !this.chargeNode) return;
    const { osc, gain } = this.chargeNode;
    gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.03);
    osc.stop(this.ctx.currentTime + 0.15);
    this.chargeNode = null;
  }
}

export const Sound = new AudioEngine();
export type { Theme };
