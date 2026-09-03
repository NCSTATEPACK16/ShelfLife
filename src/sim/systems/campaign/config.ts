import JSON5 from 'json5';
import { z } from 'zod';
import l1Raw from '../../../../content/levels/l1-sav-a-lott.json5?raw';
import l2Raw from '../../../../content/levels/l2-grocerteria-24.json5?raw';
import l3Raw from '../../../../content/levels/l3-bulkhaus-club.json5?raw';
import type { LevelContent } from './types.js';

const unit = z.number().min(0).max(1);

const ShareThresholdObjectiveSchema = z.object({
  type: z.literal('shareThreshold'),
  trailingWindowDays: z.number().int().positive(),
  threshold: unit,
});

const ObjectiveSchema = ShareThresholdObjectiveSchema;

const EbitdaStreakLoseConditionSchema = z.object({
  type: z.literal('ebitdaStreak'),
  maxNegativeDays: z.number().int().positive(),
});

const LoseConditionSchema = EbitdaStreakLoseConditionSchema;

const AdvisorLineSchema = z.object({
  advisor: z.string().min(1),
  line: z.string().min(1),
});

const ChapterDefSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  mechanicUnlock: z.string().min(1).optional(),
  introCopy: AdvisorLineSchema,
  outroCopy: AdvisorLineSchema,
  objective: ObjectiveSchema,
});

const HouseholdGenerationConfigSchema = z.object({
  householdCount: z.number().int().positive(),
  segmentMix: z.record(z.string(), z.number().nonnegative()),
  catchmentMarginCells: z.number().int().nonnegative(),
});

const LevelContentSchema = z.object({
  id: z.string().min(1),
  rivalId: z.string().min(1),
  name: z.string().min(1),
  chapters: z.array(ChapterDefSchema).min(1),
  loseCondition: LoseConditionSchema,
  households: HouseholdGenerationConfigSchema,
});

export function parseLevelContent(raw: unknown): LevelContent {
  return LevelContentSchema.parse(raw);
}

const RAW_LEVEL_FILES: readonly string[] = [l1Raw, l2Raw, l3Raw];

export const DEFAULT_LEVEL_CONTENT: ReadonlyMap<string, LevelContent> = new Map(
  RAW_LEVEL_FILES.map((raw) => {
    const content = parseLevelContent(JSON5.parse(raw));
    return [content.id, content] as const;
  }),
);
