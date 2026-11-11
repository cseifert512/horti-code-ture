// Section frames for timber members.
//
// The core describes a member by its centre line and the size of its section,
// but not by which way the section is turned. To sweep a rectangle along the
// line the viewer has to know the depth axis at every point, so it infers it:
//
//   1. routes      Where a plant route is hosted on the member, the route lies
//                  on its outer face, so the depth axis points from the centre
//                  line to the route. (The core's SupportEdge says the same: a
//                  stem lying along a route rests on the side of the axis that
//                  the route is on.) Exact for every lattice, eave, ring and
//                  meridian member of the reference Bowers, and for the planted
//                  legs of the vault's ribs.
//   2. neighbours  Where a member carries no route but other members already
//                  turned by rule 1 meet or cross it (the lattice riding on a
//                  rib), it takes its lean from the nearest of them.
//   3. its plane   Between and beyond those places, a curved member is an arch
//                  lying in a plane. Its depth axis is in that plane, on the
//                  convex side, leaning out of it by whatever rules 1 and 2
//                  found nearest. With nothing found, it does not lean.
//   4. upright     A member read from a design file has its routes on its own
//                  centre line, and the core lays a stem on its upper face:
//                  the face that looks up, squared to the member's line. The
//                  viewer turns the section the same way, by the core's own
//                  rule, so that what is drawn is what the stems rest on. A
//                  member with nothing else to go on is turned this way too.
//
// This is an inference. It is reported per member (`source`) so that it can be
// seen, and replaced when the core carries section orientation itself.
import * as THREE from 'three';
import { type Bower, type Polyline, type StructuralMember, type Vec3, vec } from '@horti/core';

const V3 = THREE.Vector3;

/** Core frame (x east, y north, z up) to three.js (y up): (x, y, z) -> (x, z, -y). */
export function toThree(p: Vec3, out: THREE.Vector3 = new V3()): THREE.Vector3 {
  return out.set(p.x, p.z, -p.y);
}

/** How a member's section was turned: wholly by its routes, with help from its neighbours, by its own plane alone, or upper face up. */
export type FrameSource = 'hosted_routes' | 'neighbours' | 'own_plane' | 'upright';

export interface MemberFrames {
  /** Centre line of the section. */
  C: THREE.Vector3[];
  /** Unit depth axis: towards the outer face, where plants lie. */
  N: THREE.Vector3[];
  /** Unit width axis. */
  B: THREE.Vector3[];
  source: FrameSource;
}

const RULES = {
  /** A route point counts as abreast of a centre-line point if it is no farther along the member than this, m. */
  abreastM: 0.06,
  /** ...and no farther out than this many section depths (a route may ride over a beam laid on the member). */
  reachDepths: 1.6,
  /** A neighbour lends its lean from no farther than this, m. */
  neighbourM: 0.5,
} as const;

function tangents(C: readonly THREE.Vector3[]): THREE.Vector3[] {
  const n = C.length;
  return C.map((_, i) => new V3().subVectors(C[Math.min(n - 1, i + 1)]!, C[Math.max(0, i - 1)]!).normalize());
}

const _ab = new V3();
const _ap = new V3();
/** Nearest point to `p` on the segment a-b. */
function nearestOnSegment(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  _ab.subVectors(b, a);
  const l2 = _ab.lengthSq();
  const t = l2 > 0 ? THREE.MathUtils.clamp(_ap.subVectors(p, a).dot(_ab) / l2, 0, 1) : 0;
  return out.copy(a).addScaledVector(_ab, t);
}

type Known = (THREE.Vector3 | null)[];

/**
 * The upper face of a member whose routes run on its centre line: up, squared
 * to the member's line; for an upright member, where "up" says nothing, the
 * same arbitrary side the core picks (frames() in sim/stem-path.ts).
 */
function upperFace(t: THREE.Vector3): THREE.Vector3 {
  const v = new V3(0, 1, 0).addScaledVector(t, -t.y);
  if (v.length() > 1e-6) return v.normalize();
  const d = vec.anyPerpendicular(vec.v3(t.x, -t.z, t.y));
  return new V3(d.x, d.z, -d.y);
}

/**
 * Rule 1: the depth axis wherever a hosted route runs abreast of the centre
 * line and clear of it. `onAxis` is set where a route runs on the centre line
 * itself, which is how a member read from a design file carries its routes.
 */
function fromRoutes(C: readonly THREE.Vector3[], T: readonly THREE.Vector3[], routes: readonly THREE.Vector3[][], depthM: number, onAxis: boolean[]): Known {
  const q = new V3();
  const best = new V3();
  return C.map((c, i) => {
    let d2 = Infinity;
    for (const r of routes) {
      for (let k = 0; k + 1 < r.length; k++) {
        nearestOnSegment(c, r[k]!, r[k + 1]!, q);
        const d = q.distanceToSquared(c);
        if (d < d2) {
          d2 = d;
          best.copy(q);
        }
      }
    }
    if (!Number.isFinite(d2)) return null;
    const v = best.clone().sub(c);
    const along = v.dot(T[i]!);
    v.addScaledVector(T[i]!, -along);
    const out = v.length();
    if (Math.abs(along) > RULES.abreastM) return null;
    if (out <= 1e-4) {
      onAxis[i] = true;
      return null;
    }
    return out <= RULES.reachDepths * depthM ? v.normalize() : null;
  });
}

/** The in-plane frame of a curved member: unit normals on the convex side, or null if it is straight or not planar. */
function ownPlane(C: readonly THREE.Vector3[], T: readonly THREE.Vector3[]): THREE.Vector3[] | null {
  const n = C.length;
  const centroid = new V3();
  for (const p of C) centroid.add(p);
  centroid.multiplyScalar(1 / n);
  // twice the vector area swept from the centroid: normal to the curve's plane
  const area = new V3();
  const a = new V3();
  const b = new V3();
  let length = 0;
  for (let i = 0; i + 1 < n; i++) {
    a.subVectors(C[i]!, centroid);
    b.subVectors(C[i + 1]!, centroid);
    area.add(a.clone().cross(b));
    length += C[i]!.distanceTo(C[i + 1]!);
  }
  if (area.length() < 2e-3 * length * length) return null; // too straight to define a plane
  const plane = area.normalize();
  for (const p of C) if (Math.abs(a.subVectors(p, centroid).dot(plane)) > 0.03 * length) return null; // not an arch
  const N = T.map((t) => new V3().crossVectors(plane, t).normalize());
  // one sign for the whole member: the convex side faces away from the centroid
  let side = 0;
  for (let i = 0; i < n; i++) side += N[i]!.dot(a.subVectors(C[i]!, centroid));
  if (side < 0) for (const v of N) v.negate();
  return N;
}

/** The route curves hosted on each member, keyed by member id. */
export function hostedRoutes(bower: Bower): Map<string, Polyline[]> {
  const out = new Map<string, Polyline[]>();
  for (const e of bower.graph.edges.values()) {
    if (e.host.type !== 'member') continue;
    const list = out.get(e.host.id);
    if (list) list.push(e.curve);
    else out.set(e.host.id, [e.curve]);
  }
  return out;
}

const depthOf = (m: StructuralMember): number => (m.section.shape === 'rect' ? m.section.depthMm : m.section.diameterMm) / 1000;

/** Section frames for every member of a Bower, keyed by member id. */
export function bowerFrames(bower: Bower): Map<string, MemberFrames> {
  const routes = hostedRoutes(bower);
  const work = bower.members.map((member) => {
    const C = member.curve.points.map((p) => toThree(p));
    const T = tangents(C);
    const hosted = (routes.get(member.id) ?? []).map((r) => r.points.map((p) => toThree(p)));
    const onAxis: boolean[] = C.map(() => false);
    const known = fromRoutes(C, T, hosted, depthOf(member), onAxis);
    const byRoutes = known.filter(Boolean).length;
    // routes on the centre line and none clear of it: a member from a design file
    return { member, C, T, known, byRoutes, imported: byRoutes === 0 && onAxis.some(Boolean) };
  });

  // rule 2: what rule 1 found, as a cloud of oriented points other members may borrow from
  const cloud: { p: THREE.Vector3; n: THREE.Vector3; id: string }[] = [];
  for (const w of work) w.known.forEach((n, i) => n && cloud.push({ p: w.C[i]!, n, id: w.member.id }));
  const reach2 = RULES.neighbourM ** 2;

  const out = new Map<string, MemberFrames>();
  for (const w of work) {
    const { member, C, T, known } = w;
    const n = C.length;
    let source: FrameSource = 'hosted_routes';
    if (w.imported) {
      source = 'upright';
      for (let i = 0; i < n; i++) known[i] = upperFace(T[i]!);
    } else if (w.byRoutes < n) {
      for (let i = 0; i < n; i++) {
        if (known[i]) continue;
        let best: THREE.Vector3 | null = null;
        let d2 = reach2;
        for (const c of cloud) {
          if (c.id === member.id) continue;
          const d = c.p.distanceToSquared(C[i]!);
          if (d < d2) {
            d2 = d;
            best = c.n;
          }
        }
        if (!best) continue;
        // only the lean is borrowed: the neighbour's axis, squared up to this member's own line
        const v = best.clone().addScaledVector(T[i]!, -best.dot(T[i]!));
        if (v.length() > 0.5) known[i] = v.normalize();
      }
      // rule 3 or 4 gives the base frame; what is known leans it, and the lean is carried across the gaps
      const plane = ownPlane(C, T);
      const base = plane ?? T.map(upperFace);
      const lean: (number | null)[] = known.map((k, i) => (k ? Math.atan2(k.dot(new V3().crossVectors(T[i]!, base[i]!)), k.dot(base[i]!)) : null));
      const firstKnown = lean.findIndex((l) => l !== null);
      if (firstKnown < 0) {
        source = plane ? 'own_plane' : 'upright';
        for (let i = 0; i < n; i++) known[i] = base[i]!;
      } else {
        source = 'neighbours';
        let before = firstKnown;
        for (let i = 0; i < n; i++) {
          if (lean[i] !== null) {
            before = i;
            continue;
          }
          let after = i;
          while (after < n && lean[after] === null) after++;
          const a = lean[before]!;
          const b = after < n ? lean[after]! : a;
          const t = after < n && after > before ? (i - before) / (after - before) : 0;
          const phi = i < firstKnown ? lean[firstKnown]! : a + (b - a) * t;
          const across = new V3().crossVectors(T[i]!, base[i]!);
          known[i] = base[i]!.clone().multiplyScalar(Math.cos(phi)).addScaledVector(across, Math.sin(phi)).normalize();
        }
      }
    }
    const N = known as THREE.Vector3[];
    const B = N.map((nrm, i) => new V3().crossVectors(T[i]!, nrm).normalize());
    out.set(member.id, { C, N, B, source });
  }
  return out;
}
