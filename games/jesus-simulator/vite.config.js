import { defineConfig } from 'vite';

export default defineConfig({
  // relative base so the build works from any static host / iframe sub-path
  base: './',
  server: { host: '127.0.0.1', port: 5188, strictPort: true },
  preview: { host: '127.0.0.1', port: 4188, strictPort: true },
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 2600,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('@dimforge')) return 'rapier';
          if (id.includes('node_modules/three')) return 'three';
          return undefined;
        },
      },
    },
  },
});
