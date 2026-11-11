// Wisteria floribunda 'Macrobotrys' (a Japanese wisteria), a deciduous twiner.
//
// NOT MODELLED YET. This taxon is drawn with the stand-in every unmodelled
// taxon gets (a plain oval leaf, no flowers, no fruit, plain wood), and the
// caption says its look is provisional wherever it is shown.
//
// To give it a look of its own, replace the stand-in below with models made
// here: its very long racemes, which open from the base to the tip over weeks, its leaf of more leaflets, its pods. It must not borrow Wisteria sinensis: the raceme, its length and the way it opens are different.
// TAXON_LOOKS.md says how. No other taxon module may be imported.
import type { TaxonLook } from '../look.ts';
import { standIn } from '../stand-in.ts';

export const look: TaxonLook = {
  ...standIn('wisteria-floribunda-macrobotrys'),
  provisional: true,
};
