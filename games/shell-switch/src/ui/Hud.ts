import * as THREE from 'three';
import { ITEM_INFO, type ItemId } from '../gameplay/types';
import { ITEM_ICONS } from './Icons';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const v = new THREE.Vector3();

interface Bubble {
  el: HTMLDivElement;
  anchor: () => THREE.Vector3 | null;
  life: number;
  max: number;
  me: boolean;
}

/** DOM HUD. Reads game state handed to it each frame; owns no game rules. */
export class Hud {
  readonly root = $('#hud');
  private readonly layer = $('#world-layer');
  private readonly bubbles: Bubble[] = [];
  private readonly iconPool: HTMLDivElement[] = [];
  private iconUsed = 0;
  private readonly worldPrompt: HTMLDivElement;
  private readonly objective: HTMLDivElement;
  private readonly objLabel: HTMLSpanElement;
  private readonly toasts = $('#toasts');
  private readonly banner = $('#banner');
  private bannerT = 0;
  private w = 1;
  private h = 1;
  private lastTracker = '';
  private lastExtras = '';
  private lastTip: string | null = null;
  private lastInv = '';
  private lastBits = '';
  private lastCores = -1;
  private lastHost = '';
  private readonly eyeFill = $('#eye-fill');
  private readonly eye = $('#eye');
  private readonly ring = $('#action-ring');
  private readonly arc = $('#action-arc');
  private readonly actionLabel = $('#action-label');
  touch = false;

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    this.worldPrompt = document.createElement('div');
    this.worldPrompt.className = 'world-prompt hidden';
    this.worldPrompt.innerHTML = '<kbd>E</kbd><span></span>';
    this.layer.appendChild(this.worldPrompt);
    this.objective = document.createElement('div');
    this.objective.id = 'objective';
    this.objective.innerHTML = '<div class="dia"></div><span></span>';
    this.objLabel = this.objective.querySelector('span')!;
    this.layer.appendChild(this.objective);
    for (let i = 0; i < 5; i += 1) {
      const s = document.createElement('div');
      s.className = 'core-slot';
      $('#cores').appendChild(s);
    }
  }

  clearTransient(): void {
    this.toasts.innerHTML = '';
    this.banner.classList.remove('show');
    this.bannerT = 0;
    this.clearBubbles();
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }

  show(on: boolean): void {
    this.root.classList.toggle('hidden', !on);
    this.layer.classList.toggle('hidden', !on);
  }

  private project(p: THREE.Vector3): { x: number; y: number; behind: boolean } {
    v.copy(p).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.w, y: (-v.y * 0.5 + 0.5) * this.h, behind: v.z > 1 };
  }

  say(text: string, anchor: () => THREE.Vector3 | null, me = false, seconds = 2.8): void {
    // One bubble per anchor: replace instead of stacking.
    for (const b of this.bubbles) {
      if (b.anchor === anchor || b.el.textContent === text) b.life = Math.min(b.life, 0.15);
    }
    if (this.bubbles.length > 7) this.bubbles[0].life = 0;
    const el = document.createElement('div');
    el.className = `bubble${me ? ' me' : ''}`;
    el.textContent = text;
    this.layer.appendChild(el);
    this.bubbles.push({ el, anchor, life: seconds, max: seconds, me });
  }

  clearBubbles(): void {
    for (const b of this.bubbles) b.el.remove();
    this.bubbles.length = 0;
  }

  toast(html: string, tone: 'gold' | 'mint' | 'pink' | 'hint' | '' = '', seconds = 3.2): void {
    const el = document.createElement('div');
    el.className = `toast ${tone}`;
    el.innerHTML = html;
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 4) this.toasts.firstElementChild?.remove();
    window.setTimeout(() => el.classList.add('out'), seconds * 1000);
    window.setTimeout(() => el.remove(), seconds * 1000 + 350);
  }

  showBanner(title: string, sub: string, color: string): void {
    this.banner.innerHTML = `<h2 style="color:${color}">${title}</h2><p>${sub}</p>`;
    this.banner.classList.add('show');
    this.bannerT = 3;
  }

  setTrackerExtras(need: { text: string; faces: string[] } | null, hint: string | null, hintLeft: number): void {
    const key = JSON.stringify([need, hint, hintLeft]);
    if (key === this.lastExtras) return;
    this.lastExtras = key;
    const nd = $('#tracker-need');
    nd.classList.toggle('hidden', !need);
    if (need) nd.innerHTML = `${need.faces.map((f) => `<img src="${f}" alt="" />`).join('')}<span>${need.text}</span>`;
    const hd = $('#tracker-hint');
    hd.classList.toggle('hidden', !hint);
    if (hint) hd.textContent = hint;
    const btn = $('#tracker-hint-btn');
    btn.classList.toggle('hidden', hintLeft <= 0);
    btn.querySelector('span')!.textContent = hint ? 'More help' : 'Hint';
  }

  showTip(html: string | null): void {
    if (html === this.lastTip) return;
    this.lastTip = html;
    const t = $('#tip');
    t.classList.toggle('hidden', !html);
    if (html) {
      $('#tip-text').innerHTML = html;
      t.classList.remove('pop');
      void t.offsetWidth;
      t.classList.add('pop');
    }
  }

  setTracker(area: string, areaColor: string, title: string, steps: { text: string; state: 'done' | 'now' | 'todo' }[]): void {
    const key = area + title + steps.map((s) => s.state + s.text).join('|');
    if (key === this.lastTracker) return;
    this.lastTracker = key;
    $('#tracker-area').textContent = area;
    document.documentElement.style.setProperty('--area', areaColor);
    $('#tracker-title').textContent = title;
    const ol = $('#tracker-steps');
    ol.innerHTML = '';
    for (const s of steps) {
      const li = document.createElement('li');
      li.className = s.state;
      li.textContent = s.text;
      ol.appendChild(li);
    }
  }

  setHost(name: string, ability: string, img: string, color: string): void {
    const key = name + ability;
    if (key === this.lastHost) return;
    this.lastHost = key;
    $('#host-name').textContent = name;
    $('#host-ability').textContent = ability;
    const pi = $<HTMLImageElement>('#host-img');
    if (img) pi.src = img;
    const portrait = $('#host-portrait');
    portrait.style.background = color;
    portrait.classList.remove('swap');
    void portrait.offsetWidth;
    portrait.classList.add('swap');
    $('#t-ability').style.background = color;
  }

  setPrompts(e: string | null, f: string | null, canExit: boolean): void {
    const pe = $('#prompt-e');
    const pf = $('#prompt-f');
    const pq = $('#prompt-q');
    pe.querySelector('span')!.textContent = e ?? '';
    pe.classList.toggle('hidden-p', !e);
    pf.querySelector('span')!.textContent = f ?? '';
    pf.classList.toggle('hidden-p', !f);
    pq.classList.toggle('hidden-p', !canExit);
    $('#t-interact-label').textContent = e ?? 'Use';
    $('#t-interact').classList.toggle('ready', !!e);
    $('#t-ability-label').textContent = f ?? 'Ability';
    $('#t-exit').classList.toggle('hidden', !canExit);
  }

  setWorldPrompt(p: THREE.Vector3 | null, key: string, text: string, info = false): void {
    this.worldPrompt.classList.toggle('info', info);
    if (!p) {
      this.worldPrompt.classList.add('hidden');
      return;
    }
    const s = this.project(p);
    if (s.behind) {
      this.worldPrompt.classList.add('hidden');
      return;
    }
    this.worldPrompt.classList.remove('hidden');
    const kbd = this.worldPrompt.querySelector('kbd')!;
    if (kbd.textContent !== key) kbd.textContent = key;
    const span = this.worldPrompt.querySelector('span')!;
    if (span.textContent !== text) span.textContent = text;
    this.worldPrompt.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px) translate(-50%, -100%)`;
  }

  setObjective(p: THREE.Vector3 | null, label: string, playerPos: THREE.Vector3): void {
    if (!p) {
      this.objective.style.display = 'none';
      return;
    }
    this.objective.style.display = 'flex';
    const s = this.project(p);
    const m = 40;
    let x = s.x;
    let y = s.y;
    let edge = false;
    if (s.behind) {
      x = this.w - x;
      y = this.h - m;
      edge = true;
    }
    if (x < m || x > this.w - m || y < m + 60 || y > this.h - m) edge = true;
    x = Math.max(m, Math.min(this.w - m, x));
    y = Math.max(m + 60, Math.min(this.h - m - 70, y));
    this.objective.classList.toggle('edge', edge);
    const d = Math.round(Math.hypot(p.x - playerPos.x, p.z - playerPos.z));
    const txt = d > 4 ? `${label} · ${d}m` : label;
    if (this.objLabel.textContent !== txt) this.objLabel.textContent = txt;
    this.objective.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
  }

  setStats(bits: number, totalBits: number, cores: number): void {
    const k = `${bits}/${totalBits}`;
    if (k !== this.lastBits) {
      this.lastBits = k;
      $('#bits-value').textContent = String(bits);
      $('#bits-total').textContent = `/${totalBits}`;
    }
    if (cores !== this.lastCores) {
      this.lastCores = cores;
      const slots = $('#cores').children;
      for (let i = 0; i < slots.length; i += 1) slots[i].classList.toggle('on', i < cores);
    }
  }

  setInventory(items: ItemId[]): void {
    const k = items.join(',');
    if (k === this.lastInv) return;
    this.lastInv = k;
    $('#inventory').innerHTML = items.map((i) => `<div class="inv">${ITEM_ICONS[i]}${ITEM_INFO[i].name}</div>`).join('');
  }

  setSuspicion(s: number): void {
    this.eyeFill.style.transform = `scaleX(${Math.min(1, s).toFixed(3)})`;
    this.eye.classList.toggle('alert', s >= 0.75);
  }

  setAction(t: number | null, label = ''): void {
    if (t === null) {
      this.ring.classList.add('hidden');
      return;
    }
    this.ring.classList.remove('hidden');
    this.arc.style.strokeDashoffset = String(100.5 * (1 - t));
    if (this.actionLabel.textContent !== label) this.actionLabel.textContent = label;
  }

  beginIcons(): void {
    this.iconUsed = 0;
  }

  icon(p: THREE.Vector3, glyph: string): void {
    const s = this.project(p);
    if (s.behind || s.x < -20 || s.x > this.w + 20 || s.y < -20 || s.y > this.h + 20) return;
    let el = this.iconPool[this.iconUsed];
    if (!el) {
      el = document.createElement('div');
      this.layer.appendChild(el);
      this.iconPool.push(el);
    }
    this.iconUsed += 1;
    const cls = glyph === '?' ? 'q' : glyph === '!' ? 'x' : glyph === '★' ? 's' : glyph === '♥' ? 'h' : glyph === 'zz' ? 'z' : 'n';
    const want = `icon-mark ${cls}`;
    if (el.className !== want) el.className = want;
    const shown = glyph + '\uFE0E';
    if (el.textContent !== shown) el.textContent = shown;
    el.style.display = 'block';
    el.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px) translate(-50%, -100%)`;
  }

  endIcons(): void {
    for (let i = this.iconUsed; i < this.iconPool.length; i += 1) this.iconPool[i].style.display = 'none';
  }

  update(dt: number): void {
    for (let i = this.bubbles.length - 1; i >= 0; i -= 1) {
      const b = this.bubbles[i];
      b.life -= dt;
      const a = b.anchor();
      if (b.life <= 0 || !a) {
        b.el.remove();
        this.bubbles.splice(i, 1);
        continue;
      }
      const s = this.project(a);
      if (s.behind) {
        b.el.style.display = 'none';
        continue;
      }
      b.el.style.display = 'block';
      const age = b.max - b.life;
      const pop = age < 0.18 ? 0.6 + (age / 0.18) * 0.4 : 1;
      const fade = b.life < 0.3 ? b.life / 0.3 : 1;
      b.el.style.opacity = fade.toFixed(2);
      b.el.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y - 8)}px) translate(-50%, -100%) scale(${pop.toFixed(2)})`;
    }
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.banner.classList.remove('show');
    }
  }
}
