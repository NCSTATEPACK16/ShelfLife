import { describe, expect, it } from 'vitest';
import type { BuildModeSnapshot, ShopperSnapshot } from '../bridge/build-bridge.js';
import { DEFAULT_CATALOG, DEFAULT_STAFFING_CONFIG, type SimEvent } from '../sim/index.js';
import {
  createGentleSurfaceState,
  gentleSurfaceDrawPlan,
  queuePenalty,
  tellFor,
  TUNING,
  type GentleSurfaceInput,
  type GentleSurfaceState,
} from './gentle-surface-draw-plan.js';
import { depthFor, TILE_SIZE } from './projection.js';
import { assetById } from './asset-manifest.js';

/**
 * The gentle surface is the game's primary telemetry (docs/design/gentle-surface.md §12.1),
 * and every one of its triggers is a delta over counters nobody can see. That combination —
 * load-bearing and invisible — is exactly what this file exists for: a tell that quietly
 * stops firing is a bug the screenshot pass will not catch, because a calm store and a
 * broken store look identical.
 */

const SHOPPER_HEIGHT = assetById('shopper').size[1];

const SHELF = { instanceId: 1, fixtureId: 'shelf_basic', x: 5, y: 5, rotation: 0 as const };

const SNAPSHOT: BuildModeSnapshot = {
  dimensions: { width: 20, height: 20 },
  catalog: DEFAULT_CATALOG,
  placements: [SHELF],
};

function shopper(overrides: Partial<ShopperSnapshot> = {}): ShopperSnapshot {
  return {
    id: 1,
    x: 5,
    y: 6,
    state: 'shopping',
    segment: 'family',
    listRemaining: 3,
    cartSize: 0,
    spoiledEncounters: 0,
    priceSurpriseSum: 0,
    impulseHits: 0,
    balked: false,
    abandoned: false,
    checkoutJoinedAtTick: null,
    ...overrides,
  };
}

function input(overrides: Partial<GentleSurfaceInput> = {}): GentleSurfaceInput {
  return {
    events: [],
    shoppers: [shopper()],
    snapshot: SNAPSHOT,
    tick: 1,
    origin: { x: 0, y: 0 },
    breakpoint: 'regular',
    ...overrides,
  };
}

/** Establish a previous-tick baseline, then step once with the changed shopper. */
function step(
  before: ShopperSnapshot,
  after: ShopperSnapshot,
  overrides: Partial<GentleSurfaceInput> = {},
): { plan: ReturnType<typeof gentleSurfaceDrawPlan>; state: GentleSurfaceState } {
  const state = createGentleSurfaceState();
  gentleSurfaceDrawPlan(input({ tick: 1, shoppers: [before], ...overrides }), state);
  const plan = gentleSurfaceDrawPlan(input({ tick: 2, shoppers: [after], ...overrides }), state);
  return { plan, state };
}

/** The tell a plan is showing, as its term. Two sprites per bubble: the frame and the icon. */
function bubbleTerms(plan: ReturnType<typeof gentleSurfaceDrawPlan>): string[] {
  return plan.bubbles.filter((s) => s.key.startsWith('bubble_') && s.key !== 'bubble_frame').map((s) => s.key);
}

const iconFor = (term: string): string => `bubble_${tellFor(term).bubble}`;

describe('the seven live tells', () => {
  it('fires spoiledEncounters when the spoil counter increments', () => {
    const { plan } = step(shopper(), shopper({ spoiledEncounters: 1, listRemaining: 2 }));
    expect(bubbleTerms(plan)).toEqual([iconFor('spoiledEncounters')]);
    expect(plan.animationOverrides.get(1)).toBe('recoil');
  });

  it('fires impulsePurchase when the impulse counter increments', () => {
    const { plan } = step(shopper(), shopper({ impulseHits: 1 }));
    expect(bubbleTerms(plan)).toEqual([iconFor('impulsePurchase')]);
    expect(plan.animationOverrides.get(1)).toBe('hop');
  });

  it('fires priceSurpriseNegative on a purchase that cost more than the reference price', () => {
    const threshold = tellFor('priceSurpriseNegative').threshold;
    const { plan } = step(shopper(), shopper({ cartSize: 1, listRemaining: 2, priceSurpriseSum: -threshold }));
    expect(bubbleTerms(plan)).toEqual([iconFor('priceSurpriseNegative')]);
    expect(plan.animationOverrides.get(1)).toBe('recoil');
  });

  it('fires priceSurprisePositive on a purchase that cost less', () => {
    const threshold = tellFor('priceSurprisePositive').threshold;
    const { plan } = step(shopper(), shopper({ cartSize: 1, listRemaining: 2, priceSurpriseSum: threshold }));
    expect(bubbleTerms(plan)).toEqual([iconFor('priceSurprisePositive')]);
    expect(plan.animationOverrides.get(1)).toBe('hop');
  });

  it('stays silent for a price difference under the declared threshold', () => {
    // gentle-surface.md §3 rule 1: mild dissatisfaction is silent. The player feels it in
    // trip frequency, not in bubbles.
    const under = tellFor('priceSurpriseNegative').threshold / 2;
    const { plan } = step(shopper(), shopper({ cartSize: 1, listRemaining: 2, priceSurpriseSum: -under }));
    expect(bubbleTerms(plan)).toEqual([]);
  });

  it('fires fillRateMiss when the list shrinks with no sale and no spoilage', () => {
    const { plan } = step(shopper(), shopper({ listRemaining: 2 }));
    expect(bubbleTerms(plan)).toEqual([iconFor('fillRateMiss')]);
    expect(plan.animationOverrides.get(1)).toBe('pause');
  });

  it('does not fire fillRateMiss when the list shrank because something was bought', () => {
    const { plan } = step(shopper(), shopper({ listRemaining: 2, cartSize: 1 }));
    expect(bubbleTerms(plan)).not.toContain(iconFor('fillRateMiss'));
  });

  it('does not fire fillRateMiss when the list shrank because the item was spoiled', () => {
    // Both tells are true of the same pickup; the spoil is the more specific one, and
    // firing two bubbles for one event breaks §3's one-per-shopper rule.
    const { plan } = step(shopper(), shopper({ listRemaining: 2, spoiledEncounters: 1 }));
    expect(bubbleTerms(plan)).toEqual([iconFor('spoiledEncounters')]);
  });

  it('fires queuePenaltyBalk off the cartAbandoned event, not off a delta', () => {
    const event: SimEvent = { type: 'cartAbandoned', shopperId: 1, householdId: 1, items: ['milk'] };
    const state = createGentleSurfaceState();
    // No previous snapshot at all: a shopper can abandon on the first tick the view sees
    // them, and an event-driven tell must not depend on having a baseline.
    const plan = gentleSurfaceDrawPlan(
      input({ tick: 1, events: [event], shoppers: [shopper({ state: 'checkingOut' })] }),
      state,
    );
    expect(bubbleTerms(plan)).toEqual([iconFor('queuePenaltyBalk')]);
    expect(plan.cartMarkers).toHaveLength(1);
    // The walk to the exit already *is* "walks out" — the cart is the new part.
    expect(plan.animationOverrides.has(1)).toBe(false);
  });

  it('fires queuePenaltyRising once the wait crosses the threshold, and only once', () => {
    const state = createGentleSurfaceState();
    const queued = shopper({ state: 'checkingOut', listRemaining: 0, checkoutJoinedAtTick: 0 });

    const firedOn: number[] = [];
    for (let tick = 1; tick <= 200; tick++) {
      const plan = gentleSurfaceDrawPlan(input({ tick, shoppers: [queued] }), state);
      if (bubbleTerms(plan).includes(iconFor('queuePenaltyRising'))) firedOn.push(tick);
    }
    // Edge-triggered: the bubble is up for its declared duration and never re-arms while
    // the shopper stays in the same queue. A level trigger would strobe for 200 ticks.
    expect(firedOn.length).toBeGreaterThan(0);
    expect(firedOn.length).toBeLessThanOrEqual(TUNING.bubbleDurationTicks);
    const threshold = tellFor('queuePenaltyRising').threshold;
    expect(queuePenalty(firedOn[0]!)).toBeGreaterThanOrEqual(threshold);
    expect(queuePenalty(firedOn[0]! - 1)).toBeLessThan(threshold);
  });

  it('re-arms the rising-queue tell once the shopper leaves the queue', () => {
    const state = createGentleSurfaceState();
    const waited = DEFAULT_STAFFING_CONFIG.balkToleranceTicks;
    const queued = shopper({ state: 'checkingOut', checkoutJoinedAtTick: 0 });

    gentleSurfaceDrawPlan(input({ tick: waited, shoppers: [queued] }), state);
    gentleSurfaceDrawPlan(input({ tick: waited + 1, shoppers: [shopper({ state: 'leaving' })] }), state);
    const plan = gentleSurfaceDrawPlan(
      input({ tick: waited + 2, shoppers: [{ ...queued, checkoutJoinedAtTick: waited + 1 }] }),
      state,
    );
    expect(bubbleTerms(plan)).toContain(iconFor('queuePenaltyRising'));
  });
});

describe('queue penalty', () => {
  it('matches the simulation’s own formula', () => {
    // ShoppersSystem#stepLeaving computes (wait / balkTolerance) ** 1.6, saturating at 1.
    // The exponent is inline there rather than exported, so this is the pin that keeps the
    // view's copy honest — if it drifts, the bubble fires at a wait the sim does not
    // consider painful.
    const tolerance = DEFAULT_STAFFING_CONFIG.balkToleranceTicks;
    for (const wait of [1, 10, tolerance / 2, tolerance - 1]) {
      expect(queuePenalty(wait)).toBeCloseTo(Math.min(1, (wait / tolerance) ** 1.6), 10);
    }
    expect(queuePenalty(tolerance)).toBe(1);
    expect(queuePenalty(tolerance * 3)).toBe(1);
    expect(queuePenalty(0)).toBe(0);
  });
});

describe('same-tick priority', () => {
  it('shows the higher-priority term when one shopper trips two at once', () => {
    // A single #stepShopping call can carry both a price surprise and an impulse hit.
    const threshold = tellFor('priceSurpriseNegative').threshold;
    const { plan } = step(
      shopper(),
      shopper({ cartSize: 1, listRemaining: 2, priceSurpriseSum: -threshold, impulseHits: 1 }),
    );
    expect(bubbleTerms(plan)).toEqual([iconFor('priceSurpriseNegative')]);
  });

  it('gives a shopper exactly one bubble, never two', () => {
    const { plan } = step(shopper(), shopper({ spoiledEncounters: 1, listRemaining: 2, impulseHits: 1 }));
    expect(bubbleTerms(plan)).toHaveLength(1);
  });

  it('does not let a lower-priority tell displace one already showing', () => {
    const state = createGentleSurfaceState();
    const before = shopper();
    gentleSurfaceDrawPlan(input({ tick: 1, shoppers: [before] }), state);
    const spoiled = shopper({ spoiledEncounters: 1, listRemaining: 2 });
    gentleSurfaceDrawPlan(input({ tick: 2, shoppers: [spoiled] }), state);
    const plan = gentleSurfaceDrawPlan(
      input({ tick: 3, shoppers: [{ ...spoiled, impulseHits: 1 }] }),
      state,
    );
    expect(bubbleTerms(plan)).toEqual([iconFor('spoiledEncounters')]);
  });
});

describe('rate limiting', () => {
  const crowd = (count: number, spoiled: number): ShopperSnapshot[] =>
    Array.from({ length: count }, (_, i) => shopper({ id: i + 1, spoiledEncounters: spoiled }));

  it.each([
    ['regular' as const, TUNING.bubbleCapRegular],
    ['compact' as const, TUNING.bubbleCapCompact],
  ])('caps simultaneous bubbles at %s', (breakpoint, cap) => {
    const state = createGentleSurfaceState();
    const count = cap + 6;
    gentleSurfaceDrawPlan(input({ tick: 1, shoppers: crowd(count, 0), breakpoint }), state);
    const plan = gentleSurfaceDrawPlan(
      input({ tick: 2, shoppers: crowd(count, 1), breakpoint }),
      state,
    );
    expect(bubbleTerms(plan)).toHaveLength(cap);
  });

  it('keeps the highest-priority tells when the cap is exceeded', () => {
    const state = createGentleSurfaceState();
    const cap = TUNING.bubbleCapCompact;
    const before = Array.from({ length: cap + 4 }, (_, i) => shopper({ id: i + 1 }));
    // The first two trip a spoil (top priority); everyone else trips a mere impulse hit.
    const after = before.map((s, i) =>
      i < 2
        ? { ...s, spoiledEncounters: 1, listRemaining: 2 }
        : { ...s, impulseHits: 1 },
    );
    gentleSurfaceDrawPlan(input({ tick: 1, shoppers: before, breakpoint: 'compact' }), state);
    const plan = gentleSurfaceDrawPlan(input({ tick: 2, shoppers: after, breakpoint: 'compact' }), state);
    const icons = bubbleTerms(plan);
    expect(icons).toHaveLength(cap);
    expect(icons.filter((k) => k === iconFor('spoiledEncounters'))).toHaveLength(2);
  });

  it('drops overflow rather than queueing it', () => {
    // "Silence is a feature": a bubble that missed its moment is not worth showing late.
    const state = createGentleSurfaceState();
    const cap = TUNING.bubbleCapCompact;
    const crowded = crowd(cap + 5, 0);
    gentleSurfaceDrawPlan(input({ tick: 1, shoppers: crowded, breakpoint: 'compact' }), state);
    gentleSurfaceDrawPlan(
      input({ tick: 2, shoppers: crowd(cap + 5, 1), breakpoint: 'compact' }),
      state,
    );
    // Nothing changes for anybody after the spike; the dropped bubbles never appear.
    const plan = gentleSurfaceDrawPlan(
      input({ tick: 3, shoppers: crowd(cap + 5, 1), breakpoint: 'compact' }),
      state,
    );
    expect(bubbleTerms(plan)).toHaveLength(cap);
  });
});

describe('lifetimes', () => {
  it('drops a bubble once its duration is up', () => {
    const state = createGentleSurfaceState();
    gentleSurfaceDrawPlan(input({ tick: 1, shoppers: [shopper()] }), state);
    const spoiled = shopper({ spoiledEncounters: 1, listRemaining: 2 });
    gentleSurfaceDrawPlan(input({ tick: 2, shoppers: [spoiled] }), state);

    const stillUp = gentleSurfaceDrawPlan(
      input({ tick: 2 + TUNING.bubbleDurationTicks - 1, shoppers: [spoiled] }),
      state,
    );
    expect(bubbleTerms(stillUp)).toHaveLength(1);

    const gone = gentleSurfaceDrawPlan(
      input({ tick: 2 + TUNING.bubbleDurationTicks, shoppers: [spoiled] }),
      state,
    );
    expect(bubbleTerms(gone)).toEqual([]);
  });

  it('expires the abandoned cart on its own, since no staff mechanic clears it', () => {
    const state = createGentleSurfaceState();
    const event: SimEvent = { type: 'cartAbandoned', shopperId: 1, householdId: 1, items: [] };
    gentleSurfaceDrawPlan(input({ tick: 1, events: [event], shoppers: [shopper()] }), state);

    const before = gentleSurfaceDrawPlan(
      input({ tick: TUNING.abandonedCartLifetimeTicks, shoppers: [shopper()] }),
      state,
    );
    expect(before.cartMarkers).toHaveLength(1);

    const after = gentleSurfaceDrawPlan(
      input({ tick: 1 + TUNING.abandonedCartLifetimeTicks, shoppers: [shopper()] }),
      state,
    );
    expect(after.cartMarkers).toEqual([]);
  });

  it('expires a reaction pose back to the walk cycle', () => {
    const state = createGentleSurfaceState();
    gentleSurfaceDrawPlan(input({ tick: 1, shoppers: [shopper()] }), state);
    const hopping = shopper({ impulseHits: 1 });
    gentleSurfaceDrawPlan(input({ tick: 2, shoppers: [hopping] }), state);

    expect(
      gentleSurfaceDrawPlan(
        input({ tick: 1 + TUNING.animationPoseTicks, shoppers: [hopping] }),
        state,
      ).animationOverrides.get(1),
    ).toBe('hop');
    expect(
      gentleSurfaceDrawPlan(
        input({ tick: 2 + TUNING.animationPoseTicks, shoppers: [hopping] }),
        state,
      ).animationOverrides.has(1),
    ).toBe(false);
  });

  it('takes a departed shopper’s bubble and pose with them', () => {
    const state = createGentleSurfaceState();
    gentleSurfaceDrawPlan(input({ tick: 1, shoppers: [shopper()] }), state);
    gentleSurfaceDrawPlan(input({ tick: 2, shoppers: [shopper({ spoiledEncounters: 1, listRemaining: 2 })] }), state);
    const plan = gentleSurfaceDrawPlan(input({ tick: 3, shoppers: [] }), state);
    expect(plan.bubbles).toEqual([]);
    expect(plan.animationOverrides.size).toBe(0);
  });
});

describe('world marks', () => {
  it('tints the nearest fixture brown and adds flies for a spoiled pickup', () => {
    const { plan } = step(shopper(), shopper({ spoiledEncounters: 1, listRemaining: 2 }));
    expect(plan.worldMarks).toHaveLength(1);
    expect(plan.worldMarks[0]?.tint).not.toBeNull();
    expect(plan.particles).toHaveLength(1);
    // The tinted copy sits just above the fixture, still below an agent on the same row —
    // otherwise a shopper standing in front of the shelf would be painted over.
    expect(plan.worldMarks[0]?.depth).toBeGreaterThan(depthFor('fixture', SHELF.y + 2));
    expect(plan.worldMarks[0]?.depth).toBeLessThan(depthFor('agent', SHELF.y + 2));
  });

  it('marks the fixture for a negative price surprise but adds no particles', () => {
    const threshold = tellFor('priceSurpriseNegative').threshold;
    const { plan } = step(shopper(), shopper({ cartSize: 1, listRemaining: 2, priceSurpriseSum: -threshold }));
    expect(plan.worldMarks).toHaveLength(1);
    expect(plan.particles).toEqual([]);
  });

  it('marks nothing when the shopper is nowhere near a fixture', () => {
    // Better a missing flash than a brown shelf across the aisle that had nothing to do
    // with it — the mark's whole job is to point at the culprit.
    const far = { x: 18, y: 18 };
    const { plan } = step(
      shopper({ ...far }),
      shopper({ ...far, spoiledEncounters: 1, listRemaining: 2 }),
    );
    expect(plan.worldMarks).toEqual([]);
    expect(plan.particles).toEqual([]);
    // The shopper still reacts; only the world mark needs a fixture to land on.
    expect(bubbleTerms(plan)).toEqual([iconFor('spoiledEncounters')]);
  });

  it('drops a mark whose fixture was bulldozed mid-flash', () => {
    const state = createGentleSurfaceState();
    gentleSurfaceDrawPlan(input({ tick: 1, shoppers: [shopper()] }), state);
    gentleSurfaceDrawPlan(
      input({ tick: 2, shoppers: [shopper({ spoiledEncounters: 1, listRemaining: 2 })] }),
      state,
    );
    const emptied: BuildModeSnapshot = { ...SNAPSHOT, placements: [] };
    const plan = gentleSurfaceDrawPlan(
      input({ tick: 3, shoppers: [shopper({ spoiledEncounters: 1 })], snapshot: emptied }),
      state,
    );
    expect(plan.worldMarks).toEqual([]);
  });

  it('cycles the fly frames so the swarm reads as moving', () => {
    const state = createGentleSurfaceState();
    gentleSurfaceDrawPlan(input({ tick: 1, shoppers: [shopper()] }), state);
    const spoiled = shopper({ spoiledEncounters: 1, listRemaining: 2 });
    const keys = new Set<string>();
    for (let tick = 2; tick < 6; tick++) {
      const plan = gentleSurfaceDrawPlan(input({ tick, shoppers: [spoiled] }), state);
      for (const sprite of plan.particles) keys.add(sprite.key);
    }
    expect(keys.size).toBeGreaterThan(1);
  });
});

describe('bubble placement', () => {
  it('floats above the shopper’s head and follows them as they move', () => {
    const state = createGentleSurfaceState();
    gentleSurfaceDrawPlan(input({ tick: 1, shoppers: [shopper()] }), state);
    const spoiled = shopper({ spoiledEncounters: 1, listRemaining: 2 });
    const first = gentleSurfaceDrawPlan(input({ tick: 2, shoppers: [spoiled] }), state);
    const frame = first.bubbles.find((s) => s.key === 'bubble_frame')!;

    // Above the sprite, not on it: the shopper is anchored at their feet, so the bubble
    // has to clear a whole sprite-height plus a gap.
    expect(frame.y).toBeLessThan(spoiled.y * TILE_SIZE - SHOPPER_HEIGHT);
    // Overlays sit above every world sprite, whatever row they are on.
    expect(frame.depth).toBeGreaterThan(depthFor('agent', 19));

    const moved = gentleSurfaceDrawPlan(
      input({ tick: 3, shoppers: [{ ...spoiled, x: spoiled.x + 2 }] }),
      state,
    );
    const movedFrame = moved.bubbles.find((s) => s.key === 'bubble_frame')!;
    expect(movedFrame.x).toBeGreaterThan(frame.x);
  });

  it('draws the icon inside the frame, above it in depth', () => {
    const { plan } = step(shopper(), shopper({ spoiledEncounters: 1, listRemaining: 2 }));
    const frame = plan.bubbles.find((s) => s.key === 'bubble_frame')!;
    const icon = plan.bubbles.find((s) => s.key !== 'bubble_frame')!;
    expect(icon.depth).toBeGreaterThan(frame.depth);
    // Centred in the body, which is everything above the tail.
    expect(icon.y).toBeLessThan(frame.y);
    expect(icon.y).toBeGreaterThan(frame.y - 20);
  });
});

describe('redraws between ticks', () => {
  it('re-renders without re-firing when called twice at the same tick', () => {
    // A tap, a selection, or a camera pan forces a redraw with no tick in between.
    // Detection has to be idempotent across those, or one spoiled pickup fires a bubble
    // for every pointer event that follows it.
    const state = createGentleSurfaceState();
    gentleSurfaceDrawPlan(input({ tick: 1, shoppers: [shopper()] }), state);
    const spoiled = shopper({ spoiledEncounters: 1, listRemaining: 2 });
    const first = gentleSurfaceDrawPlan(input({ tick: 2, shoppers: [spoiled] }), state);
    const again = gentleSurfaceDrawPlan(input({ tick: 2, shoppers: [spoiled] }), state);

    expect(bubbleTerms(again)).toEqual(bubbleTerms(first));
    expect(again.worldMarks).toHaveLength(first.worldMarks.length);
    expect(again.particles).toHaveLength(first.particles.length);
  });

  it('sees a delta across a redraw pair as one event, not two', () => {
    const state = createGentleSurfaceState();
    gentleSurfaceDrawPlan(input({ tick: 1, shoppers: [shopper()] }), state);
    gentleSurfaceDrawPlan(input({ tick: 1, shoppers: [shopper()] }), state);
    const plan = gentleSurfaceDrawPlan(
      input({ tick: 2, shoppers: [shopper({ impulseHits: 1 })] }),
      state,
    );
    expect(bubbleTerms(plan)).toEqual([iconFor('impulsePurchase')]);
  });
});

describe('the tell table is the contract', () => {
  it('has a declared bubble for every live term', () => {
    // A term whose art went missing must fail here, not draw an exception into the frame.
    for (const term of [
      'fillRateMiss',
      'priceSurpriseNegative',
      'priceSurprisePositive',
      'queuePenaltyRising',
      'queuePenaltyBalk',
      'spoiledEncounters',
      'impulsePurchase',
    ]) {
      expect(tellFor(term).bubble).not.toBeNull();
    }
  });

  it('ranks every live term in the priority list', () => {
    for (const term of TUNING.priority) expect(tellFor(term)).toBeDefined();
    expect(TUNING.priority).toHaveLength(7);
  });
});
