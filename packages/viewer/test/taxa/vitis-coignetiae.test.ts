import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Calendar, type RenderData, appendagePresent, characterList, characterNumber, characterRange, characterText, flowerState, fruitState, known, leafState, param, parseMorphology, readBower, seasonsOf, toRenderData } from '@horti/core';
import { growPlanting } from '../../src/plant/grow.ts';
import { asMeasured } from '../../src/plant/hold.ts';
import { triangles } from '../../src/plant/kit.ts';
import { assetsOf, ceilingFor } from '../../src/plant/look.ts';
import { loadLooks } from '../../src/plant/registry.ts';
import { growable } from '../../src/plant/scenario.ts';
import { look } from '../../src/plant/taxa/vitis-coignetiae.ts';
import { PlantView } from '../../src/plant/view.ts';
import { specimenPlan } from '../../src/specimen/specimen.ts';
import { camera, materials } from '../helpers.ts';

await loadLooks();
const ID = 'vitis-coignetiae';
const read =(path: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../../../${path}`, import.meta.url)), 'utf8')) as unknown;
const morphology = parseMorphology(read(`species/${ID}/morphology.json`), `species/${ID}/morphology.json`);
const { model, profile } = growable().get(ID)!;
const mid = ([a, b]: readonly [number, number]) => (a + b) / 2;

const leaf = look.leaves.default;
const panicle = look.flowers!.default;
const bunch = look.fruits!.default;
const tendril = look.appendages.tendril!;

/** The vertices of a model with their part tags: place, pivot and t. */
function points(g: THREE.BufferGeometry): { p: THREE.Vector3; pivot: THREE.Vector3; t: number }[] {
  const pos = g.getAttribute('position');
  const part = g.getAttribute('aPart');
  return Array.from({ length: pos.count }, (_, i) => ({ p: new THREE.Vector3().fromBufferAttribute(pos, i), pivot: new THREE.Vector3(part.getX(i), part.getY(i), part.getZ(i)), t: part.getW(i) }));
}
const keyOf = (v: THREE.Vector3) => `${v.x.toFixed(6)},${v.y.toFixed(6)},${v.z.toFixed(6)}`;
/** Triangles all of whose corners are parts that come and go (t >= 0). */
function partTriangles(g: THREE.BufferGeometry): number {
  const part = g.getAttribute('aPart');
  const index = g.index!;
  let n = 0;
  for (let i = 0; i < index.count; i += 3) if (part.getW(index.getX(i)) >= 0 && part.getW(index.getX(i + 1)) >= 0 && part.getW(index.getX(i + 2)) >= 0) n++;
  return n;
}

// TAXON_LOOKS.md section 1: "It exports one thing, look ... provisional: false once the leaf is the plant's own";
// the brief: "No organ may be borrowed from another taxon's module."
describe('the look of Vitis coignetiae', () => {
  it('is its own: a leaf, a panicle, a bunch of berries, a tendril and a bark, and no stand-in', () => {
    expect(look.taxonId).toBe(ID);
    expect(look.provisional).toBe(false);
    expect(assetsOf(look).map((a) => a.asset.key).sort()).toEqual([`${ID}/bunch`, `${ID}/leaf`, `${ID}/panicle`, `${ID}/tendril`]);
    // it climbs by tendrils (RHS; Bean) and by nothing else
    expect(Object.keys(look.appendages)).toEqual(['tendril']);
    expect(profile.attachment.mechanism).toBe('tendril');
  });

  // TAXON_LOOKS.md section 6, "Levels of detail and triangle budgets"
  it('builds every model at every level of detail within the budget it states, each level lighter than the one before', () => {
    for (const { kind, asset } of assetsOf(look)) {
      expect(asset.budget).toHaveLength(asset.lods);
      for (let lod = 0; lod < asset.lods; lod++) {
        expect(asset.budget[lod]!, `${asset.key} level ${lod}`).toBeLessThanOrEqual(ceilingFor(kind, lod, asset.lods));
        if (lod > 0) expect(asset.budget[lod]!).toBeLessThan(asset.budget[lod - 1]!);
        let heaviest = 0;
        for (let v = 0; v < asset.variants; v++) {
          const g = asset.make(v, lod);
          const n = triangles(g);
          expect(n, `${asset.key} variant ${v} level ${lod}`).toBeLessThanOrEqual(asset.budget[lod]!);
          heaviest = Math.max(heaviest, n);
          const pos = g.getAttribute('position').array;
          for (let i = 0; i < pos.length; i++) if (!Number.isFinite(pos[i])) throw new Error(`${asset.key} ${v}/${lod}: a position is not a number`);
        }
        // and the heaviest variant is not so far under the budget that the budget says nothing
        expect(heaviest, `${asset.key} level ${lod}`).toBeGreaterThan(asset.budget[lod]! * 0.7);
      }
    }
  });
});

// species/vitis-coignetiae/morphology.json: the shape numbers the drawing uses, each with its source.
describe('the leaf agrees with what Bean records of it', () => {
  const models = Array.from({ length: leaf.variants }, (_, v) => points(leaf.make(v, 0)));
  const blade = (pts: ReturnType<typeof points>) => pts.filter((q) => q.t >= 0);
  const upper = (pts: ReturnType<typeof points>) => pts.filter((q) => q.t >= 0 && q.t < 0.5);
  const under = (pts: ReturnType<typeof points>) => pts.filter((q) => q.t >= 0.5);
  const spanX = (pts: { p: THREE.Vector3 }[]) => Math.max(...pts.map((q) => q.p.x)) - Math.min(...pts.map((q) => q.p.x));

  // morphology.json leaf.mainVeins: five main veins from the top of the stalk; the lowest pair branch into the lobes beside the stalk
  it('has five main veins fanning from the top of the stalk, and the branch that feeds each lobe beside it', () => {
    for (const pts of models) {
      const top = pts.find((q) => q.t >= 0)!.pivot;
      // one point of each vein's ground stands on the top of the stalk
      const fans = upper(pts).filter((q) => q.p.distanceTo(top) < 1e-6).length;
      expect(fans).toBe(characterNumber(morphology, 'leaf.mainVeins') + 2);
    }
  });

  // Bean: "sometimes 12 in. long and 10 in. broad"; "ordinarily 4 to 8 in. wide"; "stalk from 2 to 6 in. long"
  it('is as wide as Bean gives it, on a stalk as long as he gives it, for every leaf length the growth model allows', () => {
    const [short, long] = param(model, 'organs.leafLengthM');
    const [wide0, wide1] = characterRange(morphology, 'leaf.bladeWidthM');
    const [stalk0, stalk1] = characterRange(morphology, 'leaf.stalkLengthM');
    const widths = models.map((pts) => spanX(blade(pts)));
    // every variant draws the same size of blade for the same length in the data
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(0.04);
    for (const [v, pts] of models.entries()) {
      const width = widths[v]!;
      // the smallest leaf is about 4 in. wide, the middle one within Bean's ordinary range, the largest under his 10 in.
      expect(width * short).toBeGreaterThan(wide0 * 0.95);
      expect(width * short).toBeLessThan(wide0 * 1.15);
      expect(width * mid([short, long])).toBeGreaterThan(wide0);
      expect(width * mid([short, long])).toBeLessThan(wide1);
      expect(width * long).toBeLessThanOrEqual(characterNumber(morphology, 'leaf.bladeWidthMaxM'));
      // the stalk ends where the blade begins
      const stalk = pts.find((q) => q.t >= 0)!.pivot.z;
      expect(stalk * short, `variant ${v}`).toBeGreaterThanOrEqual(stalk0);
      expect(stalk * long, `variant ${v}`).toBeLessThanOrEqual(stalk1 * 1.05);
    }
  });

  // Bean: "covered beneath with a thick rusty brown felt"; "dark green and glabrous above"
  it('has an under side of its own, a hair below the upper, in the felt colour of the palette', () => {
    for (const pts of models) {
      expect(under(pts)).toHaveLength(upper(pts).length);
      // the whole under side stands at one place on the palette's ramp, most of the way to the felt
      const t = under(pts)[0]!.t;
      expect(t).toBeGreaterThan(0.7);
      expect(under(pts).every((q) => q.t === t)).toBe(true);
    }
    const { greenA, greenB, autumnA } = leaf.palette;
    // the upper side is green; the felt is browner than it is green; autumn is red
    expect(greenA[1]).toBeGreaterThan(greenA[0] * 2);
    expect(greenB[0]).toBeGreaterThan(greenB[1]);
    expect(autumnA[0]).toBeGreaterThan(autumnA[1] * 8);
    expect(characterList(morphology, 'leaf.colourAutumn')).toEqual(['scarlet', 'crimson']);
  });

  // Bean: "shallowly to coarsely toothed"; "rather obscurely three- or five-lobed ... the lobes and apex pointed"
  it('is toothed at the finest level and plain further off, and comes three-lobed and five-lobed', () => {
    const [few, many] = characterRange(morphology, 'leaf.lobeCount');
    expect([few, many]).toEqual([3, 5]);
    expect(leaf.variants).toBeGreaterThanOrEqual(2);
    expect(triangles(leaf.make(0, 0))).toBeGreaterThan(4 * triangles(leaf.make(0, 1)));
    // morphology.json leaf.posture (photographs): the blade is held by the viewer, sloping down and out; as drawn it
    // leaves its stalk flat and curls on down towards its tip, which is its lowest point, but nowhere near plumb
    for (const pts of models) {
      const top = blade(pts)[0]!.pivot;
      const lowest = blade(pts).reduce((a, b) => (b.p.y < a.p.y ? b : a));
      expect(Math.abs(lowest.p.x)).toBeLessThan(0.12);
      const drop = top.y - lowest.p.y;
      const out = lowest.p.z - top.z;
      expect(Math.atan2(drop, out)).toBeGreaterThan((3 * Math.PI) / 180);
      expect(Math.atan2(drop, out)).toBeLessThan((25 * Math.PI) / 180);
    }
    const hold = leaf.hold!;
    expect(hold.rise).toEqual(characterRange(morphology, 'leaf.faceRiseDeg'));
    expect(hold.riseOpen).toEqual(characterRange(morphology, 'leaf.faceRiseOpenDeg'));
    // measured at the slope the photographs show: between about 40 and 60 degrees below the line of the stalk
    expect(hold.unitAt).toBeGreaterThan(40);
    expect(hold.unitAt).toBeLessThan(60);
  });

  // TAXON_LOOKS.md section 2: a leaf is one unit long along +Z from where it joins the stem; for this plant the
  // unit is what organs.leafLengthM measures (morphology.json leaf.modelLengthM): from the stem to the farthest point
  // of the blade along the line of the stalk
  it('is one unit from the stem to its farthest point along the line of the stalk', () => {
    expect(characterRange(morphology, 'leaf.modelLengthM')).toEqual(param(model, 'organs.leafLengthM'));
    for (const [v, pts] of models.entries()) {
      // measured with the blade as it is held (BladeHold.unitAt)
      const reach = Math.max(...asMeasured(leaf.make(v, 0), leaf.hold!.unitAt).map((p) => p.z));
      expect(reach).toBeGreaterThan(0.97);
      expect(reach).toBeLessThan(1.03);
      // the midrib is longer than what is left of the unit past the stalk: the blade slopes down from the stalk
      const top = blade(pts)[0]!.pivot;
      const midrib = blade(pts).filter((q) => q.t < 0.5 && Math.abs(q.p.x) < 1e-4 && q.p.z > top.z);
      const tip = midrib.reduce((a, b) => (b.p.distanceTo(top) > a.p.distanceTo(top) ? b : a));
      expect(tip.p.distanceTo(top)).toBeGreaterThan(1.3 * (1 - top.z));
    }
  });
});

describe('the panicle agrees with the morphology file and the growth model', () => {
  // TAXON_LOOKS.md, "Frame and size": authoredSize is what organs.racemeLengthM measures
  it('is authored at the middle of the length the growth model gives a panicle, which is the length the morphology file records', () => {
    expect(characterRange(morphology, 'inflorescence.lengthM')).toEqual(param(model, 'organs.racemeLengthM'));
    expect(panicle.authoredSize).toBeCloseTo(mid(param(model, 'organs.racemeLengthM')), 6);
    expect(panicle.poise).toBe('hangs');
    expect(model.names.flowerHeld).toBe('hanging');
    const g = panicle.make(0, 0);
    g.computeBoundingBox();
    expect(-g.boundingBox!.min.y).toBeGreaterThan(panicle.authoredSize * 0.9);
    expect(-g.boundingBox!.min.y).toBeLessThan(panicle.authoredSize * 1.1);
  });

  // morphology.json inflorescence.flowerCount; flower.stamenCount (Bean, of the genus: five stamens)
  it('carries the number of flowers the file gives, each a ring of five stamens that opens and drops round an ovary that stays', () => {
    const flowers = characterNumber(morphology, 'inflorescence.flowerCount');
    const stamens = characterNumber(morphology, 'flower.stamenCount');
    for (let v = 0; v < panicle.variants; v++) {
      const g = panicle.make(v, 0);
      const pts = points(g);
      const opening = new Set(pts.filter((q) => q.t >= 0).map((q) => keyOf(q.pivot)));
      expect(opening.size, `variant ${v}`).toBe(flowers);
      // a stamen is a filament of 6 triangles and an anther of 12 at the finest level
      expect(partTriangles(g) / flowers / 18).toBe(stamens);
      // what stays when the stamens have dropped: the stalks and an ovary at every flower
      const staying = new Set(pts.filter((q) => q.t === -1).map((q) => keyOf(q.pivot)));
      for (const k of opening) expect(staying.has(k)).toBe(true);
      // they open in order down the panicle, not all at once
      const ts = pts.filter((q) => q.t >= 0).map((q) => q.t);
      expect(Math.min(...ts)).toBeLessThan(0.15);
      expect(Math.max(...ts)).toBeGreaterThan(0.85);
    }
    // Bean, of the genus: the five petals are shed as a cap as the flower opens, so none is drawn
    expect(characterNumber(morphology, 'flower.petalCount')).toBe(5);
    expect(characterText(morphology, 'flower.colour')).toBe('greenish');
  });

  it('keeps a pale knot for every few flowers at the far levels, so that a panicle in flower still shows', () => {
    const far = points(panicle.make(0, panicle.lods - 1));
    const knots = new Set(far.filter((q) => q.t >= 0).map((q) => keyOf(q.pivot))).size;
    expect(knots).toBeGreaterThan(15);
    expect(knots).toBeLessThan(characterNumber(morphology, 'inflorescence.flowerCount') / 3);
  });
});

describe('the bunch agrees with the morphology file and the growth model', () => {
  it('is authored at the middle of the length the growth model gives a bunch, and hangs', () => {
    expect(characterRange(morphology, 'fruit.bunchLengthM')).toEqual(known(model, 'fruit.lengthM'));
    expect(bunch.authoredSize).toBeCloseTo(mid(known(model, 'fruit.lengthM')!), 6);
    expect(bunch.poise).toBe('hangs');
    expect(model.names.fruitHeld).toBe('hanging');
    for (let v = 0; v < bunch.variants; v++) {
      const g = bunch.make(v, 0);
      g.computeBoundingBox();
      expect(-g.boundingBox!.min.y / bunch.authoredSize, `variant ${v}`).toBeGreaterThan(0.85);
      expect(-g.boundingBox!.min.y / bunch.authoredSize, `variant ${v}`).toBeLessThan(1.12);
    }
  });

  // RHS: "bunches of small blue-black berries 1cm across"; Bean: "1/2 in. wide"
  it('has the berries the file gives to the usual bunch, each as wide as the RHS and Bean give a berry', () => {
    const berries = (v: number) => {
      const groups = new Map<string, THREE.Box3>();
      for (const q of points(bunch.make(v, 0)).filter((p) => p.t >= 0)) {
        const k = keyOf(q.pivot);
        groups.set(k, (groups.get(k) ?? new THREE.Box3()).expandByPoint(q.p));
      }
      return [...groups.values()].map((b) => b.getSize(new THREE.Vector3()).y);
    };
    const usual = berries(1);
    expect(usual).toHaveLength(characterNumber(morphology, 'fruit.berriesPerBunch'));
    expect(berries(0).length).toBeLessThan(usual.length);
    expect(berries(2).length).toBeGreaterThan(usual.length);
    const [d0, d1] = characterRange(morphology, 'fruit.berryDiameterM');
    const mean = usual.reduce((a, b) => a + b, 0) / usual.length;
    expect(mean).toBeGreaterThan(d0);
    expect(mean).toBeLessThan(d1);
  });

  // Bean: "berries black with a purple bloom". look.ts: the ripe colour of a point is ripe * (ripeShade[0] + ripeShade[1] * green)
  it('ripens from green to near black, lighter and bluer where the bloom lies', () => {
    const g = bunch.make(1, 0);
    const colour = g.getAttribute('color');
    let low = Infinity;
    let high = 0;
    for (let i = 0; i < colour.count; i++) {
      // unripe: green
      expect(colour.getY(i)).toBeGreaterThan(colour.getX(i));
      expect(colour.getY(i)).toBeGreaterThan(colour.getZ(i));
      const shade = bunch.ripeShade[0] + bunch.ripeShade[1] * colour.getY(i);
      low = Math.min(low, shade);
      high = Math.max(high, shade);
    }
    // no point ripens to less than nothing (the stalk ripens darkest), and the bloom is far lighter than the shade
    expect(low).toBeGreaterThan(0.1);
    expect(high / low).toBeGreaterThan(2);
    // dark, and more blue than red or green
    expect(bunch.ripe[2]).toBeGreaterThan(bunch.ripe[0]);
    expect(bunch.ripe[2]).toBeGreaterThan(bunch.ripe[1]);
    expect(Math.max(...bunch.ripe) * high).toBeLessThan(0.2);
  });
});

describe('the tendril agrees with the morphology file', () => {
  /** Tubes in a model: each starts with a ring tagged exactly -1. */
  const tubes = (g: THREE.BufferGeometry, sides: number) => points(g).filter((q) => q.t === -1).length / (sides + 1);

  // morphology.json tendril.arms (Darwin, of the common vine: a stalk bearing two branches)
  it('is a stalk that forks into two arms, in every variant', () => {
    for (let v = 0; v < tendril.variants; v++) expect(tubes(tendril.make(v, 0), 4), `variant ${v}`).toBe(1 + characterNumber(morphology, 'tendril.arms'));
  });

  // render/contract.ts, RenderAppendage.holding and heldDiameterMm; Darwin: one that has clasped "contracts spirally"
  it('is wound where the data says it holds, to fit what it holds, and hooked or curled where it does not', () => {
    for (const r of [0, 0.3, 0.6, 0.99]) {
      expect(tendril.pick(r, true, 5)).toBe(0);
      expect(tendril.pick(r, true, 12)).toBe(1);
      expect(tendril.pick(r, true)).toBe(0);
      expect([2, 3]).toContain(tendril.pick(r, false));
    }
    // the coil of one that holds lies hard by the stem: most of its length is within a tenth of a length of where it leaves
    const near = (v: number) => points(tendril.make(v, 0)).filter((q) => q.p.z < 0.12 && Math.abs(q.p.y) < 0.12).length / points(tendril.make(v, 0)).length;
    expect(near(0)).toBeGreaterThan(0.5);
    expect(near(2)).toBeLessThan(0.3);
    // a coil for a 5 mm cable is tighter than one for something stouter
    const width = (v: number) => {
      const pts = points(tendril.make(v, 0)).filter((q) => q.p.z < 0.12);
      return Math.max(...pts.map((q) => q.p.x)) - Math.min(...pts.map((q) => q.p.x));
    };
    expect(width(0)).toBeLessThan(width(1));
    // green, then woody
    expect(tendril.aged).not.toBeNull();
  });
});

// species/vitis-coignetiae/taxon.json and model.json, and the sources they name. render/presence.ts says what is on
// the plant on a day: nothing here works a season out for itself.
describe('a specimen of Vitis coignetiae grown by the engine', () => {
  const years = 6;
  const frame = readBower(read('examples/specimen-frame.bower.json'), 'examples/specimen-frame.bower.json');
  const { sim } = growPlanting({ bower: frame.bower, plan: specimenPlan(ID), viewpoints: frame.viewpoints }, growable(), 'trained', years);
  const data: RenderData = toRenderData(sim);
  const cal = new Calendar(data.start);
  const last = cal.dateOf(data.lastDay).year;
  const monthOf = (day: number) => cal.dateOf(day).month;
  const on = (iso: string) => cal.dayOf(iso);
  const leavesOn = (iso: string) => {
    const day = on(iso);
    const seasons = seasonsOf(data, cal.dateOf(day).year);
    return data.leaves.map((l) => leafState(l, seasons.get(l.plantId), day)).filter((s) => s.present);
  };
  const mm = (m: number) => String(m).padStart(2, '0');

  // RHS: "deciduous"; "turning scarlet and crimson in autumn"
  it('is bare from December to March, in leaf from May to October, and coloured in the second half of October', () => {
    for (const m of [12, 1, 2, 3]) expect(leavesOn(`${m === 12 ? last - 1 : last}-${mm(m)}-15`), `month ${m}`).toHaveLength(0);
    for (const m of [5, 6, 7, 8, 9, 10]) expect(leavesOn(`${last}-${mm(m)}-15`).length, `month ${m}`).toBeGreaterThan(300);
    for (const m of [6, 7, 8]) expect(leavesOn(`${last}-${mm(m)}-15`).every((s) => s.autumn === 0), `month ${m}`).toBe(true);
    const late = leavesOn(`${last}-10-25`);
    expect(late.length).toBeGreaterThan(300);
    expect(late.filter((s) => s.autumn > 0.9).length / late.length).toBeGreaterThan(0.9);
    expect(data.leaves.every((l) => !l.evergreen)).toBe(true);
  });

  // PROJECT_CONTEXT.md: a vine in May is in leaf on last year's canes while the year's shoots are short
  it('is well on the way to full leaf by the end of May', () => {
    expect(leavesOn(`${last}-05-29`).length).toBeGreaterThan(0.5 * leavesOn(`${last}-07-15`).length);
  });

  // taxon.json flowering.monthsUK (RHS: "tiny greenish summer flowers"); Plants for a Future: "June to July";
  // Honma and others 2007: in flower 9 to 10 days. CLAUDE.md: "A flowering month is an envelope, not a trigger."
  it('flowers in June and July and in no other month, each panicle for nine or ten days, and not before its fourth summer', () => {
    expect(data.flowers.length).toBeGreaterThan(20);
    const envelope = profile.flowering.monthsUK!.value!;
    for (const f of data.flowers) {
      expect(envelope).toContain(monthOf(f.openDay));
      expect([6, 7]).toContain(monthOf(f.openDay));
      expect(f.spentDay - f.openDay).toBeGreaterThanOrEqual(9);
      expect(f.spentDay - f.openDay).toBeLessThanOrEqual(10);
      expect(f.lengthM).toBeGreaterThanOrEqual(param(model, 'organs.racemeLengthM')[0]);
      expect(f.lengthM).toBeLessThanOrEqual(param(model, 'organs.racemeLengthM')[1]);
      // it hangs: the data gives it no direction of its own
      expect(f.direction).toBeUndefined();
    }
    const firstYear = cal.dateOf(Math.min(...data.flowers.map((f) => f.openDay))).year;
    expect(firstYear - cal.dateOf(data.plants[0]!.plantedDay).year).toBe(param(model, 'flowering.competenceYears'));
    for (const m of [1, 2, 3, 4, 5, 8, 9, 10, 11, 12]) {
      const day = on(`${last}-${mm(m)}-15`);
      expect(data.flowers.filter((f) => flowerState(f, day).phase === 'open'), `month ${m}`).toHaveLength(0);
    }
    expect(data.flowers.some((f) => flowerState(f, on(`${last}-06-25`)).phase === 'open')).toBe(true);
  });

  // the growth model: panicles are at the ends of the year's short shoots and nowhere along the long growth
  it('carries its panicles on the short shoots of the year, never along a cane', () => {
    const role = new Map(data.stems.map((s) => [s.id, s.role]));
    for (const f of data.flowers) expect(role.get(f.stemId)).toBe('side_shoot');
    expect(data.stems.some((s) => s.role === 'spur')).toBe(false);
  });

  // Plants for a Future: seeds ripen "September to October"; RHS: "bunches of small blue-black berries"
  it('sets fruit only after a panicle has gone over, on some of them, ripe in September and October and gone by midwinter', () => {
    expect(data.fruits.length).toBeGreaterThan(5);
    expect(data.fruits.length).toBeLessThan(data.flowers.length * 0.6);
    const spent = new Set(data.flowers.map((f) => `${f.stemId}:${f.spentDay}`));
    for (const f of data.fruits) {
      // it begins the day its flower's stamens had dropped, on the same shoot
      expect(spent.has(`${f.stemId}:${f.swell[0]}`)).toBe(true);
      expect([9, 10]).toContain(monthOf(f.ripen[0]));
      expect([9, 10]).toContain(monthOf(f.ripen[1]));
      expect(f.lengthM).toBeGreaterThanOrEqual(known(model, 'fruit.lengthM')![0]);
      expect(f.lengthM).toBeLessThanOrEqual(known(model, 'fruit.lengthM')![1]);
      expect(f.direction).toBeUndefined();
    }
    const fruitOn = (iso: string) => data.fruits.map((f) => fruitState(f, on(iso))).filter((s) => s.phase !== 'absent');
    for (const m of [1, 2, 3, 4, 5]) expect(fruitOn(`${last}-${mm(m)}-15`), `month ${m}`).toHaveLength(0);
    expect(fruitOn(`${last}-08-15`).length).toBeGreaterThan(0);
    expect(fruitOn(`${last}-08-15`).every((s) => s.ripeness === 0)).toBe(true);
    expect(fruitOn(`${last}-10-20`).every((s) => s.phase === 'ripe')).toBe(true);
    expect(fruitOn(`${last}-12-25`)).toHaveLength(0);
  });

  // Bean: a tendril "missing at every third joint"; Oregon State University: "leaves alternate"
  it('has one leaf to a node, and a tendril at two nodes in three of every cane', () => {
    expect(data.appendages.length).toBeGreaterThan(200);
    expect(new Set(data.appendages.map((a) => a.kind))).toEqual(new Set(['tendril']));
    const canes = data.stems.filter((s) => s.role !== 'side_shoot');
    let checked = 0;
    for (const s of canes) {
      const leaves = data.leaves.filter((l) => l.stemId === s.id);
      const nodes = new Set(leaves.map((l) => l.stemPoint));
      expect(nodes.size, s.id).toBe(leaves.length);
      const tendrils = data.appendages.filter((a) => a.stemId === s.id);
      expect(tendrils.length, s.id).toBe(leaves.length - Math.floor(leaves.length / 3));
      checked += tendrils.length;
    }
    expect(checked).toBe(data.appendages.length);
    const [t0, t1] = known(model, 'appendages.tendrilLengthM')!;
    for (const a of data.appendages) {
      expect(a.lengthM).toBeGreaterThanOrEqual(t0);
      expect(a.lengthM).toBeLessThanOrEqual(t1);
    }
    // it holds the 5 mm cables by itself and nothing stouter: the laths it is tied to
    const held = data.appendages.filter((a) => a.holding);
    expect(held.length).toBeGreaterThan(10);
    for (const a of held) expect(a.heldDiameterMm).toBeLessThanOrEqual(param(model, 'attachment.maxGraspDiameterMm'));
    expect(data.appendages.filter((a) => appendagePresent(a, data.lastDay)).length).toBeGreaterThan(200);
  });

  // TAXON_LOOKS.md section 9: "A portrait whose caption says 'provisional look' is not finished."
  it('is drawn with a model for everything the run has, and counts on a summer day exactly the leaves the core says are out', () => {
    const view = new PlantView(data, materials());
    expect(view.provisionalLooks).toEqual([]);
    expect(view.withoutFlowers).toEqual([]);
    expect(view.withoutFruit).toEqual([]);
    expect(view.withoutAppendages).toEqual([]);
    view.update(camera(), on(`${last}-07-15`), 1);
    expect(view.stats().leaves).toBe(leavesOn(`${last}-07-15`).length);
    expect(view.stats().fruit).toBe(data.fruits.filter((f) => fruitState(f, on(`${last}-07-15`)).phase !== 'absent').length);
    view.dispose();
  });
});

// species/vitis-coignetiae/model.json: no bare numbers, and what is published says where
describe('the growth model of Vitis coignetiae', () => {
  it('says of every number whether it is published or chosen, and no longer calls any a placeholder', () => {
    // what the file itself gives (the engine fills the optional parameters it leaves out as unknown)
    const written = Object.keys((read(`species/${ID}/model.json`) as { params: Record<string, unknown> }).params);
    const entries = Object.entries(model.params).filter(([k]) => written.includes(k));
    expect(entries.every(([, p]) => p.status !== 'unknown')).toBe(true);
    for (const [key, p] of entries) expect(p.basis ?? '', key).not.toMatch(/placeholder/i);
    const published = entries.filter(([, p]) => p.status === 'published_plant_profile' || p.status === 'peer_reviewed').map(([k]) => k);
    expect(published.sort()).toEqual(['appendages.leafStalkLengthM', 'appendages.tendrilNodePattern', 'fruit.ripenDoy', 'organs.alternateDivergenceDeg', 'organs.leafLengthM', 'organs.leafLifespanYears', 'organs.leavesPerNode', 'phenology.flowerLastsDays', 'phenology.flowerOpenDoy']);
    // measured on plants of this species: the internodes and the thickening of young plants in Gifu (2003)
    const measured = entries.filter(([, p]) => p.status === 'measured' || p.status === 'calibrated').map(([k]) => k);
    expect(measured.sort()).toEqual(['organs.leafSpacingM', 'organs.sideShootLeafSpacingM', 'thickening.radiusSquaredPerMetreMm2']);
    // what is still the wisteria model's is said to be, in the statement shown with every run
    expect(entries.some(([, p]) => (p.basis ?? '').startsWith('Copied from the Wisteria sinensis model'))).toBe(true);
    expect(model.statement).toContain('thinner than the wisteria model');
  });

  it('agrees with the morphology file where both record the same thing', () => {
    expect(known(model, 'appendages.tendrilNodePattern')!.filter((x) => x === 1)).toHaveLength(characterNumber(morphology, 'tendril.nodesBearingInThree'));
    expect(known(model, 'appendages.tendrilNodePattern')).toHaveLength(3);
    expect(known(model, 'appendages.tendrilLengthM')).toEqual(characterRange(morphology, 'tendril.lengthM'));
    expect(param(model, 'phenology.flowerLastsDays')).toEqual(characterRange(morphology, 'flower.daysInFlower'));
    expect(param(model, 'organs.leavesPerNode')).toBe(1);
    expect(characterText(morphology, 'leaf.arrangement')).toBe('alternate');
    expect(profile.leafHabit.value).toBe('deciduous');
    // Gifu Prefecture (2003): internodes 9.0 to 13.7 cm; Gerrath and others (2001): distichous, two ranks
    expect(characterRange(morphology, 'stem.internodeLengthM')).toEqual([0.09, 0.137]);
    expect(param(model, 'organs.leafSpacingM')[0]).toBe(characterRange(morphology, 'stem.internodeLengthM')[0]);
    expect(Math.abs(param(model, 'organs.leafSpacingM')[1] - characterRange(morphology, 'stem.internodeLengthM')[1])).toBeLessThan(0.005);
    expect(characterText(morphology, 'leaf.phyllotaxis')).toBe('distichous');
    expect(known(model, 'organs.alternateDivergenceDeg')).toBe(180);
  });

  // the addendum: a shoot in the air obeys its weight and the light, with this plant's own numbers where there are any
  it('gives a shoot in the air numbers of its own, within what Hattermann and others (2022) measured of tendril climbers', () => {
    for (const key of ['thickening.tipRadiusSquaredMm2', 'mechanics.woodModulusMPa', 'mechanics.greenShootModulusMPa', 'mechanics.woodSetDays', 'mechanics.stemFreshDensityKgM3', 'mechanics.leafFreshMassPerAreaKgM2', 'mechanics.inflorescenceFreshMassKg', 'mechanics.fruitFreshMassKg', 'mechanics.searcherReachM', 'tropism.turnPerM', 'tropism.lightShare', 'attachment.graspReachM'] as const) {
      expect(model.params[key]!.status, key).not.toBe('unknown');
    }
    // tendril and root climbers: searchers 0.14 to 0.91 m from base to tip
    const reach = known(model, 'mechanics.searcherReachM')!;
    expect(reach).toBeGreaterThanOrEqual(0.14);
    expect(reach).toBeLessThanOrEqual(0.91);
    // a tendril catches what comes within about its own length
    expect(known(model, 'attachment.graspReachM')!).toBeLessThanOrEqual(known(model, 'appendages.tendrilLengthM')![1]);
    // the year's shoots from spurs are cut back to one or two buds in winter (Bean, of the genus): one season each
    expect(known(model, 'sideShoots.lifespanYears')).toBe(1);
  });
});
