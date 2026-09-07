import { beforeAll, describe, expect, it } from 'vitest';
import { CampaignBridge } from '../bridge/campaign-bridge.js';
import { TICKS_PER_SIM_DAY } from '../sim/index.js';
import {
  createGentleSurfaceState,
  gentleSurfaceDrawPlan,
  tellFor,
} from './gentle-surface-draw-plan.js';
import { buildShopperDrawPlan, ShopperAnimator } from './shopper-draw-plan.js';
import type { TellTerm } from '../sim/content/gentle-surface.js';

/**
 * The whole chain, against a real simulation: World -> bridge -> draw plan -> sprites.
 *
 * `gentle-surface-draw-plan.test.ts` proves each trigger's rendering against hand-built
 * tells. This file proves the other half — that a real running store actually produces
 * tells the bridge hands to this module, and that the render chain turns them into
 * sprites without throwing. A delta check against a field the sim never increments passes
 * every unit test in the suite and shows nothing in the game; this file is what would
 * catch that instead.
 *
 * Deterministic by construction: the sim has no `Math.random` and no `Date.now`, so this
 * store plays out identically every run.
 */

/** A store under real pressure: level l1's baseline fixtures, one crowded rush of households. */
async function play(households: number, ticks: number) {
  const bridge = CampaignBridge.start('l1', 20260906);
  for (let id = 1; id <= households; id++) {
    bridge.addHousehold(id, 'family', { x: id % 5, y: 0 });
  }
  // Households start with a full pantry and therefore an empty list. Five sim days of
  // consumption is what gives them something to come shopping for.
  for (let i = 0; i < TICKS_PER_SIM_DAY * 5; i++) await bridge.tick();
  bridge.pendingTells(); // discard anything the warm-up itself fired

  const state = createGentleSurfaceState();
  const animator = new ShopperAnimator();
  const seen = new Map<string, number>();
  let spawned = 0;

  // A burst, not a trickle: level l1's baseline store has exactly two lanes (one staffed
  // register, one self-checkout). Spawning gradually across all 2000 ticks would let
  // those two lanes keep pace with arrivals forever — this needs the queue to actually
  // back up, so most of the crowd arrives well before the lanes could ever catch up.
  const SPAWNS_PER_TICK = 5;

  for (let i = 0; i < ticks; i++) {
    for (let s = 0; s < SPAWNS_PER_TICK && spawned < households; s++) {
      bridge.spawnShopper(10_000 + spawned, ++spawned);
    }
    await bridge.tick();

    const shoppers = bridge.shoppersSnapshot();
    const plan = gentleSurfaceDrawPlan(
      {
        tells: bridge.pendingTells(),
        shoppers,
        snapshot: bridge.snapshot(),
        tick: bridge.currentTick(),
        origin: { x: 0, y: 0 },
        breakpoint: 'regular',
      },
      state,
    );
    // Drive the shopper plan too: an override naming a pose the manifest does not declare
    // throws inside `frameKey`, and this is where that would surface.
    buildShopperDrawPlan(shoppers, { x: 0, y: 0 }, animator, {
      animationOverrides: plan.animationOverrides,
    });

    for (const sprite of plan.bubbles) {
      if (sprite.key !== 'bubble_frame') seen.set(sprite.key, (seen.get(sprite.key) ?? 0) + 1);
    }
    if (plan.worldMarks.length > 0) seen.set('worldMark', (seen.get('worldMark') ?? 0) + 1);
    if (plan.animationOverrides.size > 0) seen.set('pose', (seen.get('pose') ?? 0) + 1);
  }
  return seen;
}

describe('a real store, running', () => {
  const icon = (term: TellTerm): string => `bubble_${tellFor(term).bubble}`;
  let seen: Map<string, number>;

  beforeAll(async () => {
    seen = await play(300, 2000);
  }, 20_000);

  it('shows the fill-rate miss — the tell the design doc calls the most important', () => {
    // Emergent, not staged: shoppers arrive with lists, the shelves run dry, and the sim
    // starts returning `outOfStock`. Nothing in this scenario asks for it directly.
    expect(seen.get(icon('fillRateMiss')) ?? 0).toBeGreaterThan(0);
  });

  it('shows the rising-queue clock once the lane cannot keep up', () => {
    expect(seen.get(icon('queuePenaltyRising')) ?? 0).toBeGreaterThan(0);
  });

  it('does not flash a tint for the fill-rate miss', () => {
    // The miss's world mark is the shelf's own empty facing (gentle-surface.md §1), not a
    // colour. A `worldMark` count meaningfully above the spoil/price-surprise rate here
    // means the wrong term is painting the store — which is exactly what the first
    // browser screenshot of this phase showed.
    expect(seen.get(icon('fillRateMiss')) ?? 0).toBeGreaterThan(0);
    const spoiledOrSurprised =
      (seen.get(icon('spoiledEncounters')) ?? 0) + (seen.get(icon('priceSurpriseNegative')) ?? 0);
    expect(seen.get('worldMark') ?? 0).toBeLessThanOrEqual(spoiledOrSurprised);
  });

  it('puts shoppers into reaction poses', () => {
    expect(seen.get('pose') ?? 0).toBeGreaterThan(0);
  });

  it('stays calm — a busy store is not a wall of bubbles', () => {
    // The corollary to §3: if this scenario lit up every shopper on every tick, the cap
    // and the thresholds would not be doing their job, and the surface would be noise.
    const bubbleTicks = [...seen.entries()]
      .filter(([key]) => key.startsWith('bubble_'))
      .reduce((sum, [, count]) => sum + count, 0);
    expect(bubbleTicks).toBeLessThan(2000 * 8);
  });
});
