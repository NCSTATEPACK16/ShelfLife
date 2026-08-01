/**
 * PLAN.md §5.5's exact closed-form freshness curve: f(t) = exp(-t/τ_sku). Computed
 * directly from age rather than by any stepwise decay, so there is no discretization
 * error for a balance harness to reconcile against the formula — the formula *is* the
 * implementation.
 */
export function freshnessAt(deliveredAtTick: number, now: number, tauTicks: number): number {
  const age = Math.max(0, now - deliveredAtTick);
  return Math.exp(-age / tauTicks);
}
