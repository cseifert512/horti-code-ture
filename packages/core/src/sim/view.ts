/**
 * What a visitor sees from a given spot on a given day, as numbers.
 * SIMULATION_KEY.md section 8, output 2; PROJECT_CONTEXT.md section 2:
 * "Will the timber remain legible as designed, or become completely obscured?"
 *
 * A small software renderer: everything is splatted into a depth buffer as
 * discs, nearest wins. Anything narrower than a pixel takes a pixel with a
 * chance equal to the share of the pixel it really covers, so that a thin
 * stem or a small leaf seen from a distance counts for its true area and not
 * for a whole pixel. It is coarse on purpose. It exists to compare months,
 * viewpoints and scenarios with one another, not to make pictures; the leaf
 * and flower outlines are stand-ins of about the right area.
 */
import type { Bower } from '../bower/types.ts';
import { equivalentDiameterMm } from '../bower/types.ts';
import { type Vec3, UP, cross, dot, normalize, sub, v3 } from '../math/vec3.ts';
import type { RenderData } from '../render/contract.ts';
import { flowerState, leafState, seasonsOf, stemPointAlive, stemRadiusM } from '../render/presence.ts';

export interface Viewpoint {
  id: string;
  /** Where a person is and what they are doing, in words. */
  label: string;
  eye: Vec3;
  target: Vec3;
  /** Vertical field of view, degrees. */
  fovDeg: number;
}

export interface ViewCoverage {
  viewpointId: string;
  day: number;
  /** Of the timber seen from here on the bare structure, the share still seen. */
  timberVisible: number;
  /** Share of the structure's extent in the view that is leaf, and the part of that which is evergreen. */
  foliage: number;
  evergreenFoliage: number;
  /** Share of the structure's extent in the view that is open flower. */
  flowers: number;
}

const NONE = 0;
const TIMBER = 1;
const CABLE = 2;
const STEM = 3;
const LEAF = 4;
const EVERGREEN = 5;
const FLOWER = 6;

/** Silhouette of a leaf as a disc: about a quarter of its length squared in area. */
const LEAF_DISC = 0.28;
/** Radius in pixels below which a disc is too small to rasterise and is dithered instead. */
const SUBPIXEL = 0.6;

/**
 * A fixed pseudo-random number in [0, 1) for a place in the world. The same
 * element gets the same number on every day and in every run, so months and
 * scenarios are compared on common ground.
 */
function placeHash(p: Vec3): number {
  let h = Math.imul(Math.round(p.x * 4096), 73856093) ^ Math.imul(Math.round(p.y * 4096), 19349663) ^ Math.imul(Math.round(p.z * 4096), 83492791);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

class Frame {
  readonly w: number;
  readonly h: number;
  readonly depth: Float32Array;
  readonly kind: Uint8Array;
  private readonly eye: Vec3;
  private readonly f: Vec3;
  private readonly r: Vec3;
  private readonly u: Vec3;
  private readonly scale: number;

  constructor(vp: Viewpoint, w: number, h: number) {
    this.w = w;
    this.h = h;
    this.depth = new Float32Array(w * h).fill(Infinity);
    this.kind = new Uint8Array(w * h);
    this.eye = vp.eye;
    this.f = normalize(sub(vp.target, vp.eye));
    const side = cross(this.f, UP);
    this.r = normalize(Math.hypot(side.x, side.y, side.z) > 1e-6 ? side : v3(1, 0, 0));
    this.u = cross(this.r, this.f);
    this.scale = h / 2 / Math.tan((vp.fovDeg * Math.PI) / 360);
  }

  /**
   * A disc of the given radius (metres) facing the eye. `areaM2` is the area it
   * stands for where that is not the disc's own: one bead of a rod stands for
   * the stretch of rod between it and the next.
   */
  splat(p: Vec3, radiusM: number, kind: number, areaM2 = Math.PI * radiusM * radiusM): void {
    const v = sub(p, this.eye);
    const z = dot(v, this.f);
    if (z < 0.1) return;
    const cx = this.w / 2 + (dot(v, this.r) / z) * this.scale;
    const cy = this.h / 2 - (dot(v, this.u) / z) * this.scale;
    const rad = (radiusM * this.scale) / z;
    if (rad < SUBPIXEL) {
      const x = Math.floor(cx);
      const y = Math.floor(cy);
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
      if (placeHash(p) >= areaM2 * (this.scale / z) ** 2) return;
      const i = y * this.w + x;
      if (z < this.depth[i]!) {
        this.depth[i] = z;
        this.kind[i] = kind;
      }
      return;
    }
    if (cx + rad < 0 || cy + rad < 0 || cx - rad >= this.w || cy - rad >= this.h) return;
    const x0 = Math.max(0, Math.floor(cx - rad));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + rad));
    const y0 = Math.max(0, Math.floor(cy - rad));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + rad));
    const r2 = rad * rad;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) > r2) continue;
        const i = y * this.w + x;
        if (z < this.depth[i]!) {
          this.depth[i] = z;
          this.kind[i] = kind;
        }
      }
    }
  }

  /** A run of discs along a segment. */
  rod(a: Vec3, b: Vec3, radiusM: number, kind: number): void {
    const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (len < 1e-9) return;
    const n = Math.max(1, Math.ceil(len / Math.max(0.01, radiusM * 0.8)));
    // beads at the middle of n equal stretches, each standing for its own stretch of the rod
    const area = 2 * radiusM * (len / n);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      this.splat(v3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t), radiusM, kind, area);
    }
  }
}

/** The bare structure as seen from a viewpoint: computed once and reused for every day. */
function structureFrame(bower: Bower, vp: Viewpoint, w: number, h: number): Frame {
  const frame = new Frame(vp, w, h);
  for (const m of bower.members) {
    const r = equivalentDiameterMm(m.section) / 2000;
    const pts = m.curve.points;
    for (let i = 1; i < pts.length; i++) frame.rod(pts[i - 1]!, pts[i]!, r, TIMBER);
  }
  for (const s of bower.supports) {
    const pts = s.curve.points;
    for (let i = 1; i < pts.length; i++) frame.rod(pts[i - 1]!, pts[i]!, s.diameterMm / 2000, CABLE);
  }
  return frame;
}

export interface ViewOptions {
  width?: number;
  height?: number;
}

/**
 * Coverage from one viewpoint on each of the given days.
 * `dayYear` gives the calendar year a day falls in (use `calendar.dateOf(day).year`).
 */
export function viewCoverage(bower: Bower, data: RenderData, vp: Viewpoint, days: readonly number[], dayYear: (day: number) => number, options: ViewOptions = {}): ViewCoverage[] {
  const { width = 240, height = 180 } = options;
  const bare = structureFrame(bower, vp, width, height);
  let timber0 = 0;
  let x0 = width;
  let x1 = -1;
  let y0 = height;
  let y1 = -1;
  for (let i = 0; i < bare.kind.length; i++) {
    if (bare.kind[i] === NONE) continue;
    if (bare.kind[i] === TIMBER) timber0++;
    const x = i % width;
    const y = (i - x) / width;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  const extent = Math.max(1, (x1 - x0 + 1) * (y1 - y0 + 1));

  return days.map((day) => {
    const frame = new Frame(vp, width, height);
    frame.depth.set(bare.depth);
    frame.kind.set(bare.kind);
    const seasons = seasonsOf(data, dayYear(day));

    for (const st of data.stems) {
      let prev: Vec3 | null = null;
      for (let i = 0; i < st.bornDay.length; i++) {
        if (!stemPointAlive(st, i, day)) {
          prev = null;
          continue;
        }
        const r = stemRadiusM(data, st, i, day);
        const p = v3(st.contact[3 * i]! + st.away[3 * i]! * r, st.contact[3 * i + 1]! + st.away[3 * i + 1]! * r, st.contact[3 * i + 2]! + st.away[3 * i + 2]! * r);
        if (prev) frame.rod(prev, p, r, STEM);
        prev = p;
      }
    }
    for (const lf of data.leaves) {
      const s = leafState(lf, seasons.get(lf.plantId), day);
      if (!s.present || s.expansion <= 0.05) continue;
      const half = lf.lengthM * 0.5;
      frame.splat(v3(lf.position[0] + lf.direction[0] * half, lf.position[1] + lf.direction[1] * half, lf.position[2] + lf.direction[2] * half - 0.1 * lf.lengthM), LEAF_DISC * lf.lengthM * s.expansion, lf.evergreen ? EVERGREEN : LEAF);
    }
    for (const fl of data.flowers) {
      if (flowerState(fl, day).phase !== 'open') continue;
      const top = v3(fl.position[0], fl.position[1], fl.position[2]);
      // a long inflorescence hangs; a single flower faces out from its node
      if (fl.lengthM > 0.15) frame.rod(top, v3(top.x, top.y, top.z - fl.lengthM), fl.lengthM * 0.15, FLOWER);
      else frame.splat(top, fl.lengthM / 2, FLOWER);
    }

    let timber = 0;
    let leaf = 0;
    let evergreen = 0;
    let flowers = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * width + x;
        const k = frame.kind[i]!;
        if (k === TIMBER) timber++;
        else if (k === LEAF) leaf++;
        else if (k === EVERGREEN) evergreen++;
        else if (k === FLOWER) flowers++;
      }
    }
    return { viewpointId: vp.id, day, timberVisible: timber0 ? timber / timber0 : 0, foliage: (leaf + evergreen) / extent, evergreenFoliage: evergreen / extent, flowers: flowers / extent };
  });
}
