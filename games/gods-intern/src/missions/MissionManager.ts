import { CONFIG } from '../core/Config';
import type { PrayerData, VillageData } from '../core/types';
import type { Simulation } from '../simulation/SimulationManager';
import { MISSIONS, type MissionDefinition } from './MissionDefinitions';
import { PrayerGenerator } from './PrayerGenerator';

/**
 * Generates prayers from simulation problems, tracks objective progress,
 * resolves completion/failure, and applies rewards. One active prayer per
 * type per village; a cooldown prevents immediate re-asks; at most 3 active.
 */
export class MissionManager {
  private timer = 0;
  readonly generator = new PrayerGenerator();
  private readonly defs = new Map<string, MissionDefinition>();
  /** Disable automatic generation (tutorial controls the first prayer). */
  autoGenerate = true;

  constructor(private readonly sim: Simulation) {
    for (const def of MISSIONS) this.defs.set(def.type, def);
    sim.bus.on('TREE_PLANTED', ({ x, z, byPlayer }) => {
      if (!byPlayer) return;
      for (const p of sim.state.prayers) {
        if (p.status !== 'active' || p.type !== 'GREEN') continue;
        const v = sim.village(p.villageId);
        if (v && Math.hypot(x - v.centerX, z - v.centerZ) < v.radius + 16) p.data.planted = (p.data.planted ?? 0) + 1;
      }
    });
  }

  get active(): PrayerData[] {
    return this.sim.state.prayers.filter((p) => p.status === 'active');
  }

  definition(type: string): MissionDefinition | undefined {
    return this.defs.get(type);
  }

  hasActive(type: string, villageId: string): boolean {
    return this.sim.state.prayers.some((p) => p.status === 'active' && p.type === type && p.villageId === villageId);
  }

  /** Create a prayer if not duplicated and below the active cap. Returns null when refused. */
  create(type: string, village: VillageData, force = false): PrayerData | null {
    const def = this.defs.get(type);
    if (!def) return null;
    const s = this.sim.state;
    if (this.hasActive(type, village.id)) return null;
    if (!force && this.active.length >= CONFIG.prayers.maxActive) return null;
    const key = `${type}:${village.id}`;
    if (!force && (s.prayerCooldowns[key] ?? 0) > s.time) return null;
    const prayer = this.generator.create(this.sim, def, village);
    s.prayers.push(prayer);
    const messenger = this.generator.pickMessenger(this.sim, village);
    if (messenger && this.sim.ai.deliverPrayer(this.sim, messenger)) {
      this.sim.bus.emit('SPEECH', { villagerId: messenger.id, text: def.plea, duration: 10 });
    }
    this.sim.bus.emit('PRAYER_CREATED', { prayer });
    return prayer;
  }

  update(dt: number): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.5;
    const s = this.sim.state;

    for (const prayer of s.prayers) {
      if (prayer.status !== 'active') continue;
      const def = this.defs.get(prayer.type);
      const village = this.sim.village(prayer.villageId);
      if (!def || !village) continue;
      prayer.progress = def.progress(this.sim, village, prayer);
      if (def.complete(this.sim, village, prayer)) {
        this.resolve(prayer, 'completed');
        s.energy = Math.min(CONFIG.energy.max, s.energy + prayer.reward);
        this.sim.ai.celebrate(this.sim, village, `prayer-${prayer.type}`);
        this.sim.notify('PRAYER ANSWERED!', 'good', `${prayer.title} · +${prayer.reward} energy`);
        this.sim.bus.emit('PRAYER_COMPLETED', { prayer });
      } else if ((prayer.expiresAt !== undefined && s.time > prayer.expiresAt) || def.failed?.(this.sim, village, prayer)) {
        this.resolve(prayer, 'failed');
        this.sim.notify('PRAYER IGNORED', 'bad', `${prayer.title} · God is disappointed.`);
        this.sim.bus.emit('PRAYER_FAILED', { prayer });
      }
    }

    // Keep resolved history short.
    if (s.prayers.length > 12) {
      s.prayers = s.prayers.filter((p) => p.status === 'active' || s.time - (p.resolvedAt ?? 0) < 20);
    }

    if (!this.autoGenerate) return;
    for (const village of s.villages) {
      if (village.population === 0) continue;
      // Highest-priority problems first so urgent prayers win the cap.
      const ordered = [...this.defs.values()].sort((a, b) => b.priority - a.priority);
      for (const def of ordered) {
        if (this.hasActive(def.type, village.id)) continue;
        if (def.trigger(this.sim, village)) this.create(def.type, village);
      }
    }
  }

  private resolve(prayer: PrayerData, status: 'completed' | 'failed'): void {
    prayer.status = status;
    prayer.resolvedAt = this.sim.state.time;
    this.sim.state.prayerCooldowns[`${prayer.type}:${prayer.villageId}`] = this.sim.state.time + CONFIG.prayers.repeatCooldown;
  }
}
