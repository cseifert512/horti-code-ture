// Organ shapes of two honeysuckles. Not to be reused for other taxa: mechanism
// traits do not transfer, and the two here differ from each other too.
//
//   Lonicera henryi (Henry's honeysuckle)
//     leaf   simple, leathery, lanceolate, widest below the middle and drawn
//            out to a point, on a short stalk
//   Lonicera periclymenum 'Graham Thomas' (a woodbine)
//     leaf   simple, soft and dull, oval and blunt, widest about the middle
//
// Both flower in clusters of slender two-lipped tubes, but not alike:
//     woodbine   a full whorl of long white tubes ageing to yellow, with a
//                tier of buds standing in the middle
//     henryi     a few pairs of short tubes, yellow in the throat and
//                purplish-red on the lips
// One unit is the width of the cluster, which is what the render data gives.
// A cluster is drawn by the same program as a raceme: each tube is one of its
// flowers, opening in turn; the stalk is its axis.
//
// Unit length along +Z, upper side +Y, the same frame as every leaf model.
// The real length comes from the render data.
import * as THREE from 'three';
import { hash2 } from '../util.ts';
import { type Segs, blade as plainBlade, simpleLeaf } from './kit.ts';
import { Merge, type RGB, Surf, lin, mix } from './organs.ts';

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

export const WOODBINE_LEAF_VARIANTS = 2;
export const WOODBINE_LEAF_LODS = 3;
const WOODBINE_SEGS: Segs[] = [
  [6, 8],
  [4, 4],
  [2, 2],
];

export function makeWoodbineLeafGeometry(variant: number, lod: number): THREE.BufferGeometry {
  const shape = { halfWidth: variant === 0 ? 0.24 : 0.27, widest: 0.9, taper: 0.58, fold: 0.14, arch: 0.09, wave: 0.012 };
  return simpleLeaf(plainBlade(shape, WOODBINE_SEGS[lod]!, lod === 0), 0.07, lod, 0.3 + 0.4 * variant);
}

// ---------------------------------------------------------------------------
// Flower clusters
// ---------------------------------------------------------------------------
export const HONEYSUCKLE_CLUSTER_LODS = 3;

interface TubeLook {
  tube: RGB;
  lip: RGB;
  throat: RGB;
  /** How far the lips roll back, radians. */
  roll: number;
}

/**
 * One flower, one unit long along +Z from where it joins the cluster: a
 * slender tube curving up, opening into a broad upper lip rolled back and a
 * narrow lower lip rolled down. `open` false gives the club-shaped bud.
 */
function tubeFlower(lod: number, look: TubeLook, open: boolean): THREE.BufferGeometry {
  const sb = new Surf();
  const around = [6, 4, 3][lod]!;
  const along = [6, 3, 2][lod]!;
  const reach = open ? 0.62 : 0.8;
  const spine = (v: number): [number, number, number] => [0, 0.1 * v * v, reach * v];
  sb.surf(around, along, (u, v) => {
    const th = u * Math.PI * 2;
    // a bud swells to a club at its tip and closes; an open tube flares at the mouth
    const r = open ? 0.03 + 0.045 * v * v * v : 0.028 + 0.05 * Math.pow(Math.sin(Math.PI * Math.pow(v, 2.2)), 0.8);
    const [, y, z] = spine(v);
    return { p: [Math.cos(th) * r, y + Math.sin(th) * r, z], c: mix(look.tube, look.lip, v * v) };
  });
  if (open) {
    const [, my, mz] = spine(1);
    const lips = [
      { up: 1, half: 0.11, turn: look.roll, radius: 0.16 },
      { up: -1, half: 0.04, turn: look.roll * 1.25, radius: 0.13 },
    ];
    for (const lip of lod === 2 ? lips.slice(0, 1) : lips) {
      sb.surf([4, 2, 1][lod]!, [5, 3, 2][lod]!, (u01, w) => {
        const u = u01 * 2 - 1;
        const phi = w * lip.turn;
        // rolling away from the mouth: forward at first, then back over
        const y = my + lip.up * (0.07 + lip.radius * (1 - Math.cos(phi)));
        const z = mz + lip.radius * Math.sin(phi);
        return { p: [u * lip.half * (1 - 0.35 * w), y - lip.up * 0.03 * u * u, z], c: mix(look.throat, look.lip, Math.min(1, w * 2)) };
      });
    }
    // stamens standing out of the mouth
    if (lod === 0) {
      for (let i = 0; i < 3; i++) {
        const dx = (i - 1) * 0.03;
        sb.surf(3, 1, (u, v) => {
          const th = u * Math.PI * 2;
          return { p: [dx + Math.cos(th) * 0.006, my + 0.02 * i + Math.sin(th) * 0.006, mz + v * (0.3 + 0.05 * i)], c: look.throat };
        });
      }
    }
  }
  return sb.build();
}

interface ClusterLook extends TubeLook {
  /** Tubes in the outer tier, and buds standing in the middle. */
  flowers: number;
  buds: number;
  /** How far above level the open tubes point, radians. */
  lift: number;
  /** A second colour some of the open flowers have turned to as they age. */
  aged: RGB | null;
  stalkA: RGB;
  stalkB: RGB;
}

function cluster(variant: number, lod: number, look: ClusterLook): THREE.BufferGeometry {
  const mg = new Merge(false);
  // a short stalk; the tubes spring from its end and stand half a unit out all round
  const head = new V3(0, 0.14, 0);
  mg.tube([new V3(0, 0, 0), head], [0.035, 0.04], [5, 4, 3][lod]!, look.stalkA, look.stalkB);
  const flower = tubeFlower(lod, look, true);
  const bud = tubeFlower(lod, look, false);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const place = (geometry: THREE.BufferGeometry, azimuth: number, lift: number, size: number, tint: Readonly<RGB>, order: number) => {
    // the model lies along +Z: turn it to its place round the cluster, and tip it up
    q.setFromEuler(e.set(-lift, azimuth, 0, 'YXZ'));
    m.compose(head, q, new V3(size, size, size));
    mg.add(geometry, m, tint, head, order);
  };
  const white: RGB = [1, 1, 1];
  for (let k = 0; k < look.flowers; k++) {
    const a = (k / look.flowers) * Math.PI * 2 + variant * 0.5 + (hash2(variant, k) - 0.5) * 0.3;
    // the flowers that opened first have turned: a tint multiplied on to the lips
    const turned = look.aged && hash2(variant + 3, k) < 0.45;
    const tint: RGB = turned && look.aged ? [look.aged[0] / look.lip[0], look.aged[1] / look.lip[1], look.aged[2] / look.lip[2]] : white;
    place(flower, a, look.lift + 0.25 * (hash2(variant + 5, k) - 0.5), 0.5 * (0.9 + 0.2 * hash2(variant + 7, k)), tint, 0.5 * (k / look.flowers));
  }
  const buds = lod === 2 ? Math.min(2, look.buds) : look.buds;
  for (let k = 0; k < buds; k++) {
    const a = (k / Math.max(1, buds)) * Math.PI * 2 + 0.4 + variant;
    place(bud, a, 1.0 + 0.25 * hash2(variant + 11, k), 0.36, white, 0.75 + 0.2 * (k / Math.max(1, buds)));
  }
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(head.clone(), 0.75);
  return g;
}

export const WOODBINE_CLUSTER_VARIANTS = 2;
const WOODBINE: ClusterLook = {
  tube: lin('#f0ecc4'),
  lip: lin('#fbf8ea'),
  throat: lin('#f3eccb'),
  roll: 2.3,
  flowers: 9,
  buds: 5,
  lift: 0.3,
  aged: lin('#f0d87c'),
  stalkA: lin('#6e7c47'),
  stalkB: lin('#8f9a5e'),
};
export function makeWoodbineClusterGeometry(variant: number, lod: number): THREE.BufferGeometry {
  return cluster(variant, lod, WOODBINE);
}

export const HENRYI_CLUSTER_VARIANTS = 2;
const HENRYI: ClusterLook = {
  tube: lin('#d8b04e'),
  lip: lin('#a23448'),
  throat: lin('#e9cf62'),
  roll: 1.9,
  flowers: 6,
  buds: 2,
  lift: 0.45,
  aged: null,
  stalkA: lin('#5c6b3c'),
  stalkB: lin('#7a8650'),
};
export function makeHenryiClusterGeometry(variant: number, lod: number): THREE.BufferGeometry {
  return cluster(variant + 4, lod, HENRYI);
}
