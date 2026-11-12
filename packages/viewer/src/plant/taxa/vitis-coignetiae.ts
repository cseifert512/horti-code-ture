// Vitis coignetiae (crimson glory vine): a deciduous tendril climber of great
// vigour, grown for the size of its leaf and for what the leaf does in autumn.
//
//   leaf      a broad heart 0.1 to 0.25 m across with three or five shallow,
//             pointed lobes, coarse teeth and a deep notch at the stalk; five
//             main veins fan from the top of the stalk, each with its own side
//             veins, and the blade swells a little between them. The upper
//             side is dark green, the under side felted rusty buff: the model
//             is two sheets, so that what is seen from beneath a canopy is the
//             felt. The blade is held at an angle to its long stalk and hangs
//             towards its tip. Scarlet and crimson in autumn, from the palette
//             and the season data; nothing here knows a date.
//   panicle   the "insignificant tiny greenish" flowers: a branched panicle of
//             about a hundred and twenty. A vine's flower has no petals to
//             show (they are shed as a cap as it opens), so what opens here
//             is the ring of five stamens round the green ovary, and what is
//             left when they have dropped is the ovary on its stalk.
//   bunch     small round berries on a branched stalk, green, then blue-black
//             with a bloom.
//   tendril   forked, one arm longer. One that has hold is wound round its
//             support close to the stem with its other arm still free; one that
//             found nothing reaches out, hooked or loosely curled.
//   wood      a ribbed shoot under a greyish floss, then a smooth brown cane,
//             then dark bark that parts in long fibrous strips.
//
// Counts and sizes of the real plant come from species/vitis-coignetiae/
// morphology.json, each with its source. What is drawn from a description of
// the genus or of the common vine, for want of one of this species, is said so
// there. Made from descriptions, not from specimens.
import * as THREE from 'three';
import { characterNumber, characterRange, parseMorphology } from '@horti/core';
import morphologyJson from '../../../../../species/vitis-coignetiae/morphology.json';
import { RNG, lerp, smoothstep } from '../../util.ts';
import { MIDRIB, Merge, type RGB, Surf, WHITE, coilPath, lin, mix, path } from '../kit.ts';
import { type AppendageAsset, type FlowerAsset, type FruitAsset, type LeafAsset, type TaxonLook, type WoodLook } from '../look.ts';

const morphology = parseMorphology(morphologyJson, 'species/vitis-coignetiae/morphology.json');
const mid = ([a, b]: readonly [number, number]): number => (a + b) / 2;

const V3 = THREE.Vector3;
type V3 = THREE.Vector3;
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
/** The angle between one organ and the next round an axis that leaves least overlap. */
const GOLDEN = 2.39996;

// ---------------------------------------------------------------------------
// Leaf
// ---------------------------------------------------------------------------
/** Main veins from the top of the stalk: the midrib and two pairs. */
const MAIN_VEINS = characterNumber(morphology, 'leaf.mainVeins');
/** "rather obscurely three- or five-lobed" (Bean). */
const [FEW_LOBES, MANY_LOBES] = characterRange(morphology, 'leaf.lobeCount');
/** Bean's largest leaf is 10 in. broad for 12 in. long: the proportion of the blade. */
const BLADE_WIDTH_TO_LENGTH = characterNumber(morphology, 'leaf.bladeWidthMaxM') / characterNumber(morphology, 'leaf.bladeLengthMaxM');
/** A stalk of 2 to 6 in. to a blade ordinarily 4 to 8 in. wide (Bean): the stalk is about half as long as the blade. */
const STALK_TO_BLADE = mid(characterRange(morphology, 'leaf.stalkLengthM')) / (mid(characterRange(morphology, 'leaf.bladeWidthM')) / BLADE_WIDTH_TO_LENGTH);

/**
 * The ground one vein feeds: from the notch on one side of it to the notch on
 * the other. The blade is a fan of these about the top of the stalk, which is
 * how the leaf is veined, and each carries the shared leaf texture with its
 * pale midrib on the vein, so that the side veins of the texture leave every
 * main vein as they do on the plant.
 */
interface Sector {
  /** Angle of the vein and of the two edges, radians from the tip of the leaf, increasing to the right. */
  vein: number;
  from: number;
  to: number;
  /** Reach of the margin at the vein and at the two edges, the midrib being 1. */
  tip: number;
  rFrom: number;
  rTo: number;
  /** Above 0 the margin runs to a point at the end of the vein, the more sharply the higher; 0 rounds it. */
  point: number;
  /** The branch of the lowest main vein that feeds the lobe beside the stalk. */
  basal: boolean;
}

interface LeafShape {
  lobes: number;
  /** How far the margin dips between the middle lobe and the next, and between the side lobes, as a share of the reach there. */
  sinus: number;
  shoulder: number;
  /** The blade leaves its stalk at one angle and curls on over through another by its tip, radians: it hangs. */
  tilt: number;
  curl: number;
  /** How far the blade falls away from the top of the stalk towards its margin, and its tip beyond that. */
  dome: number;
  tipDroop: number;
  /** Swelling of the blade between the main veins, and waving of the margin. */
  swell: number;
  wave: number;
  /** Where on the palette's ramp from the upper side's green to the felt the upper side of this leaf starts. */
  tone: number;
  seed: number;
}

/** The usual leaf, a barely lobed one, a five-angled one, and one that hangs more. */
const LEAF_SHAPES: readonly LeafShape[] = [
  { lobes: FEW_LOBES, sinus: 0.1, shoulder: 0, tilt: 0.5, curl: 0.95, dome: 0.1, tipDroop: 0.06, swell: 0.034, wave: 0.02, tone: 0, seed: 11 },
  { lobes: FEW_LOBES, sinus: 0.035, shoulder: 0, tilt: 0.42, curl: 0.85, dome: 0.09, tipDroop: 0.05, swell: 0.038, wave: 0.016, tone: 0.07, seed: 23 },
  { lobes: MANY_LOBES, sinus: 0.085, shoulder: 0.07, tilt: 0.55, curl: 0.95, dome: 0.11, tipDroop: 0.06, swell: 0.032, wave: 0.024, tone: 0.03, seed: 37 },
  { lobes: FEW_LOBES, sinus: 0.075, shoulder: 0.02, tilt: 0.62, curl: 1.0, dome: 0.13, tipDroop: 0.08, swell: 0.036, wave: 0.03, tone: 0.11, seed: 53 },
];

/** Segments of a blade at each level of detail: cells across a main sector and a basal one, rings, and whether the teeth are cut. */
const LEAF_GRID = [
  { main: 10, basal: 6, rings: 8, teeth: true, stalk: [8, 6], gap: 0.008 },
  { main: 4, basal: 2, rings: 4, teeth: false, stalk: [4, 4], gap: 0.012 },
  { main: 2, basal: 2, rings: 2, teeth: false, stalk: [2, 3], gap: 0.02 },
] as const;

/** Where the straight line between two points of the margin (angle, reach) crosses a third angle. */
function chord(a0: number, r0: number, a1: number, r1: number, at: number): number {
  const ax = r0 * Math.sin(a0);
  const az = r0 * Math.cos(a0);
  const dx = r1 * Math.sin(a1) - ax;
  const dz = r1 * Math.cos(a1) - az;
  const t = (az * Math.sin(at) - ax * Math.cos(at)) / (dx * Math.cos(at) - dz * Math.sin(at));
  return Math.hypot(ax + t * dx, az + t * dz);
}

/** The sectors of a blade, left edge of the notch round to the right edge. */
function sectorsOf(shape: LeafShape): Sector[] {
  const rng = new RNG(shape.seed);
  const side = (): Sector[] => {
    // the two side veins of a five-veined leaf, and the branch that feeds the lobe beside the stalk
    const a2 = (50 + rng.range(-3, 3)) * DEG;
    const a3 = (97 + rng.range(-3, 3)) * DEG;
    const a4 = (137 + rng.range(-2, 2)) * DEG;
    const end = (161 + rng.range(-3, 2)) * DEG;
    const r2 = 0.72 * rng.range(0.96, 1.04);
    const r3 = 0.555 * rng.range(0.96, 1.04);
    const r4 = 0.4 * rng.range(0.95, 1.05);
    const b12 = a2 * 0.52;
    const b23 = (a2 + a3) / 2;
    const b34 = (a3 + a4) / 2 + 2 * DEG;
    const r12 = chord(0, 1, a2, r2, b12) * (1 - shape.sinus);
    const r23 = chord(a2, r2, a3, r3, b23) * (1.035 - shape.shoulder);
    const r34 = chord(a3, r3, a4, r4, b34) * 1.07;
    return [
      { vein: 0, from: 0, to: b12, tip: 1, rFrom: r12, rTo: r12, point: 1.6, basal: false },
      { vein: a2, from: b12, to: b23, tip: r2, rFrom: r12, rTo: r23, point: 1.25, basal: false },
      { vein: a3, from: b23, to: b34, tip: r3, rFrom: r23, rTo: r34, point: shape.lobes >= MANY_LOBES ? 1.15 : 0, basal: false },
      { vein: a4, from: b34, to: end, tip: r4, rFrom: r34, rTo: 0.3, point: 0, basal: true },
    ];
  };
  const right = side();
  const left = side();
  const mirrored = left
    .slice(1)
    .reverse()
    .map((s) => ({ ...s, vein: -s.vein, from: -s.to, to: -s.from, rFrom: s.rTo, rTo: s.rFrom }));
  const middle: Sector = { ...right[0]!, from: -left[0]!.to, rFrom: left[0]!.rTo };
  const all = [...mirrored, middle, ...right.slice(1)];
  if (all.filter((s) => !s.basal).length !== MAIN_VEINS) throw new Error(`the vine leaf is drawn with ${MAIN_VEINS} main veins: its sectors do not match`);
  return all;
}

/** How far across its sector an angle is: -1 at one edge, 0 on the vein, 1 at the other. */
const across = (s: Sector, theta: number): number => (theta >= s.vein ? (theta - s.vein) / (s.to - s.vein) : (theta - s.vein) / (s.vein - s.from));

/** Reach of the margin at an angle within a sector, before its teeth. */
function reachOf(s: Sector, theta: number): number {
  const phi = across(s, theta);
  const edge = phi < 0 ? s.rFrom : s.rTo;
  const a = Math.min(1, Math.abs(phi));
  return edge + (s.tip - edge) * (s.point > 0 ? Math.pow(1 - a, s.point) : 1 - a * a);
}

/** Normals of a sheet whose sectors meet edge to edge: points that share a place share a normal, so no seam shows. */
function weldedNormals(pos: readonly number[], idx: readonly number[]): number[] {
  const sums = new Map<string, [number, number, number]>();
  const key = (i: number) => `${Math.round(pos[3 * i]! * 2e4)},${Math.round(pos[3 * i + 1]! * 2e4)},${Math.round(pos[3 * i + 2]! * 2e4)}`;
  const a = new V3();
  const b = new V3();
  const c = new V3();
  for (let f = 0; f < idx.length; f += 3) {
    a.fromArray(pos as number[], 3 * idx[f]!);
    b.fromArray(pos as number[], 3 * idx[f + 1]!);
    c.fromArray(pos as number[], 3 * idx[f + 2]!);
    b.sub(a);
    c.sub(a);
    b.cross(c);
    for (let k = 0; k < 3; k++) {
      const at = key(idx[f + k]!);
      const s = sums.get(at);
      if (s) {
        s[0] += b.x;
        s[1] += b.y;
        s[2] += b.z;
      } else sums.set(at, [b.x, b.y, b.z]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < pos.length / 3; i++) {
    const s = sums.get(key(i)) ?? [0, 1, 0];
    const l = Math.hypot(s[0], s[1], s[2]);
    if (l > 1e-12) out.push(s[0] / l, s[1] / l, s[2] / l);
    else out.push(0, 1, 0);
  }
  return out;
}

/** How far a point of the blade stands above (or hangs below) the top of the stalk, the blade lying flat. */
function heightOf(shape: LeafShape, s: Sector, first: boolean, phi: number, v: number, theta: number, r: number, z: number): number {
  // falls away from the top of the stalk on every side, and further at the tip
  let y = -shape.dome * r * r - shape.tipDroop * Math.max(0, z - 0.5) ** 2;
  // "dimpled": the blade swells between its main veins and sinks along them
  y += shape.swell * (Math.pow(Math.abs(phi), 1.4) - 0.3) * Math.pow(Math.sin(Math.PI * Math.min(1, v * 1.08)), 0.8) * (0.12 + 0.88 * r);
  y += shape.wave * Math.sin(theta * 5 + shape.seed) * v * v * v;
  // the lobes beside the stalk ride up on one side and down on the other
  if (s.basal) y += (first ? 0.05 : -0.03) * v * v;
  return y;
}

/**
 * The blade hung from the end of its stalk: a point `z` along the midrib of the
 * flat blade and `y` above it, moved to where it is when the blade leaves the
 * stalk at its angle and curls on over towards its tip. Returns [y, z].
 */
function hang(shape: LeafShape, y: number, z: number): [number, number] {
  const a = shape.tilt + shape.curl * z;
  return [(Math.cos(a) - Math.cos(shape.tilt)) / shape.curl + y * Math.cos(a), (Math.sin(a) - Math.sin(shape.tilt)) / shape.curl + y * Math.sin(a)];
}

/**
 * One sheet of the blade, hung (see `hang`) from the top of the stalk at the
 * origin; laid flat it would lie in XZ, the midrib along +Z and one unit long,
 * the upper side +Y. `drop` lowers the whole sheet (the under side lies a hair
 * below the upper). `tones` gives each point its place on the palette's ramp.
 */
function bladeSheet(shape: LeafShape, sectors: readonly Sector[], lod: number, drop: number, under: boolean, widen: number): { geometry: THREE.BufferGeometry; tones: number[] } {
  const grid = LEAF_GRID[lod]!;
  const pos: number[] = [];
  const uv: number[] = [];
  const tones: number[] = [];
  const idx: number[] = [];
  let n = 0;
  sectors.forEach((s, si) => {
    const cells = s.basal ? grid.basal : grid.main;
    const first = n;
    // where the vein leaves the stalk
    const [topY, topZ] = hang(shape, -drop, 0);
    pos.push(0, topY, topZ);
    uv.push(0.5, 0.03);
    tones.push(under ? 1 : shape.tone + 0.1);
    n++;
    // the texture has eleven pairs of side veins from end to end: a vein shows as many as its length earns
    const veins = 0.62 * s.tip;
    for (let j = 1; j <= grid.rings; j++) {
      const v = Math.pow(j / grid.rings, 0.85);
      for (let k = 0; k <= cells; k++) {
        const half = cells / 2;
        const theta = k <= half ? lerp(s.from, s.vein, k / half) : lerp(s.vein, s.to, (k - half) / half);
        const phi = across(s, theta);
        // coarse teeth, each at the end of a side vein: every other point of the margin stands out
        // ("shallowly to coarsely toothed": no two alike)
        const depth = 0.02 + 0.022 * (((k * 7 + si * 3 + shape.seed) % 5) / 4);
        const tooth = grid.teeth && j === grid.rings ? (k % 2 === 1 ? depth : -0.8 * depth) : 0;
        const r = v * reachOf(s, theta) * (1 + tooth);
        const x = r * Math.sin(theta) * widen;
        const z = r * Math.cos(theta);
        const y = heightOf(shape, s, si === 0, phi, v, theta, r, z);
        const [hy, hz] = hang(shape, y - drop, z);
        pos.push(x, hy, hz);
        // the pale line of the texture is the vein: it is kept narrow out to the margin, where a sector is wide
        const u = 0.5 + 0.5 * Math.sign(phi) * Math.pow(Math.abs(phi), lerp(1, 0.5, v));
        // the felt beneath hides the side veins: the under side takes the foot of the texture, where there are none
        uv.push(u, under ? 0.02 : 0.03 + veins * v);
        tones.push(under ? 1 : shape.tone + 0.1 * Math.max(0, 1 - Math.abs(phi) / 0.25) * (1 - 0.6 * v));
        n++;
      }
    }
    const ring = cells + 1;
    const at = (j: number, k: number) => first + 1 + (j - 1) * ring + k;
    for (let k = 0; k < cells; k++) idx.push(first, at(1, k), at(1, k + 1));
    for (let j = 1; j < grid.rings; j++) {
      for (let k = 0; k < cells; k++) idx.push(at(j, k), at(j + 1, k), at(j, k + 1), at(j, k + 1), at(j + 1, k), at(j + 1, k + 1));
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(weldedNormals(pos, idx), 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Array<number>(pos.length).fill(1), 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(idx);
  return { geometry, tones };
}

/** A blade laid out and measured before it is built. */
interface BladePlan {
  sectors: Sector[];
  /** What the outline is widened by so that the blade is as wide for its length as Bean's largest leaf. */
  widen: number;
  /** Tip to the back of the lobes beside the stalk, the midrib being 1. */
  length: number;
  /** How far the blade, hanging at its angle, reaches on along the line of the stalk. */
  reach: number;
}

function planBlade(shape: LeafShape): BladePlan {
  const sectors = sectorsOf(shape);
  let widest = 0;
  let front = 0;
  let back = 0;
  for (const s of sectors) {
    for (let k = 0; k <= 16; k++) {
      const theta = lerp(s.from, s.to, k / 16);
      const r = reachOf(s, theta);
      widest = Math.max(widest, Math.abs(r * Math.sin(theta)));
      front = Math.max(front, r * Math.cos(theta));
      back = Math.min(back, r * Math.cos(theta));
    }
  }
  let reach = 0;
  sectors.forEach((s, si) => {
    for (let k = 0; k <= 16; k++) {
      for (const v of [0.4, 0.6, 0.8, 1]) {
        const theta = lerp(s.from, s.to, k / 16);
        const r = v * reachOf(s, theta);
        const z = r * Math.cos(theta);
        reach = Math.max(reach, hang(shape, heightOf(shape, s, si === 0, across(s, theta), v, theta, r, z), z)[1]);
      }
    }
  });
  return { sectors, widen: (BLADE_WIDTH_TO_LENGTH * (front - back)) / (2 * widest), length: front - back, reach };
}

const BLADE_PLANS = LEAF_SHAPES.map(planBlade);
const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
/**
 * From the stem to the farthest point of the blade along the line of the
 * stalk: the unit every leaf is drawn to, so that all are the same size of
 * blade for the same length in the data. A blade that hangs more steeply
 * reaches less far and is given the longer stalk (they run from 2 to 6 in.).
 */
const LEAF_REACH = STALK_TO_BLADE * mean(BLADE_PLANS.map((p) => p.length)) + mean(BLADE_PLANS.map((p) => p.reach));

function makeLeafGeometry(variant: number, lod: number): THREE.BufferGeometry {
  const shape = LEAF_SHAPES[variant]!;
  const grid = LEAF_GRID[lod]!;
  const plan = BLADE_PLANS[variant]!;
  const stalkLength = LEAF_REACH - plan.reach;

  const mg = new Merge(true);
  // the stalk: stout, a little swollen where it joins the stem, rising in a shallow bow
  const [stalkSegs, stalkSides] = grid.stalk;
  const stalk = path(stalkSegs, (t) => new V3(0, 0.04 * stalkLength * Math.sin(Math.PI * t), stalkLength * t));
  mg.tube(
    stalk,
    stalk.map((_, i) => 0.0095 * (1 + 0.6 * Math.max(0, 1 - (i / stalkSegs) * 4)) * (1 - 0.2 * (i / stalkSegs))),
    stalkSides,
    WHITE,
    WHITE,
    MIDRIB,
  );
  const join = new V3(0, 0, stalkLength);
  // the blade hangs from the end of its stalk, its upper side to the light
  const seat = new THREE.Matrix4().makeTranslation(join.x, join.y, join.z);
  for (const under of [false, true]) {
    const sheet = bladeSheet(shape, plan.sectors, lod, under ? grid.gap : 0, under, plan.widen);
    const start = mg.n;
    mg.add(sheet.geometry, seat, WHITE, join, 0);
    // each point's own place on the palette's ramp: the upper side green, paler along the veins, the under side felt
    for (let i = 0; i < sheet.tones.length; i++) mg.part[(start + i) * 4 + 3] = sheet.tones[i]!;
    sheet.geometry.dispose();
  }

  const k = 1 / LEAF_REACH;
  for (let i = 0; i < mg.pos.length; i++) mg.pos[i]! *= k;
  for (let i = 0; i < mg.part.length; i += 4) {
    mg.part[i]! *= k;
    mg.part[i + 1]! *= k;
    mg.part[i + 2]! *= k;
  }
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, -0.25, 0.6), 0.95);
  return g;
}

// ---------------------------------------------------------------------------
// Panicle. Metres, hanging along -Y from where its stalk joins the shoot.
// ---------------------------------------------------------------------------
/** The length the panicle is authored at: the middle of what the growth model gives as its length, stalk and all. */
const PANICLE_LEN = mid(characterRange(morphology, 'inflorescence.lengthM'));
const FLOWERS = characterNumber(morphology, 'inflorescence.flowerCount');
/** Five stamens (Bean, of the genus). The five petals are shed as a cap when the flower opens and are not drawn. */
const STAMENS = characterNumber(morphology, 'flower.stamenCount');
/** Across the spread stamens. */
const FLOWER_WIDTH = characterNumber(morphology, 'flower.widthM');
const PANICLE_VARIANTS = 3;
const PANICLE_LODS = 4;

const F = {
  stalk: lin('#93a85a'),
  stalkTip: lin('#a9b86c'),
  ovary: lin('#7d9a44'),
  style: lin('#a3b560'),
  filament: lin('#e3e8b8'),
  anther: lin('#e6cf58'),
  far: lin('#cdd690'),
};

/** The stamens of one flower, about its axis +Y, in widths of the flower: the part that opens and drops. */
function makeStamens(lod: number): THREE.BufferGeometry {
  const sb = new Surf();
  for (let i = 0; i < STAMENS; i++) {
    const a = (i / STAMENS) * TAU;
    // spread at about 55 degrees from the axis
    const out = new V3(Math.cos(a) * 0.82, 0.57, Math.sin(a) * 0.82);
    const from = new V3(Math.cos(a) * 0.1, 0.12, Math.sin(a) * 0.1);
    const to = from.clone().addScaledVector(out, 0.5);
    const side = new V3(-Math.sin(a), 0, Math.cos(a));
    const up = new V3().crossVectors(side, out);
    if (lod === 0) {
      sb.surf(3, 1, (u, v) => {
        const th = u * TAU;
        const p = from.clone().lerp(to, v).addScaledVector(side, Math.cos(th) * 0.022).addScaledVector(up, Math.sin(th) * 0.022);
        return { p: [p.x, p.y, p.z], c: F.filament };
      });
      sb.surf(3, 2, (u, v) => {
        const th = u * TAU;
        const r = 0.075 * Math.sin(Math.PI * v);
        const p = to.clone().addScaledVector(out, (v - 0.3) * 0.2).addScaledVector(side, Math.cos(th) * r).addScaledVector(up, Math.sin(th) * r);
        return { p: [p.x, p.y, p.z], c: F.anther };
      });
    } else {
      // a blade for each stamen, its tip the anther
      sb.surf(1, 1, (u, v) => {
        const p = from.clone().lerp(to, v * 1.15).addScaledVector(side, (u - 0.5) * 0.16 * (0.4 + v));
        return { p: [p.x, p.y, p.z], c: mix(F.filament, F.anther, v) };
      });
    }
  }
  return sb.build();
}

/** The ovary of one flower on its disc: what stays when the stamens have dropped. */
function makeOvary(lod: number): THREE.BufferGeometry {
  const sb = new Surf();
  const [around, along] = lod === 0 ? [5, 3] : [3, 2];
  sb.surf(around, along, (u, v) => {
    const th = u * TAU;
    // a flask: broadest low down, drawn in to a short style
    const r = 0.03 + 0.2 * Math.pow(Math.sin(Math.PI * Math.pow(v, 0.62)), 0.9) * (1 - 0.35 * v);
    return { p: [Math.cos(th) * r, 0.02 + 0.5 * v, Math.sin(th) * r], c: mix(F.ovary, F.style, v * v) };
  });
  return sb.build();
}

/** A flower seen from too far to tell its parts: a pale knot. */
function makeKnot(): THREE.BufferGeometry {
  const sb = new Surf();
  sb.surf(4, 2, (u, v) => {
    const th = u * TAU;
    const r = 0.5 * Math.sin(Math.PI * v);
    return { p: [Math.cos(th) * r, 0.1 + 0.6 * v, Math.sin(th) * r], c: mix(F.ovary, F.far, 0.35 + 0.65 * v) };
  });
  return sb.build();
}

const stamenCache: THREE.BufferGeometry[] = [];
const ovaryCache: THREE.BufferGeometry[] = [];
let knotCache: THREE.BufferGeometry | null = null;

/** Where each flower of a panicle sits: laid out once for a variant, and drawn at every level of detail from the same list. */
interface Placed {
  /** Where its stalk leaves the branch, and where the flower itself sits. */
  from: V3;
  at: V3;
  axis: V3;
  size: number;
  /** When it opens: 0 the first of the panicle, 1 the last. */
  t: number;
}

function layOutPanicle(variant: number): { spine: (f: number) => V3; branches: { points: V3[]; radius: number }[]; flowers: Placed[] } {
  const rng = new RNG(700 + variant * 29);
  const L = PANICLE_LEN;
  const lean = rng.range(0, TAU);
  const bend = rng.range(0.004, 0.011);
  // the stalk leaves the shoot sideways and turns down under its own weight
  const spine = (f: number) => new V3(Math.cos(lean) * (bend * Math.sin(f * 2.4) + 0.012 * Math.min(1, f * 5)), -f * L + 0.004 * Math.min(1, f * 5), Math.sin(lean) * (bend * Math.sin(f * 2.4) + 0.012 * Math.min(1, f * 5)));
  const count = 11 + variant;
  const first = rng.range(0, TAU);
  const branches: { points: V3[]; radius: number }[] = [];
  const flowers: Placed[] = [];
  const reach = (i: number) => L * (0.3 * Math.pow(1 - i / (count - 1), 0.8) + 0.04) * (i === 0 ? 1.2 : 1) * rng.range(0.85, 1.1);
  const lengths = Array.from({ length: count }, (_, i) => reach(i));
  const total = lengths.reduce((a, b) => a + b, 0);
  const down = new V3(0, -1, 0);
  const put = (from: V3, heading: V3, f: number) => {
    const axis = heading.clone().add(new V3(rng.range(-0.7, 0.7), rng.range(-0.5, 0.7), rng.range(-0.7, 0.7))).normalize();
    flowers.push({ from, at: from.clone().addScaledVector(axis, FLOWER_WIDTH * rng.range(0.6, 1)), axis, size: FLOWER_WIDTH * rng.range(0.88, 1.1), t: Math.min(1, Math.max(0, 0.08 + 0.78 * f + rng.range(-0.12, 0.12))) });
  };
  for (let i = 0; i < count; i++) {
    const f = lerp(0.27, 0.92, i / (count - 1));
    const base = spine(f);
    const psi = first + i * GOLDEN + rng.range(-0.25, 0.25);
    const out = new V3(Math.cos(psi), 0, Math.sin(psi));
    // branches stand out from the axis and droop a little towards its tip
    const heading = out.clone().multiplyScalar(Math.cos(0.35)).addScaledVector(down, Math.sin(0.35)).normalize();
    const len = lengths[i]!;
    const curve = (g: number) => base.clone().addScaledVector(heading, len * g).addScaledVector(down, len * 0.18 * g * g);
    branches.push({ points: [curve(0), curve(0.5), curve(1)], radius: 0.00055 });
    const n = Math.max(2, Math.round((FLOWERS * 0.92 * len) / total));
    for (let k = 0; k < n; k++) put(curve(lerp(0.22, 1, (k + rng.f()) / n)), heading, f + (0.06 * k) / n);
  }
  // the end of the axis carries flowers of its own
  while (flowers.length < FLOWERS) put(spine(rng.range(0.9, 1)), down, 1);
  return { spine, branches, flowers };
}

const panicleCache: ReturnType<typeof layOutPanicle>[] = [];

function makePanicleGeometry(variant: number, lod: number): THREE.BufferGeometry {
  const layout = (panicleCache[variant] ??= layOutPanicle(variant));
  const mg = new Merge(false);
  const segs = [10, 6, 4, 3][lod]!;
  const sides = [5, 4, 3, 3][lod]!;
  const axis = path(segs, layout.spine);
  mg.tube(axis, axis.map((_, i) => lerp(0.0011, 0.0005, i / segs)), sides, F.stalk, F.stalkTip);
  // branches: all of them close to, every other one further off, none at the farthest
  const everyBranch = [1, 1, 2, 99][lod]!;
  layout.branches.forEach((b, i) => {
    if (i % everyBranch === 0) mg.tube(lod === 0 ? b.points : [b.points[0]!, b.points[2]!], (lod === 0 ? [1, 0.8, 0.6] : [1, 0.6]).map((k) => b.radius * k * (lod >= 2 ? 1.6 : 1)), lod === 0 ? 4 : 3, F.stalk, F.stalkTip);
  });

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new V3(0, 1, 0);
  const scl = new V3();
  if (lod <= 1) {
    stamenCache[lod] ??= makeStamens(lod);
    ovaryCache[lod] ??= makeOvary(lod);
    layout.flowers.forEach((fl, i) => {
      // its own stalk, where there are triangles to spare
      if (lod === 0) mg.tube([fl.from, fl.at], [0.00028, 0.00024], 3, F.stalkTip, F.ovary);
      q.setFromUnitVectors(up, fl.axis);
      m.compose(fl.at, q, scl.setScalar(fl.size));
      const tone = 0.92 + 0.16 * ((i * 0.618) % 1);
      mg.add(ovaryCache[lod]!, m, [tone, tone, tone], fl.at, -1);
      mg.add(stamenCache[lod]!, m, [tone, tone, tone], fl.at, fl.t);
    });
  } else {
    // from a distance: fewer, larger knots, so that the panicle keeps its mass and its pale green
    knotCache ??= makeKnot();
    const every = lod === 2 ? 3 : 5;
    const grow = lod === 2 ? 1.9 : 2.5;
    layout.flowers.forEach((fl, i) => {
      if (i % every !== 0) return;
      q.setFromUnitVectors(up, fl.axis);
      m.compose(fl.from, q, scl.setScalar(fl.size * grow));
      mg.add(knotCache!, m, WHITE, fl.from, fl.t);
    });
  }
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, -PANICLE_LEN / 2, 0), PANICLE_LEN * 0.75);
  return g;
}

// ---------------------------------------------------------------------------
// Bunch of berries. Metres, hanging along -Y.
// ---------------------------------------------------------------------------
/** The length the bunch is authored at, stalk and berries together: the middle of the growth model's range. */
const BUNCH_LEN = mid(characterRange(morphology, 'fruit.bunchLengthM'));
const BERRIES = characterNumber(morphology, 'fruit.berriesPerBunch');
/** "1cm across" (RHS) to "1/2 in. wide" (Bean): the berry of a bunch of the authored length. */
const BERRY_RADIUS = mid(characterRange(morphology, 'fruit.berryDiameterM')) / 2;
/** Berries to a bunch, as shares of the usual number: a thin bunch, the usual one, a full one. */
const BUNCH_FILL = [0.75, 1, 1.2] as const;
const BUNCH_LODS = 3;

/**
 * Unripe colours. The fruit program turns each point to the ripe colour times
 * (ripeShade[0] + ripeShade[1] * green), so the green painted here is also how
 * the ripe berry is shaded: the upper side, where the bloom lies untouched, is
 * painted lighter and ripens to a dusty blue; the under side and the scar of
 * the style ripen nearly black.
 */
const UNRIPE = { low: 0.3, high: 0.42, stalk: 0.27 };
const berryGreen = (g: number): RGB => [g * 0.6, g, g * 0.21];
const BUNCH_STALK: RGB = [UNRIPE.stalk * 0.85, UNRIPE.stalk, UNRIPE.stalk * 0.3];

function makeBerry(lod: number): THREE.BufferGeometry {
  const sb = new Surf();
  const [around, along] = ([[7, 5], [5, 3], [4, 2]] as const)[lod]!;
  sb.surf(around, along, (u, v) => {
    const th = u * TAU;
    // hangs from its stalk at the top (v = 0); the scar of the style is at the bottom
    const r = Math.sin(Math.PI * v);
    const y = Math.cos(Math.PI * v);
    const lit = smoothstep(-0.5, 0.9, y) * (0.8 + 0.2 * Math.cos(th));
    const scar = v > 0.93 ? 0.6 : 1;
    return { p: [Math.cos(th) * r, y - 1, Math.sin(th) * r], c: berryGreen(lerp(UNRIPE.low, UNRIPE.high, lit) * scar + (1 - scar) * UNRIPE.low * 0.9) };
  });
  return sb.build();
}

const berryCache: THREE.BufferGeometry[] = [];

function makeBunchGeometry(variant: number, lod: number): THREE.BufferGeometry {
  berryCache[lod] ??= makeBerry(lod);
  const rng = new RNG(900 + variant * 41);
  const L = BUNCH_LEN;
  const count = Math.round(BERRIES * BUNCH_FILL[variant]!);
  const lean = rng.range(0, TAU);
  const spine = (f: number) => new V3(Math.cos(lean) * 0.006 * Math.sin(f * 2.6), -f * L, Math.sin(lean) * 0.006 * Math.sin(f * 2.6));

  // berries wound round the axis, widest at the shoulder, then eased apart until none sits inside another
  const first = rng.range(0, TAU);
  const berries: { c: V3; r: number; f: number }[] = [];
  for (let i = 0; i < count; i++) {
    const f = (i + 0.5) / count;
    const along = 0.27 + 0.66 * Math.pow(f, 0.92);
    const out = (0.25 + 0.75 * Math.pow(1 - f, 0.6)) * 0.016 * rng.range(0.7, 1);
    const a = first + i * GOLDEN + rng.range(-0.3, 0.3);
    const r = BERRY_RADIUS * rng.range(0.84, 1.06);
    berries.push({ c: spine(along).add(new V3(Math.cos(a) * out, 0, Math.sin(a) * out)), r, f: along });
  }
  const d = new V3();
  for (let pass = 0; pass < 10; pass++) {
    for (let i = 0; i < berries.length; i++) {
      for (let j = i + 1; j < berries.length; j++) {
        const a = berries[i]!;
        const b = berries[j]!;
        d.subVectors(b.c, a.c);
        const gap = d.length();
        const want = (a.r + b.r) * 0.96;
        if (gap >= want || gap < 1e-9) continue;
        d.multiplyScalar((want - gap) / gap / 2);
        // sideways more than up and down, so the bunch fattens and does not lengthen
        d.y *= 0.4;
        a.c.sub(d);
        b.c.add(d);
      }
    }
  }

  const mg = new Merge(false);
  const segs = [8, 4, 2][lod]!;
  const axis = path(segs, (t) => spine(t * 0.9));
  mg.tube(axis, axis.map((_, i) => lerp(0.0016, 0.0008, i / segs)), [5, 3, 3][lod]!, BUNCH_STALK, BUNCH_STALK);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new V3(0, 1, 0);
  const scl = new V3();
  // close to, every berry; further off, only the outer ones, which hide the rest, drawn a little larger
  const most = [berries.length, 32, 24][lod]!;
  const grow = [1, 1.05, 1.3][lod]!;
  const off = (b: { c: V3; f: number }) => Math.hypot(b.c.x - spine(b.f).x, b.c.z - spine(b.f).z);
  const shown = new Set(
    berries
      .map((b, i) => ({ i, off: off(b) }))
      .sort((a, b) => b.off - a.off || a.i - b.i)
      .slice(0, most)
      .map((b) => b.i),
  );
  berries.forEach((b, i) => {
    const turn = rng.range(0, TAU);
    const tone = rng.range(0.93, 1.05);
    if (!shown.has(i)) return;
    const top = b.c.clone().add(new V3(0, b.r, 0));
    // its stalk, from the axis a little above it
    if (lod === 0) mg.tube([spine(Math.max(0.2, b.f - 0.05)), top], [0.00055, 0.00045], 3, BUNCH_STALK, BUNCH_STALK);
    m.compose(top, q.setFromAxisAngle(up, turn), scl.setScalar(b.r * grow));
    mg.add(berryCache[lod]!, m, [tone, tone, tone], top, 0);
  });
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, -L / 2, 0), L * 0.7);
  return g;
}

// ---------------------------------------------------------------------------
// Tendril. One unit long along +Z from where it leaves the stem, +Y to the sky.
// ---------------------------------------------------------------------------
/** A stalk that forks in two (Darwin, of the common vine): the number of arms. */
const TENDRIL_ARMS = characterNumber(morphology, 'tendril.arms');
const TENDRIL_LODS = 3;
const T = { base: lin('#8f9c58'), tip: lin('#b3a868') };
/** Thickness of a tendril at its base, in lengths of the tendril, and how it tapers to each end of an arm. */
const TENDRIL_RADIUS = 0.009;

/**
 * An arm of a tendril from its fork: it sets out on `heading` and, over its
 * last half, turns about `about` through `curl` whole turns, ever more tightly:
 * an open hook for a part of a turn, a curl for more than one.
 */
function armPath(from: V3, heading: V3, about: V3, length: number, curl: number, steps: number): V3[] {
  const points = [from.clone()];
  const p = from.clone();
  const d = new V3();
  const fine = 6;
  for (let i = 1; i <= steps * fine; i++) {
    const t = (i - 0.5) / (steps * fine);
    const late = Math.max(0, t - 0.5) / 0.5;
    d.copy(heading).applyAxisAngle(about, curl * TAU * late * late);
    p.addScaledVector(d, length / (steps * fine));
    if (i % fine === 0) points.push(p.clone());
  }
  return points;
}

/**
 * 0, 1   has hold: one arm wound round its support hard by the stem (a cable
 *        of a few millimetres; something stouter), the other still free
 * 2, 3   found nothing: both arms out and hooked; or curled on themselves
 */
function makeTendrilGeometry(variant: number, lod: number): THREE.BufferGeometry {
  if (TENDRIL_ARMS !== 2) throw new Error('the vine tendril is drawn forked in two');
  const mg = new Merge(false);
  const sides = [4, 3, 3][lod]!;
  /** Segments of a stretch: as asked close to, half of that further off, and `far` at the farthest. */
  const n = (close: number, far: number) => (lod === 0 ? close : lod === 1 ? Math.max(2, Math.round(close / 2)) : far);
  const tube = (points: V3[], from: number, to: number) => mg.tube(points, points.map((_, i) => TENDRIL_RADIUS * lerp(from, to, i / (points.length - 1))), sides, mix(T.base, T.tip, 1 - from), mix(T.base, T.tip, 1 - to));
  const holding = variant <= 1;

  if (holding) {
    // What it holds lies against the stem where the tendril leaves it, running up and a little forward of
    // square to the tendril. The stalk is short; the arm with hold goes straight round the support and
    // draws tight, turn against turn; the other arm stands out, still feeling for something.
    const coil = variant === 0 ? 0.021 : 0.04;
    // at the farthest level one turn stands for them all: more would be drawn as a tangle
    const turns = lod === 2 ? 1 : variant === 0 ? 3.5 : 2.5;
    const fork = new V3(0, 0.012, 0.07);
    tube(path(n(4, 1), (t) => new V3(0, 0.012 * Math.sin((Math.PI * t) / 2), 0.07 * t)), 1, 0.9);
    const support = new V3(0, 0.9, 0.4).normalize();
    const centre = new V3(0, -0.01, coil * 0.62);
    tube([fork, ...coilPath(centre, support, fork, coil, turns, 0.0165, n(Math.round(turns * 11), 5))], 0.85, 0.3);
    // the free arm: out and up in a long bow, its tip hooked over
    const free = armPath(fork, new V3(0.06, 0.2, 1).normalize(), new V3(1, 0.25, 0).normalize(), 1, 0.36, n(14, 3));
    let far = 0;
    for (const p of free) far = Math.max(far, p.z);
    const stretch = (0.99 - fork.z) / (far - fork.z);
    for (const p of free) p.sub(fork).multiplyScalar(stretch).add(fork);
    tube(free, 0.8, 0.3);
  } else {
    const curled = variant === 3;
    const forkAt = curled ? 0.4 : 0.47;
    const stalk = (t: number) => new V3(0, 0.07 * Math.sin((Math.PI * t) / 2), forkAt * t);
    const fork = stalk(1);
    tube(path(n(7, 1), stalk), 1, 0.8);
    // the longer arm carries on, the shorter stands off to one side; at the farthest level a curl is left as a hook
    const turn = (close: number) => (lod === 2 ? Math.min(close, 0.3) : close);
    const long = armPath(fork, new V3(0.1, 0.12, 1).normalize(), new V3(1, 0.3, 0).normalize(), 1, turn(curled ? 1.25 : 0.38), n(curled ? 24 : 15, 4));
    const short = armPath(fork, new V3(-0.62, 0.3, 0.72).normalize(), new V3(0.25, 1, 0.1).normalize(), 0.33, turn(curled ? 1.1 : 0.42), n(curled ? 18 : 11, 3));
    // the longer arm is drawn to end one unit from the stem
    let far = 0;
    for (const p of long) far = Math.max(far, p.z);
    const stretch = (0.995 - fork.z) / (far - fork.z);
    for (const p of long) p.sub(fork).multiplyScalar(stretch).add(fork);
    tube(long, 0.8, 0.28);
    tube(short, 0.72, 0.28);
  }
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, 0, 0.5), 0.75);
  return g;
}

// ---------------------------------------------------------------------------
// The look
// ---------------------------------------------------------------------------
const leaf: LeafAsset = {
  key: 'vitis-coignetiae/leaf',
  variants: LEAF_SHAPES.length,
  lods: LEAF_GRID.length,
  make: makeLeafGeometry,
  budget: [2300, 400, 110],
  pick: (_lengthM, r) => (r < 0.36 ? 0 : r < 0.6 ? 1 : r < 0.8 ? 2 : 3),
  palette: {
    // "dark green and glabrous above"
    greenA: lin('#42702b'),
    // "covered beneath with a thick rusty brown felt": the under side, and a breath of it along the veins above
    greenB: lin('#7b6f4c'),
    // unfolding under its felt
    young: lin('#a98a60'),
    // "turning scarlet and crimson in autumn"; the under side pales to a ruddy rose
    autumnA: lin('#b9191d'),
    autumnB: lin('#b24a45'),
  },
  roughness: 0.62,
  // "thick and large" (Kyoto), felted beneath: less light comes through than through a thin leaf
  translucency: 0.3,
  // a leaf a hand and a half across keeps its lobes and teeth at a distance a small leaf would not
  detailReach: 1.5,
};

const panicle: FlowerAsset = {
  key: 'vitis-coignetiae/panicle',
  variants: PANICLE_VARIANTS,
  lods: PANICLE_LODS,
  make: makePanicleGeometry,
  budget: [16500, 3000, 800, 440],
  pick: (r) => Math.min(PANICLE_VARIANTS - 1, Math.floor(r * PANICLE_VARIANTS)),
  authoredSize: PANICLE_LEN,
  poise: 'hangs',
  centreAlong: 0.6,
  // in bud the whole panicle is green
  budTint: [0.5, 0.7, 0.36],
  swing: 0.35,
  translucency: 0.2,
  sheen: 0,
  detailAt: [0.8, 2, 4.5],
  detailCaps: [10, 50, 200],
};

const bunch: FruitAsset = {
  key: 'vitis-coignetiae/bunch',
  variants: BUNCH_FILL.length,
  lods: BUNCH_LODS,
  make: makeBunchGeometry,
  budget: [4000, 1000, 420],
  pick: (r) => (r < 0.3 ? 0 : r < 0.75 ? 1 : 2),
  authoredSize: BUNCH_LEN,
  poise: 'hangs',
  centreAlong: 0.6,
  // "black with a purple bloom": nearly black in the shade of the berry, dusty blue-violet where the bloom is
  ripe: [0.034, 0.029, 0.052],
  ripeShade: [0.75 - ((1.9 - 0.75) / (UNRIPE.high - UNRIPE.low)) * UNRIPE.low, (1.9 - 0.75) / (UNRIPE.high - UNRIPE.low)],
  roughness: 0.5,
  swing: 0.45,
  detailAt: [1.6, 5],
  detailCaps: [24, 160],
};

const tendril: AppendageAsset = {
  key: 'vitis-coignetiae/tendril',
  variants: 4,
  lods: TENDRIL_LODS,
  make: makeTendrilGeometry,
  budget: [600, 200, 64],
  // one that has hold is wound to fit what it holds; one that has not is hooked or curled
  pick: (r, holding, heldDiameterMm) => (holding ? ((heldDiameterMm ?? 0) > 8 ? 1 : 0) : r < 0.55 ? 2 : 3),
  // green, then brown and woody
  aged: lin('#5a3f2a'),
  agedDays: [60, 220],
  roughness: 0.8,
  swing: 0.15,
  detailAt: [1.2, 3.5],
  detailCaps: [60, 400],
};

const wood: WoodLook = {
  // "at first covered with a loose greyish floss": a fawn-grey over the green of the shoot
  young: lin('#8d8b62'),
  // the ripened cane: smooth, warm brown
  mature: lin('#70452b'),
  // old bark, dark and stringy
  old: [0.6, 0.47, 0.37],
  // a shoot ripens to brown wood by its first autumn
  woodyDays: [80, 190],
  // and its bark begins to part in strips in its second or third year
  oldDays: [380, 1100],
  furrowDays: [450, 2400],
  // shaggy rather than deeply fluted
  furrow: 0.55,
  stiffDays: [50, 380],
  relief: 5,
  roughness: 0.95,
  // "long fibrous strips": many, narrow and nearly straight
  grain: { streaks: 760, width: 2.2, wobble: 5 },
};

export const look: TaxonLook = {
  taxonId: 'vitis-coignetiae',
  provisional: false,
  leaves: { default: leaf },
  flowers: { default: panicle },
  fruits: { default: bunch },
  appendages: { tendril },
  wood,
};
