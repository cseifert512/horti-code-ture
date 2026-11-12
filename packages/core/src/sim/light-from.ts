/**
 * Which way the light is from a place: the one thing an unsupported shoot
 * asks about light (`free-shoot.ts`).
 *
 * The engine asks through `LightFrom` and knows nothing else. Until a light
 * model answers, the answer is an assumption, stated here: an open sky with
 * nothing in the way, in southern England. A light model that knows the
 * structure, the site and the leaf already on it supplies its own function
 * as `Scenario.lightFrom`, and nothing in the engine changes.
 *
 * The astronomy is the same as `dayLengthHours` in `calendar.ts` (Cooper's
 * declination, a flat horizon, no refraction): good to about a degree, which
 * is far finer than anything a shoot does with it.
 */
import { type Vec3, UP, add, normalize, scale, v3 } from '../math/vec3.ts';
import type { Sourced } from '../provenance.ts';

/**
 * The direction the light comes from at a place on a day of the year, as a
 * unit vector pointing from the place towards the light, in the Bower's frame
 * (x east, y north, z up). Where a place is in the open this is close to
 * straight up, leaning to the sun's side; under a canopy or beside a wall it
 * is towards the gap.
 */
export type LightFrom = (at: Vec3, dayOfYear: number) => Vec3;

/** Where the open sky is assumed to be when a scenario does not say. PROJECT_CONTEXT.md section 4: the baseline is the temperate United Kingdom. */
export const ASSUMED_LATITUDE: Sourced<number> = {
  value: 51.5,
  unit: 'degrees north',
  status: 'provisional_design_assumption',
  basis: 'No site is given to the growth engine yet. Southern England is assumed, at the latitude of London, with the drawing\'s y axis to true north. An assumption about where, not a finding: a real site gives its own.',
};

/** Of the light a shoot in the open turns to, the share that comes from the whole sky and not straight from the sun. */
export const SKY_SHARE_OF_LIGHT: Sourced<number> = {
  value: 0.55,
  status: 'provisional_design_assumption',
  basis: 'Under British skies about half of the light of a growing season arrives scattered by cloud and sky. A round figure, not taken from a station record; it decides only how far "towards the light" leans from straight up towards the south.',
  range: [0.4, 0.7],
};

const RAD = Math.PI / 180;

/**
 * The sun's side on a day: the mean of the directions the sun shines from
 * between sunrise and sunset, each weighted by the strength of its beam.
 * Morning and afternoon cancel, so it points south (north, south of the
 * tropics in their summer) and up; its length, less than 1, says how far the
 * sun's directions agree. Zero in polar night.
 */
export function sunSide(latitudeDeg: number, dayOfYear: number): Vec3 {
  const lat = latitudeDeg * RAD;
  const dec = 23.44 * RAD * Math.sin((2 * Math.PI * (284 + dayOfYear)) / 365);
  let east = 0;
  let north = 0;
  let up = 0;
  let total = 0;
  const steps = 96;
  for (let i = 0; i < steps; i++) {
    const h = ((i + 0.5) / steps - 0.5) * 2 * Math.PI;
    const z = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(h);
    if (z <= 0) continue;
    // strength of the clear-sky beam at this height of the sun: air mass after Kasten and Young 1989, the beam after Meinel and Meinel 1976
    const elevationDeg = Math.asin(Math.min(1, z)) / RAD;
    const airMass = 1 / (z + 0.50572 * Math.pow(elevationDeg + 6.07995, -1.6364));
    const beam = Math.pow(0.7, Math.pow(airMass, 0.678));
    east += beam * -Math.cos(dec) * Math.sin(h);
    north += beam * (Math.cos(lat) * Math.sin(dec) - Math.sin(lat) * Math.cos(dec) * Math.cos(h));
    up += beam * z;
    total += beam;
  }
  return total > 0 ? v3(east / total, north / total, up / total) : v3(0, 0, 0);
}

/**
 * The light of an open sky at a latitude: the same everywhere on the site,
 * straight up for the share that comes from the sky and from the sun's side
 * for the rest.
 */
export function openSkyLight(latitudeDeg: number = ASSUMED_LATITUDE.value!, skyShare: number = SKY_SHARE_OF_LIGHT.value!): LightFrom {
  const byDay = new Map<number, Vec3>();
  return (_at, dayOfYear) => {
    let light = byDay.get(dayOfYear);
    if (!light) {
      const mixed = normalize(add(scale(UP, skyShare), scale(sunSide(latitudeDeg, dayOfYear), 1 - skyShare)));
      byDay.set(dayOfYear, (light = mixed.z > 0 ? mixed : UP));
    }
    return light;
  };
}
