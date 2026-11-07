import * as THREE from 'three';
import type { Surface } from '../core/types';

export type Sfx =
  | 'step'
  | 'crawl'
  | 'land'
  | 'creak'
  | 'doorCreak'
  | 'doorThud'
  | 'drawer'
  | 'pickup'
  | 'clatter'
  | 'thunk'
  | 'scrape'
  | 'lumoChirp'
  | 'lumoWake'
  | 'lumoLow'
  | 'lumoPlace'
  | 'charge'
  | 'hushWhisper'
  | 'hushStep'
  | 'stinger'
  | 'heartbeat'
  | 'grab'
  | 'uiClick'
  | 'uiHover'
  | 'climb'
  | 'unlock'
  | 'locked'
  | 'mechanism'
  | 'dial'
  | 'chute'
  | 'note'
  | 'glimmer'
  | 'scream'
  | 'ring';

export interface PlayOptions {
  pos?: THREE.Vector3;
  volume?: number;
  rate?: number;
  surface?: Surface;
}

/** Original lullaby ("Little Night"), MIDI notes, 0 = rest. */
const LULLABY = [
  74, 72, 69, 72, 74, 77, 76, 74, 72, 69, 67, 69, 72, 0, 0, 0,
  69, 72, 74, 77, 76, 74, 72, 69, 67, 69, 72, 70, 69, 0, 0, 0,
  77, 76, 74, 72, 74, 76, 77, 81, 79, 77, 76, 74, 76, 0, 0, 0,
  74, 72, 69, 67, 69, 72, 74, 72, 69, 67, 65, 67, 69, 0, 0, 0, 0, 0,
];

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

interface Tracked {
  panner: PannerNode;
  target: THREE.Object3D | THREE.Vector3;
}

export class MelodySource {
  index = 0;
  nextTime = 0;
  playing = false;
  detune = 0;
  tempo = 0.42;
  readonly gain: GainNode;
  readonly panner: PannerNode | null;
  constructor(readonly audio: AudioManager, pos: THREE.Vector3 | null, volume: number) {
    const ctx = audio.ctx!;
    this.gain = ctx.createGain();
    this.gain.gain.value = volume;
    if (pos) {
      this.panner = audio.makePanner(pos, 2.2, 1.1);
      this.gain.connect(this.panner);
      this.panner.connect(audio.musicBus!);
    } else {
      this.panner = null;
      this.gain.connect(audio.musicBus!);
    }
  }
  setPosition(pos: THREE.Vector3): void {
    if (!this.panner) return;
    this.panner.positionX.value = pos.x;
    this.panner.positionY.value = pos.y;
    this.panner.positionZ.value = pos.z;
  }
  start(): void {
    this.playing = true;
    this.nextTime = this.audio.ctx!.currentTime + 0.1;
  }
  stop(fade = 0.4): void {
    this.playing = false;
    const t = this.audio.ctx!.currentTime;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setTargetAtTime(0, t, fade / 3);
  }
  setVolume(v: number, time = 0.3): void {
    const t = this.audio.ctx!.currentTime;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setTargetAtTime(v, t, time / 3);
  }
  schedule(): void {
    if (!this.playing) return;
    const ctx = this.audio.ctx!;
    while (this.nextTime < ctx.currentTime + 0.25) {
      const note = LULLABY[this.index % LULLABY.length];
      if (note > 0) this.audio.musicBoxNote(midi(note) * Math.pow(2, this.detune / 1200), this.nextTime, this.gain);
      this.index++;
      this.nextTime += this.tempo * (1 + (this.detune !== 0 ? Math.sin(this.index) * 0.04 : 0));
    }
  }
  dispose(): void {
    this.playing = false;
    this.gain.disconnect();
    this.panner?.disconnect();
  }
}

export class AudioManager {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  musicBus: GainNode | null = null;
  sfxBus: GainNode | null = null;
  private fearFilter: BiquadFilterNode | null = null;
  private drive: WaveShaperNode | null = null;
  private driveGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private brown: AudioBuffer | null = null;
  private tracked: Tracked[] = [];
  private loops = new Map<string, { gain: GainNode; nodes: AudioNode[] }>();
  private melodies = new Set<MelodySource>();
  private breathTimer = 0;
  private breathPhase = 0;
  private heartTimer = 0;
  private dropTimer = 0;
  private padTimer = 0;
  private padChord = 0;
  private padStyle: 'bedroom' | 'kitchen' | 'attic' | 'menu' | 'ending' | 'none' = 'none';
  fear = 0;
  chase = 0;
  rainLevel = 0.5;
  volumes = { master: 0.8, music: 0.7, sfx: 0.9 };
  private muted = false;
  private platformMuted = false;

  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.build();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  get ready(): boolean {
    return this.ctx !== null;
  }

  private build(): void {
    const ctx = this.ctx!;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);

    this.fearFilter = ctx.createBiquadFilter();
    this.fearFilter.type = 'lowpass';
    this.fearFilter.frequency.value = 18000;
    this.fearFilter.Q.value = 0.4;
    this.fearFilter.connect(this.master);

    this.drive = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(x * 3.5);
    }
    this.drive.curve = curve;
    this.driveGain = ctx.createGain();
    this.driveGain.gain.value = 0;
    this.drive.connect(this.driveGain).connect(this.master);

    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.fearFilter);
    this.sfxBus.connect(this.drive);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.fearFilter);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      b[i] = last * 3.5;
    }
    ctx.listener.positionX && (ctx.listener.positionX.value = 0);
    this.applyVolumes();
  }

  setVolumes(master: number, music: number, sfx: number): void {
    this.volumes = { master, music, sfx };
    this.applyVolumes();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyVolumes();
  }

  setPlatformMuted(muted: boolean): void {
    this.platformMuted = muted;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const m = this.muted || this.platformMuted ? 0 : this.volumes.master;
    this.master.gain.setTargetAtTime(m, t, 0.05);
    this.musicBus!.gain.setTargetAtTime(this.volumes.music, t, 0.05);
    this.sfxBus!.gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
  }

  /** Temporarily scale everything (catch scare: sudden silence, then the scream). */
  duck(level: number, time = 0.05): void {
    if (!this.ctx || !this.master) return;
    const m = this.muted || this.platformMuted ? 0 : this.volumes.master;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setTargetAtTime(m * level, this.ctx.currentTime, time);
  }

  suspend(): void {
    this.ctx?.suspend().catch(() => {});
  }

  resume(): void {
    this.ctx?.resume().catch(() => {});
  }

  makePanner(pos: THREE.Vector3, ref = 1, rolloff = 1.4): PannerNode {
    const p = this.ctx!.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.rolloffFactor = rolloff;
    p.maxDistance = 40;
    p.positionX.value = pos.x;
    p.positionY.value = pos.y;
    p.positionZ.value = pos.z;
    return p;
  }

  /** Output node for a one-shot: positional when pos given. */
  private out(opts: PlayOptions, bus?: AudioNode): AudioNode {
    const target = bus ?? this.sfxBus!;
    if (!opts.pos) return target;
    const p = this.makePanner(opts.pos);
    p.connect(target);
    window.setTimeout(() => p.disconnect(), 4000);
    return p;
  }

  updateListener(camera: THREE.Camera, dt: number): void {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const pos = new THREE.Vector3();
    const fwd = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    camera.getWorldPosition(pos);
    camera.getWorldDirection(fwd);
    if (l.positionX) {
      const t = this.ctx.currentTime;
      l.positionX.setTargetAtTime(pos.x, t, 0.02);
      l.positionY.setTargetAtTime(pos.y, t, 0.02);
      l.positionZ.setTargetAtTime(pos.z, t, 0.02);
      l.forwardX.setTargetAtTime(fwd.x, t, 0.02);
      l.forwardY.setTargetAtTime(fwd.y, t, 0.02);
      l.forwardZ.setTargetAtTime(fwd.z, t, 0.02);
      l.upX.value = up.x;
      l.upY.value = up.y;
      l.upZ.value = up.z;
    }
    for (const tr of this.tracked) {
      const p = (tr.target as THREE.Object3D).isObject3D ? (tr.target as THREE.Object3D).getWorldPosition(pos) : (tr.target as THREE.Vector3);
      tr.panner.positionX.value = p.x;
      tr.panner.positionY.value = p.y;
      tr.panner.positionZ.value = p.z;
    }
    for (const m of this.melodies) m.schedule();
    this.updateFear(dt);
    this.updateAmbientTimers(dt);
  }

  /* ------------------------------ fear --------------------------------- */

  private updateFear(dt: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = this.fear;
    this.fearFilter!.frequency.setTargetAtTime(18000 - f * 14500, t, 0.2);
    this.driveGain!.gain.setTargetAtTime(f * f * 0.12, t, 0.2);
    // breathing: always faint, quicker and louder with fear
    const rate = 0.28 + f * 0.9;
    this.breathTimer -= dt * rate * 2;
    if (this.breathTimer <= 0) {
      this.breathTimer = 1;
      this.breathPhase ^= 1;
      this.breath(this.breathPhase === 0, 0.035 + f * 0.16, 0.9 / (0.4 + f));
    }
    if (f > 0.45) {
      this.heartTimer -= dt;
      if (this.heartTimer <= 0) {
        this.heartTimer = 1.05 - f * 0.55;
        this.play('heartbeat', { volume: (f - 0.4) * 0.9 });
      }
    }
  }

  private breath(inhale: boolean, volume: number, dur: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = this.noiseSource();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = inhale ? 1500 : 900;
    bp.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(volume, t + dur * 0.35);
    g.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(bp).connect(g).connect(this.sfxBus!);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  /* ----------------------------- ambience ------------------------------ */

  private updateAmbientTimers(dt: number): void {
    if (!this.loops.has('rain')) return;
    this.dropTimer -= dt;
    if (this.dropTimer <= 0) {
      this.dropTimer = 0.05 + Math.random() * 0.25;
      this.drip(this.rainLevel * 0.05);
    }
    if (this.padStyle !== 'none') {
      this.padTimer -= dt;
      if (this.padTimer <= 0) {
        this.padTimer = 7.5;
        this.padNext();
      }
    }
  }

  startAmbience(rainLevel: number, wind = 0.25): void {
    if (!this.ctx) return;
    this.rainLevel = rainLevel;
    const ctx = this.ctx;
    this.stopLoop('rain');
    this.stopLoop('wind');
    // Rain: band-limited noise, muffled by walls.
    {
      const src = this.noiseSource(true);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 400;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2600;
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(rainLevel * 0.16, ctx.currentTime, 1.5);
      src.connect(hp).connect(lp).connect(g).connect(this.sfxBus!);
      src.start();
      this.loops.set('rain', { gain: g, nodes: [src, hp, lp] });
    }
    // Wind: brown noise with slow swells.
    {
      const src = ctx.createBufferSource();
      src.buffer = this.brown;
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 500;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 260;
      lfo.connect(lfoGain).connect(lp.frequency);
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(wind * 0.35, ctx.currentTime, 2);
      src.connect(lp).connect(g).connect(this.sfxBus!);
      src.start();
      lfo.start();
      this.loops.set('wind', { gain: g, nodes: [src, lp, lfo, lfoGain] });
    }
  }

  setRainLevel(level: number): void {
    this.rainLevel = level;
    const loop = this.loops.get('rain');
    if (loop && this.ctx) loop.gain.gain.setTargetAtTime(level * 0.16, this.ctx.currentTime, 1);
  }

  private drip(volume: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    const f = 1800 + Math.random() * 2600;
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.5, t + 0.04);
    const g = ctx.createGain();
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g).connect(this.sfxBus!);
    o.start(t);
    o.stop(t + 0.06);
  }

  stopLoop(name: string, fade = 0.5): void {
    const loop = this.loops.get(name);
    if (!loop || !this.ctx) return;
    this.loops.delete(name);
    loop.gain.gain.setTargetAtTime(0, this.ctx.currentTime, fade / 3);
    window.setTimeout(() => {
      for (const n of loop.nodes) {
        try {
          (n as AudioScheduledSourceNode).stop?.();
        } catch {
          /* already stopped */
        }
        n.disconnect();
      }
      loop.gain.disconnect();
    }, fade * 1000 + 200);
  }

  stopAll(): void {
    for (const name of [...this.loops.keys()]) this.stopLoop(name, 0.3);
    for (const m of this.melodies) m.dispose();
    this.melodies.clear();
    this.tracked = [];
    this.padStyle = 'none';
  }

  /** Positional looping drone attached to an object (THE HUSH, LUMO wings). */
  startTrackedLoop(name: string, kind: 'hush' | 'lumo' | 'hands', target: THREE.Object3D, volume: number): void {
    if (!this.ctx) return;
    this.stopLoop(name, 0.1);
    const ctx = this.ctx;
    const panner = this.makePanner(new THREE.Vector3(), kind === 'lumo' ? 0.3 : 1.2, kind === 'lumo' ? 2 : 1.2);
    const g = ctx.createGain();
    g.gain.value = volume;
    g.connect(panner).connect(this.sfxBus!);
    const nodes: AudioNode[] = [panner];
    if (kind === 'hush') {
      for (const f of [41, 43.7, 61.5]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 180;
        const og = ctx.createGain();
        og.gain.value = 0.22;
        o.connect(lp).connect(og).connect(g);
        o.start();
        nodes.push(o, lp, og);
      }
      const src = this.noiseSource(true);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2400;
      bp.Q.value = 2;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.22;
      const lg = ctx.createGain();
      lg.gain.value = 0.12;
      const ng = ctx.createGain();
      ng.gain.value = 0.12;
      lfo.connect(lg).connect(ng.gain);
      src.connect(bp).connect(ng).connect(g);
      src.start();
      lfo.start();
      nodes.push(src, bp, lfo, lg, ng);
    } else if (kind === 'lumo') {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 118;
      const am = ctx.createOscillator();
      am.frequency.value = 38;
      const amg = ctx.createGain();
      amg.gain.value = 0.5;
      const og = ctx.createGain();
      og.gain.value = 0.5;
      am.connect(amg).connect(og.gain);
      const hp = ctx.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.value = 900;
      hp.Q.value = 1.2;
      o.connect(og).connect(hp).connect(g);
      o.start();
      am.start();
      nodes.push(o, am, amg, og, hp);
    } else {
      const src = this.noiseSource(true);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 600;
      bp.Q.value = 3;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5;
      const lg = ctx.createGain();
      lg.gain.value = 300;
      lfo.connect(lg).connect(bp.frequency);
      src.connect(bp).connect(g);
      src.start();
      lfo.start();
      nodes.push(src, bp, lfo, lg);
    }
    this.loops.set(name, { gain: g, nodes });
    this.tracked.push({ panner, target });
  }

  setLoopVolume(name: string, volume: number, time = 0.2): void {
    const loop = this.loops.get(name);
    if (loop && this.ctx) loop.gain.gain.setTargetAtTime(volume, this.ctx.currentTime, time / 3);
  }

  hasLoop(name: string): boolean {
    return this.loops.has(name);
  }

  untrack(target: THREE.Object3D): void {
    this.tracked = this.tracked.filter((t) => t.target !== target);
  }

  /* ------------------------------ music -------------------------------- */

  createMelody(pos: THREE.Vector3 | null, volume = 0.5): MelodySource | null {
    if (!this.ctx) return null;
    const m = new MelodySource(this, pos, volume);
    this.melodies.add(m);
    return m;
  }

  releaseMelody(m: MelodySource | null): void {
    if (!m) return;
    m.stop(0.3);
    window.setTimeout(() => m.dispose(), 800);
    this.melodies.delete(m);
  }

  musicBoxNote(freq: number, when: number, dest: AudioNode): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(0.22, when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0008, when + 1.8);
    g.connect(dest);
    const partials: [number, number][] = [
      [1, 1],
      [2.0, 0.28],
      [3.01, 0.12],
      [5.4, 0.05],
    ];
    for (const [mult, amp] of partials) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * mult;
      const pg = ctx.createGain();
      pg.gain.setValueAtTime(amp, when);
      pg.gain.exponentialRampToValueAtTime(0.001, when + 1.8 / mult);
      o.connect(pg).connect(g);
      o.start(when);
      o.stop(when + 1.9);
    }
  }

  /** Slow chord pad, styled per chapter. */
  setPad(style: 'bedroom' | 'kitchen' | 'attic' | 'menu' | 'ending' | 'none'): void {
    this.padStyle = style;
    this.padTimer = 0.2;
  }

  private padNext(): void {
    const ctx = this.ctx!;
    const chords: Record<string, number[][]> = {
      menu: [[50, 57, 62, 65], [46, 53, 58, 62], [48, 55, 60, 64], [45, 52, 57, 60]],
      bedroom: [[50, 57, 62, 65], [46, 53, 58, 65], [43, 50, 55, 62], [45, 52, 57, 61]],
      kitchen: [[45, 52, 55, 60], [44, 51, 56, 59], [41, 48, 53, 56], [40, 47, 52, 58]],
      attic: [[38, 45, 50, 53], [39, 46, 51, 54], [36, 43, 48, 51], [37, 44, 49, 55]],
      ending: [[50, 57, 62, 66], [47, 54, 59, 62], [43, 50, 55, 59], [45, 52, 57, 61]],
    };
    const set = chords[this.padStyle] ?? chords.menu;
    const chord = set[this.padChord++ % set.length];
    const t = ctx.currentTime;
    const dur = 8.5;
    const vol = this.padStyle === 'ending' ? 0.05 : 0.032;
    for (const n of chord) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = this.padStyle === 'kitchen' ? 'sawtooth' : 'triangle';
        o.frequency.value = midi(n);
        o.detune.value = det;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = this.padStyle === 'kitchen' ? 520 : 900;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(vol, t + 2.5);
        g.gain.linearRampToValueAtTime(vol * 0.8, t + dur - 2.5);
        g.gain.linearRampToValueAtTime(0, t + dur);
        o.connect(lp).connect(g).connect(this.musicBus!);
        o.start(t);
        o.stop(t + dur + 0.1);
      }
    }
  }

  /** Chase pulse: low ticking + drone, intensity 0..1. */
  setChase(level: number): void {
    if (!this.ctx) return;
    this.chase = level;
    if (level > 0 && !this.loops.has('chase')) {
      const ctx = this.ctx;
      const g = ctx.createGain();
      g.gain.value = 0;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 55;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 300;
      const lfo = ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 2.6;
      const lg = ctx.createGain();
      lg.gain.value = 220;
      lfo.connect(lg).connect(lp.frequency);
      const o2 = ctx.createOscillator();
      o2.type = 'sine';
      o2.frequency.value = 58.3;
      o.connect(lp).connect(g);
      o2.connect(g);
      g.connect(this.musicBus!);
      o.start();
      o2.start();
      lfo.start();
      this.loops.set('chase', { gain: g, nodes: [o, o2, lp, lfo, lg] });
    }
    if (level > 0) this.setLoopVolume('chase', level * 0.22, 0.4);
    else this.stopLoop('chase', 1.5);
  }

  /* ------------------------------ one-shots ---------------------------- */

  private noiseSource(loop = false): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.loop = loop;
    return src;
  }

  private noiseHit(dest: AudioNode, t: number, dur: number, type: BiquadFilterType, freq: number, q: number, vol: number, attack = 0.003): void {
    const ctx = this.ctx!;
    const src = this.noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  private tone(dest: AudioNode, t: number, type: OscillatorType, f0: number, f1: number, dur: number, vol: number, attack = 0.005): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private creakTone(dest: AudioNode, t: number, dur: number, base: number, vol: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(base, t);
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      o.frequency.linearRampToValueAtTime(base * (0.8 + Math.random() * 0.6), t + (dur * i) / steps);
    }
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = base * 6;
    bp.Q.value = 6;
    const am = ctx.createOscillator();
    am.frequency.value = 22 + Math.random() * 18;
    const amg = ctx.createGain();
    amg.gain.value = 0.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.2);
    g.gain.linearRampToValueAtTime(vol * 0.7, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0, t + dur);
    am.connect(amg).connect(g.gain);
    o.connect(bp).connect(g).connect(dest);
    o.start(t);
    am.start(t);
    o.stop(t + dur + 0.05);
    am.stop(t + dur + 0.05);
  }

  play(name: Sfx, opts: PlayOptions = {}): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + 0.005;
    const v = opts.volume ?? 1;
    const rate = opts.rate ?? 1;
    const dest = this.out(opts);
    switch (name) {
      case 'step': {
        const s = opts.surface ?? 'wood';
        const r = 0.85 + Math.random() * 0.3;
        if (s === 'carpet' || s === 'fabric') {
          this.noiseHit(dest, t, 0.09, 'lowpass', 500 * r, 0.7, 0.16 * v);
        } else if (s === 'tile') {
          this.noiseHit(dest, t, 0.05, 'bandpass', 2600 * r, 1.6, 0.2 * v);
          this.tone(dest, t, 'sine', 180 * r, 90, 0.06, 0.12 * v);
        } else if (s === 'metal') {
          this.noiseHit(dest, t, 0.08, 'bandpass', 3800 * r, 3, 0.22 * v);
          this.tone(dest, t, 'triangle', 900 * r, 870, 0.15, 0.06 * v);
        } else {
          this.noiseHit(dest, t, 0.07, 'bandpass', 900 * r, 1.2, 0.22 * v);
          this.tone(dest, t, 'sine', 120 * r, 70, 0.08, 0.2 * v);
        }
        break;
      }
      case 'crawl':
        this.noiseHit(dest, t, 0.22, 'lowpass', 700, 0.5, 0.07 * v, 0.06);
        break;
      case 'land':
        this.tone(dest, t, 'sine', 140, 50, 0.18, 0.5 * v);
        this.noiseHit(dest, t, 0.14, 'lowpass', 900, 0.8, 0.3 * v);
        break;
      case 'climb':
        this.noiseHit(dest, t, 0.25, 'bandpass', 1200, 1, 0.12 * v, 0.05);
        this.tone(dest, t + 0.15, 'sine', 160, 90, 0.1, 0.18 * v);
        break;
      case 'creak':
        this.creakTone(dest, t, 0.55 * rate, 70 + Math.random() * 40, 0.16 * v);
        break;
      case 'doorCreak':
        this.creakTone(dest, t, 1.3, 55 + Math.random() * 25, 0.2 * v);
        break;
      case 'doorThud':
        this.tone(dest, t, 'sine', 110, 45, 0.3, 0.6 * v);
        this.noiseHit(dest, t, 0.2, 'lowpass', 600, 0.7, 0.4 * v);
        break;
      case 'drawer':
        this.noiseHit(dest, t, 0.45, 'bandpass', 1300, 2, 0.12 * v, 0.2);
        this.tone(dest, t + 0.4, 'sine', 300, 200, 0.06, 0.15 * v);
        break;
      case 'pickup':
        this.noiseHit(dest, t, 0.12, 'bandpass', 2400, 1, 0.08 * v);
        this.tone(dest, t + 0.05, 'sine', 1320, 1320, 0.5, 0.06 * v);
        this.tone(dest, t + 0.12, 'sine', 1980, 1980, 0.6, 0.04 * v);
        break;
      case 'clatter':
        for (let i = 0; i < 6; i++) {
          const tt = t + i * (0.04 + Math.random() * 0.07);
          this.noiseHit(dest, tt, 0.09, 'bandpass', 3000 + Math.random() * 3000, 4, 0.3 * v);
          this.tone(dest, tt, 'sine', 2200 + Math.random() * 1800, 2100, 0.3, 0.06 * v);
        }
        break;
      case 'thunk':
        this.tone(dest, t, 'sine', 320, 110, 0.15, 0.4 * v);
        this.noiseHit(dest, t, 0.05, 'bandpass', 1800, 2, 0.2 * v);
        break;
      case 'scrape':
        this.noiseHit(dest, t, 0.3, 'bandpass', 380 + Math.random() * 120, 3, 0.18 * v, 0.06);
        break;
      case 'lumoChirp':
        this.tone(dest, t, 'sine', 1900, 3100, 0.09, 0.08 * v);
        this.tone(dest, t + 0.1, 'sine', 2300, 3600, 0.08, 0.07 * v);
        this.noiseHit(dest, t + 0.02, 0.02, 'highpass', 6000, 1, 0.05 * v);
        break;
      case 'lumoWake': {
        const notes = [74, 78, 81, 86, 90];
        notes.forEach((n, i) => this.tone(dest, t + i * 0.11, 'sine', midi(n), midi(n), 0.4, 0.07 * v));
        for (let i = 0; i < 10; i++) this.noiseHit(dest, t + i * 0.06, 0.015, 'highpass', 5000, 1, 0.08 * v);
        break;
      }
      case 'lumoLow':
        this.tone(dest, t, 'sine', 1600, 700, 0.35, 0.08 * v);
        this.tone(dest, t + 0.3, 'sine', 1100, 500, 0.4, 0.06 * v);
        break;
      case 'lumoPlace':
        this.tone(dest, t, 'sine', 1400, 2800, 0.2, 0.07 * v);
        this.tone(dest, t + 0.2, 'triangle', midi(86), midi(86), 0.6, 0.05 * v);
        this.noiseHit(dest, t + 0.18, 0.03, 'highpass', 4000, 1, 0.1 * v);
        break;
      case 'charge':
        for (let i = 0; i < 14; i++) this.noiseHit(dest, t + i * (0.11 - i * 0.004), 0.02, 'bandpass', 3500, 4, 0.12 * v);
        this.tone(dest, t, 'triangle', 300, 1200, 1.4, 0.05 * v, 0.6);
        this.tone(dest, t + 1.3, 'sine', midi(86), midi(86), 0.8, 0.07 * v);
        break;
      case 'hushWhisper': {
        const ctx = this.ctx;
        const src = this.noiseSource();
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 2200;
        const formant = ctx.createBiquadFilter();
        formant.type = 'peaking';
        formant.frequency.value = 3800;
        formant.gain.value = 9;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.38 * v, t + 0.35);
        g.gain.setValueAtTime(0.38 * v, t + 1.0);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
        src.connect(hp).connect(formant).connect(g).connect(dest);
        src.start(t);
        src.stop(t + 2);
        this.tone(dest, t, 'sine', 48, 38, 1.8, 0.25 * v, 0.4);
        break;
      }
      case 'hushStep':
        this.tone(dest, t, 'sine', 70, 40, 0.3, 0.28 * v);
        this.noiseHit(dest, t, 0.25, 'lowpass', 300, 1, 0.18 * v);
        if (Math.random() > 0.6) this.creakTone(dest, t + 0.05, 0.4, 60, 0.08 * v);
        break;
      case 'stinger': {
        for (const n of [37, 38, 44, 49, 50, 56]) this.tone(dest, t, 'sawtooth', midi(n), midi(n) * 0.94, 1.6, 0.06 * v, 0.01);
        this.noiseHit(dest, t, 1.2, 'bandpass', 2000, 0.5, 0.5 * v, 0.01);
        this.tone(dest, t, 'sine', 90, 30, 1.2, 0.6 * v);
        break;
      }
      case 'heartbeat':
        this.tone(dest, t, 'sine', 62, 40, 0.14, 0.45 * v);
        this.tone(dest, t + 0.2, 'sine', 55, 38, 0.16, 0.32 * v);
        break;
      case 'grab':
        this.noiseHit(dest, t, 0.6, 'bandpass', 500, 4, 0.3 * v, 0.2);
        this.tone(dest, t, 'sawtooth', 70, 50, 0.7, 0.08 * v, 0.2);
        break;
      case 'uiClick':
        this.tone(this.musicBus!, t, 'sine', 1200, 900, 0.07, 0.06 * v);
        break;
      case 'uiHover':
        this.tone(this.musicBus!, t, 'sine', 1800, 1800, 0.05, 0.02 * v);
        break;
      case 'unlock':
        this.noiseHit(dest, t, 0.04, 'bandpass', 3000, 3, 0.25 * v);
        this.noiseHit(dest, t + 0.12, 0.05, 'bandpass', 2200, 3, 0.3 * v);
        this.tone(dest, t + 0.12, 'sine', 600, 400, 0.12, 0.15 * v);
        break;
      case 'locked':
        this.noiseHit(dest, t, 0.05, 'bandpass', 1500, 3, 0.25 * v);
        this.noiseHit(dest, t + 0.09, 0.05, 'bandpass', 1400, 3, 0.2 * v);
        break;
      case 'mechanism':
        for (let i = 0; i < 8; i++) this.noiseHit(dest, t + i * 0.09, 0.03, 'bandpass', 2000 + (i % 2) * 900, 5, 0.2 * v);
        this.tone(dest, t, 'triangle', 90, 140, 0.8, 0.12 * v, 0.1);
        break;
      case 'dial':
        this.noiseHit(dest, t, 0.03, 'bandpass', 4200, 6, 0.25 * v);
        this.tone(dest, t, 'sine', 2400, 2300, 0.08, 0.05 * v);
        break;
      case 'chute':
        this.noiseHit(dest, t, 1.6, 'bandpass', 700, 0.7, 0.3 * v, 0.2);
        this.tone(dest, t + 1.5, 'sine', 120, 50, 0.4, 0.5 * v);
        break;
      case 'note':
        this.noiseHit(dest, t, 0.3, 'highpass', 3000, 0.8, 0.07 * v, 0.05);
        break;
      case 'scream': {
        // Distorted, rising wail layered over a roaring whisper.
        const ctx = this.ctx;
        for (const n of [49, 50, 55.5, 61, 62]) {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.setValueAtTime(midi(n), t);
          o.frequency.exponentialRampToValueAtTime(midi(n) * 1.9, t + 0.9);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.11 * v, t + 0.08);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
          o.connect(g).connect(dest);
          o.start(t);
          o.stop(t + 1.05);
        }
        this.noiseHit(dest, t, 1.0, 'bandpass', 1700, 0.6, 0.9 * v, 0.05);
        this.noiseHit(dest, t, 0.9, 'highpass', 3500, 0.7, 0.5 * v, 0.02);
        this.tone(dest, t, 'sine', 70, 28, 1.1, 0.8 * v, 0.01);
        break;
      }
      case 'ring':
        this.tone(dest, t, 'sine', 3150, 3100, 2.4, 0.05 * v, 0.02);
        break;
      case 'glimmer':
        [86, 90, 93].forEach((n, i) => this.tone(dest, t + i * 0.07, 'sine', midi(n), midi(n), 0.6, 0.035 * v));
        break;
    }
  }

  /** Thunder: near = loud crack + rumble, far = soft rumble. */
  thunder(near: boolean): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const t = ctx.currentTime + (near ? 0.05 : 0.6 + Math.random() * 0.8);
    const src = ctx.createBufferSource();
    src.buffer = this.brown;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(near ? 1600 : 500, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + 3.5);
    const g = ctx.createGain();
    const vol = near ? 1.0 : 0.45;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + (near ? 0.03 : 0.5));
    g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);
    src.connect(lp).connect(g).connect(this.sfxBus!);
    src.start(t, Math.random());
    src.stop(t + 4.6);
    if (near) this.noiseHit(this.sfxBus!, t, 0.35, 'highpass', 1500, 0.5, 0.25);
  }
}
