/**
 * The leaf of one season, read from render data, as something the light model
 * can shade by. A viewer that has a run's render data and not the simulation
 * itself uses this to show light on the structure as it stood in a year.
 */
import { Calendar } from '../calendar.ts';
import type { RenderData } from '../render/contract.ts';
import { leafSilhouetteAreaM2 } from '../sim/view.ts';
import { type Foliage, clumpLeaves, foliageOf } from './exposure.ts';

/** The leaf that was on the plants in the summer of `year`; undefined where there was none. */
export function foliageFromRenderData(data: RenderData, year: number): Foliage | undefined {
  const cal = new Calendar(data.start);
  const midsummer = cal.dayOf(`${year}-07-01`);
  const number = new Map(data.plants.map((p, i) => [p.id, i]));
  const deciduous = new Map<string, number>();
  const leaves: { x: number; y: number; z: number; areaM2: number; evergreen: boolean; plant: number }[] = [];
  for (const leaf of data.leaves) {
    if (leaf.firstYear > year || (leaf.lastYear !== null && leaf.lastYear < year)) continue;
    if (leaf.bornDay > midsummer || (leaf.removedDay >= 0 && leaf.removedDay <= midsummer)) continue;
    const areaM2 = leafSilhouetteAreaM2(leaf.lengthM);
    leaves.push({ x: leaf.position[0], y: leaf.position[1], z: leaf.position[2], areaM2, evergreen: leaf.evergreen, plant: number.get(leaf.plantId) ?? -2 });
    if (!leaf.evergreen) deciduous.set(leaf.plantId, (deciduous.get(leaf.plantId) ?? 0) + areaM2);
  }
  if (!leaves.length) return undefined;
  // how much of the deciduous leaf is out in the middle of each month, by the dates each plant kept that year
  const out = new Array<number>(12).fill(0);
  let total = 0;
  for (const [plantId, area] of deciduous) {
    const season = data.seasons.find((s) => s.plantId === plantId && s.year === year);
    if (!season) continue;
    const flush = (season.leafFlush[0] + season.leafFlush[1]) / 2;
    const fall = (season.leafFall[0] + season.leafFall[1]) / 2;
    for (let m = 0; m < 12; m++) {
      const day = cal.dayOf(`${year}-${String(m + 1).padStart(2, '0')}-15`);
      if (day >= flush && day <= fall) out[m]! += area;
    }
    total += area;
  }
  return foliageOf(clumpLeaves(leaves), out.map((a) => (total > 0 ? a / total : 0)));
}
