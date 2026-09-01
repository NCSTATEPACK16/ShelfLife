import JSON5 from 'json5';
import { z } from 'zod';
import raw from '../../../../content/balance/rivals.json5?raw';

const nonNegativeFinite = z.number().finite().nonnegative();

const RivalsConfigSchema = z.object({
  weeklyWindowDays: z.number().int().positive(),
  minPriceIndex: z.number().positive().max(1),
  reactionRate: nonNegativeFinite,
  derive: z.object({
    qualityFromInvestment: nonNegativeFinite,
    priceFromAggression: nonNegativeFinite,
    ambianceFromMarketing: nonNegativeFinite,
    decayFloorFromLove: nonNegativeFinite,
  }),
  signatures: z.object({
    oneRegister: z.object({
      serviceCongestion: nonNegativeFinite,
    }),
    neverCloses: z.object({
      segmentBump: nonNegativeFinite,
    }),
    membershipLockIn: z.object({
      decayMultiplier: nonNegativeFinite,
      assortmentBump: nonNegativeFinite,
    }),
  }),
});

export type RivalsConfig = z.infer<typeof RivalsConfigSchema>;

export function parseRivalsConfig(raw: unknown): RivalsConfig {
  return RivalsConfigSchema.parse(raw);
}

export const DEFAULT_RIVALS_CONFIG: RivalsConfig = parseRivalsConfig(JSON5.parse(raw));
