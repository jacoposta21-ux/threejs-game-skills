import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the build runs from any folder (static hosts, CrazyGames, itch.io).
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
    chunkSizeWarningLimit: 900,
  },
});
