// The look of a plant whose taxon has no models yet: a plain oval leaf on a
// short stalk, no flowers, no fruit, nothing to hold on with, and plain wood.
// It is a stand-in so that such a plant still reads as a plant, and the
// caption says its look is provisional. It makes no claim about what any
// taxon looks like, and it belongs to none.
import type * as THREE from 'three';
import { type Segs, blade, lin, simpleLeaf } from './kit.ts';
import { THIN_LEAF, type TaxonLook, type WoodLook } from './look.ts';

const LODS = 3;
const SEGS: Segs[] = [
  [6, 8],
  [4, 4],
  [2, 2],
];

function makeLeafGeometry(_variant: number, lod: number): THREE.BufferGeometry {
  return simpleLeaf(blade({ halfWidth: 0.22, widest: 0.7, taper: 0.7, fold: 0.18, arch: 0.1 }, SEGS[lod]!, false), 0.1, lod, 0.5);
}

/** Wood of no plant in particular: a green shoot that browns and then greys. */
const PLAIN_WOOD: WoodLook = {
  young: lin('#7d8f52'),
  mature: lin('#8a6a4a'),
  old: [0.82, 0.77, 0.7],
  woodyDays: [100, 400],
  oldDays: [550, 1800],
  furrowDays: [300, 1800],
  furrow: 0.5,
  stiffDays: [50, 500],
  relief: 2.5,
  roughness: 0.92,
};

/** The stand-in look for a taxon. Its keys carry the taxon's id, so that a module which starts from it and changes a colour does not change another's. */
export function standIn(taxonId: string): TaxonLook {
  return {
    taxonId,
    provisional: true,
    leaves: {
      default: {
        key: `${taxonId}/stand-in-leaf`,
        variants: 1,
        lods: LODS,
        make: makeLeafGeometry,
        budget: [120, 52, 24],
        pick: () => 0,
        // a middling green
        palette: { greenA: [0.11, 0.24, 0.06], greenB: [0.14, 0.29, 0.07], young: [0.2, 0.32, 0.09], autumnA: [0.6, 0.5, 0.1], autumnB: [0.4, 0.32, 0.08] },
        roughness: 0.55,
        translucency: THIN_LEAF,
        detailReach: 0.7,
      },
    },
    flowers: null,
    fruits: null,
    appendages: {},
    wood: PLAIN_WOOD,
  };
}
