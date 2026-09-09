import type { RivalStore, Segment } from '../../market/types.js';
import type { RivalsConfig } from '../config.js';
import type { RivalSignature } from '../types.js';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const NIGHT_SEGMENTS = new Set<Segment>(['convenience', 'student']);

/**
 * Grocerteria 24 — "never closes; owns 10pm-6am" (PLAN.md §3). No intra-day clock exists
 * yet, so the honest reduced-fidelity stand-in is a per-segment term bump for the
 * households that value round-the-clock access; every other segment sees the baseline
 * terms unchanged. True off-hours pull arrives with intra-day scheduling (deferred).
 */
export const neverCloses: RivalSignature = {
  id: 'neverCloses',
  weeklyTick(): void {
    // Nothing evolves week to week — the whole mechanic lives in shapeTerms.
  },
  shapeTerms(base: RivalStore, segment: Segment, _state, config: RivalsConfig): RivalStore {
    if (!NIGHT_SEGMENTS.has(segment)) return base;
    const bump = config.signatures.neverCloses.segmentBump;
    return {
      ...base,
      service: clamp01(base.service + bump),
      ambiance: clamp01(base.ambiance + bump),
    };
  },
};
