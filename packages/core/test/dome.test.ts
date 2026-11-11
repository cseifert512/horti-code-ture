import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadGrowable } from '../src/node/load-taxa.ts';
import { Simulation } from '../src/sim/engine.ts';
import { withParam } from '../src/sim/model.ts';
import { designReport, formatDesignReport } from '../src/sim/report.ts';
import { type Growable, wisteriaOnHemisphere } from '../src/sim/scenarios.ts';

const speciesDir = fileURLToPath(new URL('../../../species', import.meta.url));
const taxa = loadGrowable(speciesDir);
const END = '2038-12-31';
const grow = (t: Growable) => new Simulation(wisteriaOnHemisphere({ taxa: t, care: 'trained', years: 12 })).runUntil(END);

const sim = grow(taxa);
const report = designReport(sim);

// KEY.md section 4: "Height is not enough". DEVELOPMENT_GUIDE.md stage 5 exit check.
describe('three wisterias on the 15 m hemisphere, twelve years on', () => {
  it('have not reached the crown, though it is only 7.5 m up', () => {
    expect(report.structure.crownHeightM).toBeCloseTo(7.5, 6);
    for (const p of report.plants) {
      expect(p.highestM, p.plantId).toBeLessThan(7);
      expect(p.highestM, p.plantId).toBeGreaterThan(5);
      expect(report.alerts.some((a) => a.kind === 'crown_not_reached' && a.plantId === p.plantId), p.plantId).toBe(true);
    }
  });

  it('hold about half of the routes and leave the rest bare', () => {
    expect(report.routes.heldShare).toBeGreaterThan(0.3);
    expect(report.routes.heldShare).toBeLessThan(0.7);
    expect(report.routes.freeM).toBeGreaterThan(150);
  });

  it('twine the glulam meridians and the cables unaided, and are tied along the timber rings', () => {
    const { graph } = sim.scenario.bower;
    const seen = { meridian: 0, ring: 0, cable: 0 };
    for (const a of sim.axes.values()) {
      for (const r of a.runs) {
        const edge = graph.edges.get(r.edgeId)!;
        if (edge.kind === 'cable') {
          expect(r.mode).toBe('twine');
          seen.cable++;
        } else if (edge.host.id.startsWith('rib.')) {
          expect(r.mode).toBe('twine');
          expect(r.by).toBe('plant');
          seen.meridian++;
        } else {
          expect(r.mode).toBe('along');
          expect(r.by).not.toBe('plant');
          seen.ring++;
        }
      }
    }
    expect(seen.meridian).toBeGreaterThan(20);
    expect(seen.ring).toBeGreaterThan(5);
    expect(seen.cable).toBeGreaterThan(20);
  });

  it('show their progress at one, three, five and ten years', () => {
    for (const p of report.plants) {
      const mine = report.milestones.filter((m) => m.plantId === p.plantId);
      expect(mine.map((m) => m.yearsAfterPlanting)).toEqual([1, 3, 5, 10, 12]);
      for (let i = 1; i < mine.length; i++) expect(mine[i]!.frameworkM).toBeGreaterThanOrEqual(mine[i - 1]!.frameworkM);
      // a plant that will end above 6 m is under 3 m after its first year: route takes time as well as length
      expect(mine[0]!.highestM).toBeLessThan(3);
      expect(mine[1]!.highestM).toBeLessThan(mine[4]!.highestM);
      expect(mine[0]!.flowersOpened).toBe(0);
      expect(mine[4]!.flowersOpened).toBeGreaterThan(100);
    }
    expect(formatDesignReport(report)).toContain('OVER THE YEARS');
  });

  it('leave the timber of the dome almost wholly legible from inside, even in leaf', () => {
    for (const m of report.months) expect(m.views.find((v) => v.viewpointId === 'inside')!.timberVisible).toBeGreaterThan(0.6);
  });
});

// PROJECT_CONTEXT.md section 10: unknowns are explored by varying them, in the open.
describe('asking what if a leader could be trained the whole meridian', () => {
  const w = taxa.get('wisteria-sinensis')!;
  const longer = withParam(w.model, 'architecture.leaderLengthM', [14.5, 15.5], 'can a leader be led 11.78 m to the crown, and how long does it take?');
  const variedSim = grow(new Map([['wisteria-sinensis', { profile: w.profile, model: longer }]]));
  const varied = designReport(variedSim);

  it('reaches the crown, years later than its height alone would suggest', () => {
    const reached = variedSim.summaries.filter((s) => s.highestM > 7.3).map((s) => s.year);
    expect(reached.length).toBeGreaterThan(0);
    const first = Math.min(...reached);
    expect(first).toBeGreaterThanOrEqual(2031); // not before the fifth year
    expect(first).toBeLessThanOrEqual(2036);
    expect(varied.plants.some((p) => p.highestM > 7.3)).toBe(true);
  });

  it('says in the report that an assumption was varied, and why', () => {
    expect(varied.variations).toEqual([{ taxonId: 'wisteria-sinensis', parameter: 'architecture.leaderLengthM', value: [14.5, 15.5], basis: expect.stringContaining('can a leader be led 11.78 m') }]);
    expect(report.variations).toEqual([]);
    expect(formatDesignReport(varied)).toContain('varied: wisteria-sinensis architecture.leaderLengthM');
    expect(longer.params['architecture.leaderLengthM'].status).toBe('provisional_design_assumption');
    expect(longer.params['architecture.leaderLengthM'].basis).toContain('was [7,8.6]');
    // the library's own model is untouched
    expect(w.model.params['architecture.leaderLengthM'].value).toEqual([7, 8.6]);
  });
});
