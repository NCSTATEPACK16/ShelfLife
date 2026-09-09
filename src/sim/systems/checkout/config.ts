import JSON5 from 'json5';
import { z } from 'zod';
import raw from '../../../../content/balance/staffing.json5?raw';

const StaffingConfigSchema = z
  .object({
    serviceTicksPerItem: z.number().positive(),
    wagePerStaffPerDay: z.number().nonnegative(),
    balkToleranceTicks: z.number().positive(),
    abandonToleranceTicks: z.number().positive(),
    trainingSkillIncrement: z.number().positive(),
    selfCheckoutServiceMultiplier: z.number().positive(),
    selfCheckoutServiceScorePenalty: z.number().min(0).max(1),
    selfCheckoutSkillEquivalent: z.number().min(0).max(1),
    cleanlinessDecayPerTick: z.number().min(0).max(1),
    cleanlinessRestorePerStaffPerTick: z.number().min(0).max(1),
    staffInteractionMoraleThreshold: z.number().min(0).max(1),
  })
  .refine((c) => c.abandonToleranceTicks > c.balkToleranceTicks, {
    message: 'abandonToleranceTicks must be greater than balkToleranceTicks',
  });

export type StaffingConfig = z.infer<typeof StaffingConfigSchema>;

export function parseStaffingConfig(raw: unknown): StaffingConfig {
  return StaffingConfigSchema.parse(raw);
}

export const DEFAULT_STAFFING_CONFIG: StaffingConfig = parseStaffingConfig(JSON5.parse(raw));
