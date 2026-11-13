// Thunbergia alata (black-eyed Susan vine), a slender herbaceous twiner grown
// outdoors in Britain as an annual. The orange, dark-eyed form of the species.
//
//   leaf     one of an opposite pair: a broad arrow- to heart-shaped blade,
//            widest across its two rounded basal lobes and drawn to a point,
//            with a few blunt angles down each side, five veins spreading from
//            the top of a winged stalk (the wing is what "alata" names), the
//            blade hanging a little from the stalk. Unit length along +Z,
//            upper side +Y
//   flower   a single flower on a long stalk from the leaf axil: two pale
//            green bracts clasping a pale tube that opens flat into five
//            square-ended orange lobes, free of one another in their outer
//            half, round a small near-black eye. In metres; the size the data
//            gives is the width across the lobes
//   capsule  the same stalk and the same two bracts, now parted, holding a
//            hairy capsule with a low round base and a long stout beak: green,
//            drying to tan
//   wood     a thread of green, hairy stem that never turns to wood: the cold
//            kills it in its first autumn
//
// It holds on by twining its stems: no tendrils, no coiling stalks, no
// rootlets, no prickles.
//
// Every count and size of the real plant is read from
// species/thunbergia-alata/morphology.json, where each has its source: a
// published description, or a photograph named there. What is typed here is how
// the model is turned and curved, and its colours.
//
// The corolla falls whole, so its tube and lobes are parts that open and drop
// together; the stalk, the bracts and the little toothed calyx are axis and
// stay. The stamens and style are shut inside the tube and are not drawn.
//
// These shapes and colours are this plant's alone. No other taxon module may
// import this one.
import * as THREE from 'three';
import { characterNumber, characterRange, parseMorphology } from '@horti/core';
import morphologyJson from '../../../../../species/thunbergia-alata/morphology.json';
import { clamp, lerp, smoothstep } from '../../util.ts';
import { GROUND, Merge, type PalmateVeins, type RGB, Surf, lin, mix, palmateTexture, veinUv } from '../kit.ts';
import { type FlowerAsset, type FruitAsset, type LeafAsset, THIN_LEAF, type TaxonLook, type WoodLook } from '../look.ts';

const morphology = parseMorphology(morphologyJson, 'species/thunbergia-alata/morphology.json');

const V3 = THREE.Vector3;
type V3 = THREE.Vector3;
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const IDENTITY = new THREE.Matrix4();
const WHITE: RGB = [1, 1, 1];
type Range = readonly [number, number];
type P2 = readonly [number, number];
const middle = (r: Range): number => (r[0] + r[1]) / 2;
const within = (r: Range, t: number): number => r[0] + (r[1] - r[0]) * t;

// ---------------------------------------------------------------------------
// Leaf
// ---------------------------------------------------------------------------
/** "leaf blades about 3-8 x 3-7.5 cm", on stalks "about 2.5-3.5 cm long" (Australian Tropical Rainforest Plants). */
const BLADE_M = characterRange(morphology, 'leaf.bladeLengthM');
const PETIOLE_M = characterRange(morphology, 'leaf.petioleLengthM');
/** The stalk's length for the blade's, between the middles of the two published ranges. */
const STALK_TO_BLADE = middle(PETIOLE_M) / middle(BLADE_M);
/** How wide the blade is for its length, across the basal lobes. */
const WIDTH_TO_LENGTH = characterRange(morphology, 'leaf.widthToLength');
/** Width across both wings of the stalk, at the stem and at the blade, as a share of the blade's length. */
const WING = characterRange(morphology, 'leaf.petioleWingWidthM').map((w) => w / middle(BLADE_M)) as [number, number];
const TEETH = characterRange(morphology, 'leaf.teethPerSide');
/** Main veins spreading from the top of the stalk: the midrib and the pairs to either side. */
const MAIN_VEINS = characterNumber(morphology, 'leaf.basalVeins');
/** Bearings of the main veins from the midrib, degrees: the inner pair, and the pair into the basal lobes. Read from photographs. */
const INNER_VEIN_DEG = middle(characterRange(morphology, 'leaf.innerVeinAngleDeg'));
/** How far behind the top of the stalk the basal lobes reach, as a share of the blade's length. Read from photographs. */
const LOBE_BACK = characterRange(morphology, 'leaf.lobeBackShare');
/** Where along the midrib the blade is widest above the lobes' shoulders, and how far the tip is drawn out. */
const SHOULDER = characterRange(morphology, 'leaf.shoulderWidthShare');

interface LeafForm {
  /** Width of the blade for its length. */
  ratio: number;
  /** Blunt angles on each side. */
  teeth: number;
  /** How far the basal lobes reach back behind the top of the stalk, in blade lengths. */
  back: number;
  /** Half-width at the shoulder above the lobes, as a share of the greatest half-width. */
  shoulder: number;
  fold: number;
  arch: number;
  /** Which of the palette's two greens it leans to. */
  shade: number;
}

/**
 * Four leaves, as the photographs show them side by side on one shoot: a narrow, arrow-shaped one with the most
 * angles to a side, a middling one, a broad heart-shaped one, and one with an entire margin. Each blade's outline is
 * its own: width, how far the lobes reach back, how full the shoulders are.
 */
const LEAF_FORMS: readonly LeafForm[] = [
  { ratio: within(WIDTH_TO_LENGTH, 0.2), teeth: Math.round(TEETH[1]), back: within(LOBE_BACK, 0.9), shoulder: within(SHOULDER, 0.1), fold: 0.12, arch: 0.08, shade: 0.1 },
  { ratio: within(WIDTH_TO_LENGTH, 0.55), teeth: Math.round(middle(TEETH)), back: within(LOBE_BACK, 0.55), shoulder: within(SHOULDER, 0.5), fold: 0.09, arch: 0.1, shade: 0.3 },
  { ratio: within(WIDTH_TO_LENGTH, 0.9), teeth: Math.round(TEETH[0]), back: within(LOBE_BACK, 0.2), shoulder: within(SHOULDER, 0.9), fold: 0.06, arch: 0.12, shade: 0.45 },
  { ratio: within(WIDTH_TO_LENGTH, 0.7), teeth: 0, back: within(LOBE_BACK, 0.4), shoulder: within(SHOULDER, 0.7), fold: 0.08, arch: 0.11, shade: 0.2 },
];

/** Half-width of the side of the blade as a share of the greatest, by distance along the midrib from the shoulder to the tip. */
function sideAt(z: number, shoulder: number): number {
  // full at the shoulder, then drawn in along a gently convex line to an acuminate tip
  const t = clamp((z - 0.08) / 0.92, 0, 1);
  return lerp(1, shoulder, smoothstep(0, 0.35, t)) * Math.pow(1 - t, 0.85) * (1 + 0.25 * t * (1 - t));
}
/** Where along the midrib the angles of one side stand, by how many there are. */
const TOOTH_AT: readonly (readonly number[])[] = [[], [0.3], [0.5, 0.26], [0.62, 0.43, 0.24]];

/**
 * The right-hand half of the blade's outline, from the tip round to the back of
 * the notch where the stalk joins, as points the outline is drawn through.
 * The stalk joins at the origin; the tip is at z = 1; `w` is half the width.
 */
function bladeKeys(form: LeafForm, coarse: boolean): P2[] {
  const w = form.ratio / 2;
  const back = form.back;
  // the basal lobe: rounded, pointing outwards and a little back, the blade widest across the two of them
  const lobe: P2[] = [
    [w, 0.0],
    [0.9 * w, -0.6 * back],
    [0.6 * w, -back],
    [0.28 * w, -0.7 * back],
    [0.05 * w, -0.15 * back],
  ];
  if (coarse) return [[0, 1], [0.55 * w, 0.5], [0.97 * w, 0.12], lobe[0]!, lobe[2]!, lobe[4]!];
  const at = TOOTH_AT[Math.min(TOOTH_AT.length - 1, Math.max(0, form.teeth))]!;
  const side: P2[] = [];
  // plain points down the side, except where an angle stands
  for (let z = 0.9; z > 0.1; z -= 0.08) if (!at.some((t) => Math.abs(t - z) < 0.08)) side.push([sideAt(z, form.shoulder) * w, z]);
  // an angle: the margin runs out to a blunt corner that leans towards the tip, then draws back in
  const reach = 0.035 * w;
  for (const t of at) {
    side.push([sideAt(t + 0.06, form.shoulder) * w, t + 0.06]);
    side.push([sideAt(t + 0.01, form.shoulder) * w + reach, t + 0.01]);
    side.push([sideAt(t - 0.04, form.shoulder) * w - 0.004, t - 0.04]);
  }
  side.sort((a, b) => b[1] - a[1]);
  return [[0, 1], ...side, [sideAt(0.08, form.shoulder) * w, 0.08], ...lobe];
}

/** A smooth line through `keys`, `per` steps to each: Catmull-Rom, given the point before the first and after the last. */
function through(keys: readonly P2[], per: number, before: P2, after: P2): P2[] {
  const k = (i: number): P2 => (i < 0 ? before : i >= keys.length ? after : keys[i]!);
  const out: P2[] = [];
  for (let i = 0; i < keys.length - 1; i++) {
    const [p0, p1, p2, p3] = [k(i - 1), k(i), k(i + 1), k(i + 2)];
    for (let j = 0; j < per; j++) {
      const t = j / per;
      const c = (a: number, b: number, cc: number, d: number) => 0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t * t + (-a + 3 * b - 3 * cc + d) * t * t * t);
      out.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(keys[keys.length - 1]!);
  return out;
}

/**
 * The veins, in a texture of the leaf's own (the kit's palmateTexture): five main veins from the top of the stalk
 * (leaf.basalVeins), the midrib, an inner pair running up into the blade and an outer pair into the basal lobes,
 * each outer one with a branch on its lower side; secondaries leaving the midrib and the inner pair forwards and
 * looping to the margin; and a fine net between, the blade a little puckered between its lines (leaf.surface: soft
 * and hairy, dull). Paler than the blade (Commons: "Mosca abeja.jpg", "Black eyed susan flower in london.jpg").
 * The flat blade's units are the blade's length from the top of the stalk to the tip.
 */
const VEINS: PalmateVeins = {
  origin: 0.14,
  span: 1.3,
  main: [
    { deg: -104, length: 0.42 },
    { deg: -INNER_VEIN_DEG, length: 0.66 },
    { deg: 0, length: 0.97 },
    { deg: INNER_VEIN_DEG, length: 0.66 },
    { deg: 104, length: 0.42 },
    { deg: -140, length: 0.22, from: { vein: 0, at: 0.35 } },
    { deg: 140, length: 0.22, from: { vein: 4, at: 0.35 } },
  ],
  secondary: {
    angle: characterNumber(morphology, 'leaf.secondaryVeinAngleDeg'),
    spacing: characterNumber(morphology, 'leaf.secondaryVeinSpacing'),
    first: 0.3,
    reach: 0.32,
    curve: 22,
  },
  net: { cell: characterNumber(morphology, 'leaf.veinNetCell'), jitter: 0.85 },
  width: { main: 0.018, secondary: 0.008, net: 0.0022 },
  ground: 0.72,
  pale: { main: 0.2, secondary: 0.12, net: 0.022 },
  tint: { main: 0.75, secondary: 0.5, net: 0.12 },
  relief: { vein: 0.55, pucker: 0.35 },
  seed: 31,
};
if (VEINS.main.filter((m) => !m.from).length !== MAIN_VEINS) throw new Error(`the leaf's texture is drawn with a different number of main veins from the ${MAIN_VEINS} of its morphology`);

/** This leaf's own bearings of the main veins, in the order of VEINS.main, so that the outer pair runs into its lobes. */
function veinBearings(form: LeafForm): number[] {
  const w = form.ratio / 2;
  const lobe = Math.atan2(0.82 * w, -0.45 * form.back) / DEG;
  const inner = INNER_VEIN_DEG * (0.9 + 0.25 * (form.ratio - 0.55));
  return [-lobe, -inner, 0, inner, lobe, -Math.min(178, lobe + 36), Math.min(178, lobe + 36)];
}


/** The blade alone, flat out along +Z from where it joins its stalk (the origin) to its tip at z = 1, upper side +Y. */
function makeBlade(form: LeafForm, lod: number): THREE.BufferGeometry {
  const w = form.ratio / 2;
  const keys = bladeKeys(form, lod === 2);
  const tip = keys[0]!;
  const next = keys[1]!;
  const last = keys[keys.length - 2]!;
  // the two sides meet in a point at the tip, and run smoothly into one another across the notch
  const half = through(keys, [3, 1, 1][lod]!, [2 * tip[0] - next[0], 2 * tip[1] - next[1]], [-last[0], last[1]]);
  const outline: P2[] = [
    ...half
      .slice(1)
      .reverse()
      .map(([x, z]): P2 => [-x, z]),
    ...half,
  ];
  const nu = outline.length - 1;
  const nv = [6, 2, 1][lod]!;
  const bearings = veinBearings(form);
  const sb = new Surf();
  const flat: [number, number][] = [];
  sb.surf(nu, nv, (u, rho) => {
    const [ox, oz] = outline[Math.round(u * nu)]!;
    const x = ox * rho;
    const z = oz * rho;
    flat.push([x, z]);
    // folded a little along the midrib, arched down to the tip, the basal lobes lifting a little
    let y = form.fold * Math.abs(x) - form.arch * z * Math.abs(z);
    if (z < 0.05) y += 0.12 * (0.05 - z) * (Math.abs(x) / w);
    // a wavy margin
    if (lod === 0) y += 0.01 * Math.sin(u * 47 + form.shade * 9) * rho * rho * rho;
    return { p: [x, y, z] };
  });
  // the leaf's own texture, laid flat over the blade and turned on to this leaf's veins
  for (let i = 0; i < flat.length; i++) {
    const [x, z] = flat[i]!;
    const [uu, vv] = veinUv(VEINS, x, z, bearings);
    sb.uv[2 * i] = uu;
    sb.uv[2 * i + 1] = vv;
  }
  return sb.build();
}

/**
 * The angle below the line of its stalk at which each blade is measured for the leaf's one unit (BladeHold.unitAt):
 * on the plant the blade hangs from the top of its stalk at about this angle (leaf.posture). The viewer holds the blade
 * in the world; this keeps the length in the data what the growth model measures, from the stem to the farthest point
 * of the leaf as it is held.
 */
const UNIT_AT = middle(characterRange(morphology, 'leaf.bladeDropDeg'));

/** How far a flat blade of each form reaches along the stalk's line, hung at UNIT_AT, in blade lengths. */
const REACH = LEAF_FORMS.map((form) => {
  const g = makeBlade(form, 0);
  const p = g.getAttribute('position');
  const s = Math.sin(UNIT_AT * DEG);
  const c = Math.cos(UNIT_AT * DEG);
  let most = 0;
  for (let i = 0; i < p.count; i++) most = Math.max(most, p.getY(i) * s + p.getZ(i) * c);
  g.dispose();
  return most;
});

/** A whole leaf, one unit long as held: the winged stalk, then the blade flat out from it (the viewer hangs it). */
function makeLeafGeometry(variant: number, lod: number): THREE.BufferGeometry {
  const form = LEAF_FORMS[variant]!;
  // blade and stalk in their published proportion, sized so that the stalk and the hung blade make one unit
  const blade = 1 / (STALK_TO_BLADE + REACH[variant]!);
  const stalkL = STALK_TO_BLADE * blade;
  const mg = new Merge(true);
  // the stalk rises a little on its way out
  const along = (t: number) => new V3(0, 0.05 * stalkL * Math.sin(Math.PI * t), stalkL * t);
  const steps = [8, 3, 1][lod]!;
  const end = along(1);
  if (lod < 2) {
    const pts: V3[] = [];
    const radii: number[] = [];
    for (let i = 0; i <= steps; i++) {
      pts.push(along(i / steps));
      radii.push(lerp(0.011, 0.008, i / steps));
    }
    mg.tube(pts, radii, [5, 3][lod]!, WHITE, WHITE, GROUND);
  }
  // the wings: a strip of green down either side of the stalk, narrow at the stem and widening towards the blade.
  // Axis, so that it stays with the stalk when the viewer turns the blade
  const wing = new Surf();
  wing.surf(2, steps, (u01, t) => {
    const u = u01 * 2 - 1;
    const p = along(0.05 + 0.9 * t);
    const half = (lerp(WING[0], WING[1], Math.pow(t, 1.4)) * blade) / 2;
    return { p: [u * half, p.y + 0.3 * Math.abs(u) * half + 0.003, p.z] };
  });
  for (let i = 0; i < wing.uv.length / 2; i++) {
    wing.uv[2 * i] = GROUND[0];
    wing.uv[2 * i + 1] = GROUND[1];
  }
  mg.add(wing.build(), IDENTITY, WHITE, end, -1);

  const tone = 0.97 + 0.06 * form.shade;
  mg.add(makeBlade(form, lod), new THREE.Matrix4().compose(end, new THREE.Quaternion(), new V3(blade, blade, blade)), [tone, tone, tone], end, form.shade);
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, -0.2, 0.5), 0.85);
  return g;
}

// ---------------------------------------------------------------------------
// What the flower and the capsule share: the stalk, and the two bracts at its end
// ---------------------------------------------------------------------------
/** "on stalks (i.e. pedicels) 30-95 mm long" (Weeds of Australia). */
const PEDICEL_M = characterRange(morphology, 'flower.pedicelLengthM');
/** The two bracts that clasp the tube and afterwards the capsule: "two leafy bracts (12-20 mm long)"; 4 to 15 mm wide. */
const BRACT_COUNT = characterNumber(morphology, 'flower.bracteoleCount');
const BRACT_LENGTH = middle(characterRange(morphology, 'flower.bracteoleLengthM'));
/** The broad end of the range: round the bud and the tube the two of them close into a pod. */
const BRACT_WIDTH = characterRange(morphology, 'flower.bracteoleWidthM')[1];
/** "fused into a tube (i.e. corolla tube) 15-25 mm long" */
const TUBE = middle(characterRange(morphology, 'flower.tubeLengthM'));

const GREEN = {
  stalkA: lin('#7d9a4c'),
  stalkB: lin('#8aa653'),
  // the bracts are paler and yellower than the leaves: on a plant in flower they show as pale lanterns among the leaf
  bractBase: lin('#93b65c'),
  bractTip: lin('#aecb78'),
  bractEdge: lin('#c2d992'),
  calyx: lin('#c3cf86'),
};

/** A line in the plane x = 0 from `from`, `length` long, whose heading turns from +Y towards +Z by `heading(s)` radians. */
function planar(from: V3, length: number, n: number, heading: (s: number) => number): { p: V3[]; a: number[] } {
  const p = [from.clone()];
  const a = [heading(0)];
  for (let i = 1; i <= n; i++) {
    const h = heading((i - 0.5) / n);
    p.push(p[i - 1]!.clone().add(new V3(0, (Math.cos(h) * length) / n, (Math.sin(h) * length) / n)));
    a.push(heading(i / n));
  }
  return { p, a };
}

/** The stalk and the line the flower or capsule lies along. */
interface Bearing {
  stalk: V3[];
  /** Centre line of the tube, or of the capsule, from the end of the stalk. */
  axis: { p: V3[]; a: number[] };
  /** A point on that line `d` metres from the end of the stalk, with the direction of the line and the direction square to it on the sky side. */
  at(d: number): { c: V3; along: V3; up: V3 };
}

/** How one flower is held: three of them, so that no two neighbours are alike. */
interface Carriage {
  /** Length of the stalk, as a place within the published range. */
  stalk: number;
  /** How far the stalk curves up towards the sky by its end, how far the flower nods back at the joint, and how far the tube curves up again: radians. */
  rise: number;
  nod: number;
  curve: number;
}
const CARRIAGES: readonly Carriage[] = [
  { stalk: 0.28, rise: 0.5, nod: 0.62, curve: 0.3 },
  { stalk: 0.12, rise: 0.36, nod: 0.4, curve: 0.22 },
  { stalk: 0.46, rise: 0.62, nod: 0.8, curve: 0.34 },
];

function bearing(c: Carriage, steps: number): Bearing {
  const stalk = planar(new V3(), within(PEDICEL_M, c.stalk), steps, (s) => c.rise * Math.pow(s, 1.6));
  const end = stalk.p[stalk.p.length - 1]!;
  const n = 12;
  const axis = planar(end, TUBE * 1.05, n, (s) => c.rise - c.nod + c.curve * s);
  return {
    stalk: stalk.p,
    axis,
    at(d: number) {
      const f = clamp(d / (TUBE * 1.05), 0, 1) * n;
      const i = Math.min(n - 1, Math.floor(f));
      const a = lerp(axis.a[i]!, axis.a[i + 1]!, f - i);
      return { c: axis.p[i]!.clone().lerp(axis.p[i + 1]!, f - i), along: new V3(0, Math.cos(a), Math.sin(a)), up: new V3(0, -Math.sin(a), Math.cos(a)) };
    },
  };
}

const X = new V3(1, 0, 0);
/** A point out from the bearing's line at `d`, at angle `psi` round it from +X towards the sky side: `r` out, or `across` to the side and `r` up where the section is not round. */
function round(b: Bearing, d: number, r: number, psi: number, across = r): V3 {
  const f = b.at(d);
  return f.c.addScaledVector(X, Math.cos(psi) * across).addScaledVector(f.up, Math.sin(psi) * r);
}

function addStalk(mg: Merge, b: Bearing, radial: number): void {
  const n = b.stalk.length - 1;
  mg.tube(
    b.stalk,
    b.stalk.map((_, i) => lerp(0.0007, 0.00055, i / n)),
    radial,
    GREEN.stalkA,
    GREEN.stalkB,
  );
}

/** How far a bract stands off the line it clasps, by how far along itself: swollen below, drawn in above, the very tip turned out. */
const bractOff = (v: number): number => lerp(0.0013, 0.0052, smoothstep(0, 0.3, v)) * (1 - 0.27 * smoothstep(0.45, 1, v));
/** How much of the way round a bract reaches at each point of its length: broad from its heart-shaped base, drawn out to a point. */
const bractSpan = (v: number): number => Math.pow(Math.min(1, v / 0.07), 0.5) * Math.pow(1 - Math.pow(v, 1.7), 1.05);

/**
 * The two bracts, one to either side, ridged and cupped round what they hold. They persist: axis.
 * Round the flower they are shut into a pod. `parted` (radians) stands them apart from the base, and `keeled`
 * (0 to 1) folds each along its middle so that it shows narrow: as they are round the capsule.
 */
function addBracts(mg: Merge, b: Bearing, [nu, nv]: readonly [number, number], fine: boolean, parted = 0, keeled = 0): void {
  const base = b.at(0).c;
  const span = Math.min(1.5, BRACT_WIDTH / (2 * bractOff(0.35))) * (1 - 0.55 * keeled);
  for (let k = 0; k < BRACT_COUNT; k++) {
    const side = (k / BRACT_COUNT) * TAU;
    const sb = new Surf();
    sb.surf(nu, nv, (u01, v) => {
      const u = u01 * 2 - 1;
      const psi = side + u * span * bractSpan(v);
      // a folded bract runs out to its keel and its two halves lie nearer the middle
      let r = bractOff(v) * (1 - 0.3 * keeled * Math.abs(u)) + Math.sin(parted) * v * BRACT_LENGTH;
      // "ridged": a few raised veins run its length
      if (fine) r += 0.0002 * Math.cos(u * span * 7) * Math.sin(Math.PI * v);
      const p = round(b, v * BRACT_LENGTH * Math.cos(parted), r, psi);
      const c = mix(mix(GREEN.bractBase, GREEN.bractTip, v), GREEN.bractEdge, 0.7 * Math.pow(Math.abs(u), 3));
      return { p: [p.x, p.y, p.z], c };
    });
    mg.add(sb.build(), IDENTITY, WHITE, base, -1);
  }
}

// ---------------------------------------------------------------------------
// Flower
// ---------------------------------------------------------------------------
/** "3-4 cm wide" across the spread lobes: what the growth model's organs.racemeLengthM measures, and what the model is authored at. */
const FLOWER_WIDTH = middle(characterRange(morphology, 'flower.widthM'));
const LOBES = characterNumber(morphology, 'flower.lobeCount');
/** The eye: the mouth of the tube, as a share of the flower's width. Read from photographs. */
const THROAT = (FLOWER_WIDTH * middle(characterRange(morphology, 'flower.eyeShareOfWidth'))) / 2;
/** How much of a lobe's length stands free of its neighbours. Read from photographs. */
const FREE = middle(characterRange(morphology, 'flower.lobeFreeShare'));
const CALYX_LENGTH = middle(characterRange(morphology, 'flower.calyxLengthM'));
const CALYX_TEETH = Math.round(middle(characterRange(morphology, 'flower.calyxLobeCount')));
const FLOWER_LODS = 3;

const PETAL = {
  // orange, a shade deeper round the eye and a shade lighter at the rim
  deep: lin('#ef7610'),
  face: lin('#f58a1c'),
  rim: lin('#f89c30'),
  // the eye: dark purple, near black in the depth of the tube
  eye: lin('#2b0a1f'),
  pit: lin('#12040d'),
  // the tube outside: pale and greenish where the bracts hide it, a pale yellow orange above
  tubeLow: lin('#e2dba0'),
  tubeHigh: lin('#efb968'),
};

/** Radius of the tube `t` of the way along it: narrow round the ovary, then widening to the mouth. */
const tubeRadius = (t: number): number => lerp(0.0015, THROAT, Math.pow(smoothstep(0.2, 1, t), 0.9));
/** The lobes leave the tube a little below its rim and a little inside it, curving out like the bell of a trumpet. */
const SUNK = 0.0008;
const INNER = 0.9;
/** How far up the tube its wall is drawn: to where the lobes take over. */
const MOUTH = 1 - SUNK / TUBE;
/** The dark lining of the tube, as a share of the tube's radius: it meets the lobes where they start. */
const WELL = (INNER * THROAT) / tubeRadius(MOUTH);

function makeFlowerGeometry(variant: number, lod: number): THREE.BufferGeometry {
  const carriage = CARRIAGES[variant]!;
  const b = bearing(carriage, [12, 5, 2][lod]!);
  const mg = new Merge(false);
  const base = b.at(0).c;
  addStalk(mg, b, [6, 4, 3][lod]!);

  // ---- the corolla: tube and limb open, and drop, as one ----
  const part = (g: THREE.BufferGeometry, t: number) => mg.add(g, IDENTITY, WHITE, base, t);
  if (lod < 2) {
    // the tube, seen from outside where it stands clear of the bracts
    const outer = new Surf();
    outer.surf([14, 7][lod]!, [8, 3][lod]!, (u, v) => {
      const p = round(b, v * (MOUTH - 0.04) * TUBE, tubeRadius(v * (MOUTH - 0.04)), u * TAU);
      return { p: [p.x, p.y, p.z], c: mix(PETAL.tubeLow, PETAL.tubeHigh, smoothstep(0.35, 1, v)) };
    });
    part(outer.build(), 0.03);
    // and from inside: the dark well that makes the eye
    const inner = new Surf();
    inner.surf([12, 6][lod]!, [5, 2][lod]!, (u, v) => {
      // up to the rim and a little wider than where the lobes begin, so that no slit shows between the eye and the limb
      const t = lerp(0.3, 1, v);
      const p = round(b, t * TUBE, tubeRadius(Math.min(t, MOUTH)) * WELL * (v === 0 ? 0.05 : 1 + 0.07 * v * v), u * TAU);
      return { p: [p.x, p.y, p.z], c: mix(PETAL.pit, PETAL.eye, v * v) };
    });
    part(inner.build(), 0.03);
  }

  // the limb: five lobes in the plane of the mouth, two above and three below. Each is a sheet of its own. They meet
  // edge to edge where they are joined and stand apart beyond: none lies over another, because one lobe over another
  // shades it in streaks
  const mouth = b.at(TUBE);
  const [nu, nv] = ([[12, 10], [4, 3], [2, 1]] as const)[lod]!;
  // rows from the mouth to the rim: close together where the eye ends
  const rows: readonly number[] = lod === 0 ? Array.from({ length: nv + 1 }, (_, j) => Math.pow(j / nv, 1.3)) : lod === 1 ? [0, 0.06, 0.5, 1] : [0, 1];
  const share = Math.PI / LOBES;
  for (let k = 0; k < LOBES; k++) {
    const sb = new Surf();
    sb.surf(nu, nv, (u01, v01) => {
      const u = u01 * 2 - 1;
      const v = rows[Math.round(v01 * nv)]!;
      // how far out along its free part
      const free = clamp((v - (1 - FREE)) / FREE, 0, 1);
      // joined, a lobe has its fifth of the circle; free, it is a little narrower than that, and a slit opens to the next.
      // All five are turned a little the same way, like the blades of a propeller
      const theta = Math.PI / 2 + share + k * 2 * share + u * share * (1 - 0.13 * Math.pow(free, 1.3)) + 0.05 * v;
      // obovate, cut off square at the tip with the corners rounded and a shallow notch in the middle
      const rim = (FLOWER_WIDTH / 2) * (1 - 0.03 * (1 - u * u) - 0.17 * Math.pow(Math.abs(u), 5) - 0.03 * Math.exp(-((u / 0.16) ** 2)));
      const r = lerp(THROAT * INNER, rim, v);
      // out of the mouth like the bell of a trumpet, then flat, the rim a little turned back; each free lobe tilted a little
      const h = -SUNK * (1 - v) ** 2 - 0.001 * v * v + 0.0006 * u * free;
      const p = mouth.c
        .clone()
        .addScaledVector(X, Math.cos(theta) * r)
        .addScaledVector(mouth.up, Math.sin(theta) * r)
        .addScaledVector(mouth.along, h);
      // the eye stops at the mouth, sharply; from afar it is a disc of its own
      const eye = lod === 2 ? 0 : 1 - smoothstep(0.01, 0.06, v);
      const orange = mix(mix(PETAL.deep, PETAL.face, smoothstep(0.05, 0.4, v)), PETAL.rim, 0.8 * smoothstep(0.6, 1, v));
      return { p: [p.x, p.y, p.z], c: mix(orange, PETAL.eye, eye) };
    });
    part(sb.build(), 0.04 + 0.006 * k);
  }
  // the eye from afar, where the well of the tube is not drawn: a dark disc in the mouth
  if (lod === 2) {
    const sb = new Surf();
    sb.surf(LOBES, 1, (u, v) => {
      const p = mouth.c
        .clone()
        .addScaledVector(X, Math.cos(u * TAU) * THROAT * 1.3 * v)
        .addScaledVector(mouth.up, Math.sin(u * TAU) * THROAT * 1.3 * v)
        .addScaledVector(mouth.along, 0.0006);
      return { p: [p.x, p.y, p.z], c: PETAL.eye };
    });
    part(sb.build(), 0.04);
  }

  // ---- what stays when the corolla has dropped ----
  addBracts(mg, b, ([[10, 10], [4, 3], [2, 2]] as const)[lod]!, lod === 0);
  if (lod === 0) {
    // the calyx: a ring of tiny awl-shaped teeth round the ovary
    const sb = new Surf();
    sb.surf(CALYX_TEETH * 2, 1, (u, v) => {
      const tooth = Math.round(u * CALYX_TEETH * 2) % 2 === 1;
      const p = round(b, v * CALYX_LENGTH * (tooth ? 1 : 0.35), 0.0017 + 0.0005 * v, u * TAU);
      return { p: [p.x, p.y, p.z], c: GREEN.calyx };
    });
    mg.add(sb.build(), IDENTITY, WHITE, base, -1);
  }
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(mouth.c.clone().multiplyScalar(0.6), mouth.c.length() * 0.6 + FLOWER_WIDTH);
  return g;
}

// ---------------------------------------------------------------------------
// Capsule: "resembles a bird's head with a round base and a long 'beak'", between its two bracts
// ---------------------------------------------------------------------------
/** "rounded (i.e. globular) base (5-10 mm across)" and "an elongated beak (9-15 mm long)" (Weeds of Australia). */
const CAPSULE_WIDTH = middle(characterRange(morphology, 'fruit.baseDiameterM'));
const CAPSULE_BEAK = middle(characterRange(morphology, 'fruit.beakLengthM'));
/** The base is lower than it is wide. Read from a photograph. */
const CAPSULE_BASE = CAPSULE_WIDTH * characterNumber(morphology, 'fruit.baseHeightToWidth');
/** The capsule from its foot to the end of its beak: the length the model is authored at. */
const CAPSULE = CAPSULE_BASE + CAPSULE_BEAK;
const FRUIT_LODS = 3;
const POD = { base: lin('#9ab86a'), beak: lin('#86a558'), tip: lin('#55703a') };

function makeCapsuleGeometry(variant: number, lod: number): THREE.BufferGeometry {
  const b = bearing(CARRIAGES[variant]!, [10, 4, 2][lod]!);
  const mg = new Merge(false);
  const base = b.at(0).c;
  addStalk(mg, b, [5, 3, 3][lod]!);
  // the bracts stand apart, folded, either side of the capsule
  addBracts(mg, b, ([[8, 8], [4, 3], [2, 2]] as const)[lod]!, lod === 0, 0.3, 0.35);
  const sb = new Surf();
  const R = CAPSULE_WIDTH / 2;
  const H = CAPSULE_BASE;
  sb.surf([12, 6, 4][lod]!, [14, 6, 3][lod]!, (u, v) => {
    const d = v * CAPSULE;
    const psi = u * TAU;
    // the seed-bearing base: lower than wide, and in two swellings with a furrow between them
    const ball = d < H ? R * Math.sqrt(Math.max(0, 1 - ((d - H / 2) / (H / 2)) ** 2)) * (1 - 0.13 * Math.cos(psi) ** 4) : 0;
    // the beak: stout, a little flattened, tapering to a blunt end
    const k = clamp((d - H * 0.7) / (CAPSULE - H * 0.7), 0, 1);
    const closing = v > 0.96 ? 0.45 : 1;
    const on = d > H * 0.7 ? closing : 0;
    const beakUp = on * lerp(0.002, 0.0014, k);
    const beakAcross = on * lerp(0.0014, 0.0009, k);
    const p = round(b, d, Math.max(ball, beakUp), psi, Math.max(ball, beakAcross));
    // finely hairy and dull; the end of the beak dark
    const c = mix(mix(POD.base, POD.beak, smoothstep(0.25, 0.45, v)), POD.tip, smoothstep(0.88, 1, v));
    return { p: [p.x, p.y, p.z], c };
  });
  mg.add(sb.build(), IDENTITY, WHITE, base, -1);
  const g = mg.build();
  const far = b.at(CAPSULE).c;
  g.boundingSphere = new THREE.Sphere(far.clone().multiplyScalar(0.6), far.length() * 0.6 + 2 * CAPSULE);
  return g;
}

// ---------------------------------------------------------------------------
// The look
// ---------------------------------------------------------------------------
const leaf: LeafAsset = {
  key: 'thunbergia-alata/leaf',
  variants: LEAF_FORMS.length,
  lods: 3,
  make: makeLeafGeometry,
  budget: [1900, 260, 36],
  pick: (_lengthM, r) => Math.min(LEAF_FORMS.length - 1, Math.floor(r * LEAF_FORMS.length)),
  // "dull dark green on the upper surface" (Wisconsin Extension): a dark, slightly grey green, the veins drawn paler and yellower
  // (greenB is the vein colour); a fresh yellow green as it unfolds. It is evergreen by habit and has no autumn
  // colour: outdoors in Britain it is green until the day the cold kills it, so the greens are given again
  palette: { greenA: lin('#3a5526'), greenB: lin('#6f8c45'), young: lin('#7fa448'), autumnA: lin('#3a5526'), autumnB: lin('#6f8c45') },
  // soft and hairy: no gloss
  roughness: 0.82,
  translucency: THIN_LEAF,
  detailReach: 0.8,
  texture: palmateTexture(VEINS, 512, 1.1),
  // on a wall, a post or a trellis the blades hang tip down from the tops of their stalks and face out, lying over
  // one another like tiles (leaf.posture); on a stem out in the open they face more to the sky
  hold: {
    unitAt: UNIT_AT,
    rise: characterRange(morphology, 'leaf.faceRiseDeg'),
    riseOpen: characterRange(morphology, 'leaf.faceRiseOpenDeg'),
    turn: characterNumber(morphology, 'leaf.bladeTurnDeg'),
  },
};

const flower: FlowerAsset = {
  key: 'thunbergia-alata/flower',
  variants: CARRIAGES.length,
  lods: FLOWER_LODS,
  make: makeFlowerGeometry,
  budget: [2700, 420, 60],
  pick: (r) => Math.min(CARRIAGES.length - 1, Math.floor(r * CARRIAGES.length)),
  authoredSize: FLOWER_WIDTH,
  poise: 'held',
  centreAlong: 1.6,
  // the furled corolla is paler and yellower than the open flower
  budTint: [0.9, 0.86, 0.6],
  swing: 0.35,
  translucency: 0.3,
  sheen: 0.06,
  detailAt: [0.9, 3],
  detailCaps: [48, 320],
};

const capsule: FruitAsset = {
  key: 'thunbergia-alata/capsule',
  variants: CARRIAGES.length,
  lods: FRUIT_LODS,
  make: makeCapsuleGeometry,
  budget: [760, 170, 64],
  pick: (r) => Math.min(CARRIAGES.length - 1, Math.floor(r * CARRIAGES.length)),
  authoredSize: CAPSULE,
  poise: 'held',
  centreAlong: 3.2,
  // capsule and bracts dry to a khaki tan
  ripe: lin('#b7a06c'),
  ripeShade: [0.35, 1.5],
  roughness: 0.9,
  swing: 0.2,
  detailAt: [0.8, 2.5],
  detailCaps: [40, 240],
};

/**
 * A soft green stem, hairy, a millimetre or two thick, flushing a dull purplish
 * brown along its older lengths. It lives one summer and is not wood when the
 * cold kills it. The ages are guesses within that one season.
 */
const wood: WoodLook = {
  young: lin('#7c9a4a'),
  mature: lin('#7d6a4c'),
  old: [0.74, 0.69, 0.52],
  woodyDays: [70, 240],
  oldDays: [420, 900],
  furrowDays: [420, 900],
  furrow: 0,
  stiffDays: [35, 170],
  relief: 0.5,
  roughness: 0.86,
  // fine and straight: a herb's stem, not bark
  grain: { streaks: 320, width: 1.2, wobble: 3 },
};

export const look: TaxonLook = {
  taxonId: 'thunbergia-alata',
  provisional: false,
  leaves: { default: leaf },
  flowers: { default: flower },
  fruits: { default: capsule },
  // a stem twiner: nothing to hold on with but the stems themselves
  appendages: {},
  wood,
};
