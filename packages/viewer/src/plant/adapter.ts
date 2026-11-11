// The one place where time enters the plant renderer.
//
// The prototype drove everything from a clock in "growing seasons", with the
// dates of leaf flush, flowering and leaf fall written into its shaders. Here
// the dates are the engine's: the render-data contract
// (packages/core/src/render/contract.ts) gives every element the day it
// appeared and the day it went, each plant's seasonal dates year by year, and
// each inflorescence its own days. This module turns "the day being shown"
// into what the shaders and instance pools consume:
//
//   stems    two uniforms and a few lines of GLSL: is this point there yet,
//            and how thick is it (the contract's interpolation rule)
//   organs   explicit states between 0 and 1 (how far a leaf has unfolded,
//            how far a raceme has opened), computed here on the CPU
//
// Nothing else in the viewer knows what a day is. If the contract changes,
// this is the file that changes with it. It adds no dates of its own; where
// the contract gives two dates and the picture needs something in between,
// the in-between is interpolated and the rule is written beside it.
import { Calendar, type RenderData, type RenderFlower, type RenderLeaf, type RenderSeason } from '@horti/core';

/** Stands in for "never removed" in vertex attributes, where the contract uses -1. */
export const NEVER = 1e9;
export const removalDay = (removedDay: number): number => (removedDay < 0 ? NEVER : removedDay);

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smooth = (x: number): number => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
/** Progress of `day` through the window [a, b], smoothed. */
const through = (day: number, a: number, b: number): number => smooth((day - a) / Math.max(1e-6, b - a));

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
 * Thickness between birth and the end of the run follows the contract:
 *   radius(t) = tip + (final - tip) * ((t - born) / (lastDay - born)) ^ exponent
 * The first day of a point's life is eased in, so that a stem lengthens
 * smoothly between whole days instead of jumping a ring at a time.
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
  float age = uDay - born;
  float span = max( uLastDay - born, 1.0 );
  float r = uTipRadius + ( finalRadius - uTipRadius ) * pow( clamp( age / span, 0.0, 1.0 ), uThickenExponent );
  return r * clamp( age, 0.0, 1.0 );
}
`;

// ---------------------------------------------------------------------------
// Organs: explicit states.
// ---------------------------------------------------------------------------

export interface LeafState {
  visible: boolean;
  /** 0 folded in the bud, 1 fully expanded. */
  expansion: number;
  /** 0 summer green, 1 full autumn colour. */
  colour: number;
  /** 0 on the plant, 1 fallen. */
  fall: number;
}

export interface FlowerState {
  visible: boolean;
  /** 0 a bud that has just begun to lengthen, 1 full length. */
  elongation: number;
  /** Share of the flowers that have opened, counted from the base. */
  bloom: number;
  /** Share of the flowers whose petals have dropped, counted from the base. */
  shed: number;
  /** 1 while the bare stalk still hangs, falling to 0 as it is shed. */
  stalk: number;
}

/**
 * A fruit. The render contract does not carry fruit yet, so this is the
 * viewer's own stand-in, used only by the hand-made test plant; when the
 * contract gains fruit, map it on to this here.
 */
export interface FruitSite {
  plantId: string;
  /** Where it hangs from, core frame. */
  position: [number, number, number];
  lengthM: number;
  /** It swells from the first day to the second, and ripens (dries, browns) from the third to the fourth. */
  swell: [number, number];
  ripen: [number, number];
  /** -1 if never removed. */
  removedDay: number;
}

export interface FruitState {
  visible: boolean;
  /** 0 just set, 1 full size. */
  size: number;
  /** 0 green, 1 ripe. */
  ripeness: number;
}

const HIDDEN_LEAF: LeafState = { visible: false, expansion: 0, colour: 0, fall: 1 };
const HIDDEN_FLOWER: FlowerState = { visible: false, elongation: 0, bloom: 0, shed: 0, stalk: 0 };

/**
 * How the viewer fills the gaps between the dates it is given. These are
 * rules of interpolation, chosen for a smooth picture; they are not claims
 * about plants and change no date the engine supplied.
 */
const INTERPOLATION = {
  /** Leaves of one plant do not all move on the same day: each is offset by up to this share of a window. */
  leafStagger: 0.3,
  /** A single leaf takes this share of the leaf-fall window to drop. */
  leafDrop: 0.2,
  /** Opening runs up an inflorescence during this first share of its time in flower... */
  bloomWave: 0.35,
  /** ...and petal fall runs up it from this share on, ending on the day it is spent. */
  shedFrom: 0.55,
  /** The bare stalk goes within this share of the flowering time after the petals. */
  stalkLinger: 0.4,
} as const;

/** Reads a RenderData through time. */
export class RenderTimeline {
  readonly data: RenderData;
  readonly calendar: Calendar;
  /** The first day on which there is anything to see. */
  readonly firstDay: number;
  readonly lastDay: number;
  private readonly seasons = new Map<string, RenderSeason>();
  private readonly deciduous = new Map<string, boolean>();
  private yearCache: { day: number; year: number } | null = null;

  constructor(data: RenderData) {
    this.data = data;
    this.calendar = new Calendar(data.start);
    this.lastDay = data.lastDay;
    this.firstDay = data.plants.reduce((d, p) => Math.min(d, p.plantedDay), data.lastDay);
    for (const s of data.seasons) this.seasons.set(`${s.plantId}|${s.year}`, s);
    // only a deciduous plant is known to shed all its leaves each year
    for (const p of data.plants) this.deciduous.set(p.id, p.leafHabit === 'deciduous');
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

  season(plantId: string, year: number): RenderSeason | undefined {
    return this.seasons.get(`${plantId}|${year}`);
  }

  /** The stem radius rule of the contract, in metres: the CPU twin of stemRadius() in CLOCK_GLSL. */
  stemRadiusM(day: number, bornDay: number, finalRadiusMm: number): number {
    const age = day - bornDay;
    if (age <= 0) return 0;
    const { tipRadiusMm, exponent } = this.data.thickening;
    const span = Math.max(this.lastDay - bornDay, 1);
    return ((tipRadiusMm + (finalRadiusMm - tipRadiusMm) * Math.pow(clamp01(age / span), exponent)) * clamp01(age)) / 1000;
  }

  /**
   * `jitter` is a fixed number in [0, 1) for this leaf, so that the leaves of
   * a plant flush, colour and drop over each window rather than all at once.
   */
  leafState(leaf: RenderLeaf, day: number, jitter: number): LeafState {
    if (day < leaf.bornDay || (leaf.removedDay >= 0 && day >= leaf.removedDay)) return HIDDEN_LEAF;
    const year = this.yearOf(day);
    if (year < leaf.firstYear || (leaf.lastYear !== null && year > leaf.lastYear)) return HIDDEN_LEAF;
    const season = this.season(leaf.plantId, year);
    if (!season) return HIDDEN_LEAF;
    const stagger = INTERPOLATION.leafStagger;

    // unfolding: with the plant's flush, and never faster than the leaf's own age allows
    const [f0, f1] = season.leafFlush;
    const flush = Math.max(1, f1 - f0);
    const seasonal = through(day, f0 + jitter * stagger * flush, f0 + (jitter * stagger + 1 - stagger) * flush);
    const own = year === leaf.firstYear ? smooth((day - leaf.bornDay) / flush) : 1;
    const expansion = Math.min(seasonal, own);
    if (expansion <= 0) return HIDDEN_LEAF;
    if (!this.deciduous.get(leaf.plantId)) return { visible: true, expansion, colour: 0, fall: 0 };

    const [c0, c1] = season.autumnColour;
    const turn = Math.max(1, c1 - c0);
    const colour = through(day, c0 + jitter * stagger * turn, c0 + (jitter * stagger + 1 - stagger) * turn);
    // each leaf drops at its own moment within the window; none remains after it
    const [l0, l1] = season.leafFall;
    const window = Math.max(1, l1 - l0);
    const drop = INTERPOLATION.leafDrop;
    const start = l0 + jitter * (1 - drop) * window;
    const fall = clamp01((day - start) / (drop * window));
    if (fall >= 1) return HIDDEN_LEAF;
    return { visible: true, expansion, colour, fall };
  }

  flowerState(flower: RenderFlower, day: number): FlowerState {
    if (day < flower.developDay) return HIDDEN_FLOWER;
    const elongation = through(day, flower.developDay, flower.openDay);
    if (day < flower.openDay) return { visible: true, elongation, bloom: 0, shed: 0, stalk: 1 };
    // still in flower at the end of the run: judge its pace by the time it took to develop
    const inFlower = flower.spentDay >= 0 ? Math.max(1, flower.spentDay - flower.openDay) : Math.max(1, flower.openDay - flower.developDay);
    const t = (day - flower.openDay) / inFlower;
    const bloom = clamp01(t / INTERPOLATION.bloomWave);
    if (flower.spentDay < 0) return { visible: true, elongation: 1, bloom, shed: 0, stalk: 1 };
    const shed = clamp01((t - INTERPOLATION.shedFrom) / (1 - INTERPOLATION.shedFrom));
    const stalk = 1 - smooth((t - 1) / INTERPOLATION.stalkLinger);
    if (stalk <= 0) return HIDDEN_FLOWER;
    return { visible: true, elongation: 1, bloom, shed, stalk };
  }

  fruitState(fruit: FruitSite, day: number): FruitState {
    if (day < fruit.swell[0] || (fruit.removedDay >= 0 && day >= fruit.removedDay)) return { visible: false, size: 0, ripeness: 0 };
    return { visible: true, size: through(day, fruit.swell[0], fruit.swell[1]), ripeness: through(day, fruit.ripen[0], fruit.ripen[1]) };
  }

  /** The gardener's most recent entry on or before `day`, if it is no older than `withinDays`. */
  latestEvent(day: number, withinDays: number): RenderData['events'][number] | null {
    let best: RenderData['events'][number] | null = null;
    for (const e of this.data.events) {
      if (e.day > day || e.day < day - withinDays || e.type === 'monitor') continue;
      if (!best || e.day >= best.day) best = e;
    }
    return best;
  }
}
