import { describe, expect, it } from 'vitest';
import { computeShareTrajectory, computeWinResult, TripCounter } from './metrics.js';

describe('TripCounter', () => {
  it('tallies player vs. target trips per day and ignores other rivals', () => {
    const counter = new TripCounter();
    const targetStoreIndex = 2;
    counter.recordTick([{ householdId: 1, storeIndex: 0, satisfaction: 1 }], targetStoreIndex);
    counter.recordTick([{ householdId: 2, storeIndex: 2, satisfaction: 1 }], targetStoreIndex);
    counter.recordTick([{ householdId: 3, storeIndex: 1, satisfaction: 1 }], targetStoreIndex); // a different rival
    counter.closeDay();
    counter.recordTick([{ householdId: 1, storeIndex: 0, satisfaction: 1 }], targetStoreIndex);
    counter.closeDay();

    expect(counter.dailyCounts()).toEqual([
      { player: 1, target: 1 },
      { player: 1, target: 0 },
    ]);
  });
});

describe('computeShareTrajectory', () => {
  it('computes a trailing-window share, NaN when the window has zero trips', () => {
    const trajectory = computeShareTrajectory(
      [
        { player: 0, target: 0 },
        { player: 3, target: 1 },
        { player: 1, target: 3 },
      ],
      2,
    );
    expect(trajectory[0]).toBeNaN();
    expect(trajectory[1]).toBeCloseTo(3 / 4);
    // trailing window of 2 covers days 1-2: player 3+1=4, target 1+3=4
    expect(trajectory[2]).toBeCloseTo(4 / 8);
  });
});

describe('computeWinResult', () => {
  it('wins at the start of the final unbroken suffix at/above threshold', () => {
    expect(computeWinResult([0.3, 0.3, 0.6, 0.7, 0.8], 0.5)).toEqual({ won: true, daysToWin: 2 });
  });
  it('loses if the trajectory crosses the threshold but ends below it', () => {
    expect(computeWinResult([0.6, 0.7, 0.3], 0.5)).toEqual({ won: false, daysToWin: null });
  });
  it('loses if it never reaches the threshold', () => {
    expect(computeWinResult([0.1, 0.2, 0.3], 0.5)).toEqual({ won: false, daysToWin: null });
  });
  it('treats exactly-at-threshold as a win', () => {
    expect(computeWinResult([0.5, 0.5], 0.5)).toEqual({ won: true, daysToWin: 0 });
  });
  it('treats an undefined (NaN) day as breaking the suffix', () => {
    expect(computeWinResult([NaN, 0.6, 0.7], 0.5)).toEqual({ won: true, daysToWin: 1 });
  });
  it('loses on an empty trajectory', () => {
    expect(computeWinResult([], 0.5)).toEqual({ won: false, daysToWin: null });
  });
});
