/**
 * A coordinate on the coarse catchment grid (PLAN.md §5.1).
 *
 * Deliberately NOT `pathing`'s `Vec2`: that is a continuous in-store position on the
 * `BuildGrid` (phase 1.4). This is an abstract integer city-scale coordinate space with
 * no relationship to, and no interaction with, the store's interior grid.
 */
export interface Position {
  readonly x: number;
  readonly y: number;
}

export const SEGMENTS = [
  'priceHunter', 'convenience', 'family', 'foodie', 'bulk', 'senior', 'student',
] as const;
export type Segment = (typeof SEGMENTS)[number];

export interface UtilityWeights {
  readonly priceFit: number;      // βp
  readonly assortmentFit: number; // βa
  readonly quality: number;       // βq
  readonly service: number;       // βv
  readonly ambiance: number;      // βm
  readonly loyalty: number;       // βl
  readonly brandAffinity: number; // βb
  readonly travelCost: number;    // βd
  readonly temperature: number;   // τ, > 0
}

export interface SegmentDef {
  readonly segment: Segment;
  readonly weights: UtilityWeights;
  /** Multiplies every good's depletionPerDay for a household of this segment. */
  readonly consumptionMultiplier: number;
}
