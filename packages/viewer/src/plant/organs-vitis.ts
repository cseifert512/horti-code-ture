// Organ shapes of Vitis coignetiae (crimson glory vine).
// Not to be reused for other taxa: mechanism traits do not transfer, and neither do looks.
//
//   leaf   very large, rounded and heart-based, shallowly three-lobed, with a
//          puckered surface, on a long stalk. Its autumn scarlet comes from the
//          palette in assets.ts and the season data; nothing here knows a date.
//
// No flower: they are small and unobtrusive, and the plant is grown for leaf.
import type * as THREE from 'three';
import { type Segs, palmateBlade, simpleLeaf } from './kit.ts';

export const VINE_LEAF_VARIANTS = 2;
export const VINE_LEAF_LODS = 3;
const SEGS: Segs[] = [
  [24, 5],
  [14, 3],
  [8, 2],
];

export function makeVineLeafGeometry(variant: number, lod: number): THREE.BufferGeometry {
  const side = variant === 0 ? 0.95 : 1.1;
  const shape = {
    body: 0.5,
    lobes: [
      { angle: 0, reach: 0.2, width: 0.42 },
      { angle: side, reach: 0.13, width: 0.4 },
      { angle: -side, reach: 0.13, width: 0.4 },
    ],
    sinus: { depth: 0.55, width: 0.45 },
    fold: 0.1,
    arch: 0.16,
    pucker: 0.025,
  };
  return simpleLeaf(palmateBlade(shape, SEGS[lod]!, lod === 0), 0.2, lod, 0.3 + 0.4 * variant);
}
