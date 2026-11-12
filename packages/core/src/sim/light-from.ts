/**
 * Which way the light is from a place: the one thing an unsupported shoot
 * asks about light (`free-shoot.ts`).
 *
 * The engine asks in this order, and takes the first answer:
 *   1. the scenario, where it gives a `lightFrom` of its own;
 *   2. the light model (`LightField.from` in `light.ts`): the sky as it is
 *      seen from the nearest place the model reads light at, with the timber,
 *      what the site declares and last season's leaf of other plants in the
 *      way;
 *   3. the open sky of the site, which is the default stated here, where the
 *      light model has no reading near enough, finds no light arriving at
 *      all, or has been told not to act on light.
 *
 * THE DEFAULT, and what it assumes: nothing stands in the way. Light then
 * comes from the whole sky alike and from the sun, in the shares the light
 * model takes for the climate (`LIGHT_MODEL.diffuseShare`). The sky's part
 * points straight up; the sun's part points to the sun's side, which for a
 * site in southern England is south and well up. So "towards the light" in
 * the open is close to plumb, leaning a little to the south. The site is the
 * scenario's, and southern England where it gives none (`DEFAULT_SITE`).
 */
import { LIGHT_MODEL } from '../light/model.ts';
import { DEFAULT_SITE, type Site } from '../light/site.ts';
import { sunPath } from '../light/sun.ts';
import { type Vec3, UP, normalize, v3 } from '../math/vec3.ts';

/**
 * The direction the light comes from at a place on a day of the year: a unit
 * vector pointing from the place towards the light, in the Bower's frame
 * (x east, y north, z up).
 */
export type LightFrom = (at: Vec3, dayOfYear: number) => Vec3;

/**
 * The sun's side on a day: the mean of the directions the sun shines from
 * between sunrise and sunset, each weighted by the strength of its beam.
 * Morning and afternoon cancel, so it points towards the equator and up; its
 * length, less than 1, says how far the sun's directions agree. Zero where
 * the sun does not rise.
 */
export function sunSide(site: Pick<Site, 'latitudeDeg' | 'bearingDeg'>, dayOfYear: number): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  let all = 0;
  for (const s of sunPath(site, dayOfYear, 20)) {
    const w = s.beam * s.hours;
    x += w * s.direction.x;
    y += w * s.direction.y;
    z += w * s.direction.z;
    all += w;
  }
  return all > 0 ? v3(x / all, y / all, z / all) : v3(0, 0, 0);
}

/**
 * Light from the whole sky and from the sun put together as one direction.
 * `sky` is the mean direction of the open sky (half of plumb, where all of it
 * is open) and `sun` the mean direction of the sun's beam that gets through.
 * Null where next to nothing arrives.
 */
export function mixLight(sky: Vec3, sun: Vec3, skyShare: number = LIGHT_MODEL.diffuseShare.value!): Vec3 | null {
  const x = skyShare * sky.x + (1 - skyShare) * sun.x;
  const y = skyShare * sky.y + (1 - skyShare) * sun.y;
  const z = skyShare * sky.z + (1 - skyShare) * sun.z;
  return Math.hypot(x, y, z) > 0.02 ? normalize(v3(x, y, z)) : null;
}

/** The light of an open sky on a site: the same wherever on the site it is asked. */
export function openSkyLight(site: Pick<Site, 'latitudeDeg' | 'bearingDeg'> = DEFAULT_SITE, skyShare: number = LIGHT_MODEL.diffuseShare.value!): LightFrom {
  const byDay = new Map<number, Vec3>();
  // the mean direction of a whole open sky, patch for patch, is half of plumb
  const sky = v3(0, 0, 0.5);
  return (_at, dayOfYear) => {
    let light = byDay.get(dayOfYear);
    if (!light) {
      const mixed = mixLight(sky, sunSide(site, dayOfYear), skyShare);
      byDay.set(dayOfYear, (light = mixed && mixed.z > 0 ? mixed : UP));
    }
    return light;
  };
}
