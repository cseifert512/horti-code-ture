// Clematis 'Princess Diana' (Texensis Group), a deciduous leaf-stalk climber.
//
// NOT MODELLED YET. This taxon is drawn with the stand-in every unmodelled
// taxon gets (a plain oval leaf, no flowers, no fruit, plain wood), and the
// caption says its look is provisional wherever it is shown.
//
// To give it a look of its own, replace the stand-in below with models made
// here: its leaf, its pink tulip-shaped flowers, its coiled leaf stalks. It must not borrow another clematis: its flower is its own.
// TAXON_LOOKS.md says how. No other taxon module may be imported.
import type { TaxonLook } from '../look.ts';
import { standIn } from '../stand-in.ts';

export const look: TaxonLook = {
  ...standIn('clematis-princess-diana'),
  provisional: true,
};
