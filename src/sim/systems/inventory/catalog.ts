import { z } from 'zod';
import policyJson from '../../../../content/inventory/policy.json';
import { DEFAULT_GOODS_CATALOG } from '../goods/catalog.js';
import type { GoodDef } from '../goods/types.js';
import type { SupplyPolicy } from './types.js';

const SupplyPolicySchema = z
  .object({
    goodId: z.string().min(1),
    reorderPoint: z.number().nonnegative(),
    orderUpToLevel: z.number().positive(),
    leadTimeTicks: z.number().positive(),
    supplierReliability: z.number().min(0).max(1),
    spoilageTauDays: z.number().positive(),
  })
  .refine((p) => p.orderUpToLevel > p.reorderPoint, {
    message: 'orderUpToLevel must be greater than reorderPoint',
  });

const PolicyListSchema = z.array(SupplyPolicySchema).min(1);

export function parseSupplyPolicies(raw: unknown, goods: readonly GoodDef[]): readonly SupplyPolicy[] {
  const parsed = PolicyListSchema.parse(raw);
  const knownGoodIds = new Set(goods.map((g) => g.id));
  const seen = new Set<string>();
  for (const policy of parsed) {
    if (!knownGoodIds.has(policy.goodId)) {
      throw new Error(`Supply policy references unknown good id: ${policy.goodId}`);
    }
    if (seen.has(policy.goodId)) {
      throw new Error(`Duplicate supply policy for good id: ${policy.goodId}`);
    }
    seen.add(policy.goodId);
  }
  return parsed;
}

export const DEFAULT_SUPPLY_POLICIES: readonly SupplyPolicy[] = parseSupplyPolicies(
  policyJson,
  DEFAULT_GOODS_CATALOG,
);
