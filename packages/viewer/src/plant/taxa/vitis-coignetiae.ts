// Vitis coignetiae (crimson glory vine), a deciduous tendril climber grown
// for its leaf.
//
//   leaf      very large, rounded and heart-based, shallowly three-lobed, with
//             a puckered surface, on a long stalk. Unit length along +Z, upper
//             side +Y. Its autumn scarlet comes from the palette below and the
//             season data; nothing here knows a date.
//   tendril   a tendril wound round what it met, or hooked where it met
//             nothing (a first, plain model)
//   wood      first values, from descriptions: felted shoots, dark bark that
//             shreds in long strips
//
// No flower: they are small and unobtrusive, and the plant is grown for leaf.
//
// Made from descriptions, not from specimens.
import * as THREE from 'three';
import { Merge, type Segs, lin, palmateBlade, simpleLeaf, tendrilPath } from '../kit.ts';
import { type AppendageAsset, type LeafAsset, THIN_LEAF, type TaxonLook, type WoodLook } from '../look.ts';

const VINE_LEAF_VARIANTS = 2;
const VINE_LEAF_LODS = 3;
const SEGS: Segs[] = [
  [24, 5],
  [14, 3],
  [8, 2],
];

function makeVineLeafGeometry(variant: number, lod: number): THREE.BufferGeometry {
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

// ---------------------------------------------------------------------------
// Tendrils
// ---------------------------------------------------------------------------
const TENDRIL_LODS = 2;
const TENDRIL = { base: lin('#8a9a58'), tip: lin('#a8a060') };

/** Variant 0 has hold and is wound round its support; variant 1 found nothing and ends in an open hook. */
function makeTendrilGeometry(variant: number, lod: number): THREE.BufferGeometry {
  const mg = new Merge(false);
  const n = [40, 10][lod]!;
  const pts = tendrilPath({ bow: variant === 0 ? 0.05 : 0.12, turns: variant === 0 ? 2.5 : 0, coilRadius: 0.09, creep: 0.05 }, n);
  mg.tube(pts, pts.map((_, i) => 0.014 * (1 - 0.55 * (i / (pts.length - 1)))), [5, 3][lod]!, TENDRIL.base, TENDRIL.tip);
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0.5), 0.7);
  return g;
}

const tendril: AppendageAsset = {
  key: 'vitis-coignetiae/tendril',
  variants: 2,
  lods: TENDRIL_LODS,
  make: makeTendrilGeometry,
  budget: [420, 64],
  pick: (_r, holding) => (holding ? 0 : 1),
  // a tendril that has hold turns woody
  aged: [0.2, 0.13, 0.08],
  agedDays: [70, 260],
  roughness: 0.8,
  swing: 0.2,
  detailAt: [1.4],
  detailCaps: [200],
};

// ---------------------------------------------------------------------------
// The look
// ---------------------------------------------------------------------------
const leaf: LeafAsset = {
  key: 'vitis-coignetiae/leaf',
  variants: VINE_LEAF_VARIANTS,
  lods: VINE_LEAF_LODS,
  make: makeVineLeafGeometry,
  budget: [270, 104, 48],
  pick: (_lengthM, r) => (r < 0.5 ? 0 : 1),
  // scarlet and crimson in autumn, which is what it is planted for
  palette: { greenA: [0.1, 0.22, 0.05], greenB: [0.13, 0.27, 0.06], young: [0.3, 0.3, 0.1], autumnA: [0.72, 0.09, 0.03], autumnB: [0.42, 0.03, 0.05] },
  roughness: 0.6,
  translucency: THIN_LEAF,
  detailReach: 1.3,
};

/** First values, from descriptions: to be checked against the plant. */
const wood: WoodLook = {
  // shoots felted grey-brown
  young: lin('#9a9068'),
  mature: lin('#7e563a'),
  old: [0.74, 0.6, 0.48],
  woodyDays: [90, 330],
  oldDays: [500, 1600],
  furrowDays: [300, 1600],
  furrow: 0.8,
  stiffDays: [50, 500],
  relief: 4.5,
  roughness: 0.95,
  // long stringy strips
  grain: { streaks: 380, width: 4.5, wobble: 10 },
};

export const look: TaxonLook = {
  taxonId: 'vitis-coignetiae',
  provisional: false,
  leaves: { default: leaf },
  flowers: null,
  fruits: null,
  appendages: { tendril },
  wood,
};
