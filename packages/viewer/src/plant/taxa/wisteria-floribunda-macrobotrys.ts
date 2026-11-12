// Wisteria floribunda 'Macrobotrys' (Japanese wisteria with very long racemes; RHS: f. multijuga 'Kyushaku').
//
// The plant's own models, each built from the shape numbers in
// species/wisteria-floribunda-macrobotrys/morphology.json:
//
//   raceme   a whole pendulous inflorescence of a metre: a slender stalk, bare at
//            the top, then about 115 small pea flowers standing apart on long
//            stalks of their own, each a pale violet standard with a yellow eye
//            over darker violet-blue wings and keel; the last few at the tip stay
//            in bud. It hangs along -Y from the origin, in metres, authored at the
//            middle of the length the growth model gives and scaled to the data.
//            The flowers open in order from the base (the top) to the tip.
//   leaf     a whole odd-pinnate leaf of 11, 13, 15 or 17 narrow, wavy-edged,
//            long-pointed leaflets on an arching stalk, one unit long over all
//   pods     what is left of a raceme's stalk with one, two or three flat, velvety
//            pods hanging from it, each widest towards its end and a little
//            narrowed between the seeds
//   wood     downy green shoot, then smooth grey-brown, then grey bark dotted with
//            lenticels, the trunk fluted with age
//
// Whole organs are instanced, so one instance carries one organ's life history
// and the level of detail is chosen per organ.
//
// It is a twiner and has nothing else to hold on with. Which way it twines is
// the growth engine's business (left-handed, the opposite of W. sinensis), not a
// look.
//
// These shapes and colours are this plant's. Nothing here comes from the
// Wisteria sinensis module, and no other taxon module may import this one.
import * as THREE from 'three';
import { characterNumber, characterRange, param, parseGrowthModel, parseMorphology } from '@horti/core';
import modelJson from '../../../../../species/wisteria-floribunda-macrobotrys/model.json';
import morphologyJson from '../../../../../species/wisteria-floribunda-macrobotrys/morphology.json';
import { RNG, lerp, smoothstep } from '../../util.ts';
import { MIDRIB, Merge, type RGB, type Segs, Surf, WHITE, lin, mix } from '../kit.ts';
import { type FlowerAsset, type FruitAsset, type LeafAsset, THIN_LEAF, type TaxonLook, type WoodLook } from '../look.ts';

const ID = 'wisteria-floribunda-macrobotrys';
/**
 * What floras and plant records give of the shape of this plant's parts, each
 * number with its source and evidence status. A count or a size of the real
 * plant is read from there; asking for a character the file does not have
 * stops the module from loading, with the key named.
 */
const morphology = parseMorphology(morphologyJson, `species/${ID}/morphology.json`);
/** Read for one thing only: the raceme length the growth model gives, which is the measure the raceme is authored to. */
const growth = parseGrowthModel(modelJson, `species/${ID}/model.json`);

const TAU = Math.PI * 2;
const V3 = THREE.Vector3;
type V3 = THREE.Vector3;
const mid = ([a, b]: readonly [number, number]): number => (a + b) / 2;
const rad = THREE.MathUtils.degToRad;

// ---------------------------------------------------------------------------
// Flower (papilionaceous), drawn in units of the length of a wing petal.
// Origin: the foot of its own stalk, on the stalk of the raceme. +Z out along
// the flower stalk and on along the keel; +Y to the standard.
//
// Against W. sinensis the flower is small and its standard smaller still for
// the rest: 8 to 12 mm wide where that of W. sinensis is 20 to 30 (Compton and
// others 2019), over wings and a keel of 15 to 20 mm. The standard is pale; the
// wings and keel carry the colour.
// ---------------------------------------------------------------------------
/** Wings "about 15 to 20 mm long": the unit the flower is drawn in, in metres. */
const WING_M = mid(characterRange(morphology, 'flower.wingLengthM'));
/** The flower's own stalk, "1/2 to 1 in. long" (Bean), in wing lengths. */
const STALK = mid(characterRange(morphology, 'flower.stalkLengthM')) / WING_M;
const CALYX = mid(characterRange(morphology, 'flower.calyxLengthM')) / WING_M;
const CALYX_RADIUS = mid(characterRange(morphology, 'flower.calyxWidthM')) / WING_M / 2;
const STANDARD_HALF_WIDTH = mid(characterRange(morphology, 'flower.standardWidthM')) / WING_M / 2;
const STANDARD_LENGTH = mid(characterRange(morphology, 'flower.standardLengthM')) / WING_M;
const WING_HALF_WIDTH = mid(characterRange(morphology, 'flower.wingWidthM')) / WING_M / 2;
const KEEL = mid(characterRange(morphology, 'flower.keelLengthM')) / WING_M;

const C = {
  // "standard pale violet with a yellow mark at the base" (Bean); "white flushed mauve ... small yellow eye" (Lane)
  standard: lin('#d3c2ef'),
  standardEdge: lin('#b9a0e4'),
  white: lin('#f6f1fd'),
  eye: lin('#efdc58'),
  // wings and keel violet-blue (Bean), "mauvish violet" (Lane): darker than the standard
  wing: lin('#8d72d3'),
  wingTip: lin('#7354c3'),
  keel: lin('#6446b3'),
  calyxA: lin('#8d936b'),
  calyxB: lin('#7a6a96'),
  stalkA: lin('#a6b07c'),
  stalkB: lin('#9088aa'),
  budDeep: lin('#6a55b4'),
  budTip: lin('#9685d2'),
  rachisA: lin('#a3b078'),
  rachisB: lin('#8e86ac'),
} satisfies Record<string, RGB>;

/** Segment counts of each part of the flower at one level of detail; null: the part is left out. */
interface FlowerSegs {
  standard: Segs;
  wing: Segs | null;
  keel: Segs | null;
  /** Coarse levels: the wings and keel together as one upright blade. */
  blade: Segs | null;
  calyx: Segs | null;
  stalk: Segs | null;
}
const FLOWER_SEGS: FlowerSegs[] = [
  { standard: [7, 6], wing: [4, 2], keel: [4, 2], blade: null, calyx: [5, 1], stalk: [3, 2] },
  { standard: [3, 3], wing: [2, 1], keel: [2, 1], blade: null, calyx: null, stalk: [3, 1] },
  { standard: [2, 2], wing: null, keel: null, blade: [2, 1], calyx: null, stalk: null },
  { standard: [1, 2], wing: null, keel: null, blade: [2, 1], calyx: null, stalk: null },
];

/** The midline of the standard: it leaves the calyx, turns up at once and leans a little back at its top. */
const STANDARD_SPINE = (() => {
  const n = 24;
  const y: number[] = [0.05];
  const z: number[] = [STALK + CALYX * 0.8];
  const a: number[] = [];
  for (let j = 0; j <= n; j++) {
    const v = j / n;
    a.push(rad(58 + 54 * smoothstep(0, 1, v)));
    if (j > 0) {
      const am = (a[j]! + a[j - 1]!) / 2;
      y.push(y[j - 1]! + (Math.sin(am) * STANDARD_LENGTH) / n);
      z.push(z[j - 1]! + (Math.cos(am) * STANDARD_LENGTH) / n);
    }
  }
  return (v: number): { y: number; z: number; a: number } => {
    const x = Math.min(n - 1e-6, Math.max(0, v * n));
    const i = Math.floor(x);
    const t = x - i;
    return { y: lerp(y[i]!, y[i + 1]!, t), z: lerp(z[i]!, z[i + 1]!, t), a: lerp(a[i]!, a[i + 1]!, t) };
  };
})();

function makeFlower(lod: number): THREE.BufferGeometry {
  const sb = new Surf();
  const seg = FLOWER_SEGS[lod]!;
  const fine = lod === 0;
  const far = lod === FLOWER_SEGS.length - 1;
  const Z0 = STALK;

  // standard: broadly ovate, a narrow claw at its foot, its top blunt and a little notched
  sb.surf(seg.standard[0], seg.standard[1], (u01, v) => {
    const u = u01 * 2 - 1;
    const sp = STANDARD_SPINE(v);
    const outline = Math.sqrt(Math.max(0, 1 - ((v - 0.45) / 0.57) ** 2)) * (0.22 + 0.78 * Math.min(1, v * 3.2));
    const x = u * STANDARD_HALF_WIDTH * outline * (far ? 1.25 : 1);
    // its sides come forward at the foot and lie back above
    let off = (0.2 * (1 - v) * (1 - v) - 0.1 * v) * u * u;
    if (fine) {
      off -= 0.03 * Math.exp(-((u / 0.18) ** 2)) * (1 - v * 0.6); // crease down the middle
      // the two swellings at its foot, either side of the eye
      off += 0.03 * Math.exp(-(((Math.abs(x) - 0.06) / 0.035) ** 2 + ((v - 0.12) / 0.06) ** 2));
    }
    const notch = v > 0.82 ? -0.05 * (1 - Math.abs(u)) * ((v - 0.82) / 0.18) : 0;
    const dy = Math.sin(sp.a);
    const dz = Math.cos(sp.a);
    const edge = Math.min(1, Math.pow(Math.abs(u), 2.4) * 0.8 + (v > 0.7 ? (v - 0.7) * 0.9 : 0));
    let c = mix(C.standard, C.standardEdge, edge);
    // white about the eye, and the small yellow eye itself at the foot
    c = mix(c, C.white, Math.min(1, 1.1 * Math.exp(-((x * x) / 0.014 + (v - 0.24) ** 2 / 0.022))));
    c = mix(c, C.eye, Math.min(1, 1.25 * Math.exp(-((x * x) / 0.0045 + (v - 0.15) ** 2 / 0.009))));
    if (far) c = mix(C.standard, C.standardEdge, 0.3);
    return { p: [x, sp.y - dz * off + dy * notch, sp.z + dy * off + dz * notch], c };
  });

  // wings: two oblong plates, broadest beyond the middle, closed over the keel
  if (seg.wing) {
    for (const side of [-1, 1]) {
      sb.surf(seg.wing[0], seg.wing[1], (s, t01) => {
        const t = t01 * 2 - 1;
        const half = WING_HALF_WIDTH * Math.pow(Math.sin(Math.PI * Math.pow(0.07 + 0.85 * s, 1.2)), 0.7);
        const z = Z0 + 0.14 + 0.86 * s;
        let y = -0.04 - 0.1 * s + t * half;
        if (fine) y += 0.03 * Math.exp(-(((s - 0.12) / 0.08) ** 2)) * (t > 0 ? 1 : 0); // the ear at its foot
        const x = side * (0.055 + 0.075 * Math.sin(Math.PI * s * 0.85)) * (1 - 0.4 * t * t);
        return { p: [x, y, z], c: mix(C.wing, C.wingTip, s) };
      });
    }
  }

  // keel: a blunt boat between the wings, its prow turned up
  if (seg.keel) {
    sb.surf(seg.keel[0], seg.keel[1], (s, t01) => {
      const t = t01 * 2 - 1;
      const depth = 0.17 * Math.sin(Math.PI * (0.1 + 0.8 * s));
      const z = Z0 + 0.14 + (KEEL - 0.14) * s;
      const y = -0.05 - 0.06 * s + 0.16 * s * s - depth * (1 - Math.abs(t));
      const x = 0.085 * t * Math.sin(Math.PI * (0.1 + 0.85 * s));
      return { p: [x, y, z], c: C.keel };
    });
  }

  // from far off the wings and keel are one dark blade, upright in the flower's own plane
  if (seg.blade) {
    const grow = far ? 1.35 : 1.1;
    sb.surf(seg.blade[0], seg.blade[1], (s, t01) => {
      const t = t01 * 2 - 1;
      const half = WING_HALF_WIDTH * grow * (0.35 + 0.65 * Math.sin(Math.PI * (0.1 + 0.8 * s)));
      return { p: [0.02 * t, -0.05 - 0.09 * s + t * half, Z0 + 0.1 + 0.92 * s], c: mix(C.wing, C.keel, 0.35 + 0.3 * s) };
    });
  }

  // calyx: a bell with five short triangular teeth
  if (seg.calyx) {
    sb.surf(seg.calyx[0], seg.calyx[1], (u, v) => {
      const th = u * TAU;
      const r = 0.035 + (CALYX_RADIUS - 0.035) * Math.pow(v, 0.55);
      const teeth = fine ? 0.07 * Math.max(0, Math.cos(5 * th)) * v * v : 0;
      return { p: [Math.cos(th) * r, Math.sin(th) * r * 0.95, Z0 - 0.02 + (CALYX + teeth) * v], c: mix(C.calyxA, C.calyxB, v) };
    });
  }

  // its own stalk, slender and a little bowed
  if (seg.stalk) {
    sb.surf(seg.stalk[0], seg.stalk[1], (u, v) => {
      const th = u * TAU;
      const r = fine ? 0.02 : 0.026;
      const sag = fine ? -0.06 * Math.sin(Math.PI * v) : 0;
      return { p: [Math.cos(th) * r, Math.sin(th) * r + sag, Z0 * v], c: mix(C.stalkA, C.stalkB, v) };
    });
  }
  return sb.build();
}

/** [around, along] of the bud itself, and how many sides its stalk has (0: no stalk). */
const BUD_SEGS: [number, number, number][] = [
  [6, 4, 3],
  [4, 2, 3],
  [3, 2, 0],
  [2, 2, 0],
];
/** A flower still shut: a narrow spindle, the calyx at its foot and the folded standard wrapped round the rest. */
function makeBud(lod: number): THREE.BufferGeometry {
  const sb = new Surf();
  const [nu, nv, sides] = BUD_SEGS[lod]!;
  const Z0 = STALK * 0.7;
  sb.surf(nu, nv, (u, v) => {
    const th = u * TAU;
    const r = 0.125 * Math.pow(Math.sin(Math.PI * (0.07 + 0.93 * Math.pow(v, 0.8))), 0.85);
    const c = v < 0.34 ? mix(C.calyxB, C.budDeep, v / 0.34) : mix(C.budDeep, C.budTip, (v - 0.34) / 0.66);
    return { p: [Math.cos(th) * r * 0.78, Math.sin(th) * r + 0.09 * v * v, Z0 + 0.72 * v], c };
  });
  if (sides) {
    sb.surf(sides, 1, (u, v) => {
      const th = u * TAU;
      return { p: [Math.cos(th) * 0.024, Math.sin(th) * 0.024, Z0 * v], c: mix(C.stalkA, C.stalkB, v) };
    });
  }
  return sb.build();
}

// ---------------------------------------------------------------------------
// Raceme
// ---------------------------------------------------------------------------
/**
 * The length the raceme is authored at, in metres: the middle of what the
 * growth model gives (`organs.racemeLengthM`), which is the length of the whole
 * raceme from where it leaves the shoot to its tip. An instance is scaled to
 * the length in the data, flowers and all.
 */
const RACEME_LEN = mid(param(growth, 'organs.racemeLengthM'));
/** Flowers to a raceme: no count of this cultivar was found, and the morphology file says how the number was chosen. */
const FLOWERS = characterNumber(morphology, 'inflorescence.flowerCount');
const RACEME_VARIANTS = 4;
const RACEME_LODS = 4;
/** The bare top of the stalk, before the first flower, as a share of the raceme. */
const BARE = 0.085;

const flowerCache: THREE.BufferGeometry[] = [];
const budCache: THREE.BufferGeometry[] = [];

function makeRaceme(variant: number, lod: number): THREE.BufferGeometry {
  flowerCache[lod] ??= makeFlower(lod);
  budCache[lod] ??= makeBud(lod);
  const rng = new RNG(2300 + variant * 29);
  const mg = new Merge(false);
  const far = lod === RACEME_LODS - 1;

  // the stalk hangs plumb, and is long and slender enough to wander a little on its way down
  const a1 = rng.range(0, TAU);
  const a2 = rng.range(0, TAU);
  const b1 = rng.range(0.006, 0.018);
  const b2 = rng.range(0.003, 0.008);
  const at = (f: number, out: V3 = new V3()): V3 => {
    const w1 = b1 * Math.sin(f * 2.4);
    const w2 = b2 * Math.sin(f * 7.1) * f;
    return out.set(Math.cos(a1) * w1 + Math.cos(a2) * w2, -f * RACEME_LEN, Math.sin(a1) * w1 + Math.sin(a2) * w2);
  };
  const NS = [18, 10, 5, 3][lod]!;
  const pts: V3[] = [];
  const radii: number[] = [];
  for (let i = 0; i <= NS; i++) {
    pts.push(at(i / NS));
    radii.push(lerp(0.0021, 0.0006, i / NS) * (far ? 1.6 : 1));
  }
  mg.tube(pts, radii, [6, 5, 4, 3][lod]!, C.rachisA, C.rachisB);

  // flowers, set spirally and apart, the oldest at the top; the last few at the tip never get past bud.
  // From far off three in eight are drawn, each half as large again and more, so that the mass of colour is kept.
  const n = FLOWERS + rng.int(-5, 5);
  const grow = far ? 1.6 : 1;
  const phi0 = rng.range(0, TAU);
  const budFrom = rng.range(0.9, 0.94);
  const m = new THREE.Matrix4();
  const roll = new THREE.Matrix4();
  const X = new V3();
  const Y = new V3();
  const Z = new V3();
  const T = new V3();
  const U = new V3();
  const W = new V3();
  const p = new V3();
  const q = new V3();
  const UP = new V3(0, 1, 0);
  const scl = new V3();
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    // every draw is made for every flower at every level, so that a raceme keeps its shape as its level changes
    const jitter = rng.range(-0.3, 0.3);
    const nod = rng.range(0.02, 0.45);
    const turn = rng.range(-0.35, 0.35);
    const size = rng.range(0.92, 1.08);
    const tone = rng.range(0.93, 1.07);
    const warm = rng.range(-0.03, 0.03);
    if (far && (i * 3) % 8 >= 3 && i !== n - 1) continue;
    const s = BARE + (1 - BARE) * Math.pow(f, 0.97);
    at(s, p);
    T.subVectors(at(Math.min(1, s + 0.01), q), p).normalize();
    U.crossVectors(T, new V3(1, 0, 0)).normalize();
    W.crossVectors(T, U);
    const phi = phi0 + i * 2.39996 + jitter;
    // out from the stalk on its own stalk and nodding a little; the standard uppermost
    Z.copy(U).multiplyScalar(Math.cos(phi)).addScaledVector(W, Math.sin(phi)).addScaledVector(T, nod).normalize();
    Y.copy(UP).addScaledVector(Z, -UP.dot(Z)).normalize();
    X.crossVectors(Y, Z);
    m.makeBasis(X, Y, Z);
    m.multiply(roll.makeRotationZ(turn));
    const isBud = f > budFrom;
    const k = isBud ? lerp(0.82, 0.3, (f - budFrom) / (1 - budFrom)) : 1.04 - 0.16 * f;
    const sz = WING_M * k * size * grow;
    m.scale(scl.set(sz, sz, sz));
    m.setPosition(p);
    const shade = lerp(1.05, 0.9, f) * tone;
    mg.add(isBud ? budCache[lod]! : flowerCache[lod]!, m, [shade * (1 + warm), shade, shade * (1 - warm)], p, f);
  }
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, -RACEME_LEN / 2, 0), RACEME_LEN * 0.58);
  return g;
}

// ---------------------------------------------------------------------------
// Compound leaf: one unit long over all, from where it joins the stem to the
// tip of its end leaflet.
// ---------------------------------------------------------------------------
const LEAF_M = mid(characterRange(morphology, 'leaf.lengthM'));
const LEAFLET_M = mid(characterRange(morphology, 'leaf.leafletLengthM'));
/** The length of a full-sized leaflet as a share of the whole leaf. */
const LEAFLET = LEAFLET_M / LEAF_M;
/** Half the width of a leaflet, in leaflet lengths: "about 2 to 2.5 cm wide" to "4 to 10 cm long". */
const LEAFLET_HALF_WIDTH = mid(characterRange(morphology, 'leaf.leafletWidthM')) / LEAFLET_M / 2;
/** Leaflets to a leaf, one variant for each odd number the cultivar is recorded with: "11-17" gives 11, 13, 15 and 17. */
const LEAF_VARIANTS: readonly number[] = (() => {
  const [fewest, most] = characterRange(morphology, 'leaf.leafletCount');
  const counts: number[] = [];
  for (let n = fewest % 2 ? fewest : fewest + 1; n <= most; n += 2) counts.push(n);
  return counts;
})();
const LEAF_LODS = 3;

const LEAFLET_SEGS: Segs[] = [
  [6, 10],
  [2, 4],
  [1, 3],
];
/** Where the rows of the coarsest leaflet lie, base to tip: enough to keep it broadest low down and drawn out to a point. */
const FAR_ROWS = [0.03, 0.28, 0.62, 1];
/** The leaflet's own short stalk, as a share of its length. */
const LEAFLET_STALK = 0.05;
/** Half-width along a leaflet, 1 at its widest: rounded at the base, broadest below the middle, drawn out to a long point. */
const leafletOutline = (v: number): number => (Math.pow(v, 0.5) * Math.pow(1 - v, 1.15)) / 0.3634;

function makeLeaflet(lod: number): THREE.BufferGeometry {
  const sb = new Surf();
  const [nu, nv] = LEAFLET_SEGS[lod]!;
  sb.surf(nu, nv, (u01, v01) => {
    const v = lod === 2 ? FAR_ROWS[Math.round(v01 * nv)]! : v01;
    const u = u01 * 2 - 1;
    const x = u * (LEAFLET_HALF_WIDTH * leafletOutline(v) * (1 + 0.07 * u * (1 - v)) + 0.003);
    const z = LEAFLET_STALK + (1 - LEAFLET_STALK) * v;
    // folded up a little from the midrib, arching down to the tip
    let y = 0.2 * Math.abs(x) - 0.1 * v * v;
    if (lod === 0) {
      y += 0.03 * Math.sin(v * 10.5 + u * 1.3 + 0.6) * u * u * (0.35 + 0.65 * Math.sin(Math.PI * v)); // the wavy margin
      y += 0.005 * Math.cos(v * 36 - Math.abs(u) * 5) * (1 - Math.abs(u)) * Math.abs(u) * 4; // relief between the side veins
    } else if (lod === 1) {
      y += 0.02 * Math.sin(v * 10.5 + 0.6) * u * u;
    }
    return { p: [x, y, z] };
  });
  if (lod === 0) {
    const from = sb.uv.length;
    sb.surf(4, 1, (u, v) => {
      const th = u * TAU;
      return { p: [Math.cos(th) * 0.011, Math.sin(th) * 0.011, v * (LEAFLET_STALK + 0.01)] };
    });
    // keep the stalk on the pale midrib of the leaf texture
    for (let i = from; i < sb.uv.length; i += 2) {
      sb.uv[i] = MIDRIB[0];
      sb.uv[i + 1] = MIDRIB[1];
    }
  }
  return sb.build();
}

const leafletCache: THREE.BufferGeometry[] = [];
function makeLeaf(variant: number, lod: number): THREE.BufferGeometry {
  leafletCache[lod] ??= makeLeaflet(lod);
  const leaflets = LEAF_VARIANTS[variant]!;
  const pairs = (leaflets - 1) / 2;
  const rng = new RNG(4100 + variant * 37);
  const mg = new Merge(true);

  // the common stalk: a shallow arc that bends down along its length and a little to one side.
  // The end leaflet takes the rest of the unit.
  const AXIS = 1 - LEAFLET * 0.8;
  const bend = rng.range(0.38, 0.5);
  const sway = rng.range(-0.1, 0.1);
  const at = (t: number, out: V3 = new V3()): V3 => {
    const a = bend * t;
    const s = AXIS * t;
    return out.set(sway * s * t, a > 1e-6 ? (-(1 - Math.cos(a)) / a) * s : 0, a > 1e-6 ? (Math.sin(a) / a) * s : s);
  };
  const NS = [10, 4, 2][lod]!;
  const pts: V3[] = [];
  const radii: number[] = [];
  for (let i = 0; i <= NS; i++) {
    const t = i / NS;
    pts.push(at(t));
    // swollen where it joins the stem
    radii.push(0.0058 * (1 - 0.6 * t) + (i === 0 ? 0.005 : 0));
  }
  mg.tube(pts, radii, [6, 4, 3][lod]!, WHITE, WHITE, MIDRIB);

  const AX = new V3(1, 0, 0);
  const AY = new V3(0, 1, 0);
  const AZ = new V3(0, 0, 1);
  const q = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const m = new THREE.Matrix4();
  const pos = new V3();
  const scl = new V3();
  /** One leaflet at `t` along the stalk: `side` 0 is the end leaflet. */
  const put = (t: number, side: -1 | 0 | 1, sizeK: number): void => {
    at(t, pos);
    q.setFromAxisAngle(AX, bend * t);
    // the lowest pairs stand square to the stalk, the upper ones point forward along it
    const forward = lerp(0.1, 0.5, t) + rng.range(-0.08, 0.08);
    q.multiply(q2.setFromAxisAngle(AY, side !== 0 ? side * (Math.PI / 2 - forward) + sway * 2 * t : rng.range(-0.12, 0.12) + sway * 2));
    // each hangs a little below the plane of the leaf
    q.multiply(q2.setFromAxisAngle(AX, side !== 0 ? rng.range(0.12, 0.42) : rng.range(0.03, 0.15)));
    q.multiply(q2.setFromAxisAngle(AZ, rng.range(-0.28, 0.28) - side * 0.14));
    const s = LEAFLET * sizeK * rng.range(0.93, 1.07);
    m.compose(pos, q, scl.set(s, s, s));
    const tone = rng.range(0.9, 1.1);
    mg.add(leafletCache[lod]!, m, [tone, tone, tone], pos, rng.f());
  };
  for (let i = 0; i < pairs; i++) {
    const u = pairs > 1 ? i / (pairs - 1) : 1;
    const t = lerp(0.15, 0.955, u);
    // the lowest leaflets are the smallest; they are at their largest above the middle
    const sizeK = lerp(0.62, 1, smoothstep(0, 0.45, u)) * lerp(1, 0.93, smoothstep(0.7, 1, u));
    put(t, -1, sizeK);
    put(t, 1, sizeK);
  }
  put(1, 0, 1);
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, -0.1, 0.5), 0.8);
  return g;
}

// ---------------------------------------------------------------------------
// Pods: flat, velvety, widest towards the end, a little narrowed between the
// seeds. One fruit of the data is what one raceme set: the upper part of its
// stalk, still hanging, with one to three pods on it. How many pods a raceme
// carries is not recorded (morphology: fruit.podsPerRaceme is unknown).
// ---------------------------------------------------------------------------
/** The length one pod is authored at, in metres; an instance is scaled to the pod length in the data. */
const POD_LEN = mid(characterRange(morphology, 'fruit.lengthM'));
const POD_HALF_WIDTH = mid(characterRange(morphology, 'fruit.widthM')) / 2;
const [SEEDS_FEW, SEEDS_MANY] = characterRange(morphology, 'fruit.seedCount');
/** Where along the old stalk each pod hangs, in pod lengths, by variant. The pod at 0.85 is the one a close view centres on. */
const POD_SETS: readonly (readonly number[])[] = [[0.85], [0.38, 0.85], [0.38, 0.85, 1.32]];
const POD_LODS = 2;
const POD_SEGS: Segs[] = [
  [12, 20],
  [5, 8],
];
const POD = {
  // "velvety, blue-grey seed pods" (RHS); green at first (Kwantlen)
  body: lin('#748477'),
  pale: lin('#9aa99c'),
  stalk: lin('#8f9470'),
  stalkOld: lin('#7d7458'),
} satisfies Record<string, RGB>;

function makePod(lod: number, seeds: number): THREE.BufferGeometry {
  const sb = new Surf();
  const [nu, nv] = POD_SEGS[lod]!;
  sb.surf(nu, nv, (u, v01) => {
    const th = u * TAU;
    // rows drawn together towards the end, where the pod rounds off into its beak
    const v = 1 - Math.pow(1 - v01, 1.5);
    // a narrow neck at the stalk, broadening to beyond the middle; a rounded end with a short beak
    const body = 0.24 + 0.76 * smoothstep(0.04, 0.66, v);
    const neck = Math.pow(Math.sin((Math.PI / 2) * Math.min(1, v / 0.06)), 0.6);
    const end = v > 0.86 ? 0.16 * (1 - v) / 0.14 + 0.84 * Math.sqrt(Math.max(0, 1 - ((v - 0.86) / 0.14) ** 2)) : 1;
    let swell = 0;
    for (let k = 0; k < seeds; k++) swell += Math.exp(-(((v - lerp(0.3, 0.86, (k + 0.5) / seeds)) / 0.05) ** 2));
    swell = Math.min(1, swell);
    const w = POD_HALF_WIDTH * body * neck * end * (0.84 + 0.2 * swell) + 0.0004;
    // flat, and a little fuller over each seed: the seeds are lens-shaped and only 2 to 4 mm thick
    const thick = w * (0.19 + 0.18 * swell);
    // the velvet is paler where it catches the light: over the seeds and along the two seams
    const c = mix(POD.body, POD.pale, Math.min(1, 0.12 + 0.3 * Math.pow(Math.abs(Math.cos(th)), 6) + 0.5 * swell * Math.abs(Math.sin(th))));
    return { p: [Math.cos(th) * w, -v * POD_LEN, Math.sin(th) * thick + 0.011 * Math.sin(v * 2.6) - 0.004 * Math.sin(v * 6.5)], c };
  });
  return sb.build();
}

const podCache = new Map<string, THREE.BufferGeometry>();
function makePods(variant: number, lod: number): THREE.BufferGeometry {
  const rng = new RNG(5200 + variant * 41);
  const mg = new Merge(false);
  const hangs = POD_SETS[variant]!;
  const fine = lod === 0;
  // what is left of the raceme's stalk: as far as its last pod
  const reach = Math.max(...hangs) * POD_LEN;
  const lean = rng.range(0, TAU);
  const at = (d: number): V3 => new V3(Math.cos(lean) * 0.012 * Math.sin((d / reach) * 2.2), -d, Math.sin(lean) * 0.012 * Math.sin((d / reach) * 2.2));
  const NS = fine ? 6 : 3;
  mg.tube(
    Array.from({ length: NS + 1 }, (_, i) => at((reach * i) / NS)),
    Array.from({ length: NS + 1 }, (_, i) => lerp(0.0019, 0.0013, i / NS)),
    fine ? 4 : 3,
    POD.stalk,
    POD.stalkOld,
  );
  const m = new THREE.Matrix4();
  const turn = new THREE.Matrix4();
  const e = new THREE.Euler();
  // the pods leave the stalk on different sides
  const first = rng.range(0, TAU);
  hangs.forEach((h, k) => {
    const from = at(h * POD_LEN);
    const bearing = first + k * 2.4 + rng.range(-0.4, 0.4);
    const out = new V3(Math.cos(bearing), 0, Math.sin(bearing));
    // the flower's stalk, thickened, bends over under the pod
    const knee = from.clone().addScaledVector(out, 0.008).add(new V3(0, -0.004, 0));
    const foot = from.clone().addScaledVector(out, 0.012).add(new V3(0, -0.014, 0));
    mg.tube(fine ? [from, knee, foot] : [from, foot], fine ? [0.0015, 0.0015, 0.0018] : [0.0016, 0.0018], fine ? 4 : 3, POD.stalk, POD.stalk);
    const seeds = Math.round(lerp(SEEDS_FEW, SEEDS_MANY, rng.f()));
    const key = `${lod}/${seeds}`;
    let pod = podCache.get(key);
    if (!pod) podCache.set(key, (pod = makePod(lod, seeds)));
    // the middle pod is the full-sized one; the others are a little smaller
    const s = h === 0.85 ? 1 : rng.range(0.78, 0.94);
    // it hangs a little out from the old stalk, on the side its own stalk left by, one flat face outwards
    m.makeRotationAxis(new V3(-Math.sin(bearing), 0, Math.cos(bearing)), rng.range(0.1, 0.24));
    m.multiply(turn.makeRotationFromEuler(e.set(0, Math.PI / 2 - bearing + rng.range(-0.5, 0.5), 0)));
    m.scale(new V3(s, s, s));
    m.setPosition(foot);
    const tone = 0.94 + 0.04 * k;
    mg.add(pod, m, [tone, tone, tone], foot, 0);
  });
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, -(reach + POD_LEN) / 2, 0), (reach + POD_LEN) * 0.62);
  return g;
}

// ---------------------------------------------------------------------------
// The look
// ---------------------------------------------------------------------------
const leaf: LeafAsset = {
  key: `${ID}/leaf`,
  variants: LEAF_VARIANTS.length,
  lods: LEAF_LODS,
  make: makeLeaf,
  budget: [2350, 310, 120],
  // most leaves have the middle counts; a short leaf has a pair fewer
  pick: (lengthM, r) => {
    const last = LEAF_VARIANTS.length - 1;
    const by = r < 0.12 ? 0 : r < 0.44 ? 1 : r < 0.84 ? 2 : 3;
    return Math.max(0, Math.min(last, lengthM < LEAF_M * 0.85 ? by - 1 : by));
  },
  palette: {
    // "dark green", glossy; "pale bronze when young"; "turn yellow in autumn"
    greenA: lin('#588737'),
    greenB: lin('#6a9742'),
    young: lin('#b3995a'),
    autumnA: lin('#e0b92c'),
    autumnB: lin('#c9952a'),
  },
  roughness: 0.46,
  translucency: THIN_LEAF,
  detailReach: 1.1,
};

const raceme: FlowerAsset = {
  key: `${ID}/raceme`,
  variants: RACEME_VARIANTS,
  lods: RACEME_LODS,
  make: makeRaceme,
  budget: [23200, 5900, 1950, 520],
  pick: (r) => Math.min(RACEME_VARIANTS - 1, Math.floor(r * RACEME_VARIANTS)),
  authoredSize: RACEME_LEN,
  poise: 'hangs',
  centreAlong: 0.5,
  // a flower still shut is darker and bluer than one open
  budTint: [0.44, 0.36, 0.68],
  swing: 0.75,
  translucency: 0.32,
  sheen: 0.08,
  detailAt: [2.4, 5, 10],
  detailCaps: [14, 80, 500],
};

const pods: FruitAsset = {
  key: `${ID}/pods`,
  variants: POD_SETS.length,
  lods: POD_LODS,
  make: makePods,
  budget: [1560, 300],
  pick: (r) => (r < 0.4 ? 0 : r < 0.8 ? 1 : 2),
  authoredSize: POD_LEN,
  poise: 'hangs',
  // the full-sized pod hangs from 0.85 of a pod length down the old stalk
  centreAlong: 1.4,
  // grey-green and velvety, drying to brown
  ripe: lin('#735539'),
  ripeShade: [0.2, 2.6],
  roughness: 0.92,
  swing: 0.6,
  detailAt: [2.6],
  detailCaps: [30],
};

/**
 * Stems: green and downy when young, grey or reddish brown when mature
 * (Compton and others 2019, of the genus); old bark grey, smooth and dotted
 * with lenticels, the trunk "fluted and muscle-like" (Seattle Japanese Garden;
 * NC State says the same). The ages at which a shoot turns are not recorded
 * anywhere read: they are chosen for the picture, in days.
 */
const wood: WoodLook = {
  young: lin('#84905e'),
  mature: lin('#8f7a62'),
  old: [0.76, 0.75, 0.72],
  woodyDays: [120, 480],
  oldDays: [600, 2100],
  furrowDays: [330, 2000],
  furrow: 0.85,
  stiffDays: [60, 600],
  relief: 2.4,
  roughness: 0.92,
  // a smooth bark: fewer and finer streaks than a fissured one
  grain: { streaks: 300, width: 2.2, wobble: 9 },
};

export const look: TaxonLook = {
  taxonId: ID,
  provisional: false,
  leaves: { default: leaf },
  flowers: { default: raceme },
  fruits: { default: pods },
  // a twiner: it holds on with its stems, and has no tendrils, rootlets or prickles
  appendages: {},
  wood,
};
