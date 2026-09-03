import type { DailyStatement } from '../economy/types.js';
import type { TripOutcome } from '../loyalty/types.js';

/**
 * Win-condition math (PLAN.md §11.3, §16 phase 2.1). Originally built for
 * `tools/sim-harness/metrics.ts`; relocated here so real campaign play
 * (`CampaignSystem`) and the balance harness share one implementation instead of two
 * that can silently drift apart — see
 * docs/superpowers/specs/2026-09-02-campaign-chapters-design.md §8.
 */

export interface DailyTripCounts {
  readonly player: number;
  readonly target: number;
}

/** Accumulates trip outcomes tick by tick into one player-vs-target count per sim day. */
export class TripCounter {
  #playerCounts: number[] = [];
  #targetCounts: number[] = [];
  #currentDayPlayer = 0;
  #currentDayTarget = 0;

  recordTick(outcomes: readonly TripOutcome[], targetStoreIndex: number): void {
    for (const outcome of outcomes) {
      if (outcome.storeIndex === 0) this.#currentDayPlayer++;
      else if (outcome.storeIndex === targetStoreIndex) this.#currentDayTarget++;
    }
  }

  closeDay(): void {
    this.#playerCounts.push(this.#currentDayPlayer);
    this.#targetCounts.push(this.#currentDayTarget);
    this.#currentDayPlayer = 0;
    this.#currentDayTarget = 0;
  }

  dailyCounts(): readonly DailyTripCounts[] {
    return this.#playerCounts.map((player, i) => ({ player, target: this.#targetCounts[i]! }));
  }
}

/** share(d) = trailing-window player trips / (player + target) trips; NaN if the window saw
 *  no trips to either store at all — an undefined day, not a 0% share. */
export function computeShareTrajectory(
  dailyCounts: readonly DailyTripCounts[],
  trailingWindowDays: number,
): readonly number[] {
  const trajectory: number[] = [];
  for (let day = 0; day < dailyCounts.length; day++) {
    const start = Math.max(0, day - trailingWindowDays + 1);
    let player = 0;
    let target = 0;
    for (let i = start; i <= day; i++) {
      player += dailyCounts[i]!.player;
      target += dailyCounts[i]!.target;
    }
    const total = player + target;
    trajectory.push(total === 0 ? NaN : player / total);
  }
  return trajectory;
}

/**
 * A run wins if its trailing share is at/above `shareThreshold` for a suffix of days ending at
 * the last day. `daysToWin` is the earliest day of that unbroken suffix. If the final day itself
 * doesn't meet the threshold (or the trajectory is empty), it's a loss regardless of any earlier
 * crossing — "held the lead, then lost it back" must not count as a win.
 */
export function computeWinResult(
  shareTrajectory: readonly number[],
  shareThreshold: number,
): { readonly won: boolean; readonly daysToWin: number | null } {
  if (shareTrajectory.length === 0) return { won: false, daysToWin: null };
  const lastDay = shareTrajectory.length - 1;
  if (!(shareTrajectory[lastDay]! >= shareThreshold)) return { won: false, daysToWin: null };

  let start = lastDay;
  for (let day = lastDay - 1; day >= 0; day--) {
    if (!(shareTrajectory[day]! >= shareThreshold)) break;
    start = day;
  }
  return { won: true, daysToWin: start };
}

/**
 * The campaign lose condition (spec §3.2): `N` consecutive trailing days of negative EBITDA.
 * Scans `statements` backward from the most recent entry; a positive-or-zero day anywhere in
 * that trailing scan breaks the streak. No cumulative-cash concept — PLAN.md §5.7 has no balance
 * sheet, and `EconomySystem#statements()` already carries the daily history this needs.
 */
export function ebitdaStreakBreached(
  statements: readonly DailyStatement[],
  maxNegativeDays: number,
): boolean {
  let streak = 0;
  for (let i = statements.length - 1; i >= 0; i--) {
    if (statements[i]!.ebitda < 0) {
      streak++;
      if (streak >= maxNegativeDays) return true;
    } else {
      break;
    }
  }
  return false;
}
