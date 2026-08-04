import type { TripOutcome } from '../loyalty/types.js';
import type { Position } from '../market/types.js';

/** The slice of `MarketSystem` reputation reads. See `loyalty/types.ts` for why. */
export interface NeighborReader {
  householdIds(): readonly number[];
  householdPosition(householdId: number): Position;
  pendingOutcomes(): readonly TripOutcome[];
}
