import type { Simulation } from '../simulation/SimulationManager';

export interface ComboDefinition {
  id: string;
  name: string;
  powers: string;
  text: string;
  xp: number;
}

/** Power combinations. Each is detected from real interactions in the simulation. */
export const COMBOS: ComboDefinition[] = [
  { id: 'rain-fire', name: 'Sauna Diplomacy', powers: 'Rain + Fire', text: 'Rain met fire and produced a lot of steam and one very confused bird.', xp: 30 },
  { id: 'monsoon-garden', name: 'Monsoon Gardening', powers: 'Rain + Nature', text: 'Trees planted under a rain cloud grow twice as fast. Gardeners everywhere are furious.', xp: 30 },
  { id: 'phoenix-forest', name: 'The Phoenix Forest', powers: 'Fire + Nature', text: 'New life planted in the ashes. The stump is thrilled.', xp: 30 },
  { id: 'rock-epiphany', name: 'Rock Epiphany', powers: 'Lightning + Rock', text: 'Lightning struck a rock. The rock now has opinions.', xp: 30 },
  { id: 'gilded-idol', name: 'The Gilded Idol', powers: 'Mutation + Sacred Tree', text: 'A sacred tree turned to gold. Its followers are insufferable now.', xp: 40 },
  { id: 'steam-thaw', name: 'Express Thaw', powers: 'Freeze + Fire', text: 'Ice and fire met. Steam won. The frost melts twice as fast.', xp: 35 },
  { id: 'permafrost', name: 'Accidental Snow Day', powers: 'Freeze + Rain', text: 'Freezing a raining area made snow. The frost spread wider and longer.', xp: 35 },
  { id: 'floating-rock', name: 'Floating Rock Theory', powers: 'Gravity + Mutation', text: 'A walking rock discovered it could simply not touch the ground. Permanently.', xp: 40 },
  { id: 'firenado', name: 'Firenado', powers: 'Tornado + Fire', text: 'A tornado threw fire downwind. Please do not do that again. (Do it again.)', xp: 40 },
  { id: 'cooling-shower', name: 'Cooling Shower', powers: 'Meteor + Rain', text: 'Rain cooled the crater. Grass and saplings are already moving in.', xp: 40 },
  { id: 'puddle-of-destiny', name: 'Puddle of Destiny', powers: 'Terraform + Rain', text: 'Rain filled a hole you dug. The village calls it a lake. It is a puddle.', xp: 35 },
  { id: 'second-coming', name: 'The Second Coming (Of Gerald)', powers: 'Resurrection + Religion', text: 'A believer returned from the dead and is now a prophet. Recruitment is up.', xp: 45 },
  { id: 'frozen-garden', name: 'The Frozen Garden', powers: 'Freeze + Nature', text: 'A sapling planted in frost refuses to grow until it is warm. Relatable.', xp: 30 },
  { id: 'ball-lightning', name: 'Ball Lightning', powers: 'Gravity + Lightning', text: 'Lightning in low gravity forgot which way was down.', xp: 35 },
  { id: 'temporal-sprout', name: 'Temporal Sprout', powers: 'Time Warp + Nature', text: 'A tree planted in fast time grew up before anyone could name it.', xp: 30 },
];

export const COMBO_BY_ID = new Map(COMBOS.map((c) => [c.id, c]));

/**
 * Discovery system. A combo is discovered once (saved in `state.discoveries`);
 * later repeats keep their gameplay effect but award nothing.
 */
export class ComboSystem {
  constructor(private readonly sim: Simulation) {
    const bus = sim.bus;
    bus.on('FIRE_EXTINGUISHED', (e) => {
      if (e.byRain) this.trigger('rain-fire', e.x, e.z);
    });
    bus.on('TREE_PLANTED', (e) => {
      if (!e.byPlayer) return;
      const tree = sim.tree(e.treeId);
      if (!tree) return;
      if (sim.effects.freezeAt(e.x, e.z) > 0.05) this.trigger('frozen-garden', e.x, e.z);
      else if (sim.state.clouds.some((c) => Math.hypot(c.x - e.x, c.z - e.z) < c.radius)) {
        tree.growRate *= 2;
        this.trigger('monsoon-garden', e.x, e.z);
      }
      if ((sim.effects.at('timewarp', e.x, e.z)?.factor ?? 1) > 1) this.trigger('temporal-sprout', e.x, e.z);
    });
    bus.on('LIGHTNING_STRUCK', (e) => {
      if (e.rockIds.length) this.trigger('rock-epiphany', e.x, e.z);
      if (sim.effects.at('gravity', e.x, e.z)) {
        sim.addChaos(3, 'Ball lightning');
        this.trigger('ball-lightning', e.x, e.z);
      }
    });
    bus.on('MUTATION_APPLIED', (e) => {
      if (e.mutation.kind !== 'golden-tree') return;
      const sacred = sim.sacredSys.find('tree', Number(e.mutation.targetId));
      if (sacred) {
        sim.sacredSys.addSacredness(sacred, 2);
        this.trigger('gilded-idol', e.x, e.z);
      }
    });
    bus.on('POWER_USED', (e) => {
      // Fire cast into frost: steam and a faster thaw. Rain cast into frost: snow, wider frost.
      const frost = sim.effects.at('freeze', e.x, e.z);
      if (frost && e.power === 'fire') {
        frost.until = Math.max(sim.state.time + 4, frost.until - 12);
        this.trigger('steam-thaw', e.x, e.z);
      }
      if (frost && e.power === 'rain') {
        frost.radius += 3;
        frost.until += 10;
        this.trigger('permafrost', e.x, e.z);
      }
    });
    bus.on('RAIN_STARTED', (e) => {
      // Meteor + Rain: cooling the crater starts recovery.
      for (const c of sim.state.craters) {
        if (Math.hypot(c.x - e.x, c.z - e.z) > e.radius + c.radius) continue;
        for (const f of sim.state.fires) if (Math.hypot(f.x - c.x, f.z - c.z) < c.radius + 4) f.intensity = 0;
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI * 2;
          sim.plantTree(c.x + Math.cos(a) * (c.radius + 1.5), c.z + Math.sin(a) * (c.radius + 1.5), false);
        }
        this.trigger('cooling-shower', c.x, c.z);
      }
      // Terraform + Rain: water pools in dug depressions.
      for (const ed of sim.state.terrainEdits) {
        if (ed.delta >= 0 || Math.hypot(ed.x - e.x, ed.z - e.z) > e.radius + ed.radius) continue;
        const cell = sim.cellIndex(ed.x, ed.z);
        sim.state.moisture[cell] = 1;
        sim.state.flood[cell] = Math.max(sim.state.flood[cell], 0.6);
        this.trigger('puddle-of-destiny', ed.x, ed.z);
      }
    });
  }

  discovered(id: string): boolean {
    return this.sim.state.discoveries.some((d) => d.id === id);
  }

  trigger(id: string, x: number, z: number): boolean {
    const def = COMBO_BY_ID.get(id);
    const sim = this.sim;
    if (!def || this.discovered(id)) return false;
    sim.state.discoveries.push({ id, t: sim.state.time });
    sim.notify(`DISCOVERY: ${def.name.toUpperCase()}`, 'chaos', `${def.powers}. ${def.text}`, 2);
    sim.history.add(`Discovery: ${def.name}`, `${def.powers}. ${def.text}`, { kind: 'discovery', x, z });
    sim.career.award(`combo:${id}`, def.xp, `Discovered ${def.name}`, { once: true });
    sim.bus.emit('COMBO_DISCOVERED', { id, name: def.name, x, z });
    return true;
  }
}
