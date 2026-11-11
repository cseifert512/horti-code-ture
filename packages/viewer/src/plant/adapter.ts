// The one place where time enters the plant renderer.
//
// The prototype drove everything from a clock in "growing seasons", with the
// dates of leaf flush, flowering and leaf fall written into its shaders. Here
// the dates are the engine's. The render-data contract
// (packages/core/src/render/contract.ts) gives every element the day it
// appeared and the day it went, and the core's presence module
// (packages/core/src/render/presence.ts) answers "what is on the plant on
// this day" for every consumer, so that a picture and a number computed from
// the same run agree. This module asks it, and turns the answers into what the
// shaders and instance pools consume:
//
//   stems    a few uniforms and lines of GLSL: is this point there yet, and
//            how thick is it (the contract's interpolation rule)
//   organs   explicit states between 0 and 1 (how far a leaf has unfolded,
//            how far a raceme has opened, how ripe a fruit is), computed here
//            on the CPU
//   ages     how old a point of a stem or a tendril is, in days, for the looks
//            that change with age (a shoot turning woody, a tendril browning)
//
// Nothing else in the viewer knows what a day is. If the contract changes,
// this is the file that changes with it. It adds no dates of its own.
import {
  Calendar,
  type RenderAppendage,
  type RenderData,
  type RenderFlower,
  type RenderFruit,
  type RenderLeaf,
  type RenderSeason,
  type RenderStem,
  appendagePresent,
  flowerState,
  fruitState,
  leafState,
  seasonsOf,
  stemPointAlive,
  stemRadiusM,
} from '@horti/core';

/** Stands in for "never removed" in vertex attributes, where the contract uses -1. */
export const NEVER = 1e9;
export const removalDay = (removedDay: number): number => (removedDay < 0 ? NEVER : removedDay);

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smooth = (x: number): number => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------------
// Stems: evaluated on the GPU so the day can be scrubbed without rebuilding.
// ---------------------------------------------------------------------------

/** Uniforms every clock-driven shader shares. */
export const clock = {
  /** The day being shown; may be fractional while a time-lapse plays. */
  uDay: { value: 0 },
  /** The last simulated day: stems reach their recorded radius then. */
  uLastDay: { value: 1 },
  /** Radius of a stem point on the day it is laid down, in metres. */
  uTipRadius: { value: 0.002 },
  uThickenExponent: { value: 1 },
};

/**
 * Per stem point the shader has: the day it was born, the day it was removed
 * (NEVER if still there), and its radius at the end of the run in metres.
 *
 * stemPresent and stemRadius are the GPU twins of stemPointAlive and
 * stemRadiusM in the core's presence module, which follow the contract:
 *   radius(t) = tip + (final - tip) * ((t - born) / (lastDay - born)) ^ exponent
 * One thing is added for the picture: the first day of a point's life is
 * eased in, so that a stem lengthens smoothly between whole days instead of
 * jumping a ring at a time.
 */
export const CLOCK_GLSL = /* glsl */ `
uniform float uDay;
uniform float uLastDay;
uniform float uTipRadius;
uniform float uThickenExponent;

float stemPresent( float born, float removed ) {
  return step( born, uDay ) * step( uDay, removed - 0.001 );
}

float stemRadius( float born, float finalRadius ) {
  float age = clamp( ( uDay - born ) / max( uLastDay - born, 1.0 ), 0.0, 1.0 );
  float r = uTipRadius + max( finalRadius - uTipRadius, 0.0 ) * pow( age, uThickenExponent );
  return r * clamp( uDay - born, 0.0, 1.0 );
}
`;

// ---------------------------------------------------------------------------
// Organs: explicit states for the shaders.
// ---------------------------------------------------------------------------

export interface LeafDraw {
  visible: boolean;
  /** 0 folded in the bud, 1 fully expanded. */
  expansion: number;
  /** 0 summer green, 1 full autumn colour. */
  colour: number;
}

export interface FlowerDraw {
  visible: boolean;
  /** True once the core says it is open; false while it is a bud still lengthening. */
  open: boolean;
  /** 0 a bud that has just begun to lengthen, 1 full length. */
  elongation: number;
  /** Share of the flowers that have opened, counted from the base. */
  bloom: number;
  /** Share of the flowers whose petals have dropped, counted from the base. */
  shed: number;
}

export interface FruitDraw {
  visible: boolean;
  /** 0 just set, 1 full size. */
  size: number;
  /** 0 green, 1 ripe. */
  ripeness: number;
}

export interface AppendageDraw {
  visible: boolean;
  /** Days since it formed. */
  ageDays: number;
}

const HIDDEN_LEAF: LeafDraw = { visible: false, expansion: 0, colour: 0 };
const HIDDEN_FLOWER: FlowerDraw = { visible: false, open: false, elongation: 0, bloom: 0, shed: 0 };
const HIDDEN_FRUIT: FruitDraw = { visible: false, size: 0, ripeness: 0 };
const HIDDEN_APPENDAGE: AppendageDraw = { visible: false, ageDays: 0 };

/**
 * How far through a range of ages something is, 0 before it and 1 after,
 * eased at both ends. A look states such ranges (a shoot turns woody between
 * 110 and 440 days old); the age it is applied to comes from the data's days,
 * through this module.
 */
export function agedShare(ageDays: number, over: readonly [number, number]): number {
  const t = clamp01((ageDays - over[0]) / (over[1] - over[0]));
  return t * t * (3 - 2 * t);
}

/**
 * The core says an inflorescence is open and how far through its time in
 * flower it is. Drawing one needs a little more: which of its sixty flowers
 * are open. That is filled in here, as a picture of the core's progress
 * figure and nothing more: opening runs up the raceme during the first share
 * of its time in flower, and petal fall runs up it from the second share on,
 * ending on the day the core calls it spent.
 */
const WITHIN_FLOWERING = { bloomBy: 0.35, shedFrom: 0.55 } as const;

/** Reads a RenderData through time. */
export class RenderTimeline {
  readonly data: RenderData;
  readonly calendar: Calendar;
  /** The first day on which there is anything to see. */
  readonly firstDay: number;
  readonly lastDay: number;
  private readonly seasonsByYear = new Map<number, Map<string, RenderSeason>>();
  private yearCache: { day: number; year: number } | null = null;

  constructor(data: RenderData) {
    this.data = data;
    this.calendar = new Calendar(data.start);
    this.lastDay = data.lastDay;
    this.firstDay = data.plants.reduce((d, p) => Math.min(d, p.plantedDay), data.lastDay);
  }

  /** Point the shared clock at a day of this run. */
  apply(day: number): void {
    clock.uDay.value = day;
    clock.uLastDay.value = Math.max(1, this.lastDay);
    clock.uTipRadius.value = this.data.thickening.tipRadiusMm / 1000;
    clock.uThickenExponent.value = this.data.thickening.exponent;
  }

  yearOf(day: number): number {
    const whole = Math.floor(day);
    if (this.yearCache?.day !== whole) this.yearCache = { day: whole, year: this.calendar.dateOf(whole).year };
    return this.yearCache.year;
  }

  /** "12 May 2031" */
  dateLabel(day: number): string {
    const d = this.calendar.dateOf(Math.floor(day));
    const month = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.month - 1]!;
    return `${d.dayOfMonth} ${month} ${d.year}`;
  }

  /** The dates a plant keeps in the calendar year `day` falls in. */
  season(plantId: string, day: number): RenderSeason | undefined {
    const year = this.yearOf(day);
    let seasons = this.seasonsByYear.get(year);
    if (!seasons) this.seasonsByYear.set(year, (seasons = seasonsOf(this.data, year)));
    return seasons.get(plantId);
  }

  /** Radius of point `i` of a stem on `day`, in metres; nothing before the point exists. */
  stemRadiusM(stem: RenderStem, i: number, day: number): number {
    return stemPointAlive(stem, i, day) ? stemRadiusM(this.data, stem, i, day) : 0;
  }

  leafDraw(leaf: RenderLeaf, day: number): LeafDraw {
    const s = leafState(leaf, this.season(leaf.plantId, day), day);
    return s.present ? { visible: true, expansion: s.expansion, colour: s.autumn } : HIDDEN_LEAF;
  }

  flowerDraw(flower: RenderFlower, day: number): FlowerDraw {
    const s = flowerState(flower, day);
    if (s.phase === 'absent') return HIDDEN_FLOWER;
    if (s.phase === 'in_bud') return { visible: true, open: false, elongation: smooth(s.progress), bloom: 0, shed: 0 };
    // open. A flower the run ended on has no spent day, so the core gives no progress:
    // pace its opening by the time it took to develop instead, and shed nothing.
    const progress = flower.spentDay >= 0 ? s.progress : (day - flower.openDay) / Math.max(1, flower.openDay - flower.developDay);
    const bloom = clamp01(progress / WITHIN_FLOWERING.bloomBy);
    const shed = flower.spentDay >= 0 ? clamp01((progress - WITHIN_FLOWERING.shedFrom) / (1 - WITHIN_FLOWERING.shedFrom)) : 0;
    return { visible: true, open: true, elongation: 1, bloom, shed };
  }

  /** A fruit as the core says it is on `day`: its size as a share of full grown, and how ripe. */
  fruitDraw(fruit: RenderFruit, day: number): FruitDraw {
    const s = fruitState(fruit, day);
    return s.phase === 'absent' ? HIDDEN_FRUIT : { visible: true, size: s.size, ripeness: s.ripeness };
  }

  /** A tendril, coiled stalk, patch of rootlets or prickle: there or not, and how old. */
  appendageDraw(appendage: RenderAppendage, day: number): AppendageDraw {
    return appendagePresent(appendage, day) ? { visible: true, ageDays: day - appendage.bornDay } : HIDDEN_APPENDAGE;
  }

  /** How long ago point `i` of a stem was laid down, in days. */
  stemAgeDays(stem: RenderStem, i: number, day: number): number {
    return day - stem.bornDay[i]!;
  }

  /** The gardener's log in the order it happened. */
  get events(): readonly RenderData['events'][number][] {
    this.sortedEvents ??= [...this.data.events].sort((a, b) => a.day - b.day);
    return this.sortedEvents;
  }
  private sortedEvents: RenderData['events'][number][] | null = null;

  /** How many entries of the log had been made by the end of `day`. */
  eventsBy(day: number): number {
    const events = this.events;
    let n = 0;
    while (n < events.length && events[n]!.day <= day) n++;
    return n;
  }
}
