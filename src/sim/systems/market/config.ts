import JSON5 from 'json5';
import { z } from 'zod';
import raw from '../../../../content/balance/segments.json5?raw';
import catchmentRaw from '../../../../content/balance/catchment.json5?raw';
import savALottRaw from '../../../../content/rivals/sav-a-lott.json5?raw';
import { SEGMENTS, type RivalStore, type Segment, type SegmentDef } from './types.js';

const UtilityWeightsSchema = z.object({
  priceFit: z.number().finite(),
  assortmentFit: z.number().finite(),
  quality: z.number().finite(),
  service: z.number().finite(),
  ambiance: z.number().finite(),
  loyalty: z.number().finite(),
  brandAffinity: z.number().finite(),
  travelCost: z.number().finite(),
  temperature: z.number().finite().positive(),
});

const SegmentDefSchema = z.object({
  segment: z.enum(SEGMENTS),
  weights: UtilityWeightsSchema,
  consumptionMultiplier: z.number().positive(),
});

const SegmentListSchema = z.array(SegmentDefSchema);

export type SegmentConfig = ReadonlyMap<Segment, SegmentDef>;

export function parseSegmentConfig(raw: unknown): SegmentConfig {
  const parsed = SegmentListSchema.parse(raw);
  const map = new Map<Segment, SegmentDef>();
  for (const def of parsed) {
    if (map.has(def.segment)) throw new Error(`Duplicate segment id in config: ${def.segment}`);
    map.set(def.segment, def);
  }
  for (const segment of SEGMENTS) {
    if (!map.has(segment)) throw new Error(`Missing segment in config: ${segment}`);
  }
  return map;
}

export function consumptionMultiplierFor(config: SegmentConfig, segment: Segment): number {
  return config.get(segment)!.consumptionMultiplier;
}

export const DEFAULT_SEGMENT_CONFIG: SegmentConfig = parseSegmentConfig(JSON5.parse(raw));

const PositionSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
});

const CatchmentConfigSchema = z.object({
  playerStorePosition: PositionSchema,
  // Non-positive would make travelCost meaningless (0) or perverse (distance is rewarded).
  distanceCostPerUnit: z.number().positive(),
});

export type CatchmentConfig = z.infer<typeof CatchmentConfigSchema>;

export function parseCatchmentConfig(raw: unknown): CatchmentConfig {
  return CatchmentConfigSchema.parse(raw);
}

export const DEFAULT_CATCHMENT_CONFIG: CatchmentConfig = parseCatchmentConfig(
  JSON5.parse(catchmentRaw),
);

const RivalStoreSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  archetype: z.string().min(1),
  communityLove: z.number().min(0).max(100),
  position: PositionSchema,
  identity: z.string().min(1),
  quality: z.number().min(0).max(1),
  service: z.number().min(0).max(1),
  ambiance: z.number().min(0).max(1),
});

export function parseRivalStore(raw: unknown): RivalStore {
  return RivalStoreSchema.parse(raw);
}

/**
 * Only Sav-A-Lott (§3's L1 boss) exists. The other nine rivals are added when their level
 * is built (§16 phase 5.1) — stubbing them now would be content that no test can justify.
 */
export const DEFAULT_RIVAL_STORES: readonly RivalStore[] = [
  parseRivalStore(JSON5.parse(savALottRaw)),
];
