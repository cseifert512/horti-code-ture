// Hedera helix (common ivy): an evergreen that clings by rootlets, in both of
// its phases.
//
//   climbing leaf  the leaf of the juvenile, climbing shoots: leathery and dark,
//                  with three or five triangular lobes and a pale vein from the
//                  stalk to the tip of each. The blade hangs from the end of its
//                  stalk and faces outwards. Built lobe by lobe as a fan from
//                  the stalk, so that the leaf texture's midrib runs up every
//                  lobe and its side veins branch from that
//   adult leaf     the leaf of the flowering shoots: unlobed, ovate to
//                  diamond-shaped, with a wavy edge
//   panicle        the whole inflorescence at the end of an adult shoot: a
//                  globose umbel of about twenty flowers and two to four smaller
//                  ones below it on stalks of their own. One unit is its
//                  greatest extent, which is what the render data gives. Each
//                  flower is an inferior ovary capped by the nectar disc and the
//                  style, which stay, and five petals and five stamens, which
//                  open umbel by umbel from the end one down and then fall
//   berries        the one umbel that fruits: globose berries, each with the
//                  flat scar of the disc and the point of the style on top,
//                  green and then dull blue-black. One unit is its width
//   rootlets       a cluster of short unbranched roots spreading over the
//                  surface from under the stem, pale and then brown
//   wood           light green shoots, turning light brown and finely ridged
//
// Counts and sizes are read from species/hedera-helix/morphology.json, where
// each has its source (Metcalfe 2005, Biological Flora of the British Isles,
// for most). Made from descriptions and measurements, not from specimens.
//
// What cannot be drawn here: the paler underside of the leaf (both faces are
// drawn alike), the purple flush of leaves in cold weather (an evergreen leaf
// is given no winter state), and the spiral of leaves round an adult shoot
// (the render data sets them to left and right).
import * as THREE from 'three';
import { characterNumber, characterRange, parseMorphology } from '@horti/core';
import morphologyJson from '../../../../../species/hedera-helix/morphology.json';
import { RNG, clamp, hash2, lerp } from '../../util.ts';
import { MIDRIB, Merge, type RGB, Surf, WHITE, lathe, lin, mix } from '../kit.ts';
import { type AppendageAsset, type FlowerAsset, type FruitAsset, type LeafAsset, type TaxonLook, type WoodLook } from '../look.ts';

const morphology = parseMorphology(morphologyJson, 'species/hedera-helix/morphology.json');
const mid = (range: readonly [number, number]): number => (range[0] + range[1]) / 2;

const V3 = THREE.Vector3;
type V3 = THREE.Vector3;
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const UP = new V3(0, 1, 0);

// ---------------------------------------------------------------------------
// The climbing leaf
// ---------------------------------------------------------------------------
/** "palmately lobed with 3-5 triangular, entire lobes" (Metcalfe): the fewest and the most a leaf is drawn with. */
const [FEWEST_LOBES, MOST_LOBES] = characterRange(morphology, 'leaf.juvenile.lobeCount');

type KnotKind = 'tip' | 'sinus' | 'edge';
/** A point of the outline: its bearing from the tip of the end lobe (degrees), and its distance from where the stalk joins, the end lobe being 1. */
interface Knot {
  deg: number;
  r: number;
  kind: KnotKind;
}
const tip = (deg: number, r: number): Knot => ({ deg, r, kind: 'tip' });
const sinus = (deg: number, r: number): Knot => ({ deg, r, kind: 'sinus' });
const edge = (deg: number, r: number): Knot => ({ deg, r, kind: 'edge' });

interface ClimbingLeaf {
  /** The right half of the outline, from the tip of the end lobe round to the notch at the stalk. */
  half: readonly Knot[];
  /** How far the blade hangs from the line of its stalk, and how it is turned on it (degrees). */
  hang: number;
  roll: number;
  yaw: number;
  /** How far the tips of the end, side and basal lobes turn down. */
  tipsDown: readonly [number, number, number];
  seed: number;
}

/**
 * Four leaves: the ordinary one of five broad triangular lobes, one with a
 * longer end lobe, one of three lobes, and one so shallowly lobed that it is
 * nearly a five-cornered shield. Proportions are appearance, held to the
 * measurements: a blade about as wide as long (4-10 cm by 4-7 cm), its base
 * heart-shaped.
 */
const CLIMBING_LEAVES: readonly ClimbingLeaf[] = [
  { half: [tip(0, 1), sinus(27, 0.62), tip(50, 0.74), sinus(82, 0.52), tip(112, 0.52), edge(150, 0.27), edge(180, 0.08)], hang: 52, roll: 8, yaw: 5, tipsDown: [0.03, 0.04, 0.02], seed: 11 },
  { half: [tip(0, 1), sinus(28, 0.52), tip(54, 0.64), sinus(86, 0.44), tip(114, 0.45), edge(152, 0.24), edge(180, 0.07)], hang: 60, roll: -12, yaw: -7, tipsDown: [0.05, 0.03, 0.01], seed: 23 },
  { half: [tip(0, 1), sinus(30, 0.62), tip(56, 0.74), edge(100, 0.5), edge(142, 0.3), edge(180, 0.1)], hang: 46, roll: 15, yaw: -4, tipsDown: [0.03, 0.05, 0], seed: 37 },
  { half: [tip(0, 1), sinus(26, 0.74), tip(48, 0.8), sinus(80, 0.6), tip(108, 0.58), edge(148, 0.3), edge(180, 0.1)], hang: 56, roll: -6, yaw: 9, tipsDown: [0.04, 0.04, 0.02], seed: 41 },
];
const LOBES = CLIMBING_LEAVES.map((leaf) => 2 * leaf.half.filter((k) => k.kind === 'tip').length - 1);
if (Math.min(...LOBES) !== FEWEST_LOBES || Math.max(...LOBES) !== MOST_LOBES) throw new Error(`hedera-helix: the climbing leaves are drawn with ${LOBES.join(', ')} lobes, and its morphology gives ${FEWEST_LOBES} to ${MOST_LOBES}`);

/** The blade from where the stalk joins to the tip of its end lobe, as a share of the reach of the whole leaf. */
const CLIMBING_BLADE = 0.8;
/** How pale a main vein is drawn: its share of the way from the green of the blade to the palette's vein colour. */
const VEIN = 0.7;
/** Half the width of the pale band along a main vein where it leaves the stalk, the end lobe being 1. */
const VEIN_HALF_WIDTH = 0.02;

interface BladeDetail {
  /** Pieces each stretch of the outline is cut into, rings from the stalk outwards, and whether a main vein has a narrow band of its own. */
  pieces: number;
  rings: number;
  veins: boolean;
  /** How pale the vein columns are: less on the coarsest model, where a vein is as wide as half a lobe. */
  pale: number;
  /** Fine relief: the wave of the edge. */
  fine: boolean;
}
const BLADE_DETAIL: readonly BladeDetail[] = [
  { pieces: 4, rings: 8, veins: true, pale: VEIN, fine: true },
  { pieces: 2, rings: 4, veins: true, pale: VEIN, fine: false },
  // from far off: a flat fan of triangles to the corners of the outline
  { pieces: 1, rings: 1, veins: false, pale: 0.1, fine: false },
];

/**
 * Gives vertices that stand at the same place the same normal. A lobed blade
 * is made a sheet to each lobe, and without this the light would break along
 * the lines where the sheets meet.
 */
function smoothSeams(g: THREE.BufferGeometry): void {
  const position = g.getAttribute('position');
  const normal = g.getAttribute('normal');
  const sums = new Map<string, [number, number, number]>();
  const key = (i: number): string => `${Math.round(position.getX(i) * 1e5)},${Math.round(position.getY(i) * 1e5)},${Math.round(position.getZ(i) * 1e5)}`;
  for (let i = 0; i < position.count; i++) {
    const s = sums.get(key(i)) ?? [0, 0, 0];
    s[0] += normal.getX(i);
    s[1] += normal.getY(i);
    s[2] += normal.getZ(i);
    sums.set(key(i), s);
  }
  for (let i = 0; i < position.count; i++) {
    const [x, y, z] = sums.get(key(i))!;
    const length = Math.hypot(x, y, z);
    // where every lobe meets at the stalk the sum is the blade's own upper side
    if (length > 1e-9) normal.setXYZ(i, x / length, y / length, z / length);
    else normal.setXYZ(i, 0, 1, 0);
  }
}

/** A blade with the pale share of every vertex, in the order the vertices were made. */
interface Blade {
  geometry: THREE.BufferGeometry;
  pale: number[];
}

/** Copies the colour share of each vertex of a blade into the merge it was just added to. */
function tintBlade(mg: Merge, from: number, pale: readonly number[]): void {
  for (let i = 0; i < pale.length; i++) mg.part[4 * (from + i) + 3] = pale[i]!;
}

/**
 * A lobed blade lying in the XZ plane, upper side +Y, the stalk joining at the
 * origin and the tip of the end lobe at z = 1. One sheet to each lobe, fanned
 * from the stalk between the two sinuses beside it, with the lobe's main vein
 * up its middle: so the shared leaf texture, whose midrib is at u = 0.5, puts
 * a pale vein up every lobe and its side veins either side of that.
 */
function climbingBlade(leaf: ClimbingLeaf, detail: BladeDetail): Blade {
  const rng = new RNG(leaf.seed);
  const phase = rng.range(0, TAU);
  // the whole outline, from the notch round the left side, over the end lobe and back down the right side to the notch
  const ring: Knot[] = [...leaf.half.slice(1).map((k) => ({ ...k, deg: -k.deg })).reverse(), ...leaf.half];
  const at = (k: Knot): [number, number] => [k.r * Math.sin(k.deg * DEG), k.r * Math.cos(k.deg * DEG)];
  const longest = Math.max(...ring.map((k) => k.r));

  const sb = new Surf();
  const uvs: number[] = [];
  const pale: number[] = [];
  // a lobe runs from one sinus to the next; the notch at the stalk ends the two basal ones
  let start = 0;
  let lobe = 0;
  const tips = ring.filter((k) => k.kind === 'tip').length;
  for (let end = 1; end < ring.length; end++) {
    if (ring[end]!.kind !== 'sinus' && end !== ring.length - 1) continue;
    const knots = ring.slice(start, end + 1);
    start = end;
    // 0 the end lobe, 1 the side lobes, 2 the basal ones
    const rank = Math.abs(lobe - (tips - 1) / 2);
    lobe++;

    // the rim of this lobe: each stretch between knots cut into pieces and bowed outwards a little, as a lobe's sides are
    interface Column {
      x: number;
      z: number;
      /** 0 an ordinary column, 1 the main vein, 2 the edge of the vein's pale band (its neighbour on the rim is `beside`). */
      vein: 0 | 1 | 2;
      beside: number;
    }
    const rim: Column[] = [];
    for (let k = 0; k < knots.length - 1; k++) {
      const [ax, az] = at(knots[k]!);
      const [bx, bz] = at(knots[k + 1]!);
      // outwards: square to the stretch, on the side away from the stalk
      let nx = bz - az;
      let nz = -(bx - ax);
      if (nx * (ax + bx) + nz * (az + bz) < 0) {
        nx = -nx;
        nz = -nz;
      }
      for (let s = 0; s < detail.pieces; s++) {
        const f = s / detail.pieces;
        // (nx, nz) is as long as the stretch, so the bow is a share of its length
        const bow = 0.055 * Math.sin(Math.PI * f);
        rim.push({ x: lerp(ax, bx, f) + nx * bow, z: lerp(az, bz, f) + nz * bow, vein: s === 0 && knots[k]!.kind === 'tip' ? 1 : 0, beside: 0 });
      }
    }
    const last = knots[knots.length - 1]!;
    rim.push({ x: at(last)[0], z: at(last)[1], vein: 0, beside: 0 });
    const veinAt = rim.findIndex((c) => c.vein === 1);
    if (veinAt <= 0 || veinAt >= rim.length - 1) throw new Error('hedera-helix: every lobe of a climbing leaf needs one tip between two sinuses');

    // the columns of the sheet: the rim, with a narrow column either side of the vein where the model is fine enough
    const columns: Column[] = [];
    rim.forEach((c, i) => {
      const side = (towards: number): Column => ({ x: lerp(c.x, rim[towards]!.x, 0.2), z: lerp(c.z, rim[towards]!.z, 0.2), vein: 2, beside: 0 });
      if (i === veinAt && detail.veins) columns.push(side(i - 1));
      columns.push(c);
      if (i === veinAt && detail.veins) columns.push(side(i + 1));
    });
    const veinColumn = columns.findIndex((c) => c.vein === 1);
    columns.forEach((c, i) => {
      if (c.vein === 2) c.beside = i < veinColumn ? i - 1 : i + 1;
    });
    // across the lobe for the texture: the vein at 0.5, the sinuses at the two edges, by distance along the rim
    const along: number[] = [0];
    for (let i = 1; i < columns.length; i++) along.push(along[i - 1]! + Math.hypot(columns[i]!.x - columns[i - 1]!.x, columns[i]!.z - columns[i - 1]!.z));
    const us = columns.map((_, i) => (i <= veinColumn ? 0.5 * (along[i]! / along[veinColumn]!) : 0.5 + 0.5 * ((along[i]! - along[veinColumn]!) / (along[columns.length - 1]! - along[veinColumn]!))));
    const vein = columns[veinColumn]!;
    const reach = Math.hypot(vein.x, vein.z);
    const down = leaf.tipsDown[Math.min(2, Math.round(rank))]!;

    const nu = columns.length - 1;
    sb.surf(nu, detail.rings, (u01, v01) => {
      const i = Math.round(u01 * nu);
      const c = columns[i]!;
      const rho = Math.pow(v01, 0.85);
      let x = rho * c.x;
      let z = rho * c.z;
      if (c.vein === 2) {
        // a band of its own width along the vein, narrowing to the tip, and never wider than half way to the next column
        const n = columns[c.beside]!;
        const dx = rho * (n.x - vein.x);
        const dz = rho * (n.z - vein.z);
        const gap = Math.hypot(dx, dz);
        const w = Math.min(VEIN_HALF_WIDTH * (1 - 0.75 * rho), 0.5 * gap);
        x = rho * vein.x + (gap > 1e-9 ? (dx / gap) * w : 0);
        z = rho * vein.z + (gap > 1e-9 ? (dz / gap) * w : 0);
      }
      const r = Math.hypot(x, z);
      const across = Math.abs(us[i]! - 0.5) * 2;
      // nearly flat: a little domed, the blade swelling slightly between its veins, the lobe tips turned down.
      // Nothing here differs between two lobes along the sinus line they share, or the blade would gape there
      let y = -0.05 * r * r + 0.009 * Math.sin(Math.PI * Math.min(1, across)) * Math.pow(rho, 0.6) * (1 - 0.35 * rho) - down * rho * rho * reach * (1 - Math.min(1, across));
      if (detail.fine) y += 0.008 * Math.sin(Math.atan2(x, z) * 4.3 + phase) * rho * rho * rho;
      // the texture: its midrib up the vein, and its side veins, a few to a lobe, running forwards from the vein to the edge
      uvs.push(c.vein === 2 ? (i < veinColumn ? 0.455 : 0.545) : us[i]!, 0.02 + 0.55 * (reach / longest) * Math.max(0, rho - 0.3 * across * rho));
      pale.push(c.vein === 1 && v01 > 0 ? detail.pale : 0);
      return { p: [x, y, z] };
    });
  }
  for (let i = 0; i < uvs.length; i++) sb.uv[i] = uvs[i]!;
  const geometry = sb.build();
  smoothSeams(geometry);
  return { geometry, pale };
}

/** The stalk: out along +Z from the stem, arched a little, to where the blade hangs from it. */
function leafStalk(mg: Merge, length: number, lod: number): V3 {
  const n = [4, 3, 2][lod]!;
  const points: V3[] = [];
  const radii: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    points.push(new V3(0, 0.07 * length * 4 * t * (1 - t) + 0.02 * t, length * t));
    radii.push(lerp(0.013, 0.009, t));
  }
  mg.tube(points, radii, [6, 4, 3][lod]!, WHITE, WHITE, MIDRIB);
  return points[n]!;
}

/**
 * A whole leaf: the stalk, and the blade hung from its end and turned as
 * `hang`, `roll` and `yaw` say. The stalk is as long as leaves one unit from
 * the stem to the farthest point of the blade, so that the length in the
 * render data is the reach of the leaf as it is held.
 */
function hangBlade(blade: Blade, scale: number, hang: number, roll: number, yaw: number, lod: number): THREE.BufferGeometry {
  const mg = new Merge(true);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(hang * DEG, yaw * DEG, roll * DEG, 'YXZ'));
  const position = blade.geometry.getAttribute('position');
  const p = new V3();
  let forward = 0;
  for (let i = 0; i < position.count; i++) forward = Math.max(forward, p.fromBufferAttribute(position, i).applyQuaternion(q).z * scale);
  const from = leafStalk(mg, 1 - forward, lod);
  const first = mg.n;
  mg.add(blade.geometry, new THREE.Matrix4().compose(from, q, new V3(scale, scale, scale)), WHITE, from, 0);
  tintBlade(mg, first, blade.pale);
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, -0.25, 0.55), 1);
  return g;
}

function makeClimbingLeaf(variant: number, lod: number): THREE.BufferGeometry {
  const leaf = CLIMBING_LEAVES[variant]!;
  return hangBlade(climbingBlade(leaf, BLADE_DETAIL[lod]!), CLIMBING_BLADE, leaf.hang, leaf.roll, leaf.yaw, lod);
}

// ---------------------------------------------------------------------------
// The adult leaf: unlobed, ovate to diamond-shaped
// ---------------------------------------------------------------------------
interface AdultLeaf {
  /** Half the width as a share of the length, where along the blade it is widest, and how straight its sides run to the tip (1 a diamond, below 1 fuller). */
  halfWidth: number;
  widest: number;
  taper: number;
  hang: number;
  roll: number;
  yaw: number;
  seed: number;
}
/** Ovate, diamond-shaped ("ovate or rhombic", Metcalfe), and the narrower leaf that stands under the flowers ("more narrowly ovate", Bean). */
const ADULT_LEAVES: readonly AdultLeaf[] = [
  { halfWidth: 0.34, widest: 0.36, taper: 0.8, hang: 42, roll: 7, yaw: -5, seed: 53 },
  { halfWidth: 0.36, widest: 0.45, taper: 1, hang: 50, roll: -10, yaw: 6, seed: 59 },
  { halfWidth: 0.27, widest: 0.38, taper: 0.85, hang: 36, roll: 4, yaw: 3, seed: 61 },
];
/** The adult blade as a share of the reach of the whole leaf. */
const ADULT_BLADE = 0.95;
const ADULT_DETAIL: readonly { across: readonly number[]; along: number; pale: number; fine: boolean }[] = [
  { across: [0, 0.14, 0.3, 0.44, 0.5, 0.56, 0.7, 0.86, 1], along: 12, pale: 0.55, fine: true },
  { across: [0, 0.25, 0.44, 0.5, 0.56, 0.75, 1], along: 5, pale: 0.55, fine: false },
  { across: [0, 0.5, 1], along: 3, pale: 0.08, fine: false },
];

function adultBlade(leaf: AdultLeaf, lod: number): Blade {
  const detail = ADULT_DETAIL[lod]!;
  const phase = new RNG(leaf.seed).range(0, TAU);
  const sb = new Surf();
  const pale: number[] = [];
  const nu = detail.across.length - 1;
  // a wedge-shaped base opening to the widest point, then straight or fuller sides to a drawn-out tip
  const width = (v: number): number => {
    if (v <= 0 || v >= 1) return 0;
    const rise = Math.pow(v / leaf.widest, 0.8);
    const fall = Math.pow((1 - v) / (1 - leaf.widest), leaf.taper);
    return leaf.halfWidth * Math.pow(Math.pow(rise, -5) + Math.pow(fall, -5), -1 / 5) * (v > 0.82 ? lerp(1, 0.55, (v - 0.82) / 0.18) : 1);
  };
  sb.surf(nu, detail.along, (u01, v) => {
    const i = Math.round(u01 * nu);
    const u = detail.across[i]! * 2 - 1;
    const hw = width(v) + 0.004;
    // the columns beside the midrib keep a band of their own width
    const beside = Math.abs(detail.across[i]! - 0.5) > 1e-6 && Math.abs(detail.across[i]! - 0.5) < 0.07;
    const x = beside ? Math.sign(u) * Math.min(0.016 * (1 - 0.7 * v), 0.5 * hw) : u * hw;
    const edgeward = hw > 0 ? Math.abs(x) / hw : 0;
    // folded up a little from the midrib, arched to the tip, the edge waved
    let y = 0.2 * Math.abs(x) - 0.1 * v * v + 0.02 * Math.sin(Math.PI * edgeward) * hw;
    if (detail.fine) y += 0.035 * Math.sin(v * 12 + phase + (u > 0 ? 1.3 : 0)) * edgeward * edgeward * Math.sin(Math.PI * v);
    pale.push(i === (nu >> 1) && v > 0 ? detail.pale * (1 - 0.4 * v) : 0);
    return { p: [x, y, v] };
  });
  // the texture across the blade as it is drawn (the columns are not evenly spaced), and half of it along: five or six side veins a side
  for (let j = 0; j <= detail.along; j++) {
    for (let i = 0; i <= nu; i++) {
      const at = 2 * (j * (nu + 1) + i);
      sb.uv[at] = detail.across[i]!;
      sb.uv[at + 1] = 0.03 + 0.52 * (j / detail.along);
    }
  }
  return { geometry: sb.build(), pale };
}

function makeAdultLeaf(variant: number, lod: number): THREE.BufferGeometry {
  const leaf = ADULT_LEAVES[variant]!;
  return hangBlade(adultBlade(leaf, lod), ADULT_BLADE, leaf.hang, leaf.roll, leaf.yaw, lod);
}

// ---------------------------------------------------------------------------
// The inflorescence: a panicle of globose umbels. One unit is its greatest
// extent; it stands along +Y from the end of its shoot.
// ---------------------------------------------------------------------------
/** The extent of the panicle in metres, by which every measured part below is brought into the units of the model. */
const PANICLE_M = mid(characterRange(morphology, 'inflorescence.extentM'));
/** "about 20 flowers in each umbel" (Metcalfe); the lower umbels are drawn with fewer, as few as the published range allows half way. */
const FLOWERS_IN_END_UMBEL = characterNumber(morphology, 'inflorescence.flowersPerUmbel');
const FLOWERS_IN_LOWER_UMBEL = Math.round(mid(characterRange(morphology, 'inflorescence.flowersPerUmbelRange')));
/** "3-5 umbels in a panicle" (Metcalfe): one variant for each number. */
const [FEWEST_UMBELS, MOST_UMBELS] = characterRange(morphology, 'inflorescence.umbelsPerPanicle');
const PANICLE_VARIANTS = MOST_UMBELS - FEWEST_UMBELS + 1;
const PETALS = characterNumber(morphology, 'flower.petalCount');
const STAMENS = characterNumber(morphology, 'flower.stamenCount');
/** Petals "3-4 mm" (Metcalfe); the disc 2.1 mm across (Konarska); the style about 1.5 mm (VicFlora): in units of the model. */
const PETAL = mid(characterRange(morphology, 'flower.petalLengthM')) / PANICLE_M;
const DISC = characterNumber(morphology, 'flower.discDiameterM') / 2 / PANICLE_M;
const STYLE = characterNumber(morphology, 'flower.styleLengthM') / PANICLE_M;
/** Half the width of the end umbel, to the tips of its flowers: umbels are 3-5 cm across, and the end one is the largest of a panicle. */
const UMBEL = mid(characterRange(morphology, 'inflorescence.umbelDiameterM')) / 2 / PANICLE_M;
/** The inferior ovary under the disc: about as tall as the disc is wide. Appearance: no source measures it at flowering. */
const OVARY = 2.2 * DISC;

const FLOWER = {
  petal: lin('#c4cc6c'),
  petalTip: lin('#a9b85a'),
  filament: lin('#d5dba0'),
  anther: lin('#ead23a'),
  disc: lin('#a2aa3c'),
  discRim: lin('#8f9a48'),
  style: lin('#c3c878'),
  // stalks and the outside of the ovary are felted with pale star-shaped hairs
  ovary: lin('#8b9a6a'),
  stalk: lin('#84916a'),
  stalkOld: lin('#788460'),
};

/** What stays of a flower when its petals have gone: the ovary, the disc on top of it and the style. Along +Y from the end of its stalk. */
function flowerBody(lod: number): THREE.BufferGeometry {
  const sb = new Surf();
  if (lod >= 2) {
    lathe(sb, [3, 2], (v) => [[0.3 * DISC, 1.2 * DISC, 0.2 * DISC][Math.round(v * 2)]!, [0, OVARY, OVARY + 0.6 * DISC][Math.round(v * 2)]!], (_u, v) => mix(FLOWER.ovary, FLOWER.disc, v));
    return sb.build();
  }
  const around = lod === 0 ? 8 : 5;
  // the ovary: a top-shaped cup widening from the stalk to the rim
  lathe(sb, [around, lod === 0 ? 2 : 1], (v) => [lerp(0.3, 1.2, Math.pow(v, 0.7)) * DISC, OVARY * v], (_u, v) => mix(FLOWER.ovary, FLOWER.discRim, v * 0.6));
  // the disc: a low dome over the top of the ovary, and the style standing from its middle
  lathe(sb, [around, 2], (v) => [1.2 * DISC * Math.cos((Math.PI / 2) * v * 0.86), OVARY + 0.6 * DISC * Math.sin((Math.PI / 2) * v)], (u, v) => mix(FLOWER.discRim, FLOWER.disc, Math.min(1, v * 1.6 + 0.15 * Math.sin(u * TAU * 5))));
  if (lod === 0) lathe(sb, [3, 1], (v) => [0.2 * DISC * (1 - 0.6 * v), OVARY + 0.55 * DISC + STYLE * v], () => FLOWER.style);
  return sb.build();
}

/** What opens and falls: five petals from the rim of the ovary, spread flat and then bent back, and five stamens between them. */
function flowerCorolla(lod: number): THREE.BufferGeometry {
  const sb = new Surf();
  const rim = 1.15 * DISC;
  for (let k = 0; k < PETALS; k++) {
    const a = (k / PETALS) * TAU;
    const out = new V3(Math.cos(a), 0, Math.sin(a));
    const side = new V3(-Math.sin(a), 0, Math.cos(a));
    const [nu, nv] = ([[2, 4], [1, 2], [1, 1]] as const)[lod]!;
    // the line of the petal: out from the rim, bending back below it, its hooded tip turned up again
    const line = (v: number): [number, number] => {
      let o = 0;
      let h = 0;
      const steps = 8;
      for (let s = 0; s < steps; s++) {
        const t = ((s + 0.5) / steps) * v;
        const bend = (lerp(12, -68, Math.min(1, t / 0.8)) + (t > 0.8 ? ((t - 0.8) / 0.2) * 45 : 0)) * DEG;
        o += (Math.cos(bend) * PETAL * v) / steps;
        h += (Math.sin(bend) * PETAL * v) / steps;
      }
      return [o, h];
    };
    sb.surf(nu, nv, (u01, v) => {
      const u = u01 * 2 - 1;
      // triangular-ovate: widest low down, drawn to a point
      const hw = 0.3 * PETAL * Math.sin(Math.PI * (0.25 + 0.75 * v));
      const [o, h] = line(v);
      const p = out.clone().multiplyScalar(rim + o).addScaledVector(side, u * hw);
      return { p: [p.x, OVARY + h - 0.12 * PETAL * u * u, p.z], c: mix(FLOWER.petal, FLOWER.petalTip, v) };
    });
  }
  for (let k = 0; k < STAMENS; k++) {
    // between the petals, standing out and up from the edge of the disc
    const a = ((k + 0.5) / STAMENS) * TAU;
    const out = new V3(Math.cos(a), 0, Math.sin(a));
    const lean = 52 * DEG;
    const dir = out.clone().multiplyScalar(Math.sin(lean)).add(new V3(0, Math.cos(lean), 0));
    const from = out.clone().multiplyScalar(0.95 * DISC).add(new V3(0, OVARY + 0.15 * DISC, 0));
    const length = 0.95 * PETAL;
    const to = from.clone().addScaledVector(dir, length);
    if (lod === 0) {
      const side = new V3().crossVectors(dir, UP).normalize();
      const other = new V3().crossVectors(dir, side);
      sb.surf(3, 1, (u, v) => {
        const th = u * TAU;
        const r = 0.035 * PETAL;
        const p = from.clone().lerp(to, v).addScaledVector(side, Math.cos(th) * r).addScaledVector(other, Math.sin(th) * r);
        return { p: [p.x, p.y, p.z], c: FLOWER.filament };
      });
      // the anther: a short fat body across the top of its filament
      sb.surf(4, 2, (u, v) => {
        const th = u * TAU;
        const r = 0.13 * PETAL * Math.sin(Math.PI * v);
        const p = to.clone().addScaledVector(side, (v - 0.5) * 0.34 * PETAL).addScaledVector(dir, Math.cos(th) * r).addScaledVector(other, Math.sin(th) * r);
        return { p: [p.x, p.y, p.z], c: FLOWER.anther };
      });
    } else if (lod === 1) {
      // a filament as a sliver, yellow at its end
      const side = new V3().crossVectors(dir, UP).normalize();
      sb.surf(1, 1, (u, v) => {
        const p = from.clone().lerp(to, v * 1.1).addScaledVector(side, (u - 0.5) * 0.22 * PETAL * (0.3 + v));
        return { p: [p.x, p.y, p.z], c: mix(FLOWER.filament, FLOWER.anther, v) };
      });
    }
  }
  return sb.build();
}

/** `count` directions spread evenly over the part of a sphere within `spread` of `axis`: the stalks of an umbel. */
function rays(axis: V3, count: number, spread: number, seed: number): V3[] {
  const a = new V3(1, 0, 0);
  if (Math.abs(axis.x) > 0.9) a.set(0, 0, 1);
  a.addScaledVector(axis, -a.dot(axis)).normalize();
  const b = new V3().crossVectors(axis, a);
  const lowest = Math.cos(spread);
  return Array.from({ length: count }, (_, i) => {
    const c = 1 - ((i + 0.5) / count) * (1 - lowest);
    const s = Math.sqrt(1 - c * c);
    const turn = i * 2.39996 + hash2(seed, i) * 0.5;
    return axis.clone().multiplyScalar(c).addScaledVector(a, s * Math.cos(turn)).addScaledVector(b, s * Math.sin(turn)).normalize();
  });
}

const PANICLE_LODS = 4;
const bodyCache: THREE.BufferGeometry[] = [];
const corollaCache: THREE.BufferGeometry[] = [];

function makePanicle(variant: number, lod: number): THREE.BufferGeometry {
  // the coarsest level draws no single flower
  if (lod < 3) {
    bodyCache[lod] ??= flowerBody(lod);
    corollaCache[lod] ??= flowerCorolla(lod);
  }
  const umbels = FEWEST_UMBELS + variant;
  const rng = new RNG(700 + variant * 13);
  const mg = new Merge(false);
  const radial = [6, 4, 3, 3][lod]!;
  const thickness = lod === 3 ? 1.6 : 1;

  // the axis: the end of the shoot, carrying the lower umbels on stalks of their own and ending in the largest
  const lean = new V3(rng.range(-0.05, 0.05), 1, rng.range(-0.05, 0.05)).normalize();
  const top = lean.clone().multiplyScalar(0.47);
  mg.tube([new V3(), top.clone().multiplyScalar(0.5), top], [0.02 * thickness, 0.017 * thickness, 0.014 * thickness], radial, FLOWER.stalkOld, FLOWER.stalk);

  interface Umbel {
    centre: V3;
    axis: V3;
    radius: number;
    flowers: number;
    /** When it opens: the end umbel first, then the others in turn back towards the leaves. */
    order: number;
  }
  const heads: Umbel[] = [{ centre: top, axis: lean, radius: UMBEL, flowers: FLOWERS_IN_END_UMBEL, order: 0 }];
  const turn0 = rng.range(0, TAU);
  for (let k = 1; k < umbels; k++) {
    // the nearest to the end umbel is the highest on the axis and opens next
    const f = (k - 1) / Math.max(1, umbels - 2);
    const from = top.clone().multiplyScalar(lerp(0.7, 0.24, f));
    const turn = turn0 + k * 2.39996;
    const out = new V3(Math.cos(turn), 0, Math.sin(turn));
    const dir = out.multiplyScalar(Math.sin(56 * DEG)).addScaledVector(lean, Math.cos(56 * DEG)).normalize();
    const length = lerp(0.24, 0.3, f) * rng.range(0.94, 1.06);
    const centre = from.clone().addScaledVector(dir, length);
    // the stalk bows upwards a little on its way out
    mg.tube([from, from.clone().lerp(centre, 0.5).addScaledVector(lean, -0.02), centre], [0.013 * thickness, 0.011 * thickness, 0.01 * thickness], radial, FLOWER.stalkOld, FLOWER.stalk);
    heads.push({ centre, axis: dir.clone().lerp(lean, 0.25).normalize(), radius: UMBEL * 0.82, flowers: FLOWERS_IN_LOWER_UMBEL, order: k / umbels });
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const spin = new THREE.Quaternion();
  const one = new V3(1, 1, 1);
  heads.forEach((head, h) => {
    if (lod === 3) {
      // from far off an umbel is a ball: yellow-green while it flowers, the green knot of ovaries when it has done
      const ball = (radius: number, around: number, along: number, colour: (u: number, v: number) => RGB): THREE.BufferGeometry => {
        const sb = new Surf();
        lathe(sb, [around, along], (v) => [radius * Math.sin(Math.PI * (0.02 + 0.96 * v)), -radius * Math.cos(Math.PI * (0.02 + 0.96 * v))], colour);
        return sb.build();
      };
      q.setFromUnitVectors(UP, head.axis);
      m.compose(head.centre, q, one);
      mg.add(ball(head.radius * 0.72, 5, 2, (u) => mix(FLOWER.ovary, FLOWER.disc, 0.3 + 0.3 * hash2(h, Math.round(u * 5)))), m, WHITE, head.centre, -1);
      mg.add(ball(head.radius, 6, 3, (u, v) => mix(FLOWER.petal, FLOWER.anther, 0.2 + 0.45 * hash2(h + 9, Math.round(u * 6) + 7 * Math.round(v * 3)))), m, WHITE, head.centre, head.order);
      return;
    }
    // globose: stalks in every direction but back down the stalk of the umbel
    rays(head.axis, head.flowers, 128 * DEG, 31 * variant + h).forEach((dir, i) => {
      // the stalk of a flower: what is left of the umbel's radius under the ovary and the stamens that stand out beyond it
      const stalk = (head.radius - OVARY - 0.75 * PETAL) * (0.9 + 0.2 * hash2(variant * 17 + h, i));
      const at = head.centre.clone().addScaledVector(dir, stalk);
      mg.tube([head.centre.clone(), at], [0.0065, 0.0055], lod === 0 ? 4 : 3, FLOWER.stalk, FLOWER.ovary);
      q.setFromUnitVectors(UP, dir).multiply(spin.setFromAxisAngle(UP, hash2(h * 7 + 3, i) * TAU));
      m.compose(at, q, one);
      const tone = 0.92 + 0.16 * hash2(i, h + 5);
      mg.add(bodyCache[lod]!, m, [tone, tone, tone], at, -1);
      // the flowers of one umbel open more or less together
      mg.add(corollaCache[lod]!, m, [tone, tone, tone], at.clone().addScaledVector(dir, OVARY), clamp(head.order + 0.1 * hash2(i + 11, h), 0, 1));
    });
  });
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, 0.4, 0), 0.75);
  return g;
}

// ---------------------------------------------------------------------------
// The fruit: the one umbel of a panicle that sets, full of berries. One unit
// is its width; it stands along +Y on the stalk the umbel flowered on.
// ---------------------------------------------------------------------------
const CLUSTER_M = mid(characterRange(morphology, 'fruit.clusterWidthM'));
/** Berries "globose, 6-8 mm" (Metcalfe), in units of the model. */
const BERRY = mid(characterRange(morphology, 'fruit.diameterM')) / 2 / CLUSTER_M;
/** How many berries an umbel is drawn with: the fewest, the most, and half way. */
const BERRY_COUNTS = ((range: readonly [number, number]): readonly number[] => [range[0], Math.round(mid(range)), range[1]])(characterRange(morphology, 'fruit.berriesPerUmbel'));
const BERRY_STYLE = characterNumber(morphology, 'flower.styleLengthM') / CLUSTER_M;

const FRUIT = {
  // unripe: green. The green of each colour also says how dark the ripe fruit is there (see ripeShade)
  berry: lin('#5c8a3a'),
  berryShade: lin('#4c7a34'),
  crown: lin('#6a7a3c'),
  style: lin('#8a8f50'),
  stalk: lin('#7a9a4c'),
};

function berry(lod: number): THREE.BufferGeometry {
  const sb = new Surf();
  const [around, along] = ([[10, 6], [5, 3], [4, 2]] as const)[lod]!;
  // globose, a little flattened on top, where the disc of the flower was
  lathe(
    sb,
    [around, along],
    (v) => {
      const a = Math.PI * (0.03 + 0.83 * v);
      return [BERRY * Math.sin(a), BERRY * (1 - Math.cos(a))];
    },
    (u, v) => mix(FRUIT.berryShade, FRUIT.berry, 0.5 + 0.5 * Math.sin(u * TAU + v * 2)),
  );
  if (lod < 2) {
    // the scar of the disc: a low ring closing the top, and the style left standing in its middle
    const topAt = BERRY * (1 - Math.cos(Math.PI * 0.86));
    const rimAt = BERRY * Math.sin(Math.PI * 0.86);
    lathe(sb, [around, lod === 0 ? 2 : 1], (v) => [rimAt * (1 - 0.82 * v), topAt + 0.07 * BERRY * Math.sin(Math.PI * v)], () => FRUIT.crown);
    if (lod === 0) lathe(sb, [4, 1], (v) => [0.18 * rimAt * (1 - 0.7 * v), topAt + BERRY_STYLE * 0.7 * v], () => FRUIT.style);
  }
  return sb.build();
}

const BERRY_LODS = 3;
const berryCache: THREE.BufferGeometry[] = [];

function makeBerries(variant: number, lod: number): THREE.BufferGeometry {
  berryCache[lod] ??= berry(lod);
  const count = BERRY_COUNTS[variant]!;
  const mg = new Merge(false);
  const lean = new V3(0.06 * (variant - 1), 1, 0.04).normalize();
  // the stalk of the umbel, as long as the cluster is wide
  const centre = lean.clone().multiplyScalar(0.92);
  mg.tube([new V3(), centre.clone().multiplyScalar(0.5), centre], [0.038, 0.032, 0.028], [6, 4, 3][lod]!, FRUIT.stalk, FRUIT.stalk);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new V3(1, 1, 1);
  rays(lean, count, 125 * DEG, 400 + variant).forEach((dir, i) => {
    // each berry at the end of the stalk its flower stood on: the cluster is half a unit from its middle to its outside
    const stalk = (0.5 - 2 * BERRY) * (0.86 + 0.28 * hash2(variant + 40, i));
    const at = centre.clone().addScaledVector(dir, stalk);
    if (lod < 2) mg.tube([centre.clone(), at], [0.017, 0.015], lod === 0 ? 4 : 3, FRUIT.stalk, FRUIT.stalk);
    q.setFromUnitVectors(UP, dir);
    const s = 0.9 + 0.2 * hash2(i, variant + 3);
    m.compose(at, q, lod === 2 ? new V3(1.12 * s, 1.12 * s, 1.12 * s) : one.clone().multiplyScalar(s));
    const tone = 0.9 + 0.2 * hash2(i + 5, variant);
    mg.add(berryCache[lod]!, m, [tone, tone, tone], at, 0);
  });
  // a few flowers set nothing: their stalks stand empty
  if (lod === 0) for (const dir of rays(lean, 3, 110 * DEG, 77 + variant)) mg.tube([centre.clone(), centre.clone().addScaledVector(dir, 0.2)], [0.015, 0.011], 3, FRUIT.stalk, FRUIT.stalk);
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, 0.7, 0), 0.9);
  return g;
}

// ---------------------------------------------------------------------------
// The hold: a cluster of rootlets on the side of the stem that lies on the
// timber. The render data gives the way into the surface as +Z; the cluster
// lies on that surface, in the XY plane, spreading from under the stem. Which
// way the stem runs across that plane is not told to a model, so the two rows
// a real cluster stands in cannot be laid along the stem: the roots are drawn
// as a tuft spreading all round, and the stem covers those that lie along it.
// ---------------------------------------------------------------------------
/** "a median of 38 roots to a root cluster" (Melzer et al. 2012). */
const ROOTLETS_IN_CLUSTER = characterNumber(morphology, 'stem.rootletsPerCluster');
const ROOTLET_LODS = 3;
const ROOTLET = { young: lin('#cdbf96'), tip: lin('#e2d8b4'), old: lin('#5e4a34') };

function makeRootlets(variant: number, lod: number): THREE.BufferGeometry {
  const mg = new Merge(false);
  const count = [ROOTLETS_IN_CLUSTER, 14, 7][lod]!;
  const seed = 900 + variant * 29;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + (hash2(seed, i) - 0.5) * 0.9;
    // they leave the stem along a stretch of it and not at one point: each starts somewhere under it
    const under = 0.4 * Math.sqrt(hash2(seed + 4, i));
    const where = a + (hash2(seed + 7, i) - 0.5) * 1.4;
    const fromX = Math.cos(where) * under;
    const fromY = Math.sin(where) * under;
    // unbranched, of unequal length, a little crooked, pressed to the surface: off it only where it leaves the stem
    const length = 0.4 + 0.6 * hash2(seed + 1, i);
    const bend = (hash2(seed + 2, i) - 0.5) * 1.1;
    const at = (t: number): V3 => {
      const b = a + bend * t;
      return new V3(fromX + Math.cos(b) * length * t, fromY + Math.sin(b) * length * t, -0.1 * (1 - t) * (1 - t) - 0.025);
    };
    const thick = (lod === 2 ? 0.075 : 0.045) * (0.8 + 0.4 * hash2(seed + 3, i));
    if (lod === 0) mg.tube([at(0.05), at(0.55), at(1)], [thick, thick * 0.85, thick * 0.5], 3, ROOTLET.young, ROOTLET.tip);
    else mg.tube([at(0.05), at(1)], [thick, thick * 0.6], 3, ROOTLET.young, ROOTLET.tip);
  }
  // and into the surface, where it gives them a crack to enter: these are the length the data gives, along the way it gives
  const into = lod === 0 ? 3 : 1;
  for (let i = 0; i < into; i++) {
    const a = hash2(seed + 5, i) * TAU;
    const off = new V3(Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0);
    mg.tube([off.clone().setZ(-0.03), off.clone().multiplyScalar(1.6).setZ(0.92 + 0.06 * hash2(seed + 6, i))], [0.045, 0.02], 3, ROOTLET.young, ROOTLET.tip);
  }
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, 0, 0.3), 1.2);
  return g;
}

// ---------------------------------------------------------------------------
// The look
// ---------------------------------------------------------------------------
const climbingLeaf: LeafAsset = {
  key: 'hedera-helix/leaf',
  variants: CLIMBING_LEAVES.length,
  lods: BLADE_DETAIL.length,
  make: makeClimbingLeaf,
  budget: [1100, 340, 40],
  // five lobes for most; three, or shallow ones, for the rest
  pick: (_lengthM, r) => (r < 0.4 ? 0 : r < 0.65 ? 1 : r < 0.85 ? 2 : 3),
  // dark and shining, the veins pale (greenB is what a vein is drawn towards); evergreen, so it has no autumn colours of its own
  palette: { greenA: lin('#2c4a17'), greenB: lin('#b4c090'), young: lin('#8aa43a'), autumnA: lin('#2c4a17'), autumnB: lin('#b4c090') },
  roughness: 0.36,
  // leathery: little light comes through
  translucency: 0.2,
  detailReach: 0.75,
};

const adultLeaf: LeafAsset = {
  key: 'hedera-helix/adult-leaf',
  variants: ADULT_LEAVES.length,
  lods: ADULT_DETAIL.length,
  make: makeAdultLeaf,
  budget: [260, 100, 40],
  pick: (_lengthM, r) => (r < 0.45 ? 0 : r < 0.8 ? 1 : 2),
  // a little lighter and plainer than the climbing leaf, its veins less marked
  palette: { greenA: lin('#33531a'), greenB: lin('#9bad72'), young: lin('#8fa83e'), autumnA: lin('#33531a'), autumnB: lin('#9bad72') },
  roughness: 0.38,
  translucency: 0.2,
  detailReach: 0.75,
};

const panicle: FlowerAsset = {
  key: 'hedera-helix/panicle',
  variants: PANICLE_VARIANTS,
  lods: PANICLE_LODS,
  make: makePanicle,
  budget: [21000, 5300, 2300, 360],
  pick: (r) => Math.min(PANICLE_VARIANTS - 1, Math.floor(r * PANICLE_VARIANTS)),
  authoredSize: 1,
  poise: 'held',
  centreAlong: 0.45,
  // a bud is green and felted
  budTint: [0.72, 0.84, 0.62],
  swing: 0.12,
  translucency: 0.15,
  sheen: 0,
  detailAt: [0.9, 2.4, 5],
  detailCaps: [14, 60, 300],
};

const berries: FruitAsset = {
  key: 'hedera-helix/berries',
  variants: BERRY_COUNTS.length,
  lods: BERRY_LODS,
  make: makeBerries,
  budget: [3300, 900, 320],
  pick: (r) => Math.min(BERRY_COUNTS.length - 1, Math.floor(r * BERRY_COUNTS.length)),
  authoredSize: 1,
  poise: 'held',
  centreAlong: 0.9,
  // dull blue-black; the stalks, painted a brighter green than the berries, ripen to a purplish brown and not to black
  ripe: lin('#5a4a52'),
  ripeShade: [-0.5, 3.2],
  roughness: 0.55,
  swing: 0.1,
  detailAt: [0.8, 2.5],
  detailCaps: [30, 200],
};

const clingingRoots: AppendageAsset = {
  key: 'hedera-helix/aerial-roots',
  variants: 3,
  lods: ROOTLET_LODS,
  make: makeRootlets,
  budget: [520, 110, 64],
  pick: (r) => Math.min(2, Math.floor(r * 3)),
  // pale when new, brown and woody within a year or two
  aged: ROOTLET.old,
  agedDays: [60, 500],
  roughness: 0.95,
  swing: 0,
  detailAt: [0.6, 1.6],
  detailCaps: [120, 500],
};

/**
 * Light green shoots that turn light brown ("slender, light green but later
 * turning light brown", Virginia Tech), the bark slightly rough and finely
 * scaly, old stems shallowly ridged and furrowed. The ages are chosen: no
 * source dates the change.
 */
const wood: WoodLook = {
  young: lin('#7d8f4c'),
  mature: lin('#8d7b5a'),
  old: [0.86, 0.77, 0.64],
  woodyDays: [130, 430],
  oldDays: [900, 2600],
  furrowDays: [1000, 3600],
  furrow: 0.35,
  stiffDays: [40, 300],
  relief: 2,
  roughness: 0.9,
  grain: { streaks: 420, width: 2.4, wobble: 9 },
};

export const look: TaxonLook = {
  taxonId: 'hedera-helix',
  provisional: false,
  leaves: { default: climbingLeaf, adult: adultLeaf },
  flowers: { default: panicle },
  fruits: { default: berries },
  appendages: { aerial_roots: clingingRoots },
  wood,
};
