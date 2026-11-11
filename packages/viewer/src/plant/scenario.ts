// Runs the core's reference scenarios in the browser and returns their render
// data, with the Bower each was grown on. All growth happens in @horti/core;
// the taxon profiles and growth models are the repository's own files,
// validated by the core as it loads them.
import { type Bower, type Growable, type RenderData, Simulation, mixedOnVault, parseGrowthModel, parseTaxon, toRenderData, wisteriaOnHemisphere, wisteriaOnVault } from '@horti/core';
import freckles from '../../../../species/clematis-cirrhosa-freckles/model.json';
import frecklesTaxon from '../../../../species/clematis-cirrhosa-freckles/taxon.json';
import etoile from '../../../../species/clematis-viticella-etoile-violette/model.json';
import etoileTaxon from '../../../../species/clematis-viticella-etoile-violette/taxon.json';
import lonicera from '../../../../species/lonicera-henryi/model.json';
import loniceraTaxon from '../../../../species/lonicera-henryi/taxon.json';
import wisteria from '../../../../species/wisteria-sinensis/model.json';
import wisteriaTaxon from '../../../../species/wisteria-sinensis/taxon.json';

export type Care = 'trained' | 'untended';
/** 'wisteria': Wisteria sinensis at every root station. 'mixed': the first mixed planting, on the vault. */
export type Planting = 'wisteria' | 'mixed';

export interface ScenarioRun {
  data: RenderData;
  /** The Bower the scenario was grown on, which is the one to draw it on. */
  bower: Bower;
  /** Time the simulation took, ms. */
  ms: number;
}

let TAXA: Growable | null = null;
/** Every taxon that has both a profile and a growth model. */
function growable(): Growable {
  TAXA ??= new Map(
    (
      [
        ['wisteria-sinensis', wisteriaTaxon, wisteria],
        ['lonicera-henryi', loniceraTaxon, lonicera],
        ['clematis-viticella-etoile-violette', etoileTaxon, etoile],
        ['clematis-cirrhosa-freckles', frecklesTaxon, freckles],
      ] as const
    ).map(([id, taxon, model]) => [id, { profile: parseTaxon(taxon, `species/${id}/taxon.json`), model: parseGrowthModel(model, `species/${id}/model.json`) }]),
  );
  return TAXA;
}

/** Whether a planting has a scenario on a Bower. The mixed planting is written for the vault. */
export const canGrow = (planting: Planting, on: 'vault' | 'hemisphere'): boolean => planting === 'wisteria' || on === 'vault';

/**
 * Grow a reference scenario as `npm run simulate` does:
 *   wisteria on the vault        two plants, one at each planted rib foot
 *   wisteria on the hemisphere   three plants round the 15 m shell
 *   mixed on the vault           the wisterias, an evergreen honeysuckle, a summer
 *                                clematis and a winter clematis, on a vault with
 *                                five root stations
 */
export function growScenario(planting: Planting, on: 'vault' | 'hemisphere', care: Care, years = 10, seed = 7): ScenarioRun {
  if (!canGrow(planting, on)) throw new Error(`there is no ${planting} scenario on the ${on}`);
  const plantingYear = 2027;
  const options = { taxa: growable(), care, years, seed, plantingYear };
  const scenario = planting === 'mixed' ? mixedOnVault(options) : on === 'vault' ? wisteriaOnVault(options) : wisteriaOnHemisphere(options);
  const t0 = performance.now();
  const sim = new Simulation(scenario).runUntil(`${plantingYear + years - 1}-12-31`);
  const data = toRenderData(sim);
  return { data, bower: scenario.bower, ms: performance.now() - t0 };
}
