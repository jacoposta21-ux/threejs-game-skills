/** DOM UI: title, district/shift select, HUD, minimap, popups, end of shift, garage, settings. */
import { S } from '../strings.ts';
import { DISTRICT_ORDER, DISTRICT_TURNS, DISTRICT_UNLOCK_STARS } from '../levels/districts.ts';
import { UPGRADES, UPGRADE_ORDER, upgradeCost, type UpgradeId } from '../game/rules.ts';
import { totalStars, type SaveData } from '../game/save.ts';
import { CELL, Cell, type DistrictId, type MapData } from '../levels/types.ts';
import './style.css';

export type Screen = 'none' | 'title' | 'select' | 'hud' | 'pause' | 'end' | 'garage' | 'settings';

const ICONS: Record<UpgradeId, string> = { motor: '⚙️', suspension: '🛞', rack: '🧺', bag: '🔥' };

export interface HudState {
  time: number;
  timeMax: number;
  heat: number;
  coins: number;
  speed: number;
  stops: { count: number; done: boolean; next: boolean }[];
  pile: number;
  pileMax: number;
}

export interface EndInfo {
  turn: number;
  stars: number;
  delivered: number;
  total: number;
  lost: number;
  tips: number;
  reason: string;
  canDouble: boolean;
  hasNext: boolean;
}

function h(html: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}
const stars = (n: number, of = 3) => Array.from({ length: of }, (_, i) => `<span class="star ${i < n ? '' : 'off'}">★</span>`).join('');

export class UI {
  readonly root: HTMLElement;
  private screens: Partial<Record<Screen, HTMLElement>> = {};
  hud!: HTMLElement;
  private popLayer!: HTMLElement;
  private minimap!: HTMLCanvasElement;
  private mmBase: HTMLCanvasElement | null = null;
  private mmScale = 1;
  private hudEls: Record<string, HTMLElement> = {};
  private lastHud = '';
  labels: HTMLElement[] = [];
  district: DistrictId = 'centro';
  isTouch = false;

  // callbacks
  onPlay: () => void = () => {};
  onTurn: (n: number) => void = () => {};
  onGarage: () => void = () => {};
  onSettings: () => void = () => {};
  onBack: () => void = () => {};
  onBuy: (id: UpgradeId) => void = () => {};
  onPause: () => void = () => {};
  onResume: () => void = () => {};
  onRestart: () => void = () => {};
  onMenu: () => void = () => {};
  onNext: () => void = () => {};
  onDouble: () => void = () => {};
  onMute: () => void = () => {};
  onReset: () => void = () => {};
  onQuality: (q: 'auto' | 'high' | 'low') => void = () => {};
  onClick: () => void = () => {};

  constructor(root: HTMLElement) {
    this.root = root;
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    if (this.isTouch) document.body.classList.add('touch-on');
    root.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) this.onClick();
    });
    this.buildHud();
  }

  private mount(name: Screen, el: HTMLElement) {
    this.screens[name]?.remove();
    el.id = name;
    this.screens[name] = el;
    this.root.appendChild(el);
    return el;
  }

  show(...names: Screen[]) {
    for (const [k, el] of Object.entries(this.screens)) el!.classList.toggle('hidden', !names.includes(k as Screen));
    this.hud.classList.toggle('hidden', !names.includes('hud'));
  }

  // ---------- title ----------
  title(save: SaveData, muted: boolean) {
    const el = this.mount(
      'title',
      h(`<div class="screen">
        <div class="logo"><span class="logo-pizza">Pizza</span><span class="logo-wobble">Wobble</span></div>
        <div class="tag">${S.tagline}</div>
        <div class="stats"><div class="chip"><span class="coin"></span>${save.coins}</div><div class="chip"><span class="star">★</span>${totalStars(save)}/90</div>
          <button class="round" data-a="mute">${muted ? '🔇' : '🔊'}</button></div>
        <div class="menu">
          <button class="btn" data-a="play">▶ ${S.play}</button>
          <button class="btn gold" data-a="garage">${S.garage}</button>
          <button class="btn ghost small" data-a="settings">${S.settings}</button>
        </div></div>`),
    );
    el.querySelector('[data-a=play]')!.addEventListener('click', () => this.onPlay());
    el.querySelector('[data-a=garage]')!.addEventListener('click', () => this.onGarage());
    el.querySelector('[data-a=settings]')!.addEventListener('click', () => this.onSettings());
    el.querySelector('[data-a=mute]')!.addEventListener('click', () => this.onMute());
  }

  // ---------- district + shift select ----------
  select(save: SaveData) {
    const total = totalStars(save);
    const tabs = DISTRICT_ORDER.map((d) => {
      const locked = total < DISTRICT_UNLOCK_STARS[d];
      return `<button class="tab ${d === this.district ? 'on' : ''} ${locked ? 'locked' : ''}" data-d="${d}">
        <b>${S.districts[d]}</b><small>${S.districtDesc[d]}</small>${locked ? `<span class="lock">🔒 ${S.locked(DISTRICT_UNLOCK_STARS[d])}</span>` : ''}</button>`;
    }).join('');
    const [a, b] = DISTRICT_TURNS[this.district];
    const dLocked = total < DISTRICT_UNLOCK_STARS[this.district];
    let turns = '';
    for (let t = a; t <= b; t++) {
      const prevOk = t === a || save.stars[t - 2] > 0;
      const ok = !dLocked && prevOk;
      turns += `<button class="turn" data-t="${t}" ${ok ? '' : 'disabled'}>${t}<small>${stars(save.stars[t - 1])}</small></button>`;
    }
    const el = this.mount(
      'select',
      h(`<div class="screen"><div class="panel">
        <div class="row"><h2>${S.districts[this.district]}</h2><div class="row"><div class="chip"><span class="star">★</span>${total}</div><button class="btn ghost small" data-a="back">${S.back}</button></div></div>
        <div class="tabs">${tabs}</div><div class="turns">${turns}</div></div></div>`),
    );
    el.querySelectorAll<HTMLButtonElement>('.tab').forEach((t) =>
      t.addEventListener('click', () => {
        this.district = t.dataset.d as DistrictId;
        this.select(save);
        this.show('select');
      }),
    );
    el.querySelectorAll<HTMLButtonElement>('.turn').forEach((t) => t.addEventListener('click', () => this.onTurn(Number(t.dataset.t))));
    el.querySelector('[data-a=back]')!.addEventListener('click', () => this.onBack());
  }

  // ---------- HUD ----------
  private buildHud() {
    this.hud = h(`<div id="hud" class="hidden">
      <div class="hud-tl"><div class="timer" data-h="timer"><span data-h="time">150</span></div>
        <div class="heat"><div class="lbl"><span>🍕 ${S.heat}</span><span data-h="heatn">100%</span></div><div class="hb"><i data-h="heat"></i></div><div class="stack" data-h="stack"></div></div></div>
      <div class="hud-tc" data-h="stops"></div>
      <div class="hud-tr"><div class="row"><div class="chip"><span class="coin"></span><span data-h="coins">0</span></div>
        <button class="round" data-a="pause">❚❚</button></div><canvas id="minimap" width="220" height="220"></canvas></div>
      <div class="hud-bl"><button class="btn ghost small" data-a="reset">↺ ${S.respawn}</button></div>
      <div class="speedo"><span data-h="speed">0</span> <small>km/h</small></div>
      <div class="touch l ${this.isTouch ? '' : 'hidden'}"><div class="tbtn" data-t="left">◀</div><div class="tbtn" data-t="right">▶</div></div>
      <div class="touch r ${this.isTouch ? '' : 'hidden'}"><div class="tbtn brk" data-t="brake">■</div><div class="tbtn gas" data-t="gas">▲</div></div>
      <div class="hint" data-h="hint">${this.isTouch ? S.touchHint : S.controlsHint}</div>
      <div class="popup-layer" data-h="pops"></div>
    </div>`);
    this.root.appendChild(this.hud);
    this.hud.querySelectorAll<HTMLElement>('[data-h]').forEach((e) => (this.hudEls[e.dataset.h!] = e));
    this.popLayer = this.hudEls.pops;
    this.minimap = this.hud.querySelector('#minimap') as HTMLCanvasElement;
    this.hud.querySelector('[data-a=pause]')!.addEventListener('click', () => this.onPause());
    this.hud.querySelector('[data-a=reset]')!.addEventListener('click', () => this.onReset());
  }

  touchButtons(): Record<string, HTMLElement> {
    const out: Record<string, HTMLElement> = {};
    this.hud.querySelectorAll<HTMLElement>('.tbtn').forEach((b) => (out[b.dataset.t!] = b));
    return out;
  }

  hideHint() {
    this.hudEls.hint.style.opacity = '0';
  }
  showHint() {
    this.hudEls.hint.style.opacity = '1';
  }

  updateHud(s: HudState) {
    const tsec = Math.ceil(s.time);
    const key = `${tsec}|${Math.round(s.heat)}|${s.coins}|${Math.round(s.speed * 3.6)}|${s.pile}|${s.stops.map((x) => `${x.count}${x.done}${x.next}`).join()}`;
    if (key === this.lastHud) return;
    this.lastHud = key;
    this.hudEls.time.textContent = String(Math.max(0, tsec));
    this.hudEls.timer.style.setProperty('--p', String(Math.max(0, s.time / s.timeMax)));
    this.hudEls.timer.classList.toggle('warn', s.time <= 15);
    this.hudEls.heat.style.width = `${Math.max(0, s.heat)}%`;
    this.hudEls.heatn.textContent = `${Math.round(s.heat)}%`;
    this.hudEls.coins.textContent = String(s.coins);
    this.hudEls.speed.textContent = String(Math.round(Math.abs(s.speed) * 3.6));
    let st = '';
    for (let i = 0; i < s.pileMax; i++) st += `<i class="${i < s.pile ? '' : 'gone'}"></i>`;
    this.hudEls.stack.innerHTML = st;
    this.hudEls.stops.innerHTML = s.stops
      .map((x, i) => `<div class="stop ${x.done ? 'done' : ''} ${x.next ? 'next' : ''}">${x.done ? '✓' : `#${i + 1}`} <span>🍕×${x.count}</span></div>`)
      .join('');
  }

  popup(text: string, cls = '', ms = 1150) {
    const el = document.createElement('div');
    el.className = `pop ${cls}`;
    el.textContent = text;
    this.popLayer.appendChild(el);
    setTimeout(() => el.remove(), ms);
  }

  /** Coins fly from a screen point to the HUD coin counter. */
  flyCoins(x: number, y: number, n: number, onEach: (i: number) => void) {
    const target = this.hudEls.coins.getBoundingClientRect();
    for (let i = 0; i < n; i++) {
      const c = document.createElement('div');
      c.className = 'flycoin';
      c.style.left = `${x}px`;
      c.style.top = `${y}px`;
      this.popLayer.appendChild(c);
      const dx = target.left - x + (Math.random() - 0.5) * 10;
      const dy = target.top - y;
      const ox = (Math.random() - 0.5) * 140;
      const oy = -60 - Math.random() * 80;
      c.animate(
        [
          { transform: 'translate(0,0) scale(.6)' },
          { transform: `translate(${ox}px,${oy}px) scale(1.2)`, offset: 0.35 },
          { transform: `translate(${dx}px,${dy}px) scale(.8)` },
        ],
        { duration: 750 + i * 60, easing: 'cubic-bezier(.5,0,.6,1)', delay: i * 45 },
      ).onfinish = () => {
        c.remove();
        onEach(i);
      };
    }
  }

  /** Offer a rewarded booster inside the HUD (non-blocking). */
  offer(text: string, onYes: () => void, ms = 6000): () => void {
    const el = h(`<div class="offer"><button class="btn gold small">🎬 ${text}</button><button class="btn ghost small">✕</button></div>`);
    this.hud.appendChild(el);
    const close = () => el.remove();
    const [yes, no] = el.querySelectorAll('button');
    yes.addEventListener('click', () => {
      close();
      onYes();
    });
    no.addEventListener('click', close);
    setTimeout(close, ms);
    return close;
  }

  setLabels(n: number) {
    for (const l of this.labels) l.remove();
    this.labels = [];
    for (let i = 0; i < n; i++) {
      const l = h(`<div class="label3d"></div>`);
      this.popLayer.appendChild(l);
      this.labels.push(l);
    }
  }

  // ---------- minimap ----------
  buildMinimap(map: MapData) {
    const c = document.createElement('canvas');
    const W = map.cols * CELL;
    const D = map.rows * CELL;
    const size = 512;
    this.mmScale = size / Math.max(W, D);
    c.width = Math.ceil(W * this.mmScale);
    c.height = Math.ceil(D * this.mmScale);
    const g = c.getContext('2d')!;
    const colors: Record<number, string> = {
      [Cell.ROAD]: '#fbf3df',
      [Cell.SIDEWALK]: '#e9dcc0',
      [Cell.PLAZA]: '#f6e8c4',
      [Cell.BUILDING]: '#d79a6e',
      [Cell.WATER]: '#3fbfc2',
      [Cell.FOUNTAIN]: '#7fd4e8',
      [Cell.STAIRS]: '#c9b28c',
      [Cell.QUAY]: '#efe2c6',
      [Cell.GARDEN]: '#9cba6a',
    };
    const s = CELL * this.mmScale;
    for (let z = 0; z < map.rows; z++)
      for (let x = 0; x < map.cols; x++) {
        g.fillStyle = colors[map.cells[z * map.cols + x]] ?? '#ccc';
        g.fillRect(x * s, z * s, s + 0.5, s + 0.5);
      }
    this.mmBase = c;
  }

  drawMinimap(px: number, pz: number, heading: number, stops: { x: number; z: number; done: boolean; next: boolean }[], cars: { x: number; z: number }[], route: number[], cols: number) {
    const g = this.minimap.getContext('2d')!;
    const S2 = this.minimap.width;
    g.save();
    g.fillStyle = '#d79a6e';
    g.fillRect(0, 0, S2, S2);
    g.translate(S2 / 2, S2 / 2);
    // rotate so the player always faces up
    g.rotate(Math.PI + heading);
    const zoom = 1.9;
    g.scale(zoom, zoom);
    g.translate(-px * this.mmScale, -pz * this.mmScale);
    if (this.mmBase) g.drawImage(this.mmBase, 0, 0);
    const k = this.mmScale;
    if (route.length > 1) {
      g.strokeStyle = 'rgba(215,38,44,.75)';
      g.lineWidth = 3 / zoom + 1.2;
      g.setLineDash([4, 3]);
      g.beginPath();
      for (let i = 0; i < route.length; i++) {
        const c = route[i];
        const x = ((c % cols) * CELL + 1) * k;
        const z = (Math.floor(c / cols) * CELL + 1) * k;
        if (i === 0) g.moveTo(x, z);
        else g.lineTo(x, z);
      }
      g.stroke();
      g.setLineDash([]);
    }
    g.fillStyle = '#4a5b75';
    for (const c of cars) g.fillRect(c.x * k - 2, c.z * k - 2, 4, 4);
    for (const s of stops) {
      if (s.done) continue;
      g.fillStyle = s.next ? '#d7262c' : '#f2a33a';
      g.beginPath();
      g.arc(s.x * k, s.z * k, s.next ? 6 : 4.5, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#fff';
      g.lineWidth = 1.5;
      g.stroke();
    }
    g.restore();
    // player arrow (always centre, up)
    g.fillStyle = '#d7262c';
    g.strokeStyle = '#fff';
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(S2 / 2, S2 / 2 - 11);
    g.lineTo(S2 / 2 + 8, S2 / 2 + 8);
    g.lineTo(S2 / 2, S2 / 2 + 4);
    g.lineTo(S2 / 2 - 8, S2 / 2 + 8);
    g.closePath();
    g.fill();
    g.stroke();
  }

  // ---------- pause ----------
  pause(muted: boolean) {
    const el = this.mount(
      'pause',
      h(`<div class="screen" style="background:rgba(74,46,31,.35)"><div class="panel"><h2>${S.paused}</h2>
        <div class="btnrow"><button class="btn" data-a="resume">▶ ${S.resume}</button><button class="btn ghost" data-a="restart">↺ ${S.restart}</button></div>
        <div class="btnrow"><button class="btn ghost small" data-a="mute">${muted ? '🔇' : '🔊'} ${S.sound}</button><button class="btn ghost small" data-a="menu">${S.menu}</button></div></div></div>`),
    );
    el.querySelector('[data-a=resume]')!.addEventListener('click', () => this.onResume());
    el.querySelector('[data-a=restart]')!.addEventListener('click', () => this.onRestart());
    el.querySelector('[data-a=menu]')!.addEventListener('click', () => this.onMenu());
    el.querySelector('[data-a=mute]')!.addEventListener('click', () => {
      this.onMute();
    });
  }

  // ---------- end of shift ----------
  end(info: EndInfo) {
    const el = this.mount(
      'end',
      h(`<div class="screen" style="background:rgba(74,46,31,.25)"><div class="panel">
        <h2>${S.shiftN(info.turn)} · ${info.reason}</h2>
        <p class="bigstars">${stars(info.stars)}</p>
        <div class="statrow"><div>${S.delivered}<b>${info.delivered}/${info.total}</b></div><div>${S.pizzasLost}<b>${info.lost}</b></div><div>${S.tips}<b data-e="tips"><span class="coin"></span> ${info.tips}</b></div></div>
        ${info.canDouble ? `<div class="btnrow"><button class="btn gold" data-a="double">🎬 ${S.doubleTips}</button></div>` : ''}
        <div class="btnrow">${info.hasNext ? `<button class="btn" data-a="next">${S.next} ▶</button>` : ''}<button class="btn alt" data-a="retry">↺ ${S.retry}</button>
          <button class="btn gold small" data-a="garage">${S.garage}</button><button class="btn ghost small" data-a="menu">${S.menu}</button></div></div></div>`),
    );
    el.querySelector('[data-a=next]')?.addEventListener('click', () => this.onNext());
    el.querySelector('[data-a=retry]')!.addEventListener('click', () => this.onRestart());
    el.querySelector('[data-a=garage]')!.addEventListener('click', () => this.onGarage());
    el.querySelector('[data-a=menu]')!.addEventListener('click', () => this.onMenu());
    const dbl = el.querySelector<HTMLButtonElement>('[data-a=double]');
    dbl?.addEventListener('click', () => {
      dbl.disabled = true;
      this.onDouble();
    });
  }
  setEndTips(v: number) {
    const t = this.screens.end?.querySelector('[data-e=tips]');
    if (t) t.innerHTML = `<span class="coin"></span> ${v}`;
  }

  // ---------- garage ----------
  garage(save: SaveData) {
    const cards = UPGRADE_ORDER.map((id) => {
      const lvl = save.upgrades[id];
      const max = UPGRADES[id].max;
      const cost = upgradeCost(id, lvl);
      const pips = Array.from({ length: max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
      const can = lvl < max && save.coins >= cost;
      return `<div class="up"><div class="ic">${ICONS[id]}</div><b>${S.upgrades[id][0]}</b><small>${S.upgrades[id][1]}</small><div class="pips">${pips}</div>
        <button class="btn small ${lvl >= max ? 'ghost' : ''}" data-u="${id}" ${can ? '' : 'disabled'}>${lvl >= max ? S.maxed : `<span class="coin"></span> ${cost}`}</button></div>`;
    }).join('');
    const el = this.mount(
      'garage',
      h(`<div class="screen"><div class="panel" style="max-width:min(760px,62vw)"><div class="row"><h2>${S.garage}</h2><div class="chip"><span class="coin"></span>${save.coins}</div></div>
        <div class="ups">${cards}</div><div class="btnrow"><button class="btn" data-a="back">${S.back}</button></div></div></div>`),
    );
    el.querySelectorAll<HTMLButtonElement>('[data-u]').forEach((b) => b.addEventListener('click', () => this.onBuy(b.dataset.u as UpgradeId)));
    el.querySelector('[data-a=back]')!.addEventListener('click', () => this.onBack());
  }

  // ---------- settings ----------
  settings(save: SaveData) {
    const q = save.quality;
    const el = this.mount(
      'settings',
      h(`<div class="screen"><div class="panel"><h2>${S.settings}</h2>
        <div class="set-row"><span>${S.quality}</span><div class="seg">
          <button data-q="auto" class="${q === 'auto' ? 'on' : ''}">${S.qualityAuto}</button><button data-q="high" class="${q === 'high' ? 'on' : ''}">${S.qualityHigh}</button><button data-q="low" class="${q === 'low' ? 'on' : ''}">${S.qualityLow}</button></div></div>
        <div class="set-row"><span>${S.sound}</span><div class="seg"><button data-a="mute" class="${save.muted ? '' : 'on'}">${save.muted ? S.off : S.on}</button></div></div>
        <p style="color:var(--ink2);font-size:15px">${S.controlsHint}</p>
        <div class="btnrow"><button class="btn" data-a="back">${S.back}</button></div></div></div>`),
    );
    el.querySelectorAll<HTMLButtonElement>('[data-q]').forEach((b) => b.addEventListener('click', () => this.onQuality(b.dataset.q as 'auto')));
    el.querySelector('[data-a=mute]')!.addEventListener('click', () => this.onMute());
    el.querySelector('[data-a=back]')!.addEventListener('click', () => this.onBack());
  }
}
