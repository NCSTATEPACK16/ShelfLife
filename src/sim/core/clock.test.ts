import { describe, expect, it } from 'vitest';
import { Clock, TICK_MS, TICKS_PER_SIM_DAY, TICKS_PER_SIM_HOUR, timeFromTick } from './clock.js';

describe('timeFromTick', () => {
  it('starts at day 0, midnight', () => {
    expect(timeFromTick(0)).toEqual({ tick: 0, day: 0, hour: 0, minute: 0 });
  });

  it('rolls hours and days', () => {
    expect(timeFromTick(TICKS_PER_SIM_HOUR)).toMatchObject({ day: 0, hour: 1 });
    expect(timeFromTick(TICKS_PER_SIM_DAY)).toMatchObject({ day: 1, hour: 0 });
    expect(timeFromTick(TICKS_PER_SIM_DAY * 3 + TICKS_PER_SIM_HOUR * 9)).toMatchObject({
      day: 3,
      hour: 9,
    });
  });

  it('derives minutes within the hour', () => {
    expect(timeFromTick(TICKS_PER_SIM_HOUR / 2).minute).toBe(30);
    expect(timeFromTick(TICKS_PER_SIM_HOUR - 1).minute).toBe(59);
  });
});

describe('Clock', () => {
  it('advances exactly one tick per step', () => {
    const c = new Clock();
    expect(c.tick).toBe(0);
    expect(c.step()).toBe(1);
    expect(c.step()).toBe(2);
    expect(c.tick).toBe(2);
  });

  it('converts elapsed real time into whole steps', () => {
    const c = new Clock();
    expect(c.pump(TICK_MS)).toBe(1);
    expect(c.pump(TICK_MS * 3)).toBe(3);
  });

  it('accumulates leftover time instead of dropping it', () => {
    const c = new Clock();
    // Three 40ms frames = 120ms = one whole tick, with 20ms carried.
    expect(c.pump(40)).toBe(0);
    expect(c.pump(40)).toBe(0);
    expect(c.pump(40)).toBe(1);
  });

  it('applies the speed multiplier', () => {
    expect(new Clock().pump(TICK_MS, 4)).toBe(4);
    expect(new Clock().pump(TICK_MS, 0)).toBe(0);
  });

  it('caps catch-up so a backgrounded phone cannot demand thousands of ticks', () => {
    // An hour asleep would be 36,000 ticks. A spiral of death is worse than a
    // small discontinuity, so the excess is dropped.
    const c = new Clock();
    expect(c.pump(60 * 60 * 1000)).toBe(10);
  });

  it('discards the accumulator when it caps, rather than staying permanently behind', () => {
    const c = new Clock();
    c.pump(60 * 60 * 1000);
    expect(c.pump(TICK_MS)).toBe(1);
  });

  it('ignores non-positive elapsed time', () => {
    const c = new Clock();
    expect(c.pump(0)).toBe(0);
    expect(c.pump(-100)).toBe(0);
  });

  it('restores to a saved tick', () => {
    const c = new Clock();
    c.restore(5000);
    expect(c.tick).toBe(5000);
    expect(c.time.day).toBe(Math.floor(5000 / TICKS_PER_SIM_DAY));
  });

  it('rejects an invalid restore rather than corrupting the timeline', () => {
    expect(() => new Clock().restore(-1)).toThrow(RangeError);
    expect(() => new Clock().restore(1.5)).toThrow(RangeError);
  });
});
