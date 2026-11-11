// Small deterministic helpers shared by the generators.

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed) {
    this.n = mulberry32(seed);
  }
  f() {
    return this.n();
  }
  range(a, b) {
    return a + (b - a) * this.n();
  }
  int(a, b) {
    return Math.floor(this.range(a, b + 1));
  }
  sign() {
    return this.n() < 0.5 ? -1 : 1;
  }
  chance(p) {
    return this.n() < p;
  }
  pick(arr) {
    return arr[Math.floor(this.n() * arr.length)];
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.n() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
