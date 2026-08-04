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
  /** Basket cost relative to catalog reference prices. < 1 is cheaper than reference. */
  readonly priceIndex: number;
  /** Fraction of a typical household's list this store carries — [0,1]. */
  readonly assortmentBreadth: number;
  /**
   * Per-store loyalty decay δ (§5.2). Omitted here; the default from market.json5
   * applies. The override exists for bosses — "Trailblazer Jim's runs δ/5" is
   * mechanically what a cult is — and is deliberately unused in phase 2.0c.
   *
   * The explicit `| undefined` is what `exactOptionalPropertyTypes` requires to accept
   * Zod's `.optional()` output.
   */
  readonly loyaltyDecay?: number | undefined;
}

/**
 * A household in the catchment (PLAN.md §5.1, §5.4).
 *
 * Owned by `MarketSystem` since phase 2.0c. It lived in `shoppers/` while the in-store
 * agent was its only consumer; the store-choice scheduler must reason about a household
 * before any shopper exists, so ownership moved with the decision.
 */
export interface Household {
  readonly id: number;
  readonly segment: Segment;
  /** Where this household lives on the coarse catchment grid — NOT an in-store position. */
  readonly position: Position;
  /** Stock level (0-1) per good id. A good absent from the map is treated as fully stocked (1). */
  readonly pantry: Readonly<Record<string, number>>;
  /** Good ids below their reorderThreshold, in catalog order — deterministic, no ties to break. */
  readonly list: readonly string[];
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
  /** βb's input, keyed by store `identity`. An absent identity is neutral (0). */
  readonly brandAffinity: Readonly<Record<string, number>>;
}
