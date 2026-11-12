// Trachelospermum jasminoides (star jasmine), an evergreen twiner of the dogbane family.
//
//   leaf      a simple, leathery, very glossy leaf on a short stalk, in three outlines (narrowly elliptic, elliptic,
//             ovate), smooth, with a pale midrib in a shallow groove, the margin a little rolled under, the blade
//             arching over towards a short blunt point. Its 6 to 12 pairs of side veins are faint on the plant and are
//             not drawn. One unit long, stalk and blade together; +Z along it, +Y its upper side.
//   cyme      the inflorescence: a slender stalk that forks by threes, each fork ending in a flower. A flower is a
//             narrow tube swollen above the middle, opening flat into five white lobes, each cut off at a slant and
//             set askew like the blades of a pinwheel, with a small yellow-green eye; five narrow sepals turned back
//             below it. The last flowers of a cyme are drawn as pointed, twisted buds. In metres; the size the
//             render data gives is the width of the cluster of flowers.
//   follicles the fruit: two slender pods from one flower, hanging side by side, green and then dark brown.
//   wood      a pale green shoot, red-brown and smooth from its second year, greying slowly; it stays round.
//
// Every count and size of the real plant is read from species/trachelospermum-jasminoides/morphology.json, where each
// has its source. What is typed here is how the shapes are drawn: curl, twist, colours.
//
// It holds on by twining and has no tendrils or prickles, so it has no appendage models; the rootlets reported on
// stems against damp surfaces are not modelled (see the species profile).
import * as THREE from 'three';
import { characterNumber, characterRange, parseMorphology } from '@horti/core';
import morphologyJson from '../../../../../species/trachelospermum-jasminoides/morphology.json';
import { RNG, lerp, smoothstep } from '../../util.ts';
import { Merge, type RGB, Surf, across, lin, mix, stalk } from '../kit.ts';
import type { FlowerAsset, FruitAsset, LeafAsset, TaxonLook, WoodLook } from '../look.ts';

const morphology = parseMorphology(morphologyJson, 'species/trachelospermum-jasminoides/morphology.json');
const mid = (r: readonly [number, number]): number => (r[0] + r[1]) / 2;

const V3 = THREE.Vector3;
type V3 = THREE.Vector3;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Leaf
// ---------------------------------------------------------------------------
/** Measured on 300 leaves of one plant (Ocokoljic et al. 2026): 4.2 to 8.8 cm long, 1.6 to 3.4 cm wide. */
const LEAF_LENGTH = characterRange(morphology, 'leaf.lengthM');
const LEAF_WIDTH = characterRange(morphology, 'leaf.widthM');
/** The leaf stalk, 3 to 12 mm (Flora of China). */
const LEAF_STALK = characterRange(morphology, 'leaf.stalkLengthM');

/** The stalk's share of the whole leaf, and the blade's width for its length, both from the middles of the ranges. */
const STALK_SHARE = mid(LEAF_STALK) / mid(LEAF_LENGTH);
const BLADE_ASPECT = mid(LEAF_WIDTH) / (mid(LEAF_LENGTH) - mid(LEAF_STALK));

/** The three outlines Flora of China and Bean describe, as: width against the measured middle, and where the blade is widest. */
const OUTLINES = [
  { name: 'narrowly elliptic', width: 0.8, widest: 0.48, fullness: 0.8 },
  { name: 'elliptic', width: 1.0, widest: 0.46, fullness: 0.7 },
  { name: 'ovate', width: 1.22, widest: 0.4, fullness: 0.64 },
] as const;
/** Two of each outline, differing in how they are held and where they sit between the two greens. */
const LEAF_VARIANTS = OUTLINES.length * 2;
const LEAF_LODS = 3;
const LEAF_SEGS: readonly (readonly [number, number])[] = [
  [10, 20],
  [4, 6],
  [2, 3],
];

/**
 * Where the blade samples the shared leaf texture. That texture is drawn with strong side veins, which on a glossy
 * surface read as a ribbed leaf; this leaf is smooth, its side veins faint. So the two halves of the blade take their
 * colour from a small patch of the texture that lies between two veins, and the midrib between them is a strip of its
 * own that samples the texture's pale midrib: a smooth dark blade with a pale midrib, as in photographs of the plant.
 */
const TEX = {
  /** A patch between two veins, half way from the midrib to the edge: [u0, u1], [v0, v1]. */
  blade: { u: [0.258, 0.289], v: [0.4525, 0.4585] },
  /** On the pale midrib, level with that patch. */
  midrib: [0.5, 0.4555],
} as const;

function makeLeaf(variant: number, lod: number): THREE.BufferGeometry {
  const outline = OUTLINES[variant % OUTLINES.length]!;
  const second = variant >= OUTLINES.length;
  const rng = new RNG(7300 + variant * 53);
  const [nu, nv] = LEAF_SEGS[lod]!;
  const halfWidth = 0.5 * BLADE_ASPECT * outline.width;
  // sin(pi * v^a) is widest where v^a = 1/2
  const a = Math.log(0.5) / Math.log(outline.widest);
  // how this leaf is held: all arch over, some twist, some are flatter than others
  const arch = rng.range(0.16, 0.3) + (second ? 0.1 : 0);
  const fold = rng.range(0, 0.07);
  const twist = rng.range(-0.3, 0.3);
  const roll = rng.range(0.03, 0.055);
  const wavePhase = rng.range(0, TAU);

  /** Half the blade's width at `v` along it: wedge-shaped at the base, drawn in to a short blunt point. */
  const halfAt = (v: number): number => {
    const body = Math.pow(Math.sin(Math.PI * Math.pow(Math.max(v, 1e-6), a)), outline.fullness);
    return halfWidth * body * lerp(1, 0.8, smoothstep(0.8, 0.98, v)) + 0.004 * (1 - v);
  };
  /** The midrib's share of the half width at `v`: a millimetre or two wide at the base, a thread at the tip. */
  const ribAt = (v: number): number => Math.min(0.3, (0.016 * (1 - 0.7 * v)) / halfAt(v));
  /** The blade's surface: `u` from -1 at one margin to 1 at the other, `v` from base to tip. */
  const surface = (u: number, v: number): [number, number, number] => {
    const w = halfAt(v);
    let x = u * w;
    // each half swells a little between the midrib, which lies in a shallow groove, and the margin, which rolls under
    let y = fold * Math.abs(x) + 0.05 * w * Math.sin(Math.PI * Math.abs(u)) - roll * Math.pow(Math.abs(u), 3) * (w / halfWidth) - arch * v * v - 0.05 * smoothstep(0.7, 1, v);
    y -= 0.002 * Math.exp(-Math.pow(x / 0.02, 2)) * (1 - 0.6 * v);
    if (lod <= 1) y += 0.01 * Math.sin(v * 8 + wavePhase) * u * Math.abs(u);
    // a leaf is seldom flat: it turns a little about its midrib towards the tip
    const turn = twist * v;
    const xt = x * Math.cos(turn) - y * Math.sin(turn) * 0.6;
    y = y * Math.cos(turn) + x * Math.sin(turn);
    x = xt;
    return [x, y, v];
  };

  const sb = new Surf();
  /** Sets the texture coordinates of the points added since `from`. */
  const sample = (from: number, at: (u: number, v: number) => readonly [number, number]): void => {
    for (let i = from; i < sb.n; i++) {
      const [tu, tv] = at(sb.uv[2 * i]!, sb.uv[2 * i + 1]!);
      sb.uv[2 * i] = tu;
      sb.uv[2 * i + 1] = tv;
    }
  };
  const patch = (u: number, v: number): readonly [number, number] => [lerp(TEX.blade.u[0], TEX.blade.u[1], u), lerp(TEX.blade.v[0], TEX.blade.v[1], v)];
  if (lod === 2) {
    // seen from across a garden: one sheet, the midrib too fine to show
    sb.surf(nu, nv, (u01, v) => ({ p: surface(u01 * 2 - 1, v) }));
    sample(0, patch);
  } else {
    // two halves and the midrib between them, meeting edge to edge; each runs from left to right, so that all
    // three face the same way
    for (const side of [-1, 1]) {
      const from = sb.n;
      sb.surf(nu / 2, nv, (s, v) => ({ p: surface(side < 0 ? -lerp(1, ribAt(v), s) : lerp(ribAt(v), 1, s), v) }));
      sample(from, patch);
    }
    const from = sb.n;
    sb.surf(lod === 0 ? 2 : 1, nv, (s, v) => ({ p: surface((s * 2 - 1) * ribAt(v), v) }));
    sample(from, () => TEX.midrib);
  }
  const blade = sb.build();

  const mg = new Merge(true);
  const stalkLength = STALK_SHARE * (second ? 0.85 : 1.1);
  // level 2 is a blade alone: its stalk is a few pixels
  const from = lod === 2 ? new V3(0, 0, 0) : stalk(mg, stalkLength, 0.013, lod === 0 ? 6 : 3, 0.012);
  const s = 1 - from.z;
  mg.add(blade, new THREE.Matrix4().compose(from, new THREE.Quaternion(), new V3(s, s, s)), [1, 1, 1], from, second ? 0.78 : 0.22);
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, -0.1, 0.5), 0.75);
  return g;
}

// ---------------------------------------------------------------------------
// Flower: authored facing +Y from the top of its own stalk, in metres.
// ---------------------------------------------------------------------------
/** Five lobes, five stamens (counted on every flower examined, Ocokoljic et al. 2026). */
const LOBES = characterNumber(morphology, 'flower.lobeCount');
/** The spread limb, 1.7 to 2.3 cm across (the same study). */
const FLOWER_ACROSS = mid(characterRange(morphology, 'flower.diameterM'));
/** "tube dilated at middle, 5-10 mm" (Flora of China). */
const TUBE = mid(characterRange(morphology, 'flower.tubeLengthM'));
/** "sepals narrowly oblong, 2-5 mm, spreading or reflexed" (Flora of China). */
const SEPAL = mid(characterRange(morphology, 'flower.sepalLengthM'));
/** Half the width of the throat, where the lobes part: appearance, about an eighth of the flower's width. */
const THROAT = FLOWER_ACROSS * 0.065;

const C = {
  lobe: lin('#fbfbf3'),
  lobeShade: lin('#eef0e2'),
  eye: lin('#d9d86a'),
  eyeDeep: lin('#b9bf4a'),
  tubeLow: lin('#cfdda6'),
  tubeHigh: lin('#f3f5e6'),
  sepal: lin('#7c9a4c'),
  sepalTip: lin('#93a85e'),
  core: lin('#dfe6b8'),
  coreTip: lin('#e6dc74'),
  budLow: lin('#d8e3b4'),
  budHigh: lin('#f6f6ea'),
  stalkLow: lin('#6f8a44'),
  stalkHigh: lin('#9aae62'),
} as const;

/** Segments of each part of a flower at each level of detail; null where the part is left out. */
interface FlowerDetail {
  lobe: readonly [number, number];
  tube: readonly [number, number] | null;
  sepal: readonly [number, number] | null;
  core: readonly [number, number] | null;
  bud: readonly [number, number] | null;
  stalkSides: number;
}
const DETAIL: readonly FlowerDetail[] = [
  { lobe: [4, 8], tube: [8, 6], sepal: [2, 3], core: [6, 4], bud: [10, 8], stalkSides: 5 },
  { lobe: [2, 3], tube: [5, 2], sepal: [1, 1], core: [4, 2], bud: [5, 3], stalkSides: 3 },
  { lobe: [1, 1], tube: null, sepal: null, core: null, bud: null, stalkSides: 3 },
];

/**
 * The corolla: tube and limb, which open and fall as one. The flower faces +Y; seen from the front (from +Y, with +X
 * to the right) +Z is downwards, so an angle measured from +X towards +Z runs clockwise and `ccw` below is the
 * anticlockwise side of a lobe, the side its longer corner is on.
 */
function makeCorolla(detail: FlowerDetail): THREE.BufferGeometry {
  const sb = new Surf();
  const reach = FLOWER_ACROSS / 2 - THROAT;
  const widest = FLOWER_ACROSS * 0.118;
  const [nu, nv] = detail.lobe;
  const coarse = nv === 1;
  for (let k = 0; k < LOBES; k++) {
    const angle = (k / LOBES) * TAU;
    const out = new V3(Math.cos(angle), 0, Math.sin(angle));
    const ccw = new V3(Math.sin(angle), 0, -Math.cos(angle));
    sb.surf(nu, nv, (u01, s) => {
      const u = u01 * 2 - 1;
      // narrow where it leaves the throat, widest near the end, the end cut off at a slant with its corners rounded
      const half = widest * (coarse ? lerp(0.5, 0.95, s) : (0.36 + 0.64 * smoothstep(0, 0.72, s)) * (1 - 0.3 * Math.pow(smoothstep(0.82, 1, s), 2)));
      const length = reach * (1 + 0.16 * u) * (coarse ? 1 : 1 - 0.07 * Math.pow(Math.abs(u), 3) * smoothstep(0.8, 1, s));
      // the whole lobe leans anticlockwise as it goes out, and is twisted like a propeller blade: its
      // anticlockwise edge lifted, the other rolled under
      const lean = reach * 0.2 * s * s;
      const twistBy = 0.55 * smoothstep(0.05, 0.9, s);
      const acrossBy = u * half;
      let lift = acrossBy * Math.sin(twistBy) - reach * 0.1 * s * s;
      if (!coarse) {
        lift -= half * 0.5 * Math.pow(Math.max(0, -u), 3);
        lift += half * 0.12 * Math.sin(u * 5 + k) * smoothstep(0.75, 1, s);
      }
      const p = out
        .clone()
        .multiplyScalar(THROAT + length * s)
        .addScaledVector(ccw, lean + acrossBy * Math.cos(twistBy));
      const eye = Math.exp(-Math.pow(s / 0.13, 2));
      const c = mix(mix(C.lobe, C.lobeShade, 0.6 * Math.max(0, -u) * s), C.eye, Math.min(1, eye * 1.1));
      return { p: [p.x, TUBE + lift, p.z], c };
    });
  }
  if (detail.tube) {
    // narrow below, swollen above the middle where the stamens stand, drawn in a little at the mouth
    sb.surf(detail.tube[0], detail.tube[1], (u, v) => {
      const th = u * TAU;
      const r = THROAT * (0.72 + 0.5 * Math.exp(-Math.pow((v - 0.68) / 0.2, 2)) + 0.28 * smoothstep(0.9, 1, v));
      return { p: [Math.cos(th) * r, TUBE * v, Math.sin(th) * r], c: v > 0.93 ? mix(C.tubeHigh, C.eyeDeep, (v - 0.93) / 0.07) : mix(C.tubeLow, C.tubeHigh, v) };
    });
    // the eye: just inside the mouth the tube is closed by the cone of anthers, yellow-green
    sb.surf(detail.tube[0], 1, (u, v) => {
      const th = u * TAU;
      const r = THROAT * 1.05 * v;
      return { p: [Math.cos(th) * r, TUBE * (0.88 + 0.1 * v), Math.sin(th) * r], c: mix(C.eyeDeep, C.eye, v) };
    });
  }
  return sb.build();
}

/** What stays when the corolla has gone, and shows before it opens: five sepals turned back, and the young bud or ovary within. */
function makeCalyx(detail: FlowerDetail): THREE.BufferGeometry | null {
  if (!detail.sepal) return null;
  const sb = new Surf();
  const [nu, nv] = detail.sepal;
  for (let k = 0; k < LOBES; k++) {
    // the sepals stand between the corolla lobes
    const angle = ((k + 0.5) / LOBES) * TAU;
    const out = new V3(Math.cos(angle), 0, Math.sin(angle));
    const side = new V3(-Math.sin(angle), 0, Math.cos(angle));
    sb.surf(nu, nv, (u01, s) => {
      const u = u01 * 2 - 1;
      const half = SEPAL * 0.16 * (1 - 0.75 * s * s);
      // up the tube for a third of its length, then out and back
      const r = THROAT * 0.8 + SEPAL * 0.75 * s * s;
      const y = SEPAL * (0.62 * s - 0.5 * s * s * s);
      const p = out.clone().multiplyScalar(r).addScaledVector(side, u * half);
      return { p: [p.x, y, p.z], c: mix(C.sepal, C.sepalTip, s) };
    });
  }
  if (detail.core) {
    sb.surf(detail.core[0], detail.core[1], (u, v) => {
      const th = u * TAU;
      const r = THROAT * 0.52 * Math.pow(Math.sin(Math.PI * (0.12 + 0.88 * v) * 0.98), 0.7);
      return { p: [Math.cos(th) * r, TUBE * 0.62 * v, Math.sin(th) * r], c: mix(C.core, C.coreTip, v * v) };
    });
  }
  return sb.build();
}

/** A flower still in bud: the tube, and the limb furled into a pointed spindle with its five edges wound round it. */
function makeBud(detail: FlowerDetail): THREE.BufferGeometry | null {
  if (!detail.bud) return null;
  const sb = new Surf();
  const [nu, nv] = detail.bud;
  const length = TUBE * 0.75 + FLOWER_ACROSS * 0.34;
  sb.surf(nu, nv, (u, v) => {
    const th = u * TAU;
    // the lower part is the tube; above it the furled limb, thickest a third of the way up and tapering to a point
    const neck = TUBE * 0.75 / length;
    const furled = Math.max(0, (v - neck) / (1 - neck));
    const body = v < neck ? THROAT * (0.7 + 0.25 * (v / neck)) : THROAT * (0.95 + 0.75 * Math.sin(Math.PI * Math.pow(furled, 0.55)) * (1 - 0.35 * furled)) * (1 - Math.pow(furled, 3));
    // the edges of the five lobes stand out as ridges that wind anticlockwise up the bud
    const ridge = v < neck ? 0 : 0.13 * Math.sin(LOBES * th + furled * 5.5) * Math.sin(Math.PI * furled);
    const r = body * (1 + ridge);
    return { p: [Math.cos(th) * r, length * v, Math.sin(th) * r], c: mix(C.budLow, C.budHigh, smoothstep(0.1, 0.8, v) * (1 - 0.35 * Math.max(0, -ridge / 0.13))) };
  });
  return sb.build();
}

// ---------------------------------------------------------------------------
// Cyme
// ---------------------------------------------------------------------------
/** "the number of flowers in the inflorescences ranged from 2 to 9" (Ocokoljic et al. 2026). */
const FLOWER_COUNT = characterRange(morphology, 'inflorescence.flowerCount');
/** "peduncle 2-6 cm" (Flora of China). */
const CYME_STALK = mid(characterRange(morphology, 'inflorescence.stalkLengthM'));
/** The width of the cluster of flowers: what the growth model's organs.racemeLengthM measures. */
const CYME_WIDTH = mid(characterRange(morphology, 'inflorescence.widthM'));
/** Flowers and buds to a cyme in each variant: the most the study counted, and two and four fewer. */
const CYME_VARIANTS: readonly { flowers: number; buds: number }[] = [
  { flowers: FLOWER_COUNT[1] - 6, buds: 2 },
  { flowers: FLOWER_COUNT[1] - 4, buds: 2 },
  { flowers: FLOWER_COUNT[1] - 3, buds: 3 },
  { flowers: FLOWER_COUNT[1] - 4, buds: 2 },
];
const CYME_LODS = 3;

const partCache: { corolla: THREE.BufferGeometry; calyx: THREE.BufferGeometry | null; bud: THREE.BufferGeometry | null }[] = [];
const partsAt = (lod: number) => (partCache[lod] ??= { corolla: makeCorolla(DETAIL[lod]!), calyx: makeCalyx(DETAIL[lod]!), bud: makeBud(DETAIL[lod]!) });

function makeCyme(variant: number, lod: number): THREE.BufferGeometry {
  const detail = DETAIL[lod]!;
  const parts = partsAt(lod);
  const { flowers, buds } = CYME_VARIANTS[variant]!;
  const rng = new RNG(4100 + variant * 71);
  const mg = new Merge(false);
  const UP = new V3(0, 1, 0);
  const sides = detail.stalkSides;
  // lengths of the forks, as shares of the cluster's width
  const fork1 = CYME_WIDTH * 0.24;
  const fork2 = CYME_WIDTH * 0.2;
  const footstalk = CYME_WIDTH * 0.15;

  // every place a flower or bud can stand, in the order they open: the middle flower of each fork before its sides
  interface Place {
    from: V3;
    at: V3;
    order: number;
    thick: number;
  }
  const places: Place[] = [];
  const stalks: { from: V3; to: V3; thick: number }[] = [];

  // the common stalk: out along +Y, leaning a little to the sky side and bowed
  const lean = rng.range(0.05, 0.2);
  const top = new V3(rng.range(-0.004, 0.004), CYME_STALK, CYME_STALK * lean);
  const bowed = new V3(top.x * 0.3, CYME_STALK * 0.5, CYME_STALK * lean * 0.2);
  const axis = top.clone().sub(bowed).normalize();
  // away from an axis by `tilt`, round it by `turn`
  const off = (about: V3, tilt: number, turn: number): V3 => {
    const [e1, e2] = across(about);
    return about
      .clone()
      .multiplyScalar(Math.cos(tilt))
      .addScaledVector(e1, Math.sin(tilt) * Math.cos(turn))
      .addScaledVector(e2, Math.sin(tilt) * Math.sin(turn))
      .normalize();
  };
  // the first fork: a flower straight on, and a branch to either side
  places.push({ from: top, at: top.clone().addScaledVector(off(axis, rng.range(0, 0.25), rng.range(0, TAU)), footstalk * 1.25), order: 0, thick: 1 });
  const turn1 = rng.range(0, TAU);
  [0, 1].forEach((side) => {
    const dir = off(axis, rng.range(0.85, 1.1), turn1 + side * Math.PI + rng.range(-0.3, 0.3));
    const node = top.clone().addScaledVector(dir, fork1 * rng.range(0.85, 1.15));
    stalks.push({ from: top, to: node, thick: 0.8 });
    // each branch ends in a flower and forks again, crosswise to the first fork
    const onward = dir.clone().addScaledVector(UP, 0.45).normalize();
    places.push({ from: node, at: node.clone().addScaledVector(onward, footstalk), order: 1 + side * 0.3 + rng.range(0, 0.2), thick: 0.75 });
    const turn2 = rng.range(0, TAU);
    [0, 1].forEach((side2) => {
      const dir2 = off(onward, rng.range(0.8, 1.15), turn2 + side2 * Math.PI + rng.range(-0.4, 0.4));
      const end = node.clone().addScaledVector(dir2, fork2 * rng.range(0.8, 1.2));
      places.push({ from: node, at: end, order: 2 + side2 * 0.4 + side * 0.2 + rng.range(0, 0.3), thick: 0.6 });
      // and a last, latest flower beside each of those
      const dir3 = off(dir2, rng.range(0.7, 1.0), rng.range(0, TAU));
      const mid2 = node.clone().lerp(end, 0.55);
      places.push({ from: mid2, at: mid2.clone().addScaledVector(dir3, fork2 * rng.range(0.6, 0.8)), order: 3.2 + rng.range(0, 0.6), thick: 0.5 });
    });
  });
  places.sort((p, q) => p.order - q.order);
  const used = places.slice(0, flowers + buds);

  // the stalks: all of them axis, which stays while the corollas come and go
  const thickness = CYME_WIDTH * 0.014;
  if (lod < 2) {
    const n = lod === 0 ? 6 : 2;
    const pts: V3[] = [];
    const radii: number[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      // a curve through the bowed point
      const p = new V3().addScaledVector(bowed, 2 * t * (1 - t)).addScaledVector(top, t * t);
      pts.push(p);
      radii.push(thickness * lerp(1.25, 0.95, t));
    }
    mg.tube(pts, radii, sides, C.stalkLow, C.stalkHigh);
    for (const s of stalks) mg.tube([s.from, s.to], [thickness * s.thick, thickness * s.thick * 0.85], sides, C.stalkHigh, C.stalkHigh);
    for (const p of used) mg.tube([p.from, p.at], [thickness * p.thick * 0.8, thickness * p.thick * 0.7], sides, C.stalkHigh, C.stalkHigh);
  } else {
    mg.tube([new V3(0, 0, 0), top], [thickness * 1.4, thickness * 1.2], sides, C.stalkLow, C.stalkHigh);
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const spin = new THREE.Quaternion();
  const one = new V3(1, 1, 1);
  used.forEach((place, i) => {
    // it faces the way its stalk runs, turned somewhat outwards and to the sky
    const along = place.at.clone().sub(place.from).normalize();
    const facing = along.addScaledVector(axis, 0.35).add(new V3(rng.range(-0.25, 0.25), rng.range(-0.1, 0.3), rng.range(-0.25, 0.25))).normalize();
    q.setFromUnitVectors(UP, facing).multiply(spin.setFromAxisAngle(UP, rng.range(0, TAU)));
    const isBud = i >= flowers;
    const size = isBud ? rng.range(0.8, 1.0) : rng.range(0.92, 1.08);
    m.compose(place.at, q, one.clone().multiplyScalar(size));
    // opening runs through the cyme from its middle flower outwards; the buds come last and do not open
    const t = isBud ? lerp(0.9, 1, (i - flowers) / Math.max(1, buds - 1)) : (0.78 * i) / Math.max(1, flowers - 1);
    const tone = rng.range(0.96, 1.03);
    if (isBud) {
      if (parts.bud) mg.add(parts.bud, m, [tone, tone, tone * 0.98], place.at, t);
    } else {
      mg.add(parts.corolla, m, [tone, tone, tone * rng.range(0.96, 1)], place.at, t);
    }
    if (parts.calyx) mg.add(parts.calyx, m, [1, 1, 1], place.at, -1);
  });
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, CYME_STALK + CYME_WIDTH * 0.2, 0), CYME_STALK + CYME_WIDTH);
  return g;
}

// ---------------------------------------------------------------------------
// Fruit: two follicles from one flower, hanging along -Y. In metres.
// ---------------------------------------------------------------------------
/** "Follicles linear, 10-25 cm x 3-10 mm" (Flora of China). */
const FOLLICLE_LENGTH = mid(characterRange(morphology, 'fruit.lengthM'));
const FOLLICLE_WIDTH = mid(characterRange(morphology, 'fruit.widthM'));
const FRUIT_VARIANTS = 3;
const FRUIT_LODS = 3;
const FRUIT_SEGS: readonly (readonly [number, number])[] = [
  [8, 16],
  [5, 6],
  [3, 3],
];
const F = { green: lin('#a6c15c'), greenDeep: lin('#86a548'), tip: lin('#c3cc74'), stalk: lin('#8b9a58') } as const;

function makeFollicles(variant: number, lod: number): THREE.BufferGeometry {
  const rng = new RNG(9100 + variant * 37);
  const [around, alongSegs] = FRUIT_SEGS[lod]!;
  const sb = new Surf();
  const stalkLength = FOLLICLE_LENGTH * 0.07;
  const fork = new V3(0, -stalkLength, 0);
  // how the pair is held: side by side, bowed apart with the tips together, or parting
  const spread = [0.03, 0.02, 0.2][variant]!;
  const bow = [0.012, 0.085, 0.02][variant]!;
  const turn = rng.range(0, TAU);
  const e1 = new V3(Math.cos(turn), 0, Math.sin(turn));
  const e2 = new V3(-Math.sin(turn), 0, Math.cos(turn));
  [1, -1].forEach((side, n) => {
    const length = FOLLICLE_LENGTH * (n === 0 ? 1 : rng.range(0.86, 0.97));
    const sway = rng.range(-0.02, 0.02);
    const at = (v: number): V3 =>
      fork
        .clone()
        .addScaledVector(e1, side * length * (spread * v + bow * Math.sin(Math.PI * v) + 0.01 * Math.min(1, v * 8)))
        .addScaledVector(e2, length * sway * Math.sin(Math.PI * v * 0.9))
        .add(new V3(0, -length * v * (1 - 0.5 * spread * spread), 0));
    sb.surf(around, alongSegs, (u, v) => {
      const th = u * TAU;
      const c = at(v);
      const tangent = at(Math.min(1, v + 0.02))
        .sub(at(Math.max(0, v - 0.02)))
        .normalize();
      const a1 = new V3().crossVectors(tangent, e2).normalize();
      const a2 = new V3().crossVectors(tangent, a1);
      // a neck where it joins, then even, then a long taper to a point
      const r = 0.5 * FOLLICLE_WIDTH * Math.min(1, 0.45 + 0.55 * Math.pow(Math.min(1, v / 0.07), 0.7)) * (1 - 0.96 * Math.pow(smoothstep(0.62, 1, v), 1.4));
      c.addScaledVector(a1, Math.cos(th) * r).addScaledVector(a2, Math.sin(th) * r * 0.92);
      // the seam it will split along shows as a paler line down the inner side
      const seam = Math.exp(-Math.pow((Math.cos(th) * side + 1) / 0.25, 2));
      return { p: [c.x, c.y, c.z], c: mix(mix(F.green, F.greenDeep, 0.5 + 0.5 * Math.sin(th * 2 + v * 3)), F.tip, Math.max(seam * 0.6, smoothstep(0.85, 1, v) * 0.7)) };
    });
  });
  // the stalk, with what is left of the calyx as a small collar
  const stalkSides = lod === 0 ? 5 : 3;
  sb.surf(stalkSides, lod === 0 ? 3 : 1, (u, v) => {
    const th = u * TAU;
    const r = FOLLICLE_WIDTH * (0.16 + 0.2 * smoothstep(0.75, 1, v));
    return { p: [Math.cos(th) * r, -stalkLength * v, Math.sin(th) * r], c: F.stalk };
  });
  const g = sb.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, -FOLLICLE_LENGTH * 0.5, 0), FOLLICLE_LENGTH * 0.65);
  return g;
}

// ---------------------------------------------------------------------------
// The look
// ---------------------------------------------------------------------------
const leaf: LeafAsset = {
  key: 'trachelospermum-jasminoides/leaf',
  variants: LEAF_VARIANTS,
  lods: LEAF_LODS,
  make: makeLeaf,
  budget: [520, 72, 12],
  // short leaves are more often the broad ones, long leaves the narrow: Bean notes shorter, broader leaves on some plants
  pick: (lengthM, r) => {
    const long = smoothstep(LEAF_LENGTH[0], LEAF_LENGTH[1], lengthM);
    const shape = r < 0.12 + 0.16 * long ? 0 : r < 0.72 + 0.16 * long ? 1 : 2;
    return shape + (Math.floor(r * 977) % 2) * OUTLINES.length;
  },
  // "glossy dark green"; pale green as it unfolds. The last two are its winter bronze and red (RHS: "often turn
  // deep bronze-red in winter"), which the data cannot ask for yet: an evergreen leaf is given no change of colour.
  palette: { greenA: lin('#27481d'), greenB: lin('#365c24'), young: lin('#9db552'), autumnA: lin('#5a3a22'), autumnB: lin('#7c2a22') },
  roughness: 0.3,
  // leathery: little light comes through
  translucency: 0.2,
  detailReach: 0.55,
};

const cyme: FlowerAsset = {
  key: 'trachelospermum-jasminoides/cyme',
  variants: CYME_VARIANTS.length,
  lods: CYME_LODS,
  make: makeCyme,
  budget: [5200, 1100, 110],
  pick: (r) => Math.min(CYME_VARIANTS.length - 1, Math.floor(r * CYME_VARIANTS.length)),
  authoredSize: CYME_WIDTH,
  poise: 'held',
  centreAlong: (CYME_STALK + CYME_WIDTH * 0.2) / CYME_WIDTH,
  // unopened flowers are green-white
  budTint: [0.8, 0.9, 0.62],
  swing: 0.35,
  translucency: 0.3,
  sheen: 0.04,
  detailAt: [1.1, 3.6],
  detailCaps: [36, 320],
};

const follicles: FruitAsset = {
  key: 'trachelospermum-jasminoides/follicles',
  variants: FRUIT_VARIANTS,
  lods: FRUIT_LODS,
  make: makeFollicles,
  budget: [560, 140, 44],
  pick: (r) => Math.min(FRUIT_VARIANTS - 1, Math.floor(r * FRUIT_VARIANTS)),
  authoredSize: FOLLICLE_LENGTH,
  poise: 'hangs',
  centreAlong: 0.5,
  // pale green, drying to a brown that is nearly black
  ripe: lin('#3a2a1d'),
  ripeShade: [0.55, 1.1],
  roughness: 0.6,
  swing: 0.5,
  detailAt: [1.5, 5],
  detailCaps: [30, 200],
};

/**
 * Pale green shoots that stay green through their first summer and ripen to a smooth red-brown in their second year
 * ("Stem brownish, lenticellate", Flora of China; red-brown in the Chinese flora), greying slowly; the stems stay
 * slender and round. The ages are judged from photographs, not measured.
 */
const wood: WoodLook = {
  young: lin('#93a352'),
  mature: lin('#5c3f2c'),
  old: [0.6, 0.55, 0.5],
  woodyDays: [150, 520],
  oldDays: [1100, 3000],
  furrowDays: [900, 3000],
  furrow: 0.18,
  stiffDays: [30, 260],
  relief: 1.3,
  roughness: 0.8,
  grain: { streaks: 520, width: 2.4, wobble: 9 },
};

export const look: TaxonLook = {
  taxonId: 'trachelospermum-jasminoides',
  provisional: false,
  leaves: { default: leaf },
  flowers: { default: cyme },
  fruits: { default: follicles },
  // a twiner: it holds on with its stems
  appendages: {},
  wood,
};
