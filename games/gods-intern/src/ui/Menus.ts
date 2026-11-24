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
  // v0.4
  mode(): 'career' | 'creative';
  switchMode(mode: 'career' | 'creative'): void;
  cinematic(): void;
  screenshot(): void;
  // v0.5
  mainMenu(): void;
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
      <p class="sub">The universe is on hold. Take your time, intern. <b class="mode-pill ${this.actions.mode()}">${this.actions.mode() === 'creative' ? 'Creative Mode' : 'Career Mode'}</b></p>
      <div class="menu-list">
        <button class="btn primary" data-a="resume" type="button">${icon('play')} Resume</button>
        <button class="btn" data-a="save" type="button">Save Game</button>
        <button class="btn" data-a="load" type="button" ${hasSave ? '' : 'disabled'}>Load Game</button>
        ${this.actions.hasAutosave() ? '<button class="btn" data-a="auto" type="button">Load Autosave</button>' : ''}
        <button class="btn" data-a="settings" type="button">${icon('gear')} Settings</button>
        <button class="btn" data-a="help" type="button">${icon('question')} How to Play</button>
        <button class="btn" data-a="mode" type="button">${icon('star')} ${this.actions.mode() === 'creative' ? 'Back to Career Mode' : 'Creative Mode (sandbox)'}</button>
        <div class="btn-pair"><button class="btn" data-a="cine" type="button">${icon('film')} Cinematic</button><button class="btn" data-a="shot" type="button">${icon('camera')} Screenshot</button></div>
        <button class="btn" data-a="fullscreen" type="button">${icon('fullscreen')} Fullscreen</button>
        <button class="btn" data-a="main" type="button">Main menu</button>
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
    node.querySelector('[data-a=cine]')!.addEventListener('click', () => {
      this.closeAll();
      this.actions.cinematic();
    });
    node.querySelector('[data-a=shot]')!.addEventListener('click', () => {
      this.closeAll();
      this.actions.screenshot();
    });
    node.querySelector('[data-a=mode]')!.addEventListener('click', () => {
      const to = this.actions.mode() === 'creative' ? 'career' : 'creative';
      this.confirm(
        to === 'creative' ? 'Open Creative Mode?' : 'Return to Career Mode?',
        to === 'creative'
          ? 'Every power, optional unlimited energy. Creative has its own save slot and never gives career XP. Your career is saved first.'
          : 'Your creative island is saved in its own slot. Career progress continues where you left it.',
        to === 'creative' ? 'Go creative' : 'Back to work',
        () => {
          this.actions.switchMode(to);
          this.closeAll();
        },
      );
    });
    node.querySelector('[data-a=main]')!.addEventListener('click', () => this.actions.mainMenu());
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
      <p class="sub">Saved automatically on this device. Each volume is independent; the game is fully playable with sound off.</p>
      ${range('masterVolume', 'Master volume', 'Everything you hear', 0, 1, 0.05)}
      ${range('sfxVolume', 'Effects', 'Powers, thunder, crackles', 0, 1, 0.05)}
      ${range('musicVolume', 'Music', 'A small, worried music box', 0, 1, 0.05)}
      ${range('ambientVolume', 'Ambience', 'Waves, wind, rain, birds', 0, 1, 0.05)}
      ${range('uiVolume', 'Interface', 'Clicks, chimes, promotions', 0, 1, 0.05)}
      <div class="setting"><div>Graphics quality<small>Shadows, particles, resolution</small></div><div class="seg">${qualities
        .map((q) => `<button type="button" data-q="${q}" class="${s.quality === q ? 'on' : ''}">${q[0].toUpperCase() + q.slice(1)}</button>`)
        .join('')}</div></div>
      ${range('cameraSensitivity', 'Camera sensitivity', 'Rotate, pan and zoom speed', 0.3, 2, 0.1)}
      ${this.actions.mode() === 'creative' ? `${toggle('unlimitedEnergy', 'Unlimited divine energy', 'Creative Mode only.')}
      ${toggle('reducedCooldowns', 'Reduced cooldowns', 'Creative Mode only. Cooldowns ×0.25.')}` : ''}
      ${toggle('cameraShake', 'Camera shake', 'Impacts shake the view a little')}
      ${toggle('reducedMotion', 'Reduced motion', 'Calmer interface and world animation, no screen flashes')}
      <div class="btn-row"><button class="btn primary" data-a="done" type="button">Done</button></div>`;
    node.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((input) => {
      input.addEventListener('input', () => {
        (s as unknown as Record<string, number>)[input.dataset.k!] = Number(input.value);
        this.actions.applySettings({ ...s });
      });
    });
    node.querySelectorAll<HTMLButtonElement>('[data-t]').forEach((b) => {
      b.addEventListener('click', () => {
        const key = b.dataset.t as 'unlimitedEnergy' | 'reducedShake' | 'reducedCooldowns' | 'cameraShake' | 'reducedMotion';
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
        <section><h4>Powers</h4><ul>
          <li>Pick a power in the dock at the bottom, then click the island</li><li><b>Cancel</b> puts it away (or Esc)</li>
          <li><b>ALL POWERS</b> shows every power, what unlocks it, and lets you change the dock</li></ul></section>
        <section><h4>Camera</h4><ul>
          <li>Drag to pan · right-drag to rotate · scroll to zoom</li><li>Touch: drag, pinch, twist</li><li>Optional keys: WASD pan, Q/E spin</li></ul></section>
        <section><h4>Panels</h4><ul>
          <li><b>World</b>: villages, needs, diplomacy</li><li><b>Career</b>: rank, next promotion, upcoming powers</li>
          <li><b>Challenges</b> and <b>History</b></li><li>Click outside a panel to close it</li></ul></section>
        <section><h4>Prayers</h4><ul>
          <li>Prayers appear on the right with a suggested power</li><li>Focus flies there; you still cast the miracle</li></ul></section>
        <section><h4>Inspect</h4><ul>
          <li>With no power selected, click villagers, buildings and sacred objects</li><li>Follow a villager with the camera</li></ul></section>
        <section><h4>Optional keys</h4><ul>
          <li>1–7 dock · G all powers · T power mode</li><li>Space pause · F speed · P menu</li><li>V world · J career · C challenges · B history</li></ul></section>
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
