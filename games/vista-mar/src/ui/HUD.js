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
      vehicle: $('vehicle-hud'), vhName: $('vh-name'), vhSpeed: $('vh-speed'), vhArc: $('vh-arc'), vhGear: $('vh-gear'), vhHealth: $('vh-health'),
      indLights: $('ind-lights'), indBrake: $('ind-brake'), indDrift: $('ind-drift'), indSiren: $('ind-siren'),
      prompt: $('prompt'), banner: $('banner'), bannerTitle: $('banner-title'), bannerSub: $('banner-sub'), objTimer: $('obj-timer'), objHint: $('obj-hint'), damage: $('damage'), fade: $('fade'), wantedBox: $('wanted'), promptText: $('prompt-text'), toasts: $('toasts'), street: $('street'), lookHint: $('look-hint'), stance: $('stance'), fps: $('fps'),
      wpName: $('wp-name'), wpAmmo: $('wp-ammo'), crosshair: $('crosshair'), armor: $('bar-armor'), armorWrap: $('armor-wrap'),
    };
    this.shownMoney = 0;
    this.lastDistrict = null;
    this.districtTimer = 0;
    this.fpsAcc = 0; this.fpsFrames = 0;
    this.lastStreet = '';
  }

  show(v) { this.root.classList.toggle('hidden', !v); }

  setObjective(title, sub = '', timer = null, hint = '') {
    if (this.el.objTitle.textContent !== title) this.el.objTitle.textContent = title;
    if (this.el.objSub.textContent !== sub) this.el.objSub.textContent = sub;
    const t = this.el.objTimer;
    if (timer === null || timer === undefined) t.classList.add('hidden');
    else {
      t.classList.remove('hidden');
      const s = Math.max(0, Math.ceil(timer));
      t.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      t.classList.toggle('low', s <= 20);
    }
    if (this.el.objHint.textContent !== hint) this.el.objHint.textContent = hint;
  }

  setKicker(t) {
    const k = document.getElementById('obj-kicker');
    if (k.textContent !== t) k.textContent = t;
  }

  banner(title, sub = '', kind = '') {
    const b = this.el.banner;
    this.el.bannerTitle.textContent = title;
    this.el.bannerSub.textContent = sub;
    b.className = kind;
    void b.offsetWidth;
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => b.classList.add('hidden'), kind === 'mission' ? 3200 : 4200);
  }

  flashDamage() {
    const d = this.el.damage;
    d.classList.add('hit');
    clearTimeout(this.dmgTimer);
    this.dmgTimer = setTimeout(() => d.classList.remove('hit'), 90);
  }

  fade(on) {
    this.el.fade.classList.toggle('on', on);
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
    this.el.health.classList.toggle('low', p.health < 30);
    this.setWanted(g.police.level);
    this.el.wantedBox.classList.toggle('flash', g.police.level > 0 && !g.police.seen);
    this.el.stamina.style.width = `${p.stamina}%`;
    // weapon, ammo, armour, crosshair
    const cb = g.combat;
    if (cb) {
      const w = cb.weapon;
      const nm = w.name.toUpperCase();
      if (this.el.wpName.textContent !== nm) this.el.wpName.textContent = nm;
      const at = cb.reloading > 0 ? 'RELOADING…' : cb.ammoText;
      if (this.el.wpAmmo.textContent !== at) this.el.wpAmmo.textContent = at;
      const a = cb.ammo[w.id];
      this.el.wpAmmo.classList.toggle('empty', !!a && a.mag === 0);
      this.el.armorWrap.classList.toggle('hidden', cb.armor <= 0);
      this.el.armor.style.width = `${cb.armor}%`;
      const ch = cb.aiming && !p.vehicle;
      this.el.crosshair.classList.toggle('hidden', !ch);
      if (ch) {
        this.el.crosshair.classList.toggle('hit', cb.hitMarker > 0);
        this.el.crosshair.classList.toggle('target', cb.hitMarker <= 0 && !!cb.aimTarget && cb.aimTarget.kind === 'npc');
      }
    }
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

    // vehicle panel
    const v = p.vehicle;
    this.root.classList.toggle('driving', !!v);
    this.el.vehicle.classList.toggle('hidden', !v);
    if (v) {
      if (this.el.vhName.textContent !== v.spec.label) this.el.vhName.textContent = v.spec.label;
      const kmh = Math.round(v.kmh);
      this.el.vhSpeed.textContent = kmh;
      const frac = Math.min(1, v.kmh / (v.spec.maxSpeed * 3.6));
      this.el.vhArc.style.strokeDashoffset = String(245 * (1 - frac));
      this.el.vhArc.classList.toggle('hot', frac > 0.82);
      this.el.vhGear.textContent = v.gear || 'N';
      this.el.vhHealth.style.width = `${v.health}%`;
      this.el.vhHealth.classList.toggle('low', v.health < 35);
      this.el.indLights.classList.toggle('on', v.headlights);
      this.el.indBrake.classList.toggle('on', v.braking);
      this.el.indDrift.classList.toggle('alert', v.slip > 3.5 && Math.abs(v.speed) > 5);
      this.el.indSiren.classList.toggle('hidden', !v.spec.siren);
      this.el.indSiren.classList.toggle('alert', v.siren);
    }

    const st = this.streetName(p.pos.x, p.pos.z);
    if (st !== this.lastStreet) { this.lastStreet = st; this.el.street.textContent = st; }

    const inp = g.input;
    this.el.lookHint.classList.toggle('hidden', !(g.state === 'playing' && !inp.locked && !inp.dragLook && g.playTime < 8));

    if (g.settings.showFps) {
      this.fpsAcc += dt; this.fpsFrames++;
      if (this.fpsAcc > 0.5) {
        const info = g.renderer.info.render;
        const c = g.renderer.domElement;
        this.el.fps.textContent = `${Math.round(this.fpsFrames / this.fpsAcc)} fps · frame ${(g.frameMs || 0).toFixed(1)}ms · cpu logic ${(g.cpuUpdate || 0).toFixed(1)}ms · cpu render ${(g.cpuRender || 0).toFixed(1)}ms · ${g.lastCalls || 0} calls · ${c.width}×${c.height}px · ${g.settings.quality} · auto L${g.perfLevel || 0} · ${g.gpuName}`;
        void info;
        this.fpsAcc = 0; this.fpsFrames = 0;
      }
    }
    this.el.fps.classList.toggle('hidden', !g.settings.showFps);
  }
}
