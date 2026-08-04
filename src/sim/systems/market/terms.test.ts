import { describe, expect, it } from 'vitest';
import { DEFAULT_GOODS_CATALOG } from '../goods/catalog.js';
import { DEFAULT_MARKET_CONFIG, DEFAULT_RIVAL_STORES } from './config.js';
import { playerStoreTerms, rivalStoreTerms } from './terms.js';

const list = ['milk', 'bread'];

const stubDeps = (overrides: Partial<Parameters<typeof playerStoreTerms>[0]> = {}) => ({
  list,
  catalog: DEFAULT_GOODS_CATALOG,
  tick: 0,
  priceOf: () => 1,
  referencePriceOf: () => 1,
  stockOf: () => 10,
  freshnessOf: () => 1,
  serviceScore: () => 0.7,
  loyalty: 0.3,
  brandAffinity: 0.1,
  travelCost: 0,
  config: DEFAULT_MARKET_CONFIG,
  ...overrides,
});

describe('playerStoreTerms', () => {
  it('reports neutral price fit when prices match reference', () => {
    expect(playerStoreTerms(stubDeps()).priceFit).toBeCloseTo(DEFAULT_MARKET_CONFIG.priceFitNeutral);
  });

  it('rewards prices below reference', () => {
    const cheap = playerStoreTerms(stubDeps({ priceOf: () => 0.5 }));
    expect(cheap.priceFit).toBeGreaterThan(DEFAULT_MARKET_CONFIG.priceFitNeutral);
  });

  it('punishes prices above reference', () => {
    const dear = playerStoreTerms(stubDeps({ priceOf: () => 2 }));
    expect(dear.priceFit).toBeLessThan(DEFAULT_MARKET_CONFIG.priceFitNeutral);
  });

  it('scores assortment as the fraction of the list actually in stock', () => {
    const half = playerStoreTerms(stubDeps({ stockOf: (id: string) => (id === 'milk' ? 5 : 0) }));
    expect(half.assortmentFit).toBeCloseTo(0.5);
  });

  it('treats an empty list as fully served rather than dividing by zero', () => {
    expect(playerStoreTerms(stubDeps({ list: [] })).assortmentFit).toBe(1);
  });

  it('takes quality from mean freshness of in-stock goods', () => {
    expect(playerStoreTerms(stubDeps({ freshnessOf: () => 0.4 })).quality).toBeCloseTo(0.4);
  });

  it('uses the authored ambiance stub', () => {
    expect(playerStoreTerms(stubDeps()).ambiance).toBe(DEFAULT_MARKET_CONFIG.playerAmbiance);
  });
});

describe('rivalStoreTerms', () => {
  it('maps the authored price index through the same fit curve', () => {
    const savALott = DEFAULT_RIVAL_STORES[0]!;
    const terms = rivalStoreTerms(savALott, {
      loyalty: 0,
      brandAffinity: 0,
      travelCost: 0,
      config: DEFAULT_MARKET_CONFIG,
    });
    // priceIndex < 1, so the discounter must look better on price than a store at reference.
    expect(terms.priceFit).toBeGreaterThan(DEFAULT_MARKET_CONFIG.priceFitNeutral);
    expect(terms.assortmentFit).toBe(savALott.assortmentBreadth);
    expect(terms.quality).toBe(savALott.quality);
    expect(terms.storeId).toBe(savALott.id);
  });
});
