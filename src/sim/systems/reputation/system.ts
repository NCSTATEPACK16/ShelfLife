import type { Hasher } from '../../core/hash.js';
import type { System, World } from '../../core/world.js';
import type { LoyaltySystem } from '../loyalty/system.js';
import { travelCost } from '../market/catchment.js';
import { DEFAULT_CATCHMENT_CONFIG, DEFAULT_MARKET_CONFIG } from '../market/config.js';
import type { CatchmentConfig, MarketConfig } from '../market/config.js';
import type { NeighborReader } from './types.js';

/**
 * Word of mouth (PLAN.md §5.3).
 *
 * A trip with satisfaction above `delightThreshold` or below `disgustThreshold` nudges
 * the source household's k nearest catchment neighbours toward or away from that store.
 *
 * **One hop, never recursive.** §5.3 says "affecting k neighbor households", which is
 * one hop; recursive diffusion over a k-NN graph is an unbounded cascade with a tuning
 * surface nobody has asked for. A nudged neighbour does not re-emit.
 *
 * ω is an order of magnitude below α (enforced in the config schema): hearsay must not
 * outweigh having actually shopped somewhere.
 */
export class ReputationSystem implements System {
  readonly name = 'reputation';
  readonly #market: NeighborReader;
  readonly #loyalty: LoyaltySystem;
  readonly #catchment: CatchmentConfig;
  readonly #config: MarketConfig;
  #neighbors = new Map<number, readonly number[]>();
  #knownHouseholds = 0;

  constructor(
    market: NeighborReader,
    loyalty: LoyaltySystem,
    catchment: CatchmentConfig = DEFAULT_CATCHMENT_CONFIG,
    config: MarketConfig = DEFAULT_MARKET_CONFIG,
  ) {
    this.#market = market;
    this.#loyalty = loyalty;
    this.#catchment = catchment;
    this.#config = config;
  }

  update(world: World): void {
    this.#rebuildIfNeeded();
    // Sorted by source household id so the result never depends on the order
    // MarketSystem and ShoppersSystem happened to append outcomes to the buffer.
    const outcomes = [...this.#market.pendingOutcomes()].sort((a, b) => a.householdId - b.householdId);
    for (const outcome of outcomes) {
      const polarity =
        outcome.satisfaction > this.#config.delightThreshold
          ? 1
          : outcome.satisfaction < this.#config.disgustThreshold
            ? -1
            : 0;
      if (polarity === 0) continue;
      const affected = this.neighborsOf(outcome.householdId);
      for (const neighborId of affected) {
        this.#loyalty.nudge(neighborId, outcome.storeIndex, polarity * this.#config.womDelta);
      }
      world.events.emit({
        type: 'wordOfMouth',
        sourceHouseholdId: outcome.householdId,
        storeIndex: outcome.storeIndex,
        polarity,
        affectedHouseholdIds: affected,
      });
    }
  }

  hash(_world: World, hasher: Hasher): void {
    const ids = [...this.#neighbors.keys()].sort((a, b) => a - b);
    hasher.u32(ids.length);
    for (const id of ids) {
      hasher.u32(id);
      const neighbors = this.#neighbors.get(id)!;
      hasher.u32(neighbors.length);
      for (const neighborId of neighbors) hasher.u32(neighborId);
    }
  }

  neighborsOf(householdId: number): readonly number[] {
    this.#rebuildIfNeeded();
    return this.#neighbors.get(householdId) ?? [];
  }

  /** Households never move, so this only runs when the household set grows. */
  #rebuildIfNeeded(): void {
    const ids = this.#market.householdIds();
    if (ids.length === this.#knownHouseholds) return;
    this.#knownHouseholds = ids.length;
    const neighbors = new Map<number, readonly number[]>();
    for (const id of ids) {
      const origin = this.#market.householdPosition(id);
      const ranked = ids
        .filter((other) => other !== id)
        .map((other) => ({
          id: other,
          cost: travelCost(origin, this.#market.householdPosition(other), this.#catchment),
        }))
        // Ties broken by ascending id, never by scan order — this reaches the hash.
        .sort((a, b) => (a.cost === b.cost ? a.id - b.id : a.cost - b.cost))
        .slice(0, this.#config.womNeighbors)
        .map((entry) => entry.id);
      neighbors.set(id, ranked);
    }
    this.#neighbors = neighbors;
  }
}
