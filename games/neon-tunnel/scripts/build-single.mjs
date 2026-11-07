#!/usr/bin/env node
// Builds a single self-contained HTML file (JS, CSS and fonts inlined) that
// can be opened directly from disk by double-clicking it — no server needed.
import { build } from 'vite';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';

const outDir = 'dist-single/tmp';
await build({
  logLevel: 'warn',
  build: {
    outDir,
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000, // fonts become data: URIs inside the CSS
    cssCodeSplit: false,
    modulePreload: false,
  },
});

let html = await readFile(path.join(outDir, 'index.html'), 'utf8');
const assets = await readdir(path.join(outDir, 'assets'));
for (const file of assets) {
  const content = await readFile(path.join(outDir, 'assets', file), 'utf8');
  if (file.endsWith('.js')) {
    const tag = new RegExp(`<script[^>]*src="[^"]*${file.replace('.', '\\.')}"[^>]*></script>`);
    const safe = content.replace(/<\/script/gi, '<\\/script');
    html = html.replace(tag, () => '');
    html = html.replace('</body>', () => `<script type="module">\n${safe}\n</script>\n</body>`);
  } else if (file.endsWith('.css')) {
    const tag = new RegExp(`<link[^>]*href="[^"]*${file.replace('.', '\\.')}"[^>]*>`);
    html = html.replace(tag, () => `<style>\n${content}\n</style>`);
  }
}
await mkdir('dist-single', { recursive: true });
const target = 'dist-single/neon-tunnel.html';
await writeFile(target, html);
console.log(`wrote ${target} (${(html.length / 1024).toFixed(0)} KB)`);
