/** Web Audio synthesised sound: engine, horn, thuds, bell, jingle, coins, ambience. No audio files. */
export class AudioFx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private engineOsc!: OscillatorNode;
  private engineOsc2!: OscillatorNode;
  private engineGain!: GainNode;
  private engineFilter!: BiquadFilterNode;
  private noiseBuf!: AudioBuffer;
  private ambGain!: GainNode;
  muted = false;

  /** Must be called from a user gesture. Safe to call repeatedly. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.7;
    this.master.connect(ctx.destination);
    // noise buffer
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // engine: two detuned saws through a lowpass, putt-putt via LFO on gain
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 600;
    this.engineFilter.Q.value = 3;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc.connect(this.engineFilter);
    const g2 = ctx.createGain();
    g2.gain.value = 0.35;
    this.engineOsc2.connect(g2).connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain).connect(this.master);
    this.engineOsc.start();
    this.engineOsc2.start();
    // ambience: soft filtered noise (city murmur / sea)
    const amb = ctx.createBufferSource();
    amb.buffer = this.noiseBuf;
    amb.loop = true;
    const af = ctx.createBiquadFilter();
    af.type = 'lowpass';
    af.frequency.value = 380;
    this.ambGain = ctx.createGain();
    this.ambGain.gain.value = 0;
    amb.connect(af).connect(this.ambGain).connect(this.master);
    amb.start();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.05);
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** speed 0..1, throttle 0..1, active false silences the engine */
  engine(speed01: number, throttle: number, active: boolean) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 48 + speed01 * 120 + throttle * 18;
    this.engineOsc.frequency.setTargetAtTime(f, t, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(f * 0.501, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(380 + speed01 * 900 + throttle * 400, t, 0.1);
    this.engineGain.gain.setTargetAtTime(active ? 0.05 + throttle * 0.05 + speed01 * 0.03 : 0, t, 0.1);
  }

  ambience(level: number) {
    if (!this.ctx) return;
    this.ambGain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.5);
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, when = 0, slideTo?: number) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dur: number, vol: number, freq: number, q = 1, when = 0, type: BiquadFilterType = 'bandpass') {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  horn() {
    this.tone(392, 0.32, 'square', 0.09);
    this.tone(494, 0.32, 'square', 0.07);
  }
  carHorn() {
    this.tone(330, 0.25, 'sawtooth', 0.05);
    this.tone(415, 0.25, 'sawtooth', 0.04);
  }
  thud(strength = 1) {
    this.tone(110, 0.16, 'sine', 0.25 * strength, 0, 50);
    this.noise(0.12, 0.25 * strength, 400, 0.8);
  }
  crash() {
    this.noise(0.35, 0.5, 1200, 0.6);
    this.tone(90, 0.3, 'triangle', 0.3, 0, 40);
  }
  bump() {
    this.tone(70, 0.12, 'sine', 0.2, 0, 40);
  }
  bell() {
    const ns = [1318, 1760, 2637];
    ns.forEach((f, i) => this.tone(f, 1.2 - i * 0.2, 'sine', 0.12 / (i + 1)));
    this.tone(1568, 1.0, 'sine', 0.08, 0.12);
  }
  coin(i = 0) {
    this.tone(988 + i * 60, 0.09, 'square', 0.04, i * 0.05);
    this.tone(1319 + i * 60, 0.16, 'square', 0.04, i * 0.05 + 0.06);
  }
  whoosh() {
    this.noise(0.5, 0.25, 700, 0.7, 0, 'bandpass');
  }
  whoa() {
    this.tone(520, 0.35, 'triangle', 0.08, 0, 300);
  }
  lost() {
    this.tone(440, 0.4, 'triangle', 0.1, 0, 180);
    this.noise(0.2, 0.15, 900, 1, 0.05);
  }
  click() {
    this.tone(880, 0.05, 'triangle', 0.06);
  }
  flutter() {
    for (let i = 0; i < 5; i++) this.noise(0.06, 0.06, 2000 + Math.random() * 1000, 2, i * 0.05);
  }
  gull() {
    this.tone(1400, 0.25, 'triangle', 0.03, 0, 900);
    this.tone(1300, 0.3, 'triangle', 0.025, 0.28, 800);
  }
  splash() {
    this.noise(0.5, 0.3, 1500, 0.5, 0, 'highpass');
  }
  jingle(good: boolean) {
    const seq = good ? [523, 659, 784, 1047, 784, 1047] : [523, 466, 392, 330];
    seq.forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.12, i * 0.13));
    if (good) this.tone(1319, 0.6, 'sine', 0.08, seq.length * 0.13);
  }
  tick() {
    this.tone(1200, 0.04, 'square', 0.03);
  }
}

export const audio = new AudioFx();
