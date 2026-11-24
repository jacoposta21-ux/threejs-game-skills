import { CONFIG } from '../core/Config';
import type { BuildingData, ThoughtIcon, TreeData, VillageData, VillagerData, VillagerStateName } from '../core/types';
import type { Simulation } from '../simulation/SimulationManager';
import type { RitualDefinition } from '../core/types';
import { fleeScale, has } from '../culture/Personality';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** States that ignore routine re-planning until they finish. */
const COMMITTED: ReadonlySet<VillagerStateName> = new Set(['FLEEING', 'PRAYING', 'CELEBRATING', 'DEAD']);

/**
 * Villager finite-state machine. Decisions are staggered (each villager thinks
 * every ~1.2 s on its own phase); movement runs every fixed tick along A* paths.
 * Every destination is a real place: well, storage, farm, trees, shrine, home.
 */
export class VillagerAI {
  private readonly nearTrees: TreeData[] = [];
  private readonly near: VillagerData[] = [];

  update(sim: Simulation, dt: number): void {
    const possessed = sim.state.possession?.villagerId;
    for (const v of sim.state.villagers) {
      if (!v.alive) {
        v.deadTime += dt;
        continue;
      }
      // v0.4: the player is driving this one (PossessionSystem moves them).
      if (v.id === possessed) continue;
      // v0.4: floating villagers can only flail.
      if ((v.lift ?? 0) > 0.6) {
        if (v.thoughtTimer > 0 && (v.thoughtTimer -= dt) <= 0) v.thought = null;
        continue;
      }
      if (v.thoughtTimer > 0) {
        v.thoughtTimer -= dt;
        if (v.thoughtTimer <= 0) v.thought = null;
      }
      v.decisionTimer -= dt;
      if (v.decisionTimer <= 0) {
        v.decisionTimer = CONFIG.villager.decisionInterval * (0.8 + sim.rng.next() * 0.4);
        this.think(sim, v);
      }
      this.act(sim, v, dt);
    }
  }

  // ---------------- decisions ----------------

  private think(sim: Simulation, v: VillagerData): void {
    const task = v.currentTask;
    // Personality and memory shape courage: cowards and fire survivors flee earlier.
    const fireShy = sim.memory.recall(v, 'fire') + sim.memory.recall(v, 'survived-fire') > 0.25 ? 3 : 0;
    const fire = this.nearestFire(sim, v.position.x, v.position.z, CONFIG.villager.fleeRadius * fleeScale(v) + fireShy);
    if (fire && task.state !== 'FLEEING') {
      this.flee(sim, v, fire.x, fire.z);
      return;
    }
    if (COMMITTED.has(task.state)) return;

    if (task.state === 'RESTING') {
      if (!sim.isNight || v.thirst > 0.85 || v.hunger > 0.85) this.setIdle(v, 0.5);
      return;
    }

    // v0.3: travellers keep to their trip (trade, migration, visits, pilgrimages).
    if (v.travel) {
      if (task.activity === 'travel' && !task.arrived) return;
      if ((task.activity === 'barter' || task.activity === 'visit') && task.timer > 0) return;
      this.travelStep(sim, v);
      return;
    }

    const urgentNeed = v.thirst > 0.75 || v.hunger > 0.8;
    const busy = task.state !== 'IDLE' && task.state !== 'WANDERING';
    if (busy && !(urgentNeed && task.state === 'WORKING')) return;
    if (task.state === 'IDLE' && task.timer > 0 && !urgentNeed) return;
    if (task.state === 'WANDERING' && !task.arrived && !urgentNeed) return;
    this.chooseTask(sim, v);
  }

  private chooseTask(sim: Simulation, v: VillagerData): void {
    const village = sim.village(v.villageId);
    if (!village) return;
    const cfg = CONFIG.villager;
    const rng = sim.rng;

    const c = sim.state.culture;
    const now = sim.state.time;
    const rationing = c.decree?.kind === 'ration-water';
    if (v.thirst > (rationing ? 0.68 : cfg.thirstSeek)) {
      const well = sim.building(village.wellId);
      // Believers in the Forbidden Well walk to the river instead.
      const cursed = !!c.cursedWell && c.cursedWell.believers.includes(v.id);
      if (cursed) this.think_(v, 'alarm', 2);
      if (well && !well.destroyed && village.water >= 1 && !cursed) {
        this.goTo(sim, v, 'SEEKING_WATER', 'drink-well', well, 2.5);
      } else {
        this.goDrinkRiver(sim, v);
      }
      if (village.water < 10) this.think_(v, 'water');
      return;
    }
    if (v.hunger > cfg.hungerSeek) {
      const storage = sim.building(village.storageId);
      if (storage && !storage.destroyed && village.food >= 1) {
        this.goTo(sim, v, 'SEEKING_FOOD', 'eat', storage, 3);
      } else {
        this.forage(sim, v, village);
      }
      return;
    }
    if (sim.isNight && v.age > 3) {
      const home = sim.building(v.homeId);
      if (home && !home.destroyed) {
        this.goTo(sim, v, 'RESTING', 'rest', home, 999);
        return;
      }
    }

    // Culture-driven choices: picnics, royal naps, laziness.
    if (c.picnicUntil > now && c.picnickers.includes(v.id) && c.picnicSpot) {
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(1, 4.5);
      this.goToPoint(sim, v, 'IDLE', 'picnic', c.picnicSpot.x + Math.cos(a) * r, c.picnicSpot.z + Math.sin(a) * r, null, rng.range(14, 24));
      v.currentTask.faceX = c.picnicSpot.x;
      v.currentTask.faceZ = c.picnicSpot.z;
      this.think_(v, 'heart', 3);
      return;
    }
    if (c.decree?.kind === 'nap-day' && rng.chance(0.5)) {
      this.setIdle(v, rng.range(6, 10));
      this.think_(v, 'sleep', 5);
      return;
    }
    if (has(v, 'lazy') && rng.chance(0.25)) {
      this.setIdle(v, rng.range(5, 9));
      return;
    }

    // Repairs take priority for builders, and anyone may help occasionally.
    if (v.job === 'builder' || rng.chance(0.08)) {
      const damaged = this.findRepairTarget(sim, village);
      if (damaged) {
        this.goTo(sim, v, 'WORKING', 'repair', damaged, damaged.destroyed ? 14 : 8);
        return;
      }
    }

    const job = v.age < 12 ? 'idler' : v.job;
    if (job === 'farmer') {
      const farm = village.farmIds.map((id) => sim.building(id)).find((b) => b && !b.destroyed);
      if (farm) {
        const ox = rng.range(-3.5, 3.5);
        const oz = rng.range(-2.5, 2.5);
        const effort = has(v, 'ambitious') ? 1.25 : has(v, 'lazy') ? 0.7 : 1;
        this.goToPoint(sim, v, 'WORKING', 'farm', farm.x + ox, farm.z + oz, farm.id, rng.range(14, 24) * effort);
        return;
      }
    }
    if (job === 'miner' || job === 'fisher') {
      const ids = job === 'miner' ? village.quarryIds : village.fisheryIds;
      const site = ids.map((id) => sim.building(id)).find((b) => b && !b.destroyed);
      if (site) {
        const a = rng.range(0, Math.PI * 2);
        this.goToPoint(sim, v, 'WORKING', job === 'miner' ? 'mine' : 'fish', site.x + Math.cos(a) * (site.footprint + 0.6), site.z + Math.sin(a) * (site.footprint + 0.6), site.id, rng.range(10, 16) * (has(v, 'ambitious') ? 1.25 : has(v, 'lazy') ? 0.7 : 1));
        v.currentTask.faceX = site.x;
        v.currentTask.faceZ = site.z;
        return;
      }
    }
    if (job === 'woodcutter' || (job === 'builder' && village.wood < 40)) {
      const trees = sim.treesNear(village.centerX, village.centerZ, 36, this.nearTrees).filter(
        (t) => t.growth >= 1 && !t.charred && !t.burning && !t.golden && t.kind !== 'bush' && t.health > 0.5 && !sim.sacredSys.find('tree', t.id),
      );
      if (trees.length) {
        const tree = trees[Math.floor(rng.next() * trees.length)];
        const a = rng.range(0, Math.PI * 2);
        this.goToPoint(sim, v, 'WORKING', 'chop', tree.x + Math.cos(a) * 1.1, tree.z + Math.sin(a) * 1.1, tree.id, rng.range(9, 14));
        return;
      }
    }

    // Curiosity: inspect the strangest thing nearby.
    if (has(v, 'curious') && rng.chance(0.18)) {
      const odd = this.somethingOdd(sim, v);
      if (odd) {
        this.goToPoint(sim, v, 'IDLE', 'investigate', odd.x + rng.range(-2, 2), odd.z + rng.range(-2, 2), null, rng.range(3, 6));
        v.currentTask.faceX = odd.x;
        v.currentTask.faceZ = odd.z;
        this.think_(v, 'question', 4);
        return;
      }
    }
    // Believers visit their sacred place.
    if (v.religionId && rng.chance(has(v, 'devout') ? 0.4 : 0.22)) {
      const r = sim.state.religions.find((x) => x.id === v.religionId);
      const sacred = r ? sim.religion.sacredOf(r) : undefined;
      if (sacred) {
        const a = rng.range(0, Math.PI * 2);
        this.goToPoint(sim, v, 'PRAYING', 'pray-sacred', sacred.x + Math.cos(a) * 2.6, sacred.z + Math.sin(a) * 2.6, sim.state.sacred.indexOf(sacred), rng.range(5, 8));
        v.currentTask.faceX = sacred.x;
        v.currentTask.faceZ = sacred.z;
        this.think_(v, 'pray', 6);
        return;
      }
    }

    // Free time.
    const roll = c.silence ? Math.max(0.71, rng.next()) : rng.next(); // the Great Silence empties the shrine
    const shrine = sim.building(village.shrineId);
    if (roll < 0.3) {
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(4, village.radius - 4);
      this.goToPoint(sim, v, 'WANDERING', 'wander', village.centerX + Math.cos(a) * r, village.centerZ + Math.sin(a) * r, null, rng.range(1, 3));
    } else if (roll < 0.55) {
      const well = sim.building(village.wellId)!;
      const a = rng.range(0, Math.PI * 2);
      this.goToPoint(sim, v, 'IDLE', 'chat', well.x + Math.cos(a) * 3, well.z + Math.sin(a) * 3, null, rng.range(5, 10));
    } else if (roll < 0.7 && shrine && !shrine.destroyed && v.faith > 0.45) {
      this.goToShrine(sim, v, rng.range(5, 8));
    } else {
      this.setIdle(v, rng.range(2, 5));
      if (v.happiness < 0.35 || rng.chance(0.12)) this.think_(v, 'question', 3);
    }
  }

  private findRepairTarget(sim: Simulation, village: VillageData): BuildingData | null {
    let best: BuildingData | null = null;
    for (const b of sim.state.buildings) {
      if (b.villageId !== village.id) continue;
      if (sim.fire.fireOnBuilding(sim, b.id)) continue;
      const need = b.destroyed ? village.wood >= 20 : b.health < 80 && village.wood >= CONFIG.village.repairWood;
      if (!need) continue;
      const working = sim.state.villagers.filter(
        (o) => o.alive && o.currentTask.activity === 'repair' && o.currentTask.targetId === b.id,
      ).length;
      if (working >= 2) continue;
      if (!best || b.health < best.health) best = b;
    }
    return best;
  }

  // ---------------- actions ----------------

  private act(sim: Simulation, v: VillagerData, dt: number): void {
    const task = v.currentTask;
    // v0.4 local time (Time Warp, frost): scales walking and work, never the global step.
    const local = sim.effects.timeFactor(v.position.x, v.position.z);
    dt *= local;
    if (!task.arrived) {
      const speed = this.speedFor(v) * (sim.state.culture.upsideDownUntil > sim.state.time ? 0.8 : 1);
      if (this.walk(sim, v, speed * dt)) {
        task.arrived = true;
        if (task.faceX !== undefined && task.faceZ !== undefined) v.heading = Math.atan2(task.faceX - v.position.x, task.faceZ - v.position.z);
      }
      return;
    }
    if (task.state === 'RESTING') return;
    if (task.timer > 0) {
      task.timer -= dt;
      if (task.state === 'PRAYING') v.faith = clamp01(v.faith + 0.01 * dt);
      return;
    }
    // A bare idle pause has nothing to complete: wait for the next decision.
    if (task.state === 'IDLE' && task.activity === '') return;
    this.complete(sim, v);
  }

  private complete(sim: Simulation, v: VillagerData): void {
    const village = sim.village(v.villageId);
    const task = v.currentTask;
    if (!village) return this.setIdle(v, 1);
    if ((task.activity === 'repair' || task.activity === 'construct' || task.activity === 'construct-office' || task.activity === 'decorate') && (sim.effects.at('timewarp', v.position.x, v.position.z)?.factor ?? 1) > 1) {
      sim.bus.emit('CONSTRUCTION_IN_WARP', { villageId: village.id, kind: task.activity });
    }
    switch (task.activity) {
      case 'drink-well':
        if (village.water >= 1) {
          village.water -= 1;
          v.thirst = Math.max(0, v.thirst - 0.8);
        } else {
          this.goDrinkRiver(sim, v);
          return;
        }
        break;
      case 'drink-river':
        v.thirst = Math.max(0, v.thirst - 0.7);
        v.happiness = Math.max(0, v.happiness - 0.02);
        break;
      case 'eat':
        if (village.food >= 1) {
          village.food -= 1;
          v.hunger = Math.max(0, v.hunger - 0.75);
          v.happiness = clamp01(v.happiness + 0.02);
        } else {
          this.forage(sim, v, village);
          return;
        }
        break;
      case 'forage':
        v.hunger = Math.max(0, v.hunger - 0.35);
        break;
      case 'chop': {
        v.carry = { kind: 'wood', until: sim.state.time + 5 };
        const tree = task.targetId !== null ? sim.tree(task.targetId) : undefined;
        if (tree && !tree.charred && !tree.burning) {
          village.wood = Math.min(CONFIG.village.maxWood, village.wood + 4);
          tree.health = Math.max(0.45, tree.health - 0.12);
        }
        break;
      }
      case 'repair': {
        const b = task.targetId !== null ? sim.building(task.targetId) : undefined;
        if (b && b.destroyed && village.wood >= 20) {
          village.wood -= 20;
          b.destroyed = false;
          b.health = 45;
          if (b.type === 'farm') {
            b.cropGrowth = 0;
            b.cropHealth = 1;
          }
          sim.pathfinding.rebuildObstacles(sim.state.buildings);
          sim.notify('BUILDING REBUILT', 'good', `The villagers rebuilt the ${b.type}.`);
          sim.bus.emit('BUILDING_REPAIRED', { buildingId: b.id, type: b.type });
        } else if (b && !b.destroyed && b.health < 100 && village.wood >= CONFIG.village.repairWood) {
          village.wood -= CONFIG.village.repairWood;
          b.health = Math.min(100, b.health + CONFIG.village.repairAmount);
          sim.bus.emit('BUILDING_REPAIRED', { buildingId: b.id, type: b.type });
        }
        break;
      }
      case 'farm':
        v.carry = { kind: 'food', until: sim.state.time + 5 };
        v.happiness = clamp01(v.happiness + 0.02);
        break;
      case 'mine': {
        v.carry = { kind: 'stone', until: sim.state.time + 5 };
        const slow = sim.state.culture.upsideDownUntil > sim.state.time ? 0.65 : 1;
        village.stone = Math.min(CONFIG.civ.maxStock.stone, village.stone + 3 * slow);
        break;
      }
      case 'fish':
        v.carry = { kind: 'food', until: sim.state.time + 5 };
        // Fishing ignores drought but suffers in floods (the fish are everywhere, which is somehow worse).
        village.food = Math.min(CONFIG.village.maxFood, village.food + 2.6 * (village.floodActive ? 0.4 : 1));
        break;
      case 'decorate':
      case 'construct':
        sim.sacredSys.onWorkDone(v, task.activity, task.targetId);
        break;
      case 'construct-office':
        sim.culture.onOfficeWork(v);
        break;
      case 'pray-sacred': {
        const sacred = task.targetId !== null ? sim.state.sacred[task.targetId] : undefined;
        if (sacred) {
          sacred.visits++;
          sim.sacredSys.addSacredness(sacred, 0.05);
          if (v.religionId && (!sacred.religionId || sacred.religionId === v.religionId)) sim.bus.emit('SACRED_VISITED', { villagerId: v.id, sacredId: sacred.id, villageId: v.villageId });
        }
        v.faith = clamp01(v.faith + 0.03);
        break;
      }
      case 'travel':
        sim.civ.onArrive(v);
        if (v.currentTask.activity !== 'travel') return; // onArrive assigned the next activity
        break;
      case 'picnic':
        v.happiness = clamp01(v.happiness + 0.03);
        break;
      case 'investigate':
        sim.speech.say(v, INVESTIGATE_LINES[Math.floor(sim.state.time) % INVESTIGATE_LINES.length], 0);
        break;
      default:
        break;
    }
    if (task.state === 'FLEEING') {
      this.setIdle(v, 2);
      this.think_(v, 'alarm', 2);
      return;
    }
    this.setIdle(v, sim.rng.range(0.4, 1.5));
  }

  private speedFor(v: VillagerData): number {
    const base = v.currentTask.state === 'FLEEING' ? CONFIG.villager.runSpeed : CONFIG.villager.walkSpeed;
    const child = v.age < 12 ? 0.8 : 1;
    return base * child * (0.75 + v.health * 0.25);
  }

  /** Advance along the path; returns true on arrival. */
  private walk(sim: Simulation, v: VillagerData, distance: number): boolean {
    let remaining = distance;
    while (remaining > 0 && v.pathIndex < v.path.length) {
      const tx = v.path[v.pathIndex];
      const tz = v.path[v.pathIndex + 1];
      const dx = tx - v.position.x;
      const dz = tz - v.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.001) {
        const desired = Math.atan2(dx, dz);
        let diff = desired - v.heading;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        v.heading += diff * Math.min(1, 0.35);
      }
      if (d <= remaining) {
        v.position.x = tx;
        v.position.z = tz;
        remaining -= d;
        v.pathIndex += 2;
      } else {
        v.position.x += (dx / d) * remaining;
        v.position.z += (dz / d) * remaining;
        remaining = 0;
      }
    }
    v.position.y = sim.terrain.walkHeightAt(v.position.x, v.position.z);
    return v.pathIndex >= v.path.length;
  }

  // ---------------- travel (v0.3) ----------------

  /** Walk the current leg of a trip. Long routes cross the bridge; failures abandon the trip. */
  travelStep(sim: Simulation, v: VillagerData): void {
    const plan = v.travel;
    if (!plan || !v.alive) return;
    const target = sim.civ.travelTarget(v);
    if (!target) {
      sim.civ.onTravelFailed(v, 'no destination');
      return;
    }
    if (Math.hypot(target.x - v.position.x, target.z - v.position.z) < 1.5) {
      this.setTask(v, 'WANDERING', 'travel', target.x, target.z, null, 0);
      v.path = [];
      v.pathIndex = 0;
      v.currentTask.arrived = true;
      plan.tries = 0;
      return;
    }
    const ok = this.goToPoint(sim, v, 'WANDERING', 'travel', target.x, target.z, null, 0);
    if (ok) {
      plan.tries = 0;
      return;
    }
    plan.tries = (plan.tries ?? 0) + 1;
    if (plan.tries >= 3) sim.civ.onTravelFailed(v, 'no route');
  }

  // ---------------- task helpers ----------------

  // ---------------- culture hooks ----------------

  /** Generic task assignment used by culture systems (decorating, festivals, trials…). */
  assign(sim: Simulation, v: VillagerData, state: VillagerStateName, activity: string, x: number, z: number, targetId: number | null, timer: number, faceX?: number, faceZ?: number): boolean {
    if (!v.alive) return false;
    const ok = this.goToPoint(sim, v, state, activity, x, z, targetId, timer);
    if (ok) {
      v.currentTask.faceX = faceX;
      v.currentTask.faceZ = faceZ;
    }
    return ok;
  }

  /** Join a ritual: ring gatherings, dances around the site, or a slow procession loop. */
  attendRitual(sim: Simulation, v: VillagerData, ritual: RitualDefinition, x: number, z: number, index: number, count: number): void {
    const a0 = (index / Math.max(1, count)) * Math.PI * 2;
    const kneel = ritual.kind === 'gathering' || ritual.kind === 'offering' || ritual.kind === 'planting';
    const state: VillagerStateName = kneel ? 'PRAYING' : 'CELEBRATING';
    if (ritual.kind === 'procession' || ritual.kind === 'backwards') {
      this.setTask(v, state, 'ritual', x, z, null, 4);
      const pts: number[] = [];
      for (let k = 0; k <= 8; k++) {
        const a = a0 + (k / 8) * Math.PI * 2;
        const p = sim.pathfinding.nearestWalkable(x + Math.cos(a) * 5.5, z + Math.sin(a) * 5.5);
        if (p) pts.push(p.x, p.z);
      }
      const approach = sim.pathfinding.findPath(v.position.x, v.position.z, pts[0] ?? x, pts[1] ?? z) ?? [];
      v.path = [...approach, ...pts];
      v.pathIndex = 0;
      v.currentTask.faceX = x;
      v.currentTask.faceZ = z;
      this.think_(v, 'music', ritual.duration);
      return;
    }
    const r = ritual.kind === 'bonfire' ? 2.8 : 3.4;
    this.assign(sim, v, state, 'ritual', x + Math.cos(a0) * r, z + Math.sin(a0) * r, null, ritual.duration, x, z);
    this.think_(v, kneel ? 'pray' : 'music', ritual.duration);
  }

  /** Two villagers face off for a short public argument. */
  argue(sim: Simulation, a: VillagerData, b: VillagerData, x: number, z: number): void {
    this.assign(sim, a, 'IDLE', 'argue', x - 0.9, z, null, 7, x + 1, z);
    this.assign(sim, b, 'IDLE', 'argue', x + 0.9, z, null, 7, x - 1, z);
    this.think_(a, 'angry', 7);
    this.think_(b, 'angry', 7);
  }

  /** The strangest nearby thing for curious villagers: mutations and sacred objects. */
  private somethingOdd(sim: Simulation, v: VillagerData): { x: number; z: number } | null {
    let best: { x: number; z: number } | null = null;
    let bestD = 40;
    const consider = (x: number, z: number) => {
      const d = Math.hypot(x - v.position.x, z - v.position.z);
      if (d < bestD) {
        bestD = d;
        best = { x, z };
      }
    };
    for (const r of sim.state.rocks) if (r.walking || r.crowned) consider(r.x, r.z);
    for (const m of sim.state.mutations) {
      if (m.targetKind === 'tree') {
        const t = sim.tree(Number(m.targetId));
        if (t) consider(t.x, t.z);
      } else if (m.targetKind === 'villager' && m.targetId !== v.id) {
        const o = sim.villager(m.targetId);
        if (o && o.alive) consider(o.position.x, o.position.z);
      }
    }
    for (const s of sim.state.sacred) consider(s.x, s.z);
    return best;
  }

  private setTask(v: VillagerData, state: VillagerStateName, activity: string, x: number, z: number, targetId: number | null, timer: number): void {
    const t = v.currentTask;
    t.faceX = undefined;
    t.faceZ = undefined;
    t.state = state;
    t.activity = activity;
    t.targetX = x;
    t.targetZ = z;
    t.targetId = targetId;
    t.timer = timer;
    t.arrived = false;
  }

  setIdle(v: VillagerData, timer: number): void {
    this.setTask(v, 'IDLE', '', v.position.x, v.position.z, null, timer);
    v.path = [];
    v.pathIndex = 0;
    v.currentTask.arrived = true;
  }

  private goToPoint(sim: Simulation, v: VillagerData, state: VillagerStateName, activity: string, x: number, z: number, targetId: number | null, timer: number): boolean {
    this.setTask(v, state, activity, x, z, targetId, timer);
    const path = sim.pathfinding.findPath(v.position.x, v.position.z, x, z);
    if (!path) {
      if (Math.hypot(x - v.position.x, z - v.position.z) < 2.5) {
        v.path = [];
        v.pathIndex = 0;
        v.currentTask.arrived = true;
        return true;
      }
      this.setIdle(v, 2);
      this.think_(v, 'question', 2.5);
      return false;
    }
    v.path = path;
    v.pathIndex = 0;
    return true;
  }

  private goTo(sim: Simulation, v: VillagerData, state: VillagerStateName, activity: string, b: BuildingData, timer: number): boolean {
    const village = sim.village(v.villageId);
    // Approach from the village side so villagers gather at doors, not behind walls.
    const cx = village ? village.centerX : b.x;
    const cz = village ? village.centerZ : b.z;
    let dx = cx - b.x;
    let dz = cz - b.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.01) {
      dx = Math.cos(v.heading);
      dz = Math.sin(v.heading);
    } else {
      dx /= d;
      dz /= d;
    }
    const side = sim.rng.range(-0.6, 0.6);
    const r = b.footprint + 0.9;
    const x = b.x + (dx * Math.cos(side) - dz * Math.sin(side)) * r;
    const z = b.z + (dz * Math.cos(side) + dx * Math.sin(side)) * r;
    return this.goToPoint(sim, v, state, activity, x, z, b.id, timer);
  }

  private goToShrine(sim: Simulation, v: VillagerData, duration: number): boolean {
    const village = sim.village(v.villageId);
    const shrine = village ? sim.building(village.shrineId) : undefined;
    if (!shrine || shrine.destroyed) return false;
    const ok = this.goTo(sim, v, 'PRAYING', 'pray-shrine', shrine, duration);
    if (ok) this.think_(v, 'pray', duration + 6);
    return ok;
  }

  /** Send a villager to the shrine to deliver a prayer. Returns whether they set off. */
  deliverPrayer(sim: Simulation, v: VillagerData): boolean {
    return this.goToShrine(sim, v, 7);
  }

  private goDrinkRiver(sim: Simulation, v: VillagerData): void {
    const pts = sim.terrain.drinkPoints;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < pts.length; i += 2) {
      const d = Math.hypot(pts[i] - v.position.x, pts[i + 1] - v.position.z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0 || bestD > 70) {
      this.setIdle(v, 3);
      this.think_(v, 'water', 3);
      return;
    }
    this.goToPoint(sim, v, 'SEEKING_WATER', 'drink-river', pts[best], pts[best + 1], null, 3);
    this.think_(v, 'water', 4);
  }

  private forage(sim: Simulation, v: VillagerData, village: VillageData): void {
    const bushes = sim.treesNear(village.centerX, village.centerZ, 40, this.nearTrees).filter((t) => !t.charred && !t.burning && t.growth > 0.8);
    this.think_(v, 'food', 4);
    if (!bushes.length) {
      this.setIdle(v, 3);
      return;
    }
    const t = bushes[Math.floor(sim.rng.next() * bushes.length)];
    this.goToPoint(sim, v, 'SEEKING_FOOD', 'forage', t.x + 1, t.z + 1, t.id, 4);
  }

  flee(sim: Simulation, v: VillagerData, fromX: number, fromZ: number): void {
    let dx = v.position.x - fromX;
    let dz = v.position.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    const tx = v.position.x + dx * 13 + sim.rng.range(-3, 3);
    const tz = v.position.z + dz * 13 + sim.rng.range(-3, 3);
    const p = sim.pathfinding.nearestWalkable(tx, tz) ?? { x: v.position.x, z: v.position.z };
    this.setTask(v, 'FLEEING', 'flee', p.x, p.z, null, 1.5);
    v.path = sim.pathfinding.findPath(v.position.x, v.position.z, p.x, p.z, 1500) ?? [p.x, p.z];
    v.pathIndex = 0;
    v.fear = clamp01(v.fear + 0.15);
    this.think_(v, 'alarm', 4);
  }

  pray(sim: Simulation, v: VillagerData, atX: number, atZ: number, duration: number): void {
    if (!v.alive || v.currentTask.state === 'FLEEING') return;
    this.setTask(v, 'PRAYING', 'pray-sign', v.position.x, v.position.z, null, duration);
    v.path = [];
    v.pathIndex = 0;
    v.currentTask.arrived = true;
    v.heading = Math.atan2(atX - v.position.x, atZ - v.position.z);
    v.faith = clamp01(v.faith + 0.05);
    this.think_(v, 'pray', duration);
    void sim;
  }

  celebrate(sim: Simulation, village: VillageData, reason: string): void {
    let count = 0;
    for (const v of sim.state.villagers) {
      if (!v.alive || v.villageId !== village.id) continue;
      const st = v.currentTask.state;
      if (st === 'FLEEING' || (st === 'RESTING' && v.currentTask.arrived)) continue;
      if (Math.hypot(v.position.x - village.centerX, v.position.z - village.centerZ) > village.radius + 14) continue;
      this.setTask(v, 'CELEBRATING', 'celebrate', v.position.x, v.position.z, null, sim.rng.range(3.5, 5.5));
      v.path = [];
      v.pathIndex = 0;
      v.currentTask.arrived = true;
      v.happiness = clamp01(v.happiness + 0.05);
      v.fear = Math.max(0, v.fear - 0.1);
      this.think_(v, 'heart', 4);
      count++;
    }
    if (count) sim.bus.emit('VILLAGERS_CELEBRATE', { villageId: village.id, x: village.centerX, z: village.centerZ, reason });
  }

  kill(sim: Simulation, v: VillagerData, cause: string, byPlayer: boolean): void {
    if (!v.alive) return;
    v.alive = false;
    v.health = 0;
    v.causeOfDeath = cause;
    v.deadTime = 0;
    v.path = [];
    v.pathIndex = 0;
    this.setTask(v, 'DEAD', 'dead', v.position.x, v.position.z, null, 0);
    v.currentTask.arrived = true;
    v.thought = null;
    sim.bus.emit('VILLAGER_DIED', { villagerId: v.id, name: v.name, cause, x: v.position.x, z: v.position.z, byPlayer });
  }

  private think_(v: VillagerData, icon: ThoughtIcon, seconds = 3): void {
    v.thought = icon;
    v.thoughtTimer = seconds;
  }

  private nearestFire(sim: Simulation, x: number, z: number, radius: number) {
    let best = null;
    let bestD = radius;
    for (const f of sim.state.fires) {
      const d = Math.hypot(f.x - x, f.z - z);
      if (d < bestD && f.intensity > 0.2) {
        bestD = d;
        best = f;
      }
    }
    return best;
  }

  /** Nearby villagers helper for powers. */
  villagersAround(sim: Simulation, x: number, z: number, r: number): VillagerData[] {
    return sim.villagersNear(x, z, r, this.near);
  }
}

const INVESTIGATE_LINES = ['WHAT IS THAT?', 'HUH.', 'I HAVE QUESTIONS.', 'SHOULD WE WORSHIP THIS?', 'THIS SEEMS ILLEGAL.'];
