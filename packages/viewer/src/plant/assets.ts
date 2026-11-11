// Which leaf and flower models a taxon is drawn with.
//
// Mechanism traits do not transfer, and neither do looks: a honeysuckle must
// not be shown with racemes and pinnate leaves. So every taxon the viewer can
// draw is listed here with organ models of its own, and a plant of any other
// taxon is drawn as stems only and named as lacking them.
//
// What is here is appearance: shapes, colours, how stiffly a flower is held.
// Sizes come from the render data (an organ model is authored at a nominal
// size and scaled to the length the data gives), and so does every date.
import type * as THREE from 'three';
import { CLEMATIS_FLOWER_LODS, CLEMATIS_LEAF_LODS, BELL_FLOWER_VARIANTS, OPEN_FLOWER_TEPALS, makeBellFlowerGeometry, makeClematisLeafGeometry, makeOpenFlowerGeometry } from './organs-clematis.ts';
import { LONICERA_LEAF_LODS, LONICERA_LEAF_VARIANTS, makeLoniceraLeafGeometry } from './organs-lonicera.ts';
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
}

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

const wisteria: TaxonAssets = { leaf: wisteriaLeaf, flower: raceme };

const BY_TAXON: Record<string, TaxonAssets> = {
  'wisteria-sinensis': wisteria,
  // the hand-made render test says in its data that it borrows the wisteria models
  'render-test': wisteria,
  'lonicera-henryi': { leaf: loniceraLeaf, flower: null },
  'clematis-viticella-etoile-violette': {
    leaf: clematisLeaf(5, false, { greenA: [0.12, 0.26, 0.06], greenB: [0.16, 0.32, 0.075], young: [0.26, 0.34, 0.1], autumnA: [0.62, 0.5, 0.1], autumnB: [0.42, 0.3, 0.08] }, 0.55),
    flower: openFlower,
  },
  'clematis-cirrhosa-freckles': {
    leaf: clematisLeaf(3, true, { greenA: [0.07, 0.17, 0.045], greenB: [0.1, 0.22, 0.055], young: [0.27, 0.2, 0.09], autumnA: [0.1, 0.22, 0.055], autumnB: [0.07, 0.17, 0.045] }, 0.36),
    flower: bellFlower,
  },
};

/** The organ models for a taxon, or null if the viewer has none for it. */
export function assetsFor(taxonId: string): TaxonAssets | null {
  return BY_TAXON[taxonId] ?? null;
}
