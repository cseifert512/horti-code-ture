/** Turn the state of a simulation into the render-data contract. */
import type { Vec3 } from '../math/vec3.ts';
import { summariseProvenance } from '../provenance.ts';
import { RENDER_CONTRACT, type RenderData, type RenderSeason, type RenderStem, type Triple } from '../render/contract.ts';
import type { Simulation } from './engine.ts';
import { modelProvenance, param } from './model.ts';

const triple = (v: Vec3): Triple => [v.x, v.y, v.z];
// adding zero turns a rounded -0 into 0, which is what JSON would make of it anyway
const round = (x: number, places: number) => Math.round(x * 10 ** places) / 10 ** places + 0;

export function toRenderData(sim: Simulation): RenderData {
  const cal = sim.calendar;
  const lastDay = Math.max(0, sim.day);
  const lastYear = cal.dateOf(lastDay).year;
  const data: RenderData = {
    contract: RENDER_CONTRACT,
    scenario: sim.scenario.name,
    start: sim.scenario.start,
    lastDay,
    frame: 'right-handed, metres, x east, y north, z up',
    plants: [],
    stems: [],
    leaves: [],
    flowers: [],
    seasons: [],
    events: sim.events.map((e) => ({ day: e.day, date: e.date, plantId: e.plantId, type: e.type, outcome: e.outcome })),
    thickening: { tipRadiusMm: 2, exponent: 1.35 },
    statement: 'A scenario, not a forecast. Growth rates, dates and flowering chances are provisional assumptions that have not been measured on plants.',
    assumptions: summariseProvenance([]),
  };

  const provenance = [];
  const counted = new Set<string>();
  for (const plant of sim.plants.values()) {
    const taxon = sim.scenario.taxa.get(plant.taxonId)!;
    const { profile, model } = taxon;
    if (!counted.has(plant.taxonId)) provenance.push(...modelProvenance(model));
    counted.add(plant.taxonId);
    // bring thickness up to the last day; it only ever grows, so this is safe to repeat
    sim.thicken(plant);
    data.thickening.tipRadiusMm = Math.sqrt(param(model, 'thickening.tipRadiusSquaredMm2'));
    data.plants.push({ id: plant.id, taxonId: plant.taxonId, label: profile.names.label, stationId: plant.stationId, plantedDay: plant.plantedDay, leafHabit: profile.leafHabit.value, flowerDisplay: profile.flowering.display });

    for (let year = plant.plantedYear; year <= lastYear; year++) {
      const doy = (d: number) => cal.dayOfYearDay(year, d);
      const pair = (k: 'phenology.leafFlushDoy' | 'phenology.autumnColourDoy' | 'phenology.leafFallDoy'): [number, number] => {
        const [a, b] = param(model, k);
        return [doy(a), doy(b)];
      };
      const season: RenderSeason = {
        plantId: plant.id,
        year,
        budburstDay: doy(param(model, 'phenology.budburstDoy')),
        growthEndDay: doy(param(model, 'phenology.growthEndDoy')),
        leafFlush: pair('phenology.leafFlushDoy'),
        autumnColour: pair('phenology.autumnColourDoy'),
        leafFall: pair('phenology.leafFallDoy'),
      };
      data.seasons.push(season);
    }

    for (const id of plant.axisIds) {
      const a = sim.axes.get(id)!;
      if (a.contact.length < 2) continue;
      const stem: RenderStem = { id: a.id, plantId: plant.id, parentId: a.parent?.axisId ?? null, role: a.role, order: a.order, contact: [], away: [], bornDay: [], removedDay: [], radiusMm: [] };
      for (let i = 0; i < a.contact.length; i++) {
        const c = a.contact[i]!;
        const w = a.away[i]!;
        stem.contact.push(round(c.x, 5), round(c.y, 5), round(c.z, 5));
        stem.away.push(round(w.x, 4), round(w.y, 4), round(w.z, 4));
        stem.bornDay.push(a.bornDayAt[i]!);
        stem.removedDay.push(a.removedDayAt[i] ?? -1);
        stem.radiusMm.push(round(a.radiusMm[i]!, 2));
      }
      data.stems.push(stem);
    }
  }

  for (const leaf of sim.leaves) {
    data.leaves.push({ plantId: leaf.plantId, stemId: leaf.axisId, position: triple(leaf.position), direction: triple(leaf.direction), lengthM: round(leaf.lengthM, 3), firstYear: leaf.firstYear, lastYear: leaf.lastYear, bornDay: leaf.bornDay, removedDay: leaf.removedDay ?? -1 });
  }

  for (const bud of sim.buds) {
    if (bud.openDay === null || !bud.position) continue;
    const plant = sim.plants.get(bud.plantId)!;
    const { model } = sim.scenario.taxa.get(plant.taxonId)!;
    data.flowers.push({
      plantId: bud.plantId,
      stemId: bud.axisId,
      position: triple(bud.position),
      lengthM: round(bud.lengthM, 3),
      year: bud.floweringYear,
      developDay: cal.dayOfYearDay(bud.floweringYear, param(model, 'phenology.budburstDoy')),
      openDay: bud.openDay,
      spentDay: bud.spentDay ?? -1,
    });
  }

  data.assumptions = summariseProvenance(provenance);
  return data;
}
