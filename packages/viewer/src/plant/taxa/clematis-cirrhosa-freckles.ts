// Clematis cirrhosa var. purpurascens 'Freckles': an evergreen clematis that
// climbs by its leaf stalks and flowers in winter.
//
//   leaf        two forms, as the floras give them. The ordinary leaf, of the
//               long shoots, is ternate: a long stalk and three stalked
//               leaflets, each lobed and coarsely toothed. The leaf of the
//               short shoots ("short_shoot") is simple: broadly ovate, heart-
//               shaped at the base, three-lobed and toothed. Glossy dark green.
//   flower      one nodding bell on its stalk. The data gives the way the
//               stalk runs out from the node; the bell is turned down from the
//               end of it. Four tepals, cream flushed pink outside, creamy
//               white inside and freckled red-maroon so heavily that the spots
//               run together; a boss of green-yellow stamens round a tuft of
//               silky styles; two bracts joined in a little cup on the stalk
//               just behind the flower. One unit is the width of the open bell.
//   seed head   a ball of achenes, each with a long feathered tail: silky
//               silver-green, drying to pale fluff. One unit is an achene
//               with its tail.
//   hold        a leaf stalk that has taken a turn round the wire its stem
//               lies along and then hardened
//   wood        slender green shoots, then brown, then pale stringy bark
//
// Sizes, counts and proportions of the real plant are read from
// species/clematis-cirrhosa-freckles/morphology.json, where each has its
// source. What is chosen here is appearance: curvature, colour, gloss.
//
// The tepals and stamens are tagged as parts, so they are small in the bud,
// open, and drop; the stalk, the cup of bracts and the head of carpels are
// axis and stay until the seed head takes over.
//
// This module is this clematis's alone. No other taxon may import it.
import * as THREE from 'three';
import { characterNumber, characterRange, parseMorphology } from '@horti/core';
import morphologyJson from '../../../../../species/clematis-cirrhosa-freckles/morphology.json';
import { RNG, hash2, lerp, smoothstep } from '../../util.ts';
import { MIDRIB, Merge, type RGB, Surf, WHITE, lin, mix } from '../kit.ts';
import type { AppendageAsset, FlowerAsset, FruitAsset, LeafAsset, TaxonLook, WoodLook } from '../look.ts';

const morphology = parseMorphology(morphologyJson, 'species/clematis-cirrhosa-freckles/morphology.json');
const range = (key: string): [number, number] => characterRange(morphology, key);
const middle = (key: string): number => {
  const [a, b] = range(key);
  return (a + b) / 2;
};

const V3 = THREE.Vector3;
type V3 = THREE.Vector3;
const TAU = Math.PI * 2;
const ID = new THREE.Matrix4();
const X_AXIS = new V3(1, 0, 0);
const Y_AXIS = new V3(0, 1, 0);
const Z_AXIS = new V3(0, 0, 1);

// ---------------------------------------------------------------------------
// Leaves
// ---------------------------------------------------------------------------

/** Bean: the stalk is 1/2 to 1 1/2 in. long and the blade 3/4 to 2 in.: the stalk's share of a simple leaf. */
const STALK_M = middle('leaf.stalkLengthM');
const BLADE_M = middle('leaf.bladeLengthM');
const SIMPLE_STALK = STALK_M / (STALK_M + BLADE_M);
/** Bean: blades 1/2 to 1 1/2 in. wide for 3/4 to 2 in. long. */
const BLADE_WIDTH = middle('leaf.bladeWidthM') / BLADE_M;
/** Cretan Flora: leaflets 2 to 5 cm long and 1.5 to 3.5 cm wide. */
const LEAFLET_M = middle('leaf.leafletLengthM');
const LEAFLET_WIDTH = middle('leaf.leafletWidthM') / LEAFLET_M;
/** Cretan Flora: "simple or trifoliolate". */
const LEAFLETS = characterNumber(morphology, 'leaf.leafletCount');
/** Bean: "broadly ovate with a heart-shaped base or three-lobed". */
const SIMPLE_LOBES = characterNumber(morphology, 'leaf.simpleLobeCount');

interface BladeForm {
  /** Reach of the blade between its lobes, from where the stalk joins. */
  body: number;
  /** Lobes: the angle from the tip (radians), how far each reaches beyond the body, and how wide it is. */
  lobes: readonly { angle: number; reach: number; width: number }[];
  /** The notch where the stalk joins: a heart-shaped base. */
  sinus: { depth: number; width: number };
  /** Coarse teeth along each side, and how deep they are cut, as a share of the reach there. */
  teeth: number;
  toothDepth: number;
  /** How much each lobe folds up from its own main vein, and how much the blade arches down to its tip. */
  fold: number;
  arch: number;
  /** Width for length. */
  width: number;
}

/** Segments round a blade and from its base outwards, at each level of detail. */
const BLADE_SEGS: readonly (readonly [number, number])[] = [
  [64, 4],
  [20, 2],
  [8, 1],
];

/**
 * A lobed, toothed blade as a fan from where its stalk joins: base at the
 * origin, tip of the middle lobe at z = 1, upper side +Y. The teeth point
 * forward, each with its long edge towards the base, as the teeth of a
 * clematis leaflet do. Each lobe is folded a little along its own main vein.
 */
function lobedBlade(form: BladeForm, lod: number, seed: number): THREE.BufferGeometry {
  const [nt, nr] = BLADE_SEGS[lod]!;
  const fine = lod === 0;
  const smooth = (theta: number) => {
    let r = form.body;
    for (const l of form.lobes) r += l.reach * Math.exp(-(((theta - l.angle) / l.width) ** 2));
    return r * (1 - form.sinus.depth * Math.exp(-(((Math.PI - Math.abs(theta)) / form.sinus.width) ** 2)));
  };
  const back = smooth(Math.PI);
  const scale = 1 / (back + smooth(0));
  const tooth = (theta: number) => {
    if (lod === 2 || form.teeth === 0) return 1;
    // from the stalk (0) round to the tip (1) on either side
    const s = (Math.PI - Math.abs(theta)) / Math.PI;
    const where = smoothstep(0.1, 0.22, s) * (1 - smoothstep(0.94, 1, s));
    const phase = (s * form.teeth + hash2(seed, 5) * 0.5) % 1;
    // at the middle level there are too few points for teeth: the outline is drawn in a little instead
    return fine ? 1 - form.toothDepth * where * (1 - phase) : 1 - form.toothDepth * where * 0.45;
  };
  // the veins the blade folds along: the midrib and one to each side lobe
  const veins = [0, ...form.lobes.map((l) => l.angle).filter((a) => Math.abs(a) > 0.2 && Math.abs(a) < 1.9)];
  const sb = new Surf();
  sb.surf(nt, nr, (u01, rho) => {
    const theta = (u01 * 2 - 1) * Math.PI;
    const r = rho * smooth(theta) * scale * lerp(1, tooth(theta), rho * rho * rho);
    const x = r * Math.sin(theta);
    const z = back * scale + r * Math.cos(theta);
    // how far this point is from the nearest main vein, measured square to it
    let off = Math.abs(x);
    for (const a of veins) if (Math.cos(theta - a) > 0) off = Math.min(off, Math.abs(r * Math.sin(theta - a)));
    let y = form.fold * off - form.arch * z * z;
    // the margin turns down a little all round, as a leathery leaf's does
    y -= 0.035 * rho ** 4 * (0.4 + 0.6 * z);
    if (fine) y += 0.012 * Math.sin(theta * 7 + seed) * rho * (1 - rho) * 4;
    return { p: [x, y, z] };
  });
  // to the width the floras give for the length, and the leaf texture laid flat over it, stalk to tip
  let widest = 1e-6;
  for (let i = 0; i < sb.pos.length; i += 3) widest = Math.max(widest, Math.abs(sb.pos[i]!));
  const k = form.width / (2 * widest);
  for (let i = 0; i < sb.pos.length; i += 3) sb.pos[i] = sb.pos[i]! * k;
  for (let i = 0; i < sb.uv.length / 2; i++) {
    sb.uv[2 * i] = 0.5 + sb.pos[3 * i]! / form.width;
    sb.uv[2 * i + 1] = sb.pos[3 * i + 2]!;
  }
  return sb.build();
}

/** The end leaflet: three-lobed, the middle lobe much the longest. `cut` 0 to 1 is how deeply this leaf is lobed. */
const endLeaflet = (cut: number): BladeForm => ({
  body: 0.3 - 0.06 * cut,
  lobes: [
    { angle: 0, reach: 0.72, width: 0.44 },
    { angle: -0.92, reach: 0.3 + 0.12 * cut, width: 0.3 },
    { angle: 0.92, reach: 0.3 + 0.12 * cut, width: 0.3 },
    { angle: -2.0, reach: 0.1, width: 0.5 },
    { angle: 2.0, reach: 0.1, width: 0.5 },
  ],
  sinus: { depth: 0.55, width: 0.45 },
  teeth: 8,
  toothDepth: 0.2,
  fold: 0.3,
  arch: 0.14,
  width: LEAFLET_WIDTH,
});

/** A side leaflet: lopsided, its one strong lobe on the side away from the end leaflet (`outer` is -1 or 1). */
const sideLeaflet = (cut: number, outer: number): BladeForm => ({
  body: 0.31,
  lobes: [
    { angle: 0, reach: 0.7, width: 0.46 },
    { angle: outer * 1.0, reach: 0.3 + 0.14 * cut, width: 0.32 },
    { angle: -outer * 0.85, reach: 0.12 + 0.08 * cut, width: 0.3 },
    { angle: outer * 2.05, reach: 0.12, width: 0.5 },
    { angle: -outer * 2.0, reach: 0.06, width: 0.5 },
  ],
  sinus: { depth: 0.5, width: 0.45 },
  teeth: 7,
  toothDepth: 0.2,
  fold: 0.3,
  arch: 0.16,
  width: LEAFLET_WIDTH * 0.96,
});

/** The simple leaf of a short shoot: broadly ovate and heart-shaped at the base, three-lobed (`cut` 1) or only toothed (`cut` 0). */
const simpleBlade = (cut: number): BladeForm => ({
  body: 0.42 - 0.06 * cut,
  lobes: [
    { angle: 0, reach: 0.6, width: 0.5 },
    { angle: -0.95, reach: 0.12 + 0.24 * cut, width: 0.34 },
    { angle: 0.95, reach: 0.12 + 0.24 * cut, width: 0.34 },
    { angle: -2.05, reach: 0.16, width: 0.55 },
    { angle: 2.05, reach: 0.16, width: 0.55 },
  ],
  sinus: { depth: 0.6, width: 0.5 },
  teeth: 8,
  toothDepth: 0.17,
  fold: 0.26,
  arch: 0.16,
  width: BLADE_WIDTH,
});

const STALK_SIDES = [5, 4, 3] as const;

/** A stalk as part of the leaf's axis, sampling the pale midrib of the leaf texture. */
function leafStalk(mg: Merge, points: V3[], from: number, to: number, lod: number): void {
  mg.tube(
    points,
    points.map((_, i) => lerp(from, to, i / (points.length - 1))),
    STALK_SIDES[lod]!,
    WHITE,
    WHITE,
    MIDRIB,
  );
}

/** A blade set on the end of its own little stalk, which leaves `from` at `yaw` from the leaf's axis. */
function setLeaflet(mg: Merge, bladeGeometry: THREE.BufferGeometry, from: V3, yaw: number, stalk: number, length: number, droop: number, roll: number, tone: number, vary: number, lod: number): void {
  const out = new V3(Math.sin(yaw), 0, Math.cos(yaw));
  const base = from.clone().addScaledVector(out, stalk).add(new V3(0, -0.012, 0));
  if (lod < 2 && stalk > 0.02) leafStalk(mg, [from.clone(), from.clone().lerp(base, 0.5).add(new V3(0, 0.006, 0)), base], 0.0085, 0.007, lod);
  const q = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, yaw);
  q.multiply(new THREE.Quaternion().setFromAxisAngle(X_AXIS, droop));
  q.multiply(new THREE.Quaternion().setFromAxisAngle(Z_AXIS, roll));
  mg.add(bladeGeometry, new THREE.Matrix4().compose(base, q, new V3(length, length, length)), [tone, tone, tone], base, vary);
}

/** How deeply each variant of the ternate leaf is lobed. */
const TERNATE_CUT = [0.25, 0.6, 1] as const;

/**
 * The leaf of a long shoot: a long stalk, and three leaflets on stalks of
 * their own. One unit long from the stem to the tip of the end leaflet.
 */
function makeTernateLeaf(variant: number, lod: number): THREE.BufferGeometry {
  const rng = new RNG(4100 + variant * 37);
  const cut = TERNATE_CUT[variant]!;
  const mg = new Merge(true);
  // stalk, end leaflet's stalk and end leaflet in the proportions of Bean's stalk and the Cretan Flora's leaflet
  const endStalkM = 0.22 * LEAFLET_M;
  const whole = STALK_M + endStalkM + LEAFLET_M;
  const stalk = STALK_M / whole;
  const endLength = LEAFLET_M / whole;
  const sag = rng.range(0.02, 0.05);
  const fork = new V3(0, -sag, stalk);
  // the stalk is a little kinked: it is what feels for a hold
  const kink = rng.range(-0.035, 0.035);
  const n = [6, 3, 2][lod]!;
  leafStalk(
    mg,
    Array.from({ length: n + 1 }, (_, i) => {
      const t = i / n;
      return new V3(kink * Math.sin(Math.PI * t), -sag * t * t + 0.02 * Math.sin(Math.PI * t), stalk * t);
    }),
    0.0125,
    0.0095,
    lod,
  );
  if (LEAFLETS >= 3) {
    for (const side of [-1, 1]) {
      const blade = lobedBlade(sideLeaflet(cut, side), lod, 11 + variant * 3 + side);
      setLeaflet(mg, blade, fork, side * rng.range(0.95, 1.2), 0.2 * endLength, endLength * rng.range(0.8, 0.9), rng.range(0.1, 0.32), -side * rng.range(0.05, 0.3), rng.range(0.92, 1.06), rng.f(), lod);
    }
  }
  setLeaflet(mg, lobedBlade(endLeaflet(cut), lod, 7 + variant), fork, rng.range(-0.1, 0.1), 1 - stalk - endLength, endLength, rng.range(0.05, 0.2), rng.range(-0.15, 0.15), rng.range(0.95, 1.08), rng.f(), lod);
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, 0, 0.55), 0.75);
  return g;
}

/** The leaf of a short shoot: a stalk and one blade. Variant 0 is only toothed, 1 and 2 three-lobed. */
function makeSimpleLeaf(variant: number, lod: number): THREE.BufferGeometry {
  const rng = new RNG(4300 + variant * 41);
  const cut = SIMPLE_LOBES >= 3 ? [0.1, 0.7, 1][variant]! : 0.1;
  const mg = new Merge(true);
  const sag = rng.range(0.02, 0.05);
  const n = [5, 3, 2][lod]!;
  leafStalk(
    mg,
    Array.from({ length: n + 1 }, (_, i) => {
      const t = i / n;
      return new V3(0.02 * Math.sin(Math.PI * t) * (variant - 1), -sag * t * t + 0.025 * Math.sin(Math.PI * t), SIMPLE_STALK * t);
    }),
    0.013,
    0.01,
    lod,
  );
  const base = new V3(0, -sag, SIMPLE_STALK);
  const length = 1 - SIMPLE_STALK;
  const q = new THREE.Quaternion().setFromAxisAngle(X_AXIS, rng.range(0.08, 0.25));
  q.multiply(new THREE.Quaternion().setFromAxisAngle(Z_AXIS, rng.range(-0.15, 0.15)));
  mg.add(lobedBlade(simpleBlade(cut), lod, 23 + variant), new THREE.Matrix4().compose(base, q, new V3(length, length, length)), WHITE, base, rng.f());
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, 0, 0.5), 0.7);
  return g;
}

/**
 * RHS: "glossy dark green leaves"; the Clematis Society: young leaves light
 * green. Evergreen, so the autumn colours are its greens again. The bronze
 * tinge the RHS gives it in winter is not drawn: the data gives an evergreen
 * leaf no season.
 */
const LEAF_PALETTE = {
  greenA: lin('#35602a'),
  greenB: lin('#4d7a30'),
  young: lin('#a5ba60'),
  autumnA: lin('#4d7a30'),
  autumnB: lin('#35602a'),
} as const;

const ternateLeaf: LeafAsset = {
  key: 'clematis-cirrhosa-freckles/leaf',
  variants: TERNATE_CUT.length,
  lods: 3,
  make: makeTernateLeaf,
  budget: [1700, 320, 70],
  pick: (_lengthM, r) => Math.min(TERNATE_CUT.length - 1, Math.floor(r * TERNATE_CUT.length)),
  palette: LEAF_PALETTE,
  // glossy, and rather leathery: less light comes through than through a thin leaf
  roughness: 0.3,
  translucency: 0.3,
  detailReach: 0.55,
};

const shortShootLeaf: LeafAsset = {
  key: 'clematis-cirrhosa-freckles/short-shoot-leaf',
  variants: 3,
  lods: 3,
  make: makeSimpleLeaf,
  budget: [600, 110, 30],
  pick: (_lengthM, r) => Math.min(2, Math.floor(r * 3)),
  palette: LEAF_PALETTE,
  roughness: 0.3,
  translucency: 0.3,
  detailReach: 0.5,
};

// ---------------------------------------------------------------------------
// The stalk a flower or a seed head is carried on, and its cup of bracts
// ---------------------------------------------------------------------------

/** The Clematis Society, of the cultivar: flowers 5 to 7.5 cm across. The flower's unit of length. */
const FLOWER_M = middle('flower.widthM');
/** Bean and Flora Europaea: stalks 1 to 2 in., pedicels 2 to 5 cm. */
const FLOWER_STALK_M = middle('flower.stalkLengthM');
/**
 * The floras: two bracts joined in a cup just beneath the flower. Where on the stalk it sits and how wide it is are
 * read from a photograph of the cultivar, and say so in the morphology file.
 */
const CUP_AT = characterNumber(morphology, 'flower.bractCupAlongStalk');
const CUP_M = characterNumber(morphology, 'flower.bractCupWidthM');

const STALK = { green: lin('#7c9150'), bronze: lin('#8f8a58'), cup: lin('#6f9347'), cupRim: lin('#9fbb72') };

/**
 * A stalk that runs out along -Y from the origin (the way the data says it
 * runs from its node) and bends over towards -Z (the sky is +Z) through
 * `nod` radians, so that what it carries hangs. `length` in the model's units.
 */
function noddingStalk(length: number, nod: number, sway: number): { at(s: number): V3; tangent(s: number): V3; end: V3; axis: V3 } {
  const radius = length / nod;
  const at = (s: number) => {
    const phi = s * nod;
    return new V3(sway * Math.sin(Math.PI * s), -radius * Math.sin(phi), -radius * (1 - Math.cos(phi)));
  };
  const tangent = (s: number) => at(Math.min(1, s + 0.01)).sub(at(Math.max(0, s - 0.01))).normalize();
  return { at, tangent, end: at(1), axis: tangent(1) };
}

/** Two unit vectors square to `axis`: the first as near to +X as it will go. */
function square(axis: V3): [V3, V3] {
  const a = X_AXIS.clone().addScaledVector(axis, -axis.x).normalize();
  return [a, new V3().crossVectors(axis, a).normalize()];
}

/**
 * The cup of two joined bracts, opening along `axis` from `centre`: it clasps
 * the base of the flower, and its rim runs out into the two bracts' points.
 */
function bractCup(centre: V3, axis: V3, width: number, [around, along]: readonly [number, number]): THREE.BufferGeometry {
  const [e1, e2] = square(axis);
  const sb = new Surf();
  sb.surf(around, along, (u, v) => {
    const th = u * TAU;
    // how far round towards the point of the nearer bract this is: 1 at a point, 0 between the two
    const lobe = Math.max(0, Math.cos(2 * th)) ** 1.2;
    const r = lerp(0.1, 0.5, Math.pow(v, 0.6)) * width * (1 + 0.12 * lobe * v);
    const h = (0.32 * v + 0.5 * v * v * lobe) * width;
    const p = centre
      .clone()
      .addScaledVector(axis, h - 0.22 * width)
      .addScaledVector(e1, Math.cos(th) * r)
      .addScaledVector(e2, Math.sin(th) * r);
    return { p: [p.x, p.y, p.z], c: mix(STALK.cup, STALK.cupRim, v * v * (0.5 + 0.5 * lobe)) };
  });
  return sb.build();
}

// ---------------------------------------------------------------------------
// Flower
// ---------------------------------------------------------------------------

const TEPALS = characterNumber(morphology, 'flower.tepalCount');
/** The Clematis Society, of the cultivar: the four sepals 3 to 4 cm long and 2 to 2.5 cm wide. In flower widths. */
const TEPAL_LENGTH = middle('flower.tepalLengthM') / FLOWER_M;
const TEPAL_WIDTH = middle('flower.tepalWidthM') / FLOWER_M;
const FLOWER_STALK = FLOWER_STALK_M / FLOWER_M;
const FLOWER_CUP = CUP_M / FLOWER_M;
/**
 * The Society's width is of the flower with its sepals spread. As it hangs it is a broad bell, and its mouth is
 * narrower than that: by how much is read from a photograph of the cultivar.
 */
const MOUTH = characterNumber(morphology, 'flower.mouthShareOfWidth');
/** No count or length of the stamens is published: both are read from a photograph, and say so in the morphology file. */
const STAMENS = characterNumber(morphology, 'flower.stamenCount');
const STAMEN_LENGTH = characterNumber(morphology, 'flower.stamenLengthM') / FLOWER_M;

/**
 * "Creamy pink on the outside and creamy white on the inside" with "reddish
 * maroon dots" (Clematis Society); "heavily speckled red within" (RHS); the
 * "spots merging together" (a garden's record). In a photograph of the
 * cultivar the freckles are a crimson that leans to magenta, in short streaks
 * along the tepal that run together through its middle and leave the margin
 * and the tip cream. Stamens "green-yellow".
 */
const FRECKLES = {
  creamIn: lin('#f8f2dc'),
  throat: lin('#cfdb94'),
  deep: lin('#7a1a4c'),
  crimson: lin('#b32e66'),
  creamOut: lin('#f2e8c2'),
  pink: lin('#d58fa6'),
  baseOut: lin('#c2d08a'),
  filament: lin('#f0edc8'),
  anther: lin('#efe39a'),
  style: lin('#dfe8b0'),
  carpel: lin('#93a45c'),
};

/**
 * The line a tepal follows from the stalk to its tip, seen from the side, as
 * a photograph of the cultivar shows it: out from the stalk in a rounded
 * shoulder, then down the side of the bell, then a little outwards at the
 * tip. The slope of the side is found so that the tip stands `tipRadius`
 * from the axis. Returns the distance from the axis, the distance along it
 * and the angle off the axis, for v from 0 to 1.
 */
function bellLine(length: number, tipRadius: number, start: number): (v: number) => { r: number; h: number; a: number } {
  const N = 48;
  const SHOULDER = 1.35;
  const angle = (side: number, v: number) => lerp(SHOULDER, side, smoothstep(0, 0.26, v)) + 0.32 * smoothstep(0.7, 1, v) ** 1.3;
  const line = (side: number) => {
    const r = [start];
    const h = [0];
    for (let i = 1; i <= N; i++) {
      const a = angle(side, (i - 0.5) / N);
      r.push(r[i - 1]! + (Math.sin(a) * length) / N);
      h.push(h[i - 1]! + (Math.cos(a) * length) / N);
    }
    return { r, h };
  };
  let low = 0;
  let high = 1.3;
  for (let i = 0; i < 30; i++) {
    const side = (low + high) / 2;
    if (line(side).r[N]! < tipRadius) low = side;
    else high = side;
  }
  const side = (low + high) / 2;
  const { r, h } = line(side);
  return (v) => {
    const x = Math.min(N - 1e-6, Math.max(0, v * N));
    const i = Math.floor(x);
    const t = x - i;
    return { r: lerp(r[i]!, r[i + 1]!, t), h: lerp(h[i]!, h[i + 1]!, t), a: angle(side, v) };
  };
}

/** Where the freckles have run together: the middle of the tepal, from near the throat to past half way. */
const merged = (u: number, v: number): number => smoothstep(0.07, 0.24, v) * (1 - smoothstep(0.5, 0.9, v)) * (1 - smoothstep(0.3, 0.85, Math.abs(u)));
/** How thickly the inside of a tepal is freckled at a point: thickest where they merge, thinning to the margin and the tip, none in the throat. */
const freckling = (u: number, v: number): number =>
  Math.min(0.93, 0.5 + 0.45 * merged(u, v)) * smoothstep(0.03, 0.12, v) * (1 - 0.55 * smoothstep(0.86, 1, Math.abs(u))) * (1 - 0.45 * smoothstep(0.9, 1, v));

/** One stamen, standing along +Y from the origin, one unit long: a flattened filament and an anther shorter than it (Flora of Turkey). */
function stamenGeometry(lod: number): THREE.BufferGeometry {
  const sb = new Surf();
  const filament = 0.68;
  sb.surf(lod === 0 ? 2 : 1, lod === 0 ? 3 : 1, (u, v) => {
    const w = lerp(0.04, 0.02, v);
    return { p: [(u - 0.5) * 2 * w, v * filament, 0.01 * Math.sin(Math.PI * u)], c: mix(FRECKLES.filament, FRECKLES.anther, v * 0.4) };
  });
  const [around, along] = lod === 0 ? [4, 2] : [3, 1];
  sb.surf(around, along, (u, v) => {
    const th = u * TAU;
    const r = 0.034 * Math.sin(Math.PI * (0.12 + 0.76 * v));
    return { p: [Math.cos(th) * r * 1.25, filament + v * (1 - filament), Math.sin(th) * r * 0.7], c: FRECKLES.anther };
  });
  return sb.build();
}

const FLOWER_VARIANTS = 3;
/** How far over each variant's stalk bends (radians), and how far its tepals stand from the axis at the tip (flower widths). */
const NOD = [1.45, 1.25, 1.6] as const;
const TIP_RADIUS = [MOUTH / 2, (MOUTH / 2) * 0.98, (MOUTH / 2) * 1.06] as const;
/** [across, along] the inner face of a tepal, its outer face, the stalk and the cup; share of the stamens drawn; styles. Level 2 has one face. */
const FLOWER_DETAIL = [
  { inner: [24, 40], outer: [14, 24], stalk: [6, 12], cup: [16, 5], stamens: 1, styles: 10 },
  { inner: [10, 14], outer: [5, 7], stalk: [4, 6], cup: [8, 3], stamens: 0.32, styles: 0 },
  { inner: [3, 4], outer: null, stalk: [3, 3], cup: null, stamens: 0, styles: 0 },
] as const;

function makeFlower(variant: number, lod: number): THREE.BufferGeometry {
  const detail = FLOWER_DETAIL[lod]!;
  const mg = new Merge(false);
  const stalk = noddingStalk(FLOWER_STALK, NOD[variant]!, (variant - 1) * 0.03);
  const top = stalk.end;
  const axis = stalk.axis;
  const [e1, e2] = square(axis);

  // ---- the stalk, and the cup of bracts that clasps the base of the flower: axis, they stay
  const [stalkSides, stalkSegs] = detail.stalk;
  mg.tube(
    Array.from({ length: stalkSegs + 1 }, (_, i) => stalk.at(i / stalkSegs)),
    Array.from({ length: stalkSegs + 1 }, (_, i) => lerp(0.011, 0.014, i / stalkSegs) * (lod === 2 ? 1.8 : 1)),
    stalkSides,
    STALK.bronze,
    STALK.green,
  );
  if (detail.cup) {
    const at = stalk.at(CUP_AT);
    mg.add(bractCup(at, stalk.tangent(CUP_AT), FLOWER_CUP, detail.cup), ID, WHITE, at, -1);
  }

  // ---- the tepals: parts, each pivoting where it joins
  const line = bellLine(TEPAL_LENGTH, TIP_RADIUS[variant]!, 0.03);
  const halfWidth = (v: number) => (TEPAL_WIDTH / 2) * Math.pow(Math.sin(Math.PI * Math.pow(0.1 + 0.9 * v, 1.08)), 0.4);
  for (let k = 0; k < TEPALS; k++) {
    const theta = (k / TEPALS) * TAU + Math.PI / TEPALS + variant * 0.5;
    const er = e1.clone().multiplyScalar(Math.cos(theta)).addScaledVector(e2, Math.sin(theta));
    const et = e1.clone().multiplyScalar(-Math.sin(theta)).addScaledVector(e2, Math.cos(theta));
    // alternate tepals lie outside their neighbours, as they did in the bud
    const lift = k % 2 === 0 ? 0.014 : 0;
    const wave = hash2(variant * 13 + k, 3) * TAU;
    const point = (u: number, v: number, sheet: number): V3 => {
      const { r, h, a } = line(v);
      const bend = (u * halfWidth(v)) / Math.max(r + lift, 0.15);
      const out = er.clone().multiplyScalar(Math.cos(bend)).addScaledVector(et, Math.sin(bend));
      // square to the tepal, towards its outer face
      const normal = out.clone().multiplyScalar(Math.cos(a)).addScaledVector(axis, -Math.sin(a));
      // the margins turn back a little towards the tip, the face is not quite even, and it is faintly ribbed along its veins
      const off = 0.012 * u ** 4 * v * v + 0.006 * Math.sin(v * 7 + wave) * u * u + 0.003 * Math.cos(u * Math.PI * 3) * (1 - v ** 3) + sheet * 0.004 * (1 - u ** 4) * (1 - v ** 8);
      return top
        .clone()
        .addScaledVector(axis, h)
        .addScaledVector(out, r + lift)
        .addScaledVector(normal, off);
    };
    const face = (segs: readonly [number, number], sheet: number, colour: (u: number, v: number, i: number, j: number) => RGB): THREE.BufferGeometry => {
      const sb = new Surf();
      const [nu, nv] = segs;
      sb.surf(nu, nv, (u01, v) => {
        const u = u01 * 2 - 1;
        const p = point(u, v, sheet);
        return { p: [p.x, p.y, p.z], c: colour(u, v, Math.round(u01 * nu), Math.round(v * nv)) };
      });
      return sb.build();
    };
    // the inside: creamy white, green in the throat, freckled crimson in short streaks that run together through the middle
    const inside = (u: number, v: number, i: number, j: number): RGB => {
      let c = mix(FRECKLES.creamIn, FRECKLES.throat, 1 - smoothstep(0, 0.14, v));
      c = mix(c, FRECKLES.crimson, 0.42 * merged(u, v));
      const column = i + k * 53 + variant * 211;
      const row = Math.floor((j + hash2(column, 7) * 3) / 2);
      if (hash2(column * 31 + row, 17 + k) < freckling(u, v)) c = mix(c, mix(FRECKLES.deep, FRECKLES.crimson, hash2(row, column)), 0.7 + 0.3 * hash2(column, row + 99));
      // less light reaches the bottom of the bell
      const shade = 0.74 + 0.26 * smoothstep(0, 0.5, v);
      return [c[0] * shade, c[1] * shade, c[2] * shade];
    };
    // the outside: cream, green at the base, flushed pink where the freckles show through
    const outside = (u: number, v: number, i: number, j: number): RGB => {
      // an even flush where the freckles are thickest, and over it the freckles themselves, faintly, streak for streak
      const column = i + k * 19 + variant * 7;
      const row = Math.floor((j + hash2(column, 7) * 3) / 2);
      const fleck = hash2(column * 31 + row, 5 + k) < freckling(u, v) * 0.8 ? 0.2 : 0;
      return mix(mix(FRECKLES.creamOut, FRECKLES.baseOut, 1 - smoothstep(0, 0.2, v)), FRECKLES.pink, 0.24 * merged(u, v) + fleck);
    };
    // from far off the two faces are one: cream, crimson where the freckles are
    const both = (u: number, v: number): RGB => mix(FRECKLES.creamOut, mix(FRECKLES.pink, FRECKLES.crimson, 0.6), 0.2 + 0.5 * merged(u, v));
    const t = (k % 2) * 0.06;
    if (detail.outer) {
      mg.add(face(detail.inner, -1, inside), ID, WHITE, top, t);
      mg.add(face(detail.outer, 1, outside), ID, WHITE, top, t);
    } else {
      mg.add(face(detail.inner, 0, both), ID, WHITE, top, t);
    }
  }

  // ---- the head of carpels with its tuft of silky styles: axis, the beginning of the seed head
  const knob = new Surf();
  const [knobAround, knobAlong] = lod === 0 ? [8, 4] : lod === 1 ? [5, 2] : [4, 1];
  knob.surf(knobAround, knobAlong, (u, v) => {
    const th = u * TAU;
    const r = 0.04 * Math.sin(Math.PI * (0.5 + 0.5 * v) * 0.98);
    const p = top
      .clone()
      .addScaledVector(axis, 0.065 * v)
      .addScaledVector(e1, Math.cos(th) * r)
      .addScaledVector(e2, Math.sin(th) * r);
    return { p: [p.x, p.y, p.z], c: mix(FRECKLES.carpel, FRECKLES.style, v) };
  });
  mg.add(knob.build(), ID, WHITE, top, -1);
  for (let i = 0; i < detail.styles; i++) {
    const a = (i / detail.styles) * TAU + hash2(variant, i) * 0.9;
    const tilt = 0.1 + 0.28 * hash2(i, variant + 4);
    const dir = axis
      .clone()
      .multiplyScalar(Math.cos(tilt))
      .addScaledVector(e1, Math.sin(tilt) * Math.cos(a))
      .addScaledVector(e2, Math.sin(tilt) * Math.sin(a));
    const from = top.clone().addScaledVector(axis, 0.045);
    mg.tube([from, from.clone().addScaledVector(dir, 0.1 * (0.8 + 0.4 * hash2(i + 9, variant)))], [0.008, 0.004], 3, FRECKLES.carpel, FRECKLES.style);
  }

  // ---- the stamens: parts, opening just after the tepals and falling just after them
  const count = Math.round(STAMENS * detail.stamens);
  if (count > 0) {
    const one = stamenGeometry(lod);
    const basis = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const a = i * 2.39996 + variant;
      // the outer ones lean out most
      const tilt = 0.08 + 0.5 * Math.sqrt((i + 0.5) / count);
      const dir = axis
        .clone()
        .multiplyScalar(Math.cos(tilt))
        .addScaledVector(e1, Math.sin(tilt) * Math.cos(a))
        .addScaledVector(e2, Math.sin(tilt) * Math.sin(a));
      const side = new V3().crossVectors(dir, axis).normalize();
      // a right-handed frame, so that the stamen is not turned inside out
      const face = new V3().crossVectors(side, dir);
      const length = STAMEN_LENGTH * (0.7 + 0.42 * hash2(i, 31 + variant));
      const from = top.clone().addScaledVector(dir, 0.03);
      basis.makeBasis(side, dir, face).scale(new V3(length * (lod === 1 ? 2 : 1), length, length)).setPosition(from);
      const tone = 0.92 + 0.16 * hash2(i, 77);
      mg.add(one, basis, [tone, tone, tone * 0.96], top, 0.22 + 0.08 * hash2(i, 5));
    }
  }

  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(top.clone().addScaledVector(axis, 0.15), 0.75);
  return g;
}

const flower: FlowerAsset = {
  key: 'clematis-cirrhosa-freckles/flower',
  variants: FLOWER_VARIANTS,
  lods: 3,
  make: makeFlower,
  budget: [12200, 1750, 140],
  pick: (r) => Math.min(FLOWER_VARIANTS - 1, Math.floor(r * FLOWER_VARIANTS)),
  // the width of the flower as the Clematis Society measures it, which is what the growth model's organs.racemeLengthM is for this plant
  authoredSize: 1,
  poise: 'hangs',
  centreAlong: 0.5,
  // a bud is pale green-cream before it opens
  budTint: [0.8, 0.93, 0.66],
  swing: 0.55,
  translucency: 0.4,
  // the tepals are downy outside
  sheen: 0.1,
  detailAt: [1.3, 4],
  detailCaps: [36, 400],
};

// ---------------------------------------------------------------------------
// Seed head
// ---------------------------------------------------------------------------

/** Cretan Flora: achenes 3 to 5 mm. Bean: their plumose styles 1 1/2 to 2 in. long. Together, the seed head's unit of length. */
const ACHENE_M = middle('fruit.acheneLengthM');
const TAIL_M = middle('fruit.tailLengthM');
const SEED_M = ACHENE_M + TAIL_M;
const ACHENE = ACHENE_M / SEED_M;
const TAIL = TAIL_M / SEED_M;
/** Not published: counted roughly in a photograph of the species in fruit, and said to be in the morphology file. */
const ACHENES = characterNumber(morphology, 'fruit.acheneCount');
const SEED_STALK = FLOWER_STALK_M / SEED_M;
const SEED_CUP = CUP_M / SEED_M;

/**
 * Unripe, as a photograph of the species in fruit shows it: green where the
 * achenes are, the tails paling to silky cream-white at their tips. The green
 * of each colour also says how pale that part dries (see `ripeShade`).
 */
const SEED = { base: lin('#8fb45a'), tail: lin('#cfe0a8'), tip: lin('#f1f3e2'), achene: lin('#5d7a34'), stalk: lin('#6f8a48') };

/** Share of the achenes drawn, steps along a tail, vanes of hair to a tail, [around, along] an achene, the stalk and the cup, at each level of detail. */
const SEED_DETAIL = [
  { achenes: 1, steps: 10, vanes: 2, body: [4, 2], stalk: [6, 8], cup: [12, 4] },
  { achenes: 0.55, steps: 4, vanes: 2, body: [3, 1], stalk: [4, 4], cup: [6, 2] },
  { achenes: 0.34, steps: 2, vanes: 2, body: null, stalk: [3, 2], cup: null },
] as const;
const SEED_VARIANTS = 2;

/**
 * The head hangs as the flower did: a brush of achenes at the end of the
 * stalk, their long silky tails falling together and spreading towards their
 * tips. That is the young head; ripe, it fluffs out into a round puff, which
 * one model cannot also be: the tails here spread more than a young head's
 * and less than a ripe one's. The hairs of a tail are drawn as two narrow
 * vanes along it with ragged edges.
 */
function makeSeedHead(variant: number, lod: number): THREE.BufferGeometry {
  const detail = SEED_DETAIL[lod]!;
  const rng = new RNG(5200 + variant * 59);
  const mg = new Merge(false);
  const stalk = noddingStalk(SEED_STALK, variant === 0 ? 1.4 : 1.15, (variant - 0.5) * 0.05);
  const top = stalk.end;
  const axis = stalk.axis;
  const [e1, e2] = square(axis);
  const [stalkSides, stalkSegs] = detail.stalk;
  mg.tube(
    Array.from({ length: stalkSegs + 1 }, (_, i) => stalk.at(i / stalkSegs)),
    Array.from({ length: stalkSegs + 1 }, (_, i) => lerp(0.014, 0.018, i / stalkSegs) * (lod === 2 ? 1.8 : 1)),
    stalkSides,
    SEED.stalk,
    SEED.stalk,
  );
  if (detail.cup) {
    const at = stalk.at(CUP_AT);
    mg.add(bractCup(at, stalk.tangent(CUP_AT), SEED_CUP, detail.cup), ID, [0.85, 0.85, 0.85], at, -1);
  }

  const count = Math.max(5, Math.round(ACHENES * detail.achenes));
  // the fewer tails a coarser head has, the broader each is drawn, so that the head keeps its mass
  const broad = lod === 0 ? 1 : lod === 1 ? 1.5 : 2.4;
  const bodies = new Surf();
  const plumes = new Surf();
  for (let i = 0; i < count; i++) {
    // the achenes stand over a dome at the end of the stalk, the outer ones leaning out most
    const lean = 1.25 * Math.sqrt((i + 0.5) / count);
    const turn = i * 2.39996 + variant * 1.3;
    const outwards = e1.clone().multiplyScalar(Math.cos(turn)).addScaledVector(e2, Math.sin(turn));
    const dir = axis.clone().multiplyScalar(Math.cos(lean)).addScaledVector(outwards, Math.sin(lean)).normalize();
    const from = top.clone().addScaledVector(dir, 0.025);
    const seedEnd = from.clone().addScaledVector(dir, ACHENE);
    if (detail.body) {
      const [a1, a2] = square(dir);
      bodies.surf(detail.body[0], detail.body[1], (u, v) => {
        const th = u * TAU;
        const r = 0.03 * Math.sin(Math.PI * (0.12 + 0.8 * v));
        const p = from
          .clone()
          .addScaledVector(dir, ACHENE * v)
          .addScaledVector(a1, Math.cos(th) * r)
          .addScaledVector(a2, Math.sin(th) * r * 0.6);
        return { p: [p.x, p.y, p.z], c: SEED.achene };
      });
    }
    // the tail: it leaves along its achene's line, falls in with the others, and spreads again towards its tip
    const length = TAIL * rng.range(0.85, 1.08);
    const fall = rng.range(0.55, 0.8);
    const flare = rng.range(0.25, 0.6) * Math.sin(lean);
    const wander = new V3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).multiplyScalar(0.22);
    const fineSteps = 24;
    const fine: V3[] = [seedEnd.clone()];
    const heading = new V3();
    for (let s = 1; s <= fineSteps; s++) {
      const f = (s - 0.5) / fineSteps;
      heading
        .copy(dir)
        .multiplyScalar(1 - fall * smoothstep(0, 0.35, f))
        .addScaledVector(axis, fall * smoothstep(0, 0.35, f) * 1.3)
        .addScaledVector(outwards, flare * smoothstep(0.45, 1, f))
        .addScaledVector(wander, Math.sin(f * 5 + i))
        .normalize();
      fine.push(fine[s - 1]!.clone().addScaledVector(heading, length / fineSteps));
    }
    const along = (f: number): V3 => {
      const x = Math.min(fineSteps - 1e-6, Math.max(0, f * fineSteps));
      const j = Math.floor(x);
      return fine[j]!.clone().lerp(fine[j + 1]!, x - j);
    };
    // a frame carried along the tail without spinning, for the vanes to stand on
    const points: V3[] = [];
    const tangents: V3[] = [];
    const sides: V3[] = [];
    let side = square(dir)[0];
    for (let j = 0; j <= detail.steps; j++) {
      const f = j / detail.steps;
      const tangent = along(Math.min(1, f + 0.02)).sub(along(Math.max(0, f - 0.02))).normalize();
      side = side.clone().addScaledVector(tangent, -side.dot(tangent)).normalize();
      points.push(along(f));
      tangents.push(tangent);
      sides.push(side);
    }
    const spin = rng.range(0, TAU);
    for (let m = 0; m < detail.vanes; m++) {
      // two vanes, one each side of the tail, so that it is a feather and not a blade
      const round = spin + (m / detail.vanes) * TAU;
      plumes.surf(1, detail.steps, (u, v) => {
        const j = Math.round(v * detail.steps);
        const at = points[j]!;
        const colour = v < 0.25 ? mix(SEED.base, SEED.tail, v / 0.25) : mix(SEED.tail, SEED.tip, (v - 0.25) / 0.75);
        if (u < 0.5) return { p: [at.x, at.y, at.z], c: colour };
        const tangent = tangents[j]!;
        const other = new V3().crossVectors(tangent, sides[j]!);
        const out = sides[j]!.clone().multiplyScalar(Math.cos(round)).addScaledVector(other, Math.sin(round));
        // the hairs are short at the achene and longest past the middle; the edge of the vane is ragged, hair by hair
        const reach = (0.012 + 0.05 * Math.pow(Math.sin(Math.PI * Math.pow(v, 0.7) * 0.94), 0.7)) * broad * (lod === 0 ? (j % 2 === 0 ? 0.5 : 1) * (0.8 + 0.4 * hash2(i * 7 + m, j)) : 0.8);
        const p = at.clone().addScaledVector(out, reach).addScaledVector(tangent, reach * 0.7);
        return { p: [p.x, p.y, p.z], c: mix(colour, SEED.tip, 0.6) };
      });
    }
  }
  if (detail.body) mg.add(bodies.build(), ID, WHITE, top, -1);
  mg.add(plumes.build(), ID, WHITE, top, -1);
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(top.clone().addScaledVector(axis, 0.5), 1.1);
  return g;
}

const seedHead: FruitAsset = {
  key: 'clematis-cirrhosa-freckles/seed-head',
  variants: SEED_VARIANTS,
  lods: 3,
  make: makeSeedHead,
  budget: [2400, 520, 110],
  pick: (r) => Math.min(SEED_VARIANTS - 1, Math.floor(r * SEED_VARIANTS)),
  // one achene with its tail, which is what the growth model's fruit.lengthM measures for this plant
  authoredSize: 1,
  poise: 'hangs',
  centreAlong: 0.9,
  // the tails dry from silky green-white to pale fluff, the achenes to brown
  ripe: lin('#f0e8d2'),
  ripeShade: [0.1, 1.15],
  // silky: it shines
  roughness: 0.5,
  swing: 0.6,
  detailAt: [1.2, 4],
  detailCaps: [30, 300],
};

// ---------------------------------------------------------------------------
// The hold: a leaf stalk that has taken a turn round its support
// ---------------------------------------------------------------------------

const COIL = { green: lin('#6f7d48'), tip: lin('#7c7448') };
/** A leaf stalk of middling length (Bean: 1/2 to 1 1/2 in.), against which a wire's thickness is drawn. */
const TYPICAL_STALK_MM = STALK_M * 1000;
const STALK_RADIUS = 0.026;

/**
 * The stalk leaves the stem along +Z, goes once and a quarter round what its
 * stem lies along, which stands beside the stem and runs with it (+Y, near
 * enough), and carries on to where its leaflets were. `wireMm` is the
 * thickness of what it holds; 0, it found nothing and is only crooked.
 */
function makeStalkCoil(wireMm: number, lod: number): THREE.BufferGeometry {
  const mg = new Merge(false);
  const pts: V3[] = [];
  if (wireMm > 0) {
    const radius = wireMm / 2 / TYPICAL_STALK_MM + STALK_RADIUS;
    const centre = radius + 0.02;
    const turns = 1.25;
    const n = lod === 0 ? 26 : 7;
    for (let i = 0; i <= n; i++) {
      const psi = (i / n) * turns * TAU;
      pts.push(new V3(radius * Math.sin(psi), 0.16 * (i / n), centre - radius * Math.cos(psi)));
    }
    // it comes off the wire heading on along +Z, and rises a little towards the light
    const from = pts[pts.length - 1]!;
    const m = lod === 0 ? 8 : 3;
    for (let i = 1; i <= m; i++) {
      const t = i / m;
      pts.push(new V3(from.x - 0.1 * t * t, from.y + 0.16 * t * t, lerp(from.z, 0.95, t)));
    }
  } else {
    const n = lod === 0 ? 16 : 6;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      // a crook part of the way along, where it felt for something to hold
      const crook = Math.exp(-(((t - 0.45) / 0.14) ** 2));
      pts.push(new V3(0.12 * crook, 0.1 * t + 0.1 * crook * Math.sin(t * 9), 0.95 * t));
    }
  }
  mg.tube(
    pts,
    pts.map((_, i) => STALK_RADIUS * (1 - 0.3 * (i / (pts.length - 1)))),
    lod === 0 ? 5 : 3,
    COIL.green,
    COIL.tip,
  );
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, 0, 0.5), 0.75);
  return g;
}

/** What each variant holds: a 5 mm cable, something of 8 mm, nothing. */
const COIL_WIRE_MM = [5, 8, 0] as const;

const stalkCoil: AppendageAsset = {
  key: 'clematis-cirrhosa-freckles/leaf-stalk-coil',
  variants: COIL_WIRE_MM.length,
  lods: 2,
  make: (variant, lod) => makeStalkCoil(COIL_WIRE_MM[variant]!, lod),
  budget: [360, 64],
  pick: (_r, holding, heldDiameterMm) => (!holding ? 2 : (heldDiameterMm ?? 5) > 6.5 ? 1 : 0),
  // Cretan Flora: "old petioles indurate": the stalk that has hold hardens and browns, and outlasts its leaflets
  aged: lin('#6a5238'),
  agedDays: [90, 420],
  roughness: 0.75,
  swing: 0,
  detailAt: [1.2],
  detailCaps: [200],
};

// ---------------------------------------------------------------------------
// The look
// ---------------------------------------------------------------------------

/**
 * Slender shoots, green at first (Bean: silky-hairy when young), then brown;
 * the stems are "striate" (Flora of Turkey), and old clematis wood is pale and
 * stringy, which is how the old bark is drawn for want of a description of
 * this species' own.
 */
const wood: WoodLook = {
  young: lin('#7d7244'),
  mature: lin('#7f4a3a'),
  old: [0.84, 0.76, 0.63],
  woodyDays: [100, 330],
  oldDays: [520, 1500],
  furrowDays: [300, 1500],
  furrow: 0.4,
  stiffDays: [60, 420],
  relief: 2.6,
  roughness: 0.93,
  // long, fine, straight strings
  grain: { streaks: 820, width: 1.4, wobble: 3 },
};

export const look: TaxonLook = {
  taxonId: 'clematis-cirrhosa-freckles',
  provisional: false,
  leaves: { default: ternateLeaf, short_shoot: shortShootLeaf },
  flowers: { default: flower },
  fruits: { default: seedHead },
  appendages: { leaf_stalk_coil: stalkCoil },
  wood,
};
