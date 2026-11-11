// Section frames for timber members.
//
// The core describes a member by its centre line and the size of its section,
// but not by which way the section is turned. To sweep a rectangle along the
// line the viewer has to know the depth axis at every point, so it infers it,
// in this order:
//
//   1. hosted_routes  Where plant routes are hosted on the member along (nearly)
//                     its whole length, the routes lie on its outer face, so the
//                     depth axis points from the centre line to the route. This
//                     is exact for the lattice, eave, ring and meridian members
//                     of both reference Bowers.
//   2. own_plane      A curved member with no routes (an unplanted rib) is an
//                     arch lying in a plane: its depth axis is in that plane,
//                     pointing to the convex side, and its width is across it.
//   3. outward        Anything else is turned to face away from the middle of
//                     the Bower.
//
// This is an inference, and it is reported per member so that it can be seen
// and replaced when the core carries the orientation itself.
import * as THREE from 'three';
import type { Bower, Polyline, StructuralMember, Vec3 } from '@horti/core';

const V3 = THREE.Vector3;

/** Core frame (x east, y north, z up) to three.js (y up): (x, y, z) -> (x, z, -y). */
export function toThree(p: Vec3, out: THREE.Vector3 = new V3()): THREE.Vector3 {
  return out.set(p.x, p.z, -p.y);
}

export type FrameSource = 'hosted_routes' | 'own_plane' | 'outward';

export interface MemberFrames {
  /** Centre line of the section. */
  C: THREE.Vector3[];
  /** Unit depth axis: towards the outer face, where plants lie. */
  N: THREE.Vector3[];
  /** Unit width axis. */
  B: THREE.Vector3[];
  source: FrameSource;
}

/** Share of a member's length that must carry routes before they are trusted to orient it. */
const ROUTE_COVERAGE = 0.9;

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

function fromRoutes(C: readonly THREE.Vector3[], T: readonly THREE.Vector3[], routes: readonly THREE.Vector3[][]): THREE.Vector3[] | null {
  const q = new V3();
  const best = new V3();
  const N: (THREE.Vector3 | null)[] = [];
  let found = 0;
  for (let i = 0; i < C.length; i++) {
    let d2 = Infinity;
    for (const r of routes) {
      for (let k = 0; k + 1 < r.length; k++) {
        nearestOnSegment(C[i]!, r[k]!, r[k + 1]!, q);
        const d = q.distanceToSquared(C[i]!);
        if (d < d2) {
          d2 = d;
          best.copy(q);
        }
      }
    }
    const v = best.clone().sub(C[i]!);
    v.addScaledVector(T[i]!, -v.dot(T[i]!));
    if (v.length() > 1e-4) {
      N.push(v.normalize());
      found++;
    } else N.push(null);
  }
  if (found === 0) return null;
  // a sample that sits on the route itself has no direction: borrow its neighbour's
  for (let i = 0; i < N.length; i++) {
    if (N[i]) continue;
    for (let k = 1; k < N.length && !N[i]; k++) {
      const c = N[i - k] ?? N[i + k];
      if (c) {
        const v = c.clone().addScaledVector(T[i]!, -c.dot(T[i]!));
        if (v.lengthSq() > 1e-8) N[i] = v.normalize();
      }
    }
  }
  return N.every(Boolean) ? (N as THREE.Vector3[]) : null;
}

function fromOwnPlane(C: readonly THREE.Vector3[], T: readonly THREE.Vector3[]): THREE.Vector3[] | null {
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
  // too straight to define a plane
  if (area.length() < 2e-3 * length * length) return null;
  const plane = area.normalize();
  // not planar enough to call an arch
  for (const p of C) if (Math.abs(a.subVectors(p, centroid).dot(plane)) > 0.03 * length) return null;
  const N = T.map((t) => new V3().crossVectors(plane, t).normalize());
  // one sign for the whole member: the convex side faces away from the centroid
  let side = 0;
  for (let i = 0; i < n; i++) side += N[i]!.dot(a.subVectors(C[i]!, centroid));
  if (side < 0) for (const v of N) v.negate();
  return N;
}

function outward(C: readonly THREE.Vector3[], T: readonly THREE.Vector3[], middle: THREE.Vector3): THREE.Vector3[] {
  return C.map((p, i) => {
    const t = T[i]!;
    const v = new V3().subVectors(p, middle);
    v.addScaledVector(t, -v.dot(t));
    if (v.lengthSq() < 1e-8) {
      v.set(0, 1, 0).addScaledVector(t, -t.y);
      if (v.lengthSq() < 1e-8) v.set(1, 0, 0).addScaledVector(t, -t.x);
    }
    return v.normalize();
  });
}

/** Centre of the box round every member, in the three.js frame. */
export function bowerMiddle(bower: Bower): THREE.Vector3 {
  const box = new THREE.Box3();
  const p = new V3();
  for (const m of bower.members) for (const q of m.curve.points) box.expandByPoint(toThree(q, p));
  return box.isEmpty() ? new V3() : box.getCenter(new V3());
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

export function memberFrames(member: StructuralMember, routes: readonly Polyline[], middle: THREE.Vector3): MemberFrames {
  const C = member.curve.points.map((p) => toThree(p));
  const T = tangents(C);
  let N: THREE.Vector3[] | null = null;
  let source: FrameSource = 'outward';

  const covered = routes.reduce((s, r) => s + r.length, 0);
  if (covered >= ROUTE_COVERAGE * member.curve.length) {
    N = fromRoutes(
      C,
      T,
      routes.map((r) => r.points.map((p) => toThree(p))),
    );
    if (N) source = 'hosted_routes';
  }
  if (!N) {
    N = fromOwnPlane(C, T);
    if (N) source = 'own_plane';
  }
  N ??= outward(C, T, middle);
  const B = N.map((n, i) => new V3().crossVectors(T[i]!, n).normalize());
  return { C, N, B, source };
}
