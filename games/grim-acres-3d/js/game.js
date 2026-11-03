// Game state + rules glue: time, interactions, farming actions, villagers, the night cycle, endings.
// Rendering lives in renderer.js, overlays in ui.js, content in js/data + strings.
import { World, T, TILE } from './world.js';
import { RNG } from './rng.js';
import { Player, NPC, Cat, DIRS } from './entities.js';
import { MAP } from './data/map.js';
import { Inventory, HOTBAR } from './inventory.js';
import { Farm } from './farming.js';
import { Mystery } from './mystery.js';
import { pickLine, reactionLine, giftReaction } from './dialogue.js';
import { ITEMS, BACKPACK, START_INVENTORY, STARTER_SEEDS, START_MONEY, START_INV_SIZE } from './data/items.js';
import { CROPS, DEBRIS } from './data/crops.js';
import { RECIPES } from './data/recipes.js';
import { TUTORIAL } from './data/tutorial.js';
import { FISH, FISHING } from './data/fish.js';
import { VILLAGERS, FRIENDSHIP } from './data/villagers.js';
import { MINUTES_PER_SECOND, DAY_START, DAY_END, SEASON_DAYS, storeOpen, doorLocked } from './time.js';
import { t, tList, fmt } from './i18n.js';
import { Audio } from './audio.js';
import { Save } from './save.js';
import { Platform } from './platform.js';
import { Progress } from './progress.js';

const STEP = 1 / 240; // fixed simulation step: identical behaviour at any refresh rate
const MAX_ENERGY = 100;
const NIGHT_CLOCK = 2;  // on quiet nights (no Gnomer about) the clock runs this much faster after 20:00

export class Game {
  constructor({ renderer, ui, input }) {
    this.renderer = renderer;
    this.ui = ui;
    this.input = input;
    this.mode = 'title';
    this.acc = 0;
    this.emotes = [];
    this.showCursor = false;
    this._gossipCache = new Map();
    this._gossipT = 0;
    this._bumpT = 0;
  }

  // ------------------------------------------------------------ setup
  _baseState(seed) {
    this._tutSay = [];
    this.world = new World();
    this.rng = new RNG(seed);
    this.player = new Player();
    this.farm = new Farm(this.world);
    this.npcs = new Map(VILLAGERS.map((v) => [v.id, new NPC(v)]));
    this.mystery = new Mystery();
    this.bin = [];
    this.emotes = [];
    this.cats = MAP.cats.map(([color, ...rect]) => new Cat(color, rect));
    this.banterT = 6;
    this.quests = []; // villager requests: { npc, item, qty, due }
    this.flags = { backpack: false, knownLoves: {}, introDone: false, tutDone: [], tutSkip: false, starterGiven: false };
    this.stats = { earned: 0, harvested: 0 };
  }

  newGame(difficulty = 'normal', exclude = null) {
    const seed = (Math.random() * 4294967296) >>> 0;
    this._baseState(seed);
    this.day = 1;
    this.minutes = DAY_START;
    this.weather = 'sunny';
    this.money = START_MONEY;
    this.maxEnergy = MAX_ENERGY;
    this.energy = MAX_ENERGY;
    this.water = ITEMS.watering_can.capacity;
    this.inv = new Inventory(START_INV_SIZE);
    for (const [id, n] of START_INVENTORY) this.inv.add(id, n);
    this.farm.scatterDebris(this.rng);
    this.mystery.newGame(this.rng, this.world, difficulty, exclude);
    this._wakeUp();
  }

  loadSave(d) {
    this._baseState(1);
    this.rng.s = d.rng >>> 0;
    this.day = d.day;
    this.minutes = DAY_START;
    this.weather = d.weather || 'sunny';
    this.money = d.money;
    this.maxEnergy = d.maxEnergy || MAX_ENERGY;
    this.energy = Math.min(this.maxEnergy, d.energy ?? this.maxEnergy);
    this.water = d.water ?? 0;
    this.inv = Inventory.fromJSON(d.inv);
    this.farm.load(d.farm || {});
    this.bin = (d.bin || []).filter(([id]) => ITEMS[id]).map(([id, qty]) => ({ id, qty }));
    this.flags = { ...this.flags, ...(d.flags || {}) };
    this.quests = (d.quests || []).filter((q) => ITEMS[q.item] && this.npcs.has(q.npc));
    if (!d.flags || !d.flags.tutDone) this.flags.tutSkip = this.day > 1;
    if (!d.flags || d.flags.starterGiven === undefined) this.flags.starterGiven = this.day > 1;
    this.stats = { ...this.stats, ...(d.stats || {}) };
    for (const [id, s] of Object.entries(d.npcs || {})) {
      const n = this.npcs.get(id);
      if (!n) continue;
      n.friendship = s.f || 0; n.talkDay = s.td || 0; n.giftDay = s.gd || 0; n.talks = s.t || 0;
    }
    this.mystery = Mystery.fromJSON(d.mystery);
    for (const a of this.mystery.attacks) if (!a.blocked && !this.mystery.solved) this._gnome(a);
    if (this.mystery.solved) this.npcs.get(this.mystery.gnomerId).gone = true;
    this._wakeUp();
  }

  serialize() {
    const npcs = {};
    for (const n of this.npcs.values()) npcs[n.id] = { f: n.friendship, td: n.talkDay, gd: n.giftDay, t: n.talks };
    return {
      rng: this.rng.s, day: this.day, weather: this.weather, money: this.money, maxEnergy: this.maxEnergy, energy: this.energy,
      water: this.water, inv: this.inv.toJSON(), farm: this.farm.toJSON(), bin: this.bin.map((b) => [b.id, b.qty]),
      npcs, mystery: this.mystery.toJSON(), flags: this.flags, stats: this.stats, quests: this.quests,
    };
  }

  save() { return Save.write(this.serialize()); }

  _wakeUp() {
    const fh = this.world.areaById.farmhouse;
    this.player.placeAt(fh.x + 2, fh.y + 3, 'down');
    this.player.moving = false;
    for (const n of this.npcs.values()) { n.paused = false; n.snapToSchedule(this.world, this.minutes, this.weather); }
    this.fishing = null; this.ui.fishBar && this.ui.fishBar(null);
    for (const c of this.cats) { c.spawn(this.world); c.friendUntil = 0; }
    this._warned = {};
    this.renderer.snap(this);
  }

  _gnome(attack) {
    const n = this.npcs.get(attack.victim);
    n.gnomed = true;
    this.world.addObject({ kind: 'gnome', x: attack.x, y: attack.y, victim: attack.victim, solid: true, interact: 'statue' });
    this.world.recomputeSolid();
  }

  // ------------------------------------------------------------ the Gnomer's night prowl
  // On attack nights the Gnomer sneaks to tonight's spot (22:30-1:30). Get close and they flee:
  // no gnoming tonight, and you glimpse a clue.
  _prowl(before) {
    const m = this.mystery;
    if (m.solved || m.outcome) return;
    const g = this.npcs.get(m.gnomerId);
    if (before < 22.5 * 60 && this.minutes >= 22.5 * 60 && this.day === m.nextAttack) {
      const plan = m.planTonight(this);
      if (plan) {
        this.world.locations.__prowl = { x: plan.x, y: plan.y, face: 'up', area: 'outdoor' };
        g.override = '__prowl'; g.prowling = true; g.hooded = true; g.speed = 40;
      }
    }
    if (!g.prowling) return;
    if (before < 25.5 * 60 && this.minutes >= 25.5 * 60) { g.override = null; g.prowling = false; return; }
    const p = this.player;
    if (g.area && g.area.outdoor && g.area === this.playerArea() && Math.hypot(g.x - p.x, g.y - p.y) < 36) {
      const clue = m.interrupt(this.day);
      g.override = null; g.prowling = false; g.speed = 90; // bolt home
      this.emote(g, 'bang');
      Audio.play('caught');
      let text = t('night.interrupted');
      if (clue) { text += `\n\n${t(`clue.${clue.id}.title`)}: ${t(`clue.${clue.id}.text`)}`; this._clueToast(clue.id); }
      this.stats.scared = (this.stats.scared || 0) + 1;
      this.ui.say(null, text);
    }
  }

  // ------------------------------------------------------------ quests
  // A villager asks for something they like. Deliver it before the deadline for gold, hearts and gossip.
  _newQuest() {
    if (this.quests.length >= 2 || this.day < 2 || this.mystery.outcome) return null;
    if (!this.rng.chance(0.55)) return null;
    const free = VILLAGERS.filter((v) => !this.npcs.get(v.id).away && !this.quests.some((q) => q.npc === v.id));
    if (!free.length) return null;
    const v = this.rng.pick(free);
    const wants = [...v.loves, ...v.likes].filter((id) => ITEMS[id] && ITEMS[id].gift);
    if (!wants.length) return null;
    const item = this.rng.pick(wants);
    const qty = ITEMS[item].type === 'crop' && item !== 'pumpkin' ? this.rng.int(2, 4) : 1;
    const q = { npc: v.id, item, qty, due: this.day + (item === 'pumpkin' || item === 'cranberry' ? 6 : 3) };
    this.quests.push(q);
    return q;
  }

  questFor(npcId) { return this.quests.find((q) => q.npc === npcId) || null; }

  questReward(q) { return Math.round(((ITEMS[q.item].sell || 20) * q.qty) * 1.5) + 40; }

  deliverQuest(npc) {
    const q = this.questFor(npc.id);
    if (!q || this.inv.count(q.item) < q.qty) { npc.paused = false; return; }
    this.inv.remove(q.item, q.qty);
    this.quests = this.quests.filter((x) => x !== q);
    const gold = this.questReward(q);
    this.money += gold; this.stats.earned += gold;
    this.stats.quests = (this.stats.quests || 0) + 1;
    Progress.add('quests');
    this.addFriendship(npc, 60);
    this.emote(npc, 'heart');
    Audio.play('coin');
    this.ui.toast(t('quest.reward', { n: gold }));
    const pages = [{ who: npc.id, text: t('quest.thanks') }];
    // grateful villagers share what they know, even before you're close friends
    const g = this.mystery.attacks.length ? this.mystery.gossipFor(npc.id, this) : null;
    if (g) {
      this.mystery.addFound(g.clue.id, this.day);
      this._clueToast(g.clue.id);
      this._gossipCache.clear();
      pages.push({ who: npc.id, text: `${t('quest.secret')} ${t(`clue.${g.clue.id}.text`)}` });
    }
    this.ui.dialogue(pages, () => { npc.paused = false; });
  }

  checkAchievements() {
    for (const id of Progress.check(this)) {
      Audio.play('win');
      this.ui.toast(t('achievement.unlocked', { name: t(`achievement.${id}.name`) }), 'clue');
    }
  }

  // ------------------------------------------------------------ tutorial
  tut(event) {
    const f = this.flags;
    if (!f || f.tutDone.includes(event)) return;
    const phase = this.tutPhase();
    if (!phase || !TUTORIAL[phase].some((s) => s.id === event)) return;
    f.tutDone.push(event);
    Audio.play('pickup');
    // explanations wait until any open dialogue closes
    if (TUTORIAL[phase].find((s) => s.id === event).visit) this._tutSay.push(t(`tutorial.arrive.${event}`));
    if (!this.tutStep()) {
      if (phase === 'farm') this.ui.toast(t('tutorial.done'), 'clue');
      else this._tutSay.push(t('tutorial.doneDetective'));
    }
  }

  // Which objective list is active: the detective one takes over once the mystery has started.
  tutPhase() {
    const f = this.flags, done = (list) => list.every((s) => f.tutDone.includes(s.id));
    if (this.mystery.attacks.length && !this.mystery.solved && !f.tutSkip2 && !done(TUTORIAL.detective)) return 'detective';
    if (!f.tutSkip && !done(TUTORIAL.farm)) return 'farm';
    return null;
  }
  // "Go and see" steps complete as soon as the player stands near the target.
  _tutVisit() {
    const step = this.tutStep();
    if (!step || !step.visit) return;
    const W = this.world, o = W.objects.find((ob) => ob.kind === step.target.obj && !ob.removed);
    if (!o || (o.area ? W.areaById[o.area] : W.areaById.outdoor) !== this.playerArea()) return;
    const cx = o.x + (o.w || 1) / 2, cy = o.y + (o.h || 1) / 2;
    if (Math.hypot(this.player.x / TILE - cx, this.player.y / TILE - cy) <= 2.6) this.tut(step.id);
  }
  tutStep() { const p = this.tutPhase(); return p ? TUTORIAL[p].find((s) => !this.flags.tutDone.includes(s.id)) : null; }
  tutProgress() {
    const p = this.tutPhase();
    if (!p) return null;
    const list = TUTORIAL[p];
    return { phase: p, n: list.filter((s) => this.flags.tutDone.includes(s.id)).length + 1, total: list.length };
  }
  skipTutorial() { if (this.tutPhase() === 'detective') this.flags.tutSkip2 = true; else this.flags.tutSkip = true; }

  // World tile the objective arrow points at (routing through doors when the goal is in another room).
  tutTarget() {
    const step = this.tutStep();
    if (!step || !step.target) return null;
    const tg = step.target, W = this.world, here = this.playerArea();
    let tile = null, area = W.areaById.outdoor;
    if (tg.mat) { if (here.id !== tg.mat) return null; return { x: here.mat.x, y: here.mat.y }; }
    if (tg.field) tile = { x: W.field.x + (W.field.w >> 1), y: W.field.y + (W.field.h >> 1) };
    if (tg.place) tile = { x: tg.place[0], y: tg.place[1] };
    if (tg.npc) { // nearest villager, preferring ones in the same room
      const p = this.player;
      const cands = [...this.npcs.values()].filter((n) => !n.away && !n.hooded && n.area);
      cands.sort((a, b) => ((a.area !== here) - (b.area !== here)) || (Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)));
      const n = cands[0];
      if (!n) return null;
      tile = { x: n.tx, y: n.ty - 1 };
      area = n.area;
    }
    if (tg.sparkle) {
      const p = this.player;
      const sp = [...this.mystery.sparkles].sort((a, b) => Math.hypot(a.x - p.tx, a.y - p.ty) - Math.hypot(b.x - p.tx, b.y - p.ty))[0];
      if (!sp) return null;
      tile = { x: sp.x, y: sp.y };
    }
    if (tg.obj) {
      const o = W.objects.find((ob) => ob.kind === tg.obj && !ob.removed);
      if (!o) return null;
      tile = { x: o.x, y: o.y };
      if (o.area) area = W.areaById[o.area];
    }
    if (!tile) return null;
    if (area === here) return tile;
    if (!here.outdoor) return { x: here.mat.x, y: here.mat.y }; // first, get out of this room
    return area.door ? { x: area.door.x, y: area.door.y } : tile;
  }

  // The coming night is an attack night (villagers can feel it).
  get omenTonight() { return this.mystery.diff.omen && !this.mystery.solved && !this.mystery.outcome && this.day === this.mystery.nextAttack; }

  // Human name of a room: "Odessa's house", "Town Hall"...
  areaName(area) {
    if (!area || area.outdoor) return null;
    if (area.owner) return t('area.house', { name: t(`npc.${area.owner}.short`) });
    return t(`area.${area.id}`);
  }

  playerArea() { return this.world.areaAt(this.player.tx, this.player.ty) || this.world.areaById.outdoor; }

  // ------------------------------------------------------------ main loop
  frame(dt) {
    dt = Math.min(dt, 0.25);
    this.input.poll();
    const actions = this.input.consume();
    if (this.mode !== 'play') { this.ui.handleActions(actions, this); return; }
    if (this.ui.blocking) {
      this.ui.setPrompt(null);
      this.ui.handleActions(actions, this);
      this.player.moving = false;
      this.renderer.updateCamera(dt, this);
      return;
    }
    if (this.fishing) {
      // while fishing, E reels in and anything else (moving, Esc) puts the rod away
      for (const a of actions) {
        if (a === 'action' || a === 'click') this._fishInput();
        else if (!/^hot|^wait$/.test(a)) this.stopFishing(true);
      }
      if (Math.hypot(this.input.move.x, this.input.move.y) > 0.5) this.stopFishing(true);
      if (this.fishing) this._fishUpdate(dt);
      actions.length = 0;
    }
    if (this._tutSay.length) { this.ui.say(null, this._tutSay.shift()); return; }
    this._tutVisit();
    for (const a of actions) this._action(a);
    if (this.ui.blocking || this.mode !== 'play') return; // an action may have opened a menu

    this.acc += dt;
    while (this.acc >= STEP) { this.acc -= STEP; this._tick(STEP); if (this.mode !== 'play' || this.ui.blocking) { this.acc = 0; break; } }
    this.renderer.updateCamera(dt, this);
    const cur = this.inv.current;
    this.showCursor = !!cur && ['tool', 'seed'].includes(ITEMS[cur.id].type);
    this.ui.setPrompt(this.resolveAction().label);
  }

  _action(a) {
    if (a === 'action' || a === 'click') { this.resolveAction().run(); return; }
    if (a.startsWith('hot') && /^hot\d$/.test(a)) { this.inv.selected = Number(a[3]); Audio.play('click'); return; }
    if (a === 'hotNext') { this.inv.selected = (this.inv.selected + 1) % HOTBAR; return; }
    if (a === 'hotPrev') { this.inv.selected = (this.inv.selected + HOTBAR - 1) % HOTBAR; return; }
    if (a === 'notebook') { this.ui.openNotebook(this); return; }
    if (a === 'bag') { this.ui.openBag(this); return; }
    if (a === 'pause') { this.ui.openPause(this); return; }
    if (a === 'mute') this.ui.toggleMute();
  }

  // The Gnomer only prowls on attack nights; other nights are skipped through faster.
  get quietNight() { return this.minutes >= 20 * 60 && (this.mystery.solved || this.day !== this.mystery.nextAttack || this.mystery.outcome); }

  _tick(dt) {
    const before = this.minutes;
    this.minutes += dt * MINUTES_PER_SECOND * (this.quietNight ? NIGHT_CLOCK : 1);
    const p = this.player;
    p.update(dt, this.fishing ? { x: 0, y: 0 } : this.input.move, (x, y) => this._blockedForPlayer(x, y));
    if (p.bumped) this._onBump(p.bumped);
    this._checkPortal();
    for (const n of this.npcs.values()) n.update(dt, this.world, this.minutes, this.weather);
    this.cats.forEach((c, i) => {
      if (c.friendUntil > this.day) c.follow(dt, this.world, p, this.playerArea(), i % 2 ? 1 : -1);
      else c.update(dt, this.world);
    });
    this._achT = (this._achT || 0) - dt;
    if (this._achT <= 0) { this._achT = 1; this.checkAchievements(); }
    this.banterT -= dt;
    if (this.banterT <= 0) { this.banterT = 9 + Math.random() * 9; this._banter(); }
    for (const e of this.emotes) e.t -= dt;
    if (this.emotes.length) this.emotes = this.emotes.filter((e) => e.t > 0);
    this._bumpT -= dt;
    this._prowl(before);
    if (before < 18 * 60 && this.minutes >= 18 * 60 && this.omenTonight) { this.ui.toast(t('msg.omen'), 'warn'); Audio.play('gnome'); }
    if (before < 24 * 60 && this.minutes >= 24 * 60) this.ui.toast(t('msg.midnight'));
    if (before < 25 * 60 && this.minutes >= 25 * 60) this.ui.toast(t('msg.lateWarning'), 'warn');
    if (this.minutes >= DAY_END && !this.ui.cinematic) this.ui.eyes(t('cinematic.passOut'), () => this.sleep(true));
  }

  _blockedForPlayer(x, y) {
    if (this.world.isSolid(x, y)) return true;
    const portal = this.world.portalAt(x, y);
    if (portal && portal.kind === 'door' && doorLocked(portal.lock, this.day, this.minutes)) return true;
    const area = this.playerArea();
    // idle villagers are solid (Player._move ignores tiles we already overlap, so we can't get trapped)
    for (const n of this.npcs.values()) {
      if (!n.away && !n.moving && !n.hooded && n.area === area && n.tx === x && n.ty === y) return true;
    }
    return false;
  }

  _onBump(tile) {
    const portal = this.world.portalAt(tile.x, tile.y);
    if (portal && portal.kind === 'door' && this._bumpT <= 0 && doorLocked(portal.lock, this.day, this.minutes)) {
      this._bumpT = 2.5;
      this.ui.toast(t(`msg.locked_${portal.lock}`));
      Audio.play('error');
    }
  }

  _checkPortal() {
    const p = this.player;
    const portal = this.world.portalAt(p.tx, p.ty);
    if (!portal) return;
    if (portal.kind === 'door' && p.dir === 'up') {
      if (doorLocked(portal.lock, this.day, this.minutes)) return;
      p.placeAt(portal.to.x, portal.to.y, 'up');
    } else if (portal.kind === 'exit' && p.dir === 'down') {
      p.placeAt(portal.to.x, portal.to.y, 'down');
      this.tut('exit');
    } else return;
    Audio.play('door');
    this.renderer.snap(this);
    this.ui.flash();
  }

  // ------------------------------------------------------------ interaction resolution
  npcInFront() {
    const p = this.player, area = this.playerArea();
    const [dx, dy] = DIRS[p.dir];
    const fx = p.x + dx * 12, fy = p.y + dy * 12;
    let best = null, bestD = 13;
    for (const n of this.npcs.values()) {
      if (n.away || n.hooded || n.area !== area) continue;
      const d = Math.hypot(n.x - fx, n.y - fy);
      if (d < bestD) { best = n; bestD = d; }
    }
    return best;
  }

  benchAt(x, y) {
    return this.world.objects.find((o) => o.kind === 'bench' && !o.removed && x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h) || null;
  }

  // Sit on a bench: five hours pass and energy comes back in full.
  rest() {
    const H = 5 * 60;
    if (this.minutes + H > DAY_END - 30) { this.ui.toast(t('msg.restTooLate'), 'warn'); return; }
    this.ui.eyes(t('cinematic.rest'), () => {
      const before = this.minutes;
      this.minutes += H;
      this.energy = this.maxEnergy;
      for (const n of this.npcs.values()) n.snapToSchedule(this.world, this.minutes, this.weather);
      this._prowl(before);
      if (before < 18 * 60 && this.minutes >= 18 * 60 && this.omenTonight) this.ui.toast(t('msg.omen'), 'warn');
      this.tut('rest');
      this.ui.toast(t('msg.rested'));
    });
  }

  catInFront() {
    const p = this.player, area = this.playerArea();
    const [dx, dy] = DIRS[p.dir];
    const fx = p.x + dx * 12, fy = p.y + dy * 12;
    return this.cats.find((c) => (c.area || this.world.areaById.outdoor) === area && Math.hypot(c.x - fx, c.y - fy) < 12) || null;
  }

  petCat(cat) {
    const friend = cat.friendUntil > this.day;
    if (cat.pettedDay !== this.day) { cat.pettedDay = this.day; cat.pets = 0; }
    if (cat.pets >= (friend ? FISHING.catPets : 1)) { this.ui.toast(t('msg.catIgnores')); return; }
    cat.pets++;
    Progress.add('pets');
    if (!friend) cat.wait = Math.max(cat.wait, 3);
    this.energy = Math.min(this.maxEnergy, this.energy + 5);
    this.emote(cat, 'heart');
    Audio.play('heart');
    this.ui.toast(t('msg.petCat'));
  }

  // A fish turns a village cat into your companion for a couple of days.
  feedCat(cat, fishId) {
    if (!this.inv.remove(fishId, 1)) return;
    cat.friendUntil = this.day + 1; // follows you until you go to bed
    this.emote(cat, 'heart');
    Audio.play('charm');
    this.ui.toast(t('msg.catFriend'), 'clue');
  }

  // ------------------------------------------------------------ fishing
  // wait for a bite -> react to "!" -> stop the marker inside the green zone.
  startFishing(tile) {
    if (!this.inv.count('bait')) { this.ui.toast(t('msg.needBait'), 'warn'); Audio.play('error'); return; }
    if (!this._spend(FISHING.energy)) return;
    this.inv.remove('bait', 1);
    const [a, b] = FISHING.wait;
    this.fishing = { phase: 'wait', t: a + Math.random() * (b - a), tile };
    Audio.play('swish');
    this.ui.fishBar(this.fishing);
  }

  stopFishing(cancelled) {
    if (!this.fishing) return;
    this.fishing = null;
    this.ui.fishBar(null);
    if (cancelled) this.ui.toast(t('msg.fishCancel'));
  }

  _pickFish() {
    const night = this.minutes >= 18 * 60;
    const pool = FISH.filter((f) => !f.night || night).map((f) => [f, f.weight * (f.rain && this.weather === 'rain' ? 3 : 1)]);
    let r = Math.random() * pool.reduce((n, [, w]) => n + w, 0);
    for (const [f, w] of pool) { r -= w; if (r <= 0) return f; }
    return pool[0][0];
  }

  _fishUpdate(dt) {
    const F = this.fishing;
    if (F.phase === 'reel') {
      F.pos += F.dir * F.fish.speed * dt;
      if (F.pos > 1) { F.pos = 1; F.dir = -1; }
      if (F.pos < 0) { F.pos = 0; F.dir = 1; }
      F.t -= dt;
      if (F.t <= 0) { this.ui.toast(t('msg.fishEscaped')); Audio.play('error'); this.stopFishing(false); return; }
    } else {
      F.t -= dt;
      if (F.t <= 0) {
        if (F.phase === 'wait') { F.phase = 'bite'; F.t = FISHING.bite; this.emote(this.player, 'bang'); Audio.play('pickup'); }
        else { this.ui.toast(t('msg.fishEscaped')); Audio.play('error'); this.stopFishing(false); return; }
      }
    }
    this.ui.fishBar(F);
  }

  _fishInput() {
    const F = this.fishing;
    if (F.phase === 'wait') { this.ui.toast(t('msg.fishTooSoon')); this.stopFishing(false); return; }
    if (F.phase === 'bite') {
      const fish = this._pickFish();
      Object.assign(F, { phase: 'reel', fish, pos: 0, dir: 1, t: 4, zone: fish.zone, center: 0.25 + Math.random() * 0.5 });
      this.ui.fishBar(F);
      return;
    }
    if (Math.abs(F.pos - F.center) <= F.zone / 2) {
      if (!this.inv.canFit(F.fish.id)) { this.ui.toast(t('msg.invFull'), 'warn'); this.stopFishing(false); return; }
      this.inv.add(F.fish.id, 1);
      if (F.fish.junk) {
        Audio.play('error');
        this.ui.toast(t('msg.junkCaught', { item: t(`item.${F.fish.id}.name`) }));
      } else {
        this.stats.fish = (this.stats.fish || 0) + 1;
        Progress.add('fish');
        Audio.play('coin');
        this.ui.toast(t('msg.fishCaught', { item: t(`item.${F.fish.id}.name`) }), 'clue');
      }
    } else { this.ui.toast(t('msg.fishEscaped')); Audio.play('error'); }
    this.stopFishing(false);
  }

  // Villagers chatting among themselves: speech bubbles near the player.
  _banter() {
    const area = this.playerArea(), p = this.player;
    const near = [...this.npcs.values()].filter((n) => !n.away && !n.moving && !n.paused && !n.hooded && n.area === area && Math.hypot(n.x - p.x, n.y - p.y) < 150);
    if (!near.length) return;
    const a = near[Math.floor(Math.random() * near.length)];
    const partner = near.find((n) => n !== a && Math.hypot(n.x - a.x, n.y - a.y) < 90);
    let line;
    const m = this.mystery;
    if (m.attacks.length && !m.solved && Math.random() < 0.35) {
      // Gossip about a suspect: mostly noise, but the Gnomer is mentioned a bit more often.
      const cands = VILLAGERS.filter((v) => v.candidate && v.id !== a.id && !this.npcs.get(v.id).gnomed).map((v) => v.id);
      const who = cands.includes(m.gnomerId) && Math.random() < 0.35 ? m.gnomerId : cands[Math.floor(Math.random() * cands.length)];
      const pool = tList('banter.gossip');
      line = fmt(pool[Math.floor(Math.random() * pool.length)], { name: t(`npc.${who}.short`) });
    } else {
      const pool = tList(`npc.${a.id}.banter`);
      line = pool[Math.floor(Math.random() * pool.length)];
    }
    this.ui.bubble(a, line, 0);
    if (partner) { const r = tList('banter.replies'); this.ui.bubble(partner, r[Math.floor(Math.random() * r.length)], 2.6); }
  }

  // Single source of truth for "what does E do right now?" -> { label, run }
  resolveAction() {
    const none = { label: null, run: () => this._useItem(this.player.facingTile()) };
    const p = this.player, f = p.facingTile();
    const npc = this.npcInFront();
    if (npc) return { label: t('prompt.talk', { name: t(`npc.${npc.id}.short`) }), run: () => this.talkTo(npc) };
    const cat = this.catInFront();
    if (cat) {
      const held = this.inv.current;
      if (held && ITEMS[held.id].type === 'fish') return { label: t('prompt.feedCat'), run: () => this.feedCat(cat, held.id) };
      return { label: t('prompt.pet'), run: () => this.petCat(cat) };
    }
    const obj = this.world.objectAt(f.x, f.y);
    if (obj && !obj.removed) {
      if (obj.kind === 'gnome') return { label: t('prompt.statue'), run: () => this.ui.say(null, fmt(t('statue.look'), { name: t(`npc.${obj.victim}.short`) })) };
      if (obj.search) return { label: t('prompt.search', { thing: t(`things.${obj.kind}`) }), run: () => this.search(obj) };
      if (obj.interact) {
        const label = t(`prompt.${obj.interact}`);
        return { label, run: () => this.useObject(obj) };
      }
    }
    if (this.benchAt(f.x, f.y) || this.benchAt(p.tx, p.ty)) return { label: t('prompt.rest'), run: () => this.rest() };
    const sp = this.mystery.sparkleAt(f.x, f.y) || this.mystery.sparkleAt(p.tx, p.ty);
    if (sp && this.playerArea().outdoor) return { label: t('prompt.inspect'), run: () => this.inspect(sp) };
    const plot = this.farm.plot(f.x, f.y);
    if (this.farm.isMature(plot)) return { label: t('prompt.harvest', { crop: t(`crop.${plot.c}`) }), run: () => this.harvest(f.x, f.y) };
    const cur = this.inv.current;
    if (!cur) return none;
    const item = ITEMS[cur.id];
    let label = null;
    if (cur.id === 'hoe' && this.farm.canTill(f.x, f.y)) label = t('prompt.till');
    else if (cur.id === 'watering_can') {
      if (this._isWaterSource(f.x, f.y)) label = t('prompt.refill');
      else if (this.farm.canWater(f.x, f.y)) label = t('prompt.water');
    } else if (cur.id === 'fishing_rod' && this.world.tile(f.x, f.y) === T.WATER) label = t('prompt.fish');
    else if (cur.id === 'scythe' && this.farm.debrisAt(f.x, f.y)) label = t('prompt.clear', { debris: t(`debris.${this.farm.debrisAt(f.x, f.y)}`) });
    else if (item.type === 'seed' && this.farm.canPlant(f.x, f.y)) label = t('prompt.plant', { crop: t(`crop.${item.crop}`) });
    return { label, run: none.run };
  }

  _isWaterSource(x, y) {
    if (this.world.tile(x, y) === T.WATER) return true;
    const o = this.world.objectAt(x, y);
    return !!(o && o.interact === 'well');
  }

  _spend(cost) {
    if (this.energy < cost) { this.ui.toast(t('msg.tooTired'), 'warn'); Audio.play('error'); return false; }
    this.energy -= cost;
    return true;
  }

  _useItem(f) {
    const cur = this.inv.current;
    if (!cur) return;
    const id = cur.id, item = ITEMS[id];
    const farm = this.farm;
    if (id === 'hoe') {
      if (farm.canTill(f.x, f.y)) { if (this._spend(item.energy)) { farm.till(f.x, f.y); Audio.play('till'); this.tut('till'); } }
      else if (farm.debrisAt(f.x, f.y)) this.ui.toast(t('msg.clearFirst'));
      else if (!farm.isField(f.x, f.y)) this.ui.toast(t('msg.noTillHere'));
      return;
    }
    if (id === 'watering_can') {
      if (this._isWaterSource(f.x, f.y)) return this.refill();
      const plot = farm.plot(f.x, f.y);
      if (!plot) return;
      if (plot.w) { this.ui.toast(t('msg.alreadyWatered')); return; }
      if (this.water <= 0) { this.ui.toast(t('msg.canEmpty'), 'warn'); Audio.play('error'); return; }
      if (this._spend(item.energy)) { farm.water(f.x, f.y); this.water--; Audio.play('water'); this.tut('water'); }
      return;
    }
    if (id === 'fishing_rod') {
      if (this.world.tile(f.x, f.y) === T.WATER) this.startFishing(f);
      else this.ui.toast(t('msg.fishWhere'));
      return;
    }
    if (id === 'scythe') {
      const d = farm.debrisAt(f.x, f.y);
      if (d) { if (this._spend(DEBRIS[d].energy)) { farm.clearDebris(f.x, f.y); Audio.play('swish'); this.tut('clear'); } }
      else Audio.play('swish');
      return;
    }
    if (item.type === 'seed') {
      if (farm.canPlant(f.x, f.y)) { farm.plant(f.x, f.y, item.crop); this.inv.remove(id, 1); Audio.play('plant'); this.tut('plant'); }
      else if (!farm.plot(f.x, f.y) && farm.isField(f.x, f.y)) this.ui.toast(t('msg.needTilled'));
    }
  }

  refill() {
    const cap = ITEMS.watering_can.capacity;
    if (!this.inv.count('watering_can')) return;
    if (this.water >= cap) { this.ui.toast(t('msg.canFull')); return; }
    this.water = cap;
    Audio.play('water');
    this.ui.toast(t('msg.refilled'));
  }

  harvest(x, y) {
    const plot = this.farm.plot(x, y);
    const produce = CROPS[plot.c].produce;
    if (!this.inv.canFit(produce)) { this.ui.toast(t('msg.invFull'), 'warn'); Audio.play('error'); return; }
    this.farm.harvest(x, y);
    this.inv.add(produce, 1);
    this.stats.harvested++;
    this.stats.byCrop = this.stats.byCrop || {};
    this.stats.byCrop[produce] = (this.stats.byCrop[produce] || 0) + 1;
    Progress.add('harvested');
    Audio.play('pickup');
    this.ui.toast(t('msg.harvested', { item: t(`item.${produce}.name`) }));
  }

  useObject(obj) {
    switch (obj.interact) {
      case 'bed':
        this.ui.confirm(t('sleep.question'), t('sleep.yes'), t('sleep.no'), () => this.ui.eyes(t('cinematic.sleep'), () => this.sleep(false)));
        break;
      case 'bin': this.ui.openBin(this); break;
      case 'craft': this.ui.openCraft(this); break;
      case 'well': this.refill(); break;
      case 'board': this.ui.openBoard(this); break;
      case 'shop':
        if (!storeOpen(this.day, this.minutes)) { this.ui.toast(t('msg.shopClosed')); Audio.play('error'); }
        else this.ui.openShop(this);
        break;
      case 'accuse':
        if (this.mystery.solved) this.ui.say(null, t('accuse.solved'));
        else this.ui.openAccuse(this);
        break;
      case 'sign': this.ui.toast(t('msg.sign')); break;
      default: break;
    }
  }

  // ------------------------------------------------------------ villagers
  addFriendship(npc, delta) {
    const before = npc.hearts;
    npc.friendship = Math.max(0, Math.min(FRIENDSHIP.max, npc.friendship + delta));
    if (npc.hearts > before) Audio.play('heart');
  }

  emote(target, kind) { this.emotes.push({ x: target.x, y: target.y, kind, t: 1.2 }); }

  talkTo(npc) {
    const p = this.player;
    const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };
    npc.paused = true; npc.dir = opposite[p.dir];
    const first = npc.talkDay !== this.day;
    let text = null;
    this.tut('talk');
    if (first) {
      npc.talkDay = this.day;
      npc.talks++;
      this.addFriendship(npc, FRIENDSHIP.talk);
      text = reactionLine(npc, this);
      if (!text && this.flags.wonDay && this.day <= this.flags.wonDay + 2) {
        text = fmt(this.rng.pick(tList('talk.congrats')), { gnomer: t(`npc.${this.mystery.gnomerId}.name`) });
        this.emote(npc, 'heart');
      }
      const last = this.mystery.attacks[this.mystery.attacks.length - 1];
      if (last && last.blocked && last.victim === npc.id && !last.thanked && last.night === this.day - 1) {
        last.thanked = true;
        this.addFriendship(npc, FRIENDSHIP.saved);
        this.emote(npc, 'heart');
      }
    }
    this.mystery.lastTalked = npc.id;
    if (!text) text = pickLine(npc, this);
    this._chat(npc, text);
  }

  _chat(npc, text) {
    const choices = [{ label: t('talk.ask'), fn: () => this.askAbout(npc) }];
    const q = this.questFor(npc.id);
    if (q && this.inv.count(q.item) >= q.qty) choices.unshift({ label: t('quest.deliver', { qty: q.qty, item: t(`item.${q.item}.name`) }), fn: () => this.deliverQuest(npc) });
    if (this.giftables().length) choices.push({ label: t('talk.giveMenu'), fn: () => this._giftMenu(npc) });
    choices.push({ label: t('talk.bye'), fn: null });
    this.ui.dialogue([{ who: npc.id, text, choices }], () => { npc.paused = false; });
  }

  // Distinct items the player could hand over (gifts and charms), selected hotbar item first.
  giftables() {
    const ids = [];
    const cur = this.inv.current;
    const ok = (id) => ITEMS[id].gift || ITEMS[id].type === 'charm';
    if (cur && ok(cur.id)) ids.push(cur.id);
    for (const s of this.inv.slots) if (s && ok(s.id) && !ids.includes(s.id)) ids.push(s.id);
    return ids;
  }

  _giftMenu(npc) {
    const choices = this.giftables().slice(0, 8).map((id) => {
      const name = `${t(`item.${id}.name`)} (${this.inv.count(id)})`;
      return { label: ITEMS[id].type === 'charm' ? t('talk.giveCharm', { item: name }) : t('talk.give', { item: name }), fn: () => this.giveItem(npc, id) };
    });
    choices.push({ label: t('talk.never'), fn: null });
    this.ui.dialogue([{ who: npc.id, text: t('talk.whatGift'), choices }], () => { npc.paused = false; });
  }

  askAbout(npc) {
    const m = this.mystery;
    if (m.attacks.length) this.tut('ask');
    let text;
    if (!m.attacks.length) text = t('talk.noNews');
    else {
      const g = m.gossipFor(npc.id, this);
      if (g && !g.locked) {
        m.addFound(g.clue.id, this.day);
        text = t(`clue.${g.clue.id}.text`);
        this._clueToast(g.clue.id);
        this._gossipCache.clear();
      } else if (g && g.locked) text = t(`npc.${npc.id}.askLocked`);
      else text = this.rng.pick(tList(`npc.${npc.id}.ask`));
    }
    this.ui.dialogue([{ who: npc.id, text }], () => { npc.paused = false; });
  }

  giveItem(npc, id) {
    if (!id || !this.inv.count(id)) { npc.paused = false; return; }
    const item = ITEMS[id];
    let text;
    if (item.type === 'charm') {
      const had = this.mystery.protect[npc.id] || 0;
      this.inv.remove(id, 1);
      this.mystery.protect[npc.id] = had + item.charges;
      this.tut('charm');
      this.addFriendship(npc, FRIENDSHIP.charm);
      Audio.play('charm');
      this.emote(npc, 'heart');
      text = t(had ? 'talk.charmMore' : 'talk.charmThanks');
    } else {
      if (npc.giftDay === this.day) { this.ui.dialogue([{ who: npc.id, text: t('talk.giftTooMany') }], () => { npc.paused = false; }); return; }
      npc.giftDay = this.day;
      this.inv.remove(id, 1);
      const r = giftReaction(npc, id);
      this.addFriendship(npc, FRIENDSHIP[r]);
      if (r === 'loved') {
        const known = this.flags.knownLoves[npc.id] || (this.flags.knownLoves[npc.id] = []);
        if (!known.includes(id)) known.push(id);
      }
      this.emote(npc, r === 'disliked' ? 'sad' : 'heart');
      Audio.play(r === 'disliked' ? 'error' : 'heart');
      text = t(`npc.${npc.id}.gift.${r}`);
    }
    this.mystery.lastTalked = npc.id;
    this.ui.dialogue([{ who: npc.id, text }], () => { npc.paused = false; });
  }

  // Cached "this villager has something new to tell you" (drives the speech-bubble hint).
  gossipHint(npc) {
    const now = performance.now();
    if (now - this._gossipT > 500) { this._gossipCache.clear(); this._gossipT = now; }
    if (!this._gossipCache.has(npc.id)) {
      const g = this.mystery.attacks.length && this.mystery.diff.hints ? this.mystery.gossipFor(npc.id, this) : null;
      this._gossipCache.set(npc.id, !!(g && !g.locked));
    }
    return this._gossipCache.get(npc.id);
  }

  // ------------------------------------------------------------ mystery actions
  _clueToast(id) {
    Progress.add('clues');
    Audio.play('clue');
    this.ui.toast(t('msg.clueFound', { title: t(`clue.${id}.title`) }), 'clue');
  }

  inspect(sparkle) {
    this.tut('inspect');
    const clue = this.mystery.inspect(sparkle, this.day);
    this._clueToast(clue.id);
    this.ui.say(null, `${t(`clue.${clue.id}.title`)}\n${t(`clue.${clue.id}.text`)}`);
  }

  search(obj) {
    const area = this.world.areaById[obj.area];
    const owner = area.owner && this.npcs.get(area.owner);
    if (owner && !owner.gnomed && owner.area === area) {
      this.addFriendship(owner, FRIENDSHIP.caught);
      owner.dir = 'down';
      this.emote(owner, 'bang');
      Audio.play('caught');
      this.ui.dialogue([{ who: owner.id, text: t(`npc.${owner.id}.caught`) }, { who: null, text: t('search.caught', { name: t(`npc.${owner.id}.short`) }) }]);
      return;
    }
    const clue = this.mystery.search(obj.key, this.day, this);
    if (clue) {
      this.stats.snooped = (this.stats.snooped || 0) + 1;
      this._clueToast(clue.id);
      this.ui.say(null, `${t('search.found')}\n\n${t(`clue.${clue.id}.title`)}: ${t(`clue.${clue.id}.text`)}`);
      return;
    }
    if (!this.mystery.attacks.length) { this.ui.say(null, t('search.tooEarly')); return; }
    this.ui.say(null, this.rng.pick(tList(`search.nothing.${obj.kind}`)));
  }

  accuse(id) {
    const right = this.mystery.accuse(id);
    if (right) {
      Progress.add('wins'); Progress.caught(this.mystery.gnomerId);
      this.checkAchievements();
      for (const n of this.npcs.values()) n.gnomed = false;
      for (const o of this.world.objects) if (o.kind === 'gnome') this.world.removeObject(o);
      this.mystery.sparkles = [];
      for (const n of this.npcs.values()) n.snapToSchedule(this.world, this.minutes, this.weather);
      this.npcs.get(this.mystery.gnomerId).gone = true; // caught: they leave Mildew Hollow for good
      this.quests = this.quests.filter((q) => q.npc !== this.mystery.gnomerId);
      this.flags.wonDay = this.day;
      Platform.happytime();
      Audio.play('win');
      this.save();
      this.ui.showEnding('win', this);
    } else {
      Progress.add('losses');
      Audio.play('lose');
      Save.clear();
      this.ui.showEnding('wrong', this, id);
    }
  }

  // ------------------------------------------------------------ shop / bin / crafting
  buy(id) {
    const price = id === 'backpack' ? BACKPACK.price : ITEMS[id].price;
    if (this.money < price) { this.ui.toast(t('msg.cantAfford'), 'warn'); Audio.play('error'); return false; }
    if (id === 'backpack') {
      if (this.flags.backpack) return false;
      this.flags.backpack = true;
      this.inv.resize(BACKPACK.size);
    } else if (!this.inv.canFit(id, ITEMS[id].pack || 1)) { this.ui.toast(t('msg.invFull'), 'warn'); return false; }
    else this.inv.add(id, ITEMS[id].pack || 1);
    this.money -= price;
    Audio.play('coin');
    return true;
  }

  sellValue(id) { return ITEMS[id].sell || 0; }
  // Anything with a price (even 0, like junk) can be sold or shipped; tools can't.
  sellable(id) { return ITEMS[id].sell !== undefined && ITEMS[id].type !== 'tool'; }

  // Marigold's free welcome seeds: only as part of the tutorial (its "visit the store" step).
  claimStarter() {
    if (this.flags.starterGiven || this.tutPhase() !== 'farm' || this.flags.tutDone.includes('shop')) return false;
    this.flags.starterGiven = true;
    for (const [id, n] of STARTER_SEEDS) this.inv.add(id, n);
    Audio.play('pickup');
    return true;
  }

  sellSlot(i, all) {
    const s = this.inv.slots[i];
    if (!s || !this.sellable(s.id)) return;
    const taken = this.inv.removeAt(i, all ? s.qty : 1);
    const gold = this.sellValue(taken.id) * taken.qty;
    this.money += gold; this.stats.earned += gold;
    Audio.play('coin');
    this.ui.toast(t('msg.sold', { n: gold }));
  }

  shipSlot(i) {
    const s = this.inv.slots[i];
    if (!s || !this.sellable(s.id)) return;
    this.tut('ship');
    const taken = this.inv.removeAt(i, s.qty);
    const existing = this.bin.find((b) => b.id === taken.id);
    if (existing) existing.qty += taken.qty; else this.bin.push({ ...taken });
    Audio.play('pickup');
  }

  unship(idx) {
    const b = this.bin[idx];
    if (!b) return;
    const left = this.inv.add(b.id, b.qty);
    if (left) { b.qty = left; this.ui.toast(t('msg.invFull'), 'warn'); } else this.bin.splice(idx, 1);
  }

  binValue() { return this.bin.reduce((n, b) => n + this.sellValue(b.id) * b.qty, 0); }

  canCraft(r) { return Object.entries(r.need).every(([id, n]) => this.inv.count(id) >= n); }
  craft(r) {
    if (!this.canCraft(r)) return false;
    for (const [id, n] of Object.entries(r.need)) this.inv.remove(id, n);
    const left = this.inv.add(r.out, r.qty);
    if (left) { for (const [id, n] of Object.entries(r.need)) this.inv.add(id, n); this.ui.toast(t('msg.invFull'), 'warn'); return false; }
    Audio.play('charm');
    this.tut('craft');
    this.ui.toast(t('msg.crafted', { item: t(`item.${r.out}.name`) }));
    return true;
  }

  // ------------------------------------------------------------ night
  sleep(passedOut) {
    this.tut('sleep');
    const report = { day: this.day, shipped: this.bin.map((b) => ({ ...b, value: this.sellValue(b.id) * b.qty })), passedOut, penalty: 0 };
    const income = this.binValue();
    this.money += income; this.stats.earned += income;
    if (income) Progress.add('earned', income);
    Progress.add('days');
    this.bin = [];
    report.income = income;
    if (passedOut) { report.penalty = Math.min(150, Math.floor(this.money * 0.1)); this.money -= report.penalty; }

    const attack = this.mystery.night(this);
    if (attack && !attack.blocked) this._gnome(attack);
    report.attack = attack;
    report.scared = this.mystery.interrupted === this.day;

    this.farm.nightly();
    this.day++;
    this.minutes = DAY_START;
    const r = this.rng.next();
    this.weather = r < 0.2 ? 'rain' : r < 0.45 ? 'cloudy' : 'sunny';
    if (this.weather === 'rain') this.farm.rain();
    this.energy = passedOut ? Math.round(this.maxEnergy * 0.6) : this.maxEnergy;
    report.weather = this.weather;
    report.expired = [];
    for (const q of this.quests) if (q.due < this.day) { report.expired.push(q); this.addFriendship(this.npcs.get(q.npc), -10); }
    this.quests = this.quests.filter((q) => q.due >= this.day && !this.npcs.get(q.npc).away);
    report.quest = this._newQuest();
    this._wakeUp();
    this.input.clearHeld();

    const outcome = this.mystery.checkLoss(this.day);
    if (outcome) {
      Progress.add('losses');
      Save.clear();
      Audio.play('lose');
      this.ui.showEnding(outcome, this);
      return;
    }
    if (this.day > SEASON_DAYS && this.mystery.solved && !this.flags.seasonNote) { this.flags.seasonNote = true; report.seasonOver = true; }
    this.save();
    Audio.play(attack && !attack.blocked ? 'gnome' : 'sleep');
    this.ui.showMorning(report, this);
  }

  // Facts the HUD and notebook need.
  get victimCount() { return this.mystery.victims.length; }
  get daysLeft() { return Math.max(0, SEASON_DAYS - this.day); }
  get recipes() { return RECIPES; }
}

