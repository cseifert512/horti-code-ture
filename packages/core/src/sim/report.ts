/**
 * The design report: what a run means for someone deciding about a Bower.
 * SIMULATION_KEY.md section 8 lists the outputs; PROJECT_CONTEXT.md section 2
 * lists the questions. Each part of the report answers one of them.
 *
 * Everything here is computed from the record of a run. Nothing is estimated
 * that the run did not produce: gardening hours and plant mass are left
 * unstated because no basis for them exists yet.
 */
import { type MaterialSummary, materialSummary, zoneContains } from '../bower/types.ts';
import { v3 } from '../math/vec3.ts';
import { type ProvenanceEntry, type Sourced, summariseProvenance } from '../provenance.ts';
import { flowerState, leafState, seasonsOf } from '../render/presence.ts';
import { WINTER_EVERGREEN_COVER, WINTER_MONTH } from '../targets.ts';
import type { EvidenceStatus, GardenerEventType } from '../vocab.ts';
import type { Simulation } from './engine.ts';
import { modelProvenance } from './model.ts';
import { toRenderData } from './render-data.ts';
import { type ViewCoverage, type Viewpoint, viewCoverage } from './view.ts';

export interface PlantAccount {
  plantId: string;
  label: string;
  taxonId: string;
  /** Permanent stems, and shoots of the year not yet cut or shed. */
  frameworkM: number;
  annualShootsM: number;
  spurs: number;
  /** Highest point of the permanent stems; shoots of the year standing above them are not counted. */
  highestM: number;
  /** Length of route this plant holds, and its share of all route in the Bower. */
  routeHeldM: number;
  routeShare: number;
  /** Stretches of route held by the plant itself, and those a gardener tied. */
  heldUnaided: number;
  tiedIn: number;
  /** Volume of living stem: a proxy only, see `DesignReport.proxyNote`. */
  stemVolumeM3: number;
}

export interface MonthAccount {
  month: number;
  /** ISO date sampled: the 15th. */
  date: string;
  views: ViewCoverage[];
  /** Leaves out, and flowers open, by plant. */
  leaves: Record<string, number>;
  flowers: Record<string, number>;
}

export const HEIGHT_ZONES = ['within reach, under 2 m', '2 to 3 m', 'above 3 m'] as const;
export type HeightZone = (typeof HEIGHT_ZONES)[number];

export interface GardeningYear {
  year: number;
  actions: Partial<Record<GardenerEventType, number>>;
  stemRemovedM: number;
  /** Stretches of stem tied in during the year. */
  tieIns: number;
  floralBudsRemoved: number;
}

/** `caveat`: something the taxon's profile says about how it holds on that the attachment rule does not act on. */
export type AlertKind = 'no_hold' | 'headroom' | 'thickening_watch' | 'joints_reached' | 'crown_not_reached' | 'not_modelled' | 'assumed' | 'caveat' | 'recorded_only';

/** Winter evergreen cover from each viewpoint, read against the design target. */
export interface WinterCheck {
  target: Sourced<[number, number]>;
  /** ISO date the cover was read on. */
  date: string;
  views: { viewpointId: string; evergreen: number; against: 'below' | 'within' | 'above' }[];
}

export interface Alert {
  kind: AlertKind;
  plantId: string | null;
  count: number;
  text: string;
}

export interface DesignReport {
  scenario: string;
  /** The calendar year the monthly figures describe. */
  year: number;
  structure: MaterialSummary & { routeM: number; crownHeightM: number };
  plants: PlantAccount[];
  /** How each plant stood at the end of its 1st, 3rd, 5th, 10th and 20th years, as far as the run goes, and at its end. */
  milestones: { plantId: string; yearsAfterPlanting: number; year: number; frameworkM: number; routeShare: number; highestM: number; flowersOpened: number }[];
  /** Parameters this scenario varied from the taxon's growth model, each with its stated reason. */
  variations: { taxonId: string; parameter: string; value: unknown; basis: string }[];
  /** Route held by any plant, and route nothing has reached. */
  routes: { heldM: number; freeM: number; heldShare: number };
  /** Joints between timber members that a plant holding by aerial roots has reached with nobody tying it: where to inspect. */
  jointsReached: { plantId: string; nodeIds: string[]; highestM: number }[];
  viewpoints: Viewpoint[];
  months: MonthAccount[];
  /** Months of the year, of those sampled, in which no plant had a flower open on the 15th. */
  flowerlessMonths: number[];
  /** Null where the run has no viewpoints or does not reach the winter of the year reported. */
  winter: WinterCheck | null;
  /** Flowers that opened in the year, by plant and by height above the ground. */
  flowersByHeight: { plantId: string; zone: HeightZone; count: number }[];
  gardening: GardeningYear[];
  /** Left unstated: no basis exists for hours per task. */
  gardeningHours: null;
  alerts: Alert[];
  assumptions: Record<string, Record<EvidenceStatus, number>>;
  proxyNote: string;
  statement: string;
}

const zoneOf = (z: number): HeightZone => (z < 2 ? HEIGHT_ZONES[0] : z < 3 ? HEIGHT_ZONES[1] : HEIGHT_ZONES[2]);
const pad = (n: number) => String(n).padStart(2, '0');

export interface ReportOptions {
  /** Calendar year for the monthly figures; default the last full year simulated. */
  year?: number;
  viewpoints?: readonly Viewpoint[];
  /** Stem diameter, wound round timber, above which a stretch is listed for watching. */
  watchDiameterMm?: number;
}

export function designReport(sim: Simulation, options: ReportOptions = {}): DesignReport {
  const cal = sim.calendar;
  const last = cal.dateOf(Math.max(0, sim.day));
  const year = options.year ?? (last.month === 12 && last.dayOfMonth === 31 ? last.year : last.year - 1);
  const viewpoints = [...(options.viewpoints ?? sim.scenario.viewpoints ?? [])];
  const watchMm = options.watchDiameterMm ?? 30;
  const { bower } = sim.scenario;
  const { graph } = bower;
  const data = toRenderData(sim);
  const routeM = graph.totalLength;
  let crown = 0;
  for (const n of graph.nodes.values()) crown = Math.max(crown, n.position.z);

  // ---- plants and routes ------------------------------------------------------
  const heldAll = new Set<string>();
  const alerts: Alert[] = [];
  // a joint is a node where two or more different timber members meet
  const joints = new Set<string>();
  for (const n of graph.nodes.keys()) {
    const members = new Set<string>();
    for (const e of graph.edges.values()) if ((e.from === n || e.to === n) && e.kind === 'timber' && e.host.type === 'member') members.add(e.host.id);
    if (members.size >= 2) joints.add(n);
  }
  const jointsReached: DesignReport['jointsReached'] = [];
  const plants: PlantAccount[] = [];
  for (const plant of sim.plants.values()) {
    const { profile } = sim.scenario.taxa.get(plant.taxonId)!;
    const acc: PlantAccount = { plantId: plant.id, label: profile.names.label, taxonId: plant.taxonId, frameworkM: 0, annualShootsM: 0, spurs: 0, highestM: 0, routeHeldM: 0, routeShare: 0, heldUnaided: 0, tiedIn: 0, stemVolumeM3: 0 };
    const held = new Set<string>();
    const clung = new Set<string>();
    let watch = 0;
    let thickest = 0;
    for (const id of plant.axisIds) {
      const a = sim.axes.get(id)!;
      if (a.removedDay !== null || a.alive === 0) continue;
      const len = a.lengthAt[a.alive - 1]!;
      if (a.role === 'leader' || a.role === 'lateral') acc.frameworkM += len;
      else if (a.role === 'whip') acc.annualShootsM += len;
      else acc.spurs++;
      const permanent = a.role === 'leader' || a.role === 'lateral';
      for (let i = 0; i < a.alive; i++) {
        if (permanent) acc.highestM = Math.max(acc.highestM, a.contact[i]!.z);
        if (i) acc.stemVolumeM3 += Math.PI * (a.radiusMm[i]! / 1000) ** 2 * (a.lengthAt[i]! - a.lengthAt[i - 1]!);
      }
      for (const r of a.runs) {
        if (r.status === 'detached') continue;
        held.add(r.edgeId);
        if (r.by === 'plant') acc.heldUnaided++;
        else acc.tiedIn++;
        // a stretch clung to from end to end has brought the plant to the joint at its far end
        if (profile.attachment.mechanism === 'aerial_root' && r.by === 'plant' && joints.has(r.toNode) && a.nodesPassed.some((n) => n.nodeId === r.toNode && n.pointIndex < a.alive)) clung.add(r.toNode);
        // a stem wound round timber goes on thickening where it is: CONSTRAINTS section 2, "Ageing/thickening risk"
        if (r.mode === 'twine' && graph.edges.get(r.edgeId)!.kind === 'timber') {
          let d = 0;
          for (let i = r.firstPoint; i <= Math.min(r.lastPoint, a.alive - 1); i++) d = Math.max(d, 2 * a.radiusMm[i]!);
          if (d >= watchMm) {
            watch++;
            thickest = Math.max(thickest, d);
          }
        }
      }
    }
    for (const e of held) {
      acc.routeHeldM += graph.edges.get(e)!.curve.length;
      heldAll.add(e);
    }
    acc.routeShare = routeM ? acc.routeHeldM / routeM : 0;
    plants.push(acc);

    if (clung.size) {
      const nodeIds = [...clung].sort();
      const top = nodeIds.reduce((best, id) => (graph.nodes.get(id)!.position.z > graph.nodes.get(best)!.position.z ? id : best), nodeIds[0]!);
      const highestM = graph.nodes.get(top)!.position.z;
      jointsReached.push({ plantId: plant.id, nodeIds, highestM });
      alerts.push({ kind: 'joints_reached', plantId: plant.id, count: nodeIds.length, text: `has clung its way unaided to ${nodeIds.length} joint${nodeIds.length === 1 ? '' : 's'} between timber members, the highest ${highestM.toFixed(1)} m up (${top}): stems can enter gaps there and thicken, so these are the joints to inspect` });
    }
    if (watch) alerts.push({ kind: 'thickening_watch', plantId: plant.id, count: watch, text: `${watch} stretch${watch === 1 ? '' : 'es'} where a stem of ${watchMm} mm or more is wound round a timber member (thickest ${Math.round(thickest)} mm): it will go on thickening there, so keep these in view` });
    const stalled = sim.decisions.filter((d) => d.plantId === plant.id && d.kind === 'no_route' && d.text.includes('nobody ties it in'));
    if (stalled.length) alerts.push({ kind: 'no_hold', plantId: plant.id, count: stalled.length, text: `${stalled.length} shoot${stalled.length === 1 ? '' : 's'} stopped for want of a hold, and nobody tied the shoot in. First: ${stalled[0]!.text}` });
    if (acc.frameworkM > 0 && acc.highestM < crown * 0.97) alerts.push({ kind: 'crown_not_reached', plantId: plant.id, count: 1, text: `reached ${acc.highestM.toFixed(1)} m on a structure whose routes go to ${crown.toFixed(1)} m: route length, not height, is what ran out` });
    for (const d of sim.decisions) if (d.plantId === plant.id && (d.kind === 'not_modelled' || d.kind === 'assumed')) alerts.push({ kind: d.kind, plantId: plant.id, count: 1, text: d.text });
    if (profile.attachment.caveat) alerts.push({ kind: 'caveat', plantId: plant.id, count: 1, text: `the profile says of how it holds on, and the model does not act on it: ${profile.attachment.caveat}` });
  }
  const heldM = [...heldAll].reduce((s, e) => s + graph.edges.get(e)!.curve.length, 0);

  // ---- month by month -----------------------------------------------------------
  const days = Array.from({ length: 12 }, (_, m) => cal.dayOf(`${year}-${pad(m + 1)}-15`)).filter((d) => d >= 0 && d <= sim.day);
  const yearOfDay = (d: number) => cal.dateOf(d).year;
  const views = viewpoints.map((vp) => viewCoverage(bower, data, vp, days, yearOfDay));
  const seasons = seasonsOf(data, year);
  const months: MonthAccount[] = days.map((day, k) => {
    const leaves: Record<string, number> = {};
    const flowers: Record<string, number> = {};
    for (const lf of data.leaves) if (leafState(lf, seasons.get(lf.plantId), day).present) leaves[lf.plantId] = (leaves[lf.plantId] ?? 0) + 1;
    for (const fl of data.flowers) if (flowerState(fl, day).phase === 'open') flowers[fl.plantId] = (flowers[fl.plantId] ?? 0) + 1;
    const date = cal.dateOf(day);
    return { month: date.month, date: date.iso, views: views.map((v) => v[k]!), leaves, flowers };
  });
  const flowerlessMonths = months.filter((m) => !Object.values(m.flowers).some((n) => n > 0)).map((m) => m.month);
  const [lo, hi] = WINTER_EVERGREEN_COVER.value!;
  const january = months.find((m) => m.month === WINTER_MONTH);
  const winter: WinterCheck | null =
    january && january.views.length
      ? { target: WINTER_EVERGREEN_COVER, date: january.date, views: january.views.map((v) => ({ viewpointId: v.viewpointId, evergreen: v.evergreenFoliage, against: v.evergreenFoliage < lo ? 'below' : v.evergreenFoliage > hi ? 'above' : 'within' })) }
      : null;

  // ---- flowers by height, and anything hanging into headroom ---------------------
  const byHeight = new Map<string, number>();
  const low = new Map<string, number>();
  const headroom = bower.zones.filter((z) => z.kind === 'headroom');
  for (const fl of data.flowers) {
    if (fl.year !== year) continue;
    const key = `${fl.plantId}|${zoneOf(fl.position[2])}`;
    byHeight.set(key, (byHeight.get(key) ?? 0) + 1);
    const tipZ = fl.lengthM > 0.15 ? fl.position[2] - fl.lengthM : fl.position[2];
    if (headroom.some((z) => zoneContains(z, v3(fl.position[0], fl.position[1], tipZ)))) low.set(fl.plantId, (low.get(fl.plantId) ?? 0) + 1);
  }
  for (const [plantId, n] of low) alerts.push({ kind: 'headroom', plantId, count: n, text: `${n} flower${n === 1 ? '' : 's'} in ${year} hung into a headroom zone` });
  const flowersByHeight = [...byHeight].map(([key, count]) => {
    const [plantId, zone] = key.split('|') as [string, HeightZone];
    return { plantId, zone, count };
  });

  // ---- the gardener's year --------------------------------------------------------
  const gardening = new Map<number, GardeningYear>();
  const gy = (y: number) => {
    let g = gardening.get(y);
    if (!g) gardening.set(y, (g = { year: y, actions: {}, stemRemovedM: 0, tieIns: 0, floralBudsRemoved: 0 }));
    return g;
  };
  let recordedOnly = 0;
  for (const e of sim.events) {
    const g = gy(cal.dateOf(e.day).year);
    g.actions[e.type] = (g.actions[e.type] ?? 0) + 1;
    g.stemRemovedM += e.effects.stemRemovedM;
    g.floralBudsRemoved += e.effects.floralBudsRemoved;
    if (!e.modelled) recordedOnly++;
  }
  for (const a of sim.axes.values()) for (const r of a.runs) if (r.by !== 'plant') gy(cal.dateOf(r.day).year).tieIns++;
  if (recordedOnly) alerts.push({ kind: 'recorded_only', plantId: null, count: recordedOnly, text: `${recordedOnly} gardener action${recordedOnly === 1 ? ' was' : 's were'} recorded but had no effect, because the model does not act on that kind yet` });

  // ---- over the years -------------------------------------------------------------
  const milestones: DesignReport['milestones'] = [];
  for (const plant of sim.plants.values()) {
    const mine = sim.summaries.filter((s) => s.plantId === plant.id);
    const lastYear = mine[mine.length - 1]?.year;
    for (const s of mine) {
      const n = s.year - plant.plantedYear + 1;
      if ([1, 3, 5, 10, 20].includes(n) || s.year === lastYear) milestones.push({ plantId: plant.id, yearsAfterPlanting: n, year: s.year, frameworkM: s.frameworkM, routeShare: s.routeShare, highestM: s.highestM, flowersOpened: s.flowersOpened });
    }
  }

  // ---- what it all rests on -------------------------------------------------------
  const assumptions: Record<string, Record<EvidenceStatus, number>> = {};
  const variations: DesignReport['variations'] = [];
  for (const taxonId of new Set([...sim.plants.values()].map((p) => p.taxonId))) {
    const entries: ProvenanceEntry[] = modelProvenance(sim.scenario.taxa.get(taxonId)!.model);
    assumptions[taxonId] = summariseProvenance(entries);
    for (const e of entries) if (e.basis?.startsWith('Varied for this scenario')) variations.push({ taxonId, parameter: e.path, value: e.value, basis: e.basis });
  }

  return {
    scenario: sim.scenario.name,
    year,
    structure: { ...materialSummary(bower), routeM, crownHeightM: crown },
    plants,
    milestones,
    variations,
    // summed in a different order from the total, so guard the last decimal place
    routes: { heldM: Math.min(heldM, routeM), freeM: Math.max(0, routeM - heldM), heldShare: routeM ? Math.min(1, heldM / routeM) : 0 },
    jointsReached,
    viewpoints,
    months,
    flowerlessMonths,
    winter,
    flowersByHeight,
    gardening: [...gardening.values()].sort((a, b) => a.year - b.year),
    gardeningHours: null,
    alerts,
    assumptions,
    proxyNote: 'Stem volume is a bookkeeping proxy from modelled stem lengths and radii. It is not a mass, a load or an engineering quantity, and must not be used to size anything.',
    statement: data.statement,
  };
}

const pct = (x: number) => `${Math.round(100 * x)}%`;

/** The report as plain text, for a terminal or a file. */
export function formatDesignReport(r: DesignReport): string {
  const out: string[] = [];
  const line = (s = '') => out.push(s);
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // wide enough for the longest plant id in the run
  const idW = Math.max(12, ...r.plants.map((p) => p.plantId.length + 2));
  line(r.scenario);
  line(r.statement);
  line();
  line('STRUCTURE');
  line(`  glulam ${r.structure.primaryTimberM.toFixed(0)} m, timber sub-lattice ${r.structure.subLatticeTimberM.toFixed(0)} m, steel cable ${r.structure.steelCableM.toFixed(0)} m`);
  line(`  plant route ${r.structure.routeM.toFixed(0)} m, of which ${pct(r.structure.steelShareOfRoute)} is steel; highest point of any route ${r.structure.crownHeightM.toFixed(2)} m`);
  line();
  line('PLANTS at the end of the run');
  for (const p of r.plants) {
    line(`  ${p.plantId} (${p.label})`);
    line(`    framework ${p.frameworkM.toFixed(1)} m, shoots of the year ${p.annualShootsM.toFixed(1)} m, ${p.spurs} spurs, framework reaches ${p.highestM.toFixed(2)} m`);
    line(`    holds ${p.routeHeldM.toFixed(0)} m of route (${pct(p.routeShare)}): ${p.heldUnaided} stretches by itself, ${p.tiedIn} tied in by the gardener`);
  }
  line(`  route held by any plant ${pct(r.routes.heldShare)}; ${r.routes.freeM.toFixed(0)} m carries nothing`);
  line();
  if (r.milestones.length) {
    line('OVER THE YEARS (at the end of each plant’s 1st, 3rd, 5th and 10th years, and of the run)');
    line(`  ${'plant'.padEnd(idW)}${'year'.padStart(5)}${'framework'.padStart(11)}${'route held'.padStart(12)}${'highest'.padStart(9)}${'flowers'.padStart(9)}`);
    for (const m of r.milestones) {
      line(`  ${m.plantId.padEnd(idW)}${String(m.yearsAfterPlanting).padStart(5)}${`${m.frameworkM.toFixed(1)} m`.padStart(11)}${pct(m.routeShare).padStart(12)}${`${m.highestM.toFixed(1)} m`.padStart(9)}${String(m.flowersOpened).padStart(9)}`);
    }
    line();
  }
  if (r.months.length) {
    line(`THROUGH ${r.year}, on the 15th of each month`);
    for (const vp of r.viewpoints) {
      line(`  ${vp.label}`);
      line(`    ${'month'.padEnd(6)}${'timber seen'.padStart(12)}${'in leaf'.padStart(9)}${'evergreen'.padStart(11)}${'in flower'.padStart(11)}`);
      for (const m of r.months) {
        const v = m.views.find((x) => x.viewpointId === vp.id)!;
        line(`    ${names[m.month - 1]!.padEnd(6)}${pct(v.timberVisible).padStart(12)}${pct(v.foliage).padStart(9)}${pct(v.evergreenFoliage).padStart(11)}${pct(v.flowers).padStart(11)}`);
      }
    }
    line('  flowers open, by plant');
    line(`    ${''.padEnd(idW)}${r.months.map((m) => names[m.month - 1]!.padStart(5)).join('')}`);
    for (const p of r.plants) {
      const row = r.months.map((m) => String(m.flowers[p.plantId] || '.').padStart(5)).join('');
      if (r.months.some((m) => m.flowers[p.plantId])) line(`    ${p.plantId.padEnd(idW)}${row}`);
    }
    line(r.flowerlessMonths.length ? `  nothing in flower in mid ${r.flowerlessMonths.map((m) => names[m - 1]).join(', ')}` : '  something in flower in the middle of every month');
    line();
  }
  if (r.winter) {
    const [lo, hi] = r.winter.target.value!;
    line(`WINTER EVERGREEN COVER on ${r.winter.date}, against the design target of ${pct(lo)} to ${pct(hi)} (a target to test, not a fact about plants)`);
    for (const v of r.winter.views) line(`  ${(r.viewpoints.find((x) => x.id === v.viewpointId)?.label ?? v.viewpointId).padEnd(44)}${pct(v.evergreen).padStart(5)}  ${v.against === 'within' ? 'within the target' : `${v.against} the target`}`);
    line();
  }
  if (r.flowersByHeight.length) {
    line(`FLOWERS that opened in ${r.year}, by height`);
    for (const p of r.plants) {
      const cells = HEIGHT_ZONES.map((z) => `${z}: ${r.flowersByHeight.find((f) => f.plantId === p.plantId && f.zone === z)?.count ?? 0}`);
      if (r.flowersByHeight.some((f) => f.plantId === p.plantId)) line(`  ${p.plantId.padEnd(idW)} ${cells.join('; ')}`);
    }
    line();
  }
  line('GARDENING, by year (hours are not estimated: there is no basis for them yet)');
  for (const g of r.gardening) {
    const acts = Object.entries(g.actions).map(([k, v]) => `${v} ${k}`);
    line(`  ${g.year}: ${acts.join(', ') || 'no visits'}; ${g.tieIns} tie-ins; ${g.stemRemovedM.toFixed(0)} m of stem cut${g.floralBudsRemoved ? `; ${g.floralBudsRemoved} flower buds lost to cuts` : ''}`);
  }
  line();
  line('TO KEEP IN VIEW');
  if (!r.alerts.length) line('  nothing flagged');
  for (const a of r.alerts) line(`  ${a.plantId ?? 'all plants'}: ${a.text}`);
  line();
  line('WHAT THIS RESTS ON');
  for (const [taxonId, c] of Object.entries(r.assumptions)) line(`  ${taxonId}: ${c.provisional_design_assumption} provisional assumptions, ${c.published_plant_profile} published values, ${c.measured + c.calibrated} measured`);
  for (const v of r.variations) line(`  varied: ${v.taxonId} ${v.parameter} = ${JSON.stringify(v.value)}. ${v.basis}`);
  line(`  ${r.proxyNote}`);
  return out.join('\n');
}
