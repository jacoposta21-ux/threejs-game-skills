#!/usr/bin/env node
// After `vite build`, produces dist-single/index.html with the JS and CSS inlined
// and every model in public/assets embedded as a data: URI, so the game runs
// from one self-contained HTML file (used for the hosted artifact).
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

const dist = 'dist';
let html = await readFile(path.join(dist, 'index.html'), 'utf8');

// inline CSS
for (const m of [...html.matchAll(/<link rel="stylesheet"[^>]*href="\.?\/?([^"]+\.css)"[^>]*>/g)]) {
  const css = await readFile(path.join(dist, m[1]), 'utf8');
  html = html.replace(m[0], () => `<style>${css}</style>`);
}

// collect assets as data URIs
const assets = {};
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p);
    else if (/\.(glb|gltf|bin)$/.test(e.name)) {
      const rel = path.relative(dist, p).split(path.sep).join('/');
      const buf = await readFile(p);
      const mime = e.name.endsWith('.glb') ? 'model/gltf-binary' : e.name.endsWith('.gltf') ? 'model/gltf+json' : 'application/octet-stream';
      if (e.name.endsWith('.gltf')) {
        // make the .bin reference absolute-to-map so the loader resolves it via the URL modifier
        assets[rel] = `data:${mime};base64,${buf.toString('base64')}`;
      } else assets[rel] = `data:${mime};base64,${buf.toString('base64')}`;
    }
  }
}
await walk(path.join(dist, 'assets'));
const assetScript = `<script>window.__VM_ASSETS__=${JSON.stringify(assets)};</script>`;

// inline JS module
for (const m of [...html.matchAll(/<script type="module" crossorigin src="\.?\/?([^"]+\.js)"><\/script>/g)]) {
  const js = (await readFile(path.join(dist, m[1]), 'utf8')).replace(/<\/script/gi, '<\\/script');
  html = html.replace(m[0], () => `${assetScript}<script type="module">${js}</script>`);
}

await mkdir('dist-single', { recursive: true });
await writeFile('dist-single/index.html', html);
console.log(`dist-single/index.html ${(html.length / 1024 / 1024).toFixed(2)} MB, ${Object.keys(assets).length} embedded assets`);
