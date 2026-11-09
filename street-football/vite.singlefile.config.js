import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// One self-contained HTML file (double-click to play, works from file://):
// every script, style, font, model and the physics WASM are inlined. Rapier
// uses the -compat build, whose WASM is embedded and initialised in JS.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  resolve: {
    alias: { '@dimforge/rapier3d': '@dimforge/rapier3d-compat' },
  },
  build: {
    target: 'es2022',
    outDir: 'dist-single',
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 20000,
    sourcemap: false,
  },
});
