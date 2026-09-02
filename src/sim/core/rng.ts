// pure-rand 8.x is subpath-only: it publishes no root "." export, so these must be
// deep imports. It also changed `next()` to mutate in place and return a number,
// rather than returning a [value, nextGenerator] pair as in 6.x/7.x.
import { xoroshiro128plus } from 'pure-rand/generator/xoroshiro128plus';
import type { JumpableRandomGenerator } from 'pure-rand/types/JumpableRandomGenerator';

/**
 * Seeded RNG streams (PLAN.md §6.3).
 *
 * One stream per subsystem, derived from the world seed. The critical property is
 * **stream independence**: adding a new system, or changing how often an existing one
 * draws, must never reshuffle another system's numbers. Without that, every balance
 * result recorded before the change silently becomes a lie.
 *
 * A single shared generator would violate this — system B's output would depend on how
 * many times system A happened to draw first. So each stream is seeded independently
 * from (worldSeed, streamName) and advances on its own.
 */

/** Every stream in the simulation. Adding one here never perturbs the others. */
export const STREAM_NAMES = [
  'spawn',
  'impulse',
  'spoilage',
  'events',
  'rivalNoise',
  'shrinkage',
  'checkout',
  'staff',
  'harness',
] as const;

export type StreamName = (typeof STREAM_NAMES)[number];

/**
 * FNV-1a, 32-bit. Used to fold a stream name into its seed.
 *
 * Chosen because it is tiny, dependency-free, and — most importantly — stable forever.
 * A hash whose output could change between library versions would silently invalidate
 * every golden test and every recorded balance run.
 */
export function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    // hash *= 16777619, in 32-bit arithmetic without overflowing the float mantissa.
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Derives a stream's seed from the world seed and its name. */
export function deriveSeed(worldSeed: number, stream: StreamName): number {
  // XOR-folding the name hash keeps streams far apart in seed space while staying
  // trivially reproducible in any language — the edge-function verifier needs the
  // same numbers as the phone (PLAN.md §8.3).
  return (worldSeed ^ fnv1a(stream)) >>> 0;
}

/**
 * One deterministic stream. Wraps pure-rand's xoroshiro128+ with the small set of
 * draws the simulation actually needs.
 */
export class Stream {
  readonly #gen: JumpableRandomGenerator;
  #draws = 0;

  constructor(seed: number) {
    this.#gen = xoroshiro128plus(seed);
  }

  /** How many values this stream has produced. Part of the world hash. */
  get draws(): number {
    return this.#draws;
  }

  /** Uniform 32-bit unsigned integer. */
  nextUint32(): number {
    // next() yields a signed int32; >>> 0 reinterprets the same bits as unsigned.
    const value = this.#gen.next() >>> 0;
    this.#draws++;
    return value;
  }

  /** Uniform float in [0, 1). */
  nextFloat(): number {
    // 2^-32. Dividing the full 32-bit range keeps this exactly reproducible;
    // never reach for Math.random-style tricks here.
    return this.nextUint32() * 2.3283064365386963e-10;
  }

  /** Uniform integer in [min, max], inclusive. */
  nextInt(min: number, max: number): number {
    if (max < min) throw new RangeError(`nextInt: max (${max}) < min (${min})`);
    const span = max - min + 1;
    return min + Math.floor(this.nextFloat() * span);
  }

  /** True with the given probability. */
  chance(probability: number): boolean {
    return this.nextFloat() < probability;
  }

  /** Uniform choice from a non-empty array. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('pick: empty array');
    const chosen = items[this.nextInt(0, items.length - 1)];
    // noUncheckedIndexedAccess: the bounds above guarantee this, but prove it.
    if (chosen === undefined) throw new Error('pick: index out of range');
    return chosen;
  }

  /**
   * Gumbel noise, for the multinomial-logit store choice in §5.1.
   * `-ln(-ln(U))` where U is uniform on (0,1).
   */
  nextGumbel(): number {
    let u = this.nextFloat();
    // Guard the open interval: ln(0) is -Infinity and would poison the utility sum.
    if (u <= 0) u = Number.EPSILON;
    return -Math.log(-Math.log(u));
  }

  /** Snapshot of internal state, for save/restore. */
  getState(): readonly number[] {
    return this.#gen.getState();
  }
}

/**
 * The full set of streams for one world. Indexed by name so a system can never
 * accidentally consume another's numbers.
 */
export class StreamSet {
  readonly #streams: ReadonlyMap<StreamName, Stream>;
  readonly seed: number;

  constructor(worldSeed: number) {
    this.seed = worldSeed >>> 0;
    const streams = new Map<StreamName, Stream>();
    for (const name of STREAM_NAMES) {
      streams.set(name, new Stream(deriveSeed(this.seed, name)));
    }
    this.#streams = streams;
  }

  get(name: StreamName): Stream {
    const stream = this.#streams.get(name);
    if (!stream) throw new Error(`Unknown RNG stream: ${name}`);
    return stream;
  }

  /** Total draws across every stream — a cheap tamper check in the world hash. */
  totalDraws(): number {
    let total = 0;
    for (const name of STREAM_NAMES) total += this.get(name).draws;
    return total;
  }
}
