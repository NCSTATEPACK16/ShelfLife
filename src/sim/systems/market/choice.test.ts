import { describe, expect, it } from 'vitest';
import { chooseStore, indexToFit, softmax, storeUtility, type StoreTerms } from './choice.js';
import { DEFAULT_MARKET_CONFIG, DEFAULT_SEGMENT_CONFIG } from './config.js';

const flatTerms = (storeId: string, overrides: Partial<StoreTerms> = {}): StoreTerms => ({
  storeId,
  priceFit: 0.5,
  assortmentFit: 0.5,
  quality: 0.5,
  service: 0.5,
  ambiance: 0.5,
  loyalty: 0.5,
  brandAffinity: 0,
  travelCost: 0,
  ...overrides,
});

describe('indexToFit', () => {
  it('maps an at-reference index to the neutral value', () => {
    expect(indexToFit(1, 0.5)).toBeCloseTo(0.5);
  });

  it('discriminates in both directions', () => {
    // The whole point: a loss leader must not be indistinguishable from a small discount.
    expect(indexToFit(0.7, 0.5)).toBeCloseTo(0.8);
    expect(indexToFit(1.3, 0.5)).toBeCloseTo(0.2);
    expect(indexToFit(0.7, 0.5)).toBeGreaterThan(indexToFit(0.9, 0.5));
  });

  it('clamps to [0,1] at the extremes', () => {
    expect(indexToFit(0.01, 0.5)).toBe(1);
    expect(indexToFit(5, 0.5)).toBe(0);
  });
});

describe('storeUtility', () => {
  it('subtracts travel cost rather than adding it', () => {
    const weights = DEFAULT_SEGMENT_CONFIG.get('convenience')!.weights;
    const near = storeUtility(flatTerms('a', { travelCost: 0 }), weights);
    const far = storeUtility(flatTerms('a', { travelCost: 10 }), weights);
    expect(far).toBeLessThan(near);
  });

  it('weights each term by its own beta', () => {
    const weights = DEFAULT_SEGMENT_CONFIG.get('foodie')!.weights;
    const base = storeUtility(flatTerms('a'), weights);
    const better = storeUtility(flatTerms('a', { quality: 1 }), weights);
    expect(better - base).toBeCloseTo(weights.quality * 0.5);
  });
});

describe('softmax', () => {
  it('produces a distribution summing to 1', () => {
    const p = softmax([1, 2, 3], 1);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it('is numerically stable for utilities that would overflow exp', () => {
    // τ = 0.05 divides these into the hundreds. Without the max-subtraction this
    // returns NaN, which would silently corrupt every downstream choice.
    const p = softmax([40, 10], 0.05);
    expect(p.every(Number.isFinite)).toBe(true);
    expect(p[0]).toBeCloseTo(1);
  });

  it('approaches winner-take-all as temperature falls', () => {
    const decisive = softmax([1, 0.9], 0.05);
    const diffuse = softmax([1, 0.9], 10);
    expect(decisive[0]!).toBeGreaterThan(diffuse[0]!);
    expect(diffuse[0]!).toBeCloseTo(0.5, 1);
  });

  it('is uniform when every utility is equal', () => {
    for (const p of softmax([2, 2, 2], 1)) expect(p).toBeCloseTo(1 / 3);
  });
});

describe('chooseStore', () => {
  it('walks the cumulative distribution', () => {
    expect(chooseStore([0.25, 0.5, 0.25], 0.1)).toBe(0);
    expect(chooseStore([0.25, 0.5, 0.25], 0.5)).toBe(1);
    expect(chooseStore([0.25, 0.5, 0.25], 0.9)).toBe(2);
  });

  it('returns the last index when the draw lands on the boundary', () => {
    // Guards against floating-point summation leaving a cumulative total just under 1.
    expect(chooseStore([0.5, 0.5], 1)).toBe(1);
  });
});

describe('the model end to end', () => {
  it('sends a priceHunter to the cheaper store and a foodie to the better one', () => {
    const cheap = flatTerms('cheap', { priceFit: 0.95, quality: 0.2, assortmentFit: 0.3 });
    const good = flatTerms('good', { priceFit: 0.2, quality: 0.95, assortmentFit: 0.9 });
    const config = DEFAULT_MARKET_CONFIG;
    expect(config.priceFitNeutral).toBeGreaterThan(0); // config is wired, not hardcoded

    const hunter = DEFAULT_SEGMENT_CONFIG.get('priceHunter')!.weights;
    const hunterP = softmax([storeUtility(cheap, hunter), storeUtility(good, hunter)], hunter.temperature);
    expect(hunterP[0]!).toBeGreaterThan(hunterP[1]!);

    const foodie = DEFAULT_SEGMENT_CONFIG.get('foodie')!.weights;
    const foodieP = softmax([storeUtility(cheap, foodie), storeUtility(good, foodie)], foodie.temperature);
    expect(foodieP[1]!).toBeGreaterThan(foodieP[0]!);
  });
});
