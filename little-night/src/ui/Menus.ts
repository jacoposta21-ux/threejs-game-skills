import type { SettingsData, Quality } from '../core/Settings';
import { CHAPTERS, type ChapterId } from '../core/types';
import { icon } from './Icons';
import { ITEMS } from '../systems/InventorySystem';

export interface MenuCallbacks {
  newGame(): void;
  continueGame(): void;
  chapter(id: ChapterId): void;
  resume(): void;
  restartCheckpoint(): void;
  mainMenu(): void;
  settingsChanged(s: SettingsData): void;
  uiSound(kind: 'click' | 'hover'): void;
}

type Screen = 'none' | 'main' | 'pause' | 'settings' | 'credits' | 'chapters' | 'ending' | 'loading' | 'confirm';

const CREDITS = `
  <p class="lead">An original story about the dark, a little light, and the songs that stay.</p>
  <dl>
    <dt>Design, code, art &amp; sound</dt><dd>Made with Three.js, TypeScript and Vite</dd>
    <dt>Art</dt><dd>Every model, texture and effect is generated procedurally in code</dd>
    <dt>Audio</dt><dd>All sound and music is synthesized live with the Web Audio API</dd>
    <dt>Lullaby</dt><dd>&ldquo;Little Night&rdquo;, an original music-box melody</dd>
    <dt>Type</dt><dd>Fraunces &amp; Nunito (SIL Open Font License)</dd>
  </dl>
  <p class="small">For everyone who was ever afraid of the dark &mdash; and for the grandparents who left a light on.</p>`;

export class Menus {
  readonly root: HTMLElement;
  private screen: Screen = 'none';
  private previous: Screen = 'main';
  private settings!: SettingsData;
  hasSave = false;
  completed: ChapterId[] = [];
  objective = '';
  inventory: string[] = [];
  private confirmAction: (() => void) | null = null;

  constructor(parent: HTMLElement, private readonly cb: MenuCallbacks) {
    this.root = document.createElement('div');
    this.root.className = 'menus';
    parent.appendChild(this.root);
    this.root.addEventListener('pointerover', (e) => {
      if ((e.target as HTMLElement).closest('button')) this.cb.uiSound('hover');
    });
  }

  get current(): Screen {
    return this.screen;
  }

  get open(): boolean {
    return this.screen !== 'none';
  }

  setSettings(s: SettingsData): void {
    this.settings = { ...s };
  }

  show(screen: Screen): void {
    if (screen === 'settings' || screen === 'credits' || screen === 'chapters') {
      if (this.screen !== 'settings' && this.screen !== 'credits' && this.screen !== 'chapters') this.previous = this.screen;
    }
    this.screen = screen;
    this.root.className = `menus screen-${screen}`;
    this.root.innerHTML = this.render(screen);
    this.bind();
    const first = this.root.querySelector<HTMLElement>('button:not([disabled]), input, select');
    first?.focus({ preventScroll: true });
  }

  hide(): void {
    this.screen = 'none';
    this.root.className = 'menus';
    this.root.innerHTML = '';
  }

  back(): void {
    if (this.screen === 'settings' || this.screen === 'credits' || this.screen === 'chapters' || this.screen === 'confirm') this.show(this.previous);
    else if (this.screen === 'pause') this.cb.resume();
  }

  private render(screen: Screen): string {
    switch (screen) {
      case 'main':
        return `
          <div class="title-wrap">
            <h1 class="title">L<span class="i-dot">i</span>ttle N<span class="i-dot">i</span>ght</h1>
            <p class="tagline">A little light. A very big house.</p>
          </div>
          <nav class="menu-list" aria-label="Main menu">
            ${this.hasSave ? `<button data-act="continue" class="primary">${icon('firefly')}<span>Continue</span></button>` : ''}
            <button data-act="new" class="${this.hasSave ? '' : 'primary'}">${icon('firefly')}<span>New Game</span></button>
            ${this.completed.length ? `<button data-act="chapters">${icon('firefly')}<span>Chapters</span></button>` : ''}
            <button data-act="settings">${icon('firefly')}<span>Settings</span></button>
            <button data-act="credits">${icon('firefly')}<span>Credits</span></button>
          </nav>
          <p class="foot">Best with headphones &middot; Mouse &amp; keyboard or touch</p>`;
      case 'pause':
        return `
          <div class="panel pause">
            <h2>Paused</h2>
            ${this.objective ? `<p class="objective">${icon('firefly')}<span>${this.objective}</span></p>` : ''}
            ${this.inventory.length ? `<ul class="inv">${this.inventory.map((i) => `<li title="${ITEMS[i]?.description ?? ''}">${icon(ITEMS[i]?.icon ?? 'hand')}<span>${ITEMS[i]?.name ?? i}</span></li>`).join('')}</ul>` : ''}
            <nav class="menu-list">
              <button data-act="resume" class="primary">${icon('firefly')}<span>Resume</span></button>
              <button data-act="restart">${icon('firefly')}<span>Restart from checkpoint</span></button>
              <button data-act="settings">${icon('firefly')}<span>Settings</span></button>
              <button data-act="quit">${icon('firefly')}<span>Main menu</span></button>
            </nav>
            <p class="controls">WASD move &middot; Mouse look &middot; E interact &middot; F LUMO &middot; C crawl &middot; Space climb &middot; Esc pause</p>
          </div>`;
      case 'settings': {
        const s = this.settings;
        const q = (v: Quality, label: string) => `<button data-q="${v}" class="seg ${s.quality === v ? 'on' : ''}" aria-pressed="${s.quality === v}">${label}</button>`;
        const range = (key: keyof SettingsData, label: string, min: number, max: number, step: number) =>
          `<label class="row"><span>${label}</span><input type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${s[key]}"><output>${Math.round(Number(s[key]) * 100)}</output></label>`;
        const toggle = (key: keyof SettingsData, label: string) =>
          `<label class="row"><span>${label}</span><button class="toggle ${s[key] ? 'on' : ''}" data-toggle="${key}" aria-pressed="${s[key]}"><i></i></button></label>`;
        return `
          <div class="panel settings">
            <h2>Settings</h2>
            ${range('master', 'Master volume', 0, 1, 0.05)}
            ${range('music', 'Music volume', 0, 1, 0.05)}
            ${range('sfx', 'Sound volume', 0, 1, 0.05)}
            ${range('sensitivity', 'Look sensitivity', 0.3, 2.5, 0.05)}
            ${toggle('invertY', 'Invert vertical look')}
            ${toggle('subtitles', 'Subtitles')}
            <div class="row"><span>Graphics quality</span><div class="segs">${q('low', 'Low')}${q('medium', 'Medium')}${q('high', 'High')}</div></div>
            <nav class="menu-list"><button data-act="back" class="primary">${icon('firefly')}<span>Back</span></button></nav>
          </div>`;
      }
      case 'credits':
        return `<div class="panel credits"><h2>Credits</h2>${CREDITS}<nav class="menu-list"><button data-act="back" class="primary">${icon('firefly')}<span>Back</span></button></nav></div>`;
      case 'chapters':
        return `<div class="panel chapters"><h2>Chapters</h2><nav class="menu-list">${CHAPTERS.map((c, i) => {
          const unlocked = i === 0 || this.completed.includes(CHAPTERS[i - 1].id);
          return `<button data-ch="${c.id}" ${unlocked ? '' : 'disabled'}>${icon('firefly')}<span>${c.numeral}. ${c.title}</span></button>`;
        }).join('')}<button data-act="back" class="primary">${icon('firefly')}<span>Back</span></button></nav></div>`;
      case 'ending':
        return `
          <div class="ending">
            <h1 class="title small">L<span class="i-dot">i</span>ttle N<span class="i-dot">i</span>ght</h1>
            <p class="lead">The house is quiet now. The good kind of quiet.</p>
            <div class="roll">${CREDITS}</div>
            <nav class="menu-list"><button data-act="quit" class="primary">${icon('firefly')}<span>Return to menu</span></button></nav>
          </div>`;
      case 'loading':
        return `<div class="loading"><div class="fly">${icon('lumo')}</div><p>Winding up…</p></div>`;
      case 'confirm':
        return `<div class="panel confirm"><h2>Start a new game?</h2><p>Your current progress will be replaced.</p><nav class="menu-list"><button data-act="confirm-yes" class="primary">${icon('firefly')}<span>Start over</span></button><button data-act="back">${icon('firefly')}<span>Keep my progress</span></button></nav></div>`;
      default:
        return '';
    }
  }

  private bind(): void {
    this.root.querySelectorAll<HTMLButtonElement>('button[data-act]').forEach((b) =>
      b.addEventListener('click', () => {
        this.cb.uiSound('click');
        const act = b.dataset.act;
        if (act === 'continue') this.cb.continueGame();
        else if (act === 'new') {
          if (this.hasSave) {
            this.confirmAction = () => this.cb.newGame();
            this.show('confirm');
          } else this.cb.newGame();
        } else if (act === 'confirm-yes') this.confirmAction?.();
        else if (act === 'settings') this.show('settings');
        else if (act === 'credits') this.show('credits');
        else if (act === 'chapters') this.show('chapters');
        else if (act === 'back') this.back();
        else if (act === 'resume') this.cb.resume();
        else if (act === 'restart') this.cb.restartCheckpoint();
        else if (act === 'quit') this.cb.mainMenu();
      }),
    );
    this.root.querySelectorAll<HTMLButtonElement>('button[data-ch]').forEach((b) =>
      b.addEventListener('click', () => {
        this.cb.uiSound('click');
        this.cb.chapter(b.dataset.ch as ChapterId);
      }),
    );
    this.root.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((input) =>
      input.addEventListener('input', () => {
        const key = input.dataset.key as keyof SettingsData;
        (this.settings as unknown as Record<string, number>)[key] = Number(input.value);
        const out = input.nextElementSibling as HTMLOutputElement;
        out.textContent = String(Math.round(Number(input.value) * 100));
        this.cb.settingsChanged({ ...this.settings });
      }),
    );
    this.root.querySelectorAll<HTMLButtonElement>('button[data-toggle]').forEach((b) =>
      b.addEventListener('click', () => {
        const key = b.dataset.toggle as keyof SettingsData;
        const rec = this.settings as unknown as Record<string, boolean>;
        rec[key] = !rec[key];
        b.classList.toggle('on', rec[key]);
        b.setAttribute('aria-pressed', String(rec[key]));
        this.cb.uiSound('click');
        this.cb.settingsChanged({ ...this.settings });
      }),
    );
    this.root.querySelectorAll<HTMLButtonElement>('button[data-q]').forEach((b) =>
      b.addEventListener('click', () => {
        this.settings.quality = b.dataset.q as Quality;
        this.root.querySelectorAll('button[data-q]').forEach((o) => o.classList.toggle('on', o === b));
        this.cb.uiSound('click');
        this.cb.settingsChanged({ ...this.settings });
      }),
    );
  }
}
