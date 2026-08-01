import { describe, expect, it } from 'vitest';
import { buildShopperDrawPlan } from './shopper-draw-plan.js';

describe('buildShopperDrawPlan', () => {
  it('produces one marker per active shopper', () => {
    const shoppers = [
      { id: 1, x: 2.5, y: 3.5, state: 'shopping' as const },
      { id: 2, x: 6, y: 6, state: 'leaving' as const },
    ];
    const plan = buildShopperDrawPlan(shoppers, { x: 0, y: 0 });
    expect(plan).toHaveLength(2);
  });

  it('places each marker via the iso projection of its world position', () => {
    const plan = buildShopperDrawPlan([{ id: 1, x: 0, y: 0, state: 'entering' as const }], { x: 100, y: 50 });
    expect(plan[0]).toEqual({ id: 1, x: 100, y: 50, state: 'entering' });
  });
});
