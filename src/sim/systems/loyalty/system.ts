import { TICKS_PER_SIM_DAY } from '../../core/clock.js';
import type { Hasher } from '../../core/hash.js';
import type { System, World } from '../../core/world.js';
import { DEFAULT_MARKET_CONFIG } from '../market/config.js';
import type { MarketConfig } from '../market/config.js';
import type { RivalStore } from '../market/types.js';
import type { MarketReader, TripOutcome } from './types.js';

/**
 * Loyalty (PLAN.md §5.2).
 *
 * `L'(h,s) = clamp01( L + α·(satisfaction − S̄(h)) − δ·decay(daysSinceVisit) )`
 *
 * The subtraction is the mechanic: loyalty tracks satisfaction *relative to what this
 * household has come to expect*. A consistently mediocre store keeps its regulars; a
 * good store that slips loses them.
 *
 * Sole writer of its arrays. `MarketSystem` (trip outcomes) and `ReputationSystem`
 * (diffusion) call in rather than mutating — one place to reason about clamping, and
 * one place for a boss to cheat on δ next phase.
 */
export class LoyaltySystem implements System {
  readonly name = 'loyalty';
  readonly storeCount: number;
  readonly #market: MarketReader;
  readonly #config: MarketConfig;
  /** Per-store δ, indexed like the store axis. Index 0 (player) always takes the default. */
  readonly #decay: readonly number[];
  #loyalty = new Float32Array(0);
  #meanSatisfaction = new Float32Array(0);
  #daysSinceVisit = new Uint16Array(0);
  #index = new Map<number, number>();

  constructor(market: MarketReader, rivals: readonly RivalStore[], config: MarketConfig = DEFAULT_MARKET_CONFIG) {
    this.#market = market;
    this.#config = config;
    this.storeCount = rivals.length + 1;
    this.#decay = [config.loyaltyDecayDefault, ...rivals.map((r) => r.loyaltyDecay ?? config.loyaltyDecayDefault)];
  }

  update(world: World): void {
    this.#sync();
    for (const outcome of this.#market.pendingOutcomes()) this.recordTrip(outcome);
    if (world.tick % TICKS_PER_SIM_DAY === 0) this.#decayDay();
  }

  hash(_world: World, hasher: Hasher): void {
    hasher.u32(this.#loyalty.length);
    for (const value of this.#loyalty) hasher.f64(value);
    for (const value of this.#meanSatisfaction) hasher.f64(value);
    for (const value of this.#daysSinceVisit) hasher.u32(value);
  }

  get(householdId: number, storeIndex: number): number {
    // The slot must be resolved into a local first: `#slot` can grow the arrays via
    // `#sync`, and `this.#loyalty[this.#slot(...)]` would capture the pre-growth array
    // reference before the index expression ran — reading a stale, empty buffer.
    const slot = this.#slot(householdId, storeIndex);
    return this.#loyalty[slot] ?? 0;
  }

  meanSatisfaction(householdId: number): number {
    this.#sync();
    return this.#meanSatisfaction[this.#row(householdId)] ?? this.#config.initialMeanSatisfaction;
  }

  daysSinceVisit(householdId: number, storeIndex: number): number {
    const slot = this.#slot(householdId, storeIndex); // see `get` — sync before indexing
    return this.#daysSinceVisit[slot] ?? 0;
  }

  recordTrip(outcome: TripOutcome): void {
    this.#sync();
    const row = this.#row(outcome.householdId);
    const slot = row * this.storeCount + outcome.storeIndex;
    const expectation = this.#meanSatisfaction[row] ?? this.#config.initialMeanSatisfaction;
    const surprise = outcome.satisfaction - expectation;
    this.#loyalty[slot] = clamp01((this.#loyalty[slot] ?? 0) + this.#config.loyaltyAlpha * surprise);
    this.#meanSatisfaction[row] = expectation + this.#config.meanSatisfactionLambda * surprise;
    this.#daysSinceVisit[slot] = 0;
  }

  nudge(householdId: number, storeIndex: number, delta: number): void {
    const slot = this.#slot(householdId, storeIndex);
    this.#loyalty[slot] = clamp01((this.#loyalty[slot] ?? 0) + delta);
  }

  #decayDay(): void {
    for (let row = 0; row < this.#index.size; row++) {
      for (let store = 0; store < this.storeCount; store++) {
        const slot = row * this.storeCount + store;
        const days = Math.min((this.#daysSinceVisit[slot] ?? 0) + 1, 0xffff);
        this.#daysSinceVisit[slot] = days;
        const fraction = Math.min(days, this.#config.decayCapDays) / this.#config.decayCapDays;
        this.#loyalty[slot] = clamp01((this.#loyalty[slot] ?? 0) - (this.#decay[store] ?? 0) * fraction);
      }
    }
  }

  /** Grows the arrays to cover every household the market knows about. Ascending ids. */
  #sync(): void {
    const ids = this.#market.householdIds();
    if (ids.length === this.#index.size) return;
    const loyalty = new Float32Array(ids.length * this.storeCount).fill(this.#config.initialLoyalty);
    const mean = new Float32Array(ids.length).fill(this.#config.initialMeanSatisfaction);
    const days = new Uint16Array(ids.length * this.storeCount);
    const index = new Map<number, number>();
    ids.forEach((id, row) => {
      index.set(id, row);
      const old = this.#index.get(id);
      if (old === undefined) return;
      mean[row] = this.#meanSatisfaction[old] ?? this.#config.initialMeanSatisfaction;
      for (let store = 0; store < this.storeCount; store++) {
        loyalty[row * this.storeCount + store] = this.#loyalty[old * this.storeCount + store] ?? 0;
        days[row * this.storeCount + store] = this.#daysSinceVisit[old * this.storeCount + store] ?? 0;
      }
    });
    this.#loyalty = loyalty;
    this.#meanSatisfaction = mean;
    this.#daysSinceVisit = days;
    this.#index = index;
  }

  #row(householdId: number): number {
    this.#sync();
    const row = this.#index.get(householdId);
    if (row === undefined) throw new Error(`Unknown household id: ${householdId}`);
    return row;
  }

  #slot(householdId: number, storeIndex: number): number {
    if (storeIndex < 0 || storeIndex >= this.storeCount) {
      throw new Error(`Unknown store index: ${storeIndex}`);
    }
    return this.#row(householdId) * this.storeCount + storeIndex;
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
