import * as THREE from 'three';
import { terrainHeight } from '../world/Layout.js';
import { WEAPONS } from '../combat/Weapons.js';
import { radialGlowTexture } from '../world/textures.js';

// Ways to spend money: weapon shop, clothes, car tuning + a private garage
// spot, properties with daily income (Club Velvet among them), club visits and
// police bribes. Income is paid every in-game morning at 08:00.

export const OWNED_SPOT = { x: 52, z: -11.4, h: Math.PI / 2 };

const OUTFITS = [
  { key: 'player', name: 'Beach Look', desc: 'Tank top and board shorts. The Vista Mar classic.', price: 0 },
  { key: 'npc_m_casual', name: 'Night Out', desc: 'Purple shirt, clean sneakers.', price: 300 },
  { key: 'npc_m_casual2', name: 'Weekend', desc: 'Relaxed tee and jeans.', price: 250 },
  { key: 'npc_m_punk', name: 'Street', desc: 'Black and red. People cross the road.', price: 600 },
  { key: 'npc_m_worker', name: 'Work Crew', desc: 'Hi-vis vest. Nobody asks questions.', price: 400 },
  { key: 'npc_m_suit', name: 'Sharp Suit', desc: 'Tailored black suit for serious business.', price: 1500 },
];

export const PROPERTIES = [
  { id: 'condo', name: 'Seaside Condo', x: 390, z: 150, price: 15000, income: 0, safehouse: true, desc: 'Ocean Drive apartment: a second save point with a sea view.' },
  { id: 'cabs', name: 'Sunshine Cab Co.', x: 291, z: -60, price: 20000, income: 1200, desc: 'A fleet of yellow cabs. Pays $1,200 every morning.' },
  { id: 'spray', name: 'Spray & Go Garage', x: -190.8, z: -48, price: 12000, income: 600, desc: 'Free resprays for life, plus $600 every morning.' },
  { id: 'club', name: 'Club Velvet', x: 284.5, z: 73, price: 40000, income: 2500, desc: 'The hottest club on Neon Mile. Pays $2,500 every morning.' },
  { id: 'hangar', name: 'Hangar 7', x: -158, z: -506, price: 60000, income: 3000, desc: 'Private airport hangar. Taking aircraft no longer draws stars. $3,000 every morning.' },
];

export class Economy {
  constructor(game) {
    this.game = game;
    this.owned = new Set();
    this.outfit = 'player';
    this.outfits = new Set(['player']);
    this.lastHour = game.world.timeOfDay;
    this.places = [
      { kind: 'guns', x: -150, z: -15.2, r: 1.8, foot: true, label: 'Browse Sunline Arms', icon: 'G', color: '#ff9d3d' },
      { kind: 'clothes', x: -50, z: -209.5, r: 1.8, foot: true, label: 'Browse Threads & Co.', icon: 'T', color: '#c58cff' },
      { kind: 'tuning', x: -195.5, z: -64, r: 6, car: true, label: 'Vista Customs: tune this car', icon: 'C', color: '#3fe0e8' },
      { kind: 'clubdoor', x: 285.5, z: 62, r: 1.6, foot: true, label: '', icon: '♪', color: '#b05cff' },
      ...PROPERTIES.map((p) => ({ kind: 'property', prop: p, x: p.x, z: p.z, r: 1.6, foot: true, label: '', icon: '$', color: '#7dff9b' })),
    ];
    this.buildProps();
    this.dancers = [];
  }

  buildProps() {
    const g = this.game;
    this.group = new THREE.Group();
    g.scene.add(this.group);
    for (const p of this.places) {
      const y = terrainHeight(p.x, p.z);
      const ring = new THREE.Mesh(new THREE.RingGeometry(p.r * 0.85, p.r, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(p.color).multiplyScalar(1.6), transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }));
      ring.position.set(p.x, y + 0.05, p.z);
      this.group.add(ring);
      p.ring = ring;
    }
  }

  /** Club dancers and crowd: spawned once the NPC system exists. */
  spawnClubLife() {
    const n = this.game.npcs;
    if (this.dancers.length) return;
    const stage = [[251, 37, 'npc_w_casual'], [258, 36.5, 'npc_w_punk'], [265, 37, 'npc_w_formal']];
    for (const [x, z, k] of stage) { const a = n.spawnActor(k, x, z, Math.PI, 'Dance_Loop'); if (a) { a.pos.y = 1.08; a.root.position.y = 1.08; this.dancers.push(a); } }
    const crowd = [[249, 27, 'npc_m_casual', 'Dance_Loop'], [256, 25.5, 'npc_w_casual', 'Dance_Loop'], [262, 27.5, 'npc_m_casual', 'Idle_Talking_Loop'], [268, 26, 'npc_w_punk', 'Dance_Loop']];
    for (const [x, z, k, clip] of crowd) { const a = n.spawnActor(k, x, z, 0.15 - Math.random() * 0.3, clip); if (a) this.dancers.push(a); }
    const bouncer = n.spawnActor('guard', 286.4, 67.5, Math.PI / 2, 'Idle_Loop');
    if (bouncer) this.dancers.push(bouncer);
  }

  // ------------------------------------------------------------ interaction
  current() {
    const pl = this.game.player;
    for (const p of this.places) {
      if (p.car && !pl.vehicle) continue;
      if (p.foot && pl.vehicle) continue;
      if (Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z) < p.r) { p.label = this.labelFor(p); return p; }
    }
    return null;
  }

  labelFor(p) {
    if (p.kind === 'property') {
      const o = this.owned.has(p.prop.id);
      if (o && p.prop.safehouse) return `${p.prop.name}: save game and sleep until 08:00`;
      return o ? `${p.prop.name} · yours${p.prop.income ? ` · $${p.prop.income.toLocaleString('en-US')}/day` : ''}` : `For sale: ${p.prop.name} ($${p.prop.price.toLocaleString('en-US')})`;
    }
    if (p.kind === 'clubdoor') return this.owned.has('club') ? 'Club Velvet VIP lounge (free, restores health)' : 'Club Velvet: enjoy the show ($50)';
    return p.label;
  }

  use(p) {
    const g = this.game;
    switch (p.kind) {
      case 'guns': return this.gunShop();
      case 'clothes': return this.clothesShop();
      case 'tuning': return this.tuningShop();
      case 'clubdoor': return this.clubVisit();
      case 'property': {
        const pr = p.prop;
        if (this.owned.has(pr.id)) {
          if (pr.safehouse) {
            if (g.police.level > 0) { g.hud.toast('NOT NOW', 'You cannot save while the police are after you.'); return; }
            g.save(); g.sleepUntil(8);
          } else g.hud.toast(pr.name.toUpperCase(), pr.income ? `Earns $${pr.income.toLocaleString('en-US')} every morning at 08:00.` : 'It is yours.');
          return;
        }
        return g.shop.show({
          kicker: 'Property for sale', title: pr.name, sub: pr.desc,
          items: () => [{ name: `Buy ${pr.name}`, desc: pr.income ? `Income $${pr.income.toLocaleString('en-US')} per day` : 'Safehouse', price: pr.price, owned: this.owned.has(pr.id), closeAfter: true, buy: () => this.buyProperty(pr) }],
        });
      }
      default:
    }
  }

  buyProperty(pr) {
    const g = this.game;
    this.owned.add(pr.id);
    setTimeout(() => {
      g.hud.banner('PROPERTY ACQUIRED', pr.name, 'passed');
      g.audio.missionPassed();
    }, 150);
    g.events.emit('propertyBought', pr);
    return true;
  }

  gunShop() {
    const g = this.game, c = g.combat;
    g.shop.show({
      kicker: 'Port Industrial · Palm Boulevard', title: 'Sunline Arms', sub: 'Licensed dealer. Cash only, no small talk.',
      items: () => {
        const out = [];
        for (const id of ['bat', 'pistol', 'smg', 'shotgun']) {
          const w = WEAPONS[id];
          const has = !!c.inv[id];
          out.push({ name: w.name, desc: id === 'bat' ? 'Solid ash. Left click to swing.' : `${w.mag}-round magazine · comes with ${w.ammoPack} rounds`, price: w.price, owned: has, buy: () => { c.give(id, w.ammoPack || 0); c.select(id); } });
          if (has && !w.melee) out.push({ name: `${w.name} ammo`, desc: `+${w.ammoPack} rounds (you have ${c.ammo[id] ? c.ammo[id].mag + c.ammo[id].reserve : 0})`, price: w.ammoPrice, repeat: true, buy: () => { c.addAmmo(id, w.ammoPack); } });
        }
        out.push({ name: 'Body Armor', desc: `Soaks 70% of incoming damage · now ${Math.round(c.armor)}%`, price: 250, repeat: true, disabled: c.armor >= 100, buy: () => { c.armor = 100; } });
        return out;
      },
    });
  }

  clothesShop() {
    const g = this.game;
    g.shop.show({
      kicker: 'Midtown · 42nd St', title: 'Threads & Co.', sub: 'Change your look. Owned outfits can be worn again for free.',
      items: () => OUTFITS.filter((o) => g.assets[o.key]).map((o) => {
        const has = this.outfits.has(o.key);
        return { name: o.name + (this.outfit === o.key ? '  (wearing)' : ''), desc: o.desc, price: has ? 0 : o.price, label: has ? (this.outfit === o.key ? 'WEARING' : 'WEAR') : null, repeat: true, disabled: this.outfit === o.key, buy: () => { this.outfits.add(o.key); this.wear(o.key); } };
      }),
    });
  }

  wear(key) {
    const g = this.game;
    const gltf = g.assets[key];
    if (!gltf || !g.player.setOutfit(gltf)) return false;
    this.outfit = key;
    // a new look makes it harder for cops who only saw the old one
    if (g.police.level > 0 && g.police.level <= 2 && !g.police.seen) g.police.clear('NEW LOOK');
    return true;
  }

  tuningShop() {
    const g = this.game, v = g.player.vehicle;
    if (!v || v.isAircraft) { g.hud.toast('VISTA CUSTOMS', 'Drive a car in to tune it.'); return; }
    const freeSpray = this.owned.has('spray');
    g.shop.show({
      kicker: 'Port Industrial · Foundry Ave', title: 'Vista Customs', sub: `Working on: ${v.spec.label}. Upgrades stay on this car.`,
      items: () => [
        { name: 'Engine tune · stage 1', desc: '+10% top speed, +18% acceleration', price: 2500, owned: (v.upEngine || 0) >= 1, buy: () => this.upgradeEngine(v, 1) },
        { name: 'Engine tune · stage 2', desc: '+20% top speed, +36% acceleration', price: 4500, owned: (v.upEngine || 0) >= 2, disabled: (v.upEngine || 0) < 1, buy: () => this.upgradeEngine(v, 2) },
        { name: 'Armor plating', desc: 'Takes less than half the damage from crashes and bullets', price: 3000, owned: !!v.armored, buy: () => { v.armored = true; } },
        { name: 'Neon underglow', desc: 'Pink glow under the car. Pure Vista Mar.', price: 900, owned: !!v.underglow, buy: () => { this.addUnderglow(v); } },
        { name: 'Respray + repair', desc: freeSpray ? 'Free at your own garage' : 'New paint, fixed panels', price: freeSpray ? 0 : 150, repeat: true, buy: () => { v.repair(); v.respray(); } },
        { name: 'Keep it in your garage', desc: 'This car waits for you on Palm Boulevard, by the safehouse', price: 1000, owned: v.owned, buy: () => { this.makeOwned(v); } },
      ],
    });
  }

  upgradeEngine(v, level) {
    const base = v.baseSpec || (v.baseSpec = { ...v.spec });
    v.upEngine = level;
    v.spec = { ...base, maxSpeed: base.maxSpeed * (1 + 0.1 * level), accel: base.accel * (1 + 0.18 * level) };
  }

  addUnderglow(v) {
    if (v.underglow) return;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(v.halfW * 2.6, v.halfL * 2.4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: radialGlowTexture(), color: new THREE.Color(2.2, 0.4, 1.4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    m.position.y = 0.05;
    m.renderOrder = 2;
    v.root.add(m);
    v.underglow = m;
  }

  makeOwned(v) {
    const vs = this.game.vehicles;
    for (const o of vs.vehicles) if (o.owned && o !== v) { o.owned = false; if (o.dynamic) o.dynamic = true; }
    v.owned = true;
    v.missionVehicle = true; // never recycled by streaming
    v.spawn = { ...OWNED_SPOT };
    if (v.dynamic) { v.dynamic = false; const i = vs.dynamic.indexOf(v); if (i >= 0) vs.dynamic.splice(i, 1); }
    this.ownedCar = v;
  }

  clubVisit() {
    const g = this.game, pl = g.player;
    const owner = this.owned.has('club');
    if (!owner && g.money < 50) { g.hud.toast('NOT ENOUGH CASH', 'Cover charge is $50.'); return; }
    if (g.police.level > 0) { g.hud.toast('THE BOUNCER SHAKES HIS HEAD', 'Not with the cops on your tail.'); return; }
    if (!owner) g.addMoney(-50);
    g.hud.fade(true);
    setTimeout(() => {
      g.world.setTime((g.world.timeOfDay + 1.5) % 24);
      pl.health = Math.min(100, pl.health + (owner ? 100 : 35));
      pl.stamina = 100;
      g.hud.fade(false);
      g.hud.toast('CLUB VELVET', owner ? 'The VIP lounge treats its owner well. Health restored.' : 'Great music, great dancers. You feel refreshed. -$50', 'reward');
    }, 1400);
  }

  // ------------------------------------------------------------ per frame
  update(dt) {
    const g = this.game;
    const t = g.world.elapsed;
    for (const p of this.places) p.ring.material.opacity = 0.35 + Math.sin(t * 3 + p.x) * 0.2;
    if (!this.dancers.length && g.npcs.baked.length) this.spawnClubLife();
    // daily income at 08:00 (works across sleeping and time skips)
    const now = g.world.timeOfDay;
    const delta = (now - this.lastHour + 24) % 24;
    if (delta > 0 && delta < 20) {
      const crossed = this.lastHour < 8 ? this.lastHour + delta >= 8 : this.lastHour + delta >= 32;
      if (crossed) this.payday();
    }
    this.lastHour = now;
    // bribe: B calls a contact in the VMPD
    if (g.input.hit('KeyB')) this.bribe();
    void dt;
  }

  payday() {
    let total = 0;
    for (const id of this.owned) { const p = PROPERTIES.find((q) => q.id === id); if (p) total += p.income; }
    if (!total) return;
    this.game.addMoney(total);
    this.game.hud.toast('PROPERTY INCOME', `+$${total.toLocaleString('en-US')} from your businesses`, 'reward');
    this.game.audio.cash();
  }

  bribe() {
    const g = this.game, pol = g.police;
    if (pol.level === 0) { g.hud.toast('OFFICER HASKINS', '"You are clean. Stop calling me."'); return; }
    if (pol.level >= 5) { g.hud.toast('OFFICER HASKINS', '"Five stars? Nobody can make that go away."'); return; }
    if (pol.seen) { g.hud.toast('OFFICER HASKINS', '"They have eyes on you. Lose them first, then call."'); return; }
    const cost = 750 * pol.level;
    if (g.money < cost) { g.hud.toast('OFFICER HASKINS', `"That costs $${cost.toLocaleString('en-US')}. Come back with cash."`); return; }
    g.addMoney(-cost);
    pol.clear('PAPERWORK LOST');
    g.hud.toast('OFFICER HASKINS', `"Done. -$${cost.toLocaleString('en-US')}. We never spoke."`, 'reward');
  }

  markers() {
    return this.places.map((p) => ({ x: p.x, z: p.z, color: p.kind === 'property' && this.owned.has(p.prop.id) ? '#ffd23f' : p.color, shape: 'dot', size: p.kind === 'property' ? 5 : 6, label: p.icon }));
  }

  // ------------------------------------------------------------ save
  serialize() {
    const v = this.ownedCar;
    return {
      owned: [...this.owned], outfit: this.outfit, outfits: [...this.outfits],
      car: v ? { spec: v.baseSpec || v.spec, upEngine: v.upEngine || 0, armored: !!v.armored, underglow: !!v.underglow } : null,
    };
  }

  restore(d) {
    if (!d) return;
    this.owned = new Set(d.owned || []);
    this.outfits = new Set(d.outfits || ['player']);
    if (d.outfit && d.outfit !== this.outfit) this.wear(d.outfit);
    if (d.car && d.car.spec) {
      const v = this.game.vehicles.spawnFromSpec(d.car.spec, OWNED_SPOT);
      if (v) {
        this.makeOwned(v);
        if (d.car.upEngine) this.upgradeEngine(v, d.car.upEngine);
        v.armored = d.car.armored;
        if (d.car.underglow) this.addUnderglow(v);
      }
    }
  }

  reset() {
    this.owned.clear();
    this.outfits = new Set(['player']);
    if (this.outfit !== 'player') this.wear('player');
    if (this.ownedCar) { this.ownedCar.owned = false; this.ownedCar = null; }
  }
}
