// Tools for building organ models. They are geometry only, and they belong to
// no taxon. What makes a leaf a rose leaf or an ivy leaf is the shape a taxon's
// own module (taxa/<id>.ts) asks for, and no module borrows another's.
//
//   Surf, Merge          the two mesh builders everything is made with
//   lin, mix             colours
//   blade, palmateBlade  leaf blades
//   stalk, simpleLeaf, compoundLeaf   whole leaves
//   stamens, across      parts of flowers
//   lathe                bodies of revolution: berries, hips, urns, tubes
//   path, coilPath, tendrilPath, rootlets, prickle   what a plant holds on with
//   triangles            for checking a model against its budget
//
// Frames. A LEAF model has its origin where the leaf joins the stem, +Z along
// it, +Y its upper side, and is one unit long, so that the length in the
// render data is the length drawn. An APPENDAGE model is the same: origin on
// the stem, +Z the way it reaches, one unit long. A FLOWER or FRUIT model has
// its origin where it is attached and either hangs along -Y or stands along
// +Y (see Poise in look.ts). TAXON_LOOKS.md says more.
import * as THREE from 'three';
import { RNG, hash2 } from '../util.ts';

const V3 = THREE.Vector3;
type V3 = THREE.Vector3;
const TAU = Math.PI * 2;

/** Linear-space colour triple. */
export type RGB = [number, number, number];
/** Point as a plain triple. */
type XYZ = [number, number, number];
type UV = [number, number];

/** One sample of a parametric surface; the colour defaults to white. */
export interface SurfPoint {
  p: XYZ;
  c?: Readonly<RGB>;
}
export type SurfFn = (u: number, v: number) => SurfPoint;

type AnyAttribute = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;

/** A screen colour ('#rrggbb') as linear RGB, which is what vertex colours and palettes are in. */
export const lin = (hex: string): RGB => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};
/** Between two colours: t = 0 gives a, t = 1 gives b. */
export const mix = (a: Readonly<RGB>, b: Readonly<RGB>, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

// ---------------------------------------------------------------------------
// Surf: parametric surfaces. Each call to surf() adds one sheet, a grid of
// (nu + 1) x (nv + 1) points given by a function of u and v in 0 to 1. The
// result has position, colour, uv (u, v) and smooth normals.
// ---------------------------------------------------------------------------
export class Surf {
  pos: number[] = [];
  col: number[] = [];
  uv: number[] = [];
  idx: number[] = [];
  n = 0;

  // fn(u01, v01) -> { p:[x,y,z], c:[r,g,b] }
  surf(nu: number, nv: number, fn: SurfFn): void {
    const base = this.n;
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        const u = i / nu;
        const v = j / nv;
        const o = fn(u, v);
        this.pos.push(o.p[0], o.p[1], o.p[2]);
        const c: Readonly<RGB> = o.c ?? [1, 1, 1];
        this.col.push(c[0], c[1], c[2]);
        this.uv.push(u, v);
      }
    }
    const w = nu + 1;
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const a = base + j * w + i;
        this.idx.push(a, a + 1, a + w, a + 1, a + w + 1, a + w);
      }
    }
    this.n += (nu + 1) * (nv + 1);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return g;
  }
}

// ---------------------------------------------------------------------------
// Merge: bakes transformed copies of small geometries into one, tagging every
// vertex with the part of the organ it belongs to. The organ programs
// (shaders.ts) use the tag to unfold a leaf leaflet by leaflet and to open and
// shed an inflorescence flower by flower.
//   aPart = (pivot xyz, t)   t >= 0: a flower or leaflet. In a leaf t is a
//                            random number for colour variation; in an
//                            inflorescence it is when the flower opens, 0
//                            first and 1 last, and the part scales about the
//                            pivot as it opens and drops.
//                            t <  0: axis (stalk, rachis, stamens), which
//                            stays. tube() tags its rings so.
// ---------------------------------------------------------------------------
export class Merge {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  /** null when the merged geometry carries no texture coordinates */
  uv: number[] | null;
  part: number[] = [];
  idx: number[] = [];
  n = 0;

  /** `withUv` true for a leaf (it is drawn with the leaf texture), false for anything drawn in vertex colours alone. */
  constructor(withUv: boolean) {
    this.uv = withUv ? [] : null;
  }

  add(geo: THREE.BufferGeometry, m: THREE.Matrix4, colorMul: Readonly<RGB>, pivot: V3, t: number): void {
    const p = geo.getAttribute('position');
    const nr = geo.getAttribute('normal');
    const c = geo.getAttribute('color');
    // only read when this merge keeps UVs; every Surf geometry has them
    const uv = geo.getAttribute('uv') as AnyAttribute | undefined;
    const v = new V3();
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m);
      this.pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(nr, i).applyMatrix3(nm).normalize();
      this.nor.push(v.x, v.y, v.z);
      this.col.push(c.getX(i) * colorMul[0], c.getY(i) * colorMul[1], c.getZ(i) * colorMul[2]);
      if (this.uv) this.uv.push(uv!.getX(i), uv!.getY(i));
      this.part.push(pivot.x, pivot.y, pivot.z, t);
    }
    const ix = geo.index!;
    for (let i = 0; i < ix.count; i++) this.idx.push(ix.getX(i) + this.n);
    this.n += p.count;
  }

  // tube along pts; every ring pivots on its own centre
  tube(
    pts: readonly V3[],
    radii: readonly number[],
    radial: number,
    c0: Readonly<RGB>,
    c1: Readonly<RGB>,
    uvAt?: Readonly<UV>,
  ): void {
    const base = this.n;
    const T = new V3();
    const N = new V3();
    const B = new V3();
    const m = pts.length;
    for (let i = 0; i < m; i++) {
      const pt = pts[i]!;
      const rad = radii[i]!;
      T.subVectors(pts[Math.min(m - 1, i + 1)]!, pts[Math.max(0, i - 1)]!).normalize();
      N.set(1, 0, 0);
      if (Math.abs(T.x) > 0.9) N.set(0, 0, 1);
      N.addScaledVector(T, -N.dot(T)).normalize();
      B.crossVectors(T, N);
      const f = i / (m - 1);
      const c = mix(c0, c1, f);
      for (let j = 0; j <= radial; j++) {
        const th = ((j % radial) / radial) * TAU;
        const nx = N.x * Math.cos(th) + B.x * Math.sin(th);
        const ny = N.y * Math.cos(th) + B.y * Math.sin(th);
        const nz = N.z * Math.cos(th) + B.z * Math.sin(th);
        this.pos.push(pt.x + nx * rad, pt.y + ny * rad, pt.z + nz * rad);
        this.nor.push(nx, ny, nz);
        this.col.push(c[0], c[1], c[2]);
        if (this.uv) this.uv.push(uvAt![0], uvAt![1]);
        this.part.push(pt.x, pt.y, pt.z, -1 - f);
      }
    }
    const ring = radial + 1;
    for (let i = 0; i < m - 1; i++) {
      for (let j = 0; j < radial; j++) {
        const a = base + i * ring + j;
        this.idx.push(a, a + 1, a + ring, a + 1, a + ring + 1, a + ring);
      }
    }
    this.n += m * ring;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(this.part, 4));
    g.setIndex(this.idx);
    return g;
  }
}

/** How many triangles a model has: what its budget is counted in. */
export const triangles = (g: THREE.BufferGeometry): number => (g.index ? g.index.count : g.getAttribute('position').count) / 3;

// ---------------------------------------------------------------------------
// Leaves
// ---------------------------------------------------------------------------

/** Segments across and along a surface. */
export type Segs = readonly [number, number];
export const WHITE: RGB = [1, 1, 1];
/** Where a leaf stalk samples the leaf texture: on its pale midrib. */
export const MIDRIB: [number, number] = [0.5, 0.02];

export interface BladeShape {
  /** Half the width at the widest point, as a share of the length. */
  halfWidth: number;
  /** Below 1 the widest point is nearer the base, above 1 nearer the tip. */
  widest: number;
  /** Below 1 a full, blunt outline; above 1 a tapered one. */
  taper: number;
  /** How much the two halves fold up from the midrib. */
  fold: number;
  /** How much the blade arches down towards its tip. */
  arch: number;
  /** Undulation of the margin, on the finest model only. */
  wave?: number;
}

/** A simple blade, base at the origin, tip at z = 1. */
export function blade(shape: BladeShape, [nu, nv]: Segs, fine: boolean): THREE.BufferGeometry {
  const sb = new Surf();
  sb.surf(nu, nv, (u01, v) => {
    const u = u01 * 2 - 1;
    const x = u * (shape.halfWidth * Math.pow(Math.sin(Math.PI * Math.pow(v, shape.widest)), shape.taper) + 0.003);
    let y = shape.fold * Math.abs(x) - shape.arch * v * v;
    if (fine && shape.wave) y += shape.wave * Math.sin(v * 13 + u * 1.4) * u * u;
    return { p: [x, y, v] };
  });
  return sb.build();
}

export interface PalmateShape {
  /** Reach of the blade between its lobes, from its centre. */
  body: number;
  /** Lobes, each a bump on the outline: the angle from the tip (radians, 0 = straight on), how far it reaches beyond the body, and how wide it is. Give both sides. */
  lobes: readonly { angle: number; reach: number; width: number }[];
  /** The notch where the stalk joins: how deep (share of the reach there) and how wide (radians). */
  sinus: { depth: number; width: number };
  fold: number;
  arch: number;
  /** Puckering of the surface between the veins, on the finest model only. */
  pucker?: number;
}

/**
 * A rounded or lobed blade, built as a fan from where the stalk joins. The
 * stalk end is at the origin and the tip of the middle lobe at z = 1.
 */
export function palmateBlade(shape: PalmateShape, [nt, nr]: Segs, fine: boolean): THREE.BufferGeometry {
  const reach = (theta: number) => {
    let r = shape.body;
    for (const l of shape.lobes) r += l.reach * Math.exp(-(((theta - l.angle) / l.width) ** 2));
    return r * (1 - shape.sinus.depth * Math.exp(-(((Math.PI - Math.abs(theta)) / shape.sinus.width) ** 2)));
  };
  // the outline passes through the origin at the notch, and the whole is scaled to unit length
  const back = reach(Math.PI);
  const scale = 1 / (back + reach(0));
  const sb = new Surf();
  sb.surf(nt, nr, (u01, rho) => {
    const theta = (u01 * 2 - 1) * Math.PI;
    const r = rho * reach(theta) * scale;
    const x = r * Math.sin(theta);
    const z = back * scale + r * Math.cos(theta);
    let y = shape.fold * Math.abs(x) - shape.arch * z * z;
    if (fine && shape.pucker) y += shape.pucker * Math.sin(theta * 7) * rho * (1 - rho) * 4;
    return { p: [x, y, z] };
  });
  // lay the texture flat over the blade, stalk to tip, so its midrib runs up the middle lobe
  let widest = 1e-6;
  for (let i = 0; i < sb.pos.length; i += 3) widest = Math.max(widest, Math.abs(sb.pos[i]!));
  for (let i = 0; i < sb.uv.length / 2; i++) {
    sb.uv[2 * i] = 0.5 + (0.5 * sb.pos[3 * i]!) / widest;
    sb.uv[2 * i + 1] = sb.pos[3 * i + 2]!;
  }
  return sb.build();
}

/** A leaf stalk from the origin along +Z, as part of the leaf's axis. Returns its far end. */
export function stalk(mg: Merge, length: number, radius: number, radial: number, droop = 0): THREE.Vector3 {
  const end = new V3(0, -droop, length);
  mg.tube([new V3(0, 0, 0), new V3(0, -droop * 0.3, length * 0.5), end], [radius * 1.3, radius * 1.1, radius], radial, WHITE, WHITE, MIDRIB);
  return end;
}

/** A simple leaf: a stalk, then one blade filling the rest of the unit. */
export function simpleLeaf(bladeGeometry: THREE.BufferGeometry, stalkLength: number, lod: number, variation: number): THREE.BufferGeometry {
  const mg = new Merge(true);
  const from = stalk(mg, stalkLength, 0.012, [5, 4, 3][lod]!);
  const s = 1 - stalkLength;
  mg.add(bladeGeometry, new THREE.Matrix4().compose(from, new THREE.Quaternion(), new V3(s, s, s)), WHITE, from, variation);
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, 0, 0.5), 0.8);
  return g;
}

export interface CompoundLayout {
  /** Where the axis ends, as a share of the unit length; the end leaflet takes the rest. */
  axisEnd: number;
  axisRadius: number;
  /** How much the axis arches down. */
  arch: number;
  /** Leaflets: where on the axis (0 to 1), which side (0 = the end leaflet), and how long. */
  leaflets: readonly { at: number; side: -1 | 0 | 1; length: number }[];
  /** Length of each leaflet's own stalk. */
  stalk: number;
  /** How far a side leaflet points forward of square to the axis, radians. */
  forward: readonly [number, number];
  /** How far the leaflets hang, radians: a range. */
  droop: readonly [number, number];
  seed: number;
}

/** A leaf of leaflets along an axis, each pivoting where it joins. */
export function compoundLeaf(leaflet: THREE.BufferGeometry, layout: CompoundLayout, lod: number): THREE.BufferGeometry {
  const rng = new RNG(layout.seed);
  const mg = new Merge(true);
  const at = (t: number) => new V3(0, -layout.arch * t * t, t * layout.axisEnd);
  const NS = [8, 4, 2][lod]!;
  const radial = [5, 4, 3][lod]!;
  const pts: THREE.Vector3[] = [];
  const radii: number[] = [];
  for (let i = 0; i <= NS; i++) {
    pts.push(at(i / NS));
    radii.push(layout.axisRadius * (1 - 0.4 * (i / NS)));
  }
  mg.tube(pts, radii, radial, WHITE, WHITE, MIDRIB);

  const AX = new V3(1, 0, 0);
  const AY = new V3(0, 1, 0);
  const AZ = new V3(0, 0, 1);
  const q = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const m = new THREE.Matrix4();
  for (const l of layout.leaflets) {
    const from = at(l.at);
    const yaw = l.side === 0 ? rng.range(-0.15, 0.15) : l.side * (Math.PI / 2 - rng.range(layout.forward[0], layout.forward[1]));
    const base = from.clone().add(new V3(Math.sin(yaw) * layout.stalk, -0.01, Math.cos(yaw) * layout.stalk));
    if (lod < 2 && layout.stalk > 0.03) mg.tube([from, base], [layout.axisRadius * 0.8, layout.axisRadius * 0.7], radial, WHITE, WHITE, MIDRIB);
    q.setFromAxisAngle(AY, yaw);
    q.multiply(q2.setFromAxisAngle(AX, rng.range(layout.droop[0], layout.droop[1])));
    q.multiply(q2.setFromAxisAngle(AZ, rng.range(-0.25, 0.25) - l.side * 0.12));
    const s = l.length * rng.range(0.93, 1.07);
    m.compose(base, q, new V3(s, s, s));
    const tone = rng.range(0.9, 1.1);
    mg.add(leaflet, m, [tone, tone, tone], base, rng.f());
  }
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, 0, 0.5), 0.8);
  return g;
}

// ---------------------------------------------------------------------------
// Flowers and fruit
// ---------------------------------------------------------------------------

/**
 * A tuft of stamens round an axis. Tagged as part of the flower's axis, so
 * that it stays when the petals have dropped.
 */
export function stamens(mg: Merge, centre: THREE.Vector3, axis: THREE.Vector3, count: number, length: number, spread: number, radial: number, c0: Readonly<RGB>, c1: Readonly<RGB>, seed: number, thickness = 0.014): void {
  const side = new V3(1, 0, 0);
  if (Math.abs(axis.x) > 0.9) side.set(0, 1, 0);
  side.addScaledVector(axis, -side.dot(axis)).normalize();
  const other = new V3().crossVectors(axis, side);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + hash2(seed, i) * 0.8;
    const tilt = spread * Math.sqrt((i + 0.5) / count);
    const dir = axis
      .clone()
      .multiplyScalar(Math.cos(tilt))
      .addScaledVector(side, Math.sin(tilt) * Math.cos(a))
      .addScaledVector(other, Math.sin(tilt) * Math.sin(a));
    const len = length * (0.75 + 0.5 * hash2(seed + 7, i));
    mg.tube([centre.clone(), centre.clone().addScaledVector(dir, len)], [thickness * 0.85, thickness * 1.15], radial, c0, c1);
  }
}

/** Two unit vectors square to `axis` and to each other. */
export function across(axis: THREE.Vector3): [THREE.Vector3, THREE.Vector3] {
  const a = new V3(1, 0, 0);
  if (Math.abs(axis.x) > 0.9) a.set(0, 0, 1);
  a.addScaledVector(axis, -a.dot(axis)).normalize();
  return [a, new V3().crossVectors(axis, a).normalize()];
}

/**
 * A body of revolution about the Y axis, added to a Surf: a berry, a hip, an
 * urn, a tube. `profile(v)` gives the radius and the height at v, 0 to 1 from
 * one end to the other; `squash` flattens it front to back (1 is round).
 * Turn and place it with Merge.add.
 */
export function lathe(sb: Surf, [around, along]: Segs, profile: (v: number) => readonly [radius: number, y: number], colour: (u: number, v: number) => Readonly<RGB>, squash = 1): void {
  sb.surf(around, along, (u, v) => {
    const th = u * TAU;
    const [r, y] = profile(v);
    return { p: [Math.cos(th) * r, y, Math.sin(th) * r * squash], c: colour(u, v) };
  });
}

// ---------------------------------------------------------------------------
// What a plant holds on with. All are authored along +Z, one unit long.
// ---------------------------------------------------------------------------

/** `n + 1` points along a curve given as a function of 0 to 1: for Merge.tube. */
export function path(n: number, at: (t: number) => THREE.Vector3): THREE.Vector3[] {
  return Array.from({ length: n + 1 }, (_, i) => at(i / n));
}

/**
 * A coil: `turns` turns of `radius` about a line through `centre` along
 * `axis`, starting on the side of `start` and creeping `creep` along the axis
 * with each turn. A hold wrapped round a cable or a lath.
 */
export function coilPath(centre: THREE.Vector3, axis: THREE.Vector3, start: THREE.Vector3, radius: number, turns: number, creep: number, n: number): THREE.Vector3[] {
  const a = axis.clone().normalize();
  const e1 = start.clone().sub(centre);
  e1.addScaledVector(a, -e1.dot(a));
  if (e1.lengthSq() < 1e-12) e1.copy(across(a)[0]);
  e1.normalize();
  const e2 = new V3().crossVectors(a, e1);
  return path(n, (t) => {
    const th = t * turns * TAU;
    return centre
      .clone()
      .addScaledVector(e1, radius * Math.cos(th))
      .addScaledVector(e2, radius * Math.sin(th))
      .addScaledVector(a, creep * turns * t);
  });
}

export interface TendrilShape {
  /** How far it bows upwards (+Y) on its way out, in lengths. */
  bow: number;
  /** Turns of the coil at its end, and the coil's radius in lengths. No turns: a tendril still feeling for a hold, its tip hooked. */
  turns: number;
  coilRadius: number;
  /** How far the coil creeps sideways (+X) with each turn, in lengths. */
  creep: number;
}

/**
 * The centre line of a tendril or a coiled stalk: out from the origin along
 * +Z, then wound round something that crosses its way (a line along X). The
 * whole is one unit long from the origin to the far side of the coil.
 */
export function tendrilPath(shape: TendrilShape, n: number): THREE.Vector3[] {
  const r = shape.coilRadius;
  // the reach ends where the coil begins: on the near side of what it winds round
  const reach = 1 - 2 * r;
  const share = shape.turns > 0 ? 0.5 : 0.8;
  const out = Math.max(2, Math.round(n * share));
  const pts = path(out, (t) => new V3(0, shape.bow * Math.sin(Math.PI * t), reach * t));
  if (shape.turns > 0) {
    // wound over the top of it and round, creeping along it
    const coil = coilPath(new V3(0, 0, reach + r), new V3(1, 0, 0), new V3(0, 0, reach), r, shape.turns, shape.creep, Math.max(3, n - out));
    pts.push(...coil.slice(1));
  } else {
    // nothing found: the tip curls over in an open hook
    const hook = path(Math.max(2, n - out), (t) => new V3(0, r * (1 - Math.cos(t * Math.PI * 0.9)), reach + r * Math.sin(t * Math.PI * 0.9) * 2));
    pts.push(...hook.slice(1));
  }
  return pts;
}

/**
 * A patch of short clinging rootlets, added to a Merge: `count` of them in a
 * row along Y (the way the stem runs, near enough), each reaching along +Z to
 * what the stem clings to and splaying a little. One unit is the length of a
 * rootlet; `row` is the length of the row in the same units.
 */
export function rootlets(mg: Merge, count: number, row: number, splay: number, thickness: number, radial: number, c0: Readonly<RGB>, c1: Readonly<RGB>, seed: number): void {
  for (let i = 0; i < count; i++) {
    const y = (count === 1 ? 0 : i / (count - 1) - 0.5) * row + (hash2(seed, i) - 0.5) * 0.1 * row;
    const side = (hash2(seed + 1, i) - 0.5) * 2 * splay;
    const lift = (hash2(seed + 2, i) - 0.5) * splay;
    const len = 0.7 + 0.3 * hash2(seed + 3, i);
    const from = new V3((hash2(seed + 4, i) - 0.5) * 0.15, y, 0);
    const mid = from.clone().add(new V3(side * 0.35 * len, lift * 0.35 * len, 0.55 * len));
    const end = from.clone().add(new V3(side * len, lift * len, len));
    mg.tube([from, mid, end], [thickness, thickness * 0.8, thickness * 0.45], radial, c0, c1);
  }
}

export interface PrickleShape {
  /** Width (along the stem) and thickness (across it) of the base, in lengths. */
  baseWidth: number;
  baseThickness: number;
  /** How far the point hooks back down (-Y) by the tip, in lengths. */
  hook: number;
  /** Below 1 a stout prickle that narrows late; above 1 a needle. */
  taper: number;
}

/**
 * A prickle: a flattened, hooked point from the origin along +Z, its broad
 * base lying along Y (the way the stem runs). One unit long.
 */
export function prickle(shape: PrickleShape, [around, along]: Segs, base: Readonly<RGB>, tip: Readonly<RGB>): THREE.BufferGeometry {
  const sb = new Surf();
  sb.surf(around, along, (u, v) => {
    const th = u * TAU;
    const k = Math.pow(1 - v, shape.taper);
    // the base spreads on the bark; the point is drawn down as it goes out
    const y = Math.cos(th) * 0.5 * shape.baseWidth * k * (1 + 0.6 * (1 - v) ** 4) - shape.hook * v * v;
    const x = Math.sin(th) * 0.5 * shape.baseThickness * k;
    return { p: [x, y, v], c: mix(base, tip, v) };
  });
  return sb.build();
}

// ---------------------------------------------------------------------------
// Ground
// ---------------------------------------------------------------------------

/** A scrap of litter (fallen petal / leaflet) for the ground. Ported from the prototype with the litter program; not drawn yet. */
export function makeLitterGeometry(): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(0.5, 6);
  g.scale(1, 0.62, 1);
  g.rotateX(-Math.PI / 2);
  return g;
}
