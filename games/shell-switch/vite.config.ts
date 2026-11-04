import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs: the build runs from any static host sub-path (CrazyGames, itch, GitHub Pages).
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
