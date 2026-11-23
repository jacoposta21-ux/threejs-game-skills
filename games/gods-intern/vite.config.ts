import { defineConfig } from 'vite';

export default defineConfig({
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
    sourcemap: true,
    // three.js (~85% of the bundle) goes in its own long-cacheable vendor chunk, so game
    // updates do not re-download the engine. Both chunks load in parallel via modulepreload.
    chunkSizeWarningLimit: 750,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/three/')) return 'three';
          return undefined;
        },
      },
    },
  },
});
