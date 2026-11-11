import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { leafState, makeVaultBower, seasonsOf } from '@horti/core';
import { assetsFor } from '../src/plant/assets.ts';
import { canGrow, growScenario } from '../src/plant/scenario.ts';
import { type PlantMaterials, PlantView } from '../src/plant/view.ts';

/** Stand-ins for the real materials, which need a canvas for their textures. */
const materials = (): PlantMaterials => {
  const leaf = [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()];
  const flower = new THREE.MeshBasicMaterial();
  return { wood: new THREE.MeshBasicMaterial(), pod: new THREE.MeshBasicMaterial(), leaf: () => leaf, flower: () => flower };
};
const camera = new THREE.PerspectiveCamera();
camera.position.set(6, 2, 8);

// CLAUDE.md: "Mechanism traits do not transfer. Spurs, handedness and old-wood
// flowering are wisteria's; each mechanism and flowering class is implemented
// separately." The same goes for what a plant looks like.
describe('organ models are per taxon', () => {
  const taxa = ['wisteria-sinensis', 'lonicera-henryi', 'clematis-viticella-etoile-violette', 'clematis-cirrhosa-freckles'];

  it('gives each taxon that can be grown leaf models of its own', () => {
    const leaves = taxa.map((id) => assetsFor(id)!.leaf.key);
    expect(new Set(leaves).size).toBe(taxa.length);
  });

  it('gives no two taxa the same flower model, and the honeysuckle none until its habit is settled', () => {
    const flowers = taxa.map((id) => assetsFor(id)!.flower?.key ?? null);
    expect(flowers[1]).toBeNull();
    const drawn = flowers.filter((k) => k !== null);
    expect(new Set(drawn).size).toBe(drawn.length);
  });

  it('has no models for a taxon it does not know, rather than borrowing another plant\'s', () => {
    expect(assetsFor('rosa-banksiae-lutea')).toBeNull();
  });

  it('builds every model at every level of detail, finite and tagged for the organ programs', () => {
    for (const id of taxa) {
      const { leaf, flower } = assetsFor(id)!;
      for (const asset of flower ? [leaf, flower] : [leaf]) {
        let finest = Infinity;
        for (let lod = 0; lod < asset.lods; lod++) {
          for (let v = 0; v < asset.variants; v++) {
            const g = asset.make(v, lod);
            const pos = g.getAttribute('position');
            expect(pos.count).toBeGreaterThan(3);
            for (let i = 0; i < pos.array.length; i++) expect(Number.isFinite(pos.array[i])).toBe(true);
            expect(g.getAttribute('aPart').count).toBe(pos.count);
            expect(g.getAttribute('normal').count).toBe(pos.count);
            if (v === 0) {
              // each coarser level is no heavier than the one before
              expect(g.index!.count).toBeLessThanOrEqual(finest);
              finest = g.index!.count;
            }
          }
        }
      }
    }
  });

  it('authors the new leaves one unit long, so that the length in the data is the length drawn', () => {
    for (const id of taxa.slice(1)) {
      const g = assetsFor(id)!.leaf.make(0, 0);
      g.computeBoundingBox();
      expect(g.boundingBox!.max.z).toBeGreaterThan(0.9);
      expect(g.boundingBox!.max.z).toBeLessThan(1.12);
    }
  });

  it('keeps the convention of the prototype for the wisteria leaf: one unit is its axis, and the end leaflet reaches past it', () => {
    const g = assetsFor('wisteria-sinensis')!.leaf.make(0, 0);
    g.computeBoundingBox();
    expect(g.boundingBox!.max.z).toBeGreaterThan(1.1);
    expect(g.boundingBox!.max.z).toBeLessThan(1.35);
  });

  it('authors the two clematis flowers one unit across, which is what their lengthM means', () => {
    for (const id of ['clematis-viticella-etoile-violette', 'clematis-cirrhosa-freckles']) {
      const flower = assetsFor(id)!.flower!;
      expect(flower.authoredSize).toBe(1);
      const g = flower.make(0, 0);
      // the widest the tepals reach, tip to opposite tip
      const pos = g.getAttribute('position');
      const part = g.getAttribute('aPart');
      const tepals: THREE.Vector3[] = [];
      for (let i = 0; i < pos.count; i++) if (part.getW(i) >= 0) tepals.push(new THREE.Vector3().fromBufferAttribute(pos, i));
      let across = 0;
      for (let i = 0; i < tepals.length; i += 3) for (let j = i + 1; j < tepals.length; j += 3) across = Math.max(across, tepals[i]!.distanceTo(tepals[j]!));
      expect(across).toBeGreaterThan(0.93);
      expect(across).toBeLessThan(1.08);
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

  it('draws every plant with models of its own taxon: none is left as bare stems', () => {
    const view = new PlantView(run.data, materials());
    expect(view.withoutOrgans).toEqual([]);
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
    const seasonsThen = seasonsOf(run.data, 2030);
    expect(view.stats().leaves).toBe(run.data.leaves.filter((l) => leafState(l, seasonsThen.get(l.plantId), summer).present).length);
    expect(view.stats().leaves).toBeGreaterThan(out.length);
    view.dispose();
  });

  it('leaves a plant of an unknown taxon as stems, and says so', () => {
    const data = structuredClone(run.data);
    data.plants[0]!.taxonId = 'rosa-banksiae-lutea';
    const view = new PlantView(data, materials());
    expect(view.withoutOrgans).toEqual([data.plants[0]!.label]);
    view.update(camera, view.timeline.calendar.dayOf('2030-07-20'), 1);
    const seasons = seasonsOf(data, 2030);
    const others = data.leaves.filter((l) => l.plantId !== data.plants[0]!.id && leafState(l, seasons.get(l.plantId), view.timeline.calendar.dayOf('2030-07-20')).present);
    expect(view.stats().leaves).toBe(others.length);
    view.dispose();
  });
});
