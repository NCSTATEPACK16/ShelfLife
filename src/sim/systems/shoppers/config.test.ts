import { describe, expect, it } from 'vitest';
import { DEFAULT_SHOPPERS_CONFIG, parseShoppersConfig } from './config.js';

const VALID = {
  fillRateWeight: 0.5,
  discoveryWeight: 0.2,
  spoiledEncountersWeight: 0.2,
  queuePenaltyWeight: 0.3,
  abandonExtraPenalty: 0.15,
  exposureRadius: 3,
  adjacentCellThreshold: 1,
  cleanlinessWeight: 0.15,
  staffInteractionWeight: 0.1,
};

describe('parseShoppersConfig', () => {
  it('parses a valid config', () => {
    const config = parseShoppersConfig(VALID);
    expect(config.fillRateWeight).toBe(0.5);
  });

  it('rejects a negative exposureRadius', () => {
    expect(() => parseShoppersConfig({ ...VALID, exposureRadius: -1 })).toThrow();
  });

  it('loads content/balance/shoppers.json5 into DEFAULT_SHOPPERS_CONFIG', () => {
    expect(DEFAULT_SHOPPERS_CONFIG.exposureRadius).toBeGreaterThan(0);
    expect(DEFAULT_SHOPPERS_CONFIG.adjacentCellThreshold).toBeGreaterThan(0);
  });

  it('loads cleanlinessWeight and staffInteractionWeight from content', () => {
    expect(DEFAULT_SHOPPERS_CONFIG.cleanlinessWeight).toBeGreaterThan(0);
    expect(DEFAULT_SHOPPERS_CONFIG.staffInteractionWeight).toBeGreaterThan(0);
  });

  it('requires both new weights', () => {
    const { cleanlinessWeight: _a, ...rest } = VALID;
    expect(() => parseShoppersConfig(rest)).toThrow();
  });
});
