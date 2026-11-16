import { MIRACLES } from '../game/miracles.js';
import { MIRACLE_ICONS, LOCK_ICON } from './icons.js';
import { LANDMARKS } from '../world/layout.js';
import { drawWorldMap } from './Minimap.js';

const $ = (id) => document.getElementById(id);
const STAR = '<svg viewBox="0 0 24 24"><path d="M12 2.6l2.8 6 6.6.7-5 4.4 1.5 6.5L12 16.9l-5.9 3.3 1.5-6.5-5-4.4 6.6-.7z"/></svg>';

const fmtTime = (s) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m ${Math.floor(s % 60)}s`;
};

/**
 * DOM UI: loading, main menu, HUD, pause, map, settings and how-to sheets.
 * Emits `ui:*` events on the bus; never mutates game state directly.
 */
export class UI {
  constructor(bus, audio) {
    this.bus = bus;
    this.audio = audio;
    this.toastCooldowns = new Map();
    this.dialogTimer = 0;
    this.bannerQueue = [];
    this.bannerTimer = 0;
    this.pauseTab = 'missions';
    this.lastObjective = '';

    $('stars').innerHTML = STAR.repeat(5);
    this.buildHotbar();
    this.bindMenu();
    this.bindPause();
    $('sheet-close').addEventListener('click', () => this.closeSheet());
    document.addEventListener('mouseover', (e) => {
      if (e.target instanceof Element && e.target.closest('.btn:not(:disabled)')) this.audio.uiHover();
    });
  }

  // ---------------------------------------------------------------- loading
  setLoading(progress, text) {
    $('loading-bar').style.width = `${Math.round(progress * 100)}%`;
    if (text) $('loading-text').textContent = text;
  }

  hideLoading() {
    $('loading').hidden = true;
  }

  showError(message) {
    $('loading').hidden = true;
    $('error-text').textContent = message;
    $('error').hidden = false;
  }

  // ---------------------------------------------------------------- menu
  bindMenu() {
    const click = (id, fn) => $(id).addEventListener('click', () => {
      this.audio.unlock();
      this.audio.uiClick();
      fn();
    });
    click('btn-play', () => this.bus.emit('ui:play', { newGame: false }));
    click('btn-new', () => this.bus.emit('ui:play', { newGame: true }));
    click('btn-settings', () => this.openSettings());
    click('btn-howto', () => this.openHowTo());
    $('btn-multiplayer').addEventListener('click', (e) => e.preventDefault());
  }

  showMenu(hasSave) {
    $('menu').hidden = false;
    $('hud').hidden = true;
    $('btn-play').textContent = hasSave ? 'PLAY — CONTINUE' : 'PLAY';
    $('btn-new').hidden = !hasSave;
  }

  hideMenu() {
    $('menu').hidden = true;
  }

  // ---------------------------------------------------------------- sheets
  openSheet(title, html) {
    $('sheet-title').textContent = title;
    $('sheet-body').innerHTML = html;
    $('sheet').hidden = false;
  }

  closeSheet() {
    this.audio.uiClick();
    $('sheet').hidden = true;
    this.bus.emit('ui:sheet-closed');
  }

  get sheetOpen() {
    return !$('sheet').hidden;
  }

  openSettings() {
    const s = this.settings;
    this.openSheet('Settings', `
      <label class="setting-row">Music volume <input type="range" id="set-music" min="0" max="1" step="0.05" value="${s.musicVolume}"></label>
      <label class="setting-row">Sound effects volume <input type="range" id="set-sfx" min="0" max="1" step="0.05" value="${s.sfxVolume}"></label>
      <label class="setting-row">Mouse sensitivity <input type="range" id="set-sens" min="0.2" max="3" step="0.1" value="${s.sensitivity}"></label>
      <label class="setting-row">Invert camera Y <input type="checkbox" id="set-invert" ${s.invertY ? 'checked' : ''}></label>
      <label class="setting-row">Graphics quality
        <select id="set-quality">
          ${['low', 'medium', 'high'].map((q) => `<option value="${q}" ${s.quality === q ? 'selected' : ''}>${q[0].toUpperCase() + q.slice(1)}</option>`).join('')}
        </select>
      </label>
      <label class="setting-row">Show FPS counter <input type="checkbox" id="set-fps" ${s.showFps ? 'checked' : ''}></label>
      <p class="note">Settings are saved on this device automatically.</p>`);
    const emit = () => this.bus.emit('ui:settings', {
      musicVolume: Number($('set-music').value),
      sfxVolume: Number($('set-sfx').value),
      sensitivity: Number($('set-sens').value),
      invertY: $('set-invert').checked,
      quality: $('set-quality').value,
      showFps: $('set-fps').checked,
    });
    for (const id of ['set-music', 'set-sfx', 'set-sens', 'set-invert', 'set-quality', 'set-fps']) {
      $(id).addEventListener('input', emit);
      $(id).addEventListener('change', emit);
    }
  }

  openHowTo() {
    const k = (key, text) => `<div><kbd>${key}</kbd>${text}</div>`;
    this.openSheet('How to Play', `
      <p>You are Jesus of Nazareth, back home and ready to explore. Wander the village, meet its landmarks and get to know every rooftop. Miracles, villagers, Romans and donkeys are on their way in future chapters.</p>
      <div class="howto-grid">
        ${k('W A S D', 'Move')}${k('Mouse', 'Rotate camera')}${k('Shift', 'Sprint')}${k('Space', 'Jump')}
        ${k('E', 'Interact')}${k('Wheel', 'Camera distance')}${k('RMB', 'Shoulder aim view')}${k('LMB', 'Use miracle')}
        ${k('1 – 6', 'Select miracle')}${k('F', 'Enter / exit vehicle')}${k('Tab', 'Open map')}${k('Esc', 'Pause menu')}
        ${k('← →', 'Turn camera (keys)')}
      </div>
      <p class="note"><b>Chapter I:</b> discover all seven landmarks of Nazareth. Gold pins on the minimap point to places you have not visited yet. Climb the outdoor stairs to reach the rooftops.</p>`);
  }

  // ---------------------------------------------------------------- HUD
  buildHotbar() {
    $('hotbar').innerHTML = MIRACLES.map((m, i) => `
      <div class="slot locked" data-slot="${i}" title="${m.name}">
        <span class="key">${m.key}</span>${MIRACLE_ICONS[m.id]}
        <span class="lock">${LOCK_ICON}</span><span class="cd"></span>
      </div>`).join('');
    this.slots = [...$('hotbar').children];
  }

  showHud() {
    $('hud').hidden = false;
  }

  hideHud() {
    $('hud').hidden = true;
  }

  setSelectedMiracle(index, unlocked) {
    this.slots.forEach((el, i) => {
      el.classList.toggle('selected', i === index);
      el.classList.toggle('locked', !unlocked.includes(MIRACLES[i].id));
    });
    const m = MIRACLES[index];
    const ready = unlocked.includes(m.id);
    $('miracle-label').innerHTML = `${m.name} <em>· ${ready ? 'Ready' : 'Not yet revealed'}</em>`;
  }

  setObjective(kicker, title, detailHtml) {
    const key = kicker + title + detailHtml;
    if (key === this.lastObjective) return;
    this.lastObjective = key;
    $('obj-kicker').textContent = kicker;
    $('obj-title').textContent = title;
    $('obj-detail').innerHTML = detailHtml;
  }

  setAttention(level) {
    [...$('stars').children].forEach((el, i) => el.classList.toggle('on', i < level));
  }

  setFollowers(n) {
    $('follower-count').textContent = String(n);
  }

  setRegion(name) {
    if ($('region-label').textContent !== name) $('region-label').textContent = name;
  }

  setPrompt(text) {
    const el = $('prompt');
    if (!text || !$('dialog').hidden) {
      el.hidden = true;
      return;
    }
    if ($('prompt-text').textContent !== text) $('prompt-text').textContent = text;
    el.hidden = false;
  }

  showDialog(name, text, seconds = 6) {
    $('dialog-name').textContent = name;
    $('dialog-text').textContent = text;
    $('dialog').hidden = false;
    $('prompt').hidden = true;
    this.dialogTimer = seconds;
  }

  hideDialog() {
    $('dialog').hidden = true;
    this.dialogTimer = 0;
  }

  get dialogOpen() {
    return !$('dialog').hidden;
  }

  setAiming(aiming) {
    $('crosshair').hidden = !aiming;
  }

  setLockHint(show) {
    $('lock-hint').hidden = !show;
  }

  setFps(show, fps, extra = '') {
    const el = $('fps');
    el.hidden = !show;
    if (show) el.textContent = `${Math.round(fps)} FPS ${extra}`;
  }

  toast(text, key = text, cooldown = 2.5) {
    const now = performance.now() / 1000;
    if ((this.toastCooldowns.get(key) || 0) > now) return;
    this.toastCooldowns.set(key, now + cooldown);
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    $('toasts').appendChild(el);
    while ($('toasts').children.length > 3) $('toasts').firstChild.remove();
    setTimeout(() => el.remove(), 3300);
  }

  banner(kicker, title, sub) {
    this.bannerQueue.push({ kicker, title, sub });
    if (this.bannerTimer <= 0) this.nextBanner();
  }

  nextBanner() {
    const b = this.bannerQueue.shift();
    const el = $('banner');
    if (!b) {
      el.hidden = true;
      return;
    }
    $('banner-kicker').textContent = b.kicker;
    $('banner-title').textContent = b.title;
    $('banner-sub').textContent = b.sub || '';
    el.hidden = true;
    void el.offsetWidth; // restart the animation
    el.hidden = false;
    this.bannerTimer = 4.2;
  }

  tick(dt) {
    if (this.dialogTimer > 0) {
      this.dialogTimer -= dt;
      if (this.dialogTimer <= 0) this.hideDialog();
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.nextBanner();
    }
  }

  // ---------------------------------------------------------------- map
  openMap(ctx) {
    $('worldmap').hidden = false;
    drawWorldMap($('worldmap-canvas'), ctx.mapBase, ctx.position, ctx.yaw, ctx.discovered, ctx.nextId);
  }

  closeMap() {
    $('worldmap').hidden = true;
  }

  get mapOpen() {
    return !$('worldmap').hidden;
  }

  // ---------------------------------------------------------------- pause
  bindPause() {
    for (const btn of document.querySelectorAll('.pause-nav .tab')) {
      btn.addEventListener('click', () => {
        this.audio.uiClick();
        const tab = btn.dataset.tab;
        if (tab === 'resume') this.bus.emit('ui:resume');
        else if (tab === 'quit') this.bus.emit('ui:save-quit');
        else if (tab === 'settings') this.openSettings();
        else this.renderPauseTab(tab);
      });
    }
  }

  openPause(ctx, tab = this.pauseTab) {
    this.pauseCtx = ctx;
    $('pause').hidden = false;
    this.renderPauseTab(tab);
  }

  closePause() {
    $('pause').hidden = true;
  }

  get pauseOpen() {
    return !$('pause').hidden;
  }

  renderPauseTab(tab) {
    this.pauseTab = tab;
    const ctx = this.pauseCtx;
    for (const btn of document.querySelectorAll('.pause-nav .tab')) btn.classList.toggle('active', btn.dataset.tab === tab);
    const body = $('pause-body');
    if (tab === 'map') {
      body.innerHTML = '<h3>Map</h3><canvas id="pause-map" width="720" height="720"></canvas>';
      drawWorldMap($('pause-map'), ctx.mapBase, ctx.position, ctx.yaw, ctx.discovered, ctx.nextId);
    } else if (tab === 'missions') {
      const done = ctx.discovered.size;
      const items = LANDMARKS.map((l) => {
        const found = ctx.discovered.has(l.id);
        return `<div class="list-item ${found ? 'done' : ''}">
          <div class="ico"><svg viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg></div>
          <div><h4>${found ? l.name : 'Undiscovered landmark'}</h4><p>${found ? l.blurb : 'Follow the white pins on your minimap.'}</p></div>
          <span class="tag ${found ? '' : 'muted'}">${found ? 'FOUND' : 'HIDDEN'}</span></div>`;
      }).join('');
      body.innerHTML = `<h3>Missions</h3>
        <div class="list"><div class="list-item ${done === LANDMARKS.length ? 'done' : ''}">
          <div class="ico"><svg viewBox="0 0 24 24"><path d="M4 4h12l-2 4 2 4H6v8H4z"/></svg></div>
          <div><h4>Chapter I — Discover Nazareth</h4><p>Visit every landmark of your home village.</p></div>
          <span class="tag">${done}/${LANDMARKS.length}</span></div>${items}</div>
        <p class="note">Villager missions (the wedding wine, the fisherman's troubles, the Roman problem) arrive as Galilee opens up in upcoming chapters.</p>`;
    } else if (tab === 'miracles') {
      body.innerHTML = `<h3>Miracles</h3><div class="list">${MIRACLES.map((m) => {
        const ok = ctx.unlocked.includes(m.id);
        return `<div class="list-item ${ok ? '' : 'locked'}"><div class="ico">${MIRACLE_ICONS[m.id]}</div>
          <div><h4>${m.key}. ${m.name}</h4><p>${m.description}</p></div>
          <span class="tag ${ok ? '' : 'muted'}">${ok ? 'REVEALED' : 'NOT YET REVEALED'}</span></div>`;
      }).join('')}</div>`;
    } else if (tab === 'stats') {
      const s = ctx.stats;
      const pct = (v) => Math.min(100, v);
      body.innerHTML = `<h3>Statistics</h3>
        <div class="stat-grid">
          <div class="stat"><span>FAITH</span><strong>${Math.round(ctx.faith)}</strong><div class="meter faith"><i style="width:${pct(ctx.faith)}%"></i></div></div>
          <div class="stat"><span>CHAOS</span><strong>${Math.round(ctx.chaos)}</strong><div class="meter chaos"><i style="width:${pct(ctx.chaos)}%"></i></div></div>
          <div class="stat"><span>LANDMARKS</span><strong>${ctx.discovered.size} / ${LANDMARKS.length}</strong></div>
          <div class="stat"><span>DISTANCE WALKED</span><strong>${(s.distance / 1000).toFixed(2)} km</strong></div>
          <div class="stat"><span>JUMPS</span><strong>${s.jumps}</strong></div>
          <div class="stat"><span>PROPS KNOCKED OVER</span><strong>${s.propsDisturbed}</strong></div>
          <div class="stat"><span>THINGS INSPECTED</span><strong>${s.conversations}</strong></div>
          <div class="stat"><span>TIME IN GALILEE</span><strong>${fmtTime(s.playTime)}</strong></div>
          <div class="stat"><span>FOLLOWERS</span><strong>${ctx.followers}</strong></div>
        </div>`;
    }
  }
}
