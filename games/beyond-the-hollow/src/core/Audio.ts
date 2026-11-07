/**
 * Sample-based audio: recorded CC0 sound effects and music tracks (see public/audio-credits.md).
 *
 * - SFX are small mp3 clips decoded into AudioBuffers once, after the first user gesture.
 *   Each name can have several variants; one is picked at random with a little pitch jitter.
 * - Music streams through two <audio> elements ("decks") routed into WebAudio, so a theme
 *   change is a crossfade and a long track never has to be decoded into memory.
 * - Files are loaded lazily: nothing is fetched before the player first interacts.
 */
type Theme = 'menu' | 'station' | 'forest' | 'caverns' | 'ocean' | 'heart' | 'boss' | 'ending' | 'ice' | 'foundry' | 'ruins' | 'boss2' | 'keepers' | 'abyss' | 'boss3' | 'seed' | 'boss4' | 'finale';

const sfxUrls = import.meta.glob('../assets/audio/sfx/*.mp3', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const musicUrls = import.meta.glob('../assets/audio/music/*.mp3', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const base = (p: string) => p.slice(p.lastIndexOf('/') + 1).replace(/\.mp3$/, '');

/** sound name -> variant urls (step1.mp3, step2.mp3 ... -> "step") */
const SFX: Record<string, string[]> = {};
for (const [path, url] of Object.entries(sfxUrls)) {
  const name = base(path).replace(/\d+$/, '');
  (SFX[name] ||= []).push(url);
}
const MUSIC: Record<string, string> = {};
for (const [path, url] of Object.entries(musicUrls)) MUSIC[base(path)] = url;

/** per-sound playback volume (clips are peak-normalised) */
const VOL: Record<string, number> = {
  step: 0.16, jump: 0.28, djump: 0.32, land: 0.32, shoot: 0.4, chargeShot: 0.55, chargeReady: 0.35,
  hit: 0.42, enemyHit: 0.4, enemyDie: 0.45, hurt: 0.5, death: 0.55, pip: 0.32, pipCommand: 0.36,
  mechanism: 0.45, door: 0.55, plate: 0.4, checkpoint: 0.45, pickup: 0.4, lore: 0.45, splash: 0.45,
  splashOut: 0.3, bubble: 0.2, bounce: 0.5, spark: 0.22, spore: 0.28, rock: 0.55, crack: 0.45,
  crumble: 0.5, burrow: 0.45, crawler: 0.3, stalker: 0.4, roar: 0.65, slam: 0.75, warn: 0.32,
  core: 0.5, ui: 0.32, uiSelect: 0.4, reveal: 0.4, heartbeat: 0.6, wake: 0.4,
};
/** overall level into the compressor (recorded clips sit around -22 LUFS mixed) */
const MASTER = 1.4;
/** sounds that keep their exact pitch */
const NO_JITTER = new Set(['ui', 'uiSelect', 'checkpoint', 'warn', 'reveal', 'heartbeat', 'lore']);
const MIN_GAP: Record<string, number> = { step: 70, hit: 30, spark: 120, enemyHit: 40, bubble: 80, crawler: 120, stalker: 400 };

interface Deck {
  el: HTMLAudioElement;
  gain: GainNode;
  theme: Theme | null;
}

class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  music!: GainNode;
  sfx!: GainNode;
  musicVol = 0.7;
  sfxVol = 0.85;
  muted = false;
  /** the portal muted the game (its own sound switch, or an ad is playing) */
  externalMute = false;
  private buffers: Record<string, AudioBuffer[]> = {};
  private loading = false;
  private decks: Deck[] = [];
  private active = 0;
  private theme: Theme | null = null;
  private pendingTheme: Theme | null = null;
  private suspended = false;
  private lastPlayed: Record<string, number> = {};
  private chargeNode: { src: AudioBufferSourceNode; gain: GainNode } | null = null;

  /** Must be called from a user gesture (click / key / touch). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !this.suspended) this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx: AudioContext = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 3;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted || this.externalMute ? 0 : MASTER;
    this.master.connect(comp).connect(ctx.destination);
    this.music = ctx.createGain();
    this.music.gain.value = this.musicVol * 0.6;
    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.sfxVol;
    this.music.connect(this.master);
    this.sfx.connect(this.master);
    // two music decks; both are "blessed" inside this gesture so later play() calls are allowed (iOS)
    for (let i = 0; i < 2; i++) {
      const el = new Audio();
      el.loop = true;
      el.preload = 'auto';
      el.crossOrigin = 'anonymous';
      (el as any).playsInline = true;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      try {
        ctx.createMediaElementSource(el).connect(gain);
      } catch {
        /* very old browsers: deck plays outside the graph */
      }
      gain.connect(this.music);
      el.play().then(() => el.pause(), () => { /* nothing to play yet */ });
      this.decks.push({ el, gain, theme: null });
    }
    this.loadSfx();
    if (this.pendingTheme) {
      const t = this.pendingTheme;
      this.pendingTheme = null;
      this.playTheme(t);
    }
  }

  private async loadSfx() {
    if (this.loading || !this.ctx) return;
    this.loading = true;
    const ctx = this.ctx;
    // decode the most common sounds first
    const first = ['ui', 'uiSelect', 'step', 'jump', 'land', 'pip', 'shoot', 'hit', 'hurt'];
    const names = [...first.filter((n) => SFX[n]), ...Object.keys(SFX).filter((n) => !first.includes(n))];
    for (const name of names) {
      const list = await Promise.all(SFX[name].map(async (url) => {
        try {
          const data = await (await fetch(url)).arrayBuffer();
          return await new Promise<AudioBuffer>((res, rej) => ctx.decodeAudioData(data, res, rej));
        } catch {
          return null;
        }
      }));
      this.buffers[name] = list.filter((b): b is AudioBuffer => !!b);
    }
  }

  setVolumes(music: number, sfx: number) {
    this.musicVol = music;
    this.sfxVol = sfx;
    if (!this.ctx) return;
    this.music.gain.setTargetAtTime(music * 0.6, this.ctx.currentTime, 0.1);
    this.sfx.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.1);
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.applyGain();
  }
  setExternalMute(m: boolean) {
    this.externalMute = m;
    this.applyGain();
  }
  private applyGain() {
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted || this.externalMute ? 0 : MASTER, this.ctx.currentTime, 0.05);
  }

  /** Called when the tab is hidden or an ad plays. */
  suspend(s: boolean) {
    this.suspended = s;
    if (!this.ctx) return;
    if (s) {
      this.ctx.suspend();
      for (const d of this.decks) d.el.pause();
    } else {
      this.ctx.resume();
      for (const d of this.decks) if (d.theme && d.gain.gain.value > 0.001) d.el.play().catch(() => { /* */ });
    }
  }

  // ------------------------------------------------------------------ music
  playTheme(theme: Theme) {
    if (!this.ctx) {
      this.pendingTheme = theme;
      return;
    }
    if (this.theme === theme) return;
    this.theme = theme;
    const url = MUSIC[theme];
    const now = this.ctx.currentTime;
    const old = this.decks[this.active];
    this.fadeOut(old, 2.5);
    if (!url) return;
    this.active = 1 - this.active;
    const d = this.decks[this.active];
    d.theme = theme;
    d.el.src = url;
    d.el.currentTime = 0;
    d.gain.gain.cancelScheduledValues(now);
    d.gain.gain.setValueAtTime(0, now);
    d.gain.gain.linearRampToValueAtTime(1, now + 2.5);
    if (!this.suspended) d.el.play().catch(() => { /* retried on the next gesture via unlock() */ });
  }

  private fadeOut(d: Deck | undefined, secs: number) {
    if (!d || !d.theme || !this.ctx) return;
    const now = this.ctx.currentTime;
    const g = d.gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + secs);
    const theme = d.theme;
    setTimeout(() => {
      if (d.theme === theme && d !== this.decks[this.active]) {
        d.el.pause();
        d.theme = null;
      }
    }, secs * 1000 + 200);
  }

  stopMusic() {
    if (!this.ctx) return;
    this.fadeOut(this.decks[this.active], 1.5);
    this.active = 1 - this.active;
    this.theme = null;
  }

  // ------------------------------------------------------------------ sfx
  private voice(buf: AudioBuffer, vol: number, pan: number, rate: number, loop = false) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = loop;
    src.playbackRate.value = rate;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    let tail: AudioNode = gain;
    if (pan !== 0 && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      gain.connect(p);
      tail = p;
    }
    tail.connect(this.sfx);
    src.connect(gain);
    src.start();
    return { src, gain };
  }

  play(name: string, pan = 0) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const list = this.buffers[name];
    if (!list || !list.length) return;
    const now = performance.now();
    if (now - (this.lastPlayed[name] || 0) < (MIN_GAP[name] ?? 25)) return;
    this.lastPlayed[name] = now;
    const buf = list[Math.floor(Math.random() * list.length)];
    const rate = NO_JITTER.has(name) ? 1 : 0.95 + Math.random() * 0.1;
    this.voice(buf, VOL[name] ?? 0.45, pan * 0.7, rate);
  }

  startCharge() {
    if (!this.ctx || this.chargeNode) return;
    const buf = this.buffers.charge?.[0];
    if (!buf) return;
    const v = this.voice(buf, 0.0001, 0, 0.7, true);
    const t = this.ctx.currentTime;
    v.src.playbackRate.linearRampToValueAtTime(1.35, t + 0.7);
    v.gain.gain.exponentialRampToValueAtTime(0.22, t + 0.3);
    this.chargeNode = v;
  }

  stopCharge() {
    if (!this.ctx || !this.chargeNode) return;
    const { src, gain } = this.chargeNode;
    gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.03);
    src.stop(this.ctx.currentTime + 0.15);
    this.chargeNode = null;
  }
}

export const Sound = new AudioEngine();
export type { Theme };
