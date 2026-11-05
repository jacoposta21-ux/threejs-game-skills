import type { UIBridge } from '../core/Context';
import type { Prompt } from '../objects/Interactable';
import { icon } from './Icons';

export interface HudState {
  prompt: Prompt | null;
  energy: number;
  lumoFound: boolean;
  lumoMode: 'glow' | 'dim' | 'away' | 'charging' | 'tired';
  noise: number;
  hidden: boolean;
  crawling: boolean;
  targeting: boolean;
  fear: number;
  visible: boolean;
  touch: boolean;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (html) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}

/** Minimal in-game HUD. No permanent markers; things appear when they matter. */
export class HUD implements UIBridge {
  readonly root: HTMLElement;
  private promptEl: HTMLElement;
  private promptKey: HTMLElement;
  private promptText: HTMLElement;
  private crosshair: HTMLElement;
  private noiseRing: HTMLElement;
  private energyEl: HTMLElement;
  private energyFill: SVGCircleElement;
  private energySegs: SVGPathElement[] = [];
  private objectiveEl: HTMLElement;
  private hintEl: HTMLElement;
  private subtitleEl: HTMLElement;
  private itemEl: HTMLElement;
  private cardEl: HTMLElement;
  private examineEl: HTMLElement;
  private slats: HTMLElement;
  private fadeEl: HTMLElement;
  private timers = new Map<HTMLElement, number>();
  subtitlesEnabled = true;
  examineOpen = false;
  currentObjective = '';
  onExamineClose: () => void = () => {};
  private lastPrompt = '';

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud', parent);
    this.slats = el('div', 'hud-slats', this.root);
    this.crosshair = el('div', 'hud-crosshair', this.root);
    this.noiseRing = el('div', 'hud-noise', this.root);
    this.promptEl = el('div', 'hud-prompt', this.root);
    this.promptKey = el('span', 'hud-key', this.promptEl);
    this.promptText = el('span', 'hud-verb', this.promptEl);
    this.hintEl = el('div', 'hud-hint', this.root);
    this.subtitleEl = el('div', 'hud-subtitle', this.root);
    this.objectiveEl = el('div', 'hud-objective', this.root);
    this.itemEl = el('div', 'hud-item', this.root);
    this.cardEl = el('div', 'hud-card', this.root);

    // LUMO energy: a little firefly whose lantern fills, ringed by ten segments.
    this.energyEl = el('div', 'hud-energy', this.root);
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 64 64');
    for (let i = 0; i < 10; i++) {
      const a0 = (-90 + i * 36 + 4) * (Math.PI / 180);
      const a1 = (-90 + (i + 1) * 36 - 4) * (Math.PI / 180);
      const r = 28;
      const p = document.createElementNS(ns, 'path');
      p.setAttribute('d', `M ${32 + Math.cos(a0) * r} ${32 + Math.sin(a0) * r} A ${r} ${r} 0 0 1 ${32 + Math.cos(a1) * r} ${32 + Math.sin(a1) * r}`);
      p.setAttribute('class', 'seg');
      svg.appendChild(p);
      this.energySegs.push(p);
    }
    const body = document.createElementNS(ns, 'g');
    body.setAttribute('class', 'fly');
    body.innerHTML = `
      <path d="M27 24c-8-9-16-4-13 2s9 3 13 0M37 24c8-9 16-4 13 2s-9 3-13 0" class="wing"/>
      <path d="M29 20l-3-7M35 20l3-7" class="ant"/>
      <circle cx="32" cy="23" r="4.5" class="thorax"/>
      <ellipse cx="32" cy="36" rx="7" ry="10" class="shell"/>`;
    svg.appendChild(body);
    const fill = document.createElementNS(ns, 'circle');
    fill.setAttribute('cx', '32');
    fill.setAttribute('cy', '36');
    fill.setAttribute('r', '6');
    fill.setAttribute('class', 'core');
    svg.appendChild(fill);
    this.energyFill = fill;
    this.energyEl.appendChild(svg);

    this.examineEl = el('div', 'hud-examine', this.root);
    this.examineEl.addEventListener('click', () => this.closeExamine());

    this.fadeEl = el('div', 'hud-fade', parent);
  }

  setFade(amount: number): void {
    this.fadeEl.style.opacity = String(Math.max(0, Math.min(1, amount)));
  }

  private flash(e: HTMLElement, seconds: number): void {
    e.classList.add('show');
    const old = this.timers.get(e);
    if (old) window.clearTimeout(old);
    this.timers.set(
      e,
      window.setTimeout(() => e.classList.remove('show'), seconds * 1000),
    );
  }

  toast(text: string, seconds = 3): void {
    this.hint(text, seconds);
  }

  objective(text: string): void {
    if (text === this.currentObjective) return;
    this.currentObjective = text;
    this.objectiveEl.innerHTML = `<span class="mark">${icon('firefly')}</span><span>${text}</span>`;
    this.flash(this.objectiveEl, 6);
  }

  showObjective(seconds = 4): void {
    if (this.currentObjective) this.flash(this.objectiveEl, seconds);
  }

  subtitle(text: string, seconds = 3): void {
    if (!this.subtitlesEnabled && text.startsWith('[')) return;
    this.subtitleEl.textContent = text;
    this.flash(this.subtitleEl, seconds);
  }

  hint(text: string, seconds = 4): void {
    this.hintEl.textContent = text;
    this.flash(this.hintEl, seconds);
  }

  itemGained(name: string, iconName: string): void {
    this.itemEl.innerHTML = `<span class="ico">${icon(iconName)}</span><span>${name}</span>`;
    this.flash(this.itemEl, 3.2);
  }

  chapterCard(numeral: string, title: string): void {
    this.cardEl.innerHTML = numeral ? `<small>Chapter ${numeral}</small><strong>${title}</strong>` : `<strong>${title}</strong>`;
    this.flash(this.cardEl, 3.6);
  }

  examine(title: string, body: string, art = ''): void {
    this.examineOpen = true;
    this.examineEl.innerHTML = `<div class="paper ${art}"><h3>${title}</h3><p>${body}</p><span class="close">E / tap to close</span></div>`;
    this.examineEl.classList.add('show');
  }

  closeExamine(): void {
    if (!this.examineOpen) return;
    this.examineOpen = false;
    this.examineEl.classList.remove('show');
    this.onExamineClose();
  }

  clearTransient(): void {
    for (const e of [this.hintEl, this.subtitleEl, this.itemEl, this.cardEl, this.objectiveEl]) e.classList.remove('show');
  }

  update(s: HudState): void {
    this.root.classList.toggle('hidden', !s.visible);
    this.root.classList.toggle('touch', s.touch);
    const p = s.prompt;
    const text = p ? `${p.disabled ? 'd' : 'e'}|${p.key ?? ''}|${p.verb}` : '';
    if (text !== this.lastPrompt) {
      this.lastPrompt = text;
      if (p) {
        this.promptKey.textContent = p.disabled ? '' : s.touch ? '' : (p.key ?? 'E');
        this.promptKey.style.display = p.disabled || s.touch ? 'none' : '';
        this.promptText.textContent = p.verb;
        this.promptEl.classList.add('show');
        this.promptEl.classList.toggle('disabled', Boolean(p.disabled));
      } else {
        this.promptEl.classList.remove('show');
      }
    }
    this.crosshair.classList.toggle('target', s.targeting);
    this.crosshair.classList.toggle('crawl', s.crawling);
    this.slats.classList.toggle('show', s.hidden);
    const n = Math.min(1, s.noise);
    this.noiseRing.style.opacity = String(n * 0.55);
    this.noiseRing.style.transform = `translate(-50%, -50%) scale(${0.6 + n * 1.6})`;

    this.energyEl.classList.toggle('show', s.lumoFound);
    this.energyEl.dataset.mode = s.lumoMode;
    const lit = Math.ceil(s.energy / 10);
    this.energySegs.forEach((seg, i) => seg.classList.toggle('on', i < lit));
    this.energyFill.setAttribute('r', String(1.5 + (s.energy / 100) * 5.5));
    this.energyEl.classList.toggle('low', s.energy < 20);
  }
}
