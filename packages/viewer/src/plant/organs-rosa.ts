// Organ shapes of Rosa 'The Generous Gardener' (an English climbing rose).
// Not to be reused for other taxa: mechanism traits do not transfer, and neither do looks.
//
//   leaf   five or seven oval leaflets in pairs along an axis, with an end
//          leaflet, the leaflets sitting close on the axis
import type * as THREE from 'three';
import { type CompoundLayout, type Segs, blade, compoundLeaf } from './kit.ts';

/** Leaflets per variant. */
export const ROSE_LEAFLETS: readonly number[] = [5, 7];
export const ROSE_LEAF_LODS = 3;
const SEGS: Segs[] = [
  [6, 8],
  [3, 4],
  [2, 2],
];

export function makeRoseLeafGeometry(variant: number, lod: number): THREE.BufferGeometry {
  const leaflet = blade({ halfWidth: 0.3, widest: 0.62, taper: 0.7, fold: 0.2, arch: 0.1, wave: 0.02 }, SEGS[lod]!, lod === 0);
  const seven = ROSE_LEAFLETS[variant] === 7;
  const pairs = seven ? [0.3, 0.58, 0.86] : [0.4, 0.8];
  const length = seven ? 0.27 : 0.31;
  const layout: CompoundLayout = {
    axisEnd: 0.66,
    axisRadius: 0.011,
    arch: 0.08,
    leaflets: [...pairs.flatMap((at) => [{ at, side: -1 as const, length }, { at, side: 1 as const, length }]), { at: 1, side: 0 as const, length: length * 1.15 }],
    stalk: 0.02,
    forward: [0.25, 0.5],
    droop: [0.05, 0.3],
    seed: 900 + variant,
  };
  return compoundLeaf(leaflet, layout, lod);
}
