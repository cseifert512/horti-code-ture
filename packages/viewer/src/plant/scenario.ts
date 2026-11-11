// Runs the core's reference scenario in the browser and returns its render
// data. All growth happens in @horti/core; the taxon profile and the growth
// model are the repository's own files, validated by the core as it loads them.
import { type RenderData, Simulation, parseGrowthModel, parseTaxon, toRenderData, wisteriaOnVault } from '@horti/core';
import modelJson from '../../../../species/wisteria-sinensis/model.json';
import taxonJson from '../../../../species/wisteria-sinensis/taxon.json';

export type Care = 'trained' | 'untended';

export interface ScenarioRun {
  data: RenderData;
  /** Time the simulation took, ms. */
  ms: number;
}

/** Two Wisteria sinensis on the vault segment, as `npm run simulate` grows them. */
export function growWisteriaOnVault(care: Care, years = 10, seed = 7): ScenarioRun {
  const taxa = new Map([
    [
      'wisteria-sinensis',
      {
        profile: parseTaxon(taxonJson, 'species/wisteria-sinensis/taxon.json'),
        model: parseGrowthModel(modelJson, 'species/wisteria-sinensis/model.json'),
      },
    ],
  ]);
  const plantingYear = 2027;
  const scenario = wisteriaOnVault({ taxa, care, years, seed, plantingYear });
  const t0 = performance.now();
  const sim = new Simulation(scenario).runUntil(`${plantingYear + years - 1}-12-31`);
  const data = toRenderData(sim);
  return { data, ms: performance.now() - t0 };
}
