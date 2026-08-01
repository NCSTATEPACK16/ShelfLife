export interface SupplyPolicy {
  readonly goodId: string;
  /** Stock level (s) at or below which a reorder is placed. */
  readonly reorderPoint: number;
  /** Target stock level (S) a reorder tops up to. */
  readonly orderUpToLevel: number;
  readonly leadTimeTicks: number;
  /** Probability (0-1) a placed order arrives in full rather than at half quantity. */
  readonly supplierReliability: number;
  /** PLAN.md §5.5's τ_sku, in days (converted to ticks internally). */
  readonly spoilageTauDays: number;
}

export interface Batch {
  readonly quantity: number;
  readonly deliveredAtTick: number;
}

export interface PendingOrder {
  readonly quantity: number;
  readonly arrivesAtTick: number;
}

export interface StockedGood {
  readonly goodId: string;
  /** Oldest first — consumed and swept FIFO. */
  readonly batches: readonly Batch[];
  readonly pendingOrders: readonly PendingOrder[];
}

export type ConsumeResult = 'sold' | 'markdown' | 'spoiled' | 'outOfStock';
