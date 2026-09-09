import { describe, expect, it } from 'vitest';
import { deriveSeed, fnv1a, Stream, StreamSet, STREAM_NAMES } from './rng.js';

describe('fnv1a', () => {
  it('matches the published FNV-1a 32-bit test vectors', () => {
    // If this ever changes, every derived stream seed shifts and every golden test
    // and recorded balance run becomes invalid. That is why it is pinned to the spec.
    expect(fnv1a('')).toBe(0x811c9dc5);
    expect(fnv1a('a')).toBe(0xe40c292c);
    expect(fnv1a('foobar')).toBe(0xbf9cf968);
  });

  it('stays within u32', () => {
    for (const name of STREAM_NAMES) {
      const h = fnv1a(name);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
    }
  });
});

describe('Stream', () => {
  it('is reproducible from a seed', () => {
    const a = new Stream(12345);
    const b = new Stream(12345);
    const draw = (s: Stream): number[] => Array.from({ length: 50 }, () => s.nextUint32());
    expect(draw(a)).toEqual(draw(b));
  });

  it('produces different sequences for different seeds', () => {
    const a = Array.from({ length: 20 }, (_, i) => new Stream(1).nextUint32() + i * 0);
    const b = Array.from({ length: 20 }, () => new Stream(2).nextUint32());
    expect(a[0]).not.toBe(b[0]);
  });

  it('counts draws, so the world hash notices unexpected consumption', () => {
    const s = new Stream(7);
    expect(s.draws).toBe(0);
    s.nextUint32();
    s.nextFloat();
    s.nextInt(0, 10);
    expect(s.draws).toBe(3);
  });

  it('keeps nextFloat inside [0, 1)', () => {
    const s = new Stream(99);
    for (let i = 0; i < 5000; i++) {
      const v = s.nextFloat();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('keeps nextInt inside its inclusive bounds and covers them', () => {
    const s = new Stream(4);
    const seen = new Set<number>();
    for (let i = 0; i < 3000; i++) {
      const v = s.nextInt(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6, 7]);
  });

  it('handles a single-value range', () => {
    const s = new Stream(4);
    expect(s.nextInt(5, 5)).toBe(5);
  });

  it('rejects an inverted range rather than returning nonsense', () => {
    expect(() => new Stream(1).nextInt(10, 3)).toThrow(RangeError);
  });

  it('picks from an array and rejects an empty one', () => {
    const s = new Stream(11);
    expect(['a', 'b', 'c']).toContain(s.pick(['a', 'b', 'c']));
    expect(() => s.pick([])).toThrow(RangeError);
  });

  it('produces finite Gumbel noise, including at the tail', () => {
    const s = new Stream(31337);
    for (let i = 0; i < 20000; i++) {
      expect(Number.isFinite(s.nextGumbel())).toBe(true);
    }
  });

  it('gives chance() roughly the requested rate', () => {
    const s = new Stream(2024);
    let hits = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) if (s.chance(0.25)) hits++;
    expect(hits / n).toBeGreaterThan(0.23);
    expect(hits / n).toBeLessThan(0.27);
  });
});

describe('StreamSet — independence is the whole point', () => {
  it('derives a distinct seed per stream', () => {
    const seeds = STREAM_NAMES.map((n) => deriveSeed(4242, n));
    expect(new Set(seeds).size).toBe(STREAM_NAMES.length);
  });

  it('gives each stream its own sequence from the same world seed', () => {
    const set = new StreamSet(1000);
    const spawn = set.get('spawn').nextUint32();
    const impulse = set.get('impulse').nextUint32();
    expect(spawn).not.toBe(impulse);
  });

  it('does NOT let one stream perturb another — the core determinism guarantee', () => {
    // Draw heavily from `spawn` in one world and not at all in the other. `impulse`
    // must be unaffected. A single shared generator would fail this, and every
    // balance number recorded before a new system was added would silently change.
    const busy = new StreamSet(555);
    for (let i = 0; i < 1000; i++) busy.get('spawn').nextUint32();
    const quiet = new StreamSet(555);

    expect(busy.get('impulse').nextUint32()).toBe(quiet.get('impulse').nextUint32());
  });

  it('reproduces the whole set from the same world seed', () => {
    const a = new StreamSet(31337);
    const b = new StreamSet(31337);
    for (const name of STREAM_NAMES) {
      expect(a.get(name).nextUint32()).toBe(b.get(name).nextUint32());
    }
  });

  it('totals draws across streams', () => {
    const set = new StreamSet(1);
    set.get('spawn').nextUint32();
    set.get('impulse').nextFloat();
    set.get('events').nextInt(0, 1);
    expect(set.totalDraws()).toBe(3);
  });

  it('rejects an unknown stream name at runtime, not silently', () => {
    // @ts-expect-error deliberately invalid stream name
    expect(() => new StreamSet(1).get('nope')).toThrow(/Unknown RNG stream/);
  });

  it('normalizes the seed to u32 so negative seeds are still stable', () => {
    expect(new StreamSet(-1).seed).toBe(0xffffffff);
  });
});

describe('harness stream', () => {
  it('is a distinct stream that does not perturb the others', () => {
    const before = new StreamSet(12345);
    const spawnBefore = before.get('spawn').nextUint32();

    const after = new StreamSet(12345);
    after.get('harness').nextUint32(); // draw from the new stream first
    const spawnAfter = after.get('spawn').nextUint32();

    expect(spawnAfter).toBe(spawnBefore);
  });
});

describe('campaign stream', () => {
  it('is a distinct stream that does not perturb the others', () => {
    const before = new StreamSet(12345);
    const spawnBefore = before.get('spawn').nextUint32();

    const after = new StreamSet(12345);
    after.get('campaign').nextUint32(); // draw from the new stream first
    const spawnAfter = after.get('spawn').nextUint32();

    expect(spawnAfter).toBe(spawnBefore);
  });
});
