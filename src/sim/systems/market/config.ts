import JSON5 from 'json5';
import { z } from 'zod';
import raw from '../../../../content/balance/segments.json5?raw';
import catchmentRaw from '../../../../content/balance/catchment.json5?raw';
import marketRaw from '../../../../content/balance/market.json5?raw';
import savALottRaw from '../../../../content/rivals/sav-a-lott.json5?raw';
import { RIVAL_SIGNATURES, SEGMENTS, type RivalStore, type Segment, type SegmentDef } from './types.js';

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
  brandAffinity: z.record(z.string(), z.number().finite()),
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

const unit = z.number().min(0).max(1);
const RivalPersonalitySchema = z.object({
  priceAggression: unit,
  qualityInvestment: unit,
  marketingSpend: unit,
  expansionRate: unit,
  reactivity: unit,
  signature: z.enum(RIVAL_SIGNATURES),
});

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
  priceIndex: z.number().positive(),
  assortmentBreadth: z.number().min(0).max(1),
  loyaltyDecay: z.number().min(0).max(1).optional(),
  personality: RivalPersonalitySchema.optional(),
});

export function parseRivalStore(raw: unknown): RivalStore {
  return RivalStoreSchema.parse(raw);
}

/**
 * Only Sav-A-Lott (§3's L1 boss) is in the default roster so far. Grocerteria 24 and
 * BulkHaus Club content exists (this file) but the roster grows to all three once the
 * `rivals` system exists to consume them (`src/sim/systems/rivals/`, Task 7) — stubbing
 * the roster early would leave nothing hashing the two extra rivals' evolving state.
 */
export const DEFAULT_RIVAL_STORES: readonly RivalStore[] = [
  parseRivalStore(JSON5.parse(savALottRaw)),
];

const MarketConfigSchema = z
  .object({
    tripListThreshold: z.number().int().positive(),
    priceFitNeutral: z.number().min(0).max(1),
    playerAmbiance: z.number().min(0).max(1),
    loyaltyAlpha: z.number().positive().max(1),
    meanSatisfactionLambda: z.number().positive().max(1),
    loyaltyDecayDefault: z.number().min(0).max(1),
    decayCapDays: z.number().int().positive(),
    initialLoyalty: z.number().min(0).max(1),
    initialMeanSatisfaction: z.number().min(0).max(1),
    womNeighbors: z.number().int().positive(),
    womDelta: z.number().min(0).max(1),
    delightThreshold: z.number().min(0).max(1),
    disgustThreshold: z.number().min(0).max(1),
    rivalSatisfactionWeights: z.object({
      quality: z.number().min(0),
      service: z.number().min(0),
      ambiance: z.number().min(0),
      assortment: z.number().min(0),
      price: z.number().min(0),
    }),
  })
  .refine((c) => c.delightThreshold > c.disgustThreshold, {
    message: 'delightThreshold must exceed disgustThreshold',
  })
  .refine((c) => c.womDelta < c.loyaltyAlpha, {
    message: 'womDelta must be smaller than loyaltyAlpha — hearsay cannot outweigh a real trip',
  });

export type MarketConfig = z.infer<typeof MarketConfigSchema>;

export function parseMarketConfig(raw: unknown): MarketConfig {
  return MarketConfigSchema.parse(raw);
}

export const DEFAULT_MARKET_CONFIG: MarketConfig = parseMarketConfig(JSON5.parse(marketRaw));
