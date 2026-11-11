/**
 * Reference scenarios.
 *
 * DEVELOPMENT_GUIDE.md, "smallest valuable first deliverable": trained
 * Wisteria sinensis on a curved Bower segment, over years, with flower buds
 * that survive or are removed by gardening, and a readable action log.
 */
import { makeVaultBower } from '../bower/vault.ts';
import type { TaxonProfile } from '../taxon.ts';
import type { GrowthModel } from './model.ts';
import type { GardenerEvent, Scenario } from './types.ts';

export interface WisteriaVaultOptions {
  taxa: ReadonlyMap<string, { profile: TaxonProfile; model: GrowthModel }>;
  /** Calendar year of planting; planting day is 12 March. */
  plantingYear?: number;
  /** Number of years of gardening to script. */
  years?: number;
  seed?: number;
  /**
   * 'trained'    a gardener ties the framework in and prunes twice a year (RHS routine)
   * 'untended'   nobody touches the plants after planting
   */
  care?: 'trained' | 'untended';
}

/** Two Wisteria sinensis on the barrel-vault segment, one at each planted rib foot. */
export function wisteriaOnVault(options: WisteriaVaultOptions): Scenario {
  const { taxa, plantingYear = 2027, years = 12, seed = 7, care = 'trained' } = options;
  if (!taxa.has('wisteria-sinensis')) throw new Error('this scenario needs the wisteria-sinensis profile and growth model');
  const bower = makeVaultBower();
  const plants = bower.rootStations.map((s, i) => ({ plantId: `wisteria.${i}`, taxonId: 'wisteria-sinensis', stationId: s.id, date: `${plantingYear}-03-12`, tieToTimber: care === 'trained' }));

  const events: GardenerEvent[] = [];
  if (care === 'trained') {
    for (let y = 0; y < years; y++) {
      const year = plantingYear + y;
      for (const p of plants) {
        // RHS routine: winter prune in January or February, summer prune in July or August
        if (y > 0) events.push({ id: `winter-${year}-${p.plantId}`, date: `${year}-01-20`, type: 'spur_prune', plantId: p.plantId, season: 'winter', author: 'gardener', reason: 'RHS routine: cut back to two or three buds' });
        events.push({ id: `monitor-${year}-${p.plantId}`, date: `${year}-05-15`, type: 'monitor', plantId: p.plantId, author: 'gardener', reason: 'check flowering and ties' });
        events.push({ id: `summer-${year}-${p.plantId}`, date: `${year}-08-01`, type: 'spur_prune', plantId: p.plantId, season: 'summer', author: 'gardener', reason: 'RHS routine: cut whippy growth back to five or six leaves' });
      }
    }
  }
  return {
    name: `Wisteria sinensis on the vault segment, ${care}`,
    start: `${plantingYear}-03-01`,
    seed,
    bower,
    taxa,
    plantings: plants,
    events,
  };
}
