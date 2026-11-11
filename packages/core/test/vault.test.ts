import { describe, expect, it } from 'vitest';
import { analyseReach, shortestRoute } from '../src/bower/reach.ts';
import { makeVaultBower, vaultSurface } from '../src/bower/vault.ts';
import { zoneContains } from '../src/bower/types.ts';
import { v3 } from '../src/math/vec3.ts';

describe('barrel-vault segment rebuilt from the prototype', () => {
  const vault = makeVaultBower();
  const edges = [...vault.graph.edges.values()];
  const byPrefix = (p: string) => edges.filter((e) => e.id.startsWith(p));

  it('keeps the prototype lattice: 144 diagonals, 60 cable spans, 12 eave spans', () => {
    expect(byPrefix('T.').length).toBe(144);
    expect(byPrefix('C.').length).toBe(60);
    // two planted ribs meet the eaves between lattice nodes and split one span each
    expect(byPrefix('E.').length).toBe(14);
    expect(byPrefix('L.').length).toBe(4);
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
    for (const e of byPrefix('C.')) expect(e.curve.length).toBeLessThan(0.93);
    for (const e of byPrefix('T.')) expect(e.curve.length).toBeGreaterThan(0.5);
    for (const e of byPrefix('T.')) expect(e.curve.length).toBeLessThan(0.75);
  });

  it('puts every plant route on a secondary support and none on primary timber', () => {
    expect(vault.members.length).toBeGreaterThan(100);
    for (const m of vault.members) expect(m.contact, m.id).toBe('prohibited');
    for (const e of edges) {
      expect(e.host.type, e.id).toBe('support');
      expect(e.contact, e.id).toBe('permitted');
      expect(['rod', 'cable'], e.id).toContain(e.kind);
    }
    expect(vault.supports.length).toBe(edges.length);
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
