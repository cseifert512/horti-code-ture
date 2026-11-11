import { describe, expect, it } from 'vitest';
import { REFERENCE_PALETTE, leafState, makeHemisphereBower, makeVaultBower, seasonsOf } from '@horti/core';
import { loadLooks, lookFor } from '../src/plant/registry.ts';
import { canGrow, growScenario, growable } from '../src/plant/scenario.ts';
import { PlantView } from '../src/plant/view.ts';
import { camera as makeCamera, materials } from './helpers.ts';

await loadLooks();
const camera = makeCamera();

// What each organ model must be is tested in looks.test.ts. Here: the engine's
// scenarios, drawn with the looks of the taxa that are in them.
describe('the taxa the engine grows', () => {
  it('has a growth model that the core accepts for every taxon with one', () => {
    expect(growable().size).toBeGreaterThanOrEqual(16);
  });
});

describe('the mixed planting', () => {
  it('is offered on the vault only', () => {
    expect(canGrow('mixed', 'vault')).toBe(true);
    expect(canGrow('mixed', 'hemisphere')).toBe(false);
    expect(canGrow('wisteria', 'hemisphere')).toBe(true);
    expect(() => growScenario('mixed', 'hemisphere', 'trained', 1)).toThrow();
  });

  const run = growScenario('mixed', 'vault', 'trained', 4);

  it('comes with the Bower it was grown on, which has more root stations than the default vault', () => {
    expect(run.bower.rootStations.length).toBeGreaterThan(makeVaultBower().rootStations.length);
    const stations = new Set(run.bower.rootStations.map((s) => s.id));
    for (const p of run.data.plants) expect(stations.has(p.stationId)).toBe(true);
  });

  it('draws every plant with models of its own taxon', () => {
    const view = new PlantView(run.data, materials());
    expect(view.provisionalLooks).toEqual([]);
    expect(view.withoutFlowers).toEqual([]);
    view.dispose();
  });

  // TAXON_LOOKS.md, "Wood": the stems of each taxon are a mesh of their own, in that taxon's bark.
  it('draws the stems of each taxon in its own wood', () => {
    const mats = materials();
    const view = new PlantView(run.data, mats);
    const taxa = [...new Set(run.data.plants.map((p) => p.taxonId))];
    expect(taxa.length).toBeGreaterThan(2);
    expect([...mats.woods].sort()).toEqual([...taxa].sort());
    const drawn = new Set<unknown>();
    for (const taxonId of taxa) {
      const mesh = view.group.getObjectByName(`stems:${taxonId}`) as { material?: unknown } | undefined;
      expect(mesh, taxonId).toBeDefined();
      drawn.add(mesh!.material);
    }
    expect(drawn.size).toBe(taxa.length);
    view.dispose();
  });

  // KEY.md: the evergreen share is what holds the picture in winter.
  it('shows only evergreen leaves in January, and exactly the leaves the core says are out', () => {
    const view = new PlantView(run.data, materials());
    const day = view.timeline.calendar.dayOf('2030-01-20');
    view.update(camera, day, 1);
    const seasons = seasonsOf(run.data, 2030);
    const out = run.data.leaves.filter((l) => leafState(l, seasons.get(l.plantId), day).present);
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((l) => l.evergreen)).toBe(true);
    expect(view.stats().leaves).toBe(out.length);

    const summer = view.timeline.calendar.dayOf('2030-07-20');
    view.update(camera, summer, 1);
    expect(view.stats().leaves).toBe(run.data.leaves.filter((l) => leafState(l, seasons.get(l.plantId), summer).present).length);
    expect(view.stats().leaves).toBeGreaterThan(out.length);
    view.dispose();
  });

  it('still draws a plant of an unknown taxon in leaf, and says its look is provisional', () => {
    const data = structuredClone(run.data);
    data.plants[0]!.taxonId = 'no-such-taxon';
    const view = new PlantView(data, materials());
    expect(view.provisionalLooks).toEqual([data.plants[0]!.label]);
    // it has flowers in the data and no flower model: said too
    expect(view.withoutFlowers).toEqual([data.plants[0]!.label]);
    const day = view.timeline.calendar.dayOf('2030-07-20');
    view.update(camera, day, 1);
    const seasons = seasonsOf(data, 2030);
    expect(view.stats().leaves).toBe(data.leaves.filter((l) => leafState(l, seasons.get(l.plantId), day).present).length);
    view.dispose();
  });
});

// KEY.md section 6, the reference palette; section 7 step 7: "Render monthly
// time slices, check winter appearance and repeat with the gardener model active."
describe('the reference palette', () => {
  it('is offered on the hemisphere only', () => {
    expect(canGrow('palette', 'hemisphere')).toBe(true);
    expect(canGrow('palette-ivy', 'hemisphere')).toBe(true);
    expect(canGrow('palette', 'vault')).toBe(false);
  });

  const run = growScenario('palette', 'hemisphere', 'trained', 3);

  it('puts one plant at the foot of each of the twelve ribs, on a Bower with a station for each', () => {
    expect(run.data.plants).toHaveLength(REFERENCE_PALETTE.length);
    expect(run.bower.rootStations).toHaveLength(REFERENCE_PALETTE.length);
    expect(run.bower.rootStations.length).toBeGreaterThan(makeHemisphereBower().rootStations.length);
    expect(new Set(run.data.plants.map((p) => p.stationId)).size).toBe(REFERENCE_PALETTE.length);
  });

  it('has organ models of its own for every plant of the palette, with ivy or without', () => {
    for (const p of REFERENCE_PALETTE) expect(lookFor(p.taxonId).provisional, p.taxonId).toBe(false);
    expect(lookFor('hedera-helix').provisional).toBe(false);
    const view = new PlantView(run.data, materials());
    expect(view.provisionalLooks).toEqual([]);
    expect(view.withoutFlowers).toEqual([]);
    view.dispose();
    const withIvy = growScenario('palette-ivy', 'hemisphere', 'trained', 1);
    expect(withIvy.data.plants.find((p) => p.id === 'north-evergreen')!.taxonId).toBe('hedera-helix');
  });

  it('carries the design report of the core: twelve months of flowering by plant, and winter cover read against the target', () => {
    const report = run.report();
    expect(report.months).toHaveLength(12);
    for (const m of report.months) for (const id of Object.keys(m.flowers)) expect(run.data.plants.some((p) => p.id === id)).toBe(true);
    for (const m of report.flowerlessMonths) expect(Object.values(report.months[m - 1]!.flowers).every((n) => n === 0)).toBe(true);
    expect(report.winter).not.toBeNull();
    expect(report.winter!.target.status).toBe('design_target');
    expect(report.winter!.views.map((v) => v.viewpointId)).toEqual(report.viewpoints.map((v) => v.id));
    // asked for twice, worked out once
    expect(run.report()).toBe(report);
  });
});

// CLAUDE.md: "A flowering month is an envelope, not a trigger." What flowers is
// what the run grew, and every plant that flowers in it is drawn in flower.
describe('the palette in flower', () => {
  const run = growScenario('palette', 'hemisphere', 'trained', 6);
  const count = (id: string) => run.data.flowers.filter((f) => f.plantId === id).length;

  it('has flowers on the rose, both honeysuckles and the star jasmine, now that the library records the wood they flower on', () => {
    for (const id of ['rose', 'honeysuckle', 'evergreen-honeysuckle', 'star-jasmine']) expect(count(id), id).toBeGreaterThan(0);
  });

  // render/presence.ts: "a picture and a number computed from the same run agree".
  it('counts as in flower, on the 15th of each month, exactly the flowers the report counts as open', () => {
    const report = run.report();
    const view = new PlantView(run.data, materials());
    let open = 0;
    for (const month of report.months) {
      view.update(camera, view.timeline.calendar.dayOf(month.date), 1);
      const counted = Object.values(month.flowers).reduce((a, b) => a + b, 0);
      expect(view.stats().flowers, month.date).toBe(counted);
      open += counted;
    }
    expect(open).toBeGreaterThan(0);
    // and a bud is not a flower: before anything opens, buds are counted apart
    const firstOpen = Math.min(...run.data.flowers.map((f) => f.openDay));
    const justBefore = run.data.flowers.filter((f) => f.developDay < firstOpen);
    if (justBefore.length) {
      view.update(camera, firstOpen - 1, 1);
      expect(view.stats().flowers).toBe(0);
      expect(view.stats().buds).toBeGreaterThan(0);
    }
    view.dispose();
  });

  it('draws every plant that flowers in the run with a flower model of its own', () => {
    const view = new PlantView(run.data, materials());
    expect(view.withoutFlowers).toEqual([]);
    expect(view.provisionalLooks).toEqual([]);
    // each flowering plant's taxon has its own model, and no two taxa share one
    const flowering = [...new Set(run.data.flowers.map((f) => f.plantId))].map((id) => run.data.plants.find((p) => p.id === id)!.taxonId);
    const models = new Map(flowering.map((taxonId) => [taxonId, lookFor(taxonId).flowers!.default.key]));
    expect(new Set(models.values()).size).toBe(models.size);
    view.dispose();
  });
});
