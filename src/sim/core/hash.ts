/**
 * World hashing (PLAN.md §6.3).
 *
 * After every tick the world folds into a single u32. Golden tests assert the whole
 * sequence for a fixed seed over 10,000 ticks, so any unintended behaviour change fails
 * CI loudly instead of quietly shifting the balance numbers.
 *
 * Requirements this must satisfy:
 *   - Identical on every platform. No floating-point accumulation, no Map iteration
 *     order, no locale.
 *   - Order-sensitive: two worlds differing only in entity order must hash differently.
 *   - Cheap. This runs 10 times per simulated second.
 *
 * FNV-1a over a canonical byte stream. Deliberately not a cryptographic hash — this
 * detects accidental change, not adversarial forgery. Leaderboard integrity comes from
 * replaying the command log server-side (§8.3), not from this number being unforgeable.
 */

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Incremental hasher. Feed values in a fixed order; order is part of the result. */
export class Hasher {
  #hash = FNV_OFFSET;

  /** Folds in one 32-bit unsigned integer, byte by byte, little-endian. */
  u32(value: number): this {
    let v = value >>> 0;
    for (let i = 0; i < 4; i++) {
      this.#hash = Math.imul(this.#hash ^ (v & 0xff), FNV_PRIME);
      v >>>= 8;
    }
    return this;
  }

  i32(value: number): this {
    return this.u32(value | 0);
  }

  bool(value: boolean): this {
    return this.u32(value ? 1 : 0);
  }

  /**
   * Folds in a float via its exact IEEE-754 bit pattern.
   *
   * Hashing the decimal rendering instead would be a portability trap: `toFixed`
   * rounding and locale-dependent separators differ between runtimes, and two floats
   * that print the same are not necessarily equal.
   */
  f64(value: number): this {
    // Normalize NaN so distinct NaN payloads cannot produce different hashes.
    const v = Number.isNaN(value) ? Number.NaN : value;
    FLOAT_VIEW[0] = v;
    return this.u32(INT_VIEW[0] ?? 0).u32(INT_VIEW[1] ?? 0);
  }

  str(value: string): this {
    this.u32(value.length);
    for (let i = 0; i < value.length; i++) this.u32(value.charCodeAt(i));
    return this;
  }

  /** Folds in a typed array of counters or component data. */
  u32Array(values: ArrayLike<number>): this {
    this.u32(values.length);
    for (let i = 0; i < values.length; i++) this.u32(values[i] ?? 0);
    return this;
  }

  f64Array(values: ArrayLike<number>): this {
    this.u32(values.length);
    for (let i = 0; i < values.length; i++) this.f64(values[i] ?? 0);
    return this;
  }

  get value(): number {
    return this.#hash >>> 0;
  }
}

const FLOAT_BUFFER = new ArrayBuffer(8);
const FLOAT_VIEW = new Float64Array(FLOAT_BUFFER);
const INT_VIEW = new Uint32Array(FLOAT_BUFFER);

/** Formats a hash the way golden files and failure messages should show it. */
export function formatHash(hash: number): string {
  return `0x${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
