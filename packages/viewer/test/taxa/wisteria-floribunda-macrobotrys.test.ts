import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  Calendar,
  type RenderData,
  characterNumber,
  characterOf,
  characterRange,
  characterText,
  flowerState,
  fruitState,
  known,
  leafState,
  morphologyProvenance,
  param,
  parseGrowthModel,
  parseMorphology,
  parseTaxon,
  readBower,
  seasonsOf,
  toRenderData,
} from '@horti/core';
import { growPlanting } from '../../src/plant/grow.ts';
import { triangles } from '../../src/plant/kit.ts';
import { assetsOf, ceilingFor } from '../../src/plant/look.ts';
import { look } from '../../src/plant/taxa/wisteria-floribunda-macrobotrys.ts';
import { specimenPlan } from '../../src/specimen/specimen.ts';

const ID = 'wisteria-floribunda-macrobotrys';
const read = (path: string): unknown => JSON.parse(readFileSync(fileURLToPath(new URL(`../../../../${path}`, import.meta.url)), 'utf8'));
const morphology = parseMorphology(read(`species/${ID}/morphology.json`), `species/${ID}/morphology.json`);
const model = parseGrowthModel(read(`species/${ID}/model.json`), `species/${ID}/model.json`);
const profile = parseTaxon(read(`species/${ID}/taxon.json`), `species/${ID}/taxon.json`);
const mid = ([a, b]: readonly [number, number]): number => (a + b) / 2;

const leaf = look.leaves.default;
const raceme = look.flowers!.default;
const pods = look.fruits!.default;

/** The parts of a model (aPart.w >= 0), each with its pivot, when it opens and the box of its vertices. */
function partsOf(g: THREE.BufferGeometry): { pivot: THREE.Vector3; t: number; box: THREE.Box3; vertices: number }[] {
  const pos = g.getAttribute('position');
  const part = g.getAttribute('aPart');
  const found = new Map<string, { pivot: THREE.Vector3; t: number; box: THREE.Box3; vertices: number }>();
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const t = part.getW(i);
    if (t < 0) continue;
    const key = `${part.getX(i)},${part.getY(i)},${part.getZ(i)},${t}`;
    let one = found.get(key);
    if (!one) found.set(key, (one = { pivot: new THREE.Vector3(part.getX(i), part.getY(i), part.getZ(i)), t, box: new THREE.Box3(), vertices: 0 }));
    one.box.expandByPoint(p.fromBufferAttribute(pos, i));
    one.vertices++;
  }
  return [...found.values()];
}

/** The average colour of the vertices a test picks out, in linear RGB. */
function meanColour(g: THREE.BufferGeometry, pick: (p: THREE.Vector3, t: number) => boolean): [number, number, number] {
  const pos = g.getAttribute('position');
  const col = g.getAttribute('color');
  const part = g.getAttribute('aPart');
  const p = new THREE.Vector3();
  let n = 0;
  const sum: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < pos.count; i++) {
    if (!pick(p.fromBufferAttribute(pos, i), part ? part.getW(i) : 0)) continue;
    sum[0] += col.getX(i);
    sum[1] += col.getY(i);
    sum[2] += col.getZ(i);
    n++;
  }
  return [sum[0] / n, sum[1] / n, sum[2] / n];
}

// TAXON_LOOKS.md section 1: "It exports one thing, look ... provisional: false once the leaf is the plant's own."
// CLAUDE.md: "Mechanism traits do not transfer."
describe("the look of Wisteria floribunda 'Macrobotrys'", () => {
  it('is its own: a leaf, a raceme and pods of this taxon, and nothing to hold on with but its stems', () => {
    expect(look.taxonId).toBe(ID);
    expect(look.provisional).toBe(false);
    expect(Object.keys(look.leaves)).toEqual(['default']);
    expect(Object.keys(look.flowers!)).toEqual(['default']);
    expect(Object.keys(look.fruits!)).toEqual(['default']);
    // attachment.mechanism in taxon.json: a stem twiner has no tendrils, coiled stalks, rootlets or prickles
    expect(profile.attachment.mechanism).toBe('stem_twining');
    expect(look.appendages).toEqual({});
    for (const { asset } of assetsOf(look)) expect(asset.key.startsWith(`${ID}/`), asset.key).toBe(true);
  });

  it('borrows nothing from Wisteria sinensis: no import of its module or of its files', () => {
    const source = readFileSync(fileURLToPath(new URL(`../../src/plant/taxa/${ID}.ts`, import.meta.url)), 'utf8');
    const imports = [...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!);
    expect(imports.length).toBeGreaterThan(3);
    for (const s of imports) expect(s.includes('wisteria-sinensis'), s).toBe(false);
  });

  // TAXON_LOOKS.md section 6, "Levels of detail and triangle budgets"
  it('builds every organ model at every level of detail, finite and within the budget it states and the ceiling for its kind', () => {
    for (const { kind, asset } of assetsOf(look)) {
      expect(asset.budget.length, asset.key).toBe(asset.lods);
      for (let lod = 0; lod < asset.lods; lod++) {
        expect(asset.budget[lod]!, `${asset.key} level ${lod}`).toBeLessThanOrEqual(ceilingFor(kind, lod, asset.lods));
        for (let v = 0; v < asset.variants; v++) {
          const g = asset.make(v, lod);
          const pos = g.getAttribute('position').array;
          let bad = -1;
          for (let i = 0; i < pos.length && bad < 0; i++) if (!Number.isFinite(pos[i])) bad = i;
          expect(bad, `${asset.key} ${v}/${lod}: a position is not finite`).toBe(-1);
          expect(triangles(g), `${asset.key} variant ${v} level ${lod}`).toBeLessThanOrEqual(asset.budget[lod]!);
          // a budget is a statement about the model, not headroom: no level is stated at more than a quarter over what it uses
          if (v === asset.variants - 1) expect(asset.budget[lod]! / triangles(g), `${asset.key} level ${lod}`).toBeLessThan(1.25);
        }
      }
    }
  });

  it('spends its triangles near the camera: each coarser level of a model is lighter than the one before', () => {
    for (const { asset } of assetsOf(look)) {
      for (let lod = 1; lod < asset.lods; lod++) expect(triangles(asset.make(0, lod)), `${asset.key} level ${lod}`).toBeLessThan(triangles(asset.make(0, lod - 1)) * 0.6);
    }
  });
});

// SPECIES_PROFILE.md, "Form: what the model draws": the leaf. morphology.json: leaf.*
describe('the leaf', () => {
  it('has a variant for each odd number of leaflets the cultivar is recorded with: 11, 13, 15 and 17', () => {
    const [fewest, most] = characterRange(morphology, 'leaf.leafletCount');
    expect([fewest, most]).toEqual([11, 17]);
    expect(leaf.variants).toBe(4);
    const counts = Array.from({ length: leaf.variants }, (_, v) => partsOf(leaf.make(v, 0)).length);
    expect(counts).toEqual([11, 13, 15, 17]);
    // the same leaflets at every level of detail
    for (let lod = 1; lod < leaf.lods; lod++) expect(Array.from({ length: leaf.variants }, (_, v) => partsOf(leaf.make(v, lod)).length)).toEqual(counts);
  });

  it('is odd-pinnate: leaflets in pairs to either side of the stalk, and one at the end', () => {
    expect(characterText(morphology, 'leaf.division')).toBe('odd-pinnate');
    for (let v = 0; v < leaf.variants; v++) {
      const parts = partsOf(leaf.make(v, 0));
      // leaflets that leave the stalk at the same place are a pair
      const places = new Map<string, typeof parts>();
      for (const p of parts) {
        const key = p.pivot.z.toFixed(4);
        places.set(key, [...(places.get(key) ?? []), p]);
      }
      const along = [...places.values()].sort((a, b) => a[0]!.pivot.z - b[0]!.pivot.z);
      const side = (p: (typeof parts)[number]) => Math.sign(p.box.getCenter(new THREE.Vector3()).x - p.pivot.x);
      for (const pair of along.slice(0, -1)) {
        expect(pair).toHaveLength(2);
        expect(side(pair[0]!)).toBe(-side(pair[1]!));
      }
      // the last place on the stalk bears the one end leaflet, which reaches the tip of the leaf
      const end = along.at(-1)!;
      expect(end).toHaveLength(1);
      expect(end[0]!.box.max.z).toBe(Math.max(...parts.map((p) => p.box.max.z)));
    }
  });

  // TAXON_LOOKS.md section 2: "one unit long, stalk and blade together"
  it('is one unit long from the stem to the tip of its end leaflet, and hangs below where it starts', () => {
    for (let v = 0; v < leaf.variants; v++) {
      const g = leaf.make(v, 0);
      g.computeBoundingBox();
      expect(g.boundingBox!.max.z).toBeGreaterThan(0.93);
      expect(g.boundingBox!.max.z).toBeLessThan(1.05);
      expect(g.boundingBox!.min.z).toBeGreaterThan(-0.05);
      // the stalk arches: the tip is lower than the base
      expect(g.boundingBox!.min.y).toBeLessThan(-0.2);
    }
  });

  it('has leaflets of the recorded proportions: about a fifth of the leaf long, and about three times as long as wide', () => {
    const leafM = mid(characterRange(morphology, 'leaf.lengthM'));
    const leafletM = mid(characterRange(morphology, 'leaf.leafletLengthM'));
    const widthM = mid(characterRange(morphology, 'leaf.leafletWidthM'));
    // the end leaflet of the usual leaf, which lies nearly along z and is full size
    const parts = partsOf(leaf.make(2, 0));
    const end = parts.reduce((a, b) => (b.box.max.z > a.box.max.z ? b : a));
    const size = end.box.getSize(new THREE.Vector3());
    const long = Math.hypot(size.y, size.z);
    expect(long / (leafletM / leafM)).toBeGreaterThan(0.85);
    expect(long / (leafletM / leafM)).toBeLessThan(1.15);
    expect(size.x / long / (widthM / leafletM)).toBeGreaterThan(0.8);
    expect(size.x / long / (widthM / leafletM)).toBeLessThan(1.25);
    // the lowest pair is the smallest
    const lowest = parts.reduce((a, b) => (b.pivot.z < a.pivot.z ? b : a));
    expect(lowest.box.getSize(new THREE.Vector3()).length()).toBeLessThan(end.box.getSize(new THREE.Vector3()).length() * 0.85);
  });

  it('is dark green, bronze when young and yellow in autumn, as the records have it', () => {
    expect(characterText(morphology, 'leaf.colour')).toBe('dark green');
    expect(characterText(morphology, 'leaf.youngColour')).toBe('pale bronze');
    expect(characterText(morphology, 'leaf.autumnColour')).toBe('yellow');
    const { greenA, greenB, young, autumnA, autumnB } = leaf.palette;
    for (const [r, g, b] of [greenA, greenB]) {
      expect(g).toBeGreaterThan(r * 1.6);
      expect(g).toBeGreaterThan(b * 3);
      // dark: well under the brightness of the stand-in's middling green would be too dark to read; under 0.4 is dark
      expect(g).toBeLessThan(0.4);
    }
    // bronze: red over green over blue
    expect(young[0]).toBeGreaterThan(young[1]);
    expect(young[1]).toBeGreaterThan(young[2] * 2);
    // yellow: red and green both strong, hardly any blue
    for (const [r, g, b] of [autumnA, autumnB]) {
      expect(r).toBeGreaterThan(0.5);
      expect(g).toBeGreaterThan(0.3);
      expect(b).toBeLessThan(0.05);
    }
  });
});

// SPECIES_PROFILE.md, "Form: what the model draws": the raceme. morphology.json: inflorescence.*, flower.*
describe('the raceme', () => {
  const flowers = (v: number, lod: number) => partsOf(raceme.make(v, lod));

  // the brief, "Frame and size": authoredSize must be what the growth model's organs.racemeLengthM measures
  it('is authored at the middle of the raceme length the growth model gives, which is the length of the whole raceme', () => {
    expect(characterText(morphology, 'inflorescence.lengthMeasure')).toContain('whole raceme');
    const [short, long] = param(model, 'organs.racemeLengthM');
    expect(raceme.authoredSize).toBeCloseTo((short + long) / 2, 6);
    expect(raceme.poise).toBe('hangs');
    expect(model.names.flowerHeld).toBe('hanging');
    for (let v = 0; v < raceme.variants; v++) {
      const g = raceme.make(v, 0);
      g.computeBoundingBox();
      // it hangs from the origin, its tip one length below
      expect(-g.boundingBox!.min.y / raceme.authoredSize).toBeGreaterThan(0.98);
      expect(-g.boundingBox!.min.y / raceme.authoredSize).toBeLessThan(1.04);
      expect(g.boundingBox!.max.y).toBeLessThan(0.02);
    }
  });

  it('carries the number of flowers the morphology file gives, to within a few, at every level but the farthest', () => {
    const count = characterNumber(morphology, 'inflorescence.flowerCount');
    expect(count).toBeGreaterThan(characterNumber(morphology, 'inflorescence.flowerCountSpecies'));
    for (let v = 0; v < raceme.variants; v++) {
      const n = flowers(v, 0).length;
      expect(Math.abs(n - count)).toBeLessThanOrEqual(5);
      expect(n).toBeGreaterThan(100);
      expect(flowers(v, 1).length).toBe(n);
      expect(flowers(v, 2).length).toBe(n);
      // from far off, about three in eight, each drawn larger
      expect(flowers(v, 3).length / n).toBeGreaterThan(0.34);
      expect(flowers(v, 3).length / n).toBeLessThan(0.42);
    }
  });

  // morphology: inflorescence.flowerSpacing "widely spaced along the stem"; flower.stalkLengthM
  it('sets its flowers apart along a slender stalk, each on a stalk of its own: a narrow raceme, a tenth as wide as it is long', () => {
    for (let v = 0; v < raceme.variants; v++) {
      const g = raceme.make(v, 0);
      const parts = flowers(v, 0).sort((a, b) => a.t - b.t);
      // one flower to 5 or 6 mm of stalk: wider apart than the species, whose 100 and more stand on 20 to 50 cm
      const along = (parts[0]!.pivot.y - parts.at(-1)!.pivot.y) / (parts.length - 1);
      expect(along).toBeGreaterThan(0.005);
      expect(along).toBeLessThan(0.0065);
      // the top of the stalk is bare
      expect(-parts[0]!.pivot.y / raceme.authoredSize).toBeGreaterThan(0.06);
      expect(-parts[0]!.pivot.y / raceme.authoredSize).toBeLessThan(0.12);
      g.computeBoundingBox();
      const size = g.boundingBox!.getSize(new THREE.Vector3());
      const [narrow, wide] = characterRange(morphology, 'inflorescence.widthM');
      expect(Math.max(size.x, size.z)).toBeGreaterThan(narrow * 0.9);
      expect(Math.max(size.x, size.z)).toBeLessThan(wide * 1.25);
    }
  });

  // TAXON_LOOKS.md section 4: "a raceme's flowers t from 0 at the base to 1 at the tip". morphology: inflorescence.openingOrder
  it('opens from the base, which is the top of a hanging raceme, to the tip: the order runs down it without a break', () => {
    expect(characterText(morphology, 'inflorescence.openingOrder')).toContain('from the base to the tip');
    for (let lod = 0; lod < raceme.lods; lod++) {
      const parts = flowers(0, lod).sort((a, b) => a.t - b.t);
      expect(parts[0]!.t).toBe(0);
      expect(parts.at(-1)!.t).toBeCloseTo(1, 6);
      for (let i = 1; i < parts.length; i++) {
        // each later flower is lower on the stalk
        expect(parts[i]!.pivot.y).toBeLessThan(parts[i - 1]!.pivot.y);
        // and no step in the order is long enough to open a stretch of the raceme at once
        expect(parts[i]!.t - parts[i - 1]!.t).toBeLessThan(0.04);
      }
      // every flower pivots on the stalk of the raceme, so that it opens and drops from where it is attached
      for (const p of parts) expect(Math.hypot(p.pivot.x, p.pivot.z)).toBeLessThan(0.03);
    }
  });

  // the brief, "Parts and axis": the stalk is axis and stays; every flower is a part
  it('keeps its stalk as axis, from the attachment to the tip, and makes every flower a part', () => {
    const g = raceme.make(0, 0);
    const pos = g.getAttribute('position');
    const part = g.getAttribute('aPart');
    let axisTop = -Infinity;
    let axisTip = Infinity;
    let axis = 0;
    for (let i = 0; i < pos.count; i++) {
      if (part.getW(i) >= 0) continue;
      axis++;
      axisTop = Math.max(axisTop, pos.getY(i));
      axisTip = Math.min(axisTip, pos.getY(i));
      // the stalk is slender: nothing tagged as axis stands out from it
      expect(Math.hypot(pos.getX(i), pos.getZ(i))).toBeLessThan(0.03);
    }
    expect(axis).toBeGreaterThan(50);
    expect(axisTop).toBeGreaterThan(-0.005);
    expect(-axisTip / raceme.authoredSize).toBeGreaterThan(0.98);
  });

  it('has flowers of the recorded size: wings of 15 to 20 mm, a standard of 8 to 12 mm, on stalks of 13 to 25 mm', () => {
    const wing = characterRange(morphology, 'flower.wingLengthM');
    const stalk = characterRange(morphology, 'flower.stalkLengthM');
    const standard = characterRange(morphology, 'flower.standardWidthM');
    // open flowers of the upper half, where they are full size: how far each reaches from its foot on the stalk
    const parts = flowers(0, 0).filter((p) => p.t < 0.5);
    const reach = parts.map((p) => Math.max(p.box.min.distanceTo(p.pivot), p.box.max.distanceTo(p.pivot)));
    const typical = reach.sort((a, b) => a - b)[Math.floor(reach.length / 2)]!;
    // stalk and flower together, the standard standing a little above
    expect(typical).toBeGreaterThan(stalk[0] + wing[0]);
    expect(typical).toBeLessThan((stalk[1] + wing[1]) * 1.15);
    // a small standard: under the 20 mm at which that of W. sinensis begins (Compton and others 2019, in the basis of the character)
    expect(standard[1]).toBeLessThan(0.02);
    expect(characterOf(morphology, 'flower.standardWidthM').basis).toContain('W. sinensis');
  });

  // morphology: flower.standardColour, flower.wingAndKeelColour
  it('is pale above and violet-blue below: a pale violet standard with a yellow eye over darker wings and keel', () => {
    expect(characterText(morphology, 'flower.standardColour')).toContain('pale violet');
    expect(characterText(morphology, 'flower.standardColour')).toContain('yellow');
    expect(characterText(morphology, 'flower.wingAndKeelColour')).toContain('darker than the standard');
    const g = raceme.make(0, 0);
    // an open flower from the upper part of the raceme: beyond its own stalk, the standard is what stands highest
    // and the wings and keel what lies lowest
    const one = flowers(0, 0).sort((a, b) => a.t - b.t)[20]!;
    const mine = (t: number) => t === one.t;
    const out = (p: THREE.Vector3) => Math.hypot(p.x - one.pivot.x, p.z - one.pivot.z);
    const stalk = mid(characterRange(morphology, 'flower.stalkLengthM'));
    const pos = g.getAttribute('position');
    const tags = g.getAttribute('aPart');
    const heights: number[] = [];
    const q = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) if (mine(tags.getW(i)) && out(q.fromBufferAttribute(pos, i)) > stalk) heights.push(q.y);
    heights.sort((a, b) => a - b);
    const low = heights[Math.floor(heights.length * 0.3)]!;
    const high = heights[Math.floor(heights.length * 0.8)]!;
    const standard = meanColour(g, (p, t) => mine(t) && out(p) > stalk && p.y >= high);
    const below = meanColour(g, (p, t) => mine(t) && out(p) > stalk && p.y <= low);
    const lum = ([r, gg, b]: [number, number, number]) => 0.2126 * r + 0.7152 * gg + 0.0722 * b;
    expect(lum(standard)).toBeGreaterThan(lum(below) * 2);
    // violet-blue: blue over red over green
    expect(below[2]).toBeGreaterThan(below[0] * 1.8);
    expect(below[0]).toBeGreaterThan(below[1]);
    // pale violet: light, and bluer than it is green
    expect(lum(standard)).toBeGreaterThan(0.45);
    expect(standard[2]).toBeGreaterThan(standard[1]);
    // the yellow eye: some vertex of the flower is yellow (red and green high, blue low)
    const col = g.getAttribute('color');
    const part = g.getAttribute('aPart');
    let yellow = 0;
    for (let i = 0; i < col.count; i++) if (part.getW(i) === one.t && col.getX(i) > 0.6 && col.getY(i) > 0.5 && col.getZ(i) < col.getY(i) * 0.6) yellow++;
    expect(yellow).toBeGreaterThan(0);
  });

  it('ends in a tail of buds that grow smaller to the tip', () => {
    const parts = flowers(0, 0).sort((a, b) => a.t - b.t);
    const size = (p: (typeof parts)[number]) => p.box.getSize(new THREE.Vector3()).length();
    const open = size(parts[Math.floor(parts.length / 2)]!);
    expect(size(parts.at(-1)!)).toBeLessThan(open * 0.45);
    expect(size(parts.at(-3)!)).toBeLessThan(open * 0.7);
    // nine in ten are flowers
    expect(parts.filter((p) => size(p) < open * 0.7).length).toBeLessThan(parts.length * 0.12);
  });

  it('keeps its mass of colour from far off: the farthest level is as long and nearly as wide as the nearest', () => {
    const near = raceme.make(0, 0);
    const far = raceme.make(0, raceme.lods - 1);
    near.computeBoundingBox();
    far.computeBoundingBox();
    const a = near.boundingBox!.getSize(new THREE.Vector3());
    const b = far.boundingBox!.getSize(new THREE.Vector3());
    expect(b.y / a.y).toBeGreaterThan(0.97);
    expect(Math.max(b.x, b.z) / Math.max(a.x, a.z)).toBeGreaterThan(0.8);
    expect(Math.max(b.x, b.z) / Math.max(a.x, a.z)).toBeLessThan(1.5);
  });
});

// SPECIES_PROFILE.md, "Form: what the model draws": the pods. morphology.json: fruit.*
describe('the pods', () => {
  it('are authored at the pod length the growth model sets, which is the cultivar\'s recorded 11 to 20 cm', () => {
    expect(characterRange(morphology, 'fruit.lengthM')).toEqual(known(model, 'fruit.lengthM'));
    expect(characterOf(morphology, 'fruit.lengthM').source).toBe(model.params['fruit.lengthM'].source);
    expect(pods.authoredSize).toBeCloseTo(mid(characterRange(morphology, 'fruit.lengthM')), 6);
    expect(pods.poise).toBe('hangs');
    expect(model.names.fruitHeld).toBe('hanging');
    expect(characterText(morphology, 'fruit.held')).toBe('pendant');
  });

  it('hang one, two or three from what is left of the raceme\'s stalk, since no source says how many a raceme carries', () => {
    expect(characterOf(morphology, 'fruit.podsPerRaceme').value).toBeNull();
    expect(pods.variants).toBe(3);
    for (let v = 0; v < pods.variants; v++) {
      const g = pods.make(v, 0);
      g.computeBoundingBox();
      const { min, max } = g.boundingBox!;
      expect(max.y).toBeLessThan(0.005);
      // the lowest pod ends between one and two and a half pod lengths below the attachment
      expect(-min.y / pods.authoredSize).toBeGreaterThan(1.6);
      expect(-min.y / pods.authoredSize).toBeLessThan(2.6);
    }
  });

  it('are flat and widest towards the end: as wide as recorded there, and less than half as thick', () => {
    const [narrow, wide] = characterRange(morphology, 'fruit.widthM');
    // the single pod of the first variant, measured across in two slices: one in its broad part, one in its neck
    const g = pods.make(0, 0);
    const pos = g.getAttribute('position');
    g.computeBoundingBox();
    const tip = g.boundingBox!.min.y;
    /** `from` and `to` are heights above the tip of the pod, as shares of its length. */
    const slice = (from: number, to: number): { wide: number; thick: number } => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i) - tip;
        if (y >= from * pods.authoredSize && y <= to * pods.authoredSize) pts.push(new THREE.Vector3().fromBufferAttribute(pos, i));
      }
      // the pod is turned about its own length: its width is the greatest span across, its thickness the span square to that
      let best = 0;
      let dir = new THREE.Vector2(1, 0);
      for (const a of pts) {
        for (const b of pts) {
          const d = Math.hypot(a.x - b.x, a.z - b.z);
          if (d > best) {
            best = d;
            dir = new THREE.Vector2(a.x - b.x, a.z - b.z).normalize();
          }
        }
      }
      const across = pts.map((p) => -p.x * dir.y + p.z * dir.x);
      return { wide: best, thick: Math.max(...across) - Math.min(...across) };
    };
    const broad = slice(0.2, 0.3);
    const neck = slice(0.72, 0.82);
    expect(broad.wide).toBeGreaterThan(narrow);
    expect(broad.wide).toBeLessThan(wide);
    expect(broad.wide).toBeGreaterThan(neck.wide * 1.3);
    expect(broad.thick).toBeLessThan(broad.wide * 0.5);
  });

  it('are grey-green and velvety when unripe and ripen to brown', () => {
    expect(characterText(morphology, 'fruit.colourUnripe')).toBe('blue-grey');
    expect(characterText(morphology, 'fruit.colourRipe')).toBe('brown');
    expect(characterText(morphology, 'fruit.surface')).toBe('velvety');
    const g = pods.make(0, 0);
    const [r, gg, b] = meanColour(g, (p) => p.y < -pods.authoredSize);
    // greyed, with a blue cast: green leads, and neither red nor blue is far behind it
    expect(gg).toBeGreaterThan(r);
    expect(gg).toBeGreaterThan(b);
    expect(b / gg).toBeGreaterThan(0.7);
    expect(r / gg).toBeGreaterThan(0.65);
    expect(pods.ripe[0]).toBeGreaterThan(pods.ripe[1] * 1.5);
    expect(pods.ripe[1]).toBeGreaterThan(pods.ripe[2] * 1.5);
    expect(pods.roughness).toBeGreaterThan(0.85);
  });
});

describe('the wood', () => {
  it('turns from a green shoot to grey-brown and then to grey bark that flutes with age', () => {
    const { young, mature, old } = look.wood;
    expect(young[1]).toBeGreaterThan(young[0]);
    expect(mature[0]).toBeGreaterThan(mature[1]);
    expect(Math.max(...old) - Math.min(...old)).toBeLessThan(0.08);
    expect(look.wood.furrow).toBeGreaterThan(0.5);
    expect(characterText(morphology, 'stem.oldBark')).toContain('fluted');
  });
});

// morphology.json is where the drawing's numbers have their evidence: packages/core/src/morphology.ts
describe('the morphology file', () => {
  it('gives every character a status, a source where it claims evidence and a basis, and says which numbers were chosen', () => {
    const entries = morphologyProvenance(morphology);
    expect(entries.length).toBeGreaterThan(40);
    const chosen = entries.filter((e) => e.status === 'provisional_design_assumption').map((e) => e.path);
    // only the flower count and what the raceme length measures are this project's choices
    expect(chosen.sort()).toEqual(['inflorescence.flowerCount', 'inflorescence.lengthMeasure']);
    expect(entries.filter((e) => e.status === 'unknown').map((e) => e.path)).toEqual(['fruit.podsPerRaceme']);
    for (const e of entries) if (e.status !== 'unknown') expect((e.basis ?? '').length, e.path).toBeGreaterThan(15);
  });

  it('agrees with the taxon file: handedness, leaf habit and the hanging raceme', () => {
    expect(characterText(morphology, 'stem.twiningHandedness')).toBe(profile.attachment.handedness!.value);
    expect(characterOf(morphology, 'stem.twiningHandedness').source).toBe(profile.attachment.handedness!.source);
    expect(characterText(morphology, 'habit.lifeForm')).toContain(profile.leafHabit.value!);
    expect(characterText(morphology, 'inflorescence.held')).toBe('drooping');
    expect(characterRange(morphology, 'leaf.lengthM')).toEqual(param(model, 'organs.leafLengthM'));
  });
});

// The brief, step 6: "from an engine run on the specimen frame, the plant has leaves, flowers and fruit in the months
// your sources give and not in the others (ask the core's render/presence.ts; never re-derive seasons)".
describe('a specimen grown by the engine for eight years', () => {
  const frame = readBower(read('examples/specimen-frame.bower.json'), 'examples/specimen-frame.bower.json');
  const years = 8;
  const { sim } = growPlanting({ bower: frame.bower, plan: specimenPlan(ID), viewpoints: frame.viewpoints }, new Map([[ID, { profile, model }]]), 'trained', years);
  const data: RenderData = toRenderData(sim);
  const cal = new Calendar(data.start);
  const year = 2034;
  const leavesOn = (iso: string): number => {
    const day = cal.dayOf(iso);
    const seasons = seasonsOf(data, cal.dateOf(day).year);
    return data.leaves.filter((l) => leafState(l, seasons.get(l.plantId), day).present).length;
  };
  const flowersIn = (iso: string, phase: 'open' | 'in_bud'): number => data.flowers.filter((f) => flowerState(f, cal.dayOf(iso)).phase === phase).length;
  const podsOn = (iso: string): number => data.fruits.filter((f) => fruitState(f, cal.dayOf(iso)).phase !== 'absent').length;
  const mid15 = (month: number, y = year): string => `${y}-${String(month).padStart(2, '0')}-15`;

  // taxon.json: leafHabit deciduous. morphology: leaf.autumnColour
  it('is in leaf from May to October, colours and drops its leaves in autumn, and is bare from mid December to March', () => {
    expect(profile.leafHabit.value).toBe('deciduous');
    for (const month of [5, 6, 7, 8, 9, 10]) expect(leavesOn(mid15(month)), `month ${month}`).toBeGreaterThan(300);
    for (const month of [1, 2, 3]) expect(leavesOn(mid15(month)), `month ${month}`).toBe(0);
    expect(leavesOn(`${year}-12-20`)).toBe(0);
    // green in September, and in full autumn colour in mid November, while most are still on the plant
    const seasons = seasonsOf(data, year);
    const on = (iso: string) => data.leaves.map((l) => leafState(l, seasons.get(l.plantId), cal.dayOf(iso))).filter((s) => s.present);
    expect(on(`${year}-09-15`).every((s) => s.autumn === 0)).toBe(true);
    const november = on(`${year}-11-15`);
    expect(november.length).toBeGreaterThan(300);
    expect(november.filter((s) => s.autumn > 0.9).length / november.length).toBeGreaterThan(0.95);
  });

  // taxon.json: flowering.monthsUK [5, 6]. CLAUDE.md: "A flowering month is an envelope, not a trigger."
  it('flowers in May and June and in no other month, every raceme within the envelope of the taxon file', () => {
    const months = profile.flowering.monthsUK.value!;
    expect(months).toEqual([5, 6]);
    expect(data.flowers.length).toBeGreaterThan(100);
    for (const f of data.flowers) {
      expect(months).toContain(cal.dateOf(f.openDay).month);
      if (f.spentDay >= 0) expect(months).toContain(cal.dateOf(f.spentDay - 1).month);
    }
    expect(flowersIn(`${year}-06-03`, 'open')).toBeGreaterThan(50);
    for (const month of [1, 2, 3, 4, 7, 8, 9, 10, 11, 12]) expect(flowersIn(mid15(month), 'open'), `month ${month}`).toBe(0);
    // nothing flowers until the plant is old enough: no raceme in its first three years (flowering.competenceYears)
    expect(Math.min(...data.flowers.map((f) => f.year))).toBe(2027 + param(model, 'flowering.competenceYears'));
  });

  // morphology: flower.opensRelativeToLeaves "with the leaves"
  it('flowers with its leaves: they are out and still unfolding when the first racemes open, and full grown before the last has gone', () => {
    const flowers = data.flowers.filter((f) => f.year === year);
    const first = Math.min(...flowers.map((f) => f.openDay));
    const last = Math.max(...flowers.map((f) => f.spentDay));
    const seasons = seasonsOf(data, year);
    const expansion = (day: number) => {
      const on = data.leaves.map((l) => leafState(l, seasons.get(l.plantId), day)).filter((s) => s.present);
      return { on: on.length, mean: on.reduce((s, l) => s + l.expansion, 0) / Math.max(1, on.length) };
    };
    const atFirst = expansion(first);
    expect(atFirst.on).toBeGreaterThan(300);
    expect(atFirst.mean).toBeGreaterThan(0.3);
    expect(atFirst.mean).toBeLessThan(0.8);
    expect(expansion(last).mean).toBeGreaterThan(0.95);
  });

  // growth model: organs.racemeLengthM. taxon.json: "racemes that can reach 1 m or more"
  it('hangs racemes of 0.6 to 1.1 m, in bud for weeks before they open', () => {
    const [short, long] = param(model, 'organs.racemeLengthM');
    for (const f of data.flowers) {
      expect(f.lengthM).toBeGreaterThanOrEqual(short);
      expect(f.lengthM).toBeLessThanOrEqual(long);
      // it hangs plumb: the data gives it no direction
      expect(f.direction).toBeUndefined();
      expect(f.openDay - f.developDay).toBeGreaterThan(20);
    }
    expect(Math.max(...data.flowers.map((f) => f.lengthM))).toBeGreaterThan(1);
    expect(flowersIn(`${year}-04-30`, 'in_bud')).toBeGreaterThan(50);
  });

  // growth model: fruit.*. Bean: "produces fertile seed fairly regularly in this country"
  it('sets pods on some of its racemes: green through summer, brown by November, hanging on the bare plant and gone by spring', () => {
    const set = data.fruits.filter((f) => f.year === year);
    const racemes = data.flowers.filter((f) => f.year === year).length;
    expect(set.length).toBeGreaterThan(5);
    // a minority of racemes set, more than the 8% of the W. sinensis model
    expect(set.length / racemes).toBeGreaterThan(0.08);
    expect(set.length / racemes).toBeLessThan(0.3);
    const [short, long] = known(model, 'fruit.lengthM')!;
    for (const f of set) {
      expect(f.lengthM).toBeGreaterThanOrEqual(short);
      expect(f.lengthM).toBeLessThanOrEqual(long);
      // each follows a raceme that went over: it starts where and when one was spent
      expect(data.flowers.some((fl) => fl.spentDay === f.swell[0] && fl.position.every((x, i) => Math.abs(x - f.position[i]!) < 0.002))).toBe(true);
      expect(fruitState(f, cal.dayOf(`${year}-08-01`)).phase).toBe('swelling');
      expect(fruitState(f, cal.dayOf(`${year}-11-20`)).phase).toBe('ripe');
      expect(fruitState(f, cal.dayOf(`${year}-12-31`)).phase).toBe('ripe');
    }
    expect(podsOn(`${year}-05-01`)).toBe(0);
    // the pods of the year before hang through the winter and are gone by April
    expect(podsOn(`${year}-01-10`)).toBeGreaterThan(0);
    expect(podsOn(`${year}-04-01`)).toBe(0);
    expect(podsOn(`${year}-09-15`)).toBe(set.length);
  });

  // taxon.json: attachment.handedness left_handed. A twiner: the data has nothing else for it to hold on with.
  it('has no tendrils, coiled stalks, rootlets or prickles, and one leaf form, one flower form and one fruit form', () => {
    expect(data.appendages).toEqual([]);
    expect(new Set(data.leaves.map((l) => l.form))).toEqual(new Set([undefined]));
    expect(new Set(data.flowers.map((f) => f.form))).toEqual(new Set([undefined]));
    expect(new Set(data.fruits.map((f) => f.form))).toEqual(new Set([undefined]));
  });
});
