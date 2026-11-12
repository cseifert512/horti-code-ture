import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Calendar } from '../src/calendar.ts';
import { loadGrowable } from '../src/node/load-taxa.ts';
import type { RenderData, RenderLeaf } from '../src/render/contract.ts';
import { leafState, seasonsOf } from '../src/render/presence.ts';
import { Simulation } from '../src/sim/engine.ts';
import { GROWTH_PARAMS, GROWTH_PARAMS_OPTIONAL, type GrowthModel, type GrowthNames, type GrowthParamKey, type OptionalParamKey, param, parseGrowthModel, withParam, withUnknown } from '../src/sim/model.ts';
import { toRenderData } from '../src/sim/render-data.ts';
import { designReport } from '../src/sim/report.ts';
import { type Growable, plantsOnHemisphere } from '../src/sim/scenarios.ts';
import type { Axis, FloralBud, GardenerEvent, Scenario } from '../src/sim/types.ts';
import { inWindow, middle, nextWindow, throughNewYear, unrolled, windowFrom, windowTo } from '../src/sim/windows.ts';
import type { FloweringWood } from '../src/vocab.ts';
import { withFloweringWood } from './helpers.ts';

// What a taxon may or may not do, each switched on by its growth model alone: a leaf of its own for a spur and a
// flowering side shoot, leaves kept through winter, flowering again where a flower has gone over, dates that run
// through the new year, and flowering side shoots that grow on from year to year. docs/ASSUMPTIONS_AUDIT.md section 9.

const speciesDir = fileURLToPath(new URL('../../../species', import.meta.url));
/**
 * As in organs.test.ts: these tests are about the engine's mechanisms, not about any plant. They grow test plants
 * from the growth models as they stood at commit 2fa217b (`fixtures/models`), Wisteria sinensis from its own file,
 * and fix every date and number an assertion leans on. Researching a species rightly changes how it grows, and
 * that must not move a test of the engine.
 */
const fixtures = fileURLToPath(new URL('./fixtures/models', import.meta.url));
const library: Growable = new Map(
  [...loadGrowable(speciesDir)].map(([id, t]) => {
    const file = `${fixtures}/${id}.json`;
    return [id, id !== 'wisteria-sinensis' && existsSync(file) ? { profile: t.profile, model: parseGrowthModel(JSON.parse(readFileSync(file, 'utf8')), `the frozen test model of ${id}`) } : t];
  }),
);
const run = (s: Scenario, until: string) => new Simulation(s).runUntil(until);

type Values = { [K in GrowthParamKey]?: NonNullable<GrowthModel['params'][K]['value']> };

/** As in organs.test.ts: a model with every optional parameter unknown and no names, so that a test says all it assumes. */
function bare(model: GrowthModel): GrowthModel {
  let out: GrowthModel = { ...model, names: {} };
  for (const key of GROWTH_PARAMS_OPTIONAL) out = withUnknown(out, key);
  return out;
}

/** The library with one taxon stripped bare and then given these numbers and names, and its flowering wood fixed where the test depends on it. */
function vary(taxa: Growable, id: string, values: Values, names: GrowthNames = {}, wood?: FloweringWood): Growable {
  const from = wood ? withFloweringWood(taxa, { [id]: wood }) : taxa;
  const t = from.get(id);
  if (!t) throw new Error(`no taxon ${id} in the library`);
  let model = bare(t.model);
  for (const [key, value] of Object.entries(values)) model = withParam(model, key as GrowthParamKey, value as never, 'test: a number fixed or switched on to see what the engine does with it');
  return new Map([...from, [id, { profile: t.profile, model: { ...model, names } }]]);
}

/**
 * One plant at the foot of a rib of the 15 m hemisphere. Light is told not to act (sim/light.ts): these tests are
 * about what the plant does of itself, and a shoot in shade makes less than its model plans.
 */
const one = (taxa: Growable, taxonId: string, years: number, extra: GardenerEvent[] = []): Scenario => {
  const s = plantsOnHemisphere({ taxa, care: 'trained', years, lightResponse: false }, [{ plantId: 'plant', taxonId }], 'One plant');
  return { ...s, events: [...s.events, ...extra] };
};

const lengthOf = (a: Axis) => (a.contact.length ? a.lengthAt[a.contact.length - 1]! : 0);
const sub = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const unitDot = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => (a.x * b.x + a.y * b.y + a.z * b.z) / (Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z));
/** The leaves that `presence.ts` says are on the plant on a date. */
const inLeaf = (sim: Simulation, data: RenderData, iso: string): RenderLeaf[] => {
  const day = sim.calendar.dayOf(iso);
  const seasons = seasonsOf(data, sim.calendar.dateOf(day).year);
  return data.leaves.filter((l) => leafState(l, seasons.get(l.plantId), day).present);
};
/** A run as text, with whatever a mechanism is allowed to change taken out by `mask`. */
const text = (d: RenderData, mask: { leaf?: (l: RenderLeaf) => unknown; keep?: (stemId: string) => boolean } = {}) => {
  const keep = mask.keep ?? (() => true);
  return JSON.stringify({ stems: d.stems.filter((s) => keep(s.id)), leaves: d.leaves.filter((l) => keep(l.stemId)).map(mask.leaf ?? ((l) => l)), flowers: d.flowers.filter((f) => keep(f.stemId)), seasons: d.seasons, events: d.events });
};

const WISTERIA = 'wisteria-sinensis';
const HYDRANGEA = 'hydrangea-anomala-subsp-petiolaris';
const AKEBIA = 'akebia-quinata';
const HENRYI = 'lonicera-henryi';
const ROSE = 'rosa-the-generous-gardener';
const CIRRHOSA = 'clematis-cirrhosa-freckles';

// ============================================================================================================
// CLAUDE.md, "easy to break": an intervention changes only what it touches, so scenarios stay comparable; and
// "Unknown stays unknown". SIMULATION_KEY.md section 3: "Unknown species parameters should stay unfilled".
// ============================================================================================================
describe('the numbers these mechanisms need', () => {
  const NEW = [
    'organs.spurLeafLengthM',
    'organs.sideShootLeafLengthM',
    'organs.sideShootLeafSpacingM',
    'organs.sideShootLeavesPerNode',
    'organs.sideShootLeafLifespanYears',
    'organs.winterLeafShare',
    'flowering.repeatMaxPerSeason',
    'flowering.repeatIntervalDays',
    'flowering.repeatShare',
    'flowering.repeatIntervalDeadheadedDays',
    'sideShoots.extensionMPerYear',
    'sideShoots.maxLengthM',
  ] as const satisfies readonly OptionalParamKey[];
  const copy = () => JSON.parse(JSON.stringify(library.get(WISTERIA)!.model));
  const given = (value: unknown) => ({ value, status: 'provisional_design_assumption', basis: 'test: a value to be accepted or refused' });

  it('are all ones a model may leave out, and no species file has to be touched for the engine to have gained them', () => {
    for (const key of NEW) expect(GROWTH_PARAMS_OPTIONAL as readonly string[], key).toContain(key);
    const file = copy();
    for (const key of NEW) delete file.params[key];
    const model = parseGrowthModel(file, 'a file written before these parameters existed');
    for (const key of NEW) expect(model.params[key], key).toEqual({ value: null, status: 'unknown' });
  });

  it('are accepted where they are what they say', () => {
    const good: [OptionalParamKey, unknown][] = [
      ['organs.spurLeafLengthM', [0.08, 0.14]],
      ['organs.sideShootLeafLengthM', [0.04, 0.07]],
      ['organs.sideShootLeafSpacingM', [0.05, 0.09]],
      ['organs.sideShootLeavesPerNode', 2],
      ['organs.sideShootLeafLifespanYears', 3],
      ['organs.winterLeafShare', 0.3],
      ['organs.winterLeafShare', 0],
      ['flowering.repeatMaxPerSeason', 3],
      ['flowering.repeatMaxPerSeason', 0],
      ['flowering.repeatIntervalDays', [35, 50]],
      ['flowering.repeatShare', 0.6],
      ['flowering.repeatIntervalDeadheadedDays', [14, 21]],
      ['sideShoots.extensionMPerYear', [0.05, 0.12]],
      ['sideShoots.extensionMPerYear', [0, 0]],
      ['sideShoots.maxLengthM', 0.9],
    ];
    for (const [key, value] of good) {
      const m = copy();
      m.params[key] = given(value);
      expect(() => parseGrowthModel(m), `${key} = ${JSON.stringify(value)}`).not.toThrow();
    }
  });

  it('are refused where they cannot be: a leaf of no length, three leaves at a node, a share above one, a wait of no days, a bare number', () => {
    const bad: [OptionalParamKey, unknown][] = [
      ['organs.spurLeafLengthM', [0, 0.1]],
      ['organs.sideShootLeafLengthM', [0.07, 0.04]],
      ['organs.sideShootLeafSpacingM', [0, 0]],
      ['organs.sideShootLeavesPerNode', 3],
      ['organs.sideShootLeafLifespanYears', 0],
      ['organs.sideShootLeafLifespanYears', 1.5],
      ['organs.winterLeafShare', 1.2],
      ['organs.winterLeafShare', -0.1],
      ['flowering.repeatMaxPerSeason', 1.5],
      ['flowering.repeatMaxPerSeason', -1],
      ['flowering.repeatIntervalDays', [0, 10]],
      ['flowering.repeatIntervalDays', [50, 35]],
      ['flowering.repeatShare', 2],
      ['flowering.repeatIntervalDeadheadedDays', [10.5, 20]],
      ['sideShoots.extensionMPerYear', [0.2, 0.1]],
      ['sideShoots.maxLengthM', -1],
    ];
    for (const [key, value] of bad) {
      const m = copy();
      m.params[key] = given(value);
      expect(() => parseGrowthModel(m), `${key} = ${JSON.stringify(value)}`).toThrow();
    }
    const bareNumber = copy();
    bareNumber.params['organs.winterLeafShare'] = 0.3;
    expect(() => parseGrowthModel(bareNumber)).toThrow();
    const guessed = copy();
    guessed.params['organs.winterLeafShare'] = { value: 0.3, status: 'unknown' };
    expect(() => parseGrowthModel(guessed)).toThrow(/must not carry a value/);
  });
});

// ============================================================================================================
// CONSTRAINTS_AND_PHENOLOGY.md section 4: "A winter-flowering clematis has different phenology from a
// spring-flowering wisteria", and visible bloom is "not an unconditional month switch". README working rule: a
// flowering month is an envelope, not a trigger. A display that runs from November to February has to be
// sayable as one window.
// ============================================================================================================
describe('a day-of-year window whose first day is later than its last runs through the new year', () => {
  const cal = new Calendar('2027-03-01');
  const WINTER = [320, 45] as const;
  const SUMMER = [166, 228] as const;

  it('holds the days from its first to 31 December and from 1 January to its last, and no others', () => {
    expect(throughNewYear(WINTER)).toBe(true);
    expect(throughNewYear(SUMMER)).toBe(false);
    for (const d of [320, 340, 365, 366, 1, 20, 45]) expect(inWindow(WINTER, d), String(d)).toBe(true);
    for (const d of [46, 100, 200, 319]) expect(inWindow(WINTER, d), String(d)).toBe(false);
    for (const d of [166, 200, 228]) expect(inWindow(SUMMER, d), String(d)).toBe(true);
    for (const d of [1, 165, 229, 366]) expect(inWindow(SUMMER, d), String(d)).toBe(false);
  });

  it('is the days it always was for a window inside the year', () => {
    for (const year of [2027, 2028, 2031]) {
      const pair = [cal.dayOfYearDay(year, 166), cal.dayOfYearDay(year, 228)];
      expect(windowFrom(cal, SUMMER, year)).toEqual(pair);
      expect(windowTo(cal, SUMMER, year)).toEqual(pair);
      expect(unrolled(cal, SUMMER, year)).toEqual([166, 228]);
    }
  });

  it('begins in one year and ends in the next, a day longer through a leap year', () => {
    expect(windowFrom(cal, WINTER, 2029)).toEqual([cal.dayOf('2029-11-16'), cal.dayOf('2030-02-14')]);
    expect(windowTo(cal, WINTER, 2030)).toEqual([cal.dayOf('2029-11-16'), cal.dayOf('2030-02-14')]);
    // counted on past the end of the year it begins in, so that it can be used wherever [first, last] could
    expect(unrolled(cal, WINTER, 2029)).toEqual([320, 410]);
    expect(cal.dayOfYearDay(2029, 410)).toBe(cal.dayOf('2030-02-14'));
    // 2028 is a leap year: day 320 is 15 November, and the year has 366 days to count past
    expect(unrolled(cal, WINTER, 2028)).toEqual([320, 411]);
    expect(windowFrom(cal, WINTER, 2028)).toEqual([cal.dayOf('2028-11-15'), cal.dayOf('2029-02-14')]);
  });

  it('is found whole by the day it has to end after: the one in progress, or the next', () => {
    const inProgress = [cal.dayOf('2029-11-16'), cal.dayOf('2030-02-14')];
    expect(nextWindow(cal, WINTER, cal.dayOf('2029-12-20'))).toEqual(inProgress);
    expect(nextWindow(cal, WINTER, cal.dayOf('2030-01-10'))).toEqual(inProgress);
    expect(nextWindow(cal, WINTER, cal.dayOf('2030-02-13'))).toEqual(inProgress);
    const next = [cal.dayOf('2030-11-16'), cal.dayOf('2031-02-14')];
    expect(nextWindow(cal, WINTER, cal.dayOf('2030-02-14'))).toEqual(next);
    expect(nextWindow(cal, WINTER, cal.dayOf('2030-07-01'))).toEqual(next);
    // inside the year: this year's while it lasts, then next year's, as fruit ripening always read it
    expect(nextWindow(cal, SUMMER, cal.dayOf('2030-07-01'))).toEqual([cal.dayOfYearDay(2030, 166), cal.dayOfYearDay(2030, 228)]);
    expect(nextWindow(cal, SUMMER, cal.dayOfYearDay(2030, 228))).toEqual([cal.dayOfYearDay(2031, 166), cal.dayOfYearDay(2031, 228)]);
  });

  it('has its middle outside the year on the side it runs over, which is how the light model reads leaf flush and leaf fall', () => {
    expect(middle([310, 344], 'end')).toBe(327);
    expect(middle([100, 155], 'start')).toBe(127.5);
    // a fall from 1 December to 25 January is centred late in December; a flush from 16 December to 9 February, in mid January
    expect(middle([335, 25], 'end')).toBe(362.5);
    expect(middle([350, 40], 'start')).toBe(12.5);
  });

  it('is accepted by a growth model for every window it has, while an ordinary range must still be in order', () => {
    const windows = (Object.keys(GROWTH_PARAMS) as GrowthParamKey[]).filter((k) => GROWTH_PARAMS[k] === 'window');
    expect(windows).toEqual(['phenology.leafFlushDoy', 'phenology.autumnColourDoy', 'phenology.leafFallDoy', 'phenology.floralInitiationDoy', 'phenology.flowerOpenDoy', 'phenology.petalFallDoy', 'fruit.ripenDoy', 'fruit.fallDoy']);
    const copy = () => JSON.parse(JSON.stringify(library.get(WISTERIA)!.model));
    for (const key of windows) {
      const m = copy();
      m.params[key] = { value: [330, 40], status: 'provisional_design_assumption', basis: 'test: a window through the new year' };
      expect(() => parseGrowthModel(m), key).not.toThrow();
    }
    const reversed = copy();
    reversed.params['organs.leafLengthM'] = { value: [0.3, 0.1], status: 'provisional_design_assumption', basis: 'test: a range the wrong way round' };
    expect(() => parseGrowthModel(reversed)).toThrow(/a range is \[low, high\]/);
    const pastTheYear = copy();
    pastTheYear.params['fruit.fallDoy'] = { value: [330, 400], status: 'provisional_design_assumption', basis: 'test: a day past the year' };
    expect(() => parseGrowthModel(pastTheYear)).toThrow();
  });
});

describe('Clematis cirrhosa: a display through the new year', () => {
  // The numbers its model carried on 12 November 2026, fixed here so that the test does not move with the file.
  // They are the work-round: the opening window stops on 16 December because it could not cross the new year, no
  // flower has a length of life of its own, and all the petals fall in a window early in the year, which the engine
  // reads as next year's because its first day is earlier in the year than the opening's. So nothing opens in
  // January or February, and what opened in November stays open for three months.
  const ROUND = { 'phenology.floralInitiationDoy': [213, 244], 'phenology.flowerOpenDoy': [320, 350], 'phenology.petalFallDoy': [45, 80], 'phenology.flowerLastsDays': [0, 0] } satisfies Values;
  const THROUGH = { ...ROUND, 'phenology.flowerOpenDoy': [320, 45], 'phenology.flowerLastsDays': [20, 40] } satisfies Values;
  const END = '2032-12-31';
  const grow = (values: Values, extra: GardenerEvent[] = []) => run(one(vary(library, CIRRHOSA, values, {}, 'previous_season'), CIRRHOSA, 6, extra), END);
  const round = grow(ROUND);
  const through = grow(THROUGH);
  const date = (sim: Simulation, day: number) => sim.calendar.dateOf(day);
  const opened = (sim: Simulation) => sim.buds.filter((b) => b.openDay !== null);

  it('flowers when it did by the work-round its model uses: every flower opens by mid December and falls after the winter', () => {
    expect(opened(round).length).toBeGreaterThan(20);
    for (const b of opened(round)) {
      const o = date(round, b.openDay!);
      expect(o.year).toBe(b.floweringYear);
      expect(o.dayOfYear).toBeGreaterThanOrEqual(320);
      expect(o.dayOfYear).toBeLessThanOrEqual(350);
      if (b.spentDay === null) continue;
      const s = date(round, b.spentDay);
      expect(s.year).toBe(b.floweringYear + 1);
      expect(s.dayOfYear).toBeGreaterThanOrEqual(45);
      expect(s.dayOfYear).toBeLessThanOrEqual(80);
    }
  });

  it('opens from mid November to mid February where its window says so, and at no other time', () => {
    const flowers = opened(through);
    expect(flowers.length).toBeGreaterThan(20);
    const byMonth = new Map<number, number>();
    for (const b of flowers) {
      const o = date(through, b.openDay!);
      expect(inWindow([320, 45], o.dayOfYear), o.iso).toBe(true);
      byMonth.set(o.month, (byMonth.get(o.month) ?? 0) + 1);
      // each lasts its own few weeks, which may carry it past the window's end but not far
      if (b.spentDay !== null) expect(b.spentDay - b.openDay!).toBeGreaterThanOrEqual(20);
      if (b.spentDay !== null) expect(b.spentDay - b.openDay!).toBeLessThanOrEqual(40);
    }
    expect([...byMonth.keys()].sort((a, b) => a - b)).toEqual([1, 2, 11, 12]);
    for (const n of byMonth.values()) expect(n).toBeGreaterThan(0);
  });

  it('keeps a flower with the season it belongs to: one that opens in January is of the display that began in November', () => {
    const late = opened(through).filter((b) => date(through, b.openDay!).month <= 2);
    expect(late.length).toBeGreaterThan(5);
    for (const b of late) expect(date(through, b.openDay!).year).toBe(b.floweringYear + 1);
    const data = toRenderData(through);
    expect(data.flowers.filter((f) => through.calendar.dateOf(f.openDay).year === f.year + 1)).toHaveLength(late.length);
    // the year's account counts a flower in the calendar year it opened in
    for (const s of through.summaries) expect(s.flowersOpened, String(s.year)).toBe(opened(through).filter((b) => date(through, b.openDay!).year === s.year).length);
    // and the design report finds flowers open in the middle of January, which the work-round also did, by holding November's open
    const months = designReport(through).months;
    expect(months.find((m) => m.month === 1)!.flowers['plant']).toBeGreaterThan(0);
    expect(months.find((m) => m.month === 6)!.flowers['plant'] ?? 0).toBe(0);
  });

  // CONSTRAINTS section 3: old-wood flowering. The buds are on the plant from late summer; a cut before they open takes them.
  it('still loses the whole display to a cut made between the buds forming and the first flower opening', () => {
    const cut: GardenerEvent = { id: 'october-cut', date: '2031-10-10', type: 'hard_prune', plantId: 'plant', target: { allStems: true }, keepM: 0.3 };
    const pruned = grow(THROUGH, [cut]);
    const from = pruned.calendar.dayOf('2031-10-10');
    const to = pruned.calendar.dayOf('2032-06-30');
    expect(opened(through).filter((b) => b.openDay! >= from && b.openDay! <= to).length).toBeGreaterThan(3);
    expect(opened(pruned).filter((b) => b.openDay! >= from && b.openDay! <= to)).toHaveLength(0);
    expect(pruned.events.find((e) => e.eventId === 'october-cut')!.effects.floralBudsRemoved).toBeGreaterThan(3);
  });
});

describe('other dates through the new year', () => {
  const END = '2032-12-31';
  const FLOWERS = { 'phenology.floralInitiationDoy': [150, 165], 'phenology.flowerOpenDoy': [182, 288], 'phenology.flowerLastsDays': [8, 16] } satisfies Values;

  // CONSTRAINTS section 4, fruit development; ASSUMPTIONS_AUDIT.md section 7.2: ripening and falling are windows in the year.
  it('ripens fruit from late November into January and drops it from mid December to the end of February, in that order', () => {
    const FRUIT = { 'fruit.setShare': 0.8, 'fruit.lengthM': [0.012, 0.018], 'fruit.swellDays': [30, 40], 'fruit.ripenDoy': [330, 20], 'fruit.fallDoy': [350, 60] } satisfies Values;
    const sim = run(one(vary(library, ROSE, { ...FLOWERS, ...FRUIT }, {}, 'current_season'), ROSE, 6), END);
    const doy = (day: number) => sim.calendar.dateOf(day).dayOfYear;
    expect(sim.fruits.length).toBeGreaterThan(50);
    let ripeAfterNewYear = 0;
    for (const f of sim.fruits) {
      expect(f.ripen[0]).toBeGreaterThanOrEqual(f.swell[1]);
      expect(f.ripen[1]).toBeGreaterThan(f.ripen[0]);
      expect(f.fallPlannedDay).toBeGreaterThan(f.ripen[1]);
      expect(inWindow([330, 20], doy(f.ripen[0])), `begins to ripen on day ${doy(f.ripen[0])}`).toBe(true);
      expect(inWindow([330, 20], doy(f.ripen[1])), `ripe on day ${doy(f.ripen[1])}`).toBe(true);
      expect(inWindow([350, 60], doy(f.fallPlannedDay)), `falls on day ${doy(f.fallPlannedDay)}`).toBe(true);
      // it ripens in the first window after it is full grown, and falls in the window that is open or next opens then
      expect(f.ripen[1] - f.swell[1]).toBeLessThan(200);
      expect(f.fallPlannedDay - f.ripen[1]).toBeLessThan(100);
      if (doy(f.ripen[1]) <= 20) ripeAfterNewYear++;
    }
    expect(ripeAfterNewYear).toBeGreaterThan(5);
  });

  // CONSTRAINTS section 5: "Represent leaf flush, expansion, senescence and abscission on organ/branch cohorts";
  // climbing rose, "often largely deciduous in the UK", holds leaves late.
  describe('a leaf fall from 1 December to 25 January', () => {
    const LEAVES = { 'organs.leafLifespanYears': 1, 'phenology.leafFlushDoy': [90, 140], 'phenology.autumnColourDoy': [300, 345] } satisfies Values;
    const grow = (fall: [number, number]) => run(one(vary(library, ROSE, { ...FLOWERS, ...LEAVES, 'phenology.leafFallDoy': fall }, {}, 'current_season'), ROSE, 6), END);
    const late = grow([335, 25]);
    const data = toRenderData(late);
    const usual = grow([320, 350]);
    const usualData = toRenderData(usual);

    it('is given to a viewer in days that are in order, with last year’s fall carried into this year’s entry', () => {
      const cal = late.calendar;
      for (const s of data.seasons) {
        expect(s.leafFall).toEqual([cal.dayOfYearDay(s.year, 335), cal.dayOfYearDay(s.year + 1, 25)]);
        expect(s.leafFall[1]).toBeGreaterThan(s.leafFall[0]);
        expect(s.leafFallBefore).toEqual([cal.dayOfYearDay(s.year - 1, 335), cal.dayOfYearDay(s.year, 25)]);
        expect(s.autumnColourBefore).toEqual([cal.dayOfYearDay(s.year - 1, 300), cal.dayOfYearDay(s.year - 1, 345)]);
        expect('leafFlushAfter' in s).toBe(false);
      }
      // a taxon whose dates stay inside the year has nothing carried, and its entries are what they always were
      for (const s of usualData.seasons) {
        expect(Object.keys(s)).toEqual(['plantId', 'year', 'budburstDay', 'growthEndDay', 'leafFlush', 'autumnColour', 'leafFall']);
        expect(s.leafFall).toEqual([usual.calendar.dayOfYearDay(s.year, 320), usual.calendar.dayOfYearDay(s.year, 350)]);
      }
    });

    it('has leaves still dropping in January, each on its own day, and none after the last', () => {
      const n = (iso: string) => inLeaf(late, data, iso).length;
      const full = n('2031-11-20');
      expect(full).toBeGreaterThan(40);
      expect(n('2031-12-01')).toBe(full);
      // they go one by one across the eight weeks
      const counts = ['2031-12-10', '2031-12-20', '2031-12-31', '2032-01-01', '2032-01-10', '2032-01-20', '2032-01-25', '2032-01-26'].map(n);
      for (let k = 1; k < counts.length; k++) expect(counts[k]!, String(k)).toBeLessThanOrEqual(counts[k - 1]!);
      expect(counts[0]!).toBeLessThan(full);
      expect(counts[2]!).toBeGreaterThan(full * 0.25);
      expect(counts[4]!).toBeGreaterThan(0);
      expect(counts[4]!).toBeLessThan(counts[2]!);
      expect(counts[7]).toBe(0);
      // nothing happens to a leaf at midnight on 31 December: the same leaves, less those whose day it was
      const before = new Set(inLeaf(late, data, '2031-12-31'));
      const after = inLeaf(late, data, '2032-01-01');
      for (const l of after) expect(before.has(l)).toBe(true);
      expect(before.size - after.length).toBeLessThan(before.size * 0.2);
      // they are last year's leaves, fully turned
      const jan = late.calendar.dayOf('2032-01-10');
      const season = seasonsOf(data, 2032).get('plant');
      for (const l of inLeaf(late, data, '2032-01-10')) {
        expect(l.firstYear).toBe(2031);
        expect(leafState(l, season, jan)).toEqual({ present: true, expansion: 1, autumn: 1 });
      }
    });

    it('leaves nothing on the plant in January where the fall ends in December, and grows the same plant either way', () => {
      expect(inLeaf(usual, usualData, '2031-12-10').length).toBeGreaterThan(0);
      expect(inLeaf(usual, usualData, '2032-01-10')).toHaveLength(0);
      expect(JSON.stringify({ stems: data.stems, leaves: data.leaves, flowers: data.flowers })).toBe(JSON.stringify({ stems: usualData.stems, leaves: usualData.leaves, flowers: usualData.flowers }));
    });
  });

  // The same section: flush on cohorts. A spur comes into leaf again every year; where the flush begins in December
  // its leaves are opening before the year they belong to has begun.
  describe('a leaf flush from 16 December to 9 February', () => {
    const DATES = { 'phenology.autumnColourDoy': [283, 310], 'phenology.leafFallDoy': [310, 344] } satisfies Values;
    const grow = (flush: [number, number]) => run(one(vary(library, WISTERIA, { ...DATES, 'phenology.leafFlushDoy': flush }), WISTERIA, 5), '2031-12-31');
    const early = grow([350, 40]);
    const data = toRenderData(early);
    const spring = toRenderData(grow([100, 155]));
    const renewed = (l: RenderLeaf) => l.lastYear === null && l.firstYear < 2031;

    it('is given to a viewer in days that are in order, with next year’s flush carried into this year’s entry', () => {
      const cal = early.calendar;
      for (const s of data.seasons) {
        expect(s.leafFlush).toEqual([cal.dayOfYearDay(s.year - 1, 350), cal.dayOfYearDay(s.year, 40)]);
        expect(s.leafFlushAfter).toEqual([cal.dayOfYearDay(s.year, 350), cal.dayOfYearDay(s.year + 1, 40)]);
        expect('leafFallBefore' in s).toBe(false);
      }
    });

    it('has a spur’s leaves opening in the last days of December, and further open in January', () => {
      const day = (iso: string) => early.calendar.dayOf(iso);
      const state = (l: RenderLeaf, iso: string) => leafState(l, seasonsOf(data, Number(iso.slice(0, 4))).get('plant'), day(iso));
      const sites = data.leaves.filter(renewed);
      expect(sites.length).toBeGreaterThan(20);
      for (const l of sites) {
        // bare between the fall and the flush
        expect(state(l, '2030-12-12').present).toBe(false);
        const dec = state(l, '2030-12-28');
        const jan = state(l, '2031-01-03');
        const feb = state(l, '2031-02-09');
        expect(dec.present).toBe(true);
        expect(dec.expansion).toBeGreaterThan(0);
        expect(dec.expansion).toBeLessThan(0.5);
        expect(jan.present).toBe(true);
        expect(jan.expansion).toBeGreaterThan(dec.expansion);
        expect(feb.expansion).toBe(1);
        expect(dec.autumn).toBe(0);
      }
      // where the flush is in spring the same spurs are bare on both days
      for (const l of spring.leaves.filter(renewed)) {
        expect(leafState(l, seasonsOf(spring, 2030).get('plant'), day('2030-12-28')).present).toBe(false);
        expect(leafState(l, seasonsOf(spring, 2031).get('plant'), day('2031-01-03')).present).toBe(false);
      }
    });
  });

  // CONSTRAINTS section 3: old wood on spurs. The bud wakes at bud break and opens in the window that begins that year.
  it('opens a spur’s flowers from 16 December to 20 January where a spur-flowering plant’s window says so', () => {
    const WINTER = { 'phenology.floralInitiationDoy': [213, 258], 'phenology.flowerOpenDoy': [350, 20], 'phenology.petalFallDoy': [30, 50], 'phenology.flowerLastsDays': [0, 0] } satisfies Values;
    const sim = run(one(vary(library, WISTERIA, WINTER), WISTERIA, 7), '2033-12-31');
    const flowers = sim.buds.filter((b) => b.openDay !== null);
    expect(flowers.length).toBeGreaterThan(10);
    let afterNewYear = 0;
    for (const b of flowers) {
      const o = sim.calendar.dateOf(b.openDay!);
      expect(inWindow([350, 20], o.dayOfYear), o.iso).toBe(true);
      expect(o.year).toBe(o.dayOfYear >= 350 ? b.floweringYear : b.floweringYear + 1);
      if (o.dayOfYear <= 20) afterNewYear++;
      if (b.spentDay === null) continue;
      // the petals fall in the window that follows, which is the year after the display began
      const s = sim.calendar.dateOf(b.spentDay);
      expect(s.year).toBe(b.floweringYear + 1);
      expect(s.dayOfYear).toBeGreaterThanOrEqual(30);
      expect(s.dayOfYear).toBeLessThanOrEqual(50);
    }
    expect(afterNewYear).toBeGreaterThan(2);
    expect(flowers.length - afterNewYear).toBeGreaterThan(2);
  });

  it('opens the flowers along the year’s shoots, and at the ends of its flowering side shoots, from 6 December to 30 January', () => {
    const SHOOTS = { 'sideShoots.bearingWoodAgeYears': 1, 'sideShoots.perMetrePerYear': 3, 'sideShoots.lengthM': [0.15, 0.4], 'sideShoots.lifespanYears': 1, 'sideShoots.terminalFlowerShare': 0.9 } satisfies Values;
    const sim = run(one(vary(library, ROSE, { ...FLOWERS, ...SHOOTS, 'phenology.flowerOpenDoy': [340, 30] }, {}, 'current_season'), ROSE, 6), END);
    const flowers = sim.buds.filter((b) => b.openDay !== null);
    const atEnds = flowers.filter((b) => sim.axes.get(b.axisId)!.role === 'side_shoot');
    expect(atEnds.length).toBeGreaterThan(10);
    expect(flowers.length - atEnds.length).toBeGreaterThan(10);
    for (const where of [atEnds, flowers.filter((b) => !atEnds.includes(b))]) {
      let afterNewYear = 0;
      for (const b of where) {
        const o = sim.calendar.dateOf(b.openDay!);
        expect(inWindow([340, 30], o.dayOfYear), o.iso).toBe(true);
        // the display belongs to the year it began in, which is the year the shoot that bears it grew
        expect(o.year).toBe(o.dayOfYear >= 340 ? b.floweringYear : b.floweringYear + 1);
        expect(sim.calendar.dateOf(b.initiatedDay).year).toBe(b.floweringYear);
        if (o.dayOfYear <= 30) afterNewYear++;
      }
      expect(afterNewYear).toBeGreaterThan(2);
      expect(where.length - afterNewYear).toBeGreaterThan(2);
    }
  });
});

// ============================================================================================================
// SIMULATION_KEY.md section 5, "Morphology: organ lengths ... internode distribution ... leaf area": per
// species, and within a species per kind of shoot. Mechanism traits do not transfer (CLAUDE.md): a spur's leaf
// is the spur's, a flowering side shoot's leaf is its own, and each has its taxon's numbers or none.
// ============================================================================================================
describe('a leaf of its own for each kind of shoot', () => {
  describe('a spur’s leaf', () => {
    const NAMES: GrowthNames = { leafForm: 'shoot_leaf', spurLeafForm: 'spur_leaf' };
    const grow = (values: Values) => run(one(vary(library, WISTERIA, { 'organs.leafLengthM': [0.16, 0.28], ...values }, NAMES), WISTERIA, 5), '2031-12-31');
    const own = toRenderData(grow({ 'organs.spurLeafLengthM': [0.05, 0.08] }));
    const none = toRenderData(grow({}));

    it('has the length its model gives it, and the shoots’ leaves keep theirs', () => {
      const spur = own.leaves.filter((l) => l.form === 'spur_leaf');
      expect(spur.length).toBeGreaterThan(50);
      for (const l of spur) {
        expect(l.lengthM).toBeGreaterThanOrEqual(0.05);
        expect(l.lengthM).toBeLessThanOrEqual(0.08);
      }
      for (const l of own.leaves.filter((x) => x.form === 'shoot_leaf')) {
        expect(l.lengthM).toBeGreaterThanOrEqual(0.16);
        expect(l.lengthM).toBeLessThanOrEqual(0.28);
      }
    });

    it('is nine tenths of a shoot’s leaf where the model gives none: the prototype’s figure, kept so that nothing moves', () => {
      const spur = none.leaves.filter((l) => l.form === 'spur_leaf');
      expect(spur.length).toBeGreaterThan(50);
      for (const l of spur) {
        expect(l.lengthM).toBeGreaterThanOrEqual(0.16 * 0.9 - 0.0005);
        expect(l.lengthM).toBeLessThanOrEqual(0.28 * 0.9 + 0.0005);
      }
    });

    it('changes the length of spur leaves and nothing else: the same leaves in the same places, the same stems and flowers', () => {
      const blind = (l: RenderLeaf) => (l.form === 'spur_leaf' ? { ...l, lengthM: 0 } : l);
      expect(text(own, { leaf: blind })).toBe(text(none, { leaf: blind }));
      expect(text(own)).not.toBe(text(none));
    });
  });

  describe('a flowering side shoot’s leaf', () => {
    const SHOOTS = { 'sideShoots.bearingWoodAgeYears': 2, 'sideShoots.perMetrePerYear': 1, 'sideShoots.lengthM': [0.5, 0.8], 'sideShoots.lifespanYears': 3, 'sideShoots.terminalFlowerShare': 0.7 } satisfies Values;
    const ORDINARY = { 'organs.leafLengthM': [0.08, 0.12], 'organs.leafSpacingM': [0.06, 0.1], 'organs.leavesPerNode': 2, 'organs.leafLifespanYears': 1 } satisfies Values;
    const OWN = { 'organs.sideShootLeafLengthM': [0.03, 0.05], 'organs.sideShootLeafSpacingM': [0.16, 0.2], 'organs.sideShootLeavesPerNode': 1, 'organs.sideShootLeafLifespanYears': 1 } satisfies Values;
    const NAMES: GrowthNames = { leafForm: 'climbing_leaf', sideShootLeafForm: 'flowering_shoot_leaf' };
    const grow = (values: Values) => run(one(vary(library, HYDRANGEA, { ...ORDINARY, ...SHOOTS, ...values }, NAMES, 'previous_season'), HYDRANGEA, 7), '2033-12-31');
    const sim = grow(OWN);
    const data = toRenderData(sim);
    const plain = grow({});
    const plainData = toRenderData(plain);
    const side = (s: Simulation) => new Set([...s.axes.values()].filter((a) => a.role === 'side_shoot').map((a) => a.id));
    const mine = data.leaves.filter((l) => side(sim).has(l.stemId));
    const theirs = plainData.leaves.filter((l) => side(plain).has(l.stemId));
    const perPlace = (leaves: RenderLeaf[]) => {
      const n = new Map<string, number>();
      for (const l of leaves) n.set(`${l.stemId}|${l.stemPoint}`, (n.get(`${l.stemId}|${l.stemPoint}`) ?? 0) + 1);
      return [...new Set(n.values())];
    };

    it('has its own length, stands singly where the plant’s other leaves stand in pairs, and lasts the seasons its model gives', () => {
      expect(mine.length).toBeGreaterThan(30);
      for (const l of mine) {
        expect(l.form).toBe('flowering_shoot_leaf');
        expect(l.lengthM).toBeGreaterThanOrEqual(0.03);
        expect(l.lengthM).toBeLessThanOrEqual(0.05);
        // one season from the year that stretch of the shoot was made, where a shoot was in leaf every year it lived
        expect(l.lastYear).toBe(l.firstYear);
      }
      expect(perPlace(mine)).toEqual([1]);
      expect(perPlace(data.leaves.filter((l) => !side(sim).has(l.stemId)))).toEqual([2]);
    });

    it('stands at its own spacing along the shoot', () => {
      let gaps = 0;
      for (const id of side(sim)) {
        const a = sim.axes.get(id)!;
        const at = [...new Set(sim.leaves.filter((l) => l.axisId === id).map((l) => l.pointIndex))].sort((p, q) => p - q).map((i) => a.lengthAt[i]!);
        if (lengthOf(a) > 0.25) expect(at.length, id).toBeGreaterThan(0);
        // the first leaf is a spacing from the base, and each after it a spacing on: to the nearest stored point of stem, 4 cm apart
        for (let k = 0; k < at.length; k++) {
          const gap = at[k]! - (k ? at[k - 1]! : 0);
          expect(gap, id).toBeGreaterThanOrEqual(0.16 - 1e-9);
          expect(gap, id).toBeLessThan(0.2 + 0.04 + 1e-9);
          gaps++;
        }
      }
      expect(gaps).toBeGreaterThan(30);
    });

    it('is the plant’s ordinary leaf in everything but name where the model gives it no numbers of its own', () => {
      expect(theirs.length).toBeGreaterThan(mine.length * 2);
      for (const l of theirs) {
        expect(l.form).toBe('flowering_shoot_leaf');
        expect(l.lengthM).toBeGreaterThanOrEqual(0.08);
        expect(l.lengthM).toBeLessThanOrEqual(0.12);
        expect(l.lastYear).toBeNull();
      }
      expect(perPlace(theirs)).toEqual([2]);
    });

    it('changes the side shoots’ leaves and nothing else: every stem, the side shoots among them, and every other leaf and flower', () => {
      const off = side(plain);
      expect([...side(sim)]).toEqual([...off]);
      expect(JSON.stringify(data.stems)).toBe(JSON.stringify(plainData.stems));
      expect(JSON.stringify(data.flowers)).toBe(JSON.stringify(plainData.flowers));
      expect(JSON.stringify(data.leaves.filter((l) => !off.has(l.stemId)))).toBe(JSON.stringify(plainData.leaves.filter((l) => !off.has(l.stemId))));
    });
  });
});

// ============================================================================================================
// CONSTRAINTS_AND_PHENOLOGY.md section 5, "Leaf state and evergreen realism": "Semi-evergreen: Akebia quinata —
// leaf retention is climate-dependent", and of Lonicera henryi, "do not count on full winter cover from it in
// exposed sectors". PROJECT_CONTEXT.md section 10: evergreen survival and leaf retention on exposed sites may
// stay uncertain, as a labelled number. Section 6: winter has "no requirement for false full-canopy greenery".
// ============================================================================================================
describe('leaves kept through winter', () => {
  const DATES = { 'organs.leafLifespanYears': 1, 'phenology.leafFlushDoy': [100, 155], 'phenology.autumnColourDoy': [283, 310], 'phenology.leafFallDoy': [310, 344] } satisfies Values;
  const END = '2032-12-31';
  const grow = (values: Values, extra: GardenerEvent[] = []) => run(one(vary(library, AKEBIA, { ...DATES, ...values }, {}, 'previous_season'), AKEBIA, 6, extra), END);
  const sim = grow({ 'organs.winterLeafShare': 0.3 });
  const data = toRenderData(sim);
  const bareInWinter = grow({});
  const bareData = toRenderData(bareInWinter);
  const cal = sim.calendar;

  it('are none on a semi-evergreen plant whose model gives no share: it is drawn deciduous, and the run says so', () => {
    expect(sim.scenario.taxa.get(AKEBIA)!.profile.leafHabit.value).toBe('semi_evergreen');
    expect(inLeaf(bareInWinter, bareData, '2031-10-01').length).toBeGreaterThan(100);
    expect(inLeaf(bareInWinter, bareData, '2032-01-15')).toHaveLength(0);
    expect(bareData.leaves.some((l) => l.evergreen)).toBe(false);
    const said = bareInWinter.decisions.filter((d) => d.kind === 'part_not_modelled' && d.text.includes('organs.winterLeafShare'));
    expect(said).toHaveLength(1);
    expect(said[0]!.text).toContain('semi-evergreen');
    expect(designReport(bareInWinter).alerts.some((a) => a.kind === 'part_not_modelled' && a.text.includes('drawn bare in winter'))).toBe(true);
    // with the number given there is nothing to say
    expect(sim.decisions.some((d) => d.text.includes('organs.winterLeafShare'))).toBe(false);
  });

  it('are about the share the model gives, each leaf decided where it stands', () => {
    expect(data.leaves.length).toBeGreaterThan(400);
    const kept = data.leaves.filter((l) => l.evergreen);
    expect(kept.length / data.leaves.length).toBeGreaterThan(0.22);
    expect(kept.length / data.leaves.length).toBeLessThan(0.38);
    // not a block of them: kept and dropped leaves stand along the same stems
    const stems = new Map<string, Set<boolean>>();
    for (const l of data.leaves) stems.set(l.stemId, (stems.get(l.stemId) ?? new Set()).add(l.evergreen));
    expect([...stems.values()].filter((s) => s.size === 2).length).toBeGreaterThan(5);
  });

  it('leave the plant thinly clothed in January: neither bare nor as it was in October', () => {
    const autumn = inLeaf(sim, data, '2031-10-01');
    const january = inLeaf(sim, data, '2032-01-15');
    expect(january.length).toBeGreaterThan(autumn.length * 0.15);
    expect(january.length).toBeLessThan(autumn.length * 0.45);
    // exactly the kept leaves of the autumn before, and every one of them
    expect(new Set(january)).toEqual(new Set(autumn.filter((l) => l.evergreen)));
    const day = cal.dayOf('2032-01-15');
    for (const l of january) expect(leafState(l, seasonsOf(data, 2032).get('plant'), day)).toEqual({ present: true, expansion: 1, autumn: 0 });
    // and the design report, which asks the same question of the same place, counts them
    const months = (s: Simulation) => designReport(s, { year: 2032 }).months;
    expect(months(sim).find((m) => m.month === 1)!.leaves['plant']).toBe(inLeaf(sim, data, '2032-01-15').length);
    expect(months(bareInWinter).find((m) => m.month === 1)!.leaves['plant'] ?? 0).toBe(0);
  });

  it('are shed as the next spring’s leaves open, each on a day of its own in the flush', () => {
    const [flush0, flush1] = [100, 155];
    const once = sim.leaves.filter((l) => l.evergreen && l.lastYear !== null);
    expect(once.length).toBeGreaterThan(50);
    const days = new Set<number>();
    for (const l of once) {
      // one more year than a leaf that falls: the spring after its season
      expect(l.lastYear).toBe(l.firstYear + 1);
      const planned = cal.dateOf(l.shedPlannedDay!);
      expect(planned.year).toBe(l.lastYear);
      expect(planned.dayOfYear).toBeGreaterThanOrEqual(flush0);
      expect(planned.dayOfYear).toBeLessThanOrEqual(flush1);
      if (l.shedPlannedDay! <= sim.day) expect(l.removedDay).toBe(l.shedPlannedDay);
      else expect(l.removedDay).toBeNull();
      days.add(planned.dayOfYear);
    }
    expect(days.size).toBeGreaterThan(20);
    // by the end of the flush last year's leaves have all gone and this year's are out
    const june = inLeaf(sim, data, '2032-06-10');
    expect(june.length).toBeGreaterThan(100);
    for (const l of june) expect(l.lastYear === null || l.firstYear === 2032).toBe(true);
    // a leaf that falls in autumn is as it always was
    for (const l of sim.leaves.filter((x) => !x.evergreen && x.lastYear !== null)) {
      expect(l.lastYear).toBe(l.firstYear);
      expect(l.shedPlannedDay).toBeUndefined();
    }
  });

  it('are kept every winter at a place that comes into leaf again each year', () => {
    const renewed = data.leaves.filter((l) => l.lastYear === null);
    const kept = renewed.filter((l) => l.evergreen);
    expect(kept.length).toBeGreaterThan(5);
    expect(kept.length).toBeLessThan(renewed.length);
    const winters = ['2031-01-15', '2032-01-15'];
    for (const l of kept) for (const iso of winters) if (l.firstYear < Number(iso.slice(0, 4))) expect(inLeaf(sim, data, iso)).toContain(l);
    for (const l of renewed.filter((x) => !x.evergreen)) expect(inLeaf(sim, data, '2032-01-15')).not.toContain(l);
  });

  it('change nothing else: the same stems and flowers, and the same leaves in the same places', () => {
    const blind = (l: RenderLeaf) => ({ ...l, evergreen: false, lastYear: l.lastYear === null ? null : l.firstYear, removedDay: -1 });
    expect(text(data, { leaf: blind })).toBe(text(bareData, { leaf: blind }));
    expect(sim.summaries).toEqual(bareInWinter.summaries);
  });

  // README working rule: removing a living stem also removes its leaves. A leaf waiting for spring is still on its stem.
  it('go with their stem on the day of a cut, not on the day they would have been shed', () => {
    const cut: GardenerEvent = { id: 'february-cut', date: '2032-02-10', type: 'hard_prune', plantId: 'plant', target: { allStems: true }, keepM: 0.5 };
    const pruned = grow({ 'organs.winterLeafShare': 0.3 }, [cut]);
    const day = pruned.calendar.dayOf(cut.date);
    const taken = pruned.leaves.filter((l) => l.evergreen && l.removedDay === day);
    expect(taken.length).toBeGreaterThan(20);
    for (const l of taken.filter((x) => x.shedPlannedDay !== undefined)) expect(l.shedPlannedDay!).toBeGreaterThan(day);
    for (const l of pruned.leaves) {
      const gone = pruned.axes.get(l.axisId)!.removedDayAt[l.pointIndex] ?? null;
      if (gone !== null) expect(l.removedDay!, `${l.axisId} point ${l.pointIndex}`).toBeLessThanOrEqual(gone);
    }
    expect(inLeaf(pruned, toRenderData(pruned), '2032-02-11').length).toBeLessThan(inLeaf(sim, data, '2032-02-11').length);
  });

  describe('on an evergreen where it stands exposed', () => {
    const KEPT = { 'organs.leafLifespanYears': 2, 'phenology.leafFlushDoy': [100, 155], 'phenology.autumnColourDoy': [283, 310], 'phenology.leafFallDoy': [310, 344] } satisfies Values;
    const henryi = (values: Values) => {
      const s = run(one(vary(library, HENRYI, { ...KEPT, ...values }, {}, 'current_season'), HENRYI, 5), '2031-12-31');
      return { sim: s, data: toRenderData(s) };
    };
    const full = henryi({});
    const half = henryi({ 'organs.winterLeafShare': 0.5 });

    it('are every leaf while the model gives no share, and with a share of one', () => {
      expect(full.sim.scenario.taxa.get(HENRYI)!.profile.leafHabit.value).toBe('evergreen');
      expect(full.data.leaves.every((l) => l.evergreen)).toBe(true);
      expect(JSON.stringify(henryi({ 'organs.winterLeafShare': 1 }).data.leaves)).toBe(JSON.stringify(full.data.leaves));
    });

    it('are about half of them at a share of a half, the rest falling in their first autumn', () => {
      const all = inLeaf(full.sim, full.data, '2031-01-15');
      const some = inLeaf(half.sim, half.data, '2031-01-15');
      expect(all.length).toBeGreaterThan(100);
      expect(some.length / all.length).toBeGreaterThan(0.38);
      expect(some.length / all.length).toBeLessThan(0.62);
      for (const l of half.data.leaves.filter((x) => !x.evergreen && x.lastYear !== null)) expect(l.lastYear).toBe(l.firstYear);
      for (const l of half.data.leaves.filter((x) => x.evergreen && x.lastYear !== null)) expect(l.lastYear).toBe(l.firstYear + 1);
      // in summer the plant is in full leaf either way, and the stems are the same stems
      expect(inLeaf(half.sim, half.data, '2031-07-15').length).toBeGreaterThan(some.length);
      expect(JSON.stringify(half.data.stems)).toBe(JSON.stringify(full.data.stems));
    });

    it('are none at a share of nothing: an evergreen made deciduous by its model, which is the model’s to say', () => {
      const none = henryi({ 'organs.winterLeafShare': 0 });
      expect(none.data.leaves.some((l) => l.evergreen)).toBe(false);
      expect(inLeaf(none.sim, none.data, '2031-01-15')).toHaveLength(0);
      expect(inLeaf(none.sim, none.data, '2031-07-15').length).toBeGreaterThan(50);
    });
  });
});

// ============================================================================================================
// CONSTRAINTS_AND_PHENOLOGY.md section 3: "Roses and Campsis require their own seasonal lateral-growth and
// repeat-flowering mechanisms, not wisteria's exact rule." KEY.md section 2: Rosa 'The Generous Gardener',
// "Repeat pink flowers". HORTICULTURAL_INTERVENTIONS.md section 2: `deadhead_or_select_flowers` "Removes spent
// or excess flowers/fruit, affects visual output". README working rule: a flowering month is an envelope, not a
// trigger.
// ============================================================================================================
describe('flowering again where a flower has gone over', () => {
  const WINDOW = [182, 288] as const;
  const FLOWERS = { 'phenology.floralInitiationDoy': [150, 165], 'phenology.flowerOpenDoy': [182, 288], 'phenology.flowerLastsDays': [8, 16] } satisfies Values;
  const AGAIN = { 'flowering.repeatMaxPerSeason': 2, 'flowering.repeatIntervalDays': [35, 50], 'flowering.repeatShare': 0.6 } satisfies Values;
  const END = '2032-12-31';
  const grow = (values: Values, extra: GardenerEvent[] = []) => run(one(vary(library, ROSE, { ...FLOWERS, ...values }, {}, 'current_season'), ROSE, 6, extra), END);
  const once = grow({});
  const sim = grow(AGAIN);
  const cal = sim.calendar;
  const doy = (day: number) => cal.dateOf(day).dayOfYear;
  const byId = (s: Simulation) => new Map(s.buds.map((b) => [b.id, b]));
  const followers = (s: Simulation) => s.buds.filter((b) => (b.flush ?? 0) > 0);
  const lastOpenDay = (b: FloralBud) => cal.dayOfYearDay(b.floweringYear, WINDOW[1]);
  const place = (b: FloralBud) => `${b.axisId}|${b.pointIndex}|${b.floweringYear}`;

  it('does not happen while the model says nothing of it: one flower to a place in a year', () => {
    expect(once.buds.length).toBeGreaterThan(80);
    expect(followers(once)).toHaveLength(0);
    expect(new Set(once.buds.map(place)).size).toBe(once.buds.length);
    for (const b of once.buds) expect(b.followedBy).toBeUndefined();
  });

  it('puts the next flower at the same place, on the same wood, the wait its model gives after the one before went over', () => {
    const all = byId(sim);
    const again = followers(sim);
    expect(again.length).toBeGreaterThan(20);
    const before = new Map(sim.buds.filter((b) => b.followedBy !== undefined).map((b) => [b.followedBy!, b]));
    for (const b of again) {
      const p = before.get(b.id)!;
      expect(p, b.id).toBeDefined();
      expect(all.get(p.followedBy!)).toBe(b);
      expect(place(b)).toBe(place(p));
      expect(b.flush).toBe((p.flush ?? 0) + 1);
      expect(p.spentDay).not.toBeNull();
      // a bud of the plant's own from the day its predecessor went over, showing for up to a month before it opens
      expect(b.initiatedDay).toBe(p.spentDay);
      expect(b.openPlannedDay - p.spentDay!).toBeGreaterThanOrEqual(35);
      expect(b.openPlannedDay - p.spentDay!).toBeLessThanOrEqual(50);
      expect(b.developDay).toBe(Math.max(p.spentDay!, b.openPlannedDay - 30));
      expect(b.spentPlannedDay - b.openPlannedDay).toBeGreaterThanOrEqual(8);
      expect(b.spentPlannedDay - b.openPlannedDay).toBeLessThanOrEqual(16);
      if (b.openDay !== null) {
        expect(b.openDay).toBe(b.openPlannedDay);
        expect(b.position).toEqual(p.position);
      }
      expect(b.form).toBe(p.form);
    }
  });

  it('happens only inside the flowering window, and no more often than the model allows', () => {
    for (const b of sim.buds.filter((x) => x.openDay !== null)) {
      expect(doy(b.openDay!)).toBeGreaterThanOrEqual(WINDOW[0]);
      expect(doy(b.openDay!)).toBeLessThanOrEqual(WINDOW[1]);
    }
    expect(Math.max(...sim.buds.map((b) => b.flush ?? 0))).toBe(2);
    for (const b of sim.buds.filter((x) => x.flush === 2)) expect(b.followedBy).toBeUndefined();
    // a flower that goes over too late in the season for the shortest wait is followed by none; one with room for the longest, about the share the model gives
    const spent = sim.buds.filter((b) => b.spentDay !== null && (b.flush ?? 0) < 2);
    const tooLate = spent.filter((b) => b.spentDay! + 35 > lastOpenDay(b));
    const inTime = spent.filter((b) => b.spentDay! + 50 <= lastOpenDay(b));
    expect(tooLate.length).toBeGreaterThan(10);
    for (const b of tooLate) expect(b.followedBy).toBeUndefined();
    expect(inTime.length).toBeGreaterThan(40);
    const followed = inTime.filter((b) => b.followedBy !== undefined).length / inTime.length;
    expect(followed).toBeGreaterThan(0.42);
    expect(followed).toBeLessThan(0.78);
  });

  // CLAUDE.md: draw from the stream that matches what is decided, so that an intervention changes only what it touches.
  it('adds its flowers and moves nothing else: the first flowers keep their days, and every stem its name', () => {
    const first = (s: Simulation) => s.buds.filter((b) => (b.flush ?? 0) === 0).map((b) => [b.id, b.axisId, b.pointIndex, b.openDay, b.spentDay, b.lengthM]);
    expect(first(sim)).toEqual(first(once));
    const a = toRenderData(sim);
    const b = toRenderData(once);
    expect(JSON.stringify({ stems: a.stems, leaves: a.leaves, seasons: a.seasons })).toBe(JSON.stringify({ stems: b.stems, leaves: b.leaves, seasons: b.seasons }));
    expect(a.flowers.length).toBeGreaterThan(b.flowers.length);
    for (const s of sim.summaries) {
      const o = once.summaries.find((x) => x.year === s.year)!;
      const more = followers(sim).filter((x) => x.openDay !== null && cal.dateOf(x.openDay).year === s.year).length;
      expect(s.flowersOpened, String(s.year)).toBe(o.flowersOpened + more);
      expect({ ...s, flowersOpened: 0, floralBudsInitiated: 0 }).toEqual({ ...o, flowersOpened: 0, floralBudsInitiated: 0 });
    }
  });

  // README working rule: removing a living stem also removes its buds. A flower on its way is a bud on that stem.
  it('loses the flower that was on its way when the wood it stands on is cut', () => {
    const cut: GardenerEvent = { id: 'august-cut', date: '2031-08-25', type: 'hard_prune', plantId: 'plant', target: { allStems: true }, keepM: 0.3 };
    const pruned = grow(AGAIN, [cut]);
    const day = pruned.calendar.dayOf(cut.date);
    const waiting = followers(sim).filter((b) => b.initiatedDay < day && b.openPlannedDay > day);
    expect(waiting.length).toBeGreaterThan(3);
    const lost = followers(pruned).filter((b) => b.endedBy === 'august-cut');
    expect(lost.length).toBeGreaterThan(3);
    for (const b of lost) {
      expect(b.end).toBe('removed_by_pruning');
      expect(b.openDay).toBeNull();
      expect(pruned.axes.get(b.axisId)!.removedDayAt[b.pointIndex!]).toBe(day);
    }
    expect(pruned.events.find((e) => e.eventId === 'august-cut')!.effects.floralBudsRemoved).toBeGreaterThanOrEqual(lost.length);
  });

  // Mechanism traits do not transfer (CLAUDE.md): a spur's flower formed last summer and has no successor this year.
  it('never follows a spur’s flower: a wisteria given the same numbers flowers exactly as it did', () => {
    const wisteria = (values: Values) => run(one(vary(library, WISTERIA, values), WISTERIA, 6), END);
    const a = wisteria(AGAIN);
    const b = wisteria({});
    expect(a.buds.filter((x) => x.openDay !== null).length).toBeGreaterThan(20);
    expect(followers(a)).toHaveLength(0);
    expect(JSON.stringify(toRenderData(a).flowers)).toBe(JSON.stringify(toRenderData(b).flowers));
  });

  it('follows the flower at the end of a flowering side shoot as well, at the shoot’s end', () => {
    const SHOOTS = { 'sideShoots.bearingWoodAgeYears': 1, 'sideShoots.perMetrePerYear': 3, 'sideShoots.lengthM': [0.15, 0.4], 'sideShoots.lifespanYears': 1, 'sideShoots.terminalFlowerShare': 0.9 } satisfies Values;
    const s = grow({ ...SHOOTS, ...AGAIN });
    const again = followers(s).filter((b) => s.axes.get(b.axisId)!.role === 'side_shoot');
    expect(again.length).toBeGreaterThan(10);
    for (const b of again) {
      expect(b.pointIndex).toBeNull();
      if (b.openDay === null) continue;
      const shoot = s.axes.get(b.axisId)!;
      expect(b.position).toEqual(shoot.contact[shoot.contact.length - 1]);
    }
    // and the flowers at the nodes of the canes go on as before
    expect(followers(s).some((b) => b.pointIndex !== null)).toBe(true);
  });

  it('says once what is missing where a model has begun to give the numbers and not finished, and says nothing where it gives none or says no', () => {
    const half = grow({ 'flowering.repeatIntervalDays': [35, 50] });
    expect(followers(half)).toHaveLength(0);
    const said = half.decisions.filter((d) => d.kind === 'part_not_modelled' && d.text.includes('flowering again'));
    expect(said).toHaveLength(1);
    expect(said[0]!.text).toContain('flowering.repeatMaxPerSeason, flowering.repeatShare');
    expect(said[0]!.text).not.toContain('flowering.repeatIntervalDays');
    expect(once.decisions.some((d) => d.text.includes('flowering again'))).toBe(false);
    const no = grow({ 'flowering.repeatMaxPerSeason': 0 });
    expect(followers(no)).toHaveLength(0);
    expect(no.decisions.some((d) => d.text.includes('flowering again'))).toBe(false);
  });

  describe('and deadheading', () => {
    const visits = (years: number[], dates: string[]): GardenerEvent[] => years.flatMap((y) => dates.map((d): GardenerEvent => ({ id: `deadhead-${y}-${d}`, date: `${y}-${d}`, type: 'deadhead_or_select_flowers', plantId: 'plant', author: 'gardener', reason: 'RHS: deadhead during the flowering season to encourage repeat flowering' })));
    const SUMMER = visits([2030, 2031, 2032], ['07-20', '08-10', '08-31', '09-21']);
    const SOONER = { ...AGAIN, 'flowering.repeatIntervalDeadheadedDays': [14, 21] } satisfies Values;
    const recorded = grow(AGAIN, SUMMER);
    const acted = grow(SOONER, SUMMER);

    it('is recorded and changes nothing for a plant whose model does not say what follows it, as before', () => {
      const log = recorded.events.filter((e) => e.type === 'deadhead_or_select_flowers');
      expect(log).toHaveLength(12);
      for (const e of log) {
        expect(e.modelled).toBe(false);
        expect(e.outcome).toContain('the model does not yet act on this kind of event');
      }
      expect(recorded.buds.map((b) => [b.id, b.openDay, b.spentDay])).toEqual(sim.buds.map((b) => [b.id, b.openDay, b.spentDay]));
      expect(recorded.buds.some((b) => b.deadheadedBy !== undefined)).toBe(false);
      expect(designReport(recorded).alerts.some((a) => a.kind === 'recorded_only')).toBe(true);
    });

    it('is acted on where the model does: spent flowers come off, and the log says how many and what follows', () => {
      const log = acted.events.filter((e) => e.type === 'deadhead_or_select_flowers');
      for (const e of log) expect(e.modelled).toBe(true);
      expect(log.filter((e) => /deadheaded: \d+ spent flowers? taken off/.test(e.outcome)).length).toBeGreaterThan(6);
      expect(designReport(acted).alerts.some((a) => a.kind === 'recorded_only')).toBe(false);
      const heads = acted.buds.filter((b) => b.deadheadedBy !== undefined);
      expect(heads.length).toBeGreaterThan(30);
      for (const b of heads) {
        const visit = acted.calendar.dayOf(SUMMER.find((e) => e.id === b.deadheadedBy)!.date);
        // only a flower that had gone over, and only while the season it flowered in lasted
        expect(b.spentDay!).toBeLessThanOrEqual(visit);
        expect(visit).toBeLessThanOrEqual(lastOpenDay(b));
      }
      // an open flower is left alone
      for (const b of acted.buds) if (b.deadheadedBy !== undefined) expect(b.stage).toBe('spent');
    });

    it('brings the next flower forward to the model’s shorter wait after the visit, never back, and rolls no dice again', () => {
      const natural = byId(sim);
      let sooner = 0;
      let letIn = 0;
      for (const b of acted.buds.filter((x) => x.deadheadedBy !== undefined && x.followedBy !== undefined)) {
        const next = byId(acted).get(b.followedBy!)!;
        const visit = acted.calendar.dayOf(SUMMER.find((e) => e.id === b.deadheadedBy)!.date);
        const was = natural.get(next.id);
        // followers of followers stand on days that have themselves moved: compare the first follower of a first flower
        if ((b.flush ?? 0) > 0) continue;
        if (!was) {
          // none followed it before: its own wait would have run past the season, and the shorter one does not
          expect(b.spentDay! + 35).toBeGreaterThan(lastOpenDay(b) - 15);
          expect(next.openPlannedDay - visit).toBeGreaterThanOrEqual(14);
          expect(next.openPlannedDay - visit).toBeLessThanOrEqual(21);
          letIn++;
          continue;
        }
        expect(next.openPlannedDay).toBeLessThanOrEqual(was.openPlannedDay);
        if (next.openPlannedDay < was.openPlannedDay) {
          expect(next.openPlannedDay - visit).toBeGreaterThanOrEqual(14);
          expect(next.openPlannedDay - visit).toBeLessThanOrEqual(21);
          // it is the same flower, as long in flower as it would have been
          expect(next.spentPlannedDay - next.openPlannedDay).toBe(was.spentPlannedDay - was.openPlannedDay);
          expect(next.lengthM).toBe(was.lengthM);
          sooner++;
        }
      }
      expect(sooner).toBeGreaterThan(10);
      expect(letIn).toBeGreaterThan(0);
      // a first flower that chance left without a follower has none after deadheading either
      const firsts = (s: Simulation) => s.buds.filter((b) => (b.flush ?? 0) === 0);
      const refused = firsts(sim).filter((b) => b.followedBy === undefined && b.spentDay !== null && b.spentDay + 50 <= lastOpenDay(b));
      expect(refused.length).toBeGreaterThan(10);
      for (const b of refused) expect(byId(acted).get(b.id)!.followedBy, b.id).toBeUndefined();
      // more flowers in all, every one inside the window
      const open = (s: Simulation) => s.buds.filter((b) => b.openDay !== null);
      expect(open(acted).length).toBeGreaterThan(open(sim).length);
      for (const b of open(acted)) expect(doy(b.openDay!)).toBeLessThanOrEqual(WINDOW[1]);
      expect(firsts(acted).map((b) => [b.id, b.openDay, b.spentDay])).toEqual(firsts(sim).map((b) => [b.id, b.openDay, b.spentDay]));
    });

    it('takes the unripe fruit behind a spent flower, and leaves fruit that has begun to ripen', () => {
      const HIPS = { 'fruit.setShare': 0.8, 'fruit.lengthM': [0.012, 0.018], 'fruit.swellDays': [30, 40], 'fruit.ripenDoy': [270, 320], 'fruit.fallDoy': [350, 60] } satisfies Values;
      const all = [...SUMMER, ...visits([2031], ['11-20'])];
      const withHips = grow({ ...SOONER, ...HIPS }, all);
      const left = grow({ ...SOONER, ...HIPS });
      expect(left.fruits.length).toBeGreaterThan(60);
      const taken = withHips.fruits.filter((f) => f.removedBy?.startsWith('deadhead-'));
      expect(taken.length).toBeGreaterThan(20);
      for (const f of taken) {
        const visit = withHips.calendar.dayOf(all.find((e) => e.id === f.removedBy)!.date);
        expect(f.removedDay).toBe(visit);
        // only fruit that had not begun to ripen, and only with the flower it followed
        expect(visit).toBeLessThan(f.ripen[0]);
        const flower = withHips.buds.find((b) => b.fruitId === f.id)!;
        expect(flower.deadheadedBy).toBe(f.removedBy);
        expect(flower.spentDay).toBe(f.swell[0]);
      }
      expect(withHips.events.filter((e) => e.type === 'deadhead_or_select_flowers').some((e) => /with unripe fruit behind/.test(e.outcome))).toBe(true);
      // a visit in late November, after the flowering season: hips that have begun to ripen are still there the day after
      const day = withHips.calendar.dayOf('2031-11-20');
      const ripening = withHips.fruits.filter((f) => f.swell[0] < day && f.ripen[0] <= day && (f.removedDay === null || f.removedDay > day));
      expect(ripening.length).toBeGreaterThan(0);
      for (const f of ripening) expect(f.removedBy === null || f.removedBy === 'fell').toBe(true);
      // fewer hips through the winter for the summer's deadheading
      const hanging = (s: Simulation) => s.fruits.filter((f) => f.swell[0] <= day && (f.removedDay === null || f.removedDay > day)).length;
      expect(hanging(withHips)).toBeLessThan(hanging(left));
    });

    it('finds nothing to take off out of season, and says so', () => {
      const spring = grow(SOONER, visits([2031], ['04-10']));
      const visit = spring.events.find((e) => e.eventId === 'deadhead-2031-04-10')!;
      expect(visit.modelled).toBe(true);
      expect(visit.outcome).toBe('nothing to take off: no spent flowers on the plant');
      expect(spring.buds.map((b) => [b.id, b.openDay, b.spentDay])).toEqual(sim.buds.map((b) => [b.id, b.openDay, b.spentDay]));
    });
  });
});

// ============================================================================================================
// CONSTRAINTS_AND_PHENOLOGY.md section 3: "Framework age: old perennial main arms/trunks versus short
// laterals/spurs attached to them", and "Climbing hydrangea: flowering occurs on shoots formed the previous
// year". A hydrangea's flowering laterals build out from the support over years; they are not remade each spring.
// ============================================================================================================
describe('flowering side shoots that grow on', () => {
  const SHOOTS = { 'sideShoots.bearingWoodAgeYears': 2, 'sideShoots.perMetrePerYear': 1, 'sideShoots.lengthM': [0.2, 0.4], 'sideShoots.lifespanYears': 6, 'sideShoots.terminalFlowerShare': 0.7 } satisfies Values;
  const DATES = { 'phenology.budburstDoy': 90, 'phenology.growthEndDoy': 280, 'phenology.floralInitiationDoy': [213, 244], 'phenology.flowerOpenDoy': [160, 180], 'phenology.petalFallDoy': [190, 215], 'phenology.flowerLastsDays': [0, 0] } satisfies Values;
  const ON = { 'sideShoots.extensionMPerYear': [0.08, 0.15], 'sideShoots.maxLengthM': 0.75 } satisfies Values;
  const END = '2035-12-31';
  const grow = (values: Values, lifespan = 6) => run(one(vary(library, HYDRANGEA, { ...DATES, ...SHOOTS, 'sideShoots.lifespanYears': lifespan, ...values }, {}, 'previous_season'), HYDRANGEA, 9), END);
  const still = grow({});
  const sim = grow(ON);
  const cal = sim.calendar;
  const year = (day: number) => cal.dateOf(day).year;
  const shoots = (s: Simulation) => [...s.axes.values()].filter((a) => a.role === 'side_shoot');
  /** Length a shoot added in each calendar year, from the days its points were laid down. */
  const madeIn = (a: Axis) => {
    const by = new Map<number, number>();
    for (let i = 1; i < a.contact.length; i++) by.set(year(a.bornDayAt[i]!), (by.get(year(a.bornDayAt[i]!)) ?? 0) + a.lengthAt[i]! - a.lengthAt[i - 1]!);
    return by;
  };

  it('do not, while the model says nothing of it: a shoot stays the length it made in its first season', () => {
    const old = shoots(still).filter((a) => a.bornYear <= 2033);
    expect(old.length).toBeGreaterThan(20);
    for (const a of old) {
      expect([...madeIn(a).keys()]).toEqual([a.bornYear]);
      expect(lengthOf(a)).toBeLessThanOrEqual(0.4 + 1e-9);
    }
    expect(still.decisions.some((d) => d.kind === 'side_shoots_grew_on')).toBe(false);
  });

  it('add the length the model gives in each later season they live, and stop at the limit', () => {
    let grewOn = 0;
    let atLimit = 0;
    for (const a of shoots(sim)) {
      const made = madeIn(a);
      const lastSeason = Math.min(a.lastYear!, a.removedDay === null ? 2035 : year(a.removedDay) - 1);
      let have = made.get(a.bornYear) ?? 0;
      expect(have).toBeGreaterThanOrEqual(0.2 - 1e-6);
      expect(have).toBeLessThanOrEqual(0.4 + 1e-6);
      for (let y = a.bornYear + 1; y <= lastSeason; y++) {
        const more = made.get(y) ?? 0;
        if (have >= 0.75 - 1e-6) expect(more, `${a.id} in ${y}`).toBe(0);
        else if (have + more >= 0.75 - 1e-6) atLimit++;
        else {
          expect(more, `${a.id} in ${y}`).toBeGreaterThanOrEqual(0.08 - 1e-6);
          expect(more, `${a.id} in ${y}`).toBeLessThanOrEqual(0.15 + 1e-6);
        }
        if (more > 0) grewOn++;
        have += more;
      }
      expect(lengthOf(a)).toBeLessThanOrEqual(0.75 + 1e-6);
      expect(lengthOf(a)).toBeCloseTo(have, 6);
    }
    expect(grewOn).toBeGreaterThan(40);
    expect(atLimit).toBeGreaterThan(3);
    expect(Math.max(...shoots(sim).map(lengthOf))).toBeCloseTo(0.75, 6);
    expect(Math.max(...shoots(still).map(lengthOf))).toBeLessThan(0.41);
  });

  it('grow in spring, by the day the first flowers could open, along the line they ended on, standing clear of the support', () => {
    let checked = 0;
    for (const a of shoots(sim)) {
      for (let i = 2; i < a.contact.length; i++) {
        expect(Math.hypot(a.away[i]!.x, a.away[i]!.y, a.away[i]!.z)).toBe(0);
        const d = cal.dateOf(a.bornDayAt[i]!);
        expect(d.dayOfYear).toBeGreaterThanOrEqual(90);
        expect(d.dayOfYear).toBeLessThanOrEqual(160);
        if (year(a.bornDayAt[i]!) === year(a.bornDayAt[i - 1]!)) continue;
        // the first step of a later year: on from the last step of the year before, and laid down over weeks, not in a day
        expect(unitDot(sub(a.contact[i]!, a.contact[i - 1]!), sub(a.contact[i - 1]!, a.contact[i - 2]!))).toBeGreaterThan(0.97);
        checked++;
      }
      expect(a.runs).toHaveLength(0);
    }
    expect(checked).toBeGreaterThan(40);
  });

  it('carry leaves on the new growth, and flower at their new end', () => {
    const on = new Set(shoots(sim).map((a) => a.id));
    let newLeaves = 0;
    for (const l of sim.leaves.filter((x) => on.has(x.axisId))) {
      // a leaf is of the year its stretch of the shoot was made
      expect(l.firstYear).toBe(year(sim.axes.get(l.axisId)!.bornDayAt[l.pointIndex]!));
      if (l.firstYear > sim.axes.get(l.axisId)!.bornYear) newLeaves++;
    }
    expect(newLeaves).toBeGreaterThan(20);
    let atNewEnd = 0;
    for (const b of sim.buds.filter((x) => on.has(x.axisId) && x.openDay !== null)) {
      const a = sim.axes.get(b.axisId)!;
      // it opens after the year's growth is made, so where it stands is where the shoot now ends
      let tip = 0;
      while (tip + 1 < a.contact.length && a.bornDayAt[tip + 1]! <= b.openDay!) tip++;
      expect(b.position).toEqual(a.contact[tip]);
      if (year(a.bornDayAt[tip]!) > a.bornYear) atNewEnd++;
    }
    expect(atNewEnd).toBeGreaterThan(20);
  });

  it('change nothing else: the same shoots break from the same places, and the stems that bear them are the same to the last leaf and flower', () => {
    const a = toRenderData(sim);
    const b = toRenderData(still);
    const on = new Set(shoots(sim).map((x) => x.id));
    expect([...on]).toEqual(shoots(still).map((x) => x.id));
    expect(text(a, { keep: (id) => !on.has(id) })).toBe(text(b, { keep: (id) => !on.has(id) }));
    // each shoot's first season is what it was: the later growth is added to it
    for (const s of shoots(still)) {
      const grown = sim.axes.get(s.id)!;
      expect(grown.contact.slice(0, s.contact.length)).toEqual(s.contact);
      expect(grown.bornDayAt.slice(0, s.contact.length)).toEqual(s.bornDayAt);
      expect(grown.removedDay).toBe(s.removedDay);
    }
    // as many flowers, on the same days: they stand further out
    expect(a.flowers.map((f) => [f.stemId, f.openDay, f.spentDay])).toEqual(b.flowers.map((f) => [f.stemId, f.openDay, f.spentDay]));
    expect(sim.summaries).toEqual(still.summaries);
  });

  it('are in the trace, and go whole when their time is up', () => {
    const said = sim.decisions.filter((d) => d.kind === 'side_shoots_grew_on');
    expect(said.length).toBeGreaterThan(3);
    expect(said[0]!.text).toMatch(/\d+ flowering side shoots? of .* growing on, up to 0\.75 m long/);
    // a shorter life, so that some are shed inside the run: every point goes on the same day, the later years' among them
    const short = grow(ON, 3);
    const shed = shoots(short).filter((a) => a.removedDay !== null);
    expect(shed.length).toBeGreaterThan(5);
    for (const a of shed) {
      expect(madeIn(a).size).toBeGreaterThan(1);
      expect(a.removedDayAt.every((d) => d === a.removedDay)).toBe(true);
      for (const l of short.leaves.filter((x) => x.axisId === a.id)) expect(l.removedDay).toBe(a.removedDay);
    }
  });

  it('do not where the model gives the yearly growth and no limit, and the run says which number is missing', () => {
    const half = grow({ 'sideShoots.extensionMPerYear': [0.08, 0.15] });
    for (const a of shoots(half).filter((x) => x.bornYear <= 2033)) expect([...madeIn(a).keys()]).toEqual([a.bornYear]);
    const said = half.decisions.filter((d) => d.kind === 'part_not_modelled' && d.text.includes('growing on'));
    expect(said).toHaveLength(1);
    expect(said[0]!.text).toContain('sideShoots.maxLengthM');
    // growth of nothing is the model saying that they do not grow on: nothing to report
    const no = grow({ 'sideShoots.extensionMPerYear': [0, 0] });
    expect(no.decisions.some((d) => d.text.includes('growing on'))).toBe(false);
    expect(param(no.scenario.taxa.get(HYDRANGEA)!.model, 'phenology.budburstDoy')).toBe(90);
  });
});
