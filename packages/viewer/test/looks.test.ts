import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { APPENDAGE_KIND } from '@horti/core';
import { triangles } from '../src/plant/kit.ts';
import { BUDGET_CEILING, type FlowerAsset, type LeafAsset, type OrganKind, type OrganModel, type TaxonLook, assetsOf, ceilingFor, formOf } from '../src/plant/look.ts';
import { TAXON_IDS, loadLooks, lookFault, lookFor } from '../src/plant/registry.ts';

const SPECIES_DIR = fileURLToPath(new URL('../../../species/', import.meta.url));
const TAXA_DIR = fileURLToPath(new URL('../src/plant/taxa/', import.meta.url));
const SPECIES = readdirSync(SPECIES_DIR)
  .filter((name) => statSync(`${SPECIES_DIR}${name}`).isDirectory())
  .sort();

await loadLooks();
const looks: TaxonLook[] = SPECIES.map((id) => lookFor(id));
const everyAsset = looks.flatMap((look) => assetsOf(look).map((a) => ({ ...a, look })));

/** The widest the flower-tagged parts of a model reach, tip to opposite tip. */
function reach(g: THREE.BufferGeometry): number {
  const pos = g.getAttribute('position');
  const part = g.getAttribute('aPart');
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < pos.count; i++) if (part.getW(i) >= 0) points.push(new THREE.Vector3().fromBufferAttribute(pos, i));
  // every point against a spread of the others: enough to find the two ends without a test that takes minutes
  const step = Math.max(1, Math.floor(points.length / 400));
  let widest = 0;
  for (let i = 0; i < points.length; i += step) for (let j = i + 1; j < points.length; j += step) widest = Math.max(widest, points[i]!.distanceTo(points[j]!));
  return widest;
}

function firstNotFinite(g: THREE.BufferGeometry, name: string): number {
  const a = g.getAttribute(name).array;
  // one assertion for the whole array: an assertion for each number took this test to its time limit
  for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return i;
  return -1;
}

// CLAUDE.md: "Mechanism traits do not transfer. Spurs, handedness and old-wood
// flowering are wisteria's; each mechanism and flowering class is implemented
// separately." The same goes for what a plant looks like: one module per taxon,
// and none borrows from another.
describe('one module per taxon', () => {
  it('has a module for every folder under species/, and a folder for every module', () => {
    expect([...TAXON_IDS].sort()).toEqual(SPECIES);
    expect(readdirSync(TAXA_DIR).sort()).toEqual(SPECIES.map((id) => `${id}.ts`));
  });

  it('loads every module, and each gives the look of its own taxon', () => {
    for (const id of SPECIES) {
      expect(lookFault(id), id).toBeUndefined();
      expect(lookFor(id).taxonId).toBe(id);
    }
  });

  it('exports one thing from each module: its look', async () => {
    for (const id of SPECIES) {
      const module = (await import(`../src/plant/taxa/${id}.ts`)) as Record<string, unknown>;
      expect(Object.keys(module), id).toEqual(['look']);
    }
  });

  it('imports no other taxon: only the kit, the look interface, the stand-in, the core, and its own species folder', () => {
    for (const id of SPECIES) {
      const source = readFileSync(`${TAXA_DIR}${id}.ts`, 'utf8');
      const specifiers = [...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s+['"]([^'"]+)['"]/gm)].map((m) => (m[1] ?? m[2] ?? m[3])!);
      expect(specifiers.length, id).toBeGreaterThan(0);
      const allowed = new Set(['three', '@horti/core', '../kit.ts', '../look.ts', '../stand-in.ts', '../../util.ts']);
      for (const s of specifiers) {
        // numbers measured on the plant come from its own folder under species/, and from no other's
        const own = s.startsWith(`../../../../../species/${id}/`);
        expect(allowed.has(s) || own, `taxa/${id}.ts imports "${s}"`).toBe(true);
      }
    }
  });

  it('gives every organ model a key that begins with its taxon and is shared with no other', () => {
    const keys = everyAsset.map((a) => a.asset.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const { asset, look } of everyAsset) expect(asset.key.startsWith(`${look.taxonId}/`), asset.key).toBe(true);
  });

  it('gives a taxon it has no module for the stand-in, marked provisional, rather than the organs of another plant', () => {
    const unknown = lookFor('no-such-taxon');
    expect(unknown.provisional).toBe(true);
    expect(unknown.flowers).toBeNull();
    expect(unknown.fruits).toBeNull();
    expect(everyAsset.map((a) => a.asset.key)).not.toContain(unknown.leaves.default.key);
  });

  it('marks as provisional every look that still draws the stand-in leaf, and no other', () => {
    for (const look of looks) expect(look.leaves.default.key.endsWith('/stand-in-leaf'), look.taxonId).toBe(look.provisional);
  });
});

// TAXON_LOOKS.md, "Levels of detail and triangle budgets".
describe('every organ model of every taxon', () => {
  it('builds at every level of detail: finite, with what its program needs, and within the triangle budget it states', () => {
    const needs: Record<OrganKind, string[]> = { leaf: ['normal', 'uv', 'aPart'], flower: ['normal', 'color', 'aPart'], fruit: ['normal', 'color'], appendage: ['normal', 'color'] };
    let built = 0;
    for (const { kind, asset } of everyAsset) {
      expect(asset.variants, asset.key).toBeGreaterThanOrEqual(1);
      expect(asset.lods, asset.key).toBeGreaterThanOrEqual(1);
      expect(asset.budget.length, `${asset.key} states a budget for each level of detail`).toBe(asset.lods);
      let coarser = Infinity;
      for (let lod = 0; lod < asset.lods; lod++) {
        const budget = asset.budget[lod]!;
        expect(budget, `${asset.key} level ${lod}: its budget is over the ceiling for a ${kind}`).toBeLessThanOrEqual(ceilingFor(kind, lod, asset.lods));
        // each coarser level is budgeted no heavier than the one before
        expect(budget, asset.key).toBeLessThanOrEqual(coarser);
        coarser = budget;
        for (let v = 0; v < asset.variants; v++) {
          const g = asset.make(v, lod);
          const pos = g.getAttribute('position');
          expect(pos.count, `${asset.key} ${v}/${lod}`).toBeGreaterThan(3);
          expect(g.index, `${asset.key} ${v}/${lod} is indexed`).not.toBeNull();
          expect(firstNotFinite(g, 'position'), `${asset.key} ${v}/${lod}: a position is not a finite number`).toBe(-1);
          for (const name of needs[kind]) {
            expect(g.getAttribute(name), `${asset.key} ${v}/${lod} has no ${name}`).toBeDefined();
            expect(g.getAttribute(name).count, `${asset.key} ${v}/${lod} ${name}`).toBe(pos.count);
            expect(firstNotFinite(g, name), `${asset.key} ${v}/${lod}: ${name} is not finite`).toBe(-1);
          }
          expect(triangles(g), `${asset.key} variant ${v} level ${lod} is over its stated budget of ${budget} triangles`).toBeLessThanOrEqual(budget);
          built++;
        }
      }
    }
    expect(built).toBeGreaterThan(60);
  });

  it('has as many levels of detail as the renderer can switch between', () => {
    for (const look of looks) {
      // a leaf is drawn with three materials, near, near and far, and two switching distances
      for (const leaf of Object.values(look.leaves)) expect(leaf.lods, leaf.key).toBeLessThanOrEqual(3);
      // the others state their own distances: one between each level and the next, and a cap for each level but the last
      for (const organ of [...Object.values(look.flowers ?? {}), ...Object.values(look.fruits ?? {}), ...Object.values(look.appendages)]) {
        expect(organ.detailAt.length, organ.key).toBe(organ.lods - 1);
        expect(organ.detailCaps.length, organ.key).toBeLessThanOrEqual(organ.lods - 1);
        for (let i = 1; i < organ.detailAt.length; i++) expect(organ.detailAt[i]!, organ.key).toBeGreaterThan(organ.detailAt[i - 1]!);
      }
    }
  });

  it('has ceilings that fall from the finest level to the coarsest', () => {
    for (const c of Object.values(BUDGET_CEILING)) {
      expect(c.finest).toBeGreaterThanOrEqual(c.middle);
      expect(c.middle).toBeGreaterThanOrEqual(c.coarsest);
    }
  });

  it('builds the same geometry each time it is asked', () => {
    for (const { asset } of everyAsset) {
      const a = asset.make(0, asset.lods - 1).getAttribute('position').array;
      const b = asset.make(0, asset.lods - 1).getAttribute('position').array;
      expect(a.length, asset.key).toBe(b.length);
      let differs = -1;
      for (let i = 0; i < a.length && differs < 0; i++) if (a[i] !== b[i]) differs = i;
      expect(differs, asset.key).toBe(-1);
    }
  });

  it('picks a variant it has, whatever the leaf, flower, fruit or hold', () => {
    const rs = [0, 0.1999, 0.5, 0.7999, 0.999999];
    for (const look of looks) {
      for (const leaf of Object.values(look.leaves)) for (const r of rs) for (const length of [0.02, 0.2, 0.6]) expect(leaf.pick(length, r), leaf.key).toBeLessThan(leaf.variants);
      for (const flower of Object.values(look.flowers ?? {})) for (const r of rs) expect(Number.isInteger(flower.pick(r)) && flower.pick(r) < flower.variants, flower.key).toBe(true);
      for (const fruit of Object.values(look.fruits ?? {})) for (const r of rs) expect(Number.isInteger(fruit.pick(r)) && fruit.pick(r) < fruit.variants, fruit.key).toBe(true);
      for (const hold of Object.values(look.appendages)) for (const r of rs) for (const holding of [true, false]) expect(hold.pick(r, holding), hold.key).toBeLessThan(hold.variants);
    }
  });
});

// TAXON_LOOKS.md, "Frames and units".
describe('the frame each organ is authored in', () => {
  it('authors each leaf one unit long from where it joins the stem, so that the length in the data is the length drawn', () => {
    for (const look of looks) {
      // the wisteria leaf keeps the prototype's convention, tested below
      if (look.taxonId === 'wisteria-sinensis') continue;
      for (const leaf of Object.values(look.leaves) as LeafAsset[]) {
        for (let v = 0; v < leaf.variants; v++) {
          const g = leaf.make(v, 0);
          g.computeBoundingBox();
          expect(g.boundingBox!.max.z, leaf.key).toBeGreaterThan(0.9);
          expect(g.boundingBox!.max.z, leaf.key).toBeLessThan(1.12);
          expect(g.boundingBox!.min.z, leaf.key).toBeGreaterThan(-0.1);
        }
      }
    }
  });

  it('keeps the convention of the prototype for the wisteria leaf: one unit is its axis, and the end leaflet reaches past it', () => {
    const g = lookFor('wisteria-sinensis').leaves.default.make(0, 0);
    g.computeBoundingBox();
    expect(g.boundingBox!.max.z).toBeGreaterThan(1.1);
    expect(g.boundingBox!.max.z).toBeLessThan(1.35);
  });

  it('authors each flower or flowerhead about as large as it says it is, so that lengthM in the data is the size drawn', () => {
    let checked = 0;
    for (const look of looks) {
      for (const flower of Object.values(look.flowers ?? {}) as FlowerAsset[]) {
        for (let v = 0; v < flower.variants; v++) {
          const size = reach(flower.make(v, 0));
          expect(size / flower.authoredSize, `${flower.key} variant ${v} reaches ${size.toFixed(3)} and says ${flower.authoredSize}`).toBeGreaterThan(0.75);
          expect(size / flower.authoredSize, `${flower.key} variant ${v} reaches ${size.toFixed(3)} and says ${flower.authoredSize}`).toBeLessThan(1.3);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThanOrEqual(9);
  });

  it('authors a flower or fruit that hangs below its attachment, and one that is held above it', () => {
    for (const look of looks) {
      for (const organ of [...Object.values(look.flowers ?? {}), ...Object.values(look.fruits ?? {})]) {
        const g = organ.make(0, 0);
        g.computeBoundingBox();
        const { min, max } = g.boundingBox!;
        // most of it lies on the side of the origin that its poise names
        if (organ.poise === 'hangs') expect(-min.y, organ.key).toBeGreaterThan(max.y);
        else expect(max.y, organ.key).toBeGreaterThan(-min.y);
      }
    }
  });

  it('authors what a plant holds on with along +Z from the stem, one unit long', () => {
    let checked = 0;
    for (const look of looks) {
      for (const kind of APPENDAGE_KIND) {
        const hold = look.appendages[kind];
        if (!hold) continue;
        for (let v = 0; v < hold.variants; v++) {
          const g = hold.make(v, 0);
          g.computeBoundingBox();
          expect(g.boundingBox!.max.z, hold.key).toBeGreaterThan(0.8);
          expect(g.boundingBox!.max.z, hold.key).toBeLessThan(1.15);
          expect(g.boundingBox!.min.z, hold.key).toBeGreaterThan(-0.2);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('the wood of a taxon', () => {
  it('states colours and ages that can be drawn', () => {
    for (const { taxonId, wood } of looks) {
      for (const colour of [wood.young, wood.mature, wood.old]) for (const c of colour) expect(c >= 0 && c <= 1.5, taxonId).toBe(true);
      for (const [from, to] of [wood.woodyDays, wood.oldDays, wood.furrowDays, wood.stiffDays]) {
        expect(from, taxonId).toBeGreaterThanOrEqual(0);
        expect(to, taxonId).toBeGreaterThan(from);
      }
      // a shoot turns woody before its bark grows old
      expect(wood.oldDays[0], taxonId).toBeGreaterThanOrEqual(wood.woodyDays[0]);
      expect(wood.furrow, taxonId).toBeGreaterThanOrEqual(0);
      expect(wood.furrow, taxonId).toBeLessThanOrEqual(3);
      expect(wood.roughness >= 0 && wood.roughness <= 1, taxonId).toBe(true);
    }
  });

  // the task this layout was made for: "so that a clematis stem no longer looks like wisteria wood"
  it('is its own for every taxon that has models: no two share a wood', () => {
    const own = looks.filter((l) => !l.provisional);
    const told = own.map((l) => JSON.stringify(l.wood));
    expect(new Set(told).size).toBe(own.length);
  });
});

describe('forms', () => {
  it('draws the ordinary form where the data names none, the named form where the look has it, and the ordinary one where it has not', () => {
    const a = { key: 'a' } as OrganModel;
    const b = { key: 'b' } as OrganModel;
    const forms = { default: a, adult: b };
    expect(formOf(forms, undefined)).toBe(a);
    expect(formOf(forms, 'adult')).toBe(b);
    expect(formOf(forms, 'default')).toBe(a);
    expect(formOf(forms, 'no-such-form')).toBe(a);
  });
});
