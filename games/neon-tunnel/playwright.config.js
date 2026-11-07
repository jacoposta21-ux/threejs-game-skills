import { defineConfig, devices } from '@playwright/test';

// Uses a full Chromium build so WebGL renders on the GPU where available.
// Set PW_CHROME to a Chromium executable if the bundled browser is not installed.
const launchOptions = process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {};

export default defineConfig({
  testDir: './tests',
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://127.0.0.1:5188',
    trace: 'off',
    screenshot: 'only-on-failure',
    launchOptions,
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5188',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'], channel: 'chromium', viewport: { width: 1280, height: 720 } },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium', channel: 'chromium' },
    },
  ],
});
