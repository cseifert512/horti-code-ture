import { describe, expect, it } from 'vitest';
import { analyseReach, shortestRoute } from '../src/bower/reach.ts';
import { materialSummary, zoneContains } from '../src/bower/types.ts';
import { makeVaultBower, vaultFootId, vaultSurface } from '../src/bower/vault.ts';
import { distance, v3 } from '../src/math/vec3.ts';

describe('barrel-vault segment from the prototype', () => {
  const vault = makeVaultBower();
  const edges = [...vault.graph.edges.values()];
  const byPrefix = (p: string) => edges.filter((e) => e.id.startsWith(p));

  it('keeps the prototype lattice: 144 diagonals, 60 cable spans, 12 eave spans', () => {
    expect(byPrefix('T.').length).toBe(144);
    expect(byPrefix('C.').length).toBe(60);
    // ribs 1 and 3 meet each eave between two lattice nodes and split one span each
    expect(byPrefix('E.').length).toBe(16);
  });

  // KEY.md section 5: the timber is the growing surface, and the ribs are the stoutest timber there is.
  it('makes every rib a route from one foot to the other', () => {
    expect(byPrefix('L.').length).toBe(10); // a leg at each end of five ribs
    expect(byPrefix('R.').length).toBe(32); // three ribs meet the lattice at seven nodes, two at eight
    for (let r = 0; r < 5; r++) {
      const along = edges.filter((e) => e.host.id === `rib.${r}`);
      const routeM = along.reduce((s, e) => s + e.axis.length, 0);
      const rib = vault.members.find((m) => m.id === `rib.${r}`)!;
      // the whole rib, less the few millimetres each foot stands in the ground
      expect(routeM / rib.curve.length, rib.id).toBeGreaterThan(0.97);
      expect(routeM / rib.curve.length, rib.id).toBeLessThan(1.01);
      expect(shortestRoute(vault, 'station.0', vaultFootId(r, 1)), rib.id).not.toBeNull();
    }
    // a stem on a rib lifts over the lattice where it crosses, and lies on the rib's face between
    const run = vault.graph.edges.get('R.2.8-10')!;
    const clear = (f: number) => distance(run.curve.pointAt(f * run.curve.length), run.axis.pointAt(f * run.axis.length));
    expect(clear(0)).toBeCloseTo(0.16, 2); // 90 mm to the rib's face and 70 mm of diagonal on it
    expect(clear(0.5)).toBeCloseTo(0.09, 2);
    expect(clear(1)).toBeCloseTo(0.16, 2);
  });

  it('reproduces the prototype dimensions', () => {
    const crown = vaultSurface(0.5, 0.5);
    expect(crown.z).toBeCloseTo(3.2, 6);
    expect(Math.abs(crown.x)).toBeLessThan(1e-9);
    // feet 2.1 m either side of the centre line at mid-length
    expect(vaultSurface(0, 0.5).x).toBeCloseTo(-2.1, 6);
    expect(vaultSurface(1, 0.5).x).toBeCloseTo(2.1, 6);
    // the vault runs north-south, 5.2 m long
    expect(vaultSurface(0.5, 0).y - vaultSurface(0.5, 1).y).toBeCloseTo(5.2, 6);
    // spans measured on the prototype by scripts/assumptions.mjs
    for (const e of byPrefix('C.')) expect(e.curve.length).toBeGreaterThan(0.85);
    for (const e of byPrefix('C.')) expect(e.curve.length).toBeLessThan(0.95);
    for (const e of byPrefix('T.')) expect(e.curve.length).toBeGreaterThan(0.5);
    for (const e of byPrefix('T.')) expect(e.curve.length).toBeLessThan(0.7);
  });

  it('lets a plant at either station reach the whole canopy, given enough route', () => {
    for (const s of vault.rootStations) {
      const r = analyseReach(vault, s.id, 1000);
      expect(r.nodesReached, s.id).toBe(r.nodesTotal);
    }
  });

  it('needs more route than height to reach the crown', () => {
    const crownNodes = [...vault.graph.nodes.values()].filter((n) => n.id.startsWith('n10.'));
    expect(crownNodes.length).toBeGreaterThan(0);
    for (const n of crownNodes) {
      const route = shortestRoute(vault, 'station.0', n.id)!;
      expect(route.length, n.id).toBeGreaterThan(n.position.z * 1.25);
      // the prototype measured 4.42 m foot-to-crown straight up the rib surface; real routes zigzag
      expect(route.length, n.id).toBeGreaterThan(4.42);
    }
  });

  it('declares the walk beneath as a headroom zone', () => {
    const z = vault.zones.find((q) => q.kind === 'headroom')!;
    expect(zoneContains(z, v3(0, 0, 1.8))).toBe(true);
    expect(zoneContains(z, v3(0, 0, 2.5))).toBe(false);
    expect(zoneContains(z, v3(2.0, 0, 1.8))).toBe(false);
  });
});

// KEY.md section 5: the timber is the growing surface; steel is kept to slender cables.
describe('the vault is the growing surface', () => {
  const vault = makeVaultBower();
  const edges = [...vault.graph.edges.values()];

  it('declares nothing off-limits', () => {
    for (const m of vault.members) expect(m.contact, m.id).toBe('permitted');
    for (const e of edges) expect(e.contact, e.id).toBe('permitted');
  });

  it('starts every plant up a glulam rib leg, as a 178 mm post', () => {
    for (const s of vault.rootStations) {
      const leg = vault.graph.edgesAt(s.entryNodeIds[0]!);
      expect(leg.length).toBe(1);
      expect(leg[0]!.kind).toBe('timber');
      expect(leg[0]!.host.id.startsWith('rib.')).toBe(true);
      expect(leg[0]!.gripDiameterMm).toBeCloseTo(178, 0);
    }
  });

  it('has glulam ribs as primary structure and the larch lattice as timber sub-lattice', () => {
    const primary = vault.members.filter((m) => m.tier === 'primary');
    expect(primary.length).toBe(5);
    expect(primary.every((m) => m.role === 'rib' && m.material === 'glulam')).toBe(true);
    expect(vault.members.filter((m) => m.tier === 'sub_lattice').length).toBe(146); // 144 diagrid pieces + 2 eaves
  });

  it('puts most plant route on timber and reports the steel', () => {
    const mat = materialSummary(vault);
    expect(mat.routeOnTimberM).toBeGreaterThan(mat.routeOnCableM);
    // 60 spans of about 0.8 m of actual cable
    expect(mat.steelCableM).toBeGreaterThan(40);
    expect(mat.steelCableM).toBeLessThan(55);
    // a little over a quarter of the route, now that the ribs are counted as the route they are
    expect(mat.steelShareOfRoute).toBeGreaterThan(0.22);
    expect(mat.steelShareOfRoute).toBeLessThan(0.33);
  });

  it('contains no steel but slender cables: no rods, rails or frames', () => {
    expect(vault.supports.length).toBe(60);
    for (const s of vault.supports) {
      expect(s.kind).toBe('cable');
      expect(s.diameterMm).toBe(5);
    }
    for (const e of edges) expect(['timber', 'cable']).toContain(e.kind);
  });
});
