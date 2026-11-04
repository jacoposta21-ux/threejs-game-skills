/**
 * SHELL SWITCH audio: everything is synthesized at runtime with the Web Audio API.
 * No audio files, no network, no external services.
 *
 * Graph: [music tracks] -> musicBus ─┐
 *        [ambience beds] -> ambBus ──┼-> master -> compressor -> limiter -> destination
 *        [sfx/voices/loops] -> sfxBus┘      (music + sfx also feed a small synthetic room reverb)
 */
import { createLoop, type LoopInstance } from './Loops';
import { AmbiencePlayer, TRACKS, TrackPlayer } from './Music';
import { FOOTSTEPS, SFX, voiceBlips } from './Sfx';
import { createImpulse, createNoiseBank, type NoiseBank, type Voice } from './synth';

export type AreaId = 'station' | 'mall' | 'circus' | 'museum' | 'cityhall' | 'hub';
export type MusicTrack = AreaId | 'menu' | 'finale';
export type CharacterKind = 'alien' | 'strongman' | 'police' | 'clown' | 'chef' | 'thief' | 'singer' | 'ghost' | 'scientist' | 'mayor' | 'civilian';
export type SfxName =
  | 'possess' | 'unpossess' | 'jump' | 'land' | 'dash' | 'collect' | 'core' | 'missionComplete' | 'missionStart'
  | 'uiClick' | 'uiHover' | 'uiBack' | 'uiOpen' | 'door' | 'gate' | 'lift' | 'throw' | 'thud' | 'smash' | 'flex'
  | 'whistle' | 'honk' | 'juggle' | 'sizzle' | 'serve' | 'eat' | 'pickLock' | 'unlock' | 'pickpocket' | 'denied'
  | 'phase' | 'boo' | 'zap' | 'machineOn' | 'suspicion' | 'alert' | 'caught' | 'achievement' | 'discover'
  | 'cannon' | 'laser' | 'cheer' | 'gasp' | 'scream' | 'clap' | 'proclaim' | 'lever' | 'plate' | 'splash' | 'trainHorn' | 'chime';
export interface Vec3Like { x: number; y: number; z: number }

type LoopId = 'sing' | 'phaseLoop' | 'laserHum' | 'carryStrain';

const MUSIC_BASE = 0.55;
const AMB_BASE = 0.75;
const SFX_BASE = 0.9;
const CROSSFADE = 1.5;
const MAX_VOICES = 24;
const REF_DIST = 3;
const MAX_DIST = 35;

/** Per-sound loudness trims so the mix sits well with music. */
const TRIM: Partial<Record<SfxName, number>> = {
  uiHover: 0.8, uiClick: 0.9, cheer: 0.9, clap: 0.85, cannon: 0.9, smash: 0.9, trainHorn: 0.8,
};

interface LoopEntry { inst: LoopInstance; gain: GainNode; pan: StereoPannerNode | null; pos: Vec3Like | null }

const AREAS: readonly MusicTrack[] = ['station', 'mall', 'circus', 'museum', 'cityhall', 'hub'];

type AudioCtor = new () => AudioContext;

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private nz: NoiseBank | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private ambBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  private musicVol = 0.8;
  private sfxVol = 0.8;
  private paused = false;
  private disposed = false;
  private desiredTrack: MusicTrack | null = null;
  private currentTrack: MusicTrack | null = null;
  private track: TrackPlayer | null = null;
  private ambience: AmbiencePlayer | null = null;
  private pendingLoops = new Map<LoopId, Vec3Like | undefined>();
  private voiceEnds: number[] = [];
  private loops = new Map<LoopId, LoopEntry>();
  private listener: Vec3Like = { x: 0, y: 0, z: 0 };
  private yaw = 0;
  private readonly onVisibility = (): void => this.handleVisibility();

  constructor() {
    /* no AudioContext until unlock() (autoplay policy) */
  }

  // ------------------------------------------------------------------ lifecycle

  unlock(): void {
    try {
      if (this.disposed) return;
      if (!this.ctx) {
        if (!this.build()) return;
      }
      const ctx = this.ctx;
      if (!ctx) return;
      if (ctx.state !== 'running' && !this.isHidden()) void ctx.resume().catch(() => undefined);
      if (this.desiredTrack && this.desiredTrack !== this.currentTrack) this.switchTrack(this.desiredTrack);
      if (this.pendingLoops.size > 0) {
        const pending = [...this.pendingLoops];
        this.pendingLoops.clear();
        for (const [id, pos] of pending) this.startLoop(id, pos);
      }
    } catch {
      /* audio unavailable */
    }
  }

  private build(): boolean {
    const w = typeof window !== 'undefined' ? (window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor }) : null;
    const Ctor = w ? (w.AudioContext ?? w.webkitAudioContext) : undefined;
    if (!Ctor) return false;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.nz = createNoiseBank(ctx);

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.1;
    limiter.connect(ctx.destination);

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 10;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.006;
    comp.release.value = 0.25;
    comp.connect(limiter);

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(comp);

    const reverb = ctx.createConvolver();
    reverb.buffer = createImpulse(ctx, 1.6, 3);
    const revOut = ctx.createGain();
    revOut.gain.value = 1;
    reverb.connect(revOut);
    revOut.connect(this.master);

    this.musicBus = ctx.createGain();
    this.ambBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.ambBus.connect(this.master);
    this.sfxBus.connect(this.master);
    const mSend = ctx.createGain();
    mSend.gain.value = 0.22;
    this.musicBus.connect(mSend);
    mSend.connect(reverb);
    const sSend = ctx.createGain();
    sSend.gain.value = 0.08;
    this.sfxBus.connect(sSend);
    sSend.connect(reverb);

    this.applyVolumes(true);
    this.timer = setInterval(() => this.tick(), 25);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibility);
    return true;
  }

  private isHidden(): boolean {
    return typeof document !== 'undefined' && document.visibilityState === 'hidden';
  }

  private handleVisibility(): void {
    try {
      const ctx = this.ctx;
      if (!ctx || this.disposed) return;
      if (this.isHidden()) {
        if (ctx.state === 'running') void ctx.suspend().catch(() => undefined);
      } else if (!this.paused && ctx.state !== 'running') {
        void ctx.resume().catch(() => undefined);
      }
    } catch {
      /* ignore */
    }
  }

  private ready(): AudioContext | null {
    const ctx = this.ctx;
    if (!ctx || this.disposed || ctx.state === 'closed') return null;
    return ctx;
  }

  private tick(): void {
    try {
      const ctx = this.ready();
      if (!ctx || ctx.state !== 'running') return;
      const now = ctx.currentTime;
      this.track?.tick(now);
      this.ambience?.tick(now, this.paused);
      for (const l of this.loops.values()) l.inst.tick(now);
    } catch {
      /* ignore */
    }
  }

  dispose(): void {
    try {
      this.disposed = true;
      if (this.timer !== null) clearInterval(this.timer);
      this.timer = null;
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
      for (const id of [...this.loops.keys()]) this.stopLoop(id);
      const ctx = this.ctx;
      this.ctx = null;
      this.track = null;
      this.ambience = null;
      if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => undefined);
    } catch {
      /* ignore */
    }
  }

  // ------------------------------------------------------------------ mix

  setVolumes(music: number, sfx: number): void {
    try {
      this.musicVol = clamp01(music);
      this.sfxVol = clamp01(sfx);
      this.applyVolumes(false);
    } catch {
      /* ignore */
    }
  }

  setPaused(paused: boolean): void {
    try {
      this.paused = paused;
      this.applyVolumes(false);
      const ctx = this.ready();
      if (ctx && !paused && ctx.state !== 'running' && !this.isHidden()) void ctx.resume().catch(() => undefined);
    } catch {
      /* ignore */
    }
  }

  private applyVolumes(immediate: boolean): void {
    const ctx = this.ready();
    if (!ctx || !this.musicBus || !this.ambBus || !this.sfxBus) return;
    const now = ctx.currentTime;
    const m = this.musicVol * MUSIC_BASE * (this.paused ? 0.3 : 1);
    // ambience is world sound: follows the SFX slider, silent while paused
    const a = this.paused ? 0 : this.sfxVol * AMB_BASE;
    const s = this.sfxVol * SFX_BASE;
    const tc = immediate ? 0.001 : 0.04;
    for (const [bus, v] of [[this.musicBus, m], [this.ambBus, a], [this.sfxBus, s]] as const) {
      bus.gain.cancelScheduledValues(now);
      bus.gain.setTargetAtTime(v, now, tc);
    }
  }

  // ------------------------------------------------------------------ music

  setMusic(track: MusicTrack): void {
    try {
      if (!(track in TRACKS)) return;
      this.desiredTrack = track;
      if (track === this.currentTrack) return;
      if (!this.ready()) return; // will start on unlock
      this.switchTrack(track);
    } catch {
      /* ignore */
    }
  }

  private switchTrack(track: MusicTrack): void {
    const ctx = this.ready();
    if (!ctx || !this.nz || !this.musicBus || !this.ambBus) return;
    const first = this.currentTrack === null;
    this.currentTrack = track;
    const fade = first ? 0.8 : CROSSFADE;
    if (this.track) this.track.fadeOut(fade);
    this.track = new TrackPlayer(ctx, this.nz, TRACKS[track], this.musicBus, fade);
    const area = AREAS.includes(track) ? (track as AreaId) : null;
    if (this.ambience?.area !== area) {
      this.ambience?.fadeOut(fade);
      this.ambience = area ? new AmbiencePlayer(ctx, this.nz, area, this.ambBus, fade) : null;
    }
  }

  // ------------------------------------------------------------------ spatial

  update(_dt: number, listener: Vec3Like, yaw: number): void {
    try {
      this.listener = { x: listener.x, y: listener.y, z: listener.z };
      this.yaw = Number.isFinite(yaw) ? yaw : 0;
      const ctx = this.ready();
      if (!ctx) return;
      const now = ctx.currentTime;
      for (const l of this.loops.values()) {
        if (!l.pos) continue;
        const sp = this.spatial(l.pos);
        l.gain.gain.setTargetAtTime(sp.gain, now, 0.06);
        l.pan?.pan.setTargetAtTime(sp.pan, now, 0.06);
      }
    } catch {
      /* ignore */
    }
  }

  private spatial(pos: Vec3Like): { gain: number; pan: number } {
    const dx = pos.x - this.listener.x;
    const dy = pos.y - this.listener.y;
    const dz = pos.z - this.listener.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (!Number.isFinite(d)) return { gain: 1, pan: 0 };
    let gain = 1;
    if (d > REF_DIST) {
      const k = Math.max(0, 1 - (d - REF_DIST) / (MAX_DIST - REF_DIST));
      gain = k * k;
    }
    // yaw 0 looks toward -Z, so the listener's right is +X
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    const pan = d < 0.4 ? 0 : Math.max(-1, Math.min(1, (dx * rx + dz * rz) / Math.max(d, 1))) * 0.85;
    return { gain, pan };
  }

  /** Per-call output chain: gain -> (panner) -> bus. Disconnected after `life` seconds. */
  private makeOut(ctx: AudioContext, bus: AudioNode, gain: number, pan: number): { node: GainNode; release: (life: number) => void } {
    const g = ctx.createGain();
    g.gain.value = gain;
    let p: StereoPannerNode | null = null;
    if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
      p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      p.connect(bus);
    } else {
      g.connect(bus);
    }
    return {
      node: g,
      release: (life) => {
        setTimeout(() => {
          try { g.disconnect(); p?.disconnect(); } catch { /* ignore */ }
        }, (life + 0.6) * 1000);
      },
    };
  }

  private beginVoice(pos: Vec3Like | undefined, volume: number): { ctx: AudioContext; voice: Voice; finish: (dur: number) => void } | null {
    const ctx = this.ready();
    if (!ctx || !this.nz || !this.sfxBus || ctx.state !== 'running') return null;
    const now = ctx.currentTime;
    this.voiceEnds = this.voiceEnds.filter((t) => t > now);
    if (this.voiceEnds.length >= MAX_VOICES) return null;
    const sp = pos ? this.spatial(pos) : { gain: 1, pan: 0 };
    const g = sp.gain * clamp01(volume);
    if (g <= 0.002) return null;
    const out = this.makeOut(ctx, this.sfxBus, g, sp.pan);
    const voice: Voice = { ctx, nz: this.nz, out: out.node, t: now + 0.005, p: 1, v: 1 };
    return {
      ctx,
      voice,
      finish: (dur) => {
        const d = Number.isFinite(dur) ? Math.max(0.05, dur) : 1;
        this.voiceEnds.push(now + d);
        out.release(d);
      },
    };
  }

  // ------------------------------------------------------------------ one-shots

  play(name: SfxName, opts?: { pitch?: number; volume?: number; pos?: Vec3Like }): void {
    try {
      const fn = SFX[name];
      if (!fn) return;
      const v = this.beginVoice(opts?.pos, (opts?.volume ?? 1) * (TRIM[name] ?? 1));
      if (!v) return;
      const pitch = (opts?.pitch ?? 1) * (1 + (Math.random() - 0.5) * 0.08);
      v.voice.p = Number.isFinite(pitch) && pitch > 0 ? pitch : 1;
      v.finish(fn(v.voice));
    } catch {
      /* ignore */
    }
  }

  footstep(kind: CharacterKind, pos?: Vec3Like): void {
    try {
      const fn = FOOTSTEPS[kind] ?? FOOTSTEPS.civilian;
      const v = this.beginVoice(pos, 0.9);
      if (!v) return;
      v.voice.p = 1 + (Math.random() - 0.5) * 0.12;
      v.finish(fn(v.voice));
    } catch {
      /* ignore */
    }
  }

  voice(kind: CharacterKind, syllables: number, pitch = 1, pos?: Vec3Like): void {
    try {
      const v = this.beginVoice(pos, 1);
      if (!v) return;
      const p = Number.isFinite(pitch) ? Math.max(0.3, Math.min(3, pitch)) : 1;
      v.finish(voiceBlips(v.voice, kind, Number.isFinite(syllables) ? syllables : 3, p));
    } catch {
      /* ignore */
    }
  }

  // ------------------------------------------------------------------ loops

  startLoop(id: LoopId, pos?: Vec3Like): void {
    try {
      if (this.loops.has(id)) {
        if (pos) this.setLoopPosition(id, pos);
        return;
      }
      const ctx = this.ready();
      if (!ctx || !this.nz || !this.sfxBus) {
        if (!this.disposed) this.pendingLoops.set(id, pos ? { x: pos.x, y: pos.y, z: pos.z } : undefined);
        return;
      }
      const inst = createLoop(id, ctx, this.nz);
      const gain = ctx.createGain();
      let pan: StereoPannerNode | null = null;
      const sp = pos ? this.spatial(pos) : { gain: 1, pan: 0 };
      gain.gain.value = sp.gain;
      inst.out.connect(gain);
      if (pos && typeof ctx.createStereoPanner === 'function') {
        pan = ctx.createStereoPanner();
        pan.pan.value = sp.pan;
        gain.connect(pan);
        pan.connect(this.sfxBus);
      } else {
        gain.connect(this.sfxBus);
      }
      this.loops.set(id, { inst, gain, pan, pos: pos ? { x: pos.x, y: pos.y, z: pos.z } : null });
    } catch {
      /* ignore */
    }
  }

  setLoopPosition(id: LoopId, pos: Vec3Like): void {
    try {
      const l = this.loops.get(id);
      if (!l) {
        if (this.pendingLoops.has(id)) this.pendingLoops.set(id, { x: pos.x, y: pos.y, z: pos.z });
        return;
      }
      if (l.pos) {
        l.pos.x = pos.x; l.pos.y = pos.y; l.pos.z = pos.z;
      } else {
        l.pos = { x: pos.x, y: pos.y, z: pos.z }; // gain follows; pan stays centred for loops started unpositioned
      }
    } catch {
      /* ignore */
    }
  }

  stopLoop(id: LoopId): void {
    try {
      this.pendingLoops.delete(id);
      const l = this.loops.get(id);
      if (!l) return;
      this.loops.delete(id);
      l.inst.stop();
      setTimeout(() => {
        try { l.gain.disconnect(); l.pan?.disconnect(); } catch { /* ignore */ }
      }, 700);
    } catch {
      /* ignore */
    }
  }
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}
