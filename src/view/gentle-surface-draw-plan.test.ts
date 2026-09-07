import { describe, expect, it } from 'vitest';
import type { CampaignSnapshot, ShopperSnapshot, TellOccurrence } from '../bridge/campaign-bridge.js';
import { DEFAULT_CATALOG } from '../sim/index.js';
import type { TellTerm } from '../sim/content/gentle-surface.js';
import {
  createGentleSurfaceState,
  gentleSurfaceDrawPlan,
  tellFor,
  TUNING,
  type GentleSurfaceInput,
  type GentleSurfaceState,
} from './gentle-surface-draw-plan.js';
import { depthFor, TILE_SIZE } from './projection.js';
import { assetById } from './asset-manifest.js';

/**
 * The gentle surface is the game's primary telemetry (docs/design/gentle-surface.md §12.1).
 * `src/sim` decides *whether* a tell fires (see `gentle-surface-gate.test.ts` for that half);
 * this module only decides how `CampaignBridge#pendingTells()` becomes sprites — which
 * bubble, which reaction pose, which world mark, rate-limited and positioned per
 * `docs/design/gentle-surface.md` §3. That is the boundary this file tests.
 */

const SHOPPER_HEIGHT = assetById('shopper').size[1];

const SHELF = { instanceId: 1, fixtureId: 'shelf_basic', x: 5, y: 5, rotation: 0 as const };

const SNAPSHOT: CampaignSnapshot = {
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

function tell(overrides: Partial<TellOccurrence> = {}): TellOccurrence {
  return { shopperId: 1, term: 'spoiledEncounters', magnitude: 1, ...overrides };
}

function input(overrides: Partial<GentleSurfaceInput> = {}): GentleSurfaceInput {
  return {
    tells: [],
    shoppers: [shopper()],
    snapshot: SNAPSHOT,
    tick: 1,
    origin: { x: 0, y: 0 },
    breakpoint: 'regular',
    ...overrides,
  };
}

/** One tick with no tells, then one tick carrying the given tells. */
function step(
  tells: readonly TellOccurrence[],
  overrides: Partial<GentleSurfaceInput> = {},
): { plan: ReturnType<typeof gentleSurfaceDrawPlan>; state: GentleSurfaceState } {
  const state = createGentleSurfaceState();
  gentleSurfaceDrawPlan(input({ tick: 1, ...overrides }), state);
  const plan = gentleSurfaceDrawPlan(input({ tick: 2, tells, ...overrides }), state);
  return { plan, state };
}

/** The tell a plan is showing, as its term. Two sprites per bubble: the frame and the icon. */
function bubbleTerms(plan: ReturnType<typeof gentleSurfaceDrawPlan>): string[] {
  return plan.bubbles.filter((s) => s.key.startsWith('bubble_') && s.key !== 'bubble_frame').map((s) => s.key);
}

const iconFor = (term: TellTerm): string => `bubble_${tellFor(term).bubble}`;

describe('rendering a tell', () => {
  it('draws the declared bubble and reaction pose for a spoiled pickup', () => {
    const { plan } = step([tell({ term: 'spoiledEncounters', worldRef: { instanceId: SHELF.instanceId } })]);
    expect(bubbleTerms(plan)).toEqual([iconFor('spoiledEncounters')]);
    expect(plan.animationOverrides.get(1)?.pose).toBe('recoil');
  });

  it('draws a hop for an impulse purchase', () => {
    const { plan } = step([tell({ term: 'impulsePurchase' })]);
    expect(bubbleTerms(plan)).toEqual([iconFor('impulsePurchase')]);
    expect(plan.animationOverrides.get(1)?.pose).toBe('hop');
  });

  it('draws a pause for a fill-rate miss and a rising queue', () => {
    for (const term of ['fillRateMiss', 'queuePenaltyRising'] as const) {
      const { plan } = step([tell({ term })]);
      expect(plan.animationOverrides.get(1)?.pose).toBe('pause');
    }
  });

  it('drops an abandoned cart and plays no pose — the walk to the exit already is the reaction', () => {
    const { plan } = step([tell({ term: 'queuePenaltyBalk' })]);
    expect(bubbleTerms(plan)).toEqual([iconFor('queuePenaltyBalk')]);
    expect(plan.cartMarkers).toHaveLength(1);
    expect(plan.animationOverrides.has(1)).toBe(false);
  });

  it('draws nothing for a tell whose shopper already left before this frame', () => {
    const { plan } = step([tell({ shopperId: 999 })]);
    expect(bubbleTerms(plan)).toEqual([]);
  });
});

describe('same-tick priority', () => {
  it('shows the higher-priority term when one shopper trips two at once', () => {
    const { plan } = step([
      tell({ term: 'priceSurpriseNegative' }),
      tell({ term: 'impulsePurchase' }),
    ]);
    expect(bubbleTerms(plan)).toEqual([iconFor('priceSurpriseNegative')]);
  });

  it('gives a shopper exactly one bubble, never two', () => {
    const { plan } = step([tell({ term: 'spoiledEncounters' }), tell({ term: 'impulsePurchase' })]);
    expect(bubbleTerms(plan)).toHaveLength(1);
  });

  it('does not let a lower-priority tell displace one already showing', () => {
    const state = createGentleSurfaceState();
    gentleSurfaceDrawPlan(input({ tick: 1 }), state);
    gentleSurfaceDrawPlan(input({ tick: 2, tells: [tell({ term: 'spoiledEncounters' })] }), state);
    const plan = gentleSurfaceDrawPlan(input({ tick: 3, tells: [tell({ term: 'impulsePurchase' })] }), state);
    expect(bubbleTerms(plan)).toEqual([iconFor('spoiledEncounters')]);
  });
});

describe('rate limiting', () => {
  const crowd = (count: number): ShopperSnapshot[] =>
    Array.from({ length: count }, (_, i) => shopper({ id: i + 1 }));
  const crowdTells = (count: number, term: TellTerm): TellOccurrence[] =>
    Array.from({ length: count }, (_, i) => tell({ shopperId: i + 1, term }));

  it.each([
    ['regular' as const, TUNING.bubbleCapRegular],
    ['compact' as const, TUNING.bubbleCapCompact],
  ])('caps simultaneous bubbles at %s', (breakpoint, cap) => {
    const state = createGentleSurfaceState();
    const count = cap + 6;
    gentleSurfaceDrawPlan(input({ tick: 1, shoppers: crowd(count), breakpoint }), state);
    const plan = gentleSurfaceDrawPlan(
      input({ tick: 2, shoppers: crowd(count), tells: crowdTells(count, 'spoiledEncounters'), breakpoint }),
      state,
    );
    expect(bubbleTerms(plan)).toHaveLength(cap);
  });

  it('keeps the highest-priority tells when the cap is exceeded', () => {
    const state = createGentleSurfaceState();
    const cap = TUNING.bubbleCapCompact;
    const count = cap + 4;
    // The first two trip a spoil (top priority); everyone else trips a mere impulse hit.
    const tells: TellOccurrence[] = [
      tell({ shopperId: 1, term: 'spoiledEncounters' }),
      tell({ shopperId: 2, term: 'spoiledEncounters' }),
      ...Array.from({ length: count - 2 }, (_, i) => tell({ shopperId: i + 3, term: 'impulsePurchase' })),
    ];
    gentleSurfaceDrawPlan(input({ tick: 1, shoppers: crowd(count), breakpoint: 'compact' }), state);
    const plan = gentleSurfaceDrawPlan(
      input({ tick: 2, shoppers: crowd(count), tells, breakpoint: 'compact' }),
      state,
    );
    const icons = bubbleTerms(plan);
    expect(icons).toHaveLength(cap);
    expect(icons.filter((k) => k === iconFor('spoiledEncounters'))).toHaveLength(2);
  });

  it('drops overflow rather than queueing it', () => {
    // "Silence is a feature": a bubble that missed its moment is not worth showing late.
    const state = createGentleSurfaceState();
    const cap = TUNING.bubbleCapCompact;
    const count = cap + 5;
    gentleSurfaceDrawPlan(input({ tick: 1, shoppers: crowd(count), breakpoint: 'compact' }), state);
    gentleSurfaceDrawPlan(
      input({ tick: 2, shoppers: crowd(count), tells: crowdTells(count, 'spoiledEncounters'), breakpoint: 'compact' }),
      state,
    );
    // Nothing changes for anybody after the spike; the dropped bubbles never appear.
    const plan = gentleSurfaceDrawPlan(input({ tick: 3, shoppers: crowd(count), breakpoint: 'compact' }), state);
    expect(bubbleTerms(plan)).toHaveLength(cap);
  });
});

describe('lifetimes', () => {
  it('drops a bubble once its duration is up', () => {
    const state = createGentleSurfaceState();
    gentleSurfaceDrawPlan(input({ tick: 1 }), state);
    gentleSurfaceDrawPlan(input({ tick: 2, tells: [tell()] }), state);

    const stillUp = gentleSurfaceDrawPlan(input({ tick: 2 + TUNING.bubbleDurationTicks - 1 }), state);
    expect(bubbleTerms(stillUp)).toHaveLength(1);

    const gone = gentleSurfaceDrawPlan(input({ tick: 2 + TUNING.bubbleDurationTicks }), state);
    expect(bubbleTerms(gone)).toEqual([]);
  });

  it('expires the abandoned cart on its own, since no staff mechanic clears it', () => {
    const state = createGentleSurfaceState();
    gentleSurfaceDrawPlan(input({ tick: 1, tells: [tell({ term: 'queuePenaltyBalk' })] }), state);

    const before = gentleSurfaceDrawPlan(input({ tick: TUNING.abandonedCartLifetimeTicks }), state);
    expect(before.cartMarkers).toHaveLength(1);

    const after = gentleSurfaceDrawPlan(input({ tick: 1 + TUNING.abandonedCartLifetimeTicks }), state);
    expect(after.cartMarkers).toEqual([]);
  });

  it('expires a reaction pose back to the walk cycle', () => {
    const state = createGentleSurfaceState();
    gentleSurfaceDrawPlan(input({ tick: 1 }), state);
    gentleSurfaceDrawPlan(input({ tick: 2, tells: [tell({ term: 'impulsePurchase' })] }), state);

    expect(
      gentleSurfaceDrawPlan(input({ tick: 1 + TUNING.animationPoseTicks }), state).animationOverrides.get(1)?.pose,
    ).toBe('hop');
    expect(
      gentleSurfaceDrawPlan(input({ tick: 2 + TUNING.animationPoseTicks }), state).animationOverrides.has(1),
    ).toBe(false);
  });

  it('takes a departed shopper’s bubble and pose with them', () => {
    const state = createGentleSurfaceState();
    gentleSurfaceDrawPlan(input({ tick: 1 }), state);
    gentleSurfaceDrawPlan(input({ tick: 2, tells: [tell({ term: 'spoiledEncounters' })] }), state);
    const plan = gentleSurfaceDrawPlan(input({ tick: 3, shoppers: [] }), state);
    expect(plan.bubbles).toEqual([]);
    expect(plan.animationOverrides.size).toBe(0);
  });
});

describe('world marks', () => {
  it('tints the exact fixture named by worldRef and adds flies for a spoiled pickup', () => {
    const { plan } = step([tell({ term: 'spoiledEncounters', worldRef: { instanceId: SHELF.instanceId } })]);
    expect(plan.worldMarks).toHaveLength(1);
    expect(plan.worldMarks[0]?.tint).not.toBeNull();
    expect(plan.particles).toHaveLength(1);
    // The tinted copy sits just above the fixture, still below an agent on the same row —
    // otherwise a shopper standing in front of the shelf would be painted over.
    expect(plan.worldMarks[0]?.depth).toBeGreaterThan(depthFor('fixture', SHELF.y + 2));
    expect(plan.worldMarks[0]?.depth).toBeLessThan(depthFor('agent', SHELF.y + 2));
  });

  it('falls back to the nearest fixture when the tell carries no worldRef', () => {
    const { plan } = step([tell({ term: 'priceSurpriseNegative' })]);
    expect(plan.worldMarks).toHaveLength(1);
    expect(plan.particles).toEqual([]);
  });

  it('marks nothing when the shopper (with no worldRef) is nowhere near a fixture', () => {
    // Better a missing flash than a brown shelf across the aisle that had nothing to do
    // with it — the mark's whole job is to point at the culprit.
    const far = shopper({ x: 18, y: 18 });
    const state = createGentleSurfaceState();
    gentleSurfaceDrawPlan(input({ tick: 1, shoppers: [far] }), state);
    const plan = gentleSurfaceDrawPlan(
      input({ tick: 2, shoppers: [far], tells: [tell({ term: 'spoiledEncounters' })] }),
      state,
    );
    expect(plan.worldMarks).toEqual([]);
    expect(plan.particles).toEqual([]);
    // The shopper still reacts; only the world mark needs a fixture to land on.
    expect(bubbleTerms(plan)).toEqual([iconFor('spoiledEncounters')]);
  });

  it('drops a mark whose fixture was bulldozed mid-flash', () => {
    const state = createGentleSurfaceState();
    gentleSurfaceDrawPlan(input({ tick: 1 }), state);
    gentleSurfaceDrawPlan(
      input({ tick: 2, tells: [tell({ term: 'spoiledEncounters', worldRef: { instanceId: SHELF.instanceId } })] }),
      state,
    );
    const emptied: CampaignSnapshot = { ...SNAPSHOT, placements: [] };
    const plan = gentleSurfaceDrawPlan(input({ tick: 3, snapshot: emptied }), state);
    expect(plan.worldMarks).toEqual([]);
  });

  it('cycles the fly frames so the swarm reads as moving', () => {
    const state = createGentleSurfaceState();
    gentleSurfaceDrawPlan(input({ tick: 1 }), state);
    gentleSurfaceDrawPlan(
      input({ tick: 2, tells: [tell({ term: 'spoiledEncounters', worldRef: { instanceId: SHELF.instanceId } })] }),
      state,
    );
    const keys = new Set<string>();
    for (let tick = 3; tick < 7; tick++) {
      const plan = gentleSurfaceDrawPlan(input({ tick }), state);
      for (const sprite of plan.particles) keys.add(sprite.key);
    }
    expect(keys.size).toBeGreaterThan(1);
  });
});

describe('bubble placement', () => {
  it('floats above the shopper’s head and follows them as they move', () => {
    const state = createGentleSurfaceState();
    gentleSurfaceDrawPlan(input({ tick: 1 }), state);
    const first = gentleSurfaceDrawPlan(input({ tick: 2, tells: [tell({ term: 'spoiledEncounters' })] }), state);
    const frame = first.bubbles.find((s) => s.key === 'bubble_frame')!;

    // Above the sprite, not on it: the shopper is anchored at their feet, so the bubble
    // has to clear a whole sprite-height plus a gap.
    const baseShopper = shopper();
    expect(frame.y).toBeLessThan(baseShopper.y * TILE_SIZE - SHOPPER_HEIGHT);
    // Overlays sit above every world sprite, whatever row they are on.
    expect(frame.depth).toBeGreaterThan(depthFor('agent', 19));

    const moved = gentleSurfaceDrawPlan(
      input({ tick: 3, shoppers: [{ ...baseShopper, x: baseShopper.x + 2 }] }),
      state,
    );
    const movedFrame = moved.bubbles.find((s) => s.key === 'bubble_frame')!;
    expect(movedFrame.x).toBeGreaterThan(frame.x);
  });

  it('draws the icon inside the frame, above it in depth', () => {
    const { plan } = step([tell({ term: 'spoiledEncounters' })]);
    const frame = plan.bubbles.find((s) => s.key === 'bubble_frame')!;
    const icon = plan.bubbles.find((s) => s.key !== 'bubble_frame')!;
    expect(icon.depth).toBeGreaterThan(frame.depth);
    // Centred in the body, which is everything above the tail.
    expect(icon.y).toBeLessThan(frame.y);
    expect(icon.y).toBeGreaterThan(frame.y - 20);
  });
});

describe('redraws between ticks', () => {
  it('re-renders without re-admitting when called twice at the same tick', () => {
    // A tap, a selection, or a camera pan forces a redraw with no tick in between.
    // Detection has to be idempotent across those, or one tell re-admits for every
    // pointer event that follows it.
    const state = createGentleSurfaceState();
    gentleSurfaceDrawPlan(input({ tick: 1 }), state);
    const tells = [tell({ term: 'spoiledEncounters' })];
    const first = gentleSurfaceDrawPlan(input({ tick: 2, tells }), state);
    const again = gentleSurfaceDrawPlan(input({ tick: 2, tells }), state);

    expect(bubbleTerms(again)).toEqual(bubbleTerms(first));
    expect(again.worldMarks).toHaveLength(first.worldMarks.length);
    expect(again.particles).toHaveLength(first.particles.length);
  });
});

describe('the tell table is the contract', () => {
  it('has a declared bubble for every term this module knows how to pose', () => {
    // A term whose art went missing must fail here, not draw an exception into the frame.
    const posed: TellTerm[] = [
      'fillRateMiss',
      'priceSurpriseNegative',
      'priceSurprisePositive',
      'queuePenaltyRising',
      'queuePenaltyBalk',
      'spoiledEncounters',
      'impulsePurchase',
    ];
    for (const term of posed) expect(tellFor(term).bubble).not.toBeNull();
  });

  it('ranks every declared priority term against a real tell', () => {
    for (const term of TUNING.priority) expect(tellFor(term as TellTerm)).toBeDefined();
  });
});
