// Organ shapes of Lonicera henryi (Henry's honeysuckle). Not to be reused for
// other taxa: mechanism traits do not transfer.
//
//   leaf   a simple, leathery, lanceolate leaf on a short stalk, widest below
//          the middle and drawn out to a point. Unit length along +Z, upper
//          side +Y, the same frame as every leaf asset. Its real length comes
//          from the render data.
//
// There is no flower here yet: the taxon's flowering habit is not settled in
// the library, and the engine gives it no flowers to draw.
import * as THREE from 'three';
import { Merge, Surf } from './organs.ts';

const V3 = THREE.Vector3;

export const LONICERA_LEAF_VARIANTS = 2;
export const LONICERA_LEAF_LODS = 3;

const SEGS: [number, number][] = [
  [6, 10],
  [4, 5],
  [2, 3],
];

function blade(variant: number, lod: number): THREE.BufferGeometry {
  const sb = new Surf();
  const [nu, nv] = SEGS[lod]!;
  const halfWidth = variant === 0 ? 0.165 : 0.195;
  sb.surf(nu, nv, (u01, v) => {
    const u = u01 * 2 - 1;
    // rounded at the base, widest at about two fifths, long-pointed
    const profile = Math.pow(Math.sin(Math.PI * Math.pow(v, 0.72)), 0.8);
    const x = u * (halfWidth * profile + 0.003);
    // folded a little along the midrib, arching down towards the tip
    let y = 0.2 * Math.abs(x) - 0.1 * v * v + 0.02 * Math.sin(Math.PI * v);
    if (lod === 0) y += 0.012 * Math.sin(v * 11 + u * 1.3) * u * u;
    return { p: [x, y, v] };
  });
  return sb.build();
}

export function makeLoniceraLeafGeometry(variant: number, lod: number): THREE.BufferGeometry {
  const mg = new Merge(true);
  const stalkEnd = new V3(0, 0.006, 0.1);
  mg.tube([new V3(0, 0, 0), new V3(0, 0.004, 0.05), stalkEnd], [0.016, 0.013, 0.011], [5, 4, 3][lod]!, [1, 1, 1], [1, 1, 1], [0.5, 0.02]);
  const m = new THREE.Matrix4().compose(stalkEnd, new THREE.Quaternion(), new V3(0.9, 0.9, 0.9));
  mg.add(blade(variant, lod), m, [1, 1, 1], stalkEnd, 0.3 + 0.4 * variant);
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, 0, 0.5), 0.7);
  return g;
}
