import { expect, test, type Page } from '@playwright/test';

/**
 * Orthogonal 3/4 projection (ADR 0004): screen = (origin + tile * TILE_SIZE) * zoom,
 * integer zoom only. `mountCampaign` fits a 16-tile reference window (not the whole
 * 30-tile store) into the viewport, so desktop's 1440px viewport now resolves to zoom 2
 * while mobile's 390px viewport still resolves to zoom 1 — this has to mirror that
 * exactly (`fitZoom`/`ZOOM_REFERENCE_TILES` in src/view/campaign-mode.ts and
 * src/view/projection.ts) or clicks land on the wrong tile.
 */
function screenForOn(page: Page): (x: number, y: number) => { x: number; y: number } {
  const TILE_SIZE = 32;
  const STORE_TILES = 30;
  const ZOOM_REFERENCE_TILES = 16;
  const ZOOM_STEPS = [1, 2, 3, 4];
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('no viewport size');

  const referenceTiles = Math.min(STORE_TILES, ZOOM_REFERENCE_TILES);
  const ideal = viewport.width / (referenceTiles * TILE_SIZE);
  const zoom = ZOOM_STEPS.filter((step) => step <= ideal).at(-1) ?? ZOOM_STEPS[0]!;

  const origin = {
    x: Math.round(Math.max(0, (viewport.width / zoom - STORE_TILES * TILE_SIZE) / 2)),
    y: 16,
  };
  return (x, y) => ({
    x: (origin.x + x * TILE_SIZE) * zoom,
    y: (origin.y + y * TILE_SIZE) * zoom,
  });
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
