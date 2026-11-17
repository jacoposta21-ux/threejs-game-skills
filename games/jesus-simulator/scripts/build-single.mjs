/**
 * Build a single, self-contained HTML file (all JS, CSS and the Rapier WASM
 * inlined) that runs by double-clicking it — no server needed.
 * Usage: node scripts/build-single.mjs [outFile]
 */
import { build } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'dist-single');
const outFile = path.resolve(process.argv[2] || path.join(root, 'dist-single', 'jesus-simulator.html'));

await build({
  root,
  configFile: false,
  base: './',
  logLevel: 'warn',
  build: {
    outDir,
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    modulePreload: false,
    chunkSizeWarningLimit: 100_000,
    rollupOptions: { output: { codeSplitting: false } },
  },
});

let html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
const read = (rel) => fs.readFileSync(path.join(outDir, rel.replace(/^\.\//, '')), 'utf8');
// stylesheets
html = html.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_, href) => `<style>${read(href)}</style>`);
// the single module script: inline it at the end of <body> so the DOM exists
let js = '';
html = html.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g, (_, src) => { js += read(src); return ''; });
const safe = js.replace(/<\/script/gi, '<\\/script');
html = html.replace('</body>', () => `<script type="module">${safe}</script>\n</body>`); // function: no $-patterns
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, html);
console.log(`${outFile}  ${(fs.statSync(outFile).size / 1024 / 1024).toFixed(2)} MB`);
