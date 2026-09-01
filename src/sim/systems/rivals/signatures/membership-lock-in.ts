import { DEFAULT_MARKET_CONFIG } from '../../market/config.js';
import type { RivalStore, Segment } from '../../market/types.js';
import type { RivalsConfig } from '../config.js';
import type { RivalShare, RivalSignature, RivalState } from '../types.js';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const BULK_SEGMENTS = new Set<Segment>(['bulk', 'family']);

/**
 * BulkHaus Club — "membership lock-in + sample corridor" (PLAN.md §3). Lock-in is a
 * lowered effective `loyaltyDecay` (slow to lose a member — a mild cousin of Trailblazer's
 * δ/5); the sample corridor is an assortment bump for the segments that actually browse
 * bulk aisles. Honest stub: store-wide, not per-household membership — see the rivals
 * system's "explicitly deferred" note.
 */
export const membershipLockIn: RivalSignature = {
  id: 'membershipLockIn',
  weeklyTick(state: RivalState, _share: RivalShare, config: RivalsConfig): void {
    const authoredDecay = state.base.loyaltyDecay ?? DEFAULT_MARKET_CONFIG.loyaltyDecayDefault;
    state.derived = {
      ...state.derived,
      loyaltyDecay: authoredDecay * config.signatures.membershipLockIn.decayMultiplier,
    };
  },
  shapeTerms(base: RivalStore, segment: Segment, _state, config: RivalsConfig): RivalStore {
    if (!BULK_SEGMENTS.has(segment)) return base;
    return {
      ...base,
      assortmentBreadth: clamp01(
        base.assortmentBreadth + config.signatures.membershipLockIn.assortmentBump,
      ),
    };
  },
};
