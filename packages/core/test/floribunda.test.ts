import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadGrowable } from '../src/node/load-taxa.ts';
import { Simulation } from '../src/sim/engine.ts';
import { designReport } from '../src/sim/report.ts';
import { wisteriaOnVault } from '../src/sim/scenarios.ts';
import { type StemPath, turnsOf } from '../src/sim/stem-path.ts';
import type { Axis } from '../src/sim/types.ts';

const speciesDir = fileURLToPath(new URL('../../../species', import.meta.url));
const taxa = loadGrowable(speciesDir);
const END = '2034-12-31';
const chinese = new Simulation(wisteriaOnVault({ taxa, care: 'trained', years: 8 })).runUntil(END);
const japanese = new Simulation(wisteriaOnVault({ taxa, care: 'trained', years: 8, wisteria: 'wisteria-floribunda-macrobotrys' })).runUntil(END);

const pathOf = (a: Axis, from: number, to: number): StemPath => ({ points: a.contact.slice(from, to + 1), away: a.away.slice(from, to + 1), cumulative: a.lengthAt.slice(from, to + 1) });
/** Turns made on each twined run the shoot has finished: the one it is still on may be part of the way round. */
const twists = (sim: Simulation) =>
  [...sim.axes.values()].flatMap((a) => a.runs.filter((r, i) => i < a.runs.length - 1 && r.mode === 'twine' && r.status !== 'detached' && r.lastPoint - r.firstPoint > 12).map((r) => turnsOf(pathOf(a, r.firstPoint, r.lastPoint))));

// DEVELOPMENT_GUIDE.md, first species after W. sinensis: "Reuse wisteria topology but change racemes,
// flower timing, direction convention, growth envelope". KEY.md: "free vertical hanging clearance for racemes".
describe('Japanese wisteria beside Chinese wisteria, on the same vault with the same care', () => {
  it('twines the other way', () => {
    const c = twists(chinese);
    const j = twists(japanese);
    expect(c.length).toBeGreaterThan(30);
    expect(j.length).toBeGreaterThan(30);
    for (const t of c) expect(t).toBeGreaterThan(0.5);
    for (const t of j) expect(t).toBeLessThan(-0.5);
  });

  // Handedness mirrors the coils and is given nothing else to change. On a rib that leans with the flare of
  // the vault a coil of one hand takes a millimetre or two more stem than its mirror image, so a shoot can
  // reach a node a day apart in the two runs and turn a different way there. The frameworks are the same
  // while the plants are young and afterwards differ as two seeds of one plant do.
  it('builds the same framework at first, and one of the same size after', () => {
    for (const id of ['wisteria.0', 'wisteria.1']) {
      const of = (sim: Simulation, year: number) => sim.summaries.find((s) => s.plantId === id && s.year === year)!;
      for (const year of [2027, 2028, 2029]) {
        expect(of(japanese, year).frameworkM, `${id} ${year}`).toBeCloseTo(of(chinese, year).frameworkM, 1);
        // the framework's stretches: what a shoot of the year took hold of from the air is not framework, and the two
        // plants' shoots, with leaves of different weight, do not come near the same laths
        const stretches = (sim: Simulation) => of(sim, year).runsSelf + of(sim, year).runsTied - of(sim, year).runsFromAir;
        expect(stretches(japanese), `${id} ${year}`).toBe(stretches(chinese));
      }
      const ratio = of(japanese, 2034).frameworkM / of(chinese, 2034).frameworkM;
      expect(ratio, id).toBeGreaterThan(0.8);
      expect(ratio, id).toBeLessThan(1.25);
    }
  });

  it('hangs racemes two to four times as long', () => {
    for (const b of chinese.buds) expect(b.lengthM).toBeLessThanOrEqual(0.34);
    for (const b of japanese.buds) {
      expect(b.lengthM).toBeGreaterThanOrEqual(0.6);
      expect(b.lengthM).toBeLessThanOrEqual(1.1);
    }
  });

  it('flowers about a fortnight later', () => {
    const firstOpen = (sim: Simulation) => Math.min(...sim.buds.filter((b) => b.openDay !== null && b.floweringYear === 2034).map((b) => sim.calendar.dateOf(b.openDay!).dayOfYear));
    expect(firstOpen(chinese)).toBeGreaterThanOrEqual(121);
    expect(firstOpen(chinese)).toBeLessThan(135);
    expect(firstOpen(japanese)).toBeGreaterThanOrEqual(135);
  });

  it('hangs into the headroom over the walk, where the Chinese wisteria all but clears it', () => {
    const low = (sim: Simulation) => designReport(sim).alerts.filter((a) => a.kind === 'headroom').reduce((s, a) => s + a.count, 0);
    expect(low(chinese)).toBeLessThan(10);
    expect(low(japanese)).toBeGreaterThan(low(chinese) * 5);
    expect(low(japanese)).toBeGreaterThan(50);
  });

  it('runs on a model that says what it borrows from its sister species, and has racemes of a metre', () => {
    const { model } = taxa.get('wisteria-floribunda-macrobotrys')!;
    const copied = Object.values(model.params).filter((p) => (p.basis ?? '').startsWith('Copied from the Wisteria sinensis model'));
    if (copied.length) expect(model.statement).toContain('thinner than the wisteria model');
    expect(model.params['organs.racemeLengthM'].value![1]).toBeGreaterThanOrEqual(1);
  });
});
