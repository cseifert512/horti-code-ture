// Organ shapes of Rosa 'The Generous Gardener' (an English climbing rose).
// Not to be reused for other taxa: mechanism traits do not transfer, and neither do looks.
//
//   leaf     five or seven oval leaflets in pairs along an axis, with an end
//            leaflet, the leaflets sitting close on the axis
//   flower   a cupped, semi-double flower of three whorls of broad pale-pink
//            petals round yellow stamens, on a stalk that stands up from the
//            stem. One unit is the width of the flower, which is what the
//            render data gives.
//
// The flower is drawn by the same program as a raceme: the petals are tagged
// as its flowers, the outer whorl opening first; the stalk, calyx and stamens
// are its axis and stay when the petals have dropped.
import * as THREE from 'three';
import { hash2 } from '../util.ts';
import { type CompoundLayout, type Segs, across, blade, compoundLeaf, stamens } from './kit.ts';
import { Merge, Surf, lin, mix } from './organs.ts';

const V3 = THREE.Vector3;
const TAU = Math.PI * 2;

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

export const ROSE_FLOWER_VARIANTS = 2;
export const ROSE_FLOWER_LODS = 3;

const PINK = {
  outer: lin('#fbeaec'),
  mid: lin('#f6d2d7'),
  inner: lin('#f0b6c0'),
  heart: lin('#f7e6c2'),
  stamenA: lin('#ecd06a'),
  stamenB: lin('#d9a83c'),
  stalkA: lin('#5d7040'),
  stalkB: lin('#7e8f52'),
};
const PETAL_SEGS: Segs[] = [
  [5, 6],
  [3, 3],
  [2, 2],
];
/** The whorls, outside in: petals, how far they reach (half the flower's width at most), and how steeply they stand, radians. */
const WHORLS = [
  { petals: 5, reach: 0.5, stand: 0.2 },
  { petals: 6, reach: 0.4, stand: 0.7 },
  { petals: 6, reach: 0.27, stand: 1.1 },
] as const;

export function makeRoseFlowerGeometry(variant: number, lod: number): THREE.BufferGeometry {
  const mg = new Merge(false);
  const [nu, nv] = PETAL_SEGS[lod]!;
  const stalk = (s: number) => new V3(0.04 * s, 0.5 * s, 0.14 * s * s);
  const centre = stalk(1);
  const axis = new V3(0.08, 0.86, 0.5).normalize();
  const [e1, e2] = across(axis);
  mg.tube([stalk(0), stalk(0.5), centre], [0.022, 0.02, 0.024], [5, 4, 3][lod]!, PINK.stalkA, PINK.stalkB);

  const id = new THREE.Matrix4();
  WHORLS.forEach((whorl, w) => {
    const colour = [PINK.outer, PINK.mid, PINK.inner][w]!;
    for (let k = 0; k < whorl.petals; k++) {
      const theta = (k / whorl.petals) * TAU + w * 0.55 + variant * 0.3 + (hash2(variant + w, k) - 0.5) * 0.2;
      const er = e1.clone().multiplyScalar(Math.cos(theta)).addScaledVector(e2, Math.sin(theta));
      const et = e1.clone().multiplyScalar(-Math.sin(theta)).addScaledVector(e2, Math.cos(theta));
      // the petal runs out and up along `along`, and is hollowed towards the heart of the flower along `inward`
      const along = er.clone().multiplyScalar(Math.cos(whorl.stand)).addScaledVector(axis, Math.sin(whorl.stand));
      const inward = axis.clone().multiplyScalar(Math.cos(whorl.stand)).addScaledVector(er, -Math.sin(whorl.stand));
      const sb = new Surf();
      sb.surf(nu, nv, (u01, v) => {
        const u = u01 * 2 - 1;
        const hw = 0.46 * whorl.reach * Math.pow(Math.sin(Math.PI * Math.pow(v, 1.15)), 0.5) + 0.004;
        const cup = whorl.reach * (0.22 * u * u * v + 0.1 * Math.sin(Math.PI * v) - (w === 0 ? 0.12 * v * v * v : 0));
        const p = centre.clone().addScaledVector(along, whorl.reach * v).addScaledVector(et, u * hw).addScaledVector(inward, cup);
        return { p: [p.x, p.y, p.z], c: mix(PINK.heart, colour, Math.min(1, v * 2.4)) };
      });
      const tone = 0.95 + 0.1 * hash2(variant + 9 + w, k);
      mg.add(sb.build(), id, [tone, tone, tone], centre, w * 0.12 + (k / whorl.petals) * 0.05);
    }
  });
  if (lod < 2) stamens(mg, centre, axis, lod === 0 ? 22 : 9, 0.1, 0.9, 3, PINK.stamenA, PINK.stamenB, 71 + variant, 0.012);
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(centre.clone(), 0.8);
  return g;
}
