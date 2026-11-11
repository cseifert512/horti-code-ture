// Growing a planting plan on a Bower with the core, in one way wherever it is
// asked for: the viewer in the browser, and the portrait script in Node, must
// grow the same plant from the same files. Nothing here touches the file
// system, a bundler or a renderer; all growth happens in @horti/core.
import { type Bower, type Growable, type PlantingPlan, type Scenario, Simulation, type Viewpoint, plantingOn } from '@horti/core';

export type Care = 'trained' | 'untended';

/** The year every run of the viewer is planted in, as `npm run simulate` plants it. A run is a scenario, not a forecast: the year only names its days. */
export const PLANTING_YEAR = 2027;
/** The seed of every run, unless one is asked for. */
export const DEFAULT_SEED = 7;
/** The last day of a run of `years` years: 31 December of its last year. */
export const lastDateOf = (years: number): string => `${PLANTING_YEAR + years - 1}-12-31`;

/** Grow a planting plan on a Bower for `years` years. */
export function growPlanting(design: { bower: Bower; plan: PlantingPlan; viewpoints: readonly Viewpoint[] }, taxa: Growable, care: Care, years: number, seed = DEFAULT_SEED): { scenario: Scenario; sim: Simulation } {
  const scenario = plantingOn(design.bower, design.plan, { taxa, care, years, seed, plantingYear: PLANTING_YEAR, viewpoints: design.viewpoints });
  return { scenario, sim: new Simulation(scenario).runUntil(lastDateOf(years)) };
}
