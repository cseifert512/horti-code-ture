/**
 * Where the sun is, for a site, a day of the year and an hour.
 *
 * Astronomy, not a plant parameter. It is built on the same declination as
 * `dayLengthHours` in `calendar.ts`, so the hours between sunrise and sunset
 * here are the day length there. Good to about a degree, which is finer than
 * anything the light model does with it: no refraction, no parallax, a flat
 * horizon, and a year of 365 equal days.
 *
 * Directions are given in the Bower's own frame (x east, y north, z up), with
 * the site's bearing taken into account: a Bower drawn with its y axis to
 * some other bearing has the sun turned to match.
 */
import { solarDeclinationRad } from '../calendar.ts';
import { type Vec3, v3 } from '../math/vec3.ts';
import type { Site } from './site.ts';

const RAD = Math.PI / 180;

export interface SunPosition {
  /** Degrees above the horizon; negative below it. */
  elevationDeg: number;
  /** Compass bearing of the sun, degrees clockwise from true north. */
  azimuthDeg: number;
  /** Unit vector towards the sun in the Bower's frame. */
  direction: Vec3;
}

/**
 * Minutes by which the sun runs ahead of a steady clock on a day of the year
 * (the equation of time), from the usual two-term approximation. At most a
 * quarter of an hour either way.
 */
export function equationOfTimeMinutes(dayOfYear: number): number {
  const b = (2 * Math.PI * (dayOfYear - 81)) / 364;
  return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
}

/** Local solar time, in hours, at a clock time given in UTC. Noon is when the sun is due south (or north). */
export function solarHour(site: Pick<Site, 'longitudeDeg'>, dayOfYear: number, utcHour: number): number {
  return utcHour + site.longitudeDeg / 15 + equationOfTimeMinutes(dayOfYear) / 60;
}

/** The sun at a local solar hour (12 = solar noon). */
export function sunAtSolarHour(site: Pick<Site, 'latitudeDeg' | 'bearingDeg'>, dayOfYear: number, hour: number): SunPosition {
  const lat = site.latitudeDeg * RAD;
  const dec = solarDeclinationRad(dayOfYear);
  const h = (hour - 12) * 15 * RAD;
  // towards the sun, as east, north and up at the site
  const east = -Math.cos(dec) * Math.sin(h);
  const north = Math.cos(lat) * Math.sin(dec) - Math.sin(lat) * Math.cos(dec) * Math.cos(h);
  const up = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(h);
  const azimuth = Math.atan2(east, north);
  // in the drawing's frame, whose y axis points to the site's bearing
  const turned = azimuth - site.bearingDeg * RAD;
  const flat = Math.hypot(east, north);
  return {
    elevationDeg: Math.asin(Math.max(-1, Math.min(1, up))) / RAD,
    azimuthDeg: ((azimuth / RAD) % 360 + 360) % 360,
    direction: v3(flat * Math.sin(turned), flat * Math.cos(turned), up),
  };
}

/** The sun at a clock time in UTC (Greenwich Mean Time; British Summer Time is an hour ahead of it). */
export function sunAt(site: Pick<Site, 'latitudeDeg' | 'longitudeDeg' | 'bearingDeg'>, dayOfYear: number, utcHour: number): SunPosition {
  return sunAtSolarHour(site, dayOfYear, solarHour(site, dayOfYear, utcHour));
}

/** Sunrise and sunset as local solar hours, or null in polar night. In the midnight sun they are 0 and 24. */
export function daylight(latitudeDeg: number, dayOfYear: number): { rise: number; set: number } | null {
  const x = -Math.tan(latitudeDeg * RAD) * Math.tan(solarDeclinationRad(dayOfYear));
  if (x >= 1) return null;
  const half = x <= -1 ? 12 : Math.acos(x) / (15 * RAD);
  return { rise: 12 - half, set: 12 + half };
}

/**
 * Strength of the direct beam on a clear day at a given height of the sun, as
 * a share of what it would be with the sun overhead and no air in the way.
 * Air mass after Kasten and Young (1989); the beam after Meinel and Meinel
 * (1976). It is here only so that an hour of low sun does not count for as
 * much light as an hour of high sun.
 */
export function clearSkyBeam(elevationDeg: number): number {
  if (elevationDeg <= 0) return 0;
  const airMass = 1 / (Math.sin(elevationDeg * RAD) + 0.50572 * Math.pow(elevationDeg + 6.07995, -1.6364));
  return Math.pow(0.7, Math.pow(airMass, 0.678));
}

export interface SunSample {
  /** Local solar hour at the middle of the step. */
  hour: number;
  elevationDeg: number;
  direction: Vec3;
  /** Length of the step, in hours. */
  hours: number;
  /** Relative strength of the clear-sky beam. */
  beam: number;
}

/** The sun's path across one day, in equal steps from sunrise to sunset. */
export function sunPath(site: Pick<Site, 'latitudeDeg' | 'bearingDeg'>, dayOfYear: number, stepMinutes = 20): SunSample[] {
  const day = daylight(site.latitudeDeg, dayOfYear);
  if (!day) return [];
  const n = Math.max(1, Math.round(((day.set - day.rise) * 60) / stepMinutes));
  const step = (day.set - day.rise) / n;
  const out: SunSample[] = [];
  for (let i = 0; i < n; i++) {
    const hour = day.rise + (i + 0.5) * step;
    const s = sunAtSolarHour(site, dayOfYear, hour);
    if (s.elevationDeg <= 0) continue;
    out.push({ hour, elevationDeg: s.elevationDeg, direction: s.direction, hours: step, beam: clearSkyBeam(s.elevationDeg) });
  }
  return out;
}

/** Day of the year of the 15th of each month, in a year that is not a leap year: the day each month is read on. */
export const MID_MONTH_DOY: readonly number[] = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349];
