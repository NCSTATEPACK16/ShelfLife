import { defineConfig, devices } from '@playwright/test';

/**
 * PLAN.md §11.4 — every interactive surface is checked at a desktop and a phone
 * viewport. `webServer` boots the real Vite dev build so the E2E suite exercises actual
 * bundled code, not a mock.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  retries: 0,
  use: {
    baseURL: 'http://localhost:5173',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
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
