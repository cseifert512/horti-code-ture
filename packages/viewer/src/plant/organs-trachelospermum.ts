// Organ shapes of Trachelospermum jasminoides (star jasmine).
// Not to be reused for other taxa: mechanism traits do not transfer, and neither do looks.
//
//   leaf   a small, glossy, leathery oval leaf, pointed, on a short stalk
import type * as THREE from 'three';
import { type Segs, blade, simpleLeaf } from './kit.ts';

export const JASMINE_LEAF_VARIANTS = 2;
export const JASMINE_LEAF_LODS = 3;
const SEGS: Segs[] = [
  [6, 10],
  [4, 5],
  [2, 3],
];

export function makeJasmineLeafGeometry(variant: number, lod: number): THREE.BufferGeometry {
  const shape = { halfWidth: variant === 0 ? 0.19 : 0.215, widest: 0.85, taper: 0.7, fold: 0.16, arch: 0.07, wave: 0.008 };
  return simpleLeaf(blade(shape, SEGS[lod]!, lod === 0), 0.08, lod, 0.3 + 0.4 * variant);
}
