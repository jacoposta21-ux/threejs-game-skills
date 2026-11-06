import { defineConfig } from 'vite';

export default defineConfig({
  // relative asset paths so dist/ can be zipped and hosted anywhere (CrazyGames, itch, static hosts)
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5188,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4188,
    strictPort: true,
  },
  build: {
    sourcemap: false,
    target: 'es2020',
    assetsInlineLimit: 0,
    // Rapier's compat build inlines its WASM (~3.5 MB raw, ~1.3 MB gzipped) into the bundle.
    chunkSizeWarningLimit: 6000,
  },
});
