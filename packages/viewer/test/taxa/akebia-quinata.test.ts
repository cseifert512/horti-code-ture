import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Calendar, type Growable, appendagePresent, characterNumber, characterRange, characterText, flowerState, fruitState, known, leafState, param, parseGrowthModel, parseMorphology, parseTaxon, readBower, seasonsOf, toRenderData } from '@horti/core';
import { growPlanting } from '../../src/plant/grow.ts';
import { GROUND, triangles } from '../../src/plant/kit.ts';
import { assetsOf, ceilingFor } from '../../src/plant/look.ts';
import { look } from '../../src/plant/taxa/akebia-quinata.ts';
import { specimenPlan } from '../../src/specimen/specimen.ts';

const ID = 'akebia-quinata';
const read = (path: string): unknown => JSON.parse(readFileSync(fileURLToPath(new URL(`../../../../${path}`, import.meta.url)), 'utf8'));
const morphology = parseMorphology(read(`species/${ID}/morphology.json`), `species/${ID}/morphology.json`);
const model = parseGrowthModel(read(`species/${ID}/model.json`), `species/${ID}/model.json`);
const profile = parseTaxon(read(`species/${ID}/taxon.json`), `species/${ID}/taxon.json`);
const mid = (key: string): number => {
  const [low, high] = characterRange(morphology, key);
  return (low + high) / 2;
};

/** The parts of a model that come and go (a leaflet, a flower), by the point each pivots on: its vertices, and its place in the opening. */
function parts(g: THREE.BufferGeometry): { pivot: THREE.Vector3; t: number; points: THREE.Vector3[] }[] {
  const pos = g.getAttribute('position');
  const part = g.getAttribute('aPart');
  const found = new Map<string, { pivot: THREE.Vector3; t: number; points: THREE.Vector3[] }>();
  for (let i = 0; i < pos.count; i++) {
    if (part.getW(i) < 0) continue;
    const pivot = new THREE.Vector3(part.getX(i), part.getY(i), part.getZ(i));
    const key = `${pivot.x.toFixed(6)},${pivot.y.toFixed(6)},${pivot.z.toFixed(6)}`;
    if (!found.has(key)) found.set(key, { pivot, t: part.getW(i), points: [] });
    found.get(key)!.points.push(new THREE.Vector3().fromBufferAttribute(pos, i));
  }
  return [...found.values()];
}
/**
 * The leaflets of a leaf. Every part of a held blade pivots on the top of the leaf stalk (BladeHold), so a leaflet is
 * told by its place in the palette (its t), and its own stalk, which samples the ground of the texture, is left out.
 * `base` is the leaflet's point nearest the top of the stalk.
 */
function leafletsOf(g: THREE.BufferGeometry): { hub: THREE.Vector3; base: THREE.Vector3; length: number; points: THREE.Vector3[]; uv: [number, number][] }[] {
  const pos = g.getAttribute('position');
  const part = g.getAttribute('aPart');
  const uv = g.getAttribute('uv');
  const found = new Map<string, { hub: THREE.Vector3; points: THREE.Vector3[]; uv: [number, number][] }>();
  for (let i = 0; i < pos.count; i++) {
    if (part.getW(i) < 0) continue;
    if (Math.abs(uv.getX(i) - GROUND[0]) < 1e-6 && Math.abs(uv.getY(i) - GROUND[1]) < 1e-6) continue;
    const key = part.getW(i).toFixed(6);
    if (!found.has(key)) found.set(key, { hub: new THREE.Vector3(part.getX(i), part.getY(i), part.getZ(i)), points: [], uv: [] });
    found.get(key)!.points.push(new THREE.Vector3().fromBufferAttribute(pos, i));
    found.get(key)!.uv.push([uv.getX(i), uv.getY(i)]);
  }
  return [...found.values()].map((l) => {
    const base = l.points.reduce((a, b) => (a.distanceTo(l.hub) <= b.distanceTo(l.hub) ? a : b));
    return { ...l, base, length: Math.max(...l.points.map((q) => q.distanceTo(base))) };
  });
}
/** How far the vertices of a part reach from its pivot. */
const reachOf = (p: { pivot: THREE.Vector3; points: THREE.Vector3[] }): number => Math.max(...p.points.map((q) => q.distanceTo(p.pivot)));
/** The widest a set of points is across, in any direction. */
function across(points: THREE.Vector3[]): number {
  const step = Math.max(1, Math.floor(points.length / 300));
  let widest = 0;
  for (let i = 0; i < points.length; i += step) for (let j = i + 1; j < points.length; j += step) widest = Math.max(widest, points[i]!.distanceTo(points[j]!));
  return widest;
}

// species/akebia-quinata/SPECIES_PROFILE.md, "Form: what the model draws": "A hand of five leaflets (now and then
// four) on a slender stalk longer than the leaflets ... rounded and notched at the tip"; TAXON_LOOKS.md section 8:
// "counts and measured sizes (leaflets, tepals, the length of a leaflet for its width) come from the file".
describe('the leaf of Akebia quinata agrees with its morphology file', () => {
  const leaf = look.leaves.default;
  const whole = mid('leaf.petioleLengthM') + mid('leaf.terminalPetioluleLengthM') + mid('leaf.terminalLeafletLengthM');

  it('has five leaflets, as Flora of China gives it, and now and then one fewer but never fewer than the fewest recorded', () => {
    const usual = characterNumber(morphology, 'leaf.leafletCount');
    const [fewest, most] = characterRange(morphology, 'leaf.leafletCountRange');
    const counts = Array.from({ length: leaf.variants }, (_, v) => leafletsOf(leaf.make(v, 0)).length);
    expect(counts.filter((n) => n === usual).length).toBeGreaterThanOrEqual(leaf.variants - 1);
    for (const n of counts) {
      expect(n).toBeGreaterThanOrEqual(fewest);
      expect(n).toBeLessThanOrEqual(most);
    }
    // the same leaflets at every level of detail
    for (let v = 0; v < leaf.variants; v++) for (let lod = 1; lod < leaf.lods; lod++) expect(leafletsOf(leaf.make(v, lod)).length, `variant ${v} level ${lod}`).toBe(counts[v]);
    // most leaves drawn are the usual five
    const picked = Array.from({ length: 200 }, (_, i) => counts[leaf.pick(0.12, (i + 0.5) / 200)]!);
    expect(picked.filter((n) => n === usual).length / picked.length).toBeGreaterThan(0.8);
  });

  it('gives the stalk, the end leaflet and the side leaflets the shares of the leaf that the floras measure', () => {
    const [ratioLow, ratioHigh] = characterRange(morphology, 'leaf.leafletLengthToWidth');
    for (let v = 0; v < leaf.variants; v++) {
      const leaflets = leafletsOf(leaf.make(v, 0));
      // the end leaflet is the one that reaches farthest along the leaf
      const end = leaflets.reduce((a, b) => (Math.max(...a.points.map((q) => q.z)) > Math.max(...b.points.map((q) => q.z)) ? a : b));
      expect(end.length, `variant ${v}: end leaflet`).toBeCloseTo(mid('leaf.terminalLeafletLengthM') / whole, 1);
      // its stalk starts where the leaf stalk ends: the leaf stalk is more than half the leaf, as measured
      const stalkShare = mid('leaf.petioleLengthM') / whole;
      expect(stalkShare).toBeGreaterThan(0.5);
      expect(end.hub.length(), `variant ${v}: leaf stalk`).toBeCloseTo(stalkShare, 1);
      expect(end.base.length(), `variant ${v}: stalk and end leaflet's stalk`).toBeCloseTo((mid('leaf.petioleLengthM') + mid('leaf.terminalPetioluleLengthM')) / whole, 1);
      for (const l of leaflets) {
        // no leaflet is longer than the longest end leaflet recorded, for a leaf of ordinary length
        expect(l.length, `variant ${v}`).toBeLessThan((characterRange(morphology, 'leaf.terminalLeafletLengthM')[1] / whole) * 1.05);
        // as wide for its length as the floras give (1.5 to 2.5 cm for 2 to 5 cm) and the photographs show
        const widest = across(l.points.filter((q) => Math.abs(q.distanceTo(l.base) / l.length - 0.58) < 0.08));
        const ratio = l.length / widest;
        expect(ratio, `variant ${v}: length for width`).toBeGreaterThan(ratioLow * 0.85);
        expect(ratio, `variant ${v}: length for width`).toBeLessThan(ratioHigh * 1.1);
      }
    }
    expect(mid('leaf.leafletWidthM') / mid('leaf.leafletLengthM')).toBeGreaterThan(0.4);
    expect(mid('leaf.leafletWidthM') / mid('leaf.leafletLengthM')).toBeLessThan(0.8);
  });

  it('is notched at the tip of each leaflet: the midrib stops short of the shoulders either side of it', () => {
    expect(characterText(morphology, 'leaf.leafletApex')).toContain('notched');
    for (const l of leafletsOf(leaf.make(0, 0))) {
      // along the leaflet's own line, the farthest point is not on the midrib (the texture's u = 0.5) but beside it
      let onMidrib = 0;
      let beside = 0;
      l.points.forEach((q, i) => {
        const d = q.distanceTo(l.base);
        const u = Math.abs(l.uv[i]![0] - 0.5);
        if (u < 0.01) onMidrib = Math.max(onMidrib, d);
        else if (u < 0.3) beside = Math.max(beside, d);
      });
      expect(beside).toBeGreaterThan(onMidrib * 1.01);
    }
  });

  it('is authored one unit long, stem to tip, so that the length in the data is the length drawn', () => {
    for (let v = 0; v < leaf.variants; v++) {
      const g = leaf.make(v, 0);
      g.computeBoundingBox();
      expect(g.boundingBox!.max.z, `variant ${v}`).toBeGreaterThan(0.9);
      expect(g.boundingBox!.max.z, `variant ${v}`).toBeLessThan(1.05);
      expect(g.boundingBox!.min.z, `variant ${v}`).toBeGreaterThan(-0.05);
    }
    // and the growth model grows leaves of the length those parts add up to
    const [low, high] = param(model, 'organs.leafLengthM');
    expect(low).toBeCloseTo(characterRange(morphology, 'leaf.petioleLengthM')[0] + characterRange(morphology, 'leaf.terminalPetioluleLengthM')[0] + characterRange(morphology, 'leaf.terminalLeafletLengthM')[0], 6);
    expect(high).toBeCloseTo(characterRange(morphology, 'leaf.petioleLengthM')[1] + characterRange(morphology, 'leaf.terminalPetioluleLengthM')[1] + characterRange(morphology, 'leaf.terminalLeafletLengthM')[1], 6);
  });
});

// SPECIES_PROFILE.md, "Form: what the model draws": "Where the bare stalk ends stand one or two female flowers ...
// Below them, towards the tip, are four to ten male flowers ... The female flowers open first and the male ones
// after them, base to tip"; TAXON_LOOKS.md section 2: a flower's authoredSize is in the units of RenderFlower.lengthM.
describe('the raceme of Akebia quinata agrees with its morphology file', () => {
  const raceme = look.flowers!.default;
  const [femaleFew, femaleMany] = characterRange(morphology, 'inflorescence.femaleFlowerCount');
  const [maleFew, maleMany] = characterRange(morphology, 'inflorescence.maleFlowerCount');
  /** The flowers of a variant: the female ones open first, and are the large ones. */
  const flowersOf = (v: number, lod = 0) => {
    const all = parts(raceme.make(v, lod)).sort((a, b) => a.t - b.t);
    const female = all.filter((f) => f.t < 0.2);
    return { female, male: all.filter((f) => f.t >= 0.2) };
  };

  it('is authored at the length the growth model grows it to: 6 to 12 cm, stalk and all, hanging', () => {
    expect(raceme.authoredSize).toBeCloseTo(mid('inflorescence.lengthM'), 6);
    expect(param(model, 'organs.racemeLengthM')).toEqual(characterRange(morphology, 'inflorescence.lengthM'));
    expect(model.params['organs.racemeLengthM'].source).toBe(morphology.characters['inflorescence.lengthM']!.source);
    expect(characterText(morphology, 'inflorescence.held')).toBe('pendent');
    expect(model.names.flowerHeld).toBe('hanging');
    expect(raceme.poise).toBe('hangs');
    for (let v = 0; v < raceme.variants; v++) {
      const g = raceme.make(v, 0);
      g.computeBoundingBox();
      // it hangs about its own length below where it is attached, and nothing of it stands above
      expect(-g.boundingBox!.min.y / raceme.authoredSize, `variant ${v}`).toBeGreaterThan(0.85);
      expect(-g.boundingBox!.min.y / raceme.authoredSize, `variant ${v}`).toBeLessThan(1.15);
      expect(g.boundingBox!.max.y, `variant ${v}`).toBeLessThan(0.006);
    }
  });

  it('has one or two female flowers and four to ten male ones, the female at the foot and the male below them towards the tip', () => {
    for (let v = 0; v < raceme.variants; v++) {
      const { female, male } = flowersOf(v);
      expect(female.length, `variant ${v}`).toBeGreaterThanOrEqual(femaleFew);
      expect(female.length, `variant ${v}`).toBeLessThanOrEqual(femaleMany);
      expect(male.length, `variant ${v}`).toBeGreaterThanOrEqual(maleFew);
      expect(male.length, `variant ${v}`).toBeLessThanOrEqual(maleMany);
      // every flower hangs below the bare stalk of the raceme, which is 2 cm long at the least
      const stalk = characterRange(morphology, 'inflorescence.peduncleLengthM')[0];
      for (const f of [...female, ...male]) expect(-f.pivot.y, `variant ${v}`).toBeGreaterThan(stalk);
      // and the male flowers hang below the female ones' place on the axis: towards the tip
      for (const f of male) expect(-f.pivot.y, `variant ${v}`).toBeGreaterThan(stalk * 1.3);
      // the same flowers at every level of detail
      for (let lod = 1; lod < raceme.lods; lod++) {
        const coarse = flowersOf(v, lod);
        expect([coarse.female.length, coarse.male.length], `variant ${v} level ${lod}`).toEqual([female.length, male.length]);
      }
    }
    // both numbers of female flowers are drawn
    const females = new Set(Array.from({ length: raceme.variants }, (_, v) => flowersOf(v).female.length));
    expect([...females].sort()).toEqual([femaleFew, femaleMany]);
  });

  it('draws the female flowers two to three centimetres across and the male ones about half that', () => {
    const [fLow, fHigh] = characterRange(morphology, 'flower.female.widthM');
    const [mLow, mHigh] = characterRange(morphology, 'flower.male.widthM');
    // across a flower: twice as far as its sepals reach from its middle
    const diameter = (f: { pivot: THREE.Vector3; points: THREE.Vector3[] }) => 2 * reachOf(f);
    for (let v = 0; v < raceme.variants; v++) {
      const { female, male } = flowersOf(v);
      for (const f of female) {
        expect(diameter(f), `variant ${v}: female`).toBeGreaterThan(fLow);
        expect(diameter(f), `variant ${v}: female`).toBeLessThan(fHigh * 1.1);
      }
      for (const f of male) {
        expect(diameter(f), `variant ${v}: male`).toBeGreaterThan(mLow * 0.9);
        expect(diameter(f), `variant ${v}: male`).toBeLessThan(mHigh * 1.1);
      }
      // the female flowers are about twice the size of the male (Huang et al. 2022)
      expect(diameter(female[0]!) / diameter(male[0]!), `variant ${v}`).toBeGreaterThan(1.5);
    }
    // a female sepal is as long as the floras give it: 1 to 2 cm
    const [sLow, sHigh] = characterRange(morphology, 'flower.female.sepalLengthM');
    const { female } = flowersOf(0);
    expect(reachOf(female[0]!)).toBeGreaterThan(sLow);
    expect(reachOf(female[0]!)).toBeLessThan(sHigh);
  });

  it('opens the female flowers before the male, and the male from the base of the raceme to its tip', () => {
    expect(characterText(morphology, 'inflorescence.openingOrder')).toContain('female flowers at the base first');
    for (let v = 0; v < raceme.variants; v++) {
      const { female, male } = flowersOf(v);
      const lastFemale = Math.max(...female.map((f) => f.t));
      expect(Math.min(...male.map((f) => f.t)), `variant ${v}`).toBeGreaterThan(lastFemale + 0.1);
      // lower on the hanging raceme is nearer its tip: later
      const byHeight = [...male].sort((a, b) => b.pivot.y - a.pivot.y);
      for (let i = 1; i < byHeight.length; i++) expect(byHeight[i]!.t, `variant ${v}`).toBeGreaterThanOrEqual(byHeight[i - 1]!.t);
    }
  });

  it('keeps its stalks when the flowers drop, and nothing else: every flower is a part, sepals, stamens and carpels together', () => {
    const g = raceme.make(0, 0);
    const part = g.getAttribute('aPart');
    const pos = g.getAttribute('position');
    let axis = 0;
    let flower = 0;
    let widestAxis = 0;
    for (let i = 0; i < pos.count; i++) {
      if (part.getW(i) < 0) {
        axis++;
        // what stays is slender: stalks and bud scales, within a few millimetres of the line they run on
        widestAxis = Math.max(widestAxis, Math.hypot(pos.getX(i) - part.getX(i), pos.getY(i) - part.getY(i), pos.getZ(i) - part.getZ(i)));
      } else flower++;
    }
    expect(axis).toBeGreaterThan(50);
    expect(flower).toBeGreaterThan(axis);
    expect(widestAxis).toBeLessThan(0.01);
  });
});

// SPECIES_PROFILE.md, "Form: what the model draws": "sausage-shaped, 5 to 8 cm long and 3 to 4 cm thick, hanging by
// the stalk the flower had, singly or two or three together".
describe('the fruit of Akebia quinata agrees with its morphology file', () => {
  const fruit = look.fruits!.default;

  it('is authored at the length of one follicle, which is the length the growth model sets it', () => {
    expect(fruit.authoredSize).toBeCloseTo(mid('fruit.lengthM'), 6);
    expect(known(model, 'fruit.lengthM')).toEqual(characterRange(morphology, 'fruit.lengthM'));
    expect(model.params['fruit.lengthM'].source).toBe(morphology.characters['fruit.lengthM']!.source);
    expect(model.names.fruitHeld).toBe('hanging');
    expect(fruit.poise).toBe('hangs');
  });

  it('hangs by a stalk, one to three follicles to a fruit, each about half as thick as it is long', () => {
    const [fewest, most] = characterRange(morphology, 'fruit.perFlower');
    const [wLow, wHigh] = characterRange(morphology, 'fruit.widthM');
    const [lLow, lHigh] = characterRange(morphology, 'fruit.lengthM');
    const widths: number[] = [];
    for (let v = 0; v < fruit.variants; v++) {
      const g = fruit.make(v, 0);
      g.computeBoundingBox();
      const { min, max } = g.boundingBox!;
      // below the attachment by its stalk and its own length, give or take the spread of a cluster
      const hang = -min.y;
      expect(hang, `variant ${v}`).toBeGreaterThan(fruit.authoredSize * 1.3);
      expect(hang, `variant ${v}`).toBeLessThan(fruit.authoredSize * 2.2);
      expect(max.y, `variant ${v}`).toBeLessThan(0.004);
      widths.push(Math.max(max.x - min.x, max.z - min.z));
    }
    // the single follicle is as thick as the Flora of China gives it for its length
    expect(widths[0]!).toBeGreaterThan(wLow * 0.9);
    expect(widths[0]!).toBeLessThan(wHigh * 1.25);
    expect(widths[0]! / fruit.authoredSize).toBeGreaterThan(wLow / lHigh);
    expect(widths[0]! / fruit.authoredSize).toBeLessThan(wHigh / lLow);
    // clusters are wider than a single one
    for (let v = 1; v < fruit.variants; v++) expect(widths[v]!, `variant ${v}`).toBeGreaterThan(widths[0]! * 1.2);
    expect(fruit.variants).toBeGreaterThanOrEqual(fewest);
    expect(fruit.variants).toBeLessThanOrEqual(most);
    // most fruits drawn are single
    const single = Array.from({ length: 100 }, (_, i) => fruit.pick((i + 0.5) / 100)).filter((v) => v === 0).length;
    expect(single).toBeGreaterThan(50);
  });
});

// TAXON_LOOKS.md section 6, "Levels of detail and triangle budgets"; section 1: "provisional: false once the leaf
// is the plant's own".
describe('every organ model of Akebia quinata', () => {
  it('builds at every level of detail, finite, within the budget it states and the ceiling for its kind', () => {
    const assets = assetsOf(look);
    expect(assets.map((a) => a.kind).sort()).toEqual(['flower', 'fruit', 'leaf']);
    for (const { kind, asset } of assets) {
      expect(asset.key.startsWith(`${ID}/`), asset.key).toBe(true);
      expect(asset.budget.length, asset.key).toBe(asset.lods);
      for (let lod = 0; lod < asset.lods; lod++) {
        expect(asset.budget[lod]!, `${asset.key} level ${lod}`).toBeLessThanOrEqual(ceilingFor(kind, lod, asset.lods));
        for (let v = 0; v < asset.variants; v++) {
          const g = asset.make(v, lod);
          expect(triangles(g), `${asset.key} variant ${v} level ${lod}`).toBeLessThanOrEqual(asset.budget[lod]!);
          expect(triangles(g), `${asset.key} variant ${v} level ${lod}`).toBeGreaterThan(8);
          for (const name of ['position', 'normal']) {
            const a = g.getAttribute(name).array;
            let bad = -1;
            for (let i = 0; i < a.length && bad < 0; i++) if (!Number.isFinite(a[i])) bad = i;
            expect(bad, `${asset.key} variant ${v} level ${lod}: ${name}`).toBe(-1);
          }
        }
      }
      // each coarser level is lighter than the one before, and the far level a small fraction of the near one
      const counts = Array.from({ length: asset.lods }, (_, lod) => triangles(asset.make(0, lod)));
      for (let lod = 1; lod < asset.lods; lod++) expect(counts[lod]!, `${asset.key} level ${lod}`).toBeLessThan(counts[lod - 1]!);
      expect(counts[asset.lods - 1]! / counts[0]!, asset.key).toBeLessThan(0.12);
    }
  });

  it('is the plant’s own look, with no holdfast: it is a twiner', () => {
    expect(look.taxonId).toBe(ID);
    expect(look.provisional).toBe(false);
    expect(look.leaves.default.key).toBe(`${ID}/leaf`);
    expect(Object.keys(look.appendages)).toEqual([]);
    expect(profile.attachment.mechanism).toBe('stem_twining');
    for (const key of ['appendages.tendrilLengthM', 'appendages.leafStalkLengthM', 'appendages.aerialRootLengthM', 'appendages.prickleLengthM'] as const) expect(known(model, key), key).toEqual([0, 0]);
  });
});

// CLAUDE.md: "A flowering month is an envelope, not a trigger. Never show flowers because the calendar says so."
// SPECIES_PROFILE.md, "Form: what the model draws", "Through the year, as the model shows it", gives the months;
// the core's render/presence.ts answers what is on the plant on a day, and nothing here works out a season.
describe('a specimen of Akebia quinata through its eighth year', () => {
  const years = 8;
  const frame = readBower(read('examples/specimen-frame.bower.json'), 'examples/specimen-frame.bower.json');
  const taxa: Growable = new Map([[ID, { profile, model }]]);
  const { sim } = growPlanting({ bower: frame.bower, plan: specimenPlan(ID), viewpoints: frame.viewpoints }, taxa, 'trained', years);
  const data = toRenderData(sim);
  const cal = new Calendar(data.start);
  const last = cal.dateOf(data.lastDay).year;
  /** The months of the last year in which `test` is true on some day. */
  const months = (test: (day: number) => boolean): number[] => {
    const found = new Set<number>();
    for (let day = cal.dayOf(`${last}-01-01`); day <= data.lastDay; day++) if (test(day)) found.add(cal.dateOf(day).month);
    return [...found].sort((a, b) => a - b);
  };
  const leavesOn = (iso: string): number => {
    const day = cal.dayOf(iso);
    const seasons = seasonsOf(data, cal.dateOf(day).year);
    return data.leaves.filter((l) => leafState(l, seasons.get(l.plantId), day).present).length;
  };

  it('has covered the frame: thousands of leaves in summer on some hundred metres of stem, not a few sprigs', () => {
    const end = sim.summaries.find((s) => s.year === last)!;
    expect(end.frameworkM).toBeGreaterThan(60);
    expect(end.routeShare).toBeGreaterThan(0.7);
    expect(leavesOn(`${last}-07-15`)).toBeGreaterThan(2500);
    expect(leavesOn(`${last}-07-15`)).toBeLessThan(9000);
    // slender stems: the thickest is no stouter than a thumb
    const thickest = Math.max(...data.stems.map((s) => Math.max(...s.radiusMm))) * 2;
    expect(thickest).toBeGreaterThan(characterRange(morphology, 'stem.oldDiameterM')[0] * 1000);
    expect(thickest).toBeLessThan(characterRange(morphology, 'stem.oldDiameterM')[1] * 1000 * 1.5);
  });

  it('is semi-evergreen: in full leaf from spring to late autumn, and keeps some of its leaves through winter', () => {
    expect(profile.leafHabit.value).toBe('semi_evergreen');
    const share = known(model, 'organs.winterLeafShare')!;
    expect(share).toBeGreaterThan(0);
    expect(share).toBeLessThan(1);
    const inLeaf = months((day) => {
      const seasons = seasonsOf(data, cal.dateOf(day).year);
      return data.leaves.some((l) => leafState(l, seasons.get(l.plantId), day).present);
    });
    expect(inLeaf).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    // in winter, some of last year's leaves and no others: roughly the share kept, of what was out in late autumn
    const summer = leavesOn(`${last - 1}-07-15`);
    for (const iso of [`${last}-01-20`, `${last}-02-20`]) {
      const winter = leavesOn(iso);
      expect(winter, iso).toBeGreaterThan(summer * share * 0.5);
      expect(winter, iso).toBeLessThan(summer * share * 1.6);
    }
    // the leaves are out by the time the racemes are at their fullest, and most are still on in late November
    expect(leavesOn(`${last}-04-20`)).toBeGreaterThan(leavesOn(`${last}-07-15`) * 0.6);
    expect(leavesOn(`${last}-11-25`)).toBeGreaterThan(leavesOn(`${last}-07-15`) * 0.9);
  });

  it('flowers in spring and at no other time: racemes open from late March to mid May, most of them in April', () => {
    expect(data.flowers.length).toBeGreaterThan(50);
    const open = (day: number) => data.flowers.filter((f) => flowerState(f, day).phase === 'open').length;
    expect(months((day) => open(day) > 0)).toEqual([3, 4, 5]);
    const april = open(cal.dayOf(`${last}-04-22`));
    expect(april).toBeGreaterThan(60);
    expect(april).toBeLessThan(400);
    for (const iso of [`${last}-01-15`, `${last}-02-15`, `${last}-03-10`, `${last}-05-25`, `${last}-06-15`, `${last}-08-15`, `${last}-10-15`, `${last}-12-15`]) expect(open(cal.dayOf(iso)), iso).toBe(0);
    // none in the plant's first two springs: it flowers from wood of earlier years once it is established
    expect(data.flowers.filter((f) => f.year < 2029)).toHaveLength(0);
    // each hangs, plumb, from a short branch (the model's spur): none stands at a node of a long shoot
    const roles = new Map(data.stems.map((s) => [s.id, s.role]));
    for (const f of data.flowers) {
      expect(roles.get(f.stemId)).toBe('spur');
      expect(f.direction).toBeUndefined();
      expect(f.lengthM).toBeGreaterThanOrEqual(characterRange(morphology, 'inflorescence.lengthM')[0]);
      expect(f.lengthM).toBeLessThanOrEqual(characterRange(morphology, 'inflorescence.lengthM')[1]);
    }
    expect(profile.flowering.wood.value).toBe('previous_season');
  });

  it('sets a few fruits where it sets any, which swell through summer, turn violet in September and October and are gone by December', () => {
    const lastYear = data.fruits.filter((f) => f.year === last);
    // seldom, and never abundantly (Bean): a handful to some hundreds of racemes
    expect(data.fruits.length).toBeGreaterThan(0);
    expect(lastYear.length).toBeLessThan(data.flowers.filter((f) => f.year === last).length * 0.1);
    const on = (day: number) => data.fruits.filter((f) => fruitState(f, day).phase !== 'absent');
    const present = months((day) => on(day).length > 0);
    for (const m of present) expect([4, 5, 6, 7, 8, 9, 10, 11]).toContain(m);
    expect(present).toEqual(expect.arrayContaining([6, 7, 8, 9, 10]));
    const ripe = months((day) => on(day).some((f) => fruitState(f, day).ripeness >= 1));
    for (const m of ripe) expect([9, 10, 11]).toContain(m);
    const turning = months((day) => on(day).some((f) => fruitState(f, day).ripeness > 0 && fruitState(f, day).ripeness < 1));
    for (const m of turning) expect([9, 10]).toContain(m);
    for (const iso of [`${last}-01-15`, `${last}-02-15`, `${last}-03-15`, `${last}-12-15`]) expect(on(cal.dayOf(iso)), iso).toHaveLength(0);
    // each follows a raceme that went over on the plant, hangs where it hung, and is of a size the flora gives
    for (const f of data.fruits) {
      expect(data.flowers.some((fl) => fl.stemId === f.stemId && fl.spentDay === f.swell[0])).toBe(true);
      expect(f.direction).toBeUndefined();
      expect(f.lengthM).toBeGreaterThanOrEqual(characterRange(morphology, 'fruit.lengthM')[0]);
      expect(f.lengthM).toBeLessThanOrEqual(characterRange(morphology, 'fruit.lengthM')[1]);
    }
  });

  it('holds on with its stems alone: the run has no tendril, coiled stalk, rootlet or prickle', () => {
    expect(data.appendages.filter((a) => appendagePresent(a, data.lastDay))).toHaveLength(0);
    expect(data.appendages).toHaveLength(0);
    // and names no form of leaf, flower or fruit that the look would have to guess at
    expect(new Set(data.leaves.map((l) => l.form))).toEqual(new Set([undefined]));
    expect(new Set(data.flowers.map((f) => f.form))).toEqual(new Set([undefined]));
    expect(new Set(data.fruits.map((f) => f.form))).toEqual(new Set([undefined]));
  });
});
