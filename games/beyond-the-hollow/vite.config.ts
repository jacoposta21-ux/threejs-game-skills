import { defineConfig } from 'vite';

// Relative base so the build runs from any folder (CrazyGames uploads, itch, local file servers).
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
    rollupOptions: { output: { manualChunks: { phaser: ['phaser'] } } },
  },
  server: { host: '127.0.0.1', port: 5188 },
});
