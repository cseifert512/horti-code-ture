// Lonicera periclymenum 'Graham Thomas': a selection of the native woodbine, a
// deciduous twiner found in a Warwickshire hedge about 1960.
//
//   leaf      simple and entire, in opposite pairs; soft, dull, dark green.
//             Two forms, after Bean ("lower pairs of leaves stalked, uppermost
//             ones almost or quite stalkless"): the stalked, pointed leaf of
//             the long shoots, and the stalkless, blunter leaf of the
//             flowering side shoots. One unit long along +Z, upper side +Y.
//   head      the whole inflorescence: a stalk, the small round pair of
//             leaves beneath it (free, never joined round the stem: that is
//             what tells this species from L. caprifolium), and close whorls
//             of long two-lipped flowers standing out all round, with the
//             club-shaped buds of the middle still erect. A flower opens
//             white and is buff yellow from its second day, so the whorl
//             that opened first is painted yellow and the last white. No red
//             anywhere: that is the cultivar. In metres, standing along +Y;
//             its size is the width of the head across its flowers.
//   berries   the tight stalkless cluster that follows a head: glossy, green
//             ripening to red, each with the dark remains of its calyx
//   wood      slender green shoots, purplish where the sun reaches them; tan
//             twigs; grey-brown bark shredding in long strips. Round, not
//             fluted.
//
// A twiner: it holds on with its stems and has no tendrils, rootlets or
// prickles to draw.
//
// One thing here is not as the guide's rule of thumb has it. In a honeysuckle
// the stamens are borne on the corolla and fall with it, so they are part of
// each flower and not of the axis. What stays when the flowers have gone is
// the knot of green ovaries, which is the cluster of berries to come.
//
// Shapes are from published descriptions (species/<id>/morphology.json gives
// each number with its source), not from specimens. This module is this
// woodbine's alone: no other taxon may import it, and it imports none.
import * as THREE from 'three';
import { characterNumber, characterRange, parseMorphology } from '@horti/core';
import morphologyJson from '../../../../../species/lonicera-periclymenum-graham-thomas/morphology.json';
import { RNG, hash2, lerp, smoothstep } from '../../util.ts';
import { GROUND, Merge, type RGB, type Segs, Surf, WHITE, lathe, lin, mix, path } from '../kit.ts';
import { type BladeHold, type FlowerAsset, type FruitAsset, type LeafAsset, type LeafTexture, THIN_LEAF, type TaxonLook, type WoodLook } from '../look.ts';

const ID = 'lonicera-periclymenum-graham-thomas';
const morphology = parseMorphology(morphologyJson, `species/${ID}/morphology.json`);
const mid = ([low, high]: [number, number]): number => (low + high) / 2;

const V3 = THREE.Vector3;
type V3 = THREE.Vector3;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Leaf
// ---------------------------------------------------------------------------
/** Bean: leaves 1 1/2 to 2 1/2 in. long, 1 to 1 1/2 in. wide; the outline as measured off photographs. */
const [RATIO_LOW, RATIO_HIGH] = characterRange(morphology, 'leaf.outlineWidthToLength');
const [WIDEST_LOW, WIDEST_HIGH] = characterRange(morphology, 'leaf.widestAt');
/** Pairs of side veins, read off photographs. */
const [VEIN_PAIRS_LOW, VEIN_PAIRS_HIGH] = characterRange(morphology, 'leaf.sideVeinPairs');
const LEAF_LENGTH_M = mid(characterRange(morphology, 'leaf.lengthM'));
/** The stalk of the stalkless upper leaf and of the stalked lower one, as shares of the leaf's length. */
const [STALK_SHORT, STALK_LONG] = characterRange(morphology, 'leaf.stalkLengthM').map((m) => m / LEAF_LENGTH_M) as [number, number];

interface BladeShape {
  /** Width for length, and where along the blade it is widest (0 base, 1 tip). */
  ratio: number;
  widest: number;
  /** How the outline closes at the tip: about 1 a straight taper to a point, less a rounder, blunter end. */
  tip: number;
  /** Small asymmetry of the two halves, and how far the tip is turned to one side, as shares of the width. */
  skew: number;
  /** How far the tip bends down below the blade's line, in lengths. */
  arch: number;
  /** A shallow undulation of the margin. */
  wave: number;
  phase: number;
}

/** Half width of a blade at `v` along it, as a share of its length; 0 at both ends. */
function halfWidth(shape: BladeShape, v: number): number {
  // an ellipse with full shoulders (the pressed leaves of reference leaves-chuchamel), its widest point moved to
  // `widest`, the base tapered into the stalk and the tip pointed or blunt by `tip`
  const t = v < shape.widest ? (0.5 * v) / shape.widest : 0.5 + (0.5 * (v - shape.widest)) / (1 - shape.widest);
  const s = Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
  return (shape.ratio / 2) * Math.pow(s, t < 0.5 ? 0.85 : shape.tip);
}

/** The blade the leaf texture is painted for: the middle of the photographs' outlines. */
const TEXTURE_BLADE: BladeShape = { ratio: (RATIO_LOW + RATIO_HIGH) / 2, widest: (WIDEST_LOW + WIDEST_HIGH) / 2, tip: 0.9, skew: 0, arch: 0, wave: 0, phase: 0 };
const SIDE_VEINS = Math.round((VEIN_PAIRS_LOW + VEIN_PAIRS_HIGH) / 2);

/**
 * The leaf's own texture: feather-veined, as the shared texture is, but faint. In photographs of the cultivar's
 * relative 'Scentsation' and of the species the blade above is a nearly even dark, slightly grey green; the midrib is
 * the one pale line that shows, the side veins are faint and loop forward near the margin, and the fine net is all but
 * invisible from above (reference scentsation-1, scentsation-3, leaves-chuchamel). uv is the blade laid flat: u = 0.5 + x,
 * v = z, in lengths of the blade.
 */
const LEAF_TEXTURE: LeafTexture = {
  size: 512,
  relief: 0.7,
  paint(colour, height, S) {
    const toSrgb = (c: number) => Math.round(255 * Math.min(1, Math.max(0, c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)));
    const grey = (lum: number, tint: number) => {
      const g = toSrgb(lum);
      return `rgb(${g},${g},${toSrgb(lum * (1 - tint))})`;
    };
    const GROUND = 0.62;
    const img = colour.createImageData(S, S);
    const rel = height.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        // a soft mottle so the blade is not flat paint, and the blade a shade paler towards its margin
        const u = (x + 0.5) / S;
        const v = 1 - (y + 0.5) / S;
        const edge = Math.abs(u - 0.5) / Math.max(0.01, halfWidth(TEXTURE_BLADE, Math.min(0.999, Math.max(0.001, v))));
        const mottle = 1 + 0.05 * (hash2(x >> 4, y >> 4) - 0.5) + 0.03 * (hash2(x >> 2, (y >> 2) + 311) - 0.5);
        const lum = GROUND * mottle * (1 + 0.06 * smoothstep(0.55, 1, edge));
        const o = 4 * (y * S + x);
        const g = toSrgb(lum);
        img.data[o] = g;
        img.data[o + 1] = g;
        img.data[o + 2] = g;
        img.data[o + 3] = 255;
        const h = Math.round(255 * (0.5 + 0.06 * (hash2((x >> 3) + 57, y >> 3) - 0.5)));
        rel.data[o] = rel.data[o + 1] = rel.data[o + 2] = h;
        rel.data[o + 3] = 255;
      }
    }
    colour.putImageData(img, 0, 0);
    height.putImageData(rel, 0, 0);
    const at = (u: number, v: number): [number, number] => [u * S, (1 - v) * S];
    colour.lineCap = height.lineCap = 'round';
    const stroke = (pts: [number, number][], w: number, lum: number, tint: number, groove: number) => {
      for (const [ctx, style, width] of [
        [height, `rgba(0,0,0,${groove})`, w * 2],
        [colour, grey(lum, tint), w],
      ] as const) {
        ctx.strokeStyle = style;
        ctx.lineWidth = Math.max(0.7, width);
        ctx.beginPath();
        pts.forEach(([u, v], i) => {
          const [px, py] = at(u, v);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
      }
    };
    // side veins: they leave the midrib forwards at a narrow angle, arch out and run up along the margin
    for (let i = 0; i < SIDE_VEINS; i++) {
      const v0 = 0.06 + (0.78 * i) / SIDE_VEINS;
      for (const side of [-1, 1]) {
        const pts: [number, number][] = [];
        for (let k = 0; k <= 12; k++) {
          const t = k / 12;
          const v = Math.min(0.97, v0 + 0.2 * t + 0.04 * t * t);
          const reach = halfWidth(TEXTURE_BLADE, v) * (0.88 * Math.sin((Math.PI / 2) * Math.min(1, t * 1.25)));
          pts.push([0.5 + side * reach, v]);
        }
        stroke(pts, S * 0.0032, GROUND + 0.06, 0.25, 0.18);
      }
    }
    // the midrib: the one clear pale line, tapering to the tip
    for (let k = 0; k < 8; k++) {
      const v0 = k / 8;
      const v1 = Math.min(0.97, (k + 1) / 8);
      stroke([[0.5, v0], [0.5, v1]], S * (0.011 - 0.009 * v0), GROUND + 0.22 - 0.1 * v0, 0.4, 0.35);
    }
  },
};

const BLADE_SEGS: Segs[] = [
  [12, 18],
  [4, 6],
  [2, 3],
];

/** A blade, base at the origin and tip at z = 1, upper side +Y: lying flat out, the viewer holds it (leaf.hold). */
function blade(shape: BladeShape, lod: number): THREE.BufferGeometry {
  const [nu, nv] = BLADE_SEGS[lod]!;
  const sb = new Surf();
  const uvs: number[] = [];
  sb.surf(nu, nv, (u01, s) => {
    const u = u01 * 2 - 1;
    const a = Math.abs(u);
    // rows crowd towards the tip and base, where the outline turns fastest
    const v = 0.5 - 0.5 * Math.cos(Math.PI * s);
    const hw = halfWidth(shape, v);
    // the two halves are not quite alike, and the tip leans a little to one side
    const x = u * hw * (1 + shape.skew * Math.sign(u)) + shape.skew * 0.5 * shape.ratio * v * v;
    uvs.push(0.5 + x, v);
    // soft and nearly flat: a shallow keel along the midrib, the margins turned a little down, the tip bent down
    let y = 0.05 * hw * (1 - a) - 0.35 * hw * a * a * a - shape.arch * v * v;
    if (lod < 2) y += shape.wave * Math.sin(v * 11 + shape.phase + u) * a * a;
    if (lod === 0) y -= 0.004 * Math.exp(-((a / 0.1) ** 2)) * (1 - 0.7 * v);
    return { p: [x, y, v] };
  });
  for (let i = 0; i < uvs.length; i++) sb.uv[i] = uvs[i]!;
  return sb.build();
}

/** A whole leaf, one unit long with its blade turned down by UNIT_AT: the stalk, then the blade. */
function leafOf(shape: BladeShape, stalkShare: number, lod: number, tone: number): THREE.BufferGeometry {
  const mg = new Merge(true);
  // the blade is drawn flat out along the stalk's line; measured turned down by UNIT_AT, the leaf is one unit long
  const reach = stalkShare + (1 - stalkShare) * Math.cos(UNIT_AT_RAD);
  const st = stalkShare / reach;
  const s = (1 - stalkShare) / reach;
  const pivot = new V3(0, 0, st);
  // a short stalk, grooved above; a stalkless leaf still has a millimetre of it
  if (lod < 2) mg.tube([new V3(0, 0, 0), new V3(0, 0.002, st * 0.5), pivot], [0.016, 0.012, 0.011], [5, 3][lod]!, WHITE, WHITE, GROUND);
  mg.add(blade(shape, lod), new THREE.Matrix4().compose(pivot, new THREE.Quaternion(), new V3(s, s, s)), WHITE, pivot, tone);
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, -0.1, 0.5), 0.8);
  return g;
}

/** The angle below the stalk's line at which a blade is measured for the leaf's one unit (BladeHold.unitAt). */
const UNIT_AT = mid(characterRange(morphology, 'leaf.bladeBelowStalkDeg'));
const UNIT_AT_RAD = (UNIT_AT * Math.PI) / 180;

const r = (k: number): number => lerp(RATIO_LOW, RATIO_HIGH, k);
const w = (k: number): number => lerp(WIDEST_LOW, WIDEST_HIGH, k);
/** Bean: "ovate, oval, or obovate, more or less tapered at the base, mostly pointed, sometimes blunt". */
const LONG_SHOOT_LEAVES: BladeShape[] = [
  // elliptic, pointed: the commonest in the photographs
  { ratio: r(0.45), widest: w(0.5), tip: 0.95, skew: 0.02, arch: 0.05, wave: 0.006, phase: 0.4 },
  // ovate, widest below the middle, pointed
  { ratio: r(0.8), widest: w(0.0), tip: 1.05, skew: -0.03, arch: 0.07, wave: 0.008, phase: 2.1 },
  // narrower elliptic, drawn out to the tip
  { ratio: r(0.1), widest: w(0.6), tip: 1.1, skew: 0.025, arch: 0.04, wave: 0.005, phase: 4.0 },
];
const FLOWERING_SHOOT_LEAVES: BladeShape[] = [
  // broad oval, blunt
  { ratio: r(1), widest: w(0.6), tip: 0.62, skew: -0.02, arch: 0.05, wave: 0.006, phase: 1.2 },
  // obovate: widest beyond the middle, tapered to the base, blunt
  { ratio: r(0.8), widest: w(1), tip: 0.6, skew: 0.03, arch: 0.06, wave: 0.007, phase: 3.3 },
  // elliptic with a short point
  { ratio: r(0.6), widest: w(0.5), tip: 0.8, skew: -0.025, arch: 0.04, wave: 0.005, phase: 5.2 },
];
const LEAF_LODS = 3;
const makeLongShootLeaf = (variant: number, lod: number): THREE.BufferGeometry => leafOf(LONG_SHOOT_LEAVES[variant]!, lerp(STALK_SHORT, STALK_LONG, 0.6 + 0.2 * variant), lod, 0.1 + 0.2 * variant);
const makeFloweringShootLeaf = (variant: number, lod: number): THREE.BufferGeometry => leafOf(FLOWERING_SHOOT_LEAVES[variant]!, Math.max(STALK_SHORT, 0.02), lod, 0.15 + 0.2 * variant);

// ---------------------------------------------------------------------------
// One flower. Its base (the top of the ovary) is at the origin, it runs out
// along +Z, and +Y is its upper side, the side towards the top of the head.
// In metres.
// ---------------------------------------------------------------------------
/** Corolla 40 to 50 mm long (BSBI account; Bean: 1 1/2 to 2 in.), tube and lips together. */
const FLOWER_LENGTH = mid(characterRange(morphology, 'flower.lengthM'));
const TUBE_LENGTH = FLOWER_LENGTH * characterNumber(morphology, 'flower.tubeShareOfLength');
const LIP_LENGTH = FLOWER_LENGTH - TUBE_LENGTH;
const [TUBE_BASE_W, TUBE_W] = characterRange(morphology, 'flower.tubeWidthM');
const UPPER_LIP_W = mid(characterRange(morphology, 'flower.upperLipWidthM'));
const LOWER_LIP_W = characterNumber(morphology, 'flower.lowerLipWidthM');
/** "The upper lip with four lobes, the lower lip solitary" (BSBI account). */
const UPPER_LIP_LOBES = characterNumber(morphology, 'flower.upperLipLobes');
/** "Stamens are five; style and stigma are both solitary" (BSBI account). */
const STAMENS = characterNumber(morphology, 'flower.stamenCount');
const STAMEN_LENGTH = mid(characterRange(morphology, 'flower.stamenLengthM'));
const STYLE_LENGTH = characterNumber(morphology, 'flower.styleLengthM');
const BUD_LENGTH = characterNumber(morphology, 'flower.budLengthM');

/** How much the tube rises along its length, as a share of that length: flowers stand level and lift a little. */
const TUBE_RISE = 0.13;
/** Radius of the mouth of the tube: "a long slender funnel-shaped tube" (BSBI account), widening where the lips part. */
const THROAT_R = TUBE_W * 1.05;

const PAINT = {
  // the fresh flower: white with cream in it (Bean's supplement has it open pale whitish-cream), greenish at the base of the tube
  tubeBase: lin('#cdd79a'),
  tube: lin('#f6ebbd'),
  lip: lin('#fdf5d6'),
  throat: lin('#f2e2a0'),
  filament: lin('#f5efca'),
  anther: lin('#e0a93f'),
  style: lin('#e6eebc'),
  stigma: lin('#86a845'),
  // the bud: cream, green at the base, the swollen end a little yellow
  budBase: lin('#a6bf78'),
  bud: lin('#e2e4ae'),
  budTip: lin('#ece08f'),
  // what stays: stalk, ovaries, the pair of leaves beneath
  stalkLow: lin('#7d9450'),
  stalkHigh: lin('#a3b566'),
  ovary: lin('#6f9443'),
  calyx: lin('#58793a'),
  bract: lin('#5c8a48'),
  bractPale: lin('#86ab62'),
};

/** The centre line of the tube: at `s` from base (0) to mouth (1). */
const tubeAt = (s: number): V3 => new V3(0, TUBE_RISE * TUBE_LENGTH * s * s, TUBE_LENGTH * s);
/** Unit vectors at the mouth: along the tube, and square to it on the upper side. */
const MOUTH = tubeAt(1);
const MOUTH_ALONG = new V3(0, 2 * TUBE_RISE, 1).normalize();
const MOUTH_UP = new V3(0, MOUTH_ALONG.z, -MOUTH_ALONG.y);

/**
 * A lip: a strap that leaves half the rim of the mouth and rolls back, the
 * upper one up and over, the lower one down and under. `turn` is how far it
 * rolls in all, in radians; `lobes` scallops its end.
 */
function lip(sb: Surf, [nu, nw]: Segs, side: 1 | -1, width: number, length: number, wrap: number, turn: number, lobes: number, colour: (w: number) => RGB): void {
  // the centre line, stepped out from the rim: it starts along the tube and turns away from it
  const steps = 24;
  const line: V3[] = [MOUTH.clone().addScaledVector(MOUTH_UP, side * THROAT_R)];
  for (let i = 1; i <= steps; i++) {
    const w = (i - 0.5) / steps;
    const psi = side * (0.25 + turn * Math.pow(w, 1.15));
    line.push(line[i - 1]!.clone().addScaledVector(MOUTH_ALONG, (Math.cos(psi) * length) / steps).addScaledVector(MOUTH_UP, (Math.sin(psi) * length) / steps));
  }
  const at = (w: number): V3 => {
    const f = Math.min(steps - 1e-6, w * steps);
    return line[Math.floor(f)]!.clone().lerp(line[Math.floor(f) + 1]!, f - Math.floor(f));
  };
  sb.surf(nu, nw, (u01, w01) => {
    const u = u01 * 2 - 1;
    // the end is cut into rounded lobes: a point between two lobes stops short
    const scallop = lobes > 1 ? 1 - 0.22 * (1 - Math.pow(Math.abs(Math.sin((Math.PI * lobes * (u + 1)) / 2)), 0.4)) * w01 * w01 : 1 - 0.1 * u * u * w01;
    const w = w01 * scallop;
    const c = at(w);
    // at the rim it is part of the tube's wall; a third of the way out it has opened flat
    const flat = smoothstep(0, 0.4, w);
    const theta = u * wrap;
    const x = lerp(THROAT_R * Math.sin(theta), (u * width) / 2, flat) * (1 - 0.25 * smoothstep(0.7, 1, w));
    const lift = lerp(THROAT_R * (Math.cos(theta) - 1), -0.08 * width * u * u, flat);
    return { p: [x, c.y + side * lift * MOUTH_UP.y, c.z + side * lift * MOUTH_UP.z], c: colour(w01) };
  });
}

/** A thread from `from`, `length` long, starting along `dir` and bending towards `bend` as it goes. Returns its end. */
function thread(sb: Surf, from: V3, dir: V3, bend: V3, length: number, radius: number, sides: number, along: number, c0: RGB, c1: RGB): V3 {
  const [e1, e2] = [new V3(1, 0, 0), new V3().crossVectors(dir, new V3(1, 0, 0)).normalize()];
  const at = (t: number): V3 => from.clone().addScaledVector(dir, length * t).addScaledVector(bend, length * t * t);
  sb.surf(sides, along, (u, t) => {
    const c = at(t);
    const th = u * TAU;
    const r = radius * (1 - 0.35 * t);
    return { p: [c.x + r * (Math.cos(th) * e1.x + Math.sin(th) * e2.x), c.y + r * (Math.cos(th) * e1.y + Math.sin(th) * e2.y), c.z + r * (Math.cos(th) * e1.z + Math.sin(th) * e2.z)], c: mix(c0, c1, t) };
  });
  return at(1);
}

/** Segment counts of an open flower at each level of detail. */
const FLORET_SEGS = [
  { tube: [8, 8], upper: [16, 8], lower: [3, 7], stamens: STAMENS, threadSides: 4, threadAlong: 3 },
  { tube: [5, 3], upper: [4, 4], lower: [1, 3], stamens: 2, threadSides: 3, threadAlong: 1 },
] as const;

function makeFloret(lod: number): THREE.BufferGeometry {
  const sb = new Surf();
  if (lod >= 2) {
    // from across a garden: a pale strap that rises and turns back, and the lower lip under it
    sb.surf(2, 3, (u01, v) => {
      const u = u01 * 2 - 1;
      const out = v < 2 / 3 ? v * 1.5 : 1;
      const c = tubeAt(out);
      const back = Math.max(0, v - 2 / 3) * 3;
      const hw = lerp(TUBE_BASE_W * 0.9, UPPER_LIP_W * 0.55, smoothstep(0.45, 1, v));
      return { p: [u * hw, c.y + back * LIP_LENGTH * 0.62, c.z + back * LIP_LENGTH * 0.3], c: mix(PAINT.tubeBase, PAINT.lip, Math.min(1, v * 1.6)) };
    });
    sb.surf(1, 1, (u01, v) => ({ p: [(u01 * 2 - 1) * LOWER_LIP_W * 0.6, MOUTH.y - v * LIP_LENGTH * 0.55, MOUTH.z + v * LIP_LENGTH * 0.35], c: PAINT.lip }));
    return sb.build();
  }
  const seg = FLORET_SEGS[lod]!;
  // the tube: slender, tapering to its base, glandular-downy outside (not drawn), widening a little to the mouth
  sb.surf(seg.tube[0], seg.tube[1], (u, v) => {
    const th = u * TAU;
    const c = tubeAt(v);
    const r = lerp(TUBE_BASE_W / 2, TUBE_W / 2, Math.sqrt(v)) + (THROAT_R - TUBE_W / 2) * smoothstep(0.55, 1, v);
    const slope = Math.atan(2 * TUBE_RISE * v);
    return { p: [Math.cos(th) * r, c.y + Math.sin(th) * r * Math.cos(slope), c.z - Math.sin(th) * r * Math.sin(slope)], c: mix(PAINT.tubeBase, PAINT.tube, smoothstep(0.05, 0.55, v)) };
  });
  // upper lip: broad, of four lobes, rolled right back over the tube
  lip(sb, seg.upper, 1, UPPER_LIP_W, LIP_LENGTH, 1.45, 3.2, UPPER_LIP_LOBES, (w) => mix(PAINT.throat, PAINT.lip, smoothstep(0, 0.4, w)));
  // lower lip: one narrow strap, rolled down and under
  lip(sb, seg.lower, -1, LOWER_LIP_W, LIP_LENGTH * 0.95, 0.75, 3.8, 1, (w) => mix(PAINT.throat, PAINT.lip, smoothstep(0, 0.4, w)));
  // stamens: borne on the mouth of the tube, standing well out, spread like the fingers of a hand; anthers set crosswise
  const out = STAMEN_LENGTH * 0.72;
  for (let i = 0; i < seg.stamens; i++) {
    const f = seg.stamens === 1 ? 0 : i / (seg.stamens - 1) - 0.5;
    const from = MOUTH.clone().addScaledVector(new V3(1, 0, 0), f * THROAT_R * 1.4);
    const dir = MOUTH_ALONG.clone().addScaledVector(new V3(1, 0, 0), f * 0.62).addScaledVector(MOUTH_UP, -0.1 + 0.1 * Math.cos(f * 6)).normalize();
    const end = thread(sb, from, dir, new V3(0, 0.16, 0), out * (0.86 + 0.2 * Math.cos(f * 5 + 1)), 0.00028, seg.threadSides, seg.threadAlong, PAINT.filament, PAINT.filament);
    if (lod === 0) {
      // an anther: a narrow body balanced on the tip of its filament
      sb.surf(5, 3, (u, v) => {
        const th = u * TAU;
        const r = 0.00055 * Math.sin(Math.PI * (0.08 + 0.84 * v));
        return { p: [end.x + (v - 0.5) * 0.0042, end.y + Math.cos(th) * r + 0.0003, end.z + Math.sin(th) * r], c: PAINT.anther };
      });
    }
  }
  // the style: longer than the stamens, curving down below them, with a green knob of a stigma
  if (lod === 0) {
    // it rises from the ovary through the tube, so what shows is its length less the tube's, and a little less again for its curve
    const reach = (STYLE_LENGTH - TUBE_LENGTH) * 0.85;
    const tip = thread(sb, MOUTH.clone().addScaledVector(MOUTH_UP, -THROAT_R * 0.5), MOUTH_ALONG.clone().addScaledVector(MOUTH_UP, -0.12).normalize(), new V3(0, -0.2, 0), reach, 0.00032, 4, 4, PAINT.style, PAINT.style);
    sb.surf(5, 3, (u, v) => {
      const th = u * TAU;
      const r = 0.0008 * Math.sin(Math.PI * (0.05 + 0.9 * v));
      return { p: [tip.x + Math.cos(th) * r, tip.y + Math.sin(th) * r, tip.z + (v - 0.4) * 0.0018], c: PAINT.stigma };
    });
  }
  return sb.build();
}

/** A bud about to open: a slender curved tube swelling into a club at its end. Same frame as a flower. */
function makeBud(lod: number): THREE.BufferGeometry {
  const sb = new Surf();
  const [around, along] = ([[7, 8], [4, 4], [3, 2]] as const)[lod]!;
  sb.surf(around, along, (u, v) => {
    const th = u * TAU;
    // the club is widest four fifths of the way along and closes to a blunt point
    const club = Math.pow(Math.sin(Math.PI * Math.pow(v, 2.4)), 0.8);
    const r = (TUBE_BASE_W / 2) * (1 + 0.25 * v) + 0.0019 * club * (lod === 2 ? 1.3 : 1);
    const y = 0.16 * BUD_LENGTH * v * v;
    const colour = v < 0.3 ? mix(PAINT.budBase, PAINT.bud, v / 0.3) : mix(PAINT.bud, PAINT.budTip, (v - 0.3) / 0.7);
    return { p: [Math.cos(th) * r * (v > 0.995 ? 0.05 : 1), y + Math.sin(th) * r * (v > 0.995 ? 0.05 : 1), BUD_LENGTH * v], c: colour };
  });
  return sb.build();
}

/** An ovary with its calyx: the green knob each flower sits on, and the berry to come. Its top is at the origin, its length runs back along -Z. */
function makeOvary(lod: number): THREE.BufferGeometry {
  const sb = new Surf();
  const [around, along] = ([[6, 4], [4, 2], [3, 1]] as const)[lod]!;
  sb.surf(around, along, (u, v) => {
    const th = u * TAU;
    const r = 0.0015 * Math.sin(Math.PI * (0.12 + 0.76 * v)) + 0.0003;
    return { p: [Math.cos(th) * r, Math.sin(th) * r, -0.0034 * (1 - v)], c: mix(PAINT.ovary, PAINT.calyx, v * v) };
  });
  return sb.build();
}

// ---------------------------------------------------------------------------
// The head
// ---------------------------------------------------------------------------
/** The width of a head across its flowers: what the growth model's organs.racemeLengthM measures, and so the size the model is authored at. */
const HEAD_WIDTH = mid(characterRange(morphology, 'inflorescence.widthM'));
/** Whorls of 6 to 15 (BSBI account), a head of up to 20 (Flora of New Zealand). */
const [FLOWERS_FEWEST, FLOWERS_MOST] = characterRange(morphology, 'inflorescence.flowerCount');
/** Peduncle 1 to 50 mm (Flora of New Zealand). */
const [STALK_SHORTEST, STALK_LONGEST] = characterRange(morphology, 'inflorescence.stalkLengthM');

interface HeadSpec {
  /** Flowers in each whorl, the lowest first: a whorl is two facing clusters of three. */
  whorls: number[];
  /** Buds of the middle that have yet to open. */
  buds: number;
  /** Length of the stalk, as a share of the way from the shortest to the longest recorded. */
  stalk: number;
}
// Heads of the similar cultivar 'Scentsation' hold ten to sixteen flowers open or opening round six to ten erect buds
// (reference scentsation-0, scentsation-1, scentsation-2); every head here stays inside the floras' count.
const HEADS: HeadSpec[] = [
  { whorls: [6, 6], buds: 6, stalk: 0.38 },
  { whorls: [6, 5], buds: 5, stalk: 0.25 },
  { whorls: [6, 6, 2], buds: 6, stalk: 0.5 },
  { whorls: [6, 3], buds: 5, stalk: 0.3 },
].filter((h) => {
  const n = h.whorls.reduce((a, b) => a + b, 0) + h.buds;
  return n >= FLOWERS_FEWEST && n <= FLOWERS_MOST;
});
const HEAD_LODS = 3;

const floretCache: THREE.BufferGeometry[] = [];
const budCache: THREE.BufferGeometry[] = [];
const ovaryCache: THREE.BufferGeometry[] = [];

/** A small round leaf of the pair beneath the head, lying along +Z from the origin, upper side +Y. In metres. */
function makeBractLeaf(lod: number): THREE.BufferGeometry {
  const sb = new Surf();
  const length = 0.015;
  sb.surf(lod === 0 ? 6 : 2, lod === 0 ? 6 : 2, (u01, v) => {
    const u = u01 * 2 - 1;
    const hw = 0.46 * length * Math.pow(Math.sin(Math.PI * Math.pow(v, 0.8)), 0.55) + 0.0006;
    const x = u * hw;
    return { p: [x, 0.12 * Math.abs(x) - 0.12 * length * v * v, length * v], c: mix(PAINT.bract, PAINT.bractPale, Math.exp(-((u / 0.18) ** 2)) * 0.8) };
  });
  return sb.build();
}

function makeHead(variant: number, lod: number): THREE.BufferGeometry {
  floretCache[lod] ??= makeFloret(lod);
  budCache[lod] ??= makeBud(lod);
  ovaryCache[lod] ??= makeOvary(lod);
  const spec = HEADS[variant]!;
  const rng = new RNG(4100 + variant * 53);
  const mg = new Merge(false);

  // the stalk leans to its sky side (+Z), so that a head on a level shoot looks up and out and not at the ground
  const stalk = lerp(STALK_SHORTEST, STALK_LONGEST, spec.stalk);
  const lean = 0.5;
  const at = (s: number): V3 => new V3(0, (Math.sin(lean * s) / lean) * stalk, ((1 - Math.cos(lean * s)) / lean) * stalk);
  const top = at(1);
  const axis = new V3(0, Math.cos(lean), Math.sin(lean));
  const side = new V3(1, 0, 0);
  const fore = new V3().crossVectors(side, axis);
  mg.tube(path([4, 2, 1][lod]!, at), path([4, 2, 1][lod]!, (s) => new V3(lerp(0.0011, 0.0014, s), 0, 0)).map((p) => p.x), [6, 4, 3][lod]!, PAINT.stalkLow, PAINT.stalkHigh);

  const m = new THREE.Matrix4();
  const X = new V3();
  const Y = new V3();
  const Z = new V3();
  const scl = new V3();
  const base = new V3();

  // the pair of small round leaves beneath: free of each other, standing out to either side
  if (lod < 2) {
    const leaf = makeBractLeaf(lod);
    for (const sgn of [-1, 1]) {
      Z.set(sgn * 0.93, 0.3, 0.2).normalize();
      Y.set(-sgn * 0.3, 0.93, 0).normalize();
      X.crossVectors(Y, Z).normalize();
      Y.crossVectors(Z, X);
      m.makeBasis(X, Y, Z).setPosition(0, 0.001, 0);
      mg.add(leaf, m, WHITE, new V3(0, 0, 0), -1);
    }
  }

  /** Place one flower or bud: `turn` round the head, `lift` above the level of its whorl, `height` up the short axis of the head. */
  const place = (geometry: THREE.BufferGeometry, turn: number, lift: number, height: number, size: number, tint: Readonly<RGB>, order: number): void => {
    const out = new V3().addScaledVector(side, Math.cos(turn)).addScaledVector(fore, Math.sin(turn));
    Z.copy(out).multiplyScalar(Math.cos(lift)).addScaledVector(axis, Math.sin(lift)).normalize();
    Y.copy(axis).multiplyScalar(Math.cos(lift)).addScaledVector(out, -Math.sin(lift)).normalize();
    X.crossVectors(Y, Z);
    base.copy(top).addScaledVector(axis, height).addScaledVector(out, 0.0016).addScaledVector(Z, 0.0034);
    m.makeBasis(X, Y, Z).scale(scl.set(size, size, size)).setPosition(base);
    // the ovary stays when the flower has gone; the flower pivots where it sits on it
    if (lod < 2) mg.add(ovaryCache[lod]!, m, WHITE, top, -1);
    mg.add(geometry, m, tint, order < 0 ? top : base, order);
  };

  const whorls = spec.whorls.length;
  let opened = 0;
  const open = spec.whorls.reduce((a, b) => a + b, 0);
  spec.whorls.forEach((count, k) => {
    const first = rng.range(0, TAU);
    for (let j = 0; j < count; j++) {
      const order = (0.62 * (opened + rng.range(0, 0.6))) / open;
      // the whorl that opened first has turned buff yellow; the next is turning; the last is still white
      // (in a head of one whorl the six do not open on one evening either: some have turned and some have not)
      const yellow = smoothstep(0.2, 0.7, whorls === 1 ? (j % 3 === 2 ? 0.1 : 0.9) : [0.95, 0.55, 0.15][k]! - rng.range(0, 0.3));
      const tint: RGB = [lerp(1, 0.985, yellow), lerp(1, 0.85, yellow), lerp(1, 0.33, yellow)];
      const turn = first + (j / count) * TAU + rng.range(-0.16, 0.16);
      const lift = [0.2, 0.62, 0.95][k]! + rng.range(-0.12, 0.12);
      place(floretCache[lod]!, turn, lift, 0.001 + 0.0022 * k, rng.range(0.93, 1.05), tint, order);
      opened++;
    }
  });
  const buds = lod === 2 ? Math.min(2, spec.buds) : spec.buds;
  const firstBud = rng.range(0, TAU);
  for (let j = 0; j < buds; j++) {
    const lift = Math.PI / 2 - rng.range(0.1, 0.42);
    // A bud is drawn as part of the axis: it lengthens with the head before the first flower opens, as the buds of the
    // real plant do, and stands in the middle while the whorls round it open and drop. It never opens itself.
    place(budCache[lod]!, firstBud + (j / buds) * TAU + rng.range(-0.3, 0.3), lift, 0.001 + 0.0022 * whorls, rng.range(0.62, 1), WHITE, -1);
  }

  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(top.clone(), HEAD_WIDTH * 0.75);
  return g;
}

// ---------------------------------------------------------------------------
// Berries
// ---------------------------------------------------------------------------
/** "Berries, 8 mm diameter, dark red, globose and stalkless in tight clusters" (BSBI account). */
const BERRY_D = characterNumber(morphology, 'fruit.berryDiameterM');
const [BERRIES_FEWEST, BERRIES_MOST] = characterRange(morphology, 'fruit.berriesPerCluster');
/** The width of a cluster: what the growth model's fruit.lengthM measures, and the size the model is authored at. */
const CLUSTER_WIDTH = mid(characterRange(morphology, 'fruit.clusterWidthM'));
/**
 * Berries in each tier of a cluster, the lowest first: a ring round the end of the stalk, smaller ones on it, one at the
 * top. A full cluster is a tight dome of up to twenty (reference fruit-ripe-unripe-chapeltoun).
 */
const CLUSTERS: number[][] = [[8, 5, 1], [7, 4], [9, 6, 3, 1], [6, 3, 1], [5, 2]].filter((tiers) => {
  const n = tiers.reduce((a, b) => a + b, 0);
  return n >= BERRIES_FEWEST && n <= BERRIES_MOST;
});
const BERRY_LODS = 3;
const CALYX_LOBE_M = mid(characterRange(morphology, 'flower.calyxLobeLengthM'));

// The fruit program turns every point to the ripe colour, scaled by the green of its unripe colour. So what should stay
// dark when the berries are red (the stalk, the dried calyx on each berry) is painted with little green in it.
const BERRY = {
  green: lin('#86a13f'),
  greenPale: lin('#a9bd5c'),
  calyx: lin('#3b1d0f'),
  stalk: lin('#7a5f3a'),
};

function makeBerry(lod: number): THREE.BufferGeometry {
  const sb = new Surf();
  const r = BERRY_D / 2;
  // globose, a touch flattened at the crown, where the dried calyx sits in a dimple
  lathe(sb, ([[12, 7], [6, 4], [4, 2]] as const)[lod]!, (v) => {
    const a = Math.PI * v;
    const dimple = lod === 0 ? 0.08 * r * Math.exp(-(((1 - v) / 0.1) ** 2)) : 0;
    return [r * Math.sin(a) * (1 + 0.04 * Math.sin(a)), -r * Math.cos(a) * 0.97 - dimple];
  }, (u, v) => mix(mix(BERRY.green, BERRY.greenPale, 0.5 + 0.5 * Math.sin(u * TAU + 1) * Math.sin(v * Math.PI)), BERRY.calyx, lod < 2 ? smoothstep(0.9, 0.97, v) : 0));
  if (lod === 0) {
    // the persistent calyx: a small dark crown of five teeth standing up from the dimple (reference
    // fruit-ripe-unripe-chapeltoun; Flora of New Zealand: calyx lobes 1 to 2 mm)
    const tooth = CALYX_LOBE_M;
    sb.surf(10, 1, (u, v) => {
      const th = u * TAU;
      const spike = Math.pow(Math.abs(Math.cos(th * 2.5)), 3);
      const rr = r * (0.16 + 0.1 * v) + 0.25 * tooth * v * spike;
      return { p: [Math.cos(th) * rr, r * 0.9 + v * tooth * (0.4 + 0.6 * spike), Math.sin(th) * rr], c: BERRY.calyx };
    });
  }
  return sb.build();
}

function makeCluster(variant: number, lod: number): THREE.BufferGeometry {
  const tiers = CLUSTERS[variant]!;
  const rng = new RNG(7300 + variant * 29);
  const mg = new Merge(false);
  const berry = makeBerry(lod);
  // the stalk the head stood on, now woody; the berries sit stalkless at its end
  const stalk = lerp(STALK_SHORTEST, STALK_LONGEST, 0.3);
  const top = new V3(0, stalk, 0);
  mg.tube([new V3(0, 0, 0), new V3(0.0006, stalk * 0.5, 0.0004), top], [0.0012, 0.0012, 0.0016], [5, 4, 3][lod]!, BERRY.stalk, BERRY.stalk);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new V3();
  const r = BERRY_D / 2;
  let height = stalk + r * 0.7;
  let turn = rng.range(0, TAU);
  tiers.forEach((count, tier) => {
    // the berries of a tier press against their neighbours, so the tier is as wide as their number makes it
    const ringR = count > 1 ? (r * 0.94) / Math.sin(Math.PI / count) : 0;
    // how far a berry leans out from the middle: those round the stalk most, the one at the top not at all
    const leanOut = count > 1 ? 0.95 - 0.35 * tier : 0;
    for (let i = 0; i < count; i++) {
      const a = turn + (i / count) * TAU + rng.range(-0.08, 0.08);
      const s = rng.range(0.86, 1.05) * (1 - 0.06 * tier);
      p.set(Math.cos(a) * ringR, height + r * rng.range(-0.12, 0.12), Math.sin(a) * ringR);
      // its crown, with the dried calyx, faces outwards and up
      q.setFromEuler(e.set(Math.sin(a) * leanOut, 0, -Math.cos(a) * leanOut));
      mg.add(berry, m.compose(p, q, new V3(s, s, s)), WHITE, p, 0);
    }
    // the next tier sits in the hollows of this one
    turn += Math.PI / Math.max(1, count);
    height += r * 1.45;
  });
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(top.clone(), CLUSTER_WIDTH);
  return g;
}

// ---------------------------------------------------------------------------
// The look
// ---------------------------------------------------------------------------
// "oval, dark green leaves whitish beneath" (RHS record of the cultivar): soft and dull, not glossy. The leaf
// program has one colour for both faces, so the pale underside is not drawn. New leaves break bluish green (BSBI
// account); the leaves have "no fall color" (University of Connecticut plant database), dulling a little first.
const LEAF_PALETTE: LeafAsset['palette'] = {
  // a dark, slightly grey green (reference scentsation-1, scentsation-3, leaves-chuchamel); greenB is also where the
  // texture draws its pale midrib and veins, so the leaves are toned close to greenA
  greenA: lin('#304a2b'),
  greenB: lin('#6c8656'),
  // new leaves break bluish green (BSBI account) and paler (reference stem-liana, winter-geograph)
  young: lin('#7d9978'),
  // "no fall color" (University of Connecticut plant database): a slight dulling, still green, before they drop
  autumnA: lin('#566a33'),
  autumnB: lin('#7c8046'),
};

/**
 * How a blade is held: face to the open side and tilted up, the tip as low as it goes. In photographs of trained
 * plants the leaves of a pair spread nearly level with their faces to the open and up (reference habit-harlow,
 * habit-trellis-boreham, scentsation-3). Angles are in morphology.json.
 */
const LEAF_HOLD: BladeHold = {
  unitAt: UNIT_AT,
  rise: characterRange(morphology, 'leaf.faceRiseDeg'),
  riseOpen: characterRange(morphology, 'leaf.faceRiseOpenDeg'),
  turn: 35,
};

const longShootLeaf: LeafAsset = {
  key: `${ID}/long-shoot-leaf`,
  variants: LONG_SHOOT_LEAVES.length,
  lods: LEAF_LODS,
  make: makeLongShootLeaf,
  budget: [500, 64, 12],
  pick: (_lengthM, r) => Math.min(LONG_SHOOT_LEAVES.length - 1, Math.floor(r * LONG_SHOOT_LEAVES.length)),
  palette: LEAF_PALETTE,
  roughness: 0.62,
  translucency: THIN_LEAF,
  detailReach: 0.6,
  texture: LEAF_TEXTURE,
  hold: LEAF_HOLD,
};

const floweringShootLeaf: LeafAsset = {
  key: `${ID}/flowering-shoot-leaf`,
  variants: FLOWERING_SHOOT_LEAVES.length,
  lods: LEAF_LODS,
  make: makeFloweringShootLeaf,
  budget: [500, 64, 12],
  pick: (_lengthM, r) => Math.min(FLOWERING_SHOOT_LEAVES.length - 1, Math.floor(r * FLOWERING_SHOOT_LEAVES.length)),
  palette: LEAF_PALETTE,
  roughness: 0.62,
  translucency: THIN_LEAF,
  detailReach: 0.6,
  texture: LEAF_TEXTURE,
  hold: LEAF_HOLD,
};

const head: FlowerAsset = {
  key: `${ID}/head`,
  variants: HEADS.length,
  lods: HEAD_LODS,
  make: makeHead,
  budget: [16000, 2400, 260],
  pick: (r) => Math.min(HEADS.length - 1, Math.floor(r * HEADS.length)),
  authoredSize: HEAD_WIDTH,
  poise: 'held',
  centreAlong: 0.25,
  // an unopened flower is a small greenish-cream bud
  budTint: [0.86, 0.93, 0.62],
  swing: 0.25,
  translucency: 0.3,
  sheen: 0.04,
  detailAt: [1.3, 3.6],
  detailCaps: [40, 260],
};

const berries: FruitAsset = {
  key: `${ID}/berries`,
  variants: CLUSTERS.length,
  lods: BERRY_LODS,
  make: makeCluster,
  budget: [3990, 1000, 420],
  pick: (r) => Math.min(CLUSTERS.length - 1, Math.floor(r * CLUSTERS.length)),
  authoredSize: CLUSTER_WIDTH,
  poise: 'held',
  centreAlong: 0.6,
  // "Berries red" (RHS record of the cultivar); dark red and glossy in the species
  ripe: lin('#c0161c'),
  ripeShade: [0.3, 2.1],
  // the woody stalk the head stood on stays brown under red berries
  stalkKeepsColour: true,
  roughness: 0.22,
  swing: 0.2,
  detailAt: [1.2, 3.4],
  detailCaps: [40, 200],
};

/**
 * Young shoots green, more or less purplish "where exposed to direct sun"
 * (Flora of New Zealand); "twining, thin stems" (University of Connecticut plant database), tan twigs. The old
 * bark is drawn pale grey-buff and stringy, in long strips, as photographs show it (reference stem-liana); no flora read
 * describes it: see stem.oldBark in the morphology file. The stems stay round.
 */
const wood: WoodLook = {
  young: lin('#7f8a52'),
  mature: lin('#9a8262'),
  old: [0.96, 0.9, 0.8],
  woodyDays: [60, 240],
  oldDays: [420, 1300],
  furrowDays: [500, 2200],
  furrow: 0.22,
  stiffDays: [30, 260],
  relief: 2.4,
  roughness: 0.92,
  // many long, narrow, nearly straight shreds
  grain: { streaks: 620, width: 2.2, wobble: 5 },
};

export const look: TaxonLook = {
  taxonId: ID,
  provisional: false,
  // the stalked leaf is the ordinary one; the growth model names the other for the flowering side shoots
  leaves: { default: longShootLeaf, flowering_shoot_leaf: floweringShootLeaf },
  flowers: { default: head },
  fruits: { default: berries },
  // a twiner: it holds on with its stems
  appendages: {},
  wood,
};
