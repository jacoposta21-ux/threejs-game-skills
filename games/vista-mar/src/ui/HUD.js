import { DISTRICTS, ROAD_NAMES, LINES, xWidths, zWidths, classify } from '../world/Layout.js';

const $ = (id) => document.getElementById(id);

// DOM HUD: objective, money, clock, wanted stars, health/stamina, district
// banner, street name, interaction prompt and toasts.
export class HUD {
  constructor(game) {
    this.game = game;
    this.root = $('hud');
    this.el = {
      objTitle: $('obj-title'), objSub: $('obj-sub'), clock: $('clock'), money: $('money'), wanted: [...document.querySelectorAll('#wanted .star')],
      health: $('bar-health'), stamina: $('bar-stamina'), district: $('district'), districtName: $('district-name'), districtSub: $('district-sub'),
      prompt: $('prompt'), promptText: $('prompt-text'), toasts: $('toasts'), street: $('street'), lookHint: $('look-hint'), stance: $('stance'), fps: $('fps'),
    };
    this.shownMoney = 0;
    this.lastDistrict = null;
    this.districtTimer = 0;
    this.fpsAcc = 0; this.fpsFrames = 0;
    this.lastStreet = '';
  }

  show(v) { this.root.classList.toggle('hidden', !v); }

  setObjective(title, sub = '') {
    if (this.el.objTitle.textContent !== title) this.el.objTitle.textContent = title;
    if (this.el.objSub.textContent !== sub) this.el.objSub.textContent = sub;
  }

  setWanted(level) {
    this.el.wanted.forEach((s, i) => s.classList.toggle('on', i < level));
  }

  toast(title, body = '', kind = '') {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.innerHTML = `<b></b><span></span>`;
    t.querySelector('b').textContent = title;
    t.querySelector('span').textContent = body;
    this.el.toasts.appendChild(t);
    setTimeout(() => t.classList.add('out'), 3600);
    setTimeout(() => t.remove(), 4100);
    while (this.el.toasts.children.length > 3) this.el.toasts.firstChild.remove();
  }

  prompt(text) {
    if (!text) { this.el.prompt.classList.add('hidden'); return; }
    this.el.prompt.classList.remove('hidden');
    if (this.el.promptText.textContent !== text) this.el.promptText.textContent = text;
  }

  streetName(x, z) {
    let best = null, bd = 1e9;
    LINES.forEach((lx, k) => { const d = Math.abs(x - lx) - xWidths[k] / 2; if (d < bd && z > -415 && z < 415) { bd = d; best = ROAD_NAMES.x[lx]; } });
    LINES.forEach((lz, k) => { const d = Math.abs(z - lz) - zWidths[k] / 2; if (d < bd && x > -415 && x < 415) { bd = d; best = ROAD_NAMES.z[lz]; } });
    if (x > 413) return 'Vista Mar Beach';
    return bd < 14 ? best : '';
  }

  update(dt) {
    const g = this.game, p = g.player;
    this.el.clock.textContent = g.world.clockString;
    // money count-up
    if (this.shownMoney !== g.money) {
      const diff = g.money - this.shownMoney;
      this.shownMoney += Math.sign(diff) * Math.max(1, Math.ceil(Math.abs(diff) * Math.min(1, dt * 6)));
      if (Math.abs(g.money - this.shownMoney) < 1) this.shownMoney = g.money;
      this.el.money.classList.add('bump');
    } else this.el.money.classList.remove('bump');
    this.el.money.textContent = '$' + Math.round(this.shownMoney).toLocaleString('en-US');
    this.el.health.style.width = `${p.health}%`;
    this.el.stamina.style.width = `${p.stamina}%`;
    this.el.stamina.classList.toggle('low', p.staminaLock);
    this.el.stance.textContent = p.crouched ? 'CROUCH' : p.walkMode ? 'WALK' : '';

    // district banner on change
    const c = classify(p.pos.x, p.pos.z);
    const d = c.district;
    if (d !== this.lastDistrict) {
      this.lastDistrict = d;
      const info = DISTRICTS[d];
      if (info) {
        this.el.districtName.textContent = info.name;
        this.el.districtSub.textContent = info.sub;
        this.el.district.classList.add('show');
        this.districtTimer = 4;
      }
    }
    this.districtTimer -= dt;
    if (this.districtTimer <= 0) this.el.district.classList.remove('show');

    const st = this.streetName(p.pos.x, p.pos.z);
    if (st !== this.lastStreet) { this.lastStreet = st; this.el.street.textContent = st; }

    const inp = g.input;
    this.el.lookHint.classList.toggle('hidden', !(g.state === 'playing' && !inp.locked && !inp.dragLook && g.playTime < 8));

    if (g.settings.showFps) {
      this.fpsAcc += dt; this.fpsFrames++;
      if (this.fpsAcc > 0.5) {
        const info = g.renderer.info.render;
        this.el.fps.textContent = `${Math.round(this.fpsFrames / this.fpsAcc)} fps · ${info.calls} calls · ${(info.triangles / 1000).toFixed(0)}k tris`;
        this.fpsAcc = 0; this.fpsFrames = 0;
      }
    }
    this.el.fps.classList.toggle('hidden', !g.settings.showFps);
  }
}
