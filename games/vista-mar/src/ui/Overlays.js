// Story cutscenes (letterbox + dialogue, or an optional MP4 file) and the
// shared shop / property menu.

const $ = (id) => document.getElementById(id);

export class Cutscene {
  constructor(game) {
    this.game = game;
    this.el = $('cutscene');
    this.video = $('cs-video');
    this.active = false;
    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); this.finish(); }
      else if (e.code === 'Space' || e.code === 'KeyE') { e.preventDefault(); this.next(); }
    });
    this.el.addEventListener('click', () => this.active && this.next());
  }

  /** def: { title, lines: [[who, text], ...], video? } */
  play(def, onDone) {
    const g = this.game;
    this.def = def;
    this.onDone = onDone;
    this.idx = -1;
    this.active = true;
    this.usingVideo = false;
    g.cinematic = true;
    g.input.keys.clear();
    this.el.classList.remove('hidden');
    $('cs-title').textContent = def.title || '';
    $('cs-who').textContent = '';
    $('cs-text').textContent = '';
    this.el.style.pointerEvents = 'auto';
    if (def.video) {
      // an external clip placed next to the game (e.g. cutscenes/m03.mp4); falls back to the dialogue
      const v = this.video;
      this.usingVideo = true;
      v.classList.remove('hidden');
      v.src = def.video;
      v.onended = () => this.finish();
      v.onerror = () => this.dropVideo();
      v.play().catch(() => this.dropVideo());
      return;
    }
    this.next();
  }

  dropVideo() {
    if (!this.usingVideo) return;
    this.usingVideo = false;
    this.video.classList.add('hidden');
    this.next();
  }

  next() {
    if (!this.active) return;
    if (this.usingVideo) { this.finish(); return; }
    const lines = this.def.lines || [];
    this.idx++;
    if (this.idx >= lines.length) { this.finish(); return; }
    const [who, text] = lines[this.idx];
    $('cs-who').textContent = who;
    $('cs-text').textContent = text;
    this.timer = Math.max(3.2, text.length * 0.055);
  }

  update(dt) {
    if (!this.active) return;
    this.game.camera3p.yaw += dt * 0.12; // slow orbit around the player
    if (this.usingVideo) return;
    this.timer -= dt;
    if (this.timer <= 0) this.next();
  }

  finish() {
    if (!this.active) return;
    this.active = false;
    this.usingVideo = false;
    this.game.cinematic = false;
    this.video.pause();
    this.video.classList.add('hidden');
    this.el.classList.add('hidden');
    this.el.style.pointerEvents = 'none';
    const cb = this.onDone;
    this.onDone = null;
    if (cb) cb();
  }
}

export class ShopMenu {
  constructor(game) {
    this.game = game;
    this.el = $('shop');
    this.list = $('shop-list');
    this.open = false;
    window.addEventListener('keydown', (e) => {
      if (!this.open) return;
      if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.close(); return; }
      if (!this.items || !this.items.length) return;
      if (e.code === 'KeyW' || e.code === 'ArrowUp') { this.sel = (this.sel - 1 + this.items.length) % this.items.length; this.render(); }
      if (e.code === 'KeyS' || e.code === 'ArrowDown') { this.sel = (this.sel + 1) % this.items.length; this.render(); }
      if (e.code === 'Enter' || e.code === 'KeyE' || e.code === 'Space') { e.preventDefault(); this.buy(this.sel); }
    }, true);
  }

  /** spec: { kicker, title, sub, items: () => [{ name, desc, price, owned, label, disabled, repeat, closeAfter, buy() }] } */
  show(spec) {
    const g = this.game;
    if (g.state !== 'playing') return;
    this.spec = spec;
    this.sel = 0;
    this.open = true;
    this.openedAt = performance.now();
    g.state = 'shop';
    g.suppressUnlockPause = true;
    g.input.exitLock();
    g.input.enabled = false;
    g.input.keys.clear();
    $('shop-kicker').textContent = spec.kicker || '';
    $('shop-title').textContent = spec.title;
    $('shop-sub').textContent = spec.sub || '';
    this.el.classList.remove('hidden');
    this.render();
    g.audio.click();
  }

  render() {
    const g = this.game;
    this.items = this.spec.items();
    this.list.innerHTML = '';
    this.items.forEach((it, i) => {
      const d = document.createElement('div');
      const poor = !it.owned && it.price > g.money;
      d.className = `shop-item${i === this.sel ? ' sel' : ''}${it.owned ? ' owned' : ''}${poor ? ' poor' : ''}`;
      d.innerHTML = '<b></b><span class="price"></span><small></small>';
      d.querySelector('b').textContent = it.name;
      d.querySelector('small').textContent = it.desc || '';
      d.querySelector('.price').textContent = it.label || (it.owned ? 'OWNED' : it.price ? `$${it.price.toLocaleString('en-US')}` : 'FREE');
      d.addEventListener('mouseenter', () => { if (this.sel !== i) { this.sel = i; this.render(); } });
      d.addEventListener('click', () => this.buy(i));
      this.list.appendChild(d);
    });
    $('shop-cash').textContent = `$${g.money.toLocaleString('en-US')}`;
  }

  buy(i) {
    const g = this.game, it = this.items[i];
    if (performance.now() - this.openedAt < 250) return; // the E that opened the menu
    if (!it || it.disabled) { g.audio.dryFire(); return; }
    if (it.owned && !it.repeat) { g.audio.dryFire(); return; }
    if (it.price > g.money) { g.audio.dryFire(); g.hud.toast('NOT ENOUGH CASH', `You need $${it.price.toLocaleString('en-US')}.`); return; }
    const ok = it.buy();
    if (ok === false) { g.audio.dryFire(); return; }
    if (it.price) g.addMoney(-it.price);
    g.hud.shownMoney = g.money;
    g.audio.cash();
    if (it.closeAfter) { this.close(); return; }
    this.render();
  }

  close() {
    const g = this.game;
    if (!this.open) return;
    this.open = false;
    this.el.classList.add('hidden');
    g.state = 'playing';
    g.input.enabled = true;
    g.input.keys.clear();
    g.input.requestLock();
    if (this.spec.onClose) this.spec.onClose();
  }
}
