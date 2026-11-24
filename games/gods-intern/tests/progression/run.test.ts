import { it } from 'vitest';
import fs from 'node:fs';
import { runBot, type Strategy } from './bots';

/** Long pacing run (opt-in: PROGRESSION=1). Writes artifacts/progression/report.json. */
it.runIf(process.env.PROGRESSION)('progression report', () => {
  const secs = Number(process.env.PROGRESSION_SECONDS ?? 3 * 3600);
  const out: Record<string, unknown> = {};
  for (const s of (process.env.BOTS ?? 'benevolent,chaotic,exploratory,spammer').split(',') as Strategy[]) {
    const t = performance.now();
    const r = runBot(s, secs, Number(process.env.SEED ?? 7));
    out[s] = { ...r, cpuSeconds: Math.round((performance.now() - t) / 1000) };
    console.log(s, JSON.stringify({ unlocks: r.unlocks, rankAt: r.rankAt, xp: r.xp, idle: `${r.idleDecisions}/${r.decisions}`, ch: r.challenges, src: r.xpBySource }));
  }
  fs.mkdirSync('artifacts/progression', { recursive: true });
  fs.writeFileSync(`artifacts/progression/report-${process.env.SEED ?? 7}.json`, JSON.stringify(out, null, 2));
}, 3_600_000);
