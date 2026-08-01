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
      name: 'mobile',
      use: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } },
    },
  ],
});
