export interface StaffMember {
  readonly id: number;
  readonly skill: number; // 0-1
  readonly morale: number; // 0-1, static per hire — see the phase plan's scope cuts
  readonly assignedRegisterId: number | null;
}

export interface QueuedShopper {
  readonly shopperId: number;
  readonly itemCount: number;
  readonly joinedAtTick: number;
}

export interface Serving {
  readonly shopperId: number;
  readonly remainingTicks: number;
}

export interface Lane {
  readonly instanceId: number;
  readonly isSelfCheckout: boolean;
  readonly staffId: number | null;
  readonly queue: readonly QueuedShopper[];
  readonly serving: Serving | null;
}

export type CheckoutOutcome = 'waiting' | 'beingServed' | 'sold' | 'balked' | 'abandoned' | 'notInQueue';
