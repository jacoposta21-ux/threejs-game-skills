import { MIRACLES } from '../game/miracles.js';
import { MIRACLE_ICONS, LOCK_ICON } from './icons.js';
import { LANDMARKS, CHAPTER_ONE, CHAPTER_TWO } from '../world/layout.js';
import { BLESSINGS, BLESSING_COSTS, CHAOS_TIERS } from '../game/reputation.js';
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
    $('map-close').addEventListener('click', () => this.bus.emit('ui:map-close'));
    $('worldmap').addEventListener('click', (e) => { if (e.target === $('worldmap')) this.bus.emit('ui:map-close'); });
    $('conv-leave').addEventListener('click', (e) => { e.stopPropagation(); this.bus.emit('ui:dialogue-leave'); });
    // tapping the conversation (outside the answers) continues it, like E
    $('conversation').addEventListener('click', (e) => { if (!e.target.closest('.conv-opt, .conv-leave')) this.bus.emit('ui:dialogue-advance'); });
    $('arrest-card').addEventListener('click', () => this.bus.emit('ui:arrest-continue'));
    document.addEventListener('mouseover', (e) => {
      if (e.target instanceof Element && e.target.closest('.btn:not(:disabled)')) this.audio.uiHover();
    });
  }

  // ---------------------------------------------------------------- loading
  setLoading(progress, text) {
    $('loading-bar').style.width = `${Math.round(progress * 100)}%`;
    if (text) $('loading-text').textContent = text;
    if (!this.tipShown) { this.tipShown = true; this.setLoadingTip(); }
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
    click('btn-about', () => this.openAbout());
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

  /** A rotating tip under the loading bar. */
  setLoadingTip() {
    const tips = [
      'Tip: people with a gold ! need your help — talk to them with E.',
      'Tip: press F next to a donkey, a horse or a camel to ride it.',
      'Tip: the Romans only care about what they see. Break their line of sight.',
      'Tip: spend Faith on Blessings in Pause → Miracles.',
      'Tip: G tells your followers to wait — or to come along.',
      'Tip: you can walk on the lake. The soldiers can\'t.',
      'Tip: Chaos fades over time. Pots do not un-break.',
    ];
    const el = $('loading-tip');
    if (el) el.textContent = tips[Math.floor(Math.random() * tips.length)];
  }

  openAbout() {
    this.openSheet('About', `
      <p><b>Jesus Simulator — The Holy Open World Experience</b>, version 1.0. A playful open-world sandbox set in a blocky, sun-baked Galilee: explore, help people, work (gentle) miracles, ride donkeys, and try not to annoy the Roman legion too much.</p>
      <p class="note"><b>Made with</b> Three.js, Rapier 3D physics and the Web Audio API. Every model, texture, character, sound and piece of music is original and generated procedurally in the browser — there are no third-party art or audio assets.</p>
      <p class="note"><b>Saving</b> happens automatically (every 30 seconds, at every discovery and mission step, and when you quit).</p>
      <p class="note">Single-player. Multiplayer is planned and not available in this version.</p>`);
  }

  openHowTo() {
    const k = (key, text) => `<div><kbd>${key}</kbd>${text}</div>`;
    const touch = document.body.classList.contains('touch-ui');
    const grid = touch ? `
      <div class="howto-grid">
        ${k('Left thumb', 'Joystick: move · push past the ring to run')}${k('Drag', 'Look around · pinch to zoom')}
        ${k('Big button', 'Use the selected miracle (hold to keep going)')}${k('Arrow', 'Jump')}
        ${k('Speech', 'Talk / interact (glows when someone is near)')}${k('Horse', 'Ride / get off')}
        ${k('Hotbar', 'Tap a miracle to select it')}${k('People', 'Followers: wait / follow')}
        ${k('Top', 'Pause and map')}${k('Prompts', 'Tap a prompt to use it')}
      </div>` : null;
    this.openSheet('How to Play', `
      <p>You are Jesus of Nazareth, back home and ready to explore. Meet the villagers, discover the landmarks and the gifts hidden among them, then try them out — gently or not. Borrow a donkey (F) to cross Galilee, take on missions from the people you meet, and gather followers — but mind the Romans.</p>
      ${grid || `<div class="howto-grid">
        ${k('W A S D', 'Move')}${k('Mouse', 'Rotate camera')}${k('Shift', 'Sprint')}${k('Space', 'Jump')}
        ${k('E', 'Talk / interact')}${k('Wheel', 'Camera distance')}${k('RMB', 'Shoulder aim view')}${k('LMB / Q', 'Use miracle (hold to keep lifting)')}
        ${k('1 – 6', 'Select miracle')}${k('F', 'Ride / get off')}${k('Tab', 'Open map')}${k('Esc', 'Pause menu')}
        ${k('G', 'Followers: wait / follow')}${k('← →', 'Turn camera (keys)')}
      </div>`}
      <p class="note"><b>Miracles:</b> each gift is revealed at a special place — the workshop, the market, the well, the synagogue, the highest rooftop and the shore of Galilee. Select one with 1–6, aim with the crosshair and click (or press Q).</p>
      <p class="note"><b>Roman Attention:</b> legionaries patrol the village and guard the checkpoint up the north road. Break things, blast people or shove a soldier where one can see you and the stars go up; at three stars reinforcements arrive. Red cones on the minimap show where soldiers are looking. Break their line of sight and stay hidden until the stars stop flashing, or heal a soldier you hurt — he may look the other way. Get seized and you can still push free; get caught and you spend a few hours at the checkpoint (and pay a fine in Faith). The palisade camp is off-limits.</p>
      <p class="note"><b>Missions:</b> people with a gold <b>!</b> over their head need help — talk to them (E) and pick the ★ option. The objective card and the gold star on the map show the next step. Finished missions bring Faith, followers and favours.</p>
      <p class="note"><b>Faith &amp; Chaos:</b> Faith is earned by miracles, good deeds, missions and followers, and spent on <b>Blessings</b> (miracle upgrades, Pause → Miracles). Chaos rises with mayhem and slowly fades; at high Chaos villagers grow wary and the legion watches you more closely.</p>
      <p class="note"><b>Followers:</b> heal the long-suffering, finish missions, or — once your Faith reaches 25 — simply ask people to follow you (up to twelve). Press G to tell them to wait or to come along.</p>
      <p class="note"><b>Chapter I:</b> discover all eight landmarks of Nazareth and its shore. Gold pins on the minimap point to places you have not visited yet. Climb the outdoor stairs to reach the rooftops.</p>`);
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

  /** Per-frame hotbar: selection, locks, cooldown sweeps and the target/status line. */
  setMiracleHud({ index, unlocked, cooldown, label }) {
    this.slots.forEach((el, i) => {
      const isSel = i === index;
      if (el.classList.contains('selected') !== isSel) el.classList.toggle('selected', isSel);
      const locked = !unlocked.includes(MIRACLES[i].id);
      if (el.classList.contains('locked') !== locked) el.classList.toggle('locked', locked);
      const p = Math.max(0, Math.min(1, cooldown[i] || 0));
      const v = `${Math.round(p * 100)}%`;
      if (el._cd !== v) { el._cd = v; el.querySelector('.cd').style.setProperty('--p', v); }
    });
    const m = MIRACLES[index];
    const ready = unlocked.includes(m.id);
    const text = ready ? `${m.name} <em>· ${label ?? ''}</em>` : `${m.name} <em>· Not yet revealed</em>`;
    if (this._mlabel !== text) { this._mlabel = text; $('miracle-label').innerHTML = text; }
  }

  setObjective(kicker, title, detailHtml) {
    const key = kicker + title + detailHtml;
    if (key === this.lastObjective) return;
    this.lastObjective = key;
    $('obj-kicker').textContent = kicker;
    $('obj-title').textContent = title;
    $('obj-detail').innerHTML = detailHtml;
  }

  setAttention(level, opts = {}) {
    const el = $('attention');
    if (this._stars !== level) {
      if (level > (this._stars || 0)) { el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); }
      this._stars = level;
      [...$('stars').children].forEach((star, i) => star.classList.toggle('on', i < level));
    }
    el.classList.toggle('wanted', level > 0);
    const searching = level > 0 && !!opts.searching;
    el.classList.toggle('searching', searching);
    if (searching) $('attention-search').style.setProperty('--p', String(1 - (opts.search || 0)));
    const label = level === 0 ? 'ROMAN ATTENTION' : searching ? 'SEARCHING…' : 'WANTED';
    if (this._attLabel !== label) { this._attLabel = label; $('attention-label').textContent = label; }
    const grab = opts.grab || 0;
    $('grab-meter').hidden = grab <= 0.02;
    if (grab > 0.02) $('grab-fill').style.setProperty('--p', String(grab));
  }

  showArrest({ line, facts }) {
    $('arrest-line').textContent = line;
    $('arrest-facts').innerHTML = facts.map((f) => `<li>${f}</li>`).join('');
    $('arrest-card').hidden = false;
    $('grab-meter').hidden = true;
  }

  hideArrest() {
    $('arrest-card').hidden = true;
  }

  setFollowers(n) {
    $('follower-count').textContent = String(n);
  }

  /** Faith / Chaos pill next to the follower count. */
  setReputation({ faith, chaos, title, tier }) {
    const key = `${Math.floor(faith)}|${Math.floor(chaos)}|${title}|${tier.id}`;
    if (this.repKey === key) return;
    this.repKey = key;
    $('rep-faith').textContent = String(Math.floor(faith));
    $('rep-chaos').textContent = String(Math.floor(chaos));
    $('rep-title').textContent = title;
    $('hud-rep').dataset.tier = tier.id;
    $('hud-rep').title = `${tier.label}: ${tier.note}`;
  }

  setRegion(name) {
    if ($('region-label').textContent !== name) $('region-label').textContent = name;
  }

  /** Second prompt for the F key (ride / get off). */
  setRidePrompt(text) {
    const el = $('ride-prompt');
    if (!text || !$('conversation').hidden) {
      el.hidden = true;
      return;
    }
    if ($('ride-prompt-text').textContent !== text) $('ride-prompt-text').textContent = text;
    el.hidden = false;
  }

  /** Riding panel: name, gait bar, lap timer. null hides it. */
  setRideHud(info) {
    const el = $('ride-hud');
    if (!info) {
      if (!el.hidden) el.hidden = true;
      return;
    }
    el.hidden = false;
    if ($('ride-name').textContent !== info.name) $('ride-name').textContent = info.name;
    const tag = $('ride-tag');
    const tagText = info.stolen ? 'STOLEN' : info.kindLabel.toUpperCase();
    if (tag.textContent !== tagText) tag.textContent = tagText;
    tag.classList.toggle('stolen', !!info.stolen);
    if ($('ride-gait').textContent !== info.gait) $('ride-gait').textContent = info.gait;
    const fill = $('ride-fill');
    fill.style.setProperty('--p', info.fill.toFixed(3));
    fill.classList.toggle('gallop', info.gait === 'Gallop');
    const lap = $('ride-lap');
    lap.hidden = !info.lap;
    if (info.lap) {
      $('ride-lap-time').textContent = info.lap.time.toFixed(1);
      $('ride-lap-best').textContent = info.lap.best ? `best ${info.lap.best.toFixed(2)} s` : '';
    }
  }

  setPrompt(text) {
    const el = $('prompt');
    if (!text || !$('dialog').hidden || !$('conversation').hidden) {
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

  // ---------------------------------------------------------------- conversation
  showConversation({ name, role, text, options }) {
    $('conv-name').textContent = name;
    $('conv-role').textContent = role;
    $('conv-text').textContent = text;
    const box = $('conv-options');
    box.innerHTML = '';
    options.forEach((label, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'conv-opt';
      b.innerHTML = `<kbd>${i + 1}</kbd><span></span>`;
      b.querySelector('span').textContent = label;
      b.addEventListener('click', () => this.bus.emit('ui:dialogue-choice', { index: i }));
      box.appendChild(b);
    });
    const touch = document.body.classList.contains('touch-ui');
    $('conv-hint').textContent = touch
      ? (options.length ? 'TAP AN ANSWER · ✕ TO LEAVE' : 'TAP TO CONTINUE')
      : (options.length ? `PRESS 1–${options.length} TO ANSWER · ESC TO LEAVE` : 'PRESS E TO CONTINUE');
    $('conversation').hidden = false;
    $('prompt').hidden = true;
    this.hideDialog();
  }

  hideConversation() {
    $('conversation').hidden = true;
  }

  /** Project world-space bubbles to screen; pooled DOM nodes. */
  updateBubbles(list, camera, width, height) {
    const box = $('bubbles');
    if (!this.bubblePool) this.bubblePool = [];
    while (this.bubblePool.length < list.length) {
      const el = document.createElement('div');
      el.className = 'bubble';
      box.appendChild(el);
      this.bubblePool.push({ el, key: '' });
    }
    const v = this._v || (this._v = camera.position.clone());
    this.bubblePool.forEach((slot, i) => {
      const b = list[i];
      if (!b) { slot.el.style.display = 'none'; return; }
      v.set(b.x, b.y, b.z).project(camera);
      if (v.z > 1 || v.x < -1.2 || v.x > 1.2 || v.y < -1.2 || v.y > 1.2) { slot.el.style.display = 'none'; return; }
      const key = `${b.kind}|${b.text}|${b.sub || ''}|${b.roman ? 1 : 0}`;
      if (slot.key !== key) {
        slot.key = key;
        slot.el.className = `bubble ${b.kind === 'name' ? 'name' : b.kind === 'quest' ? 'quest' : b.kind === 'alert' ? `alert${b.text === '?' ? ' q' : ''}` : b.roman ? 'roman' : ''}`;
        slot.el.textContent = b.text;
        if (b.sub) { const sm = document.createElement('small'); sm.textContent = b.sub; slot.el.appendChild(sm); }
      }
      const x = (v.x * 0.5 + 0.5) * width;
      const y = (-v.y * 0.5 + 0.5) * height;
      slot.el.style.display = 'block';
      slot.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%) scale(${Math.max(0.7, Math.min(1, 9 / Math.max(b.d, 1)))})`;
    });
  }

  setClock(text, night) {
    const el = $('clock');
    const label = `${night ? '☾' : '☀'} ${text}`;
    if (el.textContent !== label) el.textContent = label;
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
    drawWorldMap($('worldmap-canvas'), ctx.mapBase, ctx.position, ctx.yaw, ctx.discovered, ctx.nextId, ctx.markers);
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

  ministryHtml(ctx) {
    const M = ctx.missions;
    const rows = ctx.missionDefs.map((m) => {
      const st = M.state[m.id];
      const done = st.status === 'done';
      const active = st.status === 'active';
      const tag = done ? 'DONE' : active ? (M.tracked === m.id ? 'TRACKED' : 'ACTIVE') : 'OFFERED';
      const line = active ? `<b>Next:</b> ${M.stepText(m.id)}` : done ? m.reward?.text || '' : `${m.summary} <i>(${m.region})</i>`;
      return `<div class="list-item ${done ? 'done' : ''} ${active ? 'active' : ''}">
        <div class="ico"><svg viewBox="0 0 24 24"><path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 20.9l1.6-7L2 9.2l7.1-.6z"/></svg></div>
        <div><h4>${m.title}</h4><p>${line}</p></div><span class="tag ${done || active ? '' : 'muted'}">${tag}</span></div>`;
    }).join('');
    const n = ctx.missionDefs.filter((m) => M.state[m.id].status === 'done').length;
    const followers = ctx.followerNames.length ? ctx.followerNames.join(', ') : 'nobody yet';
    return `<div class="list"><div class="list-item ${n === ctx.missionDefs.length ? 'done' : ''}">
        <div class="ico"><svg viewBox="0 0 24 24"><path d="M4 4h12l-2 4 2 4H6v8H4z"/></svg></div>
        <div><h4>Chapter III — The Ministry</h4><p>Help the people of Galilee. Followers (${ctx.followerNames.length}/12): ${followers}.</p></div>
        <span class="tag">${n}/${ctx.missionDefs.length}</span></div>${rows}</div>`;
  }

  renderPauseTab(tab) {
    this.pauseTab = tab;
    const ctx = this.pauseCtx;
    for (const btn of document.querySelectorAll('.pause-nav .tab')) btn.classList.toggle('active', btn.dataset.tab === tab);
    const body = $('pause-body');
    if (tab === 'map') {
      body.innerHTML = '<h3>Map</h3><canvas id="pause-map" width="720" height="720"></canvas>';
      drawWorldMap($('pause-map'), ctx.mapBase, ctx.position, ctx.yaw, ctx.discovered, ctx.nextId, ctx.markers);
    } else if (tab === 'missions') {
      const chapter = (list) => list.map((l) => {
        const found = ctx.discovered.has(l.id);
        return `<div class="list-item ${found ? 'done' : ''}">
          <div class="ico"><svg viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg></div>
          <div><h4>${found ? l.name : 'Undiscovered landmark'}</h4><p>${found ? l.blurb : 'Follow the white pins on your minimap.'}</p></div>
          <span class="tag ${found ? '' : 'muted'}">${found ? 'FOUND' : 'HIDDEN'}</span></div>`;
      }).join('');
      const head = (title, sub, list) => {
        const n = list.filter((l) => ctx.discovered.has(l.id)).length;
        return `<div class="list-item ${n === list.length ? 'done' : ''}">
          <div class="ico"><svg viewBox="0 0 24 24"><path d="M4 4h12l-2 4 2 4H6v8H4z"/></svg></div>
          <div><h4>${title}</h4><p>${sub}</p></div><span class="tag">${n}/${list.length}</span></div>`;
      };
      const s = ctx.stats;
      body.innerHTML = `<h3>Missions</h3>
        ${this.ministryHtml(ctx)}
        <div class="list" style="margin-top:14px">${head('Chapter I — Discover Nazareth', 'Visit every landmark of your home village.', CHAPTER_ONE)}${chapter(CHAPTER_ONE)}</div>
        <div class="list" style="margin-top:14px">${head('Chapter II — Explore Galilee', 'The countryside, the lake, the Roman fort and the desert. Borrow a donkey.', CHAPTER_TWO)}${chapter(CHAPTER_TWO)}</div>
        <p class="note">Circus best lap: <b>${s.bestLap ? `${s.bestLap.toFixed(2)} s` : '—'}</b>.</p>`;
    } else if (tab === 'miracles') {
      body.innerHTML = `<h3>Miracles</h3><div class="list">${MIRACLES.map((m) => {
        const ok = ctx.unlocked.includes(m.id);
        const lvl = ctx.levels?.[m.id] || 0;
        const cost = BLESSING_COSTS[lvl];
        const next = BLESSINGS[m.id][lvl];
        const pips = `<span class="bless-pips">${[0, 1].map((i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</span>`;
        const bless = !ok ? '' : cost === undefined
          ? `<p class="bless done">${pips} Fully blessed — ${BLESSINGS[m.id][1]}</p>`
          : `<p class="bless">${pips} Next: ${next} · −20% cooldown <button type="button" class="btn bless-btn" data-bless="${m.id}" ${ctx.faith >= cost ? '' : 'disabled'}>BLESS · ${cost} FAITH</button></p>`;
        return `<div class="list-item ${ok ? '' : 'locked'}"><div class="ico">${MIRACLE_ICONS[m.id]}</div>
          <div><h4>${m.key}. ${m.name}</h4><p>${m.description}</p>${bless}</div>
          <span class="tag ${ok ? '' : 'muted'}">${ok ? (lvl ? `BLESSED ${'✦'.repeat(lvl)}` : 'REVEALED') : `FIND: ${m.revealAt.toUpperCase()}`}</span></div>`;
      }).join('')}</div><p class="note">You have <b>${Math.floor(ctx.faith)} Faith</b> to spend. Blessings are permanent.</p>
      ${ctx.rewardedAds ? '<p class="note"><button type="button" class="btn bless-btn" id="btn-rewarded">ASK FOR A SIGN · WATCH A VIDEO · +10 FAITH</button></p>' : ''}`;
      $('btn-rewarded')?.addEventListener('click', () => this.bus.emit('ui:rewarded'));
      for (const b of body.querySelectorAll('[data-bless]')) {
        b.addEventListener('click', () => this.bus.emit('ui:bless', { miracleId: b.dataset.bless }));
      }
    } else if (tab === 'stats') {
      const s = ctx.stats;
      const pct = (v) => Math.min(100, v);
      body.innerHTML = `<h3>Statistics</h3>
        <div class="stat-grid">
          <div class="stat"><span>FAITH</span><strong>${Math.round(ctx.faith)}</strong><div class="meter faith"><i style="width:${pct(ctx.faith)}%"></i></div></div>
          <div class="stat"><span>CHAOS</span><strong>${Math.round(ctx.chaos)}</strong><div class="meter chaos"><i style="width:${pct(ctx.chaos)}%"></i></div></div>
          <div class="stat wide"><span>REPUTATION</span><strong>${ctx.title} · ${ctx.tier.label}</strong><p>${ctx.tier.note}</p></div>
          <div class="stat"><span>MISSIONS DONE</span><strong>${s.missions || 0} / ${ctx.missionDefs.length}</strong></div>
          <div class="stat"><span>BLESSINGS</span><strong>${s.blessings || 0} / 12</strong></div>
          <div class="stat"><span>PLACES FOUND</span><strong>${ctx.discovered.size} / ${LANDMARKS.length}</strong></div>
          <div class="stat"><span>DISTANCE RIDDEN</span><strong>${((s.ridden || 0) / 1000).toFixed(2)} km</strong></div>
          <div class="stat"><span>RIDES TAKEN</span><strong>${s.rides || 0}</strong></div>
          <div class="stat"><span>CHARIOTS "BORROWED"</span><strong>${s.chariotsStolen || 0}</strong></div>
          <div class="stat"><span>CIRCUS LAPS</span><strong>${s.laps || 0}${s.bestLap ? ` · best ${s.bestLap.toFixed(1)} s` : ''}</strong></div>
          <div class="stat"><span>DISTANCE WALKED</span><strong>${(s.distance / 1000).toFixed(2)} km</strong></div>
          <div class="stat"><span>JUMPS</span><strong>${s.jumps}</strong></div>
          <div class="stat"><span>PROPS KNOCKED OVER</span><strong>${s.propsDisturbed}</strong></div>
          <div class="stat"><span>THINGS INSPECTED</span><strong>${s.conversations}</strong></div>
          <div class="stat"><span>PEOPLE MET</span><strong>${ctx.met ?? 0}</strong></div>
          <div class="stat"><span>POTS BROKEN</span><strong>${s.potsBroken ?? 0}</strong></div>
          <div class="stat"><span>PEOPLE KNOCKED OVER</span><strong>${s.peopleKnocked ?? 0}</strong></div>
          <div class="stat"><span>MIRACLES PERFORMED</span><strong>${s.miracles ?? 0}</strong></div>
          <div class="stat"><span>LEGIONARIES TOPPLED</span><strong>${s.soldiersToppled ?? 0}</strong></div>
          <div class="stat"><span>ESCAPES FROM ROME</span><strong>${s.escapes ?? 0}</strong></div>
          <div class="stat"><span>ARRESTS</span><strong>${s.arrests ?? 0}</strong></div>
          <div class="stat"><span>HIGHEST ATTENTION</span><strong>${'★'.repeat(s.maxStars ?? 0) || '—'}</strong></div>
          <div class="stat"><span>TIME IN GALILEE</span><strong>${fmtTime(s.playTime)}</strong></div>
          <div class="stat"><span>FOLLOWERS</span><strong>${ctx.followers}</strong></div>
        </div>`;
    }
  }
}
