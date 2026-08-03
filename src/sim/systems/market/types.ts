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

/**
 * A competing store in the catchment (PLAN.md §3, §5.1).
 *
 * `quality`/`service`/`ambiance` are the store-level terms `U(h,s)` multiplies against a
 * segment's `UtilityWeights`. They are authored and validated now; nothing evaluates
 * `U(h,s)` until the store-choice logit sub-phase.
 */
export interface RivalStore {
  readonly id: string;
  readonly name: string;
  /** Flavour text naming the satirised *category*, never a real chain. */
  readonly archetype: string;
  /** Community Love, PLAN.md §3 — 0–100. */
  readonly communityLove: number;
  readonly position: Position;
  /** Tag for the future `brandAffinity(h, s.identity)` term. */
  readonly identity: string;
  /** Store-level U(h,s) term, §5.1 — [0,1]. */
  readonly quality: number;
  /** Store-level U(h,s) term, §5.1 — [0,1]. */
  readonly service: number;
  /** Store-level U(h,s) term, §5.1 — [0,1]. */
  readonly ambiance: number;
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
