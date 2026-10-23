import { defineConfig, devices } from '@playwright/test';
// Dedicated test ports are inherited by both dev children; no server reuse can
// accidentally test another worktree. Override when running suites concurrently.
const webPort = process.env.E2E_WEB_PORT || '15173';
const apiPort = process.env.E2E_API_PORT || '18080';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node scripts/dev.mjs',
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
    url: `http://127.0.0.1:${webPort}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { WEB_PORT: webPort, API_PORT: apiPort, EXHIBIT_STORE: 'demo' },
  },
});
