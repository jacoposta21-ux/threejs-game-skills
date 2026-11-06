import { defineConfig } from 'vite';
import playgamaBridge from '@playgama/bridge/vite';

export default defineConfig({
  // Relative asset URLs: the build runs from any static host sub-path (CrazyGames, itch, GitHub Pages).
  base: './',
  // Playgama Bridge SDK: first script in <head>, shipped inside the build (no CDN at runtime).
  plugins: [playgamaBridge({ mode: 'local' })],
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
