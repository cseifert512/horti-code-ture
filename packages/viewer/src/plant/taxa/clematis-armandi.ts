// Clematis armandi (Armand clematis): an evergreen climber that holds on by
// the stalks of its leaflets and flowers in March and April from the leaf
// axils of last summer's shoots.
//
//   leaf     three long leathery leaflets, lance-shaped to ovate with a rounded
//            base and a drawn-out point, each with three strong veins from the
//            base. The stalk stands out from the stem and the leaflets hang.
//            One unit is the reach of the whole leaf along +Z; upper side +Y.
//   flowers  one instance is what one node bears: a cluster in each of its two
//            leaf axils. Each cluster is two or three stalks rising from a cup
//            of bud scales, each stalk with a pair of narrow bracts and mostly
//            three flowers. A flower is a flat star of four to seven narrow
//            white sepals round a boss of cream stamens; sepals and stamens come
//            and go with the flower, and the tuft of styles in its middle stays.
//            In metres; the size the data gives is the width across both
//            clusters.
//   fruit    the seed heads of one node: tufts of achenes with feathered tails,
//            on the stalks the flowers stood on. In metres.
//   hold     the stalk of a leaflet wound round a cable, drawn at the node
//   wood     bronze-red young shoots; grey-brown stringy bark with age
//
// Every count and size of the real plant is read from
// species/clematis-armandi/morphology.json, where each has its source. What is
// decided here is appearance: curvature, colour, how a level of detail is
// simplified. These shapes are this clematis's alone.
import * as THREE from 'three';
import { characterNumber, characterRange, parseMorphology } from '@horti/core';
import morphologyJson from '../../../../../species/clematis-armandi/morphology.json';
import { RNG, clamp, lerp, smoothstep } from '../../util.ts';
import { Merge, type RGB, Surf, WHITE, across, lin, mix } from '../kit.ts';
import type { AppendageAsset, FlowerAsset, FruitAsset, LeafAsset, TaxonLook, WoodLook } from '../look.ts';

const morphology = parseMorphology(morphologyJson, 'species/clematis-armandi/morphology.json');
const mid = ([a, b]: [number, number]): number => (a + b) / 2;

const V3 = THREE.Vector3;
type V3 = THREE.Vector3;
const TAU = Math.PI * 2;
const IDENTITY = new THREE.Matrix4();
const AXIS = -1;

/** Raw triangles with a colour at each corner: for the small flat parts a parametric sheet is too much for. */
class Raw {
  pos: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  n = 0;
  vert(p: V3, c: Readonly<RGB>): number {
    this.pos.push(p.x, p.y, p.z);
    this.col.push(c[0], c[1], c[2]);
    return this.n++;
  }
  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }
  /** A flat triangle with its own three corners. */
  flat(a: V3, b: V3, c: V3, ca: Readonly<RGB>, cb: Readonly<RGB>, cc: Readonly<RGB>): void {
    this.tri(this.vert(a, ca), this.vert(b, cb), this.vert(c, cc));
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array<number>(this.n * 2).fill(0), 2));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return g;
  }
}

/** A unit vector at `tilt` from `axis`, turned `turn` round it. */
function cone(axis: V3, tilt: number, turn: number): V3 {
  const [a, b] = across(axis);
  return axis
    .clone()
    .multiplyScalar(Math.cos(tilt))
    .addScaledVector(a, Math.sin(tilt) * Math.cos(turn))
    .addScaledVector(b, Math.sin(tilt) * Math.sin(turn))
    .normalize();
}

/** A matrix that carries +X on to `x`, +Y on to `y` and +Z on to `z`, scaled by `s` and placed at `at`. */
function frame(x: V3, y: V3, z: V3, at: V3, s: number): THREE.Matrix4 {
  return new THREE.Matrix4().makeBasis(x, y, z).scale(new V3(s, s, s)).setPosition(at);
}

// ---------------------------------------------------------------------------
// Leaf
// ---------------------------------------------------------------------------
/** "Leaves composed of three leaflets" (Bean). */
const LEAFLETS = characterNumber(morphology, 'leaf.leafletCount');
/** The main stalk, the stalk of a leaflet and the leaflet itself, as the floras measure them (m). */
const LEAF_STALK = mid(characterRange(morphology, 'leaf.stalkLengthM'));
const LEAFLET_STALK = mid(characterRange(morphology, 'leaf.leafletStalkLengthM'));
const LEAFLET_LENGTH = mid(characterRange(morphology, 'leaf.leafletLengthM'));
const LEAFLET_WIDTH = mid(characterRange(morphology, 'leaf.leafletWidthM'));
/** "prominently three-veined" (Bean): the midrib and one vein on each side of it, all from the base. */
const MAIN_VEINS = characterNumber(morphology, 'leaf.mainVeinCount');
const SIDE_VEINS = (MAIN_VEINS - 1) / 2;

/** The parts of a leaf as shares of its length along stalk, leaflet stalk and end leaflet. */
const LEAF_PATH = LEAF_STALK + LEAFLET_STALK + LEAFLET_LENGTH;
const STALK_SHARE = LEAF_STALK / LEAF_PATH;
const LEAFLET_STALK_SHARE = LEAFLET_STALK / LEAF_PATH;
const LEAFLET_SHARE = LEAFLET_LENGTH / LEAF_PATH;
/**
 * Width of a leaflet for its length, measured off photographs: narrow on some plants and shoots, broad on others.
 * Inside what the flora's sizes allow (LEAFLET_WIDTH / LEAFLET_LENGTH at their middles).
 */
const LEAFLET_RATIO = characterRange(morphology, 'leaf.leafletWidthToLength');
void LEAFLET_WIDTH;

const LEAF_VARIANTS = 4;
const LEAF_LODS = 3;
/** Where a side vein runs, as a share of the half width. Appearance: no flora gives it. */
const VEIN_AT = 0.56;
/** A column of points down a leaflet: where it is across the half blade (0 the midrib, 1 the margin), how far from the texture's midrib it samples, and which vein it is (0 none, 1 the midrib, 2 a side vein). */
type Column = readonly [at: number, off: number, vein: 0 | 1 | 2];
/**
 * The columns of half a leaflet at each level of detail. The shared leaf
 * texture has one pale midrib; a leaflet with several veins from the base
 * samples it once for each, by running its texture coordinate out from the
 * midrib and back on to it at every vein. The coordinate along the blade is
 * held at the foot of the texture, below its feather veins, which this leaf
 * does not have.
 */
function halfColumns(lod: number): Column[] {
  const out: Column[] = [[0, 0, 1]];
  if (lod === 2) return [...out, [1, MARGIN_OFF, 0]];
  let last = 0;
  for (let k = 1; k <= SIDE_VEINS; k++) {
    const at = (VEIN_AT * k) / SIDE_VEINS;
    // close beside each vein at the finest level, so that the vein is a fine line in a fine channel
    if (lod === 0) out.push([last + VEIN_HALF, last === 0 ? 0.04 : 0.06, 0], [(last + at) / 2 + 0.02, 0.14, 0], [at - VEIN_HALF, 0.06, 0], [at, 0, 2]);
    else out.push([(last + at) / 2, 0.14, 0], [at, 0, 2]);
    last = at;
  }
  if (lod === 0) out.push([last + VEIN_HALF, 0.06, 0], [0.82, 0.22, 0]);
  return [...out, [1, MARGIN_OFF, 0]];
}
/** Half the width of the channel a vein lies in, as a share of the half width; and how far the margin samples from the texture's midrib. */
const VEIN_HALF = 0.07;
const MARGIN_OFF = 0.3;
const LEAFLET_ROWS = [16, 7, 4] as const;
const TEXTURE_FOOT = 0.002;
/** Where the stalks sample the texture: off the pale midrib, so that they are no paler than the blade. */
const STALK_UV: [number, number] = [0.16, TEXTURE_FOOT];

interface LeafletForm {
  /** Half width for length. */
  half: number;
  /** Where along the blade it is widest. */
  widest: number;
  /** How far the base runs back past the stalk on each side: 0 rounded, more for a heart-shaped base. */
  cord: number;
  /** How far the two halves fold up from the midrib. */
  fold: number;
  /** How far the blade curves down from base to tip, radians. */
  bend: number;
  /** Twist along the blade, radians. */
  twist: number;
  seed: number;
}

/** One leaflet: base at the origin, along +Z, upper side +Y, one unit long along its own curve. */
function leafletGeometry(form: LeafletForm, lod: number): THREE.BufferGeometry {
  const half = halfColumns(lod);
  // both sides: the columns of one half mirrored about the midrib
  const columns: Column[] = [...half.slice(1).map(([at, off, vein]): Column => [-at, off, vein]).reverse(), ...half];
  const nu = columns.length - 1;
  const nv = LEAFLET_ROWS[lod]!;
  // the outline: widest near the base, the base rounded, the tip drawn out
  // rounded into the base, the sides long and nearly parallel, then drawn in to a fine point: the edge comes in
  // concave towards the tip ("apex acuminate to attenuate", Huang et al. 2024)
  const outline = (v: number): number => {
    if (v <= form.widest) return Math.pow(Math.sin((Math.PI / 2) * (v / form.widest)), 0.55);
    const t = (v - form.widest) / (1 - form.widest);
    return Math.pow(Math.max(0, 1 - Math.pow(t, 1.45)), 1.6);
  };
  let most = 0;
  for (let i = 1; i < 64; i++) most = Math.max(most, outline(i / 64));
  // the line of the midrib, curving down towards the tip
  const STEPS = 64;
  const line: { y: number; z: number; pitch: number }[] = [{ y: 0, z: 0, pitch: 0 }];
  for (let i = 1; i <= STEPS; i++) {
    const pitch = form.bend * Math.pow((i - 0.5) / STEPS, 1.3);
    const last = line[i - 1]!;
    line.push({ y: last.y - Math.sin(pitch) / STEPS, z: last.z + Math.cos(pitch) / STEPS, pitch: form.bend * Math.pow(i / STEPS, 1.3) });
  }
  const along = (v: number) => {
    const x = clamp(v, 0, 1) * STEPS;
    const i = Math.min(STEPS - 1, Math.floor(x));
    const t = x - i;
    const a = line[i]!;
    const b = line[i + 1]!;
    return { y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t), pitch: lerp(a.pitch, b.pitch, t) };
  };
  const sb = new Surf();
  sb.surf(nu, nv, (u01, v01) => {
    const [s, , vein] = columns[Math.round(u01 * nu)]!;
    // rows are closer together at the base, where the outline turns fastest
    const v = Math.pow(v01, 1.25);
    const c = along(v);
    const rel = outline(v) / most;
    const x = s * form.half * rel;
    let lift = form.fold * Math.abs(x) - 0.25 * form.half * Math.pow(Math.abs(s), 3) * rel;
    if (lod === 0) {
      // the main veins lie in channels, and the margin is a little waved
      if (vein) lift -= (vein === 1 ? 0.0006 : 0.0004) * Math.sqrt(1 - v) * rel;
      lift += 0.006 * Math.sin(v * 11 + form.seed + s * 1.3) * s * s * rel;
    }
    const back = form.cord * Math.pow(Math.abs(s), 1.5) * (1 - smoothstep(0, 0.14, v));
    const twist = form.twist * v;
    const ty = -Math.sin(c.pitch);
    const tz = Math.cos(c.pitch);
    // across the blade and out of its face, turned by the twist about the midrib
    const ax = Math.cos(twist);
    const an = Math.sin(twist);
    const px = x * ax - lift * an;
    const off = x * an + lift * ax;
    return { p: [px, c.y + off * tz - back * ty, c.z + off * -ty - back * tz] };
  });
  // lay the texture so that its midrib falls on each main vein
  for (let j = 0; j <= nv; j++) {
    const v = Math.pow(j / nv, 1.25);
    for (let i = 0; i <= nu; i++) {
      const [s, off, vein] = columns[i]!;
      // a side vein fades out short of the tip
      const o = vein === 2 ? 0.14 * smoothstep(0.72, 0.92, v) : off;
      const at = 2 * (j * (nu + 1) + i);
      sb.uv[at] = 0.5 + (s < 0 ? -o : o);
      sb.uv[at + 1] = TEXTURE_FOOT;
    }
  }
  return sb.build();
}

/** Points along a stalk that leaves `from` heading `pitch0` above +Z and `yaw0` towards +X, and turns to `pitch1`, `yaw1` by its end. */
function stalkLine(from: V3, length: number, pitch0: number, pitch1: number, yaw0: number, yaw1: number, n: number): { points: V3[]; pitch: number; yaw: number } {
  const points = [from.clone()];
  const p = from.clone();
  for (let i = 1; i <= n; i++) {
    const t = (i - 0.5) / n;
    const pitch = lerp(pitch0, pitch1, t);
    const yaw = lerp(yaw0, yaw1, t);
    p.add(new V3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(length / n));
    points.push(p.clone());
  }
  return { points, pitch: pitch1, yaw: yaw1 };
}

const leafletCache = new Map<string, THREE.BufferGeometry>();

function makeLeafGeometry(variant: number, lod: number): THREE.BufferGeometry {
  const rng = new RNG(4100 + variant * 37);
  const mg = new Merge(true);
  const sides = [6, 4, 3][lod]!;
  // the main stalk stands out from the stem, a little up, and bows over towards its end
  const main = stalkLine(new V3(0, 0, 0), STALK_SHARE, rng.range(0.1, 0.3), rng.range(-0.45, -0.15), 0, rng.range(-0.18, 0.18), [8, 3, 2][lod]!);
  const thick = 0.0065;
  mg.tube(
    main.points,
    main.points.map((_, i) => thick * (i === 0 ? 1.5 : 1.15 - 0.3 * (i / (main.points.length - 1)))),
    sides,
    WHITE,
    WHITE,
    STALK_UV,
  );
  const end = main.points[main.points.length - 1]!;
  // the end leaflet first, then one to each side; any more than three stand in pairs lower down the stalk
  for (let k = 0; k < LEAFLETS; k++) {
    const side = k === 0 ? 0 : k % 2 ? 1 : -1;
    const from = k < 3 ? end : main.points[Math.max(1, main.points.length - 2)]!;
    // its own stalk, bent and twisted as it goes ("twisted", Bean)
    const yaw = main.yaw + (side === 0 ? rng.range(-0.15, 0.15) : side * rng.range(0.7, 1.05));
    // the leaflets hang nearly plumb from the end of the stalk, a curtain of narrow blades (Commons photographs:
    // Clematis armandii Badefols-sur-Dordogne.jpg, Clematis armandii RJB.jpg, Ranunculales - Clematis armandii 3.jpg)
    const droop = side === 0 ? rng.range(1.0, 1.25) : rng.range(0.9, 1.2);
    const own = stalkLine(from, LEAFLET_STALK_SHARE * (side === 0 ? 1.45 : 1), main.pitch - 0.1, -droop, yaw - side * 0.25, yaw + rng.range(-0.12, 0.12), [4, 2, 1][lod]!);
    mg.tube(
      own.points,
      own.points.map(() => thick * 0.7),
      Math.max(3, sides - 1),
      WHITE,
      WHITE,
      STALK_UV,
    );
    const base = own.points[own.points.length - 1]!;
    // lance-shaped to ovate; the base rounded, heart-shaped or wedge-shaped
    // narrow lance-shaped on one leaf, broader and ovate on another, as the photographs show from plant to plant
    const ratio = lerp(LEAFLET_RATIO[0], LEAFLET_RATIO[1], ((variant + 0.5) / LEAF_VARIANTS) * 0.8 + rng.range(0, 0.2));
    const form: LeafletForm = {
      half: ratio / 2,
      widest: rng.range(0.26, 0.36),
      cord: rng.pick([0, 0.012, 0.03]),
      fold: rng.range(0.05, 0.18),
      bend: rng.range(0.08, 0.3),
      twist: rng.range(-0.25, 0.25),
      seed: variant * 10 + k,
    };
    const key = `${lod}:${variant}:${k}`;
    let geometry = leafletCache.get(key);
    if (!geometry) leafletCache.set(key, (geometry = leafletGeometry(form, lod)));
    // it hangs from its stalk: its upper face out and up, turned a little about its own length
    const q = new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), own.yaw);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new V3(1, 0, 0), droop + rng.range(0, 0.2)));
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new V3(0, 0, 1), rng.range(-0.3, 0.3) - side * 0.2));
    const size = LEAFLET_SHARE * (side === 0 ? 1 : rng.range(0.82, 0.95)) * rng.range(0.95, 1.05);
    mg.add(geometry, new THREE.Matrix4().compose(base, q, new V3(size, size, size)), WHITE, base, rng.f());
  }
  // one unit is the reach of the leaf along +Z, from the stem to its farthest point
  let reach = 0;
  for (let i = 2; i < mg.pos.length; i += 3) reach = Math.max(reach, mg.pos[i]!);
  for (let i = 0; i < mg.pos.length; i++) mg.pos[i] = mg.pos[i]! / reach;
  for (let i = 0; i < mg.part.length; i += 4) for (let k = 0; k < 3; k++) mg.part[i + k] = mg.part[i + k]! / reach;
  const g = mg.build();
  // the reach as a share of the leaf laid out end to end (stalk, leaflet stalk, end leaflet): what organs.leafLengthM is set from
  g.userData.reachOfPath = reach;
  g.boundingSphere = new THREE.Sphere(new V3(0, -0.2, 0.5), 0.95);
  return g;
}

// ---------------------------------------------------------------------------
// Flowers: the two clusters of one node
// ---------------------------------------------------------------------------
/** The width across both clusters of a node (m): what the growth model's organs.racemeLengthM measures. */
const NODE_SPAN = mid(characterRange(morphology, 'inflorescence.spanM'));
const FLOWER_WIDTH = mid(characterRange(morphology, 'flower.diameterM'));
/** "about 1 in. long, 1/3 in. wide" (Bean). */
const SEPAL_LENGTH = characterNumber(morphology, 'flower.sepalLengthM');
const SEPAL_WIDTH = characterNumber(morphology, 'flower.sepalWidthM');
const SEPALS = characterRange(morphology, 'flower.sepalCount');
const SEPALS_USUAL = characterRange(morphology, 'flower.sepalCountUsual');
const STAMENS = characterNumber(morphology, 'flower.stamenCount');
const STAMEN_LENGTH = characterRange(morphology, 'flower.stamenLengthM');
const ANTHER_LENGTH = mid(characterRange(morphology, 'flower.antherLengthM'));
const STYLE_LENGTH = mid(characterRange(morphology, 'flower.styleLengthM'));
const FLOWER_STALK = characterRange(morphology, 'flower.stalkLengthM');
const CLUSTER_STALK = characterRange(morphology, 'inflorescence.stalkLengthM');
const STALKS_PER_AXIL = characterRange(morphology, 'inflorescence.stalksPerAxil');
/** "mostly three on a stalk" (Bean). */
const FLOWERS_PER_STALK = characterNumber(morphology, 'inflorescence.flowersPerStalk');
const BRACT_LENGTH = characterRange(morphology, 'inflorescence.bractLengthM');
const BUD_SCALE_LENGTH = characterRange(morphology, 'inflorescence.budScaleLengthM');

const FLOWER_VARIANTS = 4;
const FLOWER_LODS = 3;

const WHITE_SEPAL = lin('#fffae8');
const CREAM_SEPAL = lin('#f7edc8');
const SEPAL_BASE = lin('#e7e5aa');
// the boss is greenish cream, the styles in its middle green-yellow (Commons: Clematis armandii (1).jpg, (MHNT) Clematis armandii - flower.jpg)
const FILAMENT = lin('#e6ecc8');
const ANTHER = lin('#e8e0a0');
const STYLE_GREEN = lin('#c2d47e');
// the flower stalks are red to maroon (Commons: Clematis armandii (2).jpg, Clematis armandii01-4035~2015 03 22.JPG,
// Clematis armandii - Flickr - peganum.jpg; Curtis's Botanical Magazine t. 8587 paints them so)
const STALK_GREEN = lin('#8e3b36');
const STALK_PALE = lin('#a8574a');
const STALK_BRONZE = lin('#6e3a2e');
const SCALE_BROWN = lin('#6e5a3c');
const SCALE_PALE = lin('#a08a5e');

interface NodeFlower {
  /** Where the flower sits and the way it faces. */
  at: V3;
  axis: V3;
  /** When it opens, 0 the first of the node and 1 the last. */
  opens: number;
  sepals: number;
  seed: number;
  /** Its own stalk, from the fork to the flower. */
  stalk: V3[];
}
interface NodeLayout {
  flowers: NodeFlower[];
  /** The stalk of each group of flowers, from the axil to its fork. */
  stalks: V3[][];
  /** Where each bract stands and the way it points. */
  bracts: { at: V3; along: V3; length: number }[];
  /** The bud scales that cup the foot of each cluster. */
  scales: { at: V3; along: V3; length: number }[];
}

/** A bowed line from `a` to `b`, lifted towards `towards` at its middle. */
function bow(a: V3, b: V3, towards: V3, lift: number, n: number): V3[] {
  const out: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(a.clone().lerp(b, t).addScaledVector(towards, lift * Math.sin(Math.PI * t)));
  }
  return out;
}

/**
 * Where everything of one node stands. The model's +Y is the way the node
 * faces, out from its support; +Z is the side turned to the sky; the two leaf
 * axils are to either side, along X.
 */
function nodeLayout(variant: number): NodeLayout {
  const rng = new RNG(7300 + variant * 53);
  const out: NodeLayout = { flowers: [], stalks: [], bracts: [], scales: [] };
  const light = new V3(0, 0.74, 0.67).normalize();
  let seed = 0;
  for (const side of [-1, 1]) {
    const foot = new V3(side * 0.003, 0.002, 0);
    const axil = new V3(side * rng.range(0.62, 0.8), 0.7, rng.range(0.2, 0.4)).normalize();
    const stalks = rng.int(STALKS_PER_AXIL[0], STALKS_PER_AXIL[1]);
    for (let k = 0; k < 3; k++) {
      const along = cone(axil, rng.range(0.5, 0.9), (k / 3) * TAU + rng.range(0, 1));
      out.scales.push({ at: foot.clone(), along, length: lerp(BUD_SCALE_LENGTH[0], BUD_SCALE_LENGTH[1], rng.range(0, 0.4)) });
    }
    const turn0 = rng.range(0, TAU);
    for (let i = 0; i < stalks; i++) {
      // the stalks of a cluster spread from the axil; each is well within the 0.4 to 8 cm the flora gives
      const dir = cone(axil, stalks === 1 ? 0.1 : rng.range(0.3, 0.6), turn0 + (i / stalks) * TAU + rng.range(-0.3, 0.3));
      const length = lerp(CLUSTER_STALK[0], CLUSTER_STALK[1], rng.range(0.1, 0.36));
      const fork = foot.clone().addScaledVector(dir, length);
      out.stalks.push(bow(foot, fork, light, length * 0.08, 4));
      // mostly three flowers to a stalk, now and then one
      const count = rng.chance(0.82) ? FLOWERS_PER_STALK : 1;
      const order = rng.f();
      const turn = rng.range(0, TAU);
      for (let j = 0; j < count; j++) {
        // the middle flower carries on the line of the stalk, the others stand out to either side of it
        const heading = j === 0 ? cone(dir, rng.range(0, 0.15), rng.range(0, TAU)) : cone(dir, rng.range(0.55, 0.85), turn + (j - 1) * Math.PI + rng.range(-0.35, 0.35));
        const reach = lerp(FLOWER_STALK[0], FLOWER_STALK[1], j === 0 ? rng.range(0.2, 0.45) : rng.range(0.1, 0.35));
        const at = fork.clone().addScaledVector(heading, reach).addScaledVector(light, reach * 0.12);
        const stalk = bow(fork, at, light, reach * 0.1, 4);
        // a flower turns its face to the light
        const axis = heading.clone().multiplyScalar(0.4).addScaledVector(light, 0.6).normalize();
        // five or six sepals as a rule, four or seven now and then
        const r = rng.f();
        const sepals = clamp(r < 0.1 ? SEPALS[0] : r < 0.55 ? SEPALS_USUAL[0] : r < 0.95 ? SEPALS_USUAL[1] : SEPALS[1], SEPALS[0], SEPALS[1]);
        out.flowers.push({ at, axis, opens: clamp(0.1 + 0.5 * order + (j === 0 ? 0 : 0.3) + rng.range(-0.06, 0.06), 0, 1), sepals, seed: seed++, stalk });
        if (j > 0) out.bracts.push({ at: fork.clone(), along: cone(heading, 0.5, rng.range(0, TAU)), length: rng.range(BRACT_LENGTH[0], BRACT_LENGTH[1] * 0.75) });
      }
      if (count === 1) for (const s of [0, 1]) out.bracts.push({ at: foot.clone().lerp(fork, 0.6), along: cone(dir, 0.7, turn + s * Math.PI), length: rng.range(BRACT_LENGTH[0], BRACT_LENGTH[1] * 0.75) });
    }
  }
  return out;
}

const layouts = new Map<number, NodeLayout>();
function layoutOf(variant: number): NodeLayout {
  let layout = layouts.get(variant);
  if (!layout) layouts.set(variant, (layout = nodeLayout(variant)));
  return layout;
}

const SEPAL_SEGS: [number, number][] = [
  [5, 7],
  [2, 3],
  [1, 1],
];

/**
 * One sepal: from the middle of the flower along +X, its face +Y. Narrow
 * oblong, broadest beyond the middle, the tip rounded ("narrowly oblong,
 * obovate-oblong, or oblong", Huang et al. 2024). In metres.
 */
function sepalGeometry(shape: number, lod: number): THREE.BufferGeometry {
  const start = (FLOWER_WIDTH / 2 - SEPAL_LENGTH) * 0.9;
  const length = FLOWER_WIDTH / 2 - start;
  const rng = new RNG(8800 + shape * 7);
  const broad = rng.range(1, 1.16);
  const wave = rng.range(0, TAU);
  const curl = rng.range(-0.04, 0.1);
  const outline = (v: number): number => Math.min(1, 0.46 + 1.05 * v) * (v > 0.72 ? Math.sqrt(Math.max(0, 1 - ((v - 0.72) / 0.28) ** 2)) : 1);
  if (lod === 2) {
    // a kite: enough to read as a white star from across a garden, and drawn a little broad so that the mass of white holds
    const raw = new Raw();
    const w = (SEPAL_WIDTH / 2) * 1.6;
    const a = raw.vert(new V3(start, 0, 0), SEPAL_BASE);
    const b = raw.vert(new V3(start + length * 0.62, 0.0015, w), WHITE_SEPAL);
    const c = raw.vert(new V3(start + length, 0.0005, 0), WHITE_SEPAL);
    const d = raw.vert(new V3(start + length * 0.62, 0.0015, -w), WHITE_SEPAL);
    raw.tri(a, b, c);
    raw.tri(a, c, d);
    return raw.build();
  }
  const [nu, nv] = SEPAL_SEGS[lod]!;
  const sb = new Surf();
  sb.surf(nu, nv, (u01, v) => {
    const u = u01 * 2 - 1;
    const hw = (SEPAL_WIDTH / 2) * broad * outline(v) + 0.0002;
    // it rises a little from the middle of the flower, lies flat, and its tip dips; a shallow channel runs down it
    let h = length * (0.12 * Math.sin(Math.PI * Math.min(1, v * 1.2)) - curl * v * v) - 0.0009 * Math.exp(-((u / 0.4) ** 2)) * (1 - v) + 0.0012 * u * u;
    if (lod === 0) h += 0.0006 * Math.sin(v * 9 + wave + u * 2) * u * u;
    let c = mix(SEPAL_BASE, WHITE_SEPAL, smoothstep(0, 0.3, v));
    c = mix(c, CREAM_SEPAL, 0.6 * Math.exp(-((u / 0.3) ** 2)) * (1 - 0.6 * v));
    return { p: [start + length * v, h, u * hw], c };
  });
  return sb.build();
}

const sepalCache = new Map<string, THREE.BufferGeometry>();
const SEPAL_SHAPES = 3;

/**
 * One flower: sepals and stamens, which come with the flower and go when it is over, and the tuft of styles in its
 * middle, which stays. The stamens are a part of the flower like the sepals, so that a flower in bud shows none.
 */
function addFlower(mg: Merge, flower: NodeFlower, lod: number): void {
  const rng = new RNG(9100 + flower.seed * 31);
  const { at, axis } = flower;
  const [e1, e2] = across(axis);
  const turn = rng.range(0, TAU);
  // the stamens show a moment after the sepals part
  const boss = Math.min(1, flower.opens + 0.05);
  for (let k = 0; k < flower.sepals; k++) {
    const theta = turn + (k / flower.sepals) * TAU + rng.range(-0.1, 0.1);
    const out = e1.clone().multiplyScalar(Math.cos(theta)).addScaledVector(e2, Math.sin(theta));
    const side = e1.clone().multiplyScalar(-Math.sin(theta)).addScaledVector(e2, Math.cos(theta));
    // each sepal lies a little above or below the flat of the flower, and is rolled a little about its length
    const tip = rng.range(-0.16, 0.14);
    const roll = rng.range(-0.18, 0.18);
    const x = out.clone().multiplyScalar(Math.cos(tip)).addScaledVector(axis, Math.sin(tip));
    const up = axis.clone().multiplyScalar(Math.cos(tip)).addScaledVector(out, -Math.sin(tip));
    const y = up.clone().multiplyScalar(Math.cos(roll)).addScaledVector(side, Math.sin(roll));
    const z = new V3().crossVectors(x, y);
    const shape = Math.floor(rng.f() * SEPAL_SHAPES);
    const key = `${lod}:${shape}`;
    let geometry = sepalCache.get(key);
    if (!geometry) sepalCache.set(key, (geometry = sepalGeometry(shape, lod)));
    const tone = rng.range(0.96, 1.04);
    // every sepal of a flower grows from its middle, and they open all but together
    mg.add(geometry, frame(x, y, z, at, rng.range(0.93, 1.06)), [tone, tone, tone * rng.range(0.97, 1)], at, Math.min(1, flower.opens + k * 0.004));
  }
  if (lod === 2) {
    // the boss of stamens as a low cream point
    const raw = new Raw();
    const top = at.clone().addScaledVector(axis, STAMEN_LENGTH[0]);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU;
      const b = ((k + 1) / 3) * TAU;
      const r = STAMEN_LENGTH[1] * 0.7;
      raw.flat(at.clone().addScaledVector(e1, r * Math.cos(a)).addScaledVector(e2, r * Math.sin(a)), at.clone().addScaledVector(e1, r * Math.cos(b)).addScaledVector(e2, r * Math.sin(b)), top, ANTHER, ANTHER, FILAMENT);
    }
    mg.add(raw.build(), IDENTITY, WHITE, at, boss);
    return;
  }
  // stamens: slender filaments, each ending in a narrow anther; the outer ones spread, the inner stand
  const stamens = lod === 0 ? STAMENS : Math.round(STAMENS / 3.5);
  const thick = lod === 0 ? 1 : 1.9;
  const tuft = new Merge(false);
  for (let i = 0; i < stamens; i++) {
    const f = (i + 0.5) / stamens;
    const dir = cone(axis, 0.18 + 0.95 * Math.sqrt(f) + rng.range(-0.08, 0.08), i * 2.39996 + rng.range(-0.3, 0.3));
    const length = lerp(STAMEN_LENGTH[0], STAMEN_LENGTH[1], rng.f());
    const foot = at.clone().addScaledVector(dir, 0.0012);
    const neck = at.clone().addScaledVector(dir, length - ANTHER_LENGTH);
    const head = at.clone().addScaledVector(dir, length).addScaledVector(axis, 0.0008);
    if (lod === 0) tuft.tube([foot, neck, head], [0.00016 * thick, 0.00042 * thick, 0.0003 * thick], 3, FILAMENT, ANTHER);
    else tuft.tube([foot, head], [0.0002 * thick, 0.00042 * thick], 3, FILAMENT, ANTHER);
  }
  mg.add(tuft.build(), IDENTITY, WHITE, at, boss);
  // the silky styles in the middle: they stay, and are what lengthens into the seed head
  const styles = lod === 0 ? 12 : 3;
  for (let i = 0; i < styles; i++) {
    const dir = cone(axis, 0.3 * Math.sqrt((i + 0.5) / styles), i * 2.39996);
    mg.tube([at.clone(), at.clone().addScaledVector(dir, STYLE_LENGTH * rng.range(0.85, 1.05))], [0.0004 * thick, 0.00018 * thick], 3, STYLE_GREEN, FILAMENT);
  }
}

/** A narrow bract or a bud scale: from the origin along +Z, its face +Y, one unit long. */
function bladeGeometry(halfWidth: number, cup: number, colour: (u: number, v: number) => Readonly<RGB>, [nu, nv]: [number, number]): THREE.BufferGeometry {
  const sb = new Surf();
  sb.surf(nu, nv, (u01, v) => {
    const u = u01 * 2 - 1;
    const x = u * halfWidth * Math.pow(Math.sin(Math.PI * Math.pow(v, 0.7) * 0.97 + 0.03), 0.8);
    return { p: [x, cup * (Math.abs(u) * Math.abs(u) * halfWidth * 2 + 0.25 * Math.sin(Math.PI * v * 0.8)) - 0.1 * v * v, v], c: colour(u, v) };
  });
  return sb.build();
}

const bractCache: THREE.BufferGeometry[] = [];
const scaleCache: THREE.BufferGeometry[] = [];

/** The stalks, bracts and bud scales of a node: its axis, which stays when the sepals have gone. */
function addNodeAxis(mg: Merge, layout: NodeLayout, lod: number, keep: (flower: number) => boolean, green: Readonly<RGB>, pale: Readonly<RGB>): void {
  const sides = [5, 3, 3][lod]!;
  const thin = (points: V3[]): V3[] => (lod === 0 ? points : lod === 1 ? [points[0]!, points[2]!, points[4]!] : [points[0]!, points[4]!]);
  // a stalk is drawn only where a flower it carries is drawn
  const carried = new Set<number>();
  layout.flowers.forEach((flower, i) => {
    if (!keep(i)) return;
    mg.tube(
      thin(flower.stalk),
      thin(flower.stalk).map(() => (lod === 2 ? 0.0011 : 0.0007)),
      sides,
      green,
      pale,
    );
    layout.stalks.forEach((stalk, s) => {
      if (stalk[stalk.length - 1]!.distanceTo(flower.stalk[0]!) < 1e-6) carried.add(s);
    });
  });
  layout.stalks.forEach((stalk, s) => {
    if (!carried.has(s)) return;
    mg.tube(
      thin(stalk),
      thin(stalk).map(() => (lod === 2 ? 0.0014 : 0.001)),
      sides,
      STALK_BRONZE,
      green,
    );
  });
  if (lod === 2) return;
  const place = (geometry: THREE.BufferGeometry, at: V3, along: V3, length: number) => {
    const [a, b] = across(along);
    mg.add(geometry, frame(a, b, along, at, length), WHITE, at, AXIS);
  };
  // the bracts are pale green (Curtis's Botanical Magazine t. 8587)
  bractCache[lod] ??= bladeGeometry(0.09, 0.3, (_u, v) => mix(lin('#7d8f55'), lin('#b0bd86'), v), lod === 0 ? [2, 4] : [1, 2]);
  scaleCache[lod] ??= bladeGeometry(0.24, 0.45, (u, v) => mix(mix(SCALE_BROWN, SCALE_PALE, 0.5 + 0.5 * Math.cos(u * 9)), SCALE_PALE, v * 0.6), lod === 0 ? [4, 4] : [2, 2]);
  for (const bract of layout.bracts) place(bractCache[lod]!, bract.at, bract.along, bract.length);
  for (const scale of layout.scales) place(scaleCache[lod]!, scale.at, scale.along, scale.length);
}

function makeFlowerGeometry(variant: number, lod: number): THREE.BufferGeometry {
  const layout = layoutOf(variant);
  const mg = new Merge(false);
  addNodeAxis(mg, layout, lod, () => true, STALK_GREEN, STALK_PALE);
  for (const flower of layout.flowers) addFlower(mg, flower, lod);
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, NODE_SPAN * 0.35, NODE_SPAN * 0.15), NODE_SPAN * 0.8);
  return g;
}

// ---------------------------------------------------------------------------
// Fruit: the seed heads of one node
// ---------------------------------------------------------------------------
/** The width across the seed heads of a node (m): what the growth model's fruit.lengthM measures. */
const HEADS_SPAN = mid(characterRange(morphology, 'fruit.spanM'));
const HEADS_PER_NODE = characterRange(morphology, 'fruit.headsPerNode');
const ACHENES = characterNumber(morphology, 'fruit.achenesPerHead');
const ACHENE_LENGTH = mid(characterRange(morphology, 'fruit.acheneLengthM'));
const ACHENE_WIDTH = mid(characterRange(morphology, 'fruit.acheneWidthM'));
/** "persistent style 1.6-4.8 cm long, white plumose" (Huang et al. 2024). */
const TAIL_LENGTH = characterRange(morphology, 'fruit.tailLengthM');

const FRUIT_VARIANTS = 3;
const FRUIT_LODS = 3;
// unripe: green achenes, their tails silky and pale. The ripe colour is the look's (FruitAsset.ripe).
const ACHENE_GREEN = lin('#76914f');
const TAIL_GREEN = lin('#b4c494');
const PLUME = lin('#dfe6cf');
const FRUIT_STALK = lin('#7a4a38');

/** One seed head: achenes on a small knob, each with its feathered tail. */
function addHead(mg: Merge, at: V3, axis: V3, seed: number, lod: number): void {
  const rng = new RNG(12100 + seed * 17);
  const raw = new Raw();
  const achenes = [ACHENES, Math.round(ACHENES * 0.6), Math.round(ACHENES * 0.75)][lod]!;
  for (let i = 0; i < achenes; i++) {
    // spread over the knob, the lowest ones turned back past the stalk
    const dir = cone(axis, Math.acos(1 - ((i + 0.5) / achenes) * 1.5), i * 2.39996 + rng.range(-0.3, 0.3));
    const [a, b] = across(dir);
    const foot = at.clone().addScaledVector(dir, 0.0015);
    const tip = foot.clone().addScaledVector(dir, ACHENE_LENGTH);
    if (lod < 2) {
      // the achene: flattened, widest below the middle
      const belly = foot.clone().addScaledVector(dir, ACHENE_LENGTH * 0.42);
      const w = ACHENE_WIDTH / 2;
      const ring = [belly.clone().addScaledVector(a, w), belly.clone().addScaledVector(b, w * 0.45), belly.clone().addScaledVector(a, -w), belly.clone().addScaledVector(b, -w * 0.45)];
      if (lod === 0) {
        const f = raw.vert(foot, ACHENE_GREEN);
        const t = raw.vert(tip, TAIL_GREEN);
        const r = ring.map((p) => raw.vert(p, ACHENE_GREEN));
        for (let k = 0; k < 4; k++) {
          raw.tri(f, r[k]!, r[(k + 1) % 4]!);
          raw.tri(t, r[(k + 1) % 4]!, r[k]!);
        }
      } else {
        raw.flat(foot, ring[0]!, tip, ACHENE_GREEN, ACHENE_GREEN, TAIL_GREEN);
        raw.flat(foot, tip, ring[2]!, ACHENE_GREEN, TAIL_GREEN, ACHENE_GREEN);
      }
    }
    // the tail: it leaves along the achene and curls over as it goes
    const length = lerp(TAIL_LENGTH[0], TAIL_LENGTH[1], rng.range(0.25, 0.75));
    const curl = cone(dir, Math.PI / 2, rng.range(0, TAU));
    const sweep = rng.range(0.7, 1.9);
    const segs = [3, 2, 2][lod]!;
    const line: V3[] = [tip.clone()];
    const tangents: V3[] = [];
    const p = tip.clone();
    for (let k = 1; k <= segs; k++) {
      const turn = sweep * Math.pow((k - 0.5) / segs, 1.2);
      const t = dir.clone().multiplyScalar(Math.cos(turn)).addScaledVector(curl, Math.sin(turn));
      tangents.push(t);
      p.addScaledVector(t, length / segs);
      line.push(p.clone());
    }
    const side = new V3().crossVectors(dir, curl).normalize();
    if (lod === 2) {
      // from far off a tail and its hairs are one pale blade
      const w = 0.0028;
      const m = line[1]!;
      const e = line[2]!;
      const l = raw.vert(m.clone().addScaledVector(side, w), PLUME);
      const r = raw.vert(m.clone().addScaledVector(side, -w), PLUME);
      raw.tri(raw.vert(tip, TAIL_GREEN), l, r);
      raw.tri(l, raw.vert(e, PLUME), r);
      continue;
    }
    // the feather: a fine tail with silky hairs standing out all along it
    const pointAt = (f: number): V3 => {
      const x = clamp(f, 0, 1) * segs;
      const k = Math.min(segs - 1, Math.floor(x));
      return line[k]!.clone().lerp(line[k + 1]!, x - k);
    };
    // the tail itself, a fine ribbon
    for (let k = 0; k < segs; k++) {
      const w = lod === 0 ? 0.00035 : 0.0005;
      const a0 = raw.vert(line[k]!.clone().addScaledVector(side, w), TAIL_GREEN);
      const a1 = raw.vert(line[k]!.clone().addScaledVector(side, -w), TAIL_GREEN);
      const b0 = raw.vert(line[k + 1]!.clone().addScaledVector(side, w * 0.6), PLUME);
      const b1 = raw.vert(line[k + 1]!.clone().addScaledVector(side, -w * 0.6), PLUME);
      raw.tri(a0, b0, a1);
      raw.tri(a1, b0, b1);
    }
    // and the silk: many fine hairs standing out all round it, longest near its foot
    const hairs = lod === 0 ? 34 : 9;
    for (let h = 0; h < hairs; h++) {
      const s = 0.04 + 0.94 * ((h + rng.f()) / hairs);
      const from = pointAt(s);
      const t = tangents[Math.min(segs - 1, Math.floor(s * segs))]!;
      const out = cone(t, rng.range(0.4, 0.85), h * 2.39996 + rng.range(-0.6, 0.6));
      const reach = lerp(0.0085, 0.004, s) * rng.range(0.8, 1.2) * (lod === 0 ? 1 : 1.2);
      const w = lod === 0 ? 0.00026 : 0.0005;
      raw.flat(from.clone().addScaledVector(t, -w), from.clone().addScaledVector(t, w), from.clone().addScaledVector(out, reach), TAIL_GREEN, TAIL_GREEN, PLUME);
    }
  }
  // not axis: the head ripens (its tails whiten, its achenes brown) while the stalk under it keeps its colour
  mg.add(raw.build(), IDENTITY, WHITE, at, 0);
}

function makeFruitGeometry(variant: number, lod: number): THREE.BufferGeometry {
  // the heads stand where flowers of the node stood, on the same stalks; most flowers ripen none
  const layout = layoutOf(variant);
  const rng = new RNG(13300 + variant * 29);
  const heads = Math.min(layout.flowers.length, HEADS_PER_NODE[0] + (variant % (HEADS_PER_NODE[1] - HEADS_PER_NODE[0] + 1)));
  const order = rng.shuffle(layout.flowers.map((_, i) => i));
  // the middle flower of a stalk is the likeliest to ripen: take those first, a head to each side of the node at least
  order.sort((a, b) => Number(layout.flowers[b]!.opens < 0.5) - Number(layout.flowers[a]!.opens < 0.5));
  const chosen = new Set<number>();
  for (const side of [-1, 1]) {
    const first = order.find((i) => Math.sign(layout.flowers[i]!.at.x) === side);
    if (first !== undefined && chosen.size < heads) chosen.add(first);
  }
  for (const i of order) if (chosen.size < heads) chosen.add(i);
  const mg = new Merge(false);
  addNodeAxis(mg, { ...layout, bracts: [], scales: [] }, lod, (i) => chosen.has(i), FRUIT_STALK, FRUIT_STALK);
  for (const i of chosen) {
    const flower = layout.flowers[i]!;
    addHead(mg, flower.at, flower.axis, variant * 100 + i, lod);
  }
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, HEADS_SPAN * 0.35, HEADS_SPAN * 0.15), HEADS_SPAN);
  return g;
}

// ---------------------------------------------------------------------------
// The hold: the stalk of a leaflet wound round a cable
// ---------------------------------------------------------------------------
/** The reach of the wound stalk (m), from the node to the far side of its turn: what the data gives as its length. */
const WOUND_REACH = mid(characterRange(morphology, 'hold.woundReachM'));
const HOLD_TURNS = characterNumber(morphology, 'hold.turns');
const HOLD_LODS = 2;
const HOLD = { green: lin('#7d8c52'), tip: lin('#8f9a62') };

/**
 * Variants 0 and 1 have hold: a turn and a quarter round a support that runs
 * past the node (up the model's Y, as a cable a plant climbs by itself does),
 * the two wound opposite ways. Variant 2 found nothing and is a crook.
 * One unit is the reach along +Z.
 */
function makeHoldGeometry(variant: number, lod: number): THREE.BufferGeometry {
  const mg = new Merge(false);
  const n = 30;
  // sizes in metres, then scaled so that the reach is one unit
  const stalk = 0.00075;
  let points: V3[] = [];
  if (variant < 2) {
    const hand = variant === 0 ? 1 : -1;
    // round a cable of 5 mm lying just beyond the node, with room for the stem's own thickness to one side of it
    const coil = WOUND_REACH * 0.4;
    const centre = WOUND_REACH * 0.3;
    const climb = 0.0042;
    const sweep = HOLD_TURNS * TAU;
    const wound = 22;
    const at = (t: number) => {
      // it starts on the near side, inside the stem it grew from
      const a = -0.6 + sweep * t;
      return new V3(hand * coil * Math.sin(a), climb * HOLD_TURNS * (t - 0.35), centre - coil * Math.cos(a));
    };
    for (let i = 0; i <= wound; i++) points.push(at(i / wound));
    // then it runs on, out and a little up, towards its leaflet
    const from = at(1);
    const leaving = from.clone().sub(at(1 - 1e-3)).normalize();
    const to = new V3(hand * WOUND_REACH * 0.5, from.y + WOUND_REACH * 0.3, WOUND_REACH * 0.94);
    const arriving = new V3(hand * 0.1, 0.35, 0.93).normalize();
    const reach = from.distanceTo(to) * 0.4;
    const c1 = from.clone().addScaledVector(leaving, reach);
    const c2 = to.clone().addScaledVector(arriving, -reach);
    for (let i = 1; i <= n - wound; i++) {
      const t = i / (n - wound);
      const k = 1 - t;
      points.push(
        from
          .clone()
          .multiplyScalar(k * k * k)
          .addScaledVector(c1, 3 * k * k * t)
          .addScaledVector(c2, 3 * k * t * t)
          .addScaledVector(to, t * t * t),
      );
    }
  } else {
    // nothing found: it reaches out and its end crooks over
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const hook = smoothstep(0.6, 1, t);
      points.push(new V3(WOUND_REACH * 0.18 * hook * hook, WOUND_REACH * (0.1 * Math.sin(Math.PI * t) + 0.22 * hook), WOUND_REACH * (t * 0.96 - 0.12 * hook * hook)));
    }
  }
  // the coarser model keeps every third point of the same line
  if (lod > 0) points = points.filter((_, i) => i % 3 === 0);
  mg.tube(
    points,
    points.map((_, i) => stalk * (lod ? 1.3 : 1) * (1 - 0.25 * (i / (points.length - 1)))),
    [5, 3][lod]!,
    HOLD.green,
    HOLD.tip,
  );
  for (let i = 0; i < mg.pos.length; i++) mg.pos[i] = mg.pos[i]! / WOUND_REACH;
  for (let i = 0; i < mg.part.length; i += 4) for (let k = 0; k < 3; k++) mg.part[i + k] = mg.part[i + k]! / WOUND_REACH;
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, 0, 0.45), 0.9);
  return g;
}

// ---------------------------------------------------------------------------
// The look
// ---------------------------------------------------------------------------
const leaf: LeafAsset = {
  key: 'clematis-armandi/leaf',
  variants: LEAF_VARIANTS,
  lods: LEAF_LODS,
  make: makeLeafGeometry,
  budget: [1700, 360, 96],
  pick: (_lengthM, r) => Math.min(LEAF_VARIANTS - 1, Math.floor(r * LEAF_VARIANTS)),
  // "dark glossy green" (RHS), "bronze when young": evergreen, so its greens again where another plant has autumn colours
  // the photographs show the mature leaf darker and greyer than a bright green, the veins paler than the blade
  palette: { greenA: lin('#22381c'), greenB: lin('#33482a'), young: lin('#8a4a2c'), autumnA: lin('#33482a'), autumnB: lin('#22381c') },
  roughness: 0.28,
  translucency: 0.16,
  detailReach: 1.15,
};

const flowers: FlowerAsset = {
  key: 'clematis-armandi/node-clusters',
  variants: FLOWER_VARIANTS,
  lods: FLOWER_LODS,
  make: makeFlowerGeometry,
  budget: [19000, 3300, 420],
  pick: (r) => Math.min(FLOWER_VARIANTS - 1, Math.floor(r * FLOWER_VARIANTS)),
  authoredSize: NODE_SPAN,
  poise: 'held',
  centreAlong: 0.35,
  // "globose silvery buds" (Royal Botanic Garden Edinburgh)
  budTint: [0.8, 0.86, 0.72],
  swing: 0.25,
  translucency: 0.42,
  sheen: 0.05,
  detailAt: [1.4, 4.2],
  detailCaps: [14, 160],
};

const seedHeads: FruitAsset = {
  key: 'clematis-armandi/seed-heads',
  variants: FRUIT_VARIANTS,
  lods: FRUIT_LODS,
  make: makeFruitGeometry,
  budget: [3400, 700, 170],
  pick: (r) => Math.min(FRUIT_VARIANTS - 1, Math.floor(r * FRUIT_VARIANTS)),
  authoredSize: HEADS_SPAN,
  poise: 'held',
  centreAlong: 0.35,
  // "white, feathery" (Kwantlen): the hairs dry silver-white, the achenes and stalks brown
  ripe: lin('#fff6de'),
  ripeShade: [-0.25, 1.39],
  // the stalks the heads stand on keep their red-brown while the tails whiten
  stalkKeepsColour: true,
  roughness: 0.85,
  swing: 0.35,
  detailAt: [1.5, 4.5],
  detailCaps: [16, 160],
};

const hold: AppendageAsset = {
  key: 'clematis-armandi/leaflet-stalk-wound',
  variants: 3,
  lods: HOLD_LODS,
  make: makeHoldGeometry,
  budget: [320, 60],
  pick: (r, holding) => (holding ? (r < 0.5 ? 0 : 1) : 2),
  // a stalk that has hold hardens and browns
  aged: lin('#6a5238'),
  agedDays: [90, 420],
  roughness: 0.75,
  swing: 0,
  detailAt: [1.2],
  detailCaps: [200],
};

/**
 * Young shoots "a deep bronze red" (Royal Botanic Garden Edinburgh), ribbed;
 * the bark of old stems brown, stringy and coming away in strips (Kwantlen;
 * the Hong Kong standard for the dried stem). The ages are this look's.
 */
const wood: WoodLook = {
  young: lin('#7a4b34'),
  mature: lin('#5b4631'),
  old: [0.6, 0.5, 0.4],
  woodyDays: [35, 260],
  oldDays: [420, 1500],
  furrowDays: [200, 1300],
  furrow: 0.55,
  stiffDays: [60, 420],
  relief: 2.7,
  roughness: 0.9,
  // many straight narrow streaks: a stringy bark, ridged along the stem
  grain: { streaks: 700, width: 2.3, wobble: 5 },
};

export const look: TaxonLook = {
  taxonId: 'clematis-armandi',
  provisional: false,
  leaves: { default: leaf },
  flowers: { default: flowers },
  fruits: { default: seedHeads },
  appendages: { leaf_stalk_coil: hold },
  wood,
};

