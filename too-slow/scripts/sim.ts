/**
 * Headless race simulation for tuning and regression: runs the real track,
 * physics and AI with no rendering.
 *   npx tsx scripts/sim.ts [seed] [races] [--trace]
 */
import { FIXED_DT, RaceManager } from '../src/racing/RaceManager';
import { createSeededRandom } from '../src/utils/random';
import { SECTIONS, track } from '../src/world/Track';

const seed0 = Number(process.argv[2] ?? 1);
const races = Number(process.argv[3] ?? 1);
const trace = process.argv.includes('--trace');

console.log(`track length ${track.length}, drop ${(-track.height(track.length - 1, 0)).toFixed(1)}`);

for (let n = 0; n < races; n += 1) {
  const rng = createSeededRandom(seed0 + n);
  const race = new RaceManager();
  race.autopilot = true;
  race.reset(rng);
  race.startCountdown();
  const respawns = new Array(6).fill(0);
  const last: number[][] = new Array(6).fill([0, 0]);
  const hits = new Array(6).fill(0);
  const maxAir = new Array(6).fill(0);
  const sectionTime: number[] = [];
  let nextSection = 1;
  let steps = 0;
  const limit = 400 / FIXED_DT;
  while (steps < limit && race.racers.some((r) => !r.finished)) {
    race.step();
    steps += 1;
    race.racers.forEach((r, i) => {
      for (const e of r.events) {
        if (e.type === 'respawn') { respawns[i] += 1; if (process.argv.includes('--log')) console.log(`   respawn ${race.profiles[i].name} from s=${last[i][0].toFixed(0)} d=${last[i][1].toFixed(1)} t=${race.time.toFixed(1)}`); }
        if (e.type === 'hit') hits[i] += 1;
      }
      r.events.length = 0;
      if (steps % 30 === 0) { if (process.argv.includes('--log') && r.speed < 0.5 && !r.frozen && !r.finished && steps % 240 === 0) console.log(`   slow ${race.profiles[i].name} s=${r.s.toFixed(0)} d=${r.d.toFixed(1)} ${r.mode} t=${race.time.toFixed(1)}`); }
      last[i] = [r.s, r.d];
      maxAir[i] = Math.max(maxAir[i], r.flightTime);
    });
    race.events.length = 0;
    const p = race.player;
    if (nextSection < SECTIONS.length && p.s >= SECTIONS[nextSection].s0) {
      sectionTime.push(race.time);
      nextSection += 1;
    }
    if (trace && steps % 120 === 0) {
      console.log(
        `t=${race.time.toFixed(0).padStart(3)} s=${p.s.toFixed(0).padStart(4)} d=${p.d.toFixed(1).padStart(5)} v=${p.speed.toFixed(1).padStart(5)} ${p.mode.padEnd(5)} ${p.surface.padEnd(6)} slime=${p.slime.toFixed(2)} boost=${p.boost.toFixed(2)} air=${p.flightTime.toFixed(2)}`,
      );
    }
  }
  console.log(`\nseed ${seed0 + n} — sections(player) ${sectionTime.map((t) => t.toFixed(1)).join(' / ')}`);
  for (const i of race.order) {
    const r = race.racers[i];
    console.log(
      `  ${race.profiles[i].name.padEnd(12)} ${r.finished ? r.finishTime.toFixed(2).padStart(7) : `DNF s=${r.s.toFixed(0)}`}  vmax=${r.maxSpeed.toFixed(1)} air=${maxAir[i].toFixed(2)} respawn=${respawns[i]} hits=${hits[i]} tricks=${r.tricks}`,
    );
  }
}
