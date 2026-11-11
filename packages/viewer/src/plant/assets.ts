// Which leaf and flower models a taxon is drawn with.
//
// Mechanism traits do not transfer, and neither do looks: a honeysuckle must
// not be shown with racemes and pinnate leaves. So every taxon the viewer can
// draw is listed here with organ models of its own. A plant of any other
// taxon gets a plain stand-in leaf and no flowers, so that it still reads as a
// plant, and is named in the caption as having a provisional look.
//
// What is here is appearance: shapes, colours, how stiffly a flower is held.
// Sizes come from the render data (an organ model is authored at a nominal
// size and scaled to the length the data gives), and so does every date.
import type * as THREE from 'three';
import {
  BELL_FLOWER_VARIANTS,
  CLEMATIS_FLOWER_LODS,
  CLEMATIS_LEAF_LODS,
  OPEN_FLOWER_TEPALS,
  STAR_FLOWER_TEPALS,
  makeArmandiiLeafGeometry,
  makeBellFlowerGeometry,
  makeClematisLeafGeometry,
  makeOpenFlowerGeometry,
  makeStarFlowerGeometry,
} from './organs-clematis.ts';
import { GENERIC_LEAF_LODS, makeGenericLeafGeometry } from './organs-generic.ts';
import { IVY_LEAF_LODS, IVY_LEAF_VARIANTS, makeIvyLeafGeometry } from './organs-hedera.ts';
import { HYDRANGEA_LEAF_LODS, LACECAP_LODS, LACECAP_VARIANTS, makeHydrangeaLeafGeometry, makeLacecapGeometry } from './organs-hydrangea.ts';
import {
  HENRYI_CLUSTER_VARIANTS,
  HONEYSUCKLE_CLUSTER_LODS,
  LONICERA_LEAF_LODS,
  LONICERA_LEAF_VARIANTS,
  WOODBINE_CLUSTER_VARIANTS,
  WOODBINE_LEAF_LODS,
  WOODBINE_LEAF_VARIANTS,
  makeHenryiClusterGeometry,
  makeLoniceraLeafGeometry,
  makeWoodbineClusterGeometry,
  makeWoodbineLeafGeometry,
} from './organs-lonicera.ts';
import { ROSE_FLOWER_LODS, ROSE_FLOWER_VARIANTS, ROSE_LEAFLETS, ROSE_LEAF_LODS, makeRoseFlowerGeometry, makeRoseLeafGeometry } from './organs-rosa.ts';
import { JASMINE_CLUSTER_LODS, JASMINE_CLUSTER_VARIANTS, JASMINE_LEAF_LODS, JASMINE_LEAF_VARIANTS, makeJasmineClusterGeometry, makeJasmineLeafGeometry } from './organs-trachelospermum.ts';
import { VINE_LEAF_LODS, VINE_LEAF_VARIANTS, makeVineLeafGeometry } from './organs-vitis.ts';
import { LEAF_LODS, LEAF_VARIANTS, RACEME_LEN, RACEME_LODS, RACEME_VARIANTS, makeLeafGeometry, makeRacemeGeometry } from './organs.ts';

export type Triple = readonly [number, number, number];

/** Leaf colours, linear RGB: mature (two ends of leaf-to-leaf variation), newly unfolded, autumn (two ends). */
export interface LeafPalette {
  greenA: Triple;
  greenB: Triple;
  young: Triple;
  autumnA: Triple;
  autumnB: Triple;
}

export interface LeafAsset {
  key: string;
  variants: number;
  lods: number;
  make(variant: number, lod: number): THREE.BufferGeometry;
  /** Which variant a leaf gets: `r` is a fixed random number in [0, 1) for that leaf. */
  pick(lengthM: number, r: number): number;
  palette: LeafPalette;
  /** Surface gloss of the blade: lower is shinier. */
  roughness: number;
  /** Level-of-detail distances relative to the wisteria leaf's: small leaves can simplify sooner. */
  detailReach: number;
}

export interface FlowerAsset {
  key: string;
  variants: number;
  lods: number;
  make(variant: number, lod: number): THREE.BufferGeometry;
  pick(r: number): number;
  /** The size the model is authored at, in the units of RenderFlower.lengthM: an instance is scaled by lengthM / this. */
  authoredSize: number;
  /** Where the middle of the organ is relative to its attachment, in sizes: + below, - above. For choosing detail by distance. */
  centreDrop: number;
  /** Tint of an unopened flower, multiplied on to its colours. */
  budTint: Triple;
  /** How freely it swings in wind, 0 to 1. */
  swing: number;
  /** How much light comes through the petals from behind, and how strong the soft rim light of a velvety surface is. */
  translucency: number;
  sheen: number;
  /** Camera distances (m) at which it drops to each coarser model, and how many of the finer models may be shown at once at full detail. */
  detailAt: readonly number[];
  detailCaps: readonly number[];
}

export interface TaxonAssets {
  leaf: LeafAsset;
  flower: FlowerAsset | null;
  /** True for the stand-in given to a taxon with no models of its own. */
  provisional: boolean;
}

/** An evergreen leaf has no autumn colours of its own: should the data ever turn one, it keeps its greens. */
const evergreen = (greenA: Triple, greenB: Triple, young: Triple): LeafPalette => ({ greenA, greenB, young, autumnA: greenB, autumnB: greenA });
const either = (_lengthM: number, r: number) => (r < 0.5 ? 0 : 1);

const wisteriaLeaf: LeafAsset = {
  key: 'wisteria-leaf',
  variants: LEAF_VARIANTS.length,
  lods: LEAF_LODS,
  make: makeLeafGeometry,
  pick: (lengthM, r) => (lengthM < 0.1 || r < 0.2 ? 0 : r < 0.8 ? 1 : 2),
  palette: { greenA: [0.145, 0.3, 0.05], greenB: [0.19, 0.36, 0.065], young: [0.4, 0.27, 0.085], autumnA: [0.8, 0.56, 0.05], autumnB: [0.62, 0.36, 0.06] },
  roughness: 0.5,
  detailReach: 1,
};

const raceme: FlowerAsset = {
  key: 'wisteria-raceme',
  variants: RACEME_VARIANTS,
  lods: RACEME_LODS,
  make: makeRacemeGeometry,
  pick: (r) => Math.floor(r * RACEME_VARIANTS),
  authoredSize: RACEME_LEN,
  centreDrop: 0.5,
  budTint: [0.62, 0.55, 0.86],
  swing: 0.6,
  translucency: 0.3,
  sheen: 0.1,
  detailAt: [1.3, 3.2, 6.5],
  detailCaps: [26, 130, 800],
};

const loniceraLeaf: LeafAsset = {
  key: 'lonicera-leaf',
  variants: LONICERA_LEAF_VARIANTS,
  lods: LONICERA_LEAF_LODS,
  make: makeLoniceraLeafGeometry,
  pick: (_lengthM, r) => (r < 0.5 ? 0 : 1),
  // dark and glossy all year; new leaves a paler green
  palette: { greenA: [0.05, 0.14, 0.04], greenB: [0.075, 0.18, 0.05], young: [0.17, 0.27, 0.08], autumnA: [0.075, 0.18, 0.05], autumnB: [0.05, 0.14, 0.04] },
  roughness: 0.32,
  detailReach: 0.6,
};

const clematisLeaf = (leaflets: 3 | 5, lobed: boolean, palette: LeafPalette, roughness: number): LeafAsset => ({
  key: `clematis-leaf-${leaflets}${lobed ? '-lobed' : ''}`,
  variants: 1,
  lods: CLEMATIS_LEAF_LODS,
  make: (_variant, lod) => makeClematisLeafGeometry(leaflets, lobed, lod),
  pick: () => 0,
  palette,
  roughness,
  detailReach: 0.7,
});

const openFlower: FlowerAsset = {
  key: 'clematis-open-flower',
  variants: OPEN_FLOWER_TEPALS.length,
  lods: CLEMATIS_FLOWER_LODS,
  make: makeOpenFlowerGeometry,
  // most flowers have six tepals, some five, a few four
  pick: (r) => (r < 0.6 ? 0 : r < 0.87 ? 1 : 2),
  authoredSize: 1,
  centreDrop: -0.7,
  budTint: [0.6, 0.55, 0.8],
  swing: 0.3,
  translucency: 0.1,
  sheen: 0.22,
  detailAt: [1.1, 3.2],
  detailCaps: [60, 500],
};

const bellFlower: FlowerAsset = {
  key: 'clematis-bell-flower',
  variants: BELL_FLOWER_VARIANTS,
  lods: CLEMATIS_FLOWER_LODS,
  make: makeBellFlowerGeometry,
  pick: (r) => Math.floor(r * BELL_FLOWER_VARIANTS),
  authoredSize: 1,
  centreDrop: 1,
  budTint: [0.82, 0.9, 0.68],
  swing: 0.5,
  translucency: 0.35,
  sheen: 0.05,
  detailAt: [1.1, 3.2],
  detailCaps: [60, 500],
};

const starFlower: FlowerAsset = {
  ...openFlower,
  key: 'clematis-star-flower',
  variants: STAR_FLOWER_TEPALS.length,
  make: makeStarFlowerGeometry,
  // five tepals most often, sometimes six or four
  pick: (r) => (r < 0.5 ? 0 : r < 0.85 ? 1 : 2),
  centreDrop: -0.5,
  budTint: [0.8, 0.88, 0.7],
  translucency: 0.3,
  sheen: 0.05,
};

const lacecap: FlowerAsset = {
  key: 'hydrangea-lacecap',
  variants: LACECAP_VARIANTS,
  lods: LACECAP_LODS,
  make: makeLacecapGeometry,
  pick: (r) => Math.floor(r * LACECAP_VARIANTS),
  authoredSize: 1,
  centreDrop: -0.35,
  budTint: [0.72, 0.84, 0.58],
  swing: 0.15,
  translucency: 0.25,
  sheen: 0.03,
  detailAt: [1.8, 5.5],
  detailCaps: [30, 200],
};

/** A single flower or a small cluster held on a stalk, one unit across. */
const held = (key: string, variants: number, lods: number, make: FlowerAsset['make'], look: Pick<FlowerAsset, 'centreDrop' | 'budTint' | 'swing' | 'translucency' | 'sheen'>): FlowerAsset => ({
  key,
  variants,
  lods,
  make,
  pick: (r) => Math.floor(r * variants),
  authoredSize: 1,
  detailAt: [1.1, 3.2],
  detailCaps: [60, 500],
  ...look,
});

const roseFlower = held('rose-flower', ROSE_FLOWER_VARIANTS, ROSE_FLOWER_LODS, makeRoseFlowerGeometry, { centreDrop: -0.55, budTint: [0.95, 0.72, 0.74], swing: 0.25, translucency: 0.4, sheen: 0.08 });
const woodbineCluster = held('woodbine-cluster', WOODBINE_CLUSTER_VARIANTS, HONEYSUCKLE_CLUSTER_LODS, makeWoodbineClusterGeometry, { centreDrop: -0.15, budTint: [0.95, 0.9, 0.7], swing: 0.3, translucency: 0.35, sheen: 0.03 });
const henryiCluster = held('henryi-cluster', HENRYI_CLUSTER_VARIANTS, HONEYSUCKLE_CLUSTER_LODS, makeHenryiClusterGeometry, { centreDrop: -0.15, budTint: [0.9, 0.8, 0.6], swing: 0.3, translucency: 0.3, sheen: 0.03 });
const jasmineCluster = held('jasmine-cluster', JASMINE_CLUSTER_VARIANTS, JASMINE_CLUSTER_LODS, makeJasmineClusterGeometry, { centreDrop: -0.4, budTint: [0.85, 0.9, 0.7], swing: 0.3, translucency: 0.4, sheen: 0.03 });

const simple = (key: string, variants: number, lods: number, make: LeafAsset['make'], palette: LeafPalette, roughness: number, detailReach: number): LeafAsset => ({
  key,
  variants,
  lods,
  make,
  pick: variants > 1 ? either : () => 0,
  palette,
  roughness,
  detailReach,
});

const own = (leaf: LeafAsset, flower: FlowerAsset | null = null): TaxonAssets => ({ leaf, flower, provisional: false });
const wisteria = own(wisteriaLeaf, raceme);

const BY_TAXON: Record<string, TaxonAssets> = {
  'wisteria-sinensis': wisteria,
  // the hand-made render test says in its data that it borrows the wisteria models
  'render-test': wisteria,
  'lonicera-henryi': own(loniceraLeaf, henryiCluster),
  // soft, dull green, yellowing a little before it drops
  'lonicera-periclymenum-graham-thomas': own(
    simple('woodbine-leaf', WOODBINE_LEAF_VARIANTS, WOODBINE_LEAF_LODS, makeWoodbineLeafGeometry, { greenA: [0.1, 0.22, 0.07], greenB: [0.13, 0.27, 0.085], young: [0.2, 0.32, 0.1], autumnA: [0.45, 0.42, 0.1], autumnB: [0.3, 0.3, 0.08] }, 0.65, 0.6),
    woodbineCluster,
  ),
  // small, dark and very glossy
  'trachelospermum-jasminoides': own(simple('jasmine-leaf', JASMINE_LEAF_VARIANTS, JASMINE_LEAF_LODS, makeJasmineLeafGeometry, evergreen([0.045, 0.13, 0.04], [0.065, 0.17, 0.05], [0.16, 0.3, 0.07]), 0.28, 0.55), jasmineCluster),
  'clematis-viticella-etoile-violette': own(
    clematisLeaf(5, false, { greenA: [0.12, 0.26, 0.06], greenB: [0.16, 0.32, 0.075], young: [0.26, 0.34, 0.1], autumnA: [0.62, 0.5, 0.1], autumnB: [0.42, 0.3, 0.08] }, 0.55),
    openFlower,
  ),
  'clematis-cirrhosa-freckles': own(clematisLeaf(3, true, evergreen([0.07, 0.17, 0.045], [0.1, 0.22, 0.055], [0.27, 0.2, 0.09]), 0.36), bellFlower),
  // leathery and dark, the new leaves bronze
  'clematis-armandi': own(simple('armandii-leaf', 1, CLEMATIS_LEAF_LODS, makeArmandiiLeafGeometry, evergreen([0.05, 0.14, 0.045], [0.07, 0.18, 0.055], [0.25, 0.2, 0.09]), 0.3, 0.8), starFlower),
  // fresh green, clear yellow in autumn
  'hydrangea-anomala-subsp-petiolaris': own(
    simple('hydrangea-leaf', 1, HYDRANGEA_LEAF_LODS, makeHydrangeaLeafGeometry, { greenA: [0.12, 0.28, 0.06], greenB: [0.16, 0.34, 0.075], young: [0.22, 0.36, 0.09], autumnA: [0.78, 0.62, 0.08], autumnB: [0.6, 0.48, 0.07] }, 0.55, 0.7),
    lacecap,
  ),
  // scarlet and crimson in autumn, which is what it is planted for
  'vitis-coignetiae': own(
    simple('vine-leaf', VINE_LEAF_VARIANTS, VINE_LEAF_LODS, makeVineLeafGeometry, { greenA: [0.1, 0.22, 0.05], greenB: [0.13, 0.27, 0.06], young: [0.3, 0.3, 0.1], autumnA: [0.72, 0.09, 0.03], autumnB: [0.42, 0.03, 0.05] }, 0.6, 1.3),
  ),
  'hedera-helix': own(simple('ivy-leaf', IVY_LEAF_VARIANTS, IVY_LEAF_LODS, makeIvyLeafGeometry, evergreen([0.035, 0.11, 0.035], [0.055, 0.15, 0.045], [0.13, 0.26, 0.06]), 0.3, 0.6)),
  // new leaves reddish
  'rosa-the-generous-gardener': own(
    {
      ...simple('rose-leaf', ROSE_LEAFLETS.length, ROSE_LEAF_LODS, makeRoseLeafGeometry, { greenA: [0.09, 0.2, 0.06], greenB: [0.12, 0.25, 0.07], young: [0.33, 0.2, 0.1], autumnA: [0.6, 0.5, 0.1], autumnB: [0.4, 0.3, 0.08] }, 0.45, 0.7),
      pick: (_lengthM, r) => (r < 0.6 ? 0 : 1),
    },
    roseFlower,
  ),
};

/** The stand-in for a taxon with no models: a plain leaf in a middling green, and no flowers. */
const PROVISIONAL: TaxonAssets = {
  leaf: simple('provisional-leaf', 1, GENERIC_LEAF_LODS, makeGenericLeafGeometry, { greenA: [0.11, 0.24, 0.06], greenB: [0.14, 0.29, 0.07], young: [0.2, 0.32, 0.09], autumnA: [0.6, 0.5, 0.1], autumnB: [0.4, 0.32, 0.08] }, 0.55, 0.7),
  flower: null,
  provisional: true,
};

/** The organ models a taxon is drawn with: its own, or the provisional stand-in. */
export function assetsFor(taxonId: string): TaxonAssets {
  return BY_TAXON[taxonId] ?? PROVISIONAL;
}

/** Taxa that have organ models of their own. */
export const MODELLED_TAXA: readonly string[] = Object.keys(BY_TAXON).filter((id) => id !== 'render-test');
