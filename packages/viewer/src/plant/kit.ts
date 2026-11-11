// Tools for building organ models: blades, palmate blades, compound leaves,
// tufts of stamens. They are geometry only. What makes a leaf a rose leaf or
// an ivy leaf is the shape each taxon's module asks for, and no module borrows
// another's.
//
// Every leaf model uses one frame: the origin is where the leaf joins the
// stem, +Z runs along it, +Y is its upper side, and it is one unit long, so
// that the length in the render data is the length drawn.
import * as THREE from 'three';
import { RNG, hash2 } from '../util.ts';
import { Merge, type RGB, Surf } from './organs.ts';

const V3 = THREE.Vector3;
const TAU = Math.PI * 2;

/** Segments across and along a surface. */
export type Segs = readonly [number, number];
export const WHITE: RGB = [1, 1, 1];
/** Where a leaf stalk samples the leaf texture: on its pale midrib. */
const MIDRIB: [number, number] = [0.5, 0.02];

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
