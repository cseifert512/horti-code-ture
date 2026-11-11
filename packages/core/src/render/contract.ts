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
import type { AppendageKind, EvidenceStatus, LeafHabit } from '../vocab.ts';

/**
 * 2: adds fruit, appendages (tendrils, coiled leaf stalks, clinging rootlets, prickles), and the optional
 *    `form` of a leaf, flower or fruit for taxa that have more than one. A reader of contract 1 data may
 *    treat the two new lists as empty.
 */
export const RENDER_CONTRACT = 2;

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
  /**
   * Which of the taxon's leaf forms this is, where it has more than one: ivy's
   * lobed climbing leaf and the unlobed leaf of its flowering shoots, for
   * example. The names are the taxon's own, listed in its growth model.
   * Absent: its ordinary leaf.
   */
  form?: string;
}

/** One inflorescence that actually opened: a flower bud that formed, survived and developed. */
export interface RenderFlower {
  plantId: string;
  stemId: string;
  /** Where it is attached. */
  position: Triple;
  lengthM: number;
  year: number;
  /** Day the bud began to lengthen, the day it opened, and the day its petals had fallen (-1 if not yet). */
  developDay: number;
  openDay: number;
  spentDay: number;
  /**
   * Unit direction the inflorescence is held in from its attachment. Absent:
   * it hangs, as a wisteria raceme does. A flower that faces out from its
   * node or stands above its shoot says so here.
   */
  direction?: Triple;
  /** Which of the taxon's flower forms this is, where it has more than one. Absent: its ordinary one. */
  form?: string;
}

/**
 * One fruit, or one cluster of them where they are borne together: a pod, a
 * hip, a bunch of berries, a head of feathered seeds. It follows a flower
 * that was pollinated and set; most flowers of most climbers do not.
 */
export interface RenderFruit {
  plantId: string;
  stemId: string;
  /** Where it is attached. */
  position: Triple;
  /** Length of the fruit or cluster when full grown. */
  lengthM: number;
  year: number;
  /** It swells from the first day to the second, and ripens (colours, dries) from the third to the fourth. */
  swell: [number, number];
  ripen: [number, number];
  /** Day it fell, was eaten or was cut away with its stem; -1 if still on the plant at the end of the run. */
  removedDay: number;
  /** Unit direction it is held in from its attachment. Absent: it hangs. */
  direction?: Triple;
  /** Which of the taxon's fruit forms this is, where it has more than one. Absent: its ordinary one. */
  form?: string;
}

/**
 * A small part the plant holds on or defends itself with: a tendril, a coiled
 * leaf stalk, a patch of clinging rootlets, a prickle. The engine places them
 * where the plant's way of holding on puts them; a viewer draws them and adds
 * none of its own.
 */
export interface RenderAppendage {
  plantId: string;
  stemId: string;
  kind: AppendageKind;
  /** Where it leaves the stem. */
  position: Triple;
  /** Unit direction it reaches in: towards what it holds, or outwards for a prickle. */
  direction: Triple;
  lengthM: number;
  /** True where it has hold of the structure; false where it found nothing, or holds nothing by nature. */
  holding: boolean;
  bornDay: number;
  /** Day it went with its stem, or withered; -1 if never. */
  removedDay: number;
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
  fruits: RenderFruit[];
  appendages: RenderAppendage[];
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
