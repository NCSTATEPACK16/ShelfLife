import { describe, expect, it } from 'vitest';
import { DEFAULT_STAFFING_CONFIG, parseStaffingConfig } from './config.js';

const VALID = {
  serviceTicksPerItem: 3,
  wagePerStaffPerDay: 120,
  balkToleranceTicks: 200,
  abandonToleranceTicks: 400,
  trainingSkillIncrement: 0.1,
  selfCheckoutServiceMultiplier: 0.7,
  selfCheckoutServiceScorePenalty: 0.08,
  cleanlinessDecayPerTick: 0.0002,
  cleanlinessRestorePerStaffPerTick: 0.0005,
};

describe('parseStaffingConfig', () => {
  it('parses a valid config', () => {
    expect(parseStaffingConfig(VALID).serviceTicksPerItem).toBe(3);
  });

  it('rejects abandonToleranceTicks <= balkToleranceTicks', () => {
    expect(() => parseStaffingConfig({ ...VALID, abandonToleranceTicks: 100 })).toThrow();
  });

  it('loads content/balance/staffing.json5 into DEFAULT_STAFFING_CONFIG', () => {
    expect(DEFAULT_STAFFING_CONFIG.abandonToleranceTicks).toBeGreaterThan(DEFAULT_STAFFING_CONFIG.balkToleranceTicks);
  });
});
