import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readBower } from '../src/bower/description.ts';
import { type Vec3, dot, length, normalize, sub } from '../src/math/vec3.ts';
import { loadGrowable } from '../src/node/load-taxa.ts';
import { Simulation } from '../src/sim/engine.ts';
import { withParam } from '../src/sim/model.ts';
import { type PlantingPlan, plantingOn } from '../src/sim/planting.ts';
import type { Growable } from '../src/sim/scenarios.ts';
import type { Axis } from '../src/sim/types.ts';

// How a flowering side shoot leaves its stem, how it bows, and what a gardener does to it: Rosa 'The Generous
// Gardener' on the specimen frame, as the viewer grows it, with the rose's own growth model.
// docs/ASSUMPTIONS_AUDIT.md section 11.

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const ROSE = 'rosa-the-generous-gardener';
const species = loadGrowable(here('../../../species'));
const rose: Growable = new Map([[ROSE, species.get(ROSE)!]]);
const frame = readBower(JSON.parse(readFileSync(here('../../../examples/specimen-frame.bower.json'), 'utf8')), 'specimen-frame.bower.json');
const plan: PlantingPlan = { schemaVersion: 1, name: 'One rose', plants: [{ plantId: 'rose', taxonId: ROSE, stationId: frame.bower.rootStations[0]!.id }] };
const grow = (taxa: Growable, care: 'trained' | 'untended', until: string) => new Simulation(plantingOn(frame.bower, plan, { taxa, years: 6, care, viewpoints: frame.viewpoints })).runUntil(until);

const trained = grow(rose, 'trained', '2032-12-31');
const cal = trained.calendar;
const lengthOf = (a: Axis) => (a.alive > 0 ? a.lengthAt[a.alive - 1]! : 0);
const side = (sim: Simulation, year: number) => [...sim.axes.values()].filter((a) => a.role === 'side_shoot' && a.bornYear === year && a.contact.length >= 3);
/** The stem that bears a side shoot, and the point of it the shoot stands on. */
const bearer = (sim: Simulation, a: Axis) => ({ host: sim.axes.get(a.parent!.axisId)!, at: a.parent!.pointIndex });
/** The way a shoot set out: its first laid length. */
const setOut = (a: Axis): Vec3 => normalize(sub(a.contact[1]!, a.contact[0]!));
const angleDeg = (u: Vec3, v: Vec3) => (Math.acos(Math.max(-1, Math.min(1, dot(u, v)))) * 180) / Math.PI;

// SIMULATION_KEY.md section 4.3, unsupported shoots, (a) and (e); the owner's question of 12 November 2026 ("Would this
// happen in real-life??") about a comb of parallel upright rods on a level timber.
describe('a side shoot leaves its stem as a plant’s do', () => {
  const shoots = side(trained, 2031);
  // those on a stretch of cane tied along a level member
  const level = shoots.filter((a) => {
    const { host, at } = bearer(trained, a);
    if (host.role === 'side_shoot' || length(host.away[at]!) < 0.5) return false;
    const t = normalize(sub(host.contact[Math.min(host.alive - 1, at + 1)]!, host.contact[Math.max(0, at - 1)]!));
    return Math.abs(t.z) < 0.25;
  });

  it('does not share one direction with its neighbours on a level member', () => {
    expect(level.length).toBeGreaterThan(15);
    const dirs = level.map(setOut);
    let mean = dirs.reduce((s, d) => ({ x: s.x + d.x, y: s.y + d.y, z: s.z + d.z }), { x: 0, y: 0, z: 0 });
    mean = normalize(mean);
    // the comb the owner saw: every shoot within a few degrees of one line. Here fewer than a third are within 15 degrees of
    // their mean direction, and the widest pair stand more than 90 degrees apart
    const near = dirs.filter((d) => angleDeg(d, mean) < 15).length;
    expect(near / dirs.length).toBeLessThan(1 / 3);
    let widest = 0;
    for (const a of dirs) for (const b of dirs) widest = Math.max(widest, angleDeg(a, b));
    expect(widest).toBeGreaterThan(90);
    // and they are not all upright: some set out nearer level than plumb
    expect(dirs.filter((d) => d.z < Math.SQRT1_2).length).toBeGreaterThan(dirs.length / 5);
  });

  it('never sets out into the timber it stands on', () => {
    let checked = 0;
    for (const a of shoots) {
      const { host, at } = bearer(trained, a);
      const away = host.away[at]!;
      if (length(away) < 0.5) continue;
      expect(dot(setOut(a), away), a.id).toBeGreaterThan(0);
      checked++;
    }
    expect(checked).toBeGreaterThan(50);
  });

  it('varies in length and in the day its bud breaks', () => {
    const lengths = shoots.map((a) => a.targetLengthM);
    expect(Math.max(...lengths) - Math.min(...lengths)).toBeGreaterThan(0.25);
    const breaks = new Set(shoots.map((a) => a.breaksDay));
    expect(breaks.size).toBeGreaterThan(15);
    // a shoot lays no stem before its bud breaks
    for (const a of shoots) expect(a.bornDayAt[1]!, a.id).toBeGreaterThanOrEqual(a.breaksDay!);
  });

  it('is sturdier at its base than at its tip as it grows', () => {
    for (const a of shoots.slice(0, 40)) {
      const born = a.bornDayAt;
      // radius as laid, before the year's end thickens the plant
      if (cal.dateOf(born[born.length - 1]!).year !== 2031) continue;
      expect(a.radiusMm[0]!).toBeGreaterThan(a.radiusMm[a.contact.length - 1]! * 1.2);
    }
  });
});

// SIMULATION_KEY.md section 4.3, unsupported shoots, (a): a shoot in the air is a rod under its own weight and that of
// its leaves, flowers and fruit.
describe('a side shoot bows under what it carries', () => {
  const heavy: Growable = new Map([[ROSE, { profile: rose.get(ROSE)!.profile, model: withParam(rose.get(ROSE)!.model, 'mechanics.inflorescenceFreshMassKg', 0.06, 'test: a spray five times as heavy') }]]);
  const light = grow(rose, 'trained', '2031-07-31');
  const loaded = grow(heavy, 'trained', '2031-07-31');
  /** How far from plumb the last laid length of each side shoot of 2031 that bore a flower points, degrees, by shoot id. */
  const tips = (sim: Simulation) => {
    const out = new Map<string, number>();
    for (const a of side(sim, 2031)) {
      if (!sim.buds.some((b) => b.axisId === a.id)) continue;
      const n = a.contact.length;
      out.set(a.id, angleDeg(normalize(sub(a.contact[n - 1]!, a.contact[n - 2]!)), { x: 0, y: 0, z: 1 }));
    }
    return out;
  };

  it('bows further at its tip where its spray is heavier', () => {
    const a = tips(light);
    const b = tips(loaded);
    let more = 0;
    let less = 0;
    let sumA = 0;
    let sumB = 0;
    for (const [id, deg] of a) {
      const other = b.get(id);
      if (other === undefined) continue;
      sumA += deg;
      sumB += other;
      if (other > deg + 0.5) more++;
      else if (other < deg - 0.5) less++;
    }
    expect(more + less).toBeGreaterThan(20);
    expect(more).toBeGreaterThan(less * 2);
    expect(sumB).toBeGreaterThan(sumA);
  });
});

// RHS pruning group 17 (https://www.rhs.org.uk/plants/roses/climbing/pruning-guide): "Prune any flowered side shoots
// back by two thirds of their length", between December and February. HORTICULTURAL_INTERVENTIONS.md section 2:
// "Pruning should remove descendants in the plant graph and any associated organ/attachment states."
describe('the winter cut of a climbing rose', () => {
  const visit = trained.events.find((e) => e.eventId === 'rose-winter-2032-rose')!;
  const day = cal.dayOf('2032-01-08');
  const cutShoots = [...trained.axes.values()].filter((a) => a.role === 'side_shoot' && a.removedDayAt.some((d) => d === day) && a.removedDay !== day);

  it('shortens each flowered side shoot to the share the routine keeps, and leaves the shoots that did not flower', () => {
    expect(cutShoots.length).toBeGreaterThan(50);
    for (const a of cutShoots) {
      expect(trained.buds.some((b) => b.axisId === a.id && b.openDay !== null && b.openDay < day), a.id).toBe(true);
      // what it was on the day before, and what it is after: kept a third to a half, to the step stems are stored in
      let was = a.alive;
      while (was < a.contact.length && a.removedDayAt[was] === day) was++;
      const before = a.lengthAt[was - 1]!;
      const after = lengthOf(a);
      expect(after / before, a.id).toBeLessThanOrEqual(0.5 + 1e-9);
      expect(after, a.id).toBeGreaterThanOrEqual(0.33 * before - 0.045);
    }
    const unflowered = [...trained.axes.values()].filter((a) => a.role === 'side_shoot' && a.bornYear === 2031 && a.removedDay === null && !trained.buds.some((b) => b.axisId === a.id && b.openDay !== null));
    for (const a of unflowered) expect(a.removedDayAt.includes(day), a.id).toBe(false);
  });

  it('takes everything that stood beyond the cut: leaves, flowers, hips and prickles', () => {
    let hips = 0;
    for (const a of cutShoots) {
      for (const l of trained.leaves) if (l.axisId === a.id && l.pointIndex >= a.alive) expect(l.removedDay, a.id).not.toBeNull();
      for (const f of trained.fruits) {
        if (f.axisId !== a.id || f.pointIndex < a.alive) continue;
        expect(f.removedDay !== null && f.removedDay <= day, a.id).toBe(true);
        if (f.removedBy === visit.eventId) hips++;
      }
      for (const s of trained.appendages) if (s.axisId === a.id && s.pointIndex >= a.alive) expect(s.removedDay !== null && s.removedDay <= day).toBe(true);
      for (const b of trained.buds) if (b.axisId === a.id && b.pointIndex === null) expect(b.stage === 'spent' || b.end !== null).toBe(true);
    }
    expect(hips).toBeGreaterThan(5);
    // nothing hangs on the cut shoots in the winter picture
    const hanging = trained.fruits.filter((f) => cutShoots.some((a) => a.id === f.axisId) && f.swell[0] < day && (f.removedDay === null || f.removedDay > day));
    expect(hanging).toHaveLength(0);
  });

  it('leaves the stub, from whose top next season’s side shoot breaks', () => {
    const fromStubs = side(trained, 2032).filter((a) => trained.axes.get(a.parent!.axisId)!.role === 'side_shoot');
    expect(fromStubs.length).toBeGreaterThan(20);
    for (const a of fromStubs) {
      const stub = trained.axes.get(a.parent!.axisId)!;
      expect(stub.shortenedYear).toBe(2032);
      expect(a.parent!.pointIndex).toBe(stub.alive - 1);
      expect(stub.removedDay).toBeNull();
    }
  });
});

// HORTICULTURAL_INTERVENTIONS.md section 1: gardeners as agents, recorded as events "so outputs can be explained";
// PROJECT_CONTEXT.md section 3.4: the gardened plant is the baseline.
describe('the rose’s routine of care in the gardener’s log', () => {
  const log = trained.events.filter((e) => e.plantId === 'rose');

  it('dates each visit and says what each removed', () => {
    const winter = log.filter((e) => e.type === 'shorten_side_shoots');
    expect(winter.map((e) => e.date)).toEqual(['2028-01-08', '2029-01-08', '2030-01-08', '2031-01-08', '2032-01-08']);
    for (const e of winter) {
      expect(e.modelled).toBe(true);
      expect(e.outcome).toMatch(/^winter pruning: /);
      expect(e.outcome).toMatch(/canes? from the base/);
    }
    const later = winter.filter((e) => e.date >= '2030');
    for (const e of later) {
      expect(e.outcome).toMatch(/\d+ flowered side shoots? cut back, each keeping 33% to 50% of its length; [\d.]+ m of shoot and \d+ hips? went with the cuts/);
      expect(e.effects.stemRemovedM).toBeGreaterThan(5);
      expect(e.effects.axesCut + e.effects.axesRemoved).toBeGreaterThan(20);
    }
    const summer = log.filter((e) => e.type === 'deadhead_or_select_flowers' && e.date.startsWith('2031'));
    expect(summer.map((e) => e.date.slice(5))).toEqual(['06-28', '07-12', '07-26', '08-09', '08-23']);
    for (const e of summer) expect(e.modelled).toBe(true);
    expect(summer.filter((e) => /^deadheaded: \d+ spent flowers? taken off/.test(e.outcome)).length).toBeGreaterThan(3);
  });

  it('is the routine every trained planting of the rose gets, and an untended one gets none', () => {
    expect(trained.scenario.events.filter((e) => e.plantId === 'rose').length).toBe(5 * 6);
    const untended = plantingOn(frame.bower, plan, { taxa: rose, years: 6, care: 'untended' });
    expect(untended.events).toHaveLength(0);
  });

  it('still lets the rose flower the next summer, in a June flush and lesser ones after', () => {
    const opened = (iso0: string, iso1: string) => trained.buds.filter((b) => b.openDay !== null && b.openDay >= cal.dayOf(iso0) && b.openDay <= cal.dayOf(iso1)).length;
    expect(trained.summaries.find((s) => s.year === 2032)!.flowersOpened).toBeGreaterThan(150);
    const june = opened('2032-06-01', '2032-06-30');
    expect(june).toBeGreaterThan(80);
    // later flushes, each a lesser one, into October
    expect(opened('2032-10-01', '2032-10-31')).toBeGreaterThan(0);
    expect(opened('2032-10-01', '2032-10-31')).toBeLessThan(june);
    expect(opened('2032-08-01', '2032-08-31')).toBeLessThan(june);
  });
});
