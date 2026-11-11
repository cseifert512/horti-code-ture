// Clematis 'Etoile Violette' (Viticella Group), a deciduous leaf-stalk climber
// that flowers on the growth of the year.
//
//   leaf     a compound leaf of five plain, stalked leaflets on a wiry axis.
//            Unit length along +Z, upper side +Y.
//   flower   a single flat flower of four to six velvety violet tepals round a
//            boss of cream stamens, held out on a long stalk that rises from
//            the node. One unit is the width of the flower, which is what the
//            render data gives.
//   hold     a leaf stalk wound round what it met (a first, plain model)
//   wood     first values, from descriptions: thin ribbed shoots, green
//            flushed purple, ripening to a pale stringy brown
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

const TEPAL_SEGS: [number, number][] = [
  [6, 8],
  [3, 4],
  [2, 2],
];

// ---------------------------------------------------------------------------
// Open flower: Clematis 'Etoile Violette'
// ---------------------------------------------------------------------------
/** Tepals per variant. */
const OPEN_FLOWER_TEPALS: readonly number[] = [6, 5, 4];
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

const VIOLET: StarLook = {
  deep: lin('#340d4e'),
  mid: lin('#4f1672'),
  bar: lin('#6b1c70'),
  base: lin('#5a2a80'),
  stamenA: lin('#f0e7b4'),
  stamenB: lin('#d4c97c'),
  stalkA: lin('#5f6c3c'),
  stalkB: lin('#4b3a5c'),
  tepalHalfWidth: 0.168,
  stalk: 0.82,
};

function makeOpenFlowerGeometry(variant: number, lod: number): THREE.BufferGeometry {
  return starFlower(OPEN_FLOWER_TEPALS[variant]!, variant, lod, VIOLET);
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
const COIL = { green: lin('#6f7d48'), tip: lin('#5a5a3a') };

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
  key: 'clematis-viticella-etoile-violette/leaf-stalk-coil',
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
  key: 'clematis-viticella-etoile-violette/leaf',
  variants: 1,
  lods: CLEMATIS_LEAF_LODS,
  make: (_variant, lod) => makeClematisLeafGeometry(5, false, lod),
  budget: [700, 200, 56],
  pick: () => 0,
  palette: { greenA: [0.12, 0.26, 0.06], greenB: [0.16, 0.32, 0.075], young: [0.26, 0.34, 0.1], autumnA: [0.62, 0.5, 0.1], autumnB: [0.42, 0.3, 0.08] },
  roughness: 0.55,
  translucency: THIN_LEAF,
  detailReach: 0.7,
};

const flower: FlowerAsset = {
  key: 'clematis-viticella-etoile-violette/flower',
  variants: OPEN_FLOWER_TEPALS.length,
  lods: CLEMATIS_FLOWER_LODS,
  make: makeOpenFlowerGeometry,
  budget: [800, 230, 64],
  // most flowers have six tepals, some five, a few four
  pick: (r) => (r < 0.6 ? 0 : r < 0.87 ? 1 : 2),
  authoredSize: 1,
  poise: 'held',
  centreAlong: 0.7,
  budTint: [0.6, 0.55, 0.8],
  swing: 0.3,
  translucency: 0.1,
  sheen: 0.22,
  detailAt: [1.1, 3.2],
  detailCaps: [60, 500],
};

/** First values, from descriptions: to be checked against the plant. */
const wood: WoodLook = {
  young: lin('#7f8a50'),
  mature: lin('#9a7a55'),
  old: [0.96, 0.84, 0.66],
  woodyDays: [60, 200],
  oldDays: [300, 900],
  furrowDays: [200, 900],
  furrow: 0.25,
  stiffDays: [40, 300],
  relief: 2,
  roughness: 0.9,
  // fine, straight fibres
  grain: { streaks: 700, width: 1.6, wobble: 5 },
};

export const look: TaxonLook = {
  taxonId: 'clematis-viticella-etoile-violette',
  provisional: false,
  leaves: { default: leaf },
  flowers: { default: flower },
  fruits: null,
  appendages: { leaf_stalk_coil: stalkCoil },
  wood,
};
