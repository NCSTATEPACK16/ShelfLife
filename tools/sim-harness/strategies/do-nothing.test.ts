import { describe, expect, it } from 'vitest';
import { doNothingStrategy } from './do-nothing.js';

describe('doNothingStrategy', () => {
  it('never emits a command', () => {
    // @ts-expect-error — do-nothing never reads ctx, so an empty object is fine here.
    expect(doNothingStrategy.decide({})).toEqual([]);
  });
});
