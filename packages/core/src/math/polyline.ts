import { type Vec3, distance, lerp, normalize, sub } from './vec3.ts';

/** A 3-D curve as straight segments, parameterised by distance along it in metres. */
export class Polyline {
  readonly points: readonly Vec3[];
  /** Distance from the start to each point. */
  readonly cumulative: Float64Array;

  constructor(points: readonly Vec3[]) {
    if (points.length < 2) throw new Error('a polyline needs at least two points');
    this.points = points;
    this.cumulative = new Float64Array(points.length);
    for (let i = 1; i < points.length; i++) {
      this.cumulative[i] = this.cumulative[i - 1]! + distance(points[i - 1]!, points[i]!);
    }
  }

  /** Sample `fn(t)` for t in [0, 1] at `segments + 1` evenly spaced parameter values. */
  static sample(fn: (t: number) => Vec3, segments: number): Polyline {
    const pts: Vec3[] = [];
    for (let i = 0; i <= segments; i++) pts.push(fn(i / segments));
    return new Polyline(pts);
  }

  get length(): number {
    return this.cumulative[this.cumulative.length - 1]!;
  }

  get start(): Vec3 {
    return this.points[0]!;
  }

  get end(): Vec3 {
    return this.points[this.points.length - 1]!;
  }

  /** Index of the segment containing distance `s`. */
  private segmentAt(s: number): number {
    const c = this.cumulative;
    let lo = 0;
    let hi = c.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (c[mid]! <= s) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** The point at distance `s` from the start, clamped to the ends. */
  pointAt(s: number): Vec3 {
    const sc = Math.min(this.length, Math.max(0, s));
    const i = this.segmentAt(sc);
    const seg = this.cumulative[i + 1]! - this.cumulative[i]!;
    const t = seg > 0 ? (sc - this.cumulative[i]!) / seg : 0;
    return lerp(this.points[i]!, this.points[i + 1]!, t);
  }

  /** Unit direction of travel at distance `s`. */
  tangentAt(s: number): Vec3 {
    const i = this.segmentAt(Math.min(this.length, Math.max(0, s)));
    return normalize(sub(this.points[i + 1]!, this.points[i]!));
  }

  /** The same curve travelled the other way. */
  reversed(): Polyline {
    return new Polyline([...this.points].reverse());
  }
}
