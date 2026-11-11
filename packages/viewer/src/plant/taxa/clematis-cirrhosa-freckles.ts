// Clematis cirrhosa 'Freckles', an evergreen leaf-stalk climber that flowers
// in winter.
//
//   leaf     a compound leaf of three shallowly lobed, stalked leaflets on a
//            wiry axis. Unit length along +Z, upper side +Y.
//   flower   a nodding bell of four cream tepals speckled red-maroon, hanging
//            on its stalk. One unit is the width of the mouth of the bell,
//            which is what the render data gives.
//   hold     a leaf stalk wound round what it met (a first, plain model)
//   wood     first values, from descriptions: slender brown stems
//
// The flower is drawn by the same program as a raceme: tepals are tagged as
// flowers of an inflorescence that all open nearly together, the stalk and the
// stamens as its axis. When the tepals drop, the stamens stay: the seed head.
//
// Made from descriptions, not from specimens. This module is this clematis's
// alone: the other clematis have their own copies of whatever they once shared.
import * as THREE from 'three';
import { RNG, hash2 } from '../../util.ts';
import { Merge, type RGB, Surf, lin, mix, tendrilPath } from '../kit.ts';
import { type AppendageAsset, type FlowerAsset, type LeafAsset, THIN_LEAF, type TaxonLook, type WoodLook } from '../look.ts';

const V3 = THREE.Vector3;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Leaf
// ---------------------------------------------------------------------------
const CLEMATIS_LEAF_LODS = 3;

const LEAFLET_SEGS: [number, number][] = [
  [6, 9],
  [3, 4],
  [2, 2],
];

function leaflet(lod: number, lobed: boolean): THREE.BufferGeometry {
  const sb = new Surf();
  const [nu, nv] = LEAFLET_SEGS[lod]!;
  sb.surf(nu, nv, (u01, v) => {
    const u = u01 * 2 - 1;
    // ovate: broad near the base, tapering to a point
    let hw = 0.27 * Math.pow(Math.sin(Math.PI * Math.pow(v, 0.6)), 0.75) + 0.004;
    if (lobed && lod < 2) hw *= 1 + 0.2 * Math.sin(3 * Math.PI * v) * (1 - v);
    const x = u * hw;
    let y = 0.18 * Math.abs(x) - 0.12 * v * v;
    if (lod === 0) y += 0.02 * Math.sin(v * 12 + u * 1.5) * u * u;
    return { p: [x, y, v] };
  });
  return sb.build();
}

/** `leaflets` 3 or 5; `lobed` gives each leaflet a shallowly lobed outline. */
function makeClematisLeafGeometry(leaflets: 3 | 5, lobed: boolean, lod: number): THREE.BufferGeometry {
  const rng = new RNG(700 + leaflets * 13 + (lobed ? 1 : 0));
  const mg = new Merge(true);
  const blade = leaflet(lod, lobed);
  // the axis: a thin stalk, arching a little
  const axisEnd = leaflets === 3 ? 0.58 : 0.64;
  const at = (t: number) => new V3(0, -0.1 * t * t, t * axisEnd);
  const NS = [8, 4, 2][lod]!;
  const pts: THREE.Vector3[] = [];
  const radii: number[] = [];
  for (let i = 0; i <= NS; i++) {
    pts.push(at(i / NS));
    radii.push(0.009 * (1 - 0.4 * (i / NS)));
  }
  const radial = [5, 4, 3][lod]!;
  mg.tube(pts, radii, radial, [1, 1, 1], [1, 1, 1], [0.5, 0.02]);

  const AX = new V3(1, 0, 0);
  const AY = new V3(0, 1, 0);
  const AZ = new V3(0, 0, 1);
  const q = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const m = new THREE.Matrix4();
  const put = (t: number, side: number, length: number) => {
    const from = at(t);
    // a short stalk of its own, out to the side (or straight on, for the end leaflet)
    const yaw = side === 0 ? rng.range(-0.15, 0.15) : side * (Math.PI / 2 - rng.range(0.35, 0.6));
    const stalk = 0.07 + (side === 0 ? 0 : 0.03);
    const base = from.clone().add(new V3(Math.sin(yaw) * stalk, -0.01, Math.cos(yaw) * stalk));
    if (lod < 2) mg.tube([from, base], [0.007, 0.006], radial, [1, 1, 1], [1, 1, 1], [0.5, 0.02]);
    q.setFromAxisAngle(AY, yaw);
    q.multiply(q2.setFromAxisAngle(AX, rng.range(0.05, 0.35)));
    q.multiply(q2.setFromAxisAngle(AZ, rng.range(-0.25, 0.25) - side * 0.12));
    const s = length * rng.range(0.92, 1.08);
    m.compose(base, q, new V3(s, s, s));
    const tone = rng.range(0.9, 1.1);
    mg.add(blade, m, [tone, tone, tone], base, rng.f());
  };
  if (leaflets === 5) {
    put(0.42, -1, 0.3);
    put(0.42, 1, 0.3);
    put(0.78, -1, 0.31);
    put(0.78, 1, 0.31);
    put(1, 0, 0.36);
  } else {
    put(0.72, -1, 0.36);
    put(0.72, 1, 0.36);
    put(1, 0, 0.42);
  }
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, 0, 0.5), 0.8);
  return g;
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

const CLEMATIS_FLOWER_LODS = 3;

// ---------------------------------------------------------------------------
// Bell flower: Clematis cirrhosa 'Freckles'
// ---------------------------------------------------------------------------
const BELL_FLOWER_VARIANTS = 2;

const FRECKLES = {
  cream: lin('#efe9c4'),
  flush: lin('#e2cfae'),
  spot: lin('#7d2233'),
  stamenA: lin('#e6e3b0'),
  stamenB: lin('#c9cf8c'),
  stalkA: lin('#6a7445'),
  stalkB: lin('#7b6a55'),
};

const BELL_SEGS: [number, number][] = [
  [10, 14],
  [5, 6],
  [2, 2],
];

function makeBellFlowerGeometry(variant: number, lod: number): THREE.BufferGeometry {
  const mg = new Merge(false);
  const [nu, nv] = BELL_SEGS[lod]!;
  // it hangs: the stalk curves over and down
  const stalk = (s: number) => new V3(0.1 * Math.sin((Math.PI / 2) * s), -0.7 * s, 0);
  const top = stalk(1);
  const down = new V3(0, -1, 0);

  const NS = [6, 3, 2][lod]!;
  const pts: THREE.Vector3[] = [];
  const radii: number[] = [];
  for (let i = 0; i <= NS; i++) {
    pts.push(stalk(i / NS));
    radii.push(0.02);
  }
  mg.tube(pts, radii, [5, 4, 3][lod]!, FRECKLES.stalkA, FRECKLES.stalkB);

  const id = new THREE.Matrix4();
  for (let k = 0; k < 4; k++) {
    const theta = (k / 4) * TAU + Math.PI / 4 + variant * 0.4;
    const er = new V3(Math.cos(theta), 0, Math.sin(theta));
    const et = new V3(-Math.sin(theta), 0, Math.cos(theta));
    const sb = new Surf();
    sb.surf(nu, nv, (u01, v) => {
      const u = u01 * 2 - 1;
      // a bell: out from the stalk and down, flaring at the mouth, the tip turned out
      // the tips stand half a unit from the axis: the mouth is one unit across
      const r = 0.06 + 0.4 * Math.pow(v, 1.5) + 0.04 * v ** 4;
      const drop = 0.8 * v - 0.08 * v * v * v;
      const hw = 0.34 * Math.pow(Math.sin(Math.PI * Math.pow(v, 0.7)), 0.7) + 0.004;
      // wrapped round the bell rather than flat across it
      const bend = (u * hw) / Math.max(r, 0.12);
      const p = top
        .clone()
        .addScaledVector(er, r * Math.cos(bend))
        .addScaledVector(et, r * Math.sin(bend))
        .addScaledVector(down, drop);
      // cream, flushed towards the base, freckled most heavily through the middle
      let c = mix(FRECKLES.cream, FRECKLES.flush, Math.max(0, 1 - v * 2.2));
      const cell = hash2(Math.round(u01 * nu) + k * 17 + variant * 101, Math.round(v * nv));
      if (cell < 0.5 * Math.sin(Math.PI * Math.min(1, v * 1.15)) * (1 - 0.4 * Math.abs(u))) c = mix(c, FRECKLES.spot, 0.5 + 0.45 * hash2(k + 5, Math.round(v * nv) * 7 + Math.round(u01 * nu)));
      return { p: [p.x, p.y, p.z], c };
    });
    mg.add(sb.build(), id, [1, 1, 1], top, (k / 4) * 0.2);
  }
  if (lod < 2) stamens(mg, top.clone().addScaledVector(down, 0.08), down, lod === 0 ? 12 : 6, 0.42, 0.28, lod === 0 ? 4 : 3, FRECKLES.stamenA, FRECKLES.stamenB, 57 + variant);
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(top.clone().addScaledVector(down, 0.4), 0.9);
  return g;
}

// ---------------------------------------------------------------------------
// The hold: a leaf stalk wound round what it met. A first, plain model.
// ---------------------------------------------------------------------------
const COIL_LODS = 2;
const COIL = { green: lin('#6a7445'), tip: lin('#5c5238') };

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
  key: 'clematis-cirrhosa-freckles/leaf-stalk-coil',
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
  key: 'clematis-cirrhosa-freckles/leaf',
  variants: 1,
  lods: CLEMATIS_LEAF_LODS,
  make: (_variant, lod) => makeClematisLeafGeometry(3, true, lod),
  budget: [450, 136, 40],
  pick: () => 0,
  // evergreen: no autumn colours of its own; the new leaves bronze
  palette: { greenA: [0.07, 0.17, 0.045], greenB: [0.1, 0.22, 0.055], young: [0.27, 0.2, 0.09], autumnA: [0.1, 0.22, 0.055], autumnB: [0.07, 0.17, 0.045] },
  roughness: 0.36,
  translucency: THIN_LEAF,
  detailReach: 0.7,
};

const flower: FlowerAsset = {
  key: 'clematis-cirrhosa-freckles/flower',
  variants: BELL_FLOWER_VARIANTS,
  lods: CLEMATIS_FLOWER_LODS,
  make: makeBellFlowerGeometry,
  budget: [1300, 320, 48],
  pick: (r) => Math.floor(r * BELL_FLOWER_VARIANTS),
  authoredSize: 1,
  poise: 'hangs',
  centreAlong: 1,
  budTint: [0.82, 0.9, 0.68],
  swing: 0.5,
  translucency: 0.35,
  sheen: 0.05,
  detailAt: [1.1, 3.2],
  detailCaps: [60, 500],
};

/** First values, from descriptions: to be checked against the plant. */
const wood: WoodLook = {
  young: lin('#7c8050'),
  mature: lin('#8a6a4a'),
  old: [0.9, 0.8, 0.66],
  woodyDays: [70, 240],
  oldDays: [350, 1100],
  furrowDays: [250, 1100],
  furrow: 0.25,
  stiffDays: [40, 300],
  relief: 2,
  roughness: 0.9,
  // fine, straight fibres
  grain: { streaks: 700, width: 1.6, wobble: 5 },
};

export const look: TaxonLook = {
  taxonId: 'clematis-cirrhosa-freckles',
  provisional: false,
  leaves: { default: leaf },
  flowers: { default: flower },
  fruits: null,
  appendages: { leaf_stalk_coil: stalkCoil },
  wood,
};
