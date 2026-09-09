import type { RivalStore } from '../../market/types.js';
import type { RivalsConfig } from '../config.js';
import type { RivalShare, RivalSignature, RivalState } from '../types.js';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Sav-A-Lott — "one register, ever" (PLAN.md §3). Service degrades as the rival's own
 * share rises (the single register congests when busy) and recovers as share falls,
 * because each week reads from the authored baseline, not the previous derived value —
 * self-limiting, not a one-way ratchet.
 */
export const oneRegister: RivalSignature = {
  id: 'oneRegister',
  weeklyTick(state: RivalState, share: RivalShare, config: RivalsConfig): void {
    state.derived = {
      ...state.derived,
      service: clamp01(
        state.base.service - share.ownShare * config.signatures.oneRegister.serviceCongestion,
      ),
    };
  },
  shapeTerms(base: RivalStore): RivalStore {
    return base;
  },
};
