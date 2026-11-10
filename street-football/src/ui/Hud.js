import * as THREE from 'three';
import { MATCH, TEAMS } from '../config.js';

const $ = (id) => document.getElementById(id);
const _v = new THREE.Vector3();

export function formatClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** DOM HUD: scoreboard, clock, player chip, style points, stamina, power ring, popups, banners. */
export class Hud {
  constructor() {
    this.root = $('hud');
    this.el = {
      home: $('home-score'),
      away: $('away-score'),
      clock: $('match-clock'),
      clockBox: $('match-clock').parentElement,
      style: $('style-points'),
      combo: $('combo-tag'),
      stamina: $('stamina'),
      staminaFill: $('stamina-fill'),
      gb: $('gb'),
      gbFill: $('gb-fill'),
      poss: $('poss-tag'),
      power: $('power-meter'),
      popups: $('popups'),
      toast: $('toast'),
      banner: $('banner'),
      bannerText: $('banner-text'),
      bannerSub: $('banner-sub'),
      num: $('player-num'),
      name: $('player-name'),
    };
    $('home-badge').textContent = TEAMS.home.short;
    $('away-badge').textContent = TEAMS.away.short;
    this.last = {};
    this.toastTimer = 0;
    this.bannerTimer = 0;
  }

  /** Combo multiplier badge (hidden below x2). */
  setCombo(count) {
    const tag = this.el.combo;
    if (count >= 2) {
      tag.textContent = `COMBO x${count}`;
      tag.classList.remove('hidden');
      this.punch(tag);
    } else tag.classList.add('hidden');
  }

  show(visible) {
    this.root.classList.toggle('hidden', !visible);
  }

  setTeams(home, away) {
    $('home-badge').textContent = home;
    $('away-badge').textContent = away;
  }

  setPlayer(look) {
    this.el.num.textContent = look.number;
    this.el.name.textContent = look.name;
  }

  setText(key, el, value) {
    if (this.last[key] === value) return false;
    this.last[key] = value;
    el.textContent = value;
    return true;
  }

  punch(el) {
    el.animate([{ transform: 'scale(1.45)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'cubic-bezier(.2,1.6,.4,1)' });
  }

  update(dt, state) {
    if (this.setText('home', this.el.home, String(state.score.home)) && state.score.home) this.punch(this.el.home);
    if (this.setText('away', this.el.away, String(state.score.away)) && state.score.away) this.punch(this.el.away);
    this.setText('clock', this.el.clock, state.clockText ?? formatClock(state.timeLeft));
    const urgent = state.timeLeft <= 10 && state.timeLeft > 0 && state.phase === 'playing';
    this.el.clockBox.classList.toggle('urgent', urgent);
    const styleText = state.styleGoal ? `${state.style} / ${state.styleGoal}` : String(state.style);
    if (this.setText('style', this.el.style, styleText)) this.punch(this.el.style);
    const pct = state.stamina;
    this.el.staminaFill.style.transform = `scaleX(${pct.toFixed(3)})`;
    this.el.stamina.classList.toggle('low', pct < 0.25);
    this.el.poss.classList.toggle('on', state.possession);
    const gb = state.gb ?? 0;
    this.el.gbFill.style.transform = `scaleX(${gb.toFixed(3)})`;
    this.el.gb.classList.toggle('ready', gb >= 1 && !state.gbActive);
    this.el.gb.classList.toggle('active', !!state.gbActive);

    // Power ring follows the player on screen.
    const meter = this.el.power;
    if (state.charge > 0) {
      meter.classList.remove('hidden');
      const p = state.screenPos;
      meter.style.left = `${p.x}px`;
      meter.style.top = `${p.y}px`;
      meter.style.setProperty('--p', state.charge.toFixed(3));
      meter.style.setProperty('--meter-color', state.charge > 0.85 ? '#ff5a1f' : '#f6c915');
    } else meter.classList.add('hidden');

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.classList.add('hidden');
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.el.banner.classList.add('hidden');
    }
  }

  /** Floating text at a world position, e.g. "GOAL +1000". */
  popup(text, worldPos, camera, { big = false } = {}) {
    _v.copy(worldPos).project(camera);
    const w = this.root.clientWidth || window.innerWidth;
    const h = this.root.clientHeight || window.innerHeight;
    const div = document.createElement('div');
    div.className = big ? 'popup big' : 'popup';
    div.textContent = text;
    div.style.left = `${((_v.x + 1) / 2) * w}px`;
    div.style.top = `${((1 - _v.y) / 2) * h}px`;
    this.el.popups.appendChild(div);
    // Remove when the animation finishes (frame-driven), with a safety timeout,
    // so popups still show on slow devices where animation time lags wall time.
    div.addEventListener('animationend', () => div.remove(), { once: true });
    setTimeout(() => div.remove(), 6000);
  }

  /** Name the trick being played, FIFA-Street style, just above the controls. */
  trickName(label) {
    const el = document.getElementById('trick-name');
    if (!el) return;
    el.textContent = label;
    el.classList.remove('show');
    void el.offsetWidth; // restart the CSS animation
    el.classList.add('show');
  }

  toast(text, seconds = 2.2) {
    this.el.toast.textContent = text;
    this.el.toast.classList.remove('hidden');
    this.toastTimer = seconds;
  }

  banner(text, sub = '', { seconds = 2.4, count = false } = {}) {
    const b = this.el.banner;
    this.el.bannerText.textContent = text;
    this.el.bannerSub.textContent = sub;
    this.el.bannerSub.classList.toggle('hidden', !sub);
    b.classList.remove('hidden', 'show', 'count');
    void b.offsetWidth; // restart CSS animation
    b.classList.add(count ? 'count' : 'show');
    this.bannerTimer = seconds;
  }

  hideBanner() {
    this.el.banner.classList.add('hidden');
    this.bannerTimer = 0;
  }

  reset() {
    this.last = {};
    this.el.popups.replaceChildren();
    this.hideBanner();
    this.el.toast.classList.add('hidden');
    this.update(0, { score: { home: 0, away: 0 }, timeLeft: MATCH.duration, style: 0, stamina: 1, possession: false, charge: 0, phase: 'countdown' });
  }
}
