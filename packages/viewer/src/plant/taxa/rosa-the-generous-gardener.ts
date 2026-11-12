// Rosa 'The Generous Gardener' ('Ausdrawn'), David Austin's English climbing
// rose: a scrambler whose long canes are tied in by the gardener, and which
// flowers in summer and autumn at the ends of leafy side shoots.
//
//   leaf      an odd-pinnate leaf of three, five or seven ovate, toothed
//             leaflets, the side ones nearly stalkless in pairs, the end one
//             the largest on a stalk of its own; a pair of stipules joined to
//             the foot of the leaf stalk. Unit length along +Z, upper side +Y.
//   spray     what ends a side shoot: one to three flowers and a bud or two,
//             each on its own stalk, the end flower opening first. A flower is
//             a cup of forty to fifty petals in six rows, palest pink outside and a
//             warmer pink in the heart, opening wide round a ring of golden
//             stamens; it nods. Authored in metres at the middle of the
//             spray's width, which is what the render data gives.
//   hips      one to three round hips, green then orange, each crowned with
//             its dried sepals. Authored in metres at the middle hip length.
//   prickle   a hooked prickle, broad-based and flattened along the stem, red
//             on a young cane and greying with it
//   wood      a red shoot that is green within weeks and stays green for
//             years; old canes grey-brown
//
// The spray is drawn by the program written for a raceme. Every petal is a
// part of it, tagged with when it opens: the petals of one flower open
// together, the outer ones first, and the flowers one after another. The
// stalks, calyx and stamens are its axis and stay when the petals have gone. A
// bud that does not open while the spray is in flower is a part tagged later
// than the program ever reaches, so it is drawn small and closed throughout.
//
// Counts and sizes of the real plant are read from
// species/rosa-the-generous-gardener/morphology.json. Proportions that only
// shape the drawing (how far a petal curls, how a stalk bends) are here. Made
// from descriptions, not from specimens. These shapes and colours are this
// rose's alone.
import * as THREE from 'three';
import { characterNumber, characterRange, parseMorphology } from '@horti/core';
import morphologyJson from '../../../../../species/rosa-the-generous-gardener/morphology.json';
import { RNG, hash2, lerp, smoothstep } from '../../util.ts';
import { MIDRIB, Merge, type RGB, type Segs, Surf, WHITE, across, lin, mix } from '../kit.ts';
import type { AppendageAsset, FlowerAsset, FruitAsset, LeafAsset, TaxonLook, WoodLook } from '../look.ts';

const morphology = parseMorphology(morphologyJson, 'species/rosa-the-generous-gardener/morphology.json');

const V3 = THREE.Vector3;
type V3 = THREE.Vector3;
const TAU = Math.PI * 2;
const RAD = Math.PI / 180;
const IDENTITY = new THREE.Matrix4();
const mid = (range: readonly [number, number]): number => (range[0] + range[1]) / 2;
const v3 = (x: number, y: number, z: number): V3 => new V3(x, y, z);

// ---------------------------------------------------------------------------
// Leaf
// ---------------------------------------------------------------------------
/** Leaflets of the usual leaves (five or seven) and of the reduced leaves under a flower (three). */
const LEAFLETS_USUAL = characterRange(morphology, 'leaf.leafletCount');
const LEAFLETS_UNDER_FLOWER = characterNumber(morphology, 'leaf.leafletCountUnderFlower');
/** Leaflets per variant. */
const LEAF_VARIANTS: readonly number[] = [LEAFLETS_UNDER_FLOWER, LEAFLETS_USUAL[0], LEAFLETS_USUAL[1]];
/** Width of a leaflet for its length. */
const LEAFLET_WIDTH = characterNumber(morphology, 'leaf.leafletWidthToLength');
const LEAF_LODS = 3;
const LEAFLET_SEGS: Segs[] = [
  [4, 28],
  [4, 6],
  [2, 3],
];

/**
 * One leaflet, base at the origin, tip at z = 1: ovate, rounded at the base,
 * short-pointed, folded a little along the midrib. On the finest model the
 * margin is cut into forward-pointing teeth.
 */
function leafletBlade(lod: number): THREE.BufferGeometry {
  const sb = new Surf();
  const [nu, nv] = LEAFLET_SEGS[lod]!;
  const fine = lod === 0;
  sb.surf(nu, nv, (u01, v) => {
    const u = u01 * 2 - 1;
    // seen from far off a leaflet is drawn a little broader, to keep the mass of the foliage
    let half = (lod === 2 ? 0.58 : 0.5) * LEAFLET_WIDTH * Math.pow(Math.sin(Math.PI * Math.pow(v, 0.72)), 0.8) + 0.004;
    let z = v;
    if (fine && Math.abs(u) > 0.999 && v > 0.04 && v < 0.98) {
      // serrate: every other point of the margin is a notch, and the tooth between leans towards the tip
      if (Math.round(v * nv) % 2 === 0) half *= 0.88;
      else z += 0.5 / nv;
    }
    const x = u * half;
    let y = 0.2 * Math.abs(x) - 0.1 * v * v;
    // the blade is raised a little between its side veins
    if (fine) y += 0.012 * Math.sin(v * 24) * (1 - Math.abs(u)) * Math.abs(u) * 4;
    return { p: [x, y, z] };
  });
  return sb.build();
}

/** Where the leaflets stand along the leaf: the pairs, the end of the axis, and the lengths of the side and end leaflets. */
interface LeafPlan {
  pairs: readonly number[];
  axisEnd: number;
  side: number;
  end: number;
}
function leafPlan(leaflets: number): LeafPlan {
  if (leaflets <= 3) return { pairs: [0.3], axisEnd: 0.52, side: 0.4, end: 0.48 };
  if (leaflets <= 5) return { pairs: [0.24, 0.43], axisEnd: 0.6, side: 0.33, end: 0.4 };
  return { pairs: [0.2, 0.355, 0.51], axisEnd: 0.655, side: 0.285, end: 0.345 };
}

/** The line of the leaf stalk and axis: out, and arching over towards the tip. */
const axisAt = (s: number): V3 => v3(0, 0.05 * s - 0.3 * s * s, s);
/** How far the axis has turned downwards at `s`, radians. */
const axisPitch = (s: number): number => Math.atan(0.6 * s - 0.05);

const leafletCache: THREE.BufferGeometry[] = [];

function makeLeafGeometry(variant: number, lod: number): THREE.BufferGeometry {
  leafletCache[lod] ??= leafletBlade(lod);
  const blade = leafletCache[lod]!;
  const leaflets = LEAF_VARIANTS[variant]!;
  const plan = leafPlan(leaflets);
  const rng = new RNG(900 + variant * 37);
  const mg = new Merge(true);
  const radial = [6, 4, 3][lod]!;

  // stalk and axis, grooved above in life; here a tapering rod
  const NS = [10, 4, 2][lod]!;
  const pts: V3[] = [];
  const radii: number[] = [];
  for (let i = 0; i <= NS; i++) {
    const f = i / NS;
    pts.push(axisAt(f * plan.axisEnd));
    radii.push(0.0115 * (1 - 0.5 * f) + (i === 0 ? 0.005 : 0));
  }
  mg.tube(pts, radii, radial, WHITE, WHITE, MIDRIB);

  // stipules: a wing each side of the foot of the stalk, joined to it, the tip free and turned outwards
  if (lod < 2) {
    const sb = new Surf();
    for (const side of [-1, 1]) {
      sb.surf(1, lod === 0 ? 5 : 2, (u, v) => {
        const s = v * 0.17;
        const free = Math.max(0, s - 0.115);
        const wing = 0.026 * Math.pow(Math.sin(Math.PI * Math.min(1, v)), 0.6);
        const inner = side * (0.006 + free * 0.55);
        const at = axisAt(s);
        // the wing tilts up a little from the stalk
        return { p: [inner + side * wing * u, at.y + 0.004 + 0.3 * wing * u, s] };
      });
    }
    mg.add(sb.build(), IDENTITY, WHITE, v3(0, 0, 0), -1);
  }

  const AX = v3(1, 0, 0);
  const AY = v3(0, 1, 0);
  const AZ = v3(0, 0, 1);
  const q = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const m = new THREE.Matrix4();
  const put = (s: number, side: -1 | 0 | 1, length: number): void => {
    const from = axisAt(s);
    q.setFromAxisAngle(AX, axisPitch(s));
    // a side leaflet stands off the axis and leans towards the tip; the end one carries the axis on
    const yaw = side === 0 ? rng.range(-0.12, 0.12) : side * (Math.PI / 2 - rng.range(0.42, 0.62));
    q.multiply(q2.setFromAxisAngle(AY, yaw));
    q.multiply(q2.setFromAxisAngle(AX, side === 0 ? rng.range(0.02, 0.14) : rng.range(0.04, 0.22)));
    q.multiply(q2.setFromAxisAngle(AZ, rng.range(-0.18, 0.18) - side * 0.16));
    // the side leaflets sit almost on the axis
    const stalk = side === 0 ? 0 : 0.012;
    const base = from.clone().add(v3(Math.sin(yaw) * stalk, 0, Math.cos(yaw) * stalk));
    const size = length * rng.range(0.94, 1.06);
    m.compose(base, q, v3(size, size, size));
    const tone = rng.range(0.92, 1.08);
    mg.add(blade, m, [tone, tone, tone], base, rng.f());
  };
  plan.pairs.forEach((s, i) => {
    // the lowest pair is the smallest
    const size = plan.side * (i === 0 && plan.pairs.length > 1 ? 0.84 : 1);
    put(s, -1, size);
    put(s, 1, size);
  });
  put(plan.axisEnd, 0, plan.end);

  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(v3(0, 0, 0.5), 0.8);
  return g;
}

// ---------------------------------------------------------------------------
// The flower. Metres. A flower is built round its own axis `a`, which points
// out of its face, from `top`, the top of the swelling under it.
// ---------------------------------------------------------------------------
/** The middle of the breeder's bloom size: the width one flower is authored at. */
const BLOOM = mid(characterRange(morphology, 'flower.diameterM'));
const R = BLOOM / 2;
/** The middle of the spray's width, which is what the render data's length measures: the size the spray is authored at. */
const SPRAY_WIDTH = mid(characterRange(morphology, 'inflorescence.widthM'));
/** Petals to a flower: the middle of the range the plant record gives. */
const PETALS = Math.round(mid(characterRange(morphology, 'flower.petalCount')));
const SEPALS = characterNumber(morphology, 'flower.sepalCount');
/** Buds to a spray, at most. */
const SPRAY_FLOWERS = characterRange(morphology, 'inflorescence.flowerCount');

const ROSE = {
  outer: lin('#fad3d1'),
  middle: lin('#f6b9bf'),
  heart: lin('#ee98a8'),
  claw: lin('#f6c99a'),
  rim: lin('#fde3df'),
  bud: lin('#f3a6b6'),
  budTip: lin('#e97f98'),
  anther: lin('#d99a1e'),
  filament: lin('#efe2a0'),
  styles: lin('#cfc67c'),
  sepal: lin('#5f7d3a'),
  sepalTip: lin('#7d8a4a'),
  hip: lin('#6f8f3c'),
  stalk: lin('#6c8440'),
  stalkFlushed: lin('#8a7448'),
};

/**
 * The rows of petals, outside in: share of the petals, length (in flower
 * radii), half-width (of the length), the angle from the flower's axis at
 * which a petal leaves the base and the angle it has turned to near its tip
 * (degrees: a cup), how far the rim rolls back out, and how far towards the
 * colour of the heart it is.
 */
interface Row {
  share: number;
  length: number;
  wide: number;
  from: number;
  to: number;
  roll: number;
  heart: number;
}
const ROWS: readonly Row[] = [
  { share: 0.09, length: 1.12, wide: 0.5, from: 80, to: 44, roll: 18, heart: 0 },
  { share: 0.145, length: 1.04, wide: 0.47, from: 72, to: 36, roll: 11, heart: 0.18 },
  { share: 0.18, length: 0.93, wide: 0.44, from: 62, to: 28, roll: 6, heart: 0.42 },
  { share: 0.2, length: 0.8, wide: 0.43, from: 52, to: 20, roll: 2, heart: 0.66 },
  { share: 0.2, length: 0.65, wide: 0.43, from: 42, to: 12, roll: 0, heart: 0.86 },
  { share: 0.185, length: 0.46, wide: 0.46, from: 32, to: 4, roll: -4, heart: 1 },
];

/** `total` petals shared among the rows, every one accounted for. */
function petalsPerRow(total: number): number[] {
  const exact = ROWS.map((r) => r.share * total);
  const counts = exact.map(Math.floor);
  let left = total - counts.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => ({ i, rest: x - Math.floor(x) })).sort((p, q) => q.rest - p.rest);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) counts[order[k]!.i]!++;
  return counts;
}

/** How far along a petal it is broadest. */
const BROADEST = 0.6;

/** One petal as a sheet, from `base` out along `er` and up the axis `a`, cupped towards the heart of the flower. */
function petalSheet([nu, nv]: Segs, base: V3, a: V3, er: V3, et: V3, row: Row, widen: number, seed: number, fine: boolean): THREE.BufferGeometry {
  const length = row.length * R;
  const half = row.wide * length * widen;
  // the centre line: it leaves the base spreading and turns up into the cup; the rim of an outer petal rolls back
  const STEPS = 14;
  const line: V3[] = [base.clone()];
  const angle: number[] = [];
  const turn = (v: number): number => (row.from + (row.to - row.from) * smoothstep(0, 0.8, v) + row.roll * smoothstep(0.72, 1, v)) * RAD;
  for (let i = 0; i <= STEPS; i++) angle.push(turn(i / STEPS));
  for (let i = 1; i <= STEPS; i++) {
    const b = (angle[i - 1]! + angle[i]!) / 2;
    line.push(line[i - 1]!.clone().addScaledVector(er, (Math.sin(b) * length) / STEPS).addScaledVector(a, (Math.cos(b) * length) / STEPS));
  }
  const colour = mix(mix(ROSE.outer, ROSE.middle, Math.min(1, row.heart * 2)), ROSE.heart, Math.max(0, row.heart * 2 - 1));
  const wave = hash2(seed, 3) * TAU;
  const sb = new Surf();
  sb.surf(nu, nv, (u01, row01) => {
    const u = u01 * 2 - 1;
    // the rows of the sheet are gathered towards the rim, where the outline turns fastest
    const v = 1 - Math.pow(1 - row01, 1.6);
    const x = Math.min(STEPS - 1e-6, v * STEPS);
    const i = Math.floor(x);
    const f = x - i;
    const c = line[i]!.clone().lerp(line[i + 1]!, f);
    const b = lerp(angle[i]!, angle[i + 1]!, f);
    // narrow at the claw, broadest beyond the middle, and rounded off across the top
    const w = half * (v < BROADEST ? lerp(0.24, 1, smoothstep(0, BROADEST, v)) : Math.sqrt(Math.max(0, 1 - Math.pow((v - BROADEST) / (1 - BROADEST), 2)))) + 0.0003;
    // the normal that looks into the cup
    const nx = -Math.cos(b);
    const na = Math.sin(b);
    let lift = 0.42 * w * u * u;
    // the rim is a little uneven, no two petals alike
    if (fine) lift += 0.03 * length * Math.sin(u * 2.1 + wave) * smoothstep(0.45, 1, v);
    // a shallow notch in the middle of the rim
    const notch = fine ? 0.05 * length * Math.exp(-Math.pow(u / 0.35, 2)) * smoothstep(0.8, 1, v) : 0;
    const p = c
      .addScaledVector(et, u * w)
      .addScaledVector(er, nx * lift - Math.sin(b) * notch)
      .addScaledVector(a, na * lift - Math.cos(b) * notch);
    // warm at the claw, palest at the rim
    let col = mix(ROSE.claw, colour, smoothstep(0.02, 0.34, v));
    col = mix(col, ROSE.rim, 0.45 * smoothstep(0.62, 1, v) * (1 - 0.6 * row.heart));
    return { p: [p.x, p.y, p.z], c: col };
  });
  return sb.build();
}

/** A body of revolution round `a` from `from`: `profile(v)` gives the radius and the height along the axis. */
function turned([around, along]: Segs, from: V3, a: V3, profile: (v: number) => readonly [number, number], colour: (u: number, v: number) => Readonly<RGB>): THREE.BufferGeometry {
  const [e1, e2] = across(a);
  const sb = new Surf();
  sb.surf(around, along, (u, v) => {
    const th = u * TAU;
    const [r, h] = profile(v);
    const p = from
      .clone()
      .addScaledVector(a, h)
      .addScaledVector(e1, Math.cos(th) * r)
      .addScaledVector(e2, Math.sin(th) * r);
    return { p: [p.x, p.y, p.z], c: colour(u, v) };
  });
  return sb.build();
}

/** A sepal: a narrow leafy point from `base`, leaving the axis at `from` degrees and turned to `to` by its tip. */
function sepalSheet([nu, nv]: Segs, base: V3, a: V3, er: V3, et: V3, length: number, half: number, from: number, to: number): THREE.BufferGeometry {
  const sb = new Surf();
  sb.surf(nu, nv, (u01, v) => {
    const u = u01 * 2 - 1;
    // the line bends evenly from one angle to the other
    const b0 = from * RAD;
    const b1 = to * RAD;
    const b = lerp(b0, b1, v);
    const k = Math.abs(b1 - b0) < 1e-4 ? 1 : 1 / (b1 - b0);
    const out = Math.abs(b1 - b0) < 1e-4 ? Math.sin(b0) * v : (Math.cos(b0) - Math.cos(b)) * k;
    const up = Math.abs(b1 - b0) < 1e-4 ? Math.cos(b0) * v : (Math.sin(b) - Math.sin(b0)) * k;
    // lance-shaped, drawn out into a long point
    const w = half * Math.pow(1 - v, 0.7) * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, v * 1.6 + 0.2)));
    const p = base
      .clone()
      .addScaledVector(er, out * length - Math.cos(b) * 0.25 * w * u * u)
      .addScaledVector(a, up * length + Math.sin(b) * 0.25 * w * u * u)
      .addScaledVector(et, u * w);
    return { p: [p.x, p.y, p.z], c: mix(ROSE.sepal, ROSE.sepalTip, v) };
  });
  return sb.build();
}

/** Segments of a petal, how many of the petals are drawn and how much wider each is, by level of detail. */
const BLOOM_DETAIL: readonly { petal: Segs; share: number; widen: number }[] = [
  { petal: [6, 8], share: 1, widen: 1 },
  { petal: [2, 3], share: 1, widen: 1 },
  { petal: [2, 2], share: 0.4, widen: 1.5 },
];

/**
 * An open flower with its calyx. `opens` is when in the spray's opening it
 * opens (0 first). The petals are parts, pivoting on `top`, so that an
 * unopened flower is the whole corolla drawn small in the calyx; calyx,
 * stamens and the swelling under the flower are axis and stay.
 */
function addBloom(mg: Merge, lod: number, top: V3, a: V3, opens: number, seed: number): void {
  const [e1, e2] = across(a);
  const ring = (theta: number): [V3, V3] => [e1.clone().multiplyScalar(Math.cos(theta)).addScaledVector(e2, Math.sin(theta)), e1.clone().multiplyScalar(-Math.sin(theta)).addScaledVector(e2, Math.cos(theta))];

  if (lod >= 3) {
    // far off: three cups, one inside another, and the gold in the middle
    const cups: readonly { r: readonly number[]; h: readonly number[]; c: Readonly<RGB>; rim: Readonly<RGB>; around: number }[] = [
      { r: [0.14, 0.82, 1.0], h: [0, 0.3, 0.6], c: ROSE.outer, rim: ROSE.rim, around: 6 },
      { r: [0.1, 0.55, 0.68], h: [0.03, 0.4, 0.74], c: ROSE.middle, rim: ROSE.outer, around: 6 },
      { r: [0.06, 0.3, 0.36], h: [0.06, 0.48, 0.7], c: ROSE.heart, rim: ROSE.middle, around: 5 },
    ];
    cups.forEach((cup, i) => {
      const g = turned(
        [cup.around, 2],
        top,
        a,
        (v) => {
          const k = v * 2;
          const j = Math.min(1, Math.floor(k));
          return [lerp(cup.r[j]!, cup.r[j + 1]!, k - j) * R, lerp(cup.h[j]!, cup.h[j + 1]!, k - j) * R];
        },
        (_u, v) => mix(mix(ROSE.claw, cup.c, Math.min(1, v * 3)), cup.rim, 0.5 * Math.max(0, v * 2 - 1)),
      );
      mg.add(g, IDENTITY, WHITE, top, opens + 0.03 * i);
    });
    mg.add(turned([5, 1], top, a, (v) => [0.26 * R * (1 - v), 0.12 * R + 0.1 * R * v], () => ROSE.anther), IDENTITY, WHITE, top, -1);
    return;
  }

  const detail = BLOOM_DETAIL[lod]!;
  const counts = petalsPerRow(PETALS).map((n) => Math.max(3, Math.round(n * detail.share)));
  let index = 0;
  counts.forEach((n, r) => {
    const row = ROWS[r]!;
    for (let k = 0; k < n; k++) {
      const theta = (k / n) * TAU + r * 0.83 + seed * 0.37 + (hash2(seed + r * 7, k) - 0.5) * (1.6 / n);
      const [er, et] = ring(theta);
      const base = top.clone().addScaledVector(er, (0.05 + 0.02 * r) * R);
      const petal = petalSheet(detail.petal, base, a, er, et, row, detail.widen, seed * 31 + index, lod === 0);
      const tone = 0.96 + 0.08 * hash2(seed + 11, index);
      // every petal has a moment of its own, the outer rows first
      mg.add(petal, IDENTITY, [tone, tone, tone], top, opens + (0.11 * index) / Math.max(1, PETALS));
      index++;
    }
  });

  // calyx: the sepals stand out under the cup, their long points turned up
  if (lod < 2) {
    for (let i = 0; i < SEPALS; i++) {
      const [er, et] = ring((i / SEPALS) * TAU + 0.4 + seed);
      const base = top.clone().addScaledVector(er, 0.1 * R).addScaledVector(a, -0.03 * R);
      mg.add(sepalSheet(lod === 0 ? [2, 5] : [1, 2], base, a, er, et, 0.66 * R, 0.13 * R, 96, 62), IDENTITY, WHITE, base, -1);
    }
    // the swelling under the flower, which becomes the hip
    const under = top.clone().addScaledVector(a, -0.3 * R);
    mg.add(
      turned(lod === 0 ? [8, 4] : [5, 2], under, a, (v) => [R * (0.045 + 0.095 * Math.pow(Math.sin(Math.PI * (0.08 + 0.7 * v)), 0.8)), 0.3 * R * v], (_u, v) => mix(ROSE.hip, ROSE.sepal, v)),
      IDENTITY,
      WHITE,
      top,
      -1,
    );
  }

  // the ring of stamens round the styles, which the open flower shows
  if (lod < 2) {
    const count = lod === 0 ? 38 : 14;
    for (let i = 0; i < count; i++) {
      const [er] = ring(i * 2.39996 + seed);
      const off = (0.05 + 0.12 * Math.sqrt((i + 0.5) / count)) * R;
      const lean = 0.22 + 0.5 * (off / (0.17 * R));
      const dir = a.clone().multiplyScalar(Math.cos(lean)).addScaledVector(er, Math.sin(lean));
      const from = top.clone().addScaledVector(er, off);
      const len = R * (0.21 + 0.08 * hash2(seed + 5, i));
      mg.tube([from, from.clone().addScaledVector(dir, len * 0.82), from.clone().addScaledVector(dir, len)], [0.012 * R, 0.01 * R, 0.03 * R], 3, ROSE.filament, ROSE.anther);
    }
    mg.add(turned(lod === 0 ? [6, 2] : [4, 1], top, a, (v) => [0.075 * R * Math.cos((Math.PI / 2) * v), 0.07 * R * Math.sin((Math.PI / 2) * v)], () => ROSE.styles), IDENTITY, WHITE, top, -1);
  } else {
    mg.add(turned([5, 1], top, a, (v) => [0.24 * R * (1 - v), 0.1 * R + 0.1 * R * v], () => ROSE.anther), IDENTITY, WHITE, top, -1);
  }
}

/** Length and thickness of a bud about to open. */
const BUD_LENGTH = 0.3 * BLOOM;
const BUD_WIDTH = 0.19 * BLOOM;
/** The program draws an unopened part at this share of its size, so a bud that stays shut is authored that much larger. */
const UNOPENED = 0.3;
/** Later than the opening ever reaches: a part tagged so stays shut for as long as the spray is in flower. */
const STAYS_SHUT = 1.4;

/** A bud that stays shut: the furled petals showing colour between the sepals that clasp them. */
function addBud(mg: Merge, lod: number, top: V3, a: V3, seed: number): void {
  const big = 1 / UNOPENED;
  const furl = turned(
    lod === 0 ? [9, 6] : lod === 1 ? [6, 3] : [4, 2],
    top,
    a,
    (v) => [0.5 * BUD_WIDTH * big * Math.pow(Math.sin(Math.PI * (0.1 + 0.9 * Math.pow(v, 0.85))), 0.8), BUD_LENGTH * big * v],
    // the petals are wound round one another
    (u, v) => mix(ROSE.bud, ROSE.budTip, Math.min(1, 0.25 + 0.75 * v + 0.2 * Math.sin(u * TAU * 3 + v * 7 + seed))),
  );
  mg.add(furl, IDENTITY, WHITE, top, STAYS_SHUT + 0.002 * (seed % 7));
  if (lod >= 3) return;
  const [e1, e2] = across(a);
  for (let i = 0; i < SEPALS; i++) {
    const theta = (i / SEPALS) * TAU + seed;
    const er = e1.clone().multiplyScalar(Math.cos(theta)).addScaledVector(e2, Math.sin(theta));
    const et = e1.clone().multiplyScalar(-Math.sin(theta)).addScaledVector(e2, Math.cos(theta));
    const base = top.clone().addScaledVector(er, 0.3 * BUD_WIDTH);
    // they clasp the bud and run on past its tip
    mg.add(sepalSheet(lod === 0 ? [2, 4] : [1, 2], base, a, er, et, BUD_LENGTH * 1.18, 0.3 * BUD_WIDTH, 30, -2), IDENTITY, WHITE, base, -1);
  }
  if (lod < 2) {
    const under = top.clone().addScaledVector(a, -0.36 * BUD_LENGTH);
    mg.add(turned(lod === 0 ? [7, 3] : [4, 2], under, a, (v) => [BUD_WIDTH * (0.12 + 0.24 * Math.pow(Math.sin(Math.PI * (0.08 + 0.72 * v)), 0.8)), 0.36 * BUD_LENGTH * v], (_u, v) => mix(ROSE.hip, ROSE.sepal, v)), IDENTITY, WHITE, top, -1);
  }
}

/** A stalk from `from`, setting out along `dir` and arriving along `a`: the nod of the flower is in this bend. */
function stalkTo(mg: Merge, lod: number, from: V3, dir: V3, a: V3, length: number, thick: number): V3 {
  const end = from
    .clone()
    .addScaledVector(dir, 0.62 * length)
    .addScaledVector(a, 0.38 * length);
  const c1 = from.clone().addScaledVector(dir, 0.42 * length);
  const c2 = end.clone().addScaledVector(a, -0.34 * length);
  const n = [8, 4, 2, 1][lod]!;
  const pts: V3[] = [];
  const radii: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const s = 1 - t;
    pts.push(
      from
        .clone()
        .multiplyScalar(s * s * s)
        .addScaledVector(c1, 3 * s * s * t)
        .addScaledVector(c2, 3 * s * t * t)
        .addScaledVector(end, t * t * t),
    );
    radii.push(thick * (1 + 0.25 * t * t));
  }
  mg.tube(pts, radii, [6, 4, 3, 3][lod]!, ROSE.stalk, ROSE.stalkFlushed);
  return end;
}

/** One flower or bud of a spray: where its stalk leaves the main stalk, which way it sets out and how long it is, the way the flower faces, and when it opens (null: a bud that stays shut). */
interface Station {
  leaves: number;
  dir: readonly [number, number, number];
  length: number;
  faces: readonly [number, number, number];
  opens: number | null;
}
/** The main stalk of a spray, from the end of the side shoot. */
const MAIN_STALK = 0.034;
// +Y carries on the line of the side shoot; +Z is its sky side. A flower nods: it faces out along the shoot and down.
const END_FLOWER: Station = { leaves: 1, dir: [0.04, 0.93, 0.36], length: 0.058, faces: [0.06, 0.82, -0.57], opens: 0 };
const RIGHT_FLOWER: Station = { leaves: 0.56, dir: [0.8, 0.5, 0.33], length: 0.094, faces: [0.52, 0.74, -0.42], opens: 0.42 };
const LEFT_FLOWER: Station = { leaves: 0.7, dir: [-0.78, 0.52, 0.35], length: 0.09, faces: [-0.54, 0.72, -0.44], opens: 0.84 };
const HIGH_BUD: Station = { leaves: 0.42, dir: [0.25, 0.62, 0.74], length: 0.078, faces: [0.18, 0.86, 0.48], opens: null };
const LOW_BUD: Station = { leaves: 0.82, dir: [-0.36, 0.78, -0.5], length: 0.07, faces: [-0.3, 0.9, -0.3], opens: null };
const RIGHT_BUD: Station = { ...RIGHT_FLOWER, length: 0.082, faces: [0.42, 0.86, 0.28], opens: null };
const LEFT_BUD: Station = { ...LEFT_FLOWER, length: 0.08, faces: [-0.45, 0.84, 0.3], opens: null };
/** The sprays: one, two or three flowers that open, and a bud or two that do not while the spray is in flower. */
const SPRAYS: readonly (readonly Station[])[] = [
  [END_FLOWER, RIGHT_BUD, LEFT_BUD],
  [END_FLOWER, RIGHT_FLOWER, LEFT_BUD],
  [END_FLOWER, { ...LEFT_FLOWER, opens: 0.42 }, RIGHT_BUD, HIGH_BUD],
  [END_FLOWER, RIGHT_FLOWER, LEFT_FLOWER, HIGH_BUD],
  [END_FLOWER, RIGHT_FLOWER, LEFT_FLOWER, HIGH_BUD, LOW_BUD],
].filter((spray) => spray.length <= SPRAY_FLOWERS[1]);
const SPRAY_LODS = 4;

function makeSprayGeometry(variant: number, lod: number): THREE.BufferGeometry {
  const mg = new Merge(false);
  const stations = SPRAYS[variant]!;
  const rng = new RNG(4100 + variant * 53);
  const lean = v3(rng.range(-0.004, 0.004), MAIN_STALK, rng.range(0.001, 0.006));
  const mainAt = (f: number): V3 => v3(lean.x * f * f, lean.y * f, lean.z * f * f);
  mg.tube(lod < 2 ? [mainAt(0), mainAt(0.5), mainAt(1)] : [mainAt(0), mainAt(1)], lod < 2 ? [0.0019, 0.0017, 0.0015] : [0.0019, 0.0015], [6, 4, 3, 3][lod]!, ROSE.stalk, ROSE.stalk);
  stations.forEach((s, i) => {
    const wobble = (k: number): number => (rng.f() - 0.5) * k;
    const dir = v3(s.dir[0] + wobble(0.12), s.dir[1], s.dir[2] + wobble(0.12)).normalize();
    const a = v3(s.faces[0] + wobble(0.14), s.faces[1], s.faces[2] + wobble(0.14)).normalize();
    const length = s.length * rng.range(0.92, 1.08);
    const under = stalkTo(mg, lod, mainAt(s.leaves), dir, a, length, s.opens === null ? 0.001 : 0.0013);
    if (s.opens === null) addBud(mg, lod, under.clone().addScaledVector(a, 0.36 * BUD_LENGTH), a, variant * 17 + i);
    else addBloom(mg, lod, under.clone().addScaledVector(a, 0.3 * R), a, s.opens, variant * 17 + i);
  });
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(v3(0, 0.08, 0), 0.16);
  return g;
}

// ---------------------------------------------------------------------------
// Hips. Metres: a hip is authored at the middle of its length.
// ---------------------------------------------------------------------------
const HIP_LENGTH = mid(characterRange(morphology, 'fruit.hipLengthM'));
const HIP_WIDTH = HIP_LENGTH * characterNumber(morphology, 'fruit.widthToLength');
/**
 * What the render data's length measures for this plant: the cluster, from the end of the side shoot to the far end
 * of its hips. The stalks below are laid out to that length.
 */
const CLUSTER_LENGTH = mid(characterRange(morphology, 'fruit.clusterLengthM'));
const HIPS_PER_SPRAY = characterRange(morphology, 'fruit.perSpray');
const HIP_LODS = 3;
// Painted unripe. The ripe colour of a point is the look's `ripe` shaded by the green painted here, so the
// bright green of the hip ripens to full orange and the dark green of stalk and sepals to a dull red-brown.
const HIP = {
  body: lin('#86a548'),
  shade: lin('#6c8a3a'),
  sun: lin('#9cb552'),
  stalk: lin('#415226'),
  crown: lin('#4a5428'),
};

function addHip(mg: Merge, lod: number, from: V3, a: V3, size: number, seed: number): void {
  const length = HIP_LENGTH * size;
  const half = 0.5 * HIP_WIDTH * size;
  const [e1] = across(a);
  const body = turned(
    ([[12, 9], [8, 5], [5, 3]] as const)[lod]!,
    from,
    a,
    // rather fat: widest below the middle, drawn in to a neck under the crown
    (v) => {
      const s = 0.03 + 0.92 * v;
      const round = Math.pow(1 - Math.pow(Math.abs(2 * s - 1), 2.4), 1 / 2.4);
      return [half * round * smoothstep(0, 0.07, v) * (1 - 0.5 * smoothstep(0.8, 1, v)), length * v];
    },
    (u, v) => {
      // one side has seen more sun
      const lit = 0.5 + 0.5 * Math.cos(u * TAU + seed);
      return mix(mix(HIP.shade, HIP.body, 0.3 + 0.7 * Math.sin(Math.PI * v)), HIP.sun, 0.55 * lit * lit);
    },
  );
  mg.add(body, IDENTITY, WHITE, from, 0);
  if (lod === 2) return;
  // the crown: what is left of the sepals, dried and turned back, round the dark eye of the hip
  const top = from.clone().addScaledVector(a, length * 0.985);
  const [, e2] = across(a);
  for (let i = 0; i < SEPALS; i++) {
    const theta = (i / SEPALS) * TAU + seed;
    const er = e1.clone().multiplyScalar(Math.cos(theta)).addScaledVector(e2, Math.sin(theta));
    const et = e1.clone().multiplyScalar(-Math.sin(theta)).addScaledVector(e2, Math.cos(theta));
    const base = top.clone().addScaledVector(er, 0.36 * half);
    const g = sepalSheet(lod === 0 ? [2, 4] : [1, 2], base, a, er, et, 0.5 * length * (0.7 + 0.5 * hash2(seed, i)), 0.16 * half * 2, 70 + 40 * hash2(seed + 3, i), 120 + 30 * hash2(seed + 5, i));
    const c = g.getAttribute('color');
    for (let k = 0; k < c.count; k++) c.setXYZ(k, HIP.crown[0], HIP.crown[1], HIP.crown[2]);
    mg.add(g, IDENTITY, WHITE, base, 0);
  }
  mg.add(turned([6, 1], top, a, (v) => [0.3 * half * (1 - v), 0.03 * length * v], () => HIP.crown), IDENTITY, WHITE, top, 0);
}

/** The hips of a spray: where each stalk leaves the main stalk, which way it sets out, how long it is, the way the hip points and its size. */
const HIP_STATIONS: readonly { leaves: number; dir: readonly [number, number, number]; length: number; faces: readonly [number, number, number]; size: number }[] = [
  { leaves: 1, dir: [0.05, 0.93, 0.35], length: 0.05, faces: [0.08, 0.72, -0.69], size: 1.04 },
  { leaves: 0.56, dir: [0.8, 0.5, 0.33], length: 0.07, faces: [0.52, 0.66, -0.54], size: 0.95 },
  { leaves: 0.7, dir: [-0.78, 0.52, 0.35], length: 0.066, faces: [-0.55, 0.62, -0.56], size: 0.9 },
];
const HIP_VARIANTS = Math.min(HIP_STATIONS.length, HIPS_PER_SPRAY[1]) - HIPS_PER_SPRAY[0] + 1;

function makeHipsGeometry(variant: number, lod: number): THREE.BufferGeometry {
  const mg = new Merge(false);
  const count = HIPS_PER_SPRAY[0] + variant;
  const rng = new RNG(5200 + variant * 29);
  const mainAt = (f: number): V3 => v3(0.003 * f * f, MAIN_STALK * f, 0.004 * f * f);
  mg.tube([mainAt(0), mainAt(0.5), mainAt(1)], [0.002, 0.0018, 0.0016], [5, 4, 3][lod]!, HIP.stalk, HIP.stalk);
  for (let i = 0; i < count; i++) {
    const s = HIP_STATIONS[i]!;
    const dir = v3(s.dir[0] + rng.range(-0.08, 0.08), s.dir[1], s.dir[2] + rng.range(-0.08, 0.08)).normalize();
    const a = v3(s.faces[0] + rng.range(-0.1, 0.1), s.faces[1], s.faces[2] + rng.range(-0.1, 0.1)).normalize();
    const from = mainAt(s.leaves);
    const length = s.length * rng.range(0.9, 1.1);
    const end = from
      .clone()
      .addScaledVector(dir, 0.62 * length)
      .addScaledVector(a, 0.38 * length);
    // the stalk has stiffened in the bend the flower gave it
    const c1 = from.clone().addScaledVector(dir, 0.42 * length);
    const c2 = end.clone().addScaledVector(a, -0.34 * length);
    const n = [6, 3, 1][lod]!;
    const pts: V3[] = [];
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const r = 1 - t;
      pts.push(
        from
          .clone()
          .multiplyScalar(r * r * r)
          .addScaledVector(c1, 3 * r * r * t)
          .addScaledVector(c2, 3 * r * t * t)
          .addScaledVector(end, t * t * t),
      );
    }
    mg.tube(
      pts,
      pts.map((_p, k) => 0.0011 + 0.0004 * (k / n)),
      [5, 4, 3][lod]!,
      HIP.stalk,
      HIP.stalk,
    );
    addHip(mg, lod, end, a, s.size * rng.range(0.94, 1.06), variant * 13 + i);
  }
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(v3(0, 0.07, 0), 0.14);
  return g;
}

// ---------------------------------------------------------------------------
// Prickles. One unit long along +Z from the bark; the stem runs along Y.
// ---------------------------------------------------------------------------
const PRICKLE_LODS = 2;
const PRICKLE = { base: lin('#a9483f'), tip: lin('#5c201d') };
/** How far the point is drawn back by the tip, in lengths: three variants, the middle one the commonest. */
const PRICKLE_HOOKS: readonly number[] = [0.42, 0.28, 0.56];
/** Length of the base along the stem, and its width across the stem, for the height of the prickle. */
const PRICKLE_BASE = mid(characterRange(morphology, 'stem.prickleBaseLengthToHeight'));
const PRICKLE_WIDTH = mid(characterRange(morphology, 'stem.prickleBaseWidthToHeight'));

function makePrickleGeometry(variant: number, lod: number): THREE.BufferGeometry {
  const hook = PRICKLE_HOOKS[variant]!;
  const sb = new Surf();
  const [around, along] = ([[8, 6], [4, 2]] as const)[lod]!;
  sb.surf(around, along, (u, v) => {
    const th = u * TAU;
    // the base lies long on the bark the way the stem runs and is thin across it; above it the prickle narrows fast
    const body = 0.34 * Math.pow(1 - v, 0.9);
    const foot = (1 - 0.34) * Math.pow(1 - v, 4);
    const y = Math.cos(th) * 0.5 * PRICKLE_BASE * (body + foot) - hook * Math.pow(v, 1.6) + 0.07 * Math.sin(Math.PI * v);
    const x = Math.sin(th) * 0.5 * PRICKLE_WIDTH * (0.5 * Math.pow(1 - v, 0.9) + 0.5 * Math.pow(1 - v, 4));
    return { p: [x, y, v], c: mix(PRICKLE.base, PRICKLE.tip, Math.pow(v, 0.7)) };
  });
  const g = sb.build();
  g.boundingSphere = new THREE.Sphere(v3(0, 0, 0.5), 0.8);
  return g;
}

// ---------------------------------------------------------------------------
// The look
// ---------------------------------------------------------------------------
const leaf: LeafAsset = {
  key: 'rosa-the-generous-gardener/leaf',
  variants: LEAF_VARIANTS.length,
  lods: LEAF_LODS,
  make: makeLeafGeometry,
  budget: [1900, 390, 110],
  // the shortest leaves are the reduced ones under a flower; of the rest about as many have five leaflets as seven
  pick: (lengthM, r) => (lengthM < 0.1 && r < 0.55 ? 0 : r < 0.5 ? 1 : 2),
  // polished dark green; the young growth burgundy; the leaves yellow a little before they drop
  palette: { greenA: [0.052, 0.118, 0.019], greenB: [0.078, 0.16, 0.026], young: [0.36, 0.13, 0.07], autumnA: [0.5, 0.44, 0.07], autumnB: [0.4, 0.27, 0.06] },
  roughness: 0.38,
  translucency: 0.32,
  detailReach: 0.75,
};

const spray: FlowerAsset = {
  key: 'rosa-the-generous-gardener/spray',
  variants: SPRAYS.length,
  lods: SPRAY_LODS,
  make: makeSprayGeometry,
  budget: [20000, 3300, 900, 340],
  // sprays of two and three open flowers are the commonest
  pick: (r) => Math.min(SPRAYS.length - 1, r < 0.2 ? 0 : r < 0.5 ? 1 : r < 0.68 ? 2 : r < 0.9 ? 3 : 4),
  authoredSize: SPRAY_WIDTH,
  poise: 'held',
  centreAlong: 0.5,
  // a bud is a deeper pink than the open flower
  budTint: [1, 0.74, 0.78],
  swing: 0.3,
  translucency: 0.16,
  sheen: 0.03,
  detailAt: [1.1, 2.6, 5.5],
  detailCaps: [14, 60, 260],
};

const hips: FruitAsset = {
  key: 'rosa-the-generous-gardener/hips',
  variants: HIP_VARIANTS,
  lods: HIP_LODS,
  make: makeHipsGeometry,
  budget: [1250, 440, 130],
  pick: (r) => Math.min(HIP_VARIANTS - 1, r < 0.35 ? 0 : r < 0.75 ? 1 : 2),
  authoredSize: CLUSTER_LENGTH,
  poise: 'held',
  centreAlong: 0.7,
  // rosy orange
  ripe: lin('#e6582c'),
  ripeShade: [0.06, 2.85],
  roughness: 0.42,
  swing: 0.25,
  detailAt: [1.2, 3.6],
  detailCaps: [40, 220],
};

const hookedPrickle: AppendageAsset = {
  key: 'rosa-the-generous-gardener/prickle',
  variants: PRICKLE_HOOKS.length,
  lods: PRICKLE_LODS,
  make: makePrickleGeometry,
  budget: [96, 16],
  pick: (r) => (r < 0.3 ? 0 : r < 0.8 ? 1 : 2),
  // red on a young cane, dull tan-grey on an old one
  aged: [0.36, 0.27, 0.2],
  agedDays: [250, 1000],
  roughness: 0.55,
  swing: 0,
  detailAt: [0.9],
  detailCaps: [400],
};

/**
 * From descriptions: a new shoot is red and is green within weeks; a cane
 * stays green and smooth for several years before it turns to grey-brown
 * bark, which is shallowly fissured and never fluted.
 */
const wood: WoodLook = {
  young: lin('#8e4c3e'),
  mature: lin('#66803e'),
  old: [0.8, 0.69, 0.53],
  woodyDays: [25, 95],
  oldDays: [700, 1900],
  furrowDays: [900, 2800],
  furrow: 0.25,
  stiffDays: [40, 380],
  relief: 1.6,
  roughness: 0.62,
  grain: { streaks: 640, width: 2, wobble: 4 },
};

export const look: TaxonLook = {
  taxonId: 'rosa-the-generous-gardener',
  provisional: false,
  leaves: { default: leaf },
  flowers: { default: spray },
  fruits: { default: hips },
  appendages: { prickle: hookedPrickle },
  wood,
};
