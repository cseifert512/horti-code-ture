import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ATTACHMENT_MECHANISM, Calendar, appendagePresent, assessAttachment, flowerState, fruitState, leafState, materialSummary, parsePlantingPlan, provisional, readBower, seasonsOf, stemPointAlive, toRenderData } from '@horti/core';
import { growPlanting, lastDateOf } from '../src/plant/grow.ts';
import { loadLooks, lookFor } from '../src/plant/registry.ts';
import { growable } from '../src/plant/scenario.ts';
import { frameSubject, frameWhole } from '../src/specimen/framing.ts';
import { SPECIMEN_STATION, SPECIMEN_VIEWS, describeSubject, findSubject, portraitDates, specimenPlan } from '../src/specimen/specimen.ts';

await loadLooks();
const FRAME = fileURLToPath(new URL('../../../examples/specimen-frame.bower.json', import.meta.url));
const frame = readBower(JSON.parse(readFileSync(FRAME, 'utf8')), 'examples/specimen-frame.bower.json');

// PROJECT_CONTEXT.md section 1: "The timber is the growing surface ... slender steel cables only where timber cannot
// give a hold ... cables, never steel rods or frames."
describe('the specimen frame', () => {
  it('reads without a warning: every member and cable is fixed to something and can be reached from the foot', () => {
    expect(frame.warnings).toEqual([]);
    expect(frame.bower.facts['routeOutOfReachM']).toBe(0);
    expect(frame.bower.rootStations.map((s) => s.id)).toEqual([SPECIMEN_STATION]);
    expect(frame.viewpoints).toHaveLength(2);
  });

  it('is a glulam post 3 m tall and 150 mm square, a panel of 40 mm laths 2.4 m wide and 2.6 m tall, and three 5 mm cables', () => {
    const post = frame.bower.members.find((m) => m.tier === 'primary')!;
    expect(frame.bower.members.filter((m) => m.tier === 'primary')).toHaveLength(1);
    expect(post.material).toBe('glulam');
    expect(post.section).toEqual({ shape: 'rect', widthMm: 150, depthMm: 150 });
    expect(post.curve.length).toBeCloseTo(3, 6);
    const laths = frame.bower.members.filter((m) => m.role === 'lath');
    for (const lath of laths) expect(lath.section).toEqual({ shape: 'rect', widthMm: 40, depthMm: 40 });
    const xs = laths.flatMap((l) => l.curve.points.map((p) => p.x));
    const zs = laths.filter((l) => l.id.startsWith('rail')).flatMap((l) => l.curve.points.map((p) => p.z));
    expect(Math.max(...xs)).toBeCloseTo(2.4, 1);
    expect(Math.max(...zs)).toBeCloseTo(2.6, 6);
    // 0.4 m centres, uprights and rails alike
    const uprights = laths.filter((l) => l.id.startsWith('upright')).map((l) => l.curve.points[0]!.x);
    for (let i = 1; i < uprights.length; i++) expect(uprights[i]! - uprights[i - 1]!).toBeCloseTo(0.4, 6);
    const cables = frame.bower.supports.filter((s) => s.kind === 'cable');
    expect(cables).toHaveLength(3);
    for (const c of cables) expect(c.diameterMm).toBe(5);
    // steel is the lesser part of what a plant can travel on
    expect(materialSummary(frame.bower).steelShareOfRoute).toBeLessThan(0.25);
  });

  // attachment.ts: what each way of climbing can hold. The limits here are stand-ins that stand for "a thin grasp"
  // and "a stout one"; each taxon's own limit is in its growth model.
  it('gives every way of climbing something to hold at the foot: a post, a lath and a cable meet there', () => {
    const entry = frame.bower.rootStations[0]!.entryNodeIds[0]!;
    const edges = frame.bower.graph.edgesAt(entry);
    const kinds = edges.map((e) => `${e.kind} ${Math.round(e.gripDiameterMm)}`).sort();
    expect(kinds).toEqual(['cable 5', 'timber 191', 'timber 51']);
    const thin = provisional(12, 'a stand-in for a slender grasp, for this test only', { unit: 'mm' });
    const outcomes = (mechanism: (typeof ATTACHMENT_MECHANISM)[number]) => edges.map((e) => assessAttachment(mechanism, e, thin).outcome);
    // twiners, leaf-stalk climbers and tendril climbers take the cable by themselves
    for (const mechanism of ['stem_twining', 'petiole_twining', 'tendril'] as const) expect(outcomes(mechanism), mechanism).toContain('self');
    // a clinger takes the timber by itself
    expect(outcomes('aerial_root')).toContain('self');
    // a scrambler holds nothing by itself, and can be tied in everywhere
    expect(new Set(outcomes('scramble_and_tie'))).toEqual(new Set(['needs_tie']));
  });

  it('takes the planting plan of a specimen: one plant, at the foot', () => {
    const plan = parsePlantingPlan(specimenPlan('wisteria-sinensis'));
    expect(plan.plants).toEqual([{ plantId: 'specimen', taxonId: 'wisteria-sinensis', stationId: SPECIMEN_STATION }]);
  });
});

describe('a specimen of wisteria', () => {
  const years = 5;
  const { sim } = growPlanting({ bower: frame.bower, plan: specimenPlan('wisteria-sinensis'), viewpoints: frame.viewpoints }, growable(), 'trained', years);
  const data = toRenderData(sim);
  const cal = new Calendar(data.start);
  const dates = portraitDates(data);
  const look = lookFor('wisteria-sinensis');

  it('grows on the frame to the last day of its last year', () => {
    expect(cal.dateOf(data.lastDay).iso).toBe(lastDateOf(years));
    expect(data.plants).toHaveLength(1);
    expect(data.stems.length).toBeGreaterThan(5);
    expect(data.leaves.length).toBeGreaterThan(50);
  });

  // the task: "ask the core's data for such a date; do not guess from the calendar"
  it('finds for each close view a date on which the core says the thing is on the plant', () => {
    const day = (iso: string | null) => cal.dayOf(iso!);
    expect(dates.leaf).not.toBeNull();
    const seasons = seasonsOf(data, cal.dateOf(day(dates.leaf)).year);
    expect(data.leaves.some((l) => leafState(l, seasons.get(l.plantId), day(dates.leaf)).expansion === 1)).toBe(true);
    if (data.flowers.length) expect(data.flowers.some((f) => flowerState(f, day(dates.flower)).phase === 'open')).toBe(true);
    else expect(dates.flower).toBeNull();
    if (data.fruits.length) expect(data.fruits.some((f) => fruitState(f, day(dates.fruit)).phase !== 'absent')).toBe(true);
    else expect(dates.fruit).toBeNull();
    expect(data.stems.some((s) => s.bornDay.some((_, i) => stemPointAlive(s, i, day(dates.stem))))).toBe(true);
    if (data.appendages.length) expect(data.appendages.some((a) => appendagePresent(a, day(dates.hold)))).toBe(true);
    for (const view of ['leaf', 'flower', 'fruit', 'stem', 'hold'] as const) expect(dates.notes[view], view).toBeTruthy();
  });

  it('takes its four seasons from the last year of the run, in order, winter being the one that began the December before', () => {
    const { winter, spring, summer, autumn } = dates.seasons;
    const last = lastDateOf(years).slice(0, 4);
    for (const d of [spring, summer, autumn]) expect(d.slice(0, 4)).toBe(last);
    expect(winter >= `${Number(last) - 1}-12-01` && winter <= `${last}-02-29`).toBe(true);
    expect(winter < spring && spring < summer && summer < autumn).toBe(true);
    // a deciduous plant is bare on its winter day and in leaf on its summer day
    const leavesOn = (iso: string) => data.leaves.filter((l) => leafState(l, seasonsOf(data, cal.dateOf(cal.dayOf(iso)).year).get(l.plantId), cal.dayOf(iso)).present).length;
    expect(leavesOn(winter)).toBe(0);
    expect(leavesOn(summer)).toBeGreaterThan(50);
  });

  it('picks for each view a real organ that is there on the day, and says what it is', () => {
    for (const view of SPECIMEN_VIEWS) {
      const iso = view === 'whole' ? dates.seasons.summer : dates[view];
      if (!iso) continue;
      const day = cal.dayOf(iso);
      const subject = findSubject(data, view, day);
      expect(subject.kind, view).not.toBe('none');
      expect(describeSubject(data, subject, day).length).toBeGreaterThan(5);
      if (subject.kind === 'leaf') expect(data.leaves).toContain(subject.leaf);
      if (subject.kind === 'flower') expect(flowerState(subject.flower, day).phase).toBe('open');
      if (subject.kind === 'fruit') expect(fruitState(subject.fruit, day).phase).not.toBe('absent');
      if (subject.kind === 'stem' || subject.kind === 'hold_stem') expect(stemPointAlive(subject.stem, subject.pointIndex, day)).toBe(true);
      if (subject.kind === 'hold') expect(appendagePresent(subject.appendage, day)).toBe(true);
    }
  });

  // CLAUDE.md: "A flowering month is an envelope, not a trigger. Never show flowers because the calendar says so."
  it('says so, with the days flowers are open, where a view is asked for on a day that has none', () => {
    const winter = cal.dayOf(dates.seasons.winter);
    const subject = findSubject(data, 'flower', winter);
    expect(subject.kind).toBe('none');
    if (subject.kind === 'none') expect(subject.why).toMatch(data.flowers.length ? /No flower is open on \d{4}-\d{2}-\d{2}/ : /no flowers/);
    expect(frameSubject(data, subject, winter, look, 40)).toBeNull();
  });

  it('stands the camera to the south of what it looks at, close for an organ and back for the whole plant', () => {
    const whole = frameWhole(data, 40, 1.6);
    // south is -y in the core's frame, +z in three.js
    expect(whole.position.z).toBeGreaterThan(whole.target.z + 2);
    const day = cal.dayOf(dates.leaf!);
    const close = frameSubject(data, findSubject(data, 'leaf', day), day, look, 40)!;
    expect(close.position.z).toBeGreaterThan(close.target.z);
    expect(close.position.distanceTo(close.target)).toBeLessThan(1.5);
    expect(close.position.distanceTo(close.target)).toBeLessThan(whole.position.distanceTo(whole.target) / 3);
  });
});
