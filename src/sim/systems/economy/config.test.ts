import { describe, expect, it } from 'vitest';
import { DEFAULT_ECONOMY_CONFIG, parseEconomyConfig } from './config.js';

const VALID = {
  rentPerDay: 200,
  utilitiesPerDay: 40,
  elasticityCoefficient: 1.2,
  priceSurpriseWeight: 0.15,
  lossLeaderMarginThreshold: 1.0,
};

describe('parseEconomyConfig', () => {
  it('parses a valid config', () => {
    expect(parseEconomyConfig(VALID).rentPerDay).toBe(200);
  });

  it('rejects a negative rentPerDay', () => {
    expect(() => parseEconomyConfig({ ...VALID, rentPerDay: -1 })).toThrow();
  });

  it('loads content/balance/economy.json5 into DEFAULT_ECONOMY_CONFIG', () => {
    expect(DEFAULT_ECONOMY_CONFIG.elasticityCoefficient).toBeGreaterThan(0);
  });
});
