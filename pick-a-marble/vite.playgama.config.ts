import { defineConfig, mergeConfig } from 'vite';
import playgamaBridge from '@playgama/bridge/vite';
import base from './vite.config';

// Playgama build: Bridge SDK from the official CDN (with the bundled copy as
// fallback), Playgama platform layer selected via VITE_TARGET.
export default mergeConfig(
  base,
  defineConfig({
    plugins: [playgamaBridge({ mode: 'cdn' })],
    define: { 'import.meta.env.VITE_TARGET': JSON.stringify('playgama') },
    build: { outDir: 'dist-playgama', emptyOutDir: true },
  }),
);
