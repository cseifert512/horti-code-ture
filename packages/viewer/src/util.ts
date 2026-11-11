// Small deterministic helpers shared by the procedural textures and organ
// geometry. Ported from the Wisteria prototype (Wisteria/src/util.js).

export function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  private readonly n: () => number;

  constructor(seed: number) {
    this.n = mulberry32(seed);
  }
  f(): number {
    return this.n();
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.n();
  }
  int(a: number, b: number): number {
    return Math.floor(this.range(a, b + 1));
  }
  sign(): 1 | -1 {
    return this.n() < 0.5 ? -1 : 1;
  }
  chance(p: number): boolean {
    return this.n() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.n() * arr.length)]!;
  }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.n() * (i + 1));
      [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    }
    return arr;
  }
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
export const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Deterministic random number in [0, 1) from two integers. */
export function hash2(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
