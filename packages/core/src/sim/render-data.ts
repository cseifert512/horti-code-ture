/** Turn the state of a simulation into the render-data contract. */
import type { Vec3 } from '../math/vec3.ts';
import { summariseProvenance } from '../provenance.ts';
import { RENDER_CONTRACT, type RenderAppendage, type RenderData, type RenderFlower, type RenderFruit, type RenderLeaf, type RenderSeason, type RenderStem, type Triple } from '../render/contract.ts';
import type { Simulation } from './engine.ts';
import { modelProvenance, param } from './model.ts';
import { throughNewYear, windowFrom, windowTo } from './windows.ts';

const triple = (v: Vec3): Triple => [v.x, v.y, v.z];
// adding zero turns a rounded -0 into 0, which is what JSON would make of it anyway
const round = (x: number, places: number) => Math.round(x * 10 ** places) / 10 ** places + 0;
/** A direction, to four places: enough to draw by, and a quarter of the text. */
const unit = (v: Vec3): Triple => [round(v.x, 4), round(v.y, 4), round(v.z, 4)];
/** A place, to a hundredth of a millimetre. */
const point = (v: Vec3): Triple => [round(v.x, 5), round(v.y, 5), round(v.z, 5)];

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
    fruits: [],
    appendages: [],
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

    for (let year = plant.firstPlantedYear; year <= lastYear; year++) {
      const doy = (d: number) => cal.dayOfYearDay(year, d);
      const flush = param(model, 'phenology.leafFlushDoy');
      const colour = param(model, 'phenology.autumnColourDoy');
      const fall = param(model, 'phenology.leafFallDoy');
      const season: RenderSeason = {
        plantId: plant.id,
        year,
        budburstDay: doy(param(model, 'phenology.budburstDoy')),
        growthEndDay: doy(param(model, 'phenology.growthEndDoy')),
        // a flush that runs through the new year began the year before; a colouring or a fall that does ends the year after
        leafFlush: windowTo(cal, flush, year),
        autumnColour: windowFrom(cal, colour, year),
        leafFall: windowFrom(cal, fall, year),
      };
      // and what of last year's fall runs on into this year, or of next year's flush begins in it, is said in this year's entry
      if (throughNewYear(fall)) {
        season.autumnColourBefore = windowFrom(cal, colour, year - 1);
        season.leafFallBefore = windowFrom(cal, fall, year - 1);
      }
      if (throughNewYear(flush)) season.leafFlushAfter = windowTo(cal, flush, year + 1);
      data.seasons.push(season);
    }

    for (const id of plant.axisIds) {
      const a = sim.axes.get(id)!;
      if (a.contact.length < 2) continue;
      // the contract has no word for a flowering side shoot yet: it is short flowering wood, which is what it calls a spur
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
    const out: RenderLeaf = { plantId: leaf.plantId, stemId: leaf.axisId, position: triple(leaf.position), direction: triple(leaf.direction), lengthM: round(leaf.lengthM, 3), firstYear: leaf.firstYear, lastYear: leaf.lastYear, evergreen: leaf.evergreen, bornDay: leaf.bornDay, removedDay: leaf.removedDay ?? -1 };
    if (leaf.form !== undefined) out.form = leaf.form;
    out.stemPoint = leaf.pointIndex;
    data.leaves.push(out);
  }

  for (const bud of sim.buds) {
    if (bud.openDay === null || !bud.position) continue;
    const out: RenderFlower = {
      plantId: bud.plantId,
      stemId: bud.axisId,
      position: triple(bud.position),
      lengthM: round(bud.lengthM, 3),
      year: bud.floweringYear,
      developDay: bud.developDay,
      openDay: bud.openDay,
      // a flower cut off, or killed with its plant, is gone from that day
      spentDay: bud.spentDay ?? bud.endedDay ?? -1,
    };
    if (bud.direction) out.direction = unit(bud.direction);
    if (bud.form !== undefined) out.form = bud.form;
    if (bud.pointIndex !== null) out.stemPoint = bud.pointIndex;
    data.flowers.push(out);
  }

  for (const fruit of sim.fruits) {
    const out: RenderFruit = { plantId: fruit.plantId, stemId: fruit.axisId, position: point(fruit.position), lengthM: round(fruit.lengthM, 3), year: fruit.year, swell: [fruit.swell[0], fruit.swell[1]], ripen: [fruit.ripen[0], fruit.ripen[1]], removedDay: fruit.removedDay ?? -1 };
    if (fruit.direction) out.direction = unit(fruit.direction);
    out.stemPoint = fruit.pointIndex;
    if (fruit.form !== undefined) out.form = fruit.form;
    data.fruits.push(out);
  }

  for (const a of sim.appendages) {
    const out: RenderAppendage = { plantId: a.plantId, stemId: a.axisId, kind: a.kind, position: point(a.position), direction: unit(a.direction), lengthM: round(a.lengthM, 4), holding: a.holding, stemPoint: a.pointIndex, bornDay: a.bornDay, removedDay: a.removedDay ?? -1 };
    if (a.heldDiameterMm !== null) out.heldDiameterMm = round(a.heldDiameterMm, 1);
    data.appendages.push(out);
  }

  data.assumptions = summariseProvenance(provenance);
  return data;
}
