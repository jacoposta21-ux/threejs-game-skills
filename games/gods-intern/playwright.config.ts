import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  workers: 1,
  timeout: 900_000,
  expect: { timeout: 45_000 },
  use: {
    baseURL: 'http://127.0.0.1:5188',
    viewport: { width: 1440, height: 900 },
    trace: 'off',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
      // Optional: point at a preinstalled Chromium (e.g. CI images) instead of a Playwright download.
      executablePath: process.env.PW_CHROMIUM_PATH || undefined,
    },
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5188',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [{ name: 'desktop-chromium', use: { browserName: 'chromium' } }],
});
