// Sarcococca confusa (sweet box), an evergreen shrub. It is not a climber, and the engine does not grow it yet.
//
// NOT MODELLED YET. This taxon is drawn with the stand-in every unmodelled
// taxon gets (a plain oval leaf, no flowers, no fruit, plain wood), and the
// caption says its look is provisional wherever it is shown.
//
// To give it a look of its own, replace the stand-in below with models made
// here: its small glossy pointed leaf, its tiny white winter flowers, its black berries.
// TAXON_LOOKS.md says how. No other taxon module may be imported.
import type { TaxonLook } from '../look.ts';
import { standIn } from '../stand-in.ts';

export const look: TaxonLook = {
  ...standIn('sarcococca-confusa'),
  provisional: true,
};
