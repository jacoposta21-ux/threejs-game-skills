import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/** Single self-contained HTML build: `npm run build:single` → dist-single/index.html */
export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    outDir: 'dist-single',
    sourcemap: false,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 5000,
  },
});
