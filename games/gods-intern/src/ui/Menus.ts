import type { QualityLevel, Settings } from '../core/Settings';
import { $, el, icon } from './dom';

export interface MenuActions {
  resume(): void;
  restart(): void;
  save(): boolean;
  load(): boolean;
  hasSave(): boolean;
  hasAutosave(): boolean;
  loadAutosave(): boolean;
  settings(): Settings;
  applySettings(s: Settings): void;
  fullscreen(): void;
  click(): void;
}

/** Pause menu, settings, how-to-play and confirmation dialogs (one modal at a time). */
export class Menus {
  private readonly root = $('#modal-root');
  current: 'pause' | 'settings' | 'help' | 'confirm' | null = null;
  private back: (() => void) | null = null;

  constructor(private readonly actions: MenuActions) {
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.close(true);
    });
  }

  get open(): boolean {
    return this.current !== null;
  }

  private mount(node: HTMLElement, kind: Menus['current'], back: (() => void) | null = null): void {
    this.root.innerHTML = '';
    this.root.append(node);
    this.root.classList.remove('hidden');
    this.current = kind;
    this.back = back;
    node.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => this.actions.click()));
    node.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }

  /** Escape: go back one level, or close. Returns true if something closed. */
  close(resume = true): boolean {
    if (!this.current) return false;
    if (this.back) {
      const b = this.back;
      this.back = null;
      b();
      return true;
    }
    this.root.classList.add('hidden');
    this.root.innerHTML = '';
    const wasPause = this.current === 'pause';
    this.current = null;
    if (resume && wasPause) this.actions.resume();
    return true;
  }

  /** Close every modal level and resume (used after a confirmed action). */
  closeAll(): void {
    this.back = null;
    this.current = 'pause';
    this.close(true);
  }

  pause(): void {
    const node = el('div', 'modal');
    const hasSave = this.actions.hasSave();
    node.innerHTML = `
      <h2>${icon('pause')} Paused</h2>
      <p class="sub">The universe is on hold. Take your time, intern.</p>
      <div class="menu-list">
        <button class="btn primary" data-a="resume" type="button">${icon('play')} Resume</button>
        <button class="btn" data-a="save" type="button">Save Game</button>
        <button class="btn" data-a="load" type="button" ${hasSave ? '' : 'disabled'}>Load Game</button>
        ${this.actions.hasAutosave() ? '<button class="btn" data-a="auto" type="button">Load Autosave</button>' : ''}
        <button class="btn" data-a="settings" type="button">${icon('gear')} Settings</button>
        <button class="btn" data-a="help" type="button">${icon('question')} How to Play</button>
        <button class="btn" data-a="fullscreen" type="button">${icon('fullscreen')} Fullscreen</button>
        <button class="btn danger" data-a="restart" type="button">Restart World</button>
      </div>
      <p class="menu-foot" id="menu-status">Autosaves every 60 seconds.</p>`;
    const status = () => node.querySelector<HTMLElement>('#menu-status')!;
    node.querySelector('[data-a=resume]')!.addEventListener('click', () => this.close(true));
    node.querySelector('[data-a=save]')!.addEventListener('click', () => {
      status().textContent = this.actions.save() ? 'Saved. Heaven has a backup.' : 'Could not save (storage unavailable).';
      node.querySelector<HTMLButtonElement>('[data-a=load]')!.disabled = !this.actions.hasSave();
    });
    node.querySelector('[data-a=load]')!.addEventListener('click', () => {
      this.confirm('Load your saved game?', 'Unsaved progress in this world will be lost.', 'Load', () => {
        if (this.actions.load()) this.closeAll();
        else this.pause();
      });
    });
    node.querySelector('[data-a=auto]')?.addEventListener('click', () => {
      if (this.actions.loadAutosave()) this.closeAll();
    });
    node.querySelector('[data-a=settings]')!.addEventListener('click', () => this.settings(() => this.pause()));
    node.querySelector('[data-a=help]')!.addEventListener('click', () => this.help(() => this.pause()));
    node.querySelector('[data-a=fullscreen]')!.addEventListener('click', () => this.actions.fullscreen());
    node.querySelector('[data-a=restart]')!.addEventListener('click', () => {
      this.confirm('Restart the world?', 'The island returns to day one. Villagers will not remember you. (They will.)', 'Restart', () => {
        this.actions.restart();
        this.closeAll();
      });
    });
    this.mount(node, 'pause');
  }

  settings(back: (() => void) | null = null): void {
    const s = { ...this.actions.settings() };
    const node = el('div', 'modal');
    const range = (key: keyof Settings, label: string, hint: string, min: number, max: number, step: number) =>
      `<div class="setting"><div>${label}<small>${hint}</small></div><input type="range" data-k="${key}" min="${min}" max="${max}" step="${step}" value="${s[key]}" aria-label="${label}"></div>`;
    const toggle = (key: keyof Settings, label: string, hint: string) =>
      `<div class="setting"><div>${label}<small>${hint}</small></div><button type="button" class="toggle${s[key] ? ' on' : ''}" data-t="${key}" aria-pressed="${s[key]}" aria-label="${label}"></button></div>`;
    const qualities: QualityLevel[] = ['auto', 'low', 'medium', 'high'];
    node.innerHTML = `
      <h2>${icon('gear')} Settings</h2>
      <p class="sub">Saved automatically on this device.</p>
      ${range('masterVolume', 'Master volume', 'Everything you hear', 0, 1, 0.05)}
      ${range('sfxVolume', 'Sound effects', 'Thunder, crackles, chimes', 0, 1, 0.05)}
      <div class="setting"><div>Graphics quality<small>Shadows, particles, resolution</small></div><div class="seg">${qualities
        .map((q) => `<button type="button" data-q="${q}" class="${s.quality === q ? 'on' : ''}">${q[0].toUpperCase() + q.slice(1)}</button>`)
        .join('')}</div></div>
      ${range('cameraSensitivity', 'Camera sensitivity', 'Rotate, pan and zoom speed', 0.3, 2, 0.1)}
      ${toggle('unlimitedEnergy', 'Unlimited divine energy', 'Sandbox mode. God will never know.')}
      ${toggle('reducedShake', 'Reduced camera shake', 'Calmer lightning strikes')}
      <div class="btn-row"><button class="btn primary" data-a="done" type="button">Done</button></div>`;
    node.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((input) => {
      input.addEventListener('input', () => {
        (s as unknown as Record<string, number>)[input.dataset.k!] = Number(input.value);
        this.actions.applySettings({ ...s });
      });
    });
    node.querySelectorAll<HTMLButtonElement>('[data-t]').forEach((b) => {
      b.addEventListener('click', () => {
        const key = b.dataset.t as 'unlimitedEnergy' | 'reducedShake';
        s[key] = !s[key];
        b.classList.toggle('on', s[key]);
        b.setAttribute('aria-pressed', String(s[key]));
        this.actions.applySettings({ ...s });
      });
    });
    node.querySelectorAll<HTMLButtonElement>('[data-q]').forEach((b) => {
      b.addEventListener('click', () => {
        s.quality = b.dataset.q as QualityLevel;
        node.querySelectorAll('[data-q]').forEach((x) => x.classList.toggle('on', x === b));
        this.actions.applySettings({ ...s });
      });
    });
    node.querySelector('[data-a=done]')!.addEventListener('click', () => this.close(true));
    this.mount(node, 'settings', back);
  }

  help(back: (() => void) | null = null): void {
    const node = el('div', 'modal wide');
    node.innerHTML = `
      <h2>${icon('question')} How to Play</h2>
      <p class="sub">God is on vacation. Keep the villagers alive, answer their prayers, and try not to set everything on fire.</p>
      <div class="how">
        <section><h4>Camera</h4><ul>
          <li><kbd>Right drag</kbd> rotate</li><li><kbd>Wheel</kbd> zoom</li>
          <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or <kbd>Middle drag</kbd> pan</li><li><kbd>Q</kbd>/<kbd>E</kbd> spin</li></ul></section>
        <section><h4>Powers</h4><ul>
          <li><kbd>1</kbd> Rain — water, crops, firefighting</li><li><kbd>2</kbd> Lightning — dramatic. Flammable.</li>
          <li><kbd>3</kbd> Nature — instant trees, calm villagers</li><li><kbd>4</kbd> Fire — please don't</li></ul></section>
        <section><h4>Prayers</h4><ul>
          <li>Villagers pray at the shrine when something is wrong.</li><li>Fix the underlying problem — any way you like.</li>
          <li>Answered prayers refill energy and raise Approval.</li></ul></section>
        <section><h4>Controls</h4><ul>
          <li><kbd>Left click</kbd> use power</li><li><kbd>0</kbd>/<kbd>Esc</kbd> Look mode · click buildings to inspect</li>
          <li><kbd>Space</kbd> pause · <kbd>F</kbd> speed</li><li>Every miracle has consequences.</li></ul></section>
      </div>
      <div class="btn-row"><button class="btn primary" data-a="done" type="button">Got it</button></div>`;
    node.querySelector('[data-a=done]')!.addEventListener('click', () => this.close(true));
    this.mount(node, 'help', back);
  }

  confirm(title: string, text: string, ok: string, onOk: () => void): void {
    const node = el('div', 'modal');
    node.innerHTML = `<h2>${title}</h2><p class="sub">${text}</p>
      <div class="btn-row"><button class="btn" data-a="cancel" type="button">Cancel</button><button class="btn danger" data-a="ok" type="button">${ok}</button></div>`;
    node.querySelector('[data-a=cancel]')!.addEventListener('click', () => this.pause());
    node.querySelector('[data-a=ok]')!.addEventListener('click', onOk);
    this.mount(node, 'confirm', () => this.pause());
  }
}
