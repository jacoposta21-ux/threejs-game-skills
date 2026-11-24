import { CONFIG } from '../core/Config';
import type { DeceasedRecord, VillagerData } from '../core/types';
import type { Simulation } from '../simulation/SimulationManager';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Possession: the player steers one villager for a short time. The villager's
 * autonomous AI is suspended (VillagerAI skips them), movement uses the same
 * walkability grid as everyone else, and on exit the AI simply resumes.
 * Save rule: an active possession is saved; on load it continues for its remaining time.
 */
export class PossessionSystem {
  private bumpCooldown = 0;
  private readonly near: VillagerData[] = [];

  constructor(private readonly sim: Simulation) {
    sim.bus.on('VILLAGER_DIED', (e) => {
      if (sim.state.possession?.villagerId === e.villagerId) this.end('the body stopped cooperating');
    });
  }

  get villager(): VillagerData | undefined {
    const p = this.sim.state.possession;
    return p ? this.sim.villager(p.villagerId) : undefined;
  }

  start(v: VillagerData): void {
    const sim = this.sim;
    const t = sim.state.time;
    if (v.travel) sim.civ.onTravelFailed(v, 'possessed');
    sim.state.possession = { villagerId: v.id, until: t + CONFIG.powers.possession.duration, dirX: 0, dirZ: 0, visited: [v.villageId], bumps: 0, startedAt: t };
    sim.ai.setIdle(v, 999);
    v.currentTask.activity = 'possessed';
    v.lift = 0;
    sim.speech.say(v, 'WHO IS DRIVING?!', 3, 3);
    sim.bus.emit('POSSESSION_STARTED', { villagerId: v.id });
  }

  steer(dirX: number, dirZ: number): void {
    const p = this.sim.state.possession;
    if (!p) return;
    const d = Math.hypot(dirX, dirZ);
    p.dirX = d > 1 ? dirX / d : dirX;
    p.dirZ = d > 1 ? dirZ / d : dirZ;
  }

  /** Contextual action near the possessed villager. Returns what happened (for UI), or null. */
  interact(): string | null {
    const sim = this.sim;
    const v = this.villager;
    if (!v) return null;
    const sacred = sim.sacredSys.nearest(v.position.x, v.position.z, 5);
    if (sacred) {
      sacred.visits++;
      sim.sacredSys.addSacredness(sacred, 0.1);
      v.faith = clamp01(v.faith + 0.05);
      sim.ai.pray(sim, v, sacred.x, sacred.z, 3);
      v.currentTask.activity = 'possessed';
      sim.bus.emit('SACRED_VISITED', { villagerId: v.id, sacredId: sacred.id, villageId: v.villageId });
      return `Prayed at ${sacred.label}`;
    }
    const village = sim.nearestVillage(v.position.x, v.position.z).village;
    const well = village ? sim.building(village.wellId) : undefined;
    if (village && well && !well.destroyed && Math.hypot(well.x - v.position.x, well.z - v.position.z) < well.footprint + 2 && village.water >= 1) {
      village.water -= 1;
      v.thirst = Math.max(0, v.thirst - 0.8);
      sim.speech.say(v, 'REFRESHING. VERY MORTAL.', 1);
      return 'Drank from the well';
    }
    const other = sim.villagersNear(v.position.x, v.position.z, 3, this.near).find((o) => o.id !== v.id);
    if (other) {
      sim.speech.say(v, ['HELLO, FELLOW HUMAN.', 'I ALSO HAVE KNEES.', 'NICE WEATHER. I WOULD KNOW.'][Math.floor(sim.state.time) % 3], 2);
      sim.speech.say(other, 'YOU SEEM… DIFFERENT TODAY.', 1, 3);
      other.currentTask.faceX = v.position.x;
      other.currentTask.faceZ = v.position.z;
      return `Chatted with ${other.name.split(' ')[0]}`;
    }
    sim.speech.say(v, 'I AM DOING A NORMAL VILLAGER THING.', 1);
    return null;
  }

  end(reason = 'time is up'): void {
    const sim = this.sim;
    const p = sim.state.possession;
    if (!p) return;
    const v = sim.villager(p.villagerId);
    sim.state.possession = null;
    if (v && v.alive) {
      sim.ai.setIdle(v, 1.5);
      v.fear = clamp01(v.fear + 0.1);
      v.thought = 'question';
      v.thoughtTimer = 4;
      sim.speech.say(v, 'WHERE AM I? WHY AM I HERE?', 2);
    }
    void reason;
    sim.bus.emit('POSSESSION_ENDED', { villagerId: p.villagerId, visited: p.visited });
  }

  update(dt: number): void {
    const sim = this.sim;
    const p = sim.state.possession;
    if (!p) return;
    const v = sim.villager(p.villagerId);
    if (!v || !v.alive) return this.end('lost');
    if (sim.state.time >= p.until) return this.end();
    v.currentTask.activity = v.currentTask.state === 'PRAYING' ? v.currentTask.activity : 'possessed';
    if (v.currentTask.state === 'PRAYING' && v.currentTask.timer > 0) {
      v.currentTask.timer -= dt;
      return;
    }
    if (v.currentTask.state === 'PRAYING') {
      sim.ai.setIdle(v, 999);
      v.currentTask.activity = 'possessed';
    }
    this.bumpCooldown -= dt;
    if (!p.dirX && !p.dirZ) return;
    const speed = CONFIG.villager.walkSpeed * 1.35 * sim.effects.timeFactor(v.position.x, v.position.z);
    const nx = v.position.x + p.dirX * speed * dt;
    const nz = v.position.z + p.dirZ * speed * dt;
    v.heading = Math.atan2(p.dirX, p.dirZ);
    // Blocked by walls and buildings, but always allowed to step *away* from one
    // (villagers often stand inside a building's footprint radius, e.g. at the well).
    const b = sim.buildingAt(nx, nz, 0.2);
    const escaping = !!b && Math.hypot(nx - b.x, nz - b.z) > Math.hypot(v.position.x - b.x, v.position.z - b.z);
    const walkable = sim.pathfinding.isWalkable(nx, nz) || (!sim.pathfinding.isWalkable(v.position.x, v.position.z) && sim.terrain.isLand(nx, nz));
    if (walkable && (!b || escaping)) {
      v.position.x = nx;
      v.position.z = nz;
      v.position.y = sim.terrain.walkHeightAt(nx, nz);
    } else if (this.bumpCooldown <= 0) {
      this.bumpCooldown = 0.6;
      p.bumps++;
      if (p.bumps % 4 === 0) {
        const witness = sim.villagersNear(v.position.x, v.position.z, 10, this.near).find((o) => o.id !== v.id);
        if (witness) sim.speech.say(witness, `${v.name.split(' ')[0].toUpperCase()} HAS BEEN ACTING STRANGELY SINCE THEY STARTED WALKING INTO WALLS.`, 2, 4);
      }
    }
    const { village, distance } = sim.nearestVillage(v.position.x, v.position.z);
    if (village && distance < village.radius && !p.visited.includes(village.id)) {
      p.visited.push(village.id);
      sim.bus.emit('POSSESSED_VISIT', { villagerId: v.id, villageId: village.id });
    }
  }
}

/**
 * Resurrection: a bounded graveyard of recently deceased villagers (full records,
 * so the same individual returns: name, traits, memories, faith, village, mutation).
 * Save rule: graves are saved; they expire after `graveTtl` seconds.
 */
export class ResurrectionSystem {
  constructor(private readonly sim: Simulation) {
    sim.bus.on('VILLAGER_DIED', (e) => this.record(e.villagerId, e.cause));
  }

  private record(id: string, cause: string): void {
    const sim = this.sim;
    const v = sim.villager(id);
    if (!v) return;
    const g = sim.state.graveyard;
    const copy = JSON.parse(JSON.stringify(v)) as VillagerData;
    g.push({ villager: copy, diedAt: sim.state.time, x: v.position.x, z: v.position.z, cause });
    this.prune();
  }

  prune(): void {
    const s = this.sim.state;
    const ttl = CONFIG.powers.resurrection.graveTtl;
    s.graveyard = s.graveyard.filter((g) => s.time - g.diedAt < ttl);
    while (s.graveyard.length > CONFIG.powers.resurrection.maxGraves) s.graveyard.shift();
  }

  graveNear(x: number, z: number, radius: number): DeceasedRecord | null {
    this.prune();
    let best: DeceasedRecord | null = null;
    let bestD = radius;
    for (const g of this.sim.state.graveyard) {
      const d = Math.hypot(g.x - x, g.z - z);
      if (d <= bestD) [best, bestD] = [g, d];
    }
    return best;
  }

  /** Restore the original individual. Never duplicates: an alive villager with that id blocks it. */
  revive(g: DeceasedRecord): VillagerData | null {
    const sim = this.sim;
    const s = sim.state;
    s.graveyard = s.graveyard.filter((x) => x !== g);
    const id = g.villager.id;
    const existing = sim.villager(id);
    if (existing?.alive) return null;
    let v: VillagerData;
    if (existing) {
      v = existing; // still in the world (recently fallen): revive in place
    } else {
      v = JSON.parse(JSON.stringify(g.villager)) as VillagerData;
      s.villagers.push(v);
    }
    const spot = sim.pathfinding.nearestWalkable(g.x, g.z) ?? { x: g.x, z: g.z };
    v.alive = true;
    v.health = 0.7;
    v.hunger = 0.3;
    v.thirst = 0.3;
    v.fear = 0.2;
    v.deadTime = 0;
    v.causeOfDeath = null;
    v.resurrected = true;
    v.travel = null;
    v.lift = 0;
    v.position.x = spot.x;
    v.position.z = spot.z;
    v.position.y = sim.terrain.walkHeightAt(spot.x, spot.z);
    v.path = [];
    v.pathIndex = 0;
    const village = sim.village(v.villageId) ?? s.villages[0];
    v.villageId = village.id;
    const home = sim.building(v.homeId);
    if (!home || home.destroyed || home.villageId !== village.id) v.homeId = village.houseIds.find((h) => !sim.building(h)?.destroyed) ?? village.houseIds[0];
    sim.rebuildIndexes();
    sim.ai.setIdle(v, 3);
    // Faith returns with them (if it still exists).
    const r = v.religionId ? s.religions.find((x) => x.id === v.religionId && x.active) : undefined;
    if (r) {
      if (!r.followers.includes(v.id)) r.followers.push(v.id);
      r.influence = Math.min(1, r.influence + 0.15);
      v.title = 'Returned Prophet';
      v.faith = 1;
      sim.combos.trigger('second-coming', v.position.x, v.position.z);
    } else if (v.religionId) v.religionId = null;
    const first = v.name.split(' ')[0].toUpperCase();
    sim.notify(`${first} HAS RETURNED FROM THE DEAD AND WOULD LIKE THEIR JOB BACK.`, 'culture', `Cause of the brief absence: ${g.cause}. ${village.name} is not sure how to feel.`, 2);
    sim.speech.say(v, 'DID ANYONE FEED MY GOAT?', 3, 4);
    for (const o of sim.villagersNear(v.position.x, v.position.z, 12, [])) {
      if (o.id === v.id) continue;
      if (o.traits.includes('devout') || o.traits.includes('superstitious')) sim.ai.pray(sim, o, v.position.x, v.position.z, 4);
      else if (o.traits.includes('skeptical')) {
        o.thought = 'question';
        o.thoughtTimer = 4;
      }
    }
    sim.memory.record('resurrection', v.position.x, v.position.z, { impact: 0.9, radius: 26 });
    sim.history.add(`${v.name} Came Back`, `${v.name} of ${village.name} was ${g.cause === 'meteor' ? 'flattened by a meteor' : `lost to ${g.cause}`} and then, inexplicably, was not.`, { kind: 'miracle', villageId: village.id, x: v.position.x, z: v.position.z });
    sim.bus.emit('VILLAGER_RESURRECTED', { villagerId: v.id, name: v.name, x: v.position.x, z: v.position.z });
    return v;
  }
}
