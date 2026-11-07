import { POWERUPS, SKINS } from './Config.js';

// DOM interface: screens, HUD, popups, banners, skins and settings. The UI
// never touches game state directly; it renders what the Game gives it and
// forwards button intents through `handlers`.

const fmt = (n) => Math.floor(n).toLocaleString('en-US');
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const RING = 169.6;
const PU_RING = 106.8;

export class UIManager {
  constructor(save, audio, handlers) {
    this.save = save;
    this.audio = audio;
    this.handlers = handlers;
    this.$ = (id) => document.getElementById(id);
    this.current = 'loading';
    this.displayScore = 0;
    this.lastMult = 1;
    this.popupPool = [];

    this.el = {
      hud: this.$('hud'),
      score: this.$('hud-score'),
      best: this.$('hud-best'),
      mult: this.$('hud-mult'),
      multWrap: this.$('hud-mult-wrap'),
      comboRing: this.$('hud-combo-ring'),
      distance: this.$('hud-distance'),
      speed: this.$('hud-speed'),
      banner: this.$('banner'),
      bannerKicker: this.$('banner-kicker'),
      bannerTitle: this.$('banner-title'),
      popups: this.$('popups'),
      flash: this.$('flash'),
      touchHint: this.$('touch-hint'),
      thLeft: document.querySelector('.th-left'),
      thRight: document.querySelector('.th-right'),
      countdown: this.$('countdown-num'),
      mute: this.$('btn-mute'),
      confirm: this.$('confirm'),
      confirmText: this.$('confirm-text'),
      qualityInfo: this.$('settings-quality-info'),
    };
    this.pu = {};
    for (const node of document.querySelectorAll('.pu')) {
      this.pu[node.dataset.pu] = { node, ring: node.querySelector('.pu-fg') };
    }

    document.addEventListener('click', (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;
      const action = target.dataset.action;
      // never leave focus on in-game buttons: Space/Enter would re-trigger them
      if (target instanceof HTMLElement) target.blur();
      this.audio.unlock();
      if (action !== 'pause') this.audio.uiClick();
      this.handlers[action]?.(target);
    });
    document.addEventListener(
      'pointerenter',
      (e) => {
        if (e.target instanceof Element && e.target.matches('.btn, .skin-card .btn')) this.audio.uiHover();
      },
      true,
    );

    this.buildSkins();
    this.bindSettings();
    this.refreshMute();
  }

  // ---------------------------------------------------------------- screens

  show(name) {
    for (const s of document.querySelectorAll('.screen')) s.classList.remove('active');
    this.current = name;
    if (name) {
      const node = this.$(`screen-${name}`);
      if (node) node.classList.add('active');
      const first = node?.querySelector('.btn-primary, .btn');
      if (first && !matchMedia('(pointer: coarse)').matches) first.focus({ preventScroll: true });
    }
    if (name === 'menu') this.refreshMenu();
    if (name === 'skins') this.refreshSkins();
    if (name === 'settings') this.refreshSettings();
  }

  setHud(visible) {
    this.el.hud.classList.toggle('hidden', !visible);
    document.body.classList.toggle('in-game', visible);
  }

  refreshMenu() {
    this.$('menu-best').textContent = fmt(this.save.data.best);
    this.$('menu-energy').textContent = fmt(this.save.data.energyBank);
  }

  // ---------------------------------------------------------------- HUD

  resetHud(best) {
    this.displayScore = 0;
    this.el.score.textContent = '0';
    this.el.best.textContent = fmt(best);
    this.el.mult.textContent = '1';
    this.lastMult = 1;
    this.el.comboRing.style.strokeDashoffset = RING;
    for (const k of Object.keys(this.pu)) this.pu[k].node.classList.remove('active', 'ending');
    this.el.banner.classList.remove('show');
    this.el.popups.textContent = '';
  }

  updateHud(dt, s) {
    // smooth count-up toward the real score
    const diff = s.score - this.displayScore;
    this.displayScore += diff * Math.min(1, dt * 12) + Math.sign(diff) * Math.min(Math.abs(diff), dt * 30);
    if (Math.abs(s.score - this.displayScore) < 1) this.displayScore = s.score;
    const text = fmt(this.displayScore);
    if (this.el.score.textContent !== text) this.el.score.textContent = text;
    const best = fmt(Math.max(s.best, this.displayScore));
    if (this.el.best.textContent !== best) this.el.best.textContent = best;
    if (s.multiplier !== this.lastMult) {
      this.el.mult.textContent = String(s.multiplier);
      if (s.multiplier > this.lastMult) {
        this.el.multWrap.classList.remove('bump');
        void this.el.multWrap.offsetWidth;
        this.el.multWrap.classList.add('bump');
        setTimeout(() => this.el.multWrap.classList.remove('bump'), 160);
      }
      this.lastMult = s.multiplier;
    }
    this.el.comboRing.style.strokeDashoffset = String(RING * (1 - s.comboFrac));
    const dist = fmt(s.distance);
    if (this.el.distance.textContent !== dist) this.el.distance.textContent = dist;
    const kmh = String(Math.round(s.speed * 7.2));
    if (this.el.speed.textContent !== kmh) this.el.speed.textContent = kmh;

    for (const k of Object.keys(this.pu)) {
      const t = s.timers[k];
      const p = this.pu[k];
      const active = t > 0;
      p.node.classList.toggle('active', active);
      if (active) {
        p.ring.style.strokeDashoffset = String(PU_RING * (1 - t / POWERUPS[k].duration));
        p.node.classList.toggle('ending', t < 1.5);
      }
    }
    const held = s.held;
    this.el.thLeft.classList.toggle('held', held.l);
    this.el.thRight.classList.toggle('held', held.r);
  }

  tutorial(html) {
    const el = this.$('tutorial');
    if (!html) {
      el.classList.add('hidden');
      return;
    }
    this.$('tutorial-text').innerHTML = html;
    el.classList.remove('hidden');
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
  }

  bumpMultiplier() {
    const w = this.el.multWrap;
    w.classList.remove('bump');
    void w.offsetWidth;
    w.classList.add('bump');
    setTimeout(() => w.classList.remove('bump'), 160);
  }

  showTouchHint(v) {
    this.el.touchHint.classList.toggle('show', v);
  }

  banner(kicker, title, color = '#00f5ff') {
    const b = this.el.banner;
    this.el.bannerKicker.textContent = kicker;
    this.el.bannerTitle.textContent = title;
    b.style.setProperty('--accent', color);
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
  }

  popup(html, cls = 'near', color) {
    const node = this.popupPool.pop() || document.createElement('div');
    node.className = `popup ${cls}`;
    node.innerHTML = html;
    node.style.color = color || '';
    node.style.marginLeft = `${(Math.random() - 0.5) * 60}px`;
    this.el.popups.appendChild(node);
    setTimeout(() => {
      node.remove();
      if (this.popupPool.length < 12) this.popupPool.push(node);
    }, 900);
  }

  flash(color = '#ffffff', strength = 0.6, duration = 260) {
    const f = this.el.flash;
    f.style.transition = 'none';
    f.style.background = color;
    f.style.opacity = String(strength);
    void f.offsetWidth;
    f.style.transition = `opacity ${duration}ms ease-out`;
    f.style.opacity = '0';
  }

  countdown(value) {
    const c = this.el.countdown;
    c.textContent = value;
    c.classList.remove('tick');
    void c.offsetWidth;
    c.classList.add('tick');
  }

  // ---------------------------------------------------------------- game over

  showGameOver(r) {
    this.show('gameover');
    this.$('go-new').classList.toggle('show', r.isBest);
    const cause = this.$('go-cause');
    cause.classList.toggle('show', !!r.cause);
    if (r.cause) {
      cause.style.setProperty('--cause', r.cause.color);
      this.$('go-cause-name').textContent = r.cause.name;
      this.$('go-tip').textContent = r.cause.tip;
    }
    this.$('go-best').textContent = fmt(r.best);
    this.$('go-distance').textContent = `${fmt(r.distance)} m`;
    this.$('go-energy').textContent = `+${fmt(r.energy)}`;
    this.$('go-time').textContent = `${r.time.toFixed(1)}s`;
    const next = SKINS.find((s) => !this.save.isUnlocked(s.id) && s.price > 0);
    const unlockEl = this.$('go-unlock');
    if (next) {
      const need = next.price - this.save.data.energyBank;
      unlockEl.textContent = need <= 0 ? `${next.name} SKIN CAN BE UNLOCKED!` : `${fmt(need)} ENERGY TO UNLOCK ${next.name}`;
    } else unlockEl.textContent = 'ALL SKINS UNLOCKED';
    // count-up animation
    const el = this.$('go-score');
    const start = performance.now();
    const dur = Math.min(900, 300 + r.score / 20);
    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur);
      el.textContent = fmt(r.score * (1 - Math.pow(1 - t, 3)));
      if (t < 1 && this.current === 'gameover') requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ---------------------------------------------------------------- skins

  buildSkins() {
    const grid = this.$('skin-grid');
    grid.textContent = '';
    this.skinCards = {};
    for (const skin of SKINS) {
      const card = document.createElement('div');
      card.className = `skin-card${skin.dark ? ' dark' : ''}`;
      card.style.setProperty('--skin', hex(skin.core));
      card.style.setProperty('--shell', hex(skin.shell));
      card.style.setProperty('--trailA', hex(skin.trailA));
      card.style.setProperty('--trailB', hex(skin.trailB));
      card.innerHTML = `<div class="skin-orb"></div><div class="skin-trail"></div><div class="skin-name">${skin.name}</div><button class="btn"><span></span></button>`;
      const btn = card.querySelector('.btn');
      btn.addEventListener('click', () => {
        this.audio.unlock();
        this.handlers.skin?.(skin);
      });
      card.addEventListener('pointerenter', () => this.handlers.previewSkin?.(skin));
      card.addEventListener('pointerleave', () => this.handlers.previewSkin?.(null));
      grid.appendChild(card);
      this.skinCards[skin.id] = { card, btn, label: btn.querySelector('span') };
    }
  }

  refreshSkins() {
    this.$('skins-energy').textContent = fmt(this.save.data.energyBank);
    for (const skin of SKINS) {
      const { card, btn, label } = this.skinCards[skin.id];
      const unlocked = this.save.isUnlocked(skin.id);
      const selected = this.save.data.selectedSkin === skin.id;
      card.classList.toggle('locked', !unlocked);
      card.classList.toggle('selected', selected);
      btn.classList.toggle('btn-primary', selected);
      btn.classList.toggle('cant', !unlocked && this.save.data.energyBank < skin.price);
      label.textContent = selected ? 'EQUIPPED' : unlocked ? 'SELECT' : `⬢ ${fmt(skin.price)}`;
    }
  }

  // ---------------------------------------------------------------- settings

  bindSettings() {
    for (const input of document.querySelectorAll('[data-setting]')) {
      input.addEventListener('input', () => {
        this.handlers.setting?.(input.dataset.setting, Number(input.value));
      });
    }
    for (const btn of document.querySelectorAll('[data-toggle]')) {
      btn.addEventListener('click', () => {
        this.audio.unlock();
        this.audio.uiClick();
        const key = btn.dataset.toggle;
        this.handlers.setting?.(key, !this.save.settings[key]);
        this.refreshSettings();
      });
    }
    for (const seg of document.querySelectorAll('[data-setting-seg]')) {
      for (const btn of seg.querySelectorAll('button')) {
        btn.addEventListener('click', () => {
          this.audio.uiClick();
          this.handlers.setting?.(seg.dataset.settingSeg, btn.dataset.value);
          this.refreshSettings();
        });
      }
    }
    for (const btn of document.querySelectorAll('[data-confirm]')) {
      btn.addEventListener('click', () => {
        this.el.confirm.classList.add('hidden');
        if (btn.dataset.confirm === 'yes') this.confirmCb?.();
        this.confirmCb = null;
      });
    }
  }

  refreshSettings(qualityInfo) {
    const s = this.save.settings;
    for (const input of document.querySelectorAll('[data-setting]')) input.value = String(s[input.dataset.setting]);
    for (const btn of document.querySelectorAll('[data-toggle]')) {
      const on = !!s[btn.dataset.toggle];
      btn.classList.toggle('on', btn.dataset.toggle === 'muted' ? !on : on);
      btn.textContent = on ? btn.dataset.on : btn.dataset.off;
    }
    for (const seg of document.querySelectorAll('[data-setting-seg]')) {
      for (const btn of seg.querySelectorAll('button')) btn.classList.toggle('on', btn.dataset.value === s[seg.dataset.settingSeg]);
    }
    if (qualityInfo) this.qualityInfo = qualityInfo;
    if (this.qualityInfo) this.el.qualityInfo.textContent = this.qualityInfo;
    this.refreshMute();
  }

  refreshMute() {
    this.el.mute.classList.toggle('muted', !!this.save.settings.muted);
  }

  confirm(text, cb) {
    this.el.confirmText.textContent = text;
    this.confirmCb = cb;
    this.el.confirm.classList.remove('hidden');
  }
}
