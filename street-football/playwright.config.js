import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';

// Use a system Chromium when the bundled one is not installed (CI images, sandboxes).
const systemChrome = process.env.CHROME_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const launchOptions = systemChrome ? { executablePath: systemChrome } : {};
const port = Number(process.env.PORT || 5188);

export default defineConfig({
  testDir: './tests',
  workers: 1,
  timeout: 300_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'off',
    screenshot: 'only-on-failure',
    launchOptions,
  },
  webServer: {
    command: process.env.PREVIEW ? `npx vite preview --port ${port} --strictPort` : 'npm run dev',
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'], viewport: { width: 960, height: 540 } } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
  ],
});
