import JSON5 from 'json5';
import { z } from 'zod';
import raw from '../../../../content/balance/shoppers.json5?raw';

const ShoppersConfigSchema = z.object({
  fillRateWeight: z.number().nonnegative(),
  discoveryWeight: z.number().nonnegative(),
  spoiledEncountersWeight: z.number().nonnegative(),
  queuePenaltyWeight: z.number().nonnegative(),
  abandonExtraPenalty: z.number().nonnegative(),
  exposureRadius: z.number().positive(),
  adjacentCellThreshold: z.number().positive(),
  cleanlinessWeight: z.number().nonnegative(),
  staffInteractionWeight: z.number().nonnegative(),
});

export type ShoppersConfig = z.infer<typeof ShoppersConfigSchema>;

export function parseShoppersConfig(raw: unknown): ShoppersConfig {
  return ShoppersConfigSchema.parse(raw);
}

export const DEFAULT_SHOPPERS_CONFIG: ShoppersConfig = parseShoppersConfig(JSON5.parse(raw));
