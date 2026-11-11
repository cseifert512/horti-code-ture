// Wisteria sinensis (Chinese wisteria).
//
// The organ models are ported from the Wisteria prototype (Wisteria/src/parts.js)
// and are the standard the other taxa are to be brought up to.
//
//   raceme   a whole pendulous inflorescence (rachis, about sixty papilionaceous
//            flowers, the tip still in bud), hanging along -Y from the origin,
//            in metres: 0.26 m as authored, scaled to the length in the data
//   leaf     a whole odd-pinnate leaf (rachis and 9, 11 or 13 leaflets). By the
//            prototype's convention one unit is the rachis, and the end leaflet
//            reaches past it; every other taxon's leaf is one unit over all
//   pod      a pair of velvety legumes on a stalk, constricted between the
//            seeds, 0.125 m as authored
//   wood     green shoot, then smooth brown, then grey fissured bark, the
//            trunk fluted with age
//
// Whole organs are instanced (not single flowers), so one instance carries one
// organ's life history and the level of detail can be chosen per organ.
//
// These shapes and colours are Wisteria sinensis's. No other taxon module may
// import this one (project rule: mechanism traits do not transfer, and neither
// do looks).
import * as THREE from 'three';
import { characterNumber, parseMorphology } from '@horti/core';
import morphologyJson from '../../../../../species/wisteria-sinensis/morphology.json';
import { RNG, lerp, smoothstep } from '../../util.ts';
import { Merge, Surf, lin, mix } from '../kit.ts';
import { type FlowerAsset, type FruitAsset, type LeafAsset, THIN_LEAF, type TaxonLook, type WoodLook } from '../look.ts';

/**
 * What floras record of the shape of this plant's parts, each number with its
 * source and evidence status: species/wisteria-sinensis/morphology.json. A
 * count or a size of the real plant is read from there and not typed in here;
 * asking for a character the file does not have stops the module from
 * loading, with the key named.
 */
const morphology = parseMorphology(morphologyJson, 'species/wisteria-sinensis/morphology.json');

const TAU = Math.PI * 2;
const V3 = THREE.Vector3;
type V3 = THREE.Vector3;
/** Segment counts of a parametric surface: [nu, nv]. */
type Segs = [number, number];

// ---------------------------------------------------------------------------
// Flower (papilionaceous). +Z forward along the keel, +Y to the standard.
// 1 unit ~ width of the standard, ~22 mm in life. Origin = pedicel base.
// ---------------------------------------------------------------------------
const FLOWER_SIZE = 0.0225;
const PEDICEL = 0.95;

const C = {
  lilac: lin('#d0bdf0'),
  lilacEdge: lin('#b096e0'),
  white: lin('#fbf8ff'),
  yellow: lin('#ebe067'),
  wing: lin('#a285d6'),
  wingTip: lin('#8a66c8'),
  keel: lin('#7d58b8'),
  calyxA: lin('#7d8455'),
  calyxB: lin('#6d5a86'),
  pedA: lin('#9aa56c'),
  pedB: lin('#8a7fa0'),
  budDeep: lin('#8460c0'),
  budTip: lin('#a48edc'),
};

/** Segment counts of each flower part at one LOD; null = part omitted. */
interface FlowerSegs {
  bn: Segs;
  wing: Segs | null;
  keel: Segs | null;
  cal: Segs | null;
  ped: Segs | null;
}

const FLOWER_SEGS: FlowerSegs[] = [
  { bn: [9, 9], wing: [6, 3], keel: [6, 4], cal: [10, 3], ped: [5, 3] },
  { bn: [5, 4], wing: [3, 2], keel: [3, 2], cal: [5, 1], ped: [3, 1] },
  { bn: [2, 2], wing: [2, 1], keel: null, cal: null, ped: [3, 1] },
  { bn: [1, 2], wing: null, keel: [1, 2], cal: null, ped: null },
];

// spine of the standard: rises, then reflexes back over the calyx
const SPINE = (() => {
  const n = 32;
  const y: number[] = [0.04];
  const z: number[] = [PEDICEL + 0.2];
  const a: number[] = [];
  const Hb = 0.92;
  for (let j = 0; j <= n; j++) {
    const v = j / n;
    a.push(THREE.MathUtils.degToRad(48 + 88 * (v * v * (3 - 2 * v))));
    if (j > 0) {
      const am = (a[j]! + a[j - 1]!) / 2;
      y.push(y[j - 1]! + (Math.sin(am) * Hb) / n);
      z.push(z[j - 1]! + (Math.cos(am) * Hb) / n);
    }
  }
  return (v: number): { y: number; z: number; a: number } => {
    const x = Math.min(n - 1e-6, Math.max(0, v * n));
    const i = Math.floor(x);
    const t = x - i;
    return { y: lerp(y[i]!, y[i + 1]!, t), z: lerp(z[i]!, z[i + 1]!, t), a: lerp(a[i]!, a[i + 1]!, t) };
  };
})();

function makeFlower(lod: number): THREE.BufferGeometry {
  const sb = new Surf();
  const seg = FLOWER_SEGS[lod]!;
  const Z0 = PEDICEL;
  const fine = lod === 0;

  // standard (banner)
  sb.surf(seg.bn[0], seg.bn[1], (u01, v) => {
    const u = u01 * 2 - 1;
    const sp = SPINE(v);
    const hw =
      0.56 * Math.pow(Math.max(0, 1 - Math.pow(2 * v - 1.02, 2)), 0.55) * (0.25 + 0.75 * Math.min(1, v * 3.2));
    const x = u * hw;
    let off = (0.22 * (1 - v) * (1 - v) - 0.16 * v) * u * u;
    if (fine) {
      off -= 0.035 * Math.exp(-Math.pow(u / 0.16, 2)) * (1 - v * 0.6); // median crease
      off += 0.018 * Math.sin(u * 9 + v * 6) * v * Math.abs(u); // ruffled margin
      // the two callosities at the base of the blotch
      off += 0.03 * Math.exp(-(Math.pow((Math.abs(u) * hw - 0.07) / 0.035, 2) + Math.pow((v - 0.14) / 0.06, 2)));
    }
    const notch = v > 0.8 ? -0.07 * (1 - Math.abs(u)) * ((v - 0.8) / 0.2) : 0;
    const dy = Math.sin(sp.a);
    const dz = Math.cos(sp.a);
    const py = sp.y - dz * off + dy * notch;
    const pz = sp.z + dy * off + dz * notch;
    const edge = Math.pow(Math.abs(u), 2.5) * 0.7 + (v > 0.7 ? (v - 0.7) * 0.8 : 0);
    let c = mix(C.lilac, C.lilacEdge, Math.min(1, edge));
    const bw = Math.exp(-((x * x) / 0.035 + Math.pow(v - 0.3, 2) / 0.045));
    c = mix(c, C.white, Math.min(1, bw * 1.25));
    const by = Math.exp(-((x * x) / 0.008 + Math.pow(v - 0.2, 2) / 0.012));
    c = mix(c, C.yellow, Math.min(1, by * 1.2));
    if (lod === 3) c = mix(C.lilac, C.white, 0.22);
    return { p: [x, py, pz], c };
  });

  // wings
  if (seg.wing) {
    for (const side of [-1, 1]) {
      sb.surf(seg.wing[0], seg.wing[1], (s, t01) => {
        const t = t01 * 2 - 1;
        const hh = 0.19 * Math.pow(Math.sin(Math.PI * Math.pow(s * 0.9 + 0.05, 1.25)), 0.75);
        const z = Z0 + 0.18 + 0.74 * s;
        let y = -0.03 - 0.07 * s + t * hh;
        if (fine) y += 0.035 * Math.exp(-Math.pow((s - 0.12) / 0.08, 2)) * (t > 0 ? 1 : 0); // auricle
        const x = side * (0.07 + 0.1 * Math.sin(Math.PI * s * 0.85)) * (1 - 0.4 * t * t);
        return { p: [x, y, z], c: mix(C.wing, C.wingTip, s) };
      });
    }
  }

  // keel
  if (seg.keel) {
    const big = lod === 3 ? 1.7 : 1;
    sb.surf(seg.keel[0], seg.keel[1], (s, t01) => {
      const t = t01 * 2 - 1;
      const depth = 0.15 * big * Math.sin(Math.PI * (0.1 + 0.8 * s));
      const z = Z0 + 0.18 + (lod === 3 ? 0.74 : 0.62) * s;
      const y = -0.03 + 0.12 * s * s - depth * (1 - Math.abs(t)) + (lod === 3 ? 0.12 : 0);
      const x = 0.055 * big * 1.6 * t * Math.sin(Math.PI * (0.1 + 0.85 * s));
      return { p: [x, y, z], c: lod === 3 ? C.wing : C.keel };
    });
  }

  // calyx: campanulate, five short teeth
  if (seg.cal) {
    sb.surf(seg.cal[0], seg.cal[1], (u, v) => {
      const th = u * TAU;
      const r = 0.03 + 0.11 * Math.pow(v, 0.6);
      const teeth = fine ? 0.05 * Math.max(0, Math.cos(5 * th)) * v * v : 0;
      return {
        p: [Math.cos(th) * r, Math.sin(th) * r * 0.95, Z0 - 0.03 + (0.27 + teeth) * v],
        c: mix(C.calyxA, C.calyxB, v),
      };
    });
  }

  // pedicel
  if (seg.ped) {
    sb.surf(seg.ped[0], seg.ped[1], (u, v) => {
      const th = u * TAU;
      const r = fine ? 0.016 : 0.02;
      const sag = fine ? -0.05 * Math.sin(Math.PI * v) : 0;
      return { p: [Math.cos(th) * r, Math.sin(th) * r + sag, Z0 * v], c: mix(C.pedA, C.pedB, v) };
    });
  }
  return sb.build();
}

/** [nu, nv, np]: bud body segments and pedicel radial segments (0 = no pedicel). */
const BUD_SEGS: [number, number, number][] = [
  [8, 6, 4],
  [5, 4, 3],
  [3, 2, 0],
  [2, 1, 0],
];
function makeBud(lod: number): THREE.BufferGeometry {
  const sb = new Surf();
  const [nu, nv, np] = BUD_SEGS[lod]!;
  const Z0 = PEDICEL * 0.8;
  sb.surf(nu, nv, (u, v) => {
    const th = u * TAU;
    const r = 0.15 * Math.pow(Math.sin(Math.PI * Math.pow(v, 0.75) * 0.97 + 0.03), 0.8);
    const c = v < 0.3 ? mix(C.calyxB, C.budDeep, v / 0.3) : mix(C.budDeep, C.budTip, (v - 0.3) / 0.7);
    return { p: [Math.cos(th) * r * 0.8, Math.sin(th) * r + 0.1 * v * v, Z0 + 0.62 * v], c };
  });
  if (np) {
    sb.surf(np, 1, (u, v) => {
      const th = u * TAU;
      return { p: [Math.cos(th) * 0.02, Math.sin(th) * 0.02, Z0 * v], c: mix(C.pedA, C.pedB, v) };
    });
  }
  return sb.build();
}

// ---------------------------------------------------------------------------
// Raceme
// ---------------------------------------------------------------------------
const RACEME_LEN = 0.26; // nominal; instances scale 0.78-1.3 => 20-34 cm
const RACEME_VARIANTS = 4;
const RACEME_LODS = 4;

const flowerCache: THREE.BufferGeometry[] = [];
const budCache: THREE.BufferGeometry[] = [];

function makeRacemeGeometry(variant: number, lod: number): THREE.BufferGeometry {
  flowerCache[lod] ??= makeFlower(lod);
  budCache[lod] ??= makeBud(lod);
  const rng = new RNG(1000 + variant * 17);
  const mg = new Merge(false);
  const bendA = rng.range(0, TAU);
  const bend = rng.range(0.004, 0.03);
  const at = (f: number, out: V3 = new V3()): V3 =>
    out.set(Math.cos(bendA) * bend * Math.sin(f * 2.2), -f * RACEME_LEN, Math.sin(bendA) * bend * Math.sin(f * 2.2));

  // rachis
  const NS = [16, 10, 5, 3][lod]!;
  const pts: V3[] = [];
  const radii: number[] = [];
  for (let i = 0; i <= NS; i++) {
    pts.push(at(i / NS));
    radii.push(lerp(0.0024, 0.0007, i / NS));
  }
  mg.tube(pts, radii, [6, 5, 4, 3][lod]!, lin('#a9b47a'), lin('#9a86b8'));

  // flowers, spiralled on, opening from the base; the tip stays in bud
  const n = 60 + rng.int(-5, 8);
  const phi0 = rng.range(0, TAU);
  const budStart = rng.range(0.82, 0.9);
  const m = new THREE.Matrix4();
  const m2 = new THREE.Matrix4();
  const X = new V3();
  const Y = new V3();
  const Z = new V3();
  const T = new V3();
  const U = new V3();
  const W = new V3();
  const p = new V3();
  const q = new V3();
  const UP = new V3(0, 1, 0);
  const scl = new V3();
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    const s = 0.17 + 0.83 * Math.pow(f, 0.92);
    at(s, p);
    T.subVectors(at(s + 0.01, q), p).normalize();
    U.crossVectors(T, new V3(1, 0, 0)).normalize();
    W.crossVectors(T, U);
    const phi = phi0 + i * 2.39996 + rng.range(-0.25, 0.25);
    Z.copy(U).multiplyScalar(Math.cos(phi)).addScaledVector(W, Math.sin(phi));
    Z.addScaledVector(T, rng.range(-0.1, 0.4)).normalize();
    Y.copy(UP).addScaledVector(Z, -UP.dot(Z)).normalize();
    X.crossVectors(Y, Z);
    m.makeBasis(X, Y, Z);
    m2.makeRotationZ(rng.range(-0.4, 0.4));
    m.multiply(m2);
    const isBud = f > budStart;
    const jitter = rng.range(0.9, 1.1);
    const size = isBud
      ? FLOWER_SIZE * lerp(0.85, 0.3, (f - budStart) / (1 - budStart)) * jitter
      : FLOWER_SIZE * (1.05 - 0.22 * f) * jitter;
    m.scale(scl.set(size, size, size));
    m.setPosition(p);
    const k = lerp(1.1, 0.88, f) * rng.range(0.93, 1.07);
    const warm = rng.range(-0.03, 0.03);
    mg.add(isBud ? budCache[lod]! : flowerCache[lod]!, m, [k * (1 + warm), k, k * (1 - warm)], p, f);
  }
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, -RACEME_LEN / 2, 0), RACEME_LEN);
  return g;
}

// ---------------------------------------------------------------------------
// Compound leaf
// ---------------------------------------------------------------------------
/** The usual number of leaflets (Bean: "consisting usually of eleven leaflets"), from the morphology file. */
const USUAL_LEAFLETS = characterNumber(morphology, 'leaf.leafletCount');
/** Leaflets per variant: the usual number, and a leaf with one pair fewer and one with one pair more. */
const LEAF_VARIANTS: readonly number[] = [USUAL_LEAFLETS - 2, USUAL_LEAFLETS, USUAL_LEAFLETS + 2];
const LEAF_LODS = 3;
const LEAF_K = 0.28; // rachis arch: p(t) = (0, -K t^2, t)

const LEAFLET_SEGS: Segs[] = [
  [6, 10],
  [2, 4],
  [2, 2],
];

function makeLeaflet(lod: number): THREE.BufferGeometry {
  const sb = new Surf();
  const [nu, nv] = LEAFLET_SEGS[lod]!;
  sb.surf(nu, nv, (u01, v) => {
    const u = u01 * 2 - 1;
    const f = Math.pow(v, 0.55) * Math.pow(1 - v, 0.85);
    const hw = 0.2 * (f / 0.392) * (1 + 0.06 * u * (1 - v)) + 0.004; // slightly oblique base
    const x = u * hw;
    const z = 0.05 + 0.95 * v;
    let y = 0.22 * Math.abs(x) - 0.14 * v * v;
    if (lod === 0) {
      y += 0.03 * Math.sin(v * 15 + u * 1.5) * u * u; // undulate margin
      y += 0.006 * Math.cos(v * 34) * (1 - Math.abs(u)) * Math.abs(u) * 4; // relief between veins
    } else if (lod === 1) {
      y += 0.02 * Math.sin(v * 15) * u * u;
    }
    return { p: [x, y, z] };
  });
  if (lod === 0) {
    sb.surf(4, 1, (u, v) => {
      const th = u * TAU;
      return { p: [Math.cos(th) * 0.012, Math.sin(th) * 0.012, v * 0.06] };
    });
    // keep the petiolule on the pale midrib of the texture
    const uv = sb.uv;
    for (let i = uv.length - 20; i < uv.length; i += 2) {
      uv[i] = 0.5;
      uv[i + 1] = 0.02;
    }
  }
  return sb.build();
}

const leafletCache: THREE.BufferGeometry[] = [];
function makeLeafGeometry(variant: number, lod: number): THREE.BufferGeometry {
  leafletCache[lod] ??= makeLeaflet(lod);
  const nLeaflets = LEAF_VARIANTS[variant]!;
  const rng = new RNG(500 + variant * 31);
  const mg = new Merge(true);
  const NS = [10, 4, 2][lod]!;
  const pts: V3[] = [];
  const radii: number[] = [];
  for (let i = 0; i <= NS; i++) {
    const t = i / NS;
    pts.push(new V3(0, -LEAF_K * t * t, t));
    radii.push(0.011 * (1 - 0.7 * t) + (i === 0 ? 0.006 : 0));
  }
  mg.tube(pts, radii, [6, 4, 3][lod]!, [1, 1, 1], [1, 1, 1], [0.5, 0.02]);

  const AX = new V3(1, 0, 0);
  const AY = new V3(0, 1, 0);
  const AZ = new V3(0, 0, 1);
  const q = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const m = new THREE.Matrix4();
  const pos = new V3();
  const scl = new V3();
  const nPairs = (nLeaflets - 1) / 2;
  const put = (t: number, side: number, sizeK: number): void => {
    pos.set(0, -LEAF_K * t * t, t);
    q.setFromAxisAngle(AX, Math.atan(2 * LEAF_K * t));
    q2.setFromAxisAngle(AY, side !== 0 ? side * (Math.PI / 2 - rng.range(0.3, 0.6)) : rng.range(-0.15, 0.15));
    q.multiply(q2);
    q2.setFromAxisAngle(AX, rng.range(0.1, 0.45));
    q.multiply(q2);
    q2.setFromAxisAngle(AZ, rng.range(-0.3, 0.3) - side * 0.15);
    q.multiply(q2);
    const s = 0.3 * sizeK * rng.range(0.9, 1.1);
    m.compose(pos, q, scl.set(s, s, s));
    const v = rng.range(0.9, 1.1);
    mg.add(leafletCache[lod]!, m, [v, v, v], pos, rng.f());
  };
  for (let i = 0; i < nPairs; i++) {
    const u = i / (nPairs - 1);
    const t = lerp(0.28, 0.9, u);
    const sizeK = lerp(0.72, 1, smoothstep(0, 0.5, u)) * lerp(1, 0.9, smoothstep(0.6, 1, u));
    put(t, -1, sizeK);
    put(t, 1, sizeK);
  }
  put(1, 0, 1.08);
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, 0, 0.5), 0.8);
  return g;
}

// ---------------------------------------------------------------------------
// Seed pods: flattened, velvety, constricted between the seeds, 10-15 cm.
// ---------------------------------------------------------------------------
/** The length the pods are authored at; an instance is scaled to the length in the data. */
const POD_LEN = 0.125;

function makePodGeometry(): THREE.BufferGeometry {
  const mg = new Merge(false);
  const green = lin('#8d9a6a');
  const pod = (() => {
    const sb = new Surf();
    sb.surf(8, 12, (u, v) => {
      const th = u * TAU;
      const prof = Math.pow(Math.sin(Math.PI * Math.pow(v, 0.8)), 0.6);
      const seeds = 1 + 0.22 * Math.pow(Math.sin(v * Math.PI * 4.2), 2);
      const w = 0.011 * prof * seeds * (0.55 + 0.6 * v);
      return {
        p: [Math.cos(th) * w, -v * 0.125, Math.sin(th) * w * 0.42 + 0.012 * Math.sin(v * 2.4)],
        c: mix(green, lin('#a7ad84'), 0.5 + 0.5 * Math.cos(th * 2)),
      };
    });
    return sb.build();
  })();
  const stalk = [new V3(0, 0, 0), new V3(0.004, -0.03, 0), new V3(0, -0.06, 0.004)];
  mg.tube(stalk, [0.002, 0.0018, 0.0016], 4, lin('#9a9a72'), lin('#8f8f6a'));
  const m = new THREE.Matrix4();
  const e = new THREE.Euler();
  // x, y, z, rx, ry, rz, scale
  const configs: [number, number, number, number, number, number, number][] = [
    [0, -0.058, 0.004, 0.12, 0.3, 0.05, 1],
    [0.003, -0.035, 0, -0.2, 2.4, -0.1, 0.82],
  ];
  for (const [x, y, z, rx, ry, rz, s] of configs) {
    m.makeRotationFromEuler(e.set(rx, ry, rz));
    m.scale(new V3(s, s, s));
    m.setPosition(x, y, z);
    mg.add(pod, m, [1, 1, 1], new V3(x, y, z), 0);
  }
  return mg.build();
}

// ---------------------------------------------------------------------------
// The look
// ---------------------------------------------------------------------------
const leaf: LeafAsset = {
  key: 'wisteria-sinensis/leaf',
  variants: LEAF_VARIANTS.length,
  lods: LEAF_LODS,
  make: makeLeafGeometry,
  budget: [1800, 250, 120],
  // short leaves and one in five of the rest have nine leaflets; most have eleven
  pick: (lengthM, r) => (lengthM < 0.1 || r < 0.2 ? 0 : r < 0.8 ? 1 : 2),
  palette: { greenA: [0.145, 0.3, 0.05], greenB: [0.19, 0.36, 0.065], young: [0.4, 0.27, 0.085], autumnA: [0.8, 0.56, 0.05], autumnB: [0.62, 0.36, 0.06] },
  roughness: 0.5,
  translucency: THIN_LEAF,
  detailReach: 1,
};

const raceme: FlowerAsset = {
  key: 'wisteria-sinensis/raceme',
  variants: RACEME_VARIANTS,
  lods: RACEME_LODS,
  make: makeRacemeGeometry,
  budget: [22500, 5800, 1420, 520],
  pick: (r) => Math.floor(r * RACEME_VARIANTS),
  authoredSize: RACEME_LEN,
  poise: 'hangs',
  centreAlong: 0.5,
  budTint: [0.62, 0.55, 0.86],
  swing: 0.6,
  translucency: 0.3,
  sheen: 0.1,
  detailAt: [1.3, 3.2, 6.5],
  detailCaps: [26, 130, 800],
};

const pod: FruitAsset = {
  key: 'wisteria-sinensis/pod',
  variants: 1,
  lods: 1,
  make: () => makePodGeometry(),
  budget: [400],
  pick: () => 0,
  authoredSize: POD_LEN,
  poise: 'hangs',
  centreAlong: 0.5,
  // green and velvety, drying to brown
  ripe: [0.2, 0.145, 0.085],
  ripeShade: [0.6, 2],
  roughness: 0.9,
  swing: 0.6,
  detailAt: [],
  detailCaps: [],
};

/**
 * How Wisteria sinensis wood looks as it ages: green shoot, smooth brown, grey
 * fissured bark. The ages are the prototype's (0.3 to 1.2, 1.5 to 5.5, 0.8 to
 * 5 and 0.15 to 1.6 growing seasons), in days.
 */
const wood: WoodLook = {
  young: [0.21, 0.3, 0.085],
  mature: [0.3, 0.2, 0.115],
  old: [0.8, 0.76, 0.71],
  woodyDays: [110, 440],
  oldDays: [550, 2000],
  furrowDays: [290, 1825],
  furrow: 1,
  stiffDays: [55, 585],
  relief: 3,
  roughness: 0.94,
};

export const look: TaxonLook = {
  taxonId: 'wisteria-sinensis',
  provisional: false,
  leaves: { default: leaf },
  flowers: { default: raceme },
  fruits: { default: pod },
  // a twiner: it holds on with its stems, and has no tendrils, rootlets or prickles
  appendages: {},
  wood,
};
