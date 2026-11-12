/**
 * A planting plan: which taxon goes in at which root station of a Bower.
 * With a Bower description (`bower/description.ts`) it makes a scenario for
 * any structure a designer draws, not only the two reference shells.
 */
import { z } from 'zod';
import type { Bower } from '../bower/types.ts';
import type { Site } from '../light/site.ts';
import { type Growable, annualRoutine, climbingRoseRoutine, groupThreeRoutine, wisteriaRoutine } from './scenarios.ts';
import type { GardenerEvent, Planting, Scenario } from './types.ts';
import type { Viewpoint } from './view.ts';

export const plantingPlanSchema = z.strictObject({
  schemaVersion: z.literal(1),
  name: z.string().min(1),
  plants: z
    .array(
      z.strictObject({
        /** A name for this plant in the log and the report. */
        plantId: z.string().min(1),
        /** A folder name under `species/`. */
        taxonId: z.string().min(1),
        /** A station id from the Bower description. */
        stationId: z.string().min(1),
      }),
    )
    .min(1),
});
export type PlantingPlan = z.infer<typeof plantingPlanSchema>;

export function parsePlantingPlan(input: unknown, source = 'planting plan'): PlantingPlan {
  const parsed = plantingPlanSchema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
    throw new Error(`${source} is not a valid planting plan:\n${issues}`);
  }
  return parsed.data;
}

/**
 * The pruning routines the model acts on, by taxon. A list and not a rule:
 * what suits one plant is not inferred for another that resembles it.
 */
export const MODELLED_ROUTINE: Readonly<Record<string, 'wisteria_two_prunes' | 'cut_down_each_february' | 'climbing_rose_group_17'>> = {
  'wisteria-sinensis': 'wisteria_two_prunes',
  'wisteria-floribunda-macrobotrys': 'wisteria_two_prunes',
  'clematis-viticella-etoile-violette': 'cut_down_each_february',
  'clematis-princess-diana': 'cut_down_each_february',
  'rosa-the-generous-gardener': 'climbing_rose_group_17',
};

export interface PlantingOptions {
  taxa: Growable;
  plantingYear?: number;
  years?: number;
  seed?: number;
  /** `trained`: growth is tied in, and each plant gets the routine the model can act on. `untended`: planted and left. */
  care?: 'trained' | 'untended';
  viewpoints?: readonly Viewpoint[];
  /** Where the Bower stands, if not where its own description says. */
  site?: Site;
}

/** A scenario from a Bower and a planting plan. Perennials go in on 12 March, annuals on 20 May. */
export function plantingOn(bower: Bower, plan: PlantingPlan, options: PlantingOptions): Scenario {
  const { taxa, plantingYear = 2027, years = 12, seed = 7, care = 'trained', viewpoints = [], site } = options;
  const seen = new Set<string>();
  const plantings: Planting[] = [];
  const events: GardenerEvent[] = [];
  for (const p of plan.plants) {
    if (seen.has(p.plantId)) throw new Error(`planting plan "${plan.name}": the plant id "${p.plantId}" is used twice`);
    seen.add(p.plantId);
    const taxon = taxa.get(p.taxonId);
    if (!taxon) throw new Error(`planting plan "${plan.name}": "${p.taxonId}" cannot be grown. Taxa with a growth model: ${[...taxa.keys()].sort().join(', ')}`);
    if (!bower.rootStations.some((s) => s.id === p.stationId)) {
      throw new Error(`planting plan "${plan.name}": ${bower.name} has no root station "${p.stationId}". It has: ${bower.rootStations.map((s) => s.id).join(', ')}`);
    }
    const annual = taxon.profile.ukCultivation === 'annual_replant';
    plantings.push({ plantId: p.plantId, taxonId: p.taxonId, stationId: p.stationId, date: `${plantingYear}-${annual ? '05-20' : '03-12'}`, tieToTimber: care === 'trained' });
    if (care !== 'trained') continue;
    const routine = MODELLED_ROUTINE[p.taxonId];
    if (routine === 'wisteria_two_prunes') events.push(...wisteriaRoutine(p.plantId, plantingYear, years));
    if (routine === 'cut_down_each_february') events.push(...groupThreeRoutine(p.plantId, plantingYear, years));
    if (routine === 'climbing_rose_group_17') events.push(...climbingRoseRoutine(p.plantId, plantingYear, years));
    if (annual) events.push(...annualRoutine(p.plantId, plantingYear, years));
  }
  return { name: `${plan.name} on ${bower.name}, ${care}`, start: `${plantingYear}-03-01`, seed, bower, taxa, plantings, events, viewpoints: [...viewpoints], ...(site ? { site } : {}) };
}
