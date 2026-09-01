import { describe, expect, it } from 'vitest';
import { DEFAULT_RIVALS_CONFIG, parseRivalsConfig } from './config.js';

describe('rivals config', () => {
  it('loads defaults with a positive weekly window and a price floor in (0,1]', () => {
    expect(DEFAULT_RIVALS_CONFIG.weeklyWindowDays).toBeGreaterThan(0);
    expect(DEFAULT_RIVALS_CONFIG.minPriceIndex).toBeGreaterThan(0);
    expect(DEFAULT_RIVALS_CONFIG.minPriceIndex).toBeLessThanOrEqual(1);
  });
  it('rejects a non-positive weekly window', () => {
    expect(() => parseRivalsConfig({ ...raw(), weeklyWindowDays: 0 })).toThrow();
  });
});
function raw() {
  return JSON.parse(JSON.stringify(DEFAULT_RIVALS_CONFIG));
}
