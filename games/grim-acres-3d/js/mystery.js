// The Gnomer mystery: who it is, who gets gnomed, which clues exist and where.
// Everything is driven by js/data/killers.js; this module only applies the rules.
import { KILLERS, MYSTERY, DIFFICULTY } from './data/killers.js';
import { VILLAGERS } from './data/villagers.js';

// Flat index of every clue in the data: id -> { id, subject, kind, role, witness?, minHearts?, afterAttack? }
export const CLUES = {};
for (const [subject, k] of Object.entries(KILLERS)) {
  for (const c of k.clues) CLUES[c.id] = { ...c, subject, role: 'evidence' };
  for (const c of k.herrings) CLUES[c.id] = { ...c, subject, role: 'herring' };
  CLUES[k.alibi.id] = { ...k.alibi, kind: 'dialogue', subject, role: 'alibi' };
}
function patternId(rule) { return `pattern_${rule.type}${rule.stat ? '_' + rule.stat : ''}`; }
for (const k of Object.values(KILLERS)) {
  const id = patternId(k.rule);
  CLUES[id] = { id, subject: null, kind: 'dialogue', role: 'pattern', witness: 'tib', minHearts: 0, afterAttack: MYSTERY.patternAfter };
}

const byId = Object.fromEntries(VILLAGERS.map((v) => [v.id, v]));

export class Mystery {
  constructor() {
    this.gnomerId = null;
    this.nextAttack = 99;
    this.attacks = [];   // { night, victim, blocked, x, y }
    this.found = [];     // [{ id, day }]
    this.spawned = [];   // clue ids that have ever been placed as sparkles
    this.sparkles = [];  // { clue, x, y } not yet inspected
    this.snoop = {};     // searchable key -> clue id
    this.notes = {};     // villager id -> 'sus' | 'clear'
    this.protect = {};   // villager id -> charges
    this.news = [];      // { day, type, victim, n, place }
    this.lastTalked = null;
    this.solved = false;
    this.outcome = null; // null | 'win' | 'wrong' | 'overrun' | 'season'
    this.difficulty = 'normal';
    this.tonight = null;  // planned attack for the coming night (only exists late on attack nights)
    this.interrupted = 0; // night number when the player last scared the Gnomer off
  }

  get diff() { return DIFFICULTY[this.difficulty] || DIFFICULTY.normal; }
  get maxVictims() { return this.diff.maxVictims; }

  newGame(rng, world, difficulty = 'normal', exclude = null) {
    this.difficulty = DIFFICULTY[difficulty] ? difficulty : 'normal';
    const cands = VILLAGERS.filter((v) => v.candidate && v.id !== exclude).map((v) => v.id);
    this.gnomerId = rng.pick(cands);
    const fa = this.diff.firstAttack || MYSTERY.firstAttack;
    this.nextAttack = rng.int(fa[0], fa[1]);
    // Hide snoopable evidence: the Gnomer's real clues, plus innocent suspects' red herrings.
    for (const id of cands) {
      const k = KILLERS[id];
      const list = id === this.gnomerId ? k.clues.filter((c) => c.kind === 'snoop') : k.herrings.filter((c) => c.kind === 'snoop');
      const spots = rng.shuffle(Object.values(world.searchables).filter((o) => o.area === byId[id].home).map((o) => o.key));
      list.forEach((c, i) => { if (spots[i]) this.snoop[spots[i]] = c.id; });
    }
  }

  get rule() { return KILLERS[this.gnomerId].rule; }
  get victims() { return this.attacks.filter((a) => !a.blocked).map((a) => a.victim); }
  get attackCount() { return this.attacks.length; }
  isFound(id) { return this.found.some((f) => f.id === id); }

  // Is this clue part of the current game's story?
  isActive(clue) {
    if (clue.role === 'pattern') return clue.id === patternId(this.rule);
    if (clue.role === 'evidence') return clue.subject === this.gnomerId;
    return clue.subject !== this.gnomerId; // herrings + alibis belong to innocents
  }

  // Alibis and red herrings about someone who is already a gnome are pointless (a victim can't be
  // the Gnomer), so they are never handed out.
  isMoot(clue, game) {
    if (!clue.subject || clue.role === 'evidence') return false;
    const n = game.npcs.get(clue.subject);
    return !!(n && n.gnomed);
  }

  addFound(id, day) {
    if (!CLUES[id] || this.isFound(id)) return false;
    this.found.push({ id, day });
    return true;
  }

  // ---------- night attacks ----------
  pickVictim(game) {
    let alive = VILLAGERS.map((v) => v.id).filter((id) => id !== this.gnomerId && !game.npcs.get(id).gnomed);
    // Once foiled, the Gnomer knows that villager is charmed and picks someone else next time.
    const last = this.attacks[this.attacks.length - 1];
    if (last && last.blocked && alive.length > 1) alive = alive.filter((id) => id !== last.victim);
    if (!alive.length) return null;
    const rule = this.rule;
    const jitter = () => game.rng.next() * 0.001; // random tie-break
    let score;
    switch (rule.type) {
      case 'max_friendship': score = (id) => game.npcs.get(id).friendship; break;
      case 'max_stat': score = (id) => byId[id].stats[rule.stat]; break;
      case 'nearest_home': {
        const home = (id) => game.world.areaById[byId[id].home].door;
        const me = home(this.gnomerId);
        score = (id) => { const d = home(id); return -(Math.abs(d.x - me.x) + Math.abs(d.y - me.y)); };
        break;
      }
      case 'last_talked':
      default:
        if (this.lastTalked && alive.includes(this.lastTalked)) return this.lastTalked;
        score = (id) => game.npcs.get(id).talks;
    }
    let best = null, bestScore = -Infinity;
    for (const id of alive) {
      const s = score(id) + jitter();
      if (s > bestScore) { bestScore = s; best = id; }
    }
    return best;
  }

  // Decide tonight's victim and where it will happen (also used for the Gnomer's night prowl).
  planTonight(game) {
    if (this.tonight || this.solved || this.outcome || game.day < this.nextAttack) return this.tonight;
    const victim = this.pickVictim(game);
    if (!victim) return null;
    const world = game.world;
    const locId = game.npcs.get(victim).lastSeenLocation(game.weather);
    const loc = (locId && world.locations[locId]) || { ...world.areaById[byId[victim].home].door };
    if (!locId) loc.y += 1;
    const spot = world.findOpenTile(loc.x, loc.y, this._occupied(world));
    this.tonight = { night: game.day, victim, x: spot.x, y: spot.y, place: locId || 'home', interrupted: false };
    return this.tonight;
  }

  // Runs while the player sleeps. Returns the attack record, or null if the Gnomer rested.
  night(game) {
    if (this.solved || this.outcome) { this.tonight = null; return null; }
    const night = game.day;
    if (night < this.nextAttack) { this.tonight = null; return null; }
    const plan = this.tonight && this.tonight.night === night ? this.tonight : this.planTonight(game);
    this.tonight = null;
    if (!plan) return null;
    if (plan.interrupted) { // scared off by the player: try again tomorrow night
      this.interrupted = night;
      this.nextAttack = night + 1;
      return null;
    }
    const k = KILLERS[this.gnomerId];
    this.nextAttack = night + game.rng.int(k.interval[0], k.interval[1]) + this.diff.intervalAdd;
    const { victim } = plan;
    const blocked = (this.protect[victim] || 0) > 0;
    if (blocked) this.protect[victim]--;
    const attack = { night, victim, blocked, x: plan.x, y: plan.y, place: plan.place };
    this.attacks.push(attack);
    this._spawnScene(attack, game);
    const pool = blocked ? 'foiled' : 'gnomed';
    this.news.push({ day: night + 1, type: pool, victim, n: game.rng.int(0, 99), place: attack.place });
    return attack;
  }

  // The player caught the Gnomer on the prowl: the attack is off and they glimpsed something.
  interrupt(day) {
    if (!this.tonight || this.tonight.interrupted) return null;
    this.tonight.interrupted = true;
    const seen = KILLERS[this.gnomerId].clues.find((c) => c.kind === 'sighting');
    if (seen && !this.isFound(seen.id)) { this.addFound(seen.id, day); return CLUES[seen.id]; }
    return null;
  }

  _occupied(world) {
    const s = new Set();
    for (const a of this.attacks) if (!a.blocked) s.add(world.idx(a.x, a.y));
    for (const sp of this.sparkles) s.add(world.idx(sp.x, sp.y));
    return s;
  }

  _spawnScene(attack, game) {
    const k = KILLERS[this.gnomerId];
    const rng = game.rng;
    const want = [];
    const nextScene = k.clues.find((c) => c.kind === 'scene' && !this.spawned.includes(c.id));
    if (nextScene) want.push(nextScene.id);
    const near = k.clues.find((c) => c.kind === 'nearmiss');
    // A blocked attack always drops the near-miss clue. As a solvability safety net it also appears
    // once the scene clues run out, or if the player is still short of evidence by the 3rd attack.
    const evidenceKnown = Object.values(CLUES).filter((c) => this.isActive(c) && c.role === 'evidence' && (this.isFound(c.id) || this.spawned.includes(c.id))).length;
    if (near && !this.spawned.includes(near.id) && (attack.blocked || !nextScene || (this.attacks.length >= 3 && evidenceKnown < 4))) want.push(near.id);
    if (rng.chance(this.diff.herringChance)) {
      const herrings = Object.values(CLUES).filter((c) => c.role === 'herring' && c.kind === 'scene' && this.isActive(c) && !this.isMoot(c, game) && !this.spawned.includes(c.id));
      if (herrings.length) want.push(rng.pick(herrings).id);
    }
    const occupied = this._occupied(game.world);
    occupied.add(game.world.idx(attack.x, attack.y));
    for (const id of want) {
      const p = this._sparkleSpot(game.world, attack.x, attack.y, occupied, rng);
      occupied.add(game.world.idx(p.x, p.y));
      this.sparkles.push({ clue: id, x: p.x, y: p.y });
      this.spawned.push(id);
    }
  }

  _sparkleSpot(world, x, y, occupied, rng) {
    const opts = [];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const tx = x + dx, ty = y + dy;
      if ((dx || dy) && !world.isSolid(tx, ty) && !world.portalAt(tx, ty) && !occupied.has(world.idx(tx, ty))) {
        const a = world.areaAt(tx, ty);
        if (a && a.outdoor) opts.push({ x: tx, y: ty });
      }
    }
    return opts.length ? rng.pick(opts) : { x, y: y + 1 };
  }

  sparkleAt(x, y) { return this.sparkles.find((s) => s.x === x && s.y === y) || null; }

  inspect(sparkle, day) {
    this.sparkles = this.sparkles.filter((s) => s !== sparkle);
    this.addFound(sparkle.clue, day);
    return CLUES[sparkle.clue];
  }

  // ---------- snooping ----------
  search(key, day, game) {
    if (this.attacks.length < 1) return null; // nothing incriminating until the story starts
    const id = this.snoop[key];
    if (!id || this.isFound(id) || (game && this.isMoot(CLUES[id], game))) return null;
    this.addFound(id, day);
    return CLUES[id];
  }

  // ---------- gossip ----------
  witnessFor(clue, game) {
    const ok = (w) => {
      const n = w && game.npcs.get(w);
      return n && !n.gnomed && w !== this.gnomerId && w !== clue.subject;
    };
    if (ok(clue.witness)) return clue.witness;
    return MYSTERY.patternWitnesses.find(ok) || null;
  }

  // What this villager could tell you right now: { clue, locked } or null.
  gossipFor(villagerId, game) {
    if (this.solved) return null;
    let lockedClue = null;
    for (const c of Object.values(CLUES)) {
      if (c.kind !== 'dialogue' || !this.isActive(c) || this.isFound(c.id) || this.isMoot(c, game)) continue;
      if (this.attacks.length < (c.afterAttack || 0)) continue;
      if (this.witnessFor(c, game) !== villagerId) continue;
      if (game.npcs.get(villagerId).hearts < Math.max(0, (c.minHearts || 0) + this.diff.heartsAdd)) { lockedClue = lockedClue || c; continue; }
      return { clue: c, locked: false };
    }
    return lockedClue ? { clue: lockedClue, locked: true } : null;
  }

  // ---------- endings ----------
  accuse(id) {
    if (id === this.gnomerId) { this.solved = true; this.outcome = 'win'; return true; }
    this.outcome = 'wrong';
    return false;
  }

  checkLoss(day) {
    if (this.solved || this.outcome) return this.outcome;
    if (this.victims.length >= this.maxVictims) this.outcome = 'overrun';
    else if (day > MYSTERY.seasonDays) this.outcome = 'season';
    return this.outcome;
  }

  toJSON() {
    return {
      g: this.gnomerId, next: this.nextAttack, attacks: this.attacks, found: this.found, spawned: this.spawned,
      sparkles: this.sparkles, snoop: this.snoop, notes: this.notes, protect: this.protect, news: this.news,
      last: this.lastTalked, solved: this.solved, outcome: this.outcome, diff: this.difficulty, intr: this.interrupted,
    };
  }

  static fromJSON(o) {
    const m = new Mystery();
    m.gnomerId = KILLERS[o.g] ? o.g : Object.keys(KILLERS)[0];
    m.nextAttack = o.next; m.attacks = o.attacks || []; m.found = o.found || []; m.spawned = o.spawned || [];
    m.sparkles = o.sparkles || []; m.snoop = o.snoop || {}; m.notes = o.notes || {}; m.protect = o.protect || {};
    m.news = o.news || []; m.lastTalked = o.last || null; m.solved = !!o.solved; m.outcome = o.outcome || null;
    m.difficulty = DIFFICULTY[o.diff] ? o.diff : 'normal'; m.interrupted = o.intr || 0;
    return m;
  }
}
