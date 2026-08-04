/**
 * A completed trip, player store or rival. The two paths converge here deliberately:
 * downstream of this type, a rival trip is not a special case.
 */
export interface TripOutcome {
  readonly householdId: number;
  /** 0 = the player's store; 1..n = rivals in authored roster order. */
  readonly storeIndex: number;
  readonly satisfaction: number;
}

/**
 * The slice of `MarketSystem` that loyalty and reputation read.
 *
 * Declared here rather than importing `MarketSystem` so `loyalty/` and `reputation/`
 * do not form an import cycle with `market/`, which depends on `loyalty/`.
 */
export interface MarketReader {
  householdIds(): readonly number[];
  pendingOutcomes(): readonly TripOutcome[];
}
