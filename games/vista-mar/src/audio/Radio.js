// Car radio: four procedural stations synthesised live with Web Audio (no audio
// files). A step sequencer schedules drums, bass, chords, arpeggios and a
// generated lead a fraction of a second ahead of the audio clock, so the music
// keeps perfect time whatever the frame rate is doing.

const hz = (m) => 440 * 2 ** ((m - 69) / 12);
const MIN = [0, 3, 7], MAJ = [0, 4, 7], MIN7 = [0, 3, 7, 10], MAJ7 = [0, 4, 7, 11], DOM7 = [0, 4, 7, 10];

// One chord per bar. Roots are MIDI notes in the bass octave.
export const STATIONS = [
  {
    id: 'neon', name: 'NEON 88.1', tag: 'Synthwave', bpm: 104, swing: 0,
    prog: [[45, MIN], [45, MIN], [41, MAJ], [41, MAJ], [48, MAJ], [48, MAJ], [43, MAJ], [43, MAJ]],
    scale: [0, 3, 5, 7, 10], key: 69,
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', open: '..............x.',
    bass: 'x.xxx.xxx.xxx.xx', bassOct: '0.0100100.010010',
    arp: 'x.x.x.x.x.x.x.x.', pad: 1, lead: 'saw', stab: '',
  },
  {
    id: 'coast', name: 'COAST FM 98.5', tag: 'Disco funk', bpm: 116, swing: 0.08,
    prog: [[50, MIN7], [43, DOM7], [48, MAJ7], [45, MIN7]],
    scale: [0, 2, 3, 5, 7, 9, 10], key: 62,
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', open: '..x...x...x...x.', clap: true,
    bass: 'x..x..x.x.x..xx.', bassOct: '0..1..0.0.1..01.',
    arp: '', pad: 0, lead: 'square', stab: '..x..x....x..x..',
  },
  {
    id: 'sunset', name: 'SUNSET LOUNGE 101.2', tag: 'Chill', bpm: 84, swing: 0.16,
    prog: [[41, MAJ7], [40, MIN7], [38, MIN7], [36, MAJ7]],
    scale: [0, 2, 4, 7, 9], key: 60,
    kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', open: '', soft: true,
    bass: 'x.......x..x....', bassOct: '0.......0..0....',
    arp: 'x..x..x...x..x..', pad: 1, lead: 'sine', stab: '',
  },
  {
    id: 'tropical', name: 'RADIO TROPICAL 94.7', tag: 'Latin', bpm: 98, swing: 0,
    prog: [[45, MIN], [50, MIN], [40, DOM7], [45, MIN]],
    scale: [0, 2, 3, 5, 7, 8, 11], key: 69,
    kick: 'x......x..x.....', snare: '', hat: 'x.xxx.xxx.xxx.xx', open: '', clave: 'x..x..x...x.x...', conga: '..x...xx..x...xx',
    bass: '...x..x....x..x.', bassOct: '...0..1....0..1.',
    arp: 'x.xx.x.xx.x.xx.x', pad: 0, lead: 'triangle', stab: '',
  },
];

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export class Radio {
  constructor(audio) {
    this.audio = audio;
    this.index = -1; // -1 = off
    this.volume = 0.6;
    this.timer = null;
    this.melodies = {};
  }

  get station() { return this.index >= 0 ? STATIONS[this.index] : null; }
  get label() { const s = this.station; return s ? `${s.name} · ${s.tag}` : 'RADIO OFF'; }

  ensure() {
    const c = this.audio.ctx;
    if (!c || this.bus) return !!this.bus;
    this.bus = c.createGain();
    this.bus.gain.value = 0;
    // a touch of "car speaker": gentle low-pass, plus a tempo echo for leads and arps
    this.tone = c.createBiquadFilter(); this.tone.type = 'lowpass'; this.tone.frequency.value = 7200;
    this.echo = c.createDelay(1.5);
    this.echoFb = c.createGain(); this.echoFb.gain.value = 0.32;
    this.echoOut = c.createGain(); this.echoOut.gain.value = 0.28;
    this.echo.connect(this.echoFb).connect(this.echo);
    this.echo.connect(this.echoOut).connect(this.bus);
    this.bus.connect(this.tone).connect(this.audio.master);
    return true;
  }

  setVolume(v) {
    this.volume = v;
    if (this.bus && this.index >= 0) this.bus.gain.setTargetAtTime(v * 0.55, this.audio.ctx.currentTime, 0.05);
  }

  /** Tune to station i (-1 = off). */
  tune(i) {
    if (!this.audio.ctx) { this.index = i; return; }
    this.ensure();
    const c = this.audio.ctx, t = c.currentTime;
    this.index = i;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setTargetAtTime(0, t, 0.03);
    clearInterval(this.timer);
    this.timer = null;
    if (i < 0) return;
    const st = STATIONS[i];
    this.stepDur = 60 / st.bpm / 4;
    this.echo.delayTime.setValueAtTime(this.stepDur * 3, t);
    // stations keep "broadcasting": the position in the song comes from the clock
    this.step = Math.ceil((t + 0.12) / this.stepDur);
    this.nextTime = this.step * this.stepDur;
    this.bus.gain.setTargetAtTime(this.volume * 0.55, t + 0.1, 0.12);
    this.audio.burst({ freq: 3200, q: 0.4, dur: 0.16, gain: 0.05 }); // tuning hiss
    this.timer = setInterval(() => this.pump(), 50);
  }

  next(dir = 1) {
    const n = STATIONS.length + 1;
    const cur = this.index + 1;
    this.tune(((cur + dir + n) % n) - 1);
    return this.label;
  }

  stop() { if (this.index >= 0 || this.timer) { const keep = this.index; this.tune(-1); this.last = keep; } }

  pump() {
    const c = this.audio.ctx, st = this.station;
    if (!c || !st || c.state !== 'running') return;
    const now = c.currentTime;
    if (this.nextTime < now - 0.2) { this.step = Math.ceil((now + 0.05) / this.stepDur); this.nextTime = this.step * this.stepDur; }
    while (this.nextTime < now + 0.3) {
      this.schedule(st, this.step, this.nextTime);
      this.step++;
      this.nextTime += this.stepDur;
    }
  }

  // ------------------------------------------------------------ sequencing
  schedule(st, step, t0) {
    const s = step % 16, bar = Math.floor(step / 16);
    const t = t0 + (s % 2 ? st.swing * this.stepDur : 0);
    const chord = st.prog[bar % st.prog.length];
    const section = Math.floor(bar / 8) % 4; // 0 groove, 1 + lead, 2 breakdown, 3 + lead
    const drums = section !== 2 || bar % 8 >= 6;
    const on = (p) => p && p[s] === 'x';
    const d = this.stepDur;

    if (drums) {
      if (on(st.kick)) this.kick(t, st.soft ? 0.5 : 0.85);
      if (on(st.snare)) { this.snare(t, st.soft ? 0.25 : 0.5); if (st.clap) this.clap(t); }
      if (on(st.hat)) this.hat(t, on(st.open) ? 0.16 : 0.035, st.soft ? 0.05 : 0.09);
      if (on(st.clave)) this.click(t, 2100, 0.16);
      if (on(st.conga)) this.conga(t, s % 4 === 3 ? 196 : 262);
      // fill into the next section
      if (bar % 8 === 7 && s >= 12 && st.snare) this.snare(t, 0.2 + (s - 12) * 0.07);
    }
    if (on(st.bass)) {
      const oct = st.bassOct[s] === '1' ? 12 : 0;
      this.bass(t, chord[0] - 12 + oct, d * (st.id === 'neon' ? 0.9 : 1.6), st.id === 'sunset');
    }
    if (st.pad && s === 0) this.pad(t, chord[1].map((iv) => chord[0] + 12 + iv), d * 16, section === 2 ? 0.055 : 0.04);
    if (on(st.stab)) this.stab(t, chord[1].map((iv) => chord[0] + 24 + iv), d * 0.9);
    if (on(st.arp) && (section !== 0 || st.id !== 'neon' || bar % 8 >= 4)) {
      const tones = chord[1];
      const k = st.id === 'tropical' ? [0, 2, 1, 2][Math.floor(s / 2) % 4] : (Math.floor(s / 2) + bar) % (tones.length + 1);
      const iv = k >= tones.length ? 12 : tones[k % tones.length];
      this.pluck(t, chord[0] + 24 + iv, d * 1.4, st.id === 'sunset' ? 'sine' : st.id === 'tropical' ? 'triangle' : 'sawtooth', st.id === 'tropical' ? 0.05 : 0.035);
      if (st.id === 'tropical') this.pluck(t, chord[0] + 36 + iv, d * 1.2, 'triangle', 0.03);
    }
    if (section % 2 === 1) {
      const n = this.melody(st, Math.floor(bar / 8))[(bar % 4) * 16 + s];
      if (n) this.lead(t, n.m, d * n.len, st.lead);
    }
  }

  /** A four-bar phrase generated once per (station, section) from the scale. */
  melody(st, sectionIndex) {
    const key = `${st.id}:${sectionIndex % 6}`;
    if (this.melodies[key]) return this.melodies[key];
    const r = rng(st.bpm * 977 + (sectionIndex % 6) * 131 + 7);
    const out = new Array(64).fill(null);
    let deg = 2 + Math.floor(r() * 3);
    const motif = [];
    for (let s = 0; s < 16;) {
      const len = r() < 0.5 ? 2 : r() < 0.6 ? 4 : 3;
      if (r() < 0.78) { deg = Math.max(0, Math.min(9, deg + Math.round((r() - 0.5) * 4))); motif.push({ s, deg, len }); }
      s += len;
    }
    for (let barI = 0; barI < 4; barI++) {
      const shift = barI === 2 ? 1 : barI === 3 ? -1 : 0; // A A B A' contour
      for (const n of motif) {
        if (barI === 3 && n.s > 10) continue; // leave air before the phrase repeats
        const dg = Math.max(0, n.deg + shift);
        const m = st.key + st.scale[dg % st.scale.length] + 12 * Math.floor(dg / st.scale.length);
        out[barI * 16 + n.s] = { m, len: n.len };
      }
    }
    this.melodies[key] = out;
    return out;
  }

  // ------------------------------------------------------------ voices
  env(t, a, peak, dur) {
    const g = this.audio.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return g;
  }

  osc(type, f, t, dur, detune = 0) {
    const o = this.audio.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }

  noise(t, dur) {
    const s = this.audio.ctx.createBufferSource();
    s.buffer = this.audio.noise;
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02);
    return s;
  }

  filter(type, f, q = 0.7) {
    const b = this.audio.ctx.createBiquadFilter();
    b.type = type; b.frequency.value = f; b.Q.value = q;
    return b;
  }

  kick(t, gain) {
    const o = this.osc('sine', 150, t, 0.3);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    o.connect(this.env(t, 0.002, gain, 0.3)).connect(this.bus);
  }

  snare(t, gain) {
    this.noise(t, 0.2).connect(this.filter('bandpass', 1900, 0.6)).connect(this.env(t, 0.002, gain, 0.2)).connect(this.bus);
    const o = this.osc('triangle', 190, t, 0.1);
    o.connect(this.env(t, 0.002, gain * 0.5, 0.1)).connect(this.bus);
  }

  clap(t) {
    for (const dt of [0, 0.012, 0.026]) this.noise(t + dt, 0.09).connect(this.filter('bandpass', 1300, 1.2)).connect(this.env(t + dt, 0.001, 0.22, 0.09)).connect(this.bus);
  }

  hat(t, dur, gain) {
    this.noise(t, dur).connect(this.filter('highpass', 7500)).connect(this.env(t, 0.001, gain, dur)).connect(this.bus);
  }

  click(t, f, gain) {
    this.osc('square', f, t, 0.035).connect(this.filter('bandpass', f, 6)).connect(this.env(t, 0.001, gain, 0.035)).connect(this.bus);
  }

  conga(t, f) {
    const o = this.osc('sine', f * 1.25, t, 0.16);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
    o.connect(this.env(t, 0.002, 0.2, 0.16)).connect(this.bus);
  }

  bass(t, m, dur, soft) {
    const f = this.filter('lowpass', soft ? 420 : 300, 4);
    if (!soft) { f.frequency.setValueAtTime(1300, t); f.frequency.exponentialRampToValueAtTime(240, t + Math.min(dur, 0.22)); }
    const g = this.env(t, 0.004, soft ? 0.3 : 0.24, dur);
    this.osc(soft ? 'triangle' : 'sawtooth', hz(m), t, dur).connect(f);
    this.osc('square', hz(m), t, dur, 6).connect(f);
    f.connect(g).connect(this.bus);
  }

  pad(t, notes, dur, gain) {
    const c = this.audio.ctx;
    const f = this.filter('lowpass', 1500, 0.5);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + dur * 0.25);
    g.gain.setValueAtTime(gain, t + dur * 0.8);
    g.gain.linearRampToValueAtTime(0.0001, t + dur * 1.04);
    for (const m of notes) { this.osc('sawtooth', hz(m), t, dur * 1.04, -7).connect(f); this.osc('sawtooth', hz(m), t, dur * 1.04, 8).connect(f); }
    f.connect(g).connect(this.bus);
  }

  stab(t, notes, dur) {
    const f = this.filter('lowpass', 2600, 1);
    const g = this.env(t, 0.004, 0.05, dur);
    for (const m of notes) this.osc('sawtooth', hz(m), t, dur).connect(f);
    f.connect(g);
    g.connect(this.bus);
  }

  pluck(t, m, dur, type, gain) {
    const f = this.filter('lowpass', 3200, 2);
    f.frequency.setValueAtTime(4200, t); f.frequency.exponentialRampToValueAtTime(900, t + dur);
    const g = this.env(t, 0.003, gain, dur);
    this.osc(type, hz(m), t, dur).connect(f).connect(g);
    g.connect(this.bus); g.connect(this.echo);
  }

  lead(t, m, dur, type) {
    const g = this.env(t, 0.012, type === 'sine' ? 0.085 : 0.05, dur * 1.1);
    const f = this.filter('lowpass', 3600, 1);
    const o = this.osc(type === 'saw' ? 'sawtooth' : type, hz(m), t, dur * 1.1);
    // a little vibrato once the note has settled
    const l = this.osc('sine', 5.5, t, dur * 1.1);
    const lg = this.audio.ctx.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(hz(m) * 0.008, t + dur * 0.6);
    l.connect(lg).connect(o.frequency);
    o.connect(f).connect(g);
    if (type === 'saw') this.osc('sawtooth', hz(m), t, dur * 1.1, 11).connect(f);
    g.connect(this.bus); g.connect(this.echo);
  }
}
