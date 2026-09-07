import { expect, test, type Page } from '@playwright/test';

/**
 * Phase S3's gate, in a real browser at both viewports: a store under pressure shows its
 * shoppers reacting, and the bubbles, world marks and reaction poses are actually drawn.
 *
 * `src/view/gentle-surface-integration.test.ts` already proves the same chain headlessly
 * and far faster. What only a browser can prove is the last hop — that the frame keys the
 * draw plan names exist in the packed atlases and that Phaser draws them without throwing.
 * A missing frame is a runtime error in the renderer and is invisible to every unit test
 * in the suite, because nothing outside a browser ever loads an atlas.
 *
 * The scenario is emergent, not staged: shoppers arrive with real shopping lists, the
 * shelves run dry, and a single self-checkout cannot keep up. Nothing asks for a tell
 * directly. Two of the seven live terms surface this way — the fill-rate miss and the
 * rising queue — along with the reaction poses they trigger. The other five are exercised
 * against hand-built snapshots in the unit tests, which is the only way to reach the ones
 * a healthy store produces rarely, and one of them — the cart abandonment — the sim cannot
 * currently be driven into at all from the bridge (see CHANGELOG).
 */

/** The dev-only handle `src/main.ts` publishes. Typed here rather than in the app. */
interface ShelfLifeHandle {
  bridge: {
    place(fixtureId: string, x: number, y: number, rotation: number): void;
    stockFixture(instanceId: number, goodId: string): void;
    addHousehold(householdId: number, segment: string, position: { x: number; y: number }): void;
    spawnShopper(shopperId: number, householdId: number): void;
    snapshot(): { placements: { instanceId: number }[] };
    shoppersSnapshot(): unknown[];
    tick(): void;
  };
  scene: {
    redraw(): void;
    tellCounts(): {
      bubbles: number;
      worldMarks: number;
      particles: number;
      cartMarkers: number;
      poses: number;
    } | null;
  };
}

declare global {
  var shelfLife: ShelfLifeHandle | undefined;
}

const GOODS = ['milk', 'bread', 'eggs', 'snacks'];
const HOUSEHOLDS = 300;
const WARM_UP_DAYS = 5;

/**
 * Where the store gets built.
 *
 * Everything sits inside the region both viewports can see without panning: a 1440x900
 * desktop draws at 2x and shows rows 0-13, a 390x844 phone draws at 1x and shows columns
 * 0-12. A tell drawn outside that box is a tell the screenshot cannot testify about.
 */
const SHELF_COLUMNS = [1, 4, 7, 10];
const SHELF_ROW = 3;
const CHECKOUT = { x: 4, y: 9 };

/**
 * Households are spread across segments rather than all being one, so the screenshot
 * shows the palette swap the game actually ships with — seven kinds of customer for the
 * cost of one sprite (ADR 0006) — instead of a crowd of identical people.
 */
const SEGMENTS = ['priceHunter', 'convenience', 'family', 'foodie', 'bulk', 'senior', 'student'];

/** Peak tell counts over a stretch of play. A single frame can easily be a calm one. */
async function playUntilTellsAppear(page: Page): Promise<{
  bubbles: number;
  worldMarks: number;
  poses: number;
  ticks: number;
}> {
  return page.evaluate(
    ({ goods, households, warmUpDays, columns, row, checkout, segments }) => {
      const handle = globalThis.shelfLife;
      if (!handle) throw new Error('window.shelfLife is missing — is this a dev build?');
      const { bridge, scene } = handle;

      goods.forEach((good, i) => {
        bridge.place('shelf_basic', columns[i]!, row, 0);
        const placements = bridge.snapshot().placements;
        bridge.stockFixture(placements[placements.length - 1]!.instanceId, good);
      });
      // A staffed register never opens a lane — no command assigns staff — so every
      // shopper would balk before queueing. Self-checkout is the lane that can back up.
      bridge.place('self_checkout', checkout.x, checkout.y, 0);
      for (let id = 1; id <= households; id++) {
        bridge.addHousehold(id, segments[id % segments.length]!, { x: id % 5, y: 0 });
      }

      // Households start with a full pantry and an empty list; days of consumption are
      // what give them something to shop for.
      const TICKS_PER_SIM_DAY = 1440;
      for (let i = 0; i < TICKS_PER_SIM_DAY * warmUpDays; i++) bridge.tick();

      // Deliberately synchronous, with no yield anywhere in it. `mountBuildMode` runs its
      // own `setInterval` that ticks the world and redraws; yielding hands control to it
      // and the two tick loops interleave differently depending on how loaded the machine
      // is, which made this test pass alone and fail whenever a second worker was running.
      // Blocking the page for the duration is the price of a scenario that plays out the
      // same way every time.
      const peak = { bubbles: 0, worldMarks: 0, poses: 0 };
      let spawned = 0;
      let ticks = 0;
      for (let i = 0; i < 2000; i++) {
        // Shoppers keep arriving rather than all being spawned at the start, so the store
        // is still busy when the loop stops. A screenshot of the aftermath shows an empty
        // aisle, which proves nothing about a surface whose whole job is to be calm when
        // there is nothing wrong.
        if (i % 3 === 0) bridge.spawnShopper(10_000 + spawned, (spawned++ % households) + 1);
        bridge.tick();
        scene.redraw();
        ticks++;
        const counts = scene.tellCounts();
        if (counts === null) throw new Error('the scene never finished booting');
        peak.bubbles = Math.max(peak.bubbles, counts.bubbles);
        peak.worldMarks = Math.max(peak.worldMarks, counts.worldMarks);
        peak.poses = Math.max(peak.poses, counts.poses);
        // Stop on a frame that has something to show. The page's own interval keeps the
        // store running afterwards, so the screenshot lands on a live store rather than
        // on a freeze-frame of one.
        if (i > 400 && counts.bubbles > 0 && counts.poses > 0) break;
      }
      return { ...peak, ticks };
    },
    {
      goods: GOODS,
      households: HOUSEHOLDS,
      warmUpDays: WARM_UP_DAYS,
      columns: SHELF_COLUMNS,
      row: SHELF_ROW,
      checkout: CHECKOUT,
      segments: SEGMENTS,
    },
  );
}

test.describe('the gentle surface, in a browser', () => {
  test('a store under pressure shows its shoppers reacting', async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/');
    await expect(page.locator('[data-testid="placement-count"]')).toBeVisible();
    // The UI panel mounts synchronously, but the Phaser scene does not: `create()` runs
    // on the first frame of the game loop, and `redraw()` is a no-op until it has. The
    // scenario below never yields, so it has to start from a scene that is already up.
    await page.waitForFunction(() => globalThis.shelfLife?.scene.tellCounts() !== null);

    const peak = await playUntilTellsAppear(page);

    // A missing atlas frame throws inside Phaser rather than failing a draw call, so this
    // is the assertion the browser exists for.
    expect(errors).toEqual([]);

    expect(peak.bubbles).toBeGreaterThan(0);
    expect(peak.poses).toBeGreaterThan(0);
    // No tint flash: this store's tell is the fill-rate miss, whose world mark is the
    // shelf's own empty facing rather than a colour (docs/design/gentle-surface.md §1).
    expect(peak.worldMarks).toBe(0);

    // Silence is a feature (docs/design/gentle-surface.md §3): the cap is 8 at regular and
    // 4 at compact, and a store that exceeds it is noise rather than telemetry.
    const cap = testInfo.project.name === 'mobile' ? 4 : 8;
    expect(peak.bubbles).toBeLessThanOrEqual(cap);

    await page.screenshot({ path: testInfo.outputPath('gentle-surface.png'), fullPage: false });
    await testInfo.attach('gentle-surface', {
      path: testInfo.outputPath('gentle-surface.png'),
      contentType: 'image/png',
    });
  });
});
