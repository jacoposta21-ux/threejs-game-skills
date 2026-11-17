import { defineConfig } from 'vite';

// PLATFORM=crazygames adds the CrazyGames SDK v3 script tag (see src/platform/Platform.js).
// Every other build stays self-contained and makes no third-party requests.
const platform = process.env.PLATFORM || '';
const crazygamesSdk = {
  name: 'crazygames-sdk',
  transformIndexHtml(html) {
    if (platform !== 'crazygames') return html;
    return html.replace('</title>', '</title>\n    <script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>');
  },
};

export default defineConfig({
  base: './',
  plugins: [crazygamesSdk],
  server: { host: '127.0.0.1', port: 5188 },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000, outDir: platform === 'crazygames' ? 'dist-crazygames' : 'dist' },
});
