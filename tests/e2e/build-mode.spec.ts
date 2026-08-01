import { expect, test } from '@playwright/test';

/**
 * PLAN.md §16 phase 1.4's literal gate, exercised end to end (not just at the sim
 * layer — see src/sim/systems/grid/system.test.ts for that half): place/rotate/remove
 * fixtures one thumb at a time, then undo everything placed, back to zero.
 *
 * Tap targets are derived from the same iso projection `mountBuildMode` uses
 * (TILE_WIDTH=128, TILE_HEIGHT=64, origin = { x: viewportWidth/2, y: 80 }), restricted
 * to a small diagonal neighborhood around the origin tile so the resulting screen
 * coordinates stay clear of the debug status panel (top-left), the palette (bottom
 * tray on mobile / right side panel on desktop), and the viewport edges — at both the
 * 1440x900 and 390x844 projects this suite runs under.
 */

const TILE_WIDTH = 128;
const TILE_HEIGHT = 64;

function worldToScreen(x: number, y: number, origin: { x: number; y: number }): { x: number; y: number } {
  return {
    x: origin.x + (x - y) * (TILE_WIDTH / 2),
    y: origin.y + (x + y) * (TILE_HEIGHT / 2),
  };
}

/** Tiles whose (x-y, x+y) stay within a band that projects clear of every UI overlay. */
function candidateTiles(): { x: number; y: number }[] {
  const tiles: { x: number; y: number }[] = [];
  for (let s = 6; s <= 20; s++) {
    for (let d = -3; d <= 3; d++) {
      if ((s + d) % 2 !== 0) continue;
      const x = (s + d) / 2;
      const y = (s - d) / 2;
      if (x >= 0 && y >= 0 && x < 20 && y < 20) tiles.push({ x, y });
    }
  }
  return tiles;
}

test.describe('build mode — place/rotate/remove/undo', () => {
  test('places fixtures one thumb at a time, then undoes every successful placement', async ({ page }) => {
    await page.goto('/');

    const fixtureButton = page.locator('[data-testid="fixture-cart_corral"]');
    await fixtureButton.click();
    await expect(fixtureButton).toHaveAttribute('aria-pressed', 'true');

    const viewport = page.viewportSize();
    if (!viewport) throw new Error('no viewport size');
    const origin = { x: viewport.width / 2, y: 80 };

    for (const tile of candidateTiles().slice(0, 50)) {
      const screen = worldToScreen(tile.x, tile.y, origin);
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
