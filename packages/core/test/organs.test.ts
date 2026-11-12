import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { v3 } from '../src/math/vec3.ts';
import { loadGrowable } from '../src/node/load-taxa.ts';
import type { RenderData } from '../src/render/contract.ts';
import { appendagePresent, fruitState } from '../src/render/presence.ts';
import { Simulation } from '../src/sim/engine.ts';
import { GROWTH_PARAMS, GROWTH_PARAMS_OPTIONAL, type GrowthModel, type GrowthNames, type GrowthParamKey, type OptionalParamKey, known, param, parseGrowthModel, withParam, withUnknown } from '../src/sim/model.ts';
import { toRenderData } from '../src/sim/render-data.ts';
import { designReport, formatDesignReport } from '../src/sim/report.ts';
import { type Growable, attachmentTrial, plantsOnHemisphere, wisteriaOnVault } from '../src/sim/scenarios.ts';
import type { Axis, GardenerEvent, Scenario } from '../src/sim/types.ts';
import { APPENDAGE_KIND, ORGAN_HELD } from '../src/vocab.ts';
import { withFloweringWood } from './helpers.ts';

const speciesDir = fileURLToPath(new URL('../../../species', import.meta.url));
const library = loadGrowable(speciesDir);
const run = (s: Scenario, until: string) => new Simulation(s).runUntil(until);

type Values = { [K in GrowthParamKey]?: NonNullable<GrowthModel['params'][K]['value']> };

/**
 * A model with none of the parts a taxon may or may not have: every optional
 * parameter unknown and no names. The tests below switch on what they are
 * about, so that they say what they assume and do not depend on how far the
 * research behind a taxon's own file has got.
 */
function bare(model: GrowthModel): GrowthModel {
  let out: GrowthModel = { ...model, names: {} };
  for (const key of GROWTH_PARAMS_OPTIONAL) out = withUnknown(out, key);
  return out;
}

/** The library with one taxon stripped bare and then given these numbers and names. */
function vary(taxa: Growable, id: string, values: Values, names: GrowthNames = {}): Growable {
  const t = taxa.get(id);
  if (!t) throw new Error(`no taxon ${id} in the library`);
  let model = bare(t.model);
  for (const [key, value] of Object.entries(values)) model = withParam(model, key as GrowthParamKey, value as never, 'test: a part switched on to see what the engine does with it');
  return new Map([...taxa, [id, { profile: t.profile, model: { ...model, names } }]]);
}

const dot = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a: { x: number; y: number; z: number }) => Math.hypot(a.x, a.y, a.z);
const lengthOf = (a: Axis) => (a.contact.length ? a.lengthAt[a.contact.length - 1]! : 0);
/** The stretch of route a stem point was laid on, if it was laid on one. */
const runAt = (a: Axis, i: number) => a.runs.find((r) => i > r.firstPoint && i <= r.lastPoint);
/** Everything in the render data that existed before fruit, appendages and side shoots, as text. */
const rest = (d: RenderData, keep: (stemId: string) => boolean = () => true) =>
  JSON.stringify({ stems: d.stems.filter((s) => keep(s.id)), leaves: d.leaves.filter((l) => keep(l.stemId)), flowers: d.flowers.filter((f) => keep(f.stemId)), seasons: d.seasons, events: d.events });

// ============================================================================================================
// SIMULATION_KEY.md section 3: "Unknown species parameters should stay unfilled rather than adopting universal
// constants without explanation." PROJECT_CONTEXT.md section 10: "Do not silently invent missing numbers".
// ============================================================================================================
describe('a growth model may leave the parts a plant may or may not have unknown', () => {
  const wisteria = library.get('wisteria-sinensis')!.model;
  const copy = () => JSON.parse(JSON.stringify(wisteria));

  it('accepts unknown for those parameters and for no others', () => {
    for (const key of GROWTH_PARAMS_OPTIONAL) {
      const m = copy();
      m.params[key] = { value: null, status: 'unknown' };
      expect(() => parseGrowthModel(m), key).not.toThrow();
    }
    const required = (Object.keys(GROWTH_PARAMS) as GrowthParamKey[]).filter((k) => !(GROWTH_PARAMS_OPTIONAL as readonly string[]).includes(k));
    expect(required.length).toBeGreaterThan(50);
    for (const key of required) {
      const m = copy();
      m.params[key] = { value: null, status: 'unknown' };
      expect(() => parseGrowthModel(m), key).toThrow(/cannot run on an unknown/);
    }
  });

  it('still refuses a missing required parameter, a bare number, and a number with no stated basis', () => {
    const missing = copy();
    delete missing.params['organs.leafLengthM'];
    expect(() => parseGrowthModel(missing)).toThrow();
    const bareNumber = copy();
    bareNumber.params['fruit.setShare'] = 0.2;
    expect(() => parseGrowthModel(bareNumber)).toThrow();
    const unbased = copy();
    unbased.params['fruit.setShare'] = { value: 0.2, status: 'provisional_design_assumption' };
    expect(() => parseGrowthModel(unbased)).toThrow(/needs a basis/);
    const guessed = copy();
    guessed.params['fruit.setShare'] = { value: 0.2, status: 'unknown' };
    expect(() => parseGrowthModel(guessed)).toThrow(/must not carry a value/);
  });

  it('refuses values that cannot be what they say: a share above one, a day of the year past the year, a pattern of anything but 0 and 1', () => {
    const bad: [OptionalParamKey, unknown][] = [
      ['fruit.setShare', 1.2],
      ['appendages.leafStalkCoilShare', -0.1],
      ['sideShoots.terminalFlowerShare', 2],
      ['fruit.ripenDoy', [250, 400]],
      // first day later than last is a window through the new year and is accepted (habits.test.ts); a day 0 is no day
      ['fruit.fallDoy', [90, 0]],
      ['fruit.lengthM', [0.2, 0.1]],
      ['appendages.tendrilNodePattern', [1, 2, 0]],
      ['appendages.tendrilNodePattern', []],
      ['appendages.prickleLengthM', [-0.01, 0.01]],
      ['sideShoots.lifespanYears', 1.5],
    ];
    for (const [key, value] of bad) {
      const m = copy();
      m.params[key] = { value, status: 'provisional_design_assumption', basis: 'test: a value that should be refused' };
      expect(() => parseGrowthModel(m), `${key} = ${JSON.stringify(value)}`).toThrow();
    }
  });

  it('keeps the words a model passes to a viewer in a section of their own, strictly checked', () => {
    const ok = copy();
    ok.names = { leafForm: 'juvenile_lobed', sideShootLeafForm: 'adult_unlobed', flowerForm: 'umbel', fruitForm: 'berry_cluster', flowerHeld: 'facing_out', fruitHeld: 'upright', basis: 'test' };
    expect(parseGrowthModel(ok).names.sideShootLeafForm).toBe('adult_unlobed');
    for (const names of [{ leafForm: 'Juvenile Lobed' }, { leafForm: '' }, { flowerHeld: 'sideways' }, { petalCount: 5 }, { flowerHeld: { value: 'hanging', status: 'unknown' } }]) {
      const m = copy();
      m.names = names;
      expect(() => parseGrowthModel(m), JSON.stringify(names)).toThrow();
    }
    const none = copy();
    delete none.names;
    expect(() => parseGrowthModel(none)).toThrow();
    // every way of holding an organ in the vocabulary is accepted
    for (const held of ORGAN_HELD) {
      const m = copy();
      m.names = { flowerHeld: held };
      expect(parseGrowthModel(m).names.flowerHeld).toBe(held);
    }
  });
});

// ============================================================================================================
// SIMULATION_KEY.md section 2: "Leaf / Flower / Fruit cohort: organ type, birth date, ... developmental stage
// and senescence time." CONSTRAINTS_AND_PHENOLOGY.md section 4: fruit development follows pollination and
// pruning, and visible bloom is "not an unconditional month switch". README working rule: a flowering month
// is an envelope, not a trigger.
// ============================================================================================================
describe('fruit: Wisteria sinensis pods on the vault segment', () => {
  const model = library.get('wisteria-sinensis')!.model;
  const scenario = (taxa: Growable, extra: GardenerEvent[] = []): Scenario => {
    const s = wisteriaOnVault({ taxa, care: 'trained', years: 9 });
    return { ...s, events: [...s.events, ...extra] };
  };
  const END = '2035-12-31';
  const sim = run(scenario(library), END);
  const data = toRenderData(sim);
  const cal = sim.calendar;
  const doy = (day: number) => cal.dateOf(day).dayOfYear;
  const year = (day: number) => cal.dateOf(day).year;

  it('has every number it needs, each labelled, and only the pod length is published', () => {
    for (const key of ['fruit.setShare', 'fruit.lengthM', 'fruit.swellDays', 'fruit.ripenDoy', 'fruit.fallDoy'] as const) {
      const p = model.params[key];
      expect(p.value, key).not.toBeNull();
      expect((p.basis ?? '').length, key).toBeGreaterThan(20);
      expect(p.status, key).toBe(key === 'fruit.lengthM' ? 'published_plant_profile' : 'provisional_design_assumption');
    }
    expect(model.params['fruit.lengthM'].source).toMatch(/^https:\/\/www\.treesandshrubsonline\.org\//);
    expect(model.names.fruitHeld).toBe('hanging');
  });

  it('sets fruit only where a flower opened and went over on the plant, on the day its petals fell', () => {
    expect(sim.fruits.length).toBeGreaterThan(100);
    const spent = new Map(sim.buds.filter((b) => b.spentDay !== null).map((b) => [`${b.axisId}|${b.spentDay}`, b]));
    for (const f of sim.fruits) {
      const flower = spent.get(`${f.axisId}|${f.swell[0]}`);
      expect(flower, f.id).toBeDefined();
      expect(f.position).toEqual(flower!.position);
      expect(f.year).toBe(year(flower!.spentDay!));
      // the wood it sits on is the plant's own, and was there when it set
      const bearer = sim.axes.get(f.axisId)!;
      expect(bearer.plantId).toBe(f.plantId);
      expect(bearer.bornDay).toBeLessThan(f.swell[0]);
    }
    // a flower cut off before its petals fell set nothing
    for (const b of sim.buds) if (b.end !== null) expect(sim.fruits.some((f) => f.axisId === b.axisId && f.swell[0] === b.endedDay)).toBe(false);
  });

  it('sets none before the plant flowers, and about the share of flowers the model gives', () => {
    for (const f of sim.fruits) expect(f.year).toBeGreaterThanOrEqual(2030);
    const share = known(model, 'fruit.setShare')!;
    const flowers = sim.buds.filter((b) => b.spentDay !== null).length;
    expect(sim.fruits.length / flowers).toBeGreaterThan(share * 0.75);
    expect(sim.fruits.length / flowers).toBeLessThan(share * 1.25);
    for (const s of sim.summaries) {
      expect(s.fruitsSet, `${s.plantId} ${s.year}`).toBeLessThanOrEqual(s.flowersOpened);
      expect(s.fruitsSet, `${s.plantId} ${s.year}`).toBe(sim.fruits.filter((f) => f.plantId === s.plantId && f.year === s.year).length);
    }
  });

  it('swells, ripens in the ripening window and falls in the fall window, in that order', () => {
    const [len0, len1] = known(model, 'fruit.lengthM')!;
    const [swell0, swell1] = known(model, 'fruit.swellDays')!;
    const [ripen0, ripen1] = known(model, 'fruit.ripenDoy')!;
    const [fall0, fall1] = known(model, 'fruit.fallDoy')!;
    for (const f of sim.fruits) {
      expect(f.lengthM).toBeGreaterThanOrEqual(len0);
      expect(f.lengthM).toBeLessThanOrEqual(len1);
      expect(f.swell[1] - f.swell[0]).toBeGreaterThanOrEqual(swell0);
      expect(f.swell[1] - f.swell[0]).toBeLessThanOrEqual(swell1);
      expect(f.ripen[0]).toBeGreaterThanOrEqual(f.swell[1]);
      expect(f.ripen[1]).toBeGreaterThan(f.ripen[0]);
      expect(f.fallPlannedDay).toBeGreaterThan(f.ripen[1]);
      expect(doy(f.ripen[0])).toBeGreaterThanOrEqual(ripen0);
      expect(doy(f.ripen[1])).toBeLessThanOrEqual(ripen1);
      expect(doy(f.fallPlannedDay)).toBeGreaterThanOrEqual(fall0);
      expect(doy(f.fallPlannedDay)).toBeLessThanOrEqual(fall1);
      // a window early in the year is next year's: the pods hang on the bare plant through the winter
      expect(year(f.fallPlannedDay)).toBe(f.year + 1);
    }
  });

  it('is gone from the day it fell, and still on the plant at the end of the run if its day has not come', () => {
    const fell = sim.fruits.filter((f) => f.removedBy === 'fell');
    const hanging = sim.fruits.filter((f) => f.removedDay === null);
    expect(fell.length).toBeGreaterThan(50);
    expect(hanging.length).toBeGreaterThan(50);
    expect(fell.length + hanging.length).toBe(sim.fruits.length);
    for (const f of fell) expect(f.removedDay).toBe(f.fallPlannedDay);
    for (const f of hanging) expect(f.fallPlannedDay).toBeGreaterThan(sim.day);
    expect(data.fruits).toHaveLength(sim.fruits.length);
    expect(data.fruits.filter((f) => f.removedDay === -1)).toHaveLength(hanging.length);
  });

  it('hangs: a fruit held that way is given no direction, and one held upright is', () => {
    for (const f of data.fruits) {
      expect(f.direction).toBeUndefined();
      expect(f.form).toBeUndefined();
    }
    const t = library.get('wisteria-sinensis')!;
    const upright = new Map([...library, ['wisteria-sinensis', { profile: t.profile, model: { ...model, names: { ...model.names, fruitHeld: 'upright' as const, fruitForm: 'pod' } } }]]);
    const other = toRenderData(run(scenario(upright), '2031-12-31'));
    expect(other.fruits.length).toBeGreaterThan(0);
    for (const f of other.fruits) {
      expect(f.direction![2]).toBeGreaterThan(0.9);
      expect(Math.hypot(...f.direction!)).toBeCloseTo(1, 3);
      expect(f.form).toBe('pod');
    }
  });

  it('tells a viewer what stage a fruit is at on any day, from the fruit’s own days', () => {
    const f = data.fruits.find((x) => x.year === 2033 && x.removedDay > 0)!;
    expect(fruitState(f, f.swell[0] - 1)).toEqual({ phase: 'absent', size: 0, ripeness: 0 });
    const young = fruitState(f, f.swell[0] + 10);
    expect(young.phase).toBe('swelling');
    expect(young.size).toBeGreaterThan(0);
    expect(young.size).toBeLessThan(1);
    expect(young.ripeness).toBe(0);
    if (f.ripen[0] > f.swell[1]) expect(fruitState(f, f.swell[1])).toEqual({ phase: 'full', size: 1, ripeness: 0 });
    expect(fruitState(f, f.ripen[0]).phase).toBe('ripening');
    expect(fruitState(f, f.ripen[1])).toEqual({ phase: 'ripe', size: 1, ripeness: 1 });
    expect(fruitState(f, f.removedDay - 1).phase).toBe('ripe');
    expect(fruitState(f, f.removedDay).phase).toBe('absent');
  });

  it('is counted in the design report month by month: green in summer, hanging through the winter, gone by spring', () => {
    const r = designReport(sim);
    const on = (month: number) => (r.months.find((m) => m.month === month)!.fruits['wisteria.0'] ?? 0) + (r.months.find((m) => m.month === month)!.fruits['wisteria.1'] ?? 0);
    expect(on(5)).toBe(0);
    expect(on(7)).toBeGreaterThan(50);
    expect(on(12)).toBe(on(7));
    // January's are last year's pods, still hanging on the bare plant
    expect(on(1)).toBeGreaterThan(0);
    expect(on(4)).toBe(0);
    expect(formatDesignReport(r)).toContain('fruit on the plant, from just set to ripe, by plant');
  });

  // README working rule: removing a living stem also removes its leaves, buds, flowers and support contacts.
  // HORTICULTURAL_INTERVENTIONS.md section 2: "Pruning should remove descendants in the plant graph and any
  // associated organ/attachment states."
  describe('when the wood that bears it is cut', () => {
    const cut: GardenerEvent = { id: 'strip-in-autumn', date: '2033-11-10', type: 'hard_prune', plantId: 'wisteria.0', target: { allSpursOn: { leader: 0 } }, keepM: 0, author: 'gardener', reason: 'test: take the spurs off while the pods hang' };
    const stripped = run(scenario(library, [cut]), END);
    const day = stripped.calendar.dayOf(cut.date);

    it('goes with its stem on the day of the cut, and never falls afterwards', () => {
      const taken = stripped.fruits.filter((f) => f.removedBy === 'strip-in-autumn');
      expect(taken.length).toBeGreaterThan(2);
      for (const f of taken) {
        expect(f.removedDay).toBe(day);
        expect(f.fallPlannedDay).toBeGreaterThan(day);
        expect(stripped.axes.get(f.axisId)!.removedDay).toBe(day);
      }
      const d = toRenderData(stripped);
      for (const f of d.fruits.filter((x) => x.removedDay === day)) expect(fruitState(f, day).phase).toBe('absent');
    });

    it('leaves no fruit on wood that has gone, in any run', () => {
      for (const s of [sim, stripped]) {
        for (const f of s.fruits) {
          const gone = s.axes.get(f.axisId)!.removedDayAt[f.pointIndex] ?? null;
          if (gone !== null) expect(f.removedDay, f.id).not.toBeNull();
          if (gone !== null) expect(f.removedDay!, f.id).toBeLessThanOrEqual(gone);
        }
      }
    });

    // Each plant draws from its own random streams, so a cut on one cannot change another's fruit by chance. What does
    // pass between them is light (sim/light.ts): the spurs cut off one plant carried leaves that shaded its neighbour,
    // whose flowering answers to light. So the claim is tested with light told not to act.
    it('does not touch the neighbouring plant’s fruit, light apart', () => {
      const mine = (s: Simulation) => s.fruits.filter((f) => f.plantId === 'wisteria.1').map((f) => [f.axisId, f.swell, f.ripen, f.removedDay]);
      const still = (s: Simulation) => run({ ...s.scenario, lightResponse: false }, END);
      expect(mine(still(stripped))).toEqual(mine(still(sim)));
      // with light acting the neighbour's fruit follows its flowers, and it never has less light for the cut
      const light = (s: Simulation) => s.light.of(s.plants.get('wisteria.1')!, 2034).seasonShare;
      expect(light(stripped)).toBeGreaterThanOrEqual(light(sim));
    });
  });

  describe('when the model leaves its numbers unknown', () => {
    const t = library.get('wisteria-sinensis')!;
    const without = new Map([...library, ['wisteria-sinensis', { profile: t.profile, model: withUnknown(model, 'fruit.swellDays') }]]);
    const bareRun = run(scenario(without), END);

    it('sets no fruit, and says so once for each plant', () => {
      expect(bareRun.fruits).toHaveLength(0);
      expect(toRenderData(bareRun).fruits).toEqual([]);
      for (const id of ['wisteria.0', 'wisteria.1']) {
        const notes = bareRun.decisions.filter((d) => d.plantId === id && d.kind === 'part_not_modelled');
        expect(notes).toHaveLength(1);
        expect(notes[0]!.text).toContain('no fruit is modelled for Wisteria sinensis');
        expect(notes[0]!.text).toContain('fruit.swellDays');
        expect(notes[0]!.text).not.toContain('fruit.lengthM');
      }
      const alerts = designReport(bareRun).alerts.filter((a) => a.kind === 'part_not_modelled');
      expect(alerts.map((a) => a.plantId)).toEqual(['wisteria.0', 'wisteria.1']);
      // and it is not confused with a plant whose flowers are not modelled
      expect(designReport(bareRun).alerts.some((a) => a.kind === 'not_modelled')).toBe(false);
      expect(sim.decisions.some((d) => d.kind === 'part_not_modelled')).toBe(false);
    });

    it('says nothing where the model says outright that nothing sets', () => {
      const sterile = new Map([...library, ['wisteria-sinensis', { profile: t.profile, model: withParam(withUnknown(model, 'fruit.lengthM'), 'fruit.setShare', 0, 'test: a plant that sets no fruit') }]]);
      const s = run(scenario(sterile), '2031-12-31');
      expect(s.fruits).toHaveLength(0);
      expect(s.decisions.some((d) => d.kind === 'part_not_modelled')).toBe(false);
    });

    // CLAUDE.md: an intervention changes only what it touches, so that scenarios stay comparable.
    it('grows the same plant, to the last stem, leaf and flower, whether fruit is modelled or not', () => {
      expect(rest(toRenderData(bareRun))).toBe(rest(data));
      expect(bareRun.summaries.map((s) => ({ ...s, fruitsSet: 0 }))).toEqual(sim.summaries.map((s) => ({ ...s, fruitsSet: 0 })));
    });
  });
});

// ============================================================================================================
// CONSTRAINTS_AND_PHENOLOGY.md section 2, mechanical attachment classes; SIMULATION_KEY.md section 9,
// "Attachment exclusivity": a rose does not self-twine, an aerial-root species does not become a tendril
// climber. Each appendage belongs to the way of climbing that has it, and its numbers are the taxon's own.
// ============================================================================================================
describe('appendages: what each way of climbing holds on with', () => {
  const TENDRILS = { 'appendages.tendrilNodePattern': [1, 1, 0], 'appendages.tendrilLengthM': [0.1, 0.2] } satisfies Values;
  const STALKS = { 'appendages.leafStalkCoilShare': 0.6, 'appendages.leafStalkLengthM': [0.03, 0.06] } satisfies Values;
  const ROOTLETS = { 'appendages.aerialRootPatchSpacingM': [0.03, 0.08], 'appendages.aerialRootLengthM': [0.003, 0.008] } satisfies Values;
  const PRICKLES = { 'appendages.prickleSpacingM': [0.01, 0.03], 'appendages.prickleLengthM': [0.004, 0.009] } satisfies Values;
  let taxa = vary(library, 'vitis-coignetiae', TENDRILS);
  taxa = vary(taxa, 'clematis-viticella-etoile-violette', STALKS);
  taxa = vary(taxa, 'hedera-helix', ROOTLETS);
  taxa = vary(taxa, 'rosa-the-generous-gardener', PRICKLES);
  taxa = vary(taxa, 'lonicera-henryi', {});
  const END = '2032-12-31';
  const sim = run(attachmentTrial({ taxa, care: 'trained', years: 6 }), END);
  const data = toRenderData(sim);
  const of = (plantId: string) => sim.appendages.filter((a) => a.plantId === plantId);
  const axesOf = (plantId: string) => sim.plants.get(plantId)!.axisIds.map((id) => sim.axes.get(id)!);

  it('gives each plant the kind its way of climbing has, and no other', () => {
    const kinds = (plantId: string) => [...new Set(of(plantId).map((a) => a.kind))];
    expect(kinds('vine')).toEqual(['tendril']);
    expect(kinds('clematis')).toEqual(['leaf_stalk_coil']);
    expect(kinds('ivy')).toEqual(['aerial_roots']);
    expect(kinds('rose')).toEqual(['prickle']);
    // a stem twiner holds on with its stem: wisteria's model says so, and the honeysuckle's says nothing
    expect(of('wisteria')).toHaveLength(0);
    expect(of('honeysuckle')).toHaveLength(0);
    expect(new Set(sim.appendages.map((a) => a.kind))).toEqual(new Set(APPENDAGE_KIND));
  });

  it('puts a tendril at the leaf nodes the taxon’s pattern gives one to: two nodes with, one without', () => {
    const plant = sim.plants.get('vine')!;
    let checked = 0;
    for (const a of axesOf('vine')) {
      const nodes = plant.leafNodes.filter((n) => n.axisId === a.id);
      const tendrils = of('vine').filter((t) => t.axisId === a.id);
      expect(tendrils.map((t) => t.pointIndex), a.id).toEqual(nodes.filter((_, k) => k % 3 !== 2).map((n) => n.pointIndex));
      checked += tendrils.length;
    }
    expect(checked).toBeGreaterThan(200);
    for (const t of of('vine')) {
      expect(t.lengthM).toBeGreaterThanOrEqual(0.1);
      expect(t.lengthM).toBeLessThanOrEqual(0.2);
      expect(len(t.direction)).toBeCloseTo(1, 6);
    }
  });

  it('has a tendril holding where the shoot grasped the stretch itself, and holding nothing on a tied stretch or a shoot in the air', () => {
    let holding = 0;
    let onTied = 0;
    let inAir = 0;
    for (const t of of('vine')) {
      const a = sim.axes.get(t.axisId)!;
      const r = runAt(a, t.pointIndex);
      expect(t.holding, `${a.id} point ${t.pointIndex}`).toBe(r !== undefined && r.by === 'plant');
      if (t.holding) {
        holding++;
        // it reaches for what it holds: back towards the support
        expect(dot(t.direction, a.away[t.pointIndex]!)).toBeLessThan(0);
      } else if (r) onTied++;
      else inAir++;
    }
    expect(holding).toBeGreaterThan(50);
    expect(onTied).toBeGreaterThan(50);
    expect(inAir).toBeGreaterThan(50);
  });

  it('coils a leaf stalk only on stretches a leaf-stalk climber holds by itself, and not at every node there', () => {
    const plant = sim.plants.get('clematis')!;
    const coils = of('clematis');
    expect(coils.length).toBeGreaterThan(10);
    for (const c of coils) {
      const a = sim.axes.get(c.axisId)!;
      expect(runAt(a, c.pointIndex)?.by).toBe('plant');
      expect(c.holding).toBe(true);
      expect(plant.leafNodes.some((n) => n.axisId === c.axisId && n.pointIndex === c.pointIndex)).toBe(true);
      expect(dot(c.direction, a.away[c.pointIndex]!)).toBeLessThan(0);
      expect(c.lengthM).toBeGreaterThanOrEqual(0.03);
      expect(c.lengthM).toBeLessThanOrEqual(0.06);
    }
    const selfHeldNodes = plant.leafNodes.filter((n) => runAt(sim.axes.get(n.axisId)!, n.pointIndex)?.by === 'plant');
    expect(coils.length).toBeLessThan(selfHeldNodes.length);
    expect(coils.length / selfHeldNodes.length).toBeGreaterThan(0.35);
    expect(coils.length / selfHeldNodes.length).toBeLessThan(0.85);
    // the gardener tied most of this plant to the timber: there are leaves there and no coiled stalks
    expect(plant.leafNodes.length).toBeGreaterThan(selfHeldNodes.length * 2);
  });

  it('puts patches of clinging rootlets along the stretches an aerial-root climber holds itself, on the side that touches the timber', () => {
    const patches = of('ivy');
    expect(patches.length).toBeGreaterThan(100);
    for (const p of patches) {
      const a = sim.axes.get(p.axisId)!;
      expect(runAt(a, p.pointIndex)?.by).toBe('plant');
      expect(p.holding).toBe(true);
      // the stem data's direction away from the support, reversed
      expect(dot(p.direction, a.away[p.pointIndex]!)).toBeCloseTo(-1, 6);
      expect(p.lengthM).toBeGreaterThanOrEqual(0.003);
      expect(p.lengthM).toBeLessThanOrEqual(0.008);
    }
    // within one stretch the patches stand at the spacing the model gives, measured along the stem
    let gaps = 0;
    for (const a of axesOf('ivy')) {
      const mine = patches.filter((p) => p.axisId === a.id);
      for (let k = 1; k < mine.length; k++) {
        if (runAt(a, mine[k]!.pointIndex) !== runAt(a, mine[k - 1]!.pointIndex)) continue;
        const gap = len({ x: mine[k]!.position.x - mine[k - 1]!.position.x, y: mine[k]!.position.y - mine[k - 1]!.position.y, z: mine[k]!.position.z - mine[k - 1]!.position.z });
        expect(gap).toBeGreaterThan(0.025);
        expect(gap).toBeLessThan(0.085);
        gaps++;
      }
    }
    expect(gaps).toBeGreaterThan(80);
    // none on the long shoots that wave about in the air
    for (const a of axesOf('ivy')) if (a.role === 'whip') expect(patches.some((p) => p.axisId === a.id)).toBe(false);
  });

  it('sets prickles along every stem of a scrambler, pointing outwards and never into the support, and holding nothing', () => {
    const prickles = of('rose');
    const stems = axesOf('rose').filter((a) => a.contact.length > 1);
    const total = stems.reduce((s, a) => s + lengthOf(a), 0);
    // one every 10 to 30 mm of stem
    expect(prickles.length).toBeGreaterThan((total / 0.02) * 0.85);
    expect(prickles.length).toBeLessThan((total / 0.02) * 1.15);
    for (const a of stems) if (lengthOf(a) > 0.1) expect(prickles.some((p) => p.axisId === a.id), a.id).toBe(true);
    for (const p of prickles) {
      const a = sim.axes.get(p.axisId)!;
      expect(p.holding).toBe(false);
      expect(len(p.direction)).toBeCloseTo(1, 6);
      expect(p.lengthM).toBeGreaterThanOrEqual(0.004);
      expect(p.lengthM).toBeLessThanOrEqual(0.009);
      const away = a.away[p.pointIndex]!;
      if (len(away) > 0.5) expect(dot(p.direction, away)).toBeGreaterThan(0);
    }
  });

  it('carries them into the render data, each with the day it appeared', () => {
    expect(data.appendages).toHaveLength(sim.appendages.length);
    const stems = new Map(data.stems.map((s) => [s.id, s]));
    for (const a of data.appendages) {
      expect(stems.has(a.stemId), a.stemId).toBe(true);
      expect(Math.hypot(...a.direction)).toBeCloseTo(1, 3);
      expect(a.bornDay).toBeGreaterThanOrEqual(0);
      expect(a.removedDay).toBe(-1);
      expect(appendagePresent(a, a.bornDay)).toBe(true);
      expect(appendagePresent(a, a.bornDay - 1)).toBe(false);
    }
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
  });

  // README working rule: removing a living stem also removes its leaves, buds, flowers and support contacts.
  describe('when a stem is cut', () => {
    const cuts: GardenerEvent[] = ['rose', 'vine', 'ivy'].map((plantId) => ({ id: `cut-${plantId}`, date: '2031-02-10', type: 'hard_prune', plantId, target: { allStems: true }, keepM: 1 }));
    const s0 = attachmentTrial({ taxa, care: 'trained', years: 6 });
    const cut = run({ ...s0, events: [...s0.events, ...cuts] }, END);
    const day = cut.calendar.dayOf('2031-02-10');

    it('takes the appendages beyond the cut with it, and leaves those below', () => {
      for (const plantId of ['rose', 'vine', 'ivy']) {
        const mine = cut.appendages.filter((a) => a.plantId === plantId);
        const taken = mine.filter((a) => a.removedDay === day);
        const kept = mine.filter((a) => a.removedDay === null && a.bornDay < day);
        expect(taken.length, plantId).toBeGreaterThan(20);
        expect(kept.length, plantId).toBeGreaterThan(0);
        for (const a of mine) {
          // an appendage is on the plant exactly as long as the point of stem it stands on
          expect(a.removedDay, `${plantId} ${a.axisId}`).toBe(cut.axes.get(a.axisId)!.removedDayAt[a.pointIndex] ?? null);
        }
        expect(cut.events.find((e) => e.eventId === `cut-${plantId}`)!.effects.stemRemovedM, plantId).toBeGreaterThan(1);
      }
      const d = toRenderData(cut);
      const gone = d.appendages.find((a) => a.removedDay === day)!;
      expect(appendagePresent(gone, day - 1)).toBe(true);
      expect(appendagePresent(gone, day)).toBe(false);
    });

    it('grows new ones on the shoots that come after', () => {
      for (const plantId of ['rose', 'vine', 'ivy']) expect(cut.appendages.some((a) => a.plantId === plantId && a.bornDay > day), plantId).toBe(true);
    });
  });

  describe('when the model leaves their numbers unknown', () => {
    const none = attachmentTrial({ taxa: ['vitis-coignetiae', 'clematis-viticella-etoile-violette', 'hedera-helix', 'rosa-the-generous-gardener', 'lonicera-henryi'].reduce<Growable>((t, id) => vary(t, id, {}), library), care: 'trained', years: 6 });
    const bareRun = run(none, END);

    it('draws none, and says which part is missing for the plants whose way of climbing has one', () => {
      expect(bareRun.appendages).toHaveLength(0);
      const said = (plantId: string) => bareRun.decisions.filter((d) => d.plantId === plantId && d.kind === 'part_not_modelled').map((d) => d.text);
      expect(said('vine').filter((t) => t.includes('no tendrils are modelled'))).toHaveLength(1);
      expect(said('clematis').filter((t) => t.includes('no coiled leaf stalks are modelled'))).toHaveLength(1);
      expect(said('ivy').filter((t) => t.includes('no clinging rootlets are modelled'))).toHaveLength(1);
      expect(said('rose').filter((t) => t.includes('no prickles are modelled'))).toHaveLength(1);
      expect(said('vine')[1]).toContain('appendages.tendrilNodePattern, appendages.tendrilLengthM');
      // a stem twiner is told about its fruit and nothing else: it has no appendage to be missing
      expect(said('honeysuckle')).toHaveLength(1);
      expect(said('honeysuckle')[0]).toContain('no fruit is modelled');
      expect(said('wisteria')).toHaveLength(0);
    });

    it('grows the same plants, to the last stem, leaf and flower, with appendages or without', () => {
      expect(rest(toRenderData(bareRun))).toBe(rest(data));
    });
  });
});

// ============================================================================================================
// The render contract, version 2: a leaf, flower or fruit may say which of its taxon's forms it is, and a
// flower or fruit how it is held. SIMULATION_KEY.md section 5, "Morphology ... floral raceme/flower
// architecture". Mechanism traits do not transfer: each name is the taxon's own, from its own model.
// ============================================================================================================
describe('forms, and how an inflorescence is held', () => {
  const END = '2031-12-31';
  const grow = (id: string, plantId: string, names: GrowthNames, taxa: Growable = library) => run(plantsOnHemisphere({ taxa: vary(taxa, id, {}, names), care: 'trained', years: 5 }, [{ plantId, taxonId: id }], 'One plant'), END);

  it('says nothing about form or direction for a taxon whose model names none', () => {
    const d = toRenderData(grow('clematis-viticella-etoile-violette', 'clematis', {}));
    expect(d.flowers.length).toBeGreaterThan(50);
    for (const l of d.leaves) expect('form' in l).toBe(false);
    for (const f of d.flowers) {
      expect('form' in f).toBe(false);
      expect('direction' in f).toBe(false);
    }
  });

  it('faces a flower out from its node, away from the support, where the model says it faces out', () => {
    const sim = grow('clematis-viticella-etoile-violette', 'clematis', { flowerHeld: 'facing_out', flowerForm: 'single_nodding', leafForm: 'pinnate' });
    const opened = sim.buds.filter((b) => b.openDay !== null);
    expect(opened.length).toBeGreaterThan(50);
    let supported = 0;
    for (const b of opened) {
      expect(len(b.direction!)).toBeCloseTo(1, 6);
      const away = sim.axes.get(b.axisId)!.away[b.pointIndex!]!;
      if (len(away) > 0.5) {
        expect(dot(b.direction!, away)).toBeGreaterThan(0.5);
        supported++;
      } else expect(b.direction!.z).toBeGreaterThan(0);
    }
    expect(supported).toBeGreaterThan(10);
    const d = toRenderData(sim);
    for (const f of d.flowers) {
      expect(f.form).toBe('single_nodding');
      expect(Math.hypot(...f.direction!)).toBeCloseTo(1, 3);
    }
    for (const l of d.leaves) expect(l.form).toBe('pinnate');
  });

  it('stands a flower above its shoot where the model says it is upright, and lets it hang where it says it hangs', () => {
    const up = toRenderData(grow('clematis-viticella-etoile-violette', 'clematis', { flowerHeld: 'upright' }));
    expect(up.flowers.length).toBeGreaterThan(50);
    for (const f of up.flowers) expect(f.direction![2]).toBeGreaterThan(0.9);
    const down = toRenderData(grow('clematis-viticella-etoile-violette', 'clematis', { flowerHeld: 'hanging' }));
    for (const f of down.flowers) expect(f.direction).toBeUndefined();
    // how a flower is held changes nothing about which flowers there are
    expect(down.flowers.map((f) => [f.openDay, f.spentDay, f.position])).toEqual(up.flowers.map((f) => [f.openDay, f.spentDay, f.position]));
  });

  it('gives a spur’s leaves the spur’s form and the shoots’ leaves theirs', () => {
    const sim = grow('wisteria-sinensis', 'wisteria', { leafForm: 'shoot_leaf', spurLeafForm: 'spur_leaf' });
    const spurs = new Set([...sim.axes.values()].filter((a) => a.role === 'spur').map((a) => a.id));
    const d = toRenderData(sim);
    const onSpurs = d.leaves.filter((l) => spurs.has(l.stemId));
    expect(onSpurs.length).toBeGreaterThan(50);
    // a shoot cut back to a spur keeps the leaves it grew as a shoot and gains a spur's
    for (const l of d.leaves) expect(l.form).toBe(l.lastYear === null ? 'spur_leaf' : 'shoot_leaf');
    for (const l of d.leaves.filter((x) => !spurs.has(x.stemId))) expect(l.form).toBe('shoot_leaf');
    // with only the one name given, the spur's leaves take it too
    const one = toRenderData(grow('wisteria-sinensis', 'wisteria', { leafForm: 'pinnate' }));
    for (const l of one.leaves) expect(l.form).toBe('pinnate');
  });

  it('tells the first flush on last year’s stems from the flowers of the year’s growth', () => {
    const id = 'lonicera-periclymenum-graham-thomas';
    const sim = grow(id, 'honeysuckle', { flowerForm: 'summer_whorl', firstFlushFlowerForm: 'first_flush_whorl' }, withFloweringWood(library, { [id]: 'both' }));
    const d = toRenderData(sim);
    const early = d.flowers.filter((f) => f.form === 'first_flush_whorl');
    const late = d.flowers.filter((f) => f.form === 'summer_whorl');
    expect(early.length).toBeGreaterThan(5);
    expect(late.length).toBeGreaterThan(5);
    expect(early.length + late.length).toBe(d.flowers.length);
    // the first flush is borne by wood made the year before, the rest by wood of the same year
    for (const f of early) expect(sim.calendar.dateOf(sim.axes.get(f.stemId)!.bornDay).year).toBeLessThan(f.year);
    const yearOfNode = (f: (typeof d.flowers)[number]) => sim.buds.find((b) => b.openDay === f.openDay && b.axisId === f.stemId && b.position!.x === f.position[0])!;
    for (const f of late.slice(0, 50)) {
      const b = yearOfNode(f);
      expect(sim.calendar.dateOf(sim.axes.get(b.axisId)!.bornDayAt[b.pointIndex!]!).year).toBe(f.year);
    }
  });
});

// ============================================================================================================
// CONSTRAINTS_AND_PHENOLOGY.md section 3, "Why age of wood matters": what a stem bears depends on how old it
// is. Section 6.4, spatial clearance and pedestrian headroom. README working rules: a flowering month is an
// envelope, not a trigger; removing a living stem removes what it bears.
// ============================================================================================================
describe('flowering side shoots: a second kind of growth on an established stem', () => {
  const HYDRANGEA = 'hydrangea-anomala-subsp-petiolaris';
  const ON = { 'sideShoots.bearingWoodAgeYears': 2, 'sideShoots.perMetrePerYear': 1, 'sideShoots.lengthM': [0.3, 0.8], 'sideShoots.lifespanYears': 3, 'sideShoots.terminalFlowerShare': 0.7 } satisfies Values;
  const NAMES: GrowthNames = { leafForm: 'climbing_leaf', sideShootLeafForm: 'flowering_shoot_leaf', flowerForm: 'ordinary', sideShootFlowerForm: 'lacecap', flowerHeld: 'upright' };
  const pinned = withFloweringWood(library, { [HYDRANGEA]: 'previous_season' });
  const scenario = (taxa: Growable, extra: GardenerEvent[] = []): Scenario => {
    const s = plantsOnHemisphere({ taxa, care: 'trained', years: 8 }, [{ plantId: 'hydrangea', taxonId: HYDRANGEA }], 'One plant');
    return { ...s, events: [...s.events, ...extra] };
  };
  const END = '2034-12-31';
  const sim = run(scenario(vary(pinned, HYDRANGEA, ON, NAMES)), END);
  const off = run(scenario(vary(pinned, HYDRANGEA, {}, { leafForm: 'climbing_leaf', flowerForm: 'ordinary', flowerHeld: 'upright' })), END);
  const data = toRenderData(sim);
  const cal = sim.calendar;
  const year = (day: number) => cal.dateOf(day).year;
  const side = [...sim.axes.values()].filter((a) => a.role === 'side_shoot');
  const sideIds = new Set(side.map((a) => a.id));
  const model = sim.scenario.taxa.get(HYDRANGEA)!.model;

  it('is made by no plant whose model leaves it unknown or gives a rate of nothing', () => {
    expect([...off.axes.values()].some((a) => a.role === 'side_shoot')).toBe(false);
    for (const s of off.summaries) expect(s.sideShoots).toBe(0);
    const zero = run(scenario(vary(pinned, HYDRANGEA, { ...ON, 'sideShoots.perMetrePerYear': 0 })), '2031-12-31');
    expect([...zero.axes.values()].some((a) => a.role === 'side_shoot')).toBe(false);
    // wisteria's own short flowering wood is the spur: its model says it throws no side shoots
    expect(known(library.get('wisteria-sinensis')!.model, 'sideShoots.perMetrePerYear')).toBe(0);
  });

  it('breaks only from framework stems, and only from wood as old as the model asks', () => {
    expect(side.length).toBeGreaterThan(20);
    for (const a of side) {
      const host = sim.axes.get(a.parent!.axisId)!;
      expect(['leader', 'lateral']).toContain(host.role);
      expect(year(a.bornDay) - year(host.bornDayAt[a.parent!.pointIndex]!), a.id).toBeGreaterThanOrEqual(2);
      // it starts where its bearing stem is, at a leaf node of that stem
      expect(a.contact[0]).toEqual(host.contact[a.parent!.pointIndex]);
    }
    // none in the first two years: there is no wood old enough
    expect(sim.summaries.filter((s) => s.year <= 2028).every((s) => s.sideShoots === 0)).toBe(true);
    expect(sim.summaries.find((s) => s.year === 2034)!.sideShoots).toBeGreaterThan(10);
    expect(sim.decisions.some((d) => d.kind === 'side_shoots_broke')).toBe(true);
  });

  it('comes at about the rate the model gives for each metre of stem old enough to bear', () => {
    // every node of framework two years old or more, not already bearing one, has the same chance each spring
    const made = side.filter((a) => a.bornYear === 2034).length;
    const eligibleM = [...sim.axes.values()]
      .filter((a) => a.role === 'leader' || a.role === 'lateral')
      .reduce((s, a) => {
        let last = -1;
        for (let i = 0; i < a.contact.length; i++) if (year(a.bornDayAt[i]!) <= 2032) last = i;
        return s + (last >= 0 ? a.lengthAt[last]! : 0);
      }, 0);
    expect(eligibleM).toBeGreaterThan(10);
    expect(made).toBeGreaterThan(eligibleM * 1 * 0.4);
    expect(made).toBeLessThan(eligibleM * 1 * 1.6);
  });

  it('is short, stands clear of the support on a line of its own, and grows through the spring, not in a day', () => {
    let grown = 0;
    for (const a of side) {
      expect(a.targetLengthM).toBeGreaterThanOrEqual(0.3);
      expect(a.targetLengthM).toBeLessThanOrEqual(0.8);
      expect(lengthOf(a)).toBeLessThanOrEqual(a.targetLengthM + 1e-6);
      for (const w of a.away) expect(len(w)).toBe(0);
      expect(a.runs).toHaveLength(0);
      if (a.bornYear >= 2034) continue;
      // full length, reached before the first flowers of the year could open and laid down over weeks
      expect(lengthOf(a), a.id).toBeCloseTo(a.targetLengthM, 6);
      const lastPoint = a.bornDayAt[a.contact.length - 1]!;
      expect(lastPoint - a.bornDay).toBeGreaterThan(20);
      expect(cal.dateOf(lastPoint).dayOfYear).toBeLessThanOrEqual(param(model, 'phenology.flowerOpenDoy')[0]);
      // out from the stem that bears it: its tip is most of its length away from its base
      const tip = a.contact[a.contact.length - 1]!;
      const base = a.contact[0]!;
      expect(len({ x: tip.x - base.x, y: tip.y - base.y, z: tip.z - base.z })).toBeGreaterThan(lengthOf(a) * 0.8);
      grown++;
    }
    expect(grown).toBeGreaterThan(10);
  });

  it('is unsupported in the render data, and is named there as a side shoot', () => {
    const stems = data.stems.filter((s) => sideIds.has(s.id));
    expect(stems).toHaveLength(side.filter((a) => a.contact.length >= 2).length);
    for (const s of stems) {
      expect(s.role).toBe('side_shoot');
      expect(s.away.every((x) => x === 0)).toBe(true);
      expect(sideIds.has(s.parentId!)).toBe(false);
    }
  });

  it('carries leaves of the form the model names for it, renewed each year it lives', () => {
    const mine = data.leaves.filter((l) => sideIds.has(l.stemId));
    expect(mine.length).toBeGreaterThan(50);
    for (const l of mine) {
      expect(l.form).toBe('flowering_shoot_leaf');
      expect(l.lastYear).toBeNull();
    }
    for (const l of data.leaves.filter((x) => !sideIds.has(x.stemId))) expect(l.form).toBe('climbing_leaf');
    for (const a of side) if (lengthOf(a) > 0.25) expect(mine.some((l) => l.stemId === a.id), a.id).toBe(true);
  });

  it('ends in the inflorescence: a bud formed at its tip the summer before, opening in the plant’s own window', () => {
    const [open0, open1] = param(model, 'phenology.flowerOpenDoy');
    const terminal = sim.buds.filter((b) => sideIds.has(b.axisId));
    const opened = terminal.filter((b) => b.openDay !== null);
    expect(opened.length).toBeGreaterThan(10);
    for (const b of terminal) expect(b.pointIndex).toBeNull();
    for (const b of opened) {
      const shoot = sim.axes.get(b.axisId)!;
      // old-wood flowering: the bud was there the year before, on wood that was still there when it opened
      expect(year(b.initiatedDay)).toBe(year(b.openDay!) - 1);
      expect(shoot.bornDay).toBeLessThan(b.initiatedDay);
      expect(shoot.removedDay === null || shoot.removedDay > b.openDay!).toBe(true);
      expect(cal.dateOf(b.openDay!).dayOfYear).toBeGreaterThanOrEqual(open0);
      expect(cal.dateOf(b.openDay!).dayOfYear).toBeLessThanOrEqual(open1);
      expect(b.position).toEqual(shoot.contact[shoot.contact.length - 1]);
    }
    // not before the plant is old enough to flower at all
    const competence = param(model, 'flowering.competenceYears');
    for (const b of opened) expect(year(b.openDay!) - 2027).toBeGreaterThanOrEqual(competence);
    // no more of them than there were shoots to bear them, in any year
    for (const s of sim.summaries) expect(opened.filter((b) => year(b.openDay!) === s.year).length, String(s.year)).toBeLessThanOrEqual(side.filter((a) => a.bornYear < s.year).length);
    const flowers = data.flowers.filter((f) => sideIds.has(f.stemId));
    expect(flowers).toHaveLength(opened.length);
    for (const f of flowers) {
      expect(f.form).toBe('lacecap');
      expect(f.direction![2]).toBeGreaterThan(0.9);
    }
    for (const f of data.flowers.filter((x) => !sideIds.has(x.stemId))) expect(f.form).toBe('ordinary');
    expect(sim.decisions.some((d) => d.kind === 'floral_initiated' && d.text.includes('at the ends of'))).toBe(true);
  });

  it('lives the seasons its model gives it and is then shed, with its leaves, before growth starts again', () => {
    const shed = side.filter((a) => a.removedDay !== null);
    expect(shed.length).toBeGreaterThan(3);
    for (const a of shed) {
      expect(year(a.removedDay!)).toBe(a.bornYear + 3);
      expect(a.lastYear).toBe(a.bornYear + 2);
      expect(cal.dateOf(a.removedDay!).dayOfYear).toBe(param(model, 'phenology.budburstDoy'));
      for (const l of sim.leaves.filter((x) => x.axisId === a.id)) expect(l.removedDay).toBe(a.removedDay);
    }
    for (const a of side.filter((x) => x.removedDay === null)) expect(a.lastYear!).toBeGreaterThanOrEqual(2034);
    expect(sim.decisions.some((d) => d.kind === 'shed')).toBe(true);
    // shedding is the plant's doing: nothing is counted as lost to pruning
    for (const s of sim.summaries) expect(s.floralBudsLostToPruning).toBe(0);
    // the node that bore one may bear another once it has gone
    const bases = side.map((a) => `${a.parent!.axisId}|${a.parent!.pointIndex}`);
    for (const key of new Set(bases)) {
      const there = side.filter((a) => `${a.parent!.axisId}|${a.parent!.pointIndex}` === key).sort((p, q) => p.bornDay - q.bornDay);
      for (let k = 1; k < there.length; k++) expect(there[k - 1]!.removedDay!).toBeLessThanOrEqual(there[k]!.bornDay);
    }
  });

  it('flowers the same year where the taxon flowers on the growth of the year, and is shed after one season where it lives one', () => {
    const ROSE = 'rosa-the-generous-gardener';
    const roses = vary(withFloweringWood(library, { [ROSE]: 'current_season' }), ROSE, { 'sideShoots.bearingWoodAgeYears': 1, 'sideShoots.perMetrePerYear': 3, 'sideShoots.lengthM': [0.15, 0.4], 'sideShoots.lifespanYears': 1, 'sideShoots.terminalFlowerShare': 0.9 }, { flowerHeld: 'facing_out' });
    const rose = run(plantsOnHemisphere({ taxa: roses, care: 'trained', years: 6 }, [{ plantId: 'rose', taxonId: ROSE }], 'One plant'), '2032-12-31');
    const shoots = [...rose.axes.values()].filter((a) => a.role === 'side_shoot');
    expect(shoots.length).toBeGreaterThan(50);
    const ids = new Set(shoots.map((a) => a.id));
    const opened = rose.buds.filter((b) => ids.has(b.axisId) && b.openDay !== null);
    expect(opened.length).toBeGreaterThan(30);
    for (const b of opened) {
      const shoot = rose.axes.get(b.axisId)!;
      expect(rose.calendar.dateOf(b.openDay!).year).toBe(shoot.bornYear);
      // at the end of a shoot, a flower that faces out carries on the shoot's own line
      const n = shoot.contact.length;
      const along = { x: shoot.contact[n - 1]!.x - shoot.contact[n - 2]!.x, y: shoot.contact[n - 1]!.y - shoot.contact[n - 2]!.y, z: shoot.contact[n - 1]!.z - shoot.contact[n - 2]!.z };
      expect(dot(b.direction!, along) / len(along)).toBeCloseTo(1, 6);
    }
    for (const a of shoots.filter((x) => x.bornYear < 2032)) expect(rose.calendar.dateOf(a.removedDay!).year).toBe(a.bornYear + 1);
  });

  // README working rule: removing a living stem also removes its leaves, buds, flowers and support contacts.
  describe('when the stem that bears it is cut', () => {
    const chop: GardenerEvent = { id: 'chop', date: '2033-02-10', type: 'hard_prune', plantId: 'hydrangea', target: { allStems: true }, keepM: 1.2 };
    const cut = run(scenario(vary(pinned, HYDRANGEA, ON, NAMES), [chop]), END);
    const day = cut.calendar.dayOf(chop.date);
    const rec = cut.events.find((e) => e.eventId === 'chop')!;
    const shoots = [...cut.axes.values()].filter((a) => a.role === 'side_shoot');

    it('goes with it, and takes its leaves and its flower bud', () => {
      const beyond = shoots.filter((a) => a.bornDay < day && a.removedDay === day);
      expect(beyond.length).toBeGreaterThan(3);
      for (const a of beyond) {
        expect(a.removedDayAt.every((d) => d === day)).toBe(true);
        for (const l of cut.leaves.filter((x) => x.axisId === a.id)) expect(l.removedDay).toBe(day);
      }
      // the buds formed at their tips last summer were cut off before they could open
      const lost = cut.buds.filter((b) => b.endedBy === 'chop' && beyond.some((a) => a.id === b.axisId));
      expect(lost.length).toBeGreaterThan(0);
      for (const b of lost) {
        expect(b.end).toBe('removed_by_pruning');
        expect(b.openDay).toBeNull();
      }
      expect(rec.effects.floralBudsRemoved).toBeGreaterThanOrEqual(lost.length);
      expect(rec.effects.axesRemoved).toBeGreaterThanOrEqual(beyond.length);
    });

    it('leaves no living side shoot on wood that has gone', () => {
      for (const a of shoots) {
        if (a.removedDay !== null) continue;
        const host = cut.axes.get(a.parent!.axisId)!;
        expect(host.removedDay, a.id).toBeNull();
        expect(a.parent!.pointIndex, a.id).toBeLessThan(host.alive);
      }
      // those below the cut are still there
      expect(shoots.some((a) => a.removedDay === null && a.bornDay < day)).toBe(true);
    });
  });

  // CLAUDE.md: an intervention changes only what it touches, so that scenarios stay comparable.
  it('adds itself and changes nothing else: the plant that bears it is the same to the last stem, leaf and flower', () => {
    // a side shoot takes the next stem number, so later stems are numbered differently: compare what they are
    const anonymous = (d: RenderData, own: ReadonlySet<string>) => {
      const stems = d.stems.filter((s) => !own.has(s.id)).map((s) => ({ ...s, id: '', parentId: '' }));
      const leaves = d.leaves.filter((l) => !own.has(l.stemId)).map((l) => ({ ...l, stemId: '' }));
      const flowers = d.flowers.filter((f) => !own.has(f.stemId)).map((f) => ({ ...f, stemId: '' }));
      return JSON.stringify({ stems, leaves, flowers, seasons: d.seasons, events: d.events });
    };
    expect(anonymous(data, sideIds)).toBe(anonymous(toRenderData(off), new Set()));
    for (const s of sim.summaries) {
      const o = off.summaries.find((x) => x.year === s.year)!;
      expect({ ...s, sideShoots: 0, floralBudsInitiated: 0, flowersOpened: 0 }).toEqual({ ...o, floralBudsInitiated: 0, flowersOpened: 0 });
      expect(s.flowersOpened).toBe(o.flowersOpened + sim.buds.filter((b) => sideIds.has(b.axisId) && b.openDay !== null && year(b.openDay) === s.year).length);
    }
  });

  // CONSTRAINTS_AND_PHENOLOGY.md section 6.4: spatial clearance, pedestrian headroom.
  it('is reported where it stands out into headroom, like anything else that does', () => {
    const s = scenario(vary(pinned, HYDRANGEA, ON, NAMES));
    const low: Scenario = { ...s, bower: { ...s.bower, zones: [{ id: 'test.headroom', kind: 'headroom', min: v3(-12, -12, 0), max: v3(12, 12, 2.1), note: 'test: nothing may stand below 2.1 m anywhere' }] } };
    const r = designReport(run(low, END));
    const alert = r.alerts.find((a) => a.kind === 'headroom' && a.text.includes('side shoot'))!;
    expect(alert.plantId).toBe('hydrangea');
    expect(alert.count).toBeGreaterThan(0);
    expect(alert.count).toBeLessThanOrEqual(r.plants[0]!.sideShoots);
    expect(designReport(sim).alerts.some((a) => a.kind === 'headroom')).toBe(false);
    expect(formatDesignReport(r)).toContain('flowering side shoots');
  });
});

// GROWTH_PARAMS_OPTIONAL: a part the plant may or may not have is described by parameters a model may leave unknown.
describe('an optional parameter that a model file leaves out', () => {
  const file = JSON.parse(readFileSync(new URL('../../../species/lonicera-henryi/model.json', import.meta.url), 'utf8')) as { params: Record<string, unknown> };

  it('is read as unknown, so the engine can gain one without every file being edited', () => {
    const params = { ...file.params };
    for (const key of GROWTH_PARAMS_OPTIONAL) delete params[key];
    const model = parseGrowthModel({ ...file, params }, 'a file without the optional parameters');
    for (const key of GROWTH_PARAMS_OPTIONAL) {
      expect(model.params[key].status, key).toBe('unknown');
      expect(model.params[key].value, key).toBeNull();
    }
  });

  it('is still refused where the parameter is one every model must have', () => {
    const params = { ...file.params };
    delete params['organs.leafLengthM'];
    expect(() => parseGrowthModel({ ...file, params }, 'a file without a leaf length')).toThrow(/organs\.leafLengthM/);
  });
});
