/**
 * World frame used everywhere in the simulation core:
 *
 *   right-handed, metres, x = east, y = north, z = up
 *
 * This is the convention of architectural models (Rhino, IFC) that Bower
 * geometry will arrive in, and it makes sun azimuth and aspect direct to
 * compute. Renderers that prefer y-up convert at their boundary:
 *   three.js (x, y, z) = core (x, z, -y)
 */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const ZERO: Vec3 = v3(0, 0, 0);
export const UP: Vec3 = v3(0, 0, 1);

export const add = (a: Vec3, b: Vec3): Vec3 => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: Vec3, b: Vec3): Vec3 => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a: Vec3, k: number): Vec3 => v3(a.x * k, a.y * k, a.z * k);
export const addScaled = (a: Vec3, b: Vec3, k: number): Vec3 => v3(a.x + b.x * k, a.y + b.y * k, a.z + b.z * k);
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 => v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export const distance = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => v3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);

export function normalize(a: Vec3): Vec3 {
  const l = length(a);
  return l > 1e-12 ? scale(a, 1 / l) : ZERO;
}

/** Any unit vector perpendicular to `a`. */
export function anyPerpendicular(a: Vec3): Vec3 {
  const n = normalize(a);
  const ref = Math.abs(n.z) < 0.9 ? UP : v3(1, 0, 0);
  return normalize(cross(ref, n));
}

/** Convert a point from a y-up frame (three.js, the Wisteria prototype) to the core frame. */
export const fromYUp = (x: number, y: number, z: number): Vec3 => v3(x, -z, y);
/** Convert a core point to y-up components [x, y, z]. */
export const toYUp = (p: Vec3): [number, number, number] => [p.x, p.z, -p.y];

export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
export const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
