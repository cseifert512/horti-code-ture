import { describe, expect, it } from 'vitest';
import { makeHemisphereBower } from '../src/bower/hemisphere.ts';
import { analyseReach, shortestRoute } from '../src/bower/reach.ts';
import { equivalentDiameterMm } from '../src/bower/types.ts';

// SIMULATION_KEY.md section 9, "Hemisphere route"; DEVELOPMENT_GUIDE.md stage 5 exit check.
describe('15 m hemispherical reference shell', () => {
  const ideal = makeHemisphereBower({ diameterM: 15, standoffM: 0 });

  it('has a crown 7.5 m up', () => {
    expect(ideal.graph.nodes.get('crown')!.position.z).toBeCloseTo(7.5, 6);
  });

  it('needs about 11.78 m of route to reach the crown, not 7.5 m', () => {
    const route = shortestRoute(ideal, 'station.0', 'crown');
    expect(route).not.toBeNull();
    expect(route!.length).toBeCloseTo((Math.PI * 7.5) / 2, 2);
    expect(route!.length).toBeGreaterThan(11.77);
    expect(route!.length).toBeLessThan(11.79);
  });

  it('does not let a plant with 7.5 m of route reach the crown', () => {
    const r = analyseReach(ideal, 'station.0', 7.5);
    expect(r.distanceByNode.has('crown')).toBe(false);
    expect(r.highestNodeM).toBeCloseTo(7.5, 6);
    // 7.5 m of route along a meridian ends below 6.4 m; the last node passed is lower still
    expect(r.highestReachedM).toBeLessThan(6.4);
    expect(r.nodesReached).toBeLessThan(r.nodesTotal);
  });

  it('does not let a 4 m clematis cover the crown', () => {
    const r = analyseReach(ideal, 'station.0', 4);
    expect(r.distanceByNode.has('crown')).toBe(false);
    expect(r.highestReachedM).toBeLessThan(4);
    expect(r.routeReachedM / r.routeTotalM).toBeLessThan(0.05);
  });

  it('makes real routes longer than the ideal surface once supports stand off the timber', () => {
    const real = makeHemisphereBower({ diameterM: 15, standoffM: 0.1 });
    const route = shortestRoute(real, 'station.0', 'crown')!;
    expect(route.length).toBeGreaterThan((Math.PI * 7.5) / 2);
    expect(route.length).toBeCloseTo((Math.PI * 7.6) / 2, 2);
  });

  it('keeps primary timber out of the climbing graph', () => {
    for (const m of ideal.members) expect(m.contact).toBe('prohibited');
    for (const e of ideal.graph.edges.values()) {
      expect(e.host.type).toBe('support');
      expect(e.contact).toBe('permitted');
    }
  });

  it('cannot reach anything when every route is forbidden', () => {
    const r = analyseReach(ideal, 'station.0', 100, () => false);
    expect(r.nodesReached).toBe(1); // only the entry node at the plant's feet
    expect(shortestRoute(ideal, 'station.0', 'crown', () => false)).toBeNull();
  });
});

describe('sections as a twiner meets them', () => {
  it('treats a 100 x 180 mm rib as a 178 mm post', () => {
    expect(equivalentDiameterMm({ shape: 'rect', widthMm: 100, depthMm: 180 })).toBeCloseTo(178.25, 1);
    expect(equivalentDiameterMm({ shape: 'round', diameterMm: 5 })).toBe(5);
  });
});
