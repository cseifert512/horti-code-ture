// Runs the core's reference scenarios in the browser and returns their render
// data, the Bower each was grown on, and the core's design report of the run.
// All growth happens in @horti/core; the taxon profiles and growth models are
// the repository's own files, validated by the core as it loads them.
import { type Bower, type DesignReport, type Growable, type PlantingPlan, type RenderData, type Scenario, Simulation, type Viewpoint, designReport, mixedOnVault, parseGrowthModel, parseTaxon, referencePalette, toRenderData, wisteriaOnHemisphere, wisteriaOnVault } from '@horti/core';
import { type Care, DEFAULT_SEED, PLANTING_YEAR, growPlanting, lastDateOf } from './grow.ts';

export type { Care };

// every taxon folder under species/: the profile, and the growth model where there is one
const PROFILES = import.meta.glob('../../../../species/*/taxon.json', { eager: true, import: 'default' });
const MODELS = import.meta.glob('../../../../species/*/model.json', { eager: true, import: 'default' });
const idOf = (path: string): string => path.split('/').at(-2)!;

/**
 * 'wisteria'      Wisteria sinensis at every root station
 * 'mixed'         the first mixed planting, on the vault
 * 'palette'       the KEY.md reference palette, twelve plants round the hemisphere
 * 'palette-ivy'   the same with ivy in place of the second evergreen honeysuckle
 */
export type Planting = 'wisteria' | 'mixed' | 'palette' | 'palette-ivy';

export interface ScenarioRun {
  data: RenderData;
  /** The Bower the scenario was grown on, which is the one to draw it on. */
  bower: Bower;
  /** The core's design report of the run. Worked out when first asked for: it takes about as long as the run itself. */
  report(): DesignReport;
  /** Time the simulation took, ms. */
  ms: number;
}

let TAXA: Growable | null = null;
const FAULTS = new Map<string, string>();
/**
 * Every taxon that has both a profile and a growth model. A taxon whose files
 * the core refuses is left out, and the reason kept (`growFault`), so that one
 * taxon's file being wrong does not stop the others being grown.
 */
export function growable(): Growable {
  if (!TAXA) {
    const profiles = new Map(Object.entries(PROFILES).map(([path, json]) => [idOf(path), json]));
    const taxa = new Map<string, Growable extends ReadonlyMap<string, infer T> ? T : never>();
    for (const [path, model] of Object.entries(MODELS)) {
      const id = idOf(path);
      try {
        taxa.set(id, { profile: parseTaxon(profiles.get(id), `species/${id}/taxon.json`), model: parseGrowthModel(model, `species/${id}/model.json`) });
      } catch (e) {
        FAULTS.set(id, e instanceof Error ? e.message : String(e));
      }
    }
    TAXA = taxa;
  }
  return TAXA;
}

/** Why a taxon cannot be grown although it has a growth model: what the core said of its files. */
export function growFault(taxonId: string): string | undefined {
  growable();
  return FAULTS.get(taxonId);
}

/** The ids of every folder under species/, grown or not. */
export const SPECIES_IDS: readonly string[] = Object.keys(PROFILES).map(idOf).sort();

/** Whether a planting has a scenario on a Bower: the mixed planting is written for the vault, the palette for the hemisphere. */
export function canGrow(planting: Planting, on: 'vault' | 'hemisphere'): boolean {
  return planting === 'wisteria' || (planting === 'mixed' ? on === 'vault' : on === 'hemisphere');
}

/** Years each planting is run for, as the core's command line runs it. */
const YEARS: Record<Planting, number> = { wisteria: 10, mixed: 10, palette: 12, 'palette-ivy': 12 };

/**
 * Grow a reference scenario as `npm run simulate` does:
 *   wisteria on the vault        two plants, one at each planted rib foot
 *   wisteria on the hemisphere   three plants round the 15 m shell
 *   mixed on the vault           the wisterias, an evergreen honeysuckle, a summer
 *                                clematis and a winter clematis
 *   palette on the hemisphere    twelve plants, one at the foot of each rib
 */
export function growScenario(planting: Planting, on: 'vault' | 'hemisphere', care: Care, years = YEARS[planting], seed = DEFAULT_SEED): ScenarioRun {
  if (!canGrow(planting, on)) throw new Error(`there is no ${planting} scenario on the ${on}`);
  const options = { taxa: growable(), care, years, seed, plantingYear: PLANTING_YEAR };
  const scenario =
    planting === 'palette' || planting === 'palette-ivy'
      ? referencePalette({ ...options, ivy: planting === 'palette-ivy' })
      : planting === 'mixed'
        ? mixedOnVault(options)
        : on === 'vault'
          ? wisteriaOnVault(options)
          : wisteriaOnHemisphere(options);
  const t0 = performance.now();
  return finish(scenario, new Simulation(scenario).runUntil(lastDateOf(years)), t0);
}

/**
 * Grow a planting plan on a designed Bower: any structure read from a file,
 * with the viewpoints its description gave for the report's coverage figures.
 */
export function growDesign(design: { bower: Bower; plan: PlantingPlan; viewpoints: readonly Viewpoint[] }, care: Care, years: number, seed = DEFAULT_SEED): ScenarioRun {
  const t0 = performance.now();
  const { scenario, sim } = growPlanting(design, growable(), care, years, seed);
  return finish(scenario, sim, t0);
}

function finish(scenario: Scenario, sim: Simulation, t0: number): ScenarioRun {
  const data = toRenderData(sim);
  const ms = performance.now() - t0;
  let report: DesignReport | null = null;
  return { data, bower: scenario.bower, report: () => (report ??= designReport(sim)), ms };
}
