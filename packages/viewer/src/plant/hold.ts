// How a blade is held in the world (BladeHold in look.ts). The viewer decides
// how an organ is held, never whether or where it is: the stalk keeps the
// direction the render data gives it, and only the blade turns, where it joins
// the stalk. All in three.js axes (y up).
//
//   face   the upper side looks to the open side: away from what the bearing
//          stem lies on, raised above level by the look's `rise`; straight up
//          where the stem lies on top of its support; raised by `riseOpen`
//          where the stem touches nothing, and then turned out the way the
//          stalk points
//   tip    as low as it can go with the face turned so: down the slope of the
//          blade, leaning a little the way the stalk points, then turned
//          about the face by up to `turn` either way
//
// Nothing here knows which way the engine points a stalk, or why: any
// direction gives a blade held by gravity and the open side.
import * as THREE from 'three';
import type { BladeHold } from './look.ts';

const UP = new THREE.Vector3(0, 1, 0);
const DEG = Math.PI / 180;

export interface BladeFrame {
  /** Across the blade, the upper face, and the way to the tip: a right-handed basis (x = y cross z). */
  x: THREE.Vector3;
  y: THREE.Vector3;
  z: THREE.Vector3;
}

/**
 * The frame a blade is held in. `stalk` is the direction the stalk leaves the stem in, `out` the bearing stem's way
 * out from its support (zero where it touches nothing), both unit or zero; `r1`, `r2`, `r3` fixed random numbers in
 * [0, 1) for this leaf.
 */
export function bladeFrame(stalk: THREE.Vector3, out: THREE.Vector3, hold: BladeHold, r1: number, r2: number, r3: number): BladeFrame {
  const supported = out.lengthSq() > 1e-6;
  // the open side, level: out from the support, leaning the way the stalk points
  const level = new THREE.Vector3(out.x + 0.35 * stalk.x, 0, out.z + 0.35 * stalk.z);
  if (!supported) level.set(stalk.x, 0, stalk.z);
  if (level.lengthSq() < 1e-6) level.set(Math.cos(r3 * Math.PI * 2), 0, Math.sin(r3 * Math.PI * 2));
  level.normalize();
  const [lo, hi] = supported ? hold.rise : hold.riseOpen;
  let rise = lo + (hi - lo) * r1;
  // a stem lying on top of its support has the sky for its open side; one under it, still the side
  if (supported) rise += (90 - rise) * Math.max(0, out.y);
  rise = Math.min(89.5, rise) * DEG;
  const y = level.clone().multiplyScalar(Math.cos(rise)).addScaledVector(UP, Math.sin(rise)).normalize();
  // the tip: down the slope of the face, leaning a little the way the stalk points along it
  const down = UP.clone().negate().addScaledVector(y, y.y);
  const lean = stalk.clone().addScaledVector(y, -stalk.dot(y));
  const z = down.addScaledVector(lean, 0.15);
  if (z.lengthSq() < 1e-8) z.copy(level).addScaledVector(y, -level.dot(y));
  z.normalize();
  // turned about the face: leaves do not all hang alike
  z.applyAxisAngle(y, (r2 * 2 - 1) * hold.turn * DEG);
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  return { x, y, z };
}

/**
 * The points of a held leaf's model with its blade turned down by `unitAt` degrees from the line of its stalk (about
 * +X at the blade's pivot), as the leaf's one unit is measured (BladeHold.unitAt). For checking a model against the
 * length the data gives it; the viewer itself turns the blade by the hold.
 */
export function asMeasured(g: THREE.BufferGeometry, unitAt: number): THREE.Vector3[] {
  const position = g.getAttribute('position');
  const part = g.getAttribute('aPart');
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), unitAt * DEG);
  const pivot = new THREE.Vector3();
  return Array.from({ length: position.count }, (_, i) => {
    const p = new THREE.Vector3().fromBufferAttribute(position, i);
    if (part.getW(i) < 0) return p;
    pivot.set(part.getX(i), part.getY(i), part.getZ(i));
    return p.sub(pivot).applyQuaternion(q).add(pivot);
  });
}

/**
 * The turn that brings a blade authored in the leaf's own frame (flat along +Z, upper side +Y) into `frame`, as the
 * leaf's instance is turned by `instance` (its rotation only). Written in the leaf's own frame, as the shader applies
 * it before the instance matrix: q = instance^-1 * frame.
 */
export function bladeTurn(instance: THREE.Matrix4, frame: BladeFrame, out = new THREE.Quaternion()): THREE.Quaternion {
  const inst = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(instance));
  const held = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(frame.x, frame.y, frame.z));
  return out.copy(inst.invert().multiply(held));
}
