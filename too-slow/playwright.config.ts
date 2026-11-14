import { defineConfig, devices } from '@playwright/test';

// Set PLAYWRIGHT_CHROMIUM_PATH to reuse a system/CI Chromium instead of Playwright's download.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: './tests',
  // One worker: parallel headless WebGL contexts contend for the GPU and skew game time.
  workers: 1,
  timeout: 780_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://127.0.0.1:5188',
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5188',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    {
      // TOO SLOW! targets desktop browsers (keyboard controls), so there is no mobile project.
      name: 'desktop-chrome',
      use: {
        ...devices['Desktop Chrome'],
        ...(executablePath ? { launchOptions: { executablePath, args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] } } : { channel: 'chromium' }),
        viewport: { width: 960, height: 540 },
      },
    },
  ],
});
