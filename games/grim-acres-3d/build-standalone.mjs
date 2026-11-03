// Builds standalone/grim-acres-3d.html: one self-contained file (JS + CSS inlined, classic script)
// that opens by double-click from the file system, no server or npm needed.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const out = await build({
  entryPoints: ['js/main.js'], bundle: true, format: 'iife', minify: true, write: false,
  target: 'es2020', legalComments: 'none',
});
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync('assets/style.css', 'utf8');
let html = readFileSync('index.html', 'utf8');
html = html.replace(/<script src="https:\/\/sdk\.crazygames[^>]*><\/script>\s*/, '');
html = html.replace(/<link rel="stylesheet" href="assets\/style.css">/, () => `<style>${css}</style>`);
html = html.replace(/<script type="module" src="js\/main.js"><\/script>/, () => `<script>${js}</script>`);
mkdirSync('standalone', { recursive: true });
writeFileSync('standalone/grim-acres-3d.html', html);
console.log('standalone/grim-acres-3d.html', (html.length / 1024).toFixed(0), 'KB');
