// Hydrangea anomala subsp. petiolaris (climbing hydrangea), deciduous, clinging
// by rootlets.
//
//   leaf      broad and rounded with a heart-shaped base and a short point, on
//             a long stalk. Unit length along +Z, upper side +Y.
//   lacecap   a flat flowerhead on a stalk standing up from the stem: a crowd
//             of small fertile flowers in the middle, ringed by a few showy
//             sterile ones, each of four white sepals. One unit is the width
//             of the head, which is what the render data gives.
//   hold      a patch of short clinging rootlets (a first, plain model)
//   wood      first values, from descriptions: cinnamon-brown bark that peels
//
// The head is drawn by the same program as a raceme. The sterile flowers and
// the fertile ones are tagged as its flowers, the sterile ones opening first;
// the stalk and its rays are its axis and stay when the flowers have gone.
//
// Made from descriptions, not from specimens.
import * as THREE from 'three';
import { hash2 } from '../../util.ts';
import { Merge, type Segs, Surf, across, lin, mix, palmateBlade, rootlets, simpleLeaf } from '../kit.ts';
import { type AppendageAsset, type FlowerAsset, type LeafAsset, THIN_LEAF, type TaxonLook, type WoodLook } from '../look.ts';

const V3 = THREE.Vector3;
const TAU = Math.PI * 2;

const HYDRANGEA_LEAF_LODS = 3;
const LEAF_SEGS: Segs[] = [
  [20, 4],
  [12, 3],
  [8, 2],
];

function makeHydrangeaLeafGeometry(_variant: number, lod: number): THREE.BufferGeometry {
  const shape = { body: 0.5, lobes: [{ angle: 0, reach: 0.3, width: 0.4 }], sinus: { depth: 0.3, width: 0.5 }, fold: 0.12, arch: 0.12, pucker: 0.012 };
  return simpleLeaf(palmateBlade(shape, LEAF_SEGS[lod]!, lod === 0), 0.22, lod, 0.5);
}

const LACECAP_VARIANTS = 2;
const LACECAP_LODS = 3;

const LOOK = {
  sepal: lin('#f6f5ea'),
  sepalHeart: lin('#e3e8c8'),
  fertile: lin('#dfe3b4'),
  fertileDeep: lin('#b9c58a'),
  stalkA: lin('#7c8a55'),
  stalkB: lin('#a7b27a'),
};

/** One sterile flower: four rounded sepals, flat, 0.17 of the head across. */
function sterile(lod: number): THREE.BufferGeometry {
  const sb = new Surf();
  const [nu, nv] = ([[4, 4], [2, 2], [1, 1]] as const)[lod]!;
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + Math.PI / 4;
    sb.surf(nu, nv, (u01, v) => {
      const u = u01 * 2 - 1;
      const r = 0.012 + 0.075 * v;
      const hw = 0.046 * Math.pow(Math.sin(Math.PI * Math.pow(v, 0.8)), 0.55) + 0.002;
      const x = r * Math.cos(a) - u * hw * Math.sin(a);
      const z = r * Math.sin(a) + u * hw * Math.cos(a);
      return { p: [x, 0.012 * Math.sin(Math.PI * v) - 0.01 * u * u, z], c: mix(LOOK.sepalHeart, LOOK.sepal, Math.min(1, v * 2.5)) };
    });
  }
  return sb.build();
}

/** One fertile flower, far smaller: a low dome. */
function fertile(lod: number): THREE.BufferGeometry {
  const sb = new Surf();
  const [nu, nv] = ([[5, 2], [4, 1], [3, 1]] as const)[lod]!;
  sb.surf(nu, nv, (u, v) => {
    const th = u * TAU;
    const r = 0.022 * Math.cos((Math.PI / 2) * v);
    return { p: [Math.cos(th) * r, 0.02 * Math.sin((Math.PI / 2) * v), Math.sin(th) * r], c: mix(LOOK.fertileDeep, LOOK.fertile, v) };
  });
  return sb.build();
}

function makeLacecapGeometry(variant: number, lod: number): THREE.BufferGeometry {
  const mg = new Merge(false);
  // a stalk up from the stem, leaning a little; the head sits flat on top of it
  const top = new V3(0.05, 0.3, 0.04);
  const up = new V3(0.1, 1, 0.06).normalize();
  const [e1, e2] = across(up);
  const radial = [5, 4, 3][lod]!;
  mg.tube([new V3(0, 0, 0), new V3(0.02, 0.16, 0.015), top], [0.02, 0.018, 0.016], radial, LOOK.stalkA, LOOK.stalkB);
  const on = (r: number, a: number, lift: number) => top.clone().addScaledVector(e1, r * Math.cos(a)).addScaledVector(e2, r * Math.sin(a)).addScaledVector(up, lift);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), up);
  const turn = new THREE.Quaternion();
  const one = new V3(1, 1, 1);

  // the ring of sterile flowers, each on a ray of its own
  const showy = sterile(lod);
  const ringCount = [8, 7][variant]! - (lod === 2 ? 2 : 0);
  for (let k = 0; k < ringCount; k++) {
    const a = (k / ringCount) * TAU + hash2(variant, k) * 0.5;
    // the tips of the sepals stand half a unit from the middle: the head is one unit across
    const r = 0.375 + 0.035 * hash2(variant + 11, k);
    const at = on(r, a, 0.1 + 0.03 * hash2(variant + 5, k));
    if (lod < 2) mg.tube([top.clone(), on(r * 0.55, a, 0.085), at], [0.009, 0.007, 0.006], 3, LOOK.stalkA, LOOK.stalkB);
    m.compose(at, turn.setFromAxisAngle(new V3(0, 1, 0), hash2(k, variant) * TAU).premultiply(q), one);
    mg.add(showy, m, [1, 1, 1], at, 0.15 * (k / ringCount));
  }
  // the crowd of fertile flowers in the middle, spread like the seeds of a sunflower
  const small = fertile(lod);
  const crowd = [70, 26, 9][lod]!;
  for (let i = 0; i < crowd; i++) {
    const r = 0.3 * Math.sqrt((i + 0.5) / crowd);
    const at = on(r, i * 2.39996, 0.1 + 0.035 * Math.cos((Math.PI / 2) * (r / 0.3)) + 0.012 * hash2(i, variant));
    const s = (lod === 2 ? 2.4 : lod === 1 ? 1.5 : 1) * (0.85 + 0.3 * hash2(i, 3));
    m.compose(at, q, new V3(s, s, s));
    const tone = 0.9 + 0.2 * hash2(i, 9);
    mg.add(small, m, [tone, tone, tone], at, 0.3 + 0.5 * (r / 0.3));
  }
  // a few rays under the crowd, so the head has a frame when its flowers are over
  if (lod === 0) for (let k = 0; k < 7; k++) mg.tube([top.clone(), on(0.2, k * 0.9 + 0.3, 0.09)], [0.008, 0.005], 3, LOOK.stalkA, LOOK.stalkB);
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(top.clone(), 0.7);
  return g;
}

// ---------------------------------------------------------------------------
// The hold: rootlets from the side of the stem that lies on the support
// ---------------------------------------------------------------------------
const ROOTLET_LODS = 2;
const ROOTLET = { base: lin('#b08a5e'), tip: lin('#7a5a3a') };

function makeRootletsGeometry(variant: number, lod: number): THREE.BufferGeometry {
  const mg = new Merge(false);
  rootlets(mg, [8, 4][lod]!, 2.2, 0.45, 0.08, 3, ROOTLET.base, ROOTLET.tip, 60 + variant);
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, 0, 0.5), 1.4);
  return g;
}

const clingingRoots: AppendageAsset = {
  key: 'hydrangea-anomala-subsp-petiolaris/aerial-roots',
  variants: 2,
  lods: ROOTLET_LODS,
  make: makeRootletsGeometry,
  budget: [110, 52],
  pick: (r) => (r < 0.5 ? 0 : 1),
  aged: [0.2, 0.13, 0.08],
  agedDays: [120, 500],
  roughness: 0.95,
  swing: 0,
  detailAt: [1],
  detailCaps: [300],
};

// ---------------------------------------------------------------------------
// The look
// ---------------------------------------------------------------------------
const leaf: LeafAsset = {
  key: 'hydrangea-anomala-subsp-petiolaris/leaf',
  variants: 1,
  lods: HYDRANGEA_LEAF_LODS,
  make: makeHydrangeaLeafGeometry,
  budget: [190, 92, 48],
  pick: () => 0,
  // fresh green, clear yellow in autumn
  palette: { greenA: [0.12, 0.28, 0.06], greenB: [0.16, 0.34, 0.075], young: [0.22, 0.36, 0.09], autumnA: [0.78, 0.62, 0.08], autumnB: [0.6, 0.48, 0.07] },
  roughness: 0.55,
  translucency: THIN_LEAF,
  detailReach: 0.7,
};

const lacecap: FlowerAsset = {
  key: 'hydrangea-anomala-subsp-petiolaris/lacecap',
  variants: LACECAP_VARIANTS,
  lods: LACECAP_LODS,
  make: makeLacecapGeometry,
  budget: [2650, 600, 120],
  pick: (r) => Math.floor(r * LACECAP_VARIANTS),
  authoredSize: 1,
  poise: 'held',
  centreAlong: 0.35,
  budTint: [0.72, 0.84, 0.58],
  swing: 0.15,
  translucency: 0.25,
  sheen: 0.03,
  detailAt: [1.8, 5.5],
  detailCaps: [30, 200],
};

/** First values, from descriptions: to be checked against the plant. */
const wood: WoodLook = {
  young: lin('#84875a'),
  mature: lin('#9a6a44'),
  old: [0.92, 0.72, 0.52],
  woodyDays: [80, 330],
  oldDays: [600, 2000],
  furrowDays: [350, 1800],
  furrow: 0.5,
  stiffDays: [50, 450],
  relief: 4,
  roughness: 0.95,
  // broad flakes
  grain: { streaks: 420, width: 4, wobble: 22 },
};

export const look: TaxonLook = {
  taxonId: 'hydrangea-anomala-subsp-petiolaris',
  provisional: false,
  leaves: { default: leaf },
  flowers: { default: lacecap },
  fruits: null,
  appendages: { aerial_roots: clingingRoots },
  wood,
};
