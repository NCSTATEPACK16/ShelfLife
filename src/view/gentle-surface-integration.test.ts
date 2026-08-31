import { describe, expect, it } from 'vitest';
import { BuildModeBridge } from '../bridge/build-bridge.js';
import { TICKS_PER_SIM_DAY } from '../sim/index.js';
import {
  createGentleSurfaceState,
  gentleSurfaceDrawPlan,
  tellFor,
} from './gentle-surface-draw-plan.js';
import { buildShopperDrawPlan, ShopperAnimator } from './shopper-draw-plan.js';

/**
 * The whole chain, against a real simulation: World -> bridge -> draw plan -> sprites.
 *
 * `gentle-surface-draw-plan.test.ts` proves each trigger against hand-built snapshots,
 * which is the only way to test the ones the sim reaches rarely. This file proves the
 * other half — that the counters the bridge exposes actually move the way the triggers
 * expect when a real store runs. A delta check against a field the sim never increments
 * passes every unit test in the suite and shows nothing in the game.
 *
 * Deterministic by construction: the sim has no `Math.random` and no `Date.now`, so this
 * store plays out identically every run.
 */

const GOODS = ['milk', 'bread', 'eggs', 'snacks'];

/** A store under real pressure: four aisles, one self-checkout, a queue that builds. */
function crowdedStore(households: number) {
  const bridge = new BuildModeBridge({ width: 24, height: 24 });
  GOODS.forEach((good, i) => {
    bridge.place('shelf_basic', 2 + i * 3, 5, 0);
    bridge.stockFixture(bridge.snapshot().placements.at(-1)!.instanceId, good);
  });
  // Self-checkout rather than a staffed register: no command assigns staff, so a
  // `register` never opens a lane and every shopper balks before queueing at all.
  bridge.place('self_checkout', 6, 18, 0);
  for (let id = 1; id <= households; id++) {
    bridge.addHousehold(id, 'family', { x: id % 5, y: 0 });
  }
  // Households start with a full pantry and therefore an empty list. Five sim days of
  // consumption is what gives them something to come shopping for.
  for (let i = 0; i < TICKS_PER_SIM_DAY * 5; i++) bridge.tick();
  return bridge;
}

function play(households: number, ticks: number) {
  const bridge = crowdedStore(households);
  const state = createGentleSurfaceState();
  const animator = new ShopperAnimator();
  const seen = new Map<string, number>();
  let spawned = 0;

  for (let i = 0; i < ticks; i++) {
    if (spawned < households) bridge.spawnShopper(10_000 + spawned, ++spawned);
    bridge.tick();

    const shoppers = bridge.shoppersSnapshot();
    const plan = gentleSurfaceDrawPlan(
      {
        events: bridge.drainEvents(),
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
  const seen = play(300, 2000);
  const icon = (term: string): string => `bubble_${tellFor(term).bubble}`;

  it('shows the fill-rate miss — the tell the design doc calls the most important', () => {
    // Emergent, not staged: shoppers arrive with lists, the shelves run dry, and the sim
    // starts returning `outOfStock`. Nothing in this scenario asks for it directly.
    expect(seen.get(icon('fillRateMiss')) ?? 0).toBeGreaterThan(0);
  });

  it('shows the rising-queue clock once one lane cannot keep up', () => {
    expect(seen.get(icon('queuePenaltyRising')) ?? 0).toBeGreaterThan(0);
  });

  it('does not flash a tint for the fill-rate miss', () => {
    // The miss's world mark is the shelf's own empty facing (gentle-surface.md §1), not a
    // colour. This scenario produces thousands of misses and no price surprises or spoiled
    // pickups, so any mark at all here means the wrong term is painting the store — which
    // is exactly what the first browser screenshot of this phase showed.
    expect(seen.get(icon('fillRateMiss')) ?? 0).toBeGreaterThan(0);
    expect(seen.get('worldMark') ?? 0).toBe(0);
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
