/**
 * Light in a run: what each plant receives where it stands and climbs, and
 * what the engine does about it.
 *
 * The engine asks two things, and nothing else in it knows about light:
 *   growthFactor      a multiplier on the day's extension
 *   floweringFactor   a multiplier on the chance that a flower bud forms
 * Both are 1 for a plant that has as much light as its profile asks for.
 *
 * A plant's light is read once a year, when it first grows: over the route it
 * holds by then, or at its root station while it holds none. It is thinned by
 * the timber and cables, by whatever the site declares, and by the leaf other
 * plants carried the season before. A plant's own leaves are left out: they
 * are what catch its light. So shade from a neighbour arrives a year late,
 * and shade within one plant's canopy is not modelled at all.
 *
 * What a plant makes of its light comes from its profile's own words on sun
 * and shade (`light/tolerance.ts`), through numbers that are labelled
 * assumptions (`light/model.ts`). Warmth, shelter and wind are not light and
 * are not modelled; where a profile asks for them the report says so.
 */
import type { CalendarDate } from '../calendar.ts';
import { type Foliage, LightGeometry, type MonthlyLight, clumpLeaves, foliageOf } from '../light/exposure.ts';
import { LIGHT_MODEL } from '../light/model.ts';
import { DEFAULT_SITE, type Site } from '../light/site.ts';
import { MID_MONTH_DOY } from '../light/sun.ts';
import { type LightReading, lightFactor, lightNeeded, readLight } from '../light/tolerance.ts';
import type { Vec3 } from '../math/vec3.ts';
import type { Simulation } from './engine.ts';
import { mixLight } from './light-from.ts';
import { param } from './model.ts';
import type { Plant } from './types.ts';
import { leafSilhouetteAreaM2 } from './view.ts';

/** One plant's light in one year, and what was made of it. */
export interface PlantLight extends MonthlyLight {
  plantId: string;
  year: number;
  /** Where it was read: at the root station, or over the route the plant held. */
  over: 'station' | 'route';
  /** Metres of route it was read over; 0 at a station. */
  routeM: number;
  /** Multiplier on extension in each month, January first. 1 where light does not hold the plant back. */
  growth: number[];
  /** The mean of `share` over the months the plant grows in. */
  seasonShare: number;
  /** The mean of `growth` over the same months. */
  seasonGrowth: number;
  /** Multiplier on the chance of a flower bud; 1 where the profile does not tie flowering to sun. */
  flowering: number;
}

/** The most places a plant's light is read at in one year. Light changes slowly along a route; this keeps a long run quick. */
const READINGS_PER_PLANT = 8;
/**
 * How far from a place light is read at its reading is taken to say which way
 * the light comes from, in metres. Light is read once for every metre and a
 * half of route, so a shoot's tip within that of a reading has one. A
 * sampling distance of this model, not a fact about any plant.
 */
const DIRECTION_REACH_M = 1.5;

const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

export class LightField {
  readonly site: Site;
  /** False where the scenario asks for light to be reported and not acted on. */
  readonly acts: boolean;
  /** Every reading taken during the run, in the order taken. */
  readonly history: PlantLight[] = [];

  private readonly sim: Simulation;
  private made: LightGeometry | null = null;
  private readonly readings = new Map<string, LightReading>();
  private readonly cache = new Map<string, PlantLight>();
  private readonly plantNumber = new Map<string, number>();
  private canopyOf = NaN;
  private canopyNow: Foliage | undefined;
  /** Which way the light comes from, by place read, year, month and plant; null where none arrives. */
  private readonly directions = new Map<string, Vec3 | null>();

  constructor(sim: Simulation) {
    this.sim = sim;
    this.site = sim.scenario.site ?? sim.scenario.bower.site ?? DEFAULT_SITE;
    this.acts = sim.scenario.lightResponse !== false;
  }

  /** The reading of the structure and its site. Worked out when first needed. */
  get geometry(): LightGeometry {
    return (this.made ??= new LightGeometry(this.sim.scenario.bower, this.site));
  }

  /** What a taxon's profile says about light, read once. */
  reading(taxonId: string): LightReading {
    let r = this.readings.get(taxonId);
    if (!r) {
      const taxon = this.sim.scenario.taxa.get(taxonId);
      if (!taxon) throw new Error(`the scenario has no taxon "${taxonId}"`);
      this.readings.set(taxonId, (r = readLight(taxon.profile)));
    }
    return r;
  }

  private numberOf(plantId: string): number {
    let n = this.plantNumber.get(plantId);
    if (n === undefined) this.plantNumber.set(plantId, (n = this.plantNumber.size));
    return n;
  }

  /** The leaf that stood on the structure in a season, gathered into clumps; undefined where there was none. */
  canopy(season: number): Foliage | undefined {
    if (this.canopyOf === season) return this.canopyNow;
    this.canopyOf = season;
    const sim = this.sim;
    const last = season;
    const area = new Map<string, number>();
    const leaves: { x: number; y: number; z: number; areaM2: number; evergreen: boolean; plant: number }[] = [];
    for (const leaf of sim.leaves) {
      if (leaf.removedDay !== null || leaf.firstYear > last || (leaf.lastYear !== null && leaf.lastYear < last)) continue;
      const areaM2 = leafSilhouetteAreaM2(leaf.lengthM);
      leaves.push({ x: leaf.position.x, y: leaf.position.y, z: leaf.position.z, areaM2, evergreen: leaf.evergreen, plant: this.numberOf(leaf.plantId) });
      if (!leaf.evergreen) area.set(leaf.plantId, (area.get(leaf.plantId) ?? 0) + areaM2);
    }
    if (!leaves.length) return (this.canopyNow = undefined);
    // how much of the deciduous leaf is out in the middle of each month, by each plant's own dates
    const out = new Array<number>(12).fill(0);
    let total = 0;
    for (const [plantId, a] of area) {
      const { model } = sim.scenario.taxa.get(sim.plants.get(plantId)!.taxonId)!;
      const flush = mean(param(model, 'phenology.leafFlushDoy'));
      const fall = mean(param(model, 'phenology.leafFallDoy'));
      for (let m = 0; m < 12; m++) if (MID_MONTH_DOY[m]! >= flush && MID_MONTH_DOY[m]! <= fall) out[m]! += a;
      total += a;
    }
    return (this.canopyNow = foliageOf(clumpLeaves(leaves), out.map((a) => (total > 0 ? a / total : 0))));
  }

  /** The light of a plant in a year: read when first asked for, and kept. */
  of(plant: Plant, year: number): PlantLight {
    const key = `${plant.id}|${year}`;
    const known = this.cache.get(key);
    if (known) return known;
    const sim = this.sim;
    const g = this.geometry;
    const { model } = sim.scenario.taxa.get(plant.taxonId)!;
    const reading = this.reading(plant.taxonId);

    // the route it holds; failing that, where it is planted
    const held = new Set<string>();
    for (const id of plant.axisIds) {
      const a = sim.axes.get(id)!;
      if (a.removedDay !== null) continue;
      for (const r of a.runs) if (r.status !== 'detached') held.add(r.edgeId);
    }
    const all: number[] = [];
    let routeM = 0;
    for (const e of held) {
      for (const i of g.byEdge.get(e) ?? []) {
        all.push(i);
        routeM += g.points[i]!.routeM;
      }
    }
    // a plant that holds a great deal of route is read at places spread evenly along it, not at every one
    let points = all;
    if (all.length > READINGS_PER_PLANT) {
      points = [];
      let k = 0;
      let passed = 0;
      for (const i of all) {
        passed += g.points[i]!.routeM;
        if (passed >= ((k + 0.5) / READINGS_PER_PLANT) * routeM) {
          points.push(i);
          k++;
        }
      }
    }
    const station = g.byStation.get(plant.stationId);
    const over: PlantLight['over'] = points.length ? 'route' : 'station';
    if (!points.length && station !== undefined) points.push(station);

    // shade from other plants is last season's: this year's leaf is not out when the year's light is read
    const light = g.lightOver(points, this.canopy(year - 1), this.numberOf(plant.id), points !== all);
    const needed = lightNeeded(reading)?.value ?? null;
    const growth = light.share.map((s) => lightFactor(s, needed));
    const burst = param(model, 'phenology.budburstDoy');
    const end = param(model, 'phenology.growthEndDoy');
    const growing = MID_MONTH_DOY.map((d, m) => (d >= burst && d <= end ? m : -1)).filter((m) => m >= 0);
    const months = growing.length ? growing : [5];
    const seasonShare = mean(months.map((m) => light.share[m]!));
    const record: PlantLight = {
      plantId: plant.id,
      year,
      over,
      routeM,
      hours: light.hours,
      share: light.share,
      growth,
      seasonShare,
      seasonGrowth: mean(months.map((m) => growth[m]!)),
      flowering: reading.floweringNeedsSun ? lightFactor(seasonShare, LIGHT_MODEL.floweringLightNeeded.value) : 1,
    };
    this.cache.set(key, record);
    this.history.push(record);
    return record;
  }

  /**
   * Which way the light comes from at a place, for a shoot of a plant: a unit
   * vector towards it, or null where this model cannot say. It can say within
   * `DIRECTION_REACH_M` of a place it reads light at (the middle of a stretch
   * of route, or a root station): the answer is the sky as seen from there in
   * the month, behind the timber, what the site declares and last season's
   * leaf of the other plants. It cannot say where no such place is near,
   * where next to no light arrives, or where the scenario asks for light not
   * to be acted on; the engine then falls back on the open sky of the site.
   */
  from(plant: Plant, at: Vec3, date: CalendarDate): Vec3 | null {
    if (!this.acts) return null;
    const g = this.geometry;
    let nearest = -1;
    let least = DIRECTION_REACH_M * DIRECTION_REACH_M;
    for (let i = 0; i < g.points.length; i++) {
      const p = g.points[i]!.position;
      const d = (p.x - at.x) ** 2 + (p.y - at.y) ** 2 + (p.z - at.z) ** 2;
      if (d < least) {
        least = d;
        nearest = i;
      }
    }
    if (nearest < 0) return null;
    const me = this.numberOf(plant.id);
    const key = `${nearest}|${date.year}|${date.month}|${me}`;
    let known = this.directions.get(key);
    if (known === undefined) {
      const { sky, sun } = g.direction(nearest, date.month - 1, this.canopy(date.year - 1), me);
      this.directions.set(key, (known = mixLight(sky, sun)));
    }
    return known;
  }

  /** Multiplier on a plant's extension today. */
  growthFactor(plant: Plant, date: CalendarDate): number {
    return this.acts ? this.of(plant, date.year).growth[date.month - 1]! : 1;
  }

  /** Multiplier on the chance that a flower bud forms on a plant this year. */
  floweringFactor(plant: Plant, date: CalendarDate): number {
    return this.acts ? this.of(plant, date.year).flowering : 1;
  }
}
