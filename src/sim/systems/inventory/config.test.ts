import { describe, expect, it } from 'vitest';
import { DEFAULT_INVENTORY_CONFIG, parseInventoryConfig } from './config.js';

describe('parseInventoryConfig', () => {
  it('parses a valid config', () => {
    const config = parseInventoryConfig({
      dockCapacity: 2,
      markdownThreshold: 0.35,
      shrinkThreshold: 0.15,
      markdownDiscount: 0.3,
    });
    expect(config.dockCapacity).toBe(2);
  });

  it('rejects shrinkThreshold >= markdownThreshold', () => {
    expect(() =>
      parseInventoryConfig({
        dockCapacity: 2,
        markdownThreshold: 0.2,
        shrinkThreshold: 0.35,
        markdownDiscount: 0.3,
      }),
    ).toThrow();
  });

  it('loads content/balance/inventory.json5 into DEFAULT_INVENTORY_CONFIG', () => {
    expect(DEFAULT_INVENTORY_CONFIG.dockCapacity).toBeGreaterThan(0);
    expect(DEFAULT_INVENTORY_CONFIG.shrinkThreshold).toBeLessThan(DEFAULT_INVENTORY_CONFIG.markdownThreshold);
  });
});
