/** Synthesized sound effects with Web Audio (no audio files). */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;
  private suspendedByAd = false;
  private lastCling = 0;

  /** Must be called from a user gesture (first pointerdown). */
  unlock(): void {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        this.applyGain();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyGain();
  }

  isMuted(): boolean {
    return this.muted;
  }

  /** Silence while an ad is playing. */
  setAdPause(p: boolean): void {
    this.suspendedByAd = p;
    this.applyGain();
  }

  private applyGain(): void {
    if (this.master && this.ctx) this.master.gain.setValueAtTime(this.muted || this.suspendedByAd ? 0 : 0.5, this.ctx.currentTime);
  }

  private ready(): AudioContext | null {
    if (!this.ctx || !this.master || this.muted || this.suspendedByAd) return null;
    return this.ctx;
  }

  private tone(type: OscillatorType, f0: number, f1: number, t0: number, dur: number, vol: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master!);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  private noise(t0: number, dur: number, vol: number, freq: number): void {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master!);
    src.start(t0);
  }

  /** Merge "plop": pitch rises with the level. */
  plop(level: number): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const base = 260 * Math.pow(2, (level - 1) / 5);
    this.tone('sine', base, base * 2.2, t, 0.16, 0.5);
    this.tone('triangle', base * 1.5, base * 3, t + 0.05, 0.12, 0.18);
    this.noise(t, 0.22, 0.25, 1800);
  }

  /** Coin "cling" (throttled). */
  cling(vol = 0.18): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = performance.now();
    if (now - this.lastCling < 90) return;
    this.lastCling = now;
    const t = ctx.currentTime;
    this.tone('triangle', 1568, 1568, t, 0.12, vol);
    this.tone('triangle', 2093, 2093, t + 0.06, 0.2, vol * 0.9);
  }

  /** New capybara jingle. */
  jingle(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((f, i) => {
      this.tone('triangle', f, f, t + i * 0.09, 0.35, 0.28);
      this.tone('sine', f * 2, f * 2, t + i * 0.09, 0.2, 0.08);
    });
  }

  click(): void {
    const ctx = this.ready();
    if (!ctx) return;
    this.tone('sine', 700, 500, ctx.currentTime, 0.06, 0.2);
  }

  deny(): void {
    const ctx = this.ready();
    if (!ctx) return;
    this.tone('square', 180, 140, ctx.currentTime, 0.12, 0.08);
  }

  sparkle(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 6; i++) this.tone('sine', 1800 + i * 260, 2400 + i * 300, t + i * 0.05, 0.12, 0.1);
  }

  pop(): void {
    const ctx = this.ready();
    if (!ctx) return;
    this.tone('sine', 420, 880, ctx.currentTime, 0.09, 0.25);
  }
}

export const sfx = new Sfx();
