import { describe, expect, it } from 'vitest';
import { makeHemisphereBower, makeVaultBower } from '@horti/core';
import { edgeDistances, materials, reachView, routeInfo, stationField } from '../src/overlay/model.ts';

// KEY.md section 4: "measured path length is not the same as vertical height".
// SIMULATION_KEY.md section 9, "Hemisphere route": the crown of a 15 m hemisphere
// is 7.5 m up and pi * 7.5 / 2 = 11.78 m away by route.
describe('design overlay on the 15 m hemisphere', () => {
  const dome = makeHemisphereBower();
  const field = stationField(dome, 'station.0');

  it('names the crown as the highest node, 7.5 m up and 11.78 m away by route', () => {
    expect(field.summit.nodeId).toBe('crown');
    expect(field.summit.heightM).toBeCloseTo(7.5, 6);
    expect(field.summit.route?.length).toBeCloseTo((Math.PI * 7.5) / 2, 2);
  });

  it('shows that a 7.5 m budget does not reach the 7.5 m crown', () => {
    const view = reachView(dome, field, 7.5);
    expect(view.summitReached).toBe(false);
    expect(view.marginM).toBeCloseTo(7.5 - (Math.PI * 7.5) / 2, 2);
    expect(view.report.highestReachedM).toBeLessThan(7.5);
    expect(view.report.nodesReached).toBeLessThan(view.report.nodesTotal);
  });

  it('shows that about 11.8 m does', () => {
    const view = reachView(dome, field, 11.8);
    expect(view.summitReached).toBe(true);
    expect(view.marginM).toBeGreaterThan(0);
    expect(view.report.highestReachedM).toBeCloseTo(7.5, 6);
  });

  it('reaches the crown with a budget of exactly the route length', () => {
    expect(reachView(dome, field, field.summit.route!.length).summitReached).toBe(true);
  });

  it('measures every node from the station, with no budget, for the colour scale', () => {
    expect(field.distanceByNode.size).toBe(dome.graph.nodes.size);
    expect(field.farthestM).toBeGreaterThan(field.summit.route!.length);
  });

  it('lets a budget run out part of the way along a route', () => {
    // the last stretch of the meridian to the crown
    const edge = dome.graph.edges.get(field.summit.route!.edges.at(-1)!)!;
    const { from, to } = edgeDistances(field, edge);
    const info = routeInfo(field, edge);
    expect(Math.abs(from - to)).toBeCloseTo(edge.curve.length, 6);
    expect(info.nearM).toBeLessThan(11.5);
    expect(info.farM).toBeCloseTo(field.summit.route!.length, 6);
    expect(info.kind).toBe('timber');
    expect(info.gripDiameterMm).toBeCloseTo(edge.gripDiameterMm, 6);
  });
});

describe('design overlay on the vault', () => {
  const vault = makeVaultBower();

  it('finds a highest node that is farther by route than it is high, from either station', () => {
    for (const station of vault.rootStations) {
      const field = stationField(vault, station.id);
      expect(field.summit.route).not.toBeNull();
      expect(field.summit.route!.length).toBeGreaterThan(field.summit.heightM);
      expect(reachView(vault, field, field.summit.heightM).summitReached).toBe(false);
    }
  });

  // KEY.md section 5: visible steel is a cost to be reported.
  it('reports the materials the core reports', () => {
    const m = materials(vault);
    expect(m.primaryTimberM).toBeGreaterThan(0);
    expect(m.subLatticeTimberM).toBeGreaterThan(0);
    expect(m.steelCableM).toBeCloseTo(Number(vault.facts['steelCableM']), 1);
    expect(m.steelShareOfRoute).toBeGreaterThan(0);
    expect(m.steelShareOfRoute).toBeLessThan(0.5);
  });
});
