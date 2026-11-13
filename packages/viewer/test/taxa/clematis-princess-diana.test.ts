import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Calendar, type RenderData, appendagePresent, characterNumber, characterRange, flowerState, fruitState, known, leafState, param, parseMorphology, readBower, seasonsOf, stemPointAlive, toRenderData } from '@horti/core';
import { growPlanting } from '../../src/plant/grow.ts';
import { triangles } from '../../src/plant/kit.ts';
import { assetsOf, ceilingFor } from '../../src/plant/look.ts';
import { loadLooks, lookFor } from '../../src/plant/registry.ts';
import { growable } from '../../src/plant/scenario.ts';
import { SPECIMEN_PLANT, specimenPlan } from '../../src/specimen/specimen.ts';

const ID = 'clematis-princess-diana';
const file = (path: string) => fileURLToPath(new URL(`../../../../${path}`, import.meta.url));
const morphology = parseMorphology(JSON.parse(readFileSync(file(`species/${ID}/morphology.json`), 'utf8')), `species/${ID}/morphology.json`);
const mid = (r: readonly [number, number]) => (r[0] + r[1]) / 2;

await loadLooks();
const look = lookFor(ID);
const leaf = look.leaves.default;
const flower = look.flowers!.default;
const seedHead = look.fruits!.default;
const coil = look.appendages.leaf_stalk_coil!;

/** The vertices of a model with the tag each carries: where its part joins, and when it opens (below zero: axis). */
function tagged(g: THREE.BufferGeometry): { p: THREE.Vector3; pivot: THREE.Vector3; t: number }[] {
  const pos = g.getAttribute('position');
  const part = g.getAttribute('aPart');
  return Array.from({ length: pos.count }, (_, i) => ({ p: new THREE.Vector3().fromBufferAttribute(pos, i), pivot: new THREE.Vector3(part.getX(i), part.getY(i), part.getZ(i)), t: part.getW(i) }));
}
/** The parts of a model, by the place each joins. */
function byPivot(g: THREE.BufferGeometry): Map<string, THREE.Vector3[]> {
  const parts = new Map<string, THREE.Vector3[]>();
  for (const v of tagged(g)) {
    if (v.t < 0) continue;
    const key = `${v.pivot.x.toFixed(4)},${v.pivot.y.toFixed(4)},${v.pivot.z.toFixed(4)}`;
    if (!parts.has(key)) parts.set(key, []);
    parts.get(key)!.push(v.p);
  }
  return parts;
}
const farthest = (points: readonly THREE.Vector3[], from: THREE.Vector3) => points.reduce((best, p) => (p.distanceTo(from) > best.distanceTo(from) ? p : best), points[0]!);
const widestApart = (points: readonly THREE.Vector3[]) => {
  let widest = 0;
  for (const a of points) for (const b of points) widest = Math.max(widest, a.distanceTo(b));
  return widest;
};

// TAXON_LOOKS.md section 8: "counts and measured sizes (leaflets, tepals, the length of a leaflet for its width) come
// from the file"; section 1: "A count or size of the real plant that a shape depends on ... is read from
// species/<id>/morphology.json, where it has a source."
describe("Clematis 'Princess Diana': the models agree with its morphology file", () => {
  it('is drawn with models of its own and no stand-in', () => {
    expect(look.taxonId).toBe(ID);
    expect(look.provisional).toBe(false);
    for (const { asset } of assetsOf(look)) expect(asset.key.startsWith(`${ID}/`), asset.key).toBe(true);
    expect(Object.keys(look.appendages)).toEqual(['leaf_stalk_coil']);
  });

  it('gives a leaf three leaflets or five, each on a stalk of its own, and picks three for a short leaf and five for a long one', () => {
    const [few, many] = characterRange(morphology, 'leaf.leafletCount');
    const counts = Array.from({ length: leaf.variants }, (_, v) => byPivot(leaf.make(v, 0)).size);
    expect(new Set(counts)).toEqual(new Set([few, many]));
    // the same leaflets at every level of detail
    for (let v = 0; v < leaf.variants; v++) for (let lod = 1; lod < leaf.lods; lod++) expect(byPivot(leaf.make(v, lod)).size, `variant ${v} level ${lod}`).toBe(counts[v]);
    const model = growable().get(ID)!.model;
    const [short, long] = param(model, 'organs.leafLengthM');
    for (const r of [0, 0.5, 0.99]) {
      expect(counts[leaf.pick(short, r)]).toBe(few);
      expect(counts[leaf.pick(long, r)]).toBe(many);
    }
  });

  it('makes the end leaflet as wide for its length as the file says, and as long a share of the leaf', () => {
    const aspect = characterNumber(morphology, 'leaf.leafletWidthToLength');
    const leafletM = mid(characterRange(morphology, 'leaf.leafletLengthM'));
    const model = growable().get(ID)!.model;
    const [short, long] = param(model, 'organs.leafLengthM');
    for (let v = 0; v < leaf.variants; v++) {
      const parts = [...byPivot(leaf.make(v, 0)).entries()];
      // the end leaflet joins farthest along the leaf
      const [key, points] = parts.reduce((a, b) => (Number(b[0].split(',')[2]) > Number(a[0].split(',')[2]) ? b : a));
      const joint = new THREE.Vector3(...(key.split(',').map(Number) as [number, number, number]));
      const tip = farthest(points, joint);
      const length = tip.distanceTo(joint);
      const along = tip.clone().sub(joint).normalize();
      const halfWidths = points.map((p) => p.clone().sub(joint).cross(along).length());
      expect((2 * Math.max(...halfWidths)) / length, `variant ${v}`).toBeGreaterThan(aspect * 0.88);
      expect((2 * Math.max(...halfWidths)) / length, `variant ${v}`).toBeLessThan(aspect * 1.12);
      // one unit is the whole leaf: a leaflet of the file's length on a leaf of the growth model's length
      const leafM = parts.length === 3 ? short : long;
      expect(length, `variant ${v}`).toBeGreaterThan((leafletM / leafM) * 0.7);
      expect(length, `variant ${v}`).toBeLessThan((leafletM / leafM) * 1.3);
    }
  });

  it('gives a flower four tepals round a boss of thirty to forty stamens, on a stalk two flower-lengths long or more', () => {
    const tepals = characterNumber(morphology, 'flower.tepalCount');
    const [fewest, most] = characterRange(morphology, 'flower.stamenCount');
    const stalk = mid(characterRange(morphology, 'flower.stalkLengthM')) / mid(characterRange(morphology, 'flower.lengthM'));
    expect(stalk).toBeGreaterThan(2);
    for (let v = 0; v < flower.variants; v++) {
      const all = tagged(flower.make(v, 0));
      // tepals open first, each at its own moment; the stamens and styles are tagged to open late
      const openings = new Set(all.filter((x) => x.t >= 0 && x.t < 0.5).map((x) => x.t.toFixed(4)));
      expect(openings.size, `variant ${v}`).toBe(tepals);
      const stamens = new Set(all.filter((x) => x.t >= 0.75 && x.t < 0.85).map((x) => x.t.toFixed(5)));
      expect(stamens.size, `variant ${v}`).toBeGreaterThanOrEqual(fewest);
      expect(stamens.size, `variant ${v}`).toBeLessThanOrEqual(most);
      // every part joins at the top of the stalk
      const joint = all.find((x) => x.t >= 0)!.pivot;
      for (const x of all) if (x.t >= 0) expect(x.pivot.distanceTo(joint)).toBeLessThan(1e-6);
      expect(joint.length(), `variant ${v}`).toBeGreaterThan(stalk * 0.85);
      expect(joint.length(), `variant ${v}`).toBeLessThanOrEqual(stalk * 1.001);
    }
  });

  it('authors the flower to its length, and opens it from a tulip to a trumpet as wide as the file says', () => {
    // morphology: flower.sizeMeasure. One unit is the length of the flower, so a tepal is about one unit long.
    expect(flower.authoredSize).toBe(1);
    expect(flower.poise).toBe('held');
    const [d0, d1] = characterRange(morphology, 'flower.diameterM');
    const [l0, l1] = characterRange(morphology, 'flower.lengthM');
    const spans: number[] = [];
    for (let v = 0; v < flower.variants; v++) {
      const all = tagged(flower.make(v, 0)).filter((x) => x.t >= 0 && x.t < 0.5);
      const joint = all[0]!.pivot;
      const tips = [...new Set(all.map((x) => x.t))].map((t) => farthest(all.filter((x) => x.t === t).map((x) => x.p), joint));
      // a tepal is one flower-length along its curve, so a little less from joint to tip
      for (const tip of tips) {
        expect(tip.distanceTo(joint), `variant ${v}`).toBeGreaterThan(0.55);
        expect(tip.distanceTo(joint), `variant ${v}`).toBeLessThan(1.02);
      }
      spans.push(widestApart(tips));
    }
    console.log('spans', spans);
    // the first variant has just opened and is the narrowest; the last is flared wide
    expect(spans[0]).toBe(Math.min(...spans));
    expect(spans.at(-1)).toBe(Math.max(...spans));
    expect(spans.at(-1)!).toBeGreaterThan(d0 / l1);
    expect(spans.at(-1)!).toBeLessThan(d1 / l0);
    // just open, it is a tulip: narrower than it is long
    expect(spans[0]!).toBeLessThan(0.8);
  });

  it('gives a seed head twenty to thirty feathered achenes, and makes it one unit across', () => {
    const [fewest, most] = characterRange(morphology, 'fruit.acheneCount');
    expect(seedHead.authoredSize).toBe(1);
    expect(seedHead.poise).toBe('held');
    const counts: number[] = [];
    for (let v = 0; v < seedHead.variants; v++) {
      const all = tagged(seedHead.make(v, 0));
      const achenes = new Set(all.filter((x) => x.t >= 0).map((x) => x.t));
      counts.push(achenes.size);
      expect(achenes.size, `variant ${v}`).toBeGreaterThanOrEqual(fewest);
      expect(achenes.size, `variant ${v}`).toBeLessThanOrEqual(most);
      // the head: everything but the stalk and its bracts. Nine tenths of it lies within the width the model is
      // authored to, and the longest curl of a tail with its hairs not far outside it
      const centre = all.find((x) => x.t >= 0)!.pivot;
      const reach = all
        .filter((x) => x.t >= 0)
        .map((x) => x.p.distanceTo(centre))
        .sort((a, b) => a - b);
      const mostOfIt = reach[Math.floor(reach.length * 0.9)]!;
      expect(2 * mostOfIt, `variant ${v}`).toBeGreaterThan(0.8);
      expect(2 * mostOfIt, `variant ${v}`).toBeLessThan(1.15);
      expect(2 * reach.at(-1)!, `variant ${v}`).toBeLessThan(1.45);
    }
    expect(Math.min(...counts)).toBe(fewest);
    expect(Math.max(...counts)).toBe(most);
  });

  it('winds a leaf stalk that has hold more than once round its support, and leaves one that has not as a crook', () => {
    const length = (g: THREE.BufferGeometry) => {
      const rings = [...new Map(tagged(g).map((x) => [x.t, x.pivot])).entries()].sort((a, b) => b[0] - a[0]).map(([, p]) => p);
      return rings.reduce((sum, p, i) => (i ? sum + p.distanceTo(rings[i - 1]!) : 0), 0);
    };
    const thin = coil.pick(0.5, true, 5);
    const stout = coil.pick(0.5, true, 12);
    const free = coil.pick(0.5, false);
    expect(new Set([thin, stout, free]).size).toBe(3);
    // a turn and a quarter adds more than its own diameter to the way from the stem to the far end
    expect(length(coil.make(thin, 0))).toBeGreaterThan(1.5);
    expect(length(coil.make(stout, 0))).toBeGreaterThan(length(coil.make(thin, 0)));
    expect(length(coil.make(free, 0))).toBeLessThan(1.5);
  });
});

// TAXON_LOOKS.md section 6, "Levels of detail and triangle budgets".
describe("Clematis 'Princess Diana': every organ model at every level of detail", () => {
  it('builds finite geometry within the budget it states, and within the ceiling for its kind', () => {
    let built = 0;
    for (const { kind, asset } of assetsOf(look)) {
      expect(asset.budget.length, asset.key).toBe(asset.lods);
      for (let lod = 0; lod < asset.lods; lod++) {
        expect(asset.budget[lod]!, `${asset.key} level ${lod}`).toBeLessThanOrEqual(ceilingFor(kind, lod, asset.lods));
        for (let v = 0; v < asset.variants; v++) {
          const g = asset.make(v, lod);
          const numbers = [...g.getAttribute('position').array, ...g.getAttribute('normal').array, ...(g.getAttribute('color')?.array ?? [])];
          expect(numbers.every(Number.isFinite), `${asset.key} ${v}/${lod}`).toBe(true);
          expect(triangles(g), `${asset.key} variant ${v} level ${lod}`).toBeLessThanOrEqual(asset.budget[lod]!);
          // not so far under that the budget says nothing
          if (lod === asset.lods - 1) expect(triangles(g), `${asset.key} variant ${v} level ${lod}`).toBeGreaterThan(asset.budget[lod]! * 0.3);
          built++;
        }
      }
    }
    expect(built).toBe(leaf.variants * leaf.lods + flower.variants * flower.lods + seedHead.variants * seedHead.lods + coil.variants * coil.lods);
  });

  it('keeps the far models light: what a whole Bower is drawn with', () => {
    expect(leaf.budget.at(-1)!).toBeLessThanOrEqual(100);
    expect(flower.budget.at(-1)!).toBeLessThanOrEqual(130);
    expect(seedHead.budget.at(-1)!).toBeLessThanOrEqual(100);
  });
});

// CLAUDE.md: "A flowering month is an envelope, not a trigger. Never show flowers because the calendar says so."
// species/clematis-princess-diana/SPECIES_PROFILE.md, "Form: what the model draws", gives the year these runs must show.
describe("Clematis 'Princess Diana' on the specimen frame, six years, trained", () => {
  const frame = readBower(JSON.parse(readFileSync(file('examples/specimen-frame.bower.json'), 'utf8')), 'examples/specimen-frame.bower.json');
  const model = growable().get(ID)!.model;
  const grow = (care: 'trained' | 'untended') => toRenderData(growPlanting({ bower: frame.bower, plan: specimenPlan(ID), viewpoints: frame.viewpoints }, growable(), care, 6).sim);
  const data: RenderData = grow('trained');
  const cal = new Calendar(data.start);
  const on = (iso: string) => {
    const day = cal.dayOf(iso);
    const seasons = seasonsOf(data, cal.dateOf(day).year);
    return {
      leaves: data.leaves.filter((l) => leafState(l, seasons.get(l.plantId), day).present).length,
      open: data.flowers.filter((f) => flowerState(f, day).phase === 'open').length,
      buds: data.flowers.filter((f) => flowerState(f, day).phase === 'in_bud').length,
      heads: data.fruits.filter((f) => fruitState(f, day).phase !== 'absent').length,
      ripe: data.fruits.filter((f) => fruitState(f, day).phase === 'ripe').length,
      stems: data.stems.filter((s) => s.bornDay.length > 8 && stemPointAlive(s, 8, day)).length,
    };
  };

  it('is one plant, drawn in its own leaf, flower, seed head and hold: nothing the run has is left without a model', () => {
    expect(data.plants.map((p) => p.id)).toEqual([SPECIMEN_PLANT]);
    expect(data.leaves.length).toBeGreaterThan(0);
    expect(data.flowers.length).toBeGreaterThan(0);
    expect(data.fruits.length).toBeGreaterThan(0);
    expect(new Set(data.appendages.map((a) => a.kind))).toEqual(new Set(['leaf_stalk_coil']));
    // it names no forms: every organ is its ordinary one
    for (const organ of [...data.leaves, ...data.flowers, ...data.fruits]) expect(organ.form).toBeUndefined();
  });

  // RHS: "Deciduous"; "of herbaceous habit". RHS group 3: cut down in February.
  it('is in leaf from spring to autumn and bare in winter', () => {
    for (const month of ['05', '06', '07', '08', '09', '10']) expect(on(`2032-${month}-15`).leaves, month).toBeGreaterThan(100);
    for (const date of ['2032-01-15', '2032-02-15', '2032-03-01', '2032-12-25']) expect(on(date).leaves, date).toBe(0);
    // most leaf at midsummer and after, none of it kept over winter
    expect(on('2032-08-15').leaves).toBeGreaterThan(on('2032-05-15').leaves);
    for (const l of data.leaves) expect(l.evergreen).toBe(false);
  });

  // RHS: "mid summer to early autumn"; Clematis on the Web and Graham Rice for the RHS: July to October.
  it('flowers from July into October on the growth of the year, and in no other month', () => {
    for (const month of ['07', '08', '09']) expect(on(`2032-${month}-15`).open, month).toBeGreaterThan(0);
    for (const month of ['11', '12', '01', '02', '03', '04', '05', '06']) expect(on(`2032-${month}-15`).open, month).toBe(0);
    // the height of it is in August, with dozens open together
    expect(on('2032-08-15').open).toBeGreaterThan(on('2032-07-08').open);
    expect(on('2032-08-15').open).toBeGreaterThan(20);
    // buds show for some weeks before the first flower
    expect(on('2032-06-25').buds).toBeGreaterThan(0);
    expect(on('2032-06-25').open).toBe(0);
    // every flower is on a stem made that same year
    const stems = new Map(data.stems.map((s) => [s.id, s]));
    for (const f of data.flowers) {
      const stem = stems.get(f.stemId)!;
      expect(cal.dateOf(stem.bornDay[f.stemPoint!]!).year).toBe(f.year);
    }
  });

  // growth model, names: flowerHeld and fruitHeld are `upright`.
  it('holds every flower and every seed head up, leaning a little away from its support', () => {
    expect(model.names.flowerHeld).toBe('upright');
    expect(model.names.fruitHeld).toBe('upright');
    for (const organ of [...data.flowers, ...data.fruits]) {
      expect(organ.direction, 'a direction is given').toBeDefined();
      expect(organ.direction![2]).toBeGreaterThan(0.9);
    }
    // the data's measure of a flower is its length, 5 to 6 cm; of a seed head its width
    const [f0, f1] = param(model, 'organs.racemeLengthM');
    for (const f of data.flowers) expect(f.lengthM >= f0 - 1e-6 && f.lengthM <= f1 + 1e-6).toBe(true);
    const [h0, h1] = known(model, 'fruit.lengthM')!;
    for (const f of data.fruits) expect(f.lengthM >= h0 - 1e-6 && f.lengthM <= h1 + 1e-6).toBe(true);
  });

  // International Clematis Society: the seed heads are "gorgeous and persistent".
  it('carries seed heads from late summer through the winter, until it is cut down in February', () => {
    expect(on('2032-07-10').heads).toBe(0);
    for (const date of ['2032-09-15', '2032-10-15', '2032-11-15', '2032-12-15']) expect(on(date).heads, date).toBeGreaterThan(10);
    // those set in 2031 were still there in January 2032, ripe, and went with the stems on 20 February
    expect(on('2032-01-10').ripe).toBeGreaterThan(10);
    expect(on('2032-01-10').heads).toBe(on('2032-01-10').ripe);
    for (const date of ['2032-03-15', '2032-05-15', '2032-07-01']) expect(on(date).heads, date).toBe(0);
    // a seed head follows a flower that went over on the plant: never more heads than flowers, and each where a flower was
    for (const year of [2030, 2031, 2032]) expect(data.fruits.filter((f) => f.year === year).length).toBeLessThan(data.flowers.filter((f) => f.year === year).length);
    const places = new Set(data.flowers.map((f) => `${f.year} ${f.stemId} ${f.stemPoint}`));
    for (const f of data.fruits) expect(places.has(`${f.year} ${f.stemId} ${f.stemPoint}`), `${f.year} ${f.stemId} ${f.stemPoint}`).toBe(true);
  });

  // RHS group 3 guide: "make new growth from the base each year"; "cut back ... 15-30cm above soil level".
  it('is cut to stubs each February and is back to its height by summer, on fifteen stems or so', () => {
    // just after the cut nothing stands above the stubs
    const afterCut = cal.dayOf('2032-02-25');
    let tallest = 0;
    for (const s of data.stems) for (let i = 0; i < s.bornDay.length; i++) if (stemPointAlive(s, i, afterCut)) tallest = Math.max(tallest, s.contact[3 * i + 2]!);
    expect(tallest).toBeLessThan(0.45);
    const summer = cal.dayOf('2032-08-15');
    let top = 0;
    for (const s of data.stems) for (let i = 0; i < s.bornDay.length; i++) if (stemPointAlive(s, i, summer)) top = Math.max(top, s.contact[3 * i + 2]!);
    // Clematis on the Web: 2.0-2.5 m
    expect(top).toBeGreaterThan(2);
    expect(top).toBeLessThan(3);
    // growth model, architecture.trunkStemStartYears: seven stubs, two or three shoots from each
    expect(on('2032-08-15').stems).toBeGreaterThanOrEqual(12);
    expect(on('2032-08-15').stems).toBeLessThanOrEqual(21);
    // wispy when first planted (Hawke): far fewer stems and flowers in the first summer
    expect(on('2027-08-15').stems).toBeLessThanOrEqual(3);
    expect(on('2027-08-15').open).toBeLessThan(on('2032-08-15').open / 4);
  });

  // CONSTRAINTS_AND_PHENOLOGY.md section 2, petiole_twining: "Fine reachable cables or laths for leaf stalks to grasp
  // ... Coarse member too large for petiole clasp".
  it('clasps the 5 mm cable with its leaf stalks and nothing thicker, and is tied to the timber', () => {
    const limit = param(model, 'attachment.maxGraspDiameterMm');
    const day = cal.dayOf('2032-08-15');
    const holds = data.appendages.filter((a) => appendagePresent(a, day));
    expect(holds.length).toBeGreaterThan(10);
    const [s0, s1] = known(model, 'appendages.leafStalkLengthM')!;
    for (const a of holds) {
      expect(a.holding).toBe(true);
      expect(a.heldDiameterMm).toBe(5);
      expect(a.heldDiameterMm!).toBeLessThanOrEqual(limit);
      expect(a.lengthM >= s0 - 1e-6 && a.lengthM <= s1 + 1e-6).toBe(true);
      // drawn wound round a thin wire
      expect(coil.pick(0.5, a.holding, a.heldDiameterMm)).toBe(0);
    }
  });

  // RHS group 3 guide, of a plant left unpruned: "top heavy, flowering well above eye level, and with a bare base".
  it('left untended keeps its old stems on the one cable it can hold, and flowers only on the shoots they throw high up', () => {
    const wild = grow('untended');
    const day = cal.dayOf('2032-08-15');
    const open = wild.flowers.filter((f) => flowerState(f, day).phase === 'open');
    expect(open.length).toBeGreaterThan(0);
    expect(open.length).toBeLessThan(on('2032-08-15').open);
    const clear = param(model, 'organs.clearStemHeightM');
    const stems = new Map(wild.stems.map((s) => [s.id, s]));
    for (const f of open) expect(stems.get(f.stemId)!.contact[2]!).toBeGreaterThanOrEqual(clear - 0.05);
    // nothing is tied: every stretch it is on, it holds by itself
    expect(wild.events.filter((e) => e.type === 'hard_prune')).toHaveLength(0);
  });
});
