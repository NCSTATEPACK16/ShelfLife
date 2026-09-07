import { expect, test, type Page } from '@playwright/test';

/**
 * Orthogonal 3/4 projection (ADR 0004): screen = origin + tile * TILE_SIZE, integer zoom
 * only. Both this suite's viewports (1440x900, 390x844) resolve to zoom 1 for campaign's
 * 30x30 store grid, so screen math skips the zoom/camera-scroll terms `mountCampaign`
 * otherwise applies.
 */
function screenForOn(page: Page): (x: number, y: number) => { x: number; y: number } {
  const TILE_SIZE = 32;
  const STORE_TILES = 30;
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('no viewport size');
  const origin = {
    x: Math.round(Math.max(0, (viewport.width - STORE_TILES * TILE_SIZE) / 2)),
    y: 16,
  };
  return (x, y) => ({ x: origin.x + x * TILE_SIZE, y: origin.y + y * TILE_SIZE });
}

test.describe('campaign play — build then manage', () => {
  test('boots into build mode, places a shelf, toggles to manage mode, and every tab renders real content', async ({
    page,
  }) => {
    await page.goto('/');

    // Boots directly into build mode (matches build-mode.spec.ts's existing expectation).
    await expect(page.locator('[data-testid="fixture-shelf_basic"]')).toBeVisible();

    const screenFor = screenForOn(page);

    await page.locator('[data-testid="fixture-shelf_basic"]').click();
    // Tile (3,3), not (1,1): clear of the top HUD bar (56px) at both viewports.
    const target = screenFor(3, 3);
    await page.mouse.click(target.x, target.y);
    await expect(page.locator('[data-testid="placement-count"]')).not.toHaveText('0');

    // Toggle to manage mode.
    await page.locator('[data-testid="mode-toggle"]').click();
    await expect(page.locator('[data-testid="manage-tab-bar"]')).toBeVisible();

    await page.locator('[data-testid="manage-tab-objective"]').click();
    await expect(page.locator('[data-testid="objective-tab"]')).toBeVisible();

    await page.locator('[data-testid="manage-tab-finance"]').click();
    await expect(page.locator('[data-testid="finance-panel"]')).toBeVisible();

    await page.locator('[data-testid="manage-tab-pricing"]').click();
    await expect(page.locator('[data-testid="pricing-panel"]')).toBeVisible();

    await page.locator('[data-testid="manage-tab-staff"]').click();
    await expect(page.locator('[data-testid="staff-panel"]')).toBeVisible();
    await page.locator('[data-testid="staff-hire"]').click();
    await expect(page.locator('[data-testid^="staff-row-"]').first()).toBeVisible();

    await page.locator('[data-testid="manage-tab-inventory"]').click();
    await expect(page.locator('[data-testid="inventory-panel"]')).toBeVisible();

    await page.locator('[data-testid="manage-tab-rivals"]').click();
    await expect(page.locator('[data-testid="rivals-panel"]')).toBeVisible();
  });

  test('places fixtures one thumb at a time, then undoes every successful placement', async ({ page }) => {
    await page.goto('/');

    const fixtureButton = page.locator('[data-testid="fixture-cart_corral"]');
    await fixtureButton.click();
    await expect(fixtureButton).toHaveAttribute('aria-pressed', 'true');

    const screenFor = screenForOn(page);
    // A small diagonal neighbourhood a few tiles in from the origin — clear of the top HUD
    // bar, the palette (bottom tray on mobile / side panel on desktop), and the viewport edges.
    const candidates: { x: number; y: number }[] = [];
    for (let s = 6; s <= 14; s++) {
      for (let d = -3; d <= 3; d++) {
        if ((s + d) % 2 !== 0) continue;
        candidates.push({ x: (s + d) / 2, y: (s - d) / 2 });
      }
    }

    for (const tile of candidates.slice(0, 30)) {
      const screen = screenFor(tile.x, tile.y);
      await page.mouse.click(screen.x, screen.y);
    }

    const count = page.locator('[data-testid="placement-count"]');
    const placed = Number(await count.textContent());
    expect(placed).toBeGreaterThan(0);

    const undoButton = page.locator('[data-testid="undo"]');
    for (let i = 0; i < placed; i++) {
      await undoButton.click();
    }

    await expect(count).toHaveText('0');
    await expect(undoButton).toBeDisabled();
  });

  test('toggles the pathing debug overlay', async ({ page }) => {
    await page.goto('/');

    const toggle = page.locator('[data-testid="toggle-pathing-debug"]');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });
});
