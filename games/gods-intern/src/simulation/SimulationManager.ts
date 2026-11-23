import { CONFIG } from '../core/Config';
import { EventBus, type NotifyKind } from '../core/EventBus';
import { Rng } from '../core/Rng';
import { SpatialGrid } from '../core/SpatialGrid';
import type { BuildingData, GameStateData, TreeData, VillageData, VillagerData } from '../core/types';
import { Pathfinding } from '../ai/Pathfinding';
import { NeedsSystem } from '../ai/NeedsSystem';
import { VillagerAI } from '../ai/VillagerAI';
import { MissionManager } from '../missions/MissionManager';
import { PowerManager } from '../powers/PowerManager';
import { TerrainData } from '../world/TerrainGen';
import { createInitialState, generateRocks } from '../world/WorldGen';
import { CultureSystem } from '../culture/CultureSystem';
import { HistoryBook } from '../culture/History';
import { MemorySystem } from '../culture/MemorySystem';
import { ReligionSystem } from '../culture/ReligionSystem';
import { SacredSystem } from '../culture/SacredSystem';
import { SpeechDirector } from '../culture/Speech';
import { SURREAL_EVENTS } from '../culture/SurrealEvents';
import { migrateState } from '../persistence/Migrations';
import type { TreeKind } from '../core/types';
import { ConsequenceSystem } from './ConsequenceSystem';
import { EnvironmentSystem } from './EnvironmentSystem';
import { FaithSystem } from './FaithSystem';
import { FireSystem } from './FireSystem';
import { VillageSystem } from './VillageSystem';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Owns the logical world and advances it with a fixed timestep. Contains no
 * DOM or Three.js code so it runs identically in the browser and in tests.
 */
export class Simulation {
  readonly bus = new EventBus();
  readonly terrain: TerrainData;
  state: GameStateData;
  rng: Rng;
  readonly treeGrid = new SpatialGrid(CONFIG.world.size, 8);
  readonly villagerGrid = new SpatialGrid(CONFIG.world.size, 8);
  readonly pathfinding: Pathfinding;
  readonly environment = new EnvironmentSystem();
  readonly fire = new FireSystem();
  readonly needs = new NeedsSystem();
  readonly ai = new VillagerAI();
  readonly villagesSys = new VillageSystem();
  readonly faith = new FaithSystem();
  readonly missions: MissionManager;
  readonly consequences: ConsequenceSystem;
  readonly powers: PowerManager;
  // ---- v0.2 culture layer ----
  readonly speech: SpeechDirector;
  readonly history: HistoryBook;
  readonly memory: MemorySystem;
  readonly sacredSys: SacredSystem;
  readonly religion: ReligionSystem;
  readonly surreal: ConsequenceSystem;
  readonly culture: CultureSystem;
  /** Sandbox setting; not part of saved world state. */
  unlimitedEnergy = false;
  /** Rolling wind direction used by fire spread. */
  windAngle = 0.6;
  readonly scratch: number[] = [];
  private villagerIndex = new Map<string, number>();

  constructor(seed: number, state?: GameStateData) {
    this.terrain = new TerrainData(seed);
    this.state = state ? migrateState(state) : createInitialState(seed, this.terrain);
    this.ensureWorldFeatures();
    this.rng = new Rng(this.state.rngState);
    this.pathfinding = new Pathfinding(this.terrain);
    // Order matters: memories are recorded before beliefs react, and beliefs
    // before the surreal event rules that build on them.
    this.speech = new SpeechDirector(this);
    this.history = new HistoryBook(this);
    this.memory = new MemorySystem(this);
    this.sacredSys = new SacredSystem(this);
    this.religion = new ReligionSystem(this);
    this.missions = new MissionManager(this);
    this.consequences = new ConsequenceSystem(this);
    this.surreal = new ConsequenceSystem(this, SURREAL_EVENTS);
    this.culture = new CultureSystem(this);
    this.powers = new PowerManager(this);
    this.faith.attach(this);
    this.rebuildIndexes();
  }

  /** Swap in a different saved state for the same seed (load game). */
  replaceState(state: GameStateData): void {
    this.state = migrateState(state);
    this.ensureWorldFeatures();
    this.rng = new Rng(state.rngState);
    this.rebuildIndexes();
  }

  /** Fill terrain-dependent data missing from older saves (v0.1 has no rock entities). */
  private ensureWorldFeatures(): void {
    if (!this.state.rocks.length) this.state.rocks = generateRocks(this.terrain, this.state.seed);
  }

  rebuildIndexes(): void {
    this.treeGrid.clear();
    for (const tree of this.state.trees) if (!tree.removed) this.treeGrid.insert(tree.id, tree.x, tree.z);
    this.pathfinding.rebuildObstacles(this.state.buildings);
    this.reindexVillagers();
  }

  private reindexVillagers(): void {
    this.villagerIndex.clear();
    this.villagerGrid.clear();
    this.state.villagers.forEach((v, i) => {
      this.villagerIndex.set(v.id, i);
      if (v.alive) this.villagerGrid.insert(i, v.position.x, v.position.z);
    });
  }

  get timeOfDay(): number {
    return (this.state.time / CONFIG.time.dayLength) % 1;
  }

  get day(): number {
    return Math.floor(this.state.time / CONFIG.time.dayLength) + 1;
  }

  get isNight(): boolean {
    const t = this.timeOfDay;
    return t > CONFIG.time.nightStart || t < CONFIG.time.morning;
  }

  step(dt: number): void {
    const s = this.state;
    s.time += dt;
    if (this.unlimitedEnergy) s.energy = CONFIG.energy.max;
    else s.energy = Math.min(CONFIG.energy.max, s.energy + CONFIG.energy.regen * dt);
    for (const key of Object.keys(s.cooldowns) as Array<keyof typeof s.cooldowns>) {
      s.cooldowns[key] = Math.max(0, s.cooldowns[key] - dt);
    }
    this.windAngle += dt * 0.01;

    this.environment.update(this, dt);
    this.fire.update(this, dt);
    this.reindexVillagers();
    this.needs.update(this, dt);
    this.ai.update(this, dt);
    this.villagesSys.update(this, dt);
    this.faith.update(this, dt);
    this.missions.update(dt);
    this.consequences.update(dt);
    this.culture.update(dt);
    this.surreal.update(dt);
    this.pruneDead();
    s.rngState = this.rng.state;
  }

  private pruneDead(): void {
    const before = this.state.villagers.length;
    this.state.villagers = this.state.villagers.filter((v) => v.alive || v.deadTime < 30);
    if (this.state.villagers.length !== before) this.reindexVillagers();
  }

  // ---------- lookups ----------

  village(id: string): VillageData | undefined {
    return this.state.villages.find((v) => v.id === id);
  }

  building(id: number): BuildingData | undefined {
    return this.state.buildings[id];
  }

  tree(id: number): TreeData | undefined {
    return this.state.trees[id];
  }

  villager(id: string): VillagerData | undefined {
    const index = this.villagerIndex.get(id);
    return index === undefined ? undefined : this.state.villagers[index];
  }

  nearestVillage(x: number, z: number): { village: VillageData | null; distance: number } {
    let best: VillageData | null = null;
    let bestD = Infinity;
    for (const v of this.state.villages) {
      const d = Math.hypot(v.centerX - x, v.centerZ - z);
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
    return { village: best, distance: bestD };
  }

  villagersNear(x: number, z: number, radius: number, out: VillagerData[]): VillagerData[] {
    out.length = 0;
    this.villagerGrid.query(x, z, radius, this.scratch);
    const r2 = radius * radius;
    for (const index of this.scratch) {
      const v = this.state.villagers[index];
      if (!v || !v.alive) continue;
      const dx = v.position.x - x;
      const dz = v.position.z - z;
      if (dx * dx + dz * dz <= r2) out.push(v);
    }
    return out;
  }

  treesNear(x: number, z: number, radius: number, out: TreeData[]): TreeData[] {
    out.length = 0;
    this.treeGrid.query(x, z, radius, this.scratch);
    const r2 = radius * radius;
    for (const index of this.scratch) {
      const t = this.state.trees[index];
      if (!t || t.removed) continue;
      const dx = t.x - x;
      const dz = t.z - z;
      if (dx * dx + dz * dz <= r2) out.push(t);
    }
    return out;
  }

  buildingAt(x: number, z: number, pad = 0): BuildingData | null {
    for (const b of this.state.buildings) {
      if (Math.hypot(b.x - x, b.z - z) < b.footprint + pad) return b;
    }
    return null;
  }

  // ---------- cells ----------

  cellIndex(x: number, z: number): number {
    const n = CONFIG.cells.count;
    const half = CONFIG.world.size / 2;
    const cx = Math.min(n - 1, Math.max(0, Math.floor((x + half) / CONFIG.cells.size)));
    const cz = Math.min(n - 1, Math.max(0, Math.floor((z + half) / CONFIG.cells.size)));
    return cz * n + cx;
  }

  moistureAt(x: number, z: number): number {
    return this.state.moisture[this.cellIndex(x, z)];
  }

  floodAt(x: number, z: number): number {
    return this.state.flood[this.cellIndex(x, z)];
  }

  // ---------- shared mutations ----------

  nextId(): number {
    return this.state.nextId++;
  }

  addApproval(delta: number, reason: string): void {
    if (delta === 0) return;
    const before = this.state.approval;
    this.state.approval = Math.min(100, Math.max(0, before + delta));
    const applied = this.state.approval - before;
    if (Math.abs(applied) > 0.001) this.bus.emit('APPROVAL_CHANGED', { value: this.state.approval, delta: applied, reason });
  }

  addChaos(delta: number, reason: string): void {
    if (delta === 0) return;
    const before = this.state.chaos;
    this.state.chaos = Math.min(100, Math.max(0, before + delta));
    const applied = this.state.chaos - before;
    if (Math.abs(applied) > 0.001) this.bus.emit('CHAOS_CHANGED', { value: this.state.chaos, delta: applied, reason });
  }

  addVillageFaith(village: VillageData, delta: number): void {
    for (const v of this.state.villagers) {
      if (v.alive && v.villageId === village.id) v.faith = clamp01(v.faith + delta);
    }
    const before = village.faith;
    village.faith = clamp01(village.faith + delta);
    this.bus.emit('FAITH_CHANGED', { villageId: village.id, faith: village.faith, delta: village.faith - before });
  }

  /** Player-facing notification. Priority: 0 minor … 3 critical (drives the UI queue). */
  notify(text: string, kind: NotifyKind, sub?: string, priority = 1): void {
    this.bus.emit('NOTIFY', { text, kind, sub, priority });
  }

  /** God messages are rate-limited; priority ≥ 3 bypasses the cooldown. */
  godMessage(text: string, priority = 1): boolean {
    if (priority < 3 && this.state.time - this.state.lastGodMessage < CONFIG.godMessageCooldown) return false;
    this.state.lastGodMessage = this.state.time;
    this.bus.emit('GOD_MESSAGE', { text, priority });
    return true;
  }

  /** Remember a timestamp under a key for "N times within T seconds" conditions. */
  remember(key: string): void {
    const list = (this.state.recent[key] ??= []);
    list.push(this.state.time);
    if (list.length > 20) list.shift();
  }

  recentCount(key: string, window: number): number {
    const list = this.state.recent[key];
    if (!list) return 0;
    const since = this.state.time - window;
    let count = 0;
    for (const t of list) if (t >= since) count++;
    return count;
  }

  /** Spawn a tree (used by rituals and decrees). Returns null if the spot is unsuitable. */
  plantTree(x: number, z: number, byPlayer: boolean, kind?: TreeKind): TreeData | null {
    if (!this.terrain.isLand(x, z) || this.terrain.slopeAt(x, z) > 1.1 || this.buildingAt(x, z, 0.8)) return null;
    if (this.state.trees.length >= CONFIG.trees.maxTrees) return null;
    if (this.treesNear(x, z, CONFIG.trees.minSpacing, []).length) return null;
    const tree: TreeData = {
      id: this.state.trees.length,
      kind: kind ?? (this.rng.next() < 0.3 ? 'bush' : 'oak'),
      x,
      z,
      growth: 0.05,
      growRate: 1 / 8,
      health: 1,
      burning: false,
      charred: false,
      charredTime: 0,
      byPlayer,
      scale: this.rng.range(0.85, 1.15),
      rot: this.rng.range(0, Math.PI * 2),
      removed: false,
    };
    this.state.trees.push(tree);
    this.treeGrid.insert(tree.id, x, z);
    this.bus.emit('TREE_PLANTED', { treeId: tree.id, x, z, byPlayer });
    return tree;
  }

  addVillager(v: VillagerData): void {
    this.state.villagers.push(v);
    this.reindexVillagers();
  }
}
