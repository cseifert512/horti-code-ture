import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readBower } from '../src/bower/description.ts';
import { loadGrowable } from '../src/node/load-taxa.ts';
import { Simulation } from '../src/sim/engine.ts';
import { param } from '../src/sim/model.ts';
import { MODELLED_ROUTINE, type PlantingPlan, plantingOn, routineEvents } from '../src/sim/planting.ts';
import { type Growable, ivyRoutine, referencePalette, vineRoutine } from '../src/sim/scenarios.ts';
import type { Axis } from '../src/sim/types.ts';
import { GARDENER_EVENT } from '../src/vocab.ts';

// The gardener's routines for the crimson glory vine and for ivy, and for the six plants modelled in November 2026, as
// dated visits the engine acts on. HORTICULTURAL_INTERVENTIONS.md section 2 (`shorten_side_shoots`, `trim_to_bounds`)
// and section 3; PROJECT_CONTEXT.md section 3.4 (the gardened plant is the baseline); docs/ASSUMPTIONS_AUDIT.md
// sections 12 and 13.

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

// ---------------------------------------------------------------------------------------------------------------------
// The six routines added on 13 November 2026 (docs/ASSUMPTIONS_AUDIT.md section 13): each plant on the specimen frame as
// the gardener keeps it, against the same plant tied in and never cut (its routine's visits taken out of the scenario).
// ---------------------------------------------------------------------------------------------------------------------

const ARMANDI = 'clematis-armandi';
const CIRRHOSA = 'clematis-cirrhosa-freckles';
const WOODBINE = 'lonicera-periclymenum-graham-thomas';
const JASMINE = 'trachelospermum-jasminoides';
const AKEBIA = 'akebia-quinata';
const CAMPSIS = 'campsis-x-tagliabueana-madame-galen';

/** The plant trained, tied in as it grows, with none of the gardener's cuts: the run before the routine. */
const growUncut = (taxonId: string, years: number) => {
  const s = plantingOn(frame.bower, plan(taxonId), { taxa: only(taxonId), years, care: 'trained', viewpoints: frame.viewpoints });
  return new Simulation({ ...s, events: [] });
};
/** The furthest any point of a shoot stands from where it left its support. */
const reachOf = (a: Axis) => {
  let m = 0;
  for (let i = 1; i < a.alive; i++) m = Math.max(m, Math.hypot(a.contact[i]!.x - a.contact[0]!.x, a.contact[i]!.y - a.contact[0]!.y, a.contact[i]!.z - a.contact[0]!.z));
  return m;
};
/** Free shoots that hold nothing and stand out further than `m` from the structure: the bare threads in the air. */
const outBeyond = (sim: Simulation, m: number) => standing(sim, 'whip').filter((a) => !a.runs.some((r) => r.status !== 'detached') && reachOf(a) > m);
const opened = (sim: Simulation) => sim.summaries.map((s) => s.flowersOpened);
const leavesIn = (sim: Simulation, year: number) => sim.leaves.filter((l) => l.removedDay === null && l.firstYear <= year && (l.lastYear === null || l.lastYear >= year)).length;
const openOn = (sim: Simulation, iso: string) => {
  const day = sim.calendar.dayOf(iso);
  return sim.buds.filter((b) => b.openDay !== null && b.openDay <= day && (b.spentDay === null || b.spentDay > day)).length;
};

describe('the six routines added for the plants modelled in November 2026', () => {
  it('gives each of the six a routine of its own, and the annual none (PROJECT_CONTEXT.md 3.4)', () => {
    expect(MODELLED_ROUTINE[ARMANDI]).toBe('group_1_in_bounds_after_flowering');
    expect(MODELLED_ROUTINE[CIRRHOSA]).toBe('group_1_first_spring_cut_then_in_bounds');
    expect(MODELLED_ROUTINE[WOODBINE]).toBe('woodbine_spring_tidy_and_late_summer');
    expect(MODELLED_ROUTINE[JASMINE]).toBe('jasmine_spring_tidy');
    expect(MODELLED_ROUTINE[AKEBIA]).toBe('akebia_after_flowering_and_late_summer');
    expect(MODELLED_ROUTINE[CAMPSIS]).toBe('campsis_late_winter_spurs');
    expect(MODELLED_ROUTINE['thunbergia-alata']).toBeUndefined();
  });
  it('puts the four that are in the reference palette into its trained events, and none into the untended', () => {
    const s = referencePalette({ taxa: species, care: 'trained', years: 3 });
    for (const [plantId, type] of [['honeysuckle', 'shorten_side_shoots'], ['spring-clematis', 'trim_to_bounds'], ['star-jasmine', 'trim_to_bounds'], ['winter-clematis', 'hard_prune']] as const) {
      expect(s.events.some((e) => e.plantId === plantId && e.type === type), plantId).toBe(true);
    }
    expect(referencePalette({ taxa: species, care: 'untended', years: 3 }).events.length).toBe(0);
  });
  it('cuts each group 1 clematis only after its flowers are over (RHS group 1: "immediately after flowering")', () => {
    const doy = (iso: string) => Math.round((Date.parse(iso) - Date.parse(`${iso.slice(0, 4)}-01-01`)) / 86400000) + 1;
    for (const id of [ARMANDI, CIRRHOSA]) {
      const lastFall = param(species.get(id)!.model, 'phenology.petalFallDoy')[1];
      for (const e of routineEvents(MODELLED_ROUTINE[id]!, 'p', 2027, 6)) if (e.type === 'trim_to_bounds') expect(doy(e.date), e.id).toBeGreaterThan(lastFall);
    }
  });
  it('spur-prunes the trumpet vine in late winter, before its buds break, from the third year (RHS: "once a framework is established, usually in two to three years")', () => {
    const events = routineEvents('campsis_late_winter_spurs', 'p', 2027, 6);
    expect(events.map((e) => e.date)).toEqual(['2029-02-25', '2030-02-25', '2031-02-25', '2032-02-25']);
    for (const e of events) if (e.type === 'shorten_side_shoots') expect(e.keepNodes).toEqual([1, 2]);
    expect(param(species.get(CAMPSIS)!.model, 'phenology.budburstDoy')).toBeGreaterThan(56);
  });
  it('cuts the honeysuckle\'s flowered shoots by a third in late summer (RHS: "Cut back flowered shoots by one-third in late summer")', () => {
    const late = routineEvents('woodbine_spring_tidy_and_late_summer', 'p', 2027, 6, species.get(WOODBINE)!.model).filter((e) => e.type === 'shorten_side_shoots');
    expect(late.length).toBe(5);
    for (const e of late) {
      expect(e.date.slice(5)).toBe('09-05');
      if (e.type === 'shorten_side_shoots') expect([e.keepShare, e.which, e.remains]).toEqual([[0.6, 0.7], 'flowered', 'shoot']);
    }
  });
});

describe('Clematis armandii as the gardener keeps it (RHS: "restricting them to the space available")', () => {
  const kept = grow(ARMANDI, 'trained', 6).runUntil('2032-01-15');
  const uncut = growUncut(ARMANDI, 6).runUntil('2032-01-15');
  const january = { kept: outBeyond(kept, 0.6).length, uncut: outBeyond(uncut, 0.6).length };
  kept.runUntil('2032-12-31');
  uncut.runUntil('2032-12-31');
  it('has far fewer long bare shoots hanging off the frame in winter', () => {
    // 13 November 2026: 221 uncut, 129 kept. What is left is the summer's shoots, made after the May visit, which carry the next spring's flowers
    expect(january.uncut).toBeGreaterThan(150);
    expect(january.kept).toBeLessThan(january.uncut * 0.7);
  });
  it('leaves the flowering exactly as it was: the shoots that flower are the previous summer\'s', () => {
    expect(opened(kept)).toEqual(opened(uncut));
  });
});

describe('Clematis cirrhosa \'Freckles\' as the gardener keeps it (RHS group 1)', () => {
  const sim = grow(CIRRHOSA, 'trained', 6).runUntil('2027-09-30');
  const cane = [...sim.axes.values()].find((a) => a.role === 'leader' && a.parent === null && a.bornDay === sim.calendar.dayOf('2027-03-12'))!;
  const fromCane = [...sim.axes.values()].filter((a) => a.parent?.axisId === cane.id && a.bornYear === 2027 && a.removedDay === null);
  const uncut = growUncut(CIRRHOSA, 6).runUntil('2032-03-24');
  sim.runUntil('2032-03-24');
  const before = outBeyond(sim, 0.3).length;
  sim.runUntil('2032-03-26');
  it('cuts the stem it was planted with to 0.3 m on planting day, and the stub shoots again that spring ("pruned back hard the first spring after planting")', () => {
    expect(lengthOf(cane)).toBeLessThanOrEqual(0.3);
    expect(fromCane.length).toBeGreaterThan(0);
    expect(Math.max(...fromCane.map(lengthOf))).toBeGreaterThan(0.3);
  });
  it('takes the shoots that stand out beyond 0.3 m in late March, after the last flowers, and no flower bud with them', () => {
    expect(outBeyond(uncut, 0.3).length).toBeGreaterThan(100);
    expect(before).toBeGreaterThan(50);
    expect(outBeyond(sim, 0.3).length).toBe(0);
    const visit = sim.events.find((e) => e.type === 'trim_to_bounds' && e.date === '2032-03-25')!;
    expect(visit.effects.axesRemoved).toBeGreaterThan(50);
    expect(visit.effects.floralBudsRemoved).toBe(0);
  });
});

describe('the honeysuckle \'Graham Thomas\' as the gardener keeps it (RHS group 11, and the RHS honeysuckle guide)', () => {
  const sim = grow(WOODBINE, 'trained', 6).runUntil('2027-09-30');
  const cane = [...sim.axes.values()].find((a) => a.role === 'leader' && a.parent === null && a.bornDay === sim.calendar.dayOf('2027-03-12'))!;
  const fromCane = [...sim.axes.values()].filter((a) => a.parent?.axisId === cane.id && a.bornYear === 2027);
  const uncut = growUncut(WOODBINE, 6).runUntil('2032-09-06');
  sim.runUntil('2032-09-04');
  const august = tallAbove(sim);
  sim.runUntil('2032-09-06');
  it('cuts the shoot it arrives with by two thirds at planting, and it shoots again from the base ("to encourage strong new shoots from the base")', () => {
    expect(lengthOf(cane)).toBeCloseTo(param(species.get(WOODBINE)!.model, 'architecture.nurseryCaneM') / 3, 1);
    expect(fromCane.length).toBeGreaterThanOrEqual(2);
  });
  it('shortens every flowered side shoot by about a third in early September, and takes most of the fringe above the top beam', () => {
    const visit = sim.events.find((e) => e.type === 'shorten_side_shoots' && e.date === '2032-09-05')!;
    expect(visit.outcome).toMatch(/shortened: \d{3} flowered side shoots cut back, each keeping 60% to 70% of its length/);
    expect(august).toBeGreaterThan(5);
    expect(tallAbove(sim)).toBeLessThan(august / 2);
    expect(tallAbove(sim)).toBeLessThan(tallAbove(uncut));
  });
  it('cuts wayward long shoots in early March and leaves fewer standing free than the uncut plant', () => {
    const visits = sim.events.filter((e) => e.type === 'trim_to_bounds');
    expect(visits.every((e) => e.date.endsWith('-03-01'))).toBe(true);
    expect(visits.some((e) => e.effects.axesRemoved > 0)).toBe(true);
    expect(outBeyond(sim, 0.5).length).toBeLessThan(outBeyond(uncut, 0.5).length);
  });
});

describe('star jasmine as the gardener keeps it (RHS: "Maintenance pruning, if required, should be done in spring")', () => {
  const sim = grow(JASMINE, 'trained', 6).runUntil('2032-04-16');
  const uncut = growUncut(JASMINE, 6).runUntil('2032-04-16');
  const april = { kept: outBeyond(sim, 0.3).length, uncut: outBeyond(uncut, 0.3).length };
  sim.runUntil('2032-07-15');
  uncut.runUntil('2032-07-15');
  it('has no wayward shoot standing out beyond 0.3 m after the April visit, where the uncut plant has some', () => {
    expect(april.uncut).toBeGreaterThan(3);
    expect(april.kept).toBe(0);
  });
  it('keeps its leaves and its flowers within a twentieth of the uncut plant\'s', () => {
    expect(leavesIn(sim, 2032)).toBeGreaterThan(leavesIn(uncut, 2032) * 0.95);
    expect(openOn(sim, '2032-07-15')).toBeGreaterThan(openOn(uncut, '2032-07-15') * 0.9);
  });
});

describe('akebia as the gardener keeps it (RHS group 11: "pruned after flowering")', () => {
  const sim = grow(AKEBIA, 'trained', 6).runUntil('2032-01-15');
  const uncut = growUncut(AKEBIA, 6).runUntil('2032-01-15');
  const january = { kept: outBeyond(sim, 0.3).length, uncut: outBeyond(uncut, 0.3).length };
  sim.runUntil('2032-12-31');
  uncut.runUntil('2032-12-31');
  it('has none, or nearly none, of the bare threads hanging off the frame in winter that the uncut plant has', () => {
    // 13 November 2026: 79 uncut, 0 kept
    expect(january.uncut).toBeGreaterThan(40);
    expect(january.kept).toBeLessThanOrEqual(3);
  });
  it('first cuts in the year it first flowers, and flowers within a twentieth of the uncut plant', () => {
    const visits = sim.events.filter((e) => e.type === 'trim_to_bounds');
    expect(visits[0]!.date).toBe('2029-06-05');
    expect(sim.summaries.find((s) => s.year === 2029)!.flowersOpened).toBeGreaterThan(0);
    const [a, b] = [opened(sim).at(-1)!, opened(uncut).at(-1)!];
    expect(a).toBeGreaterThan(b * 0.95);
  });
});

describe('the trumpet vine as the gardener keeps it (RHS: side shoots spur-pruned "to within two or three buds of the main stems")', () => {
  const sim = grow(CAMPSIS, 'trained', 6).runUntil('2032-02-24');
  const framework = () => [...standing(sim, 'leader'), ...standing(sim, 'lateral')].reduce((s, a) => s + lengthOf(a), 0);
  const before = { sideM: standing(sim, 'side_shoot').reduce((s, a) => s + lengthOf(a), 0), framework: framework() };
  sim.runUntil('2032-03-15');
  const march = { sideM: standing(sim, 'side_shoot').reduce((s, a) => s + lengthOf(a), 0), framework: framework(), stubs: standing(sim, 'side_shoot').filter((a) => a.shortenedYear === 2032) };
  sim.runUntil('2032-08-25');
  it('leaves stubs of one or two nodes in March, and the framework as it was', () => {
    expect(march.stubs.length).toBeGreaterThan(50);
    // a node is about 0.095 m (its model's leaf spacing): two of them and a little are the most a stub keeps
    for (const a of march.stubs) expect(lengthOf(a), a.id).toBeLessThan(0.3);
    expect(march.sideM).toBeLessThan(before.sideM / 2);
    expect(march.framework).toBeCloseTo(before.framework, 6);
  });
  it('clothes the frame again by late August, and is in flower then, on the shoots that broke from the stubs', () => {
    expect(leavesIn(sim, 2032)).toBeGreaterThan(1500);
    expect(openOn(sim, '2032-08-25')).toBeGreaterThan(20);
    expect(standing(sim, 'side_shoot').filter((a) => a.bornYear === 2032 && sim.axes.get(a.parent!.axisId)!.role === 'side_shoot').length).toBeGreaterThan(50);
  });
});

describe('the trumpet vine left alone keeps its shoots', () => {
  it('sheds no shoot of the year once the stand-in for the late-winter cut has gone (sideShoots.lifespanYears)', () => {
    expect(param(species.get(CAMPSIS)!.model, 'sideShoots.lifespanYears')).toBeGreaterThan(1);
    const sim = grow(CAMPSIS, 'untended', 6).runUntil('2032-06-30');
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
