// Runs the core's reference scenarios in the browser and returns their render
// data. All growth happens in @horti/core; the taxon profile and the growth
// model are the repository's own files, validated by the core as it loads them.
import { type RenderData, Simulation, parseGrowthModel, parseTaxon, toRenderData, wisteriaOnHemisphere, wisteriaOnVault } from '@horti/core';
import modelJson from '../../../../species/wisteria-sinensis/model.json';
import taxonJson from '../../../../species/wisteria-sinensis/taxon.json';

export type Care = 'trained' | 'untended';

export interface ScenarioRun {
  data: RenderData;
  /** Time the simulation took, ms. */
  ms: number;
}

/**
 * Wisteria sinensis at every root station of a reference Bower, as
 * `npm run simulate` grows it: two plants on the vault segment, three on the
 * 15 m hemisphere. Both scenarios build the Bower with its defaults, which is
 * the one the viewer shows.
 */
export function growWisteria(on: 'vault' | 'hemisphere', care: Care, years = 10, seed = 7): ScenarioRun {
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
  const scenario = (on === 'vault' ? wisteriaOnVault : wisteriaOnHemisphere)({ taxa, care, years, seed, plantingYear });
  const t0 = performance.now();
  const sim = new Simulation(scenario).runUntil(`${plantingYear + years - 1}-12-31`);
  const data = toRenderData(sim);
  return { data, ms: performance.now() - t0 };
}
