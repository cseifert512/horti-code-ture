import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadGrowable } from '../src/node/load-taxa.ts';
import { Simulation } from '../src/sim/engine.ts';
import { GROWTH_PARAMS, GROWTH_PARAMS_OPTIONAL } from '../src/sim/model.ts';
import { toRenderData } from '../src/sim/render-data.ts';
import { type Growable, mixedOnVault, wisteriaOnVault } from '../src/sim/scenarios.ts';
import { type StemPath, turnsOf } from '../src/sim/stem-path.ts';
import type { Axis, GardenerEvent, Scenario } from '../src/sim/types.ts';

const speciesDir = fileURLToPath(new URL('../../../species', import.meta.url));
const library = loadGrowable(speciesDir);

/**
 * Which wood Lonicera henryi flowers on is not settled in the library, so
 * these tests fix it one way or the other and do not depend on the file.
 */
function withHoneysuckleWood(wood: 'current_season' | null): Growable {
  const h = library.get('lonicera-henryi')!;
  const profile = structuredClone(h.profile);
  profile.flowering.wood = wood ? { value: wood, status: 'provisional_design_assumption', basis: 'fixed for this test' } : { value: null, status: 'unknown' };
  return new Map([...library, ['lonicera-henryi', { profile, model: h.model }]]);
}
const taxa = withHoneysuckleWood('current_season');

const run = (s: Scenario, until: string) => new Simulation(s).runUntil(until);
const mixed = (care: 'trained' | 'untended', extra: GardenerEvent[] = [], t: Growable = taxa): Scenario => {
  const s = mixedOnVault({ taxa: t, care, years: 8 });
  return { ...s, events: [...s.events, ...extra] };
};
const END = '2034-12-31';
const trained = run(mixed('trained'), END);
const untended = run(mixed('untended'), END);
const summary = (sim: Simulation, plantId: string, year: number) => sim.summaries.find((s) => s.plantId === plantId && s.year === year)!;
const yearOf = (sim: Simulation, day: number) => sim.calendar.dateOf(day).year;
const axesOf = (sim: Simulation, plantId: string) => [...sim.axes.values()].filter((a) => a.plantId === plantId);
const lengthOf = (a: Axis) => (a.alive ? a.lengthAt[a.alive - 1]! : 0);
/** Length of stem between the ground and the base of an axis. */
const below = (sim: Simulation, a: Axis): number => {
  let total = 0;
  let x = a;
  while (x.parent) {
    const p = sim.axes.get(x.parent.axisId)!;
    total += p.lengthAt[x.parent.pointIndex]!;
    x = p;
  }
  return total;
};

// SIMULATION_KEY.md section 9 "Clematis contrast"; DEVELOPMENT_GUIDE.md stage 4 exit check;
// CONSTRAINTS_AND_PHENOLOGY.md section 3 "Hard pruning test".
describe('old wood and new wood answer hard pruning differently', () => {
  it('lets a Group 3 clematis flower every year although every stem is cut to the ground each February', () => {
    const cuts = trained.events.filter((e) => e.plantId === 'clematis' && e.type === 'hard_prune');
    expect(cuts.length).toBe(7);
    for (const c of cuts) {
      expect(c.effects.stemRemovedM).toBeGreaterThan(3);
      expect(c.effects.floralBudsRemoved).toBe(0);
      expect(c.outcome).toContain('left to shoot again');
    }
    for (let y = 2027; y <= 2034; y++) expect(summary(trained, 'clematis', y).flowersOpened, String(y)).toBeGreaterThan(5);
  });

  it('bears every clematis flower on wood grown the same year', () => {
    let seen = 0;
    for (const b of trained.buds) {
      if (b.plantId !== 'clematis' || b.openDay === null) continue;
      const bearer = trained.axes.get(b.axisId)!;
      expect(b.pointIndex).not.toBeNull();
      expect(yearOf(trained, bearer.bornDayAt[b.pointIndex!]!)).toBe(yearOf(trained, b.openDay));
      expect(yearOf(trained, b.initiatedDay)).toBe(yearOf(trained, b.openDay));
      seen++;
    }
    expect(seen).toBeGreaterThan(200);
  });

  it('costs a wisteria its flowers when the same cut is made to it', () => {
    const cut: GardenerEvent = { id: 'floor-the-wisteria', date: '2033-02-20', type: 'hard_prune', plantId: 'wisteria.0', target: { allStems: true }, keepM: 0.25 };
    const sim = run(mixed('trained', [cut]), END);
    const rec = sim.events.find((e) => e.eventId === 'floor-the-wisteria')!;
    expect(rec.effects.floralBudsRemoved).toBeGreaterThan(100);
    expect(summary(trained, 'wisteria.0', 2033).flowersOpened).toBeGreaterThan(100);
    expect(summary(sim, 'wisteria.0', 2033).flowersOpened).toBe(0);
    // and it has not recovered a year later: the spurs have to be grown again
    expect(summary(sim, 'wisteria.0', 2034).flowersOpened).toBeLessThan(summary(trained, 'wisteria.0', 2034).flowersOpened * 0.2);
    // the clematis beside it, cut the same day as every year, flowers as usual
    expect(summary(sim, 'clematis', 2033).flowersOpened).toBeGreaterThan(5);
  });

  it('takes the clematis flowers too if the cut comes in summer, after the buds have formed', () => {
    const cut: GardenerEvent = { id: 'summer-cutdown', date: '2031-07-02', type: 'hard_prune', plantId: 'clematis', target: { allStems: true }, keepM: 0.25 };
    const sim = run(mixed('trained', [cut]), '2031-12-31');
    const rec = sim.events.find((e) => e.eventId === 'summer-cutdown')!;
    expect(rec.effects.floralBudsRemoved).toBeGreaterThan(5);
    expect(summary(sim, 'clematis', 2031).flowersOpened).toBe(0);
    expect(summary(trained, 'clematis', 2031).flowersOpened).toBeGreaterThan(5);
  });
});

// DEVELOPMENT_GUIDE.md stage 4 exit check: "Group 1 C. cirrhosa and Group 3 C. viticella have materially
// different responses to severe pruning". CONSTRAINTS section 3: "If a gardener removes an older C. cirrhosa
// shoot with overwintering flower buds, those buds cannot flower."
describe('the winter clematis, which flowers on last summer’s shoots', () => {
  const opened = (sim: Simulation, winterOf: number) => sim.buds.filter((b) => b.plantId === 'winter-clematis' && b.floweringYear === winterOf && b.openDay !== null);

  it('opens in late autumn and finishes the following spring, on wood that is by then a year old', () => {
    const flowers = opened(trained, 2032);
    // a display and not a stray flower. It is a plant whose profile asks for sun, at the foot of a rib where it has
    // about four fifths of an open site's light, so it makes that much less growth to flower on (sim/light.ts)
    expect(flowers.length).toBeGreaterThan(5);
    for (const b of flowers) {
      const open = trained.calendar.dateOf(b.openDay!);
      expect(open.year).toBe(2032);
      expect([11, 12]).toContain(open.month);
      const done = trained.calendar.dateOf(b.spentDay!);
      expect(done.year).toBe(2033);
      expect([2, 3]).toContain(done.month);
      const bearer = trained.axes.get(b.axisId)!;
      expect(yearOf(trained, bearer.bornDayAt[b.pointIndex!]!)).toBe(2032);
      expect(yearOf(trained, b.initiatedDay)).toBe(2032);
    }
  });

  it('loses the flowers it is carrying to the February cut that costs the summer clematis nothing', () => {
    const cut: GardenerEvent = { id: 'floor-freckles', date: '2033-02-10', type: 'hard_prune', plantId: 'winter-clematis', target: { allStems: true }, keepM: 0.25 };
    const sim = run(mixed('trained', [cut]), '2033-12-31');
    const rec = sim.events.find((e) => e.eventId === 'floor-freckles')!;
    expect(rec.effects.floralBudsRemoved).toBeGreaterThan(5);
    // the summer clematis, cut the same way ten days later as every year, loses none
    const summer = sim.events.find((e) => e.plantId === 'clematis' && e.type === 'hard_prune' && e.date === '2033-02-20')!;
    expect(summer.effects.floralBudsRemoved).toBe(0);
    for (const b of sim.buds) if (b.endedBy === 'floor-freckles') expect(b.spentDay).toBeNull();
  });

  it('loses the whole of next winter’s display to a cut in autumn, after the buds have formed', () => {
    const cut: GardenerEvent = { id: 'autumn-tidy', date: '2032-10-05', type: 'hard_prune', plantId: 'winter-clematis', target: { allStems: true }, keepM: 0.25 };
    const sim = run(mixed('trained', [cut]), '2033-04-30');
    const rec = sim.events.find((e) => e.eventId === 'autumn-tidy')!;
    // the whole display, which is a display and not a stray flower: the same threshold as the test above. The year
    // formed 11 buds until the plant's shoots in the air were laid by their mechanics, and 10 since: its framework is
    // the same to the centimetre, and one leaf node fewer on its shoots of the year carried a bud.
    expect(rec.effects.floralBudsRemoved).toBeGreaterThan(5);
    expect(opened(sim, 2032).length).toBe(0);
    expect(opened(trained, 2032).length).toBeGreaterThan(5);
    // and the run said, when the buds formed, that any cut before opening would take them
    const note = sim.decisions.find((d) => d.plantId === 'winter-clematis' && d.kind === 'floral_initiated' && yearOf(sim, d.day) === 2032)!;
    expect(note.text).toContain('any cut before then takes them');
  });

  it('flowers again the winter after, on the shoots that regrew', () => {
    const cut: GardenerEvent = { id: 'autumn-tidy', date: '2031-10-05', type: 'hard_prune', plantId: 'winter-clematis', target: { allStems: true }, keepM: 0.25 };
    const sim = run(mixed('trained', [cut]), '2033-04-30');
    expect(opened(sim, 2031).length).toBe(0);
    expect(opened(sim, 2032).length).toBeGreaterThan(3);
  });
});

describe('regrowth after a hard cut', () => {
  it('leaves the same few stubs each year instead of piling stub on stub', () => {
    for (const e of trained.events) {
      if (e.plantId === 'clematis' && e.type === 'hard_prune') expect(e.outcome).toContain('3 stubs');
    }
  });

  it('has nothing standing above the cut the day after, and new shoots by summer', () => {
    const sim = run(mixed('trained'), '2031-02-21');
    for (const a of axesOf(sim, 'clematis')) {
      if (a.removedDay !== null) continue;
      expect(below(sim, a) + lengthOf(a), a.id).toBeLessThanOrEqual(0.25 + 0.04);
    }
    const later = run(mixed('trained'), '2031-07-01');
    const tall = axesOf(later, 'clematis').filter((a) => a.removedDay === null && below(later, a) + lengthOf(a) > 1.5);
    expect(tall.length).toBeGreaterThanOrEqual(3);
    for (const a of tall) expect(yearOf(later, a.bornDay)).toBe(2031);
    expect(later.decisions.some((d) => d.kind === 'regrew' && d.plantId === 'clematis' && yearOf(later, d.day) === 2031)).toBe(true);
  });

  it('replaces a cut wisteria leader with a new shoot from the stub, leaving the cut wood cut', () => {
    const chop: GardenerEvent = { id: 'chop', date: '2031-02-10', type: 'hard_prune', plantId: 'wisteria.0', target: { leader: 0 }, keepM: 3 };
    const s = wisteriaOnVault({ taxa, care: 'trained', years: 6 });
    const sim = run({ ...s, events: [...s.events, chop] }, '2032-12-31');
    const stub = sim.axes.get(sim.plants.get('wisteria.0')!.axisIds[0]!)!;
    expect(lengthOf(stub)).toBeLessThanOrEqual(3.001);
    expect(stub.tip.state).toBe('stopped');
    const shoots = [...sim.axes.values()].filter((a) => a.parent?.axisId === stub.id && a.parent.pointIndex === stub.alive - 1 && a.role === 'leader');
    expect(shoots.length).toBeGreaterThanOrEqual(1);
    expect(shoots.length).toBeLessThanOrEqual(2);
    for (const a of shoots) {
      expect(yearOf(sim, a.bornDay)).toBe(2031);
      expect(lengthOf(a)).toBeGreaterThan(1);
    }
  });
});

// CONSTRAINTS_AND_PHENOLOGY.md section 5; SIMULATION_KEY.md section 9 "Winter realism".
describe('winter', () => {
  const data = toRenderData(trained);
  const inLeafOn = (iso: string) => {
    const day = trained.calendar.dayOf(iso);
    const year = trained.calendar.dateOf(day).year;
    const season = new Map(data.seasons.filter((s) => s.year === year).map((s) => [s.plantId, s]));
    const out: Record<string, number> = {};
    for (const lf of data.leaves) {
      if (lf.bornDay > day || (lf.removedDay >= 0 && day >= lf.removedDay)) continue;
      if (year < lf.firstYear || (lf.lastYear !== null && year > lf.lastYear)) continue;
      const s = season.get(lf.plantId)!;
      if (!lf.evergreen && (day < s.leafFlush[0] || day > s.leafFall[1])) continue;
      out[lf.plantId] = (out[lf.plantId] ?? 0) + 1;
    }
    return out;
  };

  it('is green only where the evergreen is', () => {
    const jan = inLeafOn('2034-01-25');
    expect(jan['honeysuckle']).toBeGreaterThan(200);
    expect(jan['winter-clematis']).toBeGreaterThan(20);
    expect(jan['wisteria.0']).toBeUndefined();
    expect(jan['wisteria.1']).toBeUndefined();
    expect(jan['clematis']).toBeUndefined();
  });

  it('is green everywhere in summer, and mostly wisteria', () => {
    const jul = inLeafOn('2034-07-20');
    expect(jul['honeysuckle']).toBeGreaterThan(200);
    expect(jul['clematis']).toBeGreaterThan(30);
    expect(jul['wisteria.0']! + jul['wisteria.1']!).toBeGreaterThan(jul['honeysuckle']! * 2);
  });

  it('marks leaves as evergreen by taxon, and gives an evergreen leaf more than one season', () => {
    const plantOf = new Map(data.plants.map((p) => [p.id, p.taxonId]));
    const evergreens = ['lonicera-henryi', 'clematis-cirrhosa-freckles'];
    for (const lf of data.leaves) expect(lf.evergreen).toBe(evergreens.includes(plantOf.get(lf.plantId)!));
    const stemLeaves = trained.leaves.filter((l) => l.plantId === 'honeysuckle' && l.lastYear !== null);
    expect(stemLeaves.length).toBeGreaterThan(100);
    for (const l of stemLeaves) expect(l.lastYear! - l.firstYear).toBe(1);
  });
});

// CONSTRAINTS_AND_PHENOLOGY.md section 2: each mechanism by its own rule; KEY.md section 5.
describe('three ways of holding the same structure', () => {
  const pathOf = (a: Axis, from: number, to: number): StemPath => ({ points: a.contact.slice(from, to + 1), away: a.away.slice(from, to + 1), cumulative: a.lengthAt.slice(from, to + 1) });
  const runs = (plantId: string) => axesOf(trained, plantId).flatMap((a) => a.runs.map((r) => ({ a, r, edge: trained.scenario.bower.graph.edges.get(r.edgeId)! })));

  it('has the wisteria twine the glulam leg by itself, and the other two tied up theirs', () => {
    for (const { r, edge } of runs('wisteria.0')) if (edge.id.endsWith('.leg')) expect(r.by).toBe('plant');
    for (const id of ['honeysuckle', 'clematis']) {
      const legs = runs(id).filter((x) => x.edge.id.endsWith('.leg'));
      expect(legs.length, id).toBeGreaterThan(0);
      for (const { r } of legs) {
        expect(r.status === 'trained_by_human' || r.status === 'detached', id).toBe(true);
        expect(r.mode, id).toBe('along');
      }
    }
  });

  it('has the honeysuckle twine cables left-handed and the wisteria right-handed', () => {
    const turns = (plantId: string) =>
      runs(plantId)
        .filter(({ r, edge }) => edge.kind === 'cable' && r.mode === 'twine' && r.lastPoint - r.firstPoint > 12)
        .map(({ a, r }) => turnsOf(pathOf(a, r.firstPoint, r.lastPoint)));
    const h = turns('honeysuckle');
    const w = turns('wisteria.0');
    expect(h.length).toBeGreaterThan(3);
    expect(w.length).toBeGreaterThan(10);
    for (const t of h) expect(t).toBeLessThan(-0.5);
    for (const t of w) expect(t).toBeGreaterThan(0.5);
  });

  it('has the clematis hold cables by its leaf stalks, running along them and never coiling', () => {
    const all = runs('clematis');
    for (const { r } of all) expect(r.mode).toBe('along');
    for (const { r, edge } of all) if (edge.kind === 'cable') expect(r.by).toBe('plant');
    for (const { r, edge } of all) if (edge.kind === 'timber' && r.status !== 'detached') expect(r.status).toBe('trained_by_human');
  });

  it('never lets the clematis reach the crown: its stems stop within their published size band', () => {
    for (let y = 2027; y <= 2034; y++) expect(summary(trained, 'clematis', y).highestM).toBeLessThan(3.1);
    for (const a of axesOf(trained, 'clematis')) if (a.role === 'leader') expect(below(trained, a) + a.lengthAt[a.contact.length - 1]!).toBeLessThanOrEqual(4.05);
  });

  it('leaves the two slender climbers at the foot of the glulam when nobody ties them in', () => {
    for (const id of ['honeysuckle', 'clematis', 'winter-clematis']) {
      expect(summary(untended, id, 2034).frameworkM, id).toBeLessThan(0.1);
      const why = untended.decisions.find((d) => d.plantId === id && d.kind === 'no_route')!;
      expect(why.text, id).toContain('is too thick for');
      expect(why.text, id).toContain('and nobody ties it in');
    }
    expect(summary(untended, 'wisteria.0', 2034).frameworkM).toBeGreaterThan(50);
  });
});

describe('a plant whose flowering wood is not established', () => {
  it('is grown without flowers, and the run says why', () => {
    const sim = run(mixed('trained', [], withHoneysuckleWood(null)), '2030-12-31');
    expect(sim.buds.some((b) => b.plantId === 'honeysuckle')).toBe(false);
    const note = sim.decisions.find((d) => d.plantId === 'honeysuckle' && d.kind === 'not_modelled')!;
    expect(note.text).toContain('not established');
    expect(summary(sim, 'honeysuckle', 2030).frameworkM).toBeGreaterThan(10);
  });

  it('flowers on the year’s growth once that is assumed', () => {
    for (let y = 2029; y <= 2034; y++) expect(summary(trained, 'honeysuckle', y).flowersOpened, String(y)).toBeGreaterThan(0);
    expect(summary(trained, 'honeysuckle', 2027).flowersOpened).toBe(0);
  });
});

describe('borrowed growth models', () => {
  it('say plainly that they are thinner than the wisteria model, for as long as they copy a number from it', () => {
    for (const id of ['lonicera-henryi', 'clematis-viticella-etoile-violette', 'clematis-cirrhosa-freckles']) {
      const { model } = library.get(id)!;
      const copied = Object.values(model.params).filter((p) => (p.basis ?? '').startsWith('Copied from the Wisteria sinensis model'));
      if (copied.length) expect(model.statement, id).toContain('thinner than the wisteria model');
      for (const key of Object.keys(GROWTH_PARAMS)) {
        const p = model.params[key as keyof typeof GROWTH_PARAMS];
        // a part the plant may or may not have (fruit, appendages, side shoots) stays unknown until it is researched:
        // an unknown holds no number, so there is nothing to label
        if (p.status === 'unknown' && (GROWTH_PARAMS_OPTIONAL as readonly string[]).includes(key)) {
          expect(p.value, `${id} ${key}`).toBeNull();
          continue;
        }
        expect(p.value, `${id} ${key}`).not.toBeNull();
        // a number is tied to a source, or it is labelled as an assumption with its basis: nothing in between
        expect(['measured', 'peer_reviewed', 'published_plant_profile', 'calibrated', 'provisional_design_assumption'], `${id} ${key}`).toContain(p.status);
        if (p.status === 'provisional_design_assumption') expect((p.basis ?? '').length, `${id} ${key}`).toBeGreaterThan(10);
        else expect(p.source, `${id} ${key}`).toMatch(/^https:\/\//);
      }
    }
  });

  it('give each plant its own grasp: a rib for wisteria, a lath for honeysuckle, a wire for clematis', () => {
    const grasp = (id: string) => library.get(id)!.model.params['attachment.maxGraspDiameterMm'].value;
    expect(grasp('wisteria-sinensis')).toBeGreaterThan(178);
    expect(grasp('lonicera-henryi')).toBeLessThan(76);
    expect(grasp('lonicera-henryi')).toBeGreaterThan(5);
    expect(grasp('clematis-viticella-etoile-violette')).toBeLessThan(10);
    expect(grasp('clematis-viticella-etoile-violette')).toBeGreaterThanOrEqual(5);
  });
});
