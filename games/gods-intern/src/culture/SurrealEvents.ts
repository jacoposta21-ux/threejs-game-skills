import { CONFIG } from '../core/Config';
import type { VillageData, VillagerData } from '../core/types';
import { rule, type ConsequenceRule } from '../simulation/ConsequenceTypes';
import type { Simulation } from '../simulation/SimulationManager';
import { has } from './Personality';

/** Minimum gap between major surreal events so absurdity comes in bursts, not floods. */
export const MAJOR_GAP = 40;

const village = (sim: Simulation): VillageData => sim.state.villages[0];
const well = (sim: Simulation) => sim.building(village(sim).wellId)!;
const farm = (sim: Simulation) => sim.building(village(sim).farmIds[0]);
const ready = (sim: Simulation) => sim.state.time - sim.state.culture.lastMajorEvent >= MAJOR_GAP;

function major(sim: Simulation, id: string, title: string, x: number, z: number): void {
  const c = sim.state.culture;
  c.lastMajorEvent = sim.state.time;
  if (!c.eventsFired.includes(id)) c.eventsFired.push(id);
  sim.bus.emit('SURREAL_EVENT', { id, title, x, z });
}

function nearVillage(sim: Simulation, x: number, z: number, extra = 20): boolean {
  const v = village(sim);
  return Math.hypot(x - v.centerX, z - v.centerZ) < v.radius + extra;
}

/** Send villagers to stand in a ring around a point (trials, festivals, gatherings). */
function gather(sim: Simulation, villagers: VillagerData[], x: number, z: number, activity: string, seconds: number, radius = 4.5): void {
  villagers.forEach((v, i) => {
    const a = (i / Math.max(1, villagers.length)) * Math.PI * 2;
    sim.ai.assign(sim, v, activity === 'festival' ? 'CELEBRATING' : 'IDLE', activity, x + Math.cos(a) * radius, z + Math.sin(a) * radius, null, seconds, x, z);
  });
}

function awake(sim: Simulation): VillagerData[] {
  return sim.state.villagers.filter((v) => v.alive && !(v.currentTask.state === 'RESTING' && v.currentTask.arrived) && v.currentTask.state !== 'FLEEING');
}

function makeHolyTree(sim: Simulation, treeId: number, cause: string): void {
  const tree = sim.tree(treeId);
  if (!tree) return;
  const witnesses = sim.memory.witnesses(tree.x, tree.z, CONFIG.culture.perception.notable);
  const sacred = sim.sacredSys.create({ kind: 'tree', targetId: tree.id, x: tree.x, z: tree.z, label: 'The Holy Tree', sacredness: 2.6, monument: 'obelisk' });
  const memory = sim.memory.record('tree-survived', tree.x, tree.z, { impact: 0.8, radius: CONFIG.culture.perception.notable, targetEntityId: `tree:${tree.id}` });
  if (!sim.religion.byArchetype('tree') && memory) {
    sim.religion.found('tree', { memory, x: tree.x, z: tree.z, sacredKind: 'tree', targetId: tree.id, label: 'The Holy Tree', sacredness: 2.6, recruitFromVillage: true });
  } else if (sacred && !sacred.religionId) {
    sacred.religionId = sim.religion.byArchetype('tree')?.id ?? null;
  }
  gather(sim, witnesses.slice(0, 6), tree.x, tree.z, 'pray-sacred', 8, 3);
  sim.history.add('The Holy Tree', `A tree survived ${cause}. It is now considered divinely protected and slightly smug.`, { kind: 'sacred', x: tree.x, z: tree.z });
  sim.notify('THE HOLY TREE', 'culture', `It survived ${cause}. The villagers are building it a shrine.`, 2);
  major(sim, 'holy-tree', 'The Holy Tree', tree.x, tree.z);
}

function curseWell(sim: Simulation, cause: string): void {
  const c = sim.state.culture;
  const w = well(sim);
  const witnesses = sim.memory.witnesses(w.x, w.z, 16);
  const believers = new Set<string>(witnesses.map((v) => v.id));
  for (const v of sim.state.villagers) {
    if (v.alive && (has(v, 'superstitious') || (has(v, 'cowardly') && sim.rng.next() < 0.5))) believers.add(v.id);
  }
  c.cursedWell = { until: sim.state.time + 480, believers: [...believers].slice(0, 10) };
  const speaker = witnesses.find((v) => has(v, 'superstitious')) ?? witnesses[0];
  sim.speech.say(speaker, 'A FROG LOOKED AT ME. IN THE WELL. IN THE EYES.', 3, 4);
  sim.history.add('The Forbidden Well', `After ${cause}, ${c.cursedWell.believers.length} villagers declared the well cursed. They now walk to the river instead.`, { kind: 'curse', x: w.x, z: w.z });
  sim.notify('THE WELL IS CURSED!', 'culture', 'Some villagers refuse to drink from it. Rain may purify it.', 3);
  major(sim, 'forbidden-well', 'The Forbidden Well', w.x, w.z);
}

/**
 * Surreal events A–L plus supporting rules. Every rule reads real simulation
 * state and changes it: sacred objects, beliefs, AI behavior, production,
 * resource access or fire risk — never just a popup.
 */
export const SURREAL_EVENTS: ConsequenceRule[] = [
  // ---------------------------------------------------------------- A
  rule({
    id: 'rock-king',
    title: 'The Rock King',
    trigger: 'LIGHTNING_STRUCK',
    cooldown: 99999,
    condition: (sim, e) => e.rockIds.length > 0 && e.witnesses >= 3 && sim.state.culture.rockKingId < 0,
    effects: (sim, e) => {
      const c = sim.state.culture;
      const rock = sim.state.rocks[e.rockIds[0]];
      rock.crowned = true;
      c.rockKingId = rock.id;
      c.lastRockSign = sim.state.time;
      const memory = sim.memory.latest('lightning-rock');
      const religion = sim.religion.found('rock', { memory, x: rock.x, z: rock.z, sacredKind: 'rock', targetId: rock.id, label: 'His Rocky Majesty', sacredness: 2.6, recruitFromVillage: true });
      const sacred = sim.sacredSys.find('rock', rock.id);
      if (sacred) {
        sacred.label = 'His Rocky Majesty';
        sacred.monument = 'crown-statue';
        if (religion) sacred.religionId = religion.id;
      }
      gather(sim, sim.memory.witnesses(rock.x, rock.z, 30).slice(0, 8), rock.x, rock.z, 'pray-sacred', 10, 3.2);
      sim.history.add('A Rock Was Crowned King', 'Lightning struck a rock in front of witnesses. The rock now rules Puddleton. Its policies are unclear.', { kind: 'sacred', x: rock.x, z: rock.z });
      sim.addChaos(8, 'Crowned a rock');
      major(sim, 'rock-king', 'The Rock King', rock.x, rock.z);
    },
    notify: { text: 'ALL HAIL THE ROCK KING!', kind: 'culture', sub: 'The villagers have crowned a rock. It accepted silently.' },
    god: { text: 'WHY DOES THE ROCK HAVE A GOVERNMENT POSITION?', priority: 2 },
  }),
  rule({
    id: 'rock-sign',
    title: 'A Sign for the King',
    trigger: 'LIGHTNING_STRUCK',
    cooldown: 0,
    condition: (sim, e) => {
      const r = sim.state.rocks[sim.state.culture.rockKingId];
      return !!r && Math.hypot(r.x - e.x, r.z - e.z) < 8;
    },
    effects: (sim) => (sim.state.culture.lastRockSign = sim.state.time),
  }),
  rule({
    id: 'rock-sign-tree',
    title: 'A Gift for the King',
    trigger: 'TREE_PLANTED',
    cooldown: 0,
    condition: (sim, e) => {
      const r = sim.state.rocks[sim.state.culture.rockKingId];
      return e.byPlayer && !!r && Math.hypot(r.x - e.x, r.z - e.z) < 8;
    },
    effects: (sim) => (sim.state.culture.lastRockSign = sim.state.time),
  }),

  // ---------------------------------------------------------------- B
  rule({
    id: 'wet-sock-festival',
    title: 'The Great Wet Sock Festival',
    trigger: 'FLOOD_STARTED',
    cooldown: 600,
    condition: (sim, e) =>
      !sim.state.culture.festivals.some((f) => f.kind === 'wet-sock') && (sim.recentCount('flood-start', 1500) >= 2 || e.level >= 0.6),
    effects: (sim, e) => {
      const c = sim.state.culture;
      c.festivals.push({ id: `f${sim.nextId()}`, name: 'The Great Wet Sock Festival', kind: 'wet-sock', foundedDay: sim.day, everyDays: 2, lastDay: sim.day, x: e.x, z: e.z });
      c.festivalUntil = sim.state.time + 45;
      gather(sim, awake(sim).slice(0, 12), e.x, e.z, 'festival', 18, 5.5);
      for (const v of sim.state.villagers) if (v.alive) v.happiness = Math.min(1, v.happiness + 0.15);
      sim.sacredSys.create({ kind: 'ground', targetId: -2, x: e.x + 3, z: e.z + 3, label: 'The Puddle of Remembrance', sacredness: 2.6, monument: 'sock-totem' });
      sim.history.add('The Great Wet Sock Festival', 'The villagers commemorated the flood by standing in it on purpose. It will be held every second day, forever.', { kind: 'festival', x: e.x, z: e.z });
      major(sim, 'wet-sock-festival', 'The Great Wet Sock Festival', e.x, e.z);
    },
    notify: { text: 'THE GREAT WET SOCK FESTIVAL!', kind: 'culture', sub: 'A new holiday celebrating your flood. Attendance is damp but enthusiastic.' },
  }),
  rule({
    id: 'festival-anniversary',
    title: 'Festival Anniversary',
    trigger: 'TICK',
    cooldown: 60,
    condition: (sim) =>
      sim.state.culture.festivals.some((f) => sim.day > f.lastDay && (sim.day - f.foundedDay) % f.everyDays === 0 && sim.timeOfDay > 0.5 && sim.timeOfDay < 0.62),
    effects: (sim) => {
      const c = sim.state.culture;
      for (const f of c.festivals) {
        if (!(sim.day > f.lastDay && (sim.day - f.foundedDay) % f.everyDays === 0)) continue;
        f.lastDay = sim.day;
        c.festivalUntil = sim.state.time + 45;
        gather(sim, awake(sim).slice(0, 12), f.x, f.z, 'festival', 18, 5.5);
        for (const v of sim.state.villagers) if (v.alive) v.happiness = Math.min(1, v.happiness + 0.1);
        const n = Math.floor((sim.day - f.foundedDay) / f.everyDays) + 1;
        sim.history.add(`${f.name} (Year ${n})`, 'The anniversary was celebrated with ritual sock-wetting.', { kind: 'festival', x: f.x, z: f.z });
        sim.notify(f.name.toUpperCase(), 'culture', 'The anniversary has arrived. Bring a spare sock.', 1);
      }
    },
  }),

  // ---------------------------------------------------------------- C
  rule({
    id: 'holy-tree-lightning',
    title: 'The Holy Tree (lightning)',
    trigger: 'LIGHTNING_STRUCK',
    cooldown: 240,
    condition: (sim, e) => ready(sim) && e.survivorTreeIds.length > 0 && e.witnesses >= 2 && nearVillage(sim, e.x, e.z) && !sim.sacredSys.find('tree', e.survivorTreeIds[0]),
    effects: (sim, e) => makeHolyTree(sim, e.survivorTreeIds[0], 'a lightning strike'),
  }),
  rule({
    id: 'holy-tree-fire',
    title: 'The Holy Tree (fire)',
    trigger: 'FIRE_EXTINGUISHED',
    cooldown: 240,
    condition: (sim, e) => {
      if (!ready(sim) || !e.byRain || e.kind !== 'tree' || !nearVillage(sim, e.x, e.z)) return false;
      const t = sim.tree(e.targetId);
      return !!t && !t.charred && !sim.sacredSys.find('tree', t.id) && sim.memory.witnesses(e.x, e.z, CONFIG.culture.perception.notable).length >= 2;
    },
    effects: (sim, e) => makeHolyTree(sim, e.targetId, 'a fire'),
  }),

  // ---------------------------------------------------------------- D
  rule({
    id: 'ash-resurrection',
    title: 'The Ash Resurrection',
    trigger: 'TREE_REGROWN',
    cooldown: 500,
    condition: (sim, e) => ready(sim) && nearVillage(sim, e.x, e.z, 34) && !sim.religion.byArchetype('rebirth'),
    effects: (sim, e) => {
      const memory = sim.memory.latest('regrowth');
      sim.religion.found('rebirth', { memory, x: e.x, z: e.z, sacredKind: 'ground', targetId: -3, label: 'The Memorial Garden', sacredness: 2.6, recruitFromVillage: true });
      sim.history.add('The Ash Resurrection', 'Saplings rose from the ashes. The villagers now believe in rebirth, and in planting things where it hurt.', { kind: 'religion', x: e.x, z: e.z });
      major(sim, 'ash-resurrection', 'The Ash Resurrection', e.x, e.z);
    },
    notify: { text: 'THE ASH RESURRECTION', kind: 'culture', sub: 'A belief in rebirth has sprouted. Followers will replant burned land.' },
  }),

  // ---------------------------------------------------------------- E
  rule({
    id: 'forbidden-well-lightning',
    title: 'The Forbidden Well (lightning)',
    trigger: 'LIGHTNING_STRUCK',
    cooldown: 300,
    condition: (sim, e) => ready(sim) && !sim.state.culture.cursedWell && Math.hypot(well(sim).x - e.x, well(sim).z - e.z) < 12,
    effects: (sim) => curseWell(sim, 'lightning struck beside it'),
  }),
  rule({
    id: 'forbidden-well-mutation',
    title: 'The Forbidden Well (mutation)',
    trigger: 'MUTATION_APPLIED',
    cooldown: 300,
    condition: (sim, e) => ready(sim) && !sim.state.culture.cursedWell && Math.hypot(well(sim).x - e.x, well(sim).z - e.z) < 14,
    effects: (sim) => curseWell(sim, 'something deeply unnatural happened beside it'),
  }),
  rule({
    id: 'well-purified',
    title: 'The Well Is Purified',
    trigger: 'RAIN_STARTED',
    cooldown: 0,
    condition: (sim, e) => !!sim.state.culture.cursedWell && Math.hypot(well(sim).x - e.x, well(sim).z - e.z) <= e.radius,
    effects: (sim) => {
      sim.state.culture.cursedWell = null;
      const w = well(sim);
      sim.history.add('The Purification of the Well', 'Holy drizzle washed away the curse. The frog was not available for comment.', { kind: 'curse', x: w.x, z: w.z });
      sim.ai.celebrate(sim, village(sim), 'purified');
    },
    notify: { text: 'THE WELL IS PURIFIED', kind: 'good', sub: 'Everyone may drink from it again. Even the superstitious.' },
  }),
  rule({
    id: 'well-curse-forgotten',
    title: 'Curse Forgotten',
    trigger: 'TICK',
    cooldown: 0,
    condition: (sim) => !!sim.state.culture.cursedWell && sim.state.culture.cursedWell.until < sim.state.time,
    effects: (sim) => (sim.state.culture.cursedWell = null),
    notify: { text: 'THE CURSE WAS FORGOTTEN', kind: 'info', sub: 'Nobody remembers why they feared the well.' },
  }),

  // ---------------------------------------------------------------- F
  rule({
    id: 'eternal-picnic',
    title: 'The Eternal Picnic',
    trigger: 'TICK',
    cooldown: 900,
    condition: (sim) => ready(sim) && sim.state.culture.prosperityTime >= 100 && sim.state.culture.picnicUntil < sim.state.time,
    effects: (sim) => {
      const c = sim.state.culture;
      const v = village(sim);
      const spot = sim.pathfinding.nearestWalkable(v.centerX - 9, v.centerZ - 18) ?? { x: v.centerX, z: v.centerZ };
      c.picnicSpot = spot;
      c.picnicUntil = sim.state.time + 150;
      c.picnickers = sim.state.villagers.filter((p) => p.alive && p.age >= 12 && (has(p, 'lazy') || sim.rng.next() < 0.4)).map((p) => p.id);
      c.prosperityTime = 0;
      sim.history.add('The Eternal Picnic', `${c.picnickers.length} villagers decided that work is unnecessary while life is this good. Food keeps disappearing.`, { kind: 'event', x: spot.x, z: spot.z });
      major(sim, 'eternal-picnic', 'The Eternal Picnic', spot.x, spot.z);
    },
    notify: { text: 'THE ETERNAL PICNIC HAS BEGUN', kind: 'culture', sub: 'Several villagers stopped working. Snacks are being consumed at alarming rates.' },
    god: { text: 'ARE THEY ON VACATION TOO? WHO APPROVED THIS?', priority: 1 },
  }),
  rule({
    id: 'picnic-ends',
    title: 'Picnic Ends',
    trigger: 'TICK',
    cooldown: 0,
    condition: (sim) => sim.state.culture.picnickers.length > 0 && sim.state.culture.picnicUntil < sim.state.time,
    effects: (sim) => (sim.state.culture.picnickers = []),
    notify: { text: 'THE PICNIC IS OVER', kind: 'info', sub: 'Nobody knows who is supposed to clean up.' },
  }),

  // ---------------------------------------------------------------- G
  rule({
    id: 'upside-down-day',
    title: 'Upside-Down Day',
    trigger: 'POWER_USED',
    cooldown: 600,
    condition: (sim) => ready(sim) && sim.recentCount('weird', 100) >= 5 && sim.state.culture.upsideDownUntil < sim.state.time,
    effects: (sim) => {
      sim.state.culture.upsideDownUntil = sim.state.time + 100;
      for (const v of sim.state.villagers) if (v.alive) v.happiness = Math.min(1, v.happiness + 0.05);
      const v = village(sim);
      sim.history.add('The First Upside-Down Day', 'Overwhelmed by miracles, the villagers declared a day of doing everything backwards. Productivity fell. Morale rose. Hats were worn on feet.', { kind: 'festival', x: v.centerX, z: v.centerZ });
      major(sim, 'upside-down-day', 'Upside-Down Day', v.centerX, v.centerZ);
    },
    notify: { text: 'UPSIDE-DOWN DAY!', kind: 'culture', sub: 'Everyone walks backwards. Decorations are flipped. Work is slower.' },
    god: { text: 'THAT WAS NOT IN THE TRAINING MANUAL EITHER.', priority: 1 },
  }),

  // ---------------------------------------------------------------- H
  rule({
    id: 'cloud-trial',
    title: 'The Cloud Trial',
    trigger: 'TICK',
    cooldown: 900,
    condition: (sim) => ready(sim) && !sim.state.culture.trial && sim.recentCount('rain-damage', 900) >= 3 && sim.state.culture.rainBannedUntil < sim.state.time,
    effects: (sim) => {
      const v = village(sim);
      const x = v.centerX - 4;
      const z = v.centerZ + 4;
      sim.state.culture.trial = { until: sim.state.time + 40, x, z, verdictGiven: false };
      gather(sim, awake(sim).slice(0, 10), x, z, 'trial', 36, 5);
      sim.sacredSys.create({ kind: 'ground', targetId: -4, x, z, label: 'The Cloud Effigy', sacredness: 0.5, monument: 'cloud-effigy' });
      sim.history.add('The Cloud Trial Begins', 'After repeated water damage, the villagers put a cloud on trial. The defendant was represented by a wooden effigy.', { kind: 'event', x, z });
      major(sim, 'cloud-trial', 'The Cloud Trial', x, z);
    },
    notify: { text: 'THE CLOUD IS ON TRIAL', kind: 'culture', sub: 'The court is in session. The cloud has not entered a plea.' },
  }),
  rule({
    id: 'cloud-verdict',
    title: 'The Verdict',
    trigger: 'TICK',
    cooldown: 0,
    condition: (sim) => !!sim.state.culture.trial && !sim.state.culture.trial.verdictGiven && sim.state.culture.trial.until <= sim.state.time,
    effects: (sim) => {
      const c = sim.state.culture;
      const trial = c.trial!;
      trial.verdictGiven = true;
      const guilty = sim.rng.next() < 0.7;
      if (guilty) {
        c.rainBannedUntil = sim.state.time + CONFIG.time.dayLength;
        const cloudFaith = sim.religion.byArchetype('cloud');
        if (cloudFaith) cloudFaith.influence = Math.max(0, cloudFaith.influence - 0.2);
        sim.notify('VERDICT: THE CLOUD IS GUILTY', 'culture', 'Rain is officially unwelcome for a day. Villagers will boo it.', 3);
      } else {
        for (const v of sim.state.villagers) if (v.alive) v.happiness = Math.min(1, v.happiness + 0.1);
        sim.notify('VERDICT: THE CLOUD IS INNOCENT', 'culture', 'The cloud walks free. Floats free. Whatever clouds do.', 3);
      }
      const effigy = sim.state.sacred.find((s) => s.targetId === -4);
      if (effigy) {
        // The courtroom effigy stays as a finished monument to the trial.
        effigy.shrineProgress = 1;
        effigy.monumentProgress = 1;
        sim.sacredSys.addSacredness(effigy, 9);
        effigy.label = guilty ? 'The Guilty Cloud' : 'The Acquitted Cloud';
      }
      sim.history.add(guilty ? 'The Cloud Was Found Guilty' : 'The Cloud Was Acquitted', guilty ? 'Sentenced to one day of public disapproval.' : 'The jury cited reasonable drizzle.', { kind: 'event', x: trial.x, z: trial.z });
      c.trial = null;
    },
  }),

  // ---------------------------------------------------------------- I
  rule({
    id: 'sacred-potato-flood',
    title: 'The Sacred Potato (flood)',
    trigger: 'FLOOD_RECEDED',
    cooldown: 900,
    condition: (sim) => {
      const f = farm(sim);
      return ready(sim) && !sim.state.culture.potatoCult && !!f && !f.destroyed && f.cropHealth > 0.3 && sim.recentCount('rain-damage', 400) >= 1;
    },
    effects: (sim) => sacredPotato(sim, 'the flood'),
  }),
  rule({
    id: 'sacred-potato-fire',
    title: 'The Sacred Potato (fire)',
    trigger: 'FIRE_EXTINGUISHED',
    cooldown: 900,
    condition: (sim, e) => {
      const f = farm(sim);
      return ready(sim) && !sim.state.culture.potatoCult && !!f && !f.destroyed && Math.hypot(f.x - e.x, f.z - e.z) < 14;
    },
    effects: (sim) => sacredPotato(sim, 'the fire'),
  }),

  // ---------------------------------------------------------------- J
  rule({
    id: 'department-of-miracles',
    title: 'The Department of Miracles',
    trigger: 'PRAYER_COMPLETED',
    cooldown: 99999,
    condition: (sim) => ready(sim) && sim.state.stats.prayersAnswered >= 4 && !sim.state.culture.officeBuilt,
    effects: (sim) => {
      const c = sim.state.culture;
      c.officeBuilt = true;
      c.officeProgress = 0;
      const v = village(sim);
      sim.history.add('The Villagers Invented Paperwork', 'To manage the flood of answered prayers, the villagers founded the Department of Miracles. Prayers now require forms.', { kind: 'event', x: v.centerX + 14, z: v.centerZ - 1 });
      major(sim, 'department-of-miracles', 'The Department of Miracles', v.centerX + 14, v.centerZ - 1);
    },
    notify: { text: 'THE DEPARTMENT OF MIRACLES', kind: 'culture', sub: 'Prayers now arrive in triplicate. Rewards are slightly better documented.' },
    god: { text: 'THEY HAVE INVENTED PAPERWORK. I AM SO PROUD. I AM SO TIRED.', priority: 2 },
  }),

  // ---------------------------------------------------------------- K
  rule({
    id: 'fire-appreciation-society',
    title: 'The Fire Appreciation Society',
    trigger: 'FIRE_EXTINGUISHED',
    cooldown: 99999,
    condition: (sim) => ready(sim) && !sim.state.culture.firePit && sim.recentCount('fire-out-witnessed', 900) >= 3,
    effects: (sim) => {
      const c = sim.state.culture;
      const v = village(sim);
      c.firePit = { x: v.centerX - 5, z: v.centerZ + 4 }; // the gathering circle
      c.fireRisk = 0.15;
      const memory = sim.memory.latest('fire-extinguished');
      sim.religion.found('fire', { memory, x: c.firePit.x, z: c.firePit.z, sacredKind: 'ground', targetId: -5, label: 'The Ceremonial Fire Pit', sacredness: 2.6, recruitFromVillage: true });
      sim.history.add('The Fire Appreciation Society', 'Having watched fire come and go so often, some villagers grew fond of it. They built a "safe" fire pit. Fire risk is up slightly.', { kind: 'religion', x: c.firePit.x, z: c.firePit.z });
      major(sim, 'fire-appreciation-society', 'The Fire Appreciation Society', c.firePit.x, c.firePit.z);
    },
    notify: { text: 'THE FIRE APPRECIATION SOCIETY', kind: 'culture', sub: 'A ceremonial fire pit now burns at night. What could go wrong.' },
  }),

  // ---------------------------------------------------------------- L
  rule({
    id: 'great-silence',
    title: 'The Great Silence',
    trigger: 'PRAYER_FAILED',
    cooldown: 600,
    condition: (sim) => sim.state.culture.ignoredStreak >= 3 && !sim.state.culture.silence,
    effects: (sim) => {
      const c = sim.state.culture;
      c.silence = true;
      for (const v of sim.state.villagers) if (v.alive) v.faith = Math.max(0, v.faith - 0.15);
      const shrine = sim.building(village(sim).shrineId)!;
      sim.sacredSys.create({ kind: 'ground', targetId: -6, x: shrine.x + 5, z: shrine.z + 2.5, label: 'The Out of Office Sign', sacredness: 9, monument: 'out-of-office' }) &&
        (sim.state.sacred[sim.state.sacred.length - 1].shrineProgress = 1);
      sim.history.add('The Great Silence', 'After three unanswered prayers, the villagers concluded God had left. They began building a monument that reads OUT OF OFFICE.', { kind: 'loss', x: shrine.x, z: shrine.z });
      major(sim, 'great-silence', 'The Great Silence', shrine.x, shrine.z);
    },
    notify: { text: 'THE GREAT SILENCE', kind: 'bad', sub: 'The villagers think God has abandoned them. Shrine visits have stopped.' },
    god: { text: 'ARE YOU STILL EMPLOYED? ASKING FOR A FRIEND. THE FRIEND IS THE VILLAGERS.', priority: 2 },
  }),
  rule({
    id: 'silence-broken',
    title: 'The Silence Is Broken',
    trigger: 'PRAYER_COMPLETED',
    cooldown: 0,
    condition: (sim) => sim.state.culture.silence,
    effects: (sim) => {
      sim.state.culture.silence = false;
      sim.history.add('God Is Back (Probably)', 'A prayer was answered. The Out of Office sign stays up, just in case.', { kind: 'event' });
    },
    notify: { text: 'THE SILENCE IS BROKEN', kind: 'good', sub: 'Faith returns. The sign stays, as a warning.' },
  }),

  // ---------------------------------------------------------------- extra emergent details
  rule({
    id: 'walking-rock-celebrity',
    title: 'Most Popular Resident',
    trigger: 'TICK',
    cooldown: 99999,
    condition: (sim) => sim.state.mutations.some((m) => m.kind === 'walking-rock' && sim.state.time - m.createdAt > 120),
    effects: (sim) => {
      const m = sim.state.mutations.find((x) => x.kind === 'walking-rock')!;
      const rock = sim.state.rocks[Number(m.targetId)];
      sim.history.add('The Rock Became a Local Celebrity', 'The walking rock is now the most popular resident of Puddleton. It has never said a word. That is its charm.', { kind: 'event', x: rock?.x, z: rock?.z });
    },
    notify: { text: 'A ROCK IS THE MOST POPULAR RESIDENT', kind: 'culture', sub: 'Villagers follow it around. It does not notice.' },
  }),
  rule({
    id: 'great-fire-history',
    title: 'The Great Fire',
    trigger: 'FIRE_SPREAD',
    cooldown: 99999,
    condition: (sim) => sim.state.fires.length >= 8,
    effects: (sim, e) => sim.history.add(`The Great Fire of ${village(sim).name}`, 'The forest burned. Everyone has opinions about who started it.', { kind: 'disaster', x: e.x, z: e.z }),
  }),
  rule({
    id: 'golden-prophet',
    title: 'Prophet of the Golden Tree',
    trigger: 'MUTATION_APPLIED',
    cooldown: 99999,
    condition: (_sim, e) => e.mutation.kind === 'golden-tree',
    effects: (sim, e) => {
      const memory = sim.memory.latest('mutation-golden-tree');
      const tree = sim.tree(Number(e.mutation.targetId));
      if (!tree) return;
      const r = sim.religion.found('gold', { memory, x: tree.x, z: tree.z, sacredKind: 'tree', targetId: tree.id, label: 'The Golden Tree', sacredness: 2.6, recruitFromVillage: true });
      const leader = r?.leaderId ? sim.villager(r.leaderId) : undefined;
      if (leader) leader.title = 'Prophet of the Golden Tree';
      sim.history.add('The Golden Tree', `A tree turned to gold overnight (instantly). ${leader ? `${leader.name} declared themself its Prophet.` : 'A prophet is expected shortly.'}`, { kind: 'sacred', x: tree.x, z: tree.z });
    },
  }),
  rule({
    id: 'vegetable-management',
    title: 'Vegetables in Management',
    trigger: 'RELIGION_FOUNDED',
    cooldown: 99999,
    condition: (sim, e) => e.religion.archetype === 'potato' && sim.state.culture.rockKingId >= 0,
    god: { text: 'PLEASE STOP PROMOTING VEGETABLES TO MANAGEMENT.', priority: 3 },
  }),
];

function sacredPotato(sim: Simulation, cause: string): void {
  const f = farm(sim);
  if (!f) return;
  const c = sim.state.culture;
  c.potatoCult = true;
  const x = f.x - 6.6;
  const z = f.z - 5.4;
  const memory = sim.memory.record('crop-survived', f.x, f.z, { impact: 0.75, radius: CONFIG.culture.perception.notable });
  sim.religion.found('potato', { memory: memory ?? undefined, x, z, sacredKind: 'crop', targetId: f.id, label: 'The Sacred Potato', sacredness: 5.5, recruitFromVillage: true });
  const s = sim.sacredSys.find('crop', f.id);
  if (s) s.monument = 'giant-potato';
  sim.history.add('The Sacred Potato', `One potato survived ${cause}. It was elevated to divine status. Food output has dipped: nobody wants to harvest its relatives.`, { kind: 'sacred', x, z });
  sim.notify('THE SACRED POTATO', 'culture', 'A crop survived. It is now a deity. Harvests are smaller out of respect.', 2);
  major(sim, 'sacred-potato', 'The Sacred Potato', x, z);
}
