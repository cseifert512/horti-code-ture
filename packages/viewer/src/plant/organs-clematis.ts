// Organ shapes of two clematis. Not to be reused for other taxa: mechanism
// traits do not transfer, and the two here differ from each other too.
//
//   leaf            a compound leaf of stalked leaflets on a wiry axis: five
//                   plain leaflets (Clematis 'Etoile Violette') or three lobed
//                   ones (Clematis cirrhosa 'Freckles'). Unit length along +Z,
//                   upper side +Y.
//   open flower     'Etoile Violette': a single flat flower of four to six
//                   velvety tepals round a boss of cream stamens, held out on
//                   a long stalk that rises from the node. One unit is the
//                   width of the flower, which is what the render data gives.
//   bell flower     'Freckles': a nodding bell of four cream tepals speckled
//                   red-maroon, hanging on its stalk. One unit is the width of
//                   the mouth of the bell.
//
// Both flowers are drawn by the same program as a raceme: tepals are tagged as
// flowers of an inflorescence that all open nearly together, the stalk and the
// stamens as its axis. When the tepals drop, the stamens stay: the seed head.
import * as THREE from 'three';
import { hash2, RNG } from '../util.ts';
import { Merge, type RGB, Surf, lin, mix } from './organs.ts';

const V3 = THREE.Vector3;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Leaf
// ---------------------------------------------------------------------------
export const CLEMATIS_LEAF_LODS = 3;

const LEAFLET_SEGS: [number, number][] = [
  [6, 9],
  [3, 4],
  [2, 2],
];

function leaflet(lod: number, lobed: boolean): THREE.BufferGeometry {
  const sb = new Surf();
  const [nu, nv] = LEAFLET_SEGS[lod]!;
  sb.surf(nu, nv, (u01, v) => {
    const u = u01 * 2 - 1;
    // ovate: broad near the base, tapering to a point
    let hw = 0.27 * Math.pow(Math.sin(Math.PI * Math.pow(v, 0.6)), 0.75) + 0.004;
    if (lobed && lod < 2) hw *= 1 + 0.2 * Math.sin(3 * Math.PI * v) * (1 - v);
    const x = u * hw;
    let y = 0.18 * Math.abs(x) - 0.12 * v * v;
    if (lod === 0) y += 0.02 * Math.sin(v * 12 + u * 1.5) * u * u;
    return { p: [x, y, v] };
  });
  return sb.build();
}

/** `leaflets` 3 or 5; `lobed` gives each leaflet a shallowly lobed outline. */
export function makeClematisLeafGeometry(leaflets: 3 | 5, lobed: boolean, lod: number): THREE.BufferGeometry {
  const rng = new RNG(700 + leaflets * 13 + (lobed ? 1 : 0));
  const mg = new Merge(true);
  const blade = leaflet(lod, lobed);
  // the axis: a thin stalk, arching a little
  const axisEnd = leaflets === 3 ? 0.58 : 0.64;
  const at = (t: number) => new V3(0, -0.1 * t * t, t * axisEnd);
  const NS = [8, 4, 2][lod]!;
  const pts: THREE.Vector3[] = [];
  const radii: number[] = [];
  for (let i = 0; i <= NS; i++) {
    pts.push(at(i / NS));
    radii.push(0.009 * (1 - 0.4 * (i / NS)));
  }
  const radial = [5, 4, 3][lod]!;
  mg.tube(pts, radii, radial, [1, 1, 1], [1, 1, 1], [0.5, 0.02]);

  const AX = new V3(1, 0, 0);
  const AY = new V3(0, 1, 0);
  const AZ = new V3(0, 0, 1);
  const q = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const m = new THREE.Matrix4();
  const put = (t: number, side: number, length: number) => {
    const from = at(t);
    // a short stalk of its own, out to the side (or straight on, for the end leaflet)
    const yaw = side === 0 ? rng.range(-0.15, 0.15) : side * (Math.PI / 2 - rng.range(0.35, 0.6));
    const stalk = 0.07 + (side === 0 ? 0 : 0.03);
    const base = from.clone().add(new V3(Math.sin(yaw) * stalk, -0.01, Math.cos(yaw) * stalk));
    if (lod < 2) mg.tube([from, base], [0.007, 0.006], radial, [1, 1, 1], [1, 1, 1], [0.5, 0.02]);
    q.setFromAxisAngle(AY, yaw);
    q.multiply(q2.setFromAxisAngle(AX, rng.range(0.05, 0.35)));
    q.multiply(q2.setFromAxisAngle(AZ, rng.range(-0.25, 0.25) - side * 0.12));
    const s = length * rng.range(0.92, 1.08);
    m.compose(base, q, new V3(s, s, s));
    const tone = rng.range(0.9, 1.1);
    mg.add(blade, m, [tone, tone, tone], base, rng.f());
  };
  if (leaflets === 5) {
    put(0.42, -1, 0.3);
    put(0.42, 1, 0.3);
    put(0.78, -1, 0.31);
    put(0.78, 1, 0.31);
    put(1, 0, 0.36);
  } else {
    put(0.72, -1, 0.36);
    put(0.72, 1, 0.36);
    put(1, 0, 0.42);
  }
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(new V3(0, 0, 0.5), 0.8);
  return g;
}

// ---------------------------------------------------------------------------
// Shared: a tuft of stamens, tagged as axis so it outlasts the tepals
// ---------------------------------------------------------------------------
function stamens(mg: Merge, centre: THREE.Vector3, axis: THREE.Vector3, count: number, length: number, spread: number, radial: number, c0: Readonly<RGB>, c1: Readonly<RGB>, seed: number): void {
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
    mg.tube([centre.clone(), centre.clone().addScaledVector(dir, len)], [0.012, 0.016], radial, c0, c1);
  }
}

const TEPAL_SEGS: [number, number][] = [
  [6, 8],
  [3, 4],
  [2, 2],
];

// ---------------------------------------------------------------------------
// Open flower: Clematis 'Etoile Violette'
// ---------------------------------------------------------------------------
/** Tepals per variant. */
export const OPEN_FLOWER_TEPALS: readonly number[] = [6, 5, 4];
export const CLEMATIS_FLOWER_LODS = 3;

const VIOLET = {
  deep: lin('#340d4e'),
  mid: lin('#4f1672'),
  bar: lin('#6b1c70'),
  base: lin('#5a2a80'),
  stamenA: lin('#f0e7b4'),
  stamenB: lin('#d4c97c'),
  stalkA: lin('#5f6c3c'),
  stalkB: lin('#4b3a5c'),
};

export function makeOpenFlowerGeometry(variant: number, lod: number): THREE.BufferGeometry {
  const n = OPEN_FLOWER_TEPALS[variant]!;
  const mg = new Merge(false);
  const [nu, nv] = TEPAL_SEGS[lod]!;
  // the stalk rises from the node and leans out; the flower looks out and a little up
  const stalk = (s: number) => new V3(0, 0.78 * s, 0.26 * s * s);
  const centre = stalk(1);
  const axis = new V3(0, 0.34, 1).normalize();
  const right = new V3(1, 0, 0);
  const up = new V3().crossVectors(axis, right).normalize();

  const NS = [6, 3, 2][lod]!;
  const pts: THREE.Vector3[] = [];
  const radii: number[] = [];
  for (let i = 0; i <= NS; i++) {
    pts.push(stalk(i / NS));
    radii.push(0.014);
  }
  mg.tube(pts, radii, [5, 4, 3][lod]!, VIOLET.stalkA, VIOLET.stalkB);

  const id = new THREE.Matrix4();
  for (let k = 0; k < n; k++) {
    const theta = (k / n) * TAU + (hash2(variant, k) - 0.5) * 0.18;
    const er = right.clone().multiplyScalar(Math.cos(theta)).addScaledVector(up, Math.sin(theta));
    const et = right.clone().multiplyScalar(-Math.sin(theta)).addScaledVector(up, Math.cos(theta));
    const sb = new Surf();
    sb.surf(nu, nv, (u01, v) => {
      const u = u01 * 2 - 1;
      const r = 0.03 + 0.47 * v;
      // broad in the middle, narrowed to the base, drawn to a short point
      const hw = 0.168 * Math.pow(Math.sin(Math.PI * Math.pow(v, 0.85)), 0.65) + 0.004;
      // a little cupped, the tip turned back, a channel down the middle
      let h = 0.05 * Math.sin(Math.PI * v) - 0.1 * v * v * v - 0.018 * Math.exp(-((u / 0.3) ** 2)) * (1 - v) + 0.03 * u * u * (1 - v);
      if (lod === 0) h += 0.012 * Math.sin(v * 14 + k) * u * u;
      const p = centre
        .clone()
        .addScaledVector(er, r)
        .addScaledVector(et, u * hw)
        .addScaledVector(axis, h);
      let c = mix(VIOLET.base, VIOLET.mid, Math.min(1, v * 3));
      c = mix(c, VIOLET.deep, Math.pow(Math.abs(u), 2) * 0.6 + Math.max(0, v - 0.7));
      c = mix(c, VIOLET.bar, 0.5 * Math.exp(-((u / 0.22) ** 2)) * (1 - 0.5 * v));
      return { p: [p.x, p.y, p.z], c };
    });
    const tone = 0.94 + 0.12 * hash2(variant + 3, k);
    mg.add(sb.build(), id, [tone, tone, tone], centre, (k / n) * 0.25);
  }
  if (lod < 2) stamens(mg, centre, axis, lod === 0 ? 18 : 8, 0.11, 0.75, lod === 0 ? 4 : 3, VIOLET.stamenA, VIOLET.stamenB, 31 + variant);
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(centre.clone(), 0.9);
  return g;
}

// ---------------------------------------------------------------------------
// Bell flower: Clematis cirrhosa 'Freckles'
// ---------------------------------------------------------------------------
export const BELL_FLOWER_VARIANTS = 2;

const FRECKLES = {
  cream: lin('#efe9c4'),
  flush: lin('#e2cfae'),
  spot: lin('#7d2233'),
  stamenA: lin('#e6e3b0'),
  stamenB: lin('#c9cf8c'),
  stalkA: lin('#6a7445'),
  stalkB: lin('#7b6a55'),
};

const BELL_SEGS: [number, number][] = [
  [10, 14],
  [5, 6],
  [2, 2],
];

export function makeBellFlowerGeometry(variant: number, lod: number): THREE.BufferGeometry {
  const mg = new Merge(false);
  const [nu, nv] = BELL_SEGS[lod]!;
  // it hangs: the stalk curves over and down
  const stalk = (s: number) => new V3(0.1 * Math.sin((Math.PI / 2) * s), -0.7 * s, 0);
  const top = stalk(1);
  const down = new V3(0, -1, 0);

  const NS = [6, 3, 2][lod]!;
  const pts: THREE.Vector3[] = [];
  const radii: number[] = [];
  for (let i = 0; i <= NS; i++) {
    pts.push(stalk(i / NS));
    radii.push(0.02);
  }
  mg.tube(pts, radii, [5, 4, 3][lod]!, FRECKLES.stalkA, FRECKLES.stalkB);

  const id = new THREE.Matrix4();
  for (let k = 0; k < 4; k++) {
    const theta = (k / 4) * TAU + Math.PI / 4 + variant * 0.4;
    const er = new V3(Math.cos(theta), 0, Math.sin(theta));
    const et = new V3(-Math.sin(theta), 0, Math.cos(theta));
    const sb = new Surf();
    sb.surf(nu, nv, (u01, v) => {
      const u = u01 * 2 - 1;
      // a bell: out from the stalk and down, flaring at the mouth, the tip turned out
      // the tips stand half a unit from the axis: the mouth is one unit across
      const r = 0.06 + 0.4 * Math.pow(v, 1.5) + 0.04 * v ** 4;
      const drop = 0.8 * v - 0.08 * v * v * v;
      const hw = 0.34 * Math.pow(Math.sin(Math.PI * Math.pow(v, 0.7)), 0.7) + 0.004;
      // wrapped round the bell rather than flat across it
      const bend = (u * hw) / Math.max(r, 0.12);
      const p = top
        .clone()
        .addScaledVector(er, r * Math.cos(bend))
        .addScaledVector(et, r * Math.sin(bend))
        .addScaledVector(down, drop);
      // cream, flushed towards the base, freckled most heavily through the middle
      let c = mix(FRECKLES.cream, FRECKLES.flush, Math.max(0, 1 - v * 2.2));
      const cell = hash2(Math.round(u01 * nu) + k * 17 + variant * 101, Math.round(v * nv));
      if (cell < 0.5 * Math.sin(Math.PI * Math.min(1, v * 1.15)) * (1 - 0.4 * Math.abs(u))) c = mix(c, FRECKLES.spot, 0.5 + 0.45 * hash2(k + 5, Math.round(v * nv) * 7 + Math.round(u01 * nu)));
      return { p: [p.x, p.y, p.z], c };
    });
    mg.add(sb.build(), id, [1, 1, 1], top, (k / 4) * 0.2);
  }
  if (lod < 2) stamens(mg, top.clone().addScaledVector(down, 0.08), down, lod === 0 ? 12 : 6, 0.42, 0.28, lod === 0 ? 4 : 3, FRECKLES.stamenA, FRECKLES.stamenB, 57 + variant);
  const g = mg.build();
  g.boundingSphere = new THREE.Sphere(top.clone().addScaledVector(down, 0.4), 0.9);
  return g;
}
