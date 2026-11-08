/**
 * Seedable PRNG (NFR-3). mulberry32: tiny, fast, and fully described by one 32-bit state,
 * which keeps it trivially serializable in saves. Never use Math.random in the core.
 */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /** Current internal state; feed to `new Rng(state)` to resume the exact sequence. */
  get state(): number {
    return this.s;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError(`Rng.int: invalid range [${min}, ${max}]`);
    }
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** True with the given probability (0..1). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError("Rng.pick: empty list");
    return items[this.int(0, items.length - 1)] as T;
  }

  /** Independent child generator, so a subsystem's draws do not disturb the parent sequence. */
  fork(): Rng {
    return new Rng(Math.floor(this.next() * 4294967296));
  }
}
