import { describe, expect, it } from 'vitest';
import { makeHemisphereBower } from '../src/bower/hemisphere.ts';
import { analyseReach, shortestRoute } from '../src/bower/reach.ts';
import { equivalentDiameterMm, materialSummary } from '../src/bower/types.ts';

// SIMULATION_KEY.md section 9, "Hemisphere route"; DEVELOPMENT_GUIDE.md stage 5 exit check.
describe('15 m hemispherical reference shell', () => {
  const dome = makeHemisphereBower({ diameterM: 15 });

  it('has a crown 7.5 m up', () => {
    expect(dome.graph.nodes.get('crown')!.position.z).toBeCloseTo(7.5, 6);
  });

  it('needs about 11.78 m of route to reach the crown, not 7.5 m', () => {
    const route = shortestRoute(dome, 'station.0', 'crown');
    expect(route).not.toBeNull();
    expect(route!.length).toBeCloseTo((Math.PI * 7.5) / 2, 2);
    expect(route!.length).toBeGreaterThan(11.77);
    expect(route!.length).toBeLessThan(11.79);
  });

  it('does not let a plant with 7.5 m of route reach the crown', () => {
    const r = analyseReach(dome, 'station.0', 7.5);
    expect(r.distanceByNode.has('crown')).toBe(false);
    expect(r.highestNodeM).toBeCloseTo(7.5, 6);
    // 7.5 m of route along a meridian ends below 6.4 m; the last node passed is lower still
    expect(r.highestReachedM).toBeLessThan(6.4);
    expect(r.nodesReached).toBeLessThan(r.nodesTotal);
  });

  it('does not let a 4 m clematis cover the crown', () => {
    const r = analyseReach(dome, 'station.0', 4);
    expect(r.distanceByNode.has('crown')).toBe(false);
    expect(r.highestReachedM).toBeLessThan(4);
    expect(r.routeReachedM / r.routeTotalM).toBeLessThan(0.05);
  });

  it('cannot reach anything when every route is refused', () => {
    const r = analyseReach(dome, 'station.0', 100, () => false);
    expect(r.nodesReached).toBe(1); // only the entry node at the plant's feet
    expect(shortestRoute(dome, 'station.0', 'crown', () => false)).toBeNull();
  });
});

// KEY.md section 5: the timber is the growing surface; steel is kept to slender cables.
describe('the structure is the growing surface', () => {
  const dome = makeHemisphereBower({ diameterM: 15 });

  it('declares nothing off-limits: every member and cable may be grown on', () => {
    for (const m of dome.members) expect(m.contact, m.id).toBe('permitted');
    for (const s of dome.supports) expect(s.contact, s.id).toBe('permitted');
    for (const e of dome.graph.edges.values()) expect(e.contact, e.id).toBe('permitted');
  });

  it('leads to the crown on glulam alone', () => {
    const route = shortestRoute(dome, 'station.0', 'crown', (e) => e.kind === 'timber')!;
    expect(route.length).toBeCloseTo((Math.PI * 7.5) / 2, 2);
    for (const id of route.edges) expect(dome.graph.edges.get(id)!.host.type).toBe('member');
  });

  it('distinguishes primary glulam from the lighter timber sub-lattice', () => {
    expect(dome.members.filter((m) => m.tier === 'primary').every((m) => m.role === 'meridian')).toBe(true);
    expect(dome.members.filter((m) => m.tier === 'sub_lattice').every((m) => m.role === 'ring')).toBe(true);
    expect(dome.members.some((m) => m.tier === 'sub_lattice')).toBe(true);
  });

  it('uses steel only as slender cables, and reports how much', () => {
    for (const s of dome.supports) {
      expect(s.kind).toBe('cable');
      expect(s.diameterMm).toBeLessThanOrEqual(8);
    }
    const mat = materialSummary(dome);
    expect(mat.steelCableM).toBeGreaterThan(0);
    expect(mat.steelShareOfRoute).toBeGreaterThan(0);
    expect(mat.steelShareOfRoute).toBeLessThan(0.5);
    expect(dome.facts.steelCableM).toBeCloseTo(mat.steelCableM, 0);
  });

  it('can be built with no steel at all', () => {
    const allTimber = makeHemisphereBower({ diameterM: 15, cableRingsPerBand: 0 });
    expect(allTimber.supports.length).toBe(0);
    expect(materialSummary(allTimber).steelShareOfRoute).toBe(0);
    expect(shortestRoute(allTimber, 'station.0', 'crown')!.length).toBeCloseTo((Math.PI * 7.5) / 2, 2);
  });
});

describe('sections as a twiner meets them', () => {
  it('treats a 100 x 180 mm rib as a 178 mm post', () => {
    expect(equivalentDiameterMm({ shape: 'rect', widthMm: 100, depthMm: 180 })).toBeCloseTo(178.25, 1);
    expect(equivalentDiameterMm({ shape: 'round', diameterMm: 5 })).toBe(5);
  });
});
