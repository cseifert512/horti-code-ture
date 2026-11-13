import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadGrowable } from '../src/node/load-taxa.ts';
import { Simulation } from '../src/sim/engine.ts';
import { param } from '../src/sim/model.ts';
import { designReport } from '../src/sim/report.ts';
import { type Growable, mixedOnVault, referencePalette } from '../src/sim/scenarios.ts';
import { STANDARD_VARIATIONS, formatSensitivity, leafArea, sensitivity, sideShoots } from '../src/sim/sensitivity.ts';
import { WINTER_EVERGREEN_COVER } from '../src/targets.ts';

const taxa = loadGrowable(fileURLToPath(new URL('../../../species', import.meta.url)));
const make = (t: Growable) => mixedOnVault({ taxa: t, care: 'trained', years: 6 });
const END = '2032-12-31';
const sweep = sensitivity(make, taxa, END);
const row = (id: string) => sweep.rows.find((r) => r.id === id)!;
const at = (list: { viewpointId: string; value: number }[], vp: string) => list.find((x) => x.viewpointId === vp)!.value;

// DEVELOPMENT_GUIDE.md stage 7: "Add credible intervals and scenario uncertainty". PROJECT_CONTEXT.md:
// plausibility before impressiveness: a reading that rests on an unmeasured number has to say how hard.
describe('how far the readings move when unmeasured densities are multiplied', () => {
  it('starts from the run as it is modelled', () => {
    const plain = designReport(new Simulation(make(taxa)).runUntil(END));
    expect(sweep.scenario).toBe(plain.scenario);
    expect(sweep.year).toBe(2032);
    const january = plain.months.find((m) => m.month === 1)!;
    for (const v of january.views) expect(at(row('as_modelled').winterEvergreen, v.viewpointId)).toBe(v.evergreenFoliage);
    expect(row('as_modelled').routeHeldShare).toBe(plain.routes.heldShare);
    expect(sweep.rows.map((r) => r.id)).toEqual(STANDARD_VARIATIONS.map((v) => v.id));
  });

  it('shows more leaf hiding more timber, step by step', () => {
    for (const vp of sweep.viewpoints) {
      const leaf = ['as_modelled', 'leaf_area_x2', 'leaf_area_x4'].map((id) => at(row(id).summerFoliage, vp.id));
      // more each time, and by less each time as leaves come to hide one another
      expect(leaf[1]!, vp.id).toBeGreaterThan(leaf[0]! * 1.1);
      expect(leaf[2]!, vp.id).toBeGreaterThan(leaf[1]! * 1.05);
      const timber = ['as_modelled', 'leaf_area_x2', 'leaf_area_x4'].map((id) => at(row(id).summerTimberVisible, vp.id));
      expect(timber[1]!, vp.id).toBeLessThanOrEqual(timber[0]!);
      expect(timber[2]!, vp.id).toBeLessThan(timber[0]!);
    }
  });

  // Larger leaves reach the rest of the run in two ways. They shade a neighbour more (sim/light.ts). And they are
  // heavier, so the shoots that carry them in the air droop sooner, come near different members and bear a few leaf
  // nodes more or fewer (sim/free-shoot.ts). The route held moves by a stretch or two.
  //
  // Until 13 November 2026 the framework did not move at all, and the flowers by a few in a hundred (at most 6%). With
  // the winter clematis and the honeysuckle modelled as the leafy evergreens they are, the shade moves more: the winter
  // clematis, a plant that asks for sun, has its season's growth cut by light from 0.73 to 0.67 of what it would make when
  // the leaves are twice the size, and light read through the larger leaves turns free shoots on to other members. On
  // 2032 the flowers are 10.6% fewer with twice the leaf and 18.2% fewer with four times (mostly the winter clematis's:
  // 581 to 443 and 373). The winter clematis's own framework falls from 48.0 m to 44.4 m and 37.3 m; the others' move by
  // up to 6.3% either way (the first wisteria, 93.1 m to 87.3 m). Without light acting, larger leaves still move no
  // framework and no height by a millimetre: the whole of that is the light.
  it('changes the leaves, and through their shade and their weight the flowers and, through light, the framework, when only their size is varied', () => {
    const plain = new Simulation(make(taxa)).runUntil(END);
    for (const [id, factor] of [
      ['leaf_area_x2', 2],
      ['leaf_area_x4', 4],
    ] as const) {
      expect(Math.abs(row(id).flowersOpened - row('as_modelled').flowersOpened), id).toBeLessThanOrEqual(0.2 * row('as_modelled').flowersOpened);
      // larger leaves shade more, so they never bring more flowers
      expect(row(id).flowersOpened, id).toBeLessThan(row('as_modelled').flowersOpened);
      expect(Math.abs(row(id).routeHeldShare - row('as_modelled').routeHeldShare), id).toBeLessThan(0.02);
      const larger = new Simulation(make(leafArea(taxa, factor))).runUntil(END);
      for (const s of plain.summaries.filter((x) => x.year === 2032)) {
        const other = larger.summaries.find((x) => x.year === 2032 && x.plantId === s.plantId)!;
        // the shaded plant that asks for sun makes less the larger the leaves, by up to a quarter; the rest move little
        if (s.plantId === 'winter-clematis') {
          expect(other.frameworkM, id).toBeLessThan(s.frameworkM);
          expect(other.frameworkM, id).toBeGreaterThan(0.75 * s.frameworkM);
        } else expect(Math.abs(other.frameworkM - s.frameworkM), `${id} ${s.plantId}`).toBeLessThan(0.07 * s.frameworkM);
      }
    }
    // with light left out, the framework and the height of every plant are the same to the millimetre
    const dark = (t: Growable) => new Simulation({ ...make(t), lightResponse: false }).runUntil(END);
    const plainDark = dark(taxa);
    const largerDark = dark(leafArea(taxa, 2));
    for (const s of plainDark.summaries.filter((x) => x.year === 2032)) {
      const other = largerDark.summaries.find((x) => x.year === 2032 && x.plantId === s.plantId)!;
      expect(other.frameworkM, s.plantId).toBe(s.frameworkM);
      expect(other.highestM, s.plantId).toBe(s.highestM);
    }
  });

  // A plant whose side shoots already stand at most of its nodes has little room for more, so the gain may be small.
  it('gives no fewer flowers with more side shoots, on the same framework', () => {
    expect(row('side_shoots_x3').flowersOpened).toBeGreaterThanOrEqual(row('as_modelled').flowersOpened);
    // three times the shoots of the year come near three times as often to something they can take hold of
    // (SIMULATION_KEY.md section 4.3, "Unsupported shoots", (f)): the route held can only rise by that, and the
    // framework, below, is the same to the metre
    expect(row('side_shoots_x3').routeHeldShare).toBeGreaterThanOrEqual(row('as_modelled').routeHeldShare);
    expect(row('side_shoots_x3').routeHeldShare - row('as_modelled').routeHeldShare).toBeLessThan(0.05);
    // Until 13 November 2026 the framework was the same to the metre with light acting. The winter clematis now has side
    // shoots of its own, and three times as many of them shade its neighbours and turn their free shoots: the frameworks
    // move by up to 2.6% (the winter clematis, 48.0 m to 46.8 m; the first wisteria by 0.13 m). With light left out they
    // are the same to the millimetre, as before.
    const plain = new Simulation(make(taxa)).runUntil(END);
    const more = new Simulation(make(sideShoots(taxa, 3))).runUntil(END);
    for (const s of plain.summaries.filter((x) => x.year === 2032)) {
      expect(Math.abs(more.summaries.find((x) => x.year === 2032 && x.plantId === s.plantId)!.frameworkM - s.frameworkM), s.plantId).toBeLessThan(0.03 * s.frameworkM);
    }
    const dark = (t: Growable) => new Simulation({ ...make(t), lightResponse: false }).runUntil(END);
    const plainDark = dark(taxa);
    const moreDark = dark(sideShoots(taxa, 3));
    for (const s of plainDark.summaries.filter((x) => x.year === 2032)) {
      expect(moreDark.summaries.find((x) => x.year === 2032 && x.plantId === s.plantId)!.frameworkM, s.plantId).toBe(s.frameworkM);
    }
  });

  it('labels every varied number as a variation, never as the model', () => {
    const varied = leafArea(taxa, 4);
    for (const [id, t] of varied) {
      const [a, b] = param(taxa.get(id)!.model, 'organs.leafLengthM');
      expect(param(t.model, 'organs.leafLengthM'), id).toEqual([a * 2, b * 2]);
      expect(t.model.params['organs.leafLengthM'].basis, id).toContain('Varied for this scenario');
      expect(t.model.params['organs.leafLengthM'].status, id).toBe('provisional_design_assumption');
    }
    // the library itself is untouched
    expect(taxa.get('wisteria-sinensis')!.model.params['organs.leafLengthM'].basis).not.toContain('Varied');
    const report = designReport(new Simulation(make(varied)).runUntil('2028-12-31'));
    expect(report.variations.filter((v) => v.parameter === 'organs.leafLengthM').length).toBeGreaterThanOrEqual(4);
    expect(report.variations[0]!.basis).toContain('sensitivity: 4 times the leaf area');
  });

  it('prints one table for each viewpoint and says the multiples are not estimates', () => {
    const text = formatSensitivity(sweep);
    expect(text).toContain('These are multiples, not estimates: neither quantity has been measured.');
    for (const vp of sweep.viewpoints) expect(text).toContain(vp.label);
    for (const v of STANDARD_VARIATIONS) expect(text.split(v.label).length - 1, v.label).toBeGreaterThanOrEqual(sweep.viewpoints.length + 1);
  });
});

// KEY.md section 6: the 25-40% winter evergreen target.
describe('the winter evergreen target on the reference palette', () => {
  // Until 13 November 2026 this was "is still missed as seen from every viewpoint with four times the leaf and three
  // times the shoots". With the evergreens modelled as themselves, from the approach it is no longer missed: on
  // 15 January 2038 their leaf is 19.6% of that view as modelled and 50.2% with the generous densities, past the top of
  // the target. From inside (7.0%) and from the rim (17.5%) it is still missed. So the approach's miss rests on the
  // unmeasured leaf and shoot densities; the other two do not.
  it('is still missed from inside and from the rim with four times the leaf and three times the shoots, and met from the approach', () => {
    const generous = STANDARD_VARIATIONS.filter((v) => v.id === 'both');
    const s = sensitivity((t) => referencePalette({ taxa: t }), taxa, '2038-12-31', generous);
    const [low] = WINTER_EVERGREEN_COVER.value!;
    for (const v of s.rows[0]!.winterEvergreen) {
      if (v.viewpointId === 'approach') expect(v.value, v.viewpointId).toBeGreaterThan(low);
      else expect(v.value, v.viewpointId).toBeLessThan(low);
      expect(v.value, v.viewpointId).toBeGreaterThan(0);
    }
    // nor is a quarter of the timber hidden from inside, though the evergreens hold a quarter of the route
    expect(s.rows[0]!.winterRouteHeldByEvergreens).toBeGreaterThan(low);
  });

});
