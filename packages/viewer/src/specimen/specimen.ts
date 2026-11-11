// A specimen: one plant of one taxon grown on the small standard frame
// (examples/specimen-frame.bower.json), to be looked at closely.
//
// This module is the part of it that is only data: the planting plan, which
// real organ of a run to look at for a view on a day, and the dates on which a
// run has each thing worth a portrait. It asks the core's presence module what
// is on the plant and decides nothing about seasons itself. It imports no
// renderer, so the viewer (in the browser) and the portrait script (in Node)
// use the same code and so pick the same organ and the same dates.
import {
  Calendar,
  type PlantingPlan,
  type RenderAppendage,
  type RenderData,
  type RenderFlower,
  type RenderFruit,
  type RenderLeaf,
  type RenderStem,
  appendagePresent,
  flowerState,
  fruitState,
  leafState,
  seasonsOf,
  stemPointAlive,
} from '@horti/core';

export const SPECIMEN_VIEWS = ['whole', 'leaf', 'flower', 'fruit', 'stem', 'hold'] as const;
export type SpecimenView = (typeof SPECIMEN_VIEWS)[number];

/** How long a specimen is grown for unless a number of years is asked for. */
export const SPECIMEN_YEARS = 6;
/** The root station of the specimen frame, and the name the one plant goes by. */
export const SPECIMEN_STATION = 'foot';
export const SPECIMEN_PLANT = 'specimen';

/** The planting plan of a specimen: one plant of the taxon, at the foot of the frame. */
export function specimenPlan(taxonId: string): PlantingPlan {
  return { schemaVersion: 1, name: `A specimen of ${taxonId}`, plants: [{ plantId: SPECIMEN_PLANT, taxonId, stationId: SPECIMEN_STATION }] };
}

type Triple = readonly [number, number, number];

/** What a view of a specimen is trained on: a real organ of the run, or the reason there is none. */
export type Subject =
  | { kind: 'whole' }
  | { kind: 'leaf'; leaf: RenderLeaf }
  | { kind: 'flower'; flower: RenderFlower }
  | { kind: 'fruit'; fruit: RenderFruit }
  | { kind: 'stem'; stem: RenderStem; pointIndex: number }
  | { kind: 'hold'; appendage: RenderAppendage }
  /** A plant that holds on with its stems, or is tied in: a stem where it lies on its support. */
  | { kind: 'hold_stem'; stem: RenderStem; pointIndex: number }
  | { kind: 'none'; wanted: SpecimenView; why: string };

/**
 * How well placed something is to be looked at from the south side of the
 * frame, which is where the camera stands: lower is better. About eye height,
 * on the near side of the timber, not far out to one end.
 */
function placed(p: Triple, height: number): number {
  // the rails are fixed 40 mm south of the plane of the frame: what stands farther south than that has nothing in front of it
  const behind = Math.min(1.2, Math.max(0, (p[1] + 0.08) * 6));
  return Math.abs(p[2] - height) + behind + 0.1 * Math.abs(p[0] - 0.3);
}

function least<T>(items: readonly T[], score: (item: T) => number): T | undefined {
  let best: T | undefined;
  let bestScore = Infinity;
  for (const item of items) {
    const s = score(item);
    if (s < bestScore) {
      bestScore = s;
      best = item;
    }
  }
  return best;
}

const median = (xs: number[]): number => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;

/** "between 3 May and 21 June 2032", from day numbers. */
function span(cal: Calendar, first: number, last: number): string {
  const a = cal.dateOf(first).iso;
  const b = cal.dateOf(last).iso;
  return a === b ? `on ${a}` : `between ${a} and ${b}`;
}

/** The organ of the run to look at for `view` on `day`: one that is really there, and typical of what is there. */
export function findSubject(data: RenderData, view: SpecimenView, day: number): Subject {
  const cal = new Calendar(data.start);
  const date = cal.dateOf(Math.floor(day)).iso;
  const none = (why: string): Subject => ({ kind: 'none', wanted: view, why });
  if (view === 'whole') return { kind: 'whole' };

  if (view === 'leaf') {
    const seasons = seasonsOf(data, cal.dateOf(Math.floor(day)).year);
    const out = data.leaves.map((leaf) => ({ leaf, state: leafState(leaf, seasons.get(leaf.plantId), day) })).filter((l) => l.state.present);
    if (!out.length) return none(data.leaves.length ? `No leaf is on the plant on ${date}.` : 'This run has no leaves.');
    const typical = median(out.map((l) => l.leaf.lengthM));
    // an open leaf of ordinary size, pointing towards the camera rather than away from it
    const pick = least(out, (l) => placed(l.leaf.position, 1.4) + (1 - l.state.expansion) * 2 + Math.abs(l.leaf.lengthM - typical) / Math.max(typical, 1e-6) + (l.leaf.direction[1] > 0.3 ? 0.5 : 0))!;
    return { kind: 'leaf', leaf: pick.leaf };
  }

  if (view === 'flower') {
    const states = data.flowers.map((flower) => ({ flower, state: flowerState(flower, day) }));
    const open = states.filter((f) => f.state.phase === 'open');
    if (!open.length) {
      if (!data.flowers.length) return none('This run has no flowers.');
      const buds = states.filter((f) => f.state.phase === 'in_bud').length;
      const first = Math.min(...data.flowers.map((f) => f.openDay));
      const last = Math.max(...data.flowers.map((f) => (f.spentDay >= 0 ? f.spentDay - 1 : data.lastDay)));
      return none(`No flower is open on ${date}${buds ? ` (${buds} in bud)` : ''}. In this run flowers are open ${span(cal, first, last)}.`);
    }
    // well open, before its petals begin to fall
    const pick = least(open, (f) => placed(f.flower.position, 1.5) + Math.abs(f.state.progress - 0.3))!;
    return { kind: 'flower', flower: pick.flower };
  }

  if (view === 'fruit') {
    const on = data.fruits.map((fruit) => ({ fruit, state: fruitState(fruit, day) })).filter((f) => f.state.phase !== 'absent');
    if (!on.length) {
      if (!data.fruits.length) return none('This run has no fruit.');
      const first = Math.min(...data.fruits.map((f) => f.swell[0]));
      const last = Math.max(...data.fruits.map((f) => (f.removedDay >= 0 ? f.removedDay - 1 : data.lastDay)));
      return none(`No fruit is on the plant on ${date}. In this run fruit is on the plant ${span(cal, first, last)}.`);
    }
    const pick = least(on, (f) => placed(f.fruit.position, 1.5) + (1 - f.state.size) * 2)!;
    return { kind: 'fruit', fruit: pick.fruit };
  }

  // a point of a stem that is on the plant today, scored by `score`
  const stemPoint = (score: (stem: RenderStem, i: number, p: Triple) => number): { stem: RenderStem; pointIndex: number } | undefined => {
    let best: { stem: RenderStem; pointIndex: number } | undefined;
    let bestScore = Infinity;
    for (const stem of data.stems) {
      for (let i = 0; i < stem.bornDay.length; i++) {
        if (!stemPointAlive(stem, i, day)) continue;
        const p: Triple = [stem.contact[3 * i]!, stem.contact[3 * i + 1]!, stem.contact[3 * i + 2]!];
        const s = score(stem, i, p);
        if (s < bestScore) {
          bestScore = s;
          best = { stem, pointIndex: i };
        }
      }
    }
    return best;
  };

  if (view === 'stem') {
    // the oldest wood at about waist height: where the bark shows
    const pick = stemPoint((stem, i, p) => placed(p, 1.0) + 0.4 * stem.order - Math.min(1, (day - stem.bornDay[i]!) / 1500));
    return pick ? { kind: 'stem', ...pick } : none(`No stem is on the plant on ${date}.`);
  }

  // hold
  const on = data.appendages.filter((a) => appendagePresent(a, day));
  if (on.length) {
    const pick = least(on, (a) => placed(a.position, 1.3) + (a.holding ? 0 : 1))!;
    return { kind: 'hold', appendage: pick };
  }
  if (data.appendages.length) {
    const first = Math.min(...data.appendages.map((a) => a.bornDay));
    const last = Math.max(...data.appendages.map((a) => (a.removedDay >= 0 ? a.removedDay - 1 : data.lastDay)));
    return none(`Nothing the plant holds on with is there on ${date}. In this run there are such parts ${span(cal, first, last)}.`);
  }
  // no tendrils, coiled stalks, rootlets or prickles in the run at all: it holds on with its stems, or is tied in
  const supported = (stem: RenderStem, i: number) => stem.away[3 * i]! !== 0 || stem.away[3 * i + 1]! !== 0 || stem.away[3 * i + 2]! !== 0;
  const pick = stemPoint((stem, i, p) => (supported(stem, i) ? 0 : 5) + placed(p, 1.5) + 0.02 * stem.radiusMm[i]!);
  return pick ? { kind: 'hold_stem', ...pick } : none(`No stem is on the plant on ${date}.`);
}

/** In words, what a subject is: for the caption under a portrait. */
export function describeSubject(data: RenderData, subject: Subject, day: number): string {
  const mm = (m: number) => (m < 0.1 ? `${(m * 1000).toFixed(0)} mm` : `${m.toFixed(2)} m`);
  switch (subject.kind) {
    case 'whole':
      return 'the whole plant';
    case 'leaf':
      return `a leaf ${mm(subject.leaf.lengthM)} long${subject.leaf.form ? `, form "${subject.leaf.form}"` : ''}`;
    case 'flower': {
      const s = flowerState(subject.flower, day);
      return `a flower or flowerhead ${mm(subject.flower.lengthM)} in size, open${subject.flower.spentDay >= 0 ? `, ${(s.progress * 100).toFixed(0)}% through its time in flower` : ''}${subject.flower.form ? `, form "${subject.flower.form}"` : ''}`;
    }
    case 'fruit': {
      const s = fruitState(subject.fruit, day);
      return `a fruit ${mm(subject.fruit.lengthM)} long when full grown, ${s.phase === 'swelling' ? `${(s.size * 100).toFixed(0)}% grown` : s.phase}${subject.fruit.form ? `, form "${subject.fruit.form}"` : ''}`;
    }
    case 'stem': {
      const age = day - subject.stem.bornDay[subject.pointIndex]!;
      return `a stem (${subject.stem.role}), ${(age / 365).toFixed(1)} years old at this point`;
    }
    case 'hold':
      return `${subject.appendage.kind.replaceAll('_', ' ')} ${mm(subject.appendage.lengthM)} long, ${subject.appendage.holding ? 'holding' : 'not holding'}`;
    case 'hold_stem':
      return 'a stem where it lies on its support: this run has no tendrils, coiled stalks, rootlets or prickles';
    case 'none':
      return subject.why;
  }
}

// ---------------------------------------------------------------------------
// Dates worth a portrait
// ---------------------------------------------------------------------------

export interface PortraitDates {
  /** The whole plant in each of four seasons of the last year of the run; winter is the one that began the December before. */
  seasons: { winter: string; spring: string; summer: string; autumn: string };
  /** A date on which each thing is on the plant, or null with the reason in `notes`. */
  leaf: string | null;
  flower: string | null;
  fruit: string | null;
  stem: string | null;
  hold: string | null;
  /** Why a date was chosen, or why there is none. */
  notes: Record<string, string>;
}

/**
 * The middle of the stretch of days round the best day on which the count stays within 2% of its best; null if it is
 * nothing everywhere. `from` and `to` are the ends of that stretch.
 */
function fullest(first: number, last: number, count: (day: number) => number): { day: number; most: number; from: number; to: number } | null {
  let most = 0;
  let at = -1;
  const counts: number[] = [];
  for (let day = first; day <= last; day++) {
    const n = count(day);
    counts.push(n);
    if (n > most) {
      most = n;
      at = day;
    }
  }
  if (most <= 0) return null;
  let a = at;
  let b = at;
  while (a - 1 >= first && counts[a - 1 - first]! >= most * 0.98) a--;
  while (b + 1 <= last && counts[b + 1 - first]! >= most * 0.98) b++;
  return { day: Math.round((a + b) / 2), most, from: a, to: b };
}

/**
 * The dates of a run on which there is something to take a portrait of. Every
 * one is found by asking what is on the plant day by day; none is taken from
 * what month a plant is supposed to do something in.
 */
export function portraitDates(data: RenderData): PortraitDates {
  const cal = new Calendar(data.start);
  const planted = Math.min(...data.plants.map((p) => p.plantedDay), data.lastDay);
  const year = cal.dateOf(data.lastDay).year;
  const firstYear = cal.dateOf(planted).year;
  const clampDay = (day: number) => Math.min(data.lastDay, Math.max(planted, day));
  const window = (y: number, from: string, to: string): [number, number] => [clampDay(cal.dayOf(`${y}-${from}`)), clampDay(cal.dayOf(`${y}-${to}`))];
  const iso = (day: number) => cal.dateOf(day).iso;
  const notes: Record<string, string> = {};

  const openFlowers = (day: number) => data.flowers.reduce((n, f) => n + (flowerState(f, day).phase === 'open' ? 1 : 0), 0);
  const leaves = (test: (expansion: number, autumn: number) => boolean) => (day: number) => {
    const seasons = seasonsOf(data, cal.dateOf(day).year);
    let n = 0;
    for (const leaf of data.leaves) {
      const s = leafState(leaf, seasons.get(leaf.plantId), day);
      if (s.present && test(s.expansion, s.autumn)) n++;
    }
    return n;
  };

  // ---- four seasons of the last year: each on the day that shows most of what that season has ----
  const season = (name: string, [a, b]: [number, number], fallback: string, also?: () => { day: number; what: string } | null): string => {
    let flowering = fullest(a, b, openFlowers);
    if (flowering) {
      // A flowering at its fullest on the first or last day of a season runs on into the next one. It belongs to
      // the season the middle of it falls in: follow it over the edge to find that middle.
      let { from, to } = flowering;
      if (from === a) while (from - 1 >= planted && openFlowers(from - 1) >= flowering.most * 0.98) from--;
      if (to === b) while (to + 1 <= data.lastDay && openFlowers(to + 1) >= flowering.most * 0.98) to++;
      const middle = Math.round((from + to) / 2);
      flowering = middle >= a && middle <= b ? { ...flowering, day: middle } : null;
    }
    if (flowering) {
      notes[name] = `${flowering.most} flowers or flowerheads open, the most in that season`;
      return iso(flowering.day);
    }
    const other = also?.();
    if (other) {
      notes[name] = other.what;
      return iso(other.day);
    }
    notes[name] = 'no flowering of its own in that season: a day in the middle of it';
    return iso(clampDay(cal.dayOf(`${year}-${fallback}`)));
  };
  // winter runs over the turn of the year: from the December before, where the plant was in the ground by then
  const december = cal.dayOf(`${year - 1}-12-01`);
  const winter = season('winter', [december >= planted ? december : clampDay(cal.dayOf(`${year}-01-01`)), clampDay(cal.dayOf(`${year}-02-28`))], cal.dayOf(`${year}-01-15`) >= planted ? '01-15' : '12-15');
  const spring = season('spring', window(year, '03-01', '05-31'), '04-30', () => {
    // no flowers: the day the leaves have just finished opening
    const [a, b] = window(year, '03-01', '05-31');
    const flush = data.seasons.find((s) => s.year === year)?.leafFlush[1];
    return flush !== undefined && flush >= a && flush <= b && leaves((e) => e >= 1)(flush) > 0 ? { day: flush, what: 'no flowers in that season: the day the leaves finish opening' } : null;
  });
  const summer = season('summer', window(year, '06-01', '08-31'), '07-15');
  // autumn: colour comes before flowers, where the plant colours
  const [a0, a1] = window(year, '09-01', '11-30');
  const colour = fullest(a0, a1, leaves((_e, autumn) => autumn >= 0.99));
  let autumn: string;
  if (colour) {
    notes['autumn'] = `${colour.most} leaves in full autumn colour and still on the plant, the most in that season`;
    autumn = iso(colour.day);
  } else {
    autumn = season('autumn', [a0, a1], '10-31');
  }

  // ---- a day for each close view ---------------------------------------------------
  const inYear = (y: number): [number, number] => window(y, '01-01', '12-31');
  /** The latest year in which `count` is ever more than nothing, and its fullest day. */
  const latest = (count: (day: number) => number): { day: number; most: number } | null => {
    for (let y = year; y >= firstYear; y--) {
      const [a, b] = inYear(y);
      const best = fullest(a, b, count);
      if (best) return best;
    }
    return null;
  };

  const leafDay = latest(leaves((e, autumn) => e >= 1 && autumn === 0));
  notes['leaf'] = leafDay ? `${leafDay.most} leaves fully open and green` : 'this run has no fully open leaf';

  const flowerDay = latest(openFlowers);
  notes['flower'] = flowerDay ? `${flowerDay.most} flowers or flowerheads open, the most on any day of that year` : data.flowers.length ? 'no flower of this run is ever open' : 'this run has no flowers';

  const fruitDay = latest((day) => data.fruits.reduce((n, f) => n + (fruitState(f, day).size >= 1 ? 1 : 0), 0)) ?? latest((day) => data.fruits.reduce((n, f) => n + (fruitState(f, day).phase !== 'absent' ? 1 : 0), 0));
  notes['fruit'] = fruitDay ? `${fruitDay.most} fruit on the plant` : 'this run has no fruit';

  const stemsOn = (day: number) => data.stems.some((s) => s.bornDay.some((_, i) => stemPointAlive(s, i, day)));
  const winterDay = cal.dayOf(winter);
  const summerDay = cal.dayOf(summer);
  const stemDay = stemsOn(winterDay) ? winterDay : stemsOn(summerDay) ? summerDay : null;
  notes['stem'] = stemDay === null ? 'no stem is on the plant in the last year' : stemDay === winterDay ? 'the winter day, when the wood shows best' : 'the summer day: no stem is on the plant in winter';

  const holdDay = latest((day) => data.appendages.reduce((n, a) => n + (appendagePresent(a, day) ? (a.holding ? 2 : 1) : 0), 0));
  let hold: string | null;
  if (holdDay) {
    notes['hold'] = 'the day with the most tendrils, coiled stalks, rootlets or prickles on the plant';
    hold = iso(holdDay.day);
  } else if (stemsOn(summerDay)) {
    notes['hold'] = 'this run has no tendrils, coiled stalks, rootlets or prickles: a stem where it lies on its support, on the summer day';
    hold = summer;
  } else {
    notes['hold'] = 'nothing to hold on with, and no stem on the summer day';
    hold = null;
  }

  return {
    seasons: { winter, spring, summer, autumn },
    leaf: leafDay ? iso(leafDay.day) : null,
    flower: flowerDay ? iso(flowerDay.day) : null,
    fruit: fruitDay ? iso(fruitDay.day) : null,
    stem: stemDay === null ? null : iso(stemDay),
    hold,
    notes,
  };
}
