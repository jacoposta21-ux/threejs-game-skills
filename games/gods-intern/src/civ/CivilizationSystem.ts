import { CONFIG } from '../core/Config';
import type { Caravan, Religion, ResourceKind, VillageData, VillagerData } from '../core/types';
import { conversionWeight, has } from '../culture/Personality';
import type { Simulation } from '../simulation/SimulationManager';
import { relationKey } from '../world/Settlements';
import { changeRelation, ensureRelations, FAITH_MULT, relationCategory, TRADE_MULT } from './Relations';

export const RESOURCES: ResourceKind[] = ['food', 'water', 'wood', 'stone'];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Hard cap for each stock. Food/water/wood keep their v0.1 limits; stone is new. */
export function maxStock(r: ResourceKind): number {
  if (r === 'food') return CONFIG.village.maxFood;
  if (r === 'water') return CONFIG.village.maxWater;
  if (r === 'wood') return CONFIG.village.maxWood;
  return CONFIG.civ.maxStock.stone;
}

export function stockOf(v: VillageData, r: ResourceKind): number {
  return v[r];
}

function addStock(v: VillageData, r: ResourceKind, amount: number): number {
  const before = v[r];
  v[r] = Math.max(0, Math.min(maxStock(r), before + amount));
  return v[r] - before;
}

export function surplusOf(v: VillageData, r: ResourceKind): number {
  return v[r] - CONFIG.civ.comfort[r] * 1.3;
}

export function needOf(v: VillageData, r: ResourceKind): number {
  return CONFIG.civ.comfort[r] - v[r];
}

/** Absurd but honest commentary: every line names the real amounts that changed hands. */
const TRADE_QUIPS: Record<ResourceKind, string[]> = {
  food: ['THE TURNIPS WERE DESCRIBED AS "EMOTIONALLY RIPE".', 'THREE OF THEM WERE POTATOES IN DISGUISE.', 'NO REFUNDS ON CABBAGE.'],
  water: ['THE WATER WAS LABELLED "ARTISANAL".', 'IT WAS RAIN. THEY CHARGED FOR RAIN.', 'SOME OF IT WAS STILL WET.'],
  wood: ['EVERY LOG CAME WITH A NAME.', 'THE PLANKS ARE "PRE-SPLINTERED FOR CONVENIENCE".', 'ONE LOG IS NOW A CITIZEN.'],
  stone: ['THE ROCKS WERE CALLED "PREMIUM".', 'ONE STONE IS RUMOURED TO BE SACRED. IT IS NOT.', 'ROCKBOTTOM INSISTS EACH ROCK IS HAND-PICKED.'],
};

const COMPLAINTS: Record<string, string> = {
  v1: 'PUDDLETON DEMANDS EQUAL OPPORTUNITY MIRACLES.',
  v2: 'DRIZZLEVILLE HAS FILED A FORMAL COMPLAINT AGAINST HEAVEN.',
  v3: 'ROCKBOTTOM BELIEVES GOD HAS A FAVORITE CHILD.',
};

const SARCASM = [
  '{a} SAYS {b} BUILDS SHRINES "FOR TOURISTS".',
  '{a} HAS RENAMED ITS COMPOST HEAP "{b}".',
  '{a} CLAIMS {b}\'S GOD IS THE SAME GOD BUT WORSE.',
  '{a} SENT {b} A FRUIT BASKET. IT WAS EMPTY. ON PURPOSE.',
];

const PROPAGANDA = [
  '{a} PROPAGANDA: "{b} WORSHIPS PUDDLES".',
  '{a} HAS BANNED THE WORD "{b}" FROM POLITE CONVERSATION.',
  '{a} POSTERS NOW SHOW {b} AS A SMALL ANGRY CLOUD.',
];

export type FavorKind = 'rain' | 'tree' | 'rescue' | 'prayer-answered' | 'prayer-ignored' | 'lightning' | 'fire' | 'flood' | 'destroyed' | 'smiting' | 'aid';

/**
 * v0.3 civilization layer: relationships between villages, divine favor and
 * favoritism, trade caravans, migration, visits, pilgrimages and religious
 * spread. Pure simulation — no DOM, no Three.js. Uses the shared seeded RNG.
 *
 * Resource conservation (trade): cargo leaves the origin's stock when a caravan
 * departs and is added to the destination's stock on arrival. Payment leaves the
 * destination at the exchange and enters the origin's stock when the last
 * merchant returns. If a caravan fails (merchants die, no route, timeout) the
 * goods it is carrying go back to their owner: undelivered cargo to the origin,
 * already-collected payment to the origin. Amounts are clipped against room at
 * departure, so nothing is created or destroyed in normal play; if a stock fills
 * up while the caravan travels, the undeliverable remainder stays on the cart and
 * is refunded to the origin.
 */
export class CivilizationSystem {
  private tradeTimer = 8;
  private migrationTimer = 20;
  private diploTimer = 2;
  private favorTimer = 3;
  private visitTimer = 25;
  private pilgrimTimer = 30;
  private rivalTimer = 40;
  private cameraDwell = new Map<string, number>();
  private festivalLock = false;

  constructor(private readonly sim: Simulation) {
    ensureRelations(sim.state);
    const bus = sim.bus;
    const near = (x: number, z: number, extra = 14): VillageData | null => {
      const { village, distance } = sim.nearestVillage(x, z);
      return village && distance < village.radius + extra ? village : null;
    };
    bus.on('RAIN_STARTED', (e) => {
      const v = near(e.x, e.z, e.radius + 6);
      if (v) this.favor(v.id, v.water < 60 || v.food < 50 ? 6 : 2, 'rain');
    });
    bus.on('FLOOD_STARTED', (e) => {
      if (sim.recentCount('player-rain', 90) > 0) this.favor(e.villageId, -8, 'flood');
    });
    bus.on('POWER_USED', (e) => {
      if (e.power === 'rain') sim.remember('player-rain');
    });
    bus.on('TREE_PLANTED', (e) => {
      if (!e.byPlayer) return;
      const v = near(e.x, e.z, 20);
      if (v) this.favor(v.id, 1.5, 'tree');
    });
    bus.on('FIRE_EXTINGUISHED', (e) => {
      if (!e.byRain) return;
      const v = near(e.x, e.z, 12);
      if (v) this.favor(v.id, 4, 'rescue');
    });
    bus.on('PRAYER_COMPLETED', ({ prayer }) => this.favor(prayer.villageId, 10, 'prayer-answered'));
    bus.on('PRAYER_FAILED', ({ prayer }) => this.favor(prayer.villageId, -6, 'prayer-ignored'));
    bus.on('LIGHTNING_STRUCK', (e) => {
      if (!e.villageId || e.distanceToVillage > 25) return;
      this.favor(e.villageId, e.villagersKilled > 0 ? -10 : e.buildingsHit > 0 ? -8 : -4, e.villagersKilled > 0 ? 'smiting' : 'lightning');
    });
    bus.on('FIRE_STARTED', (e) => {
      if (!e.byPlayer) return;
      const v = near(e.x, e.z, 8);
      if (v) this.favor(v.id, -4, 'fire');
    });
    bus.on('BUILDING_DESTROYED', (e) => this.favor(e.villageId, -8, 'destroyed'));
    bus.on('VILLAGERS_CELEBRATE', (e) => this.rivalFestival(e.villageId, e.reason));
    bus.on('VILLAGER_DIED', (e) => this.onDeath(e.villagerId));
    bus.on('RELATIONSHIP_CHANGED', (e) => this.onRelationChange(e.a, e.b, e.to, e.from));
    this.recordFoundings();
  }

  /** Called after a save is loaded into the running simulation. */
  onStateReplaced(): void {
    ensureRelations(this.sim.state);
    this.recordFoundings();
    this.cameraDwell.clear();
  }

  /** Founding entries for the Civilization chapter (once per village, deterministic). */
  private recordFoundings(): void {
    const s = this.sim.state;
    const lines: Record<string, string> = {
      v1: 'Farmers settled by the lake and named the village after its most common feature.',
      v2: 'River folk built on stilts and immediately started charging for water.',
      v3: 'Miners settled under the mountain. They describe the view as "rock".',
    };
    for (const v of s.villages) {
      if (s.history.some((h) => h.kind === 'founding' && h.villageId === v.id)) continue;
      s.history.unshift({ id: `h${s.nextId++}`, day: 1, time: 0, title: `${v.name} Was Founded`, text: lines[v.id] ?? 'A new village appeared.', villageId: v.id, kind: 'founding', x: v.centerX, z: v.centerZ });
    }
    while (s.history.length > CONFIG.culture.maxHistory) s.history.shift();
  }

  /** Category changes: history for first alliance/rivalry and a notification for every transition. */
  private onRelationChange(a: string, b: string, to: string, from: string): void {
    const sim = this.sim;
    const va = sim.village(a);
    const vb = sim.village(b);
    if (!va || !vb) return;
    const up = ['hostile', 'rival', 'neutral', 'friendly', 'allied'].indexOf(to) > ['hostile', 'rival', 'neutral', 'friendly', 'allied'].indexOf(from);
    const label = to.charAt(0).toUpperCase() + to.slice(1);
    sim.notify(`${va.name.toUpperCase()} AND ${vb.name.toUpperCase()}: ${label.toUpperCase()}`, up ? 'good' : 'bad', up ? 'Relations improved.' : 'Relations soured.', 1);
    const mx = (va.centerX + vb.centerX) / 2;
    const mz = (va.centerZ + vb.centerZ) / 2;
    if (to === 'allied' && !sim.state.history.some((h) => h.kind === 'diplomacy' && h.title.startsWith('Alliance'))) {
      sim.history.add(`Alliance of ${va.name} and ${vb.name}`, 'They swore eternal friendship over a shared sandwich.', { kind: 'diplomacy', villageId: a, x: mx, z: mz });
    }
    if ((to === 'rival' || to === 'hostile') && !sim.state.history.some((h) => h.kind === 'diplomacy' && h.title.startsWith('Rivalry'))) {
      sim.history.add(`Rivalry: ${va.name} vs ${vb.name}`, 'It started with a disagreement about rocks. It is now about everything.', { kind: 'diplomacy', villageId: a, x: mx, z: mz });
    }
  }

  // ======================================================================
  // update
  // ======================================================================

  update(dt: number): void {
    const s = this.sim.state;
    this.checkCaravans();
    if (!s.tutorial.done) return;
    if ((this.diploTimer -= dt) <= 0) {
      this.diploTimer = CONFIG.civ.diplomacyInterval;
      this.diplomacy();
    }
    if ((this.favorTimer -= dt) <= 0) {
      this.favorTimer = 5;
      this.favoritism();
    }
    if ((this.tradeTimer -= dt) <= 0) {
      this.tradeTimer = CONFIG.civ.tradeInterval;
      this.planTrade();
    }
    if ((this.migrationTimer -= dt) <= 0) {
      this.migrationTimer = CONFIG.civ.migrationInterval;
      this.considerMigration();
    }
    if ((this.visitTimer -= dt) <= 0) {
      this.visitTimer = 38 + this.sim.rng.next() * 12;
      this.planVisit();
    }
    if ((this.pilgrimTimer -= dt) <= 0) {
      this.pilgrimTimer = CONFIG.civ.pilgrimageInterval;
      this.planPilgrimage();
    }
    if ((this.rivalTimer -= dt) <= 0) {
      this.rivalTimer = 45 + this.sim.rng.next() * 20;
      this.rivalBehaviour();
    }
  }

  // ======================================================================
  // divine favor
  // ======================================================================

  /** Record a divine intervention for a village. Positive and negative are tracked separately. */
  favor(villageId: string, amount: number, kind: FavorKind | string): void {
    const sim = this.sim;
    const v = sim.village(villageId);
    if (!v || !amount) return;
    const civ = sim.state.civ;
    civ.favorEvents.push({ t: sim.state.time, villageId, amount, kind });
    const cutoff = sim.state.time - CONFIG.civ.favorWindow * 2;
    while (civ.favorEvents.length && (civ.favorEvents[0].t < cutoff || civ.favorEvents.length > 240)) civ.favorEvents.shift();
    v.identity.divineFavor = Math.max(-100, Math.min(100, v.identity.divineFavor + amount));
    sim.bus.emit('DIVINE_FAVOR_CHANGED', { villageId, amount, kind, total: v.identity.divineFavor });
    // Harm done in front of a favoured neighbour breeds resentment between them.
    if (amount < 0) {
      const fav = this.mostFavored();
      if (fav && fav !== villageId) changeRelation(sim, villageId, fav, -1, 'envy');
    }
  }

  /** Sum of positive (or negative) interventions within the rolling window. */
  favorSum(villageId: string, sign: 1 | -1, window: number = CONFIG.civ.favorWindow, since?: number): number {
    const from = since ?? this.sim.state.time - window;
    let sum = 0;
    for (const e of this.sim.state.civ.favorEvents) {
      if (e.villageId !== villageId || e.t < from) continue;
      if (sign > 0 && e.amount > 0) sum += e.amount;
      if (sign < 0 && e.amount < 0) sum += e.amount;
    }
    return sum;
  }

  private mostFavored(): string | null {
    let best: string | null = null;
    let bestV = 0;
    for (const v of this.sim.state.villages) {
      const p = this.favorSum(v.id, 1);
      if (p > bestV) {
        bestV = p;
        best = v.id;
      }
    }
    return best;
  }

  /** Rolling-window favoritism detection with real consequences. */
  favoritism(): void {
    const sim = this.sim;
    const s = sim.state;
    const civ = s.civ;
    const villages = s.villages.filter((v) => v.population > 0);
    if (villages.length < 2 || s.time - civ.lastFavoritismAt < CONFIG.civ.favoritismCooldown) return;
    const pos = villages.map((v) => ({ v, p: this.favorSum(v.id, 1), n: this.favorSum(v.id, -1) }));
    pos.sort((a, b) => b.p - a.p);
    const top = pos[0];
    const bottom = pos[pos.length - 1];
    const gap = top.p - bottom.p;
    if (gap >= CONFIG.civ.favoritismGap) {
      civ.lastFavoritismAt = s.time;
      const jealous = bottom.v;
      for (const p of s.villagers) if (p.alive && p.villageId === jealous.id) p.happiness = clamp01(p.happiness - 0.06);
      changeRelation(sim, top.v.id, jealous.id, -5, 'favoritism');
      sim.notify(COMPLAINTS[jealous.id] ?? `${jealous.name.toUpperCase()} FEELS LEFT OUT.`, 'bad', `${top.v.name} received ${Math.round(top.p)} favor in five minutes; ${jealous.name} got ${Math.round(bottom.p)}.`, 2);
      sim.missions.create('EQUAL_TREATMENT', jealous, true);
      // Rival monument race: the jealous village pours effort into its own sacred site.
      const sacred = s.sacred.filter((x) => sim.sacredSys.ownerVillage(x)?.id === jealous.id).sort((a, b) => b.sacredness - a.sacredness)[0];
      if (sacred) sim.sacredSys.addSacredness(sacred, 0.8);
      sim.history.add(`${jealous.name} Felt Overlooked`, `${top.v.name} kept getting miracles. ${jealous.name} noticed. Everyone noticed.`, { kind: 'diplomacy', villageId: jealous.id, x: jealous.centerX, z: jealous.centerZ });
      sim.bus.emit('FAVORITISM', { favoredId: top.v.id, jealousId: jealous.id, kind: 'jealousy', gap });
      return;
    }
    // Resentment: one village receives a disproportionate share of the harm.
    pos.sort((a, b) => a.n - b.n);
    const victim = pos[0];
    const others = pos.slice(1);
    if (victim.n <= -CONFIG.civ.favoritismGap && others.every((o) => o.n > victim.n * 0.35)) {
      civ.lastFavoritismAt = s.time;
      for (const p of s.villagers) {
        if (!p.alive || p.villageId !== victim.v.id) continue;
        p.faith = clamp01(p.faith - 0.05);
        p.fear = clamp01(p.fear + 0.08);
      }
      sim.notify(`${victim.v.name.toUpperCase()} SUSPECTS IT IS BEING PERSONALLY TARGETED.`, 'bad', `${Math.round(-victim.n)} points of divine harm in five minutes. Faith is dropping.`, 2);
      sim.bus.emit('FAVORITISM', { favoredId: others[0]?.v.id ?? victim.v.id, jealousId: victim.v.id, kind: 'resentment', gap: -victim.n });
    }
  }

  // ======================================================================
  // diplomacy
  // ======================================================================

  /** Dominant religion per village (≥30% of the population), recomputed each diplomacy tick. */
  refreshDominantReligions(): void {
    const s = this.sim.state;
    for (const village of s.villages) {
      const counts = new Map<string, number>();
      let pop = 0;
      for (const v of s.villagers) {
        if (!v.alive || v.villageId !== village.id) continue;
        pop++;
        if (v.religionId) counts.set(v.religionId, (counts.get(v.religionId) ?? 0) + 1);
      }
      let best: string | undefined;
      let bestN = 0;
      for (const [id, n] of counts) if (n > bestN) [best, bestN] = [id, n];
      village.identity.dominantReligionId = best && bestN >= Math.max(1, pop * 0.3) ? best : undefined;
    }
  }

  /** Structural target score: shared faith, trade, culture and how evenly the god treats them. */
  relationTarget(a: VillageData, b: VillageData): number {
    const sim = this.sim;
    const key = relationKey(a.id, b.id);
    let t = (a.identity.openness + b.identity.openness - 1) * 10;
    const ra = a.identity.dominantReligionId;
    const rb = b.identity.dominantReligionId;
    if (ra && rb) t += ra === rb ? 25 : -18;
    t += Math.min(30, sim.recentCount(`trade:${key}`, 600) * 8);
    t += Math.min(20, sim.recentCount(`aid:${key}`, 600) * 10);
    t -= Math.min(25, Math.abs(this.favorSum(a.id, 1) - this.favorSum(b.id, 1)) * 0.3);
    t -= Math.min(15, (sim.state.civ.rivalries[key] ?? 0) * 3);
    return t;
  }

  diplomacy(): void {
    const sim = this.sim;
    this.refreshDominantReligions();
    const vs = sim.state.villages;
    for (let i = 0; i < vs.length; i++) {
      for (let j = i + 1; j < vs.length; j++) {
        const rec = sim.state.civ.relations[relationKey(vs[i].id, vs[j].id)];
        if (!rec) continue;
        const target = this.relationTarget(vs[i], vs[j]);
        const drift = Math.max(-CONFIG.civ.relationDrift, Math.min(CONFIG.civ.relationDrift, (target - rec.score) * 0.04));
        if (Math.abs(drift) > 0.01) changeRelation(sim, vs[i].id, vs[j].id, drift, drift > 0 ? 'goodwill' : 'friction');
      }
    }
    // Rivalries cool down slowly.
    for (const k of Object.keys(sim.state.civ.rivalries)) {
      sim.state.civ.rivalries[k] = Math.max(0, sim.state.civ.rivalries[k] - 0.02);
    }
  }

  /** Theological arguments between villagers of different villages and faiths sour relations. */
  onArgument(a: VillagerData, b: VillagerData): void {
    if (a.villageId === b.villageId || !a.religionId || !b.religionId || a.religionId === b.religionId) return;
    const key = relationKey(a.villageId, b.villageId);
    const civ = this.sim.state.civ;
    civ.rivalries[key] = (civ.rivalries[key] ?? 0) + 1;
    changeRelation(this.sim, a.villageId, b.villageId, -2, 'theology');
  }

  /** Allied villages hold joint parties; rivals throw louder ones out of spite. */
  private rivalFestival(villageId: string, reason: string): void {
    if (this.festivalLock || reason === 'rival-festival' || reason === 'joint-festival') return;
    const sim = this.sim;
    if (!sim.state.tutorial.done || sim.recentCount('rival-festival', 90) > 0) return;
    const origin = sim.village(villageId);
    for (const other of sim.state.villages) {
      if (other.id === villageId || !origin) continue;
      const cat = relationCategory(sim.state, villageId, other.id);
      if (cat !== 'rival' && cat !== 'allied') continue;
      if (sim.rng.next() > 0.5) continue;
      sim.remember('rival-festival');
      this.festivalLock = true;
      sim.ai.celebrate(sim, other, cat === 'rival' ? 'rival-festival' : 'joint-festival');
      this.festivalLock = false;
      if (cat === 'rival') sim.notify(`${other.name.toUpperCase()} IS HOLDING A LOUDER FESTIVAL OUT OF SPITE.`, 'culture', `${origin.name} celebrated first. ${other.name} will not allow that.`, 0);
      else sim.notify(`${other.name.toUpperCase()} JOINS THE PARTY.`, 'good', `Allies of ${origin.name} celebrate too. Nobody knows why.`, 0);
      return;
    }
  }

  /** Periodic behaviour driven by relationship category. */
  rivalBehaviour(): void {
    const sim = this.sim;
    const vs = sim.state.villages.filter((v) => v.population > 0);
    for (let i = 0; i < vs.length; i++) {
      for (let j = i + 1; j < vs.length; j++) {
        const [a, b] = sim.rng.next() < 0.5 ? [vs[i], vs[j]] : [vs[j], vs[i]];
        const cat = relationCategory(sim.state, a.id, b.id);
        const fill = (t: string) => t.replace('{a}', a.name.toUpperCase()).replace('{b}', b.name.toUpperCase());
        if (cat === 'rival' && sim.rng.next() < 0.5) {
          sim.notify(fill(SARCASM[Math.floor(sim.rng.next() * SARCASM.length)]), 'culture', `${a.name} and ${b.name} are rivals. Their shrines are now a competition.`, 0);
          // Competing monuments: each pushes its own sacred site a little harder.
          for (const village of [a, b]) {
            const sacred = sim.state.sacred.filter((x) => sim.sacredSys.ownerVillage(x)?.id === village.id).sort((x, y) => y.sacredness - x.sacredness)[0];
            if (sacred) sim.sacredSys.addSacredness(sacred, 0.4);
          }
          return;
        }
        if (cat === 'hostile' && sim.rng.next() < 0.6) {
          sim.notify(fill(PROPAGANDA[Math.floor(sim.rng.next() * PROPAGANDA.length)]), 'bad', 'Trade and visits between them are suspended.', 1);
          for (const p of sim.state.villagers) if (p.alive && p.villageId === b.id) p.happiness = clamp01(p.happiness - 0.02);
          changeRelation(sim, a.id, b.id, -1, 'propaganda');
          return;
        }
      }
    }
  }

  // ======================================================================
  // trade
  // ======================================================================

  /** Find the most valuable surplus→need exchange among all village pairs. */
  bestTrade(): { origin: VillageData; dest: VillageData; cargo: { resource: ResourceKind; amount: number }; payment: { resource: ResourceKind; amount: number } | null; kind: 'trade' | 'aid'; score: number } | null {
    const s = this.sim.state;
    const civ = s.civ;
    let best: ReturnType<CivilizationSystem['bestTrade']> = null;
    for (const origin of s.villages) {
      if (origin.population < 3) continue;
      for (const dest of s.villages) {
        if (dest.id === origin.id || dest.population === 0) continue;
        const cat = relationCategory(s, origin.id, dest.id);
        const mult = TRADE_MULT[cat];
        if (mult <= 0) continue; // hostile: suspended
        if (civ.caravans.some((c) => c.originId === origin.id && c.destId === dest.id)) continue;
        for (const r of RESOURCES) {
          const prefers = dest.identity.preferredResources.includes(r);
          const need = needOf(dest, r) + (prefers ? CONFIG.civ.comfort[r] * 0.25 : 0);
          const amount = Math.floor(Math.min(surplusOf(origin, r), need, CONFIG.civ.maxCargo, maxStock(r) - dest[r]));
          if (amount < 4) continue;
          const emergency = dest[r] < CONFIG.civ.comfort[r] * 0.35 && (r === 'food' || r === 'water');
          const payment = this.choosePayment(origin, dest, r, amount);
          let kind: 'trade' | 'aid' = 'trade';
          if (!payment) {
            if (!(emergency && (cat === 'allied' || cat === 'friendly'))) continue;
            kind = 'aid';
          }
          const score = amount * mult * (0.6 + origin.identity.openness * 0.4 + dest.identity.openness * 0.4) * (prefers ? 1.3 : 1) * (emergency ? 1.5 : 1);
          if (!best || score > best.score) best = { origin, dest, cargo: { resource: r, amount }, payment, kind, score };
        }
      }
    }
    return best;
  }

  /** The destination pays in whatever it has spare that the origin wants. */
  private choosePayment(origin: VillageData, dest: VillageData, cargo: ResourceKind, amount: number): { resource: ResourceKind; amount: number } | null {
    const civ = this.sim.state.civ;
    let best: { resource: ResourceKind; amount: number } | null = null;
    let bestScore = 0;
    let price = 1;
    if (civ.luxuryCarrots && origin.id === 'v1' && cargo === 'food') price *= 1.3;
    if (civ.shippingFees) price *= 1.1;
    for (const p of RESOURCES) {
      if (p === cargo) continue;
      const spare = surplusOf(dest, p);
      const room = maxStock(p) - origin[p];
      const want = needOf(origin, p) + (origin.identity.preferredResources.includes(p) ? CONFIG.civ.comfort[p] * 0.5 : 0);
      const pay = Math.floor(Math.min(spare, room, Math.ceil(amount * price)));
      if (pay < 3) continue;
      // Wanted goods first; otherwise accept anything spare at a token valuation.
      const score = want > 0 ? Math.min(pay, want) + 100 : pay * 0.1;
      if (score > bestScore) {
        bestScore = score;
        best = { resource: p, amount: pay };
      }
    }
    return best;
  }

  /** Start the best available trade if a merchant is free. Returns the caravan. */
  planTrade(): Caravan | null {
    const sim = this.sim;
    const civ = sim.state.civ;
    if (civ.caravans.length >= CONFIG.civ.maxCaravans) return null;
    const deal = this.bestTrade();
    if (!deal) return null;
    return this.startCaravan(deal.origin, deal.dest, deal.cargo, deal.payment, deal.kind);
  }

  startCaravan(origin: VillageData, dest: VillageData, cargo: { resource: ResourceKind; amount: number }, payment: { resource: ResourceKind; amount: number } | null, kind: 'trade' | 'aid'): Caravan | null {
    const sim = this.sim;
    if (cargo.amount <= 0 || origin[cargo.resource] < cargo.amount) return null;
    const merchants = this.pickTravellers(origin, cargo.amount >= 10 ? 2 : 1, (v) => has(v, 'ambitious') || has(v, 'curious') ? 2 : 1);
    if (!merchants.length) return null;
    const caravan: Caravan = {
      id: `c${sim.nextId()}`,
      kind,
      originId: origin.id,
      destId: dest.id,
      merchantIds: merchants.map((m) => m.id),
      cargo: { ...cargo },
      payment: payment ? { ...payment } : null,
      phase: 'outbound',
      startedAt: sim.state.time,
    };
    origin[cargo.resource] -= cargo.amount; // cargo is on the cart now
    sim.state.civ.caravans.push(caravan);
    for (const m of merchants) {
      m.travel = { kind: 'trade', originId: origin.id, destId: dest.id, phase: 'out', caravanId: caravan.id };
      sim.ai.travelStep(sim, m);
      sim.speech.say(m, kind === 'aid' ? `HOLD ON, ${dest.name.toUpperCase()}!` : `${cargo.resource.toUpperCase()} FOR ${dest.name.toUpperCase()}!`, 1);
    }
    sim.bus.emit('TRADE_STARTED', { caravan });
    return caravan;
  }

  private caravan(id: string | undefined): Caravan | undefined {
    return id ? this.sim.state.civ.caravans.find((c) => c.id === id) : undefined;
  }

  /** Merchant reached the destination: deliver the cargo and collect the payment (once per caravan). */
  private exchange(c: Caravan): void {
    const sim = this.sim;
    const origin = sim.village(c.originId);
    const dest = sim.village(c.destId);
    if (!origin || !dest || c.phase !== 'outbound') return;
    const delivered = addStock(dest, c.cargo.resource, c.cargo.amount);
    c.cargo.amount -= delivered; // anything that didn't fit stays on the cart → refunded at home
    const deliveredAmount = delivered;
    if (c.payment) {
      const paid = Math.max(0, Math.min(c.payment.amount, dest[c.payment.resource]));
      dest[c.payment.resource] -= paid;
      c.payment.amount = paid;
    }
    c.phase = 'returning';
    c.note = `${Math.round(deliveredAmount)} ${c.cargo.resource}`;
    const quips = TRADE_QUIPS[c.cargo.resource];
    const quip = quips[(sim.state.civ.caravans.length + sim.state.stats.tradesCompleted) % quips.length];
    if (c.kind === 'aid') {
      sim.notify(`${origin.name.toUpperCase()} SENT ${Math.round(deliveredAmount)} ${c.cargo.resource.toUpperCase()} TO ${dest.name.toUpperCase()}.`, 'good', 'Emergency aid between friends. No invoice. Yet.', 1);
      sim.remember(`aid:${relationKey(c.originId, c.destId)}`);
      changeRelation(sim, c.originId, c.destId, 6, 'aid');
    } else {
      sim.notify(
        `${origin.name.toUpperCase()} TRADED ${Math.round(deliveredAmount)} ${c.cargo.resource.toUpperCase()} FOR ${Math.round(c.payment?.amount ?? 0)} ${(c.payment?.resource ?? '').toUpperCase()}.`,
        'info',
        `${quip} (${dest.name} paid on delivery.)`,
        0,
      );
    }
  }

  /** Last merchant home: deposit the payment and refund anything undelivered. */
  private finishCaravan(c: Caravan, failed: string | null): void {
    const sim = this.sim;
    const s = sim.state;
    const origin = sim.village(c.originId);
    s.civ.caravans = s.civ.caravans.filter((x) => x !== c);
    if (origin) {
      if (c.cargo.amount > 0) {
        // Undelivered cargo goes back to its owner.
        origin[c.cargo.resource] += c.cargo.amount;
        c.cargo.amount = 0;
      }
      if (c.payment && c.phase === 'returning') {
        origin[c.payment.resource] += c.payment.amount;
      }
    }
    for (const id of c.merchantIds) {
      const m = sim.villager(id);
      if (m?.travel?.caravanId === c.id) m.travel.caravanId = undefined;
    }
    if (failed || c.phase !== 'returning') {
      c.outcome = 'failed';
      s.stats.tradesFailed++;
      sim.bus.emit('TRADE_FAILED', { caravan: c, reason: failed ?? 'never arrived' });
      if (origin) sim.notify(`THE ${origin.name.toUpperCase()} CARAVAN TURNED BACK.`, 'bad', `Reason: ${failed}. The goods were returned to ${origin.name}.`, 0);
      return;
    }
    c.outcome = 'success';
    s.stats.tradesCompleted++;
    const key = relationKey(c.originId, c.destId);
    sim.remember(`trade:${key}`);
    if (c.kind === 'trade') changeRelation(sim, c.originId, c.destId, 3, 'trade');
    if (s.stats.tradesCompleted === 1) {
      const dest = sim.village(c.destId);
      sim.history.add('The First Trade', `${origin?.name} and ${dest?.name} exchanged ${c.note ?? 'goods'}. Both sides believe they won.`, { kind: 'trade', villageId: c.originId, x: origin?.centerX, z: origin?.centerZ });
    }
    if (s.stats.tradesCompleted === 3 && !s.civ.shippingFees) {
      s.civ.shippingFees = true;
      sim.notify('PUDDLETON HAS INVENTED SHIPPING FEES.', 'culture', 'Every trade now costs 10% more. Nobody knows who receives the fee.', 1);
    }
    if (!s.civ.luxuryCarrots && c.originId === 'v1' && c.cargo.resource === 'food' && (origin?.food ?? 0) > 110) {
      s.civ.luxuryCarrots = true;
      sim.notify('PUDDLETON IS NOW EXPORTING LUXURY CARROTS.', 'culture', 'Same carrots. Higher price. Ribbon included.', 1);
    }
    sim.bus.emit('TRADE_COMPLETED', { caravan: c });
  }

  /** Fail caravans whose merchants all died or that took far too long. */
  private checkCaravans(): void {
    const sim = this.sim;
    for (const c of [...sim.state.civ.caravans]) {
      const alive = c.merchantIds.filter((id) => sim.villager(id)?.alive);
      if (!alive.length) {
        this.finishCaravan(c, 'the merchants did not survive');
        continue;
      }
      if (sim.state.time - c.startedAt > CONFIG.civ.caravanTimeout) {
        this.finishCaravan(c, 'the caravan got lost');
        for (const id of alive) {
          const m = sim.villager(id);
          if (m?.travel) m.travel.phase = 'back';
        }
      }
    }
  }

  private onDeath(villagerId: string): void {
    // Dead merchants leave the caravan; with nobody left, checkCaravans fails it and refunds the goods.
    for (const c of this.sim.state.civ.caravans) c.merchantIds = c.merchantIds.filter((id) => id !== villagerId);
  }

  // ======================================================================
  // travel (called by VillagerAI)
  // ======================================================================

  /** Where the villager is headed on the current leg of the trip. */
  travelTarget(v: VillagerData): { x: number; z: number } | null {
    const sim = this.sim;
    const plan = v.travel;
    if (!plan) return null;
    const village = sim.village(plan.phase === 'out' ? plan.destId : plan.originId);
    if (!village) return null;
    const jitter = (r: number) => {
      // Deterministic per villager so repeated path attempts aim at the same spot.
      let h = 0;
      for (let i = 0; i < v.id.length; i++) h = (h * 31 + v.id.charCodeAt(i)) >>> 0;
      const a = (h % 628) / 100;
      return { x: Math.cos(a) * r, z: Math.sin(a) * r };
    };
    if (plan.phase === 'out' && plan.kind === 'pilgrim' && plan.sacredId) {
      const sacred = sim.state.sacred.find((x) => x.id === plan.sacredId);
      if (sacred) {
        const j = jitter(3);
        return sim.pathfinding.nearestWalkable(sacred.x + j.x, sacred.z + j.z) ?? { x: sacred.x, z: sacred.z };
      }
    }
    if (plan.phase === 'out' && plan.kind === 'trade') {
      const storage = sim.building(village.storageId);
      if (storage) {
        const dx = village.centerX - storage.x;
        const dz = village.centerZ - storage.z;
        const d = Math.hypot(dx, dz) || 1;
        const j = jitter(1);
        return sim.pathfinding.nearestWalkable(storage.x + (dx / d) * (storage.footprint + 1.2) + j.x, storage.z + (dz / d) * (storage.footprint + 1.2) + j.z) ?? { x: storage.x, z: storage.z };
      }
    }
    const j = jitter(plan.phase === 'out' ? 4 : 2.5);
    return sim.pathfinding.nearestWalkable(village.centerX + j.x, village.centerZ + j.z) ?? { x: village.centerX, z: village.centerZ };
  }

  /** The AI could not find a route. The trip is abandoned; goods return to their owner. */
  onTravelFailed(v: VillagerData, reason: string): void {
    const plan = v.travel;
    if (!plan) return;
    const c = this.caravan(plan.caravanId);
    if (c) {
      c.merchantIds = c.merchantIds.filter((id) => id !== v.id);
      if (!c.merchantIds.length) this.finishCaravan(c, reason);
    }
    if (plan.kind === 'migrate') this.sim.notify(`${v.name.toUpperCase()} COULD NOT FIND THE WAY.`, 'info', `The move to ${this.sim.village(plan.destId)?.name} is off. Staying put, grumbling.`, 0);
    v.travel = null;
  }

  /** The villager reached the end of a leg. */
  onArrive(v: VillagerData): void {
    const sim = this.sim;
    const plan = v.travel;
    if (!plan) return;
    const host = sim.village(plan.phase === 'out' ? plan.destId : plan.originId);
    if (plan.phase === 'out' && host) {
      // Hosts offer travellers a drink and a bite (from their own stores).
      if (host.water >= 1 && v.thirst > 0.3) {
        host.water -= 1;
        v.thirst = Math.max(0, v.thirst - 0.7);
      }
      if (host.food >= 1 && v.hunger > 0.3) {
        host.food -= 1;
        v.hunger = Math.max(0, v.hunger - 0.7);
      }
    }
    if (plan.phase === 'back') {
      const c = this.caravan(plan.caravanId);
      if (c) {
        c.merchantIds = c.merchantIds.filter((id) => id !== v.id);
        if (!c.merchantIds.length) this.finishCaravan(c, c.phase === 'returning' ? null : 'never reached the market');
      }
      v.travel = null;
      sim.ai.setIdle(v, 1);
      return;
    }
    if (!host) {
      v.travel = null;
      return;
    }
    switch (plan.kind) {
      case 'trade': {
        const c = this.caravan(plan.caravanId);
        if (c && c.phase === 'outbound') this.exchange(c);
        this.preach(v, host, 'merchant');
        plan.phase = 'back';
        sim.ai.assign(sim, v, 'IDLE', 'barter', v.position.x, v.position.z, null, 4, host.centerX, host.centerZ);
        sim.speech.say(v, 'BEST PRICES ON THE ISLAND!', 0);
        break;
      }
      case 'migrate':
        this.completeMigration(v, host, plan.reason ?? 'opportunity');
        break;
      case 'visit':
        plan.phase = 'back';
        this.preach(v, host, 'visitor');
        changeRelation(sim, plan.originId, plan.destId, 1, 'visit');
        sim.ai.assign(sim, v, 'IDLE', 'visit', v.position.x, v.position.z, null, sim.rng.range(12, 20), host.centerX, host.centerZ);
        break;
      case 'pilgrim': {
        plan.phase = 'back';
        const sacred = sim.state.sacred.find((x) => x.id === plan.sacredId);
        if (sacred) {
          sacred.visits++;
          sim.sacredSys.addSacredness(sacred, 0.8);
          sim.ai.pray(sim, v, sacred.x, sacred.z, 8);
          sim.bus.emit('PILGRIMAGE_COMPLETED', { villagerId: v.id, sacredId: sacred.id, fromId: plan.originId });
          sim.bus.emit('SACRED_VISITED', { villagerId: v.id, sacredId: sacred.id, villageId: plan.originId });
          if (!sim.state.history.some((h) => h.title === 'The First Pilgrimage')) {
            sim.history.add('The First Pilgrimage', `${v.name} walked from ${sim.village(plan.originId)?.name} to pray at ${sacred.label}. Their feet have opinions.`, { kind: 'religion', villageId: host.id, x: sacred.x, z: sacred.z });
          }
        }
        this.preach(v, host, 'pilgrim');
        break;
      }
    }
  }

  /** Pick available adults from a village for a trip. */
  pickTravellers(village: VillageData, count: number, weight: (v: VillagerData) => number = () => 1): VillagerData[] {
    const sim = this.sim;
    const pool = sim.state.villagers.filter((v) => {
      if (!v.alive || v.villageId !== village.id || v.travel || v.age < 14 || v.health < 0.5 || v.hunger > 0.5 || v.thirst > 0.5) return false;
      const t = v.currentTask;
      if (t.state === 'FLEEING' || t.state === 'PRAYING' || t.state === 'CELEBRATING' || t.state === 'DEAD') return false;
      if (t.state === 'RESTING' && t.arrived) return false;
      if (t.activity === 'ritual' || t.activity.startsWith('construct') || t.activity === 'queue') return false;
      if (sim.state.religions.some((r) => r.leaderId === v.id)) return false;
      return true;
    });
    const out: VillagerData[] = [];
    while (out.length < count && pool.length) {
      const total = pool.reduce((a, v) => a + weight(v), 0);
      let roll = sim.rng.next() * total;
      let idx = 0;
      for (; idx < pool.length - 1; idx++) {
        roll -= weight(pool[idx]);
        if (roll <= 0) break;
      }
      out.push(pool.splice(idx, 1)[0]);
    }
    return out;
  }

  // ======================================================================
  // migration
  // ======================================================================

  /** Why would this villager leave home? 0..~1.5 */
  pushScore(v: VillagerData, home: VillageData): { score: number; reason: string } {
    const reasons: Array<[number, string]> = [
      [(1 - v.happiness) * 0.5, 'unhappiness'],
      [home.food < 20 ? 0.35 : 0, 'hunger'],
      [home.water < 15 ? 0.35 : 0, 'thirst'],
      [v.fear * 0.45, 'fear of the sky'],
      [v.religionId && home.identity.dominantReligionId && home.identity.dominantReligionId !== v.religionId ? 0.3 * (1 - home.identity.religiousTolerance) : 0, 'religious freedom'],
      [this.sim.state.culture.potatoCult && has(v, 'skeptical') ? 0.15 : 0, 'the potato situation'],
    ];
    let score = 0;
    let top: [number, string] = [0, 'boredom'];
    for (const r of reasons) {
      score += r[0];
      if (r[0] > top[0]) top = r;
    }
    if (has(v, 'curious') || has(v, 'rebellious')) score *= 1.2;
    if (has(v, 'devout') && v.religionId && v.religionId === home.identity.dominantReligionId) score *= 0.6;
    return { score, reason: top[1] };
  }

  /** Why would this villager pick that village? 0..~1.2 */
  pullScore(v: VillagerData, from: VillageData, to: VillageData): number {
    const cat = relationCategory(this.sim.state, from.id, to.id);
    if (cat === 'hostile') return 0;
    const houses = to.houseIds.filter((id) => !this.sim.building(id)?.destroyed).length;
    if (to.population >= houses * CONFIG.village.houseCapacity) return 0;
    let p = to.prosperity * 0.5 + to.happiness * 0.2 + to.identity.openness * 0.2;
    if (v.religionId && to.identity.dominantReligionId === v.religionId) p += 0.3;
    if (cat === 'allied' || cat === 'friendly') p += 0.1;
    if (to.food < 20 || to.water < 15) p *= 0.4;
    return p;
  }

  considerMigration(force = false): VillagerData | null {
    const sim = this.sim;
    const s = sim.state;
    if (!force && s.time - s.civ.lastMigrationAt < CONFIG.civ.migrationCooldown) return null;
    if (s.villagers.filter((v) => v.alive).length > CONFIG.civ.populationCap) return null;
    let best: { v: VillagerData; to: VillageData; reason: string; score: number } | null = null;
    for (const v of s.villagers) {
      if (!v.alive || v.travel || v.age < 14) continue;
      const home = sim.village(v.villageId);
      if (!home || home.population <= 5) continue;
      if (s.religions.some((r) => r.leaderId === v.id)) continue;
      const t = v.currentTask;
      if (t.state === 'FLEEING' || t.state === 'PRAYING' || t.activity === 'ritual') continue;
      const push = this.pushScore(v, home);
      if (push.score < 0.3) continue;
      for (const to of s.villages) {
        if (to.id === home.id) continue;
        const pull = this.pullScore(v, home, to);
        const score = push.score * pull;
        if (!best || score > best.score) best = { v, to, reason: push.reason, score };
      }
    }
    if (!best || (!force && (best.score < 0.22 || sim.rng.next() > 0.55))) return null;
    return this.startMigration(best.v, best.to, best.reason);
  }

  startMigration(v: VillagerData, to: VillageData, reason: string): VillagerData | null {
    const sim = this.sim;
    if (!v.alive || v.travel || v.villageId === to.id) return null;
    sim.state.civ.lastMigrationAt = sim.state.time;
    v.travel = { kind: 'migrate', originId: v.villageId, destId: to.id, phase: 'out', reason };
    sim.ai.travelStep(sim, v);
    sim.speech.say(v, `I'M MOVING TO ${to.name.toUpperCase()}.`, 2);
    sim.bus.emit('MIGRATION_STARTED', { villagerId: v.id, fromId: v.travel?.originId ?? '', toId: to.id, reason });
    return v;
  }

  /** The same entity changes village; name, traits, memories, faith and mutations travel with them. */
  private completeMigration(v: VillagerData, to: VillageData, reason: string): void {
    const sim = this.sim;
    const fromId = v.villageId;
    const from = sim.village(fromId);
    const occupancy = new Map<number, number>();
    for (const o of sim.state.villagers) if (o.alive && o.villageId === to.id) occupancy.set(o.homeId, (occupancy.get(o.homeId) ?? 0) + 1);
    const home = to.houseIds.filter((id) => !sim.building(id)?.destroyed).sort((a, b) => (occupancy.get(a) ?? 0) - (occupancy.get(b) ?? 0))[0] ?? to.houseIds[0];
    v.villageId = to.id;
    v.homeId = home;
    v.travel = null;
    v.happiness = clamp01(v.happiness + 0.12);
    v.fear = Math.max(0, v.fear - 0.2);
    sim.state.stats.migrations++;
    sim.ai.setIdle(v, 1);
    if (v.religionId) {
      const r = sim.state.religions.find((x) => x.id === v.religionId && x.active);
      const present = r && r.followers.some((id) => id !== v.id && sim.villager(id)?.alive && sim.villager(id)?.villageId === to.id);
      if (r && !present) this.announceSpread(r, to, 'migrant');
    }
    sim.notify(`${v.name.toUpperCase()} MOVED TO ${to.name.toUpperCase()}.`, 'info', `Left ${from?.name ?? 'home'}. Cited reason: ${reason}.`, 1);
    if (sim.state.stats.migrations === 1) {
      sim.history.add('The First Migration', `${v.name} packed everything they owned (a spoon) and moved from ${from?.name} to ${to.name}. Reason: ${reason}.`, { kind: 'migration', villageId: to.id, x: to.centerX, z: to.centerZ });
    }
    sim.bus.emit('VILLAGER_MIGRATED', { villagerId: v.id, name: v.name, fromId, toId: to.id, reason });
  }

  // ======================================================================
  // visits, pilgrimages and religious spread
  // ======================================================================

  planVisit(): VillagerData | null {
    const sim = this.sim;
    const vs = sim.state.villages.filter((v) => v.population > 3);
    if (vs.length < 2) return null;
    const origin = vs[Math.floor(sim.rng.next() * vs.length)];
    const options = vs.filter((d) => {
      if (d.id === origin.id) return false;
      const cat = relationCategory(sim.state, origin.id, d.id);
      return cat === 'allied' || cat === 'friendly' || (cat === 'neutral' && origin.identity.openness > 0.5);
    });
    if (!options.length) return null;
    const dest = options[Math.floor(sim.rng.next() * options.length)];
    const [v] = this.pickTravellers(origin, 1, (x) => (has(x, 'curious') ? 3 : 1) * (0.5 + origin.identity.openness));
    if (!v) return null;
    v.travel = { kind: 'visit', originId: origin.id, destId: dest.id, phase: 'out' };
    sim.ai.travelStep(sim, v);
    return v;
  }

  planPilgrimage(): VillagerData | null {
    const sim = this.sim;
    for (const r of sim.religion.active) {
      const sacred = sim.religion.sacredOf(r);
      if (!sacred || sacred.stage < 3) continue;
      const site = sim.sacredSys.ownerVillage(sacred);
      if (!site) continue;
      const candidates = sim.state.villages.filter((o) => o.id !== site.id && relationCategory(sim.state, o.id, site.id) !== 'hostile');
      for (const origin of candidates) {
        const [v] = this.pickTravellers(origin, 1, (x) => (x.religionId === r.id ? 6 : 0.0001) * (has(x, 'devout') ? 2 : 1));
        if (!v || v.religionId !== r.id) continue;
        v.travel = { kind: 'pilgrim', originId: origin.id, destId: site.id, phase: 'out', sacredId: sacred.id };
        sim.ai.travelStep(sim, v);
        sim.speech.say(v, 'TO THE HOLY PLACE!', 1);
        return v;
      }
    }
    return null;
  }

  /** How strongly a religion pulls on a villager, given culture, tolerance and diplomacy. */
  conversionFactor(target: VillagerData, r: Religion): number {
    const village = this.sim.village(target.villageId);
    if (!village) return 1;
    let f = 1;
    // A faith born elsewhere must overcome local tolerance and the state of relations.
    if (r.villageId !== target.villageId) {
      f *= (0.4 + village.identity.religiousTolerance) * FAITH_MULT[relationCategory(this.sim.state, r.villageId, target.villageId)];
    }
    // Stubborn locals defend their dominant faith.
    const dom = village.identity.dominantReligionId;
    if (dom && dom !== r.id) f *= 0.5 + village.identity.religiousTolerance * 0.5;
    return f;
  }

  /** A travelling believer tries to win one local over. */
  preach(v: VillagerData, host: VillageData, via: string): void {
    const sim = this.sim;
    if (!v.religionId || v.villageId === host.id) return;
    const r = sim.state.religions.find((x) => x.id === v.religionId && x.active);
    if (!r) return;
    const targets = sim.villagersNear(v.position.x, v.position.z, 16, []).filter((t) => t.villageId === host.id && !t.travel && t.religionId !== r.id && t.age >= 10);
    if (!targets.length) return;
    const t = targets[Math.floor(sim.rng.next() * targets.length)];
    const p = 0.35 * conversionWeight(t) * this.conversionFactor(t, r) * (t.religionId ? 0.35 : 1);
    if (sim.rng.next() < p) {
      sim.religion.convert(t, r, true, via);
      sim.speech.say(v, `HAVE YOU HEARD OF ${r.name.split(' ').slice(-2).join(' ').toUpperCase()}?`, 1);
    }
  }

  /** First follower of a faith in a village: emit RELIGION_SPREAD (and the history entry). */
  announceSpread(r: Religion, village: VillageData, via: string): void {
    const sim = this.sim;
    sim.state.stats.religionSpreads++;
    sim.notify(`${r.name.toUpperCase()} REACHED ${village.name.toUpperCase()}.`, 'culture', `Carried by a ${via}. Theology now crosses borders.`, 1);
    if (!sim.state.history.some((h) => h.kind === 'religion-spread' && h.text.includes(r.name))) {
      sim.history.add(`${r.name} Spread to ${village.name}`, `A ${via} brought the faith. The locals have follow-up questions.`, { kind: 'religion-spread', villageId: village.id, x: village.centerX, z: village.centerZ });
    }
    sim.bus.emit('RELIGION_SPREAD', { religionId: r.id, villageId: village.id, via });
  }

  // ======================================================================
  // camera visits (fed by the renderer, sim stays DOM-free)
  // ======================================================================

  cameraAt(x: number, z: number, dt: number): void {
    const sim = this.sim;
    for (const v of sim.state.villages) {
      const inside = Math.hypot(x - v.centerX, z - v.centerZ) < v.radius + 6;
      const d = inside ? (this.cameraDwell.get(v.id) ?? 0) + dt : 0;
      this.cameraDwell.set(v.id, d);
      if (inside && d >= 1.5 && !sim.state.civ.visited.includes(v.id)) {
        sim.state.civ.visited.push(v.id);
        sim.bus.emit('CAMERA_VISIT', { villageId: v.id });
      }
    }
  }

}
