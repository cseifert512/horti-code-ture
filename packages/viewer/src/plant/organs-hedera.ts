// Organ shapes of Hedera helix (common ivy), in its climbing, juvenile leaf.
// Not to be reused for other taxa: mechanism traits do not transfer, and neither do looks.
//
//   leaf   leathery and dark, with three to five pointed lobes and pale veins
//          fanning from the stalk
//
// No flower: ivy flowers only on its adult, non-climbing growth, which the
// engine does not grow.
import type * as THREE from 'three';
import { type Segs, palmateBlade, simpleLeaf } from './kit.ts';

export const IVY_LEAF_VARIANTS = 2;
export const IVY_LEAF_LODS = 3;
const SEGS: Segs[] = [
  [24, 4],
  [14, 3],
  [8, 2],
];

export function makeIvyLeafGeometry(variant: number, lod: number): THREE.BufferGeometry {
  // five lobes, or three with the lowest pair barely showing
  const low = variant === 0 ? 0.16 : 0.05;
  const shape = {
    body: 0.36,
    lobes: [
      { angle: 0, reach: 0.42, width: 0.3 },
      { angle: 1.05, reach: 0.3, width: 0.3 },
      { angle: -1.05, reach: 0.3, width: 0.3 },
      { angle: 2.05, reach: low, width: 0.3 },
      { angle: -2.05, reach: low, width: 0.3 },
    ],
    sinus: { depth: 0.4, width: 0.4 },
    fold: 0.08,
    arch: 0.08,
  };
  return simpleLeaf(palmateBlade(shape, SEGS[lod]!, lod === 0), 0.24, lod, 0.3 + 0.4 * variant);
}
