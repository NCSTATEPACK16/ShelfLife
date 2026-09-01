import { describe, expect, it } from 'vitest';
import JSON5 from 'json5';
import savALott from '../../../../content/rivals/sav-a-lott.json5?raw';
import grocerteria from '../../../../content/rivals/grocerteria-24.json5?raw';
import bulkhaus from '../../../../content/rivals/bulkhaus-club.json5?raw';
import {
  DEFAULT_MARKET_CONFIG,
  DEFAULT_RIVAL_STORES,
  DEFAULT_SEGMENT_CONFIG,
  parseMarketConfig,
  parseRivalStore,
  parseSegmentConfig,
} from './config.js';
import { SEGMENTS } from './types.js';

const WEIGHTS = {
  priceFit: 0.5, assortmentFit: 0.5, quality: 0.5, service: 0.5,
  ambiance: 0.5, loyalty: 0.5, brandAffinity: 0.5, travelCost: 0.5,
  temperature: 1.0,
};

const AFFINITY = { player: 0.0, 'deep-discount': 0.0 };

function validConfig(): unknown[] {
  return SEGMENTS.map((segment) => ({
    segment,
    weights: WEIGHTS,
    consumptionMultiplier: 1.0,
    brandAffinity: AFFINITY,
  }));
}

describe('parseSegmentConfig', () => {
  it('parses a valid config with all 7 segments', () => {
    const config = parseSegmentConfig(validConfig());
    expect(config.size).toBe(7);
    expect(config.get('family')?.consumptionMultiplier).toBe(1.0);
  });

  it('rejects a config missing a segment', () => {
    const incomplete = validConfig().slice(0, 6);
    expect(() => parseSegmentConfig(incomplete)).toThrow(/Missing segment/);
  });

  it('rejects a duplicate segment id', () => {
    const dup = [
      ...validConfig(),
      { segment: 'family', weights: WEIGHTS, consumptionMultiplier: 1.0, brandAffinity: AFFINITY },
    ];
    expect(() => parseSegmentConfig(dup)).toThrow(/Duplicate segment/);
  });

  it('rejects an unknown segment id', () => {
    const bogus = [
      ...validConfig().slice(1),
      { segment: 'nonexistent', weights: WEIGHTS, consumptionMultiplier: 1.0, brandAffinity: AFFINITY },
    ];
    expect(() => parseSegmentConfig(bogus)).toThrow();
  });

  it('rejects a temperature <= 0', () => {
    const bad = validConfig();
    (bad[0] as { weights: typeof WEIGHTS }).weights = { ...WEIGHTS, temperature: 0 };
    expect(() => parseSegmentConfig(bad)).toThrow();
  });

  it('rejects a non-finite weight', () => {
    const bad = validConfig();
    (bad[0] as { weights: typeof WEIGHTS }).weights = { ...WEIGHTS, priceFit: Number.POSITIVE_INFINITY };
    expect(() => parseSegmentConfig(bad)).toThrow();
  });

  it('rejects a non-positive consumptionMultiplier', () => {
    const bad = validConfig();
    (bad[0] as { consumptionMultiplier: number }).consumptionMultiplier = 0;
    expect(() => parseSegmentConfig(bad)).toThrow();
  });

  it('loads content/balance/segments.json5 into DEFAULT_SEGMENT_CONFIG', () => {
    expect(DEFAULT_SEGMENT_CONFIG.size).toBe(7);
    expect(DEFAULT_SEGMENT_CONFIG.get('family')?.consumptionMultiplier).toBe(1.0);
  });
});

describe('market config', () => {
  it('loads every phase 2.0c constant', () => {
    expect(DEFAULT_MARKET_CONFIG.tripListThreshold).toBeGreaterThan(0);
    expect(DEFAULT_MARKET_CONFIG.priceFitNeutral).toBeGreaterThan(0);
    expect(DEFAULT_MARKET_CONFIG.loyaltyAlpha).toBeGreaterThan(0);
    expect(DEFAULT_MARKET_CONFIG.womNeighbors).toBeGreaterThanOrEqual(1);
    expect(DEFAULT_MARKET_CONFIG.delightThreshold).toBeGreaterThan(DEFAULT_MARKET_CONFIG.disgustThreshold);
  });

  it('rejects a word-of-mouth nudge that outweighs an actual trip', () => {
    expect(() =>
      parseMarketConfig({ ...DEFAULT_MARKET_CONFIG, womDelta: DEFAULT_MARKET_CONFIG.loyaltyAlpha }),
    ).toThrow();
  });

  it('rejects a negative neighbour count', () => {
    expect(() => parseMarketConfig({ ...DEFAULT_MARKET_CONFIG, womNeighbors: 0 })).toThrow();
  });
});

describe('rival store fields', () => {
  it('authors a price index and assortment breadth for Sav-A-Lott', () => {
    const savALott = DEFAULT_RIVAL_STORES[0]!;
    expect(savALott.priceIndex).toBeLessThan(1);
    expect(savALott.assortmentBreadth).toBeGreaterThan(0);
    expect(savALott.assortmentBreadth).toBeLessThan(1);
  });
});

describe('segment brand affinity', () => {
  it('gives every segment an affinity map', () => {
    for (const def of DEFAULT_SEGMENT_CONFIG.values()) {
      expect(def.brandAffinity).toBeDefined();
      expect(def.brandAffinity['player']).toBeTypeOf('number');
    }
  });

  it('treats an unknown identity as neutral rather than throwing', () => {
    const foodie = DEFAULT_SEGMENT_CONFIG.get('foodie')!;
    expect(foodie.brandAffinity['no-such-identity'] ?? 0).toBe(0);
  });
});

describe('rival personality schema', () => {
  it('parses all three authored rivals with a personality block', () => {
    for (const raw of [savALott, grocerteria, bulkhaus]) {
      const rival = parseRivalStore(JSON5.parse(raw));
      expect(rival.personality).toBeDefined();
      expect(rival.personality!.reactivity).toBeGreaterThanOrEqual(0);
      expect(rival.personality!.reactivity).toBeLessThanOrEqual(1);
    }
  });

  it('rejects an unknown signature id', () => {
    const bad = {
      ...JSON5.parse(savALott),
      personality: { ...JSON5.parse(savALott).personality, signature: 'nope' },
    };
    expect(() => parseRivalStore(bad)).toThrow();
  });

  it('rejects a personality axis outside [0,1]', () => {
    const bad = {
      ...JSON5.parse(savALott),
      personality: { ...JSON5.parse(savALott).personality, priceAggression: 1.5 },
    };
    expect(() => parseRivalStore(bad)).toThrow();
  });
});
