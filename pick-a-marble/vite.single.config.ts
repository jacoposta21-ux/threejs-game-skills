import { defineConfig, mergeConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import base from './vite.config';

// Single self-contained HTML (double-click to play, no server needed).
export default mergeConfig(
  base,
  defineConfig({
    plugins: [viteSingleFile()],
    build: { outDir: 'dist-single', assetsInlineLimit: 100_000_000, cssCodeSplit: false },
  }),
);
