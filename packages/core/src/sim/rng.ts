/** Seeded random numbers (mulberry32, as in the prototype): the same seed gives the same plant. */
export class Rng {
  private a: number;

  constructor(seed: number) {
    this.a = seed | 0;
  }

  next(): number {
    this.a = (this.a + 0x6d2b79f5) | 0;
    let t = Math.imul(this.a ^ (this.a >>> 15), 1 | this.a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }

  /** Whole number from lo to hi inclusive. */
  int(lo: number, hi: number): number {
    return Math.floor(this.range(lo, hi + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  sign(): 1 | -1 {
    return this.next() < 0.5 ? -1 : 1;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)]!;
  }
}

/**
 * A stream of its own for one decision at one place: seeded from the place
 * (to a tenth of a millimetre), a number that tells plants apart and a number
 * that tells decisions apart.
 *
 * A plant's three running streams are consumed in order, so one more draw
 * anywhere moves everything decided after it. What is decided here instead
 * depends on nothing but where it is: fruit, tendrils, prickles and flowering
 * side shoots can be switched on, or cut off, without moving a leaf or a
 * flower anywhere else on the plant, and two scenarios stay comparable.
 */
export function placeRng(base: number, x: number, y: number, z: number, salt: number): Rng {
  let h = Math.imul(base | 0, 0x9e3779b1) ^ Math.imul(Math.round(x * 10000), 73856093) ^ Math.imul(Math.round(y * 10000), 19349663) ^ Math.imul(Math.round(z * 10000), 83492791) ^ Math.imul(salt | 0, 0x85ebca6b);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  const rng = new Rng(h);
  // the first number of a stream follows its seed closely; let it go
  rng.next();
  return rng;
}
