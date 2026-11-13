import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Calendar, type RenderData, characterNumber, characterRange, flowerState, fruitState, known, leafState, param, parseMorphology, readBower, seasonsOf, toRenderData } from '@horti/core';
import { growPlanting } from '../../src/plant/grow.ts';
import { asMeasured } from '../../src/plant/hold.ts';
import { triangles } from '../../src/plant/kit.ts';
import { assetsOf, ceilingFor } from '../../src/plant/look.ts';
import { loadLooks, lookFor } from '../../src/plant/registry.ts';
import { growable } from '../../src/plant/scenario.ts';
import { specimenPlan } from '../../src/specimen/specimen.ts';

const ID = 'clematis-cirrhosa-freckles';
const SPECIES = fileURLToPath(new URL(`../../../../species/${ID}/`, import.meta.url));
const FRAME = fileURLToPath(new URL('../../../../examples/specimen-frame.bower.json', import.meta.url));
const morphology = parseMorphology(JSON.parse(readFileSync(`${SPECIES}morphology.json`, 'utf8')), `species/${ID}/morphology.json`);
const profile = readFileSync(`${SPECIES}SPECIES_PROFILE.md`, 'utf8');
const { model, profile: taxon } = growable().get(ID)!;

await loadLooks([ID]);
const look = lookFor(ID);
const V3 = THREE.Vector3;
const mid = (r: readonly [number, number]): number => (r[0] + r[1]) / 2;

/** The vertices of a geometry with the part each belongs to: its pivot and its `t` (TAXON_LOOKS.md, section 4). */
function vertices(g: THREE.BufferGeometry): { p: THREE.Vector3; pivot: THREE.Vector3; t: number }[] {
  const position = g.getAttribute('position');
  const part = g.getAttribute('aPart');
  return Array.from({ length: position.count }, (_, i) => ({ p: new V3().fromBufferAttribute(position, i), pivot: new V3(part.getX(i), part.getY(i), part.getZ(i)), t: part.getW(i) }));
}
/** Distinct points among a list, to a tolerance. */
function distinct(points: THREE.Vector3[], tol = 1e-4): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (const p of points) if (!out.some((o) => o.distanceTo(p) < tol)) out.push(p);
  return out;
}

// TAXON_LOOKS.md, sections 1 and 6: "Every model builds finite geometry at every level of detail, within the triangle
// budget the asset states"; "No taxon module imports another".
describe('the organ models of Clematis cirrhosa Freckles', () => {
  it('are its own: two leaf forms, the bell, the seed head and the coiled leaf stalk, and none is the stand-in', () => {
    expect(look.taxonId).toBe(ID);
    expect(look.provisional).toBe(false);
    expect(Object.keys(look.leaves).sort()).toEqual(['default', 'short_shoot']);
    expect(Object.keys(look.flowers ?? {})).toEqual(['default']);
    expect(Object.keys(look.fruits ?? {})).toEqual(['default']);
    expect(Object.keys(look.appendages)).toEqual(['leaf_stalk_coil']);
    for (const { asset } of assetsOf(look)) expect(asset.key.startsWith(`${ID}/`), asset.key).toBe(true);
    // the growth model names the forms the look draws
    expect(model.names.sideShootLeafForm).toBe('short_shoot');
  });

  it('build at every level of detail, finite and within the budget each states, each level lighter than the one before', () => {
    for (const { kind, asset } of assetsOf(look)) {
      expect(asset.budget).toHaveLength(asset.lods);
      for (let lod = 0; lod < asset.lods; lod++) {
        expect(asset.budget[lod]!, `${asset.key} level ${lod}`).toBeLessThanOrEqual(ceilingFor(kind, lod, asset.lods));
        for (let v = 0; v < asset.variants; v++) {
          const g = asset.make(v, lod);
          expect(Array.from(g.getAttribute('position').array).every((x) => Number.isFinite(x)), `${asset.key} ${v}/${lod}`).toBe(true);
          expect(triangles(g), `${asset.key} variant ${v} level ${lod}`).toBeLessThanOrEqual(asset.budget[lod]!);
        }
      }
      for (let lod = 1; lod < asset.lods; lod++) expect(triangles(asset.make(0, lod)), asset.key).toBeLessThan(triangles(asset.make(0, lod - 1)));
    }
  });
});

// morphology.json leaf.*: Flora of Turkey, long shoots "usually bear ternate leaves", short-shoot leaves simple; Cretan
// Flora, leaflets 2-5 x 1.5-3.5 cm; Bean, the simple blade "broadly ovate with a heart-shaped base or three-lobed".
describe('the leaves', () => {
  it('of a long shoot has as many leaflets as the morphology file gives, each a blade of its own on the one stalk', () => {
    const leaflets = characterNumber(morphology, 'leaf.leafletCount');
    for (let v = 0; v < look.leaves.default!.variants; v++) {
      const blades = distinct(vertices(look.leaves.default!.make(v, 0)).filter((x) => x.t >= 0).map((x) => x.pivot), 1e-3);
      expect(blades.length, `variant ${v}`).toBe(leaflets);
    }
  });

  it('of a long shoot has leaflets about as wide for their length as the Cretan Flora gives', () => {
    const ratio = mid(characterRange(morphology, 'leaf.leafletWidthM')) / mid(characterRange(morphology, 'leaf.leafletLengthM'));
    const g = look.leaves.default!.make(1, 0);
    const vs = vertices(g).filter((x) => x.t >= 0);
    // the end leaflet: the blade whose pivot is farthest out along the leaf
    const end = vs.reduce((a, b) => (b.pivot.z > a.pivot.z ? b : a)).pivot;
    const own = vs.filter((x) => x.pivot.distanceTo(end) < 1e-3).map((x) => x.p);
    const length = Math.max(...own.map((p) => p.z)) - Math.min(...own.map((p) => p.z));
    const width = Math.max(...own.map((p) => p.x)) - Math.min(...own.map((p) => p.x));
    expect(width / length).toBeGreaterThan(ratio * 0.75);
    expect(width / length).toBeLessThan(ratio * 1.3);
  });

  it('of a short shoot is one blade on its stalk, held by the viewer, and one unit from the stem to its tip', () => {
    const leaf = look.leaves.short_shoot!;
    expect(leaf.hold).toBeDefined();
    expect(leaf.hold!.rise).toEqual(characterRange(morphology, 'leaf.faceRiseDeg'));
    for (let v = 0; v < leaf.variants; v++) {
      const g = leaf.make(v, 0);
      expect(distinct(vertices(g).filter((x) => x.t >= 0).map((x) => x.pivot), 1e-3)).toHaveLength(1);
      const z = asMeasured(g, leaf.hold!.unitAt).map((p) => p.z);
      expect(Math.max(...z)).toBeGreaterThan(0.95);
      expect(Math.max(...z)).toBeLessThan(1.05);
    }
  });

  it('carry a texture of their own with as many palmate main veins as the morphology file gives', () => {
    for (const leaf of [look.leaves.default!, look.leaves.short_shoot!]) {
      expect(leaf.texture).toBeDefined();
      const mains = leaf.texture!.lines!().filter((l: { kind: string }) => l.kind === 'main');
      expect(mains.length).toBe(characterNumber(morphology, 'leaf.mainVeins'));
    }
  });
});

// morphology.json flower.*: International Clematis Society, "four sepals", flowers "5-7.5 cm across"; Cretan Flora,
// "nodding"; Bean, "two bracts ... united into a cup-shaped involucre".
describe('the flower', () => {
  const flower = look.flowers!.default!;
  it('is authored one flower-width across, hanging, as organs.racemeLengthM measures it for this plant', () => {
    expect(flower.authoredSize).toBe(1);
    expect(flower.poise).toBe('hangs');
    expect(param(model, 'organs.racemeLengthM')).toEqual(characterRange(morphology, 'flower.widthM'));
  });

  it('has four tepals that open and fall, round stamens that fall with them, on a stalk, cup and carpels that stay', () => {
    const vs = vertices(flower.make(0, 0));
    const axis = vs.filter((x) => x.t < 0);
    const tepals = vs.filter((x) => x.t >= 0 && x.t < 0.075);
    const stamens = vs.filter((x) => x.t >= 0.075);
    expect(axis.length).toBeGreaterThan(0);
    expect(stamens.length).toBeGreaterThan(0);
    // at the coarsest level each tepal is one sheet: count the separate sheets of the parts that open first
    const g = flower.make(0, 2);
    const part = g.getAttribute('aPart');
    const index = g.index!;
    const parent = new Map<number, number>();
    const find = (x: number): number => {
      while (parent.get(x) !== x) x = parent.get(x)!;
      return x;
    };
    for (let i = 0; i < part.count; i++) if (part.getW(i) >= 0 && part.getW(i) < 0.075) parent.set(i, i);
    for (let i = 0; i < index.count; i += 3) {
      const [p, q, r] = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
      if (!parent.has(p) || !parent.has(q) || !parent.has(r)) continue;
      parent.set(find(p), find(q));
      parent.set(find(r), find(q));
    }
    const groups = new Set([...parent.keys()].map(find)).size;
    expect(tepals.length).toBeGreaterThan(0);
    expect(groups).toBe(characterNumber(morphology, 'flower.tepalCount'));
  });

  it('is a wide bell whose mouth is what the morphology file reads off the photographs', () => {
    const vs = vertices(flower.make(0, 0)).filter((x) => x.t >= 0 && x.t < 0.075);
    const top = vs[0]!.pivot;
    const centre = vs.reduce((s, x) => s.add(x.p), new V3()).multiplyScalar(1 / vs.length);
    const down = centre.clone().sub(top).normalize();
    const radius = Math.max(...vs.map((x) => x.p.clone().sub(top).addScaledVector(down, -x.p.clone().sub(top).dot(down)).length()));
    const mouth = characterNumber(morphology, 'flower.mouthShareOfWidth');
    expect(2 * radius).toBeGreaterThan(mouth * 0.85);
    expect(2 * radius).toBeLessThan(mouth * 1.25);
  });
});

// morphology.json fruit.*: Bean, plumose styles "1 1/2 to 2 in. long"; Cretan Flora, achenes 3-5 mm.
describe('the seed head', () => {
  const fruit = look.fruits!.default!;
  it('is authored one achene with its tail long, hanging, and its stalk and cup keep their green as the tails dry', () => {
    expect(fruit.authoredSize).toBe(1);
    expect(fruit.poise).toBe('hangs');
    expect(fruit.stalkKeepsColour).toBe(true);
    expect(known(model, 'fruit.lengthM')![0]).toBeCloseTo(characterRange(morphology, 'fruit.acheneLengthM')[0] + characterRange(morphology, 'fruit.tailLengthM')[0], 3);
    const vs = vertices(fruit.make(0, 0));
    expect(vs.some((x) => x.t < 0)).toBe(true);
    expect(vs.some((x) => x.t >= 0)).toBe(true);
    // the tails reach about one unit from the top of the stalk
    const top = vs.filter((x) => x.t >= 0)[0]!.pivot;
    const far = Math.max(...vs.filter((x) => x.t >= 0).map((x) => x.p.distanceTo(top)));
    expect(far).toBeGreaterThan(0.8);
    expect(far).toBeLessThan(1.25);
  });
});

// Flora of Turkey: long shoots' "petioles twining"; Cretan Flora: old petioles "indurate, twisting and clasping".
describe('the hold', () => {
  it('is a leaf stalk along +Z, one unit long, that hardens and browns with age', () => {
    const coil = look.appendages.leaf_stalk_coil!;
    expect(coil.aged).toBeDefined();
    for (let v = 0; v < coil.variants; v++) {
      const g = coil.make(v, 0);
      g.computeBoundingBox();
      expect(g.boundingBox!.max.z).toBeGreaterThan(0.85);
      expect(g.boundingBox!.max.z).toBeLessThan(1.15);
    }
  });
});

// CLAUDE.md: "A flowering month is an envelope, not a trigger." render/presence.ts answers what is on the plant on a
// day; nothing below works out a season of its own.
describe('a specimen of Clematis cirrhosa Freckles, eight years on the frame, trained', () => {
  const frame = readBower(JSON.parse(readFileSync(FRAME, 'utf8')), 'examples/specimen-frame.bower.json');
  const years = 8;
  const { sim } = growPlanting({ bower: frame.bower, plan: specimenPlan(ID), viewpoints: frame.viewpoints }, growable(), 'trained', years);
  const data: RenderData = toRenderData(sim);
  const cal = new Calendar(data.start);
  const last = 2027 + years - 1;
  const on = (iso: string) => cal.dayOf(iso);
  const month = (m: number) => String(m).padStart(2, '0');
  const leavesOn = (iso: string) => {
    const seasons = seasonsOf(data, Number(iso.slice(0, 4)));
    return data.leaves.filter((l) => leafState(l, seasons.get(l.plantId), on(iso)).present).length;
  };
  const openOn = (day: number) => data.flowers.filter((f) => flowerState(f, day).phase === 'open').length;
  const fruitOn = (iso: string) => data.fruits.filter((f) => fruitState(f, on(iso)).phase !== 'absent').length;

  // taxon.json leafHabit "evergreen" (RHS); SPECIES_PROFILE.md, "Form: what the model draws".
  it('is in leaf in every month of the year, and every leaf is evergreen', () => {
    expect(taxon.leafHabit.value).toBe('evergreen');
    for (let m = 1; m <= 12; m++) expect(leavesOn(`${last}-${month(m)}-15`), `month ${m}`).toBeGreaterThan(1500);
    for (const l of data.leaves) expect(l.evergreen).toBe(true);
    expect(profile).toContain('## Form: what the model draws');
  });

  // RHS: flowers late autumn to early spring; Ashridge: November to February, sometimes from late October.
  it('has flowers open from late October into March and none from April to September', () => {
    expect(data.flowers.length).toBeGreaterThan(200);
    const months = new Set<number>();
    for (let day = on(`${last - 1}-04-01`); day <= on(`${last}-03-31`); day++) if (openOn(day) > 0) months.add(cal.dateOf(day).month);
    for (const m of months) expect([10, 11, 12, 1, 2, 3], `month ${m}`).toContain(m);
    for (const m of [11, 12, 1]) expect(months.has(m), `month ${m}`).toBe(true);
    for (const m of [4, 5, 6, 7, 8, 9]) expect(openOn(on(`${last}-${month(m)}-15`)), `month ${m}`).toBe(0);
    // the most in December and January (Ashridge: the display through midwinter)
    expect(openOn(on(`${last - 1}-12-20`))).toBeGreaterThan(openOn(on(`${last - 1}-10-28`)));
    for (const f of data.flowers) {
      expect(f.lengthM).toBeGreaterThanOrEqual(param(model, 'organs.racemeLengthM')[0]);
      expect(f.lengthM).toBeLessThanOrEqual(param(model, 'organs.racemeLengthM')[1]);
    }
  });

  // RHS: "followed by silky seedheads"; Plant Delights: they stay a long time. Dates in model.json fruit.*.
  it('carries seed heads from late winter into early summer and none from August to October', () => {
    expect(data.fruits.length).toBeGreaterThan(50);
    for (const iso of [`${last}-03-15`, `${last}-05-15`]) expect(fruitOn(iso), iso).toBeGreaterThan(10);
    for (const m of [8, 9, 10]) expect(fruitOn(`${last}-${month(m)}-15`), `month ${m}`).toBe(0);
    for (const f of data.fruits) expect(data.flowers.some((x) => x.stemId === f.stemId && x.spentDay === f.swell[0])).toBe(true);
  });

  // taxon.json attachment.mechanism "petiole_twining"; model.json appendages.leafStalk*.
  it('holds on by coiled leaf stalks as long as Bean gives them, and by nothing else', () => {
    expect(taxon.attachment.mechanism).toBe('petiole_twining');
    expect(data.appendages.length).toBeGreaterThan(20);
    const [short, long] = known(model, 'appendages.leafStalkLengthM')!;
    for (const a of data.appendages) {
      expect(a.kind).toBe('leaf_stalk_coil');
      expect(a.lengthM).toBeGreaterThanOrEqual(short);
      expect(a.lengthM).toBeLessThanOrEqual(long);
    }
  });

  // RHS: 2.5-4 m in 2-5 years. The frame is 3 m tall.
  it('reaches the top of the frame within five years and bears both leaf forms', () => {
    const fifth = sim.summaries.find((s) => s.year === 2031)!;
    expect(fifth.highestM).toBeGreaterThan(2.5);
    const forms = new Set(data.leaves.map((l) => l.form ?? 'default'));
    expect([...forms].sort()).toEqual(['default', 'short_shoot']);
  });
});
