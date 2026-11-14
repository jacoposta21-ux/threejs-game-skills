import type { RacerProfile } from '../ai/SnailAI';
import { FINISH_S, SECTIONS } from '../world/Track';

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
}

export function ordinal(n: number): string {
  return n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
}

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

export interface HudState {
  rank: number;
  time: number;
  speedKmh: number;
  slime: number;
  sliding: boolean;
  boost: number;
  boosting: boolean;
  mode: string;
  distance: number;
  /** Track position per racer, world units. */
  progress: number[];
  order: number[];
  sectionIndex: number;
  offTrack: boolean;
}

const GAUGE_LEN = 227;
type ToastKind = 'good' | 'great' | 'bad' | 'info';

/** DOM HUD. Reads game state; owns no rules. Only touches the DOM when a value actually changes. */
export class Hud {
  private readonly root = el('hud');
  private readonly posBadge = el('pos-badge');
  private readonly posNum = el('pos-num');
  private readonly posSuffix = el('pos-suffix');
  private readonly time = el('race-time');
  private readonly standings = el('standings');
  private readonly section = el('section-name');
  private readonly dist = el('dist-value');
  private readonly track = el('progress-track');
  private readonly done = el('progress-done');
  private readonly speedo = el('speedo');
  private readonly speed = el('speed-value');
  private readonly gauge = el('gauge-fill');
  private readonly modeChip = el('mode-chip');
  private readonly slimeMeter = el('slime-meter');
  private readonly slimeFill = el('slime-fill');
  private readonly boostMeter = el('boost-meter');
  private readonly boostFill = el('boost-fill');
  private readonly count = el('countdown');
  private readonly toasts = el('toasts');
  private readonly hintEl = el('hint');
  private readonly offtrack = el('offtrack');
  private readonly vignette = el('vignette');
  private readonly dots: HTMLElement[] = [];
  private readonly rows: HTMLElement[] = [];
  private last: Record<string, string | number | boolean> = {};
  private hintText = '';

  constructor(private readonly profiles: RacerProfile[]) {
    profiles.forEach((p, i) => {
      const dot = document.createElement('i');
      dot.className = `progress-dot${i === 0 ? ' me' : ''}`;
      dot.style.background = hex(p.shell);
      this.track.appendChild(dot);
      this.dots.push(dot);
      const row = document.createElement('li');
      row.innerHTML = `<span></span><i style="background:${hex(p.shell)}"></i><em></em>`;
      (row.lastElementChild as HTMLElement).style.fontStyle = 'normal';
      this.standings.appendChild(row);
      this.rows.push(row);
    });
    for (const sec of SECTIONS.slice(1)) {
      const tick = document.createElement('i');
      tick.className = 'progress-tick';
      tick.style.left = `${(sec.s0 / FINISH_S) * 100}%`;
      this.track.appendChild(tick);
    }
  }

  show(visible: boolean): void {
    this.root.classList.toggle('hidden', !visible);
    if (!visible) this.vignette.style.opacity = '0';
  }

  reset(): void {
    this.last = {};
    this.toasts.replaceChildren();
    this.count.classList.add('hidden');
    this.hint(null);
    this.offtrack.classList.add('hidden');
    this.slimeMeter.classList.remove('empty', 'using');
    this.boostMeter.classList.remove('ready');
  }

  private set(key: string, value: string | number | boolean): boolean {
    if (this.last[key] === value) return false;
    this.last[key] = value;
    return true;
  }

  update(s: HudState): void {
    if (this.set('rank', s.rank)) {
      this.posNum.textContent = String(s.rank);
      this.posSuffix.textContent = ordinal(s.rank);
      this.posBadge.classList.toggle('first', s.rank === 1);
      this.posBadge.classList.remove('pop');
      void this.posBadge.offsetWidth;
      this.posBadge.classList.add('pop');
    }
    const t = formatTime(s.time);
    if (this.set('time', t)) this.time.textContent = t;

    const kmh = Math.round(s.speedKmh);
    if (this.set('kmh', kmh)) {
      this.speed.textContent = String(kmh);
      this.gauge.style.strokeDashoffset = String(GAUGE_LEN * (1 - Math.min(1, kmh / 200)));
    }
    if (this.set('fast', kmh > 120)) this.speedo.classList.toggle('fast', kmh > 120);
    if (this.set('mode', s.mode)) {
      this.modeChip.textContent = s.mode.toUpperCase();
      this.modeChip.className = `mode-${s.mode}`;
    }
    const slime = Math.round(s.slime * 100);
    if (this.set('slime', slime)) this.slimeFill.style.transform = `scaleX(${slime / 100})`;
    if (this.set('sliding', s.sliding)) this.slimeMeter.classList.toggle('using', s.sliding);
    if (this.set('slimeEmpty', slime < 4)) this.slimeMeter.classList.toggle('empty', slime < 4);
    const boost = Math.round(s.boost * 100);
    if (this.set('boost', boost)) this.boostFill.style.transform = `scaleX(${boost / 100})`;
    if (this.set('boostReady', boost >= 100)) this.boostMeter.classList.toggle('ready', boost >= 100);

    const dist = Math.round(s.distance);
    if (this.set('dist', dist)) this.dist.textContent = String(dist);
    if (this.set('section', s.sectionIndex)) this.section.textContent = SECTIONS[s.sectionIndex]?.name ?? '';
    const pct = Math.round(Math.min(1, s.progress[0] / FINISH_S) * 1000) / 10;
    if (this.set('pct', pct)) this.done.style.width = `${pct}%`;
    for (let i = 0; i < this.dots.length; i += 1) {
      const p = Math.round(Math.min(1, Math.max(0, s.progress[i] / FINISH_S)) * 500) / 5;
      if (this.set(`dot${i}`, p)) this.dots[i].style.left = `${p}%`;
    }
    const orderKey = s.order.join('');
    if (this.set('order', orderKey)) {
      s.order.forEach((racer, place) => {
        const row = this.rows[place];
        row.className = racer === 0 ? 'me' : '';
        (row.children[0] as HTMLElement).textContent = String(place + 1);
        (row.children[1] as HTMLElement).style.background = hex(this.profiles[racer].shell);
        (row.children[2] as HTMLElement).textContent = this.profiles[racer].name;
      });
    }
    if (this.set('off', s.offTrack)) this.offtrack.classList.toggle('hidden', !s.offTrack);

    // Speed vignette: a soft white rush at the edges, no blur pass needed.
    const v = Math.round(Math.max(0, Math.min(1, (kmh - 70) / 110)) * 20) / 20 + (s.boosting ? 0.25 : 0);
    if (this.set('vig', v)) this.vignette.style.opacity = String(Math.min(0.9, v));
  }

  countdown(text: string, go = false): void {
    this.count.textContent = text;
    this.count.classList.remove('hidden');
    this.count.classList.toggle('go', go);
    // Restart the CSS animation.
    this.count.style.animation = 'none';
    void this.count.offsetWidth;
    this.count.style.animation = '';
  }

  toast(text: string, kind: ToastKind = 'good', sub = ''): void {
    const node = document.createElement('div');
    node.className = `toast ${kind}`;
    node.textContent = text;
    if (sub) {
      const small = document.createElement('small');
      small.textContent = sub;
      node.appendChild(small);
    }
    this.toasts.appendChild(node);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild?.remove();
    window.setTimeout(() => node.remove(), 1700);
  }

  hint(html: string | null): void {
    const text = html ?? '';
    if (text === this.hintText) return;
    this.hintText = text;
    this.hintEl.classList.toggle('hidden', !text);
    if (text) {
      this.hintEl.innerHTML = text;
      this.hintEl.style.animation = 'none';
      void this.hintEl.offsetWidth;
      this.hintEl.style.animation = '';
    }
  }
}
