import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Calendar, type RenderData, characterNumber, characterRange, characterText, flowerState, fruitState, known, leafState, param, parseMorphology, readBower, seasonsOf, toRenderData } from '@horti/core';
import { triangles } from '../../src/plant/kit.ts';
import { type FlowerAsset, type FruitAsset, type LeafAsset, assetsOf, ceilingFor } from '../../src/plant/look.ts';
import { growPlanting } from '../../src/plant/grow.ts';
import { loadLooks, lookFor } from '../../src/plant/registry.ts';
import { growable } from '../../src/plant/scenario.ts';
import { specimenPlan } from '../../src/specimen/specimen.ts';

const ID = 'lonicera-periclymenum-graham-thomas';
const file = (path: string): string => readFileSync(fileURLToPath(new URL(`../../../../${path}`, import.meta.url)), 'utf8');
const morphology = parseMorphology(JSON.parse(file(`species/${ID}/morphology.json`)), `species/${ID}/morphology.json`);
const mid = ([low, high]: [number, number]): number => (low + high) / 2;

await loadLooks([ID]);
const look = lookFor(ID);
const taxon = growable().get(ID)!;
const head = look.flowers!.default as FlowerAsset;
const berries = look.fruits!.default as FruitAsset;
const longShootLeaf = look.leaves.default as LeafAsset;
const floweringShootLeaf = look.leaves['flowering_shoot_leaf'] as LeafAsset;

// ---- reading a model back ----------------------------------------------------------------------------------
const positions = (g: THREE.BufferGeometry): THREE.Vector3[] => Array.from({ length: g.getAttribute('position').count }, (_, i) => new THREE.Vector3().fromBufferAttribute(g.getAttribute('position'), i));

/** The vertices of each part that comes and goes (aPart.w >= 0), by where the part joins. */
function partsOf(g: THREE.BufferGeometry): Map<string, number[]> {
  const part = g.getAttribute('aPart');
  const out = new Map<string, number[]>();
  for (let i = 0; i < part.count; i++) {
    if (part.getW(i) < 0) continue;
    const key = `${part.getX(i).toFixed(6)},${part.getY(i).toFixed(6)},${part.getZ(i).toFixed(6)}`;
    const list = out.get(key);
    if (list) list.push(i);
    else out.set(key, [i]);
  }
  return out;
}

/** How many separate sheets the triangles among `vertices` make: a model is put together from sheets that share no vertex. */
function sheets(g: THREE.BufferGeometry, vertices: Iterable<number>): number {
  const within = new Set(vertices);
  const parent = new Map<number, number>();
  const find = (a: number): number => {
    let r = a;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(a, r);
    return r;
  };
  for (const v of within) parent.set(v, v);
  const index = g.index!;
  for (let i = 0; i < index.count; i += 3) {
    const [a, b, c] = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    if (!within.has(a) || !within.has(b) || !within.has(c)) continue;
    parent.set(find(a), find(b));
    parent.set(find(b), find(c));
  }
  return new Set([...within].map(find)).size;
}

const all = (g: THREE.BufferGeometry): number[] => Array.from({ length: g.getAttribute('position').count }, (_, i) => i);

// ============================================================================================================
// species/<id>/morphology.json: the shape numbers the drawing uses, each with its source. TAXON_LOOKS.md
// section 8: "counts and measured sizes ... come from the file."
// ============================================================================================================
describe("the woodbine's leaf, against its morphology file", () => {
  const length = mid(characterRange(morphology, 'leaf.lengthM'));
  const [ratioLow, ratioHigh] = characterRange(morphology, 'leaf.outlineWidthToLength');

  /** The blade's own vertices (the one part), as authored: lying flat out along +Z from the end of its stalk. */
  const bladeOf = (g: THREE.BufferGeometry): THREE.Vector3[] => positions(g).filter((_, i) => g.getAttribute('aPart').getW(i) >= 0);

  // morphology leaf.outlineWidthToLength, measured off photographs (Bean's inches give a broader leaf; see its basis)
  it('is as wide for its length as the photographs measure, in both its forms', () => {
    for (const leaf of [longShootLeaf, floweringShootLeaf]) {
      for (let v = 0; v < leaf.variants; v++) {
        const blade = bladeOf(leaf.make(v, 0));
        const along = Math.max(...blade.map((p) => p.z)) - Math.min(...blade.map((p) => p.z));
        const across = Math.max(...blade.map((p) => p.x)) - Math.min(...blade.map((p) => p.x));
        expect(across / along, `${leaf.key} variant ${v}`).toBeGreaterThan(ratioLow * 0.92);
        expect(across / along, `${leaf.key} variant ${v}`).toBeLessThan(ratioHigh * 1.12);
      }
    }
  });

  // BSBI account: "Leaves are sub-sessile, simple, lanceolate, entire". Bean's oak-leaved f. quercina is another plant.
  it('is simple and entire: one blade, its outline without tooth or lobe', () => {
    expect(characterText(morphology, 'leaf.division')).toBe('simple');
    expect(characterText(morphology, 'leaf.margin')).toBe('entire');
    for (const leaf of [longShootLeaf, floweringShootLeaf]) {
      const g = leaf.make(0, 0);
      expect(partsOf(g).size, leaf.key).toBe(1);
      // the right-hand margin, base to tip (the outermost point of each row of the blade): it swells once and closes once
      const rows = new Map<string, THREE.Vector3>();
      const uv = g.getAttribute('uv');
      positions(g).forEach((p, i) => {
        if (g.getAttribute('aPart').getW(i) < 0) return;
        const key = uv.getY(i).toFixed(5);
        const was = rows.get(key);
        if (!was || p.x > was.x) rows.set(key, p);
      });
      const edge = [...rows.values()].sort((a, b) => a.z - b.z);
      expect(edge.length, leaf.key).toBeGreaterThan(12);
      let turns = 0;
      for (let i = 2; i < edge.length; i++) if (Math.sign(edge[i]!.x - edge[i - 1]!.x) !== Math.sign(edge[i - 1]!.x - edge[i - 2]!.x)) turns++;
      expect(turns, leaf.key).toBeLessThanOrEqual(1);
    }
  });

  // Bean: "lower pairs of leaves stalked, uppermost ones almost or quite stalkless"
  it('has a stalk on the leaf of the long shoots and next to none on the leaf of the flowering shoots', () => {
    const [, long] = characterRange(morphology, 'leaf.stalkLengthM');
    // the blade begins where the first vertex of the one part stands
    const stalkOf = (leaf: LeafAsset): number => Math.min(...bladeOf(leaf.make(0, 0)).map((p) => p.z));
    expect(stalkOf(floweringShootLeaf)).toBeLessThan(0.03);
    expect(stalkOf(longShootLeaf)).toBeGreaterThan(2 * stalkOf(floweringShootLeaf));
    expect(stalkOf(longShootLeaf)).toBeLessThanOrEqual(long / length + 1e-6);
  });

  // RHS record of the cultivar: "oval, dark green leaves"; the midrib is the one pale line (reference photographs)
  it('is dark green, with paler veins drawn from a texture of its own', () => {
    const { greenA, greenB } = longShootLeaf.palette;
    expect(greenA[1]).toBeGreaterThan(greenA[0] * 1.6);
    expect(greenA[1]).toBeGreaterThan(greenA[2] * 1.6);
    expect(greenA[1]).toBeLessThan(0.12);
    expect(greenB[1]).toBeGreaterThan(greenA[1]);
    expect(greenB[1]).toBeGreaterThan(greenB[0]);
    expect(greenB[1]).toBeGreaterThan(greenB[2]);
    expect(longShootLeaf.texture).toBeDefined();
    expect(floweringShootLeaf.texture).toBe(longShootLeaf.texture);
  });

  // morphology leaf.faceRiseDeg, leaf.faceRiseOpenDeg and leaf.bladeBelowStalkDeg, read off photographs of trained plants
  it('is held by the viewer face out and up, at the angles the photographs give', () => {
    for (const leaf of [longShootLeaf, floweringShootLeaf]) {
      expect(leaf.hold!.rise).toEqual(characterRange(morphology, 'leaf.faceRiseDeg'));
      expect(leaf.hold!.riseOpen).toEqual(characterRange(morphology, 'leaf.faceRiseOpenDeg'));
      expect(leaf.hold!.unitAt).toBeCloseTo(mid(characterRange(morphology, 'leaf.bladeBelowStalkDeg')), 6);
    }
  });
});

describe("the woodbine's flower head, against its morphology file", () => {
  const flowerLength = mid(characterRange(morphology, 'flower.lengthM'));
  const [fewest, most] = characterRange(morphology, 'inflorescence.flowerCount');

  // model.json organs.racemeLengthM and morphology inflorescence.widthM: the width of a head
  it('is authored at the width the growth model measures a head by', () => {
    expect(head.authoredSize).toBeCloseTo(mid(characterRange(morphology, 'inflorescence.widthM')), 6);
    expect(characterRange(morphology, 'inflorescence.widthM')).toEqual(param(taxon.model, 'organs.racemeLengthM'));
    expect(head.poise).toBe('held');
    expect(taxon.model.names.flowerHeld).toBe('facing_out');
  });

  // BSBI account: "in simple umbel clusters or whorls of 6-15"; Flora of New Zealand: a head of up to 20
  it('has flowers in whorls round its buds, no more in a head than the floras count', () => {
    for (let v = 0; v < head.variants; v++) {
      const open = partsOf(head.make(v, 0)).size;
      expect(open, `variant ${v}`).toBeGreaterThanOrEqual(fewest);
      expect(open, `variant ${v}`).toBeLessThanOrEqual(most);
    }
  });

  // BSBI account: flowers "40-50 mm long", the corolla "2-lipped"; "Stamens are five; style and stigma are both solitary"
  it('gives each flower a tube, two lips, five stamens with their anthers, and a style with its stigma', () => {
    const stamens = characterNumber(morphology, 'flower.stamenCount');
    expect(stamens).toBe(5);
    const g = head.make(0, 0);
    const pos = positions(g);
    for (const [pivot, vertices] of partsOf(g)) {
      // tube, upper lip, lower lip; a filament and an anther to each stamen; style and stigma
      expect(sheets(g, vertices), pivot).toBe(3 + 2 * stamens + 2);
      const [x, y, z] = pivot.split(',').map(Number) as [number, number, number];
      const reach = Math.max(...vertices.map((i) => pos[i]!.distanceTo(new THREE.Vector3(x, y, z))));
      // from its base to the tip of its style, which stands beyond the lips
      expect(reach / flowerLength, pivot).toBeGreaterThan(0.9);
      expect(reach / flowerLength, pivot).toBeLessThan(1.35);
    }
  });

  // Bean's supplement: the flowers of this cultivar have no red; RHS: "fragrant white flowers which soon turn to buff-yellow"
  it('is white and yellow, with no red or purple anywhere on it', () => {
    expect(characterText(morphology, 'flower.redFlush')).toBe('none');
    for (let v = 0; v < head.variants; v++) {
      const g = head.make(v, 0);
      const colour = g.getAttribute('color');
      let pale = 0;
      let yellow = 0;
      for (let i = 0; i < colour.count; i++) {
        const [r, gr, b] = [colour.getX(i), colour.getY(i), colour.getZ(i)];
        // a pink or a purple has more blue than green; a red has little green for its red (the orange anthers have the least)
        expect(b, `variant ${v} vertex ${i}`).toBeLessThanOrEqual(gr + 1e-6);
        expect(gr, `variant ${v} vertex ${i}`).toBeGreaterThan(0.4 * r);
        if (r > 0.8 && b > 0.6) pale++;
        if (r > 0.8 && gr > 0.6 && b < 0.4) yellow++;
      }
      // both are on the head at once: the flowers that opened first have turned
      expect(pale, `variant ${v}`).toBeGreaterThan(100);
      expect(yellow, `variant ${v}`).toBeGreaterThan(100);
    }
  });

  // TAXON_LOOKS.md section 4: "whatever outlasts the petals must be axis". In a honeysuckle the stamens fall with
  // the corolla, and what stays is the stalk, the ovaries and the buds still to open.
  it('keeps its stalk, ovaries and unopened buds when the flowers have dropped', () => {
    const g = head.make(0, 0);
    const part = g.getAttribute('aPart');
    const axis = all(g).filter((i) => part.getW(i) < 0);
    expect(axis.length).toBeGreaterThan(200);
    expect(axis.length).toBeLessThan(part.count / 2);
  });
});

describe("the woodbine's berries, against its morphology file", () => {
  const diameter = characterNumber(morphology, 'fruit.berryDiameterM');
  const [fewest, most] = characterRange(morphology, 'fruit.berriesPerCluster');

  // model.json fruit.lengthM and morphology fruit.clusterWidthM: the width of a cluster
  it('is authored at the width the growth model measures a cluster by', () => {
    expect(berries.authoredSize).toBeCloseTo(mid(characterRange(morphology, 'fruit.clusterWidthM')), 6);
    expect(characterRange(morphology, 'fruit.clusterWidthM')).toEqual(known(taxon.model, 'fruit.lengthM'));
    expect(taxon.model.names.fruitHeld).toBe('facing_out');
  });

  // BSBI account: "Berries, 8 mm diameter, dark red, globose and stalkless in tight clusters"
  it('is a tight cluster of round berries of about 8 mm on the end of a stalk', () => {
    let widest = 0;
    for (let v = 0; v < berries.variants; v++) {
      const g = berries.make(v, 0);
      // the stalk is one sheet, and each berry two: the berry and the dried calyx on its crown
      const count = (sheets(g, all(g)) - 1) / 2;
      expect(Number.isInteger(count), `variant ${v}`).toBe(true);
      expect(count, `variant ${v}`).toBeGreaterThanOrEqual(fewest);
      expect(count, `variant ${v}`).toBeLessThanOrEqual(most);
      g.computeBoundingBox();
      const across = Math.max(g.boundingBox!.max.x - g.boundingBox!.min.x, g.boundingBox!.max.z - g.boundingBox!.min.z);
      widest = Math.max(widest, across);
      // no cluster is wider than four berries and a little (reference fruit-ripe-unripe-chapeltoun), nor narrower than two
      expect(across, `variant ${v}`).toBeGreaterThan(1.9 * diameter * 0.86);
      expect(across, `variant ${v}`).toBeLessThan(4.6 * diameter);
    }
    expect(widest / berries.authoredSize).toBeGreaterThan(0.85);
    expect(widest / berries.authoredSize).toBeLessThan(1.2);
  });

  // RHS record of the cultivar: "Berries red"
  it('ripens from green to red', () => {
    const g = berries.make(0, 0);
    const colour = g.getAttribute('color');
    let green = 0;
    for (let i = 0; i < colour.count; i++) if (colour.getY(i) > colour.getX(i) && colour.getY(i) > colour.getZ(i)) green++;
    expect(green / colour.count).toBeGreaterThan(0.7);
    expect(berries.ripe[0]).toBeGreaterThan(3 * berries.ripe[1]);
    expect(berries.ripe[0]).toBeGreaterThan(3 * berries.ripe[2]);
    // glossy
    expect(berries.roughness).toBeLessThan(0.35);
  });
});

// TAXON_LOOKS.md section 6: "Every asset states a budget ... The test builds every variant and fails if one is over."
describe('every organ model of the woodbine', () => {
  it('builds at every level of detail, finite and within its budget, and is this taxon\'s own', () => {
    expect(look.taxonId).toBe(ID);
    expect(look.provisional).toBe(false);
    const assets = assetsOf(look);
    expect(assets.map((a) => `${a.kind}:${a.form}`).sort()).toEqual(['flower:default', 'fruit:default', 'leaf:default', 'leaf:flowering_shoot_leaf']);
    for (const { kind, asset } of assets) {
      expect(asset.key.startsWith(`${ID}/`), asset.key).toBe(true);
      expect(asset.lods, asset.key).toBe(3);
      for (let lod = 0; lod < asset.lods; lod++) {
        expect(asset.budget[lod]!, asset.key).toBeLessThanOrEqual(ceilingFor(kind, lod, asset.lods));
        for (let v = 0; v < asset.variants; v++) {
          const g = asset.make(v, lod);
          expect(triangles(g), `${asset.key} ${v}/${lod}`).toBeLessThanOrEqual(asset.budget[lod]!);
          // a budget is not a guess: the heaviest variant comes within a third of it
          const array = g.getAttribute('position').array;
          for (let i = 0; i < array.length; i++) if (!Number.isFinite(array[i])) throw new Error(`${asset.key} ${v}/${lod}: position ${i} is not finite`);
        }
        const heaviest = Math.max(...Array.from({ length: asset.variants }, (_, v) => triangles(asset.make(v, lod))));
        expect(heaviest, `${asset.key} level ${lod}: its budget of ${asset.budget[lod]} is far more than it uses`).toBeGreaterThan(asset.budget[lod]! * 0.66);
      }
    }
  });

  // TAXON_LOOKS.md section 6: "Spend triangles at level 0 ... and be strict at the last."
  it('is light at its coarsest level, which is what a whole Bower is drawn with', () => {
    expect(longShootLeaf.budget[2]).toBeLessThanOrEqual(16);
    expect(floweringShootLeaf.budget[2]).toBeLessThanOrEqual(16);
  });

  // taxon.json attachment.mechanism: stem_twining
  it('has nothing to hold on with but its stems', () => {
    expect(taxon.profile.attachment.mechanism).toBe('stem_twining');
    expect(look.appendages).toEqual({});
  });
});

// ============================================================================================================
// A specimen grown by the engine on the specimen frame. What is on the plant on a day is asked of the core's
// render/presence.ts (CLAUDE.md: "use it; do not re-derive seasons").
// ============================================================================================================
describe('a woodbine grown on the specimen frame', () => {
  const YEARS = 6;
  const frame = readBower(JSON.parse(file('examples/specimen-frame.bower.json')), 'examples/specimen-frame.bower.json');
  const { sim } = growPlanting({ bower: frame.bower, plan: specimenPlan(ID), viewpoints: frame.viewpoints }, growable(), 'trained', YEARS);
  const data: RenderData = toRenderData(sim);
  const cal = new Calendar(data.start);
  const last = cal.dateOf(data.lastDay).year;
  const day = (iso: string): number => cal.dayOf(iso);
  const month = (d: number): number => cal.dateOf(d).month;
  const leavesOn = (d: number): number => {
    const seasons = seasonsOf(data, cal.dateOf(d).year);
    return data.leaves.reduce((n, l) => n + (leafState(l, seasons.get(l.plantId), d).present ? 1 : 0), 0);
  };
  const fullLeavesOn = (d: number): number => {
    const seasons = seasonsOf(data, cal.dateOf(d).year);
    return data.leaves.reduce((n, l) => n + (leafState(l, seasons.get(l.plantId), d).expansion >= 1 ? 1 : 0), 0);
  };
  const openOn = (d: number): number => data.flowers.reduce((n, f) => n + (flowerState(f, d).phase === 'open' ? 1 : 0), 0);
  const fruitOn = (d: number): number => data.fruits.reduce((n, f) => n + (fruitState(f, d).phase !== 'absent' ? 1 : 0), 0);
  const ripeOn = (d: number): number => data.fruits.reduce((n, f) => n + (fruitState(f, d).ripeness >= 1 ? 1 : 0), 0);
  const stems = new Map(data.stems.map((s) => [s.id, s]));

  // PROJECT_CONTEXT.md section 2: "Which plants can physically find and occupy the available routes"; the brief's
  // "a plant that looks thin is a growth problem". RHS: 4 to 8 m in 5 to 10 years; Bean: "exceptionally vigorous".
  it('has clothed the frame by its sixth summer', () => {
    const summary = sim.summaries.find((s) => s.year === last)!;
    expect(summary.highestM).toBeGreaterThan(2.8);
    expect(summary.routeShare).toBeGreaterThan(0.6);
    expect(summary.sideShoots).toBeGreaterThan(250);
    expect(leavesOn(day(`${last}-07-15`))).toBeGreaterThan(2500);
  });

  // RHS record: deciduous. Beckett and Beckett (1979), as the Useful Temperate Plants database gives them: new leaves
  // often start to open in January and are well grown in April; the leaves fall in November.
  it('is bare in December, breaks leaf in January, is in full leaf from April and drops its leaves in November', () => {
    expect(taxon.profile.leafHabit.value).toBe('deciduous');
    for (let d = day(`${last - 1}-12-01`); d <= day(`${last}-01-10`); d++) expect(leavesOn(d), cal.dateOf(d).iso).toBe(0);
    expect(leavesOn(day(`${last}-01-31`))).toBeGreaterThan(200);
    expect(fullLeavesOn(day(`${last}-01-31`))).toBe(0);
    expect(fullLeavesOn(day(`${last}-04-30`))).toBeGreaterThan(1000);
    const october = leavesOn(day(`${last}-10-31`));
    expect(october).toBeGreaterThan(2500);
    expect(leavesOn(day(`${last}-11-15`))).toBeLessThan(october);
    expect(leavesOn(day(`${last}-11-15`))).toBeGreaterThan(0);
    for (let d = day(`${last}-12-01`); d <= data.lastDay; d++) expect(leavesOn(d), cal.dateOf(d).iso).toBe(0);
  });

  // taxon.json flowering.monthsUK (Bean's supplement: "will flower from June to October"). CLAUDE.md: "A flowering
  // month is an envelope, not a trigger."
  it('flowers in every month from June to September, into October, and in no month outside its envelope', () => {
    const months = new Set(taxon.profile.flowering.monthsUK!.value!);
    expect([...months].sort((a, b) => a - b)).toEqual([6, 7, 8, 9, 10]);
    const seen = new Set<number>();
    for (let d = day(`${last}-01-01`); d <= data.lastDay; d++) {
      const open = openOn(d);
      if (open > 0) seen.add(month(d));
      if (!months.has(month(d))) expect(open, cal.dateOf(d).iso).toBe(0);
    }
    for (const m of [6, 7, 8, 9]) expect(seen.has(m), `month ${m}`).toBe(true);
    // every head of every year opened and went over inside the envelope
    for (const f of data.flowers) {
      expect(months.has(month(f.openDay))).toBe(true);
      if (f.spentDay >= 0) expect(months.has(month(f.spentDay - 1))).toBe(true);
    }
    // nothing in its first season: the model gives it one year before it flowers
    expect(data.flowers.some((f) => f.year === cal.dateOf(data.plants[0]!.plantedDay).year)).toBe(false);
    expect(openOn(day(`${last}-07-15`))).toBeGreaterThan(30);
  });

  // Bean: "at the end of the shoot, forming a terminal stalked inflorescence"; RHS honeysuckle guide: "on short
  // sideshoots on the previous season's growth"; Bean's supplement: cut back in winter it still flowers, on new growth.
  it('bears most of its heads at the ends of side shoots from older wood, and some on the growth of the year', () => {
    const heads = data.flowers.filter((f) => f.year === last);
    const terminal = heads.filter((f) => stems.get(f.stemId)!.role === 'side_shoot');
    expect(terminal.length / heads.length).toBeGreaterThan(0.6);
    for (const f of terminal) {
      const shoot = stems.get(f.stemId)!;
      // at its tip (the shoot's last step may be laid after the head has opened), and held on the line of the shoot
      expect(f.stemPoint).toBeUndefined();
      expect(Math.hypot(...f.position.map((x, k) => x - shoot.contact.at(k - 3)!))).toBeLessThan(0.045);
      expect(f.direction).toBeDefined();
      // the stem that bears the shoot was there the year before
      const bearer = stems.get(shoot.parentId!)!;
      expect(['leader', 'lateral']).toContain(bearer.role);
      expect(cal.dateOf(bearer.bornDay[0]!).year).toBeLessThan(cal.dateOf(shoot.bornDay[0]!).year);
    }
    expect(heads.length - terminal.length).toBeGreaterThan(5);
  });

  // model.json names.sideShootLeafForm, after Bean's two kinds of leaf; BSBI account: leaves in opposite pairs
  it('carries its leaves in pairs, stalkless on the flowering shoots and stalked elsewhere', () => {
    expect(param(taxon.model, 'organs.leavesPerNode')).toBe(2);
    const byPlace = new Map<string, number>();
    for (const l of data.leaves) {
      const key = `${l.stemId}:${l.stemPoint}:${l.firstYear}`;
      byPlace.set(key, (byPlace.get(key) ?? 0) + 1);
      expect(l.form).toBe(stems.get(l.stemId)!.role === 'side_shoot' ? 'flowering_shoot_leaf' : undefined);
    }
    for (const [key, n] of byPlace) expect(n, key).toBe(2);
    expect(Object.keys(look.leaves).sort()).toEqual(['default', 'flowering_shoot_leaf']);
    // Bean's range for the leaves of the long shoots; the model's own, a little smaller, for the flowering shoots
    const short = Math.min(characterRange(morphology, 'leaf.lengthM')[0], known(taxon.model, 'organs.sideShootLeafLengthM')![0]);
    const long = characterRange(morphology, 'leaf.lengthM')[1];
    for (const l of data.leaves) {
      expect(l.lengthM).toBeGreaterThanOrEqual(short - 0.0005);
      expect(l.lengthM).toBeLessThanOrEqual(long + 0.0005);
    }
  });

  // BSBI account: berries "are ripe from mid- to late-August onwards", some "remaining on the plant until October or
  // even early November"; CONSTRAINTS_AND_PHENOLOGY.md: fruit follows a flower that opened and went over, never the calendar.
  it('sets berries only where a head has gone over, ripens them from mid August and has lost them by midwinter', () => {
    expect(data.fruits.length).toBeGreaterThan(50);
    // a place to a hundredth of a millimetre, which is what the data gives a fruit's
    const place = (p: readonly number[]): string => p.map((x) => (Math.round(x * 1e5) / 1e5 + 0).toFixed(5)).join(',');
    const spent = new Set(data.flowers.filter((f) => f.spentDay >= 0).map((f) => `${place(f.position)}:${f.spentDay}`));
    for (const f of data.fruits) expect(spent.has(`${place(f.position)}:${f.swell[0]}`), `fruit of ${f.year}`).toBe(true);
    expect(data.fruits.length).toBeLessThan(data.flowers.length);
    for (let d = day(`${last}-01-01`); d <= day(`${last}-06-10`); d++) expect(fruitOn(d), cal.dateOf(d).iso).toBe(0);
    for (let d = day(`${last}-01-01`); d < day(`${last}-08-15`); d++) expect(ripeOn(d), cal.dateOf(d).iso).toBe(0);
    expect(ripeOn(day(`${last}-09-30`))).toBeGreaterThan(0);
    expect(ripeOn(day(`${last}-10-31`))).toBeGreaterThan(10);
    // none hangs on green into the next year, and none is left when the year ends
    for (const f of data.fruits) expect(cal.dateOf(f.ripen[1]).year).toBe(f.year);
    expect(fruitOn(data.lastDay)).toBe(0);
    expect(fruitOn(day(`${last - 1}-12-31`))).toBe(0);
  });

  // taxon.json attachment.mechanism: stem_twining; SIMULATION_KEY.md: appendages only where the taxon has them
  it('has no tendrils, coiled leaf stalks, rootlets or prickles', () => {
    expect(data.appendages).toHaveLength(0);
    expect(sim.decisions.some((d) => d.kind === 'part_not_modelled')).toBe(false);
  });
});
