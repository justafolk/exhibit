import { defineConfig, devices } from '@playwright/test';
import { execFileSync } from 'node:child_process';
// Dedicated test ports are inherited by both dev children; no server reuse can
// accidentally test another worktree. Override when running suites concurrently.
const webPort = process.env.E2E_WEB_PORT || '15173';
const apiPort = process.env.E2E_API_PORT || '18080';
// Capture the checkout when Playwright starts, not later during collection.
// A JSON report remains self-reported metadata, never a trusted verdict.
const captureMetadata =
  process.env.EXHIBIT_CAPTURE === '1'
    ? {
        exhibitCapture: {
          schemaVersion: 1,
          headSha: execFileSync('git', ['rev-parse', 'HEAD'], {
            cwd: __dirname,
            encoding: 'utf8',
          }).trim(),
          dirty:
            execFileSync('git', ['status', '--porcelain'], {
              cwd: __dirname,
              encoding: 'utf8',
            }).trim().length > 0,
        },
      }
    : {};
export default defineConfig({
  testDir: './tests/e2e',
  metadata: captureMetadata,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    trace: process.env.EXHIBIT_CAPTURE === '1' ? 'on' : 'retain-on-failure',
    video: process.env.EXHIBIT_CAPTURE === '1' ? 'on' : 'off',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node scripts/dev.mjs',
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
    url: `http://127.0.0.1:${webPort}/api/healthz`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      WEB_PORT: webPort,
      API_PORT: apiPort,
      EXHIBIT_STORE: 'demo',
      EXHIBIT_COOKIE_SECURE: 'false',
      EXHIBIT_PUBLIC_ORIGIN: `http://127.0.0.1:${webPort}`,
    },
  },
});
