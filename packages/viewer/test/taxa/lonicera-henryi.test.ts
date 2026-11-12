import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Calendar, type RenderData, characterNumber, characterRange, characterText, flowerState, fruitState, hasCharacter, known, leafState, param, parseMorphology, readBower, seasonsOf, toRenderData } from '@horti/core';
import { growPlanting } from '../../src/plant/grow.ts';
import { triangles } from '../../src/plant/kit.ts';
import { assetsOf, ceilingFor } from '../../src/plant/look.ts';
import { loadLooks, lookFor } from '../../src/plant/registry.ts';
import { growable } from '../../src/plant/scenario.ts';
import { specimenPlan } from '../../src/specimen/specimen.ts';

const ID = 'lonicera-henryi';
const read = (path: string): unknown => JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8'));
const morphology = parseMorphology(read(`../../../../species/${ID}/morphology.json`), `species/${ID}/morphology.json`);
const profile = readFileSync(fileURLToPath(new URL(`../../../../species/${ID}/SPECIES_PROFILE.md`, import.meta.url)), 'utf8');
const { profile: taxon, model } = growable().get(ID)!;
const mid = (r: readonly [number, number]): number => (r[0] + r[1]) / 2;

await loadLooks([ID]);
const look = lookFor(ID);
const leaf = look.leaves.default;
const cluster = look.flowers!.default;
const berries = look.fruits!.default;

/** The vertices of a model, with the part each belongs to (aPart) where it has one. */
function vertices(g: THREE.BufferGeometry): { p: THREE.Vector3; uv: THREE.Vector2; pivot: THREE.Vector3; t: number }[] {
  const pos = g.getAttribute('position');
  const uv = g.getAttribute('uv') as THREE.BufferAttribute | undefined;
  const part = g.getAttribute('aPart') as THREE.BufferAttribute | undefined;
  return Array.from({ length: pos.count }, (_, i) => ({
    p: new THREE.Vector3().fromBufferAttribute(pos, i),
    uv: uv ? new THREE.Vector2().fromBufferAttribute(uv, i) : new THREE.Vector2(),
    pivot: part ? new THREE.Vector3(part.getX(i), part.getY(i), part.getZ(i)) : new THREE.Vector3(),
    t: part ? part.getW(i) : -1,
  }));
}

/** The flowers of a cluster model: one for each place a part pivots, with when it opens. */
function flowersOf(g: THREE.BufferGeometry): { pivot: THREE.Vector3; t: number }[] {
  const seen = new Map<string, { pivot: THREE.Vector3; t: number }>();
  for (const v of vertices(g)) if (v.t >= 0) seen.set(`${v.pivot.x.toFixed(5)},${v.pivot.y.toFixed(5)},${v.pivot.z.toFixed(5)}`, { pivot: v.pivot, t: v.t });
  return [...seen.values()];
}

// TAXON_LOOKS.md section 8, "Shape numbers from species/<id>/morphology.json": "counts and measured sizes (leaflets,
// tepals, the length of a leaflet for its width) come from the file".
describe('Lonicera henryi: the shapes drawn agree with its morphology file', () => {
  const bladeLength = characterRange(morphology, 'leaf.bladeLengthM');
  const bladeWidth = characterRange(morphology, 'leaf.bladeWidthM');
  const stalkLength = characterRange(morphology, 'leaf.stalkLengthM');

  /** The blade of a leaf model measured along its own midrib and across its margins, whatever way it is turned. */
  function measureBlade(variant: number): { length: number; width: number; from: number; veins: number } {
    // the middle level of detail: the blade without the fringe of hairs
    const blade = vertices(leaf.make(variant, 1)).filter((v) => v.t >= 0);
    const rows = [...new Set(blade.map((v) => v.uv.y.toFixed(5)))].sort((a, b) => Number(a) - Number(b));
    let length = 0;
    let width = 0;
    let last: THREE.Vector3 | null = null;
    for (const row of rows) {
      const ring = blade.filter((v) => v.uv.y.toFixed(5) === row);
      const rib = ring.find((v) => Math.abs(v.uv.x - 0.5) < 1e-6)!.p;
      const left = ring.find((v) => v.uv.x < 1e-6)!.p;
      const right = ring.find((v) => v.uv.x > 1 - 1e-6)!.p;
      width = Math.max(width, left.distanceTo(right));
      if (last) length += last.distanceTo(rib);
      last = rib;
    }
    const top = Number(rows.at(-1));
    // the shared leaf texture has a side vein leaving the midrib every 21 of its 256 rows, from row 14 (textures.ts)
    const veins = Math.floor((top - 14 / 256) / (21 / 256)) + 1;
    // where the blade leaves the stalk: the foot of its midrib (a heart-shaped base runs back past it on either side)
    const foot = blade.filter((v) => v.uv.y.toFixed(5) === rows[0] && Math.abs(v.uv.x - 0.5) < 1e-6)[0]!.p;
    return { length, width, from: foot.z, veins };
  }

  it('gives the blade the width for its length that Bean measured, from the most slender to the broadest', () => {
    const slender = bladeWidth[0] / bladeLength[0];
    const broad = bladeWidth[1] / bladeLength[1];
    const ratios: number[] = [];
    for (let v = 0; v < leaf.variants; v++) {
      const b = measureBlade(v);
      const ratio = b.width / b.length;
      ratios.push(ratio);
      // a coarse model does not sample the blade just where it is widest: a tenth of latitude below
      expect(ratio, `variant ${v}`).toBeGreaterThan(slender * 0.88);
      expect(ratio, `variant ${v}`).toBeLessThan(broad * 1.05);
    }
    // three outlines, each broader than the last, in each posture
    for (let v = 0; v + 2 < leaf.variants; v += 3) {
      expect(ratios[v + 1]!).toBeGreaterThan(ratios[v]!);
      expect(ratios[v + 2]!).toBeGreaterThan(ratios[v + 1]!);
    }
    expect(Math.max(...ratios) / Math.min(...ratios)).toBeGreaterThan(1.2);
  });

  it('makes the stalk the share of the leaf that the measured stalk is, and the whole leaf one unit long', () => {
    const share = mid(stalkLength) / (mid(stalkLength) + mid(bladeLength));
    for (let v = 0; v < leaf.variants; v++) {
      const b = measureBlade(v);
      expect(b.from, `variant ${v}`).toBeCloseTo(share, 2);
      // TAXON_LOOKS.md section 2: a leaf is one unit long, stalk and blade together, measured along it
      expect(share + b.length, `variant ${v}`).toBeGreaterThan(0.97);
      expect(share + b.length, `variant ${v}`).toBeLessThan(1.03);
    }
  });

  it('shows as many pairs of side veins as were counted on the plant', () => {
    const [few, many] = characterRange(morphology, 'leaf.lateralVeinPairs');
    for (let v = 0; v < leaf.variants; v++) {
      const { veins } = measureBlade(v);
      expect(veins, `variant ${v}`).toBeGreaterThanOrEqual(few);
      expect(veins, `variant ${v}`).toBeLessThanOrEqual(many);
    }
  });

  it('draws the fringe of hairs on the margin at the finest level only, and keeps the outline at the coarsest', () => {
    expect(characterText(morphology, 'leaf.margin')).toContain('fringed with hairs');
    expect(triangles(leaf.make(0, 0))).toBeGreaterThan(triangles(leaf.make(0, 1)) * 4);
    // the coarsest blade is still widest below the middle and drawn out to a point
    const coarse = vertices(leaf.make(1, 2)).filter((v) => v.t >= 0);
    const widthAt = (row: string) => {
      const ring = coarse.filter((v) => v.uv.y.toFixed(5) === row);
      return Math.max(...ring.map((v) => v.p.x)) - Math.min(...ring.map((v) => v.p.x));
    };
    const rows = [...new Set(coarse.map((v) => v.uv.y.toFixed(5)))].sort((a, b) => Number(a) - Number(b));
    const widths = rows.map(widthAt);
    const widest = widths.indexOf(Math.max(...widths));
    expect(widest).toBeGreaterThan(0);
    expect(widest).toBeLessThanOrEqual(Math.floor(rows.length / 2));
    expect(widths.at(-1)!).toBeLessThan(Math.max(...widths) * 0.1);
  });

  it('gives a cluster its flowers two to a stalk, within the number counted, and the same number at every level of detail', () => {
    const [few, many] = characterRange(morphology, 'inflorescence.flowerCount');
    const counts: number[] = [];
    for (let v = 0; v < cluster.variants; v++) {
      const n = flowersOf(cluster.make(v, 0)).length;
      counts.push(n);
      expect(n, `variant ${v}`).toBeGreaterThanOrEqual(few);
      expect(n, `variant ${v}`).toBeLessThanOrEqual(many);
      expect(n % 2, `variant ${v}`).toBe(0);
      expect(cluster.make(v, 0).userData).toMatchObject({ flowers: n, stalks: n / 2 });
      for (let lod = 1; lod < cluster.lods; lod++) expect(flowersOf(cluster.make(v, lod)).length, `variant ${v} level ${lod}`).toBe(n);
    }
    expect(Math.min(...counts)).toBe(few);
    expect(Math.max(...counts)).toBeGreaterThan(mid([few, many]));
  });

  // TAXON_LOOKS.md section 2: "A flower's authoredSize must be what the growth model's organs.racemeLengthM measures".
  it('authors the cluster at the width Bean gives it, which is what the growth model measures', () => {
    const width = characterRange(morphology, 'inflorescence.widthM');
    expect(cluster.authoredSize).toBeCloseTo(mid(width), 6);
    expect(param(model, 'organs.racemeLengthM')).toEqual(width);
    expect(model.params['organs.racemeLengthM'].source).toBe(morphology.characters['inflorescence.widthM']!.source);
    expect(cluster.poise).toBe('held');
    for (let v = 0; v < cluster.variants; v++) {
      const g = cluster.make(v, 0);
      g.computeBoundingBox();
      const size = new THREE.Vector3();
      g.boundingBox!.getSize(size);
      // across the cluster, square to the shoot that bears it
      const across = Math.max(size.x, size.z);
      expect(across / cluster.authoredSize, `variant ${v}`).toBeGreaterThan(0.75);
      expect(across / cluster.authoredSize, `variant ${v}`).toBeLessThan(1.25);
    }
  });

  // TAXON_LOOKS.md section 4: "whatever outlasts the petals must be axis"; morphology: opening "from the lowest pair upwards".
  it('opens a cluster from its lowest flowers, and leaves stalks and ovaries when the corollas have gone', () => {
    expect(characterText(morphology, 'inflorescence.openingOrder')).toContain('lowest');
    for (let v = 0; v < cluster.variants; v++) {
      const g = cluster.make(v, 0);
      const flowers = flowersOf(g).sort((a, b) => a.t - b.t);
      const third = Math.max(1, Math.floor(flowers.length / 3));
      const height = (list: typeof flowers) => list.reduce((y, f) => y + f.pivot.y, 0) / list.length;
      expect(height(flowers.slice(0, third)), `variant ${v}`).toBeLessThan(height(flowers.slice(-third)));
      // the last part to go is not the last to be seen as a bud: every part has opened by the time the first falls
      for (const f of flowers) expect(f.t).toBeLessThanOrEqual(0.9);
      const axis = vertices(g).filter((p) => p.t < 0);
      expect(axis.length, `variant ${v}`).toBeGreaterThan(flowers.length * 20);
    }
  });

  it('gives a cluster of berries the number counted, in pairs, at the width the growth model sets fruit at', () => {
    const [few, many] = characterRange(morphology, 'fruit.berriesPerCluster');
    const width = characterRange(morphology, 'fruit.clusterWidthM');
    const berry = characterRange(morphology, 'fruit.berryDiameterM');
    expect(berries.authoredSize).toBeCloseTo(mid(width), 6);
    expect(known(model, 'fruit.lengthM')).toEqual(width);
    const counts: number[] = [];
    for (let v = 0; v < berries.variants; v++) {
      const g = berries.make(v, 0);
      const n = (g.userData as { berries: number }).berries;
      counts.push(n);
      expect(n % 2, `variant ${v}`).toBe(0);
      g.computeBoundingBox();
      const size = new THREE.Vector3();
      g.boundingBox!.getSize(size);
      const across = Math.max(size.x, size.z);
      expect(across / berries.authoredSize, `variant ${v}`).toBeGreaterThan(0.7);
      expect(across / berries.authoredSize, `variant ${v}`).toBeLessThan(1.3);
      // no cluster is narrower than two berries side by side, or wider than its berries and stalks can make it
      expect(across).toBeGreaterThan(2 * berry[0] * 0.9);
    }
    expect(Math.min(...counts)).toBe(few);
    expect(Math.max(...counts)).toBe(many);
  });

  it('draws no tendril, coiled stalk, rootlet or prickle: the plant holds on with its stems', () => {
    expect(characterText(morphology, 'stem.climbsBy')).toContain('without clinging organs or tendrils');
    expect(look.appendages).toEqual({});
    expect(known(model, 'appendages.tendrilNodePattern')).toEqual([0]);
    expect(known(model, 'appendages.leafStalkCoilShare')).toBe(0);
    expect(known(model, 'appendages.aerialRootPatchSpacingM')).toEqual([0, 0]);
    expect(known(model, 'appendages.prickleSpacingM')).toEqual([0, 0]);
  });

  it('leaves unknown what no source gives, and keeps what it took from photographs labelled as an assumption', () => {
    for (const key of ['stem.youngDiameterMm', 'stem.oldDiameterMm', 'leaf.lifespanYears']) expect(hasCharacter(morphology, key), key).toBe(false);
    for (const key of ['inflorescence.flowerCount', 'fruit.berriesPerCluster', 'leaf.lateralVeinPairs', 'stem.internodeLengthM', 'fruit.clusterWidthM']) {
      expect(morphology.characters[key]!.status, key).toBe('provisional_design_assumption');
    }
    expect(characterNumber(morphology, 'flower.stamenCount')).toBe(5);
    expect(characterNumber(morphology, 'flower.upperLipLobes')).toBe(4);
  });
});

// TAXON_LOOKS.md section 6, "Levels of detail and triangle budgets".
describe('Lonicera henryi: every organ model', () => {
  it('builds at every level of detail, finite, within the budget it states and under the ceiling for its kind', () => {
    const assets = assetsOf(look);
    expect(assets.map((a) => a.asset.key).sort()).toEqual([`${ID}/berries`, `${ID}/cluster`, `${ID}/leaf`]);
    for (const { kind, asset } of assets) {
      expect(asset.budget.length, asset.key).toBe(asset.lods);
      for (let lod = 0; lod < asset.lods; lod++) {
        expect(asset.budget[lod]!, `${asset.key} level ${lod}`).toBeLessThanOrEqual(ceilingFor(kind, lod, asset.lods));
        for (let v = 0; v < asset.variants; v++) {
          const g = asset.make(v, lod);
          expect(triangles(g), `${asset.key} variant ${v} level ${lod}`).toBeLessThanOrEqual(asset.budget[lod]!);
          const pos = g.getAttribute('position').array;
          let bad = -1;
          for (let i = 0; i < pos.length && bad < 0; i++) if (!Number.isFinite(pos[i])) bad = i;
          expect(bad, `${asset.key} variant ${v} level ${lod}`).toBe(-1);
        }
      }
    }
  });

  it('is cheap at the coarsest level, which is what a planted Bower is drawn with', () => {
    expect(leaf.budget.at(-1)!).toBeLessThanOrEqual(40);
    expect(cluster.budget.at(-1)!).toBeLessThanOrEqual(300);
    expect(berries.budget.at(-1)!).toBeLessThanOrEqual(220);
  });
});

// The growth model and the morphology file describe one plant: where both hold a number, it is the same number.
describe('Lonicera henryi: the growth model and the morphology file agree', () => {
  it('uses Bean’s leaf, blade and stalk together, for the length of a leaf', () => {
    const blade = characterRange(morphology, 'leaf.bladeLengthM');
    const stalk = characterRange(morphology, 'leaf.stalkLengthM');
    const [low, high] = param(model, 'organs.leafLengthM');
    expect(low).toBeCloseTo(blade[0] + stalk[0], 3);
    expect(high).toBeCloseTo(blade[1] + stalk[1], 3);
    expect(param(model, 'organs.leavesPerNode')).toBe(2);
    expect(characterText(morphology, 'leaf.arrangement')).toBe('opposite');
  });

  it('uses the measured length of a year’s shoot for its long shoots, and the same spacing of leaves', () => {
    expect(param(model, 'organs.whipLengthM')).toEqual(characterRange(morphology, 'habit.annualShootLengthM'));
    expect(model.params['organs.whipLengthM'].status).toBe('peer_reviewed');
    expect(param(model, 'organs.leafSpacingM')).toEqual(characterRange(morphology, 'stem.internodeLengthM'));
    expect(model.params['organs.leafSpacingM'].status).toBe('provisional_design_assumption');
  });

  // SPECIES_PROFILE.md, "Form: what the model draws": every flower stands at the end of a short leafy shoot.
  it('flowers at the ends of short leafy shoots only, held on the line of the shoot, as its sources place them', () => {
    expect(characterText(morphology, 'inflorescence.type')).toContain('at the end of the shoot');
    expect(profile).toContain('## Form: what the model draws');
    expect(param(model, 'flowering.currentSeasonFlowersPerM')).toBe(0);
    expect(param(model, 'organs.spurChance')).toBe(0);
    expect(known(model, 'sideShoots.terminalFlowerShare')).toBeGreaterThan(0);
    expect(model.names.flowerHeld).toBe('facing_out');
    expect(model.names.fruitHeld).toBe('facing_out');
    // the taxon file's flowering wood is untouched: these shoots are growth of the current season
    expect(taxon.flowering.wood.value).toBe('current_season');
  });
});

// From an engine run on the specimen frame. Every question is put to the core's presence module (render/presence.ts);
// no month is worked out here.
describe('Lonicera henryi grown on the specimen frame for six years', () => {
  const frame = readBower(read('../../../../examples/specimen-frame.bower.json'), 'examples/specimen-frame.bower.json');
  const grow = (care: 'trained' | 'untended') => growPlanting({ bower: frame.bower, plan: specimenPlan(ID), viewpoints: frame.viewpoints }, growable(), care, 6);
  const trained = grow('trained');
  const data: RenderData = toRenderData(trained.sim);
  const cal = new Calendar(data.start);
  const year = cal.dateOf(data.lastDay).year;
  const daysOf = (month: number): number[] => {
    const out: number[] = [];
    for (let day = cal.dayOf(`${year}-${String(month).padStart(2, '0')}-01`); day <= data.lastDay && cal.dateOf(day).month === month; day++) out.push(day);
    return out;
  };
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const leavesOn = (day: number): number => {
    const seasons = seasonsOf(data, cal.dateOf(day).year);
    return data.leaves.reduce((n, l) => n + (leafState(l, seasons.get(l.plantId), day).present ? 1 : 0), 0);
  };
  const mid15 = (month: number): number => cal.dayOf(`${year}-${String(month).padStart(2, '0')}-15`);

  // taxon.json leafHabit (RHS: evergreen); KEY.md: the evergreen share is what holds the picture in winter.
  it('is in leaf in every month, and keeps a good share of its summer leaf through January', () => {
    for (const m of months) expect(leavesOn(mid15(m)), `month ${m}`).toBeGreaterThan(1000);
    expect(leavesOn(mid15(1)) / leavesOn(mid15(7))).toBeGreaterThan(0.3);
    expect(data.leaves.every((l) => l.evergreen)).toBe(true);
  });

  // CLAUDE.md: "A flowering month is an envelope, not a trigger." taxon.json: flowers in June, July and August.
  it('has flowers open in the months its sources give, June to August, and in no other', () => {
    const envelope = taxon.flowering.monthsUK.value!;
    expect(envelope).toEqual([6, 7, 8]);
    const open = (month: number) => daysOf(month).some((day) => data.flowers.some((f) => f.year === year && flowerState(f, day).phase === 'open'));
    const flowering = months.filter(open);
    for (const m of flowering) expect(envelope, `month ${m}`).toContain(m);
    // Bean: "produced during June"; Kwantlen: June and July
    expect(flowering).toContain(6);
    expect(flowering).toContain(7);
    // buds show at the shoot tips before the first flower opens
    const first = Math.min(...data.flowers.filter((f) => f.year === year).map((f) => f.openDay));
    expect(data.flowers.some((f) => flowerState(f, first - 7).phase === 'in_bud')).toBe(true);
  });

  it('bears every flower at the tip of a short shoot of its own, facing out along it', () => {
    const roles = new Map(data.stems.map((s) => [s.id, s.role]));
    expect(data.flowers.length).toBeGreaterThan(100);
    for (const f of data.flowers) {
      expect(roles.get(f.stemId)).toBe('side_shoot');
      expect(f.direction).toBeDefined();
      expect(f.stemPoint).toBeUndefined();
      const [low, high] = param(model, 'organs.racemeLengthM');
      expect(f.lengthM).toBeGreaterThanOrEqual(low - 1e-3);
      expect(f.lengthM).toBeLessThanOrEqual(high + 1e-3);
    }
  });

  // SPECIES_PROFILE.md, "Form: what the model draws": berries follow the flowers, green by August, blue-black in autumn.
  it('carries berries from summer into winter and none in spring, each where a flower went over', () => {
    const on = (month: number, test: (phase: string) => boolean) => data.fruits.filter((f) => test(fruitState(f, mid15(month)).phase)).length;
    const present = (phase: string) => phase !== 'absent';
    for (const m of [1, 2, 3, 4, 5]) expect(on(m, present), `month ${m}`).toBe(0);
    for (const m of [7, 8, 9, 10, 11, 12]) expect(on(m, present), `month ${m}`).toBeGreaterThan(0);
    // full grown and still green in the middle of August (a dated photograph); ripe in October (Flora of China)
    expect(on(8, (p) => p === 'full')).toBeGreaterThan(0);
    expect(on(8, (p) => p === 'ripe')).toBe(0);
    expect(on(10, (p) => p === 'ripe')).toBeGreaterThan(on(10, (p) => p === 'full' || p === 'swelling'));
    // fruit never comes from the calendar: each berry cluster stands where a flower's petals fell, from that day
    const near = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!) < 1e-4;
    const spentOn = new Map<number, RenderData['flowers']>();
    for (const f of data.flowers) spentOn.set(f.spentDay, [...(spentOn.get(f.spentDay) ?? []), f]);
    for (const f of data.fruits) expect((spentOn.get(f.swell[0]) ?? []).some((flower) => flower.stemId === f.stemId && near(flower.position, f.position))).toBe(true);
    expect(data.fruits.length).toBeLessThan(data.flowers.length);
    const [low, high] = known(model, 'fruit.lengthM')!;
    for (const f of data.fruits) expect(f.lengthM >= low - 1e-3 && f.lengthM <= high + 1e-3).toBe(true);
  });

  it('has no tendrils, coiled stalks, rootlets or prickles in the run', () => {
    expect(data.appendages).toEqual([]);
  });

  // The brief for this taxon: "A plant that looks thin is a growth problem"; RHS: 4 to 8 m in 2 to 5 years.
  it('reaches the top of the frame in its second year and has taken most of it by its sixth, in thousands of leaves', () => {
    const summary = (y: number) => trained.sim.summaries.find((s) => s.year === 2027 + y - 1)!;
    expect(summary(2).highestM).toBeGreaterThan(2.5);
    expect(summary(6).routeShare).toBeGreaterThan(0.8);
    expect(leavesOn(mid15(7))).toBeGreaterThan(6000);
    // within what one measured mat holds to the square metre (Weber 2005: 128 to 366 shoots or stems), not beyond it
    const shoots = data.stems.filter((s) => (s.role === 'whip' || s.role === 'side_shoot') && s.removedDay.at(-1)! < 0).length;
    const face = 2.4 * 2.95;
    expect(shoots / face).toBeLessThan(characterRange(morphology, 'habit.shootsPerSquareMetre')[1]);
  });

  // attachment.maxGraspDiameterMm (55 mm, an assumption): a 40 mm lath is 51 mm round and within its grasp.
  it('left untended, twines the laths and cables by itself and leaves the post alone', () => {
    const untended = grow('untended');
    const last = untended.sim.summaries.at(-1)!;
    expect(last.runsTied).toBe(0);
    expect(last.runsSelf).toBeGreaterThan(50);
    expect(last.routeShare).toBeGreaterThan(0.5);
    const held = new Set<string>();
    for (const a of untended.sim.axes.values()) for (const run of a.runs) if (run.status !== 'detached') held.add(run.edgeId);
    const post = [...frame.bower.graph.edges.values()].filter((e) => e.gripDiameterMm > param(model, 'attachment.maxGraspDiameterMm'));
    expect(post.length).toBeGreaterThan(0);
    for (const e of post) expect(held.has(e.id), e.id).toBe(false);
  });
});
