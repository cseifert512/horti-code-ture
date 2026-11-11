// Organ shapes of Trachelospermum jasminoides (star jasmine).
// Not to be reused for other taxa: mechanism traits do not transfer, and neither do looks.
//
//   leaf     a small, glossy, leathery oval leaf, pointed, on a short stalk
//   flowers  a loose cluster of small white flowers, each of five narrow
//            petals set askew like the blades of a pinwheel, on thin stalks.
//            One unit is the width of the cluster, which is what the render
//            data gives.
//
// The cluster is drawn by the same program as a raceme: each flower is one of
// its flowers, opening in turn; the stalks are its axis.
import * as THREE from 'three';
import { hash2 } from '../util.ts';
import { type Segs, blade, simpleLeaf } from './kit.ts';
import { Merge, Surf, lin, mix } from './organs.ts';

const V3 = THREE.Vector3;
const TAU = Math.PI * 2;

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

export const JASMINE_CLUSTER_VARIANTS = 2;
export const JASMINE_CLUSTER_LODS = 3;

const STAR = {
  petal: lin('#fbfbf1'),
  heart: lin('#efe5a0'),
  stalkA: lin('#5d6e3c'),
  stalkB: lin('#8a9658'),
};

/** One flower, one unit across, lying in the XZ plane and facing +Y. */
function pinwheel(lod: number): THREE.BufferGeometry {
  const sb = new Surf();
  const [nu, nv] = ([[3, 4], [2, 2], [1, 1]] as const)[lod]!;
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU;
    sb.surf(nu, nv, (u01, v) => {
      const u = u01 * 2 - 1;
      const r = 0.05 + 0.45 * v;
      const hw = 0.105 * Math.pow(Math.sin(Math.PI * Math.pow(v, 0.7)), 0.6) + 0.004;
      // each petal swings to one side as it goes out, and is twisted like a propeller blade
      const side = u * hw + 0.11 * v * v;
      const x = r * Math.cos(a) - side * Math.sin(a);
      const z = r * Math.sin(a) + side * Math.cos(a);
      return { p: [x, 0.05 * u * v + 0.03 * Math.sin(Math.PI * v), z], c: mix(STAR.heart, STAR.petal, Math.min(1, v * 3)) };
    });
  }
  return sb.build();
}

export function makeJasmineClusterGeometry(variant: number, lod: number): THREE.BufferGeometry {
  const mg = new Merge(false);
  const flower = pinwheel(lod);
  // a stalk out from the stem, forking into thinner ones, each ending in a flower
  const fork = new V3(0.02, 0.2, 0.06);
  mg.tube([new V3(0, 0, 0), fork], [0.02, 0.016], [4, 3, 3][lod]!, STAR.stalkA, STAR.stalkB);
  const count = [7, 5, 4][lod]!;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const spin = new THREE.Quaternion();
  const up = new V3(0, 1, 0);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + variant * 0.7 + hash2(variant, i) * 0.6;
    // the outermost petals stand half a unit from the middle: the cluster is one unit across
    const out = i === 0 ? 0.05 : 0.27 * (0.75 + 0.35 * hash2(variant + 3, i));
    const at = fork.clone().add(new V3(Math.cos(a) * out, 0.16 + 0.12 * hash2(variant + 5, i), Math.sin(a) * out));
    if (lod < 2) mg.tube([fork.clone(), at], [0.011, 0.008], 3, STAR.stalkA, STAR.stalkB);
    // facing up and a little outwards
    const facing = new V3(Math.cos(a) * 0.45, 1, Math.sin(a) * 0.45).normalize();
    q.setFromUnitVectors(up, facing).premultiply(spin.setFromAxisAngle(facing, hash2(i, variant) * TAU));
    const s = 0.42 * (0.9 + 0.2 * hash2(variant + 9, i));
    m.compose(at, q, new V3(s, s, s));
    mg.add(flower, m, [1, 1, 1], at, 0.7 * (i / count));
  }
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(fork.clone().add(new V3(0, 0.2, 0)), 0.75);
  return g;
}
