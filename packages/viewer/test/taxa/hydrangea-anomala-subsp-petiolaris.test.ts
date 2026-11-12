import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  Calendar,
  type Growable,
  appendagePresent,
  characterNumber,
  characterRange,
  characterText,
  flowerState,
  fruitState,
  known,
  leafState,
  param,
  parseGrowthModel,
  parseMorphology,
  parseTaxon,
  readBower,
  seasonsOf,
  toRenderData,
} from '@horti/core';
import { growPlanting } from '../../src/plant/grow.ts';
import { triangles } from '../../src/plant/kit.ts';
import { assetsOf, ceilingFor } from '../../src/plant/look.ts';
import { loadLooks, lookFor } from '../../src/plant/registry.ts';
import { PlantView } from '../../src/plant/view.ts';
import { specimenPlan } from '../../src/specimen/specimen.ts';
import { camera, materials } from '../helpers.ts';

const ID = 'hydrangea-anomala-subsp-petiolaris';
// the look as the viewer loads it: through the registry, from this taxon's own module
await loadLooks([ID]);
const look = lookFor(ID);
const file =(path: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../../../${path}`, import.meta.url)), 'utf8')) as unknown;
const morphology = parseMorphology(file(`species/${ID}/morphology.json`), `species/${ID}/morphology.json`);
const model = parseGrowthModel(file(`species/${ID}/model.json`), `species/${ID}/model.json`);
const profile = parseTaxon(file(`species/${ID}/taxon.json`), `species/${ID}/taxon.json`);
const mid = (r: readonly [number, number]) => (r[0] + r[1]) / 2;

/** The vertices of a model with the part each belongs to. */
function vertices(g: THREE.BufferGeometry): { p: THREE.Vector3; pivot: string; t: number }[] {
  const pos = g.getAttribute('position');
  const part = g.getAttribute('aPart');
  return Array.from({ length: pos.count }, (_, i) => ({ p: new THREE.Vector3().fromBufferAttribute(pos, i), pivot: `${part.getX(i).toFixed(5)},${part.getY(i).toFixed(5)},${part.getZ(i).toFixed(5)}`, t: part.getW(i) }));
}
function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = out.get(k);
    if (list) list.push(item);
    else out.set(k, [item]);
  }
  return out;
}
/** The widest a set of points reaches, end to end. */
function span(points: readonly THREE.Vector3[]): number {
  let widest = 0;
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) widest = Math.max(widest, points[i]!.distanceTo(points[j]!));
  return widest;
}

const leaf = look.leaves.default;
const lacecap = look.flowers!.default;
const dryHead = look.fruits!.default;
const rootlets = look.appendages.aerial_roots!;

// TAXON_LOOKS.md section 1: "A count or size of the real plant that a shape depends on ... is read from
// species/<id>/morphology.json, where it has a source." Section 8: "counts and measured sizes ... come from the file."
describe('the leaf of the climbing hydrangea, against morphology.json', () => {
  const stalk = characterRange(morphology, 'leaf.stalkLengthM');
  const blade = characterRange(morphology, 'leaf.bladeLengthM');

  it('gives the long stalk its share of the leaf: 3 to 9 cm under a blade of 5.5 to 12 cm', () => {
    const share = mid(stalk) / (mid(stalk) + mid(blade));
    expect(share).toBeGreaterThan(0.35);
    for (let v = 0; v < leaf.variants; v++) {
      // the blade is the part that unfolds (t >= 0); the stalk is axis. The blade begins where the stalk ends
      const bladeFrom = Math.min(...vertices(leaf.make(v, 0)).filter((x) => x.t >= 0).map((x) => x.p.z));
      expect(bladeFrom, `variant ${v}`).toBeGreaterThan(share - 0.08);
      expect(bladeFrom, `variant ${v}`).toBeLessThan(share + 0.02);
    }
  });

  it('draws the blade broadly ovate: as wide for its length as leaf.bladeWidthShareOfLength, a little more or less', () => {
    const share = characterNumber(morphology, 'leaf.bladeWidthShareOfLength');
    const [w0, w1] = characterRange(morphology, 'leaf.bladeWidthM');
    // the published widths and lengths say the same thing as the share
    expect(mid([w0, w1]) / 0.075).toBeCloseTo(share, 1);
    const ratios: number[] = [];
    for (let v = 0; v < leaf.variants; v++) {
      const pts = vertices(leaf.make(v, 1))
        .filter((x) => x.t >= 0)
        .map((x) => x.p);
      // longer than wide, so its greatest reach is its length, from the rear of the base to the tip
      let length = 0;
      let axis = new THREE.Vector3(0, 0, 1);
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const d = pts[i]!.distanceTo(pts[j]!);
          if (d > length) {
            length = d;
            axis = pts[j]!.clone().sub(pts[i]!).normalize();
          }
        }
      }
      // its width is its greatest reach across that line, however the blade is turned on its stalk
      const width = span(pts.map((p) => p.clone().addScaledVector(axis, -p.dot(axis))));
      ratios.push(width / length);
    }
    for (const r of ratios) {
      expect(r).toBeGreaterThan(share * 0.85);
      expect(r).toBeLessThan(share * 1.2);
    }
    // one of the forms is the published proportion itself
    expect(ratios.some((r) => Math.abs(r - share) < 0.04)).toBe(true);
  });

  it('cuts the margin into leaf.marginTeethPerSide teeth on each side at the finest level, and leaves it plain farther off', () => {
    const teeth = characterNumber(morphology, 'leaf.marginTeethPerSide');
    const marginSteps = (lod: number): number => {
      const g = leaf.make(0, lod);
      const part = g.getAttribute('aPart');
      const pos = g.getAttribute('position');
      const index = g.index!;
      // edges of the blade that belong to one triangle only are its margin
      const seen = new Map<string, number>();
      for (let i = 0; i < index.count; i += 3) {
        const tri = [index.getX(i), index.getX(i + 1), index.getX(i + 2)] as const;
        if (part.getW(tri[0]) < 0) continue;
        for (const [a, b] of [[tri[0], tri[1]], [tri[1], tri[2]], [tri[2], tri[0]]] as const) {
          const key = a < b ? `${a}-${b}` : `${b}-${a}`;
          seen.set(key, (seen.get(key) ?? 0) + 1);
        }
      }
      let steps = 0;
      for (const [key, count] of seen) {
        if (count !== 1) continue;
        const [a, b] = key.split('-').map(Number) as [number, number];
        // where the margin runs in to the stalk the fan closes on itself in edges of no length: not margin
        if (new THREE.Vector3().fromBufferAttribute(pos, a).distanceTo(new THREE.Vector3().fromBufferAttribute(pos, b)) > 1e-4) steps++;
      }
      return steps;
    };
    // a notch and a point to each tooth, on both sides
    expect(marginSteps(0)).toBe(4 * teeth);
    expect(marginSteps(1)).toBeLessThan(teeth);
  });

  it('lays the shared leaf texture so that leaf.secondaryVeinPairs pairs of side veins cross the blade', () => {
    const pairs = Math.round(mid(characterRange(morphology, 'leaf.secondaryVeinPairs')));
    const g = leaf.make(0, 0);
    const uv = g.getAttribute('uv');
    const part = g.getAttribute('aPart');
    let low = Infinity;
    let high = -Infinity;
    for (let i = 0; i < uv.count; i++) {
      if (part.getW(i) < 0) continue;
      low = Math.min(low, uv.getY(i));
      high = Math.max(high, uv.getY(i));
    }
    // the texture has a pair of side veins every 21/256 of its height (textures.ts)
    expect((high - low) / (21 / 256)).toBeGreaterThan(pairs - 0.5);
    expect((high - low) / (21 / 256)).toBeLessThan(pairs + 0.5);
  });
});

describe('the flowerhead of the climbing hydrangea, against morphology.json', () => {
  const headM = mid(characterRange(morphology, 'inflorescence.widthM'));

  it('is one unit across over its sterile flowers, which is what organs.racemeLengthM measures', () => {
    expect(lacecap.authoredSize).toBe(1);
    expect(param(model, 'organs.racemeLengthM')[1]).toBe(characterRange(morphology, 'inflorescence.widthM')[1]);
    expect(model.params['organs.racemeLengthM'].basis).toContain('width');
    for (let v = 0; v < lacecap.variants; v++) {
      // across the head: the farthest any two sepal tips are apart
      const tips = vertices(lacecap.make(v, 2))
        .filter((x) => x.t <= -3)
        .map((x) => x.p);
      expect(span(tips), `variant ${v}`).toBeGreaterThan(0.9);
      expect(span(tips), `variant ${v}`).toBeLessThan(1.08);
    }
  });

  it('rings it with sterile flowers of sterileFlower.sepalCount sepals each, in the published number and in one head fewer', () => {
    const sepals = characterNumber(morphology, 'sterileFlower.sepalCount');
    const [few, many] = characterRange(morphology, 'inflorescence.sterileFlowerCount');
    const counts: number[] = [];
    for (let v = 0; v < lacecap.variants; v++) {
      for (let lod = 0; lod < lacecap.lods; lod++) {
        // each sepal is tagged as axis with a number of its own, from -3 down
        const florets = groupBy(vertices(lacecap.make(v, lod)).filter((x) => x.t <= -3), (x) => x.pivot);
        for (const [, vs] of florets) expect(new Set(vs.map((x) => x.t)).size, `variant ${v} level ${lod}`).toBe(sepals);
        if (lod === 0) counts.push(florets.size);
        else expect(florets.size).toBe(counts[v]);
      }
    }
    expect(counts.filter((n) => n >= few && n <= many).length).toBeGreaterThanOrEqual(2);
    // "the number varies considerably, from very few to many": one head has fewer than the patent's ten
    expect(Math.min(...counts)).toBeLessThan(few);
  });

  it('makes each sterile flower 2 to 4.5 cm across on a head of middle width', () => {
    const [narrow, wide] = characterRange(morphology, 'sterileFlower.widthM');
    for (let v = 0; v < lacecap.variants; v++) {
      const florets = groupBy(vertices(lacecap.make(v, 1)).filter((x) => x.t <= -3), (x) => x.pivot);
      for (const [, vs] of florets) {
        const across = span(vs.map((x) => x.p)) * headM;
        expect(across).toBeGreaterThan(narrow);
        expect(across).toBeLessThan(wide);
      }
    }
  });

  it('draws inflorescence.fertileFlowersDrawn fertile flowers at its finest, each a tuft of 15 to 20 stamens 3 to 5 mm long', () => {
    const drawn = characterNumber(morphology, 'inflorescence.fertileFlowersDrawn');
    const [fewest, most] = characterRange(morphology, 'fertileFlower.stamenCount');
    const [, longest] = characterRange(morphology, 'fertileFlower.stamenLengthM');
    const cupM = mid(characterRange(morphology, 'fertileFlower.calyxTubeLengthM'));
    for (let v = 0; v < lacecap.variants; v++) {
      // the fertile flowers are the head's parts: one pivot, where it stands, for each
      const flowers = groupBy(vertices(lacecap.make(v, 0)).filter((x) => x.t >= 0), (x) => x.pivot);
      expect(flowers.size, `variant ${v}`).toBe(drawn);
      for (const [pivot, vs] of flowers) {
        // a stamen is a strip of four vertices and an anther of four
        const stamens = vs.length / 8;
        expect(stamens, pivot).toBeGreaterThanOrEqual(fewest);
        expect(stamens, pivot).toBeLessThanOrEqual(most);
        const [x, y, z] = pivot.split(',').map(Number) as [number, number, number];
        const reach = Math.max(...vs.map((s) => s.p.distanceTo(new THREE.Vector3(x, y, z)))) * headM;
        // from the base of the flower: its cup, the stamen, the anther at the end of it. Flowers differ a little in size
        expect(reach).toBeGreaterThan(0.003);
        expect(reach).toBeLessThan((cupM + longest + 0.001) * 1.15);
      }
      // and the same flowers, more plainly, at the next level
      expect(groupBy(vertices(lacecap.make(v, 1)).filter((x) => x.t >= 0), (x) => x.pivot).size).toBe(drawn);
    }
  });

  it('opens from the edge of the head inwards, as inflorescence.openingOrder says', () => {
    expect(characterText(morphology, 'inflorescence.openingOrder')).toContain('edge');
    const g = lacecap.make(1, 1);
    g.computeBoundingSphere();
    const flowers = [...groupBy(vertices(g).filter((x) => x.t >= 0), (x) => x.pivot).values()].map((vs) => vs[0]!);
    // the middle of the head: the middle of its fertile flowers
    const centre = flowers.reduce((s, f) => s.add(f.p), new THREE.Vector3()).multiplyScalar(1 / flowers.length);
    const byDistance = [...flowers].sort((a, b) => a.p.distanceTo(centre) - b.p.distanceTo(centre));
    const third = Math.floor(byDistance.length / 3);
    const mean = (fs: typeof flowers) => fs.reduce((s, f) => s + f.t, 0) / fs.length;
    expect(mean(byDistance.slice(-third))).toBeLessThan(mean(byDistance.slice(0, third)) - 0.25);
  });

  // TAXON_LOOKS.md section 4: "whatever outlasts the petals must be axis ... That is how ... a hydrangea [keeps] its rays."
  it('keeps its sterile flowers, its stalk and its green cups when the fertile flowers have dropped their stamens', () => {
    for (let lod = 0; lod < lacecap.lods; lod++) {
      const vs = vertices(lacecap.make(0, lod));
      expect(vs.some((x) => x.t <= -3), `level ${lod}: sepals are axis`).toBe(true);
      expect(vs.some((x) => x.t >= 0), `level ${lod}: fertile flowers are parts`).toBe(true);
      expect(vs.some((x) => x.t < 0 && x.t > -3), `level ${lod}: the stalk is axis`).toBe(true);
    }
  });
});

describe('the dry head and the rootlets', () => {
  it('builds the dry head to the same width as the flowerhead it was, standing on the same stalk', () => {
    expect(dryHead.authoredSize).toBe(lacecap.authoredSize);
    expect(dryHead.poise).toBe(lacecap.poise);
    expect(known(model, 'fruit.lengthM')).toEqual(param(model, 'organs.racemeLengthM'));
    expect(model.names.fruitHeld).toBe(model.names.flowerHeld);
    for (let v = 0; v < dryHead.variants; v++) {
      const g = dryHead.make(v, 0);
      g.computeBoundingBox();
      const size = g.boundingBox!.getSize(new THREE.Vector3());
      expect(Math.max(size.x, size.z)).toBeGreaterThan(0.7);
      expect(Math.max(size.x, size.z)).toBeLessThan(1.1);
    }
  });

  // render/contract.ts, RenderAppendage.direction: "the patch lies on that surface, spreading to either side of the stem"
  it('spreads its rootlets over the surface the stem lies on, all round, one unit long', () => {
    for (let v = 0; v < rootlets.variants; v++) {
      const g = rootlets.make(v, 0);
      g.computeBoundingBox();
      const { min, max } = g.boundingBox!;
      // +Z is into the timber: across it the patch reaches about a rootlet's length every way
      for (const reach of [-min.x, max.x, -min.y, max.y]) {
        expect(reach).toBeGreaterThan(0.5);
        expect(reach).toBeLessThan(1.15);
      }
      // and most of it lies on the timber, not in it
      const pos = g.getAttribute('position');
      let onSurface = 0;
      for (let i = 0; i < pos.count; i++) if (pos.getZ(i) < 0.05) onSurface++;
      expect(onSurface / pos.count).toBeGreaterThan(0.8);
    }
  });
});

// TAXON_LOOKS.md section 6, "Levels of detail and triangle budgets".
describe('every organ model of the climbing hydrangea', () => {
  it('builds at every level of detail, finite, within the budget it states and the ceiling for its kind', () => {
    const all = assetsOf(look);
    expect(all.map((a) => a.kind).sort()).toEqual(['appendage', 'flower', 'fruit', 'leaf']);
    for (const { kind, asset } of all) {
      expect(asset.key.startsWith(`${ID}/`)).toBe(true);
      expect(asset.budget).toHaveLength(asset.lods);
      for (let lod = 0; lod < asset.lods; lod++) {
        expect(asset.budget[lod]!, `${asset.key} level ${lod}`).toBeLessThanOrEqual(ceilingFor(kind, lod, asset.lods));
        for (let v = 0; v < asset.variants; v++) {
          const g = asset.make(v, lod);
          const count = triangles(g);
          expect(count, `${asset.key} ${v}/${lod}`).toBeGreaterThan(8);
          expect(count, `${asset.key} ${v}/${lod}`).toBeLessThanOrEqual(asset.budget[lod]!);
          // and not so far under it that the budget says nothing
          if (lod === 0) expect(count, `${asset.key} ${v}/${lod}`).toBeGreaterThan(asset.budget[lod]! * 0.6);
          for (const name of ['position', 'normal']) {
            const a = g.getAttribute(name).array;
            let bad = -1;
            for (let i = 0; i < a.length && bad < 0; i++) if (!Number.isFinite(a[i])) bad = i;
            expect(bad, `${asset.key} ${v}/${lod} ${name}`).toBe(-1);
          }
        }
      }
    }
  });

  it('is the plant\'s own: the look is not the stand-in, and borrows no other taxon\'s module', () => {
    expect(look.provisional).toBe(false);
    const source = readFileSync(fileURLToPath(new URL(`../../src/plant/taxa/${ID}.ts`, import.meta.url)), 'utf8');
    expect(source).not.toMatch(/from '\.\/[a-z-]+\.ts'/);
    expect(source).toContain(`species/${ID}/morphology.json`);
  });
});

// ============================================================================================================
// A plant grown by the engine on the specimen frame: what is on it, and when. Every question is put to the
// core's render/presence.ts; none is answered from the calendar here.
// ============================================================================================================
describe('a climbing hydrangea grown for ten years on the specimen frame', () => {
  const YEARS = 10;
  const frame = readBower(file('examples/specimen-frame.bower.json'), 'examples/specimen-frame.bower.json');
  const taxa: Growable = new Map([[ID, { profile, model }]]);
  const { sim } = growPlanting({ bower: frame.bower, plan: specimenPlan(ID), viewpoints: frame.viewpoints }, taxa, 'trained', YEARS);
  const data = toRenderData(sim);
  const cal = new Calendar(data.start);
  const LAST = 2027 + YEARS - 1;
  const on = (iso: string) => cal.dayOf(iso);
  const leavesOn = (iso: string) => {
    const seasons = seasonsOf(data, Number(iso.slice(0, 4)));
    return data.leaves.filter((l) => leafState(l, seasons.get(l.plantId), on(iso)).present).length;
  };
  const openOn = (iso: string) => data.flowers.filter((f) => flowerState(f, on(iso)).phase === 'open').length;
  const headsOn = (iso: string) => data.fruits.filter((f) => fruitState(f, on(iso)).phase !== 'absent');
  const stems = new Map(data.stems.map((s) => [s.id, s]));
  const month = (m: number) => String(m).padStart(2, '0');

  // SPECIES_PROFILE.md: "yellow autumn foliage, leafless in winter"; taxon.json leafHabit: deciduous.
  it('is in leaf from April to October and bare from December to March', () => {
    for (const m of [4, 5, 6, 7, 8, 9, 10]) expect(leavesOn(`${LAST}-${month(m)}-20`), `month ${m}`).toBeGreaterThan(500);
    for (const m of [12, 1, 2, 3]) expect(leavesOn(`${LAST}-${month(m)}-15`), `month ${m}`).toBe(0);
    // and the leaves it has in October have turned or are turning by its end
    const seasons = seasonsOf(data, LAST);
    const late = data.leaves.map((l) => leafState(l, seasons.get(l.plantId), on(`${LAST}-11-08`))).filter((s) => s.present);
    expect(late.length).toBeGreaterThan(100);
    expect(late.filter((s) => s.autumn > 0.5).length).toBeGreaterThan(late.length * 0.6);
  });

  // taxon.json flowering.monthsUK: June (RHS "early summer"); Trees and Shrubs Online: June to July.
  // CLAUDE.md: "A flowering month is an envelope, not a trigger."
  it('has flowerheads open in June, some still in July, and in no other month', () => {
    expect(profile.flowering.monthsUK.value).toContain(6);
    expect(openOn(`${LAST}-06-20`)).toBeGreaterThan(10);
    for (const f of data.flowers) {
      expect([6]).toContain(cal.dateOf(f.openDay).month);
      expect([6, 7]).toContain(cal.dateOf(f.spentDay - 1).month);
    }
    for (const m of [1, 2, 3, 4, 5, 8, 9, 10, 11, 12]) for (let y = 2027; y <= LAST; y++) expect(openOn(`${y}-${month(m)}-15`), `${y}-${m}`).toBe(0);
    // in bud for a month before: the head shows with the young leaves, well before it opens
    expect(data.flowers.filter((f) => flowerState(f, on(`${LAST}-05-25`)).phase === 'in_bud').length).toBeGreaterThan(10);
  });

  // RHS growing guide: "young plants often take three to five years to flower"; flowering.competenceYears.
  it('does not flower before its fifth summer, and flowers more as it ages', () => {
    const competence = param(model, 'flowering.competenceYears');
    expect(Math.min(...data.flowers.map((f) => f.year))).toBeGreaterThanOrEqual(2027 + competence);
    const opened = (y: number) => sim.summaries.find((s) => s.year === y)!.flowersOpened;
    expect(opened(2027 + competence - 1)).toBe(0);
    expect(opened(LAST)).toBeGreaterThan(opened(LAST - 3));
    expect(opened(LAST)).toBeGreaterThan(20);
  });

  // CONSTRAINTS_AND_PHENOLOGY.md: "Climbing hydrangea: flowering occurs on shoots formed the previous year".
  // morphology.json inflorescence.type: terminal. Trees and Shrubs Online: the side shoots carry the flowers.
  it('carries every flowerhead at the end of a side shoot that was there the year before, facing the way the shoot runs', () => {
    expect(data.flowers.length).toBeGreaterThan(50);
    for (const f of data.flowers) {
      const stem = stems.get(f.stemId)!;
      expect(stem.role).toBe('side_shoot');
      expect(cal.dateOf(stem.bornDay[0]!).year).toBeLessThan(f.year);
      const n = stem.bornDay.length;
      // the render data gives a stem's points to a hundredth of a millimetre
      for (let c = 0; c < 3; c++) expect(f.position[c]!).toBeCloseTo(stem.contact[3 * n - 3 + c]!, 4);
      // its size is a width: the growth model's measure of this plant's head
      expect(f.lengthM).toBeGreaterThanOrEqual(param(model, 'organs.racemeLengthM')[0]);
      expect(f.lengthM).toBeLessThanOrEqual(param(model, 'organs.racemeLengthM')[1]);
      const along = new THREE.Vector3(stem.contact[3 * n - 3]! - stem.contact[3 * n - 6]!, stem.contact[3 * n - 2]! - stem.contact[3 * n - 5]!, stem.contact[3 * n - 1]! - stem.contact[3 * n - 4]!).normalize();
      expect(new THREE.Vector3(...f.direction!).dot(along)).toBeGreaterThan(0.99);
    }
  });

  // morphology.json inflorescence.afterFlowering: "ages to brown and stays on the plant through winter".
  it('keeps its dry heads from July through the winter, green at first and brown by November, and has lost them by May', () => {
    const y = LAST - 1;
    expect(headsOn(`${y}-06-01`).filter((f) => f.year === y)).toHaveLength(0);
    const august = headsOn(`${y}-08-01`).filter((f) => f.year === y);
    expect(august.length).toBeGreaterThan(10);
    // a dry head follows a flowerhead that went over on the plant, where that flowerhead stood, and is full size at once
    for (const f of august) {
      expect(data.flowers.some((h) => h.spentDay === f.swell[0] && h.position.every((c, i) => Math.abs(c - f.position[i]!) < 1e-4))).toBe(true);
      expect(fruitState(f, on(`${y}-08-01`)).size).toBe(1);
    }
    expect(august.filter((f) => fruitState(f, on(`${y}-08-01`)).ripeness === 0).length).toBeGreaterThan(august.length * 0.5);
    const november = headsOn(`${y}-11-15`).filter((f) => f.year === y);
    expect(november).toHaveLength(august.length);
    for (const f of november) expect(fruitState(f, on(`${y}-11-15`)).phase).toBe('ripe');
    // still there in the middle of winter, on the bare plant
    expect(headsOn(`${y + 1}-01-15`).filter((f) => f.year === y)).toHaveLength(august.length);
    expect(leavesOn(`${y + 1}-01-15`)).toBe(0);
    expect(headsOn(`${y + 1}-05-15`).filter((f) => f.year === y)).toHaveLength(0);
  });

  // Trees and Shrubs Online: "only the extension shoots bear aerial roots; the side shoots are non-rooting".
  it('clings by rootlets along its framework stems and has none on its side shoots', () => {
    expect(data.appendages.length).toBeGreaterThan(500);
    for (const a of data.appendages) {
      expect(a.kind).toBe('aerial_roots');
      expect(a.holding).toBe(true);
      expect(['leader', 'lateral']).toContain(stems.get(a.stemId)!.role);
    }
    expect(data.appendages.some((a) => appendagePresent(a, on(`${LAST}-01-15`)))).toBe(true);
    const [short, long] = known(model, 'appendages.aerialRootLengthM')!;
    expect([short, long]).toEqual(characterRange(morphology, 'holdfast.rootletLengthM'));
  });

  // Trees and Shrubs Online: the side shoots "carry most of the flowers and leaves".
  it('carries most of its leaves on its side shoots, in opposite pairs', () => {
    const seasons = seasonsOf(data, LAST);
    const out = data.leaves.filter((l) => leafState(l, seasons.get(l.plantId), on(`${LAST}-07-01`)).present);
    const onSide = out.filter((l) => stems.get(l.stemId)!.role === 'side_shoot');
    expect(onSide.length).toBeGreaterThan(out.length * 0.6);
    // two leaves to a node
    const nodes = groupBy(out, (l) => `${l.stemId}|${l.position.join(',')}`);
    for (const [, pair] of nodes) expect(pair).toHaveLength(2);
    // each a blade and its stalk together, within what the flora gives
    const [short, long] = param(model, 'organs.leafLengthM');
    for (const l of out) {
      expect(l.lengthM).toBeGreaterThanOrEqual(short);
      expect(l.lengthM).toBeLessThanOrEqual(long);
    }
  });

  // RHS: "slow growing to start with, then becomes a vigorous climber".
  it('is slow for its first years and then covers the frame', () => {
    const at = (y: number) => sim.summaries.find((s) => s.year === y)!;
    expect(at(2029).highestM).toBeLessThan(1.5);
    expect(at(2029).frameworkM).toBeLessThan(4);
    expect(at(LAST).highestM).toBeGreaterThan(2.8);
    expect(at(LAST).frameworkM).toBeGreaterThan(10 * at(2029).frameworkM);
    expect(at(LAST).runsTied).toBeLessThan(at(LAST).runsSelf / 5);
  });

  // TAXON_LOOKS.md section 9: "A portrait whose caption says 'provisional look' is not finished."
  it('is drawn whole: nothing in the run is without a model, and every organ the core says is there is shown', () => {
    const view = new PlantView(data, materials());
    expect(view.provisionalLooks).toEqual([]);
    expect(view.withoutFlowers).toEqual([]);
    expect(view.withoutFruit).toEqual([]);
    expect(view.withoutAppendages).toEqual([]);
    expect(view.unknownForms).toEqual([]);
    const day = on(`${LAST}-06-22`);
    view.update(camera(), day, 1);
    const stats = view.stats();
    expect(stats.leaves).toBe(leavesOn(`${LAST}-06-22`));
    expect(stats.flowers).toBe(openOn(`${LAST}-06-22`));
    expect(stats.appendages).toBe(data.appendages.filter((a) => appendagePresent(a, day)).length);
    view.update(camera(), on(`${LAST}-01-15`), 1);
    expect(view.stats().leaves).toBe(0);
    expect(view.stats().fruit).toBe(headsOn(`${LAST}-01-15`).length);
    view.dispose();
  });
});
