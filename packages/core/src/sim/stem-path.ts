/**
 * How a stem sits on a stretch of route.
 *
 * Carried over from the prototype: a supported stem is stored as the line
 * where it TOUCHES its support, plus the unit direction away from the
 * support at each point. Its centre is always
 *
 *     centre = contact + away * radius
 *
 * so it rests on the timber or winds round the cable at every age and
 * thickens outwards, never into what carries it.
 *
 * Two ways of holding a route are built here:
 *   lie    the stem runs along the route line, as when a gardener ties it in
 *   twine  the stem winds round the member or cable in a helix of the taxon's
 *          handedness, in a whole number of turns so that it arrives on the
 *          route line again at the far end
 * Twining uses more stem than the route is long, which is one reason a
 * plant's reach is shorter than its shoot length.
 */
import type { Section, SupportEdge } from '../bower/types.ts';
import { type Vec3, UP, ZERO, add, addScaled, anyPerpendicular, cross, distance, dot, length, lerp, normalize, scale, sub } from '../math/vec3.ts';
import type { Handedness } from '../vocab.ts';

export interface StemPath {
  /** Contact points on the support. */
  points: Vec3[];
  /** Unit direction away from the support at each point. */
  away: Vec3[];
  /** Stem length from the start of the path to each point, in metres. */
  cumulative: number[];
}

export const pathLength = (p: StemPath): number => p.cumulative[p.cumulative.length - 1] ?? 0;

function finish(points: Vec3[], away: Vec3[]): StemPath {
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) cumulative.push(cumulative[i - 1]! + distance(points[i - 1]!, points[i]!));
  return { points, away, cumulative };
}

/** Interpolate a path at stem distance `d` from its start. */
export function pathAt(path: StemPath, d: number): { p: Vec3; away: Vec3 } {
  const c = path.cumulative;
  const total = pathLength(path);
  const dc = Math.min(total, Math.max(0, d));
  let lo = 0;
  let hi = c.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (c[mid]! <= dc) lo = mid;
    else hi = mid - 1;
  }
  const seg = c[lo + 1]! - c[lo]!;
  const t = seg > 0 ? (dc - c[lo]!) / seg : 0;
  const away = normalize(lerp(path.away[lo]!, path.away[lo + 1]!, t));
  return { p: lerp(path.points[lo]!, path.points[lo + 1]!, t), away };
}

interface Frame {
  /** Centre of the support. */
  c: Vec3;
  /** Direction of travel. */
  t: Vec3;
  /** Across the section, with w x d = t. */
  w: Vec3;
  /** Towards the route line: the side a resting stem lies on. */
  d: Vec3;
}

/** Remove from `v` its component along unit vector `t`. */
const reject = (v: Vec3, t: Vec3): Vec3 => addScaled(v, t, -dot(v, t));

/**
 * Frames along an edge, travelled from `from` to `to` or the other way.
 * The "towards the route" direction comes from the offset between the route
 * line and the centre line where there is one (timber), and otherwise from
 * the ends of the route (a cable reached over a node) or from plain up.
 */
function frames(edge: SupportEdge, reverse: boolean, n: number): Frame[] {
  const curve = reverse ? edge.curve.reversed() : edge.curve;
  const axis = reverse ? edge.axis.reversed() : edge.axis;
  const offsetAt = (f: number) => {
    const t = axis.tangentAt(f * axis.length);
    return reject(sub(curve.pointAt(f * curve.length), axis.pointAt(f * axis.length)), t);
  };
  let direct = true;
  for (let i = 0; i <= 8 && direct; i++) if (length(offsetAt(i / 8)) < 1e-3) direct = false;
  const end0 = offsetAt(0);
  const end1 = offsetAt(1);
  const byEnds = !direct && length(end0) > 1e-3 && length(end1) > 1e-3;

  const out: Frame[] = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const c = axis.pointAt(f * axis.length);
    const t = axis.tangentAt(f * axis.length);
    let d: Vec3;
    if (direct) d = offsetAt(f);
    else if (byEnds) d = reject(lerp(normalize(end0), normalize(end1), f), t);
    else d = reject(UP, t);
    d = length(d) > 1e-6 ? normalize(d) : anyPerpendicular(t);
    out.push({ c, t, w: cross(d, t), d });
  }
  return out;
}

/** Half-extents of the outline a stem bears on: a rounded shape through the corners of the section. */
function outline(section: Section): { a: number; d: number; p: number } {
  if (section.shape === 'round') return { a: section.diameterMm / 2000, d: section.diameterMm / 2000, p: 2 };
  const p = 5;
  const k = Math.pow(2, 1 / p);
  return { a: (section.widthMm / 2000) * k, d: (section.depthMm / 2000) * k, p };
}

/** Point on the outline at angle `phi` (0 = across, pi/2 = towards the route line), and the outward normal there. */
function onOutline(o: { a: number; d: number; p: number }, phi: number): { x: number; y: number; nx: number; ny: number } {
  const cp = Math.cos(phi);
  const sp = Math.sin(phi);
  const rho = Math.pow(Math.pow(Math.abs(cp / o.a), o.p) + Math.pow(Math.abs(sp / o.d), o.p), -1 / o.p);
  const x = rho * cp;
  const y = rho * sp;
  const gx = (Math.sign(x) * Math.pow(Math.abs(x / o.a), o.p - 1)) / o.a;
  const gy = (Math.sign(y) * Math.pow(Math.abs(y / o.d), o.p - 1)) / o.d;
  const gl = Math.hypot(gx, gy) || 1;
  return { x, y, nx: gx / gl, ny: gy / gl };
}

export interface LieOptions {
  reverse?: boolean;
  /** Sideways shift across the member, for stems sharing it. */
  sideOffsetM?: number;
}

/** A stem lying along the route line. */
export function liePath(edge: SupportEdge, options: LieOptions = {}): StemPath {
  const { reverse = false, sideOffsetM = 0 } = options;
  const n = Math.max(2, Math.ceil(edge.curve.length / 0.02));
  const fr = frames(edge, reverse, n);
  const curve = reverse ? edge.curve.reversed() : edge.curve;
  const o = outline(edge.section);
  const points: Vec3[] = [];
  const away: Vec3[] = [];
  for (let i = 0; i <= n; i++) {
    const f = fr[i]!;
    const onRoute = curve.pointAt((i / n) * curve.length);
    // rest on the route line where it stands clear of the centre line, else on top of the element
    const clear = length(reject(sub(onRoute, f.c), f.t)) > 1e-3;
    const base = clear ? onRoute : addScaled(f.c, f.d, edge.section.shape === 'round' ? o.d : o.d / Math.pow(2, 1 / o.p));
    points.push(addScaled(base, f.w, sideOffsetM));
    away.push(f.d);
  }
  return finish(points, away);
}

export interface TwineOptions {
  reverse?: boolean;
  handedness: Handedness;
  /** Shortest pitch the stem coils at, on slender supports. */
  minPitchM: number;
  /** Pitch as a multiple of the support's circumference, on stout ones. */
  pitchPerCircumference: number;
  /**
   * For a stem rising from the ground beside others: how far round the
   * support it starts, in radians in its winding direction. It still finishes
   * on the route line, by winding that much less.
   */
  startAdvance?: number;
  /**
   * For a second stem arriving over a node on to a support already coiled:
   * how far its coil runs ahead of the first in mid-span, in radians. Both
   * start and finish on the route line, so neither cuts through the support
   * to reach its place.
   */
  bulge?: number;
}

/** A stem twining round the support. */
export function twinePath(edge: SupportEdge, options: TwineOptions): StemPath {
  const { reverse = false, handedness, minPitchM, pitchPerCircumference, startAdvance = 0, bulge = 0 } = options;
  const axisLength = edge.axis.length;
  const pitch = Math.max(minPitchM, pitchPerCircumference * Math.PI * (edge.gripDiameterMm / 1000));
  const turns = Math.max(1, Math.round(axisLength / pitch));
  const n = Math.max(8, Math.ceil(axisLength / 0.01), turns * 24);
  const fr = frames(edge, reverse, n);
  const o = outline(edge.section);
  // w x d = t, so increasing phi turns right-handed about the direction of travel
  const sign = handedness === 'right_handed' ? 1 : -1;
  const points: Vec3[] = [];
  const away: Vec3[] = [];

  // The coil always turns the one way. It starts `advance` round from the
  // route line and ends on it; a bulge runs it ahead in mid-span without ever
  // reversing it (its slope is kept below the coil's own).
  const sweep = 2 * Math.PI * turns;
  const advance = Math.min(Math.max(0, startAdvance), sweep - Math.PI);
  const ahead = Math.min(Math.max(0, bulge), 1.5 * turns);
  const angle = (t: number) => Math.PI / 2 + sign * (advance + (sweep - advance) * t + ahead * Math.sin(Math.PI * t) ** 2);

  // where the route reaches the support over the top of a node, step down on to it first
  const curve = reverse ? edge.curve.reversed() : edge.curve;
  if (distance(curve.start, fr[0]!.c) > o.d + 0.01) {
    points.push(curve.start);
    away.push(fr[0]!.d);
  }
  for (let i = 0; i <= n; i++) {
    const f = fr[i]!;
    const phi = angle(i / n);
    const q = onOutline(o, phi);
    points.push(add(f.c, add(scale(f.w, q.x), scale(f.d, q.y))));
    away.push(normalize(add(scale(f.w, q.nx), scale(f.d, q.ny))));
  }
  if (distance(curve.end, fr[n]!.c) > o.d + 0.01) {
    points.push(curve.end);
    away.push(fr[n]!.d);
  }
  return finish(points, away);
}

/** Number of whole turns a twining path makes: positive right-handed, negative left-handed. */
export function turnsOf(path: StemPath): number {
  let turns = 0;
  for (let i = 0; i + 1 < path.points.length; i++) {
    const travel = sub(path.points[i + 1]!, path.points[i]!);
    const a = path.away[i]!;
    const b = path.away[i + 1]!;
    // how far the away-direction turned, signed by which way it turned about the direction of travel
    const angle = Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
    turns += (Math.sign(dot(cross(a, b), travel)) * angle) / (2 * Math.PI);
  }
  return turns;
}

/** An unsupported path: the stem's own centre line, with nothing to stand away from. */
export function freePath(points: Vec3[]): StemPath {
  return finish(points, points.map(() => ZERO));
}
