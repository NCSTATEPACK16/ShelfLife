import { z } from 'zod';
import catalogJson from '../../../../content/goods/catalog.json';
import type { GoodDef } from './types.js';

const GoodDefSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  unitPrice: z.number().positive(),
  cost: z.number().positive(),
  depletionPerDay: z.number().min(0).max(1),
  reorderThreshold: z.number().min(0).max(1),
  impulseBase: z.number().min(0).max(1),
  category: z.string().min(1),
});

const CatalogSchema = z.array(GoodDefSchema).min(1);

export function parseGoodsCatalog(raw: unknown): readonly GoodDef[] {
  const parsed = CatalogSchema.parse(raw);
  const seen = new Set<string>();
  for (const def of parsed) {
    if (seen.has(def.id)) throw new Error(`Duplicate good id in catalog: ${def.id}`);
    seen.add(def.id);
  }
  return parsed;
}

export const DEFAULT_GOODS_CATALOG: readonly GoodDef[] = parseGoodsCatalog(catalogJson);
