import type { Vec2 } from '../pathing/types.js';

export interface Household {
  readonly id: number;
  /** Stock level (0-1) per good id. A good absent from the map is treated as fully stocked (1). */
  readonly pantry: Readonly<Record<string, number>>;
  /** Good ids below their reorderThreshold, in catalog order — deterministic, no ties to break. */
  readonly list: readonly string[];
}

export type ShopperState = 'entering' | 'shopping' | 'checkingOut' | 'leaving' | 'done';

export interface Shopper {
  readonly id: number;
  readonly householdId: number;
  readonly position: Vec2;
  readonly state: ShopperState;
  /** Remaining good ids to collect, in visit order. */
  readonly remainingList: readonly string[];
  /** Good ids already collected this trip (sold or markdown — never spoiled/outOfStock). */
  readonly cart: readonly string[];
  /** Sum of what was actually paid for `cart`'s contents, markdowns already applied. */
  readonly cartTotal: number;
  /** Requested list length at spawn — the denominator for fillRate. */
  readonly requested: number;
  readonly impulseHits: number;
  /** Count of §5.3's `spoiledEncounters` — a shelf pick that came back spoiled. */
  readonly spoiledEncounters: number;
}
