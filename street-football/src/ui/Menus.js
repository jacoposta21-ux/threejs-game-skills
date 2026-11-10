const $ = (id) => document.getElementById(id);

const SCREENS = ['menu', 'modes', 'teams', 'courts', 'howto', 'settings', 'pause', 'results', 'loading', 'context-lost', 'fatal'];

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pips = (n) => '<i class="pip on"></i>'.repeat(n) + '<i class="pip"></i>'.repeat(5 - n);

/** Menu screens and settings binding. Dispatches intents through `handlers`. */
export class Menus {
  constructor(handlers, audio, settings) {
    this.handlers = handlers;
    this.audio = audio;
    this.settings = settings;
    this.stack = [];
    this.current = 'loading';
    // Stagger index for entrance animations.
    for (const list of document.querySelectorAll('.menu-list, .court-grid, .howto-grid, .settings-grid')) {
      [...list.children].forEach((el, i) => el.style.setProperty('--i', i));
    }

    for (const btn of document.querySelectorAll('[data-menu]')) {
      btn.addEventListener('click', () => {
        this.click();
        const m = btn.dataset.menu;
        if (m === 'play') handlers.play();
        else if (m === 'tutorial') handlers.tutorial();
        else {
          if (m === 'modes') this.renderModes();
          if (m === 'courts') this.renderCourts();
          this.open(m);
        }
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
    $('kickoff-btn').addEventListener('click', () => {
      this.click();
      handlers.startMode(this.pendingMode ?? 'quick');
    });

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

  // ------------------------------------------------------------- content screens

  renderModes() {
    const { modes, choice } = this.handlers.content();
    const grid = $('mode-grid');
    grid.innerHTML = Object.values(modes)
      .map((m, i) => `<button type="button" class="mode-card${m.id === choice.mode ? ' selected' : ''}" data-mode="${m.id}" style="--i:${i}"><b>${esc(m.label)}</b><span>${esc(m.desc)}</span></button>`)
      .join('');
    for (const btn of grid.querySelectorAll('[data-mode]')) {
      btn.addEventListener('click', () => {
        this.click();
        this.pendingMode = btn.dataset.mode;
        this.renderTeams();
        this.open('teams');
      });
    }
  }

  renderTeams() {
    const { teams, choice, progress, unlocks, venues, modes } = this.handlers.content();
    const grid = $('team-grid');
    grid.innerHTML = teams
      .map((t, i) => {
        const k = t.kits[0];
        return `<button type="button" class="team-card${t.id === choice.team ? ' selected' : ''}" data-team="${t.id}" style="--i:${i};--j1:${k.jersey};--j2:${k.jersey2}"><i class="shirt"></i><b>${esc(t.name)}</b><span>${esc(t.from)}</span></button>`;
      })
      .join('');
    for (const btn of grid.querySelectorAll('[data-team]')) {
      btn.addEventListener('click', () => {
        this.click();
        const team = btn.dataset.team;
        this.handlers.choose({ team, kit: 'home' });
        this.renderTeams();
      });
    }
    const team = teams.find((t) => t.id === choice.team) ?? teams[0];
    const kits = team.kits
      .map((k) => {
        const open = progress.unlocked(k);
        const req = open ? '' : `<em>🔒 ${esc(unlocks[k.unlock]?.label ?? '')}</em>`;
        return `<button type="button" class="kit${k.id === choice.kit ? ' selected' : ''}${open ? '' : ' locked'}" data-kit="${k.id}" ${open ? '' : 'disabled'} style="--j1:${k.jersey};--j2:${k.jersey2};--sh:${k.shorts}"><i class="shirt"></i><b>${esc(k.label)}</b>${req}</button>`;
      })
      .join('');
    const players = team.players
      .map((pl) => `<div class="pl"><b>${pl.number}</b><span>${esc(pl.name)}</span><small>PACE</small>${pips(pl.spd)}<small>SHOT</small>${pips(pl.sht)}<small>SKILL</small>${pips(pl.skl)}</div>`)
      .join('');
    $('team-detail').innerHTML = `<div class="kits">${kits}</div><div class="players">${players}</div>`;
    for (const btn of $('team-detail').querySelectorAll('[data-kit]:not([disabled])')) {
      btn.addEventListener('click', () => {
        this.click();
        this.handlers.choose({ kit: btn.dataset.kit });
        this.renderTeams();
      });
    }
    const mode = modes[this.pendingMode] ?? modes.quick;
    const court = venues.find((v) => v.id === choice.court) ?? venues[0];
    const courtBtn = $('team-court');
    courtBtn.textContent = mode.id === 'tournament' ? 'COURTS: AWAY GROUNDS' : `COURT: ${court.name}`;
    courtBtn.disabled = mode.id === 'tournament';
    $('kickoff-btn').textContent = `KICK OFF • ${mode.label}`;
  }

  renderCourts() {
    const { venues, choice } = this.handlers.content();
    const grid = $('court-grid');
    grid.innerHTML = venues
      .map((v, i) => `<button type="button" class="court-card court-${v.id}${v.id === choice.court ? ' selected' : ''}" data-court="${v.id}" style="--i:${i}"><b>${esc(v.name)}</b><span>${esc(v.place)}</span><em>${v.id === choice.court ? 'SELECTED' : 'PLAYABLE'}</em></button>`)
      .join('');
    for (const btn of grid.querySelectorAll('[data-court]')) {
      btn.addEventListener('click', () => {
        this.click();
        this.handlers.choose({ court: btn.dataset.court });
        this.renderCourts();
        if (this.stack.at(-1) === 'teams') this.renderTeams();
      });
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

  showResults(score, stats, opts = {}) {
    $('final-score').textContent = `${score.home} - ${score.away}`;
    $('results-title').textContent = opts.title ?? 'FULL TIME';
    $('results-mode').textContent = opts.mode ?? '';
    $('results-again').textContent = opts.again ?? 'PLAY AGAIN';
    if (opts.home) $('final-home').textContent = opts.home;
    if (opts.away) $('final-away').textContent = opts.away;
    const rows = Object.entries(stats).map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('');
    $('final-stats').innerHTML = rows;
    [...$('final-stats').children].forEach((el, i) => el.style.setProperty('--i', Math.floor(i / 2)));
    this.stack = [];
    this.showOnly('results');
  }

  fatal(message) {
    $('fatal-text').textContent = message;
    this.showOnly('fatal');
  }
}
