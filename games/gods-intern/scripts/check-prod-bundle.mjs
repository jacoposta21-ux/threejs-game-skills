#!/usr/bin/env node
// Verifies that a production build contains no test-only hooks (v0.4 requirement).
// Usage: node scripts/check-prod-bundle.mjs [distDir...]   (defaults: dist dist-single)
import fs from 'node:fs';
import path from 'node:path';

const FORBIDDEN = ['__THREE_GAME_TEST_HOOKS__', '__GI_STATE__', 'grantXp', 'setPausedForScreenshot', 'stagePower', 'Development test grant', 'grantChaos', 'planMigration'];
const dirs = process.argv.slice(2).length ? process.argv.slice(2) : ['dist', 'dist-single'];
let files = 0;
let bad = 0;
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|html)$/.test(e.name)) {
      files++;
      const src = fs.readFileSync(p, 'utf8');
      for (const f of FORBIDDEN) {
        if (src.includes(f)) {
          bad++;
          console.error(`FOUND "${f}" in ${p}`);
        }
      }
    }
  }
};
for (const d of dirs) if (fs.existsSync(d)) walk(d);
if (!files) {
  console.error('No build output found. Run npm run build first.');
  process.exit(2);
}
console.log(bad ? `FAIL: ${bad} test-hook marker(s) in ${files} file(s)` : `OK: no test hooks in ${files} production file(s)`);
process.exit(bad ? 1 : 0);
