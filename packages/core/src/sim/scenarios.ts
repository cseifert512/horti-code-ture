/**
 * Reference scenarios.
 *
 * DEVELOPMENT_GUIDE.md, "smallest valuable first deliverable": trained
 * Wisteria sinensis on a curved Bower segment, over years, with flower buds
 * that survive or are removed by gardening, and a readable action log. "Then
 * add one evergreen honeysuckle and one Group 3 clematis on separate routes."
 */
import { makeVaultBower } from '../bower/vault.ts';
import type { TaxonProfile } from '../taxon.ts';
import type { GrowthModel } from './model.ts';
import type { GardenerEvent, Planting, Scenario } from './types.ts';

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
  return { name: `Wisteria sinensis on the vault segment, ${care}`, start: `${plantingYear}-03-01`, seed, bower, taxa, plantings, events };
}

/**
 * The first mixed planting: the two wisterias as before, an evergreen
 * honeysuckle (Lonicera henryi) at the west foot of rib 3, and a Group 3
 * clematis ('Étoile Violette') at the east foot of rib 1. Three attachment
 * behaviours and three flowering habits on one structure.
 */
export function mixedOnVault(options: VaultScenarioOptions): Scenario {
  const { taxa, plantingYear = 2027, years = 12, seed = 7, care = 'trained' } = options;
  need(taxa, 'wisteria-sinensis', 'lonicera-henryi', 'clematis-viticella-etoile-violette');
  const bower = makeVaultBower({
    stations: [
      { side: 0, rib: 1 },
      { side: 1, rib: 3 },
      { side: 0, rib: 3 },
      { side: 1, rib: 1 },
    ],
  });
  const date = `${plantingYear}-03-12`;
  const tieToTimber = care === 'trained';
  const plantings: Planting[] = [
    { plantId: 'wisteria.0', taxonId: 'wisteria-sinensis', stationId: 'station.0', date, tieToTimber },
    { plantId: 'wisteria.1', taxonId: 'wisteria-sinensis', stationId: 'station.1', date, tieToTimber },
    { plantId: 'honeysuckle', taxonId: 'lonicera-henryi', stationId: 'station.2', date, tieToTimber },
    { plantId: 'clematis', taxonId: 'clematis-viticella-etoile-violette', stationId: 'station.3', date, tieToTimber },
  ];
  const events = care === 'trained' ? [...wisteriaRoutine('wisteria.0', plantingYear, years), ...wisteriaRoutine('wisteria.1', plantingYear, years), ...groupThreeRoutine('clematis', plantingYear, years)] : [];
  return { name: `Wisteria, evergreen honeysuckle and summer clematis on the vault segment, ${care}`, start: `${plantingYear}-03-01`, seed, bower, taxa, plantings, events };
}
