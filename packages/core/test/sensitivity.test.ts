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
      expect(leaf[1]!, vp.id).toBeGreaterThan(leaf[0]! * 1.3);
      expect(leaf[2]!, vp.id).toBeGreaterThan(leaf[1]! * 1.2);
      const timber = ['as_modelled', 'leaf_area_x2', 'leaf_area_x4'].map((id) => at(row(id).summerTimberVisible, vp.id));
      expect(timber[1]!, vp.id).toBeLessThanOrEqual(timber[0]!);
      expect(timber[2]!, vp.id).toBeLessThan(timber[0]!);
    }
  });

  it('changes nothing but the leaves when only their size is varied', () => {
    for (const id of ['leaf_area_x2', 'leaf_area_x4']) {
      expect(row(id).flowersOpened, id).toBe(row('as_modelled').flowersOpened);
      expect(row(id).routeHeldShare, id).toBe(row('as_modelled').routeHeldShare);
    }
  });

  it('gives more flowers with more side shoots, on the same framework', () => {
    expect(row('side_shoots_x3').flowersOpened).toBeGreaterThan(row('as_modelled').flowersOpened * 1.1);
    expect(row('side_shoots_x3').routeHeldShare).toBe(row('as_modelled').routeHeldShare);
    const plain = new Simulation(make(taxa)).runUntil(END);
    const more = new Simulation(make(sideShoots(taxa, 3))).runUntil(END);
    for (const s of plain.summaries.filter((x) => x.year === 2032)) {
      expect(more.summaries.find((x) => x.year === 2032 && x.plantId === s.plantId)!.frameworkM, s.plantId).toBe(s.frameworkM);
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
  it('is still missed from every viewpoint with four times the leaf and three times the shoots', () => {
    const generous = STANDARD_VARIATIONS.filter((v) => v.id === 'both');
    const s = sensitivity((t) => referencePalette({ taxa: t }), taxa, '2038-12-31', generous);
    const [low] = WINTER_EVERGREEN_COVER.value!;
    for (const v of s.rows[0]!.winterEvergreen) {
      expect(v.value, v.viewpointId).toBeLessThan(low / 2);
      expect(v.value, v.viewpointId).toBeGreaterThan(0);
    }
  });
});
