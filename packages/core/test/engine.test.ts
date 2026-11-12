import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadGrowable, loadTaxa } from '../src/node/load-taxa.ts';
import { RENDER_CONTRACT } from '../src/render/contract.ts';
import { Simulation } from '../src/sim/engine.ts';
import { GROWTH_PARAMS, type GrowthModel, parseGrowthModel } from '../src/sim/model.ts';
import { toRenderData } from '../src/sim/render-data.ts';
import { wisteriaOnVault } from '../src/sim/scenarios.ts';
import { type StemPath, turnsOf } from '../src/sim/stem-path.ts';
import type { Axis, GardenerEvent, Scenario } from '../src/sim/types.ts';

const speciesDir = fileURLToPath(new URL('../../../species', import.meta.url));
const taxa = loadGrowable(speciesDir);
const END = '2035-12-31';

const run = (scenario: Scenario, until = END) => new Simulation(scenario).runUntil(until);
const base = (care: 'trained' | 'untended', extra: GardenerEvent[] = []): Scenario => {
  const s = wisteriaOnVault({ taxa, care, years: 9 });
  return { ...s, events: [...s.events, ...extra] };
};
const trained = run(base('trained'));
const untended = run(base('untended'));
const yearOf = (sim: Simulation, day: number) => sim.calendar.dateOf(day).year;
const summary = (sim: Simulation, plantId: string, year: number) => sim.summaries.find((s) => s.plantId === plantId && s.year === year)!;
const livingAxes = (sim: Simulation, plantId?: string) => [...sim.axes.values()].filter((a) => a.removedDay === null && (!plantId || a.plantId === plantId));
const lengthOf = (a: Axis) => (a.alive ? a.lengthAt[a.alive - 1]! : 0);

// SIMULATION_KEY.md section 9 "Wisteria continuity"; DEVELOPMENT_GUIDE.md stage 2 exit check.
describe('the plant persists', () => {
  it('is the same plant, with the same wood, nine years on', () => {
    expect([...untended.plants.keys()]).toEqual(['wisteria.0', 'wisteria.1']);
    const leader = untended.axes.get(untended.plants.get('wisteria.0')!.axisIds[0]!)!;
    expect(leader.role).toBe('leader');
    expect(yearOf(untended, leader.bornDay)).toBe(2027);
    expect(leader.removedDay).toBeNull();
    // wood laid down in the first season is still there, and still where it was
    expect(leader.removedDayAt.slice(0, 20).every((d) => d === null)).toBe(true);
    expect(leader.bornDayAt[5]).toBeLessThan(untended.calendar.dayOf('2027-12-31'));
  });

  it('never loses framework over winter: nothing resets between years', () => {
    for (const id of ['wisteria.0', 'wisteria.1']) {
      let last = 0;
      for (let y = 2027; y <= 2035; y++) {
        const s = summary(untended, id, y);
        expect(s.frameworkM, `${id} ${y}`).toBeGreaterThanOrEqual(last);
        last = s.frameworkM;
      }
      expect(last).toBeGreaterThan(50);
    }
  });

  it('thickens with age and never thins', () => {
    const leader = trained.axes.get(trained.plants.get('wisteria.0')!.axisIds[0]!)!;
    expect(leader.radiusMm[0]).toBeGreaterThan(20);
    for (let i = 1; i < leader.alive; i++) expect(leader.radiusMm[i]!).toBeLessThanOrEqual(leader.radiusMm[i - 1]! + 1e-9);
  });

  it('is bare in winter and in leaf in summer, by the dates it kept', () => {
    const data = toRenderData(untended);
    for (const s of data.seasons) {
      const jan = untended.calendar.dayOf(`${s.year}-01-31`);
      const dec = untended.calendar.dayOf(`${s.year}-12-31`);
      expect(s.leafFlush[0]).toBeGreaterThan(jan);
      expect(s.leafFall[1]).toBeLessThan(dec);
      expect(s.budburstDay).toBeLessThan(s.leafFlush[1]);
    }
  });
});

// SIMULATION_KEY.md section 4.4 and section 9; README: a flowering month is not proof of blooming.
describe('flowers come from buds, not from the calendar', () => {
  it('does not flower before the plant is old enough', () => {
    for (const sim of [trained, untended]) {
      for (const b of sim.buds) if (b.openDay !== null) expect(yearOf(sim, b.openDay)).toBeGreaterThanOrEqual(2030);
      expect(summary(sim, 'wisteria.0', 2029).flowersOpened).toBe(0);
    }
  });

  it('opens only buds that formed the summer before, on wood that is still there', () => {
    let opened = 0;
    for (const b of trained.buds) {
      if (b.openDay === null) continue;
      opened++;
      expect(yearOf(trained, b.initiatedDay)).toBe(yearOf(trained, b.openDay) - 1);
      const bearer = trained.axes.get(b.axisId)!;
      expect(bearer.removedDay === null || bearer.removedDay > b.openDay).toBe(true);
      expect(['spur', 'whip']).toContain(bearer.role);
    }
    expect(opened).toBeGreaterThan(500);
  });

  it('opens no more flowers in a year than buds formed the year before', () => {
    for (let y = 2030; y <= 2035; y++) {
      expect(summary(trained, 'wisteria.0', y).flowersOpened).toBeLessThanOrEqual(summary(trained, 'wisteria.0', y - 1).floralBudsInitiated);
    }
  });

  it('flowers within the plant’s own season, after its buds break', () => {
    const data = toRenderData(trained);
    const season = new Map(data.seasons.map((s) => [`${s.plantId}:${s.year}`, s]));
    for (const f of data.flowers) {
      const s = season.get(`${f.plantId}:${f.year}`)!;
      expect(f.openDay).toBeGreaterThan(s.budburstDay);
      expect(f.openDay).toBeLessThan(s.growthEndDay);
      if (f.spentDay >= 0) expect(f.spentDay).toBeGreaterThan(f.openDay);
    }
  });
});

// SIMULATION_KEY.md section 9 "Pruning response"; CONSTRAINTS section 3 "Hard pruning test".
describe('pruning has consequences', () => {
  const cut: GardenerEvent = { id: 'strip-spurs', date: '2033-02-10', type: 'hard_prune', plantId: 'wisteria.0', target: { allSpursOn: { leader: 0 } }, keepM: 0, author: 'gardener', reason: 'test: remove flowering wood' };
  const stripped = run(base('trained', [cut]));

  it('removes the flower buds with the spurs that bore them, and says so', () => {
    const rec = stripped.events.find((e) => e.eventId === 'strip-spurs')!;
    expect(rec.effects.floralBudsRemoved).toBeGreaterThan(20);
    expect(rec.effects.axesRemoved).toBeGreaterThan(20);
    expect(rec.outcome).toContain('flower bud');
    const lost = stripped.buds.filter((b) => b.endedBy === 'strip-spurs');
    expect(lost.length).toBe(rec.effects.floralBudsRemoved);
    for (const b of lost) {
      expect(b.end).toBe('removed_by_pruning');
      // a saved bud cannot bloom after its bearing shoot has been cut
      expect(b.openDay).toBeNull();
      expect(b.stage).not.toBe('open');
    }
  });

  it('flowers less that spring than the same plant left alone', () => {
    const before = summary(trained, 'wisteria.0', 2033).flowersOpened;
    const after = summary(stripped, 'wisteria.0', 2033).flowersOpened;
    expect(after).toBeLessThan(before);
    expect(before - after).toBeGreaterThanOrEqual(stripped.events.find((e) => e.eventId === 'strip-spurs')!.effects.floralBudsRemoved * 0.9);
  });

  // Each plant draws from its own random streams, so a cut on one cannot reroute or reflower another by chance.
  // What does pass between them is light: the spurs cut off one plant carried leaves that shaded its neighbour.
  it('does not touch the neighbouring plant, but for the light the cut lets through to it', () => {
    const still = (s: Scenario): Scenario => ({ ...s, lightResponse: false });
    const strippedStill = run(still(stripped.scenario));
    const trainedStill = run(still(trained.scenario));
    for (let y = 2027; y <= 2035; y++) expect(summary(strippedStill, 'wisteria.1', y)).toEqual(summary(trainedStill, 'wisteria.1', y));
    // with light acting, the neighbour's framework is still the same: it had more light than its profile asks for either way
    for (let y = 2027; y <= 2035; y++) {
      const a = summary(stripped, 'wisteria.1', y);
      const b = summary(trained, 'wisteria.1', y);
      expect(a.frameworkM).toBe(b.frameworkM);
      expect(a.routeShare).toBe(b.routeShare);
      expect(a.highestM).toBe(b.highestM);
    }
    // its flowering answers to light (its profile: "full sun matters for profuse flowering"), and it has no less of it for the cut
    const light = (sim: Simulation, y: number) => sim.light.of(sim.plants.get('wisteria.1')!, y).seasonShare;
    for (let y = 2033; y <= 2035; y++) expect(light(stripped, y)).toBeGreaterThanOrEqual(light(trained, y));
  });

  it('changes the flowers and nothing else: the framework the plant builds is the same', () => {
    for (let y = 2027; y <= 2035; y++) {
      const a = summary(stripped, 'wisteria.0', y);
      const b = summary(trained, 'wisteria.0', y);
      expect(a.frameworkM, String(y)).toBe(b.frameworkM);
      expect(a.runsSelf + a.runsTied, String(y)).toBe(b.runsSelf + b.runsTied);
      expect(a.routeShare, String(y)).toBe(b.routeShare);
    }
    expect(summary(stripped, 'wisteria.0', 2033).spurs).toBeLessThan(summary(trained, 'wisteria.0', 2033).spurs);
  });

  it('never opens a bud whose wood has gone, in any run', () => {
    for (const sim of [trained, untended, stripped]) {
      for (const b of sim.buds) if (b.end === 'removed_by_pruning') expect(b.openDay).toBeNull();
    }
  });
});

// README working rule: removing a living stem also removes its leaves, buds, flowers and support contacts.
describe('a cut removes lineage', () => {
  const chop: GardenerEvent = { id: 'chop', date: '2031-02-10', type: 'hard_prune', plantId: 'wisteria.0', target: { leader: 0 }, keepM: 3 };
  const sim = run(base('trained', [chop]), '2031-12-31');
  const leader = sim.axes.get(sim.plants.get('wisteria.0')!.axisIds[0]!)!;
  const rec = sim.events.find((e) => e.eventId === 'chop')!;

  it('shortens the stem and keeps the record of what went', () => {
    expect(lengthOf(leader)).toBeLessThanOrEqual(3.001);
    expect(leader.contact.length).toBeGreaterThan(leader.alive);
    expect(leader.removedDayAt[leader.alive]).toBe(rec.day);
    expect(rec.effects.stemRemovedM).toBeGreaterThan(3);
    expect(rec.effects.axesRemoved).toBeGreaterThan(0);
    expect(rec.effects.leafSitesRemoved).toBeGreaterThan(0);
  });

  it('leaves no living shoot, leaf or hold beyond the cut', () => {
    for (const a of livingAxes(sim, 'wisteria.0')) {
      let p = a.parent;
      let child = a;
      while (p) {
        const parent = sim.axes.get(p.axisId)!;
        expect(parent.removedDay, `${child.id} hangs from removed wood`).toBeNull();
        expect(p.pointIndex, `${child.id} hangs beyond a cut on ${parent.id}`).toBeLessThan(parent.alive);
        child = parent;
        p = parent.parent;
      }
    }
    for (const leaf of sim.leaves) {
      if (leaf.axisId === leader.id && leaf.pointIndex >= leader.alive) expect(leaf.removedDay).toBe(rec.day);
    }
    for (const r of leader.runs) if (r.firstPoint >= leader.alive) expect(r.status).toBe('detached');
  });

  it('does not regrow from a calendar reset: the cut leader stays cut', () => {
    expect(leader.tip.state).toBe('stopped');
  });
});

// SIMULATION_KEY.md section 9 "Human override"; DEVELOPMENT_GUIDE.md stage 3 exit check.
describe('a gardener can make a route attainable', () => {
  const w = taxa.get('wisteria-sinensis')!;
  const feeble: GrowthModel = { ...w.model, params: { ...w.model.params, 'attachment.maxGraspDiameterMm': { value: 20, unit: 'mm', status: 'provisional_design_assumption', basis: 'test: a twiner that cannot pass round glulam' } } };
  const feebleTaxa = new Map([['wisteria-sinensis', { profile: w.profile, model: feeble }]]);
  const scenario = (events: GardenerEvent[]): Scenario => ({ ...wisteriaOnVault({ taxa: feebleTaxa, care: 'untended', years: 4 }), events });

  it('leaves a plant that cannot grasp the rib leg at its foot, and says why', () => {
    const sim = run(scenario([]), '2030-12-31');
    expect(summary(sim, 'wisteria.0', 2030).frameworkM).toBeLessThan(0.1);
    expect(summary(sim, 'wisteria.0', 2030).highestM).toBeLessThan(0.3);
    const why = sim.decisions.filter((d) => d.kind === 'no_route' && d.plantId === 'wisteria.0');
    expect(why.length).toBeGreaterThan(0);
    expect(why[0]!.text).toContain('is too thick for a twining stem to grasp (limit 20 mm), and nobody ties it in');
  });

  it('climbs once a gardener ties it in, and the log shows who did it', () => {
    const tie: GardenerEvent = { id: 'tie-in-2028', date: '2028-03-20', type: 'train_leader', plantId: 'wisteria.0', tieToTimber: true, author: 'gardener', reason: 'lead the stems up the rib' };
    const sim = run(scenario([tie]), '2030-12-31');
    expect(summary(sim, 'wisteria.0', 2030).highestM).toBeGreaterThan(3);
    expect(summary(sim, 'wisteria.0', 2030).runsTied).toBeGreaterThan(5);
    const rec = sim.events.find((e) => e.eventId === 'tie-in-2028')!;
    expect(rec.outcome).toContain('led on');
    const leg = sim.axes.get(sim.plants.get('wisteria.0')!.axisIds[0]!)!.runs[0]!;
    expect(leg.status).toBe('trained_by_human');
    expect(leg.by).toBe('tie-in-2028');
    expect(sim.decisions.some((d) => d.kind === 'tied' && d.plantId === 'wisteria.0')).toBe(true);
    // the plant nobody tied is still at its foot
    expect(summary(sim, 'wisteria.1', 2030).highestM).toBeLessThan(0.3);
  });
});

// DEVELOPMENT_GUIDE.md stage 6 exit check.
describe('two gardening calendars, two outcomes', () => {
  const t = summary(trained, 'wisteria.0', 2035);
  const u = summary(untended, 'wisteria.0', 2035);

  it('differs in structure', () => {
    expect(u.runsTied).toBe(0);
    expect(t.runsTied).toBeGreaterThan(50);
    expect(u.whipM).toBeGreaterThan(t.whipM * 5);
  });

  it('differs in flowering', () => {
    expect(t.flowersOpened).toBeGreaterThan(u.flowersOpened * 1.3);
  });

  it('differs in maintenance, and can say which actions caused the change', () => {
    expect(untended.events.every((e) => e.type === 'plant')).toBe(true);
    const prunes = trained.events.filter((e) => e.type === 'spur_prune');
    expect(prunes.length).toBeGreaterThan(20);
    expect(prunes.some((e) => e.effects.stemRemovedM > 1)).toBe(true);
    for (const e of trained.events) {
      expect(e.outcome.length).toBeGreaterThan(10);
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

// KEY.md section 5: the timber is the growing surface. CONSTRAINTS section 2: handedness.
describe('how the plant holds the structure', () => {
  const pathOf = (a: Axis, from: number, to: number): StemPath => ({ points: a.contact.slice(from, to + 1), away: a.away.slice(from, to + 1), cumulative: a.lengthAt.slice(from, to + 1) });

  it('starts every trunk stem up a glulam rib leg, twining it', () => {
    for (const sim of [trained, untended]) {
      for (const a of sim.axes.values()) {
        if (a.role !== 'leader') continue;
        expect(a.runs[0]!.edgeId).toMatch(/^L\.\d[we]\.leg$/);
        expect(a.runs[0]!.mode).toBe('twine');
        expect(a.runs[0]!.by).toBe('plant');
      }
    }
  });

  it('twines right-handed, as Wisteria sinensis does', () => {
    let checked = 0;
    for (const a of untended.axes.values()) {
      for (const [i, r] of a.runs.entries()) {
        if (r.mode !== 'twine' || r.status === 'detached' || r.lastPoint - r.firstPoint < 12) continue;
        // A run the shoot has finished is a whole turn or more. The one it is still on has only to turn the
        // right way: round a rib a coil is most of a metre long, and the shoot may be part of the way round.
        expect(turnsOf(pathOf(a, r.firstPoint, r.lastPoint)), `${a.id} on ${r.edgeId}`).toBeGreaterThan(i < a.runs.length - 1 ? 0.5 : 0);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('lies along the timber lattice where a gardener ties it, and twines the cables by itself', () => {
    let tied = 0;
    let cables = 0;
    for (const a of trained.axes.values()) {
      for (const r of a.runs) {
        const edge = trained.scenario.bower.graph.edges.get(r.edgeId)!;
        if (edge.kind === 'cable') {
          expect(r.mode).toBe('twine');
          expect(r.by).toBe('plant');
          cables++;
        } else if (/^[TE]\./.test(edge.id)) {
          expect(r.mode).toBe('along');
          expect(r.status === 'trained_by_human' || r.status === 'detached').toBe(true);
          tied++;
        }
      }
    }
    expect(tied).toBeGreaterThan(100);
    expect(cables).toBeGreaterThan(30);
  });

  it('keeps every supported point on the surface of the member or cable that carries it', () => {
    const { graph } = trained.scenario.bower;
    let checked = 0;
    for (const sim of [trained, untended]) {
      for (const a of sim.axes.values()) {
        for (const r of a.runs) {
          const edge = graph.edges.get(r.edgeId)!;
          const sec = edge.section;
          const half = sec.shape === 'round' ? [sec.diameterMm / 2000, sec.diameterMm / 2000] : [Math.min(sec.widthMm, sec.depthMm) / 2000, Math.hypot(sec.widthMm, sec.depthMm) / 2000];
          const samples: { x: number; y: number; z: number }[] = [];
          const n = Math.ceil(edge.axis.length / 0.004);
          for (let i = 0; i <= n; i++) samples.push(edge.axis.pointAt((i / n) * edge.axis.length));
          // the first and last few points of a run cross over the lattice node at each end
          for (let i = r.firstPoint + 3; i <= r.lastPoint - 3; i++) {
            const p = a.contact[i]!;
            let d = Infinity;
            for (const q of samples) d = Math.min(d, Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z));
            // never inside the section, never floating off it (allowing for the lane a second stem takes)
            expect(d, `${a.id} on ${edge.id}`).toBeGreaterThan(half[0]! - 0.002);
            expect(d, `${a.id} on ${edge.id}`).toBeLessThan(half[1]! * 1.16 + 0.05);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(5000);
  });

  it('stays within the structure: nothing wanders off into space', () => {
    for (const sim of [trained, untended]) {
      for (const a of sim.axes.values()) {
        for (const p of a.contact) {
          expect(Math.abs(p.x)).toBeLessThan(4.6);
          expect(Math.abs(p.y)).toBeLessThan(5);
          expect(p.z).toBeGreaterThan(-0.6);
          expect(p.z).toBeLessThan(5.5);
        }
      }
    }
  });

  it('holds everything itself when nobody gardens', () => {
    for (const a of untended.axes.values()) for (const r of a.runs) expect(r.by).toBe('plant');
  });

  it('never crowds a member beyond what it is given to carry', () => {
    for (const sim of [trained, untended]) {
      const count = new Map<string, number>();
      for (const a of sim.axes.values()) for (const r of a.runs) if (r.status !== 'detached') count.set(r.edgeId, (count.get(r.edgeId) ?? 0) + 1);
      // three on a glulam rib, leg or run; two on the lattice or a cable
      for (const [edgeId, n] of count) expect(n, edgeId).toBeLessThanOrEqual(/^[LR]\./.test(edgeId) ? 3 : 2);
    }
  });

  it('explains each choice of route', () => {
    const first = trained.decisions.find((d) => d.kind === 'route_chosen')!;
    expect(first.text).toContain('L.1w.leg');
    expect(first.text).toContain('glulam');
    expect(trained.decisions.filter((d) => d.kind === 'no_route').every((d) => d.text.includes('no way on'))).toBe(true);
  });
});

describe('runs are repeatable', () => {
  it('gives the same plant for the same seed and a different one for another', () => {
    const a = JSON.stringify(toRenderData(run(wisteriaOnVault({ taxa, care: 'trained', years: 4, seed: 7 }), '2030-12-31')));
    const b = JSON.stringify(toRenderData(run(wisteriaOnVault({ taxa, care: 'trained', years: 4, seed: 7 }), '2030-12-31')));
    const c = JSON.stringify(toRenderData(run(wisteriaOnVault({ taxa, care: 'trained', years: 4, seed: 8 }), '2030-12-31')));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

// SIMULATION_KEY.md section 8: outputs.
describe('render data', () => {
  const data = toRenderData(trained);

  it('is plain JSON under the published contract', () => {
    expect(data.contract).toBe(RENDER_CONTRACT);
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
    expect(data.frame).toContain('z up');
    expect(data.lastDay).toBe(trained.day);
    expect(data.plants.map((p) => p.label)).toEqual(['Wisteria sinensis', 'Wisteria sinensis']);
  });

  it('gives every stem point a contact, a direction away from its support, a birthday and a radius', () => {
    expect(data.stems.length).toBeGreaterThan(1000);
    for (const s of data.stems) {
      const n = s.bornDay.length;
      expect(n).toBeGreaterThanOrEqual(2);
      expect(s.contact.length).toBe(3 * n);
      expect(s.away.length).toBe(3 * n);
      expect(s.removedDay.length).toBe(n);
      expect(s.radiusMm.length).toBe(n);
      for (let i = 0; i < n; i++) {
        expect(Number.isFinite(s.contact[3 * i]! + s.contact[3 * i + 1]! + s.contact[3 * i + 2]!)).toBe(true);
        expect(s.removedDay[i] === -1 || s.removedDay[i]! >= s.bornDay[i]!).toBe(true);
        if (i) expect(s.bornDay[i]!).toBeGreaterThanOrEqual(s.bornDay[i - 1]!);
      }
    }
  });

  it('keeps cut wood in the record so that the past can still be shown', () => {
    expect(data.stems.some((s) => s.removedDay.some((d) => d >= 0))).toBe(true);
  });

  it('carries leaves, the flowers that opened, the seasons kept and the gardener’s log', () => {
    expect(data.leaves.length).toBeGreaterThan(5000);
    expect(data.flowers.length).toBe(trained.buds.filter((b) => b.openDay !== null).length);
    expect(data.seasons.length).toBe(2 * 9);
    expect(data.events.length).toBe(trained.events.length);
  });

  it('says what it is: a scenario resting on unmeasured assumptions', () => {
    expect(data.statement).toContain('not a forecast');
    expect(data.assumptions.measured).toBe(0);
    expect(data.assumptions.calibrated).toBe(0);
    expect(data.assumptions.provisional_design_assumption).toBeGreaterThan(45);
    expect(data.assumptions.provisional_design_assumption + data.assumptions.published_plant_profile).toBe(Object.keys(GROWTH_PARAMS).length);
  });
});

describe('growth model file', () => {
  const model = taxa.get('wisteria-sinensis')!.model;

  it('labels every number the engine uses, and claims no measurement', () => {
    for (const key of Object.keys(GROWTH_PARAMS)) {
      const p = model.params[key as keyof typeof GROWTH_PARAMS];
      expect(p.value, key).not.toBeNull();
      expect(['provisional_design_assumption', 'published_plant_profile'], key).toContain(p.status);
      expect((p.basis ?? '').length, key).toBeGreaterThan(10);
    }
    expect(model.statement).toContain('not a calibrated one');
  });

  it('refuses a model with a missing, unknown or unlabelled number', () => {
    const copy = () => JSON.parse(JSON.stringify(model));
    const missing = copy();
    delete missing.params['extension.leaderMPerSeason'];
    expect(() => parseGrowthModel(missing)).toThrow();
    const unknown = copy();
    unknown.params['extension.leaderMPerSeason'] = { value: null, status: 'unknown' };
    expect(() => parseGrowthModel(unknown)).toThrow(/cannot run on an unknown/);
    const bare = copy();
    bare.params['extension.leaderMPerSeason'] = 2.6;
    expect(() => parseGrowthModel(bare)).toThrow();
    const unbased = copy();
    unbased.params['extension.leaderMPerSeason'] = { value: 2.6, status: 'provisional_design_assumption' };
    expect(() => parseGrowthModel(unbased)).toThrow(/needs a basis/);
  });
});

// CONSTRAINTS section 2: a non-climber must not be routed into the climbing graph.
describe('plants that do not climb', () => {
  it('keeps a shrub in its bed', () => {
    const shrub = loadTaxa(speciesDir).get('sarcococca-confusa')!;
    const s = wisteriaOnVault({ taxa, care: 'untended', years: 2 });
    const mixed = new Map([...taxa, ['sarcococca-confusa', { profile: shrub, model: taxa.get('wisteria-sinensis')!.model }]]);
    const sim = run({ ...s, taxa: mixed, plantings: [{ plantId: 'box', taxonId: 'sarcococca-confusa', stationId: 'station.0', date: '2027-03-12' }] }, '2028-12-31');
    expect(sim.plants.get('box')!.axisIds.length).toBe(0);
    expect(sim.decisions.some((d) => d.plantId === 'box' && d.text.includes('shrub'))).toBe(true);
  });
});

describe('events the model does not act on yet', () => {
  it('records them and says so, instead of pretending', () => {
    const water: GardenerEvent = { id: 'water-1', date: '2028-07-01', type: 'water', plantId: 'wisteria.0', note: '20 litres' };
    const sim = run(base('untended', [water]), '2028-12-31');
    const rec = sim.events.find((e) => e.eventId === 'water-1')!;
    expect(rec.modelled).toBe(false);
    expect(rec.outcome).toContain('does not yet act');
  });
});
