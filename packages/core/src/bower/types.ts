/**
 * Graph A: the manufactured architecture, which is also the growing surface.
 * SIMULATION_KEY.md section 2, KEY.md sections 4 and 5.
 *
 * A Bower is curved glulam, and plants are meant to grow on it: twining round
 * members, lying along them where a gardener ties them in, clinging to them.
 *   StructuralMember  timber, in two tiers: the primary glulam beams, and the
 *                     lighter sub-lattice members and laths between them.
 *   LocalSupport      the steel of the sub-lattice: slender cables where
 *                     timber cannot give a plant a hold, and tie points.
 *                     Visible steel is a cost to be kept small and reported.
 * Plants travel the SupportGraph. Each of its edges lies on one member or one
 * cable and can be used by any plant whose attachment mechanism can hold it.
 * Nothing is off-limits unless a project declares an exclusion.
 */
import type { Polyline } from '../math/polyline.ts';
import type { Vec3 } from '../math/vec3.ts';
import type { Sourced } from '../provenance.ts';
import type { ContactPermission, MemberTier, RouteMaterial, SupportKind } from '../vocab.ts';
import type { SupportGraph } from './support-graph.ts';

export type Section = { shape: 'rect'; widthMm: number; depthMm: number } | { shape: 'round'; diameterMm: number };

/**
 * Diameter of the round bar with the same perimeter: what a stem has to pass
 * round to encircle the section. A 100 x 180 mm rib is a 178 mm post to a twiner.
 */
export function equivalentDiameterMm(section: Section): number {
  return section.shape === 'round' ? section.diameterMm : (2 * (section.widthMm + section.depthMm)) / Math.PI;
}

export type SurfaceTexture = 'smooth' | 'textured';

export interface StructuralMember {
  id: string;
  tier: MemberTier;
  /** Free label for the member family: rib, diagrid, eave, meridian, ring... */
  role: string;
  /** Centre line of the section. */
  curve: Polyline;
  section: Section;
  material: string;
  surface: SurfaceTexture;
  contact: ContactPermission;
  /** Must stay reachable for inspection: growth across it has to be removable. */
  inspectable: boolean;
}

export interface LocalSupport {
  id: string;
  kind: SupportKind;
  curve: Polyline;
  diameterMm: number;
  material: string;
  surface: SurfaceTexture;
  contact: ContactPermission;
  /** Can be taken down and renewed without touching the timber. */
  replaceable: boolean;
  /** Members it is fixed to. */
  mountedOn: readonly string[];
}

export interface SupportNode {
  id: string;
  position: Vec3;
}

export interface SupportEdge {
  id: string;
  from: string;
  to: string;
  /** The line a stem follows from `from` to `to`. Its length is the route length, never the height gained. */
  curve: Polyline;
  /** The manufactured element this stretch of route lies on. */
  host: { type: 'member' | 'support'; id: string };
  kind: RouteMaterial;
  /** Equivalent round diameter a plant has to grasp or pass round. */
  gripDiameterMm: number;
  surface: SurfaceTexture;
  contact: ContactPermission;
  /** Zones this edge passes through. */
  zones: readonly string[];
}

export interface RootStation {
  id: string;
  position: Vec3;
  /** Support-graph nodes a plant rooted here can be led to from the ground. */
  entryNodeIds: readonly string[];
  soilVolumeM3: Sourced<number>;
  irrigated: Sourced<boolean>;
  note?: string;
}

export const ZONE_KIND = ['declared_exclusion', 'inspection_access', 'headroom', 'hanging_flower_clearance', 'keep_timber_visible', 'viewpoint'] as const;
export type ZoneKind = (typeof ZONE_KIND)[number];

export interface Zone {
  id: string;
  kind: ZoneKind;
  /** Axis-aligned box in the world frame. */
  min: Vec3;
  max: Vec3;
  note?: string;
}

export interface Bower {
  id: string;
  name: string;
  members: readonly StructuralMember[];
  supports: readonly LocalSupport[];
  graph: SupportGraph;
  rootStations: readonly RootStation[];
  zones: readonly Zone[];
  /** Geometry facts worth reporting alongside any run. */
  facts: Readonly<Record<string, number | string>>;
}

export function zoneContains(zone: Zone, p: Vec3): boolean {
  return p.x >= zone.min.x && p.x <= zone.max.x && p.y >= zone.min.y && p.y <= zone.max.y && p.z >= zone.min.z && p.z <= zone.max.z;
}

export interface MaterialSummary {
  /** Length of primary glulam, in metres. */
  primaryTimberM: number;
  /** Length of lighter timber lattice and laths. */
  subLatticeTimberM: number;
  /** Length of steel cable: the visible steel a design is trying to keep small. */
  steelCableM: number;
  /** Plant route lying on timber and on cable. */
  routeOnTimberM: number;
  routeOnCableM: number;
  /** Share of all plant route that is steel, 0 to 1. */
  steelShareOfRoute: number;
}

/** How much of a Bower is timber and how much is visible steel. */
export function materialSummary(bower: Bower): MaterialSummary {
  let primaryTimberM = 0;
  let subLatticeTimberM = 0;
  for (const m of bower.members) {
    if (m.tier === 'primary') primaryTimberM += m.curve.length;
    else subLatticeTimberM += m.curve.length;
  }
  let steelCableM = 0;
  for (const s of bower.supports) if (s.kind === 'cable') steelCableM += s.curve.length;
  let routeOnTimberM = 0;
  let routeOnCableM = 0;
  for (const e of bower.graph.edges.values()) {
    if (e.kind === 'timber') routeOnTimberM += e.curve.length;
    else if (e.kind === 'cable') routeOnCableM += e.curve.length;
  }
  const total = routeOnTimberM + routeOnCableM;
  return { primaryTimberM, subLatticeTimberM, steelCableM, routeOnTimberM, routeOnCableM, steelShareOfRoute: total > 0 ? routeOnCableM / total : 0 };
}
