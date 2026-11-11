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
 */
import { assessAttachment } from '../attachment.ts';
import type { SupportEdge } from '../bower/types.ts';
import { Calendar, type CalendarDate } from '../calendar.ts';
import { type Vec3, UP, ZERO, add, addScaled, cross, distance, dot, length, normalize, scale, smoothstep, sub, v3 } from '../math/vec3.ts';
import type { GardenerEventType, MemberTier } from '../vocab.ts';
import { type GrowthModel, listAt, param } from './model.ts';
import { Rng } from './rng.ts';
import { liePath, pathAt, pathLength, twinePath } from './stem-path.ts';
import type { Axis, AxisRole, Decision, DecisionKind, EventRecord, FloralBud, GardenerEvent, Intent, LeafSite, Plant, Planting, Run, Scenario, YearSummary } from './types.ts';

/** Metres of stem between stored points. */
const STEP = 0.04;
/** Sideways spacing of stems tied along the same member. */
const LANE_M = 0.022;

const mid = (r: readonly [number, number]) => (r[0] + r[1]) / 2;

export class Simulation {
  readonly scenario: Scenario;
  readonly calendar: Calendar;
  /** The last day simulated; -1 before the first step. */
  day = -1;
  readonly plants = new Map<string, Plant>();
  readonly axes = new Map<string, Axis>();
  readonly leaves: LeafSite[] = [];
  readonly buds: FloralBud[] = [];
  readonly events: EventRecord[] = [];
  readonly decisions: Decision[] = [];
  readonly summaries: YearSummary[] = [];

  /** Axis ids on each edge, in the order they arrived. */
  private readonly occupancy = new Map<string, string[]>();
  private readonly eventsByDay = new Map<number, GardenerEvent[]>();
  private readonly plantingsByDay = new Map<number, Planting[]>();
  private readonly tierOf = new Map<string, MemberTier>();
  private readonly budsByAxis = new Map<string, FloralBud[]>();
  private readonly leavesByAxis = new Map<string, LeafSite[]>();
  private readonly topZ: number;
  private readonly routeTotalM: number;
  private serial = 0;
  private yearStats = new Map<string, { initiated: number; opened: number; lost: number }>();

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
      status: 'alive',
      rng: {
        arch: new Rng(this.scenario.seed * 7919 + this.plants.size * 104729 + 13),
        organ: new Rng(this.scenario.seed * 7919 + this.plants.size * 104729 + 1013),
        flower: new Rng(this.scenario.seed * 7919 + this.plants.size * 104729 + 2013),
      },
      axisIds: [],
      leafNodes: [],
      pendingLaterals: [],
      pendingWhips: [],
      training: { tieToTimber: p.tieToTimber ?? false, by: p.tieToTimber ? 'planting' : null },
      summerPrunedYear: null,
      seasonStarted: null,
    };
    this.plants.set(plant.id, plant);
    this.yearStats.set(plant.id, { initiated: 0, opened: 0, lost: 0 });
    const { profile, model } = this.taxon(plant);
    this.events.push(this.record({ id: `plant:${plant.id}`, date: date.iso, type: 'plant', plantId: plant.id }, date, `planted ${profile.names.label} at ${station.id}`, true));
    if (profile.attachment.mechanism === 'none') {
      this.note('stopped', plant, null, `${profile.names.label} is a shrub: it stays in its bed and is not routed on to the structure`);
      return;
    }
    // the plant arrives as a cane already some way up
    const cane = this.newTrunkStem(plant, 0);
    if (cane) this.advance(plant, cane, param(model, 'architecture.nurseryCaneM'));
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

  private newAxis(plant: Plant, role: AxisRole, order: number, parent: Axis['parent'], targetLengthM: number, ratePerSeasonM: number): Axis {
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
      nextLeafM: plant.rng.organ.range(0.03, 0.1),
      leafSide: plant.rng.organ.sign(),
      summerPrunedYear: null,
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
    const { model } = this.taxon(plant);
    const doy = date.dayOfYear;
    const burst = param(model, 'phenology.budburstDoy');
    const end = param(model, 'phenology.growthEndDoy');

    if (plant.seasonStarted !== date.year && doy >= burst && doy < end) this.startSeason(plant, date);
    if (doy === param(model, 'phenology.floralInitiationDoy')[1]) this.initiateFloralBuds(plant, date);
    if (doy === param(model, 'phenology.leafFallDoy')[1]) for (const b of this.liveBuds(plant)) if (b.stage === 'initiated') b.stage = 'dormant';
    this.flowerDay(plant, date);

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
    for (const id of [...plant.axisIds]) {
      const axis = this.axes.get(id)!;
      if (axis.removedDay !== null || axis.tip.state === 'stopped') continue;
      // a whip grows at its own pace: it is the plant's vigour looking for somewhere to go
      const delta = axis.ratePerSeasonM * share * (axis.role === 'whip' ? 1 : est);
      this.advance(plant, axis, delta);
    }
  }

  private liveBuds(plant: Plant): FloralBud[] {
    return this.buds.filter((b) => b.plantId === plant.id && b.end === null && b.stage !== 'spent');
  }

  // =========================================================================
  // Architecture: extension, routes, attachment
  // =========================================================================
  private advance(plant: Plant, axis: Axis, delta: number): void {
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
      // unsupported: arch out, then droop under the shoot's own weight
      const go = Math.min(left, room, tip.planM - tip.grownM, STEP);
      if (go <= 1e-9) {
        axis.tip = { state: 'stopped', reason: 'reached its planned length' };
        return;
      }
      const fr = tip.planM > 0 ? tip.grownM / tip.planM : 1;
      const d = tip.dir;
      const dir = normalize(v3(d.x + plant.rng.organ.range(-0.03, 0.03), d.y + plant.rng.organ.range(-0.03, 0.03), d.z - go * (0.3 + 1.7 * fr) * plant.rng.organ.range(0.6, 1.4)));
      tip.dir = dir;
      tip.grownM += go;
      left -= go;
      const last = axis.contact[axis.contact.length - 1]!;
      const from = axis.contact.length === 1 ? addScaled(last, axis.away[0]!, axis.radiusMm[0]! / 1000) : last;
      this.appendPoint(plant, axis, addScaled(from, dir, go), ZERO);
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
    if (axis.role === 'spur' || n === 0) return;
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
    plant.leafNodes.push({ axisId: axis.id, pointIndex: i, year, side: axis.leafSide, taken: false });
    this.addLeaf(plant, axis, i, normalize(add(add(scale(side, 0.75), scale(up, 0.6)), scale(t, 0.3))), plant.rng.organ.range(...param(model, 'organs.leafLengthM')), year, year);
  }

  private addLeaf(plant: Plant, axis: Axis, i: number, direction: Vec3, lengthM: number, firstYear: number, lastYear: number | null): void {
    const leaf: LeafSite = { plantId: plant.id, axisId: axis.id, pointIndex: i, position: axis.contact[i]!, direction, lengthM, firstYear, lastYear, bornDay: this.day, removedDay: null };
    this.leaves.push(leaf);
    const list = this.leavesByAxis.get(axis.id);
    if (list) list.push(leaf);
    else this.leavesByAxis.set(axis.id, [leaf]);
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
      const n = this.occupancy.get(edge.id)?.length ?? 0;
      if (n >= this.capacity(edge, model)) {
        refuse('already full of stems');
        continue;
      }
      const verdict = assessAttachment(profile.attachment.mechanism, edge, limit);
      const subLattice = edge.host.type === 'member' && this.tierOf.get(edge.host.id) === 'sub_lattice';
      let mode: 'twine' | 'along';
      let tied = false;
      if (verdict.outcome === 'self') {
        // a gardener who is training the plant lays its framework flat along the lattice instead of letting it coil
        tied = plant.training.tieToTimber && subLattice && axis.role !== 'whip';
        mode = tied || profile.attachment.mechanism !== 'stem_twining' ? 'along' : 'twine';
      } else if ((verdict.outcome === 'needs_tie' || verdict.outcome === 'unverified') && plant.training.tieToTimber && axis.role !== 'whip') {
        tied = true;
        mode = 'along';
      } else {
        refuse(verdict.outcome === 'impossible' ? 'a declared exclusion' : verdict.outcome === 'unverified' ? 'cannot be shown to grasp it, and nobody ties it in' : 'too stout to grasp, and nobody ties it in');
        continue;
      }
      const other = graph.nodes.get(graph.otherEnd(edge, nodeId))!.position;
      const dy = other.z - here.z;
      // shoots make height readily, run level willingly, and go downhill hardly at all
      let cost = n * param(model, 'routing.occupancyCost') + (dy < 0 ? -dy * param(model, 'routing.downhillCostPerM') : -dy * param(model, 'routing.uphillBonusPerM')) + plant.rng.arch.range(0, param(model, 'routing.noise'));
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
    const lane = best.n;
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
    const occ = this.occupancy.get(edge.id);
    if (occ) occ.push(axis.id);
    else this.occupancy.set(edge.id, [axis.id]);
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
        b.openDoy = plant.rng.flower.int(...param(model, 'phenology.flowerOpenDoy'));
        b.fallDoy = plant.rng.flower.int(...param(model, 'phenology.petalFallDoy'));
      }
    }

    // further trunk stems start in the seasons the model gives them
    const starts = param(model, 'architecture.trunkStemStartYears');
    const leaders = plant.axisIds.filter((id) => this.axes.get(id)!.role === 'leader').length;
    if (leaders > 0) {
      starts.forEach((s, i) => {
        if (i >= leaders && s === season) this.newTrunkStem(plant, i);
      });
    }

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
    for (let k = 0; k < n; k++) {
      const dir = normalize(v3(plant.rng.organ.range(-0.8, 0.8), plant.rng.organ.range(-0.8, 0.8), plant.rng.organ.range(0.45, 1)));
      this.addLeaf(plant, spur, 0, dir, plant.rng.organ.range(...param(model, 'organs.leafLengthM')) * 0.9, fromYear, null);
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
  private initiateFloralBuds(plant: Plant, date: CalendarDate): void {
    const { profile, model } = this.taxon(plant);
    if (profile.flowering.wood.value !== 'previous_season') return; // other flowering classes are not modelled yet
    const year = date.year;
    const ramp = year + 1 - plant.plantedYear - param(model, 'flowering.competenceYears');
    if (ramp < 0) return;
    const pruned = plant.summerPrunedYear === year;
    const chance = listAt(model, 'flowering.maturityRamp', ramp) * param(model, 'flowering.spurFloralChance') * (pruned ? 1 : param(model, 'flowering.unprunedFactor'));
    let made = 0;
    let sites = 0;
    for (const id of plant.axisIds) {
      const a = this.axes.get(id)!;
      if (a.removedDay !== null) continue;
      // a flower bud needs short wood to sit on: a spur, or a shoot cut back this summer
      if (!(a.role === 'spur' || (a.role === 'whip' && a.summerPrunedYear === year))) continue;
      sites++;
      if (!plant.rng.flower.chance(chance)) continue;
      const bud: FloralBud = {
        id: `${plant.id}/bud${this.serial++}`,
        plantId: plant.id,
        axisId: a.id,
        fate: 'floral',
        stage: 'initiated',
        end: null,
        initiatedDay: this.day,
        floweringYear: year + 1,
        openDay: null,
        spentDay: null,
        endedDay: null,
        endedBy: null,
        position: null,
        lengthM: plant.rng.flower.range(...param(model, 'organs.racemeLengthM')),
        openDoy: 0,
        fallDoy: 0,
      };
      this.buds.push(bud);
      const list = this.budsByAxis.get(a.id);
      if (list) list.push(bud);
      else this.budsByAxis.set(a.id, [bud]);
      made++;
    }
    this.yearStats.get(plant.id)!.initiated += made;
    this.note('floral_initiated', plant, null, `${made} flower bud${made === 1 ? '' : 's'} formed on ${sites} spur${sites === 1 ? '' : 's'} and cut-back shoots for ${year + 1}${pruned ? '' : '; no summer pruning this year, so fewer than there could have been'}`);
  }

  private flowerDay(plant: Plant, date: CalendarDate): void {
    let opened = 0;
    for (const b of this.buds) {
      if (b.plantId !== plant.id || b.end !== null || b.floweringYear !== date.year) continue;
      if (b.stage === 'developing' && date.dayOfYear >= b.openDoy) {
        const bearer = this.axes.get(b.axisId)!;
        b.stage = 'open';
        b.openDay = this.day;
        // the raceme hangs from the end of the wood that bears it, wherever pruning has left that end
        b.position = bearer.contact[bearer.alive - 1]!;
        opened++;
      } else if (b.stage === 'open' && date.dayOfYear >= b.fallDoy) {
        b.stage = 'spent';
        b.spentDay = this.day;
      }
    }
    if (opened) this.yearStats.get(plant.id)!.opened += opened;
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
        const axis = 'axisId' in t ? this.axes.get(t.axisId) : leaders[t.leader];
        if (!axis || axis.plantId !== plant.id || axis.removedDay !== null) break;
        this.cutAt(axis, e.keepM, e.id, fx);
        axis.tip = { state: 'stopped', reason: 'hard pruned' };
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
      else if (run.lastPoint >= keep) run.lastPoint = keep - 1;
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
    const plant = this.plants.get(axis.plantId)!;
    plant.pendingLaterals = plant.pendingLaterals.filter((b) => !(b.parentId === axis.id && b.pointIndex >= keep));
    plant.pendingWhips = plant.pendingWhips.filter((w) => !(w.hostId === axis.id && w.pointIndex >= keep));
  }

  /** A stretch of stem that has been cut away no longer holds, or occupies, its route. */
  private release(axis: Axis, run: Run): void {
    run.status = 'detached';
    const occ = this.occupancy.get(run.edgeId);
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
    const plant = this.plants.get(axis.plantId)!;
    for (const bud of this.budsByAxis.get(axis.id) ?? []) {
      if (bud.end !== null || bud.stage === 'spent') continue;
      // a bud cannot outlive the wood it sits on
      bud.end = 'removed_by_pruning';
      bud.endedDay = this.day;
      bud.endedBy = eventId;
      fx.floralBudsRemoved++;
      this.yearStats.get(plant.id)!.lost++;
    }
    plant.pendingLaterals = plant.pendingLaterals.filter((b) => b.parentId !== axis.id);
    plant.pendingWhips = plant.pendingWhips.filter((w) => w.hostId !== axis.id);
  }

  // =========================================================================
  // Year end: thickening and the yearly account
  // =========================================================================
  private closeYear(date: CalendarDate): void {
    for (const plant of this.plants.values()) {
      if (plant.status !== 'alive') continue;
      this.thicken(plant);
      this.summaries.push(this.summarise(plant, date.year));
      this.yearStats.set(plant.id, { initiated: 0, opened: 0, lost: 0 });
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
      if (axis.parent) {
        let m = carried.get(axis.parent.axisId);
        if (!m) carried.set(axis.parent.axisId, (m = new Map()));
        m.set(axis.parent.pointIndex, (m.get(axis.parent.pointIndex) ?? 0) + share * r2);
      }
    }
  }

  summarise(plant: Plant, year: number): YearSummary {
    const stats = this.yearStats.get(plant.id) ?? { initiated: 0, opened: 0, lost: 0 };
    let frameworkM = 0;
    let whipM = 0;
    let spurs = 0;
    let runsSelf = 0;
    let runsTied = 0;
    let highestM = 0;
    const held = new Set<string>();
    for (const id of plant.axisIds) {
      const a = this.axes.get(id)!;
      if (a.removedDay !== null) continue;
      if (a.role === 'leader' || a.role === 'lateral') frameworkM += this.lengthOf(a);
      else if (a.role === 'whip') whipM += this.lengthOf(a);
      else spurs++;
      for (let i = 0; i < a.alive; i++) highestM = Math.max(highestM, a.contact[i]!.z);
      for (const run of a.runs) {
        if (run.status === 'detached') continue;
        held.add(run.edgeId);
        if (run.by === 'plant') runsSelf++;
        else runsTied++;
      }
    }
    let heldM = 0;
    for (const id of held) heldM += this.scenario.bower.graph.edges.get(id)!.curve.length;
    return { year, plantId: plant.id, frameworkM, whipM, spurs, floralBudsInitiated: stats.initiated, flowersOpened: stats.opened, floralBudsLostToPruning: stats.lost, runsSelf, runsTied, routeShare: this.routeTotalM > 0 ? heldM / this.routeTotalM : 0, highestM };
  }
}
