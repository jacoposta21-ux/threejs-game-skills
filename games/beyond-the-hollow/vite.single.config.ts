import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Builds one self-contained HTML file (JS, CSS and fonts inlined) for quick local testing.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: { outDir: 'dist-single', target: 'es2020', assetsInlineLimit: 100000000, chunkSizeWarningLimit: 5000 },
});
