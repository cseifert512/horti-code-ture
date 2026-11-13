// Clematis 'Princess Diana' (Texensis Group): a leaf-stalk climber of
// herbaceous habit, cut to the ground each February, that flowers on the growth
// of the year from July into October.
//
//   leaf     a leaf of three or five broad, heart-based, pointed leaflets, each
//            on a stalk of its own. One unit long along +Z, upper side +Y.
//   flower   one tulip-shaped flower standing on a long stalk that carries a
//            pair of small leafy bracts: four thick pointed tepals held together
//            as a tube below and turned back above, luminous deep pink within
//            with a darker bar, pinkish red on three ribs outside with a pale
//            margin, round a boss of cream stamens. One unit is the length of
//            the flower, which is what the render data gives; the stalk is
//            drawn beyond that. Four variants, from a flower just open to one
//            flared wide: the flower opens wider as it ages, which the organ
//            program cannot play, so a plant shows all four at once.
//   fruit    the seed head on the same kind of stalk: a ball of achenes, each
//            with a curling feathered tail. One unit is its width.
//   hold     a leaf stalk that has taken a turn and a quarter round a wire and
//            the stem that lies on it
//   wood     thin ridged shoots, maroon on the sunny side, ripening to a pale
//            stringy brown
//
// Counts and sizes of the real plant come from species/clematis-princess-diana/
// morphology.json, where each has its source or says that it is an assumption.
// Proportions that only shape the drawing (how far a tepal curls) are here.
//
// This module is this clematis's alone and imports no other taxon's.
import * as THREE from 'three';
import { characterNumber, characterRange, parseMorphology } from '@horti/core';
import morphologyJson from '../../../../../species/clematis-princess-diana/morphology.json';
import { RNG, clamp, hash2, lerp, smoothstep } from '../../util.ts';
import { GROUND, Merge, type PalmateVeins, type RGB, Surf, WHITE, lin, mix, palmateBlade, palmateTexture, path, veinUv } from '../kit.ts';
import { type AppendageAsset, type FlowerAsset, type FruitAsset, type LeafAsset, THIN_LEAF, type TaxonLook, type WoodLook } from '../look.ts';

const morphology = parseMorphology(morphologyJson, 'species/clematis-princess-diana/morphology.json');

const V3 = THREE.Vector3;
type V3 = THREE.Vector3;
const TAU = Math.PI * 2;
const AX = new V3(1, 0, 0);
const AY = new V3(0, 1, 0);
const AZ = new V3(0, 0, 1);
const IDENTITY = new THREE.Matrix4();
const mid = (r: readonly [number, number]): number => (r[0] + r[1]) / 2;
const bump = (x: number, at: number, width: number): number => Math.exp(-(((x - at) / width) ** 2));

// ---------------------------------------------------------------------------
// Leaf
// ---------------------------------------------------------------------------
/** Leaves of three leaflets and of five (morphology: leaf.leafletCount). */
const [FEW_LEAFLETS, MANY_LEAFLETS] = characterRange(morphology, 'leaf.leafletCount');
const LEAFLET_M = mid(characterRange(morphology, 'leaf.leafletLengthM'));
/** A leaflet's width for its length, measured from where its stalk joins to its tip. */
const LEAFLET_ASPECT = characterNumber(morphology, 'leaf.leafletWidthToLength');
const LEAF_STALK_M = mid(characterRange(morphology, 'leaf.stalkLengthM'));
const [LEAFLET_STALK_SHORT_M, LEAFLET_STALK_LONG_M] = characterRange(morphology, 'leaf.leafletStalkLengthM');
/** The end leaflet has the longest stalk of its own, the side leaflets shorter ones; the pairs of a leaf of five stand as far apart as the end stalk is long. */
const END_STALK_M = lerp(LEAFLET_STALK_SHORT_M, LEAFLET_STALK_LONG_M, 0.65);
const SIDE_STALK_M = lerp(LEAFLET_STALK_SHORT_M, LEAFLET_STALK_LONG_M, 0.25);

/** The length of a whole leaf of `leaflets` leaflets, in metres, built up from its parts. */
const leafLengthM = (leaflets: number): number => LEAF_STALK_M + ((leaflets - 1) / 2 - 1) * END_STALK_M + END_STALK_M + LEAFLET_M;

const LEAF_LODS = 3;
/** Segments round a leaflet and out from its stalk. Even numbers round, so that the tip and the notch are both on the outline. */
const LEAFLET_SEGS: [number, number][] = [
  [32, 5],
  [12, 2],
  [6, 1],
];

/**
 * The outline of a leaflet: a heart. Broadest close above where the stalk
 * joins, with a rounded lobe to either side of a shallow notch there, its
 * sides running nearly straight to a blunt end with a short point on it.
 * `lobe` adds one basal lobe on that side: a mitten. The surface is given
 * afterwards (leafletBlade).
 */
const leafletShape = (lobe: -1 | 0 | 1) => ({
  // a broad body, a blunt end (a wide forward lobe) with a short point on it, and two rounded lobes either side of a
  // narrow notch at the base: the heart of photographs 06 and 10, not the spade of an ovate-acute leaflet
  body: 0.46,
  lobes: [
    { angle: 0, reach: 0.4, width: 0.95 },
    { angle: 0, reach: 0.07, width: 0.12 },
    { angle: 2.45, reach: 0.06, width: 0.35 },
    { angle: -2.45, reach: 0.06, width: 0.35 },
    ...(lobe === 0 ? [] : [{ angle: lobe * 1.35, reach: 0.2, width: 0.22 }]),
  ],
  sinus: { depth: 0.96, width: 0.42 },
  fold: 0,
  arch: 0,
});

/**
 * The veins of a leaflet: three from its base (Gibson, of the parent C. texensis: "3 veined at base"; morphology:
 * leaf.mainVeinsFromBase), the midrib and two that curve up towards the tip, with a fainter pair into the basal lobes;
 * secondaries off the midrib, and a fine net between, all faint: the photographs show a smooth blade on which the
 * veins are barely paler than the blade (06, 07, 10).
 */
const VEIN_ANGLE = characterNumber(morphology, 'leaf.mainVeinAngleDeg');
const VEIN_RAD = (VEIN_ANGLE * Math.PI) / 180;
const LEAFLET_VEINS: PalmateVeins = {
  origin: 0.2,
  span: 1.25,
  main: [
    { deg: 0, length: 0.95 },
    { deg: -VEIN_ANGLE, length: 0.62 },
    { deg: VEIN_ANGLE, length: 0.62 },
    { deg: -2.3 * VEIN_ANGLE, length: 0.26 },
    { deg: 2.3 * VEIN_ANGLE, length: 0.26 },
  ],
  secondary: { angle: 48, spacing: 0.13, first: 0.2, reach: 0.28, curve: 18 },
  net: { cell: 0.055, jitter: 0.85 },
  width: { main: 0.02, secondary: 0.009, net: 0.0035 },
  ground: 0.74,
  pale: { main: 0.16, secondary: 0.09, net: 0.035 },
  tint: { main: 0.5, secondary: 0.35, net: 0.15 },
  relief: { vein: 0.45, pucker: 0.25 },
  seed: 31,
};
if (LEAFLET_VEINS.main.length - 2 !== characterNumber(morphology, 'leaf.mainVeinsFromBase')) throw new Error('the leaflet texture is drawn with a different number of strong veins from the base from its morphology');

/** How wide the unlobed outline comes out for a length of one, so that it can be brought to the width the morphology file gives. */
const LEAFLET_WIDTH_AS_BUILT = (() => {
  const g = palmateBlade(leafletShape(0), [72, 1], false);
  g.computeBoundingBox();
  return g.boundingBox!.max.x - g.boundingBox!.min.x;
})();

const leafletCache = new Map<string, THREE.BufferGeometry>();
/** `widen`: this leaflet's width for its length against the file's, so that leaflets differ as they do in the photographs. */
function leafletBlade(lod: number, lobe: -1 | 0 | 1, widen = 1): THREE.BufferGeometry {
  const key = `${lod}/${lobe}/${widen.toFixed(3)}`;
  let g = leafletCache.get(key);
  if (!g) {
    g = palmateBlade(leafletShape(lod === 2 ? 0 : lobe), LEAFLET_SEGS[lod]!, lod === 0);
    const aspect = LEAFLET_ASPECT * widen;
    g.scale(aspect / LEAFLET_WIDTH_AS_BUILT, 1, 1);
    // The surface: nearly flat, the two halves lifted a little from a sunken midrib, the tip turned down, the margin
    // gently waved; close to, the three main veins that leave the base together are pressed into it.
    const pos = g.getAttribute('position');
    const uv = g.getAttribute('uv');
    const half = aspect / 2;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const across = x / half;
      // the leaflet's own texture, laid on the flat blade from the point where its veins meet (its stalk's end)
      uv.setXY(i, ...veinUv(LEAFLET_VEINS, x, z));
      let y = 0.03 * Math.abs(x) + 0.035 * (1 - across * across) * Math.sin(Math.PI * clamp(z, 0, 1)) - 0.13 * Math.max(0, z) ** 2.4 - 0.05 * across * across * Math.max(0, z) ** 2;
      if (lod === 0) {
        const out = Math.hypot(x, z);
        const theta = Math.atan2(x, z + 0.04);
        const veins = bump(theta, 0, 0.06) + 0.8 * (bump(theta, VEIN_RAD, 0.07) + bump(theta, -VEIN_RAD, 0.07)) * smoothstep(0.02, 0.2, out) * (1 - smoothstep(0.45, 0.8, out));
        y += -0.012 * veins * smoothstep(0, 0.08, out) + 0.014 * Math.sin(z * 12 + across * 1.7) * across * across;
      } else if (lod === 1) {
        y += 0.01 * Math.sin(z * 12) * across * across;
      }
      pos.setY(i, y);
    }
    g.computeVertexNormals();
    leafletCache.set(key, g);
  }
  return g;
}

/** A leaf: how many leaflets, which side leaflet (counted from the base, left then right) is lobed, and the seed its posture is drawn from. */
interface LeafPlan {
  leaflets: number;
  lobed: number;
  seed: number;
  /** The leaflets' width for their length against the file's (morphology: leaf.leafletWidthSpread). */
  widen: number;
}
const [WIDEN_LOW, WIDEN_HIGH] = characterRange(morphology, 'leaf.leafletWidthSpread');
const LEAF_PLANS: readonly LeafPlan[] = [
  { leaflets: FEW_LEAFLETS, lobed: -1, seed: 3, widen: WIDEN_HIGH },
  { leaflets: FEW_LEAFLETS, lobed: 1, seed: 17, widen: WIDEN_LOW },
  { leaflets: MANY_LEAFLETS, lobed: -1, seed: 29, widen: 1 },
  { leaflets: MANY_LEAFLETS, lobed: 2, seed: 41, widen: (1 + WIDEN_HIGH) / 2 },
];

function makeLeaf(variant: number, lod: number): THREE.BufferGeometry {
  const plan = LEAF_PLANS[variant]!;
  const rng = new RNG(900 + plan.seed);
  const mg = new Merge(true);
  const pairs = (plan.leaflets - 1) / 2;
  const toUnits = 1 / leafLengthM(plan.leaflets);
  const stalk = LEAF_STALK_M * toUnits;
  const step = END_STALK_M * toUnits;
  const leafletLength = LEAFLET_M * toUnits;
  const axisEnd = 1 - leafletLength;
  // the stalk and the axis beyond it: wiry, arching a little, never quite straight
  const arch = rng.range(0.1, 0.16);
  const sway = rng.range(-0.05, 0.05);
  const at = (z: number) => new V3(sway * Math.sin((Math.PI * z) / axisEnd), -arch * z * z, z);
  const NS = [10, 5, 2][lod]!;
  const radial = [6, 4, 3][lod]!;
  const axis = path(NS, (t) => at(t * axisEnd));
  mg.tube(
    axis,
    axis.map((_, i) => lerp(0.0105, 0.0065, i / NS)),
    radial,
    WHITE,
    WHITE,
    GROUND,
  );

  const q = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const m = new THREE.Matrix4();
  let sideLeaflet = 0;
  const put = (z: number, side: -1 | 0 | 1, ownStalk: number, length: number): void => {
    const from = at(z);
    const yaw = side === 0 ? rng.range(-0.18, 0.18) : side * rng.range(0.95, 1.3);
    // leaflets hang from their stalks, faces turned out and down, not held as level plates (photographs 05, 06)
    const dip = rng.range(0.12, 0.5);
    const out = new V3(Math.sin(yaw) * Math.cos(dip), -Math.sin(dip), Math.cos(yaw) * Math.cos(dip));
    const base = from.clone().addScaledVector(out, ownStalk);
    if (lod < 2) mg.tube([from, from.clone().lerp(base, 0.5).add(new V3(0, 0.006, 0)), base], [0.0065, 0.0058, 0.0052], radial, WHITE, WHITE, GROUND);
    const lobe: -1 | 0 | 1 = side !== 0 && sideLeaflet === plan.lobed ? side : 0;
    if (side !== 0) sideLeaflet++;
    // the blade carries on from its stalk, turned a little forward, hanging a little, rolled a little
    q.setFromAxisAngle(AY, yaw - side * rng.range(0.0, 0.3));
    q.multiply(q2.setFromAxisAngle(AX, dip + rng.range(0.15, 0.5)));
    q.multiply(q2.setFromAxisAngle(AZ, rng.range(-0.3, 0.3) - side * 0.18));
    const s = length * rng.range(0.94, 1.06);
    m.compose(base, q, new V3(s, s, s));
    const tone = rng.range(0.92, 1.08);
    mg.add(leafletBlade(lod, lobe, plan.widen), m, [tone, tone, tone], base, rng.f());
  };
  for (let p = 0; p < pairs; p++) {
    const z = stalk + p * step;
    // the lowest pair is the smallest
    const size = leafletLength * lerp(0.84, 0.94, pairs === 1 ? 1 : p / (pairs - 1));
    put(z, -1, SIDE_STALK_M * toUnits * rng.range(0.8, 1.2), size);
    put(z, 1, SIDE_STALK_M * toUnits * rng.range(0.8, 1.2), size);
  }
  // the end leaflet stands at the end of the axis, which is its stalk
  put(axisEnd, 0, 0, leafletLength);
  const g = mg.build();
  // the leaflets hang from their stalks, which draws the leaf in: bring its farthest point back to one unit from the
  // stem, so that the length in the data is the length drawn (TAXON_LOOKS.md section 2)
  const pos = g.getAttribute('position');
  const part = g.getAttribute('aPart');
  let farthest = 0;
  for (let i = 0; i < pos.count; i++) farthest = Math.max(farthest, pos.getZ(i));
  const k = 0.98 / farthest;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
    part.setXYZ(i, part.getX(i) * k, part.getY(i) * k, part.getZ(i) * k);
  }
  g.boundingSphere = new THREE.Sphere(new V3(0, 0, 0.5), 0.85);
  return g;
}

// ---------------------------------------------------------------------------
// What the flower and the seed head share: a long stalk with a pair of bracts
// ---------------------------------------------------------------------------
const FLOWER_M = mid(characterRange(morphology, 'flower.lengthM'));
const STALK_M = mid(characterRange(morphology, 'flower.stalkLengthM'));
const BRACT_M = mid(characterRange(morphology, 'flower.bractLengthM'));
const BRACTS = characterNumber(morphology, 'flower.bractCount');

const GREEN = {
  stalkLow: lin('#74843f'),
  stalkHigh: lin('#7a3f4c'),
  bract: lin('#5f8a48'),
  bractPale: lin('#86a85e'),
};

/** How a stalk stands: how far it leans from plumb by its top (radians), which way (0 is away from the support, towards -Z), and how it wavers. */
interface Stance {
  lean: number;
  azimuth: number;
  seed: number;
}

/** The centre line of a stalk `length` long from the origin, standing along +Y and leaning over towards its top. Returns the points, and the way the top points. */
function stalkLine(stance: Stance, length: number, n: number): { points: V3[]; top: V3; axis: V3 } {
  const points: V3[] = [new V3(0, 0, 0)];
  const p = new V3(0, 0, 0);
  const dir = new V3(0, 1, 0);
  const wobble = hash2(stance.seed, 5) * TAU;
  const fine = 48;
  for (let i = 1; i <= fine; i++) {
    const s = i / fine;
    const tilt = stance.lean * Math.pow(s, 1.5);
    const az = stance.azimuth + 0.35 * Math.sin(s * 3.1 + wobble);
    dir.set(Math.sin(tilt) * Math.sin(az), Math.cos(tilt), -Math.sin(tilt) * Math.cos(az));
    p.addScaledVector(dir, length / fine);
    if ((i * n) % fine === 0) points.push(p.clone());
  }
  return { points, top: p.clone(), axis: dir.clone().normalize() };
}

/**
 * The stalk and its bracts, added as the axis of the organ: they stay when
 * petals drop. `length` and `bract` are in the units of the model; `tint`
 * dulls them for a stalk that has carried its flower.
 */
function addStalk(mg: Merge, stance: Stance, length: number, bract: number, thickness: number, lod: number, tint: Readonly<RGB>, bractTint: Readonly<RGB> = tint): { top: V3; axis: V3 } {
  const n = [12, 6, 3][lod]!;
  const { points, top, axis } = stalkLine(stance, length, n);
  const tinted = (c: Readonly<RGB>, by: Readonly<RGB> = tint): RGB => [c[0] * by[0], c[1] * by[1], c[2] * by[2]];
  const low = tinted(GREEN.stalkLow);
  const high = tinted(GREEN.stalkHigh);
  mg.tube(
    points,
    points.map((_, i) => thickness * lerp(1.25, 0.9, i / n) * (i === n ? 1.5 : 1)),
    [6, 4, 3][lod]!,
    low,
    high,
  );
  // a pair of small leaves on the stalk, a little under half way up, opposite one another
  const at = points[Math.round(n * 0.42)]!;
  const along = points[Math.min(n, Math.round(n * 0.42) + 1)]!.clone().sub(points[Math.max(0, Math.round(n * 0.42) - 1)]!).normalize();
  const side = new V3().crossVectors(along, AZ).normalize();
  const q = new THREE.Quaternion();
  const m = new THREE.Matrix4();
  const basis = new THREE.Matrix4();
  for (let b = 0; b < BRACTS && bract > 0; b++) {
    const turn = (b / BRACTS) * TAU + hash2(stance.seed, 9) * 0.6;
    // out from the stalk and up at an angle
    const out = side.clone().applyAxisAngle(along, turn);
    const reach = out.clone().multiplyScalar(0.8).addScaledVector(along, 0.6).normalize();
    const upper = new V3().crossVectors(reach, new V3().crossVectors(along, reach)).normalize();
    basis.makeBasis(new V3().crossVectors(upper, reach), upper, reach);
    q.setFromRotationMatrix(basis);
    const s = bract * (0.85 + 0.3 * hash2(stance.seed, 13 + b));
    m.compose(at, q, new V3(s, s, s));
    mg.add(leafletBlade(Math.min(2, lod + 1), 0), m, tinted(mix(GREEN.bract, GREEN.bractPale, hash2(stance.seed, 21 + b)), bractTint), at, -1);
  }
  return { top, axis };
}

// ---------------------------------------------------------------------------
// Flower
// ---------------------------------------------------------------------------
const TEPALS = characterNumber(morphology, 'flower.tepalCount');
/** Half the width of a tepal at its widest, in flower lengths. */
const TEPAL_HALF = characterNumber(morphology, 'flower.tepalWidthToLength') / 2;
/** How far up the tepals stand together as a tube, in a flower that has just opened. */
const TUBE_SHARE = characterNumber(morphology, 'flower.tubeShareOfLength');
const STAMENS = Math.round(mid(characterRange(morphology, 'flower.stamenCount')));
const STAMEN_M = mid(characterRange(morphology, 'flower.stamenLengthM'));

/** One unit of the flower model is the length of the flower: what RenderFlower.lengthM measures for this taxon (morphology: flower.sizeMeasure). */
const FLOWER_UNIT = 1;
const STALK_IN_FLOWERS = STALK_M / FLOWER_M;
const BRACT_IN_FLOWERS = BRACT_M / FLOWER_M;
const STAMEN_IN_FLOWERS = STAMEN_M / FLOWER_M;

const PINK = {
  // within: luminous deep pink, slightly mauve, with a deep pink bar; brighter at the margin, pale in the throat
  inner: lin('#d62a78'),
  innerEdge: lin('#ec6aa6'),
  bar: lin('#b9165c'),
  throat: lin('#f3c4cf'),
  // without: pinkish red along three ribs, a pale margin, green where it joins the stalk
  rib: lin('#a3174e'),
  outerEdge: lin('#f1aec8'),
  joint: lin('#9aa860'),
  filament: lin('#f3ecca'),
  anther: lin('#e7d684'),
  maroon: lin('#7a2a48'),
  style: lin('#d9e2a6'),
};

/** A flower as it stands on a day of its life: how far its tepals have turned back (0 just open, 1 flared wide), and how its stalk stands. */
interface Bloom extends Stance {
  flare: number;
}
const BLOOMS: readonly Bloom[] = [
  { flare: 0.12, lean: 0.3, azimuth: 0.35, seed: 11 },
  { flare: 0.32, lean: 0.8, azimuth: -0.5, seed: 23 },
  // flared wide, as in photograph 10: tip to tip within the 5-7 cm the file gives
  { flare: 0.5, lean: 1.25, azimuth: 0.15, seed: 37 },
  { flare: 0.66, lean: 0.95, azimuth: -0.3, seed: 51 },
];
const FLOWER_LODS = 3;
/** Segments across and along one face of a tepal. */
const TEPAL_SEGS: [number, number][] = [
  [14, 26],
  [5, 9],
  [2, 4],
];

/** The line down the middle of a tepal, seen from the side: how far out from the axis of the flower and how far along it, for each share of its length. */
function tepalProfile(flare: number, tipAngle: number): { r: number[]; h: number[]; psi: number[]; tube: number } {
  const n = 56;
  // an older flower stands open lower down as well
  const tube = TUBE_SHARE * (1 - 0.5 * flare);
  const waist = lerp(-0.1, 0.22, flare);
  // a flower just open turns only its tips back; one flared wide spreads from low down
  const turn = lerp(1.6, 1.05, flare);
  const psi = (v: number): number => {
    // straight out from the stalk and round into the swollen base of the tube: an urn, not a funnel
    if (v < 0.16) return lerp(1.5, 0.3, smoothstep(0, 0.16, v));
    // the tube, drawn in a little above its base
    if (v < tube) return lerp(0.3, waist, (v - 0.16) / (tube - 0.16));
    // the free part turns out and back
    return waist + (tipAngle - waist) * Math.pow((v - tube) / (1 - tube), turn);
  };
  const r = [0.04];
  const h = [0];
  const angles = [psi(0)];
  for (let i = 1; i <= n; i++) {
    const a = psi((i - 0.5) / n);
    r.push(r[i - 1]! + Math.sin(a) / n);
    h.push(h[i - 1]! + Math.cos(a) / n);
    angles.push(psi(i / n));
  }
  return { r, h, psi: angles, tube };
}

const sample = (table: readonly number[], v: number): number => {
  const x = clamp(v, 0, 1) * (table.length - 1);
  const i = Math.min(table.length - 2, Math.floor(x));
  return lerp(table[i]!, table[i + 1]!, x - i);
};

/** A stamen one unit long along +Y: a filament and, for its upper two fifths, an anther. */
const stamenCache: THREE.BufferGeometry[] = [];
function stamenGeometry(lod: number): THREE.BufferGeometry {
  stamenCache[lod] ??= (() => {
    const sb = new Surf();
    const [around, along] = lod === 0 ? [5, 6] : [3, 1];
    sb.surf(around, along, (u, v) => {
      const th = u * TAU;
      // a flattened filament, then the anther, a little stouter, rounded off at its tip
      const r = lod === 0 ? lerp(0.012, 0.009, smoothstep(0, 0.5, v)) + 0.011 * smoothstep(0.5, 0.62, v) * (1 - smoothstep(0.9, 1, v) * 0.8) : lerp(0.02, 0.028, v);
      return { p: [Math.cos(th) * r, v, Math.sin(th) * r * 0.7], c: mix(PINK.filament, PINK.anther, smoothstep(0.5, 0.64, v)) };
    });
    return sb.build();
  })();
  return stamenCache[lod]!;
}

function makeFlower(variant: number, lod: number): THREE.BufferGeometry {
  const bloom = BLOOMS[variant]!;
  const mg = new Merge(false);
  const { top: centre, axis } = addStalk(mg, bloom, STALK_IN_FLOWERS, BRACT_IN_FLOWERS, 0.014, lod, WHITE);
  // two directions square to the axis of the flower, to lay the tepals round it
  const right = new V3().crossVectors(axis, AZ).normalize();
  const fore = new V3().crossVectors(right, axis).normalize();
  const [nu, nv] = TEPAL_SEGS[lod]!;

  for (let k = 0; k < TEPALS; k++) {
    const theta = (k / TEPALS) * TAU + 0.5 + (hash2(bloom.seed, k) - 0.5) * 0.1;
    const R = right.clone().multiplyScalar(Math.cos(theta)).addScaledVector(fore, Math.sin(theta));
    const T = right.clone().multiplyScalar(-Math.sin(theta)).addScaledVector(fore, Math.cos(theta));
    // each tepal turns back by its own amount, and leans a little to one side as it does
    const tipAngle = lerp(0.55, 2.05, bloom.flare) + (hash2(bloom.seed + 1, k) - 0.5) * 0.35;
    const skew = (hash2(bloom.seed + 2, k) - 0.5) * 0.16 * (0.4 + bloom.flare);
    const profile = tepalProfile(bloom.flare, tipAngle);
    const phase = hash2(bloom.seed + 3, k) * TAU;

    /** A point of the tepal: `u` across it (-1 to 1), `v` along it, `lift` out from its middle surface towards the outside. */
    const at = (u: number, v: number, lift: number): V3 => {
      const r = sample(profile.r, v);
      const h = sample(profile.h, v);
      const psi = sample(profile.psi, v);
      // in the tube a tepal is a quarter of the way round; above it, as wide as a tepal is
      // broadest a little under half way, then drawn out to a long point
      const free = clamp((v - 0.45) / 0.55, 0, 1);
      const limb = TEPAL_HALF * Math.pow(1 - free, 1.1) * (1 + 0.9 * free) + 0.004;
      const fitted = ((1.04 * TAU) / (2 * TEPALS)) * r;
      const hw = Math.min(fitted, limb) - 0.02 * bump(fitted - limb, 0, 0.05);
      // its cross-section is an arc: round the axis in the tube, a channel above it
      const opened = smoothstep(profile.tube - 0.05, profile.tube + 0.25, v);
      const rho = lerp(r, Math.max(0.07, 1.25 * hw), opened);
      const beta = (u * hw) / rho;
      const outward = R.clone().multiplyScalar(Math.cos(psi)).addScaledVector(axis, -Math.sin(psi));
      let off = lift;
      // the margin of the free part is crisped
      if (lod === 0) off += 0.014 * Math.sin(v * 26 + phase) * u * u * u * u * opened;
      return centre
        .clone()
        .addScaledVector(R, r)
        .addScaledVector(axis, h)
        .addScaledVector(T, rho * Math.sin(beta) + skew * v * v * opened)
        .addScaledVector(outward, off - rho * (1 - Math.cos(beta)));
    };
    const inside = (u: number, v: number): RGB => {
      let c = mix(PINK.inner, PINK.innerEdge, 0.75 * smoothstep(0.55, 1, Math.abs(u)));
      c = mix(c, PINK.bar, bump(u, 0, 0.3) * (0.9 - 0.4 * v));
      return mix(c, PINK.throat, 0.7 * (1 - smoothstep(0.02, 0.17, v)));
    };
    const outside = (u: number, v: number): RGB => {
      // the pale margin is widest low on the tube and runs out towards the tip
      let c = mix(PINK.rib, PINK.outerEdge, smoothstep(0.62, 0.98, Math.abs(u)) * (1 - 0.6 * smoothstep(0.55, 1, v)));
      // the ribs themselves are a shade deeper than the band they stand on
      c = mix(c, PINK.bar, 0.4 * (bump(u, 0, 0.1) + bump(Math.abs(u), 0.34, 0.08)));
      return mix(c, PINK.joint, 0.7 * (1 - smoothstep(0, 0.07, v)));
    };
    const tone = 0.95 + 0.1 * hash2(bloom.seed + 4, k);
    const sb = new Surf();
    if (lod < 2) {
      // a tepal is thick: an outer face and an inner one, meeting at the margin
      const thick = (u: number) => 0.011 * (1 - u ** 6);
      const ribs = (u: number, v: number) => (lod === 0 ? 0.012 * (bump(u, 0, 0.13) + 0.8 * bump(Math.abs(u), 0.36, 0.1)) * (1 - 0.6 * v) : 0);
      sb.surf(nu, nv, (u01, v) => {
        const u = u01 * 2 - 1;
        const p = at(u, v, thick(u) + ribs(u, v));
        return { p: [p.x, p.y, p.z], c: outside(u, v) };
      });
      sb.surf(nu, nv, (u01, v) => {
        const u = 1 - u01 * 2;
        const p = at(u, v, -thick(u));
        return { p: [p.x, p.y, p.z], c: inside(u, v) };
      });
    } else {
      // from far off: one face, the outside's colours on the tube and the inside's on the part that is turned back
      sb.surf(nu, nv, (u01, v) => {
        const u = u01 * 2 - 1;
        const p = at(u, v, 0);
        return { p: [p.x, p.y, p.z], c: mix(outside(u, v), inside(u, v), smoothstep(profile.tube - 0.1, profile.tube + 0.2, v)) };
      });
    }
    // the tepals part nearly together: opposite ones first
    mg.add(sb.build(), IDENTITY, [tone, tone, tone], centre, (k % 2) * 0.06 + Math.floor(k / 2) * 0.03);
  }

  // The boss of stamens round the styles. Tagged to open late and to drop late: it is shut in the bud, and is what is
  // left standing when the tepals have fallen.
  const m = new THREE.Matrix4();
  const basis = new THREE.Matrix4();
  const stand = (dir: V3, from: V3, length: number, width: number, tint: Readonly<RGB>, t: number, geometry: THREE.BufferGeometry): void => {
    const x = new V3().crossVectors(dir, Math.abs(dir.z) > 0.9 ? AX : AZ).normalize();
    basis.makeBasis(x, dir, new V3().crossVectors(x, dir));
    m.copy(basis).scale(new V3(width, length, width)).setPosition(from);
    mg.add(geometry, m, tint, centre, t);
  };
  if (lod < 2) {
    const n = lod === 0 ? STAMENS : Math.round(STAMENS / 3);
    const width = lod === 0 ? 1 : 1.5;
    for (let i = 0; i < n; i++) {
      const ring = Math.sqrt((i + 0.5) / n);
      const a = i * 2.39996 + hash2(bloom.seed, 40 + i);
      // a close boss that stays inside the tube, opening out a little as the flower flares
      const tilt = (0.16 + 0.12 * bloom.flare) * ring;
      const dir = axis
        .clone()
        .multiplyScalar(Math.cos(tilt))
        .addScaledVector(right, Math.sin(tilt) * Math.cos(a))
        .addScaledVector(fore, Math.sin(tilt) * Math.sin(a));
      const from = centre
        .clone()
        .addScaledVector(right, 0.045 * ring * Math.cos(a))
        .addScaledVector(fore, 0.045 * ring * Math.sin(a))
        .addScaledVector(axis, 0.035);
      // the outermost are flushed maroon, the rest cream
      const tint: RGB = ring > 0.82 ? mix(WHITE, [0.55, 0.22, 0.32], 0.75) : WHITE;
      stand(dir, from, STAMEN_IN_FLOWERS * lerp(0.82, 1.08, hash2(bloom.seed, 80 + i)), width, tint, 0.78 + i * 1e-4, stamenGeometry(lod));
    }
    // the styles, in the middle, a little longer and greener
    const styles = lod === 0 ? 7 : 3;
    for (let i = 0; i < styles; i++) {
      const a = (i / styles) * TAU;
      const dir = axis
        .clone()
        .addScaledVector(right, 0.07 * Math.cos(a))
        .addScaledVector(fore, 0.07 * Math.sin(a))
        .normalize();
      stand(dir, centre.clone().addScaledVector(axis, 0.03), STAMEN_IN_FLOWERS * 1.12, width * 0.7, [PINK.style[0] / PINK.filament[0], PINK.style[1] / PINK.filament[1], PINK.style[2] / PINK.filament[2]], 0.9, stamenGeometry(lod));
    }
  } else {
    // from far off: one pale tuft
    const sb = new Surf();
    sb.surf(3, 1, (u, v) => {
      const th = u * TAU;
      const r = lerp(0.03, 0.09, v);
      const p = centre
        .clone()
        .addScaledVector(axis, 0.03 + STAMEN_IN_FLOWERS * v)
        .addScaledVector(right, r * Math.cos(th))
        .addScaledVector(fore, r * Math.sin(th));
      return { p: [p.x, p.y, p.z], c: mix(PINK.filament, PINK.anther, v) };
    });
    mg.add(sb.build(), IDENTITY, WHITE, centre, 0.78);
  }

  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(centre.clone().multiplyScalar(0.6), STALK_IN_FLOWERS * 0.6 + 1.2);
  return g;
}

// ---------------------------------------------------------------------------
// Seed head
// ---------------------------------------------------------------------------
const HEAD_M = mid(characterRange(morphology, 'fruit.lengthM'));
const [ACHENES_FEW, ACHENES_MANY] = characterRange(morphology, 'fruit.acheneCount');
const ACHENE_M = mid(characterRange(morphology, 'fruit.acheneLengthM'));
const TAIL_M = mid(characterRange(morphology, 'fruit.tailLengthM'));

/** One unit of the seed-head model is the width of the head across its tails: what RenderFruit.lengthM measures for this taxon (morphology: fruit.sizeMeasure). */
const HEAD_UNIT = 1;
const STALK_IN_HEADS = STALK_M / HEAD_M;
const BRACT_IN_HEADS = BRACT_M / HEAD_M;
const ACHENE_IN_HEADS = ACHENE_M / HEAD_M;
const TAIL_IN_HEADS = TAIL_M / HEAD_M;

/** Unripe: green achenes, pale silky tails. The ripe colour is the asset's; the green painted here still shades it. */
const SEED = {
  achene: lin('#74883f'),
  acheneTip: lin('#93a25a'),
  tail: lin('#b9c687'),
  hair: lin('#e3ead0'),
};

/** A seed head: how many achenes set, and how its stalk stands. */
interface Head extends Stance {
  achenes: number;
}
const HEADS: readonly Head[] = [
  // leaning to one side or the other of where the flowers' stalks lean, so that a head and a flower from one joint stand apart as they do on the plant
  { achenes: ACHENES_FEW, lean: 0.55, azimuth: 1.5, seed: 61 },
  { achenes: Math.round((ACHENES_FEW + ACHENES_MANY) / 2), lean: 0.85, azimuth: -1.5, seed: 67 },
  { achenes: ACHENES_MANY, lean: 0.7, azimuth: 1.75, seed: 71 },
];
const HEAD_LODS = 3;
/** Hairs drawn to a tail close to: enough to read as a feather, far fewer than the tail has. */
const HAIRS_TO_A_TAIL = 64;
const HAIR_IN_HEADS = mid(characterRange(morphology, 'fruit.tailHairLengthM')) / HEAD_M;

/** Slivers, each a triangle of its own: three points and three colours for each. */
function slivers(points: readonly number[], colours: readonly number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  g.setIndex(Array.from({ length: points.length / 3 }, (_, i) => i));
  g.computeVertexNormals();
  return g;
}

function makeSeedHead(variant: number, lod: number): THREE.BufferGeometry {
  const head = HEADS[variant]!;
  const mg = new Merge(false);
  // the stalk that carried the flower, its bracts shrunk and withering; from far off the bracts are not drawn
  const { top: centre, axis } = addStalk(mg, head, STALK_IN_HEADS, lod === 2 ? 0 : BRACT_IN_HEADS * 0.42, 0.013, lod, [0.9, 0.82, 0.7], [1.5, 1.45, 1.2]);
  const right = new V3().crossVectors(axis, AZ).normalize();
  const fore = new V3().crossVectors(right, axis).normalize();
  // nearer than far off, fewer achenes are drawn, each standing for two; from far off none singly
  const n = lod === 0 ? head.achenes : lod === 1 ? Math.round(head.achenes / 2) : 0;
  for (let i = 0; i < n; i++) {
    const sb = new Surf();
    // spread over the ball, all but the part the stalk comes in by
    const polar = Math.acos(1 - 1.62 * ((i + 0.5) / n));
    const a = i * 2.39996 + hash2(head.seed, i) * 0.5;
    const d = axis
      .clone()
      .multiplyScalar(Math.cos(polar))
      .addScaledVector(right, Math.sin(polar) * Math.cos(a))
      .addScaledVector(fore, Math.sin(polar) * Math.sin(a))
      .normalize();
    const flat = new V3().crossVectors(d, axis);
    if (flat.lengthSq() < 1e-6) flat.copy(right);
    flat.normalize();
    const thin = new V3().crossVectors(d, flat);
    const from = centre.clone().addScaledVector(d, 0.035);
    const tip = from.clone().addScaledVector(d, ACHENE_IN_HEADS);
    // the tail: on from the achene, never straight, curling over to one side or the other
    const curl = lerp(1.5, 2.7, hash2(head.seed + 1, i)) * (hash2(head.seed + 2, i) < 0.5 ? -1 : 1);
    const twist = (hash2(head.seed + 3, i) - 0.5) * 1.6;
    const steps = [6, 3, 1][lod]!;
    const tail: V3[] = [tip.clone()];
    const heading = d.clone();
    const turnAbout = flat.clone().applyAxisAngle(d, twist);
    const p = tip.clone();
    const reach = TAIL_IN_HEADS * lerp(0.85, 1.12, hash2(head.seed + 4, i));
    for (let s = 1; s <= steps; s++) {
      heading.applyAxisAngle(turnAbout, (curl / steps) * (0.75 + (0.5 * s) / steps));
      p.addScaledVector(heading, reach / steps);
      tail.push(p.clone());
    }
    /** A point of the tail `f` of the way along it, and the way it runs there. */
    const along = (f: number): { on: V3; run: V3 } => {
      const x = clamp(f, 0, 1) * steps;
      const s0 = Math.min(steps - 1, Math.floor(x));
      return { on: tail[s0]!.clone().lerp(tail[s0 + 1]!, x - s0), run: tail[s0 + 1]!.clone().sub(tail[s0]!).normalize() };
    };
    if (lod === 0) {
      // the achene: a flattened seed, broadest below the middle
      sb.surf(4, 3, (u, v) => {
        const th = u * TAU;
        const w = Math.pow(Math.sin(Math.PI * Math.pow(v, 0.7)), 0.55);
        const q = from
          .clone()
          .addScaledVector(d, ACHENE_IN_HEADS * v)
          .addScaledVector(flat, 0.045 * w * Math.cos(th))
          .addScaledVector(thin, 0.02 * w * Math.sin(th));
        return { p: [q.x, q.y, q.z], c: mix(SEED.achene, SEED.acheneTip, v) };
      });
      // the tail's own thread
      mg.tube(tail, tail.map((_, s) => lerp(0.007, 0.0025, s / steps)), 3, SEED.tail, SEED.tail);
      // and its feathering: fine hairs all round it and all the way along, each standing forward as it leaves the thread
      const points: number[] = [];
      const colours: number[] = [];
      for (let j = 0; j < HAIRS_TO_A_TAIL; j++) {
        const f = (j + 0.6) / (HAIRS_TO_A_TAIL + 0.6);
        const { on, run } = along(f);
        const outFrom = new V3().crossVectors(run, d);
        if (outFrom.lengthSq() < 0.05) outFrom.copy(flat);
        const hair = outFrom
          .normalize()
          .applyAxisAngle(run, j * 2.39996 + hash2(head.seed + 5, i * 97 + j) * 0.9)
          .multiplyScalar(0.7)
          .addScaledVector(run, 0.72)
          .normalize();
        const long = HAIR_IN_HEADS * lerp(0.85, 1.45, hash2(head.seed + 6, i * 97 + j)) * (1 - 0.4 * f * f);
        const foot = run.clone().multiplyScalar(0.0045);
        const tipOf = on.clone().addScaledVector(hair, long);
        for (const q of [on.clone().sub(foot), on.clone().add(foot), tipOf]) points.push(q.x, q.y, q.z);
        colours.push(...SEED.tail, ...SEED.tail, ...SEED.hair);
      }
      mg.add(slivers(points, colours), IDENTITY, WHITE, centre, i);
    } else if (lod === 1) {
      // nearer than far off: each tail as two feathered strips set crosswise, wider for the achenes it stands for
      for (const across of [flat, thin]) {
        sb.surf(1, steps, (u, v) => {
          const on = v === 0 ? from.clone() : along(v).on;
          const q = on.addScaledVector(across, (u - 0.5) * 0.12 * (1 - 0.7 * v) * (v === 0 ? 0.4 : 1));
          return { p: [q.x, q.y, q.z], c: v === 0 ? SEED.achene : mix(SEED.tail, SEED.hair, 0.5 * Math.abs(u - 0.5) * 2) };
        });
      }
    }
    // each achene carries its own number in the tag (a fruit is not drawn part by part, so the tag does nothing else)
    if (lod < 2) mg.add(sb.build(), IDENTITY, WHITE, centre, i);
  }
  if (lod === 2) {
    // from far off: the whole head as one soft ball, a little uneven
    const sb = new Surf();
    sb.surf(6, 4, (u, v) => {
      const th = u * TAU;
      const polar = v * Math.PI;
      const r = 0.34 * (0.82 + 0.3 * hash2(head.seed + 7, Math.round(u * 6) % 6 * 7 + Math.round(v * 4)));
      const q = centre
        .clone()
        .addScaledVector(axis, 0.08 + r * Math.cos(polar))
        .addScaledVector(right, r * Math.sin(polar) * Math.cos(th))
        .addScaledVector(fore, r * Math.sin(polar) * Math.sin(th));
      return { p: [q.x, q.y, q.z], c: mix(SEED.achene, SEED.tail, 0.55 + 0.45 * Math.sin(polar)) };
    });
    mg.add(sb.build(), IDENTITY, WHITE, centre, 0);
  }
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(centre.clone().multiplyScalar(0.6), STALK_IN_HEADS * 0.6 + 1);
  return g;
}

// ---------------------------------------------------------------------------
// The hold: a leaf stalk wound round a wire and the stem that lies on it
// ---------------------------------------------------------------------------
const COIL_LODS = 2;
const COIL = { green: lin('#6f8044'), flushed: lin('#7a4a4c') };

/**
 * Variants 0 and 1 have hold: a turn and a quarter round something upright
 * that stands just in front of where the stalk leaves the stem (0 round a thin
 * wire, 1 round something up to the thickest it can clasp). Variant 2 found
 * nothing and is only crooked. One unit long from the stem to its far end.
 */
function makeStalkCoil(variant: number, lod: number): THREE.BufferGeometry {
  const mg = new Merge(false);
  const n = [26, 9][lod]!;
  let pts: V3[];
  if (variant < 2) {
    const radius = variant === 0 ? 0.13 : 0.21;
    const centreZ = variant === 0 ? 0.03 : 0.1;
    const turns = 1.25;
    const wound = Math.round(n * 0.72);
    // out of the stem to one side, round the wire and the stem together, climbing a stalk's width with each turn
    pts = path(wound, (t) => {
      const th = t * turns * TAU;
      const r = lerp(0.035, radius, smoothstep(0, 0.25, t));
      return new V3(r * Math.sin(th), 0.05 * turns * t, centreZ - r * Math.cos(th));
    });
    // then on, the way it was going, to where its leaflets would be
    const last = pts[pts.length - 1]!;
    const tail = n - wound;
    for (let i = 1; i <= tail; i++) {
      const t = i / tail;
      // never straight: it bows up and to one side on its way, and its end turns over
      pts.push(new V3(last.x * (1 - 0.7 * t) + 0.07 * Math.sin(Math.PI * t), last.y + 0.14 * Math.sin((Math.PI * t) / 2) - 0.09 * smoothstep(0.75, 1, t), lerp(last.z, 0.97, Math.sin((Math.PI * t) / 2))));
    }
  } else {
    // nothing to clasp: a stalk bent over in an open crook
    pts = path(n, (t) => new V3(0.12 * Math.sin(t * 2.4), 0.1 * Math.sin(Math.PI * t) + (t > 0.75 ? -0.5 * (t - 0.75) ** 2 * 6 : 0), 0.97 * Math.sin((Math.PI * t) / 2)));
  }
  mg.tube(
    pts,
    pts.map((_, i) => 0.021 * (1 - 0.55 * (i / (pts.length - 1)))),
    [5, 3][lod]!,
    COIL.green,
    COIL.flushed,
  );
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, 0, 0.5), 0.75);
  return g;
}

// ---------------------------------------------------------------------------
// The look
// ---------------------------------------------------------------------------
/** A leaf shorter than half way between a leaf of three and a leaf of five has three leaflets. */
const THREE_OR_FIVE_M = (leafLengthM(FEW_LEAFLETS) + leafLengthM(MANY_LEAFLETS)) / 2;

const leaf: LeafAsset = {
  key: 'clematis-princess-diana/leaf',
  variants: LEAF_PLANS.length,
  lods: LEAF_LODS,
  make: makeLeaf,
  budget: [2000, 360, 90],
  pick: (lengthM, r) => (lengthM < THREE_OR_FIVE_M ? 0 : 2) + (r < 0.7 ? 0 : 1),
  // mid green with a faint grey (glaucous) cast, darker and greyer than a first guess (photographs 06, 07, 10); fresh
  // yellow-green when young (18, of 'Duchess of Albany'); yellowing, then brown, as the top growth dies back
  palette: { greenA: lin('#4b6c40'), greenB: lin('#5d7f4f'), young: lin('#8fae55'), autumnA: lin('#b29a3e'), autumnB: lin('#77582f') },
  texture: palmateTexture(LEAFLET_VEINS, 512, 0.8),
  // smooth, a little waxy: a soft sheen in the photographs, not a gloss
  roughness: 0.48,
  translucency: THIN_LEAF,
  detailReach: 0.8,
};

const flower: FlowerAsset = {
  key: 'clematis-princess-diana/flower',
  variants: BLOOMS.length,
  lods: FLOWER_LODS,
  make: makeFlower,
  budget: [9000, 950, 120],
  // on a plant in flower: some just open, most half flared, some flared wide
  pick: (r) => (r < 0.25 ? 0 : r < 0.6 ? 1 : r < 0.85 ? 2 : 3),
  authoredSize: FLOWER_UNIT,
  poise: 'held',
  centreAlong: STALK_IN_FLOWERS * 0.9 + 0.5,
  // the bud: pale faces turned salmon, ribs a dull rose
  budTint: [0.6, 1.05, 0.45],
  swing: 0.35,
  // "luminous": a good deal of light comes through the tepals, thick as they are
  translucency: 0.5,
  sheen: 0.14,
  detailAt: [1.3, 4],
  detailCaps: [50, 400],
};

const seedHead: FruitAsset = {
  key: 'clematis-princess-diana/seed-head',
  variants: HEADS.length,
  lods: HEAD_LODS,
  make: makeSeedHead,
  budget: [4000, 420, 80],
  pick: (r) => Math.min(HEADS.length - 1, Math.floor(r * HEADS.length)),
  authoredSize: HEAD_UNIT,
  poise: 'held',
  centreAlong: STALK_IN_HEADS * 0.9 + 0.3,
  // dry: silver-buff fluff round brown achenes; from afar a soft grey-gold, not a white ball (photographs 09, 12 show the young head; no photograph of a ripe head of the cultivar was found)
  ripe: lin('#d2c7a4'),
  ripeShade: [0.12, 1.1],
  roughness: 0.85,
  swing: 0.45,
  detailAt: [1.2, 3.6],
  detailCaps: [40, 300],
};

const stalkCoil: AppendageAsset = {
  key: 'clematis-princess-diana/leaf-stalk-coil',
  variants: 3,
  lods: COIL_LODS,
  make: makeStalkCoil,
  budget: [270, 60],
  pick: (_r, holding, heldDiameterMm) => (!holding ? 2 : (heldDiameterMm ?? 0) > 8 ? 1 : 0),
  // a stalk that has hold hardens and browns, and outlasts its leaf
  aged: lin('#6e5234'),
  agedDays: [70, 210],
  roughness: 0.8,
  swing: 0,
  detailAt: [1.3],
  detailCaps: [220],
};

/**
 * Thin, ridged, wiry shoots, green at first and maroon where the sun reaches
 * them by midsummer, that ripen to a reddish stringy brown and mostly die back
 * in winter; only the short woody base lasts from year to year. From
 * descriptions of the parent Clematis texensis and photographs of the cultivar
 * and of 'Duchess of Albany', another of the Texensis Group, in spring.
 */
const wood: WoodLook = {
  // a new shoot is green; by midsummer it is maroon where the sun reaches it; by winter the dead top is a pale
  // reddish brown, and so, greyer, is the woody base that lasts
  young: lin('#7f9a4c'),
  mature: lin('#8a4a52'),
  old: [1.02, 0.78, 0.6],
  woodyDays: [35, 110],
  oldDays: [170, 290],
  furrowDays: [150, 700],
  furrow: 0.4,
  stiffDays: [30, 190],
  relief: 2.2,
  roughness: 0.9,
  // long straight fibres that lift in strings
  grain: { streaks: 620, width: 1.8, wobble: 4 },
};

export const look: TaxonLook = {
  taxonId: 'clematis-princess-diana',
  provisional: false,
  leaves: { default: leaf },
  flowers: { default: flower },
  fruits: { default: seedHead },
  appendages: { leaf_stalk_coil: stalkCoil },
  wood,
};
