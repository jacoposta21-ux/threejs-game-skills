import { defineConfig, type Plugin } from 'vite';
import playgamaBridge from '@playgama/bridge/vite';

/** CrazyGames build: their SDK v3 must load from their CDN before the game script. */
const crazyGamesSdk: Plugin = {
  name: 'crazygames-sdk',
  transformIndexHtml: () => [
    { tag: 'script', attrs: { src: 'https://sdk.crazygames.com/crazygames-sdk-v3.js' }, injectTo: 'head-prepend' },
  ],
};

export default defineConfig(({ mode }) => ({
  // Relative asset URLs: the build runs from any static host sub-path (CrazyGames, itch, GitHub Pages).
  base: './',
  // Playgama Bridge SDK: first script in <head>, shipped inside the build (no CDN at runtime).
  plugins: mode === 'crazygames' ? [crazyGamesSdk] : [playgamaBridge({ mode: 'local' })],
  // public/ only holds the Playgama Bridge config.
  publicDir: mode === 'crazygames' ? false : 'public',
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
    outDir: mode === 'crazygames' ? 'dist-crazygames' : 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
}));
