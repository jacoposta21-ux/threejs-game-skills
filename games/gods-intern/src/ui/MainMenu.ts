import { $, escapeHtml } from './dom';

export interface SlotInfo {
  rank: number;
  title: string;
  day: number;
}

export interface MainMenuActions {
  career(): SlotInfo | null;
  creative(): SlotInfo | null;
  continueCareer(): void;
  newCareer(): void;
  creativeMode(): void;
  settings(): void;
  click(): void;
}

/**
 * Main menu over the living island: CONTINUE (only with a valid Career save),
 * NEW CAREER, CREATIVE MODE and SETTINGS. Explains the difference between the
 * modes (separate save slots) and asks before overwriting a career.
 */
export class MainMenu {
  private readonly root = $('#main-menu');
  private confirming = false;

  constructor(private readonly actions: MainMenuActions) {
    this.root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-mm]');
      if (!b) return;
      this.actions.click();
      const a = b.dataset.mm;
      if (a === 'continue') this.actions.continueCareer();
      else if (a === 'new') {
        if (this.actions.career() && !this.confirming) {
          this.confirming = true;
          this.render();
          this.root.querySelector<HTMLButtonElement>('[data-mm=cancel]')?.focus();
          return;
        }
        this.confirming = false;
        this.actions.newCareer();
      } else if (a === 'confirm-new') {
        this.confirming = false;
        this.actions.newCareer();
      } else if (a === 'cancel') {
        this.confirming = false;
        this.render();
      } else if (a === 'creative') this.actions.creativeMode();
      else if (a === 'settings') this.actions.settings();
    });
  }

  get open(): boolean {
    return !this.root.classList.contains('hidden');
  }

  show(): void {
    this.confirming = false;
    this.render();
    this.root.classList.remove('hidden');
    document.body.classList.add('at-menu');
    this.root.querySelector<HTMLButtonElement>('.mm-btn')?.focus({ preventScroll: true });
  }

  hide(): void {
    this.root.classList.add('hidden');
    document.body.classList.remove('at-menu');
  }

  private render(): void {
    const career = this.actions.career();
    const creative = this.actions.creative();
    const slot = (s: SlotInfo | null, empty: string) => (s ? `Rank ${s.rank} · ${escapeHtml(s.title)} · Day ${s.day}` : empty);
    this.root.innerHTML = `
      <div class="mm-card" role="dialog" aria-labelledby="mm-title">
        <div class="mm-brand"><span class="brand-halo big" aria-hidden="true"></span><h1 id="mm-title">GOD'S INTERN</h1><p>God is on vacation. Somebody has to keep the island running.</p></div>
        ${this.confirming ? `
          <div class="mm-confirm">
            <h2>Start a new career?</h2>
            <p>Your current career (${slot(career, '')}) will be replaced. Your Creative island is not affected.</p>
            <div class="mm-row"><button type="button" class="btn" data-mm="cancel">Keep my career</button><button type="button" class="btn danger" data-mm="confirm-new">Start over</button></div>
          </div>` : `
        <nav class="mm-list" aria-label="Main menu">
          ${career ? `<button type="button" class="mm-btn primary" data-mm="continue"><b>CONTINUE</b><small>${slot(career, '')}</small></button>` : ''}
          <button type="button" class="mm-btn ${career ? '' : 'primary'}" data-mm="new"><b>NEW CAREER</b><small>Become the world's least qualified god.</small></button>
          <button type="button" class="mm-btn creative" data-mm="creative"><b>CREATIVE MODE</b><small>Unlimited power. Absolutely no responsibility.${creative ? ' · Continues your island' : ''}</small></button>
          <button type="button" class="mm-btn quiet" data-mm="settings"><b>SETTINGS</b></button>
        </nav>
        <p class="mm-modes"><b>Career</b> starts with four powers and unlocks the rest through promotions. <b>Creative</b> has every power from the start and never affects your career. Each mode keeps its own save.</p>`}
      </div>`;
  }
}
