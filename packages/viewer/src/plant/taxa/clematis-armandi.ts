// Clematis armandii, an evergreen leaf-stalk climber that flowers in spring
// on the wood of the year before.
//
//   leaf     three long, leathery leaflets, widest near the base and drawn out
//            to a point, hanging from a stalk. Unit length along +Z, upper
//            side +Y.
//   flower   a white star of four to six narrow tepals round cream stamens, on
//            a short stalk. One unit is the width of the flower, which is what
//            the render data gives.
//   hold     a leaf stalk wound round what it met (a first, plain model)
//   wood     first values, from descriptions: stout green shoots, ageing to a
//            stringy grey-brown
//
// The flower is drawn by the same program as a raceme: tepals are tagged as
// flowers of an inflorescence that all open nearly together, the stalk and the
// stamens as its axis. When the tepals drop, the stamens stay: the seed head.
//
// Made from descriptions, not from specimens. This module is this clematis's
// alone: the other clematis have their own copies of whatever they once shared.
import * as THREE from 'three';
import { hash2 } from '../../util.ts';
import { type CompoundLayout, Merge, type RGB, Surf, blade, compoundLeaf, lin, mix, tendrilPath } from '../kit.ts';
import { type AppendageAsset, type FlowerAsset, type LeafAsset, THIN_LEAF, type TaxonLook, type WoodLook } from '../look.ts';

const V3 = THREE.Vector3;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Leaf
// ---------------------------------------------------------------------------
const CLEMATIS_LEAF_LODS = 3;

/**
 * Clematis armandii: three long, leathery leaflets, widest near the base and
 * drawn out to a point, hanging from a stalk.
 */
const ARMANDII_SEGS: [number, number][] = [
  [6, 10],
  [3, 5],
  [2, 3],
];
function makeArmandiiLeafGeometry(_variant: number, lod: number): THREE.BufferGeometry {
  const leaflet = blade({ halfWidth: 0.17, widest: 0.6, taper: 0.8, fold: 0.22, arch: 0.22, wave: 0.01 }, ARMANDII_SEGS[lod]!, lod === 0);
  const layout: CompoundLayout = {
    axisEnd: 0.3,
    axisRadius: 0.012,
    arch: 0.06,
    leaflets: [
      { at: 1, side: -1, length: 0.66 },
      { at: 1, side: 1, length: 0.66 },
      { at: 1, side: 0, length: 0.72 },
    ],
    stalk: 0.06,
    forward: [0.7, 0.95],
    droop: [0.25, 0.5],
    seed: 811,
  };
  return compoundLeaf(leaflet, layout, lod);
}

// ---------------------------------------------------------------------------
// Shared: a tuft of stamens, tagged as axis so it outlasts the tepals
// ---------------------------------------------------------------------------
function stamens(mg: Merge, centre: THREE.Vector3, axis: THREE.Vector3, count: number, length: number, spread: number, radial: number, c0: Readonly<RGB>, c1: Readonly<RGB>, seed: number): void {
  const side = new V3(1, 0, 0);
  if (Math.abs(axis.x) > 0.9) side.set(0, 1, 0);
  side.addScaledVector(axis, -side.dot(axis)).normalize();
  const other = new V3().crossVectors(axis, side);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + hash2(seed, i) * 0.8;
    const tilt = spread * Math.sqrt((i + 0.5) / count);
    const dir = axis
      .clone()
      .multiplyScalar(Math.cos(tilt))
      .addScaledVector(side, Math.sin(tilt) * Math.cos(a))
      .addScaledVector(other, Math.sin(tilt) * Math.sin(a));
    const len = length * (0.75 + 0.5 * hash2(seed + 7, i));
    mg.tube([centre.clone(), centre.clone().addScaledVector(dir, len)], [0.012, 0.016], radial, c0, c1);
  }
}

const TEPAL_SEGS: [number, number][] = [
  [6, 8],
  [3, 4],
  [2, 2],
];

const CLEMATIS_FLOWER_LODS = 3;

/** What sets one flat clematis flower apart from another. */
interface StarLook {
  deep: RGB;
  mid: RGB;
  bar: RGB;
  base: RGB;
  stamenA: RGB;
  stamenB: RGB;
  stalkA: RGB;
  stalkB: RGB;
  /** Half the width of a tepal, as a share of the flower's width. */
  tepalHalfWidth: number;
  /** Length of the stalk, in flower widths. */
  stalk: number;
}

/** Tepals per variant of the C. armandii flower. */
const STAR_FLOWER_TEPALS: readonly number[] = [5, 6, 4];

const ARMANDII: StarLook = {
  deep: lin('#ece9d6'),
  mid: lin('#f8f6ea'),
  bar: lin('#f1eecf'),
  base: lin('#e4e8c4'),
  stamenA: lin('#efe9b6'),
  stamenB: lin('#d6d48e'),
  stalkA: lin('#6f7d48'),
  stalkB: lin('#8d9a62'),
  tepalHalfWidth: 0.125,
  stalk: 0.55,
};

function makeStarFlowerGeometry(variant: number, lod: number): THREE.BufferGeometry {
  return starFlower(STAR_FLOWER_TEPALS[variant]!, variant + 10, lod, ARMANDII);
}

function starFlower(n: number, variant: number, lod: number, look: StarLook): THREE.BufferGeometry {
  const mg = new Merge(false);
  const [nu, nv] = TEPAL_SEGS[lod]!;
  // the stalk rises from the node and leans out; the flower looks out and a little up
  const stalk = (s: number) => new V3(0, 0.95 * look.stalk * s, 0.32 * look.stalk * s * s);
  const centre = stalk(1);
  const axis = new V3(0, 0.34, 1).normalize();
  const right = new V3(1, 0, 0);
  const up = new V3().crossVectors(axis, right).normalize();

  const NS = [6, 3, 2][lod]!;
  const pts: THREE.Vector3[] = [];
  const radii: number[] = [];
  for (let i = 0; i <= NS; i++) {
    pts.push(stalk(i / NS));
    radii.push(0.014);
  }
  mg.tube(pts, radii, [5, 4, 3][lod]!, look.stalkA, look.stalkB);

  const id = new THREE.Matrix4();
  for (let k = 0; k < n; k++) {
    const theta = (k / n) * TAU + (hash2(variant, k) - 0.5) * 0.18;
    const er = right.clone().multiplyScalar(Math.cos(theta)).addScaledVector(up, Math.sin(theta));
    const et = right.clone().multiplyScalar(-Math.sin(theta)).addScaledVector(up, Math.cos(theta));
    const sb = new Surf();
    sb.surf(nu, nv, (u01, v) => {
      const u = u01 * 2 - 1;
      const r = 0.03 + 0.47 * v;
      // broad in the middle, narrowed to the base, drawn to a short point
      const hw = look.tepalHalfWidth * Math.pow(Math.sin(Math.PI * Math.pow(v, 0.85)), 0.65) + 0.004;
      // a little cupped, the tip turned back, a channel down the middle
      let h = 0.05 * Math.sin(Math.PI * v) - 0.1 * v * v * v - 0.018 * Math.exp(-((u / 0.3) ** 2)) * (1 - v) + 0.03 * u * u * (1 - v);
      if (lod === 0) h += 0.012 * Math.sin(v * 14 + k) * u * u;
      const p = centre
        .clone()
        .addScaledVector(er, r)
        .addScaledVector(et, u * hw)
        .addScaledVector(axis, h);
      let c = mix(look.base, look.mid, Math.min(1, v * 3));
      c = mix(c, look.deep, Math.pow(Math.abs(u), 2) * 0.6 + Math.max(0, v - 0.7));
      c = mix(c, look.bar, 0.5 * Math.exp(-((u / 0.22) ** 2)) * (1 - 0.5 * v));
      return { p: [p.x, p.y, p.z], c };
    });
    const tone = 0.94 + 0.12 * hash2(variant + 3, k);
    mg.add(sb.build(), id, [tone, tone, tone], centre, (k / n) * 0.25);
  }
  if (lod < 2) stamens(mg, centre, axis, lod === 0 ? 18 : 8, 0.11, 0.75, lod === 0 ? 4 : 3, look.stamenA, look.stamenB, 31 + variant);
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(centre.clone(), 0.9);
  return g;
}

// ---------------------------------------------------------------------------
// The hold: a leaf stalk wound round what it met. A first, plain model.
// ---------------------------------------------------------------------------
const COIL_LODS = 2;
const COIL = { green: lin('#6f7d48'), tip: lin('#5e5a3c') };

/** Variant 0 has hold and is wound round its support; variant 1 found nothing and is only crooked. */
function makeStalkCoilGeometry(variant: number, lod: number): THREE.BufferGeometry {
  const mg = new Merge(false);
  const n = [18, 8][lod]!;
  const pts = tendrilPath({ bow: 0.06, turns: variant === 0 ? 1.5 : 0, coilRadius: 0.16, creep: 0.09 }, n);
  mg.tube(pts, pts.map((_, i) => 0.035 * (1 - 0.35 * (i / (pts.length - 1)))), [5, 3][lod]!, COIL.green, COIL.tip);
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, 0, 0.5), 0.7);
  return g;
}

const stalkCoil: AppendageAsset = {
  key: 'clematis-armandi/leaf-stalk-coil',
  variants: 2,
  lods: COIL_LODS,
  make: makeStalkCoilGeometry,
  budget: [200, 60],
  pick: (_r, holding) => (holding ? 0 : 1),
  // a stalk that has hold hardens and browns, and outlasts its leaf
  aged: [0.22, 0.14, 0.08],
  agedDays: [60, 240],
  roughness: 0.8,
  swing: 0,
  detailAt: [1.2],
  detailCaps: [200],
};

// ---------------------------------------------------------------------------
// The look
// ---------------------------------------------------------------------------
const leaf: LeafAsset = {
  key: 'clematis-armandi/leaf',
  variants: 1,
  lods: CLEMATIS_LEAF_LODS,
  make: makeArmandiiLeafGeometry,
  budget: [480, 150, 52],
  pick: () => 0,
  // leathery and dark, the new leaves bronze; evergreen, so no autumn colours of its own
  palette: { greenA: [0.05, 0.14, 0.045], greenB: [0.07, 0.18, 0.055], young: [0.25, 0.2, 0.09], autumnA: [0.07, 0.18, 0.055], autumnB: [0.05, 0.14, 0.045] },
  roughness: 0.3,
  translucency: THIN_LEAF,
  detailReach: 0.8,
};

const flower: FlowerAsset = {
  key: 'clematis-armandi/flower',
  variants: STAR_FLOWER_TEPALS.length,
  lods: CLEMATIS_FLOWER_LODS,
  make: makeStarFlowerGeometry,
  budget: [800, 230, 64],
  // five tepals most often, sometimes six or four
  pick: (r) => (r < 0.5 ? 0 : r < 0.85 ? 1 : 2),
  authoredSize: 1,
  poise: 'held',
  centreAlong: 0.5,
  budTint: [0.8, 0.88, 0.7],
  swing: 0.3,
  translucency: 0.3,
  sheen: 0.05,
  detailAt: [1.1, 3.2],
  detailCaps: [60, 500],
};

/** First values, from descriptions: to be checked against the plant. */
const wood: WoodLook = {
  young: lin('#6f8a4a'),
  mature: lin('#8a7450'),
  old: [0.88, 0.8, 0.68],
  woodyDays: [90, 330],
  oldDays: [450, 1400],
  furrowDays: [300, 1400],
  furrow: 0.35,
  stiffDays: [45, 360],
  relief: 2.4,
  roughness: 0.9,
  // straight, stringy fibres
  grain: { streaks: 640, width: 2, wobble: 6 },
};

export const look: TaxonLook = {
  taxonId: 'clematis-armandi',
  provisional: false,
  leaves: { default: leaf },
  flowers: { default: flower },
  fruits: null,
  appendages: { leaf_stalk_coil: stalkCoil },
  wood,
};
