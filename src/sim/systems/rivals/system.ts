import { TICKS_PER_SIM_DAY } from '../../core/clock.js';
import type { Hasher } from '../../core/hash.js';
import type { System, World } from '../../core/world.js';
import { DEFAULT_MARKET_CONFIG, DEFAULT_RIVAL_STORES } from '../market/config.js';
import type { RivalStore, Segment } from '../market/types.js';
import { DEFAULT_RIVALS_CONFIG } from './config.js';
import type { RivalsConfig } from './config.js';
import { deriveInitialTerms } from './derive.js';
import { reactWeekly } from './reactivity.js';
import { signatureFor } from './signatures/index.js';
import type { RivalDeps, RivalShare, RivalState, RivalsView } from './types.js';

function buildStates(rivals: readonly RivalStore[], config: RivalsConfig): RivalState[] {
  return rivals.map((base) => ({
    base,
    derived: deriveInitialTerms(base, config),
    signature: {},
  }));
}

function resolveEffectiveStore(state: RivalState, segment: Segment, config: RivalsConfig): RivalStore {
  const p = state.base.personality;
  if (!p) return state.derived;
  return signatureFor(p.signature).shapeTerms(state.derived, segment, state, config);
}

function resolveEffectiveDecay(state: RivalState): number {
  return state.derived.loyaltyDecay ?? DEFAULT_MARKET_CONFIG.loyaltyDecayDefault;
}

/**
 * Rivals (PLAN.md §5.8, §16 phase 2.0). Owns the mutable, evolving rival state: each
 * rival's current effective terms, derived at construction from its personality vector
 * and community love, then reshaped weekly by reactivity and its signature hook in
 * response to the previous week's captured share (`RivalDeps#outcomes`) and the
 * player's price level. Registers before `market` (`docs/superpowers/specs/
 * 2026-08-04-rival-dynamics-design.md` §2.1) so market always schedules trips against
 * this week's fresh terms.
 *
 * The weekly tick is a pure function of share and price — no RNG stream is ever drawn
 * here, so it cannot perturb the `rivalNoise` sequence store choice consumes for its
 * Gumbel `ε` term.
 */
export class RivalsSystem implements System, RivalsView {
  readonly name = 'rivals';
  readonly #deps: RivalDeps;
  readonly #config: RivalsConfig;
  readonly #states: readonly RivalState[];
  #tally: number[];

  constructor(
    deps: RivalDeps,
    rivals: readonly RivalStore[] = DEFAULT_RIVAL_STORES,
    config: RivalsConfig = DEFAULT_RIVALS_CONFIG,
  ) {
    this.#deps = deps;
    this.#config = config;
    this.#states = buildStates(rivals, config);
    this.#tally = new Array(this.#states.length + 1).fill(0) as number[];
  }

  update(world: World): void {
    for (const outcome of this.#deps.outcomes()) {
      this.#tally[outcome.storeIndex] = (this.#tally[outcome.storeIndex] ?? 0) + 1;
    }
    const windowTicks = TICKS_PER_SIM_DAY * this.#config.weeklyWindowDays;
    if (world.tick > 0 && world.tick % windowTicks === 0) this.#weeklyTick();
  }

  hash(_world: World, hasher: Hasher): void {
    hasher.u32(this.#states.length);
    for (const state of this.#states) {
      hasher
        .f64(state.derived.quality)
        .f64(state.derived.service)
        .f64(state.derived.ambiance)
        .f64(state.derived.priceIndex)
        .f64(state.derived.assortmentBreadth)
        .f64(resolveEffectiveDecay(state));
      const keys = Object.keys(state.signature).sort();
      hasher.u32(keys.length);
      for (const key of keys) hasher.str(key).f64(state.signature[key] ?? 0);
    }
    hasher.u32Array(this.#tally);
  }

  effectiveStore(rivalIndex: number, segment: Segment): RivalStore {
    return resolveEffectiveStore(this.#state(rivalIndex), segment, this.#config);
  }

  effectiveDecay(rivalIndex: number): number {
    return resolveEffectiveDecay(this.#state(rivalIndex));
  }

  stores(): readonly RivalStore[] {
    return this.#states.map((s) => s.derived);
  }

  count(): number {
    return this.#states.length;
  }

  #state(rivalIndex: number): RivalState {
    const state = this.#states[rivalIndex];
    if (!state) throw new Error(`Unknown rival index: ${rivalIndex}`);
    return state;
  }

  #weeklyTick(): void {
    const total = this.#tally.reduce((sum, v) => sum + v, 0);
    const playerShare = total > 0 ? (this.#tally[0] ?? 0) / total : 0;
    const playerPriceLevel = this.#deps.playerPriceLevel();
    for (let i = 0; i < this.#states.length; i++) {
      const state = this.#states[i]!;
      const ownShare = total > 0 ? (this.#tally[i + 1] ?? 0) / total : 0;
      const share: RivalShare = { playerShare, ownShare };
      state.derived = reactWeekly(state.derived, share, playerPriceLevel, this.#config);
      const p = state.base.personality;
      if (p) signatureFor(p.signature).weeklyTick(state, share, this.#config);
    }
    this.#tally = new Array(this.#states.length + 1).fill(0) as number[];
  }
}

/**
 * A view over rivals that never evolves — `deriveInitialTerms` applied once, no weekly
 * tick. For tests and wiring sites that need `RivalsView` semantics without a live,
 * ticking `RivalsSystem`.
 */
export function staticRivalsView(
  rivals: readonly RivalStore[] = DEFAULT_RIVAL_STORES,
  config: RivalsConfig = DEFAULT_RIVALS_CONFIG,
): RivalsView {
  const states = buildStates(rivals, config);
  const stateAt = (rivalIndex: number): RivalState => {
    const state = states[rivalIndex];
    if (!state) throw new Error(`Unknown rival index: ${rivalIndex}`);
    return state;
  };
  return {
    effectiveStore: (rivalIndex, segment) => resolveEffectiveStore(stateAt(rivalIndex), segment, config),
    effectiveDecay: (rivalIndex) => resolveEffectiveDecay(stateAt(rivalIndex)),
    stores: () => states.map((s) => s.derived),
    count: () => states.length,
  };
}
