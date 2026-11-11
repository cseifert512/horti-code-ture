import { describe, expect, it } from 'vitest';
import { makeHemisphereBower } from '../src/bower/hemisphere.ts';
import type { SupportEdge } from '../src/bower/types.ts';
import { makeVaultBower } from '../src/bower/vault.ts';
import { add, distance, length, scale } from '../src/math/vec3.ts';
import { liePath, pathAt, pathLength, turnsOf, twinePath } from '../src/sim/stem-path.ts';

const vault = makeVaultBower();
const dome = makeHemisphereBower();
const get = (id: string): SupportEdge => {
  const e = vault.graph.edges.get(id) ?? dome.graph.edges.get(id);
  if (!e) throw new Error(`no edge ${id}`);
  return e;
};
const leg = get('L.0.leg');
const cable = get('C.8.2-8.4');
const diagonal = get('T.6.2-7.3');
const twine = { minPitchM: 0.3, pitchPerCircumference: 1.46 };

/** Distance from a point to the nearest sampled point of the edge's centre line. */
function clearOfAxis(edge: SupportEdge, p: { x: number; y: number; z: number }): number {
  let best = Infinity;
  const n = Math.ceil(edge.axis.length / 0.005);
  for (let i = 0; i <= n; i++) best = Math.min(best, distance(p, edge.axis.pointAt((i / n) * edge.axis.length)));
  return best;
}

// CONSTRAINTS_AND_PHENOLOGY.md section 2: handedness as helix chirality.
describe('twining', () => {
  it('winds a right-handed taxon one way and a left-handed taxon the other', () => {
    for (const edge of [leg, cable, diagonal]) {
      expect(turnsOf(twinePath(edge, { ...twine, handedness: 'right_handed' })), edge.id).toBeGreaterThan(0.9);
      expect(turnsOf(twinePath(edge, { ...twine, handedness: 'left_handed' })), edge.id).toBeLessThan(-0.9);
    }
  });

  it('keeps its handedness whichever way along the support the stem travels', () => {
    for (const edge of [leg, cable]) {
      expect(turnsOf(twinePath(edge, { ...twine, handedness: 'right_handed', reverse: true })), edge.id).toBeGreaterThan(0.9);
      expect(turnsOf(twinePath(edge, { ...twine, handedness: 'left_handed', reverse: true })), edge.id).toBeLessThan(-0.9);
    }
  });

  it('makes a whole number of turns, so the stem arrives back on the route line', () => {
    for (const edge of [leg, cable, diagonal]) {
      const t = turnsOf(twinePath(edge, { ...twine, handedness: 'right_handed' }));
      // measured in the world frame, so a member that curves along its length adds a few degrees of its own
      expect(Math.abs(t - Math.round(t)), edge.id).toBeLessThan(0.05);
    }
  });

  it('coils a slender cable two or three times a span and a stout rib leg about once a metre', () => {
    expect(Math.round(turnsOf(twinePath(cable, { ...twine, handedness: 'right_handed' })))).toBeGreaterThanOrEqual(2);
    expect(Math.round(turnsOf(twinePath(cable, { ...twine, handedness: 'right_handed' })))).toBeLessThanOrEqual(3);
    const legTurns = Math.round(turnsOf(twinePath(leg, { ...twine, handedness: 'right_handed' })));
    expect(leg.axis.length / legTurns).toBeGreaterThan(0.6);
    expect(leg.axis.length / legTurns).toBeLessThan(1.1);
  });

  it('uses more stem than the route is long', () => {
    const path = twinePath(leg, { ...twine, handedness: 'right_handed' });
    expect(pathLength(path)).toBeGreaterThan(leg.axis.length * 1.1);
  });

  it('stays on the surface of what it winds round, never inside it', () => {
    const rib = twinePath(leg, { ...twine, handedness: 'right_handed' });
    for (const p of rib.points) expect(clearOfAxis(leg, p)).toBeGreaterThan(0.049); // half the 100 mm width
    const wire = twinePath(cable, { ...twine, handedness: 'right_handed' });
    // the ramp points at each end sit on top of the lattice node, not on the wire
    for (const p of wire.points.slice(1, -1)) expect(clearOfAxis(cable, p)).toBeGreaterThan(0.0024);
  });

  it('starts and ends where the route does', () => {
    for (const edge of [cable, diagonal]) {
      const path = twinePath(edge, { ...twine, handedness: 'right_handed' });
      expect(distance(path.points[0]!, edge.curve.start), edge.id).toBeLessThan(0.03);
      expect(distance(path.points[path.points.length - 1]!, edge.curve.end), edge.id).toBeLessThan(0.03);
    }
  });
});

describe('lying along a member', () => {
  it('rests on the route line with the support beneath', () => {
    const path = liePath(diagonal);
    expect(pathLength(path)).toBeCloseTo(diagonal.curve.length, 2);
    for (let i = 0; i < path.points.length; i++) {
      // stepping against the away-direction goes into the timber, towards its centre line
      const into = add(path.points[i]!, scale(path.away[i]!, -0.03));
      expect(clearOfAxis(diagonal, into)).toBeLessThan(clearOfAxis(diagonal, path.points[i]!));
      expect(length(path.away[i]!)).toBeCloseTo(1, 6);
    }
  });

  it('points away from the centre of a dome', () => {
    const rib = get('m0.l3-l4');
    const path = liePath(rib);
    for (let i = 0; i < path.points.length; i++) {
      const p = path.points[i]!;
      expect(length(p)).toBeCloseTo(7.5, 3);
      const outward = scale(p, 1 / length(p));
      expect(path.away[i]!.x * outward.x + path.away[i]!.y * outward.y + path.away[i]!.z * outward.z).toBeGreaterThan(0.99);
    }
  });

  it('can be shifted sideways for a second stem on the same member', () => {
    const a = liePath(diagonal);
    const b = liePath(diagonal, { sideOffsetM: 0.02 });
    for (let i = 0; i < a.points.length; i++) expect(distance(a.points[i]!, b.points[i]!)).toBeCloseTo(0.02, 6);
  });

  it('runs the other way when reversed', () => {
    const fwd = liePath(diagonal);
    const back = liePath(diagonal, { reverse: true });
    expect(distance(fwd.points[0]!, back.points[back.points.length - 1]!)).toBeLessThan(1e-9);
  });
});

describe('walking a path', () => {
  it('interpolates by stem length and clamps at the ends', () => {
    const path = liePath(diagonal);
    const total = pathLength(path);
    expect(distance(pathAt(path, 0).p, path.points[0]!)).toBe(0);
    expect(distance(pathAt(path, total + 5).p, path.points[path.points.length - 1]!)).toBeLessThan(1e-9);
    const mid = pathAt(path, total / 2);
    expect(distance(mid.p, diagonal.curve.pointAt(diagonal.curve.length / 2))).toBeLessThan(0.01);
    expect(length(mid.away)).toBeCloseTo(1, 6);
  });
});
