import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Calendar, type Growable, appendagePresent, characterNumber, characterRange, characterText, flowerState, fruitState, known, leafState, param, parseGrowthModel, parseMorphology, parseTaxon, readBower, seasonsOf, toRenderData } from '@horti/core';
import { growPlanting } from '../../src/plant/grow.ts';
import { triangles } from '../../src/plant/kit.ts';
import { assetsOf, ceilingFor } from '../../src/plant/look.ts';
import { look } from '../../src/plant/taxa/rosa-the-generous-gardener.ts';
import { specimenPlan } from '../../src/specimen/specimen.ts';

const ID = 'rosa-the-generous-gardener';
const read = (path: string): unknown => JSON.parse(readFileSync(fileURLToPath(new URL(`../../../../${path}`, import.meta.url)), 'utf8'));
const morphology = parseMorphology(read(`species/${ID}/morphology.json`), `species/${ID}/morphology.json`);
const model = parseGrowthModel(read(`species/${ID}/model.json`), `species/${ID}/model.json`);
const profile = parseTaxon(read(`species/${ID}/taxon.json`), `species/${ID}/taxon.json`);
const mid = (r: readonly [number, number]): number => (r[0] + r[1]) / 2;

const leaf = look.leaves.default;
const spray = look.flowers!.default;
const hips = look.fruits!.default;
const prickle = look.appendages.prickle!;

/** The vertices of each part of a model that comes and goes (a leaflet, a petal, a hip), by the point it pivots on and its tag. */
function parts(g: THREE.BufferGeometry, wanted: (t: number) => boolean = (t) => t >= 0): Map<string, THREE.Vector3[]> {
  const pos = g.getAttribute('position');
  const part = g.getAttribute('aPart');
  const out = new Map<string, THREE.Vector3[]>();
  for (let i = 0; i < pos.count; i++) {
    if (!wanted(part.getW(i))) continue;
    const key = `${part.getX(i).toFixed(5)},${part.getY(i).toFixed(5)},${part.getZ(i).toFixed(5)}`;
    if (!out.has(key)) out.set(key, []);
    out.get(key)!.push(new THREE.Vector3().fromBufferAttribute(pos, i));
  }
  return out;
}
const pivotOf = (key: string): THREE.Vector3 => new THREE.Vector3(...(key.split(',').map(Number) as [number, number, number]));
/** The tags of the parts of a flower model: when each opens. */
function tags(g: THREE.BufferGeometry): number[] {
  const part = g.getAttribute('aPart');
  const seen = new Set<number>();
  for (let i = 0; i < part.count; i++) if (part.getW(i) >= 0) seen.add(Math.round(part.getW(i) * 1e6) / 1e6);
  return [...seen].sort((a, b) => a - b);
}
/** The widest a cloud of points reaches. */
function span(points: readonly THREE.Vector3[]): number {
  const step = Math.max(1, Math.floor(points.length / 300));
  let widest = 0;
  for (let i = 0; i < points.length; i += step) for (let j = i + 1; j < points.length; j += step) widest = Math.max(widest, points[i]!.distanceTo(points[j]!));
  return widest;
}

// TAXON_LOOKS.md section 8, "Shape numbers from species/<id>/morphology.json": "counts and measured sizes (leaflets,
// tepals, the length of a leaflet for its width) come from the file".
describe("the leaf of Rosa 'The Generous Gardener'", () => {
  const usual = characterRange(morphology, 'leaf.leafletCount');
  const reduced = characterNumber(morphology, 'leaf.leafletCountUnderFlower');

  it('has the leaflets the morphology file gives: three under a flower, five or seven elsewhere, at every level of detail', () => {
    expect(leaf.variants).toBe(3);
    for (let lod = 0; lod < leaf.lods; lod++) {
      expect([0, 1, 2].map((v) => parts(leaf.make(v, lod)).size)).toEqual([reduced, usual[0], usual[1]]);
    }
    // an odd-pinnate leaf: one end leaflet and the rest in pairs
    expect(characterText(morphology, 'leaf.division')).toBe('odd-pinnate');
    for (const n of [reduced, ...usual]) expect(n % 2).toBe(1);
    // the counts drawn lie inside what the plant record gives
    const recorded = characterRange(morphology, 'leaf.leafletCountRecorded');
    for (const n of [reduced, ...usual]) expect(n >= recorded[0] && n <= recorded[1]).toBe(true);
  });

  it('draws each leaflet ovate, as wide for its length as the file says', () => {
    const want = characterNumber(morphology, 'leaf.leafletWidthToLength');
    expect(characterText(morphology, 'leaf.leafletShape')).toBe('ovate');
    // the middle level has the outline without the teeth
    for (let v = 0; v < leaf.variants; v++) {
      for (const [key, points] of parts(leaf.make(v, 1))) {
        const base = pivotOf(key);
        const tip = points.reduce((far, p) => (p.distanceTo(base) > far.distanceTo(base) ? p : far), base);
        const axis = tip.clone().sub(base);
        const length = axis.length();
        axis.normalize();
        let half = 0;
        let widestAt = 0;
        for (const p of points) {
          const along = p.clone().sub(base).dot(axis);
          const off = p.clone().sub(base).addScaledVector(axis, -along).length();
          if (off > half) {
            half = off;
            widestAt = along / length;
          }
        }
        expect((2 * half) / length, `variant ${v}`).toBeGreaterThan(want * 0.88);
        expect((2 * half) / length, `variant ${v}`).toBeLessThan(want * 1.12);
        // ovate: broadest below the middle
        expect(widestAt).toBeLessThan(0.5);
      }
    }
  });

  it('cuts the margin into teeth on the finest model only', () => {
    expect(characterText(morphology, 'leaf.margin')).toBe('serrate');
    // along a toothed margin the outline goes in and out; along a plain one it swells once and narrows
    const turns = (lod: number): number => {
      const points = [...parts(leaf.make(1, lod)).values()][0]!;
      const edge = points.filter((_p, i) => i % (lod === 0 ? 7 : 5) === 0).map((p) => Math.abs(p.x));
      let n = 0;
      for (let i = 2; i < edge.length; i++) if ((edge[i]! - edge[i - 1]!) * (edge[i - 1]! - edge[i - 2]!) < 0) n++;
      return n;
    };
    expect(turns(0)).toBeGreaterThan(8);
    expect(turns(1)).toBeLessThanOrEqual(2);
  });

  it('gives the shortest leaves the reduced form some of the time, and no leaf a form it has not', () => {
    const [short, long] = param(model, 'organs.leafLengthM');
    const picks = (length: number): Set<number> => new Set([0, 0.1, 0.3, 0.52, 0.56, 0.7, 0.9, 0.999].map((r) => leaf.pick(length, r)));
    expect(picks(short * 0.9).has(0)).toBe(true);
    expect(picks(long).has(0)).toBe(false);
    expect([...picks(long)].sort()).toEqual([1, 2]);
  });

  // RHS plant record: "glossy green leaves"; the breeder: "polished dark green foliage".
  it('is dark and glossy, with young growth redder than it is green', () => {
    expect(characterText(morphology, 'leaf.surface')).toContain('glossy');
    expect(leaf.roughness).toBeLessThan(0.45);
    for (const green of [leaf.palette.greenA, leaf.palette.greenB]) {
      expect(green[1]).toBeGreaterThan(green[0]);
      expect(green[1]).toBeLessThan(0.25);
    }
    expect(characterText(morphology, 'leaf.colourYoung')).toBe('burgundy');
    expect(leaf.palette.young[0]).toBeGreaterThan(leaf.palette.young[1] * 2);
  });
});

// TAXON_LOOKS.md section 2, "Frames and units": a flower's authoredSize is "in the units of RenderFlower.lengthM",
// and "what lengthM measures is the taxon's"; section 4, "Parts": petals are parts, the stalk and calyx are axis.
describe('the spray of flowers', () => {
  const petals = Math.round(mid(characterRange(morphology, 'flower.petalCount')));
  const most = characterRange(morphology, 'inflorescence.flowerCount');
  /** Parts tagged later than the opening ever reaches: buds that stay shut. */
  const SHUT = 1.2;

  it('is authored at the width of a spray, which is what the growth model and the morphology file both say the length measures', () => {
    expect(characterText(morphology, 'inflorescence.measuredAs')).toContain('width of the spray');
    expect(spray.authoredSize).toBeCloseTo(mid(characterRange(morphology, 'inflorescence.widthM')), 9);
    expect(param(model, 'organs.racemeLengthM')).toEqual(characterRange(morphology, 'inflorescence.widthM'));
    expect(spray.poise).toBe('held');
    expect(model.names.flowerHeld).toBe('facing_out');
  });

  it('gives each flower that opens the petals of the plant record, and each spray no more buds than the file allows', () => {
    const record = characterRange(morphology, 'flower.petalCount');
    expect(petals >= record[0] && petals <= record[1]).toBe(true);
    const opening: number[] = [];
    for (let v = 0; v < spray.variants; v++) {
      // the two finest models have every petal; the far ones fewer, drawn wider
      for (const lod of [0, 1]) {
        const all = tags(spray.make(v, lod));
        const open = all.filter((t) => t < SHUT).length;
        const shut = all.filter((t) => t >= SHUT).length;
        expect(open % petals, `variant ${v} level ${lod}`).toBe(0);
        const flowers = open / petals;
        expect(flowers).toBeGreaterThanOrEqual(1);
        expect(flowers + shut).toBeGreaterThanOrEqual(most[0]);
        expect(flowers + shut).toBeLessThanOrEqual(most[1]);
        if (lod === 0) opening.push(flowers);
      }
      expect(tags(spray.make(v, 2)).filter((t) => t < SHUT).length).toBeLessThan(tags(spray.make(v, 0)).filter((t) => t < SHUT).length);
    }
    // singly or in small clusters: sprays of one, two and three open flowers
    expect([...new Set(opening)].sort()).toEqual([1, 2, 3]);
  });

  it('opens the end flower first and the others after it, each within a short spell', () => {
    for (let v = 0; v < spray.variants; v++) {
      const open = tags(spray.make(v, 0)).filter((t) => t < SHUT);
      expect(open[0]).toBe(0);
      expect(open.at(-1)!).toBeLessThan(1);
      // the petals of one flower open together: the tags fall into as many tight groups as there are flowers
      let groups = 1;
      for (let i = 1; i < open.length; i++) if (open[i]! - open[i - 1]! > 0.1) groups++;
      expect(groups).toBe(open.length / petals);
    }
  });

  it('draws a flower of the breeder’s bloom size at every length the growth model gives a spray', () => {
    const bloom = characterRange(morphology, 'flower.diameterM');
    const lengths = param(model, 'organs.racemeLengthM');
    for (let v = 0; v < spray.variants; v++) {
      const g = spray.make(v, 0);
      // the end flower: the parts that open first
      const first = [...parts(g, (t) => t >= 0 && t < 0.2).values()].flat();
      const across = span(first);
      expect((across * lengths[0]) / spray.authoredSize, `variant ${v}`).toBeGreaterThan(bloom[0]);
      expect((across * lengths[1]) / spray.authoredSize, `variant ${v}`).toBeLessThan(bloom[1] * 1.05);
    }
  });

  it('keeps stalks, calyx and stamens when the petals have gone: they are axis', () => {
    for (let lod = 0; lod < spray.lods; lod++) {
      const part = spray.make(1, lod).getAttribute('aPart');
      let axis = 0;
      for (let i = 0; i < part.count; i++) if (part.getW(i) < 0) axis++;
      expect(axis, `level ${lod}`).toBeGreaterThan(8);
    }
  });

  // the breeder: "their color a soft glowing pink at the center, shading to palest pink on the outer petals"
  it('is palest at the rim and pinker in the heart, with a deeper bud', () => {
    expect(characterText(morphology, 'flower.colour')).toBe('pale pink');
    const g = spray.make(0, 0);
    const part = g.getAttribute('aPart');
    const colour = g.getAttribute('color');
    const mean = (wanted: (t: number) => boolean): [number, number, number] => {
      const sum = [0, 0, 0];
      let n = 0;
      for (let i = 0; i < part.count; i++) {
        if (!wanted(part.getW(i))) continue;
        sum[0]! += colour.getX(i);
        sum[1]! += colour.getY(i);
        sum[2]! += colour.getZ(i);
        n++;
      }
      return [sum[0]! / n, sum[1]! / n, sum[2]! / n];
    };
    // the outer rows open first and the inner last
    const outer = mean((t) => t >= 0 && t < 0.02);
    const inner = mean((t) => t > 0.09 && t < 0.2);
    for (const c of [outer, inner]) expect(c[0]).toBeGreaterThan(c[1]);
    // pinker: less green and blue for its red
    expect(inner[1] / inner[0]).toBeLessThan(outer[1] / outer[0]);
    expect(spray.budTint[1]).toBeLessThan(spray.budTint[0]);
  });
});

// TAXON_LOOKS.md section 7, "A fruit": "authoredSize the length of the fruit itself in model units"; model.ts,
// fruit.lengthM: "Length of the fruit, or of the cluster where fruits are borne together".
describe('the hips', () => {
  const each = characterRange(morphology, 'fruit.hipLengthM');
  const perSpray = characterRange(morphology, 'fruit.perSpray');

  it('are authored at the length of the cluster, which is what the growth model sets', () => {
    expect(hips.authoredSize).toBeCloseTo(mid(characterRange(morphology, 'fruit.clusterLengthM')), 9);
    expect(known(model, 'fruit.lengthM')).toEqual(characterRange(morphology, 'fruit.clusterLengthM'));
    expect(model.names.fruitHeld).toBe('facing_out');
    for (let v = 0; v < hips.variants; v++) {
      const g = hips.make(v, 0);
      g.computeBoundingBox();
      // from the end of the side shoot to the far end of the hips
      expect(g.boundingBox!.max.y / hips.authoredSize, `variant ${v}`).toBeGreaterThan(0.85);
      expect(g.boundingBox!.max.y / hips.authoredSize, `variant ${v}`).toBeLessThan(1.15);
    }
  });

  it('come one, two or three to a spray, each of the length the file gives and rather fat', () => {
    expect(hips.variants).toBe(perSpray[1] - perSpray[0] + 1);
    const fat = characterNumber(morphology, 'fruit.widthToLength');
    const lengths = known(model, 'fruit.lengthM')!;
    for (let v = 0; v < hips.variants; v++) {
      for (let lod = 0; lod < hips.lods; lod++) {
        // the body of a hip is the one part with many points: its dried sepals have few
        const bodies = [...parts(hips.make(v, lod))].filter(([, points]) => points.length >= 20);
        expect(bodies, `variant ${v} level ${lod}`).toHaveLength(perSpray[0] + v);
        if (lod > 0) continue;
        for (const [key, points] of bodies) {
          const base = pivotOf(key);
          const tip = points.reduce((far, p) => (p.distanceTo(base) > far.distanceTo(base) ? p : far), base);
          const axis = tip.clone().sub(base).normalize();
          let length = 0;
          let half = 0;
          for (const p of points) {
            const along = p.clone().sub(base).dot(axis);
            length = Math.max(length, along);
            half = Math.max(half, p.clone().sub(base).addScaledVector(axis, -along).length());
          }
          // at the shortest and the longest cluster the model gives, a hip is within the range of the file
          expect((length * lengths[0]) / hips.authoredSize).toBeGreaterThan(each[0] * 0.8);
          expect((length * lengths[1]) / hips.authoredSize).toBeLessThan(each[1] * 1.2);
          expect((2 * half) / length).toBeGreaterThan(fat * 0.85);
          expect((2 * half) / length).toBeLessThan(fat * 1.15);
        }
      }
    }
  });

  // Provender Nurseries: "lovely orange hips"; a gardener: "rather fat and rosy orange"
  it('are painted green and ripen to orange', () => {
    expect(characterText(morphology, 'fruit.colourRipe')).toBe('orange');
    expect(hips.ripe[0]).toBeGreaterThan(hips.ripe[1] * 3);
    expect(hips.ripe[1]).toBeGreaterThan(hips.ripe[2]);
    const colour = hips.make(0, 0).getAttribute('color');
    let green = 0;
    for (let i = 0; i < colour.count; i++) if (colour.getY(i) > colour.getX(i) && colour.getY(i) > colour.getZ(i)) green++;
    expect(green).toBe(colour.count);
  });
});

// TAXON_LOOKS.md section 2: an appendage is "one unit long", +Z the way it reaches.
describe('the prickle', () => {
  it('is hooked back towards the foot of the cane, on a base as long and as wide for its height as the file says', () => {
    const long = characterRange(morphology, 'stem.prickleBaseLengthToHeight');
    const wide = characterRange(morphology, 'stem.prickleBaseWidthToHeight');
    for (let v = 0; v < prickle.variants; v++) {
      const pos = prickle.make(v, 0).getAttribute('position');
      const foot: THREE.Vector3[] = [];
      let tip = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        const p = new THREE.Vector3().fromBufferAttribute(pos, i);
        if (p.z < 1e-6) foot.push(p);
        if (p.z > tip.z) tip = p;
      }
      const ys = foot.map((p) => p.y);
      const xs = foot.map((p) => p.x);
      const length = Math.max(...ys) - Math.min(...ys);
      const width = Math.max(...xs) - Math.min(...xs);
      expect(length >= long[0] && length <= long[1], `variant ${v}: base ${length.toFixed(2)} long`).toBe(true);
      expect(width >= wide[0] && width <= wide[1], `variant ${v}: base ${width.toFixed(2)} wide`).toBe(true);
      // one unit high, the point drawn down
      expect(tip.z).toBeCloseTo(1, 6);
      expect(tip.y).toBeLessThan(-0.2);
    }
    expect(prickle.swing).toBe(0);
  });
});

// TAXON_LOOKS.md section 6, "Levels of detail and triangle budgets".
describe('every organ model of the rose', () => {
  it('builds at every level of detail, finite, within the budget it states and the ceiling for its kind', () => {
    const assets = assetsOf(look);
    expect(assets.map((a) => a.kind).sort()).toEqual(['appendage', 'flower', 'fruit', 'leaf']);
    for (const { kind, asset } of assets) {
      expect(asset.key.startsWith(`${ID}/`), asset.key).toBe(true);
      expect(asset.budget).toHaveLength(asset.lods);
      for (let lod = 0; lod < asset.lods; lod++) {
        expect(asset.budget[lod]!, `${asset.key} level ${lod}`).toBeLessThanOrEqual(ceilingFor(kind, lod, asset.lods));
        for (let v = 0; v < asset.variants; v++) {
          const g = asset.make(v, lod);
          expect(triangles(g), `${asset.key} variant ${v} level ${lod}`).toBeLessThanOrEqual(asset.budget[lod]!);
          expect(triangles(g)).toBeGreaterThan(0);
          const pos = g.getAttribute('position').array;
          let bad = -1;
          for (let i = 0; i < pos.length && bad < 0; i++) if (!Number.isFinite(pos[i])) bad = i;
          expect(bad, `${asset.key} variant ${v} level ${lod}`).toBe(-1);
        }
      }
    }
    expect(look.provisional).toBe(false);
  });

  it('is far lighter at the level a whole Bower is drawn with than at the level a portrait looks at', () => {
    for (const { asset } of assetsOf(look)) expect(asset.budget.at(-1)!, asset.key).toBeLessThan(asset.budget[0]! / 5);
  });
});

// CLAUDE.md: "A flowering month is an envelope, not a trigger. Never show flowers because the calendar says so."
// packages/core/src/render/presence.ts answers what is on the plant on a day; nothing here works out a season.
describe('a specimen grown by the engine on the specimen frame', () => {
  const frame = readBower(read('examples/specimen-frame.bower.json'), 'examples/specimen-frame.bower.json');
  const taxa: Growable = new Map([[ID, { profile, model }]]);
  const YEARS = 6;
  const { sim } = growPlanting({ bower: frame.bower, plan: specimenPlan(ID), viewpoints: frame.viewpoints }, taxa, 'trained', YEARS);
  const data = toRenderData(sim);
  const cal = new Calendar(data.start);
  const year = cal.dateOf(data.lastDay).year;
  const on = (month: number, dayOfMonth = 15, y = year): number => cal.dayOf(`${y}-${String(month).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`);
  const leaves = (day: number): number => {
    const seasons = seasonsOf(data, cal.dateOf(day).year);
    return data.leaves.reduce((n, l) => n + (leafState(l, seasons.get(l.plantId), day).present ? 1 : 0), 0);
  };
  const open = (day: number): number => data.flowers.reduce((n, f) => n + (flowerState(f, day).phase === 'open' ? 1 : 0), 0);
  const fruit = (day: number, ripe = false): number => data.fruits.reduce((n, f) => n + ((ripe ? fruitState(f, day).phase === 'ripe' : fruitState(f, day).phase !== 'absent') ? 1 : 0), 0);
  const roleOf = new Map(data.stems.map((s) => [s.id, s.role]));

  // RHS plant record: foliage "Deciduous"; RHS pruning guide: pruned between December and February, renovated
  // "when the rose is leafless".
  it('is in leaf from spring to autumn and bare in January and February', () => {
    expect(profile.leafHabit.value).toBe('deciduous');
    for (const month of [5, 6, 7, 8, 9, 10]) expect(leaves(on(month)), `month ${month}`).toBeGreaterThan(500);
    for (const month of [1, 2]) expect(leaves(on(month)), `month ${month}`).toBe(0);
    expect(leaves(on(3, 1))).toBe(0);
    // and it is clothed, not a few sprigs: a leaf for every few centimetres of side shoot
    expect(leaves(on(7))).toBeGreaterThan(2000);
  });

  // RHS plant record: "repeat-flowering from midsummer to autumn"; the breeder: repeat flowering, "from late spring
  // to early winter"; a nursery's account of repeat-flowering roses: "a main flush in June", "a late flourish in October".
  it('is in flower in every month from June to October, and in none from December to May', () => {
    for (const month of [7, 8, 9, 10]) expect(open(on(month)), `month ${month}`).toBeGreaterThan(5);
    expect(open(on(6, 28))).toBeGreaterThan(5);
    for (const month of [12, 1, 2, 3, 4, 5]) expect(open(on(month)), `month ${month}`).toBe(0);
    // every month of the RHS envelope in the taxon file has flowers in it, except that the last are over in November
    const months = new Set(data.flowers.filter((f) => cal.dateOf(f.openDay).year === year).map((f) => cal.dateOf(f.openDay).month));
    expect([...months].sort((a, b) => a - b)).toEqual([6, 7, 8, 9, 10]);
    for (const month of [7, 8, 9, 10]) expect(profile.flowering.monthsUK.value).toContain(month);
  });

  // RHS pruning guide: the framework is kept and the "flowered side shoots" are shortened; BBC Gardeners' World
  // Magazine (taxon.json): "Climbing roses flower on growth produced in the current year".
  it('flowers only at the ends of side shoots of the year, never from the cane itself and not in its first summer', () => {
    expect(profile.flowering.wood.value).toBe('current_season');
    expect(param(model, 'flowering.currentSeasonFlowersPerM')).toBe(0);
    expect(data.flowers.length).toBeGreaterThan(200);
    const born = new Map(data.stems.map((s) => [s.id, cal.dateOf(s.bornDay[0]!).year]));
    for (const f of data.flowers) {
      expect(roleOf.get(f.stemId)).toBe('side_shoot');
      expect(born.get(f.stemId)).toBe(cal.dateOf(f.openDay).year);
      // held on the line of its shoot, not hanging plumb
      expect(f.direction).toBeDefined();
      expect(f.lengthM).toBeGreaterThanOrEqual(param(model, 'organs.racemeLengthM')[0]);
      expect(f.lengthM).toBeLessThanOrEqual(param(model, 'organs.racemeLengthM')[1]);
    }
    expect(data.flowers.some((f) => cal.dateOf(f.openDay).year === year - YEARS + 1)).toBe(false);
  });

  // RHS rose guide: unpicked roses "form hips"; Provender Nurseries: "orange hips in the autumn"; a gardener picked
  // a vase of them in late December.
  it('carries hips from summer through the winter, ripe by December, and none in spring', () => {
    expect(data.fruits.length).toBeGreaterThan(50);
    for (const month of [8, 9, 10, 11, 12]) expect(fruit(on(month)), `month ${month}`).toBeGreaterThan(5);
    expect(fruit(on(12), true)).toBeGreaterThan(fruit(on(12)) / 2);
    expect(fruit(on(1, 15), true)).toBeGreaterThan(5);
    expect(fruit(on(9), true)).toBeLessThan(fruit(on(12), true));
    for (const month of [4, 5]) expect(fruit(on(month)), `month ${month}`).toBe(0);
    expect(fruit(on(6, 10))).toBe(0);
    // a hip follows a flower that went over on the plant, where that flower was
    const spent = new Set(data.flowers.map((f) => `${f.stemId}|${f.spentDay}`));
    for (const f of data.fruits) expect(spent.has(`${f.stemId}|${f.swell[0]}`)).toBe(true);
    // fewer hips than flowers: most sprays are deadheaded or set nothing
    expect(data.fruits.length).toBeLessThan(data.flowers.length / 2);
  });

  // taxon.json: mechanism scramble_and_tie, "Every attachment is a gardener tie"; hazards: "Thorns near public circulation".
  it('is armed with prickles on every cane, which hold nothing, and climbs only where it is tied', () => {
    expect(profile.attachment.mechanism).toBe('scramble_and_tie');
    expect(new Set(data.appendages.map((a) => a.kind))).toEqual(new Set(['prickle']));
    expect(data.appendages.every((a) => !a.holding)).toBe(true);
    const [short, long] = known(model, 'appendages.prickleLengthM')!;
    for (const a of data.appendages) expect(a.lengthM >= short && a.lengthM <= long).toBe(true);
    expect(data.appendages.filter((a) => appendagePresent(a, data.lastDay)).length).toBeGreaterThan(500);
    for (const run of [...sim.axes.values()].flatMap((a) => a.runs)) expect(run.by).not.toBe('plant');
    // untied, the engine gives it no way up at all
    const untended = growPlanting({ bower: frame.bower, plan: specimenPlan(ID), viewpoints: frame.viewpoints }, taxa, 'untended', 3);
    expect(untended.sim.summaries.at(-1)!.frameworkM).toBeLessThan(0.1);
  });

  // The breeder: 15 ft (4.5 m), "a 3-year-old established rose"; RHS: "up to 4.5m", spread 2.5 to 4 m.
  it('reaches the top of the frame within three years on canes no longer than the breeder’s height allows', () => {
    const top = Math.max(...[...frame.bower.graph.nodes.values()].map((n) => n.position.z));
    const third = sim.summaries.find((s) => s.year === year - YEARS + 3)!;
    expect(third.highestM).toBeGreaterThan(top - 0.1);
    const height = characterNumber(morphology, 'habit.heightM');
    for (const a of sim.axes.values()) {
      if (a.role !== 'leader' || a.alive === 0) continue;
      expect(a.lengthAt[a.alive - 1]!).toBeLessThanOrEqual(height + 0.15);
    }
    expect(model.statement).not.toContain('thinner than the wisteria model');
    for (const p of Object.values(model.params)) expect((p.basis ?? '').startsWith('Copied from the Wisteria sinensis model')).toBe(false);
  });
});
