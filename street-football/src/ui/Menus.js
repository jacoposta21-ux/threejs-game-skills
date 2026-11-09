const $ = (id) => document.getElementById(id);

const SCREENS = ['menu', 'courts', 'howto', 'settings', 'pause', 'results', 'loading', 'context-lost', 'fatal'];

/** Menu screens and settings binding. Dispatches intents through `handlers`. */
export class Menus {
  constructor(handlers, audio, settings) {
    this.handlers = handlers;
    this.audio = audio;
    this.settings = settings;
    this.stack = [];
    this.current = 'loading';

    for (const btn of document.querySelectorAll('[data-menu]')) {
      btn.addEventListener('click', () => {
        this.click();
        const m = btn.dataset.menu;
        if (m === 'play') handlers.play();
        else this.open(m);
      });
    }
    for (const btn of document.querySelectorAll('[data-back]')) {
      btn.addEventListener('click', () => {
        this.click();
        this.back();
      });
    }
    for (const btn of document.querySelectorAll('[data-pause]')) {
      btn.addEventListener('click', () => {
        this.click();
        const a = btn.dataset.pause;
        if (a === 'resume') handlers.resume();
        else if (a === 'restart') handlers.restart();
        else if (a === 'quit') handlers.quit();
        else if (a === 'settings') this.open('settings');
      });
    }
    for (const btn of document.querySelectorAll('[data-results]')) {
      btn.addEventListener('click', () => {
        this.click();
        if (btn.dataset.results === 'again') handlers.restart();
        else handlers.quit();
      });
    }
    $('reload-btn').addEventListener('click', () => window.location.reload());

    // Settings bindings.
    const s = audio.settings;
    const bindRange = (id, key) => {
      const el = $(id);
      el.value = s[key];
      el.addEventListener('input', () => audio.setVolume(key, Number(el.value)));
    };
    bindRange('vol-master', 'master');
    bindRange('vol-sfx', 'sfx');
    bindRange('vol-ambience', 'ambience');
    const mute = $('mute-check');
    mute.checked = s.muted;
    mute.addEventListener('change', () => handlers.setMuted(mute.checked));
    const shake = $('shake-check');
    shake.checked = settings.shake;
    shake.addEventListener('change', () => handlers.setSetting('shake', shake.checked));
    for (const seg of document.querySelectorAll('.seg')) {
      const key = seg.dataset.setting;
      const buttons = seg.querySelectorAll('button');
      const sync = () => buttons.forEach((b) => b.classList.toggle('on', b.dataset.value === settings[key]));
      sync();
      buttons.forEach((b) =>
        b.addEventListener('click', () => {
          this.click();
          handlers.setSetting(key, b.dataset.value);
          sync();
        }),
      );
    }
  }

  click() {
    this.audio.play('click', { group: 'ui', variance: 0 });
  }

  setMuteChecked(muted) {
    $('mute-check').checked = muted;
  }

  note(text) {
    $('settings-note').textContent = text;
  }

  showOnly(name) {
    for (const id of SCREENS) $(id).classList.toggle('hidden', id !== name);
    this.current = name;
    const first = name && $(name)?.querySelector('button:not([disabled])');
    if (first && !matchMedia('(pointer: coarse)').matches) first.focus({ preventScroll: true });
  }

  open(name) {
    if (this.current) this.stack.push(this.current);
    this.showOnly(name);
  }

  back() {
    const prev = this.stack.pop() ?? 'menu';
    this.showOnly(prev);
  }

  hideAll() {
    this.stack = [];
    this.showOnly(null);
  }

  showMain(best) {
    this.stack = [];
    $('menu-best').textContent = best ? `BEST: ${best.goals} GOALS • ${best.style} STYLE` : '';
    this.showOnly('menu');
  }

  setLoading(p, text) {
    $('load-fill').style.width = `${Math.round(p * 100)}%`;
    if (text) $('load-text').textContent = text;
  }

  showResults(score, stats) {
    $('final-score').textContent = `${score.home} - ${score.away}`;
    const rows = Object.entries(stats).map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('');
    $('final-stats').innerHTML = rows;
    this.stack = [];
    this.showOnly('results');
  }

  fatal(message) {
    $('fatal-text').textContent = message;
    this.showOnly('fatal');
  }
}
