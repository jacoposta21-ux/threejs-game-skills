// Generated WebAudio sound effects (no files). The context is created on the first user gesture.
let ctx = null, master = null, muted = false, noiseBuf = null;
let musicGain = null, musicOn = true, musicMode = null, musicTimer = null, nextBeat = 0, beat = 0;

function ensure() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return !!ctx; }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = musicOn ? 1 : 0;
    musicGain.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  } catch { ctx = null; return false; }
}

function tone(freq, dur, { type = 'square', vol = 0.15, slide = 0, delay = 0, attack = 0.005, at = null, out = null } = {}) {
  const t0 = at !== null ? at : ctx.currentTime + delay;
  const o = ctx.createOscillator(), gn = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  gn.gain.setValueAtTime(0.0001, t0);
  gn.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(gn); gn.connect(out || master);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

function noise(dur, { freq = 1000, type = 'lowpass', vol = 0.2, delay = 0, sweep = 0 } = {}) {
  const t0 = ctx.currentTime + delay;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0);
  if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(50, freq + sweep), t0 + dur);
  const gn = ctx.createGain();
  gn.gain.setValueAtTime(vol, t0); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f); f.connect(gn); gn.connect(master);
  src.start(t0, Math.random() * 0.5); src.stop(t0 + dur + 0.02);
}

const SFX = {
  till: () => { noise(0.12, { freq: 500, vol: 0.35 }); tone(90, 0.1, { type: 'sine', vol: 0.2 }); },
  water: () => { noise(0.3, { freq: 1800, type: 'bandpass', vol: 0.25, sweep: -900 }); },
  swish: () => { noise(0.14, { freq: 3000, type: 'highpass', vol: 0.18, sweep: -2000 }); },
  plant: () => tone(500, 0.08, { type: 'sine', vol: 0.18, slide: 300 }),
  pickup: () => { tone(660, 0.07, { vol: 0.09 }); tone(990, 0.09, { vol: 0.09, delay: 0.06 }); },
  coin: () => { tone(988, 0.08, { type: 'triangle', vol: 0.2 }); tone(1319, 0.16, { type: 'triangle', vol: 0.2, delay: 0.07 }); },
  door: () => { noise(0.1, { freq: 300, vol: 0.3 }); tone(120, 0.12, { type: 'sine', vol: 0.2 }); },
  click: () => tone(800, 0.04, { vol: 0.06 }),
  error: () => tone(160, 0.15, { type: 'sawtooth', vol: 0.08, slide: -40 }),
  talk: (pitch = 1) => tone(320 * pitch * (0.9 + Math.random() * 0.2), 0.05, { vol: 0.05, type: 'square' }),
  clue: () => { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.13, delay: i * 0.07 })); },
  gnome: () => { tone(700, 0.5, { type: 'triangle', vol: 0.16, slide: -500 }); tone(350, 0.6, { type: 'triangle', vol: 0.12, slide: -250, delay: 0.15 }); },
  sleep: () => { [392, 494, 587].forEach((f, i) => tone(f, 0.9, { type: 'sine', vol: 0.1, delay: i * 0.12, attack: 0.08 })); },
  win: () => { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.16, delay: i * 0.11 })); },
  lose: () => { [392, 370, 349, 262].forEach((f, i) => tone(f, 0.35, { type: 'triangle', vol: 0.14, delay: i * 0.22 })); },
  heart: () => { tone(880, 0.1, { type: 'sine', vol: 0.12 }); tone(1175, 0.18, { type: 'sine', vol: 0.12, delay: 0.08 }); },
  charm: () => { [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 0.3, { type: 'sine', vol: 0.08, delay: i * 0.05 })); },
  caught: () => { tone(300, 0.2, { type: 'square', vol: 0.08 }); tone(220, 0.3, { type: 'square', vol: 0.08, delay: 0.15 }); },
};

// ---------------------------------------------------------------- generative music
// A gentle loop that never repeats exactly: pad chords + bass + a sparse pentatonic melody.
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const MUSIC = {
  day:   { bpm: 84, root: 60, scale: [0, 2, 4, 7, 9], chords: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]], density: 0.55, vol: 1 },
  rain:  { bpm: 72, root: 57, scale: [0, 2, 3, 7, 9], chords: [[0, 3, 7], [-4, 0, 3], [-7, -4, 0], [-2, 2, 5]], density: 0.35, vol: 0.9 },
  night: { bpm: 60, root: 57, scale: [0, 3, 5, 7, 10], chords: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -2, 2]], density: 0.3, vol: 0.8 },
  title: { bpm: 70, root: 55, scale: [0, 3, 5, 7, 10], chords: [[0, 3, 7], [1, 5, 8], [-2, 2, 5], [-5, -1, 2]], density: 0.45, vol: 0.9 },
};

function scheduleMusic() {
  if (!ctx || !musicMode) return;
  const m = MUSIC[musicMode];
  const spb = 60 / m.bpm;
  if (nextBeat < ctx.currentTime) nextBeat = ctx.currentTime + 0.05;
  while (nextBeat < ctx.currentTime + 0.6) {
    const bar = Math.floor(beat / 4) % m.chords.length, b = beat % 4;
    const chord = m.chords[bar];
    if (b === 0) {
      for (const n of chord) tone(midi(m.root + n), spb * 4.2, { type: 'sine', vol: 0.028 * m.vol, attack: 0.6, at: nextBeat, out: musicGain });
      tone(midi(m.root - 12 + chord[0]), spb * 1.8, { type: 'triangle', vol: 0.05 * m.vol, attack: 0.05, at: nextBeat, out: musicGain });
    }
    if (b === 2) tone(midi(m.root - 12 + chord[0] + 7), spb * 1.5, { type: 'triangle', vol: 0.035 * m.vol, attack: 0.05, at: nextBeat, out: musicGain });
    if (Math.random() < m.density) {
      const deg = m.scale[Math.floor(Math.random() * m.scale.length)];
      const off = Math.random() < 0.5 ? spb / 2 : 0;
      tone(midi(m.root + 12 + deg), spb * 0.9, { type: 'triangle', vol: 0.04 * m.vol, attack: 0.02, at: nextBeat + off, out: musicGain });
    }
    nextBeat += spb;
    beat++;
  }
}

export const Audio = {
  unlock() { if (ensure()) this.resumeMusic(); },
  play(name, arg) {
    if (muted || !SFX[name]) return;
    if (!ensure()) return;
    try { SFX[name](arg); } catch { /* audio must never break the game */ }
  },
  get muted() { return muted; },
  setMuted(m) {
    muted = !!m;
    if (master) master.gain.value = muted ? 0 : 0.5;
  },
  get musicOn() { return musicOn; },
  setMusic(on) {
    musicOn = !!on;
    if (musicGain) musicGain.gain.value = musicOn ? 1 : 0;
  },
  // mode: 'day' | 'rain' | 'night' | 'title' | null. Cheap to call every frame.
  music(mode) {
    if (mode === musicMode) return;
    musicMode = mode;
    if (!ctx || !mode) { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } return; }
    beat = 0; nextBeat = ctx.currentTime + 0.3;
    if (!musicTimer) musicTimer = setInterval(() => { try { scheduleMusic(); } catch { /* never break the game */ } }, 200);
  },
  // Called after the first user gesture creates the context: start whatever mode was requested.
  resumeMusic() { const m = musicMode; musicMode = null; this.music(m); },
};
