import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Calendar, characterNumber, characterOf, characterRange, characterText, flowerState, fruitState, known, leafState, param, parseMorphology, readBower, seasonsOf, toRenderData } from '@horti/core';
import { growPlanting } from '../../src/plant/grow.ts';
import { asMeasured } from '../../src/plant/hold.ts';
import { triangles } from '../../src/plant/kit.ts';
import { type FlowerAsset, type FruitAsset, type LeafAsset, assetsOf, ceilingFor } from '../../src/plant/look.ts';
import { loadLooks, lookFor } from '../../src/plant/registry.ts';
import { growable } from '../../src/plant/scenario.ts';
import { specimenPlan } from '../../src/specimen/specimen.ts';

const ID = 'trachelospermum-jasminoides';
const MORPHOLOGY = fileURLToPath(new URL(`../../../../species/${ID}/morphology.json`, import.meta.url));
const FRAME = fileURLToPath(new URL('../../../../examples/specimen-frame.bower.json', import.meta.url));

await loadLooks([ID]);
const look = lookFor(ID);
const morphology = parseMorphology(JSON.parse(readFileSync(MORPHOLOGY, 'utf8')), MORPHOLOGY);
const { model, profile } = growable().get(ID)!;
const leaf = look.leaves.default as LeafAsset;
const cyme = look.flowers!.default as FlowerAsset;
const follicles = look.fruits!.default as FruitAsset;
const mid = (r: readonly [number, number]) => (r[0] + r[1]) / 2;

/** The points of a geometry, with the part each belongs to where it has parts. */
function points(g: THREE.BufferGeometry): { p: THREE.Vector3; pivot: THREE.Vector3; t: number }[] {
  const pos = g.getAttribute('position');
  const part = g.getAttribute('aPart');
  return Array.from({ length: pos.count }, (_, i) => ({
    p: new THREE.Vector3().fromBufferAttribute(pos, i),
    pivot: part ? new THREE.Vector3(part.getX(i), part.getY(i), part.getZ(i)) : new THREE.Vector3(),
    t: part ? part.getW(i) : -1,
  }));
}

/** The flowers and buds of a cyme: its parts that come and go, each with its points in the order they were built. */
function partsOf(g: THREE.BufferGeometry): { t: number; pivot: THREE.Vector3; points: THREE.Vector3[] }[] {
  const byPart = new Map<string, { t: number; pivot: THREE.Vector3; points: THREE.Vector3[] }>();
  for (const { p, pivot, t } of points(g)) {
    if (t < 0) continue;
    const key = `${t}:${pivot.x}:${pivot.y}:${pivot.z}`;
    if (!byPart.has(key)) byPart.set(key, { t, pivot, points: [] });
    byPart.get(key)!.points.push(p);
  }
  return [...byPart.values()].sort((a, b) => a.t - b.t);
}

/** How many separate surfaces a geometry is made of. */
function surfaces(g: THREE.BufferGeometry): number[][] {
  const n = g.getAttribute('position').count;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const index = g.index!;
  for (let i = 0; i < index.count; i += 3) {
    const a = find(index.getX(i));
    parent[find(index.getX(i + 1))] = a;
    parent[find(index.getX(i + 2))] = a;
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(i);
  }
  return [...groups.values()];
}

// TAXON_LOOKS.md section 8: "A number that describes the real plant does not belong in drawing code. It is entered
// in species/<id>/morphology.json with its evidence status and source". CLAUDE.md: "No bare numbers about plants."
describe('what is recorded of the star jasmine\'s shape', () => {
  it('gives every character a status, and every published or measured one a source', () => {
    const entries = Object.entries(morphology.characters);
    expect(entries.length).toBeGreaterThan(30);
    for (const [key, c] of entries) {
      if (c.status === 'unknown') expect(c.value, key).toBeNull();
      else if (c.status === 'provisional_design_assumption') expect((c.basis ?? '').length, key).toBeGreaterThan(20);
      else expect(c.source, key).toMatch(/^https:\/\//);
    }
    // what nobody has recorded stays unrecorded: taxon.json holds the twining direction as unknown, and so does this file
    expect(characterOf(morphology, 'stem.twiningHandedness')).toEqual({ value: null, status: 'unknown' });
    expect(profile.attachment.handedness!.value).toBeNull();
  });

  it('agrees with the growth model wherever both hold the same thing', () => {
    expect(characterRange(morphology, 'leaf.lengthM')).toEqual(param(model, 'organs.leafLengthM'));
    expect(characterOf(morphology, 'leaf.lengthM').source).toBe(model.params['organs.leafLengthM'].source);
    expect(characterRange(morphology, 'fruit.lengthM')).toEqual(known(model, 'fruit.lengthM'));
    // the size the engine gives a cyme is the width of its cluster of flowers, and the model is authored to that
    expect(characterRange(morphology, 'inflorescence.widthM')).toEqual(param(model, 'organs.racemeLengthM'));
    expect(cyme.authoredSize).toBeCloseTo(mid(characterRange(morphology, 'inflorescence.widthM')), 6);
    expect(follicles.authoredSize).toBeCloseTo(mid(characterRange(morphology, 'fruit.lengthM')), 6);
    // opposite leaves; flowers that stand out from the plant; pods that hang
    expect(characterText(morphology, 'leaf.arrangement')).toBe('opposite');
    expect(param(model, 'organs.leavesPerNode')).toBe(2);
    expect(model.names.flowerHeld).toBe('facing_out');
    expect(characterText(morphology, 'fruit.held')).toBe('hanging');
    expect(model.names.fruitHeld).toBe('hanging');
    expect(cyme.poise).toBe('held');
    expect(follicles.poise).toBe('hangs');
  });
});

// TAXON_LOOKS.md section 6: "Every asset states a budget: the most triangles it has at each level."
describe('the star jasmine\'s organ models', () => {
  it('build at every level of detail, within the budget each states and the ceiling for its kind', () => {
    const assets = assetsOf(look);
    expect(assets.map((a) => a.kind).sort()).toEqual(['flower', 'fruit', 'leaf']);
    for (const { kind, asset } of assets) {
      expect(asset.key.startsWith(`${ID}/`)).toBe(true);
      expect(asset.lods).toBe(3);
      for (let lod = 0; lod < asset.lods; lod++) {
        expect(asset.budget[lod]!, `${asset.key} level ${lod}`).toBeLessThanOrEqual(ceilingFor(kind, lod, asset.lods));
        for (let v = 0; v < asset.variants; v++) {
          const g = asset.make(v, lod);
          expect(triangles(g), `${asset.key} ${v}/${lod}`).toBeLessThanOrEqual(asset.budget[lod]!);
          expect(triangles(g), `${asset.key} ${v}/${lod}`).toBeGreaterThan(3);
          for (const x of g.getAttribute('position').array) if (!Number.isFinite(x)) throw new Error(`${asset.key} ${v}/${lod} has a point that is not a number`);
        }
      }
    }
    // the far level is what a whole Bower is drawn with: a leaf of a dozen triangles, a cyme of about a hundred
    expect(leaf.budget[2]).toBeLessThanOrEqual(16);
    expect(cyme.budget[2]).toBeLessThanOrEqual(120);
    // it is a twiner with no tendrils, coiled stalks or prickles, and its look has none
    expect(look.appendages).toEqual({});
    expect(look.provisional).toBe(false);
  });
});

// species/trachelospermum-jasminoides/SPECIES_PROFILE.md, "Form: what the model draws": the leaf.
describe('the leaf', () => {
  const [length0, length1] = characterRange(morphology, 'leaf.lengthM');
  const [width0, width1] = characterRange(morphology, 'leaf.widthM');
  const [stalk0, stalk1] = characterRange(morphology, 'leaf.stalkLengthM');

  it('is one unit long as the leaf is measured, its blade turned down by its hold, and as wide for its length as the photographs show', () => {
    // TAXON_LOOKS.md 5a: a leaf with a hold is authored with its blade flat out from its stalk, and its unit is measured
    // with the blade turned down by hold.unitAt (asMeasured, as test/looks.test.ts measures it)
    expect(leaf.hold!.unitAt).toBe(characterNumber(morphology, 'leaf.bladeBelowStalkDeg'));
    const [aspect0, aspect1] = characterRange(morphology, 'leaf.bladeWidthToLength');
    const aspects: number[] = [];
    for (let v = 0; v < leaf.variants; v++) {
      const g = leaf.make(v, 0);
      const z = asMeasured(g, leaf.hold!.unitAt).map((p) => p.z);
      expect(Math.max(...z)).toBeGreaterThan(0.98);
      expect(Math.max(...z)).toBeLessThan(1.02);
      expect(Math.min(...z)).toBeGreaterThan(-0.02);
      const blade = points(g).filter((q) => q.t >= 0);
      const start = Math.min(...blade.map((q) => q.p.z));
      const end = Math.max(...blade.map((q) => q.p.z));
      const xs = blade.map((q) => q.p.x);
      aspects.push((Math.max(...xs) - Math.min(...xs)) / (end - start));
    }
    // each leaf within the photographs' range, give or take the few per cent each is varied by
    for (const a of aspects) {
      expect(a).toBeGreaterThan(aspect0 * 0.9);
      expect(a).toBeLessThan(aspect1 * 1.1);
    }
    // three outlines (Flora of China: narrowly elliptic, elliptic, ovate), the narrow ones narrower than the ovate
    const of = (k: number) => (aspects[k]! + aspects[k + 3]!) / 2;
    expect(of(0)).toBeLessThan(of(1));
    expect(of(1)).toBeLessThan(of(2));
    // and the measured leaves (Ocokoljic et al. 2026, middles: 2.5 cm wide for a blade of about 5.75 cm) lie within
    const measured = mid([width0, width1]) / (mid([length0, length1]) - mid([stalk0, stalk1]));
    expect(measured).toBeGreaterThan(aspect0);
    expect(measured).toBeLessThan(aspect1);
  });

  it('has a short stalk: between the shortest stalk on the longest leaf and the longest on the shortest', () => {
    for (let v = 0; v < leaf.variants; v++) {
      const g = leaf.make(v, 0);
      // the blade is the part that unfolds; the stalk is axis
      const stalk = points(g).filter((q) => q.t < 0);
      const blade = points(g).filter((q) => q.t >= 0);
      expect(stalk.length).toBeGreaterThan(0);
      const stalkEnd = Math.max(...stalk.map((q) => q.p.z));
      expect(stalkEnd).toBeGreaterThan(stalk0 / length1);
      expect(stalkEnd).toBeLessThan(stalk1 / length0);
      // the blade starts where the stalk ends, and every point of it unfolds about that place
      expect(Math.min(...blade.map((q) => q.p.z))).toBeCloseTo(stalkEnd, 2);
      expect(new Set(blade.map((q) => q.pivot.z.toFixed(4))).size).toBe(1);
    }
  });

  it('is held as the photographs show: face out and tips down on a wall or frame, flatter to the sky out in the open', () => {
    expect(leaf.hold!.rise).toEqual(characterRange(morphology, 'leaf.faceRiseDeg'));
    expect(leaf.hold!.riseOpen).toEqual(characterRange(morphology, 'leaf.faceRiseOpenDeg'));
    expect(leaf.hold!.turn).toBe(characterNumber(morphology, 'leaf.bladeTurnDeg'));
    expect(leaf.hold!.riseOpen[0]).toBeGreaterThan(leaf.hold!.rise[0]);
    // the blade itself is drawn flat out from its stalk and only curls a little on towards its tip
    for (let v = 0; v < leaf.variants; v++) {
      const blade = points(leaf.make(v, 0)).filter((q) => q.t >= 0);
      const tip = blade.reduce((a, b) => (b.p.z > a.p.z ? b : a));
      expect(tip.p.y).toBeLessThan(-0.02);
      expect(tip.p.y).toBeGreaterThan(-0.3);
    }
  });

  it('is dark and very glossy, lets little light through, and picks a variant it has for any leaf', () => {
    // RHS: "glossy dark green"; FRPS: leathery
    expect(leaf.roughness).toBeLessThan(0.35);
    expect(leaf.translucency).toBeLessThan(0.3);
    for (const green of [leaf.palette.greenA, leaf.palette.greenB]) {
      expect(green[1]).toBeGreaterThan(green[0]);
      expect(green[1]).toBeGreaterThan(green[2]);
      expect(green[1]).toBeLessThan(0.2);
    }
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) for (const m of [0.03, 0.05, 0.07, 0.09, 0.2]) expect(leaf.pick(m, r)).toBeLessThan(leaf.variants);
  });
});

// SPECIES_PROFILE.md, "Form: what the model draws": the cyme and its flowers.
describe('the cyme', () => {
  const [count0, count1] = characterRange(morphology, 'inflorescence.flowerCount');
  const lobes = characterNumber(morphology, 'flower.lobeCount');
  const [across0, across1] = characterRange(morphology, 'flower.diameterM');

  it('has between two and nine flowers, as counted, the last of them still in bud', () => {
    for (let v = 0; v < cyme.variants; v++) {
      const parts = partsOf(cyme.make(v, 0));
      expect(parts.length, `variant ${v}`).toBeGreaterThanOrEqual(count0);
      expect(parts.length, `variant ${v}`).toBeLessThanOrEqual(count1);
      // they open in turn: no two at the same moment, the first at once
      expect(parts[0]!.t).toBe(0);
      expect(new Set(parts.map((p) => p.t)).size).toBe(parts.length);
    }
    // the largest cyme has the most flowers the study counted
    expect(Math.max(...Array.from({ length: cyme.variants }, (_, v) => partsOf(cyme.make(v, 0)).length))).toBe(count1);
  });

  it('gives every open flower five lobes, and a width within what was measured', () => {
    for (let v = 0; v < cyme.variants; v++) {
      // at the far level a flower is its lobes and nothing else, each one a quad: two triangles to a lobe
      const far = cyme.make(v, 2);
      const farParts = partsOf(far);
      const tagged = points(far);
      let petalTriangles = 0;
      for (let i = 0; i < far.index!.count; i += 3) if (tagged[far.index!.getX(i)]!.t >= 0) petalTriangles++;
      expect(petalTriangles / farParts.length, `variant ${v}`).toBe(2 * lobes);
      // at the near level: the spread of each flower that opens, tip to opposite tip
      const flowers = partsOf(cyme.make(v, 0)).filter((p) => p.t < 0.85);
      // from afar half of them, drawn larger, and no buds (TAXON_LOOKS.md section 6: fewer flowers each drawn larger)
      expect(farParts.length).toBe(Math.ceil(flowers.length / 2));
      for (const flower of flowers) {
        let widest = 0;
        for (let i = 0; i < flower.points.length; i += 3) for (let j = i + 1; j < flower.points.length; j += 3) widest = Math.max(widest, flower.points[i]!.distanceTo(flower.points[j]!));
        // an instance is drawn between 2/3 and 4/3 of this size, which spans the measured 1.7 to 2.3 cm and the RHS's 2.5 cm
        expect(widest).toBeGreaterThan(across0);
        expect(widest).toBeLessThan(across1 * 1.15);
      }
    }
  });

  // Ocokoljic et al. 2026: the lobes "resemble a spiral turning counterclockwise".
  it('sets the lobes askew like a pinwheel that turns anticlockwise, seen from the front', () => {
    for (let v = 0; v < cyme.variants; v++) {
      for (const flower of partsOf(cyme.make(v, 2))) {
        expect(flower.points.length).toBe(4 * lobes);
        const centre = flower.points.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / flower.points.length);
        // the flower faces away from the top of its stalk
        const facing = centre.clone().sub(flower.pivot).normalize();
        for (let k = 0; k < lobes; k++) {
          const [baseA, baseB, tipA, tipB] = flower.points.slice(4 * k, 4 * k + 4) as [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
          const base = baseA.clone().add(baseB).multiplyScalar(0.5);
          const tip = tipA.clone().add(tipB).multiplyScalar(0.5);
          // from the throat outwards the lobe swings anticlockwise about the flower's axis
          const swing = base.clone().sub(centre).cross(tip.clone().sub(base)).dot(facing);
          expect(swing, `variant ${v}, lobe ${k}`).toBeGreaterThan(0);
          // and its anticlockwise corner is the longer one
          const anticlockwise = tipB.clone().sub(centre).cross(tipA.clone().sub(centre)).dot(facing) < 0 ? tipB : tipA;
          const other = anticlockwise === tipB ? tipA : tipB;
          expect(anticlockwise.distanceTo(centre)).toBeGreaterThan(other.distanceTo(centre));
        }
      }
    }
  });

  it('keeps its stalks and calyces when the corollas fall, and is held, not hung', () => {
    for (let v = 0; v < cyme.variants; v++) {
      const all = points(cyme.make(v, 0));
      const axis = all.filter((q) => q.t < 0);
      expect(axis.length).toBeGreaterThan(100);
      // the stalk runs out along +Y for about as long as Flora of China's 2 to 6 cm
      const [stalk0, stalk1] = characterRange(morphology, 'inflorescence.stalkLengthM');
      const flowersFrom = Math.min(...all.filter((q) => q.t >= 0).map((q) => q.pivot.y));
      expect(flowersFrom).toBeGreaterThan(stalk0);
      expect(flowersFrom).toBeLessThan(stalk1 * 1.2);
      // nothing of it lies behind where it is attached
      expect(Math.min(...all.map((q) => q.p.y))).toBeGreaterThan(-0.004);
    }
    expect(cyme.detailAt.length).toBe(cyme.lods - 1);
  });
});

// SPECIES_PROFILE.md, "Form: what the model draws": the fruit.
describe('the fruit', () => {
  it('is a pair of slender follicles on one stalk, hanging, of the length and width Flora of China gives', () => {
    const [width0, width1] = characterRange(morphology, 'fruit.widthM');
    for (let v = 0; v < follicles.variants; v++) {
      const g = follicles.make(v, 0);
      const pos = g.getAttribute('position');
      const lengths = surfaces(g)
        .map((surface) => {
          const ys = surface.map((i) => pos.getY(i));
          const xs = surface.map((i) => pos.getX(i));
          const zs = surface.map((i) => pos.getZ(i));
          return { drop: Math.max(...ys) - Math.min(...ys), spread: Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)), points: surface };
        })
        .sort((a, b) => b.drop - a.drop);
      // two follicles and the stalk they hang from; a pair may hang close or stand wide apart (photographs 'Trachelospermum
      // jasminoides fruits' and 'Fruit du faux jasmin'), so a follicle is measured along its slant, not by its drop
      expect(lengths.length).toBe(3);
      const reach = (l: { drop: number; spread: number }) => Math.hypot(l.drop, l.spread);
      expect(reach(lengths[0]!)).toBeGreaterThan(follicles.authoredSize * 0.9);
      expect(reach(lengths[0]!)).toBeLessThan(follicles.authoredSize * 1.15);
      expect(reach(lengths[1]!)).toBeGreaterThan(follicles.authoredSize * 0.8);
      // the stalk of the cyme they hang from, 2 to 6 cm (Flora of China)
      expect(lengths[2]!.drop).toBeGreaterThan(characterRange(morphology, 'inflorescence.stalkLengthM')[0]);
      expect(lengths[2]!.drop).toBeLessThan(characterRange(morphology, 'inflorescence.stalkLengthM')[1]);
      // slender: the thickest ring of a follicle is within the 3 to 10 mm of the Flora
      const ring = (surface: number[]): number => {
        const midY = (Math.max(...surface.map((i) => pos.getY(i))) + Math.min(...surface.map((i) => pos.getY(i)))) / 2;
        const near = surface.filter((i) => Math.abs(pos.getY(i) - midY) < follicles.authoredSize * 0.04);
        let widest = 0;
        for (const i of near) for (const j of near) widest = Math.max(widest, Math.hypot(pos.getX(i) - pos.getX(j), pos.getZ(i) - pos.getZ(j)));
        return widest;
      };
      // (measured across a level slice, so only on the pair that hangs nearly plumb: a slanting pod's slice is drawn out)
      if (v === 0) {
        expect(ring(lengths[0]!.points)).toBeGreaterThan(width0);
        expect(ring(lengths[0]!.points)).toBeLessThan(width1 * 1.6);
      }
      // it hangs: all of it below where it is attached
      g.computeBoundingBox();
      expect(g.boundingBox!.max.y).toBeLessThan(0.002);
    }
  });
});

// A specimen: the engine's run on the specimen frame, read through the core's presence module.
// CLAUDE.md: "A flowering month is an envelope, not a trigger. Never show flowers because the calendar says so."
describe('a star jasmine on the specimen frame, eight years on', () => {
  const years = 8;
  const frame = readBower(JSON.parse(readFileSync(FRAME, 'utf8')), 'examples/specimen-frame.bower.json');
  const { sim } = growPlanting({ bower: frame.bower, plan: specimenPlan(ID), viewpoints: frame.viewpoints }, growable(), 'trained', years);
  const data = toRenderData(sim);
  const cal = new Calendar(data.start);
  const last = cal.dateOf(data.lastDay).year;
  const leavesOn = (iso: string): number => {
    const day = cal.dayOf(iso);
    const seasons = seasonsOf(data, cal.dateOf(day).year);
    return data.leaves.reduce((n, l) => n + (leafState(l, seasons.get(l.plantId), day).present ? 1 : 0), 0);
  };
  const openOn = (iso: string): number => data.flowers.reduce((n, f) => n + (flowerState(f, cal.dayOf(iso)).phase === 'open' ? 1 : 0), 0);
  const monthOf = (day: number) => cal.dateOf(day).month;

  // taxon.json leafHabit: evergreen (RHS). KEY.md: evergreen continuity is what this plant is in the palette for.
  it('is in leaf in every month of the year, and keeps through the winter the leaves it had in summer', () => {
    const counts = Array.from({ length: 12 }, (_, m) => leavesOn(`${last}-${String(m + 1).padStart(2, '0')}-15`));
    for (const n of counts) expect(n).toBeGreaterThan(1500);
    // no fewer in December than in July of the same year, and in January what it had the July before
    expect(counts[11]!).toBeGreaterThanOrEqual(counts[6]!);
    expect(counts[0]!).toBeGreaterThanOrEqual(0.9 * leavesOn(`${last - 1}-07-15`));
    expect(data.leaves.every((l) => l.evergreen)).toBe(true);
  });

  // NC State Extension: leaf arrangement "opposite".
  it('bears its leaves in opposite pairs', () => {
    const at = new Map<string, number>();
    for (const l of data.leaves) {
      const key = `${l.stemId}@${l.position.join(',')}`;
      at.set(key, (at.get(key) ?? 0) + 1);
    }
    for (const [key, n] of at) expect(n, key).toBe(2);
  });

  // Bean: flowers "produced in July and August". RHS: "mid to late summer".
  it('flowers in July and August: nothing is open from October to May, and the first flowers open in the last days of June at the earliest', () => {
    expect(data.flowers.length).toBeGreaterThan(200);
    for (const month of ['07', '08']) expect(openOn(`${last}-${month}-15`), month).toBeGreaterThan(20);
    for (const month of ['01', '02', '03', '04', '05', '10', '11', '12']) for (const d of ['01', '15', '28']) expect(openOn(`${last}-${month}-${d}`), `${month}-${d}`).toBe(0);
    for (const f of data.flowers) {
      expect([6, 7, 8]).toContain(monthOf(f.openDay));
      if (monthOf(f.openDay) === 6) expect(cal.dateOf(f.openDay).dayOfMonth).toBeGreaterThanOrEqual(25);
      // each cyme is in flower for two to four weeks, and all are over by mid September
      if (f.spentDay >= 0) {
        expect(f.spentDay - f.openDay).toBeGreaterThanOrEqual(14);
        expect(f.spentDay - f.openDay).toBeLessThanOrEqual(28);
        expect(cal.dateOf(f.spentDay).iso <= `${cal.dateOf(f.spentDay).year}-09-15`).toBe(true);
      }
    }
    // July and August carry the display: more is open in the middle of each than at the start of July or of September
    expect(openOn(`${last}-07-25`)).toBeGreaterThan(openOn(`${last}-07-01`));
    expect(openOn(`${last}-08-05`)).toBeGreaterThan(openOn(`${last}-09-01`));
  });

  // Bean: "usually on short lateral twigs". Useful Temperate Plants, after Huxley: "on short laterals that arise from old wood".
  it('carries most of its cymes at the ends of short side shoots from older stems, and a few in the leaf axils of long growth', () => {
    const roles = new Map(data.stems.map((s) => [s.id, s.role]));
    const ofLastYear = data.flowers.filter((f) => f.year === last);
    const onSideShoots = ofLastYear.filter((f) => roles.get(f.stemId) === 'side_shoot').length;
    expect(onSideShoots / ofLastYear.length).toBeGreaterThan(0.8);
    expect(ofLastYear.length - onSideShoots).toBeGreaterThan(0);
    // a side shoot is short, and stands on a stem older than itself
    const sideShoots = data.stems.filter((s) => s.role === 'side_shoot');
    expect(sideShoots.length).toBeGreaterThan(200);
    const byId = new Map(data.stems.map((s) => [s.id, s]));
    for (const s of sideShoots) {
      const parent = byId.get(s.parentId!)!;
      expect(['leader', 'lateral']).toContain(parent.role);
      expect(s.bornDay[0]! - Math.min(...parent.bornDay)).toBeGreaterThan(250);
    }
    // every cyme stands out from the plant: it is given a direction, and is the size of a cluster of flowers
    const [size0, size1] = characterRange(morphology, 'inflorescence.widthM');
    for (const f of data.flowers) {
      expect(f.direction).toBeDefined();
      expect(f.lengthM).toBeGreaterThanOrEqual(size0);
      expect(f.lengthM).toBeLessThanOrEqual(size1);
    }
  });

  // RHS growing guide: "fruits and seeds are rarely produced in UK gardens".
  it('sets fruit rarely: a few pairs of follicles in eight years, each where a cyme went over', () => {
    expect(data.fruits.length).toBeGreaterThan(0);
    expect(data.fruits.length).toBeLessThan(0.05 * data.flowers.length);
    const [length0, length1] = characterRange(morphology, 'fruit.lengthM');
    for (const fruit of data.fruits) {
      // it began to swell on the day a cyme on the same stem, at the same place, had gone over
      const from = data.flowers.filter((f) => f.stemId === fruit.stemId && f.spentDay === fruit.swell[0] && Math.hypot(f.position[0] - fruit.position[0], f.position[1] - fruit.position[1], f.position[2] - fruit.position[2]) < 0.002);
      expect(from.length).toBe(1);
      expect(fruit.lengthM).toBeGreaterThanOrEqual(length0);
      expect(fruit.lengthM).toBeLessThanOrEqual(length1);
      // it hangs plumb: the engine gives it no direction
      expect(fruit.direction).toBeUndefined();
    }
  });

  // Flora of China: fruit to December. The growth model: green until December, brown through the winter, gone by the end of March.
  it('has its pods green through the autumn, brown at the turn of the year, and split and gone by April', () => {
    const complete = data.fruits.filter((f) => f.removedDay >= 0 && f.year < last);
    expect(complete.length).toBeGreaterThan(0);
    for (const fruit of complete) {
      const y = fruit.year;
      for (const iso of [`${y}-09-20`, `${y}-10-15`, `${y}-11-15`]) {
        const s = fruitState(fruit, cal.dayOf(iso));
        if (s.phase !== 'absent') expect(s.ripeness, iso).toBe(0);
      }
      expect(fruitState(fruit, cal.dayOf(`${y}-11-25`)).phase).not.toBe('absent');
      expect(fruitState(fruit, cal.dayOf(`${y + 1}-01-10`)).phase).toBe('ripe');
      expect(fruitState(fruit, cal.dayOf(`${y + 1}-04-01`)).phase).toBe('absent');
      expect(fruitState(fruit, cal.dayOf(`${y}-06-01`)).phase).toBe('absent');
    }
  });

  // taxon.json attachment: stem twining. PROJECT_CONTEXT.md: "mechanism-correct attachment".
  it('holds on with its stems alone: the run has no tendrils, coiled stalks, rootlets or prickles', () => {
    expect(data.appendages).toEqual([]);
    expect(data.stems.some((s) => s.role === 'spur')).toBe(false);
  });
});
