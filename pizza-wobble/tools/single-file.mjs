/** Inline dist/ (JS, CSS, fonts) into one self-contained HTML: dist/pizza-wobble.html (opens from file://). */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const dir = 'dist/assets';
let html = readFileSync('dist/index.html', 'utf8');
const files = readdirSync(dir);
const js = files.find((f) => f.endsWith('.js'));
const css = files.find((f) => f.endsWith('.css'));
let style = readFileSync(`${dir}/${css}`, 'utf8');
for (const f of files.filter((f) => f.endsWith('.woff2'))) {
  const b64 = readFileSync(`${dir}/${f}`).toString('base64');
  style = style.split(`./${f}`).join(`data:font/woff2;base64,${b64}`).split(`/assets/${f}`).join(`data:font/woff2;base64,${b64}`).split(f).join(`data:font/woff2;base64,${b64}`);
}
const script = readFileSync(`${dir}/${js}`, 'utf8').replace(/<\/script/gi, '<\\/script');
html = html.replace(/<script type="module" crossorigin src="[^"]+"><\/script>/, '');
html = html.replace(/<link rel="stylesheet" crossorigin href="[^"]+">/, `<style>${style}</style>`);
html = html.replace('</body>', () => `<script type="module">${script}</script>\n</body>`);
writeFileSync('dist/pizza-wobble.html', html);
console.log('dist/pizza-wobble.html', (html.length / 1e6).toFixed(2), 'MB');
