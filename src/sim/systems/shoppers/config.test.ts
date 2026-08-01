import { describe, expect, it } from 'vitest';
import { DEFAULT_SHOPPERS_CONFIG, parseShoppersConfig } from './config.js';

describe('parseShoppersConfig', () => {
  it('parses a valid config', () => {
    const config = parseShoppersConfig({
      fillRateWeight: 0.5,
      discoveryWeight: 0.2,
      spoiledEncountersWeight: 0.2,
      queuePenaltyWeight: 0.3,
      abandonExtraPenalty: 0.15,
      exposureRadius: 3,
      adjacentCellThreshold: 1,
    });
    expect(config.fillRateWeight).toBe(0.5);
  });

  it('rejects a negative exposureRadius', () => {
    expect(() =>
      parseShoppersConfig({
        fillRateWeight: 0.5,
        discoveryWeight: 0.2,
        spoiledEncountersWeight: 0.2,
        queuePenaltyWeight: 0.3,
        abandonExtraPenalty: 0.15,
        exposureRadius: -1,
        adjacentCellThreshold: 1,
      }),
    ).toThrow();
  });

  it('loads content/balance/shoppers.json5 into DEFAULT_SHOPPERS_CONFIG', () => {
    expect(DEFAULT_SHOPPERS_CONFIG.exposureRadius).toBeGreaterThan(0);
    expect(DEFAULT_SHOPPERS_CONFIG.adjacentCellThreshold).toBeGreaterThan(0);
  });
});
