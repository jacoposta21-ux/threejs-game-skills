import { CONFIG } from '../core/Config';
import type { BuildingData, FireData, FireKind, TreeData } from '../core/types';
import type { Simulation } from './SimulationManager';

/**
 * Lightweight fire propagation. Each fire is attached to a tree, building, or
 * patch of ground and tracks fuel, intensity and age. Spread is evaluated on a
 * staggered timer with a hard cap on active fires and spread checks per tick.
 */
export class FireSystem {
  private readonly nearTrees: TreeData[] = [];
  private damageThrottle = new Map<number, number>();

  ignite(sim: Simulation, kind: FireKind, targetId: number, byPlayer: boolean, fromId?: number): FireData | null {
    const s = sim.state;
    if (s.fires.length >= CONFIG.fire.maxActive) return null;
    let x = 0;
    let z = 0;
    let fuel: number = CONFIG.fire.groundFuel;
    if (kind === 'tree') {
      const tree = sim.tree(targetId);
      if (!tree || tree.removed || tree.burning || tree.charred || tree.golden) return null;
      tree.burning = true;
      x = tree.x;
      z = tree.z;
      fuel = CONFIG.fire.treeFuel * (0.5 + 0.5 * tree.growth) * (tree.kind === 'bush' ? 0.5 : 1);
    } else if (kind === 'building') {
      const b = sim.building(targetId);
      if (!b || b.destroyed || this.fireOnBuilding(sim, b.id)) return null;
      if (b.type === 'well') return null; // stone wells do not burn
      x = b.x;
      z = b.z;
      fuel = CONFIG.fire.buildingFuel;
    } else {
      // Ground fires use their own coordinates encoded by the caller via igniteGround.
      return null;
    }
    return this.push(sim, kind, targetId, x, z, fuel, byPlayer, fromId);
  }

  igniteGround(sim: Simulation, x: number, z: number, byPlayer: boolean): FireData | null {
    if (sim.state.fires.length >= CONFIG.fire.maxActive) return null;
    return this.push(sim, 'ground', -1, x, z, CONFIG.fire.groundFuel, byPlayer);
  }

  private push(
    sim: Simulation,
    kind: FireKind,
    targetId: number,
    x: number,
    z: number,
    fuel: number,
    byPlayer: boolean,
    fromId?: number,
  ): FireData {
    const fire: FireData = {
      id: sim.nextId(),
      kind,
      targetId,
      x,
      z,
      intensity: 0.3,
      fuel,
      age: 0,
      spreadTimer: CONFIG.fire.spreadInterval * (0.5 + sim.rng.next()),
      byPlayer,
    };
    sim.state.fires.push(fire);
    if (fromId !== undefined) sim.bus.emit('FIRE_SPREAD', { fromId, fireId: fire.id, x, z, kind });
    else {
      if (byPlayer) sim.state.stats.firesStarted++;
      sim.bus.emit('FIRE_STARTED', { fireId: fire.id, x, z, kind, byPlayer });
    }
    return fire;
  }

  fireOnBuilding(sim: Simulation, buildingId: number): boolean {
    return sim.state.fires.some((f) => f.kind === 'building' && f.targetId === buildingId);
  }

  inRain(sim: Simulation, x: number, z: number): boolean {
    for (const c of sim.state.clouds) if (Math.hypot(c.x - x, c.z - z) <= c.radius) return true;
    return false;
  }

  update(sim: Simulation, dt: number): void {
    const s = sim.state;
    let spreadChecks = 0;
    const windX = Math.cos(sim.windAngle);
    const windZ = Math.sin(sim.windAngle);

    for (let i = s.fires.length - 1; i >= 0; i--) {
      const fire = s.fires[i];
      const fdt = dt * sim.effects.timeFactor(fire.x, fire.z);
      fire.age += fdt;
      const moisture = sim.moistureAt(fire.x, fire.z);
      const raining = this.inRain(sim, fire.x, fire.z);
      const flood = sim.floodAt(fire.x, fire.z);

      fire.intensity += CONFIG.fire.growPerSec * fdt * Math.max(0, 1 - moisture * 1.15);
      if (raining) fire.intensity -= CONFIG.rain.fireDampPerSec * dt;
      if (moisture > 0.85) fire.intensity -= 0.12 * dt;
      if (flood > 0.2) fire.intensity -= 0.4 * dt;
      fire.intensity = Math.min(1, fire.intensity);
      fire.fuel -= Math.max(0.15, fire.intensity) * fdt;

      let ended = false;
      if (fire.kind === 'building') {
        const b = sim.building(fire.targetId);
        if (!b || b.destroyed) ended = true;
        else {
          b.health -= CONFIG.fire.buildingDamagePerSec * fire.intensity * dt;
          this.reportDamage(sim, b);
          if (b.health <= 0) {
            this.destroyBuilding(sim, b);
            ended = true;
          }
        }
      } else if (fire.kind === 'tree') {
        const tree = sim.tree(fire.targetId);
        if (tree) tree.health = Math.max(0, tree.health - 0.08 * fire.intensity * dt);
      }

      if (!ended && fire.intensity < CONFIG.fire.extinguishBelow && fire.age > 0.4) {
        this.release(sim, fire, false);
        s.fires.splice(i, 1);
        sim.bus.emit('FIRE_EXTINGUISHED', { fireId: fire.id, x: fire.x, z: fire.z, byRain: raining || moisture > 0.85, kind: fire.kind, targetId: fire.targetId, byPlayer: fire.byPlayer, byFreeze: sim.effects.freezeAt(fire.x, fire.z) > 0 });
        continue;
      }
      if (ended || fire.fuel <= 0) {
        this.release(sim, fire, true);
        s.fires.splice(i, 1);
        sim.bus.emit('FIRE_EXTINGUISHED', { fireId: fire.id, x: fire.x, z: fire.z, byRain: false, kind: fire.kind, targetId: fire.targetId, byPlayer: fire.byPlayer });
        continue;
      }

      fire.spreadTimer -= dt;
      if (fire.spreadTimer > 0 || spreadChecks >= CONFIG.fire.maxSpreadChecksPerTick) continue;
      fire.spreadTimer = CONFIG.fire.spreadInterval * (0.75 + sim.rng.next() * 0.5);
      spreadChecks++;
      if (s.fires.length >= CONFIG.fire.maxActive) continue;

      const R = CONFIG.fire.spreadRadius;
      const trees = sim.treesNear(fire.x, fire.z, R, this.nearTrees);
      for (const tree of trees) {
        if (tree.burning || tree.charred || tree.growth < 0.25 || tree.id === fire.targetId) continue;
        const dx = tree.x - fire.x;
        const dz = tree.z - fire.z;
        const d = Math.hypot(dx, dz);
        const wind = d > 0.01 ? 1 + 0.55 * ((dx * windX + dz * windZ) / d) : 1;
        const targetMoisture = sim.moistureAt(tree.x, tree.z);
        const p =
          CONFIG.fire.baseSpread * (1 + s.culture.fireRisk) * fire.intensity * (1 - d / R) * Math.max(0, 1 - targetMoisture * 1.25) * wind *
          (tree.kind === 'pine' ? 1.25 : 1);
        if (sim.rng.next() < p) this.ignite(sim, 'tree', tree.id, fire.byPlayer, fire.id);
        if (s.fires.length >= CONFIG.fire.maxActive) break;
      }
      for (const b of s.buildings) {
        if (b.destroyed || b.type === 'well') continue;
        const d = Math.hypot(b.x - fire.x, b.z - fire.z) - b.footprint;
        if (d > R * 0.8 || (fire.kind === 'building' && fire.targetId === b.id)) continue;
        if (this.fireOnBuilding(sim, b.id)) continue;
        const p = CONFIG.fire.baseSpread * 0.8 * fire.intensity * (1 - Math.max(0, d) / (R * 0.8)) * Math.max(0, 1 - sim.moistureAt(b.x, b.z) * 1.2);
        if (sim.rng.next() < p) this.ignite(sim, 'building', b.id, fire.byPlayer, fire.id);
      }
    }
  }

  private release(sim: Simulation, fire: FireData, burnedOut: boolean): void {
    if (fire.kind === 'tree') {
      const tree = sim.tree(fire.targetId);
      if (!tree) return;
      tree.burning = false;
      if (burnedOut) {
        tree.charred = true;
        tree.charredTime = 0;
        tree.health = 0;
        sim.bus.emit('TREE_BURNED', { treeId: tree.id, x: tree.x, z: tree.z });
      }
    }
  }

  private reportDamage(sim: Simulation, b: BuildingData): void {
    const last = this.damageThrottle.get(b.id) ?? -10;
    if (sim.state.time - last < 2) return;
    this.damageThrottle.set(b.id, sim.state.time);
    sim.bus.emit('BUILDING_DAMAGED', { buildingId: b.id, type: b.type, health: b.health });
  }

  destroyBuilding(sim: Simulation, b: BuildingData): void {
    if (b.destroyed) return;
    b.destroyed = true;
    b.health = 0;
    if (b.type === 'farm') b.cropGrowth = 0;
    sim.state.stats.buildingsLost++;
    sim.pathfinding.rebuildObstacles(sim.state.buildings);
    sim.bus.emit('BUILDING_DESTROYED', { buildingId: b.id, type: b.type, villageId: b.villageId });
  }

  /** Rain over a fire: called by tests and power previews. */
  activeFiresNear(sim: Simulation, x: number, z: number, radius: number): number {
    let count = 0;
    for (const f of sim.state.fires) if (Math.hypot(f.x - x, f.z - z) <= radius) count++;
    return count;
  }
}
