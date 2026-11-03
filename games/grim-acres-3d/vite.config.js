import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { copyFileSync } from 'node:fs';

// Builds:
//   vite build --mode crazygames  -> dist-crazygames/  (CrazyGames SDK v3, js/platform.js)
//   vite build --mode playgama    -> dist-playgama/    (Playgama Bridge, js/platform-playgama.js)
//   vite build                    -> dist/             (same as crazygames; SDK is optional and guarded)
export default defineConfig(({ mode }) => {
  const playgama = mode === 'playgama';
  const outDir = mode === 'crazygames' || playgama ? `dist-${mode}` : 'dist';
  return {
    base: './',
    build: { target: 'es2020', chunkSizeWarningLimit: 1200, outDir, emptyOutDir: true },
    plugins: [{
      name: 'grim-platform',
      enforce: 'pre',
      async resolveId(source, importer) {
        if (playgama && importer && /(^|\/)platform\.js$/.test(source)) return resolve(__dirname, 'js/platform-playgama.js');
        return null;
      },
      transformIndexHtml(html) {
        if (!playgama) return html;
        return html.replace(/<script src="https:\/\/sdk\.crazygames\.com[^>]*><\/script>/, '<script src="./playgama-bridge.js"></script>');
      },
      closeBundle() {
        if (!playgama) return;
        copyFileSync(resolve(__dirname, 'node_modules/@playgama/bridge/dist/playgama-bridge.js'), resolve(__dirname, outDir, 'playgama-bridge.js'));
        copyFileSync(resolve(__dirname, 'playgama-bridge-config.json'), resolve(__dirname, outDir, 'playgama-bridge-config.json'));
      },
    }],
  };
});
