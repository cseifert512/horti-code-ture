// Campsis x tagliabuana 'Madame Galen' (a trumpet vine): deciduous, clinging weakly by aerial rootlets.
//
//   leaf     a whole odd-pinnate leaf: a stalk, an arching grooved axis and 7, 9 or 11 ovate leaflets in
//            opposite pairs, each long-pointed and coarsely toothed, a vein running to every tooth. One
//            unit long along +Z, upper side +Y.
//   truss    a whole terminal panicle, as the render data gives it (one RenderFlower): an axis that
//            carries on the line of its shoot and nods over, branches in opposite pairs, 7, 9 or 12
//            flowers. Each open flower is a leathery five-toothed calyx (axis: it stays) and a trumpet
//            (a part: it opens and drops) with its four stamens and its style inside; the youngest
//            flowers, at the tip, are club-shaped buds. In metres; stands along +Y, droops towards -Z.
//   pod      one or two spindle-shaped capsules, ridged along their two seams, on the stalk of the old
//            truss. Hangs along -Y; green, drying to tan.
//   hold     a tuft of short rootlets in two rows, pressed to the surface the stem lies on
//   wood     green shoot, straw-coloured twig, pale tan bark that peels in thin strips
//
// Every count and measured size is read from species/campsis-x-tagliabueana-madame-galen/morphology.json,
// where each has its source; what is left here is appearance. Made from published descriptions, not from
// specimens or photographs.
//
// These shapes and colours are this plant's. No other taxon module may import this one.
import * as THREE from 'three';
import { characterNumber, characterRange, parseMorphology } from '@horti/core';
import morphologyJson from '../../../../../species/campsis-x-tagliabueana-madame-galen/morphology.json';
import { RNG, lerp, smoothstep } from '../../util.ts';
import { MIDRIB, Merge, type RGB, type Segs, Surf, type SurfPoint, WHITE, lin, mix } from '../kit.ts';
import { type AppendageAsset, type FlowerAsset, type FruitAsset, type LeafAsset, type TaxonLook, type WoodLook } from '../look.ts';

const morphology = parseMorphology(morphologyJson, 'species/campsis-x-tagliabueana-madame-galen/morphology.json');
const num = (key: string): number => characterNumber(morphology, key);
const range = (key: string): [number, number] => characterRange(morphology, key);
const mid = (r: readonly [number, number]): number => (r[0] + r[1]) / 2;

const TAU = Math.PI * 2;
const V3 = THREE.Vector3;
type V3 = THREE.Vector3;

/** A thin tube along `pts`, added to a Surf so that it belongs to the same part as the rest of that surface. `each` is told of every point as it is made. */
function tubeInto(sb: Surf, pts: readonly V3[], radii: readonly number[], radial: number, c0: Readonly<RGB>, c1: Readonly<RGB>, each?: (x: number, y: number, z: number) => void): void {
  const n = pts.length;
  const frames = pts.map((p, i) => {
    const t = new V3().subVectors(pts[Math.min(n - 1, i + 1)]!, pts[Math.max(0, i - 1)]!).normalize();
    const a = new V3(1, 0, 0);
    if (Math.abs(t.x) > 0.9) a.set(0, 0, 1);
    a.addScaledVector(t, -a.dot(t)).normalize();
    return { p, a, b: new V3().crossVectors(t, a) };
  });
  sb.surf(radial, n - 1, (u, v) => {
    const i = Math.round(v * (n - 1));
    const f = frames[i]!;
    const r = radii[i]!;
    const cos = Math.cos(u * TAU) * r;
    const sin = Math.sin(u * TAU) * r;
    const p: [number, number, number] = [f.p.x + f.a.x * cos + f.b.x * sin, f.p.y + f.a.y * cos + f.b.y * sin, f.p.z + f.a.z * cos + f.b.z * sin];
    each?.(p[0], p[1], p[2]);
    return { p, c: mix(c0, c1, v) };
  });
}

// ---------------------------------------------------------------------------
// Leaf
// ---------------------------------------------------------------------------
/** Leaflets to a leaf: the fewest, the usual number and the most that floras give. */
const [LEAFLETS_FEWEST, LEAFLETS_MOST] = range('leaf.leafletCount');
const LEAFLETS_USUAL = num('leaf.leafletCountUsual');
const LEAF_VARIANTS: readonly number[] = [LEAFLETS_FEWEST, LEAFLETS_USUAL, LEAFLETS_MOST];
const LEAF_LODS = 3;
/** Half the width of a leaflet for its length ("pinnae to 8 x 4.5 cm"). */
const LEAFLET_HALF_WIDTH = (0.5 * num('leaf.leafletWidthMaxM')) / num('leaf.leafletLengthMaxM');
const TEETH = num('leaf.leafletTeethPerSide');
/** The leaf stalk below the first pair of leaflets, in leaf lengths. */
const LEAF_STALK = num('leaf.stalkShareOfLength');
/** How far forward of square the side leaflets point, radians, from the lowest pair to the last. */
const LEAFLET_FORWARD: readonly [number, number] = [0.32, 0.62];
/** The length of the largest side leaflets, in leaf lengths: what gives the leaf its published width for its length. */
const LEAFLET_LENGTH = num('leaf.widthShareOfLength') / (2 * Math.cos(mid(LEAFLET_FORWARD)));
/** A leaflet's own stalk, in leaf lengths, for a leaf of middling size. */
const LEAFLET_STALK = num('leaf.leafletStalkLengthM') / mid(range('leaf.lengthM'));
/** How far the axis of the leaf arches down by its end, in leaf lengths. */
const LEAF_ARCH = 0.2;

interface LeafletRows {
  /** Where along the leaflet each row of points stands, base to tip. */
  v: number[];
  /** A row at the tip of a tooth, in the notch between two teeth, or neither. */
  kind: ('plain' | 'notch' | 'tooth')[];
}

/** The rows of the finest leaflet: two to a tooth, so that each tooth has a point and a notch behind it. */
function toothedRows(teeth: number): LeafletRows {
  const rows: LeafletRows = { v: [0], kind: ['plain'] };
  const from = 0.1;
  const to = 0.76;
  const step = (to - from) / teeth;
  for (let k = 0; k < teeth; k++) {
    rows.v.push(from + k * step, from + (k + 0.7) * step);
    rows.kind.push('notch', 'tooth');
  }
  // beyond the last tooth the blade runs out into its long entire point
  rows.v.push(to, 0.86, 0.94, 1);
  rows.kind.push('notch', 'plain', 'plain', 'plain');
  return rows;
}

const plainRows = (v: number[]): LeafletRows => ({ v, kind: v.map(() => 'plain') });
const LEAFLET_ROWS: readonly LeafletRows[] = [toothedRows(TEETH), plainRows([0, 0.1, 0.24, 0.4, 0.56, 0.72, 0.87, 1]), plainRows([0.02, 0.3, 1])];
const LEAFLET_ACROSS: readonly number[] = [6, 2, 2];

/** The outline of a leaflet: ovate, widest a third of the way up, rounded at the base and drawn out to a long point. 0 to 1. */
const leafletOutline = (() => {
  const raw = (v: number) => Math.pow(v, 0.55) * Math.pow(1 - v, 1.15) * (1 - 0.32 * smoothstep(0.5, 0.92, v));
  let most = 0;
  for (let i = 0; i <= 200; i++) most = Math.max(most, raw(i / 200));
  return (v: number) => raw(v) / most;
})();

/** One leaflet, base at the origin, tip at z = 1, upper side +Y. */
function makeLeaflet(lod: number): THREE.BufferGeometry {
  const sb = new Surf();
  const rows = LEAFLET_ROWS[lod]!;
  const nu = LEAFLET_ACROSS[lod]!;
  const nv = rows.v.length - 1;
  const fine = lod === 0;
  sb.surf(nu, nv, (u01, vj) => {
    const j = Math.round(vj * nv);
    const v = rows.v[j]!;
    const kind = rows.kind[j]!;
    const u = u01 * 2 - 1;
    const edge = Math.abs(u) > 0.999;
    // the coarser models have no teeth: they are drawn a little fuller, to cover as much
    let half = LEAFLET_HALF_WIDTH * leafletOutline(v) * (fine ? 1 : 1.04) + 0.004;
    let z = v;
    if (fine && edge) {
      // a tooth stands out and points forward, towards the tip of the leaflet; the notch behind it cuts in
      if (kind === 'tooth') {
        half = half * 1.08 + 0.014;
        z += 0.014;
      } else if (kind === 'notch') half *= 0.86;
    }
    // the base is a little fuller on one side than the other
    const x = u * half * (1 + 0.06 * u * (1 - v));
    // nearly flat, folded a little along the midrib, the long point curling down
    let y = 0.1 * Math.abs(x) - 0.12 * v * v - 0.07 * smoothstep(0.7, 1, v);
    if (fine) {
      // a vein runs out to each tooth and is sunk in the blade; the blade between two veins stands up
      const between = kind === 'notch' ? 1 : kind === 'tooth' ? -1 : 0;
      y += 0.003 * between * (1 - Math.abs(u)) * Math.abs(u) * 4;
      y += 0.012 * Math.sin(v * 8 + u * 2.2) * u * u;
    }
    return { p: [x, y, z] };
  });
  // the leaf texture runs base to tip by distance along the leaflet, not by row
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) sb.uv[2 * (j * (nu + 1) + i) + 1] = rows.v[j]!;
  return sb.build();
}

const leafletCache: THREE.BufferGeometry[] = [];

function makeLeafGeometry(variant: number, lod: number): THREE.BufferGeometry {
  leafletCache[lod] ??= makeLeaflet(lod);
  const leaflet = leafletCache[lod]!;
  const count = LEAF_VARIANTS[variant]!;
  const pairs = (count - 1) / 2;
  const rng = new RNG(4200 + variant * 37);
  const mg = new Merge(true);

  // a leaf of fewer leaflets is a shorter leaf of leaflets the same size, so each is a larger share of it
  const size = LEAFLET_LENGTH * Math.sqrt(LEAFLETS_USUAL / count);
  const endSize = size * 1.05;
  /** Where the axis ends and the end leaflet begins. */
  const axisEnd = 1 - endSize * 0.9;
  const axis = (z: number) => new V3(0, -LEAF_ARCH * (z / axisEnd) ** 2, z);
  const pitch = (z: number) => Math.atan((2 * LEAF_ARCH * z) / (axisEnd * axisEnd));

  const NS = [10, 4, 2][lod]!;
  const pts: V3[] = [];
  const radii: number[] = [];
  for (let i = 0; i <= NS; i++) {
    pts.push(axis((axisEnd * i) / NS));
    // stout where it joins the stem, slender at the end
    radii.push(0.0105 * (1 - 0.55 * (i / NS)) + (i === 0 ? 0.006 : 0));
  }
  mg.tube(pts, radii, [6, 4, 3][lod]!, WHITE, WHITE, MIDRIB);

  const AX = new V3(1, 0, 0);
  const AY = new V3(0, 1, 0);
  const AZ = new V3(0, 0, 1);
  const q = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const m = new THREE.Matrix4();
  const at = new V3();
  const scl = new V3();
  const put = (z: number, side: -1 | 0 | 1, sizeK: number, forward: number): void => {
    const base = axis(z);
    q.setFromAxisAngle(AX, pitch(z));
    q.multiply(q2.setFromAxisAngle(AY, side === 0 ? rng.range(-0.1, 0.1) : side * (Math.PI / 2 - forward)));
    // each hangs a little below the plane of the leaf, its outer half lowest
    q.multiply(q2.setFromAxisAngle(AX, rng.range(0.04, 0.26)));
    q.multiply(q2.setFromAxisAngle(AZ, rng.range(-0.18, 0.18) - side * 0.12));
    const s = sizeK * rng.range(0.95, 1.05);
    at.set(0, 0, LEAFLET_STALK).applyQuaternion(q).add(base);
    m.compose(at, q, scl.set(s, s, s));
    const tone = rng.range(0.92, 1.08);
    mg.add(leaflet, m, [tone, tone, tone], base, rng.f());
  };
  for (let i = 0; i < pairs; i++) {
    const along = pairs > 1 ? i / (pairs - 1) : 0;
    const z = lerp(LEAF_STALK, axisEnd * 0.97, along);
    // the lowest pair is the smallest; the pairs are not quite opposite
    const sizeK = size * lerp(0.74, 1, smoothstep(0, 0.45, along)) * lerp(1, 0.94, smoothstep(0.7, 1, along));
    const forward = lerp(LEAFLET_FORWARD[0], LEAFLET_FORWARD[1], along);
    const slip = rng.range(-0.008, 0.008);
    put(z + slip, -1, sizeK, forward + rng.range(-0.05, 0.05));
    put(z - slip, 1, sizeK, forward + rng.range(-0.05, 0.05));
  }
  put(axisEnd, 0, endSize, 0);
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, -0.1, 0.5), 0.8);
  return g;
}

// ---------------------------------------------------------------------------
// Flower. Metres. The origin is the base of the calyx, the tube runs along +Z, and +Y is the side of
// the two smaller upper lobes.
// ---------------------------------------------------------------------------
const TUBE = num('flower.tubeLengthM');
const THROAT_RADIUS = num('flower.throatWidthM') / 2;
const TUBE_BASE_RADIUS = num('flower.tubeBaseWidthM') / 2;
const LOBES = num('flower.lobeCount');
const LOBE_LENGTH = num('flower.lobeLengthM');
const STAMENS = num('flower.stamenCount');
const ANTHER = num('flower.antherLengthM');
const STYLE = num('flower.styleLengthM');
const CALYX = num('flower.calyxLengthM');
const CALYX_CUT = num('flower.calyxLobing');
/** The angle of the lowest lobe: the limb has three lobes below and two, a little smaller, above. */
const LOBE0 = -Math.PI / 2;
/** How far the limb reaches in the notch between two lobes, as a share of a lobe. */
const LOBE_NOTCH = 0.3;

const C = {
  tubeBase: lin('#f2b866'),
  tube: lin('#ee8c40'),
  throat: lin('#f7a94a'),
  limb: lin('#d94f32'),
  limbEdge: lin('#e3663f'),
  vein: lin('#a52a22'),
  calyxBase: lin('#93a052'),
  calyx: lin('#d98a3e'),
  calyxTip: lin('#c2632f'),
  filament: lin('#f3e7bd'),
  anther: lin('#e6d49a'),
  stigma: lin('#cdd58f'),
  budBase: lin('#efa450'),
  budTip: lin('#d94f38'),
  axisA: lin('#73843f'),
  axisB: lin('#8d8a45'),
  stalk: lin('#a09048'),
};

interface TrussSegs {
  /** Across one lobe and along the corolla. One across: a single sheet all the way round, a point to a lobe. */
  corolla: Segs;
  calyx: Segs | null;
  club: Segs;
  /** Sides of a flower stalk; 0 leaves the stalks out. */
  stalk: number;
  inside: boolean;
}
const TRUSS_SEGS: readonly TrussSegs[] = [
  { corolla: [6, 18], calyx: [4 * LOBES, 4], club: [12, 9], stalk: 5, inside: true },
  { corolla: [4, 10], calyx: [2 * LOBES, 2], club: [8, 5], stalk: 4, inside: false },
  { corolla: [2, 6], calyx: [LOBES, 1], club: [5, 3], stalk: 3, inside: false },
  { corolla: [1, 3], calyx: null, club: [4, 2], stalk: 0, inside: false },
];

/** Radius of the tube at a share `s` of its length: narrow where it stands in the calyx, then widening to the throat. */
const tubeRadius = (s: number): number => TUBE_BASE_RADIUS + (THROAT_RADIUS - TUBE_BASE_RADIUS) * (0.12 * s + 0.88 * Math.pow(smoothstep(0.3, 1, s), 1.3));
/** The tube curves up a little towards its mouth. */
const tubeLift = (z: number): number => 0.004 * (z / TUBE) ** 2;

/**
 * The limb in profile: from the throat it carries on the funnel, turns outwards
 * and at last a little back. For a share of the way out along a lobe, how far
 * out from the throat and how far forward, each as a share of the lobe; and
 * the other way about, the share of the way along at which it has gone a given
 * share of its whole way out.
 */
const limbProfile = (() => {
  const N = 48;
  const out = [0];
  const forward = [0];
  for (let i = 1; i <= N; i++) {
    const turn = 0.5 + 1.25 * Math.pow((i - 0.5) / N, 0.8);
    out.push(out[i - 1]! + Math.sin(turn) / N);
    forward.push(forward[i - 1]! + Math.cos(turn) / N);
  }
  const at = (w: number): { out: number; forward: number } => {
    const x = Math.min(N - 1e-6, Math.max(0, w * N));
    const i = Math.floor(x);
    return { out: lerp(out[i]!, out[i + 1]!, x - i), forward: lerp(forward[i]!, forward[i + 1]!, x - i) };
  };
  const whole = out[N]!;
  const alongAt = (share: number): number => {
    const want = Math.min(1, Math.max(0, share)) * whole;
    let i = 0;
    while (i < N - 1 && out[i + 1]! < want) i++;
    return (i + (want - out[i]!) / Math.max(1e-9, out[i + 1]! - out[i]!)) / N;
  };
  return { at, whole, alongAt };
})();

// The flower in bud. The organ program draws a part that has not opened at three tenths of its size
// about the point it is tagged with, and a part that has dropped at none. The corolla is therefore
// tagged point by point: each point of the tube with a place on the axis, each point of a lobe with a
// place on a line of that lobe's own. At three tenths the tube is then a slender neck, the five lobes
// are folded over one another into a dome, and the whole is a club standing out of the calyx; as the
// flower opens it swells and spreads into the trumpet; and when it drops, every sheet closes to a line.
/** How far up the closed corolla the throat stands, and where its top is. */
const BUD_THROAT = 0.04;
const BUD_TOP = 0.052;
/** Where the organ program draws a part that has not opened: this share of the way from its pivot to its place. */
const UNOPENED = 0.3;
/** How far the lobes of one flower reach out beyond the throat along their middle: the larger lower ones, the smaller upper ones. */
const lobeReach = (upper: boolean): number => LOBE_LENGTH * (upper ? 0.9 : 1);
/** The bud above its throat, for a share `q` of the way out along a lobe: how far from the axis the closed lobes stand, and how high. */
const budDome = (q: number, upper: boolean): { radius: number; z: number } => {
  const open = THROAT_RADIUS + q * lobeReach(upper) * limbProfile.whole;
  // it swells a little above the throat, then closes to a point
  const closed = (UNOPENED * THROAT_RADIUS + 0.008 * q) * (1 - Math.pow(q, 2.5));
  return { radius: Math.min(UNOPENED * open, closed), z: BUD_THROAT + (BUD_TOP - BUD_THROAT) * (1 - Math.pow(1 - q, 1.8)) };
};
/** Height on the axis that a point of the tube, a share `s` of the way up it, closes to. */
const tubePivot = (s: number): number => (s * (BUD_THROAT - UNOPENED * TUBE)) / (1 - UNOPENED);

interface Corolla {
  geometry: THREE.BufferGeometry;
  /** For each vertex, three numbers: the point it closes to, in the frame of the flower. Null: every vertex closes to the base of the flower. */
  pivots: number[] | null;
}

/** The trumpet, with the stamens and the style that stand in its upper side on the finest model. They drop with it. */
function makeCorolla(lod: number): Corolla {
  const sb = new Surf();
  const seg = TRUSS_SEGS[lod]!;
  const [across, along] = seg.corolla;
  const tubeRows = Math.round(along * 0.6);
  const sheets = across > 1;
  const pivots: number[] = [];
  /** One sheet of the corolla: the tube and the lobe of one fifth of it, or, on the coarsest model, the whole way round. */
  const sheet = (k: number) => (u: number, v: number): SurfPoint => {
    const i = Math.round(u * across);
    const j = Math.round(v * along);
    const middle = LOBE0 + (k * TAU) / LOBES;
    const off = sheets ? ((u - 0.5) * TAU) / LOBES : 0;
    const th = sheets ? middle + off : LOBE0 + u * TAU;
    // the two upper lobes are a little smaller
    const upper = Math.sin(sheets ? middle : th) > 0.5;
    let r: number;
    let z: number;
    let c: RGB;
    if (j <= tubeRows) {
      const s = j / tubeRows;
      r = tubeRadius(s);
      z = TUBE * s;
      c = mix(mix(C.tubeBase, C.tube, smoothstep(0.1, 0.55, s)), C.throat, 0.5 * smoothstep(0.75, 1, s));
      // the dark lines of the throat run a little way down the tube
      if (lod === 0 && i % 2 === 1) c = mix(c, C.vein, 0.42 * smoothstep(0.5, 1, s));
      pivots.push(0, 0, tubePivot(s));
    } else {
      const w = (j - tubeRows) / (along - tubeRows);
      // 1 along the middle of a lobe, 0 in the notch between two; the coarsest model has a point to a lobe and no notches
      const lobe = sheets ? Math.pow(Math.abs(Math.cos((LOBES * off) / 2)), 0.55) : 1;
      const reach = lobeReach(upper) * (LOBE_NOTCH + (1 - LOBE_NOTCH) * lobe) * (sheets ? 1 : 0.8);
      const p = limbProfile.at(w);
      r = THROAT_RADIUS + reach * p.out;
      z = TUBE + reach * p.forward;
      if (lod === 0) z += 0.0012 * Math.sin(off * 9 + k) * w * w * lobe;
      c = mix(mix(C.throat, C.limb, smoothstep(0, 0.45, w)), C.limbEdge, 0.6 * smoothstep(0.75, 1, w));
      if (lod === 0 && i % 2 === 1) c = mix(c, C.vein, 0.42 * (1 - smoothstep(0.25, 0.7, w)));
      // how far out this point is, as a share of the lobe's whole way out along its middle
      const q = (reach * p.out) / (lobeReach(upper) * limbProfile.whole);
      const dome = budDome(q, upper);
      // towards the far side of the axis, so that the lobes close over one another
      const shift = (UNOPENED * (THROAT_RADIUS + q * lobeReach(upper) * limbProfile.whole) - dome.radius) / (1 - UNOPENED);
      const zOpen = TUBE + lobeReach(upper) * limbProfile.at(limbProfile.alongAt(q)).forward;
      pivots.push(-shift * Math.cos(middle), -shift * Math.sin(middle), (dome.z - UNOPENED * zOpen) / (1 - UNOPENED));
    }
    return { p: [Math.cos(th) * r, Math.sin(th) * r + tubeLift(z), z], c };
  };
  if (sheets) {
    for (let k = 0; k < LOBES; k++) sb.surf(across, along, sheet(k));
  } else sb.surf(LOBES, along, sheet(0));
  const seamless = LOBES * (across + 1) * (along + 1);

  if (seg.inside) {
    // what stands inside the tube closes to the axis with the stretch of tube round it
    const inTube = (x: number, y: number, z: number): void => {
      void x;
      void y;
      pivots.push(0, 0, tubePivot(Math.min(1, z / TUBE)));
    };
    // two long stamens and two short, lying under the upper lobes, their anthers a little way below the mouth
    const reachOf = (k: number) => (k === 0 || k === STAMENS - 1 ? 0.05 : 0.057);
    for (let k = 0; k < STAMENS; k++) {
      const side = STAMENS > 1 ? (k / (STAMENS - 1)) * 2 - 1 : 0;
      const end = reachOf(k);
      const point = (z: number, out: number, up: number) => new V3(side * out * tubeRadius(z / TUBE), up * tubeRadius(z / TUBE) + tubeLift(z), z);
      const tip = point(end, 0.62, 0.52);
      tubeInto(sb, [point(0.012, 0.5, 0.2), point(0.034, 0.7, 0.55), tip], [0.0005, 0.0005, 0.00045], 3, C.filament, C.filament, inTube);
      // the two halves of an anther stand apart
      for (const half of [-1, 1]) tubeInto(sb, [tip, tip.clone().add(new V3(half * 0.45 * ANTHER, -0.0004, 0.85 * ANTHER))], [0.0009, 0.0007], 3, C.anther, C.anther, inTube);
    }
    const top = (z: number) => new V3(0, 0.74 * tubeRadius(z / TUBE) + tubeLift(z), z);
    const end = 0.008 + STYLE;
    tubeInto(sb, [new V3(0, 0.001, 0.006), top(0.03), top(end)], [0.0007, 0.0005, 0.0005], 3, C.stigma, C.filament, inTube);
    // the flattened stigma, of two lips
    for (const lip of [-1, 1]) tubeInto(sb, [top(end), top(end).add(new V3(0, lip * 0.0012, 0.003))], [0.0009, 0.0006], 3, C.stigma, C.stigma, inTube);
  }
  const geometry = sb.build();
  if (sheets) {
    // the five sheets meet edge to edge when the flower is open: shade them as one surface
    const normal = geometry.getAttribute('normal');
    const row = across + 1;
    const a = new V3();
    const b = new V3();
    for (let k = 0; k < LOBES; k++) {
      for (let j = 0; j <= along; j++) {
        const last = (k * seamless) / LOBES + j * row + across;
        const first = (((k + 1) % LOBES) * seamless) / LOBES + j * row;
        a.fromBufferAttribute(normal, last).add(b.fromBufferAttribute(normal, first)).normalize();
        normal.setXYZ(last, a.x, a.y, a.z);
        normal.setXYZ(first, a.x, a.y, a.z);
      }
    }
  }
  return { geometry, pivots: sheets ? pivots : null };
}

/** The calyx: a leathery bell, cut part of the way down into five pointed teeth that stand between the lobes of the corolla. */
function makeCalyx(segs: Segs): THREE.BufferGeometry {
  const sb = new Surf();
  const [around, along] = segs;
  sb.surf(around, along, (u, v) => {
    const th = LOBE0 + Math.PI / LOBES + u * TAU;
    const tooth = Math.abs(Math.cos((LOBES * u * TAU) / 2));
    const r = 0.0035 + 0.003 * Math.sin((Math.PI / 2) * Math.min(1, v / 0.5)) + 0.0009 * v * v * tooth;
    const z = CALYX * v * (1 - CALYX_CUT * (1 - tooth) * v * v * v);
    return { p: [Math.cos(th) * r, Math.sin(th) * r, z], c: mix(mix(C.calyxBase, C.calyx, smoothstep(0.05, 0.55, v)), C.calyxTip, smoothstep(0.7, 1, v) * tooth) };
  });
  return sb.build();
}

/** A flower that will still be in bud when the truss is over: the closed corolla, of the shape an opening flower has before it opens. */
function makeClub(segs: Segs): THREE.BufferGeometry {
  const sb = new Surf();
  const [around, along] = segs;
  sb.surf(around, along, (u, v) => {
    const th = u * TAU;
    const z = BUD_TOP * v;
    let r: number;
    let c: RGB;
    if (z <= BUD_THROAT) {
      const s = z / BUD_THROAT;
      r = UNOPENED * tubeRadius(s);
      c = mix(mix(C.tubeBase, C.tube, smoothstep(0.1, 0.55, s)), C.throat, 0.5 * smoothstep(0.75, 1, s));
    } else {
      const q = 1 - Math.pow(1 - (z - BUD_THROAT) / (BUD_TOP - BUD_THROAT), 1 / 1.8);
      r = budDome(q, false).radius;
      c = mix(C.throat, C.limb, smoothstep(0, 0.3, q));
    }
    // five-sided where the lobes are folded
    r *= 1 + 0.06 * Math.cos(LOBES * th) * smoothstep(0.6, 1, v);
    return { p: [Math.cos(th) * r, Math.sin(th) * r, z], c };
  });
  return sb.build();
}

// ---------------------------------------------------------------------------
// Truss. Metres. From the origin along +Y, which the viewer lays on the line of the shoot, nodding over
// towards -Z, which the viewer turns away from the sky.
// ---------------------------------------------------------------------------
/** Flowers to a truss: near the fewest floras give, a middling number, and the most. */
const [FLOWERS_FEWEST, FLOWERS_MOST] = range('inflorescence.flowerCount');
const TRUSS_FLOWERS: readonly number[] = [FLOWERS_FEWEST + 1, Math.round((FLOWERS_FEWEST + FLOWERS_MOST) / 2), FLOWERS_MOST];
const TRUSS_LODS = 4;
/** What RenderFlower.lengthM measures: from where the truss leaves its shoot to the mouths of its end flowers. */
const TRUSS_LENGTH = mid(range('inflorescence.lengthM'));
const TRUSS_AXIS = mid(range('inflorescence.axisLengthM'));
const FLOWER_STALK = num('inflorescence.flowerStalkLengthM');

interface TrussPlan {
  /** Length of the axis, as a share of the published length. */
  axis: number;
  /** How far the axis turns over by its end, radians. */
  nod: number;
  /** Pairs of branches up the axis: where, how long a branch is, and how many flowers each of the two carries. */
  nodes: readonly { at: number; branch: number; flowers: readonly [number, number] }[];
  /** How many of the last flowers are still clubs when the others are open. */
  clubs: number;
}
/** The lower branches carry a flower and one or two beside it; the upper ones a single flower; one flower ends the axis. */
const TRUSS_PLANS: readonly TrussPlan[] = [
  { axis: 0.86, nod: 0.95, clubs: 2, nodes: [{ at: 0.5, branch: 0.03, flowers: [1, 1] }, { at: 0.72, branch: 0.024, flowers: [1, 1] }, { at: 0.9, branch: 0.016, flowers: [1, 1] }] },
  { axis: 0.94, nod: 1.05, clubs: 3, nodes: [{ at: 0.45, branch: 0.034, flowers: [2, 2] }, { at: 0.68, branch: 0.026, flowers: [1, 1] }, { at: 0.88, branch: 0.016, flowers: [1, 1] }] },
  { axis: 1, nod: 1.15, clubs: 4, nodes: [{ at: 0.42, branch: 0.036, flowers: [3, 3] }, { at: 0.64, branch: 0.028, flowers: [2, 1] }, { at: 0.85, branch: 0.018, flowers: [1, 1] }] },
];
TRUSS_PLANS.forEach((plan, variant) => {
  const flowers = 1 + plan.nodes.reduce((n, node) => n + node.flowers[0] + node.flowers[1], 0);
  if (flowers !== TRUSS_FLOWERS[variant]) throw new Error(`campsis truss ${variant} is laid out for ${flowers} flowers, and morphology.json gives ${TRUSS_FLOWERS[variant]}`);
});

const corollaCache: Corolla[] = [];
const calyxCache: (THREE.BufferGeometry | null)[] = [];
const clubCache: THREE.BufferGeometry[] = [];

function makeTrussGeometry(variant: number, lod: number): THREE.BufferGeometry {
  const seg = TRUSS_SEGS[lod]!;
  corollaCache[lod] ??= makeCorolla(lod);
  if (calyxCache[lod] === undefined) calyxCache[lod] = seg.calyx ? makeCalyx(seg.calyx) : null;
  clubCache[lod] ??= makeClub(seg.club);
  const corolla = corollaCache[lod]!;
  const calyx = calyxCache[lod]!;
  const club = clubCache[lod]!;
  const plan = TRUSS_PLANS[variant]!;
  const rng = new RNG(7100 + variant * 53);
  const mg = new Merge(false);
  const sides = Math.max(3, seg.stalk);
  const DOWN = new V3(0, 0, -1);

  // the axis: straight out of the shoot, then nodding
  const STEPS = 40;
  const length = TRUSS_AXIS * plan.axis;
  const line: V3[] = [new V3(0, 0, 0)];
  const turnAt = (s: number) => plan.nod * Math.pow(s, 1.5);
  for (let i = 1; i <= STEPS; i++) {
    const a = turnAt((i - 0.5) / STEPS);
    line.push(line[i - 1]!.clone().add(new V3(0, Math.cos(a), -Math.sin(a)).multiplyScalar(length / STEPS)));
  }
  const axisAt = (s: number) => {
    const x = Math.min(STEPS - 1e-6, Math.max(0, s * STEPS));
    const i = Math.floor(x);
    return line[i]!.clone().lerp(line[i + 1]!, x - i);
  };
  const tangentAt = (s: number) => new V3(0, Math.cos(turnAt(s)), -Math.sin(turnAt(s)));
  const NS = [14, 8, 4, 3][lod]!;
  mg.tube(
    Array.from({ length: NS + 1 }, (_, i) => axisAt(i / NS)),
    Array.from({ length: NS + 1 }, (_, i) => lerp(0.0032, 0.0018, i / NS)),
    [6, 4, 3, 3][lod]!,
    C.axisA,
    C.axisB,
  );

  /** Where each flower stands, and which way it faces, in the order the flowers open. */
  const flowers: { at: V3; facing: V3 }[] = [];
  const stalkTo = (from: V3, heading: V3, reach: number, thick: number): V3 => {
    // a stalk sets out on its heading and sags a little under the flower
    const end = from.clone().addScaledVector(heading, reach).addScaledVector(DOWN, 0.12 * reach);
    if (seg.stalk) mg.tube([from.clone(), from.clone().addScaledVector(heading, 0.55 * reach).addScaledVector(DOWN, 0.02 * reach), end], [thick, thick * 0.9, thick * 1.05], sides, C.axisB, C.stalk);
    return end;
  };
  const facingFrom = (heading: V3, along: V3) => heading.clone().multiplyScalar(0.8).addScaledVector(along, 0.3).addScaledVector(DOWN, 0.24).normalize();

  plan.nodes.forEach((node, k) => {
    const from = axisAt(node.at);
    const along = tangentAt(node.at);
    // each pair of branches stands square to the pair below
    const square = k % 2 === 0 ? new V3(1, 0, 0) : new V3().crossVectors(new V3(1, 0, 0), along);
    square.applyAxisAngle(along, rng.range(-0.35, 0.35));
    const beside: { from: V3; heading: V3 }[] = [];
    for (const side of [0, 1] as const) {
      const out = square.clone().multiplyScalar(side === 0 ? 1 : -1);
      const lean = lerp(1.15, 0.9, k / Math.max(1, plan.nodes.length - 1)) + rng.range(-0.08, 0.08);
      const heading = out.clone().multiplyScalar(Math.sin(lean)).addScaledVector(along, Math.cos(lean)).normalize();
      const count = node.flowers[side];
      // the branch, and at its end the flower that opens first of its group
      const fork = stalkTo(from, heading, node.branch * rng.range(0.9, 1.1), 0.0021);
      const first = count > 1 ? stalkTo(fork, heading, FLOWER_STALK * rng.range(0.75, 1), 0.0017) : fork;
      flowers.push({ at: first, facing: facingFrom(heading, along) });
      const across = new V3().crossVectors(heading, along).normalize();
      for (let b = 1; b < count; b++) beside.push({ from: fork, heading: heading.clone().multiplyScalar(Math.cos(0.95)).addScaledVector(across, (b === 1 ? 1 : -1) * Math.sin(0.95)).normalize() });
    }
    // then the flowers that stand beside those
    for (const b of beside) flowers.push({ at: stalkTo(b.from, b.heading, FLOWER_STALK * rng.range(0.95, 1.2), 0.0017), facing: facingFrom(b.heading, along) });
  });
  // the flower that ends the axis opens last
  const tip = tangentAt(1);
  flowers.push({ at: stalkTo(axisAt(1), tip, FLOWER_STALK * 0.7, 0.0018), facing: tip.clone().addScaledVector(DOWN, 0.15).normalize() });

  const m = new THREE.Matrix4();
  const X = new V3();
  const Y = new V3();
  const scl = new V3();
  const SKY = new V3(0, 0, 1);
  const open = flowers.length - plan.clubs;
  flowers.forEach((flower, i) => {
    const Z = flower.facing;
    // the smaller upper lobes on the side of the sky, as far as the way the flower faces allows
    Y.copy(SKY).addScaledVector(Z, -SKY.dot(Z));
    if (Y.lengthSq() < 0.02) Y.set(0, 1, 0).addScaledVector(Z, -Z.y);
    Y.normalize();
    X.crossVectors(Y, Z);
    m.makeBasis(X, Y, Z);
    m.multiply(new THREE.Matrix4().makeRotationZ(rng.range(-0.3, 0.3)));
    const isClub = i >= open;
    // the youngest bud is the smallest
    const s = isClub ? lerp(1, 0.55, plan.clubs > 1 ? (i - open) / (plan.clubs - 1) : 0) * rng.range(0.95, 1.05) : rng.range(0.94, 1.05);
    m.scale(scl.set(s, s, s));
    m.setPosition(flower.at);
    const tone = rng.range(0.93, 1.07);
    const warm = rng.range(-0.035, 0.035);
    const tint: RGB = [tone * (1 + warm), tone, tone * (1 - warm)];
    // the calyx is there before the corolla shows and after it has dropped
    if (calyx) mg.add(calyx, m, [tone, tone, tone], flower.at, -1);
    const order = isClub ? lerp(0.84, 1, plan.clubs > 1 ? (i - open) / (plan.clubs - 1) : 1) : lerp(0.02, 0.72, open > 1 ? i / (open - 1) : 0);
    if (isClub) {
      mg.add(club, m, tint, flower.at, order);
      return;
    }
    const first = mg.n;
    mg.add(corolla.geometry, m, tint, flower.at, order);
    // each point of an opening flower closes to a place of its own (see the flower in bud, above)
    if (corolla.pivots) {
      for (let v = 0; 3 * v < corolla.pivots.length; v++) {
        X.set(corolla.pivots[3 * v]!, corolla.pivots[3 * v + 1]!, corolla.pivots[3 * v + 2]!).applyMatrix4(m);
        mg.part[4 * (first + v)] = X.x;
        mg.part[4 * (first + v) + 1] = X.y;
        mg.part[4 * (first + v) + 2] = X.z;
      }
    }
  });
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, 0.6 * length, -0.3 * length), 0.2);
  return g;
}

// ---------------------------------------------------------------------------
// Pod. Metres. Hangs along -Y from where the truss stood.
// ---------------------------------------------------------------------------
/** The length the pod is authored at; an instance is scaled to the length in the data. */
const POD_LENGTH = mid(range('fruit.lengthM'));
const POD_HALF_WIDTH = num('fruit.widthM') / 2;
const POD_LODS = 2;
const POD = { green: lin('#74923f'), shade: lin('#5f7c34'), seam: lin('#a8b86c'), stalk: lin('#8a8a52') };

function makePodGeometry(variant: number, lod: number): THREE.BufferGeometry {
  const mg = new Merge(false);
  const [around, along] = ([[14, 16], [6, 5]] as const)[lod]!;
  const one = (() => {
    const sb = new Surf();
    sb.surf(around, along, (u, v) => {
      const th = u * TAU;
      // a short stalk of its own, a stout middle, a pointed end
      // cigar-shaped: stout for most of its length, tapering to its stalk and to a point
      const body = Math.pow(Math.sin(Math.PI * Math.pow(0.04 + 0.96 * v, 0.9)), 0.55);
      // a little uneven over the rows of seeds
      const r = 0.0016 * (1 - v) + POD_HALF_WIDTH * body * smoothstep(0, 0.14, v) * (1 + 0.03 * Math.sin(v * 31));
      // round, a little flattened, with a low pale ridge along each of the two seams
      const seam = Math.pow(Math.abs(Math.cos(th)), 6);
      return {
        p: [Math.cos(th) * r * (1 + 0.05 * seam), -POD_LENGTH * v, Math.sin(th) * r * 0.9 + 0.012 * Math.sin(Math.PI * v) * Math.sin(Math.PI * v)],
        c: mix(mix(POD.green, POD.shade, 0.6 * smoothstep(0.55, 1, v)), POD.seam, 0.8 * Math.pow(seam, 3)),
      };
    });
    return sb.build();
  })();
  // what is left of the truss: its stalk, bent over by the weight
  const hang = [new V3(0, 0, 0), new V3(0.004, -0.014, 0.002), new V3(0.002, -0.032, 0)];
  mg.tube(hang, [0.0024, 0.0021, 0.002], [5, 3][lod]!, POD.stalk, POD.stalk);
  const m = new THREE.Matrix4();
  const e = new THREE.Euler();
  // x, y, z, rx, ry, rz, scale
  const pods: readonly (readonly [number, number, number, number, number, number, number])[] = variant === 0 ? [[0.002, -0.032, 0, 0.06, 0.4, 0.05, 1]] : [[0.002, -0.032, 0, 0.1, 0.2, 0.16, 1], [0.003, -0.022, 0.001, -0.14, 2.6, -0.2, 0.86]];
  for (const [x, y, z, rx, ry, rz, s] of pods) {
    m.makeRotationFromEuler(e.set(rx, ry, rz));
    m.scale(new V3(s, s, s));
    m.setPosition(x, y, z);
    mg.add(one, m, [1, 1, 1], new V3(x, y, z), 0);
  }
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, -0.08, 0), 0.1);
  return g;
}

// ---------------------------------------------------------------------------
// The hold: a tuft of rootlets below a node, on the side of the stem that lies on the timber. One unit
// is the length of a rootlet. The origin is on the surface, under the stem; +Z runs into the surface.
// Each rootlet runs out over the surface from under the stem and its end turns into it.
// ---------------------------------------------------------------------------
const ROOTLET_ROWS = num('holdfast.rows');
const ROOTLETS_PER_ROW = num('holdfast.rootletsPerRow');
const ROOTLET_LODS = 2;
const ROOTLET = { base: lin('#cdbd92'), tip: lin('#a78f62') };

function makeRootletsGeometry(variant: number, lod: number): THREE.BufferGeometry {
  const mg = new Merge(false);
  const rng = new RNG(9300 + variant * 11);
  const each = lod === 0 ? ROOTLETS_PER_ROW : 2;
  for (let row = 0; row < ROOTLET_ROWS; row++) {
    // one row to each side of the stem
    const side = ROOTLET_ROWS > 1 ? (row / (ROOTLET_ROWS - 1)) * 2 - 1 : 1;
    for (let k = 0; k < each; k++) {
      const f = each > 1 ? k / (each - 1) - 0.5 : 0;
      // the row runs along the stem; its rootlets fan out from it
      const fan = f * 2.3 + rng.range(-0.12, 0.12);
      const out = new V3(side * Math.cos(fan), Math.sin(fan), 0);
      const from = new V3(side * 0.12, f * 1.3 + rng.range(-0.06, 0.06), -0.07);
      const reach = rng.range(0.78, 1.08);
      const pts = [from, from.clone().addScaledVector(out, 0.5 * reach).setZ(-0.1), from.clone().addScaledVector(out, reach).setZ(-0.03), from.clone().addScaledVector(out, reach + 0.1).setZ(0.9)];
      if (lod === 0) mg.tube(pts, [0.09, 0.075, 0.055, 0.02], 3, ROOTLET.base, ROOTLET.tip);
      else mg.tube([pts[0]!, pts[2]!, pts[3]!], [0.095, 0.06, 0.02], 3, ROOTLET.base, ROOTLET.tip);
    }
  }
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, 0, 0.3), 1.6);
  return g;
}

// ---------------------------------------------------------------------------
// The look
// ---------------------------------------------------------------------------
const leaf: LeafAsset = {
  key: 'campsis-x-tagliabueana-madame-galen/leaf',
  variants: LEAF_VARIANTS.length,
  lods: LEAF_LODS,
  make: makeLeafGeometry,
  budget: [2300, 360, 136],
  // a short leaf has the fewest leaflets; of the rest most have the usual number
  pick: (lengthM, r) => (lengthM < 0.23 ? 0 : r < 0.7 ? 1 : 2),
  // dark and somewhat shiny; bronze-tinged as it unfolds; yellow-green, never bright, before it drops
  palette: { greenA: lin('#30581f'), greenB: lin('#3d6a26'), young: lin('#8a7a3c'), autumnA: lin('#c9c04a'), autumnB: lin('#a9a03a') },
  roughness: 0.42,
  translucency: 0.4,
  detailReach: 1,
};

const truss: FlowerAsset = {
  key: 'campsis-x-tagliabueana-madame-galen/truss',
  variants: TRUSS_PLANS.length,
  lods: TRUSS_LODS,
  make: makeTrussGeometry,
  budget: [14000, 4700, 1450, 420],
  pick: (r) => Math.floor(r * TRUSS_PLANS.length),
  authoredSize: TRUSS_LENGTH,
  poise: 'held',
  centreAlong: 0.6,
  // a flower that has not opened shows a little colour at the mouth of its calyx
  budTint: [0.86, 0.78, 0.6],
  swing: 0.3,
  translucency: 0.32,
  sheen: 0.04,
  detailAt: [1.2, 3, 6.5],
  detailCaps: [14, 70, 420],
};

const pod: FruitAsset = {
  key: 'campsis-x-tagliabueana-madame-galen/pod',
  variants: 2,
  lods: POD_LODS,
  make: makePodGeometry,
  budget: [1000, 140],
  // one pod more often than a pair
  pick: (r) => (r < 0.7 ? 0 : 1),
  authoredSize: POD_LENGTH,
  poise: 'hangs',
  centreAlong: 0.7,
  // green, drying to tan, the seams paler
  ripe: lin('#9a7748'),
  ripeShade: [0.55, 1.5],
  roughness: 0.85,
  swing: 0.35,
  detailAt: [2.5],
  detailCaps: [40],
};

const clingingRoots: AppendageAsset = {
  key: 'campsis-x-tagliabueana-madame-galen/aerial-roots',
  variants: 2,
  lods: ROOTLET_LODS,
  make: makeRootletsGeometry,
  budget: [280, 56],
  pick: (r) => (r < 0.5 ? 0 : 1),
  // pale when new, drying brown
  aged: lin('#8a6a44'),
  agedDays: [90, 500],
  roughness: 0.95,
  swing: 0,
  detailAt: [1],
  detailCaps: [240],
};

/** From descriptions: a green hairless shoot, straw-coloured by its first winter, then light tan bark that peels in thin strips. */
const wood: WoodLook = {
  young: lin('#6f8a45'),
  mature: lin('#b59a62'),
  old: [0.84, 0.7, 0.5],
  woodyDays: [80, 260],
  oldDays: [520, 1700],
  furrowDays: [420, 2200],
  furrow: 0.6,
  stiffDays: [40, 300],
  relief: 4,
  roughness: 0.95,
  // long thin strips
  grain: { streaks: 600, width: 2.4, wobble: 9 },
};

export const look: TaxonLook = {
  taxonId: 'campsis-x-tagliabueana-madame-galen',
  provisional: false,
  leaves: { default: leaf },
  flowers: { default: truss },
  fruits: { default: pod },
  appendages: { aerial_roots: clingingRoots },
  wood,
};
