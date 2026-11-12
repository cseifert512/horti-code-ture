// Hedera helix (common ivy): an evergreen that clings by rootlets, in both of
// its phases.
//
//   climbing leaf  the leaf of the juvenile, climbing shoots: leathery, dark
//                  grey-green, the end lobe the largest and two or four broad
//                  shallow lobes beside it, the edge a smooth curve, a pale vein
//                  from the stalk towards the tip of each lobe and thin pale
//                  secondaries off it. The blade hangs tip down from the end of
//                  its stalk and faces outwards. Built lobe by lobe as a fan
//                  from the stalk; its proportions were measured off photographs
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
// for most). Made from descriptions and measurements; outlines, postures and
// colours checked against photographs, named where they are used.
//
// The climbing leaf carries a texture of its own (IVY_VEINS): five pale main
// veins from the top of the stalk, pale secondaries off them and a fine pale
// net over the dark blade, drawn by the kit's palmate vein generator. Its
// blade is held in the world by the viewer (climbingLeaf.hold): face out from
// what the stem clings to and tip down, whichever way the stalk points.
//
// What cannot be drawn here: the paler underside of the leaf (both faces are
// drawn alike), the purple flush of leaves in cold weather (an evergreen leaf
// is given no winter state), and the spiral of leaves round an adult shoot (the
// render data sets them to left and right).
import * as THREE from 'three';
import { characterNumber, characterRange, parseMorphology } from '@horti/core';
import morphologyJson from '../../../../../species/hedera-helix/morphology.json';
import { RNG, clamp, hash2, lerp } from '../../util.ts';
import { GROUND, MIDRIB, Merge, type PalmateVeins, type RGB, Surf, WHITE, lathe, lin, mix, palmateTexture, veinUv } from '../kit.ts';
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
 * Five leaves, their outlines measured off photographs as ratios to the end
 * lobe, from where the stalk joins to its tip (morphology.json,
 * leaf.juvenile.outline*): the end lobe much the largest; the side lobes broad
 * and shallow, their tips 0.72 to 0.84 of it at 58 to 76 degrees from it; the
 * sinus between them half to seven tenths of the way out; the basal pair small
 * or merged into a rounded shoulder; a heart-shaped notch at the stalk. Three
 * have three lobes and two have five, the basal pair small. The knots are only
 * where the outline turns: the edge between them is a smooth curve through
 * them (see `outlinePoint`), never a straight line.
 *   0  three lobes, sinuses deepish (Commons: Hedera helix 2.jpg)
 *   1  three lobes, broad side lobes (Klimopblad Hedera helix.jpg)
 *   2  five lobes, the basal pair small (20150318-stare-drzewce-park-hedera-helix.jpg, the wall)
 *   3  three lobes, shallow (Blad van klimop (Hedera helix) 02.JPG)
 *   4  five lobes, shallow (20150318-stare-drzewce-park-hedera-helix.jpg)
 * All are held tip down from the end of a long stalk, face outwards, as the
 * leaves of a wall of ivy are (habit-04, fruit-04): how far round that is
 * turned depends on the direction the data gives the leaf.
 */
const CLIMBING_LEAVES: readonly ClimbingLeaf[] = [
  { half: [tip(0, 1), sinus(44, 0.5), tip(72, 0.74), edge(128, 0.52), edge(155, 0.34), edge(180, 0.05)], hang: 70, roll: 4, yaw: 3, tipsDown: [0.04, 0.03, 0.02], seed: 11 },
  { half: [tip(0, 1), sinus(37, 0.57), tip(62, 0.8), edge(124, 0.46), edge(160, 0.18), edge(180, 0.04)], hang: 66, roll: -5, yaw: -4, tipsDown: [0.05, 0.03, 0.01], seed: 23 },
  { half: [tip(0, 1), sinus(36, 0.55), tip(64, 0.72), sinus(98, 0.42), tip(122, 0.44), edge(158, 0.2), edge(180, 0.05)], hang: 72, roll: 6, yaw: -2, tipsDown: [0.03, 0.04, 0.02], seed: 37 },
  { half: [tip(0, 1), sinus(36, 0.7), tip(60, 0.8), edge(100, 0.6), edge(145, 0.32), edge(180, 0.05)], hang: 68, roll: -3, yaw: 5, tipsDown: [0.04, 0.03, 0.02], seed: 41 },
  { half: [tip(0, 1), sinus(32, 0.66), tip(60, 0.75), sinus(92, 0.5), tip(118, 0.5), edge(152, 0.28), edge(180, 0.05)], hang: 70, roll: 2, yaw: -6, tipsDown: [0.04, 0.04, 0.02], seed: 47 },
];
/**
 * The angle below the line of its stalk at which every climbing blade is measured for the leaf's one unit (BladeHold.unitAt):
 * the middle of the hangs above, which were read off photographs. The viewer holds the blade in the world; this only keeps
 * the length in the data the reach of a leaf as it hangs.
 */
const UNIT_AT = CLIMBING_LEAVES.reduce((sum, leaf) => sum + leaf.hang, 0) / CLIMBING_LEAVES.length;
const LOBES = CLIMBING_LEAVES.map((leaf) => 2 * leaf.half.filter((k) => k.kind === 'tip').length - 1);
if (Math.min(...LOBES) !== FEWEST_LOBES || Math.max(...LOBES) !== MOST_LOBES) throw new Error(`hedera-helix: the climbing leaves are drawn with ${LOBES.join(', ')} lobes, and its morphology gives ${FEWEST_LOBES} to ${MOST_LOBES}`);

/**
 * The blade from where the stalk joins to the tip of its end lobe, as a share of the reach of the whole leaf. The
 * rounded shoulders behind the stalk add a third again, so the whole blade is about as long as the reach.
 */
const CLIMBING_BLADE = 0.7;

interface BladeDetail {
  /** Pieces each stretch of the outline is cut into, and rings from the stalk outwards. The veins are the texture's: the mesh carries only the outline and the gentle dome. */
  pieces: number;
  rings: number;
  /** Fine relief: the wave of the edge. */
  fine: boolean;
}
const BLADE_DETAIL: readonly BladeDetail[] = [
  { pieces: 5, rings: 6, fine: true },
  { pieces: 2, rings: 3, fine: false },
  // from far off: a flat fan of triangles to the curved outline
  { pieces: 2, rings: 1, fine: false },
];

/**
 * The veins of the climbing leaf, drawn into a texture of its own (the kit's `palmateTexture`; uv as LeafTexture in
 * look.ts says, the flat blade's units being the end lobe's length). Five main veins from the top of the stalk: to the
 * end lobe, to each side lobe and to each basal lobe or shoulder (morphology.json leaf.juvenile.mainVeins, and the
 * bearings and reaches of the measured outlines above); secondaries leaving them forwards at `angle`, `spacing` apart
 * (leaf.juvenile.secondaryVein*) and arching on towards the margin; a fine net between them, its cells
 * leaf.juvenile.veinNetCell across (Commons: Efeublatt 06.jpg; the vein-net photograph leaf-10). The veins are pale and
 * greyish (the palette's greenB) on the dark blade; they lie a little sunk in it, and the blade is hardly puckered.
 */
const IVY_VEINS: PalmateVeins = {
  origin: 0.3,
  span: 1.6,
  main: [
    { deg: -120, length: 0.42 },
    { deg: -64, length: 0.74 },
    { deg: 0, length: 0.95 },
    { deg: 64, length: 0.74 },
    { deg: 120, length: 0.42 },
  ],
  secondary: {
    angle: characterNumber(morphology, 'leaf.juvenile.secondaryVeinAngleDeg'),
    spacing: characterNumber(morphology, 'leaf.juvenile.secondaryVeinSpacing'),
    first: 0.08,
    reach: 0.24,
    curve: 40,
  },
  net: { cell: characterNumber(morphology, 'leaf.juvenile.veinNetCell'), jitter: 0.85 },
  width: { main: 0.02, secondary: 0.008, net: 0.0035 },
  ground: 0.74,
  pale: { main: 0.24, secondary: 0.12, net: 0.04 },
  tint: { main: 0.85, secondary: 0.6, net: 0.22 },
  relief: { vein: 0.25, pucker: 0.06 },
  seed: 5,
};
if (IVY_VEINS.main.length !== characterNumber(morphology, 'leaf.juvenile.mainVeins')) throw new Error('hedera-helix: the texture draws a different number of main veins from the morphology file');

/**
 * The leaf's own bearings of the five main veins, in the order of IVY_VEINS.main: the tips of the end and side lobes,
 * and the basal lobes or, on a three-lobed leaf, the middle of the rounded shoulder. The texture is turned on to them
 * (the kit's `veinUv`), so that each pale main vein runs to its own lobe's tip.
 */
function veinBearings(leaf: ClimbingLeaf): number[] {
  const tips = leaf.half.filter((k) => k.kind === 'tip' && k.deg > 0).map((k) => k.deg);
  const side = tips[0]!;
  const basal = tips[1] ?? (side + 180) / 2 - 2;
  return [-basal, -side, 0, side, basal];
}

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

const knotAt = (k: Knot): [number, number] => [k.r * Math.sin(k.deg * DEG), k.r * Math.cos(k.deg * DEG)];

/**
 * A point on the outline between knot `i` and knot `i + 1` of the whole ring, `f` of the way along: a cardinal spline
 * through the knots, so that the edge curves gently between them as an ivy leaf's does. A lobe's tip is kept nearly
 * pointed (its tangent shortened); a sinus and a shoulder are rounded.
 */
function outlinePoint(ring: readonly Knot[], i: number, f: number): [number, number] {
  const p = (j: number): [number, number] => {
    if (j < 0) {
      // beyond the ends of the ring: mirror the neighbour through the end knot
      const [ax, az] = knotAt(ring[0]!);
      const [bx, bz] = knotAt(ring[1]!);
      return [2 * ax - bx, 2 * az - bz];
    }
    if (j >= ring.length) {
      const [ax, az] = knotAt(ring[ring.length - 1]!);
      const [bx, bz] = knotAt(ring[ring.length - 2]!);
      return [2 * ax - bx, 2 * az - bz];
    }
    return knotAt(ring[j]!);
  };
  const tangent = (j: number): [number, number] => {
    const [ax, az] = p(j - 1);
    const [bx, bz] = p(j + 1);
    const keep = ring[j]?.kind === 'tip' ? 0.35 : 1;
    return [0.5 * keep * (bx - ax), 0.5 * keep * (bz - az)];
  };
  const [x0, z0] = p(i);
  const [x1, z1] = p(i + 1);
  const [m0x, m0z] = tangent(i);
  const [m1x, m1z] = tangent(i + 1);
  const f2 = f * f;
  const f3 = f2 * f;
  const h00 = 2 * f3 - 3 * f2 + 1;
  const h10 = f3 - 2 * f2 + f;
  const h01 = -2 * f3 + 3 * f2;
  const h11 = f3 - f2;
  return [h00 * x0 + h10 * m0x + h01 * x1 + h11 * m1x, h00 * z0 + h10 * m0z + h01 * z1 + h11 * m1z];
}

/**
 * A lobed blade lying in the XZ plane, upper side +Y, the stalk joining at the
 * origin and the tip of the end lobe at z = 1. One sheet to each lobe, fanned
 * from the stalk between the two sinuses beside it. Its veins are the leaf's
 * own texture (IVY_VEINS), laid flat over the blade.
 */
function climbingBlade(leaf: ClimbingLeaf, detail: BladeDetail): Blade {
  const rng = new RNG(leaf.seed);
  const phase = rng.range(0, TAU);
  // the whole outline, from the notch round the left side, over the end lobe and back down the right side to the notch
  const ring: Knot[] = [...leaf.half.slice(1).map((k) => ({ ...k, deg: -k.deg })).reverse(), ...leaf.half];
  const at = (k: Knot): [number, number] => [k.r * Math.sin(k.deg * DEG), k.r * Math.cos(k.deg * DEG)];

  const sb = new Surf();
  const uvs: number[] = [];
  const bearings = veinBearings(leaf);
  // a lobe runs from one sinus to the next; the notch at the stalk ends the two basal ones
  let start = 0;
  let lobe = 0;
  const tips = ring.filter((k) => k.kind === 'tip').length;
  for (let end = 1; end < ring.length; end++) {
    if (ring[end]!.kind !== 'sinus' && end !== ring.length - 1) continue;
    const knots = ring.slice(start, end + 1);
    const from = start;
    start = end;
    // 0 the end lobe, 1 the side lobes, 2 the basal ones
    const rank = Math.abs(lobe - (tips - 1) / 2);
    lobe++;

    // the rim of this lobe: each stretch between knots cut into pieces along the smooth curve of the outline
    interface Column {
      x: number;
      z: number;
      /** 1 where the lobe's main vein meets the rim, at its tip. */
      vein: 0 | 1;
    }
    const rim: Column[] = [];
    for (let k = 0; k < knots.length - 1; k++) {
      for (let s = 0; s < detail.pieces; s++) {
        const [x, z] = outlinePoint(ring, from + k, s / detail.pieces);
        rim.push({ x, z, vein: s === 0 && knots[k]!.kind === 'tip' ? 1 : 0 });
      }
    }
    const last = knots[knots.length - 1]!;
    rim.push({ x: at(last)[0], z: at(last)[1], vein: 0 });
    const veinAt = rim.findIndex((c) => c.vein === 1);
    if (veinAt <= 0 || veinAt >= rim.length - 1) throw new Error('hedera-helix: every lobe of a climbing leaf needs one tip between two sinuses');

    // the columns of the sheet: the rim
    const columns: Column[] = rim;
    const veinColumn = veinAt;
    // across the lobe: 0 on its main vein, 1 at the sinuses, by distance along the rim (for the dome between them)
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
      const x = rho * c.x;
      const z = rho * c.z;
      const r = Math.hypot(x, z);
      const across = Math.abs(us[i]! - 0.5) * 2;
      // nearly flat: a little domed, the blade swelling slightly between its veins, the lobe tips turned down.
      // Nothing here differs between two lobes along the sinus line they share, or the blade would gape there
      let y = -0.05 * r * r + 0.009 * Math.sin(Math.PI * Math.min(1, across)) * Math.pow(rho, 0.6) * (1 - 0.35 * rho) - down * rho * rho * reach * (1 - Math.min(1, across));
      if (detail.fine) y += 0.008 * Math.sin(Math.atan2(x, z) * 4.3 + phase) * rho * rho * rho;
      // the leaf's own texture, laid flat over the blade and turned on to its lobes (see IVY_VEINS)
      uvs.push(...veinUv(IVY_VEINS, x, z, bearings));
      return { p: [x, y, z] };
    });
  }
  for (let i = 0; i < uvs.length; i++) sb.uv[i] = uvs[i]!;
  const geometry = sb.build();
  smoothSeams(geometry);
  return { geometry, pale: [] };
}

/** The stalk: out along +Z from the stem, arched a little, to where the blade hangs from it. `uvAt` is where it samples the texture. */
function leafStalk(mg: Merge, length: number, lod: number, uvAt: readonly [number, number] = MIDRIB): V3 {
  const n = [4, 3, 2][lod]!;
  const points: V3[] = [];
  const radii: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    points.push(new V3(0, 0.07 * length * 4 * t * (1 - t) + 0.02 * t, length * t));
    radii.push(lerp(0.013, 0.009, t));
  }
  mg.tube(points, radii, [6, 4, 3][lod]!, WHITE, WHITE, uvAt);
  return points[n]!;
}

/**
 * A whole leaf: the stalk, and the blade hung from its end and turned as
 * `hang`, `roll` and `yaw` say. The stalk is as long as leaves one unit from
 * the stem to the farthest point of the blade, so that the length in the
 * render data is the reach of the leaf as it is held.
 *
 * A `held` blade (one whose leaf has a BladeHold, which the viewer turns in the
 * world) is laid flat out from the end of the stalk instead, turned only by
 * `roll` and `yaw`; the stalk is still as long as the hung blade would leave
 * it, so that a leaf of a given length in the data is the same size of leaf.
 */
function hangBlade(blade: Blade, scale: number, hang: number, roll: number, yaw: number, lod: number, held = false): THREE.BufferGeometry {
  const mg = new Merge(true);
  const hung = new THREE.Quaternion().setFromEuler(new THREE.Euler(hang * DEG, yaw * DEG, roll * DEG, 'YXZ'));
  const q = held ? new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw * DEG, roll * DEG, 'YXZ')) : hung;
  const position = blade.geometry.getAttribute('position');
  const p = new V3();
  let forward = 0;
  for (let i = 0; i < position.count; i++) forward = Math.max(forward, p.fromBufferAttribute(position, i).applyQuaternion(hung).z * scale);
  // a held blade carries the leaf's own texture, whose plain ground the stalk takes; the adult leaf, the shared one's midrib
  const from = leafStalk(mg, 1 - forward, lod, held ? GROUND : MIDRIB);
  const first = mg.n;
  mg.add(blade.geometry, new THREE.Matrix4().compose(from, q, new V3(scale, scale, scale)), WHITE, from, 0);
  tintBlade(mg, first, blade.pale);
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, -0.25, 0.55), 1);
  return g;
}

function makeClimbingLeaf(variant: number, lod: number): THREE.BufferGeometry {
  const leaf = CLIMBING_LEAVES[variant]!;
  return hangBlade(climbingBlade(leaf, BLADE_DETAIL[lod]!), CLIMBING_BLADE, UNIT_AT, leaf.roll, leaf.yaw, lod, true);
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
/**
 * Ovate, diamond-shaped ("ovate or rhombic", Metcalfe), and the narrower leaf that stands under the flowers ("more
 * narrowly ovate", Bean). Photographs of adult shoots show both ends of the range on one plant: broad, nearly
 * rounded-ovate leaves on stout shoots (Commons: 20151224Hedera helix1.jpg) and narrow ones with a drawn-out tip round
 * the buds (Hedera helix-Lierre-Bourgeon de Fleur-20200730.jpg), so a broad and a narrow variant are drawn too. Held
 * flatter than the climbing leaf: the blades of adult shoots stand square to the light.
 */
const ADULT_LEAVES: readonly AdultLeaf[] = [
  { halfWidth: 0.34, widest: 0.36, taper: 0.8, hang: 34, roll: 7, yaw: -5, seed: 53 },
  { halfWidth: 0.36, widest: 0.45, taper: 1, hang: 40, roll: -10, yaw: 6, seed: 59 },
  { halfWidth: 0.27, widest: 0.38, taper: 0.85, hang: 30, roll: 4, yaw: 3, seed: 61 },
  { halfWidth: 0.39, widest: 0.4, taper: 0.7, hang: 38, roll: -5, yaw: -8, seed: 67 },
  { halfWidth: 0.245, widest: 0.36, taper: 1.15, hang: 28, roll: 9, yaw: 4, seed: 71 },
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
  // the texture across the blade as it is drawn (the columns are not evenly spaced), and only its strip below the first side
  // vein along it: its side veins read as dark grooves, while the adult leaf shows little but a pale midrib (Commons: Hedera
  // helix-Lierre-Bourgeon de Fleur-20200730.jpg; Hedera helix 002.JPG)
  for (let j = 0; j <= detail.along; j++) {
    for (let i = 0; i <= nu; i++) {
      const at = 2 * (j * (nu + 1) + i);
      sb.uv[at] = detail.across[i]!;
      sb.uv[at + 1] = 0.006;
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
/**
 * Half the width of the end umbel, to the tips of its flowers: umbels are 3-5 cm across, and the end one is the largest
 * of a panicle. A quarter of the way up the range: in photographs the umbels are tight balls nearer 3 cm than 5
 * (Commons: Gemeiner Efeu (Bahnhofstrasse, Neuendettelsau) 20250911 143302.jpg).
 */
const UMBEL = lerp(...characterRange(morphology, 'inflorescence.umbelDiameterM'), 0.25) / 2 / PANICLE_M;
/** Half the width of the top of the ovary, round the disc, in units of the model: read from photographs (morphology.json). */
const TOP = characterNumber(morphology, 'flower.ovaryTopDiameterM') / 2 / PANICLE_M;
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
    lathe(sb, [3, 2], (v) => [[0.3 * DISC, TOP, 0.2 * DISC][Math.round(v * 2)]!, [0, OVARY, OVARY + 0.6 * DISC][Math.round(v * 2)]!], (_u, v) => mix(FLOWER.ovary, FLOWER.disc, v));
    return sb.build();
  }
  const around = lod === 0 ? 8 : 5;
  // the ovary: a top-shaped cup widening from the stalk to the rim
  lathe(sb, [around, lod === 0 ? 2 : 1], (v) => [lerp(0.3 * DISC, TOP, Math.pow(v, 0.7)), OVARY * v], (_u, v) => mix(FLOWER.ovary, FLOWER.discRim, v * 0.6));
  // the disc: a low dome over the top of the ovary, and the style standing from its middle
  lathe(sb, [around, 2], (v) => [TOP * Math.cos((Math.PI / 2) * v * 0.86), OVARY + 0.6 * DISC * Math.sin((Math.PI / 2) * v)], (u, v) => mix(FLOWER.discRim, FLOWER.disc, Math.min(1, v * 1.6 + 0.15 * Math.sin(u * TAU * 5))));
  if (lod === 0) lathe(sb, [3, 1], (v) => [0.2 * DISC * (1 - 0.6 * v), OVARY + 0.55 * DISC + STYLE * v], () => FLOWER.style);
  return sb.build();
}

/** What opens and falls: five petals from the rim of the ovary, spread flat and then bent back, and five stamens between them. */
function flowerCorolla(lod: number): THREE.BufferGeometry {
  const sb = new Surf();
  const rim = 0.96 * TOP;
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
    // spreading well out, as they bristle from a ball of flowers in photographs (Commons: Hedera helix 002.JPG)
    const lean = 66 * DEG;
    const dir = out.clone().multiplyScalar(Math.sin(lean)).add(new V3(0, Math.cos(lean), 0));
    const from = out.clone().multiplyScalar(0.8 * TOP).add(new V3(0, OVARY + 0.15 * DISC, 0));
    const length = 1.05 * PETAL;
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
      // mostly the green of the stalks and ovaries seen between the flowers, with the yellow-green of the petals and a little of the anthers' yellow
      mg.add(ball(head.radius, 6, 3, (u, v) => mix(mix(FLOWER.stalk, FLOWER.petal, 0.55), FLOWER.anther, 0.25 * hash2(h + 9, Math.round(u * 6) + 7 * Math.round(v * 3)))), m, WHITE, head.centre, head.order);
      return;
    }
    // globose: stalks in every direction but back down the stalk of the umbel
    rays(head.axis, head.flowers, 160 * DEG, 31 * variant + h).forEach((dir, i) => {
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
  berry: lin('#4a7434'),
  berryShade: lin('#3d6230'),
  crown: lin('#6a7a3c'),
  style: lin('#8a8f50'),
  stalk: lin('#7a9a4c'),
};

function berry(lod: number): THREE.BufferGeometry {
  const sb = new Surf();
  const [around, along] = ([[10, 6], [5, 2], [4, 2]] as const)[lod]!;
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
  // the stalk of the umbel, a little over half as long as the cluster is wide (Commons: 2026-04-11 Hedera helix im NSG
  // Jockgrimer Tongruben, a ripe umbel close on its shoot)
  const centre = lean.clone().multiplyScalar(0.6);
  mg.tube([new V3(), centre.clone().multiplyScalar(0.5), centre], [0.038, 0.032, 0.028], [6, 4, 3][lod]!, FRUIT.stalk, FRUIT.stalk);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new V3(1, 1, 1);
  rays(lean, count, 150 * DEG, 400 + variant).forEach((dir, i) => {
    // each berry at the end of the stalk its flower stood on: the cluster is half a unit from its middle to its outside
    const stalk = (0.5 - 2 * BERRY) * (0.9 + 0.16 * hash2(variant + 40, i));
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
  g.boundingSphere = new THREE.Sphere(new V3(0, 0.5, 0), 0.8);
  return g;
}

// ---------------------------------------------------------------------------
// The hold: a cluster of rootlets on the side of the stem that lies on the
// timber. The render data gives the way into the surface as +Z; the cluster
// lies on that surface, in the XY plane, spreading from under the stem. Which
// way the stem runs across that plane is not told to a model, so the two rows
// a real cluster stands in cannot be laid along the stem with certainty: they
// are laid across the model's +Y and fanned wide (see makeRootlets).
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
    // a dense brush, not a star (Commons: 2022HederaHelix1.jpg, Efeu mit Adventivwurzeln.jpg): two rows leaving the
    // stem to either side along a stretch of it, most roots short and a few long. Which way the stem runs is not told
    // to the model; the rows are laid across +Y, which is along a stem that climbs a post and across one that runs
    // along a lath, so they fan out enough to read as a brush either way
    const side = i % 2 === 0 ? 1 : -1;
    const a = (side > 0 ? 0 : Math.PI) + (hash2(seed, i) - 0.5) * 1.5;
    const fromX = side * 0.05 * hash2(seed + 4, i);
    const fromY = (hash2(seed + 7, i) - 0.5) * 0.55;
    // unbranched, of unequal length, a little crooked, pressed to the surface: off it only where it leaves the stem
    // the first two are as long as the data's length, which is the longest a root is drawn
    const h = i < 2 ? 1 : hash2(seed + 1, i);
    const length = 0.22 + 0.78 * h * h;
    const bend = (hash2(seed + 2, i) - 0.5) * 1.1;
    const at = (t: number): V3 => {
      const b = a + bend * t;
      return new V3(fromX + Math.cos(b) * length * t, fromY + Math.sin(b) * length * t, -0.1 * (1 - t) * (1 - t) - 0.025);
    };
    // fine: a rootlet is a fraction of a millimetre across
    const thick = (lod === 2 ? 0.06 : lod === 1 ? 0.035 : 0.026) * (0.8 + 0.4 * hash2(seed + 3, i));
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
  budget: [800, 180, 60],
  // three lobes for most, as on the wall in the photographs; five for the rest
  pick: (_lengthM, r) => (r < 0.3 ? 0 : r < 0.55 ? 1 : r < 0.7 ? 2 : r < 0.87 ? 3 : 4),
  // dark, grey-green and shining, the veins a greyish pale green (greenB is what a vein is drawn towards); evergreen, so
  // it has no autumn colours of its own. Less saturated and greyer than before, as mature leaves are in shade and in sun
  // (Commons: 20150318-stare-drzewce-park-hedera-helix.jpg; 2026-04-11 Hedera helix im NSG Jockgrimer Tongruben;
  // Hedera helix 2.jpg)
  palette: { greenA: lin('#283d26'), greenB: lin('#aab59a'), young: lin('#8aa43a'), autumnA: lin('#283d26'), autumnB: lin('#aab59a') },
  roughness: 0.2,
  // leathery: little light comes through
  translucency: 0.2,
  detailReach: 0.75,
  texture: palmateTexture(IVY_VEINS, 512, 0.8),
  // on a wall the blades hang tip down and face out, overlapping like tiles, whichever way their shoot runs (habit-04,
  // fruit-04; morphology.json leaf.juvenile.posture); a shoot out in the air holds its leaves flatter to the sky
  hold: {
    unitAt: UNIT_AT,
    rise: characterRange(morphology, 'leaf.juvenile.faceRiseDeg'),
    riseOpen: characterRange(morphology, 'leaf.juvenile.faceRiseOpenDeg'),
    turn: characterNumber(morphology, 'leaf.juvenile.bladeTurnDeg'),
  },
};

const adultLeaf: LeafAsset = {
  key: 'hedera-helix/adult-leaf',
  variants: ADULT_LEAVES.length,
  lods: ADULT_DETAIL.length,
  make: makeAdultLeaf,
  budget: [260, 100, 40],
  pick: (_lengthM, r) => (r < 0.3 ? 0 : r < 0.55 ? 1 : r < 0.72 ? 2 : r < 0.88 ? 3 : 4),
  // a little lighter and plainer than the climbing leaf, its veins less marked; very glossy (Commons: Hedera helix 002.JPG)
  palette: { greenA: lin('#2b4c19'), greenB: lin('#8fa468'), young: lin('#8fa83e'), autumnA: lin('#2b4c19'), autumnB: lin('#8fa468') },
  roughness: 0.2,
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
  // a bud is a tight knob felted grey-white with star-shaped hairs (Commons: Hedera helix-Lierre-Bourgeon de
  // Fleur-20200730.jpg): kept pale, since a tint can only darken the flowers' own colours, not whiten them
  budTint: [0.95, 0.97, 0.86],
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
  budget: [3950, 1000, 420],
  pick: (r) => Math.min(BERRY_COUNTS.length - 1, Math.floor(r * BERRY_COUNTS.length)),
  authoredSize: 1,
  poise: 'held',
  centreAlong: 0.6,
  // dull blue-black; the stalks, painted a brighter green than the berries, ripen to a purplish brown and not to black
  ripe: lin('#4c3f58'),
  ripeShade: [-0.3, 3.0],
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
  // cream when new, brown and withered within a few years (Commons: 2022HederaHelix1.jpg and 2022HederaHelix2.jpg)
  aged: ROOTLET.old,
  agedDays: [200, 1000],
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
