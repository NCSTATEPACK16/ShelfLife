import JSON5 from 'json5';
import { z } from 'zod';
import raw from '../../../../content/balance/segments.json5?raw';
import { SEGMENTS, type Segment, type SegmentDef } from './types.js';

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
