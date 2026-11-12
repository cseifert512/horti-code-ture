import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  Calendar,
  type RenderData,
  appendagePresent,
  characterNumber,
  characterOf,
  characterRange,
  flowerState,
  fruitState,
  known,
  leafState,
  param,
  parseMorphology,
  readBower,
  seasonsOf,
  toRenderData,
} from '@horti/core';
import { growPlanting } from '../../src/plant/grow.ts';
import { triangles } from '../../src/plant/kit.ts';
import { assetsOf, ceilingFor } from '../../src/plant/look.ts';
import { loadLooks, lookFor } from '../../src/plant/registry.ts';
import { growable } from '../../src/plant/scenario.ts';
import { specimenPlan } from '../../src/specimen/specimen.ts';

const ID = 'hedera-helix';
const SPECIES = fileURLToPath(new URL(`../../../../species/${ID}/`, import.meta.url));
const FRAME = fileURLToPath(new URL('../../../../examples/specimen-frame.bower.json', import.meta.url));
const morphology = parseMorphology(JSON.parse(readFileSync(`${SPECIES}morphology.json`, 'utf8')), `species/${ID}/morphology.json`);
const profile = readFileSync(`${SPECIES}SPECIES_PROFILE.md`, 'utf8');
const { model, profile: taxon } = growable().get(ID)!;

await loadLooks([ID]);
const look = lookFor(ID);
const mid = (r: readonly [number, number]): number => (r[0] + r[1]) / 2;
const V3 = THREE.Vector3;

// ---- reading a model back: what a geometry is made of ---------------------------------------------------------
/** The vertices of a geometry with the part each belongs to: its pivot and its `t` (see TAXON_LOOKS.md, section 4). */
function vertices(g: THREE.BufferGeometry): { p: THREE.Vector3; pivot: THREE.Vector3; t: number }[] {
  const position = g.getAttribute('position');
  const part = g.getAttribute('aPart');
  return Array.from({ length: position.count }, (_, i) => ({ p: new V3().fromBufferAttribute(position, i), pivot: new V3(part.getX(i), part.getY(i), part.getZ(i)), t: part.getW(i) }));
}

/** The separate pieces of surface a set of vertices makes, each as the list of its vertices: vertices joined by a triangle are one piece. */
function pieces(g: THREE.BufferGeometry, keep: (i: number) => boolean = () => true): number[][] {
  const index = g.index!;
  const parent = new Map<number, number>();
  const find = (a: number): number => {
    let r = a;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(a, r);
    return r;
  };
  for (let i = 0; i < g.getAttribute('position').count; i++) if (keep(i)) parent.set(i, i);
  for (let i = 0; i < index.count; i += 3) {
    const [a, b, c] = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    if (!parent.has(a) || !parent.has(b) || !parent.has(c)) continue;
    parent.set(find(a), find(b));
    parent.set(find(c), find(b));
  }
  const out = new Map<number, number[]>();
  for (const i of parent.keys()) out.set(find(i), [...(out.get(find(i)) ?? []), i]);
  return [...out.values()];
}

/** Groups unit directions that lie within `degrees` of one another, and says how many groups there are. */
function bundles(directions: THREE.Vector3[], degrees: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (const d of directions) if (!out.some((o) => o.dot(d) > Math.cos((degrees * Math.PI) / 180))) out.push(d);
  return out;
}

/** A blade as it lies on the model: where the stalk joins, the way to the tip of its end lobe, and its length and width as shares of the leaf's reach. */
function bladeOf(g: THREE.BufferGeometry) {
  const blade = vertices(g).filter((v) => v.t >= 0);
  const pivot = blade[0]!.pivot;
  const tip = blade.reduce((far, v) => (v.p.distanceTo(pivot) > far.p.distanceTo(pivot) ? v : far)).p;
  const forward = tip.clone().sub(pivot).normalize();
  // the main veins are the pale vertices (the rest of the blade is 0): one bundle of them to each lobe
  const veins = bundles(
    blade.filter((v) => v.t >= 0.25 && v.p.distanceTo(pivot) > 0.2).map((v) => v.p.clone().sub(pivot).normalize()),
    12,
  );
  // across the blade: square to the end lobe, in the plane the blade lies in
  const widest = blade.reduce((far, v) => {
    const off = (w: THREE.Vector3) => w.clone().sub(pivot).addScaledVector(forward, -w.clone().sub(pivot).dot(forward)).length();
    return off(v.p) > off(far.p) ? v : far;
  }).p;
  const across = widest.clone().sub(pivot).addScaledVector(forward, -widest.clone().sub(pivot).dot(forward)).normalize();
  const along = blade.map((v) => v.p.clone().sub(pivot).dot(forward));
  const sideways = blade.map((v) => v.p.clone().sub(pivot).dot(across));
  const length = Math.max(...along) - Math.min(...along);
  const width = Math.max(...sideways) - Math.min(...sideways);
  // where along the blade it is widest, from its base
  const widestAt = (along[sideways.indexOf(Math.max(...sideways))]! - Math.min(...along)) / length;
  return { veins: veins.length, length, width, widestAt, stalk: pivot.length() };
}

// TAXON_LOOKS.md, sections 1 and 6: "Every model builds finite geometry at every level of detail, within the triangle
// budget the asset states"; a budget may not be over the ceiling for its kind.
describe('the organ models of common ivy', () => {
  it('are its own: both leaf forms, the panicle, the berries and the rootlets, and none is the stand-in', () => {
    expect(look.taxonId).toBe(ID);
    expect(look.provisional).toBe(false);
    expect(Object.keys(look.leaves).sort()).toEqual(['adult', 'default']);
    expect(look.flowers).not.toBeNull();
    expect(look.fruits).not.toBeNull();
    expect(Object.keys(look.appendages)).toEqual(['aerial_roots']);
    for (const { asset } of assetsOf(look)) expect(asset.key.startsWith(`${ID}/`), asset.key).toBe(true);
  });

  it('build at every level of detail, finite and within the budget each states', () => {
    for (const { kind, asset } of assetsOf(look)) {
      expect(asset.budget).toHaveLength(asset.lods);
      for (let lod = 0; lod < asset.lods; lod++) {
        expect(asset.budget[lod]!, `${asset.key} level ${lod}`).toBeLessThanOrEqual(ceilingFor(kind, lod, asset.lods));
        for (let v = 0; v < asset.variants; v++) {
          const g = asset.make(v, lod);
          const position = g.getAttribute('position').array;
          expect(position.every((x) => Number.isFinite(x)), `${asset.key} ${v}/${lod}`).toBe(true);
          expect(triangles(g), `${asset.key} variant ${v} level ${lod}`).toBeLessThanOrEqual(asset.budget[lod]!);
          // a budget is a statement about the model, not a ceiling far above it
          if (v === asset.variants - 1) expect(triangles(g), `${asset.key} level ${lod} states a budget far above what it draws`).toBeGreaterThan(asset.budget[lod]! * 0.5);
        }
      }
      // each coarser level is lighter than the one before
      for (let lod = 1; lod < asset.lods; lod++) expect(triangles(asset.make(0, lod)), asset.key).toBeLessThan(triangles(asset.make(0, lod - 1)));
    }
  });
});

// species/hedera-helix/morphology.json, leaf.juvenile.*: Metcalfe 2005, leaves of climbing stems "4-10(-25) cm,
// palmately lobed with 3-5 triangular, entire lobes ... often with pale veins"; VicFlora, 4-7 cm wide on a stalk of 2-10 cm.
describe('the climbing leaf', () => {
  const leaf = look.leaves.default;
  const reach = param(model, 'organs.leafLengthM');
  const blades = Array.from({ length: leaf.variants }, (_, v) => bladeOf(leaf.make(v, 0)));

  it('has three to five lobes, each with a pale main vein from the stalk to its tip', () => {
    const [fewest, most] = characterRange(morphology, 'leaf.juvenile.lobeCount');
    const lobes = blades.map((b) => b.veins);
    expect(Math.min(...lobes)).toBe(fewest);
    expect(Math.max(...lobes)).toBe(most);
    for (const n of lobes) expect([fewest, most]).toContain(n);
    // the vein is drawn towards a colour paler than the blade
    const { greenA, greenB } = leaf.palette;
    expect(greenB[1]).toBeGreaterThan(greenA[1] * 3);
    expect(profile).toContain('pale vein');
  });

  it('is a blade 4 to 10 cm long and about as wide, on a stalk of 2 to 10 cm, at the leaf lengths the growth model gives', () => {
    const [long0, long1] = characterRange(morphology, 'leaf.juvenile.bladeLengthM');
    const [wide0, wide1] = characterRange(morphology, 'leaf.juvenile.bladeWidthM');
    const [stalk0, stalk1] = characterRange(morphology, 'leaf.juvenile.petioleLengthM');
    for (const b of blades) {
      // within a tenth of the published range at both ends of the model's
      expect(reach[0] * b.length).toBeGreaterThan(long0 * 0.9);
      expect(reach[1] * b.length).toBeLessThan(long1 * 1.1);
      expect(mid(reach) * b.width).toBeGreaterThan(wide0);
      expect(mid(reach) * b.width).toBeLessThan(wide1 * 1.1);
      expect(reach[0] * b.stalk).toBeGreaterThan(stalk0 * 0.9);
      expect(reach[1] * b.stalk).toBeLessThan(stalk1);
    }
  });

  it('hangs from the end of its stalk, its upper side turned outwards, and is one unit from the stem to its farthest point', () => {
    for (let v = 0; v < leaf.variants; v++) {
      const g = leaf.make(v, 0);
      g.computeBoundingBox();
      expect(g.boundingBox!.max.z).toBeCloseTo(1, 2);
      const blade = vertices(g).filter((x) => x.t >= 0);
      const pivot = blade[0]!.pivot;
      const tip = blade.reduce((far, x) => (x.p.distanceTo(pivot) > far.p.distanceTo(pivot) ? x : far)).p;
      // the tip is lower than where the stalk ends, and farther from the stem
      expect(tip.y).toBeLessThan(pivot.y - 0.3);
      expect(tip.z).toBeGreaterThan(pivot.z + 0.2);
    }
  });
});

// species/hedera-helix/morphology.json, leaf.adult.*: Metcalfe 2005, "leaves of flowering stems 6-10 cm, entire,
// ovate or rhombic"; Bean, never lobed.
describe('the adult leaf', () => {
  const leaf = look.leaves['adult']!;
  const reach = param(model, 'organs.leafLengthM');
  const blades = Array.from({ length: leaf.variants }, (_, v) => bladeOf(leaf.make(v, 0)));

  it('is the form the growth model names for the leaves of flowering shoots, and no other form is named', () => {
    expect(model.names.sideShootLeafForm).toBe('adult');
    expect(model.names.leafForm).toBeUndefined();
    expect(model.names.spurLeafForm).toBeUndefined();
  });

  it('is unlobed, with one midrib, widest below the middle or at it: ovate to diamond-shaped', () => {
    expect(characterOf(morphology, 'leaf.adult.shape').value).toEqual(['ovate', 'rhombic']);
    for (const b of blades) {
      expect(b.veins).toBe(1);
      expect(b.widestAt).toBeGreaterThan(0.25);
      expect(b.widestAt).toBeLessThan(0.55);
      // longer than wide
      expect(b.width / b.length).toBeGreaterThan(0.4);
      expect(b.width / b.length).toBeLessThan(0.8);
    }
  });

  it('reaches the 10 cm of the largest adult leaves; the smallest are drawn smaller than 6 cm, as the profile says', () => {
    const [long0, long1] = characterRange(morphology, 'leaf.adult.bladeLengthM');
    for (const b of blades) {
      expect(reach[1] * b.length).toBeGreaterThan(long1 * 0.9);
      expect(reach[1] * b.length).toBeLessThan(long1 * 1.1);
      // one leaf length for both forms: a limit of the engine, recorded in the profile and in the growth model
      expect(reach[0] * b.length).toBeLessThan(long0);
    }
    expect(profile).toContain('one range of leaf length');
    expect(model.params['organs.leafLengthM'].basis).toContain('smallest adult leaves are drawn too small');
  });
});

// species/hedera-helix/morphology.json, inflorescence.* and flower.*: Metcalfe 2005, "about 20 flowers in each umbel,
// and 3-5 umbels in a panicle ... the terminal umbel flowering first"; "Petals 5(-6), yellowish-green, 3-4 mm ... stamens 5".
describe('the panicle of umbels', () => {
  const panicle = look.flowers!.default;
  const size = param(model, 'organs.racemeLengthM');
  const [fewest, most] = characterRange(morphology, 'inflorescence.umbelsPerPanicle');
  const inEnd = characterNumber(morphology, 'inflorescence.flowersPerUmbel');
  const flowersOf = (g: THREE.BufferGeometry) => {
    const byFlower = new Map<string, { pivot: THREE.Vector3; t: number; reach: number }>();
    for (const v of vertices(g)) {
      if (v.t < 0) continue;
      const key = `${v.pivot.x.toFixed(5)},${v.pivot.y.toFixed(5)},${v.pivot.z.toFixed(5)}`;
      const f = byFlower.get(key) ?? { pivot: v.pivot, t: v.t, reach: 0 };
      f.reach = Math.max(f.reach, v.p.distanceTo(v.pivot));
      byFlower.set(key, f);
    }
    return [...byFlower.values()];
  };

  it('has three, four or five umbels: about twenty flowers in the end one and fewer, within the published range, in the others', () => {
    expect(panicle.variants).toBe(most - fewest + 1);
    const [low, high] = characterRange(morphology, 'inflorescence.flowersPerUmbelRange');
    for (let v = 0; v < panicle.variants; v++) {
      const flowers = flowersOf(panicle.make(v, 0));
      const umbels = fewest + v;
      const lower = (flowers.length - inEnd) / (umbels - 1);
      expect(Number.isInteger(lower), `variant ${v}: ${flowers.length} flowers`).toBe(true);
      expect(lower).toBeGreaterThanOrEqual(low);
      expect(lower).toBeLessThanOrEqual(high);
      // the end umbel opens first, then the others in turn: its flowers have the lowest opening order
      const orders = [...new Set(flowers.map((f) => Math.floor(f.t * umbels + 1e-6)))].sort();
      expect(orders).toEqual(Array.from({ length: umbels }, (_, k) => k));
      expect(flowers.filter((f) => f.t < 1 / umbels).length).toBe(inEnd);
    }
  });

  it('gives each flower five petals and five stamens, which fall, round an ovary, disc and style, which stay', () => {
    const petals = characterNumber(morphology, 'flower.petalCount');
    const stamens = characterNumber(morphology, 'flower.stamenCount');
    const g = panicle.make(0, 0);
    const part = g.getAttribute('aPart');
    const first = flowersOf(g)[0]!;
    const same = (i: number) => part.getW(i) >= 0 && Math.abs(part.getX(i) - first.pivot.x) + Math.abs(part.getY(i) - first.pivot.y) + Math.abs(part.getZ(i) - first.pivot.z) < 1e-5;
    // each petal is one piece of surface; each stamen two, its filament and its anther
    expect(pieces(g, same)).toHaveLength(petals + 2 * stamens);
    // what is tagged as axis is still there when every flower has fallen: more of the model than the stalks alone
    const axis = vertices(g).filter((v) => v.t < 0).length;
    expect(axis).toBeGreaterThan(vertices(g).length * 0.2);
  });

  it('is authored to the measure the growth model gives it, the extent of the whole panicle, with petals of 3 to 4 mm', () => {
    expect(panicle.authoredSize).toBe(1);
    expect(panicle.poise).toBe('held');
    expect(size).toEqual(characterRange(morphology, 'inflorescence.extentM'));
    expect(model.params['organs.racemeLengthM'].basis).toContain('whole inflorescence');
    const [petal0, petal1] = characterRange(morphology, 'flower.petalLengthM');
    const [umbel0, umbel1] = characterRange(morphology, 'inflorescence.umbelDiameterM');
    for (let v = 0; v < panicle.variants; v++) {
      const flowers = flowersOf(panicle.make(v, 0));
      // a petal reaches from the middle of its flower: the rim of the ovary and its own length, bent back
      const petal = Math.max(...flowers.map((f) => f.reach)) * mid(size);
      expect(petal).toBeGreaterThan(petal0);
      expect(petal).toBeLessThan(petal1 * 1.5);
      // the end umbel: twice as far as its flowers stand from where its stalks meet
      const end = flowers.filter((f) => f.t < 1 / (fewest + v));
      const centre = end.reduce((sum, f) => sum.add(f.pivot), new V3()).multiplyScalar(1 / end.length);
      const across = 2 * Math.max(...end.map((f) => f.pivot.distanceTo(centre))) * mid(size);
      expect(across).toBeGreaterThan(umbel0);
      expect(across).toBeLessThan(umbel1);
    }
  });
});

// species/hedera-helix/morphology.json, fruit.*: Metcalfe 2005, "Fruit a berry ... globose, 6-8 mm"; "Typically only
// one umbel per panicle develops into fruit".
describe('the berries', () => {
  const fruit = look.fruits!.default;
  const width = known(model, 'fruit.lengthM')!;

  it('are one umbel of globose berries 6 to 8 mm across, as many as the morphology file allows', () => {
    expect(width).toEqual(characterRange(morphology, 'fruit.clusterWidthM'));
    expect(characterNumber(morphology, 'fruit.umbelsFruitingPerPanicle')).toBe(1);
    const [few, many] = characterRange(morphology, 'fruit.berriesPerUmbel');
    const [across0, across1] = characterRange(morphology, 'fruit.diameterM');
    const counts: number[] = [];
    for (let v = 0; v < fruit.variants; v++) {
      const berries = new Map<string, THREE.Vector3[]>();
      for (const x of vertices(fruit.make(v, 0))) {
        if (x.t < 0) continue;
        const key = `${x.pivot.x.toFixed(5)},${x.pivot.y.toFixed(5)},${x.pivot.z.toFixed(5)}`;
        berries.set(key, [...(berries.get(key) ?? []), x.p]);
      }
      counts.push(berries.size);
      for (const points of berries.values()) {
        // the widest a berry is across, from any point of it to any other
        let across = 0;
        for (let i = 0; i < points.length; i += 3) for (let j = i + 1; j < points.length; j += 3) across = Math.max(across, points[i]!.distanceTo(points[j]!));
        expect(across * width[0]).toBeGreaterThan(across0 * 0.8);
        expect(across * width[1]).toBeLessThan(across1 * 1.3);
      }
      // the whole cluster is about one unit wide
      const g = fruit.make(v, 0);
      g.computeBoundingBox();
      const box = g.boundingBox!;
      expect(Math.max(box.max.x - box.min.x, box.max.z - box.min.z)).toBeGreaterThan(0.8);
      expect(Math.max(box.max.x - box.min.x, box.max.z - box.min.z)).toBeLessThan(1.25);
    }
    expect(Math.min(...counts)).toBe(few);
    expect(Math.max(...counts)).toBe(many);
  });

  it('are green and ripen to a dull blue-black, their stalks to a lighter colour than the berries', () => {
    expect(fruit.authoredSize).toBe(1);
    const colour = fruit.make(0, 0).getAttribute('color');
    let greenest = 0;
    let leastGreen = 1;
    for (let i = 0; i < colour.count; i++) {
      // unripe: more green than red or blue
      expect(colour.getY(i)).toBeGreaterThan(colour.getX(i));
      expect(colour.getY(i)).toBeGreaterThan(colour.getZ(i));
      greenest = Math.max(greenest, colour.getY(i));
      leastGreen = Math.min(leastGreen, colour.getY(i));
    }
    // look.ts: the ripe colour of a point is ripe * (ripeShade[0] + ripeShade[1] * g), g the green of its unripe colour
    const ripeAt = (g: number) => fruit.ripe.map((c) => c * (fruit.ripeShade[0] + fruit.ripeShade[1] * g));
    const berry = ripeAt(leastGreen);
    const stalk = ripeAt(greenest);
    for (const c of berry) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThan(0.03);
    }
    expect(stalk[0]!).toBeGreaterThan(berry[0]! * 2);
  });
});

// species/hedera-helix/morphology.json, stem.rootlet*: Melzer et al. 2010, attachment roots "1-15 mm long"; Melzer et
// al. 2012, a median of 38 roots to a cluster, on the side of the shoot that faces what it climbs.
describe('the rootlets', () => {
  const roots = look.appendages.aerial_roots!;

  it('are a cluster of 38 unbranched roots lying on the surface the stem clings to, none longer than one unit', () => {
    const count = characterNumber(morphology, 'stem.rootletsPerCluster');
    for (let v = 0; v < roots.variants; v++) {
      const g = roots.make(v, 0);
      const points = vertices(g).map((x) => x.p);
      // every root is one tube of its own (unbranched): those that lie on the surface, and a few that go into it
      const tubes = pieces(g).map((piece) => piece.map((i) => points[i]!));
      const lying = tubes.filter((tube) => Math.max(...tube.map((p) => p.z)) < 0.01);
      expect(lying).toHaveLength(count);
      expect(tubes.length).toBeGreaterThan(count);
      const lengths = lying.map((tube) => {
        let longest = 0;
        for (const a of tube) for (const b of tube) longest = Math.max(longest, a.distanceTo(b));
        return longest;
      });
      // of unequal length, the longest about one unit: the length the data gives is the longest a root is drawn
      expect(Math.max(...lengths)).toBeGreaterThan(0.9);
      expect(Math.max(...lengths)).toBeLessThan(1.1);
      expect(Math.min(...lengths)).toBeLessThan(0.6);
      // on the surface, which is the plane z = 0: never more than a fifth of a length off it
      for (const tube of lying) expect(Math.min(...tube.map((p) => p.z))).toBeGreaterThan(-0.2);
    }
    expect(known(model, 'appendages.aerialRootLengthM')).toEqual(characterRange(morphology, 'stem.rootletLengthM'));
  });
});

// ---- the plant the engine grows ------------------------------------------------------------------------------------
// CLAUDE.md: "A flowering month is an envelope, not a trigger." render/presence.ts: "Every consumer of render data ...
// has to answer the same questions"; nothing below works out a season of its own.
describe('a specimen of common ivy, twelve years on the frame', () => {
  const frame = readBower(JSON.parse(readFileSync(FRAME, 'utf8')), 'examples/specimen-frame.bower.json');
  const years = 12;
  const { sim } = growPlanting({ bower: frame.bower, plan: specimenPlan(ID), viewpoints: frame.viewpoints }, growable(), 'trained', years);
  const data: RenderData = toRenderData(sim);
  const cal = new Calendar(data.start);
  const last = 2027 + years - 1;
  const role = new Map(data.stems.map((s) => [s.id, s.role]));
  const on = (iso: string) => cal.dayOf(iso);
  const leavesOn = (iso: string, form?: string) => {
    const seasons = seasonsOf(data, Number(iso.slice(0, 4)));
    return data.leaves.filter((l) => (form === undefined || (l.form ?? 'default') === form) && leafState(l, seasons.get(l.plantId), on(iso)).present).length;
  };
  const openOn = (day: number) => data.flowers.filter((f) => flowerState(f, day).phase === 'open').length;
  const fruitOn = (day: number) => data.fruits.map((f) => fruitState(f, day)).filter((s) => s.phase !== 'absent');
  const month = (m: number) => String(m).padStart(2, '0');

  // species/hedera-helix/taxon.json: leafHabit "evergreen" (RHS). Metcalfe 2005: "Leaves are long-lived (3-4 years)".
  it('is in leaf in every month of the year, winter included', () => {
    expect(taxon.leafHabit.value).toBe('evergreen');
    const counts = Array.from({ length: 12 }, (_, m) => leavesOn(`${last}-${month(m + 1)}-15`));
    for (const n of counts) expect(n).toBeGreaterThan(2000);
    // the winter cover is what the summer cover was, less the leaves that have lived their four seasons
    expect(counts[0]!).toBeGreaterThan(counts[6]! * 0.8);
    expect(param(model, 'organs.leafLifespanYears')).toBe(4);
    for (const l of data.leaves) expect(l.evergreen).toBe(true);
  });

  // RHS ivy guide: adult growth "around 10 years in"; Bean: flowering shoots "with no aerial roots", leaves never lobed.
  it('bears the lobed leaf on its climbing stems and the unlobed adult leaf only on its flowering shoots, none of which is near the ground', () => {
    for (const l of data.leaves) expect(l.form, l.stemId).toBe(role.get(l.stemId) === 'side_shoot' ? 'adult' : undefined);
    expect(leavesOn(`${last}-07-15`, 'adult')).toBeGreaterThan(100);
    expect(leavesOn(`${last}-07-15`, 'default')).toBeGreaterThan(10 * leavesOn(`${last}-07-15`, 'adult'));
    // none in the first five years: no wood is yet as old as the model asks before it bears an adult shoot
    expect(leavesOn('2031-07-15', 'adult')).toBe(0);
    const clear = param(model, 'organs.clearStemHeightM');
    for (const s of data.stems.filter((x) => x.role === 'side_shoot')) expect(s.contact[2]!).toBeGreaterThanOrEqual(clear);
  });

  // RHS (ivy on buildings): flowers "from September to November". Metcalfe 2005: "from about 10 years old".
  it('flowers from September to November and in no other month, from its tenth season, and only at the ends of adult shoots', () => {
    expect(taxon.flowering.monthsUK.value).toEqual([9, 10, 11]);
    expect(data.flowers.length).toBeGreaterThan(40);
    for (const f of data.flowers) {
      expect(role.get(f.stemId)).toBe('side_shoot');
      // carried on in the line of its shoot
      expect(f.direction).toBeDefined();
      expect(f.form).toBeUndefined();
      expect(f.lengthM).toBeGreaterThanOrEqual(param(model, 'organs.racemeLengthM')[0]);
      expect(f.lengthM).toBeLessThanOrEqual(param(model, 'organs.racemeLengthM')[1]);
    }
    expect(cal.dateOf(Math.min(...data.flowers.map((f) => f.openDay))).year).toBe(2027 + 9);
    const months = new Set<number>();
    for (let day = on(`${last}-01-01`); day <= data.lastDay; day++) if (openOn(day) > 0) months.add(cal.dateOf(day).month);
    expect([...months].sort((a, b) => a - b)).toEqual([9, 10, 11]);
    // the middle of each of those months has flowers open; October has the most
    for (const m of [9, 10, 11]) expect(openOn(on(`${last}-${month(m)}-15`)), `month ${m}`).toBeGreaterThan(0);
    expect(openOn(on(`${last}-10-15`))).toBeGreaterThan(openOn(on(`${last}-11-15`)));
    expect(param(model, 'flowering.currentSeasonFlowersPerM')).toBe(0);
  });

  // Metcalfe 2005 after Snow and Snow 1988: "most ripen fruit in March or April"; "Seeds are dispersed from
  // November/December until as late as June".
  it('carries green berries through the winter, ripe ones in March and April, and none from July until the next flowers have gone over', () => {
    expect(data.fruits.length).toBeGreaterThan(30);
    const stems = new Set(data.flowers.map((f) => f.stemId));
    for (const f of data.fruits) {
      expect(stems.has(f.stemId)).toBe(true);
      expect(f.lengthM).toBeGreaterThanOrEqual(known(model, 'fruit.lengthM')![0]);
      expect(f.lengthM).toBeLessThanOrEqual(known(model, 'fruit.lengthM')![1]);
    }
    const phases = (iso: string) => fruitOn(on(iso)).map((s) => s.phase);
    // midwinter: every berry of last autumn's flowers is on the plant and none is ripe
    const december = phases(`${last - 1}-12-15`);
    expect(december.length).toBeGreaterThan(10);
    expect(december.every((p) => p === 'swelling' || p === 'full')).toBe(true);
    // early spring: berries are ripe or turning
    for (const iso of [`${last}-03-15`, `${last}-04-15`]) expect(phases(iso).filter((p) => p === 'ripe' || p === 'ripening').length, iso).toBeGreaterThan(3);
    expect(phases(`${last}-04-15`).filter((p) => p === 'ripe').length).toBeGreaterThan(phases(`${last}-02-15`).filter((p) => p === 'ripe').length);
    // by the end of April nothing is still green; by July nothing is left
    expect(phases(`${last}-05-01`).some((p) => p === 'swelling' || p === 'full')).toBe(false);
    for (const m of [7, 8]) expect(phases(`${last}-${month(m)}-15`), `month ${m}`).toEqual([]);
    expect(phases(`${last}-09-15`)).toEqual([]);
    // no berry without a flower that went over on the plant first
    for (const f of data.fruits) expect(data.flowers.some((x) => x.stemId === f.stemId && x.spentDay === f.swell[0])).toBe(true);
  });

  // Metcalfe 2005: young twigs "densely furnished with adventitious roots"; it is the juvenile phase that produces them.
  it('clings by rootlets 1 to 15 mm long on its climbing stems, and has none on its adult shoots', () => {
    expect(taxon.attachment.mechanism).toBe('aerial_root');
    expect(data.appendages.length).toBeGreaterThan(1000);
    const [short, long] = characterRange(morphology, 'stem.rootletLengthM');
    for (const a of data.appendages) {
      expect(a.kind).toBe('aerial_roots');
      expect(a.holding).toBe(true);
      // 'whip': a climbing shoot of the year that came within reach of the timber and took hold of it (core,
      // SIMULATION_KEY.md section 4.3, "Unsupported shoots", (f)); the adult shoots are side shoots, and have none
      expect(['leader', 'lateral', 'whip']).toContain(role.get(a.stemId));
      expect(a.lengthM).toBeGreaterThanOrEqual(short);
      expect(a.lengthM).toBeLessThanOrEqual(long);
    }
    expect(data.appendages.filter((a) => appendagePresent(a, data.lastDay)).length).toBeGreaterThan(1000);
  });

  // RHS (ivy on buildings): "A single plant can cover several standard fence panels in a decade". The frame is two.
  it('has covered the frame in ten years, slowly at first, and holds the timber by itself', () => {
    const at = (year: number) => sim.summaries.find((s) => s.year === year)!;
    expect(at(2027).highestM).toBeLessThan(1);
    expect(at(2031).highestM).toBeGreaterThan(2.5);
    expect(at(2032).routeShare).toBeGreaterThan(0.25);
    expect(at(2036).routeShare).toBeGreaterThan(0.8);
    expect(at(2036).runsSelf).toBeGreaterThan(10 * at(2036).runsTied);
    // a main stem of a twelve-year-old plant is centimetres thick, not the 25 cm of the oldest ivy
    const thickest = Math.max(...data.stems.filter((s) => s.role === 'leader').flatMap((s) => s.radiusMm)) * 2;
    expect(thickest).toBeGreaterThan(15);
    expect(thickest).toBeLessThan(60);
    expect(thickest / 1000).toBeLessThan(characterNumber(morphology, 'stem.maxDiameterM'));
  });
});
