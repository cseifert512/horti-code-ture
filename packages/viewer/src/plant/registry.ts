// The taxa the viewer can draw: one module each, under taxa/, named for its
// folder in species/. This file only lists them. What a taxon looks like is in
// its module; what a look can say is in look.ts.
//
// Each module is loaded on its own, so that one which fails (a slip while it
// is being worked on) costs only its own plant its look: that plant is drawn
// with the stand-in, and the fault is kept to be shown.
import type { TaxonLook } from './look.ts';
import { standIn } from './stand-in.ts';

const MODULES: Readonly<Record<string, () => Promise<{ look: TaxonLook }>>> = {
  'akebia-quinata': () => import('./taxa/akebia-quinata.ts'),
  'campsis-x-tagliabueana-madame-galen': () => import('./taxa/campsis-x-tagliabueana-madame-galen.ts'),
  'clematis-armandi': () => import('./taxa/clematis-armandi.ts'),
  'clematis-cirrhosa-freckles': () => import('./taxa/clematis-cirrhosa-freckles.ts'),
  'clematis-princess-diana': () => import('./taxa/clematis-princess-diana.ts'),
  'clematis-viticella-etoile-violette': () => import('./taxa/clematis-viticella-etoile-violette.ts'),
  'hedera-helix': () => import('./taxa/hedera-helix.ts'),
  'hydrangea-anomala-subsp-petiolaris': () => import('./taxa/hydrangea-anomala-subsp-petiolaris.ts'),
  'lonicera-henryi': () => import('./taxa/lonicera-henryi.ts'),
  'lonicera-periclymenum-graham-thomas': () => import('./taxa/lonicera-periclymenum-graham-thomas.ts'),
  'rosa-the-generous-gardener': () => import('./taxa/rosa-the-generous-gardener.ts'),
  'sarcococca-confusa': () => import('./taxa/sarcococca-confusa.ts'),
  'thunbergia-alata': () => import('./taxa/thunbergia-alata.ts'),
  'trachelospermum-jasminoides': () => import('./taxa/trachelospermum-jasminoides.ts'),
  'vitis-coignetiae': () => import('./taxa/vitis-coignetiae.ts'),
  'wisteria-floribunda-macrobotrys': () => import('./taxa/wisteria-floribunda-macrobotrys.ts'),
  'wisteria-sinensis': () => import('./taxa/wisteria-sinensis.ts'),
};

/**
 * The hand-made render test is not a taxon: it says in its data whose models it borrows. "render-test" is drawn
 * with the wisteria's, and "render-test:<taxonId>" with that taxon's.
 */
const borrowed = (taxonId: string): string => (taxonId === 'render-test' ? 'wisteria-sinensis' : taxonId.startsWith('render-test:') ? taxonId.slice('render-test:'.length) : taxonId);

/** Every taxon that has a module. */
export const TAXON_IDS: readonly string[] = Object.keys(MODULES);

const looks = new Map<string, TaxonLook>();
const faults = new Map<string, string>();
const standIns = new Map<string, TaxonLook>();

function standInFor(taxonId: string): TaxonLook {
  let look = standIns.get(taxonId);
  if (!look) standIns.set(taxonId, (look = standIn(taxonId)));
  return look;
}

/**
 * Load the looks of the taxa named, or of all of them. To be awaited once
 * before anything is drawn. A module that cannot be loaded, or whose look
 * names another taxon, is recorded in `lookFault` and does not stop the rest.
 */
export async function loadLooks(taxonIds: readonly string[] = TAXON_IDS): Promise<void> {
  const wanted = [...new Set(taxonIds.map(borrowed))].filter((id) => MODULES[id] && !looks.has(id) && !faults.has(id));
  await Promise.all(
    wanted.map(async (id) => {
      try {
        const { look } = await MODULES[id]!();
        if (!look || look.taxonId !== id) throw new Error(`taxa/${id}.ts must export a look whose taxonId is "${id}"`);
        looks.set(id, look);
      } catch (e) {
        faults.set(id, e instanceof Error ? e.message : String(e));
      }
    }),
  );
}

/**
 * The look a taxon is drawn with: its own, or the provisional stand-in for a
 * taxon that has no module or whose module failed to load.
 */
export function lookFor(taxonId: string): TaxonLook {
  const id = borrowed(taxonId);
  const look = looks.get(id);
  if (look) return look;
  if (MODULES[id] && !faults.has(id)) throw new Error(`the look of ${id} has not been loaded: await loadLooks() before drawing plants`);
  return standInFor(id);
}

/** Why a taxon's module could not be loaded, if it could not. */
export function lookFault(taxonId: string): string | undefined {
  return faults.get(borrowed(taxonId));
}
