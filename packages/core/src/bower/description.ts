/**
 * A Bower as a designer hands it over: the centre lines of the timber, the
 * lines of the cables, and where the plants go in. DEVELOPMENT_GUIDE.md
 * stage 5, "Input Bower shell".
 *
 * The file says what is built. What a plant can do with it is worked out
 * here: elements that touch are joined, each is cut into stretches between
 * its joints, and those stretches are the routes plants travel. Nothing in the
 * file names a node or a route, so it can be written straight out of a CAD
 * model.
 *
 * Two elements are joined where their bodies touch: where their centre lines
 * pass within half the larger dimension of each section, plus a slack
 * (`joinToleranceM`). A cable fixed to the face of a rib is therefore joined
 * to it although its line stands half a rib's depth away from the rib's.
 *
 * A stem tied along an imported member lies on its upper face, and a twining
 * stem winds round its centre line. The reference shells place their routes
 * on the outer face instead, so a shell written out and read back keeps its
 * routes and loses a few centimetres of that offset.
 */
import { z } from 'zod';
import { type Site, describeSite, siteFrom, siteSchema } from '../light/site.ts';
import { Polyline } from '../math/polyline.ts';
import { type Vec3, distance, v3 } from '../math/vec3.ts';
import { unknown } from '../provenance.ts';
import type { Viewpoint } from '../sim/view.ts';
import { CONTACT_PERMISSION, MEMBER_TIER } from '../vocab.ts';
import { SupportGraph } from './support-graph.ts';
import { type Bower, type LocalSupport, type RootStation, type Section, type StructuralMember, type Zone, ZONE_KIND, equivalentDiameterMm, materialSummary, zoneContains } from './types.ts';

/** Stated in every file, so that one cannot be read in the wrong frame or the wrong unit by accident. */
export const BOWER_FRAME = 'x east, y north, z up, metres';

const triple = z.tuple([z.number(), z.number(), z.number()]);
const sectionSchema = z.discriminatedUnion('shape', [
  z.strictObject({ shape: z.literal('rect'), widthMm: z.number().positive(), depthMm: z.number().positive() }),
  z.strictObject({ shape: z.literal('round'), diameterMm: z.number().positive() }),
]);

export const bowerDescriptionSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  name: z.string().min(1),
  frame: z.literal(BOWER_FRAME),
  /** Slack added to the touching distance of two elements, in metres. Default 0.02. */
  joinToleranceM: z.number().positive().max(0.5).optional(),
  /** Timber. `primary` is the glulam structure; `sub_lattice` the lighter timber between. */
  members: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        tier: z.enum(MEMBER_TIER),
        /** Free label for the member family: rib, ring, purlin, lath... */
        role: z.string().min(1),
        section: sectionSchema,
        material: z.string().min(1).optional(),
        /** Whether aerial roots can cling to the finish. Default `textured`. */
        surface: z.enum(['smooth', 'textured']).optional(),
        /** Default `permitted`: nothing is off-limits unless the project says so. */
        contact: z.enum(CONTACT_PERMISSION).optional(),
        inspectable: z.boolean().optional(),
        /** The centre line of the section, as points in order. */
        points: z.array(triple).min(2),
      }),
    )
    .min(1),
  /** Steel: slender cables only. */
  cables: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        diameterMm: z.number().positive(),
        material: z.string().min(1).optional(),
        contact: z.enum(CONTACT_PERMISSION).optional(),
        points: z.array(triple).min(2),
      }),
    )
    .optional(),
  /** Where plants go into the ground. Each is led on to the nearest joint or member end. */
  stations: z.array(z.strictObject({ id: z.string().min(1), position: triple, note: z.string().min(1).optional() })).min(1),
  zones: z.array(z.strictObject({ id: z.string().min(1), kind: z.enum(ZONE_KIND), min: triple, max: triple, note: z.string().min(1).optional() })).optional(),
  /** Where a visitor stands, for the coverage figures of the design report. */
  viewpoints: z.array(z.strictObject({ id: z.string().min(1), label: z.string().min(1), eye: triple, target: triple, fovDeg: z.number().positive().max(170) })).optional(),
  /**
   * Where the Bower stands: its latitude and longitude, which way the drawing's
   * y axis points on the ground, and what stands near enough to shade it (walls,
   * buildings, trees). Left out, southern England and an open site are assumed.
   */
  site: siteSchema.optional(),
});
export type BowerDescription = z.infer<typeof bowerDescriptionSchema>;

export interface ReadBower {
  bower: Bower;
  viewpoints: Viewpoint[];
  /** The place the description declares, or the assumed baseline where it declares none. Also on `bower.site` when declared. */
  site: Site;
  /** Things a designer should look at: they do not stop a run. */
  warnings: string[];
}

/** How far a plant can be led from where it is rooted to the first thing it can climb, in metres. */
const STATION_REACH_M = 1.5;

interface Element {
  id: string;
  kind: 'timber' | 'cable';
  curve: Polyline;
  section: Section;
  /** Half the larger dimension of the section, in metres: how far its body reaches from its centre line. */
  reachM: number;
  surface: 'smooth' | 'textured';
  contact: (typeof CONTACT_PERMISSION)[number];
}

/** A place on an element where it meets another, or ends. */
interface Hit {
  element: number;
  s: number;
  p: Vec3;
}

const vec = (t: readonly [number, number, number]): Vec3 => v3(t[0], t[1], t[2]);
const halfReach = (s: Section): number => (s.shape === 'round' ? s.diameterMm : Math.max(s.widthMm, s.depthMm)) / 2000;

/** Closest points of two segments: distance, and how far along each (0 to 1). */
function closest(p1: Vec3, q1: Vec3, p2: Vec3, q2: Vec3): { d: number; s: number; t: number } {
  const d1x = q1.x - p1.x;
  const d1y = q1.y - p1.y;
  const d1z = q1.z - p1.z;
  const d2x = q2.x - p2.x;
  const d2y = q2.y - p2.y;
  const d2z = q2.z - p2.z;
  const rx = p1.x - p2.x;
  const ry = p1.y - p2.y;
  const rz = p1.z - p2.z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  let s = 0;
  let t = 0;
  if (a > 1e-18 && e > 1e-18) {
    const b = d1x * d2x + d1y * d2y + d1z * d2z;
    const c = d1x * rx + d1y * ry + d1z * rz;
    const denom = a * e - b * b;
    s = denom > 1e-18 ? Math.min(1, Math.max(0, (b * f - c * e) / denom)) : 0;
    t = (b * s + f) / e;
    if (t < 0) {
      t = 0;
      s = Math.min(1, Math.max(0, -c / a));
    } else if (t > 1) {
      t = 1;
      s = Math.min(1, Math.max(0, (b - c) / a));
    }
  } else if (a > 1e-18) {
    s = Math.min(1, Math.max(0, -(d1x * rx + d1y * ry + d1z * rz) / a));
  } else if (e > 1e-18) {
    t = Math.min(1, Math.max(0, f / e));
  }
  const x = rx + d1x * s - d2x * t;
  const y = ry + d1y * s - d2y * t;
  const z = rz + d1z * s - d2z * t;
  return { d: Math.hypot(x, y, z), s, t };
}

interface Box {
  min: Vec3;
  max: Vec3;
}
const boxOf = (points: readonly Vec3[]): Box => {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const p of points) {
    lo[0] = Math.min(lo[0]!, p.x);
    lo[1] = Math.min(lo[1]!, p.y);
    lo[2] = Math.min(lo[2]!, p.z);
    hi[0] = Math.max(hi[0]!, p.x);
    hi[1] = Math.max(hi[1]!, p.y);
    hi[2] = Math.max(hi[2]!, p.z);
  }
  return { min: v3(lo[0]!, lo[1]!, lo[2]!), max: v3(hi[0]!, hi[1]!, hi[2]!) };
};
const apart = (a: Box, b: Box, gap: number): boolean =>
  a.min.x - gap > b.max.x || b.min.x - gap > a.max.x || a.min.y - gap > b.max.y || b.min.y - gap > a.max.y || a.min.z - gap > b.max.z || b.min.z - gap > a.max.z;

/**
 * The stretch of a polyline between two distances along it, with its ends
 * moved on to the given points. Where an end has moved sideways, the points
 * nearest it are left out, so that the stretch runs in to the joint at a
 * slant and not round a corner.
 */
function between(curve: Polyline, s0: number, s1: number, from: Vec3, to: Vec3): Polyline {
  const pts: Vec3[] = [from];
  const c = curve.cumulative;
  const clear0 = Math.max(1e-3, 3 * distance(from, curve.pointAt(s0)));
  const clear1 = Math.max(1e-3, 3 * distance(to, curve.pointAt(s1)));
  for (let i = 0; i < curve.points.length; i++) {
    if (c[i]! > s0 + clear0 && c[i]! < s1 - clear1) pts.push(curve.points[i]!);
  }
  pts.push(to);
  return new Polyline(pts);
}

/**
 * Read a Bower description. Throws, naming `source`, where the description
 * cannot be a Bower; returns warnings where it can but something looks wrong.
 */
export function readBower(input: unknown, source = 'bower description'): ReadBower {
  const parsed = bowerDescriptionSchema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
    throw new Error(`${source} is not a valid Bower description:\n${issues}`);
  }
  const d = parsed.data;
  const slack = d.joinToleranceM ?? 0.02;
  const warnings: string[] = [];
  const fail = (why: string): never => {
    throw new Error(`${source}: ${why}`);
  };

  const ids = new Set<string>();
  const once = (id: string, what: string) => {
    if (ids.has(id)) fail(`the id "${id}" is used twice (${what})`);
    ids.add(id);
  };

  // ---- what is built --------------------------------------------------------------
  const members: StructuralMember[] = d.members.map((m) => {
    once(m.id, 'member');
    return { id: m.id, tier: m.tier, role: m.role, curve: new Polyline(m.points.map(vec)), section: m.section, material: m.material ?? 'glulam', surface: m.surface ?? 'textured', contact: m.contact ?? 'permitted', inspectable: m.inspectable ?? true };
  });
  const cables = (d.cables ?? []).map((c) => {
    once(c.id, 'cable');
    return { id: c.id, curve: new Polyline(c.points.map(vec)), diameterMm: c.diameterMm, material: c.material ?? 'stainless steel', contact: c.contact ?? 'permitted' };
  });
  const elements: Element[] = [
    ...members.map((m): Element => ({ id: m.id, kind: 'timber', curve: m.curve, section: m.section, reachM: halfReach(m.section), surface: m.surface, contact: m.contact })),
    ...cables.map((c): Element => ({ id: c.id, kind: 'cable', curve: c.curve, section: { shape: 'round', diameterMm: c.diameterMm }, reachM: c.diameterMm / 2000, surface: 'smooth', contact: c.contact })),
  ];
  for (const e of elements) if (e.curve.length < 1e-3) fail(`"${e.id}" has no length`);

  // a model drawn in millimetres, or a detail drawn as a building, is the commonest mistake
  const all = boxOf(elements.flatMap((e) => e.curve.points));
  const span = Math.max(all.max.x - all.min.x, all.max.y - all.min.y, all.max.z - all.min.z);
  if (span > 500) fail(`the structure is ${span.toFixed(0)} m across: lengths must be in metres (this looks like millimetres)`);
  if (span < 0.5) fail(`the structure is ${span.toFixed(3)} m across: lengths must be in metres`);

  // ---- where elements touch -------------------------------------------------------
  const hits: Hit[] = [];
  const parent: number[] = [];
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };
  const hit = (element: number, s: number): number => {
    hits.push({ element, s, p: elements[element]!.curve.pointAt(s) });
    parent.push(hits.length - 1);
    return hits.length - 1;
  };

  const boxes = elements.map((e) => boxOf(e.curve.points));
  const segBoxes = elements.map((e) => e.curve.points.slice(1).map((p, i) => boxOf([e.curve.points[i]!, p])));
  const mounted = new Map<number, Set<number>>();
  for (let i = 0; i < elements.length; i++) {
    const A = elements[i]!;
    // both ends of every element are places a route can end
    const start = hit(i, 0);
    const end = hit(i, A.curve.length);
    if (distance(A.curve.start, A.curve.end) <= A.reachM + slack) union(start, end);
    for (let j = i + 1; j < elements.length; j++) {
      const B = elements[j]!;
      const reach = A.reachM + B.reachM + slack;
      if (apart(boxes[i]!, boxes[j]!, reach)) continue;
      const found: { d: number; sa: number; sb: number }[] = [];
      for (let a = 0; a + 1 < A.curve.points.length; a++) {
        if (apart(segBoxes[i]![a]!, boxes[j]!, reach)) continue;
        for (let b = 0; b + 1 < B.curve.points.length; b++) {
          if (apart(segBoxes[i]![a]!, segBoxes[j]![b]!, reach)) continue;
          const c = closest(A.curve.points[a]!, A.curve.points[a + 1]!, B.curve.points[b]!, B.curve.points[b + 1]!);
          if (c.d > reach) continue;
          found.push({
            d: c.d,
            sa: A.curve.cumulative[a]! + c.s * (A.curve.cumulative[a + 1]! - A.curve.cumulative[a]!),
            sb: B.curve.cumulative[b]! + c.t * (B.curve.cumulative[b + 1]! - B.curve.cumulative[b]!),
          });
        }
      }
      // every nearby pair of segments reports the same joint: keep the closest approach of each
      found.sort((x, y) => x.d - y.d);
      const kept: typeof found = [];
      const sep = Math.max(0.25, 3 * reach);
      for (const f of found) {
        if (kept.some((k) => Math.abs(k.sa - f.sa) < sep && Math.abs(k.sb - f.sb) < sep)) continue;
        kept.push(f);
        union(hit(i, f.sa), hit(j, f.sb));
        if (!mounted.has(i)) mounted.set(i, new Set());
        if (!mounted.has(j)) mounted.set(j, new Set());
        mounted.get(i)!.add(j);
        mounted.get(j)!.add(i);
      }
    }
  }

  // several elements meeting at one joint leave hits a little apart along each: they are one place
  const byElement = elements.map(() => [] as number[]);
  hits.forEach((h, k) => byElement[h.element]!.push(k));
  for (let i = 0; i < elements.length; i++) {
    const list = byElement[i]!.sort((a, b) => hits[a]!.s - hits[b]!.s);
    const near = Math.max(0.12, 1.5 * (elements[i]!.reachM + slack));
    for (let k = 1; k < list.length; k++) if (hits[list[k]!]!.s - hits[list[k - 1]!]!.s < near) union(list[k]!, list[k - 1]!);
  }

  // ---- joints become nodes, and each element is cut at its joints -------------------
  const graph = new SupportGraph();
  const groups = new Map<number, number[]>();
  hits.forEach((_, k) => {
    const root = find(k);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(k);
  });
  const nodeOf = new Map<number, string>();
  let n = 0;
  for (const [root, group] of groups) {
    // a joint sits on its stoutest member: lighter elements come to it, and its own routes keep their true length
    const stoutest = Math.max(...group.map((k) => elements[hits[k]!.element]!.reachM));
    const on = group.filter((k) => elements[hits[k]!.element]!.reachM >= stoutest - 1e-9);
    const at = on.reduce((sum, k) => v3(sum.x + hits[k]!.p.x / on.length, sum.y + hits[k]!.p.y / on.length, sum.z + hits[k]!.p.z / on.length), v3(0, 0, 0));
    const id = `j${n++}`;
    nodeOf.set(root, id);
    graph.addNode({ id, position: at });
  }

  const zones: Zone[] = (d.zones ?? []).map((z) => {
    once(z.id, 'zone');
    return { id: z.id, kind: z.kind, min: vec(z.min), max: vec(z.max), ...(z.note ? { note: z.note } : {}) };
  });
  for (let i = 0; i < elements.length; i++) {
    const E = elements[i]!;
    const stops: { s: number; node: string }[] = [];
    for (const k of byElement[i]!) {
      const node = nodeOf.get(find(k))!;
      if (stops.length && stops[stops.length - 1]!.node === node) continue;
      stops.push({ s: hits[k]!.s, node });
    }
    let made = 0;
    for (let k = 0; k + 1 < stops.length; k++) {
      const a = stops[k]!;
      const b = stops[k + 1]!;
      const curve = between(E.curve, a.s, b.s, graph.nodes.get(a.node)!.position, graph.nodes.get(b.node)!.position);
      graph.addEdge({
        id: `${E.id}:${made++}`,
        from: a.node,
        to: b.node,
        curve,
        axis: curve,
        section: E.section,
        host: { type: E.kind === 'timber' ? 'member' : 'support', id: E.kind === 'timber' ? E.id : `cable.${E.id}` },
        kind: E.kind,
        gripDiameterMm: equivalentDiameterMm(E.section),
        surface: E.surface,
        contact: E.contact,
        zones: zones.filter((z) => curve.points.some((p) => zoneContains(z, p))).map((z) => z.id),
      });
    }
    if (!made) warnings.push(`"${E.id}" gives plants no route: it closes on itself and joins nothing else`);
  }

  const supports: LocalSupport[] = cables.map((c, k) => {
    const index = members.length + k;
    const on = [...(mounted.get(index) ?? [])].filter((j) => j < members.length).map((j) => members[j]!.id);
    if (!on.length) warnings.push(`cable "${c.id}" touches no timber member: check that it is fixed to something`);
    return { id: `cable.${c.id}`, kind: 'cable', curve: c.curve, diameterMm: c.diameterMm, material: c.material, surface: 'smooth', contact: c.contact, replaceable: true, mountedOn: on };
  });

  // ---- where the plants go in -----------------------------------------------------
  const rootStations: RootStation[] = d.stations.map((s) => {
    once(s.id, 'station');
    const position = vec(s.position);
    let best = '';
    let bestD = Infinity;
    for (const node of graph.nodes.values()) {
      const dist = distance(node.position, position);
      if (dist < bestD) {
        bestD = dist;
        best = node.id;
      }
    }
    if (bestD > STATION_REACH_M) fail(`station "${s.id}" has nothing to climb within ${STATION_REACH_M} m: the nearest joint or member end is ${bestD.toFixed(2)} m away`);
    return { id: s.id, position, entryNodeIds: [best], soilVolumeM3: unknown('m3'), irrigated: unknown(), ...(s.note ? { note: s.note } : {}) };
  });

  // ---- what a designer should look at ----------------------------------------------
  const reached = graph.reach(rootStations.flatMap((s) => s.entryNodeIds));
  let outOfReachM = 0;
  const stranded = new Set<string>();
  for (const e of graph.edges.values()) {
    if (reached.has(e.from) || reached.has(e.to)) continue;
    outOfReachM += e.curve.length;
    stranded.add(e.host.id);
  }
  if (outOfReachM > 0) {
    const names = [...stranded].slice(0, 5).join(', ');
    warnings.push(`${outOfReachM.toFixed(1)} m of route cannot be reached from any root station, on ${stranded.size} element${stranded.size === 1 ? '' : 's'} (${names}${stranded.size > 5 ? ', ...' : ''}): they join nothing a plant can arrive by`);
  }

  const viewpoints: Viewpoint[] = (d.viewpoints ?? []).map((v) => ({ id: v.id, label: v.label, eye: vec(v.eye), target: vec(v.target), fovDeg: v.fovDeg }));
  const site = siteFrom(d.site, source);
  for (const o of site.obstructions) once(o.id, 'obstruction');
  if (d.site && site.assumed) warnings.push('the site section gives no latitude and longitude: southern England is assumed for the sun');
  const bower: Bower = { id: d.id, name: d.name, members, supports, graph, rootStations, zones, facts: {}, ...(d.site ? { site } : {}) };
  const mat = materialSummary(bower);
  let top = 0;
  for (const node of graph.nodes.values()) top = Math.max(top, node.position.z);
  return {
    bower: {
      ...bower,
      facts: {
        source,
        members: members.length,
        cables: cables.length,
        joints: graph.nodes.size,
        routeM: Number(graph.totalLength.toFixed(1)),
        highestRouteM: Number(top.toFixed(2)),
        steelCableM: Number(mat.steelCableM.toFixed(1)),
        steelShareOfRoute: Number(mat.steelShareOfRoute.toFixed(3)),
        thickestCableMm: cables.reduce((m, c) => Math.max(m, c.diameterMm), 0),
        routeOutOfReachM: Number(outOfReachM.toFixed(1)),
      },
    },
    viewpoints,
    site,
    warnings,
  };
}

const round = (x: number): number => Math.round(x * 1e4) / 1e4 + 0;
const point = (p: Vec3): [number, number, number] => [round(p.x), round(p.y), round(p.z)];

/** Write a Bower out as a description: what is built, without the routes worked out from it. */
export function describeBower(bower: Bower, viewpoints: readonly Viewpoint[] = []): BowerDescription {
  return {
    schemaVersion: 1,
    id: bower.id,
    name: bower.name,
    frame: BOWER_FRAME,
    members: bower.members.map((m) => ({ id: m.id, tier: m.tier, role: m.role, section: m.section, material: m.material, surface: m.surface, contact: m.contact, inspectable: m.inspectable, points: m.curve.points.map(point) })),
    cables: bower.supports.filter((s) => s.kind === 'cable').map((s) => ({ id: s.id.replace(/^cable\./, ''), diameterMm: s.diameterMm, material: s.material, contact: s.contact, points: s.curve.points.map(point) })),
    stations: bower.rootStations.map((s) => ({ id: s.id, position: point(s.position), ...(s.note ? { note: s.note } : {}) })),
    zones: bower.zones.map((z) => ({ id: z.id, kind: z.kind, min: point(z.min), max: point(z.max), ...(z.note ? { note: z.note } : {}) })),
    viewpoints: viewpoints.map((v) => ({ id: v.id, label: v.label, eye: point(v.eye), target: point(v.target), fovDeg: v.fovDeg })),
    ...(bower.site && describeSite(bower.site) ? { site: describeSite(bower.site) } : {}),
  };
}
