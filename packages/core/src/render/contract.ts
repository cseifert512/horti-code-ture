/**
 * The render-data contract: everything a viewer needs to show a simulated
 * Bower at any day of a run, and nothing it would have to guess.
 *
 * The idea is the prototype's, generalised. Each element carries the day it
 * appeared and the day it went, so a viewer can scrub time freely by
 * comparing those days with its clock. What differs from the prototype is
 * where the days come from: there they were computed in one pass from fixed
 * rules; here they are the record of a stepped simulation in which gardener
 * events changed the plant. A viewer must not add phenology of its own. Leaf
 * and flower timing is in `seasons` and in each flower's own days.
 *
 * Plain JSON: numbers, strings and arrays only, so it can be written to a
 * file, sent to a worker or loaded by another tool.
 *
 * Frame: right-handed, metres, x east, y north, z up.
 * three.js (x, y, z) = (x, z, -y).
 * Time: whole days since `start`.
 */
import type { EvidenceStatus, LeafHabit } from '../vocab.ts';

export const RENDER_CONTRACT = 1;

export type Triple = [number, number, number];

export interface RenderPlant {
  id: string;
  taxonId: string;
  /** Botanical label for captions. */
  label: string;
  stationId: string;
  plantedDay: number;
  leafHabit: LeafHabit | null;
  /** Short description of the flowers, for choosing or tinting an asset. */
  flowerDisplay: string;
}

/**
 * One stem, base to tip. Arrays are parallel, one entry per point; `contact`
 * and `away` hold three numbers per point.
 *
 * A supported stem is stored where it TOUCHES its support. Its centre at
 * any time is  contact + away * radius(t)  so it thickens outwards from the
 * timber or cable and never into it. Where `away` is zero the stem is
 * unsupported and `contact` is its centre line.
 */
export interface RenderStem {
  id: string;
  plantId: string;
  parentId: string | null;
  /** leader and lateral are permanent framework; whip is a long shoot of the year; spur is short flowering wood. */
  role: 'leader' | 'lateral' | 'whip' | 'spur';
  order: number;
  contact: number[];
  away: number[];
  /** Day each point was laid down. */
  bornDay: number[];
  /** Day each point was cut away, or -1 if it is still on the plant at the end of the run. */
  removedDay: number[];
  /** Radius of each point at the end of the run, in millimetres. */
  radiusMm: number[];
}

export interface RenderLeaf {
  plantId: string;
  stemId: string;
  position: Triple;
  /** Unit direction the leaf stalk leaves the stem. */
  direction: Triple;
  lengthM: number;
  /** First and last calendar years in leaf; `lastYear` null means every year until removed. */
  firstYear: number;
  lastYear: number | null;
  /**
   * False: in leaf only between that year's leaf flush and leaf fall (see `seasons`).
   * True: kept through winter, from the flush of its first year to the end of its last.
   */
  evergreen: boolean;
  bornDay: number;
  /** -1 if never removed. */
  removedDay: number;
}

/** One inflorescence that actually opened: a flower bud that formed, survived and developed. */
export interface RenderFlower {
  plantId: string;
  stemId: string;
  /** Where it hangs from. */
  position: Triple;
  lengthM: number;
  year: number;
  /** Day the bud began to lengthen, the day it opened, and the day its petals had fallen (-1 if not yet). */
  developDay: number;
  openDay: number;
  spentDay: number;
}

/** The dates one plant kept in one calendar year, as day indices. A viewer drives leaf display from these. */
export interface RenderSeason {
  plantId: string;
  year: number;
  budburstDay: number;
  growthEndDay: number;
  /** Leaves expand from the first day to the second. */
  leafFlush: [number, number];
  autumnColour: [number, number];
  /** Leaves drop from the first day to the second; none remain after it on a deciduous plant. */
  leafFall: [number, number];
}

export interface RenderEvent {
  day: number;
  date: string;
  plantId: string;
  type: string;
  outcome: string;
}

export interface RenderData {
  contract: typeof RENDER_CONTRACT;
  scenario: string;
  /** ISO date of day 0. */
  start: string;
  /** The last simulated day. */
  lastDay: number;
  frame: 'right-handed, metres, x east, y north, z up';
  plants: RenderPlant[];
  stems: RenderStem[];
  leaves: RenderLeaf[];
  flowers: RenderFlower[];
  seasons: RenderSeason[];
  /** The gardener's log, for a timeline. */
  events: RenderEvent[];
  /**
   * How to draw stem thickness between a point's birth and the end of the
   * run. The engine fixes thickness at each year's end; in between, a viewer
   * interpolates:  radius(t) = tip + (final - tip) * ((t - born) / (lastDay - born)) ^ exponent
   */
  thickening: { tipRadiusMm: number; exponent: number };
  /** Must be shown wherever the render is shown. */
  statement: string;
  /** How many of the numbers behind this run have each evidence status. */
  assumptions: Record<EvidenceStatus, number>;
}
