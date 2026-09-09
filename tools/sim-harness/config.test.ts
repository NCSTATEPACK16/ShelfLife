import { describe, expect, it } from 'vitest';
import { DEFAULT_HARNESS_CONFIG, parseHarnessConfig } from './config.js';

describe('harness config', () => {
  it('loads defaults with a positive household count and a share threshold in [0,1]', () => {
    expect(DEFAULT_HARNESS_CONFIG.world.householdCount).toBeGreaterThan(0);
    expect(DEFAULT_HARNESS_CONFIG.winCondition.shareThreshold).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_HARNESS_CONFIG.winCondition.shareThreshold).toBeLessThanOrEqual(1);
  });
  it('rejects a non-positive household count', () => {
    const raw = JSON.parse(JSON.stringify(DEFAULT_HARNESS_CONFIG));
    raw.world.householdCount = 0;
    expect(() => parseHarnessConfig(raw)).toThrow();
  });
});
