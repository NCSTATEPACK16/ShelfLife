import { describe, expect, it } from 'vitest';
import type { GoodDef } from '../goods/types.js';
import { DEFAULT_SUPPLY_POLICIES, parseSupplyPolicies } from './catalog.js';

const GOODS: readonly GoodDef[] = [
  { id: 'milk', name: 'Milk', unitPrice: 3, cost: 1.8, depletionPerDay: 0.15, reorderThreshold: 0.3, impulseBase: 0.05, category: 'dairy' },
];

describe('parseSupplyPolicies', () => {
  it('parses a valid policy list', () => {
    const parsed = parseSupplyPolicies(
      [
        {
          goodId: 'milk',
          reorderPoint: 8,
          orderUpToLevel: 24,
          leadTimeTicks: 1440,
          supplierReliability: 0.9,
          spoilageTauDays: 7,
        },
      ],
      GOODS,
    );
    expect(parsed).toHaveLength(1);
  });

  it('rejects a policy whose goodId is not in the goods catalog', () => {
    expect(() =>
      parseSupplyPolicies(
        [
          {
            goodId: 'unknown-good',
            reorderPoint: 8,
            orderUpToLevel: 24,
            leadTimeTicks: 1440,
            supplierReliability: 0.9,
            spoilageTauDays: 7,
          },
        ],
        GOODS,
      ),
    ).toThrow();
  });

  it('rejects a duplicate goodId', () => {
    const policy = {
      goodId: 'milk',
      reorderPoint: 8,
      orderUpToLevel: 24,
      leadTimeTicks: 1440,
      supplierReliability: 0.9,
      spoilageTauDays: 7,
    };
    expect(() => parseSupplyPolicies([policy, policy], GOODS)).toThrow();
  });

  it('rejects orderUpToLevel <= reorderPoint', () => {
    expect(() =>
      parseSupplyPolicies(
        [
          {
            goodId: 'milk',
            reorderPoint: 20,
            orderUpToLevel: 10,
            leadTimeTicks: 1440,
            supplierReliability: 0.9,
            spoilageTauDays: 7,
          },
        ],
        GOODS,
      ),
    ).toThrow();
  });

  it('loads content/inventory/policy.json against content/goods/catalog.json into DEFAULT_SUPPLY_POLICIES', () => {
    expect(DEFAULT_SUPPLY_POLICIES.length).toBeGreaterThan(0);
    expect(DEFAULT_SUPPLY_POLICIES.find((p) => p.goodId === 'milk')).toBeDefined();
  });
});
