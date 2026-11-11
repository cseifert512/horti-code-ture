import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { REFERENCE_PALETTE, leafState, makeHemisphereBower, makeVaultBower, seasonsOf } from '@horti/core';
import { MODELLED_TAXA, assetsFor } from '../src/plant/assets.ts';
import { canGrow, growScenario, growable } from '../src/plant/scenario.ts';
import { type PlantMaterials, PlantView } from '../src/plant/view.ts';

/** Stand-ins for the real materials, which need a canvas for their textures. */
const materials = (): PlantMaterials => {
  const leaf = [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()];
  const flower = new THREE.MeshBasicMaterial();
  return { wood: new THREE.MeshBasicMaterial(), pod: new THREE.MeshBasicMaterial(), leaf: () => leaf, flower: () => flower };
};
const camera = new THREE.PerspectiveCamera();
camera.position.set(6, 2, 8);

/** The widest the flower-tagged parts of a model reach, tip to opposite tip. */
function across(g: THREE.BufferGeometry): number {
  const pos = g.getAttribute('position');
  const part = g.getAttribute('aPart');
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < pos.count; i++) if (part.getW(i) >= 0) points.push(new THREE.Vector3().fromBufferAttribute(pos, i));
  let widest = 0;
  for (let i = 0; i < points.length; i += 3) for (let j = i + 1; j < points.length; j += 3) widest = Math.max(widest, points[i]!.distanceTo(points[j]!));
  return widest;
}

// CLAUDE.md: "Mechanism traits do not transfer. Spurs, handedness and old-wood
// flowering are wisteria's; each mechanism and flowering class is implemented
// separately." The same goes for what a plant looks like.
describe('organ models are per taxon', () => {
  it('has models for taxa that can be grown, and for nothing that cannot', () => {
    const can = growable();
    for (const id of MODELLED_TAXA) expect(can.has(id), id).toBe(true);
  });

  it('gives each modelled taxon a leaf of its own', () => {
    const leaves = MODELLED_TAXA.map((id) => assetsFor(id).leaf.key);
    expect(new Set(leaves).size).toBe(MODELLED_TAXA.length);
    for (const id of MODELLED_TAXA) expect(assetsFor(id).provisional).toBe(false);
  });

  it('gives no two taxa the same flower model', () => {
    const flowers = MODELLED_TAXA.map((id) => assetsFor(id).flower?.key).filter((k) => k !== undefined);
    expect(flowers.length).toBeGreaterThanOrEqual(5);
    expect(new Set(flowers).size).toBe(flowers.length);
  });

  it('gives a taxon it does not know a plain stand-in leaf and no flowers, marked provisional, rather than the organs of another plant', () => {
    const unknown = assetsFor('thunbergia-alata');
    expect(unknown.provisional).toBe(true);
    expect(unknown.flower).toBeNull();
    expect(MODELLED_TAXA.map((id) => assetsFor(id).leaf.key)).not.toContain(unknown.leaf.key);
  });

  it('builds every model at every level of detail, finite and tagged for the organ programs', () => {
    for (const id of [...MODELLED_TAXA, 'thunbergia-alata']) {
      const { leaf, flower } = assetsFor(id);
      for (const asset of flower ? [leaf, flower] : [leaf]) {
        let finest = Infinity;
        for (let lod = 0; lod < asset.lods; lod++) {
          for (let v = 0; v < asset.variants; v++) {
            const g = asset.make(v, lod);
            const pos = g.getAttribute('position');
            expect(pos.count).toBeGreaterThan(3);
            for (let i = 0; i < pos.array.length; i++) expect(Number.isFinite(pos.array[i]), `${asset.key} ${v}/${lod}`).toBe(true);
            expect(g.getAttribute('aPart').count).toBe(pos.count);
            expect(g.getAttribute('normal').count).toBe(pos.count);
            if (v === 0) {
              // each coarser level is no heavier than the one before
              expect(g.index!.count, asset.key).toBeLessThanOrEqual(finest);
              finest = g.index!.count;
            }
          }
        }
      }
    }
  });

  it('authors each leaf one unit long, so that the length in the data is the length drawn', () => {
    for (const id of [...MODELLED_TAXA, 'thunbergia-alata']) {
      if (id === 'wisteria-sinensis') continue;
      const { leaf } = assetsFor(id);
      for (let v = 0; v < leaf.variants; v++) {
        const g = leaf.make(v, 0);
        g.computeBoundingBox();
        expect(g.boundingBox!.max.z, leaf.key).toBeGreaterThan(0.9);
        expect(g.boundingBox!.max.z, leaf.key).toBeLessThan(1.12);
      }
    }
  });

  it('keeps the convention of the prototype for the wisteria leaf: one unit is its axis, and the end leaflet reaches past it', () => {
    const g = assetsFor('wisteria-sinensis').leaf.make(0, 0);
    g.computeBoundingBox();
    expect(g.boundingBox!.max.z).toBeGreaterThan(1.1);
    expect(g.boundingBox!.max.z).toBeLessThan(1.35);
  });

  it('authors single flowers and flowerheads one unit across, which is what their lengthM means', () => {
    for (const id of ['clematis-viticella-etoile-violette', 'clematis-cirrhosa-freckles', 'clematis-armandi', 'hydrangea-anomala-subsp-petiolaris', 'rosa-the-generous-gardener']) {
      const flower = assetsFor(id).flower!;
      expect(flower.authoredSize).toBe(1);
      for (let v = 0; v < flower.variants; v++) {
        const width = across(flower.make(v, 0));
        expect(width, flower.key).toBeGreaterThan(0.92);
        expect(width, flower.key).toBeLessThan(1.08);
      }
    }
  });

  it('authors flower clusters about one unit across', () => {
    for (const id of ['lonicera-periclymenum-graham-thomas', 'lonicera-henryi', 'trachelospermum-jasminoides']) {
      const flower = assetsFor(id).flower!;
      expect(flower.authoredSize).toBe(1);
      for (let v = 0; v < flower.variants; v++) {
        const width = across(flower.make(v, 0));
        expect(width, flower.key).toBeGreaterThan(0.8);
        expect(width, flower.key).toBeLessThan(1.2);
      }
    }
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
    data.plants[0]!.taxonId = 'thunbergia-alata';
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
    for (const p of REFERENCE_PALETTE) expect(assetsFor(p.taxonId).provisional, p.taxonId).toBe(false);
    expect(assetsFor('hedera-helix').provisional).toBe(false);
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

  it('draws every plant that flowers in the run with a flower model of its own', () => {
    const view = new PlantView(run.data, materials());
    expect(view.withoutFlowers).toEqual([]);
    expect(view.provisionalLooks).toEqual([]);
    // each flowering plant's taxon has its own model, and no two taxa share one
    const flowering = [...new Set(run.data.flowers.map((f) => f.plantId))].map((id) => run.data.plants.find((p) => p.id === id)!.taxonId);
    const models = new Map(flowering.map((taxonId) => [taxonId, assetsFor(taxonId).flower!.key]));
    expect(new Set(models.values()).size).toBe(models.size);
    view.dispose();
  });
});
