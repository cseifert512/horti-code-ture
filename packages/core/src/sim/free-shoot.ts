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
 *   one shape  While a shoot grows, the whole of its free length is laid, each
 *              time its rod is solved, along the shape the rod balances in
 *              that day: the foot bends as the load on it grows, as well as
 *              the tip. The contract keeps one position for each point, so
 *              what is stored is the shape the shoot has when it stops
 *              growing, and a still of an earlier day shows the part of the
 *              shoot that was there then along that final shape: a young
 *              shoot is drawn leaning as it will when it is long, where on
 *              the plant it stood more upright while it was short. Until
 *              12 November 2026 each length was laid in the direction the
 *              tip had on its day and never moved ("as grown"), which kept
 *              the foot of every shoot as straight as it set out, and put all
 *              the bend near the tip: a row of rods with nodding ends.
 *   it sets    Once a shoot stops growing (its length made, or cut) its
 *              shape is kept: it does not spring back when its leaves fall or
 *              when part of it is cut away, nor sag further as its fruit
 *              swells. A shoot that grows on in a later year is clamped at
 *              the end of the wood it already had.
 *   it rests   Where the shape a rod balances in would pass through timber
 *              or cable, the shoot is taken to rest on it: what is laid stays
 *              where it was, and it grows on as grown, each new length in the
 *              direction of the tip. No force from the timber is worked out.
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
 *   no twist, no neighbours: a shoot does not lean on another shoot.
 */
import { type Bower, type Section, type SupportEdge, equivalentDiameterMm } from '../bower/types.ts';
import { type Vec3, UP, add, addScaled, dot, length, normalize, scale, sub, v3 } from '../math/vec3.ts';
import type { ShootPosture } from '../vocab.ts';

/** Standard gravity, m/s2. Physics, not a plant parameter. */
export const GRAVITY = 9.80665;
/** Greenhill's constant: an upright uniform rod buckles under its own weight at this many elasto-gravity lengths. */
export const GREENHILL = 1.986;
/** How much a shoot grows between one asking of which way the light is and the next, m: light changes slowly along a shoot. */
export const LIGHT_EVERY_M = 0.2;
/** How much a shoot grows between one feeling for a support within reach and the next, m: a third of the least reach any model is likely to give. */
export const FEEL_EVERY_M = 0.02;
/** How much a shoot grows between one solving of its rod and the next, m: half a rod segment. A shoot that lays more than this in a day is solved every day. */
export const SOLVE_EVERY_M = 0.02;
/** The shortest length the mechanics take as one segment of the rod, m: a slow shoot lays a few millimetres a day, and the rod need not be cut so fine. */
export const ROD_SEGMENT_M = 0.04;
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
  /**
   * Moment of weight hung off the stem's axis at the far end of each segment, N m: a leaf's weight times how far its
   * middle stands out from the stem, level, in the rod's plane; positive on the side the plane points to. Left out: none.
   */
  couple?: readonly number[];
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
 * already in instead of jumping to another that also balances. `inclines`, where
 * given, is filled with the angle from plumb of every segment in that balance,
 * base to tip: the shape the whole rod has, not only its tip. It is left empty
 * where no balance was found.
 */
export function solveRod(rod: Rod, near = 0, inclines?: number[]): RodSolution {
  const n = rod.lengthM.length;
  let unloaded = rod.baseIncline;
  for (let k = 0; k < n; k++) unloaded += rod.turn[k]!;
  // weight beyond the near end of each segment, and the greatest moment that weight could ever put on the base
  const beyond = new Array<number>(n);
  let w = 0;
  for (let k = n - 1; k >= 0; k--) beyond[k] = w += rod.load[k]!;
  let most = 0;
  let along = 0;
  const couple = rod.couple;
  for (let k = 0; k < n; k++) {
    along += rod.lengthM[k]!;
    most += rod.load[k]! * along + (couple ? Math.abs(couple[k]!) : 0);
  }
  if (!(most > 0)) {
    if (inclines) {
      let psi = rod.baseIncline;
      inclines.length = 0;
      for (let k = 0; k < n; k++) inclines.push((psi += rod.turn[k]!));
    }
    return { tipIncline: unloaded, unloadedIncline: unloaded, baseMoment: 0, found: true };
  }

  let tip = unloaded;
  /**
   * The moment left over at the tip when the base moment is `m0`: zero when the rod is in balance. A weight hung off
   * the axis at the far end of segment k bends every joint up to and including the one it hangs at, and none beyond.
   */
  const left = (m0: number, shape?: number[]): number => {
    let psi = rod.baseIncline;
    let m = m0;
    if (shape) shape.length = 0;
    for (let k = 0; k < n; k++) {
      psi += rod.turn[k]! + m * rod.compliance[k]!;
      if (shape) shape.push(psi);
      m -= beyond[k]! * rod.lengthM[k]! * Math.sin(psi);
      if (couple && k > 0) m -= couple[k - 1]!;
    }
    if (couple && n > 0) m -= couple[n - 1]!;
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
    let step = Math.max(Math.abs(start) * 0.03, most * 5e-4);
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
      step *= 2;
    }
    if (!bracketed) {
      if (inclines) inclines.length = 0;
      return { tipIncline: tip, unloadedIncline: unloaded, baseMoment: start, found: false };
    }
    // close in: false position with the Illinois correction, which cannot leave the bracket. A moment known to a
    // part in a hundred million of the most it could be turns the tip by far less than can be drawn.
    let side = 0;
    for (let i = 0; i < 60 && Math.abs(b - a) > 1e-8 * most; i++) {
      const c = fb === fa ? (a + b) / 2 : b - (fb * (b - a)) / (fb - fa);
      const fc = left(c);
      if (Math.abs(fc) <= 1e-12 * most) {
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
  left(m0, inclines);
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
  /** The level direction of the vertical plane each length was laid in: the plane swings round as the shoot turns to the light. */
  planes: Vec3[];
  /** Angle from plumb each length lies at as it is stored: what it had when it was laid, or when the whole shoot was last laid again. */
  laid: number[];
  /** Where the first free length starts: the base point, or a stem's radius out from the face it left. Null until the first length is laid. */
  origin: Vec3 | null;
  /**
   * True once the shape its rod balances in would have passed through timber or cable: the shoot rests there. From then
   * on what is laid is not moved, and each new length is laid in the direction of the tip.
   */
  resting?: boolean;
  /** Angle from plumb of the last segment laid. */
  incline: number;
  /** Bending moment at the base when it was last solved: where the next balance is looked for. */
  baseMoment: number;
  posture: ShootPosture;
  /** The stretches of route that were within its grasp where it set out, which are not ones it has found; null until asked. */
  leftBehind: Set<string> | null;
  /** Which way the light was when it last asked, and how long it was then: it asks again every `LIGHT_EVERY_M` of growth. */
  light: Vec3 | null;
  lightAskedAtM: number;
  /** How long it was when it last felt for a support within reach: it feels again every `FEEL_EVERY_M` of growth. */
  feltAtM: number;
  /** How long it was when its rod was last solved: it is solved again every `SOLVE_EVERY_M` of growth, and in between the tip keeps the sag it had. */
  solvedAtM: number;
  /**
   * True once its tip has come as far from its base as shoots of its kind are known to hold themselves out (the
   * searcher reach): from then on it no longer steers towards up and the light, and grows on as its weight lets it.
   */
  pastReach?: boolean;
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

/**
 * A shoot that is about to grow its first free length from point `basePoint`, heading `dir`. With `leanRad`, a shoot
 * heading nearer plumb than that is set out leaning that far: towards the side it already leans to where it leans at
 * all, and otherwise towards `leanToward` (a level direction). No stem is exactly upright, and a rod that is carries no
 * bending load: without the lean it would stand straight to any length.
 */
export function startFreeShoot(basePoint: number, dir: Vec3, leanRad = 0, leanToward: Vec3 = v3(1, 0, 0)): FreeShoot {
  const d = normalize(dir);
  // a heading that leans less than a thousandth of a radian has no side of its own worth keeping
  const plane = Math.hypot(d.x, d.y) > 1e-3 ? levelOf(d, v3(1, 0, 0)) : leanRad > 0 ? levelOf(leanToward, leanToward) : levelOf(d, v3(1, 0, 0));
  let incline = inclineOf(d, plane);
  if (leanRad > 0 && Math.abs(incline) < leanRad) incline = incline < 0 ? -leanRad : leanRad;
  return { basePoint, baseIncline: incline, plane, lengthM: [], turn: [], planes: [], laid: [], origin: null, incline, baseMoment: 0, posture: 'self_supporting', leftBehind: null, light: null, lightAskedAtM: 0, feltAtM: -1, solvedAtM: -1 };
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
  /** The stretch of route it is part of, and the way that route runs here; null for timber that carries no route. */
  edge: SupportEdge | null;
  along: Vec3;
  /** The last question this piece was looked at for, so that it is looked at once. */
  asked: number;
}

/** Half the thickness a shoot has to keep clear of: the round bar of the same perimeter as the section. */
const clearRadiusM = (section: Section): number => equivalentDiameterMm(section) / 2000;

/** The distance from p to segment a-b. */
function distanceToSegment(p: Vec3, a: Vec3, b: Vec3): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const l2 = abx * abx + aby * aby + abz * abz;
  const t = l2 > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / l2)) : 0;
  return Math.hypot(p.x - a.x - abx * t, p.y - a.y - aby * t, p.z - a.z - abz * t);
}

/** The point of segment a-b nearest to p. */
function nearestOnSegment(p: Vec3, a: Vec3, b: Vec3): Vec3 {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 > 0 ? Math.min(1, Math.max(0, dot(sub(p, a), ab) / l2)) : 0;
  return addScaled(a, ab, t);
}

/** The least distance between segments p1-q1 and p2-q2 (Ericson, Real-Time Collision Detection, 5.1.9). */
export function segmentDistance(p1: Vec3, q1: Vec3, p2: Vec3, q2: Vec3): number {
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
/** A grid cell as one number. Good for a structure within 250 m of the origin, which is every Bower. */
const cellKey = (x: number, y: number, z: number): number => (x + 512) * 1048576 + (y + 512) * 1024 + (z + 512);
const NOTHING: readonly { edge: SupportEdge; gap: number; along: Vec3 }[] = [];

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
  private readonly cells = new Map<number, Capsule[]>();
  private question = 0;

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
      const span = sub(b, a);
      if (length(span) < 1e-9) continue;
      const along = normalize(span);
      const n = Math.max(1, Math.ceil(length(span) / PIECE_M));
      for (let k = 0; k < n; k++) {
        const piece: Capsule = { a: addScaled(a, span, k / n), b: addScaled(a, span, (k + 1) / n), r, hostId, edge, along, asked: -1 };
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
              const key = cellKey(x, y, z);
              const cell = this.cells.get(key);
              if (cell) cell.push(piece);
              else this.cells.set(key, [piece]);
            }
          }
        }
      }
    }
  }

  /** Call `see` once with every piece whose surface could come within `reach` of the box round p and q. */
  private near(p: Vec3, q: Vec3, reach: number, see: (piece: Capsule) => void): void {
    const asked = ++this.question;
    const x0 = Math.floor((Math.min(p.x, q.x) - reach) / CELL_M);
    const x1 = Math.floor((Math.max(p.x, q.x) + reach) / CELL_M);
    const y0 = Math.floor((Math.min(p.y, q.y) - reach) / CELL_M);
    const y1 = Math.floor((Math.max(p.y, q.y) + reach) / CELL_M);
    const z0 = Math.floor((Math.min(p.z, q.z) - reach) / CELL_M);
    const z1 = Math.floor((Math.max(p.z, q.z) + reach) / CELL_M);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          const cell = this.cells.get(cellKey(x, y, z));
          if (!cell) continue;
          for (const piece of cell) {
            if (piece.asked === asked) continue;
            piece.asked = asked;
            see(piece);
          }
        }
      }
    }
  }

  /**
   * Whether a length of stem laid from `from` to `to` would go into a member
   * or cable, and if so which, and the direction straight out of it at `to`.
   *
   * It goes in when it comes nearer to the centre line of a piece than the
   * piece's radius and the stem's together, and ends nearer to it than it
   * began: a shoot that starts on a member, as every shoot does, may leave
   * it or run along it, and may not turn into it.
   */
  enters(from: Vec3, to: Vec3, stemRadiusM: number): { out: Vec3; hostId: string } | null {
    let worst: { out: Vec3; hostId: string } | null = null;
    let deepest = -Infinity;
    this.near(from, to, stemRadiusM + 1e-3, (piece) => {
      const clear = piece.r + stemRadiusM;
      if (segmentDistance(from, to, piece.a, piece.b) >= clear) return;
      const at = nearestOnSegment(to, piece.a, piece.b);
      const now = length(sub(to, at));
      if (now >= distanceToSegment(from, piece.a, piece.b) - 1e-9) return;
      if (clear - now <= deepest) return;
      deepest = clear - now;
      const away = sub(to, at);
      worst = { out: length(away) > 1e-9 ? normalize(away) : UP, hostId: piece.hostId };
    });
    return worst;
  }

  /**
   * The stretches of route whose surface is within `reach` of a point,
   * nearest first: each with the gap to it (less than zero inside it) and the
   * way the route runs, from its `from` end to its `to` end, where it is nearest.
   */
  routesNear(p: Vec3, reach: number): readonly { edge: SupportEdge; gap: number; along: Vec3 }[] {
    let found: Map<string, { edge: SupportEdge; gap: number; along: Vec3 }> | null = null;
    this.near(p, p, reach, (piece) => {
      if (!piece.edge) return;
      const gap = distanceToSegment(p, piece.a, piece.b) - piece.r;
      if (gap > reach) return;
      const known = (found ??= new Map()).get(piece.edge.id);
      if (!known) found.set(piece.edge.id, { edge: piece.edge, gap, along: piece.along });
      else if (gap < known.gap) {
        known.gap = gap;
        known.along = piece.along;
      }
    });
    if (!found) return NOTHING;
    return [...(found as Map<string, { edge: SupportEdge; gap: number; along: Vec3 }>).values()].sort((x, y) => x.gap - y.gap || (x.edge.id < y.edge.id ? -1 : 1));
  }
}
