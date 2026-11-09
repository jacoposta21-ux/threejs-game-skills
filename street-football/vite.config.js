import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  // Relative base: the build works from any static path (CrazyGames serves from a CDN subfolder).
  base: './',
  // Rapier ships wasm-bindgen ESM: the plugin serves its .wasm as a separate,
  // streamed and cacheable file instead of base64 inside the JS bundle.
  plugins: [wasm()],
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
    // es2022: top-level await (wasm module init) without a polyfill plugin.
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules/@dimforge')) return 'rapier';
          return undefined;
        },
      },
    },
  },
});
