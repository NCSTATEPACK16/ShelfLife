import JSON5 from 'json5';
import { z } from 'zod';
import raw from '../../content/balance/harness.json5?raw';

const unit = z.number().min(0).max(1);

const HarnessConfigSchema = z.object({
  world: z.object({
    householdCount: z.number().int().positive(),
    segmentMix: z.record(z.string(), z.number().nonnegative()),
    catchmentMarginCells: z.number().int().nonnegative(),
  }),
  winCondition: z.object({
    trailingWindowDays: z.number().int().positive(),
    shareThreshold: unit,
  }),
  strategies: z.object({
    random: z.object({
      actionChance: unit,
    }),
    priceWar: z.object({
      cutFraction: unit,
      promotionCadenceDays: z.number().int().positive(),
      promotionDiscountFraction: unit,
      promotionDurationDays: z.number().int().positive(),
    }),
    premium: z.object({
      markupFraction: z.number().nonnegative(),
    }),
    service: z.object({
      staffTarget: z.number().int().positive(),
      hireSkill: unit,
      hireMorale: unit,
      trainCadenceDays: z.number().int().positive(),
    }),
  }),
});

export type HarnessConfig = z.infer<typeof HarnessConfigSchema>;

export function parseHarnessConfig(rawValue: unknown): HarnessConfig {
  return HarnessConfigSchema.parse(rawValue);
}

export const DEFAULT_HARNESS_CONFIG: HarnessConfig = parseHarnessConfig(JSON5.parse(raw));
