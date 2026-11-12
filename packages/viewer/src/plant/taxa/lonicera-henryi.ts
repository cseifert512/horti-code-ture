// Lonicera henryi (Henry's honeysuckle), an evergreen twiner.
//
//   leaf      simple, leathery, in opposite pairs: a short hairy stalk and an
//             oblong-lanceolate to oblong-ovate blade, rounded or a little
//             heart-shaped at the base and drawn out to a long point, the midrib
//             and six to eight pairs of looping side veins impressed, the margin
//             fringed with hairs. One unit long along +Z, upper side +Y. Three
//             outlines (slender, middling, broad) in two postures.
//   cluster   the inflorescence at the end of a short leafy shoot: two-flowered
//             stalks in opposite pairs up a short axis. Each flower is a curved
//             tube opening into a four-lobed upper lip and a strap of a lower
//             lip, both rolled right back, with five stamens and a longer style
//             standing out of the mouth. The lowest flowers open first; the
//             upper ones are still club-shaped buds when the first have turned
//             from purplish red to coppery yellow. In metres, 63.5 mm across as
//             authored: the width of the cluster is what the render data gives.
//   berries   what follows: ovoid berries in pairs on the same stalks, each
//             crowned by its calyx, glaucous grey-green and ripening blue-black
//             under a bloom. In metres, 24 mm across the cluster as authored.
//   wood      red-bronze shoots, pale brown wood, old bark shredding in strips
//
// The cluster is drawn by the program first written for a raceme: each corolla,
// with the stamens and style it carries off when it falls, is one flower of the
// inflorescence; stalks, bracts, ovaries and calyces are its axis and stay.
//
// Sizes and counts of the real plant are read from
// species/lonicera-henryi/morphology.json, each with its source; proportions
// that only shape the drawing are stated here. Made from floras and from
// photographs of identified plants, not from specimens. These shapes are
// Lonicera henryi's: the other honeysuckle has its own.
import * as THREE from 'three';
import { characterNumber, characterRange, parseMorphology } from '@horti/core';
import morphologyJson from '../../../../../species/lonicera-henryi/morphology.json';
import { RNG, clamp, hash2, lerp, smoothstep } from '../../util.ts';
import { MIDRIB, Merge, type RGB, Surf, WHITE, lin, mix } from '../kit.ts';
import { type FlowerAsset, type FruitAsset, type LeafAsset, type TaxonLook, type WoodLook } from '../look.ts';

/** What floras record of this plant's parts, each number with its source and evidence status. */
const morphology = parseMorphology(morphologyJson, 'species/lonicera-henryi/morphology.json');

const V3 = THREE.Vector3;
type V3 = THREE.Vector3;
const TAU = Math.PI * 2;
type Segs = readonly [number, number];
const mid = (r: readonly [number, number]): number => (r[0] + r[1]) / 2;
const AX = new V3(1, 0, 0);
const AY = new V3(0, 1, 0);

// ---------------------------------------------------------------------------
// Leaf
// ---------------------------------------------------------------------------
/** Bean: blade 1 3/4 to 4 in. long and 1/2 to 1 5/8 in. wide, on a stalk 1/8 to 1/2 in. long. */
const BLADE_LENGTH = characterRange(morphology, 'leaf.bladeLengthM');
const BLADE_WIDTH = characterRange(morphology, 'leaf.bladeWidthM');
const STALK_LENGTH = characterRange(morphology, 'leaf.stalkLengthM');
/** Side veins each side of the midrib, counted on a photograph. */
const VEIN_PAIRS = characterRange(morphology, 'leaf.lateralVeinPairs');
/** The share of a leaf's length that is stalk. */
const STALK = mid(STALK_LENGTH) / (mid(STALK_LENGTH) + mid(BLADE_LENGTH));
/** A leaf's whole length, stalk and blade: what the render data gives. */
const LEAF_LENGTH: readonly [number, number] = [BLADE_LENGTH[0] + STALK_LENGTH[0], BLADE_LENGTH[1] + STALK_LENGTH[1]];
/** Width of the blade for its length: the smallest leaves Bean measured are the most slender, the largest the broadest. */
const SLENDER = BLADE_WIDTH[0] / BLADE_LENGTH[0];
const BROAD = BLADE_WIDTH[1] / BLADE_LENGTH[1];

interface LeafForm {
  /** Width of the blade as a share of its length. */
  ratio: number;
  /** How far along the blade the sides begin to draw in to the point, and how sharply they pinch to it. */
  taperFrom: number;
  pinch: number;
  /** How far the base runs back past the stalk on either side: 0 rounded, 1 heart-shaped. */
  cordate: number;
}
/** "oblong-lanceolate to oblong-ovate", the apex "abruptly to gradually acuminate", the base "rounded or cordate" (Bean). */
const LEAF_FORMS: readonly LeafForm[] = [
  { ratio: SLENDER, taperFrom: 0.3, pinch: 0.42, cordate: 0 },
  { ratio: (SLENDER + BROAD) / 2, taperFrom: 0.4, pinch: 0.55, cordate: 0.45 },
  { ratio: BROAD, taperFrom: 0.47, pinch: 0.66, cordate: 1 },
];
/**
 * How the blade is held: how far it hangs from its stalk, arches along its
 * length and hooks at the point, how deeply it is keeled, and how far its
 * stalk has twisted to turn its face to the light.
 */
const LEAF_POSTURES = [
  { pitch: 0.1, droop: 0.4, hook: 0.5, fold: 0.24, twist: 0.6 },
  { pitch: 0.2, droop: 0.24, hook: 0.3, fold: 0.13, twist: -0.65 },
] as const;
const LEAF_VARIANTS = LEAF_FORMS.length * LEAF_POSTURES.length;
const LEAF_LODS = 3;
const LEAF_SEGS: readonly Segs[] = [
  [12, 44],
  [6, 14],
  [2, 5],
];
/** Where along the blade a coarse model puts its few stations, to keep the outline. */
const COARSE_STATIONS = [0, 0.09, 0.34, 0.6, 0.84, 1];

/**
 * The shared leaf texture (textures.ts) has a side vein leaving the midrib
 * every 21 of its 256 rows from row 14, running out and up to the margin 34
 * rows higher. A blade shows as many pairs of them as the plant has, and its
 * relief follows the same lines.
 */
const VEIN_FIRST = 14 / 256;
const VEIN_STEP = 21 / 256;
const TEX_BASE = 0.02;
const TEX_SPAN = VEIN_FIRST - TEX_BASE + (mid(VEIN_PAIRS) + 0.45) * VEIN_STEP;
const texV = (v: number): number => TEX_BASE + TEX_SPAN * v;
/** Which side vein a point is on, as a number that is whole on a vein: `a` 0 at the midrib and 1 at the margin. */
function veinPhase(a: number, vt: number): number {
  const s = (-60 + Math.sqrt(3600 + 1024 * a)) / 8;
  const rise = (24 * s * (1 - s) + 34 * s * s) / 256;
  return (vt - VEIN_FIRST - rise) / VEIN_STEP;
}

/** The midline of a blade one unit long that arches down along its length: where it is, and how steeply it falls, at v. */
function midline(droop: number, hook: number): (v: number) => { y: number; z: number; a: number } {
  const n = 48;
  const angle: number[] = [];
  const ys = [0];
  const zs = [0];
  for (let i = 0; i <= n; i++) {
    const v = i / n;
    angle.push(droop * v + hook * smoothstep(0.72, 1, v));
  }
  for (let i = 1; i <= n; i++) {
    const a = (angle[i]! + angle[i - 1]!) / 2;
    ys.push(ys[i - 1]! - Math.sin(a) / n);
    zs.push(zs[i - 1]! + Math.cos(a) / n);
  }
  return (v) => {
    const x = clamp(v, 0, 1) * n;
    const i = Math.min(n - 1, Math.floor(x));
    const t = x - i;
    return { y: lerp(ys[i]!, ys[i + 1]!, t), z: lerp(zs[i]!, zs[i + 1]!, t), a: lerp(angle[i]!, angle[i + 1]!, t) };
  };
}

/** Half the width of the blade at v, as a share of its length. */
function halfWidth(form: LeafForm, v: number): number {
  // a rounded shoulder at the base
  const shoulder = 1 - Math.pow(1 - Math.min(1, v / 0.17), 2.3);
  // parallel sides, then drawn in to a long point
  const s = clamp((v - form.taperFrom) / (1 - form.taperFrom), 0, 1);
  const taper = (1 - s * s) * (1 - form.pinch * smoothstep(0.4, 0.95, s));
  return (form.ratio / 2) * shoulder * taper;
}

function makeBlade(form: LeafForm, posture: (typeof LEAF_POSTURES)[number], lod: number, seed: number): THREE.BufferGeometry {
  const sb = new Surf();
  const [nu, nv] = LEAF_SEGS[lod]!;
  const line = midline(posture.droop, posture.hook);
  const fine = lod === 0;
  const wave = hash2(seed, 3) * TAU;
  const at = (u01: number, v: number): [number, number, number] => {
    const u = u01 * 2 - 1;
    const a = Math.abs(u);
    const hw = halfWidth(form, v);
    const x = u * (hw + 0.002);
    const m = line(v);
    // height above the midline, square to it: a shallow keel, the margins turned down a little
    let h = posture.fold * Math.abs(x) - 0.55 * x * x;
    if (lod < 2) h += 0.011 * Math.sin(v * 15 + wave + u * 1.2) * a * a * (1 - v * 0.5);
    if (fine) {
      const ph = veinPhase(a, texV(v));
      const live = smoothstep(-0.6, -0.2, ph) * (1 - smoothstep(0.86, 1, v)) * Math.pow(Math.sin(Math.PI * Math.min(1, a)), 0.6);
      const f = ph - Math.round(ph);
      // the blade swells between the side veins, which lie in grooves, and the midrib in a deeper one
      h += 0.006 * (0.5 - 0.5 * Math.cos(TAU * ph)) * live - 0.004 * Math.exp(-((f / 0.17) ** 2)) * live;
      h -= 0.011 * Math.exp(-((a / 0.085) ** 2)) * (1 - 0.6 * v);
    }
    // a heart-shaped base runs back a little past the stalk on either side
    const back = 0.035 * form.cordate * a * a * Math.exp(-((v / 0.07) ** 2));
    return [x, m.y + Math.cos(m.a) * h, m.z + Math.sin(m.a) * h - back];
  };
  const station = (v: number): number => {
    if (lod < 2) return v;
    const x = v * (COARSE_STATIONS.length - 1);
    const i = Math.min(COARSE_STATIONS.length - 2, Math.floor(x));
    return lerp(COARSE_STATIONS[i]!, COARSE_STATIONS[i + 1]!, x - i);
  };
  sb.surf(nu, nv, (u01, v) => ({ p: at(u01, station(v)) }));
  // the texture shows as many side veins as the leaf has
  for (let i = 0; i < sb.uv.length / 2; i++) sb.uv[2 * i + 1] = texV(station(sb.uv[2 * i + 1]!));

  if (fine) {
    // the fringe of hairs on the margin: fine pale bristles standing out in the plane of the blade
    const hairs = 76;
    for (const side of [0, 1]) {
      for (let k = 0; k < hairs; k++) {
        const v = 0.015 + 0.955 * ((k + 0.2 + 0.6 * hash2(seed + side, k)) / hairs);
        const p = at(side, v);
        const q = at(side, Math.min(1, v + 0.0016));
        const inner = at(side === 0 ? 0.04 : 0.96, v);
        const out = new V3(p[0] - inner[0], p[1] - inner[1], p[2] - inner[2]).normalize();
        const along = new V3(q[0] - p[0], q[1] - p[1], q[2] - p[2]).normalize();
        const len = 0.007 + 0.006 * hash2(seed + 7 + side, k);
        const tip = new V3(p[0], p[1], p[2]).addScaledVector(out, len).addScaledVector(along, len * 0.5);
        const first = sb.uv.length / 2;
        sb.surf(1, 1, (i, j) => (j === 0 ? { p: i === 0 ? p : q } : { p: [tip.x, tip.y, tip.z] }));
        for (let i = first; i < sb.uv.length / 2; i++) {
          sb.uv[2 * i] = MIDRIB[0];
          sb.uv[2 * i + 1] = MIDRIB[1];
        }
      }
    }
  }
  return sb.build();
}

function makeLeafGeometry(variant: number, lod: number): THREE.BufferGeometry {
  const form = LEAF_FORMS[variant % LEAF_FORMS.length]!;
  const posture = LEAF_POSTURES[Math.floor(variant / LEAF_FORMS.length) % LEAF_POSTURES.length]!;
  const mg = new Merge(true);
  // the stalk: short, stout for its length, rising a little to the blade
  const end = new V3(0, 0.008, STALK);
  mg.tube([new V3(0, 0, 0), new V3(0, 0.006, STALK * 0.5), end], [0.012, 0.0085, 0.008], [6, 4, 3][lod]!, WHITE, WHITE, MIDRIB);
  const s = 1 - STALK;
  const turn = new THREE.Quaternion().setFromAxisAngle(new V3(0, 0, 1), posture.twist).multiply(new THREE.Quaternion().setFromAxisAngle(AX, posture.pitch));
  const m = new THREE.Matrix4().compose(end, turn, new V3(s, s, s));
  mg.add(makeBlade(form, posture, lod, 40 + variant), m, WHITE, end, 0.2 + 0.6 * hash2(variant, 11));
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, -0.1, 0.5), 0.75);
  return g;
}

// ---------------------------------------------------------------------------
// Flowers. All lengths in metres.
// ---------------------------------------------------------------------------
/** Bean: "a cluster 2 or 3 in. across". The size the cluster is authored at. */
const CLUSTER_WIDTH = mid(characterRange(morphology, 'inflorescence.widthM'));
/** Flowers to a cluster, counted on photographs: three to seven pairs. */
const FLOWER_COUNT = characterRange(morphology, 'inflorescence.flowerCount');
/** Flora of China: the stalk of a pair 0 to 23 mm, shorter towards the tip. */
const PAIR_STALK = characterRange(morphology, 'inflorescence.pairStalkLengthM');
/** Bean: bracts awl-shaped, about 1/4 in. long. */
const BRACT = characterNumber(morphology, 'inflorescence.bractLengthM');
/** Bean: tube 1/2 to almost 3/4 in. long. */
const TUBE = mid(characterRange(morphology, 'flower.tubeLengthM'));
/** Bean: the corolla about 3/4 in. across its reflexed lips. */
const ACROSS = characterNumber(morphology, 'flower.widthAcrossLipsM');
/** Flora of China: the upper lip four-lobed; the lower lip is the fifth lobe. */
const UPPER_LOBES = characterNumber(morphology, 'flower.upperLipLobes');
const STAMENS = characterNumber(morphology, 'flower.stamenCount');
/** Bean: the style protrudes 1/2 in. beyond the corolla. */
const STYLE_OUT = characterNumber(morphology, 'flower.styleExsertionM');

/** Flowers in each variant of the cluster: within the counted range, two to a stalk. */
const CLUSTER_FLOWERS: readonly number[] = [FLOWER_COUNT[0], FLOWER_COUNT[0] + 2, mid(FLOWER_COUNT), Math.min(FLOWER_COUNT[1], mid(FLOWER_COUNT) + 2)];
const CLUSTER_LODS = 3;

// Proportions of the drawing, not measurements: no flora gives them.
const R_BASE = 0.0008; // the tube where it leaves the ovary
const R_MOUTH = 0.0021; // and at its mouth: Flora of China gives the throat as 2 to 5 mm across
const TUBE_BEND = 0.13; // how far the tube curves up along its length, in lengths
const UPPER_ARC = 2.2; // half the arc of the mouth that the upper lip springs from, radians: four lobes of the five
const STAMEN_OUT = 0.72; // how far the stamens stand out, as a share of the style

const C = {
  tubeBase: lin('#e6e3c2'),
  tubeMid: lin('#ead8a0'),
  flush: lin('#a23a55'),
  lip: lin('#7e2040'),
  lipEdge: lin('#b44a62'),
  throat: lin('#e5c555'),
  agedTube: lin('#d9a645'),
  agedLip: lin('#b46532'),
  filament: lin('#f1ead8'),
  anther: lin('#d8b45c'),
  agedAnther: lin('#8f6c3c'),
  style: lin('#ece5cf'),
  stigma: lin('#a8b750'),
  budBase: lin('#cdd8a2'),
  budMid: lin('#ebe2c4'),
  budTip: lin('#b03e5c'),
  ovary: lin('#7c9868'),
  calyx: lin('#6c8656'),
  calyxTip: lin('#8a5a60'),
  stalkA: lin('#6c7c44'),
  stalkB: lin('#8a5c48'),
  bract: lin('#5c7a3e'),
};

// the mouth of the tube: where it is, the way the tube runs there, and the side its upper lip is on
const MOUTH = new V3(0, TUBE_BEND * TUBE, TUBE);
const RUN = new V3(0, 2 * TUBE_BEND, 1).normalize();
const UPPER = new V3(0, RUN.z, -RUN.y);

interface CorollaSegs {
  tube: Segs;
  upper: Segs;
  lower: Segs | null;
  /** Sides of a filament: 0 none, 1 a flat strip, 3 or more a tube with its anther. */
  stamen: number;
}
const COROLLA_SEGS: readonly CorollaSegs[] = [
  { tube: [8, 7], upper: [16, 8], lower: [3, 6], stamen: 4 },
  { tube: [5, 3], upper: [4, 3], lower: [1, 2], stamen: 1 },
  { tube: [3, 1], upper: [2, 2], lower: null, stamen: 0 },
];

interface CorollaLook {
  /** How far round the lips have rolled, radians. */
  roll: number;
  /** 0 newly open, purplish red; 1 turned coppery yellow. */
  aged: number;
  seed: number;
}

/**
 * One open corolla with the stamens and style it carries, from the top of the
 * ovary along +Z, its upper lip on the +Y side.
 */
function corolla(lod: number, look: CorollaLook): THREE.BufferGeometry {
  const sb = new Surf();
  const seg = COROLLA_SEGS[lod]!;
  const fine = lod === 0;
  const far = lod === 2;
  const tubeCream = mix(C.tubeBase, C.agedTube, look.aged * 0.55);
  const tubeMid = mix(C.tubeMid, C.agedTube, look.aged);
  const flush = mix(C.flush, C.agedLip, look.aged * 0.8);
  const lipColour = mix(C.lip, C.agedLip, look.aged);
  const lipEdge = mix(C.lipEdge, C.agedTube, look.aged * 0.7);
  const throat = mix(C.throat, C.agedTube, look.aged * 0.6);

  // the tube: slender, widening to the mouth, curving up, a little swollen below at the base
  sb.surf(seg.tube[0], seg.tube[1], (u, v) => {
    const th = u * TAU;
    const up = Math.sin(th);
    let r = R_BASE + (R_MOUTH - R_BASE) * Math.pow(v, 1.7);
    if (fine) r += 0.00035 * Math.exp(-(((v - 0.12) / 0.08) ** 2)) * Math.max(0, -up);
    const y = TUBE_BEND * TUBE * v * v;
    const c = mix(mix(tubeCream, tubeMid, smoothstep(0.05, 0.55, v)), flush, smoothstep(0.3, 1, v) * (0.5 + 0.4 * up) * (far ? 1.15 : 1));
    return { p: [Math.cos(th) * r, y + up * r, TUBE * v], c };
  });

  // a lip: a strap that springs from part of the rim, flattens as it leaves it and rolls back on itself
  const lip = (segs: Segs, side: 1 | -1, arc: number, length: number, roll: number, lobes: number, tipWidth: number) => {
    const n0 = UPPER.clone().multiplyScalar(side);
    const from = MOUTH.clone().addScaledVector(n0, R_MOUTH);
    const rad = length / roll;
    sb.surf(segs[0], segs[1], (u01, w) => {
      const u = u01 * 2 - 1;
      // between the lobes the lip is shorter
      const lobe = lobes > 1 ? Math.sqrt(Math.abs(Math.sin(Math.PI * lobes * u01))) : 1 - u * u * 0.5;
      const we = w * (1 - 0.09 * (1 - lobe) * w ** 4);
      // it turns back sharply at the mouth and goes on rolling
      const phi = roll * Math.pow(we, 0.85);
      const centre = from
        .clone()
        .addScaledVector(RUN, rad * Math.sin(phi))
        .addScaledVector(n0, rad * (1 - Math.cos(phi)));
      const normal = RUN.clone()
        .multiplyScalar(-Math.sin(phi))
        .addScaledVector(n0, Math.cos(phi));
      const rho = R_MOUTH * (1 + 20 * we);
      const hw = R_MOUTH * arc * lerp(1 + 0.16 * Math.sin(Math.PI * Math.pow(we, 0.8)), tipWidth, we * we);
      const beta = (u * hw) / rho;
      const p = centre.addScaledVector(AX, rho * Math.sin(beta) * side).addScaledVector(normal, -rho * (1 - Math.cos(beta)));
      const c = mix(mix(throat, lipColour, smoothstep(0, 0.32, w)), lipEdge, Math.pow(Math.abs(u), 3) * 0.55);
      return { p: [p.x, p.y, p.z], c };
    });
  };
  // Bean's 3/4 in. across is taken as the two lips laid out end to end; on the plant they are rolled right back
  const upperLength = ACROSS / 2;
  lip(seg.upper, 1, UPPER_ARC, upperLength * (far ? 1.2 : 1), look.roll, fine ? UPPER_LOBES : 1, far ? 1.2 : 1);
  if (seg.lower) lip(seg.lower, -1, Math.PI - UPPER_ARC, upperLength * 0.92, look.roll * 1.12, 1, 0.5);

  // stamens and style: out of the mouth, fanned below, curving up at their ends
  if (seg.stamen > 0) {
    const from = MOUTH.clone().addScaledVector(RUN, -0.2 * TUBE);
    const strand = (reach: number, turn: number, splay: number, r0: number, r1: number, c0: Readonly<RGB>, c1: Readonly<RGB>): V3 => {
      const out = AX.clone()
        .multiplyScalar(Math.cos(turn))
        .addScaledVector(UPPER, Math.sin(turn));
      const tip = MOUTH.clone()
        .addScaledVector(RUN, reach * Math.cos(splay))
        .addScaledVector(out, reach * Math.sin(splay))
        .addScaledVector(UPPER, reach * 0.16);
      const ctrl = MOUTH.clone()
        .addScaledVector(RUN, reach * 0.5)
        .addScaledVector(out, reach * 0.3 * Math.sin(splay))
        .addScaledVector(UPPER, -reach * 0.1);
      const at = (q: number) =>
        from
          .clone()
          .multiplyScalar((1 - q) * (1 - q))
          .addScaledVector(ctrl, 2 * q * (1 - q))
          .addScaledVector(tip, q * q);
      if (seg.stamen === 1) {
        // a flat strip, seen at a distance
        sb.surf(1, 2, (i, q) => {
          const p = at(q).addScaledVector(AX, (i - 0.5) * 2.4 * lerp(r0, r1, q));
          return { p: [p.x, p.y, p.z], c: mix(c0, c1, q) };
        });
      } else {
        sb.surf(seg.stamen, 4, (u, q) => {
          const th = u * TAU;
          const p = at(q);
          const r = lerp(r0, r1, q);
          return { p: [p.x + Math.cos(th) * r, p.y + Math.sin(th) * r, p.z], c: mix(c0, c1, q) };
        });
      }
      return tip;
    };
    const anther = mix(C.anther, C.agedAnther, look.aged);
    for (let i = 0; i < STAMENS; i++) {
      // fanned across the lower side of the mouth
      const turn = -Math.PI / 2 + (i - (STAMENS - 1) / 2) * 0.62 + (hash2(look.seed, i) - 0.5) * 0.25;
      const reach = STYLE_OUT * STAMEN_OUT * (0.88 + 0.24 * hash2(look.seed + 3, i));
      const tip = strand(reach, turn, 0.36 + 0.14 * hash2(look.seed + 5, i), 0.00022, 0.00017, C.filament, C.filament);
      // the anther: a narrow oblong hung across the tip of its filament
      const lie = AX.clone().multiplyScalar(Math.cos(turn + 1.2)).addScaledVector(UPPER, Math.sin(turn + 1.2)).addScaledVector(RUN, 0.3).normalize();
      if (seg.stamen === 1) {
        sb.surf(1, 1, (a, b) => {
          const p = tip.clone().addScaledVector(lie, (a - 0.5) * 0.0028).addScaledVector(RUN, (b - 0.5) * 0.0012);
          return { p: [p.x, p.y, p.z], c: anther };
        });
      } else {
        const [e1, e2] = [new V3().crossVectors(lie, RUN).normalize(), new V3()];
        e2.crossVectors(lie, e1);
        sb.surf(5, 3, (u, v) => {
          const th = u * TAU;
          const r = 0.00055 * Math.sin(Math.PI * clamp(v, 0.04, 0.96));
          const p = tip.clone().addScaledVector(lie, (v - 0.5) * 0.003).addScaledVector(e1, Math.cos(th) * r).addScaledVector(e2, Math.sin(th) * r);
          return { p: [p.x, p.y, p.z], c: anther };
        });
      }
    }
    const end = strand(STYLE_OUT, -Math.PI / 2 + 0.2, 0.12, 0.00026, 0.0002, C.style, C.style);
    if (seg.stamen > 1) {
      // the stigma: a green knob
      sb.surf(6, 3, (u, v) => {
        const th = u * TAU;
        const r = 0.00075 * Math.sin(Math.PI * clamp(v, 0.03, 0.97));
        return { p: [end.x + Math.cos(th) * r, end.y + (v - 0.5) * 0.0013, end.z + Math.sin(th) * r], c: C.stigma };
      });
    }
  }
  return sb.build();
}

const BUD_SEGS: readonly Segs[] = [
  [8, 9],
  [5, 4],
  [3, 2],
];
/** A bud about to open: a slender tube swelling to a club, curved up, flushed towards its tip. From the ovary along +Z. */
function clubBud(lod: number): THREE.BufferGeometry {
  const sb = new Surf();
  const [nu, nv] = BUD_SEGS[lod]!;
  const length = TUBE + 0.6 * (ACROSS / 2);
  sb.surf(nu, nv, (u, v) => {
    const th = u * TAU;
    // slender for the lower half, swelling to the club, and rounded off at the end
    const cap = v > 0.8 ? Math.sqrt(Math.max(0, 1 - ((v - 0.8) / 0.2) ** 2)) : 1;
    const r = (R_BASE * (1 + 0.4 * v) + 0.0011 * smoothstep(0.42, 0.8, v)) * cap;
    const y = 0.16 * length * v * v;
    const up = Math.sin(th);
    const c = mix(mix(C.budBase, C.budMid, smoothstep(0.1, 0.5, v)), C.budTip, smoothstep(0.45, 0.95, v) * (0.6 + 0.35 * up));
    return { p: [Math.cos(th) * r, y + up * r, length * v], c };
  });
  return sb.build();
}

/** The ovary under a flower, with the calyx on it: what a berry grows from. From the stalk along +Z. */
function ovary(lod: number): THREE.BufferGeometry {
  const sb = new Surf();
  const around = [7, 5, 3][lod]!;
  const length = 0.0022;
  sb.surf(around, lod === 0 ? 4 : 2, (u, v) => {
    const th = u * TAU;
    const r = 0.00095 * Math.pow(Math.sin(Math.PI * clamp(0.12 + 0.76 * v, 0, 1)), 0.6);
    return { p: [Math.cos(th) * r, Math.sin(th) * r, -length + length * v], c: mix(C.ovary, C.calyx, v) };
  });
  if (lod === 0) {
    // the calyx: five small teeth round the foot of the tube
    sb.surf(10, 1, (u, v) => {
      const th = u * TAU;
      const tooth = 0.5 + 0.5 * Math.cos(5 * th);
      const r = 0.00085 + 0.00045 * v;
      return { p: [Math.cos(th) * r, Math.sin(th) * r, v * (0.0004 + 0.0011 * tooth)], c: mix(C.calyx, C.calyxTip, v * tooth) };
    });
  }
  return sb.build();
}

/** An awl-shaped bract, from its foot along +Z. */
function bract(): THREE.BufferGeometry {
  const sb = new Surf();
  sb.surf(2, 2, (u01, v) => {
    const u = u01 * 2 - 1;
    const hw = 0.0006 * (1 - v) + 0.00005;
    return { p: [u * hw, 0.0004 * Math.abs(u) + 0.0008 * v * v, BRACT * v], c: mix(C.bract, C.stalkA, v) };
  });
  return sb.build();
}

/**
 * Where the stalks of a cluster stand: opposite pairs at each node of a short
 * axis, each node square to the last, the stalks shorter towards the tip.
 * `stalks` is how many there are; an odd one stands alone at the top.
 */
function stalksOf(stalks: number, variant: number, longest: number): { foot: V3; dir: V3; side: V3; length: number; order: number }[] {
  const nodes = Math.ceil(stalks / 2);
  const height = 0.003 + 0.003 * nodes;
  const turn = hash2(variant, 71) * TAU;
  const out: { foot: V3; dir: V3; side: V3; length: number; order: number }[] = [];
  for (let k = 0; k < stalks; k++) {
    const node = Math.floor(k / 2);
    const f = nodes > 1 ? node / (nodes - 1) : 0;
    const azimuth = turn + node * (Math.PI / 2) + (k % 2) * Math.PI + (hash2(variant + 3, k) - 0.5) * 0.3;
    // the lowest stalks stand well out; the upper ones are nearly upright
    const lean = lerp(1.12, 0.42, f) + (hash2(variant + 5, k) - 0.5) * 0.16;
    const radial = new V3(Math.cos(azimuth), 0, Math.sin(azimuth));
    const dir = AY.clone().multiplyScalar(Math.cos(lean)).addScaledVector(radial, Math.sin(lean)).normalize();
    out.push({
      foot: new V3(0, height * (0.25 + 0.75 * f), 0),
      dir,
      side: new V3().crossVectors(AY, dir).normalize(),
      length: longest * lerp(1, 0.18, Math.pow(f, 0.8)) * (0.85 + 0.3 * hash2(variant + 7, k)),
      order: f,
    });
  }
  return out;
}

const corollaCache = new Map<string, THREE.BufferGeometry>();
function corollaOf(lod: number, kind: number): THREE.BufferGeometry {
  const key = `${lod}/${kind}`;
  let g = corollaCache.get(key);
  // two newly open, one rolled a little further than the other, and one that has turned
  if (!g) corollaCache.set(key, (g = corolla(lod, [{ roll: 2.7, aged: 0, seed: 11 }, { roll: 3.1, aged: 0.12, seed: 23 }, { roll: 3.7, aged: 1, seed: 37 }][kind]!)));
  return g;
}

function makeClusterGeometry(variant: number, lod: number): THREE.BufferGeometry {
  const flowers = CLUSTER_FLOWERS[variant]!;
  // the stalks of a cluster are well short of the longest the flora allows
  const stalks = stalksOf(flowers / 2, variant, PAIR_STALK[1] * 0.42);
  const rng = new RNG(900 + variant * 29);
  const mg = new Merge(false);
  const radial = [5, 4, 3][lod]!;
  const top = stalks.reduce((y, s) => Math.max(y, s.foot.y), 0);
  // the axis: the end of the shoot
  mg.tube([new V3(0, 0, 0), new V3(0, top * 0.55, 0), new V3(0, top, 0)], [0.0013, 0.0011, 0.0008], radial, C.stalkA, C.stalkB);

  const bud = clubBud(lod);
  // at a distance the ovaries and bracts are lost in the stalks
  const seat = lod < 2 ? ovary(lod) : null;
  const awl = lod < 2 ? bract() : null;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const X = new V3();
  const Y = new V3();
  const Z = new V3();
  /** Sets `m` to stand a part at `at`, running along `dir`, its upper side towards the axis of the cluster. */
  const stand = (at: V3, dir: V3, size: number, twist: number) => {
    Z.copy(dir).normalize();
    Y.copy(AY).addScaledVector(Z, -AY.dot(Z));
    if (Y.lengthSq() < 1e-6) Y.set(1, 0, 0);
    Y.normalize();
    X.crossVectors(Y, Z);
    m.makeBasis(X, Y, Z);
    q.setFromRotationMatrix(m).multiply(new THREE.Quaternion().setFromAxisAngle(new V3(0, 0, 1), twist));
    m.compose(at, q, new V3(size, size, size));
  };
  // the uppermost stalks still carry buds when the lowest flowers are open
  const budStalks = Math.max(1, Math.round(stalks.length / 4));
  stalks.forEach((s, k) => {
    const inBud = k >= stalks.length - budStalks;
    const end = s.foot.clone().addScaledVector(s.dir, s.length);
    const bow = s.foot.clone().addScaledVector(s.dir, s.length * 0.5).addScaledVector(AY, s.length * 0.06);
    mg.tube([s.foot, bow, end], [0.00075, 0.0006, 0.00065], radial, C.stalkA, C.stalkB);
    if (awl) {
      // a pair of awl-shaped bracts under the two flowers
      for (const way of [-1, 1]) {
        stand(end, s.dir.clone().addScaledVector(s.side, way * 1.3).addScaledVector(AY, -0.2), 1, 0);
        mg.add(awl, m, WHITE, end, -1);
      }
    }
    for (const way of [-1, 1]) {
      const n = k * 2 + (way > 0 ? 1 : 0);
      // the two flowers of a stalk stand apart, each on its own ovary
      const dir = s.dir
        .clone()
        .addScaledVector(s.side, way * (0.42 + 0.14 * rng.f()))
        .addScaledVector(AY, 0.1 + 0.2 * rng.f())
        .normalize();
      const base = end.clone().addScaledVector(s.side, way * 0.0009).addScaledVector(dir, 0.0022);
      if (seat) {
        stand(base, dir, 1, 0);
        mg.add(seat, m, WHITE, base, -1);
      }
      const size = 0.92 + 0.16 * rng.f();
      const tone = 0.93 + 0.14 * rng.f();
      const order = clamp(s.order * 0.75 + 0.07 * rng.f() + (way > 0 ? 0.03 : 0), 0, 0.85);
      if (inBud) {
        // A bud is a shape of its own that the program cannot turn into an open flower. It is full grown by the
        // middle of the opening and goes in the middle of the fall, so that the last of a cluster to be seen is a flower.
        stand(base, dir, size * (0.82 + 0.18 * (1 - s.order)), (rng.f() - 0.5) * 0.5);
        mg.add(bud, m, [tone, tone, tone], base, clamp(0.5 + 0.1 * (rng.f() - 0.5), 0.42, 0.6));
      } else {
        // the first to open have turned by the time the last do
        const kind = s.order < 0.15 && hash2(variant + 13, n) < 0.55 ? 2 : n % 2;
        stand(base, dir, size, (rng.f() - 0.5) * 0.5);
        mg.add(corollaOf(lod, kind), m, [tone, tone, tone], base, order);
      }
    }
  });
  const g = mg.build();
  g.userData = { flowers, stalks: stalks.length };
  g.boundingSphere = new THREE.Sphere(new V3(0, CLUSTER_WIDTH * 0.3, 0), CLUSTER_WIDTH * 0.8);
  return g;
}

// ---------------------------------------------------------------------------
// Berries. All lengths in metres.
// ---------------------------------------------------------------------------
/** Flora of China: berries ovoid, 6 to 7 mm through. */
const BERRY = mid(characterRange(morphology, 'fruit.berryDiameterM'));
/** Berries to a cluster, counted on photographs. */
const BERRY_COUNT = characterRange(morphology, 'fruit.berriesPerCluster');
/** The width of the cluster the fruit model is authored at: what the growth model's fruit.lengthM measures. */
const FRUIT_WIDTH = mid(characterRange(morphology, 'fruit.clusterWidthM'));
const FRUIT_BERRIES: readonly number[] = [BERRY_COUNT[0], BERRY_COUNT[0] + 2, BERRY_COUNT[1] - 2, BERRY_COUNT[1]];
const FRUIT_LODS = 3;

// Unripe colours, linear. The ripe colour of a point is taken from the green of its unripe one (FruitAsset.ripeShade),
// so the bloom is painted here in green: 0.20 where it has rubbed off, 0.34 where it lies thick.
const BERRY_BARE: RGB = [0.12, 0.2, 0.09];
const BERRY_BLOOM: RGB = [0.26, 0.34, 0.24];
const FRUIT_STALK: RGB = [0.2, 0.2, 0.1];
const FRUIT_CALYX: RGB = [0.17, 0.22, 0.17];

const BERRY_SEGS: readonly Segs[] = [
  [14, 10],
  [6, 4],
  [4, 2],
];
/** One berry from its foot along +Z: ovoid, widest below the middle, the calyx a small crown at its tip. */
function berry(lod: number, seed: number): THREE.BufferGeometry {
  const sb = new Surf();
  const [nu, nv] = BERRY_SEGS[lod]!;
  const length = BERRY * 1.12;
  sb.surf(nu, nv, (u, v) => {
    const th = u * TAU;
    const r = (BERRY / 2) * Math.pow(Math.sin(Math.PI * Math.pow(clamp(v, 0, 1), 0.86)), 0.6);
    // the bloom lies unevenly, and is rubbed where berries touch
    const lies = clamp(0.62 + 0.3 * Math.sin(th * 2 + seed) * Math.sin(v * 4.4 + seed * 0.7) + 0.2 * (hash2(seed, Math.round(u * nu) * 31 + Math.round(v * nv)) - 0.5), 0, 1);
    return { p: [Math.cos(th) * r, Math.sin(th) * r, length * v], c: mix(BERRY_BARE, BERRY_BLOOM, lies) };
  });
  if (lod === 0) {
    sb.surf(10, 1, (u, v) => {
      const th = u * TAU;
      const tooth = 0.5 + 0.5 * Math.cos(5 * th);
      const r = 0.0006 + 0.0004 * v;
      return { p: [Math.cos(th) * r, Math.sin(th) * r, length - 0.0003 + v * (0.0003 + 0.0008 * tooth)], c: FRUIT_CALYX };
    });
  }
  return sb.build();
}

function makeBerriesGeometry(variant: number, lod: number): THREE.BufferGeometry {
  const berries = FRUIT_BERRIES[variant]!;
  // in fruit the stalks are seen short, the berries crowded together
  const stalks = stalksOf(berries / 2, variant + 40, PAIR_STALK[1] * 0.3);
  const rng = new RNG(1300 + variant * 31);
  const mg = new Merge(false);
  const radial = [5, 4, 3][lod]!;
  const top = stalks.reduce((y, s) => Math.max(y, s.foot.y), 0);
  mg.tube([new V3(0, 0, 0), new V3(0, top * 0.55, 0), new V3(0, top, 0)], [0.0014, 0.0012, 0.0009], radial, FRUIT_STALK, FRUIT_STALK);
  const shapes = [berry(lod, 1), berry(lod, 2)];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const from = new V3(0, 0, 1);
  stalks.forEach((s) => {
    const end = s.foot.clone().addScaledVector(s.dir, s.length);
    mg.tube([s.foot, end], [0.0006, 0.0006], radial, FRUIT_STALK, FRUIT_STALK);
    for (const way of [-1, 1]) {
      const dir = s.dir
        .clone()
        .addScaledVector(s.side, way * (0.5 + 0.2 * rng.f()))
        .addScaledVector(AY, 0.25 * (rng.f() - 0.3))
        .normalize();
      const base = end.clone().addScaledVector(s.side, way * BERRY * 0.12);
      // one of a pair is often the smaller
      const size = (way > 0 ? 0.8 + 0.2 * rng.f() : 0.93 + 0.12 * rng.f()) * (0.94 + 0.06 * (1 - s.order));
      q.setFromUnitVectors(from, dir).multiply(new THREE.Quaternion().setFromAxisAngle(from, rng.f() * TAU));
      m.compose(base, q, new V3(size, size, size));
      mg.add(shapes[rng.int(0, 1)]!, m, WHITE, base, 0);
    }
  });
  const g = mg.build();
  g.userData = { berries };
  g.boundingSphere = new THREE.Sphere(new V3(0, FRUIT_WIDTH * 0.3, 0), FRUIT_WIDTH);
  return g;
}

// ---------------------------------------------------------------------------
// The look
// ---------------------------------------------------------------------------
const leaf: LeafAsset = {
  key: 'lonicera-henryi/leaf',
  variants: LEAF_VARIANTS,
  lods: LEAF_LODS,
  make: makeLeafGeometry,
  budget: [1500, 200, 32],
  // the larger the leaf the broader it is for its length (Bean's smallest and largest), in either posture
  pick: (lengthM, r) => {
    const size = clamp((lengthM - LEAF_LENGTH[0]) / (LEAF_LENGTH[1] - LEAF_LENGTH[0]), 0, 1);
    const x = 0.6 * size + 0.4 * r;
    const form = x < 0.36 ? 0 : x < 0.68 ? 1 : 2;
    return form + LEAF_FORMS.length * (Math.floor(r * 977) % LEAF_POSTURES.length);
  },
  // dark and glossy all year (Bean; RHS); new leaves flushed with bronze (Gardens Illustrated). An evergreen leaf is
  // never turned by the engine, so the autumn colours are its greens again.
  palette: { greenA: [0.04, 0.105, 0.022], greenB: [0.062, 0.15, 0.032], young: [0.17, 0.165, 0.05], autumnA: [0.062, 0.15, 0.032], autumnB: [0.04, 0.105, 0.022] },
  roughness: 0.45,
  // leathery: less light comes through than through a thin leaf
  translucency: 0.3,
  detailReach: 0.6,
};

const cluster: FlowerAsset = {
  key: 'lonicera-henryi/cluster',
  variants: CLUSTER_FLOWERS.length,
  lods: CLUSTER_LODS,
  make: makeClusterGeometry,
  budget: [9000, 1400, 300],
  // most clusters have eight or ten flowers
  pick: (r) => (r < 0.15 ? 0 : r < 0.5 ? 1 : r < 0.85 ? 2 : 3),
  authoredSize: CLUSTER_WIDTH,
  poise: 'held',
  centreAlong: 0.3,
  // young buds are greenish cream before they flush
  budTint: [0.86, 1, 0.74],
  swing: 0.25,
  translucency: 0.25,
  sheen: 0.02,
  detailAt: [1.1, 3.2],
  detailCaps: [40, 400],
};

const berries: FruitAsset = {
  key: 'lonicera-henryi/berries',
  variants: FRUIT_BERRIES.length,
  lods: FRUIT_LODS,
  make: makeBerriesGeometry,
  budget: [3300, 620, 210],
  pick: (r) => (r < 0.2 ? 0 : r < 0.55 ? 1 : r < 0.85 ? 2 : 3),
  authoredSize: FRUIT_WIDTH,
  poise: 'held',
  centreAlong: 0.4,
  // blue-black under a bloom (Flora of China): slate where the bloom lies, near black where it has rubbed off
  ripe: [0.06, 0.066, 0.1],
  ripeShade: [-1.064, 6.07],
  roughness: 0.55,
  swing: 0.2,
  detailAt: [0.9, 2.6],
  detailCaps: [40, 300],
};

/**
 * Shoots red-bronze within weeks (the growing tip itself is green and bristly,
 * which is not drawn), then pale brown; old bark light brown, shredding in
 * long papery strips (NC State; Kwantlen; a photograph of old stems in the
 * Botanischer Garten Berlin-Dahlem). The ages are choices.
 */
const wood: WoodLook = {
  young: lin('#8e4d3c'),
  mature: lin('#a27a54'),
  old: [0.92, 0.79, 0.62],
  woodyDays: [45, 210],
  oldDays: [330, 1150],
  furrowDays: [400, 1600],
  furrow: 0.3,
  stiffDays: [40, 300],
  relief: 3.4,
  roughness: 0.95,
  // many long, straight, narrow shreds
  grain: { streaks: 760, width: 2.4, wobble: 5 },
};

export const look: TaxonLook = {
  taxonId: 'lonicera-henryi',
  provisional: false,
  leaves: { default: leaf },
  flowers: { default: cluster },
  fruits: { default: berries },
  // a twiner: it holds on with its stems, and has no tendrils, rootlets or prickles (Info Flora)
  appendages: {},
  wood,
};
