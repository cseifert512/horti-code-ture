import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Calendar, type RenderData, appendagePresent, characterNumber, characterRange, flowerState, fruitState, known, leafState, param, parseMorphology, readBower, seasonsOf, toRenderData } from '@horti/core';
import { growPlanting } from '../../src/plant/grow.ts';
import { triangles } from '../../src/plant/kit.ts';
import { type OrganModel, assetsOf, ceilingFor } from '../../src/plant/look.ts';
import { loadLooks, lookFault, lookFor } from '../../src/plant/registry.ts';
import { growable } from '../../src/plant/scenario.ts';
import { PlantView } from '../../src/plant/view.ts';
import { specimenPlan } from '../../src/specimen/specimen.ts';
import { camera, materials } from '../helpers.ts';

const ID = 'clematis-armandi';
await loadLooks([ID]);
const look = lookFor(ID);
const file = (path: string) => fileURLToPath(new URL(`../../../../${path}`, import.meta.url));
const morphology = parseMorphology(JSON.parse(readFileSync(file(`species/${ID}/morphology.json`), 'utf8')), `species/${ID}/morphology.json`);
const { model, profile } = growable().get(ID)!;
const mid = ([a, b]: [number, number]) => (a + b) / 2;

/** The parts of a model that come and go (a leaflet, a sepal), by the point each grows from: their vertices and the order they open in. */
function parts(g: THREE.BufferGeometry): { pivot: THREE.Vector3; points: THREE.Vector3[]; uv: number[]; opens: Set<number> }[] {
  const pos = g.getAttribute('position');
  const part = g.getAttribute('aPart');
  const uv = g.getAttribute('uv') as THREE.BufferAttribute | undefined;
  const found = new Map<string, { pivot: THREE.Vector3; points: THREE.Vector3[]; uv: number[]; opens: Set<number> }>();
  for (let i = 0; i < pos.count; i++) {
    if (part.getW(i) < 0) continue;
    const key = `${part.getX(i).toFixed(5)},${part.getY(i).toFixed(5)},${part.getZ(i).toFixed(5)}`;
    let p = found.get(key);
    if (!p) found.set(key, (p = { pivot: new THREE.Vector3(part.getX(i), part.getY(i), part.getZ(i)), points: [], uv: [], opens: new Set() }));
    p.points.push(new THREE.Vector3().fromBufferAttribute(pos, i));
    if (uv) p.uv.push(uv.getX(i));
    p.opens.add(Math.round(part.getW(i) * 1e4));
  }
  return [...found.values()];
}
const farthest = (from: THREE.Vector3, points: THREE.Vector3[]) => points.reduce((d, p) => Math.max(d, p.distanceTo(from)), 0);

// species/clematis-armandi/SPECIES_PROFILE.md, "Form: what the model draws"; TAXON_LOOKS.md section 8: "counts and
// measured sizes (leaflets, tepals, the length of a leaflet for its width) come from the file".
describe('Clematis armandi: the shapes drawn agree with its morphology file', () => {
  it('loads as this plant\'s own look, with a leaf, flowers, fruit and a hold of its own', () => {
    expect(lookFault(ID)).toBeUndefined();
    expect(look.provisional).toBe(false);
    expect(look.flowers).not.toBeNull();
    expect(look.fruits).not.toBeNull();
    expect(Object.keys(look.appendages)).toEqual(['leaf_stalk_coil']);
    for (const { asset } of assetsOf(look)) expect(asset.key.startsWith(`${ID}/`), asset.key).toBe(true);
  });

  it('draws a leaf of three leaflets, each two to four times as long as it is wide, on a stalk about two thirds as long as a leaflet', () => {
    const leaflets = characterNumber(morphology, 'leaf.leafletCount');
    const ratio = mid(characterRange(morphology, 'leaf.leafletWidthM')) / mid(characterRange(morphology, 'leaf.leafletLengthM'));
    const leaf = look.leaves.default;
    for (let v = 0; v < leaf.variants; v++) {
      const found = parts(leaf.make(v, 0));
      expect(found.length, `variant ${v}`).toBe(leaflets);
      for (const leaflet of found) {
        const length = farthest(leaflet.pivot, leaflet.points);
        const tip = leaflet.points.reduce((a, b) => (a.distanceTo(leaflet.pivot) > b.distanceTo(leaflet.pivot) ? a : b));
        const axis = tip.clone().sub(leaflet.pivot).normalize();
        // the widest it is across its own length, taken as twice the farthest any point lies from its midline
        const width = 2 * leaflet.points.reduce((w, p) => Math.max(w, p.clone().sub(leaflet.pivot).cross(axis).length()), 0);
        expect(width / length, `variant ${v}`).toBeGreaterThan(ratio * 0.7);
        expect(width / length, `variant ${v}`).toBeLessThan(ratio * 1.35);
      }
      // the longest leaflet is the share of the whole leaf that the flora's lengths give it
      const whole = mid(characterRange(morphology, 'leaf.stalkLengthM')) + mid(characterRange(morphology, 'leaf.leafletStalkLengthM')) + mid(characterRange(morphology, 'leaf.leafletLengthM'));
      const share = mid(characterRange(morphology, 'leaf.leafletLengthM')) / whole;
      const longest = Math.max(...found.map((l) => farthest(l.pivot, l.points)));
      // one unit is the reach of the hanging leaf, which is shorter than its parts laid end to end
      expect(longest).toBeGreaterThan(share * 0.9);
      expect(longest).toBeLessThan(share * 1.6);
    }
  });

  it('lays the pale midrib of the leaf texture along three veins from the base of each leaflet, and along one from far off', () => {
    const veins = characterNumber(morphology, 'leaf.mainVeinCount');
    expect(veins).toBe(3);
    const onMidrib = (g: THREE.BufferGeometry) => parts(g).map((leaflet) => leaflet.uv.filter((u) => Math.abs(u - 0.5) < 1e-6).length);
    const leaf = look.leaves.default;
    // the finest model has 17 rows of points down a leaflet: more than two whole columns of them lie on a vein, and no more than three
    for (const n of onMidrib(leaf.make(0, 0))) {
      expect(n).toBeGreaterThan((veins - 1) * 17);
      expect(n).toBeLessThanOrEqual(veins * 17);
    }
    // the coarsest keeps the midrib alone: 5 rows
    for (const n of onMidrib(leaf.make(0, 2))) expect(n).toBe(5);
  });

  it('authors the flowers of a node as wide as the growth model says a flower record is, with two clusters of two or three stalks', () => {
    const flowers = look.flowers!.default;
    const span = characterRange(morphology, 'inflorescence.spanM');
    expect(param(model, 'organs.racemeLengthM')).toEqual(span);
    expect(flowers.authoredSize).toBeCloseTo(mid(span), 6);
    expect(model.names.flowerHeld).toBe('facing_out');
    expect(flowers.poise).toBe('held');
    const perAxil = characterRange(morphology, 'inflorescence.stalksPerAxil');
    const perStalk = characterNumber(morphology, 'inflorescence.flowersPerStalk');
    for (let v = 0; v < flowers.variants; v++) {
      const found = parts(flowers.make(v, 0));
      // one stalk at least to each of the two axils, and no more flowers than every stalk bearing its three
      expect(found.length, `variant ${v}`).toBeGreaterThanOrEqual(2 * perAxil[0]);
      expect(found.length, `variant ${v}`).toBeLessThanOrEqual(2 * perAxil[1] * perStalk);
      // flowers stand to both sides of the node: a cluster in each leaf axil
      expect(found.some((f) => f.pivot.x < 0) && found.some((f) => f.pivot.x > 0), `variant ${v}`).toBe(true);
      const across = found.flatMap((f) => f.points.map((p) => p.x));
      const wide = Math.max(...across) - Math.min(...across);
      expect(wide / flowers.authoredSize, `variant ${v} is ${wide.toFixed(3)} m across`).toBeGreaterThan(0.8);
      expect(wide / flowers.authoredSize, `variant ${v} is ${wide.toFixed(3)} m across`).toBeLessThan(1.2);
    }
  });

  it('gives each flower four to seven sepals, mostly five or six, and the width the RHS gives', () => {
    const flowers = look.flowers!.default;
    const [fewest, most] = characterRange(morphology, 'flower.sepalCount');
    const usual = characterRange(morphology, 'flower.sepalCountUsual');
    const width = characterRange(morphology, 'flower.diameterM');
    const counts: number[] = [];
    for (let v = 0; v < flowers.variants; v++) {
      for (const flower of parts(flowers.make(v, 0))) {
        // the sepals of a flower grow from one point and open one after another
        counts.push(flower.opens.size);
        const across = 2 * farthest(flower.pivot, flower.points);
        expect(across).toBeGreaterThan(width[0] * 0.9);
        expect(across).toBeLessThan(width[1] * 1.1);
      }
      // the coarsest model has the same flowers in the same places
      expect(parts(flowers.make(v, 2)).length).toBe(parts(flowers.make(v, 0)).length);
    }
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(fewest);
    expect(Math.max(...counts)).toBeLessThanOrEqual(most);
    expect(counts.filter((n) => n >= usual[0] && n <= usual[1]).length / counts.length).toBeGreaterThan(0.7);
  });

  it('keeps the stalks and the boss of stamens when the sepals have gone: they are the axis of the flower', () => {
    const g = look.flowers!.default.make(0, 0);
    const part = g.getAttribute('aPart');
    let axis = 0;
    for (let i = 0; i < part.count; i++) if (part.getW(i) < 0) axis++;
    // forty stamens to a flower outnumber the points of its sepals
    expect(axis / part.count).toBeGreaterThan(0.4);
    expect(axis / part.count).toBeLessThan(0.9);
  });

  it('draws three to five seed heads to a node, none of whose tails is longer than the flora gives', () => {
    const fruit = look.fruits!.default;
    const span = characterRange(morphology, 'fruit.spanM');
    expect(known(model, 'fruit.lengthM')).toEqual(span);
    expect(fruit.authoredSize).toBeCloseTo(mid(span), 6);
    const [fewest, most] = characterRange(morphology, 'fruit.headsPerNode');
    const reach = characterRange(morphology, 'fruit.tailLengthM')[1] + characterRange(morphology, 'fruit.acheneLengthM')[1] + 0.008;
    for (let v = 0; v < fruit.variants; v++) {
      const g = fruit.make(v, 0);
      const pos = g.getAttribute('position');
      const part = g.getAttribute('aPart');
      // a head is the many points that share one place on a stalk; a ring of a stalk is a few
      const heads = new Map<string, { at: THREE.Vector3; points: THREE.Vector3[] }>();
      for (let i = 0; i < pos.count; i++) {
        const key = `${part.getX(i).toFixed(5)},${part.getY(i).toFixed(5)},${part.getZ(i).toFixed(5)}`;
        let h = heads.get(key);
        if (!h) heads.set(key, (h = { at: new THREE.Vector3(part.getX(i), part.getY(i), part.getZ(i)), points: [] }));
        h.points.push(new THREE.Vector3().fromBufferAttribute(pos, i));
      }
      const real = [...heads.values()].filter((h) => h.points.length > 60);
      expect(real.length, `variant ${v}`).toBeGreaterThanOrEqual(fewest);
      expect(real.length, `variant ${v}`).toBeLessThanOrEqual(most);
      for (const head of real) expect(farthest(head.at, head.points)).toBeLessThan(reach);
      const across = real.flatMap((h) => h.points.map((p) => p.x));
      const wide = Math.max(...across) - Math.min(...across);
      expect(wide / fruit.authoredSize, `variant ${v} is ${wide.toFixed(3)} m across`).toBeGreaterThan(0.7);
      expect(wide / fruit.authoredSize, `variant ${v} is ${wide.toFixed(3)} m across`).toBeLessThan(1.3);
    }
  });

  it('draws the wound stalk as long as the growth model says it reaches, and wound where it has hold', () => {
    const hold = look.appendages.leaf_stalk_coil!;
    expect(known(model, 'appendages.leafStalkLengthM')).toEqual(characterRange(morphology, 'hold.woundReachM'));
    expect(hold.pick(0.2, true, 5)).not.toBe(hold.pick(0.2, false));
    // a stalk with hold goes round: its points lie on every side of the line it winds about
    const g = hold.make(hold.pick(0.2, true, 5), 0);
    const pos = g.getAttribute('position');
    let left = 0;
    let right = 0;
    for (let i = 0; i < pos.count; i++) (pos.getX(i) < 0 ? left++ : right++);
    expect(Math.min(left, right) / pos.count).toBeGreaterThan(0.2);
  });
});

// TAXON_LOOKS.md section 6, "Levels of detail and triangle budgets".
describe('Clematis armandi: every organ model at every level of detail', () => {
  it('builds finite geometry within the budget it states and the ceiling for its kind', () => {
    for (const { kind, asset } of assetsOf(look) as { kind: Parameters<typeof ceilingFor>[0]; asset: OrganModel }[]) {
      expect(asset.budget.length, asset.key).toBe(asset.lods);
      for (let lod = 0; lod < asset.lods; lod++) {
        expect(asset.budget[lod]!, `${asset.key} level ${lod}`).toBeLessThanOrEqual(ceilingFor(kind, lod, asset.lods));
        for (let v = 0; v < asset.variants; v++) {
          const g = asset.make(v, lod);
          const pos = g.getAttribute('position').array;
          let bad = -1;
          for (let i = 0; i < pos.length && bad < 0; i++) if (!Number.isFinite(pos[i])) bad = i;
          expect(bad, `${asset.key} ${v}/${lod}`).toBe(-1);
          expect(triangles(g), `${asset.key} variant ${v} level ${lod}`).toBeLessThanOrEqual(asset.budget[lod]!);
          // a budget is not a licence: a model uses most of what it states, so that the statement means something
          if (v === 0) expect(triangles(g), `${asset.key} level ${lod} states far more than it uses`).toBeGreaterThan(asset.budget[lod]! * 0.4);
        }
      }
    }
  });

  it('gets coarser with distance: each level has fewer triangles than the one before', () => {
    for (const { asset } of assetsOf(look)) {
      for (let lod = 1; lod < asset.lods; lod++) expect(triangles(asset.make(0, lod)), asset.key).toBeLessThan(triangles(asset.make(0, lod - 1)));
    }
  });

  it('authors the leaf one unit long from the stem, hanging below its stalk', () => {
    const leaf = look.leaves.default;
    for (let v = 0; v < leaf.variants; v++) {
      const g = leaf.make(v, 0);
      g.computeBoundingBox();
      const { min, max } = g.boundingBox!;
      expect(max.z).toBeCloseTo(1, 5);
      expect(min.z).toBeGreaterThan(-0.1);
      // "drooping" (Oregon State University): the leaflets hang well below where the stalk leaves the stem
      expect(min.y).toBeLessThan(-0.25);
      expect(max.y).toBeLessThan(0.25);
    }
  });
});

// CLAUDE.md: "A flowering month is an envelope, not a trigger. Never show flowers because the calendar says so."
// CONSTRAINTS_AND_PHENOLOGY.md section 3 (which of its own wood a plant flowers on) and section 5 (evergreen leaf).
describe('Clematis armandi grown on the specimen frame', () => {
  const frame = readBower(JSON.parse(readFileSync(file('examples/specimen-frame.bower.json'), 'utf8')), 'examples/specimen-frame.bower.json');
  const years = 6;
  const grow = (care: 'trained' | 'untended'): RenderData => toRenderData(growPlanting({ bower: frame.bower, plan: specimenPlan(ID), viewpoints: frame.viewpoints }, growable(), care, years).sim);
  const data = grow('trained');
  const cal = new Calendar(data.start);
  const last = cal.dateOf(data.lastDay).year;
  const days = (year: number) => {
    const out: { day: number; month: number }[] = [];
    for (let day = cal.dayOf(`${year}-01-01`); day <= cal.dayOf(`${year}-12-31`); day++) out.push({ day, month: cal.dateOf(day).month });
    return out;
  };
  const leavesOn = (d: RenderData, day: number) => {
    const seasons = seasonsOf(d, cal.dateOf(day).year);
    return d.leaves.filter((l) => leafState(l, seasons.get(l.plantId), day).present).length;
  };
  const openOn = (d: RenderData, day: number) => d.flowers.filter((f) => flowerState(f, day).phase === 'open').length;
  const fruitOn = (d: RenderData, day: number) => d.fruits.filter((f) => fruitState(f, day).phase !== 'absent').length;

  // CONSTRAINTS_AND_PHENOLOGY.md section 5: "Evergreen: ... Clematis armandi"
  it('is in leaf on every day of its sixth year, and all its leaves are evergreen', () => {
    expect(profile.leafHabit.value).toBe('evergreen');
    expect(data.leaves.every((l) => l.evergreen)).toBe(true);
    const counts = days(last).map(({ day }) => leavesOn(data, day));
    expect(Math.min(...counts)).toBeGreaterThan(400);
    // PROJECT_CONTEXT.md section 3.2: a plant six years old that is meant for evergreen cover carries a mass of leaf, not a few sprigs
    expect(Math.max(...counts)).toBeGreaterThan(1200);
  });

  // species/clematis-armandi/taxon.json flowering.monthsUK: March and April (RHS "early to mid spring"; Bean "produced in April")
  it('has flowers open in March and April and on no day of any other month', () => {
    const months = profile.flowering.monthsUK.value!;
    expect(months).toEqual([3, 4]);
    for (let year = last - 2; year <= last; year++) {
      const byMonth = new Map<number, number>();
      for (const { day, month } of days(year)) byMonth.set(month, Math.max(byMonth.get(month) ?? 0, openOn(data, day)));
      for (let month = 1; month <= 12; month++) {
        if (months.includes(month)) expect(byMonth.get(month)!, `${year}-${month}`).toBeGreaterThan(20);
        else expect(byMonth.get(month)!, `${year}-${month}`).toBe(0);
      }
    }
  });

  // CONSTRAINTS_AND_PHENOLOGY.md section 3; RHS pruning group 1: "flowers on shoots produced in the previous summer"
  it('bears every flower at a leaf node of a stem laid down the year before, facing out from it', () => {
    expect(profile.flowering.wood.value).toBe('previous_season');
    const stems = new Map(data.stems.map((s) => [s.id, s]));
    expect(data.flowers.length).toBeGreaterThan(100);
    for (const f of data.flowers) {
      const stem = stems.get(f.stemId)!;
      expect(f.stemPoint).toBeDefined();
      expect(cal.dateOf(stem.bornDay[f.stemPoint!]!).year).toBe(f.year - 1);
      expect(f.direction).toBeDefined();
      expect(f.form).toBeUndefined();
    }
  });

  it('does not flower in the year it is planted, and flowers more as it ages', () => {
    const opened = (year: number) => data.flowers.filter((f) => f.year === year).length;
    expect(opened(cal.dateOf(0).year)).toBe(0);
    expect(opened(last)).toBeGreaterThan(opened(last - 2));
    expect(opened(last - 2)).toBeGreaterThan(opened(last - 4));
  });

  // the growth model's fruit window: seed heads in June and July (Kwantlen); "fruiting from April to July" in the wild (Huang et al. 2024)
  it('carries seed heads from petal fall into summer, most in June and July, none from October to February, and only where a flower went over', () => {
    expect(data.fruits.length).toBeGreaterThan(20);
    expect(data.fruits.length).toBeLessThan(data.flowers.length);
    const byMonth = new Map<number, number>();
    for (const { day, month } of days(last)) byMonth.set(month, Math.max(byMonth.get(month) ?? 0, fruitOn(data, day)));
    for (const month of [5, 6, 7]) expect(byMonth.get(month)!, String(month)).toBeGreaterThan(10);
    for (const month of [10, 11, 12, 1, 2]) expect(byMonth.get(month)!, String(month)).toBe(0);
    // a head is full grown and ripening in June and July, the months the sources give
    const ripening = (month: number) => data.fruits.filter((f) => ['ripening', 'ripe'].includes(fruitState(f, cal.dayOf(`${last}-${String(month).padStart(2, '0')}-28`)).phase)).length;
    expect(ripening(6)).toBeGreaterThan(5);
    expect(ripening(7)).toBeGreaterThan(5);
    expect(ripening(4)).toBe(0);
    const flowered = new Set(data.flowers.map((f) => `${f.stemId}:${f.stemPoint}:${f.year}`));
    for (const f of data.fruits) expect(flowered.has(`${f.stemId}:${f.stemPoint}:${f.year}`)).toBe(true);
  });

  // CONSTRAINTS_AND_PHENOLOGY.md section 2, petiole_twining: "Fine reachable cables or laths for leaf stalks to grasp ...
  // Coarse member too large for petiole clasp; untrained shoots hang or scramble"
  it('winds leaf stalks round the cable it climbs by itself and round nothing else', () => {
    expect(data.appendages.length).toBeGreaterThan(5);
    const stems = new Map(data.stems.map((s) => [s.id, s]));
    for (const a of data.appendages) {
      expect(a.kind).toBe('leaf_stalk_coil');
      expect(a.holding).toBe(true);
      // what it holds is thin enough for the growth model's grasp
      expect(a.heldDiameterMm!).toBeLessThanOrEqual(param(model, 'attachment.maxGraspDiameterMm'));
      const stem = stems.get(a.stemId)!;
      const i = a.stemPoint!;
      expect(Math.hypot(stem.away[3 * i]!, stem.away[3 * i + 1]!, stem.away[3 * i + 2]!)).toBeGreaterThan(0.5);
    }
    for (const { day } of days(last).filter((_, i) => i % 30 === 0)) expect(data.appendages.some((a) => appendagePresent(a, day))).toBe(true);
    // left to itself it holds the cable alone, and still throws long shoots that hang
    const untended = grow('untended');
    expect(untended.stems.filter((s) => s.role === 'whip').length).toBeGreaterThan(10);
    expect(untended.leaves.length).toBeLessThan(data.leaves.length);
  });

  it('is drawn with its own models throughout: nothing missing, nothing provisional', () => {
    const view = new PlantView(data, materials());
    expect(view.provisionalLooks).toEqual([]);
    expect(view.withoutFlowers).toEqual([]);
    expect(view.withoutFruit).toEqual([]);
    expect(view.withoutAppendages).toEqual([]);
    expect(view.unknownForms).toEqual([]);
    // the picture and the count agree on a day in flower
    const open = days(last).reduce((best, { day }) => (openOn(data, day) > openOn(data, best) ? day : best), cal.dayOf(`${last}-03-20`));
    view.update(camera(), open, 1);
    expect(view.stats().flowers).toBe(openOn(data, open));
    expect(view.stats().leaves).toBe(leavesOn(data, open));
    view.dispose();
  });
});

// TEMPORARY-MEASURE
describe('measure', () => {
  it('prints', () => {
    for (const { kind, form, asset } of assetsOf(look)) {
      for (let lod = 0; lod < asset.lods; lod++) {
        const row: string[] = [];
        for (let v = 0; v < asset.variants; v++) {
          const g = asset.make(v, lod);
          g.computeBoundingBox();
          const b = g.boundingBox!;
          row.push(`${triangles(g)} [x ${b.min.x.toFixed(3)}..${b.max.x.toFixed(3)} y ${b.min.y.toFixed(3)}..${b.max.y.toFixed(3)} z ${b.min.z.toFixed(3)}..${b.max.z.toFixed(3)}]`);
        }
        console.log(`${kind} ${form} lod ${lod}: ${row.join(' | ')}`);
      }
    }
    const flowers = look.flowers!.default;
    for (let v = 0; v < flowers.variants; v++) {
      const found = parts(flowers.make(v, 0));
      const xs = found.flatMap((f) => f.points.map((p) => p.x));
      console.log(`flower variant ${v}: ${found.length} flowers, sepals ${found.map((f) => f.opens.size).join(',')}, across ${(Math.max(...xs) - Math.min(...xs)).toFixed(3)}`);
    }
    for (let v = 0; v < look.leaves.default.variants; v++) {
      const found = parts(look.leaves.default.make(v, 0));
      console.log(`leaf variant ${v}: leaflet chords ${found.map((l) => farthest(l.pivot, l.points).toFixed(3)).join(', ')}`);
    }
    const fruit = look.fruits!.default;
    for (let v = 0; v < fruit.variants; v++) {
      const g = fruit.make(v, 0);
      const pos = g.getAttribute('position');
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i < pos.count; i++) {
        lo = Math.min(lo, pos.getX(i));
        hi = Math.max(hi, pos.getX(i));
      }
      console.log(`fruit variant ${v}: across ${(hi - lo).toFixed(3)}`);
    }
  });
});
