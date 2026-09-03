import { describe, expect, it } from 'vitest';
import { parseGentleSurfaceContent } from '../sim/content/gentle-surface.js';
import { buildTellDrawPlan } from './tell-draw-plan.js';

const CONTENT = parseGentleSurfaceContent({
  satisfaction: [
    { term: 'fillRateMiss', bubble: 'listStrike', animation: 'shrugAtEmptyFacing', particle: null, worldMark: true, threshold: 0 },
    { term: 'priceSurpriseNegative', bubble: 'priceTagRaisedEyebrow', animation: 'putItemBack', particle: null, worldMark: true, threshold: 0.1 },
    { term: 'priceSurprisePositive', bubble: 'priceTagStar', animation: 'grabSecond', particle: null, worldMark: false, threshold: 0.1 },
    { term: 'queuePenaltyRising', bubble: 'clock', animation: 'footTapArmsCrossedHeadShake', particle: null, worldMark: false, threshold: 0.3 },
    { term: 'queuePenaltyBalk', bubble: 'clockRedX', animation: 'abandonCartWalkOut', particle: null, worldMark: true, threshold: 0.7 },
    { term: 'spoiledEncounters', bubble: 'greenStinkCloud', animation: 'recoilPutBack', particle: 'flies', worldMark: true, threshold: 0 },
    { term: 'cleanlinessLow', bubble: 'frown', animation: 'stepAroundSpillWrinkleNose', particle: null, worldMark: true, threshold: 0.4 },
    { term: 'staffInteractionGood', bubble: 'heart', animation: 'staffPointsShopperNods', particle: null, worldMark: false, threshold: 0.5 },
    { term: 'staffInteractionAbsent', bubble: 'questionMark', animation: 'standStillLookAround', particle: null, worldMark: false, threshold: 0 },
    { term: 'discovery', bubble: 'sparkle', animation: 'detourTowardShelf', particle: null, worldMark: true, threshold: 0 },
  ],
  impulse: [
    { term: 'impulsePurchase', bubble: 'exclamation', animation: 'itemHopsIntoCart', particle: null, worldMark: false, threshold: 0 },
    { term: 'visibility', bubble: null, animation: null, particle: null, worldMark: true, threshold: 0 },
    { term: 'adjacencyBonus', bubble: 'exclamationGold', animation: null, particle: null, worldMark: false, threshold: 0 },
    { term: 'promoLift', bubble: null, animation: 'slowNearPromoSign', particle: null, worldMark: true, threshold: 0 },
    { term: 'needState', bubble: null, animation: 'childPointsAtShelf', particle: null, worldMark: false, threshold: 0 },
  ],
});

describe('buildTellDrawPlan', () => {
  it('collapses multiple tells for one shopper to the highest magnitude', () => {
    const events = [
      { shopperId: 1, term: 'staffInteractionGood' as const, magnitude: 0.5 },
      { shopperId: 1, term: 'discovery' as const, magnitude: 1 },
    ];
    const positions = new Map([[1, { x: 10, y: 20 }]]);
    const plan = buildTellDrawPlan(events, CONTENT, positions, { x: 0, y: 0 }, 8);
    expect(plan).toHaveLength(1);
    expect(plan[0]?.bubbleId).toBe('sparkle'); // discovery, magnitude 1 wins over 0.5
  });

  it('caps at maxSimultaneous, keeping the highest-magnitude markers', () => {
    const events = Array.from({ length: 10 }, (_, i) => ({
      shopperId: i,
      term: 'fillRateMiss' as const,
      magnitude: i / 10,
    }));
    const positions = new Map(events.map((e) => [e.shopperId, { x: e.shopperId, y: 0 }]));
    const plan = buildTellDrawPlan(events, CONTENT, positions, { x: 0, y: 0 }, 4);
    expect(plan).toHaveLength(4);
    expect(plan.map((m) => m.shopperId).sort((a, b) => b - a)).toEqual([9, 8, 7, 6]);
  });

  it('omits a shopper with no known screen position', () => {
    const events = [{ shopperId: 99, term: 'discovery' as const, magnitude: 1 }];
    const plan = buildTellDrawPlan(events, CONTENT, new Map(), { x: 0, y: 0 }, 8);
    expect(plan).toHaveLength(0);
  });

  it('omits a term with no bubble (world-mark/animation-only)', () => {
    const events = [{ shopperId: 1, term: 'promoLift' as const, magnitude: 1 }];
    const positions = new Map([[1, { x: 0, y: 0 }]]);
    const plan = buildTellDrawPlan(events, CONTENT, positions, { x: 0, y: 0 }, 8);
    expect(plan).toHaveLength(0);
  });
});
