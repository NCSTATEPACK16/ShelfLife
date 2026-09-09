import { defineConfig, devices } from '@playwright/test';

/**
 * PLAN.md §11.4 — every interactive surface is checked at a desktop and a phone
 * viewport. `webServer` boots the real Vite dev build so the E2E suite exercises actual
 * bundled code, not a mock.
 */
/**
 * Vite's default port, overridable.
 *
 * `reuseExistingServer` will happily adopt whatever is already listening on the port —
 * including a completely different project's dev server, which then fails every test with
 * a missing selector rather than an obvious error. Setting `PLAYWRIGHT_PORT` is the way
 * out when 5173 is already spoken for.
 */
const PORT = process.env.PLAYWRIGHT_PORT ?? '5173';
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  retries: 0,
  use: {
    baseURL: BASE_URL,
  },
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      // Chromium rather than devices['iPhone 13'] (WebKit) — only Chromium is
      // installed locally/in CI (see docs/handoff.md); touch emulation still works
      // via isMobile/hasTouch on Chromium.
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        defaultBrowserType: 'chromium',
      },
    },
  ],
});
