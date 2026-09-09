import type { Vec2 } from '../pathing/types.js';

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
  /** The checkout lane instance chosen for this trip, or `null` before one is picked. */
  readonly checkoutLaneId: number | null;
  /** Whether `CheckoutSystem#joinQueue` has been called for `checkoutLaneId` yet. */
  readonly checkoutJoined: boolean;
  readonly checkoutJoinedAtTick: number | null;
  /** Ticks actually waited once the trip resolves (sold/balked/abandoned) — feeds queuePenalty. */
  readonly checkoutWaitTicks: number;
  readonly usedSelfCheckout: boolean;
  readonly balked: boolean;
  readonly abandoned: boolean;
  /** Sum of §5.3's `priceSurprise` across every item in `cart` — averaged at trip end. */
  readonly priceSurpriseSum: number;
  /** Set once, the moment this trip's checkout queue is joined — null until then. */
  readonly staffInteractionGood: boolean | null;
  /** Whether the live mid-trip queuePenaltyRising tell has already fired this trip, so it
   *  fires once per trip, not once per tick above threshold. */
  readonly queuePenaltyRisingFired: boolean;
}
