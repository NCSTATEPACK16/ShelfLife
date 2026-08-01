import { describe, expect, it } from 'vitest';
import { formatHash, Hasher } from './hash.js';

const h = (): Hasher => new Hasher();

describe('Hasher', () => {
  it('is deterministic for the same input', () => {
    expect(h().u32(1).u32(2).str('x').value).toBe(h().u32(1).u32(2).str('x').value);
  });

  it('is order-sensitive', () => {
    // Two worlds differing only in entity order must hash differently, or reordering
    // becomes an invisible behaviour change.
    expect(h().u32(1).u32(2).value).not.toBe(h().u32(2).u32(1).value);
  });

  it('distinguishes values that a naive hash would collide', () => {
    expect(h().u32(0).value).not.toBe(h().u32(1).value);
    expect(h().bool(true).value).not.toBe(h().bool(false).value);
    expect(h().str('ab').value).not.toBe(h().str('ba').value);
  });

  it('does not confuse a length-prefixed string with its concatenation', () => {
    const separate = h().str('a').str('bc').value;
    const together = h().str('abc').value;
    expect(separate).not.toBe(together);
  });

  it('always returns a u32', () => {
    for (const v of [0, 1, -1, 2 ** 31, 0xffffffff, -0.5, 1e308]) {
      const out = h().f64(v).value;
      expect(Number.isInteger(out)).toBe(true);
      expect(out).toBeGreaterThanOrEqual(0);
      expect(out).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it('hashes floats by exact bit pattern, so near-equal values differ', () => {
    // Hashing a decimal rendering would collide these and would also vary by runtime.
    expect(h().f64(0.1 + 0.2).value).not.toBe(h().f64(0.3).value);
  });

  it('separates +0 from -0, which compare equal but are not the same bits', () => {
    expect(h().f64(0).value).not.toBe(h().f64(-0).value);
  });

  it('normalizes NaN so distinct payloads cannot diverge across platforms', () => {
    expect(h().f64(Number.NaN).value).toBe(h().f64(Number.NaN).value);
  });

  it('handles the infinities', () => {
    expect(h().f64(Infinity).value).not.toBe(h().f64(-Infinity).value);
  });

  it('hashes arrays with their length, so [1,2] and [1,2,0] differ', () => {
    expect(h().u32Array([1, 2]).value).not.toBe(h().u32Array([1, 2, 0]).value);
  });

  it('hashes typed arrays the same as plain ones', () => {
    expect(h().u32Array(new Uint32Array([3, 4, 5])).value).toBe(h().u32Array([3, 4, 5]).value);
  });

  it('handles empty input', () => {
    expect(h().u32Array([]).value).toBeTypeOf('number');
    expect(h().str('').value).toBeTypeOf('number');
  });
});

describe('formatHash', () => {
  it('renders a fixed-width hex string for golden files', () => {
    expect(formatHash(0)).toBe('0x00000000');
    expect(formatHash(0xdeadbeef)).toBe('0xdeadbeef');
    expect(formatHash(-1)).toBe('0xffffffff');
  });
});
