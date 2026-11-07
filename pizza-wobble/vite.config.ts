import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 4000,
  },
  server: { port: 5173, host: '127.0.0.1' },
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 60000,
  },
} as never);
