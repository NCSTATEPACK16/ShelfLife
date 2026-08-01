import JSON5 from 'json5';
import { z } from 'zod';
import raw from '../../../../content/balance/inventory.json5?raw';

const InventoryConfigSchema = z
  .object({
    dockCapacity: z.number().int().positive(),
    markdownThreshold: z.number().min(0).max(1),
    shrinkThreshold: z.number().min(0).max(1),
    markdownDiscount: z.number().min(0).max(1),
  })
  .refine((c) => c.shrinkThreshold < c.markdownThreshold, {
    message: 'shrinkThreshold must be less than markdownThreshold',
  });

export type InventoryConfig = z.infer<typeof InventoryConfigSchema>;

export function parseInventoryConfig(raw: unknown): InventoryConfig {
  return InventoryConfigSchema.parse(raw);
}

export const DEFAULT_INVENTORY_CONFIG: InventoryConfig = parseInventoryConfig(JSON5.parse(raw));
