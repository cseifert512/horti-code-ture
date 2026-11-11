// Hedera helix (common ivy), in its climbing, juvenile growth: an evergreen
// that clings by rootlets.
//
//   leaf     leathery and dark, with three to five pointed lobes and pale veins
//            fanning from the stalk. Unit length along +Z, upper side +Y.
//   hold     a patch of short clinging rootlets (a first, plain model)
//   wood     first values, from descriptions: green shoots, ageing grey-brown
//
// No flower: ivy flowers only on its adult, non-climbing growth, which the
// engine does not grow. When it does, the unlobed adult leaf is a second leaf
// form and goes in `leaves` under the name the growth model gives it.
//
// Made from descriptions, not from specimens.
import * as THREE from 'three';
import { Merge, type Segs, lin, palmateBlade, rootlets, simpleLeaf } from '../kit.ts';
import { type AppendageAsset, type LeafAsset, THIN_LEAF, type TaxonLook, type WoodLook } from '../look.ts';

const IVY_LEAF_VARIANTS = 2;
const IVY_LEAF_LODS = 3;
const SEGS: Segs[] = [
  [24, 4],
  [14, 3],
  [8, 2],
];

function makeIvyLeafGeometry(variant: number, lod: number): THREE.BufferGeometry {
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

// ---------------------------------------------------------------------------
// The hold: rootlets from the side of the stem that lies on the support
// ---------------------------------------------------------------------------
const ROOTLET_LODS = 2;
const ROOTLET = { base: lin('#b9a27c'), tip: lin('#8a7050') };

function makeRootletsGeometry(variant: number, lod: number): THREE.BufferGeometry {
  const mg = new Merge(false);
  rootlets(mg, [9, 4][lod]!, 2.6, 0.5, 0.07, 3, ROOTLET.base, ROOTLET.tip, 40 + variant);
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0.5), 1.6);
  return g;
}

const clingingRoots: AppendageAsset = {
  key: 'hedera-helix/aerial-roots',
  variants: 2,
  lods: ROOTLET_LODS,
  make: makeRootletsGeometry,
  budget: [120, 52],
  pick: (r) => (r < 0.5 ? 0 : 1),
  aged: [0.2, 0.14, 0.09],
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
  key: 'hedera-helix/leaf',
  variants: IVY_LEAF_VARIANTS,
  lods: IVY_LEAF_LODS,
  make: makeIvyLeafGeometry,
  budget: [220, 104, 48],
  pick: (_lengthM, r) => (r < 0.5 ? 0 : 1),
  // evergreen: no autumn colours of its own
  palette: { greenA: [0.035, 0.11, 0.035], greenB: [0.055, 0.15, 0.045], young: [0.13, 0.26, 0.06], autumnA: [0.055, 0.15, 0.045], autumnB: [0.035, 0.11, 0.035] },
  roughness: 0.3,
  translucency: THIN_LEAF,
  detailReach: 0.6,
};

/** First values, from descriptions: to be checked against the plant. */
const wood: WoodLook = {
  young: lin('#6a7d46'),
  mature: lin('#7c7256'),
  old: [0.8, 0.74, 0.66],
  woodyDays: [150, 500],
  oldDays: [600, 2000],
  furrowDays: [400, 2000],
  furrow: 0.4,
  stiffDays: [50, 400],
  relief: 2,
  roughness: 0.93,
};

export const look: TaxonLook = {
  taxonId: 'hedera-helix',
  provisional: false,
  leaves: { default: leaf },
  flowers: null,
  fruits: null,
  appendages: { aerial_roots: clingingRoots },
  wood,
};
