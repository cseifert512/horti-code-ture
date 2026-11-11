// A leaf for a plant whose taxon has no organ models yet: a plain oval blade
// on a short stalk. It is a stand-in so that such a plant still reads as a
// plant, and the caption says its look is provisional. It makes no claim about
// what any taxon's leaf looks like.
import type * as THREE from 'three';
import { type Segs, blade, simpleLeaf } from './kit.ts';

export const GENERIC_LEAF_LODS = 3;
const SEGS: Segs[] = [
  [6, 8],
  [4, 4],
  [2, 2],
];

export function makeGenericLeafGeometry(_variant: number, lod: number): THREE.BufferGeometry {
  return simpleLeaf(blade({ halfWidth: 0.22, widest: 0.7, taper: 0.7, fold: 0.18, arch: 0.1 }, SEGS[lod]!, false), 0.1, lod, 0.5);
}
