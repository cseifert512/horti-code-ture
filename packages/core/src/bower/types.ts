/**
 * Graph A: the manufactured architecture and its plant-contact system.
 * SIMULATION_KEY.md section 2, KEY.md sections 4 and 5.
 *
 * Two kinds of element are kept apart on purpose:
 *   StructuralMember  primary timber. Engineered, inspected, and NOT a
 *                     climbing substrate unless a project says otherwise.
 *   LocalSupport      secondary, replaceable elements that exist to be
 *                     climbed: cables, rods, mesh, textured panels, tie points.
 * Plants travel the SupportGraph, whose edges each lie on one of those
 * elements and inherit its contact permission.
 */
import type { Polyline } from '../math/polyline.ts';
import type { Vec3 } from '../math/vec3.ts';
import type { Sourced } from '../provenance.ts';
import type { ContactPermission, SupportKind } from '../vocab.ts';
import type { SupportGraph } from './support-graph.ts';

export type Section = { shape: 'rect'; widthMm: number; depthMm: number } | { shape: 'round'; diameterMm: number };

/**
 * Diameter of the round bar with the same perimeter: what a stem has to pass
 * round to encircle the section. A 100 x 180 mm rib is a 178 mm post to a twiner.
 */
export function equivalentDiameterMm(section: Section): number {
  return section.shape === 'round' ? section.diameterMm : (2 * (section.widthMm + section.depthMm)) / Math.PI;
}

export interface StructuralMember {
  id: string;
  /** Free label for the member family: rib, diagrid, eave, meridian, ring... */
  role: string;
  curve: Polyline;
  section: Section;
  material: string;
  contact: ContactPermission;
  /** Must stay reachable for inspection: growth across it has to be removable. */
  inspectable: boolean;
}

export type SurfaceTexture = 'smooth' | 'textured';

export interface LocalSupport {
  id: string;
  kind: SupportKind;
  curve: Polyline;
  /** Cross-section diameter for linear supports; nominal element size for mesh and panels. */
  diameterMm: number;
  surface: SurfaceTexture;
  contact: ContactPermission;
  /** Can be taken down and renewed without touching the primary structure. */
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
  /** Geometry from `from` to `to`. Its length is the route length, never the height gained. */
  curve: Polyline;
  /** The manufactured element this stretch of route lies on. */
  host: { type: 'support' | 'member'; id: string };
  kind: SupportKind | 'timber';
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

export const ZONE_KIND = ['structural_exclusion', 'inspection_access', 'headroom', 'hanging_flower_clearance', 'keep_timber_visible', 'viewpoint'] as const;
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
