// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Boot smoke test.
 *
 * Phase 2.3 dropped the phase-1.0 diagnostic boot panel (it existed only to verify the
 * platform seam before any real screen existed — see docs/superpowers/specs/
 * 2026-09-03-ui-buildout-design.md §2) in favor of booting straight into `mountCampaign`.
 * This asserts the boot path actually executes rather than trusting that a green build
 * implies a working page — runtime blindness is exactly what bites during renderer/UI
 * phases (PLAN.md §17.4), so the habit continues here even without the old panel to assert on.
 */

async function boot(): Promise<void> {
  vi.resetModules();
  await import('../../src/main.js');
}

describe('boot', () => {
  beforeEach(() => {
    document.body.innerHTML = '<canvas id="game-canvas"></canvas><div id="ui-root"></div>';
    // jsdom has no canvas backend; main.ts (via mountCampaign) must degrade rather than throw.
    HTMLCanvasElement.prototype.getContext = (() => null) as never;
  });

  it('boots without throwing when the canvas has no real rendering context', async () => {
    await expect(boot()).resolves.toBeUndefined();
  });

  it('fails loudly if the document is missing its mount points', async () => {
    document.body.innerHTML = '';
    await expect(boot()).rejects.toThrow(/Boot failed/);
  });
});
