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
