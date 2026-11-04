import { defineConfig, mergeConfig } from 'vite';
import { readFileSync } from 'node:fs';
import playgamaBridge from '@playgama/bridge/vite';
import base from './vite.config';

// Playgama build: `npm run build:playgama` → dist-playgama/ (zip its contents).
// The official plugin loads Playgama Bridge from the CDN with the bundled copy as a fallback,
// and playgama-bridge-config.json sits next to index.html as the SDK expects.
export default mergeConfig(base, defineConfig({
  define: { 'import.meta.env.VITE_PORTAL': JSON.stringify('playgama') },
  plugins: [
    playgamaBridge(),
    {
      name: 'playgama-config',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'playgama-bridge-config.json', source: readFileSync('portal/playgama/playgama-bridge-config.json', 'utf8') });
      },
    },
  ],
  build: { outDir: 'dist-playgama', emptyOutDir: true },
}));
