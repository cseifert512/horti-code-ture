/**
 * Reference scenarios.
 *
 * DEVELOPMENT_GUIDE.md, "smallest valuable first deliverable": trained
 * Wisteria sinensis on a curved Bower segment, over years, with flower buds
 * that survive or are removed by gardening, and a readable action log. "Then
 * add one evergreen honeysuckle and one Group 3 clematis on separate routes."
 */
import { makeHemisphereBower } from '../bower/hemisphere.ts';
import { makeVaultBower } from '../bower/vault.ts';
import { v3 } from '../math/vec3.ts';
import type { TaxonProfile } from '../taxon.ts';
import type { GrowthModel } from './model.ts';
import type { GardenerEvent, Planting, Scenario } from './types.ts';
import type { Viewpoint } from './view.ts';

export type Growable = ReadonlyMap<string, { profile: TaxonProfile; model: GrowthModel }>;

export interface VaultScenarioOptions {
  taxa: Growable;
  /** Calendar year of planting; planting day is 12 March. */
  plantingYear?: number;
  /** Number of years of gardening to script. */
  years?: number;
  seed?: number;
  /**
   * 'trained'    a gardener ties growth in and prunes each plant by its own RHS routine
   * 'untended'   nobody touches the plants after planting
   */
  care?: 'trained' | 'untended';
}
/** Kept for callers written against the first scenario. */
export type WisteriaVaultOptions = VaultScenarioOptions;

/** Three places a visitor to the vault segment stands. Eye height 1.6 m; the vault runs north to south. */
export const VAULT_VIEWPOINTS: readonly Viewpoint[] = [
  { id: 'approach', label: 'Walking in from the south end', eye: v3(0, -7, 1.6), target: v3(0, 0, 2.4), fovDeg: 50 },
  { id: 'inside', label: 'Standing inside, looking up and along', eye: v3(0, -1.2, 1.6), target: v3(0, 1.5, 3.1), fovDeg: 70 },
  { id: 'lawn', label: 'From the lawn to the west', eye: v3(-9, -2, 1.6), target: v3(0, 0, 2), fovDeg: 40 },
];

function need(taxa: Growable, ...ids: string[]): void {
  for (const id of ids) if (!taxa.has(id)) throw new Error(`this scenario needs the profile and growth model of ${id}`);
}

/** RHS routine for wisteria: winter prune in January or February, summer prune in July or August. */
function wisteriaRoutine(plantId: string, plantingYear: number, years: number): GardenerEvent[] {
  const events: GardenerEvent[] = [];
  for (let y = 0; y < years; y++) {
    const year = plantingYear + y;
    if (y > 0) events.push({ id: `winter-${year}-${plantId}`, date: `${year}-01-20`, type: 'spur_prune', plantId, season: 'winter', author: 'gardener', reason: 'RHS routine: cut back to two or three buds' });
    events.push({ id: `monitor-${year}-${plantId}`, date: `${year}-05-15`, type: 'monitor', plantId, author: 'gardener', reason: 'check flowering and ties' });
    events.push({ id: `summer-${year}-${plantId}`, date: `${year}-08-01`, type: 'spur_prune', plantId, season: 'summer', author: 'gardener', reason: 'RHS routine: cut whippy growth back to five or six leaves' });
  }
  return events;
}

/** RHS routine for a Group 3 clematis: every stem cut to 15-30 cm in February or March. */
function groupThreeRoutine(plantId: string, plantingYear: number, years: number): GardenerEvent[] {
  const events: GardenerEvent[] = [];
  for (let y = 1; y < years; y++) {
    const year = plantingYear + y;
    events.push({ id: `cutdown-${year}-${plantId}`, date: `${year}-02-20`, type: 'hard_prune', plantId, target: { allStems: true }, keepM: 0.25, author: 'gardener', reason: 'RHS group 3: cut all stems to 15-30 cm' });
  }
  return events;
}

/** Two Wisteria sinensis on the barrel-vault segment, one at each planted rib foot. */
export function wisteriaOnVault(options: VaultScenarioOptions): Scenario {
  const { taxa, plantingYear = 2027, years = 12, seed = 7, care = 'trained' } = options;
  need(taxa, 'wisteria-sinensis');
  const bower = makeVaultBower();
  const plantings: Planting[] = bower.rootStations.map((s, i) => ({ plantId: `wisteria.${i}`, taxonId: 'wisteria-sinensis', stationId: s.id, date: `${plantingYear}-03-12`, tieToTimber: care === 'trained' }));
  const events = care === 'trained' ? plantings.flatMap((p) => wisteriaRoutine(p.plantId, plantingYear, years)) : [];
  return { name: `Wisteria sinensis on the vault segment, ${care}`, start: `${plantingYear}-03-01`, seed, bower, taxa, plantings, events, viewpoints: VAULT_VIEWPOINTS };
}

/**
 * The first mixed planting: the two wisterias as before, an evergreen
 * honeysuckle (Lonicera henryi) at the west foot of rib 3, a Group 3 clematis
 * ('Étoile Violette') at the east foot of rib 1, and a winter-flowering
 * Group 1 clematis ('Freckles') at the west foot of rib 2. Three ways of
 * holding the structure and four flowering habits, with something in flower
 * in spring, summer and winter.
 */
export function mixedOnVault(options: VaultScenarioOptions): Scenario {
  const { taxa, plantingYear = 2027, years = 12, seed = 7, care = 'trained' } = options;
  need(taxa, 'wisteria-sinensis', 'lonicera-henryi', 'clematis-viticella-etoile-violette', 'clematis-cirrhosa-freckles');
  const bower = makeVaultBower({
    stations: [
      { side: 0, rib: 1 },
      { side: 1, rib: 3 },
      { side: 0, rib: 3 },
      { side: 1, rib: 1 },
      { side: 0, rib: 2 },
    ],
  });
  const date = `${plantingYear}-03-12`;
  const tieToTimber = care === 'trained';
  const plantings: Planting[] = [
    { plantId: 'wisteria.0', taxonId: 'wisteria-sinensis', stationId: 'station.0', date, tieToTimber },
    { plantId: 'wisteria.1', taxonId: 'wisteria-sinensis', stationId: 'station.1', date, tieToTimber },
    { plantId: 'honeysuckle', taxonId: 'lonicera-henryi', stationId: 'station.2', date, tieToTimber },
    { plantId: 'clematis', taxonId: 'clematis-viticella-etoile-violette', stationId: 'station.3', date, tieToTimber },
    // Group 1: pruned lightly after flowering if at all, which the model does not act on yet, so it has no routine here
    { plantId: 'winter-clematis', taxonId: 'clematis-cirrhosa-freckles', stationId: 'station.4', date, tieToTimber },
  ];
  const events = care === 'trained' ? [...wisteriaRoutine('wisteria.0', plantingYear, years), ...wisteriaRoutine('wisteria.1', plantingYear, years), ...groupThreeRoutine('clematis', plantingYear, years)] : [];
  return { name: `Wisteria, evergreen honeysuckle, summer clematis and winter clematis on the vault segment, ${care}`, start: `${plantingYear}-03-01`, seed, bower, taxa, plantings, events, viewpoints: VAULT_VIEWPOINTS };
}

/** Three places a visitor to the 15 m hemisphere stands. Eye height 1.6 m. */
export const HEMISPHERE_VIEWPOINTS: readonly Viewpoint[] = [
  { id: 'approach', label: 'Approaching from the south', eye: v3(0, -17, 1.6), target: v3(0, 0, 4), fovDeg: 50 },
  { id: 'inside', label: 'Standing inside, looking up to the crown', eye: v3(0, -2.5, 1.6), target: v3(0, 1.5, 7.2), fovDeg: 80 },
  { id: 'rim', label: 'Standing at the rim, looking across', eye: v3(-6.6, 0, 1.6), target: v3(3, 0, 5), fovDeg: 75 },
];

/**
 * The specification's reference shell at building scale: a 15 m hemisphere
 * with a Wisteria sinensis at each of three root stations. The crown is 7.5 m
 * up and 11.78 m away by the shortest route, which is the point of running it:
 * to see how far a plant gets, and when.
 */
export function wisteriaOnHemisphere(options: VaultScenarioOptions): Scenario {
  const { taxa, plantingYear = 2027, years = 12, seed = 7, care = 'trained' } = options;
  need(taxa, 'wisteria-sinensis');
  const bower = makeHemisphereBower({ diameterM: 15 });
  const plantings: Planting[] = bower.rootStations.map((s, i) => ({ plantId: `wisteria.${i}`, taxonId: 'wisteria-sinensis', stationId: s.id, date: `${plantingYear}-03-12`, tieToTimber: care === 'trained' }));
  const events = care === 'trained' ? plantings.flatMap((p) => wisteriaRoutine(p.plantId, plantingYear, years)) : [];
  return { name: `Wisteria sinensis on the 15 m hemisphere, ${care}`, start: `${plantingYear}-03-01`, seed, bower, taxa, plantings, events, viewpoints: HEMISPHERE_VIEWPOINTS };
}
