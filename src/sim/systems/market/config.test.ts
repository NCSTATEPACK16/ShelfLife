import { describe, expect, it } from 'vitest';
import { DEFAULT_SEGMENT_CONFIG, parseSegmentConfig } from './config.js';
import { SEGMENTS } from './types.js';

const WEIGHTS = {
  priceFit: 0.5, assortmentFit: 0.5, quality: 0.5, service: 0.5,
  ambiance: 0.5, loyalty: 0.5, brandAffinity: 0.5, travelCost: 0.5,
  temperature: 1.0,
};

function validConfig(): unknown[] {
  return SEGMENTS.map((segment) => ({ segment, weights: WEIGHTS, consumptionMultiplier: 1.0 }));
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
    const dup = [...validConfig(), { segment: 'family', weights: WEIGHTS, consumptionMultiplier: 1.0 }];
    expect(() => parseSegmentConfig(dup)).toThrow(/Duplicate segment/);
  });

  it('rejects an unknown segment id', () => {
    const bogus = [...validConfig().slice(1), { segment: 'nonexistent', weights: WEIGHTS, consumptionMultiplier: 1.0 }];
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
