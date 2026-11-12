/**
 * The growth engine: a plant that persists, on a daily clock, and can be
 * changed by what a gardener does to it.
 *
 * SIMULATION_KEY.md section 6 asks for three passes; each day runs them in
 * this order:
 *   management    gardener events dated today change the living graph
 *   seasonal      buds break, flower buds form, flowers open and fall
 *   architecture  shoots extend along the timber and cables, choosing routes
 *
 * Nothing is reset between years. Every stem, bud and leaf carries the day
 * it appeared and the day it went, so the whole history stays viewable.
 *
 * What makes a flower here (wisteria, old-wood flowering): a spur, or a shoot
 * cut back in summer, forms a flower bud in late summer; the bud has to
 * survive on its own wood through winter and any pruning; it opens the
 * following spring. No calendar date makes a flower without that chain.
 *
 * Every rate, chance and date comes from the taxon's GrowthModel, where each
 * is labelled with its evidence status. Almost all are provisional.
 *
 * Four things a taxon may or may not have are switched on by its model alone,
 * and are left out where the model leaves their numbers unknown:
 *   fruit                  a flower that went over on the plant may set
 *   appendages             tendrils, coiled leaf stalks, clinging rootlets, prickles
 *   forms and hold         which leaf, flower or fruit form; how an inflorescence is held
 *   flowering side shoots  short free-standing shoots from established stems
 * None of them draws from a plant's three random streams: each is decided from
 * the place it happens (`placeRng`), so that switching one on, or cutting one
 * off, moves nothing else on the plant.
 */
import { assessAttachment } from '../attachment.ts';
import type { SupportEdge } from '../bower/types.ts';
import { Calendar, type CalendarDate } from '../calendar.ts';
import { type Vec3, UP, ZERO, add, addScaled, anyPerpendicular, cross, distance, dot, length, lerp, normalize, scale, smoothstep, sub, v3 } from '../math/vec3.ts';
import type { AppendageKind, GardenerEventType, MemberTier, OrganHeld } from '../vocab.ts';
import { type FreeShoot, GRAVITY, LIGHT_EVERY_M, PLUMB_RAD, type Rod, Surroundings, directionAt, modulusPa, replane, secondMomentM4, seekDirection, solveRod, startFreeShoot, steer } from './free-shoot.ts';
import { type LightFrom, openSkyLight } from './light-from.ts';
import { LightField } from './light.ts';
import { type GrowthModel, type OptionalParamKey, genericShootKeys, known, listAt, param, shootParam } from './model.ts';
import { Rng, placeRng } from './rng.ts';
import { liePath, pathAt, pathLength, twinePath } from './stem-path.ts';
import type { AppendageSite, Axis, AxisRole, Decision, DecisionKind, EventRecord, FloralBud, FruitSite, GardenerEvent, Intent, LeafSite, Plant, Planting, Run, Scenario, Spacing, Tip, YearSummary } from './types.ts';
import { leafSilhouetteAreaM2 } from './view.ts';

/** Metres of stem between stored points. */
const STEP = 0.04;
/** Sideways spacing of stems tied along the same member. */
const LANE_M = 0.022;

const mid = (r: readonly [number, number]) => (r[0] + r[1]) / 2;

/** What tells one decision made at a place from another made at the same place. */
const SALT = { fruit: 101, tendril: 211, leafStalk: 307, rootlets: 401, prickle: 503, sideShoot: 601, sideShootGrowth: 701, sideShootLeaf: 809, sideShootBud: 907, held: 1009 } as const;
/** Everything fruit needs before any can set. */
const FRUIT_KEYS = ['fruit.setShare', 'fruit.lengthM', 'fruit.swellDays', 'fruit.ripenDoy', 'fruit.fallDoy'] as const satisfies readonly OptionalParamKey[];
const newSpacing = (): Spacing => ({ sinceM: 0, nextM: null, count: 0 });

export class Simulation {
  readonly scenario: Scenario;
  readonly calendar: Calendar;
  /** The last day simulated; -1 before the first step. */
  day = -1;
  readonly plants = new Map<string, Plant>();
  readonly axes = new Map<string, Axis>();
  readonly leaves: LeafSite[] = [];
  readonly buds: FloralBud[] = [];
  readonly fruits: FruitSite[] = [];
  readonly appendages: AppendageSite[] = [];
  readonly events: EventRecord[] = [];
  readonly decisions: Decision[] = [];
  readonly summaries: YearSummary[] = [];
  /** The light each plant gets on this site, and what its profile makes of it: see `light.ts`. */
  readonly light: LightField;

  /**
   * How often a shoot in the air asked which way the light is, by who answered: the scenario's own `lightFrom`, the
   * light model, or the open sky of the site where neither could say.
   */
  readonly lightAsked = { scenario: 0, lightModel: 0, openSky: 0 };

  /** Axis ids on each edge, in the order they arrived. */
  private readonly occupancy = new Map<string, string[]>();
  private readonly eventsByDay = new Map<number, GardenerEvent[]>();
  private readonly plantingsByDay = new Map<number, Planting[]>();
  private readonly tierOf = new Map<string, MemberTier>();
  private readonly budsByAxis = new Map<string, FloralBud[]>();
  private readonly leavesByAxis = new Map<string, LeafSite[]>();
  private readonly fruitsByAxis = new Map<string, FruitSite[]>();
  private readonly appendagesByAxis = new Map<string, AppendageSite[]>();
  /** Fruit still on each plant, waiting for its day to fall. */
  private readonly hanging = new Map<string, FruitSite[]>();
  private readonly topZ: number;
  private readonly routeTotalM: number;
  private serial = 0;
  /** The timber and cables as a shoot in the air meets them; made when the first such shoot grows. */
  private around: Surroundings | null = null;
  private openSky: LightFrom | null = null;
  /** Shoots that have taken hold of a support and not yet laid a coil's length along it. */
  private readonly newHolds = new Set<string>();
  /**
   * Shoots that took hold of a support from the air, and the stretches of route they hold, in the order they came.
   * Kept apart from `occupancy`, which is the framework's: see `stemsOn`.
   */
  private readonly tookHold = new Set<string>();
  private readonly holds = new Map<string, string[]>();
  private yearStats = new Map<string, { initiated: number; opened: number; lost: number; fruits: number }>();

  constructor(scenario: Scenario) {
    this.scenario = scenario;
    this.calendar = new Calendar(scenario.start);
    for (const p of scenario.plantings) this.push(this.plantingsByDay, this.calendar.dayOf(p.date), p);
    for (const e of scenario.events) this.push(this.eventsByDay, this.calendar.dayOf(e.date), e);
    for (const m of scenario.bower.members) this.tierOf.set(m.id, m.tier);
    let top = 0;
    for (const n of scenario.bower.graph.nodes.values()) top = Math.max(top, n.position.z);
    this.topZ = top;
    this.routeTotalM = scenario.bower.graph.totalLength;
    this.light = new LightField(this);
  }

  private push<T>(map: Map<number, T[]>, day: number, item: T): void {
    if (day < 0) throw new Error(`"${this.calendar.dateOf(day).iso}" is before the scenario starts on ${this.scenario.start}`);
    const list = map.get(day);
    if (list) list.push(item);
    else map.set(day, [item]);
  }

  // =========================================================================
  // Clock
  // =========================================================================
  step(): void {
    const day = ++this.day;
    const date = this.calendar.dateOf(day);
    for (const p of this.plantingsByDay.get(day) ?? []) this.plant(p, date);
    for (const e of this.eventsByDay.get(day) ?? []) this.applyEvent(e, date);
    for (const plant of this.plants.values()) if (plant.status === 'alive') this.dayForPlant(plant, date);
    if (date.month === 12 && date.dayOfMonth === 31) this.closeYear(date);
  }

  /** Run to the end of the given ISO date. */
  runUntil(iso: string): this {
    const last = this.calendar.dayOf(iso);
    while (this.day < last) this.step();
    return this;
  }

  get date(): CalendarDate {
    return this.calendar.dateOf(Math.max(0, this.day));
  }

  private taxon(plant: Plant) {
    const t = this.scenario.taxa.get(plant.taxonId);
    if (!t) throw new Error(`the scenario has no taxon "${plant.taxonId}"`);
    return t;
  }

  private note(kind: DecisionKind, plant: Plant, axis: Axis | null, text: string): void {
    this.decisions.push({ day: this.day, plantId: plant.id, axisId: axis?.id ?? null, kind, text });
  }

  // =========================================================================
  // Planting
  // =========================================================================
  private plant(p: Planting, date: CalendarDate): void {
    if (this.plants.has(p.plantId)) throw new Error(`plant "${p.plantId}" is planted twice`);
    const station = this.scenario.bower.rootStations.find((s) => s.id === p.stationId);
    if (!station) throw new Error(`plant "${p.plantId}": unknown root station "${p.stationId}"`);
    const plant: Plant = {
      id: p.plantId,
      taxonId: p.taxonId,
      stationId: p.stationId,
      plantedDay: this.day,
      plantedYear: date.year,
      firstPlantedYear: date.year,
      status: 'alive',
      rng: {
        arch: new Rng(this.scenario.seed * 7919 + this.plants.size * 104729 + 13),
        organ: new Rng(this.scenario.seed * 7919 + this.plants.size * 104729 + 1013),
        flower: new Rng(this.scenario.seed * 7919 + this.plants.size * 104729 + 2013),
      },
      placeSeed: this.scenario.seed * 7919 + this.plants.size * 104729 + 3013,
      axisIds: [],
      leafNodes: [],
      pendingLaterals: [],
      pendingWhips: [],
      pendingRegrowth: [],
      training: { tieToTimber: p.tieToTimber ?? false, by: p.tieToTimber ? 'planting' : null },
      summerPrunedYear: null,
      seasonStarted: null,
      budding: null,
    };
    this.plants.set(plant.id, plant);
    this.yearStats.set(plant.id, { initiated: 0, opened: 0, lost: 0, fruits: 0 });
    const { profile, model } = this.taxon(plant);
    this.events.push(this.record({ id: `plant:${plant.id}`, date: date.iso, type: 'plant', plantId: plant.id }, date, `planted ${profile.names.label} at ${station.id}`, true));
    if (profile.attachment.mechanism === 'none') {
      this.note('stopped', plant, null, `${profile.names.label} is a shrub: it stays in its bed and is not routed on to the structure`);
      return;
    }
    if (profile.attachment.mechanism === 'stem_twining' && (profile.attachment.handedness?.value ?? null) === null) {
      this.note('assumed', plant, null, `which way ${profile.names.label} twines is not known: it is drawn right-handed so that it can be drawn at all, and that direction is not a finding`);
    }
    this.noteMissingParts(plant);
    this.noteGenericShoot(plant);
    // the plant arrives as a cane already some way up
    const cane = this.newTrunkStem(plant, 0);
    if (cane) this.advance(plant, cane, param(model, 'architecture.nurseryCaneM'));
  }

  /**
   * Say once, on planting day, which parts of this plant the run leaves out
   * because its growth model gives no numbers for them. Fruit is said of every
   * plant; an appendage only of a plant whose way of climbing has it.
   */
  private noteMissingParts(plant: Plant): void {
    const { profile, model } = this.taxon(plant);
    const missing = (keys: readonly OptionalParamKey[]) => keys.filter((k) => known(model, k) === null);
    const say = (part: string, keys: readonly OptionalParamKey[]) => {
      const gaps = missing(keys);
      if (gaps.length) this.note('part_not_modelled', plant, null, `no ${part} modelled for ${profile.names.label}: its growth model leaves ${gaps.join(', ')} unknown`);
    };
    // a model that says outright that nothing sets has said enough
    if (known(model, 'fruit.setShare') !== 0) say('fruit is', FRUIT_KEYS);
    const mechanism = profile.attachment.mechanism;
    if (mechanism === 'tendril') say('tendrils are', ['appendages.tendrilNodePattern', 'appendages.tendrilLengthM']);
    if (mechanism === 'petiole_twining') say('coiled leaf stalks are', ['appendages.leafStalkCoilShare', 'appendages.leafStalkLengthM']);
    if (mechanism === 'aerial_root') say('clinging rootlets are', ['appendages.aerialRootPatchSpacingM', 'appendages.aerialRootLengthM']);
    if (mechanism === 'scramble_and_tie') say('prickles are', ['appendages.prickleSpacingM', 'appendages.prickleLengthM']);
  }

  /** A random stream that belongs to one decision at one place on this plant, and to nothing else. */
  private at(plant: Plant, p: Vec3, salt: number): Rng {
    return placeRng(plant.placeSeed, p.x, p.y, p.z, salt);
  }

  private newTrunkStem(plant: Plant, index: number): Axis | null {
    const station = this.scenario.bower.rootStations.find((s) => s.id === plant.stationId)!;
    const entry = station.entryNodeIds[0];
    if (!entry) return null;
    const { model } = this.taxon(plant);
    const node = this.scenario.bower.graph.nodes.get(entry)!;
    const axis = this.newAxis(plant, 'leader', 0, null, plant.rng.arch.range(...param(model, 'architecture.leaderLengthM')), param(model, 'extension.leaderMPerSeason'));
    // the first stem makes for the crown; the others run level and form the lowest tier
    axis.intent = index === 0 ? 'riser' : 'tier';
    axis.tip = { state: 'at_node', nodeId: entry, came: null };
    this.appendPoint(plant, axis, node.position, UP);
    return axis;
  }

  /**
   * `leaves` gives the new axis its first leaf spacing and side outright; left
   * out, they are drawn from the plant's organ stream as they always were.
   */
  private newAxis(plant: Plant, role: AxisRole, order: number, parent: Axis['parent'], targetLengthM: number, ratePerSeasonM: number, leaves?: { nextLeafM: number; leafSide: 1 | -1 }): Axis {
    const axis: Axis = {
      id: `${plant.id}/${role}${this.serial++}`,
      plantId: plant.id,
      role,
      order,
      parent,
      children: [],
      bornDay: this.day,
      bornYear: this.calendar.dateOf(this.day).year,
      contact: [],
      away: [],
      bornDayAt: [],
      removedDayAt: [],
      lengthAt: [],
      radiusMm: [],
      alive: 0,
      removedDay: null,
      targetLengthM,
      ratePerSeasonM,
      intent: 'free',
      tip: { state: 'stopped', reason: 'not started' },
      runs: [],
      used: new Set(),
      avoid: new Set(),
      nodesPassed: [],
      sinceLeafM: 0,
      nextLeafM: leaves ? leaves.nextLeafM : plant.rng.organ.range(0.03, 0.1),
      leafSide: leaves ? leaves.leafSide : plant.rng.organ.sign(),
      summerPrunedYear: null,
      leafNodeCount: 0,
      prickles: newSpacing(),
      rootlets: newSpacing(),
      lastYear: null,
      owedM: 0,
    };
    this.axes.set(axis.id, axis);
    plant.axisIds.push(axis.id);
    if (parent) this.axes.get(parent.axisId)!.children.push(axis.id);
    return axis;
  }

  // =========================================================================
  // One day in the life of a plant
  // =========================================================================
  private dayForPlant(plant: Plant, date: CalendarDate): void {
    const { profile, model } = this.taxon(plant);
    const doy = date.dayOfYear;
    // an annual outdoors: the cold kills it, and nothing comes back from the root
    if (profile.ukCultivation === 'annual_replant' && doy === param(model, 'phenology.leafFallDoy')[1]) {
      this.die(plant, `cold:${date.year}`, 'was killed by the cold: outdoors in the UK it lives one summer, and nothing grows here until it is replanted');
      return;
    }
    const burst = param(model, 'phenology.budburstDoy');
    const end = param(model, 'phenology.growthEndDoy');

    if (plant.seasonStarted !== date.year && doy >= burst && doy < end) this.startSeason(plant, date);
    if (doy === param(model, 'phenology.floralInitiationDoy')[1]) this.initiateFloralBuds(plant, date);
    if (doy === param(model, 'phenology.leafFallDoy')[1]) for (const b of this.liveBuds(plant)) if (b.stage === 'initiated') b.stage = 'dormant';
    this.flowerDay(plant, date);
    this.fruitDay(plant);

    // whips whose day has come
    if (plant.pendingWhips.length) {
      const due = plant.pendingWhips.filter((w) => w.startDay <= this.day);
      if (due.length) {
        plant.pendingWhips = plant.pendingWhips.filter((w) => w.startDay > this.day);
        for (const w of due) this.startWhip(plant, w.hostId, w.pointIndex, w.planM);
      }
    }

    // extension: the season's growth is spread over it as a hump, slow at each end
    const share = smoothstep(burst, end, doy + 1) - smoothstep(burst, end, doy);
    if (share <= 0) return;
    const est = date.year - plant.plantedYear < param(model, 'extension.establishmentFactorByYear').length ? listAt(model, 'extension.establishmentFactorByYear', date.year - plant.plantedYear) : 1;
    // light: 1 where the plant has as much as its profile asks for, less where it is shaded below that
    const lit = this.light.growthFactor(plant, date);
    for (const id of [...plant.axisIds]) {
      const axis = this.axes.get(id)!;
      if (axis.removedDay !== null || axis.tip.state === 'stopped') continue;
      // a whip grows at its own pace: it is the plant's vigour looking for somewhere to go.
      // So does a flowering side shoot, which only an established stem throws.
      let delta = axis.ratePerSeasonM * share * (axis.role === 'whip' || axis.role === 'side_shoot' ? 1 : est) * lit;
      if (axis.role === 'side_shoot') {
        // it lengthens by millimetres a day: lay the stem down a step at a time, not a point a day
        axis.owedM += delta;
        if (axis.owedM < STEP && axis.owedM < axis.targetLengthM - this.lengthOf(axis)) continue;
        delta = axis.owedM;
        axis.owedM = 0;
      }
      this.advance(plant, axis, delta);
    }
  }

  /** The whole plant dies: every stem goes, with its leaves, buds, flowers and holds. */
  private die(plant: Plant, causeId: string, why: string): void {
    const fx: EventRecord['effects'] = { axesCut: 0, axesRemoved: 0, stemRemovedM: 0, floralBudsRemoved: 0, leafSitesRemoved: 0 };
    const stats = this.yearStats.get(plant.id)!;
    const lostToPruning = stats.lost;
    for (const id of [...plant.axisIds]) {
      const a = this.axes.get(id)!;
      if (a.parent === null) this.removeAxis(a, causeId, fx);
    }
    // what dies with the plant was not pruned off
    stats.lost = lostToPruning;
    for (const b of this.buds) if (b.plantId === plant.id && b.endedBy === causeId) b.end = 'aborted';
    plant.status = 'dead';
    plant.budding = null;
    plant.pendingLaterals = [];
    plant.pendingWhips = [];
    plant.pendingRegrowth = [];
    this.note('died', plant, null, `${this.taxon(plant).profile.names.label} ${why}. ${fx.stemRemovedM.toFixed(1)} m of stem went with it; the dead growth is not drawn`);
  }

  /** A new plant of the same kind at the same station: this year's annual, or a replacement for one that died. */
  private replant(plant: Plant, e: GardenerEvent, date: CalendarDate): void {
    const { profile, model } = this.taxon(plant);
    const annual = profile.ukCultivation === 'annual_replant';
    if (plant.status === 'removed' || (e.type === 'annual_replant' && !annual)) {
      this.events.push(this.record(e, date, `nothing done: ${profile.names.label} is not grown as an annual at ${plant.stationId}`, true));
      return;
    }
    if (plant.status === 'alive') {
      if (!annual) {
        this.events.push(this.record(e, date, `nothing done: ${profile.names.label} is alive and needs no replacing`, true));
        return;
      }
      this.die(plant, e.id, 'was pulled out to make way for this year\'s plant');
    }
    plant.status = 'alive';
    plant.plantedYear = date.year;
    plant.seasonStarted = null;
    plant.summerPrunedYear = null;
    plant.leafNodes = [];
    const cane = this.newTrunkStem(plant, 0);
    if (cane) this.advance(plant, cane, param(model, 'architecture.nurseryCaneM'));
    this.events.push(this.record(e, date, `${annual ? 'this year\'s plant set out' : 'the dead plant replaced'}: ${profile.names.label} at ${plant.stationId}`, true));
    this.note('replanted', plant, null, `a new ${profile.names.label} was planted at ${plant.stationId}`);
  }

  private liveBuds(plant: Plant): FloralBud[] {
    return this.buds.filter((b) => b.plantId === plant.id && b.end === null && b.stage !== 'spent');
  }

  // =========================================================================
  // Architecture: extension, routes, attachment
  // =========================================================================
  private advance(plant: Plant, axis: Axis, delta: number): void {
    if (this.newHolds.has(axis.id)) this.settleHold(plant, axis);
    let left = delta;
    let guard = 0;
    while (left > 1e-9 && guard++ < 10_000) {
      const tip = axis.tip;
      if (tip.state === 'stopped') return;
      const room = axis.targetLengthM - this.lengthOf(axis);
      if (room <= 1e-9) {
        axis.tip = { state: 'stopped', reason: 'reached its planned length' };
        return;
      }
      if (tip.state === 'at_node') {
        if (!this.chooseNext(plant, axis, tip.nodeId, tip.came)) return;
        continue;
      }
      if (tip.state === 'on_route') {
        const total = pathLength(tip.path);
        const go = Math.min(left, room, total - tip.d);
        tip.d += go;
        left -= go;
        while (tip.emitted + STEP <= tip.d + 1e-9 && tip.emitted + STEP < total - 1e-6) {
          tip.emitted += STEP;
          const q = pathAt(tip.path, tip.emitted);
          this.appendPoint(plant, axis, q.p, q.away);
        }
        if (tip.d >= total - 1e-9) {
          const q = pathAt(tip.path, total);
          this.appendPoint(plant, axis, q.p, q.away);
          axis.runs[tip.run]!.lastPoint = axis.contact.length - 1;
          axis.nodesPassed.push({ nodeId: tip.toNode, pointIndex: axis.contact.length - 1 });
          axis.tip = { state: 'at_node', nodeId: tip.toNode, came: tip.edgeId };
        } else {
          axis.runs[tip.run]!.lastPoint = axis.contact.length - 1;
        }
        continue;
      }
      // unsupported: a rod under its own weight, which turns to the light and may take hold again (growFree)
      const go = Math.min(left, room, tip.planM - tip.grownM, STEP);
      if (go <= 1e-9) {
        axis.tip = { state: 'stopped', reason: 'reached its planned length' };
        return;
      }
      const laid = this.growFree(plant, axis, tip, go);
      // nothing laid and still in the air cannot happen; were it to, the shoot stops and does not spin
      if (laid <= 0 && axis.tip === tip) axis.tip = { state: 'stopped', reason: 'could not grow on' };
      left -= laid;
    }
  }

  private lengthOf(axis: Axis): number {
    return axis.alive > 0 ? axis.lengthAt[axis.alive - 1]! : 0;
  }

  private appendPoint(plant: Plant, axis: Axis, p: Vec3, away: Vec3): void {
    const { model } = this.taxon(plant);
    const n = axis.contact.length;
    const seg = n > 0 ? distance(axis.contact[n - 1]!, p) : 0;
    axis.contact.push(p);
    axis.away.push(away);
    axis.bornDayAt.push(this.day);
    axis.removedDayAt.push(null);
    axis.lengthAt.push(n > 0 ? axis.lengthAt[n - 1]! + seg : 0);
    axis.radiusMm.push(Math.sqrt(param(model, 'thickening.tipRadiusSquaredMm2')));
    axis.alive = n + 1;
    if (n === 0) return;
    this.alongStem(plant, axis, n, seg);
    if (axis.role === 'spur') return;
    if (axis.role === 'side_shoot') {
      this.sideShootLeaves(plant, axis, n, seg);
      return;
    }
    axis.sinceLeafM += seg;
    if (axis.sinceLeafM >= axis.nextLeafM) {
      axis.sinceLeafM = 0;
      axis.nextLeafM = plant.rng.organ.range(...param(model, 'organs.leafSpacingM'));
      axis.leafSide = axis.leafSide === 1 ? -1 : 1;
      this.addLeafNode(plant, axis, n);
    }
  }

  /** Direction of travel at a point of an axis. */
  private tangent(axis: Axis, i: number): Vec3 {
    const a = axis.contact[Math.max(0, i - 1)]!;
    const b = axis.contact[Math.min(axis.contact.length - 1, i + 1)]!;
    const t = normalize(sub(b, a));
    return length(t) > 0 ? t : UP;
  }

  private addLeafNode(plant: Plant, axis: Axis, i: number): void {
    const { model } = this.taxon(plant);
    const year = this.calendar.dateOf(this.day).year;
    const t = this.tangent(axis, i);
    const up = length(axis.away[i]!) > 0.5 ? axis.away[i]! : UP;
    let side = cross(t, up);
    side = length(side) > 1e-6 ? scale(normalize(side), axis.leafSide) : v3(1, 0, 0);
    plant.leafNodes.push({ axisId: axis.id, pointIndex: i, year, side: axis.leafSide, taken: false, sideShootId: null });
    this.lateBud(plant, axis, i);
    // a deciduous leaf lasts its one season; an evergreen one stays for as many as the model gives it
    const seasons = Math.max(1, Math.round(param(model, 'organs.leafLifespanYears')));
    const form = model.names.leafForm;
    this.addLeaf(plant, axis, i, normalize(add(add(scale(side, 0.75), scale(up, 0.6)), scale(t, 0.3))), plant.rng.organ.range(...param(model, 'organs.leafLengthM')), year, year + seasons - 1, form);
    // where leaves stand in opposite pairs, the second faces the other way
    if (param(model, 'organs.leavesPerNode') >= 2) {
      this.addLeaf(plant, axis, i, normalize(add(add(scale(side, -0.75), scale(up, 0.6)), scale(t, 0.3))), plant.rng.organ.range(...param(model, 'organs.leafLengthM')), year, year + seasons - 1, form);
    }
    this.atLeafNode(plant, axis, i, t, side);
  }

  private addLeaf(plant: Plant, axis: Axis, i: number, direction: Vec3, lengthM: number, firstYear: number, lastYear: number | null, form?: string): void {
    const evergreen = this.taxon(plant).profile.leafHabit.value === 'evergreen';
    const leaf: LeafSite = { plantId: plant.id, axisId: axis.id, pointIndex: i, position: axis.contact[i]!, direction, lengthM, firstYear, lastYear, evergreen, bornDay: this.day, removedDay: null };
    if (form !== undefined) leaf.form = form;
    this.leaves.push(leaf);
    const list = this.leavesByAxis.get(axis.id);
    if (list) list.push(leaf);
    else this.leavesByAxis.set(axis.id, [leaf]);
  }

  // =========================================================================
  // Appendages: what the plant holds on with, or defends itself with
  // =========================================================================
  /** True while the shoot is laying stem on a stretch it took hold of by itself. */
  private holdsItself(axis: Axis): boolean {
    return axis.tip.state === 'on_route' && axis.runs[axis.tip.run]!.by === 'plant';
  }

  private addAppendage(plant: Plant, axis: Axis, i: number, kind: AppendageKind, position: Vec3, direction: Vec3, lengthM: number, holding: boolean): void {
    // what it has hold of is the stretch its shoot is on
    const held = holding && axis.tip.state === 'on_route' ? (this.scenario.bower.graph.edges.get(axis.tip.edgeId)?.gripDiameterMm ?? null) : null;
    const site: AppendageSite = { plantId: plant.id, axisId: axis.id, pointIndex: i, kind, position, direction, lengthM, holding, heldDiameterMm: held, bornDay: this.day, removedDay: null };
    this.appendages.push(site);
    const list = this.appendagesByAxis.get(axis.id);
    if (list) list.push(site);
    else this.appendagesByAxis.set(axis.id, [site]);
  }

  /**
   * What stands at a leaf node besides the leaf: a tendril, opposite the leaf,
   * on the nodes the taxon's pattern gives one to; or the leaf's own stalk,
   * coiled round the support where the shoot holds it by itself. `side` is the
   * side of the stem the leaf stands on.
   */
  private atLeafNode(plant: Plant, axis: Axis, i: number, t: Vec3, side: Vec3): void {
    const { model } = this.taxon(plant);
    const nth = axis.leafNodeCount++;
    const at = axis.contact[i]!;
    const away = axis.away[i]!;
    const supported = length(away) > 0.5;
    const holds = supported && this.holdsItself(axis);

    const pattern = known(model, 'appendages.tendrilNodePattern');
    const tendrilM = known(model, 'appendages.tendrilLengthM');
    if (pattern && tendrilM && pattern[nth % pattern.length] === 1 && tendrilM[1] > 0) {
      const rng = this.at(plant, at, SALT.tendril);
      // one that holds has gone round the support; one that does not reaches out and forward from the far side of the stem
      const reach = holds ? add(add(scale(away, -1), scale(t, 0.45)), scale(side, -0.25)) : add(add(scale(side, -0.8), scale(t, 0.55)), scale(supported ? away : UP, 0.3));
      this.addAppendage(plant, axis, i, 'tendril', at, normalize(reach), rng.range(...tendrilM), holds);
    }

    const coilShare = known(model, 'appendages.leafStalkCoilShare');
    const stalkM = known(model, 'appendages.leafStalkLengthM');
    if (coilShare && stalkM && holds && stalkM[1] > 0) {
      const rng = this.at(plant, at, SALT.leafStalk);
      if (rng.chance(coilShare)) this.addAppendage(plant, axis, i, 'leaf_stalk_coil', at, normalize(add(scale(away, -1), scale(side, 0.35))), rng.range(...stalkM), true);
    }
  }

  /**
   * How many of something set at intervals fall on the stretch of stem that
   * ends at point `i`, as distances back from that point.
   */
  private spaced(plant: Plant, axis: Axis, salt: number, state: Spacing, spacing: readonly [number, number], seg: number): number[] {
    state.sinceM += seg;
    const out: number[] = [];
    while (out.length < 64) {
      // each interval is drawn once, from where the axis starts and how many have gone before
      if (state.nextM === null) state.nextM = Math.max(0.002, this.at(plant, axis.contact[0]!, salt + 7919 * state.count).range(spacing[0], spacing[1]));
      if (state.sinceM < state.nextM) break;
      state.sinceM -= state.nextM;
      state.nextM = null;
      state.count++;
      out.push(Math.min(seg, state.sinceM));
    }
    return out;
  }

  /**
   * What stands along a stem whatever its leaves do: prickles on every stem
   * of a plant that has them, and patches of clinging rootlets where the shoot
   * holds a stretch by itself, on the side that touches the timber.
   */
  private alongStem(plant: Plant, axis: Axis, i: number, seg: number): void {
    const { model } = this.taxon(plant);
    const a = axis.contact[i - 1]!;
    const b = axis.contact[i]!;
    const away = axis.away[i]!;
    const supported = length(away) > 0.5;

    const prickleEvery = known(model, 'appendages.prickleSpacingM');
    const prickleM = known(model, 'appendages.prickleLengthM');
    if (prickleEvery && prickleM && prickleEvery[1] > 0 && prickleM[1] > 0) {
      const t = this.tangent(axis, i);
      for (const back of this.spaced(plant, axis, SALT.prickle, axis.prickles, prickleEvery, seg)) {
        const p = seg > 0 ? lerp(b, a, back / seg) : b;
        const rng = this.at(plant, p, SALT.prickle);
        // outwards, on any side but the one against the support, and hooked back a little towards the base
        const out = supported ? away : anyPerpendicular(t);
        const across = normalize(cross(t, out));
        const turn = rng.range(-1, 1) * (supported ? 0.45 : 1) * Math.PI;
        const dir = normalize(add(add(scale(out, Math.cos(turn)), scale(across, Math.sin(turn))), scale(t, -0.3)));
        this.addAppendage(plant, axis, i, 'prickle', p, dir, rng.range(...prickleM), false);
      }
    }

    const rootEvery = known(model, 'appendages.aerialRootPatchSpacingM');
    const rootM = known(model, 'appendages.aerialRootLengthM');
    if (rootEvery && rootM && rootEvery[1] > 0 && rootM[1] > 0) {
      if (!supported || !this.holdsItself(axis)) {
        // rootlets form against a surface; a shoot in the air, or one a gardener tied, starts again when it next clings
        axis.rootlets.sinceM = 0;
        return;
      }
      for (const back of this.spaced(plant, axis, SALT.rootlets, axis.rootlets, rootEvery, seg)) {
        const p = seg > 0 ? lerp(b, a, back / seg) : b;
        this.addAppendage(plant, axis, i, 'aerial_roots', p, scale(away, -1), this.at(plant, p, SALT.rootlets).range(...rootM), true);
      }
    }
  }

  /** How many stems an edge will carry before the next looks elsewhere. */
  private capacity(edge: SupportEdge, model: GrowthModel): number {
    const primary = edge.host.type === 'member' && this.tierOf.get(edge.host.id) === 'primary';
    return param(model, primary ? 'architecture.maxStemsPerPrimaryMember' : 'architecture.maxStemsPerRoute');
  }

  /**
   * At a node, pick the member or cable to follow next and take hold of it.
   * Returns false when the shoot stops here; the reason is logged either way.
   */
  private chooseNext(plant: Plant, axis: Axis, nodeId: string, came: string | null): boolean {
    const { profile, model } = this.taxon(plant);
    const { graph } = this.scenario.bower;
    const here = graph.nodes.get(nodeId)!.position;
    const arriving = came && axis.contact.length > 1 ? this.tangent(axis, axis.contact.length - 1) : null;
    const limit = model.params['attachment.maxGraspDiameterMm'];
    const refused: Record<string, number> = {};
    const refuse = (why: string) => {
      refused[why] = (refused[why] ?? 0) + 1;
    };

    let best: { edge: SupportEdge; mode: 'twine' | 'along'; tied: boolean; cost: number; dy: number; n: number } | null = null;
    for (const edge of graph.edgesAt(nodeId)) {
      if (edge.id === came) continue;
      if (axis.used.has(edge.id)) {
        refuse('already travelled');
        continue;
      }
      if (axis.avoid.has(edge.id)) {
        refuse('taken by the shoot that bears this one');
        continue;
      }
      const n = this.stemsOn(edge.id, axis);
      if (n >= this.capacity(edge, model)) {
        refuse('already full of stems');
        continue;
      }
      const verdict = assessAttachment(profile.attachment.mechanism, edge, limit);
      const subLattice = edge.host.type === 'member' && this.tierOf.get(edge.host.id) === 'sub_lattice';
      let mode: 'twine' | 'along';
      let tied = false;
      if (verdict.outcome === 'self') {
        // a gardener who is training a twiner lays its framework flat along the lattice instead of letting it coil;
        // a plant that clings or clasps by itself is left to
        tied = profile.attachment.mechanism === 'stem_twining' && plant.training.tieToTimber && subLattice && axis.role !== 'whip';
        mode = tied || profile.attachment.mechanism !== 'stem_twining' ? 'along' : 'twine';
      } else if ((verdict.outcome === 'needs_tie' || verdict.outcome === 'unverified') && plant.training.tieToTimber && axis.role !== 'whip') {
        tied = true;
        mode = 'along';
      } else {
        // give the reason in the plant's own terms: a twiner's is not a rose's
        refuse(verdict.outcome === 'impossible' ? 'a declared exclusion' : verdict.outcome === 'unverified' ? 'cannot be shown to grasp it, and nobody ties it in' : `${verdict.reason.split(';')[0]}, and nobody ties it in`);
        continue;
      }
      const other = graph.nodes.get(graph.otherEnd(edge, nodeId))!.position;
      const dy = other.z - here.z;
      // shoots make height readily, run level willingly, and go downhill hardly at all
      let cost = n * param(model, 'routing.occupancyCost') + (dy < 0 ? -dy * param(model, 'routing.downhillCostPerM') : -dy * param(model, 'routing.uphillBonusPerM')) + (axis.role === 'whip' ? this.at(plant, other, HOLD_SALT.route) : plant.rng.arch).range(0, param(model, 'routing.noise'));
      if (arriving && dot(arriving, normalize(sub(other, here))) > 0.9) cost -= param(model, 'routing.straightOnBonus');
      if (axis.intent === 'tier' && Math.abs(dy) < 0.06) cost -= param(model, 'routing.tierBonus');
      if (axis.intent === 'riser' && dy > 0.02) cost -= param(model, 'routing.riserBonus');
      if (cost < param(model, 'routing.giveUpCost') && (!best || cost < best.cost)) best = { edge, mode, tied, cost, dy, n };
      else if (cost >= param(model, 'routing.giveUpCost')) refuse('leads too far downhill');
    }

    this.scheduleLateral(plant, axis, nodeId, came, best?.edge.id ?? null, best?.dy ?? 0);
    axis.avoid.clear();

    if (!best) {
      const why = Object.entries(refused).map(([k, v]) => `${v} ${k}`);
      axis.tip = { state: 'stopped', reason: `no way on from ${nodeId}`, retry: { nodeId, came } };
      this.note('no_route', plant, axis, `stopped at ${nodeId}: no way on${why.length ? ` (${why.join('; ')})` : ' (the structure ends here)'}`);
      return false;
    }

    const { edge, mode, tied } = best;
    const reverse = edge.from !== nodeId;
    const lane = this.laneOn(edge, axis, model, best.n);
    const path =
      mode === 'twine'
        ? twinePath(edge, {
            reverse,
            // where a taxon's handedness is not known the model has to pick one to draw at all
            handedness: profile.attachment.handedness?.value ?? 'right_handed',
            minPitchM: param(model, 'attachment.minPitchM'),
            pitchPerCircumference: param(model, 'attachment.pitchPerCircumference'),
            // stems rising together from the ground start at different places round the leg;
            // one joining a support that is already coiled runs ahead of the first in mid-span
            ...(came === null && axis.parent === null ? { startAdvance: (lane * 2 * Math.PI) / 3 } : { bulge: lane * 0.9 }),
          })
        : liePath(edge, { reverse, sideOffsetM: lane === 0 ? 0 : lane % 2 ? LANE_M * Math.ceil(lane / 2) : -LANE_M * Math.ceil(lane / 2) });
    const toNode = graph.otherEnd(edge, nodeId);
    axis.runs.push({ edgeId: edge.id, fromNode: nodeId, toNode, mode, status: tied ? 'trained_by_human' : 'grasped', by: tied ? (plant.training.by ?? 'gardener') : 'plant', day: this.day, firstPoint: axis.contact.length - 1, lastPoint: axis.contact.length - 1 });
    axis.used.add(edge.id);
    this.enter(edge.id, axis);
    axis.tip = { state: 'on_route', edgeId: edge.id, toNode, path, d: 0, emitted: 0, run: axis.runs.length - 1 };

    const what = edge.kind === 'cable' ? 'cable' : this.tierOf.get(edge.host.id) === 'primary' ? 'glulam' : 'timber lattice';
    const how = tied ? 'tied along it by the gardener' : mode === 'twine' ? 'twining it unaided' : 'holding it unaided';
    const slope = Math.abs(best.dy) < 0.06 ? 'level' : best.dy > 0 ? `rising ${best.dy.toFixed(2)} m` : `falling ${(-best.dy).toFixed(2)} m`;
    this.note(tied ? 'tied' : 'route_chosen', plant, axis, `at ${nodeId} took ${edge.id} (${what}, ${slope}, ${best.n} stem${best.n === 1 ? '' : 's'} already on it), ${how}`);

    if (axis.intent === 'riser' && graph.nodes.get(toNode)!.position.z > this.topZ * 0.985) axis.intent = 'tier';
    else if (axis.intent !== 'free' && plant.rng.arch.chance(param(model, 'routing.roleDropChance'))) axis.intent = 'free';
    return true;
  }

  /** A bud at a node the shoot has just passed may break in a later spring and take a member its parent did not. */
  private scheduleLateral(plant: Plant, axis: Axis, nodeId: string, came: string | null, leaving: string | null, leavingDy: number): void {
    const { model } = this.taxon(plant);
    if (axis.role === 'whip' || axis.role === 'spur') return;
    if (axis.order >= param(model, 'architecture.maxBranchOrder')) return;
    const pointIndex = axis.contact.length - 1;
    if (pointIndex < 3) return;
    if (!plant.rng.arch.chance(listAt(model, 'architecture.lateralChanceByParentOrder', axis.order))) return;
    const year = this.calendar.dateOf(this.day).year;
    let breakYear = year + 1;
    if (plant.rng.arch.chance(param(model, 'architecture.budExtraDormancyChance'))) breakYear += plant.rng.arch.int(...param(model, 'architecture.budExtraDormancyYears'));
    const intent: Intent = leaving && leavingDy > 0.06 ? 'tier' : 'riser';
    plant.pendingLaterals.push({ parentId: axis.id, pointIndex, nodeId, breakYear, order: axis.order + 1, avoid: [came, leaving].filter((x): x is string => !!x), intent });
  }

  // =========================================================================
  // A shoot in the air: its own weight, the light, and a support within reach
  // (the mechanics, and what they simplify, are in free-shoot.ts)
  // =========================================================================
  private get surroundings(): Surroundings {
    return (this.around ??= new Surroundings(this.scenario.bower));
  }

  /** Say once, on planting day, which numbers of its unsupported shoots this plant is drawn with for want of its own. */
  private noteGenericShoot(plant: Plant): void {
    const { profile, model } = this.taxon(plant);
    const generic = genericShootKeys(model);
    if (!generic.length) return;
    this.note('generic_shoot', plant, null, `the shoots of ${profile.names.label} that stand clear of the structure are drawn with the generic shoot of a woody climber, not its own: its growth model gives no value for ${generic.join(', ')}. How far they stand out, where they droop and what they reach are not findings about this plant`);
  }

  /**
   * Which way the light is from a place, for a shoot of this plant: the
   * scenario's answer where it gives one, then the light model's, then the
   * open sky of the site (light-from.ts).
   */
  private lightFor(plant: Plant, at: Vec3): Vec3 {
    const date = this.calendar.dateOf(this.day);
    const given = this.scenario.lightFrom;
    if (given) {
      this.lightAsked.scenario++;
      return given(at, date.dayOfYear);
    }
    const read = this.light.from(plant, at, date);
    if (read) {
      this.lightAsked.lightModel++;
      return read;
    }
    this.lightAsked.openSky++;
    return (this.openSky ??= openSkyLight(this.light.site))(at, date.dayOfYear);
  }

  /**
   * The rod the mechanics solve for a shoot in the air, with the length about
   * to be laid as its last segment: how stiff each joint is today, and what
   * hangs at the far end of each segment.
   */
  private rodOf(plant: Plant, axis: Axis, shoot: FreeShoot): Rod {
    const { model } = this.taxon(plant);
    const m = shoot.lengthM.length;
    const green = shootParam(model, 'mechanics.greenShootModulusMPa');
    const wood = shootParam(model, 'mechanics.woodModulusMPa');
    const setDays = shootParam(model, 'mechanics.woodSetDays');
    const density = shootParam(model, 'mechanics.stemFreshDensityKgM3');
    const compliance = new Array<number>(m);
    const load = new Array<number>(m).fill(0);
    for (let k = 0; k < m; k++) {
      // the joint at the near end of segment k is point basePoint + k of the axis
      const i = shoot.basePoint + k;
      const r = axis.radiusMm[i]! / 1000;
      compliance[k] = shoot.lengthM[k]! / (modulusPa(this.day - axis.bornDayAt[i]!, green, wood, setDays) * secondMomentM4(r));
      // the stem's own weight, half of each segment to each of its ends; the half at the base rests on the support
      const half = (density * GRAVITY * Math.PI * r * r * shoot.lengthM[k]!) / 2;
      load[k]! += half;
      if (k > 0) load[k - 1]! += half;
    }
    // what stands at point p hangs at the far end of segment p - basePoint - 1
    const hang = (pointIndex: number, kg: number) => {
      const k = pointIndex - shoot.basePoint - 1;
      if (k >= 0 && k < m) load[k]! += kg * GRAVITY;
    };
    const leafKgM2 = shootParam(model, 'mechanics.leafFreshMassPerAreaKgM2');
    for (const leaf of this.leavesByAxis.get(axis.id) ?? []) if (leaf.removedDay === null) hang(leaf.pointIndex, leafSilhouetteAreaM2(leaf.lengthM) * leafKgM2);
    const flowerKg = shootParam(model, 'mechanics.inflorescenceFreshMassKg');
    for (const bud of this.budsByAxis.get(axis.id) ?? []) {
      if (bud.end !== null || bud.stage === 'spent') continue;
      // an inflorescence weighs from the day it begins to lengthen
      if (bud.stage === 'open' || (bud.stage === 'developing' && bud.developDay >= 0 && this.day >= bud.developDay)) hang(bud.pointIndex ?? axis.alive - 1, flowerKg);
    }
    const fruitKg = shootParam(model, 'mechanics.fruitFreshMassKg');
    for (const fruit of this.fruitsByAxis.get(axis.id) ?? []) {
      if (fruit.removedDay !== null) continue;
      hang(fruit.pointIndex, fruitKg * Math.min(1, Math.max(0, (this.day - fruit.swell[0]) / Math.max(1, fruit.swell[1] - fruit.swell[0]))));
    }
    return { baseIncline: shoot.baseIncline, lengthM: shoot.lengthM, turn: shoot.turn, compliance, load };
  }

  /**
   * Lay the next length of a shoot that is not on a support, in the direction
   * its mechanics give its tip today. Returns the length laid: nothing where
   * the shoot stopped, or took hold of a support (its tip is then on that
   * route, and `advance` carries on along it).
   *
   * As grown: what is already laid is not moved. See free-shoot.ts for what
   * that leaves out.
   */
  private growFree(plant: Plant, axis: Axis, tip: Extract<Tip, { state: 'free' }>, go: number): number {
    const { profile, model } = this.taxon(plant);
    const n = axis.contact.length;
    const last = axis.contact[n - 1]!;
    const shoot = (tip.rod ??= startFreeShoot(n - 1, tip.dir));
    const radiusM = axis.radiusMm[n - 1]! / 1000;
    // a flowering side shoot stands free by nature; every other shoot in the air is looking for a support
    const searcher = axis.role !== 'side_shoot';
    if (searcher && this.takeHold(plant, axis, shoot, last, tip.dir)) return 0;

    // its small wanderings: three numbers from the plant's organ stream for each length laid, as there always were;
    // a side shoot's come from where it is, and draw on no stream
    const w = searcher ? plant.rng.organ : this.at(plant, last, SALT.sideShootGrowth);
    const wander = v3(w.range(-0.03, 0.03), w.range(-0.03, 0.03), (w.range(0.6, 1.4) - 1) * 0.075);

    let dir: Vec3;
    if (shoot.posture === 'plumb') dir = normalize(v3(wander.x, wander.y, -1));
    else {
      // while it holds itself up, its growing end steers towards up and the light
      let heading = tip.dir;
      if (shoot.posture === 'self_supporting') {
        if (!shoot.light || tip.grownM - shoot.lightAskedAtM >= LIGHT_EVERY_M) {
          shoot.light = this.lightFor(plant, last);
          shoot.lightAskedAtM = tip.grownM;
        }
        heading = steer(heading, seekDirection(shoot.light, shootParam(model, 'tropism.lightShare')), shootParam(model, 'tropism.turnPerM'), go);
      }
      const turned = replane(normalize(add(heading, wander)), shoot.plane);
      shoot.plane = turned.plane;
      shoot.lengthM.push(go);
      shoot.turn.push(turned.incline - shoot.incline);
      // then its weight has its say: the tip of the rod, with this length on it, points where the mechanics put it
      const solved = solveRod(this.rodOf(plant, axis, shoot), shoot.baseMoment);
      shoot.baseMoment = solved.baseMoment;
      let incline = solved.tipIncline;
      if (!solved.found) incline = Math.PI;
      const side = incline < 0 ? -1 : 1;
      const sag = side * (incline - solved.unloadedIncline);
      if (!solved.found || Math.abs(incline) >= PLUMB_RAD) shoot.posture = 'plumb';
      // below the level, and above it but for its weight: it can no longer hold itself out
      else if (shoot.posture === 'self_supporting' && Math.abs(incline) > Math.PI / 2 && Math.abs(incline) - sag <= Math.PI / 2) shoot.posture = 'pendulous';
      shoot.incline = incline;
      dir = directionAt(incline, shoot.plane);
    }

    const from = n === 1 ? addScaled(last, axis.away[0]!, axis.radiusMm[0]! / 1000) : last;
    let to = addScaled(from, dir, go);
    let laid = go;
    let stop: string | null = null;

    // not through the timber: it turns aside along the member or cable, and stops where it cannot
    const hit = this.surroundings.enters(from, to, radiusM);
    if (hit) {
      const aside = addScaled(dir, hit.out, -dot(dir, hit.out));
      // a shoot that holds itself up can turn away from what it meets; one that hangs can only slide along it
      const ways = shoot.posture === 'self_supporting' ? [aside, add(aside, hit.out), hit.out] : [aside];
      const way = ways.map(normalize).find((d) => length(d) > 0.5 && !this.surroundings.enters(from, addScaled(from, d, go), radiusM));
      if (way) {
        dir = way;
        to = addScaled(from, dir, go);
        if (shoot.posture !== 'plumb') {
          // the timber has turned it: the rod is where it was let go
          const turned = replane(dir, shoot.plane);
          shoot.turn[shoot.turn.length - 1]! += turned.incline - shoot.incline;
          shoot.incline = turned.incline;
          shoot.plane = turned.plane;
        }
      } else {
        laid = 0;
        stop = shoot.posture === 'self_supporting' ? `came up against ${hit.hostId} and could not pass it` : `came to rest on ${hit.hostId}`;
      }
    }
    // not below the ground: it stops where it touches down
    if (!stop && to.z < radiusM) {
      laid = dir.z < 0 ? Math.min(go, Math.max(0, (from.z - radiusM) / -dir.z)) : 0;
      to = addScaled(from, dir, laid);
      stop = 'reached the ground';
    }
    if (laid > 1e-6) {
      tip.dir = dir;
      tip.grownM += laid;
      this.appendPoint(plant, axis, to, ZERO);
    } else laid = 0;

    // held out as far as shoots of its kind are known to hold themselves: it grows no further
    const reach = shootParam(model, 'mechanics.searcherReachM');
    if (!stop && shoot.posture === 'self_supporting' && distance(to, axis.contact[shoot.basePoint]!) >= reach) stop = `held itself out ${reach.toFixed(2)} m from where it left its support, which is as far as the growth model lets a shoot of ${profile.names.label} hold itself`;
    if (stop) {
      axis.tip = { state: 'stopped', reason: stop };
      this.note('stopped', plant, axis, `a shoot in the air ${stop}, ${this.lengthOf(axis).toFixed(2)} m long`);
    }
    return laid;
  }

  /**
   * A searching shoot whose tip has come within reach of a stretch of route
   * it can grasp by itself takes hold there and grows on as supported growth.
   * This is how a climber crosses a gap, so a support that was already within
   * reach where the shoot set out does not count: whether a bud at a node
   * takes a member beside it is the framework's decision (`chooseNext`), not
   * this one. A shoot in the air is never tied in; what it cannot grasp
   * unaided it passes, and a member that is full (`stemsOn`) it passes too.
   * Nothing here is drawn from a random stream.
   */
  private takeHold(plant: Plant, axis: Axis, shoot: FreeShoot, tipAt: Vec3, heading: Vec3): boolean {
    const { profile, model } = this.taxon(plant);
    const reach = shootParam(model, 'attachment.graspReachM');
    if (reach <= 0 || axis.contact.length - 1 === shoot.basePoint) return false;
    const mechanism = profile.attachment.mechanism;
    const limit = model.params['attachment.maxGraspDiameterMm'];
    const near = this.surroundings.routesNear(tipAt, reach);
    if (!near.length) return false;
    const behind = (shoot.leftBehind ??= new Set(this.surroundings.routesNear(axis.contact[shoot.basePoint]!, reach).map((r) => r.edge.id)));
    for (const { edge, along } of near) {
      if (axis.used.has(edge.id) || behind.has(edge.id)) continue;
      const already = (this.occupancy.get(edge.id)?.length ?? 0) + (this.holds.get(edge.id)?.length ?? 0);
      if (already >= this.capacity(edge, model)) continue;
      if (assessAttachment(mechanism, edge, limit).outcome !== 'self') continue;
      this.tookHold.add(axis.id);
      const lane = this.laneOn(edge, axis, model, already);

      // which way along it: the way the shoot is heading, and upwards where that does not decide
      const reverse = dot(heading, along) * 0.5 + along.z < 0;
      const mode = mechanism === 'stem_twining' ? 'twine' : 'along';
      const path =
        mode === 'twine'
          ? twinePath(edge, { reverse, handedness: profile.attachment.handedness?.value ?? 'right_handed', minPitchM: param(model, 'attachment.minPitchM'), pitchPerCircumference: param(model, 'attachment.pitchPerCircumference'), bulge: lane * 0.9 })
          : liePath(edge, { reverse, sideOffsetM: lane === 0 ? 0 : lane % 2 ? LANE_M * Math.ceil(lane / 2) : -LANE_M * Math.ceil(lane / 2) });
      let nearest = 0;
      let least = Infinity;
      for (let j = 0; j < path.points.length; j++) {
        const d = distance(path.points[j]!, tipAt);
        if (d < least) {
          least = d;
          nearest = j;
        }
      }
      const d0 = path.cumulative[nearest]!;
      const toNode = reverse ? edge.from : edge.to;
      // the tip swings in and touches
      this.appendPoint(plant, axis, path.points[nearest]!, path.away[nearest]!);
      const at = axis.contact.length - 1;
      axis.runs.push({ edgeId: edge.id, fromNode: reverse ? edge.to : edge.from, toNode, mode, status: 'contacted', by: 'plant', day: this.day, firstPoint: at, lastPoint: at });
      axis.used.add(edge.id);
      this.enter(edge.id, axis);
      axis.tip = { state: 'on_route', edgeId: edge.id, toNode, path, d: d0, emitted: d0, run: axis.runs.length - 1 };
      this.newHolds.add(axis.id);
      const what = edge.kind === 'cable' ? 'cable' : this.tierOf.get(edge.host.id) === 'primary' ? 'glulam' : 'timber lattice';
      this.note('attached', plant, axis, `a shoot in the air, ${this.lengthOf(axis).toFixed(2)} m long, came within ${reach.toFixed(2)} m of ${edge.id} (${what}, ${already} stem${already === 1 ? '' : 's'} already on it) and took hold, ${mode === 'twine' ? 'twining it' : 'holding it'} unaided`);
      return true;
    }
    return false;
  }

  /**
   * How many stems a shoot finds on a stretch of route when it comes to it.
   *
   * The framework counts the framework: leaders and laterals, which came on
   * to their supports from nodes. A shoot that took hold from the air counts
   * everything, itself and its like included, so it never takes a member that
   * is full. The two are kept apart on purpose. A shoot of the year is not
   * framework: were its holds to use up the framework's room, more or longer
   * shoots of the year would reroute the framework, and two runs could no
   * longer be compared for what a cut or a change of leaf did. The price is
   * that a member can carry, for as long as such a shoot lasts, a stem more
   * than its stated capacity where framework arrives after it.
   */
  private stemsOn(edgeId: string, axis: Axis): number {
    const framework = this.occupancy.get(edgeId)?.length ?? 0;
    return this.tookHold.has(axis.id) ? framework + (this.holds.get(edgeId)?.length ?? 0) : framework;
  }

  /** The lane a stem takes on a stretch of route: the framework's lanes first, shoots from the air beyond them, so that no two share one. */
  private laneOn(edge: SupportEdge, axis: Axis, model: GrowthModel, counted: number): number {
    return this.tookHold.has(axis.id) ? this.capacity(edge, model) + (this.holds.get(edge.id)?.length ?? 0) : counted;
  }

  /** Enter a stem on a stretch of route it has just taken. */
  private enter(edgeId: string, axis: Axis): void {
    const map = this.tookHold.has(axis.id) ? this.holds : this.occupancy;
    const on = map.get(edgeId);
    if (on) on.push(axis.id);
    else map.set(edgeId, [axis.id]);
  }

  /**
   * Whether a cut has left a hold that a shoot took from the air with less
   * than a coil of stem on the support: such a stub holds nothing, and gives
   * the member's room back. A stem that grew on to the support from a node,
   * as all framework does, keeps its place however short it is cut.
   */
  private barelyHeld(axis: Axis, run: Run): boolean {
    if (run.firstPoint === 0 || length(axis.away[run.firstPoint - 1]!) > 0.5) return false;
    const coil = param(this.taxon(this.plants.get(axis.plantId)!).model, 'attachment.minPitchM');
    return axis.lengthAt[run.lastPoint]! - axis.lengthAt[run.firstPoint]! < coil;
  }

  /**
   * A support just touched (`contacted`) is grasped once a coil's length of
   * stem lies along it, or the shoot has gone on from it to another.
   */
  private settleHold(plant: Plant, axis: Axis): void {
    const coil = param(this.taxon(plant).model, 'attachment.minPitchM');
    let waiting = false;
    axis.runs.forEach((run, k) => {
      if (run.status !== 'contacted') return;
      if (k < axis.runs.length - 1 || axis.lengthAt[Math.min(run.lastPoint, axis.alive - 1)]! - axis.lengthAt[Math.min(run.firstPoint, axis.alive - 1)]! >= coil) run.status = 'grasped';
      else waiting = true;
    });
    if (!waiting) this.newHolds.delete(axis.id);
  }

  // =========================================================================
  // Seasonal: what the start of a growing season sets going
  // =========================================================================
  private startSeason(plant: Plant, date: CalendarDate): void {
    plant.seasonStarted = date.year;
    const { model } = this.taxon(plant);
    const year = date.year;
    const season = year - plant.plantedYear;

    // last year's flower buds wake, each with its own day to open and to drop
    for (const b of this.liveBuds(plant)) {
      if (b.stage === 'dormant' && b.floweringYear === year) {
        b.stage = 'developing';
        b.developDay = this.day;
        b.openPlannedDay = this.calendar.dayOfYearDay(year, plant.rng.flower.int(...param(model, 'phenology.flowerOpenDoy')));
        b.spentPlannedDay = this.calendar.dayOfYearDay(year, plant.rng.flower.int(...param(model, 'phenology.petalFallDoy')));
      }
    }

    // further trunk stems start in the seasons the model gives them
    const starts = param(model, 'architecture.trunkStemStartYears');
    // stems of a plant that has since died and been replaced do not count
    const leaders = plant.axisIds.filter((id) => this.axes.get(id)!.role === 'leader' && this.axes.get(id)!.bornYear >= plant.plantedYear).length;
    if (leaders > 0) {
      starts.forEach((s, i) => {
        if (i >= leaders && s === season) this.newTrunkStem(plant, i);
      });
    }

    // stubs left by a hard prune shoot again from just below the cut
    const stubs = plant.pendingRegrowth;
    plant.pendingRegrowth = [];
    for (const id of stubs) this.regrow(plant, this.axes.get(id)!);

    // buds left at nodes in earlier years break
    const due = plant.pendingLaterals.filter((b) => b.breakYear <= year);
    plant.pendingLaterals = plant.pendingLaterals.filter((b) => b.breakYear > year);
    for (const b of due) {
      const parent = this.axes.get(b.parentId)!;
      if (parent.removedDay !== null || b.pointIndex >= parent.alive) continue;
      const lat = this.newAxis(
        plant,
        'lateral',
        b.order,
        { axisId: parent.id, pointIndex: b.pointIndex },
        listAt(model, 'architecture.lateralLengthMByOrder', b.order - 1) * (1 + plant.rng.arch.range(-1, 1) * param(model, 'architecture.lateralLengthSpread')),
        listAt(model, 'extension.lateralMPerSeasonByOrder', b.order - 1),
      );
      lat.intent = b.intent;
      for (const e of b.avoid) lat.avoid.add(e);
      lat.tip = { state: 'at_node', nodeId: b.nodeId, came: null };
      this.appendPoint(plant, lat, parent.contact[b.pointIndex]!, parent.away[b.pointIndex]!);
      this.note('lateral_broke', plant, lat, `a bud at ${b.nodeId} on ${parent.id} broke into a lateral of order ${b.order}`);
    }

    const clear = param(model, 'organs.clearStemHeightM');
    const framework = (n: (typeof plant.leafNodes)[number]) => {
      const host = this.axes.get(n.axisId)!;
      if (host.removedDay !== null || n.pointIndex >= host.alive) return null;
      if (host.role !== 'leader' && host.role !== 'lateral') return null;
      return host.contact[n.pointIndex]!.z >= clear ? host : null;
    };

    // last year's leaf nodes may carry a spur from now on
    for (const n of plant.leafNodes) {
      if (n.year !== year - 1) continue;
      const host = n.taken ? null : framework(n);
      if (!host || !plant.rng.organ.chance(param(model, 'organs.spurChance'))) continue;
      n.taken = true;
      this.newSpur(plant, host, n.pointIndex, n.side);
    }

    // a share of older nodes, with or without a spur, throw a long whip this year
    const hosts = plant.leafNodes.filter((n) => n.year < year && framework(n));
    const count = Math.min(param(model, 'organs.whipsPerYearMax'), Math.round(hosts.length * param(model, 'organs.whipShareOfNodes')));
    const seasonDays = param(model, 'phenology.growthEndDoy') - param(model, 'phenology.budburstDoy');
    const thisYear = new Set<(typeof hosts)[number]>();
    for (let k = 0; k < count && hosts.length; k++) {
      const n = plant.rng.organ.pick(hosts);
      if (thisYear.has(n)) continue;
      thisYear.add(n);
      plant.pendingWhips.push({ hostId: n.axisId, pointIndex: n.pointIndex, startDay: this.day + Math.round(plant.rng.organ.range(0.06, 0.4) * seasonDays), planM: plant.rng.organ.range(...param(model, 'organs.whipLengthM')) });
    }

    // last, and drawing nothing from the plant's streams: side shoots that have had their time go, and new ones start
    this.sideShootSeason(plant, date);
  }

  // =========================================================================
  // Flowering side shoots
  // =========================================================================
  /** The numbers a taxon's flowering side shoots need, or null where its model gives none or says it makes none. */
  private sideShootRule(model: GrowthModel): { ageYears: number; perNode: number; lengthM: [number, number]; seasons: number; terminalShare: number } | null {
    const ageYears = known(model, 'sideShoots.bearingWoodAgeYears');
    const perM = known(model, 'sideShoots.perMetrePerYear');
    const lengthM = known(model, 'sideShoots.lengthM');
    const seasons = known(model, 'sideShoots.lifespanYears');
    const terminalShare = known(model, 'sideShoots.terminalFlowerShare');
    if (ageYears === null || perM === null || lengthM === null || seasons === null || terminalShare === null) return null;
    if (perM <= 0 || lengthM[1] <= 0) return null;
    // side shoots break from leaf nodes, so a rate for each metre of stem is a chance at each node
    return { ageYears, perNode: Math.min(1, perM * mid(param(model, 'organs.leafSpacingM'))), lengthM, seasons: Math.max(1, seasons), terminalShare };
  }

  /**
   * Once a stretch of framework stem is old enough it throws short shoots that
   * stand clear of the support, carry leaves and end in the inflorescence.
   * Each lives the seasons its model gives it and is then shed; while it lives,
   * the node that bears it bears no other.
   */
  private sideShootSeason(plant: Plant, date: CalendarDate): void {
    const { profile, model } = this.taxon(plant);
    const year = date.year;

    // those whose last year is behind them are shed before growth starts, with their leaves and whatever fruit still hangs on them
    const old = plant.axisIds.map((id) => this.axes.get(id)!).filter((a) => a.role === 'side_shoot' && a.removedDay === null && a.lastYear !== null && a.lastYear < year);
    if (old.length) {
      const fx: EventRecord['effects'] = { axesCut: 0, axesRemoved: 0, stemRemovedM: 0, floralBudsRemoved: 0, leafSitesRemoved: 0 };
      const cause = `shed:${year}`;
      const stats = this.yearStats.get(plant.id)!;
      const lostToPruning = stats.lost;
      for (const a of old) this.removeAxis(a, cause, fx);
      // what the plant sheds was not pruned off
      stats.lost = lostToPruning;
      for (const b of this.buds) if (b.plantId === plant.id && b.endedBy === cause) b.end = 'aborted';
      this.note('shed', plant, null, `${old.length} flowering side shoot${old.length === 1 ? '' : 's'} of ${profile.names.label} had lived out ${old.length === 1 ? 'its' : 'their'} time and ${old.length === 1 ? 'was' : 'were'} shed`);
    }

    const rule = this.sideShootRule(model);
    if (!rule) return;
    const clear = param(model, 'organs.clearStemHeightM');
    const burst = param(model, 'phenology.budburstDoy');
    const end = param(model, 'phenology.growthEndDoy');
    const open0 = param(model, 'phenology.flowerOpenDoy')[0];
    // a shoot that is to flower this season has made its length by the time the first flowers open
    const share = open0 > burst && open0 <= end ? Math.max(0.05, smoothstep(burst, end, open0)) : 1;
    let made = 0;
    for (const n of plant.leafNodes) {
      if (n.taken || year - n.year < rule.ageYears) continue;
      const host = this.axes.get(n.axisId)!;
      if (host.removedDay !== null || n.pointIndex >= host.alive) continue;
      if (host.role !== 'leader' && host.role !== 'lateral') continue;
      const base = host.contact[n.pointIndex]!;
      if (base.z < clear) continue;
      if (n.sideShootId !== null) {
        if (this.axes.get(n.sideShootId)!.removedDay === null) continue;
        n.sideShootId = null;
      }
      const rng = this.at(plant, base, SALT.sideShoot + year);
      if (!rng.chance(rule.perNode)) continue;
      const planM = rng.range(...rule.lengthM);
      if (planM <= 0) continue;

      const shoot = this.newAxis(plant, 'side_shoot', host.order + 1, { axisId: host.id, pointIndex: n.pointIndex }, planM, planM / share, { nextLeafM: rng.range(...param(model, 'organs.leafSpacingM')), leafSide: n.side });
      shoot.lastYear = year + rule.seasons - 1;
      n.sideShootId = shoot.id;
      // out from the support, to the side the leaf stood on, and up a little
      const t = this.tangent(host, n.pointIndex);
      const out = length(host.away[n.pointIndex]!) > 0.5 ? host.away[n.pointIndex]! : UP;
      let side = cross(t, out);
      side = length(side) > 1e-6 ? scale(normalize(side), n.side) : v3(n.side, 0, 0);
      const dir = normalize(add(add(add(scale(out, rng.range(0.7, 1)), scale(side, rng.range(0.2, 0.7))), scale(UP, rng.range(0.1, 0.4))), scale(t, rng.range(-0.2, 0.3))));
      // it stands free of the support from its first point: no direction away from anything
      this.appendPoint(plant, shoot, base, ZERO);
      shoot.tip = { state: 'free', dir, grownM: 0, planM };
      made++;
    }
    if (made) this.note('side_shoots_broke', plant, null, `${made} flowering side shoot${made === 1 ? '' : 's'} broke from stems of ${profile.names.label} ${rule.ageYears} year${rule.ageYears === 1 ? '' : 's'} old or more`);
  }

  /**
   * Leaves along a side shoot. They are renewed every year the shoot lives,
   * as a spur's are, and are of the form the model names for side shoots.
   * No bud, spur or shoot of the plant's ordinary kinds forms at them.
   */
  private sideShootLeaves(plant: Plant, axis: Axis, i: number, seg: number): void {
    axis.sinceLeafM += seg;
    if (axis.sinceLeafM < axis.nextLeafM) return;
    const { model } = this.taxon(plant);
    const at = axis.contact[i]!;
    const rng = this.at(plant, at, SALT.sideShootLeaf);
    axis.sinceLeafM = 0;
    axis.nextLeafM = rng.range(...param(model, 'organs.leafSpacingM'));
    axis.leafSide = axis.leafSide === 1 ? -1 : 1;
    const year = this.calendar.dateOf(this.day).year;
    const t = this.tangent(axis, i);
    let side = cross(t, UP);
    side = length(side) > 1e-6 ? scale(normalize(side), axis.leafSide) : v3(axis.leafSide, 0, 0);
    const form = model.names.sideShootLeafForm ?? model.names.leafForm;
    this.addLeaf(plant, axis, i, normalize(add(add(scale(side, 0.75), scale(UP, 0.6)), scale(t, 0.3))), rng.range(...param(model, 'organs.leafLengthM')), year, null, form);
    if (param(model, 'organs.leavesPerNode') >= 2) {
      this.addLeaf(plant, axis, i, normalize(add(add(scale(side, -0.75), scale(UP, 0.6)), scale(t, 0.3))), rng.range(...param(model, 'organs.leafLengthM')), year, null, form);
    }
  }

  /**
   * Flower buds at the ends of side shoots, formed on the day the plant's
   * other flower buds form and opening in its next flowering window. A bud is
   * the plant's own: it goes with its shoot, and with the stem that bears the
   * shoot, if either is cut before it opens.
   */
  private budsOnSideShoots(plant: Plant, date: CalendarDate): void {
    const { model } = this.taxon(plant);
    const rule = this.sideShootRule(model);
    if (!rule || rule.terminalShare <= 0) return;
    const year = date.year;
    const [open0, open1] = param(model, 'phenology.flowerOpenDoy');
    const [fall0, fall1] = param(model, 'phenology.petalFallDoy');
    const lasts = param(model, 'phenology.flowerLastsDays');
    // an opening date earlier in the year than today means next year, as for flowers along the shoots
    const openYear = open0 >= date.dayOfYear ? year : year + 1;
    const fallYear = fall0 >= open0 ? openYear : openYear + 1;
    const ramp = openYear - plant.plantedYear - param(model, 'flowering.competenceYears');
    if (ramp < 0) return;
    const chance = Math.min(1, rule.terminalShare * listAt(model, 'flowering.maturityRamp', ramp));
    const form = model.names.sideShootFlowerForm ?? model.names.flowerForm;
    let shoots = 0;
    let made = 0;
    for (const id of plant.axisIds) {
      const a = this.axes.get(id)!;
      // only a shoot that will still be there when its flower opens
      if (a.role !== 'side_shoot' || a.removedDay !== null || a.alive < 2 || (a.lastYear ?? year) < openYear) continue;
      shoots++;
      const rng = this.at(plant, a.contact[0]!, SALT.sideShootBud + year);
      if (!rng.chance(chance)) continue;
      const opens = this.calendar.dayOfYearDay(openYear, rng.int(open0, open1));
      const drops = lasts[1] > 0 ? opens + rng.int(lasts[0], lasts[1]) : this.calendar.dayOfYearDay(fallYear, rng.int(fall0, fall1));
      this.newBud(plant, a, null, 'developing', openYear, Math.max(this.day, opens - 30), opens, Math.max(opens + 1, drops), { lengthM: rng.range(...param(model, 'organs.racemeLengthM')), form });
      made++;
    }
    if (!shoots) return;
    this.yearStats.get(plant.id)!.initiated += made;
    this.note('floral_initiated', plant, null, `${made} flower bud${made === 1 ? '' : 's'} formed at the ends of ${shoots} flowering side shoot${shoots === 1 ? '' : 's'}, to open from ${this.calendar.dateOf(this.calendar.dayOfYearDay(openYear, open0)).iso}`);
  }

  private newSpur(plant: Plant, host: Axis, i: number, side: 1 | -1): Axis {
    const { model } = this.taxon(plant);
    const len = plant.rng.organ.range(...param(model, 'organs.spurLengthM'));
    const t = this.tangent(host, i);
    const up = length(host.away[i]!) > 0.5 ? host.away[i]! : UP;
    let out = cross(t, up);
    out = length(out) > 1e-6 ? scale(normalize(out), side) : v3(side, 0, 0);
    const base = host.contact[i]!;
    // off the side of the member, then down, so that what it bears hangs clear
    const elbow = add(base, add(scale(out, len * 0.75), scale(up, 0.03)));
    const end = add(elbow, add(scale(out, len * 0.15), scale(UP, -len * 0.45)));
    const spur = this.newAxis(plant, 'spur', host.order + 1, { axisId: host.id, pointIndex: i }, len, 0);
    this.appendPoint(plant, spur, base, host.away[i]!);
    for (const f of [1 / 3, 2 / 3, 1]) {
      const a = (1 - f) * (1 - f);
      const b = 2 * f * (1 - f);
      const c = f * f;
      this.appendPoint(plant, spur, add(add(scale(base, a), scale(elbow, b)), scale(end, c)), ZERO);
    }
    spur.tip = { state: 'stopped', reason: 'a spur stays short' };
    this.spurLeaves(plant, spur, this.calendar.dateOf(this.day).year);
    return spur;
  }

  /** A spur carries a few leaves every year from now on. */
  private spurLeaves(plant: Plant, spur: Axis, fromYear: number): void {
    const { model } = this.taxon(plant);
    const n = plant.rng.organ.int(...param(model, 'organs.spurLeafCount'));
    const form = model.names.spurLeafForm ?? model.names.leafForm;
    for (let k = 0; k < n; k++) {
      const dir = normalize(v3(plant.rng.organ.range(-0.8, 0.8), plant.rng.organ.range(-0.8, 0.8), plant.rng.organ.range(0.45, 1)));
      this.addLeaf(plant, spur, 0, dir, plant.rng.organ.range(...param(model, 'organs.leafLengthM')) * 0.9, fromYear, null, form);
    }
  }

  private startWhip(plant: Plant, hostId: string, i: number, planM: number): void {
    const host = this.axes.get(hostId)!;
    if (host.removedDay !== null || i >= host.alive) return;
    const { model } = this.taxon(plant);
    const whip = this.newAxis(plant, 'whip', host.order + 1, { axisId: host.id, pointIndex: i }, planM, param(model, 'extension.whipMPerSeason'));
    const t = this.tangent(host, i);
    const up = length(host.away[i]!) > 0.5 ? host.away[i]! : UP;
    let side = cross(t, up);
    side = length(side) > 1e-6 ? normalize(side) : v3(1, 0, 0);
    const r = plant.rng.organ;
    const dir = normalize(add(add(add(scale(up, r.range(0.6, 1)), scale(t, r.range(-0.6, 0.6))), scale(side, r.range(-0.6, 0.6))), scale(UP, 0.5)));
    this.appendPoint(plant, whip, host.contact[i]!, host.away[i]!);
    whip.tip = { state: 'free', dir, grownM: 0, planM };
  }

  // =========================================================================
  // Seasonal: flower buds
  // =========================================================================
  /**
   * Which of the plant's own wood flowers decides everything that follows, so
   * each class has its own rule and none borrows another's.
   */
  private initiateFloralBuds(plant: Plant, date: CalendarDate): void {
    const { profile, model } = this.taxon(plant);
    const wood = profile.flowering.wood.value;
    // old-wood flowering comes in two kinds: on spurs, or along last summer's shoots once they have ripened
    if (wood === 'previous_season') {
      if (param(model, 'organs.spurChance') > 0) this.budsOnOldWood(plant, date);
      else this.budsAlongShoots(plant, date, true);
    } else if (wood === 'current_season') this.budsAlongShoots(plant, date, false);
    // a first flush from last year's stems, carried on by the growth of the year
    else if (wood === 'both') this.budsAlongShoots(plant, date, false, true);
    else if (date.year === plant.plantedYear) {
      this.note('not_modelled', plant, null, `no flowers are modelled for ${profile.names.label}: which of its wood flowers is not established`);
    }
    // a plant whose flowering wood is not known flowers nowhere, its side shoots included
    if (wood !== null) this.budsOnSideShoots(plant, date);
  }

  /**
   * Flowers that form along the shoots made this year.
   *
   * Current-season flowering opens them the same season, so a hard prune in
   * late winter costs nothing and a cut in early summer takes the flowers with
   * the shoots. Old-wood flowering without spurs (`ripened`) forms them in the
   * same way but opens them only after the growing season, in winter or the
   * following spring, by which time the wood that bears them is last year's:
   * a cut between forming and opening removes the whole display.
   *
   * A plant that flowers on both (`firstFlush`) also flowers from the nodes of
   * last year's stems that are still there, and those open first: a winter cut
   * costs it the early flowers and leaves the later ones.
   */
  private budsAlongShoots(plant: Plant, date: CalendarDate, ripened: boolean, firstFlush = false): void {
    const { model } = this.taxon(plant);
    const year = date.year;
    const [open0, open1] = param(model, 'phenology.flowerOpenDoy');
    const [fall0, fall1] = param(model, 'phenology.petalFallDoy');
    // an opening date earlier in the year than today means next year; a fall date earlier than the opening means the year after it
    const openYear = open0 >= date.dayOfYear ? year : year + 1;
    const fallYear = fall0 >= open0 ? openYear : openYear + 1;
    const lasts = param(model, 'phenology.flowerLastsDays');
    const ramp = year - plant.plantedYear - param(model, 'flowering.competenceYears');
    if (ramp < 0) return;
    const chance = Math.min(1, param(model, 'flowering.currentSeasonFlowersPerM') * listAt(model, 'flowering.maturityRamp', ramp) * mid(param(model, 'organs.leafSpacingM'))) * this.light.floweringFactor(plant, date);
    const minShoot = param(model, 'flowering.currentSeasonMinShootM');
    const jan1 = this.calendar.dayOfYearDay(year, 1);
    // how much of each axis was laid down this year
    const grown = new Map<string, number>();
    for (const id of plant.axisIds) {
      const a = this.axes.get(id)!;
      if (a.removedDay !== null || a.role === 'spur' || a.role === 'side_shoot' || a.alive < 2) continue;
      let first = a.alive;
      while (first > 0 && a.bornDayAt[first - 1]! >= jan1) first--;
      if (first < a.alive) grown.set(a.id, a.lengthAt[a.alive - 1]! - a.lengthAt[Math.max(0, first - 1)]!);
    }
    let made = 0;
    let early = 0;
    // where both kinds of wood flower, the old wood has the first third of the season and the new growth the rest
    const split = firstFlush ? open0 + Math.round((open1 - open0) / 3) : open0;
    for (const n of plant.leafNodes) {
      const old = firstFlush && n.year === year - 1;
      if (n.year !== year && !old) continue;
      const a = this.axes.get(n.axisId)!;
      const flowers = plant.rng.flower.chance(chance);
      if (!flowers || a.removedDay !== null || a.role === 'spur' || n.pointIndex >= a.alive) continue;
      if (!old && (grown.get(a.id) ?? 0) < minShoot) continue;
      if (old) early++;
      const opens = this.calendar.dayOfYearDay(openYear, old ? plant.rng.flower.int(open0, split) : plant.rng.flower.int(split, open1));
      // either each flower lasts its own few weeks, or the whole display falls together
      const drops = lasts[1] > 0 ? opens + plant.rng.flower.int(lasts[0], lasts[1]) : this.calendar.dayOfYearDay(fallYear, plant.rng.flower.int(fall0, fall1));
      // buds show for about a month before they open, or from now if that is sooner
      this.newBud(plant, a, n.pointIndex, 'developing', openYear, Math.max(this.day, opens - 30), opens, Math.max(opens + 1, drops), { form: old ? (model.names.firstFlushFlowerForm ?? model.names.flowerForm) : model.names.flowerForm });
      made++;
    }
    this.yearStats.get(plant.id)!.initiated += made;
    // growth made from now on forms buds as well
    const sameYear = openYear === year;
    const leadDays = sameYear ? Math.max(0, open0 - date.dayOfYear) : 0;
    plant.budding = {
      untilDay: sameYear ? this.calendar.dayOfYearDay(year, open1) - leadDays : this.calendar.dayOf(`${year}-12-31`),
      jan1Day: jan1,
      chance,
      minShootM: minShoot,
      openYear,
      fallYear,
      firstOpenDoy: split,
      lastOpenDoy: open1,
      leadDays,
      sameYear,
    };
    const where = firstFlush ? `${early} on last year's stems for the first flush and ${made - early} on this year's growth` : `on this year's growth`;
    this.note('floral_initiated', plant, null, `${made} flower bud${made === 1 ? '' : 's'} formed ${where} (${[...grown.values()].filter((g) => g >= minShoot).length} shoots long enough to flower); growth made from now on will form more${ripened ? `, to open from ${this.calendar.dateOf(this.calendar.dayOfYearDay(openYear, open0)).iso}: any cut before then takes them` : ''}`);
  }

  /**
   * A node made after the year's buds formed. It may carry a flower too, which
   * opens no sooner after the node appears than the first flowers of the year
   * opened after the first buds formed.
   */
  private lateBud(plant: Plant, axis: Axis, pointIndex: number): void {
    const f = plant.budding;
    if (!f || this.day > f.untilDay || axis.role === 'spur') return;
    if (!plant.rng.flower.chance(f.chance)) return;
    let first = axis.alive;
    while (first > 0 && axis.bornDayAt[first - 1]! >= f.jan1Day) first--;
    if (first >= axis.alive || axis.lengthAt[axis.alive - 1]! - axis.lengthAt[Math.max(0, first - 1)]! < f.minShootM) return;
    const from = f.sameYear ? Math.max(f.firstOpenDoy, this.calendar.dateOf(this.day).dayOfYear + f.leadDays) : f.firstOpenDoy;
    if (from > f.lastOpenDoy) return;
    const { model } = this.taxon(plant);
    const lasts = param(model, 'phenology.flowerLastsDays');
    const [fall0, fall1] = param(model, 'phenology.petalFallDoy');
    const opens = this.calendar.dayOfYearDay(f.openYear, plant.rng.flower.int(from, f.lastOpenDoy));
    const drops = lasts[1] > 0 ? opens + plant.rng.flower.int(lasts[0], lasts[1]) : this.calendar.dayOfYearDay(f.fallYear, plant.rng.flower.int(fall0, fall1));
    this.newBud(plant, axis, pointIndex, 'developing', f.openYear, Math.max(this.day, opens - 30), opens, Math.max(opens + 1, drops), { form: model.names.flowerForm });
    this.yearStats.get(plant.id)!.initiated++;
  }

  /**
   * `given.lengthM` fixes the length of the inflorescence; left out, it is
   * drawn from the plant's flower stream as it always was.
   */
  private newBud(plant: Plant, bearer: Axis, pointIndex: number | null, stage: FloralBud['stage'], floweringYear: number, developDay: number, openPlannedDay: number, spentPlannedDay: number, given: { lengthM?: number; form?: string | undefined } = {}): FloralBud {
    const { model } = this.taxon(plant);
    const bud: FloralBud = {
      id: `${plant.id}/bud${this.serial++}`,
      plantId: plant.id,
      axisId: bearer.id,
      pointIndex,
      fate: 'floral',
      stage,
      end: null,
      initiatedDay: this.day,
      floweringYear,
      openDay: null,
      spentDay: null,
      endedDay: null,
      endedBy: null,
      position: null,
      direction: null,
      lengthM: given.lengthM ?? plant.rng.flower.range(...param(model, 'organs.racemeLengthM')),
      developDay,
      openPlannedDay,
      spentPlannedDay,
    };
    if (given.form !== undefined) bud.form = given.form;
    this.buds.push(bud);
    const list = this.budsByAxis.get(bearer.id);
    if (list) list.push(bud);
    else this.budsByAxis.set(bearer.id, [bud]);
    return bud;
  }

  /**
   * Old-wood flowering on spurs (wisteria): a flower bud forms in late summer
   * on short wood, and must survive on it until spring.
   */
  private budsOnOldWood(plant: Plant, date: CalendarDate): void {
    const { model } = this.taxon(plant);
    const year = date.year;
    const ramp = year + 1 - plant.plantedYear - param(model, 'flowering.competenceYears');
    if (ramp < 0) return;
    const pruned = plant.summerPrunedYear === year;
    const chance = listAt(model, 'flowering.maturityRamp', ramp) * param(model, 'flowering.spurFloralChance') * (pruned ? 1 : param(model, 'flowering.unprunedFactor')) * this.light.floweringFactor(plant, date);
    let made = 0;
    let sites = 0;
    for (const id of plant.axisIds) {
      const a = this.axes.get(id)!;
      if (a.removedDay !== null) continue;
      // a flower bud needs short wood to sit on: a spur, or a shoot cut back this summer
      if (!(a.role === 'spur' || (a.role === 'whip' && a.summerPrunedYear === year))) continue;
      sites++;
      if (!plant.rng.flower.chance(chance)) continue;
      this.newBud(plant, a, null, 'initiated', year + 1, -1, -1, -1, { form: model.names.flowerForm });
      made++;
    }
    this.yearStats.get(plant.id)!.initiated += made;
    this.note('floral_initiated', plant, null, `${made} flower bud${made === 1 ? '' : 's'} formed on ${sites} spur${sites === 1 ? '' : 's'} and cut-back shoots for ${year + 1}${pruned ? '' : '; no summer pruning this year, so fewer than there could have been'}`);
  }

  private flowerDay(plant: Plant, date: CalendarDate): void {
    let opened = 0;
    for (const b of this.buds) {
      if (b.plantId !== plant.id || b.end !== null || b.stage === 'spent' || b.openPlannedDay < 0) continue;
      if (b.stage === 'developing' && this.day >= b.openPlannedDay) {
        const bearer = this.axes.get(b.axisId)!;
        b.stage = 'open';
        b.openDay = this.day;
        // a spur's raceme hangs from the end of the spur, wherever pruning has left that end;
        // a flower on the year's growth stands at its own node
        b.position = bearer.contact[b.pointIndex === null ? bearer.alive - 1 : b.pointIndex]!;
        b.direction = this.heldDirection(plant, this.taxon(plant).model.names.flowerHeld, bearer, b.pointIndex);
        opened++;
      } else if (b.stage === 'open' && this.day >= b.spentPlannedDay) {
        b.stage = 'spent';
        b.spentDay = this.day;
        this.setFruit(plant, b, date);
      }
    }
    if (opened) this.yearStats.get(plant.id)!.opened += opened;
  }

  /**
   * The direction an inflorescence or a fruit is held in from its place on a
   * stem: `pointIndex` null means the end of the stem. Null where it hangs, or
   * where the model does not say how it is held.
   */
  private heldDirection(plant: Plant, held: OrganHeld | undefined, bearer: Axis, pointIndex: number | null): Vec3 | null {
    if (held === undefined || held === 'hanging') return null;
    const i = pointIndex === null ? bearer.alive - 1 : pointIndex;
    const t = this.tangent(bearer, i);
    const away = bearer.away[i]!;
    const supported = length(away) > 0.5;
    if (held === 'upright') return normalize(add(UP, scale(supported ? away : ZERO, 0.25)));
    // facing out: at the end of a shoot it carries on the shoot's own line
    if (pointIndex === null) return t;
    // at a node, away from the support; on a shoot in the air, square off it on one side or the other
    const out = supported ? away : scale(anyPerpendicular(t), this.at(plant, bearer.contact[i]!, SALT.held).sign());
    return normalize(add(out, scale(UP, 0.35)));
  }

  // =========================================================================
  // Seasonal: fruit
  // =========================================================================
  /** The numbers fruit needs, or null where the model leaves any of them unknown or says that nothing sets. */
  private fruitRule(model: GrowthModel): { setShare: number; lengthM: [number, number]; swellDays: [number, number]; ripenDoy: [number, number]; fallDoy: [number, number] } | null {
    const setShare = known(model, 'fruit.setShare');
    const lengthM = known(model, 'fruit.lengthM');
    const swellDays = known(model, 'fruit.swellDays');
    const ripenDoy = known(model, 'fruit.ripenDoy');
    const fallDoy = known(model, 'fruit.fallDoy');
    if (!setShare || !lengthM || !swellDays || !ripenDoy || !fallDoy) return null;
    return { setShare, lengthM, swellDays, ripenDoy, fallDoy };
  }

  /**
   * A flower that has gone over on the plant may set. Fruit never comes from
   * the calendar: it needs a flower that formed, opened and was still on its
   * wood when its petals fell. What sets then swells, ripens in the taxon's
   * ripening window and falls in its fall window, unless its stem is cut first.
   */
  private setFruit(plant: Plant, bud: FloralBud, date: CalendarDate): void {
    const { model } = this.taxon(plant);
    const rule = this.fruitRule(model);
    if (!rule || !bud.position) return;
    const rng = this.at(plant, bud.position, SALT.fruit + bud.floweringYear);
    if (!rng.chance(rule.setShare)) return;
    const bearer = this.axes.get(bud.axisId)!;
    const cal = this.calendar;
    const full = this.day + Math.max(1, rng.int(...rule.swellDays));
    // ripening: the first window that is still open once the fruit is full grown
    const [r0, r1] = rule.ripenDoy;
    let ry = cal.dateOf(full).year;
    if (cal.dayOfYearDay(ry, r1) <= full) ry++;
    const w0 = Math.max(full, cal.dayOfYearDay(ry, r0));
    const w1 = Math.max(w0 + 1, cal.dayOfYearDay(ry, r1));
    const ripens = rng.int(w0, w1 - 1);
    const ripe = rng.int(ripens + 1, w1);
    // falling: a day in the first window after that
    const [f0, f1] = rule.fallDoy;
    let fy = cal.dateOf(ripe).year;
    if (cal.dayOfYearDay(fy, f1) <= ripe) fy++;
    const falls = rng.int(Math.max(ripe + 1, cal.dayOfYearDay(fy, f0)), Math.max(ripe + 1, cal.dayOfYearDay(fy, f1)));
    const fruit: FruitSite = {
      // numbered apart from stems and buds, so that fruit setting changes no other name in the run
      id: `${plant.id}/fruit${this.fruits.length}`,
      plantId: plant.id,
      axisId: bearer.id,
      pointIndex: bud.pointIndex === null ? bearer.alive - 1 : bud.pointIndex,
      position: bud.position,
      direction: this.heldDirection(plant, model.names.fruitHeld, bearer, bud.pointIndex),
      lengthM: rng.range(...rule.lengthM),
      year: date.year,
      swell: [this.day, full],
      ripen: [ripens, ripe],
      fallPlannedDay: falls,
      removedDay: null,
      removedBy: null,
    };
    if (model.names.fruitForm !== undefined) fruit.form = model.names.fruitForm;
    this.fruits.push(fruit);
    const onAxis = this.fruitsByAxis.get(bearer.id);
    if (onAxis) onAxis.push(fruit);
    else this.fruitsByAxis.set(bearer.id, [fruit]);
    const onPlant = this.hanging.get(plant.id);
    if (onPlant) onPlant.push(fruit);
    else this.hanging.set(plant.id, [fruit]);
    this.yearStats.get(plant.id)!.fruits++;
  }

  /** Fruit whose day has come falls; what a cut has already taken is forgotten. */
  private fruitDay(plant: Plant): void {
    const list = this.hanging.get(plant.id);
    if (!list || !list.length) return;
    let gone = false;
    for (const f of list) {
      if (f.removedDay === null && this.day >= f.fallPlannedDay) {
        f.removedDay = this.day;
        f.removedBy = 'fell';
      }
      if (f.removedDay !== null) gone = true;
    }
    if (gone) this.hanging.set(plant.id, list.filter((f) => f.removedDay === null));
  }

  // =========================================================================
  // Management: gardener events
  // =========================================================================
  private record(e: { id: string; date: string; type: GardenerEventType; plantId: string; author?: string; reason?: string }, date: CalendarDate, outcome: string, modelled: boolean, effects?: EventRecord['effects']): EventRecord {
    return {
      eventId: e.id,
      day: this.day,
      date: date.iso,
      type: e.type,
      plantId: e.plantId,
      author: e.author ?? null,
      reason: e.reason ?? null,
      outcome,
      effects: effects ?? { axesCut: 0, axesRemoved: 0, stemRemovedM: 0, floralBudsRemoved: 0, leafSitesRemoved: 0 },
      modelled,
    };
  }

  private applyEvent(e: GardenerEvent, date: CalendarDate): void {
    const plant = this.plants.get(e.plantId);
    if (plant && (e.type === 'annual_replant' || e.type === 'replace_failed_perennial')) {
      this.replant(plant, e, date);
      return;
    }
    if (!plant || plant.status !== 'alive') {
      this.events.push(this.record(e, date, `nothing done: there is no living plant "${e.plantId}" on this date`, true));
      return;
    }
    const { model } = this.taxon(plant);
    const fx: EventRecord['effects'] = { axesCut: 0, axesRemoved: 0, stemRemovedM: 0, floralBudsRemoved: 0, leafSitesRemoved: 0 };
    const spacing = mid(param(model, 'organs.leafSpacingM'));

    switch (e.type) {
      case 'train_leader': {
        plant.training = { tieToTimber: e.tieToTimber, by: e.tieToTimber ? e.id : null };
        let resumed = 0;
        if (e.tieToTimber) {
          // shoots that had stopped for want of a hold can be led on now
          for (const id of plant.axisIds) {
            const a = this.axes.get(id)!;
            if (a.removedDay === null && a.tip.state === 'stopped' && a.tip.retry) {
              a.tip = { state: 'at_node', nodeId: a.tip.retry.nodeId, came: a.tip.retry.came };
              resumed++;
            }
          }
        }
        this.events.push(this.record(e, date, e.tieToTimber ? `from now on, framework growth is tied in along the timber as it extends${resumed ? `; ${resumed} stalled shoot${resumed === 1 ? '' : 's'} led on` : ''}` : 'tying-in stopped: the plant is left to find its own hold', true));
        return;
      }
      case 'spur_prune': {
        let shoots = 0;
        if (e.season === 'summer') {
          // this year's whippy growth, back to five or six leaves
          for (const id of plant.axisIds) {
            const a = this.axes.get(id)!;
            if (a.role !== 'whip' || a.removedDay !== null || a.bornYear !== date.year) continue;
            const keep = plant.rng.flower.int(...param(model, 'pruning.summerLeavesKept')) * spacing;
            this.cutAt(a, keep, e.id, fx);
            a.summerPrunedYear = date.year;
            a.tip = { state: 'stopped', reason: 'cut back in summer' };
            shoots++;
          }
          plant.pendingWhips = [];
          plant.summerPrunedYear = date.year;
          this.events.push(this.record(e, date, `summer pruning: ${shoots} whippy shoot${shoots === 1 ? '' : 's'} cut back to five or six leaves, ${fx.stemRemovedM.toFixed(1)} m removed`, true, fx));
        } else {
          // the same shoots, back to two or three buds: they are spurs from now on
          for (const id of plant.axisIds) {
            const a = this.axes.get(id)!;
            if (a.role !== 'whip' || a.removedDay !== null) continue;
            const keep = plant.rng.flower.int(...param(model, 'pruning.winterBudsKept')) * spacing;
            this.cutAt(a, keep, e.id, fx);
            a.role = 'spur';
            a.tip = { state: 'stopped', reason: 'cut back to a spur' };
            this.spurLeaves(plant, a, date.year);
            shoots++;
          }
          this.events.push(this.record(e, date, `winter pruning: ${shoots} shoot${shoots === 1 ? '' : 's'} cut back to two or three buds, ${fx.stemRemovedM.toFixed(1)} m removed`, true, fx));
        }
        return;
      }
      case 'hard_prune': {
        const leaders = plant.axisIds.map((id) => this.axes.get(id)!).filter((a) => a.role === 'leader');
        const t = e.target;
        if ('allSpursOn' in t) {
          const root = leaders[t.allSpursOn.leader];
          if (!root) break;
          const spurs = this.descendants(root).filter((a) => a.role === 'spur' && a.removedDay === null);
          for (const s of spurs) this.removeAxis(s, e.id, fx);
          this.events.push(this.record(e, date, `removed all ${spurs.length} spurs carried by ${root.id}; ${fx.floralBudsRemoved} flower bud${fx.floralBudsRemoved === 1 ? '' : 's'} went with them`, true, fx));
          return;
        }
        if ('allStems' in t) {
          // measured from the ground along each stem's own line of descent, as a gardener measures it
          for (const a of leaders) {
            if (a.removedDay !== null) continue;
            const below = this.lineageLength(a);
            // a shoot that starts at or just under the cut height goes entirely: it is this year's growth, not a stub.
            // So does a shoot from a stub that came to nothing, or it would stand as a stub of no length and shoot again.
            if (below >= e.keepM - STEP || (a.parent !== null && this.lengthOf(a) < STEP)) this.removeAxis(a, e.id, fx);
            else if (this.lengthOf(a) > e.keepM - below + 1e-9) {
              this.cutAt(a, e.keepM - below, e.id, fx);
              a.tip = { state: 'stopped', reason: 'hard pruned' };
            }
          }
          // every stub left standing shoots again. A short stub carrying a younger one is the lower part
          // of one stem: only the top of each stem shoots.
          const standing = (a: Axis) => a.removedDay === null;
          const stubs = leaders.filter((a) => standing(a) && !a.children.some((id) => this.axes.get(id)!.role === 'leader' && standing(this.axes.get(id)!)));
          for (const a of stubs) if (!plant.pendingRegrowth.includes(a.id)) plant.pendingRegrowth.push(a.id);
          this.events.push(this.record(e, date, `all stems cut back to ${e.keepM.toFixed(2)} m above the ground: ${fx.stemRemovedM.toFixed(1)} m of stem and ${fx.floralBudsRemoved} flower bud${fx.floralBudsRemoved === 1 ? '' : 's'} removed, ${stubs.length} stub${stubs.length === 1 ? '' : 's'} left to shoot again`, true, fx));
          return;
        }
        const axis = 'axisId' in t ? this.axes.get(t.axisId) : leaders[t.leader];
        if (!axis || axis.plantId !== plant.id || axis.removedDay !== null) break;
        this.cutAt(axis, e.keepM, e.id, fx);
        axis.tip = { state: 'stopped', reason: 'hard pruned' };
        if (!plant.pendingRegrowth.includes(axis.id)) plant.pendingRegrowth.push(axis.id);
        this.events.push(this.record(e, date, `hard pruned ${axis.id} to ${e.keepM.toFixed(1)} m: ${fx.stemRemovedM.toFixed(1)} m of stem, ${fx.axesRemoved} dependent shoot${fx.axesRemoved === 1 ? '' : 's'} and ${fx.floralBudsRemoved} flower bud${fx.floralBudsRemoved === 1 ? '' : 's'} removed`, true, fx));
        return;
      }
      case 'monitor': {
        const alive = plant.axisIds.map((id) => this.axes.get(id)!).filter((a) => a.removedDay === null);
        const fw = alive.filter((a) => a.role === 'leader' || a.role === 'lateral').reduce((s, a) => s + this.lengthOf(a), 0);
        this.events.push(this.record(e, date, `observed: ${fw.toFixed(1)} m of framework, ${alive.filter((a) => a.role === 'spur').length} spurs, ${alive.filter((a) => a.role === 'whip').length} long shoots, ${this.liveBuds(plant).length} live flower buds`, true));
        return;
      }
      default: {
        this.events.push(this.record(e, date, `recorded${'note' in e && e.note ? `: ${e.note}` : ''}; the model does not yet act on this kind of event`, false));
        return;
      }
    }
    this.events.push(this.record(e, date, 'nothing done: the target does not exist or has already gone', true));
  }

  /** Length of stem between the ground and the base of an axis, along its line of descent. */
  private lineageLength(axis: Axis): number {
    let total = 0;
    let a = axis;
    while (a.parent) {
      const p = this.axes.get(a.parent.axisId)!;
      total += p.lengthAt[a.parent.pointIndex] ?? 0;
      a = p;
    }
    return total;
  }

  /**
   * A stub left by a hard prune breaks from the buds just below the cut. The
   * new shoots are new axes: the cut wood stays cut, and what grows is a
   * replacement, not a restoration.
   */
  private regrow(plant: Plant, stub: Axis): void {
    if (stub.removedDay !== null || stub.alive === 0) return;
    const { profile, model } = this.taxon(plant);
    const { graph } = this.scenario.bower;
    const at = stub.alive - 1;
    const count = plant.rng.arch.int(...param(model, 'regrowth.shootsPerCut'));
    const planned = stub.role === 'leader' ? plant.rng.arch.range(...param(model, 'architecture.leaderLengthM')) : stub.targetLengthM;
    const below = this.lineageLength(stub) + this.lengthOf(stub);
    const run = [...stub.runs].reverse().find((r) => r.status !== 'detached' && r.firstPoint <= at);
    const node = at === 0 ? (stub.runs[0]?.fromNode ?? this.scenario.bower.rootStations.find((s) => s.id === plant.stationId)!.entryNodeIds[0]!) : stub.nodesPassed.find((n) => n.pointIndex === at)?.nodeId;
    for (let k = 0; k < count; k++) {
      const shoot = this.newAxis(plant, stub.role, stub.order, { axisId: stub.id, pointIndex: at }, Math.max(0.5, planned - below), stub.ratePerSeasonM);
      shoot.intent = stub.intent;
      this.appendPoint(plant, shoot, stub.contact[at]!, stub.away[at]!);
      if (node !== undefined || !run) {
        shoot.tip = { state: 'at_node', nodeId: node ?? stub.runs[0]!.fromNode, came: at === 0 ? null : (run?.edgeId ?? null) };
      } else {
        // cut part-way along a member: carry on along it from where the stub ends
        const edge = graph.edges.get(run.edgeId)!;
        const reverse = edge.from !== run.fromNode;
        const path =
          run.mode === 'twine'
            ? twinePath(edge, { reverse, handedness: profile.attachment.handedness?.value ?? 'right_handed', minPitchM: param(model, 'attachment.minPitchM'), pitchPerCircumference: param(model, 'attachment.pitchPerCircumference'), bulge: k * 0.9 })
            : liePath(edge, { reverse, sideOffsetM: k * LANE_M });
        let nearest = 0;
        let best = Infinity;
        for (let j = 0; j < path.points.length; j++) {
          const d = distance(path.points[j]!, stub.contact[at]!);
          if (d < best) {
            best = d;
            nearest = j;
          }
        }
        const d0 = path.cumulative[nearest]!;
        shoot.runs.push({ edgeId: edge.id, fromNode: run.fromNode, toNode: run.toNode, mode: run.mode, status: run.status === 'trained_by_human' ? 'trained_by_human' : 'grasped', by: run.by, day: this.day, firstPoint: 0, lastPoint: 0 });
        shoot.used.add(edge.id);
        const occ = this.occupancy.get(edge.id);
        if (occ) occ.push(shoot.id);
        else this.occupancy.set(edge.id, [shoot.id]);
        shoot.tip = { state: 'on_route', edgeId: edge.id, toNode: run.toNode, path, d: d0, emitted: d0, run: 0 };
      }
      this.note('regrew', plant, shoot, `a new shoot broke from the stub of ${stub.id}, ${below.toFixed(2)} m from the ground`);
    }
  }

  private descendants(axis: Axis): Axis[] {
    const out: Axis[] = [];
    const walk = (a: Axis) => {
      for (const id of a.children) {
        const c = this.axes.get(id)!;
        out.push(c);
        walk(c);
      }
    };
    walk(axis);
    return out;
  }

  /**
   * Cut an axis so that `keepM` of it remains. Everything beyond the cut goes
   * with it: the stem, the shoots it bore, their leaves, their flower buds and
   * their hold on the structure. This is what makes pruning consequential.
   */
  private cutAt(axis: Axis, keepM: number, eventId: string, fx: EventRecord['effects']): void {
    if (axis.removedDay !== null) return;
    let keep = 1;
    while (keep < axis.alive && axis.lengthAt[keep]! <= keepM + 1e-9) keep++;
    if (keep >= axis.alive) return;
    fx.axesCut++;
    fx.stemRemovedM += axis.lengthAt[axis.alive - 1]! - axis.lengthAt[keep - 1]!;
    for (let i = keep; i < axis.alive; i++) axis.removedDayAt[i] = this.day;
    axis.alive = keep;
    // let go of every stretch of route beyond the cut
    for (const run of axis.runs) {
      if (run.status === 'detached') continue;
      if (run.firstPoint >= keep - 1) this.release(axis, run);
      else if (run.lastPoint >= keep) {
        run.lastPoint = keep - 1;
        if (this.barelyHeld(axis, run)) this.release(axis, run);
      }
    }
    for (const id of axis.children) {
      const c = this.axes.get(id)!;
      if (c.removedDay === null && c.parent!.pointIndex >= keep) this.removeAxis(c, eventId, fx);
    }
    for (const leaf of this.leavesByAxis.get(axis.id) ?? []) {
      if (leaf.removedDay === null && leaf.pointIndex >= keep) {
        leaf.removedDay = this.day;
        fx.leafSitesRemoved++;
      }
    }
    this.loseParts(axis, keep, eventId);
    const plant = this.plants.get(axis.plantId)!;
    for (const bud of this.budsByAxis.get(axis.id) ?? []) {
      if (bud.pointIndex !== null && bud.pointIndex >= keep) this.loseBud(plant, bud, eventId, fx);
    }
    plant.pendingLaterals = plant.pendingLaterals.filter((b) => !(b.parentId === axis.id && b.pointIndex >= keep));
    plant.pendingWhips = plant.pendingWhips.filter((w) => !(w.hostId === axis.id && w.pointIndex >= keep));
  }

  /** Fruit and appendages from point `keep` of an axis onwards go with the stem that carried them. */
  private loseParts(axis: Axis, keep: number, causeId: string): void {
    for (const f of this.fruitsByAxis.get(axis.id) ?? []) {
      if (f.removedDay === null && f.pointIndex >= keep) {
        f.removedDay = this.day;
        f.removedBy = causeId;
      }
    }
    for (const a of this.appendagesByAxis.get(axis.id) ?? []) {
      if (a.removedDay === null && a.pointIndex >= keep) a.removedDay = this.day;
    }
  }

  /** A bud cannot outlive the wood it sits on. */
  private loseBud(plant: Plant, bud: FloralBud, eventId: string, fx: EventRecord['effects']): void {
    if (bud.end !== null || bud.stage === 'spent') return;
    bud.end = 'removed_by_pruning';
    bud.endedDay = this.day;
    bud.endedBy = eventId;
    fx.floralBudsRemoved++;
    this.yearStats.get(plant.id)!.lost++;
  }

  /** A stretch of stem that has been cut away no longer holds, or occupies, its route. */
  private release(axis: Axis, run: Run): void {
    run.status = 'detached';
    const occ = (this.tookHold.has(axis.id) ? this.holds : this.occupancy).get(run.edgeId);
    const at = occ ? occ.indexOf(axis.id) : -1;
    if (occ && at >= 0) occ.splice(at, 1);
  }

  private removeAxis(axis: Axis, eventId: string, fx: EventRecord['effects']): void {
    if (axis.removedDay !== null) return;
    fx.axesRemoved++;
    fx.stemRemovedM += this.lengthOf(axis);
    for (let i = 0; i < axis.alive; i++) axis.removedDayAt[i] = this.day;
    axis.alive = 0;
    axis.removedDay = this.day;
    axis.tip = { state: 'stopped', reason: 'removed' };
    for (const run of axis.runs) if (run.status !== 'detached') this.release(axis, run);
    for (const id of axis.children) this.removeAxis(this.axes.get(id)!, eventId, fx);
    for (const leaf of this.leavesByAxis.get(axis.id) ?? []) {
      if (leaf.removedDay === null) {
        leaf.removedDay = this.day;
        fx.leafSitesRemoved++;
      }
    }
    this.loseParts(axis, 0, eventId);
    const plant = this.plants.get(axis.plantId)!;
    for (const bud of this.budsByAxis.get(axis.id) ?? []) this.loseBud(plant, bud, eventId, fx);
    plant.pendingLaterals = plant.pendingLaterals.filter((b) => b.parentId !== axis.id);
    plant.pendingWhips = plant.pendingWhips.filter((w) => w.hostId !== axis.id);
  }

  // =========================================================================
  // Year end: thickening and the yearly account
  // =========================================================================
  private closeYear(date: CalendarDate): void {
    for (const plant of this.plants.values()) {
      if (plant.status === 'removed') continue;
      // a plant that died during the year still has that year to account for
      if (plant.status === 'alive') this.thicken(plant);
      this.summaries.push(this.summarise(plant, date.year));
      this.yearStats.set(plant.id, { initiated: 0, opened: 0, lost: 0, fruits: 0 });
    }
  }

  /** Each point of a stem is as thick as the length of stem it carries: the pipe model, never shrinking. */
  thicken(plant: Plant): void {
    const { model } = this.taxon(plant);
    const tip = param(model, 'thickening.tipRadiusSquaredMm2');
    const perM = param(model, 'thickening.radiusSquaredPerMetreMm2');
    const share = param(model, 'thickening.branchShare');
    const carried = new Map<string, Map<number, number>>();
    for (let k = plant.axisIds.length - 1; k >= 0; k--) {
      const axis = this.axes.get(plant.axisIds[k]!)!;
      if (axis.removedDay !== null || axis.alive === 0) continue;
      const from = carried.get(axis.id);
      let r2 = tip;
      for (let i = axis.alive - 1; i >= 0; i--) {
        if (i < axis.alive - 1) r2 += perM * (axis.lengthAt[i + 1]! - axis.lengthAt[i]!);
        r2 += from?.get(i) ?? 0;
        axis.radiusMm[i] = Math.max(axis.radiusMm[i]!, Math.sqrt(r2));
      }
      // only the permanent framework thickens what bears it: spurs and the year's shoots are too slight to count
      if (axis.parent && (axis.role === 'leader' || axis.role === 'lateral')) {
        let m = carried.get(axis.parent.axisId);
        if (!m) carried.set(axis.parent.axisId, (m = new Map()));
        m.set(axis.parent.pointIndex, (m.get(axis.parent.pointIndex) ?? 0) + share * r2);
      }
    }
  }

  summarise(plant: Plant, year: number): YearSummary {
    const stats = this.yearStats.get(plant.id) ?? { initiated: 0, opened: 0, lost: 0, fruits: 0 };
    let frameworkM = 0;
    let whipM = 0;
    let spurs = 0;
    let sideShoots = 0;
    let runsSelf = 0;
    let runsTied = 0;
    let highestM = 0;
    const held = new Set<string>();
    for (const id of plant.axisIds) {
      const a = this.axes.get(id)!;
      if (a.removedDay !== null) continue;
      if (a.role === 'leader' || a.role === 'lateral') {
        frameworkM += this.lengthOf(a);
        // shoots of the year wave about above the framework and are not what has been reached
        for (let i = 0; i < a.alive; i++) highestM = Math.max(highestM, a.contact[i]!.z);
      } else if (a.role === 'whip') whipM += this.lengthOf(a);
      else if (a.role === 'side_shoot') sideShoots++;
      else spurs++;
      for (const run of a.runs) {
        if (run.status === 'detached') continue;
        held.add(run.edgeId);
        if (run.by === 'plant') runsSelf++;
        else runsTied++;
      }
    }
    let heldM = 0;
    for (const id of held) heldM += this.scenario.bower.graph.edges.get(id)!.curve.length;
    return { year, plantId: plant.id, frameworkM, whipM, spurs, sideShoots, floralBudsInitiated: stats.initiated, flowersOpened: stats.opened, fruitsSet: stats.fruits, floralBudsLostToPruning: stats.lost, runsSelf, runsTied, routeShare: this.routeTotalM > 0 ? heldM / this.routeTotalM : 0, highestM };
  }
}

/** What tells the decisions of a shoot that took hold from the air from every other decided at the same place. */
const HOLD_SALT = { route: 1103 } as const;
