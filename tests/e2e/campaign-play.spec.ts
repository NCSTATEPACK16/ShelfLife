import { expect, test } from '@playwright/test';

test.describe('campaign play — build then manage', () => {
  test('boots into build mode, places a shelf, toggles to manage mode, and every tab renders real content', async ({
    page,
  }) => {
    await page.goto('/');

    // Boots directly into build mode (matches build-mode.spec.ts's existing expectation).
    await expect(page.locator('[data-testid="fixture-shelf_basic"]')).toBeVisible();

    const viewport = page.viewportSize();
    if (!viewport) throw new Error('no viewport size');
    const origin = { x: viewport.width / 2, y: 80 };
    const TILE_WIDTH = 128;
    const TILE_HEIGHT = 64;
    const screenFor = (x: number, y: number) => ({
      x: origin.x + (x - y) * (TILE_WIDTH / 2),
      y: origin.y + (x + y) * (TILE_HEIGHT / 2),
    });

    await page.locator('[data-testid="fixture-shelf_basic"]').click();
    const target = screenFor(1, 1);
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
});
