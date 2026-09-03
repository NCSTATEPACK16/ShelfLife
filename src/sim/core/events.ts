/**
 * The simulation event bus.
 *
 * Systems emit events; the bridge forwards them to the renderer and UI so the world can
 * be *shown* without anything outside the sim reading its internals.
 *
 * Two rules that keep determinism intact:
 *   1. Events are **output only**. A system must never change its behaviour based on an
 *      event it received, or execution order becomes load-bearing and the world hash
 *      starts depending on subscriber registration order.
 *   2. Events are drained per tick and never buffered across ticks, so a slow consumer
 *      cannot bend the simulation.
 *
 * This is deliberately not `mitt`: mitt dispatches synchronously to subscribers, which
 * invites rule 1 being broken. Collecting into a per-tick list makes the output-only
 * nature structural rather than a convention.
 */

import type { TellTerm } from '../content/gentle-surface.js';

export type SimEvent =
  | { readonly type: 'tick'; readonly tick: number }
  | { readonly type: 'dayStarted'; readonly day: number }
  | { readonly type: 'speedChanged'; readonly multiplier: number }
  | { readonly type: 'paused' }
  | { readonly type: 'resumed' }
  | {
      readonly type: 'saleCompleted';
      readonly shopperId: number;
      readonly householdId: number;
      readonly total: number;
      readonly items: readonly string[];
    }
  | {
      readonly type: 'shopperTripCompleted';
      readonly shopperId: number;
      readonly householdId: number;
      readonly satisfaction: number;
      readonly fillRate: number;
      readonly impulseHits: number;
      readonly balked: boolean;
      readonly abandoned: boolean;
    }
  | {
      readonly type: 'cartAbandoned';
      readonly shopperId: number;
      readonly householdId: number;
      readonly items: readonly string[];
    }
  | {
      readonly type: 'wordOfMouth';
      readonly sourceHouseholdId: number;
      /** 0 = the player's store; 1..n = rivals in roster order. */
      readonly storeIndex: number;
      /** +1 for a delighted trip, -1 for a disgusted one. */
      readonly polarity: 1 | -1;
      readonly affectedHouseholdIds: readonly number[];
    }
  | {
      readonly type: 'rivalTripCompleted';
      readonly householdId: number;
      readonly storeId: string;
      /** 1..n — rivals in roster order; never 0, that is `shopperTripCompleted`'s job. */
      readonly storeIndex: number;
      readonly satisfaction: number;
    }
  | {
      readonly type: 'chapterStarted';
      readonly levelId: string;
      readonly chapterIndex: number;
    }
  | {
      readonly type: 'chapterComplete';
      readonly levelId: string;
      readonly chapterIndex: number;
    }
  | { readonly type: 'levelWon'; readonly levelId: string }
  | { readonly type: 'levelLost'; readonly levelId: string }
  | {
      readonly type: 'tellFired';
      readonly shopperId: number;
      readonly term: TellTerm;
      readonly magnitude: number;
      readonly worldRef?: { readonly instanceId: number };
    };

export type SimEventType = SimEvent['type'];

export class EventBus {
  #current: SimEvent[] = [];

  emit(event: SimEvent): void {
    this.#current.push(event);
  }

  /** Everything emitted since the last drain, in emission order. */
  drain(): readonly SimEvent[] {
    if (this.#current.length === 0) return EMPTY;
    const batch = this.#current;
    this.#current = [];
    return batch;
  }

  get pendingCount(): number {
    return this.#current.length;
  }
}

const EMPTY: readonly SimEvent[] = Object.freeze([]);
