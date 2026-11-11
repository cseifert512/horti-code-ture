// Campsis x tagliabuana 'Madame Galen' (a trumpet vine), deciduous, clinging by rootlets.
//
// NOT MODELLED YET. This taxon is drawn with the stand-in every unmodelled
// taxon gets (a plain oval leaf, no flowers, no fruit, plain wood), and the
// caption says its look is provisional wherever it is shown.
//
// To give it a look of its own, replace the stand-in below with models made
// here: its pinnate leaf, its clusters of salmon-red trumpets, its rootlets.
// TAXON_LOOKS.md says how. No other taxon module may be imported.
import type { TaxonLook } from '../look.ts';
import { standIn } from '../stand-in.ts';

export const look: TaxonLook = {
  ...standIn('campsis-x-tagliabueana-madame-galen'),
  provisional: true,
};
