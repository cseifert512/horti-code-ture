import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadGrowable } from '../src/node/load-taxa.ts';
import { flowerState } from '../src/render/presence.ts';
import { Simulation } from '../src/sim/engine.ts';
import { param } from '../src/sim/model.ts';
import { toRenderData } from '../src/sim/render-data.ts';
import { designReport } from '../src/sim/report.ts';
import { plantsOnHemisphere } from '../src/sim/scenarios.ts';
import type { GardenerEvent, Scenario } from '../src/sim/types.ts';

const speciesDir = fileURLToPath(new URL('../../../species', import.meta.url));
const taxa = loadGrowable(speciesDir);
const END = '2030-12-31';
const one = (care: 'trained' | 'untended', taxonId = 'thunbergia-alata'): Scenario => plantsOnHemisphere({ taxa, care, years: 4 }, [{ plantId: 'annual', taxonId }], 'One plant');
const run = (s: Scenario, until = END) => new Simulation(s).runUntil(until);
const year = (sim: Simulation, y: number) => sim.summaries.find((s) => s.plantId === 'annual' && s.year === y)!;
const doy = (sim: Simulation, day: number) => sim.calendar.dateOf(day).dayOfYear;
const stemsOf = (sim: Simulation, y: number) => [...sim.axes.values()].filter((a) => a.bornYear === y);

const tended = run(one('trained'));
const left = run(one('untended'));

// DEVELOPMENT_GUIDE.md stage 6: "annual Thunbergia replacement"; HORTICULTURAL_INTERVENTIONS.md, annual replant.
describe('black-eyed Susan, an annual outdoors in the UK', () => {
  it('is set out in late spring, not with the permanent planting in March', () => {
    expect(tended.events[0]!).toMatchObject({ type: 'plant', date: '2027-05-20' });
    expect(tended.events.filter((e) => e.type === 'annual_replant').map((e) => e.date)).toEqual(['2028-05-20', '2029-05-20', '2030-05-20']);
    for (const e of tended.events) expect(e.modelled, e.date).toBe(true);
  });

  // Until 13 November 2026 this asked for three stems: the stand-in's. The plant's own model now enters every branch the
  // seedling makes in its summer as a stem from the ground, since the engine cannot branch a stem in the year it is made:
  // 24 of them, chosen to clothe a column 0.6 m wide and 1.8 m high (its `architecture.trunkStemStartYears`, with the basis).
  // What is held is the same: each year's plant is the model's whole number of stems, and about two metres high.
  it('makes a plant of about two metres each summer, from the stems its model plants', () => {
    const planted = param(taxa.get('thunbergia-alata')!.model, 'architecture.trunkStemStartYears').length;
    expect(planted).toBe(24);
    for (const y of [2027, 2028, 2029, 2030]) {
      const stems = stemsOf(tended, y);
      expect(stems.filter((a) => a.role === 'leader'), String(y)).toHaveLength(planted);
      const top = Math.max(...stems.flatMap((a) => a.contact.map((p) => p.z)));
      expect(top, String(y)).toBeGreaterThan(1.2);
      expect(top, String(y)).toBeLessThan(2.6);
      for (const a of stems) expect(a.lengthAt.at(-1)!, a.id).toBeLessThanOrEqual(2.5 + 1e-6);
    }
  });

  it('is led up the glulam by a tie and takes the first cable by itself', () => {
    const { graph } = tended.scenario.bower;
    const runs = stemsOf(tended, 2029).flatMap((a) => a.runs);
    const onTimber = runs.filter((r) => graph.edges.get(r.edgeId)!.kind === 'timber');
    const onCable = runs.filter((r) => graph.edges.get(r.edgeId)!.kind === 'cable');
    expect(onTimber.length).toBeGreaterThan(0);
    expect(onCable.length).toBeGreaterThan(0);
    for (const r of onTimber) expect(r.by).not.toBe('plant');
    for (const r of onCable) expect(r).toMatchObject({ by: 'plant', mode: 'twine' });
  });

  it('flowers from July into October on growth that is still being made', () => {
    for (const y of [2027, 2028, 2029, 2030]) expect(year(tended, y).flowersOpened, String(y)).toBeGreaterThan(20);
    const buds = tended.buds.filter((b) => b.floweringYear === 2029);
    const opened = buds.map((b) => doy(tended, b.openDay!));
    expect(Math.min(...opened)).toBeGreaterThanOrEqual(182);
    expect(Math.max(...opened)).toBeLessThanOrEqual(280);
    // most of its flowers come from nodes that did not exist when the first buds formed
    const formedLater = buds.filter((b) => doy(tended, b.initiatedDay) > 180);
    expect(formedLater.length).toBeGreaterThan(buds.length / 2);
    for (const b of formedLater) expect(b.openDay!).toBeGreaterThan(b.initiatedDay);
  });

  it('is killed by the cold in November, with everything it carried', () => {
    const deaths = tended.decisions.filter((d) => d.kind === 'died');
    expect(deaths.map((d) => tended.calendar.dateOf(d.day).year)).toEqual([2027, 2028, 2029, 2030]);
    for (const d of deaths) {
      expect(tended.calendar.dateOf(d.day).month).toBe(11);
      expect(d.text).toContain('killed by the cold');
      expect(d.text).toContain('not drawn');
    }
    expect(tended.plants.get('annual')!.status).toBe('dead');
    for (const a of tended.axes.values()) expect(a.removedDay, a.id).not.toBeNull();
    for (const l of tended.leaves) expect(l.removedDay, l.axisId).not.toBeNull();
    // nothing of it is left for a viewer to draw in winter
    const data = toRenderData(tended);
    const midDecember = tended.calendar.dayOf('2030-12-15');
    expect(data.flowers.length).toBeGreaterThan(100);
    expect(data.flowers.filter((f) => flowerState(f, midDecember).phase !== 'absent')).toHaveLength(0);
    const r = designReport(tended);
    for (const m of r.months.filter((x) => x.month <= 5 || x.month >= 11)) expect(m.leaves.annual ?? 0, m.date).toBe(0);
    expect(r.months.find((x) => x.month === 8)!.leaves.annual).toBeGreaterThan(50);
  });

  it('does not count what the cold killed as lost to pruning', () => {
    for (const y of [2027, 2028, 2029, 2030]) expect(year(tended, y).floralBudsLostToPruning).toBe(0);
    expect(tended.buds.every((b) => b.end !== 'removed_by_pruning')).toBe(true);
  });

  it('cannot get off the ground at the foot of a glulam rib with nobody to tie it', () => {
    expect(year(left, 2027).flowersOpened).toBe(0);
    expect(left.decisions.find((d) => d.kind === 'no_route')!.text).toContain('too thick for a twining stem to grasp (limit 20 mm)');
    expect(designReport(left).alerts.some((a) => a.kind === 'no_hold')).toBe(true);
  });

  it('is gone for good after its first winter unless someone replants it', () => {
    for (const y of [2028, 2029, 2030]) expect(stemsOf(left, y)).toHaveLength(0);
    const alert = designReport(left).alerts.find((a) => a.kind === 'not_replanted')!;
    expect(alert.text).toContain('nobody planted it in 2030');
    expect(designReport(tended).alerts.some((a) => a.kind === 'not_replanted')).toBe(false);
  });
});

// DEVELOPMENT_GUIDE.md stage 6 exit check: "Two runs with identical initial conditions but different
// gardening calendars produce different structure, flower and maintenance outputs. A complete run can
// explain which human actions caused a change."
describe('a gardening calendar that misses a year', () => {
  const s = one('trained');
  const missed = run({ ...s, events: s.events.filter((e) => e.date !== '2029-05-20') });

  it('leaves that year empty and the others as they were', () => {
    expect(stemsOf(missed, 2029)).toHaveLength(0);
    expect(year(missed, 2029).flowersOpened).toBe(0);
    for (const y of [2027, 2028]) expect(year(missed, y)).toEqual(year(tended, y));
    expect(year(missed, 2030).flowersOpened).toBeGreaterThan(20);
    // the year after the missed visit is a whole plant again: as many stems as the plant set out every other year (24; three before 13 November 2026)
    expect(stemsOf(missed, 2030).filter((a) => a.role === 'leader')).toHaveLength(stemsOf(tended, 2030).filter((a) => a.role === 'leader').length);
  });

  it('shows in the log which visit was missing, and in the report what it cost', () => {
    expect(missed.events.filter((e) => e.type === 'annual_replant').map((e) => e.date)).toEqual(['2028-05-20', '2030-05-20']);
    const r = designReport(missed, { year: 2029 });
    expect(r.alerts.find((a) => a.kind === 'not_replanted')!.text).toContain('nobody planted it in 2029');
    expect(r.gardening.find((g) => g.year === 2029)).toBeUndefined();
    expect(designReport(tended, { year: 2029 }).gardening.find((g) => g.year === 2029)!.actions.annual_replant).toBe(1);
  });
});

describe('replanting and replacing, asked of a plant that is not an annual', () => {
  const visit = (type: 'annual_replant' | 'replace_failed_perennial'): GardenerEvent => ({ id: `visit-${type}`, date: '2029-05-20', type, plantId: 'annual', author: 'gardener', reason: 'test' });
  const base = one('trained', 'clematis-viticella-etoile-violette');

  it('does nothing, says why, and leaves the plant as it was', () => {
    const plain = run(base);
    for (const type of ['annual_replant', 'replace_failed_perennial'] as const) {
      const sim = run({ ...base, events: [visit(type)] });
      const e = sim.events.find((x) => x.type === type)!;
      expect(e.outcome).toContain('nothing done');
      expect(e.outcome).toContain(type === 'annual_replant' ? 'not grown as an annual' : 'alive and needs no replacing');
      expect(e.effects.stemRemovedM).toBe(0);
      expect(sim.summaries).toEqual(plain.summaries);
    }
  });
});

// The render contract: a flower is on the plant from developDay until spentDay. One that goes with a cut
// stem has to end on the day of the cut, or a viewer would go on drawing it in mid-air.
describe('a flower whose stem is cut while it is open', () => {
  it('is gone from the render data from that day', () => {
    const base = one('trained', 'clematis-viticella-etoile-violette');
    const cut: GardenerEvent = { id: 'august-cut', date: '2029-08-10', type: 'hard_prune', plantId: 'annual', target: { allStems: true }, keepM: 0.25, author: 'gardener', reason: 'cut down in flower' };
    const sim = run({ ...base, events: [cut] });
    const day = sim.calendar.dayOf('2029-08-10');
    const before = toRenderData(run(base)).flowers.filter((f) => flowerState(f, day).phase === 'open');
    expect(before.length).toBeGreaterThan(5);
    const data = toRenderData(sim);
    expect(data.flowers.filter((f) => f.spentDay === day).length).toBeGreaterThan(5);
    expect(data.flowers.filter((f) => flowerState(f, day).phase !== 'absent')).toHaveLength(0);
    expect(data.flowers.filter((f) => f.year === 2029 && f.spentDay < 0)).toHaveLength(0);
  });
});
