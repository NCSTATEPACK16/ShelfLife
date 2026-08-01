/**
 * Entitlements (PLAN.md §7.4).
 *
 * Monetization is deliberately undecided (PLAN.md §20). This module is the seam that
 * keeps every option free: premium iOS with a free web demo, free with content packs, or
 * free forever.
 *
 * Every level and chapter transition calls `canPlay`. It returns `true` today — that is
 * not a reason to skip the call. Thirty lines now versus touching every transition site
 * later.
 */

export interface ContentRef {
  readonly levelId: string;
  /** Zero-based. Chapters are the natural gate boundary (PLAN.md §12.3). */
  readonly chapterIndex: number;
}

export type EntitlementReason = 'granted' | 'requires-purchase' | 'not-yet-unlocked';

export interface EntitlementResult {
  readonly allowed: boolean;
  readonly reason: EntitlementReason;
}

const GRANTED: EntitlementResult = { allowed: true, reason: 'granted' };

/**
 * The single question the rest of the codebase asks. In v1 everything is unlocked; a
 * future implementation reads StoreKit or Supabase here and nothing else changes.
 */
export function checkEntitlement(_ref: ContentRef): EntitlementResult {
  return GRANTED;
}

/** Convenience wrapper for the common boolean case. */
export function canPlay(levelId: string, chapterIndex: number): boolean {
  return checkEntitlement({ levelId, chapterIndex }).allowed;
}
