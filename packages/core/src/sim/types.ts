/**
 * Graph B: the living plant, and the record of what was done to it.
 * SIMULATION_KEY.md section 2.
 *
 * Nothing here is ever deleted. A cut marks what it removed with the day it
 * went, so any past moment can be shown again and every change traced to the
 * event that caused it.
 */
import type { Bower } from '../bower/types.ts';
import type { Vec3 } from '../math/vec3.ts';
import type { TaxonProfile } from '../taxon.ts';
import type { AppendageKind, AttachmentStatus, BudEnd, BudStage, GardenerEventType } from '../vocab.ts';
import type { GrowthModel } from './model.ts';
import type { Rng } from './rng.ts';
import type { StemPath } from './stem-path.ts';
import type { Viewpoint } from './view.ts';

/**
 * `side_shoot`: a short free-standing shoot thrown by an established stem,
 * leafy and ending in the inflorescence. It is not a spur: a spur is
 * wisteria's short flowering wood and has its own rules. The render contract
 * has no word for it yet and shows it as `spur`, short flowering wood.
 */
export type AxisRole = 'leader' | 'lateral' | 'whip' | 'spur' | 'side_shoot';
/** How a stretch of stem sits: wound round its support, running along it, or unsupported. Who holds it is the run's `by`. */
export type HoldMode = 'twine' | 'along' | 'free';
/** What a shoot is trying to do at the next node. */
export type Intent = 'riser' | 'tier' | 'free';

/** One stretch of an axis along one member or cable. */
export interface Run {
  edgeId: string;
  fromNode: string;
  toNode: string;
  mode: Exclude<HoldMode, 'free'>;
  status: AttachmentStatus;
  /** 'plant' when the shoot took hold by itself, otherwise the gardener event that tied it. */
  by: string;
  day: number;
  firstPoint: number;
  lastPoint: number;
}

export type Tip =
  | { state: 'at_node'; nodeId: string; came: string | null }
  | { state: 'on_route'; edgeId: string; toNode: string; path: StemPath; d: number; emitted: number; run: number }
  | { state: 'free'; dir: Vec3; grownM: number; planM: number }
  /** `retry` is set where the shoot stopped for want of a hold: a gardener who starts tying in can set it going again. */
  | { state: 'stopped'; reason: string; retry?: { nodeId: string; came: string | null } };

export interface Axis {
  id: string;
  plantId: string;
  role: AxisRole;
  /** 0 for a trunk stem, 1 for a lateral off it, and so on. */
  order: number;
  parent: { axisId: string; pointIndex: number } | null;
  children: string[];
  bornDay: number;
  /** Calendar year its first growth was made: the wood's cohort. */
  bornYear: number;

  // ---- geometry, one entry per point, base to tip ----
  /** Where the stem touches its support, or its centre line where unsupported. */
  contact: Vec3[];
  /** Unit direction away from the support; zero where unsupported. */
  away: Vec3[];
  bornDayAt: number[];
  removedDayAt: (number | null)[];
  /** Stem length from the base to each point. */
  lengthAt: number[];
  radiusMm: number[];

  /** Points still on the plant. A cut lowers this; the points beyond keep their history. */
  alive: number;
  /** Set when the whole axis has gone. */
  removedDay: number | null;
  targetLengthM: number;
  ratePerSeasonM: number;
  intent: Intent;
  tip: Tip;
  runs: Run[];
  /** Edges this axis has already travelled, and those its first step must avoid. */
  used: Set<string>;
  avoid: Set<string>;
  /** Lattice nodes passed, with the point index there. */
  nodesPassed: { nodeId: string; pointIndex: number }[];

  // ---- leaf bookkeeping ----
  sinceLeafM: number;
  nextLeafM: number;
  leafSide: 1 | -1;
  /** Year in which this shoot was cut back in summer, if it was. */
  summerPrunedYear: number | null;

  // ---- appendage bookkeeping ----
  /** Leaf nodes laid down on this axis so far: the place in a repeating pattern such as a vine's tendrils. */
  leafNodeCount: number;
  /** Where the axis has got to between one prickle and the next, and between one patch of clinging rootlets and the next. */
  prickles: Spacing;
  rootlets: Spacing;
  /** For a flowering side shoot, the last calendar year it lives: it is shed before growth starts in the year after. */
  lastYear: number | null;
  /** Growth a side shoot has made but not yet laid down as stem: it lengthens by millimetres a day and is stored a step at a time. */
  owedM: number;
}

/** Progress along a stem towards the next of something set at intervals. */
export interface Spacing {
  /** Stem length since the last one. */
  sinceM: number;
  /** Stem length from the last one to the next; null until it has been drawn. */
  nextM: number | null;
  /** How many have been placed. */
  count: number;
}

/** A place on a stem that bore a leaf in its first season and may carry a spur afterwards. */
export interface LeafNode {
  axisId: string;
  pointIndex: number;
  year: number;
  side: 1 | -1;
  /** True once a spur or whip has grown from it. */
  taken: boolean;
  /** The flowering side shoot growing from it, while there is one. */
  sideShootId: string | null;
}

export interface LeafSite {
  plantId: string;
  axisId: string;
  pointIndex: number;
  position: Vec3;
  direction: Vec3;
  lengthM: number;
  /** First calendar year in leaf. */
  firstYear: number;
  /** Last calendar year in leaf; null for a leaf position renewed every year (a spur). */
  lastYear: number | null;
  /** True where the leaf is kept through winter. */
  evergreen: boolean;
  bornDay: number;
  removedDay: number | null;
  /** Which of the taxon's leaf forms it is, where its growth model names one. */
  form?: string;
}

/**
 * One fruit, or one cluster of them, where a flower set. It has a place on
 * the plant's own wood and goes with that wood when it is cut.
 */
export interface FruitSite {
  id: string;
  plantId: string;
  axisId: string;
  pointIndex: number;
  position: Vec3;
  /** Unit direction it is held in; null where it hangs. */
  direction: Vec3 | null;
  /** Length when full grown. */
  lengthM: number;
  /** Calendar year in which it set. */
  year: number;
  /** It swells from the first day to the second, and ripens from the third to the fourth. */
  swell: [number, number];
  ripen: [number, number];
  /** The day it will fall if nothing removes it first. */
  fallPlannedDay: number;
  removedDay: number | null;
  /** `fell`, or the event or cause that took its stem. */
  removedBy: string | null;
  form?: string;
}

/** A tendril, a coiled leaf stalk, a patch of clinging rootlets or a prickle, at its place on a stem. */
export interface AppendageSite {
  plantId: string;
  axisId: string;
  /** The stem point it goes with when the stem is cut. */
  pointIndex: number;
  kind: AppendageKind;
  position: Vec3;
  direction: Vec3;
  lengthM: number;
  /** True where it has hold of the structure. */
  holding: boolean;
  /** Thickness of the member or cable it has hold of, in millimetres; null where it holds nothing. */
  heldDiameterMm: number | null;
  bornDay: number;
  removedDay: number | null;
}

export interface FloralBud {
  id: string;
  plantId: string;
  /** The wood that bears it: a spur or pruned stub, or a shoot of the current year. Always the plant's own wood. */
  axisId: string;
  /** The point of that wood it stands on; null for the tip of a spur, wherever pruning has left that tip. */
  pointIndex: number | null;
  fate: 'floral';
  stage: BudStage;
  end: BudEnd | null;
  initiatedDay: number;
  /** Calendar year in which it should flower. */
  floweringYear: number;
  openDay: number | null;
  spentDay: number | null;
  endedDay: number | null;
  /** The event that removed it, where one did. */
  endedBy: string | null;
  /** Set when it opens. */
  position: Vec3 | null;
  /** Unit direction the inflorescence is held in, set when it opens; null where it hangs. */
  direction: Vec3 | null;
  /** Which of the taxon's flower forms it is, where its growth model names one. */
  form?: string;
  lengthM: number;
  /**
   * Days on which it will begin to swell, open and drop, fixed when its
   * development is set going; -1 until then. Days, not days of the year, so
   * that a winter display can open in one year and finish in the next.
   */
  developDay: number;
  openPlannedDay: number;
  spentPlannedDay: number;
}

export interface PendingLateral {
  parentId: string;
  pointIndex: number;
  nodeId: string;
  breakYear: number;
  order: number;
  avoid: string[];
  intent: Intent;
}

export interface PendingWhip {
  hostId: string;
  pointIndex: number;
  startDay: number;
  planM: number;
}

export interface Plant {
  id: string;
  taxonId: string;
  stationId: string;
  /** The day the station was first planted. */
  plantedDay: number;
  /** The year the plant now growing was set out: the same as `firstPlantedYear` unless it has been replanted. */
  plantedYear: number;
  firstPlantedYear: number;
  /** `dead`: killed, with nothing growing until someone replants it. */
  status: 'alive' | 'dead' | 'removed';
  /**
   * Independent random streams, so that an intervention disturbs only what it
   * touches: stripping flower buds must not reroute the framework, or two
   * scenarios could not be compared.
   *   arch    routes, branching, planned lengths
   *   organ   leaves, spurs, whips
   *   flower  flower buds, their dates, and how hard each shoot is cut
   */
  rng: { arch: Rng; organ: Rng; flower: Rng };
  /**
   * Tells this plant's places apart from another's when a decision is seeded
   * from where it is made (`placeRng`): fruit set, appendages and flowering
   * side shoots are decided that way, and draw nothing from the three streams.
   */
  placeSeed: number;
  axisIds: string[];
  leafNodes: LeafNode[];
  pendingLaterals: PendingLateral[];
  pendingWhips: PendingWhip[];
  /** Stubs left by a hard prune, which will shoot again at the next bud break. */
  pendingRegrowth: string[];
  /** Standing instruction from the gardener: tie framework growth along the timber sub-lattice. */
  training: { tieToTimber: boolean; by: string | null };
  /** Last calendar year in which the plant was summer-pruned. */
  summerPrunedYear: number | null;
  /** Last calendar year whose season start has been processed. */
  seasonStarted: number | null;
  /**
   * Set on the day the year's flower buds form along the shoots. Growth made
   * after that day goes on forming buds until `untilDay`: for a plant that
   * flowers the same year, as long as a bud could still open within its
   * season; for one that flowers after the winter, to the end of the year.
   */
  budding: { untilDay: number; jan1Day: number; chance: number; minShootM: number; openYear: number; fallYear: number; firstOpenDoy: number; lastOpenDoy: number; leadDays: number; sameYear: boolean } | null;
}

// ---------------------------------------------------------------------------
// Scenario
// ---------------------------------------------------------------------------
export interface Planting {
  plantId: string;
  taxonId: string;
  stationId: string;
  /** ISO date. */
  date: string;
  /** Whether the gardener ties framework growth in from planting day. */
  tieToTimber?: boolean;
}

export type GardenerAction =
  | { type: 'train_leader'; plantId: string; tieToTimber: boolean }
  | { type: 'spur_prune'; plantId: string; season: 'summer' | 'winter' }
  | { type: 'hard_prune'; plantId: string; target: { axisId: string } | { leader: number } | { allSpursOn: { leader: number } } | { allStems: true }; keepM: number }
  | { type: 'monitor'; plantId: string }
  | { type: Exclude<GardenerEventType, 'train_leader' | 'spur_prune' | 'hard_prune' | 'monitor' | 'plant'>; plantId: string; note?: string };

export type GardenerEvent = GardenerAction & {
  id: string;
  /** ISO date. */
  date: string;
  /** Who did it, and why: free text carried into the log. */
  author?: string;
  reason?: string;
};

export interface Scenario {
  name: string;
  /** ISO date of day 0. */
  start: string;
  seed: number;
  bower: Bower;
  taxa: ReadonlyMap<string, { profile: TaxonProfile; model: GrowthModel }>;
  plantings: readonly Planting[];
  events: readonly GardenerEvent[];
  /** Where people stand and look: the design report measures coverage from each. */
  viewpoints?: readonly Viewpoint[];
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------
export interface EventRecord {
  eventId: string;
  day: number;
  date: string;
  type: GardenerEventType;
  plantId: string;
  author: string | null;
  reason: string | null;
  /** What the action did, in a sentence. */
  outcome: string;
  effects: {
    axesCut: number;
    axesRemoved: number;
    stemRemovedM: number;
    floralBudsRemoved: number;
    leafSitesRemoved: number;
  };
  /** False where the action is recorded but the model does not yet act on it. */
  modelled: boolean;
}

/**
 * `assumed`: the model had to pick something a profile leaves unknown, in order to draw the plant at all.
 * `not_modelled`: the plant's flowers are left out, because which of its wood flowers is not known.
 * `part_not_modelled`: some other part (fruit, tendrils, coiled leaf stalks, clinging rootlets, prickles) is left
 * out, because the growth model leaves its numbers unknown. Kept apart from `not_modelled` because readers of
 * that kind take it to mean that the plant has no flowers in the run.
 * `side_shoots_broke`, `shed`: flowering side shoots started from established stems, or had lived out their time.
 */
export type DecisionKind = 'route_chosen' | 'no_route' | 'attached' | 'tied' | 'lateral_broke' | 'side_shoots_broke' | 'shed' | 'regrew' | 'stopped' | 'floral_initiated' | 'flowered' | 'bud_lost' | 'not_modelled' | 'part_not_modelled' | 'assumed' | 'died' | 'replanted';

/** Why the plant did what it did: the trace asked for by PROJECT_CONTEXT.md section 7.6. */
export interface Decision {
  day: number;
  plantId: string;
  axisId: string | null;
  kind: DecisionKind;
  text: string;
}

export interface YearSummary {
  year: number;
  plantId: string;
  /** Alive leader and lateral length at the year's end. */
  frameworkM: number;
  whipM: number;
  spurs: number;
  /** Flowering side shoots alive at the year's end. */
  sideShoots: number;
  /** Flower buds initiated this year (to open next year). */
  floralBudsInitiated: number;
  /** Flowers that opened this year. */
  flowersOpened: number;
  /** Fruits, or clusters of them, that set this year. */
  fruitsSet: number;
  floralBudsLostToPruning: number;
  /** Stretches of route this plant holds by itself, and those a gardener tied. */
  runsSelf: number;
  runsTied: number;
  /** Share of all route length in the Bower that carries this plant. */
  routeShare: number;
  /** Highest point of the permanent stems; shoots of the year standing above them are not counted. */
  highestM: number;
}
