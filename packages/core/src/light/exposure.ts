/**
 * How much light reaches each stretch of route and each root station of a
 * Bower, month by month. DEVELOPMENT_GUIDE.md stage 5: "light/shade map".
 *
 * For every place light is read, the sky is divided into small equal patches
 * and each patch is marked with how much of it is hidden: by the Bower's own
 * timber and cables, by what a project declares stands on the site, and,
 * more thinly, by leaf. The sun's path on the 15th of each month is then laid
 * over that map. Two figures come out for each month:
 *
 *   hours   direct sun on a clear day, a half-shaded minute counting as half
 *   share   the light received as a share of what an open site would have:
 *           direct beam weighted by its strength through the day, and light
 *           from the whole sky, mixed in the proportion the model assumes
 *
 * "Clear day" matters: these are the hours the geometry allows, not sunshine
 * records. Cloud takes its share at every station alike.
 *
 * It is coarse where coarseness is cheap. A member is the strip it presents on
 * average; a tree is an ellipsoid; leaf is gathered into half-metre clumps;
 * the horizon is flat. Light is read on a small sphere, so that light arriving
 * low from one side counts for as much as light from above: a climber's leaves
 * face every way.
 */
import { equivalentDiameterMm } from '../bower/types.ts';
import type { Bower, Section } from '../bower/types.ts';
import type { Polyline } from '../math/polyline.ts';
import type { Vec3 } from '../math/vec3.ts';
import type { CompassQuarter } from '../vocab.ts';
import { LIGHT_MODEL } from './model.ts';
import { type Obstruction, type Site, TREE_CROWN_TRANSMISSION, TREE_IN_LEAF_MONTHS } from './site.ts';
import { MID_MONTH_DOY, sunPath } from './sun.ts';

// ---- the sky, in equal patches ---------------------------------------------------
/** Patches round the horizon and from the horizon to overhead. Equal in solid angle: even in bearing, and in the sine of height. */
const SKY_AZ = 72;
const SKY_EL = 24;
const CELLS = SKY_AZ * SKY_EL;
const CELL_SR = (2 * Math.PI) / CELLS;
/** About the width of a patch, radians: pieces of an occluder are made no longer than this as seen from the point. */
const CELL_ANGLE = 0.05;
const TWO_PI = 2 * Math.PI;
/** Leaf is gathered on a half-metre grid: a clump is taken to be a ball of about that size. */
const CLUMP_RADIUS_M = 0.3;
/** A group of clumps is taken as one from beyond this many times its own radius: it is then a small part of the sky. */
const GROUP_FAR = 2.5;

function cellOf(dx: number, dy: number, dz: number): number {
  const a = Math.floor(((Math.atan2(dx, dy) + Math.PI) / TWO_PI) * SKY_AZ);
  const e = Math.floor(dz * SKY_EL);
  return (e >= SKY_EL ? SKY_EL - 1 : e) * SKY_AZ + (a >= SKY_AZ ? SKY_AZ - 1 : a);
}

/** The direction at the middle of each patch. */
const CELL_DIR = (() => {
  const out = new Float32Array(CELLS * 3);
  for (let e = 0; e < SKY_EL; e++) {
    const z = (e + 0.5) / SKY_EL;
    const flat = Math.sqrt(1 - z * z);
    for (let a = 0; a < SKY_AZ; a++) {
      const az = ((a + 0.5) / SKY_AZ) * TWO_PI - Math.PI;
      const i = 3 * (e * SKY_AZ + a);
      out[i] = flat * Math.sin(az);
      out[i + 1] = flat * Math.cos(az);
      out[i + 2] = z;
    }
  }
  return out;
})();

// ---- where light is read ----------------------------------------------------------
export type Facing = CompassQuarter | 'up';

export interface LightPoint {
  kind: 'route' | 'station';
  /** The id of the support edge or the root station. */
  id: string;
  position: Vec3;
  /** Metres of route this point stands for; 0 for a station. */
  routeM: number;
  /** The side of the structure it is on, by the compass; `up` where it faces the sky. */
  facing: Facing;
  /** Compass bearing from the middle of the structure, degrees clockwise from true north. */
  bearingDeg: number;
}

/** Light at one place through the year: twelve values each, January first. */
export interface MonthlyLight {
  hours: number[];
  share: number[];
}

/** Leaf gathered into a clump, as something that thins the light passing through it. */
export interface LeafClump {
  x: number;
  y: number;
  z: number;
  /** Leaf area kept all year, and leaf area carried only in the growing season, m2. */
  evergreenM2: number;
  deciduousM2: number;
  /** Which plant's leaf it is: a plant is not counted as shading itself. */
  plant: number;
}

/** Clumps that lie near one another, taken as one from far enough away. */
export interface LeafGroup extends LeafClump {
  /** How far its leaf reaches from its middle, m. */
  radiusM: number;
  members: readonly LeafClump[];
}

export interface Foliage {
  clumps: readonly LeafClump[];
  /** The same leaf in larger gatherings, each used whole from far enough away. */
  groups: readonly LeafGroup[];
  /** Share of the deciduous leaf that is out in each month, January first. */
  deciduousOut: readonly number[];
}

/** Clumps and the share of deciduous leaf out in each month, made into foliage the light model can use. */
export function foliageOf(clumps: readonly LeafClump[], deciduousOut: readonly number[], groupM = 1.5): Foliage {
  const map = new Map<string, LeafClump[]>();
  for (const c of clumps) {
    const key = `${c.plant}|${Math.floor(c.x / groupM)}|${Math.floor(c.y / groupM)}|${Math.floor(c.z / groupM)}`;
    const list = map.get(key);
    if (list) list.push(c);
    else map.set(key, [c]);
  }
  const groups: LeafGroup[] = [];
  for (const members of map.values()) {
    let w = 0;
    let x = 0;
    let y = 0;
    let z = 0;
    let e = 0;
    let d = 0;
    for (const c of members) {
      const a = c.evergreenM2 + c.deciduousM2;
      w += a;
      x += c.x * a;
      y += c.y * a;
      z += c.z * a;
      e += c.evergreenM2;
      d += c.deciduousM2;
    }
    if (w <= 0) continue;
    const g = { x: x / w, y: y / w, z: z / w, evergreenM2: e, deciduousM2: d, plant: members[0]!.plant };
    let reach = 0;
    for (const c of members) reach = Math.max(reach, Math.hypot(c.x - g.x, c.y - g.y, c.z - g.z));
    groups.push({ ...g, radiusM: reach + CLUMP_RADIUS_M, members });
  }
  return { clumps, groups, deciduousOut };
}

/** Gather leaves into clumps on a half-metre grid, plant by plant. */
export function clumpLeaves(leaves: Iterable<{ x: number; y: number; z: number; areaM2: number; evergreen: boolean; plant: number }>, cellM = 0.5): LeafClump[] {
  const map = new Map<string, LeafClump & { w: number }>();
  for (const l of leaves) {
    const key = `${l.plant}|${Math.floor(l.x / cellM)}|${Math.floor(l.y / cellM)}|${Math.floor(l.z / cellM)}`;
    let c = map.get(key);
    if (!c) map.set(key, (c = { x: 0, y: 0, z: 0, evergreenM2: 0, deciduousM2: 0, plant: l.plant, w: 0 }));
    c.x += l.x * l.areaM2;
    c.y += l.y * l.areaM2;
    c.z += l.z * l.areaM2;
    c.w += l.areaM2;
    if (l.evergreen) c.evergreenM2 += l.areaM2;
    else c.deciduousM2 += l.areaM2;
  }
  const out: LeafClump[] = [];
  for (const c of map.values()) {
    if (c.w <= 0) continue;
    out.push({ x: c.x / c.w, y: c.y / c.w, z: c.z / c.w, evergreenM2: c.evergreenM2, deciduousM2: c.deciduousM2, plant: c.plant });
  }
  return out;
}

const QUARTERS: readonly CompassQuarter[] = ['north', 'east', 'south', 'west'];
const quarterOf = (bearingDeg: number): CompassQuarter => QUARTERS[Math.floor((((bearingDeg + 45) % 360) + 360) % 360 / 90)]!;
const WINDS = ['north', 'north-north-east', 'north-east', 'east-north-east', 'east', 'east-south-east', 'south-east', 'south-south-east', 'south', 'south-south-west', 'south-west', 'west-south-west', 'west', 'west-north-west', 'north-west', 'north-north-west'] as const;
/** A compass bearing in words, to the nearest of sixteen points. */
export const compassWords = (bearingDeg: number): string => WINDS[Math.round((((bearingDeg % 360) + 360) % 360) / 22.5) % 16]!;

/** Width of the face a plant lies on: what its own member hides from it. */
const faceWidthM = (s: Section): number => (s.shape === 'round' ? s.diameterMm : s.widthMm) / 1000;

interface Quad {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  z0: number;
  z1: number;
}
interface Solid {
  quads: Quad[];
  /** A flat top: the footprint and its height. */
  roof: { ring: readonly (readonly [number, number])[]; z: number } | null;
}
interface Crown {
  x: number;
  y: number;
  z: number;
  r: number;
  rz: number;
  deciduous: boolean;
}

function solids(obstructions: readonly Obstruction[]): { solids: Solid[]; crowns: Crown[] } {
  const out: Solid[] = [];
  const crowns: Crown[] = [];
  for (const o of obstructions) {
    if (o.kind === 'wall') out.push({ quads: [{ ax: o.from[0], ay: o.from[1], bx: o.to[0], by: o.to[1], z0: 0, z1: o.heightM }], roof: null });
    else if (o.kind === 'building') {
      const quads: Quad[] = o.footprint.map((p, i) => {
        const q = o.footprint[(i + 1) % o.footprint.length]!;
        return { ax: p[0], ay: p[1], bx: q[0], by: q[1], z0: 0, z1: o.heightM };
      });
      out.push({ quads, roof: { ring: o.footprint, z: o.heightM } });
    } else {
      const stem = o.clearStemM ?? o.heightM / 3;
      crowns.push({ x: o.at[0], y: o.at[1], z: (stem + o.heightM) / 2, r: o.crownRadiusM, rz: (o.heightM - stem) / 2, deciduous: o.leafHabit === 'deciduous' });
    }
  }
  return { solids: out, crowns };
}

function hitsQuad(q: Quad, px: number, py: number, pz: number, dx: number, dy: number, dz: number): boolean {
  const ex = q.bx - q.ax;
  const ey = q.by - q.ay;
  // the wall's plane is vertical: its normal is (-ey, ex, 0)
  const denom = -ey * dx + ex * dy;
  if (Math.abs(denom) < 1e-12) return false;
  const t = (-ey * (q.ax - px) + ex * (q.ay - py)) / denom;
  if (t <= 1e-6) return false;
  const z = pz + dz * t;
  if (z < q.z0 || z > q.z1) return false;
  const along = ((px + dx * t - q.ax) * ex + (py + dy * t - q.ay) * ey) / (ex * ex + ey * ey);
  return along >= 0 && along <= 1;
}

function inRing(ring: readonly (readonly [number, number])[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function hitsSolid(s: Solid, px: number, py: number, pz: number, dx: number, dy: number, dz: number): boolean {
  for (const q of s.quads) if (hitsQuad(q, px, py, pz, dx, dy, dz)) return true;
  if (s.roof && dz > 1e-9 && pz < s.roof.z) {
    const t = (s.roof.z - pz) / dz;
    if (inRing(s.roof.ring, px + dx * t, py + dy * t)) return true;
  }
  return false;
}

function hitsCrown(c: Crown, px: number, py: number, pz: number, dx: number, dy: number, dz: number): boolean {
  // the ellipsoid as a unit sphere, with z squeezed
  const k = c.r / c.rz;
  const ox = px - c.x;
  const oy = py - c.y;
  const oz = (pz - c.z) * k;
  const ez = dz * k;
  const a = dx * dx + dy * dy + ez * ez;
  const b = ox * dx + oy * dy + oz * ez;
  const cc = ox * ox + oy * oy + oz * oz - c.r * c.r;
  if (cc <= 0) return true; // inside the crown
  const disc = b * b - a * cc;
  return disc > 0 && -b - Math.sqrt(disc) > 0;
}

/** The light model's reading of one Bower on one site: where light is read, and what stands in its way. */
export class LightGeometry {
  readonly site: Site;
  readonly points: LightPoint[] = [];
  /** Points of each edge and of each station, by id. */
  readonly byEdge = new Map<string, number[]>();
  readonly byStation = new Map<string, number>();

  /** Strips of timber and cable: ax ay az bx by bz width, and the element each belongs to. */
  private readonly strips: Float64Array;
  private readonly stripHost: Int32Array;
  private readonly hostFace: number[] = [];
  private readonly hostOf: number[] = [];
  private readonly solids: Solid[];
  private readonly crowns: Crown[];
  private readonly anyDeciduousTree: boolean;
  /** Share of each patch hidden for good, 0 to 255, by point; and the share behind a deciduous tree's crown. */
  private readonly masks: (Uint8Array | undefined)[] = [];
  private readonly treeMasks: (Uint8Array | undefined)[] = [];
  /** Sky open at each point, as a count of patches: clear of any deciduous crown, and behind one. */
  private readonly openSky: number[] = [];
  private readonly openBehindTree: number[] = [];
  /** The sun's path on the 15th of each month: the patch it is in, the length of the step and the strength of the beam. */
  private readonly sunCell: Int32Array[] = [];
  private readonly sunHours: Float32Array[] = [];
  private readonly sunBeam: Float32Array[] = [];
  /** Hours between sunrise and sunset on the 15th of each month: the most direct sun an open site could have. */
  readonly possibleHours: number[] = [];
  private readonly scratch = new Float32Array(CELLS);
  private readonly tauE = new Float32Array(CELLS);
  private readonly tauD = new Float32Array(CELLS);

  constructor(bower: Bower, site: Site) {
    this.site = site;
    const standOff = LIGHT_MODEL.standOffM.value!;

    // ---- what is in the way: every member and cable, as short straight strips ----
    const strips: number[] = [];
    const hosts: number[] = [];
    const hostIndex = new Map<string, number>();
    const addElement = (id: string, curve: Polyline, widthM: number, faceM: number) => {
      const h = this.hostFace.length;
      hostIndex.set(id, h);
      this.hostFace.push(faceM);
      const n = Math.max(1, Math.ceil(curve.length / 0.6));
      let a = curve.pointAt(0);
      for (let i = 1; i <= n; i++) {
        const b = curve.pointAt((curve.length * i) / n);
        strips.push(a.x, a.y, a.z, b.x, b.y, b.z, widthM);
        hosts.push(h);
        a = b;
      }
    };
    // a member seen from any side presents, on average, the width of the round bar of equal girth
    for (const m of bower.members) addElement(m.id, m.curve, equivalentDiameterMm(m.section) / 1000, faceWidthM(m.section));
    for (const s of bower.supports) if (s.kind === 'cable') addElement(s.id, s.curve, s.diameterMm / 1000, s.diameterMm / 1000);
    this.strips = Float64Array.from(strips);
    this.stripHost = Int32Array.from(hosts);

    const made = solids(site.obstructions);
    this.solids = made.solids;
    this.crowns = made.crowns;
    this.anyDeciduousTree = made.crowns.some((c) => c.deciduous);

    // ---- where light is read ---------------------------------------------------
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const n of bower.graph.nodes.values()) {
      x0 = Math.min(x0, n.position.x);
      x1 = Math.max(x1, n.position.x);
      y0 = Math.min(y0, n.position.y);
      y1 = Math.max(y1, n.position.y);
    }
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const extent = Math.max(x1 - x0, y1 - y0, 1e-6);
    const bearing = (dx: number, dy: number) => (((Math.atan2(dx, dy) * 180) / Math.PI + site.bearingDeg) % 360 + 360) % 360;

    for (const edge of bower.graph.edges.values()) {
      const n = Math.max(1, Math.round(edge.curve.length / 1.5));
      const list: number[] = [];
      for (let k = 0; k < n; k++) {
        const f = (k + 0.5) / n;
        const on = edge.curve.pointAt(edge.curve.length * f);
        const centre = edge.axis.pointAt(edge.axis.length * f);
        // away from the member: outwards where the route lies on a face, upwards where it lies on the centre line
        let ox = on.x - centre.x;
        let oy = on.y - centre.y;
        let oz = on.z - centre.z;
        const ol = Math.hypot(ox, oy, oz);
        if (ol > 1e-6) {
          ox /= ol;
          oy /= ol;
          oz /= ol;
        } else {
          ox = 0;
          oy = 0;
          oz = 1;
        }
        const flat = Math.hypot(ox, oy);
        const fromCentre = Math.hypot(on.x - cx, on.y - cy);
        // a face tilted towards a side faces that side; a centre-line route takes the side of the structure it is on
        const facing: Facing = flat > 0.35 ? quarterOf(bearing(ox, oy)) : ol > 1e-6 || fromCentre < 0.1 * extent ? 'up' : quarterOf(bearing(on.x - cx, on.y - cy));
        list.push(this.points.length);
        this.points.push({ kind: 'route', id: edge.id, position: { x: on.x + ox * standOff, y: on.y + oy * standOff, z: Math.max(0.05, on.z + oz * standOff) }, routeM: edge.curve.length / n, facing, bearingDeg: bearing(on.x - cx, on.y - cy) });
        this.hostOf.push(hostIndex.get(edge.host.id) ?? -1);
      }
      this.byEdge.set(edge.id, list);
    }
    for (const s of bower.rootStations) {
      const b = bearing(s.position.x - cx, s.position.y - cy);
      this.byStation.set(s.id, this.points.length);
      this.points.push({ kind: 'station', id: s.id, position: { x: s.position.x, y: s.position.y, z: s.position.z + LIGHT_MODEL.stationHeightM.value! }, routeM: 0, facing: quarterOf(b), bearingDeg: b });
      this.hostOf.push(-1);
    }

    // ---- the sun's path, month by month ------------------------------------------
    for (let m = 0; m < 12; m++) {
      const path = sunPath(site, MID_MONTH_DOY[m]!, 20);
      this.sunCell.push(Int32Array.from(path.map((s) => cellOf(s.direction.x, s.direction.y, s.direction.z))));
      this.sunHours.push(Float32Array.from(path.map((s) => s.hours)));
      this.sunBeam.push(Float32Array.from(path.map((s) => s.beam * s.hours)));
      this.possibleHours.push(path.reduce((sum, s) => sum + s.hours, 0));
    }
  }

  /** Add a strip of something to the sky map of a point, as the share of each patch it covers. */
  private strip(into: Float32Array, px: number, py: number, pz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, width: number): void {
    const sx = bx - ax;
    const sy = by - ay;
    const sz = bz - az;
    const len = Math.hypot(sx, sy, sz);
    if (len < 1e-6) return;
    const ux = sx / len;
    const uy = sy / len;
    const uz = sz / len;
    // the nearest the strip comes to the point decides how finely it is cut
    const along = Math.min(len, Math.max(0, (px - ax) * ux + (py - ay) * uy + (pz - az) * uz));
    const near = Math.hypot(ax + ux * along - px, ay + uy * along - py, az + uz * along - pz);
    // wholly below the point and far from it: it can hide no sky
    if (Math.max(az, bz) < pz - width && near > 2 * width) return;
    const pieces = Math.min(96, Math.max(1, Math.ceil(len / (CELL_ANGLE * Math.max(near, 0.05)))));
    const piece = len / pieces;
    for (let i = 0; i < pieces; i++) {
      const t = (i + 0.5) * piece;
      const qx = ax + ux * t - px;
      const qy = ay + uy * t - py;
      const qz = az + uz * t - pz;
      const d = Math.hypot(qx, qy, qz);
      if (d < 0.02) continue;
      const dx = qx / d;
      const dy = qy / d;
      const dz = qz / d;
      const cos = dx * ux + dy * uy + dz * uz;
      const sin = Math.sqrt(Math.max(0, 1 - cos * cos));
      const omega = (width * piece * sin) / (d * d) / CELL_SR;
      const across = Math.min(24, Math.max(1, Math.ceil(width / d / CELL_ANGLE)));
      if (across === 1) {
        if (dz > 0) into[cellOf(dx, dy, dz)]! += omega;
        continue;
      }
      // a strip wider than a patch is spread across its width
      let wx = uy * dz - uz * dy;
      let wy = uz * dx - ux * dz;
      let wz = ux * dy - uy * dx;
      const wl = Math.hypot(wx, wy, wz);
      if (wl < 1e-9) continue;
      wx /= wl;
      wy /= wl;
      wz /= wl;
      for (let k = 0; k < across; k++) {
        const off = ((k + 0.5) / across - 0.5) * width;
        const rx = qx + wx * off;
        const ry = qy + wy * off;
        const rz = qz + wz * off;
        if (rz <= 0) continue;
        const rd = Math.hypot(rx, ry, rz);
        into[cellOf(rx / rd, ry / rd, rz / rd)]! += omega / across;
      }
    }
  }

  /** The sky map of a point: what is hidden for good, and (apart) what a deciduous tree hides. */
  private mask(i: number): Uint8Array {
    const known = this.masks[i];
    if (known) return known;
    const p = this.points[i]!.position;
    const s = this.scratch.fill(0);
    const st = this.strips;
    const own = this.hostOf[i]!;
    for (let k = 0, n = this.stripHost.length; k < n; k++) {
      const o = 7 * k;
      const host = this.stripHost[k]!;
      this.strip(s, p.x, p.y, p.z, st[o]!, st[o + 1]!, st[o + 2]!, st[o + 3]!, st[o + 4]!, st[o + 5]!, host === own ? this.hostFace[host]! : st[o + 6]!);
    }
    const mask = new Uint8Array(CELLS);
    let tree: Uint8Array | undefined;
    const evergreenCrown = 1 - TREE_CROWN_TRANSMISSION.inLeaf.value!;
    for (let c = 0; c < CELLS; c++) {
      let hidden = Math.min(1, s[c]!);
      if (this.solids.length || this.crowns.length) {
        const dx = CELL_DIR[3 * c]!;
        const dy = CELL_DIR[3 * c + 1]!;
        const dz = CELL_DIR[3 * c + 2]!;
        let solid = false;
        for (const o of this.solids) {
          if (hitsSolid(o, p.x, p.y, p.z, dx, dy, dz)) {
            solid = true;
            break;
          }
        }
        if (solid) hidden = 1;
        else {
          for (const crown of this.crowns) {
            if (!hitsCrown(crown, p.x, p.y, p.z, dx, dy, dz)) continue;
            if (crown.deciduous) (tree ??= new Uint8Array(CELLS))[c] = 255;
            else hidden = 1 - (1 - hidden) * (1 - evergreenCrown);
          }
        }
      }
      mask[c] = Math.round(255 * hidden);
    }
    let clear = 0;
    let behind = 0;
    for (let c = 0; c < CELLS; c++) {
      if (tree?.[c]) behind += 1 - mask[c]! / 255;
      else clear += 1 - mask[c]! / 255;
    }
    this.masks[i] = mask;
    this.treeMasks[i] = tree;
    this.openSky[i] = clear;
    this.openBehindTree[i] = behind;
    return mask;
  }

  /** Lay a ball of leaf on the scratch sky map of the point being read. */
  private leaf(touched: number[], qx: number, qy: number, qz: number, evergreenM2: number, deciduousM2: number, radiusM: number): void {
    if (qz < -radiusM) return;
    const tauE = this.tauE;
    const tauD = this.tauD;
    const g = LIGHT_MODEL.leafProjection.value!;
    const d = Math.hypot(qx, qy, qz);
    // how wide the ball is as seen from here; one the point is inside covers the sky on its side
    const rho = d > radiusM ? Math.asin(radiusM / d) : Math.PI / 2;
    const dx = d > 1e-6 ? qx / d : 0;
    const dy = d > 1e-6 ? qy / d : 0;
    const dz = d > 1e-6 ? qz / d : 1;
    if (rho < CELL_ANGLE) {
      // smaller than a patch: its leaf is laid on the one patch it is in
      if (dz <= 0) return;
      const c = cellOf(dx, dy, dz);
      if (tauE[c] === 0 && tauD[c] === 0) touched.push(c);
      const k = g / (d * d) / CELL_SR;
      tauE[c]! += k * evergreenM2;
      tauD[c]! += k * deciduousM2;
      return;
    }
    const el = Math.asin(Math.max(-1, Math.min(1, dz)));
    if (el + rho <= 0) return;
    // light passing through the ball meets this much leaf whatever the distance; what shrinks with distance is the sky it covers
    const through = g / (Math.PI * radiusM * radiusM);
    const cosRho = Math.cos(rho);
    const e0 = Math.max(0, Math.floor(Math.sin(Math.max(0, el - rho)) * SKY_EL));
    const e1 = Math.min(SKY_EL - 1, Math.floor(Math.sin(Math.min(Math.PI / 2, el + rho)) * SKY_EL));
    // every bearing where the ball reaches overhead; otherwise the bearings either side of its own
    const cosEl = Math.cos(el);
    const whole = el + rho >= Math.PI / 2 - 1e-6 || cosEl < 1e-6 || Math.sin(rho) >= cosEl;
    const a0 = Math.floor(((Math.atan2(dx, dy) + Math.PI) / TWO_PI) * SKY_AZ);
    const span = whole ? SKY_AZ / 2 : Math.min(SKY_AZ / 2, Math.ceil((Math.asin(Math.sin(rho) / cosEl) / TWO_PI) * SKY_AZ) + 1);
    const last = whole ? span - 1 : span;
    for (let e = e0; e <= e1; e++) {
      for (let k = -span; k <= last; k++) {
        const c = e * SKY_AZ + ((((a0 + k) % SKY_AZ) + SKY_AZ) % SKY_AZ);
        if (CELL_DIR[3 * c]! * dx + CELL_DIR[3 * c + 1]! * dy + CELL_DIR[3 * c + 2]! * dz < cosRho) continue;
        if (tauE[c] === 0 && tauD[c] === 0) touched.push(c);
        tauE[c]! += through * evergreenM2;
        tauD[c]! += through * deciduousM2;
      }
    }
  }

  /**
   * Light at a point through the year. `foliage` thins it; leaf belonging to
   * the plant numbered `exclude` is left out, because a plant's own leaves
   * are what catch its light, not what take it away.
   */
  light(i: number, foliage?: Foliage, exclude = -1): MonthlyLight {
    const mask = this.mask(i);
    const tree = this.treeMasks[i];
    const p = this.points[i]!.position;
    const tauE = this.tauE;
    const tauD = this.tauD;
    const touched: number[] = [];
    if (foliage) {
      for (const group of foliage.groups) {
        if (group.plant === exclude) continue;
        const qx = group.x - p.x;
        const qy = group.y - p.y;
        const qz = group.z - p.z;
        if (qx * qx + qy * qy + qz * qz > (GROUP_FAR * group.radiusM) ** 2) this.leaf(touched, qx, qy, qz, group.evergreenM2, group.deciduousM2, group.radiusM);
        else for (const cl of group.members) this.leaf(touched, cl.x - p.x, cl.y - p.y, cl.z - p.z, cl.evergreenM2, cl.deciduousM2, CLUMP_RADIUS_M);
      }
    }
    const out = foliage?.deciduousOut;
    const diffuse = LIGHT_MODEL.diffuseShare.value!;
    const tLeaf = TREE_CROWN_TRANSMISSION.inLeaf.value!;
    const tBare = TREE_CROWN_TRANSMISSION.bare.value!;
    const leafMonths = TREE_IN_LEAF_MONTHS.value!;

    // light from the whole sky, with deciduous leaf out and with it down, and (where there is such a tree) with the tree in leaf and bare
    const sky = (treeT: number, leafOut: number): number => {
      let open = this.openSky[i]! + treeT * this.openBehindTree[i]!;
      for (const c of touched) open -= (1 - mask[c]! / 255) * (tree?.[c] ? treeT : 1) * (1 - Math.exp(-(tauE[c]! + leafOut * tauD[c]!)));
      return open / CELLS;
    };
    const skies: (number | undefined)[] = [];
    const skyAt = (treeT: number, leafOut: 0 | 1): number => (skies[(treeT === tLeaf ? 2 : 0) + leafOut] ??= sky(treeT, leafOut));

    const hours: number[] = [];
    const share: number[] = [];
    for (let m = 0; m < 12; m++) {
      const leafOut = out ? out[m]! : 0;
      const treeT = tree && leafMonths.includes(m + 1) ? tLeaf : tBare;
      const cells = this.sunCell[m]!;
      const hrs = this.sunHours[m]!;
      const beam = this.sunBeam[m]!;
      let h = 0;
      let lit = 0;
      let all = 0;
      for (let k = 0; k < cells.length; k++) {
        const c = cells[k]!;
        let t = 1 - mask[c]! / 255;
        if (tree?.[c]) t *= treeT;
        if (touched.length) {
          const tau = tauE[c]! + leafOut * tauD[c]!;
          if (tau > 0) t *= Math.exp(-tau);
        }
        h += t * hrs[k]!;
        lit += t * beam[k]!;
        all += beam[k]!;
      }
      const direct = all > 0 ? lit / all : 0;
      const fromSky = touched.length && leafOut > 0 ? skyAt(treeT, 0) + leafOut * (skyAt(treeT, 1) - skyAt(treeT, 0)) : skyAt(treeT, 0);
      hours.push(h);
      share.push(all > 0 ? (1 - diffuse) * direct + diffuse * fromSky : fromSky);
    }
    for (const c of touched) {
      tauE[c] = 0;
      tauD[c] = 0;
    }
    return { hours, share };
  }

  /** Light on a set of points taken together, each weighted by the route it stands for (a lone station counts whole), or all alike where they were chosen evenly along a route. */
  lightOver(indices: readonly number[], foliage?: Foliage, exclude = -1, evenly = false): MonthlyLight {
    const hours = new Array<number>(12).fill(0);
    const share = new Array<number>(12).fill(0);
    let total = 0;
    for (const i of indices) {
      const w = evenly ? 1 : this.points[i]!.routeM || 1;
      const l = this.light(i, foliage, exclude);
      for (let m = 0; m < 12; m++) {
        hours[m]! += w * l.hours[m]!;
        share[m]! += w * l.share[m]!;
      }
      total += w;
    }
    if (total > 0) {
      for (let m = 0; m < 12; m++) {
        hours[m]! /= total;
        share[m]! /= total;
      }
    }
    return { hours, share };
  }

  /** Whether any declared tree is deciduous: its shade then changes with the season. */
  get seasonalShade(): boolean {
    return this.anyDeciduousTree;
  }
}

export interface ExposurePoint extends LightPoint, MonthlyLight {}

export interface ExposureField {
  site: Site;
  /** Hours between sunrise and sunset on the 15th of each month. */
  possibleHours: number[];
  points: ExposurePoint[];
}

/**
 * Light at every stretch of route and every root station of a Bower: for a
 * shade map, and for the light section of a design report.
 */
export function exposureField(bower: Bower, site: Site, foliage?: Foliage): ExposureField {
  const g = new LightGeometry(bower, site);
  return { site, possibleHours: [...g.possibleHours], points: g.points.map((p, i) => ({ ...p, ...g.light(i, foliage) })) };
}

/** Months, January = 0, that count as midsummer and midwinter at a latitude. */
export const midsummerMonth = (latitudeDeg: number): number => (latitudeDeg >= 0 ? 5 : 11);
export const midwinterMonth = (latitudeDeg: number): number => (latitudeDeg >= 0 ? 11 : 5);
