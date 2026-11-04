/** Lists every translatable string and checks each language pack for gaps.
 *  node --experimental-strip-types tools/i18n-check.ts [--dump out.json] */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { dataCatalog } from '../src/core/i18n.ts';
import { it } from '../src/i18n/it.ts';
import { es } from '../src/i18n/es.ts';
import { fr } from '../src/i18n/fr.ts';
import { de } from '../src/i18n/de.ts';
import { pt } from '../src/i18n/pt.ts';

const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : f.endsWith('.ts') && !d.includes('i18n') ? [join(d, f)] : []));
const ui = new Set<string>(['Chapter {0} · Part {1}', 'Chapter {0} · {1}']);
const unq = (s: string) => s.replace(/\\'/g, "'").replace(/\\n/g, '\n');
for (const f of walk('src')) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)) ui.add(unq(m[1]));
  // array literals translated with .map((s) => t(s))
  let at = -1;
  while ((at = src.indexOf('.map((s) => t(s))', at + 1)) > 0) {
    let open = src.lastIndexOf('[', at);
    while (src[open + 1] === ']') open = src.lastIndexOf('[', open - 1);
    for (const k of src.slice(open, at).matchAll(/'((?:[^'\\]|\\.)*)'/g)) ui.add(unq(k[1]));
  }
}
const data = dataCatalog();
const dump = process.argv.indexOf('--dump');
if (dump > 0) writeFileSync(process.argv[dump + 1], JSON.stringify({ ui: Object.fromEntries([...ui].map((s) => [s, s])), data }, null, 1));
const ph = (s: string) => (s.match(/\{\d\}/g) || []).sort().join();
let bad = 0;
for (const [code, p] of Object.entries({ it, es, fr, de, pt })) {
  const miss: string[] = [];
  for (const s of ui) if (!(s in p.ui)) miss.push('ui: ' + s);
  for (const id in data) if (!(id in p.data)) miss.push('data: ' + id);
  const extra = [...Object.keys(p.ui).filter((k) => !ui.has(k)).map((k) => 'ui: ' + k), ...Object.keys(p.data).filter((k) => !(k in data)).map((k) => 'data: ' + k)];
  const phBad = [...Object.entries(p.ui).filter(([k, v]) => ph(k) !== ph(v)).map(([k]) => k)];
  const ratio = Object.entries(p.data).filter(([k, v]) => data[k] && (v.length / data[k].length < 0.5 || v.length / data[k].length > 2.2)).map(([k]) => k);
  console.log(`${code}: ui ${Object.keys(p.ui).length}/${ui.size}  data ${Object.keys(p.data).length}/${Object.keys(data).length}  missing ${miss.length}  extra ${extra.length}  placeholder ${phBad.length}  odd-length ${ratio.length}`);
  for (const x of [...miss.slice(0, 8), ...extra.slice(0, 8), ...phBad, ...ratio]) console.log('   ', x);
  bad += miss.length + extra.length + phBad.length;
}
process.exit(bad ? 1 : 0);
