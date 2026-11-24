import { CONFIG } from '../core/Config';
import type { EffectKind, PowerEffect, TreeData, VillagerData } from '../core/types';
import type { Simulation } from '../simulation/SimulationManager';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * v0.4 timed area effects created by powers: tornado, freeze, gravity, time warp,
 * meteor. Effects live in `state.effects` (saved), are bounded in number and
 * duration, and expose cheap spatial queries other systems use to scale their
 * own work locally (the global timestep never changes).
 *
 * Save rule: effects are persisted as-is; on load they simply continue for their
 * remaining time. A meteor saved during its warning still lands; a levitating
 * villager keeps its `lift` and settles once the field is gone.
 */
export class EffectsSystem {
  private readonly near: VillagerData[] = [];
  private readonly trees: TreeData[] = [];
  private tick = 0;

  constructor(private readonly sim: Simulation) {}

  get list(): PowerEffect[] {
    return this.sim.state.effects;
  }

  add(kind: EffectKind, x: number, z: number, radius: number, duration: number, extra: Partial<PowerEffect> = {}): PowerEffect {
    const s = this.sim.state;
    // Bounded: the oldest effect of any kind makes room.
    while (s.effects.length >= CONFIG.career.maxEffects) this.end(s.effects[0]);
    const e: PowerEffect = { id: this.sim.nextId(), kind, x, z, radius, startedAt: s.time, until: s.time + duration, touched: [], ...extra };
    s.effects.push(e);
    this.sim.bus.emit('EFFECT_STARTED', { id: e.id, kind, x, z });
    return e;
  }

  private end(e: PowerEffect): void {
    const s = this.sim.state;
    s.effects = s.effects.filter((x) => x !== e);
    this.sim.bus.emit('EFFECT_ENDED', { id: e.id, kind: e.kind });
  }

  /** Strongest effect of a kind covering a point (null when none). */
  at(kind: EffectKind, x: number, z: number): PowerEffect | null {
    for (const e of this.sim.state.effects) {
      if (e.kind === kind && !e.done && Math.hypot(x - e.x, z - e.z) <= e.radius) return e;
    }
    return null;
  }

  /** 0..1 freeze strength at a point (fades during the last 6 s = visible thaw). */
  freezeAt(x: number, z: number): number {
    const e = this.at('freeze', x, z);
    if (!e) return 0;
    return clamp01((e.until - this.sim.state.time) / 6);
  }

  /** Local time multiplier (Time Warp × freeze slowdown). 1 when nothing applies. */
  timeFactor(x: number, z: number): number {
    const w = this.at('timewarp', x, z);
    const f = this.freezeAt(x, z);
    return (w?.factor ?? 1) * (1 - f * 0.5);
  }

  /** Growth multiplier: frozen ground pauses growth completely. */
  growthFactor(x: number, z: number): number {
    if (this.freezeAt(x, z) > 0.05) return 0;
    return this.at('timewarp', x, z)?.factor ?? 1;
  }

  update(dt: number): void {
    const sim = this.sim;
    const s = sim.state;
    this.tick++;
    for (const e of [...s.effects]) {
      switch (e.kind) {
        case 'tornado':
          this.tornado(e, dt);
          break;
        case 'freeze':
          this.freeze(e, dt);
          break;
        case 'gravity':
          this.gravity(e);
          break;
        case 'meteor':
          if (!e.done && s.time >= (e.impactAt ?? 0)) sim.powers.meteor.impact(sim, e);
          break;
        default:
          break;
      }
      if (s.time >= e.until) this.end(e);
    }
    // Lift settles back down when no gravity field holds an entity up.
    for (const v of s.villagers) {
      if (!v.lift) continue;
      const g = this.at('gravity', v.position.x, v.position.z);
      if (g && v.alive) continue;
      v.lift = Math.max(0, v.lift - dt * 1.6);
      if (v.lift === 0) delete v.lift;
    }
    for (const r of s.rocks) {
      if (!r.lift || r.floating) continue;
      if (this.at('gravity', r.x, r.z)) continue;
      r.lift = Math.max(0, r.lift - dt * 1.2);
    }
  }

  // ------------------------------------------------------------------ tornado

  private tornado(e: PowerEffect, dt: number): void {
    const sim = this.sim;
    const speed = CONFIG.powers.tornado.speed;
    // Wander: drift heading slowly, bounce off the coast.
    let dx = e.dirX ?? 1;
    let dz = e.dirZ ?? 0;
    const turn = (sim.rng.next() - 0.5) * 0.8 * dt;
    const c = Math.cos(turn);
    const sn = Math.sin(turn);
    [dx, dz] = [dx * c - dz * sn, dx * sn + dz * c];
    let nx = e.x + dx * speed * dt;
    let nz = e.z + dz * speed * dt;
    if (Math.hypot(nx, nz) > 60 || !sim.terrain.isLand(nx, nz) && sim.terrain.heightAt(nx, nz) < -1) {
      dx = -nx / (Math.hypot(nx, nz) || 1);
      dz = -nz / (Math.hypot(nx, nz) || 1);
      nx = e.x + dx * speed * dt;
      nz = e.z + dz * speed * dt;
    }
    e.x = nx;
    e.z = nz;
    e.dirX = dx;
    e.dirZ = dz;
    if (this.tick % 5 !== 0) return; // 4 Hz damage pass
    const step = dt * 5;
    const R = e.radius;
    const touched = (e.touched ??= []);
    let buildings = 0;
    let trees = 0;
    for (const v of sim.villagersNear(e.x, e.z, R + 6, this.near)) {
      if (v.currentTask.state !== 'FLEEING') sim.ai.flee(sim, v, e.x, e.z);
      v.fear = clamp01(v.fear + 0.08);
      // Caravans caught in the funnel drop their cargo run (goods return home by the trade rules).
      if (v.travel?.caravanId && Math.hypot(v.position.x - e.x, v.position.z - e.z) < R) sim.civ.onTravelFailed(v, 'blown away by a tornado');
    }
    for (const t of sim.treesNear(e.x, e.z, R, this.trees)) {
      if (t.charred || t.golden) continue;
      t.health -= 0.25 * step;
      if (t.health <= 0.15 && t.growth >= 1 && !touched.includes(`t${t.id}`)) {
        touched.push(`t${t.id}`);
        t.removed = true; // uprooted: becomes wood for the nearest village
        const { village, distance } = sim.nearestVillage(t.x, t.z);
        if (village && distance < 40) village.wood = Math.min(CONFIG.village.maxWood, village.wood + 2);
        trees++;
      }
    }
    for (const b of sim.state.buildings) {
      if (b.destroyed || b.type === 'farm' || b.type === 'well') continue;
      if (Math.hypot(b.x - e.x, b.z - e.z) - b.footprint > R * 0.6) continue;
      b.health -= 6 * step;
      buildings++;
      sim.bus.emit('BUILDING_DAMAGED', { buildingId: b.id, type: b.type, health: b.health });
      if (b.health <= 0) sim.fire.destroyBuilding(sim, b);
    }
    // Loose rocks get flung a few metres to a valid spot (never into water or buildings).
    for (const r of sim.state.rocks) {
      if (r.crowned || Math.hypot(r.x - e.x, r.z - e.z) > R * 0.7 || touched.includes(`r${r.id}`)) continue;
      const a = sim.rng.range(0, Math.PI * 2);
      const tx = r.x + Math.cos(a) * 6;
      const tz = r.z + Math.sin(a) * 6;
      if (sim.terrain.isLand(tx, tz) && !sim.buildingAt(tx, tz, 1)) {
        r.x = tx;
        r.z = tz;
        r.targetX = tx;
        r.targetZ = tz;
        touched.push(`r${r.id}`);
      }
    }
    // Fires: weak ones are snuffed, strong ones are fanned and thrown downwind.
    for (const f of sim.state.fires) {
      if (Math.hypot(f.x - e.x, f.z - e.z) > R + 2) continue;
      if (f.intensity < 0.35) f.intensity -= 0.6 * step;
      else {
        f.intensity = Math.min(1, f.intensity + 0.2 * step);
        if (sim.rng.chance(0.25)) {
          const tree = sim.treesNear(f.x + dx * 6, f.z + dz * 6, 4, this.trees).find((t) => !t.burning && !t.charred && !t.golden);
          if (tree && sim.fire.ignite(sim, 'tree', tree.id, true, f.id)) sim.combos.trigger('firenado', f.x, f.z);
        }
      }
    }
    if (buildings || trees) {
      const { village, distance } = sim.nearestVillage(e.x, e.z);
      if (village && distance < village.radius + 10) sim.remember(`tornado:${village.id}`);
      sim.bus.emit('TORNADO_DAMAGE', { x: e.x, z: e.z, buildings, trees });
    }
  }

  // ------------------------------------------------------------------ freeze

  private freeze(e: PowerEffect, dt: number): void {
    const sim = this.sim;
    if (this.tick % 4 !== 0) return;
    for (const f of sim.state.fires) {
      if (Math.hypot(f.x - e.x, f.z - e.z) <= e.radius) f.intensity -= 2.5 * dt * 4;
    }
    for (const v of sim.villagersNear(e.x, e.z, e.radius, this.near)) {
      v.happiness = clamp01(v.happiness - 0.002);
      if (v.thought === null && sim.rng.chance(0.02)) {
        v.thought = 'alarm';
        v.thoughtTimer = 2;
      }
    }
  }

  // ------------------------------------------------------------------ gravity

  private gravity(e: PowerEffect): void {
    const sim = this.sim;
    const left = e.until - sim.state.time;
    const target = left < 1.5 ? 0 : 2.2;
    const touched = (e.touched ??= []);
    for (const v of sim.villagersNear(e.x, e.z, e.radius, this.near)) {
      if (v.travel || sim.state.possession?.villagerId === v.id) continue;
      v.lift = Math.min(target, (v.lift ?? 0) + 0.06);
      if (v.lift > 0.8 && !touched.includes(v.id)) {
        touched.push(v.id);
        sim.bus.emit('VILLAGER_LEVITATED', { villagerId: v.id });
        if (sim.rng.chance(0.35)) sim.speech.say(v, ['I HAVE BEEN PROMOTED TO CLOUD.', 'MY FEET ARE ON STRIKE.', 'IS THIS HEAVEN? IT IS DRAFTY.'][touched.length % 3], 1);
      }
    }
    for (const r of sim.state.rocks) {
      if (Math.hypot(r.x - e.x, r.z - e.z) > e.radius) continue;
      r.lift = Math.min(target * 1.3, (r.lift ?? 0) + 0.05);
      if (r.walking && !r.floating && r.lift > 1) {
        r.floating = true; // a walking rock learns to float for good
        sim.combos.trigger('floating-rock', r.x, r.z);
      }
    }
  }
}
