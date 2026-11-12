// Hydrangea anomala subsp. petiolaris (climbing hydrangea): a deciduous root
// climber. Its clinging extension shoots are the framework the engine lays on
// the timber; what stands out from them are short side shoots that carry the
// leaves and end in the flowerhead.
//
//   leaf      a broadly ovate blade, truncate to shallowly heart-shaped at the
//             base, drawn out to a short point, finely saw-toothed, hanging
//             from a long stalk. One unit is stalk and blade together.
//   lacecap   a flat corymb on a short stalk: a froth of small fertile flowers,
//             each a tuft of stamens on a green cup, ringed by showy sterile
//             flowers of four white sepals on stalks of their own. One unit is
//             the width of the head, sterile flowers included, which is what
//             the render data gives.
//   dry head  what the engine calls this plant's fruit: the same head when its
//             flowers are over, the capsules small urns with two horns, the
//             sterile flowers papery and nodding. It turns from green to brown
//             and stays through winter.
//   rootlets  a fringe of short clinging roots lying on the timber to either
//             side of the stem
//   wood      red-brown shoots, then bark that peels in cinnamon strips
//
// Opening and shedding. The fertile flowers are the head's parts: each opens
// (its stamens spread) and is shed (they drop) in its turn, from the edge of
// the head inwards. The stalk, the branches, the green cups and the sterile
// flowers are axis and stay until the engine says the head is over, when the
// dry head takes its place. The sterile flowers of a hydrangea do not fall.
//
// Every count and measured size is read from species/<id>/morphology.json.
// What is typed in here is appearance: how far a sepal cups, how a leaf hangs.
// No other taxon module may import this one.
import * as THREE from 'three';
import { characterNumber, characterRange, parseMorphology } from '@horti/core';
import morphologyJson from '../../../../../species/hydrangea-anomala-subsp-petiolaris/morphology.json';
import { RNG, clamp, hash2, lerp, smoothstep } from '../../util.ts';
import { MIDRIB, Merge, Surf, WHITE, lathe, lin, mix, path } from '../kit.ts';
import type { AppendageAsset, FlowerAsset, FruitAsset, LeafAsset, TaxonLook, WoodLook } from '../look.ts';

const morphology = parseMorphology(morphologyJson, 'species/hydrangea-anomala-subsp-petiolaris/morphology.json');

const V3 = THREE.Vector3;
type V3 = THREE.Vector3;
const TAU = Math.PI * 2;
const GOLDEN = 2.39996;
const mid = (r: readonly [number, number]): number => (r[0] + r[1]) / 2;
type RGB = [number, number, number];

// ---------------------------------------------------------------------------
// Leaf
// ---------------------------------------------------------------------------
const BLADE_M = characterRange(morphology, 'leaf.bladeLengthM');
const STALK_M = characterRange(morphology, 'leaf.stalkLengthM');
/** The stalk's share of the whole leaf: a stalk of 3 to 9 cm under a blade of 5.5 to 12 cm. */
const STALK_SHARE = mid(STALK_M) / (mid(STALK_M) + mid(BLADE_M));
/** Greatest width of the blade for its length. */
const WIDTH_SHARE = characterNumber(morphology, 'leaf.bladeWidthShareOfLength');
const TEETH = characterNumber(morphology, 'leaf.marginTeethPerSide');
const VEIN_PAIRS = Math.round(mid(characterRange(morphology, 'leaf.secondaryVeinPairs')));

/**
 * The side veins of the shared leaf texture (textures.ts): eleven pairs, the
 * first leaving the midrib 14/256 of the way up and one every 21/256 after it,
 * each a curve that reaches the edge of the texture 34/256 farther on. The
 * blade takes as much of the texture as holds this plant's number of pairs, and
 * its relief is laid on the same curves, so that what is drawn and what is
 * modelled are the same veins.
 */
const TEX = { first: 14 / 256, step: 21 / 256 };
const V_FROM = 0.03;
const V_SPAN = VEIN_PAIRS * TEX.step;

interface BladeForm {
  /** Greatest width as a share of the blade's length. */
  width: number;
  /** How far the basal lobes reach behind the stalk, as a share of the length: next to nothing is truncate, 0.06 shallowly heart-shaped. */
  cordate: number;
  arch: number;
  fold: number;
  /** How far the tip is carried to one side. */
  skew: number;
  wave: number;
  seed: number;
}

const BLADE_FORMS: readonly BladeForm[] = [
  { width: WIDTH_SHARE, cordate: 0.035, arch: 0.1, fold: 0.1, skew: 0.02, wave: 0.012, seed: 1 },
  // rounder, the base more plainly heart-shaped, flatter
  { width: WIDTH_SHARE * 1.1, cordate: 0.055, arch: 0.07, fold: 0.06, skew: -0.03, wave: 0.016, seed: 2 },
  // narrower, the base cut square, more arched
  { width: WIDTH_SHARE * 0.93, cordate: 0.014, arch: 0.13, fold: 0.13, skew: 0.04, wave: 0.01, seed: 3 },
];

/**
 * How a leaf is held: a long stalk seldom runs straight, and the blade turns
 * on the end of it to face the light. The render data gives the way the stalk
 * leaves the stem, the same for every pair of leaves on a shoot; these are the
 * ways a leaf may depart from that line and come back to it, so that the leaves
 * of a shoot do not stand in a row like the leaflets of one great leaf.
 */
interface Posture {
  blade: number;
  /** How far the stalk swings to one side over its length, radians. */
  swing: number;
  /** How far the blade is turned back across the line of the stalk, radians. */
  back: number;
  /** How far the blade hangs from the line of its stalk, radians. */
  pitch: number;
  /** How far the blade is rolled about its own midrib, radians. */
  roll: number;
  /** How far the stalk rises along its length. */
  rise: number;
  /** Where between the two greens of the palette this leaf lies. */
  tone: number;
}

const LEAF_FORMS: readonly Posture[] = [
  { blade: 0, swing: 0.35, back: -0.25, pitch: 0.38, roll: 0.45, rise: 0.035, tone: 0.3 },
  { blade: 1, swing: -0.3, back: 0.2, pitch: 0.3, roll: -0.5, rise: 0.05, tone: 0.65 },
  { blade: 2, swing: 0, back: 0, pitch: 0.5, roll: 0.15, rise: 0.02, tone: 0.9 },
  { blade: 0, swing: -0.4, back: 0.3, pitch: 0.25, roll: -0.35, rise: 0.06, tone: 0.45 },
  { blade: 1, swing: 0.2, back: -0.1, pitch: 0.42, roll: 0.55, rise: 0.025, tone: 0.8 },
  { blade: 2, swing: 0.3, back: -0.35, pitch: 0.3, roll: -0.2, rise: 0.045, tone: 0.15 },
];

/** Half the blade's width at s (0 at the rear of the base, 1 at the tip): broadest below the middle, drawn out to a point. */
const widthProfile = (s: number): number => Math.sqrt(s) * Math.pow(1 - s, 0.9) * (1 - 0.4 * Math.exp(-(((1 - s) / 0.17) ** 2)));
const PROFILE_TOP = (() => {
  let top = 0;
  for (let i = 1; i < 400; i++) top = Math.max(top, widthProfile(i / 400));
  return top;
})();

interface EdgePoint {
  x: number;
  z: number;
  /** 0 at the notch where the stalk joins, round one side, 0.5 at the tip, 1 at the notch again. */
  along: number;
}

/**
 * The outline of a blade as `n + 1` points at equal steps of margin, from the
 * notch at the stalk round to the notch again. The stalk joins at the origin;
 * the tip is at z = 1 - cordate.
 */
function bladeOutline(form: BladeForm, n: number): EdgePoint[] {
  // one half in polar form about the stalk, from the tip (angle 0) round to the rear (angle pi)
  const M = 240;
  const th: number[] = [];
  const rr: number[] = [];
  for (let i = 0; i <= M; i++) {
    const s = 1 - i / M;
    const x = (0.5 * form.width * widthProfile(s)) / PROFILE_TOP;
    const z = s - form.cordate;
    th.push(i === M ? Math.PI : Math.max(th[i - 1] ?? 0, Math.atan2(x, z)));
    rr.push(Math.hypot(x, z));
  }
  const notch = 0.1 + 4 * form.cordate;
  const reach = (angle: number): number => {
    const a = Math.min(Math.PI, Math.abs(angle));
    let k = 1;
    while (k < M && th[k]! < a) k++;
    const span = th[k]! - th[k - 1]!;
    const r = span > 1e-9 ? lerp(rr[k - 1]!, rr[k]!, (a - th[k - 1]!) / span) : rr[k]!;
    // the margin runs in to the stalk between the two lobes of the base
    return r * (1 - Math.exp(-(((Math.PI - a) / notch) ** 2)));
  };
  // the whole outline, finely, with its length as it goes
  const K = 1440;
  const xs: number[] = [];
  const zs: number[] = [];
  const len: number[] = [0];
  for (let k = 0; k <= K; k++) {
    const a = -Math.PI + (k / K) * TAU;
    const r = reach(a);
    const z = r * Math.cos(a);
    xs.push(r * Math.sin(a) + form.skew * Math.max(0, z) ** 2);
    zs.push(z);
    if (k > 0) len.push(len[k - 1]! + Math.hypot(xs[k]! - xs[k - 1]!, zs[k]! - zs[k - 1]!));
  }
  const total = len[K]!;
  const out: EdgePoint[] = [];
  let k = 1;
  for (let j = 0; j <= n; j++) {
    const at = (j / n) * total;
    while (k < K && len[k]! < at) k++;
    const span = len[k]! - len[k - 1]!;
    const f = span > 1e-12 ? (at - len[k - 1]!) / span : 0;
    out.push({ x: lerp(xs[k - 1]!, xs[k]!, f), z: lerp(zs[k - 1]!, zs[k]!, f), along: j / n });
  }
  return out;
}

/** How far the surface stands above (or below) the plane of the blade at a point of the leaf texture: veins sunk, the tissue between them raised. */
function veinRelief(u: number, v: number): number {
  const a = Math.min(0.5, Math.abs(u - 0.5));
  // how far along its curve the vein that passes here has come, and how far up the leaf that has carried it
  const t = (-0.468 + Math.sqrt(0.468 * 0.468 + 4 * 0.032 * a)) / (2 * 0.032);
  const phase = (v - (0.094 * t + 0.039 * t * t) - TEX.first) / TEX.step;
  const d = Math.abs(phase - Math.round(phase));
  const groove = Math.exp(-((d / 0.11) ** 2));
  const quilt = 0.5 - 0.5 * Math.cos(TAU * d);
  const midrib = Math.exp(-((a / 0.035) ** 2));
  return 0.0045 * quilt * Math.min(1, a * 6) - 0.0025 * groove * Math.min(1, a * 8) - 0.006 * midrib;
}

function makeBlade(form: BladeForm, lod: number): THREE.BufferGeometry {
  const fine = lod === 0;
  // two steps of margin to a tooth: its notch and its point
  const nt = fine ? 4 * TEETH : [0, 24, 12][lod]!;
  const nr = [7, 3, 2][lod]!;
  const edge = bladeOutline(form, nt);
  const toothed = edge.map((e) => ({ x: e.x, z: e.z }));
  if (fine) {
    for (let j = 1; j < nt; j++) {
      const before = edge[j - 1]!;
      const after = edge[j + 1]!;
      const tx = after.x - before.x;
      const tz = after.z - before.z;
      const tl = Math.hypot(tx, tz) || 1;
      // teeth from a little way out of the notch to a little short of the tip, which is entire
      const fromNotch = Math.min(edge[j]!.along, 1 - edge[j]!.along) * 2;
      const size = 0.0085 * smoothstep(0.03, 0.12, fromNotch) * smoothstep(0.012, 0.07, 1 - fromNotch);
      const leftSide = edge[j]!.along < 0.5;
      // outwards is to the left of the way round on this side of the leaf and to the right on the other: the same rule
      const ox = -tz / tl;
      const oz = tx / tl;
      const forward = leftSide ? 1 : -1;
      const p = toothed[j]!;
      if (j % 2 === 1) {
        // the point of a tooth: out, and forward towards the tip of the leaf
        p.x += ox * size + (tx / tl) * forward * size * 0.8;
        p.z += oz * size + (tz / tl) * forward * size * 0.8;
      } else {
        p.x -= ox * size * 0.25;
        p.z -= oz * size * 0.25;
      }
    }
  }
  const half = 0.5 * form.width + Math.abs(form.skew);
  const sb = new Surf();
  sb.surf(nt, nr, (u01, v01) => {
    const j = Math.round(u01 * nt);
    const rho = Math.pow(v01, 0.8);
    const e = v01 === 1 ? toothed[j]! : edge[j]!;
    const x = rho * e.x;
    const z = rho * e.z;
    const zb = z + form.cordate;
    let y = form.fold * Math.abs(x) - form.arch * zb * zb;
    // nothing stirs where the blade joins its stalk
    const free = Math.min(1, Math.hypot(x, z) / 0.06);
    if (lod < 2) y += form.wave * Math.sin(edge[j]!.along * TAU * 5 + form.seed) * rho * rho * rho * free;
    if (fine) y += veinRelief(0.5 + (0.5 * x) / half, V_FROM + V_SPAN * zb) * (1 - 0.6 * rho * rho * rho) * free;
    return { p: [x, y, z] };
  });
  // lay the texture flat over the blade, so that its midrib is the leaf's and its side veins run out to the margin
  for (let i = 0; i < sb.uv.length / 2; i++) {
    sb.uv[2 * i] = clamp(0.5 + (0.5 * sb.pos[3 * i]!) / half, 0.01, 0.99);
    sb.uv[2 * i + 1] = clamp(V_FROM + V_SPAN * (sb.pos[3 * i + 2]! + form.cordate), 0.005, 0.995);
  }
  return sb.build();
}

const LEAF_LODS = 3;

function makeLeafGeometry(variant: number, lod: number): THREE.BufferGeometry {
  const posture = LEAF_FORMS[variant]!;
  const mg = new Merge(true);
  // the long stalk: slender, bowed up a little, swinging to one side as it goes
  const steps = [5, 2, 1][lod]!;
  const along: V3[] = [new V3(0, 0, 0)];
  for (let i = 1; i <= steps; i++) {
    const t = (i - 0.5) / steps;
    const a = posture.swing * t;
    const lift = (posture.rise * (Math.PI / 2) * Math.cos((Math.PI / 2) * t)) / steps;
    along.push(along[i - 1]!.clone().add(new V3((Math.sin(a) * STALK_SHARE) / steps, lift, (Math.cos(a) * STALK_SHARE) / steps)));
  }
  const stalkEnd = along[steps]!;
  mg.tube(
    along,
    along.map((_, i) => lerp(0.0095, 0.0062, i / steps)),
    [6, 4, 3][lod]!,
    WHITE,
    WHITE,
    MIDRIB,
  );
  // the blade hangs from the end of it, turned back across the line of the stalk and rolled a little
  const size = 1 - STALK_SHARE;
  const q = new THREE.Quaternion()
    .setFromAxisAngle(new V3(0, 1, 0), posture.swing + posture.back)
    .multiply(new THREE.Quaternion().setFromAxisAngle(new V3(1, 0, 0), posture.pitch))
    .multiply(new THREE.Quaternion().setFromAxisAngle(new V3(0, 0, 1), posture.roll));
  mg.add(makeBlade(BLADE_FORMS[posture.blade]!, lod), new THREE.Matrix4().compose(stalkEnd, q, new V3(size, size, size)), WHITE, stalkEnd, posture.tone);
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, 0, 0.5), 0.8);
  return g;
}

// ---------------------------------------------------------------------------
// The flowerhead. One unit is its width.
// ---------------------------------------------------------------------------
const HEAD_M = mid(characterRange(morphology, 'inflorescence.widthM'));
/** The stalk of the head, in head widths. */
const HEAD_STALK = mid(characterRange(morphology, 'inflorescence.stalkLengthM')) / HEAD_M;
const STERILE_M = characterRange(morphology, 'sterileFlower.widthM');
/** How wide a sterile flower is, in head widths: the smallest, and the largest. */
const STERILE_WIDTH: readonly [number, number] = [STERILE_M[0] / HEAD_M, STERILE_M[1] / HEAD_M];
const STERILE_STALK_M = characterRange(morphology, 'sterileFlower.stalkLengthM');
const STERILE_STALK: readonly [number, number] = [STERILE_STALK_M[0] / HEAD_M, STERILE_STALK_M[1] / HEAD_M];
const SEPALS = characterNumber(morphology, 'sterileFlower.sepalCount');
const STERILE_COUNT = characterRange(morphology, 'inflorescence.sterileFlowerCount');
/**
 * Sterile flowers to a head, by variant: "about 10 to 15" (the patent of
 * 'Firefly'), and one head with fewer, since their number "varies
 * considerably, from very few to many" (Trees and Shrubs Online).
 */
const STERILE_BY_VARIANT: readonly number[] = [Math.round(STERILE_COUNT[0] * 0.7), STERILE_COUNT[0], Math.round(mid(STERILE_COUNT))];
const FERTILE = characterNumber(morphology, 'inflorescence.fertileFlowersDrawn');
const STAMEN_RANGE = characterRange(morphology, 'fertileFlower.stamenCount');
const STAMENS = Math.round(mid(STAMEN_RANGE));
const STAMEN_M = characterRange(morphology, 'fertileFlower.stamenLengthM');
/** The longer stamens of a flower, in head widths: shortest and longest. */
const STAMEN_LENGTH: readonly [number, number] = [STAMEN_M[0] / HEAD_M, STAMEN_M[1] / HEAD_M];
/** The green cup under a fertile flower (calyx tube and ovary), in head widths. */
const CUP_LENGTH = mid(characterRange(morphology, 'fertileFlower.calyxTubeLengthM')) / HEAD_M;
const STYLES = characterNumber(morphology, 'fertileFlower.styleCount');
/** The capsule, in head widths. */
const CAPSULE_WIDTH = characterNumber(morphology, 'fruit.widthM') / HEAD_M;

const HEAD_VARIANTS = STERILE_BY_VARIANT.length;
const HEAD_LODS = 4;
/** How far the head is turned up from the line of its shoot towards the light, radians. */
const HEAD_TILT = 0.5;
/** Primary branches of the head. */
const RAYS = 8;
/** How far out the fertile flowers reach, in head widths from the middle. */
const DISC = 0.385;

const C = {
  sepal: lin('#f7f3e2'),
  sepalHeart: lin('#e2e6bc'),
  sepalVein: lin('#d9deb0'),
  eye: lin('#c9d196'),
  filament: lin('#f6f1d9'),
  anther: lin('#ead98a'),
  cup: lin('#9fae6c'),
  cupTop: lin('#cdd59d'),
  stalkA: lin('#8b9762'),
  stalkB: lin('#b3bc8e'),
  pedicel: lin('#c6cda1'),
  froth: lin('#efecd4'),
  frothDeep: lin('#c4cb92'),
};

/** Where everything in a head is, in the head's own frame: its stalk ends at the origin and it faces +Y. */
interface HeadPlan {
  rays: { end: V3; azimuth: number }[];
  /** Clusters of fertile flowers, each at the end of a branch of the second order. */
  cymules: { at: V3; from: V3; t: number; flowers: { at: V3; lean: V3; t: number; size: number; kind: number }[] }[];
  /** Sterile flowers: where each is, where its stalk leaves the head, which way it faces, how wide it is. */
  florets: { at: V3; from: V3; normal: V3; size: number; turn: number }[];
}

/** The top of the head: nearly flat, a little higher in the middle. */
const topAt = (r: number): number => 0.125 + 0.03 * (1 - Math.min(1, r / DISC) ** 2);
const polar = (r: number, azimuth: number, y: number): V3 => new V3(r * Math.cos(azimuth), y, r * Math.sin(azimuth));

function planHead(variant: number, dry: boolean): HeadPlan {
  const rng = new RNG(4100 + variant * 37 + (dry ? 500 : 0));
  const turn = rng.range(0, TAU);
  const rays = Array.from({ length: RAYS }, (_, k) => {
    const azimuth = turn + ((k + rng.range(-0.18, 0.18)) / RAYS) * TAU;
    return { end: polar(rng.range(0.17, 0.21), azimuth, 0.078), azimuth };
  });
  const centre = new V3(0, 0.09, 0);

  // where the clusters of fertile flowers stand: two rings of them on the rays, a ring and one more round the middle
  const seats: { r: number; azimuth: number; from: V3 }[] = [];
  for (const ray of rays) {
    seats.push({ r: rng.range(0.31, 0.335), azimuth: ray.azimuth - 0.2 + rng.range(-0.04, 0.04), from: ray.end });
    seats.push({ r: rng.range(0.31, 0.335), azimuth: ray.azimuth + 0.2 + rng.range(-0.04, 0.04), from: ray.end });
  }
  for (const ray of rays) seats.push({ r: rng.range(0.2, 0.225), azimuth: ray.azimuth + rng.range(-0.1, 0.1), from: ray.end });
  for (let k = 0; k < 4; k++) seats.push({ r: rng.range(0.095, 0.115), azimuth: turn + 0.4 + (k / 4) * TAU, from: centre });
  seats.push({ r: 0.012, azimuth: turn, from: centre });

  // the fertile flowers are shared out among the clusters, the outer ones taking any that are over
  const each = Math.floor(FERTILE / seats.length);
  const over = FERTILE - each * seats.length;
  const cymules = seats.map((seat, c) => {
    const at = polar(seat.r, seat.azimuth, topAt(seat.r) - 0.012);
    const count = each + (c < over ? 1 : 0);
    const spin = rng.range(0, TAU);
    const flowers = Array.from({ length: count }, (_, i) => {
      const off = 0.054 * Math.sqrt((i + 0.5) / count);
      const a = spin + i * GOLDEN;
      const p = at.clone().add(new V3(off * Math.cos(a), 0, off * Math.sin(a)));
      const r = Math.hypot(p.x, p.z);
      p.y = topAt(r) + rng.range(-0.006, 0.008) - 0.1 * off;
      // each leans a little out from the middle of its cluster
      const lean = new V3(Math.cos(a) * off * 5, 1, Math.sin(a) * off * 5).normalize();
      // the edge of the head opens first, the middle last
      const t = clamp(0.1 + 0.8 * Math.pow(1 - Math.min(1, r / (DISC + 0.02)), 0.9) + rng.range(-0.06, 0.06), 0.03, 0.97);
      return { at: p, lean, t, size: rng.range(0.85, 1.1), kind: rng.int(0, 2) };
    });
    return { at, from: seat.from, t: flowers.reduce((s, f) => s + f.t, 0) / Math.max(1, flowers.length), flowers };
  });

  const n = STERILE_BY_VARIANT[variant]!;
  const start = rng.range(0, TAU);
  const florets = Array.from({ length: n }, (_, i) => {
    const azimuth = start + ((i + rng.range(-0.3, 0.3)) / n) * TAU;
    const size = lerp(STERILE_WIDTH[0], STERILE_WIDTH[1], rng.range(0.3, 0.75)) * (dry ? 0.88 : 1);
    // one in a few stands in from the edge
    const inset = rng.chance(0.2) ? rng.range(0.8, 0.9) : 1;
    // a fresh one faces up and out; a dry one nods or hangs
    const tilt = dry ? rng.range(0.9, 2.7) : rng.range(0.15, 0.5);
    const r = (0.5 - 0.5 * size * Math.cos(Math.min(tilt, 1.2))) * inset;
    const at = polar(r, azimuth, topAt(DISC) + (dry ? rng.range(-0.05, 0.01) : rng.range(0.012, 0.04)));
    const out = polar(1, azimuth, 0);
    const normal = new V3(0, Math.cos(tilt), 0).addScaledVector(out, Math.sin(tilt)).normalize();
    // its stalk leaves a branch of the head, as far back as the length of such a stalk allows
    const back = clamp(r - rng.range(STERILE_STALK[0] + 0.03, STERILE_STALK[1] - 0.04), 0.2, r - 0.05);
    return { at, from: polar(back, azimuth + rng.range(-0.12, 0.12), 0.095), normal, size, turn: rng.range(0, TAU) };
  });
  return { rays, cymules, florets };
}

/** The stalk of a head, bending up towards the light, and the frame that carries the head's own into the model's. */
function headFrame(): { stalk: V3[]; place: THREE.Matrix4 } {
  const stalk: V3[] = [new V3(0, 0, 0)];
  const steps = 5;
  for (let i = 1; i <= steps; i++) {
    const a = HEAD_TILT * smoothstep(0, 1, (i - 0.5) / steps);
    stalk.push(stalk[i - 1]!.clone().add(new V3(0, (Math.cos(a) * HEAD_STALK) / steps, (Math.sin(a) * HEAD_STALK) / steps)));
  }
  const yAxis = new V3(0, Math.cos(HEAD_TILT), Math.sin(HEAD_TILT));
  const xAxis = new V3(1, 0, 0);
  const place = new THREE.Matrix4().makeBasis(xAxis, yAxis, new V3().crossVectors(xAxis, yAxis)).setPosition(stalk[steps]!);
  return { stalk, place };
}

const Y = new V3(0, 1, 0);
/** A matrix that stands a part authored along +Y at `at`, along `axis`, turned by `spin` about it, at `size`. */
function stand(at: V3, axis: V3, spin: number, size: number): THREE.Matrix4 {
  const q = new THREE.Quaternion().setFromUnitVectors(Y, axis).multiply(new THREE.Quaternion().setFromAxisAngle(Y, spin));
  return new THREE.Matrix4().compose(at, q, new V3(size, size, size));
}

/**
 * One sepal of a sterile flower, lying in the XZ plane with its claw at the
 * origin and its tip at x = 0.5: broadly obovate, a little cupped, its edge
 * faintly scalloped. A dry one is curled and creased.
 */
function sepal(lod: number, dry: boolean, colour: { heart: Readonly<RGB>; face: Readonly<RGB>; vein: Readonly<RGB> }): THREE.BufferGeometry {
  const sb = new Surf();
  const wide = dry ? 0.21 : 0.27;
  const half = (v: number) => wide * Math.pow(Math.sin(Math.PI * Math.pow(clamp(v, 0, 1), 1.25)), 0.55);
  if (lod === 3) {
    // a kite: claw, the two sides at its broadest, tip
    sb.surf(1, 1, (u, v) => {
      const x = u === v ? (u === 0 ? 0.02 : 0.5) : 0.3;
      const z = (u - v) * wide;
      return { p: [x, 0, z], c: colour.face };
    });
    return sb.build();
  }
  const [nu, nv] = ([[8, 6], [4, 4], [2, 2]] as const)[lod]!;
  // rows closer together towards the tip, where the outline turns; the last keeps some width, so that the sepal ends round and not in a point
  const rows = ([[0, 0.2, 0.42, 0.64, 0.82, 0.94, 0.988], [0, 0.3, 0.6, 0.86, 0.97], [0, 0.52, 0.9]] as const)[lod]!;
  sb.surf(nu, nv, (u01, v01) => {
    // the margin is a curve, not a straight run between the rows: carry the points across towards it
    const u = Math.sin((u01 * 2 - 1) * (Math.PI / 2));
    const v = rows[Math.round(v01 * nv)]!;
    const x = 0.025 + 0.475 * v;
    const z = u * half(v) * (1 + (lod === 0 ? 0.03 * Math.cos(v * 16) * Math.abs(u) : 0));
    let y = dry ? -0.09 * v * v + 0.16 * u * u * v - 0.05 * Math.sin(Math.PI * v) : 0.035 * Math.sin(Math.PI * v) * (1 - u * u) - 0.05 * v * v + 0.03 * u * u * v;
    if (lod === 0) y += (dry ? 0.012 : 0.005) * Math.sin(u * 7) * v;
    let c = mix(colour.heart, colour.face, smoothstep(0.02, 0.4, v));
    if (lod === 0) c = mix(c, colour.vein, 0.3 * Math.exp(-((u / 0.14) ** 2)) * (1 - v));
    return { p: [x, y, z], c };
  });
  return sb.build();
}

/** The stamens of one fertile flower: a tuft from the top of its cup, each a filament with an anther at the end. Authored along +Y from the base of the flower. */
function stamenTuft(seed: number, lod: number): THREE.BufferGeometry {
  const sb = new Surf();
  const rng = new RNG(seed);
  const count = lod === 0 ? STAMENS : 5;
  const top = CUP_LENGTH;
  const spin = rng.range(0, TAU);
  for (let i = 0; i < count; i++) {
    // spread from nearly upright to square off the flower, all round it
    const tilt = 0.2 + 1.4 * Math.pow((i + 0.5) / count, 0.75);
    const az = spin + i * GOLDEN + rng.range(-0.3, 0.3);
    const d = new V3(Math.sin(tilt) * Math.cos(az), Math.cos(tilt), Math.sin(tilt) * Math.sin(az));
    // "the longer ones 3 to 5 mm": the rest are shorter
    const length = lerp(STAMEN_LENGTH[0], STAMEN_LENGTH[1], rng.f()) * (rng.chance(0.6) ? 1 : rng.range(0.62, 0.85));
    const base = new V3(0.0035 * Math.cos(az), top, 0.0035 * Math.sin(az));
    const w = new V3().crossVectors(d, new V3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1))).normalize();
    const w2 = new V3().crossVectors(d, w);
    // drawn stouter than a filament is, or it would not show at all
    const thick = lod === 0 ? 0.0042 : 0.0085;
    sb.surf(1, 1, (u, v) => {
      const p = base
        .clone()
        .addScaledVector(d, length * v)
        .addScaledVector(w, (u - 0.5) * thick * (1 - 0.4 * v));
      return { p: [p.x, p.y, p.z], c: lod === 0 ? C.filament : mix(C.filament, C.anther, smoothstep(0.55, 1, v)) };
    });
    if (lod === 0) {
      // the anther, set square to the filament so that one of the two always shows
      const at = base.clone().addScaledVector(d, length + 0.0018);
      sb.surf(1, 1, (u, v) => {
        const p = at
          .clone()
          .addScaledVector(d, 0.0054 * (u + v - 1))
          .addScaledVector(w2, 0.0044 * (u - v));
        return { p: [p.x, p.y, p.z], c: C.anther };
      });
    }
  }
  return sb.build();
}

/** The green cup of a fertile flower: calyx tube and ovary, which stays when the stamens have dropped. Authored along +Y. */
function cup(lod: number): THREE.BufferGeometry {
  const sb = new Surf();
  if (lod === 0) {
    const profile = (v: number): readonly [number, number] => (v < 0.25 ? [0.0032, 0] : v < 0.75 ? [0.0072, CUP_LENGTH * 0.72] : [0.0012, CUP_LENGTH * 1.08]);
    lathe(sb, [5, 2], profile, (_u, v) => mix(C.cup, C.cupTop, v));
  } else {
    // from farther off, a small green cone
    lathe(sb, [3, 1], (v) => (v < 0.5 ? [0.0062, 0] : [0.0015, CUP_LENGTH * 1.05]), (_u, v) => mix(C.cup, C.cupTop, v));
  }
  return sb.build();
}

/** A cluster of fertile flowers seen from too far to tell them apart: a low mound of their colour. Authored along +Y, about its middle. */
function mound(around: number, up: number, radius: number, colours: readonly [Readonly<RGB>, Readonly<RGB>]): THREE.BufferGeometry {
  const sb = new Surf();
  sb.surf(around, up, (u, v) => {
    const th = u * TAU;
    const r = radius * Math.cos((Math.PI / 2) * v);
    return { p: [Math.cos(th) * r, 0.6 * radius * Math.sin((Math.PI / 2) * v), Math.sin(th) * r], c: mix(colours[0], colours[1], v) };
  });
  return sb.build();
}

/**
 * What lies under a cluster of fertile flowers: its crowded forks and flower
 * stalks, densely hairy and pale, too fine and too many to draw one by one.
 * A shallow pad of their colour, so that the froth of stamens is not seen
 * against whatever happens to be behind the head.
 */
function pad(radius: number): THREE.BufferGeometry {
  const sb = new Surf();
  sb.surf(7, 1, (u, v) => {
    const th = u * TAU;
    const r = radius * (1 - v) * (1 + 0.12 * Math.sin(3 * th));
    return { p: [Math.cos(th) * r, 0.012 * v, Math.sin(th) * r], c: mix(C.stalkB, C.pedicel, v) };
  });
  return sb.build();
}

const tuftCache: THREE.BufferGeometry[][] = [];
const cupCache: THREE.BufferGeometry[] = [];

function makeLacecapGeometry(variant: number, lod: number): THREE.BufferGeometry {
  const plan = planHead(variant, false);
  const { stalk, place } = headFrame();
  const at = (p: V3): V3 => p.clone().applyMatrix4(place);
  const mg = new Merge(false);
  const m = new THREE.Matrix4();

  // ---- axis: the stalk and the branches of the head ---------------------------------
  mg.tube(
    lod < 2 ? stalk : [stalk[0]!, stalk[stalk.length - 1]!],
    (lod < 2 ? stalk : [0, 1]).map((_, i, all) => lerp(0.0115, 0.009, i / (all.length - 1))),
    [6, 4, 3, 3][lod]!,
    C.stalkA,
    C.stalkB,
  );
  const hub = at(new V3(0, 0, 0));
  const axisOf = (v: V3): V3 => v.clone().transformDirection(place);
  const up = axisOf(Y);
  if (lod < 3) {
    for (const ray of plan.rays) {
      const end = at(ray.end);
      const bow = at(new V3(ray.end.x * 0.55, ray.end.y * 0.35, ray.end.z * 0.55));
      mg.tube(lod === 0 ? [hub, bow, end] : [hub, end], lod === 0 ? [0.0075, 0.0062, 0.005] : [0.0075, 0.005], [4, 3, 3][lod]!, C.stalkA, C.stalkB);
    }
    if (lod === 0) mg.tube([hub, at(new V3(0, 0.09, 0))], [0.007, 0.005], 4, C.stalkA, C.stalkB);
  }
  if (lod === 0) {
    for (const cymule of plan.cymules) {
      const from = at(cymule.from);
      const to = at(cymule.at);
      const elbow = from.clone().lerp(to, 0.55).addScaledVector(up, -0.014);
      mg.tube([from, elbow, to], [0.0045, 0.0038, 0.003], 3, C.stalkA, C.stalkB);
    }
  }

  // ---- parts: the fertile flowers, each opening and dropping its stamens in its turn ---
  if (lod < 2) {
    tuftCache[lod] ??= [0, 1, 2].map((k) => stamenTuft(700 + k * 19 + lod, lod));
    cupCache[lod] ??= cup(lod);
    const under = pad(0.056);
    for (const cymule of plan.cymules) {
      const node = at(cymule.at);
      mg.add(under, stand(node.clone().addScaledVector(up, -0.012), up, cymule.t * TAU, 1), WHITE, node, -1);
      for (const flower of cymule.flowers) {
        const base = at(flower.at);
        const lean = axisOf(flower.lean);
        const spin = hash2(Math.round(flower.at.x * 9000), Math.round(flower.at.z * 9000)) * TAU;
        if (lod === 0) mg.tube([node, base], [0.003, 0.0026], 3, C.stalkB, C.pedicel);
        m.copy(stand(base, lean, spin, flower.size));
        // the cup is axis: it is there in bud, and it is what is left when the stamens have gone
        mg.add(cupCache[lod]!, m, WHITE, base, -1);
        const tone = 0.94 + 0.1 * hash2(Math.round(flower.at.x * 7000), 5);
        mg.add(tuftCache[lod]![flower.kind]!, m, [tone, tone, tone * 0.98], base, flower.t);
      }
    }
  } else {
    const blob = lod === 2 ? mound(6, 2, 0.072, [C.frothDeep, C.froth]) : mound(3, 1, 0.09, [C.frothDeep, C.froth]);
    for (const cymule of plan.cymules) {
      const base = at(cymule.at);
      mg.add(blob, stand(base, up, 0, 1), WHITE, base, cymule.t);
    }
  }

  // ---- axis again: the sterile flowers, which do not fall ---------------------------------
  const fresh = { heart: C.sepalHeart, face: C.sepal, vein: C.sepalVein };
  const one = sepal(lod, false, fresh);
  const bead = lod === 0 ? mound(6, 2, 0.05, [C.eye, C.sepalHeart]) : null;
  for (const floret of plan.florets) {
    const centre = at(floret.at);
    const normal = axisOf(floret.normal);
    if (lod < 2) {
      const from = at(floret.from);
      const sag = from.clone().lerp(centre, 0.5).addScaledVector(up, -0.012);
      mg.tube(lod === 0 ? [from, sag, centre] : [from, centre], lod === 0 ? [0.0042, 0.0034, 0.003] : [0.004, 0.003], 3, C.stalkB, C.pedicel);
    }
    for (let k = 0; k < SEPALS; k++) {
      // opposite sepals are a pair; one pair is often the larger
      const size = floret.size * (k % 2 === 0 ? 1 : 0.9);
      const spin = floret.turn + (k / SEPALS) * TAU;
      const tone = 0.97 + 0.05 * hash2(k, Math.round(floret.turn * 100));
      // tagged as axis, with a number of its own so that the sepals of a flower can be told apart: -3, -4, ...
      mg.add(one, stand(centre, normal, spin, size), [tone, tone, tone], centre, -3 - k);
    }
    if (bead) mg.add(bead, stand(centre, normal, 0, floret.size), WHITE, centre, -1);
  }

  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(at(new V3(0, 0.1, 0)), 0.75);
  return g;
}

// ---------------------------------------------------------------------------
// The dry head: what stays when the flowers are over. One unit is its width.
// ---------------------------------------------------------------------------
const DRY_LODS = 3;
const D = {
  frame: lin('#a2aa78'),
  frameTip: lin('#b9c091'),
  capsule: lin('#8d9e5c'),
  capsuleRim: lin('#a9b47c'),
  sepal: lin('#cfd6a6'),
  sepalHeart: lin('#b9c488'),
  sepalVein: lin('#aebb80'),
};

/** A capsule on its short stalk: a small urn, cut square at the top, with its styles standing on the rim as horns. Authored along +Y. */
function capsule(lod: number): THREE.BufferGeometry {
  const sb = new Surf();
  const r = CAPSULE_WIDTH / 2;
  const profile = (v: number): readonly [number, number] => (v < 0.25 ? [r * 0.3, -r * 0.9] : v < 0.75 ? [r, r * 0.7] : [r * 0.72, r * 1.9]);
  lathe(sb, [4, 2], profile, (_u, v) => mix(D.capsule, D.capsuleRim, v));
  if (lod === 0) {
    for (let k = 0; k < STYLES; k++) {
      const a = (k / STYLES) * TAU + 0.6;
      const foot = new V3(Math.cos(a) * r * 0.5, r * 1.9, Math.sin(a) * r * 0.5);
      const tip = new V3(Math.cos(a) * r * 1.15, r * 2.9, Math.sin(a) * r * 1.15);
      const side = new V3(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(r * 0.22);
      sb.surf(1, 1, (u, v) => {
        const p = foot
          .clone()
          .lerp(tip, v)
          .addScaledVector(side, (u - 0.5) * 2 * (1 - 0.7 * v));
        return { p: [p.x, p.y, p.z], c: D.capsuleRim };
      });
    }
  }
  return sb.build();
}

function makeDryHeadGeometry(variant: number, lod: number): THREE.BufferGeometry {
  const plan = planHead(variant, true);
  const { stalk, place } = headFrame();
  const at = (p: V3): V3 => p.clone().applyMatrix4(place);
  const axisOf = (v: V3): V3 => v.clone().transformDirection(place);
  const mg = new Merge(false);
  const hub = at(new V3(0, 0, 0));
  const origin = new V3(0, 0, 0);

  mg.tube(lod === 0 ? stalk.filter((_, i) => i % 2 === 0 || i === stalk.length - 1) : [stalk[0]!, stalk[stalk.length - 1]!], lod === 0 ? [0.011, 0.0105, 0.0098, 0.009] : [0.011, 0.009], lod === 0 ? 4 : 3, D.frame, D.frameTip);
  if (lod < 2) {
    for (const ray of plan.rays) {
      const end = at(ray.end);
      const bow = at(new V3(ray.end.x * 0.55, ray.end.y * 0.35, ray.end.z * 0.55));
      mg.tube(lod === 0 ? [hub, bow, end] : [hub, end], lod === 0 ? [0.007, 0.006, 0.0048] : [0.007, 0.0048], 3, D.frame, D.frameTip);
    }
  }
  if (lod === 0) {
    mg.tube([hub, at(new V3(0, 0.09, 0))], [0.0065, 0.0048], 3, D.frame, D.frameTip);
    for (const cymule of plan.cymules) mg.tube([at(cymule.from), at(cymule.at)], [0.0042, 0.003], 3, D.frame, D.frameTip);
    // capsules where the flowers were; not every flower leaves one
    const urn = capsule(0);
    for (const cymule of plan.cymules) {
      for (const flower of cymule.flowers) {
        if (hash2(Math.round(flower.at.x * 8000), Math.round(flower.at.z * 8000)) > 0.52) continue;
        const base = at(flower.at);
        const tone = 0.9 + 0.2 * hash2(Math.round(flower.at.x * 6000), 3);
        mg.add(urn, stand(base, axisOf(flower.lean), flower.t * TAU, flower.size), [tone, tone, tone], origin, 0);
      }
    }
  } else {
    // from farther off: each cluster of capsules as one small mound
    const blob = lod === 1 ? mound(5, 1, 0.055, [D.capsule, D.capsuleRim]) : mound(3, 1, 0.07, [D.capsule, D.capsuleRim]);
    const up = axisOf(Y);
    for (const cymule of plan.cymules) mg.add(blob, stand(at(cymule.at), up, 0, 1), WHITE, origin, 0);
  }

  // the sterile flowers stay on, papery, turned over on their stalks
  const paper = { heart: D.sepalHeart, face: D.sepal, vein: D.sepalVein };
  const one = sepal(lod === 0 ? 1 : lod === 1 ? 2 : 3, true, paper);
  for (const floret of plan.florets) {
    const centre = at(floret.at);
    const normal = axisOf(floret.normal);
    if (lod === 0) mg.tube([at(floret.from), centre], [0.0038, 0.0028], 3, D.frame, D.frameTip);
    for (let k = 0; k < SEPALS; k++) {
      const size = floret.size * (k % 2 === 0 ? 1 : 0.9);
      const tone = 0.92 + 0.14 * hash2(k, Math.round(floret.turn * 100));
      mg.add(one, stand(centre, normal, floret.turn + (k / SEPALS) * TAU, size), [tone, tone, tone], origin, 0);
    }
  }
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(at(new V3(0, 0.08, 0)), 0.75);
  return g;
}

// ---------------------------------------------------------------------------
// The hold: rootlets from the side of the stem that lies on the timber.
//
// The render data gives a patch its place on the timber and the direction into
// the timber, which is this model's +Z. The rootlets that show lie ON the
// surface, the plane across that direction, and run out all round from under
// the stem: whichever way the stem runs, those along it are hidden beneath it
// and the rest make the fringe to either side. One or two go straight in, as
// rootlets do into a crack or the grain, and are seen only where there is one.
// One unit is the length of a rootlet.
// ---------------------------------------------------------------------------
const ROOTLET_LODS = 2;
const ROOTLET = { base: lin('#e6d7b6'), tip: lin('#c9b28a') };

function makeRootletsGeometry(variant: number, lod: number): THREE.BufferGeometry {
  const mg = new Merge(false);
  const rng = new RNG(900 + variant * 13);
  const n = [16, 6][lod]!;
  const turn = rng.range(0, TAU);
  for (let i = 0; i < n; i++) {
    const a = turn + ((i + rng.range(-0.35, 0.35)) / n) * TAU;
    const length = rng.range(0.45, 1);
    const kink = rng.range(-0.16, 0.16);
    const phase = rng.range(0, TAU);
    const out = new V3(Math.cos(a), Math.sin(a), 0);
    const side = new V3(-Math.sin(a), Math.cos(a), 0);
    const pts = path(lod === 0 ? 3 : 1, (t) =>
      out
        .clone()
        .multiplyScalar(0.05 + (length - 0.05) * t)
        .addScaledVector(side, (kink * Math.sin(t * 4 + phase) + 0.06 * Math.sin(t * 11 + phase)) * t)
        // off the underside of the stem, then pressed to the timber
        .add(new V3(0, 0, -0.22 * (1 - t) * (1 - t) - 0.035)),
    );
    mg.tube(
      pts,
      pts.map((_, k) => lerp(0.04, 0.016, k / (pts.length - 1))),
      3,
      ROOTLET.base,
      ROOTLET.tip,
    );
  }
  // one into the timber, at the finest level
  if (lod === 0) {
    const x = variant === 0 ? 0.1 : -0.12;
    mg.tube([new V3(x, 0, -0.1), new V3(x * 1.3, 0.04, 0.45), new V3(x * 1.1, 0.02, 0.95)], [0.04, 0.03, 0.012], 3, ROOTLET.base, ROOTLET.tip);
  }
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, 0, 0.3), 1.3);
  return g;
}

// ---------------------------------------------------------------------------
// The look
// ---------------------------------------------------------------------------
const leaf: LeafAsset = {
  key: 'hydrangea-anomala-subsp-petiolaris/leaf',
  variants: LEAF_FORMS.length,
  lods: LEAF_LODS,
  make: makeLeafGeometry,
  budget: [2150, 190, 60],
  pick: (_lengthM, r) => Math.min(LEAF_FORMS.length - 1, Math.floor(r * LEAF_FORMS.length)),
  // dark and lustrous above; light green when young; clear yellow, briefly, in autumn
  palette: { greenA: lin('#3f6a2a'), greenB: lin('#4f7d30'), young: lin('#9dbb4e'), autumnA: lin('#e3c53a'), autumnB: lin('#d9cf73') },
  roughness: 0.42,
  translucency: 0.4,
  detailReach: 0.75,
};

const lacecap: FlowerAsset = {
  key: 'hydrangea-anomala-subsp-petiolaris/lacecap',
  variants: HEAD_VARIANTS,
  lods: HEAD_LODS,
  make: makeLacecapGeometry,
  budget: [23700, 5200, 1300, 300],
  // few sterile flowers on one head in four; the fullest ring on one in three
  pick: (r) => (r < 0.25 ? 0 : r < 0.67 ? 1 : 2),
  authoredSize: 1,
  poise: 'held',
  centreAlong: 0.3,
  budTint: [0.7, 0.86, 0.52],
  swing: 0.12,
  translucency: 0.3,
  sheen: 0.04,
  detailAt: [1.1, 2.8, 7],
  detailCaps: [16, 90, 500],
};

const dryHead: FruitAsset = {
  key: 'hydrangea-anomala-subsp-petiolaris/dry-head',
  variants: HEAD_VARIANTS,
  lods: DRY_LODS,
  make: makeDryHeadGeometry,
  budget: [3950, 900, 300],
  pick: (r) => (r < 0.25 ? 0 : r < 0.67 ? 1 : 2),
  authoredSize: 1,
  poise: 'held',
  centreAlong: 0.3,
  // green when the flowers go over, then brown: the sepals a pale papery buff, the capsules and branches darker
  ripe: lin('#8c6a47'),
  ripeShade: [0.35, 1.5],
  roughness: 0.92,
  swing: 0.1,
  detailAt: [1.2, 4.5],
  detailCaps: [16, 160],
};

const clingingRoots: AppendageAsset = {
  key: 'hydrangea-anomala-subsp-petiolaris/aerial-roots',
  variants: 2,
  lods: ROOTLET_LODS,
  make: makeRootletsGeometry,
  budget: [300, 40],
  pick: (r) => (r < 0.5 ? 0 : 1),
  // pale and fleshy when new, hardening to dry brown
  aged: lin('#96744f'),
  agedDays: [40, 240],
  roughness: 0.95,
  swing: 0,
  detailAt: [1.2],
  detailCaps: [260],
};

/**
 * Shoots of the year red-brown; the bark of older stems thin and loose,
 * peeling in strips, cinnamon to tan (morphology.json: stem.youngShootColour,
 * stem.barkOld, stem.barkColour). The ages are choices: a shoot is brown by
 * the end of its first summer, and the bark is taken to peel from about its
 * fourth year (stem.barkPeelsFromAgeYears).
 */
const wood: WoodLook = {
  young: lin('#8c6a44'),
  mature: lin('#8d5433'),
  old: [1.35, 0.72, 0.38],
  woodyDays: [40, 200],
  oldDays: [characterNumber(morphology, 'stem.barkPeelsFromAgeYears') * 180, characterNumber(morphology, 'stem.barkPeelsFromAgeYears') * 450],
  furrowDays: [500, 2200],
  furrow: 0.4,
  stiffDays: [40, 330],
  relief: 5,
  roughness: 0.96,
  // long loose strips
  grain: { streaks: 300, width: 6.5, wobble: 9 },
};

export const look: TaxonLook = {
  taxonId: 'hydrangea-anomala-subsp-petiolaris',
  provisional: false,
  leaves: { default: leaf },
  flowers: { default: lacecap },
  fruits: { default: dryHead },
  appendages: { aerial_roots: clingingRoots },
  wood,
};
