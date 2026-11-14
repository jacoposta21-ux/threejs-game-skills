import type { RacerProfile } from '../ai/SnailAI';
import type { ItemKind } from '../physics/RacerBody';
import { ITEM_NAMES } from '../racing/Items';
import { FINISH_S, SECTIONS } from '../world/Track';

/** Inline icons for the item slot. */
export const ITEM_ICONS: Record<ItemKind, string> = {
  mushroom:
    '<svg viewBox="0 0 64 64"><path d="M22 36h20l-2 18a4 4 0 0 1-4 4h-8a4 4 0 0 1-4-4z" fill="#fff3dc" stroke="#23331a" stroke-width="3"/><path d="M6 36C6 18 18 8 32 8s26 10 26 28z" fill="#e5382e" stroke="#23331a" stroke-width="3" stroke-linejoin="round"/><circle cx="22" cy="22" r="5" fill="#fff"/><circle cx="40" cy="18" r="4" fill="#fff"/><circle cx="46" cy="30" r="3.5" fill="#fff"/><circle cx="28" cy="46" r="2" fill="#23331a"/><circle cx="36" cy="46" r="2" fill="#23331a"/></svg>',
  banana:
    '<svg viewBox="0 0 64 64"><path d="M30 30C18 34 10 46 8 56c8-6 16-10 24-12z" fill="#ffe04a" stroke="#23331a" stroke-width="3" stroke-linejoin="round"/><path d="M34 30c12 4 20 16 22 26-8-6-16-10-24-12z" fill="#f7d43a" stroke="#23331a" stroke-width="3" stroke-linejoin="round"/><path d="M26 32c0-12 4-20 6-24 2 4 6 12 6 24-4 4-8 4-12 0z" fill="#fff2b0" stroke="#23331a" stroke-width="3" stroke-linejoin="round"/><path d="M29 8h6l-1-5h-4z" fill="#6b4a2e" stroke="#23331a" stroke-width="2"/></svg>',
  acorn:
    '<svg viewBox="0 0 64 64"><path d="M14 30h36c0 16-8 28-18 28S14 46 14 30z" fill="#d08a44" stroke="#23331a" stroke-width="3"/><path d="M10 30c0-10 10-16 22-16s22 6 22 16z" fill="#7a5232" stroke="#23331a" stroke-width="3" stroke-linejoin="round"/><path d="M32 14l2-8" stroke="#23331a" stroke-width="4" stroke-linecap="round"/><path d="M18 24h28M22 19h20" stroke="#5a3a20" stroke-width="2"/></svg>',
  slime:
    '<svg viewBox="0 0 64 64"><path d="M32 6c10 14 18 22 18 34a18 18 0 0 1-36 0C14 28 22 20 32 6z" fill="#9cf05a" stroke="#23331a" stroke-width="3" stroke-linejoin="round"/><path d="M24 40a8 8 0 0 0 8 8" stroke="#fff" stroke-width="4" stroke-linecap="round" fill="none"/><path d="M44 8l3 6 6 3-6 3-3 6-3-6-6-3 6-3z" fill="#fff07a" stroke="#23331a" stroke-width="2"/></svg>',
  shield:
    '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="#bfe8ff" stroke="#23331a" stroke-width="3"/><path d="M32 32m-14 0a14 14 0 1 0 28 0a10 10 0 1 0-20 0a6 6 0 1 0 12 0" fill="none" stroke="#3a7fd0" stroke-width="4" stroke-linecap="round"/><path d="M18 20a18 18 0 0 1 12-8" stroke="#fff" stroke-width="4" stroke-linecap="round" fill="none"/></svg>',
};
const ROULETTE_ORDER: ItemKind[] = ['mushroom', 'banana', 'acorn', 'slime', 'shield'];

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
  item: ItemKind | null;
  rolling: boolean;
  itemsEnabled: boolean;
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
  private readonly itemSlot = el('item-slot');
  private readonly itemIcon = el('item-icon');
  private readonly itemName = el('item-name');
  private readonly ticks: HTMLElement[] = [];
  private rouletteTick = 0;
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
    this.setTrack();
  }

  /** Rebuild the section ticks for the current course. */
  setTrack(): void {
    for (const t of this.ticks) t.remove();
    this.ticks.length = 0;
    for (const sec of SECTIONS.slice(1)) {
      if (sec.s0 >= FINISH_S) continue;
      const tick = document.createElement('i');
      tick.className = 'progress-tick';
      tick.style.left = `${(sec.s0 / FINISH_S) * 100}%`;
      this.track.appendChild(tick);
      this.ticks.push(tick);
    }
  }

  /** Repaint the player's colour dots after a garage change. */
  refreshColors(): void {
    this.dots.forEach((dot, i) => (dot.style.background = hex(this.profiles[i].shell)));
    this.last.order = '';
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
    if (this.set('itemsOn', s.itemsEnabled)) this.itemSlot.classList.toggle('hidden', !s.itemsEnabled);
    if (s.rolling) {
      this.rouletteTick += 1;
      const k = ROULETTE_ORDER[Math.floor(this.rouletteTick / 4) % ROULETTE_ORDER.length];
      if (this.set('itemShow', `r${k}`)) this.itemIcon.innerHTML = ITEM_ICONS[k];
    } else if (this.set('itemShow', s.item ?? '')) {
      this.itemIcon.innerHTML = s.item ? ITEM_ICONS[s.item] : '';
      this.itemName.textContent = s.item ? ITEM_NAMES[s.item] : '';
    }
    if (this.set('itemState', s.rolling ? 'rolling' : s.item ? 'ready' : 'empty')) {
      this.itemSlot.classList.toggle('rolling', s.rolling);
      this.itemSlot.classList.toggle('ready', !s.rolling && !!s.item);
      this.itemSlot.classList.toggle('empty', !s.rolling && !s.item);
      if (s.rolling) this.itemName.textContent = '';
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
