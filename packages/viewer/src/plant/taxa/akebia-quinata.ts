// Akebia quinata (chocolate vine), a semi-evergreen twiner.
//
// NOT MODELLED YET. This taxon is drawn with the stand-in every unmodelled
// taxon gets (a plain oval leaf, no flowers, no fruit, plain wood), and the
// caption says its look is provisional wherever it is shown.
//
// To give it a look of its own, replace the stand-in below with models made
// here: its leaf of five leaflets, its small chocolate-purple flowers, its sausage-shaped fruit.
// TAXON_LOOKS.md says how. No other taxon module may be imported.
import type { TaxonLook } from '../look.ts';
import { standIn } from '../stand-in.ts';

export const look: TaxonLook = {
  ...standIn('akebia-quinata'),
  provisional: true,
};
