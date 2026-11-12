// Clematis 'Etoile Violette' (Viticella Group): a deciduous leaf-stalk climber
// cut to the ground each February, whose new stems carry the whole plant and
// flower on their upper half from July to September.
//
//   leaf     a pinnate leaf on a wiry axis that bends down at each pair of
//            leaflets (Darwin's "grappling apparatus"): five stalked leaflets
//            as a rule, some of them lobed; the fullest leaf has three pairs,
//            or its lowest pair divided into three; a few near the flowers
//            have three leaflets only. One unit long along +Z, upper side +Y.
//   cyme     what one flowering node carries: a stalk from the leaf axil, a
//            pair of small leafy bracts, and three long-stalked flowers, the
//            end one opening first. Each flower is four to six broad velvety
//            violet tepals round a boss of cream stamens. Stands along +Y; one
//            unit is the length of the cyme from the axil to the face of its
//            end flower, which is what the render data gives.
//   seeds    the same stalks after flowering, each ending in a small round
//            head of flat achenes with short bare tails
//   hold     a leaf stalk wound round the cable beside the stem, then running
//            on; it hardens and browns and outlasts its leaf
//   wood     slender ribbed shoots, green flushed red-brown, turning brown by
//            late summer; old stubs pale and stringy
//
// How a flower opens. The organ program draws an unopened part at three tenths
// of its size about its pivot. A tepal here is given a pivot for each of its
// rows instead of one for the whole, placed so that at three tenths the rows
// lie along the side of a closed bud: the same sheet is the bud's wall when
// shut and the tepal when open, and it folds away to nothing when it drops.
// The stamens are parts too, opening after the tepals and dropping after them;
// the styles are axis, and stay as the young seed head.
//
// Every count and size of the real plant is read from
// species/clematis-viticella-etoile-violette/morphology.json. Made from
// descriptions, not from specimens. This module is this clematis's alone.
import * as THREE from 'three';
import { characterNumber, characterRange, parseMorphology } from '@horti/core';
import morphologyJson from '../../../../../species/clematis-viticella-etoile-violette/morphology.json';
import { RNG, hash2, lerp, smoothstep } from '../../util.ts';
import { MIDRIB, Merge, type RGB, Surf, WHITE, lin, mix, path } from '../kit.ts';
import { type AppendageAsset, type FlowerAsset, type FruitAsset, type LeafAsset, THIN_LEAF, type TaxonLook, type WoodLook } from '../look.ts';

const morphology = parseMorphology(morphologyJson, 'species/clematis-viticella-etoile-violette/morphology.json');
const mid = (r: readonly [number, number]): number => (r[0] + r[1]) / 2;

const V3 = THREE.Vector3;
type V3 = THREE.Vector3;
const TAU = Math.PI * 2;
const AX = new V3(1, 0, 0);
const AY = new V3(0, 1, 0);
const AZ = new V3(0, 0, 1);
const IDENTITY = new THREE.Matrix4();
const gauss = (x: number): number => Math.exp(-x * x);

// ---------------------------------------------------------------------------
// Leaf
// ---------------------------------------------------------------------------
/** RHS, of this cultivar: leaves "divided into 5 leaflets". */
const USUAL_LEAFLETS = characterNumber(morphology, 'leaf.leafletCount');
/** Darwin, of C. viticella: "three pairs of lateral leaflets and a terminal one". */
const MOST_PAIRS = characterNumber(morphology, 'leaf.leafletPairsMost');
/** Bean: "the primary divisions trifoliolate". */
const BASAL_LEAFLETS = characterNumber(morphology, 'leaf.basalDivisionLeaflets');
const LEAF_LENGTH = characterRange(morphology, 'leaf.lengthM');
const LEAFLET_LENGTH = characterRange(morphology, 'leaf.leafletLengthM');
/** A leaflet's width for its length: from lance-shaped to broadly ovate. */
const [LEAFLET_NARROW, LEAFLET_BROAD] = characterRange(morphology, 'leaf.leafletWidthToLength');
/** The stalk below the first pair of leaflets, as a share of the leaf. */
const LEAF_STALK = characterNumber(morphology, 'leaf.stalkShare');
/** The longest and shortest a leaflet may be for the leaf that bears it. */
const LEAFLET_MOST = LEAFLET_LENGTH[1] / LEAF_LENGTH[1];
const LEAFLET_LEAST = LEAFLET_LENGTH[0] / LEAF_LENGTH[0];

const LEAF_LODS = 3;
const LEAFLET_SEGS: readonly (readonly [number, number])[] = [
  [8, 11],
  [3, 4],
  [2, 2],
];

/** `width` is the leaflet's width for its length; `lobes` puts a side lobe on the left (-1), the right (1) or both (2). */
function makeLeaflet(width: number, lobes: -1 | 0 | 1 | 2, lod: number, seed: number): THREE.BufferGeometry {
  const sb = new Surf();
  const [nu, nv] = LEAFLET_SEGS[lod]!;
  const half = width / 2;
  const wave = 0.5 + hash2(seed, 3);
  sb.surf(nu, nv, (u01, v) => {
    const u = u01 * 2 - 1;
    const side = u < 0 ? -1 : 1;
    // ovate: broadest a third of the way up, the base rounded, drawn out to a point
    let hw = half * Math.pow(Math.sin(Math.PI * Math.pow(v, 0.62)), 0.85) * (1 - 0.3 * Math.pow(v, 5)) * 1.04;
    // a side lobe: a shoulder low down and a notch above it, on a finer model only
    if (lobes !== 0 && (lobes === 2 || lobes === side)) hw *= (1 + 0.62 * gauss((v - 0.25) / 0.13)) * (1 - 0.42 * gauss((v - 0.47) / 0.06));
    const x = u * (hw + 0.003);
    // folded a little along the midrib, arched towards the tip
    let y = 0.16 * Math.abs(x) - 0.13 * v * v;
    if (lod === 0) {
      y += 0.022 * wave * Math.sin(v * 11 + u * 1.3 + seed) * u * u; // the margin lifts and falls
      y -= 0.012 * gauss((Math.abs(u) - 0.5) / 0.14) * (1 - v) * (1 - v); // the two side nerves from the base, impressed
    } else if (lod === 1) y += 0.015 * Math.sin(v * 11 + seed) * u * u;
    return { p: [x, y, v] };
  });
  return sb.build();
}

/** One leaflet, or a division of three, at a place on the leaf's axis. */
interface Division {
  /** Length of the leaflet (of the middle one, in a division of three), as a share of the leaf. */
  length: number;
  width: number;
  lobes: -1 | 0 | 1 | 2;
  /** The division is of three leaflets on a stalk of their own. */
  three: boolean;
}
interface LeafPlan {
  /** Pairs of side divisions, from the base of the leaf. */
  pairs: readonly Division[];
  end: Division;
  seed: number;
}

const leaflet = (length: number, width: number, lobes: -1 | 0 | 1 | 2 = 0, three = false): Division => ({ length, width, lobes, three });
const BROADISH = lerp(LEAFLET_NARROW, LEAFLET_BROAD, 0.62);
const MIDDLING = lerp(LEAFLET_NARROW, LEAFLET_BROAD, 0.4);
const NARROWISH = lerp(LEAFLET_NARROW, LEAFLET_BROAD, 0.15);

/**
 * The leaves drawn. The usual one has the five leaflets the RHS gives the
 * cultivar; lobed leaflets, a third pair and a lowest pair divided into three
 * are what Bean and Darwin describe for the species.
 */
const LEAF_PLANS: readonly LeafPlan[] = [
  // the usual leaf: two pairs and an end leaflet, all plain
  { pairs: [leaflet(0.34, BROADISH), leaflet(0.31, MIDDLING)], end: leaflet(0.4, MIDDLING), seed: 11 },
  // the same with lobed leaflets: a mitten on each side below, the end one three-lobed
  { pairs: [leaflet(0.35, LEAFLET_BROAD, 1), leaflet(0.3, MIDDLING)], end: leaflet(0.4, BROADISH, 2), seed: 23 },
  // the fullest: three pairs
  { pairs: Array.from({ length: MOST_PAIRS }, (_, i) => leaflet(0.3 - 0.025 * i, i === 0 ? BROADISH : MIDDLING)), end: leaflet(0.34, NARROWISH), seed: 37 },
  // the lowest pair divided into three
  { pairs: [leaflet(0.27, MIDDLING, 0, true), leaflet(0.3, MIDDLING)], end: leaflet(0.37, MIDDLING, 1), seed: 41 },
  // a leaf of three, as near the flowers
  { pairs: [leaflet(0.4, BROADISH)], end: leaflet(LEAFLET_MOST * 0.94, BROADISH), seed: 53 },
];

function makeLeafGeometry(variant: number, lod: number): THREE.BufferGeometry {
  const plan = LEAF_PLANS[variant]!;
  const rng = new RNG(900 + plan.seed);
  const mg = new Merge(true);
  const radial = [5, 3, 3][lod]!;
  const q = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const m = new THREE.Matrix4();

  // ---- the axis: stalk, then a stretch to each further pair, then the stalk of the end leaflet.
  // Darwin: it "bends angularly downwards" where each pair arises, the end leaflet's stalk most of all.
  const n = plan.pairs.length;
  const stretch = n > 2 ? 0.15 : 0.2;
  const endStalk = n === 1 ? 0.2 : n > 2 ? 0.11 : 0.13;
  const nodes: V3[] = [new V3(0, 0, 0)];
  let dip = 0.04;
  const heading = () => new V3(0, -Math.sin(dip), Math.cos(dip));
  nodes.push(heading().multiplyScalar(LEAF_STALK));
  const dips: number[] = [dip];
  for (let i = 1; i < n; i++) {
    dip += 0.16 + 0.05 * rng.f();
    dips.push(dip);
    nodes.push(nodes[i]!.clone().addScaledVector(heading(), stretch));
  }
  dip += 0.3 + 0.1 * rng.f();
  const endBase = nodes[n]!.clone().addScaledVector(heading(), endStalk);
  const endDip = dip;

  // a smooth tube through the nodes, kinked at each: thicker and finer near the stem
  const axisPts: V3[] = [];
  const axisRadii: number[] = [];
  const all = [...nodes, endBase];
  const per = [4, 2, 1][lod]!;
  for (let i = 0; i + 1 < all.length; i++) {
    for (let k = 0; k < per; k++) {
      axisPts.push(all[i]!.clone().lerp(all[i + 1]!, k / per));
      axisRadii.push(0.0125 * (1 - 0.5 * ((i + k / per) / (all.length - 1))));
    }
  }
  axisPts.push(endBase.clone());
  axisRadii.push(0.006);
  mg.tube(axisPts, axisRadii, radial, WHITE, WHITE, MIDRIB);

  /** A blade at `base`, turned `yaw` round the leaf's upper side from straight on, hanging by `droop`. */
  const put = (d: Division, base: V3, yaw: number, droop: number, seed: number, lengthK = 1) => {
    const blade = makeLeaflet(d.width, d.lobes === 0 ? 0 : lod === 2 ? 0 : d.lobes, lod, seed);
    q.setFromAxisAngle(AY, yaw);
    q.multiply(q2.setFromAxisAngle(AX, droop));
    q.multiply(q2.setFromAxisAngle(AZ, rng.range(-0.22, 0.22) - Math.sign(yaw) * 0.14));
    const s = d.length * lengthK;
    m.compose(base, q, new V3(s, s, s));
    const tone = rng.range(0.92, 1.08);
    mg.add(blade, m, [tone, tone, tone], base, rng.f());
  };
  /** The stalk of a leaflet: from `from`, `length` long, `yaw` round from straight on, rising by `lift`. Returns its far end. */
  const stalkTo = (from: V3, length: number, yaw: number, lift: number, baseDip: number): V3 => {
    const dir = new V3(Math.sin(yaw), 0, Math.cos(yaw)).applyAxisAngle(AX, baseDip).add(new V3(0, lift, 0)).normalize();
    const to = from.clone().addScaledVector(dir, length);
    if (lod < 2) mg.tube([from, from.clone().lerp(to, 0.5).add(new V3(0, 0.006, 0)), to], [0.0085, 0.0075, 0.0065], radial, WHITE, WHITE, MIDRIB);
    return to;
  };

  plan.pairs.forEach((d, i) => {
    for (const side of [-1, 1] as const) {
      // side leaflets stand out on "rather long sub-petioles", angled a little upwards
      const yaw = side * (Math.PI / 2 - rng.range(0.42, 0.62));
      const seed = plan.seed * 7 + i * 2 + (side + 1) / 2;
      if (!d.three) {
        const base = stalkTo(nodes[i + 1]!, 0.085 + 0.02 * rng.f(), yaw, 0.2, dips[i]!);
        put(d, base, yaw, dips[i]! + rng.range(0.12, 0.32), seed);
        continue;
      }
      // a division of three: a stalk, then a middle leaflet and two smaller at its sides
      const fork = stalkTo(nodes[i + 1]!, 0.14, yaw, 0.18, dips[i]!);
      const middle = stalkTo(fork, 0.07, yaw, 0.02, dips[i]! + 0.15);
      put(d, middle, yaw, dips[i]! + rng.range(0.2, 0.36), seed);
      for (const s2 of [-1, 1] as const) {
        const yaw2 = yaw + s2 * rng.range(0.85, 1.05);
        const at = stalkTo(fork, 0.035, yaw2, 0.1, dips[i]!);
        put({ ...d, lobes: 0 }, at, yaw2, dips[i]! + rng.range(0.1, 0.3), seed + 31 * s2, 0.78);
      }
    }
  });
  put(plan.end, endBase, rng.range(-0.1, 0.1), endDip + rng.range(0, 0.12), plan.seed * 7 + 99);

  // one unit long: from where the leaf joins the stem to the tip of its end leaflet
  const g = mg.build();
  g.computeBoundingBox();
  const k = 1 / g.boundingBox!.max.z;
  g.scale(k, k, k);
  const part = g.getAttribute('aPart');
  for (let i = 0; i < part.count; i++) part.setXYZ(i, part.getX(i) * k, part.getY(i) * k, part.getZ(i) * k);
  g.computeBoundingBox();
  g.boundingSphere = new THREE.Sphere(new V3(0, -0.1, 0.5), 0.85);
  return g;
}

// ---------------------------------------------------------------------------
// The cyme: three flowers on long stalks from one leaf axil
// ---------------------------------------------------------------------------
/** RHS: "four to six broad, velvety textured deep purple sepals". */
const [TEPALS_FEWEST, TEPALS_MOST] = characterRange(morphology, 'flower.tepalCount');
/** What the model draws at one flowering node. */
const FLOWERS = characterNumber(morphology, 'inflorescence.flowerCount');
/** A flower's width for the length of its cyme, which is the unit here. */
const FLOWER_WIDTH = mid(characterRange(morphology, 'flower.widthM')) / mid(characterRange(morphology, 'inflorescence.lengthM'));
const [TEPAL_NARROW, TEPAL_BROAD] = characterRange(morphology, 'flower.tepalWidthToLength');
/** RHS: "a small boss" of stamens. */
const BOSS_WIDTH = characterNumber(morphology, 'flower.bossWidthToFlower') * FLOWER_WIDTH;

const CYME_LODS = 3;
const RECEPTACLE = 0.013;
const TEPAL_LENGTH = FLOWER_WIDTH / 2 - RECEPTACLE;
const TEPAL_SEGS: readonly (readonly [number, number])[] = [
  [8, 12],
  [4, 5],
  [2, 2],
];

const C = {
  // the face of a tepal: deep violet, a redder band down the middle, darker at the margin
  violet: lin('#46135f'),
  deep: lin('#2a093f'),
  bar: lin('#641762'),
  throat: lin('#4d2a66'),
  // stamens: cream filaments, creamy yellow anthers
  filament: lin('#ece6c2'),
  anther: lin('#ead98a'),
  style: lin('#c3cc92'),
  receptacle: lin('#8a9a58'),
  // stalks: green, flushed purple-brown towards the flower
  stalk: lin('#6f7f46'),
  stalkFlushed: lin('#5d4a55'),
  bract: lin('#55803a'),
  bractRib: lin('#8fae62'),
} satisfies Record<string, RGB>;

/** Flowers of one cyme: how many tepals each has, in the order they open. The end flower is first. */
const CYME_TEPALS: readonly (readonly number[])[] = [
  [TEPALS_MOST, TEPALS_FEWEST, TEPALS_MOST - 1],
  Array.from({ length: FLOWERS }, () => TEPALS_FEWEST),
  [TEPALS_MOST - 1, TEPALS_MOST - 1, TEPALS_FEWEST],
  // a cyme whose second side flower came to nothing
  [TEPALS_MOST - 1, TEPALS_FEWEST],
];
/** When each flower of a cyme opens, as the organ program counts it: the end flower at once, the side flowers after. */
const OPENS_AT: readonly number[] = [0.02, 0.52, 0.84];

interface FlowerSeat {
  /** Where the flower sits on its stalk. */
  at: V3;
  /** The way it faces when open, and the way its bud points. */
  axis: V3;
  budAxis: V3;
}
interface CymeFrame {
  /** Centre line of the stalk from the leaf axil to the bracts. */
  stalk: V3[];
  fork: V3;
  /** Centre line of each flower's own stalk, from the fork. */
  stalks: V3[][];
  seats: FlowerSeat[];
}

/**
 * The stalks of a cyme. It stands along +Y, which the viewer turns outwards
 * from the support, with +Z towards the sky. The end flower's stalk carries
 * on, rises and crooks over, so that the flower looks out and a little down;
 * the side flowers stand off to either side on shorter stalks from the axils
 * of the two bracts.
 */
function cymeFrame(variant: number, flowers: number): CymeFrame {
  const rng = new RNG(4200 + variant * 97);
  const lean = rng.range(-0.05, 0.05);
  const fork = new V3(lean, 0.34 + rng.range(-0.03, 0.03), 0.1 + rng.range(-0.02, 0.03));
  const stalk = path(6, (t) => new V3(lean * t, fork.y * t, fork.z * t + 0.035 * Math.sin(Math.PI * t)));
  const stalks: V3[][] = [];
  const seats: FlowerSeat[] = [];
  // the end flower
  {
    const at = new V3(lean * 1.4, 0.95, 0.17 + rng.range(-0.02, 0.02));
    const rise = new V3(lean, 0.66, 0.33);
    const crook = new V3(lean * 1.3, 0.88, 0.3);
    stalks.push(path(10, (t) => bezier([fork, rise, crook, at], t)));
    seats.push({ at, axis: new V3(rng.range(-0.08, 0.08), 0.86, -0.5).normalize(), budAxis: new V3(0, 0.5, -0.86).normalize() });
  }
  // the side flowers, from the axils of the bracts
  const first = rng.sign();
  for (let k = 1; k < flowers; k++) {
    const side = k === 1 ? first : -first;
    const out = 0.36 + rng.range(-0.02, 0.03);
    const at = new V3(side * out, 0.72 + rng.range(-0.04, 0.04), -0.02 + rng.range(-0.04, 0.03));
    const rise = new V3(side * 0.2, 0.52, 0.2);
    const crook = new V3(side * (out - 0.02), 0.66, 0.11);
    stalks.push(path(9, (t) => bezier([fork, rise, crook, at], t)));
    seats.push({ at, axis: new V3(side * 0.52, 0.66, -0.54).normalize(), budAxis: new V3(side * 0.22, 0.32, -0.92).normalize() });
  }
  return { stalk, fork, stalks, seats };
}

function bezier(p: readonly V3[], t: number): V3 {
  const a = (1 - t) ** 3;
  const b = 3 * (1 - t) ** 2 * t;
  const c = 3 * (1 - t) * t * t;
  const d = t ** 3;
  return new V3(a * p[0]!.x + b * p[1]!.x + c * p[2]!.x + d * p[3]!.x, a * p[0]!.y + b * p[1]!.y + c * p[2]!.y + d * p[3]!.y, a * p[0]!.z + b * p[1]!.z + c * p[2]!.z + d * p[3]!.z);
}

/** The stalks and bracts of a cyme: all axis, which stays when the flowers have gone. */
function addCymeStalks(mg: Merge, frame: CymeFrame, lod: number, c0: Readonly<RGB>, c1: Readonly<RGB>, bractTone: Readonly<RGB>): void {
  const sides = [5, 4, 3][lod]!;
  const thin = (pts: readonly V3[]): V3[] => (lod === 0 ? [...pts] : pts.filter((_, i) => i === 0 || i === pts.length - 1 || i % (lod === 1 ? 2 : 4) === 0));
  const main = thin(frame.stalk);
  mg.tube(main, main.map(() => 0.0085), sides, c0, mix(c0, c1, 0.35));
  for (const one of frame.stalks) {
    const pts = thin(one);
    mg.tube(pts, pts.map((_, i) => lerp(0.0075, 0.0062, i / (pts.length - 1))), sides, mix(c0, c1, 0.3), c1);
  }
  // a pair of small leafy bracts where the stalk forks
  const [nu, nv] = ([[4, 6], [2, 3], [1, 1]] as const)[lod]!;
  for (const side of [-1, 1]) {
    const sb = new Surf();
    sb.surf(nu, nv, (u01, v) => {
      const u = u01 * 2 - 1;
      const hw = 0.19 * Math.pow(Math.sin(Math.PI * Math.pow(v, 0.6)), 0.85) * (1 - 0.3 * v ** 5) + 0.004;
      const x = u * hw;
      const rib = gauss(u / 0.22);
      return { p: [x, 0.2 * Math.abs(x) - 0.3 * v * v, v], c: mix(C.bract, C.bractRib, 0.45 * rib) };
    });
    const q = new THREE.Quaternion().setFromAxisAngle(AZ, side * 0.5);
    // out to the side and forward, the upper face to the sky side of the cyme
    q.premultiply(new THREE.Quaternion().setFromUnitVectors(AZ, new V3(side * 0.82, 0.5, 0.28).normalize()));
    const s = 0.3;
    mg.add(sb.build(), new THREE.Matrix4().compose(frame.fork, q, new V3(s, s, s)), bractTone, frame.fork, -1);
  }
}

/** Half the width of a tepal at `s` along it, for a tepal `half` wide at its broadest: broad, narrowed to its base, drawn out to a long point. */
function tepalHalfWidth(half: number, s: number): number {
  const body = Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, s))), 0.72 + 1.1 * s * s * s);
  const claw = 0.34 * (1 - s) * (1 - s);
  return half * (claw + (1 - claw) * body);
}

/**
 * One flower. Its tepals are parts that open at `opens` and drop in turn; its
 * stamens open just after and drop after the tepals; its receptacle and
 * styles are axis.
 */
function addFlower(mg: Merge, seat: FlowerSeat, tepals: number, opens: number, lod: number, seed: number): void {
  const A = seat.axis;
  const E1 = AX.clone().addScaledVector(A, -A.x).normalize();
  const E2 = new V3().crossVectors(A, E1);
  const B = seat.budAxis;
  const [nu, nv] = TEPAL_SEGS[lod]!;
  // the more tepals, the narrower each: four broad ones or six that overlap
  const half = (TEPAL_LENGTH * lerp(TEPAL_BROAD, TEPAL_NARROW, (tepals - TEPALS_FEWEST) / Math.max(1, TEPALS_MOST - TEPALS_FEWEST))) / 2;
  const theta0 = hash2(seed, 1) * TAU;

  for (let k = 0; k < tepals; k++) {
    const theta = theta0 + (k / tepals) * TAU + (hash2(seed, 10 + k) - 0.5) * 0.14;
    const er = E1.clone().multiplyScalar(Math.cos(theta)).addScaledVector(E2, Math.sin(theta));
    const et = E1.clone().multiplyScalar(-Math.sin(theta)).addScaledVector(E2, Math.cos(theta));
    const length = TEPAL_LENGTH * (0.96 + 0.08 * hash2(seed, 20 + k));
    const twist = (hash2(seed, 30 + k) - 0.5) * 0.5;
    const ripple = hash2(seed, 40 + k) * TAU;
    /** Height of the open tepal above the plane of the flower. */
    const lift = (u: number, s: number): number => {
      // a little dished near the base, the tip and the margins turned back
      let h = 0.07 * length * Math.sin(Math.PI * Math.min(1, s * 1.25)) - 0.2 * length * smoothstep(0.62, 1, s) ** 2 - 0.085 * length * u * u * (0.25 + 0.75 * s);
      h += twist * u * half * s;
      if (lod === 0) {
        // three nerves down the middle stand in furrows; the margin is unevenly tucked back
        h -= 0.017 * (gauss(u / 0.1) + 0.7 * gauss((Math.abs(u) - 0.3) / 0.09)) * (1 - s * s);
        h += 0.012 * Math.sin(s * 9 + ripple) * u * Math.abs(u);
      }
      return h;
    };
    const open = (u: number, s: number): V3 =>
      seat.at
        .clone()
        .addScaledVector(er, RECEPTACLE + length * s)
        .addScaledVector(et, u * tepalHalfWidth(half, s))
        .addScaledVector(A, lift(u, s));
    // the bud: each tepal a strip of its wall, edge to edge with its neighbours, tapering to a point
    const erB = er.clone().addScaledVector(B, -er.dot(B)).normalize();
    const wall = 0.3 / Math.tan(Math.PI / tepals);
    const budMid = (s: number): V3 =>
      seat.at
        .clone()
        .addScaledVector(B, 0.012 + 0.9 * length * Math.pow(s, 1.2))
        // the tips cross a little, so that the bud is shut before it is full grown too
        .addScaledVector(erB, wall * tepalHalfWidth(half, s) + 0.004 - 0.03 * length * s * s * s * s);
    const pivot = (s: number): V3 => budMid(s).addScaledVector(open(0, s), -0.3).multiplyScalar(1 / 0.7);

    const sb = new Surf();
    sb.surf(nu, nv, (u01, s) => {
      const u = u01 * 2 - 1;
      const p = open(u, s);
      let c = mix(C.throat, C.violet, Math.min(1, s * 4));
      c = mix(c, C.bar, 0.55 * gauss(u / 0.24) * (1 - 0.6 * s));
      c = mix(c, C.deep, Math.min(1, 0.75 * Math.pow(Math.abs(u), 1.6) + 0.5 * Math.max(0, s - 0.72)));
      // the nerves show as fine dark lines
      if (lod === 0) c = mix(c, C.deep, 0.35 * (gauss(u / 0.045) + gauss((Math.abs(u) - 0.3) / 0.045)) * (1 - s));
      return { p: [p.x, p.y, p.z], c };
    });
    const from = mg.n;
    const tone = 0.93 + 0.14 * hash2(seed, 50 + k);
    mg.add(sb.build(), IDENTITY, [tone, tone * (0.97 + 0.06 * hash2(seed, 60 + k)), tone], seat.at, opens + (0.09 * (k + hash2(seed, 70 + k))) / tepals);
    // a pivot for each row of the sheet, in place of the one pivot `add` gave it
    for (let j = 0; j <= nv; j++) {
      const p = pivot(j / nv);
      for (let i = 0; i <= nu; i++) {
        const at = 4 * (from + j * (nu + 1) + i);
        mg.part[at] = p.x;
        mg.part[at + 1] = p.y;
        mg.part[at + 2] = p.z;
      }
    }
  }

  // ---- the boss: stamens, which open after the tepals part and drop after them
  const stamensOpen = Math.min(1, opens + 0.13);
  const reach = BOSS_WIDTH / 2;
  if (lod < 2) {
    const count = lod === 0 ? 30 : 9;
    const stamen = makeStamen(lod);
    const q = new THREE.Quaternion();
    for (let i = 0; i < count; i++) {
      // rings from the middle outwards: the inner stand, the outer lean
      const f = (i + 0.5) / count;
      const tilt = 0.12 + 0.75 * Math.sqrt(f);
      const turn = i * 2.39996 + hash2(seed, 100 + i);
      const dir = A.clone()
        .multiplyScalar(Math.cos(tilt))
        .addScaledVector(E1, Math.sin(tilt) * Math.cos(turn))
        .addScaledVector(E2, Math.sin(tilt) * Math.sin(turn));
      q.setFromUnitVectors(AY, dir);
      const long = (reach / Math.sin(0.87)) * (0.82 + 0.3 * hash2(seed, 200 + i)) * (lod === 0 ? 1 : 1.05);
      const wide = lod === 0 ? long : long * 1.9;
      const from = seat.at.clone().addScaledVector(dir, RECEPTACLE * 0.5);
      const tone = 0.94 + 0.12 * hash2(seed, 300 + i);
      const first = mg.n;
      mg.add(stamen, new THREE.Matrix4().compose(from, q, new V3(wide, long, wide)), [tone, tone, tone * 0.96], seat.at, stamensOpen);
      // in the bud the stamens stand together along its axis: a pivot for each ring, as for the rows of a tepal
      const [around, along] = STAMEN_SEGS[lod]!;
      const gather = E1.clone().multiplyScalar(Math.cos(turn)).addScaledVector(E2, Math.sin(turn)).multiplyScalar(0.012 * Math.sqrt(f));
      for (let j = 0; j <= along; j++) {
        const v = j / along;
        const open = new V3(STAMEN_BEND * v * v * wide, v * long, 0).applyQuaternion(q).add(from);
        const shut = seat.at.clone().add(gather).addScaledVector(B, 0.012 + 0.85 * long * v);
        const p = shut.addScaledVector(open, -0.3).multiplyScalar(1 / 0.7);
        for (let k = 0; k <= around; k++) {
          const at = 4 * (first + j * (around + 1) + k);
          mg.part[at] = p.x;
          mg.part[at + 1] = p.y;
          mg.part[at + 2] = p.z;
        }
      }
    }
  } else {
    // far off: a cream tuft
    const sb = new Surf();
    sb.surf(3, 1, (u, v) => {
      const th = u * TAU;
      const r = reach * 0.8 * (0.35 + 0.65 * v);
      const p = seat.at
        .clone()
        .addScaledVector(A, RECEPTACLE + reach * 0.9 * v)
        .addScaledVector(E1, Math.cos(th) * r)
        .addScaledVector(E2, Math.sin(th) * r);
      return { p: [p.x, p.y, p.z], c: mix(C.filament, C.anther, v) };
    });
    mg.add(sb.build(), IDENTITY, WHITE, seat.at, stamensOpen);
  }

  // ---- the receptacle stays; the tuft of styles lengthens as the flower ages and is the last thing to go,
  // on the day the core calls the cyme spent: what follows it, if it set, is the seed head
  if (lod < 2) {
    const dome = new Surf();
    dome.surf(lod === 0 ? 6 : 4, 2, (u, v) => {
      const th = u * TAU;
      const r = RECEPTACLE * Math.cos(v * 1.45);
      const p = seat.at
        .clone()
        .addScaledVector(A, RECEPTACLE * 1.1 * Math.sin(v * 1.45) - 0.004)
        .addScaledVector(E1, Math.cos(th) * r)
        .addScaledVector(E2, Math.sin(th) * r);
      return { p: [p.x, p.y, p.z], c: mix(C.receptacle, C.style, v) };
    });
    mg.add(dome.build(), IDENTITY, WHITE, seat.at, -1);
    const styles = lod === 0 ? 7 : 3;
    const style = makeStamen(lod);
    const q = new THREE.Quaternion();
    for (let i = 0; i < styles; i++) {
      const tilt = i === 0 ? 0 : 0.42;
      const turn = (i / (styles - 1 || 1)) * TAU + hash2(seed, 400);
      const dir = A.clone()
        .multiplyScalar(Math.cos(tilt))
        .addScaledVector(E1, Math.sin(tilt) * Math.cos(turn))
        .addScaledVector(E2, Math.sin(tilt) * Math.sin(turn));
      q.setFromUnitVectors(AY, dir);
      const long = reach * 0.66;
      const from = seat.at.clone().addScaledVector(A, RECEPTACLE * 0.6);
      // greener than the stamens, and stouter
      mg.add(style, new THREE.Matrix4().compose(from, q, new V3(long * 1.5, long, long * 1.5)), STYLE_TINT, seat.at, LAST_TO_GO);
    }
  }
}

/** Segments round and along a stamen, by level of detail; and how far its tip leans, in lengths. */
const STAMEN_SEGS: readonly (readonly [number, number])[] = [
  [4, 3],
  [3, 2],
];
const STAMEN_BEND = 0.08;
/** A style is drawn with the stamen's shape in the green of the young seed head. */
const STYLE_TINT: RGB = [0.72, 0.88, 0.62];
/** The opening order of what opens last and drops last. */
const LAST_TO_GO = 1;

/** One stamen, standing along +Y from the origin, one unit long: a slender filament and a thicker anther. */
const stamenCache: THREE.BufferGeometry[] = [];
function makeStamen(lod: number): THREE.BufferGeometry {
  if (stamenCache[lod]) return stamenCache[lod]!;
  const sb = new Surf();
  const [around, along] = STAMEN_SEGS[lod]!;
  sb.surf(around, along, (u, v) => {
    const th = u * TAU;
    // the anther is the last third
    const r = v < 0.62 ? 0.03 : 0.058 * Math.sin(Math.PI * Math.min(1, (v - 0.55) / 0.45) * 0.86 + 0.2);
    const bend = STAMEN_BEND * v * v;
    return { p: [Math.cos(th) * r + bend, v, Math.sin(th) * r], c: mix(C.filament, C.anther, smoothstep(0.5, 0.72, v)) };
  });
  return (stamenCache[lod] = sb.build());
}

function makeCymeGeometry(variant: number, lod: number): THREE.BufferGeometry {
  const tepals = CYME_TEPALS[variant]!;
  const frame = cymeFrame(variant, tepals.length);
  const mg = new Merge(false);
  addCymeStalks(mg, frame, lod, C.stalk, C.stalkFlushed, WHITE);
  frame.seats.forEach((seat, i) => addFlower(mg, seat, tepals[i]!, OPENS_AT[i]!, lod, 500 + variant * 31 + i * 7));
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, 0.6, 0.1), 0.95);
  return g;
}

// ---------------------------------------------------------------------------
// Seed heads: the stalks of the cyme, each ending in a head of achenes
// ---------------------------------------------------------------------------
/** Width of a head of seed, tails and all, for the length of the cluster. */
const HEAD_WIDTH = mid(characterRange(morphology, 'fruit.headWidthM')) / mid(characterRange(morphology, 'inflorescence.lengthM'));
const SEED_LODS = 3;
/** Which of a cluster's stalks carry a head, by variant: all three, two, or the end one alone. */
const SEED_HEADS: readonly (readonly boolean[])[] = [
  [true, true, true],
  [true, false, true],
  [true, false, false],
];
const SEED = {
  green: lin('#7d9a4c'),
  pale: lin('#a9b878'),
  tail: lin('#b9bf8c'),
  stalk: lin('#7a8650'),
  stalkDry: lin('#6d6a48'),
  bract: lin('#8a9858'),
} satisfies Record<string, RGB>;

/** A head of achenes at the end of a stalk: flat, broad and short, each with a small bare tail (Bean). */
function addSeedHead(mg: Merge, seat: FlowerSeat, lod: number, seed: number): void {
  const A = seat.budAxis;
  const E1 = AX.clone().addScaledVector(A, -A.x).normalize();
  const E2 = new V3().crossVectors(A, E1);
  const radius = HEAD_WIDTH / 2;
  const count = [14, 9, 5][lod]!;
  const [around, along] = ([[6, 4], [4, 2], [3, 1]] as const)[lod]!;
  const body = new Surf();
  // one achene along +Y: a flattened, pointed body
  body.surf(around, along, (u, v) => {
    const th = u * TAU;
    const r = 0.4 * Math.pow(Math.sin(Math.PI * (0.05 + 0.86 * v)), 0.7);
    return { p: [Math.cos(th) * r, v * 0.66, Math.sin(th) * r * 0.45], c: mix(SEED.green, SEED.pale, 0.5 + 0.5 * Math.cos(th * 2)) };
  });
  const achene = body.build();
  const q = new THREE.Quaternion();
  for (let i = 0; i < count; i++) {
    // spread over the head, the middle ones standing and the outer ones splayed
    const f = (i + 0.5) / count;
    const tilt = lod === 2 ? 0.25 + 1.15 * f : 0.1 + 1.35 * Math.sqrt(f);
    const turn = i * 2.39996 + hash2(seed, i);
    const dir = A.clone()
      .multiplyScalar(Math.cos(tilt))
      .addScaledVector(E1, Math.sin(tilt) * Math.cos(turn))
      .addScaledVector(E2, Math.sin(tilt) * Math.sin(turn));
    q.setFromUnitVectors(AY, dir);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(AY, hash2(seed, 50 + i) * TAU));
    const s = radius * (lod === 2 ? 1.1 : 0.95) * (0.9 + 0.2 * hash2(seed, 80 + i));
    const from = seat.at.clone().addScaledVector(dir, radius * 0.12);
    const tone = 0.9 + 0.2 * hash2(seed, 120 + i);
    mg.add(achene, new THREE.Matrix4().compose(from, q, new V3(s, s, s)), [tone, tone, tone], from, 0);
    if (lod < 2) {
      // the tail: the style, short and bare, hooked at its end
      const tip = from.clone().addScaledVector(dir, s * 0.6);
      const side = new V3().crossVectors(dir, A).normalize();
      mg.tube([tip, tip.clone().addScaledVector(dir, s * 0.26).addScaledVector(side, s * 0.05), tip.clone().addScaledVector(dir, s * 0.42).addScaledVector(side, s * 0.16)], [s * 0.05, s * 0.035, s * 0.018], 3, SEED.pale, SEED.tail);
    }
  }
}

function makeSeedGeometry(variant: number, lod: number): THREE.BufferGeometry {
  const heads = SEED_HEADS[variant]!;
  // the same stalks that carried the flowers of the commonest cyme
  const frame = cymeFrame(variant, FLOWERS);
  const mg = new Merge(false);
  addCymeStalks(mg, frame, lod, SEED.stalk, SEED.stalkDry, [0.9, 0.95, 0.8]);
  frame.seats.forEach((seat, i) => {
    if (heads[i]) addSeedHead(mg, seat, lod, 700 + variant * 13 + i * 5);
  });
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, 0.6, 0.1), 0.95);
  return g;
}

// ---------------------------------------------------------------------------
// The hold: a leaf stalk wound round the cable
// ---------------------------------------------------------------------------
const COIL_LODS = 2;
const COIL = { green: lin('#74813f'), flushed: lin('#7a5a44') };
/**
 * Where the engine puts a clasping stalk: at the point where the stem lies
 * against the cable it holds, reaching into the cable. So the cable stands
 * just in front of the origin, and the unit here is the reach of the clasp:
 * from the stem round the far side of the cable. The length in the render data
 * is that reach (the growth model's appendages.leafStalkLengthM); the rest of
 * the stalk is the stalk of the leaf drawn at the same node.
 */
const CLASP_REACH_M = mid(characterRange(morphology, 'hold.claspReachM'));
/** The cable the clasp is drawn round, and the stalk's own thickness, in units of the reach. */
const HELD = characterNumber(morphology, 'hold.heldDiameterMm') / 1000 / 2 / CLASP_REACH_M;
const STALK = characterNumber(morphology, 'hold.stalkThicknessMm') / 1000 / 2 / CLASP_REACH_M;

/**
 * Variant 0 is wound round its support; variant 1 found nothing, and is the
 * hooked stalk Darwin describes. The render data does not say which way the
 * thing held runs: it is taken to stand along +Y, as a cable that a stem
 * climbs does. Where the coil comes round to the near side it passes within
 * the thickness of the stem, which lies against the cable there.
 */
function makeStalkCoilGeometry(variant: number, lod: number): THREE.BufferGeometry {
  const mg = new Merge(false);
  const n = [26, 9][lod]!;
  let pts: V3[];
  if (variant === 0) {
    const r = HELD + STALK * 1.25;
    // the middle of the cable: the stalk starts on its near face
    const z0 = HELD * 0.94;
    const turns = 1.42;
    const winding = Math.round(n * 0.86);
    const coil = path(winding, (t) => {
      const phi = 0.55 + t * turns * TAU;
      return new V3(r * Math.sin(phi), -0.16 + 0.42 * t, z0 - r * Math.cos(phi));
    });
    // out of the stem and on to the cable, round it, and off on the far side as the stalk runs on
    const last = coil[coil.length - 1]!;
    const go = last.clone().sub(coil[coil.length - 2]!).normalize();
    const tail = path(n - winding, (t) => last.clone().addScaledVector(go, 0.22 * t).add(new V3(0, 0.08 * t * t, (1 - last.z) * t * t)));
    pts = [new V3(0, -0.2, 0), ...coil, ...tail.slice(1)];
  } else {
    // nothing caught: out along +Z, the end bent down at a right angle
    pts = path(n, (t) => (t < 0.72 ? new V3(0, 0.05 * Math.sin((Math.PI * t) / 0.72), (t / 0.72) * 0.94) : new V3(0, -0.2 * smoothstep(0.72, 1, t), 0.94 + 0.06 * Math.sin(((t - 0.72) / 0.28) * Math.PI * 0.5))));
  }
  mg.tube(pts, pts.map((_, i) => STALK * (1.1 - 0.4 * (i / (pts.length - 1)))), [5, 3][lod]!, COIL.green, COIL.flushed);
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, 0, 0.5), 0.8);
  return g;
}

// ---------------------------------------------------------------------------
// The look
// ---------------------------------------------------------------------------
const leaf: LeafAsset = {
  key: 'clematis-viticella-etoile-violette/leaf',
  variants: LEAF_PLANS.length,
  lods: LEAF_LODS,
  make: makeLeafGeometry,
  budget: [2000, 400, 110],
  // four leaves in ten are the plain leaf of five; the rest are lobed, fuller, or of three
  pick: (_lengthM, r) => (r < 0.4 ? 0 : r < 0.6 ? 1 : r < 0.78 ? 2 : r < 0.9 ? 3 : 4),
  // mid-green and matt (RHS); fresh and lighter when new; no autumn colour is claimed: it dulls, yellows and browns
  palette: { greenA: lin('#4f7f37'), greenB: lin('#62923f'), young: lin('#8fb052'), autumnA: lin('#b3a24a'), autumnB: lin('#8a6a3a') },
  roughness: 0.62,
  translucency: THIN_LEAF,
  detailReach: 0.8,
};

const cyme: FlowerAsset = {
  key: 'clematis-viticella-etoile-violette/cyme',
  variants: CYME_TEPALS.length,
  lods: CYME_LODS,
  make: makeCymeGeometry,
  budget: [7200, 1500, 300],
  pick: (r) => (r < 0.3 ? 0 : r < 0.55 ? 1 : r < 0.86 ? 2 : 3),
  authoredSize: 1,
  poise: 'held',
  centreAlong: 0.78,
  // a bud shows the dusky back of its tepals
  budTint: [0.92, 0.95, 0.72],
  swing: 0.35,
  translucency: 0.08,
  sheen: 0.16,
  detailAt: [1.5, 4.2],
  detailCaps: [45, 420],
};

const seedHeads: FruitAsset = {
  key: 'clematis-viticella-etoile-violette/seed-heads',
  variants: SEED_HEADS.length,
  lods: SEED_LODS,
  make: makeSeedGeometry,
  budget: [3200, 1000, 240],
  pick: (r) => (r < 0.35 ? 0 : r < 0.75 ? 1 : 2),
  authoredSize: 1,
  poise: 'held',
  centreAlong: 0.78,
  // green, drying to a dull brown
  ripe: lin('#6b5236'),
  ripeShade: [0.55, 1.7],
  roughness: 0.85,
  swing: 0.3,
  detailAt: [1.4, 4],
  detailCaps: [40, 300],
};

const stalkCoil: AppendageAsset = {
  key: 'clematis-viticella-etoile-violette/leaf-stalk-coil',
  variants: 2,
  lods: COIL_LODS,
  make: makeStalkCoilGeometry,
  budget: [280, 64],
  pick: (_r, holding) => (holding ? 0 : 1),
  // Darwin: a clasped stalk thickens and hardens; it browns and outlasts its leaf
  aged: lin('#6a4a30'),
  agedDays: [50, 200],
  roughness: 0.8,
  swing: 0,
  detailAt: [1.2],
  detailCaps: [220],
};

/**
 * Slender, ribbed shoots (Bean), reddish (RBG Victoria): green flushed
 * red-brown when new, brown by late summer, and what is left as a stub going
 * pale and stringy. The colours and ages are chosen from those words; no
 * source gives them.
 */
const wood: WoodLook = {
  young: lin('#7a7a44'),
  mature: lin('#6f5338'),
  old: [0.95, 0.83, 0.66],
  woodyDays: [50, 170],
  oldDays: [320, 900],
  // ribbed from the start, never deeply fluted
  furrowDays: [15, 160],
  furrow: 0.45,
  stiffDays: [35, 220],
  relief: 2.4,
  roughness: 0.9,
  // fine, straight fibres
  grain: { streaks: 620, width: 1.7, wobble: 4 },
};

export const look: TaxonLook = {
  taxonId: 'clematis-viticella-etoile-violette',
  provisional: false,
  leaves: { default: leaf },
  flowers: { default: cyme },
  fruits: { default: seedHeads },
  appendages: { leaf_stalk_coil: stalkCoil },
  wood,
};

// what the leaflets of the plans come to, against what Bean gives: a leaflet is never longer or shorter than his range allows
for (const plan of LEAF_PLANS) for (const d of [...plan.pairs, plan.end]) if (d.length > LEAFLET_MOST * 1.02 || d.length < LEAFLET_LEAST * 0.7) throw new Error(`clematis-viticella-etoile-violette: a leaflet ${d.length} of the leaf is outside what leaf.leafletLengthM allows`);
if (LEAF_PLANS[0]!.pairs.length * 2 + 1 !== USUAL_LEAFLETS) throw new Error('clematis-viticella-etoile-violette: the usual leaf must have leaf.leafletCount leaflets');
if (BASAL_LEAFLETS !== 3) throw new Error('clematis-viticella-etoile-violette: a divided leaflet is drawn as three');
