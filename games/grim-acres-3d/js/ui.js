// HTML/CSS overlays: HUD, hotbar, dialogue, menus, notebook, title and endings.
import { t, tList, fmt } from './i18n.js';
import { Art } from './art.js';
import { ITEMS, SHOP_STOCK, BACKPACK } from './data/items.js';
import { RECIPES } from './data/recipes.js';
import { VILLAGERS } from './data/villagers.js';
import { CLUES } from './mystery.js';
import { HOTBAR } from './inventory.js';
import { formatClock, dayOfWeek, SEASON_DAYS } from './time.js';
import { Audio } from './audio.js';
import { Save } from './save.js';
import { ACHIEVEMENTS } from './data/achievements.js';
import { Progress } from './progress.js';
import { SUPPORTED, currentLang } from './i18n.js';

const $ = (s) => document.querySelector(s);

// Tiny element helper: h('div', {class:'x', text:'hi', onclick}, child, ...)
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style') el.style.cssText = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
function icon(id, cls) { return h('img', { src: Art.iconUrls[id], alt: '', class: cls || 'px' }); }
// Amount of money with the coin icon.
function coin(n) { return h('span', { class: 'coin' }, h('img', { src: Art.ui.coin, alt: '' }), String(n)); }
function itemName(id) { return t(`item.${id}.name`); }
function hearts(n) { return h('span', { class: 'hearts' }, '♥'.repeat(n), h('span', { class: 'off' }, '♥'.repeat(5 - n))); }
const byId = Object.fromEntries(VILLAGERS.map((v) => [v.id, v]));

export class UI {
  constructor() {
    this.root = $('#modal-root');
    this.modal = null;
    this.dlg = null;
    this._hotSig = '';
    this._prompt = undefined;
    this.onQuit = null;
    this.game = null;
    this.bubbles = [];
  }

  get blocking() { return !!this.modal || !!this.cinematic; }

  // Re-apply translated labels on static HTML (after a language change).
  refreshLabels() {
    $('#btn-bag').setAttribute('aria-label', t('ui.bag'));
    $('#btn-notebook').setAttribute('aria-label', t('ui.notebook'));
    $('#btn-pause').setAttribute('aria-label', t('ui.pause'));
    $('#btn-mute').setAttribute('aria-label', t('ui.mute'));
    $('#touch-action').setAttribute('aria-label', t('ui.action'));
    this._hotSig = ''; this._prompt = undefined;
  }

  init(game) {
    this.game = game;
    $('#btn-mute').onclick = () => this.toggleMute();
    $('#btn-bag').onclick = () => { if (!this.modal && game.mode === 'play') this.openBag(game); };
    $('#btn-notebook').onclick = () => { if (!this.modal && game.mode === 'play') this.openNotebook(game); };
    $('#btn-pause').onclick = () => { if (!this.modal && game.mode === 'play') this.openPause(game); };
    $('#btn-bag img').src = Art.ui.bag; $('#btn-notebook img').src = Art.ui.book; $('#btn-pause img').src = Art.ui.pause;
    $('#btn-bag').setAttribute('aria-label', t('ui.bag'));
    $('#btn-notebook').setAttribute('aria-label', t('ui.notebook'));
    $('#btn-pause').setAttribute('aria-label', t('ui.pause'));
    $('#btn-mute').setAttribute('aria-label', t('ui.mute'));
    $('#touch-action').setAttribute('aria-label', t('ui.action'));
    this._muteIcon();
    // clicking the dimmed backdrop of a closable menu closes it; clicking during dialogue advances it
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target !== this.root || !this.modal) return;
      if (this.modal.name === 'dialogue') this._advance();
      else if (this.modal.closable) this.close();
    });
  }

  // ------------------------------------------------------------ modal plumbing
  open(name, el, opts = {}) {
    this.closeModalSilently();
    this.modal = { name, el, closable: opts.closable !== false, onClose: opts.onClose, onAction: opts.onAction };
    this.root.classList.toggle('dialogue-mode', name === 'dialogue');
    this.root.append(el);
    this.game && this.game.input.clearHeld();
  }

  closeModalSilently() {
    if (!this.modal) return;
    this.root.innerHTML = '';
    this.modal = null;
  }

  close() {
    if (!this.modal) return;
    const cb = this.modal.onClose;
    this.closeModalSilently();
    Audio.play('click');
    if (cb) cb();
  }

  handleActions(actions, game) {
    for (const a of actions) {
      if (!this.modal) { if (game.mode === 'title' && a === 'action') $('#btn-play').click(); continue; }
      const m = this.modal;
      if (m.name === 'dialogue') {
        if (a === 'action') this._advance();
        else if (a === 'up' || a === 'down') this._moveChoice(a === 'up' ? -1 : 1);
        else if (/^hot\d$/.test(a)) this._pickChoice(Number(a[3]));
        else if (a === 'pause') this._endDialogue(true);
        continue;
      }
      if (a === 'action' && m.onAction) { m.onAction(); continue; }
      if (a === 'action') { this._clickFocused(m); continue; }
      if (a === 'up' || a === 'left') { this._moveFocus(m, -1); continue; }
      if (a === 'down' || a === 'right') { this._moveFocus(m, 1); continue; }
      if (a === 'pause' && m.closable) { this.close(); continue; }
      if (a === 'notebook' && m.name === 'notebook') { this.close(); continue; }
      if (a === 'bag' && m.name === 'bag') { this.close(); continue; }
      if (a === 'mute') this.toggleMute();
    }
  }

  // Keyboard navigation for menus: arrows/WASD move a highlight between buttons, E/Space presses it.
  _focusables(m) {
    return [...m.el.querySelectorAll('button:not(:disabled)')].filter((b) => !b.classList.contains('x-btn') && b.offsetParent !== null);
  }

  _moveFocus(m, dir) {
    const list = this._focusables(m);
    if (!list.length) return;
    const cur = list.findIndex((b) => b.classList.contains('focus'));
    list.forEach((b) => b.classList.remove('focus'));
    const next = cur < 0 ? (dir > 0 ? 0 : list.length - 1) : (cur + dir + list.length) % list.length;
    list[next].classList.add('focus');
    list[next].scrollIntoView({ block: 'nearest' });
    Audio.play('click');
  }

  _clickFocused(m) {
    const list = this._focusables(m);
    const idx = list.findIndex((b) => b.classList.contains('focus'));
    if (idx < 0) return;
    list[idx].click();
    // menus re-render after most clicks: keep the highlight on the same position
    if (this.modal === m && !m.el.querySelector('button.focus')) {
      const again = this._focusables(m);
      const el = again[Math.min(idx, again.length - 1)];
      if (el) el.classList.add('focus');
    }
  }

  // Speech bubble above a villager (HTML, follows them on screen).
  bubble(npc, text, delay = 0) {
    if (this.bubbles.length >= 3) return;
    this.bubbles.push({ npc, text, delay, t: 4.2, el: null });
  }

  _updateBubbles(dt) {
    const game = this.game;
    if (!game || !this.bubbles.length) return;
    const r = game.renderer, dpr = window.devicePixelRatio || 1;
    const area = game.mode === 'play' ? game.playerArea() : null;
    for (const b of this.bubbles) {
      if (b.delay > 0) { b.delay -= dt; continue; }
      b.t -= dt;
      const visible = area && b.npc.area === area && !b.npc.away && !this.modal && b.t > 0;
      if (!b.el && visible) { b.el = h('div', { class: 'bubble', text: b.text }); $('#hud').append(b.el); }
      if (!b.el) continue;
      b.el.style.display = visible ? '' : 'none';
      const sp = r.toScreen(b.npc.x, b.npc.y, 1.95);
      b.el.style.left = `${sp.x}px`;
      b.el.style.top = `${sp.y}px`;
    }
    this.bubbles = this.bubbles.filter((b) => { if (b.t > 0) return true; if (b.el) b.el.remove(); return false; });
  }

  update(dt) {
    this._updateBubbles(dt);
    const d = this.dlg;
    if (d && d.typing) {
      const before = Math.floor(d.shown);
      d.shown += dt * 55;
      const now = Math.floor(d.shown);
      if (now !== before && now % 3 === 0 && d.page.who) Audio.play('talk', d.pitch);
      if (d.shown >= d.full.length) this._finishTyping();
      else d.textEl.textContent = d.full.slice(0, now);
    }
  }

  // ------------------------------------------------------------ HUD
  showHud(on) { $('#hud').classList.toggle('hidden', !on); }

  updateHud(game) {
    $('#hud-day').textContent = `${t('ui.dayLabel', { dow: tList('days')[dayOfWeek(game.day)], day: game.day })} · ${t(`weather.${game.weather}`)}`;
    $('#hud-time').textContent = formatClock(game.minutes);
    const hm = $('#hud-money');
    if (hm.dataset.n !== String(game.money)) { hm.dataset.n = String(game.money); hm.replaceChildren(coin(game.money)); hm.title = t('ui.money', { n: game.money }); }
    const omen = $('#hud-omen');
    const showOmen = game.omenTonight && game.minutes >= 18 * 60;
    if (omen.dataset.on !== String(showOmen)) { omen.dataset.on = String(showOmen); omen.textContent = showOmen ? t('ui.omen') : ''; }
    this.updateTutorial(game);
    this._updateLocation(game);
    const pct = Math.max(0, (game.energy / game.maxEnergy) * 100);
    const fill = $('#hud-energy-fill');
    fill.style.width = `${pct}%`;
    fill.classList.toggle('low', pct < 25);
    const inv = game.inv;
    const sig = inv.selected + '|' + game.water + '|' + inv.slots.slice(0, HOTBAR).map((s) => (s ? s.id + s.qty : '-')).join(',');
    if (sig !== this._hotSig) { this._hotSig = sig; this._renderHotbar(game); }
  }

  _slotEl(game, s, i, { onclick, selected, picked } = {}) {
    const el = h('button', { class: `slot${selected ? ' sel' : ''}${picked ? ' picked' : ''}${i < HOTBAR ? ' hot' : ''}`, onclick, title: s ? itemName(s.id) : '' });
    if (s) {
      el.append(icon(s.id));
      if (s.qty > 1) el.append(h('span', { class: 'qty', text: s.qty }));
      if (s.id === 'watering_can') el.append(h('div', { class: 'waterbar' }, h('div', { style: `width:${(game.water / ITEMS.watering_can.capacity) * 100}%` })));
    }
    return el;
  }

  _renderHotbar(game) {
    const bar = $('#hotbar');
    bar.innerHTML = '';
    for (let i = 0; i < HOTBAR; i++) {
      const el = this._slotEl(game, game.inv.slots[i], i, { selected: game.inv.selected === i, onclick: () => { game.inv.selected = i; Audio.play('click'); } });
      el.append(h('span', { class: 'num', text: i + 1 }));
      bar.append(el);
    }
  }

  // Fishing overlay: hint while waiting, then a bar with a moving marker and a green zone.
  fishBar(F) {
    let el = $('#fish-bar');
    if (!F) { if (el) el.remove(); return; }
    if (!el) {
      el = h('div', { id: 'fish-bar' }, h('div', { class: 'fb-text' }), h('div', { class: 'fb-track' }, h('div', { class: 'fb-zone' }), h('div', { class: 'fb-mark' })));
      $('#hud').append(el);
    }
    const key = { wait: 'fishing.wait', bite: 'fishing.bite', reel: 'fishing.reel' }[F.phase];
    const txt = t(key);
    const te = el.querySelector('.fb-text');
    if (te.textContent !== txt) te.textContent = txt;
    el.classList.toggle('bite', F.phase === 'bite');
    const track = el.querySelector('.fb-track');
    track.style.display = F.phase === 'reel' ? '' : 'none';
    if (F.phase === 'reel') {
      const z = el.querySelector('.fb-zone');
      z.style.left = `${(F.center - F.zone / 2) * 100}%`; z.style.width = `${F.zone * 100}%`;
      el.querySelector('.fb-mark').style.left = `${F.pos * 100}%`;
    }
  }

  // Closing-eyes transition for sleeping and resting: lids close, the callback runs in the dark,
  // then the eyes open again on the new scene.
  eyes(text, cb) {
    if (this.cinematic) return;
    this.cinematic = true;
    this.closeModalSilently();
    const el = $('#eyes'), tx = el.querySelector('.eyes-text');
    tx.textContent = text || '';
    el.classList.add('on');
    requestAnimationFrame(() => el.classList.add('closed'));
    Audio.play('sleep');
    setTimeout(() => el.classList.add('show-text'), 1100);
    setTimeout(() => {
      try { cb(); } catch (e) { console.error(e); }
      setTimeout(() => {
        el.classList.remove('show-text', 'closed');
        setTimeout(() => { el.classList.remove('on'); this.cinematic = false; }, 1200);
      }, 900);
    }, 1900);
  }

  // Nameplate above a nearby house door, so you know whose house it is before going in.
  _updateLocation(game) {
    const area = game.playerArea();
    const lab = $('#door-label');
    let best = null;
    if (area.outdoor && !this.modal) {
      const p = game.player;
      for (const b of game.world.buildings) {
        const inner = game.world.areaById[b.def.interior];
        const d = Math.hypot(inner.door.x * 16 + 8 - p.x, inner.door.y * 16 + 8 - p.y);
        if (d < 56 && (!best || d < best.d)) best = { d, door: inner.door, name: game.areaName(inner) };
      }
    }
    if (!best) { lab.style.display = 'none'; return; }
    const r = game.renderer, dpr = window.devicePixelRatio || 1;
    lab.style.display = 'block';
    if (lab.textContent !== best.name) lab.textContent = best.name;
    const sp = r.toScreen(best.door.x * 16 + 8, (best.door.y + 0.7) * 16, 1.75);
    lab.style.left = `${sp.x}px`;
    lab.style.top = `${sp.y}px`;
  }

  setPrompt(label) {
    if (label === this._prompt) return;
    this._prompt = label;
    const el = $('#prompt');
    el.innerHTML = '';
    if (!label) return;
    if (!document.body.classList.contains('touch')) el.append(h('span', { class: 'key', text: 'E' }));
    el.append(label);
  }

  toast(text, kind = '') {
    const box = $('#toasts');
    while (box.children.length >= 4) box.firstChild.remove();
    const el = h('div', { class: `toast ${kind}`, text });
    box.append(el);
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3100);
  }

  flash() {
    const f = $('#fade');
    f.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove('on')));
  }

  toggleMute() {
    Audio.setMuted(!Audio.muted);
    const s = Save.settings(); s.muted = Audio.muted; Save.saveSettings(s);
    this._muteIcon();
    if (this.game && this.game.mode === 'play') this.toast(t(Audio.muted ? 'msg.muted' : 'msg.unmuted'));
  }
  _muteIcon() { $('#btn-mute img').src = Audio.muted ? Art.ui.soundOff : Art.ui.soundOn; }

  // ------------------------------------------------------------ dialogue
  dialogue(pages, onDone) {
    const portrait = h('img', { class: 'portrait', alt: '' });
    const who = h('div', { class: 'who' });
    const textEl = h('div', { class: 'text' });
    const choices = h('div', { class: 'choices' });
    const more = h('div', { class: 'more', text: '▼' });
    const box = h('div', { class: 'dialogue', onclick: (e) => { if (!e.target.closest('.btn')) this._advance(); } }, portrait, h('div', { class: 'content' }, who, textEl, choices, more));
    this.dlg = { pages, i: 0, onDone, portrait, who, textEl, choices, more };
    this.open('dialogue', box, { closable: false });
    this._showPage();
  }

  say(who, text, onDone) { this.dialogue([{ who, text }], onDone); }

  _showPage() {
    const d = this.dlg;
    const p = d.pages[d.i];
    d.page = p;
    d.full = p.text || '';
    d.shown = 0;
    d.typing = true;
    d.choiceIdx = 0;
    d.pitch = p.who ? (byId[p.who] && byId[p.who].pitch) || 1 : 1;
    if (p.who) {
      d.portrait.style.display = '';
      d.portrait.src = Art.portraits[p.who];
      d.who.innerHTML = '';
      d.who.append(t(`npc.${p.who}.name`));
      const npc = this.game.npcs.get(p.who);
      if (npc) d.who.append(h('small', {}, hearts(npc.hearts)));
      d.who.style.display = '';
    } else {
      d.portrait.style.display = 'none';
      d.who.style.display = 'none';
    }
    d.textEl.textContent = '';
    d.choices.innerHTML = '';
    d.more.style.display = 'none';
  }

  _finishTyping() {
    const d = this.dlg;
    d.typing = false;
    d.shown = d.full.length;
    d.textEl.textContent = d.full;
    const p = d.page;
    if (p.choices && p.choices.length) {
      p.choices.forEach((c, i) => d.choices.append(h('button', { class: `btn${i === 0 ? ' focus' : ''}`, onclick: () => this._pickChoice(i) }, `${i + 1}. ${c.label}`)));
    } else d.more.style.display = '';
  }

  _moveChoice(dir) {
    const d = this.dlg;
    if (!d || d.typing || !d.page.choices) return;
    const btns = [...d.choices.children];
    d.choiceIdx = (d.choiceIdx + dir + btns.length) % btns.length;
    btns.forEach((b, i) => b.classList.toggle('focus', i === d.choiceIdx));
  }

  _pickChoice(i) {
    const d = this.dlg;
    if (!d || d.typing || !d.page.choices || !d.page.choices[i]) return;
    const c = d.page.choices[i];
    Audio.play('click');
    this._endDialogue(!c.fn);
    if (c.fn) c.fn();
  }

  _advance() {
    const d = this.dlg;
    if (!d) return;
    if (d.typing) { this._finishTyping(); return; }
    if (d.page.choices && d.page.choices.length) { this._pickChoice(d.choiceIdx); return; }
    if (d.i < d.pages.length - 1) { d.i++; this._showPage(); return; }
    this._endDialogue(true);
  }

  _endDialogue(callDone) {
    const d = this.dlg;
    this.dlg = null;
    this.closeModalSilently();
    if (callDone && d && d.onDone) d.onDone();
  }

  // ------------------------------------------------------------ generic panels
  panel(title, body, foot, opts = {}) {
    const el = h('div', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h2', { text: title }), opts.headExtra || null, opts.noX ? null : h('button', { class: 'x-btn', 'aria-label': t('ui.close'), onclick: () => this.close() }, '✕')),
      opts.tabs || null,
      h('div', { class: 'panel-body' }, body),
      foot ? h('div', { class: 'panel-foot' }, foot) : null);
    return el;
  }

  confirm(text, yes, no, onYes, { danger = false } = {}) {
    const el = this.panel('', h('p', { class: 'pre', text }), [
      h('button', { class: `btn${danger ? ' focus' : ''}`, onclick: () => this.close() }, no || t('ui.no')),
      h('button', { class: `btn ${danger ? 'danger' : 'primary focus'}`, onclick: () => { this.closeModalSilently(); onYes(); } }, yes || t('ui.yes')),
    ]);
    this.open('confirm', el);
  }

  // ------------------------------------------------------------ bag
  openBag(game) {
    let picked = null;
    const grid = h('div', { class: 'grid' });
    const info = h('div', { class: 'infobox' });
    const render = () => {
      grid.innerHTML = '';
      game.inv.slots.forEach((s, i) => {
        grid.append(this._slotEl(game, s, i, {
          picked: picked === i,
          selected: game.inv.selected === i && picked === null,
          onclick: () => {
            if (picked === null) { if (s) { picked = i; info.textContent = `${itemName(s.id)} — ${t(`item.${s.id}.desc`)}`; } }
            else { if (picked !== i) game.inv.swap(picked, i); picked = null; }
            Audio.play('click');
            render();
          },
        }));
      });
    };
    render();
    this.open('bag', this.panel(t('bag.title'), [h('p', { class: 'help', text: t('bag.help') }), grid, info]));
  }

  // ------------------------------------------------------------ shop
  openShop(game, tab = 'buy') {
    const marigold = game.npcs.get('marigold');
    const body = h('div');
    const money = h('span', { class: 'price' });
    const render = () => {
      money.replaceChildren(coin(game.money));
      body.innerHTML = '';
      body.append(h('p', { class: 'help', text: marigold.gnomed ? t('shop.honor') : t('shop.greet') }));
      if (this._giftShown) body.append(h('p', { class: 'news good', text: t('shop.gift') }));
      if (tab === 'buy') {
        const rows = SHOP_STOCK.map((id) => h('div', { class: 'item-row' }, icon(id),
          h('div', { class: 'grow' }, h('div', { class: 'name', text: ITEMS[id].pack ? `${itemName(id)} ×${ITEMS[id].pack}` : itemName(id) }), h('div', { class: 'desc', text: t(`item.${id}.desc`) })),
          h('span', { class: 'price' }, coin(ITEMS[id].price)),
          h('button', { class: 'btn small', disabled: game.money < ITEMS[id].price, onclick: () => { if (game.buy(id)) this.toast(t('msg.bought', { item: itemName(id) })); render(); } }, t('shop.buyTab'))));
        rows.push(h('div', { class: 'item-row' }, icon('backpack'),
          h('div', { class: 'grow' }, h('div', { class: 'name', text: itemName('backpack') }), h('div', { class: 'desc', text: t('item.backpack.desc') })),
          h('span', { class: 'price' }, game.flags.backpack ? t('shop.owned') : coin(BACKPACK.price)),
          h('button', { class: 'btn small', disabled: game.flags.backpack || game.money < BACKPACK.price, onclick: () => { if (game.buy('backpack')) this.toast(t('msg.bought', { item: itemName('backpack') })); render(); } }, t('shop.buyTab'))));
        body.append(...rows);
      } else {
        let any = false;
        game.inv.slots.forEach((s, i) => {
          if (!s || !game.sellable(s.id)) return;
          any = true;
          body.append(h('div', { class: 'item-row' }, icon(s.id),
            h('div', { class: 'grow' }, h('div', { class: 'name', text: `${itemName(s.id)} ×${s.qty}` })),
            h('span', { class: 'price' }, coin(game.sellValue(s.id))),
            h('button', { class: 'btn small', onclick: () => { game.sellSlot(i, false); render(); } }, t('shop.sellOne')),
            s.qty > 1 ? h('button', { class: 'btn small', onclick: () => { game.sellSlot(i, true); render(); } }, t('shop.sellAll')) : null));
        });
        if (!any) body.append(h('p', { text: t('shop.nothingToSell') }));
      }
      tabs.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    };
    this._giftShown = false;
    const tabs = h('div', { class: 'tabs' },
      h('button', { class: 'tab', 'data-tab': 'buy', onclick: () => { tab = 'buy'; render(); } }, t('shop.buyTab')),
      h('button', { class: 'tab', 'data-tab': 'sell', onclick: () => { tab = 'sell'; render(); } }, t('shop.sellTab')));
    render();
    const gift = game.claimStarter();
    game.tut('shop');
    if (gift) { this.toast(t('shop.giftToast'), 'clue'); this._giftShown = true; render(); }
    this.open('shop', this.panel(t('shop.title'), body, null, { tabs, headExtra: money }));
  }

  // ------------------------------------------------------------ shipping bin
  openBin(game) {
    const left = h('div'), right = h('div'), total = h('div', { class: 'price' });
    const render = () => {
      left.innerHTML = ''; right.innerHTML = '';
      left.append(h('h3', { text: t('bag.title') }));
      let any = false;
      game.inv.slots.forEach((s, i) => {
        if (!s || !game.sellable(s.id)) return;
        any = true;
        left.append(h('div', { class: 'item-row' }, icon(s.id), h('div', { class: 'grow' }, `${itemName(s.id)} ×${s.qty}`),
          h('span', { class: 'price' }, coin(game.sellValue(s.id) * s.qty)),
          h('button', { class: 'btn small', onclick: () => { game.shipSlot(i); render(); } }, t('ui.ok'))));
      });
      if (!any) left.append(h('p', { class: 'help', text: t('shop.nothingToSell') }));
      right.append(h('h3', { text: t('bin.inBin') }));
      if (!game.bin.length) right.append(h('p', { class: 'help', text: t('bin.empty') }));
      game.bin.forEach((b, i) => right.append(h('div', { class: 'item-row' }, icon(b.id), h('div', { class: 'grow' }, `${itemName(b.id)} ×${b.qty}`),
        h('button', { class: 'btn small', onclick: () => { game.unship(i); render(); } }, t('bin.takeBack')))));
      total.textContent = t('bin.value', { n: game.binValue() });
    };
    render();
    this.open('bin', this.panel(t('bin.title'), [h('p', { class: 'help', text: t('bin.help') }), h('div', { class: 'cols' }, left, right)], [total]));
  }

  // ------------------------------------------------------------ workbench
  openCraft(game) {
    game.tut('workbench');
    const body = h('div');
    const render = () => {
      body.innerHTML = '';
      body.append(h('p', { class: 'help', text: t('craft.help') }));
      for (const r of RECIPES) {
        const needs = Object.entries(r.need).map(([id, n]) => {
          const have = game.inv.count(id);
          return h('span', { class: `tag ${have >= n ? 'green' : 'red'}` }, `${n} ${itemName(id)} (${t('craft.have', { n: have })})`);
        });
        body.append(h('div', { class: 'item-row' }, icon(r.out),
          h('div', { class: 'grow' }, h('div', { class: 'name', text: itemName(r.out) }), h('div', { class: 'desc', text: t(`item.${r.out}.desc`) }), h('div', {}, needs)),
          h('button', { class: 'btn small', disabled: !game.canCraft(r), onclick: () => { game.craft(r); render(); } }, t('craft.make'))));
      }
    };
    render();
    this.open('craft', this.panel(t('craft.title'), body));
  }

  // ------------------------------------------------------------ notice board
  openBoard(game) {
    const body = h('div');
    const news = [...game.mystery.news].reverse();
    if (!news.length) body.append(h('div', { class: 'paper' }, t('board.empty')));
    for (const n of news) {
      const pool = tList(`news.${n.type}`);
      const line = fmt(pool[n.n % pool.length], { victim: t(`npc.${n.victim}.name`).toUpperCase(), place: t(`place.${n.place}`).toUpperCase() });
      body.append(h('div', { class: 'paper' }, h('div', { class: 'day', text: t('notebook.foundDay', { day: n.day }) }), h('div', { class: 'headline', text: line })));
    }
    if (game.quests.length) body.append(h('div', { class: 'paper' }, h('div', { class: 'headline', text: t('quest.boardTitle') }), ...game.quests.map((q) => this._questRow(game, q))));
    body.append(h('div', { class: 'paper' }, t('board.store')), h('div', { class: 'paper' }, t('board.hall')));
    this.open('board', this.panel(t('board.title'), body));
  }

  _questRow(game, q) {
    const have = game.inv.count(q.item);
    return h('div', { class: 'item-row' }, h('img', { src: Art.portraits[q.npc], alt: '' }),
      h('div', { class: 'grow' },
        h('div', { class: 'name', text: t('quest.line', { name: t(`npc.${q.npc}.short`), qty: q.qty, item: itemName(q.item) }) }),
        h('div', { class: 'desc', text: `${t('quest.due', { dow: tList('days')[dayOfWeek(q.due)], day: q.due })} · ${t('quest.rewardLine', { n: game.questReward(q) })}` })),
      icon(q.item), h('span', { class: `tag ${have >= q.qty ? 'green' : 'red'}`, text: `${have}/${q.qty}` }));
  }

  // ------------------------------------------------------------ accusation
  openAccuse(game) {
    const list = h('div', { class: 'suspects' });
    for (const v of VILLAGERS) {
      const n = game.npcs.get(v.id);
      if (n.gnomed) continue;
      list.append(h('button', { class: 'suspect btn', style: 'text-align:left', onclick: () => {
        this.confirm(t('accuse.confirm', { name: t(`npc.${v.id}.name`) }), t('accuse.choose', { name: t(`npc.${v.id}.short`) }), t('ui.cancel'), () => game.accuse(v.id), { danger: true });
      } }, h('img', { src: Art.portraits[v.id], alt: '' }), h('div', {}, h('div', { class: 'name', text: t(`npc.${v.id}.name`) }), h('div', { class: 'title', text: t(`npc.${v.id}.title`) }))));
    }
    game.tut('lectern');
    this.open('accuse', this.panel(t('accuse.title'), [h('p', { class: 'help', text: t('accuse.help') }), list]));
  }

  // ------------------------------------------------------------ notebook
  // Per-suspect tally of what the player has found: clues pointing at them, and whether an alibi clears them.
  _caseTally(game) {
    const tally = {};
    for (const v of VILLAGERS) if (v.candidate) tally[v.id] = { against: 0, alibi: false };
    for (const f of game.mystery.found) {
      const c = CLUES[f.id];
      if (!c.subject || !tally[c.subject]) continue;
      if (c.role === 'alibi') tally[c.subject].alibi = true;
      else tally[c.subject].against++;
    }
    return tally;
  }

  openNotebook(game, tab = 'suspects') {
    game.tut('notebook');
    const body = h('div');
    let filter = 'all';
    const m = game.mystery;
    const render = () => {
      body.innerHTML = '';
      tabs.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
      if (tab === 'suspects') {
        body.append(h('p', { class: 'help', text: `${t('notebook.nextHint', { n: game.victimCount, max: game.mystery.maxVictims })} ${t('notebook.seasonLeft', { day: Math.min(game.day, SEASON_DAYS), total: SEASON_DAYS })}` }));
        const grid = h('div', { class: 'suspects' });
        const tally = this._caseTally(game);
        for (const v of VILLAGERS) {
          const n = game.npcs.get(v.id);
          const mark = m.notes[v.id] || 'none';
          const loves = game.flags.knownLoves[v.id] || [];
          const wealthWords = tList('notebook.wealth');
          grid.append(h('div', { class: `suspect ${mark}${n.gnomed ? ' gnomed' : ''}` },
            h('img', { src: n.gnomed ? Art.gnomes[v.id].toDataURL() : Art.portraits[v.id], alt: '' }),
            h('div', { style: 'flex:1;min-width:0' },
              h('div', { class: 'name', text: t(`npc.${v.id}.name`) }),
              h('div', { class: 'title', text: t(`npc.${v.id}.title`) }),
              hearts(n.hearts),
              h('div', { class: 'bio', text: t(`npc.${v.id}.bio`) }),
              h('div', { class: 'meta' }, `${t('notebook.heightLabel', { n: v.stats.height })} · ${t('notebook.wealthLabel', { w: wealthWords[v.stats.wealth] || '' })}`),
              h('div', { class: 'meta' }, loves.length ? t('notebook.lovesLabel', { items: loves.map(itemName).join(', ') }) : t('notebook.unknownLoves')),
              v.candidate ? h('div', { class: 'meta' }, t('notebook.tally', { n: tally[v.id].against }), tally[v.id].alibi ? h('span', { class: 'tag green', text: t('notebook.hasAlibi') }) : null) : null,
              h('div', {},
                n.gnomed ? h('span', { class: 'tag red', text: t('notebook.gnomed') }) : null,
                n.gnomed && v.candidate ? h('span', { class: 'tag green', text: t('notebook.victimInnocent') }) : null,
                m.protect[v.id] > 0 ? h('span', { class: 'tag gold', text: t('notebook.protected', { n: m.protect[v.id] }) }) : null,
                !v.candidate ? h('span', { class: 'tag green', text: t('notebook.candidateNo') }) : null),
              v.candidate && !m.solved && !n.gnomed ? h('button', { class: 'btn small', style: 'margin-top:0.3rem', onclick: () => {
                const next = { none: 'sus', sus: 'clear', clear: 'none' }[mark];
                if (next === 'none') delete m.notes[v.id]; else m.notes[v.id] = next;
                Audio.play('click'); render();
              } }, `${t('notebook.mark')}: ${t(`notebook.marks.${mark}`)}`) : null)));
        }
        body.append(grid);
      } else if (tab === 'clues') {
        // case board: who the evidence points at
        const tally = this._caseTally(game);
        const max = Math.max(1, ...Object.values(tally).map((x) => x.against));
        body.append(h('div', { class: 'caseboard' }, Object.entries(tally).map(([id, x]) => {
          const gnomed = game.npcs.get(id).gnomed;
          return h('div', { class: `case-row${x.alibi || gnomed ? ' cleared' : ''}` },
            h('img', { src: gnomed ? Art.gnomes[id].toDataURL() : Art.portraits[id], alt: '' }),
            h('span', { class: 'case-name', text: t(`npc.${id}.short`) }),
            h('span', { class: 'case-bar' }, h('span', { style: `width:${gnomed ? 0 : (x.against / max) * 100}%` })),
            h('span', { class: 'case-n', text: t('notebook.tallyShort', { n: x.against }) }),
            gnomed ? h('span', { class: 'tag green', text: t('notebook.victimInnocent') }) : x.alibi ? h('span', { class: 'tag green', text: t('notebook.hasAlibi') }) : null);
        })));
        body.append(h('p', { class: 'help', text: t('notebook.caseHelp') }));
        const subjects = ['all', ...VILLAGERS.filter((v) => v.candidate).map((v) => v.id), 'general'];
        body.append(h('div', { class: 'filters' }, subjects.map((s) => h('button', { class: `btn small${filter === s ? ' sel' : ''}`, onclick: () => { filter = s; render(); } },
          s === 'all' ? t('notebook.filterAll') : s === 'general' ? t('notebook.general') : t(`npc.${s}.short`)))));
        const found = [...m.found].reverse().filter((f) => {
          const c = CLUES[f.id];
          if (filter === 'all') return true;
          if (filter === 'general') return !c.subject;
          return c.subject === filter;
        });
        if (!found.length) body.append(h('p', { class: 'help', text: t('notebook.noClues') }));
        for (const f of found) {
          const c = CLUES[f.id];
          const tag = !c.subject ? null : c.role === 'alibi'
            ? h('span', { class: 'tag green', text: t('notebook.clears', { name: t(`npc.${c.subject}.short`) }) })
            : h('span', { class: 'tag red', text: t('notebook.pointsTo', { name: t(`npc.${c.subject}.short`) }) });
          const explained = c.subject && c.role !== 'alibi' && tally[c.subject] && (tally[c.subject].alibi || game.npcs.get(c.subject).gnomed);
          body.append(h('div', { class: `clue${explained ? ' explained' : ''}${c.role === 'alibi' ? ' alibi' : ''}` }, h('div', { class: 'ct', text: t(`clue.${f.id}.title`) }), h('div', { class: 'cx', text: t(`clue.${f.id}.text`) }),
            h('div', { class: 'cm' }, tag, ' ', explained ? h('span', { class: 'tag', text: t('notebook.explained') }) : null, ' ', t('notebook.foundDay', { day: f.day }))));
        }
      } else if (tab === 'victims') {
        body.append(h('p', { class: 'help', text: t('notebook.nextHint', { n: game.victimCount, max: game.mystery.maxVictims }) }));
        if (!m.attacks.length) body.append(h('p', { text: t('notebook.noVictims') }));
        for (const a of m.attacks) {
          const v = byId[a.victim];
          const line = t(a.blocked ? 'notebook.foiledLine' : 'notebook.victimLine', { day: a.night + 1, name: t(`npc.${a.victim}.name`), place: t(`place.${a.place}`) });
          const wealthWords = tList('notebook.wealth');
          body.append(h('div', { class: 'item-row' }, h('img', { src: a.blocked ? Art.portraits[a.victim] : Art.gnomes[a.victim].toDataURL(), alt: '' }),
            h('div', { class: 'grow' }, h('div', { class: 'name', text: line }),
              h('div', { class: 'desc', text: `${t('notebook.heightLabel', { n: v.stats.height })} · ${t('notebook.wealthLabel', { w: wealthWords[v.stats.wealth] })} · ♥${game.npcs.get(a.victim).hearts}` }))));
        }
      } else if (tab === 'requests') {
        body.append(h('p', { class: 'help', text: t('quest.help') }));
        if (!game.quests.length) body.append(h('p', { text: t('quest.none') }));
        for (const q of game.quests) body.append(this._questRow(game, q));
      } else {
        body.append(h('ul', {}, tList('help.lines').map((l) => h('li', { text: l, style: 'margin-bottom:0.35rem' }))));
      }
    };
    const tabs = h('div', { class: 'tabs' }, ['suspects', 'clues', 'victims', 'requests', 'help'].map((id) =>
      h('button', { class: 'tab', 'data-tab': id, onclick: () => { tab = id; render(); } }, t(`notebook.${id}`))));
    render();
    this.open('notebook', this.panel(t('notebook.title'), body, null, { tabs }));
  }

  // ------------------------------------------------------------ achievements & stats
  openAchievements() {
    const un = Progress.unlocked, st = Progress.stats;
    const got = ACHIEVEMENTS.filter((a) => un[a.id]).length;
    const list = ACHIEVEMENTS.map((a) => h('div', { class: `item-row ach${un[a.id] ? ' got' : ''}` },
      h('span', { class: 'ach-icon', text: un[a.id] ? '★' : '☆' }),
      h('div', { class: 'grow' }, h('div', { class: 'name', text: t(`achievement.${a.id}.name`) }), h('div', { class: 'desc', text: t(`achievement.${a.id}.desc`) }))));
    const stats = ['games', 'wins', 'losses', 'days', 'harvested', 'earned', 'clues', 'quests', 'fish', 'pets'].map((k) =>
      h('div', { class: 'summary-line' }, h('span', { text: t(`stats.${k}`) }), h('b', { text: String(st[k] || 0) })));
    const body = [h('p', { class: 'help', text: t('achievement.count', { n: got, total: ACHIEVEMENTS.length }) }), h('div', { class: 'cols' }, h('div', {}, list), h('div', {}, h('h3', { text: t('stats.title') }), stats))];
    this.open('achievements', this.panel(t('achievement.title'), body));
  }

  // ------------------------------------------------------------ pause / help
  openPause(game) {
    const soundBtn = h('button', { class: 'btn', onclick: () => { this.toggleMute(); soundBtn.textContent = t(Audio.muted ? 'ui.soundOff' : 'ui.soundOn'); } }, t(Audio.muted ? 'ui.soundOff' : 'ui.soundOn'));
    const musicBtn = h('button', { class: 'btn', onclick: () => {
      Audio.setMusic(!Audio.musicOn);
      const st = Save.settings(); st.music = Audio.musicOn; Save.saveSettings(st);
      musicBtn.textContent = t(Audio.musicOn ? 'ui.musicOn' : 'ui.musicOff');
    } }, t(Audio.musicOn ? 'ui.musicOn' : 'ui.musicOff'));
    const body = h('div', { style: 'display:flex;flex-direction:column;gap:0.5rem;align-items:stretch;max-width:18rem;margin:0 auto' },
      h('button', { class: 'btn primary focus', onclick: () => this.close() }, t('ui.resume')),
      soundBtn,
      musicBtn,
      h('button', { class: 'btn', onclick: () => this.openNotebook(game, 'help') }, t('ui.controls')),
      h('button', { class: 'btn', onclick: () => this.openAchievements() }, t('achievement.title')),
      h('button', { class: 'btn', onclick: () => this.confirm(t('ui.quitConfirm'), t('ui.quit'), t('ui.cancel'), () => this.onQuit && this.onQuit(), { danger: true }) }, t('ui.quit')));
    this.open('pause', this.panel(t('ui.paused'), body));
  }

  // ------------------------------------------------------------ morning summary
  showMorning(r, game) {
    const body = h('div');
    body.append(h('div', { class: 'summary-line' }, h('span', { text: t('morning.weather', { weather: t(`weather.${r.weather}`) }) }), h('span', { text: t('morning.daysLeft', { n: game.daysLeft }) })));
    if (r.weather === 'rain') body.append(h('p', { class: 'help', text: t('morning.rain') }));
    if (r.passedOut) body.append(h('p', { class: 'news', text: t('morning.passedOut', { n: r.penalty }) }));
    const a = r.attack;
    if (a) {
      const victim = t(`npc.${a.victim}.name`);
      const nn = game.mystery.news[game.mystery.news.length - 1];
      const pool = tList(`news.${nn.type}`);
      const headline = fmt(pool[nn.n % pool.length], { victim: victim.toUpperCase(), place: t(`place.${nn.place}`).toUpperCase() });
      body.append(h('div', { class: `news${a.blocked ? ' good' : ''}` },
        h('div', { class: 'ending-art' }, h('img', { src: a.blocked ? Art.portraits[a.victim] : Art.gnomes[a.victim].toDataURL(), alt: '' })),
        h('div', { class: 'headline', text: headline }),
        h('div', { text: a.blocked ? t('morning.newsFoiled', { victim, place: t(`place.${a.place}`) }) : t('morning.newsGnomed', { victim }) })));
    }
    if (a && game.mystery.attacks.length === 1 && !game.flags.tutSkip2) body.append(h('p', { class: 'news good', text: t('morning.caseOpen') }));
    if (r.scared) body.append(h('p', { class: 'news good', text: t('morning.scared') }));
    if (r.quest) body.append(h('div', { class: 'news good' }, t('quest.new', { name: t(`npc.${r.quest.npc}.name`), qty: r.quest.qty, item: itemName(r.quest.item) })));
    for (const q of r.expired || []) body.append(h('p', { class: 'help', text: t('quest.expired', { name: t(`npc.${q.npc}.short`) }) }));
    if (game.omenTonight) body.append(h('p', { class: 'news', text: t('morning.omen') }));
    if (game.mystery.attacks.length && !game.mystery.solved) body.append(h('p', { class: 'help', text: t('morning.victimsLeft', { n: game.victimCount, max: game.mystery.maxVictims }) }));
    body.append(h('h3', { text: t('morning.shipped') }));
    if (!r.shipped.length) body.append(h('p', { class: 'help', text: t('morning.nothingShipped') }));
    for (const s of r.shipped) body.append(h('div', { class: 'item-row' }, icon(s.id), h('div', { class: 'grow' }, `${itemName(s.id)} ×${s.qty}`), h('span', { class: 'price' }, coin(s.value))));
    if (r.shipped.length) body.append(h('div', { class: 'summary-line' }, h('b', { text: t('morning.total', { n: r.income }) })));
    if (r.seasonOver) body.append(h('p', { class: 'news good', text: t('msg.seasonOver') }));
    const el = this.panel(t('morning.title', { day: game.day }), body, [h('button', { class: 'btn primary focus', onclick: () => this.close() }, t('morning.ok'))], { noX: true });
    this.open('morning', el, { closable: true });
  }

  // Non-blocking letter shown on the first morning.
  showIntro(game) {
    if (game.flags.introDone) return;
    const note = h('div', { class: 'note' },
      h('h3', { text: t('intro.title') }), h('div', { class: 'pre', text: t('intro.body') }),
      h('div', { class: 'tips', text: t('intro.tips') }),
      h('button', { class: 'btn primary', onclick: () => { game.flags.introDone = true; note.remove(); this._note = null; } }, t('intro.ok')));
    $('#hud').append(note);
    this._note = note;
  }
  hideIntro() { if (this._note) { this._note.remove(); this._note = null; } }

  // Small, non-blocking objective card for the first day.
  updateTutorial(game) {
    const step = game.tutStep();
    let card = $('#tutorial');
    this._updateArrowLabel(game, step);
    if (!step || game.mode !== 'play') { if (card) card.remove(); return; }
    const pr = game.tutProgress();
    const key = `${step.id}|${pr.n}|${pr.phase}`;
    if (card && card.dataset.key === key) return;
    if (card) card.remove();
    card = h('div', { id: 'tutorial', class: `tutorial ${pr.phase} flash`, 'data-key': key },
      h('div', { class: 'tut-head' }, h('b', { text: t(`tutorial.title_${pr.phase}`, { n: pr.n, total: pr.total }) }),
        h('button', { class: 'x-btn', 'aria-label': t('tutorial.skip'), title: t('tutorial.skip'), onclick: () => { game.skipTutorial(); this.updateTutorial(game); } }, '✕')),
      h('div', { class: 'tut-goal', text: t(`tutorial.short.${step.id}`) }),
      h('div', { text: t(`tutorial.${step.id}`) }),
      game.tutTarget() ? h('div', { class: 'tut-follow', text: t('tutorial.follow') }) : null);
    $('#hud-left').append(card);
  }

  // Yellow label that travels with the objective arrow, so the arrow always says what it wants.
  _updateArrowLabel(game, step) {
    let el = $('#tut-label');
    const r = game.renderer, pos = r.arrowPos;
    if (!step || !pos || game.mode !== 'play' || this.modal) { if (el) el.style.display = 'none'; return; }
    if (!el) { el = h('div', { id: 'tut-label', class: 'tut-label' }); $('#hud').append(el); }
    const txt = t(`tutorial.short.${step.id}`);
    if (el.textContent !== txt) el.textContent = txt;
    const dpr = window.devicePixelRatio || 1;
    el.style.display = '';
    el.style.left = `${pos.x}px`;
    el.style.top = `${pos.y}px`;
    el.classList.toggle('edge', pos.edge);
  }

  // ------------------------------------------------------------ endings
  showEnding(type, game, accusedId) {
    const gnomer = t(`npc.${game.mystery.gnomerId}.name`);
    const art = h('div', { class: 'ending-art' });
    let text;
    if (type === 'win') {
      art.append(h('img', { src: Art.portraits[game.mystery.gnomerId], alt: '' }));
      text = `${t('ending.win.text', { name: gnomer })}\n\n${t(`killer.${game.mystery.gnomerId}.confession`)}`;
    } else if (type === 'wrong') {
      art.append(h('img', { src: Art.portraits[accusedId], alt: '' }), h('img', { src: Art.portraits.gnomePlayer, alt: '' }));
      text = t('ending.wrong.text', { name: t(`npc.${accusedId}.name`), gnomer });
    } else {
      art.append(h('img', { src: Art.portraits[game.mystery.gnomerId], alt: '' }));
      text = t(`ending.${type}.text`, { gnomer });
    }
    const g = game.mystery.gnomerId;
    const profile = h('p', { class: 'help', text: `${t('ending.motive', { text: t(`killer.${g}.motive`) })}\n${t('ending.tell', { text: t(`killer.${g}.tell`) })}`, style: 'white-space:pre-wrap' });
    const stats = h('p', { class: 'help', text: t('ending.stats', { days: game.day, clues: game.mystery.found.length, gold: game.money }) });
    const body = [art, h('p', { class: 'pre', text }), profile, stats];
    let foot;
    if (type === 'win') {
      body.unshift(h('div', { class: 'win-banner', text: t('ending.win.banner') }));
      body.push(h('p', { class: 'help', text: t('ending.win.choice') }));
      foot = [
        h('button', { class: 'btn', onclick: () => { this.closeModalSilently(); this.onNewGame && this.onNewGame(); } }, t('ending.win.newGame')),
        h('button', { class: 'btn primary focus', onclick: () => { this.closeModalSilently(); this.toast(t('ending.win.contToast'), 'clue'); } }, t('ending.win.cont')),
      ];
      // ignore the key press that confirmed the accusation, so the victory can't be skipped by accident
      for (const btn of foot) { btn.disabled = true; setTimeout(() => { btn.disabled = false; }, 1200); }
    } else {
      foot = [h('button', { class: 'btn primary focus', onclick: () => { this.closeModalSilently(); this.onQuit && this.onQuit(); } }, t('ending.title'))];
    }
    const el = this.panel(t(`ending.${type}.title`), body, foot, { noX: true });
    this.open('ending', el, { closable: false });
  }

  // ------------------------------------------------------------ title
  showTitle(saveInfo, { onPlay, onNew, difficulty, onDifficulty, onLanguage }) {
    const extra = $('#title-extra');
    extra.innerHTML = '';
    extra.append(h('button', { class: 'btn small', onclick: () => this.openAchievements() }, `★ ${t('achievement.title')}`));
    const sel = h('select', { class: 'btn small lang-select', 'aria-label': 'Language', onchange: (e) => onLanguage(e.target.value) },
      SUPPORTED.map((lang) => h('option', { value: lang, ...(lang === currentLang() ? { selected: true } : {}) }, `🌐 ${t(`lang.${lang}`)}`)));
    extra.append(sel);
    const row = $('#title-diff');
    row.innerHTML = '';
    row.append(h('span', { text: t('difficulty.label') }));
    for (const d of ['easy', 'normal', 'hard']) {
      row.append(h('button', { class: `btn small${d === difficulty ? ' sel' : ''}`, title: t(`difficulty.${d}Help`), onclick: () => { onDifficulty(d); this.showTitle(saveInfo, { onPlay, onNew, difficulty: d, onDifficulty }); } }, t(`difficulty.${d}`)));
    }
    row.append(h('div', { class: 'diff-help', text: t(`difficulty.${difficulty}Help`) + (saveInfo ? ` ${t('difficulty.newOnly')}` : '') }));
    this.closeModalSilently();
    this.hideIntro();
    $('#title').classList.remove('hidden');
    $('#title-name').textContent = t('ui.title');
    $('#title-tag').textContent = t('ui.tagline');
    $('#btn-play').textContent = t('ui.play');
    $('#btn-new').textContent = t('ui.newGame');
    $('#btn-new').classList.toggle('hidden', !saveInfo);
    $('#title-info').textContent = saveInfo ? t('ui.continueInfo', { day: saveInfo.day, diff: t(`difficulty.${saveInfo.diff || 'normal'}`) }) : '';
    $('#btn-play').onclick = () => { Audio.play('click'); onPlay(); };
    $('#btn-new').onclick = () => {
      this.confirm(t('ui.newGameConfirm'), t('ui.newGame'), t('ui.cancel'), () => onNew(), { danger: true });
    };
    this._titleArt();
    this._leaves();
  }
  hideTitle() { $('#title').classList.add('hidden'); }

  _leaves() {
    const box = $('#leaves');
    if (!box || box.childElementCount) return;
    const cols = ['#cf7a32', '#a9452f', '#d9a63e', '#8a5a2e', '#b5683a'];
    for (let i = 0; i < 16; i++) {
      const s = 0.7 + Math.random() * 0.8;
      box.append(h('i', { style: `left:${Math.random() * 100}%;background:${cols[i % cols.length]};animation-duration:${9 + Math.random() * 9}s;animation-delay:${-Math.random() * 18}s;transform:scale(${s});width:${0.7 * s}rem;height:${0.45 * s}rem` }));
    }
  }

  _titleArt() {
    const c = $('#title-art'), g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(Art.gnomes.odessa, 4, 20); g.drawImage(Art.gnomes.hollis, 20, 22);
    g.drawImage(Art.gnomes.barnaby, 60, 22); g.drawImage(Art.gnomes.fennel, 76, 20);
    g.drawImage(Art.chars.player.down[0], 40, 14);
    g.drawImage(Art.crops.pumpkin[4], 28, 32); g.drawImage(Art.crops.turnip[3], 52, 33);
  }
}
