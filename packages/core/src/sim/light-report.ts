/**
 * The light section of the design report: how much light the structure has on
 * each side, what each plant had where it stood and climbed, and whether that
 * is what its profile asks for. PROJECT_CONTEXT.md section 2: which species
 * will outcompete or smother their neighbours; KEY.md section 7: place by
 * aspect.
 *
 * The hours are those the geometry allows on a clear day, not sunshine
 * records. The shares compare a place with an open site at the same spot, so
 * the cloud of a real year, which falls on both alike, is not in them.
 */
import { type Facing, compassWords, midsummerMonth, midwinterMonth } from '../light/exposure.ts';
import { LIGHT_MODEL } from '../light/model.ts';
import { TREE_CROWN_TRANSMISSION, TREE_IN_LEAF_MONTHS } from '../light/site.ts';
import { type LightReading, SUN_CLASS_WORDS, sunClassOf } from '../light/tolerance.ts';
import { collectProvenance, summariseProvenance } from '../provenance.ts';
import { type CompassQuarter, type EvidenceStatus, SUN_CLASS, type SunClass } from '../vocab.ts';
import type { Simulation } from './engine.ts';
import type { Alert } from './report.ts';

export interface LightSide {
  facing: Facing;
  routeM: number;
  /** Direct sun on a clear day in the middle of the midsummer and midwinter months, hours. */
  midsummerHours: number;
  midwinterHours: number;
  /** Light as a share of an open site's: the mean of the six months round midsummer, and the midwinter month. */
  summerShare: number;
  midwinterShare: number;
}

export interface LightStation {
  stationId: string;
  facing: CompassQuarter;
  /** The side of the structure it is on, to the nearest of sixteen compass points. */
  side: string;
  /** Twelve values each, January first. */
  hours: number[];
  share: number[];
  /** By its hours of direct sun at midsummer, as the RHS defines the classes. */
  sunClass: SunClass;
}

export interface LightPlant {
  plantId: string;
  taxonId: string;
  stationId: string;
  facing: CompassQuarter;
  side: string;
  /** What the profile says, and what was read from it. */
  reading: LightReading;
  /** Where its light was read: its root station, or the route it held. */
  over: 'station' | 'route';
  routeM: number;
  midsummerHours: number;
  sunClass: SunClass;
  /** Light as a share of an open site's, over the months the plant grows in. */
  seasonShare: number;
  /** What the engine multiplied its extension by, on average over those months, and its chance of a flower bud by. */
  growthFactor: number;
  floweringFactor: number;
  /** Its light against the classes its profile accepts. */
  light: 'within' | 'less_sun' | 'more_sun' | 'unread';
  /** Its side of the structure against the aspects its profile names. */
  aspect: 'as_asked' | 'not_as_asked' | 'not_asked';
}

export interface LightReport {
  site: { name: string; latitudeDeg: number; longitudeDeg: number; bearingDeg: number; assumed: boolean; basis: string; obstructions: { id: string; kind: string }[] };
  /** False where the scenario asked for light to be reported and not acted on. */
  acts: boolean;
  /** Hours between sunrise and sunset on the 15th of each month: the most direct sun an open site could have. */
  possibleHours: number[];
  /** The structure by the side each stretch of route faces, with the year's leaf on it. */
  sides: LightSide[];
  stations: LightStation[];
  plants: LightPlant[];
  /** How many of the light model's own numbers have each evidence status. */
  assumptions: Record<EvidenceStatus, number>;
  /** What the light model leaves out, in sentences that travel with its figures. */
  notes: string[];
}

const NOTES = [
  'Hours are direct sun on a clear day in the middle of the month, as the geometry allows: not sunshine records. A half-shaded minute counts as half.',
  'Shares compare a place with an open site at the same spot, so cloud, which falls on both alike, is not in them.',
  'Shade comes from the timber and cables, from what the site declares, and from the leaf other plants carried the season before. A plant is not counted as shading itself.',
  'Warmth, shelter and wind are not light and are not modelled: where a profile asks for a warm or sheltered aspect, nothing here speaks to that.',
] as const;

const list = (xs: readonly string[]): string => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`);

export function lightReport(sim: Simulation, year: number): { light: LightReport; alerts: Alert[] } {
  const field = sim.light;
  const g = field.geometry;
  const site = field.site;
  const summer = midsummerMonth(site.latitudeDeg);
  const winter = midwinterMonth(site.latitudeDeg);
  const half = [-2, -1, 0, 1, 2, 3].map((k) => (summer + k + 12) % 12);
  const canopy = field.canopy(year);

  // ---- the structure, side by side ---------------------------------------------
  const sides = new Map<Facing, LightSide>();
  const stations: LightStation[] = [];
  g.points.forEach((p, i) => {
    const l = g.light(i, canopy);
    if (p.kind === 'station') {
      stations.push({ stationId: p.id, facing: p.facing as CompassQuarter, side: compassWords(p.bearingDeg), hours: l.hours, share: l.share, sunClass: sunClassOf(l.hours[summer]!) });
      return;
    }
    let s = sides.get(p.facing);
    if (!s) sides.set(p.facing, (s = { facing: p.facing, routeM: 0, midsummerHours: 0, midwinterHours: 0, summerShare: 0, midwinterShare: 0 }));
    s.routeM += p.routeM;
    s.midsummerHours += p.routeM * l.hours[summer]!;
    s.midwinterHours += p.routeM * l.hours[winter]!;
    s.summerShare += (p.routeM * half.reduce((sum, m) => sum + l.share[m]!, 0)) / half.length;
    s.midwinterShare += p.routeM * l.share[winter]!;
  });
  const order: Facing[] = ['north', 'east', 'south', 'west', 'up'];
  const bySide = order
    .filter((f) => sides.has(f))
    .map((f) => {
      const s = sides.get(f)!;
      const m = s.routeM || 1;
      return { facing: f, routeM: s.routeM, midsummerHours: s.midsummerHours / m, midwinterHours: s.midwinterHours / m, summerShare: s.summerShare / m, midwinterShare: s.midwinterShare / m };
    });
  const brightest = stations.reduce((best, s) => Math.max(best, half.reduce((sum, m) => sum + s.share[m]!, 0) / half.length), 0);

  // ---- each plant against its profile ---------------------------------------------
  const plants: LightPlant[] = [];
  const alerts: Alert[] = [];
  const sheltered: string[] = [];
  for (const plant of sim.plants.values()) {
    if (plant.status === 'removed') continue;
    const reading = field.reading(plant.taxonId);
    const l = field.of(plant, year);
    const station = stations.find((s) => s.stationId === plant.stationId);
    const facing = station?.facing ?? 'north';
    const side = station?.side ?? '';
    const hours = l.hours[summer]!;
    const sunClass = sunClassOf(hours);
    const at = SUN_CLASS.indexOf(sunClass);
    const accepted = reading.accepts.map((c) => SUN_CLASS.indexOf(c));
    const light: LightPlant['light'] = !accepted.length ? 'unread' : accepted.includes(at) ? 'within' : at > Math.max(...accepted) ? 'less_sun' : 'more_sun';
    const aspect: LightPlant['aspect'] = !reading.aspects.length ? 'not_asked' : reading.aspects.includes(facing) ? 'as_asked' : 'not_as_asked';
    plants.push({ plantId: plant.id, taxonId: plant.taxonId, stationId: plant.stationId, facing, side, reading, over: l.over, routeM: l.routeM, midsummerHours: hours, sunClass, seasonShare: l.seasonShare, growthFactor: l.seasonGrowth, floweringFactor: l.flowering, light, aspect });

    const asks = list(reading.accepts.map((c) => SUN_CLASS_WORDS[c]));
    const where = l.over === 'route' ? `over the ${l.routeM.toFixed(0)} m of route it holds` : 'at its root station';
    const has = `${hours.toFixed(1)} h of direct sun on a clear midsummer day ${where}, which is ${SUN_CLASS_WORDS[sunClass]}`;
    if (light === 'less_sun') {
      alerts.push({ kind: 'less_sun_than_profile', plantId: plant.id, count: 1, text: `has ${has}; its profile asks for ${asks} ("${reading.words}"). ${field.acts ? `Its growth was held to ${Math.round(100 * l.seasonGrowth)}% of what its model gives` : 'Light was told not to act in this run, so its growth is as its model gives'}` });
    } else if (light === 'more_sun') {
      alerts.push({ kind: 'more_sun_than_profile', plantId: plant.id, count: 1, text: `has ${has}; its profile asks for ${asks}${reading.fullSunOnlyIf ? `, and for "${reading.fullSunOnlyIf}"` : ''}. Nothing here shades it: an open lattice casts little shade until it is clothed. The model does not act on too much sun, having no water or heat in it` });
    } else if (light === 'unread') {
      alerts.push({ kind: 'light_unread', plantId: plant.id, count: 1, text: `what its profile says about light could not be read, so light changes nothing for it: "${reading.words}"` });
    }
    if (aspect === 'not_as_asked') {
      alerts.push({ kind: 'aspect_against_profile', plantId: plant.id, count: 1, text: `is planted on the ${side} side; its profile names ${list(reading.aspects)} ("${reading.words}"). In light the difference is small here: it has ${Math.round(100 * l.seasonShare)}% of an open site's light in its growing months, and the brightest station on the structure has ${Math.round(100 * brightest)}%. The warmth and shelter that advice is mostly about are not modelled` });
    }
    if (reading.shelter || reading.warmth) sheltered.push(plant.id);
  }
  if (sheltered.length) {
    alerts.push({ kind: 'shelter_not_modelled', plantId: null, count: sheltered.length, text: `${sheltered.length} plant${sheltered.length === 1 ? ' has a profile that asks' : 's have profiles that ask'} for shelter or warmth (${sheltered.join(', ')}): the model has no wind or temperature, so nothing in this run speaks to whether ${sheltered.length === 1 ? 'it has' : 'they have'} it` });
  }

  const assumptions = summariseProvenance(collectProvenance('light model', { LIGHT_MODEL, TREE_CROWN_TRANSMISSION, TREE_IN_LEAF_MONTHS }));
  return {
    light: {
      site: { name: site.name, latitudeDeg: site.latitudeDeg, longitudeDeg: site.longitudeDeg, bearingDeg: site.bearingDeg, assumed: site.assumed, basis: site.basis, obstructions: site.obstructions.map((o) => ({ id: o.id, kind: o.kind })) },
      acts: field.acts,
      possibleHours: [...g.possibleHours],
      sides: bySide,
      stations,
      plants,
      assumptions,
      notes: [...NOTES],
    },
    alerts,
  };
}

const pct = (x: number) => `${Math.round(100 * x)}%`;

/** The light section as lines of plain text. `idW` is the width of the plant column in the rest of the report. */
export function formatLight(r: LightReport, year: number, idW: number): string[] {
  const out: string[] = [];
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const summer = midsummerMonth(r.site.latitudeDeg);
  const winter = midwinterMonth(r.site.latitudeDeg);
  out.push(`LIGHT in ${year}: direct sun on a clear day in the middle of the month, and light as a share of an open site's`);
  out.push(`  site: ${r.site.name}, ${Math.abs(r.site.latitudeDeg).toFixed(1)} ${r.site.latitudeDeg >= 0 ? 'N' : 'S'} ${Math.abs(r.site.longitudeDeg).toFixed(1)} ${r.site.longitudeDeg >= 0 ? 'E' : 'W'}${r.site.bearingDeg ? `, drawn with its y axis to bearing ${r.site.bearingDeg.toFixed(0)}` : ''}. ${r.site.basis}`);
  out.push(r.site.obstructions.length ? `  shade declared on the site: ${r.site.obstructions.map((o) => `${o.id} (${o.kind})`).join(', ')}` : '  nothing is declared on the site that would cast shade');
  out.push(`  sunrise to sunset: ${r.possibleHours[summer]!.toFixed(1)} h in ${names[summer]}, ${r.possibleHours[winter]!.toFixed(1)} h in ${names[winter]}`);
  out.push(r.acts ? '  light acts in this run: on growth, and on flowering where a profile ties flowers to sun' : '  light is reported here and was told not to act: growth and flowering are as the models give them');
  out.push(`  the structure, by the side a stretch of route faces, with the leaf of ${year} on it`);
  out.push(`    ${'side'.padEnd(8)}${'route'.padStart(8)}${`sun ${names[summer]}`.padStart(10)}${`sun ${names[winter]}`.padStart(10)}${'light, summer half'.padStart(20)}${`light, ${names[winter]}`.padStart(12)}`);
  for (const s of r.sides) {
    out.push(`    ${(s.facing === 'up' ? 'the top' : s.facing).padEnd(8)}${`${s.routeM.toFixed(0)} m`.padStart(8)}${`${s.midsummerHours.toFixed(1)} h`.padStart(10)}${`${s.midwinterHours.toFixed(1)} h`.padStart(10)}${pct(s.summerShare).padStart(20)}${pct(s.midwinterShare).padStart(12)}`);
  }
  out.push('  each plant, where it stood and climbed, against what its profile accepts');
  out.push(`    ${'plant'.padEnd(idW)}${'side'.padEnd(18)}${`sun ${names[summer]}`.padStart(8)}  ${'which is'.padEnd(15)}${'light'.padStart(6)}${'growth'.padStart(8)}${'flowers'.padStart(9)}  profile`);
  for (const p of r.plants) {
    const verdict = p.light === 'within' ? '' : p.light === 'less_sun' ? ' LESS SUN THAN ASKED' : p.light === 'more_sun' ? ' MORE SUN THAN ASKED' : ' NOT READ';
    const aspect = p.aspect === 'not_as_asked' ? ` NOT ON THE SIDE NAMED (${p.reading.aspects.join(', ')})` : '';
    out.push(
      `    ${p.plantId.padEnd(idW)}${p.side.padEnd(18)}${`${p.midsummerHours.toFixed(1)} h`.padStart(8)}  ${SUN_CLASS_WORDS[p.sunClass].padEnd(15)}${pct(p.seasonShare).padStart(6)}${pct(p.growthFactor).padStart(8)}${(p.reading.floweringNeedsSun ? pct(p.floweringFactor) : '-').padStart(9)}  ${p.reading.words}${verdict}${aspect}`,
    );
  }
  out.push('  light: over the months the plant grows in. growth, flowers: what light multiplied the model\'s extension and chance of a flower bud by ("-": the profile does not tie flowers to sun)');
  for (const n of r.notes) out.push(`  ${n}`);
  return out;
}
