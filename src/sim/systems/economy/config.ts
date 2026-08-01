import JSON5 from 'json5';
import { z } from 'zod';
import raw from '../../../../content/balance/economy.json5?raw';

const EconomyConfigSchema = z.object({
  rentPerDay: z.number().nonnegative(),
  utilitiesPerDay: z.number().nonnegative(),
  elasticityCoefficient: z.number().positive(),
  priceSurpriseWeight: z.number().nonnegative(),
  lossLeaderMarginThreshold: z.number().positive(),
});

export type EconomyConfig = z.infer<typeof EconomyConfigSchema>;

export function parseEconomyConfig(raw: unknown): EconomyConfig {
  return EconomyConfigSchema.parse(raw);
}

export const DEFAULT_ECONOMY_CONFIG: EconomyConfig = parseEconomyConfig(JSON5.parse(raw));
