/**
 * A shoot in the air: the mechanics of unsupported growth.
 *
 * A shoot that is not on a support is a slender rod, fixed where it leaves
 * its support or its parent stem and carrying its own weight and that of its
 * leaves, flowers and fruit. As it lengthens, the bending moment at its base
 * grows with about the square of its length and its sag with the cube, while
 * its stiffness does not grow at all: so it stands out, arches over, and
 * hangs. The shape is worked out here from the stem's radius, its stiffness
 * and its weight. Nothing here is a drawn curve.
 *
 * THE ROD. The shoot is a chain of straight segments in one vertical plane.
 * psi is the angle of a segment from plumb: 0 straight up, pi/2 level, pi
 * straight down. At the joint at the near end of segment k
 *
 *     psi[k] - psi[k-1] = turn[k] + M[k] * length[k] / EI[k]
 *
 * where turn[k] is the turn the shoot's own growth gave it there (towards up
 * and the light, and its small wanderings), M[k] is the bending moment and
 * EI[k] the flexural rigidity, E * pi * r^4 / 4. Gravity is the only load, so
 * the shear in segment k is the weight W[k] of everything beyond it, and
 *
 *     M[k+1] = M[k] - W[k] * length[k] * sin(psi[k]),     M[tip] = 0
 *
 * This is the elastica of a heavy rod with its large rotations kept. psi at
 * the base is given (the rod is clamped there) and M at the tip is zero; the
 * moment at the base is found by shooting. Two classical results fall out of
 * it and are tested: a level cantilever sags at its tip by w L^3 / (6 EI),
 * and an upright rod stands only up to Greenhill's height, 1.986 (EI/w)^(1/3)
 * (Greenhill 1881, Proc. Cambridge Philosophical Society 4:65-73).
 *
 * WHAT IS SIMPLIFIED, because the render contract stores one fixed position
 * for each point of a stem with the day it was laid down:
 *   as grown   Each new length of stem is laid in the direction the rod's tip
 *              has on that day. What is already laid stays where it was put:
 *              it keeps the shape it had when its wood set, and is not bent
 *              further as the shoot beyond it grows heavier. The line drawn
 *              is therefore the path of the tip's direction, not the shape a
 *              wholly elastic rod of the final length would hang in: it keeps
 *              more of an arch near the base than that would, as a shoot does
 *              whose base has thickened and set.
 *   one plane  The rod bends under its weight in the vertical plane it lies
 *              in. Turning towards light on one side swings that plane round,
 *              and the moments are taken as if the rod were unrolled flat.
 *   stiffness  Young's modulus rises in a straight line from the green value
 *              to the set value over the days the model gives; the radius is
 *              the one the run stores for the point.
 *   weight     A leaf weighs its full weight from the day it is laid; an
 *              inflorescence from the day it begins to lengthen; a fruit in
 *              step with its swelling. Tendrils and prickles weigh nothing.
 *              Wind, rain and snow are not loads here.
 *   no twist, no contact forces, no neighbours: a shoot does not lean on
 *              another shoot, or rest on a member it lies across.
 */
import { type Bower, type Section, type SupportEdge, equivalentDiameterMm } from '../bower/types.ts';
import { type Vec3, UP, add, addScaled, dot, length, normalize, scale, sub, v3 } from '../math/vec3.ts';
import type { ShootPosture } from '../vocab.ts';

/** Standard gravity, m/s2. Physics, not a plant parameter. */
export const GRAVITY = 9.80665;
/** Greenhill's constant: an upright uniform rod buckles under its own weight at this many elasto-gravity lengths. */
export const GREENHILL = 1.986;
/** A shoot whose tip is within this of straight down is hanging plumb, and is not solved for any more. */
export const PLUMB_RAD = (172 * Math.PI) / 180;

/** Second moment of area of a round stem, m4. */
export const secondMomentM4 = (radiusM: number): number => (Math.PI * radiusM ** 4) / 4;
/** The length at which a rod's weight and its stiffness are a match for one another: (EI / w)^(1/3), EI in N m2, w in N/m. */
export const elastoGravityLengthM = (flexuralRigidityNm2: number, weightNPerM: number): number => Math.cbrt(flexuralRigidityNm2 / weightNPerM);
/** The tallest an upright uniform rod can stand before its own weight bends it over (Greenhill 1881). */
export const criticalHeightM = (flexuralRigidityNm2: number, weightNPerM: number): number => GREENHILL * elastoGravityLengthM(flexuralRigidityNm2, weightNPerM);

/** Young's modulus, Pa, of a stretch of stem `ageDays` old. */
export function modulusPa(ageDays: number, greenMPa: number, woodMPa: number, setDays: number): number {
  const set = setDays > 0 ? Math.min(1, Math.max(0, ageDays / setDays)) : 1;
  return (greenMPa + (woodMPa - greenMPa) * set) * 1e6;
}

/** A rod as the mechanics see it: one entry for each segment, base to tip. */
export interface Rod {
  /** Angle from plumb of the direction the rod is clamped in at its base, radians. */
  baseIncline: number;
  /** Length of each segment, m. */
  lengthM: readonly number[];
  /** The turn the shoot's own growth gave the joint at the near end of each segment, radians, positive downwards. */
  turn: readonly number[];
  /** How far that joint turns for each newton metre of bending moment: segment length / EI. */
  compliance: readonly number[];
  /** Weight carried at the far end of each segment, N. */
  load: readonly number[];
}

export interface RodSolution {
  /** Angle from plumb of the last segment. */
  tipIncline: number;
  /** What that angle would be with no weight on the rod. */
  unloadedIncline: number;
  /** Bending moment at the base, N m. */
  baseMoment: number;
  /** False where no balance was found near the last one: the rod has gone over, and is taken to hang. */
  found: boolean;
}

/**
 * The shape a rod hangs in. `near` is the base moment of the rod as it was a
 * moment ago (one segment shorter): the balance is looked for outwards from
 * there, so that a shoot followed as it grows stays on the shape it was
 * already in instead of jumping to another that also balances.
 */
export function solveRod(rod: Rod, near = 0): RodSolution {
  const n = rod.lengthM.length;
  let unloaded = rod.baseIncline;
  for (let k = 0; k < n; k++) unloaded += rod.turn[k]!;
  // weight beyond the near end of each segment, and the greatest moment that weight could ever put on the base
  const beyond = new Array<number>(n);
  let w = 0;
  for (let k = n - 1; k >= 0; k--) beyond[k] = w += rod.load[k]!;
  let most = 0;
  let along = 0;
  for (let k = 0; k < n; k++) {
    along += rod.lengthM[k]!;
    most += rod.load[k]! * along;
  }
  if (!(most > 0)) return { tipIncline: unloaded, unloadedIncline: unloaded, baseMoment: 0, found: true };

  let tip = unloaded;
  /** The moment left over at the tip when the base moment is `m0`: zero when the rod is in balance. */
  const left = (m0: number): number => {
    let psi = rod.baseIncline;
    let m = m0;
    for (let k = 0; k < n; k++) {
      psi += rod.turn[k]! + m * rod.compliance[k]!;
      m -= beyond[k]! * rod.lengthM[k]! * Math.sin(psi);
    }
    tip = psi;
    return m;
  };

  // bracket the nearest balance, stepping outwards from where the last one was
  const start = Math.min(most, Math.max(-most, near));
  let a = start;
  let fa = left(a);
  let b = a;
  let fb = fa;
  if (fa !== 0) {
    let lo = start;
    let flo = fa;
    let hi = start;
    let fhi = fa;
    let step = most * 0.004;
    let bracketed = false;
    for (let i = 0; i < 80 && !bracketed; i++) {
      const up = Math.min(1.5 * most, hi + step);
      const fup = left(up);
      if (fup === 0 || fup > 0 !== fhi > 0) {
        a = hi;
        fa = fhi;
        b = up;
        fb = fup;
        bracketed = true;
        break;
      }
      const down = Math.max(-1.5 * most, lo - step);
      const fdown = left(down);
      if (fdown === 0 || fdown > 0 !== flo > 0) {
        a = down;
        fa = fdown;
        b = lo;
        fb = flo;
        bracketed = true;
        break;
      }
      if (up >= 1.5 * most && down <= -1.5 * most) break;
      hi = up;
      fhi = fup;
      lo = down;
      flo = fdown;
      step *= 1.5;
    }
    if (!bracketed) return { tipIncline: tip, unloadedIncline: unloaded, baseMoment: start, found: false };
    // close in: false position with the Illinois correction, which cannot leave the bracket
    let side = 0;
    for (let i = 0; i < 100 && Math.abs(b - a) > 1e-12 * most; i++) {
      const c = fb === fa ? (a + b) / 2 : b - (fb * (b - a)) / (fb - fa);
      const fc = left(c);
      if (fc === 0) {
        a = b = c;
        fa = fb = 0;
        break;
      }
      if (fc > 0 === fb > 0) {
        b = c;
        fb = fc;
        if (side === -1) fa /= 2;
        side = -1;
      } else {
        a = c;
        fa = fc;
        if (side === 1) fb /= 2;
        side = 1;
      }
    }
  }
  const m0 = Math.abs(fa) <= Math.abs(fb) ? a : b;
  left(m0);
  return { tipIncline: tip, unloadedIncline: unloaded, baseMoment: m0, found: Number.isFinite(tip) };
}

/**
 * What the engine keeps for a shoot while it is in the air: the rod as laid,
 * and how it stands. Kept on the shoot's tip.
 */
export interface FreeShoot {
  /** The point of the axis the free stretch is fixed at: where it leaves its support or its parent stem. */
  basePoint: number;
  /** Angle from plumb of the direction it left in. */
  baseIncline: number;
  /** The level direction of the vertical plane the shoot lies in; angles from plumb are positive on this side. */
  plane: Vec3;
  /** Length of each segment laid since, and the turn its own growth gave it. */
  lengthM: number[];
  turn: number[];
  /** Angle from plumb of the last segment laid. */
  incline: number;
  /** Bending moment at the base when it was last solved: where the next balance is looked for. */
  baseMoment: number;
  posture: ShootPosture;
}

/** The level direction a vector leans in, or `fallback` where it stands plumb. Kept on the same side as `fallback`. */
function levelOf(d: Vec3, fallback: Vec3): Vec3 {
  const l = Math.hypot(d.x, d.y);
  if (l < 1e-9) return fallback;
  const h = v3(d.x / l, d.y / l, 0);
  return dot(h, fallback) < 0 ? scale(h, -1) : h;
}

/** Angle of a unit direction from plumb, signed by the side of the plane it leans to. */
export const inclineOf = (d: Vec3, plane: Vec3): number => Math.atan2(dot(d, plane), d.z);
/** The unit direction at an angle from plumb in a plane. */
export const directionAt = (incline: number, plane: Vec3): Vec3 => add(scale(plane, Math.sin(incline)), scale(UP, Math.cos(incline)));

/** A shoot that is about to grow its first free length from point `basePoint`, heading `dir`. */
export function startFreeShoot(basePoint: number, dir: Vec3): FreeShoot {
  const d = normalize(dir);
  const plane = levelOf(d, v3(1, 0, 0));
  const incline = inclineOf(d, plane);
  return { basePoint, baseIncline: incline, plane, lengthM: [], turn: [], incline, baseMoment: 0, posture: 'self_supporting' };
}

/**
 * Turn a heading towards the direction a shoot seeks: by `turnPerM` radians
 * for each metre grown when it is at right angles to that direction or
 * further from it, and in proportion to the sine of the angle when nearer.
 */
export function steer(d: Vec3, seek: Vec3, turnPerM: number, grownM: number): Vec3 {
  const c = Math.min(1, Math.max(-1, dot(d, seek)));
  const angle = Math.acos(c);
  if (angle < 1e-6) return d;
  const by = Math.min(angle, turnPerM * grownM * (angle > Math.PI / 2 ? 1 : Math.sin(angle)));
  if (by <= 0) return d;
  const s = Math.sin(angle);
  // dead against what it seeks, a shoot has no side to turn to: it goes over the top
  if (s < 1e-6) return normalize(add(d, scale(Math.abs(d.z) < 0.9 ? UP : v3(1, 0, 0), by)));
  return normalize(add(scale(d, Math.sin(angle - by) / s), scale(seek, Math.sin(by) / s)));
}

/** The direction a shoot seeks: between plumb and the light, by the share its model gives to the light. */
export function seekDirection(light: Vec3, lightShare: number): Vec3 {
  const g = normalize(add(scale(UP, 1 - lightShare), scale(light, lightShare)));
  return length(g) > 0 ? g : UP;
}

/** The plane and the angle from plumb of a new heading, for a shoot that lay in `plane`. */
export function replane(d: Vec3, plane: Vec3): { plane: Vec3; incline: number } {
  const next = levelOf(d, plane);
  return { plane: next, incline: inclineOf(d, next) };
}

// ---------------------------------------------------------------------------
// The structure near a shoot: what it must not pass through, and what it may take hold of
// ---------------------------------------------------------------------------
interface Capsule {
  a: Vec3;
  b: Vec3;
  /** Radius of the element, m. */
  r: number;
  /** The member or cable it is part of. */
  hostId: string;
  /** The stretch of route it is part of; null for timber that carries no route. */
  edge: SupportEdge | null;
}

/** Half the thickness a shoot has to keep clear of: the round bar of the same perimeter as the section. */
const clearRadiusM = (section: Section): number => equivalentDiameterMm(section) / 2000;

/** The point of segment a-b nearest to p. */
function nearestOnSegment(p: Vec3, a: Vec3, b: Vec3): Vec3 {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 > 0 ? Math.min(1, Math.max(0, dot(sub(p, a), ab) / l2)) : 0;
  return addScaled(a, ab, t);
}

/** The least distance between segments p1-q1 and p2-q2 (Ericson, Real-Time Collision Detection, 5.1.9). */
function segmentDistance(p1: Vec3, q1: Vec3, p2: Vec3, q2: Vec3): number {
  const d1 = sub(q1, p1);
  const d2 = sub(q2, p2);
  const r = sub(p1, p2);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  let s = 0;
  let t = 0;
  if (a <= 1e-12 && e <= 1e-12) return length(r);
  if (a <= 1e-12) t = Math.min(1, Math.max(0, f / e));
  else {
    const c = dot(d1, r);
    if (e <= 1e-12) s = Math.min(1, Math.max(0, -c / a));
    else {
      const b = dot(d1, d2);
      const den = a * e - b * b;
      s = den > 1e-12 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = Math.min(1, Math.max(0, -c / a));
      } else if (t > 1) {
        t = 1;
        s = Math.min(1, Math.max(0, (b - c) / a));
      }
    }
  }
  return length(sub(addScaled(p1, d1, s), addScaled(p2, d2, t)));
}

const CELL_M = 0.5;
const PIECE_M = 0.25;

/**
 * The timber and cables of a Bower, cut into short straight pieces and kept
 * in a grid so that a shoot can ask what is near its tip.
 *
 * Every member and cable is taken as round, with the radius of the bar of the
 * same perimeter: a rectangular section is stood in for by a rod a little
 * fatter than its narrow side and a little thinner than its diagonal. That is
 * the cheap part of the test, and what it misses is said where it is used.
 */
export class Surroundings {
  private readonly cells = new Map<string, Capsule[]>();
  private readonly pieces: Capsule[] = [];

  constructor(bower: Bower) {
    const routed = new Set<string>();
    for (const edge of bower.graph.edges.values()) {
      routed.add(edge.host.id);
      this.addCurve(edge.axis.points, clearRadiusM(edge.section), edge.host.id, edge);
    }
    // timber and cable that carry no route are still in the way
    for (const m of bower.members) if (!routed.has(m.id)) this.addCurve(m.curve.points, clearRadiusM(m.section), m.id, null);
    for (const s of bower.supports) if (!routed.has(s.id)) this.addCurve(s.curve.points, s.diameterMm / 2000, s.id, null);
  }

  private addCurve(points: readonly Vec3[], r: number, hostId: string, edge: SupportEdge | null): void {
    for (let i = 0; i + 1 < points.length; i++) {
      const a = points[i]!;
      const b = points[i + 1]!;
      const n = Math.max(1, Math.ceil(length(sub(b, a)) / PIECE_M));
      for (let k = 0; k < n; k++) {
        const piece: Capsule = { a: addScaled(a, sub(b, a), k / n), b: addScaled(a, sub(b, a), (k + 1) / n), r, hostId, edge };
        this.pieces.push(piece);
        const pad = r + 1e-6;
        const x0 = Math.floor((Math.min(piece.a.x, piece.b.x) - pad) / CELL_M);
        const x1 = Math.floor((Math.max(piece.a.x, piece.b.x) + pad) / CELL_M);
        const y0 = Math.floor((Math.min(piece.a.y, piece.b.y) - pad) / CELL_M);
        const y1 = Math.floor((Math.max(piece.a.y, piece.b.y) + pad) / CELL_M);
        const z0 = Math.floor((Math.min(piece.a.z, piece.b.z) - pad) / CELL_M);
        const z1 = Math.floor((Math.max(piece.a.z, piece.b.z) + pad) / CELL_M);
        for (let x = x0; x <= x1; x++) {
          for (let y = y0; y <= y1; y++) {
            for (let z = z0; z <= z1; z++) {
              const key = `${x},${y},${z}`;
              const cell = this.cells.get(key);
              if (cell) cell.push(piece);
              else this.cells.set(key, [piece]);
            }
          }
        }
      }
    }
  }

  /** Every piece that could come within `reach` of the box round p and q. */
  private near(p: Vec3, q: Vec3, reach: number): Set<Capsule> {
    const out = new Set<Capsule>();
    const x0 = Math.floor((Math.min(p.x, q.x) - reach) / CELL_M);
    const x1 = Math.floor((Math.max(p.x, q.x) + reach) / CELL_M);
    const y0 = Math.floor((Math.min(p.y, q.y) - reach) / CELL_M);
    const y1 = Math.floor((Math.max(p.y, q.y) + reach) / CELL_M);
    const z0 = Math.floor((Math.min(p.z, q.z) - reach) / CELL_M);
    const z1 = Math.floor((Math.max(p.z, q.z) + reach) / CELL_M);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          const cell = this.cells.get(`${x},${y},${z}`);
          if (cell) for (const piece of cell) out.add(piece);
        }
      }
    }
    return out;
  }

  /**
   * Whether a length of stem laid from `from` to `to` would go into a member
   * or cable, and if so the direction straight out of it at `to`.
   *
   * It goes in when it comes nearer to the centre line of a piece than the
   * piece's radius and the stem's together, and ends nearer to it than it
   * began: a shoot that starts on a member, as every shoot does, may leave
   * it or run along it, and may not turn into it.
   */
  enters(from: Vec3, to: Vec3, stemRadiusM: number): { out: Vec3; hostId: string } | null {
    let worst: { out: Vec3; hostId: string } | null = null;
    let deepest = 0;
    for (const piece of this.near(from, to, 0.2)) {
      const clear = piece.r + stemRadiusM;
      if (segmentDistance(from, to, piece.a, piece.b) >= clear) continue;
      const at = nearestOnSegment(to, piece.a, piece.b);
      const now = length(sub(to, at));
      const before = length(sub(from, nearestOnSegment(from, piece.a, piece.b)));
      if (now >= before - 1e-9) continue;
      const depth = clear - now;
      if (depth > deepest || !worst) {
        deepest = depth;
        const away = sub(to, at);
        worst = { out: length(away) > 1e-9 ? normalize(away) : UP, hostId: piece.hostId };
      }
    }
    return worst;
  }

  /**
   * Distance from a point to the surface of a stretch of route (less than
   * zero inside it), and the direction the route runs in, from its `from`
   * end to its `to` end, where it is nearest.
   */
  static toEdge(p: Vec3, edge: SupportEdge): { gap: number; along: Vec3 } {
    const pts = edge.axis.points;
    let best = Infinity;
    let along = UP;
    for (let i = 0; i + 1 < pts.length; i++) {
      const d = length(sub(p, nearestOnSegment(p, pts[i]!, pts[i + 1]!)));
      if (d < best) {
        best = d;
        along = normalize(sub(pts[i + 1]!, pts[i]!));
      }
    }
    return { gap: best - clearRadiusM(edge.section), along };
  }

  /** The stretches of route whose surface is within `reach` of a point, nearest first. */
  routesNear(p: Vec3, reach: number): { edge: SupportEdge; gap: number; along: Vec3 }[] {
    const seen = new Map<string, { edge: SupportEdge; gap: number; along: Vec3 }>();
    for (const piece of this.near(p, p, reach + 0.15)) {
      if (!piece.edge || seen.has(piece.edge.id)) continue;
      const { gap, along } = Surroundings.toEdge(p, piece.edge);
      if (gap <= reach) seen.set(piece.edge.id, { edge: piece.edge, gap, along });
    }
    return [...seen.values()].sort((x, y) => x.gap - y.gap || (x.edge.id < y.edge.id ? -1 : 1));
  }
}
