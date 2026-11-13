// Akebia quinata (chocolate vine, five-leaf akebia).
//
// A slender twiner whose leaf is a hand of five notched leaflets on a long
// stalk, and whose flowers hang in spring in small racemes of two kinds of
// flower: one or two large, cupped, chocolate-purple female flowers on long
// stalks at the base, and a cluster of small pale purple male flowers towards
// the tip. Where a female flower is pollinated it sets one to a few fat,
// sausage-shaped violet fruits.
//
//   leaf     a whole palmate leaf: the long stalk, and five (now and then four)
//            obovate leaflets, each on its own short stalk, each notched at the
//            tip and folded a little along its midrib; one unit long from the
//            stem to the tip of the end leaflet
//   raceme   a whole hanging raceme (stalk, the bud scales at its foot, female
//            flowers with their carpels, male flowers with their six incurved
//            stamens), hanging along -Y from the origin, in metres: 0.09 m as
//            authored, scaled to the length in the data. The female flowers
//            open first and the male ones after them, base to tip
//   fruit    one, two or three follicles on the stalk the flower had, 0.065 m
//            a follicle as authored; pale green, ripening greyish violet
//   wood     slender green shoot, then red-brown, then grey-brown bark with
//            interlacing ridges
//
// It holds on by twining its stems and has no tendrils, rootlets or prickles.
//
// Every count and size of the real plant is read from
// species/akebia-quinata/morphology.json, where each has its source. What is
// typed in here is appearance: how far a sepal cups, how a leaflet folds, the
// colours as the sources name them. These shapes and colours are Akebia
// quinata's own; no other taxon module may import this one.
import * as THREE from 'three';
import { characterNumber, characterRange, parseMorphology } from '@horti/core';
import morphologyJson from '../../../../../species/akebia-quinata/morphology.json';
import { RNG, lerp, smoothstep } from '../../util.ts';
import { MIDRIB, Merge, type RGB, type Segs, Surf, WHITE, across, lin, mix } from '../kit.ts';
import { type FlowerAsset, type FruitAsset, type LeafAsset, type TaxonLook, type WoodLook } from '../look.ts';

const morphology = parseMorphology(morphologyJson, 'species/akebia-quinata/morphology.json');
const mid = (key: string): number => {
  const [low, high] = characterRange(morphology, key);
  return (low + high) / 2;
};

const TAU = Math.PI * 2;
const V3 = THREE.Vector3;
type V3 = THREE.Vector3;
const IDENTITY = new THREE.Matrix4();

// ---------------------------------------------------------------------------
// Leaf: palmately compound, usually of five leaflets (Flora of China).
// Proportions from the floras' measurements, each taken at the middle of its
// range. One unit is the whole leaf: stalk, end leaflet's stalk, end leaflet.
// ---------------------------------------------------------------------------
const LEAFLETS = characterNumber(morphology, 'leaf.leafletCount');
const FEWEST_LEAFLETS = characterRange(morphology, 'leaf.leafletCountRange')[0];
const PETIOLE_M = mid('leaf.petioleLengthM');
const END_STALK_M = mid('leaf.terminalPetioluleLengthM');
const SIDE_STALK_M = mid('leaf.petioluleLengthM');
const END_LEAFLET_M = mid('leaf.terminalLeafletLengthM');
const SIDE_LEAFLET_M = mid('leaf.leafletLengthM');
const LEAFLET_WIDTH_M = mid('leaf.leafletWidthM');
/** The whole leaf, stem to tip, at the middle of every range: what one unit of the model stands for. */
const LEAF_M = PETIOLE_M + END_STALK_M + END_LEAFLET_M;
const PETIOLE = PETIOLE_M / LEAF_M;
const END_STALK = END_STALK_M / LEAF_M;
const SIDE_STALK = SIDE_STALK_M / LEAF_M;
const END_LEAFLET = END_LEAFLET_M / LEAF_M;
const SIDE_LEAFLET = SIDE_LEAFLET_M / LEAF_M;
/** Half the width of a leaflet for its length: "1.5 to 2.5 cm wide for 2 to 5 cm long". */
const LEAFLET_HALF_WIDTH = LEAFLET_WIDTH_M / SIDE_LEAFLET_M / 2;
/** Side veins to a side (5 to 7): the shared leaf texture has eleven, so a leaflet is laid over that share of it. */
const VEIN_SHARE = mid('leaf.lateralVeinPairs') / 11;

const LEAF_LODS = 3;
const LEAFLET_SEGS: Segs[] = [
  [14, 14],
  [4, 6],
  [2, 4],
];

/**
 * One leaflet, base at the origin, tip at z = 1, upper side +Y. Obovate, widest
 * beyond the middle, with a rounded base and a broad rounded tip that is
 * notched at the midrib ("distinctly notched at the apex", Bean), a small point
 * standing in the notch. Folded a little along the midrib, which is sunken
 * above, with the blade arching down towards its tip.
 */
function makeLeaflet(lod: number, seed: number): THREE.BufferGeometry {
  const sb = new Surf();
  const [nu, nv] = LEAFLET_SEGS[lod]!;
  const rng = new RNG(900 + seed * 13);
  const lean = rng.range(-0.05, 0.05);
  const wavePhase = rng.range(0, TAU);
  sb.surf(nu, nv, (u01, v) => {
    const u = u01 * 2 - 1;
    // the outline stops short of closing: the tip is broad, and its edge is shaped below
    const s = 0.02 + 0.915 * v;
    const hw = LEAFLET_HALF_WIDTH * 1.06 * Math.pow(Math.sin(Math.PI * Math.pow(s, 1.28)), 0.62) * (1 + lean * u);
    const x = u * hw;
    // the tip: shoulders rounded off, and a notch at the midrib with a small point in it
    const tip = smoothstep(0.55, 1, v);
    const shoulders = 0.085 * Math.pow(Math.abs(u), 2.2);
    const notch = 0.05 * Math.exp(-Math.pow(u / 0.27, 2)) - 0.016 * Math.exp(-Math.pow(u / 0.07, 2));
    const z = v * (1 - (shoulders + notch) * tip * tip);
    // folded up from the midrib, arching over towards the tip
    let y = 0.2 * Math.abs(x) - 0.11 * v * v;
    if (lod === 0) {
      // midrib sunken above; the blade a little raised between the side veins; the margin faintly waved
      y -= 0.012 * Math.exp(-Math.pow(u / 0.09, 2)) * (1 - 0.6 * v);
      y += 0.006 * Math.cos(TAU * mid('leaf.lateralVeinPairs') * (v - 0.35 * Math.abs(u))) * Math.abs(u) * (1 - Math.abs(u)) * 4 * Math.sin(Math.PI * v);
      y += 0.016 * Math.sin(v * 9 + wavePhase + u * 1.2) * u * u;
    } else if (lod === 1) {
      y += 0.012 * Math.sin(v * 9 + wavePhase) * u * u;
    }
    return { p: [x, y, z] };
  });
  // five to seven side veins to a side: lay the leaflet over that much of the texture's eleven
  for (let i = 1; i < sb.uv.length; i += 2) sb.uv[i] = sb.uv[i]! * VEIN_SHARE;
  return sb.build();
}

/** Where the leaflets of each variant stand round the top of the stalk: the angle from straight on, and the size. */
interface LeafletPlace {
  angle: number;
  /** 0 the end leaflet, 1 a side one, 2 one of the lowest pair. */
  rank: 0 | 1 | 2;
}
const FIVE: LeafletPlace[] = [
  { angle: 0, rank: 0 },
  { angle: 1.16, rank: 1 },
  { angle: -1.16, rank: 1 },
  { angle: 2.3, rank: 2 },
  { angle: -2.3, rank: 2 },
];
/** A leaf of fewer leaflets, as some are ("sometimes three or four", Bean): one of the lowest pair missing. */
const FOUR: LeafletPlace[] = [
  { angle: 0.12, rank: 0 },
  { angle: 1.3, rank: 1 },
  { angle: -1.1, rank: 1 },
  { angle: -2.25, rank: 2 },
];
if (FIVE.length !== LEAFLETS || FOUR.length < FEWEST_LEAFLETS) throw new Error('akebia-quinata: the leaf model no longer has the leaflets its morphology file gives it');
/** Each variant: its leaflets, and how far the hand of leaflets is turned down from the line of the stalk. */
const LEAF_VARIANTS: { places: LeafletPlace[]; tilt: number }[] = [
  { places: FIVE, tilt: 0.3 },
  { places: FIVE, tilt: 0.44 },
  { places: FIVE, tilt: 0.18 },
  { places: FOUR, tilt: 0.34 },
];

const leafletCache = new Map<string, THREE.BufferGeometry>();
function makeLeafGeometry(variant: number, lod: number): THREE.BufferGeometry {
  const { places, tilt } = LEAF_VARIANTS[variant]!;
  const rng = new RNG(4100 + variant * 37);
  const mg = new Merge(true);
  const radial = [6, 4, 3][lod]!;

  // the stalk: slender, bowed up a little, swollen where it joins the stem and where the leaflets part
  const bow = rng.range(0.035, 0.07);
  const sway = rng.range(-0.03, 0.03);
  const hubZ = PETIOLE * 0.985;
  const at = (t: number): V3 => new V3(sway * Math.sin(Math.PI * t), bow * Math.sin(Math.PI * Math.pow(t, 0.8)), hubZ * t);
  const NS = [10, 3, 2][lod]!;
  const pts: V3[] = [];
  const radii: number[] = [];
  for (let i = 0; i <= NS; i++) {
    const t = i / NS;
    pts.push(at(t));
    radii.push(0.0062 * (1 + 0.9 * Math.exp(-Math.pow(t / 0.05, 2)) + 0.5 * Math.exp(-Math.pow((1 - t) / 0.04, 2))));
  }
  mg.tube(pts, radii, radial, WHITE, WHITE, MIDRIB);
  const hub = at(1);

  // the hand of leaflets: a plane through the top of the stalk, turned down from the stalk's line
  const forward = new V3(0, -Math.sin(tilt), Math.cos(tilt));
  const normal = new V3(0, Math.cos(tilt), Math.sin(tilt));
  const side = new V3(1, 0, 0);
  const m = new THREE.Matrix4();
  const X = new V3();
  const Y = new V3();
  const Z = new V3();
  places.forEach((place, k) => {
    const angle = place.angle + rng.range(-0.1, 0.1);
    const stalkLength = (place.rank === 0 ? END_STALK : SIDE_STALK * (place.rank === 2 ? 0.85 : 1)) * rng.range(0.9, 1.1);
    const length = (place.rank === 0 ? END_LEAFLET : SIDE_LEAFLET * (place.rank === 2 ? 0.86 : 1)) * rng.range(0.93, 1.07);
    // each leaflet hangs a little below the plane of the hand, the lowest pair most
    const droop = (place.rank === 0 ? 0.1 : place.rank === 1 ? 0.2 : 0.32) + rng.range(-0.06, 0.08);
    const flat = forward
      .clone()
      .multiplyScalar(Math.cos(angle))
      .addScaledVector(side, Math.sin(angle));
    Z.copy(flat).multiplyScalar(Math.cos(droop)).addScaledVector(normal, -Math.sin(droop)).normalize();
    Y.copy(normal).multiplyScalar(Math.cos(droop)).addScaledVector(flat, Math.sin(droop)).normalize();
    // turned a little about its own midrib
    const roll = rng.range(-0.16, 0.16);
    X.crossVectors(Y, Z).normalize();
    Y.applyAxisAngle(Z, roll);
    X.applyAxisAngle(Z, roll);
    // its own stalk, from the top of the leaf stalk
    const base = hub.clone().addScaledVector(Z, stalkLength);
    if (lod < 2) {
      const bend = hub.clone().addScaledVector(Z, stalkLength * 0.5).addScaledVector(normal, 0.012);
      mg.tube([hub, bend, base], [0.0048, 0.0042, 0.0045], radial, WHITE, WHITE, MIDRIB);
    }
    const key = `${lod}/${(variant + k) % 3}`;
    let leaflet = leafletCache.get(key);
    if (!leaflet) leafletCache.set(key, (leaflet = makeLeaflet(lod, (variant + k) % 3)));
    m.makeBasis(X, Y, Z);
    m.scale(new V3(length, length, length));
    m.setPosition(lod < 2 ? base : hub);
    // at the far level there is no leaflet stalk: the leaflet reaches from the hub
    if (lod === 2) m.scale(new V3(1, 1, 1 + stalkLength / length));
    mg.add(leaflet, m, WHITE, base, rng.f());
  });
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, 0, 0.55), 0.75);
  return g;
}

// ---------------------------------------------------------------------------
// Flowers. No petals: three sepals do their work (Flora of North America).
// Each flower is built with its stalk end at the origin and its face along +Y,
// in metres at the size the raceme is authored at.
// ---------------------------------------------------------------------------
/** The raceme as authored: the middle of the Flora of China's 6 to 12 cm, which is what `organs.racemeLengthM` measures. */
const RACEME_LEN = mid('inflorescence.lengthM');
/** The bare stalk of the raceme, drawn in the lower part of its recorded range (2 to 5 cm): about 2.6 cm of the 9. */
const PEDUNCLE = lerp(...characterRange(morphology, 'inflorescence.peduncleLengthM'), 0.2);
const FEMALE_SEPALS = characterNumber(morphology, 'flower.female.sepalCount');
const FEMALE_SEPAL = mid('flower.female.sepalLengthM');
const FEMALE_SEPAL_HALF_WIDTH = mid('flower.female.sepalWidthM') / 2;
const FEMALE_PEDICEL = mid('flower.female.pedicelLengthM');
const CARPELS = characterRange(morphology, 'flower.female.carpelCount');
/** Drawn towards the upper end of its range: the carpels are what marks the female flower. */
const CARPEL = lerp(...characterRange(morphology, 'flower.female.carpelLengthM'), 0.75);
const MALE_SEPALS = characterNumber(morphology, 'flower.male.sepalCount');
const MALE_SEPAL = mid('flower.male.sepalLengthM');
const MALE_SEPAL_HALF_WIDTH = mid('flower.male.sepalWidthM') / 2;
const MALE_PEDICEL = mid('flower.male.pedicelLengthM');
const STAMENS = characterNumber(morphology, 'flower.male.stamenCount');
const STAMEN = mid('flower.male.stamenLengthM');
const MALE_FLOWERS = characterRange(morphology, 'inflorescence.maleFlowerCount');
const FEMALE_FLOWERS = characterRange(morphology, 'inflorescence.femaleFlowerCount');

const C = {
  // female: "dark chocolate-purple" (Bean); paler and redder in the hollow of the sepal
  femaleDeep: lin('#4a1c2c'),
  female: lin('#6b2740'),
  femaleInner: lin('#8a3a55'),
  femaleEdge: lin('#55202f'),
  carpel: lin('#4a2046'),
  stigma: lin('#e3c8d6'),
  // male: "pale purple" (Flora of China, Bean), "rose-purple" (Purdue)
  male: lin('#c495a6'),
  malePale: lin('#dcbcc6'),
  maleBase: lin('#a66a84'),
  filament: lin('#8a4a6c'),
  anther: lin('#43203c'),
  // stalks: pale green, flushed with the purple of the flowers
  stalk: lin('#8f9a66'),
  stalkFlushed: lin('#8a6a72'),
  scale: lin('#a9805f'),
  scaleTip: lin('#7c5a44'),
};

interface SepalShape {
  length: number;
  halfWidth: number;
  /** The angle its midline makes with the plane across the flower, at its base and at its tip (radians; above 0 towards the flower's face). */
  from: number;
  to: number;
  /** How far its edges are drawn up across it: the hollow of a concave sepal. */
  cup: number;
  /** Below 1 widest near the base, above 1 near the tip; and how full the outline is. */
  widest: number;
  full: number;
  base: Readonly<RGB>;
  body: Readonly<RGB>;
  edge: Readonly<RGB>;
}

/** A sepal: base at the origin, running out along +Z, its hollow face towards +Y. */
function sepal(shape: SepalShape, [nu, nv]: Segs): THREE.BufferGeometry {
  // the midline, by walking along it as it turns from one angle to the other
  const N = 20;
  const ys = [0];
  const zs = [0];
  const angle = (a: number) => lerp(shape.from, shape.to, smoothstep(0, 1, a));
  for (let i = 1; i <= N; i++) {
    const psi = angle((i - 0.5) / N);
    ys.push(ys[i - 1]! + Math.sin(psi) / N);
    zs.push(zs[i - 1]! + Math.cos(psi) / N);
  }
  const along = (a: number): [number, number] => {
    const x = Math.min(N - 1e-6, Math.max(0, a * N));
    const i = Math.floor(x);
    return [lerp(ys[i]!, ys[i + 1]!, x - i), lerp(zs[i]!, zs[i + 1]!, x - i)];
  };
  const sb = new Surf();
  sb.surf(nu, nv, (u01, v) => {
    const b = u01 * 2 - 1;
    const hw = shape.halfWidth * Math.pow(Math.sin(Math.PI * Math.pow(0.03 + 0.95 * v, shape.widest)), shape.full);
    const [my, mz] = along(v);
    const psi = angle(v);
    // the edges rise towards the face of the flower, square to the midline
    const lift = shape.cup * b * b * hw;
    const c = mix(mix(shape.base, shape.body, smoothstep(0, 0.4, v)), shape.edge, Math.pow(Math.abs(b), 3) * 0.8);
    return { p: [b * hw, shape.length * my + lift * Math.cos(psi), shape.length * mz - lift * Math.sin(psi)], c };
  });
  return sb.build();
}

/** A tube built to be part of a flower, so that it opens and drops with it (Merge.tube alone makes axis, which stays). */
function partTube(pts: readonly V3[], radii: readonly number[], radial: number, c0: Readonly<RGB>, c1: Readonly<RGB>): THREE.BufferGeometry {
  const mg = new Merge(false);
  mg.tube(pts, radii, radial, c0, c1);
  return mg.build();
}

/** Segment counts of a flower at each level of detail; null leaves the part out. */
const FEMALE_SEGS: { sepal: Segs; carpel: [sides: number, rings: number] | null }[] = [
  { sepal: [10, 12], carpel: [6, 5] },
  { sepal: [4, 6], carpel: [4, 3] },
  { sepal: [2, 3], carpel: [3, 2] },
  { sepal: [1, 2], carpel: null },
];
const MALE_SEGS: { sepal: Segs; stamen: [sides: number, rings: number] | null }[] = [
  { sepal: [6, 7], stamen: [4, 5] },
  { sepal: [3, 3], stamen: [3, 3] },
  { sepal: [1, 2], stamen: [3, 2] },
  { sepal: [1, 1], stamen: null },
];

const ORIGIN = new V3(0, 0, 0);
const UP = new V3(0, 1, 0);

/**
 * A female flower: three broad, concave sepals spread wide, and in their
 * midst the carpels, standing apart like the fingers of a hand, each tipped
 * with its sticky stigma.
 */
function makeFemaleFlower(lod: number, carpels: number, seed: number): THREE.BufferGeometry {
  const seg = FEMALE_SEGS[lod]!;
  const rng = new RNG(7000 + seed * 19);
  const mg = new Merge(false);
  const shape: SepalShape = {
    length: FEMALE_SEPAL,
    halfWidth: FEMALE_SEPAL_HALF_WIDTH * 1.12,
    // spread wide, the tips turned a little back: the flower is open like a shallow three-bladed bowl
    from: 0.7,
    to: -0.25,
    cup: 0.85,
    widest: 0.95,
    full: 0.5,
    base: C.femaleInner,
    body: C.female,
    edge: C.femaleEdge,
  };
  const m = new THREE.Matrix4();
  const turn = new THREE.Matrix4();
  const sepalGeo = sepal(shape, seg.sepal);
  for (let k = 0; k < FEMALE_SEPALS; k++) {
    m.makeRotationY((k / FEMALE_SEPALS) * TAU + rng.range(-0.12, 0.12));
    // each stands a little differently open
    m.multiply(turn.makeRotationX(rng.range(-0.1, 0.14)));
    const tone = rng.range(0.9, 1.08);
    mg.add(sepalGeo, m, [tone, tone, tone], ORIGIN, 0);
  }
  if (seg.carpel) {
    const [sides, rings] = seg.carpel;
    const few = lod >= 2 ? Math.min(3, carpels) : carpels;
    for (let k = 0; k < few; k++) {
      const a = (k / few) * TAU + rng.range(-0.2, 0.2);
      const lean = rng.range(0.75, 1.0);
      const dir = new V3(Math.sin(lean) * Math.cos(a), Math.cos(lean), Math.sin(lean) * Math.sin(a));
      const length = CARPEL * rng.range(0.9, 1.1) * (lod >= 2 ? 1.15 : 1);
      const r = CARPEL * 0.14 * (lod >= 2 ? 1.5 : 1);
      const pts: V3[] = [];
      const radii: number[] = [];
      for (let i = 0; i <= rings; i++) {
        const t = i / rings;
        // curving outwards as it goes
        pts.push(dir.clone().multiplyScalar(length * t).addScaledVector(UP, -length * 0.16 * t * t).add(new V3(0, CARPEL * 0.08, 0)));
        radii.push(r * (t < 0.999 ? 0.85 + 0.3 * Math.sin(Math.PI * Math.min(1, t * 1.1)) : 0.75));
      }
      // dark, with the pale glistening stigma at the very tip
      mg.add(partTube(pts.slice(0, -1), radii.slice(0, -1), sides, C.carpel, mix(C.carpel, C.female, 0.5)), IDENTITY, WHITE, ORIGIN, 0);
      mg.add(partTube(pts.slice(-2), [radii[rings - 1]! * 1.05, radii[rings]!], sides, mix(C.female, C.stigma, 0.6), C.stigma), IDENTITY, WHITE, ORIGIN, 0);
    }
  }
  return mg.build();
}

/**
 * A male flower: three small hooded sepals turned right back, and six stamens
 * curved in upon one another in a knot.
 */
function makeMaleFlower(lod: number, seed: number): THREE.BufferGeometry {
  const seg = MALE_SEGS[lod]!;
  const rng = new RNG(8000 + seed * 23);
  const mg = new Merge(false);
  // at the far level a flower is three sepals and nothing else: drawn a little larger, to keep its mass of colour
  const big = lod === 3 ? 1.35 : 1;
  const shape: SepalShape = {
    length: MALE_SEPAL * big,
    halfWidth: MALE_SEPAL_HALF_WIDTH * 1.1 * big,
    from: 0.5,
    to: -0.85,
    cup: 0.5,
    widest: 0.8,
    full: 0.55,
    base: C.maleBase,
    body: C.male,
    edge: C.malePale,
  };
  const m = new THREE.Matrix4();
  const sepalGeo = sepal(shape, seg.sepal);
  for (let k = 0; k < MALE_SEPALS; k++) {
    m.makeRotationY((k / MALE_SEPALS) * TAU + rng.range(-0.15, 0.15));
    const tone = rng.range(0.92, 1.08);
    mg.add(sepalGeo, m, [tone, tone, tone], ORIGIN, 0);
  }
  if (seg.stamen) {
    const [sides, rings] = seg.stamen;
    const few = lod >= 2 ? 3 : STAMENS;
    for (let k = 0; k < few; k++) {
      const a = (k / few) * TAU + rng.range(-0.15, 0.15);
      const out = new V3(Math.cos(a), 0, Math.sin(a));
      const length = STAMEN * rng.range(0.92, 1.08);
      const pts: V3[] = [];
      const radii: number[] = [];
      for (let i = 0; i <= rings; i++) {
        const t = i / rings;
        // out from the middle and then curled in over it: "incurved at first" (Flora of China)
        pts.push(
          out
            .clone()
            .multiplyScalar(length * 0.36 * Math.sin(Math.PI * Math.pow(t, 0.85)) + length * 0.05)
            .addScaledVector(UP, length * 0.78 * (1 - Math.pow(1 - t, 1.6))),
        );
        radii.push(STAMEN * (lod >= 2 ? 0.2 : 0.11) * (0.55 + 0.75 * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.8))));
      }
      mg.add(partTube(pts, radii, sides, C.filament, C.anther), IDENTITY, WHITE, ORIGIN, 0);
    }
  }
  return mg.build();
}

// ---------------------------------------------------------------------------
// Raceme
// ---------------------------------------------------------------------------
/** Each variant: how many female flowers, with how many carpels each, and how many male flowers. All within the ranges the sources give. */
const RACEME_VARIANTS: { female: number[]; male: number }[] = [
  { female: [5, 4], male: 7 },
  { female: [4], male: 9 },
  { female: [6, 3], male: 5 },
  { female: [5], male: 6 },
];
for (const v of RACEME_VARIANTS) {
  if (v.female.length < FEMALE_FLOWERS[0] || v.female.length > FEMALE_FLOWERS[1] || v.male < MALE_FLOWERS[0] || v.male > MALE_FLOWERS[1] || v.female.some((n) => n < CARPELS[0] || n > CARPELS[1])) {
    throw new Error('akebia-quinata: a raceme variant has more or fewer flowers or carpels than its morphology file allows');
  }
}
const RACEME_LODS = 4;

/** A frame at `at` with +Y along `axis`, turned by `spin` about it. */
function facing(at: V3, axis: V3, spin: number, size = 1): THREE.Matrix4 {
  const [e1, e2] = across(axis);
  const x = e1.clone().multiplyScalar(Math.cos(spin)).addScaledVector(e2, Math.sin(spin));
  const z = new V3().crossVectors(x, axis);
  const m = new THREE.Matrix4().makeBasis(x, axis, z);
  m.scale(new V3(size, size, size));
  m.setPosition(at);
  return m;
}

function makeRacemeGeometry(variant: number, lod: number): THREE.BufferGeometry {
  const plan = RACEME_VARIANTS[variant]!;
  const rng = new RNG(2600 + variant * 41);
  const mg = new Merge(false);
  const radial = [6, 5, 3, 3][lod]!;

  // the axis: the stalk, then the part that bears the flowers, hanging and a little wavering.
  // It ends a flower's length short of the raceme's length: the lowest flowers hang past it.
  const axisLength = RACEME_LEN - MALE_PEDICEL * 0.9;
  // where the female flowers stand round the axis. A lone one weighs its side down, and the rest of the raceme
  // leans away from it; with two, one on either side, it hangs nearly plumb
  const phiF = rng.range(0, TAU);
  const lone = plan.female.length === 1;
  const bendA = lone ? phiF + Math.PI : rng.range(0, TAU);
  const bend = lone ? rng.range(0.011, 0.014) : rng.range(0.003, 0.007);
  const at = (f: number, out: V3 = new V3()): V3 => out.set(Math.cos(bendA) * bend * f * f, -f * axisLength, Math.sin(bendA) * bend * f * f);
  const NS = [14, 8, 4, 3][lod]!;
  const pts: V3[] = [];
  const radii: number[] = [];
  for (let i = 0; i <= NS; i++) {
    pts.push(at(i / NS));
    radii.push(lerp(0.00075, 0.00035, i / NS));
  }
  mg.tube(pts, radii, radial, C.stalk, C.stalkFlushed);

  // the bud scales that wrapped it, still at its foot ("bracts imbricate, scaly", Flora of China)
  if (lod < 2) {
    const scaleGeo = sepal({ length: 0.006, halfWidth: 0.0022, from: 1.1, to: 0.5, cup: 0.6, widest: 0.75, full: 0.6, base: C.scale, body: C.scale, edge: C.scaleTip }, lod === 0 ? [3, 3] : [1, 2]);
    const scales = lod === 0 ? 5 : 3;
    for (let k = 0; k < scales; k++) {
      const m = facing(ORIGIN, new V3(0, -1, 0), (k / scales) * TAU + 0.4, rng.range(0.8, 1.15));
      mg.add(scaleGeo, m, WHITE, ORIGIN, -1);
    }
  }

  const stalkFrom = PEDUNCLE / RACEME_LEN;
  const p = new V3();
  const q = new V3();
  const down = new V3(0, -1, 0);

  // the female flowers, at the foot of the flowering part, on long stalks that carry them well out to the side and
  // let them nod: a raceme is nearly as wide across its female flowers as it is long
  plan.female.forEach((carpels, k) => {
    at((PEDUNCLE + 0.003 * k) / axisLength, p);
    const a = phiF + k * (Math.PI * rng.range(0.88, 1.12));
    const out = new V3(Math.cos(a), 0, Math.sin(a));
    const length = FEMALE_PEDICEL * (lone ? rng.range(1.15, 1.25) : rng.range(0.92, 1.12));
    // out and then down in an arc; the flower nods at its end, facing outwards and down
    const reach = rng.range(0.76, 0.9);
    const end = p.clone().addScaledVector(out, length * reach).addScaledVector(down, length * Math.sqrt(1 - reach * reach) * 0.95);
    const knee = p.clone().addScaledVector(out, length * reach * 0.6).addScaledVector(down, length * 0.04);
    const NP = [8, 4, 2, 1][lod]!;
    const ppts: V3[] = [];
    for (let i = 0; i <= NP; i++) {
      const t = i / NP;
      ppts.push(p.clone().multiplyScalar((1 - t) * (1 - t)).addScaledVector(knee, 2 * t * (1 - t)).addScaledVector(end, t * t));
    }
    mg.tube(ppts, ppts.map((_, i) => lerp(0.0006, 0.00075, i / NP)), radial, C.stalk, C.stalkFlushed);
    const face = out.clone().multiplyScalar(rng.range(0.85, 1.25)).addScaledVector(down, 1).normalize();
    const tone = rng.range(0.92, 1.08);
    mg.add(makeFemaleFlower(lod, carpels, variant * 3 + k), facing(end, face, rng.range(0, TAU), rng.range(0.94, 1.08)), [tone, tone, tone * rng.range(0.96, 1.04)], end, 0.05 * k);
  });

  // the male flowers, spiralled round the rest of the axis and crowded towards its tip, on short stalks
  const phi0 = rng.range(0, TAU);
  const first = stalkFrom + 0.16;
  for (let i = 0; i < plan.male; i++) {
    const f = plan.male === 1 ? 0 : i / (plan.male - 1);
    const s = lerp(first, 1, Math.pow(f, 0.8));
    at(s, p);
    const a = phi0 + i * 2.39996 + rng.range(-0.3, 0.3);
    const out = new V3(Math.cos(a), 0, Math.sin(a));
    // the lowest stand out; towards the tip they hang
    const dip = lerp(0.55, 1.25, f) + rng.range(-0.15, 0.15);
    const dir = out.clone().multiplyScalar(Math.cos(dip)).addScaledVector(down, Math.sin(dip)).normalize();
    const length = MALE_PEDICEL * rng.range(0.85, 1.15) * lerp(1, 0.8, f);
    q.copy(p).addScaledVector(dir, length);
    if (lod < 3) mg.tube([p.clone(), p.clone().addScaledVector(dir, length * 0.5).addScaledVector(down, length * 0.06), q.clone()], [0.00042, 0.00038, 0.00042], radial, C.stalk, C.stalkFlushed);
    const tone = rng.range(0.9, 1.1);
    const warm = rng.range(-0.04, 0.04);
    // the female flowers open days before the male (Huang et al. 2022): the male take the rest of the opening, base to tip
    mg.add(makeMaleFlower(lod, variant * 5 + i), facing(q, dir, rng.range(0, TAU), rng.range(0.9, 1.1) * lerp(1.05, 0.9, f)), [tone * (1 + warm), tone, tone * (1 - warm)], q.clone(), lerp(0.32, 1, f));
  }
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, -RACEME_LEN / 2, 0), RACEME_LEN * 0.9);
  return g;
}

// ---------------------------------------------------------------------------
// Fruit: a fleshy follicle from each carpel that set, one to a few to a
// flower, on the stalk the flower hung by.
// ---------------------------------------------------------------------------
/** The follicle as authored: the middle of the Flora of China's 5 to 8 cm, which is what `fruit.lengthM` measures. */
const FRUIT_LEN = mid('fruit.lengthM');
const FRUIT_HALF_WIDTH = mid('fruit.widthM') / 2;
/** The stalk it hangs by: what is left of the raceme's stalk and the flower's own. */
const FRUIT_STALK = PEDUNCLE + FEMALE_PEDICEL * 0.8;
const FRUIT_LODS = 3;
const FOLLICLE_SEGS: Segs[] = [
  [16, 14],
  [8, 6],
  [5, 3],
];
/** Follicles to a fruit in each variant: "singly or in clusters of two to five" (Zou et al. 2023). */
const FRUIT_VARIANTS = [1, 2, 3];
{
  const [fewest, most] = characterRange(morphology, 'fruit.perFlower');
  if (FRUIT_VARIANTS.some((n) => n < fewest || n > most)) throw new Error('akebia-quinata: a fruit variant has more follicles than its morphology file allows');
}

const F = {
  // "pale green" unripe (Virginia Tech), with a bloom; the seam along one side paler, where it will split
  green: lin('#93a878'),
  greenShade: lin('#7d9468'),
  seam: lin('#c9d3ad'),
  fleck: lin('#6f8459'),
  stalk: lin('#7b7a52'),
  stalkWoody: lin('#6b5a44'),
};

/** One follicle: from the origin along -Y, sausage-shaped, a little curved, with the seam along its inner side (+Z). */
function makeFollicle(lod: number, seed: number): THREE.BufferGeometry {
  const sb = new Surf();
  const [around, along] = FOLLICLE_SEGS[lod]!;
  const rng = new RNG(5200 + seed * 29);
  const curve = rng.range(0.03, 0.09) * FRUIT_LEN;
  const fat = rng.range(0.93, 1.07);
  sb.surf(around, along, (u, v01) => {
    const th = u * TAU;
    // rings crowded towards the two ends, where the surface turns fastest
    const v = 0.5 - 0.5 * Math.cos(Math.PI * v01);
    // blunt at both ends, a little fuller below the middle
    const body = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * v - 1), 3.6)), 0.5);
    const r = FRUIT_HALF_WIDTH * fat * body * (0.94 + 0.1 * v);
    // the seam: a shallow groove down the inner side
    const toSeam = Math.cos(th - Math.PI / 2);
    const groove = lod === 0 ? 1 - 0.05 * Math.pow(Math.max(0, toSeam), 12) : 1;
    const x = Math.cos(th) * r * groove * 0.96;
    const z = Math.sin(th) * r * groove + curve * Math.sin(Math.PI * v);
    const seam = Math.pow(Math.max(0, toSeam), 26);
    const fleck = lod === 0 ? 0.5 + 0.5 * Math.sin(th * 7 + v * 31 + seed) * Math.sin(v * 17 + th * 3) : 0.5;
    let c = mix(F.green, F.greenShade, 0.5 - 0.5 * toSeam);
    c = mix(c, F.fleck, 0.12 * fleck * fleck);
    c = mix(c, F.seam, 0.8 * seam * Math.sin(Math.PI * v));
    return { p: [x, -v * FRUIT_LEN, z], c };
  });
  return sb.build();
}

function makeFruitGeometry(variant: number, lod: number): THREE.BufferGeometry {
  const count = FRUIT_VARIANTS[variant]!;
  const rng = new RNG(6100 + variant * 31);
  const mg = new Merge(false);
  const radial = [6, 4, 3][lod]!;
  // the stalk, thickened and going woody, bowed by the weight it carries
  const lean = rng.range(-0.006, 0.006);
  const end = new V3(lean, -FRUIT_STALK, rng.range(-0.004, 0.004));
  const NS = [6, 3, 2][lod]!;
  const pts: V3[] = [];
  for (let i = 0; i <= NS; i++) {
    const t = i / NS;
    pts.push(new V3(end.x * t + 0.004 * Math.sin(Math.PI * t), end.y * t, end.z * t));
  }
  mg.tube(pts, pts.map((_, i) => lerp(0.0011, 0.0016, i / NS)), radial, F.stalkWoody, F.stalk);
  const m = new THREE.Matrix4();
  const turn = new THREE.Matrix4();
  const spin0 = rng.range(0, TAU);
  for (let k = 0; k < count; k++) {
    // a single one hangs plumb; two or three hang side by side from the end of the stalk like the fingers of a
    // hand, a little apart where they join and parting a little more as they go, seams inwards
    const spread = count === 1 ? rng.range(0, 0.12) : rng.range(0.2, 0.32);
    const apart = count === 1 ? 0 : FRUIT_HALF_WIDTH * rng.range(0.55, 0.7);
    const spin = spin0 + (k / count) * TAU;
    const size = (k === 0 ? 1 : rng.range(0.75, 0.95)) * (lod === 2 ? 1.04 : 1);
    m.makeRotationY(spin);
    m.multiply(turn.makeRotationX(spread));
    m.scale(new V3(size, size, size));
    // rotating about Y by `spin` carries -Z to the side the follicle leans to
    m.setPosition(end.x - Math.sin(spin) * apart, end.y, end.z - Math.cos(spin) * apart);
    const tone = rng.range(0.94, 1.06);
    mg.add(makeFollicle(lod, variant * 7 + k), m, [tone, tone, tone], end, 0);
  }
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, -(FRUIT_STALK + FRUIT_LEN / 2), 0), FRUIT_LEN);
  return g;
}

// ---------------------------------------------------------------------------
// The look
// ---------------------------------------------------------------------------
const leaf: LeafAsset = {
  key: 'akebia-quinata/leaf',
  variants: LEAF_VARIANTS.length,
  lods: LEAF_LODS,
  make: makeLeafGeometry,
  budget: [2250, 360, 110],
  // about one leaf in ten has a leaflet fewer; the rest are hands of five, held three ways
  pick: (_lengthM, r) => (r < 0.1 ? 3 : r < 0.45 ? 0 : r < 0.75 ? 1 : 2),
  // "dark green" (RHS), "bright blue-green above" (NC State); young leaves "purple-tinged" (Purdue);
  // "tinted purple in winter" (RHS), with no autumn colour of note
  palette: { greenA: lin('#436f42'), greenB: lin('#58834a'), young: lin('#8a6c5a'), autumnA: lin('#66535c'), autumnB: lin('#4b6c47') },
  // papery, matt, with a faint bloom
  roughness: 0.62,
  translucency: 0.42,
  detailReach: 0.9,
};

const raceme: FlowerAsset = {
  key: 'akebia-quinata/raceme',
  variants: RACEME_VARIANTS.length,
  lods: RACEME_LODS,
  make: makeRacemeGeometry,
  budget: [7800, 2400, 700, 190],
  pick: (r) => Math.floor(r * RACEME_VARIANTS.length),
  authoredSize: RACEME_LEN,
  poise: 'hangs',
  centreAlong: 0.6,
  // buds are a duller, greener purple than the open flower
  budTint: [0.72, 0.82, 0.62],
  swing: 0.7,
  // the sepals are thick and waxy: little light comes through them
  translucency: 0.14,
  sheen: 0.06,
  detailAt: [0.9, 2.4, 5],
  detailCaps: [30, 140, 700],
};

const fruit: FruitAsset = {
  key: 'akebia-quinata/fruit',
  variants: FRUIT_VARIANTS.length,
  lods: FRUIT_LODS,
  make: makeFruitGeometry,
  budget: [1500, 340, 120],
  // most often one follicle to a flower, sometimes two, now and then three
  pick: (r) => (r < 0.55 ? 0 : r < 0.88 ? 1 : 2),
  authoredSize: FRUIT_LEN,
  poise: 'hangs',
  centreAlong: (FRUIT_STALK + FRUIT_LEN / 2) / FRUIT_LEN,
  // "greyish violet or purplish" (Bean), glaucous (Flora of North America); the seam brightens as it nears splitting
  ripe: lin('#9585a4'),
  ripeShade: [0.5, 1.15],
  roughness: 0.78,
  swing: 0.45,
  detailAt: [1.6, 5],
  detailCaps: [40, 300],
};

/**
 * The wood: a slender shoot, "green when young turning brown" (NC State), the
 * twig "red-brown" (Virginia Tech), the old stem "grayish brown" (Flora of
 * China) with bark "developing interlacing ridges and furrows" (Virginia
 * Tech). The ages over which it turns are a choice: no source read gives them.
 */
const wood: WoodLook = {
  young: lin('#76864f'),
  mature: lin('#7a5644'),
  old: [0.8, 0.72, 0.62],
  woodyDays: [90, 330],
  oldDays: [800, 2600],
  furrowDays: [900, 3200],
  furrow: 0.45,
  stiffDays: [45, 420],
  relief: 2,
  roughness: 0.9,
  // ridges that run into one another: fewer and wider than a stringy bark, and wandering
  grain: { streaks: 380, width: 3.6, wobble: 22 },
};

export const look: TaxonLook = {
  taxonId: 'akebia-quinata',
  provisional: false,
  leaves: { default: leaf },
  flowers: { default: raceme },
  fruits: { default: fruit },
  // a twiner: it holds on with its stems, and has no tendrils, rootlets or prickles
  appendages: {},
  wood,
};
