import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readBower } from '../src/bower/description.ts';
import { loadGrowable } from '../src/node/load-taxa.ts';
import { Simulation } from '../src/sim/engine.ts';
import { MODELLED_ROUTINE, type PlantingPlan, plantingOn } from '../src/sim/planting.ts';
import { type Growable, ivyRoutine, referencePalette, vineRoutine } from '../src/sim/scenarios.ts';
import type { Axis } from '../src/sim/types.ts';
import { GARDENER_EVENT } from '../src/vocab.ts';

// The gardener's routines for the crimson glory vine and for ivy, as dated visits the engine acts on.
// HORTICULTURAL_INTERVENTIONS.md section 2 (`shorten_side_shoots`, `trim_to_bounds`) and section 3; PROJECT_CONTEXT.md
// section 3.4 (the gardened plant is the baseline); docs/ASSUMPTIONS_AUDIT.md section 12.

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const VINE = 'vitis-coignetiae';
const IVY = 'hedera-helix';
const species = loadGrowable(here('../../../species'));
const only = (id: string): Growable => new Map([[id, species.get(id)!]]);
const frame = readBower(JSON.parse(readFileSync(here('../../../examples/specimen-frame.bower.json'), 'utf8')), 'specimen-frame.bower.json');
const plan = (taxonId: string): PlantingPlan => ({ schemaVersion: 1, name: 'One plant', plants: [{ plantId: 'p', taxonId, stationId: frame.bower.rootStations[0]!.id }] });
const grow = (taxonId: string, care: 'trained' | 'untended', years: number) => new Simulation(plantingOn(frame.bower, plan(taxonId), { taxa: only(taxonId), years, care, viewpoints: frame.viewpoints }));
const lengthOf = (a: Axis) => (a.alive > 0 ? a.lengthAt[a.alive - 1]! : 0);
const standing = (sim: Simulation, role: Axis['role']) => [...sim.axes.values()].filter((a) => a.role === role && a.removedDay === null && a.alive > 1);
let topZ = 0;
for (const n of frame.bower.graph.nodes.values()) topZ = Math.max(topZ, n.position.z);
/**
 * Free shoots (side shoots and whips) whose highest point stands more than 0.35 m above the top of the frame: more than
 * a stub of two nodes (a node is 9 to 14 cm, Gifu Prefecture 2003) standing straight up from the top beam.
 */
const tallAbove = (sim: Simulation) => [...standing(sim, 'side_shoot'), ...standing(sim, 'whip')].filter((a) => Math.max(...a.contact.slice(0, a.alive).map((p) => p.z)) > topZ + 0.35).length;
/** Shoots of the year longer than a stub of two nodes: more than 0.4 m of side shoot or free cane that no winter cut has made a stub of. */
const longShoots = (sim: Simulation) => [...standing(sim, 'side_shoot'), ...standing(sim, 'whip')].filter((a) => a.shortenedYear === undefined && lengthOf(a) > 0.4).length;

describe('the vocabulary and the routines', () => {
  it('names the new event before it is used (CLAUDE.md: vocabulary first)', () => {
    expect(GARDENER_EVENT).toContain('trim_to_bounds');
    expect(GARDENER_EVENT).toContain('shorten_side_shoots');
  });
  it('gives the vine and the ivy a routine of their own (PROJECT_CONTEXT.md 3.4)', () => {
    expect(MODELLED_ROUTINE[VINE]).toBe('vine_spur_and_summer');
    expect(MODELLED_ROUTINE[IVY]).toBe('ivy_in_bounds');
  });
  it('cuts the vine in December or January and shortens it in summer (Bean, of Vitis)', () => {
    const events = vineRoutine('v', 2027, 3, species.get(VINE)!.model);
    const winter = events.filter((e) => e.type === 'shorten_side_shoots' && e.remains === 'stub');
    const summer = events.filter((e) => e.type === 'shorten_side_shoots' && e.remains === 'shoot');
    expect(winter.length).toBe(3);
    for (const e of winter) expect(['12', '01']).toContain(e.date.slice(5, 7));
    for (const e of winter) if (e.type === 'shorten_side_shoots') expect(e.keepNodes).toEqual([1, 2]);
    expect(summer.length).toBe(6);
    for (const e of summer) expect(['06', '07', '08']).toContain(e.date.slice(5, 7));
  });
  it('cuts nothing on the ivy from March to August (RHS: nesting season)', () => {
    for (const e of ivyRoutine('i', 2027, 12)) {
      const month = Number(e.date.slice(5, 7));
      expect(month >= 3 && month <= 8, e.id).toBe(false);
    }
  });
  it('puts both routines in the reference palette when it is trained', () => {
    const s = referencePalette({ taxa: species, care: 'trained', years: 3, ivy: true });
    expect(s.events.some((e) => e.plantId === 'vine' && e.type === 'shorten_side_shoots')).toBe(true);
    expect(s.events.some((e) => e.plantId === 'north-evergreen' && e.type === 'trim_to_bounds')).toBe(true);
    expect(referencePalette({ taxa: species, care: 'untended', years: 3, ivy: true }).events.length).toBe(0);
  });
});

describe('the crimson glory vine as the gardener keeps it', () => {
  const sim = grow(VINE, 'trained', 6);
  sim.runUntil('2031-07-06');
  const july = { long: longShoots(sim), longest: Math.max(...standing(sim, 'side_shoot').map(lengthOf)), fruitsBefore: sim.fruits.filter((f) => f.removedDay === null).length };
  sim.runUntil('2031-07-08');
  const hanging = sim.fruits.filter((f) => f.removedDay === null);
  const stopped = {
    longest: Math.max(...standing(sim, 'side_shoot').map(lengthOf)),
    fruits: hanging.length,
    // each bunch on a point of its shoot that is still there, and at that point
    fruitsOnTheirShoots: hanging.filter((f) => {
      const a = sim.axes.get(f.axisId)!;
      return f.pointIndex < a.alive && a.removedDayAt[f.pointIndex] === null && f.position === a.contact[f.pointIndex];
    }).length,
    flowers: sim.buds.filter((b) => b.end === null && b.pointIndex === null && b.position !== null && b.stage !== 'spent').length,
  };
  sim.runUntil('2031-12-14');
  const before = { tall: tallAbove(sim), long: longShoots(sim), sideM: standing(sim, 'side_shoot').reduce((s, a) => s + lengthOf(a), 0), framework: [...standing(sim, 'leader'), ...standing(sim, 'lateral')].reduce((s, a) => s + lengthOf(a), 0) };
  sim.runUntil('2032-01-15');
  const january = { tall: tallAbove(sim), long: longShoots(sim), sideM: standing(sim, 'side_shoot').reduce((s, a) => s + lengthOf(a), 0), framework: [...standing(sim, 'leader'), ...standing(sim, 'lateral')].reduce((s, a) => s + lengthOf(a), 0) };
  const stubs = standing(sim, 'side_shoot');
  sim.runUntil('2032-06-22');
  const june = { leaves: sim.leaves.filter((l) => l.removedDay === null && l.firstYear <= 2032 && (l.lastYear === null || l.lastYear >= 2032)).length, fromStubs: standing(sim, 'side_shoot').filter((a) => a.bornYear === 2032 && sim.axes.get(a.parent!.axisId)!.role === 'side_shoot').length };

  // Until 12 November 2026 this asked for a thicket of more than twenty shoots standing 0.35 m above the frame in
  // December. They stood there because a shoot never fell over and because a shoot that carried a bunch was not
  // shortened in summer; neither is so now. What the test holds is that the year's shoots are still on the plant, long,
  // until the winter cut, and are stubs after it.
  it('carries the shoots of the year, shortened in summer, until the winter cut', () => {
    expect(before.long).toBeGreaterThan(100);
  });
  it('has none of them in January: the winter cut took every shoot of the year to one or two buds', () => {
    expect(january.long).toBe(0);
    expect(january.tall).toBe(0);
    expect(january.sideM).toBeLessThan(before.sideM / 2);
    const log = sim.events.find((e) => e.date === '2031-12-15' && e.type === 'shorten_side_shoots')!;
    expect(log.modelled).toBe(true);
    expect(log.outcome).toMatch(/cut back to stubs: \d+ side shoots and \d+ free shoots of the year cut back, each to 1 or 2 nodes/);
  });
  it('leaves stubs of one or two nodes, and leaves the framework alone', () => {
    // a node is some 9 to 14 cm (Gifu Prefecture 2003): two of them and a little are the most a stub keeps
    for (const a of stubs) if (a.shortenedYear === 2032) expect(lengthOf(a), a.id).toBeLessThan(0.4);
    expect(january.framework).toBeCloseTo(before.framework, 6);
  });
  it('breaks next year’s shoots from the stubs, and clothes the frame by midsummer', () => {
    expect(june.fromStubs).toBeGreaterThan(50);
    expect(june.leaves).toBeGreaterThan(1500);
  });
  it('shortens the young shoots in summer, taking what stood beyond the cut', () => {
    const summer = sim.events.filter((e) => e.type === 'shorten_side_shoots' && e.date.startsWith('2031-07'));
    expect(summer.length).toBe(1);
    expect(summer[0]!.effects.stemRemovedM).toBeGreaterThan(1);
    expect(summer[0]!.effects.leafSitesRemoved).toBeGreaterThan(10);
    // five or six leaves at 9 to 14 cm a node (Gifu Prefecture 2003), and the length below the first: no shoot of the year is left longer than 1 m
    expect(july.longest).toBeGreaterThan(1.2);
    expect(stopped.longest).toBeLessThan(1);
  });
  // RHS, of grapevines: a flowering side shoot is pruned "to two leaves past the developing flower cluster"; Hellman:
  // clusters stand "at the third to sixth nodes from the base of the shoot". The model draws the bunch at the shoot's end.
  it('shortens a shoot that carries a bunch like the rest, and keeps the bunch, at the cut end', () => {
    const summer = sim.events.find((e) => e.type === 'shorten_side_shoots' && e.date === '2031-07-07')!;
    expect(summer.outcome).toMatch(/\d+ of them carried a flower or fruit, which was kept and hangs from the cut end/);
    expect(summer.effects.floralBudsRemoved).toBe(0);
    expect(stopped.fruits + stopped.flowers).toBeGreaterThan(5);
    expect(stopped.fruits).toBeGreaterThanOrEqual(july.fruitsBefore);
    expect(stopped.fruitsOnTheirShoots).toBe(stopped.fruits);
  });
});

describe('the crimson glory vine left alone keeps its shoots', () => {
  it('sheds no shoot of the year in spring once the stand-in for the winter cut has gone (sideShoots.lifespanYears)', () => {
    const sim = grow(VINE, 'untended', 6).runUntil('2032-06-30');
    expect(sim.decisions.some((d) => d.kind === 'shed')).toBe(false);
    expect(standing(sim, 'side_shoot').some((a) => a.bornYear < 2031)).toBe(true);
  });
});

describe('ivy as the gardener keeps it', () => {
  const sim = grow(IVY, 'trained', 12).runUntil('2038-12-31');
  it('cuts off free juvenile shoots that stand out of bounds, in late February, and leaves those within', () => {
    const visits = sim.events.filter((e) => e.type === 'trim_to_bounds');
    expect(visits.length).toBe(11);
    expect(visits.every((e) => e.date.endsWith('-02-25') && e.modelled)).toBe(true);
    const later = visits.filter((e) => e.effects.axesRemoved > 0);
    expect(later.length).toBeGreaterThan(3);
    // nothing left standing out more than the bound on the day after a visit, of the shoots that hold nothing
    const check = grow(IVY, 'trained', 12).runUntil('2037-02-26');
    for (const a of standing(check, 'whip')) {
      if (a.runs.some((r) => r.status !== 'detached') || a.bornDay > check.calendar.dayOf('2037-02-25')) continue;
      const base = a.contact[0]!;
      for (let i = 1; i < a.alive; i++) expect(Math.hypot(a.contact[i]!.x - base.x, a.contact[i]!.y - base.y, a.contact[i]!.z - base.z), a.id).toBeLessThanOrEqual(0.5 + 1e-9);
    }
  });
  it('shortens adult growth to within the line every second year, after nesting', () => {
    const visits = sim.events.filter((e) => e.type === 'shorten_side_shoots');
    expect(visits.length).toBe(5);
    expect(visits.every((e) => e.date.endsWith('-09-05'))).toBe(true);
    expect(visits.some((e) => e.effects.axesCut > 0)).toBe(true);
  });
});
