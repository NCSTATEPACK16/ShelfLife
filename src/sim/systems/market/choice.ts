import type { UtilityWeights } from './types.js';

/**
 * Store choice (PLAN.md §5.1) — the pure model. No world, no RNG, no state.
 *
 * ## Why there is no Gumbel ε term here
 *
 * §5.1 writes both `+ ε` (seeded Gumbel noise) and `P = exp(U/τ) / Σ exp(U/τ)`. Those
 * are the same thing written twice: the softmax IS the closed form of "add i.i.d.
 * Gumbel noise to each utility and take the argmax". Implementing both would apply the
 * noise twice and quietly widen the distribution past what τ claims.
 *
 * So `storeUtility` deliberately omits ε, and randomness enters exactly once, where
 * `chooseStore` consumes a single uniform draw. Do not "restore" the missing epsilon.
 *
 * Computing the probabilities explicitly (rather than using the Gumbel-max trick, which
 * would choose without ever materialising them) is also what lets §12.4's
 * share-of-wallet KPIs and the rival-intel panel show real numbers.
 */

/** One store's inputs to `U(h,s)`, already normalised to the units the weights expect. */
export interface StoreTerms {
  readonly storeId: string;
  readonly priceFit: number;
  readonly assortmentFit: number;
  readonly quality: number;
  readonly service: number;
  readonly ambiance: number;
  readonly loyalty: number;
  readonly brandAffinity: number;
  readonly travelCost: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Maps a cost index (1.0 = at reference) onto a [0,1] fit.
 *
 * `clamp01(neutral + (1 - index))`, not `clamp01(2 - index)`: the latter saturates at 1
 * for every price at or below reference, which would make a loss leader look identical
 * to a modest discount — precisely the signal store choice exists to carry.
 */
export function indexToFit(index: number, neutral: number): number {
  return clamp01(neutral + (1 - index));
}

export function storeUtility(terms: StoreTerms, weights: UtilityWeights): number {
  return (
    weights.priceFit * terms.priceFit +
    weights.assortmentFit * terms.assortmentFit +
    weights.quality * terms.quality +
    weights.service * terms.service +
    weights.ambiance * terms.ambiance +
    weights.loyalty * terms.loyalty +
    weights.brandAffinity * terms.brandAffinity -
    weights.travelCost * terms.travelCost
  );
}

/**
 * `P(h → s) = exp(U/τ) / Σ exp(U/τ)`.
 *
 * The max-subtraction is required, not defensive: a decisive segment might tune τ to
 * 0.05, which scales utilities into the hundreds, and `exp(800)` is `Infinity`.
 * Subtracting the max leaves the ratios identical and the largest exponent at exactly 0.
 */
export function softmax(utilities: readonly number[], temperature: number): number[] {
  if (utilities.length === 0) return [];
  const scaled = utilities.map((u) => u / temperature);
  const max = Math.max(...scaled);
  const exponentials = scaled.map((s) => Math.exp(s - max));
  const total = exponentials.reduce((a, b) => a + b, 0);
  return exponentials.map((e) => e / total);
}

/**
 * Picks an index by walking the cumulative distribution with one uniform draw in [0,1).
 *
 * Falls through to the last index rather than returning -1: floating-point summation can
 * leave the cumulative total a hair under 1, and a draw in that sliver must still be a
 * valid store.
 */
export function chooseStore(probabilities: readonly number[], draw: number): number {
  let cumulative = 0;
  for (let i = 0; i < probabilities.length; i++) {
    cumulative += probabilities[i] ?? 0;
    if (draw < cumulative) return i;
  }
  return probabilities.length - 1;
}
